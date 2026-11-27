"""Estudos de caso por link.
POST /v1/referencias {url, nota?} -> lê em segundo plano (baixa, mede, transcreve) e grava na memória
GET  /v1/referencias               -> lista (mais novas primeiro) com o estado das leituras em andamento
"""
from __future__ import annotations

import threading
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from motor import referencias as R

rotas = APIRouter(tags=["referencias"])
_ANDAMENTO: dict[str, dict] = {}


class NovaReferencia(BaseModel):
    url: str = Field(min_length=12, max_length=500)
    nota: Optional[str] = Field(default=None, max_length=300)


def _ler(url: str, nota: str | None, rid: str):
    try:
        R.analisar(url, nota=nota)
        _ANDAMENTO.pop(rid, None)
    except Exception as e:  # noqa: BLE001 - o motivo aparece para o dono
        _ANDAMENTO[rid] = {"id": rid, "url": url, "estado": "erro", "erro": str(e)[:300]}


@rotas.post("/referencias", status_code=202)
def nova(corpo: NovaReferencia):
    if not R.URL_OK.match(corpo.url.strip()):
        raise HTTPException(422, "link não reconhecido: use um link público do Instagram, TikTok, YouTube, Vimeo, Drive ou Dropbox")
    rid = R.ident(corpo.url)
    _ANDAMENTO[rid] = {"id": rid, "url": corpo.url.strip(), "estado": "lendo"}
    threading.Thread(target=_ler, args=(corpo.url, corpo.nota, rid), daemon=True).start()
    return {"id": rid, "estado": "lendo"}


@rotas.get("/referencias")
def lista():
    return {"andamento": list(_ANDAMENTO.values()), "referencias": R.listar()}
