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
from motor.etapas import ErroDefinitivo, armazem_b, etapa, passos
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


def _movimentos(arm: armazem_b.Armazem, analises: dict) -> dict:
    """Série de movimento de cada arquivo (motor/movimento.py) para o resolvedor escolher o trecho mais nítido e firme e
    decidir a estabilização. Opcional: sem a série, o resolvedor segue com o tremor dos quadros-chave."""
    out = {}
    for aid, a in analises.items():
        chave = (a["sinais"].get("movimento") or {}).get("chave")
        if chave:
            try:
                out[aid] = arm.ler_json(chave)
            except (OSError, ValueError):
                pass
    return out


def _ferramenta_cerebro(cerebro) -> str:
    nome = getattr(cerebro, "nome", "?")
    return {"anthropic": "Claude (Messages API, JSON estrito, cache do catálogo)", "fixture": "cérebro fixture (direção gravada, sem chamar a API)",
            "sessao": "sessão do Claude Code (por arquivo)"}.get(nome, f"cérebro {nome}")


def _modelo_do_uso(u: dict) -> str | None:
    return "fixture" if u.get("cerebro") == "fixture" else u.get("modelo")


def _encaixe(ps, edl: dict | None, problemas: list, direcao: dict) -> None:
    """Números e achado do resolvedor em palavras do dono: duração, blocos, planos e onde a música explode."""
    if edl is None:
        ps.anotar(resultado="não encaixou").achou("Não encaixou: " + "; ".join(str(x) for x in problemas[:2]))
        return
    blocos = len({pl.get("bloco") for pl in edl.get("planos", []) if pl.get("bloco")}) or len(direcao.get("blocos") or [])
    ps.anotar(dur=round(float(edl.get("duracao") or 0)), blocos=blocos, planos=len(edl.get("planos") or []), falas=len(edl.get("voz") or []))
    drop = (direcao.get("trilha") or {}).get("drop_em")
    t_drop = min((float(pl["t0"]) for pl in edl.get("planos", []) if drop and pl.get("bloco") == drop and isinstance(pl.get("t0"), (int, float))), default=None)
    txt = f"{float(edl.get('duracao') or 0):.0f} s em {blocos} blocos e {len(edl.get('planos') or [])} planos, {len(edl.get('voz') or [])} trechos de fala"
    if t_drop is not None:
        ps.anotar(drop_s=round(t_drop))
        txt += f"; a música explode aos {int(t_drop) // 60}:{int(t_drop) % 60:02d}"
    ps.achou(txt)


def _resolver_uma(d: dict, *, catalogo: dict, analises, loja: Loja, pedido: dict | None, trilhas: list[dict], energias: dict | None = None,
                  movimentos: dict | None = None, vocabulario: list | None = None,
                  ferramenta: str = "resolvedor do editor (encaixe por palavra e batida)") -> tuple[dict | None, list]:
    """Uma passada do resolvedor (direção -> EDL) dentro do passo da mesa. Devolve (edl, []) ou (None, problemas).
    Usada pela direção de sempre (dirigir_e_resolver) e pela troca de música sem cérebro (onda 3, _trocar_trilha)."""
    voc = loja.vocabulario() if vocabulario is None else vocabulario
    modelo = loja.modelo_com_modo(d.get("modelo") or "evento-reel", (pedido or {}).get("modo"))
    with passos.passo("direcao.resolvedor", ferramenta=ferramenta) as pr:
        try:
            r = resolver(d, catalogo, analises, modelo, trilhas, vocabulario=voc, energias=energias, movimentos=movimentos,
                         projeto=catalogo["projeto"],
                         ambiente=(pedido or {}).get("ambiente"), vozes=(pedido or {}).get("vozes")), []
        except ErroResolucao as e:
            r = None, e.problemas
        _encaixe(pr, r[0], r[1], d)
        return r


