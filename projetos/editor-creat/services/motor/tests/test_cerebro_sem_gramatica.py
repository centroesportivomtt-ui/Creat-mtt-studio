"""Quando a API recusa o contrato por ser grande demais para o modo estrito, o cérebro manda o contrato no texto e valida local."""
import json

import pytest

pytest.importorskip("anthropic")
from motor.cerebro import anthropic_api as A  # noqa: E402


def test_json_do_texto_limpa_cercas():
    assert json.loads(A._json_do_texto("```json\n{\"a\": 1}\n```")) == {"a": 1}
    assert json.loads(A._json_do_texto("Aqui está: {\"a\": {\"b\": 2}} fim")) == {"a": {"b": 2}}


def test_cai_para_texto_quando_gramatica_e_grande(monkeypatch):
    import anthropic
    c = A.CerebroAnthropic.__new__(A.CerebroAnthropic)
    c._anthropic = anthropic
    A.CerebroAnthropic._sem_gramatica = False
    chamadas = []

    def falsa(self, modelo, esforco, corpo, esquema, max_tokens, *, estrito):
        chamadas.append(estrito)
        if estrito:
            req = anthropic._models.FinalRequestOptions.construct(method="post", url="/v1/messages") if hasattr(anthropic, "_models") else None
            try:
                import httpx
            except ModuleNotFoundError:      # versões novas do SDK usam httpx2
                import httpx2 as httpx
            resp = httpx.Response(400, request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"))
            raise anthropic.BadRequestError("The compiled grammar is too large", response=resp, body=None)
        return "{}", {}

    monkeypatch.setattr(A.CerebroAnthropic, "_chamar_uma", falsa)
    c._chamar("m", "high", {"messages": [{"role": "user", "content": []}]}, {"type": "object"}, 10)
    c._chamar("m", "high", {"messages": [{"role": "user", "content": []}]}, {"type": "object"}, 10)
    assert chamadas == [True, False, False]          # depois da 1ª recusa, nem tenta o modo estrito de novo
    A.CerebroAnthropic._sem_gramatica = False


def test_conserta_ate_passar_no_contrato(monkeypatch):
    import anthropic
    c = A.CerebroAnthropic.__new__(A.CerebroAnthropic)
    c._anthropic = anthropic
    esquema = {"type": "object", "required": ["id"], "properties": {"id": {"type": "string", "pattern": "^B[0-9]$"}}}
    respostas = iter(['{"id": "B1"}'])
    pedidos = []

    def falsa(self, modelo, esforco, corpo, esq, max_tokens, *, estrito):
        pedidos.append(corpo["messages"][-1]["content"][0]["text"])
        return next(respostas), {"custo_usd": 0.01, "entrada": 10, "saida": 5}

    monkeypatch.setattr(A.CerebroAnthropic, "_chamar_uma", falsa)
    obj, uso = c._conserta("m", "high", {"messages": [{"role": "user", "content": [{"type": "text", "text": "x"}]}]}, esquema,
                           '{"id": "b1"}', {"custo_usd": 0.02, "entrada": 20, "saida": 9})
    assert obj == {"id": "B1"} and uso["correcoes"] == 1 and abs(uso["custo_usd"] - 0.03) < 1e-9
    assert "id" in pedidos[0] and "does not match" in pedidos[0]
