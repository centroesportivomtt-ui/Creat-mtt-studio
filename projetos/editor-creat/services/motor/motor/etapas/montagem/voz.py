"""VOZ: a espinha do filme. Cada peça `voz[]` do EDL sai da fonte, passa pela cadeia leve de 17/11 e é colocada em t0.

Reaproveita V2/py/voz_build.py, sem caminho fixo:
- trecho s0..s1 lido direto do arquivo (offset da fonte respeitado), com 40 ms de folga para a emenda;
- limpeza com IA: DeepFilterNet3 em ONNX (dfn3.py, sem torch), com 1 s de contexto antes da peça. A mistura do limpo com o
  original é escolhida POR FONTE pelo medidor de voz DNSMOS (`limpeza.auto`): o máximo de fundo limpo sem a nota da voz cair
  (regra do dono: voz natural, sem artefato). Mistura fixa quando o EDL manda (`limpeza.mistura` sem `auto`). Sem o modelo,
  só a cadeia leve;
- cadeia leve: passa-alta 85 Hz, de-esser suave, compressor 1,8:1 (a mesma de 17/11);
- nível: cada fonte é levada a -17 LUFS medidos só nas peças usadas dela (vozes de câmeras diferentes ficam iguais);
- velocidade da fala (`vel`) por atempo (sem mudar o tom) e emendas com fade de 25 ms (crossfade de 28 ms entre peças coladas).
Saída: (voz_mono float32 em 48 kHz com o tamanho do filme, relatório por peça).
"""
from __future__ import annotations

import numpy as np

from motor.etapas.montagem.comum import SR, Fontes, ffmpeg, ler_audio

FOLGA = 0.04
FADE = 0.025
ALVO_LUFS = -17.0


CONTEXTO = 2.0           # s de áudio antes da peça só para a IA (a normalização dela tem memória de ~1 s); é descartado
MISTURAS = (0.0, 0.6, 0.7, 0.8, 0.9, 1.0)
QUEDA_VOZ_MAX = 0.15     # a nota da VOZ (DNSMOS SIG) não pode cair mais que isso em relação à melhor: regra "sem artefato"
GANHO_MIN = 0.10         # limpar só vale se a nota geral subir pelo menos isso (fonte já limpa: fica o original)
MARGEM_TOTAL = 0.10      # 100% IA só se ganhar da mistura de 90% por mais que isso (voz 100% da IA é o último recurso)
AMOSTRA_S = 30.0
_LIMPADOR = None
_TRAVA = __import__("threading").Lock()
log = __import__("logging").getLogger(__name__)


def limpador(cfg):
    """DeepFilterNet3 em ONNX (motor/etapas/montagem/dfn3.py). Só guarda a instância que carregou: sem modelo agora, o próximo
    filme tenta de novo (o download do boot pode terminar depois)."""
    global _LIMPADOR
    with _TRAVA:
        if _LIMPADOR is not None and _LIMPADOR.disponivel:
            return _LIMPADOR
        from motor.etapas.montagem.dfn3 import Limpador
        L = Limpador(cfg)
        if L.disponivel:
            _LIMPADOR = L
        return L


def escolher_mistura(cru: np.ndarray, limpo: np.ndarray, cfg, sr: int = SR, padrao: float = 0.8) -> dict:
    """Quanto do limpo entra (0..1), escolhido pelo medidor de voz (DNSMOS) nesta FONTE: o máximo de fundo limpo sem a voz
    perder qualidade. Regra: entre as misturas cuja nota de voz (SIG) fica a até 0,15 da melhor, a de maior nota geral
    (OVRL); empate (até 0,03) fica com a mistura MENOR (mais natural). Sem medidor: `padrao`.
    Devolve {"mistura", "antes", "depois", "medida": bool}."""
    from motor import qualidade_voz as Q
    antes = Q.notas(cru, sr, cfg)
    if antes is None:
        log.warning("medidor de voz indisponível: mistura de reserva %.2f", padrao)
        return {"mistura": padrao, "antes": None, "depois": None, "medida": False}
    cand = {m: (antes if m == 0.0 else Q.notas(m * limpo + (1 - m) * cru, sr, cfg)) for m in MISTURAS}
    cand = {m: c for m, c in cand.items() if c}
    sig_max = max(c["sig"] for c in cand.values())
    ok = {m: c for m, c in cand.items() if c["sig"] >= sig_max - QUEDA_VOZ_MAX}
    if 1.0 in ok and 0.9 in ok and ok[1.0]["ovrl"] < ok[0.9]["ovrl"] + MARGEM_TOTAL:
        ok.pop(1.0)                                        # 100% IA só quando ganha com folga
    melhor = max(c["ovrl"] for c in ok.values())
    m = min(k for k, c in ok.items() if c["ovrl"] >= melhor - 0.03)
    if m > 0.0 and cand[m]["ovrl"] < antes["ovrl"] + GANHO_MIN:
        m = 0.0                                            # a limpeza não melhorou de verdade: fica o original
    return {"mistura": m, "antes": antes, "depois": cand[m], "medida": True}


