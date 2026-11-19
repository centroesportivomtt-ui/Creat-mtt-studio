"""Biblioteca da casa (fila do dono, item E): nada toca sem licença registrada. Sem rede."""
import json
import pathlib
import subprocess

import numpy as np
import pytest

from motor import biblioteca as B
from motor import config

LIC = {"tipo": "comprada", "fonte": "Artlist", "autor": "Fulano", "termos_url": "https://artlist.io/license", "uso_comercial": True}


def _batida(tmp_path, bpm=120.0, dur=12.0, fase=0.25, nome="trilha.wav"):
    import soundfile as sf
    sr = 48000
    x = np.zeros(int(dur * sr), np.float32)
    t = np.arange(int(0.05 * sr)) / sr
    clique = (np.sin(2 * np.pi * 120 * t) * np.exp(-t * 60)).astype(np.float32)
    passo = 60.0 / bpm
    k = fase
    while k + 0.05 < dur:
        i = int(k * sr)
        x[i:i + len(clique)] += clique
        k += passo
    x += np.random.default_rng(1).normal(0, 0.003, len(x)).astype(np.float32)
    arq = tmp_path / nome
    sf.write(arq, np.stack([x, x], 1), sr)
    return arq


def _arm(cfg):
    from motor.provedores import armazenamento_de
    return armazenamento_de(cfg)


def test_licenca_obrigatoria_e_valida():
    assert B.problema_licenca(LIC) is None
    assert B.problema_licenca(None) == "sem licença registrada"
    assert "tipo" in B.problema_licenca({**LIC, "tipo": "achei_no_youtube"})
    assert "fonte" in B.problema_licenca({**LIC, "fonte": " "})
    assert "comercial" in B.problema_licenca({**LIC, "uso_comercial": False})
    assert "comercial" in B.problema_licenca({k: v for k, v in LIC.items() if k != "uso_comercial"})


@pytest.mark.parametrize("bpm", [96.0, 120.0, 140.0])
def test_mede_o_andamento_da_trilha(tmp_path, bpm):
    arq = _batida(tmp_path, bpm=bpm, fase=0.3)
    medido, fase = B.andamento(*B.ler_wav(arq))
    assert medido == pytest.approx(bpm, rel=0.03)
    passo = 60 / bpm
    assert min(abs(fase - 0.3) % passo, passo - abs(fase - 0.3) % passo) < 0.04
    assert B.andamento(np.zeros(48000 * 6, np.float32), 48000)[0] is None


def test_registrar_trilha_e_efeito_e_o_catalogo_so_ve_licenciado(tmp_path, dados, monkeypatch):
    monkeypatch.delenv("EDITOR_TRILHAS", raising=False)
    cfg = config.carregar()
    arm = _arm(cfg)
    item = B.registrar(cfg, arm, _batida(tmp_path, bpm=128), tipo="trilha", titulo="Energia Mercado", licenca=LIC, clima="animado")
    assert item["id"] == "energia-mercado" and item["chave"] == "biblioteca/trilhas/energia-mercado.wav" and arm.existe(item["chave"])
    assert item["bpm"] == pytest.approx(128, rel=0.03) and item["bpm_medido"] and item["dur"] == pytest.approx(12.0, abs=0.05)
    assert item["licenca"]["fonte"] == "Artlist" and item["licenca"]["registrado_em"]
    item2 = B.registrar(cfg, arm, _batida(tmp_path, nome="b.wav"), tipo="trilha", titulo="Energia Mercado", licenca=LIC)
    assert item2["id"] == "energia-mercado-2"
    with pytest.raises(ValueError, match="sem licença válida"):
        B.registrar(cfg, arm, _batida(tmp_path, nome="c.wav"), tipo="trilha", titulo="Sem dono", licenca={**LIC, "uso_comercial": False})
    # ficha antiga sem licença (como as de 17/11) fica fora do catálogo
    lista = B.ler(cfg, "trilha") + [{"id": "trilha_v1", "chave": "biblioteca/trilhas/x.wav", "bpm": 100, "dur": 30}]
    (B._raiz(cfg) / "trilhas.json").write_text(json.dumps(lista))
    from motor.etapas import armazem_b
    assert [t["id"] for t in armazem_b.trilhas(cfg)] == ["energia-mercado", "energia-mercado-2"]
    ok, fora = B.trilhas_validas(cfg, arm)
    assert fora == ["trilha trilha_v1: sem licença registrada"]
    assert B.retirar(cfg, "trilha", "energia-mercado-2") and [t["id"] for t in armazem_b.trilhas(cfg)] == ["energia-mercado"]
    arm_p = pathlib.Path(arm.caminho_local("biblioteca/trilhas/energia-mercado.wav"))
    arm_p.unlink()
    assert armazem_b.trilhas(cfg) == []                                  # sem o áudio, não entra
    # efeito: precisa de nome; o mesmo nome substitui
    with pytest.raises(ValueError, match="nome curto"):
        B.registrar(cfg, arm, _batida(tmp_path, dur=1.0, nome="s.wav"), tipo="sfx", titulo="Pancada", licenca=LIC)
    s = B.registrar(cfg, arm, _batida(tmp_path, dur=1.0, nome="s.wav"), tipo="sfx", titulo="Pancada", licenca=LIC, nome="impacto")
    B.registrar(cfg, arm, _batida(tmp_path, dur=0.8, nome="s2.wav"), tipo="sfx", titulo="Pancada 2", licenca=LIC, nome="impacto")
    assert [x["titulo"] for x in B.ler(cfg, "sfx")] == ["Pancada 2"] and s["chave"] == "biblioteca/sfx/impacto.wav"
    lista = B.listar(cfg, arm)
    assert lista["sfx"][0]["pode_tocar"] and not lista["trilhas"][0]["pode_tocar"] and "livre" in lista["tipos_licenca"]


