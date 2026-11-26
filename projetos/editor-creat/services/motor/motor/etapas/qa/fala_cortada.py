"""fala_cortada: nenhuma peça de voz corta a fala antes de a frase terminar, nem começa no meio de um som (revisão do dono
19/11: "fala alguma coisa antes de terminar a frase, já teve o recorte"; "comum" saía "com", "tradicional" saía "tradição").

Integração de 19/11 (duas sessões fizeram a mesma checagem): uma checagem só, que REPROVA quando QUALQUER régua reprova.
Régua 1, `motor.audio_fala` (a mesma de quem corta, `ferramentas/ajustar_cortes.py`), no envelope do arquivo inteiro da fonte:
   fim com `corte_final_ok` (fala que continua depois do corte, oclusão de "t/p/k" com a voz voltando, fim sem respiro) e
   começo com `corte_inicial_ok` (corte no meio de um som; desde 20/11 também a peça que começa a menos de 150 ms do fim de
   outra fala da fonte, o resto de palavra como o "-zer" de "freezer" depois de uma oclusão).
Régua 2, a cauda da última sílaba, numa janela de 1,6 s em volta do corte: se a voz está ativa no corte e morre 50 a 450 ms
   depois (antes da palavra seguinte), o corte comeu a cauda (`medir_corte`).
Régua 3, palavra a palavra da fonte (transcrição da análise, quando existe ao lado do áudio): corte dentro de uma palavra.
Régua 4, de ouvido no mix final: voz ativa no corte e a última palavra da peça não ouvida perto do fim dela (palavra
   parecida conta como ouvida: marca ou número corrigido no EDL não bate letra a letra, `_parecida`). Com a onda calma,
   palavra não ouvida vira só observação (o Whisper erra palavra sob música).

O fim de cada peça é o fim REAL na fonte: min(s1, s0 + (t1 - t0) * vel) (peça encurtada na linha do tempo acaba antes de s1).
Peças coladas não contam na emenda: a próxima no filme é da mesma fonte, começa onde esta acaba na fonte (|Δs| < 0,03 s) E
encosta nela no filme (|Δt| < 0,02 s, a mesma tolerância da montagem para o crossfade; com vão no filme cada peça entra com fade
próprio e o corte no meio da palavra se ouve).

Diálogo (onda 4, D46, SÓ com `edl.origem.vozes == "varias"`; em "uma" e no automático nada muda): no diálogo uma pessoa
responde colada na outra e não há pausa onde cortar. A régua 1 aceita (com a nota "colada em outra pessoa, corte no vale") o fim
de peça cuja próxima fala na fonte começa a até 0,25 s do corte quando TODOS: a fala seguinte é de OUTRA pessoa (assinatura de
voz com cosseno < 0,42 em trecho >= 0,45 s, ou mediana do F0 >= 20% longe da peça); o corte está no vale (|corte - vale| <=
0,03 s, vale = mínimo do envelope em [corte - 0,15; corte + 0,15]); o vale fica >= 6 dB abaixo do pico dos 0,3 s antes; e a
última palavra da peça (transcrição da fonte) termina antes de corte + 0,04 s. O começo da peça seguinte, colado no fim da
fala da outra pessoa, tem a mesma conta espelhada (pico dos 0,3 s depois; a primeira palavra começa depois de corte - 0,04 s).
Sem transcrição da fonte não há prova: reprova. As réguas 2, 3 e 4 continuam valendo. A mesma pessoa continuando, corte fora
do vale, vale raso ou palavra passando do corte: reprova como sempre.

Dispensa: `edl.qa.cortes_confirmados` (ids que o diretor ouviu e manteve de propósito), sempre listados no detalhe. NÃO VERIFICADO (reprova e bloqueia, sem dispensa): conferência sem as fontes, áudio
da fonte que não se lê, e peça sem fala que se ouça na fonte (áudio mudo, só ruído ou mais curto que a peça: o envelope sem
fala diria "a fala já tinha terminado" e aprovaria calado)."""
from __future__ import annotations

import json
import pathlib
from itertools import pairwise

import numpy as np

from motor import audio_fala

