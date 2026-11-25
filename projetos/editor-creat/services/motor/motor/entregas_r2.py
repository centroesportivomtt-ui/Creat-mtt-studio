"""Filme aprovado vai para a página de entregas da creat.MTT no Cloudflare R2 (depósito creat-entregas), a MESMA página que o
script da creat-nuvem (`projetos/creat-nuvem/scripts/r2/r2_enviar.py`) alimenta. Pedido do dono, 25/11.

Por que um módulo e não o script: a imagem do Railway só leva `projetos/editor-creat`. As funções de nome e o formato do índice
abaixo são CÓPIA LITERAL do script (o teste `test_entregas_r2_contrato.py` compara os dois). O motor nunca sobe `painel.html`:
a página é do script; o motor só põe o vídeo, a capa, a legenda (META) e refaz o índice no mesmo formato.

Ligado só com as variáveis R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENTREGAS_BUCKET e R2_ENTREGAS_PUBLICO.
Sem elas, nada muda (aprovar responde igual, nenhuma tarefa nova).
"""
from __future__ import annotations

import datetime
import json
import mimetypes
import os
import re
import time
import unicodedata
import urllib.request

# ---------------------------------------------------------------- cópia literal do r2_enviar.py
PAINEL = "entregas.html"
INDICE = "_painel/e160f58517f4.json"
META = "_painel/e160f58517f4-meta.json"
FUSO = datetime.timezone(datetime.timedelta(hours=-3))


def sem_acento(t):
    return unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode()


def slug(t):
    return re.sub(r"[^a-z0-9]+", "-", sem_acento(t).lower()).strip("-")


def nome_arquivo(caminho):
    base, ext = os.path.splitext(os.path.basename(caminho))
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", sem_acento(base)).strip("_")
    return base + ext.lower()


def raiz_versao(nome):
    base, ext = os.path.splitext(nome)
    return re.sub(r"[-_.]?v\d+$", "", base, flags=re.I).lower() + ext.lower()
# ---------------------------------------------------------------- fim da cópia


def itens_do_indice(objetos) -> list[dict]:
    """Mesmo filtro do `atualizar_painel` do script: pula chave que começa com "_", o painel e chave com menos de 2 "/"."""
    itens = []
    for o in objetos:
        k = o["Key"]
        if k.startswith("_") or k == PAINEL or k.count("/") < 2:
            continue
        itens.append({"k": k, "t": o["Size"]})
    return itens


def montar_indice(itens: list[dict], agora: datetime.datetime | None = None) -> dict:
    return {"atualizado": (agora or datetime.datetime.now(FUSO)).astimezone(FUSO).strftime("%d/%m/%Y %H:%M"), "itens": itens}


def corpo_indice(indice: dict) -> bytes:
    return json.dumps(indice, ensure_ascii=False).encode()


# ---------------------------------------------------------------- configuração
CLIENTES_FIXOS = ("super-kal", "creat-mtt", "marcos")
CLIENTE_PADRAO = "creat-mtt"
CLIENTES = {"super-kal": r"super\s*-?\s*kal"}          # adivinhação pelo nome do projeto e pelo texto do pedido
RE_CLIENTE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")   # slug de verdade: nunca vazio nem "-"
REPETIR_S = 15 * 60
DESISTIR_S = 7 * 24 * 3600


def bucket() -> str:
    return os.environ.get("R2_ENTREGAS_BUCKET", "").strip()


def publico() -> str:
    return os.environ.get("R2_ENTREGAS_PUBLICO", "").strip().rstrip("/")


def depositos_privados() -> set[str]:
    """Depósitos que guardam coisa que NUNCA pode ir para a página pública (backup do banco, material bruto)."""
    return {os.environ.get(n, "").strip() for n in ("R2_BACKUP_BUCKET", "R2_BUCKET", "R2_MIDIA_BUCKET")} - {""}


def config_errada() -> str | None:
    """Erro de configuração que desliga as entregas (com a frase para a saúde/Caderno)."""
    if bucket() and bucket() in depositos_privados():
        return ("o depósito das entregas é o mesmo do backup ou do material; a página é pública, então as entregas ficam "
                "desligadas até R2_ENTREGAS_BUCKET apontar para o creat-entregas")
    return None


