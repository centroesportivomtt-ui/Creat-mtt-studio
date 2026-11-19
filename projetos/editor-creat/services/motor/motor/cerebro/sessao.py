"""Cérebro 'sessao': o diretor é o Claude da sessão de trabalho (Claude Code), sem chave de API e sem custo por chamada.

Uso: EDITOR_CEREBRO=sessao. Na etapa de direção o motor grava o pedido completo do diretor (sistema + catálogo + pedido + contrato)
em <dados>/diretor_sessao/<chave>.pedido.md e para o projeto em "erro" com a mensagem "aguardando o diretor". O Claude da sessão lê,
escreve a direção em <chave>.direcao.json e roda `python -m motor.ferramentas.diretor_sessao responder <projeto>`, que valida contra o
contrato e devolve o job de direção à fila. Na nova rodada a direção é encontrada pela mesma chave e o resto do pipeline segue igual.
Serve enquanto não há ANTHROPIC_API_KEY; a qualidade é a do modelo da sessão (o mesmo diretor, sem limite de raciocínio por chamada).
"""
from __future__ import annotations

import hashlib
import json
import pathlib

from motor import config

ZERO = {"entrada": 0, "cache_leitura": 0, "cache_escrita": 0, "saida": 0, "custo_usd": 0.0}


class AguardandoDiretor(Exception):
    """A direção ainda não foi escrita pelo Claude da sessão."""


def pasta(cfg=None) -> pathlib.Path:
    cfg = cfg or config.carregar()
    d = pathlib.Path(cfg.dados) / "diretor_sessao"
    d.mkdir(parents=True, exist_ok=True)
    return d


def chave(catalogo_txt: str, pedido_txt: str) -> str:
    return hashlib.sha256((catalogo_txt + "\n---\n" + pedido_txt).encode("utf-8")).hexdigest()[:16]


class CerebroSessao:
    nome = "sessao"

    def __init__(self, cfg=None):
        self.cfg = cfg or config.carregar()

    def dirigir(self, *, sistema: str, catalogo_txt: str, pedido_txt: str, esquema: dict, maximo_saida: int = 4000):
        d, k = pasta(self.cfg), chave(catalogo_txt, pedido_txt)
        resp = d / f"{k}.direcao.json"
        if resp.exists():
            return json.loads(resp.read_text(encoding="utf-8")), dict(ZERO, modelo="sessao")
        (d / f"{k}.pedido.md").write_text(
            f"# Pedido ao diretor ({k})\n\n## Sistema\n{sistema}\n\n## Catálogo\n{catalogo_txt}\n\n## Pedido\n{pedido_txt}\n\n"
            f"## Contrato da resposta (JSON Schema)\n```json\n{json.dumps(esquema, ensure_ascii=False)}\n```\n"
            f"\nEscreva a direção em {resp.name} (só o JSON).\n", encoding="utf-8")
        raise AguardandoDiretor(f"aguardando o diretor da sessão: pedido em {d / (k + '.pedido.md')}")

    def criticar(self, *, sistema: str, catalogo_txt: str, direcao: dict, pedido_txt: str, esquema: dict, problemas=None, **_):
        return direcao, dict(ZERO, modelo="sessao")      # a sessão já revisa antes de responder
