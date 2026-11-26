"""Sincronia entre câmeras pelo áudio (onda 4, D47). Caso real de 26/11 (Super Kal, Black): anúncio de diálogo com duas pessoas
e duas câmeras (dois iPhones gravando juntos). A conferência só aceitava como "take da fala" o plano da MESMA câmera; a segunda
câmera, mesmo mostrando a mesma conversa, virava cobertura com rosto e reprovava. Aqui se mede, pelo som, quanto uma câmera está
atrasada em relação à outra.

    offset(xa, xb, sr=16000, janela_s=None) -> {"offset_s", "conf", "razao"} | None
        b = a deslocado de offset_s: um som no instante t do arquivo a aparece em t + offset_s no arquivo b.
    alinhar(edl, audio_de, modo_vozes) -> dict de origem.sincronia | None
        no diálogo (`varias`), muda no lugar o `s0` do plano da outra câmera que cobre uma peça de voz para o ponto em sincronia.

Como mede (sem modelo, só numpy/scipy):
1. envelope de 10 ms na banda da fala (log), só a VARIAÇÃO RÁPIDA (menos a média móvel de 0,5 s, como `resolvedor._silabas_db`):
   o ganho, o ruído e a equalização de cada microfone somem; ficam as sílabas, que as duas câmeras ouvem iguais;
2. correlação cruzada NORMALIZADA (Pearson na parte que se sobrepõe, para cada atraso) numa janela de busca de ±120 s;
3. refinamento por GCC-PHAT a 8 kHz em ±50 ms em volta do pico (precisão de amostra, para a boca bater com a voz).
Aceita só com `conf >= SINC_CONF_MIN` e `razao >= SINC_RAZAO_MIN` (pico sobre o segundo pico fora de ±0,5 s). Música em laço
ou ruído constante têm vários picos parecidos (razão perto de 1) e devolvem None: sincronia falsa alinharia o plano errado.

Quem usa: a montagem (`montagem.sincronia`, frente MOTOR-A, com import protegido) alinha; a conferência (`qa.cobertura_sintonia`
e `qa.voz_externa`) MEDE DE NOVO e não confia no EDL.
"""
from __future__ import annotations

import numpy as np

SR = 16000
PASSO = 0.01                  # s por quadro do envelope
BUSCA_S = 120.0               # janela de busca padrão (± s)
SINC_CONF_MIN = 0.45
SINC_RAZAO_MIN = 1.4
FORA_PICO_S = 0.5             # o segundo pico é procurado fora de ±0,5 s do primeiro
REFINO_S = 0.05               # GCC-PHAT em ±50 ms em volta do pico do envelope
SR_REFINO = 8000
REFINO_TRECHO_S = 20.0        # trecho usado no GCC-PHAT (o de mais fala da parte comum)
SOBREPOSICAO_MIN_S = 4.0      # menos que isso de parte comum não dá correlação confiável
CRUZA_MIN_S = 0.5             # plano que cobre uma peça de voz por menos que isso não é alinhado
JA_SINC_S = 0.02              # |Δ| menor que isso: já está em sincronia, nada muda
VEL_TOL = 0.01                # velocidade do plano e da voz precisam ser iguais para a boca bater do começo ao fim
ALGO = "sinc-1"
LONGE_S = 60.0                # câmeras iniciadas com mais que isso de diferença: a busca centra na diferença do gravado_em


def _base(fid: str) -> str:
    """'c3_1' (trecho 1 do clipe c3) e 'c3' são a mesma câmera (o mesmo de qa.cobertura_sintonia._base)."""
    cabeca, _, rabo = str(fid).rpartition("_")
    return cabeca if cabeca and rabo.isdigit() else str(fid)


def _mono(x) -> np.ndarray:
    x = np.asarray(x, np.float32)
    return x.mean(1) if x.ndim > 1 else x.reshape(-1)


