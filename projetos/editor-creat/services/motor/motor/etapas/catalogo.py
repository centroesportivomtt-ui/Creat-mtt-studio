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
        f = s.get("falante")
        if out and out[-1]["falante"] == f and s["s"] - out[-1]["t1"] <= GAP_JUNTA_S and s["e"] - out[-1]["t0"] <= MAX_FALA_S:
            out[-1]["t1"] = s["e"]
            out[-1]["texto"] += " " + texto
            out[-1]["confs"].append(s.get("conf"))
        else:
            out.append({"t0": s["s"], "t1": s["e"], "falante": f, "texto": texto, "confs": [s.get("conf")]})
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
           modelos: list[str] | None = None, armazenamento=None, dados=None) -> tuple[dict, str]:
    pedido = pedido or {}
    palavras_pedido = {w for w in tokens(pedido.get("texto", "") + " " + " ".join(pedido.get("obrigatorio", [])))
                       if len(w) >= 5 and w not in GENERICAS}
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
        for k, f in enumerate(falas_do_arquivo(a), 1):
            falas.append({"id": f"F{num}.{k}", "t0": round(f["t0"], 2), "t1": round(f["t1"], 2), "falante": f["falante"],
                          "texto": f["texto"], "truncado": False, "energia": _energia_rel(serie, passo, f["t0"], f["t1"], ref)})
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
        })
    cat = {"versao": "1", "projeto": projeto, "orcamento": {"tokens_estimados": 0, "limite": limite, "cortes": []}, "clipes": clipes,
           "trilhas": [{k: t[k] for k in ("id", "clima", "bpm", "dur") if k in t} for t in (trilhas or [])],
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


def _camera(a, vis) -> str:
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
    if any(f.get("falante") for c in clipes for f in c["falas"]):
        return frozenset()
    ids = set()
    for c in clipes:
        fortes = [m for m in c["momentos"] if m["tipo"].startswith("fala")
                  and (m["nota"] >= 4 or m.get("desc", "").startswith("fala com rosto"))]
        for f in c["falas"]:
            if any(m["t0"] < f["t1"] and m["t1"] > f["t0"] for m in fortes):
                ids.add(f["id"])
    return frozenset(ids)


def _texto(cat: dict, nivel: int, palavras_pedido: set[str], protegidas=frozenset()) -> str:
    cl = cat["clipes"]
    total = sum(c["dur"] for c in cl)
    tipos = sorted({m["tipo"] for c in cl for m in c["momentos"]})
    trilhas = ", ".join(f"{t['id']} ({_num(t['bpm'])} bpm, {_num(t['dur'])} s{', ' + t['clima'] if t.get('clima') else ''})" for t in cat.get("trilhas", []))
    linhas = [f"# PROJETO {cat['projeto']} · {len(cl)} clipes · {_num(total / 60)} min · momentos: {','.join(tipos)}",
              f"# trilhas: {trilhas or 'nenhuma'} · modelos: {', '.join(cat.get('modelos') or []) or 'evento-reel'}",
              "# C=clipe (arquivo \"nome\" dur · câmera · pessoas · ambientes · resumo) · M=momento t0-t1 tipo nota(1-5) desc · "
              "F=fala t0-t1 FALANTE e.energia «texto». Tempos em s da fonte. Use só estes ids."]
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
            linhas.append(f" {f['id']} {_num(f['t0'])}-{_num(f['t1'])} {f['falante'] or '?'}{e} «{texto}»")
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
        trilhas = armazem_b.trilhas(ctx.cfg)
        from motor.memoria import loja
        modelos = loja.Loja().nomes_modelos()
        chave_in = hash_texto(json.dumps([a["arquivo"]["id"] for a in analises]) + json.dumps(pedido, sort_keys=True, ensure_ascii=False)
                              + json.dumps([len(json.dumps(a)) for a in analises]))
        meta = arm.ler_json(f"projetos/{p}/catalogo.meta.json", padrao={})
        if meta.get("entrada") == chave_in and arm.existe(f"projetos/{p}/catalogo.txt"):
            return {"catalogo": meta.get("hash"), "tokens": meta.get("tokens"), "reaproveitado": True}
        ctx.progresso(0.2, f"Montando o catálogo de {len(analises)} arquivos.")
        cat, txt = montar(analises, pedido, p, limite=ctx.cfg.orcamento_entrada, trilhas=trilhas, modelos=modelos,
                          armazenamento=ctx.armazenamento, dados=ctx.cfg.dados)
        validar.validar("catalogo", cat)
        arm.gravar_json(f"projetos/{p}/catalogo.json", cat)
        arm.gravar_texto(f"projetos/{p}/catalogo.txt", txt)
        h = hash_texto(txt)
        arm.gravar_json(f"projetos/{p}/catalogo.meta.json", {"entrada": chave_in, "hash": h, "tokens": cat["orcamento"]["tokens_estimados"]})
        return {"catalogo": h, "tokens": cat["orcamento"]["tokens_estimados"], "clipes": len(cat["clipes"])}
