"""Fábrica da API.  uso: uvicorn motor.api.app:criar --factory --port 8787"""
from __future__ import annotations

import importlib


import hmac
import os

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


def criar():
    from fastapi import Depends, FastAPI, Header, HTTPException

    from motor import config

    cfg = config.carregar()
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

    app = FastAPI(title="Motor do Editor creat.MTT", version="0.1.0", dependencies=[Depends(autorizado)])

    @app.get("/v1/saude")
    def saude():
        return {"ok": True, "provedores": {t: cfg.provedor_efetivo(t) for t in ("armazenamento", "transcricao", "visao", "cerebro", "render", "publicacao")}}

    for nome in ("projetos", "envios", "direcao", "versoes"):
        try:
            mod = importlib.import_module(f"motor.api.{nome}")
        except ModuleNotFoundError as e:
            if e.name != f"motor.api.{nome}":
                raise
            continue
        app.include_router(mod.rotas, prefix="/v1")
    return app
