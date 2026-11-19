"""fala_cortada: nenhuma fala termina antes da última sílaba (pedido do dono em 19/11, depois dos vídeos da Lavínia).

Para o fim de cada peça de voz do EDL (menos as que continuam coladas na peça seguinte, da mesma fonte):
1) forma de onda da FONTE em volta do corte: se a voz ainda está ativa no instante do corte e morre logo depois
   (50 a 450 ms, antes da palavra seguinte), o corte comeu a cauda da última sílaba;
2) palavra a palavra da fonte (transcrição da análise, quando existe ao lado do áudio): corte dentro de uma palavra reprova;
3) de ouvido, no mix final: a última palavra da peça tem de ser ouvida perto do fim dela. Se a voz estava ativa no corte
   e a palavra não é ouvida, reprova; se a onda estava calma, vira só observação (o Whisper erra palavra sob música).
Sem as fontes (teste/legado), só o item 3, como observação.
"""
import json
import pathlib

import numpy as np

ID, BLOQUEIA = "fala_cortada", True
PASSO = 0.01            # s por amostra do envelope
ANTES, DEPOIS = 1.0, 0.6


def envelope_db(x: np.ndarray, sr: int) -> np.ndarray:
    hop = max(1, int(round(sr * PASSO)))
    n = len(x) // hop
    if n == 0:
        return np.zeros(0, np.float32)
    q = x[: n * hop].astype(np.float64).reshape(n, hop)
    return (10 * np.log10((q * q).mean(axis=1) + 1e-12)).astype(np.float32)


def medir_corte(env: np.ndarray, i_corte: int) -> dict:
    """env: envelope em dB (10 ms); i_corte: índice do corte. Diz se a voz estava ativa no corte e em quanto tempo morre."""
    antes = env[max(0, i_corte - int(ANTES / PASSO)):i_corte]
    if len(antes) < 8:
        return {"ativo": False, "cauda_ms": None, "motivo": "trecho curto demais para medir"}
    ref = float(np.percentile(antes, 90))
    piso = float(np.percentile(env, 10))
    contraste = ref - piso > 10.0
    lim_ativo = max(ref - 14.0, piso + 8.0) if contraste else ref - 14.0
    lim_calmo = min(max(ref - 24.0, piso + 4.0), lim_ativo - 4.0) if contraste else ref - 24.0
    ult = antes[-3:]
    no_corte = float(10 * np.log10(np.mean(10 ** (ult / 10))))
    # sem contraste voz/sala na janela (fala corrida, sem pausa) só vale se o nível for mesmo de voz (acima de -35 dBFS)
    ativo = no_corte > lim_ativo and (contraste or ref > -35.0)
    cauda = None
    if ativo:
        depois = env[i_corte:]
        for k in range(0, max(0, len(depois) - 3)):
            if np.all(depois[k:k + 3] < lim_calmo):
                cauda = int(round(k * PASSO * 1000))
                break
    return {"ativo": bool(ativo), "cauda_ms": cauda, "no_corte_db": round(no_corte - ref, 1)}


def _palavras_fonte(c, fid: str) -> list | None:
    try:
        arq = pathlib.Path(c.fontes.audio(fid)).parent / "analise.json"
        if not arq.exists():
            return None
        from motor.etapas.resolvedor import palavras_do_arquivo
        return palavras_do_arquivo(json.loads(arq.read_text(encoding="utf-8")))
    except Exception:  # noqa: BLE001 - sem transcrição da fonte, valem a onda e o mix
        return None


def _parecida(a: str, b: str) -> bool:
    """Palavra do EDL (já corrigida: marca, número) x palavra ouvida no mix: igual, uma contém a outra ou 60% parecida."""
    import difflib
    if not a or not b:
        return False
    return a == b or (len(b) >= 3 and (a in b or b in a)) or difflib.SequenceMatcher(None, a, b).ratio() >= 0.6


def _fim_na_fonte(v: dict) -> float:
    vel = float(v.get("vel", 1.0) or 1.0)
    return min(float(v["s1"]), float(v["s0"]) + (float(v["t1"]) - float(v["t0"])) * vel)


