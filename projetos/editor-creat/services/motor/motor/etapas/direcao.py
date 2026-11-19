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


# Modos de edição (estilo): o mesmo material pode virar filmes bem diferentes. O dono escolhe no pedido; "auto" deixa o diretor decidir.
MODOS = {
    "criativo": "criativo: ritmo vivo, tipografia cinética, transições motivadas pela fala, humor e surpresa na medida",
    "ultra": "ultra criação: o máximo de invenção (motion pesado, personagens e mascotes da marca, efeitos de impacto, som casado); interpretar além do pedido",
    "cinema": "cinema: transições cinematográficas, cor por LUT e por ambiente, trilha com curva emocional, poucos textos e bem compostos",
    "ia": "com IA: cenas geradas por IA entram junto do material humano para mostrar o que a câmera não pegou; toda cena gerada é rotulada como conceito",
    "clean": "clean: limpo e neutro, cortes secos e precisos, legenda discreta, sem efeitos chamativos, muito respiro",
    "serio": "sério: institucional e sóbrio, sem mascote, sem gíria, sem efeito de impacto; marca e dados com clareza",
    "fala": "fala e apresentação: a fala é o filme; cortes só para tirar pausa e erro, legenda fiel, apoio visual apenas quando esclarece",
}


def _referencias_txt() -> str:
    """Estudos de caso colados pelo dono (links de Reels etc.), medidos pelo editor: ritmo e gancho de referência."""
    try:
        from motor import referencias
        t = referencias.para_prompt()
    except Exception:  # noqa: BLE001
        return ""
    return ("\n- ESTUDOS DE CASO do dono (inspire-se no ritmo e no gancho, sem copiar):\n" + t) if t else ""


def montar_prompt(loja: Loja, catalogo_txt: str, pedido: dict, *, correcao: dict | None = None) -> tuple[str, str, str]:
    """Devolve (sistema, catalogo_txt, pedido_txt). Sistema e catálogo são estáveis (cache); o pedido vem por último."""
    tipo = (pedido or {}).get("tipo_video") or "auto"
    sistema = (prompts_texto("diretor").replace("{regras}", loja.regras_para_prompt(tipo)).replace("{modelos}", loja.modelos_para_prompt())
               .replace("{casos}", (loja.casos_para_prompt(tipo) or "- nenhum ainda") + _referencias_txt()))
    p = pedido or {}
    linhas = [f"PEDIDO: {p.get('texto', '').strip()}"]
    for campo, rotulo in (("tipo_video", "tipo"), ("duracao_alvo", "duração alvo (s)"), ("destino", "destino"), ("formato", "formato"),
                          ("cliente", "cliente"), ("obrigatorio", "obrigatório"), ("proibido", "proibido")):
        v = p.get(campo)
        if v not in (None, "", [], "auto"):
            linhas.append(f"{rotulo}: {', '.join(map(str, v)) if isinstance(v, list) else v}")
    modo = MODOS.get(p.get("modo") or "auto")
    if modo:
        linhas.append(f"modo de edição: {modo}")
        receita = loja.modo(p.get("modo")) if hasattr(loja, "modo") else None
        if receita and receita.get("sem_transicoes"):
            linhas.append("neste modo NÃO use as saídas: " + ", ".join(receita["sem_transicoes"]) + " (use corte_batida, match, fade ou as que restarem)")
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
        modelo = loja.modelo_com_modo(d.get("modelo") or "evento-reel", (pedido or {}).get("modo"))
        try:
            return resolver(d, catalogo, analises, modelo, trilhas, vocabulario=voc, energias=energias, projeto=catalogo["projeto"],
                            ambiente=(pedido or {}).get("ambiente")), []
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


