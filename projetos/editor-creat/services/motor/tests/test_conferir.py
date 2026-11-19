"""GET /v1/conferir em modo fixture: SQLite, Postgres temporário (conftest_pg, se houver servidor), S3 falso local,
Modal falsa. Nada de rede real; nenhum segredo pode aparecer na resposta."""
import asyncio
import http.server
import json
import sqlite3
import sys
import threading
import time
import types

import pytest

pytest.importorskip("fastapi")


def _cfg():
    from motor import config
    return config.carregar()


def _rodar(**k):
    from motor.api.conferir import conferir_tudo
    return asyncio.run(conferir_tudo(_cfg(), **k))


@pytest.fixture()
def base(dados, monkeypatch):
    for n in ("EDITOR_ARMAZENAMENTO", "EDITOR_RENDER", "EDITOR_CEREBRO", "EDITOR_BANCO", "DATABASE_URL", "EDITOR_SEM_ESTADO",
              "ANTHROPIC_API_KEY", "MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET", "R2_ENDPOINT", "R2_ACCOUNT_ID", "R2_BUCKET",
              "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "EDITOR_TRANSCRICAO", "EDITOR_VISAO", "EDITOR_PUBLICACAO"):
        monkeypatch.delenv(n, raising=False)
    monkeypatch.setenv("MOTOR_TOKEN", "tok-conferir-123456")
    return dados


# ---------------------------------------------------------------- banco
def test_sqlite_ok_e_resto_desligado(base):
    from motor import banco
    banco.conectar(_cfg().banco).close()
    r = _rodar()
    s = r["servicos"]
    assert s["banco"]["estado"] == "ok" and "sqlite" in s["banco"]["detalhe"]
    assert {s[n]["estado"] for n in ("r2", "modal", "cerebro")} == {"desligado"}
    assert s["variaveis"]["estado"] == "ok"
    assert r["resumo"]["estado"] == "ok" and set(r["resumo"]["desligados"]) == {"r2", "modal", "cerebro"}
    assert all(isinstance(x["ms"], int) for x in s.values())


def test_sqlite_sem_tabelas_e_sem_arquivo(base):
    cfg = _cfg()
    r = _rodar()
    assert r["servicos"]["banco"]["estado"] == "falhou" and "não existe" in r["servicos"]["banco"]["detalhe"]
    assert not cfg.banco.exists()                                   # só leitura: não criou o arquivo
    con = sqlite3.connect(cfg.banco)
    con.execute("CREATE TABLE projetos (id TEXT)")
    con.close()
    d = _rodar()["servicos"]["banco"]
    assert d["estado"] == "falhou" and "arquivos" in d["detalhe"] and "eventos" in d["detalhe"]
    nomes = {x[0] for x in sqlite3.connect(cfg.banco).execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert nomes == {"projetos"}                                    # nada foi criado pela conferência


def test_postgres_temporario_le_sem_criar(base, monkeypatch):
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
    try:
        from conftest_pg import _admin, subir_cluster
    except Exception:  # noqa: BLE001
        pytest.skip("conftest_pg indisponível")
    url, motivo = subir_cluster()
    if url is None:
        pytest.skip(f"sem Postgres temporário: {motivo}")
    from motor import banco
    vazio, cheio = "c_vazio_" + str(int(time.time() * 1000)), "c_cheio_" + str(int(time.time() * 1000))
    _admin(url, f"CREATE DATABASE {vazio}")
    _admin(url, f"CREATE DATABASE {cheio}")
    try:
        monkeypatch.setenv("EDITOR_BANCO", "postgres")
        monkeypatch.setenv("DATABASE_URL", f"{url}/{vazio}")
        d = _rodar()["servicos"]["banco"]
        assert d["estado"] == "falhou" and "faltam as tabelas" in d["detalhe"] and "postgres" in d["detalhe"]
        d = _rodar()["servicos"]["banco"]
        assert "faltam as tabelas" in d["detalhe"]                   # continua vazio: a conferência não criou nada
        monkeypatch.setenv("DATABASE_URL", f"{url}/{cheio}")
        banco.conectar(f"{url}/{cheio}").close()                    # o motor cria o esquema (não a conferência)
        d = _rodar()["servicos"]["banco"]
        assert d["estado"] == "ok" and d["detalhe"].startswith("postgres")
    finally:
        _admin(url, f"DROP DATABASE IF EXISTS {vazio} WITH (FORCE)")
        _admin(url, f"DROP DATABASE IF EXISTS {cheio} WITH (FORCE)")


def test_postgres_fora_do_ar_mascara_senha(base, monkeypatch):
    pytest.importorskip("psycopg")
    monkeypatch.setenv("EDITOR_BANCO", "postgres")
    monkeypatch.setenv("DATABASE_URL", "postgresql://editor:SenhaSuperSecreta987@127.0.0.1:1/motor")
    monkeypatch.setenv("EDITOR_CONFERIR_TIMEOUT_S", "6")
    r = _rodar()
    assert r["servicos"]["banco"]["estado"] == "falhou"
    assert "SenhaSuperSecreta987" not in json.dumps(r)
    assert r["servicos"]["variaveis"]["estado"] == "ok"            # uma checagem falhar não derruba as outras


# ---------------------------------------------------------------- R2 (S3 falso)
class _S3Falso(http.server.BaseHTTPRequestHandler):
    modo = "ok"
    vistos: list = []
    CORS = ("<CORSConfiguration><CORSRule><AllowedOrigin>*</AllowedOrigin><AllowedMethod>GET</AllowedMethod>"
            "{put}<ExposeHeader>Content-Length</ExposeHeader>{etag}</CORSRule></CORSConfiguration>")

    def log_message(self, *a):
        pass

    def _responder(self, status, corpo=b"", tipo="application/xml"):
        self.send_response(status)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        if self.command == "PUT":
            self.send_header("ETag", '"abc"')
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corpo)

    def _tratar(self):
        tam = int(self.headers.get("Content-Length") or 0)
        if tam:
            self.rfile.read(tam)
        type(self).vistos.append((self.command, self.path))
        if not self.path.startswith("/balde"):
            return self._responder(404, b"<Error><Code>NoSuchBucket</Code></Error>")
        if self.command == "GET" and "cors" in self.path:
            if self.modo == "sem_cors":
                return self._responder(404, b"<Error><Code>NoSuchCORSConfiguration</Code><Message>x</Message></Error>")
            put = "" if self.modo == "sem_put" else "<AllowedMethod>PUT</AllowedMethod>"
            etag = "" if self.modo == "sem_etag" else "<ExposeHeader>ETag</ExposeHeader>"
            return self._responder(200, self.CORS.format(put=put, etag=etag).encode())
        if self.command == "DELETE":
            return self._responder(204)
        return self._responder(200)

    do_HEAD = do_GET = do_PUT = do_DELETE = _tratar


@pytest.fixture()
def s3(base, monkeypatch):
    pytest.importorskip("boto3")
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _S3Falso)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    _S3Falso.modo, _S3Falso.vistos = "ok", []
    monkeypatch.setenv("NO_PROXY", "127.0.0.1,localhost")
    monkeypatch.setenv("no_proxy", "127.0.0.1,localhost")
    monkeypatch.setenv("EDITOR_ARMAZENAMENTO", "r2")
    monkeypatch.setenv("R2_ENDPOINT", f"http://127.0.0.1:{srv.server_address[1]}")
    monkeypatch.setenv("R2_BUCKET", "balde")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "AKIAFALSOCONFERIR")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "segredoR2QueNuncaPodeSair")
    yield _S3Falso
    srv.shutdown()


