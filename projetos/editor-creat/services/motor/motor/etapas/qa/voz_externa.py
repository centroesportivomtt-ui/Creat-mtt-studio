"""voz_externa: nenhuma voz da equipe dirigindo a gravação entra no filme (revisão do dono 19/11: em 2 ou 3 momentos dava
para ouvir Ruan, Xande ou Marcos falando com a apresentadora).

Integração de 19/11 (duas sessões fizeram a mesma checagem): uma checagem só, que REPROVA quando QUALQUER régua reprova.
Régua 1, nível e tom (`motor.audio_fala`, sem modelo):
   a) cada peça de voz: o trecho da FONTE de s0 a s1 passa por `vozes_de_fora` (voz bem mais fraca que a fala principal =
      alguém longe do microfone; tom muito abaixo = outra pessoa), com `continuidade=True`: sílaba fraca ou tom caindo no fim
      da frase que sai da fala dela sem pausa e com o F0 contínuo é ela mesma, não entra;
   b) som direto de apoio (planos com som_direto_db): o trecho da fonte do plano (s0 a s0 + (t1 - t0) * vel) não pode trazer
      conversa nenhuma: >= 0,4 s de voz contínua (F0) acima do piso da fonte + 6 dB reprova.
Régua 2, assinatura de voz (`motor/etapas/falante.py`, CAM++ local): a voz principal é a de mais tempo de fala. Uma peça é
   "de outra voz" quando fica longe da principal: cosseno < 0,42 em peça de 2 s ou mais. Peça curta (0,45 a 2 s) engana a
   assinatura (medido em 19/11: a mesma voz dizendo "Vem!" deu 0,39), então pede uma segunda pista: altura da voz 20% ou mais
   longe da principal, ou cosseno muito baixo (< 0,15).
O pedido manda (`edl.origem.vozes`):
- "uma": qualquer peça de outra voz reprova;
- "varias": voz de outra pessoa é permitida e só é relatada (assinatura e "tom de outra pessoa" da régua 1); voz LONGE do
  microfone dentro da peça e conversa no som direto continuam reprovando (é a equipe dirigindo, não quem fala no vídeo);
- automático: a assinatura reprova quando a voz principal tem 65% ou mais do tempo de fala (o resto é intruso: "vai", "de novo",
  "isso"); com as vozes equilibradas é conversa e a assinatura só relata. A régua 1 vale sempre.
Dispensa: `edl.qa.vozes_confirmadas` (ids de peça ou de plano), sempre listados no detalhe. NÃO VERIFICADO (reprova, sem
dispensa): sem as fontes; sem o modelo de voz; trecho que passa do fim do áudio da fonte; peça de voz sem fala que se ouça na
fonte (áudio mudo ou só ruído não pode aprovar calado: vozes_de_fora devolveria [])."""
from __future__ import annotations

import numpy as np

from motor import audio_fala
from motor.etapas.qa import fala_cortada

ID, BLOQUEIA = "voz_externa", True
SR_FALA = 16000
VOZ_CONTINUA_S = 0.4
ACIMA_PISO_DB = 6.0
PASSO_F0 = 0.02
# régua 2 (assinatura)
CURTA, MINIMA = 2.0, 0.45
LIM_CURTA = 0.15
TOM_LONGE = 0.20
PRINCIPAL_MIN = 0.65


def _tom_longe(razao: float) -> bool:
    """20% ou mais de diferença na altura da voz. (Homem x mulher fica perto de uma oitava: tolerar oitava apagaria
    justamente o caso do pedido; o erro de oitava é tratado na medição, em falante.tom_hz.)"""
    return abs(razao - 1.0) >= TOM_LONGE


def _trecho(x: np.ndarray, sr: int, a: float, b: float) -> np.ndarray:
    """Trecho [a, b) do arquivo (tempos do arquivo); o que cai fora vira silêncio, como no ler_audio."""
    i, j = round(a * sr), round(b * sr)
    if j <= i:
        return np.zeros(0, np.float32)
    out = np.zeros(j - i, np.float32)
    ii, jj = max(0, i), min(len(x), j)
    if jj > ii:
        out[ii - i:jj - i] = x[ii:jj]
    return out


