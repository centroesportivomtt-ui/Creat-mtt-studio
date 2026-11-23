"""Correções da revisão: (1) idempotência do ingest não pode depender do mtime da cópia em cache (contêiner novo na
Modal = cache novo); (2) memória da casa (regras do dono) compartilhada entre contêineres pelo R2 com escrita
condicional. "Contêiner" aqui = provedor/Loja com disco próprio, apontando para o MESMO bucket falso em memória."""
import datetime as dt
import hashlib
import io
import os
import pathlib
import shutil
import types

import pytest

from motor import banco, config
from motor.etapas import Contexto


# ---------------------------------------------------------------- bucket S3 falso (em memória, sem rede)
class ErroS3(Exception):
    def __init__(self, codigo):
        super().__init__(codigo)
        self.response = {"Error": {"Code": codigo}}


class BucketFalso:
    def __init__(self):
        self.obj: dict[str, tuple[bytes, str, dt.datetime]] = {}
        self.puts = 0

    def _guardar(self, chave, dados):
        etag = hashlib.md5(dados).hexdigest()
        self.obj[chave] = (dados, etag, dt.datetime(2026, 11, 18, 12, 0, 0, tzinfo=dt.timezone.utc) + dt.timedelta(seconds=len(self.obj)))

    def _pegar(self, chave):
        if chave not in self.obj:
            raise ErroS3("NoSuchKey")
        return self.obj[chave]

    def head_object(self, Bucket, Key):
        d, etag, mod = self._pegar(Key)
        return {"ContentLength": len(d), "ETag": f'"{etag}"', "LastModified": mod, "ContentType": "application/octet-stream"}

    def get_object(self, Bucket, Key, Range=None):
        d, etag, _ = self._pegar(Key)
        return {"Body": io.BytesIO(d), "ETag": f'"{etag}"'}

    def put_object(self, Bucket, Key, Body, ContentType=None, IfMatch=None, IfNoneMatch=None):
        self.puts += 1
        atual = self.obj.get(Key)
        if IfNoneMatch == "*" and atual is not None:
            raise ErroS3("PreconditionFailed")
        if IfMatch is not None and (atual is None or f'"{atual[1]}"' != IfMatch):
            raise ErroS3("PreconditionFailed")
        self._guardar(Key, Body if isinstance(Body, bytes) else Body.read())
        return {"ETag": f'"{self.obj[Key][1]}"'}

    def upload_file(self, origem, Bucket, Key):
        self._guardar(Key, pathlib.Path(origem).read_bytes())

    def upload_fileobj(self, f, Bucket, Key):
        self._guardar(Key, f.read())

    def download_file(self, Bucket, Key, destino):
        pathlib.Path(destino).write_bytes(self._pegar(Key)[0])

    def delete_object(self, Bucket, Key):
        self.obj.pop(Key, None)

    def get_paginator(self, nome):
        bucket = self

        class P:
            def paginate(self, Bucket, Prefix):
                yield {"Contents": [{"Key": k} for k in sorted(bucket.obj) if k.startswith(Prefix)]}
        return P()


@pytest.fixture()
def bucket(monkeypatch):
    monkeypatch.setenv("R2_BUCKET", "balde")
    return BucketFalso()


def _r2(bucket, disco):
    from motor.provedores.armazenamento_r2 import ArmazenamentoR2
    return ArmazenamentoR2(types.SimpleNamespace(dados=disco), cliente=bucket)


# ---------------------------------------------------------------- 1) ingest idempotente entre contêineres
@pytest.fixture()
def projeto(dados, monkeypatch, tmp_path):
    monkeypatch.setenv("EDITOR_MODELOS_BAIXAR", "0")
    from motor.ferramentas.aceite_a import gerar_sintetico
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    agora = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado) VALUES ('p_nuvem1','t',?,?)", (agora, agora))
    video = gerar_sintetico(tmp_path / "s.mov", tipo="silencio", w=320, h=180, dur=3)
    con.execute("INSERT INTO arquivos (id, projeto, nome, chave, bytes, criado) VALUES ('a001','p_nuvem1','s.mov',?,?,?)",
                ("entrada/p_nuvem1/s.mov", video.stat().st_size, agora))
    return cfg, con, video


