"""cobertura_sintonia: quando a fala passa por cima de outro take, a imagem conversa com a fala (revisão do dono 19/11:
"take por cima da fala não pode mostrar o falante olhando para outro lado"; entrava take em que a apresentadora olhava para
outro lado, distraída, ou sorria para a câmera, enquanto a voz dela seguia).

Integração de 19/11 (duas sessões fizeram a mesma checagem: `cobertura_desconectada` e `cobertura_sintonia`): uma checagem
só, com o id que o site e a memória já usavam (`cobertura_sintonia`), que junta o que os dois lados detectavam.

"Cobertura" = trecho do filme (>= 0,08 s) com fala em que o plano na tela NÃO é o take sincronizado daquela fala. Sincronizado
= mesma CÂMERA (trechos 'c3_0', 'c3_1' do mesmo clipe são a mesma câmera, no mesmo relógio de fonte), plano sem rampa de tempo,
e tempos de fonte a menos de 0,25 s no começo, no meio E no fim do cruzamento (com `vel` diferente a diferença cresce para as
pontas). Janela/PiP também entra: a pessoa na janela também está na tela.
Para cada plano de cobertura, amostra quadros do FINAL (~0,4 s, no mínimo 2) e roda o detector de rosto da frente A (o mesmo
de legenda_sobre_rosto). A pessoa está na tela quando: rosto com altura >= 5% do quadro em >= 30% das amostras, OU em 2
amostras seguidas (a pessoa que entra só no fim de um plano longo), OU rosto em PRIMEIRO PLANO (>= 30% da largura do quadro: close; o plano médio entra pelas outras pistas)
na maioria das amostras. Pessoa na tela exige `plano.cobertura: {olhar: produto|camera|acao, assunto}` posta por quem dirigiu
e OLHOU o take; sem ela, ou com assunto vazio, reprova. olhar 'camera' = rosto falando para a câmera fora do take da fala (boca
fora de sincronia): reprova sempre. Sem detector, com cobertura para conferir: NÃO VERIFICADO, reprova. "Fora do assunto" é
semântica: fica com a revisão por IA (olho do Claude) e com o `assunto` anotado.

A decisão é pura (`cruzamentos`, `coberturas`, `decidir`) e o detector é injetável (`checar(c, detector=)`, `c._rostos` ou
`_detector`), para teste."""
from __future__ import annotations

import math

ID, BLOQUEIA = "cobertura_sintonia", True
SINC_TOL_S = 0.25
PASSO_AMOSTRA = 0.4
MIN_AMOSTRAS = 2
ROSTO_ALTURA_MIN = 0.05
FRACAO_ROSTO_MIN = 0.30
SEGUIDAS_ROSTO_MIN = 2         # amostras seguidas com rosto: a fração sozinha deixava passar quem aparece só no fim do plano
ROSTO_MIN = 0.30               # largura do rosto / largura do quadro: rosto em primeiro plano (0,20 pegava b-roll comum; revisão de 19/11)
CRUZAMENTO_MIN_S = 0.08        # encostar 1-2 quadros na emenda não é cobertura
OLHARES = ("produto", "camera", "acao")


def _base(fid: str) -> str:
    """'c3_1' (trecho 1 do clipe c3) e 'c3' são a mesma câmera (o resolvedor parte o clipe em trechos com o mesmo relógio s)."""
    cabeca, _, rabo = str(fid).rpartition("_")
    return cabeca if cabeca and rabo.isdigit() else str(fid)


def _src(x: dict, t: float) -> float:
    return float(x["s0"]) + (t - float(x["t0"])) * float(x.get("vel", 1.0) or 1.0)


def cruzamentos(planos: list[dict], vozes: list[dict]) -> list[dict]:
    """Cada par plano x peça de voz que se cruza no filme: {"plano", "voz", "a", "b", "sincronizado"}."""
    out = []
    for p in planos:
        for v in vozes:
            a, b = max(float(p["t0"]), float(v["t0"])), min(float(p["t1"]), float(v["t1"]))
            if b - a < CRUZAMENTO_MIN_S:
                continue
            sinc = (not p.get("rampa") and _base(p["fonte"]) == _base(v["fonte"])
                    and all(abs(_src(p, t) - _src(v, t)) < SINC_TOL_S for t in (a, (a + b) / 2, b)))
            out.append({"plano": p["id"], "voz": v["id"], "a": round(a, 3), "b": round(b, 3), "sincronizado": bool(sinc)})
    return out


def coberturas(planos: list[dict], vozes: list[dict]) -> dict[str, list[tuple[float, float]]]:
    """Planos de cobertura (dedup por id) -> trechos do filme em que cobrem fala que não é deles."""
    out: dict[str, list] = {}
    for x in cruzamentos(planos, vozes):
        if not x["sincronizado"]:
            out.setdefault(x["plano"], []).append((x["a"], x["b"]))
    return out


SOBRE_MIN = 0.5                # s de fala por baixo para o olho de IA olhar a cobertura


