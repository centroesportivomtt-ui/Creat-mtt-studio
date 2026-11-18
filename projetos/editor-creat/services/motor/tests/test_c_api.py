"""Frente C: rotas de versões e publicação (validação na borda, estados, provedor 'nenhuma')."""
import io
import json

import pytest

from motor import banco, config


@pytest.fixture()
def cli(dados, monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    monkeypatch.delenv("MOTOR_TOKEN", raising=False)
    monkeypatch.delenv("EDITOR_PUBLICACAO", raising=False)
    from motor.api.app import criar
    from motor.provedores import armazenamento_de
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado) VALUES ('p1','t',?,?)", (t, t))
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v1','p1','entregue',?)", (t,))
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v2','p1','montando',?)", (t,))
    arm = armazenamento_de(cfg)
    qa = {"versao": "1", "projeto": "p1", "video": "saidas/p1/v1/final.mp4", "aprovado": True,
          "checagens": [{"id": "lufs", "ok": True, "bloqueia": True}, {"id": "legenda_sobre_rosto", "ok": False, "bloqueia": False, "detalhe": "1 cruzamento"}]}
    arm.gravar("saidas/p1/v1/qa.json", io.BytesIO(json.dumps(qa).encode()))
    arm.gravar("saidas/p1/v1/final.mp4", io.BytesIO(b"x"))
    arm.gravar("saidas/p1/v1/entrega.json", io.BytesIO(json.dumps({"link": "/v1/arquivos/saidas/p1/v1/final.mp4", "legenda_post": "oi @creat.mtt"}).encode()))
    return TestClient(criar())


def test_lista_versoes_com_qa(cli):
    r = cli.get("/v1/projetos/p1/versoes")
    assert r.status_code == 200
    vs = {v["id"]: v for v in r.json()["versoes"]}
    assert vs["v1"]["qa_resumo"]["aprovado"] and vs["v1"]["qa_resumo"]["avisos"][0]["id"] == "legenda_sobre_rosto"
    assert vs["v1"]["link"].endswith("final.mp4") and vs["v1"]["legenda_post"] == "oi @creat.mtt"
    assert vs["v2"]["qa_resumo"] is None
    assert cli.get("/v1/projetos/nao/versoes").status_code == 404
    assert cli.get("/v1/projetos/a..b/versoes").status_code in (404, 422)


def test_publicar(cli):
    assert cli.post("/v1/projetos/p1/versoes/v2/publicar", json={}).status_code == 409
    assert cli.post("/v1/projetos/p1/versoes/v9/publicar", json={}).status_code == 404
    assert cli.post("/v1/projetos/p1/versoes/v1/publicar", json={"rede": "orkut"}).status_code == 422
    assert cli.post("/v1/projetos/p1/versoes/v1/publicar", json={"quando": "amanhã"}).status_code == 422
    r = cli.post("/v1/projetos/p1/versoes/v1/publicar", json={"rede": "instagram"})
    assert r.status_code == 200 and r.json()["publicado"] is False and "link" in r.json()
