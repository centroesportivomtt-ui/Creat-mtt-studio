"""Fase 2 · envio direto ao R2: armazenamento R2 (boto3) contra um S3 falso local (http.server, sem rede, sem conta),
URLs pré-assinadas de parte como o navegador usa, rota de registro idempotente, player por faixas e ingest lendo o
arquivo que o navegador mandou direto ao bucket."""
import hashlib
import http.server
import io
import json
import re
import threading
import urllib.error
import urllib.parse
import urllib.request
import uuid
from xml.sax.saxutils import escape

import pytest

pytest.importorskip("boto3")

PAGINA = 2          # páginas pequenas no falso: força a paginação de ListParts e ListObjectsV2
BUCKET = "editor-teste"


class S3Falso(http.server.BaseHTTPRequestHandler):
    """S3 mínimo em memória (só o que o motor e o site usam). Não confere assinatura (o falso do site confere)."""
    protocol_version = "HTTP/1.1"
    objetos: dict = {}
    envios: dict = {}
    contagem: dict = {}

    def log_message(self, *a):
        pass

    # ---------- utilidades
    def _resp(self, status, corpo=b"", cab=None):
        corpo = corpo.encode() if isinstance(corpo, str) else corpo
        self.send_response(status)
        for k, v in (cab or {}).items():
            self.send_header(k, str(v))
        if corpo and "Content-Type" not in (cab or {}):
            self.send_header("Content-Type", "application/xml")
        if "Content-Length" not in (cab or {}):
            self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(corpo)

    def _erro(self, status, codigo):
        self._resp(status, f"<Error><Code>{codigo}</Code><Message>{codigo}</Message></Error>")

    def _corpo(self) -> bytes:
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    def _alvo(self):
        u = urllib.parse.urlsplit(self.path)
        partes = u.path.split("/", 2)
        bucket = urllib.parse.unquote(partes[1]) if len(partes) > 1 else ""
        chave = urllib.parse.unquote(partes[2]) if len(partes) > 2 else ""
        q = dict(urllib.parse.parse_qsl(u.query, keep_blank_values=True))
        return bucket, chave, q

    def _contar(self, op):
        S3Falso.contagem[op] = S3Falso.contagem.get(op, 0) + 1

    # ---------- verbos
    def do_HEAD(self):
        _, chave, _ = self._alvo()
        o = self.objetos.get(chave)
        self._contar("HeadObject")
        if o is None:
            return self._resp(404)
        self._resp(200, b"", {"Content-Length": len(o["dados"]), "ETag": o["etag"], "Content-Type": o["tipo"],
                               "Last-Modified": "Wed, 18 Nov 2026 12:00:00 GMT"})

    def do_GET(self):
        bucket, chave, q = self._alvo()
        if bucket != BUCKET:
            return self._erro(404, "NoSuchBucket")
        if not chave and q.get("list-type") == "2":
            self._contar("ListObjectsV2")
            prefixo, depois = q.get("prefix", ""), q.get("continuation-token", "")
            todas = sorted(k for k in self.objetos if k.startswith(prefixo) and k > depois)
            pg, mais = todas[:PAGINA], len(todas) > PAGINA
            itens = "".join(f"<Contents><Key>{escape(k)}</Key><Size>{len(self.objetos[k]['dados'])}</Size><ETag>{escape(self.objetos[k]['etag'])}</ETag></Contents>" for k in pg)
            prox = f"<NextContinuationToken>{escape(pg[-1])}</NextContinuationToken>" if mais else ""
            return self._resp(200, f"<ListBucketResult><Name>{BUCKET}</Name><KeyCount>{len(pg)}</KeyCount><IsTruncated>{str(mais).lower()}</IsTruncated>{prox}{itens}</ListBucketResult>")
        if "uploadId" in q:
            self._contar("ListParts")
            e = self.envios.get(q["uploadId"])
            if e is None or e["chave"] != chave:
                return self._erro(404, "NoSuchUpload")
            marcador = int(q.get("part-number-marker") or 0)
            todas = sorted(n for n in e["partes"] if n > marcador)
            pg, mais = todas[:PAGINA], len(todas) > PAGINA
            itens = "".join(f"<Part><PartNumber>{n}</PartNumber><ETag>{escape(e['partes'][n][1])}</ETag><Size>{len(e['partes'][n][0])}</Size></Part>" for n in pg)
            prox = f"<NextPartNumberMarker>{pg[-1]}</NextPartNumberMarker>" if mais else ""
            return self._resp(200, f"<ListPartsResult><Bucket>{BUCKET}</Bucket><Key>{escape(chave)}</Key><UploadId>{q['uploadId']}</UploadId><IsTruncated>{str(mais).lower()}</IsTruncated>{prox}{itens}</ListPartsResult>")
        o = self.objetos.get(chave)
        self._contar("GetObject")
        if o is None:
            return self._erro(404, "NoSuchKey")
        dados, total = o["dados"], len(o["dados"])
        m = re.match(r"^bytes=(\d*)-(\d*)$", self.headers.get("Range") or "")
        if m and (m.group(1) or m.group(2)):
            ini = int(m.group(1)) if m.group(1) else max(0, total - int(m.group(2)))
            fim = min(int(m.group(2)), total - 1) if m.group(1) and m.group(2) else total - 1
            if ini > fim:
                return self._erro(416, "InvalidRange")
            return self._resp(206, dados[ini:fim + 1], {"Content-Range": f"bytes {ini}-{fim}/{total}", "ETag": o["etag"],
                                                         "Content-Type": "application/octet-stream"})
        self._resp(200, dados, {"ETag": o["etag"], "Content-Type": "application/octet-stream"})

    def do_PUT(self):
        _, chave, q = self._alvo()
        dados = self._corpo()
        etag = f'"{hashlib.md5(dados).hexdigest()}"'
        if "uploadId" in q:
            self._contar("UploadPart")
            e = self.envios.get(q["uploadId"])
            if e is None or e["chave"] != chave:
                return self._erro(404, "NoSuchUpload")
            if "X-Amz-Signature" in q and "content-length" not in q.get("X-Amz-SignedHeaders", ""):
                return self._erro(403, "SignatureDoesNotMatch")     # o motor sempre assina o tamanho da parte
            e["partes"][int(q["partNumber"])] = (dados, etag)
            return self._resp(200, b"", {"ETag": etag})
        self._contar("PutObject")
        self.objetos[chave] = {"dados": dados, "etag": etag, "tipo": self.headers.get("Content-Type") or "application/octet-stream"}
        self._resp(200, b"", {"ETag": etag})

    def do_POST(self):
        _, chave, q = self._alvo()
        corpo = self._corpo()
        if "uploads" in q:
            self._contar("CreateMultipartUpload")
            uid = uuid.uuid4().hex
            self.envios[uid] = {"chave": chave, "partes": {}, "tipo": self.headers.get("Content-Type")}
            return self._resp(200, f"<InitiateMultipartUploadResult><Bucket>{BUCKET}</Bucket><Key>{escape(chave)}</Key><UploadId>{uid}</UploadId></InitiateMultipartUploadResult>")
        if "uploadId" in q:
            self._contar("CompleteMultipartUpload")
            e = self.envios.get(q["uploadId"])
            if e is None:
                return self._erro(404, "NoSuchUpload")
            pedidas = [(int(n), t.replace("&quot;", '"')) for n, t in re.findall(r"<PartNumber>(\d+)</PartNumber>\s*<ETag>([^<]+)</ETag>", corpo.decode())]
            if not pedidas:
                pedidas = [(int(n), t.replace("&quot;", '"')) for t, n in re.findall(r"<ETag>([^<]+)</ETag>\s*<PartNumber>(\d+)</PartNumber>", corpo.decode())]
            for i, (n, t) in enumerate(pedidas):
                if n not in e["partes"] or e["partes"][n][1].strip('"') != t.strip('"'):
                    return self._erro(400, "InvalidPart")
                if i < len(pedidas) - 1 and len(e["partes"][n][0]) < 5 * 1024 * 1024:
                    return self._erro(400, "EntityTooSmall")
            dados = b"".join(e["partes"][n][0] for n, _ in pedidas)
            etag = '"%s-%d"' % (hashlib.md5(b"".join(bytes.fromhex(e["partes"][n][1].strip('"')) for n, _ in pedidas)).hexdigest(), len(pedidas))
            self.objetos[e["chave"]] = {"dados": dados, "etag": etag, "tipo": e["tipo"] or "application/octet-stream"}
            del self.envios[q["uploadId"]]
            return self._resp(200, f"<CompleteMultipartUploadResult><Bucket>{BUCKET}</Bucket><Key>{escape(chave)}</Key><ETag>{escape(etag)}</ETag></CompleteMultipartUploadResult>")
        self._erro(400, "InvalidRequest")

    def do_DELETE(self):
        _, chave, q = self._alvo()
        if "uploadId" in q:
            self._contar("AbortMultipartUpload")
            self.envios.pop(q["uploadId"], None)
            return self._resp(204)
        self._contar("DeleteObject")
        self.objetos.pop(chave, None)
        self._resp(204)


