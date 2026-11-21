"""Nota de qualidade da voz sem referência: DNSMOS P.835 da Microsoft (ONNX, 1,1 MB), o mesmo medidor do DNS Challenge.

Dá três notas de 1 a 5, como um painel de ouvintes:
- SIG: a VOZ em si (distorção, voz metálica, "robô": é aqui que a limpeza exagerada aparece);
- BAK: o FUNDO (ruído, ar-condicionado, freezer, música de loja);
- OVRL: o conjunto.
Uso no editor: escolher quanto limpar (a limpeza tem de subir BAK sem derrubar SIG: regra do dono "voz natural, sem artefato")
e conferir a voz final no QA.

Licença: CC BY 4.0 (github.com/microsoft/DNS-Challenge, pasta DNSMOS). Crédito: "DNSMOS P.835, Microsoft (Reddy et al., 2022)".
Baixado uma vez para <dados>/modelos e conferido pelo sha256. Sem o modelo, `notas` devolve None (quem chama segue sem nota).
"""
from __future__ import annotations

import hashlib
import logging
import os
import pathlib
import urllib.request

import numpy as np

log = logging.getLogger(__name__)

MODELO_NOME = "dnsmos_sig_bak_ovr.onnx"
MODELO_URL = "https://raw.githubusercontent.com/microsoft/DNS-Challenge/master/DNSMOS/DNSMOS/sig_bak_ovr.onnx"
MODELO_SHA256 = "269fbebdb513aa23cddfbb593542ecc540284a91849ac50516870e1ac78f6edd"   # conferido em 21/11/2026
SR = 16000
JANELA = 9.01            # s: o modelo avalia trechos de 9,01 s (passo de 1 s), como no dnsmos_local.py da Microsoft
_P_SIG = np.poly1d([-0.08397278, 1.22083953, 0.0052439])
_P_BAK = np.poly1d([-0.13166888, 1.60915514, -0.39604546])
_P_OVR = np.poly1d([-0.06766283, 1.11546468, 0.04602535])
_SESSAO = None
_TENTOU = False


def _modelo(cfg) -> pathlib.Path | None:
    global _TENTOU
    env = os.environ.get("EDITOR_DNSMOS", "").strip()
    if env:
        return pathlib.Path(env) if pathlib.Path(env).is_file() else None
    p = pathlib.Path(cfg.dados) / "modelos" / MODELO_NOME
    if p.is_file():
        return p
    if os.environ.get("EDITOR_MODELOS_BAIXAR", "1") != "1" or _TENTOU:
        return None
    _TENTOU = True
    tmp = p.with_suffix(f".{os.getpid()}.tmp")
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(urllib.request.Request(MODELO_URL, headers={"User-Agent": "editor-motor/0.1"}), timeout=20) as r:
            dados = r.read(5_000_000)
        if hashlib.sha256(dados).hexdigest() != MODELO_SHA256:
            raise OSError("sha256 do medidor de voz não confere")
        tmp.write_bytes(dados)
        os.replace(tmp, p)
        return p
    except Exception as e:  # noqa: BLE001 - sem rede: segue sem nota
        log.warning("medidor de voz indisponível (%s)", e)
        tmp.unlink(missing_ok=True)
        return None


def _sessao(cfg):
    global _SESSAO
    if _SESSAO is None:
        m = _modelo(cfg)
        if m is None:
            return None
        import onnxruntime as ort
        op = ort.SessionOptions()
        op.intra_op_num_threads = int(os.environ.get("EDITOR_THREADS", "2") or 2)
        op.log_severity_level = 3
        _SESSAO = ort.InferenceSession(str(m), sess_options=op, providers=["CPUExecutionProvider"])
    return _SESSAO


def reamostrar(x: np.ndarray, sr: int) -> np.ndarray:
    x = x.mean(1) if x.ndim > 1 else x
    if sr == SR:
        return x.astype(np.float32)
    from math import gcd
    from scipy.signal import resample_poly
    g = gcd(sr, SR)
    return resample_poly(x, SR // g, sr // g).astype(np.float32)


def notas(x: np.ndarray, sr: int, cfg=None, sessao=None) -> dict | None:
    """{"sig", "bak", "ovrl"} (1 a 5) da voz em x. Trecho curto é repetido até 9 s (como faz a Microsoft). None sem modelo."""
    s = sessao or (_sessao(cfg) if cfg is not None else None)
    if s is None:
        return None
    a = reamostrar(np.asarray(x, np.float32), sr)
    n = int(JANELA * SR)
    if len(a) < SR * 0.5:
        return None
    while len(a) < n:
        a = np.concatenate([a, a])
    passos = int(np.floor(len(a) / SR - JANELA)) + 1
    res = []
    for i in range(max(1, passos)):
        seg = a[i * SR:i * SR + n]
        if len(seg) < n:
            continue
        sig, bak, ovr = s.run(None, {"input_1": seg[None, :].astype(np.float32)})[0][0]
        res.append((_P_SIG(sig), _P_BAK(bak), _P_OVR(ovr)))
    if not res:
        return None
    m = np.mean(np.array(res), axis=0)
    return {"sig": round(float(m[0]), 2), "bak": round(float(m[1]), 2), "ovrl": round(float(m[2]), 2)}
