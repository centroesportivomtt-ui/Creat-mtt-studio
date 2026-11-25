"""O laço do Nimbus: Messages API com streaming, ferramentas, pergunta que pausa e cartão com toque (plano seção 5).

Roda no processo da API (uvicorn, um processo só; trava <dados>/conversa.lock com flock, D16). Estado em memória:
só o rascunho do bloco de texto atual (vai ao SSE v2 como evento sem id) e as tarefas rodando. Todo o resto mora no
SQLite: mensagens, capítulo, espera, eventos. Toda escrita do laço vai por asyncio.to_thread.

Garantias que o código impõe (não o prompt):
- histórico sempre válido: fechar_pendencias no fim de todo turno, no boot e antes de nova mensagem (C1);
- nada que gasta ou refaz roda sem o toque do dono: propor_* só cria cartão; executa no POST /confirmar com o mesmo
  entrada_hash, guarda de estado de novo, trava por projeto e decisão única (D6);
- teto do dia travado em US$ 3 com pré-voo no pior caso antes de CADA chamada (D17);
- no máximo 8 chamadas por turno, 1 turno por projeto e 3 no processo.
"""
from __future__ import annotations

import asyncio
import fcntl
import json
import logging
import os
import pathlib
import secrets
import threading
import time

from motor import banco, config
from motor.cerebro import gastos, orcamento
from motor.conversa import acoes, ferramentas, preferencia, repo, teto

log = logging.getLogger("motor.conversa")

PROMPT_VERSAO = "nimbus-1"
MAX_VOLTAS = 8
MAX_TURNOS_PROCESSO = 3
CAPITULO_MAX_TOKENS = 60000
MAX_SAIDA = teto.MAX_SAIDA
CACHE_RECENTE_S = 55 * 60
BETA_FALLBACK = "server-side-fallback-2026-07-01"
BETA_ANDAMENTO = "thinking-display-updates-2026-08-18"
CACHE_1H = {"type": "ephemeral", "ttl": "1h"}
TEXTO_AJUSTE_FEITO = "Pedido de ajuste enviado. A direção recomeça; acompanhe na mesa."
TEXTO_PEDIDO_FEITO = "Pedido trocado."
TEXTO_PEDIDO_DIRIGINDO = "Pedido trocado. A edição começou; acompanhe na mesa."


class ErroConversa(Exception):
    def __init__(self, status: int, detalhe: str):
        super().__init__(detalhe)
        self.status, self.detalhe = status, detalhe


def prompt_sistema() -> str:
    return (pathlib.Path(__file__).parent / "prompts" / "nimbus.md").read_text(encoding="utf-8").strip()


def _system_e_tools() -> tuple[list, list]:
    return [{"type": "text", "text": prompt_sistema(), "cache_control": dict(CACHE_1H)}], ferramentas.para_api()


def _j(x) -> str:
    return json.dumps(x, ensure_ascii=False, separators=(",", ":"))


# ---------------- banco (sempre chamado dentro de asyncio.to_thread) ----------------
class _Con:
    def __init__(self, cfg):
        self.cfg = cfg

    def __enter__(self):
        self.con = banco.conectar(self.cfg.banco)
        return self.con

    def __exit__(self, *a):
        self.con.close()


def _emitir_sync(cfg, pid: str, tipo: str, dados: dict, etapa=None, alvo=None) -> int:
    with _Con(cfg) as con:
        return banco.emitir(con, pid, tipo, etapa=etapa, alvo=alvo, dados=dados)


def _tool_result(tool_use_id: str, conteudo, erro: bool = False) -> dict:
    b = {"type": "tool_result", "tool_use_id": tool_use_id, "content": conteudo if isinstance(conteudo, str) else _j(conteudo)}
    if erro:
        b["is_error"] = True
    return b


def fechar_pendencias(con, pid: str, motivo: str, turno: str = "sistema") -> int:
    """Todo tool_use do último assistant sem tool_result ganha um tool_result de erro, a não ser o que espera o dono
    (pergunta ou cartão em conversa_espera). Assim a próxima requisição nunca leva tool_use sem par."""
    cap = repo.capitulo_atual(con, pid)
    if cap is None:
        return 0
    esp = repo.espera(con, pid)
    pend = [t for t in repo.pendencias(con, pid, cap["capitulo"]) if not (esp and esp["tool_use_id"] == t.get("id"))]
    if pend:
        repo.anexar(con, pid, cap["capitulo"], "parcial", [_tool_result(t["id"], f"não executado: {motivo}", True) for t in pend], turno)
    return len(pend)


def _contexto_tokens(rows: list[dict]) -> int:
    for r in reversed(rows):
        if r["papel"] == "assistant" and r.get("uso"):
            u = r["uso"]
            return int(u.get("entrada", 0)) + int(u.get("entrada_cache", 0)) + int(u.get("cache_escrito", 0)) + int(u.get("cache_escrito_1h", 0)) + int(u.get("saida", 0))
    return 0


def _precisa_capitulo(con, cfg, pid: str, cap: dict | None) -> bool:
    if cap is None:
        return True
    if cap["prompt_versao"] != PROMPT_VERSAO or cap["ferramentas_versao"] != ferramentas.FERRAMENTAS_VERSAO or cap["modelo"] != cfg.modelo_conversa:
        return True
    if _contexto_tokens(repo.linhas(con, pid, cap["capitulo"])) > CAPITULO_MAX_TOKENS:
        return True
    d = acoes._dados(con, pid)
    return any(str((a or {}).get("em") or "") > cap["criado"] for a in (d.get("aprovadas") or {}).values())


