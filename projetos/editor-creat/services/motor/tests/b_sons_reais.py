"""Ajudantes dos testes da M6 (banco de sons reais), todos SEM internet.

- mini índice no MESMO formato do real (`kit-edicao-17-11/sfx-banco/indice.jsonl.gz`, esquema da tabela `sons`), com ~11
  linhas cujas URLs apontam para um servidor HTTP local;
- áudio sintético (WAV/FLAC) com conteúdo conhecido;
- `Servidor`: ThreadingHTTPServer com Range (206 + Content-Range), modos de falha (429, 503, 403, 200 ignorando o Range,
  lento) e contadores (pedidos por caminho, conexões simultâneas, bytes mandados);
- `TranscritorFalso`: "ouve" voz nos ids marcados;
- `sem_internet`: socket fora do loopback é recusado (prova de que nenhum teste sai para a rede).
"""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import pathlib
import socket
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np
import pytest

SR = 48000


# ---------------------------------------------------------------- áudio
def ruido_rosa(n: int, seed: int, canais: int = 2) -> np.ndarray:
    rng = np.random.default_rng(seed)
    x = rng.standard_normal((n, canais))
    f = np.fft.rfftfreq(n, 1 / SR)
    X = np.fft.rfft(x, axis=0) / np.sqrt(np.maximum(f, 20.0))[:, None]
    y = np.fft.irfft(X, n, axis=0)
    return (0.25 * y / (np.abs(y).max() + 1e-9)).astype(np.float32)


def batida(dur: float, t_ataque: float, sr: int = SR, canais: int = 1) -> np.ndarray:
    """Silêncio e uma pancada (tampa batendo) em t_ataque: o ataque é inequívoco."""
    n = int(dur * sr)
    x = np.zeros(n, np.float32)
    a = int(t_ataque * sr)
    t = np.arange(n - a) / sr
    x[a:] = (0.8 * np.sin(2 * np.pi * 180 * t) * np.exp(-t * 18)).astype(np.float32)
    rng = np.random.default_rng(3)
    x[a:] += (0.3 * rng.standard_normal(n - a) * np.exp(-t * 40)).astype(np.float32)
    x += (1e-4 * rng.standard_normal(n)).astype(np.float32)          # piso de sala (nada de silêncio digital)
    return np.repeat(x[:, None], canais, 1) if canais > 1 else x[:, None]


def wav_bytes(x: np.ndarray, sr: int, subtipo: str = "PCM_16") -> bytes:
    import soundfile as sf
    b = io.BytesIO()
    sf.write(b, x, sr, subtype=subtipo, format="WAV")
    return b.getvalue()


def flac_bytes(x: np.ndarray, sr: int) -> bytes:
    import soundfile as sf
    b = io.BytesIO()
    sf.write(b, x, sr, subtype="PCM_16", format="FLAC")
    return b.getvalue()


