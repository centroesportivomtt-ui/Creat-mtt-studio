"""Espelho do material enviado no Cloudflare R2 (creat-editor-midia). Desligado por padrão (custa saída do Railway); sem rede:
S3 falso em dicionário."""
import io
import time

import pytest

from motor import banco, config, pipeline
from motor.etapas import espelho as ESP
from s3_falso import S3Falso

B = "creat-editor-midia-teste"


@pytest.fixture()
def amb(dados):
    from motor.provedores.armazenamento_local import ArmazenamentoLocal
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    arm = ArmazenamentoLocal(cfg)
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado, dados) VALUES ('p1','t',?,?,'{}')", (t, t))
    return cfg, con, arm


@pytest.fixture()
def ligado(amb, monkeypatch):
    for n, v in (("R2_ACCOUNT_ID", "conta"), ("R2_ACCESS_KEY_ID", "id"), ("R2_SECRET_ACCESS_KEY", "segredo"),
                 ("R2_MIDIA_BUCKET", B), ("EDITOR_ESPELHO", "1")):
        monkeypatch.setenv(n, v)
    s3 = S3Falso()
    monkeypatch.setattr(ESP, "cliente_s3", lambda: s3)
    return s3


def _arquivo(con, arm, aid, n=10, criado=None):
    chave = f"entrada/p1/{aid}.mp4"
    arm.gravar(chave, io.BytesIO(b"x" * n))
    con.execute("INSERT INTO arquivos (id, projeto, nome, chave, bytes, estado, criado) VALUES (?,?,?,?,?,?,?)",
                (aid, "p1", f"{aid}.mp4", chave, n, "analisado", criado or banco.agora_iso()))
    return chave


def _estado(con, chave):
    r = con.execute("SELECT estado FROM nuvem WHERE chave=?", (chave,)).fetchone()
    return r["estado"] if r else None


def test_desligado_nao_cria_tarefa(amb):
    cfg, con, arm = amb
    _arquivo(con, arm, "a001")
    pipeline.depois(con, {"etapa": "analise", "projeto": "p1", "alvo": "a001"}, {})
    assert con.execute("SELECT COUNT(*) n FROM jobs WHERE etapa='espelho'").fetchone()["n"] == 0
    assert ESP.volta(con) == 0 and ESP.resumo(con, "p1") is None


def test_guarda_com_a_mesma_chave_e_confere_o_tamanho(ligado, amb):
    s3 = ligado
    cfg, con, arm = amb
    chave = _arquivo(con, arm, "a001")
    pipeline.depois(con, {"etapa": "analise", "projeto": "p1", "alvo": "a001"}, {})
    j = con.execute("SELECT alvo, prioridade FROM jobs WHERE etapa='espelho'").fetchone()
    assert (j["alvo"], j["prioridade"]) == ("a001", 9)
    assert ESP.guardar(con, arm, "p1", chave) == "guardado"
    assert s3.chaves(B) == [chave]                                         # chave no R2 = chave local
    cfgt = s3.obj[(B, chave)]["Config"]
    assert cfgt.max_request_concurrency == 2 and cfgt.multipart_chunksize == 32 << 20
    assert _estado(con, chave) == "guardado"
    s3.subidas.clear()
    assert ESP.guardar(con, arm, "p1", chave) == "guardado" and s3.subidas == []          # idempotente
    assert ESP.resumo(con, "p1") == {"guardados": 1, "total": 1, "bytes": 10, "pendentes": 0, "fora_do_teto": 0, "teto_gb": 4.0}


def test_tamanho_diferente_e_rede_caindo_ficam_pendentes(ligado, amb):
    s3 = ligado
    cfg, con, arm = amb
    chave = _arquivo(con, arm, "a001")
    orig = s3.upload_file
    s3.upload_file = lambda origem, b, k, **kw: (orig(origem, b, k, **kw), s3.obj[(b, k)].update(corpo=b"curto"))
    assert ESP.guardar(con, arm, "p1", chave) == "pendente"
    r = con.execute("SELECT erro, proxima FROM nuvem WHERE chave=?", (chave,)).fetchone()
    assert "esperado 10" in r["erro"] and r["proxima"] > time.time() + 800
    s3.upload_file = orig
    s3.obj.clear()
    s3.cair = True
    assert ESP.guardar(con, arm, "p1", chave) == "pendente"
    assert arm.existe(chave)                                               # o original continua no editor
    # o laço rearma só quando chega a hora
    assert ESP.volta(con, time.time()) == 0
    assert ESP.volta(con, time.time() + ESP.REPETIR_S + 5) == 1
    s3.cair = False
    from motor.etapas import Contexto
    job = {"id": "j", "etapa": "espelho", "projeto": "p1", "alvo": "a001", "entrada": {}}
    assert ESP.etapa_espelho(Contexto(con=con, cfg=cfg, job=job, armazenamento=arm)) == {"estado": "guardado"}


def test_teto_do_espaco_gratis(ligado, amb, monkeypatch):
    cfg, con, arm = amb
    monkeypatch.setenv("EDITOR_ESPELHO_TETO_GB", str(15 / (1 << 30)))       # teto de 15 bytes
    c1, c2 = _arquivo(con, arm, "a001"), _arquivo(con, arm, "a002")
    assert ESP.guardar(con, arm, "p1", c1) == "guardado"
    assert ESP.guardar(con, arm, "p1", c2) == "fora_do_teto"
    assert ESP.resumo(con, "p1")["fora_do_teto"] == 1


