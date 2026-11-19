"""cobertura_sintonia: imagem por cima da fala não pode mostrar gente em primeiro plano fora de sincronia
(pedido do dono em 19/11: "take por cima da fala não pode mostrar o falante olhando para outro lado").

Um plano é COBERTURA quando a voz que toca por baixo vem de outra fonte ou de outro instante da mesma fonte
(diferença maior que 0,3 s). Plano em sincronia (a pessoa falando o que se ouve) e janela/PiP não entram.
Para cada cobertura com 0,5 s ou mais de fala por baixo, o QA olha até 3 quadros do FILME FINAL e procura rosto:
rosto com 30% ou mais da largura do quadro (close; plano médio de cliente ou atendente passa), na maioria dos quadros olhados, é pessoa em primeiro plano com a boca fora
da fala (falante desconectado) e reprova. "Fora do assunto" é semântica: fica com a revisão por IA (olho do Claude).
Sem detector de rosto e com cobertura para conferir, o QA não passa calado.
"""
ID, BLOQUEIA = "cobertura_sintonia", True
ROSTO_MIN = 0.30         # largura do rosto / largura do quadro (0,20 pegava b-roll comum com gente: revisão de 19/11)
SOBRE_MIN = 0.5          # s de fala por baixo para contar
SINC_S = 0.3


def _detector(c):
    if getattr(c, "_rostos", None) is None:
        from motor.provedores.visao_local import DetectorRostos
        c._rostos = DetectorRostos(c.cfg)
    return c._rostos


def _base(fid: str) -> str:
    """'c3_1' (trecho 1 do clipe c3) e 'c3' são a mesma câmera."""
    cabeca, _, rabo = str(fid).rpartition("_")
    return cabeca if cabeca and rabo.isdigit() else str(fid)


def coberturas(edl: dict) -> list[dict]:
    """Planos que cobrem fala: [{plano, t0, t1, voz, texto}] com o trecho de sobreposição."""
    out = []
    voz = edl.get("voz", []) or []
    for p in edl.get("planos", []) or []:
        if p.get("janela"):
            continue
        for v in voz:
            a, b = max(p["t0"], v["t0"]), min(p["t1"], v["t1"])
            if b - a < SOBRE_MIN:
                continue
            t = (a + b) / 2
            em_sinc = False
            if not p.get("rampa") and _base(p["fonte"]) == _base(v["fonte"]):
                sp = float(p["s0"]) + (t - p["t0"]) * float(p.get("vel", 1.0) or 1.0)
                sv = float(v["s0"]) + (t - v["t0"]) * float(v.get("vel", 1.0) or 1.0)
                em_sinc = abs(sp - sv) <= SINC_S
            if not em_sinc:
                out.append({"plano": p["id"], "t0": round(a, 3), "t1": round(b, 3), "voz": v["id"], "texto": str(v.get("texto") or "")})
    return out


def checar(c):
    cobs = coberturas(c.edl)
    if not cobs:
        return {"ok": True, "detalhe": "nenhuma imagem por cima de fala (ou todas em sincronia)"}
    det = _detector(c)
    if getattr(det, "nome", "nenhum") == "nenhum":
        return {"ok": False, "bloqueia": True,
                "detalhe": f"NÃO VERIFICADO: detector de rosto indisponível e há {len(cobs)} cobertura(s) sobre fala para conferir"}
    probs, val, evid = [], [], []
    for cb in cobs:
        dur = cb["t1"] - cb["t0"]
        tempos = [cb["t0"] + dur * u for u in ((0.5,) if dur < 1.0 else (0.25, 0.5, 0.75))]
        larguras, pior = [], None
        for t in tempos:
            q = c.quadro(t)
            if q is None:
                continue
            w = max((cx[2] for cx in det.detectar(q)), default=0.0)
            larguras.append(round(float(w), 3))
            if w >= ROSTO_MIN and (pior is None or w > pior[0]):
                pior = (w, q, t)
        grandes = sum(1 for w in larguras if w >= ROSTO_MIN)
        item = {"plano": cb["plano"], "voz": cb["voz"], "t": round((cb["t0"] + cb["t1"]) / 2, 2), "rosto_largura": larguras}
        val.append(item)
        if larguras and grandes * 2 > len(larguras):
            evid.append(c.salvar_quadro(pior[1], f"cobertura_{cb['plano']}_{cb['voz']}.jpg"))
            probs.append(f"plano {cb['plano']} aos {pior[2]:.1f} s cobre a fala «{cb['texto'][:40]}» com rosto em primeiro plano "
                         f"({pior[0]:.0%} da largura) fora de sincronia")
    return {"ok": not probs, "valor": val, "evidencia": evid,
            "detalhe": "; ".join(probs[:5]) if probs else f"{len(cobs)} cobertura(s) sobre fala conferida(s): nenhuma com rosto em primeiro plano fora de sincronia"}
