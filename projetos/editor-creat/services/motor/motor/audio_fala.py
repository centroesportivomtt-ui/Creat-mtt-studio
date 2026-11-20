"""Medidas de FALA no áudio da fonte: onde a fala realmente começa e acaba, e trechos de voz que não são do falante.

Por que existe (revisão do dono, Super Kal 19/11): o corte de cada fala saía no fim de palavra do Whisper, que marca o fim de
0,1 a 0,5 s ANTES de a voz acabar ("comum" virou "com", "tradicional" virou "tradição"), e vozes da equipe dirigindo a gravação
entravam na peça. Estas funções são a régua comum de quem corta (`ferramentas/ajustar_cortes.py`) e de quem confere (QA
`fala_cortada` e `voz_externa`). Tudo em numpy/scipy, sem modelo.

Convenções: tempos em segundos da FONTE; envelope em dB na banda da fala (200-7500 Hz, para o "s" contar), passo de 10 ms.
"""
from __future__ import annotations

import numpy as np

PASSO = 0.01


def envelope(x: np.ndarray, sr: int) -> dict:
    """Envelope da banda da fala e o limiar que separa fala de ambiente (entre o piso e o nível alto do arquivo).
    Traz também o envelope do CHIADO (3,5-7,5 kHz), onde mora o "s" final ("calorias", "horas"): a vogal acaba e o "s"
    segue por 100 a 200 ms quase sem energia abaixo de 3 kHz."""
    from scipy.signal import butter, sosfilt
    x = x.mean(1) if x.ndim > 1 else x
    h = max(1, int(sr * PASSO))
    n = len(x) // h

    def banda(lo, hi):
        y = sosfilt(butter(2, [lo, min(hi, sr / 2 - 100)], "bp", fs=sr, output="sos"), x)
        return 20 * np.log10(np.sqrt(np.mean(y[:n * h].reshape(n, h) ** 2, 1)) + 1e-9) if n else np.zeros(0)
    e = banda(200, 7500)                                   # até 7,5 kHz: o "s" final conta
    piso = float(np.percentile(e, 15)) if n else -90.0
    alto = float(np.percentile(e, 90)) if n else -90.0
    out = {"db": e, "piso": piso, "alto": alto, "limiar": piso + 0.45 * (alto - piso)}
    if sr >= 16000 and n:
        hf = banda(3500, 7500)                              # mesma banda em 16 kHz (QA) e 48 kHz (ajuste): a decisão tem de bater
        out["db_hf"] = hf
        out["limiar_hf"] = float(np.percentile(hf, 15)) + 9.0
    return out


def _chiado_ate(env: dict, fim: float, alcance: float = 0.22) -> float:
    """Se há chiado ("s") colado no fim da fala, devolve onde ele acaba (senão, o próprio `fim`)."""
    hf, lim = env.get("db_hf"), env.get("limiar_hf")
    if hf is None:
        return fim
    q = int(round(fim / PASSO))
    ini = None
    for r in range(max(0, q - 4), min(len(hf), q + 4)):   # chiado COLADO na voz (de 40 ms antes a 30 ms depois do fim dela):
        # mais longe que isso já é o "s" da palavra seguinte ("laranja | as calorias")
        if hf[r] > lim:
            ini = r
            break
    if ini is None:
        return fim
    r = ini
    teto = min(len(hf) - 3, q + int(round(alcance / PASSO)))
    while r < teto and not np.all(hf[r:r + 3] <= lim):
        r += 1
    return max(fim, r * PASSO)


def _pico(e: np.ndarray, a: float, b: float) -> float:
    i, j = max(0, int(round(a / PASSO))), min(len(e), int(round(b / PASSO)))
    return float(np.max(e[i:j])) if j > i else -120.0


