"""Tabelas da conversa e montagem do histórico enviado à API (plano 5.1 e 5.2).

Papéis em conversa_msgs:
- user: texto do dono (ou a ficha do capítulo, montada pelo código). Só texto escrito pelo dono ou pelo código.
- assistant: o conteúdo EXATO que a API devolveu (model_dump de cada bloco, thinking e signature inclusos).
  `uso` guarda {"ate_id": <última linha enviada naquela chamada>, tokens, custo}.
- parcial: tool_result já pronto ou mensagem do dono que chegou no meio do turno.

Regra que protege o raciocínio guardado (a API recusa histórico editado antes de um bloco de thinking):
cada assistant leva `ate_id`. As linhas de id <= ate_id que vieram antes dele formam a mensagem user que foi
enviada; as de id > ate_id (o dono escreveu enquanto o modelo respondia) passam para DEPOIS dele. Assim a
requisição N+1 começa byte a byte com a N (teste A1.5). Linhas user seguidas viram UMA mensagem.
Na mensagem user, os tool_result vêm primeiro, na ordem dos tool_use do assistant anterior; depois o texto.
"""
from __future__ import annotations

import json
import secrets

from motor import banco


def novo_turno() -> str:
    return "t_" + secrets.token_hex(5)


def _j(x) -> str:
    return json.dumps(x, ensure_ascii=False, separators=(",", ":"))


# ---------------- capítulos ----------------
def capitulo_atual(con, pid: str) -> dict | None:
    r = con.execute("SELECT * FROM conversa_capitulos WHERE projeto=? AND fechado IS NULL ORDER BY capitulo DESC LIMIT 1", (pid,)).fetchone()
    return dict(r) if r else None


def abrir_capitulo(con, pid: str, *, modelo: str, prompt_versao: str, ferramentas_versao: str, system: list, tools: list) -> dict:
    agora = banco.agora_iso()
    con.execute("UPDATE conversa_capitulos SET fechado=? WHERE projeto=? AND fechado IS NULL", (agora, pid))
    n = con.execute("SELECT COALESCE(MAX(capitulo),0)+1 n FROM conversa_capitulos WHERE projeto=?", (pid,)).fetchone()["n"]
    con.execute("INSERT INTO conversa_capitulos (projeto, capitulo, modelo, prompt_versao, ferramentas_versao, system_json, tools_json, criado) "
                "VALUES (?,?,?,?,?,?,?,?)", (pid, n, modelo, prompt_versao, ferramentas_versao, _j(system), _j(tools), agora))
    return capitulo_atual(con, pid)


# ---------------- mensagens ----------------
def anexar(con, pid: str, capitulo: int, papel: str, conteudo: list, turno: str, *, cliente_msg_id: str | None = None,
           uso: dict | None = None) -> int:
    cur = con.execute("INSERT INTO conversa_msgs (projeto, capitulo, papel, conteudo, turno, cliente_msg_id, uso, criado) VALUES (?,?,?,?,?,?,?,?)",
                      (pid, capitulo, papel, _j(conteudo), turno, cliente_msg_id, _j(uso) if uso is not None else None, banco.agora_iso()))
    return cur.lastrowid


def linhas(con, pid: str, capitulo: int) -> list[dict]:
    out = []
    for r in con.execute("SELECT * FROM conversa_msgs WHERE projeto=? AND capitulo=? ORDER BY id", (pid, capitulo)):
        d = dict(r)
        d["conteudo"] = json.loads(d["conteudo"])
        d["uso"] = json.loads(d["uso"]) if d["uso"] else None
        out.append(d)
    return out


def ultimo_id(con, pid: str, capitulo: int) -> int:
    r = con.execute("SELECT COALESCE(MAX(id),0) m FROM conversa_msgs WHERE projeto=? AND capitulo=?", (pid, capitulo)).fetchone()
    return int(r["m"])


def por_cliente_msg_id(con, pid: str, cmid: str) -> dict | None:
    r = con.execute("SELECT id, turno, papel FROM conversa_msgs WHERE projeto=? AND cliente_msg_id=?", (pid, cmid)).fetchone()
    return dict(r) if r else None


def _tool_uses(conteudo: list) -> list[dict]:
    return [b for b in conteudo if isinstance(b, dict) and b.get("type") == "tool_use"]


def _mensagem_user(grupo: list[dict], ordem_ids: list[str]) -> dict:
    resultados, outros = [], []
    for ln in grupo:
        for b in ln["conteudo"]:
            (resultados if b.get("type") == "tool_result" else outros).append(b)
    pos = {i: n for n, i in enumerate(ordem_ids)}
    resultados.sort(key=lambda b: pos.get(b.get("tool_use_id"), len(pos)))
    return {"role": "user", "content": resultados + outros}


