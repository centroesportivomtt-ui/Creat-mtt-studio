"""Rotas de projetos, arquivos, importação por link, fechar envio, eventos (SSE) e arquivos com Range (frente A).

Todas ficam sob /v1 e atrás do token do motor (api/app.py). Erros em pt-BR com status HTTP correto.
Cada rota abre e fecha a própria conexão SQLite (o FastAPI roda rotas síncronas em threads diferentes).
"""
from __future__ import annotations

import asyncio
import json
import mimetypes
import os
import pathlib
import re
import time
import uuid
from contextlib import contextmanager
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import RedirectResponse, Response, StreamingResponse
from pydantic import BaseModel, Field, field_validator

from motor import banco, config, importar, pipeline
from motor.provedores import armazenamento_de
from motor.provedores.armazenamento_local import ChaveInvalida, validar_chave

rotas = APIRouter(tags=["projetos"])
TIPOS_VIDEO = ("auto", "evento", "empresa", "daily_vlog", "anuncio", "depoimento", "bastidor")
ESTADOS_ABERTOS = ("recebendo", "lendo")
PREFIXOS_SERVIDOS = ("entrada/", "derivados/", "saidas/")

_CFG: dict = {}


def _config():
    """Config + armazenamento, recarregados se EDITOR_DADOS mudar (testes trocam a pasta de dados)."""
    k = os.environ.get("EDITOR_DADOS", "")
    if k not in _CFG:
        cfg = config.carregar()
        _CFG.clear()
        _CFG[k] = (cfg, armazenamento_de(cfg))
    return _CFG[k]


@contextmanager
def _con():
    cfg, _ = _config()
    con = banco.conectar(cfg.banco)
    try:
        yield con
    finally:
        con.close()


def _projeto(con, pid: str) -> dict:
    r = con.execute("SELECT * FROM projetos WHERE id=?", (pid,)).fetchone()
    if r is None:
        raise HTTPException(404, "projeto não encontrado")
    d = dict(r)
    d["dados"] = json.loads(d["dados"] or "{}")
    return d


# ---------------- modelos de entrada ----------------
class NovoProjeto(BaseModel):
    nome: str = Field(min_length=1, max_length=120)
    tipo_video: Optional[str] = "auto"

    @field_validator("nome")
    @classmethod
    def _nome(cls, v):
        v = " ".join(v.split())
        if not v:
            raise ValueError("nome vazio")
        return v

    @field_validator("tipo_video")
    @classmethod
    def _tipo(cls, v):
        if v is not None and v not in TIPOS_VIDEO:
            raise ValueError(f"tipo_video deve ser um de {', '.join(TIPOS_VIDEO)}")
        return v or "auto"


class NovoArquivo(BaseModel):
    chave: str = Field(min_length=1, max_length=512)
    nome: str = Field(min_length=1, max_length=255)
    bytes: int = Field(ge=0)


class Importacao(BaseModel):
    url: str = Field(min_length=12, max_length=2000)


# ---------------- projetos ----------------
@rotas.post("/projetos", status_code=201)
def criar_projeto(corpo: NovoProjeto):
    pid = "p_" + uuid.uuid4().hex[:10]
    agora = banco.agora_iso()
    with _con() as con:
        con.execute("INSERT INTO projetos (id, nome, estado, tipo_video, criado, atualizado, dados) VALUES (?,?,?,?,?,?,?)",
                    (pid, corpo.nome, "recebendo", corpo.tipo_video, agora, agora, "{}"))
        banco.emitir(con, pid, "projeto_criado", estado="recebendo", mensagem=f"Projeto criado: {corpo.nome}")
        return _projeto(con, pid)


@rotas.get("/projetos")
def listar_projetos(limite: int = 50):
    limite = max(1, min(200, limite))
    with _con() as con:
        linhas = con.execute(
            """SELECT p.id, p.nome, p.estado, p.tipo_video, p.criado, p.atualizado,
                      (SELECT COUNT(*) FROM arquivos a WHERE a.projeto=p.id) AS arquivos,
                      ce.tipo AS espera
               FROM projetos p LEFT JOIN conversa_espera ce ON ce.projeto=p.id
               ORDER BY p.atualizado DESC LIMIT ?""", (limite,)).fetchall()
        return [dict(r) for r in linhas]