def test_efeito_licenciado_vence_o_sintetico_e_vale_sem_reiniciar(tmp_path, dados):
    from motor.etapas.montagem import trilha as TR
    cfg = config.carregar()
    pasta = str(B.pasta_sfx(cfg))
    x0, origem0 = TR.som("risco", pasta)
    assert origem0 == "sintetico"
    B.registrar(cfg, _arm(cfg), _batida(tmp_path, dur=0.6, nome="r.wav"), tipo="sfx", titulo="Risco", licenca=LIC, nome="risco")
    x1, origem1 = TR.som("risco", pasta)
    assert origem1 == "biblioteca" and len(x1) != len(x0)
    src = (config.RAIZ_REPO / "services/motor/motor/etapas/montagem/__init__.py").read_text()
    assert "BIB.pasta_sfx(cfg)" in src


def test_arquivo_sem_audio_e_recusado(tmp_path, dados):
    cfg = config.carregar()
    ruim = tmp_path / "x.wav"
    ruim.write_bytes(b"isto nao e audio")
    with pytest.raises(ValueError, match="não tem áudio"):
        B.registrar(cfg, _arm(cfg), ruim, tipo="trilha", titulo="Ruim", licenca=LIC)
    assert B.ler(cfg, "trilha") == []


def test_rotas_da_biblioteca(tmp_path, dados, monkeypatch):
    from fastapi.testclient import TestClient
    from motor.api import biblioteca as rota
    from motor.api.app import criar
    cli = TestClient(criar())
    base = {"url": "https://www.dropbox.com/scl/fi/abc123/trilha.wav?rlkey=x", "tipo": "trilha", "titulo": "Trilha boa", "licenca": LIC}
    assert cli.post("/v1/biblioteca", json={**base, "licenca": {**LIC, "uso_comercial": False}}).status_code == 422
    assert cli.post("/v1/biblioteca", json={**base, "url": "https://exemplo.com/a.wav"}).status_code == 422
    assert cli.post("/v1/biblioteca", json={**base, "tipo": "sfx"}).status_code == 422          # efeito sem nome
    assert cli.post("/v1/biblioteca", json={**base, "licenca": {**LIC, "termos_url": "javascript:alert(1)"}}).status_code == 422
    chamado = {}
    monkeypatch.setattr(rota, "_importar", lambda corpo, rid: chamado.update(corpo=corpo, rid=rid))
    r = cli.post("/v1/biblioteca", json=base)
    assert r.status_code == 202 and r.json()["estado"] == "entrando"
    import time
    for _ in range(50):
        if chamado:
            break
        time.sleep(0.02)
    assert chamado["corpo"]["licenca"]["fonte"] == "Artlist"
    g = cli.get("/v1/biblioteca").json()
    assert g["trilhas"] == [] and g["andamento"][0]["estado"] == "entrando" and "impacto" in g["nomes_sfx"]
    assert cli.post("/v1/biblioteca/trilha/nao-existe/retirar").status_code == 404
    assert cli.post("/v1/biblioteca/trilha/..%2Fx/retirar").status_code in (404, 422)


def test_backup_leva_as_fichas(tmp_path, dados, monkeypatch):
    import zipfile
    from motor import backup
    cfg = config.carregar()
    B.registrar(cfg, _arm(cfg), _batida(tmp_path), tipo="trilha", titulo="Uma", licenca=LIC)
    monkeypatch.setenv("EDITOR_MEMORIA", str(tmp_path / "mem"))
    z = zipfile.ZipFile(backup.montar(cfg)["zip"])
    assert "biblioteca/trilhas.json" in z.namelist() and not any(n.endswith(".wav") for n in z.namelist())