def montar_historico(rows: list[dict]) -> tuple[list[dict], int]:
    """Lista de mensagens para a API + id da última linha incluída (vai para o `ate_id` do assistant que responder)."""
    msgs: list[dict] = []
    pend: list[dict] = []
    ids_ant: list[str] = []
    for r in rows:
        if r["papel"] == "assistant":
            corte = int((r.get("uso") or {}).get("ate_id", r["id"]))
            antes = [p for p in pend if p["id"] <= corte]
            pend = [p for p in pend if p["id"] > corte]
            if antes:
                msgs.append(_mensagem_user(antes, ids_ant))
            msgs.append({"role": "assistant", "content": r["conteudo"]})
            ids_ant = [b.get("id") for b in _tool_uses(r["conteudo"])]
        elif r["papel"] in ("user", "parcial"):
            pend.append(r)
    if pend:
        msgs.append(_mensagem_user(pend, ids_ant))
    ate = max((r["id"] for r in rows), default=0)
    return msgs, ate


def historico(con, pid: str, capitulo: int) -> tuple[list[dict], int]:
    return montar_historico(linhas(con, pid, capitulo))


def pendencias(con, pid: str, capitulo: int) -> list[dict]:
    """tool_use do último assistant sem tool_result (nem em parcial, nem em user posterior)."""
    rows = linhas(con, pid, capitulo)
    ult = next((i for i in range(len(rows) - 1, -1, -1) if rows[i]["papel"] == "assistant"), None)
    if ult is None:
        return []
    respondidos = {b.get("tool_use_id") for r in rows[ult + 1:] for b in r["conteudo"] if b.get("type") == "tool_result"}
    return [t for t in _tool_uses(rows[ult]["conteudo"]) if t.get("id") not in respondidos]


def tem_fila(con, pid: str, capitulo: int) -> bool:
    """Há texto do dono depois do último assistant (chegou no meio do turno e ainda não foi lido)?"""
    rows = linhas(con, pid, capitulo)
    ult = next((i for i in range(len(rows) - 1, -1, -1) if rows[i]["papel"] == "assistant"), None)
    if ult is None:
        return any(r["papel"] in ("user", "parcial") for r in rows)
    corte = int((rows[ult].get("uso") or {}).get("ate_id", rows[ult]["id"]))
    tardias = [r for r in rows[:ult] if r["papel"] in ("user", "parcial") and r["id"] > corte] + rows[ult + 1:]
    return any(b.get("type") == "text" for r in tardias for b in r["conteudo"])


def ultima_util(con, pid: str, capitulo: int) -> str | None:
    r = con.execute("SELECT papel FROM conversa_msgs WHERE projeto=? AND capitulo=? ORDER BY id DESC LIMIT 1", (pid, capitulo)).fetchone()
    return r["papel"] if r else None


def falas_recentes(con, pid: str, n: int = 5) -> list[dict]:
    """Últimas falas do fio (para a ficha de um capítulo novo): do dono (fala_dono) e do Nimbus (fala_editor)."""
    rs = con.execute("SELECT tipo, dados FROM eventos WHERE projeto=? AND tipo IN ('fala_dono','fala_editor') ORDER BY id DESC LIMIT ?", (pid, n)).fetchall()
    out = []
    for r in reversed(rs):
        d = json.loads(r["dados"] or "{}")
        out.append({"quem": "dono" if r["tipo"] == "fala_dono" else "nimbus", "texto": str(d.get("texto", ""))})
    return out


# ---------------- espera (pergunta ou cartão pendente) ----------------
def espera(con, pid: str) -> dict | None:
    r = con.execute("SELECT * FROM conversa_espera WHERE projeto=?", (pid,)).fetchone()
    if r is None:
        return None
    d = dict(r)
    d["cartao"] = json.loads(d["cartao"])
    return d


def gravar_espera(con, pid: str, *, tipo: str, tool_use_id: str, turno: str, cartao: dict, entrada_hash: str | None = None) -> None:
    con.execute("INSERT INTO conversa_espera (projeto, tipo, tool_use_id, turno, entrada_hash, cartao, desde) VALUES (?,?,?,?,?,?,?)",
                (pid, tipo, tool_use_id, turno, entrada_hash, _j(cartao), banco.agora_iso()))


def tomar_espera(con, pid: str, tool_use_id: str) -> bool:
    """Decisão única: apaga a espera daquele tool_use. True só para quem apagou (o segundo toque recebe False)."""
    cur = con.execute("DELETE FROM conversa_espera WHERE projeto=? AND tool_use_id=?", (pid, tool_use_id))
    return cur.rowcount == 1


def todas_esperas(con) -> list[dict]:
    rs = con.execute("SELECT e.projeto, p.nome, e.tipo, e.desde FROM conversa_espera e JOIN projetos p ON p.id=e.projeto ORDER BY e.desde").fetchall()
    return [dict(r) for r in rs]
