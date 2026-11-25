"""Onda 3, frente A: trocar só a música, sem cérebro (A3.7 e A3.8). Material sintético (b_sintetico), cérebro falso, sem rede."""
import copy
import json

import pytest
from b_sintetico import analise, direcao

from conversa_util import (app_conversa, con, conferir_eventos_da_conversa, esperar_fim, eventos, ferramenta, mandar,  # noqa: F401
                           novo_projeto, texto)
from motor import banco, config, worker
from motor.conversa import falso
from motor.etapas import catalogo, resolvedor
from motor.memoria.loja import Loja

A = {"id": "noite", "titulo": "Noite Clara", "clima": "calmo", "bpm": 120.0, "dur": 60.0, "fase": 0.0, "chave": "biblioteca/trilha/noite.wav"}
B = {"id": "feira", "titulo": "Pulso de Feira", "clima": "energia", "bpm": 100.0, "dur": 60.0, "fase": 0.0, "chave": "biblioteca/trilha/feira.wav"}


def _sql(q, *a):
    k = con()
    try:
        return [dict(r) for r in k.execute(q, a)]
    finally:
        k.close()


def _arm():
    from motor.api.direcao import _armazem
    return _armazem(config.carregar())


@pytest.fixture()
def trilhas(tmp_path, monkeypatch):
    arq = tmp_path / "trilhas.json"
    arq.write_text(json.dumps([A, B]))
    monkeypatch.setenv("EDITOR_TRILHAS", str(arq))
    return arq


def _projeto_entregue(c, d=None, com_direcao=True) -> str:
    """v1 entregue com direção guardada (trilha A), catálogo, análise e EDL resolvidos de verdade."""
    pid = novo_projeto(c, estado="entregue", versoes=[("v1", "entregue")])
    arm = _arm()
    an = analise(projeto=pid)
    cat, txt = catalogo.montar([an], {"texto": "reel"}, pid)
    d = d or direcao()
    d["trilha"]["id"] = "noite"
    loja = Loja()
    edl = resolvedor.resolver(d, cat, {an["arquivo"]["id"]: an}, loja.modelo("evento-reel"), [A, B], vocabulario=loja.vocabulario(), projeto=pid)
    edl["origem"]["versao"] = "v1"
    arm.gravar_json(f"derivados/{pid}/a001/analise.json", an)
    arm.gravar_json(f"projetos/{pid}/catalogo.json", cat)
    arm.gravar_texto(f"projetos/{pid}/catalogo.txt", txt)
    arm.gravar_json(f"projetos/{pid}/pedido.json", {"versao": "1", "projeto": pid, "texto": "reel"})
    if com_direcao:
        arm.gravar_json(f"projetos/{pid}/direcao_1.json", d)
    arm.gravar_json(f"projetos/{pid}/direcoes.json", {"por_entrada": {}, "ultima": 1})
    arm.gravar_json(f"saidas/{pid}/v1/edl.json", edl)
    return pid


def _cartao(c, pid, entrada, tid):
    falso.instalar([ferramenta("propor_trilha", entrada, id_=tid), texto("ok")])
    n = len(eventos(pid, "turno_fim"))
    mandar(c, pid, "troca a música")
    esperar_fim(pid, n + 1)
    conf = [e["dados"] for e in eventos(pid, "confirmacao") if e["dados"]["tool_use_id"] == tid]
    f = falso.ATIVO
    return (conf[0] if conf else None), f


