"""Encadeamento das etapas. Chamado pelo worker depois que um job termina bem.

Fluxo (ARQUITETURA.md §3):
  arquivo registrado -> ingest(arquivo) -> analise(arquivo)
  [todas as análises prontas + envio fechado + pedido] -> catalogo -> direcao -> montagem(versao) -> qa(versao)
  qa aprovado -> entrega(versao)      qa reprovado -> direcao de novo com o relatório (até 2 vezes) -> senão 'reprovado_qa'
"""
from __future__ import annotations

import json

from motor import banco

MAX_CORRECOES_AUTOMATICAS = 2


def _dados(con, projeto: str) -> dict:
    r = con.execute("SELECT dados FROM projetos WHERE id=?", (projeto,)).fetchone()
    return json.loads(r["dados"]) if r else {}


def pronto_para_dirigir(con, projeto: str) -> bool:
    d = _dados(con, projeto)
    if not d.get("envio_fechado") or not d.get("pedido"):
        return False
    pendentes = con.execute("SELECT COUNT(*) n FROM arquivos WHERE projeto=? AND estado!='analisado'", (projeto,)).fetchone()["n"]
    return pendentes == 0


def tentar_dirigir(con, projeto: str) -> bool:
    if pronto_para_dirigir(con, projeto):
        banco.enfileirar(con, "catalogo", projeto, prioridade=3)
        banco.mudar_estado(con, projeto, "dirigindo", "Material lido. Montando o catálogo para a direção.")
        return True
    return False


def depois(con, job: dict, saida: dict | None) -> None:
    etapa, projeto, alvo = job["etapa"], job["projeto"], job.get("alvo")
    saida = saida or {}
    if etapa == "ingest":
        con.execute("UPDATE arquivos SET estado='ingerido' WHERE projeto=? AND id=?", (projeto, alvo))
        banco.enfileirar(con, "analise", projeto, alvo, prioridade=4)
    elif etapa == "analise":
        con.execute("UPDATE arquivos SET estado='analisado' WHERE projeto=? AND id=?", (projeto, alvo))
        tentar_dirigir(con, projeto)
    elif etapa == "catalogo":
        banco.enfileirar(con, "direcao", projeto, entrada=saida, prioridade=2)
    elif etapa == "direcao":
        versao = saida.get("versao") or "v1"
        banco.enfileirar(con, "montagem", projeto, versao, prioridade=2)
        banco.mudar_estado(con, projeto, "montando", f"Direção pronta. Montando a versão {versao}.")
    elif etapa == "montagem":
        banco.enfileirar(con, "qa", projeto, alvo, prioridade=1)
        banco.mudar_estado(con, projeto, "conferindo", "Conferência automática (áudio, logo, legendas, zona segura).")
    elif etapa == "qa":
        if saida.get("aprovado"):
            banco.enfileirar(con, "entrega", projeto, alvo, prioridade=1)
        else:
            d = _dados(con, projeto)
            n = int(d.get("correcoes_auto", 0))
            if n < MAX_CORRECOES_AUTOMATICAS:
                d["correcoes_auto"] = n + 1
                con.execute("UPDATE projetos SET dados=? WHERE id=?", (json.dumps(d), projeto))
                banco.enfileirar(con, "direcao", projeto, entrada={"corrigir_qa": saida, "versao_anterior": alvo}, prioridade=1)
                banco.emitir(con, projeto, "qa_reprovado", etapa="qa", alvo=alvo, mensagem="A conferência achou problema; corrigindo sozinho.", dados=saida)
            else:
                banco.mudar_estado(con, projeto, "reprovado_qa", "A conferência reprovou 3 vezes. Precisa de olho humano.")
    elif etapa == "entrega":
        banco.mudar_estado(con, projeto, "entregue", "Vídeo pronto.")
        banco.emitir(con, projeto, "entregue", etapa="entrega", alvo=alvo, dados=saida)