def test_r2_so_leitura_por_padrao(s3):
    from motor.api.conferir import checar_r2
    det = checar_r2(_cfg())
    assert "PUT" in det and "ETag" in det
    assert {m for m, _ in s3.vistos} == {"HEAD", "GET"}             # sem escrita: nenhum PUT/DELETE


def test_r2_escrita_grava_e_apaga(s3):
    from motor.api.conferir import checar_r2
    assert "apagou" in checar_r2(_cfg(), escrita=True)
    metodos = [(m, p) for m, p in s3.vistos if m in ("PUT", "DELETE")]
    assert [m for m, _ in metodos] == ["PUT", "DELETE"] and all("/balde/.conferir/" in p for _, p in metodos)


@pytest.mark.parametrize("modo,trecho", [("sem_etag", "ETag"), ("sem_put", "sem PUT"), ("sem_cors", "SEM CORS")])
def test_r2_cors_incompleto_reprova(s3, modo, trecho):
    s3.modo = modo
    r = _rodar()["servicos"]["r2"]
    assert r["estado"] == "falhou" and trecho in r["detalhe"]


def test_r2_variaveis_faltando_por_nome(base, monkeypatch):
    monkeypatch.setenv("EDITOR_ARMAZENAMENTO", "r2")
    r = _rodar()
    assert r["servicos"]["r2"]["estado"] == "falhou" and "R2_BUCKET" in r["servicos"]["r2"]["detalhe"]
    v = r["servicos"]["variaveis"]
    assert v["estado"] == "falhou" and "R2_SECRET_ACCESS_KEY" in v["detalhe"] and "R2_ACCOUNT_ID" in v["detalhe"]


# ---------------------------------------------------------------- Modal e cérebro
def test_modal_confere_sem_executar(base, monkeypatch):
    chamado = {"hydrate": 0, "remote": 0}

    class F:
        def hydrate(self):
            chamado["hydrate"] += 1
            return self

        def remote(self, *a):
            chamado["remote"] += 1
    m = types.ModuleType("modal")
    m.Function = types.SimpleNamespace(from_name=lambda app, nome: F())
    monkeypatch.setitem(sys.modules, "modal", m)
    monkeypatch.setenv("EDITOR_RENDER", "modal")
    r = _rodar()["servicos"]
    assert r["modal"]["estado"] == "falhou" and "MODAL_TOKEN_ID" in r["modal"]["detalhe"]
    monkeypatch.setenv("MODAL_TOKEN_ID", "ak-modal-id-falso")
    monkeypatch.setenv("MODAL_TOKEN_SECRET", "as-modal-segredo-falso")
    r = _rodar()["servicos"]
    assert r["modal"]["estado"] == "ok" and chamado == {"hydrate": 1, "remote": 0}


