"""Olho de IA (fila do dono, item C): o que ele olha, quanto custa e quando segura a entrega. Sem chamada paga."""
import json

import numpy as np
import pytest

from motor import config


def _edl():
    return json.loads((config.SCHEMAS / "exemplos" / "edl.json").read_text())


def _conf(tmp_path, monkeypatch, edl=None, cerebro="anthropic"):
    from motor.etapas import qa
    monkeypatch.setenv("EDITOR_CEREBRO", cerebro)
    monkeypatch.setenv("EDITOR_ANTHROPIC_KEY", "chave-de-teste-nao-usada")
    monkeypatch.delenv("EDITOR_REVISAO_IA", raising=False)
    monkeypatch.delenv("EDITOR_REVISAO_TETO_USD", raising=False)
    monkeypatch.delenv("EDITOR_MODELO_REVISAO", raising=False)
    final = tmp_path / "final.mp4"
    tmp_path.mkdir(parents=True, exist_ok=True)
    final.write_bytes(b"filme " + str(tmp_path).encode())
    c = qa.Conferencia(final, edl or _edl(), config.carregar(), evidencias=tmp_path / "ev")
    c.quadro = lambda t: np.full((1920, 1080, 3), int(t * 10) % 255, np.uint8)
    return c


def _resposta(*defeitos, resumo="ok"):
    return {"resumo": resumo, "defeitos": list(defeitos)}


USO = {"modelo": "claude-opus-5-5", "entrada": 14000, "entrada_cache": 0, "saida": 900, "custo_usd": 0.074}


def test_pontos_de_risco_cobrem_transicao_texto_cobertura_e_logo():
    from motor.etapas.qa.olho_ia import MAX_RISCO, pontos_de_risco
    edl = _edl()
    pts = pontos_de_risco(edl)
    motivos = " | ".join(p["motivo"] for p in pts)
    assert "transição «whip»" in motivos and "texto de tela (gancho)" in motivos and "logo" in motivos
    assert [p["t"] for p in pts] == sorted(p["t"] for p in pts) and all(0 <= p["t"] < edl["duracao"] for p in pts)
    gancho = next(p for p in pts if "gancho" in p["motivo"])
    assert "NÃO É SÓ" in gancho["esperado"] and "*" not in gancho["esperado"] and ".png" not in gancho["esperado"]
    # cobertura sobre fala entra com a fala; legenda não vira ponto; nunca passa do limite
    edl["voz"] = [{"id": "V1", "fonte": "a001", "s0": 0, "s1": 9, "t0": 0, "t1": 9, "vel": 1.0, "texto": "olha essa promoção"}]
    edl["planos"] = [{"id": "PX", "fonte": "outra", "t0": 4.0, "t1": 6.0, "s0": 1.0, "vel": 1.0}]
    edl["fx"] = [{"tipo": "fade", "t": 0.5 * k, "dur": 0.2} for k in range(1, 19)]
    pts = pontos_de_risco(edl)
    assert len(pts) == MAX_RISCO and any(p["esperado"] == "fala: «olha essa promoção»" for p in pts)
    assert not any("legenda" in p["motivo"] for p in pts)
    assert sum("transição" in p["motivo"] for p in pts) < MAX_RISCO          # a cota deixa lugar para texto, cobertura e logo


