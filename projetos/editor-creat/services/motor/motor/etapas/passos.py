"""Mesa ao vivo (onda 2 da conversa, docs/plano-conversa-25-11.md, seção 7): cada passo da mesa vira um par de eventos
`passo` (início + fim/erro/interrompido) dizendo QUEM trabalha (o agente da casa sai de packages/schemas/equipe.json pela
chave), com que ferramenta e modelo, quanto tempo levou, quanto custou e o que achou, em números do código.

Regras (contrato 13.3 e D19):
- `estado` e `mensagem` do evento ficam nulos; a fase vai em `dados.fase`. `etapa`/`alvo` são os do job.
- Um passo raiz por job (chave = etapa), aberto e fechado pelo worker; os filhos (`direcao.diretor`, `qa.lufs`…) levam
  `pai`. O `custo_usd` de cada passo é o gasto feito ENQUANTO ele era o passo de dentro; o raiz leva também
  `custo_total_usd` (ele + filhos). Assim, a soma de `custo_usd` de todos os passos = o livro de gastos do projeto (A2.3).
- Fora de um job (testes chamando `conferir`, `montar`, `dirigir_e_resolver` direto) tudo aqui é nada: o passo não emite.
- Só a thread do job emite (a conexão SQLite é dela). Em outra thread, `passo()` não abre nada e o gasto cai no passo de
  dentro que estiver aberto. Para trabalho em paralelo (a montagem), `inicio()`/`fim()` emitem da thread do job com o
  tempo medido de cada parte.
- Emitir nunca derruba a etapa: erro de banco aqui vira log.
"""
from __future__ import annotations

import contextlib
import json
import logging
import secrets
import threading
import time

from motor import banco

log = logging.getLogger("motor.passos")

LIMITE_ACHADO = 280
_trava = threading.RLock()
_job: dict | None = None          # {"con", "projeto", "etapa", "alvo", "thread", "heranca", "raiz"}
_pilha: list["Passo"] = []

# o que NÃO é gasto de mesa (vai ao livro fora de job sem aviso): conversa, regra, autotestes
_FORA_DA_MESA = ("conversa", "regra", "direcao_autoteste", "olho_ia_autoteste", "chave_teste")


class Passo:
    def __init__(self, chave: str, pai: str | None = None, *, ferramenta: str | None = None, modelo: str | None = None,
                 esforco: str | None = None, numeros: dict | None = None, falso: bool = False):
        self.id = "ps_" + secrets.token_hex(5)
        self.chave = chave[:60]
        self.pai = pai
        self.t0 = time.time()
        self.ferramenta = ferramenta
        self.modelo = modelo
        self.esforco = esforco if esforco in ("low", "medium", "high") else None
        self.numeros: dict = {}
        self.anotar(**(numeros or {}))
        self.achado: str | None = None
        self.custo = 0.0
        self.custo_filhos = 0.0
        self.estimado = False
        self.tokens = {"entrada": 0, "cache_lida": 0, "cache_escrita": 0, "saida": 0}
        self.contas: list[str] = []
        self.falso = falso           # fora de job: ninguém emite, mas o código que anota não precisa saber

    def anotar(self, **numeros) -> "Passo":
        for k, v in numeros.items():
            if isinstance(v, bool) or v is None:
                continue
            if isinstance(v, (int, float)):
                self.numeros[k] = round(v, 2) if isinstance(v, float) else v
            elif isinstance(v, str):
                self.numeros[k] = v[:80]
        return self

    def achou(self, texto: str | None) -> "Passo":
        if texto:
            t = " ".join(str(texto).split())
            self.achado = t if len(t) <= LIMITE_ACHADO else t[:LIMITE_ACHADO - 1] + "…"
        return self

    def somar(self, uso: dict) -> None:
        self.custo = round(self.custo + float(uso.get("custo_usd", 0) or 0), 5)
        self.estimado = self.estimado or bool(uso.get("estimado"))
        self.tokens["entrada"] += int(uso.get("entrada", 0) or 0)
        self.tokens["cache_lida"] += int(uso.get("entrada_cache", 0) or 0)
        self.tokens["cache_escrita"] += int(uso.get("cache_escrito", 0) or 0) + int(uso.get("cache_escrito_1h", 0) or 0)
        self.tokens["saida"] += int(uso.get("saida", 0) or 0)
        if uso.get("modelo") and not self.modelo:
            self.modelo = str(uso["modelo"])[:60]
        if uso.get("esforco") in ("low", "medium", "high") and not self.esforco:
            self.esforco = uso["esforco"]
        c = conta(uso)
        if c:
            self.contas.append(c)

    def _base(self, fase: str) -> dict:
        d = {"passo": self.id, **({"pai": self.pai} if self.pai else {}), "chave": self.chave, "fase": fase}
        for k in ("ferramenta", "modelo", "esforco"):
            v = getattr(self, k)
            if v:
                d[k] = v
        return d

    def dados_inicio(self) -> dict:
        d = self._base("inicio")
        if self.numeros:
            d["numeros"] = dict(self.numeros)
        return d

    def dados_fim(self, fase: str, s: float | None = None) -> dict:
        d = self._base(fase)
        d["s"] = round(max(0.0, time.time() - self.t0 if s is None else s), 2)
        if self.custo > 0:
            d["custo_usd"] = round(self.custo, 5)
        if self.estimado and self.custo > 0:
            d["estimado"] = True
        if any(self.tokens.values()):
            d["tokens"] = dict(self.tokens)
        if self.contas:
            d["conta"] = " + ".join(self.contas)[:400]
        if self.numeros:
            d["numeros"] = dict(self.numeros)
        if self.achado:
            d["achado"] = self.achado
        return d


