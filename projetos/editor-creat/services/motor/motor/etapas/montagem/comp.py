"""COMP: junta os planos, aplica os FX, põe o overlay do kit por cima e codifica o vídeo final COM o áudio numa passada só
(V2/py/comp.py + pesquisa B: PNG direto no overlay + x264 veryfast, sem intermediário).

Saída: H.264 high yuv420p bt709 (faixa tv), grão leve (evita banding), AAC 48 kHz 256k, faststart — o formato que o QA confere.
"""
from __future__ import annotations

import os
import pathlib
import subprocess
import time

import numpy as np

from motor.etapas.montagem import fx as FX
from motor.etapas.montagem.comum import quadro


def _cv2():
    import cv2
    cv2.setNumThreads(2)
    return cv2


def leitor(arq: str, W: int, H: int, pular_s: float = 0.0):
    cmd = ["ffmpeg", "-nostdin", "-v", "error", "-threads", "2"]
    if pular_s > 0:
        cmd += ["-ss", f"{pular_s:.4f}"]
    cmd += ["-i", arq, "-vf", "scale=in_color_matrix=bt709:in_range=tv,format=bgr24", "-f", "rawvideo", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=W * H * 3 * 2)
    try:
        while True:
            b = p.stdout.read(W * H * 3)
            if len(b) < W * H * 3:
                break
            yield np.frombuffer(b, np.uint8).reshape(H, W, 3)
    finally:
        p.stdout.close()
        p.kill()
        p.wait()


