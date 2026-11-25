"""Etapa 'catalogo' (frente B): todas as análises do projeto + pedido -> catálogo compacto.

Duas formas (ARQUITETURA.md §4.2):
- catalogo.json (catalogo.schema.json): para máquinas; o resolvedor mapeia id -> tempos.
- catalogo.txt: o que o cérebro lê. Uma linha por item, sem chaves JSON, cabendo em EDITOR_ORCAMENTO_ENTRADA tokens.

Ids: C<nn> clipe, M<nn>.<k> momento, F<nn>.<k> fala (segmentos da transcrição juntados em falas de até ~14 s).
Determinístico: mesmas análises + mesmo pedido = mesmo texto (o prefixo do prompt fica em cache na API).
"""
from __future__ import annotations

import hashlib
import json
import re
import unicodedata

from motor.cerebro.orcamento import estimar_tokens

EQUIPE = ("MARCOS", "RUAN", "XANDE")
MAX_FALA_S = 14.0
GAP_JUNTA_S = 0.8
PALAVRAS_TRUNCA = 14
DESC_PALAVRAS = 12
# palavras do pedido que não distinguem fala nenhuma (não seguram fala inteira no catálogo)
GENERICAS = set("""video videos reels reel evento eventos bastidor bastidores cobertura termina chamando aparecem aparece
mostrando mostrar quero fazer pessoal gente sobre depois antes final comeco inicio parte todos todas muito mais
para pelo pela base fala falas""".split())
_N = dict(trunca=None, agrega=False, linha=False, resumo=16, curtas=True, desc=12, desc_fala=True, desc_n3=True)
NIVEIS = [  # o texto de 'corte' vai para orcamento.cortes e o cérebro fica sabendo
    dict(_N, corte="tudo inteiro"),
    dict(_N, trunca=PALAVRAS_TRUNCA, corte=f"falas de fora da equipe e sem palavra do pedido truncadas em {PALAVRAS_TRUNCA} palavras"),
    dict(_N, trunca=PALAVRAS_TRUNCA, agrega=True, corte="momentos com nota <= 2 agregados por clipe"),
    dict(_N, trunca=PALAVRAS_TRUNCA, agrega=True, linha=True, corte="clipes sem fala e sem momento >= 3 viram uma linha"),
    dict(_N, trunca=8, agrega=True, linha=True, resumo=10, corte="falas de fora da equipe em 8 palavras; resumo do clipe em 10 palavras"),
    dict(_N, trunca=8, agrega=True, linha=True, resumo=10, curtas=False, corte="falas de fora da equipe com menos de 3 palavras omitidas"),
    dict(_N, trunca=8, agrega=True, linha=True, resumo=10, curtas=False, desc=8, desc_fala=False,
         corte="momentos de fala sem descrição (a fala está nas linhas F); descrições em 8 palavras"),
    dict(_N, trunca=6, agrega=True, linha=True, resumo=8, curtas=False, desc=8, desc_fala=False, desc_n3=False,
         corte="momentos nota 3 sem descrição; falas de fora da equipe em 6 palavras"),
    dict(_N, trunca=4, agrega=True, linha=True, resumo=6, curtas=False, desc=6, desc_fala=False, desc_n3=False,
         corte="falas de fora da equipe em 4 palavras; descrições em 6 palavras"),
]


# ---------------- texto ----------------
def norm(s: str) -> str:
    """minúsculas, sem acento, sem pontuação (para comparar falas)."""
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9 ]+", " ", s).strip()


def tokens(s: str) -> list[str]:
    return norm(s).split()


def _corta(texto: str, n: int) -> tuple[str, bool]:
    p = texto.split()
    return (texto, False) if len(p) <= n else (" ".join(p[:n]) + "…", True)


def _num(x: float) -> str:
    return f"{x:.1f}".rstrip("0").rstrip(".") if abs(x - round(x)) > 0.05 else str(int(round(x)))


