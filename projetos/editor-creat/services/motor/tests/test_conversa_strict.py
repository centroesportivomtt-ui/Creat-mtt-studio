"""27/11: a conversa parou de responder com 400 ("Schemas contains too many optional parameters (31) ... limit: 24").
As ferramentas strict não podem passar de 24 opcionais; capítulos antigos (tudo strict) são ajustados na hora de chamar."""
from motor.conversa import ferramentas as F


def test_strict_cabe_no_limite_da_api():
    tools = F.para_api()
    total = sum(F.opcionais(t["input_schema"]) for t in tools if t.get("strict"))
    assert total <= F.LIMITE_OPCIONAIS_STRICT, total


def test_leitura_sem_strict_e_acao_com_strict():
    tools = {t["name"]: t for t in F.para_api()}
    assert "strict" not in tools["ver_material"] and "strict" not in tools["mostrar"]
    assert tools["propor_pedido"].get("strict") is True and tools["anotar"].get("strict") is True


def test_capitulo_antigo_ajustado():
    antigos = [dict(t, strict=True) for t in F.para_api()]
    novos = F.ajustar_strict(antigos)
    assert sum(F.opcionais(t["input_schema"]) for t in novos if t.get("strict")) <= F.LIMITE_OPCIONAIS_STRICT
    assert all(t.get("strict") for t in antigos)          # não mexe na lista original
