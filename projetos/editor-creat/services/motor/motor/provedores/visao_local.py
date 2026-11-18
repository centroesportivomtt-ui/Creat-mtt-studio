"""Visão local (grátis, CPU): sinais medidos nos quadros-chave (nunca decodifica o 4K inteiro).

- tremor: correlação de fase entre quadros-chave vizinhos (deslocamento global em px a 1080 de largura);
- cenas: troca de ambiente por histograma HSV; rótulo de cor (quente/neutro/frio + escuro/médio/claro) e luz;
- rostos: YuNet (OpenCV, Apache-2.0) em EDITOR_YUNET ou dados/modelos (baixado uma vez do Hugging Face);
  sem modelo, Haar em EDITOR_HAAR; sem nenhum, lista vazia (o reenquadre cai no centro);
- telas: retângulos claros com bordas internas (celular, notebook, crachá) presentes em 2+ quadros seguidos;
- descrever(): momentos heurísticos (fala, b-roll, impacto) com nota 1-5, para o catálogo funcionar sem IA.
  A semântica fina (quem é, o que acontece) vem do provedor claude-leve (Haiku na folha de contato).
"""
from __future__ import annotations

import logging
import os
import pathlib
import urllib.request

import cv2
import numpy as np

log = logging.getLogger("motor.visao")

YUNET_URL = "https://huggingface.co/opencv/face_detection_yunet/resolve/main/face_detection_yunet_2023mar.onnx"
YUNET_NOME = "face_detection_yunet_2023mar.onnx"
LIMITE_TREMOR_PX = float(os.environ.get("EDITOR_TREMOR_LIMITE_PX", "40"))


def _modelo_yunet(cfg) -> pathlib.Path | None:
    env = os.environ.get("EDITOR_YUNET", "").strip()
    if env:
        return pathlib.Path(env) if pathlib.Path(env).is_file() else None
    p = pathlib.Path(cfg.dados) / "modelos" / YUNET_NOME
    if p.is_file():
        return p
    if os.environ.get("EDITOR_MODELOS_BAIXAR", "1") != "1":
        return None
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".tmp")
        with urllib.request.urlopen(urllib.request.Request(YUNET_URL, headers={"User-Agent": "editor-motor/0.1"}), timeout=60) as r, open(tmp, "wb") as f:
            f.write(r.read(5_000_000))
        if tmp.stat().st_size < 100_000:
            tmp.unlink(missing_ok=True)
            return None
        os.replace(tmp, p)
        return p
    except Exception as e:  # noqa: BLE001 - sem rede: segue sem rostos
        log.warning("YuNet indisponível (%s); rostos ficam vazios", e)
        return None


