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
- 19/11 · **autoteste da direção real no link** achou defeito antes do uso: a API recusou o contrato da direção no modo estrito ("compiled grammar is too large"). Correção: na 1ª recusa o cérebro passa a mandar o contrato no texto (sem descrições) e valida localmente (o resolvedor já valida contra o schema); `_json_do_texto` tira cercas. Teste `test_cerebro_sem_gramatica.py`. Autoteste: ok vale 1 dia, falha pode repetir em 5 min. Comando oficial: sessão "Editor creat.MTT · melhoria contínua" + tarefa diária 02:13 (Bahia).

## Super Kal / nutricionista, segunda rodada (bastidor da creat, stories e efeito sob medida) — 19/11
- **Corte no meio de palavra que só a mixagem mostrou**: a apresentadora diz "agora vem… vem comigo"; o Whisper leu "Agora vem comigo" e o corte "de: vem comigo" caiu dentro do "agora". Apareceu ao transcrever a mixagem final e ler. Nova ferramenta `motor/ferramentas/aparar.py`: tira um intervalo do filme de um EDL resolvido e fecha o corte (voz, planos, textos, legendas, efeitos, sons, blocos, trilha e logos do QA andam juntos). **Falta no QA**: checagem "corte em fala" (energia de voz alta colada antes do `s0` de uma peça de voz) e gravar a transcrição da mixagem em `qa/` (hoje o QA transcreve e joga fora; reli com script à parte).
- **Palavra baixa no começo da frase** ("Vem" 8 dB abaixo do resto): resolvido partindo a peça de voz em duas e dando `ganho_db` +6 só na primeira. Vira regra do resolvedor: nivelar por palavra quando a primeira sílaba útil está muito abaixo da média da fala.
- **Stories**: nova ferramenta `motor/ferramentas/story.py` monta story curto (5 a 12 s) a partir de uma especificação pequena, sem diretor: trechos com fala (voz + legenda) e imagens de apoio, camadas do kit, trilha a partir de um ponto, tom de sala difuso de outro arquivo. Passa pela mesma montagem e pelo mesmo QA. Assinatura `@creat.mtt` entra sozinha (selo pequeno no alto à direita da zona segura) e a regra `c_arroba_fecho` aceita esse selo quando a peça é story (`memoria/loja.py`), já que story não tem cartão final.
- **Rótulo**: `rotulo.js` ganhou `tamSub` (aviso legal de bebida pede linha de apoio maior que 18 px).
- **Logo nunca parada** (pedido do dono em 19/11: logo sempre com fundo transparente e alguma animação): `fecho.js` dá um respiro leve (escala 1,035, vai e volta) nas logos de cliente e de parceiro depois que pousam. A logo da nutricionista foi refeita em vetor a partir da imagem que o dono mandou, em versão negativa com fundo transparente; quando chegar o arquivo original, trocar em `marcas/lavinia/logo.png`.
- **Feito à mão no EDL e que vira resolvedor**: recolocar na legenda palavras que o filtro de confiança derrubou ("Kal", "creat", "Brasfrut": nome de marca não pode sumir); não legendar a fala enquanto o gancho mostra a mesma frase; desfocar o fundo do plano sob o cartão final (rosto atrás de logo de cliente fica sujo); cobrir fala longa com imagem de apoio do mesmo assunto.
- **Trilha**: três faixas instrumentais geradas no ElevenLabs Music (autorizado pelo dono nesta sessão) e registradas em `biblioteca/trilhas.json` do armazenamento da sessão. A biblioteca ainda não é permanente: falta um lugar durável (Dropbox/Supabase) para as trilhas e os SFX da casa.
- **Cuidado de conteúdo**: imagem de apoio com criança identificável ao fundo foi trocada. Regra candidata para a memória: não usar plano com menor identificável em peça de divulgação.
- **Efeito sob medida ("superpoder do carrinho", pedido do dono no meio do trabalho)**: a nutricionista chama com a mão, o carrinho vem sozinho e ela pega. O motor não tem plano de efeito, então o clipe foi feito fora (`efeitos/superpoder_carrinho.py`, OpenCV): remapeamento de tempo com borrão de movimento real, loja escurecendo em volta do poder, carga no punho com partículas convergindo, filamentos de luz mão→carrinho, arame do carrinho "energizado" com rastro, onda de choque com refração, fagulhas, soco de câmera e aberração. Alça azul rastreada por cor; mão por pontos-chave medidos nos quadros. Entrou no EDL como fonte comum (`estab: "nao"`), com um som desenhado só para ele (pasta `MK_SOM`), e a pegada foi posta no tempo forte da música (um compasso inteiro aberto, emenda da trilha deslocada). **Falta no editor**: (1) plano do tipo "efeito" com receita reutilizável (carga, filamento, onda de choque, rastro) e rastreio de ponto; (2) ferramenta para ABRIR tempo no EDL (o inverso de `aparar.py`; foi feito à mão); (3) `story.py` já aceita clipe pronto (`chave` + `audio_de`).
- **Aviso do QA que era defeito de verdade**: `legenda_sobre_rosto` (não bloqueia) apontou 1 quadro; era um rótulo em cima da testa da apresentadora no plano fechado. Rótulo e gancho sobre rosto têm de bloquear, e o resolvedor precisa escolher o lado/altura do rótulo olhando onde está o rosto no plano. A pasta `qa/` também guarda quadros de rodadas antigas (confunde a leitura): limpar no começo do QA.
- 19/11 · 2º autoteste no link: o cérebro real escreveu a direção, mas sem o modo estrito fugiu do contrato (ids 'b1', cobertura de 9,5 s acima do máximo 8, clima fora da lista). Correção: o cérebro valida o próprio rascunho com jsonschema e pede para corrigir só os erros apontados (até 2 vezes, custo somado). Teste `test_conserta_ate_passar_no_contrato`. pytest 142.
- 19/11 · **direção real OK no link** (autoteste, material de exemplo, modo cinema): 70,7 s, US$ 0,234, entrada 12.376 + cache 3.607, saída 8.216 tokens, filme de 21,2 s, gancho 'BASTIDOR / creat.MTT', crítica aplicada. Ajuste: o diretor agora recebe no pedido as saídas que o modo proíbe (cinema escolheu aba71).

## Rodada diária 1 · mapa item 1: cor no estilo DaVinci — 19/11
- Saúde no começo da rodada: site ok, motor ok, chave do cérebro ok (`/api/saude?chave=1&direcao=1`).
- **Defeito achado:** a análise rotulava a cena como "quente-medio"/"frio-claro", nomes que não existem na tabela de cor. Todo material real saía com o look neutro. Corrigido pela biblioteca nova.
- **Biblioteca por ambiente** (`memoria/cor/looks.json`, lida por `services/motor/motor/etapas/cor.py`): loja, rua_dia, rua_noite, academia, palco e neutro. Cada look tem lift/gamma/gain por canal, contraste, saturação, proteção de pele, luz alvo e força do branco. `python -m motor.etapas.cor cube <look> saida.cube` exporta LUT 3D para o DaVinci/Premiere.
- **Grade por cena com medição:** a análise mede cada cena (histograma de luz, branco pelos pixels neutros, céu, cores fortes, tom de pele no vetorscópio) e escolhe o look. O resolvedor põe em cada plano o look e o balanço da cena (a cena inteira recebe a mesma correção, sem cor pulando entre cortes). Ordem: balanço (exposição + branco) → look → saturação com a pele protegida. ~10 ms por quadro 1080x1920.
- **Lição do teste visual:** em quadro dominado por uma cor (fundo verde), o "mundo cinza" empurrava a pele para o magenta. Agora, sem área neutra confiável o branco não é tocado, e a pele é trava: o balanço recua se afastar a pele da linha natural (123°).
- **Pedido:** campo `ambiente` (auto, loja, rua_dia, rua_noite, academia, palco, neutro). O site pergunta "Onde foi gravado? (para a cor)". Academia só vem do pedido (pela cor não dá para separar de loja).
- **Antes/depois na revisão:** a montagem guarda o quadro do meio de cada plano antes e depois da cor, com a medição (`saidas/<p>/<v>/cor.json` + `cor/<plano>_{antes,depois}.jpg`, servidos só em versão entregue). No site, a versão entregue tem o botão "Cor: antes e depois" com comparador de arrastar, histograma, luz média, estouro e ângulo da pele. O Caderno ganhou a seção "Cor por ambiente".
- **QA novo `cor_medida`** (avisa, não segura a entrega): altas estouradas, pretos esmagados ou pele fora de 105° a 145°; diz quando a pele já vinha assim do material.
- Compatibilidade: EDL e análise antigos seguem valendo; plano com look da tabela antiga mantém a mesma chave de cache.
- **Testes:** `tests/test_cor.py` (18). pytest `-m "not pago"` antes da revisão: 143 ok, 3 pulados (material real ausente). `pnpm tipos` ok. Aceite D **24/24** (novos: "cor: antes e depois de cada plano na versão" e "caderno mostra a biblioteca de cor"). Print da tela: `apps/web/.verificacao/aceite/cor-antes-depois.png`.
- Aceite C rápido nesta máquina: 20/26, **igual antes da mudança** (conferido com `git stash`): o material sintético não tem fala de verdade e o QA reprova `legenda_x_fala` e `frase_repetida` com razão. Pendência: fixture de fala real pequena dentro do repositório para o aceite C não depender do scratchpad.
- **Revisão do Crivo (mesma rodada), 4 ajustes aplicados:** (1) os looks têm cópia padrão dentro do pacote (`motor/etapas/cor_looks.json`), então memória montada como volume antigo não impede o motor de subir; (2) falha ao gravar o antes/depois nunca derruba o plano (vira `aviso_cor`) e os arquivos são gravados de forma atômica; (3) `neutro` e `palco` existem nas duas tabelas: plano antigo sem balanço segue no caminho e na chave de cache de antes; (4) o comparador usa a proporção da própria imagem (versões 16:9, 1:1 e 4:5 não saem cortadas) e o QA diz quantos planos vieram do cache antigo sem medição. Números finais: pytest **150 ok, 3 pulados**; aceite D **24/24**.
- Junto veio o conserto de `tests/test_cerebro_sem_gramatica.py` (da outra sessão): o teste importava `httpx`, mas o SDK novo da Anthropic usa `httpx2`; agora aceita os dois.
- Limites honestos: a escolha do look é heurística (sem IA); ainda não foi vista em gravação real de loja/rua/noite (não há material real nesta máquina). Primeira peça real: abrir "Cor: antes e depois" e ajustar os números do look em `memoria/cor/looks.json` se preciso.
- **Próximo (ordem do mapa):** item 2, rastreamento e máscara de pessoa (segmentação leve local, texto atrás da pessoa, desfoque de fundo). Na segunda 23/11: pesquisa semanal de ferramentas → `docs/stack-ferramentas-2026.md`. Pendências pequenas da cor: look por semântica (visão do Claude dizer "academia"), cor igualada entre câmeras diferentes da mesma cena.

