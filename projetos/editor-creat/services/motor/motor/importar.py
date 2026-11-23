"""Importação por link compartilhado (Dropbox ou Google Drive) SEM chave do dono, e registro de arquivos.

- Dropbox: arquivo (`/s/`, `/scl/fi/`) vira download direto com `dl=1`; pasta (`/scl/fo/`, `/sh/`) baixa como .zip
  e os vídeos de dentro viram arquivos do projeto.
- Drive: arquivo (`/file/d/<id>`, `open?id=`, `uc?id=`) vira `drive.usercontent.google.com/download?...&confirm=t`.
  Pasta do Drive não tem download público sem chave: erro claro em pt-BR.
- Segurança: só https e só hosts dessas duas empresas, conferidos também em cada redirecionamento (sem SSRF).
- Retomável: o download vai para `<destino>.part` e continua com `Range` depois de um reinício.
"""
from __future__ import annotations

import re
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

from motor import banco

HOSTS = ("dropbox.com", "dropboxusercontent.com", "drive.google.com", "docs.google.com",
         "drive.usercontent.google.com", "googleusercontent.com")
EXT_VIDEO = {".mov", ".mp4", ".m4v", ".mkv", ".webm", ".avi", ".mts", ".m2ts", ".3gp", ".hevc"}
EXT_AUDIO = {".m4a", ".mp3", ".wav", ".aac", ".flac", ".ogg", ".opus"}
EXT_MIDIA = EXT_VIDEO | EXT_AUDIO
AGENTE = "editor-creat-motor/0.1"


class ErroImportacao(Exception):
    """Mensagem já em pt-BR, pronta para a tela."""


def host_permitido(host: str, hosts=HOSTS) -> bool:
    host = (host or "").lower().rstrip(".")
    return any(host == h or host.endswith("." + h) for h in hosts)


def link_direto(url: str, hosts=HOSTS) -> tuple[str, str]:
    """Devolve (url_de_download, tipo) com tipo em {'arquivo', 'pasta_zip'}."""
    u = urllib.parse.urlsplit(url.strip())
    if u.scheme != "https" or not u.hostname or not host_permitido(u.hostname, hosts):
        raise ErroImportacao("Link não aceito: use um link https compartilhado do Dropbox ou do Google Drive.")
    h, caminho = u.hostname.lower(), u.path
    q = urllib.parse.parse_qs(u.query, keep_blank_values=True)
    if "dropbox" in h:
        if caminho.startswith(("/t/", "/transfer/")):
            raise ErroImportacao("Link de transferência do Dropbox não baixa direto. No Dropbox, toque em Compartilhar > Copiar link "
                                 "da PASTA (ou de cada vídeo) e cole aqui.")
        q.pop("raw", None)
        q["dl"] = ["1"]
        tipo = "pasta_zip" if caminho.startswith(("/scl/fo/", "/sh/")) else "arquivo"
        return urllib.parse.urlunsplit(("https", u.netloc, caminho, urllib.parse.urlencode(q, doseq=True), "")), tipo
    if "google" in h:
        if "/folders/" in caminho or "/drive/folders" in caminho:
            raise ErroImportacao("Pasta do Google Drive não pode ser baixada sem chave. Compartilhe os vídeos um a um ou use uma pasta do Dropbox.")
        m = re.search(r"/file/d/([A-Za-z0-9_-]{10,})", caminho)
        fid = m.group(1) if m else (q.get("id") or [""])[0]
        if not re.fullmatch(r"[A-Za-z0-9_-]{10,}", fid or ""):
            raise ErroImportacao("Não achei o id do arquivo no link do Drive.")
        return f"https://drive.usercontent.google.com/download?id={fid}&export=download&confirm=t", "arquivo"
    if host_permitido(h, hosts):   # host extra liberado (testes)
        return url, "arquivo"
    raise ErroImportacao("Link não reconhecido.")