def test_recupera_projetos_antigos_5_por_volta(ligado, amb):
    cfg, con, arm = amb
    for i in range(7):
        _arquivo(con, arm, f"a{i + 1:03d}", criado=f"2026-11-{10 + i:02d}T00:00:00Z")
    assert ESP.volta(con) == 5
    alvos = sorted(r["alvo"] for r in con.execute("SELECT alvo FROM jobs WHERE etapa='espelho'"))
    assert alvos == ["a003", "a004", "a005", "a006", "a007"]               # do mais novo para o mais velho
    assert ESP.volta(con) == 2                                             # os que já estão na fila não entram de novo


def test_falha_do_espelho_nao_poe_o_projeto_em_erro(amb):
    cfg, con, arm = amb
    banco.mudar_estado(con, "p1", "montando")
    pipeline.falha_definitiva(con, {"etapa": "espelho", "projeto": "p1", "alvo": "a001"}, "IOError: x")
    assert con.execute("SELECT estado FROM projetos WHERE id='p1'").fetchone()["estado"] == "montando"


def test_rota_do_projeto_mostra_a_nuvem_so_ligada(amb, monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    cfg, con, arm = amb
    _arquivo(con, arm, "a001")
    monkeypatch.setenv("MOTOR_TOKEN", "t")
    from motor.api.app import criar
    c = TestClient(criar())
    c.headers.update({"Authorization": "Bearer t"})
    p = c.get("/v1/projetos/p1").json()
    assert "nuvem" not in p and "nuvem" not in p["arquivos"][0]
    for n, v in (("R2_ACCOUNT_ID", "conta"), ("R2_ACCESS_KEY_ID", "id"), ("R2_SECRET_ACCESS_KEY", "segredo"),
                 ("R2_MIDIA_BUCKET", B), ("EDITOR_ESPELHO", "1")):
        monkeypatch.setenv(n, v)
    s3 = S3Falso()
    monkeypatch.setattr(ESP, "cliente_s3", lambda: s3)
    ESP.guardar(con, arm, "p1", "entrada/p1/a001.mp4")
    p = c.get("/v1/projetos/p1").json()
    assert p["nuvem"]["guardados"] == 1 and p["arquivos"][0]["nuvem"] == "guardado"
    assert c.get("/v1/saude").json()["espelho"] == {"ligado": True, "teto_gb": 4.0}


def test_worker_periodicas_nao_derruba(amb, monkeypatch):
    from motor import entregas_r2, worker
    cfg, con, arm = amb
    monkeypatch.setattr(entregas_r2, "reenfileirar_pendentes", lambda con, agora=None: 1 / 0)
    out = worker.periodicas(con)
    assert out == {"espelho": 0} and not con.in_transaction


def test_mesmo_tamanho_com_outro_conteudo_nao_conta_como_copia(ligado, amb):
    s3 = ligado
    cfg, con, arm = amb
    chave = _arquivo(con, arm, "a001")
    s3.put_object(Bucket=B, Key=chave, Body=b"y" * 10)                     # chave reaproveitada, mesmo tamanho, outro filme
    assert ESP.guardar(con, arm, "p1", chave) == "guardado"
    assert s3.obj[(B, chave)]["corpo"] == b"x" * 10 and s3.subidas == [chave]
    import hashlib
    assert s3.obj[(B, chave)]["Metadata"]["sha256"] == hashlib.sha256(b"x" * 10).hexdigest()


def test_original_sumido_nao_volta_para_a_fila_toda_volta(ligado, amb):
    cfg, con, arm = amb
    chave = _arquivo(con, arm, "a001")
    arm.apagar(chave) if hasattr(arm, "apagar") else arm.caminho_local(chave).unlink()
    for i in range(2, 8):
        _arquivo(con, arm, f"a{i:03d}", criado="2026-01-01T00:00:00Z")
    from motor.etapas import Contexto
    job = {"id": "j", "etapa": "espelho", "projeto": "p1", "alvo": "a001", "entrada": {}}
    assert ESP.etapa_espelho(Contexto(con=con, cfg=cfg, job=job, armazenamento=arm)) == {"estado": "sem_original"}
    assert _estado(con, chave) == "sem_original"
    assert ESP.volta(con) == 5
    alvos = {r["alvo"] for r in con.execute("SELECT alvo FROM jobs WHERE etapa='espelho'")}
    assert "a001" not in alvos                                             # os antigos avançam, o sumido não come a vez


def test_worker_sem_espelho_e_worker_so_de_espelho(ligado, amb):
    from motor import worker
    cfg, con, arm = amb
    _arquivo(con, arm, "a001")
    banco.enfileirar(con, "espelho", "p1", "a001", prioridade=9)
    assert worker.rodar_um(con, cfg, arm, "w1", None, sem=["espelho"]) is False     # o worker da edição não pega upload de GB
    assert worker.rodar_um(con, cfg, arm, "w2", ["espelho"]) is True
    assert _estado(con, "entrada/p1/a001.mp4") == "guardado"
