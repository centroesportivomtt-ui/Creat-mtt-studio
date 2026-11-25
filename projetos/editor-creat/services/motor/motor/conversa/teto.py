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


def gasto_hoje_usd(cfg, agora: datetime | None = None) -> float:
    hoje = dia_bahia(agora)
    tot = 0.0
    for d in gastos.ler(cfg):
        if d.get("o_que") == "conversa" and _dia_da_linha(d.get("quando", "")) == hoje:
            tot += float(d.get("custo_usd") or 0)
    return round(tot, 5)


def tokens_de(texto_chars: int) -> int:
    return int(texto_chars / CARACTERES_POR_TOKEN) + 1


def pior_caso_usd(modelo: str, *, contexto_tokens: int, novos_tokens: int, recente: bool, max_saida: int = MAX_SAIDA) -> float:
    """Pior caso de UMA chamada. Com cache quente (chamada há menos de 55 min): os novos tokens são gravados no cache
    de 1 h e o resto é lido. Frio: o contexto inteiro é gravado de novo. Mais a saída inteira (max_tokens)."""
    pe, ps, pc, _pw, pw1 = orcamento.PRECOS.get(modelo, orcamento.PRECOS["claude-opus-5-5"])
    if recente:
        entrada = novos_tokens * pw1 + max(0, contexto_tokens - novos_tokens) * pc
    else:
        entrada = contexto_tokens * pw1
    return round((entrada + max_saida * ps) / 1e6, 5)


def cabe(cfg, pior: float, agora: datetime | None = None) -> tuple[bool, float]:
    hoje = gasto_hoje_usd(cfg, agora)
    return hoje + pior <= teto_usd_dia(cfg) + 1e-9, hoje
