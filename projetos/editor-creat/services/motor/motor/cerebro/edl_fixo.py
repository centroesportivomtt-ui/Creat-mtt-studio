"""Cérebro fixture com EDL pronto (testes ponta a ponta e demonstração, sem custo de token).

    EDITOR_CEREBRO=fixture  EDITOR_CEREBRO_EDL=<edl.json>  [EDITOR_CEREBRO_EDL_ATE=15.23]

A "resposta do cérebro" é um EDL já aprovado (o V2 de 17/11, por exemplo). Se for um EDL legado (V1/V2), é convertido
por ferramentas.edl_legado. Com _ATE, vale só o começo do filme (corte de prefixo: nada muda de lugar, o que passa do
fim é aparado ou sai). As fontes cujo arquivo tem o mesmo nome de um arquivo enviado ao projeto passam a ler do
armazenamento do projeto (é assim que o clipe enviado pelo site entra no filme).
"""
from __future__ import annotations

import copy
import json
import os
import pathlib


def ativo() -> str | None:
    p = os.environ.get("EDITOR_CEREBRO_EDL", "").strip()
    return p or None


def carregar(caminho: str | pathlib.Path) -> dict:
    caminho = pathlib.Path(caminho)
    edl = json.loads(caminho.read_text(encoding="utf-8"))
    if "planos" in edl and "fontes" in edl and "formato" in edl:
        return edl
    from motor.ferramentas.edl_legado import converter
    return converter(caminho)


def prefixo(edl: dict, ate: float) -> dict:
    """Só os primeiros `ate` segundos. Corte limpo: escolha `ate` numa fronteira de plano sem fala atravessando."""
    e = copy.deepcopy(edl)
    ate = float(ate)
    if ate >= float(e["duracao"]):
        return e
    e["duracao"] = round(ate, 4)
    e["planos"] = [dict(p, t1=min(p["t1"], ate)) for p in e["planos"] if p["t0"] < ate - 1e-3]
    voz = []
    for v in e.get("voz", []):
        if v["t0"] >= ate - 1e-3:
            continue
        if v["t1"] > ate:                       # apara mantendo a proporção fonte/linha do tempo
            k = (v["s1"] - v["s0"]) / max(1e-6, v["t1"] - v["t0"])
            v = dict(v, t1=ate, s1=round(v["s0"] + (ate - v["t0"]) * k, 4))
        voz.append(v)
    e["voz"] = voz
    mot = []
    for m in e.get("motion", []):
        if m["de"] >= ate - 0.05:
            continue
        if m["ate"] > ate:
            m = dict(m, ate=ate)
            if m["modelo"] == "legenda":
                m["props"] = dict(m.get("props") or {})
                m["props"]["palavras"] = [w for w in m["props"].get("palavras", []) if w.get("i", m["de"]) < ate]
        mot.append(m)
    e["motion"] = mot
    if isinstance(e.get("legendas"), dict):
        e["legendas"] = dict(e["legendas"], palavras=[w for w in e["legendas"].get("palavras", []) if w[1] <= ate + 0.05])
    e["fx"] = [f for f in e.get("fx", []) if f.get("t", 0) + f.get("dur", 0) <= ate]
    e["sfx"] = [s for s in e.get("sfx", []) if s.get("t", 0) < ate - 0.2]
    e["blocos"] = [b for b in e.get("blocos", []) if b.get("t0", 0) < ate]
    usadas = {p["fonte"] for p in e["planos"]} | {v["fonte"] for v in e["voz"]}
    if e.get("tom_sala"):
        usadas.add(e["tom_sala"]["fonte"])
    e["fontes"] = {k: v for k, v in e["fontes"].items() if k in usadas}
    e.setdefault("origem", {})["prefixo_ate"] = ate
    return e


def para_o_projeto(edl: dict, projeto: str, arquivos: list[dict]) -> tuple[dict, list[str]]:
    """Fontes com o mesmo nome de arquivo de um envio do projeto passam a ler a chave do armazenamento do projeto."""
    e = copy.deepcopy(edl)
    e["projeto"] = projeto
    por_nome = {pathlib.Path(a["nome"]).name.lower(): a["chave"] for a in arquivos if a.get("chave")}
    trocadas = []
    for fid, f in e["fontes"].items():
        nome = pathlib.Path(f["chave"]).name.lower()
        if nome in por_nome:
            f["chave"] = por_nome[nome]
            trocadas.append(fid)
    return e, trocadas
