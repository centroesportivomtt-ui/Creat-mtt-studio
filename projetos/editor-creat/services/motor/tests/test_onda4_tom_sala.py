"""Onda 4, item 3 (D45): o tom de sala nunca sai de trecho com voz; o resolvedor escolhe com a MESMA régua que a conferência
usa para reprovar (critérios 3.1 a 3.5). Áudio sintético: a fala principal (210 Hz) nos segmentos da transcrição e a equipe
conversando baixo (120 Hz), fora da transcrição, como no caso real de 26/11. Nada de material de cliente."""
from __future__ import annotations

import numpy as np
import pytest
import soundfile as sf
from b_sintetico import TRILHAS, analise, direcao

from motor import config
from motor.etapas import armazem_b, catalogo, resolvedor
from motor.etapas import direcao as DIR
from motor.etapas.montagem.comum import Fontes
from motor.memoria.loja import Loja
from tests.test_qa_fala import _AssinadorUmaVoz, _voz

SR = 16000


@pytest.fixture(autouse=True)
def _sem_modelo(monkeypatch):
    monkeypatch.setattr("motor.etapas.falante.Assinador", _AssinadorUmaVoz)


def _wav(pasta, nome, dur, fala=(), equipe=False):
    rng = np.random.default_rng(11)
    x = (0.0005 * rng.standard_normal(int(dur * SR))).astype(np.float32)
    for a, b in fala:
        v = _voz(b - a, 210, 0.3, SR)
        x[int(a * SR):int(a * SR) + len(v)] += v
    if equipe:                                   # conversa baixa da equipe em todo vão da fala principal
        t = 0.0
        while t < dur - 1.0:
            if not any(a - 1.0 < t < b + 0.2 for a, b in fala):
                v = _voz(0.8, 120, 0.03, SR)
                x[int(t * SR):int(t * SR) + len(v)] += v
            t += 1.0
    p = pasta / nome
    sf.write(p, x, SR)
    return str(p)


def _material(tmp_path, *, a_com_equipe=True, b_ambiente="salao", b_com_equipe=False):
    a = analise()
    fala = [(s["s"], s["e"]) for s in a["transcricao"]["segmentos"]]
    a["derivados"]["audio_wav"] = _wav(tmp_path, "a001.wav", 30.0, fala, equipe=a_com_equipe)
    b = analise("a002", "20261118_101000.mov")
    b["transcricao"]["segmentos"] = []
    b["sinais"]["cenas"][0]["ambiente"] = b_ambiente
    b["derivados"]["audio_wav"] = _wav(tmp_path, "a002.wav", 30.0, (), equipe=b_com_equipe)
    return a, b


def _resolver(tmp_path, a, b, ouvinte=True):
    cat, _ = catalogo.montar([a, b], {"texto": "reel"}, "p_t")
    loja = Loja()
    ouv = DIR.ouvinte(armazem_b.Armazem(dados=tmp_path), {a["arquivo"]["id"]: a, b["arquivo"]["id"]: b}) if ouvinte else None
    return resolvedor.resolver(direcao(), cat, [a, b], loja.modelo("evento-reel"), TRILHAS, vocabulario=loja.vocabulario(), ouvinte=ouv)


def test_3_1_trecho_sem_palavra_mas_com_voz_e_recusado(tmp_path):
    a, b = _material(tmp_path)
    edl = _resolver(tmp_path, a, b)
    info = edl["origem"]["tom_sala"]
    assert info["recusados"] and all("voz contínua" in r["motivo"] for r in info["recusados"]), info
    assert {r["fonte"] for r in info["recusados"]} == {"C01"}
    assert edl["tom_sala"] and edl["tom_sala"]["fonte"] == "C02" and info["escolhido"]["fonte"] == "C02"


def test_3_1_sem_ouvinte_a_regra_antiga_pegaria_a_conversa(tmp_path):
    """O lado negativo: sem a régua física, o vão sem palavra do clipe principal (com a equipe falando) seria o escolhido."""
    a, b = _material(tmp_path)
    edl = _resolver(tmp_path, a, b, ouvinte=False)
    assert edl["tom_sala"]["fonte"] == "C01"


def test_3_2_unico_trecho_limpo_em_clipe_de_outro_ambiente(tmp_path):
    a, b = _material(tmp_path, b_ambiente="rua")
    edl = _resolver(tmp_path, a, b)
    assert edl["tom_sala"] and edl["tom_sala"]["fonte"] == "C02"


def test_3_3_sem_trecho_limpo_sai_sem_tom_de_sala_e_diz(tmp_path):
    a, b = _material(tmp_path, b_com_equipe=True)
    edl = _resolver(tmp_path, a, b)
    assert edl["tom_sala"] is None
    assert edl["origem"]["tom_sala"]["motivo"].startswith("não achei trecho sem ninguém falando no material")
    assert any(x.startswith("sem tom de sala") for x in edl["origem"]["avisos"])
    import motor.etapas.montagem as M
    assert "sem tom de sala: não achei trecho sem ninguém falando" in M._achado_mix(edl, {"lufs": -14.0})


def test_3_3_no_maximo_doze_trechos_ouvidos(tmp_path):
    a, b = _material(tmp_path, b_com_equipe=True)
    vistos = []
    real = DIR.ouvinte(armazem_b.Armazem(dados=tmp_path), {"a001": a, "a002": b})

    def contando(aid, s0, s1):
        vistos.append((aid, s0, s1))
        return real(aid, s0, s1)
    cat, _ = catalogo.montar([a, b], {"texto": "reel"}, "p_t")
    edl = resolvedor.resolver(direcao(), cat, [a, b], Loja().modelo("evento-reel"), TRILHAS, ouvinte=contando)
    assert len(vistos) <= 12 and edl["tom_sala"] is None


