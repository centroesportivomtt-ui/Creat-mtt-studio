import json

import pytest
import validar


@pytest.mark.parametrize("nome", validar.NOMES)
def test_exemplo_valido(nome):
    obj = json.loads((validar.RAIZ / "exemplos" / f"{nome}.json").read_text(encoding="utf-8"))
    assert validar.erros(nome, obj) == []


def test_edl_rejeita_campo_estranho():
    obj = json.loads((validar.RAIZ / "exemplos" / "edl.json").read_text(encoding="utf-8"))
    obj["planos"][0]["inventado"] = 1
    assert validar.erros("edl", obj)


def test_direcao_cabe_no_orcamento():
    """A direção de exemplo serializada deve ficar muito abaixo de 4k tokens (~3,5 caracteres por token em pt)."""
    txt = (validar.RAIZ / "exemplos" / "direcao.json").read_text(encoding="utf-8")
    assert len(json.dumps(json.loads(txt), ensure_ascii=False, separators=(",", ":"))) / 3.5 < 4000