ID, BLOQUEIA = "fala_cortada", True
COLADA_S = 0.03
COLADA_T_S = 0.02             # montagem/voz.py: colar_ant = |t1_ant - t0| < 0,02
SR_FALA = 16000
PASSO = 0.01                  # s por amostra do envelope da régua 2
ANTES, DEPOIS = 1.0, 0.6      # janela da régua 2 em volta do corte
CAUDA_MS = (50, 450)
# diálogo (varias, onda 4)
COLADA_OUTRA_S = 0.25         # a outra fala começa (ou acabou) a até 0,25 s do corte
VALE_JANELA_S = 0.15          # vale = mínimo do envelope em [corte - 0,15; corte + 0,15]
VALE_TOL_S = 0.03             # o corte a até 30 ms do vale
VALE_ABAIXO_DB = 6.0          # o vale >= 6 dB abaixo do pico dos 0,3 s do lado da peça
PICO_LADO_S = 0.30
PALAVRA_FOLGA_S = 0.04        # a última palavra da peça termina antes de corte + 0,04 s (a primeira começa depois de corte - 0,04)
OUTRA_COS = 0.42              # assinatura: cosseno abaixo disso = outra pessoa (o mesmo limiar de falante.LIMIAR)
OUTRA_MIN_S = 0.45            # trecho mínimo para a assinatura valer
OUTRA_TOM = 0.20              # mediana do F0 20% ou mais longe = outra pessoa
TRECHO_MAX_S = 3.0            # quanto da peça e da outra fala se ouve para comparar as vozes


def fim_na_fonte(v: dict) -> float:
    """Fim real da peça na fonte: a linha do tempo pode usar menos que s1 - s0 (peça encurtada)."""
    vel = float(v.get("vel", 1.0) or 1.0)
    s0, s1 = float(v["s0"]), float(v["s1"])
    if v.get("t0") is None or v.get("t1") is None:
        return s1
    return min(s1, s0 + (float(v["t1"]) - float(v["t0"])) * vel)


def emendas(voz: list[dict]) -> tuple[set, set]:
    """(ids cujo FIM não se confere, ids cujo COMEÇO não se confere): pares colados na fonte E no filme, na ordem do filme."""
    pecas = sorted(voz, key=lambda v: v["t0"])
    sem_fim, sem_inicio = set(), set()
    for a, b in pairwise(pecas):
        if a["fonte"] == b["fonte"] and abs(b["s0"] - fim_na_fonte(a)) < COLADA_S and abs(b["t0"] - a["t1"]) < COLADA_T_S:
            sem_fim.add(a["id"])
            sem_inicio.add(b["id"])
    return sem_fim, sem_inicio


def _palavra(texto, ultima: bool = True) -> str:
    ws = [w.strip(".,;:!?…\"'“”«»()") for w in str(texto or "").split()]
    ws = [w for w in ws if w]
    return (ws[-1] if ultima else ws[0]) if ws else "—"


# ------------------------------------------------------------------ régua 1 (audio_fala, arquivo inteiro)
def conferir_pecas(voz: list[dict], envelopes: dict, offsets: dict | None = None) -> list[dict]:
    """Função pura: peças de voz + envelope de cada fonte (audio_fala.envelope do arquivo inteiro) -> problemas.

    Cada problema: {"id", "onde": "fim"|"inicio", "t" (tempo do filme), "fonte", "s" (tempo da fonte), "palavra", "motivo"}."""
    offsets = offsets or {}
    sem_fim, sem_inicio = emendas(voz)
    out = []
    for v in sorted(voz, key=lambda v: v["t0"]):
        env = envelopes[v["fonte"]]
        off = float(offsets.get(v["fonte"], 0.0))
        if v["id"] not in sem_fim:
            fim = fim_na_fonte(v)
            ok, motivo = audio_fala.corte_final_ok(env, fim - off)
            if not ok:
                out.append({"id": v["id"], "onde": "fim", "t": round(float(v["t1"]), 2), "fonte": v["fonte"], "s": round(fim, 2),
                            "palavra": _palavra(v.get("texto")), "motivo": motivo})
        if v["id"] not in sem_inicio:
            ok, motivo = audio_fala.corte_inicial_ok(env, float(v["s0"]) - off)
            if not ok:
                out.append({"id": v["id"], "onde": "inicio", "t": round(float(v["t0"]), 2), "fonte": v["fonte"], "s": round(float(v["s0"]), 2),
                            "palavra": _palavra(v.get("texto"), ultima=False), "motivo": motivo})
    return out


