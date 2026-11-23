"""Verificação de fatos (item I): o número dito errado sai CERTO na tela, com fonte; sem fonte, a entrega fica segura.
Caso real do dono (21/11): Lavínia disse "Amstel Ultra garrafa 269 ml"; o certo é long neck 275 ml / 72 kcal (lata é 269 ml / 71 kcal).
A chamada ao cérebro é simulada (teste sem custo); o teste pago de verdade fica para o material real."""
import json
import types

import pytest

from motor.etapas import fatos as F


def _edl():
    pal = [[10.0, 10.3, "Amstel"], [10.3, 10.6, "Ultra"], [10.6, 11.0, "garrafa"], [11.0, 11.4, "269"], [11.4, 11.6, "ml,"],
           [11.6, 12.0, "só"], [12.0, 12.3, "71"], [12.3, 12.8, "calorias"],
           [20.0, 20.4, "vem"], [20.4, 20.7, "comigo"], [21.0, 21.3, "R$"], [21.3, 21.8, "4,99"]]
    return {"projeto": "p1", "versao": "v1", "duracao": 30.0, "legendas": {"palavras": pal},
            "motion": [{"id": "m1", "modelo": "cartao", "de": 11.0, "ate": 14.0,
                        "props": {"titulo": "Amstel Ultra", "linhas": ["Long neck 269 ml", "71 kcal"], "cor": "#fff"}}],
            "planos": [], "voz": []}


def test_acha_so_numero_de_produto():
    alegs = F.alegacoes(_edl())
    trechos = [a["trecho"] for a in alegs]
    assert trechos == ["269 ml", "71 calorias", "R$ 4,99", "269 ml", "71 kcal"]
    assert [a["onde"] for a in alegs] == ["legenda"] * 3 + ["motion"] * 2
    assert F.alegacoes({"legendas": {"palavras": [[0, 1, "há"], [1, 2, "30"], [2, 3, "anos"], [3, 4, "e"], [4, 5, "3"], [5, 6, "dias"]]}}) == []


class _Cfg:
    def __init__(self, dados, cerebro="anthropic"):
        self.dados = str(dados)
        self.modelo_direcao = "claude-opus-5-5"
        self._c = cerebro

    def provedor_efetivo(self, nome):
        return self._c


def _resposta(alegs):
    certo = {"269 ml": ("corrigido", "275 ml", "https://www.amstel.com.br/ultra"), "71 calorias": ("corrigido", "72 calorias", "https://www.amstel.com.br/ultra"),
             "71 kcal": ("corrigido", "72 kcal", "https://www.amstel.com.br/ultra"), "R$ 4,99": ("sem_fonte", "R$ 4,99", "")}
    return {"itens": [{"id": a["id"], "status": certo[a["trecho"]][0], "dito": a["trecho"], "correto": certo[a["trecho"]][1],
                       "produto": "Amstel Ultra long neck", "fonte_url": certo[a["trecho"]][2],
                       "fonte_tipo": "fabricante" if certo[a["trecho"]][2] else "nenhuma", "observacao": ""} for a in alegs]}


@pytest.fixture()
def chamadas(monkeypatch):
    feitas = []

    def falso(cfg, alegs, contexto, quadros):
        feitas.append(contexto)
        return _resposta(alegs), {"modelo": "claude-opus-5-5", "buscas": 3, "custo_usd": 0.07}
    monkeypatch.setattr(F, "perguntar", falso)
    monkeypatch.setattr("motor.cerebro.gastos.registrar", lambda *a, **k: None)
    return feitas


def test_corrige_legenda_e_cartao_e_guarda_a_fonte(tmp_path, chamadas):
    edl = _edl()
    rel = F.revisar(edl, _Cfg(tmp_path), contexto="Projeto: cerveja. Pedido do cliente: reels da Amstel Ultra")
    pal = edl["legendas"]["palavras"]
    assert pal[3][2] == "275" and pal[4][2] == "ml," and pal[6][2] == "72"          # a fala ficou; a tela mostra o certo
    assert edl["motion"][0]["props"]["linhas"] == ["Long neck 275 ml", "72 kcal"]
    assert edl["motion"][0]["props"]["cor"] == "#fff"
    assert rel["estado"] == "conferido" and len(rel["trocas"]) == 4 and edl["qa"]["fatos"] is rel
    assert all(it["fonte_url"].startswith("https://") for it in rel["itens"] if it["status"] == "corrigido")
    assert rel["conferido_em"]


def test_nao_paga_de_novo_na_mesma_versao_nem_depois_de_corrigida(tmp_path, chamadas):
    edl = _edl()
    F.revisar(edl, _Cfg(tmp_path), contexto="c")
    F.revisar(edl, _Cfg(tmp_path), contexto="c")                         # EDL já corrigido: mesma forma de saída
    F.revisar(_edl(), _Cfg(tmp_path), contexto="c")                      # outra montagem do mesmo EDL: cache em disco
    assert len(chamadas) == 1


def test_qa_segura_numero_sem_fonte_e_dono_libera(tmp_path, chamadas):
    from motor.etapas.qa import fatos as Q
    edl = _edl()
    F.revisar(edl, _Cfg(tmp_path), contexto="c")
    r = Q.checar(types.SimpleNamespace(edl=edl))
    assert r["ok"] is False and "R$ 4,99" in r["detalhe"] and "269 ml → 275 ml" in r["detalhe"]
    edl["qa"]["numeros_confirmados"] = ["R$ 4,99"]
    assert Q.checar(types.SimpleNamespace(edl=edl))["ok"] is True


