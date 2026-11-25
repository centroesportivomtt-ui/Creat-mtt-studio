"""Correções da revisão da peça M4 (25/11): cada bug achado na revisão tem aqui o teste que falharia antes da correção.
Tudo com áudio e imagem SINTÉTICOS gerados no teste (nada baixado)."""
import numpy as np
import pytest
from test_m4_musica_cor_lenta import DO_MAIOR, LA_MENOR, _registrar, _resolvedor_so_musica

from motor import musica as MU
from motor.etapas import cor as C
from motor.etapas import resolvedor
from motor.etapas.montagem import trilha as TR
from motor.etapas.montagem.comum import SR

SOL_MAIOR = [196.0, 246.94, 293.66]


def _edl(ta, D):
    return {"duracao": D, "blocos": [], "origem": {}, "qa": {"riscos": []},
            "trilha": {"chave": ta["chave"], "bpm": ta["bpm"], "fase": 0.0, "emendas": [[0.0, 0.0, D, 0.0]], "acorde_final": None}}


def _rms(y, a, b):
    s = y[int(a * SR):int(b * SR)]
    return float(np.sqrt(np.mean(s.astype(np.float64) ** 2)))


# ---------------------------------------------------------------- 1: a música nova não pode acabar antes do filme
def test_musica_nova_cobre_o_filme_mesmo_quando_a_troca_cai_antes_do_alvo(tmp_path):
    """Revisão: A 40 s, B 40 s, filme 60 s. O alvo era 30 s, a troca caiu em 24 s e B (escolhida para cobrir só 30 s)
    acabava 4,7 s antes do fim. Agora a entrada de B é refeita com o que falta de verdade."""
    ta, arq_a, _ = _registrar(tmp_path, "ta", 120, DO_MAIOR, 2000, [(0, 8, 0.3), (8, 24, 1.0), (24, 40, 0.5)])
    tb, arq_b, _ = _registrar(tmp_path, "tb", 116, LA_MENOR, 5000, [(0, 8.276, 0.3), (8.276, 30, 1.0), (30, 40, 0.6)])
    D = 60.0
    R = _resolvedor_so_musica({"trilha": {"ids": ["ta", "tb"]}}, [ta, tb])
    edl = R._emendar_musicas(_edl(ta, D))
    fb = edl["trilha"]["faixas"][1]
    cobre = (tb["dur"] - fb["s_de"]) / fb["razao"]
    assert fb["entra_em"] + cobre >= D - 0.5, (fb, cobre)
    out, rel = TR.montar_trilha(edl, arq_a, {ta["chave"]: arq_a, tb["chave"]: arq_b})
    assert rel["avisos"] == [] and all(f.get("faltou_s", 0) <= 0.5 for f in rel["faixas"])
    assert _rms(out[:, 0], D - 2.0, D - 1.5) > 0.005                                    # ainda tem música antes do fade final
    assert not any("silêncio" in a for a in edl["qa"]["riscos"])


def test_musica_curta_demais_vira_aviso_e_nao_deixa_silencio(tmp_path):
    ta, _, _ = _registrar(tmp_path, "ta", 120, DO_MAIOR, 2000, [(0, 8, 0.3), (8, 24, 1.0), (24, 40, 0.5)])
    tb, _, _ = _registrar(tmp_path, "tb", 116, LA_MENOR, 5000, [(0, 4.138, 0.3), (4.138, 20, 1.0)], dur=20.0)
    R = _resolvedor_so_musica({"trilha": {"ids": ["ta", "tb"]}}, [ta, tb])
    edl = R._emendar_musicas(_edl(ta, 60.0))
    assert "faixas" not in edl["trilha"] and edl["trilha"]["emendas"]                     # segue só com A (emendas antigas)
    assert any("sem ponto de troca" in a for a in edl["qa"]["riscos"])


def test_montar_faixas_avisa_quando_a_faixa_acaba_antes(tmp_path):
    ta, arq_a, _ = _registrar(tmp_path, "ta", 120, DO_MAIOR, 2000, [(0, 40, 1.0)], dur=20.0)
    tb, arq_b, _ = _registrar(tmp_path, "tb", 120, LA_MENOR, 5000, [(0, 40, 1.0)], dur=20.0)
    edl = {"duracao": 40.0, "trilha": {"chave": ta["chave"], "faixas": [
        {"chave": ta["chave"], "entra_em": 0.0, "s_de": 0.0}, {"id": "tb", "chave": tb["chave"], "entra_em": 15.0, "s_de": 0.0, "xf": 1.0}]}}
    _, rel = TR.montar_trilha(edl, arq_a, {ta["chave"]: arq_a, tb["chave"]: arq_b})
    assert rel["faixas"][1]["faltou_s"] == pytest.approx(5.0, abs=0.05)
    assert len(rel["avisos"]) == 1 and "tb" in rel["avisos"][0] and "silêncio" in rel["avisos"][0]


