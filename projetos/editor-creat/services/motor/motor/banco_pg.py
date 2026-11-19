"""Postgres (Supabase) para o motor, com a MESMA cara da conexão sqlite3 que os chamadores já usam.

Por que um adaptador fino e não reescrever as dezenas de chamadores: todo o motor fala `con.execute("... ?", (...))`,
lê linhas por nome (`r["estado"]`, `dict(r)`), usa `lastrowid`, `in_transaction` e abre transação com
`BEGIN IMMEDIATE`. Aqui isso é traduzido para Postgres na hora (com cache):

- placeholders `?` → `%s` (e `%` literal → `%%`), ignorando o que está dentro de aspas;
- `BEGIN IMMEDIATE` → `BEGIN` + trava consultiva da transação (`pg_advisory_xact_lock`): é o "um escritor por vez" do
  SQLite, só nos blocos que já pediam isso (checar-e-alocar do envio, fechar job + próxima etapa). A fila NÃO usa essa
  trava: `pegar` é `FOR UPDATE SKIP LOCKED`, então vários workers/contêineres pegam jobs diferentes ao mesmo tempo;
- `INSERT OR REPLACE` → `INSERT ... ON CONFLICT (chave) DO UPDATE` (coluna não citada volta ao DEFAULT, como no SQLite,
  que apaga e insere de novo); `INSERT OR IGNORE` → `ON CONFLICT DO NOTHING`;
- `SUM(estado='x')` → `SUM(CAST((estado='x') AS INTEGER))` (Postgres não soma booleano);
- `INSERT INTO eventos` ganha `RETURNING id` para `lastrowid`;
- `PRAGMA` vira nada;
- escrita (INSERT/UPDATE/DELETE) fora de transação roda num BEGIN curto com a MESMA trava consultiva: é o que o SQLite
  faz (toda escrita espera quem está num BEGIN IMMEDIATE). Sem isso, uma rota que escreve solta (pedido, fechar envio)
  cruza com o "fechar job + próxima etapa" do worker e o projeto para; e o id do evento (BIGSERIAL) poderia ser
  alocado antes e confirmado depois de um mais novo, e o SSE (cursor id>?) pularia o evento. Com a trava, a ordem dos
  ids é a ordem de confirmação.

Compatível com o pooler do Supabase (porta 6543, modo transação): sem prepared statement persistente
(`prepare_threshold=None`), autocommit fora dos blocos BEGIN/COMMIT e conexões curtas. `sslmode` da URL é respeitado;
host do Supabase sem `sslmode` ganha `sslmode=require`. O navegador nunca fala com o banco: RLS ligado e sem política
(só o motor entra, pela DATABASE_URL, como dono das tabelas).
"""
from __future__ import annotations

import re
import threading
import time
from functools import lru_cache
from typing import Any, Iterable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

DIALETO = "postgres"
VERSAO_PSYCOPG = "3.2.13"          # versão testada (extra "postgres" do pyproject)
TRAVA_ESCRITA = 7_240_511_801      # chave da trava consultiva que imita o BEGIN IMMEDIATE do SQLite
TRAVA_ESQUEMA = 7_240_511_802

TABELAS = ("projetos", "arquivos", "versoes", "jobs", "eventos")

# Esquema equivalente ao banco.ESQUEMA (SQLite). Mantido idêntico a supabase/migrations/*_motor_inicial.sql
# (o teste test_banco_pg.py compara as colunas, os índices e o RLS dos dois).
ESQUEMA_PG = """
CREATE TABLE IF NOT EXISTS projetos (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'recebendo',
  tipo_video TEXT, criado TEXT NOT NULL, atualizado TEXT NOT NULL, dados TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS arquivos (
  id TEXT NOT NULL, projeto TEXT NOT NULL, nome TEXT NOT NULL, chave TEXT NOT NULL, bytes BIGINT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'recebido', criado TEXT NOT NULL, PRIMARY KEY (projeto, id)
);
CREATE TABLE IF NOT EXISTS versoes (
  id TEXT NOT NULL, projeto TEXT NOT NULL, estado TEXT NOT NULL, video TEXT, qa TEXT, link TEXT,
  reprovacao TEXT, criado TEXT NOT NULL, PRIMARY KEY (projeto, id)
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, etapa TEXT NOT NULL, projeto TEXT NOT NULL, alvo TEXT,
  estado TEXT NOT NULL DEFAULT 'pendente', prioridade INTEGER NOT NULL DEFAULT 5,
  tentativas INTEGER NOT NULL DEFAULT 0, max_tentativas INTEGER NOT NULL DEFAULT 3,
  aluguel_ate DOUBLE PRECISION, dono TEXT, entrada TEXT NOT NULL DEFAULT '{}', saida TEXT, erro TEXT,
  criado DOUBLE PRECISION NOT NULL, atualizado DOUBLE PRECISION NOT NULL,
  UNIQUE (etapa, projeto, alvo)
);
CREATE INDEX IF NOT EXISTS jobs_fila ON jobs (estado, prioridade, criado);
CREATE INDEX IF NOT EXISTS jobs_proj ON jobs (projeto);
CREATE TABLE IF NOT EXISTS eventos (
  id BIGSERIAL PRIMARY KEY, projeto TEXT NOT NULL, ts TEXT NOT NULL, tipo TEXT NOT NULL,
  etapa TEXT, alvo TEXT, progresso DOUBLE PRECISION, estado TEXT, mensagem TEXT, dados TEXT
);
CREATE INDEX IF NOT EXISTS eventos_proj ON eventos (projeto, id);
ALTER TABLE projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
-- Reforço: tira qualquer permissão dos papéis da API pública do Supabase (no Postgres comum esses papéis não existem).
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.projetos, public.arquivos, public.versoes, public.jobs, public.eventos FROM %I', papel);
      EXECUTE format('REVOKE ALL ON SEQUENCE public.eventos_id_seq FROM %I', papel);
    END IF;
  END LOOP;
END $$;
"""

