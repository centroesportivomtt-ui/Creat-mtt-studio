"""Frente A: rotas de projetos/arquivos/importar/fechar-envio/eventos/arquivos (TestClient, sem rede)."""
import json

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture()
def cli(dados, monkeypatch):
    monkeypatch.setenv("MOTOR_TOKEN", "tok-teste")
    from motor.api.app import criar
    c = TestClient(criar())
    c.headers.update({"Authorization": "Bearer tok-teste"})
    return c


@pytest.fixture()
def arm(dados):
    from motor import config
    from motor.provedores.armazenamento_local import ArmazenamentoLocal
    return ArmazenamentoLocal(config.carregar())


def test_token_obrigatorio(cli):
    assert cli.get("/v1/saude").status_code == 200
    assert cli.get("/v1/saude", headers={"Authorization": "Bearer errado"}).status_code == 401


def test_criar_listar_ver(cli):
    r = cli.post("/v1/projetos", json={"nome": "  Bastidor   creat ", "tipo_video": "bastidor"})
    assert r.status_code == 201 and r.json()["nome"] == "Bastidor creat" and r.json()["estado"] == "recebendo"
    pid = r.json()["id"]
    assert any(p["id"] == pid for p in cli.get("/v1/projetos").json())
    v = cli.get(f"/v1/projetos/{pid}").json()
    assert v["arquivos"] == [] and v["jobs"] == []
    assert cli.get("/v1/projetos/p_naoexiste").status_code == 404


@pytest.mark.parametrize("corpo", [{"nome": ""}, {"nome": "   "}, {"nome": "x", "tipo_video": "novela"}, {"nome": "x" * 121}, {}])
def test_criar_invalido(cli, corpo):
    assert cli.post("/v1/projetos", json=corpo).status_code == 422


def test_registrar_arquivo(cli, arm):
    pid = cli.post("/v1/projetos", json={"nome": "t"}).json()["id"]
    assert cli.post(f"/v1/projetos/{pid}/arquivos", json={"chave": "entrada/outro/a.mov", "nome": "a.mov", "bytes": 1}).status_code == 422
    assert cli.post(f"/v1/projetos/{pid}/arquivos", json={"chave": f"entrada/{pid}/../x.mov", "nome": "a", "bytes": 1}).status_code == 422
    assert cli.post(f"/v1/projetos/{pid}/arquivos", json={"chave": f"entrada/{pid}/a.mov", "nome": "a.mov", "bytes": 4}).status_code == 409
    arm.gravar_bytes(f"entrada/{pid}/a.mov", b"abcd")
    assert cli.post(f"/v1/projetos/{pid}/arquivos", json={"chave": f"entrada/{pid}/a.mov", "nome": "a.mov", "bytes": 5}).status_code == 409
    r = cli.post(f"/v1/projetos/{pid}/arquivos", json={"chave": f"entrada/{pid}/a.mov", "nome": "a.mov", "bytes": 4})
    assert r.status_code == 201 and r.json() == {"id": "a001", "novo": True, "chave": f"entrada/{pid}/a.mov", "bytes": 4}
    r2 = cli.post(f"/v1/projetos/{pid}/arquivos", json={"chave": f"entrada/{pid}/a.mov", "nome": "a.mov", "bytes": 4})
    assert r2.json()["id"] == "a001" and r2.json()["novo"] is False           # idempotente pela chave
    jobs = cli.get(f"/v1/projetos/{pid}").json()["jobs"]
    assert [(j["etapa"], j["alvo"], j["estado"]) for j in jobs] == [("ingest", "a001", "pendente")]