def checar(c):
    from motor.etapas.montagem.comum import SR, ler_audio
    from motor.etapas.qa import normalizar
    voz = sorted(c.edl.get("voz", []) or [], key=lambda v: v["t0"])
    if not voz:
        return {"ok": True, "detalhe": "filme sem fala"}
    tr = c.transcrever("mix", c.mix if c.mix is not None else c.final)
    ouvidas = c.palavras(tr) if tr and not tr.get("erro") else None
    probs, obs, val, pal_cache = [], [], [], {}
    for i, v in enumerate(voz):
        prox = voz[i + 1] if i + 1 < len(voz) else None
        fim = _fim_na_fonte(v)
        if prox and prox["fonte"] == v["fonte"] and abs(prox["t0"] - v["t1"]) < 0.05 and abs(prox["s0"] - fim) < 0.06:
            continue                                            # a fala continua na peça seguinte: não é um fim
        item = {"voz": v["id"], "t": round(float(v["t1"]), 2)}
        ultima = next((n for n in reversed(normalizar(v.get("texto") or "").split()) if len(n) >= 3), None)
        ouvida = None
        if ultima and ouvidas is not None:
            perto = [o[2] for o in ouvidas if v["t1"] - 1.5 <= o[0] <= v["t1"] + 0.7]
            ouvida = any(_parecida(ultima, o) for o in perto) or _parecida(ultima, "".join(perto[-2:]))
            item["ultima_palavra"], item["ouvida_no_mix"] = ultima, ouvida
        m = None
        if c.fontes is not None:
            try:
                off = c.fontes.offset(v["fonte"])
                x = ler_audio(c.fontes.audio(v["fonte"]), max(0.0, fim - off - ANTES), ANTES + DEPOIS, cfg=c.cfg)
            except Exception as e:  # noqa: BLE001
                return {"ok": False, "bloqueia": True,
                        "detalhe": f"NÃO VERIFICADO: não consegui ler o áudio da fonte '{v['fonte']}' ({type(e).__name__}); a versão não é entregue sem conferir o fim das falas"}
            env = envelope_db(np.asarray(x, np.float32).reshape(-1), SR)
            m = medir_corte(env, min(len(env), int(round(min(ANTES, fim - off) / PASSO))))
            item.update(m)
            if v["fonte"] not in pal_cache:
                pal_cache[v["fonte"]] = _palavras_fonte(c, v["fonte"])
            pal = pal_cache[v["fonte"]]
            dentro = next((w for w in pal or [] if w[0] + 0.04 < fim < w[1] - 0.05), None)
            seguinte = next((w[0] for w in pal or [] if w[0] >= fim - 0.03), None)
            quem = f"{v['id']} (aos {v['t1']:.1f} s" + (f", «…{ultima}»)" if ultima else ")")
            if dentro is not None:
                probs.append(f"{quem}: o corte cai dentro da palavra «{str(dentro[2]).strip()}», faltam {int((dentro[1] - fim) * 1000)} ms")
            elif m["ativo"] and m["cauda_ms"] is not None and 50 <= m["cauda_ms"] <= 450 and (seguinte is None or fim + m["cauda_ms"] / 1000 <= seguinte + 0.03):
                probs.append(f"{quem}: a última sílaba continua por {m['cauda_ms']} ms depois do corte")
            elif m["ativo"] and ouvida is False:
                probs.append(f"{quem}: a voz está ativa no corte e a última palavra não é ouvida no mix final")
            elif ouvida is False:
                obs.append(f"{v['id']}: «{ultima}» não reconhecida no mix (onda calma no corte)")
        elif ouvida is False:
            obs.append(f"{v['id']}: «{ultima}» não reconhecida no mix (sem fonte para medir a onda)")
        val.append(item)
    det = "; ".join(probs[:6]) if probs else f"{len(val)} fim(ns) de fala conferido(s): nenhum corte antes da última sílaba"
    if obs and not probs:
        det += " · observação: " + "; ".join(obs[:3])
    return {"ok": not probs, "valor": val, "detalhe": det}