class DetectorRostos:
    def __init__(self, cfg):
        self.yunet, self.haar, self.nome = None, None, "nenhum"
        m = _modelo_yunet(cfg)
        if m is not None:
            try:
                self.yunet = cv2.FaceDetectorYN.create(str(m), "", (320, 320), 0.75, 0.3, 50)
                self.nome = "yunet"
                return
            except Exception as e:  # noqa: BLE001
                log.warning("YuNet não carregou: %s", e)
        h = os.environ.get("EDITOR_HAAR", "").strip()
        if h and pathlib.Path(h).is_file():
            self.haar = cv2.CascadeClassifier(h)
            self.nome = "haar"

    def detectar(self, bgr) -> list[list[float]]:
        H, W = bgr.shape[:2]
        if self.yunet is not None:
            self.yunet.setInputSize((W, H))
            _, fs = self.yunet.detect(bgr)
            out = []
            for f in (fs if fs is not None else []):
                x, y, w, h, conf = float(f[0]), float(f[1]), float(f[2]), float(f[3]), float(f[-1])
                out.append([round(max(0, x) / W, 4), round(max(0, y) / H, 4), round(w / W, 4), round(h / H, 4), round(conf, 3)])
            return out
        if self.haar is not None:
            g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
            fs = self.haar.detectMultiScale(g, 1.1, 6, minSize=(max(24, W // 14), max(24, W // 14)))
            return [[round(x / W, 4), round(y / H, 4), round(w / W, 4), round(h / H, 4), 0.5] for (x, y, w, h) in fs]
        return []


def _rotulo_cor(bgr) -> tuple[str, float]:
    b, g, r = [float(c.mean()) for c in cv2.split(bgr)]
    luz = float(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY).mean()) / 255.0
    tom = "quente" if r - b > 14 else ("frio" if b - r > 14 else "neutro")
    nivel = "escuro" if luz < 0.28 else ("claro" if luz > 0.62 else "medio")
    return f"{tom}-{nivel}", round(luz, 3)


def _telas(bgr) -> list[list[float]]:
    """Retângulos claros (tela acesa/crachá) com bordas por dentro. Conservador: área 1,5-30% e quase retangular."""
    H, W = bgr.shape[:2]
    g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    media = float(g.mean())
    _, bw = cv2.threshold(g, max(170, media + 60), 255, cv2.THRESH_BINARY)
    bw = cv2.morphologyEx(bw, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    cs, _ = cv2.findContours(bw, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    bordas = cv2.Canny(g, 60, 160)
    for c in cs:
        a = cv2.contourArea(c)
        if not (0.015 * W * H <= a <= 0.30 * W * H):
            continue
        x, y, w, h = cv2.boundingRect(c)
        if a / float(w * h) < 0.85 or min(w, h) < 20:
            continue
        dens = float((bordas[y:y + h, x:x + w] > 0).mean())
        if dens < 0.03:
            continue
        out.append([round(x / W, 4), round(y / H, 4), round(w / W, 4), round(h / H, 4)])
    return out


class VisaoLocal:
    nome = "local"

    def __init__(self, cfg):
        self.cfg = cfg
        self._rostos = None

    @property
    def rostos(self) -> DetectorRostos:
        if self._rostos is None:
            self._rostos = DetectorRostos(self.cfg)
        return self._rostos

    def sinais(self, quadros: list[tuple[float, pathlib.Path]]) -> dict:
        """quadros = [(t, jpg)] já com rotação aplicada. Devolve tremor, cenas, rostos, telas (analise.schema)."""
        ts, desl, hist_ant, cinza_ant = [], [], None, None
        cenas, rostos, telas_raw = [], [], []
        ini_cena, cores = 0.0, []
        for i, (t, p) in enumerate(quadros):
            bgr = cv2.imread(str(p))
            if bgr is None:
                continue
            H, W = bgr.shape[:2]
            esc = 360.0 / W
            peq = cv2.resize(bgr, (360, max(2, int(H * esc))), interpolation=cv2.INTER_AREA)
            g = cv2.cvtColor(peq, cv2.COLOR_BGR2GRAY).astype(np.float32)
            hsv = cv2.cvtColor(peq, cv2.COLOR_BGR2HSV)
            hist = cv2.calcHist([hsv], [0, 1], None, [16, 8], [0, 180, 0, 256])
            cv2.normalize(hist, hist)
            if cinza_ant is not None and cinza_ant.shape == g.shape:
                jan = cv2.createHanningWindow((g.shape[1], g.shape[0]), cv2.CV_32F)
                (dx, dy), resp = cv2.phaseCorrelate(cinza_ant, g, jan)
                px = float(np.hypot(dx, dy)) * 1080.0 / 360.0
                desl.append((ts[-1], t, px if resp > 0.03 else None))
                dist = cv2.compareHist(hist_ant, hist, cv2.HISTCMP_BHATTACHARYYA)
                if dist > 0.45 and t - ini_cena >= 1.0:
                    rot, luz = _rotulo_cor_media(cores)
                    cenas.append({"t0": round(ini_cena, 2), "t1": round(t, 2), "ambiente": rot, "luz": luz})
                    ini_cena, cores = t, []
            cores.append(peq)
            ts.append(t)
            cinza_ant, hist_ant = g, hist
            caixas = self.rostos.detectar(bgr)
            if caixas:
                rostos.append({"t": round(t, 2), "caixas": caixas})
            for cx in _telas(bgr):
                telas_raw.append((i, t, cx))
        fim = quadros[-1][0] if quadros else 0.0
        if ts:
            rot, luz = _rotulo_cor_media(cores)
            cenas.append({"t0": round(ini_cena, 2), "t1": round(max(fim, ini_cena), 2), "ambiente": rot, "luz": luz})
        vals = [d[2] for d in desl if d[2] is not None]
        trechos = []
        for t0, t1, px in desl:
            if px is not None and px > LIMITE_TREMOR_PX:
                if trechos and abs(trechos[-1][1] - t0) < 1e-6:
                    trechos[-1][1] = round(t1, 2)
                    trechos[-1][2] = round(max(trechos[-1][2], px), 1)
                else:
                    trechos.append([round(t0, 2), round(t1, 2), round(px, 1)])
        passo = float(np.mean(np.diff(ts))) if len(ts) > 1 else 0.0
        return {
            "tremor": {"passo": round(passo, 3), "media_px": round(float(np.mean(vals)), 1) if vals else 0.0, "trechos": trechos},
            "cenas": cenas,
            "rostos": rostos,
            "telas": _juntar_telas(telas_raw, ts),
            "_detector_rostos": self.rostos.nome,
        }

    def descrever(self, folha_jpg, tempos: list[float], contexto: dict) -> dict | None:
        return momentos_heuristicos(contexto)


def _rotulo_cor_media(imgs) -> tuple[str, float]:
    if not imgs:
        return "neutro-medio", 0.5
    return _rotulo_cor(np.mean(np.stack([cv2.resize(i, (90, 160)) for i in imgs]), axis=0).astype(np.uint8))


def _juntar_telas(raw, ts) -> list[dict]:
    """Só vale tela presente em 2+ quadros-chave seguidos com caixa parecida (IoU > 0,4)."""
    def iou(a, b):
        x0, y0 = max(a[0], b[0]), max(a[1], b[1])
        x1, y1 = min(a[0] + a[2], b[0] + b[2]), min(a[1] + a[3], b[1] + b[3])
        inter = max(0, x1 - x0) * max(0, y1 - y0)
        return inter / (a[2] * a[3] + b[2] * b[3] - inter + 1e-9)
    grupos = []
    for i, t, cx in raw:
        for g in grupos:
            if g["ult"] == i - 1 and iou(g["caixa"], cx) > 0.4:
                g["ult"], g["t1"], g["n"] = i, t, g["n"] + 1
                a = g["caixa"]
                x0, y0 = min(a[0], cx[0]), min(a[1], cx[1])
                x1, y1 = max(a[0] + a[2], cx[0] + cx[2]), max(a[1] + a[3], cx[1] + cx[3])
                g["caixa"] = [x0, y0, x1 - x0, y1 - y0]          # união: o desfoque cobre a tela inteira
                break
        else:
            grupos.append({"ult": i, "t0": t, "t1": t, "caixa": list(cx), "n": 1})
    passo = float(np.mean(np.diff(ts))) if len(ts) > 1 else 1.0
    return [{"t0": round(g["t0"], 2), "t1": round(g["t1"] + passo, 2), "caixa": [round(v, 4) for v in g["caixa"]]}
            for g in grupos if g["n"] >= 2]


# ---------------- momentos heurísticos (sem IA) ----------------
def _tem_rosto(rostos, t0, t1, minimo=0.12) -> bool:
    return any(t0 - 0.6 <= r["t"] <= t1 + 0.6 and any(c[2] >= minimo for c in r["caixas"]) for r in rostos)


def _tremido(trechos, t0, t1) -> bool:
    return any(a < t1 and b > t0 for a, b, _ in trechos)


def momentos_heuristicos(ctx: dict) -> dict:
    midia, tr, si = ctx["midia"], ctx["transcricao"], ctx["sinais"]
    dur = float(midia["duracao"])
    rostos, trechos = si["rostos"], si["tremor"].get("trechos", [])
    momentos = []
    # falas: junta segmentos com pausa < 1 s
    frases = []
    for s in tr["segmentos"]:
        if frases and s["s"] - frases[-1]["e"] < 1.0 and s["e"] - frases[-1]["s"] < 20:
            frases[-1]["e"], frases[-1]["texto"] = s["e"], frases[-1]["texto"] + " " + s["texto"]
        else:
            frases.append({"s": s["s"], "e": s["e"], "texto": s["texto"]})
    for f in frases:
        rosto = _tem_rosto(rostos, f["s"], f["e"], 0.15)
        pal = f["texto"].split()
        desc = ("fala para a câmera" if rosto else "fala fora de quadro") + ": «" + " ".join(pal[:8]) + ("…" if len(pal) > 8 else "") + "»"
        nota = 4 if rosto else 3
        if _tremido(trechos, f["s"], f["e"]):
            nota -= 1
        momentos.append({"t0": round(f["s"], 2), "t1": round(f["e"], 2), "tipo": "fala", "desc": desc, "nota": nota, "emocao": None})
    # b-roll: buracos sem fala >= 2 s
    ocupado = sorted((f["s"], f["e"]) for f in frases)
    cur = 0.0
    for a, b in ocupado + [(dur, dur)]:
        if a - cur >= 2.0 and midia.get("tem_video"):
            luz = np.mean([c["luz"] or 0.5 for c in si["cenas"] if c["t0"] < a and c["t1"] > cur] or [0.5])
            trem = _tremido(trechos, cur, a)
            nota = 3 - (1 if trem else 0) - (1 if luz < 0.2 else 0)
            desc = "imagem sem fala" + (", câmera tremida" if trem else ", câmera estável") + (", escuro" if luz < 0.28 else "")
            if _tem_rosto(rostos, cur, a, 0.08):
                desc += ", com pessoas"
            momentos.append({"t0": round(cur, 2), "t1": round(a, 2), "tipo": "broll", "desc": desc, "nota": max(1, nota), "emocao": None})
        cur = max(cur, b)
    # impactos: picos de energia
    for t, db in ctx.get("picos", [])[:8]:
        momentos.append({"t0": round(max(0.0, t - 0.6), 2), "t1": round(min(dur, t + 0.6), 2), "tipo": "impacto",
                         "desc": f"pico de som ({db:.0f} dBFS): grito, aplauso ou batida", "nota": 4, "emocao": "intensidade"})
    momentos.sort(key=lambda m: m["t0"])
    fala_pct = ctx.get("fala_pct") or 0.0
    n_rostos = max((len(r["caixas"]) for r in rostos), default=0)
    vert = midia.get("h") and midia.get("w") and midia["h"] > midia["w"]
    camera = "tremida" if si["tremor"]["media_px"] > LIMITE_TREMOR_PX else "estável"
    serve = "fala para a câmera" if fala_pct > 0.5 and n_rostos else ("b-roll / clima" if fala_pct < 0.2 else "misto: fala e imagem")
    return {
        "provedor": "local",
        "resumo": f"{'vertical' if vert else 'horizontal'} {dur:.0f}s · {len(si['cenas'])} cena(s) · fala {fala_pct * 100:.0f}% · câmera {camera}",
        "pessoas": f"até {n_rostos} rosto(s) por quadro" if n_rostos else "sem rosto detectado",
        "camera": f"{camera} ({si['tremor']['media_px']:.0f} px entre quadros-chave)",
        "serve_para": serve,
        "momentos": momentos[:40],
    }
