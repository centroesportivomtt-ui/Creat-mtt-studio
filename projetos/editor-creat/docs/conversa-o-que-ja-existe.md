# O que já existe: a base para o modo conversa e a tela ao vivo do Editor creat.MTT

Data: 25/11/2026. Raiz: `projetos/editor-creat`; os caminhos abaixo são relativos a ela.
Este mapa só lê o código, não altera nada. O texto vem da frente "o que já existe" e foi copiado inteiro. No fim há uma seção com o que conferi de novo hoje e com as correções.
Atenção: a onda 1 do redesenho está editando `apps/web/componentes/Projeto.tsx` agora. As linhas citadas desse arquivo podem ter mudado quando alguém for ler.

## Resumo em uma frase
O motor já tem quase toda a base de uma conversa: eventos ao vivo por SSE com retomada, pedido por texto ou áudio, reprovação que vira nova versão, memória da casa e um cérebro Claude com cache e livro de gastos. Mas nada disso é conversa ainda.
- O cérebro faz uma chamada só, com JSON estruturado, sem histórico e sem ferramentas do editor.
- Não existe tabela de mensagens.
- As perguntas são fixas, ficam no site e são feitas antes de o editor ver o material.
- A tela não grava áudio.
- O diário mostra só as 12 últimas mensagens de texto. Não mostra qual ferramenta ou modelo está rodando, quanto custa nem o que o diretor decidiu.

---
## 1) Eventos ao vivo

**Tabela e gravação**
- `services/motor/motor/banco.py:39-43` define a tabela `eventos`: id AUTOINCREMENT, projeto, ts, tipo, etapa, alvo, progresso, estado, mensagem e dados (JSON). Há um índice em (projeto, id).
- `banco.py:76-81`: `emitir()` faz um INSERT e devolve o id.
- `banco.py:84-91`: `eventos_desde(depois_de, limite=200)`.
- `banco.py:94-96`: `mudar_estado()` sempre emite um evento do tipo "estado".

**Contrato**
- `packages/schemas/evento.schema.json:13` aceita 10 tipos: projeto_criado, arquivo_recebido, etapa_inicio, etapa_progresso, etapa_fim, etapa_erro, estado, versao_pronta, qa_reprovado e entregue.
- `evento.schema.json:14` aceita como etapa: ingest, analise, catalogo, direcao, montagem, qa e entrega.
- O código emite 2 tipos que o schema não tem:
  - "aviso": `api/projetos.py:221`, `pipeline.py:101`.
  - "cliente": `cliente.py:97,128,167,198`.
- Ninguém emite "versao_pronta" (procurei em todas as chamadas de emitir).

**Rota SSE**
- `services/motor/motor/api/projetos.py:255-281`, `GET /v1/projetos/{pid}/eventos`.
- Tem `retry: 2000`, Last-Event-ID, `depois`, `seguir` e `ate` (padrão de 3600 s, teto de 6 h).
- Consulta o banco a cada 0,5 s (`:278`) e manda ping a cada 15 s (`:275-277`).
- Cada consulta abre uma conexão SQLite nova (`_buscar_eventos` → `_con` → `banco.conectar`). Essa função roda PRAGMA WAL e o `executescript(ESQUEMA)` inteiro a cada abertura (`banco.py:65-72`). Isso funciona hoje, mas fica caro se a conversa passar a emitir muitos eventos (texto saindo aos pedaços).

**Proxy**
- `apps/web/app/api/motor/[...rota]/route.ts:50-53` repassa o SSE sem buffer (no-transform, x-accel-buffering: no).
- `apps/web/next.config.mjs:11` usa `compress: false`.
- As rotas permitidas estão na regex de `route.ts:10`.
- O POST tem teto de 1 MB (`route.ts:32-35`).

