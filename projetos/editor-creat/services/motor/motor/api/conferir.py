"""GET /v1/conferir: o motor confere, por dentro e com as variáveis REAIS do ambiente, se consegue falar com cada
serviço de que depende. SÓ LEITURA: não escreve em tabela de negócio, não cria esquema, não gera nada pago.

  banco     conexão + SELECT 1 + as 5 tabelas existem (SQLite aberto só para leitura; Postgres em transação read-only)
  r2        HeadBucket + CORS do bucket (PUT permitido? ExposeHeaders tem ETag?); com ?escrita=1, grava e apaga
            um objeto minúsculo `.conferir/<ts>`
  modal     com EDITOR_RENDER=modal: a função render_gpu existe (from_name + hydrate, sem executar)
  cerebro   só diz se ANTHROPIC_API_KEY existe (a API nunca é chamada)
  variaveis obrigatórias que faltam, por NOME

Cada checagem roda numa thread com prazo próprio (EDITOR_CONFERIR_TIMEOUT_S, padrão 8 s): uma falhar ou travar não
derruba as outras. Toda mensagem de erro passa por `mascarar` (nenhum valor de chave, senha ou URL com credencial sai).
"""
from __future__ import annotations

import asyncio
import os
import re
import threading
import time
from typing import Callable

from fastapi import APIRouter

from motor import config

rotas = APIRouter(tags=["conferir"])

TABELAS = ("projetos", "arquivos", "versoes", "jobs", "eventos")
_NOME_SECRETO = re.compile(r"(KEY|TOKEN|SECRET|SENHA|PASSWORD|PASS|HASH|DATABASE_URL|CREDENTIAL)", re.IGNORECASE)


class Desligado(Exception):
    """O serviço não está ligado nesta configuração (não é erro)."""


# ---------------------------------------------------------------- máscara
def _valores_secretos() -> list[str]:
    vals = set()
    for nome, v in os.environ.items():
        v = (v or "").strip()
        if len(v) >= 6 and (_NOME_SECRETO.search(nome) or nome.startswith(("R2_ACCESS", "MODAL_TOKEN"))):
            vals.add(v)
    return sorted(vals, key=len, reverse=True)


def mascarar(texto: str, limite: int = 240) -> str:
    """Tira de uma mensagem tudo que pode ser segredo: valores das variáveis secretas do ambiente, credenciais em URL,
    tokens Bearer, assinaturas de URL pré-assinada e chaves com cara de chave."""
    t = str(texto)
    for v in _valores_secretos():
        t = t.replace(v, "***")
    t = re.sub(r"(?i)\b([a-z][a-z0-9+.\-]*://)([^/\s:@]+):([^@\s/]+)@", r"\1\2:***@", t)     # usuario:senha@
    t = re.sub(r"(?i)(bearer|key)\s+[A-Za-z0-9._~+/=\-]{8,}", r"\1 ***", t)
    t = re.sub(r"(?i)(x-amz-(signature|credential|security-token)=)[^&\s]+", r"\1***", t)
    t = re.sub(r"(?i)((password|senha|secret|token|apikey|api_key)\s*[=:]\s*)[^\s&,;]+", r"\1***", t)
    t = re.sub(r"\b(sk-ant-[A-Za-z0-9_\-]{6})[A-Za-z0-9_\-]+", r"\1***", t)
    t = " ".join(t.split())
    return t if len(t) <= limite else t[: limite - 1] + "…"


# ---------------------------------------------------------------- checagens (síncronas; rodam em thread)
def checar_banco(cfg) -> str:
    destino = cfg.banco
    from motor import banco_pg
    if banco_pg.eh_url_postgres(destino):
        psycopg, _ = banco_pg._psycopg()
        alvo = banco_pg.normalizar_url(destino)
        with psycopg.connect(alvo, autocommit=False, prepare_threshold=None, connect_timeout=5,
                             application_name="editor-creat-conferir") as con:
            con.execute("SET TRANSACTION READ ONLY")
            con.execute("SELECT 1").fetchone()
            faltam = [t for t in TABELAS if con.execute("SELECT to_regclass(%s)", (f"public.{t}",)).fetchone()[0] is None]
            con.rollback()
        tipo = "postgres"
    else:
        import pathlib
        import sqlite3
        arq = pathlib.Path(destino)
        if not arq.is_file():
            raise RuntimeError("o arquivo do SQLite ainda não existe (o motor cria ao subir o worker/API)")
        con = sqlite3.connect(f"file:{arq}?mode=ro", uri=True, timeout=5)
        try:
            con.execute("SELECT 1").fetchone()
            existentes = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        finally:
            con.close()
        faltam = [t for t in TABELAS if t not in existentes]
        tipo = "sqlite"
    if faltam:
        raise RuntimeError(f"{tipo} conectou, mas faltam as tabelas: {', '.join(faltam)}")
    return f"{tipo}: conectou, SELECT 1 e as {len(TABELAS)} tabelas existem"


