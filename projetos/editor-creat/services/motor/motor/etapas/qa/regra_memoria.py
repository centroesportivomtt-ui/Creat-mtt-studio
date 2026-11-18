"""regra_memoria: as checagens que nasceram das reprovações do dono (memoria/checagens.json, executor 'edl') rodam aqui.
As de executor 'qa' já são checagens próprias (frase_repetida, tom_sala_sem_voz, logo_100). 'revisao_humana' vira aviso."""
ID, BLOQUEIA = "regra_memoria", True


def checar(c):
    try:
        from motor.memoria.loja import Loja
        loja = Loja()
        res = loja.avaliar_edl(c.edl)
        humanas = [ch for ch in loja.checagens() if ch.get("tipo") == "revisao_humana"]
    except Exception as e:  # noqa: BLE001
        return {"ok": True, "bloqueia": False, "detalhe": f"memória indisponível ({e})"}
    falhas = [r for r in res if not r["ok"] and r.get("gravidade", "bloqueia") == "bloqueia"]
    avisos = [r for r in res if not r["ok"] and r.get("gravidade", "bloqueia") != "bloqueia"]
    det = [f"{len(res)} regra(s) da memória conferida(s) no EDL"]
    if falhas:
        det.append("reprovadas: " + "; ".join(f"{r['id']} ({r['detalhe']})" for r in falhas))
    if avisos:
        det.append("avisos: " + "; ".join(r["id"] for r in avisos))
    if humanas:
        det.append(f"{len(humanas)} pedido(s) do dono para conferir à mão: " + "; ".join(h.get("descricao", "")[:80] for h in humanas[:3]))
    return {"ok": not falhas, "valor": {"falhas": [r["id"] for r in falhas], "avisos": [r["id"] for r in avisos], "humanas": len(humanas)},
            "detalhe": "; ".join(det)}
