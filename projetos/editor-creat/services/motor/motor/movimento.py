"""Movimento, tremor e nitidez de cada clipe a cada 0,5 s (pedido do dono, 25/11: "foco nos vídeos de mais alta qualidade",
sem plano morto nem tremor forte; cada transição casada com o movimento da câmera).

Portado de projetos/itaitu-viagem/analise/medir_movimento.py (feito à mão para o filme do Itaitu), agora como biblioteca:
- medir(video) lê o vídeo UMA vez pelo ffmpeg, já reduzido (lado maior LADO_ANALISE px, cinza, no máximo FPS_MAX quadros/s)
  e mede por quadro o deslocamento da câmera (Lucas-Kanade + afim parcial, como a estabilização da montagem) e a nitidez
  (variância do Laplaciano). A série sai em janelas de `passo` segundos.
- Funções puras em cima da série (melhor_trecho, precisa_estabilizar, direcao_do_movimento, resumo): o catálogo, o
  resolvedor e a montagem decidem sem abrir o vídeo de novo.

Unidades (todas a "1080 do lado maior": o mesmo número vale para 4K, 1080p ou proxy):
- tremor: RMS do desvio da posição da câmera para a média móvel de 0,5 s, em px. É a MESMA conta do `jitter` da
  montagem (montagem/planos.py), que estabiliza sozinha acima de 1,5 px na saída; aqui o limiar fica igual.
- pan_x, pan_y: velocidade do movimento da CÂMERA em px/s (pan_x > 0 = câmera indo para a direita, a imagem corre para a
  esquerda; pan_y > 0 = câmera descendo). É baixa frequência: o tremor não entra.
- nitidez: variância do Laplaciano normalizada pelo percentil 90 do próprio clipe (0 a 1; 1 = tão nítido quanto o
  melhor do clipe). `nitidez_ref` guarda o p90 absoluto (na escala de análise) para comparar clipes entre si.
"""
from __future__ import annotations

import math
import subprocess
import tempfile

import numpy as np

VERSAO = "mov-1"
PASSO = 0.5
LADO_ANALISE = 480          # quadro reduzido: LK em 480 px é rápido em CPU e ainda mede subpixel
FPS_MAX = 30.0              # fonte de 60/120 fps é lida pulando quadros (tremor de mão fica abaixo de 15 Hz)
ESCALA_REF = 1080.0         # unidades em px a 1080 do lado maior

# Limiares (px a 1080 do lado maior; quando o plano amplia a fonte, o resolvedor multiplica pelo fator da saída)
LIMIAR_ESTAB = 1.5          # acima disto o plano é estabilizado (o mesmo gatilho do `jit_antes` da montagem)
LIMIAR_FORTE = 4.0          # tremor forte: a estabilização não salva sem cortar demais; evitar o trecho
PAN_MIN = 40.0              # px/s: abaixo disto a câmera está parada (para a transição não inventar direção)
PAN_CHICOTE = 900.0         # px/s: câmera virando rápido (chicote); bom para emenda, ruim como plano de mostrar
NITIDEZ_BORRADO = 0.45      # nitidez relativa abaixo disto = borrado (foco perdido, movimento rápido)
FALHAS_MAX = 0.3            # fração de quadros sem fluxo acima da qual o tremor não é confiável (quadro sem textura vira "firme")


# ---------------------------------------------------------------- medição
def _meta(video) -> tuple[int, int, float, float]:
    from motor.etapas.montagem.comum import meta
    m = meta(video)
    if not m.tem_video or m.w <= 0 or m.h <= 0:
        raise ValueError(f"{video}: sem vídeo para medir movimento")
    return m.w, m.h, (m.fps or 30.0), m.dur


