"""tom_sala_sem_voz: o stem 'ambiente' (tom de sala) é transcrito com o nível normalizado; 3 ou mais palavras = tem voz
= reprova (o tom de sala precisa vir de trecho SEM fala; lição de 17/11). Sem transcritor ou com transcrição quebrada:
NÃO VERIFICADO, reprova e bloqueia (a versão não sai sem ouvir)."""
ID, BLOQUEIA = "tom_sala_sem_voz", True


def checar(c):
    ts = c.edl.get("tom_sala")
    if not ts:
        return {"ok": True, "detalhe": "sem tom de sala (só piso de ruído)"}
    cruza = [v["id"] for v in c.edl.get("voz", []) or [] if v["fonte"] == ts["fonte"] and v["s0"] < ts["s1"] and v["s1"] > ts["s0"]]
    arq = c.stems.get("ambiente")
    if cruza:
        return {"ok": False, "bloqueia": True, "valor": {"cruza_voz": cruza}, "detalhe": "tom de sala cruza a fala " + ", ".join(cruza),
                "evidencia": ["stems/ambiente.flac"] if arq else []}
    if not arq:
        return {"ok": False, "bloqueia": True, "detalhe": "NÃO VERIFICADO: o EDL tem tom de sala mas a montagem não gravou o stem 'ambiente'"}
    if ts.get("difuso"):
        # Ambiente sintetizado (espectro médio + fase aleatória): o Whisper alucina em ruído normalizado ("cidade no Brasil"),
        # então a prova é física: sem sílaba não há fala. Envelope de 50 ms com desvio <= 2,5 dB = sem voz.
        from motor.etapas.qa import modulacao_db
        mod = modulacao_db(arq)
        ok = mod <= 2.5
        return {"ok": ok, "valor": {"difuso": True, "modulacao_db": round(mod, 2)},
                "detalhe": f"tom de sala difuso (fase aleatória): modulação do envelope {mod:.1f} dB ({'sem sílabas, sem voz' if ok else 'tem modulação de fala'})",
                "evidencia": [] if ok else ["stems/ambiente.flac"]}
    tr = c.transcrever("stem_ambiente", arq, normalizar_nivel=True)
    falta = c.nao_verificado(tr, "stem ambiente")
    if falta:
        return falta
    pal = c.palavras(tr, conf_min=0.4)
    texto = " ".join(w[2] for w in pal)
    ok = len(pal) < 3 and not cruza
    det = f"stem ambiente transcrito: {len(pal)} palavra(s)" + (f": «{texto[:120]}»" if pal else "")
    if cruza:
        det += f"; o trecho cruza a fala {', '.join(cruza)}"
    return {"ok": ok, "valor": {"palavras": len(pal), "texto": texto[:200], "cruza_voz": cruza}, "detalhe": det,
            "evidencia": ["stems/ambiente.flac"] if not ok else []}