def nao_ouvidas(voz: list[dict], envelopes: dict, offsets: dict | None = None) -> list[dict]:
    """Função pura: peças sem fala que se ouça na fonte (audio_fala.audivel falso) -> [{"id", "t", "fonte", "s", "motivo"}].
    Áudio mudo, só ruído ou mais curto que a peça não pode virar "a fala já tinha terminado"."""
    offsets = offsets or {}
    out = []
    for v in sorted(voz, key=lambda v: v["t0"]):
        env = envelopes[v["fonte"]]
        off = float(offsets.get(v["fonte"], 0.0))
        a, b = float(v["s0"]) - off, float(v["s1"]) - off
        if audio_fala.audivel(env, a, b):
            continue
        dur = len(env["db"]) * audio_fala.PASSO
        if b > dur + 0.05:
            motivo = f"o áudio da fonte tem {dur:.2f} s e a peça vai até {b:.2f} s"
        elif env["alto"] - env["piso"] < audio_fala.FAIXA_MIN_DB:
            motivo = f"áudio da fonte sem fala (faixa de {env['alto'] - env['piso']:.0f} dB entre piso e nível alto: mudo ou só ruído)"
        else:
            motivo = "nenhuma fala acima do limiar dentro da peça (a palavra do texto pode ter ficado fora do corte)"
        out.append({"id": v["id"], "t": round(float(v["t0"]), 2), "fonte": v["fonte"], "s": [round(float(v["s0"]), 2), round(float(v["s1"]), 2)],
                    "motivo": motivo})
    return out


def envelope_fonte(c, fid: str) -> tuple[dict, float] | None:
    """Envelope do arquivo inteiro da fonte (o limiar fala x ambiente depende do arquivo todo), com cache na conferência."""
    k = ("envelope", fid)
    if k not in c.memo:
        a = c.audio_fonte(fid, SR_FALA)
        if a is None:
            return None
        c.memo[k] = (audio_fala.envelope(a[0], SR_FALA), a[1])
    return c.memo[k]


# ------------------------------------------------------------------ régua 2 (cauda da última sílaba, janela em volta do corte)
def envelope_db(x: np.ndarray, sr: int) -> np.ndarray:
    hop = max(1, int(round(sr * PASSO)))
    n = len(x) // hop
    if n == 0:
        return np.zeros(0, np.float32)
    q = x[: n * hop].astype(np.float64).reshape(n, hop)
    return (10 * np.log10((q * q).mean(axis=1) + 1e-12)).astype(np.float32)


def medir_corte(env: np.ndarray, i_corte: int) -> dict:
    """env: envelope em dB (10 ms); i_corte: índice do corte. Diz se a voz estava ativa no corte e em quanto tempo morre."""
    antes = env[max(0, i_corte - int(ANTES / PASSO)):i_corte]
    if len(antes) < 8:
        return {"ativo": False, "cauda_ms": None, "motivo": "trecho curto demais para medir"}
    ref = float(np.percentile(antes, 90))
    piso = float(np.percentile(env, 10))
    contraste = ref - piso > 10.0
    lim_ativo = max(ref - 14.0, piso + 8.0) if contraste else ref - 14.0
    lim_calmo = min(max(ref - 24.0, piso + 4.0), lim_ativo - 4.0) if contraste else ref - 24.0
    ult = antes[-3:]
    no_corte = float(10 * np.log10(np.mean(10 ** (ult / 10))))
    # sem contraste voz/sala na janela (fala corrida, sem pausa) só vale se o nível for mesmo de voz (acima de -35 dBFS)
    ativo = no_corte > lim_ativo and (contraste or ref > -35.0)
    cauda = None
    if ativo:
        depois = env[i_corte:]
        for k in range(0, max(0, len(depois) - 3)):
            if np.all(depois[k:k + 3] < lim_calmo):
                cauda = int(round(k * PASSO * 1000))
                break
    return {"ativo": bool(ativo), "cauda_ms": cauda, "no_corte_db": round(no_corte - ref, 1)}


def medir_fim(x: np.ndarray, sr: int, fim_arq: float) -> dict:
    """Régua 2 no áudio do arquivo inteiro: janela [fim - ANTES, fim + DEPOIS] (tempos do arquivo) e `medir_corte`."""
    a = max(0.0, fim_arq - ANTES)
    i, j = int(round(a * sr)), int(round((fim_arq + DEPOIS) * sr))
    env = envelope_db(np.asarray(x[i:j], np.float32).reshape(-1), sr)
    return medir_corte(env, min(len(env), int(round((fim_arq - a) / PASSO))))


