import shutil

import pytest

from motor import config
from motor.cerebro import orcamento
from motor.etapas.direcao import montar_prompt
from motor.memoria import loja as loja_mod


@pytest.fixture()
def mem(tmp_path, monkeypatch):
    destino = tmp_path / "memoria"
    shutil.copytree(config.MEMORIA, destino)
    monkeypatch.setenv("EDITOR_MEMORIA", str(destino))
    return loja_mod.Loja()


def test_propor_regra_par_errado_certo():
    p = loja_mod.propor_regra("não é 'voando', é 'Ruan'")
    assert p["checagem"]["tipo"] == "legenda_proibida" and p["checagem"]["params"]["palavras"] == ["voando"]
    assert p["vocabulario"] == [{"de": "voando", "para": "Ruan"}]
    assert loja_mod.propor_regra("ficou muito longo")["checagem"]["tipo"] == "duracao_max"
    assert loja_mod.propor_regra("tem uma fala se repetindo o tempo todo")["checagem"]["tipo"] == "frase_repetida"


def test_reprovacao_vira_regra_checagem_e_entra_no_prompt(mem):
    r = mem.registrar_reprovacao("p_t", "v1", "A legenda escreveu 'Draco' errado, o certo é 'Drako'")
    assert r["regra"]["id"].startswith("r_dono_") and r["checagem"]["id"].startswith("c_dono_")
    novo = loja_mod.Loja()
    assert any(c["id"] == r["checagem"]["id"] for c in novo.checagens())
    sistema, _, _ = montar_prompt(novo, "C01 ...", {"texto": "reel"})
    assert r["regra"]["texto"] in sistema
    # idempotente: a mesma reprovação não duplica
    mem.registrar_reprovacao("p_t", "v1", "A legenda escreveu 'Draco' errado, o certo é 'Drako'")
    assert sum(1 for c in loja_mod.Loja().checagens() if c["id"] == r["checagem"]["id"]) == 1


def test_prompt_de_sistema_cabe(mem):
    sistema, _, _ = montar_prompt(mem, "", {"texto": "reel", "tipo_video": "bastidor"})
    assert orcamento.estimar_tokens(sistema) <= 6000


def test_avaliar_vazio_e_legenda():
    edl = {"duracao": 10, "voz": [{"t0": 0, "t1": 3}, {"t0": 6, "t1": 9}], "motion": [], "fx": [], "legendas": {"palavras": [[0, 1, "voando", 0]]}}
    v = loja_mod.avaliar({"id": "x", "tipo": "vazio_max_s", "params": {"s": 1.2}}, edl)
    assert not v["ok"] and "3.00" in v["detalhe"]
    assert not loja_mod.avaliar({"id": "y", "tipo": "legenda_proibida", "params": {"palavras": ["Voando"]}}, edl)["ok"]


def test_custo():
    assert orcamento.custo_usd("claude-opus-5-5", 1_000_000, 0) == 4.0
    assert orcamento.custo_usd("claude-opus-5-5", 0, 1_000_000, cache_lido=1_000_000) == 20.2
