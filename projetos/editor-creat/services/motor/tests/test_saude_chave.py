"""Saúde com diagnóstico da chave: sem chave, 'ausente'; nunca devolve a chave."""
from motor.cerebro.diagnostico import checar_chave


def test_sem_chave_diz_ausente(monkeypatch):
    monkeypatch.delenv("EDITOR_ANTHROPIC_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert checar_chave() == {"estado": "ausente"}