## Fila nova do dono (confirmada em 19/11) · item D: três checagens que seguram a entrega
Fila confirmada pelo dono ("Let's go"): A backup diário no Dropbox · B memória do servidor de volta ao git · C revisão com olho de IA · D checagens de fala · E biblioteca de trilhas/SFX · F link de aprovação do cliente · G agendar pelo Metricool · H painel de gastos. Depois, o mapa original (2 máscara, 3 voz, 4 falante, 5 Drive/Dropbox, 6 IA com custo, 7 perguntas em camadas, 8 motion, 9 Novidades). Em A, F e G: parar e avisar o dono antes do passo que sai do editor.
- **`fala_cortada` (bloqueia):** no fim de cada fala, mede a forma de onda da fonte no ponto do corte (voz ativa que morre 50 a 450 ms depois = última sílaba cortada), confere corte dentro de palavra pela transcrição da análise e usa a última palavra ouvida no mix final como terceira pista. Fonte ilegível = NÃO VERIFICADO.
- **Na origem:** `resolvedor._cauda` estica o fim da fala até a voz morrer (máx +0,40 s, nunca além da palavra seguinte), porque o fim da palavra na transcrição costuma vir antes do fim do som.
- **`voz_externa` (bloqueia):** cada fala ganha uma assinatura de voz (`motor/etapas/falante.py`: fbank Kaldi em numpy + modelo CAM++ do WeSpeaker em ONNX, 29 MB, baixado uma vez para `<dados>/modelos`, grátis, ~50 ms por fala). Voz principal = a de mais tempo. Fala longe da principal reprova quando a principal tem 65% ou mais do tempo; vozes equilibradas = conversa, passa. Trecho curto (< 2 s) engana a assinatura (medido: a mesma voz dizendo "Vem!" deu 0,39), então pede segunda pista: altura da voz 20% longe, ou cosseno < 0,15. O pedido manda: campo `vozes` (auto, uma, varias) → `origem.vozes` do EDL; o site pergunta "Quem fala no vídeo?".
- **`cobertura_sintonia` (bloqueia):** plano que cobre fala (outra fonte ou outro instante, diferença > 0,3 s) com rosto de 20% ou mais da largura na maioria de até 3 quadros do filme final = pessoa em primeiro plano fora de sincronia. Janela/PiP e plano em sincronia não entram. "Fora do assunto" é semântica: fica para o item C (olho do Claude).
- Isto adianta o item 4 do mapa original (rótulo de quem fala): a assinatura de voz já existe; falta ligar ao rosto e à análise ("a fala do Marcos é a base").
- **Teste integrado** (aceite C rápido, montagem + QA reais): os dois modelos baixaram sozinhos; as três checagens rodaram em 0,2 s + 1,4 s + 2,0 s. O aceite C segue 20/26 pelo mesmo motivo de antes (fixture sem fala real).
- **Testes:** `tests/test_qa_fala.py` (23). Vozes de teste feitas com espeak-ng (sintéticas): mesma voz 0,74 a 0,94 de semelhança, voz diferente 0,21 a 0,32.
- Limite honesto: nada disto foi medido com gravação real (não há material real nesta máquina). Os limiares (0,42 de semelhança, 20% de rosto, 50 a 450 ms de cauda) vão precisar de ajuste na primeira peça real; cada reprovação mostra os números medidos no detalhe do QA.
- **Publicado em modo observação** (`EM_OBSERVACAO` em `qa/__init__.py`): as três checagens medem e avisam, mas ainda não seguram a entrega, até o parecer do revisor chegar e os ajustes entrarem. Tirar da lista = passa a bloquear. pytest 174 ok, 3 pulados; aceite D 24/24.
- **Revisão do Crivo (item D), ajustes aplicados:** (1) o corte de pausa dentro da fala também espera a voz morrer (antes cortava em fim da palavra + 0,10 s e a checagem reprovaria sempre igual, sem saída); (2) a última palavra do EDL conta como ouvida no mix se for parecida (marca ou número corrigido não bate letra a letra); (3) rosto que reprova cobertura subiu de 20% para 30% da largura (20% pegava b-roll comum com cliente ou atendente); (4) medição do tom da voz corrige erro de oitava; (5) modelo de voz só carrega com o sha256 conferido, sem resto de download, e `onnxruntime` entrou nas dependências; (6) `/api/saude` mostra `versao` (commit no ar), para conferir cada deploy.
- **Seguem em observação** (avisam, não seguram): o revisor confirmou risco de bloqueio falso em `voz_externa` (mesma pessoa em outro microfone/ambiente, convidado com 30% do tempo) e os limiares não viram gravação real. Viram bloqueio quando as primeiras peças reais confirmarem os números: tirar o id de `EM_OBSERVACAO` em `services/motor/motor/etapas/qa/__init__.py`.
- pytest **178 ok, 3 pulados**; aceite D **24/24**.
- **Próximo:** item C (revisão com olho de IA: folha de contato + quadros-chave da versão, Claude bloqueia defeito visual). Pendência do D: validar limiares com material real da Lavínia e ligar o bloqueio.

## Fila do dono · item C: revisão com olho de IA antes de entregar — 19/11
- **`qa/olho_ia.py`:** do filme final saem uma folha geral (12 quadros com o tempo) e até 10 quadros de risco em tamanho grande: meio de cada transição, texto de tela no auge, imagem por cima de fala e a logo do fecho (cota por grupo, para um tipo não tomar tudo). Cada quadro vai com etiqueta (Q1, Q2…) e com o que era para estar ali (texto esperado, fala coberta). O Claude devolve defeitos num contrato fechado: rosto manchado na transição, texto invertido/errado, texto ilegível, texto sobre rosto, falante desconectado, logo em baixa qualidade, cobertura fora do assunto, quadro quebrado. "Bloqueia" com confiança ≥ 0,7 reprova; o resto vira observação. Evidência: a folha e o quadro acusado em `qa/olho_*.jpg`.
- **Custo à vista:** uma chamada por versão no modelo da direção (troca com `EDITOR_MODELO_REVISAO`), esforço médio. Previsão calculada antes de gastar (US$ 0,11 só com a folha; US$ 0,17 com 10 quadros de risco) e teto `EDITOR_REVISAO_TETO_USD` (padrão 0,30): acima do teto corta quadros de risco; se nem a folha couber, não roda e avisa. O mesmo filme (sha256) nunca paga duas vezes. O custo aparece no detalhe do QA e no site ("Olho de IA: … custo US$ 0,12"). Desliga com `EDITOR_REVISAO_IA=0`.
- **Livro de gastos** (`cerebro/gastos.py` → `<dados>/gastos.jsonl`): uma linha por chamada paga do olho. É a base do item H (painel de gastos do mês); falta registrar ali a direção e a visão leve.
- **Autoteste no ar:** `/api/saude?olho=1` manda um quadro sintético com o texto «PROMOÇÃO HOJE» espelhado e confere se o Claude acusa. No máximo 1 vez por semana (centavos); falha só repete em 30 min e "não acusou" em 1 dia, porque a rota é pública.
- **Em observação** (`EM_OBSERVACAO`): avisa e mostra no site, sem segurar a entrega, até vermos como se comporta em peças reais. Falha da API vira aviso "NÃO VISTO pela IA" e nunca segura.
- **Site:** a versão agora mostra os avisos do QA (antes só o que bloqueava aparecia escrito) e a linha do olho de IA com o custo.
- **Testes:** `tests/test_olho_ia.py` (9, sem chamada paga; o teste real fica marcado `pago`). pytest **187 ok, 3 pulados**; aceite D **25/25** (novo: "QA mostra os avisos e o olho de IA com o custo").
- Limite honesto: a chamada real ao Claude não rodou nesta máquina (sem chave aqui). A prova é o autoteste no ar depois do deploy.
- **Revisão do Crivo (item C):** a forma da chamada à API foi conferida contra o caminho da direção e está certa. Ajustes aplicados: (1) o quadro da transição sai no meio de verdade da janela do efeito (whip, aba71, máscara e rush são centrados em `t`; antes saía depois de a transição acabar, justo o caso do rosto manchado); (2) o olho não roda em versão que já reprovou em outra checagem (não gasta no que vai ser refeito); (3) falha que acontece depois de a API cobrar vai para o livro como gasto estimado, `max_tokens` subiu para 16000 e a chamada tem espera máxima de 180 s; (4) o "esperado" só leva chaves de texto de tela e sem quebra de linha (nada de caminho de arquivo, cor ou texto que pareça instrução); (5) o teto corta o quadro de menor prioridade, não o último no tempo; (6) quadro citado que não existe vira observação; a evidência vai junto no cache; (7) o custo vem na frente do detalhe (o site corta em 200 letras); (8) o autoteste da direção, que também é público, só repete depois de falha em 30 min (era 5: um monitor consultando poderia gastar dezenas de dólares por dia).
- Números finais: pytest **199 ok, 3 pulados**; aceite D **25/25**.

## Fila do dono · item B (parte 1): a memória aprendida sobrevive às publicações — 19/11
- **Risco achado lendo o deploy:** no Railway (um contêiner, volume só em `/dados`) a pasta `memoria/` fica dentro da imagem. Cada publicação troca a imagem, então regra criada por reprovação, caso aprovado e estudo de caso gravados no servidor se perderiam no deploy seguinte (a não ser que `EDITOR_MEMORIA` já estivesse definida nas variáveis da hospedagem; daqui não dá para ver). Hoje foram várias publicações.
- **Correção:** `deploy/iniciar.sh` aponta `EDITOR_MEMORIA` para `/dados/memoria` (respeita o valor da hospedagem, se houver) e roda `python -m motor.memoria.semear` a cada boot. A junção é idempotente: do git entra tudo (e o git manda no texto de um id que ele conhece); do servidor ficam os ids que o git não tem (regras, vocabulário, checagens), os casos e as referências; `modos/`, `modelos/` e `cor/` são do código e vão por cima. Se a junção falhar, o motor sobe com a memória do git e avisa no log.
- Testes: `tests/test_memoria_semear.py` (5).
- **Falta (parte 2):** trazer o aprendido de volta para o git. O servidor não tem como escrever no GitHub nem eu tenho a senha do site; o caminho é o backup do item A (a memória vai junto para o Dropbox e esta sessão lê de lá e versiona).

## Fila do dono · item A: backup diário para o Dropbox (+ item B parte 2) — 19/11
- **`motor/backup.py`:** pacote leve do que não se refaz: cópia consistente do banco (API de backup do SQLite; o link de download das versões sai em branco, porque no R2 ele é pré-assinado), memória da casa do volume, pedidos, direções, EDLs, relatórios de QA, análises (com transcrição) e o livro de gastos. **Nunca entram:** vídeo, áudio, `.segredos`, `backup_config.json`, modelos, cache, `link`/`capa` do `entrega.json`. Arquivo acima de 5 MB e pacote acima de 200 MB ficam de fora e vão listados no `MANIFESTO.json` (que também conta quanta mídia ficou no servidor). Guarda os 3 últimos pacotes locais.
- **Memória em texto (item B, parte 2):** junto do .zip vai `editor-memoria-AAAAMMDD-HHMM.json` com regras, vocabulário, checagens, casos e referências. É por ele que esta sessão traz para o git o que o servidor aprendeu (ler no Dropbox e versionar).
- **Envio sem chave:** pela "solicitação de arquivos" do Dropbox (só aceita upload), com o navegador do kit (`packages/kit/ferramentas/dropbox-enviar.cjs`, cópia da ferramenta da casa). O navegador só fala com domínios do Dropbox (o resto é abortado), recebe ambiente mínimo (sem chave do cérebro nem token do motor) e o endereço nunca aparece em mensagem, log, saúde ou zip.
- **Destino:** variável `EDITOR_BACKUP_PEDIDO` na hospedagem, ou a tela **Caderno → Backup** (grava `<dados>/backup_config.json`, permissão 600). A tela recusa link que não seja de solicitação de arquivos e não mostra o link depois de salvo.
- **Agenda:** thread no processo da API (`EDITOR_BACKUP_AGENDAR=1` no `iniciar.sh`): confere a cada 15 min; roda se passou 1 dia do último backup bom; falha tenta de novo em 1 hora. Botão "Fazer backup agora" com intervalo mínimo de 10 min. `EDITOR_BACKUP=0` desliga. Estado resumido em `/api/saude` (`backup`: destino configurado ou não, estado, último ok).
- **Auditoria (Muralha):** nenhuma falha alta ou crítica; sem login ninguém troca o destino (proxy exige sessão, POST exige mesma origem, motor só em 127.0.0.1 com token). Ajustes aplicados: link pré-assinado fora do backup; ambiente mínimo e lista de domínios no navegador; endereço apagado de toda mensagem (inteiro ou cortado); teto total, limpeza de `.tmp`, hash em blocos; prazo do envio proporcional ao tamanho (a conta antiga dava sempre 180 s); intervalo no botão manual; aviso quando o destino vem fixo da hospedagem.
- Medido: o Chromium do kit abre a página de solicitação do Dropbox daqui (só `www.dropbox.com` e `cfl.dropboxstatic.com`); com um endereço inexistente a página diz "Solicitação de arquivo não encontrada". O envio real só roda quando o dono criar a solicitação.
- **Testes:** `tests/test_backup.py` (12). pytest **211 ok, 3 pulados**; aceite D **26/26** (novo: "backup: endereço errado recusado, destino salvo, backup feito e o link não fica na tela").
- **Falta do dono (1 passo):** criar a solicitação de arquivos no Dropbox e colar o link na tela Backup do Caderno. Cuidado de privacidade: a pasta não deve ficar dentro da "Pasta da equipe" (as transcrições têm falas de terceiros).

## Fila do dono · item H: painel de gastos do mês — 19/11
- **Livro de gastos completo** (`cerebro/gastos.py` → `<dados>/gastos.jsonl`): agora registram a direção e o crítico (por chamada, com projeto e versão), a visão leve da análise, o olho de IA (inclusive o que falhou depois de cobrado, marcado como estimado) e os autotestes da direção e do olho. Custo zero (cérebro fixture ou sessão) não entra.
- **Histórico:** na primeira consulta, o painel importa o que foi gasto antes do livro existir (`projetos/*/uso_*.json` e `derivados/*/*/uso_visao.json`), com a data do arquivo, sem duplicar (cada linha leva a `ref` da origem).
- **Defeito corrigido de passagem:** a visão leve guardava o custo da última chamada e, se o arquivo seguinte caísse no modo sem IA, herdava o custo do anterior (gasto contado em dobro). Agora zera a cada arquivo.
- **Tela "Gastos"** (link no topo, `/gastos`): total do mês, por tipo de gasto, por projeto (com o nome do projeto) e as últimas 30 chamadas; troca de mês quando há mais de um. Diz que ElevenLabs e Higgsfield usados pelas sessões de trabalho não passam pelo editor.
- Topo do site: com 4 itens no menu, no celular o menu desce para uma segunda linha em vez de criar rolagem lateral (a verificação visual pegou).
- Testes: `tests/test_gastos.py` (5). pytest **216 ok, 3 pulados**; aceite D **27/27** (novo: "painel de gastos do mês"; a verificação visual passou a incluir a tela de gastos).
- Próximo: item E (biblioteca de trilhas e SFX com licença).

