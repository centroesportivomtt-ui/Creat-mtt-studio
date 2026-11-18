"""Material sintético da frente C (sem material de cliente no git): fontes 4K testsrc2, trilha em batida, tom de sala,
logo de 300 px e o EDL de 10 s do aceite. Se o clipe real 0948_57 existir no scratchpad, a VOZ vem dele (fala de verdade,
para o QA conferir legenda x fala e para o teste negativo do tom de sala com voz); sem ele, a voz é um tom sintético.
"""
from __future__ import annotations

import json
import pathlib
import subprocess

import numpy as np

from motor import config

SCRATCH = pathlib.Path("/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/drako")
CLIPE_REAL = SCRATCH / "seg" / "0948_57_0.mov"
TRS_REAL = SCRATCH / "trs" / "0948_57.json"
SR = 48000


def _ff(args, nice=True):
    cmd = (["nice", "-n", "5"] if nice else []) + ["ffmpeg", "-nostdin", "-v", "error", "-y", *args]
    subprocess.run(cmd, check=True)


def gerar_fontes(d: pathlib.Path) -> dict:
    """Gera (uma vez) as fontes do aceite em d. Devolve {nome: caminho}."""
    import soundfile as sf
    d.mkdir(parents=True, exist_ok=True)
    out = {}
    a = d / "sint_retrato_4k.mp4"          # 2160x3840 (retrato), com movimento de câmera tremido
    if not a.exists():
        _ff(["-f", "lavfi", "-i", "testsrc2=s=2200x3880:r=30:d=7", "-f", "lavfi", "-i", "sine=f=220:d=7:sample_rate=48000",
             "-vf", "crop=2160:3840:20+14*sin(n*1.7):20+18*cos(n*1.3)", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
             "-pix_fmt", "yuv420p", "-threads", "2", "-c:a", "aac", "-shortest", str(a)])
    out["retrato"] = a
    b = d / "sint_paisagem_4k.mp4"         # 3840x2160 (paisagem): o reenquadre 9:16 sai do meio
    if not b.exists():
        _ff(["-f", "lavfi", "-i", "testsrc2=s=3840x2160:r=30:d=5", "-vf", "hue=h=140", "-c:v", "libx264", "-preset", "ultrafast",
             "-crf", "28", "-pix_fmt", "yuv420p", "-threads", "2", str(b)])
    out["paisagem"] = b
    t = d / "trilha_batida.wav"            # 104 bpm: bumbo, chimbal e acorde (curva com drop em 6 s)
    if not t.exists():
        dur, bpm = 14.0, 104.0
        n = int(dur * SR)
        tt = np.arange(n) / SR
        x = np.zeros(n)
        beat = 60 / bpm
        for k in range(int(dur / beat)):
            i = int(k * beat * SR)
            m = min(n - i, int(0.5 * SR))
            tl = np.arange(m) / SR
            x[i:i + m] += 0.9 * np.sin(2 * np.pi * (50 + 90 * np.exp(-tl * 30)) * tl) * np.exp(-tl * 9)
            j = int((k + 0.5) * beat * SR)
            if j < n:
                mm = min(n - j, int(0.05 * SR))
                x[j:j + mm] += 0.15 * np.random.default_rng(k).standard_normal(mm) * np.exp(-np.arange(mm) / SR * 80)
        acorde = sum(np.sin(2 * np.pi * f * tt) for f in (220.0, 277.18, 329.63)) / 3
        x += 0.25 * acorde * np.clip((tt - 1.0) / 2.0, 0, 1) * (1 + 0.6 * (tt > 6.0))
        x = x / np.abs(x).max() * 0.8
        sf.write(str(t), np.stack([x, x], 1).astype(np.float32), SR, subtype="PCM_16")
    out["trilha"] = t
    s = d / "tom_sala.wav"                 # tom de sala sem voz (ruído marrom + zumbido de ar)
    if not s.exists():
        n = int(8 * SR)
        r = np.cumsum(np.random.default_rng(3).standard_normal(n))
        r -= np.convolve(r, np.ones(4800) / 4800, "same")
        r = r / np.abs(r).max() * 0.05 + 0.004 * np.sin(2 * np.pi * 120 * np.arange(n) / SR)
        sf.write(str(s), r.astype(np.float32), SR, subtype="PCM_16")
    out["sala"] = s
    v = d / "voz_tom.wav"                  # voz de reserva (sem o clipe real): sílabas tonais
    if not v.exists():
        n = int(10 * SR)
        tt = np.arange(n) / SR
        env = (np.sin(2 * np.pi * 4.0 * tt) > 0.2) * ((tt % 3.0) < 2.4)
        x = 0.3 * env * (np.sin(2 * np.pi * 180 * tt) + 0.5 * np.sin(2 * np.pi * 720 * tt) + 0.3 * np.sin(2 * np.pi * 1440 * tt))
        sf.write(str(v), x.astype(np.float32), SR, subtype="PCM_16")
    out["voz_tom"] = v
    lg = d / "logo_300px.png"
    if not lg.exists():
        from PIL import Image
        im = Image.open(config.KIT / "assets" / "marca" / "logo_creatMTT_claro.png")
        im.resize((300, max(1, round(im.height * 300 / im.width))), Image.LANCZOS).save(lg)
    out["logo300"] = lg
    return out


