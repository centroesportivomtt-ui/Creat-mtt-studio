"""Aceites A1 do motor da conversa: o laço do Nimbus com o cérebro falso (sem rede, sem chave).

Cobre: turno com texto, com ferramenta, pergunta que pausa e retoma, erro da API, teto do dia, limite de voltas,
mensagem durante o turno, Parar, recusa, max_tokens, teste de ouro do histórico (A1.5) e o corpo enviado (A1.16).
"""
import json
import threading
import time

import pytest

from conversa_util import (app_conversa, conferir_eventos_da_conversa, con, esperar, esperar_fim, eventos, ferramenta,  # noqa: F401
                           gravar_gasto, mandar, novo_projeto, texto)
from motor import config
from motor.conversa import falso, ferramentas, repo


def _ultimo_user(corpo):
    return corpo["messages"][-1]["content"]


def test_turno_so_com_texto_grava_custo_e_eventos(app_conversa):
    f = falso.instalar([{"blocos": [{"tipo": "thinking", "texto": "olhando"}, {"tipo": "texto", "texto": "Entendi: oi. Tudo certo por aqui."}]}])
    with app_conversa() as c:
        pid = novo_projeto(c)
        r = mandar(c, pid, "oi")
        assert r.status_code == 202 and r.json()["na_fila"] is False and r.json()["turno"].startswith("t_")
        fim = esperar_fim(pid)[0]["dados"]
        assert fim["stop"] == "end_turn" and fim["custo_usd"] > 0 and fim["tokens"]["cache_lida"] == 20000
        falas = eventos(pid, "fala_editor")
        assert [e["dados"]["texto"] for e in falas] == ["Entendi: oi. Tudo certo por aqui."]
        conferir_eventos_da_conversa(pid)
        linhas = [json.loads(x) for x in (config.carregar().dados / "gastos.jsonl").read_text().splitlines()]
        assert [x["o_que"] for x in linhas] == ["conversa"] and linhas[0]["ref"] == r.json()["turno"]
        assert abs(linhas[0]["custo_usd"] - fim["custo_usd"]) < 1e-6
        # a chamada: modelo, thinking adaptativo com andamento, esforço explícito, cache 1 h, fallbacks, sem tool_choice
        corpo = f.pedidos[0]
        assert corpo["model"] == "claude-opus-5-5" and corpo["thinking"] == {"type": "adaptive", "display": "updates"}
        assert corpo["output_config"] == {"effort": "medium"} and corpo["fallbacks"] == "default"
        assert corpo["cache_control"] == {"type": "ephemeral", "ttl": "1h"} and corpo["system"][0]["cache_control"]["ttl"] == "1h"
        assert "tool_choice" not in corpo and corpo["max_tokens"] == 8000
        # o assistant guardado é o conteúdo exato (thinking + signature)
        k = con()
        a = [ln for ln in repo.linhas(k, pid, 1) if ln["papel"] == "assistant"][0]
        k.close()
        assert a["conteudo"][0] == {"type": "thinking", "thinking": "olhando", "signature": falso.SIG}


def test_andamento_desligado_tira_display_e_beta(app_conversa, monkeypatch):
    monkeypatch.setenv("EDITOR_CONVERSA_ANDAMENTO", "0")
    f = falso.instalar([texto("ok")])
    with app_conversa() as c:
        pid = novo_projeto(c)
        mandar(c, pid, "oi")
        esperar_fim(pid)
    assert f.pedidos[0]["thinking"] == {"type": "adaptive"}


