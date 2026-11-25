"""Refazer só uma etapa e trocar a música (onda 3, seções 2, 4 e 5). Uma guarda só para a tela e para a conversa (D20).

- Tela (R11/R12, api/refazer.py): o botão "Tentar de novo" e "Conferir de novo"; só a tela refaz catálogo e direção.
- Conversa (cartões propor_refazer e propor_trilha, conversa/acoes.py): montar, conferir ou entregar de novo a versão mais
  nova, ler de novo um vídeo que ficou de fora e trocar a música.

A guarda roda três vezes: ao montar a opção ou o cartão, no toque e DENTRO da transação BEGIN IMMEDIATE que grava. Só a
terceira decide (D21): o worker, a tela e a conversa rodam em threads e processos diferentes e só o SQLite serializa os três.
Duplicar job é impossível: UNIQUE (etapa, projeto, alvo) + "fila livre" lida dentro da transação.

Refazer só roda sobre o que falhou (D22): refazer o que deu certo devolveria o mesmo filme (pode_reaproveitar). A exceção é
conferir de novo em reprovado_qa, que só aparece se a chave da conferência mudou (regras apagadas ou checagens novas).
Montar, conferir, entregar de novo e a troca de música gravam correcoes_auto = 2 (D23): se a conferência reprovar, o editor
para e espera o dono, sem direção paga escondida. Nenhum job novo leva publicar_em (D24).
"""
from __future__ import annotations

import json
import os
import re
import statistics

from motor import banco
from motor.conversa import acoes

DE_TODOS = ("montagem", "conferencia", "entrega", "leitura", "catalogo", "direcao")
DE_CONVERSA = ("montagem", "conferencia", "entrega", "leitura")
ROTULO_FILA = {"catalogo": "organizando o material", "direcao": "a direção", "montagem": "a montagem", "qa": "a conferência",
               "entrega": "a entrega"}
MIN_PADRAO = {"ingest": 1, "analise": 2, "catalogo": 1, "direcao": 2, "montagem": 6, "qa": 2, "entrega": 1}
OLHO_TETO_PADRAO = 0.30
LEITURA_PADRAO = 0.05          # visão por IA de um vídeo sem histórico: valor de precaução, NÃO medido (cartão diz "até")
ATENCAO_DIRECAO = "Se a conferência reprovar, o editor pode tentar corrigir sozinho até 2 vezes, cada uma com custo de direção."
RE_V = re.compile(r"^v([0-9]{1,3})$")
RE_AID = re.compile(r"^[A-Za-z0-9_-]{1,40}$")
RE_TRILHA = re.compile(r"^[a-z0-9_-]{2,41}$")


class Recusa(Exception):
    """A guarda recusou (no toque ou dentro da transação). `porque` em pt-BR simples."""

    def __init__(self, porque: str):
        super().__init__(porque)
        self.porque = porque


# ---------------- leitura do estado ----------------
def _arm(cfg):
    from motor.api.direcao import _armazem
    return _armazem(cfg)


def _existe(arm, chave: str) -> bool:
    try:
        return bool(arm.existe(chave))
    except Exception:  # noqa: BLE001 - chave que o armazenamento recusa conta como ausente
        return False


def _texto(arm, chave: str) -> str | None:
    try:
        if not arm.existe(chave):
            return None
        return arm.caminho(chave).read_text(encoding="utf-8").strip()
    except Exception:  # noqa: BLE001
        return None


def _json(arm, chave: str):
    t = _texto(arm, chave)
    if t is None:
        return None
    try:
        return json.loads(t)
    except ValueError:
        return None


def _num(v: str | None) -> int | None:
    m = RE_V.match(v or "")
    return int(m.group(1)) if m else None


def _job(con, pid: str, etapa: str, alvo: str = "-") -> dict | None:
    r = con.execute("SELECT estado, entrada, atualizado FROM jobs WHERE projeto=? AND etapa=? AND alvo=?", (pid, etapa, alvo)).fetchone()
    if r is None:
        return None
    d = dict(r)
    try:
        d["entrada"] = json.loads(d["entrada"] or "{}")
    except ValueError:
        d["entrada"] = {}
    return d