def test_sem_url_nao_vale_como_fonte(tmp_path, monkeypatch):
    monkeypatch.setattr("motor.cerebro.gastos.registrar", lambda *a, **k: None)
    monkeypatch.setattr(F, "perguntar", lambda cfg, alegs, c, q: ({"itens": [{"id": a["id"], "status": "confirmado", "dito": a["trecho"],
                                                                              "correto": a["trecho"], "fonte_url": "", "fonte_tipo": "fabricante"} for a in alegs]}, {}))
    rel = F.revisar(_edl(), _Cfg(tmp_path), contexto="c")
    assert {it["status"] for it in rel["itens"]} == {"sem_fonte"}


def test_sem_cerebro_so_avisa_e_falha_da_api_segura(tmp_path, monkeypatch):
    from motor.etapas.qa import fatos as Q
    edl = _edl()
    F.revisar(edl, _Cfg(tmp_path, cerebro="local"), contexto="c")
    r = Q.checar(types.SimpleNamespace(edl=edl))
    assert r["ok"] is False and r["bloqueia"] is False and "NÃO CONFERIDO" in r["detalhe"]

    def quebra(*a):
        raise TimeoutError("api fora")
    monkeypatch.setattr(F, "perguntar", quebra)
    edl = _edl()
    F.revisar(edl, _Cfg(tmp_path), contexto="c")
    r = Q.checar(types.SimpleNamespace(edl=edl))
    assert r["ok"] is False and r["bloqueia"] is False and "api fora" in r["detalhe"]      # aviso, não trava (23/11)


def test_sem_numero_passa_e_relatorio_vai_no_schema(tmp_path):
    from motor.etapas.qa import fatos as Q
    edl = {"legendas": {"palavras": [[0, 1, "vem"], [1, 2, "comigo"]]}, "motion": []}
    assert F.revisar(edl, _Cfg(tmp_path))["estado"] == "sem_numeros"
    assert Q.checar(types.SimpleNamespace(edl=edl))["ok"] is True
    from motor import config
    esquema = json.loads((config.SCHEMAS / "edl.schema.json").read_text(encoding="utf-8"))
    assert {"fatos", "numeros_confirmados"} <= set(esquema["properties"]["qa"]["properties"])


def _so(edl, itens):
    alegs = F.alegacoes(edl)
    return F.aplicar(edl, alegs, itens), alegs


def test_ancora_no_trecho_do_motor_mesmo_se_o_modelo_reescrever_o_dito():
    edl = {"legendas": {"palavras": [[0, 1, "garrafa"], [1, 2, "269"], [2, 3, "ml"]]}, "motion": []}
    trocas, _ = _so(edl, [{"id": "F1", "status": "corrigido", "dito": "269ml (garrafa)", "correto": "275 ml"}])
    assert edl["legendas"]["palavras"][1][2] == "275" and len(trocas) == 1


def test_unidade_muda_junto_e_colada_tambem():
    edl = {"legendas": {"palavras": [[0, 1, "tem"], [1, 2, "100"], [2, 3, "gramas,"]]}, "motion": []}
    _so(edl, [{"id": "F1", "status": "corrigido", "correto": "90 g"}])
    assert [w[2] for w in edl["legendas"]["palavras"]] == ["tem", "90", "g,"]
    edl = {"legendas": {"palavras": [[0, 1, "269ml"]]}, "motion": []}
    _so(edl, [{"id": "F1", "status": "corrigido", "correto": "275 ml"}])
    assert edl["legendas"]["palavras"][0][2] == "275ml"


def test_correcao_que_nao_cabe_na_tela_vira_sem_fonte():
    edl = {"legendas": {"palavras": [[0, 1, "269"], [1, 2, "ml"]]}, "motion": []}
    itens = [{"id": "F1", "status": "corrigido", "correto": "duzentos e setenta e cinco"}]
    trocas, _ = _so(edl, itens)
    assert trocas == [] and itens[0]["status"] == "sem_fonte" and edl["legendas"]["palavras"][0][2] == "269"


def test_resposta_incompleta_nao_fica_no_cache(tmp_path, monkeypatch):
    monkeypatch.setattr("motor.cerebro.gastos.registrar", lambda *a, **k: None)
    feitas = []

    def metade(cfg, alegs, c, q):
        feitas.append(1)
        return {"itens": [{"id": alegs[0]["id"], "status": "confirmado", "dito": alegs[0]["trecho"], "correto": alegs[0]["trecho"],
                           "fonte_url": "https://x.com", "fonte_tipo": "fabricante"}]}, {}
    monkeypatch.setattr(F, "perguntar", metade)
    F.revisar(_edl(), _Cfg(tmp_path), contexto="c")
    F.revisar(_edl(), _Cfg(tmp_path), contexto="c")
    assert len(feitas) == 2


def test_qa_libera_trecho_normalizado_e_falha_com_tudo_liberado(tmp_path, monkeypatch):
    from motor.etapas.qa import fatos as Q
    monkeypatch.setattr(F, "perguntar", lambda *a: (_ for _ in ()).throw(TimeoutError("fora")))
    edl = _edl()
    F.revisar(edl, _Cfg(tmp_path), contexto="c")
    edl["qa"]["numeros_confirmados"] = ["275ml", "269ML", "71 Calorias", "R$4,99", "71 kcal"]
    assert Q.checar(types.SimpleNamespace(edl=edl))["ok"] is True
