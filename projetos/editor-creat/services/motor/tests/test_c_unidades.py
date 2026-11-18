"""Frente C: unidades da montagem (sem material real, rápidas)."""
import json
import pathlib
import subprocess

import numpy as np
import pytest

from motor import config


def test_interp_kf_smoothstep():
    from motor.etapas.montagem.comum import interp_kf
    kf = [[0, 1.0, 0.5, 0.5], [1, 2.0, 0.5, 0.3]]
    assert interp_kf(kf, 0) == [1.0, 0.5, 0.5]
    assert interp_kf(kf, 1) == [2.0, 0.5, 0.3]
    assert interp_kf(kf, 0.5)[0] == pytest.approx(1.5)
    assert interp_kf(kf, 0.25)[0] < 1.25          # smoothstep: começa devagar


def test_fx_so_mexe_na_janela():
    from motor.etapas.montagem import fx
    img = (np.random.default_rng(1).random((64, 36, 3)) * 255).astype(np.uint8)
    efeitos = [{"tipo": "whip", "t": 1.0, "dur": 0.3, "dir": 1}, {"tipo": "fade", "t": 0.0, "dur": 0.5}]
    assert np.array_equal(fx.aplicar(img.copy(), 2.0, efeitos, []), img)
    assert not np.array_equal(fx.aplicar(img.copy(), 0.99, efeitos, []), img)
    assert fx.aplicar(img.copy(), 0.0, efeitos, []).max() == 0           # fade-in começa preto
    assert fx.janelas_escuras(efeitos) == [(0.0, 0.5)]


def test_legendas_viram_paginas_do_kit():
    from motor.etapas.montagem.overlay import camadas_legenda, cena_do_edl
    edl = json.loads((config.SCHEMAS / "exemplos" / "edl.json").read_text())
    cam = camadas_legenda(edl)
    assert len(cam) == 1 and cam[0]["modelo"] == "legenda"
    pal = cam[0]["props"]["palavras"]
    assert [w["p"] for w in pal] == ["o", "pessoal", "da", "*creat*", "tá", "aqui"]
    edl["legendas"]["palavras"].append([5.0, 5.4, "fim.", 0])
    assert len(camadas_legenda(edl)) == 2                            # pausa longa quebra
    cena = cena_do_edl(edl)
    assert {c["modelo"] for c in cena["camadas"]} >= {"gancho", "chip", "fecho", "legenda"}
    assert all(c["ate"] <= edl["duracao"] for c in cena["camadas"])


def test_caminho_de_imagem_vira_abs():
    from motor.etapas.montagem.overlay import _fixa_caminhos
    o = _fixa_caminhos([{"props": {"logo": "/x/y.png", "src": "assets/marca/a.png", "texto": "/nao/mexe"}}], None)
    assert o[0]["props"] == {"logo": "/@abs/x/y.png", "src": "assets/marca/a.png", "texto": "/nao/mexe"}


def test_trilha_emendas_e_sfx_sintetico(tmp_path):
    import soundfile as sf
    from motor.etapas.montagem import trilha
    sr = 48000
    x = np.zeros((sr * 4, 2), np.float32)
    x[sr * 3:sr * 3 + 100] = 0.9                                     # marca no 3,0 s da música
    arq = tmp_path / "m.wav"
    sf.write(arq, x, sr)
    edl = {"duracao": 2.0, "trilha": {"chave": str(arq), "emendas": [[0.0, 0.0, 1.0, 0.02], [1.0, 3.0, 4.0, 0.02]]}}
    out, rel = trilha.montar_trilha(edl, arq)
    assert rel["emendas"] == 2 and out.shape == (sr * 2, 2)
    assert abs(int(np.argmax(np.abs(out[:, 0]))) - sr) < 50          # o trecho do 3,0 s caiu no 1,0 s do filme
    a, _ = trilha.som("whoosh_curto", None)
    b = trilha.sintetizar("whoosh_curto")
    assert np.allclose(a[:, 0], b) and 0.85 < np.abs(b).max() <= 0.9


def test_mix_entrega_lufs_e_pico(tmp_path):
    from motor.etapas.montagem import mix, trilha
    from motor.etapas.montagem.comum import Fontes
    sr = 48000
    n = sr * 6
    t = np.arange(n) / sr
    voz = (0.2 * np.sin(2 * np.pi * 200 * t) * (np.sin(2 * np.pi * 3 * t) > 0) * (t > 0.5) * (t < 4.5)).astype(np.float32)
    mus = np.stack([0.3 * np.sin(2 * np.pi * 110 * t)] * 2, 1).astype(np.float32)
    edl = {"duracao": 6.0, "trilha": {"ganho_db": -16}, "master": {"lufs": -14, "tp": -1.0}, "sfx": [{"t": 1.0, "som": "hit_boom_grave"}],
           "planos": [], "fontes": {}, "tom_sala": None}
    fx, _ = trilha.montar_sfx(edl, None)
    r = mix.mixar(edl, voz, mus, fx, Fontes(edl), tmp_path)
    assert abs(r["lufs"] + 14) <= 0.5
    assert r["true_peak_db"] <= -1.0
    assert set(r["stems"]) == {"voz", "trilha", "sfx", "direto", "ambiente"}
    assert r["voz_sobre_cama_db"] is not None and r["voz_sobre_cama_db"] > 6


def test_plano_de_fonte_pequena(tmp_path):
    from motor.etapas.montagem.planos import render_plano
    src = tmp_path / "s.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=2", "-pix_fmt", "yuv420p", str(src)], check=True)
    out = tmp_path / "p.mp4"
    info = render_plano({"id": "P", "t0": 0, "t1": 1.0, "fonte": "a", "s0": 0.2, "estab": "auto", "cor": "salao",
                         "enquadre": [[0, 1.0, 0.5, 0.5], [1, 1.2, 0.5, 0.5]], "desfocar": [[0, 0, 0.5, 0.5]], "flash": [[0, 0.2, 0.5]]},
                        str(src), 0.0, str(out), {"w": 1080, "h": 1920, "fps": 30}, nice=0)
    r = subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-show_entries", "stream=width,height,nb_read_frames", "-of", "json", str(out)],
                       capture_output=True, text=True)
    s = json.loads(r.stdout)["streams"][0]
    assert (s["width"], s["height"], int(s["nb_read_frames"])) == (1080, 1920, 30)
    assert info["quadros"] == 30


@pytest.mark.real
def test_edl_legado_v1_v2_validos(material_real):
    import sys
    sys.path.insert(0, str(config.SCHEMAS / "py"))
    from validar import erros
    from motor.ferramentas.edl_legado import converter
    for nome in ("V2", "V1"):
        edl = converter(material_real / nome / "edl.json")
        assert erros("edl", edl) == [], nome
        assert all(pathlib.Path(f["chave"]).exists() for f in edl["fontes"].values()), nome
    v2 = converter(material_real / "V2" / "edl.json")
    assert len(v2["planos"]) == 61 and len(v2["voz"]) == 53 and v2["trilha"]["acorde_final"]
