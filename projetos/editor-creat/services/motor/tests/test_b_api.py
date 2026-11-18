import json
import shutil

import pytest

from motor import banco, config


@pytest.fixture()
def cli(dados, tmp_path, monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    destino = tmp_path / "memoria"
    shutil.copytree(config.MEMORIA, destino)
    monkeypatch.setenv("EDITOR_MEMORIA", str(destino))
    monkeypatch.delenv("MOTOR_TOKEN", raising=False)
    from motor.api.app import criar
    con = banco.conectar(config.carregar().banco)
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado, dados) VALUES (?,?,?,?,?)", ("p1", "t", t, t, json.dumps({})))
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v1','p1','entregue',?)", (t,))
    return TestClient(criar()), con


def test_pedido_valida_na_borda(cli):
    c, _ = cli
    assert c.post("/v1/projetos/p1/pedido", json={}).status_code == 422
    assert c.post("/v1/projetos/p1/pedido", json={"texto": "oi", "duracao_alvo": 2}).status_code == 422
    assert c.post("/v1/projetos/p1/pedido", json={"audio_chave": "../segredo"}).status_code == 422
    assert c.post("/v1/projetos/p2/pedido", json={"texto": "oi"}).status_code == 404


def test_pedido_grava_e_espera_envio(cli):
    c, con = cli
    r = c.post("/v1/projetos/p1/pedido", json={"texto": "Reel do evento", "tipo_video": "evento", "obrigatorio": ["@creat.mtt"]})
    assert r.status_code == 201 and r.json()["dirigindo"] is False        # envio ainda não foi fechado
    dados = json.loads(con.execute("SELECT dados FROM projetos WHERE id='p1'").fetchone()["dados"])
    assert dados["pedido"]["texto"] == "Reel do evento"


def test_reprovar_cria_regra_e_nova_direcao(cli):
    c, con = cli
    assert c.post("/v1/projetos/p1/versoes/v7/reprovar", json={"motivo": "não gostei"}).status_code == 404
    r = c.post("/v1/projetos/p1/versoes/v1/reprovar", json={"motivo": "não é 'voando', é 'Ruan'"})
    assert r.status_code == 200 and r.json()["checagem"]["tipo"] == "legenda_proibida"
    job = [j for j in banco.jobs_do_projeto(con, "p1") if j["etapa"] == "direcao"]
    assert job and job[0]["estado"] == "pendente"
    assert con.execute("SELECT estado FROM versoes WHERE id='v1'").fetchone()["estado"] == "reprovada"
    assert any(x["id"] == r.json()["regra"]["id"] for x in c.get("/v1/memoria").json()["regras"])
