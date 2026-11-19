"""Painel de gastos do mês.
GET /v1/gastos?mes=AAAA-MM -> total, por serviço, por tipo, por projeto, por dia e as últimas chamadas pagas.
Na primeira consulta de cada processo, traz para o livro o que foi gasto antes dele existir (sem duplicar).
"""
from __future__ import annotations

import re
import threading
from typing import Optional

from fastapi import APIRouter, HTTPException

from motor import config
from motor.cerebro import gastos

rotas = APIRouter(tags=["gastos"])
_IMPORTADO = threading.Event()
_TRAVA = threading.Lock()


@rotas.get("/gastos")
def painel(mes: Optional[str] = None):
    if mes is not None and not re.fullmatch(r"20\d\d-(0[1-9]|1[0-2])", mes):
        raise HTTPException(422, "mês no formato AAAA-MM")
    cfg = config.carregar()
    if not _IMPORTADO.is_set():
        with _TRAVA:
            if not _IMPORTADO.is_set():
                try:
                    from motor.provedores import armazenamento_de
                    gastos.importar_historico(cfg, armazenamento_de(cfg))
                finally:
                    _IMPORTADO.set()
    r = gastos.resumo(cfg, mes)
    nomes = {}
    try:                                                   # nome do projeto no lugar do código (p_abc123)
        from motor import banco
        con = banco.conectar(cfg.banco)
        try:
            nomes = {row["id"]: row["nome"] for row in con.execute("SELECT id, nome FROM projetos")}
        finally:
            con.close()
    except Exception:  # noqa: BLE001 - sem banco, mostra o código
        pass
    for x in r["por_projeto"]:
        if x["id"] in nomes:
            x["nome"] = nomes[x["id"]]
    for u in r["ultimas"]:
        if u.get("projeto") in nomes:
            u["projeto_nome"] = nomes[u["projeto"]]
    return r
