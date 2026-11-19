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
            import httpx
            resp = httpx.Response(400, request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"))
            raise anthropic.BadRequestError("The compiled grammar is too large", response=resp, body=None)
        return "{}", {}

    monkeypatch.setattr(A.CerebroAnthropic, "_chamar_uma", falsa)
    c._chamar("m", "high", {"messages": [{"role": "user", "content": []}]}, {"type": "object"}, 10)
    c._chamar("m", "high", {"messages": [{"role": "user", "content": []}]}, {"type": "object"}, 10)
    assert chamadas == [True, False, False]          # depois da 1ª recusa, nem tenta o modo estrito de novo
    A.CerebroAnthropic._sem_gramatica = False
