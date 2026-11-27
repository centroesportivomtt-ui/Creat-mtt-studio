"""Item 3 (21/11): limpeza de voz por IA (DeepFilterNet3 ONNX) com a mistura escolhida pelo medidor de voz (DNSMOS) por fonte."""
import numpy as np
import pytest


def test_larguras_erb_cobrem_o_espectro():
    from motor.etapas.montagem import dfn3
    w = dfn3.larguras_erb()
    assert len(w) == 32 and int(w.sum()) == 960 // 2 + 1 and (w >= 2).all()


def test_escolher_mistura_maximo_de_limpeza_sem_estragar_a_voz(monkeypatch):
    """A regra do dono em números: limpa o máximo que a nota da VOZ aguenta; empate fica com a mistura mais natural."""
    from motor import qualidade_voz as Q
    from motor.etapas.montagem import voz
    # notas medidas em 21/11 na gravação real "b" (evento), por mistura
    tabela = {None: {"sig": 1.29, "bak": 1.16, "ovrl": 1.15}, 0.6: {"sig": 3.6, "bak": 2.38, "ovrl": 2.46},
              0.7: {"sig": 3.62, "bak": 2.55, "ovrl": 2.57}, 0.8: {"sig": 3.6, "bak": 2.74, "ovrl": 2.66},
              0.9: {"sig": 3.4, "bak": 3.2, "ovrl": 2.7}, 1.0: {"sig": 3.23, "bak": 3.67, "ovrl": 2.77}}
    cru = np.zeros(48000, np.float32)
    limpo = np.ones(48000, np.float32)

    def notas(x, sr, cfg=None, sessao=None):
        m = None if not x.any() else round(float(x.mean()), 1)
        return tabela[m]
    monkeypatch.setattr(Q, "notas", notas)
    r = voz.escolher_mistura(cru, limpo, cfg=None)
    assert r["mistura"] == 0.8 and r["medida"]                                 # 0,9 e 1,0 derrubam a voz (> 0,15 da melhor)
    assert r["antes"]["ovrl"] == 1.15 and r["depois"]["ovrl"] == 2.66
    tabela[0.7] = {"sig": 3.62, "bak": 2.7, "ovrl": 2.64}                      # 0,7 empata com 0,8 (até 0,03): fica o mais natural
    assert voz.escolher_mistura(cru, limpo, cfg=None)["mistura"] == 0.7
    monkeypatch.setattr(Q, "notas", lambda *a, **k: None)                       # sem medidor: o valor de reserva
    assert voz.escolher_mistura(cru, limpo, cfg=None, padrao=0.8) == {"mistura": 0.8, "antes": None, "depois": None, "medida": False}


class LimpadorNota:
    """IA falsa: devolve OUTRA nota (440 Hz) no lugar da voz (220 Hz). A proporção das duas no resultado mede a mistura."""
    disponivel = True

    def __init__(self):
        self.vistos = []

    def enhance(self, x):
        x = np.asarray(x, np.float32)
        self.vistos.append(len(x))
        t = np.arange(len(x)) / 48000
        return (0.3 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)


class LimpadorIdentidade:
    disponivel = True

    def enhance(self, x):
        return np.asarray(x, np.float32).copy()


def _edl_voz(tmp_path, autos, misturas=None, s0=1.5):
    import soundfile as sf
    sr = 48000
    t = np.arange(sr * 4) / sr
    sf.write(tmp_path / "f.wav", (0.3 * np.sin(2 * np.pi * 220 * t)).astype(np.float32), sr)
    voz = []
    for k, auto in enumerate(autos):
        lp = {"atenuacao_db": 15, "mistura": (misturas or [0.5] * len(autos))[k], **({"auto": True} if auto else {})}
        voz.append({"id": f"V{k}", "fonte": "A", "s0": s0 + k * 1.0, "s1": s0 + k * 1.0 + 0.9, "t0": 0.2 + k * 1.0, "t1": 1.1 + k * 1.0,
                    "vel": 1.0, "limpeza": lp})
    return {"duracao": 1.2 + len(autos), "fontes": {"A": {"chave": str(tmp_path / "f.wav"), "audio": str(tmp_path / "f.wav")}}, "voz": voz}


def _proporcao(y, a, b):
    """Amplitude de 220 Hz / amplitude de 440 Hz no trecho [a, b] s."""
    seg = y[int(a * 48000):int(b * 48000)]
    f = np.abs(np.fft.rfft(seg * np.hanning(len(seg))))
    hz = np.fft.rfftfreq(len(seg), 1 / 48000)
    return float(f[np.argmin(abs(hz - 220))] / f[np.argmin(abs(hz - 440))])


def test_mistura_chega_no_audio_e_peca_fixa_fica_com_a_dela(tmp_path, dados, monkeypatch):
    """Peça `auto` (o medidor escolhe 0,9) e peça com mistura FIXA 0,5 na mesma fonte: cada uma com a sua (revisão do Crivo:
    antes a primeira peça mandava em todas)."""
    from motor import config
    from motor.etapas.montagem import voz
    from motor.etapas.montagem.comum import Fontes
    monkeypatch.setattr(voz, "limpador", lambda cfg: LimpadorNota())
    monkeypatch.setattr(voz, "escolher_mistura", lambda cru, limpo, cfg, sr=48000, padrao=0.8: {
        "mistura": 0.9, "antes": {"ovrl": 1.2}, "depois": {"ovrl": 2.7}, "medida": True})
    edl = _edl_voz(tmp_path, [True, False], [0.8, 0.5])
    y, rel = voz.montar_voz(edl, Fontes(edl), tmp_path / "tmp", config.carregar())
    assert [r["mistura"] for r in rel] == [0.9, 0.5]
    assert rel[0]["voz_depois"] == {"ovrl": 2.7} and rel[1]["voz_depois"] is None
    p1, p2 = _proporcao(y, 0.35, 1.0), _proporcao(y, 1.35, 2.0)
    assert 0.05 < p1 < 0.25 and 0.6 < p2 < 1.6                                 # (1-m)/m: 0,9 -> ~0,11; 0,5 -> ~1