def fim_da_fala(env: dict, s1: float, janela: float = 1.5, silencio: float = 0.08) -> dict:
    """Onde a fala que está soando em `s1` realmente acaba.

    A oclusão de "t", "p", "k" dura até ~100 ms ("Ul-tra", "téc-nico") e não é fim de palavra: por isso a fala também conta
    como ATIVA quando o corte cai num silêncio curto e a voz RETOMA em até 120 ms. `silencio` fica em 80 ms: medido no
    material do Super Kal, 140 ms engolia a palavra seguinte de quem emenda frases ("maravilhosas | que eu tenho...").

    Devolve {"ativa": fala soando nos 60 ms antes de s1 OU retomando logo depois, "soando", "retoma", "fim": tempo em que a
    fala cai abaixo do limiar por >= `silencio` (None se não cai dentro da `janela`), "pausa": duração do silêncio depois do
    fim, "vale": ponto mais baixo do envelope em [s1, s1+0,3] (onde cortar quando não há pausa)}."""
    e, lim = env["db"], env["limiar"]
    k = int(round(silencio / PASSO))
    j = int(round(s1 / PASSO))
    soando = _pico(e, s1 - 0.06, s1) > lim
    retoma = _pico(e, s1, s1 + 0.12) > lim
    ativa = soando or retoma
    fim = None
    if not ativa:
        fim = j * PASSO                      # a fala já tinha terminado antes do corte
    else:
        q0 = j
        if retoma and not soando:           # corte dentro de um silêncio curto: o fim é o da voz que VOLTA, não o do silêncio
            while q0 < len(e) and e[q0] <= lim:
                q0 += 1
        for q in range(q0, min(len(e) - k, j + int(round(janela / PASSO)))):
            if np.all(e[q:q + k] < lim):
                fim = q * PASSO
                break
    pausa = 0.0
    if fim is not None:
        fim = _chiado_ate(env, fim)                    # o "s" final faz parte da palavra
        q = int(round(fim / PASSO))
        r = q
        while r < len(e) and r - q < 150 and e[r] < lim:
            r += 1
        pausa = (r - q) * PASSO
    a, b = j, min(len(e), j + int(round(0.30 / PASSO)))
    vale = (a + int(np.argmin(e[a:b]))) * PASSO if b > a else s1
    return {"ativa": bool(ativa), "soando": bool(soando), "retoma": bool(retoma), "fim": fim, "pausa": round(pausa, 2), "vale": round(vale, 2)}


def inicio_da_fala(env: dict, s0: float, janela: float = 0.6, silencio: float = 0.06) -> dict:
    """Onde começa a fala que entra em `s0`. Procura para trás o silêncio mais próximo (a palavra pode ter começado antes do
    corte) e, se não houver, o vale mais próximo (palavra anterior colada).

    Devolve {"som_antes": há som nos 100 ms antes de s0, "inicio": começo da fala depois do silêncio mais próximo (None se
    não há silêncio na janela), "silencio": duração desse silêncio, "vale": ponto mais baixo em [s0-0,15, s0+0,05]}."""
    e, lim = env["db"], env["limiar"]
    k = int(round(silencio / PASSO))
    j = int(round(s0 / PASSO))
    som_antes = _pico(e, s0 - 0.10, s0) > lim
    inicio, sil = None, 0.0
    for q in range(min(len(e) - k, j + int(round(0.05 / PASSO))), max(0, j - int(round(janela / PASSO))), -1):
        if q - k >= 0 and np.all(e[q - k:q] < lim):
            inicio = q * PASSO
            r = q
            while r > 0 and q - r < 150 and e[r - 1] < lim:
                r -= 1
            sil = (q - r) * PASSO
            break
    a, b = max(0, j - int(round(0.15 / PASSO))), min(len(e), j + int(round(0.05 / PASSO)))
    vale = (a + int(np.argmin(e[a:b]))) * PASSO if b > a else s0
    return {"som_antes": bool(som_antes), "inicio": inicio, "silencio": round(sil, 2), "vale": round(vale, 2)}


