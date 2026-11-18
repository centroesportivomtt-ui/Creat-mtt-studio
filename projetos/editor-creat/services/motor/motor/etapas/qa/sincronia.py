"""sincronia: áudio e vídeo do mesmo tamanho (±1 quadro) e o áudio do final alinhado ao mix (correlação do envelope)."""
import numpy as np

ID, BLOQUEIA = "sincronia", True


def _env(x, sr, passo=0.005):
    h = int(sr * passo)
    n = len(x) // h
    return np.sqrt(np.mean(x[: n * h].reshape(n, h) ** 2, 1))


def checar(c):
    v, a = c.stream("video") or {}, c.stream("audio") or {}
    dv, da = float(v.get("duration") or 0), float(a.get("duration") or 0)
    tol = 1.0 / c.FPS + 0.03                    # AAC tem preenchimento de ~21 ms
    det = [f"vídeo {dv:.3f} s, áudio {da:.3f} s"]
    ok = abs(dv - da) <= tol
    desvio_ms = None
    if c.mix is not None and c.mix.exists():
        import soundfile as sf
        m, sr = sf.read(str(c.mix), dtype="float32", always_2d=True, frames=sf.info(str(c.mix)).samplerate * 20)
        f = c.audio_final()[: len(m)]
        e1, e2 = _env(m.mean(1), sr), _env(f.mean(1), sr)
        n = min(len(e1), len(e2))
        if n > 50 and e1[:n].std() > 0 and e2[:n].std() > 0:
            a1, a2 = e1[:n] - e1[:n].mean(), e2[:n] - e2[:n].mean()
            lags = range(-20, 21)                  # ±100 ms
            cc = [float(np.dot(a1[max(0, -L):n - max(0, L)], a2[max(0, L):n - max(0, -L)])) for L in lags]
            desvio_ms = list(lags)[int(np.argmax(cc))] * 5
            ok = ok and abs(desvio_ms) <= 1000 / c.FPS
            det.append(f"áudio do final x mix: {desvio_ms} ms")
    return {"ok": ok, "valor": {"video_s": dv, "audio_s": da, "desvio_ms": desvio_ms}, "detalhe": "; ".join(det)}
