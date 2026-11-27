"""Download educado de UM som do banco (peça M6): archive.org, um pedido por vez no servidor inteiro, conferido e guardado.

- Pedido só para `https://archive.org/download/...` (a URL que o índice traz). Redirecionamento só para `archive.org` ou
  para os servidores de arquivo `ia<n>...archive.org`/`dn<n>...archive.org`, sempre em https (fecha SSRF; `web.archive.org`,
  que serve páginas de terceiros, fica de fora). Os testes liberam 127.0.0.1 por `HOSTS_TESTE` (nunca por variável de ambiente).
- Um por vez: `fcntl.flock` em `<cache>/.baixando.lock` (motor, worker e réplicas dividem o volume).
- 429/503: recua 10, 20, 40 s (ou o `Retry-After`, até 120 s) dentro do teto de tempo; esgotou = grava `<cache>/.recuo_ate`
  (agora + 10 min) e ninguém pede nada até lá. 403: para TUDO e grava `<cache>/.bloqueado_ate` (agora + 1 h); outros filmes
  respeitam o prazo. Não troca de rota nem de espelho depois de um bloqueio.
- Trecho (só WAV): lê o cabeçalho nos primeiros 64 KB (pedido parcial) e, se o `fmt`/`data` vier depois (BWF com
  `bext`/`iXML` grandes), segue a lista de chunks com mais pedidos parciais (até 6, até 16 MB do início). Mais de 2 canais é
  recusado ANTES de baixar o pedaço. Confere 206, `Content-Range` igual ao pedido, tamanho exato e `fmt` válido (RIFF/RF64).
  Servidor que responde 200 a um pedido parcial: a conexão é fechada na hora (nunca baixa o arquivo inteiro).
- Arquivo inteiro (FLAC pequeno): MD5 contra o do índice; não bateu = descarta (quem chama tenta a reserva).
- Tetos por filme (`Sessao`): bytes e tempo de REDE (só o tempo dentro dos pedidos, da espera da vez e do recuo; a
  transcrição e o resto do preparo não contam). Cada leitura tem prazo proporcional ao tamanho (vazão mínima de 250 KB/s,
  nunca menos de 30 s). Estourou = `Indisponivel` (vira aviso).
- `pendente`: só falha passageira (rede, tempo, recuo, bloqueio, MD5) fica pendente. O que depende do ARQUIVO (cabeçalho
  inválido, tamanho diferente do índice, canais demais, arquivo maior que o teto inteiro) não é pendente: tentar de novo
  daria no mesmo, e a pendência travaria o reuso da montagem e repetiria pedidos em todo filme.
- User-Agent genérico, sem e-mail nem nome de cliente.
Falha nunca derruba a montagem: tudo aqui levanta `Indisponivel` ou `Bloqueado`, que viram aviso em `preparar`.
"""
from __future__ import annotations

import contextlib
import fcntl
import hashlib
import io
import os
import pathlib
import re
import struct
import time
import urllib.error
import urllib.parse
import urllib.request

UA = "editor-motor/1.0 (download de 1 arquivo por vez)"
HOSTS_TESTE: frozenset = frozenset()        # os testes põem {"127.0.0.1"}; produção: vazio
CABECALHO_BYTES = 65536
CABECALHO_PEDIDOS = 6                       # pedidos extras para seguir os chunks além dos primeiros 64 KB
CABECALHO_MAX_OFF = 16 * 1024 * 1024        # e nunca além de 16 MB do começo do arquivo
TRECHO_MAX_BYTES = 40_000_000               # um trecho nunca passa disso (ambiente mais curto vira laço na mixagem)
POR_PEDIDO_S = 30.0
VAZAO_MIN = 250_000                         # bytes/s: o prazo de cada leitura cresce com o tamanho
RECUOS_S = (10.0, 20.0, 40.0)
RETRY_AFTER_MAX_S = 120.0
RECUO_PERSISTE_S = 600.0                    # 429/503 depois de todos os recuos: ninguém pede nada por 10 min
BLOQUEIO_S = 3600.0
DORMIR = time.sleep                         # recuo em 429/503 (os testes trocam por um que não espera)


class Indisponivel(Exception):
    """O som não veio agora. `pendente=True` = falha passageira (rede, tempo, teto, md5): a próxima montagem tenta de novo."""

    def __init__(self, motivo: str, pendente: bool = True):
        super().__init__(motivo)
        self.motivo = motivo
        self.pendente = pendente


class Bloqueado(Indisponivel):
    """O archive.org bloqueou (403) ou o prazo de bloqueio ainda vale: nada mais é pedido."""


