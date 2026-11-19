"""Diagnóstico da chave do cérebro: uma chamada mínima (modelo leve, 1 token de saída), com cache de 10 min.
Devolve só estado e código HTTP, nunca a chave. Custo: fração de centavo por checagem."""
from __future__ import annotations

import time

from motor import config

_CACHE: dict = {}


def checar_chave(cfg=None, *, validade_s: int = 600) -> dict:
    cfg = cfg or config.carregar()
    if not config.chave_anthropic():
        return {"estado": "ausente"}
    agora = time.time()
    if _CACHE and agora - _CACHE["em"] < validade_s:
        return _CACHE["r"]
    try:
        cli = config.cliente_anthropic()
        m = cli.messages.create(model=cfg.modelo_leve, max_tokens=1, messages=[{"role": "user", "content": "ok"}])
        r = {"estado": "ok", "modelo": m.model}
    except Exception as e:  # noqa: BLE001 - só o tipo e o status saem daqui
        r = {"estado": "falha", "erro": type(e).__name__, "status": getattr(e, "status_code", None)}
    _CACHE.update(em=agora, r=r)
    return r
