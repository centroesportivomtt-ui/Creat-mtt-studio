"""Apagar projeto e tirar da página de entregas (onda 3, seção 7). Só pela tela: o Nimbus não tem ferramenta de apagar.

GET  /v1/projetos/{pid}/apagar              -> Previa {pode, porque?, nome, vai_apagar, na_pagina, fica, restos_previstos?}
POST /v1/projetos/{pid}/apagar   {nome}     -> {apagado: true, arquivos: "apagando"}
POST /v1/projetos/{pid}/versoes/{v}/retirar {} -> 202 {estado: "retirando"} (idempotente)

O pid passa no formato antes de abrir o banco (fora: 404). Apagar roda com a trava da conversa do projeto presa: uma
mensagem que chega depois dá 404 e não grava nada (laco._preparar_mensagem confere o projeto na mesma transação).
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from motor import apagar as AP
from motor import banco, config

rotas = APIRouter(tags=["apagar"])
RE_V = re.compile(r"^v[0-9]{1,3}$")


class Confirmar(BaseModel):
    nome: str = Field(..., min_length=1, max_length=200)


class Vazio(BaseModel):
    pass


def _pid(pid: str) -> None:
    if not AP.pid_valido(pid):
        raise HTTPException(404, "projeto não encontrado")


def _http(e: AP.Recusa) -> HTTPException:
    return HTTPException(e.status, e.frase)


def _mesa():
    from motor.conversa import laco
    return laco.atual()


def _previa(cfg, pid: str, rodando: bool) -> dict:
    con = banco.conectar(cfg.banco)
    try:
        return AP.previa(con, pid, conversa_rodando=rodando)
    finally:
        con.close()


@rotas.get("/projetos/{pid}/apagar")
async def ver_previa(pid: str):
    _pid(pid)
    cfg = config.carregar()
    m = _mesa()
    try:
        return await asyncio.to_thread(_previa, cfg, pid, bool(m and m.rodando(pid)))
    except AP.Recusa as e:
        raise _http(e) from None


@rotas.post("/projetos/{pid}/apagar")
async def apagar(pid: str, corpo: Confirmar):
    _pid(pid)
    cfg = config.carregar()
    m = _mesa()
    try:
        if m is None:
            return await asyncio.to_thread(AP.apagar, cfg, pid, corpo.nome)
        async with m.trava(pid):
            if m.rodando(pid):
                raise AP.Recusa(409, AP.CONVERSA_RODANDO)
            return await asyncio.to_thread(AP.apagar, cfg, pid, corpo.nome)
    except AP.Recusa as e:
        raise _http(e) from None


def _retirar(cfg, pid: str, v: str) -> dict:
    from motor import entregas_r2
    from motor.api.direcao import _retirar_das_entregas
    con = banco.conectar(cfg.banco)
    try:
        p = con.execute("SELECT dados FROM projetos WHERE id=?", (pid,)).fetchone()
        if p is None:
            raise HTTPException(404, "projeto não encontrado")
        if con.execute("SELECT 1 FROM versoes WHERE projeto=? AND id=?", (pid, v)).fetchone() is None:
            raise HTTPException(404, "versão não encontrada")
        if not entregas_r2.ligado():
            raise HTTPException(503, "a página de entregas está desligada neste servidor")
        e = ((json.loads(p["dados"] or "{}").get("entregas") or {}).get(v) or {})
        if e.get("estado") == "retirando":
            return {"estado": "retirando"}
        if e.get("estado") not in AP.NA_PAGINA:
            raise HTTPException(409, "esta versão não está na página de entregas")
        _retirar_das_entregas(con, pid, v)          # a mesma função da reprovação: marca 'retirando' e enfileira a etapa de fundo
        return {"estado": "retirando"}
    finally:
        con.close()


@rotas.post("/projetos/{pid}/versoes/{v}/retirar", status_code=202)
def retirar(pid: str, v: str, corpo: Optional[Vazio] = None):
    _pid(pid)
    if not RE_V.fullmatch(v or ""):
        raise HTTPException(404, "versão não encontrada")
    return _retirar(config.carregar(), pid, v)
