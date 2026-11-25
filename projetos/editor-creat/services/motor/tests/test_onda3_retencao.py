"""Onda 3, frente B: prazo de guarda das conversas (A3.28). Sem rede: banco semeado à mão, relógio passado por parâmetro."""
import json
import time

import pytest

from motor import banco, config, worker
from motor.conversa import retencao

DIA = 86400


def _iso(t):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


def _semear(con, pid, agora):
    """Capítulo 1 fechado há 100 dias, 2 fechado há 10 dias, 3 aberto com pergunta pendente. Eventos da conversa e da mesa
    em cada período."""
    t = _iso(agora)
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado, dados) VALUES (?,?,?,?,?)", (pid, pid, t, t, "{}"))
    marcos = [(agora - 130 * DIA, agora - 100 * DIA), (agora - 100 * DIA, agora - 10 * DIA), (agora - 10 * DIA, None)]
    for n, (ini, fim) in enumerate(marcos, 1):
        con.execute("INSERT INTO conversa_capitulos (projeto, capitulo, modelo, prompt_versao, ferramentas_versao, system_json, tools_json, "
                    "criado, fechado) VALUES (?,?,?,?,?,?,?,?,?)", (pid, n, "m", "nimbus-2", "2", "[]", "[]", _iso(ini), _iso(fim) if fim else None))
        for k in range(3):
            con.execute("INSERT INTO conversa_msgs (projeto, capitulo, papel, conteudo, turno, criado) VALUES (?,?,?,?,?,?)",
                        (pid, n, "user", json.dumps([{"type": "text", "text": f"c{n} m{k}"}]), f"t_cap{n}aaaaa", _iso(ini + 60 + k)))
        meio = ini + 120
        for tipo in ("fala_dono", "fala_editor", "ferramenta", "turno_fim", "mostrar", "pergunta", "confirmacao", "resposta"):
            con.execute("INSERT INTO eventos (projeto, ts, tipo, dados) VALUES (?,?,?,?)", (pid, _iso(meio), tipo, json.dumps({"turno": f"t_cap{n}aaaaa"})))
        con.execute("INSERT INTO eventos (projeto, ts, tipo, dados) VALUES (?,?,?,?)", (pid, _iso(meio), "aviso", json.dumps({"acao": "retomar", "turno": "t_x"})))
        for tipo in ("etapa_inicio", "etapa_fim", "passo", "decisao", "estado", "cliente"):
            con.execute("INSERT INTO eventos (projeto, ts, tipo, mensagem, dados) VALUES (?,?,?,?,?)", (pid, _iso(meio), tipo, "mesa", "{}"))
        con.execute("INSERT INTO eventos (projeto, ts, tipo, mensagem) VALUES (?,?,?,?)", (pid, _iso(meio), "aviso", "um vídeo ficou de fora"))
    con.execute("INSERT INTO conversa_espera (projeto, tipo, tool_use_id, turno, cartao, desde) VALUES (?,?,?,?,?,?)",
                (pid, "pergunta", "toolu_p", "t_cap3aaaaa", "{}", _iso(agora - DIA)))


def _contar(con, pid):
    caps = [r["capitulo"] for r in con.execute("SELECT capitulo FROM conversa_capitulos WHERE projeto=? ORDER BY capitulo", (pid,))]
    msgs = {r["capitulo"]: r["n"] for r in con.execute("SELECT capitulo, COUNT(*) n FROM conversa_msgs WHERE projeto=? GROUP BY capitulo", (pid,))}
    conv = con.execute("SELECT COUNT(*) n FROM eventos WHERE projeto=? AND (tipo IN ('fala_dono','fala_editor','ferramenta','turno_fim','mostrar',"
                       "'pergunta','confirmacao','resposta') OR (tipo='aviso' AND dados LIKE '%retomar%'))", (pid,)).fetchone()["n"]
    mesa = con.execute("SELECT COUNT(*) n FROM eventos WHERE projeto=? AND (tipo IN ('etapa_inicio','etapa_fim','passo','decisao','estado','cliente') "
                       "OR (tipo='aviso' AND dados IS NULL))", (pid,)).fetchone()["n"]
    espera = con.execute("SELECT COUNT(*) n FROM conversa_espera WHERE projeto=?", (pid,)).fetchone()["n"]
    return caps, msgs, conv, mesa, espera


