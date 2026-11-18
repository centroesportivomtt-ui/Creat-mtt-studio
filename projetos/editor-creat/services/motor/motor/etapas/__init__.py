"""Registro das etapas do motor e regras de encadeamento (pipeline).

Cada frente registra suas etapas com @etapa("nome") num módulo de motor/etapas/ (ingest.py, analise.py,
catalogo.py, direcao.py, montagem.py, qa.py, entrega.py). A função recebe um Contexto e devolve um dict
(saída curta, gravada no job). Arquivos grandes vão para o armazenamento, nunca para o banco.

Contrato de uma etapa:
- IDEMPOTENTE: se a saída já existe e o hash da entrada não mudou, retorna sem refazer.
- ATÔMICA no disco: escreve em <arquivo>.tmp e renomeia no fim.
- Informa progresso com ctx.progresso(0..1, "mensagem em pt-BR") e renova o aluguel em trabalhos longos.
- Lança ErroDefinitivo para erro que não adianta repetir (arquivo corrompido, schema inválido).
"""
from __future__ import annotations

import importlib
from dataclasses import dataclass
from typing import Callable

ORDEM = ("ingest", "analise", "catalogo", "direcao", "montagem", "qa", "entrega")
_REGISTRO: dict[str, Callable] = {}


class ErroDefinitivo(Exception):
    """Erro que não melhora com nova tentativa."""


@dataclass
class Contexto:
    con: object            # sqlite3.Connection
    cfg: object            # motor.config.Config
    job: dict
    armazenamento: object  # motor.provedores.base.Armazenamento

    @property
    def projeto(self) -> str:
        return self.job["projeto"]

    @property
    def alvo(self) -> str | None:
        a = self.job.get("alvo")
        return None if a in (None, "-") else a

    def progresso(self, p: float, mensagem: str | None = None) -> None:
        from motor import banco
        banco.emitir(self.con, self.projeto, "etapa_progresso", etapa=self.job["etapa"], alvo=self.alvo, progresso=round(p, 3), mensagem=mensagem)
        banco.renovar(self.con, self.job["id"])


def etapa(nome: str):
    if nome not in ORDEM:
        raise ValueError(f"etapa desconhecida: {nome}")

    def reg(fn):
        _REGISTRO[nome] = fn
        return fn
    return reg


def carregar_todas() -> dict[str, Callable]:
    """Importa os módulos de etapa que já existem (uma frente pode ainda não ter entregue o seu)."""
    for nome in ORDEM:
        try:
            importlib.import_module(f"motor.etapas.{nome}")
        except ModuleNotFoundError as e:
            if e.name != f"motor.etapas.{nome}":
                raise
    return dict(_REGISTRO)


def obter(nome: str) -> Callable:
    if nome not in _REGISTRO:
        carregar_todas()
    if nome not in _REGISTRO:
        raise ErroDefinitivo(f"etapa '{nome}' ainda não implementada")
    return _REGISTRO[nome]
