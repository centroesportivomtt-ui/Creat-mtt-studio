"""Banco do motor (SQLite em WAL): projetos, arquivos, versões, fila de jobs e eventos de status.

Por que SQLite: uma máquina, reinício sem aviso, zero serviço extra. A fila usa "aluguel" (lease):
um job rodando cujo aluguel venceu (máquina reiniciou) volta a ficar disponível sozinho.
Toda etapa é idempotente (pula o que já tem saída válida), então repetir um job é seguro.
Produção com vários workers em máquinas diferentes: trocar por Postgres mantendo esta interface.
"""
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable

ESQUEMA = """
CREATE TABLE IF NOT EXISTS projetos (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'recebendo',
  tipo_video TEXT, criado TEXT NOT NULL, atualizado TEXT NOT NULL, dados TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS arquivos (
  id TEXT NOT NULL, projeto TEXT NOT NULL, nome TEXT NOT NULL, chave TEXT NOT NULL, bytes INTEGER NOT NULL,
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
  aluguel_ate REAL, dono TEXT, entrada TEXT NOT NULL DEFAULT '{}', saida TEXT, erro TEXT,
  criado REAL NOT NULL, atualizado REAL NOT NULL,
  UNIQUE (etapa, projeto, alvo)
);
CREATE INDEX IF NOT EXISTS jobs_fila ON jobs (estado, prioridade, criado);
CREATE TABLE IF NOT EXISTS eventos (
  id INTEGER PRIMARY KEY AUTOINCREMENT, projeto TEXT NOT NULL, ts TEXT NOT NULL, tipo TEXT NOT NULL,
  etapa TEXT, alvo TEXT, progresso REAL, estado TEXT, mensagem TEXT, dados TEXT
);
CREATE INDEX IF NOT EXISTS eventos_proj ON eventos (projeto, id);
CREATE TABLE IF NOT EXISTS nuvem (
  chave TEXT PRIMARY KEY, projeto TEXT NOT NULL, bytes INTEGER NOT NULL DEFAULT 0, estado TEXT NOT NULL DEFAULT 'pendente',
  conferido_em TEXT, erro TEXT, tentativas INTEGER NOT NULL DEFAULT 0, proxima REAL
);
CREATE INDEX IF NOT EXISTS nuvem_proj ON nuvem (projeto, estado);
"""


def agora_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _com_tentativas(fn, tentativas: int = 40, espera: float = 0.25):
    """Abrir o banco no boot disputa o PRAGMA journal_mode=WAL e o esquema entre API e workers (o sqlite devolve 'database is locked'
    sem respeitar o timeout nessa hora). Tenta de novo por até ~10 s; qualquer outro erro sobe na hora."""
    for i in range(tentativas):
        try:
            return fn()
        except sqlite3.OperationalError as e:
            if "locked" not in str(e).lower() and "busy" not in str(e).lower():
                raise
            if i == tentativas - 1:
                raise
            time.sleep(espera)


