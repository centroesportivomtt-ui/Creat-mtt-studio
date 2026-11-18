# packages/schemas — contratos

| schema | quem escreve | quem lê |
|---|---|---|
| `pedido.schema.json` | site / API (`POST .../pedido`) | catálogo, direção |
| `analise.schema.json` | etapas ingest + analise (frente A) | catálogo, resolvedor, montagem |
| `catalogo.schema.json` | etapa catalogo (B) | resolvedor; o cérebro lê a forma texto |
| `direcao.schema.json` | cérebro (Claude, structured outputs) | resolvedor (B) |
| `edl.schema.json` | resolvedor (B) | montagem e QA (C) |
| `qa.schema.json` | etapa qa (C) | pipeline, site, memória |
| `evento.schema.json` | motor (banco.emitir) | site (SSE) |

Validar tudo: `python3 py/validar.py` · um arquivo: `python3 py/validar.py edl caminho.json`.
Mudança de contrato é da frente B: manter `exemplos/` válidos e rodar `services/motor/tests/test_contratos.py`.
A API HTTP está em `ARQUITETURA.md` §4.6.
