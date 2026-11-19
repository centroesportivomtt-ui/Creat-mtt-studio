"""PLANOS: cada plano do EDL vira um clipe 1080x1920 renderizado só a partir do trecho usado da fonte (4K nunca inteiro).

Reaproveita o pipeline aprovado de 17/11 (V2/py/planos.py + V1/py/shot.py), agora como biblioteca sem caminho fixo:
- reenquadre 9:16 por quadros-chave `enquadre` [[u, zoom, cx, cy]] (smoothstep), para fonte de qualquer tamanho/orientação;
- rampa de velocidade (`rampa` [[u, s_fonte]]) ou velocidade constante (`vel`);
- estabilização LK + caminho suave com correção limitada à margem (nunca borda preta) e zoom extra automático (até +16%);
  regra do dono: medir o tremor de CADA plano e estabilizar quando há tremor (estab auto|sim; 'nao' desliga);
- cor por ambiente (tabela COR, LUT 1D + saturação), vinheta, nitidez leve;
- faixa de cor lida do arquivo (iPhone = yuvj420p faixa cheia; o V2 forçava 'tv' e esmagava pretos — achado do turbo);
- desfoque de telas (`desfocar`, caixas normalizadas da saída), `flash` e `tremor` de impacto ([u, dur, força]), `mblur`.
Idempotente: o clipe fica no cache por hash (parâmetros + assinatura da fonte), então corrigir uma versão refaz só o que mudou.
"""
from __future__ import annotations

import math
import os
import pathlib
import subprocess
import time

import numpy as np

from motor.etapas.montagem.comum import FPS_PADRAO, H_PADRAO, W_PADRAO, Fontes, hash_obj, interp_kf, meta, quadro

VERSAO = "p4"

# ganho r,g,b; gama; contraste em S; saturação; ponto preto  (V2 calibrado em 17/11 + equivalentes dos looks do V1)
COR = {
    "neutro":   dict(g=(1.00, 1.00, 1.00), gama=1.00, con=0.08, sat=1.00, preto=0.006),
    "mesa":     dict(g=(1.03, 1.00, 0.97), gama=0.97, con=0.16, sat=1.10, preto=0.012),
    "note":     dict(g=(1.04, 1.00, 0.95), gama=0.98, con=0.14, sat=1.04, preto=0.010),
    "corredor": dict(g=(1.07, 1.00, 0.90), gama=0.96, con=0.16, sat=1.02, preto=0.012),
    "salao":    dict(g=(0.95, 1.00, 1.06), gama=0.98, con=0.14, sat=0.86, preto=0.014),
    "evento":   dict(g=(0.99, 1.00, 1.01), gama=0.97, con=0.14, sat=0.98, preto=0.012),
    "rosa":     dict(g=(0.93, 1.02, 1.00), gama=0.95, con=0.12, sat=0.84, preto=0.012),
    "sala":     dict(g=(0.95, 1.00, 1.09), gama=0.90, con=0.16, sat=0.96, preto=0.010),
    "claro":    dict(g=(1.00, 1.00, 1.00), gama=0.98, con=0.12, sat=1.06, preto=0.010),
    "laranja":  dict(g=(0.94, 1.00, 1.07), gama=0.98, con=0.12, sat=0.86, preto=0.012),
    "palco":    dict(g=(0.98, 1.00, 1.02), gama=0.98, con=0.12, sat=1.04, preto=0.012),
    "frio":     dict(g=(0.93, 1.00, 1.08), gama=1.06, con=0.20, sat=0.55, preto=0.030),
}
COR["cru"] = COR["neutro"]


def _cv2():
    import cv2
    cv2.setNumThreads(int(os.environ.get("EDITOR_THREADS", "2") or 2))
    return cv2


# ---------------------------------------------------------------- leitura
def nvenc_ligado() -> bool:
    """EDITOR_NVENC=1 só no contêiner GPU (deploy/modal_app.py, render_gpu): NVDEC na leitura e NVENC no encode.
    Sem a variável, as linhas de comando são exatamente as da CPU."""
    return os.environ.get("EDITOR_NVENC", "").strip() == "1"