**Como a tela consome** (`apps/web/componentes/Projeto.tsx`)
- `:87-109`: um EventSource que descarta ids repetidos e guarda os 400 últimos eventos (`:96`). Ele escuta 12 nomes (`:103`), entre eles 'cliente'. **Não escuta 'aviso'.** Um evento SSE com nome só chega a quem escuta aquele nome, então os avisos (por exemplo, "arquivo ficou de fora") não aparecem na tela. A lacuna #4 de docs/lacunas-25-11.md diz o mesmo.
- `:101`: alguns tipos disparam recarga do projeto (`recarregar`, com espera de 250 ms).
- `:111-134`: relógio dos 30 min (TETO_MS). Ele tenta ler `dados.envio_fechado_em` (`:121`), mas **o motor nunca grava esse campo**: grep sem resultado em services, e `api/projetos.py:236` grava só `envio_fechado`. Na prática o relógio começa na marca "lendo" ou "dirigindo".
- `:136-145` e `:247-265`: trilha de 6 estados, com a última mensagem de cada estado e uma barra de progresso.
- `:246` e `:492-499`: o "Diário da ilha" mostra **só os eventos que têm mensagem, os 12 últimos**, fechado num `<details>`.
- `:437-468`: o cartão "Ilha ao vivo" (timecode, ponto "ao vivo/reconectando" e régua).

**O que cada etapa emite**
- Worker:
  - `worker.py:86` emite etapa_inicio sem mensagem, então ela não aparece no diário.
  - `:94` emite etapa_fim só com `dados.s` (duração).
  - `:101` e `:108` emitem etapa_erro com texto técnico, por exemplo "TypeError: …".
- Ingest: `etapas/ingest.py:172,201,237,251,287`. Mostra os MB baixados, "Lendo metadados", "Extraindo quadros-chave…" e "Arquivo lido: N quadros-chave, X s".
- Análise: `etapas/analise.py:246,267-269,276,286,293,311`. Mostra a energia, "Transcrevendo (nome do provedor, sem VAD)" com progresso de 0,1 a 0,7, "Lendo imagem…", "Marcando os momentos" e "Análise pronta: N falas, M momentos".
- Catálogo: `etapas/catalogo.py:400` emite uma mensagem só.
- Direção: `etapas/direcao.py:194` ("o diretor está lendo o catálogo", progresso 0,1). Depois fica **muda durante toda a chamada ao Claude** (diretor, resolvedor e crítico) até `:216-218`. Aí sai "Direção pronta (X s, N trechos de fala). Custo: US$ Y", com `dados.tokens` e `avisos[:5]`.
- Montagem: chega por `ctx.progresso`. Mostra "Voz: limpeza i/N" e "Voz: emenda i/N" (`etapas/montagem/voz.py:126,151,186`), "Composição: q/Q quadros" a cada 60 quadros (`comp.py:440`), "Motion: N camadas" (`overlay.py:119`) e "Planos: n/N" (`planos.py:498`).
- QA: `etapas/qa/__init__.py:250` mostra "Conferência: <nome>" para cada checagem.
- Entrega: não emite progresso.

**O que NÃO é emitido hoje**
- Qual modelo está rodando (claude-opus-5-5 ou haiku), o esforço e o modo de pensamento.
- Que o crítico começou e qual foi o resultado. Isso fica só em `edl.origem.critica` (`direcao.py:203`).
- O custo de cada chamada da visão leve, do olho de IA e da checagem de fatos. Vai só para `gastos.jsonl`, nunca para o evento. A checagem de fatos também não mostra quantas buscas fez.
- **O que o diretor decidiu**: conceito, alem_do_pedido, gancho, blocos e riscos (os campos de `packages/schemas/direcao.schema.json`). Tudo fica gravado em `projetos/<p>/direcao_<n>.json`, mas não vai para o evento.
- Os problemas encontrados pelo resolvedor.
- Qual checagem do QA reprovou: isso vai só nos `dados` do `qa_reprovado` (`pipeline.py:84`).

**O que dá para reaproveitar:** a tabela, o `emitir`, o SSE com retomada, o proxy e o `ctx.progresso`. Basta criar tipos novos (ferramenta_inicio/fim, fala_editor, pergunta, custo, achado) e campos novos em `dados`.

**O que falta**
- Pôr os tipos novos e o 'aviso' no schema.
- Fazer a tela escutar 'aviso'.
- Narrar a chamada ao cérebro (por streaming).
- Trocar a consulta a cada 0,5 s com conexão nova por uma conexão por cliente SSE ou por um aviso em memória.
- Mostrar o diário inteiro como uma linha do tempo com ícone de ferramenta, e não as 12 últimas linhas escondidas.

## 2) Perguntas

