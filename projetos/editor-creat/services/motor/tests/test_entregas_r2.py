"""Filme aprovado vai para a página de entregas no Cloudflare R2 (pedido do dono, 25/11). Sem rede: S3 falso em dicionário e
HEAD público injetado."""
import hashlib
import io
import json
import time

import pytest

from motor import banco, config, entregas_r2 as R
from s3_falso import S3Falso

PUB = "https://pub-teste.r2.dev"
B = "creat-entregas-teste"


@pytest.fixture()
def ligado(dados, monkeypatch):                 # depois de `dados` (que tira as variáveis R2 do ambiente)
    for n, v in (("R2_ACCOUNT_ID", "conta"), ("R2_ACCESS_KEY_ID", "id"), ("R2_SECRET_ACCESS_KEY", "segredo"),
                 ("R2_ENTREGAS_BUCKET", B), ("R2_ENTREGAS_PUBLICO", PUB)):
        monkeypatch.setenv(n, v)


@pytest.fixture()
def s3(monkeypatch):
    f = S3Falso(pagina=3)                       # página pequena: o índice tem de paginar como o script
    from motor.etapas import entregas as E
    monkeypatch.setattr(E, "_s3", lambda: f)
    monkeypatch.setattr(R, "cliente_s3", lambda: f)
    f.head = []
    monkeypatch.setattr(R, "conferir_publico", lambda url, n, timeout=30: (f.head.append(url) or (not getattr(f, "head_falha", False)),
                                                                           503 if getattr(f, "head_falha", False) else 200))
    return f


@pytest.fixture()
def amb(dados):
    from motor.provedores.armazenamento_local import ArmazenamentoLocal
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    arm = ArmazenamentoLocal(cfg)
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, estado, criado, atualizado, dados) VALUES (?,?,?,?,?,?)",
                ("p1", "Cerveja Lavínia", "entregue", t, t, "{}"))
    return cfg, con, arm


def _versao(con, arm, v, conteudo=b"filme", legenda="Gancho\n\n@creat.mtt", aprovar=True, em=None):
    t = banco.agora_iso()
    con.execute("INSERT OR REPLACE INTO versoes (id, projeto, estado, criado) VALUES (?,?,?,?)", (v, "p1", "entregue", t))
    base = f"saidas/p1/{v}"
    arm.gravar(f"{base}/final.mp4", io.BytesIO(conteudo))
    arm.gravar(f"{base}/capa.jpg", io.BytesIO(b"capa-" + conteudo))
    arm.gravar(f"{base}/entrega.json", io.BytesIO(json.dumps({"versao": v, "sha256": hashlib.sha256(conteudo).hexdigest(),
                                                               "legenda_post": legenda}).encode()))
    if aprovar:
        banco.atualizar_dados(con, "p1", lambda d: d.setdefault("aprovadas", {}).__setitem__(v, {"em": em or banco.agora_iso()}))


def _rodar(cfg, con, arm, v, acao="enviar"):
    from motor.etapas import Contexto, entregas as E
    return E.etapa_entregas(Contexto(con=con, cfg=cfg, job={"id": "j", "etapa": "entregas", "projeto": "p1", "alvo": v,
                                                                 "entrada": {"acao": acao}}, armazenamento=arm))


def _mandar(con, v, cliente="super-kal"):
    from motor.api.versoes import _mandar_para_entregas
    return _mandar_para_entregas(con, "p1", v, cliente)


def _ent(con, v):
    return json.loads(con.execute("SELECT dados FROM projetos WHERE id='p1'").fetchone()["dados"])["entregas"][v]


def _indice(s3):
    return json.loads(s3.obj[(B, R.INDICE)]["corpo"])


def test_nomes_chaves_e_formato_iguais_ao_script():
    pasta = R.pasta_de("Super Kal", "2026-11-25", "Cerveja Lavínia")
    assert pasta == "super-kal/2026-11-25-cerveja-lavinia/"
    assert R.chaves_da_versao(pasta, "Cerveja Lavínia", "v2") == (pasta + "Cerveja_Lavinia_v2.mp4", pasta + "Cerveja_Lavinia_capa_v2.jpg")
    assert R.raiz_versao("Cerveja_Lavinia_v2.mp4") == R.raiz_versao("Cerveja_Lavinia_v3.mp4") != R.raiz_versao("Cerveja_Lavinia_capa_v3.jpg")
    assert R.chaves_da_versao("c/2026-11-25-x/", "😀", "v1")[0] == "c/2026-11-25-x/Projeto_v1.mp4"     # nunca nome vazio
    assert R.nome_cliente("super-kal") == "Super Kal"