def amostra(crus: list, limpos: list, energias: list, sr: int = SR, seg: float = AMOSTRA_S):
    """Peças de MAIS ENERGIA (fala de verdade, não silêncio nem abertura) até `seg` segundos, sem copiar a fonte inteira."""
    ordem = sorted(range(len(crus)), key=lambda i: -energias[i])
    a, b, total = [], [], 0
    for i in ordem:
        a.append(crus[i])
        b.append(limpos[i])
        total += len(crus[i])
        if total >= seg * sr:
            break
    n = int(seg * sr)
    return np.concatenate(a)[:n], np.concatenate(b)[:n]


def cadeia(x: np.ndarray, vel: float, tmpdir, cfg=None) -> np.ndarray:
    """passa-alta + de-esser + compressor (cadeia de 17/11) + atempo, numa chamada de ffmpeg."""
    import soundfile as sf
    ent = tmpdir / "_v_in.wav"
    sai = tmpdir / "_v_out.wav"
    sf.write(ent, x, SR, subtype="FLOAT")
    af = "highpass=f=85:poles=2,deesser=i=0.3:m=0.5:f=0.5,acompressor=threshold=-26dB:ratio=1.8:attack=18:release=260:makeup=1:knee=8"
    v = float(vel or 1.0)
    if abs(v - 1.0) > 1e-3:
        while v > 2.0:
            af += ",atempo=2.0"
            v /= 2.0
        af += f",atempo={v:.5f}"
    ffmpeg(["-i", str(ent), "-af", af, "-c:a", "pcm_f32le", str(sai)], cfg)
    y, _ = sf.read(sai, dtype="float32")
    return y


