import pytest
import validar
from b_sintetico import TRILHAS, analise, direcao

from motor.etapas import catalogo, resolvedor
from motor.memoria.loja import Loja


@pytest.fixture()
def base():
    an = analise()
    cat, _ = catalogo.montar([an], {"texto": "reel"}, "p_t")
    loja = Loja()
    return an, cat, loja


def _resolver(base, d=None):
    an, cat, loja = base
    return resolvedor.resolver(d or direcao(), cat, [an], loja.modelo("evento-reel"), TRILHAS, vocabulario=loja.vocabulario())


def test_edl_valido_e_legenda_corrigida(base):
    edl = _resolver(base)
    assert validar.erros("edl", edl) == []
    leg = " ".join(w[2] for w in edl["legendas"]["palavras"])
    assert "Ruan na filmagem" in leg and "voando" not in leg
    assert "creat" in leg.split() and "create" not in leg.lower().split()     # vocabulário da casa (creit/create -> creat)


def test_planos_cobrem_o_filme_sem_buraco(base):
    edl = _resolver(base)
    p = edl["planos"]
    assert p[0]["t0"] == 0 and abs(p[-1]["t1"] - edl["duracao"]) < 1e-6
    assert all(abs(a["t1"] - b["t0"]) < 1e-3 for a, b in zip(p, p[1:]))
    assert any(x["fonte"] == "C01" and x["som_direto_db"] is not None for x in p)      # cobertura na música com som direto


def test_blocos_na_batida_e_voz_em_ordem(base):
    edl = _resolver(base)
    batida = 60 / 120
    for b in edl["blocos"][1:]:
        assert abs((b["t0"] / batida) - round(b["t0"] / batida)) < 1e-3
    assert all(a["t1"] <= b["t0"] + 1e-6 for a, b in zip(edl["voz"], edl["voz"][1:]))


def test_tom_de_sala_sem_fala(base):
    an, _, _ = base
    edl = _resolver(base)
    t = edl["tom_sala"]
    falas = [(s["s"], s["e"]) for s in an["transcricao"]["segmentos"]]
    assert t and not any(a < t["s1"] + 0.3 and b > t["s0"] - 0.3 for a, b in falas)


def test_fecho_com_arroba_e_checagens(base):
    _, _, loja = base
    edl = _resolver(base)
    fecho = [m for m in edl["motion"] if m["modelo"] == "fecho"][0]
    assert fecho["props"]["arroba"] == "@creat.mtt" and fecho["props"]["logo"]
    assert all(c["ok"] for c in loja.avaliar_edl(edl) if c["gravidade"] == "bloqueia")


def test_id_inexistente_vira_problema(base):
    d = direcao()
    d["blocos"][0]["falas"][0]["id"] = "F09.9"
    d["blocos"][1]["falas"][0]["ate"] = "frase que ninguém disse aqui"
    with pytest.raises(resolvedor.ErroResolucao) as e:
        _resolver(base, d)
    assert any("F09.9" in p for p in e.value.problemas) and any("fim" in p for p in e.value.problemas)


def test_aperto_de_pausa():
    pal = [[0.0, 0.3, "a", 0.9], [0.32, 0.6, "b", 0.9], [1.6, 1.9, "c", 0.9]]
    an = analise(falas=[(0.0, "a b c")])
    an["transcricao"]["segmentos"][0]["palavras"] = pal
    an["transcricao"]["segmentos"][0]["e"] = 1.9
    cat, _ = catalogo.montar([an], {}, "p_t")
    r = resolvedor.Resolvedor(direcao(), cat, {an["arquivo"]["id"]: an}, Loja().modelo("evento-reel"), TRILHAS)
    f = r.resolver_fala({"id": "F01.1", "de": None, "ate": None})
    assert len(f["pecas"]) == 2 and f["pecas"][0][1] == pytest.approx(0.7) and f["pecas"][1][0] == pytest.approx(1.5)


@pytest.mark.parametrize("modo", ["criativo", "ultra", "cinema", "ia", "clean", "serio", "fala"])
def test_cada_modo_gera_edl_valido(base, modo):
    """O mesmo material e a mesma direção, resolvidos com a receita de cada modo de edição."""
    an, cat, loja = base
    edl = resolvedor.resolver(direcao(), cat, [an], loja.modelo_com_modo("evento-reel", modo), TRILHAS, vocabulario=loja.vocabulario())
    assert validar.erros("edl", edl) == [], modo
    assert all(s.get("som") for s in edl.get("sfx", [])), "som vazio vazou para o EDL"
    if modo in ("clean", "serio", "fala"):
        pesadas = {"whip", "aba71", "impacto", "flash", "mascara"}
        assert not [f for f in edl.get("fx", []) if f["tipo"] in pesadas and f["tipo"] != "impacto"], modo
        assert not [m for m in edl.get("motion", []) if m["modelo"] == "transicao"], modo


def test_titulo_atras_da_pessoa_e_fundo_desfocado(base):
    """Item 2 (20/11): a direção pede o título atrás de quem fala e o fundo desfocado num bloco; o EDL leva as marcas e valida."""
    import copy
    from validar import erros
    d = copy.deepcopy(direcao())
    d["gancho"]["atras_da_pessoa"] = True
    alvo = d["blocos"][0]["id"]
    d["blocos"][0]["fundo_desfocado"] = True
    edl = _resolver(base, d)
    g = next(m for m in edl["motion"] if m["id"] == "gancho")
    assert g.get("atras") is True and g["props"]["y"] == 0.30
    do_bloco = [p for p in edl["planos"] if p.get("bloco") == alvo and not p.get("_cob")]
    assert do_bloco and all((p.get("fundo") or {}).get("desfoque") == 0.7 for p in do_bloco)
    assert not any(p.get("fundo") for p in edl["planos"] if p.get("bloco") != alvo)
    assert erros("edl", edl) == []
