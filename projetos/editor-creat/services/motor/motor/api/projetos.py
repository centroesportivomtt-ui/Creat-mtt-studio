"""Rotas de projetos, arquivos, importação por link, fechar envio, eventos (SSE) e arquivos com Range (frente A).

Todas ficam sob /v1 e atrás do token do motor (api/app.py). Erros em pt-BR com status HTTP correto.
Cada rota abre e fecha a própria conexão SQLite (o FastAPI roda rotas síncronas em threads diferentes).
"""
from __future__ import annotations

import asyncio
import json
import mimetypes
import os
import re
import time
import uuid
from contextlib import contextmanager
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import RedirectResponse, Response, StreamingResponse
from pydantic import BaseModel, Field, field_validator

from motor import banco, config, importar, pipeline
from motor.provedores import armazenamento_de
from motor.provedores.armazenamento_local import ChaveInvalida, validar_chave

rotas = APIRouter(tags=["projetos"])
TIPOS_VIDEO = ("auto", "evento", "empresa", "daily_vlog", "anuncio", "depoimento", "bastidor")
ESTADOS_ABERTOS = ("recebendo", "lendo")
PREFIXOS_SERVIDOS = ("entrada/", "derivados/", "saidas/")

_CFG: dict = {}


def _config():
    """Config + armazenamento, recarregados se EDITOR_DADOS mudar (testes trocam a pasta de dados)."""
    k = os.environ.get("EDITOR_DADOS", "")
    if k not in _CFG:
        cfg = config.carregar()
        _CFG.clear()
        _CFG[k] = (cfg, armazenamento_de(cfg))
    return _CFG[k]


@contextmanager
def _con():
    cfg, _ = _config()
    con = banco.conectar(cfg.banco)
    try:
        yield con
    finally:
        con.close()


def _projeto(con, pid: str) -> dict:
    r = con.execute("SELECT * FROM projetos WHERE id=?", (pid,)).fetchone()
    if r is None:
        raise HTTPException(404, "projeto não encontrado")
    d = dict(r)
    d["dados"] = json.loads(d["dados"] or "{}")
    return d


