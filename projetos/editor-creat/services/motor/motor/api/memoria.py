"""Regras da casa no Caderno (onda 3, seção 8): apagar uma regra, uma conferência ou uma palavra do vocabulário.

POST /v1/memoria/regras/{id}/apagar        {} -> {apagado: {tipo: "regra", id, texto}}
POST /v1/memoria/checagens/{id}/apagar     {} -> {apagado: {tipo: "checagem", id, texto}}
POST /v1/memoria/vocabulario/{id}/apagar   {} -> {apagado: {tipo: "vocabulario", id, texto: "<de> → <para>"}}

Só o que nasceu de um ajuste do dono (r_dono_*, c_dono_*, vocabulário com origem "reprovação do dono"). As da casa vêm do
código e voltariam no próximo deploy: a tela mostra "Fixa da casa", sem botão. Apagar vira lápide (memoria/apagados.json),
que a Loja e o `semear` respeitam. Nenhuma rota daqui enfileira job, mexe em versão ou emite evento: nenhum filme é refeito.
Só pela tela: o Nimbus não tem ferramenta de apagar.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from motor import banco, config
from motor.memoria.loja import Loja, pode_apagar

rotas = APIRouter(tags=["memoria"])
NAO_E_SEU = "só dá para apagar o que nasceu de um ajuste seu"
NAO_EXISTE = {"regra": "essa regra não existe mais", "checagem": "essa conferência não existe mais",
              "vocabulario": "essa palavra não existe mais"}
CONFERENCIA_RODANDO = "uma conferência ou entrega está rodando agora; apague quando ela terminar"


class Vazio(BaseModel):
    pass


def _conferencia_rodando() -> bool:
    """D32: a chave da conferência inclui as checagens; trocar no meio derrubaria a entrega com erro."""
    con = banco.conectar(config.carregar().banco)
    try:
        return con.execute("SELECT 1 FROM jobs WHERE etapa IN ('qa','entrega') AND estado IN ('pendente','rodando') LIMIT 1").fetchone() is not None
    finally:
        con.close()


def _apagar(tipo: str, ident: str) -> dict:
    if not pode_apagar(tipo, ident):
        raise HTTPException(404, NAO_E_SEU)
    if tipo == "checagem" and _conferencia_rodando():
        raise HTTPException(409, CONFERENCIA_RODANDO)
    try:
        r = Loja().apagar(tipo, ident)
    except PermissionError:
        raise HTTPException(404, NAO_E_SEU) from None
    except KeyError:
        raise HTTPException(404, NAO_EXISTE[tipo]) from None
    return {"apagado": {"tipo": r["tipo"], "id": r["id"], "texto": str(r.get("texto") or "")[:600]}}


@rotas.post("/memoria/regras/{ident}/apagar")
def apagar_regra(ident: str, corpo: Optional[Vazio] = None):
    return _apagar("regra", ident)


@rotas.post("/memoria/checagens/{ident}/apagar")
def apagar_checagem(ident: str, corpo: Optional[Vazio] = None):
    return _apagar("checagem", ident)


@rotas.post("/memoria/vocabulario/{ident}/apagar")
def apagar_vocabulario(ident: str, corpo: Optional[Vazio] = None):
    return _apagar("vocabulario", ident)