@pytest.fixture()
def con(dados):
    c = banco.conectar(config.carregar().banco)
    yield c
    c.close()


def test_apaga_so_o_capitulo_vencido(con):
    agora = time.time()
    _semear(con, "p_aaaa1111", agora)
    _semear(con, "p_bbbb2222", agora)
    assert _contar(con, "p_aaaa1111") == ([1, 2, 3], {1: 3, 2: 3, 3: 3}, 27, 21, 1)
    r = retencao.volta(con, agora, dias=90)
    assert r == {"capitulos": 2, "mensagens": 6, "eventos": 18, "pulados": 0}
    for pid in ("p_aaaa1111", "p_bbbb2222"):
        caps, msgs, conv, mesa, espera = _contar(con, pid)
        assert caps == [2, 3] and msgs == {2: 3, 3: 3} and conv == 18      # só o capítulo 1 saiu
        assert mesa == 21 and espera == 1                                   # mesa e pergunta pendente intactas
    assert retencao.volta(con, agora, dias=90) == {"capitulos": 0, "mensagens": 0, "eventos": 0, "pulados": 0}     # idempotente
    assert not con.in_transaction


def test_zero_guarda_para_sempre(con, monkeypatch):
    agora = time.time()
    _semear(con, "p_aaaa1111", agora)
    monkeypatch.setenv("EDITOR_CONVERSA_RETENCAO_DIAS", "0")
    assert retencao.volta(con, agora) == {"capitulos": 0, "mensagens": 0, "eventos": 0, "pulados": 0}
    assert _contar(con, "p_aaaa1111")[0] == [1, 2, 3]
    monkeypatch.setenv("EDITOR_CONVERSA_RETENCAO_DIAS", "5")          # lido do ambiente: 5 dias apaga os dois fechados
    assert retencao.volta(con, agora)["capitulos"] == 2
    assert _contar(con, "p_aaaa1111")[0] == [3]


def test_espera_ligada_a_capitulo_vencido_pula_o_projeto(con):
    agora = time.time()
    _semear(con, "p_aaaa1111", agora)
    con.execute("UPDATE conversa_espera SET turno='t_cap1aaaaa' WHERE projeto='p_aaaa1111'")
    r = retencao.volta(con, agora, dias=90)
    assert r["pulados"] == 1 and r["capitulos"] == 0
    assert _contar(con, "p_aaaa1111")[0] == [1, 2, 3] and not con.in_transaction


def test_volta_que_quebra_nao_derruba_o_worker(con, monkeypatch, capsys):
    agora = time.time()
    _semear(con, "p_aaaa1111", agora)

    def quebra(c, a=None):
        c.execute("BEGIN IMMEDIATE")
        raise RuntimeError("disco cheio (teste)")
    monkeypatch.setattr(retencao, "volta", quebra)
    out = worker.limpezas(con, agora)
    assert out["retencao"] == {"erro": True} and "apagar" in out and "erro" not in (out["apagar"] or {})
    assert not con.in_transaction                                    # a conexão saiu da transação
    assert "disco cheio" in capsys.readouterr().err
    assert worker.periodicas.__code__.co_varnames[:2] == ("con", "agora")    # periodicas() não mudou de forma


def test_limpezas_roda_a_retencao_de_verdade(con):
    agora = time.time()
    _semear(con, "p_aaaa1111", agora)
    out = worker.limpezas(con, agora + 0)
    assert out["retencao"]["capitulos"] == 1 and _contar(con, "p_aaaa1111")[0] == [2, 3]
