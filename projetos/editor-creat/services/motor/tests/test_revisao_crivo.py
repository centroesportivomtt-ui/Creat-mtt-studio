"""Revisão do Crivo (18/11): cada item 'bloqueia'/'importante' tem um teste que reproduz o cenário e prova a correção."""
import json
import time

import pytest

from motor import banco, config, pipeline


@pytest.fixture()
def con(dados):
    c = banco.conectar(config.carregar().banco)
    yield c
    c.close()


def _projeto(con, pid="p1", estado="recebendo", dados=None, tipo=None):
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, estado, tipo_video, criado, atualizado, dados) VALUES (?,?,?,?,?,?,?)",
                (pid, "t", estado, tipo, t, t, json.dumps(dados or {})))


# ---------- item 2: QA com transcrição quebrada / ausente NÃO aprova ----------
class _ConfFalsa:
    def __init__(self, tr, stems=None, edl=None):
        self._r = tr
        self.mix = None
        self.final = "final.mp4"
        self.stems = stems or {"ambiente": "amb.flac", "direto": "dir.flac"}
        self.edl = edl or {"voz": [{"id": "V1", "fonte": "a", "s0": 0, "s1": 2, "t0": 0, "t1": 2, "texto": "oi gente"}],
                           "tom_sala": {"fonte": "a", "s0": 10, "s1": 12},
                           "legendas": {"palavras": [[0.1, 0.5, "oi"], [0.6, 1.0, "gente"]]}}

    def transcrever(self, nome, arq, normalizar_nivel=False):
        return self._r

    from motor.etapas.qa import Conferencia as _C
    nao_verificado = staticmethod(_C.nao_verificado)
    palavras = staticmethod(_C.palavras)

    def palavras_legenda(self):
        return self.edl["legendas"]["palavras"]


@pytest.mark.parametrize("tr", [None, {"segmentos": [], "erro": "MemoryError: "}])
@pytest.mark.parametrize("mod", ["frase_repetida", "tom_sala_sem_voz", "legenda_x_fala"])
def test_qa_sem_ouvir_reprova_e_bloqueia(mod, tr):
    import importlib
    m = importlib.import_module(f"motor.etapas.qa.{mod}")
    r = m.checar(_ConfFalsa(tr))
    assert r["ok"] is False and r["bloqueia"] is True and "NÃO VERIFICADO" in r["detalhe"]


def test_transcritor_que_lanca_memoryerror_vira_erro(tmp_path, dados):
    from motor.etapas.qa import Conferencia

    class Quebra:
        def transcrever(self, *a, **k):
            raise MemoryError()
    c = Conferencia(tmp_path / "f.mp4", {"formato": {}}, config.carregar(), evidencias=tmp_path / "ev")
    c._transcritor = Quebra()
    arq = tmp_path / "x.wav"
    arq.write_bytes(b"0")
    r = c.transcrever("mix", arq)
    assert r["erro"].startswith("MemoryError")
    assert Conferencia.nao_verificado(r)["bloqueia"] is True


# ---------- itens 3 e 4: job morto 3 vezes e falha definitiva levam o projeto a 'erro' ----------
def test_job_morto_tres_vezes_vira_falhou_e_projeto_erro(con, dados):
    from motor import worker
    _projeto(con, estado="montando")
    jid = banco.enfileirar(con, "montagem", "p1", "v1")
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v1','p1','montada',?)", (banco.agora_iso(),))
    con.execute("UPDATE jobs SET estado='rodando', tentativas=3, aluguel_ate=? WHERE id=?", (time.time() - 5, jid))
    assert banco.pegar(con, "x") is None            # antes: ficava aqui para sempre
    assert worker.recolher_mortos(con) == 1
    assert con.execute("SELECT estado FROM jobs WHERE id=?", (jid,)).fetchone()["estado"] == "falhou"
    assert con.execute("SELECT estado FROM projetos WHERE id='p1'").fetchone()["estado"] == "erro"
    assert con.execute("SELECT estado FROM versoes WHERE id='v1'").fetchone()["estado"] == "erro"
    tipos = [e["tipo"] for e in banco.eventos_desde(con, "p1")]
    assert "etapa_erro" in tipos and "estado" in tipos


