"""Item F: link de aprovação do cliente (token só em hash, validade, revogação, uma resposta, nada além da versão)."""
import hashlib
import io

import pytest

from motor import banco, config


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
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado) VALUES ('p1','Super Kal cerveja',?,?)", (t, t))
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v1','p1','entregue',?)", (t,))
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v2','p1','montando',?)", (t,))
    arm = armazenamento_de(cfg)
    arm.gravar("saidas/p1/v1/final.mp4", io.BytesIO(b"0123456789"))
    arm.gravar("saidas/p1/v1/capa.jpg", io.BytesIO(b"jpg"))
    arm.gravar("saidas/p1/v1/mix.wav", io.BytesIO(b"wav"))
    c = TestClient(criar())
    c.con = con
    return c


def _gerar(cli, v="v1", **corpo):
    r = cli.post(f"/v1/projetos/p1/versoes/{v}/link-cliente", json=corpo)
    return r


def test_gera_so_em_versao_entregue_e_guarda_so_o_hash(cli):
    assert _gerar(cli, "v2").status_code == 409
    assert _gerar(cli, "v9").status_code == 404
    r = _gerar(cli, dias=3)
    assert r.status_code == 201
    d = r.json()
    assert len(d["token"]) == 43 and d["caminho"] == f"/c/{d['token']}" and d["titulo"] == "Super Kal cerveja"
    linha = dict(cli.con.execute("SELECT * FROM links_cliente").fetchone())
    assert d["token"] not in str(linha) and linha["hash"] == hashlib.sha256(d["token"].encode()).hexdigest()
    lst = cli.get("/v1/projetos/p1/links-cliente").json()["links"]
    assert lst[0]["ativo"] and "hash" not in lst[0] and "token" not in lst[0]
    assert _gerar(cli, dias=31).status_code == 422


def test_pagina_publica_mostra_so_a_versao(cli):
    tok = _gerar(cli).json()["token"]
    r = cli.get(f"/v1/cliente/{tok}")
    assert r.status_code == 200 and r.json()["versao"] == "v1" and r.json()["pode_responder"]
    assert set(r.json()) == {"titulo", "versao", "expira", "resposta", "texto", "respondido", "pode_responder", "capa"} and r.json()["capa"]
    v = cli.get(f"/v1/cliente/{tok}/video", headers={"range": "bytes=2-4"})
    assert v.status_code == 206 and v.content == b"234"
    assert cli.get(f"/v1/cliente/{tok}/capa").content == b"jpg"
    assert cli.get(f"/v1/cliente/{tok}/mix").status_code == 422           # só vídeo e capa
    assert cli.get(f"/v1/cliente/{tok}/..%2F..%2Fbanco").status_code in (404, 422)
    assert cli.get("/v1/cliente/" + "A" * 43).status_code == 404
    assert cli.get("/v1/cliente/curto").status_code == 404
    eventos = [e["mensagem"] for e in banco.eventos_desde(cli.con, "p1")]
    assert sum("abriu o link" in (m or "") for m in eventos) == 1             # só a primeira visita vira evento


def test_responde_uma_vez_e_vira_pedido_do_caderno_sem_regra(cli):
    from motor.memoria.loja import Loja
    regras_antes = len(Loja().regras())
    tok = _gerar(cli).json()["token"]
    assert cli.post(f"/v1/cliente/{tok}/responder", json={"acao": "ajuste", "texto": " "}).status_code == 422
    r = cli.post(f"/v1/cliente/{tok}/responder", json={"acao": "ajuste", "texto": "Trocar\x07 a música   do fim", "nome": "Lavínia"})
    assert r.status_code == 200 and r.json()["resposta"] == "ajuste"
    assert cli.post(f"/v1/cliente/{tok}/responder", json={"acao": "aprovar"}).status_code == 409
    pub = cli.get(f"/v1/cliente/{tok}").json()
    assert pub["resposta"] == "ajuste" and pub["texto"] == "Trocar a música do fim" and not pub["pode_responder"]
    pedidos = cli.get("/v1/clientes").json()["respostas"]
    assert pedidos[0]["texto"] == "Trocar a música do fim" and pedidos[0]["projeto_nome"] == "Super Kal cerveja" and not pedidos[0]["tratado"]
    assert cli.post(f"/v1/clientes/{pedidos[0]['id']}/tratar").json()["tratado"]
    assert len(Loja().regras()) == regras_antes                              # nunca vira regra sem o dono
    msgs = [e["mensagem"] for e in banco.eventos_desde(cli.con, "p1")]
    assert any("Lavínia) pediu ajuste na v1" in (m or "") for m in msgs)


def test_limite_de_tentativas(cli):
    tok = _gerar(cli).json()["token"]
    for _ in range(6):
        assert cli.post(f"/v1/cliente/{tok}/responder", json={"acao": "ajuste", "texto": ""}).status_code == 422
    assert cli.post(f"/v1/cliente/{tok}/responder", json={"acao": "aprovar"}).status_code == 429
    assert cli.get(f"/v1/cliente/{tok}").json()["pode_responder"] is False


def test_revogar_trocar_e_versao_retirada_fecham_o_link(cli):
    a = _gerar(cli).json()
    b = _gerar(cli).json()                                                  # novo link revoga o anterior
    assert cli.get(f"/v1/cliente/{a['token']}").status_code == 410
    assert cli.get(f"/v1/cliente/{a['token']}/video").status_code == 410
    assert cli.get(f"/v1/cliente/{b['token']}").status_code == 200
    cli.con.execute("UPDATE versoes SET estado='reprovada' WHERE id='v1'")    # o dono reprovou depois
    assert cli.get(f"/v1/cliente/{b['token']}").status_code == 410
    assert cli.post(f"/v1/cliente/{b['token']}/responder", json={"acao": "aprovar"}).status_code == 410
    cli.con.execute("UPDATE versoes SET estado='entregue' WHERE id='v1'")
    assert cli.post(f"/v1/clientes/{b['id']}/revogar").json()["ativo"] is False
    assert cli.get(f"/v1/cliente/{b['token']}").status_code == 410
    assert cli.post("/v1/clientes/lc_zz/revogar").status_code == 422


def test_link_vencido(cli):
    tok = _gerar(cli, dias=1).json()["token"]
    cli.con.execute("UPDATE links_cliente SET expira='2020-01-01T00:00:00Z'")
    assert cli.get(f"/v1/cliente/{tok}").status_code == 410


def test_reprovar_fecha_o_link_de_vez_e_texto_sem_invisiveis(cli):
    from motor import cliente
    tok = _gerar(cli).json()["token"]
    assert cliente.revogar_versao(cli.con, "p1", "v1") == 1                 # o que a rota de reprovar chama
    assert cli.get(f"/v1/cliente/{tok}").status_code == 410                 # mesmo com a versão ainda entregue
    tok = _gerar(cli).json()["token"]
    cli.post(f"/v1/cliente/{tok}/responder", json={"acao": "ajuste", "texto": "troca‮ a​ cor"})
    assert cli.get(f"/v1/cliente/{tok}").json()["texto"] == "troca a cor"
