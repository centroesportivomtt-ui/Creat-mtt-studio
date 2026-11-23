"""FX: transições e efeitos de impacto aplicados quadro a quadro na composição (V2 comp.whip + V1 fx.py, como biblioteca).

Cada efeito do EDL `fx[]` = {tipo, t, dur?, forca?, dir?}. Os efeitos são funções puras (quadro BGR uint8 -> quadro) e
só tocam os quadros dentro da sua janela; fora dela o quadro passa intacto (custo zero).
- whip: chicote horizontal (desloca + borra na direção), máximo junto do corte (V2, aprovado);
- flash / impacto (tremor + flash curto) / zoomt (soco de zoom) / bloom (brilho nas altas luzes) / leak (vazamento de luz quente);
- rush (borrão radial de mergulho) / gagueira (quadro repetido em ritmo) / foto (clique: flash + dessatura) / fade (do/para preto);
- aba71 e mascara: o desenho fica no overlay (camada `transicao` do kit); aqui entra o mergulho de câmera que casa com ele;
- match: corte casado, nada a fazer na imagem;
- revela: revelação de laboratório (negativo laranja -> positivo, ou o contrário), frente circular com borda de ruído e
  menisco claro; os mesmos números da camada `revelacao` do kit (o texto latente nasce junto com a imagem);
- salto: a película salta no projetor: o plano que sai sobe, o que entra chega de baixo, com a linha preta da emenda e
  borrão vertical. Precisa do quadro do plano vizinho (`vizinhos`, que a composição entrega).
"""
from __future__ import annotations

import math
from functools import lru_cache

import numpy as np

PADRAO_DUR = {"whip": 0.33, "flash": 0.25, "impacto": 0.30, "zoomt": 0.40, "bloom": 0.5, "leak": 0.9, "rush": 0.35,
              "gagueira": 0.4, "foto": 0.3, "fade": 0.5, "aba71": 0.8, "mascara": 0.5, "match": 0.0, "revela": 1.9,
              "salto": 0.20}
CENTRADOS = ("whip", "aba71", "mascara", "rush", "salto")   # janela centrada no corte t

# revela: base laranja do negativo (#C8742F em BGR / 255) e o breu do quarto escuro (#120D0A em BGR)
_BASE_NEG = np.array([0x2F, 0x74, 0xC8], np.float32) / 255.0
BREU = (0x0A, 0x0D, 0x12)
REF_W, REF_H = 1080, 1920                                    # origem, raios e espessuras vêm em px deste quadro


def _cv2():
    import cv2
    return cv2


def janela(e: dict) -> tuple[float, float]:
    """Intervalo (s) em que o efeito mexe na imagem.

    revela: no modo 'abre' vale de `desde` (início do plano; padrão 0) até t+dur, porque antes da frente tudo é negativo;
    no modo 'fecha' vale de t até `ate` (fim do plano; sem ele, só a transição), porque depois dela tudo fica negativo.
    `preparar()` preenche `desde`/`ate` com os limites do plano que contém t."""
    d = float(e.get("dur") or PADRAO_DUR.get(e["tipo"], 0.3))
    t = float(e["t"])
    if e["tipo"] == "revela":
        if e.get("modo", "abre") == "fecha":
            return t, max(t + d, float(e["ate"])) if e.get("ate") is not None else t + d
        return min(t, float(e.get("desde") or 0.0)), t + d
    if e["tipo"] in CENTRADOS:
        return t - d / 2, t + d / 2
    if e["tipo"] == "fade" and t < 0.1:
        return 0.0, d
    return t, t + d


def _escala(img, s: float, dx: float = 0.0, dy: float = 0.0):
    cv2 = _cv2()
    h, w = img.shape[:2]
    M = np.float32([[s, 0, (1 - s) * w / 2 + dx], [0, s, (1 - s) * h / 2 + dy]])
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def meio(e: dict) -> float:
    """Instante mais representativo da transição (o QA de olho olha aqui): o meio da frente na revela, o centro da janela nos outros."""
    if e["tipo"] == "revela":
        return float(e["t"]) + float(e.get("dur") or PADRAO_DUR["revela"]) / 2
    a, b = janela(e)
    return (a + b) / 2


