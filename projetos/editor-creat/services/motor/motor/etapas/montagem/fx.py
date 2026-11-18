"""FX: transições e efeitos de impacto aplicados quadro a quadro na composição (V2 comp.whip + V1 fx.py, como biblioteca).

Cada efeito do EDL `fx[]` = {tipo, t, dur?, forca?, dir?}. Os efeitos são funções puras (quadro BGR uint8 -> quadro) e
só tocam os quadros dentro da sua janela; fora dela o quadro passa intacto (custo zero).
- whip: chicote horizontal (desloca + borra na direção), máximo junto do corte (V2, aprovado);
- flash / impacto (tremor + flash curto) / zoomt (soco de zoom) / bloom (brilho nas altas luzes) / leak (vazamento de luz quente);
- rush (borrão radial de mergulho) / gagueira (quadro repetido em ritmo) / foto (clique: flash + dessatura) / fade (do/para preto);
- aba71 e mascara: o desenho fica no overlay (camada `transicao` do kit); aqui entra o mergulho de câmera que casa com ele;
- match: corte casado, nada a fazer na imagem.
"""
from __future__ import annotations

import math

import numpy as np

PADRAO_DUR = {"whip": 0.33, "flash": 0.25, "impacto": 0.30, "zoomt": 0.40, "bloom": 0.5, "leak": 0.9, "rush": 0.35,
              "gagueira": 0.4, "foto": 0.3, "fade": 0.5, "aba71": 0.8, "mascara": 0.5, "match": 0.0}


def _cv2():
    import cv2
    return cv2


def janela(e: dict) -> tuple[float, float]:
    """Intervalo (s) em que o efeito mexe na imagem."""
    d = float(e.get("dur") or PADRAO_DUR.get(e["tipo"], 0.3))
    t = float(e["t"])
    if e["tipo"] in ("whip", "aba71", "mascara", "rush"):
        return t - d / 2, t + d / 2
    if e["tipo"] == "fade" and t < 0.1:
        return 0.0, d
    return t, t + d


def _escala(img, s: float, dx: float = 0.0, dy: float = 0.0):
    cv2 = _cv2()
    h, w = img.shape[:2]
    M = np.float32([[s, 0, (1 - s) * w / 2 + dx], [0, s, (1 - s) * h / 2 + dy]])
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def aplicar(img, tt: float, efeitos: list[dict], historico: list) -> np.ndarray:
    cv2 = _cv2()
    for e in efeitos:
        a, b = janela(e)
        if not (a <= tt < b):
            continue
        tipo, f = e["tipo"], float(e.get("forca") or 1.0)
        t = float(e["t"])
        d = max(1e-3, b - a)
        u = (tt - a) / d                                   # 0..1 dentro da janela
        if tipo == "whip":
            antes = tt < t
            k = max(0.0, 1 - abs(tt - t) / (d / 2)) ** 1.6
            if k > 0.02:
                dr = float(e.get("dir") or 1)
                img = cv2.warpAffine(img, np.float32([[1, 0, dr * k * 420 * f * (1 if antes else -1)], [0, 1, 0]]),
                                     (img.shape[1], img.shape[0]), borderMode=cv2.BORDER_REPLICATE)
                kk = int(k * 150 * f) | 1
                if kk > 1:
                    img = cv2.blur(img, (kk, 1))
        elif tipo in ("flash", "foto"):
            k = f * (1 - u) ** 1.5
            if tipo == "foto":
                g = cv2.cvtColor(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
                img = cv2.addWeighted(img, 1 - 0.7 * (1 - u), g, 0.7 * (1 - u), 0)
            img = np.clip(img.astype(np.float32) * (1 + k * 0.6) + 255 * k * 0.55, 0, 255).astype(np.uint8)
        elif tipo == "impacto":
            k = (1 - u) ** 2
            rng = np.random.default_rng(int(tt * 1000))
            img = _escala(img, 1 + 0.03 * f * k, *(rng.uniform(-1, 1, 2) * 26 * f * k))
            if u < 0.35:
                kf = 0.5 * f * (1 - u / 0.35)
                img = np.clip(img.astype(np.float32) * (1 + kf * 0.5) + 255 * kf * 0.35, 0, 255).astype(np.uint8)
        elif tipo == "zoomt":
            img = _escala(img, 1 + 0.08 * f * math.sin(math.pi * min(1.0, u * 1.6)) ** 2 if u < 0.62 else 1 + 0.08 * f * (1 - (u - 0.62) / 0.38) ** 2)
        elif tipo == "bloom":
            k = f * math.sin(math.pi * u)
            hi = cv2.GaussianBlur(np.clip(img.astype(np.int16) - 170, 0, 255).astype(np.uint8), (0, 0), 28)
            img = cv2.addWeighted(img, 1.0, hi, 1.4 * k, 0)
        elif tipo == "leak":
            h, w = img.shape[:2]
            k = f * math.sin(math.pi * u) * 0.55
            x = np.linspace(-1, 1, w, dtype=np.float32)[None, :] - (u * 2.4 - 1.2)
            y = np.linspace(-1, 1, h, dtype=np.float32)[:, None] * 0.35
            m = np.exp(-(x ** 2 + y ** 2) / 0.18)[:, :, None] * k
            img = np.clip(img.astype(np.float32) + m * np.array([60, 150, 255], np.float32), 0, 255).astype(np.uint8)
        elif tipo == "rush":
            k = f * (1 - abs(tt - t) / (d / 2))
            acc = img.astype(np.float32)
            for s in (1 + 0.025 * k, 1 + 0.05 * k, 1 + 0.08 * k):
                acc += _escala(img, s).astype(np.float32)
            img = (acc / 4).astype(np.uint8)
        elif tipo == "gagueira":
            fase = int(u * d * 30) % 4
            if fase in (1, 2) and historico:
                img = historico[-fase].copy() if len(historico) >= fase else img
        elif tipo == "fade":
            k = u if (t < 0.1) else (1 - u)
            img = (img.astype(np.float32) * max(0.0, min(1.0, k))).astype(np.uint8)
        elif tipo in ("aba71", "mascara"):
            k = 1 - abs(tt - t) / (d / 2)
            if tt < t:                                     # mergulho de câmera até o corte
                img = _escala(img, 1 + 0.35 * f * k ** 2)
            else:                                          # íris abre a cena nova
                h, w = img.shape[:2]
                r = (1 - k) * math.hypot(w, h) / 2
                yy, xx = np.ogrid[:h, :w]
                mask = ((xx - w / 2) ** 2 + (yy - h / 2) ** 2 <= r * r).astype(np.uint8)
                img = img * mask[:, :, None]
    return img


def ativos(efeitos: list[dict], tt: float) -> bool:
    return any(janela(e)[0] <= tt < janela(e)[1] for e in efeitos)


def janelas_escuras(efeitos: list[dict]) -> list[tuple[float, float]]:
    """Intervalos em que o preto é intencional (fade e íris da aba71): o QA de quadros pretos não reprova neles."""
    return [janela(e) for e in efeitos if e["tipo"] in ("fade", "aba71", "mascara")]
