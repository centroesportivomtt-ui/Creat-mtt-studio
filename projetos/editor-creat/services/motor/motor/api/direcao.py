"""Rotas da frente B: pedido do dono (texto ou áudio) e reprovação de versão (vira regra + checagem + nova direção).

Sob /v1 e atrás do token do motor (api/app.py). Entrada validada na borda (pydantic); erros em pt-BR.
"""
from __future__ import annotations

import json
import os
from contextlib import contextmanager
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

from motor import banco, config, pipeline
from motor.etapas import armazem_b
from motor.memoria.loja import Loja

rotas = APIRouter(tags=["direcao"])
TipoVideo = Literal["auto", "evento", "empresa", "daily_vlog", "anuncio", "depoimento", "bastidor"]
Modo = Literal["auto", "criativo", "ultra", "cinema", "ia", "clean", "serio", "fala"]
Destino = Literal["reels", "stories", "tiktok", "shorts", "feed", "youtube"]


@contextmanager
def _con():
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    try:
        yield cfg, con
    finally:
        con.close()


def _projeto(con, pid: str) -> dict:
    r = con.execute("SELECT * FROM projetos WHERE id=?", (pid,)).fetchone()
    if r is None:
        raise HTTPException(404, "projeto não encontrado")
    d = dict(r)
    d["dados"] = json.loads(d["dados"] or "{}")
    return d


def _armazem(cfg):
    from motor.provedores import armazenamento_de
    return armazem_b.Armazem(dados=cfg.dados, provedor=armazenamento_de(cfg))


class PedidoEntrada(BaseModel):
    texto: Optional[str] = Field(None, max_length=4000)
    audio_chave: Optional[str] = Field(None, max_length=500)
    tipo_video: TipoVideo = "auto"
    modo: Modo = "auto"
    ambiente: Literal["auto", "loja", "rua_dia", "rua_noite", "academia", "palco", "neutro"] = "auto"
    vozes: Literal["auto", "uma", "varias"] = "auto"
    duracao_alvo: Optional[float] = Field(None, ge=5, le=600)
    destino: list[Destino] = Field(default_factory=lambda: ["reels"], max_length=6)
    formato: Literal["9:16", "1:1", "4:5", "16:9"] = "9:16"
    cliente: Optional[str] = Field(None, max_length=80, pattern=r"^[a-z0-9_-]+$")
    obrigatorio: list[str] = Field(default_factory=list, max_length=20)
    proibido: list[str] = Field(default_factory=list, max_length=20)
    ajustes_de: Optional[str] = Field(None, pattern=r"^v[0-9]{1,3}$")

    @field_validator("obrigatorio", "proibido")
    @classmethod
    def _itens(cls, v):
        if any(len(x) > 200 for x in v):
            raise ValueError("cada item tem no máximo 200 caracteres")
        return [x.strip() for x in v if x.strip()]

    @model_validator(mode="after")
    def _um_dos_dois(self):
        if not (self.texto and self.texto.strip()) and not self.audio_chave:
            raise ValueError("mande o pedido em texto ou a chave do áudio gravado")
        if self.audio_chave and (self.audio_chave.startswith("/") or ".." in self.audio_chave):
            raise ValueError("chave de áudio inválida")
        return self


class Reprovacao(BaseModel):
    motivo: str = Field(..., min_length=3, max_length=1000)


def _transcrever_pedido(cfg, arm, chave: str) -> str:
    from motor.provedores import provedor
    try:
        tr = provedor("transcricao", cfg)
    except ModuleNotFoundError as e:
        raise HTTPException(503, "transcrição do áudio ainda não está disponível neste motor; mande o pedido em texto") from e
    if not arm.existe(chave):
        raise HTTPException(404, "áudio do pedido não encontrado no armazenamento")
    r = tr.transcrever(arm.caminho(chave), idioma="pt", palavras=False, dicas=["creat.MTT", "Ruan", "Xande", "Marcos"])
    return " ".join(s["texto"].strip() for s in r.get("segmentos", [])).strip()