- `apps/web/lib/estados.ts:45-78` tem as perguntas fixas (`PERGUNTAS`): formato, destino, vozes, ambiente, proibido, mascote, ia, telas, legenda, música e fecho. Elas são filtradas por modo em `perguntasDoModo` (`:78`).
- Quatro viram campo do pedido: formato, destino, ambiente e vozes. As outras viram texto em `obrigatorio` ou `proibido` (`Projeto.tsx:679-690`). O campo livre "precisa" também entra em obrigatorio, com até 200 caracteres (`:689-690`).
- Na tela, todas aparecem de uma vez, antes de começar (`Projeto.tsx:716-736`). docs/design-editor-25-11.md:32 e :65 descrevem um formulário de cerca de 1.400 px.
- **São perguntas de formulário, escritas antes de o editor ver o material.** Nenhuma pergunta é gerada pelo diretor a partir do catálogo. O schema da direção não tem campo `perguntas`, e o schema do pedido tem `additionalProperties:false` (`packages/schemas/pedido.schema.json:7`), sem lugar para guardar respostas.
- A única pergunta do motor que espera resposta está no plano do comando oficial (`docs/plano-comando-oficial-25-11.md:326`, "Esse clipe foi gravado em Apple Log?") e ainda não foi implementada.

**O que dá para reaproveitar:** o formato `{id, texto, tipo um/varios, campo, opcoes}` serve para perguntas dinâmicas.

**O que falta**
- O diretor devolver `perguntas[]` (com o padrão "o editor decide").
- Uma rota para responder.
- O pedido ou a conversa guardar as respostas.
- A direção esperar a resposta, ou seguir com o padrão depois de um tempo.

## 3) Pedido por áudio

**No motor**
- `services/motor/motor/api/direcao.py:49-77`, `PedidoEntrada`:
  - `texto` com até 4000 caracteres, ou `audio_chave` com até 500, sem "/" no início e sem "..";
  - `obrigatorio` e `proibido` com até 20 itens de 200 caracteres;
  - `duracao_alvo` de 5 a 600 s;
  - `ajustes_de` no padrão `v\d{1,3}`.
- `direcao.py:84-93`, `_transcrever_pedido`:
  - Roda **de forma síncrona dentro da requisição HTTP**, no processo da API e não no worker. O modelo Whisper é carregado pelo primeiro processo que pedir (`provedores/transcricao_fw.py:86-92`).
  - Usa `palavras=False`.
  - As dicas ["creat.MTT","Ruan","Xande","Marcos"] **não têm efeito por padrão**: os hotwords só ligam com `EDITOR_WHISPER_DICAS=1` (`transcricao_fw.py:101-103`).
  - Erros: 503 se o provedor não existe, 404 se o áudio não está no armazenamento, 422 se o texto sai vazio (`direcao.py:107-110`).
- Modelo: `EDITOR_WHISPER_MODELO`, padrão "small", int8 em CPU (`config.py:44-45`, `transcricao_fw.py:91`), sem VAD (`:100`).
- `direcao.py:111-124` grava `projetos/<pid>/pedido.json`, guarda em `dados.pedido` só os 200 primeiros caracteres (`:120`), emite "Pedido recebido." e chama `pipeline.tentar_dirigir`.

**No site:** **não existe gravação.** Um grep por MediaRecorder, getUserMedia, audio_chave e SpeechRecognition em apps/web não acha nada. O microfone já está liberado em `apps/web/next.config.mjs:6` (`microphone=(self)`). O caminho de upload também falta:
- O tus registra todo arquivo como material (`app/api/envio/[[...tus]]/route.ts:30-40`).
- O proxy JSON tem teto de 1 MB (`route.ts:32-35`).
- O item 28 de docs/lacunas-25-11.md já descreve isso.

**O que dá para reaproveitar:** o provedor faster-whisper local (sem custo de API), a validação da chave e o fluxo do pedido.

**O que falta**
- Uma rota pequena só para o áudio da conversa, fora de `entrada/`.
- Transcrever no worker, ou numa fila com o evento "transcrevendo…", para não prender a thread da API.
- Mostrar a transcrição para o dono conferir antes de mandar.
- O mesmo botão de microfone em Reprovar, em Pedir ajuste e na conversa.

## 4) Reprovar com motivo, pedir ajuste, memória da casa e nova versão

**Reprovar** (`services/motor/motor/api/direcao.py:127-158`)
- Recusa com 409 se a direção está rodando (`:134-135`) ou se a montagem, o QA ou a entrega desta versão estão rodando (`:136-138`).
- Cancela os jobs pendentes da versão (`:140-142`).
- Chama `Loja().registrar_reprovacao` (`:149`).
- Marca a versão como 'reprovada' e revoga o link do cliente (`:150-152`).
- Zera `correcoes_auto` (`:154`).
- Enfileira a direção com `{reprovacao, versao_anterior}` e prioridade 1 (`:156`).
- Muda o estado para "dirigindo" com a mensagem "virou regra da casa" (`:157`).

