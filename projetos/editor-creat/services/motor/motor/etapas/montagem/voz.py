"""VOZ: a espinha do filme. Cada peça `voz[]` do EDL sai da fonte, passa pela cadeia leve de 17/11 e é colocada em t0.

Reaproveita V2/py/voz_build.py, sem caminho fixo:
- trecho s0..s1 lido direto do arquivo (offset da fonte respeitado), com 40 ms de folga para a emenda;
- limpeza com IA (DeepFilterNet) MODERADA quando instalada (`pip install editor-motor[voz]`): mistura `limpeza.mistura` do limpo
  com o original e atenuação limitada a `limpeza.atenuacao_db` (regra do dono: voz natural, sem artefato). Sem DFN, só a cadeia leve;
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


def _df():
    try:
        from df.enhance import enhance, init_df  # type: ignore
        return enhance, init_df
    except Exception:  # noqa: BLE001 - DFN é opcional
        return None


_DF_ESTADO = None


def limpar_ia(x: np.ndarray, atenuacao_db: float, mistura: float) -> tuple[np.ndarray, bool]:
    """DeepFilterNet moderado (carregado uma vez por processo). Sem DFN devolve o original."""
    global _DF_ESTADO
    f = _df()
    if f is None or len(x) < SR // 4:
        return x, False
    enhance, init_df = f
    try:
        import torch  # type: ignore
        if _DF_ESTADO is None:
            _DF_ESTADO = init_df(log_level="ERROR")
        modelo, est, _ = _DF_ESTADO
        sr_df = est.sr()
        y = x if sr_df == SR else np.interp(np.arange(0, len(x), SR / sr_df), np.arange(len(x)), x).astype(np.float32)
        lim = enhance(modelo, est, torch.from_numpy(y[None]), atten_lim_db=float(atenuacao_db)).numpy()[0]
        if sr_df != SR:
            lim = np.interp(np.arange(len(x)) * sr_df / SR, np.arange(len(lim)), lim).astype(np.float32)
        lim = lim[: len(x)]
        return (mistura * lim + (1 - mistura) * x).astype(np.float32), True
    except Exception:  # noqa: BLE001
        return x, False


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
    # 1) trechos crus (com folga) e limpeza
    brutos, rel = [], []
    for i, v in enumerate(pecas):
        off = fontes.offset(v["fonte"])
        a = v["s0"] - off - FOLGA
        x = ler_audio(fontes.audio(v["fonte"]), a, (v["s1"] - v["s0"]) + 2 * FOLGA, cfg=cfg)
        lp = v.get("limpeza") or {}
        x, usou_ia = limpar_ia(x, lp.get("atenuacao_db", 15), lp.get("mistura", 0.8))
        brutos.append(x)
        rel.append({"id": v["id"], "fonte": v["fonte"], "limpeza_ia": usou_ia})
        if progresso:
            progresso(0.5 * (i + 1) / len(pecas), f"Voz: peça {i + 1}/{len(pecas)}")
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