# ---------------- falas ----------------
def falas_do_arquivo(analise: dict) -> list[dict]:
    """Junta segmentos vizinhos do mesmo falante em falas (menos linhas = menos tokens)."""
    out: list[dict] = []
    for s in analise["transcricao"]["segmentos"]:
        texto = (s.get("texto") or "").strip()
        if not texto:
            continue
        f, voz = s.get("falante"), s.get("voz")
        ditado = (s.get("ditado") or {}).get("s")
        ditado_arq = (s.get("ditado") or {}).get("arquivo")
        # junta só a MESMA voz (item 4): o ditado da equipe e a repetição de quem fala viram falas separadas; ditado não junta
        if out and out[-1]["falante"] == f and out[-1].get("voz") == voz and ditado is None and out[-1].get("ditado_s") is None \
                and s["s"] - out[-1]["t1"] <= GAP_JUNTA_S and s["e"] - out[-1]["t0"] <= MAX_FALA_S:
            out[-1]["t1"] = s["e"]
            out[-1]["texto"] += " " + texto
            out[-1]["confs"].append(s.get("conf"))
        else:
            out.append({"t0": s["s"], "t1": s["e"], "falante": f, "texto": texto, "confs": [s.get("conf")], "voz": voz, "ditado_s": ditado,
                        "ditado_arq": ditado_arq})
    return out


def _energia_serie(analise: dict, armazenamento=None, dados=None):
    """Série de energia (dB) do arquivo, se existir. Nunca falha: sem série, devolve None."""
    chave = (analise.get("sinais", {}).get("energia") or {}).get("chave")
    if not chave:
        return None
    try:
        import numpy as np
        if armazenamento is not None:
            caminho = armazenamento.caminho_local(chave)
        else:
            import pathlib
            caminho = pathlib.Path(chave) if chave.startswith("/") else pathlib.Path(dados or ".") / "armazenamento" / chave
        if str(caminho).endswith(".json"):
            return np.asarray(json.loads(open(caminho).read()), dtype=float)
        return np.load(caminho)
    except Exception:  # noqa: BLE001
        return None


def _energia_rel(serie, passo, t0, t1, ref) -> float | None:
    if serie is None or ref is None:
        return None
    import numpy as np
    a, b = int(t0 / passo), max(int(t0 / passo) + 1, int(t1 / passo))
    trecho = serie[a:b]
    if len(trecho) == 0:
        return None
    v = float(np.percentile(trecho, 90))
    return round(min(1.0, max(0.0, (v - (ref - 30)) / 30)), 2)