def _ingest(cfg, con, arm):
    from motor.etapas.ingest import ingest
    job = {"id": "j_ingest", "etapa": "ingest", "projeto": "p_nuvem1", "alvo": "a001", "entrada": {}}
    return ingest(Contexto(con=con, cfg=cfg, job=job, armazenamento=arm))


def test_ingest_pula_em_contener_novo_com_cache_de_mtime_diferente(projeto, bucket, tmp_path):
    cfg, con, video = projeto
    c1 = _r2(bucket, tmp_path / "conteiner1")
    c1.gravar("entrada/p_nuvem1/s.mov", video)
    primeiro = _ingest(cfg, con, c1)
    assert not primeiro.get("pulado") and primeiro["quadros"] > 0
    c2 = _r2(bucket, tmp_path / "conteiner2")                       # contêiner novo: cache vazio, outro disco
    copia = c2.caminho_local("entrada/p_nuvem1/s.mov")
    os.utime(copia, (1_000_000_000, 1_000_000_000))                 # mtime da cópia nada tem a ver com o objeto
    assert c2.caminho_local("entrada/p_nuvem1/s.mov") == copia      # ETag bate: não baixa de novo
    assert _ingest(cfg, con, c2) == {"pulado": True, "quadros": primeiro["quadros"]}


def test_ingest_refaz_quando_o_objeto_muda(projeto, bucket, tmp_path):
    cfg, con, video = projeto
    c1 = _r2(bucket, tmp_path / "c1")
    c1.gravar("entrada/p_nuvem1/s.mov", video)
    _ingest(cfg, con, c1)
    outro = tmp_path / "outro.mov"
    shutil.copyfile(video, outro)
    with open(outro, "ab") as f:
        f.write(b"\0" * 16)                                         # outro conteúdo, outro ETag
    c1.gravar("entrada/p_nuvem1/s.mov", outro)
    assert not _ingest(cfg, con, _r2(bucket, tmp_path / "c2")).get("pulado")


def test_identidade_local_continua_por_mtime(dados, tmp_path, bucket):
    from motor.etapas.ingest import identidade_do_objeto
    from motor.provedores.armazenamento_local import ArmazenamentoLocal
    arm = ArmazenamentoLocal(config.carregar())
    f = tmp_path / "x.bin"
    f.write_bytes(b"abc")
    arm.gravar("entrada/p/x.bin", f)
    local = arm.caminho_local("entrada/p/x.bin")
    assert identidade_do_objeto(arm, "entrada/p/x.bin", local)[0] == "mtime"
    r2 = _r2(bucket, tmp_path / "c")
    r2.gravar("entrada/p/x.bin", f)
    ident = identidade_do_objeto(r2, "entrada/p/x.bin", r2.caminho_local("entrada/p/x.bin"))
    assert ident == ("etag", 3, hashlib.md5(b"abc").hexdigest())


def test_cache_do_r2_ganha_o_last_modified(bucket, tmp_path):
    f = tmp_path / "y.bin"
    f.write_bytes(b"conteudo")
    a = _r2(bucket, tmp_path / "c1")
    a.gravar("entrada/p/y.bin", f)
    esperado = bucket.head_object("balde", "entrada/p/y.bin")["LastModified"].timestamp()
    for disco in ("c2", "c3"):
        p = _r2(bucket, tmp_path / disco).caminho_local("entrada/p/y.bin")
        assert abs(p.stat().st_mtime - esperado) < 1e-3


# ---------------------------------------------------------------- 2) memória entre contêineres
@pytest.fixture()
def sementes(tmp_path):
    out = []
    for n in ("api", "worker"):
        d = tmp_path / f"memoria_{n}"
        shutil.copytree(config.MEMORIA, d)
        out.append(d)
    return out