def test_contexto_e_alinhamento(tmp_path, dados, monkeypatch):
    """A IA vê 2 s antes da peça e o corte devolve exatamente a peça: com a IA identidade, o resultado é o da voz sem IA."""
    from motor import config
    from motor.etapas.montagem import voz
    from motor.etapas.montagem.comum import Fontes
    edl = _edl_voz(tmp_path, [True], s0=2.5)
    monkeypatch.setattr(voz, "escolher_mistura", lambda cru, limpo, cfg, sr=48000, padrao=0.8: {
        "mistura": 1.0, "antes": None, "depois": None, "medida": False})
    monkeypatch.setattr(voz, "limpador", lambda cfg: LimpadorIdentidade())
    y_ia, _ = voz.montar_voz(edl, Fontes(edl), tmp_path / "t1", config.carregar())

    class Sem:
        disponivel = False
    monkeypatch.setattr(voz, "limpador", lambda cfg: Sem())
    y_sem, rel = voz.montar_voz(edl, Fontes(edl), tmp_path / "t2", config.carregar())
    assert rel[0]["limpeza_ia"] is False and "mistura" not in rel[0]          # sem modelo: nada muda
    assert np.allclose(y_ia, y_sem, atol=1e-4)                                 # com IA identidade: idêntico (sem deslocamento)
    nota = LimpadorNota()
    monkeypatch.setattr(voz, "limpador", lambda cfg: nota)
    voz.montar_voz(edl, Fontes(edl), tmp_path / "t3", config.carregar())
    assert nota.vistos[0] == int(round((0.9 + 2 * voz.FOLGA + voz.CONTEXTO) * 48000))   # a IA recebeu os 2 s de contexto


def test_peca_longa_em_blocos_sem_costura(monkeypatch):
    from motor.etapas.montagem import dfn3
    L = dfn3.Limpador.__new__(dfn3.Limpador)
    L.disponivel = True
    L._enhance = lambda x: np.asarray(x, np.float32) * 2.0                    # IA falsa sem memória: dobra o sinal
    monkeypatch.setattr(dfn3, "BLOCO_S", 1.0)
    monkeypatch.setattr(dfn3, "CONTEXTO_BLOCO_S", 0.25)
    x = np.random.default_rng(1).standard_normal(48000 * 5 + 123).astype(np.float32)
    y = L.enhance(x)
    assert y.shape == x.shape and np.allclose(y, 2 * x)                        # emenda exata, sem pular nem repetir amostra


@pytest.mark.skipif(not __import__("os").environ.get("EDITOR_DFN3"), reason="modelo real só com EDITOR_DFN3 apontando a pasta dos ONNX")
def test_modelo_real_tira_ruido():
    from motor import config
    from motor.etapas.montagem.dfn3 import Limpador
    L = Limpador(config.carregar())
    assert L.disponivel
    rng = np.random.default_rng(0)
    ruido = (0.05 * rng.standard_normal(48000 * 2)).astype(np.float32)
    y = L.enhance(ruido)
    assert y.shape == ruido.shape and float(np.std(y)) < float(np.std(ruido)) * 0.5   # ruído puro: a IA tira a maior parte


def test_fonte_limpa_fica_original_e_100_porcento_so_com_folga(monkeypatch):
    from motor import qualidade_voz as Q
    from motor.etapas.montagem import voz
    cru, limpo = np.zeros(48000, np.float32), np.ones(48000, np.float32)

    def com(tabela):
        monkeypatch.setattr(Q, "notas", lambda x, sr, cfg=None, sessao=None: tabela[None if not x.any() else round(float(x.mean()), 1)])
        return voz.escolher_mistura(cru, limpo, cfg=None)["mistura"]
    limpa = {None: {"sig": 3.9, "bak": 4.0, "ovrl": 3.4}, **{m: {"sig": 3.9, "bak": 4.05, "ovrl": 3.45} for m in (0.6, 0.7, 0.8, 0.9, 1.0)}}
    assert com(limpa) == 0.0                                                    # microfone bom: a IA não melhora, fica o original
    suja = {None: {"sig": 2.4, "bak": 1.2, "ovrl": 1.2}, 0.6: {"sig": 2.4, "bak": 1.3, "ovrl": 1.3}, 0.7: {"sig": 2.4, "bak": 1.4, "ovrl": 1.4},
            0.8: {"sig": 2.4, "bak": 1.5, "ovrl": 1.5}, 0.9: {"sig": 2.45, "bak": 2.0, "ovrl": 1.9}, 1.0: {"sig": 2.5, "bak": 3.2, "ovrl": 2.05}}
    assert com(suja) == 1.0                                                     # 100% ganha de 90% por 0,15 (> 0,10): vale
    suja[1.0] = {"sig": 2.5, "bak": 2.2, "ovrl": 1.95}
    assert com(suja) == 0.9                                                     # ganha só 0,05: fica 90%