@pytest.fixture()
def s3(dados, monkeypatch):
    S3Falso.objetos, S3Falso.envios, S3Falso.contagem = {}, {}, {}
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), S3Falso)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    monkeypatch.setenv("EDITOR_ARMAZENAMENTO", "r2")
    monkeypatch.setenv("R2_ENDPOINT", f"http://127.0.0.1:{srv.server_address[1]}")
    monkeypatch.setenv("R2_ACCESS_KEY_ID", "chave-de-teste")
    monkeypatch.setenv("R2_SECRET_ACCESS_KEY", "segredo-de-teste")
    monkeypatch.setenv("R2_BUCKET", BUCKET)
    monkeypatch.delenv("R2_ACCOUNT_ID", raising=False)
    yield S3Falso
    srv.shutdown()


@pytest.fixture()
def arm(s3):
    from motor import config
    from motor.provedores import armazenamento_de
    a = armazenamento_de(config.carregar())
    assert a.nome == "r2"
    return a


def _put(url: str, dados: bytes):
    req = urllib.request.Request(url, data=dados, method="PUT")
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status, r.headers.get("ETag")


# ---------------- armazenamento ----------------
def test_r2_desligado_sem_chave(dados, monkeypatch):
    from motor import config
    from motor.provedores.armazenamento_r2 import ArmazenamentoR2, faltando
    for n in ("R2_ACCOUNT_ID", "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"):
        monkeypatch.delenv(n, raising=False)
    monkeypatch.setenv("EDITOR_ARMAZENAMENTO", "r2")
    cfg = config.carregar()
    assert cfg.provedor_efetivo("armazenamento") == "local"            # sem a chave, cai no local
    assert faltando() == ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]
    with pytest.raises(RuntimeError, match="R2 desligado"):
        ArmazenamentoR2(cfg)


