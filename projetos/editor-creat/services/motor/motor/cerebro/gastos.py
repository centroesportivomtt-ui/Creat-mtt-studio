"""Livro de gastos do motor: uma linha por chamada paga em `<dados>/gastos.jsonl` (quando, projeto, o que, modelo,
tokens, US$). O painel de gastos do mês lê daqui. Nunca derruba quem chamou."""
from __future__ import annotations

import json
import pathlib
import time


def registrar(cfg, o_que: str, uso: dict, *, projeto: str | None = None, versao: str | None = None) -> None:
    try:
        linha = {"quando": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "o_que": o_que, "projeto": projeto, "versao": versao,
                 "modelo": uso.get("modelo"), "entrada": int(uso.get("entrada", 0) or 0), "saida": int(uso.get("saida", 0) or 0),
                 "custo_usd": round(float(uso.get("custo_usd", 0) or 0), 5), **({"estimado": True} if uso.get("estimado") else {})}
        arq = pathlib.Path(cfg.dados) / "gastos.jsonl"
        arq.parent.mkdir(parents=True, exist_ok=True)
        with open(arq, "a", encoding="utf-8") as f:
            f.write(json.dumps(linha, ensure_ascii=False) + "\n")
    except Exception as e:  # noqa: BLE001
        import logging
        logging.getLogger("motor.gastos").warning("gasto de %s não foi para o livro: %s", o_que, e)


def ler(cfg, mes: str | None = None) -> list[dict]:
    """Linhas do livro; mes = 'AAAA-MM' filtra."""
    arq = pathlib.Path(cfg.dados) / "gastos.jsonl"
    if not arq.exists():
        return []
    out = []
    for ln in arq.read_text(encoding="utf-8").splitlines():
        try:
            d = json.loads(ln)
        except ValueError:
            continue
        if not mes or str(d.get("quando", "")).startswith(mes):
            out.append(d)
    return out
