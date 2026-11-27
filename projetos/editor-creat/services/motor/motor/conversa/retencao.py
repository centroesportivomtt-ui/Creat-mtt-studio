"""Prazo de guarda das conversas (onda 3, seção 9).

Capítulos da conversa fechados há mais de EDITOR_CONVERSA_RETENCAO_DIAS (padrão 90; 0 = guardar para sempre) têm as
mensagens (conversa_msgs), os eventos da conversa e a linha do capítulo apagados. Roda pelo worker (worker.limpezas, a cada
15 min). Nunca toca:
- o capítulo aberto (fechado IS NULL nunca entra na lista);
- a pergunta ou o cartão esperando o dono (conversa_espera): se o turno da espera aparece num capítulo vencido, o projeto é
  pulado nesta volta;
- os eventos da mesa (etapa_*, passo, decisao, estado, cliente e aviso sem {acao: "retomar"}).

Por que o corte `ts < f_max` é exato: abrir_capitulo fecha o capítulo k e abre o k+1 com o MESMO carimbo (repo.py), e
capítulo novo só nasce fora de turno. Todo evento de capítulo mais novo tem ts >= f_max; o `<` estrito guarda o que caiu
no mesmo segundo.
Sem json_extract (não confirmado no SQLite da imagem): o aviso de retomar é conferido em Python.
"""
from __future__ import annotations

import json
import logging
import time

from motor import config

log = logging.getLogger("motor.conversa.retencao")

TIPOS_CONVERSA = ("fala_dono", "fala_editor", "ferramenta", "pergunta", "confirmacao", "resposta", "turno_fim", "mostrar")


def _iso(t: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


def corte(dias: int, agora: float | None = None) -> str:
    return _iso((agora if agora is not None else time.time()) - dias * 86400)


def volta(con, agora: float | None = None, *, dias: int | None = None) -> dict:
    """Uma volta da limpeza. Idempotente (a segunda volta apaga 0). Devolve as contagens."""
    out = {"capitulos": 0, "mensagens": 0, "eventos": 0, "pulados": 0}
    if dias is None:
        dias = config.carregar().retencao_conversa_dias
    if not dias or dias <= 0:
        return out
    c = corte(int(dias), agora)
    vencidos: dict[str, list[tuple[int, str]]] = {}
    for r in con.execute("SELECT projeto, capitulo, fechado FROM conversa_capitulos WHERE fechado IS NOT NULL AND fechado < ? "
                         "ORDER BY projeto, capitulo", (c,)).fetchall():
        vencidos.setdefault(r["projeto"], []).append((int(r["capitulo"]), r["fechado"]))
    for pid, caps in vencidos.items():
        nums = [n for n, _ in caps]
        f_max = max(f for _, f in caps)
        q = ",".join("?" * len(nums))
        con.execute("BEGIN IMMEDIATE")
        try:
            esperas = [r["turno"] for r in con.execute("SELECT turno FROM conversa_espera WHERE projeto=?", (pid,))]
            presa = False
            for t in esperas:
                if con.execute(f"SELECT 1 FROM conversa_msgs WHERE projeto=? AND capitulo IN ({q}) AND turno=? LIMIT 1",
                               (pid, *nums, t)).fetchone():
                    presa = True
                    break
            if presa:
                con.execute("ROLLBACK")
                out["pulados"] += 1
                log.warning("retenção: %s pulado (uma pergunta ou cartão esperando o dono é de um capítulo vencido)", pid)
                continue
            n_msgs = con.execute(f"DELETE FROM conversa_msgs WHERE projeto=? AND capitulo IN ({q})", (pid, *nums)).rowcount
            qt = ",".join("?" * len(TIPOS_CONVERSA))
            n_ev = con.execute(f"DELETE FROM eventos WHERE projeto=? AND ts < ? AND tipo IN ({qt})", (pid, f_max, *TIPOS_CONVERSA)).rowcount
            retomar = []
            for r in con.execute("SELECT id, dados FROM eventos WHERE projeto=? AND ts < ? AND tipo='aviso' AND dados IS NOT NULL",
                                 (pid, f_max)).fetchall():
                try:
                    d = json.loads(r["dados"] or "{}")
                except ValueError:
                    continue
                if isinstance(d, dict) and d.get("acao") == "retomar":
                    retomar.append(r["id"])
            for i in retomar:
                n_ev += con.execute("DELETE FROM eventos WHERE id=? AND projeto=?", (i, pid)).rowcount
            n_caps = con.execute(f"DELETE FROM conversa_capitulos WHERE projeto=? AND capitulo IN ({q}) AND fechado IS NOT NULL",
                                 (pid, *nums)).rowcount
            con.execute("COMMIT")
        except BaseException:
            con.execute("ROLLBACK")
            raise
        out["capitulos"] += n_caps
        out["mensagens"] += n_msgs
        out["eventos"] += n_ev
    if out["capitulos"] or out["pulados"]:
        log.info("retenção da conversa: %s", out)
    return out
