"""TRILHA e SFX.

Trilha (V1/py/trilha2.py + corte por meios-compassos do V2/py/mix.py, como biblioteca):
- `emendas` [[t_filme, s_de, s_ate, xf], ...]: cada trecho da trilha entra em t_filme com crossfade de igual potência `xf` s;
  é assim que o acorde final cai na logo (trecho do fim da música colado no ponto certo) — curva emocional de verdade, não laço;
- sem emendas e com `bpm`: a música toca do começo e, se for mais curta que o filme, emenda no início de um compasso
  (na batida, fase `fase`) com crossfade curto; se for mais longa, sai com fade no fim do filme;
- `chave` nula = filme sem música (só voz, SFX e ambiente).

SFX: procura `<som>.wav` em MK_SOM/sfx/ (biblioteca licenciada, fora do git). Sem a biblioteca, sintetiza uma versão
determinística do som pelo nome (whoosh, hit/boom, pop, tick, riser, glitch, swish, stamp…) para o motor nunca parar.
"""
from __future__ import annotations

import pathlib

import numpy as np

from motor.etapas.montagem.comum import SR


def _st(x: np.ndarray) -> np.ndarray:
    return np.stack([x, x], 1) if x.ndim == 1 else x[:, :2]


def ler_trilha(arq: pathlib.Path) -> np.ndarray:
    import soundfile as sf
    x, sr = sf.read(str(arq), dtype="float32", always_2d=True)
    x = _st(x if x.shape[1] > 1 else x[:, 0])
    if sr != SR:
        from scipy.signal import resample_poly
        from math import gcd
        g = gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g, axis=0).astype(np.float32)
    return x


def montar_trilha(edl: dict, arq: pathlib.Path | None) -> tuple[np.ndarray, dict]:
    N = int(round(edl["duracao"] * SR))
    out = np.zeros((N, 2), np.float32)
    tr = edl.get("trilha", {}) or {}
    if arq is None:
        return out, {"musica": False}
    m = ler_trilha(arq)
    emendas = tr.get("emendas") or []
    rel = {"musica": True, "dur_trilha": round(len(m) / SR, 2), "emendas": len(emendas)}
    if emendas:
        for k, (tf, sa, sb, xf) in enumerate(emendas):
            a, b = int(round(sa * SR)), min(len(m), int(round(sb * SR)))
            seg = m[max(0, a):b].copy()
            if len(seg) == 0:
                continue
            nx = max(1, int(round(max(xf, 0.005) * SR)))
            d0 = int(round(tf * SR))
            if k > 0:                                   # entra no crossfade (igual potência), recuando nx
                pre_a = max(0, a - nx)
                seg = np.concatenate([m[pre_a:a], seg])
                d0 -= (a - pre_a)
                w = np.sin(np.linspace(0, np.pi / 2, a - pre_a)) ** 2
                seg[: a - pre_a] *= w[:, None]
            if k < len(emendas) - 1:                    # sai no crossfade
                prox = int(round(emendas[k + 1][0] * SR))
                fim = prox - d0
                if fim > 0:
                    seg = seg[:fim]
                    z = min(nx, len(seg))
                    seg[-z:] *= (np.cos(np.linspace(0, np.pi / 2, z)) ** 2)[:, None]
            if d0 < 0:
                seg, d0 = seg[-d0:], 0
            n = min(len(seg), N - d0)
            if n > 0:
                out[d0:d0 + n] += seg[:n]
    else:
        pos, fonte = 0, 0
        bpm, fase = tr.get("bpm"), float(tr.get("fase", 0) or 0)
        while pos < N and len(m) > 0:
            n = min(len(m) - fonte, N - pos)
            if n <= int(0.06 * SR):
                break
            seg = m[fonte:fonte + n].copy()
            if pos > 0:
                z = min(int(0.03 * SR), len(seg))
                seg[:z] *= (np.sin(np.linspace(0, np.pi / 2, z)) ** 2)[:, None]
            out[pos:pos + n] += seg
            pos += n
            if pos < N:                                 # emenda na batida: volta para o início de um compasso
                fonte = int(round(fase * SR)) if bpm else 0
                pos -= int(0.03 * SR)
        rel["laco"] = len(m) < N
    fim = int(1.4 * SR)                                # sem acorde final marcado, a música sai devagar (0,5 s soava interrompida)
    if N > fim and np.abs(out[-fim:]).max() > 0 and not tr.get("acorde_final"):
        out[-fim:] *= (np.linspace(1, 0, fim) ** 1.5)[:, None]
    return out, rel


# ---------------------------------------------------------------- SFX
def _ruido(n: int, seed: int) -> np.ndarray:
    return np.random.default_rng(seed).standard_normal(n).astype(np.float32)