def voz_continua(ts: np.ndarray, f: np.ndarray, lv: np.ndarray, piso: float, dur_min: float = VOZ_CONTINUA_S,
                 acima_db: float = ACIMA_PISO_DB) -> list[tuple[float, float]]:
    """Função pura: trechos [a, b] (tempos de `ts`) com voz (F0 > 0) acima de piso + `acima_db` por >= `dur_min` seguidos.
    Um quadro de F0 perdido no meio não quebra o trecho (como em vozes_de_fora)."""
    g = (f > 0) & (lv > piso + acima_db)
    out, i = [], 0
    while i < len(g):
        if g[i]:
            j = i
            while j + 1 < len(g) and (g[j + 1] or (j + 2 < len(g) and g[j + 2])):
                j += 1
            a, b = float(ts[i]), float(ts[j]) + PASSO_F0
            if b - a >= dur_min - 1e-9:
                out.append((round(a, 2), round(b, 2)))
            i = j + 1
        else:
            i += 1
    return out


def _piso_fonte(c, fid: str) -> float:
    """Piso (percentil 10 do nível do F0) do arquivo inteiro da fonte: o trecho de som direto pode ser todo conversa."""
    k = ("piso_f0", fid)
    if k not in c.memo:
        x, _ = c.audio_fonte(fid, SR_FALA)
        _, _, lv = audio_fala.f0_serie(x, SR_FALA)
        c.memo[k] = float(np.percentile(lv, 10)) if len(lv) else -90.0
    return c.memo[k]


# ------------------------------------------------------------------ régua 2: assinatura de voz
def _assinador(c):
    if getattr(c, "_assinador", None) is None:
        from motor.etapas.falante import Assinador
        c._assinador = Assinador(c.cfg)
    return c._assinador


def julgar_assinaturas(voz: list[dict], assin: list, durs: list[float], tons: list, modo: str) -> dict:
    """Função pura: assinatura, duração e tom de cada peça -> {"pecas" (medidas por peça), "fora" ([(peça, dur, proximidade)]),
    "reprova" (o modo manda reprovar as de fora), "resumo", "relato" (por que não reprova, quando há de fora e não reprova),
    "curtas" (quantas peças não deram assinatura)}."""
    from motor.etapas import falante as F
    g = F.agrupar(assin, durs)
    total = sum(d for d, s in zip(durs, assin) if s is not None)
    sem = sum(1 for s in assin if s is None)
    if g["principal"] is None or total <= 0:
        return {"pecas": [], "fora": [], "reprova": False, "curtas": sem,
                "resumo": "falas curtas demais para identificar a voz pela assinatura (menos de 0,45 s cada)", "relato": None}
    fatia = g["tempo"][g["principal"]] / total
    do_principal = [(tm, d) for tm, d, gr in zip(tons, durs, g["grupos"]) if gr == g["principal"] and tm]
    tom_ref = float(np.median([tm for tm, d in do_principal if d >= CURTA] or [tm for tm, _ in do_principal])) if do_principal else None
    fora, val = [], []
    for v, d, tm, prox in zip(voz, durs, tons, g["proximidade"]):
        item = {"voz": v["id"], "t": round(float(v["t0"]), 2), "dur": round(d, 2), "proximidade": prox, "tom_hz": tm}
        longe = prox is not None and prox < F.LIMIAR
        if longe and d < CURTA:                                 # trecho curto: precisa da segunda pista
            tom_diz = bool(tm and tom_ref and _tom_longe(tm / tom_ref))
            longe = tom_diz or prox < LIM_CURTA
        if longe:
            item["outra_voz"] = True
            fora.append((v, d, prox))
        val.append(item)
    resumo = f"voz principal com {fatia:.0%} do tempo de fala" + (f"; {sem} peça(s) curta(s) demais para a assinatura" if sem else "")
    relato = None
    if fora and modo == "varias":
        relato = "permitido pelo pedido (várias pessoas falam)"
    elif fora and modo != "uma" and fatia < PRINCIPAL_MIN:
        relato = "várias vozes com tempo equilibrado: tratado como conversa. Se for peça de uma pessoa só, marque no pedido"
    return {"pecas": val, "fora": fora, "reprova": bool(fora) and relato is None, "resumo": resumo, "relato": relato, "curtas": sem}