def fila_ocupada(con, pid: str) -> str | None:
    """Etapa da edição que está pendente ou rodando no projeto (etapas de fundo não contam para refazer)."""
    q = ",".join("?" * len(acoes.ETAPAS_EDICAO))
    r = con.execute(f"SELECT etapa FROM jobs WHERE projeto=? AND etapa IN ({q}) AND estado IN ('pendente','rodando') "
                    "ORDER BY estado='rodando' DESC LIMIT 1", (pid, *acoes.ETAPAS_EDICAO)).fetchone()
    return r["etapa"] if r else None


def _frase_fila(etapa: str) -> str:
    return f"a mesa está trabalhando neste projeto agora ({ROTULO_FILA.get(etapa, etapa)}); espere terminar"


def mais_nova(con, pid: str) -> str | None:
    vs = acoes.versoes(con, pid)
    return vs[-1]["id"] if vs else None


def _arquivos(con, pid: str) -> list[dict]:
    rs = [dict(r) for r in con.execute("SELECT id, estado FROM arquivos WHERE projeto=? ORDER BY id", (pid,))]
    for n, r in enumerate(rs, 1):
        r["n_video"] = n
    return rs


def _comum(con, pid: str, v: str | None) -> str | None:
    vs = acoes.versoes(con, pid)
    alvo = next((x for x in vs if x["id"] == v), None)
    if alvo is None:
        return f"a versão {v or '(nenhuma)'} não existe" if v else "ainda não há versão deste projeto"
    nova = vs[-1]["id"]
    if nova != v:
        return f"a {v} não é a mais nova; a mais nova é a {nova}"
    if v in (acoes._dados(con, pid).get("aprovadas") or {}):
        return f"a {v} já foi aprovada"
    if alvo["estado"] == "reprovada":
        return f"a {v} foi reprovada por você; a direção nova já cuida dela"
    f = fila_ocupada(con, pid)
    if f:
        return _frase_fila(f)
    return None


def _estado_v(con, pid: str, v: str) -> str | None:
    r = con.execute("SELECT estado FROM versoes WHERE projeto=? AND id=?", (pid, v)).fetchone()
    return r["estado"] if r else None


def _chave_mudou(arm, pid: str, v: str) -> bool:
    """A conferência daria outro resultado? Mudou a chave (checagens, regras do dono, EDL) ou falta checagem no relatório.
    Sem os arquivos da conferência conta como mudou."""
    base = f"saidas/{pid}/{v}"
    sha, chave_ant, edl, qa = _texto(arm, f"{base}/qa.sha256"), _texto(arm, f"{base}/qa.chave"), _json(arm, f"{base}/edl.json"), \
        _json(arm, f"{base}/qa.json")
    if not sha or not chave_ant or edl is None or not isinstance(qa, dict):
        return True
    try:
        from motor.etapas.qa import chave_conferencia, pode_reaproveitar
        return not pode_reaproveitar(qa, chave_ant, chave_conferencia(sha, edl))
    except Exception:  # noqa: BLE001
        return True


def _pode_comecar_edicao(con, pid: str, aid: str) -> bool:
    """Se a leitura deste vídeo der certo, a edição começa sozinha? (pipeline.pronto_para_dirigir sem ele pendente)"""
    d = acoes._dados(con, pid)
    if not d.get("envio_fechado") or not d.get("pedido"):
        return False
    r = con.execute("SELECT SUM(estado NOT IN ('analisado','falhou')) pendentes FROM arquivos WHERE projeto=? AND id<>?", (pid, aid)).fetchone()
    return (r["pendentes"] or 0) == 0


