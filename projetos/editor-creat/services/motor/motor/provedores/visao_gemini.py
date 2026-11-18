"""Visão com Gemini (PAGO). Desligado sem GEMINI_API_KEY; ligar só com autorização do dono.
Usa a mesma folha de contato + contexto do claude-leve (imagem inline, resposta JSON por responseSchema).
Atenção (pesquisa D): no plano grátis do Gemini o Google usa os dados para treino; só usar chave paga.
Vídeo inteiro pela File API fica para a Fase 2 (proxy 480p), quando o dono autorizar o custo.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import pathlib
import urllib.request

from motor.provedores.visao_claude import ESQUEMA_SAIDA, INSTRUCAO, contexto_texto, normalizar_saida
from motor.provedores.visao_local import momentos_heuristicos

log = logging.getLogger("motor.visao")


def _esquema_gemini(s):
    """OpenAPI subset do Gemini: sem additionalProperties."""
    if isinstance(s, dict):
        return {k: _esquema_gemini(v) for k, v in s.items() if k != "additionalProperties"}
    if isinstance(s, list):
        return [_esquema_gemini(x) for x in s]
    return s


class VisaoGemini:
    nome = "gemini"

    def __init__(self, cfg):
        self.chave = os.environ.get("GEMINI_API_KEY", "").strip()
        if not self.chave:
            raise RuntimeError("Gemini desligado: falta GEMINI_API_KEY")
        self.modelo = os.environ.get("EDITOR_GEMINI_MODELO", "gemini-3.5-flash-lite").strip()

    def descrever(self, folha_jpg, tempos, contexto: dict) -> dict | None:
        if folha_jpg is None or not pathlib.Path(folha_jpg).is_file():
            return momentos_heuristicos(contexto)
        try:
            corpo = {
                "systemInstruction": {"parts": [{"text": INSTRUCAO}]},
                "contents": [{"role": "user", "parts": [
                    {"inline_data": {"mime_type": "image/jpeg", "data": base64.standard_b64encode(pathlib.Path(folha_jpg).read_bytes()).decode()}},
                    {"text": contexto_texto(contexto)}]}],
                "generationConfig": {"responseMimeType": "application/json", "responseSchema": _esquema_gemini(ESQUEMA_SAIDA)},
            }
            req = urllib.request.Request(
                f"https://generativelanguage.googleapis.com/v1beta/models/{self.modelo}:generateContent",
                data=json.dumps(corpo).encode(), method="POST",
                headers={"Content-Type": "application/json", "x-goog-api-key": self.chave})
            with urllib.request.urlopen(req, timeout=120) as r:
                d = json.loads(r.read())
            txt = d["candidates"][0]["content"]["parts"][0]["text"]
            return normalizar_saida(json.loads(txt), float(contexto["midia"]["duracao"]), "gemini")
        except Exception as e:  # noqa: BLE001
            log.warning("visão gemini falhou (%s); usando heurística local", e)
            return momentos_heuristicos(contexto)
