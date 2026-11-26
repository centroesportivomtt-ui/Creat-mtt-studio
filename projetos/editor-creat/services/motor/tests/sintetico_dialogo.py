"""Diálogo sintético da onda 4 (item 4, D46/D47): duas pessoas, duas câmeras, sem material de cliente e sem modelo.

O caso real (26/11, anúncio de diálogo do Super Kal) tinha duas pessoas conversando e dois iPhones gravando juntos. Aqui:
- pessoa A (F0 ~ 125 Hz) e pessoa B (F0 ~ 235 Hz) falam em turnos, com sílabas de duração e altura SORTEADAS (fala de verdade
  não é periódica; sílaba periódica daria picos iguais na correlação e a sincronia ficaria ambígua, como música em laço);
- a câmera A ouve A perto e B longe; a câmera B ouve B perto e A longe, com ruído e equalização próprios, e está ATRASADA
  `ATRASO_B` s: um som no instante t do arquivo da câmera A aparece em t + ATRASO_B no arquivo da câmera B;
- `murmurio`: a equipe falando baixo (F0 ~ 150 Hz, outra altura) num trecho sem diálogo, para o lado negativo;
- cada câmera tem o seu `analise.json` (transcrição "fina" falsa, com as palavras de cada turno no relógio daquele arquivo)
  ao lado do áudio, onde a conferência procura (`fala_cortada._palavras_fonte`).

O mesmo material serve para "uma" e "varias": o lado negativo é o MESMO áudio com `edl.origem.vozes = "uma"`.
"""
from __future__ import annotations

import json
import pathlib

import numpy as np

SR = 16000
ATRASO_B = 3.217
DUR_A = 46.0

# turnos (início no relógio da câmera A, quem fala, texto); as palavras dividem o turno por igual (PASSO_PALAVRA)
FRASE = "vem pro super kal que a black é de verdade"
TURNOS = [
    (2.0, "A", "oi tudo bem hoje é dia de black friday no super kal"),   # 2,00-5,74
    (6.2, "B", "é verdade e o encarte está cheio de oferta boa"),        # 6,20-9,60 (na câmera A, B fica longe)
    (10.6, "A", FRASE),                                                  # 10,60-14,00
    (14.8, "B", FRASE),                                                  # 14,80-18,20 (a mesma frase, repetida de verdade)
    (19.0, "A", "e tem carne picanha cerveja e muito mais"),             # 19,00-21,72
    (23.4, "B", FRASE),                                                  # 23,40-26,80 (terceira vez)
    (27.0, "A", "olha só que preço bom"),                                # 27,00-28,70, e a equipe murmura de 30 a 33 s
    (34.0, "A", "e a picanha está barata"),                              # 34,00-35,70
    (35.7, "B", "corre que acaba hoje"),                                 # 35,70-37,06: B responde COLADA em A
    (38.5, "A", "aproveita essa oferta"),                                # 38,50-39,52
    (39.52, "A", "de black friday"),                                     # 39,52-40,54: A continua COLADA nela mesma
]
F0 = {"A": 125.0, "B": 235.0, "equipe": 150.0}
PASSO_PALAVRA = 0.34
B_LONGE_DB = -16.0              # na câmera A, a pessoa B fica longe do microfone
MURMURIO = (30.0, 3.0)          # (início no relógio da câmera A, duração): a equipe falando baixo, fora do diálogo
TEXTO_MURMURIO = "corta corta faz de novo agora"


PISO_CONSOANTE = 0.2   # fala corrida: entre duas sílabas do mesmo turno fica uma consoante (ruído sem tom, 20%); entre turnos, nada


def silabas(rng, dur: float, sr: int = SR) -> tuple[np.ndarray, np.ndarray]:
    """Envelope das sílabas (vogal, com tom) e das consoantes entre elas (sem tom): sílabas de 90 a 260 ms, consoantes de 20
    a 70 ms e força sorteadas (nada periódico)."""
    n = int(dur * sr)
    vogal = np.zeros(n, np.float32)
    consoante = np.full(n, PISO_CONSOANTE, np.float32)
    t = 0.0
    while t < dur:
        d = float(rng.uniform(0.09, 0.26))
        a = float(rng.uniform(0.55, 1.0))
        i, j = int(t * sr), min(n, int((t + d) * sr))
        if j > i:
            vogal[i:j] = a * np.sin(np.linspace(0, np.pi, j - i)) ** 0.6
            consoante[i:j] = 0.0
        t += d + float(rng.uniform(0.02, 0.07))
    return vogal, consoante


