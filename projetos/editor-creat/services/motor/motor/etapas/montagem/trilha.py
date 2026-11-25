"""TRILHA e SFX.

Trilha (V1/py/trilha2.py + corte por meios-compassos do V2/py/mix.py, como biblioteca):
- `emendas` [[t_filme, s_de, s_ate, xf], ...]: cada trecho da trilha entra em t_filme com crossfade de igual potência `xf` s;
  é assim que o acorde final cai na logo (trecho do fim da música colado no ponto certo) — curva emocional de verdade, não laço;
- sem emendas e com `bpm`: a música toca do começo e, se for mais curta que o filme, emenda no início de um compasso
  (na batida, fase `fase`) com crossfade curto; se for mais longa, sai com fade no fim do filme;
- `chave` nula = filme sem música (só voz, SFX e ambiente);
- `faixas` (M4, opcional): duas ou três músicas em sequência. Cada faixa entra em `entra_em` (s do filme) tocando a partir
  de `s_de` (s da música), cruza com a anterior por `xf` s em igual potência (seno/cosseno: a soma não afunda nem incha no
  meio) e corre `razao` s de música por s de filme (esticamento fatiado na batida, que mantém o tom; atempo só sem bpm). Com faixas,
  `emendas` não é usado; o resolvedor põe a troca no 1 do compasso das duas (musica.ponto_de_troca).

SFX: procura `<som>.wav` em MK_SOM/sfx/ (biblioteca licenciada, fora do git). Sem a biblioteca, sintetiza uma versão
determinística do som pelo nome (whoosh, hit/boom, pop, tick, riser, glitch, swish, stamp…) para o motor nunca parar.
"""
from __future__ import annotations

import pathlib

import numpy as np

from motor.etapas.montagem.comum import SR


def _st(x: np.ndarray) -> np.ndarray:
    return np.stack([x, x], 1) if x.ndim == 1 else x[:, :2]


