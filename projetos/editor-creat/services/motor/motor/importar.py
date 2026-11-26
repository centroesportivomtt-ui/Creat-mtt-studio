"""Importação por link compartilhado (Dropbox ou Google Drive) SEM chave do dono, e registro de arquivos.

- Dropbox: arquivo (`/s/`, `/scl/fi/`) vira download direto com `dl=1`; pasta (`/scl/fo/`, `/sh/`) baixa como .zip
  e os vídeos de dentro viram arquivos do projeto.
- Drive: arquivo (`/file/d/<id>`, `open?id=`, `uc?id=`) vira `drive.usercontent.google.com/download?...&confirm=t`.
  Pasta do Drive ("Qualquer pessoa com o link", leitor ou editor) é lida pela página `embeddedfolderview` (sem chave, sem
  login): cada vídeo de dentro vira um arquivo do projeto, com download próprio e retomável (25/11, pedido do dono).
- Segurança: só https e só hosts dessas duas empresas, conferidos também em cada redirecionamento (sem SSRF).
- Retomável: o download vai para `<destino>.part` e continua com `Range` depois de um reinício.
"""
from __future__ import annotations

import html as _html
import json
import re
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from motor import banco

HOSTS = ("dropbox.com", "dropboxusercontent.com", "drive.google.com", "docs.google.com",
         "drive.usercontent.google.com", "googleusercontent.com")
# googleusercontent.com inteiro cobre também nomes de VM do Google Cloud (*.bc.googleusercontent.com). Dele, só o que o
# download do Drive usa: drive.usercontent.google.com (acima) e os servidores de arquivo doc-XX-XX-docs.googleusercontent.com.
_GUC_OK = re.compile(r"^doc-[a-z0-9-]+-docs\.googleusercontent\.com$")
EXT_VIDEO = {".mov", ".mp4", ".m4v", ".mkv", ".webm", ".avi", ".mts", ".m2ts", ".3gp", ".hevc"}
EXT_AUDIO = {".m4a", ".mp3", ".wav", ".aac", ".flac", ".ogg", ".opus"}
EXT_MIDIA = EXT_VIDEO | EXT_AUDIO
AGENTE = "editor-creat-motor/0.1"
MAX_BYTES = 60 << 30            # teto de um link (arquivo, zip ou pasta do Drive somada)
# Pasta do Drive: a página embeddedfolderview devolve a lista inteira numa página só, mas para em ~5.500 itens SEM avisar
# (medido em 25/11). Os tetos ficam bem abaixo disso para a lista nunca vir cortada calada.
MAX_ITENS_PASTA = 300           # entradas lidas no total (pasta + subpastas)
MAX_MIDIAS_PASTA = 100          # vídeos e áudios importados de uma pasta
MAX_SUBPASTAS = 20
PROFUNDIDADE_PASTA = 2          # pasta > sub > sub-sub
DRIVE = "https://drive.google.com"
DRIVE_DL = "https://drive.usercontent.google.com"
_ID_DRIVE = re.compile(r"[A-Za-z0-9_-]{10,}")


class ErroImportacao(Exception):
    """Mensagem já em pt-BR, pronta para a tela."""


def host_permitido(host: str, hosts=HOSTS) -> bool:
    host = (host or "").lower().rstrip(".")
    if host.endswith(".googleusercontent.com") and "googleusercontent.com" in hosts and not _GUC_OK.match(host):
        return any(host == h or host.endswith("." + h) for h in hosts if h != "googleusercontent.com")
    return any(host == h or host.endswith("." + h) for h in hosts)


