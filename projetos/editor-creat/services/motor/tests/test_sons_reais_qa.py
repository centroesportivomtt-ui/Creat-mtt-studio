"""M6: checagem `sons_reais` do QA (lista o que entrou e o que faltou; voz escondida reprova e vai para a lista negra) e a
licença (o áudio do banco nunca é servido nem vai para o backup; montagem.json e entrega.json registram a licença)."""
import json
import types

import pytest
from b_sons_reais import TranscritorFalso, ruido_rosa

import motor.sons_reais as SONS
from motor.etapas import qa as QA

SR = 48000


def _stem(pasta):
    import soundfile as sf
    p = pasta / "stem_reais.flac"
    sf.write(str(p), ruido_rosa(SR * 3, 31) * 0.1, SR, subtype="PCM_24")
    return p


def _conf(tmp_path, dados, *, stems=True, itens=True, faltou=True):
    edl = {"projeto": "p", "formato": {"w": 1080, "h": 1920, "fps": 30},
           "sons_reais": [{"id": "R01", "desc": "água de riacho"}, {"id": "R02", "desc": "porta-malas abrindo"}],
           "origem": {"sons_reais": {"pedidos": 3, "sem_som": [{"desc": "pisada no mato", "motivo": "nenhuma gravação real do banco serve"}]}}}
    mont = {"sons_reais": {
        "itens": [{"id": "R01", "desc": "água de riacho", "id_banco": 101, "nome": "AMB Creek water", "biblioteca": "Fake Nature",
                   "pacote": "GDC 2024", "item": "fake-gdc-2024", "t0": 0.0, "t1": 6.0, "origem": "baixado", "verificacao": "cabecalho+tamanho"}]
        if itens else [],
        "faltaram": [{"id": "R02", "desc": "porta-malas abrindo", "motivo": "#106: rede indisponível", "pendente": True}] if faltou else [],
        "licenca": SONS.LICENCA}}
    cfg = types.SimpleNamespace(dados=str(dados), transcricao="faster-whisper")
    return QA.Conferencia(tmp_path / "final.mp4", edl, cfg, stems={"reais": _stem(tmp_path)} if stems else {},
                          evidencias=tmp_path / "qa", montagem=mont)


def test_checagem_entra_antes_do_olho_ia_e_no_schema():
    assert "sons_reais" in QA.CHECAGENS and QA.CHECAGENS.index("sons_reais") == QA.CHECAGENS.index("olho_ia") - 1
    import validar
    assert "sons_reais" in validar.esquema("qa")["properties"]["checagens"]["items"]["properties"]["id"]["enum"]


def test_voz_no_stem_reprova_e_vai_para_a_lista_negra(tmp_path, dados, monkeypatch):
    monkeypatch.setattr(SONS, "transcritor_local", lambda cfg: TranscritorFalso(tudo=True))
    c = _conf(tmp_path, dados)
    r = QA._rodar("sons_reais", c)
    assert r["ok"] is False and r["bloqueia"] is True and "voz escondida" in r["detalhe"] and r["valor"]["palavras"] == 4
    assert json.loads((SONS.pasta_cache(c.cfg) / "com_voz.json").read_text())["ids"] == [101]
    assert r["evidencia"] == ["stems/reais.flac"]


def test_sem_transcritor_e_nao_verificado(tmp_path, dados, monkeypatch):
    monkeypatch.setattr(SONS, "transcritor_local", lambda cfg: None)
    r = QA._rodar("sons_reais", _conf(tmp_path, dados))
    assert r["ok"] is False and r["bloqueia"] is True and r["detalhe"].startswith("NÃO VERIFICADO")


def test_sem_voz_aprova_e_lista_o_que_entrou_e_o_que_faltou(tmp_path, dados, monkeypatch):
    t = TranscritorFalso()
    monkeypatch.setattr(SONS, "transcritor_local", lambda cfg: t)
    r = QA._rodar("sons_reais", _conf(tmp_path, dados))
    assert r["ok"] is True and "0 palavra" in r["detalhe"] and "AMB Creek water" in r["detalhe"]
    assert [x["id_banco"] for x in r["valor"]["entraram"]] == [101]
    assert {x["desc"] for x in r["valor"]["sem_som"]} == {"porta-malas abrindo", "pisada no mato"}
    assert t.chamadas and t.chamadas[0].startswith("_voz_stem_reais")


