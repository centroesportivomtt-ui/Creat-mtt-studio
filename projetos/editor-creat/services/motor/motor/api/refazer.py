"""Refazer uma etapa pela tela (onda 3, R11 e R12): o botão "Tentar de novo" (e "Conferir de novo", "Ler de novo").

GET  /v1/projetos/{pid}/refazer  -> {opcoes: Opcao[], sugerida: int|null}
POST /v1/projetos/{pid}/refazer  {de, versao?, arquivo_id?} -> 202 {feito: true, de, alvo, estado}

A MESMA guarda dos cartões da conversa (motor/refazer.py), lida de novo dentro da transação que grava. Só a tela refaz
catálogo e direção (pela_conversa: false). Nenhum job novo leva publicar_em.
"""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from motor import apagar as AP
from motor import banco, config, refazer

rotas = APIRouter(tags=["refazer"])


class Pedido(BaseModel):
    de: Literal["montagem", "conferencia", "entrega", "leitura", "catalogo", "direcao"]
    versao: Optional[str] = Field(None, pattern=r"^v[0-9]{1,3}$")
    arquivo_id: Optional[str] = Field(None, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")


def _pid(pid: str) -> None:
    if not AP.pid_valido(pid):
        raise HTTPException(404, "projeto não encontrado")


@rotas.get("/projetos/{pid}/refazer")
def ver_opcoes(pid: str):
    _pid(pid)
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    try:
        return refazer.opcoes(cfg, con, pid)
    except refazer.Recusa as e:
        raise HTTPException(404, e.porque) from None
    finally:
        con.close()


@rotas.post("/projetos/{pid}/refazer", status_code=202)
def refazer_etapa(pid: str, corpo: Pedido):
    _pid(pid)
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    try:
        if con.execute("SELECT 1 FROM projetos WHERE id=?", (pid,)).fetchone() is None:
            raise HTTPException(404, "projeto não encontrado")
    finally:
        con.close()
    if corpo.de == "leitura" and not corpo.arquivo_id:
        raise HTTPException(422, "diga qual vídeo")
    try:
        r = refazer.executar(cfg, pid, corpo.de, versao=corpo.versao if corpo.de in ("montagem", "conferencia", "entrega") else None,
                             arquivo_id=corpo.arquivo_id if corpo.de == "leitura" else None)
    except refazer.Recusa as e:
        if e.porque == "projeto não encontrado":
            raise HTTPException(404, e.porque) from None
        raise HTTPException(409, f"não deu: {e.porque}") from None
    return {"feito": True, "de": r["de"], "alvo": r["alvo"], "estado": r["estado"]}
