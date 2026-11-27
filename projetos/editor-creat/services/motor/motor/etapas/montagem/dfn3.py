"""Limpeza de voz por IA: DeepFilterNet3 em ONNX, só com numpy + onnxruntime (sem torch, sem Rust). Item 3 do mapa (21/11).

Por que este: nativo em 48 kHz (a voz não perde o brilho de cima), ~30x mais rápido que o tempo real nesta CPU, o mesmo modelo
que a montagem já previa (o pacote pip `deepfilternet` não instala sem compilar Rust e pede torch de 210 MB). Pesquisa e medida
do Radar em 21/11; escolha e mistura conferidas com o medidor DNSMOS (motor/qualidade_voz.py) em gravação real de evento.

Origem e licença:
- modelo e algoritmo: DeepFilterNet (Hendrik Schröter), MIT ou Apache-2.0, github.com/Rikorose/DeepFilterNet; checkpoint
  DeepFilterNet3 exportado para ONNX pelo próprio autor (models/DeepFilterNet3_onnx.tar.gz do repositório oficial, fixado num
  commit). Até 27/11 vinha de huggingface.co/SayedShaun/DeepFilterNet3-onnx, que saiu do ar (HTTP 401);
- este arquivo é uma adaptação (lida linha a linha, sem rede) do wrapper numpy desse repositório, MIT: STFT, features ERB,
  normalização, máscara ERB e filtro profundo seguem o libDF original.
O pacote (~8 MB) é baixado uma vez para <dados>/modelos/dfn3 e conferidos pelo sha256; sem eles, `disponivel` é False e a
voz segue só com a cadeia leve (como antes).
"""
from __future__ import annotations

import hashlib
import logging
import math
import os
import pathlib
import urllib.request

import numpy as np

log = logging.getLogger(__name__)

PACOTE_URL = ("https://raw.githubusercontent.com/Rikorose/DeepFilterNet/7b14b895fe7fc42cab72b4a4c1e49c982bd6404b/"
              "models/DeepFilterNet3_onnx.tar.gz")
PACOTE_SHA = "c94d91f70911001c946e0fabb4aa9adc37045f45a03b56008cb0c8244cb63616"
ARQUIVOS = {                                                     # conferidos em 27/11/2026 (export oficial)
    "enc.onnx": "7c5399d3da8a50ebef1c1a0ae421b33376aa5e45d0e92df16da7e83c9c131916",
    "erb_dec.onnx": "ab669a1d10afe20911728b33053a452071042317a90581092b325da7b2f9d895",
    "df_dec.onnx": "23114ce3b0f6464b763ee62f7bb8aab6b2a129a21eabd5bcfe59413db05f278a",
}
# config.ini do checkpoint (seção [df] e [deepfilternet]), fixo aqui para não baixar texto de configuração
SR, FFT, HOP, NB_ERB, NB_DF, DF_ORDEM, DF_LOOK, MIN_ERB, CONV_LOOK = 48000, 960, 480, 32, 96, 5, 2, 2, 2
MEAN_NORM_INIT, UNIT_NORM_INIT, ERB_NORM_SCALE = (-60.0, -90.0), (0.001, 0.0001), 40.0
_TENTOU = 0.0
BLOCO_S, CONTEXTO_BLOCO_S = 30.0, 2.0   # peça longa é limpa em blocos (memória), cada um com contexto antes