def conectar(caminho) -> sqlite3.Connection:
    con = sqlite3.connect(str(caminho), timeout=30, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA busy_timeout=30000")
    _com_tentativas(lambda: con.execute("PRAGMA journal_mode=WAL"))
    con.execute("PRAGMA synchronous=NORMAL")
    _com_tentativas(lambda: con.executescript(ESQUEMA))
    return con


def atualizar_dados(con, projeto: str, mexer) -> dict:
    """Lê, muda (mexer(dados) altera o dict no lugar) e grava projetos.dados numa transação só: duas rotas ou um worker
    mexendo ao mesmo tempo não apagam o que o outro gravou. Não pode ser chamada de dentro de outra transação."""
    con.execute("BEGIN IMMEDIATE")
    try:
        r = con.execute("SELECT dados FROM projetos WHERE id=?", (projeto,)).fetchone()
        d = json.loads(r["dados"] or "{}") if r else {}
        mexer(d)
        if r is not None:
            con.execute("UPDATE projetos SET dados=? WHERE id=?", (json.dumps(d), projeto))
        con.execute("COMMIT")
    except BaseException:
        con.execute("ROLLBACK")
        raise
    return d


# ---------------- eventos (status ao vivo) ----------------
def emitir(con, projeto: str, tipo: str, *, etapa=None, alvo=None, progresso=None, estado=None, mensagem=None, dados=None) -> int:
    cur = con.execute(
        "INSERT INTO eventos (projeto, ts, tipo, etapa, alvo, progresso, estado, mensagem, dados) VALUES (?,?,?,?,?,?,?,?,?)",
        (projeto, agora_iso(), tipo, etapa, alvo, progresso, estado, mensagem, json.dumps(dados) if dados is not None else None),
    )
    return cur.lastrowid


def eventos_desde(con, projeto: str, depois_de: int = 0, limite: int = 200) -> list[dict]:
    linhas = con.execute("SELECT * FROM eventos WHERE projeto=? AND id>? ORDER BY id LIMIT ?", (projeto, depois_de, limite)).fetchall()
    out = []
    for r in linhas:
        d = dict(r)
        d["dados"] = json.loads(d["dados"]) if d["dados"] else None
        out.append(d)
    return out


def mudar_estado(con, projeto: str, estado: str, mensagem: str | None = None) -> None:
    con.execute("UPDATE projetos SET estado=?, atualizado=? WHERE id=?", (estado, agora_iso(), projeto))
    emitir(con, projeto, "estado", estado=estado, mensagem=mensagem)


# ---------------- fila ----------------
def enfileirar(con, etapa: str, projeto: str, alvo: str | None = None, entrada: dict | None = None, prioridade: int = 5) -> str:
    """Idempotente por (etapa, projeto, alvo): re-enfileirar um job falho/feito o devolve a 'pendente'."""
    t = time.time()
    jid = uuid.uuid4().hex[:12]
    alvo = alvo or "-"
    con.execute(
        """INSERT INTO jobs (id, etapa, projeto, alvo, prioridade, entrada, criado, atualizado) VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT (etapa, projeto, alvo) DO UPDATE SET
             estado=CASE WHEN jobs.estado='rodando' THEN 'rodando' ELSE 'pendente' END,
             tentativas=CASE WHEN jobs.estado='rodando' THEN jobs.tentativas ELSE 0 END,
             entrada=excluded.entrada, erro=NULL, atualizado=excluded.atualizado""",
        (jid, etapa, projeto, alvo, prioridade, json.dumps(entrada or {}), t, t),
    )
    return con.execute("SELECT id FROM jobs WHERE etapa=? AND projeto=? AND alvo=?", (etapa, projeto, alvo)).fetchone()["id"]


ALUGUEL_S = 120.0   # curto: o worker renova numa thread enquanto a etapa roda; depois de kill -9 o job volta em ~2 min


def recolher_mortos(con) -> list[dict]:
    """Jobs 'rodando' com aluguel vencido e sem tentativa sobrando (o worker morreu de novo e de novo: OOM, reinício).

    Antes ficavam 'rodando' para sempre e o projeto travava calado. Agora viram 'falhou' com erro claro; quem chama
    (worker.rodar_um, numa transação só com pipeline.falha_definitiva) leva o projeto ao estado certo e emite o evento.
    Não abre transação: roda dentro da de quem chama.
    """
    t = time.time()
    linhas = [dict(r) for r in con.execute(
        "SELECT * FROM jobs WHERE estado='rodando' AND aluguel_ate < ? AND tentativas >= max_tentativas", (t,))]
    for r in linhas:
        erro = f"o worker morreu {r['tentativas']} vez(es) rodando esta etapa (falta de memória ou reinício da máquina)"
        con.execute("UPDATE jobs SET estado='falhou', erro=?, aluguel_ate=NULL, atualizado=? WHERE id=?", (erro, t, r["id"]))
        r["estado"], r["erro"] = "falhou", erro
        r["entrada"] = json.loads(r["entrada"] or "{}")
    return linhas


UMA_POR_VEZ = ("entregas", "espelho")


def pegar(con, dono: str, etapas: Iterable[str] | None = None, aluguel_s: float = ALUGUEL_S,
          sem: Iterable[str] | None = None) -> dict | None:
    """Pega o próximo job disponível (pendente, ou rodando com aluguel vencido) de forma atômica.
    `etapas`: só estas; `sem`: todas menos estas (o worker da edição não pega o espelho quando há um worker só para ele)."""
    t = time.time()
    filtro, args = "", []
    if etapas:
        etapas = list(etapas)
        filtro = f" AND etapa IN ({','.join('?' * len(etapas))})"
        args = etapas
    if sem:
        sem = list(sem)
        filtro += f" AND etapa NOT IN ({','.join('?' * len(sem))})"
        args = [*args, *sem]
    con.execute("BEGIN IMMEDIATE")
    try:
        # etapas de fundo que sobem para o Cloudflare rodam UMA de cada vez (cada uma com a sua): duas entregas juntas
        # disputavam o índice e a versão mais nova da página; dois espelhos de GB prenderiam os dois workers
        r = con.execute(
            f"""SELECT * FROM jobs WHERE (estado='pendente' OR (estado='rodando' AND aluguel_ate < ?))
                AND tentativas < max_tentativas {filtro}
                AND NOT (etapa IN ({','.join('?' * len(UMA_POR_VEZ))}) AND EXISTS (
                    SELECT 1 FROM jobs j2 WHERE j2.etapa=jobs.etapa AND j2.id<>jobs.id AND j2.estado='rodando' AND j2.aluguel_ate >= ?))
                ORDER BY prioridade, criado LIMIT 1""",
            [t, *args, *UMA_POR_VEZ, t],
        ).fetchone()
        if r is None:
            con.execute("COMMIT")
            return None
        con.execute(
            "UPDATE jobs SET estado='rodando', dono=?, aluguel_ate=?, tentativas=tentativas+1, atualizado=? WHERE id=?",
            (dono, t + aluguel_s, t, r["id"]),
        )
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise
    d = dict(r)
    d["entrada"] = json.loads(d["entrada"] or "{}")
    d["tentativas"] += 1
    return d


def renovar(con, job_id: str, aluguel_s: float = ALUGUEL_S) -> None:
    """Renova só o aluguel de quem ainda está rodando (não ressuscita job já concluído/falho)."""
    con.execute("UPDATE jobs SET aluguel_ate=? WHERE id=? AND estado='rodando'", (time.time() + aluguel_s, job_id))


def concluir(con, job_id: str, saida: Any = None) -> None:
    con.execute("UPDATE jobs SET estado='feito', saida=?, aluguel_ate=NULL, atualizado=? WHERE id=?",
                (json.dumps(saida) if saida is not None else None, time.time(), job_id))


def falhar(con, job_id: str, erro: str) -> str:
    """Devolve à fila se ainda há tentativa; senão marca 'falhou'. Retorna o estado novo."""
    r = con.execute("SELECT tentativas, max_tentativas FROM jobs WHERE id=?", (job_id,)).fetchone()
    estado = "pendente" if r and r["tentativas"] < r["max_tentativas"] else "falhou"
    con.execute("UPDATE jobs SET estado=?, erro=?, aluguel_ate=NULL, atualizado=? WHERE id=?", (estado, erro[-4000:], time.time(), job_id))
    return estado


def jobs_do_projeto(con, projeto: str) -> list[dict]:
    return [dict(r) for r in con.execute("SELECT id, etapa, alvo, estado, tentativas, erro FROM jobs WHERE projeto=? ORDER BY criado", (projeto,))]