# ------------------------------------------------------------------ diálogo: fala colada de outra pessoa (varias, onda 4)
def corte_no_vale(env: dict, s_arq: float, onde: str) -> tuple[bool, str]:
    """Função pura: o corte em `s_arq` (tempo do arquivo) está no vale entre duas falas coladas? A outra fala começa (fim) ou
    acabou (início) a até COLADA_OUTRA_S do corte; o corte fica a até VALE_TOL_S do vale; o vale fica VALE_ABAIXO_DB abaixo do
    pico dos PICO_LADO_S do lado da peça."""
    e, lim = env["db"], env["limiar"]
    P = audio_fala.PASSO
    j = int(round(s_arq / P))
    if onde == "fim":
        outra = next((k for k in range(j, min(len(e), j + int(round(COLADA_OUTRA_S / P)) + 1)) if e[k] > lim), None)
    else:
        outra = next((k for k in range(j, max(-1, j - int(round(COLADA_OUTRA_S / P)) - 1), -1) if 0 <= k < len(e) and e[k] > lim), None)
    if outra is None:
        return False, f"nenhuma fala colada a até {COLADA_OUTRA_S:.2f} s do corte"
    a, b = max(0, j - int(round(VALE_JANELA_S / P))), min(len(e), j + int(round(VALE_JANELA_S / P)) + 1)
    if b <= a:
        return False, "corte fora do áudio"
    iv = a + int(np.argmin(e[a:b]))
    vale = iv * P
    if abs(vale - s_arq) > VALE_TOL_S + 1e-9:
        return False, f"corte {abs(vale - s_arq) * 1000:.0f} ms fora do vale (em {vale:.2f} s; tolerância {VALE_TOL_S * 1000:.0f} ms)"
    lado = (s_arq - PICO_LADO_S, s_arq) if onde == "fim" else (s_arq, s_arq + PICO_LADO_S)
    pico = audio_fala._pico(e, *lado)
    if pico - float(e[iv]) < VALE_ABAIXO_DB:
        return False, f"vale raso: só {pico - float(e[iv]):.1f} dB abaixo do pico da fala (precisa {VALE_ABAIXO_DB:.0f} dB)"
    return True, f"corte no vale ({abs(vale - s_arq) * 1000:.0f} ms), {pico - float(e[iv]):.0f} dB abaixo do pico"


def _fala_vizinha(env: dict, s_arq: float, onde: str) -> tuple[float, float] | None:
    """Trecho (tempo do arquivo) da outra fala colada ao corte: depois dele (fim) ou antes (início), até a primeira pausa de 80
    ms ou TRECHO_MAX_S."""
    e, lim = env["db"], env["limiar"]
    P = audio_fala.PASSO
    j = int(round(s_arq / P))
    passo = 1 if onde == "fim" else -1
    k0 = next((k for k in range(j, j + passo * (int(round(COLADA_OUTRA_S / P)) + 1), passo) if 0 <= k < len(e) and e[k] > lim), None)
    if k0 is None:
        return None
    k, quietos, n = k0, 0, 0
    while 0 <= k < len(e) and n * P < TRECHO_MAX_S:
        quietos = quietos + 1 if e[k] <= lim else 0
        if quietos >= 8:
            k -= passo * 7
            break
        k += passo
        n += 1
    a, b = sorted((k0 * P, max(0, min(len(e) - 1, k)) * P))
    return (a, b + P) if b + P - a > 0.05 else None


def outra_pessoa(peca: np.ndarray, outra: np.ndarray, sr: int, assinador=None) -> tuple[bool | None, str]:
    """A fala `outra` é de outra pessoa que a `peca`? Assinatura (cosseno < OUTRA_COS, os dois trechos >= OUTRA_MIN_S) ou altura
    da voz (mediana do F0 >= OUTRA_TOM longe). None quando não dá para medir nenhuma das duas."""
    from motor.etapas import falante as F
    medidas = []
    if assinador is not None and getattr(assinador, "disponivel", False) and len(peca) >= OUTRA_MIN_S * sr and len(outra) >= OUTRA_MIN_S * sr:
        ea, eb = assinador.assinar(peca, sr, minimo=OUTRA_MIN_S), assinador.assinar(outra, sr, minimo=OUTRA_MIN_S)
        if ea is not None and eb is not None:
            cos = float(np.dot(ea, eb) / (np.linalg.norm(ea) * np.linalg.norm(eb) + 1e-9))
            if cos < OUTRA_COS:
                return True, f"assinatura {cos:.2f} (outra pessoa abaixo de {OUTRA_COS})"
            medidas.append(f"assinatura {cos:.2f}")
    ta, tb = F.tom_hz(peca, sr), F.tom_hz(outra, sr)
    if ta and tb:
        r = tb / ta
        if abs(r - 1.0) >= OUTRA_TOM:
            return True, f"altura da voz {tb:.0f} Hz contra {ta:.0f} Hz da peça"
        medidas.append(f"altura da voz {tb:.0f} Hz contra {ta:.0f} Hz da peça")
    if not medidas:
        return None, "sem como comparar as vozes (trechos curtos ou sem voz clara)"
    return False, "a mesma pessoa continuando (" + ", ".join(medidas) + ")"