def _quadros(video, w2: int, h2: int, pula: int, nice: bool = True):
    """Quadros em cinza, já reduzidos e girados (o ffmpeg aplica a rotação do arquivo), um por vez (memória fixa)."""
    vf = (f"select='not(mod(n\\,{pula}))'," if pula > 1 else "") + f"scale={w2}:{h2}:flags=area,format=gray"
    cmd = (["nice", "-n", "10"] if nice else []) + ["ffmpeg", "-nostdin", "-v", "error", "-i", str(video), "-an",
                                                     "-vf", vf, "-fps_mode", "passthrough", "-f", "rawvideo", "pipe:"]
    tam = w2 * h2
    # stderr num arquivo temporário, não num pipe: um arquivo corrompido gera milhares de "error while decoding" e, com
    # PIPE lido só no fim, o ffmpeg travaria escrevendo no stderr cheio enquanto aqui se espera o stdout (deadlock).
    err_f = tempfile.TemporaryFile()
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=err_f)
    try:
        while True:
            b = proc.stdout.read(tam)
            if len(b) < tam:
                break
            yield np.frombuffer(b, np.uint8).reshape(h2, w2)
    finally:
        proc.stdout.close()
        rc = proc.wait()
        err_f.seek(0, 2)
        err_f.seek(max(0, err_f.tell() - 2000))
        err = err_f.read().decode(errors="replace")
        err_f.close()
        if rc != 0:
            raise RuntimeError(f"ffmpeg não leu {video} para medir movimento: {err[-300:]}")


