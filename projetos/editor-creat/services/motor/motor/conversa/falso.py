"""Cérebro roteirizado da conversa: um transporte HTTP falso por baixo do SDK oficial (AsyncAnthropic).

Sem rede e sem chave. O SDK de verdade monta a requisição e lê o stream; só o servidor é de mentira. Serve para os
testes (pytest) e para o aceite do site (EDITOR_CONVERSA_CEREBRO=falso).

O falso confere o histórico como a API confere (e devolve 400 se estiver quebrado):
- a primeira mensagem é user e os papéis alternam (nada de duas user seguidas);
- todo tool_use do assistant tem tool_result na mensagem user seguinte, e os tool_result vêm primeiro;
- nenhum tool_result sem tool_use; a última mensagem é user (sem prefill).

Roteiro: lista de passos, um por chamada. Passo = dict:
  {"blocos": [{"tipo": "thinking"|"texto"|"ferramenta", "texto": str, "nome": str, "entrada": dict, "id": str}],
   "stop": "end_turn"|"tool_use"|"max_tokens"|"refusal", "uso": {...}, "erro": 500, "atraso": 0.0, "modelo": str,
   "iteracoes": [{...usage por tentativa...}] (fallback do servidor), "cair_depois": n (o stream cai depois de n pedaços)}
ou uma função (corpo_da_requisicao) -> passo. Sem roteiro, usa o comportamento padrão (`padrao`), pensado para o
aceite do site: responde, chama ver_projeto, pergunta com botões ou propõe um ajuste conforme a mensagem.
"""
from __future__ import annotations

import asyncio
import json
import secrets
from collections import deque

import httpx2

SIG = "c2lnX2ZhbHNv"      # assinatura de mentira do bloco de thinking


