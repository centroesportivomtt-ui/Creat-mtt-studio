"""Etapa MONTAGEM (frente C): EDL -> final.mp4 + mix + stems + overlay, sem LLM e sem código por vídeo.

    montar(edl, trabalho, fontes, cfg) -> relatório (caminhos + tempos por sub-etapa)

Ordem e paralelismo (4 CPUs, ARQUITETURA §8):
  planos (N processos, só os trechos usados do 4K)  ┐
  overlay do kit (beginFrame, N workers)            ├ ao mesmo tempo
  voz + trilha + SFX + mix (numpy)                  ┘
  -> composição + encode com o áudio numa passada.
Idempotente: planos e overlay ficam em cache por hash; o final só é refeito se o EDL mudou.
"""
from __future__ import annotations

import concurrent.futures as cf
import json
import os
import pathlib
import shutil
import sys
import time

from motor import config
from motor.etapas import ErroDefinitivo, etapa
from motor.etapas.montagem import comp as COMP
from motor.etapas.montagem import mix as MIX
from motor.etapas.montagem import overlay as OV
from motor.etapas.montagem import planos as PL
from motor.etapas.montagem import trilha as TR
from motor.etapas.montagem import voz as VZ
from motor.etapas.montagem.comum import Fontes, gravar_json, hash_obj
from motor.provedores import render_roteador as RR

_PY_SCHEMAS = str(config.SCHEMAS / "py")
if _PY_SCHEMAS not in sys.path:
    sys.path.insert(0, _PY_SCHEMAS)

VERSAO = "m1"


def validar_edl(edl: dict) -> None:
    from validar import erros
    e = erros("edl", edl)
    if e:
        raise ErroDefinitivo("EDL inválido: " + "; ".join(e[:5]))
    ids = [p["id"] for p in edl["planos"]]
    if len(ids) != len(set(ids)):
        raise ErroDefinitivo("EDL inválido: id de plano repetido")
    for p in edl["planos"]:
        if p["fonte"] not in edl["fontes"]:
            raise ErroDefinitivo(f"EDL inválido: plano {p['id']} usa fonte '{p['fonte']}' que não está em fontes")
    for v in edl["voz"]:
        if v["fonte"] not in edl["fontes"]:
            raise ErroDefinitivo(f"EDL inválido: voz {v['id']} usa fonte '{v['fonte']}' que não está em fontes")