def test_ferramenta_tem_inicio_e_fim_e_historico_volta_certo(app_conversa):
    """A1.4 e A1.5: cada ferramenta tem 'inicio' e 'fim' pelo tool_use_id; a requisição N+1 começa com a N."""
    f = falso.instalar([ferramenta("ver_projeto", {}, antes="Vou olhar."), texto("O projeto está recebendo material.")])
    with app_conversa() as c:
        pid = novo_projeto(c)
        mandar(c, pid, "como está?")
        assert esperar_fim(pid)[0]["dados"]["stop"] == "end_turn"
        fer = eventos(pid, "ferramenta")
        assert [e["dados"]["fase"] for e in fer] == ["inicio", "fim"]
        assert fer[0]["dados"]["tool_use_id"] == fer[1]["dados"]["tool_use_id"] and fer[1]["dados"]["resumo"] == "Olhou o projeto"
        conferir_eventos_da_conversa(pid)
    a, b = f.pedidos
    assert b["messages"][:len(a["messages"])] == a["messages"]                     # prefixo igual (ouro)
    assert json.dumps(a["system"]) == json.dumps(b["system"]) and json.dumps(a["tools"]) == json.dumps(b["tools"])
    res = _ultimo_user(b)[0]
    assert res["type"] == "tool_result" and json.loads(res["content"])["estado"] == "recebendo"
    # o resultado traz o 'pode' da guarda e marca nome de arquivo como de_fora
    assert set(json.loads(res["content"])["pode"]) >= {"propor_ajuste", "propor_pedido"}


def test_corpo_sem_limites_nem_tool_choice_e_entrada_invalida_nao_executa(app_conversa, monkeypatch):
    """A1.16: nenhum maxLength/minLength/maxItems/minItems/minimum/maximum/pattern sai no corpo; entrada que fere um limite
    vira tool_result de erro e nada executa. A1.12: 'projeto' na entrada é recusado pelo esquema."""
    chamadas = []
    original = ferramentas.EXECUTORES["ver_material"]
    monkeypatch.setitem(ferramentas.EXECUTORES, "ver_material", lambda *a: chamadas.append(a) or original(*a))
    f = falso.instalar([ferramenta("ver_material", {"busca": "x" * 200}), ferramenta("ver_projeto", {"projeto": "p_outro"}), texto("ok")])
    with app_conversa() as c:
        pid = novo_projeto(c)
        mandar(c, pid, "procura")
        esperar_fim(pid)
        fer = eventos(pid, "ferramenta")
        assert [e["dados"]["fase"] for e in fer] == ["inicio", "erro", "inicio", "erro"]
    assert chamadas == []
    bruto = json.dumps(f.pedidos[0]["tools"])
    for proibido in ('"maxLength"', '"minLength"', '"maxItems"', '"minItems"', '"minimum"', '"maximum"', '"pattern"'):
        assert proibido not in bruto
    # 27/11: strict só nas que mudam algo (a API recusa mais de 24 opcionais somados nas strict); as livres validam aqui
    for t in f.pedidos[0]["tools"]:
        assert t.get("strict", False) is ferramentas._strict(t["name"])
    assert sum(ferramentas.opcionais(t["input_schema"]) for t in f.pedidos[0]["tools"] if t.get("strict")) <= ferramentas.LIMITE_OPCIONAIS_STRICT
    assert [t["name"] for t in f.pedidos[0]["tools"]] == sorted(t["name"] for t in f.pedidos[0]["tools"])
    for p in f.pedidos:
        assert "tool_choice" not in p
    r1 = _ultimo_user(f.pedidos[1])[0]
    assert r1["is_error"] is True and json.loads(r1["content"])["erro"] == "entrada_invalida"
    r2 = _ultimo_user(f.pedidos[2])[0]
    assert r2["is_error"] is True and "projeto" in json.loads(r2["content"])["detalhe"]