def dirigir_e_resolver(*, cerebro, loja: Loja, catalogo: dict, catalogo_txt: str, pedido: dict, analises: dict, trilhas: list[dict],
                       energias: dict | None = None, correcao: dict | None = None, criticar: bool = True, cfg=None,
                       movimentos: dict | None = None, ao_usar=None) -> dict:
    """Núcleo testável sem banco: devolve {direcao, edl, usos, prompt_tokens, direcao_tokens, avisos, critica}.
    Mesa ao vivo: diretor, resolvedor e crítico viram passos (sem job, não emitem nada). `ao_usar(uso, i)` é chamado logo
    depois de cada chamada ao cérebro, para o gasto entrar no livro (e no passo certo) na hora."""
    import validar
    esquema = validar.esquema("direcao")
    sistema, cat_txt, pedido_txt = montar_prompt(loja, catalogo_txt, pedido, correcao=correcao)
    prompt_tokens = orcamento.estimar_tokens(sistema + cat_txt + pedido_txt)
    usos = []
    with passos.passo("direcao.diretor", ferramenta=_ferramenta_cerebro(cerebro)) as ps:
        direcao, u = cerebro.dirigir(sistema=sistema, catalogo_txt=cat_txt, pedido_txt=pedido_txt, esquema=esquema,
                                     maximo_saida=getattr(cfg, "orcamento_saida", 4000))
        usos.append(dict(u, chamada="diretor"))
        ps.modelo = ps.modelo or _modelo_do_uso(u)
        if ao_usar:
            ao_usar(usos[-1], len(usos) - 1)
        ps.anotar(blocos=len(direcao.get("blocos") or []) if isinstance(direcao, dict) else 0)
        if isinstance(direcao, dict) and direcao.get("conceito"):
            ps.achou(f"Conceito: {direcao['conceito']}")
    erros = validar.erros("direcao", direcao)
    if erros:
        raise ErroDefinitivo("direção fora do schema: " + "; ".join(erros[:5]))
    voc = loja.vocabulario()

    def tentar(d):
        return _resolver_uma(d, catalogo=catalogo, analises=analises, loja=loja, pedido=pedido, trilhas=trilhas, energias=energias,
                             movimentos=movimentos, vocabulario=voc)

    edl, problemas = tentar(direcao)
    critica = "não rodou"
    if criticar:
        avisos = problemas or (edl["origem"]["avisos"] if edl else [])
        with passos.passo("direcao.critico", ferramenta=_ferramenta_cerebro(cerebro), avisos=len(avisos)) as pc:
            revisada, u2 = cerebro.criticar(sistema=sistema, catalogo_txt=cat_txt, direcao=direcao, pedido_txt=pedido_txt, esquema=esquema, problemas=avisos)
            usos.append(dict(u2, chamada="critico"))
            pc.modelo = pc.modelo or _modelo_do_uso(u2)
            if ao_usar:
                ao_usar(usos[-1], len(usos) - 1)
            if revisada != direcao and not validar.erros("direcao", revisada):
                pc.anotar(resultado="mudou a direção")
                pc.achou(f"Mexeu na direção ({len(avisos)} ponto{'s' if len(avisos) != 1 else ''} para olhar)")
            else:
                pc.anotar(resultado="sem mudança")
                pc.achou(f"Manteve a direção ({len(avisos)} ponto{'s' if len(avisos) != 1 else ''} conferido{'s' if len(avisos) != 1 else ''})"
                         if avisos else "Manteve a direção")
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