def _media_movel(x: np.ndarray, k: int) -> np.ndarray:
    if len(x) < 3 or k < 3:
        return x.copy()
    k = min(k, len(x) // 2 * 2 - 1)
    return np.convolve(np.pad(x, (k // 2, k // 2), mode="edge"), np.ones(k) / k, "valid")


def medir(video, passo: float = PASSO, *, inicio: float = 0.0, nice: bool = True) -> dict:
    """Série de movimento do vídeo em janelas de `passo` s (ver unidades no topo). `inicio` soma ao tempo (trecho cortado)."""
    import cv2
    w, h, fps, dur = _meta(video)
    s = LADO_ANALISE / max(w, h)
    w2, h2 = max(16, int(round(w * s / 2)) * 2), max(16, int(round(h * s / 2)) * 2)
    pula = max(1, int(round(fps / FPS_MAX)))
    fa = fps / pula
    px = ESCALA_REF / max(w2, h2)                        # px do quadro reduzido -> px a 1080 do lado maior
    desl, nit, falhas = [], [], 0
    prev = None
    for g in _quadros(video, w2, h2, pula, nice):
        nit.append(float(cv2.Laplacian(g, cv2.CV_64F).var()))
        if prev is not None:
            M = None
            p0 = cv2.goodFeaturesToTrack(prev, 200, 0.01, 8)
            if p0 is not None and len(p0) >= 10:
                p1, st, _ = cv2.calcOpticalFlowPyrLK(prev, g, p0, None)
                ok = st.ravel() == 1
                if ok.sum() >= 8:
                    M, _ = cv2.estimateAffinePartial2D(p0[ok], p1[ok], method=cv2.RANSAC, ransacReprojThreshold=1.5)
            if M is None:
                falhas += 1
                desl.append((0.0, 0.0))
            else:
                c = M @ np.array([w2 / 2, h2 / 2, 1.0])
                desl.append((c[0] - w2 / 2, c[1] - h2 / 2))
        prev = g
    nq = len(nit)
    if nq == 0:
        raise RuntimeError(f"{video}: nenhum quadro lido para medir movimento")
    d = np.array([(0.0, 0.0)] + desl, np.float64) * px     # d[i] = deslocamento da imagem do quadro i-1 para o i
    corte = np.hypot(d[:, 0], d[:, 1]) > 0.12 * ESCALA_REF   # salto enorme = corte de cena, não câmera
    d[corte] = 0.0
    pos = np.cumsum(d, 0)
    k = max(3, int(round(0.5 * fa)) | 1)
    res = np.stack([pos[:, j] - _media_movel(pos[:, j], k) for j in range(2)], 1)
    jit2 = res[:, 0] ** 2 + res[:, 1] ** 2
    vel = np.stack([_media_movel(d[:, j], max(3, int(round(0.25 * fa)) | 1)) for j in range(2)], 1) * fa
    nit = np.array(nit)
    ref = float(np.percentile(nit, 90)) or 1.0
    tq = np.arange(nq) / fa
    dur = max(dur, nq / fa)
    n = max(1, int(math.ceil(dur / passo - 1e-6)))
    jan = np.minimum((tq / passo).astype(int), n - 1)
    T, TR, PX, PY, NI = [], [], [], [], []
    for i in range(n):
        sel = jan == i
        if sel.any():
            TR.append(round(float(np.sqrt(jit2[sel].mean())), 3))
            PX.append(round(float(-vel[sel, 0].mean()), 1))       # câmera = contrário do que a imagem faz
            PY.append(round(float(-vel[sel, 1].mean()), 1))
            NI.append(round(float(min(1.0, np.median(nit[sel]) / ref)), 3))
        else:                                                      # janela sem quadro (fim parcial): repete a anterior
            TR.append(TR[-1] if TR else 0.0); PX.append(PX[-1] if PX else 0.0)
            PY.append(PY[-1] if PY else 0.0); NI.append(NI[-1] if NI else 1.0)
        T.append(round(inicio + i * passo, 3))
    return {"versao": VERSAO, "passo": passo, "unidade": "px a 1080 do lado maior", "fps_analise": round(fa, 3),
            "w": w, "h": h, "dur": round(dur, 3), "inicio": inicio, "falhas": round(falhas / max(1, nq - 1), 3),
            "nitidez_ref": round(ref, 1), "t": T, "tremor": TR, "pan_x": PX, "pan_y": PY, "nitidez": NI}


def juntar(series: list[dict]) -> dict:
    """Junta séries de trechos do mesmo arquivo (cada uma com seu `inicio`) numa só, em ordem de tempo."""
    series = sorted([s for s in series if s and s.get("t")], key=lambda s: s["t"][0])
    if not series:
        raise ValueError("nenhuma série para juntar")
    if len(series) == 1:
        return series[0]
    out = {k: v for k, v in series[0].items() if not isinstance(v, list)}
    for k in ("t", "tremor", "pan_x", "pan_y"):
        out[k] = [x for s in series for x in s[k]]
    # nitidez de cada trecho veio normalizada pelo p90 DELE: volta ao absoluto (× nitidez_ref do trecho) e renormaliza
    # pelo p90 do arquivo inteiro, senão um trecho todo mole valeria tanto quanto o mais nítido
    absol = np.array([x * float(s.get("nitidez_ref") or 1.0) for s in series for x in s["nitidez"]])
    ref = float(np.percentile(absol, 90)) if len(absol) else 1.0
    ref = ref or 1.0
    out["nitidez"] = [round(float(min(1.0, x / ref)), 3) for x in absol]
    out["nitidez_ref"] = round(ref, 1)
    nq = [max(1, len(s["t"])) for s in series]
    out["falhas"] = round(sum(float(s.get("falhas") or 0.0) * n for s, n in zip(series, nq)) / sum(nq), 3)
    out["dur"] = round(series[-1]["t"][-1] + series[-1]["passo"] - series[0]["t"][0], 3)
    return out


# ---------------------------------------------------------------- leitura da série (funções puras)
def _arr(serie: dict, k: str) -> np.ndarray:
    return np.asarray(serie.get(k) or [], dtype=float)


def _indices(serie: dict, t0: float, t1: float) -> np.ndarray:
    """Janelas que encostam em [t0, t1)."""
    t = _arr(serie, "t")
    p = float(serie.get("passo") or PASSO)
    if len(t) == 0:
        return np.zeros(0, int)
    sel = np.nonzero((t < t1 - 1e-6) & (t + p > t0 + 1e-6))[0]
    if len(sel) == 0:                                           # pedido fora da série: a janela mais próxima
        sel = np.array([int(np.argmin(np.abs(t + p / 2 - (t0 + t1) / 2)))])
    return sel


def tremor_em(serie: dict, t0: float, t1: float) -> float:
    """Tremor do trecho (px a 1080): percentil 75 das janelas, para um tranco curto não sumir na média."""
    tr = _arr(serie, "tremor")
    sel = _indices(serie, t0, t1)
    return float(np.percentile(tr[sel], 75)) if len(sel) and len(tr) else 0.0


def precisa_estabilizar(serie: dict, t0: float, t1: float, escala: float = 1.0) -> bool:
    """True se o trecho treme acima de LIMIAR_ESTAB (1,5 px). `escala` converte para a saída quando o recorte amplia a
    fonte (px na saída = px a 1080 × lado_maior/1080 × ampliação): o mesmo tremor aparece mais num recorte apertado."""
    return tremor_em(serie, t0, t1) * escala > LIMIAR_ESTAB


def tremor_forte(serie: dict, t0: float, t1: float, escala: float = 1.0) -> bool:
    """Acima de LIMIAR_FORTE (4 px) a estabilização corta demais ou deixa ondulando: o trecho deve ser evitado."""
    return tremor_em(serie, t0, t1) * escala > LIMIAR_FORTE


def notas(serie: dict, escala: float = 1.0) -> np.ndarray:
    """Qualidade de cada janela, 0 a 1: nitidez relativa, derrubada pelo tremor e pelo chicote (imagem corrida).
    `escala` põe o tremor em px da saída (a mesma de precisa_estabilizar): 2 px numa fonte 4K viram ~6 px no recorte."""
    nit, tr = _arr(serie, "nitidez"), _arr(serie, "tremor") * escala
    vel = np.hypot(_arr(serie, "pan_x"), _arr(serie, "pan_y"))
    if len(nit) == 0:
        return nit
    q = nit / (1.0 + (tr / LIMIAR_ESTAB) ** 2)
    q = np.where(tr > LIMIAR_FORTE, q * 0.3, q)
    return np.where(vel > PAN_CHICOTE, q * 0.5, q)


def melhor_trecho(serie: dict, dur: float, t0: float | None = None, t1: float | None = None,
                  escala: float = 1.0) -> tuple[float, float, float]:
    """Trecho de `dur` s mais nítido e estável dentro de [t0, t1] (padrão: o clipe inteiro). Devolve (início, fim, nota).

    Procura em passos de 0,1 s (a série é de 0,5 s, mas o plano começa onde for melhor) e, empatado, fica com o mais
    perto do começo da janela pedida (o diretor escolheu o momento por ali)."""
    t = _arr(serie, "t")
    p = float(serie.get("passo") or PASSO)
    if len(t) == 0:
        a = t0 or 0.0
        return a, a + dur, 0.0
    lo = t[0] if t0 is None else max(t0, t[0])
    hi = t[-1] + p if t1 is None else min(t1, t[-1] + p)
    if hi - lo <= dur + 1e-6:
        return round(lo, 3), round(min(hi, lo + dur) if hi > lo else lo + dur, 3), round(float(np.mean(notas(serie, escala)[_indices(serie, lo, lo + dur)])), 3)
    q = notas(serie, escala)
    melhor = (-1.0, lo)
    for a in np.arange(lo, hi - dur + 1e-6, 0.1):
        sel = _indices(serie, a, a + dur)
        pesos = np.array([min(a + dur, t[i] + p) - max(a, t[i]) for i in sel])   # janela parcial pesa menos
        nota = float(np.sum(q[sel] * pesos) / max(1e-9, pesos.sum()))
        if nota > melhor[0] + 0.01:
            melhor = (nota, float(a))
    return round(melhor[1], 3), round(melhor[1] + dur, 3), round(melhor[0], 3)


def melhores_trechos(serie: dict, dur: float = 2.0, n: int = 3) -> list[list[float]]:
    """Até `n` trechos de `dur` s sem sobreposição, do melhor para o pior ([t0, t1, nota]); nota < 0,5 não entra."""
    t = _arr(serie, "t")
    if len(t) == 0:
        return []
    p = float(serie.get("passo") or PASSO)
    livres = [(float(t[0]), float(t[-1] + p))]
    out = []
    while livres and len(out) < n:
        cands = [melhor_trecho(serie, dur, a, b) for a, b in livres if b - a >= dur - 1e-6]
        if not cands:
            break
        a, b, nota = max(cands, key=lambda c: c[2])
        if nota < 0.5:
            break
        out.append([round(a, 2), round(b, 2), round(nota, 2)])
        novos = []
        for x, y in livres:
            if y <= a or x >= b:
                novos.append((x, y))
            else:
                novos += [(x, a)] if a > x else []
                novos += [(b, y)] if y > b else []
        livres = novos
    return out


def trechos_tremidos(serie: dict, limiar: float = LIMIAR_FORTE, minimo_s: float = 1.0) -> list[list[float]]:
    """[t0, t1, px] dos trechos contínuos acima do limiar com pelo menos `minimo_s` s (o que o diretor deve evitar)."""
    t, tr = _arr(serie, "t"), _arr(serie, "tremor")
    p = float(serie.get("passo") or PASSO)
    out, ini = [], None
    for i in range(len(tr) + 1):
        acima = i < len(tr) and tr[i] > limiar
        if acima and ini is not None and t[i] - t[i - 1] > p + 1e-3:   # buraco entre trechos do arquivo: fecha o anterior
            if (i - ini) * p >= minimo_s - 1e-6:
                out.append([round(float(t[ini]), 2), round(float(t[i - 1] + p), 2), round(float(tr[ini:i].max()), 2)])
            ini = None
        if acima and ini is None:
            ini = i
        if not acima and ini is not None:
            if (i - ini) * p >= minimo_s - 1e-6:
                out.append([round(float(t[ini]), 2), round(float(t[i - 1] + p), 2), round(float(tr[ini:i].max()), 2)])
            ini = None
    return out


def direcao_do_movimento(serie: dict, t: float, janela: float = 0.5) -> dict:
    """Para onde a câmera vai em `t` (média de ±janela): {dx, dy (px/s), vel, direcao}. A transição segue esse sentido
    (whip para a direita se a câmera vira para a direita), em vez de um lado sorteado. Abaixo de PAN_MIN = 'parado'."""
    sel = _indices(serie, t - janela, t + janela)
    px, py = _arr(serie, "pan_x"), _arr(serie, "pan_y")
    if len(sel) == 0 or len(px) == 0:
        return {"dx": 0.0, "dy": 0.0, "vel": 0.0, "direcao": "parado"}
    dx, dy = float(px[sel].mean()), float(py[sel].mean())
    v = math.hypot(dx, dy)
    if v < PAN_MIN:
        nome = "parado"
    elif abs(dx) >= abs(dy):
        nome = "direita" if dx > 0 else "esquerda"
    else:
        nome = "baixo" if dy > 0 else "cima"
    return {"dx": round(dx, 1), "dy": round(dy, 1), "vel": round(v, 1), "direcao": nome}


def resumo(serie: dict) -> dict:
    """O que vai para a análise (sinais.movimento) e para o catálogo: números curtos, sem a série inteira."""
    tr, nit = _arr(serie, "tremor"), _arr(serie, "nitidez")
    q = notas(serie)
    return {
        "tremor_med": round(float(np.median(tr)), 2) if len(tr) else 0.0,
        "tremor_p90": round(float(np.percentile(tr, 90)), 2) if len(tr) else 0.0,
        "nitidez_ref": float(serie.get("nitidez_ref") or 0.0),
        "borrado_pct": round(float(np.mean(nit < NITIDEZ_BORRADO)), 2) if len(nit) else 0.0,
        "nota": round(float(np.mean(q)), 2) if len(q) else 0.0,
        "falhas": float(serie.get("falhas") or 0.0),
        "melhores": melhores_trechos(serie),
        "tremidos": trechos_tremidos(serie),
    }


def escala_saida(w: int | None, h: int | None, saida_w: int = 1080, saida_h: int = 1920, zoom: float = 1.0) -> float:
    """Fator px a 1080 do lado maior -> px na saída (lado maior/1080 × ampliação), o mesmo do resolvedor."""
    amp = ampliacao(w, h, saida_w, saida_h, zoom)
    return 1.0 if amp is None else max(w, h) / ESCALA_REF * amp


def texto_camera(res: dict, w: int | None, h: int | None, escala: float = 1.0) -> str:
    """Linha curta (até 80 caracteres) da câmera para o diretor: orientação e resolução, firmeza, nitidez e os melhores
    trechos. O tremor é classificado em px da SAÍDA (`escala`), o mesmo critério do resolvedor. Quando não cabe, os
    intervalos tremidos saem primeiro: o "melhor a-b" é o que o diretor usa para escolher."""
    def n(x):
        return f"{x:.1f}".rstrip("0").rstrip(".")
    cab = []
    if w and h:
        lado = max(w, h)
        res_txt = ("4K" if lado >= 3800 else "1440p" if lado >= 2500 else "1080p" if lado >= 1900
                   else "720p" if lado >= 1260 else f"{min(w, h)}p")
        cab.append(f"{'vertical' if h >= w else 'horizontal'} {res_txt}")
    tp = res.get("tremor_p90", 0.0) * escala
    if float(res.get("falhas") or 0.0) > FALHAS_MAX:
        firmeza = "tremor não medido"
    else:
        firmeza = "tremido forte" if tp > LIMIAR_FORTE else "tremido leve" if tp > LIMIAR_ESTAB else "firme"
    tremidos = " ".join(f"{n(a)}-{n(b)}" for a, b, _ in (res.get("tremidos") or [])[:2])
    borrado = f"borrado {int(round(res['borrado_pct'] * 100))}%" if res.get("borrado_pct", 0) >= 0.3 else ""
    melhor = ("melhor " + " ".join(f"{n(a)}-{n(b)}" for a, b, _ in res["melhores"][:3])) if res.get("melhores") else ""

    def junta(com_tremidos: bool, n_melhor: int) -> str:
        mel = ("melhor " + " ".join(f"{n(a)}-{n(b)}" for a, b, _ in res["melhores"][:n_melhor])) if melhor and n_melhor else ""
        partes = cab + [firmeza + (" " + tremidos if com_tremidos and tremidos else ""), borrado, mel]
        return " · ".join(x for x in partes if x)
    for opc in ((True, 3), (False, 3), (False, 2), (False, 1)):
        txt = junta(*opc)
        if len(txt) <= 80:
            return txt
    return junta(False, 1)[:80]


def ampliacao(w: int | None, h: int | None, saida_w: int = 1080, saida_h: int = 1920, zoom: float = 1.0) -> float | None:
    """Quanto o plano amplia a fonte (1,0 = pixel nativo; acima disso a imagem perde nitidez).

    Mesma conta da montagem (planos.render_plano): a janela base no formato da saída cabe na fonte (bw x bh) e o
    enquadre aperta `zoom` vezes; o fator é a largura da saída dividida pela largura da fonte que sobra no recorte."""
    if not w or not h:
        return None
    if w / h > saida_w / saida_h:
        bw = h * saida_w / saida_h
    else:
        bw = float(w)
    return round(saida_w * zoom / bw, 3)
