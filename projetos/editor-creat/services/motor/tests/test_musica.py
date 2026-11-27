"""O editor ouve a música (25/11, pedido do dono: sentir o momento): virada, partes, tom, e o auge do filme em cima da virada.
Áudio sintético: 20 s calmos + 20 s fortes a 120 bpm, em lá menor."""
import numpy as np

from motor import musica

SR = 22050


def _nota(f, dur, amp):
    t = np.arange(int(dur * SR)) / SR
    return amp * np.sin(2 * np.pi * f * t) * np.exp(-3 * (t % 0.5))            # pulso a cada 0,5 s = 120 bpm


def _musica():
    la_menor = [220.0, 261.63, 329.63]                                           # lá, dó, mi
    calmo = sum(_nota(f, 20.0, 0.03) for f in la_menor)
    forte = sum(_nota(f, 20.0, 0.3) for f in la_menor + [440.0, 523.25, 659.25])
    return np.concatenate([calmo, forte]).astype(np.float32)


def test_virada_partes_e_tom():
    m = musica.mapa(_musica(), SR, bpm=120.0, fase=0.0)
    assert abs(m["virada"] - 20.0) <= 0.5 and (m["virada"] * 2) % 1 == 0          # na virada real e em cima da batida
    assert m["secoes"][0]["energia"] < m["secoes"][-1]["energia"] and abs(m["secoes"][0]["t1"] - 20.0) <= 2.0
    assert m["tom"] in ("lá menor", "dó maior")                                   # relativas: mesmas notas


def test_musica_plana_nao_inventa_virada():
    x = sum(_nota(f, 40.0, 0.1) for f in (220.0, 261.63, 329.63)).astype(np.float32)
    assert musica.mapa(x, SR, 120.0)["virada"] is None


def test_tons_que_combinam():
    assert musica.combina("dó maior", "lá menor") and musica.combina("dó maior", "sol maior")
    assert not musica.combina("dó maior", "fá# maior") and not musica.combina(None, "dó maior")


def test_auge_do_filme_cai_na_virada():
    from motor.etapas.resolvedor import Resolvedor
    r = Resolvedor.__new__(Resolvedor)
    r.d, r.avisos, r.m = {"trilha": {"clima": "x", "drop_em": "B3"}}, [], {}
    L = {"blocos": [{"id": "B1", "t0": 0.0}, {"id": "B3", "t0": 12.0}], "duracao": 30.0, "fecho_t": 27.0}
    trilha = {"chave": "biblioteca/trilhas/t.wav", "bpm": 120.0, "fase": 0.0, "dur": 90.0, "virada": 20.0}
    e = Resolvedor._trilha_edl(r, trilha, L)["emendas"]
    assert e == [[0.0, 8.0, 38.0, 0.05]]                       # música começa aos 8 s: a virada (20 s) cai nos 12 s do filme
    trilha["virada"] = 5.0                                    # virada antes do auge: não cabe, toca do começo e avisa
    assert Resolvedor._trilha_edl(r, trilha, L)["emendas"] == [[0.0, 0.0, 30.0, 0.0]] and r.avisos
    del trilha["virada"]
    assert Resolvedor._trilha_edl(r, trilha, L)["emendas"] == [[0.0, 0.0, 30.0, 0.0]]
    trilha.update(virada=20.0, bpm_medido=False)             # bpm chutado: não desloca
    assert Resolvedor._trilha_edl(r, trilha, L)["emendas"] == [[0.0, 0.0, 30.0, 0.0]]
