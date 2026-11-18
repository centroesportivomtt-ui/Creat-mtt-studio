"""Etapa 'direcao' (frente B): catálogo + pedido + memória (+ relatório do QA / reprovação do dono) -> direção -> EDL.

Fluxo por versão (ARQUITETURA.md §3, §7):
  1. prompt = sistema (diretor.md + regras + modelos + casos) | catálogo (prefixo em cache) | pedido (+ correções)
  2. diretor (cérebro) -> direção validada no schema e no orçamento (<= 4k tokens)
  3. resolvedor -> EDL; os problemas e avisos dele vão para o crítico (2a chamada, mesmo prefixo em cache)
  4. crítico -> direção revisada; resolve de novo (se piorar, fica a primeira que resolveu)
  5. grava projetos/<p>/direcao_<n>.json, uso_<n>.json e saidas/<p>/v<n>/edl.json; registra a versão no banco
Idempotente: a mesma entrada (catálogo + pedido + correção) devolve a versão já feita, sem chamar o cérebro de novo.
"""
from __future__ import annotations

import hashlib
import json

from motor import banco
from motor.cerebro import orcamento, prompts_texto
from motor.etapas import ErroDefinitivo, armazem_b, etapa
from motor.etapas.resolvedor import ErroResolucao, resolver
from motor.memoria.loja import Loja


def montar_prompt(loja: Loja, catalogo_txt: str, pedido: dict, *, correcao: dict | None = None) -> tuple[str, str, str]:
    """Devolve (sistema, catalogo_txt, pedido_txt). Sistema e catálogo são estáveis (cache); o pedido vem por último."""
    tipo = (pedido or {}).get("tipo_video") or "auto"
    sistema = (prompts_texto("diretor").replace("{regras}", loja.regras_para_prompt(tipo)).replace("{modelos}", loja.modelos_para_prompt())
               .replace("{casos}", loja.casos_para_prompt(tipo) or "- nenhum ainda"))
    p = pedido or {}
    linhas = [f"PEDIDO: {p.get('texto', '').strip()}"]
    for campo, rotulo in (("tipo_video", "tipo"), ("duracao_alvo", "duração alvo (s)"), ("destino", "destino"), ("formato", "formato"),
                          ("cliente", "cliente"), ("obrigatorio", "obrigatório"), ("proibido", "proibido")):
        v = p.get(campo)
        if v not in (None, "", [], "auto"):
            linhas.append(f"{rotulo}: {', '.join(map(str, v)) if isinstance(v, list) else v}")
    if correcao:
        if correcao.get("reprovacao"):
            linhas.append(f"O DONO REPROVOU a versão {correcao.get('versao_anterior')}: «{correcao['reprovacao']}». Corrija isso na nova direção.")
        if correcao.get("corrigir_qa"):
            qa = correcao["corrigir_qa"]
            falhas = [c for c in qa.get("checagens", []) if not c.get("ok", True)] if isinstance(qa, dict) else []
            resumo = "; ".join(f"{c.get('nome') or c.get('id')}: {c.get('detalhe', '')}" for c in falhas) or json.dumps(qa, ensure_ascii=False)[:800]
            linhas.append(f"A CONFERÊNCIA AUTOMÁTICA reprovou a versão {correcao.get('versao_anterior')}: {resumo}. Corrija na direção.")
        if correcao.get("direcao_anterior"):
            linhas.append("DIREÇÃO ANTERIOR (mude só o necessário): " + json.dumps(correcao["direcao_anterior"], ensure_ascii=False, separators=(",", ":")))
    return sistema, catalogo_txt, "\n".join(linhas)


