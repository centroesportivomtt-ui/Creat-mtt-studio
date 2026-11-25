"""COR no estilo DaVinci: medir a cena, equilibrar (primárias) e aplicar o look do ambiente, com a pele protegida.

Ordem dos "nós" (como no DaVinci): 1) balanço por cena (exposição + branco, medidos) -> 2) look do ambiente
(lift/gamma/gain por canal, contraste em S, ombro suave nas altas) -> 3) saturação com a pele protegida.
1) e 2) viram UMA LUT 1D por canal (cv2.LUT, ~1 ms por quadro 1080x1920); 3) é uma matriz 3x3 com máscara de pele
em 1/4 da resolução.

- LOOKS: a biblioteca por ambiente (loja, rua_dia, rua_noite, academia, palco, neutro). `exportar_cube()` grava o mesmo
  look + balanço como .cube 3D (abre no DaVinci/Premiere) para o colorista conferir ou continuar.
- medir(): histograma de luma (p2/p50/p98, 32 faixas), estouro e esmagamento, ganho de branco pelos pixels quase
  neutros, céu, cores fortes e tom de pele (ângulo no vetorscópio; a linha de pele fica perto de 123°).
- classificar(): heurística (sem IA) do look pela medição. Academia não se distingue de loja pela cor: vem do pedido.
- balanco(): exposição até o alvo do look (no máximo +40%/-25%) e branco com a força do look (noite e palco mantêm
  a luz colorida de propósito).
- COR VIVA (regra do dono, 25/11: "cores vivas, natureza brilhando… não deixa a imagem cinzenta"): nenhum look derruba a
  saturação abaixo da fonte. O lift e o contraste também lavam a cor, então a saturação do nó 3 é medida numa paleta fixa
  e sobe até a saída ficar pelo menos tão saturada quanto a entrada (sat_efetiva). Só um look marcado `"dessatura": true`
  (pedido explícito da direção, ex.: bloco de memória) pode sair mais pálido. checar_saturacao() mede antes/depois por plano.
"""
from __future__ import annotations

from collections import OrderedDict

import numpy as np

VERSAO = "c3"               # c2: cor viva (piso de saturação medido); c3: croma relativo à luma (escurecer não é lavar). Cache antigo é refeito

# A biblioteca mora em memoria/cor/looks.json (o Caderno da casa mostra; o motor falso do site lê o mesmo arquivo).
def _carregar_looks() -> dict[str, dict]:
    import json

    from motor import config
    import pathlib
    padrao = json.loads((pathlib.Path(__file__).with_name("cor_looks.json")).read_text(encoding="utf-8"))["looks"]
    try:                       # a memória pode ser um volume antigo sem a pasta cor/: o motor sobe com o padrão do pacote
        da_casa = json.loads((config.MEMORIA / "cor" / "looks.json").read_text(encoding="utf-8"))["looks"]
    except (OSError, ValueError, KeyError):
        return padrao
    return {**padrao, **da_casa}


LOOKS: dict[str, dict] = _carregar_looks()

PELE_LINHA = 123.0           # graus no vetorscópio (Cb, Cr)
PELE_FAIXA = (105.0, 145.0)  # fora disso a pele está verde/amarela demais ou magenta demais
_WY = np.array([0.0722, 0.7152, 0.2126])  # pesos BGR da luma BT.709


def _cv2():
    import cv2
    return cv2


# ---------------------------------------------------------------- medição
def _peq(bgr, largura: int = 360):
    cv2 = _cv2()
    h, w = bgr.shape[:2]
    if w <= largura:
        return bgr
    return cv2.resize(bgr, (largura, max(2, int(round(h * largura / w)))), interpolation=cv2.INTER_AREA)


def mascara_pele(bgr) -> np.ndarray:
    """Pele pela faixa clássica em YCrCb (Cr 135-180, Cb 85-135) e luz mínima. uint8 0/255."""
    cv2 = _cv2()
    ycc = cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb)
    return cv2.inRange(ycc, np.array([40, 135, 85], np.uint8), np.array([250, 180, 135], np.uint8))