@rotas.get("/projetos/{pid}")
def ver_projeto(pid: str):
    with _con() as con:
        p = _projeto(con, pid)
        p["arquivos"] = [dict(r) for r in con.execute("SELECT id, nome, chave, bytes, estado, criado FROM arquivos WHERE projeto=? ORDER BY id", (pid,))]
        p["versoes"] = [dict(r) for r in con.execute("SELECT id, estado, video, qa, link, reprovacao, criado FROM versoes WHERE projeto=? ORDER BY criado", (pid,))]
        p["jobs"] = banco.jobs_do_projeto(con, pid)
        for j in p["jobs"]:
            j["erro"] = (j["erro"] or "").strip().splitlines()[-1][:300] if j["erro"] else None
        from motor.etapas import espelho
        nuvem = espelho.resumo(con, pid)
        if nuvem is not None:             # só com o espelho ligado (EDITOR_ESPELHO=1): desligado, nada aparece na tela
            p["nuvem"] = nuvem
            est = {r["chave"]: r["estado"] for r in con.execute("SELECT chave, estado FROM nuvem WHERE projeto=?", (pid,))}
            for a in p["arquivos"]:
                a["nuvem"] = est.get(a["chave"])
        return p


# ---------------- arquivos ----------------
def _local_do_envio(cfg, chave: str):
    """Onde o servidor tus do site deixa o arquivo terminado: $EDITOR_DADOS/armazenamento/<chave> (mesmo disco)."""
    raiz = (pathlib.Path(cfg.dados) / "armazenamento").resolve()
    p = (raiz / validar_chave(chave)).resolve()
    return p if raiz in p.parents and p.is_file() else None


def _promover_para_r2(cfg, arm, chave: str) -> None:
    """Produção com EDITOR_ARMAZENAMENTO=r2 enquanto o site ainda grava o tus em disco: o motor sobe o arquivo
    terminado para o R2 (fica uma cópia no cache local, que o ingest lê). Passo de transição até o @tus/s3-store."""
    if getattr(arm, "nome", "") != "r2" or arm.existe(chave):
        return
    local = _local_do_envio(cfg, chave)
    if local is not None:
        arm.gravar(chave, local, mover=True)


@rotas.post("/projetos/{pid}/arquivos", status_code=201)
def registrar_arquivo(pid: str, corpo: NovoArquivo):
    cfg, arm = _config()
    if arm is None:
        raise HTTPException(503, "armazenamento indisponível")
    try:
        validar_chave(corpo.chave)
    except ChaveInvalida as e:
        raise HTTPException(422, str(e)) from e
    if not corpo.chave.startswith(f"entrada/{pid}/"):
        raise HTTPException(422, f"a chave precisa começar com entrada/{pid}/")
    nome = re.sub(r"[\x00-\x1f]+", "", corpo.nome).strip() or "arquivo"
    with _con() as con:
        p = _projeto(con, pid)
        if p["estado"] not in ESTADOS_ABERTOS:
            raise HTTPException(409, "o projeto já está em direção/montagem; crie uma nova versão para mandar material novo")
        _promover_para_r2(cfg, arm, corpo.chave)
        if not arm.existe(corpo.chave):
            raise HTTPException(409, "o arquivo ainda não chegou ao armazenamento (termine o envio antes)")
        real = arm.tamanho(corpo.chave)
        if corpo.bytes and corpo.bytes != real:
            raise HTTPException(409, f"tamanho não confere: o envio diz {corpo.bytes} bytes, o armazenamento tem {real}")
        aid, novo = importar.registrar_arquivo(con, pid, nome, corpo.chave, real)
        return {"id": aid, "novo": novo, "chave": corpo.chave, "bytes": real}


