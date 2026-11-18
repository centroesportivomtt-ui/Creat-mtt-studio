"""lufs: loudness integrado do áudio DO ARQUIVO FINAL (depois do AAC) = master.lufs ± 0,5 (padrão -14)."""
import numpy as np

ID, BLOQUEIA = "lufs", True


def checar(c):
    import pyloudnorm as pyln
    from motor.etapas.montagem.comum import SR
    x = c.audio_final()
    if len(x) < SR // 2:
        return {"ok": False, "detalhe": "final sem áudio"}
    alvo = float((c.edl.get("master") or {}).get("lufs", -14))
    lf = float(pyln.Meter(SR).integrated_loudness(x.astype(np.float64)))
    return {"ok": abs(lf - alvo) <= 0.5, "valor": round(lf, 2), "detalhe": f"{lf:.2f} LUFS (alvo {alvo:g} ± 0,5)"}