def test_dois_conteineres_veem_a_regra_nova(bucket, sementes):
    from motor.memoria.loja import Loja, MemoriaR2
    api = Loja(sementes[0], remota=MemoriaR2(bucket, "balde"))
    worker = Loja(sementes[1], remota=MemoriaR2(bucket, "balde"))
    antes_semente = (sementes[0] / "regras.json").read_text()
    n0 = len(worker.regras())
    r = api.registrar_reprovacao("p1", "v1", "legenda em cima do rosto do Marcos no gancho")
    assert any(x["id"] == r["regra"]["id"] for x in worker.regras()) and len(worker.regras()) == n0 + 1
    assert any(c["id"] == r["checagem"]["id"] for c in worker.checagens())
    assert (sementes[0] / "regras.json").read_text() == antes_semente   # a semente da imagem não muda
    assert set(bucket.obj) == {"memoria/regras.json", "memoria/checagens.json"}
    r2 = worker.registrar_reprovacao("p1", "v2", "música alta demais por baixo da fala")
    ids = {x["id"] for x in api.regras()}
    assert {r["regra"]["id"], r2["regra"]["id"]} <= ids                 # e no sentido contrário também


def test_reprovacoes_simultaneas_nao_se_perdem(bucket, sementes):
    from motor.memoria.loja import Loja, MemoriaR2
    a = Loja(sementes[0], remota=MemoriaR2(bucket, "balde"))
    b = Loja(sementes[1], remota=MemoriaR2(bucket, "balde"))
    a.registrar_reprovacao("p0", "v0", "corte seco demais no convite final")   # objetos já existem no R2
    original = bucket.put_object
    estado = {"injetou": False}

    def put_com_corrida(**k):
        if not estado["injetou"] and k["Key"] == "memoria/regras.json":
            estado["injetou"] = True                                 # B grava entre a leitura e a escrita de A
            bucket.put_object = original
            b.registrar_reprovacao("p2", "v1", "logo pequeno no fim do vídeo")
            bucket.put_object = put_com_corrida
        return original(**k)
    bucket.put_object = put_com_corrida
    try:
        ra = a.registrar_reprovacao("p1", "v1", "zoom rápido demais na fala do Ruan")
    finally:
        bucket.put_object = original
    textos = {x["motivo"] for x in a.regras() if x.get("motivo")}
    assert {"zoom rápido demais na fala do Ruan", "logo pequeno no fim do vídeo", "corte seco demais no convite final"} <= textos
    assert estado["injetou"] and ra["regra"]["id"] in {x["id"] for x in b.regras()}


def test_conflito_sem_fim_desiste_com_erro_claro(bucket, sementes):
    from motor.memoria import loja as L
    a = L.Loja(sementes[0], remota=L.MemoriaR2(bucket, "balde"))

    def sempre_412(**k):
        raise ErroS3("PreconditionFailed")
    bucket.put_object = sempre_412
    with pytest.raises(RuntimeError, match="mudou"):
        a.registrar_reprovacao("p1", "v1", "qualquer coisa")


def test_memoria_remota_so_liga_na_nuvem(monkeypatch, sementes):
    from motor.memoria import loja as L
    for n in ("EDITOR_MEMORIA_REMOTA", "EDITOR_SEM_ESTADO", "EDITOR_ARMAZENAMENTO"):
        monkeypatch.delenv(n, raising=False)
    assert L.Loja(sementes[0]).remota is None                          # dev e testes: arquivo local, como antes
    monkeypatch.setenv("EDITOR_SEM_ESTADO", "1")
    monkeypatch.setenv("EDITOR_ARMAZENAMENTO", "r2")
    for n in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"):
        monkeypatch.setenv(n, "falso" + n.lower().replace("_", ""))
    pytest.importorskip("boto3")
    assert isinstance(L.Loja(sementes[0]).remota, L.MemoriaR2)        # cria o cliente, não chama a rede
    monkeypatch.setenv("EDITOR_MEMORIA_REMOTA", "local")
    assert L.Loja(sementes[0]).remota is None
    monkeypatch.setenv("EDITOR_MEMORIA_REMOTA", "r2")
    monkeypatch.delenv("R2_BUCKET")
    with pytest.raises(RuntimeError, match="R2_BUCKET"):
        L.Loja(sementes[0])