def coberturas_do_edl(edl: dict) -> list[dict]:
    """Para o olho de IA (olho_ia.pontos_de_risco): cada plano que cobre fala que não é dele, por >= SOBRE_MIN s, fora janela/PiP
    -> [{plano, t0, t1, voz, texto}] com o trecho de sobreposição (a régua de sincronia é a mesma de `cruzamentos`)."""
    planos = [p for p in edl.get("planos", []) or [] if not p.get("janela")]
    voz = edl.get("voz", []) or []
    texto = {v["id"]: str(v.get("texto") or "") for v in voz}
    return [{"plano": x["plano"], "t0": x["a"], "t1": x["b"], "voz": x["voz"], "texto": texto.get(x["voz"], "")}
            for x in cruzamentos(planos, voz) if not x["sincronizado"] and x["b"] - x["a"] >= SOBRE_MIN]


def tempos_amostra(trechos: list[tuple[float, float]], passo: float = PASSO_AMOSTRA, minimo: int = MIN_AMOSTRAS) -> list[float]:
    """Instantes no meio de fatias de ~`passo` s de cada trecho; ao todo pelo menos `minimo`."""
    total = sum(b - a for a, b in trechos)
    if total <= 0:
        return []
    ts = []
    for a, b in trechos:
        n = max(1, math.ceil((b - a) / passo))
        if total < minimo * passo:                      # trecho curto: as amostras mínimas se dividem pela duração
            n = max(n, math.ceil(minimo * (b - a) / total))
        ts += [round(a + (i + 0.5) * (b - a) / n, 3) for i in range(n)]
    return ts


def decidir(planos: list[dict], vozes: list[dict], fracao_rosto: dict[str, float | None],
            seguidas: dict[str, int] | None = None, primeiro_plano: dict[str, float | None] | None = None) -> list[dict]:
    """Função pura: planos, vozes, a fração de quadros com rosto de cada plano de cobertura, (opcional) a maior sequência de
    amostras seguidas com rosto e (opcional) a largura do maior rosto quando ele está em primeiro plano (>= ROSTO_MIN) na
    maioria das amostras -> reprovações. A pessoa está na tela se fração >= FRACAO_ROSTO_MIN OU seguidas >= SEGUIDAS_ROSTO_MIN
    OU primeiro_plano medido.

    Cada reprovação: {"id", "motivo", "fracao" (ou None), "olhar" (ou None), "trechos", "primeiro_plano"}.
    `fracao_rosto[id]` None = não medido."""
    seguidas = seguidas or {}
    primeiro_plano = primeiro_plano or {}
    pid = {p["id"]: p for p in planos}
    out = []
    for i, trechos in coberturas(planos, vozes).items():
        cob = pid[i].get("cobertura") or {}
        olhar = cob.get("olhar")
        fr = fracao_rosto.get(i)
        pp = primeiro_plano.get(i)
        base = {"id": i, "fracao": None if fr is None else round(float(fr), 2), "olhar": olhar, "trechos": trechos,
                "primeiro_plano": None if pp is None else round(float(pp), 2)}
        na_tela = fr is not None and (fr >= FRACAO_ROSTO_MIN or int(seguidas.get(i) or 0) >= SEGUIDAS_ROSTO_MIN or pp is not None)
        if olhar == "camera":
            out.append({**base, "motivo": "rosto falando para a câmera fora do take da fala (boca fora de sincronia)"})
        elif fr is None:
            out.append({**base, "motivo": "NÃO VERIFICADO: rosto não medido neste plano"})
        elif na_tela and (olhar not in OLHARES or not str(cob.get("assunto") or "").strip()):
            onde = f"rosto em primeiro plano ({pp:.0%} da largura) fora de sincronia" if pp is not None else "a pessoa na tela"
            out.append({**base, "motivo": f"cobertura com {onde} sem conferência de sintonia"})
    return out


def _detector(c):
    """O detector de rosto da frente A (YuNet; Haar se configurado), em cache na conferência. None se não há nenhum."""
    d = getattr(c, "_rostos", None)
    if d is None:
        try:
            from motor.provedores.visao_local import DetectorRostos
            d = DetectorRostos(c.cfg)
        except Exception:  # noqa: BLE001
            return None
        c._rostos = d
    return None if getattr(d, "nome", "nenhum") == "nenhum" else d


def sequencia_max(ts: list[float], com_rosto: list[bool], passo: float = PASSO_AMOSTRA) -> int:
    """Função pura: maior número de amostras seguidas com rosto. Amostras a mais de 2 x `passo` uma da outra (trechos separados
    do mesmo plano) não contam como seguidas."""
    melhor, run, ant = 0, 0, None
    for t, r in zip(ts, com_rosto):
        run = (run + 1 if ant is not None and t - ant <= 2 * passo + 1e-6 else 1) if r else 0
        ant = t if r else None
        melhor = max(melhor, run)
    return melhor


