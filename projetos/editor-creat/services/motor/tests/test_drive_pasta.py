"""Pasta do Google Drive por link (pedido do dono, 25/11): colou a pasta, o editor pega os vídeos de dentro.

Sem rede: o HTML tem a mesma estrutura da página embeddedfolderview real (conferida em 25/11) e é servido por um servidor
HTTP local, que também responde ao Range do download (tamanho de cada arquivo)."""
import http.server
import json
import threading

import pytest

from motor import banco, config, importar


def _entrada(fid, nome, *, pasta=False, mime="video/mp4", docs=False):
    href = (f"https://drive.google.com/drive/folders/{fid}" if pasta else
            f"https://docs.google.com/document/d/{fid}/edit?usp=drive_web" if docs else
            f"https://drive.google.com/file/d/{fid}/view?usp=drive_web")
    icone = ('<div aria-label="Folder" class="icon-color-1 drive-sprite-folder-list-shared-icon"></div>' if pasta else
             f'<img src="https://drive-thirdparty.googleusercontent.com/16/type/{mime}" alt=""/>')
    return (f'<div class="flip-entry" id="entry-{fid}" tabindex="0" role="link"><div class="flip-entry-info"><a href="{href}" '
            f'target="_blank"><div class="flip-entry-list-icon">{icone}</div><div class="flip-entry-title">{nome}</div></a></div>'
            f'<div class="flip-entry-last-modified"><div>10/26/24</div></div></div>')


def _pagina(titulo, entradas):
    return (f'<!DOCTYPE html><html><head><title>{titulo}</title></head><body class="flip-embedded"><div id="flip-contents" '
            f'class="flip-contents flip-list-view"><div class="flip-entries">{"".join(entradas)}</div></div></body></html>').encode()


ID = lambda n: f"{n}".ljust(12, "x")          # noqa: E731 - ids com 10+ caracteres, como os do Drive

PASTAS = {
    ID("raiz"): _pagina("Gravações &amp; Lavínia", [
        _entrada(ID("v2"), "B_cena.MOV"), _entrada(ID("v1"), "A_cena.mp4"), _entrada(ID("pkl"), "modelo.pkl", mime="application/x-zip"),
        _entrada(ID("doc"), "Roteiro", docs=True), _entrada(ID("oculto"), ".DS_Store"), _entrada(ID("au"), "voz.m4a", mime="audio/mp4"),
        _entrada(ID("semext"), "gravacao sem extensao", mime="video/quicktime"), _entrada(ID("sub1"), "Dia 2", pasta=True)]),
    ID("sub1"): _pagina("Dia 2", [_entrada(ID("v3"), "C.mp4"), _entrada(ID("sub2"), "Extra", pasta=True)]),
    ID("sub2"): _pagina("Extra", [_entrada(ID("v4"), "D.mp4"), _entrada(ID("sub3"), "Fundo", pasta=True)]),
    ID("sub3"): _pagina("Fundo", [_entrada(ID("v5"), "E.mp4")]),
    ID("vazia"): _pagina("Vazia", []),
    ID("sodoc"): _pagina("Só papel", [_entrada(ID("pdf"), "contrato.pdf", mime="application/pdf")]),
    ID("muitas"): _pagina("Muitas", [_entrada(ID(f"s{i:02d}"), f"s{i}", pasta=True) for i in range(importar.MAX_SUBPASTAS + 1)]),
    ID("cheia"): _pagina("Cheia", [_entrada(ID(f"f{i:03d}"), f"f{i}.mp4") for i in range(importar.MAX_ITENS_PASTA + 1)]),
}
for i in range(importar.MAX_SUBPASTAS + 1):
    PASTAS[ID(f"s{i:02d}")] = _pagina(f"s{i}", [])
TAMANHOS = {ID("v1"): 1000, ID("v2"): 2000, ID("v3"): 3000, ID("au"): 50, ID("v4"): 4000, ID("semext"): 7}