class Overlay:
    """Lê os PNG do kit uma vez por arquivo (quadros repetidos são links físicos: mesmo inode = mesmo cache)."""

    def __init__(self, d: str | None):
        self.d = d
        self.cache: dict = {}

    def pegar(self, n: int):
        if not self.d:
            return None
        p = os.path.join(self.d, f"quadro_{n:05d}.png")
        try:
            ino = os.stat(p).st_ino
        except FileNotFoundError:
            return None
        if ino in self.cache:
            return self.cache[ino]
        cv2 = _cv2()
        o = cv2.imread(p, cv2.IMREAD_UNCHANGED)
        val = None
        if o is not None:
            if o.ndim == 3 and o.shape[2] == 4:
                a = o[:, :, 3]
                ys = np.where(a.any(1))[0]
                if len(ys):
                    y0, y1 = int(ys[0]), int(ys[-1]) + 1
                    val = ("rgba", y0, y1, o[y0:y1, :, :3].astype(np.uint16), a[y0:y1, :, None].astype(np.uint16))
            else:
                val = ("opaco", o[:, :, :3] if o.ndim == 3 else cv2.cvtColor(o, cv2.COLOR_GRAY2BGR))
        if len(self.cache) > 64:
            self.cache.clear()
        self.cache[ino] = val
        return val

    @staticmethod
    def aplicar(base: np.ndarray, val) -> np.ndarray:
        if val is None:
            return base
        if val[0] == "opaco":
            return val[1].copy()
        _, y0, y1, rgb, al = val
        base[y0:y1] = ((base[y0:y1].astype(np.uint16) * (255 - al) + rgb * al + 127) // 255).astype(np.uint8)
        return base


def compor(edl: dict, planos_res: dict, dir_overlay: str | None, mix_wav: str | None, saida: pathlib.Path, *,
           janela: tuple[float, float] | None = None, crf: int | None = None, threads: int = 3, nice: int = 5, progresso=None) -> dict:
    fmt = edl.get("formato", {})
    W, H, FPS = int(fmt.get("w", 1080)), int(fmt.get("h", 1920)), float(fmt.get("fps", 30))
    NF = quadro(edl["duracao"], FPS)
    fa, fb = (quadro(janela[0], FPS), min(NF, quadro(janela[1], FPS))) if janela else (0, NF)
    crf = int(crf if crf is not None else (edl.get("master") or {}).get("crf", 17))
    planos = sorted(edl["planos"], key=lambda p: p["t0"])
    efeitos = FX.preparar(list(edl.get("fx", []) or []), planos)
    saltos = [e for e in efeitos if e["tipo"] == "salto"]
    um_cache: dict = {}

    def um_quadro(i: int, ultimo: bool):
        """Primeiro (ou último) quadro do plano i, lido sob demanda e guardado: o salto mostra o vizinho na emenda."""
        if not 0 <= i < len(planos):
            return None
        if (i, ultimo) not in um_cache:
            pl = planos[i]
            arq = planos_res.get(pl["id"], {}).get("arquivo")
            fr = None
            if arq and os.path.exists(arq):
                n = quadro(pl["t1"], FPS) - quadro(pl["t0"], FPS)
                rd = leitor(arq, W, H, max(0, n - 3) / FPS if ultimo else 0.0)
                for q in rd:
                    fr = q
                    if not ultimo:
                        break
                rd.close()
            um_cache[(i, ultimo)] = fr
        return um_cache[(i, ultimo)]

    def vizinhos(tt: float, i: int, anterior):
        """Só quando um salto está no ar: o anterior é o último quadro já visto (ou lido do plano i-1); o seguinte, o 1o de i+1."""
        if not saltos or not FX.ativos(saltos, tt):
            return None
        return {"anterior": (lambda: anterior) if anterior is not None else (lambda: um_quadro(i - 1, True)),
                "seguinte": lambda: um_quadro(i + 1, False)}
    saida.parent.mkdir(parents=True, exist_ok=True)
    tmp = saida.with_name(saida.stem + ".tmp.mp4")
    cmd = (["nice", "-n", str(nice)] if nice else []) + ["ffmpeg", "-nostdin", "-v", "error", "-y",
           "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-"]
    if mix_wav:
        cmd += ["-ss", f"{fa / FPS:.4f}", "-i", mix_wav, "-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "256k", "-ar", "48000"]
    cmd += ["-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p,noise=c0s=2:c0f=t+u", "-c:v", "libx264",
            "-preset", "veryfast", "-crf", str(crf), "-profile:v", "high", "-x264-params", "aq-mode=3", "-threads", str(threads),
            "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
            "-t", f"{(fb - fa) / FPS:.4f}", "-movflags", "+faststart", str(tmp)]
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    ov = Overlay(dir_overlay)
    preto = np.zeros((H, W, 3), np.uint8)
    t0 = time.time()
    ult = None
    hist: list = []
    escritos = 0
    buracos = 0
    k = fa
    for i, p in enumerate(planos):
        p0, p1 = quadro(p["t0"], FPS), quadro(p["t1"], FPS)
        if p1 <= fa or p0 >= fb:
            continue
        while k < min(p0, fb):                               # buraco entre planos: segura o último quadro
            img = (ult if ult is not None else preto).copy()
            img = Overlay.aplicar(FX.aplicar(img, k / FPS, efeitos, hist, vizinhos(k / FPS, i - 1, ult)), ov.pegar(k))
            enc.stdin.write(img.tobytes())
            k += 1
            escritos += 1
            buracos += 1
        arq = planos_res.get(p["id"], {}).get("arquivo")
        rd = leitor(arq, W, H, max(0, k - p0) / FPS) if arq and os.path.exists(arq) else iter(())
        anterior = ult                                       # último quadro do plano anterior (o salto mostra na emenda)
        while k < min(p1, fb):
            fr = next(rd, None)
            if fr is None:
                fr = ult if ult is not None else preto
            ult = fr
            img = fr.copy()
            if efeitos:
                img = FX.aplicar(img, k / FPS, efeitos, hist, vizinhos(k / FPS, i, anterior))
                hist.append(fr)
                if len(hist) > 4:
                    hist.pop(0)
            img = Overlay.aplicar(img, ov.pegar(k))
            enc.stdin.write(img.tobytes())
            k += 1
            escritos += 1
            if progresso and escritos % 60 == 0:
                progresso(escritos / max(1, fb - fa), f"Composição: {escritos}/{fb - fa} quadros")
        if hasattr(rd, "close"):
            rd.close()
    while k < fb:                                            # depois do último plano (fecho cheio do kit)
        img = (ult if ult is not None else preto).copy()
        img = Overlay.aplicar(FX.aplicar(img, k / FPS, efeitos, hist, vizinhos(k / FPS, len(planos) - 1, ult)), ov.pegar(k))
        enc.stdin.write(img.tobytes())
        k += 1
        escritos += 1
        buracos += 1
    enc.stdin.close()
    err = enc.stderr.read().decode(errors="replace")
    if enc.wait() != 0:
        raise RuntimeError(f"composição falhou: {err[-800:]}")
    os.replace(tmp, saida)
    dt = time.time() - t0
    return {"final": str(saida), "quadros": escritos, "quadros_sem_plano": buracos, "s": round(dt, 1),
            "ms_quadro": round(dt * 1000 / max(1, escritos), 1), "janela": [fa / FPS, fb / FPS]}