# ---------------------------------------------------------------- 2: nível casado NA troca, não no trecho inteiro
def test_nivel_casado_na_troca_nao_afunda_o_refrao(tmp_path):
    """A toca 4 s de intro calma e 5 s fortes antes da troca; B é forte o tempo todo. Medindo o trecho inteiro, B era
    puxada para baixo (~-2 dB) bem em cima da troca. Medindo 4 s de cada lado da troca, o nível continua."""
    ta, arq_a, _ = _registrar(tmp_path, "ta", 120, DO_MAIOR, 2000, [(0, 4, 0.2), (4, 40, 1.0)])
    tb, arq_b, _ = _registrar(tmp_path, "tb", 120, DO_MAIOR, 2000, [(0, 40, 1.0)])
    edl = {"duracao": 20.0, "trilha": {"chave": ta["chave"], "acorde_final": 1.0, "faixas": [
        {"chave": ta["chave"], "entra_em": 0.0, "s_de": 0.0}, {"chave": tb["chave"], "entra_em": 9.0, "s_de": 8.0, "xf": 1.0}]}}
    out, rel = TR.montar_trilha(edl, arq_a, {ta["chave"]: arq_a, tb["chave"]: arq_b})
    assert abs(rel["faixas"][1]["ganho_db"]) < 0.5, rel
    y = out[:, 0]
    antes, depois = _rms(y, 6.0, 9.0), _rms(y, 10.0, 13.0)
    assert abs(20 * np.log10(depois / antes)) < 1.0


def test_tres_musicas_em_sequencia(tmp_path):
    ta, arq_a, _ = _registrar(tmp_path, "ta", 120, DO_MAIOR, 2000, [(0, 8, 0.3), (8, 24, 1.0), (24, 40, 0.5)])
    tb, arq_b, _ = _registrar(tmp_path, "tb", 118, SOL_MAIOR, 3000, [(0, 8.136, 0.4), (8.136, 32.5, 1.0), (32.5, 40, 0.5)])
    tc, arq_c, _ = _registrar(tmp_path, "tc", 122, LA_MENOR, 5000, [(0, 7.869, 0.3), (7.869, 40, 1.0)])
    D = 60.0
    R = _resolvedor_so_musica({"trilha": {"ids": ["ta", "tb", "tc"]}}, [ta, tb, tc])
    edl = R._emendar_musicas(_edl(ta, D))
    fx = edl["trilha"]["faixas"]
    assert [f["chave"] for f in fx] == [ta["chave"], tb["chave"], tc["chave"]]
    assert 0 < fx[1]["troca_em"] < fx[2]["troca_em"] < D - 2.0
    assert [m["modo"] for m in edl["origem"]["musicas"]] == ["casada", "casada"]
    out, rel = TR.montar_trilha(edl, arq_a, {ta["chave"]: arq_a, tb["chave"]: arq_b, tc["chave"]: arq_c})
    assert rel["avisos"] == [] and len(rel["faixas"]) == 3
    y = out[:, 0].astype(np.float64)
    w = int(0.05 * SR)
    for f in fx[1:]:                                               # nenhuma das duas trocas afunda o som
        T = f["troca_em"]
        rms = [np.sqrt(np.mean(y[i:i + w] ** 2)) for i in range(int((T - 3) * SR), int((T + 3) * SR), w)]
        assert min(rms) > 0.5 * float(np.median(rms))
    assert _rms(y, D - 2.0, D - 1.5) > 0.005


# ---------------------------------------------------------------- 3: bpm chutado não vira grade
def test_bpm_chutado_nao_estica_nem_fatia(tmp_path):
    ta, _, _ = _registrar(tmp_path, "ta", 120, DO_MAIOR, 2000, [(0, 8, 0.3), (8, 24, 1.0), (24, 40, 0.5)])
    tb, _, _ = _registrar(tmp_path, "tb", 116, LA_MENOR, 5000, [(0, 8.276, 0.3), (8.276, 30, 1.0), (30, 40, 0.6)])
    tb = {**tb, "bpm": 120.0, "bpm_medido": False}                 # o que a biblioteca grava quando não mediu o andamento
    R = _resolvedor_so_musica({"trilha": {"ids": ["ta", "tb"]}}, [ta, tb])
    edl = R._emendar_musicas(_edl(ta, 40.0))
    fb = edl["trilha"]["faixas"][1]
    assert fb["modo"] == "respiro" and fb["razao"] == 1.0 and fb["bpm"] is None
    assert "desconhecido" in edl["origem"]["musicas"][0]["motivo"]