class _S(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _enviar(self, codigo, tipo=None, corpo=b"", extra=None):
        self.send_response(codigo)
        if tipo:
            self.send_header("Content-Type", tipo)
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        from urllib.parse import parse_qs, urlsplit
        u = urlsplit(self.path)
        fid = (parse_qs(u.query).get("id") or [""])[0]
        if u.path == "/embeddedfolderview":
            if fid == ID("restrita"):
                return self._enviar(401, "text/html", b"<html>401</html>")
            if fid == ID("ilegivel"):
                return self._enviar(200, "text/html", b"<html><title>Google Drive</title><div class='novo-layout'></div></html>")
            if fid not in PASTAS:
                return self._enviar(404, "text/html", b"<html><title>Error 404 (Not Found)!!1</title></html>")
            return self._enviar(200, "text/html; charset=utf-8", PASTAS[fid])
        if u.path == "/download":
            if fid == ID("cota"):
                return self._enviar(200, "text/html", b"<html><title>Google Drive - Quota exceeded</title>Too many users have viewed "
                                                      b"or downloaded this file recently.</html>")
            if fid not in TAMANHOS:
                return self._enviar(404)
            total = TAMANHOS[fid]
            if self.headers.get("Range") == "bytes=0-0":
                return self._enviar(206, "video/mp4", b"\x00", {"Content-Range": f"bytes 0-0/{total}"})
            return self._enviar(200, "video/mp4", b"\x00" * total)
        self._enviar(404)


@pytest.fixture(scope="module")
def base():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _S)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


LOCAL = ("127.0.0.1",)


def _listar(base, fid, **k):
    return importar.listar_pasta_drive(fid, base=base, hosts=LOCAL, timeout=5, **k)


# ---------------------------------------------------------------- formas de link
@pytest.mark.parametrize("url,fid,rk", [
    ("https://drive.google.com/drive/folders/1AbCdEfGhIjKl?usp=sharing", "1AbCdEfGhIjKl", None),
    ("https://drive.google.com/drive/folders/1AbCdEfGhIjKl?usp=drive_link", "1AbCdEfGhIjKl", None),
    ("https://drive.google.com/drive/u/1/folders/1AbCdEfGhIjKl", "1AbCdEfGhIjKl", None),
    ("https://drive.google.com/drive/mobile/folders/1AbCdEfGhIjKl?usp=sharing", "1AbCdEfGhIjKl", None),
    ("https://drive.google.com/folderview?id=1AbCdEfGhIjKl", "1AbCdEfGhIjKl", None),
    ("https://drive.google.com/embeddedfolderview?id=1AbCdEfGhIjKl#list", "1AbCdEfGhIjKl", None),
    ("https://drive.google.com/drive/folders/0B7EVK8r0v71pTUZsaXdaSnZBZzg?resourcekey=0-abc_DEF&usp=sharing", "0B7EVK8r0v71pTUZsaXdaSnZBZzg", "0-abc_DEF"),
])
def test_formas_de_link_de_pasta(url, fid, rk):
    direto, tipo = importar.link_direto(url)
    assert tipo == "pasta_drive" and direto.startswith("https://drive.google.com/embeddedfolderview?id=")
    assert importar.id_da_pasta(direto) == (fid, rk)


def test_open_id_continua_arquivo_e_pasta_sem_id_e_recusada():
    assert importar.link_direto("https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp")[1] == "arquivo"
    u, t = importar.link_direto("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?resourcekey=0-xy")
    assert t == "arquivo" and u.endswith("&resourcekey=0-xy")
    for ruim in ("https://drive.google.com/drive/folders/curto", "https://drive.google.com/folderview?id="):
        with pytest.raises(importar.ErroImportacao, match="id da pasta"):
            importar.link_direto(ruim)


# ---------------------------------------------------------------- leitura da lista
def test_filtra_midia_pela_extensao_e_le_dois_niveis(base):
    r = _listar(base, ID("raiz"))
    assert r["nome"] == "Gravações & Lavínia"
    nomes = [importar.nome_do_item(i) for i in r["itens"]]
    # ordem (subpasta, nome); .pkl com ícone de zip, doc, .DS_Store e pdf ficam de fora; sem extensão vale o MIME do ícone
    assert nomes == ["A_cena.mp4", "B_cena.MOV", "gravacao sem extensao", "voz.m4a", "Dia 2/C.mp4", "Dia 2/Extra/D.mp4"]
    assert [i["tipo"] for i in r["itens"]][-3:] == ["audio", "video", "video"]
    assert r["ignorados"] == 3 and r["subpastas"] == 2
    assert r["subpastas_fora"] == 1                       # a 3ª camada (Fundo/E.mp4) fica de fora, contada (nunca calada)


def test_profundidade_menor(base):
    r = _listar(base, ID("raiz"), profundidade=0)
    assert all(not i["subpasta"] for i in r["itens"]) and r["subpastas_fora"] == 1


