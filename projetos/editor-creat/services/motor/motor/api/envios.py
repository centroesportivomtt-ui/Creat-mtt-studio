"""Envio direto do navegador ao R2 (fase 2): multipart pré-assinado, retomável.

O site (Vercel) não guarda arquivo: o navegador pede ao motor as URLs assinadas e manda cada parte direto ao R2.
O motor só cria o envio, assina as partes, lista o que já chegou (retomar) e conclui; no fim registra o arquivo
como o tus fazia (mesma chave entrada/<projeto>/<nome>-<id>.<ext>). Só funciona com EDITOR_ARMAZENAMENTO=r2;
no modo local o site continua no tus.

Fluxo: POST /projetos/{pid}/envios → POST .../{envio}/partes (lotes de URLs) → PUT direto no R2 (o navegador lê o
ETag) → POST .../{envio}/concluir. Retomar: GET .../{envio}?chave=... devolve as partes que já estão no R2.
"""
from __future__ import annotations

import math
import re
import unicodedata
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from motor.api import projetos as P
from motor.provedores.armazenamento_local import ChaveInvalida, validar_chave

rotas = APIRouter(tags=["envios"])

EXTENSOES = {
    "mp4", "mov", "m4v", "mkv", "webm", "avi", "mts", "m2ts", "3gp", "hevc",
    "wav", "mp3", "m4a", "aac", "flac", "ogg", "opus",
    "jpg", "jpeg", "png", "heic", "webp", "svg", "pdf", "zip",
}
MIN_PARTE = 5 * 1024 * 1024          # mínimo do S3/R2 (menos a última parte)
MAX_PARTES = 10_000                  # máximo do S3/R2
MAX_LOTE = 100                       # URLs assinadas por pedido
LIMITE_BYTES = 200 * 1024 ** 3       # 200 GB por arquivo: muito acima de qualquer bruto; barra erro de digitação


def slug(nome: str) -> str:
    s = unicodedata.normalize("NFD", nome)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60]
    return s or "arquivo"


def extensao(nome: str) -> str | None:
    m = re.search(r"\.([A-Za-z0-9]{1,5})$", nome.strip())
    ext = m.group(1).lower() if m else None
    return ext if ext in EXTENSOES else None


def chave_final(pid: str, nome: str, ident: str) -> str:
    ext = extensao(nome) or "bin"
    base = slug(re.sub(r"\.[A-Za-z0-9]{1,5}$", "", nome))
    return f"entrada/{pid}/{base}-{ident[:8]}.{ext}"


def tamanho_da_parte(total: int, desejado_mb: int) -> int:
    """Parte fixa (todas iguais menos a última), dentro de 5 MB..5 GB e no máximo 10 mil partes."""
    parte = max(MIN_PARTE, int(desejado_mb) * 1024 * 1024)
    if math.ceil(max(total, 1) / parte) > MAX_PARTES:
        parte = math.ceil(total / MAX_PARTES)
    return min(parte, 5 * 1024 ** 3)


class NovoEnvio(BaseModel):
    nome: str = Field(min_length=1, max_length=255)
    bytes: int = Field(gt=0, le=LIMITE_BYTES)


class PedidoPartes(BaseModel):
    chave: str = Field(min_length=1, max_length=512)
    partes: list[int] = Field(min_length=1, max_length=MAX_LOTE)


class Parte(BaseModel):
    parte: int = Field(ge=1, le=MAX_PARTES)
    etag: str = Field(min_length=1, max_length=200)


class Conclusao(BaseModel):
    chave: str = Field(min_length=1, max_length=512)
    nome: str = Field(min_length=1, max_length=255)
    bytes: int = Field(gt=0, le=LIMITE_BYTES)
    partes: list[Parte] = Field(min_length=1, max_length=MAX_PARTES)


def _r2():
    cfg, arm = P._config()
    if arm is None or getattr(arm, "nome", "") != "r2":
        raise HTTPException(409, "envio direto só existe com o armazenamento R2; neste modo o site usa o envio tus")
    return cfg, arm


def _aberto(pid: str) -> None:
    with P._con() as con:
        p = P._projeto(con, pid)
        if p["estado"] not in P.ESTADOS_ABERTOS:
            raise HTTPException(409, "o projeto já está em direção/montagem; crie uma nova versão para mandar material novo")