def preparar(efeitos: list[dict], planos: list[dict]) -> list[dict]:
    """Cópia dos efeitos com os limites que dependem dos planos: revela 'abre' ganha `desde` = início do plano que contém t
    e revela 'fecha' ganha `ate` = fim desse plano (quando o EDL não os traz). Os outros passam iguais."""
    out = []
    for e in efeitos:
        if e.get("tipo") == "revela" and planos:
            t = float(e["t"])
            dono = next((p for p in planos if p["t0"] - 1e-6 <= t < p["t1"]), None)
            if dono is None:                                  # t num buraco: o último plano que começou antes
                antes = [p for p in planos if p["t0"] <= t]
                dono = max(antes, key=lambda p: p["t0"]) if antes else min(planos, key=lambda p: p["t0"])
            e = dict(e)
            if e.get("modo", "abre") == "fecha":
                e.setdefault("ate", float(dono["t1"]))
            else:
                e.setdefault("desde", float(dono["t0"]))
        out.append(e)
    return out


def rmax_minimo(origem, amp: float = 70.0, soft: float = 40.0) -> float:
    """Menor rmax com que a frente termina sem sobra: canto mais longe do quadro 1080x1920 + amp + soft. Abaixo disso
    sobra negativo (abre) ou positivo (fecha) no último quadro da frente, e no quadro seguinte a imagem estoura de uma vez."""
    ox, oy = float(origem[0]), float(origem[1])
    return max(math.hypot(cx - ox, cy - oy) for cx in (0, REF_W) for cy in (0, REF_H)) + float(amp) + float(soft)


def problemas(edl: dict) -> list[str]:
    """Erros de EDL que o schema não pega e que quebrariam em silêncio no render (o `validar_edl` reprova com eles):
    - revela (FX) e frentes da camada `revelacao`: rmax abaixo de `rmax_minimo` (pulo no fim da frente); frente sem início;
    - salto (FX): `t` fora da fronteira entre dois planos (o quadro do vizinho mostrado na emenda seria de outro plano);
    - camada `transicao` tipo salto: camada de `entra` cujo `de` não é corte − dur/2 (não aparece na faixa de baixo
      antes do corte, ou aparece crua antes da janela). Tolerância: 1 quadro."""
    fps = float((edl.get("formato") or {}).get("fps", 30) or 30)
    tol = 1.0 / fps + 1e-6
    out: list[str] = []

    def frente(f: dict, onde: str, ini_chave: tuple[str, ...]):
        ini = next((f.get(k) for k in ini_chave if f.get(k) is not None), None)
        if ini is None:
            out.append(f"{onde}: frente sem início ({' ou '.join(ini_chave)})")
        modo = f.get("modo", "abre")
        if f.get("rmax") is not None:
            o = f.get("origem") or ([540, 1980] if modo == "fecha" else [540, 960])
            minimo = rmax_minimo(o, f.get("amp", 70), f.get("soft", 40))
            if float(f["rmax"]) + 1e-6 < minimo:
                out.append(f"{onde}: rmax {float(f['rmax']):g} não cobre o quadro a partir de {list(o)} (mínimo {math.ceil(minimo)}; "
                           f"ou omita rmax): sobra imagem no fim da frente e ela estoura no quadro seguinte")

    for i, e in enumerate(edl.get("fx") or []):
        if e.get("tipo") == "revela":
            frente(e, f"fx[{i}] revela t={e.get('t')}", ("t",))
    planos = sorted(edl.get("planos") or [], key=lambda p: float(p["t0"]))
    cortes = [float(b["t0"]) for a, b in zip(planos, planos[1:]) if abs(float(a["t1"]) - float(b["t0"])) <= tol]
    for i, e in enumerate(edl.get("fx") or []):
        if e.get("tipo") == "salto" and planos and not any(abs(float(e["t"]) - c) <= tol for c in cortes):
            out.append(f"fx[{i}] salto t={float(e['t']):g}: fora da fronteira entre dois planos (cortes: "
                       f"{', '.join(f'{c:g}' for c in cortes) or 'nenhum'})")
    camadas = {m.get("id"): m for m in edl.get("motion") or []}
    for m in edl.get("motion") or []:
        pr = m.get("props") or {}
        if m.get("modelo") == "revelacao":
            for k, f in enumerate(pr.get("frentes") or []):
                frente(f, f"motion {m.get('id')} frentes[{k}]", ("de", "t"))
            for k, L in enumerate(pr.get("latentes") or []):
                if L.get("frente") is not None and not 0 <= int(L["frente"]) < len(pr.get("frentes") or []):
                    out.append(f"motion {m.get('id')} latentes[{k}]: frente {L['frente']} inexistente")
        elif m.get("modelo") == "transicao" and pr.get("tipo") == "salto":
            dur = float(pr.get("dur", 0.2))
            corte = float(pr["corte"]) if pr.get("corte") is not None else (float(m["de"]) + float(m["ate"])) / 2
            for cid in pr.get("entra") or []:
                alvo = camadas.get(cid)
                if alvo is None:
                    out.append(f"motion {m.get('id')} salto: camada '{cid}' de `entra` não existe")
                elif abs(float(alvo["de"]) - (corte - dur / 2)) > tol:
                    out.append(f"motion {m.get('id')} salto: camada '{cid}' entra em {float(alvo['de']):g}, "
                               f"devia entrar em corte − dur/2 = {corte - dur / 2:g}")
    return out


