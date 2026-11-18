# PROGRESSO — Editor creat.MTT (branch claude/editor-creat, sem push)

Atualize este arquivo a cada passo concluído (a máquina reinicia sem aviso). Formato: data/hora UTC · frente · o que ficou pronto · próximo passo · comando para continuar.

## Pronto
- 18/11 · arquiteto · `ARQUITETURA.md` (estrutura, contratos, provedores, variáveis, orçamento de tokens, metas de tempo, plano da Fase 1 em 4 frentes).
- 18/11 · arquiteto · contratos JSON Schema + exemplos válidos (`packages/schemas`), validador `py/validar.py`.
- 18/11 · arquiteto · núcleo do motor: config, banco SQLite (fila por aluguel, eventos), registro de etapas, pipeline, worker, interfaces de provedor, fábrica de API. `pytest` 14 verdes (inclui ponta a ponta com etapas falsas e reinício simulado).
- 18/11 · arquiteto · motion kit V2 copiado para `packages/kit` (sem material de cliente).

## Frentes da Fase 1 (ARQUITETURA.md §11)
- [x] A · motor: ingestão e análise — aceite `python -m motor.ferramentas.aceite_a` **35/35 ok** (18/11)
  - 18/11 · A · provedores (armazenamento local/r2, transcrição faster-whisper sem VAD/parakeet/scribe, visão local/claude-leve/gemini), `importar.py` (Dropbox/Drive sem chave, retomável, zip de pasta), etapas `ingest` e `analise`, rotas `api/projetos.py` (projetos, arquivos, importar, fechar-envio, SSE, Range), testes `test_a_*` (pytest -m "not pago" verde). Detalhes: `services/motor/README-frente-a.md`.
  - Tempos: 5 clipes reais HEVC 4K (241 s) lidos em 49 s com 2 workers = 4,9x tempo real; ingest 0,7-1,4 s nos clipes de 8-20 s, 12 s nos de ~60 s; reexecução idempotente 0,1 s.
  - Lição: sem VAD, hotwords no Whisper criavam laço "marcos marcos" em tom/música (66 s para 20 s). Agora sem hotwords, temperatura 0 e filtros de alucinação.
  - Próximo (A): identificação de falante (Marcos/Ruan/Xande), proxy 480p na GPU, ligar claude-leve com autorização.
- [x] B · motor: direção, schemas e memória — aceite `python -m motor.ferramentas.aceite_b` **30/30 ok** (18/11)
  - 18/11 · B · catálogo (13,6k tokens para 48 clipes / 64 min de 17/11, 70/70 falas do Marcos inteiras), resolvedor direção→EDL, cérebro fixture + Claude via API (desligado sem chave), etapas `catalogo` e `direcao`, rotas `pedido`/`reprovar`/`memoria`, memória inicial (17 regras, 7 checagens, 4 modelos, caso bastidor-creat). Tempos: catálogo+direção+resolvedor 0,29 s; conversão do legado 14 s (uma vez). Prompt 15,7k tokens, direção 1,6k. Detalhes: `services/motor/README-frente-b.md`.
  - Próximo (B): ligar o teste pago com autorização do dono; casos novos a cada filme aprovado; `count_tokens` oficial quando houver chave.
- [ ] C · motor: montagem e QA — aceite `python -m motor.ferramentas.aceite_c`
- [ ] D · site mínimo — aceite `cd apps/web && pnpm aceite`

## Notas
- O pacote `drako/turbo/` está sendo feito por outro processo: não editar; a frente C importa/copia quando estiver pronto.
- FastAPI ainda não está instalado nesta máquina (`pip install fastapi`); pytest foi instalado em 18/11.
- 18/11 · B · mudança de contrato (dona B): `direcao...falas[].corrigir` agora é lista `[{de, para}]` (structured outputs não aceitam chaves livres); `analise.derivados.trechos` opcional (material cortado em trechos). Exemplos continuam válidos; `test_fila` + `test_contratos` verdes. Novas variáveis em `.env.example`: `EDITOR_MEMORIA`, `EDITOR_TRILHAS`, `EDITOR_AUTORIZADO_PAGO`.