def _ficha(cfg, con, pid: str, n: int) -> str:
    """Primeira mensagem de um capítulo novo, escrita pelo código: pedido, versões e as 5 últimas falas do fio."""
    ctx = ferramentas.Ctx(cfg, pid, None)
    pedido = ctx.json(f"projetos/{pid}/pedido.json") or {}
    linhas = [f"FICHA DO PROJETO (escrita pelo sistema no começo do capítulo {n} da conversa)"]
    if pedido.get("texto"):
        linhas.append(f"Pedido do Marcos: {pedido['texto']}")
        extra = [f"{k}: {pedido[k]}" for k in ("formato", "destino", "duracao_alvo") if pedido.get(k)]
        if extra:
            linhas.append("; ".join(map(str, extra)))
    vs = acoes.versoes(con, pid)
    if vs:
        aprov = acoes._dados(con, pid).get("aprovadas") or {}
        linhas.append("Versões: " + ", ".join(f"{v['id']} {v['estado']}{' (aprovada)' if v['id'] in aprov else ''}" for v in vs))
    falas = repo.falas_recentes(con, pid, 5)
    if falas:
        linhas.append("Últimas falas do fio:")
        for f in falas:
            linhas.append(f"- Marcos: {f['texto']}" if f["quem"] == "dono" else f"- Nimbus: {_j(ferramentas.de_fora(f['texto']))}")
    return "\n".join(linhas)


def _renderizar(texto: str, contexto: dict | None) -> str:
    if not contexto:
        return texto
    partes = []
    if contexto.get("tela"):
        partes.append(f"tela: {contexto['tela']}")
    if contexto.get("versao"):
        partes.append(f"versão aberta: {contexto['versao']}")
    if contexto.get("t_player") is not None:
        t = int(round(float(contexto["t_player"])))
        partes.append(f"t_player: {t // 60}:{t % 60:02d}")
    return (f"[{' · '.join(partes)}]\n" if partes else "") + texto


def _preparar_mensagem(cfg, pid: str, turno: str, texto: str, conteudo_txt: str, cmid: str) -> tuple[list[tuple[str, dict]], str | None]:
    """Antes de uma mensagem nova (fora de turno): resolve a espera, fecha pendências, abre capítulo se preciso e grava.
    Devolve os eventos para emitir e, se o cliente_msg_id já existia, o turno antigo."""
    eventos: list[tuple[str, dict]] = []
    with _Con(cfg) as con:
        con.execute("BEGIN IMMEDIATE")
        try:
            ja = repo.por_cliente_msg_id(con, pid, cmid)
            if ja:
                con.execute("COMMIT")
                return [], ja["turno"]
            cap = repo.capitulo_atual(con, pid)
            esp = repo.espera(con, pid)
            if esp and cap:
                repo.tomar_espera(con, pid, esp["tool_use_id"])
                if esp["tipo"] == "pergunta":
                    res = {"por": "mensagem", "texto": texto[:1000]}
                    eventos.append(("resposta", {"tool_use_id": esp["tool_use_id"], "tipo": "pergunta", "texto": texto[:1000], "por": "mensagem"}))
                else:
                    res = {"feito": False, "motivo": "dono_disse_nao", "detalhe": "o Marcos mandou outra mensagem"}
                    eventos.append(("resposta", {"tool_use_id": esp["tool_use_id"], "tipo": "confirmacao", "sim": False, "resultado": "cancelado",
                                                 "detalhe": "Cancelado: você mandou outra mensagem.", "por": "mensagem"}))
                repo.anexar(con, pid, cap["capitulo"], "parcial", [_tool_result(esp["tool_use_id"], res)], esp["turno"])
            elif esp:
                repo.tomar_espera(con, pid, esp["tool_use_id"])
            fechar_pendencias(con, pid, "erro", turno)
            if _precisa_capitulo(con, cfg, pid, cap):
                system, tools = _system_e_tools()
                antigo = cap is not None
                cap = repo.abrir_capitulo(con, pid, modelo=cfg.modelo_conversa, prompt_versao=PROMPT_VERSAO,
                                          ferramentas_versao=ferramentas.FERRAMENTAS_VERSAO, system=system, tools=tools)
                if antigo:
                    repo.anexar(con, pid, cap["capitulo"], "user", [{"type": "text", "text": _ficha(cfg, con, pid, cap["capitulo"])}], turno)
            repo.anexar(con, pid, cap["capitulo"], "user", [{"type": "text", "text": conteudo_txt}], turno, cliente_msg_id=cmid)
            con.execute("COMMIT")
        except BaseException:
            con.execute("ROLLBACK")
            raise
    return eventos, None


def _turnos_abertos(con, pid: str) -> list[str]:
    """Turnos que começaram (fala do dono, resposta a pergunta ou atividade do Nimbus) e não têm turno_fim depois."""
    inicio: dict[str, int] = {}
    fim: dict[str, int] = {}
    turno_da_pergunta: dict[str, str] = {}
    for r in con.execute("SELECT id, tipo, dados FROM eventos WHERE projeto=? AND tipo IN "
                         "('fala_dono','fala_editor','ferramenta','pergunta','confirmacao','resposta','turno_fim') ORDER BY id", (pid,)):
        d = json.loads(r["dados"] or "{}")
        t = d.get("turno")
        if r["tipo"] == "turno_fim":
            fim[t] = r["id"]
        elif r["tipo"] == "pergunta":
            turno_da_pergunta[d.get("tool_use_id")] = t
            inicio[t] = r["id"]
        elif r["tipo"] == "resposta":
            t = turno_da_pergunta.get(d.get("tool_use_id"))
            if t and d.get("tipo") == "pergunta" and d.get("por") == "dono":
                inicio[t] = r["id"]
        elif t and not (r["tipo"] == "fala_dono" and d.get("na_fila")):
            inicio[t] = r["id"]
    return [t for t, i in sorted(inicio.items(), key=lambda x: x[1]) if i > fim.get(t, 0)]


