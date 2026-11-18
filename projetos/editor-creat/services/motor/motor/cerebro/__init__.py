"""Cérebro (frente B): fixture (sem custo, padrão) e anthropic (Claude via API, só com ANTHROPIC_API_KEY)."""
from __future__ import annotations

import pathlib

PROMPTS = pathlib.Path(__file__).resolve().parent / "prompts"


def prompts_texto(nome: str) -> str:
    return (PROMPTS / f"{nome}.md").read_text(encoding="utf-8")
