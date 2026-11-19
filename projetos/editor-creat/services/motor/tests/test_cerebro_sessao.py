"""Cérebro 'sessao': sem direção escrita, grava o pedido e para; com a direção escrita (mesma chave), devolve sem custo."""
import json

import pytest
import validar

from motor.cerebro.sessao import AguardandoDiretor, CerebroSessao, chave, pasta


class Cfg:
    def __init__(self, d): self.dados = d


def test_pede_e_depois_usa_a_direcao(tmp_path):
    cfg = Cfg(tmp_path)
    c = CerebroSessao(cfg)
    esquema = validar.esquema("direcao")
    with pytest.raises(AguardandoDiretor):
        c.dirigir(sistema="S", catalogo_txt="CAT", pedido_txt="PED", esquema=esquema)
    k = chave("CAT", "PED")
    pedido = pasta(cfg) / f"{k}.pedido.md"
    assert pedido.exists() and "CAT" in pedido.read_text() and "PED" in pedido.read_text()
    (pasta(cfg) / f"{k}.direcao.json").write_text(json.dumps({"x": 1}))
    d, uso = c.dirigir(sistema="S", catalogo_txt="CAT", pedido_txt="PED", esquema=esquema)
    assert d == {"x": 1} and uso["custo_usd"] == 0
    d2, _ = c.criticar(sistema="S", catalogo_txt="CAT", direcao=d, pedido_txt="PED", esquema=esquema)
    assert d2 == d
