"""Frente C: checagens do QA com mídia sintética mínima e transcritor falso (rápido, sem modelo)."""
import json
import subprocess

import numpy as np
import pytest

from motor import config


def _video(tmp_path, nome="f.mp4", preto_ate=0.0, dur=2.0):
    import pyloudnorm as pyln
    import soundfile as sf
    sr = 48000
    t = np.arange(int(dur * sr)) / sr
    x = 0.1 * np.sin(2 * np.pi * 440 * t)
    x = x * 10 ** ((-14 - pyln.Meter(sr).integrated_loudness(np.stack([x, x], 1))) / 20)   # estéreo: mede como sai
    w = tmp_path / "a.wav"
    sf.write(w, np.stack([x, x], 1).astype(np.float32), sr)
    out = tmp_path / nome
    vf = f"drawbox=x=0:y=0:w=iw:h=ih:color=black:t=fill:enable='lt(t,{preto_ate})'" if preto_ate else "null"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=s=1080x1920:r=30:d={dur}", "-i", str(w), "-vf", vf,
                    "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000",
                    "-shortest", "-movflags", "+faststart", str(out)], check=True)
    return out


def _edl(**kw):
    e = {"versao": "1", "projeto": "p", "formato": {"w": 1080, "h": 1920, "fps": 30}, "duracao": 2.0, "fontes": {}, "voz": [], "planos": [],
         "motion": [], "legendas": {"palavras": []}, "trilha": {"chave": None}, "sfx": [], "master": {"lufs": -14, "tp": -1.0}}
    e.update(kw)
    return e


def test_formato_lufs_e_relatorio_valido(tmp_path, dados):
    from motor.etapas.qa import conferir
    f = _video(tmp_path)
    rel = conferir(f, _edl(), config.carregar(), so=["formato", "duracao", "lufs", "true_peak", "quadros_pretos"])
    c = {x["id"]: x for x in rel["checagens"]}
    assert c["formato"]["ok"] and c["formato"]["valor"]["faststart"], c["formato"]["detalhe"]
    assert c["duracao"]["ok"] and c["lufs"]["ok"] and c["true_peak"]["ok"] and c["quadros_pretos"]["ok"], [c[k]["detalhe"] for k in c]
    assert rel["aprovado"]


def test_quadro_preto_reprova_fora_do_fade(tmp_path, dados):
    from motor.etapas.qa import conferir
    f = _video(tmp_path, preto_ate=0.6)
    cfg = config.carregar()
    r1 = conferir(f, _edl(), cfg, so=["quadros_pretos"])
    assert not r1["aprovado"]
    r2 = conferir(f, _edl(fx=[{"tipo": "fade", "t": 0.0, "dur": 0.7}]), cfg, so=["quadros_pretos"])
    assert r2["aprovado"]


def test_logo_pequena_reprova(tmp_path, dados):
    from PIL import Image
    from motor.etapas.qa import conferir
    f = _video(tmp_path)
    lg = tmp_path / "logo.png"
    Image.new("RGBA", (300, 80), (255, 0, 0, 255)).save(lg)
    edl = _edl(motion=[{"id": "fe", "modelo": "fecho", "de": 0.5, "ate": 2.0, "props": {"logo": str(lg), "larguraLogo": 1080}}])
    rel = conferir(f, edl, config.carregar(), so=["logo_100"])
    c = rel["checagens"][0]
    assert not c["ok"] and c["valor"][0]["ampliacao"] == 3.6 and c["evidencia"]
    edl["motion"][0]["props"]["larguraLogo"] = 300
    assert conferir(f, edl, config.carregar(), so=["logo_100"])["aprovado"]


class _Falso:
    """Transcritor falso: devolve o texto pedido para cada arquivo."""
    def __init__(self, textos):
        self.textos = textos

    def __call__(self, nome, arq, **_k):
        txt = self.textos.get(nome, "")
        pal = [[i * 0.3, i * 0.3 + 0.25, w, 0.9] for i, w in enumerate(txt.split())]
        return {"segmentos": [{"texto": txt, "palavras": pal}] if pal else []}


@pytest.mark.parametrize("mix,amb,deve_passar", [
    ("pessoal que vai competir aqui", "", True),
    ("vai competir agora vai competir agora vai competir agora", "", False),
    ("pessoal que vai competir aqui", "vai competir agora vai competir agora", False),
])
def test_frase_repetida_e_tom_de_sala(tmp_path, dados, monkeypatch, mix, amb, deve_passar):
    from motor.etapas import qa
    f = _video(tmp_path)
    monkeypatch.setattr(qa.Conferencia, "transcrever", lambda self, nome, arq, **k: _Falso({"mix": mix, "stem_ambiente": amb})(nome, arq))
    edl = _edl(voz=[{"id": "V1", "fonte": "a", "s0": 0, "s1": 1, "t0": 0, "t1": 1, "texto": "pessoal que vai competir aqui"}],
               tom_sala={"fonte": "b", "s0": 0, "s1": 2})
    stems = {"ambiente": str(f)}
    rel = qa.conferir(f, edl, config.carregar(), stems=stems, mix=f, so=["frase_repetida", "tom_sala_sem_voz"])
    assert rel["aprovado"] is deve_passar, rel["checagens"]


def test_regra_da_memoria_reprova_legenda_proibida(tmp_path, dados):
    from motor.etapas.qa import conferir
    f = _video(tmp_path)
    edl = _edl(legendas={"palavras": [[0.1, 0.5, "create", 0]]},
               motion=[{"id": "fe", "modelo": "fecho", "de": 1, "ate": 2, "props": {"apoio": "@creat.mtt"}}])
    rel = conferir(f, edl, config.carregar(), so=["regra_memoria"])
    assert not rel["aprovado"] and "c_marca_sem_e" in json.dumps(rel)


def test_checagem_que_quebra_reprova(tmp_path, dados, monkeypatch):
    from motor.etapas import qa
    from motor.etapas.qa import lufs
    f = _video(tmp_path)
    monkeypatch.setattr(lufs, "checar", lambda c: 1 / 0)
    rel = qa.conferir(f, _edl(), config.carregar(), so=["lufs"])
    assert not rel["aprovado"] and "quebrou" in rel["checagens"][0]["detalhe"]
