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
- [x] C · motor: montagem e QA — aceite `python -m motor.ferramentas.aceite_c` **31/31 ok** (18/11)
  - 18/11 · C · kit com captura por beginFrame e `--workers N` (índice global, quadro repetido vira link), `som.cjs` só com `MK_SOM`. Montagem como biblioteca: planos (uma decodificação do 4K, estabilização medida por plano, faixa de cor lida do arquivo), voz, trilha/SFX (SFX sintético se faltar a biblioteca), mix (-14 LUFS, pico real, ducking, folga, stems), overlay, FX, composição com áudio numa passada. QA com 14 checagens, uma por arquivo, bloqueante. Entrega amarrada ao sha256 do QA. `edl_legado` V1/V2. Rotas `versoes` e `publicar`. Testes `test_c_*` (32 verdes com o núcleo). Detalhes: `services/motor/README-frente-c.md`.
  - Tempos: sintético de 10 s pela fila (montagem+QA+entrega) em 39 s; trecho de 0 a 8 s do V2 a frio em 75 s. Planos HEVC 4K: 142 ms/quadro (antes 216). Overlay: 42,9 ms/quadro efetivos com 3 workers (antigo 185; meta 130). QA: 13 s em 10 s de filme.
  - Negativos reprovam de verdade: tom de sala com voz pega frase_repetida («pessoal que vai» 3x) e tom_sala_sem_voz (22 palavras); logo de 300 px a 1080 pega logo_100 (3,6x).
  - Próximo (C): PiP/janelas, desfoque de tela por detecção, DeepFilterNet com autorização de instalação, voz com 1 decodificação por fonte, render incremental com concat, Modal com autorização do dono.
- [x] D · site mínimo — aceite `cd apps/web && pnpm install && pnpm aceite` **18/18 ok** (18/11)
  - 18/11 · D · Next.js 15.5.28 + React 19.1.10 (versões fixas), instalado **isolado** (`apps/web/pnpm-workspace.yaml` próprio: não toca no `node_modules` do kit). Login por senha única (scrypt) + cookie HttpOnly assinado (HMAC, 30 dias, limite de tentativas, POST de outra origem recusado); servidor tus (`@tus/server` 2.4.6 + file-store) grava em `armazenamento/.envio/` e no fim move para `entrada/<p>/` e registra no motor; proxy autenticado `/api/motor/v1/...` (lista fechada, Range e SSE em streaming); telas entrar/projetos/novo/projeto (material, pedido, ilha ao vivo com o relógio dos 30 minutos, versões com player, QA e reprovar com motivo); PWA; `scripts/motor-falso.mjs` (API §4.6 simulada). Detalhes: `apps/web/README.md`.
  - Tempos do aceite (s): build 22 · envio 300 MB com interrupção e retomada 1,6-3,4 (loopback) · status até entregue 6 (motor falso, passo 450 ms) · verificação visual 4×4 telas 28 · total 76.
  - Próximo (D): `@tus/s3-store` quando `EDITOR_ARMAZENAMENTO=r2`; envio em segundo plano no celular; pedido por áudio; testar contra o motor real (A+B+C) com o mesmo `EDITOR_DADOS`.

## Notas
- O pacote `drako/turbo/` está sendo feito por outro processo: não editar; a frente C importa/copia quando estiver pronto.
- FastAPI ainda não está instalado nesta máquina (`pip install fastapi`); pytest foi instalado em 18/11.
- 18/11 · B · mudança de contrato (dona B): `direcao...falas[].corrigir` agora é lista `[{de, para}]` (structured outputs não aceitam chaves livres); `analise.derivados.trechos` opcional (material cortado em trechos). Exemplos continuam válidos; `test_fila` + `test_contratos` verdes. Novas variáveis em `.env.example`: `EDITOR_MEMORIA`, `EDITOR_TRILHAS`, `EDITOR_AUTORIZADO_PAGO`.
- 18/11 · D · `apps/web` tem `pnpm-workspace.yaml` próprio (instalação isolada); por isso o script da raiz `aceite:web` passou a ser `cd apps/web && pnpm install && pnpm aceite`. Novas variáveis só de desenvolvimento no `.env.example`: `MOTOR_FALSO_PORTA`, `MOTOR_FALSO_PASSO_MS`.
- 18/11 · C · `.env.example`: novos `EDITOR_PLANO_RAM_MB`, `EDITOR_CACHE_PLANOS_MB`, `MK_BF`, `MK_CHROME`. Núcleo e schemas não mudaram. O pacote `drako/turbo/` ainda estava vazio (só experimentos em `tmp/`): a frente C fez beginFrame, decodificação única e portão de entrega por conta própria, sem editar aquela pasta.