# Colunas e chave de cada tabela (para traduzir INSERT OR REPLACE).
COLUNAS = {
    "projetos": (("id",), ("nome", "estado", "tipo_video", "criado", "atualizado", "dados")),
    "arquivos": (("projeto", "id"), ("nome", "chave", "bytes", "estado", "criado")),
    "versoes": (("projeto", "id"), ("estado", "video", "qa", "link", "reprovacao", "criado")),
    "jobs": (("id",), ("etapa", "projeto", "alvo", "estado", "prioridade", "tentativas", "max_tentativas", "aluguel_ate",
                       "dono", "entrada", "saida", "erro", "criado", "atualizado")),
}
COM_ID_SERIAL = {"eventos"}


class SemPsycopg(RuntimeError):
    pass


def _psycopg():
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as e:   # import tardio: quem usa SQLite não precisa do pacote
        raise SemPsycopg(
            "EDITOR_BANCO=postgres precisa do psycopg 3: pip install 'psycopg[binary]==" + VERSAO_PSYCOPG + "' "
            "(extra 'postgres' do pyproject). Sem ele, tire EDITOR_BANCO ou DATABASE_URL para usar o SQLite local."
        ) from e
    return psycopg, dict_row


def eh_url_postgres(destino) -> bool:
    return isinstance(destino, str) and destino.split("://", 1)[0].lower() in ("postgres", "postgresql")


def normalizar_url(url: str) -> str:
    """postgres:// → postgresql://; host do Supabase sem sslmode ganha sslmode=require (o da URL sempre vence)."""
    partes = urlsplit(url)
    esquema = "postgresql"
    consulta = dict(parse_qsl(partes.query, keep_blank_values=True))
    host = (partes.hostname or "").lower()
    if "sslmode" not in consulta and (host.endswith(".supabase.co") or host.endswith(".supabase.com")):
        consulta["sslmode"] = "require"
    return urlunsplit((esquema, partes.netloc, partes.path, urlencode(consulta), partes.fragment))


def url_sem_senha(url: str) -> str:
    """Para log e mensagem de erro: nunca a senha."""
    p = urlsplit(url)
    netloc = p.netloc
    if "@" in netloc:
        cred, hostp = netloc.rsplit("@", 1)
        netloc = f"{cred.split(':', 1)[0]}:***@{hostp}"
    return urlunsplit((p.scheme, netloc, p.path, "", ""))


# ---------------- tradução do SQL ----------------
def _trocar_placeholders(sql: str) -> str:
    """`?` → `%s` e `%` → `%%`, fora de aspas simples/duplas."""
    out, i, n = [], 0, len(sql)
    while i < n:
        c = sql[i]
        if c in ("'", '"'):
            j = i + 1
            while j < n:
                if sql[j] == c:
                    if j + 1 < n and sql[j + 1] == c:   # aspas dobradas = aspas literal
                        j += 2
                        continue
                    break
                j += 1
            out.append(sql[i:j + 1].replace("%", "%%"))
            i = j + 1
            continue
        out.append("%s" if c == "?" else "%%" if c == "%" else c)
        i += 1
    return "".join(out)


_COMPARA = re.compile(r"(=|<|>|\bIN\b|\bIS\b|\bLIKE\b)", re.IGNORECASE)


