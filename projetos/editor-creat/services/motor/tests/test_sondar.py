"""Link conferido NA HORA (importar.sondar): link restrito da equipe, link apagado, pasta sem zip e rede fora dão o motivo
certo embaixo do botão, em vez de o arquivo sumir da fila minutos depois (problema do dono em 21/11)."""
import http.server
import threading

import pytest

from motor import importar

PAGINAS = {
    "/login": ("text/html; charset=utf-8", b"<html><head><title>Log in to Dropbox</title></head></html>"),
    "/apagado": ("text/html; charset=utf-8", b"<html><title>Dropbox - Invalid Link - Simplify your life</title></html>"),
    "/pagina": ("text/html", b"<html><title>Dropbox</title></html>"),
    "/previa": ("text/html", b"<html><title>login_tutorial concentrar design in.mp4 - Dropbox</title></html>"),
    "/drive": ("text/html", b'<form action="https://drive.usercontent.google.com/download?id=x" method="get"></form>'),
    "/video.mov": ("video/quicktime", b"\x00\x00\x00\x18ftypqt  "),
}


class _S(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        caminho = self.path.split("?")[0]
        if caminho == "/privado":                      # arquivo privado do Drive: manda para a tela de login do Google
            self.send_response(302)
            self.send_header("Location", "https://accounts.google.com/ServiceLogin?continue=x")
            self.end_headers()
            return
        if caminho == "/sumiu":
            self.send_response(404)
            self.end_headers()
            return
        tipo, corpo = PAGINAS[caminho]
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)


@pytest.fixture(scope="module")
def base():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _S)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def _s(url, tipo="arquivo"):
    return importar.sondar_direto(url, tipo, hosts=("127.0.0.1",), timeout=5)


def test_arquivo_publico_passa(base):
    assert _s(f"{base}/video.mov") is None


def test_link_restrito_da_equipe_explica_o_passo_a_passo(base):
    with pytest.raises(importar.ErroImportacao, match="Qualquer pessoa com o link"):
        _s(f"{base}/login")


def test_link_apagado_e_404(base):
    with pytest.raises(importar.ErroImportacao, match="não existe mais"):
        _s(f"{base}/apagado")
    with pytest.raises(importar.ErroImportacao, match="não existe mais"):
        _s(f"{base}/sumiu")


def test_pagina_qualquer_e_recusada(base):
    with pytest.raises(importar.ErroImportacao, match="página em vez do arquivo"):
        _s(f"{base}/pagina")
    with pytest.raises(importar.ErroImportacao, match="não entregou essa pasta em zip"):
        _s(f"{base}/pagina", "pasta_zip")


def test_nome_do_arquivo_no_titulo_nao_vira_login(base):
    assert not importar._pagina_de_login(PAGINAS["/previa"][1].decode())
    assert importar._pagina_de_login("<title>Sign in - Google Accounts</title>")
    assert importar._pagina_de_login("<title> Fazer login – Contas do Google</title>")
    with pytest.raises(importar.ErroImportacao, match="página em vez do arquivo"):
        _s(f"{base}/previa")


def test_aviso_do_drive_passa(base):
    assert _s(f"{base}/drive") is None             # página "arquivo grande sem antivírus": o baixador confirma sozinho


def test_rede_fora_nao_bloqueia():
    aviso = importar.sondar_direto("http://127.0.0.1:9/v.mov", hosts=("127.0.0.1",), timeout=2)
    assert aviso and "tenta de novo" in aviso


def test_baixar_tambem_explica_o_link_restrito(base, tmp_path):
    with pytest.raises(importar.ErroImportacao, match="Qualquer pessoa com o link"):
        importar.baixar(f"{base}/login", tmp_path / "d", hosts=("127.0.0.1",), timeout=5)


def test_rota_recusa_link_restrito_na_hora(dados, monkeypatch):
    pytest.importorskip("fastapi")
    from fastapi.testclient import TestClient
    monkeypatch.setenv("MOTOR_TOKEN", "t")
    monkeypatch.setenv("EDITOR_SONDAR_LINK", "1")
    monkeypatch.setattr(importar, "sondar", lambda url, **k: (_ for _ in ()).throw(importar.ErroImportacao(importar.MSG_LOGIN_DROPBOX)))
    from motor.api.app import criar
    c = TestClient(criar())
    c.headers.update({"Authorization": "Bearer t"})
    pid = c.post("/v1/projetos", json={"nome": "t"}).json()["id"]
    r = c.post(f"/v1/projetos/{pid}/importar", json={"url": "https://www.dropbox.com/scl/fi/abc/v.mov?rlkey=k&dl=0"})
    assert r.status_code == 422 and "Qualquer pessoa com o link" in r.json()["detail"]
    assert c.get(f"/v1/projetos/{pid}").json()["arquivos"] == []          # nada entrou na fila
    monkeypatch.setattr(importar, "sondar", lambda url, **k: "sem resposta do link agora (TimeoutError); o motor tenta de novo")
    r = c.post(f"/v1/projetos/{pid}/importar", json={"url": "https://www.dropbox.com/scl/fi/abc/v.mov?rlkey=k&dl=0"})
    assert r.status_code == 202 and "tenta de novo" in r.json()["aviso"]


def test_drive_privado_manda_para_o_login(base):
    with pytest.raises(importar.ErroImportacao, match="Google Drive só abre para quem está logado"):
        _s(f"{base}/privado")
