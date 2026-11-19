"""Revisão independente da fase 2 (banco/Postgres): cada item tem um teste que reproduz o defeito e prova a correção.
Os que dependem de concorrência real rodam nos dois backends (sqlite e postgres); os de conexão caída, só no Postgres."""
import json
import threading
import time

import pytest

from test_banco_pg import backend, cluster_pg, pg_url  # noqa: F401 - fixtures (servidor temporário e os 2 backends)

from motor import banco, config, pipeline, worker


@pytest.fixture()
def con(backend, dados):
    c = banco.conectar(config.carregar().banco)
    yield c
    c.close()


@pytest.fixture()
def cli(backend, dados, monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    monkeypatch.setenv("MOTOR_TOKEN", "tok")
    from motor.api.app import criar
    c = TestClient(criar())
    c.headers.update({"Authorization": "Bearer tok"})
    return c


def _projeto(con, pid="p1", estado="lendo", dados=None):
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, estado, criado, atualizado, dados) VALUES (?,?,?,?,?,?)",
                (pid, "t", estado, t, t, json.dumps(dados or {})))


def _arquivo(con, pid="p1", aid="a001", estado="ingerido"):
    con.execute("INSERT INTO arquivos (id, projeto, nome, chave, bytes, estado, criado) VALUES (?,?,?,?,?,?,?)",
                (aid, pid, aid, f"entrada/{pid}/{aid}.mp4", 1, estado, banco.agora_iso()))


def _worker_lendo_o_ultimo(con, pid="p1"):
    """O worker no meio do 'fechar job + próxima etapa' da última análise: já marcou o arquivo como lido e já olhou
    o projeto (ainda sem o que a rota vai gravar), mas não confirmou a transação."""
    con.execute("BEGIN IMMEDIATE")
    con.execute("UPDATE arquivos SET estado='analisado' WHERE projeto=? AND id='a001'", (pid,))
    assert pipeline.tentar_dirigir(con, pid) is False


def _rota_em_paralelo(fn):
    out = {}
    t = threading.Thread(target=lambda: out.setdefault("r", fn()))
    t.start()
    return t, out


# ---------- item 1: fechar-envio e pedido x worker não deixam o projeto parado ----------
def test_fechar_envio_cruzando_com_o_worker_nao_para_o_projeto(cli, con, backend):
    _projeto(con, dados={"pedido": {"texto": "reel"}})
    _arquivo(con)
    _worker_lendo_o_ultimo(con)
    t, out = _rota_em_paralelo(lambda: cli.post("/v1/projetos/p1/fechar-envio"))
    time.sleep(0.6)                       # a rota chega enquanto o worker ainda não confirmou
    con.execute("COMMIT")
    t.join(30)
    assert out["r"].status_code == 200, out["r"].text
    assert con.execute("SELECT estado FROM jobs WHERE etapa='catalogo' AND projeto='p1'").fetchone() is not None
    assert con.execute("SELECT estado FROM projetos WHERE id='p1'").fetchone()["estado"] == "dirigindo"


def test_pedido_cruzando_com_o_worker_nao_para_o_projeto(cli, con, backend):
    _projeto(con, dados={"envio_fechado": True})
    _arquivo(con)
    _worker_lendo_o_ultimo(con)
    t, out = _rota_em_paralelo(lambda: cli.post("/v1/projetos/p1/pedido", json={"texto": "Reels de 30 s"}))
    time.sleep(0.6)
    con.execute("COMMIT")
    t.join(30)
    assert out["r"].status_code == 201, out["r"].text
    assert con.execute("SELECT estado FROM projetos WHERE id='p1'").fetchone()["estado"] == "dirigindo"