def test_teto_de_subpastas_e_de_itens(base):
    with pytest.raises(importar.ErroImportacao, match=f"mais de {importar.MAX_SUBPASTAS} subpastas"):
        _listar(base, ID("muitas"))
    with pytest.raises(importar.ErroImportacao, match=f"mais de {importar.MAX_ITENS_PASTA} itens. Crie uma pasta"):
        _listar(base, ID("cheia"))


def test_restrita_apagada_ilegivel_vazia(base):
    with pytest.raises(importar.ErroImportacao, match="está restrita.*Qualquer pessoa com o link.*Leitor"):
        _listar(base, ID("restrita"))
    with pytest.raises(importar.ErroImportacao, match="não existe mais"):
        _listar(base, ID("naoexiste"))
    with pytest.raises(importar.ErroImportacao, match="Não consegui ler a lista"):
        _listar(base, ID("ilegivel"))                     # o Google mudou a página: plano B, nunca "pasta vazia"
    assert _listar(base, ID("vazia"))["itens"] == []
    sondar = lambda fid: importar.sondar_pasta(f"{base}/embeddedfolderview?id={fid}", hosts=LOCAL, timeout=5)   # noqa: E731
    for fid in ("vazia", "sodoc"):
        with pytest.raises(importar.ErroImportacao, match="não tem vídeo nem áudio"):
            sondar(ID(fid))
    resumo, aviso = sondar(ID("raiz"))
    assert aviso is None and len(resumo["itens"]) == 6


def test_rede_fora_vira_aviso():
    resumo, aviso = importar.sondar_pasta("http://127.0.0.1:9/embeddedfolderview?id=1AbCdEfGhIjKl", hosts=LOCAL, timeout=2)
    assert resumo is None and "tenta de novo" in aviso


def test_tamanho_pelo_range(base):
    t = importar.tamanhos_drive([ID("v1"), ID("v2"), ID("nao"), ID("cota")], base_dl=base, hosts=LOCAL, timeout=5)
    assert t == {ID("v1"): 1000, ID("v2"): 2000, ID("nao"): None, ID("cota"): None}


def test_pagina_de_cota_tem_mensagem_propria(base, tmp_path):
    with pytest.raises(importar.ErroImportacao, match="Google travou o download"):
        importar.baixar(f"{base}/download?id={ID('cota')}", tmp_path / "x", hosts=LOCAL, timeout=5)
    srv_html = "<html><title>Google Drive - Quota exceeded</title></html>"
    assert importar._pagina_de_cota(srv_html) and not importar._pagina_de_cota("<title>cota_do_mes.mp4</title>")


def test_detalhe_em_portugues():
    r = {"nome": "Lavínia", "ignorados": 1, "subpastas_fora": 0}
    assert importar.detalhe_pasta(r, 1) == "Pasta “Lavínia”: 1 vídeo na fila. 1 arquivo que não é vídeo nem áudio fica de fora."
    r = {"nome": "X", "ignorados": 3, "subpastas_fora": 2}
    assert importar.detalhe_pasta(r, 4, 2) == ("Pasta “X”: 4 vídeos na fila. 2 vídeos já estavam no projeto. 3 arquivos que não são "
                                               "vídeo nem áudio ficam de fora. 2 subpastas restritas ou fundas demais ficaram de fora.")


