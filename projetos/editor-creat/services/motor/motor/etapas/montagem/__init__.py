"""Etapa MONTAGEM (frente C): EDL -> final.mp4 + mix + stems + overlay, sem LLM e sem código por vídeo.

    montar(edl, trabalho, fontes, cfg) -> relatório (caminhos + tempos por sub-etapa)

Ordem e paralelismo (4 CPUs, ARQUITETURA §8):
  planos (N processos, só os trechos usados do 4K)  ┐
  overlay do kit (beginFrame, N workers)            ├ ao mesmo tempo
  voz + trilha + SFX + mix (numpy)                  ┘
  -> composição + encode com o áudio numa passada.
Idempotente: planos e overlay ficam em cache por hash; o final só é refeito se o EDL ou o código do kit mudou.
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
from motor.etapas import ErroDefinitivo, etapa, passos
from motor.etapas import cor as CR
from motor.etapas import fatos
from motor.etapas import pessoa as PESSOA
from motor.etapas.montagem import comp as COMP
from motor.etapas.montagem import fx as FX
from motor.etapas.montagem import mix as MIX
from motor.etapas.montagem import overlay as OV
from motor.etapas.montagem import planos as PL
from motor.etapas.montagem import reais as REAIS
from motor.etapas.montagem import trilha as TR
from motor.etapas.montagem import voz as VZ
from motor.etapas.montagem.comum import SR, Fontes, gravar_json, hash_obj

_PY_SCHEMAS = str(config.SCHEMAS / "py")
if _PY_SCHEMAS not in sys.path:
    sys.path.insert(0, _PY_SCHEMAS)

VERSAO = "m1"
STEMS_PRIVADOS = ("reais",)          # nunca vão para o armazenamento (licença dos sons do banco)


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
    pr = FX.problemas(edl)                                   # revela/salto: o que quebraria calado no render
    if pr:
        raise ErroDefinitivo("EDL inválido: " + "; ".join(pr[:5]))


def montar(edl: dict, trabalho: pathlib.Path, fontes: Fontes, cfg, *, janela: tuple[float, float] | None = None,
           progresso=None, cache_planos: pathlib.Path | None = None, sons_reais: dict | None = None) -> dict:
    """`sons_reais` = relatório de `motor.sons_reais.preparar` (a etapa chama antes; aqui não há rede)."""
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
        arquivos = {}
        for f in (edl.get("trilha") or {}).get("faixas") or []:   # filme com 2 ou 3 músicas (M4): cada uma pela sua chave
            a = fontes.arquivo_qualquer(f["chave"])
            if not pathlib.Path(a).exists():
                raise ErroDefinitivo(f"trilha não encontrada: {f['chave']}")
            arquivos[f["chave"]] = a
        trilha, rel_tr = cronometro("trilha", TR.montar_trilha, edl, arq_tr, arquivos)
        from motor import biblioteca as BIB
        sfx, rel_sfx = TR.montar_sfx(edl, getattr(cfg, "som", "") or os.environ.get("MK_SOM") or str(BIB.pasta_sfx(cfg)))
        pista, rel_reais = None, None
        if edl.get("sons_reais"):                           # som real (M6): só o que já está no cache, nunca a rede
            from motor import sons_reais as SONS
            try:
                carregados = SONS.carregar(edl, cfg)
            except Exception as e:  # noqa: BLE001 - cache ilegível não derruba o filme: sai sem os sons reais
                carregados, rel_reais = [], {"sons": [], "erro": f"{type(e).__name__}: {str(e)[:120]}"}
            if carregados:
                try:
                    pista, rel_reais = REAIS.pista(edl, carregados, int(round(edl["duracao"] * SR)))
                except Exception as e:  # noqa: BLE001 - conta que quebra na pista não derruba o áudio: sai sem os sons reais
                    pista, rel_reais = None, {"sons": [], "erro": f"{type(e).__name__}: {str(e)[:120]}"}
            rel_reais = rel_reais or {"sons": []}
        rel_mix = cronometro("mix", MIX.mixar, edl, voz, trilha, sfx, fontes, trabalho / "audio", cfg, reais=pista)
        shutil.rmtree(trabalho / "tmp_audio", ignore_errors=True)
        return {"voz": rel_voz, "trilha": rel_tr, "sfx": rel_sfx, **({"reais": rel_reais} if rel_reais is not None else {}), **rel_mix}

    t_ini = time.time()
    prog(0.02, "Montagem: planos, motion e áudio em paralelo")
    # mesa ao vivo: as quatro mãos trabalham ao mesmo tempo; os passos abrem e fecham daqui (a thread do job), com o tempo
    # medido de cada parte pelo cronômetro. Fora de job (testes), nada é emitido.
    n_voz, n_pl, n_mo = len(edl.get("voz") or []), len(edl.get("planos") or []), len(edl.get("motion") or [])
    with cf.ThreadPoolExecutor(max_workers=2) as ex:
        tem_atras = any(m.get("atras") for m in edl.get("motion", []))
        w_at = max(1, workers_ov // 3) if tem_atras else 0     # a camada de trás é curta (o gancho): poucos navegadores para ela
        ps_ov = passos.inicio("montagem.overlay", ferramenta="Chromium + kit de motion da casa, quadro a quadro", n=n_mo)
        f_ov = ex.submit(cronometro, "overlay", OV.renderizar, edl, fontes, trabalho / "overlay", workers=max(1, workers_ov - w_at),
                         janela=janela, nice=nice, atras=False if tem_atras else None)
        f_at = ex.submit(cronometro, "overlay_atras", OV.renderizar, edl, fontes, trabalho / "overlay", workers=w_at,
                         janela=janela, nice=nice, atras=True) if tem_atras else None
        ps_au = passos.inicio("montagem.voz", ferramenta="DeepFilterNet3 (limpeza com IA, local) + nivelamento", n=n_voz)
        f_au = ex.submit(audio)
        ps_pl = passos.inicio("montagem.planos", ferramenta="ffmpeg: cor por ambiente, estabilização e enquadre", n=n_pl)
        res_pl = cronometro("planos", PL.renderizar, edl, fontes, cache_planos, workers=workers_pl, nice=nice, janela=janela,
                            progresso=lambda p, m=None: prog(0.05 + 0.55 * p, m))
        do_cache = sum(1 for v in res_pl.values() if v.get("cache"))
        ps_pl.achou(f"{len(res_pl)} planos com cor e enquadre" + (f" ({do_cache} já estavam prontos)" if do_cache else ""))
        passos.fim(ps_pl, s=tempos.get("planos"))
        res_ov = f_ov.result()
        res_at = f_at.result() if f_at else {}
        st_ov = res_ov.get("stats") or {}
        ps_ov.anotar(quadros=st_ov.get("quadros")).achou(f"{n_mo} camadas de legenda e motion" + (f" em {st_ov['quadros']} quadros" if st_ov.get("quadros") else ""))
        passos.fim(ps_ov, s=round(tempos.get("overlay", 0) + tempos.get("overlay_atras", 0), 2) or None)
        res_au = f_au.result()
        ps_au.achou(f"{n_voz} trecho{'s' if n_voz != 1 else ''} de fala limpo{'s' if n_voz != 1 else ''} e nivelado{'s' if n_voz != 1 else ''}" if n_voz else "Filme sem fala: só a trilha")
        passos.fim(ps_au, s=tempos.get("voz"))
        ps_mx = passos.inicio("montagem.mix", ferramenta="mixagem do editor (ducking da música sob a fala, -14 LUFS)")
        ps_mx.anotar(lufs=res_au.get("lufs"), margem_db=res_au.get("voz_sobre_cama_db")).achou(_achado_mix(edl, res_au))
        passos.fim(ps_mx, s=round(tempos.get("trilha", 0) + tempos.get("mix", 0), 2))
    prog(0.65, "Composição e encode (vídeo + áudio numa passada)")
    nome = "final.mp4" if not janela else f"trecho_{janela[0]:g}_{janela[1]:g}.mp4"
    Q = round(float(edl.get("duracao") or 0) * float((edl.get("formato") or {}).get("fps") or 30)) if isinstance(edl.get("formato"), dict) else None
    with passos.passo("montagem.comp", ferramenta="ffmpeg (libx264), vídeo e áudio numa passada", Q=Q) as ps_cp:
        res_comp = cronometro("composicao", COMP.compor, edl, res_pl, res_ov.get("dir"), res_au["mix"], trabalho / nome, janela=janela,
                              threads=max(2, int(getattr(cfg, "threads", 2) or 2) + 1), nice=nice,
                              progresso=lambda p, m=None: prog(0.65 + 0.33 * p, m), dir_overlay_atras=res_at.get("dir"),
                              recortador=PESSOA.recortador_para(edl, cfg))
        ps_cp.anotar(Q=res_comp.get("quadros"))
        ps_cp.achou(f"{res_comp.get('quadros')} quadros compostos" + (f", {res_comp['quadros_sem_plano']} sem plano" if res_comp.get("quadros_sem_plano") else ""))
    tempos["total"] = round(time.time() - t_ini, 2)
    cor = revisao_cor(edl, res_pl, trabalho / "cor")
    st = res_ov.get("stats") or {}
    rel = {
        "versao": VERSAO, "edl_hash": hash_obj(edl), "kit": OV._versao_kit(), "janela": list(janela) if janela else None,
        "final": res_comp["final"], "mix": res_au["mix"], "stems": res_au["stems"], "overlay_dir": res_ov.get("dir"),
        "overlay": {"quadros": st.get("quadros"), "ms_quadro_worker": st.get("ms_quadro"), "ms_quadro_efetivo": st.get("ms_efetivo"),
                    "workers": st.get("workers"), "repetidos": st.get("repetidos"), "captura": st.get("captura"), "cache": res_ov.get("cache")},
        "planos": {k: {"arquivo": v["arquivo"], "cache": v["cache"], **({k2: v["info"][k2] for k2 in ("ms_quadro", "estab", "jit_antes", "jit_depois", "zoom_x")} if v.get("info") else {})}
                   for k, v in res_pl.items()},
        "audio": {k: v for k, v in res_au.items() if k not in ("stems",)},
        "cor": cor, "avisos_cor": [f"{c['plano']}: {c['saturacao']['aviso']}" for c in cor if (c.get("saturacao") or {}).get("aviso")],
        "avisos_trilha": list((res_au.get("trilha") or {}).get("avisos") or []),   # música que acabou antes do filme (M4)
        "composicao": res_comp, "tempos": tempos,
    }
    if edl.get("sons_reais"):
        rel["sons_reais"] = _sons_no_relatorio(edl, sons_reais, res_au.get("reais"))
    gravar_json(trabalho / "montagem.json", rel)
    prog(1.0, "Montagem pronta")
    return rel


def pode_reaproveitar(ant: dict, edl: dict) -> bool:
    """montagem.json antigo vale se o EDL, a versão e o kit são os mesmos E nenhum som real ficou pendente por rede (com
    pendência, a próxima montagem tenta baixar de novo; senão o filme sem som seria reaproveitado para sempre)."""
    return (ant.get("edl_hash") == hash_obj(edl) and ant.get("versao") == VERSAO and ant.get("kit") == OV._versao_kit()
            and int((ant.get("sons_reais") or {}).get("pendentes") or 0) == 0)


def _sons_no_relatorio(edl: dict, preparo: dict | None, mixados: dict | None) -> dict:
    """montagem.json.sons_reais: o que entrou (metadado, nunca áudio), o que faltou e por quê, pendências e a licença.

    Item que a preparação deixou pronto e que NÃO entrou na mixagem (o cache perdeu o arquivo no meio, a pista quebrou) fica
    pendente: senão a montagem seria reaproveitada para sempre sem o som. O descartado por nível (quase mudo) não é pendente."""
    from motor import sons_reais as SONS
    prep = preparo or {}
    mix = {m["id"]: m for m in (mixados or {}).get("sons") or []}
    por_id = {x["id"]: x for x in prep.get("itens") or []}
    itens = []
    for it in edl.get("sons_reais") or []:
        if it["id"] not in mix:
            continue
        x = por_id.get(it["id"], {})
        itens.append({"id": it["id"], "papel": it["papel"], "desc": it["desc"], "id_banco": mix[it["id"]]["id_banco"],
                      "item": x.get("item", it["item"]), "pacote": x.get("pacote", it["pacote"]), "biblioteca": x.get("biblioteca", it["biblioteca"]),
                      "nome": x.get("nome", it["nome"]), "url": x.get("url", it["url"]), "t0": it["t0"], "t1": it["t1"],
                      "origem": x.get("origem", "cache"), "verificacao": x.get("verificacao"), "voz": x.get("voz"),
                      "ganho_db": mix[it["id"]].get("ganho_db")})
    entrou = {x["id"] for x in itens}
    faltaram = list(prep.get("faltaram") or [])
    descartados = {d["id"]: d for d in (mixados or {}).get("descartados") or []}
    erro_pista = (mixados or {}).get("erro")
    for it in edl.get("sons_reais") or []:
        if it["id"] in entrou or any(f["id"] == it["id"] for f in faltaram):
            continue
        if it["id"] in descartados:
            faltaram.append({"id": it["id"], "desc": it["desc"], "motivo": descartados[it["id"]]["motivo"], "pendente": False})
        elif preparo is None:
            faltaram.append({"id": it["id"], "desc": it["desc"], "motivo": "não está no cache (a preparação não rodou)", "pendente": True})
        else:
            motivo = f"a pista quebrou ({erro_pista})" if erro_pista else "estava pronto e sumiu do cache antes da mixagem"
            faltaram.append({"id": it["id"], "desc": it["desc"], "motivo": motivo, "pendente": True})
    return {"itens": itens, "faltaram": faltaram, "pendentes": sum(1 for f in faltaram if f.get("pendente")),
            "sem_som_na_direcao": ((edl.get("origem") or {}).get("sons_reais") or {}).get("sem_som") or [],
            "pedidos_http": prep.get("pedidos_http", 0), "bytes": prep.get("bytes", 0), "avisos": list(prep.get("avisos") or []),
            "licenca": dict(prep.get("licenca") or SONS.LICENCA)}
def _mmss(t: float) -> str:
    return f"{int(t) // 60}:{int(t) % 60:02d}"


def _achado_sons(ps, sons: dict, pedidos: int) -> None:
    """'3 de 4 sons reais prontos (8,5 MB); 1 ficou de fora.' Só números da preparação; o motivo de cada um fica no relatório."""
    prontos, fora = len(sons.get("itens") or []), len(sons.get("faltaram") or [])
    mb = round((sons.get("bytes") or 0) / 1e6, 1)
    ps.anotar(prontos=prontos, fora=fora, mb=mb)
    txt = f"{prontos} de {pedidos} sons reais prontos" + (f" ({str(mb).replace('.', ',')} MB baixados)" if mb else "")
    if fora:
        txt += f"; {fora} ficou de fora" if fora == 1 else f"; {fora} ficaram de fora"
    ps.achou(txt + ".")


def _achado_mix(edl: dict, res_au: dict) -> str:
    """'Música 9 dB abaixo da fala, -14,1 LUFS; a 2ª música entra aos 0:42.' Números da mixagem, nunca do modelo."""
    partes = []
    if isinstance(res_au.get("voz_sobre_cama_db"), (int, float)):
        partes.append(f"Fala {res_au['voz_sobre_cama_db']:.0f} dB acima da música")
    if isinstance(res_au.get("lufs"), (int, float)):
        partes.append(f"{res_au['lufs']:.1f} LUFS".replace(".", ","))
    tr = edl.get("trilha") or {}
    faixas = tr.get("faixas") or []
    for i, f in enumerate(faixas[1:], 2):
        t = f.get("troca_em", f.get("entra_em"))
        if isinstance(t, (int, float)):
            partes.append(f"a {i}ª música entra aos {_mmss(t)}")
    if isinstance(tr.get("acorde_final"), (int, float)):
        partes.append(f"o acorde final cai aos {_mmss(tr['acorde_final'])}")
    if not tr.get("chave") and not faixas:
        partes.append("sem música")
    return "; ".join(partes) or "Mix pronto"


def revisao_cor(edl: dict, res_pl: dict, pasta: pathlib.Path) -> list[dict]:
    """Antes/depois da cor por plano (quadro do meio + medição), na ordem do filme, para a revisão do dono e o QA."""
    shutil.rmtree(pasta, ignore_errors=True)
    out = []
    for p in edl["planos"]:
        r = res_pl.get(p["id"])
        info = PL.ler_antes_depois(r["arquivo"]) if r else None
        if not info:
            continue
        pasta.mkdir(parents=True, exist_ok=True)
        item = {"plano": p["id"], "t0": p["t0"], "t1": p["t1"], "look": info["look"], "look_nome": info["look_nome"],
                "balanco": info.get("balanco"), "antes": info["antes"], "depois": info["depois"],
                "saturacao": CR.checar_saturacao(info["antes"], info["depois"], info["look"])}   # cor viva: antes/depois e aviso
        for lado in ("antes", "depois"):
            destino = pasta / f"{p['id']}_{lado}.jpg"
            shutil.copyfile(info[f"{lado}_jpg"], destino)
            item[f"{lado}_jpg"] = str(destino)
        out.append(item)
    if out:
        gravar_json(pasta / "cor.json", out)
    return out


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
    # verificação de fatos (regra do dono): número errado na fala sai CERTO na tela; relatório em edl.qa.fatos
    antes = hash_obj(edl)
    with passos.passo("montagem.fatos", ferramenta="Claude com busca na web (fonte oficial) e leitura do rótulo nos quadros") as ps_ft:
        rel_ft = fatos.revisar(edl, ctx.cfg, Fontes(edl, arm, ctx.cfg.dados), contexto=_contexto(ctx, arm, p), projeto=p, trabalho=trabalho / "fatos")
        _achado_fatos(ps_ft, rel_ft or {})
    if hash_obj(edl) != antes:
        arm.gravar(chave_edl, _bytes_json(edl))
    chave_rel = f"saidas/{p}/{v}/montagem.json"
    if arm.existe(chave_rel) and arm.existe(f"saidas/{p}/{v}/final.mp4"):
        ant = json.loads(pathlib.Path(arm.caminho_local(chave_rel)).read_text(encoding="utf-8"))
        if pode_reaproveitar(ant, edl):
            return {"versao": v, "reaproveitada": True, "final": f"saidas/{p}/{v}/final.mp4"}
    sons = None
    if edl.get("sons_reais"):                               # a rede só é usada AQUI, antes do render (M6); falha = aviso
        from motor import sons_reais as SONS
        ctx.progresso(0.01, f"Montagem: buscando {len(edl['sons_reais'])} som(ns) real(is) do banco")
        # mesa ao vivo: o dono vê a busca dos sons reais como um passo (quantos entraram, quantos ficaram de fora e o tamanho)
        with passos.passo("montagem.sons", ferramenta="banco de sons reais da casa (gravações livres do archive.org), baixados e conferidos",
                          n=len(edl["sons_reais"])) as ps_sr:
            try:
                sons = SONS.preparar(edl, ctx.cfg)
            except Exception as e:  # noqa: BLE001 - nada dos sons reais derruba a montagem
                sons = {"itens": [], "faltaram": [{"id": it["id"], "desc": it["desc"], "motivo": f"preparação quebrou ({type(e).__name__})", "pendente": True}
                                                  for it in edl["sons_reais"]], "pendentes": len(edl["sons_reais"]), "avisos": [], "licenca": SONS.LICENCA}
            _achado_sons(ps_sr, sons, len(edl["sons_reais"]))
    rel = montar(edl, trabalho, Fontes(edl, arm, ctx.cfg.dados), ctx.cfg, progresso=ctx.progresso, sons_reais=sons)
    base = f"saidas/{p}/{v}"
    _gravar(arm, f"{base}/final.mp4", pathlib.Path(rel["final"]))
    _gravar(arm, f"{base}/mix.wav", pathlib.Path(rel["mix"]))
    publicos = {n: a for n, a in rel["stems"].items() if n not in STEMS_PRIVADOS}
    for nome, arq in publicos.items():
        _gravar(arm, f"{base}/stems/{nome}.flac", pathlib.Path(arq))
    rel["chaves"] = {"final": f"{base}/final.mp4", "mix": f"{base}/mix.wav", "stems": {n: f"{base}/stems/{n}.flac" for n in publicos}}
    # o stem `reais` é o som do banco ISOLADO: a licença proíbe redistribuir som solto. Fica só no disco de trabalho (o QA
    # ouve dali; a entrega apaga a pasta), nunca no armazenamento, que é servido e vai para o R2
    privados = {n: a for n, a in rel["stems"].items() if n in STEMS_PRIVADOS}
    if privados:
        rel["stems_locais"] = privados
    for item in rel.get("cor") or []:                       # revisão da cor: imagens e medição ao lado do vídeo
        for lado in ("antes", "depois"):
            chave = f"{base}/cor/{item['plano']}_{lado}.jpg"
            _gravar(arm, chave, pathlib.Path(item.pop(f"{lado}_jpg")))
            item[lado + "_chave"] = chave
    if rel.get("cor"):
        arm.gravar(f"{base}/cor.json", _bytes_json(rel["cor"]))
        rel["chaves"]["cor"] = f"{base}/cor.json"
    arm.gravar(chave_rel, _bytes_json(rel))
    ctx.con.execute("UPDATE versoes SET estado='montada', video=? WHERE projeto=? AND id=?", (f"{base}/final.mp4", p, v))
    PL.limpar_cache(pathlib.Path(ctx.cfg.dados) / "cache" / "planos", int(os.environ.get("EDITOR_CACHE_PLANOS_MB", "1200")))
    return {"versao": v, "final": f"{base}/final.mp4", "tempos": rel["tempos"], "overlay_ms_quadro": rel["overlay"]["ms_quadro_efetivo"]}


def _achado_fatos(ps, rel: dict) -> None:
    """'275 ml confere; 1 número corrigido na tela' com os números do relatório (edl.qa.fatos)."""
    est = rel.get("estado")
    itens = rel.get("itens") or []
    trecho = {a.get("id"): a.get("trecho") for a in rel.get("alegacoes") or []}
    conta = {k: sum(1 for i in itens if i.get("status") == k) for k in ("confirmado", "corrigido", "sem_fonte")}
    ps.anotar(n=len(rel.get("alegacoes") or itens), confere=conta["confirmado"], corrigidos=conta["corrigido"], sem_fonte=conta["sem_fonte"])
    if est in (None, "sem_numeros"):
        ps.achou("Nenhum número na tela para conferir")
    elif est == "desligado":
        ps.achou("Conferência de números desligada neste motor")
    elif est == "nao_conferido":
        ps.achou("Números não conferidos: o motor está sem a chave do cérebro")
    else:
        ex = next((trecho.get(i.get("id")) for i in itens if i.get("status") == "confirmado" and trecho.get(i.get("id"))), None)
        partes = [f"{ex} confere" if ex else f"{conta['confirmado']} confere{'m' if conta['confirmado'] != 1 else ''}"]
        if conta["corrigido"]:
            partes.append(f"{conta['corrigido']} corrigido{'s' if conta['corrigido'] != 1 else ''} na tela")
        if conta["sem_fonte"]:
            partes.append(f"{conta['sem_fonte']} sem fonte (segura a entrega)")
        ps.achou("; ".join(partes))


def _contexto(ctx, arm, p: str) -> str:
    """Nome do projeto + pedido do cliente: o preço e a oferta da loja se confirmam por ele."""
    try:
        nome = (ctx.con.execute("SELECT nome FROM projetos WHERE id=?", (p,)).fetchone() or {"nome": ""})["nome"]
    except Exception:  # noqa: BLE001
        nome = ""
    pedido = ""
    try:
        if arm.existe(f"projetos/{p}/pedido.json"):
            ped = arm.ler_json(f"projetos/{p}/pedido.json")
            pedido = " | ".join(str(ped.get(k) or "") for k in ("texto", "cliente", "obrigatorio") if ped.get(k))
    except Exception:  # noqa: BLE001 - sem pedido legível: confere só pelo produto
        pass
    return f"Projeto: {nome}. Pedido do cliente: {pedido[:1500] or '(sem pedido)'}"


def _bytes_json(obj):
    import io
    return io.BytesIO(json.dumps(obj, ensure_ascii=False, indent=1).encode("utf-8"))
