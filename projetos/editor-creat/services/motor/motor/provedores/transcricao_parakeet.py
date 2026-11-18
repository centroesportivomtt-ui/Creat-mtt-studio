"""Parakeet TDT 0.6B v3 int8 via sherpa-onnx (grátis, ~15x tempo real em CPU). Uso: TRIAGEM rápida.
Em pt-BR informal erra mais que o Whisper (11,6% vs 6,7% WER, pesquisa C), então não é o padrão da legenda.

Requer `pip install sherpa-onnx` e o modelo (encoder/decoder/joiner .int8.onnx + tokens.txt) em EDITOR_PARAKEET_DIR.
Sem VAD: janelas fixas de ~20 s cortadas no ponto mais silencioso dos últimos 5 s (janela longa em int8 omite fala).
O Parakeet não dá confiança por palavra: usamos 0,75 (fica acima do corte de legenda 0,5; é triagem).
"""
from __future__ import annotations

import os
import pathlib
import subprocess

import numpy as np

from motor.provedores.transcricao_fw import segmentar_palavras

CONF_FIXA = 0.75
_REC = {}


class Parakeet:
    nome = "parakeet"

    def __init__(self, cfg):
        self.dir = pathlib.Path(os.environ.get("EDITOR_PARAKEET_DIR", "") or (pathlib.Path(cfg.dados) / "modelos" / "parakeet"))
        self.threads = max(1, int(cfg.threads))
        self.janela = float(os.environ.get("EDITOR_PARAKEET_JANELA", "20"))
        faltam = [n for n in ("encoder.int8.onnx", "decoder.int8.onnx", "joiner.int8.onnx", "tokens.txt") if not (self.dir / n).is_file()]
        if faltam:
            raise RuntimeError(f"Parakeet sem modelo em {self.dir} (faltam {', '.join(faltam)})")
        import sherpa_onnx  # noqa: F401  - falha cedo se o pacote não existe

    def _rec(self):
        k = (str(self.dir), self.threads)
        if k not in _REC:
            import sherpa_onnx
            d = self.dir
            _REC[k] = sherpa_onnx.OfflineRecognizer.from_transducer(
                encoder=str(d / "encoder.int8.onnx"), decoder=str(d / "decoder.int8.onnx"), joiner=str(d / "joiner.int8.onnx"),
                tokens=str(d / "tokens.txt"), num_threads=self.threads, decoding_method="greedy_search",
                model_type="nemo_transducer", provider="cpu")
        return _REC[k]

    def transcrever(self, wav: pathlib.Path, *, idioma: str = "pt", palavras: bool = True, dicas=None, progresso=None) -> dict:
        sr = 16000
        a = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", str(wav), "-f", "f32le", "-ac", "1", "-ar", str(sr), "-"],
                                         capture_output=True, check=True).stdout, dtype=np.float32)
        r = self._rec()
        W, i, ws = int(self.janela * sr), 0, []
        while i < len(a):
            j = min(i + W, len(a))
            if j < len(a):
                lo = max(i, j - 5 * sr)
                fr = int(0.3 * sr)
                e = np.convolve(a[lo:j] ** 2, np.ones(fr) / fr, "valid")
                j = lo + int(np.argmin(e)) + fr // 2
            st = r.create_stream()
            st.accept_waveform(sr, a[i:j])
            r.decode_stream(st)
            res = st.result
            base, fim_janela = i / sr, j / sr
            toks, tss = list(res.tokens), [t + base for t in res.timestamps]
            for k, (tok, t) in enumerate(zip(toks, tss)):
                prox = tss[k + 1] if k + 1 < len(tss) else min(fim_janela, t + 0.4)
                if tok.startswith("▁") or not ws or t - ws[-1][1] > 0.5:
                    ws.append([t, prox, tok.lstrip("▁"), CONF_FIXA])
                else:
                    ws[-1][2] += tok
                    ws[-1][1] = prox
            if progresso:
                progresso(j / len(a))
            i = j
        ws = [w for w in ws if w[2].strip()]
        return {"provedor": "parakeet", "modelo": "parakeet-tdt-0.6b-v3-int8", "idioma": idioma, "vad": False,
                "segmentos": segmentar_palavras(ws)}
