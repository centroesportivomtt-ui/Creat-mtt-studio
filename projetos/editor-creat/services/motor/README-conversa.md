# Conversa com o editor (onda 1, plano "Fio Único")

Contrato completo: `docs/plano-conversa-25-11.md`, seção 13. Código: `motor/conversa/` e `motor/api/conversa.py`.

- **Ligada por padrão** quando existe a chave do cérebro (`EDITOR_ANTHROPIC_KEY`/`ANTHROPIC_API_KEY`). A chave da tela
  (`POST /v1/conversa {ligada}`) grava `<dados>/conversa.json`. `EDITOR_CONVERSA=0` desliga no servidor.
- **Teto de US$ 3 por dia**, travado no código (`EDITOR_CONVERSA_TETO_USD_DIA` só baixa), dia da Bahia, só linhas
  `conversa` do `gastos.jsonl`, pré-voo no pior caso antes de cada chamada. Custo de cada resposta em `turno_fim.custo_usd`.
- **Ações só com o toque**: `propor_ajuste` e `propor_pedido` criam um cartão; executam no `POST .../conversa/confirmar`
  com o mesmo `entrada_hash`, guarda de estado de novo, trava por projeto e decisão única.
- **SSE v2**: `GET /v1/projetos/{pid}/eventos?v=2` traz `rascunho`, `instantaneo` e `ping` sem id. `EDITOR_SSE_NOVO=0`
  serve o gerador antigo. `?sem=tipo1,tipo2` filtra no SQL (v1 e v2).
- **Voz**: `POST .../conversa/audio` transcreve com faster-whisper local num subprocesso (`nice -n 5`, 90 s, um por vez);
  devolve o texto e não envia nada. O áudio é apagado no fim.

Rodar localmente sem rede (cérebro falso, o mesmo dos testes e do aceite do site):

```bash
cd services/motor
EDITOR_CONVERSA_CEREBRO=falso uvicorn motor.api.app:criar --factory --port 8787
curl -s localhost:8787/v1/conversa
curl -s -XPOST localhost:8787/v1/projetos -H 'content-type: application/json' -d '{"nome":"teste"}'
curl -s -XPOST localhost:8787/v1/projetos/<pid>/conversa -H 'content-type: application/json' \
  -d '{"texto":"como está o projeto?","cliente_msg_id":"m_0000001"}'
curl -N "localhost:8787/v1/projetos/<pid>/eventos?v=2&ate=5"
```

Testes: `python -m pytest -q tests/test_conversa_laco.py tests/test_conversa_api.py` (sem rede, sem chave).
O teste pago A1.14 (API real, até US$ 1) só roda com o "pode" do dono e é o portão para publicar.