def tem_real() -> bool:
    return CLIPE_REAL.exists() and TRS_REAL.exists()


def _palavras_reais(a: float, b: float, t0: float) -> list:
    tr = json.loads(TRS_REAL.read_text())
    out = []
    for s in tr["segs"]:
        for w in s["w"]:
            if w[0] >= a - 0.01 and w[1] <= b + 0.01 and w[3] >= 0.5:
                out.append([round(t0 + w[0] - a, 3), round(t0 + w[1] - a, 3), w[2].strip(), 1 if w[2].strip() == "competir" else 0])
    return out


def edl_sintetico(f: dict, *, projeto: str = "p_aceite_c", tom_com_voz: bool = False, logo_pequena: bool = False) -> dict:
    real = tem_real()
    logo = str(f["logo300"]) if logo_pequena else str(config.KIT / "assets" / "marca" / "logo_creatMTT_claro.png")
    fontes = {"a001": {"chave": str(f["retrato"]), "offset": 0, "rotacao": 0, "fps": 30},
              "a002": {"chave": str(f["paisagem"]), "offset": 0, "rotacao": 0, "fps": 30},
              "s001": {"chave": str(f["sala"]), "offset": 0}}
    if real:
        fontes["r001"] = {"chave": str(CLIPE_REAL), "offset": 0, "rotacao": -90}
        voz = [{"id": "V1", "bloco": "B1", "fala": "F01.1", "fonte": "r001", "s0": 0.0, "s1": 3.04, "t0": 0.3, "t1": 3.34, "vel": 1.0,
                "texto": "pessoal que vai competir quero todo mundo"},
               {"id": "V2", "bloco": "B2", "fala": "F01.2", "fonte": "r001", "s0": 6.70, "s1": 8.28, "t0": 4.0, "t1": 5.58, "vel": 1.0,
                "texto": "aqui na frente por favor"}]
        palavras = _palavras_reais(0.0, 3.04, 0.3) + _palavras_reais(6.70, 8.28, 4.0)
    else:
        fontes["v001"] = {"chave": str(f["voz_tom"]), "offset": 0}
        voz = [{"id": "V1", "bloco": "B1", "fonte": "v001", "s0": 0.0, "s1": 2.4, "t0": 0.3, "t1": 2.7, "vel": 1.0, "texto": None},
               {"id": "V2", "bloco": "B2", "fonte": "v001", "s0": 3.0, "s1": 5.0, "t0": 4.0, "t1": 6.0, "vel": 1.0, "texto": None}]
        palavras = [[0.3, 0.8, "voz", 0], [0.8, 1.4, "de", 0], [1.4, 2.4, "teste", 1]]
    edl = {
        "versao": "1", "projeto": projeto, "origem": {"cerebro": "sintetico", "aceite": "c"},
        "formato": {"w": 1080, "h": 1920, "fps": 30}, "duracao": 10.0, "vel_fala": 1.0,
        "blocos": [{"id": "B1", "funcao": "gancho", "intensidade": 4, "t0": 0.0, "t1": 3.0},
                   {"id": "B2", "funcao": "convite", "intensidade": 5, "t0": 3.0, "t1": 10.0}],
        "fontes": fontes, "voz": voz,
        "planos": [
            {"id": "P1", "bloco": "B1", "t0": 0.0, "t1": 3.0, "fonte": "a001", "s0": 0.5, "vel": 1.0,
             "enquadre": [[0, 1.10, 0.5, 0.45], [1, 1.22, 0.5, 0.42]], "estab": "auto", "cor": "mesa", "flash": [[0, 0.35, 0.5]]},
            {"id": "P2", "bloco": "B2", "t0": 3.0, "t1": 6.0, "fonte": "a002", "s0": 1.0, "vel": 1.0,
             "enquadre": [[0, 1.0, 0.5, 0.5], [1, 1.12, 0.52, 0.5]], "estab": "nao", "cor": "salao", "som_direto_db": None,
             "desfocar": [[0.62, 0.70, 0.95, 0.80]]},
            {"id": "P3", "bloco": "B2", "t0": 6.0, "t1": 10.0, "fonte": "a001", "s0": 2.0, "vel": 0.8,
             "enquadre": [[0, 1.15, 0.5, 0.5], [1, 1.30, 0.5, 0.5]], "estab": "sim", "cor": "evento"},
        ],
        "motion": [
            {"id": "gancho", "modelo": "gancho", "de": 0, "ate": 2.9,
             "props": {"linhas": ["NÃO É SÓ", "FILMAR."], "troca": {"de": "FILMAR", "para": "CONTAR", "em": 1.2, "dur": 0.36}, "y": 0.40}},
            {"id": "chip1", "modelo": "chip", "de": 3.2, "ate": 5.8, "props": {"nome": "MARCOS", "cargo": "creat.MTT"}},
            {"id": "fecho", "modelo": "fecho", "de": 6.0, "ate": 10.0,
             "props": {"cta": ["MANDA NO", "*DIRECT*."], "apoio": "@creat.mtt", "logo": logo, **({"larguraLogo": 1080} if logo_pequena else {})}},
        ],
        "legendas": {"modelo": "legenda", "y": 0.62, "palavras": palavras},
        "fx": [{"tipo": "whip", "t": 3.0, "dur": 0.33, "dir": 1}, {"tipo": "impacto", "t": 6.0, "dur": 0.3, "forca": 0.8}],
        "trilha": {"chave": str(f["trilha"]), "bpm": 104, "fase": 0, "emendas": [], "ganho_db": -16,
                   "ducking": {"db": 10, "desce": 0.4, "sobe": 0.55}, "acorde_final": None},
        "sfx": [{"t": 0.0, "som": "hit_boom_grave", "g": -9, "pan": 0}, {"t": 2.85, "som": "whoosh_curto", "g": -10, "pan": 0.2},
                {"t": 6.0, "som": "impacto_anilha_clang", "g": -12, "pan": 0}],
        "tom_sala": ({"fonte": "r001", "s0": 0.0, "s1": 8.0, "db": -30} if (tom_com_voz and real)
                     else {"fonte": "s001", "s0": 0.0, "s1": 6.0, "db": -50}),
        "master": {"lufs": -14, "tp": -1.0, "crf": 18},
        "qa": {"logos": [{"t": 8.5, "chave": logo}], "falas_confirmadas": ["F01.1", "F01.2"] if real else [], "riscos": []},
    }
    return edl