def test_importar(cli):
    pid = cli.post("/v1/projetos", json={"nome": "t"}).json()["id"]
    assert cli.post(f"/v1/projetos/{pid}/importar", json={"url": "https://evil.example.com/v.mov"}).status_code == 422
    r = cli.post(f"/v1/projetos/{pid}/importar", json={"url": "https://drive.google.com/drive/folders/1AbCdEfGhIjKl"})
    assert r.status_code == 422 and "Pasta do Google Drive" in r.json()["detail"]
    r = cli.post(f"/v1/projetos/{pid}/importar", json={"url": "https://www.dropbox.com/scl/fi/abc/v.mov?rlkey=k&dl=0"})
    assert r.status_code == 202 and r.json()["id"] == "a001"
    j = cli.get(f"/v1/projetos/{pid}").json()["jobs"][0]
    assert j["etapa"] == "ingest"


def test_fechar_envio_e_sse(cli, arm):
    pid = cli.post("/v1/projetos", json={"nome": "t"}).json()["id"]
    assert cli.post(f"/v1/projetos/{pid}/fechar-envio").status_code == 409
    arm.gravar_bytes(f"entrada/{pid}/a.mov", b"abcd")
    cli.post(f"/v1/projetos/{pid}/arquivos", json={"chave": f"entrada/{pid}/a.mov", "nome": "a.mov", "bytes": 4})
    r = cli.post(f"/v1/projetos/{pid}/fechar-envio")
    assert r.status_code == 200 and r.json()["dirigindo"] is False
    assert cli.get(f"/v1/projetos/{pid}").json()["estado"] == "lendo"
    r = cli.get(f"/v1/projetos/{pid}/eventos?seguir=false")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    evs = [json.loads(l[6:]) for l in r.text.splitlines() if l.startswith("data: ")]
    assert [e["tipo"] for e in evs] == ["projeto_criado", "arquivo_recebido", "estado"]
    ultimo = evs[1]["id"]
    r = cli.get(f"/v1/projetos/{pid}/eventos?seguir=false", headers={"Last-Event-ID": str(ultimo)})
    assert [json.loads(l[6:])["tipo"] for l in r.text.splitlines() if l.startswith("data: ")] == ["estado"]
    assert cli.get("/v1/projetos/p_x/eventos?seguir=false").status_code == 404
    # projeto já dirigindo não aceita arquivo novo
    from motor import banco, config
    con = banco.conectar(config.carregar().banco)
    banco.mudar_estado(con, pid, "montando")
    arm.gravar_bytes(f"entrada/{pid}/b.mov", b"x")
    assert cli.post(f"/v1/projetos/{pid}/arquivos", json={"chave": f"entrada/{pid}/b.mov", "nome": "b", "bytes": 1}).status_code == 409


def test_servir_com_range(cli, arm):
    arm.gravar_bytes("saidas/p1/v1/final.mp4", bytes(range(256)) * 4)
    from motor import banco, config
    con = banco.conectar(config.carregar().banco)
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v1','p1','entregue',?)", (banco.agora_iso(),))
    con.close()
    r = cli.get("/v1/arquivos/saidas/p1/v1/final.mp4")
    assert r.status_code == 200 and len(r.content) == 1024 and r.headers["accept-ranges"] == "bytes"
    r = cli.get("/v1/arquivos/saidas/p1/v1/final.mp4", headers={"Range": "bytes=10-19"})
    assert r.status_code == 206 and r.content == bytes(range(10, 20)) and r.headers["content-range"] == "bytes 10-19/1024"
    r = cli.get("/v1/arquivos/saidas/p1/v1/final.mp4", headers={"Range": "bytes=-4"})
    assert r.status_code == 206 and r.content == bytes(range(252, 256))
    r = cli.get("/v1/arquivos/saidas/p1/v1/final.mp4", headers={"Range": "bytes=2000-"})
    assert r.status_code == 416 and r.headers["content-range"] == "bytes */1024"
    assert cli.get("/v1/arquivos/saidas/p1/v1/nada.mp4").status_code == 404
    arm.gravar_bytes("projetos/p1/pedido.json", b"{}")
    assert cli.get("/v1/arquivos/projetos/p1/pedido.json").status_code == 403
    assert cli.get("/v1/arquivos/saidas/%2E%2E/motor.db").status_code in (400, 404)
    assert cli.head("/v1/arquivos/saidas/p1/v1/final.mp4").headers["content-length"] == "1024"
