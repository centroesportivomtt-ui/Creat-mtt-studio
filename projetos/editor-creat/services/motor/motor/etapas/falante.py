"""FALANTE: de quem é a voz de cada trecho (assinatura de voz local, grátis, CPU).

- fbank(): 80 faixas mel no padrão Kaldi (25 ms / 10 ms, janela povey, pré-ênfase 0,97), com média removida;
- Assinador: modelo CAM++ do WeSpeaker (ONNX, 29 MB, treinado no VoxCeleb), baixado uma vez para `<dados>/modelos`
  (ou EDITOR_FALANTE=<arquivo>). Devolve um vetor de 512 números por trecho; vozes iguais ficam com cosseno alto;
- agrupar(): junta os trechos por voz (aglomerativo, ligação média pelo cosseno) e diz qual é a voz principal
  (a de mais tempo de fala).
Sem o modelo (sem rede e sem arquivo), `Assinador.disponivel` é False e quem chama decide o que fazer (o QA não passa calado).
"""
from __future__ import annotations

import logging
import os
import pathlib
import urllib.request

import numpy as np

log = logging.getLogger("motor.falante")

MODELO_URL = "https://huggingface.co/csukuangfj/speaker-embedding-models/resolve/main/wespeaker_en_voxceleb_CAM++.onnx"
MODELO_NOME = "wespeaker_voxceleb_campp.onnx"
MODELO_SHA256 = "7acd352a0372de23ce49379b02864833b7f3f501b4ea25248fc977389f08e5fc"   # conferido em 19/11/2026
SR = 16000
LIMIAR = 0.42            # cosseno mínimo para "mesma voz" (medido com vozes de teste; material real pode pedir ajuste)
MIN_S = 0.8              # trecho menor que isso não dá assinatura confiável