class _Redirecionador(urllib.request.HTTPRedirectHandler):
    def __init__(self, hosts):
        self.hosts = hosts

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        u = urllib.parse.urlsplit(newurl)
        if not (u.scheme == "https" or (u.scheme == "http" and u.hostname in ("127.0.0.1", "localhost") and host_permitido(u.hostname, self.hosts))):
            raise ErroImportacao("O link redirecionou para um endereço não seguro.")
        if (u.hostname or "").lower() == "accounts.google.com":
            raise ErroImportacao(MSG_LOGIN_DRIVE)          # arquivo privado do Drive manda para a tela de login
        if not host_permitido(u.hostname or "", self.hosts):
            raise ErroImportacao(f"O link redirecionou para fora do Dropbox/Drive ({u.hostname}).")
        novo = super().redirect_request(req, fp, code, msg, headers, newurl)
        if novo is not None and req.has_header("Range"):
            novo.add_header("Range", req.get_header("Range"))
        return novo


def _nome_de(cabecalho: str | None, url: str) -> str:
    nome = ""
    if cabecalho:
        m = re.search(r"filename\*=(?:UTF-8|utf-8)''([^;]+)", cabecalho)
        if m:
            nome = urllib.parse.unquote(m.group(1))
        else:
            m = re.search(r'filename="?([^";]+)"?', cabecalho)
            nome = m.group(1) if m else ""
    if not nome:
        nome = urllib.parse.unquote(Path(urllib.parse.urlsplit(url).path).name)
    nome = re.sub(r"[\x00-\x1f/\\]+", "_", nome).strip(" .") or "arquivo"
    return nome[:200]


