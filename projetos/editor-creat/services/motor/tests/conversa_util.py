"""Ajudantes dos testes da conversa (sem rede, sem chave: cérebro falso = transporte HTTP falso no SDK oficial)."""
from __future__ import annotations

import json
import pathlib
import shutil
import time

import pytest

from motor import banco, config

SCHEMAS = config.SCHEMAS


def preparar_ambiente(dados, tmp_path, monkeypatch, *, cerebro: str = "falso"):
    destino = tmp_path / "memoria"
    if not destino.exists():
        shutil.copytree(config.MEMORIA, destino)
    monkeypatch.setenv("EDITOR_MEMORIA", str(destino))
    monkeypatch.delenv("MOTOR_TOKEN", raising=False)
    for n in ("EDITOR_ANTHROPIC_KEY", "ANTHROPIC_API_KEY", "EDITOR_CONVERSA", "EDITOR_CONVERSA_TETO_USD_DIA", "EDITOR_SSE_NOVO",
              "EDITOR_CONVERSA_ANDAMENTO", "EDITOR_MODELO_CONVERSA", "EDITOR_CONVERSA_ESFORCO"):
        monkeypatch.delenv(n, raising=False)
    monkeypatch.setenv("EDITOR_CEREBRO", "fixture")
    monkeypatch.setenv("EDITOR_CONVERSA_CEREBRO", cerebro)


@pytest.fixture()
def app_conversa(dados, tmp_path, monkeypatch):
    """Devolve uma função que cria o app (TestClient em `with`, para o laço em segundo plano viver)."""
    pytest.importorskip("fastapi")
    preparar_ambiente(dados, tmp_path, monkeypatch)

    def criar():
        from fastapi.testclient import TestClient
        from motor.api.app import criar as _criar
        return TestClient(_criar())
    return criar


def con():
    return banco.conectar(config.carregar().banco)


def novo_projeto(c, nome="teste", estado=None, versoes=(), dados=None) -> str:
    pid = c.post("/v1/projetos", json={"nome": nome}).json()["id"]
    k = con()
    try:
        if estado:
            k.execute("UPDATE projetos SET estado=? WHERE id=?", (estado, pid))
        if dados is not None:
            k.execute("UPDATE projetos SET dados=? WHERE id=?", (json.dumps(dados), pid))
        for v, est in versoes:
            k.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES (?,?,?,?)", (v, pid, est, banco.agora_iso()))
    finally:
        k.close()
    return pid


def eventos(pid: str, tipo: str | None = None) -> list[dict]:
    k = con()
    try:
        evs = banco.eventos_desde(k, pid, 0, limite=10000)
    finally:
        k.close()
    return [e for e in evs if tipo is None or e["tipo"] == tipo]


def esperar(cond, timeout: float = 10.0, passo: float = 0.05):
    fim = time.monotonic() + timeout
    while time.monotonic() < fim:
        r = cond()
        if r:
            return r
        time.sleep(passo)
    raise AssertionError("tempo esgotado esperando a condição")


def esperar_fim(pid: str, n: int = 1, timeout: float = 10.0) -> list[dict]:
    return esperar(lambda: (lambda f: f if len(f) >= n else None)(eventos(pid, "turno_fim")), timeout)


def mandar(c, pid: str, texto: str, cmid: str | None = None, **extra):
    import secrets
    corpo = {"texto": texto, "cliente_msg_id": cmid or ("m_" + secrets.token_hex(6)), **extra}
    return c.post(f"/v1/projetos/{pid}/conversa", json=corpo)


def validar_contra(nome_arquivo: str, obj) -> list[str]:
    import jsonschema
    esquema = json.loads((SCHEMAS / nome_arquivo).read_text(encoding="utf-8"))
    return [f"{'/'.join(map(str, e.absolute_path))}: {e.message[:200]}" for e in jsonschema.Draft202012Validator(esquema).iter_errors(obj)]


def conferir_eventos_da_conversa(pid: str):
    """Todo evento novo da conversa valida contra conversa.schema.json e tem estado/mensagem nulos (A1.24)."""
    tipos = {"fala_dono", "fala_editor", "ferramenta", "pergunta", "confirmacao", "resposta", "turno_fim", "mostrar"}
    evs = [e for e in eventos(pid) if e["tipo"] in tipos or (e["tipo"] == "aviso" and (e.get("dados") or {}).get("acao"))]
    for e in evs:
        assert e["estado"] is None and e["mensagem"] is None, e
    erros = validar_contra("conversa.schema.json", evs)
    assert erros == [], erros[:5]
    return evs


def gravar_gasto(cfg, custo: float, quando: str, o_que: str = "conversa"):
    arq = pathlib.Path(cfg.dados) / "gastos.jsonl"
    arq.parent.mkdir(parents=True, exist_ok=True)
    with open(arq, "a", encoding="utf-8") as f:
        f.write(json.dumps({"quando": quando, "servico": "anthropic", "o_que": o_que, "projeto": "px", "custo_usd": custo}) + "\n")


def texto(passo_txt: str) -> dict:
    return {"blocos": [{"tipo": "texto", "texto": passo_txt}]}


def ferramenta(nome: str, entrada: dict, *, antes: str | None = None, id_: str | None = None, extra: list | None = None) -> dict:
    blocos = ([{"tipo": "texto", "texto": antes}] if antes else []) + [{"tipo": "ferramenta", "nome": nome, "entrada": entrada, **({"id": id_} if id_ else {})}]
    return {"blocos": blocos + (extra or []), "stop": "tool_use"}