def reconciliar_conversas(cfg) -> int:
    """Boot do app (dono da trava): turno que ficou aberto ganha turno_fim 'erro' e uma linha estimada no livro
    (o contexto inteiro como escrita de cache de 1 h: a conta pessimista); as pendências fecham com 'reinicio'; se a
    conversa parou no meio, um aviso com {acao:'retomar'} (sem mensagem) oferece tentar de novo."""
    n = 0
    with _Con(cfg) as con:
        pids = [r["projeto"] for r in con.execute("SELECT DISTINCT projeto FROM conversa_capitulos")]
        for pid in pids:
            abertos = _turnos_abertos(con, pid)
            cap = repo.capitulo_atual(con, pid)
            for t in abertos:
                tokens = 0
                if cap:
                    msgs, _ = repo.historico(con, pid, cap["capitulo"])
                    tokens = teto.tokens_de(len(cap["system_json"]) + len(cap["tools_json"]) + len(_j(msgs)))
                u = orcamento.uso(cfg.modelo_conversa, entrada=0, saida=0, cache_escrito_1h=tokens, estimado=True, cerebro="conversa")
                gastos.registrar(cfg, "conversa", u, projeto=pid, ref=t)
                banco.emitir(con, pid, "turno_fim", dados={
                    "turno": t, "stop": "erro", "custo_usd": u["custo_usd"], "estimado": True, "s": 0,
                    "gasto_hoje_usd": teto.gasto_hoje_usd(cfg), "detalhe": "o motor reiniciou no meio da resposta",
                    "tokens": {"entrada": 0, "cache_lida": 0, "cache_escrita": tokens, "saida": 0}})
                n += 1
            fechar_pendencias(con, pid, "reinicio")
            if abertos and cap and repo.ultima_util(con, pid, cap["capitulo"]) in ("user", "parcial") and repo.espera(con, pid) is None:
                banco.emitir(con, pid, "aviso", dados={"acao": "retomar", "turno": abertos[-1]})
    return n


def _interrompida(con, pid: str) -> str | None:
    """Turno a retomar: o aviso {acao:'retomar'} mais recente, se nada aconteceu na conversa depois dele."""
    av = None
    for r in con.execute("SELECT id, dados FROM eventos WHERE projeto=? AND tipo='aviso' AND dados IS NOT NULL ORDER BY id DESC LIMIT 20", (pid,)):
        d = json.loads(r["dados"] or "{}")
        if d.get("acao") == "retomar":
            av = (r["id"], d.get("turno"))
            break
    if av is None:
        return None
    depois = con.execute("SELECT 1 FROM eventos WHERE projeto=? AND id>? AND tipo IN ('fala_dono','turno_fim') LIMIT 1", (pid, av[0])).fetchone()
    return None if depois else av[1]