def cmd_leitura(arq, m, n0: int, n: int, vf: str, ch: int, *, rapido: bool = False, nice: int = 5) -> list[str]:
    T = max(0.0, m.start + (n0 - 0.4) / m.fps)
    cmd = (["nice", "-n", str(nice)] if nice else []) + ["ffmpeg", "-nostdin", "-v", "error", "-threads", "2"]
    if nvenc_ligado():
        cmd += ["-hwaccel", "cuda"]            # decodifica na GPU; os quadros voltam à RAM para os filtros de CPU
    if rapido:
        cmd += ["-skip_loop_filter", "all"]
    cmd += ["-ss", f"{T:.4f}", "-i", str(arq), "-frames:v", str(n), "-fps_mode", "passthrough", "-vf", vf,
            "-pix_fmt", "bgr24" if ch == 3 else "gray", "-f", "rawvideo", "-"]
    return cmd


def cmd_encode(W: int, H: int, FPS: float, tmp: str, *, nice: int = 5) -> list[str]:
    """Encode do clipe intermediário (bgr24 cru na entrada). CPU: libx264 crf 14. GPU: h264_nvenc cq 14 equivalente."""
    if nvenc_ligado():
        codec = ["-c:v", "h264_nvenc", "-preset", "p5", "-tune", "hq", "-rc", "vbr", "-cq", "14", "-b:v", "0"]
    else:
        codec = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "14"]
    return (["nice", "-n", str(nice)] if nice else []) + [
        "ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", *codec,
        "-g", str(int(FPS)), "-threads", "2", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-color_range", "tv", "-f", "mp4", tmp]


def ler(arq, m, n0: int, n: int, vf: str, w: int, h: int, ch: int, *, rapido: bool = False, nice: int = 5):
    """Decodifica n quadros a partir do quadro-fonte n0 (busca rápida -ss antes do -i)."""
    cmd = cmd_leitura(arq, m, n0, n, vf, ch, rapido=rapido, nice=nice)
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=w * h * ch * 2)
    sz = w * h * ch
    try:
        for _ in range(n):
            b = p.stdout.read(sz)
            if len(b) < sz:
                break
            yield np.frombuffer(b, np.uint8).reshape((h, w, ch) if ch == 3 else (h, w))
    finally:
        p.stdout.close()
        p.kill()
        p.wait()


def entrada_vf(m) -> str:
    return f"in_color_matrix=bt709:in_range={m.faixa}"


# ---------------------------------------------------------------- estabilização
def _sm(x: np.ndarray, sig: float) -> np.ndarray:
    n = len(x)
    if n < 3:
        return x.copy()
    r = int(3 * sig) + 1
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sig) ** 2)
    k /= k.sum()
    mm = min(n - 1, max(2, int(sig)))
    a = (x[mm] - x[0]) / mm
    b = (x[-1] - x[-1 - mm]) / mm
    return np.convolve(np.concatenate([x[0] + a * np.arange(-r, 0), x, x[-1] + b * np.arange(1, r + 1)]), k, "valid")


def correcao(c: np.ndarray, sig: float, mx: float, my: float, mrot: float = 0.010) -> np.ndarray:
    """d = caminho suave - real, limitado à margem (V2 suaviza, com borda por extrapolação linear do V1)."""
    lim = np.array([mx, my, mrot])
    tgt = np.stack([_sm(c[:, j], sig) for j in range(3)], 1)
    for _ in range(5):
        tgt = np.stack([_sm(c[:, j] + np.clip(tgt[:, j] - c[:, j], -lim[j], lim[j]), sig) for j in range(3)], 1)
    return np.clip(tgt - c, -lim, lim)


