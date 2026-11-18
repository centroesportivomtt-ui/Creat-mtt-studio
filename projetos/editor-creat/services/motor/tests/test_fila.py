"""O núcleo: fila com aluguel (sobrevive a reinício), idempotência e encadeamento completo com etapas falsas."""
import json
import time

from motor import banco, config, etapas, pipeline, worker


def _projeto(con, pid="p1", **dados):
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado, dados) VALUES (?,?,?,?,?)", (pid, "teste", t, t, json.dumps(dados)))


def test_enfileirar_idempotente_e_pegar(dados):
    con = banco.conectar(config.carregar().banco)
    a = banco.enfileirar(con, "ingest", "p1", "a001")
    b = banco.enfileirar(con, "ingest", "p1", "a001")
    assert a == b
    j = banco.pegar(con, "w1")
    assert j["id"] == a and j["estado"] == "pendente"
    assert banco.pegar(con, "w2") is None          # está alugado


def test_aluguel_vencido_volta_para_fila(dados):
    """Simula reinício da máquina: o job ficou 'rodando' com aluguel vencido."""
    con = banco.conectar(config.carregar().banco)
    banco.enfileirar(con, "analise", "p1", "a001")
    j = banco.pegar(con, "w1", aluguel_s=0.01)
    time.sleep(0.05)
    j2 = banco.pegar(con, "w2")
    assert j2 and j2["id"] == j["id"] and j2["tentativas"] == 2


def test_falha_tres_vezes_desiste(dados):
    con = banco.conectar(config.carregar().banco)
    jid = banco.enfileirar(con, "qa", "p1", "v1")
    for _ in range(3):
        assert banco.pegar(con, "w")["id"] == jid
        estado = banco.falhar(con, jid, "erro")
    assert estado == "falhou" and banco.pegar(con, "w") is None


def test_pipeline_ponta_a_ponta_com_etapas_falsas(dados, monkeypatch):
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    _projeto(con, envio_fechado=True, pedido={"texto": "reel"})
    for aid in ("a001", "a002"):
        con.execute("INSERT INTO arquivos (id, projeto, nome, chave, bytes, criado) VALUES (?,?,?,?,?,?)", (aid, "p1", aid, aid, 1, banco.agora_iso()))
        banco.enfileirar(con, "ingest", "p1", aid)
    qa_chamadas = []

    def qa_falso(ctx):
        qa_chamadas.append(ctx.alvo)
        return {"aprovado": len(qa_chamadas) > 1}           # reprova a 1a, aprova a 2a
    falsas = {n: (lambda ctx, n=n: {"versao": "v1"} if n == "direcao" else {}) for n in etapas.ORDEM}
    falsas["qa"] = qa_falso
    monkeypatch.setattr(etapas, "_REGISTRO", falsas)
    monkeypatch.setattr(worker, "carregar_todas", lambda: falsas)
    n = 0
    while worker.rodar_um(con, cfg, None, "w") and n < 50:
        n += 1
    estado = con.execute("SELECT estado FROM projetos WHERE id='p1'").fetchone()["estado"]
    assert estado == "entregue", banco.jobs_do_projeto(con, "p1")
    assert qa_chamadas == ["v1", "v1"]
    tipos = [e["tipo"] for e in banco.eventos_desde(con, "p1")]
    assert "qa_reprovado" in tipos and tipos[-1] == "entregue"


def test_provedor_pago_sem_chave_cai_no_local(dados, monkeypatch):
    monkeypatch.setenv("EDITOR_CEREBRO", "anthropic")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("EDITOR_RENDER", "modal")
    cfg = config.carregar()
    assert cfg.provedor_efetivo("cerebro") == "fixture"
    assert cfg.provedor_efetivo("render") == "cpu"
