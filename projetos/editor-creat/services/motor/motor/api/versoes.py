"""Rotas da frente C: versões do projeto (link, QA resumido, capa, entrega) e publicação pelo provedor.

GET  /v1/projetos/{pid}/versoes                 -> versões com estado, link, capa, QA (aprovado + falhas) e tempos da montagem
POST /v1/projetos/{pid}/versoes/{v}/publicar    {rede, quando?} -> só versão entregue e aprovada pelo QA
POST /v1/projetos/{pid}/versoes/{v}/aprovar     {nota?, cliente?} -> o dono aprova a versão entregue; vira caso de referência da
                                                casa e (com as entregas no Cloudflare ligadas) vai para a página de entregas
POST /v1/projetos/{pid}/versoes/{v}/entregas    {cliente?} -> "Tentar agora" (só versão aprovada)
GET  /v1/entregas/clientes?projeto=<pid>        -> clientes para escolher antes de aprovar + o sugerido para o projeto
GET  /v1/projetos/{pid}/versoes/{v}/segurada    -> versão segurada pela conferência: motivos em frase do dono + endereço do vídeo
GET|HEAD /v1/projetos/{pid}/versoes/{v}/segurada/video -> o filme segurado, só para assistir na tela (onda 4, D50)

Regra do dono: versão não entregue nunca sai do editor: não baixa, não tem link e não vai para o cliente. A segurada pela
conferência pode ser assistida só aqui, na tela do projeto, marcada como não entregue. Por isso a rota da segurada responde só
com a sessão do site (o proxy exige), só para `reprovada_qa`, com `no-store` e `inline`, e nunca redireciona para o R2
(`/v1/arquivos/...final.mp4` continua 403 para ela).
"""
from __future__ import annotations