def test_erro_definitivo_na_direcao_leva_projeto_a_erro(con, dados, monkeypatch):
    from motor import worker
    from motor.etapas import ErroDefinitivo
    import motor.worker as W
    _projeto(con, estado="dirigindo")
    banco.enfileirar(con, "direcao", "p1")

    def quebra(ctx):
        raise ErroDefinitivo("direção fora do schema")
    monkeypatch.setattr(W, "obter", lambda nome: quebra)
    assert worker.rodar_um(con, config.carregar(), None, "t") is True
    r = con.execute("SELECT estado FROM projetos WHERE id='p1'").fetchone()
    assert r["estado"] == "erro"
    assert not con.in_transaction


def test_arquivo_corrompido_fica_de_fora_e_projeto_segue(con, dados):
    _projeto(con, estado="lendo", dados={"envio_fechado": True, "pedido": {"texto": "x"}})
    t = banco.agora_iso()
    for aid, est in (("a001", "analisado"), ("a002", "ingerido")):
        con.execute("INSERT INTO arquivos (id, projeto, nome, chave, bytes, estado, criado) VALUES (?,?,?,?,?,?,?)",
                    (aid, "p1", aid, f"entrada/p1/{aid}.mp4", 1, est, t))
    assert pipeline.pronto_para_dirigir(con, "p1") is False
    pipeline.falha_definitiva(con, {"etapa": "analise", "projeto": "p1", "alvo": "a002"}, "vídeo corrompido")
    assert con.execute("SELECT estado FROM arquivos WHERE id='a002'").fetchone()["estado"] == "falhou"
    assert con.execute("SELECT estado FROM projetos WHERE id='p1'").fetchone()["estado"] == "dirigindo"


def test_todos_os_arquivos_falharam_projeto_erro(con, dados):
    _projeto(con, estado="lendo", dados={"envio_fechado": True, "pedido": {"texto": "x"}})
    con.execute("INSERT INTO arquivos (id, projeto, nome, chave, bytes, estado, criado) VALUES ('a001','p1','a','entrada/p1/a.mp4',1,'recebido',?)",
                (banco.agora_iso(),))
    pipeline.falha_definitiva(con, {"etapa": "ingest", "projeto": "p1", "alvo": "a001"}, "corrompido")
    assert con.execute("SELECT estado FROM projetos WHERE id='p1'").fetchone()["estado"] == "erro"


# ---------- item 5: concluir + depois atômicos; reconciliador no start ----------
def test_depois_que_quebra_nao_deixa_job_feito_sem_seguinte(con, dados, monkeypatch):
    from motor import worker
    import motor.worker as W
    _projeto(con, estado="montando")
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v1','p1','montada',?)", (banco.agora_iso(),))
    jid = banco.enfileirar(con, "montagem", "p1", "v1")
    monkeypatch.setattr(W, "obter", lambda nome: (lambda ctx: {"versao": "v1"}))

    def morre(*a, **k):
        raise RuntimeError("máquina caiu aqui")
    monkeypatch.setattr(W.pipeline, "depois", morre)
    worker.rodar_um(con, config.carregar(), None, "t")
    j = con.execute("SELECT estado FROM jobs WHERE id=?", (jid,)).fetchone()
    assert j["estado"] == "pendente"                 # não ficou 'feito' sem a etapa seguinte


def test_reconciliar_reaplica_o_depois(con, dados):
    _projeto(con, estado="montando")
    jid = banco.enfileirar(con, "montagem", "p1", "v1")
    banco.concluir(con, jid, {"versao": "v1"})        # estado antigo: caiu entre concluir e depois
    assert pipeline.reconciliar(con) == 1
    assert con.execute("SELECT estado FROM jobs WHERE etapa='qa' AND alvo='v1'").fetchone()["estado"] == "pendente"
    assert pipeline.reconciliar(con) == 0            # já tem job na fila: não mexe