def test_r2_endpoint_da_conta(monkeypatch):
    from motor.provedores.armazenamento_r2 import endpoint
    monkeypatch.delenv("R2_ENDPOINT", raising=False)
    monkeypatch.setenv("R2_ACCOUNT_ID", "abc123")
    assert endpoint() == "https://abc123.r2.cloudflarestorage.com"
    monkeypatch.setenv("R2_ENDPOINT", "http://127.0.0.1:9/")
    assert endpoint() == "http://127.0.0.1:9"


def test_r2_ler_gravar_listar(arm, s3, tmp_path):
    arm.gravar_json("projetos/p1/pedido.json", {"texto": "olá, ação"})
    assert arm.ler_json("projetos/p1/pedido.json") == {"texto": "olá, ação"}
    for i in range(5):
        arm.gravar_bytes(f"derivados/p1/a001/kf/{i:04d}.jpg", bytes([i]) * 10)
    assert list(arm.listar("derivados/p1/a001/kf/")) == [f"derivados/p1/a001/kf/{i:04d}.jpg" for i in range(5)]   # 3 páginas
    assert s3.contagem["ListObjectsV2"] >= 3
    assert arm.existe("derivados/p1/a001/kf/0003.jpg") and not arm.existe("derivados/p1/a001/kf/9999.jpg")
    st = arm.stat("derivados/p1/a001/kf/0002.jpg")
    assert st["bytes"] == 10 and st["etag"] == hashlib.md5(b"\x02" * 10).hexdigest()
    with pytest.raises(FileNotFoundError):
        arm.stat("nao/existe.bin")
    with pytest.raises(FileNotFoundError):
        arm.ler_bytes("nao/existe.bin")
    origem = tmp_path / "orig.bin"
    origem.write_bytes(b"0123456789" * 1000)
    arm.gravar_de("entrada/p1/orig.bin", origem)
    assert origem.exists() and arm.tamanho("entrada/p1/orig.bin") == 10000
    destino = arm.baixar_para("entrada/p1/orig.bin", tmp_path / "volta" / "o.bin")
    assert destino.read_bytes() == origem.read_bytes()
    with pytest.raises(FileNotFoundError):
        arm.baixar_para("entrada/p1/falta.bin", tmp_path / "x.bin")
    assert not list((tmp_path).glob("*.tmp"))
    arm.apagar("entrada/p1/orig.bin")
    assert not arm.existe("entrada/p1/orig.bin")
    with pytest.raises(ValueError):
        arm.gravar_bytes("entrada/../fora.bin", b"x")