# ---------------------------------------------------------------- revela
@lru_cache(maxsize=8)
def _ruido(seed: int, w: int, h: int) -> np.ndarray:
    """Ruído suave determinístico: grade 68x120 (a mesma proporção do quadro) ampliada em cúbica para w x h, em 0..1."""
    cv2 = _cv2()
    g = np.random.default_rng(int(seed)).random((120, 68)).astype(np.float32)
    return np.clip(cv2.resize(g, (w, h), interpolation=cv2.INTER_CUBIC), 0.0, 1.0)


@lru_cache(maxsize=8)
def _distancia(ox: float, oy: float, w: int, h: int) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    return np.hypot(xx - ox, yy - oy)


def _origem(e: dict) -> tuple[float, float]:
    o = e.get("origem") or ([540, 1980] if e.get("modo", "abre") == "fecha" else [540, 960])
    return float(o[0]), float(o[1])


def raio_revela(e: dict, tt: float) -> float:
    """r(t) = rmax·(0,5 − 0,5·cos(π·prog)), em px do quadro 1080x1920. Sem `rmax`, o raio cobre o quadro inteiro
    (distância até o canto mais longe + amp + soft), para a frente terminar sem sobra de negativo."""
    d = float(e.get("dur") or PADRAO_DUR["revela"])
    p = min(1.0, max(0.0, (tt - float(e["t"])) / max(1e-6, d)))
    if e.get("rmax") is not None:
        rmax = float(e["rmax"])
    else:
        rmax = rmax_minimo(_origem(e), e.get("amp", 70), e.get("soft", 40))
    return rmax * (0.5 - 0.5 * math.cos(math.pi * p))


def mascara_revela(e: dict, tt: float, w: int, h: int) -> np.ndarray:
    """m = clip((r − d + amp·(2n − 1)) / soft, 0, 1): 1 = onde a frente já passou (positivo no 'abre', negativo no 'fecha')."""
    sx, sy = w / REF_W, h / REF_H
    ox, oy = _origem(e)
    soft = max(1e-3, float(e.get("soft", 40)))
    n = _ruido(int(e.get("seed", 7)), w, h)
    m = (raio_revela(e, tt) * sx - _distancia(ox * sx, oy * sy, w, h) + float(e.get("amp", 70)) * sx * (2 * n - 1)) / (soft * sx)
    return np.clip(m, 0.0, 1.0)


def negativo(img) -> np.ndarray:
    """neg = 255 − img; neg = neg·0,65 + neg·(#C8742F/255)·0,35; contraste 0,85 em torno de 128. float32."""
    neg = 255.0 - img.astype(np.float32)
    neg = neg * (0.65 + 0.35 * _BASE_NEG)
    return (neg - 128.0) * 0.85 + 128.0


