"""Rotas do link de aprovação do cliente (item F).

Do dono (o site só repassa com a sessão dele):
  POST /v1/projetos/{pid}/versoes/{v}/link-cliente   {dias?, titulo?} -> {id, token, caminho, expira}  (o token aparece só aqui)
  GET  /v1/projetos/{pid}/links-cliente              -> links do projeto (sem token)
  GET  /v1/clientes                                  -> respostas de clientes (para o Caderno)
  POST /v1/clientes/{id}/revogar | /tratar
Da página pública (o site chama do servidor dele, com o MOTOR_TOKEN; o navegador do cliente nunca fala com o motor):
  GET  /v1/cliente/{token}            -> título, versão, validade e resposta
  GET  /v1/cliente/{token}/video|capa -> só o vídeo final e a capa daquela versão (com Range)
  POST /v1/cliente/{token}/responder  {acao: aprovar|ajuste, texto?, nome?}
"""
from __future__ import annotations

import re
from contextlib import contextmanager
from typing import Literal, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from motor import banco, cliente, config

rotas = APIRouter(tags=["cliente"])
ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
NAO_EXISTE = "link não encontrado"


@contextmanager
def _con():
    con = banco.conectar(config.carregar().banco)
    try:
        cliente.preparar(con)
        yield con
    finally:
        con.close()


def _valida(*ids: str):
    if not all(ID.match(i) for i in ids):
        raise HTTPException(422, "identificador inválido")


class NovoLink(BaseModel):
    dias: int = Field(default=cliente.DIAS_PADRAO, ge=1, le=cliente.DIAS_MAX)
    titulo: Optional[str] = Field(default=None, max_length=80)


@rotas.post("/projetos/{pid}/versoes/{v}/link-cliente", status_code=201)
def gerar(pid: str, v: str, corpo: NovoLink):
    _valida(pid, v)
    with _con() as con:
        try:
            return cliente.gerar(con, pid, v, dias=corpo.dias, titulo=corpo.titulo)
        except LookupError as e:
            raise HTTPException(404, str(e)) from e
        except ValueError as e:
            raise HTTPException(409, str(e)) from e


@rotas.get("/projetos/{pid}/links-cliente")
def do_projeto(pid: str):
    _valida(pid)
    with _con() as con:
        return {"links": cliente.listar(con, pid)}


@rotas.get("/clientes")
def respostas():
    with _con() as con:
        return {"respostas": cliente.listar(con)}


@rotas.post("/clientes/{lid}/{acao}")
def mexer(lid: str, acao: Literal["revogar", "tratar"]):
    if not cliente.RE_ID.match(lid):
        raise HTTPException(422, "identificador inválido")
    with _con() as con:
        try:
            return cliente.revogar(con, lid) if acao == "revogar" else cliente.tratar(con, lid)
        except LookupError as e:
            raise HTTPException(404, str(e)) from e


# ---------------- página pública ----------------
def _publico(fn):
    try:
        r = fn()
    except cliente.LinkFechado as e:
        raise HTTPException(410, str(e)) from e
    if r is None:
        raise HTTPException(404, NAO_EXISTE)
    return r


@rotas.get("/cliente/{token}")
def abrir(token: str, contar: bool = True):
    with _con() as con:
        d = _publico(lambda: cliente.abrir(con, token, contar=contar))
        from motor.provedores import armazenamento_de
        arm = armazenamento_de(config.carregar())
        d["capa"] = bool(arm is not None and arm.existe(cliente.chave_de(con, token, "capa")))     # sem capa, o player não pede uma
        return d


@rotas.get("/cliente/{token}/{qual}")
def arquivo(token: str, qual: Literal["video", "capa"], range: Optional[str] = Header(default=None)):
    with _con() as con:
        chave = _publico(lambda: cliente.chave_de(con, token, qual))
    from motor.api.projetos import servir_arquivo
    return servir_arquivo(chave, range)


@rotas.head("/cliente/{token}/{qual}")
def arquivo_cabecalho(token: str, qual: Literal["video", "capa"]):
    with _con() as con:
        chave = _publico(lambda: cliente.chave_de(con, token, qual))
    from motor.api.projetos import cabecalho_arquivo
    return cabecalho_arquivo(chave)


class Resposta(BaseModel):
    acao: Literal["aprovar", "ajuste"]
    texto: Optional[str] = Field(default=None, max_length=cliente.TEXTO_MAX)
    nome: Optional[str] = Field(default=None, max_length=cliente.NOME_MAX)


@rotas.post("/cliente/{token}/responder")
def responder(token: str, corpo: Resposta):
    with _con() as con:
        try:
            return _publico(lambda: cliente.responder(con, token, corpo.acao, corpo.texto, corpo.nome))
        except PermissionError as e:
            raise HTTPException(409, str(e)) from e
        except OverflowError as e:
            raise HTTPException(429, str(e)) from e
        except ValueError as e:
            raise HTTPException(422, str(e)) from e
