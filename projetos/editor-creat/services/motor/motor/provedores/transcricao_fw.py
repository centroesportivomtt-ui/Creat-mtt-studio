"""Transcrição local com faster-whisper (padrão). SEM VAD: o VAD Silero derrubou 5 de 6 falas gritadas ou
sobre música no material de 17/11 (pesquisa C). Para conter a alucinação típica do Whisper sem VAD:
- condition_on_previous_text=False (corta laços de repetição) e só temperatura 0 (o fallback dobrava o tempo em música);
- sem hotwords por padrão (em tom/música elas viram laço "marcos marcos marcos");
- os limiares nativos de no_speech/logprob/compressão continuam ligados;
- a etapa de análise ainda descarta segmentos sobre silêncio (energia) e frases-fantasma conhecidas.

Modelo: EDITOR_WHISPER_MODELO (small | medium | turbo | caminho), int8 em CPU, EDITOR_THREADS threads.
O modelo fica carregado no processo (worker) entre um arquivo e outro.
"""
from __future__ import annotations

import math
import os
import pathlib
import threading
import time

_MODELOS: dict = {}
_TRAVA = threading.Lock()

# Frases que o Whisper inventa em silêncio/música (pt). Comparação sem acento/pontuação.
FANTASMAS = (
    "legendas pela comunidade amara org", "legenda adriana zanotto", "obrigado por assistir",
    "inscreva se no canal", "se inscreva no canal", "legendado por", "transcricao e legendas",
    "e ai pessoal tudo bem", "tchau tchau",
)


def normalizar(txt: str) -> str:
    import unicodedata
    t = unicodedata.normalize("NFKD", txt.lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return " ".join("".join(c if c.isalnum() else " " for c in t).split())


def eh_fantasma(txt: str) -> bool:
    n = normalizar(txt)
    return bool(n) and any(f in n for f in FANTASMAS) and len(n.split()) <= 10


def segmentar_palavras(palavras: list[list], pausa: float = 0.8, max_s: float = 12.0) -> list[dict]:
    """[[s, e, texto, conf, (falante)]...] -> segmentos do schema (quebra em pausa longa, pontuação final ou 12 s)."""
    segs, atual = [], []

    def fecha():
        if not atual:
            return
        fal = atual[0][4] if len(atual[0]) > 4 else None
        confs = [w[3] for w in atual if w[3] is not None]
        segs.append({"s": round(atual[0][0], 2), "e": round(atual[-1][1], 2),
                     "texto": " ".join(w[2] for w in atual).strip(), "falante": fal,
                     "conf": round(sum(confs) / len(confs), 2) if confs else None,
                     "palavras": [[round(w[0], 2), round(w[1], 2), w[2], round(w[3] if w[3] is not None else 0.0, 2)] for w in atual]})
        atual.clear()

    for w in palavras:
        if atual and (w[0] - atual[-1][1] > pausa or w[1] - atual[0][0] > max_s
                      or (len(w) > 4 and len(atual[-1]) > 4 and w[4] != atual[-1][4])):
            fecha()
        atual.append(w)
        if w[2][-1:] in ".?!":
            fecha()
    fecha()
    return segs


def ler_16k(wav: pathlib.Path):
    import subprocess

    import numpy as np
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", str(wav), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], capture_output=True, check=True)
    return np.frombuffer(r.stdout, dtype=np.float32)


class FasterWhisper:
    nome = "faster-whisper"

    def __init__(self, cfg):
        self.modelo = cfg.whisper_modelo
        self.threads = max(1, int(cfg.threads))
        self.beam = int(os.environ.get("EDITOR_WHISPER_BEAM", "1") or 1)
        # só temperatura 0: o fallback (0,2; 0,4...) dobra o tempo em música/tom e só produz lixo filtrado depois
        self.temperaturas = [float(x) for x in (os.environ.get("EDITOR_WHISPER_TEMPERATURAS", "0") or "0").split(",")]

    def _carregar(self):
        chave = (self.modelo, self.threads)
        with _TRAVA:
            if chave not in _MODELOS:
                from faster_whisper import WhisperModel   # import pesado: só quando vai transcrever
                _MODELOS[chave] = WhisperModel(self.modelo, device="cpu", compute_type="int8", cpu_threads=self.threads)
            return _MODELOS[chave]

    def transcrever(self, wav: pathlib.Path, *, idioma: str = "pt", palavras: bool = True, dicas: list[str] | None = None,
                    progresso=None) -> dict:
        m = self._carregar()
        audio = ler_16k(wav)   # PyAV desta máquina é incompatível com o decode_audio do faster-whisper: ffmpeg direto
        segs, info = m.transcribe(
            audio, language=idioma, task="transcribe", beam_size=self.beam, word_timestamps=palavras,
            vad_filter=False, condition_on_previous_text=False, temperature=self.temperaturas,
            # hotwords/initial_prompt induzem laço de alucinação em música/tom ("marcos marcos marcos", medido em 18/11):
            # desligados por padrão; nomes próprios são corrigidos na direção (`corrigir`).
            hotwords=" ".join(dicas) if dicas and os.environ.get("EDITOR_WHISPER_DICAS") == "1" else None,
        )
        out, ultimo = [], 0.0
        dur = float(info.duration or 0) or 1.0
        for s in segs:
            txt = (s.text or "").strip()
            if not txt:
                continue
            ws = [[round(w.start, 2), round(w.end, 2), w.word.strip(), round(float(w.probability), 2)]
                  for w in (s.words or []) if w.word.strip()]
            out.append({"s": round(s.start, 2), "e": round(s.end, 2), "texto": txt, "falante": None,
                        "conf": round(math.exp(s.avg_logprob), 2) if s.avg_logprob is not None else None,
                        "palavras": ws})
            if progresso and time.time() - ultimo > 5:
                ultimo = time.time()
                progresso(min(1.0, s.end / dur))
        return {"provedor": "faster-whisper", "modelo": str(self.modelo), "idioma": idioma, "vad": False, "segmentos": out}
