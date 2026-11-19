"""Visão com Gemini (PAGO). Desligado sem GEMINI_API_KEY; ligar só com autorização do dono.
Usa a mesma folha de contato + contexto do claude-leve (imagem inline, resposta JSON por responseSchema).

Caminho (EDITOR_GEMINI_VIA):
- `vertex` (padrão): Vertex AI com chave de API (projeto editor-creat, crédito de teste do Google Cloud).
  Endpoint global https://aiplatform.googleapis.com/v1/publishers/google/models/<modelo>:generateContent.
- `aistudio`: generativelanguage.googleapis.com. No nível grátis o Google usa os dados para treino:
  só com chave paga.
Modelo: EDITOR_GEMINI_MODELO; se o Google responder 404 (modelo trocado de nome), tenta EDITOR_GEMINI_RESERVAS
(lista separada por vírgula) antes de cair na heurística local.
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
        self.via = (os.environ.get("EDITOR_GEMINI_VIA", "vertex").strip() or "vertex").lower()
        if self.via not in ("vertex", "aistudio"):
            raise RuntimeError(f"EDITOR_GEMINI_VIA inválido: {self.via} (use vertex ou aistudio)")
        self.modelo = os.environ.get("EDITOR_GEMINI_MODELO", "gemini-3.5-flash-lite").strip()
        reservas = os.environ.get("EDITOR_GEMINI_RESERVAS", "gemini-3.1-flash-lite,gemini-2.5-flash-lite")
        self.modelos = list(dict.fromkeys([self.modelo] + [m.strip() for m in reservas.split(",") if m.strip()]))

    def url(self, modelo: str) -> str:
        if self.via == "vertex":
            return f"https://aiplatform.googleapis.com/v1/publishers/google/models/{modelo}:generateContent"
        return f"https://generativelanguage.googleapis.com/v1beta/models/{modelo}:generateContent"

    def _chamar(self, corpo: dict) -> dict:
        """Tenta o modelo configurado e as reservas; só 404 (modelo inexistente) passa para o próximo."""
        import urllib.error
        ultimo: Exception | None = None
        for modelo in self.modelos:
            req = urllib.request.Request(self.url(modelo), data=json.dumps(corpo).encode(), method="POST",
                                         headers={"Content-Type": "application/json", "x-goog-api-key": self.chave})
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    d = json.loads(r.read())
                if modelo != self.modelo:
                    log.warning("gemini: %s não existe mais; usando %s (atualize EDITOR_GEMINI_MODELO)", self.modelo, modelo)
                    self.modelo, self.modelos = modelo, [modelo] + [m for m in self.modelos if m != modelo]
                return d
            except urllib.error.HTTPError as e:
                ultimo = e
                if e.code != 404:
                    raise
        raise ultimo or RuntimeError("gemini: nenhum modelo configurado")

    def descrever(self, folha_jpg, tempos, contexto: dict) -> dict | None:
        if folha_jpg is None or not pathlib.Path(folha_jpg).is_file():
            return momentos_heuristicos(contexto)
        try:
            corpo = {
                "systemInstruction": {"parts": [{"text": INSTRUCAO}]},
                "contents": [{"role": "user", "parts": [
                    {"inlineData": {"mimeType": "image/jpeg", "data": base64.standard_b64encode(pathlib.Path(folha_jpg).read_bytes()).decode()}},
                    {"text": contexto_texto(contexto)}]}],
                "generationConfig": {"responseMimeType": "application/json", "responseSchema": _esquema_gemini(ESQUEMA_SAIDA)},
            }
            d = self._chamar(corpo)
            txt = d["candidates"][0]["content"]["parts"][0]["text"]
            return normalizar_saida(json.loads(txt), float(contexto["midia"]["duracao"]), "gemini")
        except Exception as e:  # noqa: BLE001
            log.warning("visão gemini falhou (%s); usando heurística local", e)
            return momentos_heuristicos(contexto)
