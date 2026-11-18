"""Orçamento de tokens e custo por chamada (ARQUITETURA.md §7).

Estimativa sem rede: len(texto)/3.5 (pt-BR). Com chave, o cérebro anthropic confirma com messages.count_tokens.
Preços (US$ por milhão de tokens, tabela de 03/11/2026 da skill claude-api): leitura de cache cobrada à parte.
"""
from __future__ import annotations

import json
import math

CARACTERES_POR_TOKEN = 3.5
PRECOS = {  # modelo: (entrada, saida, leitura_cache, escrita_cache_5min)
    "claude-opus-5-5": (4.00, 20.00, 0.20, 5.00),
    "claude-haiku-5-5": (0.10, 0.50, 0.01, 0.125),
    "claude-sonnet-5-5": (2.00, 10.00, 0.10, 2.50),
}
LIMITE_PROMPT = 22000     # sistema + memória + catálogo + pedido (aceite B)
LIMITE_DIRECAO = 4000     # direção serializada


def estimar_tokens(texto: str) -> int:
    return int(math.ceil(len(texto) / CARACTERES_POR_TOKEN))


def tokens_json(obj) -> int:
    return estimar_tokens(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))


def custo_usd(modelo: str, entrada: int, saida: int, cache_lido: int = 0, cache_escrito: int = 0) -> float:
    pe, ps, pc, pw = PRECOS.get(modelo, PRECOS["claude-opus-5-5"])
    return round((entrada * pe + saida * ps + cache_lido * pc + cache_escrito * pw) / 1e6, 5)


def uso(modelo: str, *, entrada: int, saida: int, cache_lido: int = 0, cache_escrito: int = 0, estimado: bool = False, **extra) -> dict:
    d = {"modelo": modelo, "entrada": entrada, "entrada_cache": cache_lido, "cache_escrito": cache_escrito, "saida": saida,
         "custo_usd": custo_usd(modelo, entrada, saida, cache_lido, cache_escrito), "estimado": estimado}
    d.update(extra)
    return d


def somar(usos: list[dict]) -> dict:
    tot = {"entrada": 0, "entrada_cache": 0, "cache_escrito": 0, "saida": 0, "custo_usd": 0.0, "chamadas": len(usos)}
    for u in usos:
        for k in ("entrada", "entrada_cache", "cache_escrito", "saida"):
            tot[k] += int(u.get(k, 0) or 0)
        tot["custo_usd"] = round(tot["custo_usd"] + float(u.get("custo_usd", 0) or 0), 5)
    return tot