def conta(uso: dict) -> str | None:
    """A conta escrita de uma chamada paga, com os preços do código (orcamento.PRECOS): o dono confere de onde saiu o centavo."""
    try:
        from motor.cerebro import orcamento
        custo = float(uso.get("custo_usd", 0) or 0)
        if custo <= 0:
            return None
        m = str(uso.get("modelo") or "")
        if m not in orcamento.PRECOS:
            return f"US$ {custo:.4f}".replace(".", ",") + (" (estimado)" if uso.get("estimado") else "")
        pe, ps, pc, pw, pw1 = orcamento.PRECOS[m]
        partes = []
        for n, preco, rot in ((int(uso.get("entrada", 0) or 0), pe, "novos"), (int(uso.get("entrada_cache", 0) or 0), pc, "do cache"),
                              (int(uso.get("cache_escrito", 0) or 0), pw, "no cache"), (int(uso.get("cache_escrito_1h", 0) or 0), pw1, "no cache de 1 h"),
                              (int(uso.get("saida", 0) or 0), ps, "de saída")):
            if n:
                partes.append(f"{n:,} {rot} × {preco:g}".replace(",", "."))
        txt = f"{m}: ({' + '.join(partes) or '0'}) ÷ 1.000.000 = US$ {custo:.4f}".replace("US$ 0.", "US$ 0,")
        return txt + (" (estimado)" if uso.get("estimado") else "")
    except Exception:  # noqa: BLE001
        return None


# ---------------- emissão ----------------
def _na_thread_do_job() -> bool:
    return _job is not None and threading.get_ident() == _job["thread"]


def _emitir(dados: dict) -> None:
    j = _job
    if j is None:
        return
    try:
        banco.emitir(j["con"], j["projeto"], "passo", etapa=j["etapa"], alvo=j["alvo"], dados=dados)
    except Exception as e:  # noqa: BLE001 - a mesa ao vivo é janela, nunca trava a etapa
        log.warning("passo %s não foi emitido: %s", dados.get("chave"), e)


def abrir_raiz(con, job: dict, numeros: dict | None = None) -> Passo:
    """Chamado pelo worker antes de rodar o job. Passos abertos de uma tentativa anterior do MESMO job viram 'interrompido'."""
    global _job
    alvo = None if job.get("alvo") in (None, "-") else job.get("alvo")
    with _trava:
        _pilha.clear()
        fechar_abertos(con, job["projeto"], etapa=job["etapa"], alvo=alvo, so_sem_job_rodando=False)
        heranca = {k: v for k, v in (numeros or {}).items() if k in ("n", "versao")}
        raiz = Passo(job["etapa"], ferramenta=None, numeros=numeros)
        _job = {"con": con, "projeto": job["projeto"], "etapa": job["etapa"], "alvo": alvo, "thread": threading.get_ident(),
                "heranca": heranca, "raiz": raiz, "soltos": []}
        _pilha.append(raiz)
        _emitir(raiz.dados_inicio())
        return raiz