def medir(bgr, rostos: list | None = None) -> dict:
    """Medição de um quadro (qualquer tamanho; mede em 360 px). rostos = caixas normalizadas [x, y, w, h, ...]."""
    cv2 = _cv2()
    img = _peq(bgr)
    h, w = img.shape[:2]
    f = img.astype(np.float32) / 255.0
    y = f @ _WY.astype(np.float32)
    p2, p50, p98 = (float(v) for v in np.percentile(y, [2, 50, 98]))
    hist = np.histogram(y, bins=32, range=(0, 1))[0].astype(np.float64)
    hist /= max(1.0, hist.sum())
    mx = img.max(axis=2)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    s = hsv[:, :, 1].astype(np.float32) / 255.0
    v = hsv[:, :, 2].astype(np.float32) / 255.0
    # branco: só pelos pixels quase neutros de meio-tom (parede, gôndola, camisa branca). Sem área neutra confiável
    # (quadro dominado por uma cor: fundo verde, parede colorida) não se corrige o branco: "mundo cinza" ali erra feio.
    base = (s < 0.22) & (y > 0.15) & (y < 0.92)
    if base.mean() >= 0.02:
        mb, mg, mr = (float(f[:, :, c][base].mean()) for c in range(3))
        ganho = [mg / max(mr, 1e-3), 1.0, mg / max(mb, 1e-3)]
    else:
        ganho = [1.0, 1.0, 1.0]
    ganho = [round(float(np.clip(g, 0.8, 1.25)), 3) for g in ganho]
    topo = f[: max(1, h // 4)]
    tb, tg, tr = (float(topo[:, :, c].mean()) for c in range(3))
    ceu = bool(tb > tr + 0.05 and tb >= tg * 0.97 and float((topo @ _WY.astype(np.float32)).mean()) > 0.5)
    pele = None
    m = mascara_pele(img) > 0
    if rostos:
        mr_ = np.zeros_like(m)
        for c in rostos:
            x0, y0, cw, ch = c[:4]
            a, b = int((x0 + cw * 0.2) * w), int((y0 + ch * 0.2) * h)
            c1, d1 = int((x0 + cw * 0.8) * w), int((y0 + ch * 0.8) * h)
            mr_[max(0, b):max(0, d1), max(0, a):max(0, c1)] = True
        if (m & mr_).sum() >= 30:
            m = m & mr_
    if m.sum() >= max(30, 0.003 * m.size):
        ycc = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb).astype(np.float32)
        cr, cb = ycc[:, :, 1][m] - 128.0, ycc[:, :, 2][m] - 128.0
        ang = np.degrees(np.arctan2(cr, cb)) % 360.0
        pele = {"angulo": round(float(np.median(ang)), 1), "sat": round(float(np.median(np.hypot(cr, cb)) / 128.0), 3),
                "fracao": round(float(m.mean()), 4), "rgb": [round(float(np.median(f[:, :, c][m])), 3) for c in (2, 1, 0)]}
    return {
        "p2": round(p2, 3), "p50": round(p50, 3), "p98": round(p98, 3),
        "estouro": round(float((mx >= 250).mean()), 4), "esmagado": round(float((y <= 0.02).mean()), 4),
        "ganho_wb": ganho, "ceu": ceu, "cores_fortes": round(float(((s > 0.6) & (v > 0.4)).mean()), 4),
        "sat_media": round(float(s.mean()), 3), "pele": pele, "hist": [round(float(x), 4) for x in hist],
    }


def mediana(meds: list[dict]) -> dict | None:
    """Junta as medições dos quadros-chave de uma cena (mediana por campo; histograma pela média)."""
    meds = [m for m in meds if m]
    if not meds:
        return None
    if len(meds) == 1:
        return meds[0]
    out = {}
    for k in ("p2", "p50", "p98", "estouro", "esmagado", "cores_fortes", "sat_media"):
        out[k] = round(float(np.median([m[k] for m in meds])), 4 if k in ("estouro", "esmagado", "cores_fortes") else 3)
    out["ganho_wb"] = [round(float(np.median([m["ganho_wb"][i] for m in meds])), 3) for i in range(3)]
    out["ceu"] = sum(bool(m["ceu"]) for m in meds) * 2 > len(meds)
    peles = [m["pele"] for m in meds if m.get("pele")]
    out["pele"] = None if not peles else {k: round(float(np.median([p[k] for p in peles])), 4 if k == "fracao" else (1 if k == "angulo" else 3))
                                          for k in ("angulo", "sat", "fracao")}
    if peles and all(p.get("rgb") for p in peles):
        out["pele"]["rgb"] = [round(float(np.median([p["rgb"][i] for p in peles])), 3) for i in range(3)]
    out["hist"] = [round(float(x), 4) for x in np.mean([m["hist"] for m in meds], axis=0)]
    return out


def angulo_rgb(rgb) -> float:
    """Ângulo no vetorscópio (Cb, Cr BT.601, como o OpenCV) de uma cor r, g, b em 0..1."""
    r, g, b = (float(x) for x in rgb)
    yy = 0.299 * r + 0.587 * g + 0.114 * b
    return float(np.degrees(np.arctan2((r - yy) * 0.713, (b - yy) * 0.564)) % 360.0)


def _dist_linha(ang: float) -> float:
    d = abs(ang - PELE_LINHA) % 360.0
    return min(d, 360.0 - d)


def classificar(med: dict | None) -> str:
    """Look pela medição (heurística, sem IA): escuro + cores fortes = palco; escuro = rua à noite;
    céu azul claro no topo = rua de dia; o resto (interno) = loja. Academia vem do pedido."""
    if not med:
        return "neutro"
    if med["p50"] < 0.24:
        return "palco" if med["cores_fortes"] > 0.08 else "rua_noite"
    if med.get("ceu"):
        return "rua_dia"
    return "loja"


def balanco(med: dict | None, look: str) -> dict | None:
    """Primárias da cena: ganho de branco (força do look) e exposição até o alvo do look."""
    if not med:
        return None
    L = LOOKS.get(look, LOOKS["neutro"])
    forca = float(L["wb"])
    g = [1.0 + forca * (x - 1.0) for x in med["ganho_wb"]]
    rgb = (med.get("pele") or {}).get("rgb")
    if rgb:                                   # a pele é a trava: o branco recua até não afastá-la da linha natural
        d0 = _dist_linha(angulo_rgb(rgb))
        for _ in range(6):
            if _dist_linha(angulo_rgb([c * k for c, k in zip(rgb, g)])) <= max(d0 + 2.0, 6.0):
                break
            forca *= 0.5
            g = [1.0 + forca * (x - 1.0) for x in med["ganho_wb"]]
        else:
            g = [1.0, 1.0, 1.0]
    p50 = max(0.02, float(med["p50"]))
    e = (float(L["alvo"]) / p50) ** 0.5
    e = min(e, 1.25 if med["p98"] > 0.9 else 1.4) if e > 1 else max(e, 0.75)
    return {"ganho": [round(x, 3) for x in g], "exp": round(float(e), 3)}


# ---------------------------------------------------------------- curvas e aplicação
def _ombro(v: np.ndarray, G: float) -> np.ndarray:
    """Ganho total G > 1 empurraria as altas para fora: do joelho k = 2 - G até G, a curva dobra suave (derivada
    contínua) e chega a 1 exatamente em G. Nada vira branco chapado; com G <= 1 a curva não é tocada."""
    if G <= 1.0:
        return v
    k = max(0.2, 2.0 - G)
    a = v > k
    out = v.copy()
    u = np.clip((v[a] - k) / (G - k), 0, 1)
    out[a] = k + (1 - k) * u * (2 - u)
    return out


def curva_canal(x: np.ndarray, c: int, look: dict, bal: dict | None) -> np.ndarray:
    """x em 0..1 -> 0..1 para o canal c (0=r, 1=g, 2=b)."""
    G = float(look["gain"][c]) * (float(bal["ganho"][c]) * float(bal["exp"]) if bal else 1.0)
    v = _ombro(x.astype(np.float64) * G, G)
    lift = float(look["lift"][c])
    v = lift + v * (1 - lift)
    v = np.clip(v, 0, 1) ** (1.0 / float(look["gamma"][c]))
    v = v + float(look["con"]) * (v - 0.5) * (1 - (2 * v - 1) ** 2) * 1.6
    return np.clip(v, 0, 1)


_CACHE: OrderedDict = OrderedDict()
SAT_PISO = 1.0               # saída / fonte, medida na paleta: nunca mais pálida que a fonte
SAT_TOLERANCIA = 0.97        # aviso do relatório: depois < 97% do antes (abaixo disso o olho já vê "lavado")
SAT_TETO = 1.6               # a compensação não passa disso (cor de desenho animado)
_PALETA = None


def _paleta():
    """Cores de teste: 12 matizes x 4 saturações x 5 luzes, do quase preto ao quase branco (cena de noite é quase toda
    sombra, onde o contraste em S tira cor), BGR uint8."""
    global _PALETA
    if _PALETA is None:
        cv2 = _cv2()
        hsv = np.array([[(h, s, v) for h in range(0, 180, 15) for s in (60, 120, 180, 240) for v in (40, 90, 150, 210, 245)]], np.uint8)
        _PALETA = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
    return _PALETA


def _sat_hsv(bgr) -> float:
    cv2 = _cv2()
    return float(cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)[:, :, 1].astype(np.float64).mean())