def _pasta(cfg) -> pathlib.Path | None:
    """Pasta com os 3 ONNX conferidos; baixa uma vez por processo se faltar."""
    global _TENTOU
    env = os.environ.get("EDITOR_DFN3", "").strip()
    if not env and cfg is None:
        from motor import config
        cfg = config.carregar()
    p = pathlib.Path(env) if env else pathlib.Path(cfg.dados) / "modelos" / "dfn3"
    if all((p / n).is_file() for n in ARQUIVOS):
        return p
    import time
    if env or os.environ.get("EDITOR_MODELOS_BAIXAR", "1") != "1" or time.time() - _TENTOU < 600:
        return None                                       # sem rede: tenta de novo daqui a 10 min, não a cada peça
    _TENTOU = time.time()
    try:
        p.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(urllib.request.Request(PACOTE_URL, headers={"User-Agent": "editor-motor/0.1"}), timeout=60) as r:
            pacote = r.read(40_000_000)
        if hashlib.sha256(pacote).hexdigest() != PACOTE_SHA:
            raise OSError("sha256 do pacote do modelo não confere")
        import io
        import tarfile
        with tarfile.open(fileobj=io.BytesIO(pacote), mode="r:gz") as tar:
            membros = {pathlib.PurePosixPath(m.name).name: m for m in tar.getmembers() if m.isfile()}
            for nome, sha in ARQUIVOS.items():
                if (p / nome).is_file() and hashlib.sha256((p / nome).read_bytes()).hexdigest() == sha:
                    continue
                dados = tar.extractfile(membros[nome]).read()
                if hashlib.sha256(dados).hexdigest() != sha:
                    raise OSError(f"sha256 de {nome} não confere")
                tmp = p / f".{nome}.{os.getpid()}.tmp"
                tmp.write_bytes(dados)
                os.replace(tmp, p / nome)
        return p
    except Exception as e:  # noqa: BLE001 - sem rede: segue sem limpeza por IA
        log.warning("limpeza de voz por IA indisponível (%s)", e)
        return None


def _freq2erb(f):
    return 9.265 * np.log1p(f / (24.7 * 9.265))


def _erb2freq(e):
    return 24.7 * 9.265 * (np.exp(e / 9.265) - 1.0)