def fechar_raiz(fase: str = "fim", achado: str | None = None) -> None:
    """Fecha o passo raiz (fim ou erro). Pode ser chamado de novo se a transação da primeira vez voltou atrás:
    só a última chegada ao banco fica."""
    with _trava:
        j = _job
        if j is None:
            return
        raiz = j["raiz"]
        if achado:
            raiz.achou(achado)
        for p in list(j["soltos"]):          # parte em paralelo que não fechou (a etapa quebrou antes): não fica pulsando
            _emitir(p.dados_fim("erro" if fase == "erro" else "interrompido"))
        d = raiz.dados_fim(fase)
        total = round(raiz.custo + raiz.custo_filhos, 5)
        if total > 0:
            d["custo_total_usd"] = total
        _emitir(d)


def soltar() -> None:
    """Fim do job (sempre, no finally do worker): nada daqui vaza para o próximo."""
    global _job
    with _trava:
        _job = None
        _pilha.clear()


def raiz() -> Passo | None:
    return _job["raiz"] if _job else None


def inicio(chave: str, *, ferramenta: str | None = None, modelo: str | None = None, esforco: str | None = None, **numeros) -> Passo:
    """Passo fora da pilha (partes em paralelo). Fecha com fim(p, s=<tempo medido>)."""
    with _trava:
        if not _na_thread_do_job():
            return Passo(chave, falso=True, numeros=numeros)
        pai = _pilha[-1].id if _pilha else None
        p = Passo(chave, pai, ferramenta=ferramenta, modelo=modelo, esforco=esforco, numeros={**_job["heranca"], **numeros})
        _emitir(p.dados_inicio())
        _job["soltos"].append(p)
        return p


def fim(p: Passo, fase: str = "fim", *, s: float | None = None) -> None:
    with _trava:
        if p.falso or not _na_thread_do_job() or p not in _job["soltos"]:
            return
        _job["soltos"].remove(p)
        _emitir(p.dados_fim(fase, s))
        if _pilha and p.pai == _pilha[-1].id:
            _pilha[-1].custo_filhos = round(_pilha[-1].custo_filhos + p.custo, 5)


@contextlib.contextmanager
def passo(chave: str, *, ferramenta: str | None = None, modelo: str | None = None, esforco: str | None = None, **numeros):
    """with passos.passo("qa.lufs", nome="lufs") as p: ...; p.anotar(...); p.achou("...")"""
    with _trava:
        if not _na_thread_do_job():
            p = None
        else:
            pai = _pilha[-1].id if _pilha else None
            p = Passo(chave, pai, ferramenta=ferramenta, modelo=modelo, esforco=esforco, numeros={**_job["heranca"], **numeros})
            _pilha.append(p)
            _emitir(p.dados_inicio())
    if p is None:
        yield Passo(chave, falso=True, numeros=numeros)
        return
    fase = "fim"
    try:
        yield p
    except BaseException as e:
        fase = "erro"
        if not p.achado:
            p.achou(frase_curta(e))
        raise
    finally:
        with _trava:
            if p in _pilha:
                _pilha.remove(p)
            _emitir(p.dados_fim(fase))
            pai = next((x for x in reversed(_pilha) if x.id == p.pai), None)
            if pai is not None:
                pai.custo_filhos = round(pai.custo_filhos + p.custo + p.custo_filhos, 5)


def anotar(**numeros) -> None:
    """Números no passo de dentro (o raiz, se não houver filho aberto)."""
    with _trava:
        if _pilha and _na_thread_do_job():
            _pilha[-1].anotar(**numeros)


def achou(texto: str | None) -> None:
    with _trava:
        if _pilha and _na_thread_do_job():
            _pilha[-1].achou(texto)


def somar_gasto(o_que: str, uso: dict) -> bool:
    """Chamado por cerebro.gastos.registrar depois de gravar a linha. True se havia passo para receber o gasto."""
    with _trava:
        if not _pilha:
            if o_que not in _FORA_DA_MESA:
                log.warning("gasto fora de passo: %s", o_que)
            return False
        _pilha[-1].somar(uso)
        return True


def emitir_decisao(versao: str, direcao: dict, critica: str) -> None:
    """O que o diretor decidiu (conceito, gancho, além do pedido, blocos, riscos, crítica): evento `decisao` (13.3)."""
    if not _na_thread_do_job():
        return
    j = _job
    try:
        banco.emitir(j["con"], j["projeto"], "decisao", etapa="direcao", alvo=versao, dados=dados_decisao(direcao, critica))
    except Exception as e:  # noqa: BLE001
        log.warning("decisão não foi emitida: %s", e)


def _texto(v, limite: int = 300) -> str:
    t = " ".join(str(v or "").split())
    return t if len(t) <= limite else t[:limite - 1] + "…"