def _cliente_s3():
    import boto3
    from botocore.config import Config as BotoConfig
    endpoint = os.environ.get("R2_ENDPOINT", "").strip() or f"https://{os.environ.get('R2_ACCOUNT_ID', '').strip()}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3", endpoint_url=endpoint.rstrip("/"), region_name="auto",
        aws_access_key_id=os.environ.get("R2_ACCESS_KEY_ID", "").strip(),
        aws_secret_access_key=os.environ.get("R2_SECRET_ACCESS_KEY", "").strip(),
        config=BotoConfig(connect_timeout=3, read_timeout=5, retries={"max_attempts": 1},
                          s3={"addressing_style": "path"}, signature_version="s3v4"),
    )


def checar_r2(cfg, escrita: bool = False) -> str:
    if cfg.armazenamento != "r2":
        raise Desligado("EDITOR_ARMAZENAMENTO não é r2 (arquivos no disco local)")
    falta = [n for n in ("R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET") if not os.environ.get(n, "").strip()]
    if not os.environ.get("R2_ENDPOINT", "").strip() and not os.environ.get("R2_ACCOUNT_ID", "").strip():
        falta.insert(0, "R2_ACCOUNT_ID")
    if falta:
        raise RuntimeError("faltam " + ", ".join(falta))
    bucket = os.environ["R2_BUCKET"].strip()
    s3 = _cliente_s3()
    s3.head_bucket(Bucket=bucket)
    try:
        regras = s3.get_bucket_cors(Bucket=bucket).get("CORSRules", [])
    except Exception as e:  # noqa: BLE001
        codigo = getattr(e, "response", {}).get("Error", {}).get("Code", "")
        if codigo in ("NoSuchCORSConfiguration", "NoSuchCors"):
            raise RuntimeError("bucket acessível, mas SEM CORS: o envio direto do navegador vai falhar") from e
        raise
    put = any("PUT" in [m.upper() for m in r.get("AllowedMethods", [])] for r in regras)
    etag = any("etag" in [h.lower() for h in r.get("ExposeHeaders", [])] for r in regras)
    problemas = ([] if put else ["CORS sem PUT"]) + ([] if etag else ["CORS sem ExposeHeaders ETag"])
    extra = ""
    if escrita:
        chave = f".conferir/{int(time.time() * 1000)}"
        s3.put_object(Bucket=bucket, Key=chave, Body=b"ok")
        try:
            s3.head_object(Bucket=bucket, Key=chave)
        finally:
            s3.delete_object(Bucket=bucket, Key=chave)
        extra = "; gravou, leu e apagou um objeto de teste"
    if problemas:
        raise RuntimeError("bucket acessível, mas " + " e ".join(problemas) + extra)
    return f"bucket acessível; CORS com PUT e ETag exposto ({len(regras)} regra(s)){extra}"


def checar_modal(cfg) -> str:
    if cfg.render != "modal":
        raise Desligado("EDITOR_RENDER não é modal (planos na CPU)")
    falta = [n for n in ("MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET") if not os.environ.get(n, "").strip()]
    if falta:
        raise RuntimeError("EDITOR_RENDER=modal, mas faltam " + " e ".join(falta) + " (a montagem cai na CPU)")
    try:
        import modal
    except ModuleNotFoundError as e:
        raise RuntimeError("o pacote 'modal' não está instalado neste motor") from e
    from motor.provedores.render_modal import APP_MODAL, FUNCAO_GPU
    f = modal.Function.from_name(APP_MODAL, FUNCAO_GPU)
    f.hydrate()
    return f"função {APP_MODAL}/{FUNCAO_GPU} publicada (não executada)"


def checar_cerebro(cfg) -> str:
    if cfg.cerebro != "anthropic":
        raise Desligado("EDITOR_CEREBRO não é anthropic (direção fixture)")
    if not os.environ.get("ANTHROPIC_API_KEY", "").strip():
        raise RuntimeError("EDITOR_CEREBRO=anthropic, mas ANTHROPIC_API_KEY não existe (cai na direção fixture)")
    return "ANTHROPIC_API_KEY presente (a API não foi chamada)"


