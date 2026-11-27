"""27/11 (Bastidores do Super Kal): depois das 2 correções automáticas a conferência segura o projeto em reprovado_qa. A
conversa recusava o ajuste ("ainda não foi entregue") e não havia o que refazer: o projeto ficava sem saída. Agora o ajuste
vale para a versão segurada (como o botão da tela) e pode trocar o campo Vozes do pedido junto (bastidor = várias vozes)."""
import json

from conversa_util import app_conversa, con, esperar_fim, eventos, ferramenta, mandar, novo_projeto, texto  # noqa: F401
from motor import config
from motor.conversa import acoes, falso


def _cartao(c, pid, entrada, tid):
    falso.instalar([ferramenta("propor_ajuste", entrada, id_=tid), texto("ok")])
    n = len(eventos(pid, "turno_fim"))
    mandar(c, pid, "faz a v4")
    esperar_fim(pid, n + 1)
    return next((e["dados"] for e in eventos(pid, "confirmacao") if e["dados"]["tool_use_id"] == tid), None)


def _pedido(pid, **campos):
    from motor.api.direcao import _armazem
    arm = _armazem(config.carregar())
    arm.gravar_json(f"projetos/{pid}/pedido.json", {"versao": "1", "projeto": pid, "texto": "bastidor", "vozes": None, **campos})
    return arm


def test_versao_segurada_pela_conferencia_aceita_ajuste(app_conversa):
    with app_conversa() as c:
        pid = novo_projeto(c, estado="reprovado_qa", versoes=[("v1", "reprovada_qa"), ("v2", "reprovada_qa")])
        k = con()
        assert acoes.guarda_ajuste(k, pid, "v2") is None
        assert acoes.guarda_ajuste(k, pid, "v1") == "a v1 não é a mais nova; a mais nova é a v2"
        k.close()


def test_ajuste_troca_vozes_do_pedido_e_reabre_a_direcao(app_conversa):
    with app_conversa() as c:
        pid = novo_projeto(c, estado="reprovado_qa", versoes=[("v3", "reprovada_qa")])
        arm = _pedido(pid)
        conf = _cartao(c, pid, {"versao": "v3", "o_que_mudar": "mesmo pedido; várias pessoas falam", "vozes": "varias"}, "toolu_v4")
        assert conf and conf["acao"] == "ajuste"
        assert conf["mudancas"] == [{"campo": "Vozes", "antes": "automático", "depois": "várias vozes (conversa)"}]
        r = c.post(f"/v1/projetos/{pid}/conversa/confirmar", json={"tool_use_id": "toolu_v4", "sim": True, "entrada_hash": conf["entrada_hash"]})
        assert r.status_code == 200 and r.json()["feito"] is True
        ped = arm.ler_json(f"projetos/{pid}/pedido.json")
        assert ped["vozes"] == "varias" and ped["texto"] == "bastidor"
        k = con()
        assert [r["etapa"] for r in k.execute("SELECT etapa FROM jobs WHERE projeto=?", (pid,))] == ["direcao"]
        assert k.execute("SELECT estado FROM projetos WHERE id=?", (pid,)).fetchone()["estado"] == "dirigindo"
        assert json.loads(k.execute("SELECT dados FROM projetos WHERE id=?", (pid,)).fetchone()["dados"])["correcoes_auto"] == 0
        k.close()


def test_ajuste_sem_vozes_nao_mexe_no_pedido(app_conversa):
    with app_conversa() as c:
        pid = novo_projeto(c, estado="reprovado_qa", versoes=[("v1", "reprovada_qa")])
        arm = _pedido(pid, vozes="uma")
        conf = _cartao(c, pid, {"versao": "v1", "o_que_mudar": "mais curto"}, "toolu_sv")
        assert "mudancas" not in conf
        c.post(f"/v1/projetos/{pid}/conversa/confirmar", json={"tool_use_id": "toolu_sv", "sim": True, "entrada_hash": conf["entrada_hash"]})
        assert arm.ler_json(f"projetos/{pid}/pedido.json")["vozes"] == "uma"