def ler_trilha(arq: pathlib.Path) -> np.ndarray:
    import soundfile as sf
    x, sr = sf.read(str(arq), dtype="float32", always_2d=True)
    x = _st(x if x.shape[1] > 1 else x[:, 0])
    if sr != SR:
        from scipy.signal import resample_poly
        from math import gcd
        g = gcd(sr, SR)
        x = resample_poly(x, SR // g, sr // g, axis=0).astype(np.float32)
    return x


def esticar_na_batida(m: np.ndarray, razao: float, bpm: float, fase: float = 0.0, xf_s: float = 0.006) -> np.ndarray:
    """Esticamento fatiado na batida (como os aparelhos de DJ): cada batida da fonte começa EXATAMENTE onde a grade do
    filme manda (batida k em (fase + k*b)/razao) e o tom não muda, porque nada é reamostrado. Acelerando, o fim de cada
    batida (a cauda, a parte mais baixa) perde ~razao-1 do tamanho; desacelerando, a cauda se repete. As fatias se juntam
    com 6 ms de cruzamento. O atempo do ffmpeg mantém o tom mas deixa a batida derivar até ~15 ms (medido), e duas
    músicas cruzando com 15 ms de diferença já soam como "flam"."""
    b = 60.0 / bpm
    n_src = len(m)
    X = max(1, int(round(xf_s * SR)))
    k0 = -int(np.ceil(max(fase, 0.0) / b))
    k1 = int(np.ceil((n_src / SR - fase) / b)) + 1
    n_out = int(round(n_src / SR / razao * SR))
    out = np.zeros((n_out + 4 * X, m.shape[1]), np.float32)
    sobe = (np.sin(np.linspace(0, np.pi / 2, X)) ** 2).astype(np.float32)[:, None]
    for k in range(k0, k1):
        s_k = (fase + k * b) * SR
        d_k = int(round(s_k / razao))
        d_n = int(round((fase + (k + 1) * b) * SR / razao))
        if d_n <= 0 or d_k >= n_out:
            continue
        # a fatia cobre [d_k - X, d_n) no filme: o cruzamento fica ANTES do ataque, que sai inteiro (sem amaciar o transiente)
        L = d_n - d_k + X
        a = int(round(s_k)) - X
        disp = int(round((fase + (k + 1) * b) * SR)) - a          # até o ataque da próxima batida
        if L <= disp:
            fatia = _trecho(m, a, L)
        else:                                                 # desacelerando: repete a cauda, emendada em cruzamento
            falta = L - disp
            corpo = _trecho(m, a, disp)
            rep = _trecho(m, a + disp - falta - X, falta + X)
            corpo[-X:] *= sobe[::-1]
            rep[:X] *= sobe
            fatia = np.concatenate([corpo[:-X], corpo[-X:] + rep[:X], rep[X:]])[:L]
        if k > k0:
            fatia[:X] *= sobe
        fatia[-X:] *= sobe[::-1]
        i0 = d_k - X
        if i0 < 0:
            fatia, i0 = fatia[-i0:], 0
        n = min(len(fatia), len(out) - i0)
        if n > 0:
            out[i0:i0 + n] += fatia[:n]
    return out[:n_out]


def _trecho(m: np.ndarray, a: int, n: int) -> np.ndarray:
    """m[a:a+n] com zeros fora do arquivo (antes do começo ou depois do fim)."""
    seg = np.zeros((n, m.shape[1]), np.float32)
    lo, hi = max(0, a), min(len(m), a + n)
    if hi > lo:
        seg[lo - a:hi - a] = m[lo:hi]
    return seg


def ler_esticada(arq: pathlib.Path, razao: float, bpm: float | None = None, fase: float = 0.0) -> np.ndarray:
    """Música no tempo do filme: `razao` s de música por s de filme, sem mudar o tom (reamostrar mudaria o tom em até um
    semitom nos 6%, e é o tom que casa as duas músicas). Com bpm conhecido: fatiado na batida (exato na grade); sem bpm:
    atempo do ffmpeg (WSOLA)."""
    if abs(razao - 1.0) < 1e-4:
        return ler_trilha(arq)
    if bpm:
        return esticar_na_batida(ler_trilha(arq), razao, float(bpm), float(fase or 0.0))
    import subprocess
    r = subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(arq), "-af", f"atempo={razao:.6f}", "-ar", str(SR), "-ac", "2",
                        "-f", "f32le", "-"], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"esticar a trilha falhou: {r.stderr.decode(errors='replace')[-300:]}")
    return np.frombuffer(r.stdout, np.float32).reshape(-1, 2).copy()


JANELA_NIVEL_S = 4.0          # nível casado na troca: 4 s de A sozinha antes do cruzamento contra 4 s de B sozinha depois
FALTA_AVISO_S = 0.5           # música que acaba antes do filme por mais que isso vira aviso (silêncio no fim)


def _rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(x.astype(np.float64) ** 2))) if len(x) else 0.0


