"""legenda_sobre_rosto (aviso, não bloqueia): legenda cobrindo o miolo do rosto (olhos à boca). V2/py/qa_rosto.py com o
detector da frente A (YuNet; Haar se configurado). Amostra 2 por segundo só onde há legenda."""
import os

import numpy as np

ID, BLOQUEIA = "legenda_sobre_rosto", False


def checar(c):
    import cv2
    leg = c.palavras_legenda()
    if not leg or not c.overlay_dir:
        return {"ok": True, "detalhe": "sem legenda ou sem overlay"}
    try:
        from motor.provedores.visao_local import DetectorRostos
        det = DetectorRostos(c.cfg)
    except Exception as e:  # noqa: BLE001
        return {"ok": True, "detalhe": f"detector de rosto indisponível ({e})"}
    if det.nome == "nenhum":
        return {"ok": True, "detalhe": "detector de rosto indisponível (NÃO VERIFICADO)"}
    achados, amostras = [], 0
    t = leg[0][0]
    fim = leg[-1][1]
    while t <= fim:
        if any(w[0] - 0.05 <= t <= w[1] + 0.3 for w in leg):
            n = int(round(t * c.FPS))
            p = os.path.join(c.overlay_dir, f"quadro_{n:05d}.png")
            o = cv2.imread(p, cv2.IMREAD_UNCHANGED) if os.path.exists(p) else None
            q = c.quadro(t) if o is not None and o.ndim == 3 and o.shape[2] == 4 else None
            if q is not None:
                amostras += 1
                a = o[:, :, 3] > 128
                for x, y, w, h, _ in det.detectar(cv2.resize(q, (540, 960))):
                    x0, x1 = int((x + w * 0.2) * c.W), int((x + w * 0.8) * c.W)
                    y0, y1 = int((y + h * 0.25) * c.H), int((y + h * 0.85) * c.H)
                    cob = a[max(0, y0):y1, max(0, x0):x1].mean() if (x1 > x0 and y1 > y0) else 0
                    if cob > 0.08:
                        achados.append({"t": round(t, 2), "cobertura": round(float(cob), 2)})
        t += 0.5
    evid = []
    if achados:
        q = c.quadro(achados[0]["t"])
        if q is not None:
            evid.append(c.salvar_quadro(q, f"rosto_{achados[0]['t']:.1f}.jpg"))
    return {"ok": not achados, "valor": achados[:10], "evidencia": evid,
            "detalhe": f"{len(achados)} cruzamento(s) legenda x rosto em {amostras} amostras ({det.nome})"}