def porque(cfg, con, pid: str, de: str, *, versao: str | None = None, arquivo_id: str | None = None, arm=None) -> str | None:
    """None = pode. Senão, a frase da seção 2.3 (vai para o cartão 'Não deu', para o Nimbus e para o 409 da tela)."""
    if con.execute("SELECT 1 FROM projetos WHERE id=?", (pid,)).fetchone() is None:
        return "projeto não encontrado"
    if de not in DE_TODOS:
        return "não sei refazer isso"
    arm = arm or _arm(cfg)
    if de in ("montagem", "conferencia", "entrega"):
        v = versao or mais_nova(con, pid)
        p = _comum(con, pid, v)
        if p:
            return p
        base = f"saidas/{pid}/{v}"
        if de == "montagem":
            if not _existe(arm, f"{base}/edl.json"):
                return f"a {v} não tem a direção guardada; peça um ajuste"
            if (_job(con, pid, "montagem", v) or {}).get("estado") != "falhou":
                return f"a montagem da {v} não falhou; montar de novo daria o mesmo filme"
            return None
        if de == "conferencia":
            if not (_existe(arm, f"{base}/final.mp4") and _existe(arm, f"{base}/montagem.json")):
                return f"a {v} não tem o filme montado guardado; peça um ajuste"
            falhou = (_job(con, pid, "qa", v) or {}).get("estado") == "falhou"
            segurou = (con.execute("SELECT estado FROM projetos WHERE id=?", (pid,)).fetchone()["estado"] == "reprovado_qa"
                       and _estado_v(con, pid, v) == "reprovada_qa" and _chave_mudou(arm, pid, v))
            if not (falhou or segurou):
                return f"nada mudou desde a última conferência da {v}; o resultado seria o mesmo"
            return None
        qa = _json(arm, f"{base}/qa.json")
        if not (isinstance(qa, dict) and qa.get("aprovado") is True):
            return f"a conferência reprovou a {v}; entregar assim não dá. Peça um ajuste"
        if (_job(con, pid, "entrega", v) or {}).get("estado") != "falhou":
            return f"a entrega da {v} não falhou"
        return None
    if de == "leitura":
        if not arquivo_id or not RE_AID.match(arquivo_id):
            return "diga qual vídeo"
        a = next((x for x in _arquivos(con, pid) if x["id"] == arquivo_id), None)
        if a is None:
            return "esse vídeo não existe neste projeto"
        if a["estado"] != "falhou":
            return f"o vídeo {a['n_video']} não ficou de fora"
        q = ",".join("?" * len(acoes.ETAPAS_EDICAO))
        if con.execute("SELECT 1 FROM versoes WHERE projeto=? LIMIT 1", (pid,)).fetchone() or con.execute(
                f"SELECT 1 FROM jobs WHERE projeto=? AND etapa IN ({q}) AND estado IN ('pendente','rodando','feito') LIMIT 1",
                (pid, *acoes.ETAPAS_EDICAO)).fetchone():
            return "a edição já começou; um vídeo lido agora não entra mais neste filme"
        if con.execute("SELECT 1 FROM jobs WHERE projeto=? AND alvo=? AND etapa IN ('ingest','analise') AND estado IN ('pendente','rodando') LIMIT 1",
                       (pid, arquivo_id)).fetchone():
            return f"o vídeo {a['n_video']} já está sendo lido"
        return None
    f = fila_ocupada(con, pid)
    if f:
        return _frase_fila(f)
    etapa = "catalogo" if de == "catalogo" else "direcao"
    if (_job(con, pid, etapa) or {}).get("estado") != "falhou":
        return "o catálogo não falhou" if de == "catalogo" else "a direção não falhou"
    return None


def _trilhas(cfg) -> list[dict]:
    from motor.etapas import armazem_b
    try:
        return list(armazem_b.trilhas(cfg))
    except Exception:  # noqa: BLE001 - biblioteca ilegível: nenhuma trilha pode tocar
        return []


def trilha_atual(arm, pid: str, v: str, trilhas: list[dict]) -> tuple[dict | None, dict | None]:
    """(trilha da biblioteca que a versão toca, bloco trilha da direção da versão)."""
    edl = _json(arm, f"saidas/{pid}/{v}/edl.json") or {}
    chave = (edl.get("trilha") or {}).get("chave")
    atual = next((t for t in trilhas if chave and t.get("chave") == chave), None)
    n = _num(v)
    d = _json(arm, f"projetos/{pid}/direcao_{n}.json") if n else None
    return atual, ((d or {}).get("trilha") if isinstance(d, dict) else None)