def ligado() -> bool:
    return all(os.environ.get(n, "").strip() for n in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")) \
        and bool(bucket()) and publico().startswith("https://") and os.environ.get("EDITOR_ENTREGAS", "1").strip() != "0" \
        and config_errada() is None


def cliente_s3():
    from motor.backup import _r2_cliente
    return _r2_cliente()


def nome_cliente(c: str) -> str:
    """Como a página mostra o cliente (mesma regra do painel.html: hífen vira espaço e cada palavra em maiúscula)."""
    return re.sub(r"\b\w", lambda m: m.group(0).upper(), c.replace("-", " "))


def adivinhar_cliente(*textos) -> str:
    alvo = " ".join(t for t in textos if t)
    for c, rx in CLIENTES.items():
        if re.search(rx, sem_acento(alvo), re.I):
            return c
    return CLIENTE_PADRAO


def escolher_cliente(do_site: str | None, pedido: dict | None, nome_projeto: str) -> str:
    """Ordem: o que o dono escolheu no site > pedido.cliente > adivinhação pelo nome e pelo pedido > creat-mtt."""
    for c in (do_site, (pedido or {}).get("cliente")):
        s = slug(str(c or ""))[:40]
        if s and RE_CLIENTE.match(s):
            return s
    return adivinhar_cliente(nome_projeto, (pedido or {}).get("texto") or "")


def hoje_bahia(agora: float | None = None) -> str:
    return datetime.datetime.fromtimestamp(agora or time.time(), FUSO).strftime("%Y-%m-%d")


def pasta_de(cliente: str, data: str, nome_projeto: str) -> str:
    return f"{slug(cliente)}/{data}-{slug(nome_projeto)[:60].strip('-') or 'projeto'}/"


def chaves_da_versao(pasta: str, nome_projeto: str, versao: str) -> tuple[str, str]:
    """(vídeo, capa). O vN fica no FIM do nome para o `raiz_versao` reconhecer a versão anterior e trocá-la."""
    base = nome_projeto if nome_arquivo(f"{nome_projeto}.x") != ".x" else "Projeto"
    return pasta + nome_arquivo(f"{base}_{versao}.mp4"), pasta + nome_arquivo(f"{base}_capa_{versao}.jpg")


def url_publica(k: str) -> str:
    return f"{publico()}/{urllib.request.quote(k)}"


def url_painel(cliente: str) -> str:
    return f"{publico()}/{PAINEL}?c={cliente}"


# ---------------------------------------------------------------- operações no depósito
def _lista(s3, b: str, prefixo: str = "") -> list[dict]:
    out, tok = [], None
    while True:
        kw = {"Bucket": b, **({"Prefix": prefixo} if prefixo else {}), **({"ContinuationToken": tok} if tok else {})}
        r = s3.list_objects_v2(**kw)
        out.extend(r.get("Contents", []) or [])
        tok = r.get("NextContinuationToken")
        if not tok:
            return out


def _codigo(e: Exception) -> str:
    r = getattr(e, "response", None)
    return str(((r or {}).get("Error") or {}).get("Code", "")) if isinstance(r, dict) else ""


def _nao_existe(e: Exception) -> bool:
    """Só a resposta "não existe" do R2. KeyError, arquivo local sumido etc. NÃO contam (senão o META seria regravado do zero)."""
    return _codigo(e) in ("404", "NoSuchKey", "NotFound")


def _conflito(e: Exception) -> bool:
    return _codigo(e) in ("412", "PreconditionFailed", "409", "ConditionalRequestConflict")


def cabecalho(s3, b: str, k: str) -> dict | None:
    try:
        return s3.head_object(Bucket=b, Key=k)
    except Exception as e:  # noqa: BLE001
        if _nao_existe(e):
            return None
        raise


def subir(s3, b: str, local, k: str, sha: str, projeto: str | None = None) -> tuple[bool, int]:
    """Sobe com o mesmo TransferConfig e os mesmos cabeçalhos do script. Idempotente: se o objeto já está lá com o mesmo
    tamanho e o mesmo sha256 (metadado), não sobe de novo. Devolve (subiu, bytes) e confere o tamanho lá no fim.
    `projeto` vai no metadado: é assim que o editor sabe o que é dele na pasta (nunca apaga o que o chat ou outro projeto pôs)."""
    tam = os.path.getsize(local)
    h = cabecalho(s3, b, k)
    if h and int(h.get("ContentLength", -1)) == tam and (h.get("Metadata") or {}).get("sha256") == sha \
            and (projeto is None or (h.get("Metadata") or {}).get("projeto") == projeto):
        return False, tam
    from boto3.s3.transfer import TransferConfig
    cfg = TransferConfig(multipart_threshold=64 * 1024 * 1024, multipart_chunksize=32 * 1024 * 1024)
    tipo = mimetypes.guess_type(k)[0] or "application/octet-stream"
    s3.upload_file(str(local), b, k, Config=cfg,
                   ExtraArgs={"ContentType": tipo, "ContentDisposition": f'attachment; filename="{os.path.basename(k)}"',
                              "Metadata": {"sha256": sha, **({"projeto": projeto} if projeto else {})}})
    h = cabecalho(s3, b, k)
    remoto = int((h or {}).get("ContentLength", -1))
    if remoto != tam:
        raise IOError(f"o R2 guardou {remoto} bytes de {os.path.basename(k)}, esperado {tam}")
    return True, tam


def dono_do_objeto(s3, b: str, k: str) -> str | None:
    """Projeto do editor que pôs o objeto (metadado `projeto`); None = foi o chat (r2_enviar.py) ou não existe."""
    h = cabecalho(s3, b, k)
    return ((h or {}).get("Metadata") or {}).get("projeto")


def pasta_de_outro(s3, b: str, pasta: str, projeto: str) -> bool:
    """A pasta já tem arquivo que não é deste projeto (outro projeto com o mesmo nome no mesmo dia, ou entrega do chat)."""
    return any(dono_do_objeto(s3, b, o["Key"]) != projeto for o in _lista(s3, b, pasta))


def apagar_versoes_anteriores(s3, b: str, pasta: str, k: str, projeto: str) -> list[str]:
    """Como o script (mesma pasta, mesma raiz do nome sem o vN, não é o novo), mas SÓ o que este projeto pôs: arquivo do chat
    ou de outro projeto com o mesmo nome nunca é apagado pelo editor."""
    raiz = raiz_versao(os.path.basename(k))
    fora = []
    for o in _lista(s3, b, pasta):
        if o["Key"] != k and raiz_versao(os.path.basename(o["Key"])) == raiz and dono_do_objeto(s3, b, o["Key"]) == projeto:
            s3.delete_object(Bucket=b, Key=o["Key"])
            fora.append(o["Key"])
    return fora


def ler_meta(s3, b: str) -> tuple[dict, str | None]:
    """(META das legendas, ETag). Só "não existe" vira ({}, None): qualquer outro erro sobe (senão gravaria por cima das
    legendas dos outros)."""
    try:
        r = s3.get_object(Bucket=b, Key=META)
        return json.loads(r["Body"].read() or b"{}"), r.get("ETag")
    except Exception as e:  # noqa: BLE001
        if _nao_existe(e):
            return {}, None
        raise


def gravar_meta(s3, b: str, meta: dict, etag: str | None = None, *, novo: bool = False) -> None:
    """Escrita condicional (o R2 aceita, testado em 25/11): só grava se o META ainda é o que foi lido (IfMatch) ou, se não
    existia, se continua não existindo (IfNoneMatch). Uma legenda gravada pelo chat no meio do caminho não se perde."""
    cond = {"IfMatch": etag} if etag else ({"IfNoneMatch": "*"} if novo else {})
    s3.put_object(Bucket=b, Key=META, Body=json.dumps(meta, ensure_ascii=False).encode(),
                  ContentType="application/json; charset=utf-8", CacheControl="no-store", **cond)


def mexer_legenda(s3, b: str, pasta: str, legenda: str | None, anterior_do_editor: str | None) -> str | None:
    """Grava a legenda do filme só se a pasta não tem legenda ou se a que está lá foi o editor que pôs (`anterior_do_editor`).
    Legenda registrada pelo chat nunca é sobrescrita. Relê o META logo antes de gravar e só mexe na própria chave.
    `legenda=None` apaga (retirada), também só se for a do editor. Devolve a legenda do editor que ficou lá (ou None)."""
    chave = pasta.rstrip("/")
    for tentativa in range(4):
        meta, etag = ler_meta(s3, b)
        atual = (meta.get(chave) or {}).get("legenda")
        if atual is not None and atual != anterior_do_editor:
            return None                                 # legenda do chat/dono: não mexe
        if legenda is None:
            if atual is None:
                return None
            meta.pop(chave, None)
        else:
            if atual == legenda:
                return legenda
            meta[chave] = {"legenda": legenda}
        try:
            gravar_meta(s3, b, meta, etag, novo=etag is None)
            return legenda
        except Exception as e:  # noqa: BLE001
            if not _conflito(e) or tentativa == 3:
                raise                                   # alguém gravou entre a leitura e a escrita: lê de novo e refaz
    return legenda


def atualizar_indice(s3, b: str, agora: datetime.datetime | None = None) -> int:
    """Refaz o índice da página como `atualizar_painel` do script (lista o depósito inteiro), sem subir o html.

    O script da creat-nuvem também regrava o índice (sem trava). Para o editor nunca deixar o índice sem um arquivo que
    outra escrita pôs no meio do caminho, depois de gravar ele lista de novo e, se o depósito mudou, grava outra vez
    (até 3 passadas). Sobra uma janela só se o script gravar por último com uma lista velha; o envio seguinte corrige."""
    itens = itens_do_indice(_lista(s3, b))
    for _ in range(3):
        s3.put_object(Bucket=b, Key=INDICE, Body=corpo_indice(montar_indice(itens, agora)),
                      ContentType="application/json; charset=utf-8", CacheControl="no-store")
        de_novo = itens_do_indice(_lista(s3, b))
        if de_novo == itens:
            break
        itens = de_novo
    return len(itens)


def conferir_publico(url: str, tamanho: int, timeout: float = 30) -> tuple[bool, int | None]:
    """HEAD no endereço público, como o script: 200 e Content-Length igual ao tamanho. Devolve (ok, status)."""
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, method="HEAD", headers={"User-Agent": "curl/8"}), timeout=timeout)
        return r.status == 200 and int(r.headers.get("Content-Length", -1)) == tamanho, r.status
    except Exception as e:  # noqa: BLE001
        return False, getattr(e, "code", None)