def test_troca_de_musica_sem_cerebro(app_conversa, trilhas, monkeypatch):
    chamadas = []
    import motor.provedores as P
    real = P.provedor

    def contar(tipo, cfg=None):
        chamadas.append(tipo)
        return real(tipo, cfg) if cfg is not None else real(tipo)
    monkeypatch.setattr(P, "provedor", contar)
    with app_conversa() as c:
        pid = _projeto_entregue(c)
        conf, _ = _cartao(c, pid, {"versao": "v1", "trilha": "feira"}, "toolu_mus")
        assert conf["acao"] == "trilha" and conf["titulo"] == "Trocar a música da v1" and conf["botao"] == "Trocar a música"
        assert conf["texto_exato"] == conf["faz"] == "Trocar a música da v1 por “Pulso de Feira” (100 bpm), sem nova direção."
        assert conf["mudancas"] == [{"campo": "Música", "antes": "Noite Clara", "depois": "Pulso de Feira"}]
        assert conf["nao_muda"] == "Os mesmos trechos, falas, legendas, cor e fecho."
        assert conf["atencao"] == "Os cortes andam até uma batida para casar com a música nova, então a duração pode mudar um pouco."
        assert conf["refaz"] == ["encaixe", "montagem", "qa", "entrega"] and conf["vira_regra"] is False
        assert "A música nova sai na v2" in conf["volta"] and conf["custo_usd_est"] == 0.0
        r = c.post(f"/v1/projetos/{pid}/conversa/confirmar", json={"tool_use_id": "toolu_mus", "sim": True, "entrada_hash": conf["entrada_hash"]})
        assert r.status_code == 200 and r.json() == {"feito": True, "resultado": {"trocando_musica": True}}
        conferir_eventos_da_conversa(pid)                         # cartão e resposta novos validam no conversa.schema.json
        j = _sql("SELECT estado, entrada FROM jobs WHERE projeto=? AND etapa='direcao'", pid)[0]
        assert j["estado"] == "pendente" and json.loads(j["entrada"]) == {"trocar_trilha": {"de": "v1", "trilha": "feira"}}
        assert json.loads(_sql("SELECT dados FROM projetos WHERE id=?", pid)[0]["dados"])["correcoes_auto"] == 2
        assert _sql("SELECT estado FROM projetos WHERE id=?", pid)[0]["estado"] == "dirigindo"
        chamadas.clear()
        assert worker.main(["--ate-ocioso", "--etapas", "direcao"]) == 0
        assert "cerebro" not in chamadas                                              # o cérebro não foi chamado
        arm = _arm()
        v1, v2 = arm.ler_json(f"saidas/{pid}/v1/edl.json"), arm.ler_json(f"saidas/{pid}/v2/edl.json")
        assert v2["trilha"]["chave"] == B["chave"] and v1["trilha"]["chave"] == A["chave"]
        assert [b["id"] for b in v2["blocos"]] == [b["id"] for b in v1["blocos"]]
        assert [x["fala"] for x in v2["voz"]] == [x["fala"] for x in v1["voz"]]
        assert v2["origem"]["cerebro"] == "sem_cerebro" and v2["origem"]["trocou_trilha_de"] == "v1"
        uso = arm.ler_json(f"projetos/{pid}/uso_2.json")
        assert uso["total"]["custo_usd"] == 0 and uso["chamadas"] == [] and uso["troca_de_trilha"] == {"de": "v1", "trilha": "feira"}
        d2 = arm.ler_json(f"projetos/{pid}/direcao_2.json")
        assert d2["trilha"]["id"] == "feira" and d2["blocos"] == arm.ler_json(f"projetos/{pid}/direcao_1.json")["blocos"]
        livro = config.carregar().dados / "gastos.jsonl"
        linhas = [json.loads(x) for x in livro.read_text().splitlines()] if livro.exists() else []
        assert not [x for x in linhas if x["o_que"] in ("direcao", "critico")]
        vs = {r["id"]: r["estado"] for r in _sql("SELECT id, estado FROM versoes WHERE projeto=?", pid)}
        assert vs == {"v1": "entregue", "v2": "montando"}
        assert [j["etapa"] for j in _sql("SELECT etapa FROM jobs WHERE projeto=? AND estado='pendente'", pid)] == ["montagem"]
        prog = [e["mensagem"] for e in eventos(pid, "etapa_progresso") if e["etapa"] == "direcao"]
        assert prog[-1] == f"Música trocada (v2, {v2['duracao']:.0f} s). Custo da direção: US$ 0,00."
        # a mesma troca de novo devolve a mesma versão (idempotente pela chave da entrada)
        k = con()
        banco.enfileirar(k, "direcao", pid, entrada={"trocar_trilha": {"de": "v1", "trilha": "feira"}})
        k.close()
        assert worker.main(["--ate-ocioso", "--etapas", "direcao"]) == 0
        assert arm.ler_json(f"projetos/{pid}/direcoes.json")["ultima"] == 2


def test_troca_recusada_com_o_porque(app_conversa, trilhas):
    with app_conversa() as c:
        pid = _projeto_entregue(c)
        conf, f = _cartao(c, pid, {"versao": "v1", "trilha": "noite"}, "toolu_t1")
        assert conf is None and json.loads(f.pedidos[1]["messages"][-1]["content"][0]["content"])["detalhe"] == "a v1 já usa essa música"
        conf, f = _cartao(c, pid, {"versao": "v1", "trilha": "sumiu"}, "toolu_t2")
        assert json.loads(f.pedidos[1]["messages"][-1]["content"][0]["content"])["detalhe"] == \
            "essa música não está na biblioteca (ou não tem licença registrada)"
        pid2 = _projeto_entregue(c, com_direcao=False)
        conf, f = _cartao(c, pid2, {"versao": "v1", "trilha": "feira"}, "toolu_t3")
        assert json.loads(f.pedidos[1]["messages"][-1]["content"][0]["content"])["detalhe"] == \
            "a v1 não tem direção guardada (foi montada de um roteiro fixo); peça um ajuste"
        _sql("UPDATE versoes SET estado='reprovada_qa' WHERE projeto=?", pid)
        conf, f = _cartao(c, pid, {"versao": "v1", "trilha": "feira"}, "toolu_t4")
        assert json.loads(f.pedidos[1]["messages"][-1]["content"][0]["content"])["detalhe"] == "a v1 ainda não foi entregue (está reprovada_qa)"


