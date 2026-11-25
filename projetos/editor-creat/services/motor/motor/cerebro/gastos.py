"""Livro de gastos do motor (fila do dono, item H): uma linha por chamada paga em `<dados>/gastos.jsonl`
(quando, serviço, o que, projeto, versão, modelo, tokens, US$). O painel do mês lê daqui.

Quem escreve: direção e crítico (etapas/direcao.py), visão leve da análise (etapas/analise.py), olho de IA
(qa/olho_ia.py) e os autotestes da saúde (cerebro/diagnostico.py). O que foi gasto ANTES do livro existir (arquivos
uso_*.json dos projetos) entra uma vez por `importar_historico`, sem duplicar (cada linha tem uma `ref`).
Gasto feito fora do editor (ElevenLabs, Higgsfield pelas sessões de trabalho) não passa por aqui.
Registrar nunca derruba quem chamou.
"""
from __future__ import annotations

import json
import logging
import os
import pathlib
import time
from collections import defaultdict

log = logging.getLogger("motor.gastos")

NOMES = {"direcao": "direção do filme", "critico": "crítico da direção", "visao_leve": "leitura do material (visão)",
         "olho_ia": "olho de IA (revisão)", "olho_ia_falhou": "olho de IA (falhou depois de cobrado, estimado)",
         "olho_ia_autoteste": "autoteste do olho de IA", "direcao_autoteste": "autoteste da direção", "chave_teste": "teste da chave",
         "conversa": "conversa com o editor", "regra": "nota virando regra (Haiku)"}


def _arq(cfg) -> pathlib.Path:
    return pathlib.Path(cfg.dados) / "gastos.jsonl"


def registrar(cfg, o_que: str, uso: dict, *, projeto: str | None = None, versao: str | None = None, servico: str = "anthropic",
              ref: str | None = None, quando: str | None = None) -> bool:
    """True se a linha entrou no livro."""
    try:
        custo = round(float(uso.get("custo_usd", 0) or 0), 5)
        if custo <= 0 and not uso.get("estimado"):
            return False                                 # cérebro fixture/sessão: nada a registrar
        linha = {"quando": quando or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "servico": servico, "o_que": o_que,
                 "projeto": projeto, "versao": versao, "modelo": uso.get("modelo"), "entrada": int(uso.get("entrada", 0) or 0),
                 "saida": int(uso.get("saida", 0) or 0), "custo_usd": custo, **({"estimado": True} if uso.get("estimado") else {}),
                 **({"ref": ref} if ref else {})}
        arq = _arq(cfg)
        arq.parent.mkdir(parents=True, exist_ok=True)
        with open(arq, "a", encoding="utf-8") as f:
            f.write(json.dumps(linha, ensure_ascii=False) + "\n")
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("gasto de %s não foi para o livro: %s", o_que, e)
        return False


def ler(cfg, mes: str | None = None) -> list[dict]:
    """Linhas do livro; mes = 'AAAA-MM' filtra."""
    arq = _arq(cfg)
    if not arq.exists():
        return []
    out = []
    for ln in arq.read_text(encoding="utf-8").splitlines():
        try:
            d = json.loads(ln)
        except ValueError:
            continue
        if isinstance(d, dict) and (not mes or str(d.get("quando", "")).startswith(mes)):
            out.append(d)
    return out


def importar_historico(cfg, arm) -> int:
    """Traz para o livro os gastos gravados antes dele (projetos/<p>/uso_<n>.json e derivados/<p>/<a>/uso_visao.json).
    Idempotente: cada linha leva a `ref` do arquivo de origem."""
    if arm is None:
        return 0
    feitas = {d.get("ref") for d in ler(cfg) if d.get("ref")}
    novas = 0

    def quando_de(chave: str) -> str:
        try:
            return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(os.path.getmtime(arm.caminho_local(chave))))
        except (OSError, Exception):  # noqa: BLE001
            return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    for chave in sorted(arm.listar("projetos/")):
        nome = chave.rsplit("/", 1)[-1]
        if not (nome.startswith("uso_") and nome.endswith(".json")) or nome == "uso_visao.json":
            continue
        try:
            u = arm.ler_json(chave)
        except Exception:  # noqa: BLE001
            continue
        projeto = chave.split("/")[1]
        for i, ch in enumerate(u.get("chamadas") or []):
            ref = f"{chave}#{i}"
            if ref in feitas:
                continue
            o_que = "critico" if ch.get("chamada") == "critico" else "direcao"
            novas += registrar(cfg, o_que, ch, projeto=projeto, versao=u.get("versao"), ref=ref, quando=quando_de(chave))
    for chave in sorted(arm.listar("derivados/")):
        if not chave.endswith("/uso_visao.json") or chave in feitas:
            continue
        try:
            u = arm.ler_json(chave)
        except Exception:  # noqa: BLE001
            continue
        novas += registrar(cfg, "visao_leve", u, projeto=chave.split("/")[1], ref=chave, quando=quando_de(chave))
    return novas


def resumo(cfg, mes: str | None = None) -> dict:
    """Painel do mês: total, por serviço, por tipo de gasto, por projeto, por dia e as últimas linhas."""
    mes = mes or time.strftime("%Y-%m", time.gmtime())
    todas = ler(cfg)
    linhas = [d for d in todas if str(d.get("quando", "")).startswith(mes)]
    meses = sorted({str(d.get("quando", ""))[:7] for d in todas if d.get("quando")}, reverse=True)

    def soma(chave, nomes=None):
        acc = defaultdict(lambda: {"custo_usd": 0.0, "chamadas": 0})
        for d in linhas:
            k = d.get(chave) or "sem projeto"
            acc[k]["custo_usd"] += float(d.get("custo_usd") or 0)
            acc[k]["chamadas"] += 1
        return sorted(({"id": k, **({"nome": nomes.get(k, k)} if nomes else {}), "custo_usd": round(v["custo_usd"], 4), "chamadas": v["chamadas"]}
                       for k, v in acc.items()), key=lambda x: -x["custo_usd"])
    total = round(sum(float(d.get("custo_usd") or 0) for d in linhas), 4)
    dias = defaultdict(float)
    for d in linhas:
        dias[str(d.get("quando", ""))[:10]] += float(d.get("custo_usd") or 0)
    return {"mes": mes, "meses": meses or [mes], "total_usd": total, "chamadas": len(linhas),
            "estimado_usd": round(sum(float(d.get("custo_usd") or 0) for d in linhas if d.get("estimado")), 4),
            "por_servico": soma("servico"), "por_tipo": soma("o_que", NOMES), "por_projeto": soma("projeto"),
            "por_dia": [{"dia": k, "custo_usd": round(v, 4)} for k, v in sorted(dias.items())],
            "ultimas": [{k: d.get(k) for k in ("quando", "o_que", "projeto", "versao", "modelo", "custo_usd", "estimado")}
                        for d in sorted(linhas, key=lambda d: str(d.get("quando", "")), reverse=True)[:30]],
            "fora_do_editor": "ElevenLabs e Higgsfield usados pelas sessões de trabalho não passam por aqui."}
