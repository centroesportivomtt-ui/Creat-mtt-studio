"""true_peak: pico real (sobreamostragem 4x) do áudio do final <= master.tp (padrão -1 dBTP)."""
ID, BLOQUEIA = "true_peak", True


def checar(c):
    from motor.etapas.montagem.mix import true_peak_db
    x = c.audio_final()
    if len(x) == 0:
        return {"ok": False, "detalhe": "final sem áudio"}
    teto = float((c.edl.get("master") or {}).get("tp", -1.0))
    tp = true_peak_db(x)
    return {"ok": tp <= teto, "valor": round(tp, 2), "detalhe": f"{tp:.2f} dBTP (teto {teto:g})"}