def voz(rng, dur: float, f0: float, sr: int = SR) -> np.ndarray:
    """Harmônicos de f0 (até 3,5 kHz) com a altura passeando ±6% nas sílabas e ruído agudo (consoante, sem tom) entre elas.
    Pico ~1; o turno começa e acaba em 20 ms (o vale entre duas pessoas coladas)."""
    from scipy.signal import butter, sosfilt
    t = np.arange(int(dur * sr)) / sr
    deriva = 1 + 0.06 * np.sin(2 * np.pi * float(rng.uniform(0.3, 0.8)) * t + float(rng.uniform(0, 6.28)))
    fase = 2 * np.pi * np.cumsum(f0 * deriva) / sr
    h = sum(np.sin(k * fase) / k for k in range(1, int(3500 // f0) + 1))
    vogal, consoante = silabas(rng, dur, sr)
    ru = sosfilt(butter(2, [2000, 6000], "bp", fs=sr, output="sos"), rng.standard_normal(len(t)))
    x = h / (np.abs(h).max() + 1e-9) * vogal + ru / (np.abs(ru).max() + 1e-9) * consoante
    r = int(0.02 * sr)
    x[:r] *= np.linspace(0, 1, r)
    x[-r:] *= np.linspace(1, 0, r)
    return x.astype(np.float32)


def palavras(texto: str, s0: float, passo: float = PASSO_PALAVRA, conf: float = 0.9) -> list[list]:
    out, t = [], s0
    for w in texto.split():
        out.append([round(t, 3), round(t + passo - 0.04, 3), w, conf])
        t += passo
    return out


def dur_turno(texto: str) -> float:
    return len(texto.split()) * PASSO_PALAVRA


def _eq(x: np.ndarray, lo: float, hi: float, sr: int = SR) -> np.ndarray:
    from scipy.signal import butter, sosfilt
    return sosfilt(butter(2, [lo, hi], "bp", fs=sr, output="sos"), x).astype(np.float32)


def cena(seed: int = 11, murmurio: bool = True, turnos=None) -> dict:
    """As faixas "secas" de cada pessoa no relógio da câmera A (DUR_A s): {"A", "B", "equipe", "turnos"}."""
    rng = np.random.default_rng(seed)
    n = int(DUR_A * SR)
    faixas = {k: np.zeros(n, np.float32) for k in ("A", "B", "equipe")}
    turnos = turnos or TURNOS
    for s0, quem, texto in turnos:
        v = voz(rng, dur_turno(texto), F0[quem])
        i = int(s0 * SR)
        faixas[quem][i:i + len(v)] += v[: n - i]
    if murmurio:
        v = voz(rng, MURMURIO[1], F0["equipe"])
        i = int(MURMURIO[0] * SR)
        faixas["equipe"][i:i + len(v)] += v
    faixas["turnos"] = turnos
    return faixas


def camera_a(c: dict, seed: int = 21) -> np.ndarray:
    """A perto (0,3), B longe (B_LONGE_DB), equipe longe (-26 dB); ruído de sala e EQ da câmera A."""
    rng = np.random.default_rng(seed)
    x = 0.3 * c["A"] + 0.3 * 10 ** (B_LONGE_DB / 20) * c["B"] + 0.3 * 10 ** (-26 / 20) * c["equipe"]
    x = _eq(x, 120, 6500) + 0.0015 * rng.standard_normal(len(x)).astype(np.float32)
    return x.astype(np.float32)


def camera_b(c: dict, atraso: float = ATRASO_B, seed: int = 37, extra_fim: float = 2.0) -> np.ndarray:
    """B perto, A longe (-10 dB), equipe (-30 dB), EQ e ruído diferentes, e ATRASADA `atraso` s (som em t no A = t + atraso no B)."""
    rng = np.random.default_rng(seed)
    seco = 0.28 * c["B"] + 0.28 * 10 ** (-10 / 20) * c["A"] + 0.28 * 10 ** (-30 / 20) * c["equipe"]
    seco = _eq(seco, 250, 4800)
    k = int(round(atraso * SR))
    x = np.concatenate([np.zeros(k, np.float32), seco, np.zeros(int(extra_fim * SR), np.float32)])
    x = x + 0.003 * rng.standard_normal(len(x)).astype(np.float32)
    return x.astype(np.float32)


def segmentos(turnos, desloc: float = 0.0, murmurio: bool = False) -> list[dict]:
    """Transcrição falsa (o "ouvido fino") no relógio do arquivo: cada turno vira um segmento com palavras (o murmúrio da
    equipe NÃO aparece: é o caso em que não há prova de que é fala do diálogo)."""
    segs = []
    for s0, quem, texto in turnos:
        p = palavras(texto, s0 + desloc)
        segs.append({"s": p[0][0], "e": p[-1][1], "texto": texto, "falante": None, "conf": 0.9, "palavras": p, "voz": quem})
    if murmurio:
        p = palavras(TEXTO_MURMURIO, MURMURIO[0] + desloc, conf=0.2)
        segs.append({"s": p[0][0], "e": p[-1][1], "texto": TEXTO_MURMURIO, "falante": None, "conf": 0.2, "palavras": p})
    return segs


def escrever(pasta: pathlib.Path, seed: int = 11, atraso: float = ATRASO_B, turnos=None) -> dict:
    """Grava as duas câmeras (cada uma na sua pasta, com o analise.json ao lado) e devolve o `edl.fontes` e os sinais:
    {"fontes", "xa", "xb", "turnos", "cena"}."""
    import soundfile as sf
    c = cena(seed, turnos=turnos)
    xa, xb = camera_a(c), camera_b(c, atraso)
    fontes = {}
    for fid, x, desloc in (("camA", xa, 0.0), ("camB", xb, atraso)):
        d = pathlib.Path(pasta) / fid
        d.mkdir(parents=True, exist_ok=True)
        sf.write(str(d / "audio.wav"), x, SR, subtype="PCM_16")
        (d / "analise.json").write_text(json.dumps({"transcricao": {"segmentos": segmentos(c["turnos"], desloc)}}), encoding="utf-8")
        fontes[fid] = {"chave": str(d / "nao_existe.mp4"), "audio": str(d / "audio.wav")}
    return {"fontes": fontes, "xa": xa, "xb": xb, "turnos": c["turnos"], "cena": c}


def musica_em_laco(dur: float = 30.0, laco: float = 2.0, seed: int = 5) -> np.ndarray:
    """Um compasso de 2 s repetido: o envelope é periódico, todo atraso múltiplo de 2 s "bate" igual (sincronia ambígua)."""
    rng = np.random.default_rng(seed)
    um = voz(rng, laco, 330.0) * 0.4
    return np.tile(um, int(np.ceil(dur / laco)))[: int(dur * SR)].astype(np.float32)
