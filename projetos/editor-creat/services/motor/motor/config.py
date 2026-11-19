"""Configuração do motor, lida do ambiente (nomes em .env.example). Nada de segredo em código.

Regra: todo provedor pago fica DESLIGADO quando a chave não existe; o motor cai no provedor local.
"""
from __future__ import annotations

import os
import pathlib
from dataclasses import dataclass, field

RAIZ_REPO = pathlib.Path(__file__).resolve().parents[3]          # projetos/editor-creat
SCHEMAS = RAIZ_REPO / "packages" / "schemas"
KIT = RAIZ_REPO / "packages" / "kit"
MEMORIA = RAIZ_REPO / "memoria"


def _env(nome: str, padrao: str = "") -> str:
    return os.environ.get(nome, padrao).strip()


def _tem(nome: str) -> bool:
    if nome == "ANTHROPIC_API_KEY":
        return bool(chave_anthropic())
    return bool(_env(nome))


def chave_anthropic() -> str:
    """Chave da API da Anthropic do EDITOR. Nas sessões do Claude Code o nome ANTHROPIC_API_KEY é reservado (a plataforma não o
    repassa), por isso o editor lê primeiro EDITOR_ANTHROPIC_KEY; no servidor próprio qualquer um dos dois serve."""
    return (os.environ.get("EDITOR_ANTHROPIC_KEY") or os.environ.get("ANTHROPIC_API_KEY") or "").strip()


def cliente_anthropic():
    """Cliente oficial sempre apontado para api.anthropic.com com a chave do editor (ignora ANTHROPIC_BASE_URL do ambiente,
    que dentro do Claude Code aponta para o proxy da própria sessão)."""
    import anthropic
    return anthropic.Anthropic(api_key=chave_anthropic(), base_url=os.environ.get("EDITOR_ANTHROPIC_URL") or "https://api.anthropic.com")


@dataclass(frozen=True)
class Config:
    dados: pathlib.Path = field(default_factory=lambda: pathlib.Path(_env("EDITOR_DADOS", str(RAIZ_REPO / "dados"))))
    armazenamento: str = field(default_factory=lambda: _env("EDITOR_ARMAZENAMENTO", "local"))       # local | r2
    transcricao: str = field(default_factory=lambda: _env("EDITOR_TRANSCRICAO", "faster-whisper"))  # faster-whisper | parakeet | scribe
    whisper_modelo: str = field(default_factory=lambda: _env("EDITOR_WHISPER_MODELO", "small"))
    visao: str = field(default_factory=lambda: _env("EDITOR_VISAO", "local"))                      # local | claude-leve | gemini
    cerebro: str = field(default_factory=lambda: _env("EDITOR_CEREBRO", "fixture"))                # fixture | anthropic | sessao
    modelo_direcao: str = field(default_factory=lambda: _env("EDITOR_MODELO_DIRECAO", "claude-opus-5-5"))
    modelo_leve: str = field(default_factory=lambda: _env("EDITOR_MODELO_LEVE", "claude-haiku-5-5"))
    esforco_direcao: str = field(default_factory=lambda: _env("EDITOR_ESFORCO_DIRECAO", "high"))
    orcamento_entrada: int = field(default_factory=lambda: int(_env("EDITOR_ORCAMENTO_ENTRADA", "15000")))
    orcamento_saida: int = field(default_factory=lambda: int(_env("EDITOR_ORCAMENTO_SAIDA", "4000")))
    render: str = field(default_factory=lambda: _env("EDITOR_RENDER", "cpu"))                      # cpu | modal
    render_workers: int = field(default_factory=lambda: int(_env("EDITOR_RENDER_WORKERS", "3")))
    threads: int = field(default_factory=lambda: int(_env("EDITOR_THREADS", "2")))
    nice: int = field(default_factory=lambda: int(_env("EDITOR_NICE", "5")))
    publicacao: str = field(default_factory=lambda: _env("EDITOR_PUBLICACAO", "nenhuma"))          # nenhuma | metricool | meta
    motor_token: str = field(default_factory=lambda: _env("MOTOR_TOKEN"))
    som: str = field(default_factory=lambda: _env("MK_SOM"))

    @property
    def banco(self) -> pathlib.Path:
        return self.dados / "motor.db"

    def provedor_efetivo(self, tipo: str) -> str:
        """Provedor que vai rodar de fato: o pedido, ou o local quando falta a chave do pago."""
        pedido = getattr(self, tipo)
        chave = {
            ("armazenamento", "r2"): "R2_SECRET_ACCESS_KEY",
            ("transcricao", "scribe"): "ELEVENLABS_API_KEY",
            ("visao", "gemini"): "GEMINI_API_KEY",
            ("visao", "claude-leve"): "ANTHROPIC_API_KEY",
            ("cerebro", "anthropic"): "ANTHROPIC_API_KEY",
            ("render", "modal"): "MODAL_TOKEN_SECRET",
            ("publicacao", "metricool"): "METRICOOL_TOKEN",
            ("publicacao", "meta"): "META_ACCESS_TOKEN",
        }.get((tipo, pedido))
        if chave and not _tem(chave):
            return {"armazenamento": "local", "transcricao": "faster-whisper", "visao": "local",
                    "cerebro": "fixture", "render": "cpu", "publicacao": "nenhuma"}[tipo]
        return pedido


def carregar() -> Config:
    c = Config()
    c.dados.mkdir(parents=True, exist_ok=True)
    return c
