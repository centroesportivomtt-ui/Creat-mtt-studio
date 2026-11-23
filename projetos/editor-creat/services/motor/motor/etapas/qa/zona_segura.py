"""zona_segura: todo texto do overlay fica dentro da zona segura do Reels (topo 285, base 440, direita 120, esquerda 60 px).

Mede o alfa REAL dos quadros do overlay (amostra a cada 3 quadros) nos instantes em que só há camadas de texto no ar
(legenda, chip, gancho, rótulo, selo...). Camadas de tela cheia (fecho, fundo, transição, HUD) ficam fora da medida.
Tolerância de 16 px (sombra do texto e cantoneiras do chip, que o kit encosta no limite). Evidência: o quadro do pior caso com a zona desenhada.
"""
import os

import numpy as np

ID, BLOQUEIA = "zona_segura", True
ZONA = {"topo": 285, "base": 440, "direita": 120, "esquerda": 60}
TELA_CHEIA = {"fecho", "fecho2", "fundo", "transicao", "hud", "abas", "heroi", "camadas", "pilha", "stats", "papel"}
TOL = 16
CHEIO = 0.95        # quadro com >= 95% do overlay opaco é tela cheia (preto inicial, cartão): não há texto "fora" a medir


def checar(c):
    import cv2
    d = c.overlay_dir
    if not d or not os.path.isdir(d):
        tem_texto = bool(c.edl.get("motion")) or bool((c.edl.get("legendas") or {}).get("palavras"))
        return {"ok": not tem_texto, "bloqueia": tem_texto, "detalhe": "overlay indisponível para medir" if tem_texto else "sem overlay (nada a conferir)"}
    mot = c.edl.get("motion", []) or []
    W, H = c.W, c.H
    x0, x1 = ZONA["esquerda"] - TOL, W - ZONA["direita"] + TOL
    y0, y1 = ZONA["topo"] - TOL, H - ZONA["base"] + TOL
    piores, medidos = [], 0
    cache = {}
    for n in range(0, int(round(c.edl["duracao"] * c.FPS)), 3):
        t = n / c.FPS
        ativos = [m for m in mot if m["de"] <= t < m["ate"]]
        if any(m["modelo"] in TELA_CHEIA for m in ativos):
            continue
        p = os.path.join(d, f"quadro_{n:05d}.png")
        if not os.path.exists(p):
            continue
        ino = os.stat(p).st_ino
        if ino not in cache:
            o = cv2.imread(p, cv2.IMREAD_UNCHANGED)
            if o is None or o.ndim < 3 or o.shape[2] < 4:
                cache[ino] = None
            else:
                a = o[:, :, 3] > 200
                ys, xs = np.where(a.any(1))[0], np.where(a.any(0))[0]
                if a.mean() >= CHEIO:          # caixa = quadro inteiro sempre reprovaria: é grafismo de tela cheia
                    ys = xs = []
                cache[ino] = None if len(ys) == 0 else (int(xs[0]), int(ys[0]), int(xs[-1]), int(ys[-1]))
        bb = cache[ino]
        if bb is None:
            continue
        medidos += 1
        fora = max(x0 - bb[0], bb[2] - x1, y0 - bb[1], bb[3] - y1)
        if fora > 0:
            piores.append((fora, n, bb))
    if not piores:
        return {"ok": True, "valor": {"quadros_medidos": medidos}, "detalhe": f"{medidos} quadros com texto medidos, tudo dentro da zona"}
    piores.sort(reverse=True)
    fora, n, bb = piores[0]
    q = c.quadro(n / c.FPS)
    evid = []
    if q is not None:
        cv2.rectangle(q, (ZONA["esquerda"], ZONA["topo"]), (W - ZONA["direita"], H - ZONA["base"]), (0, 255, 0), 3)
        cv2.rectangle(q, bb[:2], bb[2:], (0, 0, 255), 3)
        evid.append(c.salvar_quadro(q, f"zona_{n:05d}.jpg"))
    return {"ok": False, "valor": {"quadros_fora": len(piores), "pior_px": int(fora), "pior_t": round(n / c.FPS, 2), "caixa": list(bb)},
            "detalhe": f"{len(piores)} quadro(s) com texto fora da zona; pior {fora} px em {n / c.FPS:.2f} s", "evidencia": evid}
