"""Mapa da música: o editor "ouve" a trilha antes de montar (pedido do dono, 25/11: sentir o momento, música e cena conectadas).

mapa(x, sr, bpm, fase) devolve, sem biblioteca pesada (numpy/scipy):
- energia: nível (dB) a cada 0,5 s;
- secoes: [{t0, t1, energia 1..5}] — partes da música pela mudança sustentada de energia (intro, sobe, auge, respiro);
- virada: o segundo em que a música "estoura" (maior subida sustentada de energia), encostado na batida;
- tom: tonalidade estimada ("lá menor"), para casar duas músicas "como se fosse no mesmo tom".
O resolvedor usa a virada para pôr o auge do filme (direcao.trilha.drop_em) exatamente em cima dela.
"""
from __future__ import annotations

import numpy as np

PASSO = 0.5
NOTAS = ["dó", "dó#", "ré", "ré#", "mi", "fá", "fá#", "sol", "sol#", "lá", "lá#", "si"]
_MAIOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])   # perfis de Krumhansl
_MENOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def energia(x: np.ndarray, sr: int, passo: float = PASSO) -> np.ndarray:
    h = int(passo * sr)
    n = len(x) // h
    if n == 0:
        return np.zeros(0)
    q = x[: n * h].reshape(n, h)
    return 10 * np.log10(np.einsum("ij,ij->i", q, q, dtype=np.float64) / h + 1e-10)     # sem copiar a música inteira em float64


def virada(en: np.ndarray, passo: float = PASSO, janela_s: float = 4.0) -> float | None:
    """Maior subida SUSTENTADA: média dos 4 s depois menos a dos 4 s antes. None se a música não tem virada clara (< 3 dB)."""
    k = max(2, int(janela_s / passo))
    if len(en) < 3 * k:
        return None
    piso = np.percentile(en, 5)
    e = np.maximum(en, piso)                                   # silêncio do começo não conta como "antes"
    ganho = np.array([e[i:i + k].mean() - e[i - k:i].mean() for i in range(k, len(e) - k)])
    i = int(np.argmax(ganho))
    if ganho[i] < 3.0:
        return None
    return round((i + k) * passo, 2)