def _croma(bgr) -> float:
    """Distância do cinza no plano Cb/Cr DIVIDIDA pela luma de cada pixel: é o que o olho lê como "cor". A saturação HSV
    sozinha engana (o lift e o contraste sobem o S do HSV mesmo com a cor ficando mais cinza), então o piso vale para as
    duas medidas. Sem dividir pela luma, o croma cai junto com a exposição (Cb/Cr escalam com o RGB) e todo plano que o
    balanço escurece (exp 0,75 a 0,8) saía com +20 a +30% de saturação sem estar lavado (revisão M4, 25/11)."""
    cv2 = _cv2()
    ycc = cv2.cvtColor(bgr, cv2.COLOR_BGR2YCrCb).astype(np.float64)
    return float((np.hypot(ycc[:, :, 1] - 128.0, ycc[:, :, 2] - 128.0) / np.maximum(ycc[:, :, 0], 16.0)).mean())


def dessatura(look: str) -> bool:
    return bool((LOOKS.get(look) or {}).get("dessatura"))


def sat_efetiva(look: str, lut) -> float:
    """Saturação do nó 3 que garante saída >= fonte na paleta (o pedido do look é o ponto de partida, nunca o teto)."""
    cv2 = _cv2()
    s = float(LOOKS.get(look, LOOKS["neutro"])["sat"])
    if dessatura(look):
        return s
    pal = _paleta()
    b_hsv, b_cr = _sat_hsv(pal), _croma(pal)
    for _ in range(8):
        M = ((1 - s) * np.tile(_WY, (3, 1)) + s * np.eye(3)).astype(np.float32)
        o = cv2.LUT(pal, lut)
        o = cv2.transform(o, M) if abs(s - 1) >= 1e-3 else o
        r = min(_sat_hsv(o) / max(b_hsv, 1e-6), _croma(o) / max(b_cr, 1e-6))
        if r >= SAT_PISO - 1e-3 or s >= SAT_TETO:
            break
        s = min(SAT_TETO, s * (SAT_PISO / max(r, 0.3)) + 0.005)
    return round(s, 4)