## Revisão do dono no Super Kal: fala cortada, voz de fora, cobertura desconectada — 19/11
O dono reviu as peças e apontou três defeitos. Os três viraram checagem do QA que BLOQUEIA a entrega, com teste.
- **Fala cortada no fim** ("fala alguma coisa antes de terminar a frase, já teve o recorte"). Causa medida: o resolvedor cortava no fim de palavra do Whisper, que marca o fim de 0,1 a 0,5 s antes de a voz acabar ("comum" saía "com", "tradicional" saía "tradição"), e o aperto de pausa partia frases corridas em três peças com o fim comido. 11 das 14 peças da cerveja estavam cortadas. Agora: `motor/audio_fala.py` (régua pelo áudio: envelope da banda da fala até 7,5 kHz para o "s" contar, fim real da fala, oclusão de "t/p/k" não é fim de palavra), `ferramentas/ajustar_cortes.py` (estende cada peça até a fala acabar mais um respiro, apara o silêncio de entrada, junta peças corridas, reacomoda planos, legendas, textos, efeitos e trilha, e mantém a boca no lugar) e a checagem `fala_cortada`. Corte conferido de ouvido entra em `qa.cortes_confirmados`.
- **Voz de fora** (equipe dirigindo a apresentadora). Achadas duas na cerveja: um "vem" masculino antes do "Vem comigo" dela (o silêncio de entrada da peça guardava a deixa de quem dirige, e eu ainda tinha dado +6 dB) e um "Boa tarde, senhor" no som direto do plano do cartão final. Checagem `voz_externa`: voz bem mais fraca que a fala principal ou com tom muito abaixo, e conversa no som direto. Dispensa em `qa.vozes_confirmadas`. Limite conhecido: voz de fora com tom igual ao da apresentadora, em cima da fala dela, não é separada por esta régua.
- **Cobertura desconectada** (a fala passa por cima de outro take e a pessoa está olhando para outro lado). Achados: ela parada sorrindo para a câmera enquanto a voz dizia outra frase; garrafa de uma marca na tela enquanto a voz falava de outra; ela olhando para o lado no carrinho dos panetones. Checagem `cobertura_desconectada`: plano que não é o take sincronizado da fala e mostra rosto só passa com a anotação `plano.cobertura = {olhar, assunto}` de quem OLHOU o take; rosto para a câmera fora do take da fala reprova sempre.
- O cache do QA agora leva em conta o conjunto de checagens e o EDL (antes um final já conferido nunca passava pelas checagens novas), e a entrega recusa relatório antigo.
- **Falta**: o resolvedor ainda corta pelo Whisper (chamar `ajustar_cortes` depois de resolver, ou usar `audio_fala` dentro dele); a direção e o resolvedor ainda não escrevem `plano.cobertura`; `voz_externa` não tem modelo de falante (só nível e tom); a transcrição peça a peça virou `ferramentas/prova_pecas.py` (leitura); falta ela comparar sozinha com o texto pedido tolerando marca e número.
- **Lições da segunda rodada (19/11):**
  1. Transcrição de uma peça isolada não prova que a última sílaba está lá: o modelo de linguagem completa a palavra ("dieta", "laranja") mesmo com o fim cortado. Quem manda é a régua física (`motor/audio_fala.py`); dispensa (`qa.cortes_confirmados`) só depois de conferir a energia por banda no ponto do corte.
  2. O "s" final mora em 3,5 a 7,5 kHz e some na régua de 200 a 3400 Hz. `audio_fala.envelope` agora mede também essa banda (`db_hf`/`limiar_hf`), `fim_da_fala` estica o fim até o chiado acabar e `corte_final_ok` reprova corte feito antes disso; `ajustar_cortes` segue a mesma regra e a folga dos intervalos ficou idempotente (rodar de novo não aperta o filme).
  3. Arredondamento bancário no índice de quadro (`np.round` leva 4,5 para 4) duplicava um quadro sim, um não, em plano que começava em meio quadro: 15 qps aparente. `planos.indices_de_quadro` arredonda o meio sempre para cima; câmera lenta mistura os quadros vizinhos; `VERSAO = "p5"` invalida o cache dos planos. A música sem `acorde_final` sai em 1,4 s (0,5 s soava interrompida).
  4. Depois de retemporizar as falas, as transições (`props.corte`) e a pontuação das legendas precisam ser refeitas: elas ficam presas aos tempos antigos.
  5. A branch é alvo móvel com duas sessões empurrando: integrar por rebase num worktree, resolver conflito juntando os dois lados, nunca force.

## Integração das duas sessões (QA de fala, 19/11)
- As duas sessões tinham feito as mesmas três checagens ao mesmo tempo. Ficou **uma checagem por critério**, todas **bloqueando** a entrega (saíram de `EM_OBSERVACAO`, onde fica só o `olho_ia` do item C, que roda por último; ordem do dono, "QA que bloqueia"), e cada uma **reprova quando qualquer régua dos dois lados reprova**: `fala_cortada` = régua de `audio_fala` (fim e começo) + cauda da última sílaba + corte dentro de palavra da fonte + última palavra no mix, medindo no fim real da peça (`min(s1, s0 + (t1 - t0) * vel)`); `voz_externa` = nível e tom (`vozes_de_fora`) + conversa no som direto + assinatura de voz CAM++ (`etapas/falante.py`), com o pedido (`origem.vozes`) mandando só na outra pessoa, nunca na equipe longe do microfone.
- Id da cobertura: ficou **`cobertura_sintonia`** (o site, a memória e o contrato do QA já usavam); `cobertura_desconectada` saiu sem apelido (nada no remoto dependia dele). A checagem junta as pistas dos dois lados (rosto ≥ 5% da altura em 30% das amostras, 2 amostras seguidas ou rosto em primeiro plano ≥ 30% da largura na maioria, valor da revisão do Crivo), conta rampa de tempo e janela/PiP como cobertura, trata `c3_0` e `c3_1` como a mesma câmera e aceita a dispensa `plano.cobertura {olhar, assunto}`. Ajustes do Crivo mantidos: `_parecida` na última palavra do mix, `_tom_longe` com o tom sem erro de oitava, modelo de voz com sha256, corte de pausa do resolvedor esperando a voz morrer; o olho de IA lê as coberturas por `coberturas_do_edl`.
- Dispensas explícitas valem para todas as réguas (`qa.cortes_confirmados`, `qa.vozes_confirmadas`, `plano.cobertura`); sem fontes, sem o modelo de voz ou sem detector de rosto = NÃO VERIFICADO, que reprova. A chave do cache do QA agora leva também a lista em observação.
- Testes: `tests/test_qa_fala.py` (régua de audio_fala, som direto, dispensas, cache, entrega e a integração) e `tests/test_qa_fala_assinatura.py` (os do outro lado: cauda, palavra da fonte, mix, assinatura, resolvedor, primeiro plano); os casos que mudaram de expectativa por causa da união dizem o porquê no próprio teste.
## Fila do dono · item E: biblioteca de trilhas e efeitos com licença — 19/11
- **Regra nova:** nada toca num filme sem licença registrada para uso comercial (vídeo de cliente e anúncio). `motor/biblioteca.py`: fichas em `<dados>/biblioteca/{trilhas,sfx}.json` com tipo de licença (própria, comprada, gerada por IA, livre), fonte, autor, link dos termos, atribuição e data; áudio no armazenamento em `biblioteca/{trilhas,sfx}/<id>.wav`.
- **Entrada pelo site** (Caderno → "Trilhas e efeitos da casa"): link de UM arquivo do Dropbox ou Drive (mesmo importador seguro do material), tipo, título, clima ou o momento do efeito (abre, chip, cta, embaralha, impacto, risco) e a ficha da licença, com a confirmação de uso comercial obrigatória. O motor converte para WAV 48 kHz, mede a duração e, na trilha, o andamento (BPM) e a fase da batida (o resolvedor corta na batida). Efeito com o mesmo nome substitui o anterior; "retirar" tira de uso e guarda a ficha.
- **Efeito sem reiniciar:** a montagem procura o efeito licenciado da biblioteca antes do sintético, e o cache de sons agora vê um arquivo novo sem reiniciar o worker.
- **O que o diretor enxerga:** `armazem_b.trilhas()` devolve só trilha ativa, com licença válida e áudio presente; ficha antiga sem licença (como as de 17/11) fica de fora e vai para o log.
- **Backup:** as fichas de licença vão no backup diário; o áudio não (fica no volume do servidor).
- **Caderno honesto:** as checagens em observação (fala cortada, voz de fora, cobertura, olho de IA) apareciam como "segura a entrega"; agora aparecem como "em observação: por enquanto só avisa".
- Testes: `tests/test_biblioteca.py` (9: licença, BPM medido a 96/120/140, registro, catálogo só licenciado, efeito vence o sintético, arquivo sem áudio, rotas, backup). pytest **226 ok, 3 pulados**; aceite D **28/28**.
- **Decisão do dono (proposta, nada pago feito):** de onde vêm as trilhas. Opções: (a) biblioteca paga que a creat já tenha (Artlist/Epidemic); (b) gerar no ElevenLabs Music (pago por geração; a outra sessão gerou 3 em 19/11 com autorização); (c) livres (licença Pixabay/CC0), sem custo, conferindo a licença uma a uma. Sem nenhuma, o filme sai sem música.
- 19/11 · junção com a sessão que integrou as checagens de fala (c9e2b1e): fala cortada, voz de fora e cobertura em sintonia **passaram a segurar a entrega** (decisão daquela sessão, com o material real); só o olho de IA segue em observação. O Caderno lê isso direto da lista `EM_OBSERVACAO`, então mostra certo. pytest **269 ok, 3 pulados**; aceite D **28/28**.

