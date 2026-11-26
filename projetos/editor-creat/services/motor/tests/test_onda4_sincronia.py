"""Onda 4, item 4d (D47): sincronia entre câmeras pelo áudio (`etapas/sincronia_cameras.py`) e o gancho da montagem.

Caso real de 26/11 (Super Kal, Black): diálogo com dois iPhones gravando juntos; a conferência só aceitava como take da fala o
plano da MESMA câmera, e a segunda câmera virava cobertura com rosto e reprovava. Aqui, com o diálogo sintético de
`sintetico_dialogo.py` (câmera B = câmera A atrasada 3,217 s, com outra mistura, outro ruído e outra equalização):
- `offset` acha o atraso com erro de até 10 ms, nos dois sentidos; áudio sem relação, música em laço, ruído e áudio curto
  devolvem None (sincronia falsa alinharia o plano errado);
- `alinhar` põe o plano da câmera B em sincronia com a voz da câmera A, é idempotente e não toca no que não deve (produto,
  rampa, mesma câmera, velocidade diferente, trecho fora do arquivo, fora do diálogo);
- o gancho `montagem._sincronizar` (frente MOTOR-A) roda com o módulo de verdade e grava `origem.sincronia`.
Sem modelo, sem rede, sem material de cliente."""
import copy

import numpy as np
import pytest

import sintetico_dialogo as S
from motor.etapas import sincronia_cameras as SC

D = S.ATRASO_B


@pytest.fixture(scope="module")
def cameras():
    c = S.cena()
    return S.camera_a(c), S.camera_b(c)


def _audio_de(xa, xb, desloc_a=0.0, desloc_b=0.0):
    tab = {"camA": (xa, desloc_a), "camB": (xb, desloc_b)}
    return lambda fid: tab.get(fid)


def _voz(i, fonte, s0, s1, t0):
    return {"id": i, "fonte": fonte, "s0": s0, "s1": s1, "t0": t0, "t1": round(t0 + s1 - s0, 3), "vel": 1.0, "texto": "x"}


def _plano(i, fonte, s0, t0, t1, **kw):
    return {"id": i, "fonte": fonte, "s0": s0, "t0": t0, "t1": t1, "vel": 1.0, **kw}


# ------------------------------------------------------------------ offset
def test_offset_acha_o_atraso_sintetico_nos_dois_sentidos(cameras):
    xa, xb = cameras
    m = SC.offset(xa, xb, 16000)
    assert m is not None and abs(m["offset_s"] - D) <= 0.010, m
    assert m["conf"] >= SC.SINC_CONF_MIN and m["razao"] >= SC.SINC_RAZAO_MIN
    volta = SC.offset(xb, xa, 16000)
    assert volta is not None and abs(volta["offset_s"] + D) <= 0.010, volta
    assert set(m) == {"offset_s", "conf", "razao"}                 # contrato congelado da seção 2.6


def test_offset_em_48k_e_estereo(cameras):
    from scipy.signal import resample_poly
    xa, xb = cameras
    a48, b48 = resample_poly(xa, 3, 1).astype(np.float32), resample_poly(xb, 3, 1).astype(np.float32)
    m = SC.offset(np.stack([a48, a48], 1), b48, 48000)
    assert m is not None and abs(m["offset_s"] - D) <= 0.010, m


def test_offset_recusa_sem_relacao_laco_ruido_e_curto(cameras):
    xa, _ = cameras
    outros = [(t + 1.3 * k % 5, q, w) for k, (t, q, w) in enumerate(S.TURNOS)]  # outra conversa, outro desenho de turnos
    outra = S.camera_b(S.cena(seed=77, turnos=sorted(outros)), 1.0, seed=3)
    assert SC.offset(xa, outra, 16000) is None
    laco = S.musica_em_laco()
    rng = np.random.default_rng(1)
    atrasado = np.concatenate([np.zeros(int(1.3 * 16000), np.float32), laco]) + 0.002 * rng.standard_normal(len(laco) + int(1.3 * 16000))
    med = SC.medir(laco, atrasado, 16000)
    assert not med["aceito"] and med["razao"] < SC.SINC_RAZAO_MIN and "ambíguo" in med["motivo"]
    assert SC.offset(laco, atrasado, 16000) is None
    assert SC.offset(0.01 * rng.standard_normal(30 * 16000), 0.01 * rng.standard_normal(30 * 16000), 16000) is None
    assert SC.offset(xa[:16000], xa[:16000], 16000) is None                      # 1 s: curto demais para medir
    assert "curto" in SC.medir(xa[:16000], xa[:16000], 16000)["motivo"]


def test_offset_respeita_a_janela_de_busca(cameras):
    xa, xb = cameras
    assert SC.offset(xa, xb, 16000, janela_s=1.0) is None                       # o atraso verdadeiro (3,2 s) fica fora
    m = SC.offset(xa, xb, 16000, janela_s=1.0, centro_s=3.0)
    assert m is not None and abs(m["offset_s"] - D) <= 0.010