def montar_faixas(edl: dict, arquivos: dict) -> tuple[np.ndarray, dict]:
    """Duas ou mais músicas em sequência (trilha.faixas). A anterior sai com cosseno enquanto a próxima entra com seno no
    mesmo intervalo: igual potência, sem buraco no meio.

    Nível: cada faixa é igualada à anterior NA TROCA (4 s de A sozinha antes do cruzamento contra 4 s de B sozinha
    depois), até ±6 dB, e esse ganho vale para a faixa inteira. Medir o trecho inteiro de cada uma (como na 1a versão)
    puxava o refrão de B para baixo quando A só tocava a intro calma: o volume caía bem em cima da troca, justamente onde
    musica.ponto_de_troca casou a energia (revisão M4, 25/11). Faixa que acaba antes do filme vira aviso em rel.avisos."""
    N = int(round(edl["duracao"] * SR))
    out = np.zeros((N, 2), np.float32)
    fx = (edl.get("trilha") or {}).get("faixas") or []
    rel = {"musica": True, "faixas": [], "emendas": 0, "avisos": []}
    J = int(round(JANELA_NIVEL_S * SR))
    ant = None                                         # (seg já com ganho, d0 no filme) da faixa anterior, antes dos fades
    for k, f in enumerate(fx):
        razao = float(f.get("razao") or 1.0)
        m = ler_esticada(pathlib.Path(arquivos[f["chave"]]), razao, f.get("bpm"), float(f.get("fase") or 0.0))
        d0 = int(round(float(f["entra_em"]) * SR))
        fim = int(round((float(fx[k + 1]["entra_em"]) + float(fx[k + 1].get("xf") or 0.0)) * SR)) if k + 1 < len(fx) else N
        fim = min(fim, N)
        n = fim - d0
        if n <= 0:
            continue
        a = int(round(float(f.get("s_de") or 0.0) / razao * SR))
        seg = np.zeros((n, 2), np.float32)
        lo = max(0, a)
        pega = m[lo:lo + n - (lo - a)]
        seg[lo - a: lo - a + len(pega)] = pega
        falta = round((n - (lo - a) - len(pega)) / SR, 2)
        if falta > FALTA_AVISO_S:
            rel["avisos"].append(f"a música {f.get('id') or f['chave']} acaba {falta:.1f} s antes do trecho dela: silêncio no fim")
        xi = int(round(float(f.get("xf") or 0.0) * SR)) if k > 0 else (int(0.03 * SR) if a > 0 else 0)
        xi = min(xi, n)
        g = 1.0
        if ant is not None:
            sa, da = ant
            a0, a1 = max(da, d0 - J), d0                        # A sozinha, antes do cruzamento (posições do filme)
            na = sa[a0 - da:a1 - da] if a1 > a0 else sa[:0]
            nb = seg[xi:xi + J]                                  # B sozinha, depois do cruzamento
            ra, rb = _rms(na), _rms(nb)
            if rb > 1e-5 and ra > 1e-5:
                g = float(np.clip(ra / rb, 10 ** (-6 / 20), 10 ** (6 / 20)))
        seg *= g
        ant = (seg.copy(), d0)
        if xi > 0:
            seg[:xi] *= np.sin(np.linspace(0, np.pi / 2, xi, dtype=np.float64)).astype(np.float32)[:, None]
        if k + 1 < len(fx):
            xo = min(n, int(round(float(fx[k + 1].get("xf") or 0.0) * SR)))
            if xo > 0:
                seg[n - xo:] *= np.cos(np.linspace(0, np.pi / 2, xo, dtype=np.float64)).astype(np.float32)[:, None]
        if d0 < 0:
            seg, d0 = seg[-d0:], 0
        out[d0:d0 + len(seg)] += seg[: N - d0]
        rel["faixas"].append({"chave": f["chave"], "entra_em": f["entra_em"], "razao": razao, "ganho_db": round(20 * np.log10(g), 2),
                              **({"faltou_s": falta} if falta > 0.01 else {})})
    return out, rel


