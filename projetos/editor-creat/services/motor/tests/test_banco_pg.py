"""Postgres no motor: a MESMA bateria de fila/banco (test_fila e test_revisao_crivo) rodando nos dois backends,
mais o que só o Postgres tem (vários workers sem pegar o mesmo job, migration = esquema do adaptador, RLS).

O servidor é um cluster PostgreSQL 16 temporário (initdb num diretório temporário, porta aleatória em 127.0.0.1,
usuário não-root, sem rede externa). Sem binários, sem psycopg ou sem conseguir subir: os testes que precisam do
servidor pulam com o motivo; os testes sem servidor (tradução, escolha de backend, cfg.banco) rodam sempre.
"""
import inspect
import pathlib
import sqlite3
import sys
import threading
import uuid

import pytest

import test_fila as F
import test_revisao_crivo as R
from test_revisao_crivo import cli, con  # noqa: F401 - fixtures usadas pelos cenários do Crivo

from conftest_pg import _admin, subir_cluster
from motor import banco, banco_pg, config

MIGRATION = pathlib.Path(__file__).resolve().parents[3] / "supabase" / "migrations" / "20261118000000_motor_inicial.sql"


# ======================= sem servidor =======================
def test_traduz_placeholders_fora_de_aspas():
    (sql,), _ = banco_pg.traduzir("SELECT * FROM t WHERE a=? AND b='?' AND c LIKE 'x%' AND d=?")
    assert sql == "SELECT * FROM t WHERE a=%s AND b='?' AND c LIKE 'x%%' AND d=%s"
    (sql,), _ = banco_pg.traduzir("SELECT 'it''s ?' , ?")
    assert sql == "SELECT 'it''s ?' , %s"


def test_traduz_begin_immediate_vira_trava_e_pragma_some():
    cmds, _ = banco_pg.traduzir("BEGIN IMMEDIATE")
    assert cmds == ("BEGIN", f"SELECT pg_advisory_xact_lock({banco_pg.TRAVA_ESCRITA})")
    assert banco_pg.traduzir("BEGIN")[0] == ("BEGIN",)
    assert banco_pg.traduzir("PRAGMA journal_mode=WAL")[0] == ()
    assert banco_pg.traduzir("COMMIT")[0] == ("COMMIT",)


def test_traduz_insert_or_replace_e_ignore():
    (sql,), _ = banco_pg.traduzir("INSERT OR REPLACE INTO versoes (id, projeto, estado, criado) VALUES (?,?,?,?)")
    assert sql.startswith("INSERT INTO versoes (id, projeto, estado, criado) VALUES (%s,%s,%s,%s) ON CONFLICT (projeto, id)")
    assert "estado=EXCLUDED.estado" in sql and "criado=EXCLUDED.criado" in sql and "video=DEFAULT" in sql
    (sql,), _ = banco_pg.traduzir("INSERT OR IGNORE INTO projetos (id) VALUES (?)")
    assert sql.endswith("ON CONFLICT DO NOTHING")
    with pytest.raises(ValueError):
        banco_pg.traduzir("INSERT OR REPLACE INTO desconhecida (a) VALUES (?)")


def test_traduz_soma_booleana_e_returning():
    (sql,), _ = banco_pg.traduzir("SELECT SUM(estado='analisado') lidos, SUM(estado NOT IN ('a','b')) p, SUM(bytes) b FROM arquivos")
    assert "SUM(CAST((estado='analisado') AS INTEGER))" in sql
    assert "SUM(CAST((estado NOT IN ('a','b')) AS INTEGER))" in sql and "SUM(bytes)" in sql
    (sql,), devolve = banco_pg.traduzir("INSERT INTO eventos (projeto, ts, tipo) VALUES (?,?,?)")
    assert devolve and sql.endswith("RETURNING id")
    assert banco_pg.traduzir("INSERT INTO jobs (id) VALUES (?)")[1] is False