class CerebroFalso:
    def __init__(self, roteiro=None, *, atraso: float = 0.0):
        self.roteiro = deque(roteiro or [])
        self.atraso = atraso
        self.pedidos: list[dict] = []         # corpos JSON recebidos (A1.5 e A1.16)
        self.brutos: list[bytes] = []

    # ---------------- conferência do histórico (o que a API recusaria) ----------------
    @staticmethod
    def conferir(corpo: dict) -> str | None:
        msgs = corpo.get("messages") or []
        if not msgs or msgs[0].get("role") != "user":
            return "messages: a primeira mensagem precisa ser user"
        if msgs[-1].get("role") != "user":
            return "messages: a última mensagem precisa ser user (sem prefill)"
        esperados: list[str] = []
        for i, m in enumerate(msgs):
            if i and m.get("role") == msgs[i - 1].get("role"):
                return f"messages.{i}: dois '{m.get('role')}' seguidos"
            cont = m.get("content")
            blocos = cont if isinstance(cont, list) else [{"type": "text", "text": cont}]
            if m.get("role") == "user":
                ids = [b.get("tool_use_id") for b in blocos if b.get("type") == "tool_result"]
                n_res = len(ids)
                if any(b.get("type") == "tool_result" for b in blocos[n_res:]):
                    return f"messages.{i}: tool_result precisa vir antes do texto"
                if sorted(ids) != sorted(esperados):
                    return f"messages.{i}: tool_use sem tool_result (esperava {esperados}, veio {ids})"
                if any(b.get("type") == "text" and not str(b.get("text", "")).strip() for b in blocos):
                    return f"messages.{i}: bloco de texto vazio"
                esperados = []
            else:
                esperados = [b.get("id") for b in blocos if b.get("type") == "tool_use"]
        return None

    # ---------------- comportamento padrão (aceite do site) ----------------
    @staticmethod
    def padrao(corpo: dict) -> dict:
        ult = corpo["messages"][-1]["content"]
        blocos = ult if isinstance(ult, list) else [{"type": "text", "text": ult}]
        texto = " ".join(b.get("text", "") for b in blocos if b.get("type") == "text").lower()
        if any(b.get("type") == "tool_result" for b in blocos) and not texto.strip():
            return {"blocos": [{"tipo": "texto", "texto": "Pronto. Olhei o projeto e está tudo no lugar. O que você quer mudar?"}]}
        if "pergunt" in texto:
            return {"blocos": [{"tipo": "texto", "texto": "Entendi: você quer que eu pergunte antes. Uma dúvida:"},
                               {"tipo": "ferramenta", "nome": "perguntar", "entrada": {
                                   "texto": "Começo pelo gancho ou pela fala do dono?", "aceita_texto": True, "sugestao": "gancho",
                                   "opcoes": [{"id": "gancho", "rotulo": "Pelo gancho", "efeito": "abre com a troca de palavra"},
                                              {"id": "fala", "rotulo": "Pela fala", "efeito": "abre com você falando"}]}}],
                    "stop": "tool_use"}
        if "ajuste" in texto:
            return {"blocos": [{"tipo": "texto", "texto": "Entendi: você quer um ajuste na versão pronta. Preparei o cartão."},
                               {"tipo": "ferramenta", "nome": "propor_ajuste", "entrada": {
                                   "versao": "v1", "o_que_mudar": "Cortar o silêncio de 0:12 a 0:14 e manter a fala do dono inteira."}}],
                    "stop": "tool_use"}
        return {"blocos": [{"tipo": "thinking", "texto": "Vou olhar o projeto antes de responder."},
                           {"tipo": "texto", "texto": "Entendi: " + (texto.strip()[:80] or "sua mensagem") + ". Vou olhar o projeto."},
                           {"tipo": "ferramenta", "nome": "ver_projeto", "entrada": {}}], "stop": "tool_use"}

    # ---------------- servidor de mentira ----------------
    def _sse(self, passo: dict, corpo: dict) -> list[bytes]:
        modelo = passo.get("modelo") or corpo.get("model") or "claude-opus-5-5"
        uso = {"input_tokens": 900, "output_tokens": 0, "cache_read_input_tokens": 20000, "cache_creation_input_tokens": 500,
               "cache_creation": {"ephemeral_5m_input_tokens": 0, "ephemeral_1h_input_tokens": 500}}
        uso.update(passo.get("uso_inicio") or {})
        saida = int((passo.get("uso") or {}).get("output_tokens", 300))
        msg = {"id": "msg_" + secrets.token_hex(8), "type": "message", "role": "assistant", "model": modelo, "content": [],
               "stop_reason": None, "stop_sequence": None, "usage": {**uso, "output_tokens": 1}}
        evs = [("message_start", {"type": "message_start", "message": msg})]
        tem_ferramenta = False
        for i, b in enumerate(passo.get("blocos", [])):
            t = b.get("tipo")
            if t == "thinking":
                evs.append(("content_block_start", {"type": "content_block_start", "index": i, "content_block": {"type": "thinking", "thinking": "", "signature": ""}}))
                evs.append(("content_block_delta", {"type": "content_block_delta", "index": i, "delta": {"type": "thinking_delta", "thinking": b.get("texto", "")}}))
                evs.append(("content_block_delta", {"type": "content_block_delta", "index": i, "delta": {"type": "signature_delta", "signature": SIG}}))
            elif t == "texto":
                evs.append(("content_block_start", {"type": "content_block_start", "index": i, "content_block": {"type": "text", "text": ""}}))
                txt = b.get("texto", "")
                passo_n = max(1, int(b.get("pedaco", 8)))
                for k in range(0, len(txt), passo_n):
                    evs.append(("content_block_delta", {"type": "content_block_delta", "index": i, "delta": {"type": "text_delta", "text": txt[k:k + passo_n]}}))
            elif t == "ferramenta":
                tem_ferramenta = True
                tid = b.get("id") or ("toolu_" + secrets.token_hex(8))
                evs.append(("content_block_start", {"type": "content_block_start", "index": i,
                                                    "content_block": {"type": "tool_use", "id": tid, "name": b["nome"], "input": {}}}))
                bruto = b.get("bruto") if "bruto" in b else json.dumps(b.get("entrada", {}), ensure_ascii=False)
                if bruto:
                    evs.append(("content_block_delta", {"type": "content_block_delta", "index": i, "delta": {"type": "input_json_delta", "partial_json": bruto}}))
            evs.append(("content_block_stop", {"type": "content_block_stop", "index": i}))
        stop = passo.get("stop") or ("tool_use" if tem_ferramenta else "end_turn")
        delta = {"type": "message_delta", "delta": {"stop_reason": stop, "stop_sequence": None}, "usage": {"output_tokens": saida}}
        if passo.get("iteracoes"):
            delta["usage"]["iterations"] = passo["iteracoes"]
        if stop == "refusal":
            delta["delta"]["stop_details"] = {"type": "refusal", "category": None, "explanation": "recusa de teste"}
        evs.append(("message_delta", delta))
        evs.append(("message_stop", {"type": "message_stop"}))
        return [f"event: {n}\ndata: {json.dumps(d, ensure_ascii=False)}\n\n".encode() for n, d in evs]

    async def _responder(self, request: httpx2.Request) -> httpx2.Response:
        bruto = await request.aread()
        corpo = json.loads(bruto)
        self.pedidos.append(corpo)
        self.brutos.append(bruto)
        erro = self.conferir(corpo)
        if erro:
            return httpx2.Response(400, json={"type": "error", "error": {"type": "invalid_request_error", "message": erro}})
        passo = self.roteiro.popleft() if self.roteiro else self.padrao
        if callable(passo):
            passo = passo(corpo)
        if passo.get("erro"):
            return httpx2.Response(int(passo["erro"]), json={"type": "error", "error": {"type": "api_error", "message": "falha de teste"}})
        pedacos = self._sse(passo, corpo)
        atraso = float(passo.get("atraso", self.atraso) or 0)
        cair = passo.get("cair_depois")

        class Fluxo(httpx2.AsyncByteStream):
            async def __aiter__(self_):
                for i, p in enumerate(pedacos):
                    if cair is not None and i >= int(cair):
                        raise httpx2.ReadError("a conexão caiu (teste)")
                    if atraso:
                        await asyncio.sleep(atraso)
                    yield p

        return httpx2.Response(200, headers={"content-type": "text/event-stream"}, stream=Fluxo())

    def cliente(self):
        import anthropic
        http = httpx2.AsyncClient(transport=httpx2.MockTransport(self._responder))
        return anthropic.AsyncAnthropic(api_key="falso", base_url="http://cerebro-falso.local", http_client=http, max_retries=0)


ATIVO: CerebroFalso | None = None


def instalar(roteiro=None, *, atraso: float = 0.0) -> CerebroFalso:
    """Testes: troca o cérebro falso ativo (a próxima chamada da conversa usa este roteiro)."""
    global ATIVO
    ATIVO = CerebroFalso(roteiro, atraso=atraso)
    return ATIVO


def cliente():
    global ATIVO
    if ATIVO is None:
        ATIVO = CerebroFalso(atraso=0.05)       # aceite do site: o texto cresce aos poucos
    return ATIVO.cliente()
