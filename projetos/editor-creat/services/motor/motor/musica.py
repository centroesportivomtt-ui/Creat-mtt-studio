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