@rotas.post("/projetos/{pid}/importar", status_code=202)
def importar_link(pid: str, corpo: Importacao):
    """Link do Dropbox (arquivo ou pasta) ou do Drive (arquivo ou PASTA). Pasta do Drive é listada na hora: o dono vê
    quantos vídeos entraram (`detalhe`) e pasta restrita, apagada, vazia ou já importada volta 422 com o passo a passo."""
    pasta = None
    try:
        direto, tipo = importar.link_direto(corpo.url)          # valida antes de enfileirar (host, formato)
        sondar = os.environ.get("EDITOR_SONDAR_LINK", "1") == "1"
        if tipo == "pasta_drive":
            pasta, aviso = importar.sondar_pasta(direto) if sondar else (None, None)
        else:
            aviso = importar.sondar(corpo.url) if sondar else None
    except importar.ErroImportacao as e:      # link que pede login ou não existe: o motivo aparece embaixo do botão, na hora
        raise HTTPException(422, str(e)) from e
    with _con() as con:
        p = _projeto(con, pid)
        if p["estado"] not in ESTADOS_ABERTOS:
            raise HTTPException(409, "o projeto já está em direção/montagem")
        extra: dict = {}
        if pasta is not None:
            ja = importar.importados_drive(con, pid)
            novos = [i for i in pasta["itens"] if i["id"] not in ja]
            if not novos:
                raise HTTPException(422, importar.msg_pasta_ja_importada(len(pasta["itens"])))
            extra["pasta"] = {"nome": pasta["nome"], "videos": len(novos), "ignorados": pasta["ignorados"],
                              "subpastas": pasta["subpastas"], "ja_no_projeto": len(pasta["itens"]) - len(novos), "bytes": None}
            extra["detalhe"] = importar.detalhe_pasta(pasta, len(novos), len(pasta["itens"]) - len(novos))
        aid, _ = importar.registrar_arquivo(con, pid, "importando do link…", None, 0, entrada={"url": corpo.url.strip()})
        return {"id": aid, "mensagem": "Importação na fila: o motor baixa e já começa a ler.", **({"aviso": aviso} if aviso else {}), **extra}


def _recolher_orfaos(con, cfg, arm, pid: str) -> int:
    """Arquivo que terminou de subir mas não foi registrado (motor fora do ar + aba fechada antes do novo registro)
    ficaria de fora do vídeo em silêncio. Antes de fechar o envio, tudo em entrada/<pid>/ que não tem linha no banco é
    registrado (registrar_arquivo é idempotente pela chave)."""
    conhecidas = {r["chave"] for r in con.execute("SELECT chave FROM arquivos WHERE projeto=? AND chave IS NOT NULL", (pid,))}
    prefixo = f"entrada/{pid}/"
    achadas: set[str] = set()
    if arm is not None:
        try:
            achadas.update(k for k in arm.listar(prefixo) if not k.rsplit("/", 1)[-1].startswith("."))
        except Exception:  # noqa: BLE001 - listar falhou: segue com o que der para ver no disco
            pass
    pasta = pathlib.Path(cfg.dados) / "armazenamento" / "entrada" / pid
    if pasta.is_dir():
        achadas.update(f"{prefixo}{q.name}" for q in pasta.iterdir() if q.is_file() and not q.name.startswith("."))
    ids = {r["id"] for r in con.execute("SELECT id FROM arquivos WHERE projeto=?", (pid,))}
    n = 0
    for chave in sorted(achadas - conhecidas):
        m = re.match(r"^(a\d{3,})(_z\d{3})?\.", chave.rsplit("/", 1)[-1])
        if m and m.group(1) in ids:
            continue              # nome do motor (importação por link em andamento): o ingest registra
        try:
            validar_chave(chave)
            _promover_para_r2(cfg, arm, chave)
            if arm is None or not arm.existe(chave):
                continue
            nome = chave.rsplit("/", 1)[-1]
            _, novo = importar.registrar_arquivo(con, pid, nome, chave, arm.tamanho(chave))
            n += int(bool(novo))
        except (ChaveInvalida, OSError):
            continue
    if n:
        banco.emitir(con, pid, "aviso", mensagem=f"{n} arquivo(s) que tinham subido sem registro entraram no projeto.")
    return n


