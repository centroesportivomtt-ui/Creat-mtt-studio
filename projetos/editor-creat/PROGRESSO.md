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

## Receitas dos modos e Caderno da casa — 19/11
- `memoria/modos/<modo>.json` (criativo, ultra, cinema, ia, clean, serio, fala): ajustes de ritmo e trilha, transições que o modo não usa (viram corte seco), sons desligados, zoom máximo e efeito de pico. `Loja.modelo_com_modo()` aplica a receita por cima do modelo de vídeo (cópia; o arquivo do modelo não muda). A direção usa o modo do pedido.
- Resolvedor: som desligado pelo modo sai do EDL; efeito de pico desligado (fx None) não entra.
- Testes: `test_modos.py` (receitas e contrato) e `test_b_resolvedor.py::test_cada_modo_gera_edl_valido` (o mesmo material resolvido nos 7 modos, EDL válido; clean, sério e fala sem transições pesadas). pytest 123 ok (fora os 2 que dependem de arquivo do scratchpad que sumiu).
- Site: tela **Caderno da casa** (`/caderno`, link no topo): modos, regras (as do dono primeiro), checagens que seguram a entrega e vocabulário. O motor expõe `modos` em `GET /v1/memoria`; o motor falso lê a mesma pasta `memoria/`. Aceite D 18/18 (verificação visual agora inclui o caderno nas 4 configurações).
- Próximo: endereço público (domínio + armazenamento do dono) e teste com o cérebro real (chave da API e teto de gasto do dono).

## Cérebro "sessão" (sem chave de API) — 19/11
- `EDITOR_CEREBRO=sessao`: o diretor é o Claude da sessão de trabalho. Na direção, o motor grava `<dados>/diretor_sessao/<chave>.pedido.md` (sistema + catálogo + pedido + contrato) e para com "aguardando o diretor da sessão". O Claude escreve `<chave>.direcao.json`; `python -m motor.ferramentas.diretor_sessao responder <projeto>` valida contra o contrato e devolve a direção à fila. Sem custo por chamada.
- Demonstrado em 19/11 com o material sintético dos testes, modo cinema: direção escrita pela sessão passou no contrato, o resolvedor gerou EDL válido (18 s, efeitos match/fade/fade/impacto, legenda com "Ruan na filmagem" e "creat" corrigidos), custo US$ 0.
- Teste: `tests/test_cerebro_sessao.py`. pytest 131 ok.
- Limite: só funciona com uma sessão do Claude aberta acompanhando o projeto. Para o editor rodar sozinho, continua precisando da ANTHROPIC_API_KEY.

## Fechamento da fase 2 (o que dá sem conta do dono) — 19/11
- **Aprovar com a claquete:** `POST /v1/projetos/{pid}/versoes/{v}/aprovar` (só versão entregue). Marca em `projetos.dados.aprovadas` e grava o caso em `memoria/casos/<pid>-<v>/caso.json` (estrutura, gancho, modo, nota), que o diretor passa a ver nos próximos filmes do mesmo tipo. Site: botão "Aprovar" com a claquete; versão aprovada mostra "Corta! Aprovada por você. Bora postar." Teste `test_aprovar.py`; aceite D 19/19 (novo: "aprovar bate a claquete e marca a versão").
- **Voz da casa** nos textos de estado ("Pronto. Assiste e me diz: aprova ou corta." etc.) e o modo de edição aparece no projeto.
- **Testes do material real** pulam quando o scratchpad está incompleto (antes falhavam depois de limpeza). pytest 132 ok, 2 pulados; aceite B 28/28.
- **Publicação pronta:** `deploy/` com Dockerfile do motor (base Playwright 1.63 + Python + ffmpeg), do site, `docker-compose.yml` (motor, 2 workers, site, Caddy com HTTPS automático), `.env.example` e `PUBLICAR.md`. `docker compose config` ok; as imagens não foram construídas nesta máquina (disco cheio). Falta do dono: servidor, domínio e chave da API.