# ---------------------------------------------------------------- servidor
class Servidor:
    """Serve {caminho: bytes}. `modo[caminho]` (ou `modo['*']`): ok | ignora_range | 429_uma_vez | 429_espera | 503 | 403 |
    lento | 404 | redir."""

    def __init__(self, porta: int = 0):
        self.arquivos: dict[str, bytes] = {}
        self.modo: dict[str, str] = {}
        self.pedidos: list[tuple[str, str | None]] = []
        self.ativos = 0
        self.max_ativos = 0
        self.enviados = 0
        self.atraso = 0.0
        self.redir = "http://10.0.0.1/segredo"
        self._trava = threading.Lock()
        self._vezes: dict[str, int] = {}
        srv = self

        class H(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *a):
                pass

            def do_GET(self):
                with srv._trava:
                    srv.ativos += 1
                    srv.max_ativos = max(srv.max_ativos, srv.ativos)
                    srv.pedidos.append((self.path, self.headers.get("Range")))
                    vez = srv._vezes[self.path] = srv._vezes.get(self.path, 0) + 1
                try:
                    srv._responder(self, vez)
                except (BrokenPipeError, ConnectionResetError):
                    pass
                finally:
                    with srv._trava:
                        srv.ativos -= 1

        ThreadingHTTPServer.allow_reuse_address = True
        self.httpd = ThreadingHTTPServer(("127.0.0.1", porta), H)
        self.httpd.daemon_threads = True
        self.porta = self.httpd.server_address[1]
        self.t = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.t.start()

    def url(self, caminho: str) -> str:
        return f"http://127.0.0.1:{self.porta}{caminho}"

    def fechar(self):
        self.httpd.shutdown()
        self.httpd.server_close()

    def contar(self, caminho: str | None = None) -> int:
        return len([p for p in self.pedidos if caminho is None or p[0] == caminho])

    def _responder(self, h, vez: int):
        caminho = h.path
        modo = self.modo.get(caminho, self.modo.get("*", "ok"))
        if self.atraso or modo == "lento":
            time.sleep(self.atraso or 0.25)
        if modo == "redir":                                  # redireciona para fora da lista (SSRF)
            h.send_response(302)
            h.send_header("Location", self.redir)
            h.send_header("Content-Length", "0")
            h.end_headers()
            return
        if modo == "429_espera" and vez == 1:                 # 429 com Retry-After (o servidor diz quanto esperar)
            h.send_response(429)
            h.send_header("Retry-After", "30")
            h.send_header("Content-Length", "0")
            h.end_headers()
            return
        if modo == "403" or (modo == "429_uma_vez" and vez == 1) or modo in ("503", "404"):
            cod = {"403": 403, "503": 503, "404": 404}.get(modo, 429)
            h.send_response(cod)
            h.send_header("Content-Length", "0")
            h.end_headers()
            return
        if caminho not in self.arquivos:
            h.send_response(404)
            h.send_header("Content-Length", "0")
            h.end_headers()
            return
        dados = self.arquivos[caminho]
        rng = h.headers.get("Range")
        if modo == "ignora_range" and rng:                   # servidor que manda o arquivo inteiro: 32 MB de corpo
            total = 32 * 1024 * 1024
            h.send_response(200)
            h.send_header("Content-Length", str(total))
            h.end_headers()
            bloco = b"\0" * 65536
            for _ in range(total // len(bloco)):
                h.wfile.write(bloco)
                with self._trava:
                    self.enviados += len(bloco)
            return
        if rng:
            a, _, b = rng.replace("bytes=", "").partition("-")
            a, b = int(a), min(int(b), len(dados) - 1)
            corpo = dados[a:b + 1]
            h.send_response(206)
            h.send_header("Content-Range", f"bytes {a}-{b}/{len(dados)}")
        else:
            corpo = dados
            h.send_response(200)
        h.send_header("Content-Length", str(len(corpo)))
        h.end_headers()
        h.wfile.write(corpo)
        with self._trava:
            self.enviados += len(corpo)


# ---------------------------------------------------------------- índice
def _linha(i, nome, bib, dur, *, canais="", wav=None, flac=None, item="fake-gdc-2024", pacote="GDC 2024", principal=1, risco_voz=False,
           categorias=("agua",), tam_flac=None):
    return {"id": i, "item": item, "pacote": pacote, "principal": principal, "biblioteca": bib, "nome": nome,
            "caminho": f"{bib}/{nome}.wav", "caminho_wav": f"{bib}/{nome}.wav", "caminho_flac": f"{bib}/{nome}.flac",
            "tam_wav": len(wav[1]) if wav else None, "tam_flac": tam_flac if tam_flac is not None else (len(flac[1]) if flac else None),
            "dur_s": dur, "canais": canais or None,
            "url_wav": wav[0] if wav else "", "url_flac": flac[0] if flac else "", "categorias": list(categorias), "risco_voz": risco_voz,
            "md5_wav": hashlib.md5(wav[1]).hexdigest() if wav else "", "md5_flac": hashlib.md5(flac[1]).hexdigest() if flac else "",
            "item_flac": item}


_AUDIO: dict = {}


def _audio_base() -> dict:
    """Áudio sintético dos sons do mini banco (gerado uma vez por sessão de teste): id -> (ext, sinal, sr)."""
    if not _AUDIO:
        tampa = batida(2.0, 0.6, SR, 1)
        _AUDIO.update({
            101: ("wav", ruido_rosa(int(40 * 44100), 11), 44100),           # 44,1 kHz: prova a reamostragem para 48 kHz
            102: ("wav", ruido_rosa(int(30 * SR), 12), SR), 103: ("wav", ruido_rosa(int(30 * SR), 13), SR),
            104: ("wav", ruido_rosa(int(30 * SR), 14), SR), 105: ("wav", ruido_rosa(int(30 * SR), 15), SR),
            106: ("flac", tampa, SR), 111: ("flac", tampa, SR), 107: ("wav", batida(3.0, 0.4, SR, 2), SR),
            108: ("flac", batida(1.0, 0.1, SR, 1), SR), 110: ("wav", ruido_rosa(int(25 * SR), 16), SR)})
        for k, (ext, x, sr) in list(_AUDIO.items()):
            _AUDIO[k] = (ext, x, sr, wav_bytes(x, sr) if ext == "wav" else flac_bytes(x, sr))
    return _AUDIO


def montar_banco(srv: Servidor) -> dict:
    """Áudio sintético servido pelo `srv` + as linhas do índice. Devolve {(id, ext): (url, bytes, sinal, sr, caminho)} e as linhas."""
    a = {}

    def pub(i):
        ext, x, sr, b = _audio_base()[i]
        caminho = f"/download/fake-gdc-2024/som_{i}.{ext}"
        srv.arquivos[caminho] = b
        a[(i, ext)] = (srv.url(caminho), b, x, sr, caminho)
        return srv.url(caminho), b

    w101, w102, w103, w104, w105 = (pub(i) for i in (101, 102, 103, 104, 105))
    f106, f111, w107, f108, w110 = (pub(i) for i in (106, 111, 107, 108, 110))
    linhas = [
        _linha(101, "AMB Creek water flowing gentle stereo", "Fake Nature - Flowing Water", 40.0, canais="estereo", wav=w101),
        _linha(102, "Creek flowing water mono", "Fake Nature - Brooks", 30.0, canais="mono", wav=w102),
        _linha(103, "Market crowd talking near water fountain creek", "Fake City - Plaza", 30.0, wav=w103),
        _linha(104, "River creek water flowing ambisonic", "Fake 3D - Rivers", 30.0, canais="ambisonico", wav=w104),
        _linha(105, "Creek water with distant voices", "Fake Park", 30.0, wav=w105, risco_voz=True),
        _linha(106, "Car trunk open close exterior", "Fake Cars - Hatchback", 2.0, flac=f106, categorias=("carro",)),
        _linha(111, "Car trunk open close exterior", "Fake Cars - Hatchback", 2.0, flac=f111, categorias=("carro",)),
        _linha(107, "Car trunk open interior", "Fake Cars - SUV", 3.0, wav=w107, tam_flac=7_000_000, categorias=("carro",)),
        _linha(108, "Footsteps dirt single step", "Fake Foley - Steps", 1.0, flac=f108, categorias=("passos_terra",)),
        _linha(109, "AMB Creek water flowing gentle stereo", "Fake Nature - Flowing Water", 40.0, canais="estereo", wav=w101, principal=0),
        _linha(110, "Forest morning birds wind stereo", "Fake Nature - Forest", 25.0, canais="estereo", wav=w110, categorias=("floresta",)),
    ]
    # enchimento: como no banco real, a maioria dos sons não tem nada a ver com o pedido (o bm25 precisa disso para pesar)
    objetos = ("Door close wood", "Glass clink", "Paper rustle", "Keyboard typing", "Metal hit", "Cloth whoosh", "Engine idle", "Bell ring")
    for k in range(32):
        linhas.append(_linha(200 + k, f"{objetos[k % len(objetos)]} take {k}", "Fake Foley - Misc", 3.0 + k % 5,
                             wav=(srv.url(f"/download/fake-gdc-2024/nao_servido_{k}.wav"), b"x" * 1000), categorias=("objeto",)))
    return {"audio": a, "linhas": linhas}


def gravar_jsonl(linhas: list[dict], arq: pathlib.Path) -> pathlib.Path:
    arq.parent.mkdir(parents=True, exist_ok=True)
    with gzip.open(arq, "wt", encoding="utf-8") as f:
        for r in linhas:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    return arq


# ---------------------------------------------------------------- transcritor
class TranscritorFalso:
    """'Ouve' 4 palavras quando o arquivo é de um id em `com_voz` (nome do cache = <id>_<hash>) ou quando `tudo=True`."""

    def __init__(self, com_voz=(), tudo: bool = False):
        self.com_voz = {str(i) for i in com_voz}
        self.tudo = tudo
        self.chamadas: list[str] = []

    def transcrever(self, wav, idioma="pt", palavras=True, **k):
        nome = pathlib.Path(wav).name
        self.chamadas.append(nome)
        partes = nome.split("_")
        tem = self.tudo or (len(partes) > 2 and partes[2] in self.com_voz)
        if not tem:
            return {"segmentos": []}
        ws = [[0.1 * i, 0.1 * i + 0.08, w, 0.9] for i, w in enumerate(["olha", "aqui", "o", "riacho"])]
        return {"segmentos": [{"s": 0.0, "e": 0.4, "texto": "olha aqui o riacho", "palavras": ws}]}


# ---------------------------------------------------------------- fixtures
@pytest.fixture()
def sem_internet(monkeypatch):
    """Qualquer conexão fora do loopback quebra o teste (o teste nunca usa a internet)."""
    original = socket.socket.connect

    def conectar(self, endereco):
        host = endereco[0] if isinstance(endereco, tuple) else str(endereco)
        if host not in ("127.0.0.1", "::1", "localhost") and not str(host).startswith("/"):
            raise OSError(f"teste tentou sair para a internet ({host})")
        return original(self, endereco)

    monkeypatch.setattr(socket.socket, "connect", conectar)
    return True


@pytest.fixture()
def banco(dados, monkeypatch, tmp_path, sem_internet):
    """Servidor local + mini índice no lugar do real + 127.0.0.1 liberado só para o teste + recuo sem esperar."""
    from motor.sons_reais import baixar as BX
    from motor.sons_reais import indice as IX
    srv = Servidor()
    b = montar_banco(srv)
    arq = gravar_jsonl(b["linhas"], tmp_path / "mini" / "indice.jsonl.gz")
    monkeypatch.setattr(IX, "JSONL", arq)
    monkeypatch.delenv("EDITOR_SFX_BANCO", raising=False)
    monkeypatch.setenv("EDITOR_SONS_REAIS", "1")
    monkeypatch.setattr(BX, "HOSTS_TESTE", frozenset({"127.0.0.1"}))
    dormidas: list[float] = []
    monkeypatch.setattr(BX, "DORMIR", dormidas.append)
    b.update(srv=srv, jsonl=arq, dormidas=dormidas, dados=dados)
    yield b
    srv.fechar()


def item_de(con, ids, *, papel="ambiente", t0=1.0, t1=13.0, rid="R01", desc="água de riacho", ganho=None) -> dict:
    """Item de edl.sons_reais montado direto do índice (o 1º id é o principal, os outros são as reservas)."""
    from motor import sons_reais as SR
    from motor.sons_reais import indice as IX
    rs = [IX.info(con, i) for i in ids]
    precisa = (t1 - t0) if papel == "ambiente" else 1.0
    cs = [SR.candidato(r, papel, precisa) for r in rs]
    top = rs[0]
    return {"id": rid, "papel": papel, "desc": desc, "bloco": "B1", "origem": "direcao", "id_banco": top["id"], "item": top["item"],
            "pacote": top["pacote"], "biblioteca": top["biblioteca"], "nome": top["nome"],
            **{k: cs[0][k] for k in ("url", "formato", "md5", "trecho", "tam")},
            "t0": t0, "t1": t1, "ganho_db": ganho if ganho is not None else (-28.0 if papel == "ambiente" else -10.0),
            "fade": [1.2, 1.5] if papel == "ambiente" else [0.005, 0.03], "reservas": cs[1:3]}