def test_r2_faixas_e_cache(arm, s3):
    dados = bytes(range(256)) * 4096          # 1 MiB
    arm.gravar_bytes("entrada/p1/v.mp4", dados)
    assert arm.ler_faixa("entrada/p1/v.mp4", 0, 9) == dados[:10]
    assert arm.ler_faixa("entrada/p1/v.mp4", 1000, 1_048_575) == dados[1000:]
    assert b"".join(arm.abrir_faixa("entrada/p1/v.mp4", 5, 70_000, bloco=4096)) == dados[5:70_001]
    with pytest.raises(ValueError):
        list(arm.abrir_faixa("entrada/p1/v.mp4", 10, 5))
    p1 = arm.caminho_local("entrada/p1/v.mp4")
    gets = s3.contagem.get("GetObject", 0)
    p2 = arm.caminho_local("entrada/p1/v.mp4")                  # cache conferido pelo ETag: não baixa de novo
    assert p1 == p2 and p1.read_bytes() == dados and s3.contagem.get("GetObject", 0) == gets
    arm.gravar_bytes("entrada/p1/v.mp4", b"novo conteudo")       # mudou no bucket: o cache é refeito
    assert arm.caminho_local("entrada/p1/v.mp4").read_bytes() == b"novo conteudo"


def test_r2_multipart_pre_assinado_como_o_navegador(arm, s3):
    """O que o site faz: cria o envio, assina cada parte com o tamanho, o "navegador" manda PUT, lista para retomar
    (paginado), conclui com as ETags; ETag final no formato multipart (md5 dos md5 + -N)."""
    MiB = 1024 * 1024
    partes = [bytes([65 + i]) * (5 * MiB) for i in range(4)] + [b"fim" * 1000]
    chave = "entrada/p_teste1/video-0123abcd.mp4"
    uid = arm.iniciar_multipart(chave, "video/mp4")
    etags = []
    for n, pedaco in enumerate(partes, start=1):
        url = arm.url_parte(chave, uid, n, bytes_=len(pedaco))
        assert "X-Amz-Signature=" in url and "content-length" in urllib.parse.unquote(url)
        if n == 3:
            continue                                            # "caiu a rede" antes da parte 3
        status, etag = _put(url, pedaco)
        assert status == 200 and etag
        etags.append({"parte": n, "etag": etag})
    lidas = arm.listar_partes(chave, uid)                       # retomada: 4 partes em 2 páginas
    assert [p["parte"] for p in lidas] == [1, 2, 4, 5] and s3.contagem["ListParts"] >= 2
    assert lidas[0]["bytes"] == 5 * MiB and lidas[-1]["bytes"] == 3000
    status, etag3 = _put(arm.url_parte(chave, uid, 3, bytes_=5 * MiB), partes[2])
    etags.append({"parte": 3, "etag": etag3})
    arm.concluir_multipart(chave, uid, etags)
    tudo = b"".join(partes)
    assert arm.tamanho(chave) == len(tudo) and arm.ler_faixa(chave, 0, len(tudo) - 1) == tudo
    md5s = b"".join(hashlib.md5(p).digest() for p in partes)
    assert arm.stat(chave)["etag"] == f"{hashlib.md5(md5s).hexdigest()}-5"
    with pytest.raises(FileNotFoundError):                      # concluído: o envio não existe mais
        arm.listar_partes(chave, uid)
    uid2 = arm.iniciar_multipart("entrada/p_teste1/outro-0123abcd.mp4")
    arm.abortar_multipart("entrada/p_teste1/outro-0123abcd.mp4", uid2)
    arm.abortar_multipart("entrada/p_teste1/outro-0123abcd.mp4", uid2)       # idempotente
    with pytest.raises(FileNotFoundError):
        arm.listar_partes("entrada/p_teste1/outro-0123abcd.mp4", uid2)


