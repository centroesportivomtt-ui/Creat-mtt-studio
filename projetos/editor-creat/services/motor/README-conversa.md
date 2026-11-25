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

## Mesa ao vivo (onda 2)

Sem chamada nova ao Claude: o trabalho que o motor já faz fica visível.
- `motor/etapas/passos.py`: um passo raiz por job (aberto e fechado pelo `worker`), passos filhos nas etapas (`analise.transcricao`, `analise.visao`, `direcao.diretor|resolvedor|critico`, `montagem.fatos|voz|planos|overlay|mix|comp`, `qa.<checagem>`), cada um com ferramenta, modelo, esforço, tempo, tokens, custo, a conta escrita e o achado em números. Evento `passo` (fase em `dados.fase`; `estado` e `mensagem` nulos) e `decisao` (conceito, gancho, além do pedido, blocos, trilha, riscos e crítica).
- `cerebro/gastos.registrar` soma cada gasto no passo de dentro: a soma de `custo_usd` dos passos = o livro do projeto. O raiz leva `custo_total_usd`.
- Boot do worker, job pego de novo e job morto: passo aberto vira `interrompido` (nada fica pulsando). `instantaneo.passos_abertos` diz quem trabalha agora.
- Erro: `etapa_erro.mensagem` é uma frase em pt-BR ("A montagem da V1 parou (faltou memória na máquina); vou tentar de novo.") e o técnico vai em `dados.detalhe`. `etapa_inicio` ganhou mensagem ("Radar começou a ouvir e olhar o vídeo 2."). O aviso do arquivo de fora fala do vídeo pelo número e guarda o técnico à parte.
- Rótulos na tela: `packages/schemas/equipe.json` versão 2 (chaves raiz por etapa, Verbo em `montagem.fatos`, nomes das checagens do QA).
- Testes: `tests/test_mesa_ao_vivo.py` (A2.1, A2.2, A2.3, A2.6 e o resto, sem rede).