@rotas.post("/projetos/{pid}/pedido", status_code=201)
def gravar_pedido(pid: str, corpo: PedidoEntrada):
    import validar
    with _con() as (cfg, con):
        proj = _projeto(con, pid)
        # o tipo escolhido em "Novo projeto" vale quando o pedido não diz outro (o formulário do pedido não manda tipo)
        tipo = corpo.tipo_video
        if tipo == "auto" and (proj.get("tipo_video") or "auto") != "auto":
            tipo = proj["tipo_video"]
        arm = _armazem(cfg)
        texto = (corpo.texto or "").strip()
        if corpo.audio_chave and not texto:
            texto = _transcrever_pedido(cfg, arm, corpo.audio_chave)
            if not texto:
                raise HTTPException(422, "não deu para entender o áudio do pedido; grave de novo ou mande em texto")
        pedido = {"versao": "1", "projeto": pid, "texto": texto, "audio": corpo.audio_chave, "tipo_video": tipo, "modo": corpo.modo, "ambiente": corpo.ambiente, "vozes": corpo.vozes, "cliente": corpo.cliente,
                  "destino": corpo.destino, "formato": corpo.formato, "duracao_alvo": corpo.duracao_alvo, "obrigatorio": corpo.obrigatorio,
                  "proibido": corpo.proibido, "referencias": [], "ajustes_de": corpo.ajustes_de, "criado_em": banco.agora_iso()}
        erros = validar.erros("pedido", pedido)
        if erros:
            raise HTTPException(422, "pedido inválido: " + "; ".join(erros[:3]))
        arm.gravar_json(f"projetos/{pid}/pedido.json", pedido)
        r = con.execute("SELECT dados FROM projetos WHERE id=?", (pid,)).fetchone()
        dados = json.loads(r["dados"] or "{}")
        dados["pedido"] = {"texto": texto[:200], "tipo_video": tipo, "modo": corpo.modo}
        con.execute("UPDATE projetos SET dados=?, atualizado=? WHERE id=?", (json.dumps(dados), banco.agora_iso(), pid))
        banco.emitir(con, pid, "estado", mensagem="Pedido recebido.", dados={"pedido": texto[:200]})
        dirigindo = pipeline.tentar_dirigir(con, pid)
        return {"pedido": pedido, "dirigindo": dirigindo}


@rotas.post("/projetos/{pid}/versoes/{versao}/reprovar")
def reprovar(pid: str, versao: str, corpo: Reprovacao):
    with _con() as (cfg, con):
        _projeto(con, pid)
        v = con.execute("SELECT estado FROM versoes WHERE projeto=? AND id=?", (pid, versao)).fetchone()
        if v is None:
            raise HTTPException(404, "versão não encontrada")
        if con.execute("SELECT 1 FROM jobs WHERE projeto=? AND etapa='direcao' AND estado='rodando'", (pid,)).fetchone():
            raise HTTPException(409, "a direção já está refazendo este projeto; espere a nova versão")
        if con.execute("SELECT 1 FROM jobs WHERE projeto=? AND alvo=? AND etapa IN ('montagem','qa','entrega') AND estado='rodando'",
                       (pid, versao)).fetchone():
            raise HTTPException(409, f"a versão {versao} está sendo montada/conferida agora; reprove quando ela terminar")
        # o que ainda estava na fila para esta versão não roda mais (senão a versão reprovada seria entregue depois)
        con.execute("UPDATE jobs SET estado='cancelado', erro='versão reprovada pelo dono', atualizado=? "
                    "WHERE projeto=? AND alvo=? AND etapa IN ('montagem','qa','entrega') AND estado='pendente'",
                    (__import__("time").time(), pid, versao))
        cerebro = None
        try:
            from motor.provedores import provedor
            cerebro = provedor("cerebro", cfg)
        except Exception:  # noqa: BLE001 - sem cérebro, a heurística da loja resolve
            cerebro = None
        r = Loja().registrar_reprovacao(pid, versao, corpo.motivo, cerebro=cerebro)
        con.execute("UPDATE versoes SET estado='reprovada', reprovacao=? WHERE projeto=? AND id=?", (corpo.motivo, pid, versao))
        d = _projeto(con, pid)["dados"]
        d["correcoes_auto"] = 0            # nova rodada pedida pelo dono: o auto-ajuste do QA volta a ter as 2 tentativas
        con.execute("UPDATE projetos SET dados=? WHERE id=?", (json.dumps(d), pid))
        banco.enfileirar(con, "direcao", pid, entrada={"reprovacao": corpo.motivo, "versao_anterior": versao}, prioridade=1)
        banco.mudar_estado(con, pid, "dirigindo", f"Versão {versao} reprovada: virou regra da casa. Refazendo a direção.")
        return {"regra": r["regra"], "checagem": r["checagem"], "vocabulario": r["vocabulario"], "nova_direcao": True}


@rotas.get("/memoria")
def memoria():
    loja = Loja()
    from motor.etapas import cor as COR
    from motor.etapas.direcao import MODOS
    return {"regras": loja.regras(), "checagens": loja.checagens(), "vocabulario": loja.vocabulario(), "modelos": loja.nomes_modelos(),
            "modos": [m for m in (loja.modo(n) for n in MODOS) if m],
            "looks": COR.catalogo(),
            "raiz_isolada": bool(os.environ.get("EDITOR_MEMORIA"))}