def montar(edl: dict, trabalho: pathlib.Path, fontes: Fontes, cfg, *, janela: tuple[float, float] | None = None,
           progresso=None, cache_planos: pathlib.Path | None = None) -> dict:
    validar_edl(edl)
    trabalho = pathlib.Path(trabalho)
    trabalho.mkdir(parents=True, exist_ok=True)
    nice = int(getattr(cfg, "nice", 5) or 0)
    workers_ov = max(1, int(getattr(cfg, "render_workers", 3) or 3))
    workers_pl = max(1, min(3, (os.cpu_count() or 4) // 2))
    cache_planos = cache_planos or (pathlib.Path(cfg.dados) / "cache" / "planos")
    tempos: dict = {}
    prog = progresso or (lambda p, m=None: None)

    def cronometro(nome, fn, *a, **k):
        t = time.time()
        r = fn(*a, **k)
        tempos[nome] = round(time.time() - t, 2)
        return r

    def audio():
        voz, rel_voz = cronometro("voz", VZ.montar_voz, edl, fontes, trabalho / "tmp_audio", cfg)
        chave_tr = (edl.get("trilha") or {}).get("chave")
        arq_tr = fontes.arquivo_qualquer(chave_tr) if chave_tr else None
        if arq_tr is not None and not pathlib.Path(arq_tr).exists():
            raise ErroDefinitivo(f"trilha não encontrada: {chave_tr}")
        trilha, rel_tr = cronometro("trilha", TR.montar_trilha, edl, arq_tr)
        sfx, rel_sfx = TR.montar_sfx(edl, getattr(cfg, "som", "") or os.environ.get("MK_SOM"))
        rel_mix = cronometro("mix", MIX.mixar, edl, voz, trilha, sfx, fontes, trabalho / "audio", cfg)
        shutil.rmtree(trabalho / "tmp_audio", ignore_errors=True)
        return {"voz": rel_voz, "trilha": rel_tr, "sfx": rel_sfx, **rel_mix}

    t_ini = time.time()
    prog(0.02, "Montagem: planos, motion e áudio em paralelo")
    with cf.ThreadPoolExecutor(max_workers=2) as ex:
        f_ov = ex.submit(cronometro, "overlay", OV.renderizar, edl, fontes, trabalho / "overlay", workers=workers_ov, janela=janela, nice=nice)
        f_au = ex.submit(audio)
        # planos: CPU ou GPU (Modal) pelo tamanho do filme; GPU indisponível cai na CPU (render_roteador)
        res_pl = cronometro("planos", RR.renderizar_planos, edl, fontes, cache_planos, cfg=cfg, workers=workers_pl, nice=nice,
                            janela=janela, progresso=lambda p, m=None: prog(0.05 + 0.55 * p, m))
        render_planos = RR.renderizar_planos.ultima
        res_ov = f_ov.result()
        res_au = f_au.result()
    prog(0.65, "Composição e encode (vídeo + áudio numa passada)")
    nome = "final.mp4" if not janela else f"trecho_{janela[0]:g}_{janela[1]:g}.mp4"
    res_comp = cronometro("composicao", COMP.compor, edl, res_pl, res_ov.get("dir"), res_au["mix"], trabalho / nome, janela=janela,
                          threads=max(2, int(getattr(cfg, "threads", 2) or 2) + 1), nice=nice,
                          progresso=lambda p, m=None: prog(0.65 + 0.33 * p, m))
    tempos["total"] = round(time.time() - t_ini, 2)
    st = res_ov.get("stats") or {}
    rel = {
        "versao": VERSAO, "edl_hash": hash_obj(edl), "janela": list(janela) if janela else None,
        "final": res_comp["final"], "mix": res_au["mix"], "stems": res_au["stems"], "overlay_dir": res_ov.get("dir"),
        "overlay": {"quadros": st.get("quadros"), "ms_quadro_worker": st.get("ms_quadro"), "ms_quadro_efetivo": st.get("ms_efetivo"),
                    "workers": st.get("workers"), "repetidos": st.get("repetidos"), "captura": st.get("captura"), "cache": res_ov.get("cache")},
        "planos": {k: {"arquivo": v["arquivo"], "cache": v["cache"], **({k2: v["info"][k2] for k2 in ("ms_quadro", "estab", "jit_antes", "jit_depois", "zoom_x")} if v.get("info") else {})}
                   for k, v in res_pl.items()},
        "render_planos": render_planos,
        "audio": {k: v for k, v in res_au.items() if k not in ("stems",)},
        "composicao": res_comp, "tempos": tempos,
    }
    gravar_json(trabalho / "montagem.json", rel)
    prog(1.0, "Montagem pronta")
    return rel


def _gravar(arm, chave: str, origem: pathlib.Path) -> str:
    try:
        return arm.gravar(chave, origem, mover=True)
    except TypeError:
        return arm.gravar(chave, origem)


@etapa("montagem")
def etapa_montagem(ctx) -> dict:
    p, v = ctx.projeto, ctx.alvo or "v1"
    arm = ctx.armazenamento
    if arm is None:
        raise ErroDefinitivo("armazenamento indisponível")
    chave_edl = f"saidas/{p}/{v}/edl.json"
    if not arm.existe(chave_edl):
        raise ErroDefinitivo(f"sem EDL em {chave_edl}")
    edl = json.loads(pathlib.Path(arm.caminho_local(chave_edl)).read_text(encoding="utf-8"))
    trabalho = pathlib.Path(ctx.cfg.dados) / "tmp" / "montagem" / p / v
    chave_rel = f"saidas/{p}/{v}/montagem.json"
    if arm.existe(chave_rel) and arm.existe(f"saidas/{p}/{v}/final.mp4"):
        ant = json.loads(pathlib.Path(arm.caminho_local(chave_rel)).read_text(encoding="utf-8"))
        if ant.get("edl_hash") == hash_obj(edl) and ant.get("versao") == VERSAO:
            return {"versao": v, "reaproveitada": True, "final": f"saidas/{p}/{v}/final.mp4"}
    rel = montar(edl, trabalho, Fontes(edl, arm, ctx.cfg.dados), ctx.cfg, progresso=ctx.progresso)
    base = f"saidas/{p}/{v}"
    _gravar(arm, f"{base}/final.mp4", pathlib.Path(rel["final"]))
    _gravar(arm, f"{base}/mix.wav", pathlib.Path(rel["mix"]))
    for nome, arq in rel["stems"].items():
        _gravar(arm, f"{base}/stems/{nome}.flac", pathlib.Path(arq))
    rel["chaves"] = {"final": f"{base}/final.mp4", "mix": f"{base}/mix.wav", "stems": {n: f"{base}/stems/{n}.flac" for n in rel["stems"]}}
    arm.gravar(chave_rel, _bytes_json(rel))
    ctx.con.execute("UPDATE versoes SET estado='montada', video=? WHERE projeto=? AND id=?", (f"{base}/final.mp4", p, v))
    PL.limpar_cache(pathlib.Path(ctx.cfg.dados) / "cache" / "planos", int(os.environ.get("EDITOR_CACHE_PLANOS_MB", "1200")))
    return {"versao": v, "final": f"{base}/final.mp4", "tempos": rel["tempos"], "overlay_ms_quadro": rel["overlay"]["ms_quadro_efetivo"]}


def _bytes_json(obj):
    import io
    return io.BytesIO(json.dumps(obj, ensure_ascii=False, indent=1).encode("utf-8"))