def link_direto(url: str, hosts=HOSTS) -> tuple[str, str]:
    """Devolve (url_de_download, tipo) com tipo em {'arquivo', 'pasta_zip', 'pasta_drive'}.
    Na pasta do Drive a url é a da lista (embeddedfolderview), lida por `listar_pasta_drive`."""
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
        rk = (q.get("resourcekey") or [""])[0]
        rk = rk if re.fullmatch(r"[A-Za-z0-9_-]{1,100}", rk or "") else ""
        pasta = re.search(r"/folders/([^/?#]+)", caminho)
        if pasta or caminho.rstrip("/") in ("/folderview", "/embeddedfolderview"):
            fid = pasta.group(1) if pasta else (q.get("id") or [""])[0]
            if not _ID_DRIVE.fullmatch(fid or ""):
                raise ErroImportacao("Não achei o id da pasta no link do Drive. Copie o link de novo (Compartilhar > Copiar link) e cole aqui.")
            return f"{DRIVE}/embeddedfolderview?id={fid}" + (f"&resourcekey={rk}" if rk else ""), "pasta_drive"
        m = re.search(r"/file/d/([A-Za-z0-9_-]{10,})", caminho)
        fid = m.group(1) if m else (q.get("id") or [""])[0]
        if not _ID_DRIVE.fullmatch(fid or ""):
            raise ErroImportacao("Não achei o id do arquivo no link do Drive.")
        return f"{DRIVE_DL}/download?id={fid}&export=download&confirm=t" + (f"&resourcekey={rk}" if rk else ""), "arquivo"
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


def baixar(url: str, destino: Path, *, hosts=HOSTS, max_bytes: int = MAX_BYTES, progresso=None, timeout: float = 60) -> tuple[Path, str, int]:
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
                if _pagina_de_cota(html):
                    raise ErroImportacao(MSG_COTA_DRIVE)
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


MSG_LOGIN_DRIVE_PASTA = ("Essa pasta do Google Drive está restrita. No Drive: toque nos 3 pontinhos da pasta > Compartilhar > Acesso "
                         "geral: \"Qualquer pessoa com o link\" (pode deixar como Leitor) > Copiar link, e cole aqui de novo.")
MSG_PASTA_NAO_EXISTE = ("Essa pasta do Drive não existe mais (foi apagada ou o link veio pela metade). Copie o link de novo e "
                        "cole aqui.")
MSG_PASTA_SEM_MIDIA = "A pasta do Drive não tem vídeo nem áudio. Confira se colou a pasta certa."
MSG_PASTA_ILEGIVEL = ("Não consegui ler a lista dessa pasta do Drive agora. Cole o link de cada vídeo (Compartilhar > Copiar "
                      "link), ou mande a pasta pelo Dropbox.")
MSG_COTA_DRIVE = ("O Google travou o download deste vídeo por algumas horas (foi baixado muitas vezes). Saída rápida: no Drive, "
                  "3 pontinhos do vídeo > Fazer uma cópia, compartilhe a cópia e cole o link dela aqui.")


def msg_pasta_ja_importada(n: int) -> str:
    return f"Essa pasta já está no projeto ({n} vídeo{'s' if n != 1 else ''}). Não tem vídeo novo nela."


def msg_acima_do_teto(maximo: int, o_que: str = "itens") -> str:
    return f"A pasta tem mais de {maximo} {o_que}. Crie uma pasta só com os vídeos deste projeto e cole o link dela."