# ---------------- a mesa da conversa (uma por processo e por event loop) ----------------
class Mesa:
    def __init__(self):
        self.loop = asyncio.get_running_loop()
        self.tarefas: dict[str, asyncio.Task] = {}
        self.turno_de: dict[str, str] = {}
        self.rascunho: dict[str, dict] = {}
        self.v = 0
        self._travas: dict[str, asyncio.Lock] = {}
        self.sem = asyncio.Semaphore(MAX_TURNOS_PROCESSO)
        self.sem_voz = asyncio.Semaphore(1)
        self.ultima_chamada: dict[str, float] = {}
        self._lock_fd = None
        self._lock_dados: str | None = None
        self.dono_do_lock = False
        self._tentou_em = 0.0
        self._lock_trava = threading.Lock()      # ligada() roda no loop e em threads (to_thread): uma abertura só

    # --- trava de processo único (D16)
    def garantir_lock(self, cfg) -> bool:
        with self._lock_trava:
            return self._garantir_lock(str(cfg.dados))

    def _garantir_lock(self, dados: str) -> bool:
        if self._lock_dados == dados and (self.dono_do_lock or time.monotonic() - self._tentou_em < 30):
            return self.dono_do_lock                 # sem a trava: tenta de novo a cada 30 s (o outro processo pode ter saído)
        self._soltar()
        self._lock_dados, self._tentou_em = dados, time.monotonic()
        try:
            pathlib.Path(dados).mkdir(parents=True, exist_ok=True)
            fd = os.open(os.path.join(dados, "conversa.lock"), os.O_RDWR | os.O_CREAT, 0o600)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                os.close(fd)
                log.error("conversa indisponível neste processo: outro processo segura %s/conversa.lock", dados)
                self.dono_do_lock = False
                return False
            self._lock_fd, self.dono_do_lock = fd, True
        except OSError as e:
            log.error("conversa indisponível: não abri a trava (%s)", e)
            self.dono_do_lock = False
        return self.dono_do_lock

    def soltar_lock(self):
        with self._lock_trava:
            self._soltar()

    def _soltar(self):
        if self._lock_fd is not None:
            try:
                fcntl.flock(self._lock_fd, fcntl.LOCK_UN)
                os.close(self._lock_fd)
            except OSError:
                pass
        self._lock_fd, self._lock_dados, self.dono_do_lock = None, None, False

    def trava(self, pid: str) -> asyncio.Lock:
        if pid not in self._travas:
            self._travas[pid] = asyncio.Lock()
        return self._travas[pid]

    def ligada(self, cfg) -> tuple[bool, str | None]:
        return preferencia.estado(cfg, dono_do_lock=self.garantir_lock(cfg))

    def rodando(self, pid: str) -> bool:
        t = self.tarefas.get(pid)
        return t is not None and not t.done()

    # --- estado para a tela
    def estado(self, cfg) -> dict:
        ligada, motivo = self.ligada(cfg)
        with _Con(cfg) as con:
            esperando = repo.todas_esperas(con)
        out = {"ligada": ligada, "teto_usd_dia": teto.teto_usd_dia(cfg), "gasto_hoje_usd": round(teto.gasto_hoje_usd(cfg), 4),
               "dia_vira_em": teto.dia_vira_em(), "esperando": [{"projeto": e["projeto"], "nome": e["nome"], "tipo": e["tipo"], "desde": e["desde"]} for e in esperando]}
        if motivo:
            out["motivo"] = motivo
        return out

    def instantaneo(self, cfg, pid: str, con=None) -> dict:
        ligada, motivo = self.ligada(cfg)
        d: dict = {"ligada": ligada, "gasto_hoje_usd": round(teto.gasto_hoje_usd(cfg), 4), "teto_usd_dia": teto.teto_usd_dia(cfg)}
        if motivo:
            d["motivo"] = motivo
        if self.rodando(pid):
            d["turno_rodando"] = self.turno_de.get(pid)
            if pid in self.rascunho:
                d["rascunho"] = dict(self.rascunho[pid])
        if con is not None:
            r = con.execute("SELECT tipo, tool_use_id FROM conversa_espera WHERE projeto=?", (pid,)).fetchone()
            if r:
                d["espera"] = {"tipo": r["tipo"], "tool_use_id": r["tool_use_id"]}
            from motor.etapas import passos
            ab = passos.abertos(con, pid)
            if ab:
                d["passos_abertos"] = ab
        return d

    async def emitir(self, cfg, pid: str, tipo: str, dados: dict, **kw) -> int:
        return await asyncio.to_thread(_emitir_sync, cfg, pid, tipo, dados, kw.get("etapa"), kw.get("alvo"))

    def _rasc(self, pid: str, **campos):
        self.v += 1
        r = self.rascunho.setdefault(pid, {})
        for k, v in campos.items():
            if v is None:
                r.pop(k, None)
            else:
                r[k] = v
        r["v"] = self.v

    # --- o dono manda uma mensagem (R3)
    async def mandar(self, cfg, pid: str, *, texto: str, via: str, contexto: dict | None, cmid: str) -> dict:
        async with self.trava(pid):
            ja = await asyncio.to_thread(self._por_cmid, cfg, pid, cmid)
            if ja:
                return {"turno": ja, "na_fila": False}
            ligada, _ = self.ligada(cfg)
            if not ligada:
                raise ErroConversa(503, "a conversa está desligada")
            if teto.gasto_hoje_usd(cfg) >= teto.teto_usd_dia(cfg) - 1e-9:
                raise ErroConversa(429, f"chegou no teto de hoje (US$ {teto.teto_usd_dia(cfg):.2f}); a conversa volta à meia-noite".replace(".", ",", 1))
            conteudo_txt = _renderizar(texto, contexto)
            dados = {"texto": texto, "via": via, **({"contexto": contexto} if contexto else {})}
            if self.rodando(pid):
                turno = self.turno_de[pid]
                await asyncio.to_thread(self._fila, cfg, pid, turno, conteudo_txt, cmid)
                await self.emitir(cfg, pid, "fala_dono", {"turno": turno, **dados, "na_fila": True})
                return {"turno": turno, "na_fila": True}
            turno = repo.novo_turno()
            eventos, antigo = await asyncio.to_thread(_preparar_mensagem, cfg, pid, turno, texto, conteudo_txt, cmid)
            if antigo:
                return {"turno": antigo, "na_fila": False}
            for tipo, d in eventos:
                await self.emitir(cfg, pid, tipo, d)
            await self.emitir(cfg, pid, "fala_dono", {"turno": turno, **dados})
            self._iniciar(cfg, pid, turno)
            return {"turno": turno, "na_fila": False}

    @staticmethod
    def _por_cmid(cfg, pid, cmid):
        with _Con(cfg) as con:
            r = repo.por_cliente_msg_id(con, pid, cmid)
            return r["turno"] if r else None

    @staticmethod
    def _fila(cfg, pid, turno, conteudo_txt, cmid):
        with _Con(cfg) as con:
            cap = repo.capitulo_atual(con, pid)
            repo.anexar(con, pid, cap["capitulo"], "parcial", [{"type": "text", "text": conteudo_txt}], turno, cliente_msg_id=cmid)

    def _iniciar(self, cfg, pid: str, turno: str):
        self.turno_de[pid] = turno
        self.tarefas[pid] = asyncio.create_task(self._rodar(cfg, pid, turno), name=f"conversa-{pid}")

    # --- responder a pergunta (R5)
    async def responder(self, cfg, pid: str, *, tool_use_id: str, escolha_id: str | None, texto: str | None) -> dict:
        async with self.trava(pid):
            esp = await asyncio.to_thread(self._espera, cfg, pid)
            if esp is None or esp["tipo"] != "pergunta" or esp["tool_use_id"] != tool_use_id:
                if await asyncio.to_thread(self._ja_respondida, cfg, pid, tool_use_id):
                    raise ErroConversa(409, "essa pergunta já foi respondida")
                raise ErroConversa(404, "essa pergunta não existe")
            cart = esp["cartao"]
            opcoes = {o["id"]: o for o in cart.get("opcoes", [])}
            if escolha_id is not None and escolha_id not in opcoes:
                raise ErroConversa(422, "essa opção não existe nesta pergunta")
            if texto and not cart.get("aceita_texto"):
                raise ErroConversa(422, "esta pergunta aceita só os botões")
            ligada, _ = self.ligada(cfg)
            if not ligada:
                raise ErroConversa(503, "a conversa está desligada")
            if self.rodando(pid):
                raise ErroConversa(409, "a conversa ainda está respondendo; espere terminar")
            res = {"por": "dono"}
            ev = {"tool_use_id": tool_use_id, "tipo": "pergunta", "por": "dono"}
            if escolha_id is not None:
                res.update(escolha_id=escolha_id, rotulo=opcoes[escolha_id]["rotulo"])
                ev["escolha_id"] = escolha_id
            if texto:
                res["texto"] = texto
                ev["texto"] = texto
            ok = await asyncio.to_thread(self._gravar_resposta, cfg, pid, esp, res)
            if not ok:
                raise ErroConversa(409, "essa pergunta já foi respondida")
            await self.emitir(cfg, pid, "resposta", ev)
            self._iniciar(cfg, pid, esp["turno"])
            return {"turno": esp["turno"]}

    @staticmethod
    def _espera(cfg, pid):
        with _Con(cfg) as con:
            return repo.espera(con, pid)

    @staticmethod
    def _ja_respondida(cfg, pid, tool_use_id) -> bool:
        with _Con(cfg) as con:
            for r in con.execute("SELECT dados FROM eventos WHERE projeto=? AND tipo='resposta' ORDER BY id DESC LIMIT 200", (pid,)):
                if json.loads(r["dados"] or "{}").get("tool_use_id") == tool_use_id:
                    return True
        return False

    @staticmethod
    def _gravar_resposta(cfg, pid, esp, res) -> bool:
        with _Con(cfg) as con:
            con.execute("BEGIN IMMEDIATE")
            try:
                if not repo.tomar_espera(con, pid, esp["tool_use_id"]):
                    con.execute("ROLLBACK")
                    return False
                cap = repo.capitulo_atual(con, pid)
                repo.anexar(con, pid, cap["capitulo"], "parcial", [_tool_result(esp["tool_use_id"], res)], esp["turno"])
                con.execute("COMMIT")
                return True
            except BaseException:
                con.execute("ROLLBACK")
                raise

    # --- confirmar o cartão (R6): o turno NÃO continua
    async def confirmar(self, cfg, pid: str, *, tool_use_id: str, sim: bool, entrada_hash: str) -> dict:
        async with self.trava(pid):
            esp = await asyncio.to_thread(self._espera, cfg, pid)
            if esp is None or esp["tipo"] != "confirmacao" or esp["tool_use_id"] != tool_use_id:
                if await asyncio.to_thread(self._ja_respondida, cfg, pid, tool_use_id):
                    raise ErroConversa(409, "esse cartão já foi decidido")
                raise ErroConversa(404, "esse cartão não existe")
            if esp["entrada_hash"] != entrada_hash:
                raise ErroConversa(409, "o cartão mudou")
            res, ev, status = await asyncio.to_thread(self._decidir, cfg, pid, esp, sim)
            if ev is not None:
                await self.emitir(cfg, pid, "resposta", ev)
            if status == 409:
                raise ErroConversa(409, (ev or {}).get("detalhe") or "esse cartão já foi decidido")
            out = {"feito": bool(res.get("feito"))}
            extra = {k: res[k] for k in ("nova_direcao", "dirigindo") if k in res}
            if extra:
                out["resultado"] = extra
            return out

    @staticmethod
    def _decidir(cfg, pid: str, esp: dict, sim: bool) -> tuple[dict, dict | None, int]:
        from fastapi import HTTPException
        from pydantic import ValidationError
        nome, entrada = esp["cartao"]["nome"], esp["cartao"]["entrada"]
        with _Con(cfg) as con:
            con.execute("BEGIN IMMEDIATE")
            ok = repo.tomar_espera(con, pid, esp["tool_use_id"])      # decisão única: o segundo toque não acha a linha
            con.execute("COMMIT")
            if not ok:
                return {}, None, 409
            ev = {"tool_use_id": esp["tool_use_id"], "tipo": "confirmacao", "sim": bool(sim), "por": "dono"}
            status = 200
            if not sim:
                res = {"feito": False, "motivo": "dono_disse_nao"}
                ev.update(resultado="cancelado", detalhe="Cancelado. Nada mudou.")
            else:
                porque = (acoes.guarda_ajuste(con, pid, entrada["versao"], tool_use_id=esp["tool_use_id"]) if nome == "propor_ajuste"
                          else acoes.guarda_pedido(con, pid, tool_use_id=esp["tool_use_id"]))
                if porque:
                    res = {"feito": False, "motivo": "estado_mudou", "detalhe": porque}
                    ev.update(resultado="nao_deu", detalhe=f"não deu: {porque}")
                    status = 409
                else:
                    try:
                        if nome == "propor_ajuste":
                            res = acoes.executar_ajuste(pid, entrada["versao"], entrada["o_que_mudar"])
                            ev.update(resultado="feito", detalhe=TEXTO_AJUSTE_FEITO)
                        else:
                            res = acoes.executar_pedido(cfg, pid, entrada)
                            ev.update(resultado="feito", detalhe=TEXTO_PEDIDO_DIRIGINDO if res.get("dirigindo") else TEXTO_PEDIDO_FEITO)
                    except HTTPException as e:
                        res = {"feito": False, "motivo": "estado_mudou", "detalhe": str(e.detail)[:300]}
                        ev.update(resultado="nao_deu", detalhe=f"não deu: {str(e.detail)[:200]}")
                        status = 409
                    except (ValidationError, ValueError) as e:
                        res = {"feito": False, "motivo": "erro", "detalhe": ferramentas.de_fora(str(e)[:300])["de_fora"]}
                        ev.update(resultado="nao_deu", detalhe="não deu: o pedido ficou inválido")
                        status = 409
            cap = repo.capitulo_atual(con, pid)
            if cap:
                repo.anexar(con, pid, cap["capitulo"], "parcial", [_tool_result(esp["tool_use_id"], res)], esp["turno"])
        return res, ev, status

    # --- parar e retomar (R7, R8)
    async def parar(self, pid: str) -> bool:
        t = self.tarefas.get(pid)
        if t is None or t.done():
            return False
        t.cancel()
        await asyncio.wait([t], timeout=15)
        return True

    async def parar_todos(self) -> int:
        pids = [p for p in list(self.tarefas) if self.rodando(p)]
        for p in pids:
            await self.parar(p)
        return len(pids)

    async def retomar(self, cfg, pid: str) -> dict:
        async with self.trava(pid):
            ligada, _ = self.ligada(cfg)
            if not ligada:
                raise ErroConversa(503, "a conversa está desligada")
            if teto.gasto_hoje_usd(cfg) >= teto.teto_usd_dia(cfg) - 1e-9:
                raise ErroConversa(429, f"chegou no teto de hoje (US$ {teto.teto_usd_dia(cfg):.2f}); a conversa volta à meia-noite".replace(".", ",", 1))
            if self.rodando(pid):
                raise ErroConversa(409, "a conversa já está respondendo")
            turno = await asyncio.to_thread(self._preparar_retomada, cfg, pid)
            if not turno:
                raise ErroConversa(409, "não há conversa interrompida")
            self._iniciar(cfg, pid, turno)
            return {"turno": turno}

    @staticmethod
    def _preparar_retomada(cfg, pid) -> str | None:
        with _Con(cfg) as con:
            turno = _interrompida(con, pid)
            if not turno:
                return None
            fechar_pendencias(con, pid, "reinicio", turno)
            cap = repo.capitulo_atual(con, pid)
            if cap is None or repo.ultima_util(con, pid, cap["capitulo"]) not in ("user", "parcial"):
                return None
            return turno

    # --- o turno
    async def _rodar(self, cfg, pid: str, turno: str):
        eu = asyncio.current_task()
        t0 = time.monotonic()
        custo, estimado = 0.0, False
        tokens = {"entrada": 0, "cache_lida": 0, "cache_escrita": 0, "saida": 0}
        stop, detalhe, motivo_fecha = "erro", None, None
        em_voo: dict | None = None          # chamada em andamento (para estimar o custo se o dono parar)
        abertas: dict[str, str] = {}        # ferramentas livres com 'inicio' emitido e sem fim
        escritas: set = set()
        cli = None

        async def escrever(fn, *a):
            fut = asyncio.ensure_future(asyncio.to_thread(fn, *a))
            escritas.add(fut)
            try:
                return await asyncio.shield(fut)
            finally:
                if fut.done():
                    escritas.discard(fut)

        try:
            async with self.sem:
                bloco = await asyncio.to_thread(self._n_blocos, cfg, pid, turno)
                voltas = 0
                cli = config.cliente_anthropic_async(cfg)
                while True:
                    ligada, _ = self.ligada(cfg)
                    if not ligada:
                        stop = "parado"
                        break
                    cap, msgs, ate = await asyncio.to_thread(self._montar, cfg, pid)
                    if voltas >= MAX_VOLTAS:
                        stop, detalhe = "limite", f"parei depois de {MAX_VOLTAS} chamadas neste turno"
                        break
                    system, tools = json.loads(cap["system_json"]), json.loads(cap["tools_json"])
                    contexto = teto.tokens_de(len(cap["system_json"]) + len(cap["tools_json"]) + len(_j(msgs)))
                    novos = teto.tokens_de(len(_j(msgs[-1]))) if msgs else 0
                    recente = time.time() - self.ultima_chamada.get(pid, 0) < CACHE_RECENTE_S
                    pior = teto.pior_caso_usd(cfg.modelo_conversa, contexto_tokens=contexto, novos_tokens=novos, recente=recente)
                    cabe, _hoje = teto.cabe(cfg, pior)
                    if not cabe:
                        stop, detalhe = "teto", f"chegou no teto de hoje (US$ {teto.teto_usd_dia(cfg):.2f})".replace(".", ",", 1)
                        break
                    voltas += 1
                    pensar = {"type": "adaptive", "display": "updates"} if cfg.andamento_conversa else {"type": "adaptive"}
                    betas = [BETA_FALLBACK] + ([BETA_ANDAMENTO] if cfg.andamento_conversa else [])
                    em_voo = {"contexto": contexto, "novos": novos, "recente": recente, "modelo": cfg.modelo_conversa}
                    self._rasc(pid, turno=turno, bloco=bloco, texto="", andamento="pensando…")
                    async with cli.beta.messages.stream(
                            model=cfg.modelo_conversa, max_tokens=MAX_SAIDA, thinking=pensar, output_config={"effort": cfg.esforco_conversa},
                            system=system, tools=tools, messages=msgs, cache_control=dict(CACHE_1H), betas=betas, fallbacks="default") as st:
                        async for ev in st:
                            tp = ev.type
                            if tp == "content_block_start":
                                cb = ev.content_block
                                if cb.type == "text":
                                    self._rasc(pid, turno=turno, bloco=bloco, texto="", andamento=None)
                                elif cb.type == "tool_use":
                                    self._rasc(pid, andamento="preparando…")
                                    if ferramentas.RISCO.get(cb.name) == ferramentas.LIVRE:
                                        abertas[cb.id] = cb.name
                                        await self.emitir(cfg, pid, "ferramenta", {"turno": turno, "tool_use_id": cb.id, "nome": cb.name, "fase": "inicio"})
                            elif tp == "text":
                                self._rasc(pid, texto=ev.snapshot)
                                em_voo["texto"] = ev.snapshot
                            elif tp == "thinking":
                                if (ev.snapshot or "").strip():
                                    self._rasc(pid, andamento=ev.snapshot.strip()[-280:])
                            elif tp == "content_block_stop" and getattr(ev.content_block, "type", "") == "text":
                                txt = ev.content_block.text or ""
                                if txt.strip():
                                    await self.emitir(cfg, pid, "fala_editor", {"turno": turno, "bloco": bloco, "texto": txt})
                                    bloco += 1
                                em_voo["texto"] = ""
                                self._rasc(pid, turno=turno, bloco=bloco, texto="")
                        msg = await st.get_final_message()
                    em_voo = None
                    self.ultima_chamada[pid] = time.time()
                    uso = self._uso(msg, cfg)
                    custo += uso["custo_usd"]
                    tokens["entrada"] += uso["entrada"]
                    tokens["cache_lida"] += uso["entrada_cache"]
                    tokens["cache_escrita"] += uso["cache_escrito"] + uso.get("cache_escrito_1h", 0)
                    tokens["saida"] += uso["saida"]
                    conteudo = [b.model_dump(mode="json", exclude_none=True) for b in msg.content]
                    await escrever(self._gravar_assistant, cfg, pid, cap["capitulo"], conteudo, turno, {**uso, "ate_id": ate})
                    if voltas > 1 and not uso["entrada_cache"]:
                        log.warning("conversa %s: chamada %d sem leitura de cache (prefixo mudou?)", pid, voltas)
                    if msg.stop_reason == "refusal":
                        stop, detalhe = "recusa", "o modelo recusou responder"
                        break
                    if msg.stop_reason == "max_tokens":
                        stop, detalhe, motivo_fecha = "limite", "a resposta passou do tamanho máximo", "max_tokens"
                        break
                    usos = [b for b in msg.content if getattr(b, "type", "") == "tool_use"]
                    if not usos:
                        if await asyncio.to_thread(self._tem_fila, cfg, pid):
                            continue
                        stop = "end_turn"
                        break
                    pausa = await self._ferramentas(cfg, pid, turno, cap["capitulo"], usos, abertas, escrever)
                    if pausa:
                        stop = "pausa"
                        break
        except asyncio.CancelledError:
            stop = "parado"
            if em_voo is not None:
                saida = int(len(em_voo.get("texto", "")) / orcamento.CARACTERES_POR_TOKEN) + 1
                if em_voo["recente"]:
                    u = orcamento.uso(em_voo["modelo"], entrada=0, saida=saida, cache_lido=max(0, em_voo["contexto"] - em_voo["novos"]),
                                      cache_escrito_1h=em_voo["novos"], estimado=True)
                else:
                    u = orcamento.uso(em_voo["modelo"], entrada=0, saida=saida, cache_escrito_1h=em_voo["contexto"], estimado=True)
                await asyncio.to_thread(gastos.registrar, cfg, "conversa", u, projeto=pid, ref=turno)
                custo += u["custo_usd"]
                estimado = True
                tokens["saida"] += saida
        except Exception as e:  # noqa: BLE001 - qualquer falha vira turno_fim 'erro' com texto simples (sem segredo)
            stop, detalhe = "erro", _erro_simples(e)
            log.warning("conversa %s turno %s: %s", pid, turno, type(e).__name__)
        finally:
            if escritas:
                await asyncio.gather(*escritas, return_exceptions=True)
            texto_parcial = (self.rascunho.get(pid) or {}).get("texto") if stop == "parado" else None
            try:
                for tid, nome in list(abertas.items()):
                    await self.emitir(cfg, pid, "ferramenta", {"turno": turno, "tool_use_id": tid, "nome": nome, "fase": "erro",
                                                               "resumo": "não executado"})
                motivo = motivo_fecha or {"end_turn": "erro", "pausa": "erro", "recusa": "recusa", "limite": "limite"}.get(stop, stop)
                await asyncio.to_thread(self._fechar, cfg, pid, motivo, turno)
                fim = {"turno": turno, "stop": stop, "custo_usd": round(custo, 5), "s": round(time.monotonic() - t0, 1),
                       "gasto_hoje_usd": round(teto.gasto_hoje_usd(cfg), 4), "tokens": tokens}
                if estimado:
                    fim["estimado"] = True
                if texto_parcial:
                    fim["texto_parcial"] = texto_parcial
                if detalhe:
                    fim["detalhe"] = detalhe[:300]
                await self.emitir(cfg, pid, "turno_fim", fim)
            finally:
                if self.tarefas.get(pid) is eu:
                    self.tarefas.pop(pid, None)
                    self.turno_de.pop(pid, None)
                    self.rascunho.pop(pid, None)
                if cli is not None:
                    try:
                        await cli.close()
                    except Exception:  # noqa: BLE001
                        pass

    async def _ferramentas(self, cfg, pid, turno, capitulo, usos, abertas, escrever) -> bool:
        """Executa as livres, grava os resultados e abre no máximo UMA espera (pergunta ou cartão). True = pausou."""
        resultados: list[dict] = []
        pausa: tuple[str, dict] | None = None
        for tu in usos:
            nome, tid, entrada = tu.name, tu.id, tu.input
            risco = ferramentas.RISCO.get(nome)
            erros = ferramentas.validar(nome, entrada)
            if erros:
                resultados.append(_tool_result(tid, {"erro": "entrada_invalida", "detalhe": "; ".join(erros)[:500]}, True))
                if abertas.pop(tid, None) is not None:
                    await self.emitir(cfg, pid, "ferramenta", {"turno": turno, "tool_use_id": tid, "nome": nome, "fase": "erro", "resumo": "entrada inválida"})
                continue
            if risco == ferramentas.LIVRE:
                t1 = time.monotonic()
                fase, ev_mostrar = "fim", None
                try:
                    res, resumo, ev_mostrar = await asyncio.to_thread(ferramentas.executar, cfg, pid, turno, nome, entrada)
                    resultados.append(_tool_result(tid, res))
                except Exception as e:  # noqa: BLE001
                    fase, resumo = "erro", "não consegui ler agora"
                    resultados.append(_tool_result(tid, {"erro": "falhou", "detalhe": ferramentas.de_fora(_erro_simples(e))}, True))
                if ev_mostrar:
                    await self.emitir(cfg, pid, "mostrar", ev_mostrar)
                ev = {"turno": turno, "tool_use_id": tid, "nome": nome, "fase": fase, "resumo": resumo[:160], "s": round(time.monotonic() - t1, 2)}
                ent = _j(entrada)
                if len(ent.encode()) <= 2048:
                    ev["entrada"] = entrada
                abertas.pop(tid, None)
                await self.emitir(cfg, pid, "ferramenta", ev)
                continue
            if pausa is not None:
                resultados.append(_tool_result(tid, {"erro": "uma_por_vez", "detalhe": "só uma pergunta ou cartão por vez; espere a resposta do Marcos"}, True))
                continue
            if risco == ferramentas.PERGUNTA:
                cartao = {"turno": turno, "tool_use_id": tid, "texto": entrada["texto"],
                          "opcoes": [{k: o[k] for k in ("id", "rotulo", "efeito") if k in o} for o in entrada["opcoes"]],
                          "aceita_texto": bool(entrada["aceita_texto"]), **({"sugestao": entrada["sugestao"]} if entrada.get("sugestao") else {})}
                await escrever(self._gravar_espera, cfg, pid, "pergunta", tid, turno, cartao, None)
                pausa = ("pergunta", cartao)
                continue
            async with self.trava(pid):
                porque, cartao = await asyncio.to_thread(self._criar_cartao, cfg, pid, nome, entrada, turno, tid)
            if porque:
                resultados.append(_tool_result(tid, {"erro": "nao_cabe_agora", "detalhe": porque}, True))
            else:
                pausa = ("confirmacao", cartao)
        if resultados:
            await escrever(self._gravar_parcial, cfg, pid, capitulo, resultados, turno)
        if pausa:
            await self.emitir(cfg, pid, pausa[0], pausa[1])
            return True
        return False

    # --- passos síncronos do turno (em thread)
    @staticmethod
    def _n_blocos(cfg, pid, turno) -> int:
        with _Con(cfg) as con:
            n = 0
            for r in con.execute("SELECT dados FROM eventos WHERE projeto=? AND tipo='fala_editor' ORDER BY id DESC LIMIT 500", (pid,)):
                if json.loads(r["dados"] or "{}").get("turno") == turno:
                    n += 1
            return n

    @staticmethod
    def _montar(cfg, pid):
        with _Con(cfg) as con:
            cap = repo.capitulo_atual(con, pid)
            msgs, ate = repo.historico(con, pid, cap["capitulo"])
            return cap, msgs, ate

    @staticmethod
    def _gravar_assistant(cfg, pid, capitulo, conteudo, turno, uso):
        with _Con(cfg) as con:
            repo.anexar(con, pid, capitulo, "assistant", conteudo, turno, uso=uso)
        gastos.registrar(cfg, "conversa", uso, projeto=pid, ref=turno)

    @staticmethod
    def _gravar_parcial(cfg, pid, capitulo, blocos, turno):
        with _Con(cfg) as con:
            repo.anexar(con, pid, capitulo, "parcial", blocos, turno)

    @staticmethod
    def _gravar_espera(cfg, pid, tipo, tid, turno, cartao, hash_):
        with _Con(cfg) as con:
            con.execute("DELETE FROM conversa_espera WHERE projeto=?", (pid,))
            repo.gravar_espera(con, pid, tipo=tipo, tool_use_id=tid, turno=turno, cartao=cartao, entrada_hash=hash_)

    @staticmethod
    def _tem_fila(cfg, pid) -> bool:
        with _Con(cfg) as con:
            cap = repo.capitulo_atual(con, pid)
            return bool(cap) and repo.tem_fila(con, pid, cap["capitulo"])

    @staticmethod
    def _fechar(cfg, pid, motivo, turno):
        with _Con(cfg) as con:
            fechar_pendencias(con, pid, motivo, turno)

    @staticmethod
    def _criar_cartao(cfg, pid, nome, entrada, turno, tid) -> tuple[str | None, dict | None]:
        with _Con(cfg) as con:
            if nome == "propor_ajuste":
                norm = {"versao": entrada["versao"], "o_que_mudar": " ".join(entrada["o_que_mudar"].split())}
                porque = acoes.guarda_ajuste(con, pid, norm["versao"])
                if porque:
                    return porque, None
                cartao = acoes.cartao_ajuste(cfg, con, pid, norm, turno=turno, tool_use_id=tid)
            else:
                norm = acoes.normalizar_pedido(entrada)
                porque = acoes.guarda_pedido(con, pid)
                if porque:
                    return porque, None
                cartao = acoes.cartao_pedido(cfg, con, pid, norm, turno=turno, tool_use_id=tid)
            h = acoes.entrada_hash(tid, norm)
            cartao["entrada_hash"] = h
            con.execute("DELETE FROM conversa_espera WHERE projeto=?", (pid,))
            repo.gravar_espera(con, pid, tipo="confirmacao", tool_use_id=tid, turno=turno,
                               cartao={"nome": nome, "entrada": norm, "evento": cartao}, entrada_hash=h)
            return None, cartao

    @staticmethod
    def _uso(msg, cfg) -> dict:
        u = msg.usage
        cc = getattr(u, "cache_creation", None)
        uma_hora = int(getattr(cc, "ephemeral_1h_input_tokens", 0) or 0) if cc is not None else 0
        criado = int(getattr(u, "cache_creation_input_tokens", 0) or 0)
        return orcamento.uso(getattr(msg, "model", None) or cfg.modelo_conversa, entrada=int(u.input_tokens or 0), saida=int(u.output_tokens or 0),
                             cache_lido=int(getattr(u, "cache_read_input_tokens", 0) or 0), cache_escrito=max(0, criado - uma_hora),
                             cache_escrito_1h=uma_hora, estimado=False, cerebro="conversa", esforco=cfg.esforco_conversa)