def test_escolha_de_backend_pelo_destino(tmp_path, monkeypatch):
    c = banco.conectar(tmp_path / "x.db")
    assert isinstance(c, sqlite3.Connection) and not banco.eh_postgres(c)
    c.close()
    c = banco.conectar(str(tmp_path / "y.db"))             # caminho em texto também é SQLite
    assert isinstance(c, sqlite3.Connection)
    c.close()
    chamadas = []
    monkeypatch.setattr(banco_pg, "conectar", lambda url: chamadas.append(url) or "pg")
    assert banco.conectar("postgres://u@h/db") == "pg" and banco.conectar("postgresql://u@h/db") == "pg"
    assert chamadas == ["postgres://u@h/db", "postgresql://u@h/db"]


def test_cfg_banco(dados, monkeypatch):
    monkeypatch.delenv("EDITOR_BANCO", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql://u@h/db")
    assert str(config.carregar().banco).endswith("motor.db")            # padrão: SQLite, mesmo com DATABASE_URL
    monkeypatch.setenv("EDITOR_BANCO", "postgres")
    assert config.carregar().banco == "postgresql://u@h/db"
    monkeypatch.delenv("DATABASE_URL")
    assert str(config.carregar().banco).endswith("motor.db")            # sem a URL, cai no local


def test_sem_psycopg_erro_claro(monkeypatch):
    monkeypatch.setitem(sys.modules, "psycopg", None)
    with pytest.raises(banco_pg.SemPsycopg, match=r"psycopg\[binary\]==3\.2\.13"):
        banco.conectar("postgresql://u@127.0.0.1:1/db")


def test_url_sslmode_e_senha_escondida():
    u = banco_pg.normalizar_url("postgres://postgres.abc:segredo@aws-0-sa-east-1.pooler.supabase.com:6543/postgres")
    assert u.startswith("postgresql://") and "sslmode=require" in u
    assert "sslmode=disable" in banco_pg.normalizar_url("postgresql://u@db.x.supabase.co/p?sslmode=disable")
    assert "sslmode" not in banco_pg.normalizar_url("postgresql://u@127.0.0.1:5432/p")
    assert "segredo" not in banco_pg.url_sem_senha(u) and "***" in banco_pg.url_sem_senha(u)


# ======================= servidor temporário =======================
@pytest.fixture(scope="session")
def cluster_pg():
    url, motivo = subir_cluster()
    if url is None:
        pytest.skip(motivo)
    yield url


@pytest.fixture()
def pg_url(cluster_pg):
    """Um banco novo por teste (isolamento total)."""
    nome = "t_" + uuid.uuid4().hex[:12]
    _admin(cluster_pg, f"CREATE DATABASE {nome}")
    yield f"{cluster_pg}/{nome}"
    _admin(cluster_pg, f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


# ======================= a mesma bateria nos dois backends =======================
CENARIOS = [
    F.test_enfileirar_idempotente_e_pegar,
    F.test_aluguel_vencido_volta_para_fila,
    F.test_falha_tres_vezes_desiste,
    F.test_pipeline_ponta_a_ponta_com_etapas_falsas,
    R.test_job_morto_tres_vezes_vira_falhou_e_projeto_erro,
    R.test_erro_definitivo_na_direcao_leva_projeto_a_erro,
    R.test_arquivo_corrompido_fica_de_fora_e_projeto_segue,
    R.test_todos_os_arquivos_falharam_projeto_erro,
    R.test_depois_que_quebra_nao_deixa_job_feito_sem_seguinte,
    R.test_reconciliar_reaplica_o_depois,
    R.test_batimento_renova_aluguel,
    R.test_pedido_herda_tipo_do_projeto,
    R.test_video_de_versao_nao_entregue_nao_sai,
    R.test_fechar_envio_registra_orfao,
    R.test_reprovar_cancela_a_fila_da_versao_e_recusa_com_direcao_rodando,
]


@pytest.fixture(params=["sqlite", "postgres"])
def backend(request, dados, monkeypatch):
    if request.param == "postgres":
        url = request.getfixturevalue("pg_url")
        monkeypatch.setenv("EDITOR_BANCO", "postgres")
        monkeypatch.setenv("DATABASE_URL", url)
        assert config.carregar().banco == url
    else:
        monkeypatch.delenv("EDITOR_BANCO", raising=False)
        assert str(config.carregar().banco).endswith("motor.db")
    return request.param


@pytest.mark.parametrize("cenario", CENARIOS, ids=[c.__name__.removeprefix("test_") for c in CENARIOS])
def test_mesma_bateria(cenario, backend, request):
    kwargs = {n: request.getfixturevalue(n) for n in inspect.signature(cenario).parameters}
    if "con" in kwargs:
        assert banco.eh_postgres(kwargs["con"]) is (backend == "postgres")
    cenario(**kwargs)


# ======================= só Postgres =======================
@pytest.fixture()
def pg(pg_url):
    c = banco.conectar(pg_url)
    yield c
    c.close()


def test_conexao_compativel_com_pooler(pg):
    assert pg._con.prepare_threshold is None and pg._con.autocommit is True
    assert not pg.in_transaction
    pg.execute("BEGIN IMMEDIATE")
    assert pg.in_transaction
    pg.execute("ROLLBACK")
    assert not pg.in_transaction


def test_lastrowid_e_linhas_por_nome(pg):
    a = banco.emitir(pg, "p1", "x", progresso=0.5, dados={"k": 1})
    b = banco.emitir(pg, "p1", "y")
    assert isinstance(a, int) and b == a + 1
    ev = banco.eventos_desde(pg, "p1")
    assert [e["tipo"] for e in ev] == ["x", "y"] and ev[0]["dados"] == {"k": 1} and ev[0]["progresso"] == 0.5
    assert banco.eventos_desde(pg, "p1", a) == ev[1:]


def test_insert_or_replace_zera_o_que_nao_foi_citado(pg):
    t = banco.agora_iso()
    pg.execute("INSERT INTO versoes (id, projeto, estado, video, criado) VALUES ('v1','p1','montada','x.mp4',?)", (t,))
    pg.execute("INSERT OR REPLACE INTO versoes (id, projeto, estado, criado) VALUES (?,?,?,?)", ("v1", "p1", "montando", t))
    r = pg.execute("SELECT * FROM versoes WHERE projeto='p1'").fetchall()
    assert len(r) == 1 and r[0]["estado"] == "montando" and r[0]["video"] is None      # igual ao SQLite


def test_arquivo_grande_cabe(pg):
    pg.execute("INSERT INTO arquivos (id, projeto, nome, chave, bytes, criado) VALUES (?,?,?,?,?,?)",
               ("a1", "p1", "n", "k", 9 * 1024 ** 3, banco.agora_iso()))          # 9 GB: INTEGER do Postgres estouraria
    assert pg.execute("SELECT bytes FROM arquivos").fetchone()["bytes"] == 9 * 1024 ** 3


def test_varios_workers_nunca_pegam_o_mesmo_job(pg, pg_url):
    for i in range(60):
        banco.enfileirar(pg, "ingest", "p1", f"a{i:03d}", prioridade=i % 3)
    pegos, erros = [], []
    barreira = threading.Barrier(6)

    def worker(n):
        c = banco.conectar(pg_url)
        try:
            barreira.wait()
            while (j := banco.pegar(c, f"w{n}")) is not None:
                pegos.append(j["id"])
        except Exception as e:  # noqa: BLE001
            erros.append(e)
        finally:
            c.close()
    ts = [threading.Thread(target=worker, args=(n,)) for n in range(6)]
    [t.start() for t in ts]
    [t.join(60) for t in ts]
    assert not erros, erros
    assert len(pegos) == 60 and len(set(pegos)) == 60
    donos = {r["dono"] for r in pg.execute("SELECT dono FROM jobs")}
    assert len(donos) > 1                                     # dividiram o trabalho de verdade


def test_pegar_pula_job_travado_por_outro(pg, pg_url):
    """Um worker está no meio de pegar o job A (linha travada): o outro leva o B na hora, sem esperar."""
    a = banco.enfileirar(pg, "ingest", "p1", "a", prioridade=1)
    b = banco.enfileirar(pg, "ingest", "p1", "b", prioridade=2)
    outro = banco.conectar(pg_url)
    try:
        outro.execute("BEGIN")
        outro.execute("SELECT id FROM jobs WHERE id=? FOR UPDATE", (a,))
        j = banco.pegar(pg, "w2")
        assert j["id"] == b
        outro.execute("ROLLBACK")
        assert banco.pegar(pg, "w2")["id"] == a
    finally:
        outro.close()


def _esquema(url):
    import psycopg
    with psycopg.connect(url) as c:
        cols = c.execute("""SELECT table_name, column_name, data_type, is_nullable,
                                   regexp_replace(coalesce(column_default,''), '::[a-z ]+', '', 'g'), ordinal_position
                              FROM information_schema.columns WHERE table_schema='public' ORDER BY 1, 6""").fetchall()
        idx = c.execute("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1").fetchall()
        rls = c.execute("""SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace='public'::regnamespace
                           AND relkind='r' ORDER BY 1""").fetchall()
        pol = c.execute("SELECT count(*) FROM pg_policies WHERE schemaname='public'").fetchone()[0]
    return cols, idx, rls, pol


def test_migration_igual_ao_esquema_do_adaptador(cluster_pg, pg_url):
    import psycopg
    nome = "m_" + uuid.uuid4().hex[:10]
    _admin(cluster_pg, f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(f"{cluster_pg}/{nome}", autocommit=True) as c:
            c.execute(MIGRATION.read_text())
            c.execute(MIGRATION.read_text())                   # idempotente
        banco.conectar(pg_url).close()                         # o motor cria sozinho
        da_migration, do_motor = _esquema(f"{cluster_pg}/{nome}"), _esquema(pg_url)
        assert da_migration == do_motor
        cols, _, rls, pol = da_migration
        assert {r[0] for r in rls} == set(banco_pg.TABELAS) and all(r[1] for r in rls) and pol == 0
        # mesmas colunas, na mesma ordem, que o esquema do SQLite
        sq = sqlite3.connect(":memory:")
        sq.executescript(banco.ESQUEMA)
        for t in banco_pg.TABELAS:
            assert [r[1] for r in sq.execute(f"PRAGMA table_info({t})")] == [r[1] for r in cols if r[0] == t]
        # o motor conecta num banco já migrado sem tentar DDL e funciona
        c = banco.conectar(f"{cluster_pg}/{nome}")
        assert banco.pegar(c, "w") is None and banco.enfileirar(c, "ingest", "p", "a")
        c.close()
    finally:
        _admin(cluster_pg, f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def test_rls_fecha_a_api_publica(cluster_pg):
    """Simula os papéis do Supabase (anon/authenticated com permissão padrão em tabelas novas): depois da migration
    eles não leem nada; e mesmo se alguém devolver a permissão, o RLS sem política não mostra nenhuma linha."""
    import psycopg
    nome = "r_" + uuid.uuid4().hex[:10]
    _admin(cluster_pg, f"CREATE DATABASE {nome}")
    try:
        with psycopg.connect(f"{cluster_pg}/{nome}", autocommit=True) as c:
            for p in ("anon", "authenticated"):
                c.execute(f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='{p}') THEN CREATE ROLE {p} NOLOGIN; END IF; END $$")
            c.execute("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated")
            c.execute(MIGRATION.read_text())
            c.execute("INSERT INTO projetos (id, nome, criado, atualizado) VALUES ('p1','x','t','t')")
            c.execute("SET ROLE anon")
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute("SELECT * FROM projetos")
            c.execute("RESET ROLE")
            c.execute("GRANT SELECT, INSERT ON projetos TO authenticated")
            c.execute("SET ROLE authenticated")
            assert c.execute("SELECT count(*) FROM projetos").fetchone()[0] == 0
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                c.execute("INSERT INTO projetos (id, nome, criado, atualizado) VALUES ('p2','x','t','t')")
            c.execute("RESET ROLE")
    finally:
        _admin(cluster_pg, f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")
