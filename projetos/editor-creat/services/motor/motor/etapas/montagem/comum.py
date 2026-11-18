"""Peças comuns da montagem (frente C): ffmpeg/ffprobe, fontes do EDL, interpolação de quadros-chave, hash e gravação atômica.

Tudo aqui é sem estado e sem caminho fixo: os caminhos vêm do EDL (chave no armazenamento ou caminho absoluto) e da Config.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import pathlib
import subprocess
from dataclasses import dataclass

W_PADRAO, H_PADRAO, FPS_PADRAO = 1080, 1920, 30
SR = 48000


def nice_prefixo(cfg=None) -> list[str]:
    n = getattr(cfg, "nice", 5) if cfg is not None else 5
    return ["nice", "-n", str(n)] if n else []


def threads(cfg=None) -> str:
    return str(getattr(cfg, "threads", 2) if cfg is not None else 2)


def ffmpeg(args: list[str], cfg=None, **kw) -> subprocess.CompletedProcess:
    cmd = nice_prefixo(cfg) + ["ffmpeg", "-nostdin", "-hide_banner", "-v", "error", "-y", *args]
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg falhou ({r.returncode}): {' '.join(args[:12])} …\n{r.stderr[-1500:]}")
    return r


def hash_obj(*obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()[:16]


def sha256_arquivo(p: pathlib.Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def gravar_json(p: pathlib.Path, obj) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, p)


# ---------------------------------------------------------------- mídia
@dataclass(frozen=True)
class Meta:
    w: int              # largura EXIBIDA (já com rotação)
    h: int
    fps: float
    start: float
    nb: int
    dur: float
    rotacao: int
    faixa: str          # 'pc' (cheia, iPhone yuvj420p) ou 'tv'
    tem_video: bool
    tem_audio: bool


_META: dict = {}


def meta(arq: pathlib.Path | str) -> Meta:
    arq = str(arq)
    st = os.stat(arq)
    k = (arq, st.st_size, st.st_mtime)
    if k in _META:
        return _META[k]
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                        "stream=codec_type,width,height,r_frame_rate,avg_frame_rate,start_time,nb_frames,pix_fmt,color_range:stream_side_data=rotation:format=duration",
                        "-of", "json", arq], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"ffprobe não leu {arq}: {r.stderr[-300:]}")
    j = json.loads(r.stdout)
    sts = j.get("streams", [])
    v = next((s for s in sts if s.get("codec_type") == "video"), None)
    a = next((s for s in sts if s.get("codec_type") == "audio"), None)
    dur = float(j.get("format", {}).get("duration", 0) or 0)
    if v is None:
        m = Meta(0, 0, 0.0, 0.0, 0, dur, 0, "tv", False, a is not None)
    else:
        rot = 0
        for sd in v.get("side_data_list", []) or []:
            if "rotation" in sd:
                rot = int(round(float(sd["rotation"])))
        num, den = (v.get("r_frame_rate") or "30/1").split("/")
        fps = float(num) / float(den or 1)
        w, h = int(v.get("width", 0)), int(v.get("height", 0))
        if abs(rot) % 180 == 90:
            w, h = h, w
        faixa = "pc" if (v.get("color_range") == "pc" or str(v.get("pix_fmt", "")).startswith("yuvj")) else "tv"
        nb = int(v.get("nb_frames", 0) or 0) or int(round(dur * fps))
        m = Meta(w, h, fps, float(v.get("start_time", 0) or 0), nb, dur, rot, faixa, True, a is not None)
    _META[k] = m
    return m


def ler_audio(arq: pathlib.Path | str, s0: float = 0.0, dur: float | None = None, *, sr: int = SR, canais: int = 1, cfg=None):
    """Decodifica um trecho de áudio para float32 (n,) ou (n, canais). Trecho fora do arquivo vira silêncio."""
    import numpy as np
    pre = max(0.0, -s0)
    s0 = max(0.0, s0)
    args = ["-ss", f"{s0:.4f}"] + (["-t", f"{max(0.01, dur - pre):.4f}"] if dur is not None else []) + ["-i", str(arq), "-vn",
            "-f", "f32le", "-ac", str(canais), "-ar", str(sr), "-"]
    cmd = nice_prefixo(cfg) + ["ffmpeg", "-nostdin", "-v", "error", *args]
    r = subprocess.run(cmd, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg não leu o áudio de {arq}: {r.stderr[-400:]!r}")
    x = np.frombuffer(r.stdout, dtype=np.float32).copy()
    if canais > 1:
        x = x[: len(x) // canais * canais].reshape(-1, canais)
    if pre > 0:
        x = np.concatenate([np.zeros((int(round(pre * sr)),) + x.shape[1:], np.float32), x])
    if dur is not None:
        n = int(round(dur * sr))
        if len(x) < n:
            x = np.concatenate([x, np.zeros((n - len(x),) + x.shape[1:], np.float32)])
        x = x[:n]
    return x


# ---------------------------------------------------------------- fontes do EDL
class Fontes:
    """Resolve o id de fonte do EDL para arquivo local. chave absoluta (fixture) ou chave do armazenamento."""

    def __init__(self, edl: dict, armazenamento=None, dados: pathlib.Path | None = None):
        self.f = edl.get("fontes", {})
        self.arm = armazenamento
        self.dados = pathlib.Path(dados) if dados else None

    def _local(self, chave: str) -> pathlib.Path:
        if chave.startswith("/"):
            return pathlib.Path(chave)
        if self.arm is not None:
            return pathlib.Path(self.arm.caminho_local(chave))
        if self.dados is not None:
            return self.dados / "armazenamento" / chave
        raise FileNotFoundError(f"sem armazenamento para resolver {chave}")

    def video(self, fid: str) -> pathlib.Path:
        if fid not in self.f:
            raise KeyError(f"fonte '{fid}' não está em edl.fontes")
        p = self._local(self.f[fid]["chave"])
        if not p.exists():
            raise FileNotFoundError(f"fonte '{fid}' não encontrada: {p}")
        return p

    def audio(self, fid: str) -> pathlib.Path:
        a = self.f.get(fid, {}).get("audio")
        if a:
            p = self._local(a)
            if p.exists():
                return p
        return self.video(fid)

    def offset(self, fid: str) -> float:
        return float(self.f.get(fid, {}).get("offset", 0) or 0)

    def assinatura(self, fid: str) -> list:
        p = self.video(fid)
        st = p.stat()
        return [str(p), st.st_size, int(st.st_mtime)]

    def arquivo_qualquer(self, chave: str) -> pathlib.Path:
        return self._local(chave)


# ---------------------------------------------------------------- tempo
def interp_kf(kf: list, u: float) -> list[float]:
    """kf: [[u, v1, v2, ...], ...] -> valores com smoothstep entre chaves (V1 shot.interp)."""
    if not kf:
        return []
    if u <= kf[0][0]:
        return list(kf[0][1:])
    for a, b in zip(kf, kf[1:]):
        if u <= b[0]:
            x = (u - a[0]) / max(1e-9, b[0] - a[0])
            x = x * x * (3 - 2 * x)
            return [p + (q - p) * x for p, q in zip(a[1:], b[1:])]
    return list(kf[-1][1:])


def quadro(t: float, fps: float) -> int:
    return int(round(t * fps + 1e-9))


def db(x: float) -> float:
    return 20 * math.log10(max(1e-12, x))


def de_db(d: float) -> float:
    return 10 ** (d / 20)