def montar_voz(edl: dict, fontes: Fontes, tmpdir, cfg=None, progresso=None) -> tuple[np.ndarray, list[dict]]:
    import pyloudnorm as pyln
    tmpdir.mkdir(parents=True, exist_ok=True)
    N = int(round(edl["duracao"] * SR))
    voz = np.zeros(N, np.float32)
    pecas = sorted(edl.get("voz", []), key=lambda v: v["t0"])
    if not pecas:
        return voz, []
    # 1) trechos crus (com folga) e limpeza por IA (DeepFilterNet3 ONNX), com 1 s de contexto antes só para a IA
    L = limpador(cfg)
    crus, limpos, rel = [], [], []
    for i, v in enumerate(pecas):
        off = fontes.offset(v["fonte"])
        a = v["s0"] - off - FOLGA
        ctx = min(CONTEXTO, max(0.0, a)) if L.disponivel else 0.0
        x = ler_audio(fontes.audio(v["fonte"]), a - ctx, (v["s1"] - v["s0"]) + 2 * FOLGA + ctx, cfg=cfg)
        k = int(round(ctx * SR))
        crus.append(x[k:])
        limpos.append(L.enhance(x)[k:] if L.disponivel else None)
        rel.append({"id": v["id"], "fonte": v["fonte"], "limpeza_ia": bool(L.disponivel)})
        if progresso:
            progresso(0.4 * (i + 1) / len(pecas), f"Voz: limpeza {i + 1}/{len(pecas)}")
    # mistura por FONTE para as peças `auto` (mesmo ruído, mesmo tratamento); peça com mistura fixa no EDL usa a dela
    misturas: dict[int, float] = {}
    medidas: dict[int, dict] = {}
    if L.disponivel:
        for fid in {v["fonte"] for v in pecas}:
            auto = [i for i, v in enumerate(pecas) if v["fonte"] == fid and (v.get("limpeza") or {}).get("auto")]
            if auto:
                en = [float(np.mean(crus[i] ** 2)) for i in auto]
                cru_a, limpo_a = amostra([crus[i] for i in auto], [limpos[i] for i in auto], en)
                r = escolher_mistura(cru_a, limpo_a, cfg, padrao=float((pecas[auto[0]].get("limpeza") or {}).get("mistura", 0.8)))
                for i in auto:
                    misturas[i], medidas[i] = r["mistura"], r
        for i, v in enumerate(pecas):
            if i not in misturas:
                misturas[i] = float((v.get("limpeza") or {}).get("mistura", 0.8))
                medidas[i] = {"antes": None, "depois": None}
    brutos = []
    for i, v in enumerate(pecas):
        m = misturas.get(i)
        brutos.append(crus[i] if m is None else (m * limpos[i] + (1 - m) * crus[i]).astype(np.float32))
        limpos[i] = None                                   # solta a memória do limpo assim que a peça está pronta
        if m is not None:
            rel[i].update(mistura=m, voz_antes=medidas[i]["antes"], voz_depois=medidas[i]["depois"])
    if progresso:
        progresso(0.5, "Voz: limpeza pronta")
    # 2) nível por fonte: -17 LUFS medidos nas peças usadas
    meter = pyln.Meter(SR)
    ganho = {}
    for fid in {v["fonte"] for v in pecas}:
        xs = np.concatenate([b for b, v in zip(brutos, pecas) if v["fonte"] == fid])
        if len(xs) < int(0.5 * SR):
            xs = np.tile(xs, int(np.ceil(0.5 * SR / max(1, len(xs)))) + 1)
        lf = meter.integrated_loudness(xs.astype(np.float64))
        ganho[fid] = 10 ** ((ALVO_LUFS - lf) / 20) if np.isfinite(lf) else 1.0
        ganho[fid] = float(min(ganho[fid], 10 ** (24 / 20)))
    # 3) cadeia + atempo + colocação
    fd = int(FADE * SR)
    for i, (v, x) in enumerate(zip(pecas, brutos)):
        x = x * ganho[v["fonte"]] * 10 ** (float(v.get("ganho_db", 0) or 0) / 20)
        y = cadeia(x, float(v.get("vel", 1.0) or 1.0), tmpdir, cfg)
        vel = float(v.get("vel", 1.0) or 1.0)
        corta = int(round(FOLGA / vel * SR))
        colar_ant = i > 0 and abs(pecas[i - 1]["t1"] - v["t0"]) < 0.02
        xf = int(0.028 * SR) if colar_ant else fd
        inicio = int(round(v["t0"] * SR)) - (xf if colar_ant else 0)
        y = y[max(0, corta - (xf if colar_ant else 0)):]
        alvo = int(round((v["t1"] - v["t0"]) * SR)) + (xf if colar_ant else 0)
        y = y[: alvo + fd]
        if len(y) == 0:
            continue
        ent = min(xf, len(y))
        y[:ent] *= np.sin(np.linspace(0, np.pi / 2, ent)) ** 2
        sai = min(fd, len(y))
        y[-sai:] *= np.cos(np.linspace(0, np.pi / 2, sai)) ** 2
        a = max(0, inicio)
        b = min(N, a + len(y))
        voz[a:b] += y[: b - a]
        rel[i].update(t0=v["t0"], dur_real=round(len(y) / SR, 3), dur_edl=round(v["t1"] - v["t0"], 3), ganho_db=round(20 * np.log10(ganho[v["fonte"]]), 1))
        if progresso:
            progresso(0.5 + 0.5 * (i + 1) / len(pecas), f"Voz: emenda {i + 1}/{len(pecas)}")
    for f in ("_v_in.wav", "_v_out.wav"):
        (tmpdir / f).unlink(missing_ok=True)
    return voz, rel