def test_batimento_renova_aluguel(con, dados):
    from motor.worker import _Batimento
    jid = banco.enfileirar(con, "ingest", "p1", "a1")
    job = banco.pegar(con, "t", aluguel_s=1)
    antes = con.execute("SELECT aluguel_ate FROM jobs WHERE id=?", (jid,)).fetchone()["aluguel_ate"]
    with _Batimento(config.carregar(), job["id"], intervalo=0.2):
        time.sleep(0.6)
    depois = con.execute("SELECT aluguel_ate FROM jobs WHERE id=?", (jid,)).fetchone()["aluguel_ate"]
    assert depois > antes + 50


# ---------- item 6: tipo do projeto chega ao pedido ----------
def test_pedido_herda_tipo_do_projeto(dados, monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    monkeypatch.setenv("MOTOR_TOKEN", "t")
    from motor.api.app import criar
    c = TestClient(criar())
    c.headers.update({"Authorization": "Bearer t"})
    pid = c.post("/v1/projetos", json={"nome": "x", "tipo_video": "evento"}).json()["id"]
    r = c.post(f"/v1/projetos/{pid}/pedido", json={"texto": "Reels de 30 s"})
    assert r.status_code == 201 and r.json()["pedido"]["tipo_video"] == "evento"
    r = c.post(f"/v1/projetos/{pid}/pedido", json={"texto": "Reels", "tipo_video": "anuncio"})
    assert r.json()["pedido"]["tipo_video"] == "anuncio"


# ---------- item 7: sem falante, a fala com rosto fica inteira ----------
def test_catalogo_sem_falante_protege_fala_com_rosto():
    from motor.etapas.catalogo import falas_protegidas
    clipes = [{"momentos": [{"tipo": "fala", "nota": 4, "t0": 0, "t1": 9, "desc": "fala com rosto em quadro"},
                            {"tipo": "fala", "nota": 3, "t0": 20, "t1": 25, "desc": "fala fora de quadro"}],
               "falas": [{"id": "F01.1", "t0": 0.5, "t1": 8, "falante": None, "texto": "a b c d e f g"},
                         {"id": "F01.2", "t0": 21, "t1": 24, "falante": None, "texto": "x y z w v"}]}]
    assert falas_protegidas(clipes) == {"F01.1"}
    clipes[0]["falas"][1]["falante"] = "Ruan"
    assert falas_protegidas(clipes) == frozenset()


# ---------- itens 1, 8, 9, 12 pela API ----------
@pytest.fixture()
def cli(dados, monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    monkeypatch.setenv("MOTOR_TOKEN", "tok")
    from motor.api.app import criar
    c = TestClient(criar())
    c.headers.update({"Authorization": "Bearer tok"})
    return c


def test_video_de_versao_nao_entregue_nao_sai(cli, con):
    from motor.provedores.armazenamento_local import ArmazenamentoLocal
    arm = ArmazenamentoLocal(config.carregar())
    arm.gravar_bytes("saidas/p1/v1/final.mp4", b"x" * 10)
    arm.gravar_bytes("saidas/p1/v1/qa/quadro.jpg", b"y")
    _projeto(con, estado="conferindo")
    con.execute("INSERT INTO versoes (id, projeto, estado, video, criado) VALUES ('v1','p1','reprovada_qa','saidas/p1/v1/final.mp4',?)",
                (banco.agora_iso(),))
    assert cli.get("/v1/arquivos/saidas/p1/v1/final.mp4").status_code == 403
    assert cli.head("/v1/arquivos/saidas/p1/v1/final.mp4").status_code == 403
    assert cli.get("/v1/arquivos/saidas/p1/v1/qa/quadro.jpg").status_code == 200     # evidência do QA continua
    v = cli.get("/v1/projetos/p1/versoes").json()["versoes"][0]
    assert v["link"] is None and v["video"] is None
    con.execute("UPDATE versoes SET estado='entregue' WHERE id='v1'")
    assert cli.get("/v1/arquivos/saidas/p1/v1/final.mp4").status_code == 200


def test_svg_enviado_sai_como_anexo(cli):
    from motor.provedores.armazenamento_local import ArmazenamentoLocal
    ArmazenamentoLocal(config.carregar()).gravar_bytes("entrada/p1/logo.svg", b"<svg/>")
    r = cli.get("/v1/arquivos/entrada/p1/logo.svg")
    assert r.status_code == 200 and r.headers["content-disposition"] == "attachment"


def test_fechar_envio_registra_orfao(cli):
    from motor.provedores.armazenamento_local import ArmazenamentoLocal
    arm = ArmazenamentoLocal(config.carregar())
    pid = cli.post("/v1/projetos", json={"nome": "x"}).json()["id"]
    arm.gravar_bytes(f"entrada/{pid}/registrado-aaaa.mp4", b"1" * 5)
    assert cli.post(f"/v1/projetos/{pid}/arquivos", json={"chave": f"entrada/{pid}/registrado-aaaa.mp4", "nome": "r.mp4", "bytes": 5}).status_code == 201
    arm.gravar_bytes(f"entrada/{pid}/orfao-bbbb.mp4", b"2" * 7)      # subiu com o motor fora: sem linha no banco
    r = cli.post(f"/v1/projetos/{pid}/fechar-envio")
    assert r.status_code == 200 and r.json()["arquivos"] == 2


def test_motor_sem_token_so_atende_loopback(dados, monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    monkeypatch.setenv("MOTOR_TOKEN", "")
    from motor.api import app as A
    assert TestClient(A.criar()).get("/v1/saude").status_code == 200            # testclient = loopback
    assert TestClient(A.criar(), client=("10.0.0.9", 5000)).get("/v1/saude").status_code == 401
    monkeypatch.setenv("MOTOR_HOST", "0.0.0.0")
    with pytest.raises(RuntimeError):
        A.criar()


def test_r2_transicao_sobe_o_arquivo_do_tus(dados):
    from motor.api.projetos import _promover_para_r2
    cfg = config.carregar()
    local = cfg.dados / "armazenamento" / "entrada" / "p1" / "v-1234.mp4"
    local.parent.mkdir(parents=True)
    local.write_bytes(b"z" * 3)

    class R2Falso:
        nome = "r2"
        def __init__(self):
            self.obj = {}
        def existe(self, k):
            return k in self.obj
        def gravar(self, k, origem, mover=False):
            self.obj[k] = origem.read_bytes()
            if mover:
                origem.unlink()
    r2 = R2Falso()
    _promover_para_r2(cfg, r2, "entrada/p1/v-1234.mp4")
    assert r2.obj["entrada/p1/v-1234.mp4"] == b"zzz" and not local.exists()


def test_reprovar_cancela_a_fila_da_versao_e_recusa_com_direcao_rodando(cli, con, tmp_path, monkeypatch):
    import shutil
    destino = tmp_path / "memoria"
    shutil.copytree(config.RAIZ_REPO / "memoria", destino)
    monkeypatch.setenv("EDITOR_MEMORIA", str(destino))          # nunca escreve na memória do repositório
    _projeto(con, estado="montando")
    con.execute("INSERT INTO versoes (id, projeto, estado, criado) VALUES ('v1','p1','montando',?)", (banco.agora_iso(),))
    banco.enfileirar(con, "montagem", "p1", "v1")
    r = cli.post("/v1/projetos/p1/versoes/v1/reprovar", json={"motivo": "ficou lento demais"})
    assert r.status_code == 200
    assert con.execute("SELECT estado FROM jobs WHERE etapa='montagem'").fetchone()["estado"] == "cancelado"
    con.execute("UPDATE jobs SET estado='rodando' WHERE etapa='direcao'")
    assert cli.post("/v1/projetos/p1/versoes/v1/reprovar", json={"motivo": "outra coisa"}).status_code == 409
