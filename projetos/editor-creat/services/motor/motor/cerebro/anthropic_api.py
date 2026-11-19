"""Cérebro 'anthropic' (Claude via API oficial). Só liga com ANTHROPIC_API_KEY (config.provedor_efetivo) e é PAGO:
o teste real fica marcado 'pago' e só roda com a chave e a autorização do dono.

- Direção e crítica: EDITOR_MODELO_DIRECAO (claude-opus-5-5), thinking adaptativo, effort EDITOR_ESFORCO_DIRECAO (high)
  na direção e medium na crítica, streaming, structured outputs (output_config.format) com o direcao.schema.json
  sem as restrições que a API não aceita (o motor revalida com o schema completo), fallbacks "default" do servidor.
- Cache: prefixo = sistema (regras + modelos + casos) + catálogo, os dois com cache_control. A crítica reusa o mesmo
  prefixo (lido do cache a 10%) e só acrescenta a direção proposta.
- Leve: EDITOR_MODELO_LEVE (claude-haiku-5-5), effort low.
Uso gravado por chamada em uso_<n>.json: entrada, cache lido/escrito, saída e custo em US$.
"""
from __future__ import annotations

import copy
import json

from motor import config
from motor.cerebro import orcamento

BETAS = ["server-side-fallback-2026-07-01"]
_FORA = {"minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "pattern",
         "minItems", "maxItems", "uniqueItems", "default", "$schema", "$id", "title", "prefixItems"}


def _enxuto(s):
    """Contrato sem descrições e exemplos (para ir no texto do pedido quando o modo estrito não cabe)."""
    if isinstance(s, list):
        return [_enxuto(x) for x in s]
    if not isinstance(s, dict):
        return s
    return {k: _enxuto(v) for k, v in s.items() if k not in ("description", "examples", "title", "$comment")}


def _json_do_texto(t: str) -> str:
    """Tira cercas de código e texto ao redor, se o modelo puser; devolve só o objeto JSON."""
    t = (t or "").strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else t
        t = t.rsplit("```", 1)[0]
    a, b = t.find("{"), t.rfind("}")
    return t[a:b + 1] if a >= 0 and b > a else t


def esquema_para_api(s):
    """Tira do JSON Schema o que os structured outputs não aceitam e troca type:[x,null] por anyOf."""
    if isinstance(s, list):
        return [esquema_para_api(x) for x in s]
    if not isinstance(s, dict):
        return s
    out = {}
    for k, v in s.items():
        if k in _FORA:
            continue
        out[k] = esquema_para_api(v) if k in ("properties", "items", "anyOf", "allOf", "$defs", "additionalProperties") or isinstance(v, (dict, list)) else v
    if isinstance(out.get("properties"), dict):
        out["properties"] = {k: esquema_para_api(v) for k, v in s["properties"].items()}
    t = out.get("type")
    if isinstance(t, list):
        base = {k: v for k, v in out.items() if k not in ("type", "description")}
        variantes = []
        for x in t:
            if x == "null":
                variantes.append({"type": "null"})
            elif x == "object":
                variantes.append(dict(base, type="object"))
            elif x == "array":
                variantes.append(dict({k: v for k, v in base.items() if k == "items"}, type="array"))
            else:
                variantes.append(dict({k: v for k, v in base.items() if k == "enum"}, type=x))
        out = {"anyOf": variantes, **({"description": s["description"]} if "description" in s else {})}
    if out.get("type") == "object" and "additionalProperties" not in out:
        out["additionalProperties"] = False
    return out


