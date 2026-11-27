"""MIX: voz (base) + trilha com ducking lento + SFX + som direto dos planos + tom de sala, master em -14 LUFS e pico real.

Reaproveita V2/py/mix.py (aprovado pelo dono em 17/11), como biblioteca:
- ducking pelo envelope da voz: ponte de 0,5 s sobre pausas curtas (sem bombear entre palavras), rampas assimétricas
  (desce `ducking.desce` s, sobe `ducking.sobe` s) e profundidade `ducking.db`;
- folga extra: onde a voz está fraca (fim de frase baixo), a cama desce mais, devagar, até a voz ficar >= 9 dB acima na
  banda da fala (250-4000 Hz);
- tom de sala SÓ do trecho `tom_sala` do EDL (o resolvedor escolhe trecho sem fala; o QA confere transcrevendo o stem
  'ambiente' — lição do laço "vai competir" de 17/11) + piso de ruído rosa a -66 dB para nunca haver silêncio digital;
- master: ganho para `master.lufs` (-14) e limitador de pico real (4x) com teto `master.tp` - 0,8 dB (o AAC sobe o pico);
- stems separados (voz, trilha, sfx, direto, ambiente) para o QA ouvir cada um;
- sons reais do banco (M6, opcional, `reais` = {"ambiente", "pontual"} de montagem/reais.py): ducking de -8 dB no ambiente e
  -4 dB no pontual com o MESMO envelope da voz, o ambiente segue a música (respiro +4 dB, drop -4 dB) e entra na folga extra
  junto com a cama; stem próprio `reais`. O som direto dos planos cobertos (> 50%) pelo ambiente real que ENTROU
  (`reais["ambiente_em"]`) desce 6 dB. Com reais=None a saída é idêntica à de antes.
"""
from __future__ import annotations

import pathlib

import numpy as np

from motor.etapas.montagem.comum import SR, Fontes, ler_audio


def picos4(x: np.ndarray) -> np.ndarray:
    """Pico real (4x) por amostra, em blocos."""
    from scipy.signal import resample_poly
    x2 = x if x.ndim == 2 else x[:, None]
    out = np.empty(len(x2), np.float32)
    B, P = SR * 8, 2048
    for i in range(0, len(x2), B):
        a = max(0, i - P)
        b = min(len(x2), i + B + P)
        up = resample_poly(x2[a:b].astype(np.float32), 4, 1, axis=0)
        pk = np.max(np.abs(up), 1)[: (b - a) * 4].reshape(-1, 4).max(1)
        n = min(B, len(x2) - i)
        out[i:i + n] = pk[i - a:i - a + n]
    return out


def true_peak_db(x: np.ndarray) -> float:
    return float(20 * np.log10(max(1e-9, float(picos4(x).max()))))


def limitar(x: np.ndarray, teto_db: float) -> np.ndarray:
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    pk = picos4(x)
    c = 10 ** (teto_db / 20)
    g = np.minimum(1, c / np.maximum(pk, 1e-9)).astype(np.float32)
    w = int(0.004 * SR)
    g = uniform_filter1d(minimum_filter1d(g, 2 * w + 1), 2 * w + 1)
    return x * (g[:, None] if x.ndim == 2 else g)


def _st(x: np.ndarray) -> np.ndarray:
    return np.stack([x, x], 1) if x.ndim == 1 else x


