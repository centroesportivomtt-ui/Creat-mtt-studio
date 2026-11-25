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


ETAPAS_DE_ARQUIVO = ("ingest", "analise")
FUNDO = ("entregas", "espelho")         # etapas de fundo (motor/etapas/__init__.FUNDO): fora do encadeamento do filme
ESTADOS_FINAIS = ("entregue", "erro", "reprovado_qa")


def _cerebro_fixo(d: dict) -> bool:
    """A última direção veio de um cérebro fixture (não muda nada ao 'corrigir')."""
    return str(d.get("cerebro_ultimo", "")).startswith("fixture")


def pronto_para_dirigir(con, projeto: str) -> bool:
    """Envio fechado + pedido + todo arquivo lido. Arquivo que falhou de vez (vídeo corrompido) fica de fora com aviso,
    em vez de travar o projeto para sempre; precisa sobrar pelo menos um arquivo lido."""
    d = _dados(con, projeto)
    if not d.get("envio_fechado") or not d.get("pedido"):
        return False
    r = con.execute("""SELECT SUM(estado='analisado') lidos, SUM(estado NOT IN ('analisado','falhou')) pendentes
                       FROM arquivos WHERE projeto=?""", (projeto,)).fetchone()
    return (r["pendentes"] or 0) == 0 and (r["lidos"] or 0) > 0


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
        from motor.etapas import espelho
        espelho.enfileirar(con, projeto, alvo)          # cópia no Cloudflare (desligada sem o "pode" do dono); não atrasa a edição
        tentar_dirigir(con, projeto)
    elif etapa == "catalogo":
        banco.enfileirar(con, "direcao", projeto, entrada=saida, prioridade=2)
    elif etapa == "direcao":
        versao = saida.get("versao") or "v1"
        if saida.get("cerebro"):
            d = _dados(con, projeto)
            d["cerebro_ultimo"] = saida["cerebro"]
            con.execute("UPDATE projetos SET dados=? WHERE id=?", (json.dumps(d), projeto))
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
            if _cerebro_fixo(d):
                n = MAX_CORRECOES_AUTOMATICAS   # fixture devolve a mesma direção: refazer gastaria 2 renders à toa
            if n < MAX_CORRECOES_AUTOMATICAS:
                d["correcoes_auto"] = n + 1
                con.execute("UPDATE projetos SET dados=? WHERE id=?", (json.dumps(d), projeto))
                banco.enfileirar(con, "direcao", projeto, entrada={"corrigir_qa": saida, "versao_anterior": alvo}, prioridade=1)
                banco.emitir(con, projeto, "qa_reprovado", etapa="qa", alvo=alvo, mensagem="A conferência achou problema; corrigindo sozinho.", dados=saida)
            else:
                banco.mudar_estado(con, projeto, "reprovado_qa", "A conferência reprovou e o ajuste automático não resolveu. Precisa de olho humano."
                                   if not _cerebro_fixo(d) else "A conferência reprovou (cérebro fixture não corrige sozinho). Precisa de olho humano.")
    elif etapa == "entrega":
        banco.mudar_estado(con, projeto, "entregue", "Vídeo pronto.")
        banco.emitir(con, projeto, "entregue", etapa="entrega", alvo=alvo, dados=saida)


MOTIVOS_TROCA = ("a música escolhida saiu da biblioteca", "a música nova não encaixou no filme", "pedido de troca de música inválido")


def _volta_da_troca(con, job: dict, msg: str) -> bool:
    """Troca de música que falhou de vez (onda 3): a versão de origem continua entregue e intacta, então o projeto volta para
    'entregue' com a frase do motivo, em vez de ir a 'erro' (o dono não perde a tela do filme pronto por uma troca opcional).
    Só quando a versão de origem ainda existe e está entregue; senão segue o caminho de sempre ('erro')."""
    import re
    ent = job.get("entrada")
    if isinstance(ent, str):
        try:
            ent = json.loads(ent or "{}")
        except ValueError:
            ent = {}
    tt = (ent or {}).get("trocar_trilha") if isinstance(ent, dict) else None
    if not isinstance(tt, dict):
        return False
    de = str(tt.get("de") or "")
    if not re.match(r"^v[0-9]{1,3}\Z", de):
        return False
    r = con.execute("SELECT estado FROM versoes WHERE projeto=? AND id=?", (job["projeto"], de)).fetchone()
    if r is None or r["estado"] != "entregue":
        return False
    base = (msg or "").split(":", 1)[0].strip()
    if base in MOTIVOS_TROCA or re.match(r"^a v[0-9]{1,3} não tem direção guardada\Z", base):
        motivo = base.replace(f"a {de} ", f"a {de.upper()} ")
    elif base.startswith("a direção da versão de origem ficou fora do schema"):
        motivo = f"a direção guardada da {de.upper()} não pôde ser reaproveitada"
    else:
        from motor.etapas import passos
        motivo = passos.causa(msg or "")
    frase = ("A troca de música não deu certo" + (f" ({motivo})" if motivo else "") +
             f". A {de.upper()} continua pronta e guardada; se quiser, peça outra música na conversa.")
    banco.mudar_estado(con, job["projeto"], "entregue", frase, dados={"detalhe": (msg or "")[:300]})
    return True