def _pagina_de_cota(html: str) -> bool:
    """Página do Google 'cota de download excedida' (texto que o gdown detecta; não reproduzido aqui)."""
    return bool(re.search(r"Too many users have viewed or downloaded this file recently", html, re.I)
                or re.search(r"<title[^>]*>[^<]*(quota exceeded|cota excedida|cota de download)", html, re.I))


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
    if tipo == "pasta_drive":
        return sondar_pasta(direto, hosts=hosts, timeout=timeout)[1]
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
        return f"o {('Drive' if google else 'Dropbox')} está instável agora; tento de novo sozinho"
    except Exception as e:  # noqa: BLE001 - rede: não bloqueia, o worker tenta de novo
        return "sem resposta do link agora; tento de novo sozinho"
    if re.search(r'action="https://drive\.usercontent\.google\.com/download', html):
        return None                                             # aviso "arquivo grande, sem antivírus": o baixador confirma
    if google and _pagina_de_cota(html):
        raise ErroImportacao(MSG_COTA_DRIVE)
    if _pagina_de_login(html):
        raise ErroImportacao(MSG_LOGIN_DRIVE if google else MSG_LOGIN_DROPBOX)
    if re.search(r"<title[^>]*>[^<]*(invalid link|link inválido|not found|não encontrad)", html, re.I):
        raise ErroImportacao("Esse link não existe mais (foi apagado ou copiado pela metade). Copie o link de novo e cole aqui.")
    if tipo == "pasta_zip":
        raise ErroImportacao("O Dropbox não entregou essa pasta em zip (pasta grande demais ou com milhares de arquivos). "
                             "Cole o link de cada vídeo, ou de uma pasta menor só com os vídeos do projeto.")
    raise ErroImportacao("O link abriu uma página em vez do arquivo. Confira se ele é de um vídeo ou de uma pasta e se está "
                         "como \"Qualquer pessoa com o link\".")


# ---------------- pasta do Google Drive (sem chave, sem login) ----------------
_BLOCO = '<div class="flip-entry" id="entry-'


def id_da_pasta(direto: str) -> tuple[str, str | None]:
    """(id, resourcekey) da url devolvida por `link_direto` para pasta do Drive."""
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(direto).query)
    fid = (q.get("id") or [""])[0]
    if not _ID_DRIVE.fullmatch(fid):
        raise ErroImportacao("Não achei o id da pasta no link do Drive.")
    return fid, (q.get("resourcekey") or [None])[0]


def _eh_midia(nome: str, mime: str | None) -> str | None:
    """'video' | 'audio' | None. Decide PELA EXTENSÃO; o MIME do ícone do Drive só vale de reserva (ele mente: .pkl vem
    como application/x-zip)."""
    ext = Path(nome).suffix.lower()
    if ext in EXT_VIDEO:
        return "video"
    if ext in EXT_AUDIO:
        return "audio"
    if re.fullmatch(r"\.[a-z0-9]{1,5}", ext):  # extensão de verdade e que não é mídia: fica de fora mesmo se o ícone disser vídeo
        return None
    m = (mime or "").lower()
    return "video" if m.startswith("video/") else "audio" if m.startswith("audio/") else None


def _ler_pagina_pasta(url: str, hosts, timeout: float, limite: int = 8 << 20) -> str:
    abridor = urllib.request.build_opener(_Redirecionador(hosts))
    try:
        with abridor.open(urllib.request.Request(url, headers={"User-Agent": AGENTE}), timeout=timeout) as resp:
            corpo = resp.read(limite + 1)
    except ErroImportacao as e:
        if str(e) == MSG_LOGIN_DRIVE:             # redirecionou para o login do Google: pasta restrita
            raise ErroImportacao(MSG_LOGIN_DRIVE_PASTA) from e
        raise
    except urllib.error.HTTPError as e:
        e.close()
        if e.code in (401, 403):
            raise ErroImportacao(MSG_LOGIN_DRIVE_PASTA) from e
        if e.code in (404, 410):
            raise ErroImportacao(MSG_PASTA_NAO_EXISTE) from e
        raise                                     # 429/5xx: passageiro, o motor tenta de novo
    if len(corpo) > limite:
        raise ErroImportacao(msg_acima_do_teto(MAX_ITENS_PASTA))
    return corpo.decode("utf-8", "replace")