**Memória** (`services/motor/motor/memoria/loja.py`)
- `:152-189`: com o cérebro anthropic, chama `cerebro.leve(tarefa="reprovacao")` no Haiku (`anthropic_api.py:193-200`). Sem ele, usa a heurística `propor_regra` (`:217`).
- A regra entra como **global** (`"tipos": None`, `:177`) e a checagem como **'bloqueia'** (`:179`). Ou seja, todo "pedir ajuste" vira regra eterna (lacuna #5).
- **O custo dessa chamada ao Haiku não vai para o livro de gastos.** `api/direcao.py:149` ignora `r["uso"]`, e as chamadas de `gastos.registrar` estão só em direcao.py:211, analise.py:301, olho_ia.py:291 e :296, fatos.py:322 e diagnostico.py:82 e :145.

**Como vira nova versão**
- `etapas/direcao.py:173` monta `correcao`.
- `:179-184` carrega `direcao_<n-1>.json`.
- `montar_prompt` (`:63-72`) acrescenta "O DONO REPROVOU a versão vN: «motivo». Corrija" e "DIREÇÃO ANTERIOR (mude só o necessário)".
- `:201-215`: nasce v(n+1), com o índice em `projetos/<p>/direcoes.json`.
- A mesma entrada reaproveita a versão sem chamar o cérebro (`:174-178`).

**Outras partes**
- `ajustes_de` é gravado no pedido (`api/direcao.py:62,113`), mas ninguém lê esse campo.
- Na tela, o formulário "O que ficou errado? Vira regra da casa." aceita de 3 a 1000 caracteres (`Projeto.tsx:793-808`).
- Aprovar fica em `api/versoes.py:108-129`: a versão vira caso de referência (`Loja.registrar_aprovacao`, `loja.py:136`).

**O que dá para reaproveitar:** o fluxo inteiro de correção, com a direção anterior como contexto. Ele já funciona como um "turno" de conversa, só que escrito como prompt.

**O que falta**
- Separar "ajustar só este vídeo" de "vale para sempre".
- Confirmar com o dono o texto da regra (o editor responde "entendi assim: …, confirma?").
- Registrar o gasto da chamada leve.
- Ajuste fino sem refazer o filme (lacuna #38).

## 5) O cérebro

**Arquivos:** `services/motor/motor/cerebro/`
- `anthropic_api.py`
- `sessao.py`
- `orcamento.py`
- `gastos.py`
- `diagnostico.py`
- `fixture.py`
- `edl_fixo.py`
- `prompts/diretor.md` (37 linhas)
- `prompts/critico.md` (8 linhas)

**Chave e modelos**
- `config.py:27-30` lê `EDITOR_ANTHROPIC_KEY`, ou `ANTHROPIC_API_KEY` como reserva.
- `config.py:33-37`: o cliente aponta para `EDITOR_ANTHROPIC_URL` ou para api.anthropic.com.
- `config.py:47`: `EDITOR_CEREBRO` pode ser fixture (padrão), anthropic ou sessao.
- `config.py:48-52`:
  - modelo de direção claude-opus-5-5;
  - modelo leve claude-haiku-5-5;
  - esforço "high";
  - orçamento de 15000 tokens de entrada e 4000 de saída.

**Chamada**
- `anthropic_api.py:86-91`: o prefixo é sistema + catálogo, os dois com `cache_control: ephemeral`.
- `:95-127`: `messages.stream(...)` com `thinking: adaptive`, `output_config.effort` e `format json_schema` (modo estrito). A beta `server-side-fallback-2026-07-01` e `fallbacks: "default"` aparecem em `:20` e `:114`.
- **A chamada usa stream, mas só lê `get_final_message()` (`:116-117`).** Nada sai aos pedaços para a tela.
- Recusa e max_tokens viram erro (`:118-121`).
- `dirigir` usa max_tokens 32000 (`:176`) e ignora o `maximo_saida=4000` que direcao.py passa (`direcao.py:117-118`).
- `criticar` repete o mesmo prefixo com esforço medium (`:181-191`).
- `_conserta` (`:143-172`) é **o único lugar com várias mensagens**: põe a resposta como assistant e um user "corrija só estes erros", até 2 vezes. É o padrão mais próximo de conversa que já existe.
- `leve` (`:193-200`) tem 3 tarefas, mas só "reprovacao" é usada (o grep só acha `loja.py:170`).

**Ferramentas (tool use):** o cérebro de direção **não usa nenhuma**. A única chamada com ferramenta no motor é a checagem de fatos:
- `etapas/fatos.py:161-176` usa a ferramenta de servidor `web_search_20260209` com `max_uses=min(10, 2+2n)` e local BR, e trata `pause_turn` em até 4 voltas.
- Conta `server_tool_use.web_search_requests`.
- O olho de IA (`etapas/qa/olho_ia.py:211`) é uma pergunta com imagens, sem ferramenta.

**Sessão** (`cerebro/sessao.py:1-53`): o cérebro "sessao" grava `<dados>/diretor_sessao/<chave>.pedido.md` e levanta `AguardandoDiretor`. `direcao.py:199-200` transforma isso em ErroDefinitivo, e o projeto fica em erro. Uma sessão do Claude Code escreve `<chave>.direcao.json`. É o "como eu faço com você" de hoje, mas fora da tela e por arquivo.

**Orçamento** (`cerebro/orcamento.py`)
- `:264` estima 3,5 caracteres por token.
- `:265-269` traz os preços em US$ por milhão de tokens (entrada / saída / leitura de cache / escrita de cache de 5 min):
  - opus-5-5: 4,00 / 20,00 / 0,20 / 5,00;
  - haiku-5-5: 0,10 / 0,50 / 0,01 / 0,125;
  - sonnet-5-5: 2,00 / 10,00 / 0,10 / 2,50.
  - O comentário diz "tabela de 03/11/2026 da skill claude-api".
- `:270-271`: LIMITE_PROMPT 22000 e LIMITE_DIRECAO 4000.

**Gastos** (`cerebro/gastos.py:30-48`): uma linha por chamada paga em `<dados>/gastos.jsonl`. O painel vem de `resumo` (`:106-131`).

**Como a direção é chamada:** `etapas/direcao.py:108-152` (`dirigir_e_resolver`) faz 1 chamada ao diretor, roda o resolvedor, faz 1 chamada ao crítico com os problemas do resolvedor e resolve de novo.

**O que dá para reaproveitar:** o cliente oficial, o prefixo em cache (sistema + catálogo, que serve de contexto da conversa), o streaming, os preços e o livro de gastos, o padrão de várias mensagens do `_conserta`, o laço de `pause_turn` de fatos.py e a memória (regras, casos e vocabulário).

**O que falta**
- Uma tabela ou arquivo de conversa por projeto (mensagens user/assistant).
- Um "editor que conversa": um modelo com ferramentas do editor, como ler o catálogo, ver um momento, propor a direção, perguntar ao dono, ajustar a versão e consultar o QA.
- Repassar o stream (texto, pensamento resumido e chamada de ferramenta) como eventos SSE.
- Gravar o custo de cada turno.

## 6) Página do cliente /c/<token>

**Arquivos:** `apps/web/app/c/[token]/page.tsx:1-61`, `componentes/AprovacaoCliente.tsx`, `app/api/cliente/[token]/[acao]/route.ts:1-61` e `services/motor/motor/api/cliente.py:1-138`, com `motor/cliente.py`.

**O que o cliente pode fazer**
- Ver o vídeo final e a capa daquela versão, com Range (`api/cliente.py:106-119`).
- Responder **uma vez** (`cliente.py:11`, `:163-166`): aprovar com confirmação, ou pedir ajuste com 3 a 600 caracteres e um nome de até 60 (`cliente.py:37`).
- O link vale 7 dias por padrão e 30 no máximo (`cliente.py:35`).

**Limites:** 20 tentativas por 10 min por IP e 10 respostas por 10 min (`route.ts:19`, `:32-34`). O corpo vai até 4000 bytes (`route.ts:35-37`).

**O que acontece com a resposta:** vira um evento 'cliente' (`cliente.py:167`) e aparece no Caderno. **Nunca vira regra sozinha** (`cliente.py:12-13`). Reprovar a versão revoga o link (`cliente.py:204`).

**O que dá para reaproveitar:** o token seguro (só o sha256 fica guardado) e o evento 'cliente', que já chega ao SSE do dono.

**O que falta**
- Conversa com o cliente.
- Comentário num ponto do vídeo.
- Áudio do cliente.
- O pedido do cliente virar "Fazer este ajuste" em um toque para o dono (lacuna #5).

## Custo estimado de um turno de conversa
Os preços vêm de `orcamento.py:265-269`. A frente não os conferiu na página oficial. Hoje os conferi pela skill claude-api (veja a seção do fim).
- **Haiku 5.5**, com 4.000 tokens de sistema em cache, 2.000 novos e 400 de saída:
  - 4000×0,01/1e6 + 2000×0,10/1e6 + 400×0,50/1e6 = 0,00004 + 0,0002 + 0,0002 = **≈ US$ 0,0004 por turno**.
- **Opus 5.5**, com os mesmos números:
  - 4000×0,20/1e6 + 2000×4/1e6 + 400×20/1e6 = 0,0008 + 0,008 + 0,008 = **≈ US$ 0,017**.
  - Com o catálogo de 15.000 tokens lido do cache: + 15000×0,20/1e6 = 0,003, total de **≈ US$ 0,02**.
- **20 turnos por projeto**: ≈ US$ 0,40 com Opus ou ≈ US$ 0,01 com Haiku.
- A primeira escrita de cache no Opus custa 19.000×5/1e6 ≈ US$ 0,095, uma vez a cada 5 minutos.
- A transcrição local com faster-whisper custa US$ 0, porque roda na CPU do próprio contêiner.

## Infra que pesa na decisão
- O contêiner é um só: `deploy/iniciar.sh:27` sobe a API, `:29` sobe `EDITOR_WORKERS` workers (2 por padrão), e o site roda junto.
- Transcrever na API divide CPU e memória com os workers.
- Publicar uma atualização no meio do trabalho interrompe os jobs (lacuna #15).

## Principais achados (lista da frente)
1. Os eventos ao vivo estão prontos para reaproveitar: a tabela eventos (`banco.py:39-43`), o `emitir()` (`:76-81`) e o SSE com Last-Event-ID, retry de 2 s, ping de 15 s e teto de 6 h (`api/projetos.py:255-281`). O proxy repassa sem buffer (`route.ts:50-53`).
2. O SSE consulta o banco a cada 0,5 s com uma conexão nova, e cada abertura roda PRAGMA WAL e o esquema inteiro (`api/projetos.py:268,278`; `banco.py:65-72`).
3. O contrato de eventos está desatualizado: o schema tem 10 tipos, mas o código emite também 'aviso' e 'cliente'. A tela não escuta 'aviso', e ninguém emite 'versao_pronta'.
4. A tela ao vivo mostra pouco: o diário tem só os 12 últimos eventos com mensagem, dentro de um `<details>` fechado. O relógio procura um campo que o motor nunca grava.
5. A direção é o maior buraco ao vivo: fica muda entre "lendo o catálogo" e "Direção pronta".
6. O cérebro não conversa: faz uma chamada com JSON estrito, e o único padrão com várias mensagens é o `_conserta`.
7. O cérebro de direção não usa ferramentas. A única chamada com ferramenta é a de `etapas/fatos.py`, com o laço de `pause_turn`.
8. As perguntas são de formulário e fixas. O schema do pedido fecha a porta para guardar respostas.
9. O pedido por áudio existe só no motor, é transcrito de forma síncrona e as dicas estão desligadas por padrão. O site não grava áudio.
10. Reprovar já funciona como um turno de conversa, mas toda reprovação vira regra global e bloqueante, e `ajustes_de` não é lido por ninguém.
11. A chamada ao Haiku que transforma a reprovação em regra fica fora do livro de gastos.
12. A página do cliente só deixa assistir e responder uma vez.
13. O cérebro "sessao" é o "como eu faço com você" de hoje, mas por arquivo e fora da tela.
14. Com os preços de `orcamento.py`, um turno custa ≈ US$ 0,0004 no Haiku 5.5 e ≈ US$ 0,017 a 0,02 no Opus 5.5.
15. Limite de infraestrutura: um contêiner só, com a API, 2 workers e o site.

## O que a frente marcou como não confirmado
- Os preços dos modelos vêm só do código (`orcamento.py:265-269`). **Hoje: conferidos pela skill claude-api, veja abaixo.**
- Se o pensamento resumido sai em streaming de um jeito que dê para mostrar na tela. **Hoje: a skill confirma o `display: "updates"` (beta `thinking-display-updates-2026-08-18`), que devolve as notas de progresso entre ferramentas.**
- A disponibilidade das ferramentas de cliente e da beta de fallback. **Hoje: a skill confirma `fallbacks: "default"` com a beta `server-side-fallback-2026-07-01`, e diz que deve ficar ligada por padrão no Opus 5.5.**
- A memória e a CPU do faster-whisper small carregado na API, e o tempo de transcrição no Railway. Não medido. A frente de voz mediu nesta máquina: 22,7 s de áudio em 2,5 s com a CPU livre.
- A carga real do SSE com várias abas abertas. Não medido.
- As linhas de `Projeto.tsx` podem ter mudado com a onda 1 do redesenho.
- O corpo inteiro de catalogo.py, resolvedor.py, entrega.py e loja.py não foi lido.
- Se o Railway corta conexões SSE longas. A frente do agente cita docs.railway.com: corte em 15 min com dados e em 5 min sem dados.

---
## Conferido de novo hoje (25/11/2026) e correções

| Fato | Onde | O que vi |
|---|---|---|
| `conectar()` abre sem `check_same_thread=False` e roda o esquema inteiro | `services/motor/motor/banco.py:65-72` | Confirmado. Uma conexão por cliente SSE usada via `asyncio.to_thread` precisa de `check_same_thread=False`, senão o sqlite3 levanta ProgrammingError na troca de thread. |
| O SSE chama `asyncio.to_thread(_buscar_eventos…)` e depois `asyncio.sleep(0.5)` | `api/projetos.py:268,278` | Confirmado. |
| As dicas já existem como parâmetro | `provedores/transcricao_fw.py:94` e `api/direcao.py:92` | Confirmado. Elas só viram `hotwords` com `EDITOR_WHISPER_DICAS=1` (`transcricao_fw.py:103`). Para valerem só na voz da conversa, é preciso uma chave por chamada; não basta passar a lista. |
| Os gastos da direção são gravados só no fim, diretor e crítico juntos | `etapas/direcao.py:210-211` | Confirmado: um laço `for u in r["usos"]` depois das duas chamadas. Para o custo aparecer a cada chamada, o registro tem de passar para logo depois de cada uma. |
| `dirigir_e_resolver` é puro (sem banco) e recebe `cfg` | `etapas/direcao.py:108-152` | Confirmado. Dá para acrescentar um callback `aviso` sem tocar no banco. |
| `orcamento.PRECOS` só tem escrita de cache de 5 min | `cerebro/orcamento.py:12-16` | Confirmado. A escrita de 1 h no Opus 5.5 custa 2× a entrada, ou US$ 8/MTok (skill claude-api, `shared/prompt-caching.md:144`). |
| O cache da direção usa TTL de 5 min | `cerebro/anthropic_api.py:88-89` | Confirmado (`{"type": "ephemeral"}` sem `ttl`). |
| O proxy repassa o `content-type` e o corpo bruto | `apps/web/app/api/motor/[...rota]/route.ts:11,31-36` | Confirmado. Um POST de áudio de até 1.000.000 bytes passa sem mudar o proxy. |
| A regex PERMITIDAS aceita `projetos/p_x/conversa/...` | `route.ts:10` | Confirmado. |
| A API é um processo uvicorn só, sem `--workers` | `deploy/iniciar.sh:27` | Confirmado. |
| O motor falso e o aceite ficam no site | `apps/web/scripts/motor-falso.mjs` (481 linhas), `apps/web/scripts/aceite.mjs` (615 linhas) | Confirmado. O SSE falso faz um tique a cada 250 ms (`motor-falso.mjs:225-246`). |
| Pino do SDK | `services/motor/pyproject.toml:23` | `anthropic>=0.70`. A pesquisa do agente testou com a 2.10.0. |
| As rotas são registradas por lista de módulos | `services/motor/motor/api/app.py:89-96` | Para criar `motor.api.conversa`, basta pôr "conversa" na tupla. |
| Mensagem `role: system` no meio da conversa | skill claude-api, seção "Mid-Conversation System Messages" | No Opus 5.5 funciona **sem beta**. Ela tem de vir depois de uma mensagem `user` e não pode ser `messages[0]`. |
| `tool_choice` forçado no Opus 5.5 | skill claude-api, "Common Pitfalls" | Dá 400. Usar `auto` com `strict: true`. |