def variaveis_faltando(cfg) -> list[str]:
    def tem(n):
        return bool(os.environ.get(n, "").strip())
    exigidas = ["MOTOR_TOKEN"]
    if cfg.armazenamento == "r2" or os.environ.get("EDITOR_SEM_ESTADO") == "1":
        exigidas += ["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]
        if not tem("R2_ENDPOINT"):
            exigidas.append("R2_ACCOUNT_ID")
    if cfg.banco_tipo == "postgres" or os.environ.get("EDITOR_SEM_ESTADO") == "1":
        exigidas.append("DATABASE_URL")
    if os.environ.get("EDITOR_SEM_ESTADO") == "1":
        exigidas += [n for n in ("EDITOR_ARMAZENAMENTO", "EDITOR_BANCO")]
    if cfg.cerebro == "anthropic":
        exigidas.append("ANTHROPIC_API_KEY")
    if cfg.render == "modal":
        exigidas += ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"]
    extras = {"scribe": "ELEVENLABS_API_KEY"}.get(cfg.transcricao)
    extras_v = {"gemini": "GEMINI_API_KEY", "claude-leve": "ANTHROPIC_API_KEY"}.get(cfg.visao)
    extras_p = {"metricool": "METRICOOL_TOKEN", "meta": "META_ACCESS_TOKEN"}.get(cfg.publicacao)
    exigidas += [x for x in (extras, extras_v, extras_p) if x]
    vistos, faltam = set(), []
    for n in exigidas:
        if n not in vistos and not tem(n):
            faltam.append(n)
        vistos.add(n)
    return faltam


def checar_variaveis(cfg) -> str:
    faltam = variaveis_faltando(cfg)
    if faltam:
        raise RuntimeError("faltam: " + ", ".join(faltam))
    return "todas as obrigatórias desta configuração existem"


# ---------------------------------------------------------------- execução
def _prazo() -> float:
    try:
        return max(0.5, float(os.environ.get("EDITOR_CONFERIR_TIMEOUT_S", "8") or 8))
    except ValueError:
        return 8.0


def _em_thread(fn: Callable[[], str]) -> asyncio.Future:
    """Roda fn numa thread daemon própria (não no executor padrão): uma checagem travada não segura a resposta nem o
    desligamento do processo."""
    loop = asyncio.get_running_loop()
    fut = loop.create_future()

    def entregar(res, erro):
        if not fut.done():
            fut.set_exception(erro) if erro is not None else fut.set_result(res)

    def alvo():
        try:
            res, erro = fn(), None
        except BaseException as e:  # noqa: BLE001
            res, erro = None, e
        try:
            loop.call_soon_threadsafe(entregar, res, erro)
        except RuntimeError:        # o laço já fechou (prazo vencido e resposta enviada)
            pass

    threading.Thread(target=alvo, daemon=True, name="conferir").start()
    return fut


async def _rodar(fn: Callable[[], str], prazo: float) -> dict:
    t0 = time.monotonic()
    try:
        detalhe = await asyncio.wait_for(_em_thread(fn), prazo)
        estado = "ok"
    except Desligado as e:
        estado, detalhe = "desligado", str(e)
    except (asyncio.TimeoutError, TimeoutError):
        estado, detalhe = "falhou", f"sem resposta em {prazo:g} s"
    except Exception as e:  # noqa: BLE001 - qualquer erro vira 'falhou', sem derrubar as outras checagens
        estado, detalhe = "falhou", f"{type(e).__name__}: {e}"
    return {"estado": estado, "detalhe": mascarar(detalhe), "ms": int((time.monotonic() - t0) * 1000)}


async def conferir_tudo(cfg, *, escrita: bool = False, checagens: dict | None = None) -> dict:
    checagens = checagens or {
        "banco": lambda: checar_banco(cfg),
        "r2": lambda: checar_r2(cfg, escrita),
        "modal": lambda: checar_modal(cfg),
        "cerebro": lambda: checar_cerebro(cfg),
        "variaveis": lambda: checar_variaveis(cfg),
    }
    prazo = _prazo()
    nomes = list(checagens)
    res = await asyncio.gather(*(_rodar(checagens[n], prazo) for n in nomes))
    servicos = dict(zip(nomes, res))
    falhas = [n for n, r in servicos.items() if r["estado"] == "falhou"]
    resumo = {"estado": "falhou" if falhas else "ok", "falhas": falhas,
              "desligados": [n for n, r in servicos.items() if r["estado"] == "desligado"],
              "texto": (f"{len(falhas)} serviço(s) com problema: {', '.join(falhas)}" if falhas
                        else "tudo que está ligado respondeu")}
    return {"servicos": servicos, "resumo": resumo, "escrita": bool(escrita)}


@rotas.get("/conferir")
async def conferir(escrita: int = 0):
    return await conferir_tudo(config.carregar(), escrita=escrita == 1)