def medir_rosto(c, det, ts: list[float]) -> dict:
    """Nos quadros do final em `ts`: "fracao" com rosto de altura >= 5% do quadro (None se nenhum quadro se leu), "quadro"
    (t, imagem) de maior rosto (evidência), "seguidas" (maior sequência de amostras seguidas com rosto; quadro que não se lê
    quebra a sequência), "larguras" (largura do maior rosto por quadro lido) e "primeiro_plano" (a maior largura, quando a
    maioria dos quadros lidos tem rosto >= ROSTO_MIN da largura; senão None)."""
    import cv2
    com, lidos, melhor = 0, 0, (0.0, None, None)
    tt, marcas, larguras = [], [], []
    for t in ts:
        q = c.quadro(t)
        if q is None:
            tt.append(t)
            marcas.append(False)
            continue
        lidos += 1
        img = cv2.resize(q, (max(1, c.W // 2), max(1, c.H // 2)))
        caixas = det.detectar(img)
        h = max([r[3] for r in caixas] or [0.0])
        w = max([r[2] for r in caixas] or [0.0])
        larguras.append(round(float(w), 3))
        if h >= ROSTO_ALTURA_MIN:
            com += 1
        tt.append(t)
        marcas.append(h >= ROSTO_ALTURA_MIN)
        if melhor[2] is None or h > melhor[0]:
            melhor = (h, t, q)
    if not lidos:
        return {"fracao": None, "quadro": None, "seguidas": 0, "larguras": [], "primeiro_plano": None}
    grandes = [w for w in larguras if w >= ROSTO_MIN]
    return {"fracao": com / lidos, "quadro": (melhor[1], melhor[2]), "seguidas": sequencia_max(tt, marcas), "larguras": larguras,
            "primeiro_plano": max(grandes) if len(grandes) * 2 > len(larguras) else None}


def checar(c, detector=None):
    planos, vozes = c.edl.get("planos") or [], c.edl.get("voz") or []
    cob = coberturas(planos, vozes)
    if not cob:
        return {"ok": True, "detalhe": f"nenhuma cobertura: {len(planos)} plano(s), todo trecho com fala mostra o take da fala (ou nenhuma imagem por cima de fala)"}
    pid = {p["id"]: p for p in planos}
    medir = [i for i in cob if (pid[i].get("cobertura") or {}).get("olhar") != "camera"]
    det = detector
    if medir and det is None:
        det = _detector(c)
        if det is None:
            return {"ok": False, "bloqueia": True, "valor": {"coberturas": sorted(cob)},
                    "detalhe": f"NÃO VERIFICADO: detector de rosto indisponível; {len(cob)} plano(s) de cobertura sem conferir se a pessoa está na tela"}
    med = {i: medir_rosto(c, det, tempos_amostra(cob[i])) for i in medir}
    fracao = {i: m["fracao"] for i, m in med.items()}
    seguidas = {i: m["seguidas"] for i, m in med.items()}
    primeiro = {i: m["primeiro_plano"] for i, m in med.items()}
    reprov = decidir(planos, vozes, fracao, seguidas, primeiro)
    evid = []
    for r in reprov:
        t, q = (med.get(r["id"]) or {}).get("quadro") or (None, None)
        if q is None:
            t = round((r["trechos"][0][0] + r["trechos"][0][1]) / 2, 2)
            q = c.quadro(t)
        if q is not None:
            evid.append(c.salvar_quadro(q, f"cobertura_{r['id']}_{t:.1f}.jpg"))
    linhas = [f"{r['id']} ({', '.join(f'{a:.2f}-{b:.2f} s' for a, b in r['trechos'])}"
              + (f", rosto em {r['fracao']:.0%} dos quadros" if r["fracao"] is not None else "")
              + (f", {seguidas[r['id']]} amostras seguidas" if seguidas.get(r["id"], 0) >= SEGUIDAS_ROSTO_MIN else "")
              + f"): {r['motivo']}" for r in reprov]
    nome = getattr(det, "nome", "detector") if det is not None else "sem detector"
    d = [f"{len(cob)} plano(s) de cobertura sobre fala; rosto medido em {len(medir)} ({nome})"]
    if linhas:
        d.append(f"{len(reprov)} reprovado(s): " + "; ".join(linhas))
    anotados = [i for i in cob if pid[i].get("cobertura") and i not in {r['id'] for r in reprov}]
    if anotados:
        d.append("com conferência de sintonia: " + ", ".join(f"{i} ({pid[i]['cobertura'].get('olhar')}: {str(pid[i]['cobertura'].get('assunto', ''))[:50]})"
                                                          for i in anotados))
    return {"ok": not reprov, "evidencia": evid,
            "valor": {"coberturas": {i: {"trechos": cob[i], "fracao_rosto": None if fracao.get(i) is None else round(fracao[i], 2),
                                         "seguidas": seguidas.get(i), "rosto_largura": (med.get(i) or {}).get("larguras"),
                                         "primeiro_plano": primeiro.get(i)} for i in cob},
                      "reprovados": [r["id"] for r in reprov]},
            "detalhe": "; ".join(d)}