def test_pergunta_pausa_e_resposta_por_botao_continua(app_conversa):
    """A1.3: a pergunta pausa o turno; o toque emite 'resposta' e o turno continua com o tool_result primeiro."""
    perg = {"texto": "Começo pelo gancho?", "aceita_texto": False, "sugestao": "sim",
            "opcoes": [{"id": "sim", "rotulo": "Pelo gancho", "efeito": "abre forte"}, {"id": "nao", "rotulo": "Pela fala"}]}
    f = falso.instalar([ferramenta("perguntar", perg, antes="Entendi. Uma dúvida:", id_="toolu_perg1"), texto("Combinado: pelo gancho.")])
    with app_conversa() as c:
        pid = novo_projeto(c)
        t = mandar(c, pid, "faz o reel").json()["turno"]
        assert esperar_fim(pid)[0]["dados"]["stop"] == "pausa"
        p = eventos(pid, "pergunta")[0]["dados"]
        assert p["tool_use_id"] == "toolu_perg1" and p["turno"] == t and len(p["opcoes"]) == 2 and p["sugestao"] == "sim"
        assert c.get("/v1/conversa").json()["esperando"][0]["tipo"] == "pergunta"
        sse = c.get(f"/v1/projetos/{pid}/eventos?v=2&seguir=false").text
        inst = json.loads(sse.split("event: instantaneo\ndata: ", 1)[1].split("\n", 1)[0])
        assert inst["dados"]["espera"] == {"tipo": "pergunta", "tool_use_id": "toolu_perg1"} and "turno_rodando" not in inst["dados"]
        assert [x["espera"] for x in c.get("/v1/projetos").json() if x["id"] == pid] == ["pergunta"]
        base = f"/v1/projetos/{pid}/conversa/responder"
        assert c.post(base, json={"tool_use_id": "toolu_perg1", "escolha_id": "talvez"}).status_code == 422
        assert c.post(base, json={"tool_use_id": "toolu_perg1", "texto": "do meu jeito"}).status_code == 422   # aceita_texto=false
        assert c.post(base, json={"tool_use_id": "toolu_outro", "escolha_id": "sim"}).status_code == 404
        r = c.post(base, json={"tool_use_id": "toolu_perg1", "escolha_id": "sim"})
        assert r.status_code == 202 and r.json()["turno"] == t
        fins = esperar_fim(pid, 2)
        assert fins[1]["dados"]["stop"] == "end_turn" and fins[1]["dados"]["turno"] == t
        assert c.post(base, json={"tool_use_id": "toolu_perg1", "escolha_id": "sim"}).status_code == 409
        resp = eventos(pid, "resposta")[0]["dados"]
        assert resp == {"tool_use_id": "toolu_perg1", "tipo": "pergunta", "por": "dono", "escolha_id": "sim"}
        assert [x["espera"] for x in c.get("/v1/projetos").json() if x["id"] == pid] == [None]
        conferir_eventos_da_conversa(pid)
    ult = _ultimo_user(f.pedidos[1])
    assert ult[0]["type"] == "tool_result" and json.loads(ult[0]["content"]) == {"por": "dono", "escolha_id": "sim", "rotulo": "Pelo gancho"}
    assert f.pedidos[1]["messages"][:len(f.pedidos[0]["messages"])] == f.pedidos[0]["messages"]


def test_mensagem_livre_responde_a_pergunta_pendente(app_conversa):
    """A1.18 (pergunta pendente + mensagem livre): a resposta vira {por: mensagem} e o texto segue junto; histórico válido."""
    perg = {"texto": "Qual música?", "aceita_texto": True, "opcoes": []}
    f = falso.instalar([ferramenta("perguntar", perg, id_="toolu_p2"), texto("Certo, sem música.")])
    with app_conversa() as c:
        pid = novo_projeto(c)
        mandar(c, pid, "faz")
        esperar_fim(pid)
        mandar(c, pid, "sem música")
        assert esperar_fim(pid, 2)[1]["dados"]["stop"] == "end_turn"
        assert eventos(pid, "resposta")[0]["dados"]["por"] == "mensagem"
        conferir_eventos_da_conversa(pid)
    ult = _ultimo_user(f.pedidos[1])
    assert ult[0]["type"] == "tool_result" and json.loads(ult[0]["content"])["por"] == "mensagem"
    assert ult[1]["type"] == "text" and ult[1]["text"] == "sem música"