def _hash(*partes) -> str:
    return hashlib.sha256(json.dumps(partes, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()[:16]


def _energias(arm: armazem_b.Armazem, analises: dict) -> dict:
    import numpy as np
    en = {"_passo": {}}
    for aid, a in analises.items():
        e = a["sinais"].get("energia") or {}
        if e.get("chave") and e["chave"].endswith(".npy"):
            try:
                en[aid] = np.load(arm.caminho(e["chave"]))
                en["_passo"][aid] = e.get("passo", 0.02)
            except (OSError, ValueError):
                pass
    return en


def dirigir_e_resolver(*, cerebro, loja: Loja, catalogo: dict, catalogo_txt: str, pedido: dict, analises: dict, trilhas: list[dict],
                       energias: dict | None = None, correcao: dict | None = None, criticar: bool = True, cfg=None) -> dict:
    """Núcleo testável sem banco: devolve {direcao, edl, usos, prompt_tokens, direcao_tokens, avisos, critica}."""
    import validar
    esquema = validar.esquema("direcao")
    sistema, cat_txt, pedido_txt = montar_prompt(loja, catalogo_txt, pedido, correcao=correcao)
    prompt_tokens = orcamento.estimar_tokens(sistema + cat_txt + pedido_txt)
    usos = []
    direcao, u = cerebro.dirigir(sistema=sistema, catalogo_txt=cat_txt, pedido_txt=pedido_txt, esquema=esquema,
                                 maximo_saida=getattr(cfg, "orcamento_saida", 4000))
    usos.append(dict(u, chamada="diretor"))
    erros = validar.erros("direcao", direcao)
    if erros:
        raise ErroDefinitivo("direção fora do schema: " + "; ".join(erros[:5]))
    voc = loja.vocabulario()

    def tentar(d):
        modelo = loja.modelo(d.get("modelo") or "evento-reel")
        try:
            return resolver(d, catalogo, analises, modelo, trilhas, vocabulario=voc, energias=energias, projeto=catalogo["projeto"]), []
        except ErroResolucao as e:
            return None, e.problemas

    edl, problemas = tentar(direcao)
    critica = "não rodou"
    if criticar:
        avisos = problemas or (edl["origem"]["avisos"] if edl else [])
        revisada, u2 = cerebro.criticar(sistema=sistema, catalogo_txt=cat_txt, direcao=direcao, pedido_txt=pedido_txt, esquema=esquema, problemas=avisos)
        usos.append(dict(u2, chamada="critico"))
        if revisada != direcao and not validar.erros("direcao", revisada):
            edl2, prob2 = tentar(revisada)
            if edl2 is not None:
                direcao, edl, problemas, critica = revisada, edl2, [], "aplicada"
            else:
                critica = "descartada (não resolveu: " + "; ".join(prob2[:3]) + ")"
        else:
            critica = "sem mudança"
    if edl is None:
        raise ErroDefinitivo("a direção não resolveu: " + "; ".join(problemas[:6]))
    validar.validar("edl", edl)
    return {"direcao": direcao, "edl": edl, "usos": usos, "prompt_tokens": prompt_tokens, "direcao_tokens": orcamento.tokens_json(direcao),
            "avisos": edl["origem"]["avisos"], "critica": critica}


@etapa("direcao")
def rodar(ctx) -> dict:
    from motor.provedores import provedor
    arm = armazem_b.Armazem(ctx)
    p = ctx.projeto
    try:
        catalogo = arm.ler_json(f"projetos/{p}/catalogo.json")
        cat_txt = arm.caminho(f"projetos/{p}/catalogo.txt").read_text(encoding="utf-8")
    except FileNotFoundError as e:
        raise ErroDefinitivo("catálogo ainda não foi montado") from e
    pedido = arm.pedido(p) or {"versao": "1", "projeto": p, "texto": ""}
    entrada = ctx.job.get("entrada") or {}
    correcao = {k: entrada[k] for k in ("corrigir_qa", "reprovacao", "versao_anterior") if k in entrada} or None
    indice = arm.ler_json(f"projetos/{p}/direcoes.json", padrao={"por_entrada": {}, "ultima": 0})
    chave = _hash(orcamento.estimar_tokens(cat_txt), armazem_b_hash(cat_txt), pedido, correcao)
    feito = indice["por_entrada"].get(chave)
    if feito and arm.existe(f"saidas/{p}/{feito}/edl.json"):
        return {"versao": feito, "reaproveitada": True}
    if correcao and correcao.get("versao_anterior"):
        n_ant = int(str(correcao["versao_anterior"]).lstrip("v") or 0)
        try:
            correcao["direcao_anterior"] = arm.ler_json(f"projetos/{p}/direcao_{n_ant}.json")
        except FileNotFoundError:
            pass
    loja = Loja()
    analises = {}
    for k in arm.listar(f"derivados/{p}/"):
        if k.endswith("/analise.json"):
            a = arm.ler_json(k)
            analises[a["arquivo"]["id"]] = a
    ctx.progresso(0.1, "Direção: o diretor está lendo o catálogo.")
    cerebro = provedor("cerebro", ctx.cfg)
    r = dirigir_e_resolver(cerebro=cerebro, loja=loja, catalogo=catalogo, catalogo_txt=cat_txt, pedido=pedido, analises=analises,
                           trilhas=armazem_b.trilhas(ctx.cfg), energias=_energias(arm, analises), correcao=correcao, cfg=ctx.cfg)
    n = int(indice.get("ultima", 0)) + 1
    v = f"v{n}"
    r["edl"]["origem"].update({"versao": v, "cerebro": cerebro.nome, "critica": r["critica"]})
    arm.gravar_json(f"projetos/{p}/direcao_{n}.json", r["direcao"])
    total = orcamento.somar(r["usos"])
    arm.gravar_json(f"projetos/{p}/uso_{n}.json", {"versao": v, "chamadas": r["usos"], "total": total, "prompt_tokens_estimados": r["prompt_tokens"],
                                                    "direcao_tokens_estimados": r["direcao_tokens"], "checagens_edl": loja.avaliar_edl(r["edl"])})
    arm.gravar_json(f"saidas/{p}/{v}/edl.json", r["edl"])
    indice["por_entrada"][chave] = v
    indice["ultima"] = n
    arm.gravar_json(f"projetos/{p}/direcoes.json", indice)
    ctx.con.execute("INSERT OR REPLACE INTO versoes (id, projeto, estado, criado) VALUES (?,?,?,?)", (v, p, "montando", banco.agora_iso()))
    banco.emitir(ctx.con, p, "etapa_progresso", etapa="direcao", alvo=v, progresso=1.0,
                 mensagem=f"Direção pronta ({r['edl']['duracao']:.0f} s, {len(r['edl']['voz'])} trechos de fala). Custo: US$ {total['custo_usd']:.2f}.",
                 dados={"tokens": total, "avisos": r["avisos"][:5]})
    return {"versao": v, "duracao": r["edl"]["duracao"], "tokens_saida": total["saida"], "custo_usd": total["custo_usd"]}


def armazem_b_hash(txt: str) -> str:
    return hashlib.sha256(txt.encode("utf-8")).hexdigest()[:16]