# ---------------- montagem ----------------
def montar(analises: list[dict], pedido: dict | None, projeto: str, *, limite: int = 15000, trilhas: list[dict] | None = None,
           modelos: list[str] | None = None, armazenamento=None, dados=None, cfg=None) -> tuple[dict, str]:
    pedido = pedido or {}
    palavras_pedido = {w for w in tokens(pedido.get("texto", "") + " " + " ".join(pedido.get("obrigatorio", [])))
                       if len(w) >= 5 and w not in GENERICAS}
    if cfg is not None and armazenamento is not None:      # item 4: quem fala em cada trecho (ditado da equipe separado)
        from motor.etapas import vozes

        def audio_de(a):
            from motor.etapas.montagem.comum import ler_audio
            return ler_audio(armazenamento.caminho_local(a["arquivo"]["chave"]), sr=vozes.SR, cfg=cfg), 0.0
        analises = vozes.rotular(analises, audio_de, cfg=cfg)
    ordenadas = sorted(analises, key=lambda a: (a["arquivo"].get("gravado_em") is None, a["arquivo"].get("gravado_em") or "",
                                                a["arquivo"]["nome"], a["arquivo"]["id"]))
    clipes = []
    for n, a in enumerate(ordenadas, 1):
        cid = f"C{n:02d}"
        num = cid[1:]
        vis = a.get("visao") or {}
        serie = _energia_serie(a, armazenamento, dados)
        passo = (a["sinais"].get("energia") or {}).get("passo") or 0.02
        ref = None
        if serie is not None and len(serie):
            import numpy as np
            ref = float(np.percentile(serie, 99))
        falas = []
        brutas = falas_do_arquivo(a)
        for k, f in enumerate(brutas, 1):
            item = {"id": f"F{num}.{k}", "t0": round(f["t0"], 2), "t1": round(f["t1"], 2), "falante": f["falante"],
                    "texto": f["texto"], "truncado": False, "energia": _energia_rel(serie, passo, f["t0"], f["t1"], ref)}
            if f.get("voz"):
                item["voz"] = f["voz"]
            falas.append(item)
        for item, f in zip(falas, brutas):                   # ditado: resolvido depois de todos os clipes (pode estar no take seguinte)
            if f.get("ditado_s") is not None:
                item["_dit"] = (f.get("ditado_arq") or a["arquivo"]["id"], f["ditado_s"])
        momentos = []
        for k, m in enumerate(sorted(vis.get("momentos", []), key=lambda m: (m["t0"], m["t1"])), 1):
            momentos.append({"id": f"M{num}.{k}", "t0": round(m["t0"], 2), "t1": round(m["t1"], 2), "tipo": m["tipo"],
                             "nota": int(m["nota"]), "desc": " ".join((m.get("desc") or "").split()[:DESC_PALAVRAS])[:140]})
        pessoas = _pessoas(falas, momentos)
        amb = []
        for c in a["sinais"].get("cenas", []):
            if c.get("ambiente") and c["ambiente"] not in amb:
                amb.append(c["ambiente"])
        clipes.append({
            "id": cid, "arquivo": a["arquivo"]["id"], "nome": a["arquivo"]["nome"], "dur": round(a["midia"]["duracao"], 2),
            "resumo": " ".join((vis.get("resumo") or "").split()[:22])[:240],
            "pessoas": pessoas[:160], "camera": _camera(a, vis)[:80], "ambientes": amb, "momentos": momentos, "falas": falas,
            **({"movimento": mv} if (mv := _movimento(a)) else {}),
        })
    _nitidez_relativa(clipes, ordenadas)
    for c in clipes:                                          # ditado -> id da fala (deste ou de outro clipe) onde a voz A repete
        for item in c["falas"]:
            alvo = item.pop("_dit", None)
            if alvo is None:
                continue
            arq, s = alvo
            rep = next((g for c2 in clipes if c2["arquivo"] == arq for g in c2["falas"]
                        if g["t0"] - 0.05 <= s <= g["t1"] + 0.05 and g.get("voz") == "A"), None)
            if rep:
                item["ditado"] = rep["id"]
    cat = {"versao": "1", "projeto": projeto, "orcamento": {"tokens_estimados": 0, "limite": limite, "cortes": []}, "clipes": clipes,
           "trilhas": [{k: t[k] for k in ("id", "clima", "bpm", "dur", "virada", "tom", "secoes") if t.get(k) is not None} for t in (trilhas or [])],
           "modelos": modelos or []}
    # níveis de compressão, aplicados em ordem até caber (§4.2); cada nível inclui os anteriores
    txt, nivel = "", 0
    protegidas = falas_protegidas(clipes)
    for nivel in range(len(NIVEIS)):
        txt = _texto(cat, nivel, palavras_pedido, protegidas)
        if estimar_tokens(txt) <= limite:
            break
    cat["orcamento"]["cortes"] = [NIVEIS[n]["corte"] for n in range(1, nivel + 1)]
    cat["orcamento"]["tokens_estimados"] = estimar_tokens(txt)
    trunca = NIVEIS[nivel]["trunca"]
    if trunca:                         # marca no JSON o que foi truncado no texto
        for c in cat["clipes"]:
            for f in c["falas"]:
                if not _inteira(f, palavras_pedido, protegidas) and len(f["texto"].split()) > trunca:
                    f["truncado"] = True
    return cat, txt


def _pessoas(falas, momentos) -> str:
    faixas: dict[str, list[float]] = {}
    for f in falas:
        if f["falante"] in EQUIPE:
            faixas.setdefault(f["falante"], [f["t0"], f["t1"]])
            faixas[f["falante"]] = [min(faixas[f["falante"]][0], f["t0"]), max(faixas[f["falante"]][1], f["t1"])]
    for m in momentos:
        for nome in EQUIPE:
            if nome.lower() in m["tipo"]:
                faixas.setdefault(nome, [m["t0"], m["t1"]])
                faixas[nome] = [min(faixas[nome][0], m["t0"]), max(faixas[nome][1], m["t1"])]
    return ", ".join(f"{n} {_num(a)}-{_num(b)}" for n, (a, b) in faixas.items())