def test_mensagem_durante_o_turno_entra_na_fila_depois_do_tool_result(app_conversa):
    """A1.6: mensagem no meio do turno vira 'na fila' e entra depois dos tool_result, sem editar o que já foi enviado."""
    longo = "Vou olhar o projeto com calma, trecho por trecho, antes de responder a você. " * 3
    f = falso.instalar([dict(ferramenta("ver_projeto", {}, antes=longo), atraso=0.04), texto("Visto. E sobre o que você mandou: ok.")])
    with app_conversa() as c:
        pid = novo_projeto(c)
        t = mandar(c, pid, "olha o projeto").json()["turno"]
        esperar(lambda: eventos(pid, "fala_dono") and len(f.pedidos) == 1)
        time.sleep(0.2)
        r = mandar(c, pid, "e tira a música")
        assert r.status_code == 202 and r.json() == {"turno": t, "na_fila": True}
        assert esperar_fim(pid)[0]["dados"]["stop"] == "end_turn"
        assert eventos(pid, "fala_dono")[1]["dados"]["na_fila"] is True
        conferir_eventos_da_conversa(pid)
    a, b = f.pedidos
    assert b["messages"][:len(a["messages"])] == a["messages"]
    ult = _ultimo_user(b)
    assert [x["type"] for x in ult] == ["tool_result", "text"] and ult[1]["text"] == "e tira a música"


def test_mensagem_na_fila_depois_de_resposta_sem_ferramenta_abre_mais_uma_volta(app_conversa):
    f = falso.instalar([dict(texto("Resposta longa " * 30), atraso=0.03), texto("Agora sobre a segunda.")])
    with app_conversa() as c:
        pid = novo_projeto(c)
        mandar(c, pid, "primeira")
        esperar(lambda: len(f.pedidos) == 1)
        time.sleep(0.15)
        assert mandar(c, pid, "segunda").json()["na_fila"] is True
        assert esperar_fim(pid)[0]["dados"]["stop"] == "end_turn"
    assert len(f.pedidos) == 2
    b = f.pedidos[1]["messages"]
    assert [m["role"] for m in b] == ["user", "assistant", "user"] and b[-1]["content"][0]["text"] == "segunda"


def test_erro_da_api_fecha_o_turno_com_erro_e_historico_continua_valido(app_conversa):
    f = falso.instalar([ferramenta("ver_projeto", {}), {"erro": 500}, texto("voltei")])
    with app_conversa() as c:
        pid = novo_projeto(c)
        mandar(c, pid, "oi")
        fim = esperar_fim(pid)[0]["dados"]
        assert fim["stop"] == "erro" and "não respondeu" in fim["detalhe"]
        mandar(c, pid, "e agora?")
        assert esperar_fim(pid, 2)[1]["dados"]["stop"] == "end_turn"
        conferir_eventos_da_conversa(pid)
    assert f.conferir(f.pedidos[-1]) is None


def test_limite_de_voltas(app_conversa):
    falso.instalar([ferramenta("ver_projeto", {}) for _ in range(12)])
    with app_conversa() as c:
        pid = novo_projeto(c)
        mandar(c, pid, "olha tudo")
        fim = esperar_fim(pid, timeout=20)[0]["dados"]
        assert fim["stop"] == "limite"
        f2 = falso.instalar([texto("ok")])
        mandar(c, pid, "e aí")
        assert esperar_fim(pid, 2)[1]["dados"]["stop"] == "end_turn"
    assert f2.conferir(f2.pedidos[0]) is None