# ---------------- rotas do motor ----------------
@pytest.fixture()
def cli(s3, monkeypatch):
    pytest.importorskip("fastapi")
    pytest.importorskip("httpx")
    from fastapi.testclient import TestClient
    monkeypatch.setenv("MOTOR_TOKEN", "tok-teste")
    from motor.api.app import criar
    c = TestClient(criar())
    c.headers.update({"Authorization": "Bearer tok-teste"})
    assert c.get("/v1/saude").json()["provedores"]["armazenamento"] == "r2"
    return c


def test_rota_registro_do_envio_direto(cli, arm, s3):
    pid = cli.post("/v1/projetos", json={"nome": "envio r2"}).json()["id"]
    chave = f"entrada/{pid}/clipe-1234abcd.mp4"
    corpo = {"chave": chave, "nome": "clipe.mp4", "bytes": 6}
    sem = {"Authorization": "Bearer errado"}
    assert cli.post(f"/v1/projetos/{pid}/arquivos", json=corpo, headers=sem).status_code == 401
    assert cli.post(f"/v1/projetos/{pid}/arquivos", json=corpo).status_code == 409           # ainda não chegou ao bucket
    arm.gravar_bytes(chave, b"abcdef")                                                     # "o navegador terminou"
    etag = arm.stat(chave)["etag"]
    assert cli.post(f"/v1/projetos/{pid}/arquivos", json={**corpo, "bytes": 7}).status_code == 409
    assert cli.post(f"/v1/projetos/{pid}/arquivos", json={**corpo, "etag": '"outra"'}).status_code == 409
    assert cli.post(f"/v1/projetos/{pid}/arquivos", json={**corpo, "chave": f"entrada/outro/x-1234abcd.mp4"}).status_code == 422
    assert cli.post(f"/v1/projetos/{pid}/arquivos", json={**corpo, "chave": f"entrada/{pid}/../x.mp4"}).status_code == 422
    r = cli.post(f"/v1/projetos/{pid}/arquivos", json={**corpo, "etag": f'"{etag}"'})
    assert r.status_code == 201 and r.json() == {"id": "a001", "novo": True, "chave": chave, "bytes": 6}
    r2 = cli.post(f"/v1/projetos/{pid}/arquivos", json={**corpo, "etag": etag})             # repetido: idempotente
    assert r2.json()["id"] == "a001" and r2.json()["novo"] is False
    jobs = cli.get(f"/v1/projetos/{pid}").json()["jobs"]
    assert [(j["etapa"], j["alvo"]) for j in jobs] == [("ingest", "a001")]                 # um job só
    # player: Range sai do bucket por faixa, pela própria rota (o proxy do site não segue redirecionamento)
    r = cli.get(f"/v1/arquivos/{chave}", headers={"Range": "bytes=2-4"})
    assert r.status_code == 206 and r.content == b"cde" and r.headers["content-range"] == "bytes 2-4/6"
    r = cli.get(f"/v1/arquivos/{chave}")
    assert r.status_code == 200 and r.content == b"abcdef"
    assert cli.head(f"/v1/arquivos/{chave}").headers["content-length"] == "6"
    assert cli.get(f"/v1/arquivos/{chave}", headers={"Range": "bytes=10-"}).status_code == 416
    assert cli.get(f"/v1/arquivos/entrada/{pid}/falta.mp4").status_code == 404