def _chave_do_projeto(pid: str, chave: str) -> str:
    try:
        validar_chave(chave)
    except ChaveInvalida as e:
        raise HTTPException(422, str(e)) from e
    if not chave.startswith(f"entrada/{pid}/"):
        raise HTTPException(422, f"a chave precisa começar com entrada/{pid}/")
    return chave


def _envio_id(envio: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9._~\-]{8,1024}", envio):
        raise HTTPException(422, "identificador de envio inválido")
    return envio


@rotas.post("/projetos/{pid}/envios", status_code=201)
def iniciar(pid: str, corpo: NovoEnvio):
    cfg, arm = _r2()
    _aberto(pid)
    if extensao(corpo.nome) is None:
        raise HTTPException(422, "formato não aceito; mande vídeo, áudio, imagem, PDF ou ZIP")
    chave = chave_final(pid, corpo.nome, uuid.uuid4().hex)
    parte = tamanho_da_parte(corpo.bytes, cfg_parte_mb())
    envio = arm.iniciar_multipart(chave)
    return {"envio": envio, "chave": chave, "parte_bytes": parte, "partes": math.ceil(corpo.bytes / parte)}


def cfg_parte_mb() -> int:
    import os
    try:
        return max(5, min(512, int(os.environ.get("EDITOR_ENVIO_PARTE_MB", "64") or 64)))
    except ValueError:
        return 64


@rotas.post("/projetos/{pid}/envios/{envio}/partes")
def assinar_partes(pid: str, envio: str, corpo: PedidoPartes):
    _, arm = _r2()
    chave, envio = _chave_do_projeto(pid, corpo.chave), _envio_id(envio)
    if any(n < 1 or n > MAX_PARTES for n in corpo.partes):
        raise HTTPException(422, f"número de parte fora de 1..{MAX_PARTES}")
    return {"urls": {str(n): arm.url_parte(chave, envio, n) for n in sorted(set(corpo.partes))}}


@rotas.get("/projetos/{pid}/envios/{envio}")
def ver_envio(pid: str, envio: str, chave: str):
    _, arm = _r2()
    chave, envio = _chave_do_projeto(pid, chave), _envio_id(envio)
    try:
        partes = arm.partes_multipart(chave, envio)
    except Exception as e:  # noqa: BLE001  (NoSuchUpload: já concluído, abortado ou expirado)
        if "NoSuchUpload" in str(e) or "404" in str(e):
            raise HTTPException(404, "esse envio não existe mais; comece de novo") from e
        raise
    return {"chave": chave, "partes": partes}


@rotas.post("/projetos/{pid}/envios/{envio}/concluir", status_code=201)
def concluir(pid: str, envio: str, corpo: Conclusao):
    _, arm = _r2()
    chave, envio = _chave_do_projeto(pid, corpo.chave), _envio_id(envio)
    numeros = [p.parte for p in corpo.partes]
    if len(set(numeros)) != len(numeros) or sorted(numeros) != list(range(1, len(numeros) + 1)):
        raise HTTPException(422, "partes faltando ou repetidas")
    _aberto(pid)
    try:
        arm.concluir_multipart(chave, envio, [p.model_dump() for p in corpo.partes])
    except Exception as e:  # noqa: BLE001
        # repetição de um "concluir" que já deu certo (a resposta se perdeu): o R2 já montou o arquivo
        if "NoSuchUpload" not in str(e) or not arm.existe(chave) or arm.tamanho(chave) != corpo.bytes:
            if "NoSuchUpload" in str(e):
                raise HTTPException(404, "esse envio não existe mais; comece de novo") from e
            raise
    return P.registrar_arquivo(pid, P.NovoArquivo(chave=chave, nome=corpo.nome, bytes=corpo.bytes))


@rotas.delete("/projetos/{pid}/envios/{envio}", status_code=204)
def cancelar(pid: str, envio: str, chave: str):
    _, arm = _r2()
    chave, envio = _chave_do_projeto(pid, chave), _envio_id(envio)
    try:
        arm.abortar_multipart(chave, envio)
    except Exception as e:  # noqa: BLE001
        if "NoSuchUpload" not in str(e):
            raise