## Teste do cérebro real (anthropic) — 19/11, bloqueado
- O ambiente da nuvem tem `ANTHROPIC_API_KEY` cadastrada (aparece na lista de variáveis do ambiente), mas ela **não chega ao processo da sessão**: `EDITOR_CEREBRO=anthropic` chega, a chave não. Provável causa: a plataforma retira `ANTHROPIC_API_KEY` das sessões (é o nome que o próprio Claude Code usa) ou a variável foi salva depois que esta máquina subiu.
- Nenhuma chamada paga foi feita. Gasto: US$ 0.
- Saída sugerida: salvar a chave com outro nome (ex.: `EDITOR_ANTHROPIC_KEY`) e o motor ler esse nome, ou cadastrá-la como segredo de rede do host `api.anthropic.com` (o proxy injeta); depois abrir sessão nova e rodar `pytest -m pago`.
- Também visto: `test_ingest_e_analise_pela_fila` falha com `pip install -e '.[teste,cerebro]'` porque a transcrição precisa do extra `transcricao` (faster-whisper). Instalar com `.[teste,cerebro,transcricao]`. pytest sem pagos: 120 ok, 1 falha por esse motivo, 3 pulados.

## Chave da API nas sessões do Claude Code — 19/11
- Medido: o ambiente lista `ANTHROPIC_API_KEY`, mas a variável não chega às sessões (nome reservado do Claude Code). E `ANTHROPIC_BASE_URL` das sessões aponta para o proxy da própria sessão.
- Correção: o motor lê a chave em `EDITOR_ANTHROPIC_KEY` (e, no servidor próprio, também `ANTHROPIC_API_KEY`), e o cliente é criado por `config.cliente_anthropic()` sempre com `base_url=https://api.anthropic.com` (troca com `EDITOR_ANTHROPIC_URL`). Cérebro e visão usam o mesmo cliente. Teste `tests/test_chave_editor.py`. pytest 134 ok.
- Dono: renomear a variável do ambiente para `EDITOR_ANTHROPIC_KEY`.
- 19/11 · pacote de um contêiner verificado sem Docker (a máquina não tem o daemon): cópia limpa do git → `pnpm install --frozen-lockfile` + `pnpm build` ok (28 s), venv + `pip install -e '.[transcricao,cerebro,r2]'` ok (72 s), kit `npm install` ok; `iniciar.sh` com só `EDITOR_SENHA` gerou token e segredo, subiu motor, 2 workers e site: login 200 (senha errada 401), motor pelo site 200, criar projeto 201, caderno com 7 modos e 17 regras. Porta do motor configurável (`MOTOR_PORTA`); pnpm fixado em 9.15.0; `.dockerignore`.
## Primeiro trabalho real com o cérebro "sessao" — Super Kal / nutricionista, 19/11
Duas peças com o material de 14/11 (cerveja com menos calorias; tour de nutrição no supermercado). O que faltou no editor e o que virou melhoria:
- **Transcrição juntava tentativas repetidas** (sem VAD, arquivo inteiro): "uma latinha de cerveja comum…" dita 3 vezes virou 1 segmento de 24 s, e o corte levava os erros. Nova ferramenta `motor/ferramentas/retranscrever.py`: parte o áudio pela energia (não é o VAD Silero, fala gritada continua), transcreve cada trecho com `large-v3` e vocabulário (marcas) só em trecho ≥ 2 s, e filtra laço ("Amstel Ultra" 5x), letra esticada e frases-fantasma. Corrige também o tempo das palavras (o resolvedor acerta o `de`/`ate`). Próximo: virar opção da etapa `analise` (`EDITOR_TRANSCRICAO_TRECHOS=1`).
- **Tom de sala com gente falando ao fundo** (supermercado): o QA pegou "não posso ir" no stem. Novo `tom_sala.difuso` (contrato `edl.schema.json`, `montagem/mix.py`): espectro médio do trecho + fase aleatória = timbre do lugar, nível constante, nenhuma palavra. O QA (`tom_sala_sem_voz`, `frase_repetida`) prova "sem voz" pela modulação do envelope (≤ 2,5 dB; voz real deu 32,7 dB, difuso 0,8-1,1 dB), porque o Whisper alucina em ruído normalizado ("cidade no Brasil").
- **Fecho de cliente**: `fecho.js` ignorava `logo_cliente` (a logo do Super Kal não aparecia) e o `apoio` vazava da zona segura. Agora: logo do cliente protagonista, `logo_parceiro` (parceria, duas logos com "×"), assinatura creat.MTT pequena, véu escuro para leitura, `apoio` com quebra dentro de x 60-960 (aviso legal "Beba com moderação…" cabe). `overlay.py` passa `logo_cliente`/`logo_parceiro` como imagem.
- **Destaque de várias palavras** (`*SUPER KAL*` imprimia os asteriscos): `palavras()` em `nucleo.js` agora abre e fecha o destaque entre palavras.
- **Diretor da sessão reescrevendo a direção**: o motor reaproveitava a versão antiga (chave de entrada igual). `diretor_sessao responder` agora limpa o índice `por_entrada` e sai versão nova.
- **Ainda feito à mão no EDL** (vira resolvedor): texto de tela preso à palavra dita (o resolvedor solta os textos em fila de 2,2 s a partir do início do bloco), `stats` com número contando para valores ditos (calorias), `checklist` marcando cada item no instante da palavra (sabores de polpa), corte de falso começo dentro da mesma fala, cobertura que não repete o mesmo trecho em blocos vizinhos, palavras de legenda derrubadas pelo filtro de confiança mas confirmadas na retranscrição. Scripts de referência: `patch_cerveja.py` / `patch_nutri.py` do scratchpad da sessão (copiar a lógica para o resolvedor).
- **Trilha**: não há biblioteca licenciada na máquina (`biblioteca/trilhas.json` vazio) e os SFX da casa só têm metadados (os .wav ficam fora do git); a montagem usou SFX sintéticos. Precisa de biblioteca de trilhas no armazenamento do dono.
- Verdade: a fala "as três são sem glúten" ficou fora (Michelob Ultra long neck 330 ml lista "contém glúten" no varejo) e "sucos integrais… calorias baixíssimas" também. Regra candidata para a memória: alegação de saúde dita pela apresentadora é conferida em fonte antes de entrar.