def _revela(img, tt: float, e: dict) -> np.ndarray:
    t, d = float(e["t"]), float(e.get("dur") or PADRAO_DUR["revela"])
    fecha = e.get("modo", "abre") == "fecha"
    neg = negativo(img)
    if (not fecha and tt < t) or (fecha and tt >= t + d):    # antes da frente (abre) / depois dela (fecha): só negativo
        return np.clip(neg, 0, 255).astype(np.uint8)
    h, w = img.shape[:2]
    m = mascara_revela(e, tt, w, h)[:, :, None]
    pos = img.astype(np.float32)
    out = pos * m + neg * (1 - m) if not fecha else neg * m + pos * (1 - m)
    out += 38.0 * (1.0 - np.abs(2.0 * m - 1.0))              # menisco: a borda molhada da frente brilha
    return np.clip(out, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------- salto
def _vizinho(vizinhos: dict | None, nome: str, w: int, h: int):
    v = (vizinhos or {}).get(nome)
    if callable(v):
        v = v()
    if v is None or v.shape[:2] != (h, w):
        v = np.empty((h, w, 3), np.uint8)
        v[:] = BREU                                          # sem o vizinho: película vazia (breu)
    return v


def _salto(img, tt: float, e: dict, a: float, b: float, vizinhos: dict | None) -> np.ndarray:
    """Antes do corte o quadro atual (que sai) sobe s = H·0,5·k e o primeiro quadro do plano seguinte ocupa a faixa de baixo;
    depois do corte o atual (que entra) chega de baixo, deslocado H·0,5·k, e o último quadro do plano anterior ocupa a faixa
    de cima. k = (1 − |tt − t|/(dur/2))^1,6: no corte a emenda passa por H/2 dos dois lados (movimento contínuo)."""
    cv2 = _cv2()
    h, w = img.shape[:2]
    t = float(e["t"])
    k = max(0.0, 1 - abs(tt - t) / max(1e-6, (b - a) / 2)) ** 1.6
    s = int(round(h * 0.5 * k))
    if s <= 0:
        return img
    out = np.empty_like(img)
    if tt < t:                                               # sai subindo: emenda em H − s
        out[:h - s] = img[s:]
        out[h - s:] = _vizinho(vizinhos, "seguinte", w, h)[:s]
        emenda = h - s
    else:                                                    # entra de baixo: emenda em s
        out[s:] = img[:h - s]
        out[:s] = _vizinho(vizinhos, "anterior", w, h)[h - s:]
        emenda = s
    kk = int(round(40 * (h / REF_H) * k * float(e.get("forca") or 1.0))) | 1
    if kk > 1:
        out = cv2.blur(out, (1, kk))                         # borrão vertical do salto (máx. 40 px no corte)
    meia = max(1, int(round(12 * h / REF_H)))
    out[max(0, emenda - meia):min(h, emenda + meia)] = BREU  # linha preta de 24 px na emenda, nítida
    return out


def aplicar(img, tt: float, efeitos: list[dict], historico: list, vizinhos: dict | None = None) -> np.ndarray:
    """`vizinhos` (opcional, só o salto usa): {"anterior": último quadro do plano anterior, "seguinte": primeiro quadro do
    plano seguinte}; cada valor pode ser o quadro ou uma função sem argumentos que o devolve (leitura sob demanda)."""
    cv2 = _cv2()
    for e in efeitos:
        a, b = janela(e)
        if not (a <= tt < b):
            continue
        tipo, f = e["tipo"], float(e.get("forca") or 1.0)
        t = float(e["t"])
        d = max(1e-3, b - a)
        u = (tt - a) / d                                   # 0..1 dentro da janela
        if tipo == "whip":
            antes = tt < t
            k = max(0.0, 1 - abs(tt - t) / (d / 2)) ** 1.6
            if k > 0.02:
                dr = float(e.get("dir") or 1)
                img = cv2.warpAffine(img, np.float32([[1, 0, dr * k * 420 * f * (1 if antes else -1)], [0, 1, 0]]),
                                     (img.shape[1], img.shape[0]), borderMode=cv2.BORDER_REPLICATE)
                kk = int(k * 150 * f) | 1
                if kk > 1:
                    img = cv2.blur(img, (kk, 1))
        elif tipo in ("flash", "foto"):
            k = f * (1 - u) ** 1.5
            if tipo == "foto":
                g = cv2.cvtColor(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR)
                img = cv2.addWeighted(img, 1 - 0.7 * (1 - u), g, 0.7 * (1 - u), 0)
            img = np.clip(img.astype(np.float32) * (1 + k * 0.6) + 255 * k * 0.55, 0, 255).astype(np.uint8)
        elif tipo == "impacto":
            k = (1 - u) ** 2
            rng = np.random.default_rng(int(tt * 1000))
            img = _escala(img, 1 + 0.03 * f * k, *(rng.uniform(-1, 1, 2) * 26 * f * k))
            if u < 0.35:
                kf = 0.5 * f * (1 - u / 0.35)
                img = np.clip(img.astype(np.float32) * (1 + kf * 0.5) + 255 * kf * 0.35, 0, 255).astype(np.uint8)
        elif tipo == "zoomt":
            img = _escala(img, 1 + 0.08 * f * math.sin(math.pi * min(1.0, u * 1.6)) ** 2 if u < 0.62 else 1 + 0.08 * f * (1 - (u - 0.62) / 0.38) ** 2)
        elif tipo == "bloom":
            k = f * math.sin(math.pi * u)
            hi = cv2.GaussianBlur(np.clip(img.astype(np.int16) - 170, 0, 255).astype(np.uint8), (0, 0), 28)
            img = cv2.addWeighted(img, 1.0, hi, 1.4 * k, 0)
        elif tipo == "leak":
            h, w = img.shape[:2]
            k = f * math.sin(math.pi * u) * 0.55
            x = np.linspace(-1, 1, w, dtype=np.float32)[None, :] - (u * 2.4 - 1.2)
            y = np.linspace(-1, 1, h, dtype=np.float32)[:, None] * 0.35
            m = np.exp(-(x ** 2 + y ** 2) / 0.18)[:, :, None] * k
            img = np.clip(img.astype(np.float32) + m * np.array([60, 150, 255], np.float32), 0, 255).astype(np.uint8)
        elif tipo == "rush":
            k = f * (1 - abs(tt - t) / (d / 2))
            acc = img.astype(np.float32)
            for s in (1 + 0.025 * k, 1 + 0.05 * k, 1 + 0.08 * k):
                acc += _escala(img, s).astype(np.float32)
            img = (acc / 4).astype(np.uint8)
        elif tipo == "gagueira":
            fase = int(u * d * 30) % 4
            if fase in (1, 2) and historico:
                img = historico[-fase].copy() if len(historico) >= fase else img
        elif tipo == "fade":
            k = u if (t < 0.1) else (1 - u)
            img = (img.astype(np.float32) * max(0.0, min(1.0, k))).astype(np.uint8)
        elif tipo == "revela":
            img = _revela(img, tt, e)
        elif tipo == "salto":
            img = _salto(img, tt, e, a, b, vizinhos)
        elif tipo in ("aba71", "mascara"):
            k = 1 - abs(tt - t) / (d / 2)
            if tt < t:                                     # mergulho de câmera até o corte
                img = _escala(img, 1 + 0.35 * f * k ** 2)
            else:                                          # íris abre a cena nova
                h, w = img.shape[:2]
                r = (1 - k) * math.hypot(w, h) / 2
                yy, xx = np.ogrid[:h, :w]
                mask = ((xx - w / 2) ** 2 + (yy - h / 2) ** 2 <= r * r).astype(np.uint8)
                img = img * mask[:, :, None]
    return img


def ativos(efeitos: list[dict], tt: float) -> bool:
    return any(janela(e)[0] <= tt < janela(e)[1] for e in efeitos)


def janelas_escuras(efeitos: list[dict]) -> list[tuple[float, float]]:
    """Intervalos em que o preto é intencional (fade e íris da aba71): o QA de quadros pretos não reprova neles."""
    return [janela(e) for e in efeitos if e["tipo"] in ("fade", "aba71", "mascara")]