def _modelo(cfg) -> pathlib.Path | None:
    env = os.environ.get("EDITOR_FALANTE", "").strip()
    if env:
        return pathlib.Path(env) if pathlib.Path(env).is_file() else None
    p = pathlib.Path(cfg.dados) / "modelos" / MODELO_NOME
    if p.is_file():
        return p
    if os.environ.get("EDITOR_MODELOS_BAIXAR", "1") != "1":
        return None
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(f".{os.getpid()}.tmp")
        with urllib.request.urlopen(urllib.request.Request(MODELO_URL, headers={"User-Agent": "editor-motor/0.1"}), timeout=120) as r, open(tmp, "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                f.write(b)
                if f.tell() > 80_000_000:
                    raise OSError("modelo maior que o esperado")
        import hashlib
        h = hashlib.sha256()
        with open(tmp, "rb") as f:
            for bloco in iter(lambda: f.read(1 << 20), b""):
                h.update(bloco)
        if h.hexdigest() != MODELO_SHA256:                  # arquivo de terceiros: só carrega o que foi conferido
            raise OSError("sha256 do modelo não confere")
        os.replace(tmp, p)
        return p
    except Exception as e:  # noqa: BLE001 - sem rede: segue sem assinatura de voz
        log.warning("modelo de falante indisponível (%s)", e)
        try:
            tmp.unlink(missing_ok=True)
        except (OSError, NameError):
            pass
        return None


_MEL: dict = {}


def _banco_mel(n_fft: int = 512, n_mel: int = 80, f0: float = 20.0, f1: float = 8000.0) -> np.ndarray:
    if (n_fft, n_mel) not in _MEL:
        mel = lambda f: 1127.0 * np.log(1.0 + f / 700.0)       # noqa: E731
        pts = np.linspace(mel(f0), mel(f1), n_mel + 2)
        fft_mel = mel(np.arange(n_fft // 2 + 1) * SR / n_fft)
        banco = np.zeros((n_mel, n_fft // 2 + 1), np.float32)
        for m in range(n_mel):
            a, b, c = pts[m], pts[m + 1], pts[m + 2]
            sobe, desce = (fft_mel - a) / (b - a), (c - fft_mel) / (c - b)
            banco[m] = np.clip(np.minimum(sobe, desce), 0, None)
        _MEL[(n_fft, n_mel)] = banco
    return _MEL[(n_fft, n_mel)]


def fbank(x: np.ndarray) -> np.ndarray:
    """x mono float (-1..1) a 16 kHz -> [quadros, 80] log-mel no padrão Kaldi, com a média do trecho removida."""
    x = np.asarray(x, np.float32).reshape(-1) * 32768.0
    N, H = 400, 160
    if len(x) < N:
        return np.zeros((0, 80), np.float32)
    n = 1 + (len(x) - N) // H
    idx = np.arange(N)[None, :] + H * np.arange(n)[:, None]
    q = x[idx]
    q = q - q.mean(axis=1, keepdims=True)
    q = np.concatenate([q[:, :1] * (1 - 0.97), q[:, 1:] - 0.97 * q[:, :-1]], axis=1)
    jan = (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(N) / (N - 1))) ** 0.85
    pot = np.abs(np.fft.rfft(q * jan, 512, axis=1)) ** 2
    f = np.log(np.maximum(pot @ _banco_mel().T, 1.1920929e-07)).astype(np.float32)
    return f - f.mean(axis=0, keepdims=True)


def reamostrar(x: np.ndarray, sr: int) -> np.ndarray:
    if sr == SR:
        return np.asarray(x, np.float32)
    from scipy.signal import resample_poly
    from math import gcd
    g = gcd(int(sr), SR)
    return resample_poly(np.asarray(x, np.float32), SR // g, int(sr) // g).astype(np.float32)


class Assinador:
    def __init__(self, cfg):
        self.sessao = None
        m = _modelo(cfg)
        if m is None:
            return
        try:
            import onnxruntime as ort
            op = ort.SessionOptions()
            op.intra_op_num_threads = int(os.environ.get("EDITOR_THREADS", "2") or 2)
            op.log_severity_level = 3
            self.sessao = ort.InferenceSession(str(m), sess_options=op, providers=["CPUExecutionProvider"])
        except Exception as e:  # noqa: BLE001
            log.warning("modelo de falante não carregou: %s", e)

    @property
    def disponivel(self) -> bool:
        return self.sessao is not None

    def assinar(self, x: np.ndarray, sr: int, minimo: float = MIN_S) -> np.ndarray | None:
        """Vetor de voz normalizado, ou None se o trecho for curto demais ou não houver modelo."""
        if self.sessao is None or len(x) < minimo * sr:
            return None
        f = fbank(reamostrar(x, sr))
        if len(f) < 30:
            return None
        e = self.sessao.run(None, {"feats": f[None]})[0][0].astype(np.float64)
        n = float(np.linalg.norm(e))
        return (e / n).astype(np.float32) if n > 0 else None


def agrupar(assinaturas: list, duracoes: list[float], limiar: float = LIMIAR) -> dict:
    """Junta por voz. assinaturas[i] pode ser None (trecho curto): fica no grupo -1.
    Devolve {grupos: [g por trecho], principal: g, tempo: {g: s}, proximidade: [cosseno com a voz principal ou None]}."""
    ids = [i for i, a in enumerate(assinaturas) if a is not None]
    grupos = [-1] * len(assinaturas)
    if not ids:
        return {"grupos": grupos, "principal": None, "tempo": {}, "proximidade": [None] * len(assinaturas)}
    E = np.stack([assinaturas[i] for i in ids]).astype(np.float64)
    S = E @ E.T
    membros = [[k] for k in range(len(ids))]
    while len(membros) > 1:
        melhor, par = -2.0, None
        for a in range(len(membros)):
            for b in range(a + 1, len(membros)):
                s = float(np.mean([S[i, j] for i in membros[a] for j in membros[b]]))
                if s > melhor:
                    melhor, par = s, (a, b)
        if melhor < limiar:
            break
        a, b = par
        membros[a] += membros[b]
        del membros[b]
    tempo = {}
    for g, ms in enumerate(membros):
        for k in ms:
            grupos[ids[k]] = g
        tempo[g] = round(float(sum(duracoes[ids[k]] for k in ms)), 2)
    principal = max(tempo, key=tempo.get)
    centro = E[membros[principal]].mean(axis=0)
    centro /= max(1e-9, float(np.linalg.norm(centro)))
    prox = [None] * len(assinaturas)
    for k, i in enumerate(ids):
        prox[i] = round(float(E[k] @ centro), 3)
    return {"grupos": grupos, "principal": principal, "tempo": tempo, "proximidade": prox}


def tom_hz(x: np.ndarray, sr: int) -> float | None:
    """Altura da voz (F0 mediano, 60 a 400 Hz) por autocorrelação nos quadros sonoros. None se não houver voz clara.
    Segunda pista para trechos curtos, em que a assinatura sozinha engana."""
    x = reamostrar(np.asarray(x, np.float32).reshape(-1), sr)
    N, H = 640, 160                                         # 40 ms / 10 ms
    if len(x) < N:
        return None
    n = 1 + (len(x) - N) // H
    q = x[np.arange(N)[None, :] + H * np.arange(n)[:, None]].astype(np.float64)
    q = q - q.mean(axis=1, keepdims=True)
    en = (q * q).sum(axis=1)
    if en.max() <= 0:
        return None
    S = np.fft.rfft(q * np.hanning(N), 2048, axis=1)
    ac = np.fft.irfft(np.abs(S) ** 2, axis=1)[:, : N]
    ac = ac / np.maximum(ac[:, :1], 1e-12)
    a, b = SR // 400, SR // 60
    k = ac[:, a:b].argmax(axis=1) + a
    forca = ac[np.arange(n), k]
    # erro de oitava: se na metade do atraso o pico é quase tão forte, a altura verdadeira é a de cima
    meio = np.clip(np.round(k / 2).astype(int), a, b - 1)
    viz = np.stack([ac[np.arange(n), np.clip(meio + d, a, b - 1)] for d in (-1, 0, 1)]).max(axis=0)
    sobe = (k // 2 >= a) & (viz >= 0.85 * forca)
    k = np.where(sobe, meio, k)
    forca = np.where(sobe, viz, forca)
    ok = (forca > 0.45) & (en > 0.05 * en.max())
    if ok.sum() < 5:
        return None
    return round(float(np.median(SR / k[ok])), 1)