def secoes(en: np.ndarray, passo: float = PASSO, minimo_s: float = 6.0) -> list[dict]:
    """Partes da música: corta onde a energia (suavizada em 4 s) muda mais de 2,5 dB e se mantém; nível de 1 a 5."""
    if len(en) < 4:
        return []
    k = max(1, int(4.0 / passo))
    suave = np.convolve(np.pad(en, (k // 2, k - k // 2 - 1), mode="edge"), np.ones(k) / k, mode="valid")
    cortes, ini, m = [0], 0, max(1, int(minimo_s / passo))
    for i in range(m, len(suave) - m):
        if i - ini >= m and abs(suave[i:i + m].mean() - suave[ini:i].mean()) > 2.5 and abs(suave[i] - suave[i - 1]) >= 0.2:
            cortes.append(i)
            ini = i
    cortes = [cortes[0]] + [_afinar(en, c, k) for c in cortes[1:]]   # a média de 4 s dispara cedo: o corte vai ao degrau real
    cortes = sorted(set(cortes))
    cortes.append(len(suave))
    lo, hi = np.percentile(suave, 5), np.percentile(suave, 95)
    out = []
    for a, b in zip(cortes, cortes[1:]):
        nivel = 3 if hi - lo < 1.0 else int(np.clip(1 + round(4 * (suave[a:b].mean() - lo) / (hi - lo)), 1, 5))
        if out and out[-1]["energia"] == nivel:
            out[-1]["t1"] = round(b * passo, 1)
        else:
            out.append({"t0": round(a * passo, 1), "t1": round(b * passo, 1), "energia": nivel})
    return out


def _afinar(en: np.ndarray, i: int, k: int) -> int:
    """Leva o corte ao ponto de maior degrau de energia (1 s antes contra 1 s depois) a até k passos (4 s) do corte da média
    suavizada, que dispara assim que a janela da frente "vê" a mudança, ~1,5 s antes dela (medido em degrau sintético).
    Sem isso a troca de música caía ainda na intro calma da parte e afundava o som."""
    h = max(1, int(1.0 / PASSO))
    melhor, j_m = -1.0, i
    for j in range(max(h, i - k), min(len(en) - h, i + k) + 1):
        d = abs(float(en[j:j + h].mean()) - float(en[j - h:j].mean()))
        if d > melhor + 1e-9:
            melhor, j_m = d, j
    return j_m


def tom(x: np.ndarray, sr: int) -> str | None:
    """Tonalidade pela energia de cada nota (cromagrama da FFT, 55 Hz a 2 kHz) contra os perfis maior/menor."""
    alvo = 11025
    if sr > alvo:
        d = sr // alvo
        x, sr = x[: len(x) // d * d].reshape(-1, d).mean(axis=1), sr // d
    n = 8192
    if len(x) < n:
        return None
    croma = np.zeros(12)
    freqs = np.fft.rfftfreq(n, 1 / sr)
    ok = (freqs >= 55) & (freqs <= 2000)
    nota = (np.round(12 * np.log2(freqs[ok] / 440.0)).astype(int) + 9) % 12          # lá = 9
    jan = np.hanning(n)
    for i in range(0, len(x) - n, n // 2):
        mag = np.abs(np.fft.rfft(x[i:i + n] * jan))[ok]
        np.add.at(croma, nota, mag * mag)
    if croma.sum() <= 0:
        return None
    croma = croma / croma.sum()
    melhor, nome = -2.0, None
    for k in range(12):
        for perfil, modo in ((_MAIOR, "maior"), (_MENOR, "menor")):
            c = float(np.corrcoef(croma, np.roll(perfil, k))[0, 1])
            if c > melhor:
                melhor, nome = c, f"{NOTAS[k]} {modo}"
    return nome if melhor >= 0.5 else None


def na_batida(t: float, bpm: float | None, fase: float = 0.0) -> float:
    if not bpm:
        return round(t, 2)
    b = 60.0 / bpm
    return round(fase + round((t - fase) / b) * b, 3)


def mapa(x: np.ndarray, sr: int, bpm: float | None = None, fase: float = 0.0) -> dict:
    en = energia(x, sr)
    v = virada(en)
    return {"virada": na_batida(v, bpm, fase) if v is not None else None, "tom": tom(x, sr), "secoes": secoes(en)}


def combina(tom_a: str | None, tom_b: str | None) -> bool:
    """Duas músicas "no mesmo tom" para emendar: mesma tonalidade, relativa (dó maior / lá menor) ou vizinha de quinta."""
    if not tom_a or not tom_b:
        return False

    def pos(t):
        nota, modo = t.rsplit(" ", 1)
        k = NOTAS.index(nota)
        return (k if modo == "maior" else (k + 3) % 12)        # tudo na relativa maior
    d = (pos(tom_a) - pos(tom_b)) % 12
    return d in (0, 5, 7)


# ---------------------------------------------------------------- emenda de duas músicas (M4, pedido do dono 25/11)
TOLERANCIA_BPM = 0.06        # até 6% o ouvido aceita o esticamento de tempo (atempo mantém o tom); acima disso soa arrastado
XF_MAX_S = 2.5               # crossfade casado: um compasso, nunca mais que isso (duas músicas juntas por muito tempo embolam)


def na_cabeca(t: float, bpm: float | None, fase: float = 0.0, tempos: int = 4) -> float:
    """Tempo forte de compasso mais perto de t (o 1 do compasso), contado a partir da 1a batida `fase`."""
    if not bpm:
        return round(t, 3)
    c = tempos * 60.0 / bpm
    return round(fase + max(0, round((t - fase) / c)) * c, 3)


def _fronteiras(mp: dict | None, bpm: float | None, fase: float, dur: float | None, ini: bool) -> list[tuple[float, int, int]]:
    """Fronteiras de parte da música: (t, energia da parte que termina, energia da que começa), encostadas no 1 do compasso.
    Sem partes medidas, a frase musical de 4 compassos faz o papel de parte (é onde músicas pop mudam)."""
    sec = (mp or {}).get("secoes") or []
    out = []
    if sec:
        for k, s in enumerate(sec):
            t = float(s["t0"] if ini else s["t1"])
            antes = int(sec[k - 1]["energia"]) if ini and k > 0 else int(s["energia"]) if not ini else 0
            depois = int(s["energia"]) if ini else (int(sec[k + 1]["energia"]) if k + 1 < len(sec) else 0)
            out.append((na_cabeca(t, bpm, fase), antes, depois))
    elif bpm:
        frase = 16 * 60.0 / bpm
        n = int(((dur or 0.0) - fase) / frase) + 1
        out = [(round(fase + k * frase, 3), 3, 3) for k in range(n + 1)]
    if ini and not any(abs(t - na_cabeca(0.0, bpm, fase)) < 1e-3 for t, _, _ in out):
        out.append((na_cabeca(0.0, bpm, fase), 0, int(sec[0]["energia"]) if sec else 3))
    if dur:
        out = [x for x in out if 0.0 <= x[0] <= dur + 1e-3]
    return sorted(set(out))


def razao_de_tempo(bpm_a: float | None, bpm_b: float | None) -> tuple[float, bool]:
    """Quanto a música B precisa correr para bater no tempo de A (segundos de B por segundo de filme) e se cabe nos 6%.
    Metade e dobro do tempo também casam (60 contra 120 bpm dá a mesma grade de batidas)."""
    if not bpm_a or not bpm_b:
        return 1.0, False
    r = min((bpm_a * k / bpm_b for k in (0.5, 1.0, 2.0)), key=lambda x: abs(x - 1.0))
    return round(r, 5), abs(r - 1.0) <= TOLERANCIA_BPM + 1e-9


def ponto_de_troca(mapa_a: dict | None, mapa_b: dict | None, bpm_a: float | None, fase_a: float, bpm_b: float | None, fase_b: float, *,
                   alvo_a: float | None = None, minimo_a: float = 0.0, dur_a: float | None = None, dur_b: float | None = None,
                   precisa_b: float = 0.0, tempo_a: float | None = None) -> dict | None:
    """Onde a música A passa a vez para a B, "como se fosse no mesmo tom" (pedido do dono).

    A sai no FIM de uma parte dela (fronteira de `secoes`), no 1 do compasso; B entra no COMEÇO de uma parte dela, também
    no 1 do compasso. Entre as fronteiras de B, a escolhida é a que continua a energia em que A termina (sobe de 4 para 4,
    não despenca de 5 para 1) e que ainda tem `precisa_b` segundos de música pela frente.

    modo "casada": tom que combina (`combina`) e bpm a até 6% (ou metade/dobro): B é esticada (`razao`) para o tempo de A e
    as duas cruzam por um compasso com as batidas em cima umas das outras. modo "respiro": tom ou tempo não casam; A sai
    no fim de uma parte calma de preferência, o cruzamento dura uma batida e B não é esticada (esticar mais de 6% soa falso).
    `tempo_a` é o bpm de A no filme (A já esticada, numa terceira música); `alvo_a` e `minimo_a` são segundos de A."""
    tempo_a = tempo_a or bpm_a
    razao, casa_tempo = razao_de_tempo(tempo_a, bpm_b)
    tom_a, tom_b = (mapa_a or {}).get("tom"), (mapa_b or {}).get("tom")
    junta = combina(tom_a, tom_b)
    casada = junta and casa_tempo
    batida_filme = 60.0 / tempo_a if tempo_a else 0.5
    xf = min(XF_MAX_S, 4 * batida_filme) if casada else min(0.6, batida_filme)
    saidas = [x for x in _fronteiras(mapa_a, bpm_a, fase_a, dur_a, ini=False)
              if x[0] >= minimo_a + xf - 1e-6 and x[0] > 0 and (dur_a is None or x[0] <= dur_a - 0.05)]
    if not saidas:
        return None
    alvo = alvo_a if alvo_a is not None else saidas[0][0]

    def custo_saida(x):
        c = abs(x[0] - alvo)
        if not casada:
            c += 1.5 * x[1]          # respiro: troca mais limpa onde A já está baixa
        return c
    t_a, e_fim, _ = min(saidas, key=custo_saida)
    razao_b = razao if casada else 1.0
    entradas = []
    for t_b, _, e_ini in _fronteiras(mapa_b, bpm_b, fase_b, dur_b, ini=True):
        sobra = (dur_b - t_b) if dur_b else float("inf")
        if sobra + 1e-6 < precisa_b * razao_b:
            continue
        entradas.append((abs(e_ini - e_fim) + 0.01 * t_b / 10.0, t_b, e_ini))
    if not entradas:
        return None
    _, t_b, e_ini = min(entradas)
    if casada:
        motivo = f"{tom_a} com {tom_b}, tempo casado ({razao:.3f}x)"
    elif not junta:
        motivo = f"tom não casa ({tom_a or '?'} com {tom_b or '?'}): troca num respiro"
    else:
        def _bpm(x):
            return f"{x:.0f}" if x else "?"           # bpm desconhecido (ou chutado, que o resolvedor zera) não derruba a etapa
        motivo = (f"tempo não casa ({_bpm(tempo_a)} com {_bpm(bpm_b)} bpm, mais de 6%): troca num respiro" if tempo_a and bpm_b
                  else f"tempo desconhecido ({_bpm(tempo_a)} com {_bpm(bpm_b)} bpm): troca num respiro, sem esticar")
    return {"sai_a": t_a, "entra_b": t_b, "modo": "casada" if casada else "respiro", "combina": junta, "tom_a": tom_a, "tom_b": tom_b,
            "razao": razao_b, "xf": round(xf, 3), "energia_a": e_fim, "energia_b": e_ini, "motivo": motivo}