def _dirigir(cerebro, loja, catalogo, cat_txt, pedido, analises, arm, ctx, correcao, ao_usar=None):
    return dirigir_e_resolver(cerebro=cerebro, loja=loja, catalogo=catalogo, catalogo_txt=cat_txt, pedido=pedido, analises=analises,
                              trilhas=armazem_b.trilhas(ctx.cfg), energias=_energias(arm, analises), correcao=correcao, cfg=ctx.cfg,
                              movimentos=_movimentos(arm, analises), ao_usar=ao_usar)


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
    correcao = {k: entrada[k] for k in ("corrigir_qa", "reprovacao", "versao_anterior", "trocar_trilha") if k in entrada} or None
    indice = arm.ler_json(f"projetos/{p}/direcoes.json", padrao={"por_entrada": {}, "ultima": 0})
    chave = _hash(orcamento.estimar_tokens(cat_txt), armazem_b_hash(cat_txt), pedido, correcao)
    feito = indice["por_entrada"].get(chave)
    if feito and arm.existe(f"saidas/{p}/{feito}/edl.json"):
        return {"versao": feito, "reaproveitada": True, "cerebro": "sem_cerebro" if (correcao or {}).get("trocar_trilha") else ctx.cfg.cerebro}
    if correcao and correcao.get("trocar_trilha"):          # onda 3 (D25): troca só a música, sem chamar o cérebro
        return _trocar_trilha(ctx, arm, indice, chave, correcao, catalogo=catalogo, pedido=pedido)
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
    from motor.cerebro import gastos
    n = int(indice.get("ultima", 0)) + 1
    v = f"v{n}"

    def ao_usar(u, i):   # cada chamada vai ao livro logo depois de feita (mesma linha e mesma ref de antes): o custo aparece no passo
        gastos.registrar(ctx.cfg, "critico" if u.get("chamada") == "critico" else "direcao", u, projeto=p, versao=v, ref=f"projetos/{p}/uso_{n}.json#{i}")
    try:
        r = _dirigir(cerebro, loja, catalogo, cat_txt, pedido, analises, arm, ctx, correcao, ao_usar=ao_usar)
    except AguardandoDiretor as e:
        raise ErroDefinitivo(str(e)) from e
    r["edl"]["origem"].update({"versao": v, "cerebro": cerebro.nome, "critica": r["critica"]})
    arm.gravar_json(f"projetos/{p}/direcao_{n}.json", r["direcao"])
    passos.emitir_decisao(v, r["direcao"], r["critica"])
    total = orcamento.somar(r["usos"])
    arm.gravar_json(f"projetos/{p}/uso_{n}.json", {"versao": v, "chamadas": r["usos"], "total": total, "prompt_tokens_estimados": r["prompt_tokens"],
                                                    "direcao_tokens_estimados": r["direcao_tokens"], "checagens_edl": loja.avaliar_edl(r["edl"])})
    arm.gravar_json(f"saidas/{p}/{v}/edl.json", r["edl"])
    passos.anotar(versao=v, dur=round(float(r["edl"]["duracao"])), falas=len(r["edl"]["voz"]))
    passos.achou(f"{v.upper()}: {r['edl']['duracao']:.0f} s, {len(r['edl']['voz'])} trechos de fala; crítica {r['critica']}")
    indice["por_entrada"][chave] = v
    indice["ultima"] = n
    arm.gravar_json(f"projetos/{p}/direcoes.json", indice)
    ctx.con.execute("INSERT OR REPLACE INTO versoes (id, projeto, estado, criado) VALUES (?,?,?,?)", (v, p, "montando", banco.agora_iso()))
    banco.emitir(ctx.con, p, "etapa_progresso", etapa="direcao", alvo=v, progresso=1.0,
                 mensagem=f"Direção pronta ({r['edl']['duracao']:.0f} s, {len(r['edl']['voz'])} trechos de fala). Custo: US$ {total['custo_usd']:.2f}.",
                 dados={"tokens": total, "avisos": r["avisos"][:5]})
    return {"versao": v, "duracao": r["edl"]["duracao"], "tokens_saida": total["saida"], "custo_usd": total["custo_usd"], "cerebro": cerebro.nome}