# ---------------------------------------------------------------- 4: bpm ausente não derruba a direção
def test_ponto_de_troca_sem_bpm_nao_lanca_erro():
    a = {"tom": "dó maior", "secoes": [{"t0": 0, "t1": 8, "energia": 2}, {"t0": 8, "t1": 24, "energia": 5}, {"t0": 24, "t1": 40, "energia": 2}]}
    b = {"tom": "lá menor", "secoes": [{"t0": 0, "t1": 8.3, "energia": 1}, {"t0": 8.3, "t1": 40, "energia": 5}]}
    pt = MU.ponto_de_troca(a, b, 120, 0, None, 0, alvo_a=22)                          # antes: TypeError no f-string
    assert pt["modo"] == "respiro" and pt["razao"] == 1.0 and "?" in pt["motivo"]
    assert MU.ponto_de_troca(a, b, None, 0, None, 0, alvo_a=22)["modo"] == "respiro"


def test_erro_no_ponto_de_troca_vira_aviso(tmp_path, monkeypatch):
    ta, _, _ = _registrar(tmp_path, "ta", 120, DO_MAIOR, 2000, [(0, 8, 0.3), (8, 24, 1.0), (24, 40, 0.5)])
    tb, _, _ = _registrar(tmp_path, "tb", 116, LA_MENOR, 5000, [(0, 8.276, 0.3), (8.276, 40, 1.0)])

    def quebra(*a, **k):
        raise ValueError("seção sem t0")
    monkeypatch.setattr(MU, "ponto_de_troca", quebra)
    R = _resolvedor_so_musica({"trilha": {"ids": ["ta", "tb"]}}, [ta, tb])
    edl = R._emendar_musicas(_edl(ta, 40.0))
    assert "faixas" not in edl["trilha"]
    riscos = edl["qa"]["riscos"]
    assert any("falhou" in a and "ValueError" in a for a in riscos) and not any("sem ponto de troca" in a for a in riscos)


# ---------------------------------------------------------------- 8: avisos que sumiam em silêncio
def test_ids_ignorados_e_troca_em_errado_avisam(tmp_path):
    ta, _, _ = _registrar(tmp_path, "ta", 120, DO_MAIOR, 2000, [(0, 8, 0.3), (8, 24, 1.0), (24, 40, 0.5)])
    tb, _, _ = _registrar(tmp_path, "tb", 116, LA_MENOR, 5000, [(0, 8.276, 0.3), (8.276, 40, 1.0)])
    # a trilha do filme (trilha.id) é tb, mas ids começa por ta: antes devolvia o EDL sem dizer nada
    R = _resolvedor_so_musica({"trilha": {"ids": ["ta", "tb"]}}, [ta, tb])
    edl = R._emendar_musicas(_edl(tb, 40.0))
    assert "faixas" not in edl["trilha"] and any("trilha.ids" in a for a in edl["qa"]["riscos"])
    # um id de bloco que não existe não desloca as trocas seguintes: a 1a cai na divisão por igual, com aviso
    R = _resolvedor_so_musica({"trilha": {"ids": ["ta", "tb"], "troca_em": ["NAO_EXISTE"]}}, [ta, tb])
    edl = R._emendar_musicas(_edl(ta, 40.0))
    assert edl["trilha"]["faixas"][1]["troca_em"] > 0
    assert any("NAO_EXISTE" in a for a in edl["qa"]["riscos"])


# ---------------------------------------------------------------- 5: escurecer não é lavar a cor
@pytest.mark.parametrize("exp", [0.75, 0.8, 1.0])
def test_balanco_que_escurece_nao_sobe_a_saturacao(exp):
    """Revisão: o croma Cb/Cr cai junto com a luz, e com exp 0,75 a 0,8 a compensação subia a saturação 22 a 32% sem a
    imagem estar lavada. Medido relativo à luma, escurecer deixa a saturação do look como está."""
    C._CACHE.clear()
    bal = {"ganho": [1.0, 1.0, 1.0], "exp": exp}
    for look in ("neutro", "loja", "palco", "academia"):
        assert C.sat_efetiva(look, C._tabelas(look, bal)[0]) == pytest.approx(C.LOOKS[look]["sat"], abs=1e-3), look
    C._CACHE.clear()


def test_croma_relativo_a_luma_nao_muda_com_a_exposicao():
    img = np.zeros((40, 40, 3), np.uint8)
    img[:20] = (200, 120, 60)
    img[20:] = (60, 180, 90)
    escura = (img.astype(np.float64) * 0.6).round().astype(np.uint8)
    assert C._croma(escura) == pytest.approx(C._croma(img), rel=0.03)
    cinza = (0.5 * img + 0.5 * img.mean(axis=2, keepdims=True)).astype(np.uint8)       # lavada de verdade: o croma cai
    assert C._croma(cinza) < 0.7 * C._croma(img)


