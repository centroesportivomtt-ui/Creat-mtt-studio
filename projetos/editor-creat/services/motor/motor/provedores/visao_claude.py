"""Visão com Claude Haiku 5.5 olhando a folha de contato (centavos por projeto). Desligado sem ANTHROPIC_API_KEY.

Uma chamada por arquivo: folha de quadros-chave (JPG ~100 KB) + resumo compacto da transcrição e dos sinais.
Saída por structured outputs (output_config.format json_schema), effort baixo, modelo EDITOR_MODELO_LEVE.
Qualquer falha cai nos momentos heurísticos do provedor local: a leitura nunca para por causa da visão.
"""
from __future__ import annotations

import base64
import json
import logging
import pathlib

from motor.provedores.visao_local import momentos_heuristicos

log = logging.getLogger("motor.visao")

ESQUEMA_SAIDA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["resumo", "pessoas", "camera", "serve_para", "momentos"],
    "properties": {
        "resumo": {"type": "string"},
        "pessoas": {"type": "string"},
        "camera": {"type": "string"},
        "serve_para": {"type": "string"},
        "momentos": {"type": "array", "items": {
            "type": "object", "additionalProperties": False,
            "required": ["t0", "t1", "tipo", "desc", "nota", "emocao"],
            "properties": {"t0": {"type": "number"}, "t1": {"type": "number"}, "tipo": {"type": "string"},
                           "desc": {"type": "string"}, "nota": {"type": "integer"}, "emocao": {"type": "string"}}}},
    },
}

INSTRUCAO = (
    "Você cataloga material bruto de vídeo para um editor da creat.MTT (estúdio de vídeo). A imagem é uma folha de "
    "quadros-chave de UM arquivo, cada quadro com o tempo em segundos no canto. Use também a transcrição e os sinais. "
    "Devolva: resumo (1 frase), pessoas (quem/quantos, sem inventar nomes que não aparecem na fala), camera "
    "(estável/tremida/andando, plano), serve_para (uso no corte) e momentos com t0/t1 em segundos do arquivo, "
    "tipo em {fala_dono, fala_evento, broll, torcida, levantamento, emocao, premiacao, app_tela, impacto, produto, "
    "ambiente, outro}, desc de no máximo 12 palavras, nota 1-5 (5 = obrigatório no corte) e emocao (ou \"\"). "
    "Português do Brasil. Não descreva o que não está visível."
)


def contexto_texto(ctx: dict, limite: int = 2500) -> str:
    m, tr, si = ctx["midia"], ctx["transcricao"], ctx["sinais"]
    linhas = [f"duração {m['duracao']:.1f}s, {m.get('w')}x{m.get('h')}, fala {100 * (ctx.get('fala_pct') or 0):.0f}%",
              f"câmera: tremor médio {si['tremor']['media_px']} px; trechos tremidos {si['tremor'].get('trechos', [])[:6]}",
              f"cenas: {[(c['t0'], c['t1'], c['ambiente']) for c in si['cenas']][:8]}",
              f"picos de som: {ctx.get('picos', [])[:8]}",
              "falas:"]
    for s in tr["segmentos"]:
        linhas.append(f" {s['s']:.1f}-{s['e']:.1f} {s['texto']}")
    return "\n".join(linhas)[:limite]


def normalizar_saida(d: dict, dur: float, provedor: str) -> dict:
    ms = []
    for x in d.get("momentos", []):
        t0, t1 = max(0.0, float(x["t0"])), min(dur, float(x["t1"]))
        if t1 <= t0:
            continue
        ms.append({"t0": round(t0, 2), "t1": round(t1, 2), "tipo": str(x["tipo"])[:30], "desc": " ".join(str(x["desc"]).split()[:14]),
                   "nota": max(1, min(5, int(x["nota"]))), "emocao": (str(x.get("emocao") or "").strip() or None)})
    return {"provedor": provedor, "resumo": str(d.get("resumo", ""))[:400], "pessoas": str(d.get("pessoas", ""))[:200],
            "camera": str(d.get("camera", ""))[:200], "serve_para": str(d.get("serve_para", ""))[:200], "momentos": ms[:40]}


class VisaoClaude:
    nome = "claude-leve"

    def __init__(self, cfg):
        self.modelo = cfg.modelo_leve
        self.ultimo_uso: dict | None = None
        try:
            import anthropic
        except ModuleNotFoundError as e:
            raise RuntimeError("visão claude-leve precisa do pacote anthropic (pip install 'editor-motor[cerebro]')") from e
        from motor import config as _cfg
        self.cli = _cfg.cliente_anthropic().with_options(max_retries=2, timeout=120)

    def descrever(self, folha_jpg: pathlib.Path | None, tempos: list[float], contexto: dict) -> dict | None:
        dur = float(contexto["midia"]["duracao"])
        self.ultimo_uso = None                     # sem isso, um arquivo que caiu no heurístico herdava o custo do anterior
        if folha_jpg is None or not pathlib.Path(folha_jpg).is_file():
            return momentos_heuristicos(contexto)
        try:
            img = base64.standard_b64encode(pathlib.Path(folha_jpg).read_bytes()).decode()
            r = self.cli.messages.create(
                model=self.modelo, max_tokens=4000,
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": ESQUEMA_SAIDA}},
                system=INSTRUCAO,
                messages=[{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": img}},
                    {"type": "text", "text": contexto_texto(contexto)}]}],
            )
            if r.stop_reason == "refusal":
                raise RuntimeError("recusa do modelo")
            txt = next(b.text for b in r.content if b.type == "text")
            u = r.usage
            self.ultimo_uso = {"modelo": self.modelo, "entrada": u.input_tokens, "saida": u.output_tokens,
                               "custo_usd": round(u.input_tokens * 0.10e-6 + u.output_tokens * 0.50e-6, 5)}
            return normalizar_saida(json.loads(txt), dur, "claude-leve")
        except Exception as e:  # noqa: BLE001 - visão é opcional: cai no heurístico
            log.warning("visão claude-leve falhou (%s); usando heurística local", e)
            return momentos_heuristicos(contexto)