def _somas_booleanas(sql: str) -> str:
    """SUM(expr de comparação) → SUM(CAST((expr) AS INTEGER)). SUM de coluna numérica fica como está."""
    out, i = [], 0
    padrao = re.compile(r"\bSUM\s*\(", re.IGNORECASE)
    while True:
        m = padrao.search(sql, i)
        if not m:
            out.append(sql[i:])
            return "".join(out)
        ini, prof, j = m.end(), 1, m.end()
        while j < len(sql) and prof:
            prof += {"(": 1, ")": -1}.get(sql[j], 0)
            j += 1
        dentro = sql[ini:j - 1]
        out.append(sql[i:m.start()])
        if _COMPARA.search(dentro) and not dentro.strip().upper().startswith("CAST("):
            out.append(f"SUM(CAST(({_somas_booleanas(dentro)}) AS INTEGER))")
        else:
            out.append(f"SUM({_somas_booleanas(dentro)})")
        i = j


_INSERT_OU = re.compile(r"^\s*INSERT\s+OR\s+(REPLACE|IGNORE)\s+INTO\s+(\w+)\s*\(([^)]*)\)", re.IGNORECASE | re.DOTALL)
_INSERT = re.compile(r"^\s*INSERT\s+INTO\s+(\w+)", re.IGNORECASE)
_ESCRITA = re.compile(r"^\s*(INSERT|UPDATE|DELETE)\b", re.IGNORECASE)
_BEGIN = re.compile(r"^\s*BEGIN(\s+(DEFERRED|IMMEDIATE|EXCLUSIVE))?(\s+TRANSACTION)?\s*;?\s*$", re.IGNORECASE)


@lru_cache(maxsize=512)
def traduzir(sql: str) -> tuple[tuple[str, ...], bool]:
    """SQL do motor (dialeto SQLite) → (comandos Postgres, devolve_id). Puro e com cache: testável sem servidor."""
    m = _BEGIN.match(sql)
    if m:
        modo = (m.group(2) or "").upper()
        if modo in ("IMMEDIATE", "EXCLUSIVE"):
            return ("BEGIN", f"SELECT pg_advisory_xact_lock({TRAVA_ESCRITA})"), False
        return ("BEGIN",), False
    if re.match(r"^\s*PRAGMA\b", sql, re.IGNORECASE):
        return (), False
    s = _somas_booleanas(sql)
    m = _INSERT_OU.match(s)
    if m:
        verbo, tabela, cols = m.group(1).upper(), m.group(2).lower(), [c.strip().lower() for c in m.group(3).split(",")]
        s = re.sub(r"^\s*INSERT\s+OR\s+(REPLACE|IGNORE)\s+INTO", "INSERT INTO", s, count=1, flags=re.IGNORECASE)
        s = s.rstrip().rstrip(";")
        if verbo == "IGNORE":
            s += " ON CONFLICT DO NOTHING"
        else:
            if tabela not in COLUNAS:
                raise ValueError(f"INSERT OR REPLACE em tabela sem chave conhecida no adaptador Postgres: {tabela}")
            chave, resto = COLUNAS[tabela]
            sets = ", ".join(f"{c}=EXCLUDED.{c}" if c in cols else f"{c}=DEFAULT" for c in resto)
            s += f" ON CONFLICT ({', '.join(chave)}) DO UPDATE SET {sets}"
    devolve_id = False
    m = _INSERT.match(s)
    if m and m.group(1).lower() in COM_ID_SERIAL and not re.search(r"\bRETURNING\b", s, re.IGNORECASE):
        s = s.rstrip().rstrip(";") + " RETURNING id"
        devolve_id = True
    return (_trocar_placeholders(s),), devolve_id


# ---------------- conexão com cara de sqlite3 ----------------
class _CursorVazio:
    lastrowid = None
    rowcount = -1
    description = None

    def fetchone(self):
        return None

    def fetchall(self):
        return []

    def fetchmany(self, n=1):
        return []

    def __iter__(self):
        return iter(())


class Cursor:
    """Cursor do psycopg com `lastrowid` (o id do RETURNING) e o resto igual ao do sqlite3."""

    def __init__(self, cur, lastrowid=None):
        self._cur, self.lastrowid = cur, lastrowid

    @property
    def rowcount(self):
        return self._cur.rowcount

    @property
    def description(self):
        return self._cur.description

    def fetchone(self):
        return self._cur.fetchone() if self._cur.description else None

    def fetchall(self):
        return self._cur.fetchall() if self._cur.description else []

    def fetchmany(self, n=1):
        return self._cur.fetchmany(n) if self._cur.description else []

    def __iter__(self):
        return iter(self._cur) if self._cur.description else iter(())