def montar_trilha(edl: dict, arq: pathlib.Path | None, arquivos: dict | None = None) -> tuple[np.ndarray, dict]:
    N = int(round(edl["duracao"] * SR))
    out = np.zeros((N, 2), np.float32)
    tr = edl.get("trilha", {}) or {}
    if tr.get("faixas") and arquivos:
        out, rel = montar_faixas(edl, arquivos)
        return _saida(out, tr, N), rel
    if arq is None:
        return out, {"musica": False}
    m = ler_trilha(arq)
    emendas = tr.get("emendas") or []
    rel = {"musica": True, "dur_trilha": round(len(m) / SR, 2), "emendas": len(emendas)}
    if emendas:
        for k, (tf, sa, sb, xf) in enumerate(emendas):
            a, b = int(round(sa * SR)), min(len(m), int(round(sb * SR)))
            seg = m[max(0, a):b].copy()
            if len(seg) == 0:
                continue
            nx = max(1, int(round(max(xf, 0.005) * SR)))
            d0 = int(round(tf * SR))
            if k > 0:                                   # entra no crossfade (igual potência), recuando nx
                pre_a = max(0, a - nx)
                seg = np.concatenate([m[pre_a:a], seg])
                d0 -= (a - pre_a)
                w = np.sin(np.linspace(0, np.pi / 2, a - pre_a)) ** 2
                seg[: a - pre_a] *= w[:, None]
            elif a > 0:                                 # música que começa do meio (auge na virada): entrada suave, sem estalo
                n0 = min(len(seg), int(round(max(xf, 0.03) * SR)))
                seg[:n0] *= (np.sin(np.linspace(0, np.pi / 2, n0)) ** 2)[:, None]
            if k < len(emendas) - 1:                    # sai no crossfade
                prox = int(round(emendas[k + 1][0] * SR))
                fim = prox - d0
                if fim > 0:
                    seg = seg[:fim]
                    z = min(nx, len(seg))
                    seg[-z:] *= (np.cos(np.linspace(0, np.pi / 2, z)) ** 2)[:, None]
            if d0 < 0:
                seg, d0 = seg[-d0:], 0
            n = min(len(seg), N - d0)
            if n > 0:
                out[d0:d0 + n] += seg[:n]
    else:
        pos, fonte = 0, 0
        bpm, fase = tr.get("bpm"), float(tr.get("fase", 0) or 0)
        while pos < N and len(m) > 0:
            n = min(len(m) - fonte, N - pos)
            if n <= int(0.06 * SR):
                break
            seg = m[fonte:fonte + n].copy()
            if pos > 0:
                z = min(int(0.03 * SR), len(seg))
                seg[:z] *= (np.sin(np.linspace(0, np.pi / 2, z)) ** 2)[:, None]
            out[pos:pos + n] += seg
            pos += n
            if pos < N:                                 # emenda na batida: volta para o início de um compasso
                fonte = int(round(fase * SR)) if bpm else 0
                pos -= int(0.03 * SR)
        rel["laco"] = len(m) < N
    return _saida(out, tr, N), rel


def _saida(out: np.ndarray, tr: dict, N: int) -> np.ndarray:
    fim = int(1.4 * SR)                                # sem acorde final marcado, a música sai devagar (0,5 s soava interrompida)
    if N > fim and np.abs(out[-fim:]).max() > 0 and not tr.get("acorde_final"):
        out[-fim:] *= (np.linspace(1, 0, fim) ** 1.5)[:, None]
    return out


# ---------------------------------------------------------------- SFX
def _ruido(n: int, seed: int) -> np.ndarray:
    return np.random.default_rng(seed).standard_normal(n).astype(np.float32)


def sintetizar(nome: str) -> np.ndarray:
    """Som de reserva determinístico pelo nome (só quando a biblioteca MK_SOM não está nesta máquina)."""
    from scipy.signal import butter, sosfilt
    n0 = nome.lower()
    seed = sum(map(ord, n0))
    if any(k in n0 for k in ("hit", "boom", "impacto", "stamp", "clang", "grave")):
        n = int(0.9 * SR)
        t = np.arange(n) / SR
        f = 48 + 60 * np.exp(-t * 18)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5.5)
        x += 0.35 * sosfilt(butter(2, 2500, "lp", fs=SR, output="sos"), _ruido(n, seed)) * np.exp(-t * 30)
    elif any(k in n0 for k in ("riser", "reverse")):
        dur = 4.0 if "4" in n0 else 2.0
        n = int(dur * SR)
        t = np.arange(n) / SR
        x = sosfilt(butter(2, [400, 6000], "bp", fs=SR, output="sos"), _ruido(n, seed)) * (t / dur) ** 2
    elif any(k in n0 for k in ("pop", "tick", "ui")):
        n = int(0.08 * SR)
        t = np.arange(n) / SR
        x = np.sin(2 * np.pi * (1800 if "tick" in n0 else 900) * t) * np.exp(-t * 70)
    elif "glitch" in n0:
        n = int(0.35 * SR)
        x = np.sign(np.sin(2 * np.pi * 220 * np.arange(n) / SR)) * (np.random.default_rng(seed).random(n) > 0.6) * 0.5
    elif "heart" in n0:
        n = int(1.2 * SR)
        t = np.arange(n) / SR
        x = sum(np.sin(2 * np.pi * 55 * (t - a)) * np.exp(-np.clip(t - a, 0, None) * 14) * (t >= a) for a in (0.0, 0.28))
    else:                                               # whoosh / swish: ruído com varredura de banda
        dur = 1.1 if "longo" in n0 else 0.45
        n = int(dur * SR)
        t = np.arange(n) / SR
        env = np.sin(np.pi * t / dur) ** 2
        x = np.zeros(n, np.float32)
        r = _ruido(n, seed)
        for k, fc in enumerate(np.linspace(500, 5000, 8)):
            a, b = k * n // 8, (k + 1) * n // 8
            x[a:b] = sosfilt(butter(2, [fc * 0.6, fc * 1.4], "bp", fs=SR, output="sos"), r)[a:b]
        x = x * env
    x = np.asarray(x, np.float32)
    x /= max(1e-6, float(np.abs(x).max()))
    return (x * 10 ** (-1 / 20)).astype(np.float32)