def test_fechar_envio_recolhe_orfao_do_bucket(cli, arm):
    """Envio que terminou no bucket mas o aviso ao motor se perdeu: fechar o envio registra o arquivo."""
    pid = cli.post("/v1/projetos", json={"nome": "orfao"}).json()["id"]
    arm.gravar_bytes(f"entrada/{pid}/perdido-1234abcd.mov", b"xyz")
    r = cli.post(f"/v1/projetos/{pid}/fechar-envio")
    assert r.status_code == 200 and r.json()["arquivos"] == 1
    arqs = cli.get(f"/v1/projetos/{pid}").json()["arquivos"]
    assert [a["chave"] for a in arqs] == [f"entrada/{pid}/perdido-1234abcd.mov"]


def test_ingest_le_o_arquivo_que_o_navegador_mandou(s3, arm, dados, tmp_path, monkeypatch):
    """O original só existe no bucket (subiu do navegador por multipart); o ingest baixa para o cache e grava os
    derivados de volta no R2."""
    monkeypatch.setenv("EDITOR_MODELOS_BAIXAR", "0")
    from motor import banco, config, importar, worker
    from motor.ferramentas.aceite_a import gerar_sintetico
    v = gerar_sintetico(tmp_path / "s.mov", tipo="silencio", w=320, h=240, dur=3)
    chave = "entrada/p1/clipe-0011aabb.mov"
    uid = arm.iniciar_multipart(chave, "video/quicktime")
    _, etag = _put(arm.url_parte(chave, uid, 1, bytes_=v.stat().st_size), v.read_bytes())
    arm.concluir_multipart(chave, uid, [{"parte": 1, "etag": etag}])
    assert not (dados / "armazenamento" / chave).exists()       # nada no disco local do motor
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado) VALUES ('p1','t',?,?)", (banco.agora_iso(), banco.agora_iso()))
    importar.registrar_arquivo(con, "p1", "clipe.mov", chave, v.stat().st_size)
    worker.main(["--ate-ocioso", "--etapas", "ingest"])
    j = banco.jobs_do_projeto(con, "p1")[0]
    assert j["estado"] == "feito", j
    ing = arm.ler_json("derivados/p1/a001/ingest.json")
    assert ing["arquivo"]["sha256"] == hashlib.sha256(v.read_bytes()).hexdigest()
    assert ing["midia"]["duracao"] > 2 and arm.existe(ing["derivados"]["audio_wav"])
    assert all(arm.existe(q["chave"]) for q in ing["derivados"]["quadros_chave"])
    assert "derivados/p1/a001/ingest.json" in s3.objetos