def dados_decisao(d: dict, critica: str) -> dict:
    g = d.get("gancho")
    if isinstance(g, dict):
        partes = [str(x) for x in (g.get("texto_tela") or [])]
        troca = g.get("troca") or {}
        g = " ".join(partes) + (f" (risca {troca.get('risca')} e vira {troca.get('para')})" if troca.get("risca") and troca.get("para") else "")
    alem = d.get("alem_do_pedido")
    if isinstance(alem, list):
        alem = "; ".join(str(x) for x in alem)
    blocos = [{"id": str(b.get("id")), "funcao": str(b.get("funcao") or ""), **({"intensidade": int(b["intensidade"])} if isinstance(b.get("intensidade"), int) else {})}
              for b in (d.get("blocos") or [])[:14] if isinstance(b, dict) and b.get("id")]
    out = {"conceito": _texto(d.get("conceito")), "gancho": _texto(g), "alem_do_pedido": _texto(alem, 600),
           "riscos": [_texto(r, 200) for r in (d.get("riscos") or [])[:6]], "critica": _texto(critica, 200)}
    if blocos:
        out["blocos"] = blocos
    trilha = d.get("trilha") or {}
    if trilha.get("clima"):
        out["trilha"] = {"clima": _texto(trilha["clima"], 80), **({"drop_em": str(trilha["drop_em"])} if trilha.get("drop_em") else {})}
    return out


# ---------------- reconciliação e consulta ----------------
def _por_passo(con, projeto: str | None) -> dict[str, dict]:
    sql = "SELECT id, projeto, ts, etapa, alvo, dados FROM eventos WHERE tipo='passo'" + (" AND projeto=?" if projeto else "") + " ORDER BY id"
    por: dict[str, dict] = {}
    for r in con.execute(sql, (projeto,) if projeto else ()):
        try:
            d = json.loads(r["dados"] or "{}")
        except ValueError:
            continue
        pid = d.get("passo")
        if not pid:
            continue
        p = por.setdefault(pid, {"passo": pid, "projeto": r["projeto"], "etapa": r["etapa"], "alvo": r["alvo"], "chave": d.get("chave"),
                                 "pai": d.get("pai"), "aberto": False})
        if d.get("fase") == "inicio":
            p["aberto"], p["desde"] = True, r["ts"]
        else:
            p["aberto"] = False
    return por


def abertos(con, projeto: str) -> list[dict]:
    """Passos com início e sem fim (instantaneo.passos_abertos e 'quem está trabalhando agora')."""
    return [{"passo": p["passo"], "chave": p["chave"] or "", "desde": p.get("desde") or ""}
            for p in _por_passo(con, projeto).values() if p["aberto"]][:40]


def fechar_abertos(con, projeto: str | None = None, *, etapa: str | None = None, alvo: str | None = None,
                   so_sem_job_rodando: bool = True) -> int:
    """Todo passo aberto (de job que não está rodando, ou do job indicado) recebe `passo` com fase 'interrompido'.
    Roda no boot do worker (A2.6), quando um job é pego de novo e quando o recolhedor desiste de um job morto."""
    n = 0
    for p in _por_passo(con, projeto).values():
        if not p["aberto"]:
            continue
        if etapa is not None and (p["etapa"] != etapa or (p["alvo"] or None) != (alvo or None)):
            continue
        if so_sem_job_rodando:
            j = con.execute("SELECT estado FROM jobs WHERE projeto=? AND etapa=? AND alvo=?", (p["projeto"], p["etapa"], p["alvo"] or "-")).fetchone()
            if j is not None and j["estado"] == "rodando":
                continue
        dados = {"passo": p["passo"], **({"pai": p["pai"]} if p.get("pai") else {}), "chave": p["chave"] or p["etapa"] or "passo",
                 "fase": "interrompido"}
        banco.emitir(con, p["projeto"], "passo", etapa=p["etapa"], alvo=p["alvo"], dados=dados)
        n += 1
    return n


# ---------------- textos para o dono ----------------
_ONDE = {
    "ingest": "o recebimento do vídeo {n}", "analise": "a leitura do vídeo {n}", "catalogo": "a organização do material",
    "direcao": "a direção", "montagem": "a montagem da {versao}", "qa": "a conferência da {versao}", "entrega": "a entrega da {versao}",
}
_COMECO = {
    "ingest": "Trilho começou a receber o vídeo {n}.", "analise": "Radar começou a ouvir e olhar o vídeo {n}.",
    "catalogo": "Radar começou a organizar o material.", "direcao": "Faísca começou a dirigir o filme.",
    "montagem": "A montagem da {versao} começou: voz, planos, legendas e mix.", "qa": "Lupa começou a conferir a {versao}.",
    "entrega": "Trilho começou a entregar a {versao}.",
}