def palavra_dentro(pal: list | None, s: float, s0: float, onde: str) -> tuple[bool, str]:
    """Função pura: a última (fim) ou a primeira (início) palavra da peça na transcrição da fonte respeita o corte em `s`?"""
    if not pal:
        return False, "sem transcrição da fonte para provar que a palavra terminou"
    if onde == "fim":
        w = next((w for w in reversed(pal) if float(w[0]) < s and float(w[1]) > s0), None)
        if w is None:
            return False, "nenhuma palavra da transcrição dentro da peça"
        if float(w[1]) > s + PALAVRA_FOLGA_S:
            return False, f"a palavra «{str(w[2]).strip()}» termina {round((float(w[1]) - s) * 1000)} ms depois do corte"
        return True, f"«{str(w[2]).strip()}» termina antes do corte"
    w = next((w for w in pal if float(w[1]) > s), None)
    if w is None:
        return False, "nenhuma palavra da transcrição dentro da peça"
    if float(w[0]) < s - PALAVRA_FOLGA_S:
        return False, f"a palavra «{str(w[2]).strip()}» começa {round((s - float(w[0])) * 1000)} ms antes do corte"
    return True, f"«{str(w[2]).strip()}» começa depois do corte"


def colada_em_outra(c, v: dict, onde: str, env: dict, off: float, pal: list | None) -> tuple[bool, str]:
    """Diálogo: a ponta `onde` da peça `v` encosta na fala de OUTRA pessoa, com o corte no vale e a palavra inteira?"""
    from motor.etapas.qa import voz_externa as VE
    s = fim_na_fonte(v) if onde == "fim" else float(v["s0"])
    s_arq = s - off
    ok, vale = corte_no_vale(env, s_arq, onde)
    if not ok:
        return False, vale
    ok, pw = palavra_dentro(pal, s, float(v["s0"]), onde)
    if not ok:
        return False, pw
    viz = _fala_vizinha(env, s_arq, onde)
    if viz is None:
        return False, "nenhuma fala colada para comparar a voz"
    x, _ = c.audio_fonte(v["fonte"], SR_FALA)
    a0, a1 = float(v["s0"]) - off, fim_na_fonte(v) - off
    a0, a1 = (max(a0, a1 - TRECHO_MAX_S), a1) if onde == "fim" else (a0, min(a1, a0 + TRECHO_MAX_S))
    peca = VE._trecho(x, SR_FALA, a0, a1)
    outra = VE._trecho(x, SR_FALA, viz[0], viz[1])
    try:
        assinador = VE._assinador(c)
    except Exception:  # noqa: BLE001 - sem modelo de voz: só a altura da voz decide
        assinador = None
    eh, quem = outra_pessoa(peca, outra, SR_FALA, assinador)
    if not eh:
        return False, quem
    return True, f"colada em outra pessoa, corte no vale: {quem}; {vale}; {pw}"


# ------------------------------------------------------------------ régua 3 (palavras da fonte)
def _palavras_fonte(c, fid: str) -> list | None:
    try:
        arq = pathlib.Path(c.fontes.audio(fid)).parent / "analise.json"
        if not arq.exists():
            return None
        from motor.etapas.resolvedor import palavras_do_arquivo
        return palavras_do_arquivo(json.loads(arq.read_text(encoding="utf-8")))
    except Exception:  # noqa: BLE001 - sem transcrição da fonte, valem as outras réguas
        return None


