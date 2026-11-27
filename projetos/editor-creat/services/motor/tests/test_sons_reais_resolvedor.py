"""M6: pedidos de som real da direção -> edl.sons_reais (lugar no filme, escolha no índice, avisos)."""
import copy

import pytest
import validar
from b_sintetico import TRILHAS, analise, direcao
from b_sons_reais import banco, sem_internet  # noqa: F401 - fixtures

from motor.etapas import catalogo, resolvedor
from motor.etapas import sons_reais as SONS
from motor.memoria.loja import Loja
from motor.sons_reais import indice as IX

AGUA = {"desc": "água de riacho", "busca": "creek water flowing", "papel": "ambiente"}
FLORESTA = {"desc": "floresta de manhã", "busca": "forest morning birds", "papel": "ambiente"}
MALA = {"desc": "porta-malas abrindo", "papel": "pontual", "m": "M01.1", "forca": 3}


@pytest.fixture()
def base(banco):
    an = analise()
    cat, _ = catalogo.montar([an], {"texto": "reel"}, "p_t")
    return an, cat, Loja()


def _resolver(base, d, **kw):
    an, cat, loja = base
    return resolvedor.resolver(d, cat, [an], loja.modelo("evento-reel"), TRILHAS, vocabulario=loja.vocabulario(), **kw)


def _com(sons: dict):
    d = direcao()
    for b in d["blocos"]:
        if b["id"] in sons:
            b["sons"] = copy.deepcopy(sons[b["id"]])
    assert validar.erros("direcao", d) == []
    return d


def _bloco(edl, bid):
    bl = edl["blocos"]
    k = next(i for i, b in enumerate(bl) if b["id"] == bid)
    return bl[k]["t0"], (bl[k + 1]["t0"] if k + 1 < len(bl) else bl[k]["t1"])


def test_direcao_sem_sons_gera_o_mesmo_edl(base):
    edl0 = _resolver(base, direcao())
    assert "sons_reais" not in edl0 and "sons_reais" not in edl0["origem"]
    d = direcao()
    d["blocos"][0]["sons"] = []
    edl1 = _resolver(base, d)
    edl0["origem"].pop("direcao")
    edl1["origem"].pop("direcao")
    assert edl1 == edl0


def test_schema_da_direcao_aceita_sons_e_recusa_o_que_nao_existe():
    d = _com({"B2": [AGUA, MALA]})
    assert validar.erros("direcao", d) == []
    for ruim in ({"desc": "x", "papel": "trilha"}, {"papel": "ambiente"}, {"desc": "água", "papel": "ambiente", "som": "boom"},
                 {"desc": "a" * 61, "papel": "ambiente"}, {"desc": "água", "papel": "pontual", "m": "C01"}):
        d2 = copy.deepcopy(d)
        d2["blocos"][1]["sons"] = [ruim]
        assert validar.erros("direcao", d2), ruim
    d2 = copy.deepcopy(d)
    d2["blocos"][1]["sons"] = [AGUA] * 4                                        # no máximo 3 por bloco
    assert validar.erros("direcao", d2)


def test_ambiente_e_pontual_entram_no_lugar_certo_e_o_edl_vale(base):
    edl0 = _resolver(base, direcao())
    edl = _resolver(base, _com({"B2": [AGUA, MALA]}))
    assert validar.erros("edl", edl) == []
    amb, pont = edl["sons_reais"]
    b0, b1 = _bloco(edl, "B2")
    assert amb["papel"] == "ambiente" and (amb["t0"], amb["t1"]) == (round(b0, 4), round(b1, 4))
    assert amb["id_banco"] == 101 and [r["id_banco"] for r in amb["reservas"]] == [102] and amb["ganho_db"] == -28.0
    assert amb["fade"] == [1.2, 1.5] and amb["formato"] == "wav" and amb["trecho"][1] == pytest.approx(b1 - b0, abs=1e-3)
    assert amb["item"] == "fake-gdc-2024" and amb["pacote"] == "GDC 2024" and amb["origem"] == "direcao"
    # pontual: no plano que mostra o momento M01.1, sem série de energia = corte do plano + 0,15 s
    R = resolvedor.Resolvedor(_com({"B2": [MALA]}), base[1], {base[0]["arquivo"]["id"]: base[0]}, base[2].modelo("evento-reel"), TRILHAS)
    p = SONS.planos_do_momento(R, "M01.1", edl["planos"])[0][1]
    assert pont["t0"] == pytest.approx(p["t0"] + 0.15, abs=1e-3) and p["t0"] < pont["t0"] < p["t1"]
    assert pont["id_banco"] == 106 and [r["id_banco"] for r in pont["reservas"]] == [111, 107]
    assert pont["ganho_db"] == -7.0 and pont["trecho"] is None and pont["md5"] and pont["m"] == "M01.1"
    # o resolvedor não mexe no som direto (a mixagem abaixa só onde o ambiente de fato entrou)
    assert [p.get("som_direto_db") for p in edl["planos"]] == [p.get("som_direto_db") for p in edl0["planos"]]
    assert edl["origem"]["sons_reais"] == {"pedidos": 2, "sem_som": [], "itens": 2}