import json
import pathlib
import re
from contextlib import contextmanager
from typing import Literal, Optional

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from motor import banco, config, entregas_r2

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
        dados_p = json.loads(con.execute("SELECT dados FROM projetos WHERE id=?", (pid,)).fetchone()["dados"] or "{}")
        ent_r2 = (dados_p.get("entregas") or {}) if entregas_r2.ligado() else {}
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
            # segurada pela conferência: dá para ASSISTIR na tela do projeto (rota própria), nunca baixar nem ter link
            d["segurada"] = d["estado"] == "reprovada_qa" and arm is not None and arm.existe(f"{base}/final.mp4")
            if not entregue:         # versão não entregue não tem link nem vídeo para o site: não baixa, não vai para o cliente
                d["video"] = None
            d["link"] = (d.get("link") or (arm.url(f"{base}/final.mp4") if arm is not None and arm.existe(f"{base}/final.mp4") else None)) if entregue else None
            d["capa"] = arm.url(f"{base}/capa.jpg") if arm is not None and arm.existe(f"{base}/capa.jpg") else None
            d["legenda_post"] = ent.get("legenda_post") if ent else None
            d["tempos_montagem"] = mont.get("tempos") if mont else None
            if d["id"] in ent_r2:          # só com as entregas no Cloudflare ligadas (sem as variáveis, o campo não existe)
                d["entregas"] = _entregas_publico(ent_r2[d["id"]])
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
    cliente: Optional[str] = Field(default=None, pattern=r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")   # pasta da página de entregas (?c=<cliente>)
    entregas: Optional[bool] = None      # False: aprova SEM mandar para a página de entregas (que é pública para quem tem o link)


CAMPOS_ENTREGAS = ("estado", "cliente", "nome_cliente", "painel", "video_url", "capa_url", "motivo", "proxima", "substituida_por", "em")


def _entregas_publico(e: dict) -> dict:
    out = {k: e.get(k) for k in CAMPOS_ENTREGAS if k != "nome_cliente"}
    out["nome_cliente"] = entregas_r2.nome_cliente(e.get("cliente") or entregas_r2.CLIENTE_PADRAO)
    return out


def _mandar_para_entregas(con, pid: str, v: str, cliente: str) -> dict:
    """Marca a versão como 'enviando' e põe a etapa de fundo na fila. A data da pasta é a da 1ª aprovação (fuso da Bahia):
    re-aprovar no dia seguinte cai na mesma pasta da página."""
    def mexer(d):
        d.setdefault("entregas_data", entregas_r2.hoje_bahia())
        e = d.setdefault("entregas", {}).setdefault(v, {})
        e.update(estado="enviando", cliente=cliente, motivo=None, proxima=None, proxima_ts=None, pendente_desde=None, acao="enviar")
    d = banco.atualizar_dados(con, pid, mexer)
    banco.enfileirar(con, "entregas", pid, v, entrada={"acao": "enviar"}, prioridade=6)
    return _entregas_publico(d["entregas"][v])


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
        banco.atualizar_dados(con, pid, lambda d: d.setdefault("aprovadas", {}).__setitem__(v, {"em": banco.agora_iso(), "nota": corpo.nota}))
        con.execute("UPDATE projetos SET atualizado=? WHERE id=?", (banco.agora_iso(), pid))
        banco.emitir(con, pid, "estado", etapa="entrega", alvo=v, mensagem=f"Corta! Versão {v} aprovada. Virou caso de referência da casa.")
        out = {"aprovada": v, "caso": caso["id"]}
        if entregas_r2.ligado() and corpo.entregas is not False:   # sem as variáveis, a resposta e a fila ficam iguais às de antes
            nome = con.execute("SELECT nome FROM projetos WHERE id=?", (pid,)).fetchone()["nome"]
            out["entregas"] = _mandar_para_entregas(con, pid, v, entregas_r2.escolher_cliente(corpo.cliente, pedido, nome))
        return out


class TentarEntregas(BaseModel):
    cliente: Optional[str] = Field(default=None, pattern=r"^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$")


@rotas.post("/projetos/{pid}/versoes/{v}/entregas", status_code=202)
def tentar_entregas(pid: str, v: str, corpo: Optional[TentarEntregas] = None):
    """Botão "Tentar agora" / "Tentar de novo" (e troca de cliente): só para versão aprovada pelo dono."""
    _valida(pid, v)
    if not entregas_r2.ligado():
        raise HTTPException(409, "as entregas no Cloudflare estão desligadas neste editor")
    with _ctx() as (cfg, con, arm):
        p = con.execute("SELECT nome, dados FROM projetos WHERE id=?", (pid,)).fetchone()
        if p is None:
            raise HTTPException(404, "projeto não encontrado")
        r = con.execute("SELECT estado FROM versoes WHERE projeto=? AND id=?", (pid, v)).fetchone()
        if r is None:
            raise HTTPException(404, "versão não encontrada")
        d = json.loads(p["dados"] or "{}")
        if r["estado"] != "entregue" or v not in (d.get("aprovadas") or {}):
            raise HTTPException(409, "só vai para a página de entregas a versão que você aprovou")
        atual = ((d.get("entregas") or {}).get(v) or {})
        # mesmo caminho do aprovar (normaliza e nunca deixa slug vazio virar pasta "/...")
        cliente = entregas_r2.escolher_cliente((corpo.cliente if corpo and corpo.cliente else None) or atual.get("cliente"),
                                               _ler(arm, f"projetos/{pid}/pedido.json"), p["nome"])
        return {"entregas": _mandar_para_entregas(con, pid, v, cliente)}


@rotas.get("/entregas/clientes")
def clientes_entregas(projeto: Optional[str] = None):
    """Lista para o "Vai para as entregas de: [ ▾ ]": fixos + os que já têm entrega na página (sem rede: só os fixos)."""
    if projeto is not None:
        _valida(projeto)
    slugs = list(entregas_r2.CLIENTES_FIXOS)
    if entregas_r2.ligado():
        slugs += [c for c in entregas_r2.clientes_do_indice() if c not in slugs and entregas_r2.RE_CLIENTE.match(c)]
    out = {"ligado": entregas_r2.ligado(), "clientes": [{"slug": c, "nome": entregas_r2.nome_cliente(c)} for c in slugs],
           "padrao": entregas_r2.CLIENTE_PADRAO}
    if projeto:
        with _ctx() as (cfg, con, arm):
            p = con.execute("SELECT nome, dados FROM projetos WHERE id=?", (projeto,)).fetchone()
            if p is None:
                raise HTTPException(404, "projeto não encontrado")
            d = json.loads(p["dados"] or "{}")
            ultimo = next((e.get("cliente") for e in reversed(list((d.get("entregas") or {}).values())) if e.get("cliente")), None)
            out["sugerido"] = ultimo or entregas_r2.escolher_cliente(None, _ler(arm, f"projetos/{projeto}/pedido.json"), p["nome"])
            if out["sugerido"] not in slugs:
                out["clientes"].append({"slug": out["sugerido"], "nome": entregas_r2.nome_cliente(out["sugerido"])})
    return out


# ---------------------------------------------------------------- versão segurada pela conferência (onda 4, D50/D51)
REGRA_SEGURADA = "Só para assistir aqui. Não foi entregue: não baixa, não compartilha e não vai para o cliente."
CAB_SEGURADA = {"Content-Disposition": "inline", "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow",
                "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer"}


def _segurada(con, arm, pid: str, v: str) -> str:
    """Confere tudo e devolve a chave do final.mp4 da versão segurada (404, 409 ou 410 com a frase do dono)."""
    if con.execute("SELECT 1 FROM projetos WHERE id=?", (pid,)).fetchone() is None:
        raise HTTPException(404, "projeto não encontrado")
    r = con.execute("SELECT estado FROM versoes WHERE projeto=? AND id=?", (pid, v)).fetchone()
    if r is None:
        raise HTTPException(404, "versão não encontrada")
    if r["estado"] != "reprovada_qa":
        raise HTTPException(409, "esta versão não está segurada pela conferência")
    chave = f"saidas/{pid}/{v}/final.mp4"
    if arm is None or not arm.existe(chave):
        raise HTTPException(410, "o vídeo desta versão não existe mais")
    if getattr(arm, "nome", "") != "local":       # nunca 307 para o R2: o endereço assinado viraria um link copiável
        raise HTTPException(409, "assistir a versão segurada só funciona com o armazenamento local")
    return chave


def _duracao(qa: dict | None) -> float | None:
    for c in (qa or {}).get("checagens") or []:
        val = c.get("valor") if isinstance(c, dict) else None
        if c.get("id") == "duracao" and isinstance(val, dict) and isinstance(val.get("video_s"), (int, float)):
            return round(float(val["video_s"]), 2)
    return None


@rotas.get("/projetos/{pid}/versoes/{v}/segurada")
def ver_segurada(pid: str, v: str):
    _valida(pid, v)
    from motor.api import motivos_qa
    with _ctx() as (cfg, con, arm):
        _segurada(con, arm, pid, v)
        qa = _ler(arm, f"saidas/{pid}/{v}/qa.json")
        dur = _duracao(qa)
        return {"versao": v, "estado": "reprovada_qa", "nao_entregue": True, "video": f"/v1/projetos/{pid}/versoes/{v}/segurada/video",
                "duracao": dur, "motivos": motivos_qa.motivos(qa, dur), "regra": REGRA_SEGURADA}


@rotas.get("/projetos/{pid}/versoes/{v}/segurada/video")
def video_segurada(pid: str, v: str, range: Optional[str] = Header(default=None)):
    _valida(pid, v)
    from motor.api.projetos import com_range
    with _ctx() as (cfg, con, arm):
        chave = _segurada(con, arm, pid, v)
        caminho = arm.caminho_local(chave)
    return com_range(caminho, range, "video/mp4", dict(CAB_SEGURADA))


@rotas.head("/projetos/{pid}/versoes/{v}/segurada/video")
def cabecalho_segurada(pid: str, v: str):
    _valida(pid, v)
    with _ctx() as (cfg, con, arm):
        chave = _segurada(con, arm, pid, v)
        tam = arm.tamanho(chave)
    return Response(headers={"Accept-Ranges": "bytes", "Content-Length": str(tam), "Content-Type": "video/mp4", **CAB_SEGURADA})