def test_envia_video_capa_legenda_e_indice(ligado, s3, amb):
    cfg, con, arm = amb
    _versao(con, arm, "v1")
    _mandar(con, "v1")
    out = _rodar(cfg, con, arm, "v1")
    assert out.get("estado") == "no_ar" and out["subiu"] is True, out
    hoje = R.hoje_bahia()
    vk = f"super-kal/{hoje}-cerveja-lavinia/Cerveja_Lavinia_v1.mp4"
    ck = f"super-kal/{hoje}-cerveja-lavinia/Cerveja_Lavinia_capa_v1.jpg"
    o = s3.obj[(B, vk)]
    assert o["ContentType"] == "video/mp4" and o["ContentDisposition"] == 'attachment; filename="Cerveja_Lavinia_v1.mp4"'
    assert o["Metadata"]["sha256"] == hashlib.sha256(b"filme").hexdigest()
    assert o["Config"].multipart_threshold == 64 * 1024 * 1024 and o["Config"].multipart_chunksize == 32 * 1024 * 1024
    assert s3.obj[(B, ck)]["ContentType"] == "image/jpeg"
    idx = _indice(s3)
    assert idx["itens"] == [{"k": ck, "t": 10}, {"k": vk, "t": 5}] and len(idx["atualizado"]) == 16
    assert s3.obj[(B, R.INDICE)]["CacheControl"] == "no-store"
    meta = json.loads(s3.obj[(B, R.META)]["corpo"])
    assert meta == {f"super-kal/{hoje}-cerveja-lavinia": {"legenda": "Gancho\n\n@creat.mtt"}}
    assert (B, R.PAINEL) not in s3.obj                                       # a página é do script da creat-nuvem
    e = _ent(con, "v1")
    assert e["estado"] == "no_ar" and e["painel"] == f"{PUB}/entregas.html?c=super-kal" and e["video_url"] == f"{PUB}/{vk}"
    assert s3.head == [f"{PUB}/{vk}"]
    recibo = json.loads(arm.caminho_local("saidas/p1/v1/entregas.json").read_text())
    assert recibo["conferido"] is True and recibo["video"] == vk and recibo["bytes"] == 5
    assert con.execute("SELECT estado FROM projetos WHERE id='p1'").fetchone()["estado"] == "entregue"
    # 2a chamada: nada sobe de novo (mesmo tamanho e sha256 lá)
    s3.subidas.clear()
    assert _rodar(cfg, con, arm, "v1")["subiu"] is False and s3.subidas == []


def test_v3_tira_a_v2_da_pagina(ligado, s3, amb):
    cfg, con, arm = amb
    _versao(con, arm, "v2", b"v2", em="2026-11-25T10:00:00Z")
    _mandar(con, "v2")
    _rodar(cfg, con, arm, "v2")
    _versao(con, arm, "v3", b"v3-novo", em="2026-11-25T11:00:00Z")
    _mandar(con, "v3")
    _rodar(cfg, con, arm, "v3")
    ks = [i["k"].rsplit("/", 1)[1] for i in _indice(s3)["itens"]]
    assert ks == ["Cerveja_Lavinia_capa_v3.jpg", "Cerveja_Lavinia_v3.mp4"]
    assert _ent(con, "v2")["estado"] == "substituida" and _ent(con, "v2")["substituida_por"] == "v3"
    # a v2 atrasada na fila (aprovada antes) não volta para a página por cima da v3
    banco.atualizar_dados(con, "p1", lambda d: d["entregas"]["v2"].update(estado="pendente"))
    assert _rodar(cfg, con, arm, "v2")["estado"] == "substituida"
    assert [i["k"].rsplit("/", 1)[1] for i in _indice(s3)["itens"]] == ks


