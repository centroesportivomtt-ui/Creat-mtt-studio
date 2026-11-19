"""Fase 2: envio direto do navegador ao R2 por multipart pré-assinado, com retomada.
Usa um S3 falso de verdade (moto em servidor local): as URLs assinadas recebem PUT por HTTP, como no navegador."""
import json
import urllib.parse

import pytest

from motor import banco, config

moto = pytest.importorskip("moto.server")
boto3 = pytest.importorskip("boto3")

MB = 1024 * 1024


@pytest.fixture(scope="module")
def s3_url():
    srv = moto.ThreadedMotoServer(ip_address="127.0.0.1", port=0)
    srv.start()
    host, porta = srv.get_host_and_port()
    yield f"http://{host}:{porta}"
    srv.stop()


@pytest.fixture()
def cli(dados, s3_url, monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient

    from motor.api import projetos as P
    from motor.api.app import criar
    from motor.provedores.armazenamento_r2 import ArmazenamentoR2

    monkeypatch.delenv("MOTOR_TOKEN", raising=False)
    monkeypatch.setenv("EDITOR_ENVIO_PARTE_MB", "5")
    monkeypatch.setenv("R2_BUCKET", "creat-editor-midia")
    from botocore.config import Config
    s3 = boto3.client("s3", endpoint_url=s3_url, aws_access_key_id="x", aws_secret_access_key="y", region_name="us-east-1",
                      config=Config(signature_version="s3v4"))
    try:
        s3.create_bucket(Bucket="creat-editor-midia")
    except s3.exceptions.BucketAlreadyOwnedByYou:
        pass
    cfg = config.carregar()
    arm = ArmazenamentoR2(cfg, cliente=s3)
    monkeypatch.setattr(P, "_config", lambda: (cfg, arm))
    con = banco.conectar(cfg.banco)
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, estado, criado, atualizado, dados) VALUES (?,?,?,?,?,?)",
                ("p_teste1", "t", "recebendo", t, t, "{}"))
    return TestClient(criar()), con, arm


def _put(url: str, corpo: bytes) -> str:
    """PUT como o navegador faz com um pedaço do arquivo (sem Content-Type de formulário)."""
    import http.client
    u = urllib.parse.urlsplit(url)
    con = http.client.HTTPConnection(u.hostname, u.port, timeout=30)
    con.request("PUT", f"{u.path}?{u.query}", body=corpo, headers={"Content-Length": str(len(corpo))})
    r = con.getresponse()
    r.read()
    assert r.status == 200, r.status
    return r.getheader("ETag")


def test_envio_inteiro_com_retomada(cli):
    c, con, arm = cli
    dados = bytes(range(256)) * (23 * 1024)          # ~5,75 MB → 2 partes de 5 MB
    r = c.post("/v1/projetos/p_teste1/envios", json={"nome": "Gravação Évora 01.MOV", "bytes": len(dados)})
    assert r.status_code == 201, r.text
    e = r.json()
    assert e["chave"].startswith("entrada/p_teste1/gravacao-evora-01-") and e["chave"].endswith(".mov")
    assert e["parte_bytes"] == 5 * MB and e["partes"] == 2

    urls = c.post(f"/v1/projetos/p_teste1/envios/{e['envio']}/partes", json={"chave": e["chave"], "partes": [1, 2]}).json()["urls"]
    etag1 = _put(urls["1"], dados[:5 * MB])
    # a aba fechou aqui: o navegador pergunta o que já chegou
    v = c.get(f"/v1/projetos/p_teste1/envios/{e['envio']}", params={"chave": e["chave"]})
    assert v.status_code == 200 and [p["parte"] for p in v.json()["partes"]] == [1]
    etag2 = _put(urls["2"], dados[5 * MB:])

    fim = c.post(f"/v1/projetos/p_teste1/envios/{e['envio']}/concluir", json={
        "chave": e["chave"], "nome": "Gravação Évora 01.MOV", "bytes": len(dados),
        "partes": [{"parte": 2, "etag": etag2}, {"parte": 1, "etag": etag1}]})
    assert fim.status_code == 201, fim.text
    assert fim.json()["bytes"] == len(dados) and arm.tamanho(e["chave"]) == len(dados)
    # a resposta se perdeu e o navegador conclui de novo: registra o mesmo arquivo, sem erro nem cópia
    de_novo = c.post(f"/v1/projetos/p_teste1/envios/{e['envio']}/concluir", json={
        "chave": e["chave"], "nome": "Gravação Évora 01.MOV", "bytes": len(dados),
        "partes": [{"parte": 1, "etag": etag1}, {"parte": 2, "etag": etag2}]})
    assert de_novo.status_code == 201 and de_novo.json()["novo"] is False, de_novo.text
    job = con.execute("SELECT etapa FROM jobs WHERE projeto='p_teste1'").fetchone()
    assert job["etapa"] == "ingest"                   # o motor já começa a ler


def test_recusas_na_borda(cli):
    c, con, _ = cli
    assert c.post("/v1/projetos/p_teste1/envios", json={"nome": "virus.exe", "bytes": 10}).status_code == 422
    assert c.post("/v1/projetos/p_nada00/envios", json={"nome": "a.mp4", "bytes": 10}).status_code == 404
    e = c.post("/v1/projetos/p_teste1/envios", json={"nome": "a.mp4", "bytes": 10}).json()
    outro = c.post(f"/v1/projetos/p_teste1/envios/{e['envio']}/partes", json={"chave": "entrada/p_outro1/a.mp4", "partes": [1]})
    assert outro.status_code == 422                   # chave de outro projeto
    ruim = c.post(f"/v1/projetos/p_teste1/envios/{e['envio']}/concluir", json={
        "chave": e["chave"], "nome": "a.mp4", "bytes": 10, "partes": [{"parte": 2, "etag": "x"}]})
    assert ruim.status_code == 422                    # falta a parte 1
    assert c.delete(f"/v1/projetos/p_teste1/envios/{e['envio']}", params={"chave": e["chave"]}).status_code == 204
    assert c.get(f"/v1/projetos/p_teste1/envios/{e['envio']}", params={"chave": e["chave"]}).status_code == 404
    con.execute("UPDATE projetos SET estado='dirigindo' WHERE id='p_teste1'")
    assert c.post("/v1/projetos/p_teste1/envios", json={"nome": "b.mp4", "bytes": 10}).status_code == 409


def test_modo_local_manda_usar_tus(dados, monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient

    from motor.api.app import criar
    monkeypatch.delenv("MOTOR_TOKEN", raising=False)
    monkeypatch.setenv("EDITOR_ARMAZENAMENTO", "local")
    r = TestClient(criar()).post("/v1/projetos/p_teste1/envios", json={"nome": "a.mp4", "bytes": 10})
    assert r.status_code == 409 and "tus" in json.loads(r.text)["detail"]


def test_parte_cresce_para_caber_em_dez_mil():
    from motor.api.envios import tamanho_da_parte
    assert tamanho_da_parte(10 * MB, 64) == 64 * MB
    assert tamanho_da_parte(1000 * 1024 * MB, 64) == 1000 * 1024 * MB // 10_000 + (1 if (1000 * 1024 * MB) % 10_000 else 0)
    assert tamanho_da_parte(1, 1) == 5 * MB
