"""Baixa (uma vez) os modelos locais do motor no boot do servidor, em segundo plano: o primeiro filme não espera o download
e a saúde (/api/saude -> modelos) mostra cedo se a hospedagem alcança os endereços. Cada modelo confere o próprio sha256.
uso: python -m motor.modelos"""
from __future__ import annotations


def baixar() -> dict:
    from motor import config
    from motor.etapas import falante, pessoa
    cfg = config.carregar()
    return {"pessoa": pessoa._modelo(cfg) is not None, "voz": falante._modelo(cfg) is not None}


if __name__ == "__main__":
    print(baixar())