def test_rede_caindo_fica_pendente_e_o_projeto_segue_entregue(ligado, s3, amb):
    cfg, con, arm = amb
    _versao(con, arm, "v1")
    _mandar(con, "v1")
    s3.cair = True
    out = _rodar(cfg, con, arm, "v1")                                        # não levanta: a tarefa termina sem "falhou"
    assert out["estado"] == "pendente" and "ConnectionError" in out["motivo"]
    e = _ent(con, "v1")
    assert e["estado"] == "pendente" and e["proxima_ts"] > time.time() + 800 and len(e["proxima"]) == 5
    assert "segredo" not in json.dumps(e)
    assert con.execute("SELECT estado FROM projetos WHERE id='p1'").fetchone()["estado"] == "entregue"
    # subiu mas o endereço público não confere: pendente; a nova tentativa pula o upload e só confere de novo
    s3.cair, s3.head_falha = False, True
    assert _rodar(cfg, con, arm, "v1")["estado"] == "pendente" and "endereço público" in _ent(con, "v1")["motivo"]
    s3.head_falha = False
    s3.subidas.clear()
    assert _rodar(cfg, con, arm, "v1")["estado"] == "no_ar" and s3.subidas == []


def test_reenfileirar_respeita_a_hora_e_desiste_em_7_dias(ligado, s3, amb):
    cfg, con, arm = amb
    _versao(con, arm, "v1")
    agora = time.time()
    banco.atualizar_dados(con, "p1", lambda d: d.setdefault("entregas", {}).__setitem__(
        "v1", {"estado": "pendente", "proxima_ts": agora + 600, "pendente_desde": agora, "cliente": "super-kal"}))
    assert R.reenfileirar_pendentes(con, agora) == 0
    assert R.reenfileirar_pendentes(con, agora + 601) == 1
    j = con.execute("SELECT estado, entrada FROM jobs WHERE etapa='entregas' AND alvo='v1'").fetchone()
    assert j["estado"] == "pendente" and json.loads(j["entrada"]) == {"acao": "enviar"}
    con.execute("UPDATE jobs SET estado='feito'")
    assert R.reenfileirar_pendentes(con, agora + 601) == 1                   # o enfileirar rearma a tarefa já terminada
    assert con.execute("SELECT estado FROM jobs WHERE etapa='entregas'").fetchone()["estado"] == "pendente"
    assert R.reenfileirar_pendentes(con, agora + R.DESISTIR_S + 10) == 0
    assert _ent(con, "v1")["estado"] == "falhou" and "7 dias" in _ent(con, "v1")["motivo"]


def test_sha_diferente_do_aprovado_nao_sobe(ligado, s3, amb):
    cfg, con, arm = amb
    _versao(con, arm, "v1")
    arm.gravar("saidas/p1/v1/final.mp4", io.BytesIO(b"mexido depois"))
    _mandar(con, "v1")
    out = _rodar(cfg, con, arm, "v1")
    assert out["estado"] == "falhou" and "sha256" in out["motivo"] and s3.subidas == []


def test_versao_nao_aprovada_nao_sobe(ligado, s3, amb):
    cfg, con, arm = amb
    _versao(con, arm, "v1", aprovar=False)
    _mandar(con, "v1")
    assert _rodar(cfg, con, arm, "v1")["estado"] == "falhou" and s3.subidas == []


def test_legenda_do_dono_preservada(ligado, s3, amb):
    cfg, con, arm = amb
    pasta = f"super-kal/{R.hoje_bahia()}-cerveja-lavinia"
    s3.put_object(Bucket=B, Key=R.META, Body=json.dumps({pasta: {"legenda": "A legenda que o Marcos ditou"},
                                                          "outro/2026-11-01-x": {"legenda": "de outro projeto"}}).encode())
    _versao(con, arm, "v1")
    _mandar(con, "v1")
    _rodar(cfg, con, arm, "v1")
    meta = json.loads(s3.obj[(B, R.META)]["corpo"])
    assert meta[pasta]["legenda"] == "A legenda que o Marcos ditou" and meta["outro/2026-11-01-x"]["legenda"] == "de outro projeto"
    # a legenda que o EDITOR pôs pode ser trocada pela da versão nova (e só ela)
    s3.put_object(Bucket=B, Key=R.META, Body=json.dumps({"outro/2026-11-01-x": {"legenda": "de outro projeto"}}).encode())
    _rodar(cfg, con, arm, "v1")
    _versao(con, arm, "v2", b"v2", legenda="Legenda nova", em="2099-01-01T00:00:00Z")
    _mandar(con, "v2")
    _rodar(cfg, con, arm, "v2")
    meta = json.loads(s3.obj[(B, R.META)]["corpo"])
    assert meta[pasta]["legenda"] == "Legenda nova" and meta["outro/2026-11-01-x"]["legenda"] == "de outro projeto"


