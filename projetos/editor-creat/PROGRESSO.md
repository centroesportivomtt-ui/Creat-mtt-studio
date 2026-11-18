# PROGRESSO — Editor creat.MTT (branch claude/editor-creat, sem push)

Atualize este arquivo a cada passo concluído (a máquina reinicia sem aviso). Formato: data/hora UTC · frente · o que ficou pronto · próximo passo · comando para continuar.

## Pronto
- 18/11 · arquiteto · `ARQUITETURA.md` (estrutura, contratos, provedores, variáveis, orçamento de tokens, metas de tempo, plano da Fase 1 em 4 frentes).
- 18/11 · arquiteto · contratos JSON Schema + exemplos válidos (`packages/schemas`), validador `py/validar.py`.
- 18/11 · arquiteto · núcleo do motor: config, banco SQLite (fila por aluguel, eventos), registro de etapas, pipeline, worker, interfaces de provedor, fábrica de API. `pytest` 14 verdes (inclui ponta a ponta com etapas falsas e reinício simulado).
- 18/11 · arquiteto · motion kit V2 copiado para `packages/kit` (sem material de cliente).

## Frentes da Fase 1 (ARQUITETURA.md §11)
- [ ] A · motor: ingestão e análise — aceite `python -m motor.ferramentas.aceite_a`
- [x] B · motor: direção, schemas e memória — aceite `python -m motor.ferramentas.aceite_b` **30/30 ok** (18/11)
  - 18/11 · B · catálogo (13,6k tokens para 48 clipes / 64 min de 17/11, 70/70 falas do Marcos inteiras), resolvedor direção→EDL, cérebro fixture + Claude via API (desligado sem chave), etapas `catalogo` e `direcao`, rotas `pedido`/`reprovar`/`memoria`, memória inicial (17 regras, 7 checagens, 4 modelos, caso bastidor-creat). Tempos: catálogo+direção+resolvedor 0,29 s; conversão do legado 14 s (uma vez). Prompt 15,7k tokens, direção 1,6k. Detalhes: `services/motor/README-frente-b.md`.
  - Próximo (B): ligar o teste pago com autorização do dono; casos novos a cada filme aprovado; `count_tokens` oficial quando houver chave.
- [ ] C · motor: montagem e QA — aceite `python -m motor.ferramentas.aceite_c`
- [ ] D · site mínimo — aceite `cd apps/web && pnpm aceite`

## Notas
- O pacote `drako/turbo/` está sendo feito por outro processo: não editar; a frente C importa/copia quando estiver pronto.
- FastAPI ainda não está instalado nesta máquina (`pip install fastapi`); pytest foi instalado em 18/11.
- 18/11 · B · mudança de contrato (dona B): `direcao...falas[].corrigir` agora é lista `[{de, para}]` (structured outputs não aceitam chaves livres); `analise.derivados.trechos` opcional (material cortado em trechos). Exemplos continuam válidos; `test_fila` + `test_contratos` verdes. Novas variáveis em `.env.example`: `EDITOR_MEMORIA`, `EDITOR_TRILHAS`, `EDITOR_AUTORIZADO_PAGO`.
