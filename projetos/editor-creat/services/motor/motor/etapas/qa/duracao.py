"""duracao: o vídeo final tem a duração do EDL (tolerância de 1 quadro)."""
ID, BLOQUEIA = "duracao", True


def checar(c):
    v = c.stream("video") or {}
    dv = float(v.get("duration") or c.probe().get("format", {}).get("duration") or 0)
    alvo = float(c.edl["duracao"])
    tol = 1.0 / c.FPS + 0.01
    return {"ok": abs(dv - alvo) <= tol, "valor": {"video_s": round(dv, 3), "edl_s": alvo},
            "detalhe": f"vídeo {dv:.3f} s, EDL {alvo:.3f} s"}