def larguras_erb(sr=SR, fft=FFT, nb=NB_ERB, minimo=MIN_ERB) -> np.ndarray:
    """Quantos bins da STFT em cada banda ERB (porta do erb_fb do libDF)."""
    nyq, largura = sr // 2, sr / fft
    lo, hi = _freq2erb(0.0), _freq2erb(float(nyq))
    passo = (hi - lo) / nb
    erb = np.zeros(nb, dtype=np.int64)
    ant, sobra = 0, 0
    for i in range(1, nb + 1):
        fb = int(round(_erb2freq(lo + i * passo) / largura))
        n = fb - ant - sobra
        if n < minimo:
            sobra, n = minimo - n, minimo
        else:
            sobra = 0
        erb[i - 1] = n
        ant = fb
    erb[nb - 1] += 1
    excesso = int(erb.sum()) - (fft // 2 + 1)
    if excesso > 0:
        erb[nb - 1] -= excesso
    return erb


class Limpador:
    """enhance(x 48 kHz mono float32) -> voz limpa do mesmo tamanho (alinhada, atraso compensado)."""

    def __init__(self, cfg, threads: int | None = None):
        self.disponivel = False
        p = _pasta(cfg)
        if p is None:
            return
        try:
            import onnxruntime as ort
            op = ort.SessionOptions()
            op.intra_op_num_threads = int(threads or os.environ.get("EDITOR_THREADS", "2") or 2)
            op.log_severity_level = 3
            self._enc, self._erb_dec, self._df_dec = (ort.InferenceSession(str(p / n), sess_options=op, providers=["CPUExecutionProvider"])
                                                      for n in ARQUIVOS)
        except Exception as e:  # noqa: BLE001
            log.warning("limpeza de voz por IA não carregou: %s", e)
            return
        self.alfa = round(math.exp(-(HOP / SR) / 1.0), 2)               # norm_tau = 1 s
        i = np.arange(FFT, dtype=np.float64)
        s = np.sin(0.5 * np.pi * (i + 0.5) / (FFT // 2))
        self.janela = np.sin(0.5 * np.pi * s * s).astype(np.float32)      # janela de Vorbis
        self.larg = larguras_erb()
        inv = np.zeros((NB_ERB, FFT // 2 + 1), dtype=np.float32)
        ini = 0
        for b, w in enumerate(self.larg):
            inv[b, ini:ini + w] = 1.0
            ini += w
        self.erb_inv = inv
        self.disponivel = True

    def _stft(self, x):
        xp = np.concatenate([np.zeros(HOP, np.float32), x.astype(np.float32)])
        n = len(x) // HOP
        idx = np.arange(n)[:, None] * HOP + np.arange(FFT)[None, :]
        return (np.fft.rfft(xp[idx] * self.janela[None, :], axis=1) / (FFT * FFT / (2.0 * HOP))).astype(np.complex64)

    def _istft(self, spec):
        q = np.fft.irfft(spec, n=FFT, axis=1) * FFT * self.janela[None, :]
        out = np.zeros((spec.shape[0] + 1) * HOP, dtype=np.float32)
        for t in range(spec.shape[0]):
            out[t * HOP:t * HOP + FFT] += q[t]
        return out[:spec.shape[0] * HOP]

    def _features(self, spec):
        a = self.alfa
        pot = np.abs(spec) ** 2
        erb = np.zeros((spec.shape[0], NB_ERB), dtype=np.float32)
        ini = 0
        for b, w in enumerate(self.larg):
            erb[:, b] = pot[:, ini:ini + w].mean(axis=1)
            ini += w
        erb_db = 10.0 * np.log10(erb + 1e-10)
        est = np.linspace(*MEAN_NORM_INIT, NB_ERB).astype(np.float32)
        f_erb = np.zeros_like(erb_db)
        for t in range(erb_db.shape[0]):
            est = erb_db[t] * (1 - a) + est * a
            f_erb[t] = (erb_db[t] - est) / ERB_NORM_SCALE
        est = np.linspace(*UNIT_NORM_INIT, NB_DF).astype(np.float32)
        f_spec = np.zeros((spec.shape[0], NB_DF), dtype=np.complex64)
        for t in range(spec.shape[0]):
            v = spec[t, :NB_DF]
            est = np.abs(v) * (1 - a) + est * a
            f_spec[t] = v / np.sqrt(est)
        return f_erb, f_spec

    def _rede(self, f_erb, f_spec):
        L = CONV_LOOK
        erb_in = np.pad(f_erb[L:], ((0, L), (0, 0)))[None, None]
        sf = np.stack([f_spec.real, f_spec.imag], axis=0)
        sf = np.pad(sf[:, L:], ((0, 0), (0, L), (0, 0)))[None]
        e0, e1, e2, e3, emb, c0, _lsnr = self._enc.run(None, {"feat_erb": erb_in.astype(np.float32), "feat_spec": sf.astype(np.float32)})
        (masc,) = self._erb_dec.run(None, {"emb": emb, "e3": e3, "e2": e2, "e1": e1, "e0": e0})
        coefs = self._df_dec.run(None, {"emb": emb, "c0": c0})[0]   # export oficial tem 2 saídas; só os coeficientes importam
        return masc[0, 0], coefs[0]

    def _aplicar(self, spec, masc, coefs):
        sm = spec * (masc @ self.erb_inv)
        c = coefs.reshape(coefs.shape[0], NB_DF, DF_ORDEM, 2)
        c = c[..., 0] + 1j * c[..., 1]
        xp = np.pad(spec[:, :NB_DF], ((DF_ORDEM - 1 - DF_LOOK, DF_LOOK), (0, 0)))
        out = np.zeros((spec.shape[0], NB_DF), dtype=np.complex64)
        for k in range(DF_ORDEM):
            out += xp[k:k + spec.shape[0]] * c[:, :, k]
        sm[:, :NB_DF] = out
        return sm

    def enhance(self, x: np.ndarray) -> np.ndarray:
        """Peça longa (fala de minutos) é limpa em blocos de 30 s, cada um com 2 s de contexto antes, emendados sem costura
        (o contexto é descartado): a memória não cresce com o tamanho da peça."""
        if not self.disponivel:
            return np.asarray(x, np.float32)
        x = np.asarray(x, dtype=np.float32).reshape(-1)
        bloco, ctx = int(BLOCO_S * SR), int(CONTEXTO_BLOCO_S * SR)
        if len(x) <= bloco + ctx:
            return self._enhance(x)
        partes = []
        for ini in range(0, len(x), bloco):
            a = max(0, ini - ctx)
            partes.append(self._enhance(x[a:ini + bloco])[ini - a:])
        return np.concatenate(partes)[:len(x)]

    def _enhance(self, x: np.ndarray) -> np.ndarray:
        n = len(x)
        spec = self._stft(np.concatenate([x, np.zeros(FFT, np.float32)]))
        f_erb, f_spec = self._features(spec)
        masc, coefs = self._rede(f_erb, f_spec)
        out = self._istft(self._aplicar(spec, masc, coefs))
        d = FFT - HOP
        return out[d:n + d].astype(np.float32)
