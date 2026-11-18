import validar
from b_sintetico import analise

from motor.cerebro import orcamento
from motor.etapas import catalogo


def test_catalogo_valido_e_ids():
    cat, txt = catalogo.montar([analise()], {"texto": "reel"}, "p_t", trilhas=[{"id": "t1", "clima": "x", "bpm": 100, "dur": 60}])
    assert validar.erros("catalogo", cat) == []
    assert cat["clipes"][0]["id"] == "C01" and cat["clipes"][0]["falas"][0]["id"] == "F01.1"
    assert "F01.1" in txt and "M01.1" in txt and "t1 (100 bpm" in txt
    assert cat["orcamento"]["tokens_estimados"] == orcamento.estimar_tokens(txt)


def test_orcamento_comprime_e_mantem_a_equipe_inteira():
    longa = " ".join(f"palavra{i}" for i in range(40))
    an = [analise(aid=f"a{i:03d}", nome=f"2026111810{i:04d}.mov", falante="F1", falas=[(1.0 + k * 13, longa) for k in range(2)], dur=40)
          for i in range(30)]
    an.append(analise(aid="a999", nome="20261118_999999.mov", falas=[(1.0, longa)]))        # MARCOS
    cat, txt = catalogo.montar(an, {"texto": "reel"}, "p_t", limite=4000)
    assert cat["orcamento"]["tokens_estimados"] <= 4000, cat["orcamento"]
    assert cat["orcamento"]["cortes"]
    marcos = [f for c in cat["clipes"] for f in c["falas"] if f["falante"] == "MARCOS"]
    assert marcos and all(not f["truncado"] and f"«{f['texto']}»" in txt for f in marcos)
    assert any(f["truncado"] for c in cat["clipes"] for f in c["falas"] if f["falante"] == "F1")


def test_deterministico():
    a = catalogo.montar([analise()], {"texto": "reel"}, "p_t")[1]
    b = catalogo.montar([analise()], {"texto": "reel"}, "p_t")[1]
    assert a == b