class ConexaoPG:
    dialeto = DIALETO

    def __init__(self, bruta):
        self._con = bruta

    def execute(self, sql: str, params: Iterable[Any] = ()):
        comandos, devolve_id = traduzir(sql)
        if not comandos:
            return _CursorVazio()
        args = tuple(params) if params is not None else ()
        cur = None
        if len(comandos) == 1 and _ESCRITA.match(comandos[0]) and not self.in_transaction:
            self._con.execute(f"BEGIN; SELECT pg_advisory_xact_lock({TRAVA_ESCRITA})")
            try:
                cur = self._con.execute(comandos[0], args)
                linha = cur.fetchone() if devolve_id else None
                self._con.execute("COMMIT")
            except BaseException:
                if not self.quebrada:
                    self._con.execute("ROLLBACK")
                raise
            return Cursor(cur, linha["id"] if linha else None) if devolve_id else Cursor(cur)
        for i, c in enumerate(comandos):
            cur = self._con.execute(c, args if i == len(comandos) - 1 else ())
        if devolve_id:
            linha = cur.fetchone()
            return Cursor(cur, linha["id"] if linha else None)
        return Cursor(cur)

    def executescript(self, script: str):
        self._con.execute(script)     # sem parâmetros: vários comandos num envio só

    @property
    def in_transaction(self) -> bool:
        from psycopg.pq import TransactionStatus
        return self._con.info.transaction_status != TransactionStatus.IDLE

    def commit(self):
        if self.in_transaction:
            self._con.execute("COMMIT")

    def rollback(self):
        if self.in_transaction:
            self._con.execute("ROLLBACK")

    def close(self):
        self._con.close()

    @property
    def closed(self) -> bool:
        return self._con.closed

    @property
    def quebrada(self) -> bool:
        """A conexão caiu (servidor reiniciou, pooler cortou, rede): só reconectando."""
        return bool(self._con.closed or self._con.broken)

    def __enter__(self):
        return self

    def __exit__(self, tipo, *_):
        (self.rollback if tipo else self.commit)()
        return False


_esquema_pronto: set[str] = set()
_trava_esquema = threading.Lock()


def _garantir_esquema(con: ConexaoPG, url: str) -> None:
    """Cria as tabelas uma vez por processo. Se já existem (migration aplicada no Supabase), nem tenta DDL.
    Vários workers subindo juntos não brigam: a criação roda sob trava consultiva."""
    if url in _esquema_pronto:
        return
    with _trava_esquema:
        if url in _esquema_pronto:
            return
        faltam = [t for t in TABELAS
                  if con.execute("SELECT to_regclass(?) AS r", (f"public.{t}",)).fetchone()["r"] is None]
        if faltam:
            con._con.execute("BEGIN")
            try:
                con._con.execute(f"SELECT pg_advisory_xact_lock({TRAVA_ESQUEMA})")
                con._con.execute(ESQUEMA_PG)
                con._con.execute("COMMIT")
            except BaseException:
                con._con.execute("ROLLBACK")
                raise
        _esquema_pronto.add(url)


def conectar(url: str, *, timeout_s: float = 15.0) -> ConexaoPG:
    psycopg, dict_row = _psycopg()
    alvo = normalizar_url(url)
    try:
        bruta = psycopg.connect(alvo, autocommit=True, row_factory=dict_row, prepare_threshold=None,
                                connect_timeout=int(timeout_s), application_name="editor-creat-motor")
    except psycopg.OperationalError as e:
        raise RuntimeError(f"não conectou no Postgres {url_sem_senha(alvo)}: {str(e).strip()[:300]}") from e
    con = ConexaoPG(bruta)
    _garantir_esquema(con, alvo)
    return con


# ---------------- fila (só o que muda de verdade no Postgres) ----------------
def pegar(con: ConexaoPG, dono: str, etapas: list[str] | None, aluguel_s: float) -> dict | None:
    """Um comando só, atômico, sem trava global: o SELECT ... FOR UPDATE SKIP LOCKED pula o job que outro worker está
    pegando neste instante, então dois contêineres nunca levam o mesmo job. Devolve a linha como era ANTES do UPDATE
    (igual ao SQLite); quem chama soma a tentativa."""
    t = time.time()
    filtro, args = "", [t]
    if etapas:
        filtro = f" AND etapa IN ({','.join('%s' for _ in etapas)})"
        args += list(etapas)
    sql = f"""
        WITH alvo AS (
          SELECT * FROM jobs
           WHERE (estado='pendente' OR (estado='rodando' AND aluguel_ate < %s))
             AND tentativas < max_tentativas{filtro}
           ORDER BY prioridade, criado
           LIMIT 1
           FOR UPDATE SKIP LOCKED
        ), feito AS (
          UPDATE jobs j SET estado='rodando', dono=%s, aluguel_ate=%s, tentativas=j.tentativas+1, atualizado=%s
            FROM alvo WHERE j.id = alvo.id
          RETURNING j.id
        )
        SELECT alvo.* FROM alvo JOIN feito ON feito.id = alvo.id"""
    r = con._con.execute(sql, (*args, dono, t + aluguel_s, t)).fetchone()
    return dict(r) if r else None
