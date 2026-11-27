"""fatos: todo número de produto que aparece na tela (legenda ou cartão) tem fonte conferida (regra do dono, 21/11).
Lê o relatório que a montagem gravou em edl.qa.fatos (motor/etapas/fatos.py). Número sem fonte ou conferência que falhou
vira AVISO bem visível (não trava): o dono usa o editor sozinho e não tem como liberar uma trava sem o Claude (23/11). A
correção do número errado na tela continua automática.
O dono libera um número à mão em edl.qa.numeros_confirmados.
"""
ID, BLOQUEIA = "fatos", False


def checar(c):
    from motor.etapas import fatos as F
    qa = c.edl.get("qa") or {}
    rel = qa.get("fatos")
    def chave(x):                                  # "275ml", "275 ml" e "275 ML" são o mesmo trecho
        return "".join(str(x or "").lower().split())
    liberados = {chave(x) for x in qa.get("numeros_confirmados") or []}
    if not rel:
        alegs = F.alegacoes(c.edl)
        if not alegs:
            return {"ok": True, "detalhe": "nenhum número de produto na tela"}
        return {"ok": False, "bloqueia": False, "valor": {"alegacoes": [a["trecho"] for a in alegs][:10]},
                "detalhe": f"{len(alegs)} número(s) na tela sem conferência (versão montada antes da verificação de fatos)"}
    estado = rel.get("estado")
    if estado in ("sem_numeros", "desligado"):
        return {"ok": True, "detalhe": "nenhum número de produto na tela" if estado == "sem_numeros" else "verificação de fatos desligada (EDITOR_FATOS=0)"}
    if estado == "nao_conferido":
        return {"ok": False, "bloqueia": False, "detalhe": f"NÃO CONFERIDO: {rel.get('motivo')}",
                "valor": {"alegacoes": [a["trecho"] for a in rel.get("alegacoes") or []][:10]}}
    if estado == "falhou":
        presos = [a["trecho"] for a in rel.get("alegacoes") or [] if chave(a["trecho"]) not in liberados]
        if not presos:
            return {"ok": True, "detalhe": "conferência falhou, mas o dono confirmou à mão todos os números"}
        return {"ok": False, "bloqueia": False, "valor": {"sem_fonte": presos[:10]},
                "detalhe": f"CONFIRA ANTES DE POSTAR: número na tela sem fonte ({', '.join(presos[:6])}): {rel.get('motivo')}"}
    itens = rel.get("itens") or []
    sem = [it for it in itens if it.get("status") == "sem_fonte" and chave(it.get("dito")) not in liberados]
    corr = [it for it in itens if it.get("status") == "corrigido"]
    val = {"conferidos": len(itens), "corrigidos": [{"dito": it.get("dito"), "correto": it.get("correto"), "fonte": it.get("fonte_url")} for it in corr],
           "sem_fonte": [it.get("dito") for it in sem], "trocas": rel.get("trocas") or [], "conferido_em": rel.get("conferido_em"),
           "custo_usd": (rel.get("uso") or {}).get("custo_usd")}
    partes = [f"{len(itens)} número(s) conferido(s) em {rel.get('conferido_em')}"]
    if corr:
        partes.append("corrigido na tela: " + "; ".join(f"{it.get('dito')} → {it.get('correto')} ({it.get('fonte_tipo')})" for it in corr[:4]))
    if sem:
        partes.append("CONFIRA ANTES DE POSTAR, sem fonte: " + ", ".join(str(it.get("dito")) for it in sem[:6]))
    return {"ok": not sem, "bloqueia": False, "valor": val, "detalhe": "; ".join(partes)}