@rotas.post("/projetos/{pid}/fechar-envio")
def fechar_envio(pid: str):
    cfg, arm = _config()
    with _con() as con:
        p = _projeto(con, pid)
        if p["estado"] in ESTADOS_ABERTOS:
            _recolher_orfaos(con, cfg, arm, pid)
        n = con.execute("SELECT COUNT(*) n FROM arquivos WHERE projeto=?", (pid,)).fetchone()["n"]
        if n == 0:
            raise HTTPException(409, "nenhum arquivo enviado ainda")
        d = p["dados"]
        d["envio_fechado"] = True
        con.execute("UPDATE projetos SET dados=?, atualizado=? WHERE id=?", (json.dumps(d), banco.agora_iso(), pid))
        dirigindo = pipeline.tentar_dirigir(con, pid)
        if not dirigindo and p["estado"] == "recebendo":
            falta = "o pedido" if not d.get("pedido") else "terminar a leitura"
            banco.mudar_estado(con, pid, "lendo", f"Envio fechado ({n} arquivo(s)). Falta {falta}.")
        return {"envio_fechado": True, "dirigindo": dirigindo, "arquivos": n}


# ---------------- eventos ao vivo (SSE) ----------------
_RE_SEM = re.compile(r"^[a-z_]+(,[a-z_]+)*$")


def _buscar_eventos(pid: str, depois: int, sem: tuple = ()) -> list[dict]:
    with _con() as con:
        return banco.eventos_desde(con, pid, depois, sem=sem)


def _formatar(e: dict) -> str:
    return f"id: {e['id']}\nevent: {e['tipo']}\ndata: {json.dumps(e, ensure_ascii=False)}\n\n"


def _efemero(pid: str, tipo: str, dados: dict) -> str:
    """Evento sem id (evento-efemero.schema.json): não fica no banco e não mexe no Last-Event-ID."""
    return f"event: {tipo}\ndata: {json.dumps({'tipo': tipo, 'projeto': pid, 'dados': dados}, ensure_ascii=False)}\n\n"


@rotas.get("/projetos/{pid}/eventos")
async def eventos(pid: str, request: Request, depois: int = 0, seguir: bool = True, ate: Optional[float] = None,
                  v: int = 1, sem: Optional[str] = None, last_event_id: Optional[str] = Header(default=None)):
    """v=1 (padrão): o SSE de sempre. v=2: o gerador da conversa (rascunho, instantâneo, ping com dados, ate de 600 s).
    EDITOR_SSE_NOVO=0 faz v=2 servir o gerador antigo, byte a byte. sem: tipos fora (filtrados no SQL), nos dois."""
    with _con() as con:
        _projeto(con, pid)
    if sem is not None and not _RE_SEM.match(sem):
        raise HTTPException(422, "sem: tipos separados por vírgula, só letras minúsculas e _")
    filtro = tuple(sorted(set(sem.split(",")))) if sem else ()
    cursor = max(depois, int(last_event_id) if (last_event_id or "").isdigit() else 0)
    cfg, _ = _config()
    if v == 2 and cfg.sse_novo:
        return StreamingResponse(_gerar_v2(cfg, pid, request, cursor, seguir, max(1.0, min(600.0 if ate is None else ate, 6 * 3600.0)), filtro),
                                 media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})
    ate = max(1.0, min(3600.0 if ate is None else ate, 6 * 3600.0))

    async def gerar():
        nonlocal cursor
        inicio, ultimo_ping = time.monotonic(), time.monotonic()
        yield "retry: 2000\n\n"
        while True:
            novos = await asyncio.to_thread(_buscar_eventos, pid, cursor, filtro)
            for e in novos:
                cursor = e["id"]
                yield _formatar(e)
            if not novos:
                if not seguir or time.monotonic() - inicio > ate or await request.is_disconnected():
                    return
                if time.monotonic() - ultimo_ping > 15:
                    ultimo_ping = time.monotonic()
                    yield ": ping\n\n"
                await asyncio.sleep(0.5)

    return StreamingResponse(gerar(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})