# ---------- item 2: motor exposto não serve documentação ----------
@pytest.mark.parametrize("caminho", ["/openapi.json", "/docs", "/redoc"])
def test_docs_fechados_com_token(dados, monkeypatch, caminho):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    from motor.api.app import criar
    monkeypatch.setenv("MOTOR_TOKEN", "tok")
    c = TestClient(criar())
    assert c.get(caminho).status_code == 404
    assert c.get(caminho, headers={"Authorization": "Bearer tok"}).status_code == 404
    monkeypatch.setenv("MOTOR_TOKEN", "")
    assert TestClient(criar()).get(caminho).status_code == 200          # só na própria máquina, sem token


# ---------- item 3: nenhum evento some do SSE ----------
def test_evento_de_transacao_longa_nao_some_do_cursor(con, backend):
    url = config.carregar().banco

    def solto():
        outra = banco.conectar(url)          # conexão da própria thread (o sqlite3 exige)
        try:
            return banco.emitir(outra, "p1", "solto")
        finally:
            outra.close()
    if True:
        con.execute("BEGIN IMMEDIATE")
        a = banco.emitir(con, "p1", "dentro_da_transacao")          # id alocado, ainda não confirmado
        t, _ = _rota_em_paralelo(solto)
        time.sleep(0.5)
        leitor = banco.conectar(url)
        vistos = [e["id"] for e in banco.eventos_desde(leitor, "p1", 0)]   # o SSE lê aqui no meio
        cursor = max(vistos, default=0)
        con.execute("COMMIT")
        t.join(30)
        vistos += [e["id"] for e in banco.eventos_desde(leitor, "p1", cursor)]
        leitor.close()
        todos = [e["id"] for e in banco.eventos_desde(con, "p1", 0)]
        assert a in todos and len(todos) == 2
        assert sorted(vistos) == sorted(todos), f"o leitor perdeu evento: viu {vistos}, existem {todos}"


def test_muitos_emissores_e_leitor_por_cursor_nao_perdem_evento(con, backend):
    url = config.carregar().banco
    parar, vistos, erros = threading.Event(), [], []

    def emissor(n):
        c = banco.conectar(url)
        try:
            for i in range(15):
                if i % 3 == 0:
                    c.execute("BEGIN IMMEDIATE")
                    banco.emitir(c, "p1", f"t{n}")
                    time.sleep(0.01)
                    c.execute("COMMIT")
                else:
                    banco.emitir(c, "p1", f"s{n}")
        except Exception as e:  # noqa: BLE001
            erros.append(e)
        finally:
            c.close()

    def leitor():
        c, cursor = banco.conectar(url), 0
        try:
            while True:
                fim = parar.is_set()
                for e in banco.eventos_desde(c, "p1", cursor, limite=1000):
                    vistos.append(e["id"])
                    cursor = e["id"]
                if fim:
                    return
                time.sleep(0.003)
        finally:
            c.close()
    tl = threading.Thread(target=leitor)
    tl.start()
    ts = [threading.Thread(target=emissor, args=(n,)) for n in range(5)]
    [t.start() for t in ts]
    [t.join(60) for t in ts]
    parar.set()
    tl.join(30)
    assert not erros, erros
    todos = [e["id"] for e in banco.eventos_desde(con, "p1", 0, limite=1000)]
    assert len(todos) == 75 and vistos == todos


# ---------- item 4: conexão caída e dono do job ----------
def _derrubar_conexoes(url, exceto_pid=None):
    import psycopg
    with psycopg.connect(url, autocommit=True) as c:
        c.execute("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=current_database() "
                  "AND pid <> pg_backend_pid() AND pid <> %s", (exceto_pid or 0,))


def _so_postgres(backend):
    if backend != "postgres":
        pytest.skip("conexão que cai é coisa do Postgres (SQLite é arquivo local)")