def _dirigir(cerebro, loja, catalogo, cat_txt, pedido, analises, arm, ctx, correcao):
    return dirigir_e_resolver(cerebro=cerebro, loja=loja, catalogo=catalogo, catalogo_txt=cat_txt, pedido=pedido, analises=analises,
                              trilhas=armazem_b.trilhas(ctx.cfg), energias=_energias(arm, analises), correcao=correcao, cfg=ctx.cfg)


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
        return {"versao": feito, "reaproveitada": True, "cerebro": ctx.cfg.cerebro}
    if correcao and correcao.get("versao_anterior"):
        n_ant = int(str(correcao["versao_anterior"]).lstrip("v") or 0)
        try:
            correcao["direcao_anterior"] = arm.ler_json(f"projetos/{p}/direcao_{n_ant}.json")
        except FileNotFoundError:
            pass
    from motor.cerebro import edl_fixo
    if ctx.cfg.cerebro == "fixture" and edl_fixo.ativo():
        return _dirigir_com_edl_fixo(ctx, arm, indice, chave, correcao)
    loja = Loja()
    analises = {}
    for k in arm.listar(f"derivados/{p}/"):
        if k.endswith("/analise.json"):
            a = arm.ler_json(k)
            analises[a["arquivo"]["id"]] = a
    ctx.progresso(0.1, "Direção: o diretor está lendo o catálogo.")
    cerebro = provedor("cerebro", ctx.cfg)
    from motor.cerebro.sessao import AguardandoDiretor
    try:
        r = _dirigir(cerebro, loja, catalogo, cat_txt, pedido, analises, arm, ctx, correcao)
    except AguardandoDiretor as e:
        raise ErroDefinitivo(str(e)) from e
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
    return {"versao": v, "duracao": r["edl"]["duracao"], "tokens_saida": total["saida"], "custo_usd": total["custo_usd"], "cerebro": cerebro.nome}


def _dirigir_com_edl_fixo(ctx, arm, indice, chave, correcao) -> dict:
    """Fixture de EDL (EDITOR_CEREBRO_EDL): a 'resposta do cérebro' é um EDL pronto. Zero token. Correção automática do
    QA não existe aqui (o EDL é fixo): reprovação vai direto para o dono."""
    import os
    from motor.cerebro import edl_fixo
    p = ctx.projeto
    if correcao and correcao.get("corrigir_qa"):
        raise ErroDefinitivo("cérebro fixture (EDL fixo) não corrige sozinho o que o QA reprovou")
    edl = edl_fixo.carregar(edl_fixo.ativo())
    ate = os.environ.get("EDITOR_CEREBRO_EDL_ATE", "").strip()
    if ate:
        edl = edl_fixo.corte_curto(edl, float(ate))
    arquivos = [dict(r) for r in ctx.con.execute("SELECT nome, chave FROM arquivos WHERE projeto=? AND estado='analisado'", (p,))]
    edl, trocadas = edl_fixo.para_o_projeto(edl, p, arquivos)
    import validar
    erros = validar.erros("edl", edl)
    if erros:
        raise ErroDefinitivo("EDL fixo fora do schema: " + "; ".join(erros[:3]))
    n = int(indice.get("ultima", 0)) + 1
    v = f"v{n}"
    edl["origem"].update({"versao": v, "cerebro": "fixture-edl", "fontes_do_envio": trocadas})
    arm.gravar_json(f"saidas/{p}/{v}/edl.json", edl)
    arm.gravar_json(f"projetos/{p}/uso_{n}.json", {"versao": v, "chamadas": [], "total": {"entrada": 0, "saida": 0, "custo_usd": 0.0},
                                                    "cerebro": "fixture-edl"})
    indice["por_entrada"][chave] = v
    indice["ultima"] = n
    arm.gravar_json(f"projetos/{p}/direcoes.json", indice)
    ctx.con.execute("INSERT OR REPLACE INTO versoes (id, projeto, estado, criado) VALUES (?,?,?,?)", (v, p, "montando", banco.agora_iso()))
    banco.emitir(ctx.con, p, "etapa_progresso", etapa="direcao", alvo=v, progresso=1.0,
                 mensagem=f"Direção pronta (EDL fixo, {edl['duracao']:.0f} s, {len(edl['voz'])} trechos de fala; {len(trocadas)} fonte(s) do envio). Custo: US$ 0,00.")
    return {"versao": v, "duracao": edl["duracao"], "tokens_saida": 0, "custo_usd": 0.0, "fontes_do_envio": trocadas, "cerebro": "fixture-edl"}


def armazem_b_hash(txt: str) -> str:
    return hashlib.sha256(txt.encode("utf-8")).hexdigest()[:16]