def clientes_do_indice(timeout: float = 5) -> list[str]:
    """Slugs de cliente que já têm entrega na página (lidos do índice público). Sem rede: lista vazia."""
    if not publico():
        return []
    try:
        with urllib.request.urlopen(urllib.request.Request(f"{publico()}/{INDICE}", headers={"User-Agent": "editor-creat-motor/0.1"}),
                                    timeout=timeout) as r:
            d = json.loads(r.read(4 << 20))
        return sorted({it["k"].split("/", 1)[0] for it in d.get("itens", []) if isinstance(it, dict) and "/" in str(it.get("k", ""))})
    except Exception:  # noqa: BLE001
        return []


# ---------------------------------------------------------------- frases para o dono (sem jargão, sem nome de exceção)
def motivo_dono(e: Exception) -> str:
    """O que aparece no cartão "Nas entregas". O detalhe técnico fica só em `motivo_tecnico` (diário/servidor)."""
    cod, nome = _codigo(e), type(e).__name__
    if cod in ("AccessDenied", "403", "InvalidAccessKeyId", "SignatureDoesNotMatch", "Unauthorized", "401"):
        return "o Cloudflare recusou a chave do editor (permissão). O filme continua guardado aqui"
    if cod in ("NoSuchBucket",):
        return "a página de entregas não foi achada no Cloudflare. O filme continua guardado aqui"
    if cod in ("SlowDown", "503", "500", "InternalError", "ServiceUnavailable") or nome in (
            "ConnectionError", "EndpointConnectionError", "ConnectTimeoutError", "ReadTimeoutError", "TimeoutError", "URLError",
            "timeout", "ConnectionClosedError", "SSLError", "ProxyConnectionError", "socket.timeout", "OSError", "IOError"):
        return "sem conexão com o Cloudflare agora. O filme continua guardado aqui"
    return "o Cloudflare não respondeu direito agora. O filme continua guardado aqui"


