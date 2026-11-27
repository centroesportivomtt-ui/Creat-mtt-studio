"""Mão na frente da letra: só mãos e braços da pessoa passam por cima do texto da frente; o rosto nunca.

Provado no filme Black do Super Kal (27/11): o dono quer gesto e rosto livres. Texto atrás da pessoa inteira esconde a
legenda sob o tronco; texto por cima esconde o gesto. Aqui a legenda fica na frente do corpo e do rosto, e a mão que cruza
a frase passa por cima dela, com borda suave seguindo a máscara de pessoa.

Como: pele (YCrCb) dentro da máscara de pessoa, em 1/4 da resolução; a maior pele no alto da silhueta é o rosto e sai;
pedaços com menos de 25 px (na grade de 270 px) são ruído de borda e saem; o resto é mão/braço."""
from __future__ import annotations

import numpy as np

AREA_MIN = 25          # px na grade de 270 de largura (mordida de 1 quadro no "2" do 27, revisão de 27/11)
REDUCAO = 4


def _cv2():
    import cv2
    return cv2


def pele_maos(bgr: np.ndarray, a: np.ndarray) -> np.ndarray:
    """Máscara bool (em 1/4 da resolução) de mãos e braços: pele dentro da pessoa, sem o rosto e sem ruído."""
    cv2 = _cv2()
    H, W = a.shape[:2]
    w, h = max(1, W // REDUCAO), max(1, H // REDUCAO)
    peq = cv2.resize(bgr, (w, h), interpolation=cv2.INTER_AREA)
    ap = cv2.resize(a.astype(np.float32), (w, h), interpolation=cv2.INTER_AREA)
    pes = ap > 0.45
    if not pes.any():
        return np.zeros((h, w), bool)
    ycc = cv2.cvtColor(peq, cv2.COLOR_BGR2YCrCb)
    Y, Cr, Cb = ycc[..., 0], ycc[..., 1], ycc[..., 2]
    pele = pes & (Y > 55) & (Cr > 132) & (Cr < 180) & (Cb > 75) & (Cb < 132)
    pele = cv2.morphologyEx(pele.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(pele, 8)
    area_min = AREA_MIN * (w / 270.0) ** 2
    topo = int(np.argmax(pes.any(1)))
    rosto, validos = None, []
    for k in range(1, n):
        x, y, cw, ch, ar = st[k]
        if ar < area_min:
            continue
        validos.append(k)
        if y + ch / 2 < topo + 0.5 * h and cw > 18 * w / 270.0 and (rosto is None or ar > st[rosto][4]):
            rosto = k
    maos = np.isin(lab, [k for k in validos if k != rosto])
    return cv2.dilate(maos.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)


def peso_maos(bgr: np.ndarray, a: np.ndarray, forca: float = 1.0) -> np.ndarray:
    """Peso 0..1 (H x W) de onde a mão fica por cima do texto: máscara ampliada, suavizada e recortada pela pessoa."""
    cv2 = _cv2()
    H, W = a.shape[:2]
    m = pele_maos(bgr, a)
    if not m.any() or forca <= 0:
        return np.zeros((H, W), np.float32)
    h = cv2.resize(m.astype(np.float32), (W, H), interpolation=cv2.INTER_LINEAR)
    h = cv2.GaussianBlur(h, (0, 0), max(1.0, 4.0 * W / 1080.0)) * a.astype(np.float32)
    return np.clip(h * 1.4, 0, 1) * float(min(1.0, forca))


def por_cima(com_texto: np.ndarray, sem_texto: np.ndarray, peso: np.ndarray) -> np.ndarray:
    """Devolve a imagem com o texto, mas com a mão (peso) por cima: sem_texto onde peso = 1."""
    if not peso.any():
        return com_texto
    p = peso[..., None]
    return (com_texto.astype(np.float32) * (1 - p) + sem_texto.astype(np.float32) * p + 0.5).astype(np.uint8)
