"""Fábrica da API.  uso: uvicorn motor.api.app:criar --factory --port 8787"""
from __future__ import annotations

import importlib


def criar():
    from fastapi import Depends, FastAPI, Header, HTTPException

    from motor import config

    cfg = config.carregar()

    def autorizado(authorization: str = Header(default="")):
        if cfg.motor_token and authorization != f"Bearer {cfg.motor_token}":
            raise HTTPException(401, "token do motor inválido")

    app = FastAPI(title="Motor do Editor creat.MTT", version="0.1.0", dependencies=[Depends(autorizado)])

    @app.get("/v1/saude")
    def saude():
        return {"ok": True, "provedores": {t: cfg.provedor_efetivo(t) for t in ("armazenamento", "transcricao", "visao", "cerebro", "render", "publicacao")}}

    for nome in ("projetos", "direcao", "versoes"):
        try:
            mod = importlib.import_module(f"motor.api.{nome}")
        except ModuleNotFoundError as e:
            if e.name != f"motor.api.{nome}":
                raise
            continue
        app.include_router(mod.rotas, prefix="/v1")
    return app