def _movimento(a: dict) -> dict | None:
    """Resumo do movimento para o resolvedor e o diretor (sinais.movimento da análise; análise antiga fica sem)."""
    mv = a["sinais"].get("movimento")
    if not mv:
        return None
    from motor import movimento as MV
    m = a["midia"]
    esc = MV.escala_saida(m.get("w"), m.get("h"))     # tremor em px da SAÍDA 9:16, o mesmo critério do resolvedor
    out = {"tremor": round(mv.get("tremor_p90", 0.0) * esc, 2), "nota": mv.get("nota", 0.0), "borrado_pct": mv.get("borrado_pct", 0.0),
           "melhores": [x[:3] for x in mv.get("melhores") or []][:3], "tremidos": [x[:3] for x in mv.get("tremidos") or []][:3]}
    if mv.get("falhas"):
        out["falhas"] = mv["falhas"]
    amp = MV.ampliacao(m.get("w"), m.get("h"))
    if amp is not None:
        out["ampliacao"] = amp
    return out


MOLE_REL = 0.35        # nitidez_ref abaixo de 35% da mediana do projeto = clipe inteiro mole (foco perdido, lente suja)


def _nitidez_relativa(clipes: list[dict], analises: list[dict]) -> None:
    """A nitidez da série é relativa ao próprio clipe: um clipe TODO fora de foco sairia com nota alta. Aqui ele é
    comparado com a mediana do projeto (precisa de 3 clipes medidos; com menos não há base e nada muda)."""
    import numpy as np
    refs = {c["id"]: float((a["sinais"].get("movimento") or {}).get("nitidez_ref") or 0.0)
            for c, a in zip(clipes, analises) if c.get("movimento")}
    refs = {k: v for k, v in refs.items() if v > 0}
    if len(refs) < 3:
        return
    med = float(np.median(list(refs.values())))
    for c in clipes:
        if c["id"] in refs and med > 0:
            c["movimento"]["nitidez_rel"] = round(refs[c["id"]] / med, 2)


def _qualidade(c: dict) -> float:
    """Nota do clipe para o diretor priorizar o material de mais alta qualidade: firme e nítido, pixel nativo na saída.
    Clipe mole perto do resto do projeto cai na proporção; tremor que não foi medido (quadros sem textura) vale a metade."""
    from motor import movimento as MV
    mv = c["movimento"]
    amp = mv.get("ampliacao") or 1.0
    q = mv["nota"] * (1.0 if amp <= 1.0 else 1.0 / amp)
    rel = mv.get("nitidez_rel")
    if rel is not None and rel < 1.0:
        q *= max(0.0, rel)
    if (mv.get("falhas") or 0.0) > MV.FALHAS_MAX:
        q *= 0.5
    return q


def _camera(a, vis) -> str:
    if a["sinais"].get("movimento"):                  # medição fina a cada 0,5 s vence a dos quadros-chave
        from motor import movimento as MV
        w, h = a["midia"].get("w"), a["midia"].get("h")
        return MV.texto_camera(a["sinais"]["movimento"], w, h, MV.escala_saida(w, h))
    t = a["sinais"].get("tremor") or {}
    trechos = t.get("trechos") or []
    if trechos:
        return "tremido " + " ".join(f"{_num(x[0])}-{_num(x[1])}" for x in trechos[:3])
    return "tremido" if (t.get("media_px") or 0) > 4 else "estável"


def _inteira(f, palavras_pedido, protegidas=frozenset()) -> bool:
    return f["falante"] in EQUIPE or f["id"] in protegidas or bool(palavras_pedido & set(tokens(f["texto"])))


def falas_protegidas(clipes: list[dict]) -> frozenset:
    """Material sem falante rotulado (a frente A ainda não identifica Marcos/Ruan/Xande): toda fala que coincide com um
    momento 'fala' nota >= 4 ("fala com rosto em quadro") fica INTEIRA no catálogo. Sem isso, a fala base do Reel
    (regra do dono: construir sobre a fala dele) seria truncada a 4 palavras nos níveis de compressão.
    Com falante rotulado em qualquer fala do projeto, vale a regra normal (equipe inteira)."""
    ditados = {f["ditado"] for c in clipes for f in c["falas"] if f.get("ditado")}   # a repetição do ditado nunca some
    if any(f.get("falante") for c in clipes for f in c["falas"]):
        return frozenset(ditados)
    ids = set()
    for c in clipes:
        fortes = [m for m in c["momentos"] if m["tipo"].startswith("fala")
                  and (m["nota"] >= 4 or m.get("desc", "").startswith("fala com rosto"))]
        for f in c["falas"]:
            if any(m["t0"] < f["t1"] and m["t1"] > f["t0"] for m in fortes):
                ids.add(f["id"])
    return frozenset(ids | ditados)