def ler_entradas_pasta(html: str) -> tuple[str, list[dict]]:
    """Lê a página embeddedfolderview: (nome da pasta, [{id, nome, tipo: pasta|arquivo|outro, mime, resourcekey}]).
    Página 200 sem a estrutura conhecida (o Google mudou o HTML) vira MSG_PASTA_ILEGIVEL, nunca "pasta vazia"."""
    t = re.search(r"<title[^>]*>([^<]*)</title>", html, re.I)
    nome = _html.unescape(t.group(1)).strip() if t else ""
    partes = html.split(_BLOCO)
    if len(partes) == 1:
        if re.search(r'class="flip-entries"\s*>\s*</div>', html):
            return nome, []                       # pasta vazia de verdade (o contêiner existe e não tem nada)
        if _pagina_de_login(html):
            raise ErroImportacao(MSG_LOGIN_DRIVE_PASTA)
        raise ErroImportacao(MSG_PASTA_ILEGIVEL)
    out = []
    for b in partes[1:]:
        mid = re.match(r'([A-Za-z0-9_-]{10,})"', b)
        href = re.search(r'href="([^"]+)"', b)
        if not mid or not href:
            raise ErroImportacao(MSG_PASTA_ILEGIVEL)
        h = _html.unescape(href.group(1))
        tit = re.search(r'class="flip-entry-title"[^>]*>(.*?)</div>', b, re.S)
        mime = re.search(r'/type/([A-Za-z0-9.+-]+/[A-Za-z0-9.+-]+)', b)
        rk = re.search(r"[?&]resourcekey=([A-Za-z0-9_-]{1,100})", h)
        tipo = "pasta" if re.search(r"/folders/", h) else "arquivo" if re.search(r"/file/d/", h) else "outro"
        out.append({"id": mid.group(1), "nome": (_html.unescape(re.sub(r"<[^>]+>", "", tit.group(1))).strip() if tit else "") or mid.group(1),
                    "tipo": tipo, "mime": mime.group(1) if mime else None, "resourcekey": rk.group(1) if rk else None})
    return nome, out


def _nome_seguro(nome: str) -> str:
    return re.sub(r"[\x00-\x1f/\\]+", "_", nome).strip(" .")[:150] or "sem nome"


def listar_pasta_drive(fid: str, *, resourcekey: str | None = None, base: str = None, hosts=HOSTS, timeout: float = 15,
                       profundidade: int = PROFUNDIDADE_PASTA, prazo: float | None = None) -> dict:
    """Lista os vídeos e áudios de uma pasta pública do Drive (e das subpastas, até `profundidade` níveis).

    Devolve {"nome", "itens": [{"id", "nome", "subpasta", "tipo"}], "ignorados", "subpastas", "subpastas_fora"}, itens
    em ordem de (subpasta, nome). Passou do teto (itens lidos, mídias ou subpastas): ErroImportacao com o passo a passo,
    nunca uma lista cortada calada. `prazo` (time.monotonic) limita o tempo total (a rota do celular não pode esperar)."""
    base = (base or DRIVE).rstrip("/")
    lidos = subpastas = fora = ignorados = 0
    itens: list[dict] = []
    nome_raiz = ""
    fila = [(fid, resourcekey, "", 0)]
    while fila:
        if prazo is not None and time.monotonic() > prazo:
            raise TimeoutError("a lista da pasta demorou demais")
        pid_, rk, sub, nivel = fila.pop(0)
        url = f"{base}/embeddedfolderview?id={pid_}" + (f"&resourcekey={rk}" if rk else "")
        try:
            html = _ler_pagina_pasta(url, hosts, timeout)
        except ErroImportacao as e:
            if nivel and str(e) in (MSG_LOGIN_DRIVE_PASTA, MSG_PASTA_NAO_EXISTE):
                fora += 1                         # subpasta restrita dentro de pasta pública: fica de fora, contada
                continue
            raise
        nome, ents = ler_entradas_pasta(html)
        if nivel == 0:
            nome_raiz = nome
        lidos += len(ents)
        if lidos > MAX_ITENS_PASTA:
            raise ErroImportacao(msg_acima_do_teto(MAX_ITENS_PASTA))
        for e in ents:
            if e["nome"].startswith("."):
                ignorados += 1
            elif e["tipo"] == "pasta":
                if nivel + 1 > profundidade:
                    fora += 1
                    continue
                subpastas += 1
                if subpastas > MAX_SUBPASTAS:
                    raise ErroImportacao(msg_acima_do_teto(MAX_SUBPASTAS, "subpastas"))
                fila.append((e["id"], e["resourcekey"], f"{sub}/{_nome_seguro(e['nome'])}".strip("/"), nivel + 1))
            elif e["tipo"] == "arquivo" and _eh_midia(e["nome"], e["mime"]):
                itens.append({"id": e["id"], "nome": _nome_seguro(e["nome"]), "subpasta": sub, "tipo": _eh_midia(e["nome"], e["mime"])})
            else:
                ignorados += 1
    if len(itens) > MAX_MIDIAS_PASTA:
        raise ErroImportacao(msg_acima_do_teto(MAX_MIDIAS_PASTA, "vídeos e áudios"))
    itens.sort(key=lambda i: (i["subpasta"].lower(), i["nome"].lower()))
    return {"nome": nome_raiz, "itens": itens, "ignorados": ignorados, "subpastas": subpastas, "subpastas_fora": fora}