def _parecida(a: str, b: str) -> bool:
    """Palavra do EDL (já corrigida: marca, número) x palavra ouvida no mix: igual, uma contém a outra ou 60% parecida."""
    import difflib
    if not a or not b:
        return False
    return a == b or (len(b) >= 3 and (a in b or b in a)) or difflib.SequenceMatcher(None, a, b).ratio() >= 0.6


def reguas_do_fim(v: dict, fim: float, m: dict | None, pal: list | None, ouvida: bool | None, ultima: str | None) -> tuple[list[str], str | None]:
    """Função pura: réguas 2, 3 e 4 para o fim de uma peça -> (motivos de reprovação, observação ou None).
    `m` = medir_corte no fim; `pal` = palavras da fonte [[s, e, palavra...]]; `ouvida` = última palavra ouvida no mix."""
    motivos, obs = [], None
    dentro = next((w for w in pal or [] if w[0] + 0.04 < fim < w[1] - 0.05), None)
    seguinte = next((w[0] for w in pal or [] if w[0] >= fim - 0.03), None)
    if dentro is not None:
        motivos.append(f"o corte cai dentro da palavra «{str(dentro[2]).strip()}», faltam {int((dentro[1] - fim) * 1000)} ms")
    ativo = bool(m and m.get("ativo"))
    cauda = m.get("cauda_ms") if m else None
    if ativo and cauda is not None and CAUDA_MS[0] <= cauda <= CAUDA_MS[1] and (seguinte is None or fim + cauda / 1000 <= seguinte + 0.03):
        motivos.append(f"a última sílaba continua por {cauda} ms depois do corte")
    if ativo and ouvida is False:
        motivos.append("a voz está ativa no corte e a última palavra não é ouvida no mix final")
    elif ouvida is False and not motivos:
        obs = f"{v['id']}: «{ultima}» não reconhecida no mix (onda calma no corte)"
    return motivos, obs


def _linha(p: dict) -> str:
    if p["onde"] == "fim":
        return f"{p['id']} corta o fim em {p['t']:.2f} s do filme (fonte {p['fonte']} {p['s']:.2f} s, «{p['palavra']}»): {p['motivo']}"
    return f"{p['id']} começa no meio de um som em {p['t']:.2f} s do filme (fonte {p['fonte']} {p['s']:.2f} s, «{p['palavra']}»): {p['motivo']}"


def _juntar(probs: list[dict]) -> list[dict]:
    """Um problema por (peça, ponta): os motivos das réguas que reprovaram a mesma ponta vão juntos."""
    por: dict = {}
    for p in probs:
        k = (p["id"], p["onde"])
        if k not in por:
            por[k] = {**p, "reguas": [p.get("regua", "audio_fala")]}
        elif p["motivo"] not in por[k]["motivo"]:
            por[k]["motivo"] += " · " + p["motivo"]
            por[k]["reguas"].append(p.get("regua", "audio_fala"))
        por[k].pop("regua", None)
    return list(por.values())