def test_batimento_reconecta_depois_de_queda(con, backend):
    _so_postgres(backend)
    url = config.carregar().banco
    banco.enfileirar(con, "ingest", "p1", "a1")
    job = banco.pegar(con, "eu", aluguel_s=1)
    meu_pid = con.execute("SELECT pg_backend_pid() AS p").fetchone()["p"]
    b = worker._Batimento(config.carregar(), job["id"], intervalo=0.15, dono="eu")
    with b:
        time.sleep(0.5)
        _derrubar_conexoes(url, meu_pid)                 # cai a conexão do batimento
        time.sleep(0.2)
        meio = con.execute("SELECT aluguel_ate FROM jobs WHERE id=?", (job["id"],)).fetchone()["aluguel_ate"]
        time.sleep(0.8)
    fim = con.execute("SELECT aluguel_ate FROM jobs WHERE id=?", (job["id"],)).fetchone()["aluguel_ate"]
    assert b.reconexoes >= 1 and fim > meio, (b.reconexoes, meio, fim)


def test_batimento_nao_renova_job_que_virou_de_outro(con, backend):
    banco.enfileirar(con, "ingest", "p1", "a1")
    job = banco.pegar(con, "eu", aluguel_s=1)
    con.execute("UPDATE jobs SET dono='outro', aluguel_ate=1 WHERE id=?", (job["id"],))
    with worker._Batimento(config.carregar(), job["id"], intervalo=0.1, dono="eu"):
        time.sleep(0.4)
    assert con.execute("SELECT aluguel_ate FROM jobs WHERE id=?", (job["id"],)).fetchone()["aluguel_ate"] == 1


def test_rodar_um_fecha_o_job_mesmo_se_a_conexao_cair(con, backend, monkeypatch):
    _so_postgres(backend)
    import motor.worker as W
    url = config.carregar().banco
    _projeto(con, estado="montando")
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v1','p1','montada',?)", (banco.agora_iso(),))
    jid = banco.enfileirar(con, "montagem", "p1", "v1")

    def etapa_que_perde_a_conexao(ctx):
        pid = ctx.con.execute("SELECT pg_backend_pid() AS p").fetchone()["p"]
        import psycopg
        with psycopg.connect(url, autocommit=True) as c:
            c.execute("SELECT pg_terminate_backend(%s)", (pid,))
        time.sleep(0.2)
        return {"versao": "v1"}
    monkeypatch.setattr(W, "obter", lambda nome: etapa_que_perde_a_conexao)
    assert worker.rodar_um(con, config.carregar(), None, "eu") is True
    assert banco.conexao_caiu(con)
    nova = banco.conectar(url)
    try:
        assert nova.execute("SELECT estado FROM jobs WHERE id=?", (jid,)).fetchone()["estado"] == "feito"
        assert nova.execute("SELECT estado FROM jobs WHERE etapa='qa' AND alvo='v1'").fetchone()["estado"] == "pendente"
    finally:
        nova.close()
    # e o laço do worker troca a conexão caída por uma nova
    viva = worker._reconectar(config.carregar(), con, espera=0.01)
    assert viva.execute("SELECT 1 AS um").fetchone()["um"] == 1
    viva.close()


def test_job_que_virou_de_outro_nao_e_concluido_duas_vezes(con, backend, monkeypatch):
    """O aluguel venceu no meio de uma etapa longa e outro worker pegou o job: este não conclui (nem encadeia)."""
    import motor.worker as W
    url = config.carregar().banco
    _projeto(con, estado="montando")
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v1','p1','montada',?)", (banco.agora_iso(),))
    jid = banco.enfileirar(con, "montagem", "p1", "v1")

    def etapa_longa(ctx):
        c = banco.conectar(url)
        c.execute("UPDATE jobs SET dono='outro-worker', tentativas=tentativas+1 WHERE id=?", (jid,))
        c.close()
        return {"versao": "v1"}
    monkeypatch.setattr(W, "obter", lambda nome: etapa_longa)
    worker.rodar_um(con, config.carregar(), None, "eu")
    j = con.execute("SELECT estado, dono FROM jobs WHERE id=?", (jid,)).fetchone()
    assert (j["estado"], j["dono"]) == ("rodando", "outro-worker")
    assert con.execute("SELECT 1 FROM jobs WHERE etapa='qa'").fetchone() is None
    assert "etapa_fim" not in [e["tipo"] for e in banco.eventos_desde(con, "p1")]

    def etapa_quebra(ctx):
        c = banco.conectar(url)
        c.execute("UPDATE jobs SET dono='outro-worker' WHERE id=?", (jid2,))
        c.close()
        raise RuntimeError("quebrou")
    jid2 = banco.enfileirar(con, "qa", "p1", "v9")
    monkeypatch.setattr(W, "obter", lambda nome: etapa_quebra)
    worker.rodar_um(con, config.carregar(), None, "eu")
    assert con.execute("SELECT estado FROM jobs WHERE id=?", (jid2,)).fetchone()["estado"] == "rodando"   # não falhou o job do outro