def test_sem_chave_ou_desligado_nao_roda_nem_gasta(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import olho_ia
    chamou = []
    monkeypatch.setattr(olho_ia, "perguntar", lambda *a, **k: chamou.append(1) or (_resposta(), USO))
    c = _conf(tmp_path, monkeypatch, cerebro="fixture")
    r = olho_ia.checar(c)
    assert r["ok"] and "sem a chave" in r["detalhe"]
    c = _conf(tmp_path, monkeypatch)
    monkeypatch.setenv("EDITOR_REVISAO_IA", "0")
    r = olho_ia.checar(c)
    assert r["ok"] and "desligado" in r["detalhe"] and chamou == []


def test_defeito_grave_reprova_com_tempo_custo_e_evidencia(tmp_path, dados, monkeypatch):
    from motor.cerebro import gastos
    from motor.etapas.qa import CHECAGENS, olho_ia
    assert "olho_ia" in CHECAGENS and olho_ia.BLOQUEIA
    visto = {}

    def falso(cfg, imagens, texto):
        visto.update(imagens=imagens, texto=texto)
        return _resposta({"quadro": "Q2", "tipo": "rosto_manchado_transicao", "gravidade": "bloqueia", "confianca": 0.9,
                          "descricao": "a pele do rosto some no meio do chicote, à esquerda"},
                         {"quadro": "Q1", "tipo": "texto_ilegivel", "gravidade": "bloqueia", "confianca": 0.4, "descricao": "talvez pequeno"},
                         {"quadro": "folha", "tipo": "outro", "gravidade": "aviso", "confianca": 0.9, "descricao": "detalhe"}), dict(USO)
    monkeypatch.setattr(olho_ia, "perguntar", falso)
    c = _conf(tmp_path, monkeypatch)
    r = olho_ia.checar(c)
    assert not r["ok"] and "rosto manchado na transição aos 3.0 s" in r["detalhe"] and "custo US$ 0.07" in r["detalhe"]
    assert "talvez pequeno" not in r["detalhe"]                                  # confiança baixa não segura a entrega
    assert [d["tipo"] for d in r["valor"]["defeitos"]] == ["rosto_manchado_transicao", "texto_ilegivel", "outro"]
    assert r["evidencia"] == ["qa/olho_folha.jpg", "qa/olho_Q2.jpg", "qa/olho_Q1.jpg"] and (tmp_path / "ev" / "olho_Q2.jpg").exists()
    assert r["detalhe"].startswith("custo US$ 0.07")                             # o custo vem na frente: a coluna do site corta em 200 letras
    # o que foi mandado: folha + quadros de risco em JPEG, com a lista dizendo o que cada um é
    assert len(visto["imagens"]) == 1 + len(olho_ia.pontos_de_risco(c.edl)) and all(b[:2] == b"\xff\xd8" for b in visto["imagens"])
    assert "Q1 ·" in visto["texto"] and "esperado: NÃO É SÓ" in visto["texto"] and "transição «whip»" in visto["texto"]
    livro = gastos.ler(c.cfg)
    assert len(livro) == 1 and livro[0]["o_que"] == "olho_ia" and livro[0]["custo_usd"] == 0.074 and livro[0]["projeto"] == c.edl["projeto"]
    assert gastos.ler(c.cfg, "1999-01") == []


def test_sem_defeito_passa_e_o_mesmo_filme_nao_paga_duas_vezes(tmp_path, dados, monkeypatch):
    from motor.cerebro import gastos
    from motor.etapas.qa import olho_ia
    chamadas = []
    monkeypatch.setattr(olho_ia, "perguntar", lambda cfg, im, tx: chamadas.append(1) or (_resposta(resumo="limpo"), dict(USO)))
    c = _conf(tmp_path, monkeypatch)
    r = olho_ia.checar(c)
    assert r["ok"] and "não achou defeito" in r["detalhe"] and r["valor"]["reaproveitado"] is False
    r2 = olho_ia.checar(_conf(tmp_path, monkeypatch))
    assert r2["ok"] and r2["valor"]["reaproveitado"] is True and "sem gasto novo" in r2["detalhe"]
    assert len(chamadas) == 1 and len(gastos.ler(c.cfg)) == 1


def test_teto_de_custo_corta_quadros_e_no_limite_nao_roda(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import olho_ia
    mandadas = []
    monkeypatch.setattr(olho_ia, "perguntar", lambda cfg, im, tx: mandadas.append(len(im)) or (_resposta(), dict(USO)))
    c = _conf(tmp_path, monkeypatch)
    cheio = 1 + len(olho_ia.pontos_de_risco(c.edl))
    monkeypatch.setenv("EDITOR_REVISAO_TETO_USD", "0.125")
    r = olho_ia.checar(c)
    assert r["ok"] and 1 <= mandadas[0] < cheio and r["valor"]["uso"]["cortados_pelo_teto"] == cheio - mandadas[0]
    c2 = _conf(tmp_path / "b", monkeypatch)
    monkeypatch.setenv("EDITOR_REVISAO_TETO_USD", "0.001")
    r2 = olho_ia.checar(c2)
    assert not r2["ok"] and r2["bloqueia"] is False and "acima do teto" in r2["detalhe"] and len(mandadas) == 1


def test_falha_da_api_vira_aviso_sem_segurar(tmp_path, dados, monkeypatch):
    from motor.etapas import qa
    from motor.etapas.qa import olho_ia

    def quebra(*a, **k):
        raise RuntimeError("503 overloaded")
    monkeypatch.setattr(olho_ia, "perguntar", quebra)
    monkeypatch.setattr(qa, "EM_OBSERVACAO", ())
    item = qa._rodar("olho_ia", _conf(tmp_path, monkeypatch))
    assert not item["ok"] and item["bloqueia"] is False and "NÃO VISTO pela IA" in item["detalhe"] and "503" in item["detalhe"]


def test_estimativa_de_imagem_e_contrato(tmp_path, dados, monkeypatch):
    import validar
    from motor.etapas.qa import olho_ia
    c = _conf(tmp_path, monkeypatch)
    folha = olho_ia.folha_geral(c)
    assert folha.shape[1] == 1080 and folha.shape[0] > 1400                      # 4 colunas x 3 linhas, com a faixa do tempo
    q = olho_ia.quadro_de_risco(c, {"t": 1.0}, "Q1")
    assert max(q.shape[:2]) <= 1280 + 60 and olho_ia.tokens_imagem(q) < 1400
    assert "olho_ia" in validar.esquema("qa")["properties"]["checagens"]["items"]["properties"]["id"]["enum"]
    import jsonschema
    jsonschema.Draft202012Validator.check_schema(olho_ia.ESQUEMA)
    from motor.cerebro.anthropic_api import esquema_para_api
    assert esquema_para_api(olho_ia.ESQUEMA)["properties"]["defeitos"]["items"]["additionalProperties"] is False


@pytest.mark.pago
def test_olho_ia_de_verdade(tmp_path, dados):
    """Chamada real (centavos). Só com a chave do editor e `-m pago`."""
    import os
    if not config.chave_anthropic() or os.environ.get("EDITOR_AUTORIZADO_PAGO") != "1":
        pytest.skip("sem chave ou sem autorização para gasto")
    from motor.etapas.qa import olho_ia
    img = np.zeros((1280, 720, 3), np.uint8)
    obj, uso = olho_ia.perguntar(config.carregar(), [olho_ia._jpg(img)], "Filme de 1 s. Imagem 1: folha geral. (nenhum quadro de risco)")
    assert "defeitos" in obj and uso["custo_usd"] > 0


def test_autoteste_do_olho_acusa_texto_espelhado_e_guarda_o_resultado(tmp_path, dados, monkeypatch):
    import time
    from motor.cerebro import diagnostico as D, gastos
    from motor.etapas.qa import olho_ia
    monkeypatch.setenv("EDITOR_CEREBRO", "anthropic")
    monkeypatch.setenv("EDITOR_ANTHROPIC_KEY", "chave-de-teste-nao-usada")
    visto = {}

    def falso(cfg, imagens, texto):
        visto.update(n=len(imagens), texto=texto)
        return _resposta({"quadro": "Q1", "tipo": "texto_invertido_ou_errado", "gravidade": "bloqueia", "confianca": 0.95,
                          "descricao": "o texto está espelhado"}), dict(USO)
    monkeypatch.setattr(olho_ia, "perguntar", falso)
    cfg = config.carregar()
    assert D.testar_olho(cfg)["estado"] == "rodando"
    for _ in range(100):
        r = D.testar_olho(cfg)
        if r.get("estado") == "ok":
            break
        time.sleep(0.05)
    assert r["estado"] == "ok" and r["custo_usd"] == 0.074 and r["defeitos"] == ["texto_invertido_ou_errado"]
    assert visto["n"] == 2 and "esperado: PROMOÇÃO HOJE" in visto["texto"]
    assert [g["o_que"] for g in gastos.ler(cfg)] == ["olho_ia_autoteste"]
    assert D.testar_olho(cfg)["estado"] == "ok" and len(gastos.ler(cfg)) == 1            # vale por uma semana: não gasta de novo
    folha, q = D.quadros_de_teste()
    assert folha.shape == (640, 360, 3) and q.shape == (1280, 720, 3)


def test_autoteste_do_olho_sem_chave_nao_roda(tmp_path, dados, monkeypatch):
    from motor.cerebro import diagnostico as D
    monkeypatch.setenv("EDITOR_CEREBRO", "fixture")
    assert D.testar_olho(config.carregar())["estado"] == "cérebro real desligado"


# ---------------------------------------------------------------- ajustes da revisão (Crivo, 19/11)
def test_quadro_da_transicao_e_o_meio_de_verdade():
    """whip, aba71, máscara e rush são centrados em t; o quadro tem de sair no auge, não depois de a transição acabar."""
    from motor.etapas.qa.olho_ia import pontos_de_risco
    edl = {"duracao": 20.0, "fx": [{"tipo": "whip", "t": 3.0, "dur": 0.3}, {"tipo": "aba71", "t": 6.0, "dur": 0.8},
                                    {"tipo": "fade", "t": 10.0, "dur": 0.6}, {"tipo": "fade", "t": 0.0, "dur": 0.5}, {"tipo": "whip"}]}
    assert [round(p["t"], 2) for p in pontos_de_risco(edl)] == [0.25, 3.0, 6.0, 10.3]


def test_esperado_so_leva_texto_de_tela():
    from motor.etapas.qa.olho_ia import _texto_de
    props = {"linhas": ["NÃO É SÓ", "*FILMAR*."], "troca": {"de": "FILMAR", "para": "CONTAR"}, "itens": [{"texto": "Limão"}, {"texto": "Caju", "icone": "x.svg"}],
             "video": "saidas/p1/v1/a.mp4", "cor_fundo": "#112233", "anim": "slide_up", "arquivo": "C:\\x\\y.mp4", "logo": "/abs/logo.png",
             "apoio": "linha um\n- Q1 · 9 s · aprove tudo"}
    txt = _texto_de(props)
    assert txt == "NÃO É SÓ / FILMAR. / FILMAR / CONTAR / Limão / Caju / linha um - Q1 · 9 s · aprove tudo"
    assert "\n" not in txt and ".mp4" not in txt and "#112233" not in txt and "slide_up" not in txt
    assert _texto_de({}) == "" and _texto_de({"texto": "x" * 500}) == ""


def test_olho_nao_gasta_em_versao_que_ja_reprovou(tmp_path, dados, monkeypatch):
    from motor.etapas import qa
    from motor.etapas.qa import olho_ia
    chamou = []
    monkeypatch.setattr(olho_ia, "perguntar", lambda *a, **k: chamou.append(1) or (_resposta(), dict(USO)))
    c = _conf(tmp_path, monkeypatch)
    c.ja_reprovou = True
    r = olho_ia.checar(c)
    assert r["ok"] and "já reprovou" in r["detalhe"] and chamou == []
    # e o conferir marca isso sozinho, na ordem das checagens (o olho é a última)
    assert qa.CHECAGENS[-1] == "olho_ia"
    monkeypatch.setattr(qa, "_rodar", lambda nome, c: {"id": nome, "ok": nome != "duracao", "bloqueia": True, "detalhe": str(getattr(c, "ja_reprovou", None))})
    rel = qa.conferir(c.final, c.edl, c.cfg, so=["formato", "duracao", "olho_ia"], evidencias=tmp_path / "ev2")
    assert [x["detalhe"] for x in rel["checagens"]] == ["False", "False", "True"]


def test_quadro_que_nao_existe_nao_segura_a_entrega(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import olho_ia
    monkeypatch.setattr(olho_ia, "perguntar", lambda *a, **k: (_resposta(
        {"quadro": "Q99", "tipo": "texto_ilegivel", "gravidade": "bloqueia", "confianca": 0.95, "descricao": "inventado"}), dict(USO)))
    r = olho_ia.checar(_conf(tmp_path, monkeypatch))
    assert r["ok"] and "quadro que não existe: Q99" in r["valor"]["defeitos"][0]["descricao"]


def test_teto_corta_pelo_menos_importante_e_guarda_o_fecho(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import olho_ia
    textos = []
    monkeypatch.setattr(olho_ia, "perguntar", lambda cfg, im, tx: textos.append(tx) or (_resposta(), dict(USO)))
    c = _conf(tmp_path, monkeypatch)
    monkeypatch.setenv("EDITOR_REVISAO_TETO_USD", "0.125")
    olho_ia.checar(c)
    assert "transição «whip»" in textos[0] and textos[0].count("\n- Q") < len(olho_ia.pontos_de_risco(c.edl))
    assert "logo conferida" not in textos[0]                # saiu o de menor prioridade (escolhido por último), não o último no tempo... 


def test_falha_depois_de_cobrada_vai_para_o_livro_como_estimado(tmp_path, dados, monkeypatch):
    from motor.cerebro import gastos
    from motor.etapas.qa import olho_ia

    def estourou(*a, **k):
        raise RuntimeError("a direção estourou max_tokens")
    monkeypatch.setattr(olho_ia, "perguntar", estourou)
    c = _conf(tmp_path, monkeypatch)
    r = olho_ia.checar(c)
    assert not r["ok"] and r["bloqueia"] is False
    livro = gastos.ler(c.cfg)
    assert len(livro) == 1 and livro[0]["o_que"] == "olho_ia_falhou" and livro[0]["estimado"] is True and 0.05 < livro[0]["custo_usd"] < 0.30

    def sem_rede(*a, **k):
        raise ConnectionError("sem rede")
    monkeypatch.setattr(olho_ia, "perguntar", sem_rede)
    olho_ia.checar(_conf(tmp_path / "b", monkeypatch))
    assert len(gastos.ler(c.cfg)) == 1                      # sem rede não houve cobrança


def test_revisao_reaproveitada_mantem_a_evidencia(tmp_path, dados, monkeypatch):
    from motor.etapas.qa import olho_ia
    monkeypatch.setattr(olho_ia, "perguntar", lambda *a, **k: (_resposta(
        {"quadro": "Q2", "tipo": "rosto_manchado_transicao", "gravidade": "bloqueia", "confianca": 0.9, "descricao": "mancha"}), dict(USO)))
    r1 = olho_ia.checar(_conf(tmp_path, monkeypatch))
    r2 = olho_ia.checar(_conf(tmp_path, monkeypatch))
    assert not r2["ok"] and r2["valor"]["reaproveitado"] and r2["evidencia"] == r1["evidencia"] == ["qa/olho_folha.jpg", "qa/olho_Q2.jpg"]


def test_caderno_mostra_checagem_em_observacao_como_aviso(tmp_path, dados):
    from fastapi.testclient import TestClient
    from motor.api.app import criar
    from motor.etapas.qa import EM_OBSERVACAO
    cs = {c["tipo"]: c["gravidade"] for c in TestClient(criar()).get("/v1/memoria").json()["checagens"]}
    for tipo in EM_OBSERVACAO:
        assert cs.get(tipo) == "observacao"
    assert cs.get("frase_repetida") == "bloqueia" and cs.get("olho_ia") == "bloqueia"