def tom_de_sala(edl: dict, fontes: Fontes, N: int, cfg=None) -> tuple[np.ndarray, dict]:
    from scipy.signal import butter, sosfilt
    rng = np.random.default_rng(71)
    piso = sosfilt(butter(2, [120, 3500], "bp", fs=SR, output="sos"), rng.standard_normal((N, 2)), axis=0).astype(np.float32)
    piso *= 10 ** (-66 / 20) / (np.sqrt(np.mean(piso ** 2)) + 1e-9)
    ts = edl.get("tom_sala")
    if not ts:
        return piso, {"tom_sala": None}
    off = fontes.offset(ts["fonte"])
    x = ler_audio(fontes.audio(ts["fonte"]), ts["s0"] - off, ts["s1"] - ts["s0"], cfg=cfg)
    if len(x) < int(0.3 * SR) or float(np.abs(x).max()) < 1e-6:
        return piso, {"tom_sala": "vazio"}
    if ts.get("difuso"):
        # Ambiente com gente falando ao fundo (supermercado, evento): mantém o TIMBRE do lugar (espectro médio do trecho)
        # e joga fora a fase, então nenhuma palavra fica inteligível e o nível é constante (sem laço, sem bombear).
        from scipy.signal import welch
        f, pxx = welch(x, fs=SR, nperseg=4096)
        n = 1 << int(np.ceil(np.log2(N + 1)))
        fr = np.fft.rfftfreq(n, 1 / SR)
        mag = np.sqrt(np.interp(fr, f, pxx))
        out = np.zeros((N, 2), np.float32)
        for c in range(2):                      # dois canais com fases diferentes = largura estéreo natural
            fase = rng.uniform(0, 2 * np.pi, len(fr))
            out[:, c] = np.fft.irfft(mag * np.exp(1j * fase), n)[:N]
        alvo = 10 ** (float(ts.get("db", -48)) / 20)
        out *= alvo / (np.sqrt(np.mean(out ** 2)) + 1e-9)
        return out + piso, {"tom_sala": [ts["fonte"], ts["s0"], ts["s1"]], "difuso": True}
    # laço com crossfade longo (sem degrau, sem bombear)
    xf = min(int(0.4 * SR), len(x) // 3)
    out = np.zeros(N + len(x), np.float32)
    pos = 0
    w = np.sin(np.linspace(0, np.pi / 2, xf)) ** 2
    while pos < N:
        seg = x.copy()
        if pos > 0:
            seg[:xf] *= w
            pos -= xf
        seg[-xf:] *= w[::-1]
        out[pos:pos + len(seg)] += seg
        pos += len(seg)
    out = out[:N]
    alvo = 10 ** (float(ts.get("db", -48)) / 20)
    out *= alvo / (np.sqrt(np.mean(out ** 2)) + 1e-9)
    return _st(out) + piso, {"tom_sala": [ts["fonte"], ts["s0"], ts["s1"]], "laco_s": round(len(x) / SR, 2)}


DIRETO_SOB_REAL_DB = 6.0


def sob_ambiente_real(p: dict, ambiente_em) -> bool:
    """O plano está mais da metade sob um ambiente real que entrou na pista?"""
    if not ambiente_em:
        return False
    dur = max(1e-6, float(p["t1"]) - float(p["t0"]))
    cob = sum(max(0.0, min(float(p["t1"]), float(b)) - max(float(p["t0"]), float(a))) for a, b in ambiente_em)
    return cob / dur > 0.5


def som_direto(edl: dict, fontes: Fontes, N: int, cfg=None, ambiente_em=None) -> np.ndarray:
    """Som do próprio plano como textura (V1 'nat'), no ganho pedido, com fades de 40 ms. Sob ambiente real que entrou
    (`ambiente_em`, M6), 6 dB abaixo: dois "lugares" ao mesmo tempo embolam."""
    out = np.zeros(N, np.float32)
    for p in edl.get("planos", []):
        g = p.get("som_direto_db")
        if g is None:
            continue
        if sob_ambiente_real(p, ambiente_em):
            g = float(g) - DIRETO_SOB_REAL_DB
        vel = float(p.get("vel", 1.0) or 1.0)
        dur = p["t1"] - p["t0"]
        try:
            x = ler_audio(fontes.audio(p["fonte"]), p["s0"] - fontes.offset(p["fonte"]), dur * vel, cfg=cfg)
        except Exception:  # noqa: BLE001 - fonte sem áudio
            continue
        if abs(vel - 1) > 1e-3:
            n = int(round(dur * SR))
            x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x).astype(np.float32)
        fd = min(int(0.04 * SR), len(x) // 2)
        x[:fd] *= np.linspace(0, 1, fd)
        x[-fd:] *= np.linspace(1, 0, fd)
        a = int(round(p["t0"] * SR))
        n = min(len(x), N - a)
        if n > 0:
            out[a:a + n] += x[:n] * 10 ** ((-23 + float(g)) / 20)
    return out


def mixar(edl: dict, voz: np.ndarray, trilha: np.ndarray, fx: np.ndarray, fontes: Fontes, saida: pathlib.Path, cfg=None,
          reais: dict | None = None) -> dict:
    import pyloudnorm as pyln
    import soundfile as sf
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    from scipy.signal import butter, sosfilt

    N = int(round(edl["duracao"] * SR))
    saida.mkdir(parents=True, exist_ok=True)
    tr = edl.get("trilha", {}) or {}
    duck = {"db": 10.0, "desce": 0.4, "sobe": 0.55, **(tr.get("ducking") or {})}
    meter = pyln.Meter(SR)

    # trilha no nível pedido (LUFS integrado da cama antes do ducking)
    if np.abs(trilha).max() > 0:
        lt = meter.integrated_loudness(trilha.astype(np.float64))
        if np.isfinite(lt):
            trilha = trilha * 10 ** ((float(tr.get("ganho_db", -14)) - lt) / 20)

    gmus = None
    if reais is not None:                                   # o ambiente real segue a música (envelope ANTES do ducking)
        from motor.etapas.montagem.reais import ganho_musica
        gmus = ganho_musica(trilha, N)[:, None]

    # ducking pelo envelope da voz (V2)
    h = int(0.01 * SR)
    e = np.sqrt(np.convolve(voz ** 2, np.ones(h) / h, "same")[::h] + 1e-12)
    fala = maximum_filter1d((e > 10 ** (-38 / 20)).astype(np.float32), int(0.50 / 0.01))
    t = np.arange(len(fala)) * 0.01
    g = np.zeros_like(fala)
    v = 0.0
    for i in range(len(fala)):
        v = min(fala[i], v + 0.01 / duck["desce"]) if fala[i] > v else max(fala[i], v - 0.01 / duck["sobe"])
        g[i] = v
    g = np.sin(g * np.pi / 2) ** 2
    tt = np.arange(N) / SR
    gm = np.interp(tt, t, 10 ** (-duck["db"] * g / 20)).astype(np.float32)[:, None]
    trilha = trilha * gm
    fx = fx * np.interp(tt, t, 10 ** (-4.0 * g / 20)).astype(np.float32)[:, None]
    rr = None
    if reais is not None:                                   # som real: -8 dB (ambiente) / -4 dB (pontual) sob a voz
        ra = reais["ambiente"][:N] * gmus * np.interp(tt, t, 10 ** (-8.0 * g / 20)).astype(np.float32)[:, None]
        rp = reais["pontual"][:N] * np.interp(tt, t, 10 ** (-4.0 * g / 20)).astype(np.float32)[:, None]
        rr = (ra + rp).astype(np.float32)

    # folga extra onde a voz está fraca: cama desce até a voz ficar >= 9 dB acima na banda da fala
    sosb = butter(2, [250, 4000], "bp", fs=SR, output="sos")
    vb = sosfilt(sosb, voz).astype(np.float32)
    cb = sosfilt(sosb, (trilha + fx + (rr if rr is not None else 0)).mean(1)).astype(np.float32)
    hw = int(0.2 * SR)
    nh = N // hw
    extra_max = 0.0
    if nh > 0:
        rv = np.sqrt(np.mean(vb[:nh * hw].reshape(nh, hw) ** 2, 1) + 1e-12)
        rc = np.sqrt(np.mean(cb[:nh * hw].reshape(nh, hw) ** 2, 1) + 1e-12)
        marg = 20 * np.log10(rv / rc)
        extra = np.where(rv > 10 ** (-52 / 20), np.clip(9.0 - marg, 0, 6.0), 0.0)
        extra = uniform_filter1d(maximum_filter1d(extra, 5), 4)
        ge = np.interp(tt, (np.arange(nh) + 0.5) * 0.2, 10 ** (-extra / 20)).astype(np.float32)[:, None]
        trilha, fx = trilha * ge, fx * ge
        if rr is not None:
            rr = rr * ge
        extra_max = float(extra.max())

    amb, rel_amb = tom_de_sala(edl, fontes, N, cfg)
    ambiente_em = (reais or {}).get("ambiente_em") if reais is not None else None
    direto = _st(som_direto(edl, fontes, N, cfg, ambiente_em))
    vz = _st(voz)
    mix = (vz + trilha + fx + amb + direto).astype(np.float32)
    if rr is not None:
        mix = (mix + rr).astype(np.float32)

    master = {"lufs": -14.0, "tp": -1.0, **(edl.get("master") or {})}
    teto = float(master["tp"]) - 0.8
    gt = 1.0
    for _ in range(5):
        lf = meter.integrated_loudness(mix.astype(np.float64))
        if not np.isfinite(lf):
            break
        k = 10 ** ((float(master["lufs"]) - lf) / 20)
        gt *= k
        mix = limitar(mix * k, teto)
    fd = int(0.3 * SR)
    if N > fd:
        mix[-fd:] *= (np.linspace(1, 0, fd) ** 1.5)[:, None]
    sf.write(str(saida / "mix.wav"), mix, SR, subtype="PCM_24")
    stems = {}
    for nome, x in (("voz", vz), ("trilha", trilha), ("sfx", fx), ("direto", direto), ("ambiente", amb)) + ((("reais", rr),) if rr is not None else ()):
        p = saida / f"stem_{nome}.flac"
        sf.write(str(p), np.clip(x * gt, -1, 1).astype(np.float32), SR, subtype="PCM_24")
        stems[nome] = str(p)
    fm = np.interp(tt, t, fala) > 0.5
    margem = None
    if fm.any():                                            # margem na banda da fala (o grave do bumbo não mascara a voz)
        rv_ = np.sqrt(np.mean(sosfilt(sosb, voz)[fm] ** 2))
        rt_ = np.sqrt(np.mean(sosfilt(sosb, (trilha + fx + amb + (rr if rr is not None else 0)).mean(1))[fm] ** 2)) + 1e-12
        margem = round(float(20 * np.log10(rv_ / rt_)), 1)
    return {"mix": str(saida / "mix.wav"), "stems": stems, "lufs": round(float(meter.integrated_loudness(mix.astype(np.float64))), 2),
            "true_peak_db": round(true_peak_db(mix), 2), "ganho_total_db": round(20 * np.log10(gt), 2), "voz_sobre_cama_db": margem,
            "folga_extra_max_db": round(extra_max, 1), **rel_amb,
            **({"direto_sob_real": [p.get("id") for p in edl.get("planos", []) if p.get("som_direto_db") is not None
                                    and sob_ambiente_real(p, ambiente_em)]} if reais is not None else {})}