def porque_trilha(cfg, con, pid: str, versao: str | None, trilha: str | None, *, arm=None, trilhas=None) -> str | None:
    """Guarda da troca de música (seção 2.3). Com trilha None confere só se dá para trocar por alguma."""
    if con.execute("SELECT 1 FROM projetos WHERE id=?", (pid,)).fetchone() is None:
        return "projeto não encontrado"
    v = versao or mais_nova(con, pid)
    p = _comum(con, pid, v)
    if p:
        return p
    est = _estado_v(con, pid, v)
    if est != "entregue":
        return f"a {v} ainda não foi entregue (está {est})"
    arm = arm or _arm(cfg)
    if not _existe(arm, f"projetos/{pid}/direcao_{_num(v)}.json"):
        return f"a {v} não tem direção guardada (foi montada de um roteiro fixo); peça um ajuste"
    trilhas = _trilhas(cfg) if trilhas is None else trilhas
    atual, _ = trilha_atual(arm, pid, v, trilhas)
    if trilha is None:
        if not any(t.get("id") != (atual or {}).get("id") for t in trilhas):
            return "não há outra música na biblioteca com licença registrada"
        return None
    if not RE_TRILHA.match(trilha) or not any(t.get("id") == trilha for t in trilhas):
        return "essa música não está na biblioteca (ou não tem licença registrada)"
    if atual is not None and atual.get("id") == trilha:
        return f"a {v} já usa essa música"
    return None


# ---------------- custo e tempo (números do código) ----------------
def _media_gastos(cfg, o_que: str) -> float | None:
    from motor.cerebro import gastos
    vals = [float(d.get("custo_usd") or 0) for d in gastos.ler(cfg) if d.get("o_que") == o_que]
    ult = [x for x in vals if x > 0][-5:]
    return round(statistics.mean(ult), 4) if ult else None


def custo_olho(cfg) -> tuple[float, bool]:
    """(US$, é teto?) do olho de IA da conferência: 0 sem chave do cérebro ou com EDITOR_REVISAO_IA=0; senão a média das 5
    últimas; sem histórico, o teto por versão (EDITOR_REVISAO_TETO_USD, padrão 0,30) marcado como 'até'."""
    if cfg.provedor_efetivo("cerebro") != "anthropic" or os.environ.get("EDITOR_REVISAO_IA", "1").strip() == "0":
        return 0.0, False
    m = _media_gastos(cfg, "olho_ia")
    if m is not None:
        return m, False
    try:
        teto = float(os.environ.get("EDITOR_REVISAO_TETO_USD", str(OLHO_TETO_PADRAO)) or OLHO_TETO_PADRAO)
    except ValueError:
        teto = OLHO_TETO_PADRAO
    return round(max(0.0, teto), 2), True


def _olho_em_cache(cfg, arm, pid: str, v: str) -> bool:
    import pathlib
    from motor.etapas.qa import olho_ia
    sha = _texto(arm, f"saidas/{pid}/{v}/qa.sha256")
    if not sha or not re.match(r"^[0-9a-f]{64}$", sha):
        return False
    return (pathlib.Path(cfg.dados) / "cache" / "olho" / f"{sha}.{olho_ia.VERSAO}.json").is_file()


def custo_leitura(cfg) -> tuple[float, bool]:
    if cfg.provedor_efetivo("visao") == "local":
        return 0.0, False
    m = _media_gastos(cfg, "visao_leve")
    return (m, False) if m is not None else (LEITURA_PADRAO, True)


def minutos(con, etapas: list[str], extra: float = 0.0) -> float:
    """Soma, por etapa que vai rodar, da média das 5 últimas etapa_fim (s); sem histórico, o padrão de cada etapa. Mínimo 1."""
    total = extra
    for et in etapas:
        ss = []
        for r in con.execute("SELECT dados FROM eventos WHERE tipo='etapa_fim' AND etapa=? ORDER BY id DESC LIMIT 5", (et,)):
            try:
                s = float((json.loads(r["dados"] or "{}") or {}).get("s") or 0)
            except (TypeError, ValueError):
                s = 0
            if s > 0:
                ss.append(s)
        total += statistics.mean(ss) / 60 if ss else MIN_PADRAO.get(et, 1)
    return float(max(1, round(total)))