def nome_do_item(item: dict) -> str:
    return f"{item['subpasta']}/{item['nome']}" if item.get("subpasta") else item["nome"]


def url_do_arquivo_drive(fid: str) -> str:
    return f"{DRIVE}/file/d/{fid}/view"


def tamanho_drive(fid: str, *, base_dl: str | None = None, hosts=HOSTS, timeout: float = 15) -> int | None:
    """Tamanho de um arquivo público do Drive sem baixar: `Range: bytes=0-0` devolve 206 com `Content-Range: bytes
    0-0/<total>` (conferido em 25/11 com mp4 de 19 MB e zip de 1,7 GB). None quando não deu para saber (página de cota,
    rede): o download confere o teto de novo."""
    url = f"{(base_dl or DRIVE_DL).rstrip('/')}/download?id={fid}&export=download&confirm=t"
    abridor = urllib.request.build_opener(_Redirecionador(hosts))
    try:
        with abridor.open(urllib.request.Request(url, headers={"User-Agent": AGENTE, "Range": "bytes=0-0"}), timeout=timeout) as resp:
            if "text/html" in resp.headers.get("Content-Type", ""):
                return None
            m = re.search(r"/(\d+)\s*$", resp.headers.get("Content-Range", "") or "")
            if m:
                return int(m.group(1))
            cl = resp.headers.get("Content-Length") or ""
            return int(cl) if resp.status == 200 and cl.isdigit() else None
    except Exception:  # noqa: BLE001 - tamanho é conferência; quem decide é o download
        return None


def tamanhos_drive(ids: list[str], *, paralelo: int = 4, **kw) -> dict[str, int | None]:
    if not ids:
        return {}
    with ThreadPoolExecutor(max_workers=max(1, min(paralelo, len(ids)))) as ex:
        return dict(zip(ids, ex.map(lambda i: tamanho_drive(i, **kw), ids)))


def sondar_pasta(direto: str, *, hosts=HOSTS, timeout: float = 15, prazo_total: float = 20) -> tuple[dict | None, str | None]:
    """Lista a pasta do Drive NA HORA para a rota de importar: (resumo, aviso). Restrita, apagada, ilegível, sem mídia ou
    acima do teto: ErroImportacao (o dono vê o motivo embaixo do botão). Rede lenta ou fora: (None, aviso) e o worker lista."""
    fid, rk = id_da_pasta(direto)
    u = urllib.parse.urlsplit(direto)
    try:
        r = listar_pasta_drive(fid, resourcekey=rk, base=f"{u.scheme}://{u.netloc}", hosts=hosts, timeout=timeout,
                               prazo=time.monotonic() + prazo_total)
    except ErroImportacao:
        raise
    except Exception as e:  # noqa: BLE001 - rede: não bloqueia, o worker tenta de novo
        return None, "sem resposta do Drive agora; leio a pasta e tento de novo sozinho"
    if not r["itens"]:
        raise ErroImportacao(MSG_PASTA_SEM_MIDIA)
    return r, None


