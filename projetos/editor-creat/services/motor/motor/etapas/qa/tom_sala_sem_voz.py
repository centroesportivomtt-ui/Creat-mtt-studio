"""tom_sala_sem_voz: o stem 'ambiente' (tom de sala) é transcrito com o nível normalizado; 3 ou mais palavras = tem voz
= reprova (o tom de sala precisa vir de trecho SEM fala; lição de 17/11). Sem transcritor ou com transcrição quebrada:
NÃO VERIFICADO, reprova e bloqueia (a versão não sai sem ouvir).

Desde 22/11 (item J, cerveja v2: o "vale…" do Xande nos últimos segundos): o trecho ORIGINAL da fonte de onde o tom de sala
sai também passa pela régua física da conversa no som direto (voz_externa.voz_continua: >= 0,4 s de voz contínua acima do
piso da fonte + 6 dB). A conversa baixa da equipe, longe do microfone, não aparece na transcrição e, depois de difusa, passava
na modulação; ouvida no fim do filme, debaixo do cartão, ela ainda soava como fala."""
ID, BLOQUEIA = "tom_sala_sem_voz", True


def checar(c):
    ts = c.edl.get("tom_sala")
    if not ts:
        return {"ok": True, "detalhe": "sem tom de sala (só piso de ruído)"}
    cruza = [v["id"] for v in c.edl.get("voz", []) or [] if v["fonte"] == ts["fonte"] and v["s0"] < ts["s1"] and v["s1"] > ts["s0"]]
    arq = c.stems.get("ambiente")
    if cruza:
        return {"ok": False, "bloqueia": True, "valor": {"cruza_voz": cruza}, "detalhe": "tom de sala cruza a fala " + ", ".join(cruza),
                "evidencia": ["stems/ambiente.flac"] if arq else []}
    if not arq:
        return {"ok": False, "bloqueia": True, "detalhe": "NÃO VERIFICADO: o EDL tem tom de sala mas a montagem não gravou o stem 'ambiente'"}
    try:
        origem = conversa_na_origem(c, ts)
    except Exception as e:  # noqa: BLE001 - checagem que bloqueia não aprova calada: sem ouvir a origem, NÃO VERIFICADO
        return {"ok": False, "bloqueia": True, "detalhe": f"NÃO VERIFICADO: não consegui ouvir o trecho de origem do tom de sala ({type(e).__name__}: {str(e)[:120]})"}
    if origem:
        return {"ok": False, "bloqueia": True, "valor": {"conversa_na_origem": origem},
                "detalhe": f"o tom de sala foi tirado de um trecho com conversa (fonte {ts['fonte']}, "
                           + ", ".join(f"{a:.2f}-{b:.2f} s" for a, b in origem[:4]) + "): escolha um trecho sem ninguém falando",
                "evidencia": ["stems/ambiente.flac"]}
    if ts.get("difuso"):
        # Ambiente sintetizado (espectro médio + fase aleatória): o Whisper alucina em ruído normalizado ("cidade no Brasil"),
        # então a prova é física: sem sílaba não há fala. Envelope de 50 ms com desvio <= 2,5 dB = sem voz.
        from motor.etapas.qa import modulacao_db
        mod = modulacao_db(arq)
        ok = mod <= 2.5
        return {"ok": ok, "valor": {"difuso": True, "modulacao_db": round(mod, 2)},
                "detalhe": f"tom de sala difuso (fase aleatória): modulação do envelope {mod:.1f} dB ({'sem sílabas, sem voz' if ok else 'tem modulação de fala'})",
                "evidencia": [] if ok else ["stems/ambiente.flac"]}
    tr = c.transcrever("stem_ambiente", arq, normalizar_nivel=True)
    falta = c.nao_verificado(tr, "stem ambiente")
    if falta:
        return falta
    pal = c.palavras(tr, conf_min=0.4)
    texto = " ".join(w[2] for w in pal)
    ok = len(pal) < 3 and not cruza
    det = f"stem ambiente transcrito: {len(pal)} palavra(s)" + (f": «{texto[:120]}»" if pal else "")
    if cruza:
        det += f"; o trecho cruza a fala {', '.join(cruza)}"
    return {"ok": ok, "valor": {"palavras": len(pal), "texto": texto[:200], "cruza_voz": cruza}, "detalhe": det,
            "evidencia": ["stems/ambiente.flac"] if not ok else []}


def conversa_na_origem(c, ts: dict) -> list[tuple[float, float]]:
    """Trechos [a, b] (tempo da fonte) com voz contínua no pedaço da fonte que vira o tom de sala. Sem as fontes: []
    (as outras réguas desta checagem continuam valendo)."""
    if getattr(c, "fontes", None) is None:
        return []
    from motor import audio_fala
    from motor.etapas.qa import voz_externa as VE
    import numpy as np
    x, off = c.audio_fonte(ts["fonte"], VE.SR_FALA)
    s0, s1 = float(ts["s0"]), float(ts["s1"])
    t, f, lv = audio_fala.f0_serie(VE._trecho(x, VE.SR_FALA, s0 - off, s1 - off), VE.SR_FALA)
    # piso: o menor entre o do arquivo e o do próprio trecho (fonte quase toda fala tem o piso do arquivo alto e a conversa
    # baixa da equipe ficaria abaixo de piso + 6 dB)
    piso = VE._piso_fonte(c, ts["fonte"])
    if len(lv):
        piso = min(piso, float(np.percentile(lv, 10)))
    return [(round(s0 + a, 2), round(s0 + b, 2)) for a, b in VE.voz_continua(t, f, lv, piso)]
