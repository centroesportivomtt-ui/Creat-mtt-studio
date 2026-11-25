"""Rotas da conversa com o editor (plano 13.1, R1 a R8). Sob /v1 e atrás do token do motor (api/app.py).

GET  /v1/conversa                                  -> chave ligada?, gasto do dia, teto, quem espera o dono
POST /v1/conversa                 {ligada}         -> liga/desliga (grava <dados>/conversa.json); desligar para os turnos
POST /v1/projetos/{pid}/conversa  {texto, via?, contexto?, cliente_msg_id} -> 202 {turno, na_fila}
POST /v1/projetos/{pid}/conversa/audio   corpo bruto (webm/mp4/ogg/m4a, até 950 KB) -> {texto, conf, s_audio, s}; não envia
POST /v1/projetos/{pid}/conversa/responder {tool_use_id, escolha_id?, texto?} -> 202 {turno}; o turno continua
POST /v1/projetos/{pid}/conversa/confirmar {tool_use_id, sim, entrada_hash}  -> {feito, resultado?}; o turno não continua
POST /v1/projetos/{pid}/conversa/parar     {}  -> {parou}
POST /v1/projetos/{pid}/conversa/retomar   {}  -> 202 {turno}
Entrada validada na borda (pydantic); erros {detail} em pt-BR simples. Nada de segredo em resposta, log ou evento.
"""
from __future__ import annotations

import asyncio
import json
import pathlib
import re
import time
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator, model_validator

from motor import banco, config
from motor.conversa import laco, ouvir, preferencia

rotas = APIRouter(tags=["conversa"])
RE_PID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def _cfg():
    return config.carregar()


def _projeto_existe(cfg, pid: str) -> None:
    if not RE_PID.match(pid):
        raise HTTPException(404, "projeto não encontrado")
    con = banco.conectar(cfg.banco)
    try:
        if con.execute("SELECT 1 FROM projetos WHERE id=?", (pid,)).fetchone() is None:
            raise HTTPException(404, "projeto não encontrado")
    finally:
        con.close()


async def _existe(cfg, pid: str) -> None:
    await asyncio.to_thread(_projeto_existe, cfg, pid)


def _http(e: laco.ErroConversa) -> HTTPException:
    return HTTPException(e.status, e.detalhe)


# ---------------- modelos de entrada ----------------
class Chave(BaseModel):
    ligada: bool


class Contexto(BaseModel):
    versao: Optional[str] = Field(None, pattern=r"^v[0-9]{1,3}$")
    t_player: Optional[float] = Field(None, ge=0, le=6 * 3600)
    tela: Optional[Literal["fio", "player", "caderno"]] = None


class Mensagem(BaseModel):
    texto: str = Field(..., min_length=1, max_length=4000)
    via: Literal["texto", "audio"] = "texto"
    contexto: Optional[Contexto] = None
    cliente_msg_id: str = Field(..., pattern=r"^[A-Za-z0-9_-]{8,40}$")

    @field_validator("texto")
    @classmethod
    def _texto(cls, v):
        v = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", v).strip()
        if not v:
            raise ValueError("mensagem vazia")
        return v