def test_meta_ilegivel_nao_apaga_as_legendas_dos_outros(ligado, s3, amb):
    cfg, con, arm = amb
    s3.put_object(Bucket=B, Key=R.META, Body=json.dumps({"outro/2026-11-01-x": {"legenda": "x"}}).encode())
    orig = s3.get_object

    def get_quebrado(Bucket, Key):
        if Key == R.META:
            raise TimeoutError("lento")
        return orig(Bucket=Bucket, Key=Key)
    s3.get_object = get_quebrado
    _versao(con, arm, "v1")
    _mandar(con, "v1")
    assert _rodar(cfg, con, arm, "v1")["estado"] == "pendente"
    assert json.loads(s3.obj[(B, R.META)]["corpo"]) == {"outro/2026-11-01-x": {"legenda": "x"}}


def test_retirar_ao_reprovar(ligado, s3, amb, monkeypatch):
    cfg, con, arm = amb
    _versao(con, arm, "v1")
    _mandar(con, "v1")
    _rodar(cfg, con, arm, "v1")
    from motor.api.direcao import _retirar_das_entregas
    _retirar_das_entregas(con, "p1", "v1")
    assert _ent(con, "v1")["estado"] == "retirando"
    j = con.execute("SELECT entrada FROM jobs WHERE etapa='entregas' AND alvo='v1'").fetchone()
    assert json.loads(j["entrada"]) == {"acao": "retirar"}
    assert _rodar(cfg, con, arm, "v1", "retirar")["estado"] == "retirada"
    assert s3.chaves(B) == sorted([R.INDICE, R.META]) and _indice(s3)["itens"] == []
    assert json.loads(s3.obj[(B, R.META)]["corpo"]) == {}                   # a legenda era do editor: saiu junto
    assert _ent(con, "v1")["estado"] == "retirada"


def test_reprovada_enquanto_subia_sai_no_fim(ligado, s3, amb, monkeypatch):
    cfg, con, arm = amb
    _versao(con, arm, "v1")
    _mandar(con, "v1")
    orig = R.atualizar_indice

    def indice_e_reprova(s, b, agora=None):
        banco.atualizar_dados(con, "p1", lambda d: d["entregas"]["v1"].update(estado="retirando"))
        return orig(s, b, agora)
    monkeypatch.setattr(R, "atualizar_indice", indice_e_reprova)
    assert _rodar(cfg, con, arm, "v1")["estado"] == "retirada"
    assert [k for k in s3.chaves(B) if k.endswith(".mp4")] == []


