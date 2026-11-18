"""Converte os EDLs reais de 17/11 (V1 e V2) para o EDL novo (edl.schema.json) — ARQUITETURA §4.5. Serve de teste da
montagem com material real e de prova de que o contrato novo cobre o que o dono aprovou.

uso:
  python -m motor.ferramentas.edl_legado <drako>/V2/edl.json --saida /tmp/edl_v2.json
  python -m motor.ferramentas.edl_legado <drako>/V2/edl.json --janela 0 8 --render <pasta>    (converte e renderiza o trecho)

V2: edl.json (pecas/segs/vel/km/logo) + planos.json + v2_eventos.json (whips, cues, janelas) + kit/cenas/creat.json (motion).
V1: edl.json (planos em quadros, voz, sfx, fx) + au/m_el.wav (trilha já emendada pelo trilha2.py).
Fontes: um id por arquivo de trecho do índice (seg/indice.json): '<clip>@<ini>'. offset = tempo da fonte no início do arquivo
(V2: ini - 1,135 s, medido por correlação em 17/11; V1: ini - delta de V1/seg_delta.json).
Fica de fora (registrado em origem.pendencias): janelas-aba (PiP) do V2, desfoque de tela por detecção (V2 'tela'),
texto atrás da pessoa (V1 'atras'), dim/blur do V1 e o overlay do V1 (gerado por ov.py, sem cena do kit).
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

DELTA_V2 = 1.135


class Indice:
    def __init__(self, raiz: pathlib.Path, regra: str):
        self.raiz = raiz
        self.idx = json.loads((raiz / "seg" / "indice.json").read_text())
        self.regra = regra
        self.delta = {}
        if regra == "v1" and (raiz / "V1" / "seg_delta.json").exists():
            self.delta = json.loads((raiz / "V1" / "seg_delta.json").read_text())
        self.fontes: dict = {}

    def _off(self, it) -> float:
        if it["ini"] <= 0:
            return 0.0
        return it["ini"] - (DELTA_V2 if self.regra == "v2" else self.delta.get(it["arq"], 0.0))

    def fonte(self, clip: str, t0: float, t1: float | None = None) -> str:
        t1 = t0 if t1 is None else t1
        if clip == "sala":
            fid = "sala"
            self.fontes.setdefault(fid, {"chave": str(self.raiz / "orig" / "sala.mov"), "offset": 0.0})
            return fid
        cands = self.idx.get(clip) or []
        for it in cands:
            fim = it["fim"] if it["fim"] is not None else 1e9
            if self._off(it) - 0.02 <= t0 and fim + 0.02 >= t1:   # o arquivo começa em offset (antes do 'ini' do índice)
                fid = f"{clip}@{int(it['ini'])}"
                self.fontes.setdefault(fid, {"chave": it["arq"], "offset": round(self._off(it), 4)})
                return fid
        # trecho atravessa o fim do arquivo: usa o que contém o início
        for it in cands:
            fim = it["fim"] if it["fim"] is not None else 1e9
            if self._off(it) - 0.02 <= t0 <= fim:
                fid = f"{clip}@{int(it['ini'])}"
                self.fontes.setdefault(fid, {"chave": it["arq"], "offset": round(self._off(it), 4)})
                return fid
        raise KeyError(f"{clip} {t0:.2f}-{t1:.2f} não está em seg/indice.json")


def converter_v2(arq_edl: pathlib.Path) -> dict:
    V = arq_edl.parent
    raiz = V.parent
    E = json.loads(arq_edl.read_text())
    PL = json.loads((V / "planos.json").read_text())
    EV = json.loads((V / "v2_eventos.json").read_text())
    cena = json.loads((V / "kit" / "cenas" / "creat.json").read_text())
    ix = Indice(raiz, "v2")
    fps = float(cena.get("formato", {}).get("fps", 30))
    vel = float(E["vel"])
    segs = {s["id"]: s for s in E["segs"]}
    voz = []
    vistos = set()
    for p in E["pecas"]:
        if "o0" not in p:
            continue
        txt = segs.get(p["seg"], {}).get("texto") if p["seg"] not in vistos else None
        vistos.add(p["seg"])
        voz.append({"id": p["id"], "bloco": p.get("bloco"), "fala": p["seg"], "fonte": ix.fonte(p["clip"], p["s0"], p["s1"]),
                    "s0": p["s0"], "s1": p["s1"], "t0": round(p["o0"], 4), "t1": round(p["o1"], 4), "vel": vel, "ganho_db": 0,
                    "limpeza": {"atenuacao_db": 16, "mistura": 0.8}, "texto": txt})
    planos = []
    for s in PL:
        t0, t1 = s["f0"] / fps, s["f1"] / fps
        s0 = s["ref_s"] + (s["o0"] - s["ref_o"]) * s["vel"]
        s1 = s0 + (t1 - t0) * s["vel"]
        planos.append({"id": s["id"], "bloco": s.get("bloco"), "t0": round(t0, 4), "t1": round(t1, 4), "fonte": ix.fonte(s["clip"], s0, s1),
                       "s0": round(s0, 4), "vel": s["vel"], "enquadre": [[0, s["z0"], s["cx"], s["cy"]], [1, s["z1"], s["cx"], s["cy"]]],
                       "estab": "sim" if s.get("sig") else "nao", "cor": s.get("cor", "neutro")})
    motion = [{"id": c["id"], "modelo": c["modelo"], "de": c["de"], "ate": c["ate"], "props": c["props"]} for c in cena["camadas"]]
    palavras = []
    for c in cena["camadas"]:
        if c["modelo"] == "legenda":
            for w in c["props"].get("palavras", []):
                t = str(w["p"])
                palavras.append([w["i"], w["f"], t.strip("*").rstrip(".,"), 1 if t.startswith("*") else 0])
    beat = 60 / 104.0
    X = 36.9231
    corte = E["km"] * beat * 2
    trilha = raiz / "audio" / "trilha_creat.wav"
    return {
        "versao": "1", "projeto": "legado_v2",
        "origem": {"legado": str(arq_edl), "regra_offset": f"ini - {DELTA_V2}",
                   "pendencias": ["janelas-aba (PiP) não renderizadas na fase 1", "desfoque de tela por detecção (V2 'tela') não convertido",
                                  "voz sem DeepFilterNet nesta máquina (cadeia leve só)"],
                   "janelas": EV.get("janelas", [])},
        "formato": cena.get("formato", {"w": 1080, "h": 1920, "fps": 30}), "duracao": round(float(E["dur"]), 4), "vel_fala": vel,
        "blocos": [], "fontes": ix.fontes, "voz": voz, "planos": planos, "motion": motion,
        "legendas": {"modelo": "legenda", "y": 0.622, "palavras": palavras},
        "fx": [{"tipo": "whip", "t": w["t"], "dur": 10 / fps, "dir": w["dir"]} for w in EV.get("whips", [])],
        "trilha": {"chave": str(trilha), "bpm": 104, "fase": 0,
                   "emendas": [[0.0, 0.0, X, 0.04], [X, X + corte, 150.0, 0.04]],
                   "ganho_db": -16, "ducking": {"db": 9.5, "desce": 0.4, "sobe": 0.55}, "acorde_final": E.get("logo")},
        "sfx": [{"t": c["t"], "som": c["som"], "g": round(c.get("g", -8) - 8, 2), "pan": c.get("pan", 0.0)} for c in EV.get("cues", [])],
        "tom_sala": None, "master": {"lufs": -14, "tp": -1.0, "crf": 17},
        "qa": {"logos": [], "falas_confirmadas": [], "riscos": []},
    }


def converter_v1(arq_edl: pathlib.Path) -> dict:
    V = arq_edl.parent
    raiz = V.parent
    E = json.loads(arq_edl.read_text())
    ix = Indice(raiz, "v1")
    fps = float(E.get("fps", 30))
    voz = [{"id": v["id"], "fonte": ix.fonte(v["clip"], v["s0"], v["s1"]), "s0": v["s0"], "s1": v["s1"], "t0": round(v["t"], 4),
            "t1": round(v["t"] + (v["s1"] - v["s0"]) / v.get("sp", 1.0), 4), "vel": v.get("sp", 1.0), "ganho_db": v.get("g", 0.0)}
           for v in E["voz"]]
    planos, pend = [], set()
    for s in E["planos"]:
        if s.get("clip") is None:
            continue
        t0, t1 = s["f0"] / fps, s["f1"] / fps
        dur = max(1e-3, t1 - t0)
        sp = s.get("sp", 1.0)
        ts = s.get("ts")
        smin = min(k[1] for k in ts) if ts else s["s0"]
        smax = max(k[1] for k in ts) if ts else s["s0"] + dur * sp
        p = {"id": s["id"], "t0": round(t0, 4), "t1": round(t1, 4), "fonte": ix.fonte(s["clip"], smin, smax), "s0": s["s0"] if not ts else ts[0][1],
             "vel": sp, "enquadre": [k if len(k) == 4 else [k[0], k[1], 0.5, 0.5] for k in s.get("kf", [[0, 1.0, .5, .5], [1, 1.035, .5, .5]])],
             "estab": "sim" if s.get("stab", 14) else "nao", "cor": s.get("grade", "salao"),
             "som_direto_db": s.get("nat"), "mblur": bool(s.get("mblur", sp > 1.6))}
        if ts:
            p["rampa"] = [[k[0], k[1]] for k in ts]
        if s.get("flash"):
            p["flash"] = [[a / dur, du, st] for a, st, du in s["flash"]]
        if s.get("shake"):
            p["tremor"] = [[a / dur, du, amp / 40] for a, amp, du in s["shake"]]
        for k in ("atras", "dim", "blur", "blend"):
            if s.get(k):
                pend.add(f"V1 '{k}' não convertido")
        planos.append(p)
    tipos_ok = {"whip", "mascara", "aba71", "impacto", "bloom", "leak", "zoomt", "gagueira", "rush", "foto", "flash", "match", "fade"}
    fx = [{"tipo": f["tipo"], "t": f["t"], **({"forca": f["forca"]} if "forca" in f else {}), **({"dur": f["dur"]} if "dur" in f else {})}
          for f in E.get("fx", []) if f.get("tipo") in tipos_ok]
    trilha = V / "au" / "m_el.wav"
    return {
        "versao": "1", "projeto": "legado_v1",
        "origem": {"legado": str(arq_edl), "pendencias": sorted(pend) + ["overlay do V1 (ov.py) sem cena do kit: motion vazio"]},
        "formato": {"w": 1080, "h": 1920, "fps": fps}, "duracao": round(float(E["dur"]), 4), "vel_fala": 1.0, "blocos": [],
        "fontes": ix.fontes, "voz": voz, "planos": planos, "motion": [], "legendas": {"palavras": []}, "fx": fx,
        "trilha": {"chave": str(trilha) if trilha.exists() else None, "bpm": 140, "fase": 0, "emendas": [], "ganho_db": -16,
                   "ducking": {"db": 9.0, "desce": 0.4, "sobe": 0.55}},
        "sfx": [{"t": c["t"], "som": c["som"], "g": round(c.get("g", -8) - 8, 2), "pan": c.get("pan", 0.0)} for c in E.get("sfx", [])],
        "tom_sala": None, "master": {"lufs": -14, "tp": -1.0, "crf": 17}, "qa": {"logos": [], "falas_confirmadas": [], "riscos": []},
    }


def converter(arq_edl: pathlib.Path | str) -> dict:
    arq_edl = pathlib.Path(arq_edl)
    if (arq_edl.parent / "planos.json").exists() and (arq_edl.parent / "v2_eventos.json").exists():
        return converter_v2(arq_edl)
    return converter_v1(arq_edl)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="EDL de 17/11 (V1/V2) -> EDL novo")
    ap.add_argument("edl")
    ap.add_argument("--saida")
    ap.add_argument("--janela", nargs=2, type=float)
    ap.add_argument("--render")
    a = ap.parse_args(argv)
    from motor import config
    sys.path.insert(0, str(config.SCHEMAS / "py"))
    from validar import erros
    edl = converter(a.edl)
    e = erros("edl", edl)
    print(f"{len(edl['planos'])} planos, {len(edl['voz'])} peças de voz, {len(edl['motion'])} camadas, {len(edl['sfx'])} SFX, "
          f"{len(edl['fontes'])} fontes; schema: {'OK' if not e else e[:3]}")
    if a.saida:
        pathlib.Path(a.saida).write_text(json.dumps(edl, ensure_ascii=False, indent=1))
    if a.render:
        from motor.etapas.montagem import montar
        from motor.etapas.montagem.comum import Fontes
        cfg = config.carregar()
        rel = montar(edl, pathlib.Path(a.render), Fontes(edl, None, cfg.dados), cfg, janela=tuple(a.janela) if a.janela else None)
        print(json.dumps({"final": rel["final"], "tempos": rel["tempos"], "overlay": rel["overlay"]}, ensure_ascii=False, indent=1))
    return 1 if e else 0


if __name__ == "__main__":
    sys.exit(main())