async def _gerar_v2(cfg, pid: str, request: Request, cursor: int, seguir: bool, ate: float, filtro: tuple):
    """SSE v2 (plano 13.4): uma conexão de leitura por cliente, fechada no finally; backlog filtrado no SQL; um
    instantâneo ao esvaziar o backlog; tique de 150 ms com turno rodando (0,5 s sem); rascunho só quando muda;
    event: ping com dados a cada 15 s; teto de 600 s (o EventSource reconecta com Last-Event-ID)."""
    from motor.conversa import laco
    con = await asyncio.to_thread(banco.conectar_leitura, cfg.banco)
    try:
        inicio, ultimo_ping, ultimo_v = time.monotonic(), time.monotonic(), -1
        yield "retry: 2000\n\n"
        while True:
            novos = await asyncio.to_thread(banco.eventos_desde, con, pid, cursor, 200, filtro)
            for e in novos:
                cursor = e["id"]
                yield _formatar(e)
            if len(novos) < 200:
                break
        m = laco.atual()
        if m is not None:
            inst = await asyncio.to_thread(m.instantaneo, cfg, pid, con)
            ultimo_v = (inst.get("rascunho") or {}).get("v", -1)
        else:
            from motor.conversa import preferencia, teto
            ligada, motivo = preferencia.estado(cfg, dono_do_lock=True)
            from motor.etapas import passos
            ab = await asyncio.to_thread(passos.abertos, con, pid)
            inst = {"ligada": ligada, "gasto_hoje_usd": round(await asyncio.to_thread(teto.gasto_hoje_usd, cfg), 4),
                    "teto_usd_dia": teto.teto_usd_dia(cfg), **({"motivo": motivo} if motivo else {}), **({"passos_abertos": ab} if ab else {})}
        yield _efemero(pid, "instantaneo", inst)
        if not seguir:
            return
        while True:
            m = laco.atual()
            rodando = m is not None and m.rodando(pid)
            novos = await asyncio.to_thread(banco.eventos_desde, con, pid, cursor, 200, filtro)
            for e in novos:
                cursor = e["id"]
                yield _formatar(e)
            if rodando:
                r = m.rascunho.get(pid)
                if r and r.get("v", -1) != ultimo_v and r.get("turno"):
                    ultimo_v = r["v"]
                    yield _efemero(pid, "rascunho", dict(r))
            if novos:
                continue
            if time.monotonic() - inicio > ate or await request.is_disconnected():
                return
            if time.monotonic() - ultimo_ping > 15:
                ultimo_ping = time.monotonic()
                yield _efemero(pid, "ping", {"ts": banco.agora_iso()})
            await asyncio.sleep(0.15 if rodando else 0.5)
    finally:
        con.close()


# ---------------- arquivos do armazenamento (player) com Range ----------------
_RE_RANGE = re.compile(r"^bytes=(\d*)-(\d*)$")


_RE_SAIDA = re.compile(r"^saidas/([^/]+)/([^/]+)/(.+)$")
_SO_ENTREGUE = re.compile(r"^(final\.mp4|mix\.wav|stems/.*|capa\.jpg|entrega\.json|cor\.json|cor/.*)$")


_NUNCA_SERVIDO = re.compile(r"^stems/reais(\.[A-Za-z0-9]+)?$")   # som do banco (Sonniss) isolado: a licença proíbe redistribuir


REGRA_NAO_ENTREGUE = ("Versão não entregue nunca sai do editor: não baixa, não tem link e não vai para o cliente. A segurada pela "
                      "conferência pode ser assistida só aqui, na tela do projeto, marcada como não entregue.")


def _liberado(chave: str) -> None:
    """Regra do dono: versão não entregue nunca sai do editor: não baixa, não tem link e não vai para o cliente. O vídeo (e o
    áudio) de uma versão só saem por aqui depois que a versão está 'entregue' (QA aprovado e mesmo sha256). A segurada pela
    conferência pode ser assistida só na tela do projeto, marcada como não entregue, pela rota própria
    `/v1/projetos/{pid}/versoes/{v}/segurada/video` (api/versoes.py), que nunca passa por esta função nem redireciona para o R2.
    Evidências do QA continuam visíveis.
    O stem `reais` (sons do banco sozinhos, M6) nunca sai, nem entregue: só o filme e o mix completo, que são a obra."""
    m = _RE_SAIDA.match(chave)
    if m and _NUNCA_SERVIDO.match(m.group(3)):
        raise HTTPException(403, "o som do banco isolado não é servido (licença: só dentro do filme)")
    if not m or not _SO_ENTREGUE.match(m.group(3)):
        return
    with _con() as con:
        r = con.execute("SELECT estado FROM versoes WHERE projeto=? AND id=?", (m.group(1), m.group(2))).fetchone()
    if r is None or r["estado"] != "entregue":
        raise HTTPException(403, "esta versão não foi entregue: não baixa, não tem link e não vai para o cliente (a segurada pela "
                                 "conferência dá para assistir só na tela do projeto)")