def envelope(x: np.ndarray, sr: int = SR) -> np.ndarray:
    """Envelope de 10 ms (dB) na banda da fala, menos a média móvel de 0,5 s (só a variação rápida), recortado em ±20 dB."""
    from scipy.signal import butter, sosfilt
    x = _mono(x)
    h = max(1, int(round(sr * PASSO)))
    n = len(x) // h
    if n < 3:
        return np.zeros(0, np.float32)
    y = sosfilt(butter(2, [300, min(3400, sr / 2 - 100)], "bp", fs=sr, output="sos"), x)
    e = 10 * np.log10(np.mean(y[: n * h].reshape(n, h).astype(np.float64) ** 2, 1) + 1e-12)
    e = np.maximum(e, float(np.percentile(e, 5)))       # o silêncio digital (-120 dB) não vira "sílaba"
    k = max(3, int(round(0.5 / PASSO)))
    media = np.convolve(np.pad(e, (k // 2, k - 1 - k // 2), mode="edge"), np.ones(k) / k, mode="valid")
    return np.clip(e - media, -20, 20).astype(np.float64)


def _corr_normalizada(ea: np.ndarray, eb: np.ndarray, min_n: int) -> tuple[np.ndarray, np.ndarray]:
    """Pearson entre a e b deslocado, para cada atraso L (b[n + L] contra a[n]), só na parte que se sobrepõe.
    Devolve (lags em quadros, r); atraso com menos de `min_n` quadros em comum fica em -1."""
    from scipy.signal import correlate, correlation_lags
    ua, ub = np.ones(len(ea)), np.ones(len(eb))
    lags = correlation_lags(len(eb), len(ea), mode="full")
    sab = correlate(eb, ea, mode="full", method="fft")
    sa = correlate(ub, ea, mode="full", method="fft")
    sa2 = correlate(ub, ea * ea, mode="full", method="fft")
    sb = correlate(eb, ua, mode="full", method="fft")
    sb2 = correlate(eb * eb, ua, mode="full", method="fft")
    n = np.rint(correlate(ub, ua, mode="full", method="fft"))
    with np.errstate(invalid="ignore", divide="ignore"):
        cov = sab - sa * sb / n
        va = sa2 - sa * sa / n
        vb = sb2 - sb * sb / n
        r = cov / np.sqrt(np.maximum(va * vb, 1e-12))
    r = np.where((n >= min_n) & np.isfinite(r), r, -1.0)
    return lags, np.clip(r, -1.0, 1.0)


def _gcc_phat(a: np.ndarray, b: np.ndarray, sr: int, alcance_s: float) -> tuple[float, float] | None:
    """Atraso fino (s) de b em relação a a por GCC-PHAT, procurado em ±alcance_s, e a saliência do pico (pico / média)."""
    n = len(a) + len(b)
    nfft = 1 << int(np.ceil(np.log2(max(2, n))))
    A, B = np.fft.rfft(a, nfft), np.fft.rfft(b, nfft)
    R = B * np.conj(A)
    R /= np.maximum(np.abs(R), 1e-12)
    cc = np.fft.irfft(R, nfft)
    k = int(round(alcance_s * sr))
    janela = np.concatenate([cc[-k:], cc[: k + 1]])      # atrasos -k..k
    if not len(janela):
        return None
    i = int(np.argmax(janela))
    saliencia = float(janela[i] / (np.mean(np.abs(janela)) + 1e-12))
    return (i - k) / sr, saliencia


def _pico(xa: np.ndarray, xb: np.ndarray, sr: int, janela_s: float | None, centro_s: float) -> dict:
    """Medida bruta: {"conf", "razao", "grosso" (s, com subquadro), "ea"} ou {"motivo"} quando não dá para medir."""
    ea, eb = envelope(xa, sr), envelope(xb, sr)
    curto = min(len(ea), len(eb))
    min_n = int(min(SOBREPOSICAO_MIN_S / PASSO, 0.6 * curto)) if curto else 0
    if not curto or min_n < int(1.5 / PASSO):
        return {"motivo": "áudio curto demais para medir a sincronia (menos de 1,5 s em comum)"}
    lags, r = _corr_normalizada(ea, eb, min_n)
    meia = BUSCA_S if janela_s is None else float(janela_s)
    r = np.where(np.abs(lags * PASSO - float(centro_s)) <= meia + 1e-9, r, -1.0)
    i = int(np.argmax(r))
    conf = float(r[i])
    if conf <= 0:
        return {"motivo": "nenhuma semelhança entre os dois áudios", "conf": 0.0, "razao": 0.0}
    fora = np.abs(lags - lags[i]) * PASSO > FORA_PICO_S
    seg = float(np.max(np.where(fora, r, -1.0))) if fora.any() else -1.0
    razao = conf / seg if seg > 1e-6 else 99.0
    L = float(lags[i])                                   # pico em subquadro (parábola)
    if 0 < i < len(r) - 1 and r[i - 1] > -1 and r[i + 1] > -1:
        den = r[i - 1] - 2 * r[i] + r[i + 1]
        if abs(den) > 1e-12:
            L += float(np.clip(0.5 * (r[i - 1] - r[i + 1]) / den, -0.5, 0.5))
    return {"conf": conf, "razao": min(razao, 99.0), "grosso": L * PASSO, "ea": ea}


def medir(xa, xb, sr: int = SR, janela_s: float | None = None, centro_s: float = 0.0) -> dict:
    """Como `offset`, mas sempre devolve a medida, com "aceito" e, quando recusa, o "motivo" (para o relatório dizer POR QUE
    não alinhou): {"aceito", "offset_s", "conf", "razao", "motivo"?}."""
    xa, xb = _mono(xa), _mono(xb)
    m = _pico(xa, xb, sr, janela_s, centro_s)
    if "grosso" not in m:
        return {"aceito": False, "conf": round(float(m.get("conf", 0.0)), 3), "razao": round(float(m.get("razao", 0.0)), 2), "motivo": m["motivo"]}
    conf, razao = m["conf"], m["razao"]
    out = {"aceito": conf >= SINC_CONF_MIN and razao >= SINC_RAZAO_MIN, "conf": round(conf, 3), "razao": round(razao, 2)}
    if not out["aceito"]:
        out["offset_s"] = round(m["grosso"], 4)
        out["motivo"] = (f"semelhança {conf:.2f} abaixo de {SINC_CONF_MIN}" if conf < SINC_CONF_MIN else
                         f"pico ambíguo (razão {razao:.2f} abaixo de {SINC_RAZAO_MIN}: música em laço ou ruído parecido em vários pontos)")
        return out
    fino = _refinar(xa, xb, sr, m["grosso"], m["ea"])
    out["offset_s"] = round(m["grosso"] if fino is None else fino, 4)
    out["refino"] = "gcc-phat" if fino is not None else "envelope"
    return out


def offset(xa, xb, sr: int = SR, janela_s: float | None = None, centro_s: float = 0.0) -> dict | None:
    """Atraso de b em relação a a pelo som: um som em t no arquivo a aparece em t + offset_s no arquivo b.

    `janela_s`: meia largura da busca (padrão ±120 s); `centro_s`: centro da busca (com a hora de gravação dos dois arquivos,
    a diferença entre elas). Devolve {"offset_s", "conf", "razao"} ou None (sem confiança: nada deve ser alinhado)."""
    m = medir(xa, xb, sr, janela_s, centro_s)
    return {"offset_s": m["offset_s"], "conf": m["conf"], "razao": m["razao"]} if m["aceito"] else None


def _refinar(xa: np.ndarray, xb: np.ndarray, sr: int, grosso: float, ea: np.ndarray) -> float | None:
    """GCC-PHAT a 8 kHz em ±50 ms em volta do atraso grosso, no trecho de mais fala da parte comum. None se o pico não se
    destaca (fica o atraso do envelope)."""
    from scipy.signal import resample_poly
    dur_a, dur_b = len(xa) / sr, len(xb) / sr
    ini, fim = max(0.0, -grosso), min(dur_a, dur_b - grosso)        # parte comum, no relógio de a
    if fim - ini < 1.0:
        return None
    tam = min(REFINO_TRECHO_S, fim - ini)
    # o trecho de mais variação (fala) dentro da parte comum
    i0, i1 = int(ini / PASSO), int((fim - tam) / PASSO)
    if i1 > i0:
        k = int(tam / PASSO)
        en = np.convolve(np.abs(ea), np.ones(k), mode="valid")[i0:i1 + 1]
        a0 = (i0 + int(np.argmax(en))) * PASSO if len(en) else ini
    else:
        a0 = ini
    m = REFINO_S + 0.01
    a_ini, a_fim = a0 + m, a0 + tam - m
    if a_fim - a_ini < 0.5:
        return None
    sa = xa[int(a_ini * sr):int(a_fim * sr)]
    sb = xb[int((a_ini + grosso) * sr):int((a_fim + grosso) * sr)]
    n = min(len(sa), len(sb))
    if n < int(0.5 * sr):
        return None
    sa, sb = sa[:n], sb[:n]
    if sr != SR_REFINO:
        sa = resample_poly(sa, SR_REFINO, sr)
        sb = resample_poly(sb, SR_REFINO, sr)
    g = _gcc_phat(sa.astype(np.float64), sb.astype(np.float64), SR_REFINO, REFINO_S)
    if g is None or g[1] < 6.0:
        return None
    # o trecho de b começou em a_ini + grosso (arredondado para amostra): o atraso fino soma a isso
    base_b = int((a_ini + grosso) * sr) / sr - int(a_ini * sr) / sr
    return base_b + g[0]


def _inicio(f: dict | None):
    """Instante (datetime) em que o ARQUIVO lido começa: gravado_em do original + o deslocamento do trecho. None sem data."""
    from datetime import datetime, timedelta
    g = (f or {}).get("gravado_em")
    if not g:
        return None
    try:
        d = datetime.fromisoformat(str(g).replace("Z", "+00:00"))
    except ValueError:
        return None
    return d + timedelta(seconds=float((f or {}).get("offset") or 0.0))


def busca_por_gravacao(fontes: dict, fa: str, fb: str) -> dict:
    """Parâmetros de busca para `medir`/`offset` a partir do `gravado_em` das duas fontes do EDL (plano da onda 4, 3.4d).
    Câmeras ligadas com até 60 s de diferença: {} (vale a busca padrão de ±120 s em volta de zero, que já cobre).
    Mais longe que isso: {"janela_s": 120, "centro_s": Δ}, com Δ = início de a - início de b (o atraso esperado de b).
    Sem data, data ilegível ou uma com fuso e outra sem: {} (a hora do arquivo não decide nada sozinha)."""
    ia, ib = _inicio((fontes or {}).get(fa)), _inicio((fontes or {}).get(fb))
    if ia is None or ib is None or (ia.tzinfo is None) != (ib.tzinfo is None):
        return {}
    c = (ia - ib).total_seconds()
    return {"janela_s": BUSCA_S, "centro_s": round(c, 2)} if abs(c) > LONGE_S else {}


# ------------------------------------------------------------------ montagem: alinhar a segunda câmera
def _src(x: dict, t: float) -> float:
    return float(x["s0"]) + (t - float(x["t0"])) * float(x.get("vel", 1.0) or 1.0)


def delta_fonte(med: dict, desloc_voz: float, desloc_plano: float) -> float:
    """Tempo de FONTE do plano que bate com o tempo de fonte sv da voz: sp = sv + delta.
    (arquivo da voz = sv - desloc_voz; arquivo do plano = arquivo da voz + offset; fonte do plano = arquivo + desloc_plano)."""
    return float(med["offset_s"]) + float(desloc_plano) - float(desloc_voz)


def alinhar(edl: dict, audio_de, modo_vozes: str) -> dict | None:
    """No diálogo (`modo_vozes == "varias"`): cada plano de OUTRA câmera que cobre uma peça de voz por >= 0,5 s, sem rampa de
    tempo, com `cobertura.olhar` diferente de "produto", com a mesma velocidade da voz e com o atraso entre as câmeras medido com
    confiança, passa a mostrar o instante em sincronia com a voz (muda `s0` no lugar), desde que esse trecho exista no arquivo do
    plano. Já em sincronia (|Δ| < 20 ms): nada muda, e o `s0_antes` da medição anterior (edl.origem.sincronia) é mantido;
    por isso rodar duas vezes dá o mesmo EDL, relatório incluído.

    `audio_de(fonte) -> (áudio mono 16 kHz, deslocamento_s) | None` (deslocamento: o tempo s do EDL cai em s - deslocamento no
    arquivo). Devolve o dict de `origem.sincronia`: {"algo", "pares": {"voz|plano": {offset_s, conf, razao}}, "planos":
    {id: {s0_antes, s0_depois, par}}, "sem_sincronia": [{"par", "motivo"}], "pulados": [{"plano", "motivo"}]}. Fora do diálogo: None."""
    if modo_vozes != "varias":
        return None
    voz = edl.get("voz") or []
    fontes = edl.get("fontes") or {}
    # o s0 ORIGINAL de cada plano vem da medição anterior: a segunda montagem do mesmo EDL grava o mesmo relatório (sem isso o
    # hash do EDL mudava e o filme era renderizado de novo sem nada mudar)
    ant = ((edl.get("origem") or {}).get("sincronia") or {}).get("planos") or {}
    rel: dict = {"algo": ALGO, "pares": {}, "planos": {}, "sem_sincronia": [], "pulados": []}
    medidas: dict = {}
    for p in edl.get("planos") or []:
        if p.get("rampa") or (p.get("cobertura") or {}).get("olhar") == "produto":
            continue
        cruz = []
        for v in voz:
            a, b = max(float(p["t0"]), float(v["t0"])), min(float(p["t1"]), float(v["t1"]))
            if b - a >= CRUZA_MIN_S:
                cruz.append((b - a, a, v))
        if not cruz:
            continue
        _, a, v = max(cruz, key=lambda c: c[0])           # a peça que o plano mais cobre
        if _base(v["fonte"]) == _base(p["fonte"]):
            continue                                       # mesma câmera: a régua de sempre (mesmo relógio de fonte)
        par = f"{v['fonte']}|{p['fonte']}"
        if abs(float(p.get("vel", 1.0) or 1.0) - float(v.get("vel", 1.0) or 1.0)) > VEL_TOL:
            rel["pulados"].append({"plano": p["id"], "motivo": "velocidade do plano diferente da voz"})
            continue
        if par not in medidas:
            av, ap = audio_de(v["fonte"]), audio_de(p["fonte"])
            if av is None or ap is None:
                medidas[par] = ({"aceito": False, "motivo": "fonte sem áudio"}, None, None)
            else:
                medidas[par] = (medir(av[0], ap[0], SR, **busca_por_gravacao(fontes, v["fonte"], p["fonte"])), av, ap)
            m = medidas[par][0]
            if m.get("aceito"):
                rel["pares"][par] = {"offset_s": m["offset_s"], "conf": m["conf"], "razao": m["razao"]}
            else:
                rel["sem_sincronia"].append({"par": par, "motivo": m.get("motivo", "sem confiança"), "conf": m.get("conf"), "razao": m.get("razao")})
        m, av, ap = medidas[par]
        if not m.get("aceito"):
            continue
        d = delta_fonte(m, av[1], ap[1])
        vel = float(p.get("vel", 1.0) or 1.0)
        s0_novo = _src(v, a) + d - (a - float(p["t0"])) * vel
        ini_arq = s0_novo - ap[1]
        fim_arq = ini_arq + (float(p["t1"]) - float(p["t0"])) * vel
        if ini_arq < 0 or fim_arq > len(ap[0]) / SR + 1e-3:
            rel["pulados"].append({"plano": p["id"], "motivo": "o trecho em sincronia não existe no arquivo do plano"})
            continue
        antes = float(p["s0"])
        if abs(s0_novo - antes) >= JA_SINC_S:
            p["s0"] = round(s0_novo, 3)
        a0 = ant.get(p["id"]) or {}
        original = a0["s0_antes"] if a0.get("par") == par and isinstance(a0.get("s0_antes"), (int, float)) \
            and abs(float(a0.get("s0_depois", float("nan"))) - antes) < 1e-6 else antes
        rel["planos"][p["id"]] = {"s0_antes": round(float(original), 3), "s0_depois": round(float(p["s0"]), 3), "par": par}
    rel["sem_sincronia"] = rel["sem_sincronia"][:20]
    rel["pulados"] = rel["pulados"][:20]
    return rel