## "Resolva tudo" do dono — 19/11 (noite)
- **Backup com destino:** solicitação de arquivos criada no Dropbox do dono: "/Creat.MTT Studio/Backup do Editor" (fora da Pasta da equipe). O link não entra no repositório. **Envio de ponta a ponta provado daqui:** pacote de teste (dados sintéticos) chegou na pasta. Defeito achado no teste: o ambiente mínimo do navegador tirava o proxy e os certificados da máquina (erro de certificado); agora passam só essas variáveis de rede. Falta o dono colar o link na tela Backup (a tela pede a senha dele).
- **Efeitos sonoros da casa:** 7 gravações reais do kit de 17/11 (Sonniss #GameAudioGDC; uso comercial sem atribuição; proibido revender os sons soltos e treinar IA) embutidas em `packages/kit/assets/sfx/*.flac` (352 KB) com ficha de licença (`sfx.json`) e o `LICENCAS` original: abre (whoosh grave), chip (alça curta), cta (ar suave), embaralha (whip curto), impacto (corte seco), risco (textura arrastada), whoosh_curto. Ordem na montagem: efeito registrado pelo dono → efeito da casa → sintético. Escolha por descrição, duração e pico (não dá para ouvir daqui): conferir de ouvido na primeira peça.
- **Olho de IA segura a entrega** (`EM_OBSERVACAO` vazio): defeito grave com confiança ≥ 0,7 reprova; falha da API segue só avisando.
- **Fila única:** `FILA.md` com o combinado entre as sessões (puxar, reservar a linha com push, trabalhar, fechar) e o estado de cada item. Pedido feito à sessão da Lavínia: subir as 3 trilhas que ela já gerou e pagou (ElevenLabs Music) com a ficha de licença, para entrarem na biblioteca sem gasto novo.
- pytest **270 ok, 3 pulados**; aceite D **28/28**.

## Item F: link de aprovação para o cliente (19/11, noite)
- **O que é:** na versão entregue, o dono toca em "Gerar link" (validade de 3 a 30 dias). Sai um link `/c/<token>` exclusivo, que mostra uma vez, com os botões Copiar e WhatsApp. O cliente abre sem login e vê só o player daquela versão, com dois botões:
  - **Aprovar**, com confirmação;
  - **Pedir ajuste**, com texto curto e nome opcional.
- **Uma resposta por link.** Ela vira evento no diário do projeto, aparece no cartão da versão e cai no Caderno, em "O que os clientes responderam", onde o dono marca como resolvido. **Nunca vira regra sozinha:** para isso o dono reprova a versão com o motivo dele.
- **Segurança:**
  - o token tem 256 bits; o banco guarda só o sha256;
  - gerar outro desliga o anterior; o dono pode desligar a qualquer hora; reprovar a versão fecha o link de vez;
  - link vencido mostra "Link fechado", e o vídeo também recebe 410;
  - pelo link só saem o vídeo final e a capa daquela versão;
  - o motor nunca é exposto ao navegador do cliente;
  - limites: 20 tentativas inválidas por IP a cada 10 min, 10 respostas por IP e 6 envios por link;
  - páginas sem Referer, sem cache e sem indexação; uvicorn sem log de acesso (o caminho leva o token); o Caddy põe o IP real;
  - texto do cliente limpo de caracteres invisíveis de direção; transações de verdade (`BEGIN IMMEDIATE`) no gerar e no responder.
- **Revisões:** Muralha (segurança) e Crivo (código) aprovaram com ajustes, e os ajustes entraram neste commit. Pendente (baixa): apagar nome e texto do cliente depois de 12 meses (LGPD).
- **Testes:** pytest **277 ok** (8 novos em `test_cliente.py`); aceite D **33/33**, com o fluxo inteiro no navegador. O dono gera, o cliente (outro navegador, sem sessão) assiste no celular e pede ajuste, a resposta aparece no projeto e no Caderno, o dono desliga e a página fecha.
- **Trilhas do ElevenLabs:** a licença foi lida (termos de 09/10/2026) e o resultado tem ressalva: o plano Creator é "individual" e há proibição de montar biblioteca de música. Não entraram na biblioteca; a decisão está em FILA.md, em "Precisa do dono".
- **Dados reais das réguas de fala (sessão da Lavínia):** viraram o item D2 da fila.

## D2: réguas de fala, rodada 2, com os casos reais da Lavínia (20/11)
- **Voz da equipe que passava:**
  - A referência agora é a voz principal do FILME (moda do tom de todas as peças; nível da mesma fonte), não só a da própria peça. Uma peça que é inteira o "vem" do homem longe do microfone virava a "fala principal" de si mesma e caía em NÃO VERIFICADO pelo motivo errado. Agora vira voz de fora com o motivo certo.
  - Linha de tom estável bem mais grave que a principal, numa pausa ou no começo da peça (o "Vai, pode ir" a 150 Hz contra 260 Hz), com o limiar de vozeamento mais baixo para voz com eco.
  - Achado de tom segue a mesma conta da assinatura: reprova em "uma" e no automático com a voz principal ≥ 65%; em conversa equilibrada só relata.
- **Falso positivo de consoante:** trecho só fraco, com tom dentro de ±25% da principal e encostado (até 120 ms) na fala dela, é ela (o "g" de "Goiaba", o "xi" de "abacaxi"). Zumbido de máquina (tom parado, variação < 0,4%) e a cauda grave da frase dela não contam como outra pessoa.
- **Começo no meio de palavra:** a peça que abre com uma sílaba solta (até 300 ms de som) a menos de 150 ms de outra fala da fonte reprova (o "-zer" de "freezer"). Jump cut em fala corrida não reprova (a fala segue). O `ajustar_cortes` só marca OUVIR nesse caso.
- **Desempenho:** a série de tom fica em cache (o QA pedia a mesma série até 7 vezes por peça).
- **Revisão:** Crivo aprovou com ajustes, e os 8 pontos entraram (o mais grave era o jump cut que viraria falso positivo).
- **Testes:** pytest **283 ok** (6 novos em `test_qa_fala_d2.py`, áudio sintético com as medidas reais); aceite D 33/33.
- **Falta:** conferir no material real (só a sessão da Lavínia tem os arquivos); pedido enviado a ela.

## Item 2: recorte de pessoa (20/11)
- **Modelo:** RVM MobileNetV3 em ONNX (temporal), baixado do GitHub com sha256 conferido. A licença é GPL-3.0; o uso é só no servidor. O registro está em `docs/stack-ferramentas-2026.md`.
- **Camada atrás da pessoa** (`motion[].atras`): o kit renderiza a camada em separado. Antes de compor, a passada prévia mede quanto a pessoa cobre a linha mais coberta do texto e testa as posições 0, -8%, -16%, +8% e -24% da altura, dentro da zona segura. Se nada fica com 30% ou menos, o texto vai para a frente. Sem modelo, ou em quadro sem plano, a camada entra por cima, como antes.
- **Fundo desfocado** (`planos[].fundo.desfoque`): convolução normalizada (sem halo), calculada em 1/4 da resolução.
- **Direção:** `gancho.atras_da_pessoa` passa a camada para trás e o y para 0,30; `blocos[].fundo_desfocado` vira desfoque 0,7 nos planos de fala. A instrução ao diretor entrou depois da revisão.
- **Teste real** (story da Lavínia): máscara limpa no cabelo e desfoque com cara de lente. Num close, "SOBRE DIETA" ficaria 33% coberto ("SOB…TA"), e a trava pôs o título na frente.
- **Custo medido:** cerca de 45 ms por quadro para a máscara (cache entre a passada prévia e a composição). Sem o efeito, o render não muda.
- **Testes:** pytest **311 ok** (10 novos em `test_pessoa.py` e 1 no resolvedor).
- **Revisão do Crivo:** aprovado com ajustes, e entraram 10 dos 12 pontos.
  - O modelo continua "quente" depois da janela do título, sem pulo no desfoque.
  - Plano sem arquivo no meio da janela não derruba mais a composição.
  - Sem modelo, a camada de trás entra depois dos efeitos, igual a antes.
  - As linhas do texto são separadas pelo pico de alfa.
  - Um quadro fora da zona segura tira a posição inteira.
  - O texto é composto só na faixa dele.
  - Menos navegadores para a camada de trás.
  - O encoder só abre depois da passada prévia.
  - O modelo é baixado uma vez por processo, com espera de 20 s.
  - A máscara é guardada quando há desfoque.
- **Testes:** pytest **314 ok** (15 em `test_pessoa.py`); aceite D 33/33. Um aceite anterior deu 32/33 uma vez, intermitente, sem mudança no site: fica de olho.

## Item 2, parte 2: destaque e pele só na pessoa (20/11)
- **Pele tratada (regra do dono), automática em todo plano de fala** (`planos[].pessoa.pele = 0,5`): é uma separação de frequências leve. A textura fina perde até 27%, e só na pele DA PESSOA: a máscara de pele (YCrCb) é cruzada com a de pessoa, então embalagem laranja e madeira do fundo não são tocadas, nem olho, boca, cabelo e roupa. O liso é bilateral, em meia resolução e só na caixa da pele (cerca de 20 ms por quadro).
- **Destaque da pessoa** (`blocos[].destaque_pessoa` vira `fundo.destaque = 0,6`): janela de luz do colorista, com o fundo -20% de luz e -22% de cor e a pessoa +5%. Cerca de 12 ms por quadro, com operações nativas do OpenCV.
- **Custo medido** em 3 s reais: 3,6 s sem nada, 7,8 s com pele, 9,0 s com pele e destaque, ou seja, cerca de +40 s num Reel de 30 s.
- **Sem o modelo,** o filme sai como antes. `pele_sem_modelo` só registra; `sem_modelo` fica para o que o diretor pediu.
- **Modelos baixados no boot** em segundo plano (`motor/modelos.py`). `/api/saude` mostra `modelos: {pessoa, voz}` e respeita `EDITOR_PESSOA` e `EDITOR_FALANTE`.
- **Revisão do Crivo: reprovou primeiro, e com razão.** O download em segundo plano no `iniciar.sh` fazia o `wait -n` do fim derrubar o contêiner a cada boot. Corrigido com `disown` e testado no bash. Também pegou dois testes vazios, agora firmes: pele em TODO plano de fala e em NENHUM de cobertura; caixa da pele em tamanho ímpar com fundo cor de pele dentro dela.
- **Pendências:** (1) a máscara roda mesmo em plano sem pessoa (tela gravada), um custo pequeno; (2) sem rede, o primeiro filme de cada worker espera até 20 s pelo download.
- **Testes:** pytest **319 ok**; aceite D 33/33.

## Item 4: quem fala e ditado da equipe (20/11; defeito da cerveja apontado pelo dono)
- **Defeito:** no Reel da cerveja entrou o Ruan DITANDO "vem comigo que eu vou te mostrar…", e não a Lavínia repetindo. Causa: a transcrição não separa falantes; ditado e repetição viravam uma fala só do catálogo, e o resolvedor pegava a primeira ocorrência das palavras.
- **`motor/etapas/vozes.py`:**
  - divide cada segmento nas pausas de 0,30 s ou mais;
  - assina cada pedaço de 0,6 s ou mais (CAM++ local);
  - agrupa as vozes do projeto: A é a principal; B, C… são outras vozes;
  - marca DITADO quando outra voz diz 3 palavras ou mais que a voz A repete em até 40 s.
- **Catálogo:** só junta a mesma voz; a fala ganha `voz` e `ditado` (o id da repetição); o texto para o diretor mostra `vozB DITADO→F..`.
- **Diretor:** nunca usa ditado; voz B só quando várias pessoas falam.
- **Resolvedor:** troca sozinho o ditado pela repetição e avisa. Se não achar, o ditado não entra.
- **Testes:** pytest **324 ok** (5 novos em `test_vozes.py`); aceite D 33/33.
- **Material real da cerveja** (sessão da Lavínia, 18 fontes): voz A = Lavínia; o ditado do Ruan saiu como voz B; nenhuma fala dela fora de A. **v3 da cerveja entregue** pela sessão dela (QA 17/17), com o take dela regravado.
- **v3 do vídeo da cerveja:** pedida à sessão da Lavínia.
- **Revisão do Crivo: reprovou a 1a versão (já publicada por exigência do gancho de commit), e as correções entraram:**
  - (1) o plano B do resolvedor não derruba mais o filme: a 1a tentativa falha, a repetição entra inteira e o problema é retirado;
  - (2) o hash do catálogo leva `vozes.VERSAO` e "modelo de voz presente", então projetos antigos são recatalogados com as vozes;
  - (3) o agrupamento é por centroide e linear (o aglomerativo era cúbico: 400 pedaços levavam 37 s; agora 2000 levam poucos segundos);
  - (4) o ditado é simétrico, e a voz principal é QUEM REPETE (a apresentadora), mesmo quando a equipe fala mais;
  - (5) ditado e repetição colados sem pausa são cortados pela repetição interna;
  - (7) o áudio é lido um arquivo por vez;
  - (8) assinatura só a partir de 0,8 s;
  - (9) chip e cobertura que citam a repetição acham a janela;
  - (10) a repetição nunca é truncada no catálogo.
- **Testes:** pytest **327 ok** (8 em `test_vozes.py`); aceite D 33/33.
- **Rodada 3 (dados reais):**
  - (1) a regravação dela estava no TAKE SEGUINTE, com outras palavras: o ditado agora procura nos 2 takes seguintes (até 90 s do começo; sem `gravado_em` não cruza arquivos);
  - (2) `casa_ditado` passa a exigir trecho contínuo de 3 palavras ou mais, ou 3 palavras de conteúdo; os dois lados com 4 palavras ou mais; e 60% da mais curta e 35% da mais longa (revisão: "que eu vou" casava qualquer coisa);
  - (3) a equipe se espalhava em vários rótulos (B a I): agora é só A (principal) e B (outra pessoa);
  - (4) fala curta sem assinatura vira B pela altura da voz, só se 40% ou mais longe (uma exclamação dela continua dela);
  - (5) busca por índice e `bisect`, sem O(n²).
- **Testes:** pytest com 12 testes em `test_vozes.py`; aceite D 33/33.

## Backup: primeira tentativa em produção falhou (20/11, print do dono)
- O dono colou o link e a tela mostrou "falhou · o Dropbox não confirmou o envio: Node.js v24.20.0". Essa é a última linha de um travamento do Node: o navegador não abriu ANTES do bloco que trata erro, e a mensagem real ficou escondida.
- **Correções:**
  - o `dropbox-enviar.cjs` abre o navegador dentro de try e trata qualquer rejeição ou exceção com uma linha "erro …" legível;
  - a leitura da saída ignora pilha e "Node.js v…";
  - o navegador passa a receber o ambiente da máquina menos os segredos (bloqueio por nome: KEY, TOKEN, SECRET, SEGREDO, SENHA, PEDIDO, R2_…). A lista de permissão de antes deixava de fora alguma variável que o Chromium usa no servidor.
- **Conferido aqui:** com endereço inexistente sai "erro TimeoutError…"; sem navegador sai "erro o navegador não abriu: …".
- O agendador tenta de novo sozinho (1 h depois de uma falha), e o dono pode tocar em "Fazer backup agora".
- **Testes:** pytest **333 ok**.
- **Causa real, achada com a mensagem nova:** "Playwright não encontrado". O pacote instalado só dentro de `packages/kit` não era achado no contêiner. Correções:
  - playwright **global** no Dockerfile, com conferência que derruba o build se não achar;
  - `NODE_PATH`;
  - o envio usa a mesma busca do kit (`comum.cjs`);
  - backup que falhou numa versão anterior tenta de novo no boot da versão nova;
  - `/api/saude` mostra a causa da falha (sem caminhos) e `modelos.navegador`.
- **Resolvido em produção (2e2ac49):** backup **ok** às 15:52 de 20/11. Na pasta "/Creat.MTT Studio/Backup do Editor" estão `editor-backup-20261120-1552.zip` (17 KB) e `editor-memoria-20261120-1552.json`. Os de 19/11 são o teste com dados sintéticos.

## Envio pelo Dropbox no celular "não ia para lugar nenhum" (21/11, relato do dono)
- **Causas prováveis no editor:**
  - (1) o campo de link era `type=url`: colar VÁRIOS links (os 4 vídeos) fazia o navegador barrar o envio em silêncio;
  - (2) o erro da importação aparecia no topo da página, fora da vista no celular;
  - (3) o seletor do iPhone com vídeos do app Dropbox baixa tudo para o celular antes de entregar e pode voltar vazio;
  - (4) o link de transferência do Dropbox (`/t/`) não baixa direto.
- **Correções:**
  - caixa de links que aceita um ou vários (extrai cada `https://`), valida no próprio celular se é Dropbox/Drive, manda cada um e mostra o resultado EMBAIXO do botão ("N links na fila" e o erro de cada link que não entrou);
  - seletor que volta vazio mostra aviso e aponta para o link;
  - texto fixo "vídeos que estão no Dropbox: cole o link, o servidor baixa direto";
  - link `/t/` recusado na hora, com instrução (Compartilhar > Copiar link da pasta).
- **Testes:** pytest **335 ok**; aceite D **34/34** (novo: 2 links colados juntos, um entra e o outro diz por quê).

## Item 3: limpeza de voz por IA (21/11)
- **Achado:** a montagem tinha o encaixe do DeepFilterNet (pip com torch), mas ele NUNCA foi instalado no servidor: os filmes saíam sem limpeza por IA, contra a regra do dono para áudio sem microfone.
- **Escolha (pesquisa do Radar):**
  - **DeepFilterNet3 em ONNX**: nativo em 48 kHz, sem torch (que pesaria 210 MB) e sem Rust; ~30x mais rápido que o tempo real; MIT/Apache.
  - O código do frontend numpy foi ADAPTADO para dentro do motor (`etapas/montagem/dfn3.py`), lido linha a linha. Os 3 ONNX (8,6 MB) são baixados com sha256.
  - **Reserva:** RNNoise (`arnndn`), que já vem no ffmpeg do servidor.
- **Medidor de voz** (`motor/qualidade_voz.py`): DNSMOS P.835 da Microsoft (ONNX, CC BY 4.0). Dá nota de 1 a 5 para a VOZ (SIG), o FUNDO (BAK) e o conjunto (OVRL).
- **Mistura escolhida sozinha, por fonte** (`limpeza.auto`, padrão do resolvedor e do story), entre 0 / 0,6 / 0,7 / 0,8 / 0,9 / 1,0:
  - a maior nota geral sem a nota da voz cair mais de 0,15;
  - empate fica com a mais natural;
  - 100% de IA só se ganhar de 90% por mais de 0,1;
  - fonte já limpa (a IA não melhora 0,1) fica com o ORIGINAL;
  - mistura fixa no EDL continua valendo por peça.
- **Detalhes:** 2 s de contexto antes de cada peça só para a IA; peça longa em blocos de 30 s; amostra de 30 s das peças de mais energia.
- **Medido em gravação real** (Mesa de Negócios, evento barulhento e com áudio estourado):
  - a: geral 1,08 → 2,14 (100%);
  - b: geral 1,24 → 2,60 e voz 1,57 → 3,57 (80%);
  - story da Lavínia já tratada: 2,17 → 2,76 (70%).
- **Boot e saúde:** o boot baixa os modelos; `/api/saude` mostra `limpeza_voz` e `medidor_voz`.
- **Revisão do Crivo** (aprovado com ajustes; tudo aplicado):
  - mistura por peça e por fonte;
  - opção 0 e teto do 100%;
  - amostra pela energia;
  - blocos para peça longa;
  - trava e nova tentativa do modelo;
  - `cfg` None;
  - `atenuacao_db` marcado obsoleto;
  - testes que provam a mistura no áudio (proporção entre 220 e 440 Hz), o alinhamento e a emenda dos blocos.
- **Testes:** pytest **343 ok** (7 em `test_limpeza_voz.py` e 2 no medidor); aceite D 34/34. Os testes não baixam modelo (`EDITOR_MODELOS_BAIXAR=0` no conftest).
- **Erro meu, registrado:** um teste do medidor foi ao repositório vermelho por ~3 min (o push leu a última linha da saída, não o código de saída). Desde então, publico só com código 0 do pytest e do aceite.

## Link do Dropbox e envio do celular "ainda com problema" (21/11, relato do dono)
- **Causa achada:** a conta do Dropbox é de **equipe (Mttcreatt)**. Testado com links reais:
  - link público baixa normal (12 MB em segundos);
  - link restrito devolve a página "Log in to Dropbox" com código 200;
  - o editor punha o link na fila, o worker falhava minutos depois e apagava a linha. Para o dono, o arquivo **sumia sem aviso**.
- **Correção:** o motor confere o link na hora (`importar.sondar`). Pede só 1 byte, com prazo total de 15 s. Embaixo do botão aparece:
  - link restrito → o passo a passo "Qualquer pessoa com o link" (Dropbox ou Drive);
  - link apagado ou 404 → "não existe mais";
  - pasta que o Dropbox não entrega em zip → "cole o link de cada vídeo".
  - Rede lenta não bloqueia: vira aviso e a importação segue.
- **Tela:** motivo igual aparece uma vez, com os nomes dos links ("2 de 2 links (A.MOV, B.MOV): …"). Confere 4 links de cada vez.
- **Envio do celular:**
  - aviso "o celular está preparando os vídeos, espere nesta tela" entre tocar em Escolher e o iPhone entregar os arquivos;
  - partes de 16 MB em tela de toque: queda do 4G ou tela bloqueada perde no máximo 16 MB.
- **Revisão do Crivo:** aprovado com 5 ajustes, todos aplicados:
  - título de login casado só no começo (nome de arquivo não engana);
  - Drive privado que redireciona para accounts.google.com → mensagem certa;
  - prazo total da sondagem;
  - fechar o HTTPError;
  - aviso do seletor some em 3 min no Safari antigo.
- **Testes:** pytest **353 ok** (10 em `test_sondar.py`); aceite **35/35** (novo: link restrito recusado na hora, passo a passo uma vez só).

## Item I: verificação de fatos (21/11, regra permanente do dono)
- **Regra do dono:** "na legenda você bote de forma correta, porque a pessoa pode ter falado errado".
- **Onde roda:** no começo da montagem, antes de renderizar (`motor/etapas/fatos.py`).
  1. Acha todo número de PRODUTO que vai para a tela: ml, litro, kcal, g, %, R$, graus. Vale para a legenda e para os cartões do motion. Tempo ("30 anos", "3 dias") não entra.
  2. Uma chamada ao cérebro (Opus 5.5, esforço médio) com busca na web (`web_search_20260209`) e o quadro da fonte no momento de cada número (o rótulo é lido pela visão).
     - Ordem das fontes: fabricante, depois rótulo no vídeo, varejista grande só como reserva.
     - Preço e oferta só se confirmam pelo pedido do cliente.
     - Item sem URL de fonte não vale.
  3. Corrige na tela o número e, se for o caso, a unidade. A fala fica como foi dita.
     - Correção que não cabe vira "sem fonte", nunca passa como feita.
  4. O relatório fica em `edl.qa.fatos`, com fonte, data, trocas e custo.
- **QA `fatos`:**
  - segura a entrega com número sem fonte ou quando a conferência falha;
  - sem a chave do cérebro, só avisa;
  - o dono libera à mão em `edl.qa.numeros_confirmados`.
- **Outras regras:**
  - `legenda_x_fala` não conta contra o recall a palavra corrigida (falou 269, a tela diz 275);
  - cache por conteúdo: refazer a versão não paga de novo; resposta incompleta não entra no cache.
- **Custo estimado:** cerca de US$ 0,05 a 0,15 por versão com números (tokens + US$ 0,01 por busca). Vai para o livro de gastos como `fatos`.
- **Caso de teste (o real do dono):** "Amstel Ultra garrafa 269 ml" → "long neck 275 ml" e 71 → 72 kcal, na legenda e no cartão.
- **Revisão do Crivo:** aprovado com ajustes, todos aplicados:
  - âncora no trecho do motor;
  - troca da unidade;
  - recall da legenda;
  - cache de resposta incompleta;
  - `t0` fora do try;
  - liberação normalizada.
- **Testes:** pytest **365 ok** (12 em `test_fatos.py`); aceite 35/35.

## Item J: voz de fora no tom de sala (22/11; o "vale…" do Xande no fim da cerveja v2)
- **Causa** (análise das stems pela sessão da Lavínia): o tom de sala difuso saiu de C18 49-55 s, que tinha conversa baixa da equipe.
  - A conversa estava longe do microfone e fora da transcrição.
  - O QA só media a modulação do stem difuso, que é lisa por construção, e por isso passava.
- **Resolvedor** (`_silencios`): mede a variação RÁPIDA do envelope (envelope menos a média de 0,5 s, sem os buracos -90).
  - Acima de 5 dB é sílaba: o vão é descartado.
  - Entre 2 e 5 dB, o vão só perde preferência.
  - Música crescendo, freezer e compressor mudam devagar e não contam.
- **QA tom_sala_sem_voz:** o trecho ORIGINAL da fonte passa pela régua da conversa no som direto (≥ 0,4 s de voz acima do piso + 6 dB).
  - O piso é o menor entre o do arquivo e o do próprio trecho, para pegar fonte quase toda fala.
  - Erro ao ouvir vira NÃO VERIFICADO e bloqueia.
- **Revisão do Crivo:** aprovado com 4 ajustes, todos aplicados:
  - piso local;
  - falha fechada;
  - desvio sem deriva e sem buracos;
  - testes para fonte quase toda fala, música e fonte ausente.
- **Testes:** pytest **371 ok** (6 em `test_tom_sala_origem.py`); aceite 35/35.
- **Pendente** (anotado pela sessão da Lavínia): ditado entre arquivos diferentes (comparar o texto do B com as peças A do projeto inteiro).

## Rodada de 23/11 (segunda)
- **Ditado entre arquivos** (pendência da sessão da Lavínia; commit 3d66cb5):
  - **O problema:** o ditado ficou em a003 e a repetição em a005, fora da janela dos 2 takes seguintes.
  - **A correção:** sem par por perto, `vozes._repeticao_no_projeto` procura no projeto inteiro:
    - outro arquivo e outra voz;
    - gravado depois e em até 3 h, ficando com a repetição mais próxima;
    - pré-filtro por palavras de conteúdo, calculado uma vez.
  - **Ressalva:** esses pares de longe não decidem quem é a voz principal (um retake da apresentadora viraria "ditado"). Só valem de B para A.
  - **Datas:** naive e aware convivem (a do nome do arquivo vale como -03:00).
  - **Revisão do Crivo:** reprovou na 1ª passada (TypeError de fuso, retake virando ditado, custo, teste fraco); tudo corrigido e testado.
  - **Testes:** pytest **374 ok**; aceite 35/35.
- **Pesquisa semanal de ferramentas** (Radar), em `docs/stack-ferramentas-2026.md`, seção "Revisão do editor, 23/11/2026":
  - nada comprovadamente melhor para transcrição, limpeza de voz, matting e estabilização: manter;
  - para o rosto do item 4: YuNet (MIT) + SFace int8 (Apache-2.0), pelo OpenCV, em CPU;
  - para OCR de rótulo: RapidOCR (Apache-2.0), a testar com fotos reais;
  - a conferir: o pooling do CAM++ (sherpa-onnx 2.0.2 corrigiu count_include_pad).

## 23/11, fim do dia
- Verificação de fatos: número sem fonte ou conferência que falhou vira AVISO ("confira antes de postar"), não trava a entrega. Motivo: o dono vai usar o editor sozinho por um tempo e não teria como liberar a trava. A correção automática do número errado continua. pytest 374 ok, aceite 35/35.

## Rodada de 24/11 (leve)
- Saúde no ar ok (ff1203d), modelos todos carregados, backup em dia (23/11 16:27). Nada em falha.
- Rodada só de conferência: o dono avisou em 23/11 que está com pouca cota; trabalho novo fica para quando ele pedir.

## 25/11: o editor ouve a música (1ª peça do "filme guiado por música e emoção", pedido do dono)
- **Pedido do dono:** "instale tudo o que falta": emoção, cenas, sentir o momento. A sessão do Itaitu confirmou o que foi feito lá à mão e o motor não faz.
- **Feito agora** (`motor/musica.py`): ao registrar uma trilha, o motor mede:
  - a **virada** (o segundo em que a música estoura), encostada na batida;
  - as **partes** da música, com energia de 1 a 5;
  - o **tom** (`musica.combina` diz se duas músicas emendam no mesmo tom).
- **Catálogo:** mostra virada, partes e tom ao diretor.
- **Resolvedor:** se a direção marca o bloco do auge (`trilha.drop_em`), a música começa no ponto que faz a virada cair no começo desse bloco.
  - O deslocamento é em batidas inteiras, com entrada suave.
  - Só vale com bpm medido e música que cobre o filme.
- **Revisão do Crivo:** reprovou a 1ª versão (estalo na entrada); corrigido. pytest 378 ok; aceite 35/35.
- **Limite:** vale para trilha registrada daqui para a frente. As que já estão na biblioteca precisam ser registradas de novo para ganhar o mapa.
- **Falta** (aguardando a sessão do Itaitu commitar `projetos/itaitu-viagem/motor-render/` para portar com os limiares calibrados):
  - movimento, tremor e nitidez a cada 0,5 s, com a decisão de estabilizar;
  - transição casada com o movimento da câmera;
  - câmera lenta só de fonte 60/120 fps;
  - ampliação máxima do recorte;
  - cor viva como padrão;
  - banco de sons reais;
  - modo de filme sem fala (cortes pela música);
  - emenda de duas ou mais músicas no mesmo tom.

## 25/11: filme guiado por música, peças M2, M3 e M4 (equipe de 9 agentes: construir, revisar, corrigir)
- **M2, olho no movimento** (`motor/movimento.py`):
  - mede tremor, pan e nitidez a cada 0,5 s (Lucas-Kanade, px a 1080);
  - a análise grava `sinais.movimento` (opcional, com cache; falha vira aviso);
  - o catálogo diz ao diretor quais clipes preferir e quais evitar;
  - o resolvedor escolhe o trecho mais firme, decide `estab` pela série, avisa quando o recorte amplia a fonte e troca a cobertura por um clipe nativo equivalente;
  - o whip segue o sentido da câmera.
- **M3, filme sem fala** (`motor/etapas/sem_fala.py`):
  - cortes na batida;
  - duração do plano pela energia da parte da música;
  - plano mais forte na virada;
  - ordem cronológica;
  - câmera lenta só de fonte rápida.
- **M4:**
  - emenda de 2 ou 3 músicas (ponto de troca em fronteira de parte, tom que combina, bpm até 6% casado);
  - cor viva (nenhum look padrão abaixo da saturação da fonte; medida antes/depois; aviso);
  - câmera lenta verdadeira (`fps_fonte * vel >= fps_saida * 0,95`).
- **Revisão do Crivo:** as três peças saíram "aprovado com ajustes"; ajustes aplicados.
- **Testes:** pytest **449 ok**; tipos ok; aceite 35/35.
- **Limite honesto:** tudo validado só com áudio e vídeo sintéticos. Os limiares (1,5 e 4 px, 40 e 900 px/s, nitidez 0,45) não foram calibrados em material real. Próximo passo: remontar o Itaitu pelo editor e comparar.
- **Auditoria de lacunas** (`docs/lacunas-25-11.md`): 48 confirmadas.
- **Backup em FALHA desde 23/11 16:27:** todos os pedidos de arquivo do Dropbox respondem "fechada, excluída ou nunca existiu", inclusive um criado em 24/11. Causa do lado da conta (espaço ou plano, não confirmado). Aguardando o dono.
- **Comando oficial de 25/11:** pesquisas e plano em `docs/`. O crítico barrou as ondas de cor e exportação até 8 correções; podem começar a Onda 0, a 1 (leitura da gravação) e a 5a (modos como dados).

## 25/11: backup resolvido pelo Cloudflare R2
- **Causa da falha desde 23/11:** os pedidos de arquivo do Dropbox abrem como "fechada, excluída ou nunca existiu", até um criado agora.
  - O dono confirmou isso pelo próprio navegador, logado.
  - A equipe está em "Versão de avaliação do Dropbox Standard" (painel do Admin).
- **Solução:** `backup.py` ganhou o R2 como destino principal, por API.
  - Grava em `<bucket>/backup-editor/AAAA-MM-DD/`, confere o tamanho de cada arquivo e guarda 30 dias.
  - O Dropbox fica como segunda cópia.
  - O backup tenta na hora quando ganha destino novo.
  - A saúde mostra `r2` e `copias`.
- **Railway:** com token do dono, guardado no cofre da sessão (o valor nunca apareceu), entraram `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` e `R2_BACKUP_BUCKET=creat-editor-midia`.
  - Os vídeos continuam no disco do servidor: `EDITOR_ARMAZENAMENTO` não mudou. A virada para o R2 exige migração e CORS no bucket, a fazer com teste.
- **Conferido em produção:** backup ok em 25/11 04:00:59, cópia R2, arquivos no bucket. pytest 452 ok.

## 25/11: redesenho, onda 1 "Polegar" (no ar) e a conversa com o editor (em construção)
- **Onda 1 do redesenho, publicada e conferida em produção (versão 243ab9d):**
  - navegação inferior no celular e barra de comando com um botão só por fase ("Começar a edição" grava o pedido e depois fecha o envio);
  - telas por fase em vez de uma página comprida; ponto de saúde ligado ao `/api/saude`;
  - rótulo "Aguardando material" no lugar de "recebendo";
  - a revisão reprovou 5 pontos (Enter mandava o pedido, ordem fechar/pedido, link não importado, ponto de saúde fixo, primeiro toque perdido depois de digitar); todos corrigidos, com checagem no aceite provada falhando antes da correção.
  - Aceite 46/46. **Limite:** testado em Chromium emulando celular; não em iPhone/Safari de verdade.
- **Direção de arte** em `docs/design-editor-25-11.md` ("Mesa de corte"). Ondas 2 a 5 (gaveta, avisos, ícones, Caderno em telas, "o relógio vira o filme") seguem na fila.
- **Conversa com o editor** (pedido do dono: falar por texto ou áudio, o editor responde e pergunta de volta, e a tela mostra ao vivo o que está sendo feito e com que ferramenta):
  - mapa do que já existe e três pesquisas (agente, voz, ao vivo) em `docs/conversa-*.md`; plano vencedor do júri "Fio Único" em `docs/plano-conversa-25-11.md`;
  - **decisão registrada:** a conversa entra LIGADA, com chave na tela para desligar, teto de US$ 3 por dia travado no código e o custo de cada resposta à vista;
  - o crítico barrou a onda 1 "como estava" (7 correções bloqueantes); a equipe fecha o plano com elas antes de escrever código;
  - construção das ondas 1 (fio da conversa) e 2 (mesa ao vivo) em cópia de trabalho separada, com revisão de código, de segurança (instrução escondida em fala de vídeo, custo) e uso real no celular.
  - **Custo:** a estimativa do plano (≈ US$ 0,94 por conversa de 20 turnos) NÃO foi medida; o teste real, até US$ 1, faz parte da revisão.
- **Em paralelo, cada uma na sua cópia:** M6 (sons reais do banco de 7.546 sons) e Cloudflare/Drive (entrega do filme aprovado pelo R2, guarda do material, pasta do Drive por link).
- **Ordem de juntar:** M6, depois Cloudflare/Drive, depois a conversa; a cada junção, pytest e aceite completos antes do push e conferência da versão no ar.

## 25/11: M6, sons reais do banco no filme
- **O que faz:** a direção pede som por bloco (`blocos[].sons`: ambiente ou pontual, ligado ao momento que aparece na imagem). O resolvedor escolhe no índice (7.546 sons Sonniss GDC, só o principal de cada um) o primeiro e duas reservas; o motor baixa do archive.org ANTES do render e mixa com ducking sob a fala.
- **Nunca sintetiza no lugar:** pedido sem som no banco vira aviso "pedido sem som"; `edl.sfx` não foi reaproveitado justamente porque cai no sintético.
- **Onde vive:** o índice (só metadados, 2,7 MB) vai dentro do motor (`motor/sons_reais/indice.jsonl.gz`) e vira sqlite em `dados/cache/sons_reais/` na primeira consulta. O áudio fica só no cache (fora do backup e nunca servido).
- **Licença:** o som do banco só sai dentro do filme pronto. O stem `reais` nunca é servível (403 em GET e HEAD, com teste).
- **Rede educada:** um download por vez no servidor inteiro, tetos por filme (8 sons, 150 MB, 240 s), respeita `Retry-After`, para tudo com 403, só fala com `archive.org` e servidores `ia<n>`/`dn<n>`; o EDL é conferido contra o índice antes de qualquer pedido.
- **Falha segura:** som que não chegou não piora o filme (o som direto só abaixa 6 dB onde o ambiente real entrou de fato); ganho com teto de +30 dB; trecho quase mudo é trocado pela reserva; som com voz sai (triagem local e QA, só o culpado vai para a lista negra).
- **Revisão:** 10 achados do Crivo e 7 da Muralha, todos corrigidos com teste (o mais grave: o stem com o som do banco ficava servível).
- **Testes:** pytest **520 ok**, tipos ok, aceite **46/46** (em portas próprias: as equipes em paralelo disputam a 3000/8788).
- **Prova real (feita por mim, fora dos testes):** riacho (trecho de 12 s de um WAV de 102 MB) e porta-malas (FLAC inteiro, MD5 conferido) baixados em 8,9 s, 3 pedidos, 8,5 MB; redirecionamentos para `dn601305.us` e `ia803106.us`, aceitos; triagem de voz com o faster-whisper de verdade, 0 palavra.
- **Limite honesto:** nenhum filme real foi montado com som do banco ainda. Falta ouvir: se o diretor pede os sons certos, se o nível de −26 dB do ambiente fica bom sob fala, e se o pontual cai no instante da ação. Chave para desligar: `EDITOR_SONS_REAIS=0`.

## 25/11: Cloudflare e Drive, correções da revisão tripla (código, segurança, QA)
- **Entregas (R3):**
  - retirada que cai na rede fica "retirando" com hora marcada; o laço a tenta de novo e nunca desiste;
  - a tela diz "Ainda não consegui tirar este filme da página", nunca "Retirada" antes da hora;
  - fila roda uma entrega e um espelho por vez (`banco.UMA_POR_VEZ`);
  - a etapa relê o projeto depois do upload: uma v1 atrasada não apaga a v2 nem passa por cima de "substituida";
  - trocar o cliente tira a cópia e a legenda do cliente antigo;
  - o editor só apaga o que tem o metadado `projeto` dele;
  - pasta com arquivo de outro projeto ou do chat ganha sufixo do projeto;
  - META gravado com IfMatch/IfNoneMatch (testado no R2 real) e índice com passada de conferência;
  - depósito de entregas igual ao do backup ou do material desliga as entregas, com aviso na saúde;
  - cliente "-" volta 422; o dono pode aprovar sem mandar para a página (aviso de que ela é pública);
  - motivo para o dono em pt-BR, e o detalhe técnico em `motivo_tecnico`, mascarado por valor (`backup.sem_segredo`).
- **Drive:**
  - o link colado sai de `jobs.entrada` depois de baixado, e o backup nunca leva link;
  - hosts do Google restritos ao download do Drive;
  - avisos sem nome de exceção e sem a palavra "motor";
  - "vão aparecendo aqui conforme baixam".
- **Espelho (desligado):**
  - sha256 no metadado;
  - "sem_original" não volta à fila;
  - teto padrão de 4 GB (os 10 GB grátis são da conta);
  - ligado, ganha um worker só dele (`--sem espelho` nos da edição).
- **Site:**
  - selo com 13 px e "Baixar da página";
  - sem "R2" no Caderno;
  - links que falharam ficam no campo;
  - mesma fonte no resultado e erro 422 legível.
- **Aceite:** apaga só os próprios prints.
- **Testes:** pytest 526 ok (antes 505); tipos ok; aceite 64/64 (antes 61).

## 25/11: Cloudflare e Drive no ar (junção, testes e conferência em produção)
- **Junção** da cópia de trabalho na `claude/editor-creat` (d678aa0), com o M6 já dentro. Um conflito só, neste arquivo.
- **Testes depois da junção:** pytest **594 ok**, tipos ok, aceite **64/64**, todos com saída 0.
- **Produção:** versão d678aa0 conferida no ar. Entraram no Railway `R2_ENTREGAS_BUCKET=creat-entregas` e `R2_ENTREGAS_PUBLICO` (endereço público do r2.dev, não é segredo). `GET /v1/saude?entregas=1`, logado: `{"ligado": true, "permissao": "ok"}`.
- **Escrita provada:** com a mesma chave da produção, gravei e apaguei um arquivo de teste em `creat-entregas/_teste-editor/` (não sobrou nada).
- **Não provado ainda:** nenhum filme real foi aprovado em produção com a entrega ligada, e nenhuma pasta real do dono foi colada em produção. O download de pasta do Drive foi provado pela equipe com pastas públicas reais, fora da produção.
- **Guarda do material (espelho):** fica desligada até o dono autorizar o custo de saída do Railway.
- **Decisão do dono em aberto:** a página de entregas é uma só e pública; o `?c=` filtra a vista, mas não separa clientes. A tela avisa antes de aprovar e deixa aprovar sem mandar.

## 25/11: conversa com o editor e mesa ao vivo no ar (junção, teste real e correção da voz)
- **Junção** da cópia de trabalho da conversa (ondas 1 e 2, 5 commits) na `claude/editor-creat` (fc45485). Oito conflitos, todos resolvidos mantendo os dois lados (rota do proxy, banco, config, montagem, pipeline, worker, estilo, aceite).
- **Pontos de encontro corrigidos na junção:** etapa de fundo (entregas/espelho) que morre não vira "um passo da mesa parou", só o aviso claro; a busca dos sons reais virou passo da mesa (`montagem.sons`, Eco). Teste novo: `tests/test_juncao_conversa.py`.
- **Testes:** pytest **690 ok** (5 pulados, 2 pagos fora), tipos ok, aceite **111/111**, todos com saída 0.
- **Teste real com a API da Anthropic** (motor local, dados temporários, chave lida do Railway só em memória; nada tocou a produção): 5 chamadas, **US$ 0,0709**. Primeira resposta US$ 0,037 (grava o cache); as seguintes de US$ 0,008 a US$ 0,013. Provado: olhar o projeto com ferramenta, pergunta com botões, resposta por toque, cartão de pedido montado sozinho, cartão cancelado por mensagem nova, histórico inteiro aceito depois de reiniciar o motor.
- **Defeito achado na conferência em produção e corrigido (372b0cf):** todo áudio voltava "não entendi" em 1,8 s. O teto de memória virtual do Whisper (RLIMIT_AS, 4 GB) não cabe na máquina do Railway (mais núcleos, mais memória virtual). Agora a API vigia a memória REAL do grupo (padrão 2048 MB), o filho usa até 4 threads e a falha vai para o log. Conferido no ar: áudio de 5 s transcrito em 3,2 s.
- **Produção (372b0cf):** conversa ligada, teto US$ 3,00, gasto do dia US$ 0,00, fio v2 abrindo, lista com o campo `espera`, tela do projeto no celular sem erro de console nem rolagem lateral. Nenhuma variável nova no Railway (vale o padrão).
- **Rastro meu no projeto do dono:** o teste de voz em produção deixou duas linhas no fio do "Itaitu daily" ("não entendi o áudio" e "Ouviu 5 s"). Não há rota para apagar evento.
- **Não provado ainda:** conversa com um filme real em andamento (mesa ao vivo num render de verdade); "sem sinal · reconectando…" (teste manual); microfone e teclado no iPhone/Safari reais; `pip-audit` e `pnpm audit`.
- **Fica para a onda 3:** trocar música e refazer etapa como ações da conversa; prazo de guarda das conversas (proposta: 90 dias); tela no Caderno para ver e apagar regras; apagar projeto.

## 25/11: onda 3, correções da revisão tripla (motor e site)
- **Troca de música:** "Trocar a música de novo" passa pelas mesmas regras da troca (versão aprovada não troca). A troca que falha não leva mais o projeto a "erro": volta para "entregue" com o motivo, e a versão de antes continua pronta.
- **Apagar projeto:** agora leva junto os quadros e clipes do projeto guardados nos caches, a conferência por IA e a dos números, e os casos de referência. A prévia conta as respostas de cliente ainda não vistas e diz que as regras ficam com o texto do ajuste. Enter com o nome incompleto diz o que falta.
- **Segurança:** o proxy barra `..%2F`, `..%5C` e pedaço com ponto no começo. Ids validados sem aceitar quebra de linha. O aviso "repete algo que veio de fora" vale para nota e pedido. `onde_esta` só devolve id e função de bloco no formato da direção. Apagar conferência sem janela de corrida. Palavra igual à da casa não apaga as duas.
- **Site:** abrir o endereço de um projeto sem sessão volta para o mesmo projeto depois da senha. Entrar e Novo projeto só acendem com a página pronta (antes do JavaScript, o envio comum punha a senha no endereço). A linha do prazo da conversa avisa que o backup guarda por mais tempo. O cartão de nota diz que cabem 50.
- **Testes estáveis:** o teste do rascunho do SSE ignorava o rascunho vazio de fim de bloco (falhava 2 em 5, desde 3603428). O aceite para com frase clara se a porta estiver ocupada, mata o next-server que escapa do grupo do npx e registra "lendo" antes do clique.
- **Testes:** pytest **759 ok** (5 pulados, 2 pagos fora), tipos ok, aceite **132/132**, todos com saída 0.

## 25/11: onda 3 no ar (junção, testes e conferência em produção)
- **Junção:** `wt-onda3` entrou direto na linha principal (sem conflito), 58 arquivos. Rodei tudo de novo na árvore principal: pytest **759 ok** (5 pulados, 2 pagos fora), tipos ok, aceite **132/132** nas portas 3084/8884, todos com saída 0. Publicado em 18db415.
- **Conferido em produção (celular simulado, tema escuro, custo zero):** `/v1/conversa` traz `retencao_dias: 90`; o proxy devolve 404 para `..%2F`, `%2e%2e` e `%20`; projetos, memória e gastos seguem abrindo. Abrir o endereço de um projeto sem sessão pede a senha e volta para o mesmo projeto, sem senha no endereço. Criei o projeto "TESTE onda 3 (pode apagar)", abri a prévia do apagar (o que vai, o que fica), nome incompleto deixa o botão apagado, nome certo apaga, volta para a lista com "Projeto apagado." e o projeto dá 404; livro de gastos igual. Caderno mostra o prazo de 90 dias com o aviso do backup, sem rolagem lateral; zero erro de console ou de rede.
- **Não visto em produção:** apagar regra (as 17 regras, 12 conferências e 9 palavras de hoje são todas "Fixa da casa"; o botão só aparece em regra nascida de ajuste do dono), os cartões de refazer etapa, trocar música e anotar com o cérebro real (gastaria cota; provados só com o cérebro falso), a troca de música num filme real e a limpeza de caches sobre uma montagem real.
- **Limites conhecidos:** troca de música que falha na montagem (não na direção) ainda leva o projeto a "erro"; limite de 50 notas por projeto, sem apagar nota; "v1" e "V1" misturados em frases antigas.
- **Decisões tomadas pelo dono delegar ("pode executar tudo que achar melhor"):** a guarda do material bruto no Cloudflare continua desligada (os originais já ficam no Dropbox e no Drive dele); a página de entregas fica como está.

## 26/11: a pasta do Drive do dono não entrou (disco de 500 MB) e o aviso mentia
- **O que houve:** o dono criou "Super Kal - Black" e colou a pasta do Drive "VÍDEO BLACK" (15 vídeos, 330 MB, iPhone 16 Pro e Pro Max, vertical, 30 fps, sem HDR). O ingest recusou duas vezes com "Sem espaço no editor para 0.3 GB (livre: 0.4 GB)", mas a mesa mostrava "O arquivo a001 não pôde ser lido e ficou de fora". O volume `/dados` do Railway tem **500 MB** (tamanho do plano de teste; o plano hoje é Hobby, que vai a 5 GB).
- **Conferido:** a pasta lê e baixa com o código do editor (lista em 1 chamada, 3 arquivos baixados e lidos com ffprobe na nuvem, apagados depois).
- **Corrigido no editor:** quando a falha é disco cheio, o aviso da mesa diz "Nada foi importado: faltou espaço no disco do editor", com o tamanho do material, o espaço livre e a folga. `/v1/saude` e `/api/saude` ganharam `disco: {livre_gb, total_gb}`.
- **Não deu para fazer daqui:** aumentar o volume. A API pública do Railway não tem a operação; a interna tem (`volumeInstanceResize`), mas a trava de segurança da sessão bloqueou a chamada. Fica com o dono: volume `creat-mtt-studio-volume` → Settings → Live Resize → 5 GB (cobra só o espaço usado). Antes de tentar, rodei um backup do editor (Cloudflare e Dropbox, 26/11 00:32 UTC).
- **Teste firmado:** o aceite da sessão vencida (A1.23) oscilava desde a onda 3: o toque em Enviar e a consulta de fundo mandam para a senha ao mesmo tempo, e o `waitForURL` estourava com ERR_ABORTED. Agora o teste olha o endereço em laço e aceita os dois caminhos válidos (a mensagem sai da fila ao voltar, ou o texto fica guardado no campo).
- **Próximo:** 5 GB resolve este vídeo, mas é pouco para um editor. O caminho é guardar o material pesado no Cloudflare (a guarda já está construída e desligada) ou subir o plano do Railway (Pro, volume de 50 GB). Levar a conta ao dono.

## 26/11 (noite): primeiro anúncio de diálogo pelo editor (Super Kal, Black) e o que ele expôs
- **Disco:** com o "pode aumentar o disco" do dono, o volume foi de 500 MB para 5 GB (`volumeInstanceResize`, sem queda). A pasta do Drive entrou (15 vídeos em ~1 min) e o pedido do dono foi gravado no projeto `p_d79b29f853` (anúncio, modo ultra, várias vozes).
- **Produção não entregou:** V1, V2 e V3 foram seguradas pela conferência e o projeto parou em "precisa de olho humano". Motivos repetidos: `fala_cortada` (diálogo com falas coladas), `legenda_x_fala` (64 a 69%), `voz_externa` (som direto do plano de apoio com conversa), `cobertura_sintonia` (segunda câmera com rosto sobre a fala, sem sincronia entre câmeras), `frase_repetida`/`tom_sala_sem_voz` (o tom de sala foi tirado de trecho com a equipe conversando).
- **Outra sessão publicou na mesma linha** (45ecc19, página de entregas) e o Railway reiniciou o editor no meio da montagem. O job voltou sozinho em ~2 min. Falta: o serviço do editor só publicar quando muda `projetos/editor-creat/**` (watch paths).
- **Crédito da Anthropic acabou** no meio da noite ("credit balance is too low"): depois de 3 direções em produção e 2 no ensaio, a API passou a recusar. Sem recarga, o editor não dirige nem conversa.
- **Entrega da noite (feita na nuvem da sessão, com o motor do editor):** transcrição refeita com `large-v3` e vocabulário do pedido (o `small` errou Guerreiro, Sisal, Bacia do Jacuípe), direção nova, `ajustar_cortes` e tom de sala trocado por trecho sem voz. Filme de 44 s no Dropbox, em `Creat.MTT Studio/Super Kal - Black Friday/0 - Para aprovar/Vídeos`. Sem música (a biblioteca de trilhas do editor está vazia, em produção também) e com o fecho da creat.MTT (não há logo do Super Kal cadastrada).
- **Lacunas do editor que este trabalho provou (prioridade):** (1) transcrição grande com vocabulário do pedido por padrão; (2) corte de fala pelo áudio já na montagem (`ajustar_cortes` automático); (3) tom de sala nunca de trecho com voz; (4) conferência que entenda diálogo de duas pessoas e duas câmeras (sincronia entre câmeras pelo áudio); (5) biblioteca de trilhas com licença; (6) marca do cliente cadastrada (logo) e fecho com ela; (7) o dono poder assistir a versão segurada pela conferência, com os motivos ao lado.


## 26/11: onda 4, correções da revisão tripla (código, segurança, QA), cópia wt-onda4
- **Aceite firme (A1):** o recado "800 × 800 px" da ficha da marca só aparece depois de a ficha reler a lista; o 5.6b deixou de ler o estado antigo.
- **Segurada no fluxo do ajuste (A2):** com a V1 entregue e a V2 segurada, "Assistir a V2 segurada" abre a V2 por cima do player da V1. Antes o botão não mostrava nada. Aceite novo 6.4e.
- **Motor:**
  - a sincronia guarda o `s0` original: a 2ª montagem grava o mesmo EDL e não renderiza de novo (A3);
  - câmeras ligadas com mais de 60 s de diferença têm a busca centrada no `gravado_em` (A8, campo opcional `edl.fontes[].gravado_em`);
  - o corte dentro de pausa de 180 ms ou mais anda para dentro dela e passa na régua (A4);
  - o batimento do ouvido fino repete a última frase e a fração (A6);
  - tom de sala de outro ambiente só no diálogo (A9);
  - "que" ou "de" sozinhos não cobrem murmúrio (A10).
- **Segurança:**
  - logo até 16 milhões de pixels, uma imagem decodificada por vez (A7/S1);
  - o proxy lê o corpo por blocos e para em 8 MB (S2);
  - `pillow>=11` (S5);
  - a tarefa do filho é criada com permissão 0600 e o filho abre sem `preexec_fn` (S6).
- **Site:** nome de cliente de 60 letras não cria rolagem lateral (QA-A1); o Caderno diz que o mascote ainda não entra no filme (QA-A3).
- **Ficou, com motivo** (`docs/plano-onda4-26-11.md`, seção 10):
  - padrão `turbo` pelo critério de memória do plano, sem prova de que acerta os nomes do Black (A5);
  - logo sobre `null` do diretor, que é a decisão D48 (A9);
  - "não baixa" é visual (S3) e as evidências do QA continuam servidas com a sessão (S4);
  - `conversa/ouvir.py` ainda usa `preexec_fn`.
- **Testes:**
  - pytest **896 ok** (6 pulados, 2 pagos fora);
  - tipos ok e `equipe.json` idêntico;
  - aceite **147/147** (antes 144), saída 0 duas vezes seguidas nas portas 3091/8891.
- **Prova de que os testes novos falham sem a correção:** sem as correções do site, o aceite ficou em 145/147 (5.6g com `scrollWidth` 470 e 6.4e sem a segurada). Sem a de sincronia, 7 testes do pytest falham.
- **Sem push, sem deploy, sem chamada paga.**

## 26/11: onda 4 no ar (ouvido fino, corte pelo som, tom de sala limpo, conferência de diálogo, marca do cliente, versão segurada)
- **Junção:** `wt-onda4` (plano, MOTOR-A, MOTOR-B, SITE+API e correções da revisão tripla) entrou em f85c4de. Na árvore principal: pytest **896 ok** (6 pulados, 2 pagos fora), tipos ok, aceite **147/147**, todos com saída 0.
- **No ar (conferido em produção):** `/v1/marcas` responde; a versão segurada abre com sessão e mostra os motivos em frase do dono (V3 da Black: "Uma fala foi cortada antes de terminar", com os instantes); a conversa segue ligada (prazo 90 dias). Rotas antigas iguais.
- **Logo do Super Kal cadastrada** em `marcas/super-kal/logo.png` (2048 px, com transparência), pela rota nova; o fecho dos próximos filmes do Super Kal usa a logo quando o pedido traz o cliente.
- **Ouvido fino:** padrão `turbo` (medição local: pico 2,1 GB e 25 s por minuto de fala; o large-v3 deu 4,3 GB). Cai para a transcrição atual se faltar memória ou o modelo não baixar.
- **Não provado ainda:** turbo acertando Guerreiro, Sisal e Bacia do Jacuípe no áudio real; segurada sobre filme real com clique duplo; nada disso roda sem a API da Anthropic com saldo (a direção ainda depende dela).
- **Falta:** poses do mascote (espiada, placa, moto, carro, aceno) no cadastro da marca; os recortes do vídeo da Black existem, mas precisam sair do fundo verde antes.


## 27/11 (madrugada): mão por cima da legenda, rosto nunca (técnica do filme Black do Super Kal)
- **Saúde no começo da rodada:** site, motor, chave do cérebro e backup ok (último às 00:37 UTC), versão no ar 2ff439d, disco com 3,2 GB livres. M5: `projetos/itaitu-viagem/motor-render/` ainda não existe.
- **O que entrou:** `motor/etapas/montagem/maos.py`. Mão e braço da pessoa passam por cima da legenda da frente; o rosto nunca.
  - Detecção: pele (YCrCb) dentro da máscara de pessoa, em 1/4 da resolução. A maior pele no alto da silhueta é o rosto e sai; pedaços com menos de 25 px (grade de 270) também saem.
  - Borda: suavizada e recortada pela máscara.
  - Custo: ligado por padrão só onde a máscara já é calculada no quadro (pele, desfoque, destaque ou texto atrás), então não há custo extra. `pessoa.maos_na_frente: 0` no EDL desliga (schema atualizado).
  - Novo campo de relatório: `pessoa.maos_quadros`.
- **Origem:** provado à mão no filme Black do Super Kal (27/11). O dono exige "nada cobrindo rosto ou mãos", e a revisão independente aprovou o efeito: "a borda segue o borrão da mão, sem halo e sem serrilhado".
- **Testes:**
  - `tests/test_maos_na_frente.py` com 7 testes; os 2 de integração falham sem a mudança (provado);
  - pytest **903 ok** (6 pulados, 2 pagos fora);
  - tipos ok;
  - aceite **147/147**.
- **Limite conhecido:** quando o braço encosta no rosto, a pele vira um componente só e conta como rosto; nesses quadros a letra fica por cima do braço. Caminho medido na revisão: detector de rosto (YuNet) para separar.
- **Próximo, pedido do dono via sessão principal (27/11):** publicar o redesenho visual "Mesa de corte" inteiro, ondas 2 a 5 de `docs/design-editor-25-11.md`.

## 27/11: redesenho "Mesa de corte", onda 2 no ar (gavetas e avisos) · 3e9ee32
- **O que entrou:** gaveta (Base UI Drawer 1.9.0) e avisos (sonner 2.0.8), as duas com versão fixa e lockfile conferido com o pnpm 9.15.0 da produção.
  - "Reprovar com motivo" virou **Pedir ajuste** numa gaveta: texto, "Só neste vídeo" ou "Vale como regra da casa" (campo `vira_regra`, que o motor já aceitava; o padrão continua regra, como antes), a linha de consequência e o erro dentro da gaveta.
  - A versão ficou com uma linha só ("Passou em 8 de 9 conferências; uma pede seu olho"). Baixar, conferência em detalhes, cor e link do cliente moram em **Mais da Vn**.
  - **Mandar para o cliente** abre a gaveta do link: WhatsApp principal, Copiar secundário com aviso, Desligar só em texto de perigo. O link novo não some ao fechar a gaveta.
  - "Mais" da navegação virou gaveta (conversa, Gastos, Clientes e marcas, Trilhas e efeitos, Sistema e backup, Sair por último). O link só navega depois de a gaveta fechar (a trava de rolagem desfazia o salto para a âncora).
  - Avisos: "Pedido recebido. A edição começou.", "V1 aprovada. Corta!", "Link copiado", "Ajuste pedido…".
- **Decisão pelo documento:** o padrão do ajuste ficou "vale como regra" (o comportamento de sempre do motor); só o dono muda isso.
- **Testes:** pytest 903 ok; tipos ok; aceite 149/149 (antes 146): gaveta de ajuste abre e cancela sem pedir nada, avisos de aprovar e copiar, gaveta do cliente e Mais da versão.
- **Revisão independente:** 8 achados (link sumia ao fechar a gaveta, erro do ajuste escondido atrás da gaveta, salto de âncora desfeito, troca de gaveta sem cancelar, foco no texto, detalhe da conferência sumido, tabela do estudo). Todos corrigidos antes do push, menos o aviso que nasce fora da gaveta aberta (leitor de tela), que ficou anotado.
- **No ar:** `/api/saude` com `versao: 3e9ee32`; /entrar em celular claro e escuro e desktop sem erro de console nem rolagem lateral; o código dos avisos (`aviso-toast`, `--avisos-baixo`) servido pela produção.
- **Limite:** as telas logadas não foram vistas no ar (esta sessão não tem a senha nem a sessão do dono); os prints delas são do mesmo código, no servidor local com o motor falso.

## 27/11: redesenho "Mesa de corte", onda 3 (projeto por estado e pedido em resumo)
- **Pedido:** a duração virou botões logo abaixo do texto; cada pergunta virou uma linha ("Quem fala no vídeo? · O editor ouve e decide · trocar") que abre a gaveta da pergunta. Escolha de um fecha sozinha; a resposta volta ao formulário com o mesmo nome de campo, então o pedido que chega ao motor é o mesmo de antes.
- **Ilha ao vivo:** a régua dos 30 minutos deu lugar à faixa de 6 segmentos (feito em tinta, atual em âmbar com brilho, parou em coral) e ao passo atual grande, com a mensagem do motor traduzida; a trilha inteira fica em "Ver todas as etapas". Com erro, a faixa marca a etapa do próprio evento de erro.
- **Material e Pedido** viram uma linha de resumo quando a edição começa ("Material · 2 vídeos, 393 MB · ver"); abre sozinho quando um vídeo fica de fora. O pedido continua à vista enquanto o projeto ainda lê o material.
- **Mensagens do motor na língua do dono** (`lib/estados.ts`, sem mexer no motor): "arquivo(s)" vira "vídeos", "Falta o pedido" some quando o pedido já chegou, "Falta terminar a leitura e o pedido" vira "Falta terminar a leitura".
- **Lista de projetos:** capa 9:16 com monograma (o motor ainda não manda o quadro), selo com ícone e texto ("Esperando você", "Editando · montando", "Pronto para ver", "Precisa de você", "Material chegou · falta o pedido") e resumo útil no topo ("2 esperando você · 1 editando"). Lista vazia com a claquete e os 3 passos.
- **Ícones:** lucide-react 1.79.0 (versão fixa) nos selos, no ✓ das etapas e no "ver todas".
- **Testes:** pytest 903 ok; tipos ok; aceite 152/152: perguntas em gaveta, duração em botões, corpo do pedido com as respostas, faixa toda feita na entrega e cartões recolhidos.
- **Revisão independente:** 8 achados; corrigidos os 4 importantes (cartão remontava e perdia as escolhas do pedido, faixa no lugar errado depois de uma entrega antiga, pedido escondido durante a leitura, frase do motor que perdia "falta terminar a leitura") e 4 menores (escolha já marcada não fechava a gaveta, selo da lista, monograma com emoji, CSS morto).
- **No ar (onda 3):** `/api/saude` com `versao: 67456c2`; /entrar em celular claro e escuro e desktop sem erro de console nem rolagem lateral. Telas logadas conferidas só no servidor local (mesmo limite da onda 2).

## 27/11: redesenho "Mesa de corte", onda 4 (o relógio vira o filme e o Caderno em telas)
- **Momento-assinatura:** quando a versão chega, o filme abre de uma faixa fina até o quadro 9:16 e o timecode grande encolhe e vira a etiqueta "Aba 71 · feito em 00:31" no canto de cima do player (600 ms, CSS puro, uma vez por versão; a sessão da aba lembra). Com movimento reduzido, nada se mexe e a etiqueta já aparece.
- **✓ desenhado** como traço nas etapas feitas (240 ms) e **som da claquete** opcional: Web Audio, 120 ms, volume baixo, desligado por padrão, interruptor em Sistema (fica no aparelho). Sem arquivo de som de terceiros.
- **Caderno em telas:** `/caderno` (regras, conferências, palavras, modos, cor e estudos de caso, com índice no topo; as fixas da casa ficam recolhidas numa linha e as do dono à vista), `/clientes` (respostas dos clientes e marcas), `/biblioteca` (trilhas e efeitos) e `/sistema` (conversa, som da claquete e backup). O ponto de saúde do topo e o "Mais" levam a elas. O Caderno no celular foi de 11.354 px para 1.736 px (cerca de 2 telas).
- **Decisão pelo documento:** Motion (biblioteca de animação) não entrou: o movimento coube em CSS, sem peso a mais no 4G de evento.
- **Testes:** pytest 903 ok; tipos ok; aceite 153/153 (com o build): etiqueta "feito em", marca de "já mostrei", animação ligada sem movimento reduzido e desligada com ele, sem erro de console nos dois; Caderno, Clientes, Trilhas e Sistema na verificação visual (celular e desktop, claro e escuro).
- **Revisão independente:** 9 achados; corrigidos o relógio que podia ficar preso na tela, o teste que corria contra a hidratação, o áudio que o iPhone suspende, a regra do dono que podia cair em "fixas da casa", textos que ainda apontavam para o Caderno e o realce do "Mais". Ficou anotado: título de seção dentro do `summary` (o leitor de tela anuncia como botão).
- **No ar (onda 4):** `/api/saude` com `versao: d3ea849`; `/sistema`, `/clientes` e `/biblioteca` existem (sem sessão mandam para a senha e voltam para a mesma tela); rota que não existe dá 404; /entrar sem erro de console nem rolagem lateral.

## 27/11: redesenho "Mesa de corte", onda 5 (entrar, cliente e desktop)
- **Entrar:** "mostrar senha" (o olho no campo, botão fora do rótulo para o leitor de tela), formulário no terço de baixo (título em cima, Entrar no alcance do polegar e acima do teclado) e o timecode que corre 1 segundo quando a senha é aceita (nada com movimento reduzido).
- **Página do cliente (/c/):** o vídeo começa a 78 px do topo (era depois de um título de 52 px), o título fica menor logo abaixo do vídeo e o rodapé assina com a etiqueta Aba 71 e "feito pela creat.MTT".
- **Desktop (≥ 960 px de largura e ≥ 501 px de altura):** a navegação virou trilho lateral de 72 px e o palco fica parado à direita enquanto a coluna da esquerda rola (o filme entregue, ou o relógio e as versões durante a edição); o diário e, na entrega, o relógio descem para a esquerda. No celular a ordem das telas é a mesma de antes.
- **Testes:** pytest 903 ok; tipos ok; aceite 156/156 (com o build): mostrar senha, vídeo do cliente a até 120 px e a assinatura, filme parado ao rolar no desktop e trilho de 72 px com a altura da tela. Um teste antigo da conversa (o segundo aparelho conferido um evento atrás) falhou 1 vez em 7 rodadas: agora espera até 5 s o fio alcançar antes de comparar.
- **Revisão independente:** 7 achados, todos corrigidos: o trilho fixo ficava preso no cabeçalho (o `backdrop-filter` do topo), a coluna do palco virava caixa de rolagem própria (prendia a roda do mouse e cortava sombras), player sem altura mínima em janela baixa, nome do campo de senha no leitor de tela, timecode que não dava tempo de ver e o teste que não media a altura do trilho.
- **No ar (onda 5):** `/api/saude` com `versao: e2d9c2f`; /entrar no celular (claro e escuro) e no desktop já com o formulário embaixo e o olho da senha, sem erro de console nem rolagem lateral. Telas logadas e a página do cliente conferidas no servidor local (esta sessão não tem a senha do dono nem um link de cliente de produção).
- **Prints do redesenho (antes e depois de cada onda):** scratchpad da sessão, pasta `redesenho/` (`antes/`, `depois_onda2…5/`, `*-no-ar/`).