def test_modal_erro_com_segredo_e_mascarado(base, monkeypatch):
    monkeypatch.setenv("EDITOR_RENDER", "modal")
    monkeypatch.setenv("MODAL_TOKEN_ID", "ak-modal-id-falso")
    monkeypatch.setenv("MODAL_TOKEN_SECRET", "as-modal-segredo-falso")

    def quebra(app, nome):
        raise RuntimeError("auth falhou com token as-modal-segredo-falso em https://u:p4ss@api.modal.com")
    m = types.ModuleType("modal")
    m.Function = types.SimpleNamespace(from_name=quebra)
    monkeypatch.setitem(sys.modules, "modal", m)
    r = _rodar()["servicos"]["modal"]
    assert r["estado"] == "falhou"
    assert "as-modal-segredo-falso" not in r["detalhe"] and "p4ss" not in r["detalhe"]


def test_cerebro_nunca_chama_a_api(base, monkeypatch):
    monkeypatch.setitem(sys.modules, "anthropic", None)             # se importasse, quebraria
    monkeypatch.setenv("EDITOR_CEREBRO", "anthropic")
    r = _rodar()["servicos"]
    assert r["cerebro"]["estado"] == "falhou" and "ANTHROPIC_API_KEY" in r["variaveis"]["detalhe"]
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-api03-chavefalsaquenaopodesair")
    r = _rodar()
    assert r["servicos"]["cerebro"]["estado"] == "ok" and "chavefalsa" not in json.dumps(r)


# ---------------------------------------------------------------- máscara, prazo e rota
def test_mascarar_tira_todo_tipo_de_segredo(monkeypatch):
    from motor.api.conferir import mascarar
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "Zm9vYmFyU2VncmVkb0xvbmdv")
    monkeypatch.setenv("DATABASE_URL", "postgresql://postgres.abc:SenhaDoBanco42@aws-0.pooler.supabase.com:6543/postgres")
    msg = ("erro: Zm9vYmFyU2VncmVkb0xvbmdv · conectando em postgresql://postgres.abc:SenhaDoBanco42@aws-0.pooler.supabase.com:6543/postgres"
           " · Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def · https://r2/x?X-Amz-Signature=deadbeef1234&X-Amz-Credential=AKIA123"
           " · password=hunter2hunter · sk-ant-api03-abcdefghijklmnop")
    out = mascarar(msg, limite=2000)
    for segredo in ("Zm9vYmFyU2VncmVkb0xvbmdv", "SenhaDoBanco42", "eyJhbGciOiJIUzI1NiJ9", "deadbeef1234", "AKIA123", "hunter2hunter",
                    "abcdefghijklmnop"):
        assert segredo not in out, segredo
    assert out.startswith("erro: *** · conectando em ***")          # o resto da mensagem continua útil
    assert len(mascarar("x" * 1000)) <= 240


def test_checagem_lenta_nao_segura_as_outras(base, monkeypatch):
    from motor.api.conferir import conferir_tudo
    monkeypatch.setenv("EDITOR_CONFERIR_TIMEOUT_S", "0.5")

    def lenta():
        time.sleep(2)
        return "nunca"

    def quebra():
        raise ValueError("falhou de propósito")
    t0 = time.monotonic()
    r = asyncio.run(conferir_tudo(_cfg(), checagens={"lenta": lenta, "rapida": lambda: "ok rápido", "quebra": quebra}))
    assert time.monotonic() - t0 < 1.5
    s = r["servicos"]
    assert s["lenta"]["estado"] == "falhou" and "0.5" in s["lenta"]["detalhe"]
    assert s["rapida"] == {"estado": "ok", "detalhe": "ok rápido", "ms": s["rapida"]["ms"]}
    assert s["quebra"]["estado"] == "falhou" and r["resumo"]["falhas"] == ["lenta", "quebra"]


def test_rota_autenticada_e_sem_segredo(base, monkeypatch):
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient

    from motor import banco
    from motor.api.app import criar
    banco.conectar(_cfg().banco).close()
    monkeypatch.setenv("EDITOR_CEREBRO", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-api03-outrachavefalsa")
    c = TestClient(criar())
    assert c.get("/v1/conferir").status_code == 401
    r = c.get("/v1/conferir", headers={"Authorization": "Bearer tok-conferir-123456"})
    assert r.status_code == 200
    corpo = r.json()
    assert set(corpo["servicos"]) == {"banco", "r2", "modal", "cerebro", "variaveis"} and corpo["escrita"] is False
    assert corpo["resumo"]["estado"] == "ok"
    assert "tok-conferir-123456" not in r.text and "outrachavefalsa" not in r.text
