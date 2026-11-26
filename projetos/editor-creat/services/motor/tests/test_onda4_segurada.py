"""Onda 4, item 6 (frente SITE+API): o dono assiste à versão segurada pela conferência. Critérios 6.1, 6.2, 6.3 e 6.5.

A regra antiga continua: versão não entregue não baixa, não tem link e não vai para o cliente (`/v1/arquivos` 403). O que muda é
só assistir na tela, por uma rota própria, com os motivos em frase do dono.
"""
import io
import json
import pathlib
import re

import pytest

from motor import banco, config

QA = {"versao": "1", "projeto": "p1", "video": "saidas/p1/v1/final.mp4", "aprovado": False, "tempo_s": 40,
      "checagens": [
          {"id": "duracao", "ok": True, "bloqueia": True, "valor": {"video_s": 44.2, "edl_s": 44.2}},
          {"id": "fala_cortada", "ok": False, "bloqueia": True, "detalhe": "V3 cortada no fim",
           "valor": {"pecas": 9, "reprovadas": ["V3"], "problemas": [{"id": "V3", "onde": "fim", "t": 12.04, "fonte": "a003", "s": 81.3},
                                                                      {"id": "V7", "onde": "fim", "t": 31.5, "fonte": "a004", "s": 9.9}]}},
          {"id": "voz_externa", "ok": False, "bloqueia": True, "valor": {"achados": [{"id": "P2", "t": [6.6, 8.1], "fonte": "a009"}]}},
          {"id": "cobertura_sintonia", "ok": False, "bloqueia": True,
           "valor": {"coberturas": {"P4": {"trechos": [{"plano": "P4", "t0": 20.0, "t1": 22.5, "voz": "V5"}], "fracao_rosto": 0.8}}}},
          {"id": "frase_repetida", "ok": False, "bloqueia": True, "valor": [{"onde": "mix", "frase": "black do kal", "vezes": 3}]},
          {"id": "checagem_nova_x", "ok": False, "bloqueia": True},
          {"id": "legenda_sobre_rosto", "ok": False, "bloqueia": False, "valor": [{"t": 3.0}]},      # aviso: não segura
          {"id": "lufs", "ok": True, "bloqueia": True, "valor": -14.0},
      ]}


@pytest.fixture()
def cli(dados, monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    monkeypatch.delenv("MOTOR_TOKEN", raising=False)
    from motor.api.app import criar
    from motor.provedores import armazenamento_de
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, estado, criado, atualizado) VALUES ('p1','Super Kal - Black','reprovado_qa',?,?)", (t, t))
    for v, est in (("v1", "reprovada_qa"), ("v2", "entregue"), ("v3", "montada"), ("v4", "erro"), ("v5", "reprovada_qa")):
        con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES (?,?,?,?)", (v, "p1", est, t))
    con.close()
    arm = armazenamento_de(cfg)
    for v in ("v1", "v2", "v3", "v4"):
        arm.gravar(f"saidas/p1/{v}/final.mp4", io.BytesIO(bytes(range(256)) * 40))    # 10 240 bytes
    arm.gravar("saidas/p1/v1/qa.json", io.BytesIO(json.dumps(QA).encode()))
    return TestClient(criar())


def test_6_1_motivos_em_frase_do_dono_com_o_tempo_no_filme(cli):
    r = cli.get("/v1/projetos/p1/versoes/v1/segurada")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["versao"] == "v1" and d["estado"] == "reprovada_qa" and d["nao_entregue"] is True
    assert d["video"] == "/v1/projetos/p1/versoes/v1/segurada/video" and d["duracao"] == 44.2
    assert d["regra"] == "Só para assistir aqui. Não foi entregue: não baixa, não compartilha e não vai para o cliente."
    m = {x["id"]: x for x in d["motivos"]}
    assert list(m) == ["fala_cortada", "voz_externa", "cobertura_sintonia", "frase_repetida", "checagem_nova_x"]   # só o que segura
    assert m["fala_cortada"]["frase"] == "Uma fala foi cortada antes de terminar" and m["fala_cortada"]["quando"] == [12.0, 31.5]
    assert m["voz_externa"]["frase"] == "Dá para ouvir a voz de alguém que não devia estar no filme" and m["voz_externa"]["quando"] == [6.6]
    assert m["cobertura_sintonia"]["quando"] == [20.0]
    assert m["frase_repetida"]["frase"] == "Uma frase se repete no fundo, como em laço" and m["frase_repetida"]["quando"] is None
    assert m["checagem_nova_x"]["frase"] == "Uma conferência técnica não passou (checagem_nova_x)"
    assert "motor" not in json.dumps(d, ensure_ascii=False).lower()             # nada de jargão técnico na tela do dono


