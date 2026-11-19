"""Aprovação do dono: vira caso de referência com a estrutura da direção (sem material de cliente)."""
import json

from motor.memoria.loja import Loja


def test_aprovacao_vira_caso(tmp_path):
    (tmp_path / "casos").mkdir()
    loja = Loja(tmp_path)
    direcao = {"modelo": "evento-reel", "tipo_video": "bastidor", "conceito": "dia como filme",
               "gancho": {"texto_tela": ["NÃO FOI SÓ", "UM EVENTO."]},
               "blocos": [{"funcao": "gancho", "saida": "match"}, {"funcao": "convite", "saida": "corte_batida"}]}
    caso = loja.registrar_aprovacao("p_x", "v2", pedido={"texto": "reel do dia", "tipo_video": "bastidor", "modo": "cinema"}, direcao=direcao, nota="  ficou  ótimo ")
    salvo = json.loads((tmp_path / "casos" / "p_x-v2" / "caso.json").read_text())
    assert salvo == caso
    assert caso["modo"] == "cinema" and caso["nota_dono"] == "aprovado: ficou ótimo"
    assert caso["estrutura"] == "gancho (match) -> convite (corte_batida)"
    assert [c["id"] for c in loja.casos("bastidor")] == ["p_x-v2"]          # o diretor passa a ver o caso