def _trocar_trilha(ctx, arm, indice: dict, chave: str, correcao: dict, *, catalogo: dict, pedido: dict) -> dict:
    """Troca de música sem cérebro (onda 3, seção 5): copia a direção da versão de origem, troca trilha.id e roda SÓ o
    resolvedor. Mesmos blocos e falas; os cortes andam até uma batida (a grade é da música) e a duração pode mudar. A versão
    de origem não é tocada (continua entregue e aprovável). Custo da direção: US$ 0."""
    import copy
    import re
    import validar
    p = ctx.projeto
    tt = correcao.get("trocar_trilha") or {}
    de, tid = str(tt.get("de") or ""), str(tt.get("trilha") or "")
    m = re.match(r"^v([0-9]{1,3})$", de)
    if not m or not re.match(r"^[a-z0-9_-]{2,41}$", tid):
        raise ErroDefinitivo("pedido de troca de música inválido")
    try:
        d_ant = arm.ler_json(f"projetos/{p}/direcao_{int(m.group(1))}.json")
    except FileNotFoundError as e:
        raise ErroDefinitivo(f"a {de} não tem direção guardada") from e
    d = copy.deepcopy(d_ant)
    tr = d.setdefault("trilha", {"clima": "energia"})
    tr["id"] = tid
    tr.pop("ids", None)
    tr.pop("troca_em", None)
    erros = validar.erros("direcao", d)
    if erros:
        raise ErroDefinitivo("a direção da versão de origem ficou fora do schema: " + "; ".join(erros[:3]))
    trilhas = armazem_b.trilhas(ctx.cfg)
    if not any(t.get("id") == tid for t in trilhas):
        raise ErroDefinitivo("a música escolhida saiu da biblioteca")
    analises = {}
    for k in arm.listar(f"derivados/{p}/"):
        if k.endswith("/analise.json"):
            a = arm.ler_json(k)
            analises[a["arquivo"]["id"]] = a
    ctx.progresso(0.2, f"Trocando a música da {de}, sem nova direção.")
    loja = Loja()
    edl, problemas = _resolver_uma(d, catalogo=catalogo, analises=analises, loja=loja, pedido=pedido, trilhas=trilhas,
                                   energias=_energias(arm, analises), movimentos=_movimentos(arm, analises),
                                   ferramenta="resolvedor do editor (troca de música, sem nova direção)")
    if edl is None:
        raise ErroDefinitivo("a música nova não encaixou no filme: " + "; ".join(str(x) for x in problemas[:3]))
    validar.validar("edl", edl)
    n = int(indice.get("ultima", 0)) + 1
    v = f"v{n}"
    edl["origem"].update({"versao": v, "cerebro": "sem_cerebro", "critica": "troca de música, sem crítica", "trocou_trilha_de": de})
    arm.gravar_json(f"projetos/{p}/direcao_{n}.json", d)
    passos.emitir_decisao(v, d, f"troca de música da {de}, sem nova direção")
    total = {"entrada": 0, "saida": 0, "custo_usd": 0.0}
    arm.gravar_json(f"projetos/{p}/uso_{n}.json", {"versao": v, "chamadas": [], "total": total, "cerebro": "sem_cerebro",
                                                    "troca_de_trilha": {"de": de, "trilha": tid}})
    arm.gravar_json(f"saidas/{p}/{v}/edl.json", edl)
    passos.anotar(versao=v, dur=round(float(edl["duracao"])), falas=len(edl["voz"]))
    passos.achou(f"{v.upper()}: música trocada, {edl['duracao']:.0f} s, {len(edl['voz'])} trechos de fala; sem nova direção")
    indice.setdefault("por_entrada", {})[chave] = v
    indice["ultima"] = n
    arm.gravar_json(f"projetos/{p}/direcoes.json", indice)
    ctx.con.execute("INSERT OR REPLACE INTO versoes (id, projeto, estado, criado) VALUES (?,?,?,?)", (v, p, "montando", banco.agora_iso()))
    banco.emitir(ctx.con, p, "etapa_progresso", etapa="direcao", alvo=v, progresso=1.0,
                 mensagem=f"Música trocada ({v}, {edl['duracao']:.0f} s). Custo da direção: US$ 0,00.", dados={"tokens": total})
    return {"versao": v, "duracao": edl["duracao"], "tokens_saida": 0, "custo_usd": 0.0, "cerebro": "sem_cerebro"}


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
