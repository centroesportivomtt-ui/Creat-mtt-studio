"""Rotas da frente C: versões do projeto (link, QA resumido, capa, entrega) e publicação pelo provedor.

GET  /v1/projetos/{pid}/versoes                 -> versões com estado, link, capa, QA (aprovado + falhas) e tempos da montagem
POST /v1/projetos/{pid}/versoes/{v}/publicar    {rede, quando?} -> só versão entregue e aprovada pelo QA
POST /v1/projetos/{pid}/versoes/{v}/aprovar     {nota?} -> o dono aprova a versão entregue; vira caso de referência da casa
"""
from __future__ import annotations

import json
import pathlib
import re
from contextlib import contextmanager
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from motor import banco, config

rotas = APIRouter(tags=["versoes"])
ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


@contextmanager
def _ctx():
    cfg = config.carregar()
    con = banco.conectar(cfg.banco)
    try:
        from motor.provedores import armazenamento_de
        yield cfg, con, armazenamento_de(cfg)
    finally:
        con.close()


def _ler(arm, chave: str):
    try:
        if arm is not None and arm.existe(chave):
            return json.loads(pathlib.Path(arm.caminho_local(chave)).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return None


def _valida(pid: str, v: str | None = None):
    if not ID.match(pid) or (v is not None and not ID.match(v)):
        raise HTTPException(422, "identificador inválido")


@rotas.get("/projetos/{pid}/versoes")
def listar(pid: str):
    _valida(pid)
    with _ctx() as (cfg, con, arm):
        if con.execute("SELECT 1 FROM projetos WHERE id=?", (pid,)).fetchone() is None:
            raise HTTPException(404, "projeto não encontrado")
        out = []
        for r in con.execute("SELECT * FROM versoes WHERE projeto=? ORDER BY criado", (pid,)):
            d = dict(r)
            base = f"saidas/{pid}/{d['id']}"
            qa = _ler(arm, f"{base}/qa.json")
            ent = _ler(arm, f"{base}/entrega.json")
            mont = _ler(arm, f"{base}/montagem.json")
            d["qa_resumo"] = None if qa is None else {
                "aprovado": qa["aprovado"], "tempo_s": qa.get("tempo_s"),
                "falhas": [{"id": c["id"], "detalhe": c.get("detalhe", "")} for c in qa["checagens"] if not c["ok"] and c["bloqueia"]],
                "avisos": [{"id": c["id"], "detalhe": c.get("detalhe", "")} for c in qa["checagens"] if not c["ok"] and not c["bloqueia"]]}
            entregue = d["estado"] == "entregue"
            if not entregue:         # versão não entregue não tem link nem vídeo para o site (regra: nunca a versão com erro)
                d["video"] = None
            d["link"] = (d.get("link") or (arm.url(f"{base}/final.mp4") if arm is not None and arm.existe(f"{base}/final.mp4") else None)) if entregue else None
            d["capa"] = arm.url(f"{base}/capa.jpg") if arm is not None and arm.existe(f"{base}/capa.jpg") else None
            d["legenda_post"] = ent.get("legenda_post") if ent else None
            d["tempos_montagem"] = mont.get("tempos") if mont else None
            out.append(d)
        return {"projeto": pid, "versoes": out}


class Publicar(BaseModel):
    rede: Literal["instagram", "tiktok", "youtube", "facebook"] = "instagram"
    quando: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?$")


@rotas.post("/projetos/{pid}/versoes/{v}/publicar")
def publicar(pid: str, v: str, corpo: Publicar):
    _valida(pid, v)
    with _ctx() as (cfg, con, arm):
        r = con.execute("SELECT * FROM versoes WHERE projeto=? AND id=?", (pid, v)).fetchone()
        if r is None:
            raise HTTPException(404, "versão não encontrada")
        if r["estado"] != "entregue":
            raise HTTPException(409, "só publico versão entregue (aprovada pelo QA)")
        ent = _ler(arm, f"saidas/{pid}/{v}/entrega.json")
        qa = _ler(arm, f"saidas/{pid}/{v}/qa.json")
        if not ent or not qa or not qa.get("aprovado"):
            raise HTTPException(409, "versão sem entrega ou sem QA aprovado")
        from motor.provedores import provedor
        try:
            res = provedor("publicacao", cfg).publicar(ent["link"], ent.get("legenda_post", ""), rede=corpo.rede, quando=corpo.quando)
        except NotImplementedError as e:
            raise HTTPException(501, str(e)) from e
        banco.emitir(con, pid, "estado", etapa="entrega", alvo=v, mensagem="Publicado." if res.get("publicado") else "Link pronto para postar.", dados=res)
        return res


class Aprovar(BaseModel):
    nota: Optional[str] = Field(default=None, max_length=500)


@rotas.post("/projetos/{pid}/versoes/{v}/aprovar")
def aprovar(pid: str, v: str, corpo: Aprovar):
    """A claquete: só versão entregue (QA aprovado). Marca em projetos.dados.aprovadas e grava o caso na memória da casa."""
    _valida(pid, v)
    with _ctx() as (cfg, con, arm):
        r = con.execute("SELECT * FROM versoes WHERE projeto=? AND id=?", (pid, v)).fetchone()
        if r is None:
            raise HTTPException(404, "versão não encontrada")
        if r["estado"] != "entregue":
            raise HTTPException(409, "só dá para aprovar versão entregue (conferida pelo QA)")
        pedido = _ler(arm, f"projetos/{pid}/pedido.json")
        n = v.lstrip("v")
        direcao = _ler(arm, f"projetos/{pid}/direcao_{n}.json") if n.isdigit() else None
        from motor.memoria.loja import Loja
        caso = Loja().registrar_aprovacao(pid, v, pedido=pedido, direcao=direcao, nota=corpo.nota)
        linha = con.execute("SELECT dados FROM projetos WHERE id=?", (pid,)).fetchone()
        dados = json.loads(linha["dados"] or "{}")
        dados.setdefault("aprovadas", {})[v] = {"em": banco.agora_iso(), "nota": corpo.nota}
        with con:
            con.execute("UPDATE projetos SET dados=?, atualizado=? WHERE id=?", (json.dumps(dados), banco.agora_iso(), pid))
            banco.emitir(con, pid, "estado", etapa="entrega", alvo=v, mensagem=f"Corta! Versão {v} aprovada. Virou caso de referência da casa.")
        return {"aprovada": v, "caso": caso["id"]}