def _cabecalhos_tipo(nome: str) -> tuple[str, dict]:
    tipo = mimetypes.guess_type(nome)[0] or "application/octet-stream"
    extra = {"X-Content-Type-Options": "nosniff"}
    if tipo in ("image/svg+xml", "text/html", "application/xhtml+xml", "text/xml", "application/xml"):
        extra["Content-Disposition"] = "attachment"     # SVG/HTML enviado não roda na origem do site (XSS armazenado)
        extra["Content-Security-Policy"] = "default-src 'none'; sandbox"
    return tipo, extra


@rotas.get("/arquivos/{chave:path}")
def servir_arquivo(chave: str, range: Optional[str] = Header(default=None)):
    _, arm = _config()
    try:
        validar_chave(chave)
    except ChaveInvalida as e:
        raise HTTPException(400, str(e)) from e
    if not chave.startswith(PREFIXOS_SERVIDOS):
        raise HTTPException(403, "caminho não servido")
    _liberado(chave)
    if arm is None or not arm.existe(chave):
        raise HTTPException(404, "arquivo não encontrado")
    if getattr(arm, "nome", "") != "local":
        return RedirectResponse(arm.url(chave), status_code=307)
    caminho = arm.caminho_local(chave)
    tipo, extra = _cabecalhos_tipo(caminho.name)
    return com_range(caminho, range, tipo, {"Cache-Control": "private, max-age=3600", **extra})


def com_range(caminho: pathlib.Path, range: Optional[str], tipo: str, cabecalhos: dict) -> StreamingResponse:
    """Arquivo local em streaming com Range (200 inteiro, 206 pedaço, 416 fora). Usado pelo player e pela versão segurada."""
    total = caminho.stat().st_size
    ini, fim, status = 0, total - 1, 200
    if range:
        m = _RE_RANGE.match(range.strip())
        if not m or (not m.group(1) and not m.group(2)):
            raise HTTPException(416, "Range inválido", headers={"Content-Range": f"bytes */{total}"})
        if m.group(1):
            ini = int(m.group(1))
            fim = min(int(m.group(2)), total - 1) if m.group(2) else total - 1
        else:                                   # bytes=-N (últimos N)
            ini = max(0, total - int(m.group(2)))
        if ini >= total or ini > fim:
            raise HTTPException(416, "Range fora do arquivo", headers={"Content-Range": f"bytes */{total}"})
        status = 206
    tamanho = fim - ini + 1

    def ler():
        with open(caminho, "rb") as f:
            f.seek(ini)
            falta = tamanho
            while falta > 0:
                bloco = f.read(min(1 << 20, falta))
                if not bloco:
                    break
                falta -= len(bloco)
                yield bloco

    cab = {"Accept-Ranges": "bytes", "Content-Length": str(tamanho), **cabecalhos}
    if status == 206:
        cab["Content-Range"] = f"bytes {ini}-{fim}/{total}"
    return StreamingResponse(ler(), status_code=status, media_type=tipo, headers=cab)


@rotas.head("/arquivos/{chave:path}")
def cabecalho_arquivo(chave: str):
    _, arm = _config()
    try:
        validar_chave(chave)
    except ChaveInvalida as e:
        raise HTTPException(400, str(e)) from e
    if not chave.startswith(PREFIXOS_SERVIDOS) or arm is None or not arm.existe(chave):
        raise HTTPException(404, "arquivo não encontrado")
    _liberado(chave)
    tipo, extra = _cabecalhos_tipo(chave)
    return Response(headers={"Accept-Ranges": "bytes", "Content-Length": str(arm.tamanho(chave)), "Content-Type": tipo, **extra})
