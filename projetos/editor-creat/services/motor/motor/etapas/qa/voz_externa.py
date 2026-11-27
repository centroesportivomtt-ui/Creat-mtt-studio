"""voz_externa: nenhuma voz da equipe dirigindo a gravação entra no filme (revisão do dono 19/11: em 2 ou 3 momentos dava
para ouvir Ruan, Xande ou Marcos falando com a apresentadora).

Integração de 19/11 (duas sessões fizeram a mesma checagem): uma checagem só, que REPROVA quando QUALQUER régua reprova.
Régua 1, nível e tom (`motor.audio_fala`, sem modelo):
   a) cada peça de voz: o trecho da FONTE de s0 a s1 passa por `vozes_de_fora` (voz bem mais fraca que a fala principal =
      alguém longe do microfone; tom muito abaixo = outra pessoa), com `continuidade=True`: sílaba fraca ou tom caindo no fim
      da frase que sai da fala dela sem pausa e com o F0 contínuo é ela mesma, não entra;
   b) som direto de apoio (planos com som_direto_db): o trecho da fonte do plano (s0 a s0 + (t1 - t0) * vel) não pode trazer
      conversa nenhuma: >= 0,4 s de voz contínua (F0) acima do piso da fonte + 6 dB reprova.
   c) desde 20/11 (dados reais da Lavínia): a referência também é a voz principal do FILME (tom de todas as peças; nível da mesma
      fonte), porque uma peça que é inteira a voz de outra pessoa virava a "fala principal" de si mesma; linha de tom estável
      bem mais grave que a principal em pausa ou começo de peça (voz longe, que o limiar de vozeamento não pega); e peça "sem
      fala que se ouça" que tem uma linha de tom de outra altura vira voz de fora (motivo certo) em vez de só NÃO VERIFICADO.
      Achado de TOM segue a mesma conta da assinatura: reprova em "uma" e no automático com a voz principal >= 65% do tempo.
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
Diálogo (onda 4, D46, SÓ com "varias"; em "uma" e no automático nada muda), com limites escritos:
- voz LONGE do microfone dentro da peça é aceita (relatada, não reprova) quando >= 60% do trecho achado está coberto por
  palavras da transcrição fina da MESMA fonte (`analise.json`, conf >= 0,5) que estão no `texto` da peça: é a segunda pessoa do
  diálogo, que a direção escolheu. Murmúrio sem transcrição (ou com palavras que não estão no texto) continua reprovando;
- conversa no som direto de um plano é aceita quando o plano é da MESMA CENA (mesma câmera com a janela de fonte a até 2 s de
  uma peça de voz que toca junto, ou outra câmera com o atraso MEDIDO pela conferência e a janela, no relógio da voz, a até 2 s
  da peça), E >= 60% das palavras ouvidas na janela (o mesmo transcritor da conferência) batem com as palavras das peças que
  tocam junto, E o som direto fica >= 12 dB abaixo da voz no cruzamento, medido nos stems "voz" e "direto" (sem os stems não
  há prova: reprova). Perto disso é eco: reprova. Plano de outra cena com conversa reprova.
  A "outra pessoa longe do microfone" achada em peça sem fala que se ouça (só a linha de tom) NÃO entra nesse aceite: sem
  fala acima do nível não há palavra que prove que é o diálogo.
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
RAZAO_TOM = 0.72          # tom abaixo de 72% da voz principal = outra pessoa (o mesmo de audio_fala.vozes_de_fora)
LONGE_GLOBAL_DB = 12.0    # peça inteira 12 dB abaixo da fala da mesma fonte = voz longe do microfone
# diálogo (varias, onda 4)
DIALOGO_COBRE_MIN = 0.60  # parte do trecho de voz longe coberta por palavras da transcrição fina que estão no texto da peça
DIALOGO_CONF_MIN = 0.5    # confiança mínima da palavra da transcrição fina
CENA_GAP_S = 2.0          # janela do som direto a até 2 s (no relógio da voz) de uma peça que toca junto = a mesma cena
PALAVRAS_BATEM_MIN = 0.60  # palavras ouvidas no som direto que batem com as das peças que tocam junto
ECO_DB = 12.0             # som direto pelo menos 12 dB abaixo da voz no cruzamento (perto disso é eco)
CRUZA_S = 0.08


def _fatia_principal(pecas: list[dict], trechos: dict, f0_ref) -> float:
    """Parte do tempo de fala (por duração de peça) com o tom da voz principal (±25%). Sem referência: 1."""
    if not f0_ref:
        return 1.0
    tot = dentro = 0.0
    for v in pecas:
        _, f, lv = audio_fala.f0_serie(trechos[v["id"]], SR_FALA)
        fv = f[(f > 0) & (lv > (np.percentile(lv, 85) if len(lv) else 0) - 8)]
        if not len(fv):
            continue
        d = float(v["s1"]) - float(v["s0"])
        tot += d
        dentro += d if abs(float(np.median(fv)) / f0_ref - 1) <= audio_fala.TOM_IGUAL else 0.0
    return dentro / tot if tot else 1.0


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


# ------------------------------------------------------------------ diálogo (varias, onda 4)
def _tokens(txt) -> list[str]:
    from motor.etapas.qa import normalizar
    return normalizar(txt or "").split()


# palavras funcionais: aparecem em qualquer frase, então sozinhas não provam que o murmúrio é a fala escolhida (revisão, A10)
_VAZIAS_TXT = ("a o as os de do da dos das e é que um uma uns umas em no na nos nas num numa pra pro pros pras por pelo pela para "
               "com sem não se eu tu ele ela nós vocês você me te lhe isso isto aquilo aí né tá já mas ou mais bem sim então aqui "
               "lá só ao aos à às seu sua meu minha tem vai foi era ser ter tá ah eh hum")
_VAZIAS: set[str] | None = None


def _vazias() -> set[str]:
    global _VAZIAS
    if _VAZIAS is None:
        _VAZIAS = set(_tokens(_VAZIAS_TXT))
    return _VAZIAS


def coberta_por_palavras(a: float, b: float, palavras: list, texto: str, conf_min: float = DIALOGO_CONF_MIN) -> float:
    """Função pura: parte de [a, b] (tempo de fonte) coberta por palavras [[s, e, palavra, conf]] com conf >= conf_min cuja
    forma normalizada está no `texto` da peça. Palavra funcional ("que", "de", "não", "pro") só conta dentro de uma sequência
    de palavras do texto que tenha pelo menos uma palavra de conteúdo: "vem pro" conta inteiro; "que" sozinho, não."""
    if b - a <= 0:
        return 0.0
    do_texto, vazias = set(_tokens(texto)), _vazias()
    ordem = sorted((w for w in palavras or [] if len(w) >= 3), key=lambda w: float(w[0]))
    bate = [(w[3] if len(w) > 3 and w[3] is not None else 1.0) >= conf_min and any(t in do_texto for t in _tokens(w[2]))
            for w in ordem]
    conta = [False] * len(ordem)
    i = 0
    while i < len(ordem):                                   # sequências de palavras seguidas que batem com o texto
        if not bate[i]:
            i += 1
            continue
        j = i
        while j + 1 < len(ordem) and bate[j + 1]:
            j += 1
        if any(t not in vazias for k in range(i, j + 1) for t in _tokens(ordem[k][2])):
            for k in range(i, j + 1):
                conta[k] = True
        i = j + 1
    trechos = sorted((max(a, float(w[0])), min(b, float(w[1]))) for w, c in zip(ordem, conta)
                     if c and min(b, float(w[1])) > max(a, float(w[0])))
    total, fim = 0.0, a
    for x, y in trechos:
        x = max(x, fim)
        if y > x:
            total += y - x
            fim = y
    return total / (b - a)


def longe_no_dialogo(c, v: dict, achado: dict) -> tuple[bool, str]:
    """A voz longe achada na peça é a segunda pessoa do diálogo? (palavras da transcrição fina da fonte, no texto da peça)."""
    pal = fala_cortada._palavras_fonte(c, v["fonte"])
    if not pal:
        return False, "sem transcrição da fonte para provar que é fala do diálogo"
    frac = coberta_por_palavras(achado["s"][0], achado["s"][1], pal, v.get("texto") or "")
    if frac >= DIALOGO_COBRE_MIN:
        return True, f"{frac:.0%} do trecho com palavras da transcrição que estão no texto da peça"
    return False, f"só {frac:.0%} do trecho com palavras da transcrição que estão no texto da peça (precisa {DIALOGO_COBRE_MIN:.0%}): murmúrio"


def _db(x) -> float:
    x = np.asarray(x, np.float64)
    return float(20 * np.log10(np.sqrt(np.mean(x * x)) + 1e-9)) if len(x) else -120.0


def _stem(c, nome: str):
    k = ("stem_mono", nome)
    if k not in c.memo:
        import soundfile as sf
        x, sr = sf.read(str(c.stems[nome]), dtype="float32", always_2d=True)
        c.memo[k] = (x.mean(1), sr)
    return c.memo[k]


def _no_filme(x: np.ndarray, sr: int, trechos: list[tuple[float, float]]) -> np.ndarray:
    return np.concatenate([x[max(0, int(a * sr)):max(0, int(b * sr))] for a, b in trechos] or [np.zeros(0, np.float32)])


def cena_do_som_direto(c, p: dict, voz: list[dict]) -> dict:
    """O som direto do plano `p` é o próprio diálogo (mesma cena, mesmas palavras, bem abaixo da voz)? Cache por plano.
    Devolve {"aceito", "motivo", "medida"}. Só faz sentido em "varias" (quem chama decide)."""
    from motor.etapas.qa import cobertura_sintonia as COB
    k = ("cena_direto", p["id"])
    if k in c.memo:
        return c.memo[k]
    vel = float(p.get("vel", 1.0) or 1.0)
    ps0 = float(p["s0"])
    ps1 = ps0 + (float(p["t1"]) - float(p["t0"])) * vel

    def fim(r):
        c.memo[k] = r
        return r
    juntas = [v for v in voz if min(float(p["t1"]), float(v["t1"])) - max(float(p["t0"]), float(v["t0"])) >= CRUZA_S]
    if not juntas:
        return fim({"aceito": False, "motivo": "nenhuma fala toca junto com este plano", "medida": ""})
    cena, onde = [], []
    for v in juntas:
        vs0, vs1 = float(v["s0"]), fala_cortada.fim_na_fonte(v)
        if COB._base(v["fonte"]) == COB._base(p["fonte"]):
            a, b, como = ps0, ps1, "mesma câmera"
        else:
            m = c.sincronia(v["fonte"], p["fonte"])
            if m is None:
                continue
            a, b, como = ps0 - m["delta"], ps1 - m["delta"], f"outra câmera, atraso medido {m['offset_s']:+.3f} s (semelhança {m['conf']:.2f})"
        dist = max(0.0, a - vs1, vs0 - b)
        if dist <= CENA_GAP_S:
            cena.append(v)
            onde.append(f"{v['id']}: {como}, {dist:.2f} s da peça")
    if not cena:
        return fim({"aceito": False, "motivo": "outra cena (a janela do som direto não está perto de nenhuma fala que toca junto)", "medida": ""})
    tr = c.transcrever_janela(p["fonte"], ps0, ps1)
    if tr is None or tr.get("erro"):
        return fim({"aceito": False, "motivo": "sem como ouvir as palavras do som direto", "medida": "; ".join(onde)})
    ouvidas = [w[2] for w in c.palavras(tr) if len(w[2]) >= 2]
    if not ouvidas:
        return fim({"aceito": False, "motivo": "conversa sem palavras reconhecidas no som direto (murmúrio)", "medida": "; ".join(onde)})
    esperadas = {t for v in cena for t in _tokens(v.get("texto"))}
    frac = sum(1 for w in ouvidas if w in esperadas) / len(ouvidas)
    if frac < PALAVRAS_BATEM_MIN:
        return fim({"aceito": False, "motivo": f"só {frac:.0%} das palavras do som direto batem com a fala que toca junto",
                    "medida": "; ".join(onde)})
    trechos = [(max(float(p["t0"]), float(v["t0"])), min(float(p["t1"]), float(v["t1"]))) for v in cena]
    if "voz" not in c.stems or "direto" not in c.stems:   # sem os stems não há como medir o eco: sem prova, não aceita
        return fim({"aceito": False, "motivo": "sem os stems de voz e de som direto para medir se é eco",
                    "medida": "; ".join(onde) + f"; {frac:.0%} das palavras batem"})
    (xv, srv), (xd, srd) = _stem(c, "voz"), _stem(c, "direto")
    dv, dd = _db(_no_filme(xv, srv, trechos)), _db(_no_filme(xd, srd, trechos))
    medida = "; ".join(onde) + f"; {frac:.0%} das palavras batem; som direto {dv - dd:.1f} dB abaixo da voz nos stems"
    if dv - dd < ECO_DB:
        return fim({"aceito": False, "motivo": f"som direto só {dv - dd:.1f} dB abaixo da voz (eco: precisa {ECO_DB:.0f} dB)", "medida": medida})
    return fim({"aceito": True, "motivo": "a conversa do som direto é o próprio diálogo da cena", "medida": medida})


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
    # régua 1a: nível e tom dentro de cada peça (referência da própria peça e, desde 20/11, a voz principal do filme inteiro)
    ouvidas = [v for v in voz if v["id"] not in sem_som]
    trechos = {}
    for v in voz:
        x, off = c.audio_fonte(v["fonte"], SR_FALA)
        trechos[v["id"]] = _trecho(x, SR_FALA, v["s0"] - off, v["s1"] - off)
    ref = audio_fala.referencia([trechos[v["id"]] for v in ouvidas], SR_FALA) or {}
    nivel_fonte = {fid: (audio_fala.referencia([trechos[v["id"]] for v in ouvidas if v["fonte"] == fid], SR_FALA) or {}).get("nivel")
                   for fid in {v["fonte"] for v in ouvidas}}
    f0_ref = ref.get("f0")
    fatia = _fatia_principal(ouvidas, trechos, f0_ref)
    tom_reprova = modo == "uma" or (modo != "varias" and fatia >= PRINCIPAL_MIN)

    def achado(v, r, regua, motivo, medida, de_tom):
        vel = float(v.get("vel", 1.0) or 1.0)
        a = {"id": v["id"], "tipo": "voz", "fonte": v["fonte"], "regua": regua,
             "t": [round(v["t0"] + r["a"] / vel, 2), round(v["t0"] + r["b"] / vel, 2)],
             "s": [round(v["s0"] + r["a"], 2), round(v["s0"] + r["b"], 2)], "motivo": motivo, "medida": medida}
        (permitidos if de_tom and not tom_reprova else achados).append(a)

    def ja_tem(vid, r):
        return any(a["id"] == vid and a["s"][0] - 0.05 <= r["s"] and r["s"] <= a["s"][1] + 0.05 for a in achados + permitidos)

    for v in ouvidas:
        x = trechos[v["id"]]
        local = audio_fala.vozes_de_fora(x, SR_FALA, continuidade=True)
        for r in local:
            achado(v, r, "nivel_tom", "longe do microfone" if r["motivo"] == "longe" else "tom de outra pessoa",
                   f"{r['nivel']:.0f} dB contra {r['fala']:.0f} dB da fala, F0 {r['f0']} Hz contra {r['f0_fala']} Hz",
                   de_tom=r["motivo"] == "tom")
        if not f0_ref:
            continue
        # a peça inteira pode ser a outra pessoa: compara com a voz principal do filme (tom) e com o nível dela na fonte
        nf = nivel_fonte.get(v["fonte"])
        nv = (audio_fala.referencia([x], SR_FALA) or {}).get("nivel")          # peça curta demais: sem medida, não é "longe"
        longe_demais = nf is not None and nv is not None and nv < nf - LONGE_GLOBAL_DB
        glob = audio_fala.vozes_de_fora(x, SR_FALA, continuidade=True, ref={"f0": f0_ref, "nivel": nf if longe_demais else None})
        for r in glob:
            if ja_tem(v["id"], {"s": v["s0"] + (r["a"] + r["b"]) / 2}):
                continue
            achado(v, r, "voz_do_filme", "longe do microfone" if r["motivo"] == "longe" else "tom de outra pessoa",
                   f"{r['nivel']:.0f} dB contra {r['fala']:.0f} dB da fala na fonte, F0 {r['f0']} Hz contra {int(f0_ref)} Hz da voz principal do filme",
                   de_tom=r["motivo"] == "tom")
        # voz longe que o limiar de vozeamento não pega (eco): linha de tom estável bem mais grave que a voz principal
        for r in audio_fala.tom_estavel(x, SR_FALA, nivel_fala=nf):
            if r["f0"] < RAZAO_TOM * f0_ref and not ja_tem(v["id"], {"s": v["s0"] + (r["a"] + r["b"]) / 2}):
                achado(v, r, "tom_fraco", "tom de outra pessoa, voz fraca (pausa ou começo da peça)",
                       f"F0 {r['f0']} Hz contra {int(f0_ref)} Hz da voz principal, {r['b'] - r['a']:.2f} s", de_tom=True)
    # peça "sem fala que se ouça": se o que soa ali é uma voz de tom diferente, é voz de fora (motivo certo), não só NÃO VERIFICADO
    if f0_ref:
        for v in [v for v in voz if v["id"] in sem_som]:
            linhas = [r for r in audio_fala.tom_estavel(trechos[v["id"]], SR_FALA, nivel_fala=nivel_fonte.get(v["fonte"])) if abs(r["f0"] / f0_ref - 1) > audio_fala.TOM_IGUAL]
            if linhas:
                r = max(linhas, key=lambda r: r["b"] - r["a"])
                achado(v, r, "tom_fraco", "outra pessoa longe do microfone (abaixo do nível de fala)",
                       f"F0 {r['f0']} Hz contra {int(f0_ref)} Hz da voz principal, {r['b'] - r['a']:.2f} s", de_tom=False)
                surdos = [s for s in surdos if s["id"] != v["id"]]      # reprova mesmo em "várias": voz LONGE é a equipe dirigindo
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
    # diálogo (varias): a segunda pessoa longe do microfone com palavras no texto e o som direto da própria cena são aceitos
    dialogo = []
    if modo == "varias":
        pid = {p["id"]: p for p in diretos}
        vid = {v["id"]: v for v in voz}
        resto = []
        for a in achados:
            if a["tipo"] == "som_direto" and a["id"] in pid:
                r = cena_do_som_direto(c, pid[a["id"]], voz)
                if r["aceito"]:
                    dialogo.append({**a, "motivo": r["motivo"], "medida": f"{a['medida']}; {r['medida']}"})
                    continue
                a = {**a, "medida": f"{a['medida']}; não é o diálogo: {r['motivo']}"}
            elif a["tipo"] == "voz" and a["motivo"] == "longe do microfone" and a["id"] in vid:
                ok, med = longe_no_dialogo(c, vid[a["id"]], a)
                if ok:
                    dialogo.append({**a, "motivo": "segunda pessoa do diálogo, longe do microfone", "medida": f"{a['medida']}; {med}"})
                    continue
                a = {**a, "medida": f"{a['medida']}; não é o diálogo: {med}"}
            resto.append(a)
        achados = resto
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
    if dialogo:
        det.append(f"{len(dialogo)} trecho(s) aceito(s) como o diálogo do pedido (várias pessoas falam): " + "; ".join(linha(a) for a in dialogo[:5]))
    if dispensados:
        det.append("confirmadas pelo diretor (vozes_confirmadas): " + "; ".join(linha(a) for a in dispensados))
    return {"ok": not falhas and not surdos and not sem_modelo, "bloqueia": True,
            "valor": {"achados": falhas[:30], "confirmadas": sorted({a["id"] for a in dispensados}), "nao_verificados": surdos[:30],
                      "permitidos": permitidos[:30], "dialogo": dialogo[:30], "modo": modo, "pecas": (ass or {}).get("pecas", [])},
            "detalhe": "; ".join(det)}
