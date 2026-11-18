"""legenda_x_fala: só legenda o que foi dito.
1) estrutural (sempre): cada palavra da legenda cai dentro de uma peça de voz do EDL;
2) de ouvido (com transcritor): >= 70% das palavras da legenda (3+ letras) aparecem na transcrição do mix final, a ±1 s.
"""
ID, BLOQUEIA = "legenda_x_fala", True


def checar(c):
    from motor.etapas.qa import normalizar
    leg = c.palavras_legenda()
    if not leg:
        return {"ok": True, "detalhe": "filme sem legenda"}
    voz = c.edl.get("voz", []) or []
    soltas = [w for w in leg if not any(v["t0"] - 0.15 <= w[0] and w[1] <= v["t1"] + 0.15 for v in voz)]
    det, val = [], {"palavras_legenda": len(leg), "fora_da_voz": [w[2] for w in soltas][:10]}
    ok = not soltas
    if soltas:
        det.append(f"{len(soltas)} palavra(s) de legenda fora de qualquer fala: {[w[2] for w in soltas][:6]}")
    tr = c.transcrever("mix", c.mix if c.mix is not None else c.final)
    if tr is None:
        det.append("transcritor indisponível: conferido só pela estrutura")
    else:
        ouvidas = c.palavras(tr)
        alvo = [(w[0], normalizar(w[2])) for w in leg if len(normalizar(w[2])) >= 3]
        achou = [t for t, n in alvo if any(o[2] == n and abs(o[0] - t) <= 1.0 for o in ouvidas)]
        rec = len(achou) / max(1, len(alvo))
        val.update(recall=round(rec, 2), conferidas=len(alvo))
        if alvo and rec < 0.7:
            ok = False
        det.append(f"{len(achou)}/{len(alvo)} palavras da legenda ouvidas no mix ({rec:.0%})")
    return {"ok": ok, "valor": val, "detalhe": "; ".join(det)}