def test_max_tokens_com_ferramenta_cortada_nao_executa(app_conversa, monkeypatch):
    chamadas = []
    monkeypatch.setitem(ferramentas.EXECUTORES, "ver_projeto", lambda *a: chamadas.append(1) or ({}, "", None))
    falso.instalar([{"blocos": [{"tipo": "texto", "texto": "vou"}, {"tipo": "ferramenta", "nome": "ver_projeto", "bruto": ""}], "stop": "max_tokens"}])
    with app_conversa() as c:
        pid = novo_projeto(c)
        mandar(c, pid, "oi")
        assert esperar_fim(pid)[0]["dados"]["stop"] == "limite"
        assert [e["dados"]["fase"] for e in eventos(pid, "ferramenta")] == ["inicio", "erro"]
        f2 = falso.instalar([texto("ok")])
        mandar(c, pid, "de novo")
        assert esperar_fim(pid, 2)[1]["dados"]["stop"] == "end_turn"
    assert chamadas == [] and f2.conferir(f2.pedidos[0]) is None
    tr = _ultimo_user(f2.pedidos[0])[0]
    assert tr["is_error"] is True and "max_tokens" in tr["content"]


def test_recusa_fecha_com_recusa_e_nao_executa(app_conversa):
    falso.instalar([{"blocos": [{"tipo": "ferramenta", "nome": "ver_projeto", "entrada": {}}], "stop": "refusal"}])
    with app_conversa() as c:
        pid = novo_projeto(c)
        mandar(c, pid, "oi")
        assert esperar_fim(pid)[0]["dados"]["stop"] == "recusa"
        f2 = falso.instalar([texto("ok")])
        mandar(c, pid, "de novo")
        assert esperar_fim(pid, 2)[1]["dados"]["stop"] == "end_turn"
    tr = _ultimo_user(f2.pedidos[0])[0]
    assert tr["type"] == "tool_result" and tr["is_error"] is True and "recusa" in tr["content"]


def test_parar_durante_ferramenta(app_conversa, monkeypatch):
    """A1.18 (Parar durante ferramenta): turno_fim 'parado'; a próxima requisição tem tool_result para o tool_use."""
    liberar = threading.Event()

    def lenta(*a):
        liberar.wait(5)
        return {}, "Olhou o projeto", None
    monkeypatch.setitem(ferramentas.EXECUTORES, "ver_projeto", lenta)
    falso.instalar([ferramenta("ver_projeto", {}, antes="Olhando.")])
    with app_conversa() as c:
        pid = novo_projeto(c)
        mandar(c, pid, "oi")
        esperar(lambda: [e for e in eventos(pid, "ferramenta") if e["dados"]["fase"] == "inicio"])
        assert c.post(f"/v1/projetos/{pid}/conversa/parar", json={}).json() == {"parou": True}
        fim = esperar_fim(pid)[0]["dados"]
        assert fim["stop"] == "parado"
        assert c.post(f"/v1/projetos/{pid}/conversa/parar", json={}).json() == {"parou": False}
        liberar.set()
        f2 = falso.instalar([texto("ok")])
        mandar(c, pid, "continua")
        assert esperar_fim(pid, 2)[1]["dados"]["stop"] == "end_turn"
        conferir_eventos_da_conversa(pid)
    tr = _ultimo_user(f2.pedidos[0])[0]
    assert tr["type"] == "tool_result" and tr["is_error"] is True and "parado" in tr["content"]


def test_parar_no_meio_do_texto_estima_o_custo(app_conversa):
    falso.instalar([dict(texto("palavra " * 200), atraso=0.03)])
    with app_conversa() as c:
        pid = novo_projeto(c)
        mandar(c, pid, "fala muito")
        esperar(lambda: len(falso.ATIVO.pedidos) == 1)
        time.sleep(0.5)
        c.post(f"/v1/projetos/{pid}/conversa/parar", json={})
        fim = esperar_fim(pid)[0]["dados"]
        assert fim["stop"] == "parado" and fim["estimado"] is True and fim["custo_usd"] > 0 and fim["texto_parcial"].startswith("palavra")
        linhas = [json.loads(x) for x in (config.carregar().dados / "gastos.jsonl").read_text().splitlines()]
        assert linhas[-1]["o_que"] == "conversa" and linhas[-1]["estimado"] is True
        assert not eventos(pid, "fala_editor")          # o bloco interrompido não vira fala gravada; fica em texto_parcial


