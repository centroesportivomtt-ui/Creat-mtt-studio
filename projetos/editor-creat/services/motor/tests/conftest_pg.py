"""PostgreSQL temporário para os testes, e plugin que roda a suíte INTEIRA contra ele.

- `subir_cluster()`: initdb num diretório temporário, porta aleatória em 127.0.0.1, usuário não-root (como root usa
  `runuser -u postgres`), sem rede externa. Um cluster por processo, derrubado no fim. Devolve (url, None) ou
  (None, motivo) quando não dá (sem binários, sem psycopg, sem usuário).
- Como plugin (`pytest -p conftest_pg`): cada teste ganha um banco novo e EDITOR_BANCO=postgres + DATABASE_URL
  apontando para ele, então todos os `banco.conectar(cfg.banco)` do motor caem no Postgres. Sem servidor, os testes
  rodam no SQLite como sempre (e o resumo avisa).

    PYTHONPATH=.:tests python -m pytest -p conftest_pg -m "not pago and not real and not lento" -q
"""
from __future__ import annotations

import atexit
import os
import pathlib
import shutil
import socket
import subprocess
import tempfile
import uuid

import pytest

PG_BIN = pathlib.Path(os.environ.get("EDITOR_TESTE_PG_BIN", "/usr/lib/postgresql/16/bin"))
_estado: dict = {}


def _porta_livre() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _admin(cluster_url: str, sql: str) -> None:
    psycopg = _estado.get("psycopg")       # guardado ao subir: um teste pode esconder o psycopg do sys.modules
    if psycopg is None:
        import psycopg
    with psycopg.connect(f"{cluster_url}/postgres", autocommit=True) as c:
        c.execute(sql)


def subir_cluster():
    if "url" in _estado or "motivo" in _estado:
        return _estado.get("url"), _estado.get("motivo")
    url, motivo = _subir()
    _estado.update(url=url, motivo=motivo)
    return url, motivo


def _subir():
    if not (PG_BIN / "initdb").exists():
        return None, f"PostgreSQL não encontrado em {PG_BIN}"
    try:
        import psycopg
        _estado["psycopg"] = psycopg
    except ImportError:
        return None, "psycopg não instalado (pip install 'psycopg[binary]==3.2.13')"
    raiz = pathlib.Path(tempfile.mkdtemp(prefix="editor-pg-", dir="/tmp"))
    como = []
    if os.geteuid() == 0:                                  # o postgres recusa rodar como root
        import pwd
        try:
            u = pwd.getpwnam("postgres")
        except KeyError:
            shutil.rmtree(raiz, ignore_errors=True)
            return None, "rodando como root e sem usuário 'postgres' para subir o servidor"
        os.chown(raiz, u.pw_uid, u.pw_gid)
        como = ["runuser", "-u", "postgres", "--"]
    dados_pg, porta = raiz / "dados", _porta_livre()
    try:
        subprocess.run([*como, str(PG_BIN / "initdb"), "-D", str(dados_pg), "-A", "trust", "-U", "postgres",
                        "-E", "UTF8", "--locale=C", "--no-sync"], check=True, capture_output=True, timeout=120)
        opcoes = (f"-p {porta} -k {raiz} -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off "
                  "-c full_page_writes=off -c max_connections=80")
        subprocess.run([*como, str(PG_BIN / "pg_ctl"), "-D", str(dados_pg), "-o", opcoes, "-l", str(raiz / "log"),
                        "-w", "-t", "60", "start"], check=True, capture_output=True, timeout=90)
    except (subprocess.SubprocessError, OSError) as e:
        detalhe = (getattr(e, "stderr", b"") or b"").decode(errors="replace")[:300]
        shutil.rmtree(raiz, ignore_errors=True)
        return None, f"não subiu o PostgreSQL temporário: {e} {detalhe}"

    def derrubar():
        subprocess.run([*como, str(PG_BIN / "pg_ctl"), "-D", str(dados_pg), "-m", "immediate", "stop"],
                       capture_output=True, timeout=60)
        shutil.rmtree(raiz, ignore_errors=True)
    atexit.register(derrubar)
    return f"postgresql://postgres@127.0.0.1:{porta}", None


# ---------------- plugin: a suíte inteira no Postgres ----------------
# Testes que conferem justamente o caso "sem Postgres configurado": aqui não recebem o banco.
SEM_POSTGRES = {"test_sem_estado_recusa_disco_local"}


@pytest.fixture(autouse=True)
def _postgres_por_teste(request, monkeypatch):
    url, _ = subir_cluster()
    if url is None or request.node.originalname in SEM_POSTGRES:
        yield
        return
    nome = "s_" + uuid.uuid4().hex[:12]
    _admin(url, f"CREATE DATABASE {nome}")
    monkeypatch.setenv("EDITOR_BANCO", "postgres")
    monkeypatch.setenv("DATABASE_URL", f"{url}/{nome}")
    yield
    _admin(url, f"DROP DATABASE IF EXISTS {nome} WITH (FORCE)")


def pytest_report_header(config):
    url, motivo = subir_cluster()
    return f"conftest_pg: suíte no Postgres temporário {url}" if url else f"conftest_pg: SEM Postgres ({motivo}); rodando no SQLite"