def test_pedido_sem_som_aprova_com_a_lista(tmp_path, dados, monkeypatch):
    monkeypatch.setattr(SONS, "transcritor_local", lambda cfg: pytest.fail("sem som no filme não precisa ouvir"))
    r = QA._rodar("sons_reais", _conf(tmp_path, dados, stems=False, itens=False))
    assert r["ok"] is True and "pedido(s) sem som" in r["detalhe"] and "rede indisponível" in r["detalhe"]
    c = _conf(tmp_path, dados, stems=False, itens=False)
    c.edl = {"projeto": "p"}
    assert QA._rodar("sons_reais", c)["detalhe"].startswith("sem sons reais")


def test_relatorio_de_qa_com_a_checagem_vale_no_schema(tmp_path, dados, monkeypatch):
    monkeypatch.setattr(SONS, "transcritor_local", lambda cfg: TranscritorFalso())
    c = _conf(tmp_path, dados)
    rel = QA.conferir(tmp_path / "final.mp4", c.edl, c.cfg, stems={"reais": str(_stem(tmp_path))}, evidencias=tmp_path / "qa",
                      so=["sons_reais"], montagem=c.montagem)
    assert rel["aprovado"] and rel["checagens"][0]["id"] == "sons_reais"


# ---------------------------------------------------------------- licença
def test_audio_do_banco_nunca_vai_para_o_backup(tmp_path, dados, monkeypatch):
    from motor import backup
    cache = dados / "cache" / "sons_reais"
    cache.mkdir(parents=True)
    (cache / "101_abc.flac").write_bytes(b"fLaC" + b"\0" * 100)
    (cache / "101_abc.json").write_text("{}")
    (cache / "com_voz.json").write_text('{"ids": []}')
    base = dados / "armazenamento" / "saidas" / "p" / "v1"
    base.mkdir(parents=True)
    (base / "montagem.json").write_text(json.dumps({"sons_reais": {"itens": [], "licenca": SONS.LICENCA}}))
    nomes = [n for n, _ in backup._candidatos(dados, tmp_path / "mem")]
    assert "armazenamento/saidas/p/v1/montagem.json" in nomes
    assert not any("cache" in n or n.endswith(".flac") for n in nomes)


def test_rota_de_arquivos_nao_serve_o_cache(tmp_path, dados, monkeypatch):
    from fastapi.testclient import TestClient
    from motor.api.app import criar
    cache = dados / "cache" / "sons_reais"
    cache.mkdir(parents=True)
    (cache / "101_abc.flac").write_bytes(b"fLaC")
    cli = TestClient(criar())
    for chave in ("cache/sons_reais/101_abc.flac", "cache/sons_reais/indice.sqlite"):
        assert cli.get(f"/v1/arquivos/{chave}").status_code == 403
    assert cli.get("/v1/arquivos/saidas/../cache/sons_reais/101_abc.flac").status_code in (400, 403, 404)


def test_entrega_e_montagem_registram_a_licenca(tmp_path, dados):
    from motor import config
    from motor.etapas import entrega
    from motor.provedores.armazenamento_local import ArmazenamentoLocal
    arm = ArmazenamentoLocal(config.carregar())
    assert entrega.licencas(arm, "saidas/p/v1") == []
    arm.gravar_json("saidas/p/v1/montagem.json", {"sons_reais": {"licenca": SONS.LICENCA, "itens": [
        {"id": "R01", "id_banco": 101, "pacote": "GDC 2024", "biblioteca": "Fake Nature", "nome": "AMB Creek", "item": "fake-gdc-2024",
         "url": "https://archive.org/download/x.wav"}]}})
    lic = entrega.licencas(arm, "saidas/p/v1")
    assert lic == [{"pacote": "GDC 2024", "biblioteca": "Fake Nature", "nome": "AMB Creek", "item": "fake-gdc-2024",
                    "licenca": "Sonniss #GameAudioGDC Bundle"}]
    assert set(SONS.LICENCA) == {"nome", "uso", "proibido", "fonte", "texto"} and "treinar IA" in SONS.LICENCA["proibido"]


def test_som_do_banco_nao_entra_na_biblioteca_da_casa():
    import inspect
    from motor import biblioteca
    from motor.etapas.montagem import trilha
    assert "sons_reais" not in inspect.getsource(biblioteca) and "sons_reais" not in inspect.getsource(trilha)
    fonte = inspect.getsource(SONS)
    assert "sintetizar" not in fonte and "biblioteca.registrar" not in fonte                     # nunca sintético no lugar
