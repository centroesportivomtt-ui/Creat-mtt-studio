"""Pista dos SONS REAIS (peça M6): o áudio do banco (já no cache, conferido) posto no tempo, no nível e com as emendas certas.

Separada em duas camadas porque o ducking e a "conversa com a música" são diferentes:
- ambiente: passa-altas de 4ª ordem em 90 Hz (não briga com bumbo e baixo), nível em LUFS medido no próprio trecho
  (-28 com fala = 14 dB sob a cama de -14; -24 sem fala), laço com cruzamento de 1,5 s quando o trecho é mais curto que o
  item, entrada e saída em igual potência (1,2 s / 1,5 s; 1,0 s no J-cut entre ambientes, já resolvido no EDL);
- pontual: passa-altas de 2ª ordem em 35 Hz (mantém o peso da tampa batendo), silêncio inicial cortado, o ATAQUE (envelope
  de 10 ms >= pico - 20 dB) cai em t0, pico em `ganho_db` dBFS, entrada de 5 ms e saída de 30 ms.
Estéreo como veio; mono vira dual mono no centro (o cache já entrega 2 canais). DC removido. Nada de rede aqui: os sons
chegam de `motor.sons_reais.carregar`, que só lê o cache.
Teto de ganho: nenhum som sobe mais de +30 dB, e o quase mudo (ambiente < -60 LUFS no trecho, pontual com pico < -50 dBFS)
fica de fora com o motivo em `descartados`: subir uma pausa de gravação viraria chiado alto no filme.
`ambiente_em` = onde o ambiente REAL entrou de fato: o mix abaixa 6 dB o som direto só nesses planos.

`ganho_musica` é o "junto com a música": o ambiente sobe até +4 dB onde a música respira e desce até -4 dB no drop,
seguindo o envelope da trilha (antes do ducking) suavizado em 1,5 s. O ducking sob a voz fica no mix.py (-8 dB no ambiente,
-4 dB no pontual, o mesmo envelope `g` e as mesmas rampas da trilha).
"""
from __future__ import annotations

import numpy as np

from motor.etapas.montagem.comum import SR

LACO_XF_S = 1.5
HPF_AMBIENTE = (4, 90.0)
HPF_PONTUAL = (2, 35.0)
MUSICA_MAX_DB = 4.0
MUSICA_SUAVE_S = 1.5
ATAQUE_DB = 20.0
PRE_ATAQUE_S = 0.005
GANHO_MAX_DB = 30.0
NIVEL_MIN_LUFS = -60.0
PICO_MIN_DB = -50.0


def _hpf(x: np.ndarray, ordem: int, fc: float) -> np.ndarray:
    from scipy.signal import butter, sosfilt
    x = x - x.mean(0, keepdims=True)
    sos = butter(ordem, fc, "hp", fs=SR, output="sos")
    return sosfilt(sos, x, axis=0).astype(np.float32)


def _st(x: np.ndarray) -> np.ndarray:
    if x.ndim == 1:
        x = x[:, None]
    return np.repeat(x[:, :1], 2, axis=1) if x.shape[1] == 1 else x[:, :2]