def corte_final_ok(env: dict, s1: float, folga: float = 0.04) -> tuple[bool, str]:
    """O corte em `s1` deixa a frase terminar? Reprova quando a fala continua depois do corte (sílaba partida, ou corte numa
    oclusão com a voz retomando em até 120 ms) e quando a fala acaba exatamente em cima do corte, sem respiro."""
    f = fim_da_fala(env, s1)
    if f["fim"] is not None and f["fim"] > s1 + 0.03 and not f["retoma"] and not f["soando"]:
        return False, f"o chiado do fim da palavra (\"s\") continua depois do corte em {s1:.2f} s, até {f['fim']:.2f} s"
    if not f["ativa"]:
        return True, "fala já tinha terminado"
    if f["retoma"]:
        ate = f"até {f['fim']:.2f} s" if f["fim"] is not None else "sem pausa (palavra seguinte colada)"
        return False, f"a fala continua depois do corte em {s1:.2f} s, {ate}"
    if _pico(env["db"], s1 - folga, s1) > env["limiar"]:
        return False, f"fala termina em cima do corte ({s1:.2f} s), sem respiro"
    return True, "fala terminou com respiro"


def corte_inicial_ok(env: dict, s0: float) -> tuple[bool, str]:
    """O corte em `s0` pega a fala desde o começo? Reprova quando há som de fala colado antes E depois do corte, e (20/11)
    quando a primeira fala da peça começa a menos de 150 ms do fim de outra fala da fonte (`comeco_colado`)."""
    e, lim = env["db"], env["limiar"]
    if _pico(e, s0 - 0.06, s0) > lim and _pico(e, s0, s0 + 0.04) > lim:
        return False, f"corte em {s0:.2f} s cai no meio de um som (palavra começada antes ou palavra anterior colada)"
    pausa = comeco_colado(env, s0)
    if pausa is not None:
        return False, (f"a peça começa {pausa * 1000:.0f} ms depois de outra fala da fonte (corte em {s0:.2f} s): pode ser o resto "
                       "de uma palavra; uma frase nova pede pausa de 150 ms ou mais")
    return True, ""


SILABA_MAX = 0.30          # resto de palavra: som de até 300 ms antes de um silêncio (o "-zer" real tinha 260 ms)


def comeco_colado(env: dict, s0: float, minimo: float = 0.15, alcance: float = 0.5, procura: float = 0.30) -> float | None:
    """A primeira fala da peça (a partir de `s0`) começa a menos de `minimo` s do fim de OUTRA fala da fonte? Pega a peça que
    começa no meio de uma palavra depois de uma oclusão curta (dados reais 19/11: o "-zer" de "freezer", com 120 ms de silêncio
    antes, abria a frase seguinte). Devolve a pausa medida (s) quando colado; None quando a pausa é de frase ou não há fala antes."""
    e, lim = env["db"], env["limiar"]
    j0 = int(round(s0 / PASSO))
    p = next((k for k in range(max(0, j0), min(len(e), j0 + int(round(procura / PASSO)))) if e[k] > lim), None)
    if p is None or p == 0:
        return None
    q = p - 1
    while q >= 0 and e[q] <= lim and (p - q) * PASSO <= alcance:
        q -= 1
    if q < 0 or e[q] <= lim:
        return None                                   # nada de fala no alcance: começo limpo
    pausa = (p - q - 1) * PASSO
    if pausa >= minimo:
        return None
    # só o RESTO de palavra: a primeira fala é uma sílaba solta (som curto até um silêncio de 60 ms). Corte de frase no meio de
    # fala corrida ("...e eu | acho que...") tem pausa curta também, mas a fala segue: não é resto de palavra.
    k, r = int(round(0.06 / PASSO)), p
    while r < len(e) - k and not np.all(e[r:r + k] <= lim) and (r - p) * PASSO < SILABA_MAX:
        r += 1
    return round(pausa, 2) if (r - p) * PASSO < SILABA_MAX else None


# ------------------------------------------------------------------ voz que não é do falante
TOM_CONTINUO = 1.2      # razão máxima de F0 entre quadros vizinhos (20 ms) da mesma linha de tom
FAIXA_MIN_DB = 10.0     # arquivo com menos que isso entre piso e nível alto não tem fala que se ouça (mudo, só ruído)