def _texto(cat: dict, nivel: int, palavras_pedido: set[str], protegidas=frozenset()) -> str:
    cl = cat["clipes"]
    total = sum(c["dur"] for c in cl)
    tipos = sorted({m["tipo"] for c in cl for m in c["momentos"]})
    def _musica(t):
        extra = (f", {t['tom']}" if t.get("tom") else "") + (f", VIRADA aos {_num(t['virada'])} s" if t.get("virada") else "")
        if t.get("secoes"):
            extra += ", partes " + " ".join(f"{_num(x['t0'])}-{_num(x['t1'])}s:e{x['energia']}" for x in t["secoes"][:8])
        return f"{t['id']} ({_num(t['bpm'])} bpm, {_num(t['dur'])} s{', ' + t['clima'] if t.get('clima') else ''}{extra})"
    trilhas = ", ".join(_musica(t) for t in cat.get("trilhas", []))
    linhas = [f"# PROJETO {cat['projeto']} · {len(cl)} clipes · {_num(total / 60)} min · momentos: {','.join(tipos)}",
              f"# trilhas: {trilhas or 'nenhuma'} · modelos: {', '.join(cat.get('modelos') or []) or 'evento-reel'}",
              "# C=clipe (arquivo \"nome\" dur · câmera · pessoas · ambientes · resumo) · M=momento t0-t1 tipo nota(1-5) desc · "
              "F=fala t0-t1 FALANTE e.energia «texto». Tempos em s da fonte. Use só estes ids."]
    com_mov = [c for c in cl if c.get("movimento")]
    if com_mov:                                       # pedido do dono: foco nos vídeos de mais alta qualidade
        melhores = [c for c in sorted(com_mov, key=lambda c: (-_qualidade(c), c["id"])) if _qualidade(c) >= 0.5][:6]
        from motor import movimento as MV
        evite = [c["id"] for c in com_mov if c["movimento"]["tremor"] > MV.LIMIAR_FORTE and not c["movimento"]["melhores"]
                 or c["movimento"].get("borrado_pct", 0) >= 0.5 or c["movimento"].get("nitidez_rel", 1.0) < MOLE_REL]
        linhas.append("# câmera: 'melhor a-b' = trecho mais nítido e firme"
                      + (f"; prefira {', '.join(c['id'] for c in melhores)}" if melhores else "")
                      + (f"; evite {', '.join(evite)} (tremido forte, borrado ou mole)" if evite else "")
                      + "; horizontal vira vertical ampliando (perde nitidez)")
    if any(f.get("voz") for c in cl for f in c["falas"]):
        linhas.append("# vozA = voz principal (quem fala no vídeo); vozB = outra pessoa (em geral a equipe dirigindo). "
                      "DITADO→F.. = a equipe ditou a frase e a voz principal repetiu em F..: use F.., nunca o ditado.")
    P = NIVEIS[nivel]
    trunca = P["trunca"]
    for c in cl:
        mom_bons = [m for m in c["momentos"] if m["nota"] >= 3]
        if P["linha"] and not c["falas"] and not mom_bons:
            linhas.append(f"{c['id']} {c['arquivo']} \"{c['nome'].rsplit('.', 1)[0]}\" {_num(c['dur'])}s · sem fala · {len(c['momentos'])} momentos fracos")
            continue
        resumo = " ".join(c["resumo"].split()[: P["resumo"]])
        cab = [f"{c['id']} {c['arquivo']} \"{c['nome'].rsplit('.', 1)[0]}\" {_num(c['dur'])}s", c["camera"]]
        if c["pessoas"]:
            cab.append(c["pessoas"])
        if c["ambientes"]:
            cab.append("amb " + ",".join(c["ambientes"]))
        if resumo:
            cab.append(resumo)
        linhas.append(" · ".join(cab))
        fracos = [m for m in c["momentos"] if m["nota"] <= 2]
        for m in c["momentos"]:
            if P["agrega"] and m["nota"] <= 2:
                continue
            desc = " ".join(m["desc"].split()[: P["desc"]])
            if (not P["desc_fala"] and m["tipo"].startswith("fala_")) or (not P["desc_n3"] and m["nota"] <= 3):
                desc = ""
            linhas.append(f" {m['id']} {_num(m['t0'])}-{_num(m['t1'])} {m['tipo']} n{m['nota']} {desc}".rstrip())
        if P["agrega"] and fracos:
            tipos_f = sorted({m["tipo"] for m in fracos})
            linhas.append(f" M{c['id'][1:]}.* {'/'.join(tipos_f)} n<=2 ×{len(fracos)} ({' '.join(m['id'].split('.')[1] for m in fracos)})")
        for f in c["falas"]:
            inteira = _inteira(f, palavras_pedido, protegidas)
            if not P["curtas"] and not inteira and len(f["texto"].split()) < 3:
                continue
            texto = f["texto"] if (not trunca or inteira) else _corta(f["texto"], trunca)[0]
            e = f" e.{int(round(f['energia'] * 10))}" if f.get("energia") is not None else ""
            voz = f" voz{f['voz']}" if f.get("voz") else ""
            dit = f" DITADO→{f['ditado']}" if f.get("ditado") else ""
            linhas.append(f" {f['id']} {_num(f['t0'])}-{_num(f['t1'])} {f['falante'] or '?'}{voz}{dit}{e} «{texto}»")
    return "\n".join(linhas) + "\n"


