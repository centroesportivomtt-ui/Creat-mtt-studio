"""Backup diário (tela "Backup" do Caderno).
GET  /v1/backup          -> estado (nunca devolve o endereço do destino, só se existe)
POST /v1/backup/config   {pedido} -> grava o endereço da solicitação de arquivos do Dropbox em <dados>/backup_config.json
POST /v1/backup/rodar    -> monta e envia agora, em segundo plano
"""
from __future__ import annotations

import threading

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from motor import backup as B
from motor import config

rotas = APIRouter(tags=["backup"])


class Destino(BaseModel):
    pedido: str = Field(min_length=20, max_length=200)


@rotas.get("/backup")
def ver():
    return B.estado(config.carregar())


@rotas.post("/backup/config")
def configurar(corpo: Destino):
    cfg = config.carregar()
    try:
        B.configurar(cfg, corpo.pedido)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return B.estado(cfg)


@rotas.post("/backup/rodar", status_code=202)
def rodar():
    cfg = config.carregar()
    falta = B.espera_manual(cfg)
    if falta > 0:
        raise HTTPException(429, f"o último backup foi há pouco; dá para pedir outro em {int(falta // 60) + 1} min")
    threading.Thread(target=B.rodar, args=(cfg,), daemon=True, name="backup-agora").start()
    return dict(B.estado(cfg), estado="rodando")
