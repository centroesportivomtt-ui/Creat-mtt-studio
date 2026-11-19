"""Painel de gastos do mês (fila do dono, item H). Sem chamada paga."""
import json
import os
import time

import pytest

from motor import config
from motor.cerebro import gastos as G

USO = {"modelo": "claude-opus-5-5", "entrada": 12000, "saida": 8000, "custo_usd": 0.234}


def test_livro_registra_e_ignora_custo_zero(tmp_path, dados):
    cfg = config.carregar()
    G.registrar(cfg, "direcao", USO, projeto="p_a", versao="v1", ref="projetos/p_a/uso_1.json#0")
    G.registrar(cfg, "direcao", {"modelo": "fixture", "custo_usd": 0.0}, projeto="p_a")          # cérebro fixture/sessão
    G.registrar(cfg, "olho_ia_falhou", {"modelo": "x", "custo_usd": 0.12, "estimado": True}, projeto="p_a")
    linhas = G.ler(cfg)
    assert [d["o_que"] for d in linhas] == ["direcao", "olho_ia_falhou"] and linhas[0]["servico"] == "anthropic"
    assert linhas[0]["ref"] == "projetos/p_a/uso_1.json#0" and linhas[1]["estimado"] is True and "ref" not in linhas[1]


def test_resumo_do_mes_por_servico_tipo_projeto_e_dia(tmp_path, dados):
    cfg = config.carregar()
    G.registrar(cfg, "direcao", USO, projeto="p_a", quando="2026-11-03T10:00:00Z")
    G.registrar(cfg, "critico", dict(USO, custo_usd=0.06), projeto="p_a", quando="2026-11-03T10:01:00Z")
    G.registrar(cfg, "olho_ia", dict(USO, custo_usd=0.12), projeto="p_b", quando="2026-11-19T20:00:00Z")
    G.registrar(cfg, "olho_ia_autoteste", dict(USO, custo_usd=0.024), quando="2026-11-19T19:41:00Z")
    G.registrar(cfg, "direcao", USO, projeto="p_velho", quando="2026-10-30T10:00:00Z")
    (config.carregar().dados / "gastos.jsonl").open("a").write("linha quebrada\n")
    r = G.resumo(cfg, "2026-11")
    assert r["total_usd"] == pytest.approx(0.438) and r["chamadas"] == 4 and r["meses"] == ["2026-11", "2026-10"]
    assert r["por_servico"] == [{"id": "anthropic", "custo_usd": 0.438, "chamadas": 4}]
    assert [x["id"] for x in r["por_projeto"]] == ["p_a", "p_b", "sem projeto"] and r["por_projeto"][0]["custo_usd"] == pytest.approx(0.294)
    assert r["por_tipo"][0] == {"id": "direcao", "nome": "direção do filme", "custo_usd": 0.234, "chamadas": 1}
    assert r["por_dia"] == [{"dia": "2026-11-03", "custo_usd": 0.294}, {"dia": "2026-11-19", "custo_usd": 0.144}]
    assert r["ultimas"][0]["o_que"] == "olho_ia" and "ElevenLabs" in r["fora_do_editor"]
    assert G.resumo(cfg, "2026-10")["total_usd"] == 0.234 and G.resumo(cfg, "2025-01")["chamadas"] == 0


def test_historico_antigo_entra_uma_vez(tmp_path, dados):
    from motor.provedores import armazenamento_de
    cfg = config.carregar()
    arm = armazenamento_de(cfg)
    arm.gravar_json("projetos/p_x/uso_1.json", {"versao": "v1", "chamadas": [dict(USO, chamada="diretor"), dict(USO, custo_usd=0.05, chamada="critico")], "total": {}})
    arm.gravar_json("projetos/p_x/uso_2.json", {"versao": "v2", "chamadas": [{"modelo": "fixture", "custo_usd": 0.0}], "total": {}})
    arm.gravar_json("derivados/p_x/a1/uso_visao.json", {"modelo": "claude-haiku-5-5", "entrada": 900, "saida": 300, "custo_usd": 0.00024})
    antigo = time.time() - 40 * 86400
    os.utime(arm.caminho_local("projetos/p_x/uso_1.json"), (antigo, antigo))
    # a direção nova já registrou a 1ª chamada do uso_1 com a mesma ref: não duplica
    G.registrar(cfg, "direcao", USO, projeto="p_x", versao="v1", ref="projetos/p_x/uso_1.json#0")
    assert G.importar_historico(cfg, arm) == 2                  # crítico do uso_1 e a visão (custo zero não entra)
    assert G.importar_historico(cfg, arm) == 0
    linhas = G.ler(cfg)
    assert sorted(d["o_que"] for d in linhas) == ["critico", "direcao", "visao_leve"] and len(linhas) == 3
    critico = next(d for d in linhas if d["o_que"] == "critico")
    assert critico["quando"][:7] == time.strftime("%Y-%m", time.gmtime(antigo)) and critico["versao"] == "v1"


def test_rota_do_painel(tmp_path, dados):
    from fastapi.testclient import TestClient
    from motor.api import gastos as rota
    from motor.api.app import criar
    rota._IMPORTADO.clear()
    cli = TestClient(criar())
    G.registrar(config.carregar(), "olho_ia", dict(USO, custo_usd=0.12), projeto="p_b")
    from motor import banco
    con = banco.conectar(config.carregar().banco)
    con.execute("INSERT INTO projetos (id, nome, estado, tipo_video, criado, atualizado, dados) VALUES ('p_b', 'Reel da Lavínia', 'entregue', 'auto', 'x', 'x', '{}')")
    con.commit()
    con.close()
    r = cli.get("/v1/gastos")
    assert r.json()["por_projeto"][0]["nome"] == "Reel da Lavínia" and r.json()["ultimas"][0]["projeto_nome"] == "Reel da Lavínia"
    assert r.status_code == 200 and r.json()["total_usd"] == 0.12 and r.json()["mes"] == time.strftime("%Y-%m", time.gmtime())
    assert cli.get("/v1/gastos?mes=2026-13").status_code == 422 and cli.get("/v1/gastos?mes=../x").status_code == 422
    assert cli.get("/v1/gastos?mes=2026-01").json()["chamadas"] == 0


def test_direcao_e_visao_registram_no_livro():
    src = (config.RAIZ_REPO / "services/motor/motor/etapas/direcao.py").read_text()
    assert 'gastos.registrar(ctx.cfg, "critico" if u.get("chamada") == "critico" else "direcao"' in src
    assert 'gastos.registrar(ctx.cfg, "visao_leve"' in (config.RAIZ_REPO / "services/motor/motor/etapas/analise.py").read_text()
    assert 'gastos.registrar(cfg, "direcao_autoteste"' in (config.RAIZ_REPO / "services/motor/motor/cerebro/diagnostico.py").read_text()
    assert "self.ultimo_uso = None" in (config.RAIZ_REPO / "services/motor/motor/provedores/visao_claude.py").read_text()