# ---------------------------------------------------------------- rota e ingest (com a lista e o download trocados por falsos)
@pytest.fixture()
def cli(dados, monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    monkeypatch.setenv("MOTOR_TOKEN", "t")
    from motor.api.app import criar
    c = TestClient(criar())
    c.headers.update({"Authorization": "Bearer t"})
    return c


PASTA_URL = "https://drive.google.com/drive/folders/1PastaDoDono00?usp=sharing"


def _lista_falsa(*ids, ignorados=2):
    return {"nome": "Lavínia", "ignorados": ignorados, "subpastas": 1, "subpastas_fora": 0,
            "itens": [{"id": i, "nome": f"{i}.mp4", "subpasta": "Dia 2" if i.endswith("3") else "", "tipo": "video"} for i in ids]}


def test_rota_mostra_detalhe_e_recusa_pasta_ja_importada(cli, monkeypatch):
    monkeypatch.setenv("EDITOR_SONDAR_LINK", "1")
    monkeypatch.setattr(importar, "sondar_pasta", lambda direto, **k: (_lista_falsa("drv0000001", "drv0000002"), None))
    pid = cli.post("/v1/projetos", json={"nome": "t"}).json()["id"]
    r = cli.post(f"/v1/projetos/{pid}/importar", json={"url": PASTA_URL})
    assert r.status_code == 202, r.text
    j = r.json()
    assert j["detalhe"] == "Pasta “Lavínia”: 2 vídeos na fila. 2 arquivos que não são vídeo nem áudio ficam de fora."
    assert j["pasta"] == {"nome": "Lavínia", "videos": 2, "ignorados": 2, "subpastas": 1, "ja_no_projeto": 0, "bytes": None}
    con = banco.conectar(config.carregar().banco)
    for d, a in (("drv0000001", "a001"), ("drv0000002", "a001")):
        importar.marcar_importado_drive(con, pid, d, a)
    r = cli.post(f"/v1/projetos/{pid}/importar", json={"url": PASTA_URL})
    assert r.status_code == 422 and r.json()["detail"] == "Essa pasta já está no projeto (2 vídeos). Não tem vídeo novo nela."
    monkeypatch.setattr(importar, "sondar_pasta", lambda direto, **k: (_ for _ in ()).throw(importar.ErroImportacao(importar.MSG_LOGIN_DRIVE_PASTA)))
    r = cli.post(f"/v1/projetos/{pid}/importar", json={"url": PASTA_URL})
    assert r.status_code == 422 and "restrita" in r.json()["detail"]


def _ctx(con, cfg, arm, pid, aid, url):
    from motor.etapas import Contexto
    job = {"id": "j1", "etapa": "ingest", "projeto": pid, "alvo": aid, "entrada": {"url": url}}
    return Contexto(con=con, cfg=cfg, job=job, armazenamento=arm)


def _projeto(con, pid="p1"):
    t = banco.agora_iso()
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado, dados) VALUES (?,?,?,?,?)", (pid, "t", t, t, "{}"))
    return pid


def test_ingest_da_pasta_registra_cada_video_e_nao_duplica(dados, monkeypatch, tmp_path):
    from motor.etapas import ingest as ING
    from motor.provedores.armazenamento_local import ArmazenamentoLocal
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    arm = ArmazenamentoLocal(cfg)
    pid = _projeto(con)
    lista = _lista_falsa("drv0000001", "drv0000002", "drv0000003")
    monkeypatch.setattr(importar, "listar_pasta_drive", lambda fid, **k: lista)
    monkeypatch.setattr(importar, "tamanhos_drive", lambda ids, **k: {i: 10 for i in ids})
    baixados = []

    def baixar_falso(link, destino, **k):
        baixados.append(link)
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(b"0" * 10)
        return destino, "qualquer.mp4", 10
    monkeypatch.setattr(importar, "baixar", baixar_falso)
    aid, _ = importar.registrar_arquivo(con, pid, "importando do link…", None, 0, entrada={"url": PASTA_URL})
    row = con.execute("SELECT * FROM arquivos WHERE projeto=? AND id=?", (pid, aid)).fetchone()
    ING._importar(_ctx(con, cfg, arm, pid, aid, PASTA_URL), row, PASTA_URL)
    arqs = [dict(r) for r in con.execute("SELECT id, nome, chave, bytes FROM arquivos WHERE projeto=? ORDER BY id", (pid,))]
    assert [(a["id"], a["nome"]) for a in arqs] == [("a001", "drv0000001.mp4"), ("a002", "drv0000002.mp4"), ("a003", "Dia 2/drv0000003.mp4")]
    assert arqs[0]["chave"] == f"entrada/{pid}/a001.mp4" and arm.existe(arqs[0]["chave"])
    assert len(baixados) == 1 and "id=drv0000001" in baixados[0]             # só o 1º nesta tarefa; os outros têm a própria
    jobs = {r["alvo"]: json.loads(r["entrada"]) for r in con.execute("SELECT alvo, entrada FROM jobs WHERE etapa='ingest' AND projeto=?", (pid,))}
    assert jobs["a002"] == {"url": "https://drive.google.com/file/d/drv0000002/view", "drive_id": "drv0000002"}
    assert importar.importados_drive(con, pid) == {"drv0000001": "a001", "drv0000002": "a002", "drv0000003": "a003"}
    # repetir a tarefa (rede caiu depois de registrar) não duplica nada
    ING._preparar_pasta_drive(_ctx(con, cfg, arm, pid, aid, PASTA_URL), importar.link_direto(PASTA_URL)[0], tmp_path)
    assert con.execute("SELECT COUNT(*) n FROM arquivos WHERE projeto=?", (pid,)).fetchone()["n"] == 3
    # colar a mesma pasta de novo: a tarefa nova explica e some da lista (não trava a direção)
    aid2, _ = importar.registrar_arquivo(con, pid, "importando do link…", None, 0, entrada={"url": PASTA_URL})
    row2 = con.execute("SELECT * FROM arquivos WHERE projeto=? AND id=?", (pid, aid2)).fetchone()
    from motor.etapas import ErroDefinitivo
    with pytest.raises(ErroDefinitivo, match="já está no projeto \\(3 vídeos\\)"):
        ING._importar(_ctx(con, cfg, arm, pid, aid2, PASTA_URL), row2, PASTA_URL)
    assert con.execute("SELECT COUNT(*) n FROM arquivos WHERE projeto=?", (pid,)).fetchone()["n"] == 3