def checar(c):
    from motor.etapas import falante as F
    voz = sorted(c.edl.get("voz") or [], key=lambda v: v["t0"])
    diretos = [p for p in c.edl.get("planos") or [] if p.get("som_direto_db") is not None]
    if not voz and not diretos:
        return {"ok": True, "detalhe": "sem peças de voz e sem som direto"}
    if c.fontes is None:
        return {"ok": False, "bloqueia": True,
                "detalhe": "NÃO VERIFICADO: a conferência não recebeu as fontes; sem o áudio da origem não dá para ouvir vozes de fora"}
    modo = str((c.edl.get("origem") or {}).get("vozes") or "auto")
    confirmadas = set((c.edl.get("qa") or {}).get("vozes_confirmadas") or [])
    achados, permitidos, surdos = [], [], []
    envs, offs = {}, {}
    try:
        for fid in sorted({v["fonte"] for v in voz}):
            envs[fid], offs[fid] = fala_cortada.envelope_fonte(c, fid)      # o mesmo envelope (cache) da fala_cortada
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "bloqueia": True,
                "detalhe": f"NÃO VERIFICADO: não consegui ler o áudio da fonte ({type(e).__name__}); a versão não é entregue sem conferir de quem é cada fala"}
    surdos += [{**p, "tipo": "voz"} for p in fala_cortada.nao_ouvidas(voz, envs, offs)]
    sem_som = {p["id"] for p in surdos}
    # régua 1a: nível e tom dentro de cada peça
    ouvidas = [v for v in voz if v["id"] not in sem_som]
    trechos = {}
    for v in ouvidas:
        x, off = c.audio_fonte(v["fonte"], SR_FALA)
        trechos[v["id"]] = _trecho(x, SR_FALA, v["s0"] - off, v["s1"] - off)
        vel = float(v.get("vel", 1.0) or 1.0)
        for r in audio_fala.vozes_de_fora(trechos[v["id"]], SR_FALA, continuidade=True):
            a = {"id": v["id"], "tipo": "voz", "fonte": v["fonte"], "regua": "nivel_tom",
                 "t": [round(v["t0"] + r["a"] / vel, 2), round(v["t0"] + r["b"] / vel, 2)],
                 "s": [round(v["s0"] + r["a"], 2), round(v["s0"] + r["b"], 2)],
                 "motivo": "longe do microfone" if r["motivo"] == "longe" else "tom de outra pessoa",
                 "medida": f"{r['nivel']:.0f} dB contra {r['fala']:.0f} dB da fala, F0 {r['f0']} Hz contra {r['f0_fala']} Hz"}
            (permitidos if modo == "varias" and r["motivo"] == "tom" else achados).append(a)
    # régua 1b: conversa no som direto de apoio
    for p in diretos:
        x, off = c.audio_fonte(p["fonte"], SR_FALA)
        vel = float(p.get("vel", 1.0) or 1.0)
        dur = (p["t1"] - p["t0"]) * vel
        fim_arq = len(x) / SR_FALA
        if p["s0"] - off + dur > fim_arq + 0.05:
            surdos.append({"id": p["id"], "tipo": "som_direto", "t": round(float(p["t0"]), 2), "fonte": p["fonte"],
                           "s": [round(float(p["s0"]), 2), round(float(p["s0"]) + dur, 2)],
                           "motivo": f"o áudio da fonte tem {fim_arq:.2f} s e o som direto vai até {p['s0'] - off + dur:.2f} s"})
            continue
        ts, f, lv = audio_fala.f0_serie(_trecho(x, SR_FALA, p["s0"] - off, p["s0"] - off + dur), SR_FALA)
        piso = _piso_fonte(c, p["fonte"])
        for a, b in voz_continua(ts, f, lv, piso):
            achados.append({"id": p["id"], "tipo": "som_direto", "fonte": p["fonte"], "regua": "som_direto",
                            "t": [round(p["t0"] + a / vel, 2), round(p["t0"] + b / vel, 2)],
                            "s": [round(p["s0"] + a, 2), round(p["s0"] + b, 2)],
                            "motivo": "conversa no som direto de apoio",
                            "medida": f"{b - a:.2f} s de voz contínua acima do piso {piso:.0f} dB + {ACIMA_PISO_DB:.0f} dB"})
    # régua 2: assinatura de voz
    sem_modelo, ass = False, None
    if ouvidas:
        a = _assinador(c)
        if not getattr(a, "disponivel", False):
            sem_modelo = True
        else:
            assin = [a.assinar(trechos[v["id"]], SR_FALA, minimo=MINIMA) for v in ouvidas]
            tons = [F.tom_hz(trechos[v["id"]], SR_FALA) for v in ouvidas]
            durs = [float(v["s1"]) - float(v["s0"]) for v in ouvidas]
            ass = julgar_assinaturas(ouvidas, assin, durs, tons, modo)
            for v, _d, prox in ass["fora"]:
                vel = float(v.get("vel", 1.0) or 1.0)
                item = {"id": v["id"], "tipo": "voz", "fonte": v["fonte"], "regua": "assinatura",
                        "t": [round(float(v["t0"]), 2), round(float(v["t0"]) + (float(v["s1"]) - float(v["s0"])) / vel, 2)],
                        "s": [round(float(v["s0"]), 2), round(float(v["s1"]), 2)],
                        "motivo": "outra voz pela assinatura", "texto": str(v.get("texto") or "")[:40],
                        "medida": f"semelhança {prox:.2f} com a voz principal ({ass['resumo']})"}
                (achados if ass["reprova"] else permitidos).append(item)
    falhas = [a for a in achados if a["id"] not in confirmadas]
    dispensados = [a for a in achados if a["id"] in confirmadas]

    def linha(a):
        quem = "peça" if a["tipo"] == "voz" else "som direto do plano"
        txt = f" «{a['texto']}»" if a.get("texto") else ""
        return (f"{quem} {a['id']}{txt}: {a['t'][0]:.2f}-{a['t'][1]:.2f} s do filme (fonte {a['fonte']} {a['s'][0]:.2f}-{a['s'][1]:.2f} s), "
                f"{a['motivo']} ({a['medida']})")
    det = [f"{len(voz)} peça(s) de voz e {len(diretos)} som(ns) direto(s) ouvidos na fonte"]
    if ass is not None and not ass["pecas"]:
        det.append(f"assinatura: {ass['resumo']}")
    elif ass is not None:
        det.append(("todas da mesma voz pela assinatura" if not ass["fora"] else f"{len(ass['fora'])} fala(s) de outra voz pela assinatura")
                   + f" ({ass['resumo']})")
    if surdos:
        det.insert(0, f"NÃO VERIFICADO: {len(surdos)} trecho(s) sem áudio que se ouça na fonte, sem como ouvir vozes de fora: "
                   + "; ".join(f"{'peça' if a['tipo'] == 'voz' else 'som direto do plano'} {a['id']} (fonte {a['fonte']} "
                               f"{a['s'][0]:.2f}-{a['s'][1]:.2f} s): {a['motivo']}" for a in surdos))
    if sem_modelo:
        det.insert(0, "NÃO VERIFICADO: modelo de voz indisponível neste motor; a versão não é entregue sem conferir de quem é cada fala "
                      "pela assinatura (nível e tom foram conferidos)")
    if falhas:
        det.append(f"{len(falhas)} voz(es) de fora: " + "; ".join(linha(a) for a in falhas)
                   + ". Se outras pessoas falam de propósito, marque 'várias pessoas falam' no pedido")
    if permitidos:
        motivo = (ass or {}).get("relato") if ass and ass["fora"] and not ass["reprova"] else None
        det.append(f"{len(permitidos)} fala(s) de outra voz, {motivo or 'permitido pelo pedido (várias pessoas falam)'}: "
                   + "; ".join(linha(a) for a in permitidos[:5]))
    if dispensados:
        det.append("confirmadas pelo diretor (vozes_confirmadas): " + "; ".join(linha(a) for a in dispensados))
    return {"ok": not falhas and not surdos and not sem_modelo, "bloqueia": True,
            "valor": {"achados": falhas[:30], "confirmadas": sorted({a["id"] for a in dispensados}), "nao_verificados": surdos[:30],
                      "permitidos": permitidos[:30], "modo": modo, "pecas": (ass or {}).get("pecas", [])},
            "detalhe": "; ".join(det)}