# ---------------------------------------------------------------- 6 e 7: lenta depois da troca de clipe, e a rampa
def _resolvedor_cob(clipes, fps, amp):
    """Só o que _cob usa: catálogo mínimo, fps por clipe e ampliação por clipe; _plano registra o que o plano leria."""
    R = object.__new__(resolvedor.Resolvedor)
    R.formato = {"w": 1080, "h": 1920, "fps": 30}
    R.cat = {"clipes": clipes}
    R.clipe = {c["id"]: {**c, "arquivo": c["id"]} for c in clipes}
    R.an = {c["id"]: {"midia": {"fps": fps[c["id"]]}} for c in clipes}
    R.mom = {m["id"]: (R.clipe[c["id"]], m) for c in clipes for m in c["momentos"]}
    R.avisos, R._mom_usados = [], set()
    R._ampliacao = lambda cid, zoom=1.0: amp[cid]
    R._serie = lambda cid: None
    R._nota_imagem = lambda cid, m, precisa: None

    def plano(pid, bloco, t0, t1, cid, s0, vel=1.0, zoom=1.0, **extra):
        v = R._vel_real(cid, vel)
        return {"cid": cid, "s0": s0, "vel": v, "le_ate": s0 + (t1 - t0) * v, "enquadre": [[0, 1.0, 0.5, 0.5]], **extra}
    R._plano = plano
    return R


def _mom(mid, t0, t1):
    return {"id": mid, "t0": t0, "t1": t1, "tipo": "acao", "nota": 4}


def test_lenta_recalculada_depois_de_trocar_o_clipe_por_equivalente():
    """Revisão: o clipe horizontal de 60 fps (0,5x cabe) foi trocado por um nativo de 30 fps, onde a lenta sobe para 0,95x.
    O trecho ainda era escolhido com a necessidade de 0,5x e o plano lia além do fim do momento."""
    clipes = [{"id": "H", "momentos": [_mom("mH", 0.0, 4.0)], "ambientes": ["rua"]},
              {"id": "V", "momentos": [_mom("mV", 10.0, 12.0)], "ambientes": ["rua"]}]
    R = _resolvedor_cob(clipes, {"H": 60.0, "V": 30.0}, {"H": 1.8, "V": 1.0})
    p = R._cob({"m": "mH", "efeito": "lento"}, {"id": "B1"}, 0.0, 2.0, {}, 0.5)
    assert p["cid"] == "V" and p["vel"] == pytest.approx(0.95)
    assert 10.0 <= p["s0"] and p["le_ate"] <= 12.0 + 1e-6, p
    # momento nativo curto demais para a lenta que ele aguenta: não troca (fica no original, que tem os quadros)
    clipes[1]["momentos"] = [_mom("mV", 10.0, 11.5)]
    R = _resolvedor_cob(clipes, {"H": 60.0, "V": 30.0}, {"H": 1.8, "V": 1.0})
    p = R._cob({"m": "mH", "efeito": "lento"}, {"id": "B1"}, 0.0, 2.0, {}, 0.5)
    assert p["cid"] == "H" and p["vel"] == pytest.approx(0.5)


@pytest.mark.parametrize("fps,miolo", [(30.0, 0.95), (60.0, 0.475), (120.0, 0.4)])
def test_rampa_com_miolo_lento_so_de_verdade(fps, miolo):
    clipes = [{"id": "A", "momentos": [_mom("mA", 0.0, 8.0)], "ambientes": []}]
    R = _resolvedor_cob(clipes, {"A": fps}, {"A": 1.0})
    dur = 2.0
    p = R._cob({"m": "mA", "efeito": "rampa"}, {"id": "B1"}, 0.0, dur, {}, 0.5)
    (x0, s0), (x1, s1), (x2, s2), (x3, s3) = p["rampa"]
    assert (s1 - s0) / ((x1 - x0) * dur) == pytest.approx(1.6, abs=1e-2)               # entra rápida
    assert (s2 - s1) / ((x2 - x1) * dur) == pytest.approx(miolo, abs=1e-2)             # miolo lento só com quadros de verdade
    # sai rápida: 0,3 x 1,6 de fonte em 0,35 do plano (1,37x). Já era assim antes da M4; o relato dizia 1,6x na saída
    assert (s3 - s2) / ((x3 - x2) * dur) == pytest.approx(0.3 * 1.6 / 0.35, abs=1e-2)
    assert s3 <= 8.0
