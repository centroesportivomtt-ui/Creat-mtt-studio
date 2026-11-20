"""VOZES: quem fala em cada trecho da transcrição, antes de virar fala do catálogo (item 4 do mapa).

Defeito que motivou (dono, 20/11, vídeo da cerveja): o Ruan ditou "vem comigo que eu vou te mostrar..." para a Lavínia, ela
repetiu, e o filme saiu com a voz DELE. A transcrição não diz quem fala, então o ditado e a repetição, colados no tempo,
viravam UMA fala do catálogo; com a frase duas vezes no trecho, o resolvedor pegava a primeira ocorrência: a do ditado.

O que este módulo faz, sem modelo pago (assinatura de voz CAM++ local, motor/etapas/falante.py):
1. divide cada segmento da transcrição nas pausas entre palavras (>= 0,30 s): a troca de quem fala sempre tem uma pausa;
2. assina cada pedaço (>= 0,6 s) e agrupa as vozes do projeto inteiro; a voz com mais tempo de fala é a "A" (principal);
   pedaço curto demais herda a voz do vizinho colado no mesmo segmento;
3. acha o DITADO: pedaço de outra voz (B, C...) que a voz principal repete em até 40 s no mesmo arquivo (as mesmas palavras,
   semelhança >= 0,6). O catálogo mostra "DITADO -> F.." e o resolvedor troca sozinho o ditado pela repetição.
Sem o modelo ou sem o áudio, nada muda (os segmentos seguem como vieram).
"""
from __future__ import annotations

import difflib
import logging
import re
import unicodedata

import numpy as np

log = logging.getLogger(__name__)

PAUSA_DIVIDE = 0.30      # s entre palavras: aqui o pedaço pode trocar de voz
MIN_ASSIN = 0.6          # s: pedaço menor que isso não dá assinatura (herda do vizinho)
DITADO_JANELA = 40.0     # s: a repetição vem logo depois do ditado
DITADO_SEMELHANCA = 0.6
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


def semelhanca(a: str, b: str) -> float:
    """Quanto das palavras do ditado `a` aparece, na ordem, na repetição `b` (0..1)."""
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    m = difflib.SequenceMatcher(None, ta, tb, autojunk=False)
    return sum(bl.size for bl in m.get_matching_blocks()) / len(ta)


def rotular(analises: list[dict], audio_de, assinador=None, cfg=None) -> list[dict]:
    """Devolve CÓPIAS das análises com os segmentos divididos e rotulados: seg["voz"] = "A" (principal), "B", ...; e, no
    ditado, seg["ditado"] = {"s": início do pedaço da repetição}. `audio_de(analise) -> (x float32 mono 16 kHz, offset s)`.
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
            for p in dividir(s):
                segs.append(p)
                pedacos.append((ia, iseg, p))
        b = {**a, "transcricao": {**a["transcricao"], "segmentos": segs}}
        novas.append(b)
    if not pedacos:
        return analises
    audios = {}
    assin, durs = [], []
    for ia, _, p in pedacos:
        if ia not in audios:
            try:
                audios[ia] = audio_de(analises[ia])
            except Exception as e:  # noqa: BLE001 - sem áudio deste arquivo: os pedaços dele ficam sem voz
                log.warning("sem áudio para rotular vozes de %s: %s", analises[ia]["arquivo"].get("nome"), e)
                audios[ia] = None
        d = float(p["e"]) - float(p["s"])
        durs.append(max(0.0, d))
        au = audios[ia]
        if au is None or d < MIN_ASSIN:
            assin.append(None)
            continue
        x, off = au
        i0, i1 = int(round((p["s"] - off) * SR)), int(round((p["e"] - off) * SR))
        trecho = x[max(0, i0):max(0, i1)]
        assin.append(assinador.assinar(trecho, SR, minimo=MIN_ASSIN) if len(trecho) else None)
    g = F.agrupar(assin, durs)
    if g["principal"] is None:
        return analises
    ordem = sorted(g["tempo"], key=lambda k: -g["tempo"][k])               # principal primeiro, depois por tempo
    letra = {grp: chr(ord("A") + i) for i, grp in enumerate(ordem)}
    rot = [letra.get(grp) if grp >= 0 else None for grp in g["grupos"]]
    # pedaço curto herda do vizinho colado do MESMO segmento original (meia palavra não muda de dono)
    for k in range(len(pedacos)):
        if rot[k] is None:
            for j in (k - 1, k + 1):
                if 0 <= j < len(pedacos) and pedacos[j][:2] == pedacos[k][:2] and rot[j] is not None:
                    rot[k] = rot[j]
                    break
    for (_, _, p), r in zip(pedacos, rot):
        p["voz"] = r
    # ditado: outra voz, e a principal repete as mesmas palavras logo depois, no mesmo arquivo
    for k, (ia, _, p) in enumerate(pedacos):
        if rot[k] in (None, "A") or len(_tokens(p["texto"])) < DITADO_MIN_PALAVRAS:
            continue
        for j in range(k + 1, len(pedacos)):
            ja, _, q = pedacos[j]
            if ja != ia or q["s"] - p["e"] > DITADO_JANELA:
                break
            if rot[j] != "A":
                continue
            texto, fim = q["texto"], q["e"]                     # a repetição pode ter pausas: junta até 3 pedaços dela
            for m in range(j + 1, min(len(pedacos), j + 3)):
                ma, _, r = pedacos[m]
                if ma != ia or rot[m] != "A" or r["s"] - fim > 1.5:
                    break
                texto, fim = texto + " " + r["texto"], r["e"]
            if semelhanca(p["texto"], texto) >= DITADO_SEMELHANCA:
                p["ditado"] = {"s": q["s"]}
                break
    return novas