def test_delta_fonte_com_deslocamentos():
    # voz em fonte com deslocamento 10 (s do EDL = arquivo + 10) e plano em fonte com deslocamento 2
    assert SC.delta_fonte({"offset_s": 3.0}, 10.0, 2.0) == pytest.approx(-5.0)


# ------------------------------------------------------------------ alinhar (montagem)
def _edl_dialogo(s0_plano=50.0, **plano):
    return {"origem": {"vozes": "varias"},
            "voz": [_voz("V1", "camA", 10.6, 14.0, 0.0)],
            "planos": [_plano("P1", "camB", s0_plano, 0.5, 3.0, **plano)]}


def test_alinhar_poe_a_segunda_camera_em_sincronia_e_e_idempotente(cameras):
    xa, xb = cameras
    edl = _edl_dialogo()
    rel = SC.alinhar(edl, _audio_de(xa, xb), "varias")
    esperado = 10.6 + 0.5 + D                         # o instante da voz em t = 0,5 s, no relógio da câmera B
    assert edl["planos"][0]["s0"] == pytest.approx(esperado, abs=0.010)
    assert rel["algo"] == "sinc-1" and abs(rel["pares"]["camA|camB"]["offset_s"] - D) <= 0.010
    assert rel["planos"]["P1"] == {"s0_antes": 50.0, "s0_depois": edl["planos"][0]["s0"], "par": "camA|camB"}
    antes = copy.deepcopy(edl)
    rel2 = SC.alinhar(edl, _audio_de(xa, xb), "varias")
    assert edl == antes                                   # segunda rodada: nada muda
    assert rel2["planos"]["P1"]["s0_antes"] == rel2["planos"]["P1"]["s0_depois"]


def test_alinhar_com_fontes_deslocadas(cameras):
    xa, xb = cameras
    # trechos cortados: s do EDL = arquivo + deslocamento
    edl = {"origem": {"vozes": "varias"}, "voz": [_voz("V1", "camA", 110.6, 114.0, 0.0)], "planos": [_plano("P1", "camB", 0.0, 0.5, 3.0)]}
    SC.alinhar(edl, _audio_de(xa, xb, 100.0, -1.0), "varias")
    assert edl["planos"][0]["s0"] == pytest.approx(10.6 + 0.5 + D - 1.0, abs=0.010)


@pytest.mark.parametrize("plano, motivo", [
    ({"cobertura": {"olhar": "produto", "assunto": "a picanha"}}, None),
    ({"rampa": [[0, 1.0], [1, 2.0]]}, None),
    ({"vel": 1.25}, "velocidade"),
])
def test_alinhar_nao_toca_no_que_nao_deve(cameras, plano, motivo):
    xa, xb = cameras
    edl = _edl_dialogo(**plano)
    antes = copy.deepcopy(edl)
    rel = SC.alinhar(edl, _audio_de(xa, xb), "varias")
    assert edl == antes and rel["planos"] == {}
    if motivo:
        assert motivo in rel["pulados"][0]["motivo"]


def test_alinhar_fora_do_dialogo_mesma_camera_e_sem_audio(cameras):
    xa, xb = cameras
    for modo in ("uma", "auto"):
        edl = _edl_dialogo()
        assert SC.alinhar(edl, _audio_de(xa, xb), modo) is None and edl["planos"][0]["s0"] == 50.0
    mesma = {"origem": {"vozes": "varias"}, "voz": [_voz("V1", "camA_1", 10.6, 14.0, 0.0)], "planos": [_plano("P1", "camA_2", 30.0, 0.5, 3.0)]}
    rel = SC.alinhar(mesma, _audio_de(xa, xb), "varias")
    assert mesma["planos"][0]["s0"] == 30.0 and rel["planos"] == {}              # mesma câmera: a régua de sempre
    edl = _edl_dialogo()
    rel = SC.alinhar(edl, lambda fid: None, "varias")
    assert edl["planos"][0]["s0"] == 50.0 and rel["sem_sincronia"][0]["par"] == "camA|camB"


def test_alinhar_pula_trecho_que_nao_existe_no_arquivo_e_sincronia_sem_confianca(cameras):
    xa, xb = cameras
    edl = {"origem": {"vozes": "varias"}, "voz": [_voz("V1", "camA", 40.0, 42.0, 0.0)], "planos": [_plano("P1", "camB", 5.0, 0.0, 9.0)]}
    rel = SC.alinhar(edl, _audio_de(xa, xb), "varias")       # 40 + 3,2 + 9 passa do fim do arquivo da câmera B (51,2 s)
    assert edl["planos"][0]["s0"] == 5.0 and "não existe" in rel["pulados"][0]["motivo"]
    laco = S.musica_em_laco(46.0)
    edl = _edl_dialogo()
    rel = SC.alinhar(edl, _audio_de(laco, np.roll(laco, 1300)), "varias")
    assert edl["planos"][0]["s0"] == 50.0 and rel["pares"] == {} and "ambíguo" in rel["sem_sincronia"][0]["motivo"]


