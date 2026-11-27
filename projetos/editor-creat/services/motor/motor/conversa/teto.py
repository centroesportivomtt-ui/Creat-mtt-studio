"""Teto do dia da conversa (decisão do dono, 25/11; plano D17).

- Soma só as linhas o_que='conversa' do livro (<dados>/gastos.jsonl), inclusive as estimadas.
- O dia é o da Bahia (UTC-3, sem horário de verão): a linha das 23:30 UTC de ontem é 20:30 de ontem na Bahia.
- O teto é min(EDITOR_CONVERSA_TETO_USD_DIA, 3,00): o ambiente baixa, nunca sobe (config.TETO_CONVERSA_MAX_USD).
- Pré-voo antes de CADA chamada, no pior caso: se não couber, a chamada não sai.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from motor import config
from motor.cerebro import gastos, orcamento

BAHIA = timezone(timedelta(hours=-3))
TETO_MAX_USD = config.TETO_CONVERSA_MAX_USD
MAX_SAIDA = 8000                      # max_tokens de cada chamada da conversa
CARACTERES_POR_TOKEN = 3.0            # estimativa pessimista do pré-voo (mais tokens que o orçamento da direção)


def teto_usd_dia(cfg) -> float:
    return round(min(float(cfg.teto_conversa_usd_dia), TETO_MAX_USD), 2)


def dia_bahia(agora: datetime | None = None) -> str:
    agora = agora or datetime.now(timezone.utc)
    return agora.astimezone(BAHIA).strftime("%Y-%m-%d")


def dia_vira_em(agora: datetime | None = None) -> str:
    """Próxima meia-noite da Bahia, em UTC ISO (quando o gasto do dia zera)."""
    agora = (agora or datetime.now(timezone.utc)).astimezone(BAHIA)
    amanha = (agora + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return amanha.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _dia_da_linha(quando: str) -> str | None:
    try:
        t = datetime.strptime(str(quando)[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return None
    return t.astimezone(BAHIA).strftime("%Y-%m-%d")


_CACHE: dict[str, tuple] = {}         # livro -> (mtime_ns, tamanho, dia, total): o livro só é relido quando muda


def gasto_hoje_usd(cfg, agora: datetime | None = None) -> float:
    """Soma do dia (Bahia) das linhas de conversa do livro. Relê o arquivo só quando o tamanho ou o mtime mudam
    (o livro só cresce): chamar no event loop custa um stat, não a leitura de meses de linhas."""
    hoje = dia_bahia(agora)
    arq = gastos._arq(cfg)
    try:
        st = arq.stat()
        marca = (st.st_mtime_ns, st.st_size)
    except OSError:
        marca = None
    chave = str(arq)
    c = _CACHE.get(chave)
    if marca is not None and c is not None and c[:2] == marca and c[2] == hoje:
        return c[3]
    tot = 0.0
    for d in gastos.ler(cfg):
        if d.get("o_que") == "conversa" and _dia_da_linha(d.get("quando", "")) == hoje:
            tot += float(d.get("custo_usd") or 0)
    tot = round(tot, 5)
    if marca is not None:
        _CACHE[chave] = (*marca, hoje, tot)
    return tot


def tokens_de(texto_chars: int) -> int:
    return int(texto_chars / CARACTERES_POR_TOKEN) + 1


# Modelos que o fallback do servidor (fallbacks="default") pode usar no lugar do configurado (skill claude-api,
# refusal fallbacks: alvos suportados claude-opus-4-8 e claude-opus-5). O pior caso usa o MAIOR preço entre eles.
MODELOS_FALLBACK = ("claude-opus-5", "claude-opus-4-8")


def precos_pior(modelo: str) -> tuple:
    """Preço por componente no pior caso: o maior entre o modelo configurado e os de fallback. Modelo fora da tabela
    vale o maior preço da tabela (nunca o mais barato)."""
    tabela = orcamento.PRECOS
    if modelo in tabela:
        cands = [tabela[modelo]] + [tabela[m] for m in MODELOS_FALLBACK if m in tabela]
    else:
        cands = list(tabela.values())
    return tuple(max(c[i] for c in cands) for i in range(5))


def pior_caso_usd(modelo: str, *, contexto_tokens: int, novos_tokens: int, recente: bool, max_saida: int = MAX_SAIDA) -> float:
    """Pior caso de UMA chamada. Com cache quente (chamada há menos de 55 min): os novos tokens são gravados no cache
    de 1 h e o resto é lido. Frio: o contexto inteiro é gravado de novo. Mais a saída inteira (max_tokens).
    Preço: o maior entre o modelo e os de fallback do servidor (precos_pior)."""
    pe, ps, pc, _pw, pw1 = precos_pior(modelo)
    if recente:
        entrada = novos_tokens * pw1 + max(0, contexto_tokens - novos_tokens) * pc
    else:
        entrada = contexto_tokens * pw1
    return round((entrada + max_saida * ps) / 1e6, 5)


def cabe(cfg, pior: float, agora: datetime | None = None, *, reservado: float = 0.0, nao_anotado: float = 0.0) -> tuple[bool, float]:
    """reservado: pior caso das chamadas em voo de outros turnos (ainda fora do livro); nao_anotado: gasto que o livro
    não conseguiu gravar (disco cheio, permissão) e que continua contando."""
    hoje = gasto_hoje_usd(cfg, agora) + nao_anotado
    return hoje + reservado + pior <= teto_usd_dia(cfg) + 1e-9, hoje
