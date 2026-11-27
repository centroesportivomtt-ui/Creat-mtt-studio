"""Rotas da marca do cliente (onda 4, item 5): logo e poses do mascote, enviadas pela tela do Caderno.

GET  /v1/marcas                                -> {"marcas": [{slug, nome, logo, atualizado, mascote}], "fixos": [...]}
POST /v1/marcas/{cliente}/logo                 corpo cru image/png|jpeg|webp, até 8 MB -> {slug, logo: true, w, h, alfa}
GET  /v1/marcas/{cliente}/logo                 -> image/png (nosniff, private, no-cache); 404 sem logo
POST /v1/marcas/{cliente}/logo/apagar          -> {slug, logo: false}
POST /v1/marcas/{cliente}/mascote/{pose}       igual à logo, mais 422 sem fundo transparente
GET  /v1/marcas/{cliente}/mascote/{pose}       -> image/png
POST /v1/marcas/{cliente}/mascote/{pose}/apagar

`cliente` é normalizado como na página de entregas ("Super Kal" e "super_kal" gravam em marcas/super-kal/).
A validação da imagem mora em `motor/marcas.py` (a mesma da linha de comando).
"""
from __future__ import annotations

import os
import pathlib

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from motor import config, entregas_r2, marcas

rotas = APIRouter(tags=["marcas"])
_CFG: dict = {}


def _arm():
    k = os.environ.get("EDITOR_DADOS", "")
    if k not in _CFG:
        from motor.provedores import armazenamento_de
        _CFG.clear()
        _CFG[k] = armazenamento_de(config.carregar())
    arm = _CFG[k]
    if arm is None:
        raise HTTPException(503, "armazenamento indisponível neste motor")
    return arm


def _erro(e: marcas.ErroImagem) -> HTTPException:
    return HTTPException(e.status, e.frase)


def _slug(cliente: str) -> str:
    try:
        return marcas.slug_ou_erro(cliente)
    except marcas.ErroImagem as e:
        raise _erro(e) from e


async def _corpo(request: Request) -> bytes:
    """Lê o corpo cru com teto: o content-length mentiroso não passa (conta o que chega, para no primeiro byte a mais)."""
    try:
        declarado = int(request.headers.get("content-length") or 0)
    except ValueError:
        declarado = 0
    if declarado > marcas.LIMITE_BYTES:
        raise HTTPException(413, "imagem grande demais: mande com até 8 MB")
    partes, total = [], 0
    async for bloco in request.stream():
        total += len(bloco)
        if total > marcas.LIMITE_BYTES:
            raise HTTPException(413, "imagem grande demais: mande com até 8 MB")
        partes.append(bloco)
    if not total:
        raise HTTPException(422, "não é uma imagem válida")
    return b"".join(partes)


def _png(arm, chave: str) -> Response:
    if not arm.existe(chave):
        raise HTTPException(404, "imagem não cadastrada")
    dados = pathlib.Path(arm.caminho_local(chave)).read_bytes()
    return Response(dados, media_type="image/png", headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-cache",
                                                             "Content-Security-Policy": "default-src 'none'; sandbox"})


@rotas.get("/marcas")
def listar():
    return {"marcas": marcas.listar(_arm()), "fixos": list(entregas_r2.CLIENTES_FIXOS)}


@rotas.post("/marcas/{cliente}/logo")
async def enviar_logo(cliente: str, request: Request):
    s = _slug(cliente)
    tipo = request.headers.get("content-type")
    if (tipo or "").split(";")[0].strip().lower() not in marcas.TIPOS:      # antes de ler o corpo: tipo errado nem sobe
        raise HTTPException(415, "tipo de arquivo não aceito: mande a imagem em PNG, JPEG ou WEBP")
    dados = await _corpo(request)
    try:
        return await run_in_threadpool(marcas.gravar_logo, _arm(), s, dados, tipo)
    except marcas.ErroImagem as e:
        raise _erro(e) from e


@rotas.get("/marcas/{cliente}/logo")
def ver_logo(cliente: str):
    return _png(_arm(), marcas.chave_logo(_slug(cliente)))


@rotas.post("/marcas/{cliente}/logo/apagar")
def apagar_logo(cliente: str):
    return marcas.apagar_logo(_arm(), _slug(cliente))


def _pose(pose: str) -> str:
    if pose not in marcas.POSES:
        raise HTTPException(404, "pose do mascote não existe")
    return pose


@rotas.post("/marcas/{cliente}/mascote/{pose}")
async def enviar_mascote(cliente: str, pose: str, request: Request):
    s, pose = _slug(cliente), _pose(pose)
    tipo = request.headers.get("content-type")
    if (tipo or "").split(";")[0].strip().lower() not in marcas.TIPOS:
        raise HTTPException(415, "tipo de arquivo não aceito: mande a imagem em PNG, JPEG ou WEBP")
    dados = await _corpo(request)
    try:
        return await run_in_threadpool(marcas.gravar_mascote, _arm(), s, pose, dados, tipo)
    except marcas.ErroImagem as e:
        raise _erro(e) from e


@rotas.get("/marcas/{cliente}/mascote/{pose}")
def ver_mascote(cliente: str, pose: str):
    return _png(_arm(), marcas.chave_mascote(_slug(cliente), _pose(pose)))


@rotas.post("/marcas/{cliente}/mascote/{pose}/apagar")
def apagar_mascote(cliente: str, pose: str):
    return marcas.apagar_mascote(_arm(), _slug(cliente), _pose(pose))