_RE_SERVIDOR_IA = re.compile(r"^(ia|dn)\d+(\.[a-z]{2,3})?\.archive\.org$")


def host_permitido(url: str) -> bool:
    """Destino aceito (inclusive depois de redirecionamento): https em archive.org ou num servidor de arquivo ia<n>/dn<n>."""
    try:
        u = urllib.parse.urlsplit(url)
    except ValueError:
        return False
    h = (u.hostname or "").lower()
    if h in HOSTS_TESTE:
        return u.scheme in ("http", "https")
    return u.scheme == "https" and (h == "archive.org" or bool(_RE_SERVIDOR_IA.match(h)))


def url_permitida(url: str) -> bool:
    """O PRIMEIRO pedido: só a forma que o índice traz, `https://archive.org/download/<item>/<arquivo>`."""
    if not host_permitido(url):
        return False
    u = urllib.parse.urlsplit(url)
    h = (u.hostname or "").lower()
    return (h in HOSTS_TESTE or h == "archive.org") and u.path.startswith("/download/") and ".." not in u.path


class _Redirecionamento(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not host_permitido(newurl):
            raise Indisponivel(f"redirecionamento para host fora da lista ({urllib.parse.urlsplit(newurl).hostname})", pendente=False)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class Sessao:
    """Orçamento de rede de UM filme (bytes, tempo total, tempo por pedido) e o caminho da trava/bloqueio do servidor."""

    def __init__(self, cache: pathlib.Path, *, teto_bytes: int = 150_000_000, teto_s: float = 240.0, por_pedido_s: float = POR_PEDIDO_S,
                 dormir=None, relogio=time.monotonic, agora=time.time):
        self.cache = pathlib.Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.teto_bytes, self.teto_s, self.por_pedido_s = int(teto_bytes), float(teto_s), float(por_pedido_s)
        self.dormir = dormir or (lambda seg: DORMIR(seg))
        self.relogio, self.agora = relogio, agora
        self.gasto = 0.0                            # segundos de REDE já usados (pedidos, espera da vez, recuo)
        self._desde: float | None = None
        self.bytes = 0
        self.pedidos = 0
        self.rede_caiu: str | None = None          # servidor fora do ar: os próximos sons nem tentam (educação + tempo)

    # ---------- orçamento
    def resta_s(self) -> float:
        corrente = (self.relogio() - self._desde) if self._desde is not None else 0.0
        return self.teto_s - self.gasto - corrente

    @contextlib.contextmanager
    def _na_rede(self):
        """Conta o tempo do bloco no orçamento de rede (transcrição e gravação do cache ficam de fora)."""
        if self._desde is not None:                 # já contando (bloco dentro de bloco)
            yield
            return
        self._desde = self.relogio()
        try:
            yield
        finally:
            self.gasto += self.relogio() - self._desde
            self._desde = None

    def _ate(self, nome: str) -> float | None:
        try:
            ate = float((self.cache / nome).read_text().strip())
        except (OSError, ValueError):
            return None
        return ate if self.agora() < ate else None

    def conferir_bloqueio(self) -> None:
        ate = self._ate(".bloqueado_ate")
        if ate is not None:
            raise Bloqueado(f"o archive.org bloqueou os downloads; nova tentativa depois de {time.strftime('%H:%M', time.localtime(ate))}")
        ate = self._ate(".recuo_ate")
        if ate is not None:
            raise Bloqueado(f"o archive.org pediu para esperar (429/503); nova tentativa depois de {time.strftime('%H:%M', time.localtime(ate))}")

    def _gravar_prazo(self, nome: str, seg: float) -> None:
        tmp = self.cache / f"{nome}.{os.getpid()}.tmp"
        tmp.write_text(str(self.agora() + seg))
        os.replace(tmp, self.cache / nome)

    def bloquear(self) -> None:
        self._gravar_prazo(".bloqueado_ate", BLOQUEIO_S)

    def recuar(self) -> None:
        self._gravar_prazo(".recuo_ate", RECUO_PERSISTE_S)

    @contextlib.contextmanager
    def trava(self):
        """Um download por vez no servidor inteiro. Espera a vez dentro do orçamento de tempo."""
        f = open(self.cache / ".baixando.lock", "a+")
        try:
            with self._na_rede():
                while True:
                    try:
                        fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                        break
                    except BlockingIOError:
                        if self.resta_s() <= 0:
                            raise Indisponivel("o tempo de rede do filme acabou esperando a vez de baixar") from None
                        time.sleep(0.05)
            yield
        finally:
            try:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            finally:
                f.close()

    # ---------- HTTP
    def _abridor(self, url: str):
        h = (urllib.parse.urlsplit(url).hostname or "").lower()
        proxies = urllib.request.ProxyHandler({}) if h in HOSTS_TESTE else urllib.request.ProxyHandler()
        return urllib.request.build_opener(proxies, _Redirecionamento())

    def abrir(self, url: str, faixa: tuple[int, int] | None = None):
        """Abre UM pedido (com recuo em 429/503). Devolve a resposta aberta; quem chama lê e fecha."""
        if self.rede_caiu:
            raise Indisponivel(self.rede_caiu)
        if not url_permitida(url):
            raise Indisponivel(f"endereço fora da lista ({urllib.parse.urlsplit(url).hostname})", pendente=False)
        self.conferir_bloqueio()
        with self._na_rede():
            return self._abrir(url, faixa)

    def _abrir(self, url: str, faixa):
        recuos = list(RECUOS_S)
        while True:
            resta = self.resta_s()
            if resta <= 0.5:
                raise Indisponivel("o tempo de rede do filme acabou")
            cab = {"User-Agent": UA, "Accept-Encoding": "identity"}
            if faixa is not None:
                cab["Range"] = f"bytes={faixa[0]}-{faixa[1]}"
            req = urllib.request.Request(url, headers=cab)
            self.pedidos += 1
            try:
                return self._abridor(url).open(req, timeout=max(1.0, min(self.por_pedido_s, resta)))
            except Indisponivel:
                raise
            except urllib.error.HTTPError as e:
                espera_srv = _retry_after(e.headers.get("Retry-After") if e.headers else None)
                e.close()
                if e.code == 403:
                    self.bloquear()
                    raise Bloqueado("o archive.org respondeu 403 (bloqueado): paro aqui por 1 h, sem trocar de rota") from None
                if e.code in (429, 503):
                    espera = max(recuos[0], min(espera_srv or 0.0, RETRY_AFTER_MAX_S)) if recuos else None
                    if espera is None or espera >= self.resta_s() - 1:
                        motivo = f"o archive.org respondeu {e.code} e o tempo de recuo acabou"
                        self.rede_caiu = motivo                       # neste filme ninguém mais pede
                        try:
                            self.recuar()                             # nem nos próximos 10 min
                        except OSError:
                            pass
                        raise Indisponivel(motivo) from None
                    recuos.pop(0)
                    self.dormir(espera)
                    continue
                raise Indisponivel(f"o servidor respondeu {e.code}", pendente=e.code not in (404, 410)) from None
            except (urllib.error.URLError, TimeoutError, OSError) as e:
                motivo = f"rede indisponível ({type(getattr(e, 'reason', e)).__name__}: {getattr(e, 'reason', e)})"[:200]
                self.rede_caiu = motivo
                raise Indisponivel(motivo) from None

    def ler(self, resp, esperado: int) -> bytes:
        """Lê exatamente `esperado` bytes (nem mais: abortar se o servidor mandar além), dentro dos tetos."""
        if self.bytes + esperado > self.teto_bytes:
            resp.close()
            # sozinho cabe no teto = os outros sons do filme gastaram o orçamento: na próxima eles saem do cache (pendente)
            raise Indisponivel(f"teto de download do filme ({self.teto_bytes / 1e6:.0f} MB) estouraria", pendente=esperado <= self.teto_bytes)
        with self._na_rede():
            return self._ler(resp, esperado)

    def _ler(self, resp, esperado: int) -> bytes:
        prazo = max(self.por_pedido_s, esperado / VAZAO_MIN)
        fim = self.relogio() + min(prazo, max(0.5, self.resta_s()))
        partes, n = [], 0
        try:
            while n < esperado:
                if self.relogio() > fim:
                    raise Indisponivel(f"a leitura passou de {prazo:.0f} s (ou do tempo de rede do filme)")
                b = resp.read(min(1 << 16, esperado - n))
                if not b:
                    break
                partes.append(b)
                n += len(b)
                self.bytes += len(b)
            if n == esperado and resp.read(1):
                raise Indisponivel("o servidor mandou mais bytes do que o pedido")
        except (TimeoutError, OSError) as e:
            raise Indisponivel(f"a transferência caiu ({type(e).__name__})") from None
        finally:
            resp.close()
        if n != esperado:
            raise Indisponivel(f"a transferência veio incompleta ({n} de {esperado} bytes)")
        return b"".join(partes)


def _retry_after(v: str | None) -> float | None:
    """`Retry-After` em segundos (a forma de data HTTP é ignorada: vale o recuo da casa)."""
    try:
        return max(0.0, float(str(v).strip())) if v else None
    except ValueError:
        return None


# ---------------------------------------------------------------- WAV
_RE_FAIXA = re.compile(r"^bytes (\d+)-(\d+)/(\d+|\*)$")


def _faixa_ok(resp, a: int, b: int) -> int | None:
    """Confere 206 + Content-Range exato (o fim só pode encurtar quando o arquivo acaba antes); devolve o tamanho total do
    arquivo (ou None se o servidor não disser)."""
    status = getattr(resp, "status", None) or resp.getcode()
    if status != 206:
        resp.close()
        raise Indisponivel(f"o servidor respondeu {status} a um pedido parcial: fechei sem baixar o arquivo inteiro", pendente=False)
    m = _RE_FAIXA.match((resp.headers.get("Content-Range") or "").strip())
    total = None if not m or m.group(3) == "*" else int(m.group(3))
    fim_ok = m is not None and (int(m.group(2)) == b or (total is not None and b >= total and int(m.group(2)) == total - 1))
    if not m or int(m.group(1)) != a or not fim_ok:
        resp.close()
        raise Indisponivel(f"Content-Range diferente do pedido ({resp.headers.get('Content-Range')!r} para {a}-{b})")
    return total


def _analisar(pegar) -> dict:
    """Percorre os chunks RIFF/RF64 com `pegar(offset, n) -> bytes` (pode voltar menos no fim do que tem)."""
    b = pegar(0, 12)
    if len(b) < 12 or b[:4] not in (b"RIFF", b"RF64") or b[8:12] != b"WAVE":
        raise ValueError("não é WAV")
    pos, fmt, data_off, data_len, ds64 = 12, None, None, None, None
    while True:
        h = pegar(pos, 8)
        if len(h) < 8:
            break
        cid = h[:4]
        sz = struct.unpack("<I", h[4:8])[0]
        if cid == b"ds64":
            corpo = pegar(pos + 8, 24)
            if len(corpo) >= 16:
                ds64 = struct.unpack("<Q", corpo[8:16])[0]
        elif cid == b"fmt ":
            if sz > 256:
                raise ValueError(f"chunk fmt com {sz} bytes")
            fmt = pegar(pos + 8, sz)
        elif cid == b"data":
            data_off, data_len = pos + 8, sz
            break
        pos += 8 + sz + (sz & 1)
    if fmt is None or len(fmt) < 16 or data_off is None:
        raise ValueError("cabeçalho WAV não encontrado")
    tag, ch, taxa, _, bloco, bits = struct.unpack("<HHIIHH", fmt[:16])
    if tag not in (1, 3, 0xFFFE) or ch < 1 or taxa < 8000 or bits not in (8, 16, 24, 32, 64) or bloco != ch * bits // 8:
        raise ValueError(f"fmt WAV inesperado (tag {tag}, {ch} canais, {taxa} Hz, {bits} bits)")
    if data_len in (0, 0xFFFFFFFF):
        data_len = ds64
    return {"fmt": fmt, "canais": ch, "taxa": taxa, "bits": bits, "bloco": bloco, "data_off": data_off, "data_len": data_len}


def ler_cabecalho(b: bytes) -> dict:
    """Cabeçalho WAV/RF64 dentro dos bytes dados -> {fmt, canais, taxa, bits, bloco, data_off, data_len}. ValueError se não for
    WAV válido (ou se o `data` não começa dentro deles)."""
    return _analisar(lambda a, n: b[a:a + n])


def _cabecalho_remoto(s: "Sessao", url: str, cab: bytes, total: int | None) -> dict:
    """O cabeçalho a partir dos primeiros bytes já lidos; o que estiver além deles (BWF com bext/iXML grandes) vem por mais
    pedidos parciais, seguindo a lista de chunks, até CABECALHO_PEDIDOS pedidos e CABECALHO_MAX_OFF bytes do começo."""
    extra: list[tuple[int, bytes]] = []

    def pegar(a: int, n: int) -> bytes:
        if a + n <= len(cab):
            return cab[a:a + n]
        for off, b in extra:
            if off <= a and a + n <= off + len(b):
                return b[a - off:a - off + n]
        if total is not None and a >= total:
            return b""
        if len(extra) >= CABECALHO_PEDIDOS or a + n > CABECALHO_MAX_OFF:
            raise ValueError("o cabeçalho WAV vai além do limite de leitura")
        fim = a + max(n, CABECALHO_BYTES) - 1
        if total is not None:
            fim = min(fim, total - 1)
        resp = s.abrir(url, (a, fim))
        _faixa_ok(resp, a, fim)
        b = s.ler(resp, fim - a + 1)
        extra.append((a, b))
        return b[:n]
    return _analisar(pegar)


def _wav(fmt: bytes, dados: bytes) -> bytes:
    pad = b"\0" if len(fmt) & 1 else b""
    corpo = b"WAVE" + b"fmt " + struct.pack("<I", len(fmt)) + fmt + pad + b"data" + struct.pack("<I", len(dados)) + dados
    return b"RIFF" + struct.pack("<I", len(corpo)) + corpo


def trecho_wav(s: Sessao, url: str, ini_s: float, dur_s: float, tam_indice: int | None = None) -> tuple[bytes, dict]:
    """Só o pedaço [ini_s, ini_s + dur_s] de um WAV remoto, por pedidos parciais. Devolve (wav em memória, info)."""
    b0 = s.bytes
    resp = s.abrir(url, (0, CABECALHO_BYTES - 1))
    total = _faixa_ok(resp, 0, CABECALHO_BYTES - 1)
    esperado_cab = CABECALHO_BYTES if total is None else min(CABECALHO_BYTES, total)
    cab = s.ler(resp, esperado_cab)
    if tam_indice and total is not None and total != int(tam_indice):
        raise Indisponivel(f"o arquivo no servidor tem {total} bytes e o índice diz {tam_indice}", pendente=False)
    try:
        h = _cabecalho_remoto(s, url, cab, total)
    except ValueError as e:
        raise Indisponivel(f"cabeçalho inválido ({e})", pendente=False) from None
    if h["canais"] > 2:                                     # antes de baixar o pedaço: não serve direto para estéreo
        raise Indisponivel(f"o som tem {h['canais']} canais (surround/ambisônico): não entra no estéreo", pendente=False)
    bloco = h["bloco"]
    ini = int(max(0.0, ini_s) * h["taxa"]) * bloco
    n = int(max(0.01, dur_s) * h["taxa"]) * bloco
    n = min(n, TRECHO_MAX_BYTES // bloco * bloco)
    if h["data_len"]:
        n = min(n, max(0, h["data_len"] - ini) // bloco * bloco)
    if n <= 0:
        raise Indisponivel("o trecho pedido fica depois do fim do arquivo", pendente=False)
    a, b = h["data_off"] + ini, h["data_off"] + ini + n - 1
    resp = s.abrir(url, (a, b))
    _faixa_ok(resp, a, b)
    dados = s.ler(resp, n)
    info = {"canais": h["canais"], "taxa": h["taxa"], "bits": h["bits"], "duracao_s": round(n / bloco / h["taxa"], 3),
            "verificacao": "cabecalho+tamanho", "bytes": s.bytes - b0}
    return _wav(h["fmt"], dados), info


def arquivo_inteiro(s: Sessao, url: str, md5: str | None, tam_indice: int | None) -> tuple[bytes, dict]:
    """Arquivo inteiro (FLAC ou WAV pequeno do pontual), conferido pelo MD5 do índice."""
    if not md5 or not tam_indice:
        raise Indisponivel("sem MD5 ou tamanho no índice para conferir o arquivo inteiro", pendente=False)
    resp = s.abrir(url)
    status = getattr(resp, "status", None) or resp.getcode()
    if status != 200:
        resp.close()
        raise Indisponivel(f"o servidor respondeu {status} ao arquivo inteiro")
    cl = resp.headers.get("Content-Length")
    if cl is not None and cl.isdigit() and int(cl) != int(tam_indice):
        resp.close()
        raise Indisponivel(f"o arquivo no servidor tem {cl} bytes e o índice diz {tam_indice}", pendente=False)
    dados = s.ler(resp, int(tam_indice))
    if hashlib.md5(dados).hexdigest() != str(md5).lower():
        raise Indisponivel("o MD5 do arquivo baixado não bate com o do índice: descartado")
    return dados, {"verificacao": "md5", "bytes": len(dados)}


def decodificar(dados: bytes):
    """bytes (WAV/FLAC) -> (float32 (n, canais), taxa, bits)."""
    import soundfile as sf
    with sf.SoundFile(io.BytesIO(dados)) as f:
        x = f.read(dtype="float32", always_2d=True)
        sub = f.subtype or ""
        bits = {"PCM_16": 16, "PCM_24": 24, "PCM_32": 32, "FLOAT": 32, "DOUBLE": 64, "PCM_U8": 8, "PCM_S8": 8}.get(sub)
        return x, f.samplerate, bits
