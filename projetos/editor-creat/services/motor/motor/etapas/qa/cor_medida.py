"""cor_medida: a cor de cada plano, medida antes do texto por cima (quadro do meio, montagem), não estoura nem esmaga
e a pele fica na faixa natural do vetorscópio (105° a 145°; a linha de pele é ~123°). Não bloqueia: vira aviso para a
revisão, com o antes/depois do plano como evidência. Se a pele já estava fora antes da cor, o aviso diz isso."""
from motor.etapas import cor as CR

ID, BLOQUEIA = "cor_medida", False
ESTOURO_MAX, ESMAGADO_MAX = 0.04, 0.08


def checar(c):
    itens = getattr(c, "cor", None) or []
    if not itens:
        return {"ok": True, "detalhe": "sem medição de cor (planos sem quadro de revisão)"}
    probs, val = [], []
    for it in itens:
        a, d = it.get("antes") or {}, it.get("depois") or {}
        v = {"plano": it["plano"], "look": it.get("look"), "p50": [a.get("p50"), d.get("p50")],
             "estouro": d.get("estouro"), "esmagado": d.get("esmagado"),
             "pele": [(a.get("pele") or {}).get("angulo"), (d.get("pele") or {}).get("angulo")]}
        val.append(v)
        if (d.get("estouro") or 0) > max(ESTOURO_MAX, (a.get("estouro") or 0) * 1.5):
            probs.append(f"{it['plano']}: altas estouradas ({d['estouro'] * 100:.1f}% do quadro)")
        if (d.get("esmagado") or 0) > max(ESMAGADO_MAX, (a.get("esmagado") or 0) * 1.5):
            probs.append(f"{it['plano']}: pretos esmagados ({d['esmagado'] * 100:.1f}% do quadro)")
        if not CR.pele_ok(d.get("pele")):
            ja = "" if CR.pele_ok(a.get("pele")) else " (já vinha assim do material)"
            probs.append(f"{it['plano']}: pele a {d['pele']['angulo']:.0f}° no vetorscópio{ja}")
    sem = len(getattr(c, "edl", {}).get("planos", [])) - len(itens)
    resto = f" ({sem} plano(s) vieram do cache antigo, sem medição)" if sem > 0 else ""
    return {"ok": not probs, "valor": val,
            "detalhe": ("; ".join(probs[:6]) if probs else f"{len(itens)} plano(s) com cor medida: altas, pretos e pele dentro da faixa") + resto}
