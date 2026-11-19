"""voz_externa: a peça do apresentador não leva fala de quem está dirigindo a gravação (pedido do dono em 19/11).

Cada peça de voz do EDL é lida da FONTE e ganha uma assinatura de voz (motor/etapas/falante.py). A voz principal é a de
mais tempo de fala. Uma peça é "de outra voz" quando fica longe da principal: cosseno < 0,42 em peça de 2 s ou mais.
Peça curta (0,45 a 2 s) engana a assinatura (medido em 19/11: a mesma voz dizendo "Vem!" deu 0,39), então pede uma segunda
pista: além do cosseno baixo, a altura da voz (grave/agudo) tem de estar 20% ou mais longe da voz principal, ou o
cosseno tem de ser muito baixo (< 0,15).
- pedido diz "uma voz só" (origem.vozes = "uma"): qualquer peça de outra voz reprova;
- pedido diz "várias" : não reprova, só relata;
- automático: reprova quando a voz principal tem 65% ou mais do tempo de fala (o resto é intruso: "vai", "de novo",
  "isso"); com as vozes equilibradas é conversa/entrevista e passa.
Sem o modelo de voz o QA não passa calado: NÃO VERIFICADO segura a entrega.
"""
import numpy as np

ID, BLOQUEIA = "voz_externa", True
CURTA, MINIMA = 2.0, 0.45
LIM_CURTA = 0.15
TOM_LONGE = 0.20
PRINCIPAL_MIN = 0.65


def _assinador(c):
    if getattr(c, "_assinador", None) is None:
        from motor.etapas.falante import Assinador
        c._assinador = Assinador(c.cfg)
    return c._assinador


def checar(c):
    from motor.etapas import falante as F
    from motor.etapas.montagem.comum import ler_audio
    voz = sorted(c.edl.get("voz", []) or [], key=lambda v: v["t0"])
    if not voz:
        return {"ok": True, "detalhe": "filme sem fala"}
    if c.fontes is None:
        return {"ok": True, "detalhe": "sem as fontes para ouvir (teste/legado): voz externa não conferida"}
    modo = str((c.edl.get("origem") or {}).get("vozes") or "auto")
    a = _assinador(c)
    if not a.disponivel:
        return {"ok": False, "bloqueia": True,
                "detalhe": "NÃO VERIFICADO: modelo de voz indisponível neste motor; a versão não é entregue sem conferir de quem é cada fala"}
    assin, durs, tons = [], [], []
    for v in voz:
        dur = float(v["s1"]) - float(v["s0"])
        try:
            x = ler_audio(c.fontes.audio(v["fonte"]), float(v["s0"]) - c.fontes.offset(v["fonte"]), dur, sr=F.SR, cfg=c.cfg)
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "bloqueia": True, "detalhe": f"NÃO VERIFICADO: não consegui ler o áudio da fonte '{v['fonte']}' ({type(e).__name__})"}
        x = np.asarray(x, np.float32).reshape(-1)
        assin.append(a.assinar(x, F.SR, minimo=MINIMA))
        tons.append(F.tom_hz(x, F.SR))
        durs.append(dur)
    g = F.agrupar(assin, durs)
    total = sum(d for d, s in zip(durs, assin) if s is not None)
    if g["principal"] is None or total <= 0:
        return {"ok": True, "detalhe": "falas curtas demais para identificar a voz (menos de 0,45 s cada)"}
    fatia = g["tempo"][g["principal"]] / total
    do_principal = [(tm, d) for tm, d, gr in zip(tons, durs, g["grupos"]) if gr == g["principal"] and tm]
    tom_ref = float(np.median([tm for tm, d in do_principal if d >= CURTA] or [tm for tm, _ in do_principal])) if do_principal else None
    fora, val = [], []
    for v, d, tm, prox in zip(voz, durs, tons, g["proximidade"]):
        item = {"voz": v["id"], "t": round(float(v["t0"]), 2), "dur": round(d, 2), "proximidade": prox, "tom_hz": tm}
        longe = prox is not None and prox < F.LIMIAR
        if longe and d < CURTA:                                 # trecho curto: precisa da segunda pista
            tom_diz = bool(tm and tom_ref and abs(tm / tom_ref - 1.0) >= TOM_LONGE)
            longe = tom_diz or prox < LIM_CURTA
        if longe:
            item["outra_voz"] = True
            fora.append((v, d, prox))
        val.append(item)
    sem = sum(1 for s in assin if s is None)
    resumo = f"voz principal com {fatia:.0%} do tempo de fala" + (f"; {sem} peça(s) curta(s) demais para conferir" if sem else "")
    if not fora:
        return {"ok": True, "valor": val, "detalhe": f"{len(voz) - sem} fala(s) conferida(s), todas da mesma voz ({resumo})"}
    lista = "; ".join(f"{v['id']} aos {v['t0']:.1f} s «{str(v.get('texto') or '')[:40]}» (semelhança {p:.2f})" for v, _d, p in fora[:5])
    if modo == "varias":
        return {"ok": True, "valor": val, "detalhe": f"{len(fora)} fala(s) de outra voz, permitido pelo pedido (várias pessoas falam): {lista}"}
    if modo != "uma" and fatia < PRINCIPAL_MIN:
        return {"ok": True, "valor": val, "detalhe": f"várias vozes com tempo equilibrado ({resumo}): tratado como conversa. Se for peça de uma pessoa só, marque no pedido"}
    return {"ok": False, "valor": val,
            "detalhe": f"{len(fora)} fala(s) de outra voz na peça ({resumo}): {lista}. Se outras pessoas falam de propósito, marque 'várias pessoas falam' no pedido"}