def falha_definitiva(con, job: dict, mensagem: str) -> None:
    """Job que não vai mais ser tentado. Arquivo: fica de fora (com aviso) e o projeto segue com o resto.
    Qualquer outra etapa: o projeto vai para 'erro' com a mensagem (o relógio do site para e o dono vê o motivo)."""
    from motor.etapas import passos
    etapa, projeto, alvo = job["etapa"], job["projeto"], job.get("alvo")
    msg = (mensagem or "").strip().splitlines()[-1][:300] if mensagem else "falhou"
    if etapa in FUNDO:                  # entregas/espelho: o filme e o original estão seguros no editor; o projeto não vai a "erro"
        from motor.backup import sem_segredo     # o detalhe técnico fica no log do servidor; o dono lê uma frase clara
        print(f"[{etapa}] {projeto}/{alvo}: {sem_segredo(msg)}", flush=True)
        o_que = "O envio para a página de entregas" if etapa == "entregas" else "A cópia do material no Cloudflare"
        banco.emitir(con, projeto, "aviso", alvo=None if alvo in (None, "-") else alvo,
                     mensagem=f"{o_que} não deu certo agora. O material está seguro no editor.")
        return
    nums = passos.numeros_do_job(con, job)
    if etapa in ETAPAS_DE_ARQUIVO and alvo not in (None, "-"):
        con.execute("UPDATE arquivos SET estado='falhou' WHERE projeto=? AND id=?", (projeto, alvo))
        nome = con.execute("SELECT nome FROM arquivos WHERE projeto=? AND id=?", (projeto, alvo)).fetchone()
        # frase para o dono (o nome do arquivo pode aparecer para ele; ao Nimbus só chega como de_fora) e o técnico recolhido
        quem = f"O vídeo {nums['n']} ({nome['nome'] if nome else alvo})" if nums.get("n") else f"O arquivo {nome['nome'] if nome else alvo}"
        banco.emitir(con, projeto, "aviso", etapa=etapa, alvo=alvo,
                     mensagem=f"{quem} não pôde ser lido e ficou de fora. O resto do material segue.", dados={"detalhe": msg})
        r = con.execute("SELECT SUM(estado='analisado') lidos, SUM(estado NOT IN ('analisado','falhou')) pendentes "
                        "FROM arquivos WHERE projeto=?", (projeto,)).fetchone()
        if (r["pendentes"] or 0) == 0 and not (r["lidos"] or 0) and _dados(con, projeto).get("envio_fechado"):
            banco.mudar_estado(con, projeto, "erro", "Nenhum arquivo do envio pôde ser lido. Mande o material de novo.")
        else:
            tentar_dirigir(con, projeto)
        return
    if etapa == "direcao" and _volta_da_troca(con, job, msg):
        return
    if etapa in ("montagem", "qa", "entrega") and alvo not in (None, "-"):
        con.execute("UPDATE versoes SET estado='erro' WHERE projeto=? AND id=? AND estado!='entregue'", (projeto, alvo))
    banco.mudar_estado(con, projeto, "erro", passos.frase_erro(etapa, n=nums.get("n"), versao=nums.get("versao"), e=msg, vai_tentar=False),
                       dados={"detalhe": msg})


def reconciliar(con) -> int:
    """Roda no start do worker. Se a máquina caiu entre 'concluir' e 'depois' (antes da transação única), um projeto
    pode ter ficado parado com o último job 'feito' e nada na fila. Para cada projeto aberto e parado, reaplica o
    'depois' do job feito mais recente (idempotente: enfileirar não duplica; etapas pulam o que já têm)."""
    n = 0
    abertos = con.execute(f"SELECT id FROM projetos WHERE estado NOT IN ({','.join('?' * len(ESTADOS_FINAIS))})", ESTADOS_FINAIS).fetchall()
    for p in abertos:
        pid = p["id"]
        ativo = con.execute("SELECT 1 FROM jobs WHERE projeto=? AND estado IN ('pendente','rodando') AND etapa NOT IN (?,?) LIMIT 1",
                            (pid, *FUNDO)).fetchone()
        if ativo:
            continue
        j = con.execute("SELECT * FROM jobs WHERE projeto=? AND estado='feito' AND etapa NOT IN (?,?) ORDER BY atualizado DESC LIMIT 1",
                        (pid, *FUNDO)).fetchone()
        if j is None:
            continue
        job = dict(j)
        job["entrada"] = json.loads(job["entrada"] or "{}")
        saida = json.loads(job["saida"]) if job.get("saida") else {}
        if job["etapa"] == "entrega":
            est = con.execute("SELECT estado FROM projetos WHERE id=?", (pid,)).fetchone()["estado"]
            if est == "dirigindo":       # o dono reprovou depois da entrega: a nova direção já foi pedida pela rota
                continue
        con.execute("BEGIN IMMEDIATE")
        try:
            depois(con, job, saida)
            con.execute("COMMIT")
        except Exception:
            con.execute("ROLLBACK")
            raise
        n += 1
    return n