class Resposta(BaseModel):
    tool_use_id: str = Field(..., min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    escolha_id: Optional[str] = Field(None, min_length=1, max_length=20)
    texto: Optional[str] = Field(None, min_length=1, max_length=1000)

    @model_validator(mode="after")
    def _um(self):
        if self.texto is not None:
            self.texto = self.texto.strip() or None
        if self.escolha_id is None and not self.texto:
            raise ValueError("toque numa opção ou escreva a resposta")
        return self


class Confirmacao(BaseModel):
    tool_use_id: str = Field(..., min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    sim: bool
    entrada_hash: str = Field(..., pattern=r"^[0-9a-f]{64}$")


class Vazio(BaseModel):
    pass


# ---------------- R1 / R2 ----------------
@rotas.get("/conversa")
async def ver_chave():
    cfg = _cfg()
    m = laco.mesa()
    return await asyncio.to_thread(m.estado, cfg)


@rotas.post("/conversa")
async def mudar_chave(corpo: Chave):
    cfg = _cfg()
    m = laco.mesa()
    if corpo.ligada:
        ok, _ = preferencia.no_servidor(cfg)
        if not ok:
            raise HTTPException(409, "a conversa está desligada no servidor")
    await asyncio.to_thread(preferencia.gravar, cfg, corpo.ligada)
    if not corpo.ligada:
        await m.parar_todos()
    return await asyncio.to_thread(m.estado, cfg)


# ---------------- R3 ----------------
@rotas.post("/projetos/{pid}/conversa", status_code=202)
async def mandar(pid: str, corpo: Mensagem):
    cfg = _cfg()
    await _existe(cfg, pid)
    try:
        return await laco.mesa().mandar(cfg, pid, texto=corpo.texto, via=corpo.via,
                                        contexto=corpo.contexto.model_dump(exclude_none=True) if corpo.contexto else None,
                                        cmid=corpo.cliente_msg_id)
    except laco.ErroConversa as e:
        raise _http(e) from None


# ---------------- R4: áudio -> texto (não envia nada) ----------------
@rotas.post("/projetos/{pid}/conversa/audio")
async def transcrever(pid: str, request: Request):
    cfg = _cfg()
    await _existe(cfg, pid)
    tipo = (request.headers.get("content-type") or "").split(";")[0].strip().lower()
    ext = ouvir.TIPOS.get(tipo)
    if ext is None:
        raise HTTPException(415, "formato de áudio não aceito")
    tam = request.headers.get("content-length")
    if tam and tam.isdigit() and int(tam) > ouvir.MAX_BYTES:
        raise HTTPException(413, "grave até 1 minuto")
    partes, total = [], 0
    async for pedaco in request.stream():
        total += len(pedaco)
        if total > ouvir.MAX_BYTES:
            raise HTTPException(413, "grave até 1 minuto")
        partes.append(pedaco)
    if total < 200:
        raise HTTPException(422, "não entendi, grave de novo")
    m = laco.mesa()
    pasta = pathlib.Path(cfg.dados) / "tmp" / "voz"
    pasta.mkdir(parents=True, exist_ok=True)
    arq = pasta / f"{uuid.uuid4().hex}.{ext}"
    tid = laco.novo_id("au_")
    t0 = time.monotonic()
    await m.emitir(cfg, pid, "ferramenta", {"turno": None, "tool_use_id": tid, "nome": "ouvir_audio", "fase": "inicio"})
    try:
        await asyncio.to_thread(arq.write_bytes, b"".join(partes))
        async with m.sem_voz:
            proc = await asyncio.create_subprocess_exec(*ouvir.comando(arq), stdout=asyncio.subprocess.PIPE,
                                                        stderr=asyncio.subprocess.PIPE, env=ouvir.ambiente(), cwd=str(ouvir.raiz_motor()))
            try:
                saida, _erro = await asyncio.wait_for(proc.communicate(), timeout=ouvir.LIMITE_S)
            except asyncio.TimeoutError:
                proc.kill()
                await proc.wait()
                await m.emitir(cfg, pid, "ferramenta", {"turno": None, "tool_use_id": tid, "nome": "ouvir_audio", "fase": "erro",
                                                        "resumo": "demorou demais", "s": round(time.monotonic() - t0, 2)})
                raise HTTPException(504, "demorou demais; grave de novo") from None
        if proc.returncode == 3:
            await m.emitir(cfg, pid, "ferramenta", {"turno": None, "tool_use_id": tid, "nome": "ouvir_audio", "fase": "erro",
                                                    "resumo": "transcrição indisponível", "s": round(time.monotonic() - t0, 2)})
            raise HTTPException(503, "a transcrição não está disponível; use o microfone do teclado")
        r = None
        if proc.returncode == 0:
            try:
                r = json.loads((saida or b"").decode("utf-8", "replace").strip().splitlines()[-1])
            except (ValueError, IndexError):
                r = None
        texto = " ".join(str((r or {}).get("texto") or "").split())
        if not texto:
            await m.emitir(cfg, pid, "ferramenta", {"turno": None, "tool_use_id": tid, "nome": "ouvir_audio", "fase": "erro",
                                                    "resumo": "não entendi o áudio", "s": round(time.monotonic() - t0, 2)})
            raise HTTPException(422, "não entendi, grave de novo")
        s = round(time.monotonic() - t0, 2)
        s_audio = float(r.get("s_audio") or 0)
        await m.emitir(cfg, pid, "ferramenta", {"turno": None, "tool_use_id": tid, "nome": "ouvir_audio", "fase": "fim",
                                                "resumo": f"Ouviu {round(s_audio)} s", "s": s})
        return {"texto": texto[:4000], "conf": float(r.get("conf") or 0), "s_audio": s_audio, "s": s}
    finally:
        try:
            arq.unlink()
        except OSError:
            pass


# ---------------- R5 a R8 ----------------
@rotas.post("/projetos/{pid}/conversa/responder", status_code=202)
async def responder(pid: str, corpo: Resposta):
    cfg = _cfg()
    await _existe(cfg, pid)
    try:
        return await laco.mesa().responder(cfg, pid, tool_use_id=corpo.tool_use_id, escolha_id=corpo.escolha_id, texto=corpo.texto)
    except laco.ErroConversa as e:
        raise _http(e) from None


@rotas.post("/projetos/{pid}/conversa/confirmar")
async def confirmar(pid: str, corpo: Confirmacao):
    cfg = _cfg()
    await _existe(cfg, pid)
    try:
        return await laco.mesa().confirmar(cfg, pid, tool_use_id=corpo.tool_use_id, sim=corpo.sim, entrada_hash=corpo.entrada_hash)
    except laco.ErroConversa as e:
        raise _http(e) from None


@rotas.post("/projetos/{pid}/conversa/parar")
async def parar(pid: str, corpo: Optional[Vazio] = None):
    cfg = _cfg()
    await _existe(cfg, pid)
    return {"parou": await laco.mesa().parar(pid)}


@rotas.post("/projetos/{pid}/conversa/retomar", status_code=202)
async def retomar(pid: str, corpo: Optional[Vazio] = None):
    cfg = _cfg()
    await _existe(cfg, pid)
    try:
        return await laco.mesa().retomar(cfg, pid)
    except laco.ErroConversa as e:
        raise _http(e) from None
