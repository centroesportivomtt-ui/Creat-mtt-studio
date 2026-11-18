"""Falante em modo FIXTURE (testes, determinístico, sem perfil e sem modelo) e DESLIGADO.

FalanteFixture, em ordem:
1. EDITOR_FALANTE_FIXTURE aponta para um JSON {"trecho do nome do arquivo": "marcos", ...}: todo segmento de um
   arquivo cujo nome contém a chave recebe o rótulo (o nome vem em contexto["arquivo"]);
2. senão, pelo f0 mediano do trecho (tons sintéticos): < 120 Hz marcos · 120-165 ruan · 165-215 xande · > 215 outro;
   trecho curto, silêncio ou tom contínuo -> desconhecido (mesmo detector de voz do provedor `voz`).
FalanteNenhum (EDITOR_FALANTE=desligado): não rotula; a análise sai como antes (campos ausentes).
"""
from __future__ import annotations

import hashlib
import json
import os
import pathlib

from motor.provedores.falante_voz import impressao, ler_trecho

FAIXAS_F0 = [(120.0, "marcos"), (165.0, "ruan"), (215.0, "xande"), (1e9, "outro")]
VALIDOS = {"marcos", "ruan", "xande", "outro", "desconhecido"}


class FalanteNenhum:
    nome = "desligado"
    ativo = False

    def __init__(self, cfg=None):
        pass

    def assinatura(self) -> str:
        return "-"

    def rotular(self, wav, segmentos, contexto=None):
        return [None] * len(segmentos)


class FalanteFixture:
    nome = "fixture"
    ativo = True

    def __init__(self, cfg=None):
        self.mapa: dict[str, str] = {}
        caminho = os.environ.get("EDITOR_FALANTE_FIXTURE", "").strip()
        if caminho and pathlib.Path(caminho).is_file():
            bruto = json.loads(pathlib.Path(caminho).read_text(encoding="utf-8"))
            self.mapa = {str(k): str(v).lower() for k, v in bruto.items() if str(v).lower() in VALIDOS}

    def assinatura(self) -> str:
        return "fixture-1-" + hashlib.sha256(json.dumps(self.mapa, sort_keys=True).encode()).hexdigest()[:8]

    def rotular(self, wav, segmentos, contexto=None):
        nome = str((contexto or {}).get("arquivo") or "")
        fixo = next((v for k, v in sorted(self.mapa.items()) if k and k in nome), None)
        out = []
        for s in segmentos:
            if fixo:
                out.append({"falante": fixo, "falante_confianca": 1.0, "falante_metodo": "fixture"})
                continue
            imp = impressao(ler_trecho(wav, float(s["s"]), float(s["e"]))) if wav is not None else {"voz": False}
            if not imp["voz"]:
                out.append({"falante": "desconhecido", "falante_confianca": 0.0, "falante_metodo": "fixture"})
                continue
            rot = next(r for lim, r in FAIXAS_F0 if imp["f0"] < lim)
            out.append({"falante": rot, "falante_confianca": 0.9, "falante_metodo": "fixture"})
        return out
