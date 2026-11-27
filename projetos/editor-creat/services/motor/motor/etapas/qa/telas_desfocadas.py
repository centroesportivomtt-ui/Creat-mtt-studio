"""telas_desfocadas: as caixas `desfocar` dos planos (telas com dados de terceiros) saem ilegíveis no final:
nitidez (variância do Laplaciano) dentro da caixa <= 50% da do resto do quadro, no meio do plano."""
import numpy as np

ID, BLOQUEIA = "telas_desfocadas", True


def checar(c):
    import cv2
    alvos = [p for p in c.edl.get("planos", []) if p.get("desfocar")]
    if not alvos:
        return {"ok": True, "detalhe": "nenhuma tela a desfocar"}
    ruins, val, evid = [], [], []
    for p in alvos:
        t = (p["t0"] + p["t1"]) / 2
        q = c.quadro(t)
        if q is None:
            continue
        g = cv2.cvtColor(q, cv2.COLOR_BGR2GRAY)
        lap = cv2.Laplacian(g, cv2.CV_32F)
        m = np.zeros(g.shape, bool)
        for cx in p["desfocar"]:
            x0, y0, x1, y1 = cx[:4]                        # o 5o valor (opcional) é o sigma do desfoque
            m[int(y0 * c.H):int(y1 * c.H), int(x0 * c.W):int(x1 * c.W)] = True
        if not m.any() or m.all():
            continue
        r = float(lap[m].var() / max(1e-6, lap[~m].var()))
        val.append({"plano": p["id"], "t": round(t, 2), "nitidez_relativa": round(r, 3)})
        if r > 0.5:
            ruins.append(p["id"])
            evid.append(c.salvar_quadro(q, f"tela_{p['id']}.jpg"))
    return {"ok": not ruins, "valor": val, "evidencia": evid,
            "detalhe": f"telas ainda nítidas nos planos {ruins}" if ruins else f"{len(val)} tela(s) desfocada(s)"}