def lacar(x: np.ndarray, n: int, xf_s: float = LACO_XF_S) -> np.ndarray:
    """x em laço até n amostras, cada volta cruzando xf_s com a anterior em igual potência (sem degrau, sem bombear)."""
    if len(x) >= n:
        return x[:n].copy()
    xf = max(1, min(int(round(xf_s * SR)), len(x) // 3))
    u = np.linspace(0.0, np.pi / 2, xf, dtype=np.float64)
    sobe, desce = np.sin(u).astype(np.float32)[:, None], np.cos(u).astype(np.float32)[:, None]
    out = np.zeros((n, x.shape[1]), np.float32)
    pos, k = 0, 0
    while pos < n:
        seg = x.copy()
        if k > 0:
            seg[:xf] *= sobe
        prox = pos + len(seg) - xf
        if prox < n:
            seg[-xf:] *= desce
        m = min(len(seg), n - pos)
        out[pos:pos + m] += seg[:m]
        pos, k = prox, k + 1
    return out


def lufs(x: np.ndarray) -> float:
    try:
        import pyloudnorm as pyln
        if len(x) > int(0.45 * SR):
            v = float(pyln.Meter(SR).integrated_loudness(x.astype(np.float64)))
            if np.isfinite(v):
                return v
    except Exception:  # noqa: BLE001
        pass
    r = float(np.sqrt(np.mean(x.astype(np.float64) ** 2)))
    return 20 * np.log10(max(r, 1e-9)) - 0.691


def ataque(x: np.ndarray) -> int:
    """Primeira amostra em que o envelope de 10 ms chega a pico - 20 dB."""
    m = np.abs(x).max(1) if x.ndim == 2 else np.abs(x)
    h = max(1, int(0.01 * SR))
    env = np.sqrt(np.convolve(m.astype(np.float64) ** 2, np.ones(h) / h, "same"))
    pk = float(env.max())
    if pk <= 0:
        return 0
    return int(np.argmax(env >= pk * 10 ** (-ATAQUE_DB / 20)))


def _fades(x: np.ndarray, ent: int, sai: int) -> np.ndarray:
    n = len(x)
    ent, sai = min(ent, n // 2), min(sai, n // 2)
    if ent > 0:
        x[:ent] *= np.sin(np.linspace(0.0, np.pi / 2, ent)).astype(np.float32)[:, None]
    if sai > 0:
        x[n - sai:] *= np.cos(np.linspace(0.0, np.pi / 2, sai)).astype(np.float32)[:, None]
    return x


def _somar(dest: np.ndarray, x: np.ndarray, a: int) -> tuple[int, int]:
    if a < 0:
        x, a = x[-a:], 0
    n = min(len(x), len(dest) - a)
    if n > 0:
        dest[a:a + n] += x[:n]
    return a, max(0, n)


def pista(edl: dict, carregados: list[dict], N: int) -> tuple[dict, dict]:
    """Sons carregados -> {"ambiente": (N, 2), "pontual": (N, 2), "ambiente_em": [(t0, t1)]} + relatório (onde e com que
    nível cada um entrou; `descartados` = o que ficou de fora por nível)."""
    amb = np.zeros((N, 2), np.float32)
    pont = np.zeros((N, 2), np.float32)
    rel, fora = [], []
    for c in carregados:
        it = c["item"]
        x = _st(np.asarray(c["audio"], np.float32))
        if len(x) < int(0.02 * SR):
            continue
        t0, t1 = float(it["t0"]), float(it["t1"])
        fi, fo = (float(v) for v in (it.get("fade") or [0.0, 0.0]))
        if it["papel"] == "ambiente":
            x = _hpf(x, *HPF_AMBIENTE)
            n = int(round((t1 - t0) * SR))
            if n <= 0:
                continue
            laco = len(x) < n
            x = lacar(x, n)
            nivel = lufs(x)
            if nivel < NIVEL_MIN_LUFS:
                fora.append({"id": it["id"], "id_banco": c["id_banco"], "motivo": f"trecho quase mudo ({nivel:.0f} LUFS)"})
                continue
            g_db = min(GANHO_MAX_DB, float(it["ganho_db"]) - nivel)
            x = x * np.float32(10 ** (g_db / 20))
            x = _fades(x, int(round(fi * SR)), int(round(fo * SR)))
            a, n2 = _somar(amb, x, int(round(t0 * SR)))
            rel.append({"id": it["id"], "papel": "ambiente", "id_banco": c["id_banco"], "t0": round(a / SR, 3), "t1": round((a + n2) / SR, 3),
                        "ganho_db": round(g_db, 2), "laco": laco})
        else:
            x = _hpf(x, *HPF_PONTUAL)
            at = ataque(x)
            pre = int(round(PRE_ATAQUE_S * SR))
            ini = max(0, at - pre)
            n = int(round((t1 - t0) * SR)) + (at - ini)
            x = x[ini:ini + max(1, n)].copy()
            pk = float(np.abs(x).max()) if len(x) else 0.0
            if pk <= 10 ** (PICO_MIN_DB / 20):
                fora.append({"id": it["id"], "id_banco": c["id_banco"], "motivo": f"sem pancada (pico {20 * np.log10(max(pk, 1e-10)):.0f} dBFS)"})
                continue
            g_db = min(GANHO_MAX_DB, float(it["ganho_db"]) - 20 * np.log10(pk))
            x = x * np.float32(10 ** (g_db / 20))
            x = _fades(x, int(round(fi * SR)), int(round(fo * SR)))
            a, n2 = _somar(pont, x, int(round(t0 * SR)) - (at - ini))
            rel.append({"id": it["id"], "papel": "pontual", "id_banco": c["id_banco"], "ataque_t": round(t0, 3), "t0": round(a / SR, 3),
                        "t1": round((a + n2) / SR, 3), "ganho_db": round(g_db, 2)})
    ambiente_em = [(s["t0"], s["t1"]) for s in rel if s["papel"] == "ambiente"]
    return {"ambiente": amb, "pontual": pont, "ambiente_em": ambiente_em}, {"sons": rel, **({"descartados": fora} if fora else {})}


def ganho_musica(trilha: np.ndarray, N: int) -> np.ndarray:
    """Ganho linear (N,) do ambiente seguindo a música: +4 dB no respiro, -4 dB no drop, suavizado em 1,5 s. Sem música: 1."""
    from scipy.ndimage import uniform_filter1d
    if trilha is None or len(trilha) == 0 or float(np.abs(trilha).max()) < 1e-6:
        return np.ones(N, np.float32)
    m = trilha.mean(1) if trilha.ndim == 2 else trilha
    h = int(0.05 * SR)
    nh = max(1, len(m) // h)
    rms = np.sqrt(np.mean(m[:nh * h].astype(np.float64).reshape(nh, h) ** 2, 1) + 1e-12)
    db = 20 * np.log10(rms)
    ativo = db > -60
    if not ativo.any():
        return np.ones(N, np.float32)
    med = float(np.median(db[ativo]))
    g = np.clip((med - db) * 0.5, -MUSICA_MAX_DB, MUSICA_MAX_DB)
    g = uniform_filter1d(g, max(1, int(round(MUSICA_SUAVE_S / 0.05))), mode="nearest")
    t = (np.arange(nh) + 0.5) * 0.05
    return (10 ** (np.interp(np.arange(N) / SR, t, g) / 20)).astype(np.float32)