def checar(c):
    from motor.etapas.qa import normalizar
    voz = sorted(c.edl.get("voz") or [], key=lambda v: v["t0"])
    if not voz:
        return {"ok": True, "detalhe": "sem peças de voz"}
    if c.fontes is None:
        return {"ok": False, "bloqueia": True,
                "detalhe": "NÃO VERIFICADO: a conferência não recebeu as fontes; sem o áudio da origem não dá para saber se a fala foi cortada"}
    envs, offs = {}, {}
    for fid in sorted({v["fonte"] for v in voz}):
        try:
            envs[fid], offs[fid] = envelope_fonte(c, fid)
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "bloqueia": True,
                    "detalhe": f"NÃO VERIFICADO: não consegui ler o áudio da fonte '{fid}' ({type(e).__name__}); a versão não é entregue sem conferir o fim das falas"}
    surdas = nao_ouvidas(voz, envs, offs)
    surdas_ids = {p["id"] for p in surdas}
    probs = [p for p in conferir_pecas(voz, envs, offs) if p["id"] not in surdas_ids]
    pal_cache: dict = {}
    dialogo = []
    if str((c.edl.get("origem") or {}).get("vozes") or "auto") == "varias" and probs:                   # diálogo: fala colada de outra pessoa com o corte no vale
        vid = {v["id"]: v for v in voz}
        resto = []
        for p in probs:
            v = vid[p["id"]]
            if v["fonte"] not in pal_cache:
                pal_cache[v["fonte"]] = _palavras_fonte(c, v["fonte"])
            ok, nota = colada_em_outra(c, v, p["onde"], envs[v["fonte"]], offs[v["fonte"]], pal_cache[v["fonte"]])
            if ok:
                dialogo.append({**p, "motivo": nota})
            else:
                resto.append({**p, "motivo": f"{p['motivo']} (não é diálogo colado: {nota})"})
        probs = resto
    # réguas 2, 3 e 4 no fim de cada peça (a transcrição do mix vem do cache da legenda_x_fala)
    tr = c.transcrever("mix", c.mix if c.mix is not None else c.final)
    ouvidas = c.palavras(tr) if tr and not tr.get("erro") else None
    sem_fim, _ = emendas(voz)
    fins, obs = [], []
    for v in voz:
        if v["id"] in sem_fim or v["id"] in surdas_ids:
            continue
        fim = fim_na_fonte(v)
        item = {"voz": v["id"], "t": round(float(v["t1"]), 2)}
        ultima = next((n for n in reversed(normalizar(v.get("texto") or "").split()) if len(n) >= 3), None)
        ouvida = None
        if ultima and ouvidas is not None:
            perto = [o[2] for o in ouvidas if v["t1"] - 1.5 <= o[0] <= v["t1"] + 0.7]
            ouvida = any(_parecida(ultima, o) for o in perto) or _parecida(ultima, "".join(perto[-2:]))
            item["ultima_palavra"], item["ouvida_no_mix"] = ultima, ouvida
        x, off = c.audio_fonte(v["fonte"], SR_FALA)
        m = medir_fim(x, SR_FALA, fim - off)
        item.update(m)
        if v["fonte"] not in pal_cache:
            pal_cache[v["fonte"]] = _palavras_fonte(c, v["fonte"])
        motivos, o = reguas_do_fim(v, fim, m, pal_cache[v["fonte"]], ouvida, ultima)
        for mot in motivos:
            probs.append({"id": v["id"], "onde": "fim", "t": round(float(v["t1"]), 2), "fonte": v["fonte"], "s": round(fim, 2),
                          "palavra": _palavra(v.get("texto")), "motivo": mot, "regua": "cauda" if "sílaba" in mot else
                          ("palavras_fonte" if "dentro da palavra" in mot else "mix")})
        if o:
            obs.append(o)
        fins.append(item)
    probs = _juntar(probs)
    confirmados = set((c.edl.get("qa") or {}).get("cortes_confirmados") or [])
    falhas = [p for p in probs if p["id"] not in confirmados]
    dispensados = [p for p in probs if p["id"] in confirmados]
    det = [f"{len(voz)} peça(s) de voz ouvida(s) na fonte ({len(sem_fim)} emenda(s) colada(s) fora da conta)"]
    if surdas:
        det.insert(0, f"NÃO VERIFICADO: {len(surdas)} peça(s) sem fala que se ouça na fonte, sem como saber se a fala foi cortada: "
                   + "; ".join(f"{p['id']} ({p['t']:.2f} s do filme, fonte {p['fonte']} {p['s'][0]:.2f}-{p['s'][1]:.2f} s): {p['motivo']}" for p in surdas))
    if falhas:
        det.append(f"{len({p['id'] for p in falhas})} peça(s) com a fala cortada: " + "; ".join(_linha(p) for p in falhas))
    elif not surdas:
        det.append(f"{len(fins)} fim(ns) de fala conferido(s): nenhum corte antes da última sílaba")
    if dialogo:
        det.append(f"{len(dialogo)} ponta(s) aceita(s) no diálogo (várias pessoas falam): "
                   + "; ".join(f"{p['id']} ({p['onde']}, {p['t']:.2f} s do filme): {p['motivo']}" for p in dialogo[:5]))
    if dispensados:
        det.append("confirmados pelo diretor (cortes_confirmados): " + "; ".join(_linha(p) for p in dispensados))
    if obs:
        det.append("observação: " + "; ".join(obs[:3]))
    return {"ok": not falhas and not surdas, "bloqueia": True,
            "valor": {"pecas": len(voz), "reprovadas": sorted({p["id"] for p in falhas}), "problemas": falhas[:30],
                      "confirmadas": sorted({p["id"] for p in dispensados}), "nao_verificadas": surdas[:30], "fins": fins[:60],
                      "dialogo": dialogo[:30]},
            "detalhe": "; ".join(det)}
