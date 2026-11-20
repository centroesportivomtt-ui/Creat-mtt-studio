"""VOZES: quem fala em cada trecho da transcrição, antes de virar fala do catálogo (item 4 do mapa).

Defeito que motivou (dono, 20/11, vídeo da cerveja): o Ruan ditou "vem comigo que eu vou te mostrar..." para a Lavínia, ela
repetiu, e o filme saiu com a voz DELE. A transcrição não diz quem fala, então o ditado e a repetição, colados no tempo,
viravam UMA fala do catálogo; com a frase duas vezes no trecho, o resolvedor pegava a primeira ocorrência: a do ditado.

O que este módulo faz, sem modelo pago (assinatura de voz CAM++ local, motor/etapas/falante.py):
1. divide cada segmento da transcrição nas pausas entre palavras (>= 0,30 s): a troca de quem fala sempre tem uma pausa;
2. assina cada pedaço (>= 0,6 s) e agrupa as vozes do projeto inteiro; a voz com mais tempo de fala é a "A" (principal);
   pedaço curto demais herda a voz do vizinho colado no mesmo segmento;
3. acha o DITADO: fala de outra voz que a voz principal repete logo depois (até 40 s no mesmo arquivo ou no começo do take
   seguinte), com >= 3 palavras em comum cobrindo >= 60% da frase mais curta. O catálogo mostra "DITADO -> F.." e o resolvedor
   troca sozinho o ditado pela repetição. A = voz principal (quem repete ditado; sem ditado, quem fala mais); B = outra pessoa.
Sem o modelo ou sem o áudio, nada muda (os segmentos seguem como vieram).
"""
from __future__ import annotations

import difflib
import logging
import re
import unicodedata

import numpy as np

log = logging.getLogger(__name__)

VERSAO = "v4"             # entra no hash do catálogo: mudou a régua, o catálogo guardado é refeito
PAUSA_DIVIDE = 0.30      # s entre palavras: aqui o pedaço pode trocar de voz
MIN_ASSIN = 0.8          # s: pedaço menor que isso não dá assinatura confiável (falante.MIN_S); herda do vizinho
LIMIAR = 0.42            # cosseno para "mesma voz" (o mesmo de falante.LIMIAR)
DITADO_JANELA = 40.0     # s: a repetição vem logo depois do ditado
DITADO_SEMELHANCA = 0.6
DITADO_OUTRO_ARQUIVO = 90.0   # s: a repetição pode estar no INÍCIO do take seguinte (a apresentadora regrava; dado real 20/11)
TOM_CURTA = (0.25, 0.8)        # s: pedaço curto sem assinatura é julgado pela altura da voz
TOM_LONGE = 0.40              # 40%+ longe da altura da voz principal = outra pessoa (homem x mulher ~80%; pergunta dela sobe 20-30%)
FUNCAO = frozenset("a o as os e de da do das dos que eu vou te me se um uma no na nos nas em pra para com por ai ta é e ne".split())
DITADO_MIN_PALAVRAS = 3
SR = 16000


def _tokens(s: str) -> list[str]:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.findall(r"[a-z0-9]+", s)


def dividir(seg: dict, pausa: float = PAUSA_DIVIDE) -> list[dict]:
    """Segmento -> pedaços nas pausas entre palavras. Sem palavras, o segmento inteiro é um pedaço."""
    pal = seg.get("palavras") or []
    if len(pal) < 2:
        return [dict(seg)]
    grupos, atual = [], [pal[0]]
    for w in pal[1:]:
        if w[0] - atual[-1][1] >= pausa:
            grupos.append(atual)
            atual = [w]
        else:
            atual.append(w)
    grupos.append(atual)
    out = []
    for g in grupos:
        confs = [w[3] for w in g if len(w) > 3 and w[3] is not None]
        out.append({**{k: v for k, v in seg.items() if k not in ("s", "e", "texto", "palavras", "conf")},
                    "s": g[0][0], "e": g[-1][1], "texto": " ".join(w[2] for w in g).strip(), "palavras": g,
                    "conf": (sum(confs) / len(confs)) if confs else seg.get("conf")})
    return out