## Revisão do Crivo (18/11) — correções
- 18/11 · forja · itens 1-12 corrigidos (motor `d241b77`, site `096706e`); `pytest -m "not pago"` 120 ok; `tests/test_revisao_crivo.py` reproduz cada item. Aceite D 18/18.
- 18/11 · forja · aceites de novo: A 35/35 (1 de 5 rodadas 34/35 por meta de tempo sob carga), B 30/30, C 31/31 (301 s), D 18/18; pytest 121 ok.
- 18/11 · forja · E2E fase 1 pelo site (`python -m motor.ferramentas.e2e_fase1`): 14/14, relógio do dono 187 s para 22,3 s de filme (montagem 143 s, QA 32 s). Tentativa 1 reprovada no QA com razão (gancho2 fora da zona segura → kit corrigido; corte sem fecho → fixture com fecho).
- Relatório: `FASE1_RELATORIO.md`. Próximo: fase 2 (filme inteiro com cérebro real, falante, R2 direto, Modal), ver §5 do relatório.

## Fase 2 · item 5 (QA de kit) — 18/11
- Cena de estresse `packages/kit/cenas/estresse-textos-longos.json`: gancho, chip, legenda, rótulo, checklist e stats com textos longos e posições ruins. Rodada inicial: **15 falhas de zona segura** (gancho a 977 px; rótulo a x 1287; stats a x 980).
- Corrigido no kit: `gancho` aceita fonte até 34 px (antes parava em 60 e vazava); `rotulo`, `stats` e `checklist` agora prendem x e largura na zona (x 60 a 960) e o rótulo quebra linha em vez de vazar.
- Depois: `checar.cjs` na cena de estresse e na demo, **tudo dentro das regras**.
- Achado aberto: `*destaque*` só vale por palavra; `*PARA NUNCA*` (duas palavras) imprime os asteriscos. Usar `*PARA* *NUNCA*` ou suportar frase no `palavras()`.
- Lição do Reel 17/11 para o catálogo de transições: transição por luminância (`luma`) abre buracos no rosto de pessoa real (pele clara some antes da sombra). Para plano de rosto usar fusão limpa; `luma` só para cenário sem pessoa em primeiro plano.

## Identidade e modos de edição — 19/11
- Leitura do dono: o editor atende vídeos criativos, sérios, clean, ultra criação, com IA, cinema e fala. A marca principal tem que ser moderna e sóbria; o "pulo do gato" fica como camada secundária (assinatura "Pula o óbvio.", espera, avisos).
- Marca: logo creat.MTT + "EDITOR" (mono). Isotipo = o "c." da creat (anel com corte reto + ponto vermelho), `componentes/Iso.tsx`; `gato` liga as orelhas só na camada secundária. Login: "Do bruto ao filme."
- **Modo de edição** (novo campo `modo` do pedido, contrato `pedido.schema.json`): auto, criativo, ultra, cinema, ia, clean, serio, fala. O site manda no pedido; a direção recebe a instrução do estilo (`etapas/direcao.py: MODOS`). Testes: `tests/test_modos.py`. Aceite D 18/18; pytest 122 ok.
- `tests/test_c_unidades.py::test_edl_legado_v1_v2_validos` falha neste ambiente porque lê `scratchpad/drako/seg/indice.json`, que não existe mais depois que a máquina reiniciou (não é regressão; o teste depende de arquivo fora do repositório e deveria pular quando falta).
- Próximo: cada modo com seu modelo em `memoria/modelos/` (hoje só daily-vlog e anuncio-produto), a tela "Caderno da casa" (regras e treinamento visíveis ao dono) e o endereço público.
