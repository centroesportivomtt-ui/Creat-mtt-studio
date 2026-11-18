"""ElevenLabs Scribe (PAGO). Desligado sem ELEVENLABS_API_KEY (config cai no faster-whisper).
Ligar só com autorização do dono. Melhor WER do mercado (pesquisa C) e separa falantes (diarize).

API: POST https://api.elevenlabs.io/v1/speech-to-text (multipart: file, model_id, language_code,
timestamps_granularity=word, diarize=true, tag_audio_events=false). Modelo: EDITOR_SCRIBE_MODELO.
"""
from __future__ import annotations

import json
import math
import os
import pathlib
import subprocess
import tempfile
import urllib.request
import uuid

from motor.provedores.transcricao_fw import segmentar_palavras

URL = "https://api.elevenlabs.io/v1/speech-to-text"


def _multipart(campos: dict, arquivo: pathlib.Path) -> tuple[bytes, str]:
    limite = uuid.uuid4().hex
    partes = []
    for k, v in campos.items():
        partes.append(f'--{limite}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    partes.append(f'--{limite}\r\nContent-Disposition: form-data; name="file"; filename="audio.m4a"\r\nContent-Type: audio/mp4\r\n\r\n'.encode())
    partes.append(arquivo.read_bytes())
    partes.append(f"\r\n--{limite}--\r\n".encode())
    return b"".join(partes), f"multipart/form-data; boundary={limite}"


def converter_resposta(r: dict, idioma: str, modelo: str) -> dict:
    ws = []
    for w in r.get("words", []):
        if w.get("type", "word") != "word" or not str(w.get("text", "")).strip():
            continue
        lp = w.get("logprob")
        conf = math.exp(lp) if isinstance(lp, (int, float)) else 0.9
        fal = w.get("speaker_id")
        ws.append([float(w["start"]), float(w["end"]), str(w["text"]).strip(), round(min(1.0, conf), 2), f"F{fal.split('_')[-1]}" if fal else None])
    return {"provedor": "scribe", "modelo": modelo, "idioma": idioma, "vad": False, "segmentos": segmentar_palavras(ws)}


class Scribe:
    nome = "scribe"

    def __init__(self, cfg):
        self.chave = os.environ.get("ELEVENLABS_API_KEY", "").strip()
        if not self.chave:
            raise RuntimeError("Scribe desligado: falta ELEVENLABS_API_KEY")
        self.modelo = os.environ.get("EDITOR_SCRIBE_MODELO", "scribe_v1").strip()

    def transcrever(self, wav: pathlib.Path, *, idioma: str = "pt", palavras: bool = True, dicas=None, progresso=None) -> dict:
        with tempfile.TemporaryDirectory() as td:
            m4a = pathlib.Path(td) / "a.m4a"   # AAC 64k mono: ~30x menor que o WAV
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav), "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "64k", str(m4a)], check=True)
            corpo, tipo = _multipart({"model_id": self.modelo, "language_code": {"pt": "por"}.get(idioma, idioma),
                                      "timestamps_granularity": "word", "diarize": "true", "tag_audio_events": "false"}, m4a)
        req = urllib.request.Request(URL, data=corpo, method="POST", headers={"xi-api-key": self.chave, "Content-Type": tipo})
        with urllib.request.urlopen(req, timeout=600) as resp:
            r = json.loads(resp.read())
        if progresso:
            progresso(1.0)
        return converter_resposta(r, idioma, self.modelo)