# ---------------- modelos de entrada ----------------
class NovoProjeto(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    tipo_video: Optional[str] = "auto"

    @field_validator("nome")
    @classmethod
    def _nome(cls, v):
        v = " ".join(v.split())
        if not v:
            raise ValueError("nome vazio")
        return v

    @field_validator("tipo_video")
    @classmethod
    def _tipo(cls, v):
        if v is not None and v not in TIPOS_VIDEO:
            raise ValueError(f"tipo_video deve ser um de {', '.join(TIPOS_VIDEO)}")
        return v or "auto"


class NovoArquivo(BaseModel):
    chave: str = Field(min_length=1, max_length=512)
    nome: str = Field(min_length=1, max_length=255)
    bytes: int = Field(ge=0)


class Importacao(BaseModel):
    url: str = Field(min_length=12, max_length=2000)


# ---------------- projetos ----------------
@rotas.post("/projetos", status_code=201)
def criar_projeto(corpo: NovoProjeto):
    pid = "p_" + uuid.uuid4().hex[:10]
    agora = banco.agora_iso()
    with _con() as con:
        con.execute("INSERT INTO projetos (id, nome, estado, tipo_video, criado, atualizado, dados) VALUES (?,?,?,?,?,?,?)",
                    (pid, corpo.nome, "recebendo", corpo.tipo_video, agora, agora, "{}"))
        banco.emitir(con, pid, "projeto_criado", estado="recebendo", mensagem=f"Projeto criado: {corpo.nome}")
        return _projeto(con, pid)


@rotas.get("/projetos")
def listar_projetos(limite: int = 50):
    limite = max(1, min(200, limite))
    with _con() as con:
        linhas = con.execute(
            """SELECT p.id, p.nome, p.estado, p.tipo_video, p.criado, p.atualizado,
                      (SELECT COUNT(*) FROM arquivos a WHERE a.projeto=p.id) AS arquivos
               FROM projetos p ORDER BY p.atualizado DESC LIMIT ?""", (limite,)).fetchall()
        return [dict(r) for r in linhas]


@rotas.get("/projetos/{pid}")
def ver_projeto(pid: str):
    with _con() as con:
        p = _projeto(con, pid)
        p["arquivos"] = [dict(r) for r in con.execute("SELECT id, nome, chave, bytes, estado, criado FROM arquivos WHERE projeto=? ORDER BY id", (pid,))]
        p["versoes"] = [dict(r) for r in con.execute("SELECT id, estado, video, qa, link, reprovacao, criado FROM versoes WHERE projeto=? ORDER BY criado", (pid,))]
        p["jobs"] = banco.jobs_do_projeto(con, pid)
        for j in p["jobs"]:
            j["erro"] = (j["erro"] or "").strip().splitlines()[-1][:300] if j["erro"] else None
        return p


# ---------------- arquivos ----------------
@rotas.post("/projetos/{pid}/arquivos", status_code=201)
def registrar_arquivo(pid: str, corpo: NovoArquivo):
    _, arm = _config()
    if arm is None:
        raise HTTPException(503, "armazenamento indisponível")
    try:
        validar_chave(corpo.chave)
    except ChaveInvalida as e:
        raise HTTPException(422, str(e)) from e
    if not corpo.chave.startswith(f"entrada/{pid}/"):
        raise HTTPException(422, f"a chave precisa começar com entrada/{pid}/")
    nome = re.sub(r"[\x00-\x1f]+", "", corpo.nome).strip() or "arquivo"
    with _con() as con:
        p = _projeto(con, pid)
        if p["estado"] not in ESTADOS_ABERTOS:
            raise HTTPException(409, "o projeto já está em direção/montagem; crie uma nova versão para mandar material novo")
        if not arm.existe(corpo.chave):
            raise HTTPException(409, "o arquivo ainda não chegou ao armazenamento (termine o envio antes)")
        real = arm.tamanho(corpo.chave)
        if corpo.bytes and corpo.bytes != real:
            raise HTTPException(409, f"tamanho não confere: o envio diz {corpo.bytes} bytes, o armazenamento tem {real}")
        aid, novo = importar.registrar_arquivo(con, pid, nome, corpo.chave, real)
        return {"id": aid, "novo": novo, "chave": corpo.chave, "bytes": real}


@rotas.post("/projetos/{pid}/importar", status_code=202)
def importar_link(pid: str, corpo: Importacao):
    try:
        importar.link_direto(corpo.url)          # valida antes de enfileirar (host, formato, pasta do Drive)
    except importar.ErroImportacao as e:
        raise HTTPException(422, str(e)) from e
    with _con() as con:
        p = _projeto(con, pid)
        if p["estado"] not in ESTADOS_ABERTOS:
            raise HTTPException(409, "o projeto já está em direção/montagem")
        aid, _ = importar.registrar_arquivo(con, pid, "importando do link…", None, 0, entrada={"url": corpo.url.strip()})
        return {"id": aid, "mensagem": "Importação na fila: o motor baixa e já começa a ler."}


@rotas.post("/projetos/{pid}/fechar-envio")
def fechar_envio(pid: str):
    with _con() as con:
        p = _projeto(con, pid)
        n = con.execute("SELECT COUNT(*) n FROM arquivos WHERE projeto=?", (pid,)).fetchone()["n"]
        if n == 0:
            raise HTTPException(409, "nenhum arquivo enviado ainda")
        d = p["dados"]
        d["envio_fechado"] = True
        con.execute("UPDATE projetos SET dados=?, atualizado=? WHERE id=?", (json.dumps(d), banco.agora_iso(), pid))
        dirigindo = pipeline.tentar_dirigir(con, pid)
        if not dirigindo and p["estado"] == "recebendo":
            falta = "o pedido" if not d.get("pedido") else "terminar a leitura"
            banco.mudar_estado(con, pid, "lendo", f"Envio fechado ({n} arquivo(s)). Falta {falta}.")
        return {"envio_fechado": True, "dirigindo": dirigindo, "arquivos": n}


# ---------------- eventos ao vivo (SSE) ----------------
def _buscar_eventos(pid: str, depois: int) -> list[dict]:
    with _con() as con:
        return banco.eventos_desde(con, pid, depois)


def _formatar(e: dict) -> str:
    return f"id: {e['id']}\nevent: {e['tipo']}\ndata: {json.dumps(e, ensure_ascii=False)}\n\n"


@rotas.get("/projetos/{pid}/eventos")
async def eventos(pid: str, request: Request, depois: int = 0, seguir: bool = True, ate: float = 3600.0,
                  last_event_id: Optional[str] = Header(default=None)):
    with _con() as con:
        _projeto(con, pid)
    cursor = max(depois, int(last_event_id) if (last_event_id or "").isdigit() else 0)
    ate = max(1.0, min(ate, 6 * 3600.0))

    async def gerar():
        nonlocal cursor
        inicio, ultimo_ping = time.monotonic(), time.monotonic()
        yield "retry: 2000\n\n"
        while True:
            novos = await asyncio.to_thread(_buscar_eventos, pid, cursor)
            for e in novos:
                cursor = e["id"]
                yield _formatar(e)
            if not novos:
                if not seguir or time.monotonic() - inicio > ate or await request.is_disconnected():
                    return
                if time.monotonic() - ultimo_ping > 15:
                    ultimo_ping = time.monotonic()
                    yield ": ping\n\n"
                await asyncio.sleep(0.5)

    return StreamingResponse(gerar(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})


# ---------------- arquivos do armazenamento (player) com Range ----------------
_RE_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


@rotas.get("/arquivos/{chave:path}")
def servir_arquivo(chave: str, range: Optional[str] = Header(default=None)):
    _, arm = _config()
    try:
        validar_chave(chave)
    except ChaveInvalida as e:
        raise HTTPException(400, str(e)) from e
    if not chave.startswith(PREFIXOS_SERVIDOS):
        raise HTTPException(403, "caminho não servido")
    if arm is None or not arm.existe(chave):
        raise HTTPException(404, "arquivo não encontrado")
    if getattr(arm, "nome", "") != "local":
        return RedirectResponse(arm.url(chave), status_code=307)
    caminho = arm.caminho_local(chave)
    total = caminho.stat().st_size
    tipo = mimetypes.guess_type(caminho.name)[0] or "application/octet-stream"
    ini, fim, status = 0, total - 1, 200
    if range:
        m = _RE_RANGE.match(range.strip())
        if not m or (not m.group(1) and not m.group(2)):
            raise HTTPException(416, "Range inválido", headers={"Content-Range": f"bytes */{total}"})
        if m.group(1):
            ini = int(m.group(1))
            fim = min(int(m.group(2)), total - 1) if m.group(2) else total - 1
        else:                                   # bytes=-N (últimos N)
            ini = max(0, total - int(m.group(2)))
        if ini >= total or ini > fim:
            raise HTTPException(416, "Range fora do arquivo", headers={"Content-Range": f"bytes */{total}"})
        status = 206
    tamanho = fim - ini + 1

    def ler():
        with open(caminho, "rb") as f:
            f.seek(ini)
            falta = tamanho
            while falta > 0:
                bloco = f.read(min(1 << 20, falta))
                if not bloco:
                    break
                falta -= len(bloco)
                yield bloco

    cab = {"Accept-Ranges": "bytes", "Content-Length": str(tamanho), "Cache-Control": "private, max-age=3600"}
    if status == 206:
        cab["Content-Range"] = f"bytes {ini}-{fim}/{total}"
    return StreamingResponse(ler(), status_code=status, media_type=tipo, headers=cab)


@rotas.head("/arquivos/{chave:path}")
def cabecalho_arquivo(chave: str):
    _, arm = _config()
    try:
        validar_chave(chave)
    except ChaveInvalida as e:
        raise HTTPException(400, str(e)) from e
    if not chave.startswith(PREFIXOS_SERVIDOS) or arm is None or not arm.existe(chave):
        raise HTTPException(404, "arquivo não encontrado")
    tipo = mimetypes.guess_type(chave)[0] or "application/octet-stream"
    return Response(headers={"Accept-Ranges": "bytes", "Content-Length": str(arm.tamanho(chave)), "Content-Type": tipo})