def checar_saturacao(antes: dict | None, depois: dict | None, look: str) -> dict | None:
    """Saturação média antes/depois do plano (medir().sat_media) e um aviso quando a saída ficou mais pálida que a fonte
    sem a direção ter pedido (look sem `dessatura`). Fonte quase sem cor (< 0,03) não gera aviso: não há o que lavar."""
    if not antes or not depois or antes.get("sat_media") is None or depois.get("sat_media") is None:
        return None
    a, d = float(antes["sat_media"]), float(depois["sat_media"])
    out = {"antes": round(a, 3), "depois": round(d, 3), "razao": round(d / a, 3) if a > 1e-6 else None, "aviso": None}
    if a >= 0.03 and d < a * SAT_TOLERANCIA and not dessatura(look):
        out["aviso"] = (f"cor ficou mais pálida que a fonte ({a:.2f} para {d:.2f}, {100 * (1 - d / a):.0f}% a menos) sem a direção "
                        f"ter pedido (look {look})")
    return out


def _tabelas(look: str, bal: dict | None):
    chave = (look, None if not bal else (tuple(bal["ganho"]), bal["exp"]))
    if chave in _CACHE:
        _CACHE.move_to_end(chave)
        return _CACHE[chave]
    L = LOOKS.get(look, LOOKS["neutro"])
    x = np.linspace(0, 1, 256)
    luts = [(curva_canal(x, c, L, bal) * 255 + 0.5).astype(np.uint8) for c in (2, 1, 0)]   # BGR
    lut = np.stack(luts, 1).reshape(256, 1, 3)
    s = sat_efetiva(look if look in LOOKS else "neutro", lut)
    Msat = ((1 - s) * np.tile(_WY, (3, 1)) + s * np.eye(3)).astype(np.float32)
    t = (lut, Msat, abs(s - 1) < 1e-3, float(L["pele"]))
    _CACHE[chave] = t
    if len(_CACHE) > 64:
        _CACHE.popitem(last=False)
    return t