def detalhe_pasta(resumo: dict, novos: int, ja: int = 0) -> str:
    """Texto pronto para a tela, embaixo do botão."""
    v = lambda n: f"{n} vídeo{'s' if n != 1 else ''}"            # noqa: E731
    txt = f"Pasta “{resumo.get('nome') or 'do Drive'}”: {v(novos)} na fila" + ("; vão aparecendo aqui conforme baixam." if novos > 1 else ".")
    if ja:
        txt += f" {v(ja)} já estava{'m' if ja != 1 else ''} no projeto."
    k = int(resumo.get("ignorados") or 0)
    if k:
        txt += f" {k} arquivo{'s' if k != 1 else ''} que não {'são' if k != 1 else 'é'} vídeo nem áudio fica{'m' if k != 1 else ''} de fora."
    f = int(resumo.get("subpastas_fora") or 0)
    if f:
        txt += f" {f} subpasta{'s' if f != 1 else ''} restrita{'s' if f != 1 else ''} ou funda{'s' if f != 1 else ''} demais fic{'aram' if f != 1 else 'ou'} de fora."
    return txt


def importados_drive(con, projeto: str) -> dict[str, str]:
    """{id do Drive: id do arquivo no projeto}, só com arquivos que ainda existem (importação que falhou some daqui)."""
    r = con.execute("SELECT dados FROM projetos WHERE id=?", (projeto,)).fetchone()
    mapa = (json.loads(r["dados"] or "{}") if r else {}).get("importados_drive") or {}
    vivos = {x["id"] for x in con.execute("SELECT id FROM arquivos WHERE projeto=?", (projeto,))}
    return {k: v for k, v in mapa.items() if v in vivos}


def marcar_importado_drive(con, projeto: str, drive_id: str, aid: str | None) -> None:
    """Grava (ou tira, com aid=None) o par em projetos.dados.importados_drive, numa transação (outras rotas mexem nos dados)."""
    def mexer(d):
        m = d.setdefault("importados_drive", {})
        if aid:
            m[drive_id] = aid
        else:
            m.pop(drive_id, None)
    banco.atualizar_dados(con, projeto, mexer)


def esquecer_importado_drive(con, projeto: str, aid: str) -> None:
    def mexer(d):
        m = d.get("importados_drive") or {}
        for k in [k for k, v in m.items() if v == aid]:
            m.pop(k)
    banco.atualizar_dados(con, projeto, mexer)


def drive_id_de(url: str) -> str | None:
    """Id do arquivo num link do Drive (para lembrar o que já entrou no projeto)."""
    try:
        direto, tipo = link_direto(url)
    except ErroImportacao:
        return None
    if tipo != "arquivo" or "drive.usercontent.google.com" not in direto:
        return None
    return (urllib.parse.parse_qs(urllib.parse.urlsplit(direto).query).get("id") or [None])[0]


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


MSG_SEM_ESPACO = "Sem espaço no editor"       # começo fixo: a mesa reconhece e diz ao dono que foi o disco, não o vídeo


def _gb(n: int) -> str:
    return f"{n / 2**30:.1f}".replace(".", ",")


def _checar_disco(pasta: Path, nbytes: int, folga: int = 512 << 20) -> None:
    livre = shutil.disk_usage(pasta).free
    if nbytes + folga > livre:
        raise ErroImportacao(f"{MSG_SEM_ESPACO}: o material tem {_gb(nbytes)} GB e o disco só tem {_gb(livre)} GB livres "
                             f"(o editor ainda guarda {_gb(folga)} GB de folga para trabalhar).")


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