def partir_repeticao(p: dict) -> list[dict]:
    """Pedaço com a MESMA frase duas vezes seguidas, sem pausa entre elas (ditado e repetição colados): corta onde a segunda
    começa. Precisa das palavras; frase de 3+ palavras repetida com semelhança >= 0,8."""
    pal = p.get("palavras") or []
    n = len(pal)
    if n < 6:
        return [p]
    toks = [" ".join(_tokens(w[2])) for w in pal]
    melhor, corte = 0.0, None
    for k in range(3, n - 2):
        a, b = " ".join(toks[:k]), " ".join(toks[k:2 * k])
        if len(toks) - k < 3:
            break
        s = semelhanca(a, b)
        if s >= 0.8 and s > melhor and abs((n - k) - k) <= max(2, k // 3):
            melhor, corte = s, k
    if corte is None:
        return [p]
    out = []
    for g in (pal[:corte], pal[corte:]):
        out.append({**{k2: v2 for k2, v2 in p.items() if k2 not in ("s", "e", "texto", "palavras")},
                    "s": g[0][0], "e": g[-1][1], "texto": " ".join(w[2] for w in g), "palavras": g})
    return out


def agrupar(assin: list, durs: list[float], limiar: float = LIMIAR) -> list[int]:
    """Agrupamento por centroide, em tempo linear (o aglomerativo de falante.agrupar é cúbico: 400 pedaços = 37 s). Pedaços
    mais longos primeiro (assinatura mais firme); cada um vai para o centroide mais parecido acima do limiar ou abre grupo.
    Devolve o grupo de cada pedaço (-1 = sem assinatura)."""
    ordem = sorted((i for i, a in enumerate(assin) if a is not None), key=lambda i: -durs[i])
    cent, soma, grupos = [], [], [-1] * len(assin)
    for i in ordem:
        a = np.asarray(assin[i], np.float64)
        if cent:
            sims = np.array([float(a @ c) for c in cent])
            k = int(np.argmax(sims))
            if sims[k] >= limiar:
                soma[k] = soma[k] + a * durs[i]
                cent[k] = soma[k] / (np.linalg.norm(soma[k]) + 1e-12)
                grupos[i] = k
                continue
        cent.append(a / (np.linalg.norm(a) + 1e-12))
        soma.append(a * durs[i])
        grupos[i] = len(cent) - 1
    return grupos


def semelhanca(a: str, b: str) -> float:
    """Quanto das palavras do ditado `a` aparece, na ordem, na repetição `b` (0..1)."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    m = difflib.SequenceMatcher(None, ta, tb, autojunk=False)
    return sum(bl.size for bl in m.get_matching_blocks()) / len(ta)


def casa_ditado(a: str, b: str) -> bool:
    """O ditado `a` e a repetição `b` dizem a mesma coisa? (revisão do Crivo: palavras soltas "que eu vou" casavam qualquer coisa)
    - os dois lados com >= 4 palavras;
    - um trecho CONTÍNUO de >= 3 palavras em comum, ou >= 3 palavras de conteúdo (não "que/eu/vou/de...") em comum, na ordem;
    - as palavras em comum cobrem >= 60% da frase mais curta e >= 35% da mais longa.
    Caso real da cerveja (passa): "Agora vem comigo que eu vou te mostrar as menos calorias aqui do Super" -> "Vem comigo que
    hoje irei te mostrar as que tem menos calorias"."""
    ta, tb = _tokens(a), _tokens(b)
    if len(ta) < 4 or len(tb) < 4:
        return False
    blocos = difflib.SequenceMatcher(None, ta, tb, autojunk=False).get_matching_blocks()
    m = sum(bl.size for bl in blocos)
    conteudo = sum(1 for bl in blocos for w in ta[bl.a:bl.a + bl.size] if w not in FUNCAO)
    if max(bl.size for bl in blocos) < 3 and conteudo < 3:
        return False
    return m / min(len(ta), len(tb)) >= DITADO_SEMELHANCA and m / max(len(ta), len(tb)) >= 0.35


def rotular(analises: list[dict], audio_de, assinador=None, cfg=None) -> list[dict]:
    """Devolve CÓPIAS das análises com os segmentos divididos e rotulados: seg["voz"] = "A" (principal), "B", ...; e, no
    ditado, seg["ditado"] = {"s": início do pedaço da repetição}. `audio_de(analise) -> (x float32 mono 16 kHz, offset s)`.
    O áudio é lido um arquivo por vez e solto logo depois (projeto com horas de material não estoura a memória).
    Sem assinador disponível ou sem áudio, devolve as análises como vieram."""
    from motor.etapas import falante as F
    if assinador is None:
        try:
            assinador = F.Assinador(cfg)
        except Exception as e:  # noqa: BLE001
            log.warning("assinatura de voz indisponível no catálogo: %s", e)
            return analises
    if not getattr(assinador, "disponivel", False):
        return analises
    novas, pedacos = [], []                          # pedacos: (i_analise, i_seg_original, pedaço)
    for ia, a in enumerate(analises):
        segs = []
        for iseg, s in enumerate((a.get("transcricao") or {}).get("segmentos") or []):
            for p0 in dividir(s):
                for p in partir_repeticao(p0):
                    segs.append(p)
                    pedacos.append((ia, iseg, p))
        novas.append({**a, "transcricao": {**a["transcricao"], "segmentos": segs}})
    if not pedacos:
        return analises
    durs = [max(0.0, float(p["e"]) - float(p["s"])) for _, _, p in pedacos]
    assin: list = [None] * len(pedacos)
    tons: list = [None] * len(pedacos)
    tons_a_medir: list = []
    for ia in range(len(analises)):
        ks = [k for k, (ja, _, _) in enumerate(pedacos) if ja == ia and durs[k] >= TOM_CURTA[0]]
        if not ks:
            continue
        try:
            x, off = audio_de(analises[ia])
        except Exception as e:  # noqa: BLE001 - sem áudio deste arquivo: os pedaços dele ficam sem voz
            log.warning("sem áudio para rotular vozes de %s: %s", analises[ia]["arquivo"].get("nome"), e)
            continue
        for k in ks:
            p = pedacos[k][2]
            i0, i1 = int(round((p["s"] - off) * SR)), int(round((p["e"] - off) * SR))
            trecho = x[max(0, i0):max(0, i1)]
            if not len(trecho):
                continue
            if durs[k] >= MIN_ASSIN:
                assin[k] = assinador.assinar(trecho, SR, minimo=MIN_ASSIN)
            if assin[k] is None or durs[k] < TOM_CURTA[1] or len(tons_a_medir) < 400:
                tons[k] = F.tom_hz(trecho, SR)               # altura: pedaço sem assinatura e amostra da voz A
                tons_a_medir.append(k)
        del x                                         # um arquivo por vez na memória
    grupos = agrupar(assin, durs)
    if all(g < 0 for g in grupos):
        return analises
    tempo: dict[int, float] = {}
    for g, d in zip(grupos, durs):
        if g >= 0:
            tempo[g] = tempo.get(g, 0.0) + d
    # pedaço curto herda do vizinho colado do MESMO segmento original (meia palavra não muda de dono)
    for k in range(len(pedacos)):
        if grupos[k] < 0:
            for j in (k - 1, k + 1):
                if 0 <= j < len(pedacos) and pedacos[j][:2] == pedacos[k][:2] and grupos[j] >= 0:
                    grupos[k] = grupos[j]
                    break
    # ditado (simétrico): fala de uma voz que OUTRA voz repete logo depois: no mesmo arquivo (até 40 s) ou no começo do take
    # seguinte (até 90 s dele; a apresentadora regrava). Quem repete é quem apresenta.
    import bisect
    datados = sorted((i for i in range(len(analises)) if analises[i]["arquivo"].get("gravado_em")),
                     key=lambda i: (analises[i]["arquivo"]["gravado_em"], analises[i]["arquivo"]["nome"], analises[i]["arquivo"]["id"]))
    seguinte = {ia: datados[r + 1:r + 3] for r, ia in enumerate(datados)}   # até 2 takes depois (b-roll no meio); sem data, não cruza
    por_arq: dict[int, list[tuple[float, int]]] = {}
    for j, (ja, _, q) in enumerate(pedacos):
        por_arq.setdefault(ja, []).append((q["s"], j))
    for lst in por_arq.values():
        lst.sort()
    inicios = {ja: [s for s, _ in lst] for ja, lst in por_arq.items()}

    def janela(ja, de, ate):
        i0, i1 = bisect.bisect_left(inicios[ja], de), bisect.bisect_right(inicios[ja], ate)
        return [j for _, j in por_arq[ja][i0:i1]]
    pares = []
    for k, (ia, _, p) in enumerate(pedacos):
        if grupos[k] < 0 or len(_tokens(p["texto"])) < 4:
            continue
        cands = janela(ia, p["e"], p["e"] + DITADO_JANELA)
        for ja in seguinte.get(ia, []):
            if ja in por_arq:
                cands += janela(ja, 0.0, DITADO_OUTRO_ARQUIVO)
        cands = [j for j in cands if grupos[j] >= 0 and grupos[j] != grupos[k]]
        for j in cands:
            ja, _, q = pedacos[j]
            texto, fim = q["texto"], q["e"]                     # a repetição pode ter pausas: junta até 3 pedaços dela
            for m in range(j + 1, min(len(pedacos), j + 3)):
                ma, _, r = pedacos[m]
                if ma != ja or grupos[m] != grupos[j] or r["s"] - fim > 1.5:
                    break
                texto, fim = texto + " " + r["texto"], r["e"]
            if casa_ditado(p["texto"], texto):
                pares.append((k, j))
                break
    # voz principal: quem mais REPETE ditados (a apresentadora); sem ditado, quem fala mais tempo
    repete: dict[int, int] = {}
    for _, j in pares:
        repete[grupos[j]] = repete.get(grupos[j], 0) + 1
    principal = max(repete, key=lambda g: (repete[g], tempo.get(g, 0.0))) if repete else max(tempo, key=tempo.get)
    # A = voz principal; qualquer outra = B ("outra pessoa"): no material real a mesma pessoa da equipe se espalhava em vários
    # grupos (microfone longe, take diferente), e para quem dirige só importa "é ela" ou "não é"
    for (_, _, p), g in zip(pedacos, grupos):
        p["voz"] = ("A" if g == principal else "B") if g >= 0 else None
    # pedaço curto sem assinatura: altura da voz 20% ou mais longe da principal = outra pessoa ("Pode ir?", "Valeu!")
    tons_a = [tm for (_, _, p), tm in zip(pedacos, tons) if p["voz"] == "A" and tm]
    if tons_a:
        ref = float(np.median(tons_a))
        for (_, _, p), tm in zip(pedacos, tons):
            if p["voz"] is None and tm and abs(tm / ref - 1.0) >= TOM_LONGE:      # só quem ficou sem assinatura
                p["voz"] = "B"
    for k, j in pares:
        if pedacos[j][2].get("voz") == "A":                     # só vale ditado que a voz principal repete
            pedacos[k][2]["ditado"] = {"s": pedacos[j][2]["s"], "arquivo": analises[pedacos[j][0]]["arquivo"]["id"]}
    return novas