class CerebroAnthropic:
    nome = "anthropic"

    def __init__(self, cfg=None):
        self.cfg = cfg or config.carregar()
        import anthropic  # dependência opcional: pip install 'editor-motor[cerebro]'
        self._anthropic = anthropic
        self.cli = config.cliente_anthropic()

    # --- montagem da chamada
    def _base(self, sistema: str, catalogo_txt: str, cauda: list[dict]) -> dict:
        return {
            "system": [{"type": "text", "text": sistema, "cache_control": {"type": "ephemeral"}}],
            "messages": [{"role": "user", "content": [{"type": "text", "text": "CATÁLOGO DO MATERIAL\n" + catalogo_txt, "cache_control": {"type": "ephemeral"}},
                                                      *cauda]}],
        }

    _sem_gramatica = False   # a API recusou o contrato por ser grande demais para o modo estrito: vai pelo texto + validação local

    def _chamar(self, modelo: str, esforco: str, corpo: dict, esquema: dict | None, max_tokens: int) -> tuple[str, dict]:
        if esquema is not None and not self._sem_gramatica:
            try:
                return self._chamar_uma(modelo, esforco, corpo, esquema, max_tokens, estrito=True)
            except self._anthropic.BadRequestError as e:
                if "grammar" not in str(e).lower() and "too large" not in str(e).lower():
                    raise
                type(self)._sem_gramatica = True
        return self._chamar_uma(modelo, esforco, corpo, esquema, max_tokens, estrito=False)

    def _chamar_uma(self, modelo: str, esforco: str, corpo: dict, esquema: dict | None, max_tokens: int, *, estrito: bool) -> tuple[str, dict]:
        oc = {"effort": esforco}
        if esquema is not None and estrito:
            oc["format"] = {"type": "json_schema", "schema": esquema_para_api(copy.deepcopy(esquema))}
        elif esquema is not None:
            corpo = copy.deepcopy(corpo)
            contrato = json.dumps(_enxuto(esquema_para_api(copy.deepcopy(esquema))), ensure_ascii=False, separators=(",", ":"))
            corpo["messages"][-1]["content"].append({"type": "text", "text": "Responda SOMENTE com um objeto JSON válido (sem texto antes ou depois, "
                                                     "sem cercas de código) que siga exatamente este JSON Schema:\n" + contrato})
        extra = {"betas": BETAS, "fallbacks": "default"} if modelo != self.cfg.modelo_leve else {}
        api = self.cli.beta.messages if extra else self.cli.messages
        with api.stream(model=modelo, max_tokens=max_tokens, thinking={"type": "adaptive"}, output_config=oc, **extra, **corpo) as st:
            msg = st.get_final_message()
        if msg.stop_reason == "refusal":
            raise RuntimeError(f"o modelo recusou a direção ({getattr(msg, 'stop_details', None)})")
        if msg.stop_reason == "max_tokens":
            raise RuntimeError("a direção estourou max_tokens")
        texto = _json_do_texto(next((b.text for b in msg.content if getattr(b, "type", "") == "text"), ""))
        u = msg.usage
        uso = orcamento.uso(getattr(msg, "model", modelo), entrada=int(u.input_tokens or 0), saida=int(u.output_tokens or 0),
                            cache_lido=int(getattr(u, "cache_read_input_tokens", 0) or 0), cache_escrito=int(getattr(u, "cache_creation_input_tokens", 0) or 0),
                            estimado=False, cerebro="anthropic", esforco=esforco)
        return texto, uso

    def contar(self, *, sistema: str, catalogo_txt: str, pedido_txt: str) -> int:
        """Confirma o orçamento com a contagem oficial (uma vez por projeto)."""
        corpo = self._base(sistema, catalogo_txt, [{"type": "text", "text": pedido_txt}])
        return int(self.cli.messages.count_tokens(model=self.cfg.modelo_direcao, **corpo).input_tokens)

    # --- interface Cerebro
    def dirigir(self, *, sistema: str, catalogo_txt: str, pedido_txt: str, esquema: dict, maximo_saida: int = 4000) -> tuple[dict, dict]:
        corpo = self._base(sistema, catalogo_txt, [{"type": "text", "text": pedido_txt}])
        texto, uso = self._chamar(self.cfg.modelo_direcao, self.cfg.esforco_direcao, corpo, esquema, 32000)
        return json.loads(texto), uso

    def criticar(self, *, sistema: str, catalogo_txt: str, direcao: dict, pedido_txt: str, esquema: dict, problemas: list[str] | None = None) -> tuple[dict, dict]:
        from motor.cerebro import prompts_texto
        cauda = [{"type": "text", "text": pedido_txt},
                 {"type": "text", "text": "DIREÇÃO PROPOSTA\n" + json.dumps(direcao, ensure_ascii=False)
                  + "\n\nPROBLEMAS DO RESOLVEDOR\n" + ("\n".join(f"- {p}" for p in problemas) if problemas else "- nenhum")
                  + "\n\n" + prompts_texto("critico")}]
        texto, uso = self._chamar(self.cfg.modelo_direcao, "medium", self._base(sistema, catalogo_txt, cauda), esquema, 32000)
        return json.loads(texto), uso

    def leve(self, *, tarefa: str, texto: str, esquema: dict | None = None) -> tuple[dict | str, dict]:
        instr = {"reprovacao": "O dono da creat.MTT reprovou uma versão com o motivo abaixo. Transforme em UMA regra de direção curta e UMA checagem verificável. "
                               "Se for erro de palavra, use legenda_proibida com a palavra errada e preencha vocabulario {de, para}.",
                 "tipo_video": "Classifique o pedido em um tipo: evento, empresa, daily_vlog, anuncio, depoimento, bastidor. Responda só o tipo.",
                 "legenda_post": "Escreva a legenda do post do Instagram em português do Brasil, até 300 caracteres, terminando com @creat.mtt."}.get(tarefa, tarefa)
        corpo = {"messages": [{"role": "user", "content": f"{instr}\n\n{texto}"}]}
        saida, uso = self._chamar(self.cfg.modelo_leve, "low", corpo, esquema, 4000)
        return (json.loads(saida) if esquema else saida.strip()), uso
