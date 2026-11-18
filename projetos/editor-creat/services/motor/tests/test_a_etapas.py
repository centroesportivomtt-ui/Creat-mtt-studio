"""Frente A: ingest + análise de ponta a ponta pela fila, com vídeo sintético pequeno (rotação -90) e download por link."""
import hashlib
import http.server
import json
import pathlib
import sys
import threading

import pytest

from motor import banco, config, importar, worker
from motor.ferramentas.aceite_a import gerar_sintetico
from motor.provedores import armazenamento_de

pytestmark = pytest.mark.filterwarnings("ignore")


@pytest.fixture()
def ambiente(dados, monkeypatch):
    monkeypatch.setenv("EDITOR_MODELOS_BAIXAR", "0")          # sem rede nos testes: rostos ficam vazios
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    con.execute("INSERT INTO projetos (id, nome, criado, atualizado) VALUES ('p1','t',?,?)", (banco.agora_iso(), banco.agora_iso()))
    return cfg, con, armazenamento_de(cfg)


def _validar(obj):
    sys.path.insert(0, str(config.SCHEMAS / "py"))
    import validar
    assert validar.erros("analise", obj) == []


def test_ingest_e_analise_pela_fila(ambiente, tmp_path):
    cfg, con, arm = ambiente
    v1 = gerar_sintetico(tmp_path / "s.mov", tipo="silencio", w=640, h=360, dur=6)
    v2 = gerar_sintetico(tmp_path / "mudo.mov", tipo="silencio", w=640, h=360, dur=4, audio=False)
    for nome, v in (("20261118_101500.mov", v1), ("mudo.mov", v2)):
        arm.gravar(f"entrada/p1/{nome}", v)
        importar.registrar_arquivo(con, "p1", nome, f"entrada/p1/{nome}", v.stat().st_size)
    worker.main(["--ate-ocioso", "--etapas", "ingest,analise"])
    jobs = banco.jobs_do_projeto(con, "p1")
    assert all(j["estado"] == "feito" for j in jobs) and len(jobs) == 4, jobs
    a1 = arm.ler_json("derivados/p1/a001/analise.json")
    _validar(a1)
    m = a1["midia"]
    assert (m["w"], m["h"], m["rotacao"]) == (360, 640, -90) and m["gop"] == 1.0
    assert len(a1["derivados"]["quadros_chave"]) == 6 and a1["transcricao"]["vad"] is False
    assert a1["arquivo"]["sha256"] == hashlib.sha256(v1.read_bytes()).hexdigest()
    assert a1["arquivo"]["gravado_em"] == "2026-11-18T10:15:00"
    assert arm.existe(a1["sinais"]["energia"]["chave"]) and arm.existe(a1["derivados"]["folha"])
    a2 = arm.ler_json("derivados/p1/a002/analise.json")
    _validar(a2)
    assert a2["midia"]["tem_audio"] is False and a2["derivados"]["audio_wav"] is None and a2["transcricao"]["provedor"] == "nenhum"
    assert con.execute("SELECT COUNT(*) n FROM arquivos WHERE estado='analisado'").fetchone()["n"] == 2
    # idempotência: reenfileirar não refaz
    banco.enfileirar(con, "ingest", "p1", "a001")
    worker.main(["--ate-ocioso", "--etapas", "ingest,analise"])
    saidas = {(r["etapa"], r["alvo"]): json.loads(r["saida"]) for r in con.execute("SELECT etapa, alvo, saida FROM jobs WHERE alvo='a001'")}
    assert saidas[("ingest", "a001")]["pulado"] and saidas[("analise", "a001")]["pulado"]


def test_arquivo_corrompido_falha_definitivo(ambiente):
    cfg, con, arm = ambiente
    arm.gravar_bytes("entrada/p1/ruim.mov", b"isto nao e video" * 100)
    importar.registrar_arquivo(con, "p1", "ruim.mov", "entrada/p1/ruim.mov", 1600)
    worker.main(["--ate-ocioso", "--etapas", "ingest"])
    j = banco.jobs_do_projeto(con, "p1")[0]
    assert j["estado"] == "falhou" and j["tentativas"] == 1 and "ilegível" in j["erro"]


class _Servidor(http.server.BaseHTTPRequestHandler):
    dados = b""
    cortar_em = None
    pedidos: list = []

    def log_message(self, *a):
        pass

    def do_GET(self):
        rng = self.headers.get("Range")
        self.pedidos.append(rng)
        ini = int(rng.split("=")[1].split("-")[0]) if rng else 0
        corpo = self.dados[ini:]
        self.send_response(206 if rng else 200)
        self.send_header("Content-Type", "video/quicktime")
        self.send_header("Content-Disposition", 'attachment; filename="IMG_0001.MOV"')
        self.send_header("Content-Length", str(len(corpo)))
        if rng:
            self.send_header("Content-Range", f"bytes {ini}-{len(self.dados) - 1}/{len(self.dados)}")
        self.end_headers()
        if self.cortar_em and not rng:
            self.wfile.write(corpo[: self.cortar_em])     # simula queda de conexão
            self.wfile.flush()
            self.connection.close()
            return
        self.wfile.write(corpo)


def test_download_retomavel(tmp_path):
    dados = bytes(range(256)) * 4000
    _Servidor.dados, _Servidor.cortar_em, _Servidor.pedidos = dados, 300_000, []
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), _Servidor)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{srv.server_address[1]}/v.mov"
    destino = tmp_path / "download"
    with pytest.raises(Exception):
        importar.baixar(url, destino, hosts=("127.0.0.1",), timeout=5)
    assert (tmp_path / "download.part").stat().st_size == 300_000
    _Servidor.cortar_em = None
    caminho, nome, nb = importar.baixar(url, destino, hosts=("127.0.0.1",), timeout=5)
    srv.shutdown()
    assert nome == "IMG_0001.MOV" and nb == len(dados) and caminho.read_bytes() == dados
    assert _Servidor.pedidos[-1] == "bytes=300000-"            # retomou de onde parou


@pytest.mark.real
@pytest.mark.lento
def test_parakeet_no_clipe_real(material_real, dados, monkeypatch):
    pk = material_real / "c_test"
    if not (pk / "parakeet" / "encoder.int8.onnx").exists():
        pytest.skip("modelo Parakeet não está no scratchpad")
    monkeypatch.syspath_prepend(str(pk / "pkgs"))
    monkeypatch.setenv("EDITOR_PARAKEET_DIR", str(pk / "parakeet"))
    try:
        import sherpa_onnx  # noqa: F401
    except (ImportError, OSError) as e:
        pytest.skip(f"sherpa-onnx não carrega nesta máquina: {e}")
    from motor.provedores.transcricao_parakeet import Parakeet
    pathlib.Path(dados).mkdir(parents=True, exist_ok=True)
    wav = pathlib.Path(dados) / "a.wav"
    import subprocess
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(material_real / "seg" / "0948_57_0.mov"), "-vn", "-ac", "1", "-ar", "48000", str(wav)], check=True)
    tr = Parakeet(config.carregar()).transcrever(wav)
    txt = " ".join(s["texto"] for s in tr["segmentos"]).lower()
    assert tr["vad"] is False and "compet" in txt