def test_6_1b_video_200_e_206_no_store_inline(cli):
    r = cli.get("/v1/projetos/p1/versoes/v1/segurada/video")
    assert r.status_code == 200 and len(r.content) == 10240
    h = r.headers
    assert h["content-type"] == "video/mp4" and h["content-disposition"] == "inline"
    assert "no-store" in h["cache-control"] and "private" in h["cache-control"] and "max-age" not in h["cache-control"]
    assert h["x-robots-tag"].startswith("noindex") and h["accept-ranges"] == "bytes"
    p = cli.get("/v1/projetos/p1/versoes/v1/segurada/video", headers={"range": "bytes=100-199"})
    assert p.status_code == 206 and p.content == (bytes(range(256)) * 40)[100:200] and p.headers["content-range"] == "bytes 100-199/10240"
    assert cli.get("/v1/projetos/p1/versoes/v1/segurada/video", headers={"range": "bytes=99999-"}).status_code == 416
    hd = cli.head("/v1/projetos/p1/versoes/v1/segurada/video")
    assert hd.status_code == 200 and hd.headers["content-length"] == "10240" and "no-store" in hd.headers["cache-control"]


def test_6_2_regra_antiga_intacta_e_409_fora_da_segurada(cli):
    for k in ("saidas/p1/v1/final.mp4", "saidas/p1/v3/final.mp4", "saidas/p1/v4/final.mp4"):
        r = cli.get(f"/v1/arquivos/{k}")
        assert r.status_code == 403 and "não foi entregue" in r.json()["detail"]
        assert cli.head(f"/v1/arquivos/{k}").status_code == 403
    for v in ("v2", "v3", "v4"):                      # entregue, montada e erro
        assert cli.get(f"/v1/projetos/p1/versoes/{v}/segurada").status_code == 409
        r = cli.get(f"/v1/projetos/p1/versoes/{v}/segurada/video")
        assert r.status_code == 409 and r.json()["detail"] == "esta versão não está segurada pela conferência"
        assert cli.head(f"/v1/projetos/p1/versoes/{v}/segurada/video").status_code == 409
    assert cli.get("/v1/projetos/p1/versoes/v9/segurada").status_code == 404
    assert cli.get("/v1/projetos/px/versoes/v1/segurada").status_code == 404
    assert cli.get("/v1/projetos/p1/versoes/v..1/segurada").status_code in (404, 422)


def test_6_2b_segurada_sem_video_410(cli):
    r = cli.get("/v1/projetos/p1/versoes/v5/segurada")
    assert r.status_code == 410 and r.json()["detail"] == "o vídeo desta versão não existe mais"
    assert cli.get("/v1/projetos/p1/versoes/v5/segurada/video").status_code == 410


def test_lista_de_versoes_marca_a_segurada_sem_dar_video_nem_link(cli):
    vs = {v["id"]: v for v in cli.get("/v1/projetos/p1/versoes").json()["versoes"]}
    assert vs["v1"]["segurada"] is True and vs["v1"]["video"] is None and vs["v1"]["link"] is None
    assert vs["v5"]["segurada"] is False                       # sem final.mp4
    assert vs["v2"]["segurada"] is False and vs["v3"]["segurada"] is False


def test_6_3_armazenamento_nao_local_409_nunca_307(cli, monkeypatch):
    from motor.provedores.armazenamento_local import ArmazenamentoLocal
    monkeypatch.setattr(ArmazenamentoLocal, "nome", "r2")
    for rota in ("/v1/projetos/p1/versoes/v1/segurada", "/v1/projetos/p1/versoes/v1/segurada/video"):
        r = cli.get(rota, follow_redirects=False)
        assert r.status_code == 409 and r.json()["detail"] == "assistir a versão segurada só funciona com o armazenamento local"
    assert cli.head("/v1/projetos/p1/versoes/v1/segurada/video", follow_redirects=False).status_code == 409


def test_6_5_nenhuma_frase_antiga_sobra_no_codigo():
    raiz = pathlib.Path(__file__).resolve().parents[3]       # projetos/editor-creat
    velhas = re.compile(r"ela não vai para o player|ainda não passou na conferência automática")
    achados = []
    for pasta in (raiz / "services" / "motor" / "motor", raiz / "apps" / "web" / "componentes", raiz / "apps" / "web" / "app",
                  raiz / "apps" / "web" / "scripts", raiz / "apps" / "web" / "lib"):
        for p in pasta.rglob("*"):
            if p.suffix in (".py", ".ts", ".tsx", ".mjs") and "node_modules" not in p.parts and velhas.search(p.read_text(encoding="utf-8")):
                achados.append(str(p.relative_to(raiz)))
    assert achados == []


def test_motivos_qa_unidades():
    from motor.api import motivos_qa as M
    assert M.quando({"t": 1.234}) == [1.2]
    assert M.quando([{"t": 5}, {"t": 5.4}, {"t": 7}]) == [5.0, 7.0]               # o mesmo segundo não repete
    assert M.quando({"s": 3, "s0": 4, "s1": 5}) is None                            # tempo de fonte não leva o player a lugar nenhum
    assert M.quando({"t": 99}, duracao=30) is None and M.quando({"pior_t": 4.04}) == [4.0]
    assert len(M.quando([{"t": float(i * 2)} for i in range(20)])) == M.MAX_QUANDO
    assert M.motivos(None) == [] and M.motivos({"checagens": "x"}) == []
    assert set(M.TABELA) >= {"fala_cortada", "voz_externa", "cobertura_sintonia", "frase_repetida", "tom_sala_sem_voz", "legenda_x_fala"}
    from motor.etapas.qa import CHECAGENS
    assert set(CHECAGENS) <= set(M.TABELA)                                         # toda checagem da conferência tem frase
