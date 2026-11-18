"""Fábrica de provedores. Cada frente implementa os seus módulos; aqui só se escolhe pelo nome efetivo."""
from __future__ import annotations

import importlib

# tipo -> nome efetivo -> "modulo:Classe"
MAPA = {
    "armazenamento": {"local": "motor.provedores.armazenamento_local:ArmazenamentoLocal",
                      "r2": "motor.provedores.armazenamento_r2:ArmazenamentoR2"},
    "transcricao": {"faster-whisper": "motor.provedores.transcricao_fw:FasterWhisper",
                    "parakeet": "motor.provedores.transcricao_parakeet:Parakeet",
                    "scribe": "motor.provedores.transcricao_scribe:Scribe"},
    "visao": {"local": "motor.provedores.visao_local:VisaoLocal",
              "claude-leve": "motor.provedores.visao_claude:VisaoClaude",
              "gemini": "motor.provedores.visao_gemini:VisaoGemini"},
    "cerebro": {"fixture": "motor.cerebro.fixture:CerebroFixture",
                "anthropic": "motor.cerebro.anthropic_api:CerebroAnthropic"},
    "render": {"cpu": "motor.provedores.render_cpu:RenderCPU",
               "modal": "motor.provedores.render_modal:RenderModal"},
    "publicacao": {"nenhuma": "motor.provedores.publicacao:Nenhuma",
                   "metricool": "motor.provedores.publicacao:Metricool",
                   "meta": "motor.provedores.publicacao:Meta"},
}


def provedor(tipo: str, cfg):
    nome = cfg.provedor_efetivo(tipo)
    mod, cls = MAPA[tipo][nome].split(":")
    return getattr(importlib.import_module(mod), cls)(cfg)


def armazenamento_de(cfg):
    """Armazenamento ainda não implementado (frente A em andamento) -> None; etapas que precisam dele falham com aviso."""
    try:
        return provedor("armazenamento", cfg)
    except ModuleNotFoundError:
        return None