def test_desligado_aprovar_fica_identico(dados, monkeypatch):
    pytest.importorskip("fastapi")
    import shutil
    from fastapi.testclient import TestClient
    destino = dados.parent / "memoria"
    shutil.copytree(config.MEMORIA, destino)
    monkeypatch.setenv("EDITOR_MEMORIA", str(destino))
    monkeypatch.setenv("MOTOR_TOKEN", "t")
    from motor.api.app import criar
    c = TestClient(criar())
    c.headers.update({"Authorization": "Bearer t"})
    con = banco.conectar(config.carregar().banco)
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, estado, criado, atualizado, dados) VALUES ('p1','Super Kal promo','entregue',?,?,'{}')", (t, t))
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v1','p1','entregue',?)", (t,))
    r = c.post("/v1/projetos/p1/versoes/v1/aprovar", json={})
    assert r.status_code == 200 and set(r.json()) == {"aprovada", "caso"}
    assert con.execute("SELECT COUNT(*) n FROM jobs").fetchone()["n"] == 0
    assert "entregas" not in c.get("/v1/projetos/p1/versoes").json()["versoes"][0]
    assert c.post("/v1/projetos/p1/versoes/v1/entregas").status_code == 409
    assert c.get("/v1/saude").json()["entregas"] == {"ligado": False}
    # ligado: o cliente que o site mandou ganha da adivinhação; a resposta e a lista de versões ganham o campo
    for n, v in (("R2_ACCOUNT_ID", "conta"), ("R2_ACCESS_KEY_ID", "id"), ("R2_SECRET_ACCESS_KEY", "segredo"),
                 ("R2_ENTREGAS_BUCKET", B), ("R2_ENTREGAS_PUBLICO", PUB)):
        monkeypatch.setenv(n, v)
    monkeypatch.setattr(R, "clientes_do_indice", lambda timeout=5: ["elite-drako-gym", "super-kal"])
    assert c.post("/v1/projetos/p1/versoes/v1/aprovar", json={"cliente": "Super Kal"}).status_code == 422   # formato inválido
    r = c.post("/v1/projetos/p1/versoes/v1/aprovar", json={"cliente": "marcos"})
    assert r.status_code == 200 and r.json()["entregas"]["estado"] == "enviando" and r.json()["entregas"]["cliente"] == "marcos"
    j = con.execute("SELECT etapa, alvo, estado, prioridade FROM jobs").fetchall()
    assert [tuple(x) for x in j] == [("entregas", "v1", "pendente", 6)]
    v = c.get("/v1/projetos/p1/versoes").json()["versoes"][0]["entregas"]
    assert v["estado"] == "enviando" and v["nome_cliente"] == "Marcos"
    r = c.post("/v1/projetos/p1/versoes/v1/aprovar", json={})
    assert r.json()["entregas"]["cliente"] == "super-kal"                    # adivinhado pelo nome do projeto
    cl = c.get("/v1/entregas/clientes?projeto=p1").json()
    assert [x["slug"] for x in cl["clientes"]] == ["super-kal", "creat-mtt", "marcos", "elite-drako-gym"] and cl["sugerido"] == "super-kal"
    assert c.post("/v1/projetos/p1/versoes/v1/entregas", json={"cliente": "elite-drako-gym"}).json()["entregas"]["cliente"] == "elite-drako-gym"
    assert c.post("/v1/projetos/p1/versoes/v9/entregas").status_code == 404


def test_adivinhar_cliente():
    assert R.escolher_cliente(None, None, "Promo SuperKal Natal") == "super-kal"
    assert R.escolher_cliente(None, {"texto": "reel do super-kal"}, "Promo") == "super-kal"
    assert R.escolher_cliente(None, {"cliente": "elite-drako-gym"}, "Super Kal") == "elite-drako-gym"
    assert R.escolher_cliente("marcos", {"cliente": "elite-drako-gym"}, "Super Kal") == "marcos"
    assert R.escolher_cliente(None, {}, "Reel da Lavínia") == "creat-mtt"


def test_saude_prova_a_permissao(ligado, dados):
    cfg = config.carregar()
    s = S3Falso()
    assert R.estado_saude(cfg, provar=True, s3=s) == {"ligado": True, "permissao": "ok"}
    s.cair = True
    assert R.estado_saude(cfg, provar=True, s3=s)["permissao"] == "erro: ConnectionError"
    R.marcar_ok(cfg)
    assert "ultimo_ok" in R.estado_saude(cfg)


def test_falha_inesperada_nao_poe_o_projeto_em_erro(amb):
    cfg, con, arm = amb
    from motor import pipeline
    pipeline.falha_definitiva(con, {"etapa": "entregas", "projeto": "p1", "alvo": "v1"}, "KeyError: x")
    assert con.execute("SELECT estado FROM projetos WHERE id='p1'").fetchone()["estado"] == "entregue"


def test_worker_roda_a_etapa_de_fundo_sem_linha_do_tempo(ligado, s3, amb):
    from motor import worker
    cfg, con, arm = amb
    _versao(con, arm, "v1")
    _mandar(con, "v1")
    antes = con.execute("SELECT MAX(id) m FROM eventos").fetchone()["m"] or 0
    assert worker.rodar_um(con, cfg, arm, "teste") is True
    assert con.execute("SELECT estado FROM jobs WHERE etapa='entregas'").fetchone()["estado"] == "feito"
    tipos = [r["tipo"] for r in con.execute("SELECT tipo FROM eventos WHERE id>?", (antes,))]
    assert tipos == ["estado"]                                              # só o aviso "Filme v1 na página de entregas"
    assert _ent(con, "v1")["estado"] == "no_ar"