def aplicar(img, look: str, bal: dict | None = None):
    """Balanço + look num quadro BGR uint8. A pele recebe só parte da saturação do look (pele=1: nenhuma)."""
    cv2 = _cv2()
    lut, Msat, sem_sat, prot = _tabelas(look, bal)
    o = cv2.LUT(img, lut)
    if sem_sat:
        return o
    sat = cv2.transform(o, Msat)
    if prot <= 0:
        return sat
    h, w = o.shape[:2]
    peq = cv2.resize(o, (max(2, w // 4), max(2, h // 4)), interpolation=cv2.INTER_AREA)
    m = cv2.GaussianBlur(mascara_pele(peq), (0, 0), 2.0)
    if not m.any():
        return sat
    w2 = cv2.resize(m, (w, h), interpolation=cv2.INTER_LINEAR).astype(np.float32) * (prot / 255.0)
    return cv2.blendLinear(sat, o, 1.0 - w2, w2)


def aplicar_balanco(img, bal: dict | None):
    """Só o nó 1 (primárias), para planos com look legado da tabela antiga."""
    if not bal:
        return img
    cv2 = _cv2()
    x = np.linspace(0, 1, 256)
    luts = [(np.clip(_ombro(x * bal["ganho"][c] * bal["exp"], bal["ganho"][c] * bal["exp"]), 0, 1) * 255 + 0.5).astype(np.uint8) for c in (2, 1, 0)]
    return cv2.LUT(img, np.stack(luts, 1).reshape(256, 1, 3))


def exportar_cube(look: str, bal: dict | None, caminho, n: int = 33) -> str:
    """Grava o look (+ balanço) como LUT 3D .cube (R varia mais rápido), sem a proteção de pele (que depende da imagem)."""
    L = LOOKS.get(look, LOOKS["neutro"])
    x = np.linspace(0, 1, n)
    cr, cg, cb = (curva_canal(x, c, L, bal) for c in range(3))
    m00 = float(_tabelas(look if look in LOOKS else "neutro", bal)[1][0, 0])       # a mesma saturação viva do render
    s = (m00 - float(_WY[0])) / (1 - float(_WY[0]))
    wr, wg, wb_ = 0.2126, 0.7152, 0.0722
    linhas = [f'TITLE "creat.MTT {L["nome"]}"', f"LUT_3D_SIZE {n}", "DOMAIN_MIN 0.0 0.0 0.0", "DOMAIN_MAX 1.0 1.0 1.0"]
    for b in range(n):
        for g in range(n):
            for r in range(n):
                R, G, B = cr[r], cg[g], cb[b]
                Y = wr * R + wg * G + wb_ * B
                R, G, B = (min(1.0, max(0.0, Y + s * (c - Y))) for c in (R, G, B))
                linhas.append(f"{R:.6f} {G:.6f} {B:.6f}")
    texto = "\n".join(linhas) + "\n"
    with open(caminho, "w", encoding="ascii") as fh:
        fh.write(texto)
    return str(caminho)


def resumo(med: dict | None) -> dict | None:
    """Versão curta da medição para a revisão (sem histograma)."""
    if not med:
        return None
    return {k: med[k] for k in ("p2", "p50", "p98", "estouro", "esmagado", "pele") if k in med}


def pele_ok(pele: dict | None) -> bool:
    return pele is None or PELE_FAIXA[0] <= float(pele["angulo"]) <= PELE_FAIXA[1]


def distancia_pele(pele: dict | None) -> float | None:
    if not pele:
        return None
    return round(_dist_linha(float(pele["angulo"])), 1)


def catalogo() -> list[dict]:
    """Looks para o Caderno da casa e para o diretor."""
    return [{"id": k, "nome": v["nome"], "desc": v["desc"]} for k, v in LOOKS.items()]


if __name__ == "__main__":       # python -m motor.etapas.cor cube <look> <saida.cube>
    import sys
    if len(sys.argv) == 4 and sys.argv[1] == "cube" and sys.argv[2] in LOOKS:
        print(exportar_cube(sys.argv[2], None, sys.argv[3]))
    else:
        print("uso: python -m motor.etapas.cor cube <" + "|".join(LOOKS) + "> <saida.cube>")
        sys.exit(2)