def sintetizar(nome: str) -> np.ndarray:
    """Som de reserva determinístico pelo nome (só quando a biblioteca MK_SOM não está nesta máquina)."""
    from scipy.signal import butter, sosfilt
    n0 = nome.lower()
    seed = sum(map(ord, n0))
    if any(k in n0 for k in ("hit", "boom", "impacto", "stamp", "clang", "grave")):
        n = int(0.9 * SR)
        t = np.arange(n) / SR
        f = 48 + 60 * np.exp(-t * 18)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5.5)
        x += 0.35 * sosfilt(butter(2, 2500, "lp", fs=SR, output="sos"), _ruido(n, seed)) * np.exp(-t * 30)
    elif any(k in n0 for k in ("riser", "reverse")):
        dur = 4.0 if "4" in n0 else 2.0
        n = int(dur * SR)
        t = np.arange(n) / SR
        x = sosfilt(butter(2, [400, 6000], "bp", fs=SR, output="sos"), _ruido(n, seed)) * (t / dur) ** 2
    elif any(k in n0 for k in ("pop", "tick", "ui")):
        n = int(0.08 * SR)
        t = np.arange(n) / SR
        x = np.sin(2 * np.pi * (1800 if "tick" in n0 else 900) * t) * np.exp(-t * 70)
    elif "glitch" in n0:
        n = int(0.35 * SR)
        x = np.sign(np.sin(2 * np.pi * 220 * np.arange(n) / SR)) * (np.random.default_rng(seed).random(n) > 0.6) * 0.5
    elif "heart" in n0:
        n = int(1.2 * SR)
        t = np.arange(n) / SR
        x = sum(np.sin(2 * np.pi * 55 * (t - a)) * np.exp(-np.clip(t - a, 0, None) * 14) * (t >= a) for a in (0.0, 0.28))
    else:                                               # whoosh / swish: ruído com varredura de banda
        dur = 1.1 if "longo" in n0 else 0.45
        n = int(dur * SR)
        t = np.arange(n) / SR
        env = np.sin(np.pi * t / dur) ** 2
        x = np.zeros(n, np.float32)
        r = _ruido(n, seed)
        for k, fc in enumerate(np.linspace(500, 5000, 8)):
            a, b = k * n // 8, (k + 1) * n // 8
            x[a:b] = sosfilt(butter(2, [fc * 0.6, fc * 1.4], "bp", fs=SR, output="sos"), r)[a:b]
        x = x * env
    x = np.asarray(x, np.float32)
    x /= max(1e-6, float(np.abs(x).max()))
    return (x * 10 ** (-1 / 20)).astype(np.float32)


_SFX: dict = {}


def som(nome: str, biblioteca: str | None) -> tuple[np.ndarray, str]:
    cands = [p for p in ((pathlib.Path(biblioteca) / "sfx" / f"{nome}.wav", pathlib.Path(biblioteca) / f"{nome}.wav") if biblioteca else ())
             if p.exists()]
    chave = (nome, str(cands[0]), cands[0].stat().st_mtime) if cands else (nome, None, None)   # som novo na biblioteca vale sem reiniciar
    if chave in _SFX:
        return _SFX[chave]
    origem = "sintetico"
    x = None
    if cands:
        for p in cands[:1]:
            if p.exists():
                import soundfile as sf
                x, sr = sf.read(str(p), dtype="float32", always_2d=True)
                if sr != SR:
                    from scipy.signal import resample_poly
                    x = resample_poly(x, SR, sr, axis=0).astype(np.float32)
                x = _st(x if x.shape[1] > 1 else x[:, 0])
                origem = "biblioteca"
                break
    if x is None:
        x = _st(sintetizar(nome))
    _SFX[chave] = (x, origem)
    return _SFX[chave]


def montar_sfx(edl: dict, biblioteca: str | None) -> tuple[np.ndarray, dict]:
    N = int(round(edl["duracao"] * SR))
    fx = np.zeros((N, 2), np.float32)
    origens = {}
    fps = float(edl.get("formato", {}).get("fps", 30))
    for c in edl.get("sfx", []) or []:
        x, origem = som(c["som"], biblioteca)
        origens[c["som"]] = origem
        pan = float(c.get("pan", 0) or 0)
        g = 10 ** ((float(c.get("g", -8)) - 1.0) / 20)
        x = x * g * np.array([np.sqrt(0.5 - pan / 2) * 1.414, np.sqrt(0.5 + pan / 2) * 1.414], np.float32)
        i = int(round(max(0.0, c["t"] + 1 / fps) * SR))   # 1 quadro depois: o som casa com o quadro do corte
        n = min(len(x), N - i)
        if n > 0:
            fx[i:i + n] += x[:n]
    return fx, {"sfx": len(edl.get("sfx", []) or []), "origens": origens}
