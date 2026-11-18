"""Cérebro fixture com EDL pronto (testes ponta a ponta e demonstração, sem custo de token).

    EDITOR_CEREBRO=fixture  EDITOR_CEREBRO_EDL=<edl.json>  [EDITOR_CEREBRO_EDL_ATE=15.23]

A "resposta do cérebro" é um EDL já aprovado (o V2 de 17/11, por exemplo). Se for um EDL legado (V1/V2), é convertido
por ferramentas.edl_legado. Com _ATE, vale o começo do filme até ATE e, colado nele, o FECHO original (a cauda depois
do último plano: pilha, transição e logo com @creat.mtt) — um "corte curto" que ainda termina com o convite. As fontes cujo arquivo tem o mesmo nome de um arquivo enviado ao projeto passam a ler do
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


def cauda_padrao(edl: dict) -> float | None:
    """Início do fecho: fim do último plano, quando o filme termina só com motion (pilha/transição/logo)."""
    fim_planos = max((p["t1"] for p in edl["planos"]), default=0.0)
    tem_fecho = any(m["modelo"].startswith("fecho") and m["de"] >= fim_planos - 0.5 for m in edl.get("motion", []))
    return round(fim_planos, 4) if tem_fecho and fim_planos < edl["duracao"] - 0.5 else None


def corte_curto(edl: dict, ate: float, cauda: float | None = None) -> dict:
    """Começo [0, ate] + cauda [cauda, fim] deslocada para começar em ate. Sem cauda (filme sem fecho), é só o prefixo."""
    cauda = cauda_padrao(edl) if cauda is None else cauda
    ate = float(ate)
    if cauda is None or cauda <= ate:
        return prefixo(edl, ate)
    orig = edl
    e = prefixo(orig, ate)
    d = ate - cauda                                     # deslocamento (negativo) da cauda
    dentro = lambda t: t >= cauda - 0.05               # noqa: E731
    e["duracao"] = round(orig["duracao"] + d, 4)
    e["planos"] += [dict(p, t0=round(p["t0"] + d, 4), t1=round(p["t1"] + d, 4)) for p in orig["planos"] if dentro(p["t0"])]
    e["voz"] += [dict(v, t0=round(v["t0"] + d, 4), t1=round(v["t1"] + d, 4)) for v in orig.get("voz", []) if dentro(v["t0"])]
    for m in orig.get("motion", []):
        if not dentro(m["de"]):
            continue
        m = copy.deepcopy(m)
        m["de"], m["ate"] = round(m["de"] + d, 4), round(m["ate"] + d, 4)
        if m["modelo"] == "legenda":
            for w in m["props"].get("palavras", []):
                for k in ("i", "f"):
                    if k in w:
                        w[k] = round(w[k] + d, 4)
        e["motion"].append(m)
    if isinstance(e.get("legendas"), dict):
        e["legendas"]["palavras"] += [[round(w[0] + d, 4), round(w[1] + d, 4), *w[2:]] for w in orig["legendas"].get("palavras", []) if dentro(w[0])]
    e["sfx"] += [dict(x, t=round(x["t"] + d, 4)) for x in orig.get("sfx", []) if dentro(x["t"])]
    e["fx"] += [dict(x, t=round(x["t"] + d, 4)) for x in orig.get("fx", []) if "t" in x and dentro(x["t"])]
    tr = e.get("trilha")
    if isinstance(tr, dict) and tr.get("emendas"):
        # música: até ATE como estava; em ATE, emenda no ponto da música que tocava no começo da cauda (o acorde final cai na logo)
        seg = [x for x in tr["emendas"] if x[0] <= cauda][-1]
        s_c = seg[1] + (cauda - seg[0])
        tr["emendas"] = [x for x in tr["emendas"] if x[0] < ate] + [[round(ate, 4), round(s_c, 4), seg[2], 0.04]]
        if tr.get("acorde_final"):
            tr["acorde_final"] = round(tr["acorde_final"] + d, 4)
    usadas = {p["fonte"] for p in e["planos"]} | {v["fonte"] for v in e["voz"]}
    e["fontes"] = {k: v for k, v in orig["fontes"].items() if k in usadas}
    e["origem"]["corte_curto"] = {"ate": ate, "cauda": cauda}
    return e
