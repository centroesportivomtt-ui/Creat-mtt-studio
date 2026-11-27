"""A chave do editor vem de EDITOR_ANTHROPIC_KEY (nome livre nas sessões do Claude Code) e o cliente ignora ANTHROPIC_BASE_URL."""
from motor import config


def test_chave_do_editor_tem_prioridade_e_liga_o_cerebro(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("EDITOR_ANTHROPIC_KEY", raising=False)
    monkeypatch.setenv("EDITOR_CEREBRO", "anthropic")
    assert config.carregar().provedor_efetivo("cerebro") == "fixture"
    monkeypatch.setenv("EDITOR_ANTHROPIC_KEY", "sk-ant-teste")
    assert config.chave_anthropic() == "sk-ant-teste"
    assert config.carregar().provedor_efetivo("cerebro") == "anthropic"


def test_cliente_vai_para_api_anthropic(monkeypatch):
    import pytest
    pytest.importorskip("anthropic")
    monkeypatch.setenv("EDITOR_ANTHROPIC_KEY", "sk-ant-teste")
    monkeypatch.setenv("ANTHROPIC_BASE_URL", "http://proxy-da-sessao.invalido")
    cli = config.cliente_anthropic()
    assert str(cli.base_url).startswith("https://api.anthropic.com")