def _conta(partes: list[tuple[str, float, bool]]) -> dict:
    vistas = [p for p in partes if p[1] > 0]
    out = {"custo_usd_est": round(sum(p[1] for p in vistas), 2), "custo_ate": any(p[2] for p in vistas)}
    if vistas:
        out["partes"] = [{"rotulo": p[0], "usd": round(p[1], 2)} for p in vistas][:4]
    return out


# ---------------- as opções (R11) e os cartões ----------------
def _opcao(cfg, con, pid: str, de: str, *, v: str | None = None, aid: str | None = None, n_video: int | None = None, arm=None) -> dict:
    o: dict = {"de": de, "pela_conversa": de in DE_CONVERSA}
    if v:
        o["versao"] = v
    if aid:
        o["arquivo_id"] = aid
    if n_video:
        o["n_video"] = n_video
    if de == "montagem":
        c, ate = custo_olho(cfg)
        o.update(titulo=f"Montar de novo a {v}", faz=f"Montar de novo a {v} com a mesma direção. Depois o editor confere e entrega sozinho.",
                 refaz=["montagem", "qa", "entrega"], minutos_est=minutos(con, ["montagem", "qa", "entrega"]),
                 volta="Nada da direção muda. Se a conferência reprovar, o editor para e espera você (não gasta com correção automática).",
                 botao="Montar de novo", **_conta([("Olhar o filme novo com IA (conferência)", c, ate)]))
    elif de in ("conferencia", "entrega"):
        c, ate = (0.0, False) if _olho_em_cache(cfg, arm or _arm(cfg), pid, v) else custo_olho(cfg)
        if de == "conferencia":
            o.update(titulo=f"Conferir de novo a {v}",
                     faz=f"Rodar a conferência automática de novo na {v}, sem montar de novo. Se aprovar, entrega sozinho.",
                     volta="O filme não muda. Se reprovar de novo, o editor para e espera você.", botao="Conferir de novo")
        else:
            o.update(titulo=f"Entregar de novo a {v}",
                     faz=f"Conferir a {v} (aproveita a conferência se nada mudou) e entregar de novo. Não publica nem manda para o cliente.",
                     volta="O filme não muda.", botao="Entregar de novo")
        o.update(refaz=["qa", "entrega"], minutos_est=minutos(con, ["qa", "entrega"]), **_conta([("Olhar o filme com IA (conferência)", c, ate)]))
    elif de == "leitura":
        c, ate = custo_leitura(cfg)
        partes = [("Ler o vídeo com IA (visão)", c, ate)]
        ing = (_job(con, pid, "ingest", aid) or {}).get("estado") == "falhou"
        etapas = (["ingest"] if ing else []) + ["analise"]
        comeca = _pode_comecar_edicao(con, pid, aid)
        if comeca:
            cd, _m = acoes.custo_e_minutos(cfg, con)
            partes.append(("Direção, se a edição começar", cd, False))
            etapas += ["catalogo", "direcao", "montagem", "qa", "entrega"]
            o["atencao"] = "Se der certo e o resto já estiver lido, a edição começa sozinha. " + ATENCAO_DIRECAO
        o.update(titulo=f"Ler de novo o vídeo {n_video}",
                 faz=f"Tentar ler o vídeo {n_video} de novo: ouvir as falas e olhar os quadros. Ele ficou de fora porque não deu para ler.",
                 refaz=["leitura"], minutos_est=minutos(con, etapas), volta="Os outros vídeos não mudam.", botao="Ler de novo",
                 **_conta(partes))
    elif de == "catalogo":
        cd, _m = acoes.custo_e_minutos(cfg, con)
        o.update(titulo="Organizar o material de novo",
                 faz="Organizar o material de novo e seguir sozinho para a direção, a montagem, a conferência e a entrega.",
                 refaz=["direcao", "montagem", "qa", "entrega"], minutos_est=minutos(con, ["catalogo", "direcao", "montagem", "qa", "entrega"]),
                 atencao=ATENCAO_DIRECAO, volta="O material e o pedido não mudam.", botao="Tentar de novo",
                 **_conta([("Direção do filme", cd, False)]))
    else:   # direcao
        ent = (_job(con, pid, "direcao") or {}).get("entrada") or {}
        tt = ent.get("trocar_trilha") if isinstance(ent, dict) else None
        if isinstance(tt, dict):
            c, ate = custo_olho(cfg)
            o.update(titulo="Trocar a música de novo", faz=f"Tentar de novo a troca de música da {tt.get('de')}, sem nova direção.",
                     refaz=["encaixe", "montagem", "qa", "entrega"], minutos_est=minutos(con, ["montagem", "qa", "entrega"], 1),
                     volta="A versão de antes continua guardada. Se a conferência reprovar, o editor para e espera você.",
                     botao="Tentar de novo", **_conta([("Olhar o filme novo com IA (conferência)", c, ate)]))
        else:
            cd, _m = acoes.custo_e_minutos(cfg, con)
            o.update(titulo="Tentar a direção de novo",
                     faz="Pedir a direção de novo com o mesmo material e o mesmo pedido. Depois o editor monta, confere e entrega sozinho.",
                     refaz=["direcao", "montagem", "qa", "entrega"], minutos_est=minutos(con, ["direcao", "montagem", "qa", "entrega"]),
                     atencao=ATENCAO_DIRECAO, volta="O material e o pedido não mudam.", botao="Tentar de novo",
                     **_conta([("Direção do filme", cd, False)]))
    return o