def baixar(url: str, destino: Path, *, hosts=HOSTS, max_bytes: int = 60 << 30, progresso=None, timeout: float = 60) -> tuple[Path, str, int]:
    """Baixa `url` para `destino` (retomando de `destino.part`). Devolve (caminho, nome_original, bytes)."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    parte = destino.with_name(destino.name + ".part")
    abridor = urllib.request.build_opener(_Redirecionador(hosts))
    for tentativa in range(2):     # 2a volta: página de confirmação do Drive
        ja = parte.stat().st_size if parte.exists() else 0
        req = urllib.request.Request(url, headers={"User-Agent": AGENTE, **({"Range": f"bytes={ja}-"} if ja else {})})
        try:
            resp = abridor.open(req, timeout=timeout)
        except urllib.error.HTTPError as e:
            if e.code == 416 and ja:
                return _fechar(parte, destino, e.headers.get("Content-Disposition"), url)
            if e.code in (401, 403, 404):
                raise ErroImportacao("O link não está público (ou expirou). Gere um link 'qualquer pessoa com o link'.") from e
            raise
        with resp:
            tipo = resp.headers.get("Content-Type", "")
            if "text/html" in tipo:
                html = resp.read(400_000).decode("utf-8", "replace")
                m = re.search(r'action="(https://drive\.usercontent\.google\.com/download[^"]*)"', html)
                if m and tentativa == 0:
                    campos = dict(re.findall(r'name="(\w+)" value="([^"]*)"', html))
                    url = m.group(1).replace("&amp;", "&") + ("&" if "?" in m.group(1) else "?") + urllib.parse.urlencode(campos)
                    continue
                if _pagina_de_login(html):
                    raise ErroImportacao(MSG_LOGIN_DRIVE if "google" in (urllib.parse.urlsplit(url).hostname or "") else MSG_LOGIN_DROPBOX)
                raise ErroImportacao("O link abriu uma página em vez do arquivo: confira se ele é público.")
            continuar = resp.status == 206 and ja > 0
            total = resp.headers.get("Content-Length")
            total = (int(total) + (ja if continuar else 0)) if total and total.isdigit() else None
            if total and total > max_bytes:
                raise ErroImportacao(f"Arquivo grande demais ({total / 2**30:.1f} GB).")
            if total:
                _checar_disco(destino.parent, total - (ja if continuar else 0))
            feito, ultimo = (ja if continuar else 0), 0.0
            with open(parte, "ab" if continuar else "wb") as f:
                while True:
                    bloco = resp.read(1 << 20)
                    if not bloco:
                        break
                    f.write(bloco)
                    feito += len(bloco)
                    if feito > max_bytes:
                        raise ErroImportacao("Arquivo grande demais.")
                    if progresso and time.time() - ultimo > 3:
                        ultimo = time.time()
                        progresso(feito, total)
            if total and feito < total:
                raise IOError(f"download incompleto: {feito} de {total} bytes (vai retomar)")
            return _fechar(parte, destino, resp.headers.get("Content-Disposition"), url)
    raise ErroImportacao("Não consegui baixar o arquivo do Drive.")


MSG_LOGIN_DROPBOX = ("Esse link do Dropbox só abre para quem está logado (link restrito da equipe). No app do Dropbox: toque nos 3 "
                     "pontinhos do vídeo ou da pasta > Compartilhar > Configurações do link (engrenagem) > Quem tem acesso: "
                     "\"Qualquer pessoa com o link\" > Salvar > Copiar link, e cole aqui de novo.")
MSG_LOGIN_DRIVE = ("Esse link do Google Drive só abre para quem está logado. No Drive: Compartilhar > Acesso geral: \"Qualquer pessoa "
                   "com o link\" > Copiar link, e cole aqui de novo.")


def _pagina_de_login(html: str) -> bool:
    """Só o COMEÇO do título ("Log in to Dropbox", "Sign in - Google Accounts", "Fazer login"): o título da prévia traz o
    nome do arquivo, e "login_tutorial.mp4" ou "concentrar" não podem virar "link restrito"."""
    t = re.search(r"<title[^>]*>\s*([^<]{0,200})</title>", html, re.I)
    return bool(t and re.match(r"(log ?in|sign ?in|entrar|fazer login|iniciar sess)\b", t.group(1).strip(), re.I))


def sondar(url: str, *, hosts=HOSTS, timeout: float = 15) -> str | None:
    """Confere o link NA HORA (o dono vê o motivo embaixo do botão, em vez de o arquivo sumir da fila minutos depois).
    Pede só o 1º byte e fecha. Levanta ErroImportacao só quando a resposta é definitiva (pede login, não existe);
    rede lenta ou fora devolve o motivo como texto e a importação segue para o worker, que tenta de novo."""
    direto, tipo = link_direto(url, hosts)
    return sondar_direto(direto, tipo, hosts=hosts, timeout=timeout)


def sondar_direto(direto: str, tipo: str = "arquivo", *, hosts=HOSTS, timeout: float = 15) -> str | None:
    google = "google" in (urllib.parse.urlsplit(direto).hostname or "")
    abridor = urllib.request.build_opener(_Redirecionador(hosts))
    req = urllib.request.Request(direto, headers={"User-Agent": AGENTE, "Range": "bytes=0-0"})
    prazo = time.monotonic() + timeout                          # prazo TOTAL (o timeout do socket vale por leitura)
    try:
        with abridor.open(req, timeout=timeout) as resp:
            if "text/html" not in resp.headers.get("Content-Type", ""):
                return None                                     # é o arquivo (ou o zip da pasta)
            partes, lidos = [], 0
            while lidos < 300_000 and time.monotonic() < prazo:
                b = resp.read(min(65_536, 300_000 - lidos))
                if not b:
                    break
                partes.append(b)
                lidos += len(b)
            html = b"".join(partes).decode("utf-8", "replace")
    except ErroImportacao:
        raise
    except urllib.error.HTTPError as e:
        e.close()
        if e.code in (401, 403, 404, 410):
            raise ErroImportacao("Esse link não existe mais ou não está público. Gere de novo o link com "
                                 "\"Qualquer pessoa com o link\" e cole aqui.") from e
        return f"o {('Drive' if google else 'Dropbox')} respondeu {e.code}; o motor tenta de novo"
    except Exception as e:  # noqa: BLE001 - rede: não bloqueia, o worker tenta de novo
        return f"sem resposta do link agora ({type(e).__name__}); o motor tenta de novo"
    if re.search(r'action="https://drive\.usercontent\.google\.com/download', html):
        return None                                             # aviso "arquivo grande, sem antivírus": o baixador confirma
    if _pagina_de_login(html):
        raise ErroImportacao(MSG_LOGIN_DRIVE if google else MSG_LOGIN_DROPBOX)
    if re.search(r"<title[^>]*>[^<]*(invalid link|link inválido|not found|não encontrad)", html, re.I):
        raise ErroImportacao("Esse link não existe mais (foi apagado ou copiado pela metade). Copie o link de novo e cole aqui.")
    if tipo == "pasta_zip":
        raise ErroImportacao("O Dropbox não entregou essa pasta em zip (pasta grande demais ou com milhares de arquivos). "
                             "Cole o link de cada vídeo, ou de uma pasta menor só com os vídeos do projeto.")
    raise ErroImportacao("O link abriu uma página em vez do arquivo. Confira se ele é de um vídeo ou de uma pasta e se está "
                         "como \"Qualquer pessoa com o link\".")


def _fechar(parte: Path, destino: Path, cd, url) -> tuple[Path, str, int]:
    parte.replace(destino)
    return destino, _nome_de(cd, url), destino.stat().st_size


def eh_zip(caminho: Path, nome: str) -> bool:
    return nome.lower().endswith(".zip") or zipfile.is_zipfile(caminho)


def videos_do_zip(caminho: Path, pasta: Path, max_bytes: int = 60 << 30) -> list[tuple[Path, str]]:
    """Extrai só mídia (sem caminhos do zip: evita zip-slip), com teto de bytes conferido no cabeçalho E na
    extração (zip-bomba) e espaço em disco checado antes. Devolve [(arquivo, nome_original)] em ordem de nome."""
    out = []
    with zipfile.ZipFile(caminho) as z:
        itens = [i for i in sorted(z.infolist(), key=lambda i: i.filename)
                 if not i.is_dir() and not Path(i.filename).name.startswith(".") and Path(i.filename).suffix.lower() in EXT_MIDIA]
        total = sum(i.file_size for i in itens)
        if total > max_bytes:
            raise ErroImportacao(f"A pasta tem {total / 2**30:.1f} GB de vídeo, acima do limite.")
        _checar_disco(pasta, total)
        escrito = 0
        for info in itens:
            nome = Path(info.filename).name
            dest = pasta / f"z{len(out):03d}{Path(nome).suffix.lower()}"
            with z.open(info) as src, open(dest, "wb") as f:
                for bloco in iter(lambda: src.read(1 << 20), b""):
                    escrito += len(bloco)
                    if escrito > max_bytes:
                        raise ErroImportacao("A pasta descompactada passou do limite de tamanho.")
                    f.write(bloco)
            out.append((dest, nome))
    return out


def _checar_disco(pasta: Path, nbytes: int, folga: int = 512 << 20) -> None:
    livre = shutil.disk_usage(pasta).free
    if nbytes + folga > livre:
        raise ErroImportacao(f"Sem espaço no motor para {nbytes / 2**30:.1f} GB (livre: {livre / 2**30:.1f} GB).")


# ---------------- registro de arquivos (usado pela API e pela importação) ----------------
def registrar_arquivo(con, projeto: str, nome: str, chave: str | None, nbytes: int, *, entrada: dict | None = None,
                      ext: str = "") -> tuple[str, bool]:
    """Cria (ou reencontra, pela chave) o arquivo e enfileira o ingest. Devolve (id, novo)."""
    con.execute("BEGIN IMMEDIATE")          # checagem de duplicata e alocação do id na mesma transação
    try:
        if chave:
            r = con.execute("SELECT id FROM arquivos WHERE projeto=? AND chave=?", (projeto, chave)).fetchone()
            if r:
                con.execute("COMMIT")
                return r["id"], False
        n = con.execute("SELECT COUNT(*) n FROM arquivos WHERE projeto=?", (projeto,)).fetchone()["n"]
        aid = f"a{n + 1:03d}"
        while con.execute("SELECT 1 FROM arquivos WHERE projeto=? AND id=?", (projeto, aid)).fetchone():
            n += 1
            aid = f"a{n + 1:03d}"
        chave = chave or f"entrada/{projeto}/{aid}{ext}"
        con.execute("INSERT INTO arquivos (id, projeto, nome, chave, bytes, estado, criado) VALUES (?,?,?,?,?,?,?)",
                    (aid, projeto, nome, chave, int(nbytes), "recebido", banco.agora_iso()))
        con.execute("COMMIT")
    except Exception:
        con.execute("ROLLBACK")
        raise
    banco.emitir(con, projeto, "arquivo_recebido", alvo=aid, mensagem=f"Recebido: {nome}",
                 dados={"chave": chave, "bytes": int(nbytes), **({"importacao": True} if entrada else {})})
    banco.enfileirar(con, "ingest", projeto, aid, entrada=entrada or {}, prioridade=5)
    return aid, True