## O editor pergunta o que falta (briefing por botões) — 19/11
- Formulário de pedido com perguntas de toque, que mudam com o modo (`PERGUNTAS` em `apps/web/lib/estados.ts`): formato, destino, o que não pode aparecer, mascote, cenas por IA (com aviso de custo), recriar telas, legenda, música, fecho e um campo livre "algo que precisa aparecer". As respostas vão nos campos que o motor já aceitava (`formato`, `destino`, `obrigatorio`, `proibido`) e o diretor as lê no prompt. Aceite D 21/21 (novos: "o editor pergunta o que falta" e "as perguntas mudam com o modo"). Não houve print dedicado das perguntas (o script de captura estourou o tempo); a tela foi verificada pelo aceite funcional.

## Boot estável, saúde pública e estudos de caso por link — 19/11
- Boot no Railway dava `database is locked` no `PRAGMA journal_mode=WAL` (API + 2 workers abrindo juntos): `banco.conectar` tenta de novo por até ~10 s e o `iniciar.sh` só sobe os workers depois que a API responde. Teste `test_banco_concorrente.py` (8 processos ao mesmo tempo).
- `GET /api/saude` (público, sem login): site, motor, provedores e, com `?chave=1`, o estado da chave do cérebro (ok/falha/ausente, com 1 token de custo e cache de 10 min). Nunca mostra a chave.
- **Estudos de caso por link** (Caderno → "Estudos de caso"): cola o link público de um Reel/TikTok/YouTube/Vimeo/Drive/Dropbox, o motor baixa com yt-dlp, mede cortes, plano médio e 1º corte, transcreve, guarda folha de contato em `<dados>/referencias/` e a lição em `memoria/referencias/`. O diretor recebe as 5 mais recentes no prompt. Vídeo privado ou que peça login: o editor avisa para baixar pelo celular e subir como material. Testes `test_referencias.py`; aceite D 22/22.