def audivel(env: dict, a: float, b: float, minimo: float = 0.05) -> bool:
    """Há fala que se ouça em [a, b] (tempos do arquivo)? Pelo menos `minimo` s acima do limiar, num arquivo com faixa de
    nível de fala (>= FAIXA_MIN_DB entre piso e alto) e com o trecho inteiro dentro do arquivo. Quem confere usa para não
    aprovar calado um áudio mudo, vazio ou mais curto que a peça (o envelope sem fala responderia "a fala já tinha terminado")."""
    e = env["db"]
    if env["alto"] - env["piso"] < FAIXA_MIN_DB or b > len(e) * PASSO + 0.05:
        return False
    i, j = max(0, int(round(a / PASSO))), min(len(e), int(round(b / PASSO)))
    return j > i and int(np.sum(e[i:j] > env["limiar"])) * PASSO >= minimo - 1e-9


def f0_serie(x: np.ndarray, sr: int, passo: float = 0.02, jan: float = 0.05, ac_min: float = 0.45) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Tom (F0) por autocorrelação, 70-400 Hz. Devolve tempos, f0 (0 = sem voz) e nível em dB. `ac_min` mais baixo ouve voz
    distante (eco da sala tira a nitidez do tom); quem usa assim exige linha de tom estável para não ler ruído como voz."""
    from scipy.signal import butter, resample_poly, sosfilt
    x = x.mean(1) if x.ndim > 1 else x
    chave = (len(x), sr, passo, jan, ac_min, hash(np.ascontiguousarray(x[:: max(1, len(x) // 4096)]).tobytes()))
    if chave in _F0_CACHE:                            # o QA pede a mesma série várias vezes por peça
        return _F0_CACHE[chave]
    out = _f0_serie(x, sr, passo, jan, ac_min)
    if len(_F0_CACHE) > 64:
        _F0_CACHE.clear()
    _F0_CACHE[chave] = out
    return out


_F0_CACHE: dict = {}


def _f0_serie(x: np.ndarray, sr: int, passo: float, jan: float, ac_min: float):
    from scipy.signal import butter, resample_poly, sosfilt
    if sr != 16000:
        x = resample_poly(x, 16000, sr).astype(np.float32)
        sr = 16000
    y = sosfilt(butter(2, [70, 1000], "bp", fs=sr, output="sos"), x)
    n, h = int(jan * sr), int(passo * sr)
    lo, hi = sr // 400, sr // 70
    jn = np.hanning(n)
    ts, fs, lv = [], [], []
    for i in range(0, len(y) - n, h):
        w = y[i:i + n] * jn
        ac = np.correlate(w, w, "full")[n - 1:]
        ac = ac / (ac[0] + 1e-12)
        k = lo + int(np.argmax(ac[lo:hi]))
        ts.append(i / sr)
        lv.append(20 * np.log10(float(np.sqrt(np.mean(w ** 2))) + 1e-9))
        fs.append(sr / k if ac[k] > ac_min else 0.0)
    return np.array(ts), np.array(fs), np.array(lv)


def vozes_de_fora(x: np.ndarray, sr: int, dur_min: float = 0.18, abaixo_db: float = 9.0, razao_tom: float = 0.72,
                 continuidade: bool = False, ref: dict | None = None) -> list[dict]:
    """Trechos vozeados que não parecem o falante principal do trecho: bem mais FRACOS que a fala dele (voz longe do microfone,
    `abaixo_db`) ou com TOM muito abaixo do dele (`razao_tom` x a mediana; homem dirigindo uma apresentadora).

    `continuidade=True` (o QA usa): descarta o trecho que é a MESMA linha de tom do falante, colada nele sem pausa. Sílaba fraca
    no meio da frase e tom caindo no fim da frase saem da fala principal sem pausa e com o F0 contínuo (vizinho a até 40 ms,
    razão de F0 dentro de `TOM_CONTINUO`); voz de outra pessoa entra depois de uma pausa ou com um salto de tom (homem da
    equipe ~120 Hz contra ~230 Hz da apresentadora). Padrão False: o comportamento antigo, para quem já chama.

    Com `continuidade=True` também vale a regra da consoante (dados reais de 19/11: o "g" de "Goiaba" e o "xi" de "abacaxi"
    davam falso positivo): trecho só FRACO, com o tom dentro de ±25% do falante e encostado (até 120 ms) na fala dele é a
    própria fala (pré-sonorização de consoante, sílaba final fraca). Voz fraca de tom diferente, ou solta numa pausa, continua.

    `ref` ({"f0", "nivel"}, opcional): a voz principal medida no filme inteiro (mesma fonte para o nível). Sem ela, a referência
    é o próprio trecho, e uma peça que é TODA voz de outra pessoa longe do microfone viraria a "fala principal" de si mesma.

    Devolve [{"a", "b", "f0", "nivel", "fala" (nível da fala principal), "f0_fala", "motivo"}], tempos relativos ao trecho."""
    ts, f, lv = f0_serie(x, sr)
    if not len(ts):
        return []
    forte = float(np.percentile(lv, 85))
    piso = float(np.percentile(lv, 10))
    fv = f[(f > 0) & (lv > forte - 8)]
    med = float(np.median(fv)) if len(fv) else 0.0
    if ref:
        med = float(ref.get("f0") or med)
        forte = max(forte, float(ref.get("nivel") if ref.get("nivel") is not None else forte))
    fraco = (f > 0) & (lv < forte - abaixo_db) & (lv > piso + 3)
    grave = (f > 0) & (f < razao_tom * med) & (lv > piso + 3) if med else np.zeros(len(f), bool)
    g = fraco | grave
    out, i = [], 0
    while i < len(g):
        if g[i]:
            j = i
            while j + 1 < len(g) and (g[j + 1] or (j + 2 < len(g) and g[j + 2])):
                j += 1
            so_fraco = not grave[i:j + 1].any()
            ff_ = f[i:j + 1][f[i:j + 1] > 0]
            tom_igual = bool(med and len(ff_) and abs(float(np.median(ff_)) / med - 1) <= TOM_IGUAL)
            consoante = continuidade and so_fraco and tom_igual and _encostado(f, lv, g, i, j, forte)
            if ts[j] - ts[i] >= dur_min and not consoante and not (continuidade and _colado_no_falante(f, g, i, j)):
                ff = f[i:j + 1]
                ff = ff[ff > 0]
                out.append({"a": round(float(ts[i]), 2), "b": round(float(ts[j] + 0.02), 2), "f0": int(np.median(ff)),
                            "nivel": round(float(lv[i:j + 1].max()), 1), "fala": round(forte, 1), "f0_fala": int(med),
                            "motivo": "tom" if grave[i:j + 1].mean() > 0.5 else "longe"})
            i = j + 1
        else:
            i += 1
    return out


TOM_IGUAL = 0.25          # ±25% do tom do falante: mesma pessoa (homem x mulher fica perto de uma oitava)
ENCOSTA_Q = 6             # quadros de 20 ms (120 ms)


def _encostado(f: np.ndarray, lv: np.ndarray, g: np.ndarray, i: int, j: int, forte: float) -> bool:
    """Há fala principal (vozeada, fora da marca, nível de fala) a até 120 ms antes ou depois do trecho [i, j]?"""
    viz = list(range(max(0, i - ENCOSTA_Q), i)) + list(range(j + 1, min(len(f), j + 1 + ENCOSTA_Q)))
    return any(f[k] > 0 and not g[k] and lv[k] > forte - 8 for k in viz)


TOM_PARADO = 0.004        # variação de F0 menor que 0,4% no trecho: máquina (voz humana oscila)


def tom_estavel(x: np.ndarray, sr: int, dur_min: float = 0.18, ac_min: float = 0.30, nivel_fala: float | None = None) -> list[dict]:
    """Voz que o limiar de fala não ouve (longe do microfone): linhas de tom ESTÁVEIS (F0 de quadro a quadro dentro de
    `TOM_CONTINUO`, >= `dur_min`) com o limiar de vozeamento mais baixo. Ruído não forma linha de tom de 180 ms; zumbido de
    máquina forma, mas parado (`TOM_PARADO`), e cai fora. Com `nivel_fala` (nível da fala principal na fonte), só fora da
    fala principal e sem encostar nela: a cauda grave da frase dela não é outra pessoa.
    Devolve [{"a", "b", "f0", "nivel"}], tempos relativos ao trecho."""
    ts, f, lv = f0_serie(x, sr, ac_min=ac_min)
    if not len(ts):
        return []
    piso = float(np.percentile(lv, 10))
    if nivel_fala is None:                              # sem o nível da fala principal (peça que pode ser só a outra voz)
        fala = np.zeros(len(f), bool)
    else:
        _, f_fala, _ = f0_serie(x, sr)                  # fala principal: vozeamento normal e nível de fala da fonte
        fala = (f_fala > 0) & (lv > float(nivel_fala) - 8)
    out, i = [], 0
    while i < len(f):
        if f[i] > 0 and lv[i] > piso + 3 and not fala[i]:
            j = i
            while j + 1 < len(f) and f[j + 1] > 0 and not fala[j + 1] and 1 / TOM_CONTINUO <= f[j + 1] / f[j] <= TOM_CONTINUO:
                j += 1
            ff = f[i:j + 1]
            parado = float(np.ptp(ff)) / float(np.median(ff)) < TOM_PARADO     # zumbido de freezer/ar-condicionado: tom imóvel
            encosta = any(0 <= k < len(f) and fala[k] for k in (i - 1, i - 2, j + 1, j + 2))   # cauda/começo da fala principal
            if ts[j] - ts[i] + 0.02 >= dur_min and not parado and not encosta:
                out.append({"a": round(float(ts[i]), 2), "b": round(float(ts[j] + 0.02), 2), "f0": int(np.median(f[i:j + 1])),
                            "nivel": round(float(lv[i:j + 1].max()), 1)})
            i = j + 1
        else:
            i += 1
    return out


def referencia(trechos: list[np.ndarray], sr: int) -> dict | None:
    """Voz principal de um conjunto de trechos (as peças do filme): mediana do F0 nos quadros fortes e nível alto (p85)."""
    fs, lvs = [], []
    for x in trechos:
        if len(x) < sr * 0.1:
            continue
        _, f, lv = f0_serie(x, sr)
        fs.append(f)
        lvs.append(lv)
    if not fs:
        return None
    f, lv = np.concatenate(fs), np.concatenate(lvs)
    forte = float(np.percentile(lv, 85))
    fv = f[(f > 0) & (lv > forte - 8)]
    if not len(fv):
        return {"f0": None, "nivel": forte}
    # moda (em escala de tom) e não mediana: com duas vozes a mediana cairia entre as duas, longe de ambas
    lg = np.log2(fv)
    h, b = np.histogram(lg, bins=np.arange(np.log2(70), np.log2(400) + 0.1, 0.1))
    pico = (b[int(np.argmax(h))] + b[int(np.argmax(h)) + 1]) / 2
    perto = fv[np.abs(lg - pico) <= np.log2(1 + TOM_IGUAL)]
    return {"f0": float(np.median(perto)) if len(perto) else float(np.median(fv)), "nivel": forte}


def _colado_no_falante(f: np.ndarray, g: np.ndarray, i: int, j: int) -> bool:
    """O trecho [i, j] (quadros de F0) encosta, a até 2 quadros (40 ms), num quadro do falante principal com F0 contínuo?"""
    def cont(k_trecho: int, k_viz: int) -> bool:
        return 0 <= k_viz < len(f) and f[k_viz] > 0 and not g[k_viz] and f[k_trecho] > 0 and \
            1 / TOM_CONTINUO <= f[k_viz] / f[k_trecho] <= TOM_CONTINUO
    return any(cont(i, i - d) for d in (1, 2)) or any(cont(j, j + d) for d in (1, 2))
