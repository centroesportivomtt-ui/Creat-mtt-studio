"""OVERLAY: `motion[]` + `legendas` do EDL viram uma cena do kit (packages/kit/cenas/*.json) e o kit renderiza a sequência
PNG RGBA por beginFrame com N workers (`EDITOR_RENDER_WORKERS`). Quadro repetido vira link físico (não ocupa disco).

Legendas: se o EDL não trouxer camadas `legenda` prontas (filme legado), as palavras [t0, t1, texto, ênfase] viram páginas
do modelo `legenda` do kit, quebrando em pausa > 0,45 s ou pontuação final (máx. 3 palavras por página). Ênfase 1 = *palavra*.
Imagens das camadas (src/imagem/logo) que são chaves do armazenamento ou caminhos absolutos viram `/@abs/<caminho>`.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import shutil
import subprocess
import time

from motor import config
from motor.etapas.montagem.comum import Fontes, gravar_json, hash_obj

KIT = config.KIT
CHAVES_IMG = ("src", "imagem", "logo")


def _fixa_caminhos(obj, fontes: Fontes | None):
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if isinstance(v, str) and k in CHAVES_IMG and not re.match(r"^(https?:|data:|/@abs/|assets/|kit/)", v):
                p = pathlib.Path(v) if v.startswith("/") else (fontes.arquivo_qualquer(v) if fontes else pathlib.Path(v))
                out[k] = "/@abs" + str(pathlib.Path(p).resolve())
            else:
                out[k] = _fixa_caminhos(v, fontes)
        return out
    if isinstance(obj, list):
        return [_fixa_caminhos(x, fontes) for x in obj]
    return obj


def camadas_legenda(edl: dict) -> list[dict]:
    lg = edl.get("legendas") or {}
    pal = sorted(lg.get("palavras") or [], key=lambda w: w[0])
    if not pal:
        return []
    grupos, atual = [], []
    for w in pal:
        if atual and (w[0] - atual[-1][1] > 0.45 or re.search(r"[.!?]$", str(atual[-1][2]))):
            grupos.append(atual)
            atual = []
        atual.append(w)
    if atual:
        grupos.append(atual)
    camadas = []
    for n, g in enumerate(grupos):
        de = max(0.0, g[0][0] - 0.05)
        ate = g[-1][1] + 0.25
        if n + 1 < len(grupos):
            ate = min(ate, grupos[n + 1][0][0] - 0.06)
        ate = min(max(ate, g[-1][1] + 0.02), float(edl["duracao"]))
        palavras = []
        for k, w in enumerate(g):
            txt = str(w[2]).strip()
            if len(w) > 3 and w[3]:
                txt = f"*{txt}*"
            palavras.append({"p": txt, "i": round(w[0], 3), "f": round(w[1], 3), "quebra": k > 0 and k % 3 == 0})
        camadas.append({"id": f"leg{n + 1}", "modelo": lg.get("modelo", "legenda"), "de": round(de, 3), "ate": round(ate, 3),
                        "props": {"palavras": palavras, "y": lg.get("y", 0.62), "porPagina": 3,
                                  "tamanho": lg.get("tamanho", 94), "largura": 0.72}})
    return camadas


def cena_do_edl(edl: dict, fontes: Fontes | None = None) -> dict:
    motion = [dict(m) for m in edl.get("motion", [])]
    if not any(m["modelo"] == "legenda" for m in motion):
        motion += camadas_legenda(edl)
    motion = _fixa_caminhos(motion, fontes)
    for m in motion:
        m["de"] = max(0.0, float(m["de"]))
        m["ate"] = min(float(edl["duracao"]), float(m["ate"]))
    return {"nome": f"overlay-{edl.get('projeto', 'p')}", "formato": edl.get("formato", {"w": 1080, "h": 1920, "fps": 30}),
            "duracao": float(edl["duracao"]), "cor": "transparent", "camadas": [m for m in motion if m["ate"] > m["de"]]}


def renderizar(edl: dict, fontes: Fontes | None, base: pathlib.Path, *, workers: int = 3, janela: tuple[float, float] | None = None,
               nice: int = 5, progresso=None) -> dict:
    """Devolve {'dir', 'stats', 'cena', 'cache'}. Idempotente por hash da cena + janela."""
    cena = cena_do_edl(edl, fontes)
    if not cena["camadas"]:
        return {"dir": None, "stats": {"quadros": 0}, "cena": cena, "cache": False}
    h = hash_obj(cena, janela, "ov2")
    d = base / h
    feito = d / "_feito.json"
    if feito.exists():
        return {**json.loads(feito.read_text()), "cache": True}
    if d.exists():
        shutil.rmtree(d)
    d.mkdir(parents=True)
    arq_cena = base / f"{h}.cena.json"
    gravar_json(arq_cena, cena)
    cmd = (["nice", "-n", str(nice)] if nice else []) + ["node", str(KIT / "ferramentas" / "render.cjs"), str(arq_cena), "--alfa", "png",
                                                         "--out", str(d) + "/", "--workers", str(max(1, workers)), "--json"]
    if janela:
        cmd += ["--de", f"{janela[0]:.4f}", "--ate", f"{janela[1]:.4f}"]
    if progresso:
        progresso(0.0, f"Motion: {len(cena['camadas'])} camadas, {workers} workers")
    t0 = time.time()
    r = subprocess.run(cmd, capture_output=True, text=True, cwd=str(KIT))
    m = re.search(r"MKSTATS (\{.*\})", r.stdout)
    if r.returncode != 0 or not m:
        raise RuntimeError(f"overlay do kit falhou ({r.returncode}): {r.stderr[-1200:]} {r.stdout[-400:]}")
    stats = json.loads(m.group(1))
    stats["relogio_s"] = round(time.time() - t0, 1)
    if stats.get("erros"):
        stats["aviso"] = "o navegador registrou erros (ver log do kit)"
    res = {"dir": str(d), "stats": stats, "cena": str(arq_cena)}
    gravar_json(feito, res)
    return {**res, "cache": False}


def limpar(base: pathlib.Path, manter: str | None = None) -> None:
    if not base.exists():
        return
    for p in base.iterdir():
        if manter and p.name.startswith(manter):
            continue
        if p.is_dir():
            shutil.rmtree(p, ignore_errors=True)
        else:
            p.unlink(missing_ok=True)


def quadro_arquivo(dir_ov: str | None, n: int) -> str | None:
    if not dir_ov:
        return None
    p = os.path.join(dir_ov, f"quadro_{n:05d}.png")
    return p if os.path.exists(p) else None