def _erro_simples(e: Exception) -> str:
    """Mensagem curta para o dono, sem detalhe técnico nem segredo."""
    try:
        import anthropic
        if isinstance(e, anthropic.RateLimitError):
            return "o Claude está com muita procura agora; tente de novo em um minuto"
        if isinstance(e, anthropic.APIStatusError):
            if int(getattr(e, "status_code", 0) or 0) == 400:
                return "o Claude recusou a conversa (400); a equipe precisa olhar"
            return f"o Claude não respondeu ({getattr(e, 'status_code', '?')}); tente de novo"
        if isinstance(e, anthropic.APIConnectionError):
            return "sem conexão com o Claude agora; tente de novo"
    except ImportError:
        pass
    return "algo deu errado na resposta; tente de novo"


_MESA: Mesa | None = None


def mesa() -> Mesa:
    """A mesa do event loop atual (o uvicorn tem um só; cada TestClient tem o seu)."""
    global _MESA
    loop = asyncio.get_running_loop()
    if _MESA is None or _MESA.loop is not loop:
        if _MESA is not None:
            _MESA.soltar_lock()
        _MESA = Mesa()
    return _MESA


def atual() -> Mesa | None:
    """A mesa já criada (o SSE lê o rascunho daqui; não cria nada)."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return None
    return _MESA if _MESA is not None and _MESA.loop is loop else None


async def ao_subir():
    """Startup do app: trava de processo único e reconciliação das conversas interrompidas."""
    cfg = config.carregar()
    m = mesa()
    if m.garantir_lock(cfg):
        try:
            await asyncio.to_thread(reconciliar_conversas, cfg)
        except Exception:  # noqa: BLE001 - reconciliar nunca derruba o boot
            log.exception("reconciliar_conversas falhou")


async def ao_descer():
    m = atual()
    if m is not None:
        await m.parar_todos()
        m.soltar_lock()


def novo_id(prefixo: str) -> str:
    return prefixo + secrets.token_hex(6)
