"""Onda 3, frente B: regras da casa no Caderno (A3.26, A3.27, R19) e a linha do prazo da conversa (A3.29, R20). Sem rede."""
import json
import shutil

import pytest

from motor import banco, config
from motor.memoria.loja import Loja, id_vocabulario
from motor.memoria.semear import semear


@pytest.fixture()
def cli(dados, tmp_path, monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    destino = tmp_path / "memoria"
    shutil.copytree(config.MEMORIA, destino)
    monkeypatch.setenv("EDITOR_MEMORIA", str(destino))
    monkeypatch.delenv("MOTOR_TOKEN", raising=False)
    monkeypatch.setenv("EDITOR_CEREBRO", "fixture")
    from motor.api.app import criar
    con = banco.conectar(config.carregar().banco)
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado, dados) VALUES (?,?,?,?,?)", ("p_aaaa1111", "Feira de Natal", t, t, "{}"))
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v1','p_aaaa1111','entregue',?)", (t,))
    return TestClient(criar()), con, destino


def _reprovar(c, motivo):
    r = c.post("/v1/projetos/p_aaaa1111/versoes/v1/reprovar", json={"motivo": motivo})
    assert r.status_code == 200, r.text
    return r.json()


def _estado_banco(con):
    return (con.execute("SELECT COUNT(*) n FROM jobs").fetchone()["n"], con.execute("SELECT COUNT(*) n FROM eventos").fetchone()["n"],
            [tuple(x) for x in con.execute("SELECT id, projeto, estado FROM versoes ORDER BY projeto, id")])


def test_apagar_regra_some_de_tudo_e_reprovar_igual_traz_de_volta(cli):
    c, con, mem = cli
    r = _reprovar(c, "não é 'voando', é 'Ruan'")
    rid, cid = r["regra"]["id"], r["checagem"]["id"]
    voc = [v for v in c.get("/v1/memoria").json()["vocabulario"] if v.get("apagavel")]
    assert voc and voc[0]["id"] == id_vocabulario("voando")
    item = next(x for x in c.get("/v1/memoria").json()["regras"] if x["id"] == rid)
    assert item["apagavel"] is True and item["ao_apagar"] == "Deixa de valer nos próximos filmes. Nenhum filme é refeito."
    assert item["de_onde"]["projeto"] == "p_aaaa1111" and item["de_onde"]["nome"] == "Feira de Natal" and item["de_onde"]["versao"] == "v1"
    da_casa = next(x for x in c.get("/v1/memoria").json()["regras"] if not x["id"].startswith("r_dono_"))
    assert da_casa["apagavel"] is False and "ao_apagar" not in da_casa
    texto_regra = r["regra"]["texto"]
    assert texto_regra in Loja().regras_para_prompt()

    antes = _estado_banco(con)
    a = c.post(f"/v1/memoria/regras/{rid}/apagar", json={})
    assert a.status_code == 200 and a.json() == {"apagado": {"tipo": "regra", "id": rid, "texto": texto_regra}}
    assert rid not in {x["id"] for x in c.get("/v1/memoria").json()["regras"]}
    assert texto_regra not in Loja().regras_para_prompt()
    assert c.post(f"/v1/memoria/regras/{rid}/apagar", json={}).json()["detail"] == "essa regra não existe mais"
    # a checagem irmã continua até ser apagada; o vocabulário também
    assert cid in {x["id"] for x in Loja().checagens()}
    assert c.post(f"/v1/memoria/checagens/{cid}/apagar", json={}).status_code == 200
    assert cid not in {x["id"] for x in Loja().checagens()}
    vid = id_vocabulario("voando")
    v = c.post(f"/v1/memoria/vocabulario/{vid}/apagar", json={})
    assert v.status_code == 200 and v.json()["apagado"]["texto"] == "voando → Ruan"
    assert not any(x["de"] == "voando" for x in Loja().vocabulario())
    # A3.27: nada de job, versão ou evento novo
    assert _estado_banco(con) == antes
    lapide = json.loads((mem / "apagados.json").read_text())
    assert rid in lapide["regras"] and cid in lapide["checagens"] and vid in lapide["vocabulario"]
    # reprovar de novo com o mesmo motivo traz de volta (tira a lápide)
    _reprovar(c, "não é 'voando', é 'Ruan'")
    assert rid in {x["id"] for x in Loja().regras()} and cid in {x["id"] for x in Loja().checagens()}
    assert any(x["de"] == "voando" for x in Loja().vocabulario())
    lapide = json.loads((mem / "apagados.json").read_text())
    assert rid not in lapide["regras"] and cid not in lapide["checagens"] and vid not in lapide["vocabulario"]


