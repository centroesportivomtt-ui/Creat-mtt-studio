"""Item J (22/11): o "vale…" do Xande no fim da cerveja v2. O tom de sala saiu de um trecho com conversa BAIXA da equipe
(longe do microfone, fora da transcrição) e, difuso, passava na modulação. Agora:
- o QA tom_sala_sem_voz passa o trecho ORIGINAL da fonte pela régua de conversa do som direto;
- o resolvedor só escolhe tom de sala onde o envelope não sobe e desce como sílaba.
Áudio sintético (mesmos geradores de test_qa_fala); nada de material de cliente."""
import json

import numpy as np
import pytest

from motor import config
from tests.test_qa_fala import _AssinadorUmaVoz, _fonte  # noqa: F401  (o fixture autouse de lá não vem junto)


@pytest.fixture(autouse=True)
def _sem_modelo(monkeypatch):
    monkeypatch.setattr("motor.etapas.falante.Assinador", _AssinadorUmaVoz)


def _edl(fonte_wav, ts, ambiente_wav):
    return {"versao": "v1", "projeto": "p", "formato": {"w": 1080, "h": 1920, "fps": 30}, "duracao": 6.0,
            "fontes": {"A": {"chave": str(fonte_wav), "audio": str(fonte_wav)}},
            "voz": [{"id": "V1", "fonte": "A", "s0": 0.5, "s1": 2.0, "t0": 0.0, "t1": 1.5, "vel": 1.0, "texto": "oi"}],
            "planos": [], "tom_sala": dict(ts, difuso=True), "_ambiente": str(ambiente_wav)}


def _conferir(tmp_path, edl):
    from motor.etapas import qa
    from motor.etapas.montagem.comum import Fontes
    amb = edl.pop("_ambiente")
    rel = qa.conferir(tmp_path / "final.mp4", edl, config.carregar(), evidencias=tmp_path / "qa", fontes=Fontes(edl),
                      stems={"ambiente": amb}, so=["tom_sala_sem_voz"])
    return rel["checagens"][0]


def _difuso(tmp_path, nome="amb"):
    import soundfile as sf
    x = (0.003 * np.random.default_rng(3).standard_normal(8 * 48000)).astype(np.float32)   # ruído liso: sem sílabas
    p = tmp_path / f"{nome}.flac"
    sf.write(p, x, 48000)
    return p


def test_tom_de_sala_tirado_de_conversa_baixa_reprova(tmp_path, dados):
    # fala principal 0,5-2,0 s; a equipe conversando BAIXO (12 dB abaixo, outra altura) em 4,0-7,0 s, de onde sai o tom de sala
    f = _fonte(tmp_path, "A", 9.0, [(0.5, 1.5, 210, 0.3), (4.2, 0.6, 120, 0.06), (5.1, 0.8, 125, 0.06), (6.2, 0.5, 118, 0.06)])
    r = _conferir(tmp_path, _edl(f, {"fonte": "A", "s0": 4.0, "s1": 7.0, "db": -43}, _difuso(tmp_path)))
    assert r["ok"] is False and r["bloqueia"] is True and "conversa" in r["detalhe"], r


def test_tom_de_sala_de_trecho_quieto_passa(tmp_path, dados):
    f = _fonte(tmp_path, "A", 9.0, [(0.5, 1.5, 210, 0.3)])
    r = _conferir(tmp_path, _edl(f, {"fonte": "A", "s0": 4.0, "s1": 7.0, "db": -43}, _difuso(tmp_path)))
    assert r["ok"] is True, r


def test_resolvedor_pula_silencio_com_silabas():
    """O vão da transcrição com conversa baixa (envelope subindo e descendo) não vira tom de sala; o vão liso vira."""
    from motor.etapas.resolvedor import Resolvedor
    passo = 0.05
    serie = np.full(int(20 / passo), -55.0)
    t = np.arange(len(serie)) * passo
    conversa = (t >= 3.0) & (t < 9.0)
    serie[conversa] = -55 + 18 * np.abs(np.sin(np.pi * t[conversa] / 0.18))    # equipe ~18 dB acima do piso nas sílabas: ~5 dB de desvio
    r = Resolvedor.__new__(Resolvedor)
    r.m = {"tom_sala": {}}
    r.energias = {"arq1": serie, "_passo": {"arq1": passo}}
    r.an = {"arq1": {"arquivo": {"id": "arq1"}, "midia": {"duracao": 20.0}, "derivados": {},
                     "transcricao": {"segmentos": [{"s": 0.5, "e": 2.5}, {"s": 9.5, "e": 11.0}]}}}
    r.clipe = {"C1": {"arquivo": "arq1"}}
    r.pal = lambda cid: []
    cands = Resolvedor._silencios(r, "C1", 1.5)
    assert cands and all(not (lo < 9.0 and hi > 3.0) for lo, hi in cands), cands       # só sobra o vão liso depois de 11 s


def test_musica_crescendo_nao_tira_o_tom_de_sala():
    """Música de loja subindo e descendo devagar (10 dB em 5 s) não é sílaba: o vão continua valendo."""
    from motor.etapas.resolvedor import _silabas_db
    passo = 0.05
    t = np.arange(int(6 / passo)) * passo
    musica = -45 + 5 * np.sin(2 * np.pi * t / 5.0)
    fala = -55 + 18 * np.abs(np.sin(np.pi * t / 0.18))
    buraco = musica.copy()
    buraco[40:44] = -90.0                                   # buraco da série não infla a medida
    assert _silabas_db(musica, passo) < 1.0 and _silabas_db(buraco, passo) < 1.0
    assert _silabas_db(fala, passo) > 5.0


def test_fonte_quase_toda_fala_ainda_acha_a_conversa_baixa(tmp_path, dados):
    """Piso do arquivo alto (quase tudo é a fala principal): o piso do próprio trecho é que vale."""
    falas = [(0.2 + 1.0 * k, 0.8, 210, 0.3) for k in range(12)]                   # 0-12 s: fala principal quase sem pausa
    equipe = [(13.2, 0.6, 120, 0.02), (14.1, 0.8, 125, 0.02), (15.2, 0.5, 118, 0.02)]
    f = _fonte(tmp_path, "A", 16.5, falas + equipe)
    r = _conferir(tmp_path, _edl(f, {"fonte": "A", "s0": 13.0, "s1": 16.0, "db": -43}, _difuso(tmp_path)))
    assert r["ok"] is False and "conversa" in r["detalhe"], r


def test_fonte_que_some_nao_aprova_calado(tmp_path, dados):
    f = _fonte(tmp_path, "A", 9.0, [(0.5, 1.5, 210, 0.3)])
    edl = _edl(f, {"fonte": "B", "s0": 4.0, "s1": 7.0, "db": -43}, _difuso(tmp_path))     # fonte B não existe
    r = _conferir(tmp_path, edl)
    assert r["ok"] is False and r["bloqueia"] is True, r
