"""Biblioteca da casa (trilhas e efeitos) com licença registrada.
GET  /v1/biblioteca                   -> fichas (com licença, se pode tocar e por quê) e o que está entrando
POST /v1/biblioteca {url, tipo, titulo, nome?, clima?, licenca{...}} -> baixa pelo link (Dropbox/Drive) e registra em segundo plano
POST /v1/biblioteca/{tipo}/{id}/retirar -> tira de uso (a ficha fica, para histórico)
"""
from __future__ import annotations

import pathlib
import tempfile
import threading
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from motor import biblioteca as BIB
from motor import config

rotas = APIRouter(tags=["biblioteca"])
_ANDAMENTO: dict[str, dict] = {}


class Licenca(BaseModel):
    tipo: Literal["propria", "comprada", "gerada_ia", "livre"]
    fonte: str = Field(min_length=2, max_length=120)
    autor: Optional[str] = Field(default=None, max_length=120)
    termos_url: Optional[str] = Field(default=None, max_length=300, pattern=r"^https://")
    atribuicao: Optional[str] = Field(default=None, max_length=200)
    uso_comercial: bool


class NovoSom(BaseModel):
    url: str = Field(min_length=12, max_length=500)
    tipo: Literal["trilha", "sfx"]
    titulo: str = Field(min_length=2, max_length=80)
    nome: Optional[str] = Field(default=None, pattern=r"^[a-z0-9][a-z0-9_-]{1,40}$")
    clima: Optional[str] = Field(default=None, max_length=40)
    licenca: Licenca


def _importar(corpo: dict, rid: str):
    from motor import importar
    from motor.provedores import armazenamento_de
    cfg = config.carregar()
    try:
        with tempfile.TemporaryDirectory() as d:
            link, tipo = importar.link_direto(corpo["url"])
            if tipo != "arquivo":
                raise ValueError("mande o link de UM arquivo de áudio (não de uma pasta)")
            arq, _nome, _n = importar.baixar(link, pathlib.Path(d) / "som", max_bytes=300 << 20)
            item = BIB.registrar(cfg, armazenamento_de(cfg), arq, tipo=corpo["tipo"], titulo=corpo["titulo"], licenca=corpo["licenca"],
                                 clima=corpo.get("clima"), nome=corpo.get("nome"), origem_url=corpo["url"])
        _ANDAMENTO.pop(rid, None)
        return item
    except Exception as e:  # noqa: BLE001 - o motivo aparece para o dono
        _ANDAMENTO[rid] = {"id": rid, "titulo": corpo["titulo"], "estado": "erro", "erro": str(e)[:300]}
        return None


@rotas.get("/biblioteca")
def lista():
    from motor.provedores import armazenamento_de
    cfg = config.carregar()
    return {**BIB.listar(cfg, armazenamento_de(cfg)), "andamento": list(_ANDAMENTO.values())}


@rotas.post("/biblioteca", status_code=202)
def novo(corpo: NovoSom):
    from motor import importar
    prob = BIB.problema_licenca(corpo.licenca.model_dump())
    if prob:
        raise HTTPException(422, f"não registro som sem licença válida: {prob}")
    if corpo.tipo == "sfx" and not corpo.nome:
        raise HTTPException(422, "o efeito precisa de um nome curto (ex.: impacto, chip, cta)")
    try:
        importar.link_direto(corpo.url.strip())
    except Exception as e:  # noqa: BLE001
        raise HTTPException(422, str(e)) from e
    rid = uuid.uuid4().hex[:10]
    _ANDAMENTO[rid] = {"id": rid, "titulo": corpo.titulo, "estado": "entrando"}
    threading.Thread(target=_importar, args=(corpo.model_dump(), rid), daemon=True).start()
    return {"id": rid, "estado": "entrando"}


@rotas.post("/biblioteca/{tipo}/{ident}/retirar")
def retirar(tipo: Literal["trilha", "sfx"], ident: str):
    if not BIB.ID_OK.match(ident):
        raise HTTPException(422, "identificador inválido")
    if not BIB.retirar(config.carregar(), tipo, ident):
        raise HTTPException(404, "som não encontrado")
    return {"retirado": ident}