def test_gancho_da_montagem_com_o_modulo_de_verdade(tmp_path):
    """Junção com a frente MOTOR-A: `montagem._sincronizar` importa este módulo e grava `origem.sincronia`."""
    from motor.etapas import montagem as M
    from motor.etapas.montagem.comum import Fontes
    m = S.escrever(tmp_path)
    edl = {**_edl_dialogo(), "fontes": m["fontes"]}
    rel = M._sincronizar(edl, Fontes(edl), None)
    assert rel is not None and edl["origem"]["sincronia"] is rel
    assert edl["planos"][0]["s0"] == pytest.approx(10.6 + 0.5 + D, abs=0.010)
    edl1 = {**_edl_dialogo(), "fontes": m["fontes"], "origem": {"vozes": "uma"}}
    assert M._sincronizar(edl1, Fontes(edl1), None) is None and edl1["planos"][0]["s0"] == 50.0


# ------------------------------------------------------------------ correções da revisão tripla (A3 e A8)
def test_segunda_montagem_grava_o_mesmo_edl_e_nao_renderiza_de_novo(tmp_path):
    """A3: na 2ª passagem pela montagem (reinício do servidor, refazer montagem, nova conferência) o plano já está alinhado;
    antes o relatório trocava s0_antes (50,0 -> o s0 alinhado), o hash do EDL mudava e o filme era renderizado de novo."""
    from motor.etapas import montagem as M
    from motor.etapas.montagem.comum import Fontes
    m = S.escrever(tmp_path)
    edl = {**_edl_dialogo(), "fontes": m["fontes"]}
    M._sincronizar(edl, Fontes(edl), None)
    h1 = M.hash_obj(edl)
    assert edl["origem"]["sincronia"]["planos"]["P1"]["s0_antes"] == 50.0
    M._sincronizar(edl, Fontes(edl), None)
    M._sincronizar(edl, Fontes(edl), None)
    assert M.hash_obj(edl) == h1
    assert edl["origem"]["sincronia"]["planos"]["P1"]["s0_antes"] == 50.0       # o s0 do diretor continua registrado


def test_s0_antes_de_outra_medida_nao_e_herdado(cameras):
    """Se o diretor (ou o ajuste) mexeu no plano depois da 1ª medição, o s0 de agora é o 'antes' (não o de outra rodada)."""
    xa, xb = cameras
    edl = _edl_dialogo(s0_plano=40.0)
    edl["origem"]["sincronia"] = {"planos": {"P1": {"s0_antes": 50.0, "s0_depois": 13.0, "par": "camA|camB"}}}
    rel = SC.alinhar(edl, _audio_de(xa, xb), "varias")
    assert rel["planos"]["P1"]["s0_antes"] == 40.0


def test_cameras_ligadas_com_150_s_de_diferenca_alinham_pelo_gravado_em(cameras):
    """A8: duas câmeras ligadas com mais de 120 s de diferença ficam fora da busca padrão; com o gravado_em dos dois arquivos
    a busca centra na diferença e acha o atraso."""
    xa, xb = cameras
    longe = np.concatenate([np.zeros(150 * 16000, np.float32), xb])            # b começou a gravar 150 s antes
    assert SC.offset(xa, longe, 16000) is None
    fontes = {"camA": {"chave": "/x/a.mov", "gravado_em": "2026-11-26T19:42:33-03:00"},
              "camB": {"chave": "/x/b.mov", "gravado_em": "2026-11-26T19:40:00-03:00"}}
    busca = SC.busca_por_gravacao(fontes, "camA", "camB")
    assert busca == {"janela_s": SC.BUSCA_S, "centro_s": 153.0}
    m = SC.offset(xa, longe, 16000, **busca)
    assert m is not None and abs(m["offset_s"] - (150 + D)) <= 0.010, m
    edl = {**_edl_dialogo(), "fontes": fontes}
    rel = SC.alinhar(edl, _audio_de(xa, longe), "varias")
    assert edl["planos"][0]["s0"] == pytest.approx(10.6 + 0.5 + 150 + D, abs=0.010), rel


@pytest.mark.parametrize("ga, gb", [
    ("2026-11-26T19:40:30-03:00", "2026-11-26T19:40:00-03:00"),     # perto: vale a busca padrão
    ("2026-11-26T19:42:33-03:00", None),                            # uma sem data
    ("2026-11-26T19:42:33-03:00", "2026-11-26T19:40:00"),           # uma com fuso, outra sem
    ("ontem", "2026-11-26T19:40:00-03:00"),                         # ilegível
])
def test_busca_por_gravacao_so_decide_com_as_duas_datas(ga, gb):
    fontes = {"a": {"chave": "x", "gravado_em": ga}, "b": {"chave": "y", "gravado_em": gb}}
    assert SC.busca_por_gravacao(fontes, "a", "b") == {}


def test_busca_por_gravacao_soma_o_deslocamento_do_trecho():
    fontes = {"a": {"chave": "x", "gravado_em": "2026-11-26T19:40:00+00:00", "offset": 200.0},
              "b": {"chave": "y", "gravado_em": "2026-11-26T19:40:00+00:00"}}
    assert SC.busca_por_gravacao(fontes, "a", "b") == {"janela_s": SC.BUSCA_S, "centro_s": 200.0}
