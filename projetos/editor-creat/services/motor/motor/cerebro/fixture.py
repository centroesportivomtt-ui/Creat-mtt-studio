"""Cérebro 'fixture' (padrão, sem custo): devolve direções gravadas, para o fluxo inteiro rodar e ser testado sem API.

Escolha determinística: o primeiro caso de memoria/casos/*/direcao.json cujos ids (F.., M..) existem todos no catálogo
recebido; senão packages/schemas/exemplos/direcao.json, se couber. O uso é ESTIMADO (len/3.5) e o custo é o que a
chamada custaria no Opus 5.5 — o site mostra a estimativa antes de ligar a API.
"""
from __future__ import annotations

import copy
import json
import pathlib
import re

from motor import config
from motor.cerebro import orcamento


def ids_da_direcao(d: dict) -> set[str]:
    ids = set()
    for b in d.get("blocos", []):
        ids |= {f["id"] for f in b.get("falas", [])}
        ids |= {c["m"] for c in b.get("cobertura", [])}
    return ids


class CerebroFixture:
    nome = "fixture"

    def __init__(self, cfg=None):
        self.cfg = cfg or config.carregar()

    def _candidatas(self):
        from motor.memoria.loja import Loja
        raiz = Loja().raiz / "casos"
        for p in sorted(raiz.glob("*/direcao.json")):
            yield p
        yield config.SCHEMAS / "exemplos" / "direcao.json"

    def dirigir(self, *, sistema: str, catalogo_txt: str, pedido_txt: str, esquema: dict, maximo_saida: int = 4000) -> tuple[dict, dict]:
        presentes = set(re.findall(r"^\s*([FM]\d{2,3}\.\d+)\s", catalogo_txt, flags=re.M))
        for p in self._candidatas():
            d = json.loads(pathlib.Path(p).read_text(encoding="utf-8"))
            if ids_da_direcao(d) <= presentes:
                d = copy.deepcopy(d)
                saida = orcamento.tokens_json(d)
                entrada = orcamento.estimar_tokens(sistema + catalogo_txt + pedido_txt)
                return d, orcamento.uso(self.cfg.modelo_direcao, entrada=entrada, saida=saida, estimado=True, cerebro="fixture", caso=str(p.parent.name))
        raise LookupError("nenhuma direção gravada (fixture) bate com os ids deste catálogo; ligue o cérebro anthropic")

    def criticar(self, *, sistema: str, catalogo_txt: str, direcao: dict, pedido_txt: str, esquema: dict, problemas: list[str] | None = None) -> tuple[dict, dict]:
        return copy.deepcopy(direcao), orcamento.uso(self.cfg.modelo_direcao, entrada=0, saida=0, estimado=True, cerebro="fixture", critica="sem mudança")

    def leve(self, *, tarefa: str, texto: str, esquema: dict | None = None) -> tuple[dict | str, dict]:
        u = orcamento.uso(self.cfg.modelo_leve, entrada=orcamento.estimar_tokens(texto), saida=0, estimado=True, cerebro="fixture")
        if tarefa == "reprovacao":
            from motor.memoria.loja import propor_regra
            return propor_regra(texto), u
        if tarefa == "tipo_video":
            t = texto.lower()
            for tipo, chaves in (("anuncio", ("anúncio", "anuncio", "oferta", "promo")), ("daily_vlog", ("vlog", "meu dia", "rotina")),
                                 ("depoimento", ("depoimento",)), ("empresa", ("institucional", "empresa")), ("bastidor", ("bastidor", "backstage")),
                                 ("evento", ("evento", "cobertura"))):
                if any(k in t for k in chaves):
                    return tipo, u
            return "evento", u
        if tarefa == "legenda_post":
            return texto.strip().split("\n")[0][:180] + "\n\n@creat.mtt", u
        return "", u