def jitter(c: np.ndarray, escala: float) -> float:
    """tremor residual (px na saída 1080): RMS do desvio para a média móvel de 0,5 s."""
    if len(c) < 5:
        return 0.0
    k = min(15, len(c) // 2 * 2 - 1)
    ker = np.ones(k) / k
    sm = lambda x: np.convolve(np.pad(x, (k // 2, k // 2), mode="edge"), ker, "valid")
    res = np.stack([c[:, j] - sm(c[:, j]) for j in range(2)], 1)
    return float(np.sqrt(np.mean(res[:, 0] ** 2 + res[:, 1] ** 2))) * escala


# ---------------------------------------------------------------- cor e acabamento
_LUT: dict = {}


def grade(img, nome: str):
    cv2 = _cv2()
    nome = nome if nome in COR else "neutro"
    if nome not in _LUT:
        c = COR[nome]
        x = np.linspace(0, 1, 256)
        luts = []
        for g in (c["g"][2], c["g"][1], c["g"][0]):          # BGR
            v = np.clip(x * g, 0, 1) ** c["gama"]
            v = v + c["con"] * (v - 0.5) * (1 - (2 * v - 1) ** 2) * 1.6
            v = np.clip((v - c["preto"]) / (1 - c["preto"]), 0, 1)
            luts.append((v * 255 + 0.5).astype(np.uint8))
        s = c["sat"]
        wv = np.array([0.0722, 0.7152, 0.2126])
        Msat = ((1 - s) * np.tile(wv, (3, 1)) + s * np.eye(3)).astype(np.float32)
        _LUT[nome] = (np.stack(luts, 1).reshape(256, 1, 3), Msat, abs(s - 1) < 1e-3)
    lut, Msat, sem_sat = _LUT[nome]
    o = cv2.LUT(img, lut)
    return o if sem_sat else cv2.transform(o, Msat)


_VIG: dict = {}


def vinheta(img):
    h, w = img.shape[:2]
    if (h, w) not in _VIG:
        y, x = np.mgrid[0:h, 0:w].astype(np.float32)
        r = np.hypot((x - w / 2) / (w * 0.80), (y - h / 2) / (h * 0.80))
        _VIG[(h, w)] = (np.clip(1 - 0.34 * np.clip(r - 0.42, 0, None) ** 1.7, 0, 1) * 256).astype(np.uint16)[:, :, None]
    return ((img.astype(np.uint16) * _VIG[(h, w)]) >> 8).astype(np.uint8)


def desfoca(img, caixas: list):
    cv2 = _cv2()
    h, w = img.shape[:2]
    mask = np.zeros((h, w), np.float32)
    for x0, y0, x1, y1 in caixas:
        a, b = int(max(0, min(x0, x1)) * w), int(max(0, min(y0, y1)) * h)
        c, d = int(min(1, max(x0, x1)) * w), int(min(1, max(y0, y1)) * h)
        if c > a and d > b:
            mask[b:d, a:c] = 1.0
    if mask.max() == 0:
        return img
    mask = cv2.GaussianBlur(mask, (0, 0), 9)[:, :, None]
    bl = cv2.GaussianBlur(img, (0, 0), 16)
    return (img * (1 - mask) + bl * mask).astype(np.uint8)


# ---------------------------------------------------------------- plano
def tempos_fonte(p: dict, nf: int, fps: float) -> np.ndarray:
    if p.get("rampa"):
        return np.array([interp_kf(p["rampa"], k / max(1, nf - 1))[0] for k in range(nf)])
    return p["s0"] + np.arange(nf) / fps * float(p.get("vel", 1.0) or 1.0)


def render_plano(p: dict, arq: str, offset: float, saida: str, fmt: dict, nice: int = 5) -> dict:
    """Renderiza um plano em `saida` (mp4 H.264 intermediário). Roda em processo separado (spawn).

    UMA decodificação do 4K (era o custo dominante: ~110 ms/quadro em HEVC 4K): os quadros saem já recortados na região
    de trabalho, a trajetória é medida neles mesmos (cinza reduzido) e ficam num buffer em RAM (cru, ou JPEG q96 se o
    plano for grande) até a correção ficar pronta. Turbo item 3.
    """
    cv2 = _cv2()
    t_ini = time.time()
    W, H, FPS = int(fmt.get("w", W_PADRAO)), int(fmt.get("h", H_PADRAO)), float(fmt.get("fps", FPS_PADRAO))
    m = meta(arq)
    if not m.tem_video:
        raise RuntimeError(f"plano {p['id']}: a fonte não tem vídeo ({arq})")
    nf = quadro(p["t1"], FPS) - quadro(p["t0"], FPS)
    if nf <= 0:
        raise RuntimeError(f"plano {p['id']} sem quadros")
    ts = tempos_fonte(p, nf, FPS)
    idx = np.clip(np.round((ts - offset - m.start) * m.fps).astype(int), 0, max(0, m.nb - 1))
    kf = p.get("enquadre") or [[0, 1.0, 0.5, 0.5], [1, 1.03, 0.5, 0.5]]
    kf = [k if len(k) == 4 else [k[0], k[1], 0.5, 0.5] for k in kf]
    if m.w / m.h > W / H:                                   # janela base 9:16 dentro da fonte (zoom 1)
        bh = float(m.h); bw = bh * W / H
    else:
        bw = float(m.w); bh = bw * H / W
    estab = p.get("estab", "auto")
    medir = estab != "nao" and nf >= 8
    info = {"id": p["id"], "quadros": nf, "jit_antes": None, "jit_depois": None, "zoom_x": 1.0, "estab": False}
    MULTS = (1.0, 1.05, 1.10, 1.16) if medir else (1.0,)
    zs = [k[1] for k in kf]
    zmin, zmax = min(zs), max(zs)

    def janela(u, mult):
        z, cx, cy = interp_kf(kf, u)
        z *= mult
        ww, wh = bw / z, bh / z
        return min(max(cx * m.w, ww / 2), m.w - ww / 2), min(max(cy * m.h, wh / 2), m.h - wh / 2), ww, wh

    # região de trabalho: cobre as janelas com zoom 1 + a margem máxima que a estabilização pode usar
    js = [janela(u, 1.0) for u in np.linspace(0, 1, 9)]
    mg = 0.12 * bw if medir else 0.0
    rx0 = int(max(0, min(j[0] - j[2] / 2 for j in js) - mg)) // 2 * 2
    ry0 = int(max(0, min(j[1] - j[3] / 2 for j in js) - mg)) // 2 * 2
    rx1 = min(m.w, int(max(j[0] + j[2] / 2 for j in js) + mg + 2)) // 2 * 2
    ry1 = min(m.h, int(max(j[1] + j[3] / 2 for j in js) + mg + 2)) // 2 * 2
    fz = min(1.0, W / (bw / (zmax * MULTS[-1])))
    ww = max(2, int((rx1 - rx0) * fz) // 2 * 2)
    wh = max(2, int((ry1 - ry0) * fz) // 2 * 2)
    fzx, fzy = ww / (rx1 - rx0), wh / (ry1 - ry0)
    vf = f"crop={rx1 - rx0}:{ry1 - ry0}:{rx0}:{ry0},scale={ww}:{wh}:flags=lanczos:{entrada_vf(m)}"

    # 1) decodificação única + trajetória (px da fonte) + buffer
    pad = 12 if medir else 0
    a0 = max(0, int(idx.min()) - pad)
    b0 = min(max(0, m.nb - 1), int(idx.max()) + pad)
    precisa = set(int(i) for i in idx)
    cru = (b0 - a0 + 1) * ww * wh * 3 <= float(os.environ.get("EDITOR_PLANO_RAM_MB", "1500")) * 1e6
    buf: dict = {}
    gw = 360
    gh = max(2, int(round(gw * wh / ww)) // 2 * 2)
    gsx, gsy = (ww / gw) / fzx, (wh / gh) / fzy
    tr = [(0.0, 0.0, 0.0)]
    prev = None
    ult_idx = a0 - 1
    for j, fr in enumerate(ler(arq, m, a0, b0 - a0 + 1, vf, ww, wh, 3, nice=nice)):
        n = a0 + j
        ult_idx = n
        if medir:
            g = cv2.resize(cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY), (gw, gh), interpolation=cv2.INTER_AREA)
            if prev is not None:
                M = None
                pts = cv2.goodFeaturesToTrack(prev, 400, 0.006, 8)
                if pts is not None and len(pts) >= 12:
                    q, st, _ = cv2.calcOpticalFlowPyrLK(prev, g, pts, None)
                    ok = st.ravel() == 1
                    if ok.sum() >= 8:
                        M, _ = cv2.estimateAffinePartial2D(pts[ok], q[ok], method=cv2.RANSAC, ransacReprojThreshold=1.5)
                if M is not None:
                    c = M @ np.array([gw / 2, gh / 2, 1.0])
                    tr.append(((c[0] - gw / 2) * gsx, (c[1] - gh / 2) * gsy, math.atan2(M[1, 0], M[0, 0])))
                else:
                    tr.append((0.0, 0.0, 0.0))
            prev = g
        if n in precisa:
            buf[n] = fr.copy() if cru else cv2.imencode(".jpg", fr, [cv2.IMWRITE_JPEG_QUALITY, 96])[1]
    if not buf:
        raise RuntimeError(f"plano {p['id']}: nenhum quadro decodificado de {arq}")

    d = None
    mult = 1.0
    if medir and len(tr) > 8:
        c = np.array(tr, np.float64)
        c[np.hypot(c[:, 0], c[:, 1]) > 0.12 * m.w] = 0          # corte/varrida não é tremor
        c = np.cumsum(c, 0)
        sel = np.clip(idx - a0, 0, len(c) - 1)
        info["jit_antes"] = round(jitter(c[sel], W / (bw / zmin)), 2)
        if estab == "sim" or info["jit_antes"] > 1.5:
            for mult in MULTS:
                mx = (bw - bw / (zmin * mult)) / 2 * 0.92
                my = (bh - bh / (zmin * mult)) / 2 * 0.92
                if mx < 4 or my < 4:
                    continue
                d = correcao(c, 12.0, mx, my)
                if np.mean((np.abs(d[sel, 0]) >= mx * 0.999) | (np.abs(d[sel, 1]) >= my * 0.999)) < 0.2:
                    break
            if d is not None:
                info.update(estab=True, zoom_x=mult, jit_depois=round(jitter((c + d)[sel], W / (bw / (zmin * mult))), 2))
            else:
                mult = 1.0

    # 2) quadros
    seed = int(hash_obj(p["id"])[:8], 16)
    sacode = np.random.default_rng(seed).uniform(-1, 1, (nf + 8, 2))
    dur_p = nf / FPS
    flashes = [(u * dur_p, du, f) for u, du, f in p.get("flash", []) or []]
    tremores = [(u * dur_p, du, f) for u, du, f in p.get("tremor", []) or []]
    caixas = p.get("desfocar") or []
    cor = p.get("cor", "neutro")
    mblur = bool(p.get("mblur"))
    tmp = saida + ".tmp.mp4"
    enc = subprocess.Popen(cmd_encode(W, H, FPS, tmp, nice=nice), stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    disp = sorted(buf)

    def pega(n):
        if n not in buf:                                    # passou do fim do arquivo: o último que existe
            n = disp[-1] if n > disp[-1] else disp[0]
        x = buf[n]
        return x if cru else cv2.imdecode(x, cv2.IMREAD_COLOR)

    ant = None
    for k in range(nf):
        n = int(idx[k])
        fr = pega(n)
        base = cv2.addWeighted(ant, 0.5, fr, 0.5, 0) if (mblur and ant is not None) else fr
        ant = fr
        u = k / max(1, nf - 1)
        cx, cy, ww_, wh_ = janela(u, mult)
        th = 0.0
        if d is not None:
            dd = d[int(np.clip(n - a0, 0, len(d) - 1))]
            cx = min(max(cx - dd[0], ww_ / 2), m.w - ww_ / 2)
            cy = min(max(cy - dd[1], wh_ / 2), m.h - wh_ / 2)
            th = -dd[2]
        tt = k / FPS
        ox = oy = 0.0
        for t0_, du, f in tremores:
            if t0_ <= tt < t0_ + du:
                e = (1 - (tt - t0_) / du) ** 2
                ox += sacode[k, 0] * 40 * f * e
                oy += sacode[k, 1] * 40 * f * e
        sc = ww_ / W                                       # px de fonte por px de saída
        co, si = math.cos(th), math.sin(th)
        A = np.array([[co * sc * fzx, -si * sc * fzx], [si * sc * fzy, co * sc * fzy]])
        b = np.array([(cx - rx0) * fzx, (cy - ry0) * fzy]) - A @ np.array([W / 2 + ox, H / 2 + oy])
        interp = cv2.INTER_LINEAR if sc * fzx >= 0.95 else cv2.INTER_CUBIC
        o = cv2.warpAffine(base, np.hstack([A, b[:, None]]), (W, H), flags=interp | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
        if caixas:
            o = desfoca(o, caixas)
        o = grade(o, cor)
        bl = cv2.GaussianBlur(o, (0, 0), 1.0)
        o = vinheta(cv2.addWeighted(o, 1.18, bl, -0.18, 0))
        for t0_, du, f in flashes:
            if t0_ <= tt < t0_ + du:
                e = f * (1 - (tt - t0_) / du) ** 1.5
                o = np.clip(o.astype(np.float32) * (1 + e * 0.6) + 255 * e * 0.55, 0, 255).astype(np.uint8)
        enc.stdin.write(o.tobytes())
    enc.stdin.close()
    err = enc.stderr.read().decode(errors="replace")
    if enc.wait() != 0:
        raise RuntimeError(f"plano {p['id']}: encode falhou: {err[-500:]}")
    os.replace(tmp, saida)
    info["ms_quadro"] = round((time.time() - t_ini) * 1000 / nf, 1)
    info["janela_trabalho"] = [ww, wh]
    info["buffer"] = "cru" if cru else "jpeg"
    if ult_idx < int(idx.max()):
        info["aviso"] = f"fonte acabou no quadro {ult_idx}; segurou o último"
    return info


def chave_plano(p: dict, assinatura: list, fmt: dict) -> str:
    q = {k: v for k, v in p.items() if k not in ("bloco", "som_direto_db", "janela")}
    q["t1"] = round(p["t1"] - p["t0"], 4)
    q.pop("t0", None)
    return hash_obj(q, assinatura, fmt, COR.get(p.get("cor", "neutro"), COR["neutro"]), VERSAO)


def _trabalho(args):
    p, arq, off, saida, fmt, nice = args
    try:
        return render_plano(p, arq, off, saida, fmt, nice)
    except Exception as e:  # noqa: BLE001 - devolve o erro ao processo pai
        return {"id": p["id"], "erro": f"{type(e).__name__}: {e}"}


def renderizar(edl: dict, fontes: Fontes, cache: pathlib.Path, *, workers: int = 2, nice: int = 5,
               ids: set | None = None, janela: tuple[float, float] | None = None, progresso=None) -> dict:
    """Renderiza os planos que faltam no cache. Devolve {id: {'arquivo', 'info', 'cache'}}."""
    cache.mkdir(parents=True, exist_ok=True)
    fmt = edl.get("formato", {"w": W_PADRAO, "h": H_PADRAO, "fps": FPS_PADRAO})
    res, tarefas = {}, []
    for p in edl["planos"]:
        if ids and p["id"] not in ids:
            continue
        if janela and (p["t1"] <= janela[0] or p["t0"] >= janela[1]):
            continue
        arq = str(fontes.video(p["fonte"]))
        h = chave_plano(p, fontes.assinatura(p["fonte"]), fmt)
        destino = cache / f"{h}.mp4"
        res[p["id"]] = {"arquivo": str(destino), "cache": destino.exists(), "info": None}
        if destino.exists():
            os.utime(destino)
            continue
        tarefas.append((p, arq, fontes.offset(p["fonte"]), str(destino), fmt, nice))
    if tarefas:
        erros = []
        if workers <= 1 or len(tarefas) == 1:
            it = map(_trabalho, tarefas)
            ex = None
        else:
            import concurrent.futures as cf
            import multiprocessing as mp
            ex = cf.ProcessPoolExecutor(max_workers=min(workers, len(tarefas)), mp_context=mp.get_context("spawn"))
            it = ex.map(_trabalho, tarefas)
        try:
            for n, info in enumerate(it, 1):
                if "erro" in info:
                    erros.append(info)
                else:
                    res[info["id"]]["info"] = info
                if progresso:
                    progresso(n / len(tarefas), f"Planos: {n}/{len(tarefas)} renderizados")
        finally:
            if ex is not None:
                ex.shutdown()
        if erros:
            raise RuntimeError("planos com erro: " + "; ".join(f"{e['id']}: {e['erro']}" for e in erros[:5]))
    return res


def limpar_cache(cache: pathlib.Path, limite_mb: int) -> int:
    """Apaga os clipes mais antigos (por uso) até o cache caber no limite. Devolve bytes apagados."""
    if not cache.exists():
        return 0
    arqs = sorted(cache.glob("*.mp4"), key=lambda p: p.stat().st_mtime)
    total = sum(p.stat().st_size for p in arqs)
    apagado = 0
    while arqs and total > limite_mb * 1e6:
        p = arqs.pop(0)
        s = p.stat().st_size
        p.unlink(missing_ok=True)
        total -= s
        apagado += s
    return apagado