def opcoes(cfg, con, pid: str) -> dict:
    """R11: tudo o que dá para refazer agora (cada opção já passou na guarda) e a sugerida para o botão "Tentar de novo"."""
    if con.execute("SELECT 1 FROM projetos WHERE id=?", (pid,)).fetchone() is None:
        raise Recusa("projeto não encontrado")
    arm = _arm(cfg)
    out: list[dict] = []
    v = mais_nova(con, pid)
    if v:
        for de in ("montagem", "conferencia", "entrega"):
            if porque(cfg, con, pid, de, versao=v, arm=arm) is None:
                out.append(_opcao(cfg, con, pid, de, v=v, arm=arm))
    for a in _arquivos(con, pid):
        if a["estado"] == "falhou" and porque(cfg, con, pid, "leitura", arquivo_id=a["id"], arm=arm) is None:
            out.append(_opcao(cfg, con, pid, "leitura", aid=a["id"], n_video=a["n_video"], arm=arm))
    for de in ("catalogo", "direcao"):
        if porque(cfg, con, pid, de, arm=arm) is None:
            out.append(_opcao(cfg, con, pid, de, arm=arm))
    return {"opcoes": out, "sugerida": _sugerida(con, pid, out)}


def _sugerida(con, pid: str, ops: list[dict]) -> int | None:
    estado = con.execute("SELECT estado FROM projetos WHERE id=?", (pid,)).fetchone()["estado"]
    if estado == "reprovado_qa":
        return next((i for i, o in enumerate(ops) if o["de"] == "conferencia"), None)
    etapa_de = {"montagem": "montagem", "conferencia": "qa", "entrega": "entrega", "catalogo": "catalogo", "direcao": "direcao",
                "leitura": None}
    melhor, quando = None, -1.0
    for i, o in enumerate(ops):
        if o["de"] == "leitura":
            r = con.execute("SELECT MAX(atualizado) t FROM jobs WHERE projeto=? AND alvo=? AND etapa IN ('ingest','analise') AND estado='falhou'",
                            (pid, o["arquivo_id"])).fetchone()
        else:
            r = con.execute("SELECT MAX(atualizado) t FROM jobs WHERE projeto=? AND etapa=? AND alvo=? AND estado='falhou'",
                            (pid, etapa_de[o["de"]], o.get("versao") or "-")).fetchone()
        t = float(r["t"]) if r and r["t"] is not None else -1.0
        if t > quando:
            melhor, quando = i, t
    return melhor if quando >= 0 else None