def test_direcao_com_duas_musicas_avisa_que_fica_uma(app_conversa, trilhas):
    with app_conversa() as c:
        d = direcao()
        d["trilha"]["ids"] = ["noite", "feira"]
        pid = _projeto_entregue(c, d=copy.deepcopy(d))
        c3 = dict(B, id="terceira", titulo="Terceira", chave="biblioteca/trilha/3.wav")
        trilhas.write_text(json.dumps([A, B, c3]))
        conf, _ = _cartao(c, pid, {"versao": "v1", "trilha": "terceira"}, "toolu_d")
        assert conf["atencao"].endswith(" Hoje a v1 tem 2 músicas; a versão nova fica com uma só.")


def test_musica_que_saiu_da_biblioteca_para_com_frase_clara(app_conversa, trilhas):
    with app_conversa() as c:
        pid = _projeto_entregue(c)
        k = con()
        banco.enfileirar(k, "direcao", pid, entrada={"trocar_trilha": {"de": "v1", "trilha": "feira"}})
        k.close()
        trilhas.write_text(json.dumps([A]))
        assert worker.main(["--ate-ocioso", "--etapas", "direcao"]) == 0
        j = _sql("SELECT estado, erro FROM jobs WHERE projeto=? AND etapa='direcao'", pid)[0]
        assert j["estado"] == "falhou" and "a música escolhida saiu da biblioteca" in j["erro"]
        assert _sql("SELECT estado FROM versoes WHERE projeto=? AND id='v1'", pid)[0]["estado"] == "entregue"
        # revisão da onda 3 (achado 2): a troca opcional que falhou não tira o dono da tela do filme pronto
        assert _sql("SELECT estado FROM projetos WHERE id=?", pid)[0]["estado"] == "entregue"
        ult = [e for e in eventos(pid, "estado")][-1]
        assert ult["estado"] == "entregue" and ult["mensagem"] == (
            "A troca de música não deu certo (a música escolhida saiu da biblioteca). "
            "A V1 continua pronta e guardada; se quiser, peça outra música na conversa.")
        trilhas.write_text(json.dumps([A, B]))
        ops = c.get(f"/v1/projetos/{pid}/refazer").json()["opcoes"]
        assert [o["titulo"] for o in ops] == ["Trocar a música de novo"] and ops[0]["pela_conversa"] is False


def test_troca_que_falhou_sem_a_versao_de_origem_vai_a_erro(app_conversa, trilhas):
    """Sem a versão de origem entregue não há filme pronto para voltar: segue o caminho de sempre ('erro')."""
    with app_conversa() as c:
        pid = _projeto_entregue(c)
        _sql("UPDATE versoes SET estado='erro' WHERE projeto=?", pid)
        k = con()
        banco.enfileirar(k, "direcao", pid, entrada={"trocar_trilha": {"de": "v1", "trilha": "feira"}})
        k.close()
        trilhas.write_text(json.dumps([A]))
        assert worker.main(["--ate-ocioso", "--etapas", "direcao"]) == 0
        assert _sql("SELECT estado FROM projetos WHERE id=?", pid)[0]["estado"] == "erro"


def test_trocar_de_novo_respeita_as_regras_da_troca(app_conversa, trilhas):
    """Revisão da onda 3 (achado 1): "Trocar a música de novo" passa pela mesma guarda da troca. Versão aprovada depois da
    falha: a opção some do GET /refazer e o POST recusa com 409, sem enfileirar nada."""
    with app_conversa() as c:
        pid = _projeto_entregue(c)
        k = con()
        banco.enfileirar(k, "direcao", pid, entrada={"trocar_trilha": {"de": "v1", "trilha": "feira"}})
        k.close()
        trilhas.write_text(json.dumps([A]))
        assert worker.main(["--ate-ocioso", "--etapas", "direcao"]) == 0
        trilhas.write_text(json.dumps([A, B]))
        assert [o["de"] for o in c.get(f"/v1/projetos/{pid}/refazer").json()["opcoes"]] == ["direcao"]
        _sql("UPDATE projetos SET dados=json_set(dados, '$.aprovadas', json('{\"v1\": {\"em\": \"2026-11-25\"}}')) WHERE id=?", pid)
        assert c.get(f"/v1/projetos/{pid}/refazer").json()["opcoes"] == []
        r = c.post(f"/v1/projetos/{pid}/refazer", json={"de": "direcao"})
        assert r.status_code == 409 and r.json()["detail"] == "não deu: a v1 já foi aprovada"
        assert _sql("SELECT estado FROM jobs WHERE projeto=? AND etapa='direcao'", pid)[0]["estado"] == "falhou"
        assert not _sql("SELECT 1 FROM versoes WHERE projeto=? AND id='v2'", pid)
        # música que saiu da biblioteca de novo: a mesma frase da troca
        _sql("UPDATE projetos SET dados=json_remove(dados, '$.aprovadas') WHERE id=?", pid)
        trilhas.write_text(json.dumps([A]))
        r = c.post(f"/v1/projetos/{pid}/refazer", json={"de": "direcao"})
        assert r.status_code == 409 and r.json()["detail"] == "não deu: essa música não está na biblioteca (ou não tem licença registrada)"
