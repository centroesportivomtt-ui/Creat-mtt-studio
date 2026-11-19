"""Fábrica da API.  uso: uvicorn motor.api.app:criar --factory --port 8787
Na Modal (deploy/modal_app.py) a mesma fábrica serve a função `api` (@modal.asgi_app). Lá o motor é sem estado local
(EDITOR_SEM_ESTADO=1: token obrigatório, R2 e Postgres conferidos ao subir) e, com EDITOR_MODAL_WORKER=1, toda requisição
que muda algo e deu certo acorda o worker remoto se ficou job pendente (worker.acordar_remoto)."""
from __future__ import annotations

import hmac
import importlib
import json
import os
import threading

from starlette.requests import Request  # nível de módulo: o FastAPI resolve a anotação pelo globals da função

LOOPBACK = ("127.0.0.1", "::1", "localhost", "testclient")


def _host_de_escuta() -> str:
    """Host informado ao processo (MOTOR_HOST, ou --host do uvicorn na linha de comando)."""
    import sys
    h = os.environ.get("MOTOR_HOST", "").strip()
    args = sys.argv
    for i, a in enumerate(args):
        if a == "--host" and i + 1 < len(args):
            h = args[i + 1]
        elif a.startswith("--host="):
            h = a.split("=", 1)[1]
    return h or "127.0.0.1"


MUTANTES = ("POST", "PUT", "PATCH", "DELETE")


class AcordarWorker:
    """Middleware ASGI puro (não segura SSE nem Range): depois de um POST/PUT/PATCH/DELETE com status < 400, chama
    `acordar(cfg)` numa thread, sem atrasar a resposta."""

    def __init__(self, app, acordar, cfg):
        self.app, self.acordar, self.cfg = app, acordar, cfg

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or scope.get("method") not in MUTANTES:
            return await self.app(scope, receive, send)
        status = {"s": 500}

        async def enviar(msg):
            if msg.get("type") == "http.response.start":
                status["s"] = int(msg.get("status", 500))
            await send(msg)

        await self.app(scope, receive, enviar)
        if status["s"] < 400:
            threading.Thread(target=self.acordar, args=(self.cfg,), daemon=True).start()


def _tem_nul(v) -> bool:
    if isinstance(v, str):
        return "\x00" in v
    if isinstance(v, dict):
        return any(_tem_nul(k) or _tem_nul(x) for k, x in v.items())
    if isinstance(v, list):
        return any(_tem_nul(x) for x in v)
    return False


def criar():
    from fastapi import Depends, FastAPI, Header, HTTPException

    from motor import config, worker

    cfg = config.carregar()
    worker.checar_sem_estado(cfg)        # só age com EDITOR_SEM_ESTADO=1 (nuvem)
    token = (cfg.motor_token or "").strip()
    if not token and _host_de_escuta() not in LOOPBACK:
        raise RuntimeError("MOTOR_TOKEN vazio: o motor só sobe fora de 127.0.0.1 com token (gere um e ponha no .env)")
    esperado = f"Bearer {token}".encode()

    def autorizado(request: Request, authorization: str = Header(default="")):
        if token:
            if not hmac.compare_digest(authorization.encode(), esperado):
                raise HTTPException(401, "token do motor inválido")
        elif (request.client.host if request.client else "") not in LOOPBACK:
            raise HTTPException(401, "motor sem MOTOR_TOKEN só atende a própria máquina")

    async def sem_nul(request: Request):
        """Byte NUL em qualquer texto do corpo JSON: 422 igual no SQLite e no Postgres (que recusa NUL e dava 500).
        Vale para todas as rotas, inclusive as que têm modelo em outro arquivo (pedido, direção)."""
        if request.method not in MUTANTES or "json" not in (request.headers.get("content-type") or ""):
            return
        corpo = await request.body()
        if b"\\u0000" not in corpo and b"\x00" not in corpo:
            return
        try:
            dado = json.loads(corpo)
        except ValueError:
            return                    # JSON quebrado: o FastAPI responde 422 sozinho
        if _tem_nul(dado):
            raise HTTPException(422, "texto com caractere NUL (\\u0000) não é aceito")

    # Motor exposto (com token, ou na nuvem sem estado): nada de /docs, /redoc nem /openapi.json abertos sem token.
    exposto = bool(token) or os.environ.get("EDITOR_SEM_ESTADO", "") == "1"
    docs = {"docs_url": None, "redoc_url": None, "openapi_url": None} if exposto else {}
    app = FastAPI(title="Motor do Editor creat.MTT", version="0.1.0", dependencies=[Depends(autorizado), Depends(sem_nul)], **docs)

    @app.get("/v1/saude")
    def saude():
        return {"ok": True, "provedores": {t: cfg.provedor_efetivo(t) for t in ("armazenamento", "transcricao", "visao", "cerebro", "render", "publicacao")}}

    for nome in ("projetos", "direcao", "versoes", "conferir"):
        try:
            mod = importlib.import_module(f"motor.api.{nome}")
        except ModuleNotFoundError as e:
            if e.name != f"motor.api.{nome}":
                raise
            continue
        app.include_router(mod.rotas, prefix="/v1")
    if os.environ.get("EDITOR_MODAL_WORKER", "") == "1":
        app.add_middleware(AcordarWorker, acordar=worker.acordar_remoto, cfg=cfg)
    return app