def cartao_refazer(cfg, con, pid: str, e: dict) -> dict:
    """Campos do cartão 'refazer' (o laço põe turno, tool_use_id e entrada_hash). Texto todo do código."""
    n_video = None
    if e["de"] == "leitura":
        n_video = next((a["n_video"] for a in _arquivos(con, pid) if a["id"] == e.get("arquivo_id")), None)
    o = _opcao(cfg, con, pid, e["de"], v=e.get("versao"), aid=e.get("arquivo_id"), n_video=n_video)
    c = {"acao": "refazer", "de": e["de"], "titulo": o["titulo"], "texto_exato": o["faz"], "faz": o["faz"], "refaz": o["refaz"],
         "comeca_agora": True, "custo_usd_est": o["custo_usd_est"], "custo_ate": o["custo_ate"], "minutos_est": o["minutos_est"],
         "vira_regra": False, "volta": o["volta"], "botao": o["botao"]}
    for k in ("versao", "arquivo_id", "n_video", "atencao", "partes"):
        if o.get(k) is not None:
            c[k] = o[k]
    return c


def _titulo(t: dict | None) -> str:
    if not t:
        return "a música atual"
    return str(t.get("titulo") or t.get("id") or "a música atual")[:80]


def cartao_trilha(cfg, con, pid: str, e: dict) -> dict:
    arm = _arm(cfg)
    v, tid = e["versao"], e["trilha"]
    trilhas = _trilhas(cfg)
    nova = next((t for t in trilhas if t.get("id") == tid), {"id": tid})
    atual, dt = trilha_atual(arm, pid, v, trilhas)
    bpm = f" ({int(round(float(nova['bpm'])))} bpm)" if nova.get("bpm") and nova.get("bpm_medido", True) else ""
    faz = f"Trocar a música da {v} por “{_titulo(nova)}”{bpm}, sem nova direção."
    atencao = "Os cortes andam até uma batida para casar com a música nova, então a duração pode mudar um pouco."
    k = len((dt or {}).get("ids") or []) if isinstance(dt, dict) else 0
    if k in (2, 3):
        atencao += f" Hoje a {v} tem {k} músicas; a versão nova fica com uma só."
    idx = _json(arm, f"projetos/{pid}/direcoes.json") or {}
    prox = max(int(idx.get("ultima") or 0), _num(v) or 0) + 1
    c_olho, ate = custo_olho(cfg)
    c = {"acao": "trilha", "versao": v, "titulo": f"Trocar a música da {v}", "texto_exato": faz, "faz": faz,
         "mudancas": [{"campo": "Música", "antes": _titulo(atual), "depois": _titulo(nova)}],
         "nao_muda": "Os mesmos trechos, falas, legendas, cor e fecho.", "atencao": atencao,
         "refaz": ["encaixe", "montagem", "qa", "entrega"], "comeca_agora": True, "minutos_est": minutos(con, ["montagem", "qa", "entrega"], 1),
         "vira_regra": False, "botao": "Trocar a música",
         "volta": (f"A {v} continua guardada e pode ser aprovada. A música nova sai na v{prox}. "
                   "Se a conferência reprovar, o editor para e espera você."),
         **_conta([("Olhar o filme novo com IA (conferência)", c_olho, ate)])}
    return c


# ---------------- execução (dentro da transação; a guarda decide aqui) ----------------
def _gravar_dados(con, pid: str, mexer) -> None:
    """projetos.dados lido e gravado à mão dentro da transação de quem chama (banco.atualizar_dados abriria outra)."""
    r = con.execute("SELECT dados FROM projetos WHERE id=?", (pid,)).fetchone()
    d = json.loads(r["dados"] or "{}") if r else {}
    mexer(d)
    con.execute("UPDATE projetos SET dados=? WHERE id=?", (json.dumps(d), pid))


def _sem_correcao_auto(d: dict) -> None:
    d["correcoes_auto"] = 2         # D23: se a conferência reprovar, o editor para e espera o dono