def test_so_apaga_o_que_e_do_dono(cli):
    c, _, _ = cli
    for rota in ("regras/r_retencao", "regras/r_dono_0123abcz", "checagens/c_lufs", "vocabulario/creit", "vocabulario/v_0123"):
        r = c.post(f"/v1/memoria/{rota}/apagar", json={})
        assert r.status_code == 404 and r.json()["detail"] == "só dá para apagar o que nasceu de um ajuste seu", rota
    assert c.post("/v1/memoria/regras/r_dono_0123abcd/apagar", json={}).json()["detail"] == "essa regra não existe mais"
    assert c.post("/v1/memoria/checagens/c_dono_0123abcd/apagar", json={}).json()["detail"] == "essa conferência não existe mais"
    assert c.post("/v1/memoria/vocabulario/v_0123abcd/apagar", json={}).json()["detail"] == "essa palavra não existe mais"
    # palavra da casa (origem que não é do dono) não é apagável nem pelo id certo
    casa = [v for v in Loja().vocabulario() if not str(v.get("origem", "")).startswith("reprovação do dono")]
    if casa:
        vid = id_vocabulario(casa[0]["de"])
        assert c.post(f"/v1/memoria/vocabulario/{vid}/apagar", json={}).json()["detail"] == "essa palavra não existe mais"
        assert any(v["de"] == casa[0]["de"] for v in Loja().vocabulario())


def test_apagar_conferencia_recusa_com_qa_rodando_em_outro_projeto(cli):
    c, con, _ = cli
    cid = _reprovar(c, "ficou muito comprido e cansativo")["checagem"]["id"]
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado, dados) VALUES ('p_bbbb2222','outro',?,?,'{}')", (t, t))
    banco.enfileirar(con, "qa", "p_bbbb2222", "v1")
    r = c.post(f"/v1/memoria/checagens/{cid}/apagar", json={})
    assert r.status_code == 409 and r.json()["detail"] == "uma conferência ou entrega está rodando agora; apague quando ela terminar"
    assert cid in {x["id"] for x in Loja().checagens()}
    con.execute("UPDATE jobs SET estado='feito' WHERE projeto='p_bbbb2222'")
    assert c.post(f"/v1/memoria/checagens/{cid}/apagar", json={}).status_code == 200


def test_semear_respeita_a_lapide_e_id_do_vocabulario_estavel(tmp_path):
    g, v = tmp_path / "git", tmp_path / "volume"
    g.mkdir()
    regra = {"id": "r_dono_abcdef12", "texto": "x", "origem": "reprovação do dono · p_aaaa1111/v1 · 2026-11-20"}
    chec = {"id": "c_dono_abcdef12", "tipo": "duracao_max", "params": {"s": 60}, "origem": regra["origem"]}
    voc = {"de": "creit", "para": "creat", "origem": regra["origem"]}
    (g / "regras.json").write_text(json.dumps({"versao": "1", "regras": [regra], "vocabulario": [voc]}))
    (g / "checagens.json").write_text(json.dumps({"versao": "1", "checagens": [chec]}))
    semear(g, v)
    loja = Loja(v)
    assert [x["id"] for x in loja.itens_caderno()["vocabulario"]] == [id_vocabulario("creit")] * 1
    assert loja.itens_caderno()["vocabulario"][0]["id"] == Loja(v).itens_caderno()["vocabulario"][0]["id"]       # estável entre leituras
    loja.apagar("regra", "r_dono_abcdef12")
    loja.apagar("checagem", "c_dono_abcdef12")
    loja.apagar("vocabulario", id_vocabulario("creit"))
    lap = (v / "apagados.json").read_bytes()
    rel = semear(g, v)                        # o git ainda tem os três: a lápide do volume manda
    assert rel["apagados_respeitados"] == 3
    assert Loja(v).regras() == [] and Loja(v).checagens() == [] and Loja(v).vocabulario() == []
    assert json.loads((v / "regras.json").read_text())["regras"] == []
    assert (v / "apagados.json").read_bytes() == lap                  # o semear nunca sobrescreve a lápide
    assert not (g / "apagados.json").exists()


def test_retencao_dias_na_chave_da_conversa(dados, tmp_path, monkeypatch):
    """A3.29 (R20): 90 por padrão, 0 com a variável 0, 90 com valor inválido."""
    from conversa_util import preparar_ambiente
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    preparar_ambiente(dados, tmp_path, monkeypatch)
    from motor.api.app import criar
    for valor, esperado in ((None, 90), ("0", 0), ("abc", 90), ("-3", 90), ("30", 30)):
        if valor is None:
            monkeypatch.delenv("EDITOR_CONVERSA_RETENCAO_DIAS", raising=False)
        else:
            monkeypatch.setenv("EDITOR_CONVERSA_RETENCAO_DIAS", valor)
        assert config.carregar().retencao_conversa_dias == esperado
        with TestClient(criar()) as c:
            assert c.get("/v1/conversa").json()["retencao_dias"] == esperado
            assert c.post("/v1/conversa", json={"ligada": False}).json()["retencao_dias"] == esperado