def test_ingest_da_pasta_teto_de_bytes_e_falha_de_um_nao_derruba_os_outros(dados, monkeypatch):
    from motor.etapas import ErroDefinitivo, ingest as ING
    from motor.provedores.armazenamento_local import ArmazenamentoLocal
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    arm = ArmazenamentoLocal(cfg)
    pid = _projeto(con)
    monkeypatch.setattr(importar, "listar_pasta_drive", lambda fid, **k: _lista_falsa("drv0000001", "drv0000002"))
    monkeypatch.setattr(importar, "tamanhos_drive", lambda ids, **k: {i: importar.MAX_BYTES for i in ids})
    aid, _ = importar.registrar_arquivo(con, pid, "importando do link…", None, 0, entrada={"url": PASTA_URL})
    row = con.execute("SELECT * FROM arquivos WHERE projeto=? AND id=?", (pid, aid)).fetchone()
    with pytest.raises(ErroDefinitivo, match="acima do limite"):
        ING._importar(_ctx(con, cfg, arm, pid, aid, PASTA_URL), row, PASTA_URL)
    assert con.execute("SELECT COUNT(*) n FROM arquivos WHERE projeto=?", (pid,)).fetchone()["n"] == 0
    # um vídeo da pasta com a cota do Google estourada: só ele sai (e colar a pasta de novo o traz de volta)
    monkeypatch.setattr(importar, "tamanhos_drive", lambda ids, **k: {i: 10 for i in ids})
    monkeypatch.setattr(importar, "baixar", lambda link, destino, **k: (_ for _ in ()).throw(importar.ErroImportacao(importar.MSG_COTA_DRIVE)))
    aid, _ = importar.registrar_arquivo(con, pid, "importando do link…", None, 0, entrada={"url": PASTA_URL})
    row = con.execute("SELECT * FROM arquivos WHERE projeto=? AND id=?", (pid, aid)).fetchone()
    with pytest.raises(ErroDefinitivo, match="Google travou"):
        ING._importar(_ctx(con, cfg, arm, pid, aid, PASTA_URL), row, PASTA_URL)
    restantes = [r["nome"] for r in con.execute("SELECT nome FROM arquivos WHERE projeto=?", (pid,))]
    assert restantes == ["drv0000002.mp4"]                                    # o outro segue na fila com o próprio ingest
    assert list(importar.importados_drive(con, pid)) == ["drv0000002"]


def test_arquivo_unico_do_drive_tambem_e_lembrado(dados, monkeypatch):
    from motor.etapas import ingest as ING
    from motor.provedores.armazenamento_local import ArmazenamentoLocal
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    arm = ArmazenamentoLocal(cfg)
    pid = _projeto(con)

    def baixar_falso(link, destino, **k):
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(b"0")
        return destino, "v.mov", 1
    monkeypatch.setattr(importar, "baixar", baixar_falso)
    url = "https://drive.google.com/file/d/1ArquivoUnico0/view?usp=sharing"
    aid, _ = importar.registrar_arquivo(con, pid, "importando do link…", None, 0, entrada={"url": url})
    row = con.execute("SELECT * FROM arquivos WHERE projeto=? AND id=?", (pid, aid)).fetchone()
    ING._importar(_ctx(con, cfg, arm, pid, aid, url), row, url)
    assert importar.importados_drive(con, pid) == {"1ArquivoUnico0": "a001"}