def test_teto_do_dia_fecha_sem_chamar_a_api(app_conversa):
    """A1.8: US$ 2,90 de conversa hoje (Bahia) -> o pré-voo fecha com 'teto' sem chamar a API; com US$ 3,00 -> 429."""
    f = falso.instalar([texto("não devia")])
    with app_conversa() as c:
        cfg = config.carregar()
        gravar_gasto(cfg, 2.90, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        gravar_gasto(cfg, 5.00, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), o_que="direcao")   # direção não conta
        pid = novo_projeto(c)
        assert mandar(c, pid, "oi").status_code == 202
        fim = esperar_fim(pid)[0]["dados"]
        assert fim["stop"] == "teto" and fim["custo_usd"] == 0 and "teto" in fim["detalhe"]
        assert f.pedidos == []
        gravar_gasto(cfg, 0.10, time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        r = mandar(c, pid, "e agora?")
        assert r.status_code == 429 and r.json()["detail"] == "chegou no teto de hoje (US$ 3,00); a conversa volta à meia-noite"
        assert c.get("/v1/conversa").json()["gasto_hoje_usd"] == pytest.approx(3.0)


def test_cliente_msg_id_idempotente(app_conversa):
    falso.instalar([texto("ok"), texto("de novo")])
    with app_conversa() as c:
        pid = novo_projeto(c)
        a = mandar(c, pid, "oi", cmid="mesmo_id_123").json()
        esperar_fim(pid)
        b = mandar(c, pid, "oi", cmid="mesmo_id_123").json()
        assert a["turno"] == b["turno"] and len(eventos(pid, "fala_dono")) == 1


def test_contexto_da_tela_vai_numa_linha_do_sistema(app_conversa):
    f = falso.instalar([texto("ok")])
    with app_conversa() as c:
        pid = novo_projeto(c)
        r = mandar(c, pid, "corta aqui", contexto={"versao": "v1", "t_player": 12.4, "tela": "player"}, via="audio")
        assert r.status_code == 202
        esperar_fim(pid)
        assert eventos(pid, "fala_dono")[0]["dados"] == {"turno": r.json()["turno"], "texto": "corta aqui", "via": "audio",
                                                         "contexto": {"versao": "v1", "t_player": 12.4, "tela": "player"}}
    assert f.pedidos[0]["messages"][0]["content"][0]["text"] == "[tela: player · versão aberta: v1 · t_player: 0:12]\ncorta aqui"


def test_capitulo_novo_quando_o_contexto_passa_de_60_mil(app_conversa):
    f = falso.instalar([dict(texto("primeira"), uso_inicio={"cache_read_input_tokens": 70000}), texto("segunda")])
    with app_conversa() as c:
        pid = novo_projeto(c)
        mandar(c, pid, "um")
        esperar_fim(pid)
        mandar(c, pid, "dois")
        esperar_fim(pid, 2)
        k = con()
        caps = k.execute("SELECT capitulo, fechado FROM conversa_capitulos WHERE projeto=? ORDER BY capitulo", (pid,)).fetchall()
        k.close()
        assert [r["capitulo"] for r in caps] == [1, 2] and caps[0]["fechado"] and caps[1]["fechado"] is None
    m2 = f.pedidos[1]["messages"]
    assert len(m2) == 1 and m2[0]["content"][0]["text"].startswith("FICHA DO PROJETO") and m2[0]["content"][1]["text"] == "dois"
    assert '"de_fora"' in m2[0]["content"][0]["text"]                     # a fala do Nimbus volta marcada como de fora