# ---------- item 5: o esquema automático também fecha a API pública ----------
def test_esquema_automatico_revoga_anon_e_authenticated(cluster_pg):
    import uuid

    import psycopg
    from conftest_pg import _admin
    nome = "a_" + uuid.uuid4().hex[:10]
    _admin(cluster_pg, f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(f"{cluster_pg}/{nome}", autocommit=True) as c:
            for p in ("anon", "authenticated"):
                c.execute(f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='{p}') THEN CREATE ROLE {p} NOLOGIN; END IF; END $$")
            c.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated")
            c.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated")
        banco.conectar(f"{cluster_pg}/{nome}").close()           # caminho automático (sem migration)
        with psycopg.connect(f"{cluster_pg}/{nome}") as c:
            for papel in ("anon", "authenticated"):
                for t in ("projetos", "arquivos", "versoes", "jobs", "eventos"):
                    for priv in ("SELECT", "INSERT", "UPDATE", "DELETE"):
                        assert c.execute("SELECT has_table_privilege(%s, %s, %s)", (papel, f"public.{t}", priv)).fetchone()[0] is False, (papel, t, priv)
                assert c.execute("SELECT has_sequence_privilege(%s, 'public.eventos_id_seq', 'USAGE')", (papel,)).fetchone()[0] is False
            assert all(r[0] for r in c.execute("SELECT relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'"))
    finally:
        _admin(cluster_pg, f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


# ---------- item 6: NUL vira 422 nos dois bancos ----------
def test_texto_com_nul_e_recusado_na_borda(cli, con, backend):
    assert cli.post("/v1/projetos", json={"nome": "a\x00b"}).status_code == 422
    pid = cli.post("/v1/projetos", json={"nome": "ok"}).json()["id"]
    assert cli.post(f"/v1/projetos/{pid}/pedido", json={"texto": "reel\x00"}).status_code == 422
    assert cli.post(f"/v1/projetos/{pid}/arquivos", json={"chave": f"entrada/{pid}/x.mp4", "nome": "x\x00", "bytes": 1}).status_code == 422
    assert cli.post(f"/v1/projetos/{pid}/importar", json={"url": "https://exemplo.com/\x00a.mp4"}).status_code == 422
    assert cli.post(f"/v1/projetos/{pid}/pedido", json={"texto": "Reels de 30 s"}).status_code == 201   # o normal segue


# ---------- item 7: R2 que não lista não fecha o envio em silêncio ----------
def test_fechar_envio_com_r2_fora_responde_503(cli, con, backend, monkeypatch):
    from motor.api import projetos as P
    cfg = config.carregar()

    class R2Fora:
        nome = "r2"

        def listar(self, prefixo):
            raise ConnectionError("R2 fora do ar")
    monkeypatch.setattr(P, "_config", lambda: (cfg, R2Fora()))
    _projeto(con, estado="recebendo", dados={"pedido": {"texto": "x"}})
    _arquivo(con)
    r = cli.post("/v1/projetos/p1/fechar-envio")
    assert r.status_code == 503, r.text
    p = con.execute("SELECT estado, dados FROM projetos WHERE id='p1'").fetchone()
    assert p["estado"] == "recebendo" and not json.loads(p["dados"]).get("envio_fechado")
    assert "aviso" in [e["tipo"] for e in banco.eventos_desde(con, "p1")]