_SFX: dict = {}


def _kit_sfx(nome: str) -> pathlib.Path | None:
    """Efeito da casa embutido no kit (gravação real, licença em packages/kit/assets/sfx/sfx.json)."""
    from motor import config
    p = config.KIT / "assets" / "sfx" / f"{nome}.flac"
    return p if p.exists() else None


def som(nome: str, biblioteca: str | None) -> tuple[np.ndarray, str]:
    """Ordem: efeito registrado pelo dono na biblioteca (ou MK_SOM) -> efeito da casa no kit -> sintético de reserva."""
    cands = [p for p in ((pathlib.Path(biblioteca) / "sfx" / f"{nome}.wav", pathlib.Path(biblioteca) / f"{nome}.wav") if biblioteca else ())
             if p.exists()]
    kit = None if cands else _kit_sfx(nome)
    if kit is not None:
        cands = [kit]
    chave = (nome, str(cands[0]), cands[0].stat().st_mtime) if cands else (nome, None, None)   # som novo na biblioteca vale sem reiniciar
    if chave in _SFX:
        return _SFX[chave]
    origem = "sintetico"
    x = None
    if cands:
        for p in cands[:1]:
            if p.exists():
                import soundfile as sf
                x, sr = sf.read(str(p), dtype="float32", always_2d=True)
                if sr != SR:
                    from scipy.signal import resample_poly
                    x = resample_poly(x, SR, sr, axis=0).astype(np.float32)
                x = _st(x if x.shape[1] > 1 else x[:, 0])
                origem = "kit" if kit is not None else "biblioteca"
                break
    if x is None:
        x = _st(sintetizar(nome))
    _SFX[chave] = (x, origem)
    return _SFX[chave]


def montar_sfx(edl: dict, biblioteca: str | None) -> tuple[np.ndarray, dict]:
    N = int(round(edl["duracao"] * SR))
    fx = np.zeros((N, 2), np.float32)
    origens = {}
    fps = float(edl.get("formato", {}).get("fps", 30))
    for c in edl.get("sfx", []) or []:
        x, origem = som(c["som"], biblioteca)
        origens[c["som"]] = origem
        pan = float(c.get("pan", 0) or 0)
        g = 10 ** ((float(c.get("g", -8)) - 1.0) / 20)
        x = x * g * np.array([np.sqrt(0.5 - pan / 2) * 1.414, np.sqrt(0.5 + pan / 2) * 1.414], np.float32)
        i = int(round(max(0.0, c["t"] + 1 / fps) * SR))   # 1 quadro depois: o som casa com o quadro do corte
        n = min(len(x), N - i)
        if n > 0:
            fx[i:i + n] += x[:n]
    return fx, {"sfx": len(edl.get("sfx", []) or []), "origens": origens}