def hash_texto(txt: str) -> str:
    return hashlib.sha256(txt.encode("utf-8")).hexdigest()[:16]


# ---------------- etapa ----------------
try:
    from motor.etapas import ErroDefinitivo, etapa
except ImportError:  # pragma: no cover
    etapa = None

if etapa is not None:
    @etapa("catalogo")
    def rodar(ctx) -> dict:
        from motor.etapas import armazem_b
        import validar  # noqa: F401  (packages/schemas/py no sys.path via armazem_b)
        arm = armazem_b.Armazem(ctx)
        p = ctx.projeto
        analises = [arm.ler_json(k) for k in sorted(arm.listar(f"derivados/{p}/")) if k.endswith("/analise.json")]
        if not analises:
            raise ErroDefinitivo("nenhuma análise pronta para montar o catálogo")
        pedido = arm.pedido(p)
        from motor.etapas import passos
        falas = sum(len((a.get("transcricao") or {}).get("segmentos") or []) for a in analises)
        momentos = sum(len((a.get("visao") or {}).get("momentos") or []) for a in analises)
        passos.anotar(falas=falas, momentos=momentos, videos=len(analises))
        passos.achou(f"{falas} falas e {momentos} momentos de {len(analises)} vídeo{'s' if len(analises) != 1 else ''}, prontos para o diretor")
        trilhas = armazem_b.trilhas(ctx.cfg)
        from motor.memoria import loja
        modelos = loja.Loja().nomes_modelos()
        from motor.etapas import falante as _fal, vozes as _vz
        voz_pronta = _fal.modelo_presente(ctx.cfg)           # o catálogo com e sem vozes rotuladas são diferentes
        chave_in = hash_texto(json.dumps([a["arquivo"]["id"] for a in analises]) + json.dumps(pedido, sort_keys=True, ensure_ascii=False)
                              + json.dumps([len(json.dumps(a)) for a in analises]) + f"|vozes {_vz.VERSAO} {voz_pronta}")
        meta = arm.ler_json(f"projetos/{p}/catalogo.meta.json", padrao={})
        if meta.get("entrada") == chave_in and arm.existe(f"projetos/{p}/catalogo.txt"):
            return {"catalogo": meta.get("hash"), "tokens": meta.get("tokens"), "reaproveitado": True}
        ctx.progresso(0.2, f"Montando o catálogo de {len(analises)} arquivos.")
        cat, txt = montar(analises, pedido, p, limite=ctx.cfg.orcamento_entrada, trilhas=trilhas, modelos=modelos,
                          armazenamento=ctx.armazenamento, dados=ctx.cfg.dados, cfg=ctx.cfg)
        validar.validar("catalogo", cat)
        arm.gravar_json(f"projetos/{p}/catalogo.json", cat)
        arm.gravar_texto(f"projetos/{p}/catalogo.txt", txt)
        h = hash_texto(txt)
        arm.gravar_json(f"projetos/{p}/catalogo.meta.json", {"entrada": chave_in, "hash": h, "tokens": cat["orcamento"]["tokens_estimados"]})
        return {"catalogo": h, "tokens": cat["orcamento"]["tokens_estimados"], "clipes": len(cat["clipes"])}
