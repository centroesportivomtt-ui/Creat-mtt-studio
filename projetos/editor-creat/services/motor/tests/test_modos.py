"""Modo de edição: o pedido aceita o modo, o contrato valida e a direção recebe a instrução do estilo."""
import validar
from motor.etapas.direcao import MODOS, montar_prompt


class _Loja:
    def regras_para_prompt(self, tipo): return "- regra"
    def modelos_para_prompt(self): return "- modelo"
    def casos_para_prompt(self, tipo): return ""


def _pedido(**k):
    p = {"versao": "1", "projeto": "p_teste0001", "texto": "reel do dia", "audio": None, "tipo_video": "auto", "cliente": None, "destino": ["reels"],
         "formato": "9:16", "duracao_alvo": None, "obrigatorio": [], "proibido": [], "referencias": [], "ajustes_de": None, "criado_em": "2026-11-19T00:00:00Z"}
    p.update(k)
    return p


def test_contrato_aceita_os_modos_e_recusa_modo_inventado():
    for m in ["auto", *MODOS]:
        assert validar.erros("pedido", _pedido(modo=m)) == [], m
    assert validar.erros("pedido", _pedido(modo="qualquer"))
    assert validar.erros("pedido", _pedido()) == []      # pedido antigo, sem modo, continua valendo


def test_direcao_recebe_o_modo_e_auto_nao_polui():
    _, _, txt = montar_prompt(_Loja(), "CAT", _pedido(modo="serio"))
    assert "modo de edição: sério" in txt and "sem mascote" in txt
    _, _, txt = montar_prompt(_Loja(), "CAT", _pedido(modo="auto"))
    assert "modo de edição" not in txt
    _, _, txt = montar_prompt(_Loja(), "CAT", _pedido())
    assert "modo de edição" not in txt


def test_receitas_existem_para_todos_os_modos_e_mudam_o_modelo():
    from motor.memoria.loja import Loja
    loja = Loja()
    base = loja.modelo("daily-vlog")
    for m in MODOS:
        r = loja.modo(m)
        assert r and r["id"] == m and r["nome"], m
        mm = loja.modelo_com_modo("daily-vlog", m)
        assert mm["modo"] == m
        assert all(n.get("zoom", 1) <= r["zoom_max"] + 1e-9 for n in mm["intensidade"].values())
    assert loja.modelo_com_modo("daily-vlog", "auto") == base
    assert "modo" not in loja.modelo("daily-vlog")                  # o arquivo do modelo não é alterado
    serio = loja.modelo_com_modo("daily-vlog", "serio")
    assert "whip" not in serio["transicoes"] and "fade" in serio["transicoes"]
    assert serio["sfx"]["drop"] is None and serio["intensidade"]["5"]["fx"] is None
    ultra = loja.modelo_com_modo("daily-vlog", "ultra")
    assert ultra["ritmo"]["pausa_max"] < base["ritmo"]["pausa_max"] and "whip" in ultra["transicoes"]