def test_pontual_cai_no_transiente_quando_ha_serie(base):
    an = base[0]
    plano_sem = _resolver(base, _com({"B2": [MALA]}))
    R = resolvedor.Resolvedor(_com({"B2": [MALA]}), base[1], {an["arquivo"]["id"]: an}, base[2].modelo("evento-reel"), TRILHAS)
    p = SONS.planos_do_momento(R, "M01.1", plano_sem["planos"])[0][1]
    passo = 0.02
    serie = [-40.0] * int(31 / passo)
    x = p["s0"] + 0.4 * (p["t1"] - p["t0"]) * p["vel"]                           # a batida da tampa, no meio do plano
    for i in range(int(x / passo), int((x + 0.3) / passo)):
        serie[i] = -28.0
    edl = _resolver(base, _com({"B2": [MALA]}), energias={an["arquivo"]["id"]: serie, "_passo": {an["arquivo"]["id"]: passo}})
    p2 = SONS.planos_do_momento(R, "M01.1", edl["planos"])[0][1]
    esperado = p2["t0"] + (int(x / passo) * passo - p2["s0"]) / p2["vel"]
    assert edl["sons_reais"][0]["t0"] == pytest.approx(esperado, abs=0.021)


def test_mesmo_ambiente_em_blocos_seguidos_vira_um_so_e_o_seguinte_entra_em_j(base):
    edl = _resolver(base, _com({"B1": [AGUA], "B2": [dict(AGUA, desc="Água de  riacho")], "B3": [FLORESTA]}))
    assert validar.erros("edl", edl) == []
    a, f = edl["sons_reais"]
    b1_0, _ = _bloco(edl, "B1")
    _, b2_1 = _bloco(edl, "B2")
    b3_0, b3_1 = _bloco(edl, "B3")
    assert a["blocos"] == ["B1", "B2"] and a["t0"] == pytest.approx(b1_0) and a["id_banco"] == 101
    assert f["t0"] == pytest.approx(b3_0 - 0.4, abs=1e-3) and a["t1"] == pytest.approx(b3_0 + 0.6, abs=1e-3)   # J-cut, cruza 1 s
    assert a["fade"] == [1.2, 1.0] and f["fade"][0] == 1.0 and f["id_banco"] == 110
    assert f["fade"][1] == pytest.approx(min(1.5, (f["t1"] - f["t0"]) / 2), abs=1e-3)      # bloco curto: a saída cabe nele
    assert len({x["id_banco"] for x in edl["sons_reais"]}) == 2


def test_pontual_sem_lugar_e_repetido_viram_aviso_sem_inventar(base):
    edl = _resolver(base, _com({"B2": [dict(MALA, m="M01.2"), {"desc": "porta-malas abrindo", "papel": "pontual"}, MALA],
                                "B3": [MALA]}))
    assert validar.erros("edl", edl) == []
    avisos = " | ".join(edl["origem"]["avisos"])
    assert "pedido sem som: porta-malas abrindo (o momento M01.2 não entrou em nenhum plano)" in avisos
    assert "som pontual sem o momento" in avisos
    ids = [x["id_banco"] for x in edl["sons_reais"]]
    assert ids == [106] and "nenhuma gravação real do banco serve" in avisos       # o 2º pedido igual não repete o som
    assert len(edl["origem"]["sons_reais"]["sem_som"]) == 3 and edl["qa"]["riscos"]


def test_indice_ausente_vira_aviso_e_o_filme_segue(base, monkeypatch, tmp_path):
    monkeypatch.setattr(IX, "JSONL", tmp_path / "sumiu.jsonl.gz")
    IX.caminho_banco(None)[0].unlink(missing_ok=True)
    edl = _resolver(base, _com({"B2": [AGUA]}))
    assert edl["sons_reais"] == [] and validar.erros("edl", edl) == []
    assert any("banco de sons reais indisponível" in a for a in edl["origem"]["avisos"])


def test_sons_desligados_por_variavel(base, monkeypatch):
    monkeypatch.setenv("EDITOR_SONS_REAIS", "0")
    edl = _resolver(base, _com({"B2": [AGUA]}))
    assert edl["sons_reais"] == [] and "desligados" in edl["origem"]["sons_reais"]["sem_som"][0]["motivo"]


def test_filme_sem_fala_ambiente_mais_alto(banco, tmp_path):
    """Sem fala, o ambiente mira -24 LUFS (não briga com voz) e o som direto dos planos desce 6 dB sob ele."""
    import test_sem_fala as TSF
    mat = {"pasta": tmp_path, "an": [TSF._analise(c, str(tmp_path / f"{c}.mp4")) for c in TSF.CORES], "cat": TSF._catalogo(),
           "trilha": {"id": "t_virada", "clima": "viagem", "bpm": 120.0, "fase": 0.0, "dur": 32.0, "chave": "/tmp/nao.wav"}}
    d = copy.deepcopy(TSF.DIRECAO)
    d["blocos"][2]["sons"] = [FLORESTA]                                           # B3: planos em 1x, com som direto
    assert validar.erros("direcao", d) == []
    edl = TSF._resolver(mat, d)
    assert validar.erros("edl", edl) == [], edl["origem"]["avisos"]
    assert edl["sons_reais"], edl["origem"]["avisos"]
    it = edl["sons_reais"][0]
    assert it["ganho_db"] == -24.0 and it["id_banco"] == 110 and it["t0"] == pytest.approx(edl["blocos"][2]["t0"])
    assert it["t1"] == pytest.approx(edl["duracao"])
    sob = [p for p in edl["planos"] if p["t0"] >= it["t0"] - 1e-6 and p.get("som_direto_db") is not None]
    fora = [p for p in edl["planos"] if p["t1"] <= it["t0"] + 1e-6 and p.get("som_direto_db") is not None]
    assert sob and fora and all(p["som_direto_db"] == -12 for p in sob + fora)      # o EDL fica; a mixagem decide
    from motor.etapas.montagem import mix as MIX
    em = [(it["t0"], it["t1"])]
    assert all(MIX.sob_ambiente_real(p, em) for p in sob) and not any(MIX.sob_ambiente_real(p, em) for p in fora)
    assert not any(MIX.sob_ambiente_real(p, []) for p in sob)                        # o ambiente não entrou: nada desce