def executar(cfg, pid: str, de: str, *, versao: str | None = None, arquivo_id: str | None = None) -> dict:
    """Refaz uma etapa. Abre a própria conexão e a transação BEGIN IMMEDIATE; a guarda é lida de novo lá dentro.
    Recusa(porque) sem ter mudado nada."""
    arm = _arm(cfg)
    con = banco.conectar(cfg.banco)
    try:
        con.execute("BEGIN IMMEDIATE")
        try:
            v = versao or (mais_nova(con, pid) if de in ("montagem", "conferencia", "entrega") else None)
            p = porque(cfg, con, pid, de, versao=v, arquivo_id=arquivo_id, arm=arm)
            if p:
                raise Recusa(p)
            out = {"feito": True, "de": de, "alvo": v or arquivo_id or "-"}
            if de == "montagem":
                con.execute("UPDATE versoes SET estado='montando' WHERE projeto=? AND id=? AND estado='erro'", (pid, v))
                _gravar_dados(con, pid, _sem_correcao_auto)
                banco.enfileirar(con, "montagem", pid, v, prioridade=2)
                banco.mudar_estado(con, pid, "montando", f"Montando a {v} de novo, a seu pedido.")
            elif de in ("conferencia", "entrega"):
                con.execute("UPDATE versoes SET estado='montada' WHERE projeto=? AND id=? AND estado IN ('erro','reprovada_qa')", (pid, v))
                _gravar_dados(con, pid, _sem_correcao_auto)
                banco.enfileirar(con, "qa", pid, v, prioridade=1)         # D24: a conferência encadeia a entrega; nunca publica
                banco.mudar_estado(con, pid, "conferindo", f"Conferindo a {v} de novo, a seu pedido." if de == "conferencia"
                                   else f"Conferindo e entregando a {v} de novo, a seu pedido.")
            elif de == "leitura":
                n = next((a["n_video"] for a in _arquivos(con, pid) if a["id"] == arquivo_id), None)
                ing = _job(con, pid, "ingest", arquivo_id)
                if ing is not None and ing.get("estado") == "falhou":
                    con.execute("UPDATE arquivos SET estado='recebido' WHERE projeto=? AND id=?", (pid, arquivo_id))
                    banco.enfileirar(con, "ingest", pid, arquivo_id, entrada=ing.get("entrada") or {}, prioridade=5)
                else:
                    con.execute("UPDATE arquivos SET estado='ingerido' WHERE projeto=? AND id=?", (pid, arquivo_id))
                    banco.enfileirar(con, "analise", pid, arquivo_id, prioridade=4)
                frase = f"Lendo o vídeo {n} de novo, a seu pedido."
                if con.execute("SELECT estado FROM projetos WHERE id=?", (pid,)).fetchone()["estado"] == "erro":
                    banco.mudar_estado(con, pid, "lendo", frase)
                else:
                    banco.emitir(con, pid, "aviso", alvo=arquivo_id, mensagem=frase)
                out["n_video"] = n
            elif de == "catalogo":
                banco.enfileirar(con, "catalogo", pid, prioridade=3)
                banco.mudar_estado(con, pid, "dirigindo", "Organizando o material de novo, a seu pedido.")
            else:
                ent = (_job(con, pid, "direcao") or {}).get("entrada") or {}
                if isinstance(ent, dict) and ent.get("trocar_trilha"):
                    _gravar_dados(con, pid, _sem_correcao_auto)
                banco.enfileirar(con, "direcao", pid, entrada=ent if isinstance(ent, dict) else {}, prioridade=2)
                banco.mudar_estado(con, pid, "dirigindo", "Tentando a direção de novo, a seu pedido.")
            out["estado"] = con.execute("SELECT estado FROM projetos WHERE id=?", (pid,)).fetchone()["estado"]
            con.execute("COMMIT")
        except BaseException:
            con.execute("ROLLBACK")
            raise
    finally:
        con.close()
    return out


def trocar_musica(cfg, pid: str, versao: str, trilha: str) -> dict:
    """Enfileira a troca de música (job direcao com trocar_trilha). Guarda de novo dentro da transação."""
    arm = _arm(cfg)
    con = banco.conectar(cfg.banco)
    try:
        con.execute("BEGIN IMMEDIATE")
        try:
            p = porque_trilha(cfg, con, pid, versao, trilha, arm=arm)
            if p:
                raise Recusa(p)
            _gravar_dados(con, pid, _sem_correcao_auto)
            banco.enfileirar(con, "direcao", pid, entrada={"trocar_trilha": {"de": versao, "trilha": trilha}}, prioridade=1)
            banco.mudar_estado(con, pid, "dirigindo", f"Trocando a música da {versao}, sem nova direção.")
            con.execute("COMMIT")
        except BaseException:
            con.execute("ROLLBACK")
            raise
    finally:
        con.close()
    return {"feito": True, "trocando_musica": True}