def _conferir_tom(tmp_path, edl, ts):
    import soundfile as sf_
    from motor.etapas import qa
    amb = tmp_path / "amb.flac"
    sf_.write(amb, (0.003 * np.random.default_rng(3).standard_normal(8 * 48000)).astype(np.float32), 48000)   # ruído liso
    e = {**edl, "tom_sala": dict(ts, difuso=True)}
    rel = qa.conferir(tmp_path / "final.mp4", e, config.carregar(), evidencias=tmp_path / "qa", fontes=Fontes(e),
                      stems={"ambiente": str(amb)}, so=["tom_sala_sem_voz"])
    return rel["checagens"][0]


def test_3_4_o_escolhido_passa_na_conferencia_e_o_recusado_reprova(tmp_path, dados):
    a, b = _material(tmp_path)
    edl = _resolver(tmp_path, a, b)
    ok = _conferir_tom(tmp_path, edl, edl["tom_sala"])
    assert ok["ok"] is True, ok
    rec = edl["origem"]["tom_sala"]["recusados"][0]
    fontes = dict(edl["fontes"])
    fontes.setdefault(rec["fonte"], {"chave": a["arquivo"]["chave"], "audio": a["derivados"]["audio_wav"], "offset": 0.0})
    ruim = _conferir_tom(tmp_path, {**edl, "fontes": fontes}, {"fonte": rec["fonte"], "s0": rec["s0"], "s1": rec["s1"], "db": -48})
    assert ruim["ok"] is False and "conversa" in ruim["detalhe"], ruim


def test_3_5_sem_ouvinte_fica_como_antes(tmp_path):
    """Sem `ouvinte` (ferramentas, testes antigos), o primeiro vão sem palavra do clipe principal continua sendo o escolhido."""
    a, b = _material(tmp_path, a_com_equipe=False)
    cat, _ = catalogo.montar([a, b], {"texto": "reel"}, "p_t")
    r = resolvedor.Resolvedor(direcao(), cat, {"a001": a, "a002": b}, Loja().modelo("evento-reel"), TRILHAS)
    edl = r.resolver()
    primeiro = r._silencios("C01", Loja().modelo("evento-reel").get("tom_sala", {}).get("min_s", 1.5))[0]
    assert edl["tom_sala"]["fonte"] == "C01" and (edl["tom_sala"]["s0"], edl["tom_sala"]["s1"]) == (round(primeiro[0], 3), round(primeiro[1], 3))
    assert edl["origem"]["tom_sala"]["recusados"] == [] and edl["origem"]["tom_sala"]["ouvidos"] == 0


# ------------------------------------------------------------------ gancho do item 5 no resolvedor (D48): a logo do cliente pelo código
def _fecho(edl):
    return next(m for m in edl["motion"] if m["modelo"] == "fecho")["props"]


def _com_marca(tmp_path, d, cliente, cadastradas):
    a, b = _material(tmp_path, a_com_equipe=False)
    cat, _ = catalogo.montar([a, b], {"texto": "reel"}, "p_t")
    return resolvedor.resolver(d, cat, [a, b], Loja().modelo("evento-reel"), TRILHAS, marca_existe=lambda s: s in cadastradas,
                               cliente=cliente)


def test_logo_do_cliente_entra_sozinha_quando_cadastrada(tmp_path):
    edl = _com_marca(tmp_path, direcao(), "super_kal", {"super-kal"})
    assert _fecho(edl)["logo_cliente"] == "marcas/super-kal/logo.png"
    assert any(lg["chave"] == "marcas/super-kal/logo.png" for lg in edl["qa"]["logos"])


def test_logo_sem_cadastro_nao_vira_chave_quebrada(tmp_path):
    edl = _com_marca(tmp_path, direcao(), "super-kal", set())
    assert "logo_cliente" not in _fecho(edl) and all("marcas/" not in lg["chave"] for lg in edl["qa"]["logos"])
    d = direcao()
    d["fecho"]["logo_cliente"] = "marca_que_nao_existe"
    edl2 = _com_marca(tmp_path, d, None, {"super-kal"})
    assert "logo_cliente" not in _fecho(edl2) and any("marca_que_nao_existe" in x and "não está cadastrada" in x for x in edl2["origem"]["avisos"])
    d3 = direcao()
    d3["fecho"]["logo_cliente"] = "Super Kal"                 # o diretor escreve o nome: vira o slug das entregas
    assert _fecho(_com_marca(tmp_path, d3, None, {"super-kal"}))["logo_cliente"] == "marcas/super-kal/logo.png"


def test_sem_a_consulta_de_marca_fica_como_antes(tmp_path):
    d = direcao()
    d["fecho"]["logo_cliente"] = "x"
    a, b = _material(tmp_path, a_com_equipe=False)
    cat, _ = catalogo.montar([a, b], {"texto": "reel"}, "p_t")
    edl = resolvedor.resolver(d, cat, [a, b], Loja().modelo("evento-reel"), TRILHAS)
    assert _fecho(edl)["logo_cliente"] == "marcas/x/logo.png"


def test_direcao_consulta_a_logo_no_armazenamento(tmp_path):
    arm = armazem_b.Armazem(dados=tmp_path)
    arm.gravar_bytes("marcas/super-kal/logo.png", b"\x89PNG")
    existe = DIR.marca_existe(arm)
    assert existe("super-kal") is True and existe("outra") is False and existe("") is False