def _preencher(modelo: str, n=None, versao=None) -> str:
    t = modelo.replace("{n}", str(n) if n else "").replace("{versao}", str(versao).upper() if versao else "")
    return " ".join(t.replace(" .", ".").split()).replace("vídeo .", "vídeo.").replace("da .", ".").strip()


def mensagem_inicio(etapa: str, n=None, versao=None) -> str:
    m = _COMECO.get(etapa, "A mesa começou um passo.")
    if "{n}" in m and not n:
        m = m.replace(" {n}", "")
    if "{versao}" in m and not versao:
        m = m.replace(" da {versao}", "").replace(" a {versao}", " a versão")
    return _preencher(m, n, versao)


def causa(e: BaseException | str) -> str | None:
    """A causa em palavras do dono, quando dá para saber pelo tipo do erro."""
    nome = type(e).__name__ if isinstance(e, BaseException) else str(e).split(":", 1)[0]
    txt = str(e).lower()
    if "credit balance is too low" in txt or "insufficient credit" in txt or "billing" in txt and "anthropic" in txt:
        return "acabou o crédito da API do Claude; recarregue em console.anthropic.com, em Billing"
    if nome == "MemoryError" or "out of memory" in txt or "cannot allocate memory" in txt:
        return "faltou memória na máquina"
    if nome in ("TimeoutError", "TimeoutExpired", "ReadTimeout", "ConnectTimeout") or "timed out" in txt:
        return "demorou demais"
    if nome in ("ConnectionError", "ConnectError", "RemoteProtocolError", "APIConnectionError") or "connection" in txt:
        return "a conexão com um serviço caiu"
    if nome in ("RateLimitError", "OverloadedError", "InternalServerError") or " 529" in txt or " 429" in txt or "overloaded" in txt:
        return "o serviço do Claude estava ocupado"
    if nome in ("FileNotFoundError",) or "no such file" in txt:
        return "faltou um arquivo de trabalho"
    if nome == "CalledProcessError" or "ffmpeg" in txt:
        return "uma ferramenta de vídeo (ffmpeg) parou com erro"
    return None


def frase_curta(e: BaseException) -> str:
    c = causa(e)
    return f"Parou: {c}." if c else "Parou com um erro técnico (veja o detalhe)."


def frase_erro(etapa: str, *, n=None, versao=None, e: BaseException | str | None = None, vai_tentar: bool | None = None,
               definitivo: bool = False) -> str:
    """'A montagem da V1 parou (faltou memória na máquina); vou tentar de novo.' Nunca texto técnico na primeira camada."""
    onde = _ONDE.get(etapa, "um passo da mesa")
    if "{n}" in onde and not n:
        onde = onde.replace(" {n}", "")
    if "{versao}" in onde and not versao:
        onde = onde.replace(" da {versao}", "")
    onde = _preencher(onde, n, versao)
    c = causa(e) if e is not None and not definitivo else None
    base = onde[0].upper() + onde[1:] + " parou" + (f" ({c})" if c else "")
    if definitivo:
        return base + "."
    if vai_tentar is True:
        return base + "; vou tentar de novo."
    if vai_tentar is False:
        return base + " e não vai tentar de novo."
    return base + "."


def numeros_do_job(con, job: dict) -> dict:
    """{n} = número do vídeo na ordem do envio (nunca o nome do arquivo), {versao}, {mb}."""
    alvo = None if job.get("alvo") in (None, "-") else job.get("alvo")
    out: dict = {}
    if alvo and job.get("etapa") in ("ingest", "analise"):
        ids = [r["id"] for r in con.execute("SELECT id, bytes FROM arquivos WHERE projeto=? ORDER BY id", (job["projeto"],))]
        if alvo in ids:
            out["n"] = ids.index(alvo) + 1
        r = con.execute("SELECT bytes FROM arquivos WHERE projeto=? AND id=?", (job["projeto"], alvo)).fetchone()
        if r and (r["bytes"] or 0) >= 50_000:          # abaixo de 0,1 MB o número só confunde
            out["mb"] = round(r["bytes"] / 1e6, 1)
    elif alvo and alvo[:1] == "v":
        out["versao"] = alvo
    return out
