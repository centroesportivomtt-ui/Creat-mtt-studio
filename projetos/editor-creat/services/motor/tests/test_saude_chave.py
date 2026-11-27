"""Saúde com diagnóstico da chave: sem chave, 'ausente'; nunca devolve a chave."""
from motor.cerebro.diagnostico import checar_chave


def test_sem_chave_diz_ausente(monkeypatch):
    monkeypatch.delenv("EDITOR_ANTHROPIC_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    assert checar_chave() == {"estado": "ausente"}


def test_autoteste_da_direcao_nao_roda_sem_cerebro_real(monkeypatch, tmp_path):
    from motor import config
    from motor.cerebro.diagnostico import testar_direcao
    monkeypatch.delenv("EDITOR_ANTHROPIC_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("EDITOR_DADOS", str(tmp_path))
    monkeypatch.setenv("EDITOR_CEREBRO", "anthropic")
    r = testar_direcao(config.carregar())
    assert r["estado"] == "cérebro real desligado"