def motivo_tecnico(e: Exception) -> str:
    from motor.backup import sem_segredo
    return sem_segredo(f"{type(e).__name__}: {str(e)[:180]}")


# ---------------------------------------------------------------- fila (re-tentativa sozinha)
def reenfileirar_pendentes(con, agora: float | None = None) -> int:
    """Laço do worker (a cada 15 min): versão 'pendente' cuja hora chegou volta para a fila (o banco.enfileirar rearma a
    tarefa terminada). Pendente há mais de 7 dias vira 'falhou' com o motivo.

    Retirada que falhou por rede ('retirando' com hora marcada) também volta para a fila, e esta NUNCA desiste: filme
    reprovado não pode ficar público calado. Depois de 7 dias o cartão passa a dizer que ainda não saiu."""
    from motor import banco
    if not ligado():
        return 0
    agora = agora or time.time()
    n = 0
    for r in con.execute("SELECT id, dados FROM projetos").fetchall():
        try:
            ent = (json.loads(r["dados"] or "{}").get("entregas") or {})
        except ValueError:
            continue
        for v, e in ent.items():
            if not isinstance(e, dict) or e.get("estado") not in ("pendente", "retirando"):
                continue
            retirar = e.get("estado") == "retirando"
            if retirar and not e.get("proxima_ts"):
                continue                                  # retirada na fila agora (ainda não falhou): a tarefa já existe
            if not retirar and agora - float(e.get("pendente_desde") or agora) > DESISTIR_S:
                def desistir(d, v=v):
                    x = d.get("entregas", {}).get(v)
                    if x and x.get("estado") == "pendente":
                        x.update(estado="falhou", motivo="não consegui falar com o Cloudflare por 7 dias. O filme continua "
                                 "guardado aqui; toque em Tentar de novo", proxima=None, proxima_ts=None)
                banco.atualizar_dados(con, r["id"], desistir)
                continue
            if float(e.get("proxima_ts") or 0) <= agora:
                banco.enfileirar(con, "entregas", r["id"], v, entrada={"acao": "retirar" if retirar else (e.get("acao") or "enviar")},
                                 prioridade=6)
                n += 1
    return n


def estado_saude(cfg, provar: bool = False, s3=None) -> dict:
    """Para a saúde: ligado, último envio bom e (com provar=True) um list_objects_v2 MaxKeys=1 que prova a permissão."""
    import pathlib
    out: dict = {"ligado": ligado()}
    if config_errada():
        out["aviso"] = config_errada()
    try:
        e = json.loads((pathlib.Path(cfg.dados) / "entregas_estado.json").read_text(encoding="utf-8"))
        if e.get("ultimo_ok"):
            out["ultimo_ok"] = e["ultimo_ok"]
    except (OSError, ValueError):
        pass
    if provar and out["ligado"]:
        try:
            (s3 or cliente_s3()).list_objects_v2(Bucket=bucket(), MaxKeys=1)
            out["permissao"] = "ok"
        except Exception as ex:  # noqa: BLE001 - sem chave nem endereço na resposta
            out["permissao"] = f"erro: {type(ex).__name__}"
    return out


def marcar_ok(cfg) -> None:
    import pathlib
    p = pathlib.Path(cfg.dados) / "entregas_estado.json"
    tmp = p.with_name(p.name + f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps({"ultimo_ok": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}), encoding="utf-8")
    os.replace(tmp, p)
