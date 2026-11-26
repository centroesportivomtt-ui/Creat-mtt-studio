# Cérebro de edição: o que existe de melhor hoje (Radar, 26/11/2026)

Pedido do dono: varrer a internet atrás do melhor "cérebro" para o editor, em conjunto com o que já temos, e aproveitar o crédito de avaliação do Google Cloud (R$ 1.830, até 17/02/2027).

Regras deste estudo: só leitura de fonte pública; nada foi chamado em API paga; nenhum dado do dono ou do projeto foi enviado a serviço externo. Conteúdo de página foi tratado como dado, não como instrução. Câmbio das contas: R$ 5,50 por US$ (o mesmo de `docs/stack-ferramentas-2026.md`). **Fato** = li na fonte e cito. **Meu cálculo / minha opinião** = marcado. **Não confirmado** = dito com clareza.

---

## 0. Resposta curta

1. **Quem entende vídeo com áudio e responde com tempo marcado, hoje, de forma verificada:** a família Gemini. O `gemini-3.8-flash` está em disponibilidade geral na Vertex (02/09/2026), aceita vídeo com áudio de até cerca de 45 min, até 10 vídeos por pedido (dá para mandar as duas câmeras juntas), arquivos do Cloud Storage por `gs://`, e custa centavos por vídeo. O Claude **não aceita vídeo nem áudio** (a doc oficial só lista imagem; GIF animado vira o primeiro quadro). TwelveLabs (Pegasus 1.6) é o único concorrente especializado com prova de tempo marcado, mas não achei preço oficial do Pegasus.
2. **Atenção ao crédito.** A doc oficial do Google diz que, para quem abriu a avaliação ou migrou para conta paga **a partir de 16/11/2026**, os US$ 300 **não pagam** a plataforma Gemini (antiga Vertex AI). O vencimento informado (17/02/2027) equivale a 90 dias contados de **19/11/2026**, ou seja, depois da data de corte. Pela conta, o crédito provavelmente **não cobre** Gemini nem, por leitura minha, Veo, Imagen e Lyria. Cobre, pelo que a doc dá a entender, armazenamento, Cloud Run, Speech-to-Text (Chirp), Video Intelligence e computação (inclusive GPU depois de migrar para conta paga). Detalhe e teste de 5 minutos na seção 2.
3. **O plano não depende do crédito:** assistir a um vídeo de 10 min com Gemini 3.8 Flash custa por volta de US$ 0,08 a 0,17 (R$ 0,45 a 0,95), meu cálculo sobre preço de tabela. Mesmo sem crédito é barato.
4. **Maior ganho de qualidade nas lacunas provadas** vem de peças grátis e locais: sincronia das câmeras pelo áudio (BBC audio-offset-finder, Apache-2.0), diarização (pyannote community-1 mais WhisperX) e Whisper large-v3 com vocabulário do pedido como padrão.
5. **O que é marketing:** nenhum produto "agente de edição" achado tem API pública que dirija o corte como o nosso motor faz. A maioria (Descript, Premiere AI Assistant, Runway Aleph, DaVinci) é app de mesa ou edição generativa de trecho. Vale copiar ideias, não integrar.

---

## 1. Tabela-resumo

Legenda "crédito cobre?": **Não (provável)** = conta aberta em/depois de 16/11/2026 e serviço dentro de "plataforma Gemini"; **Sim (provável)** = serviço fora dessa exclusão, mas a doc não o cita pelo nome; **n/a** = fora do Google.

| Papel | Melhor opção hoje | Custo (fonte e data na seção indicada) | Crédito do Google cobre? | O que muda para nós |
|---|---|---|---|---|
| Assistir ao vídeo (momentos fortes, quem fala, erro de gravação) | Gemini 3.8 Flash (Vertex, GA); Gemini 4 Argon como segunda opinião; TwelveLabs Pegasus 1.6 como candidato a teste | 3.8 Flash US$ 0,75 por milhão de tokens de entrada e US$ 3,75 de saída até 31/12/2026 (dobra em 01/01/2027); cerca de 100 tokens por segundo de vídeo; 10 min custam cerca de US$ 0,08 a 0,17 (meu cálculo). Argon US$ 2 e US$ 10 até 30/11, US$ 4 e US$ 20 depois. Pegasus: preço não achado | **Não (provável)** | Passo novo "assistir" antes da direção, com JSON estruturado de tempos. Resolve as lacunas 6 e 9 do `lacunas-25-11.md` e a causa de `voz_externa` e `cobertura_sintonia` |
| Dirigir a edição (escolher falas, ordem, cortes, blocos) | Claude (Opus 5.5 ou Fable 5.2) lendo o catálogo em texto mais o relatório do "assistir" | Opus 5.5 US$ 4 e US$ 20 por milhão; Sonnet 5.5 US$ 2 e US$ 10; Fable 5.2 US$ 8 e US$ 40. Uma chamada de 15k entrada e 4k saída: Opus cerca de US$ 0,14 (meu cálculo) | **n/a** (Claude de parceiro na Vertex também não entra no crédito) | Continua igual. Falta só recarregar a Anthropic. Argon pode ser reserva de direção quando o saldo acabar |
| Escrever texto de venda (gancho, chips, fecho) | Claude (Opus 5.5 ou Fable 5.2) | Mesma tabela acima | n/a | Igual |
| Conferir o filme pronto (QA com olho) | Gemini 3.8 Flash assistindo ao filme final (60 s custam cerca de US$ 0,01) mais a QA em código que já existe | centavos | Não (provável) | Fecha o furo "a conferência não vê gente": o QA passa a assistir ao vídeo, não só medir |
| Transcrição pt-BR com nomes próprios | Whisper large-v3 com vocabulário do pedido (local, grátis) como padrão; Scribe v2 como alternativa em nuvem; Chirp 3 só se o crédito cobrir | Scribe v2 US$ 0,22 por hora (+US$ 0,05 a 0,08 por hora com keyterm); Chirp 3 US$ 0,016 por minuto, US$ 0,003 em lote dinâmico; Gemini 3.5 Transcribe cerca de US$ 0,005 por minuto | Chirp: **Sim (provável)**. Gemini Transcribe: Não (provável) | Fazer rodada de comparação nos áudios reais do dono (seção 5.3). Não usar o Gemini 3.5 Transcribe para cortar: tempo por palavra é "experimental" e degrada a precisão |
| Diarização (quem fala) | pyannote community-1 mais WhisperX (local); Scribe v2 (até 32 vozes) como nuvem | community-1 hospedado €0,035 por hora; local grátis | Sim (provável) se rodar em GPU/VM do Google | Roda em cada câmera e cruza com o "assistir" |
| Sincronia multicâmera pelo áudio | BBC `audio-offset-finder` (Apache-2.0); `audalign` (MIT) como reforço | grátis, CPU | n/a | Lacuna 4 do caso de 26/11. Resolve antes de tudo e entrega o deslocamento ao resolvedor |
| Fim de fala para corte | Tempo de palavra do Whisper/WhisperX mais Silero VAD (MIT) mais energia (o `ajustar_cortes` que já existe) | grátis | n/a | Já existe; só automatizar na montagem |
| Música licenciada por API | ElevenLabs Music (API) para anúncio online; biblioteca licenciada (Envato, Artlist Pro, Epidemic Pro) quando o cliente exigir "música de catálogo" | ElevenLabs: Runway lista US$ 0,20 por minuto; uso comercial online e offline permitido, **exceto filme, TV, rádio e jogos de estúdio**; API a partir do plano Starter | n/a (Lyria 3.5 é Google, **Não (provável)**) | Preenche a biblioteca de trilhas vazia (lacuna 5) |
| Limpeza de voz | DeepFilterNet (local, MIT ou Apache-2.0) como padrão; ElevenLabs Voice Isolator para casos pesados | DeepFilterNet grátis; Isolator US$ 0,01 por 6 s (cerca de US$ 0,10 por minuto) pela API da Runway | n/a | Já temos limpeza; este é o plano B pago |
| Legendas animadas | Nosso kit HTML (GSAP) | grátis | n/a | Nada a trazer. Submagic só com plano de US$ 69 por mês para ter API; não compensa |
| Reenquadramento 9:16 | Nosso rosto-mais-OpenCV; OpusClip ReframeAnything como referência | OpusClip: API só em Pro (Beta), Max e Business | Video Intelligence (rosto/pessoa) **Sim (provável)**: 1.000 min/mês grátis e depois US$ 0,10 por minuto | Opcional; usar a detecção de pessoa do Google só se a nossa falhar |

---

## 2. O crédito de avaliação do Google: o que a documentação oficial diz

**Fatos (página oficial "Free Google Cloud features and trial offer", lida em 26/11/2026):**
- US$ 300 de crédito por 90 dias.
- "The $300 credit can't pay for Gemini platform (formerly known as Gemini Enterprise Agent Platform, Vertex AI) services if you sign up for a free trial or upgrade to a paid account on or after **November 16, 2026**."
- "The $300 credit can't pay for Gemini API in AI Studio costs." (a chave de AI Studio nunca usa o crédito)
- "You can't access or use the $300 credit for a generative AI partner model that is offered as a managed API" (Claude, Llama e semelhantes na Vertex).
- Enquanto a conta é de avaliação (sem cobrança): sem GPU em VM, sem Marketplace, sem aumento de cota. **Ao migrar para conta paga:** abre GPU, Marketplace e modelos de terceiros, "the remaining credit is available for use on products and services covered by the Free Trial" dentro dos 90 dias originais, e passa a cobrar no cartão o que exceder o crédito ou o que não for coberto.
- Fonte: https://cloud.google.com/free/docs/free-cloud-features (lida em 26/11/2026). Mesma regra repetida por imprensa técnica em 12 a 16/11/2026 (aicoder.com, costbrake.com, programscape.com), todas secundárias.

**Minha conta (inferência):** R$ 1.830 válidos até 17/02/2027 menos 90 dias dá **19/11/2026** como dia de abertura, que é posterior a 16/11/2026. Isso aponta para a exclusão do Gemini/Vertex. **Mas a chave do Vertex já responde com `gemini-3.8-flash`**, o que não prova nada sobre quem paga: o Google pode estar cobrando no cartão (se houver) ou o crédito pode se comportar de modo diferente no Brasil. **Não consegui confirmar** qual é o caso.

**Teste de 5 minutos para o dono (sem gasto relevante):**
1. Console do Google Cloud, Faturamento, Relatórios: agrupar por SKU e ligar a opção "mostrar créditos".
2. Fazer uma chamada pequena ao `gemini-3.8-flash` (alguns centavos) e, em até algumas horas, olhar se aparece linha de **crédito** abatendo o custo. Se aparecer, o crédito cobre. Se o custo aparecer sem abatimento, está sendo cobrado de verdade.
3. Antes de qualquer teste, criar um **alerta de orçamento** (por exemplo US$ 5) e, se a conta for paga, um teto.

**O que o crédito cobre e vale usar (leitura minha da regra acima; a doc não lista produto por produto):**

| Serviço Google | Preço oficial lido | Cobre? | Vale usar? |
|---|---|---|---|
| Gemini 3.8 Flash / 4 Argon / 3.5 Transcribe (Vertex) | ver seção 3 | Não (provável) | Usar mesmo assim: custa centavos por vídeo |
| Veo 3.1 (Vertex): Lite US$ 0,05 por segundo em 720p com áudio (1080p US$ 0,08); Fast US$ 0,10 (720p com áudio); padrão US$ 0,40 | cloud.google.com/vertex-ai/generative-ai/pricing, lido 26/11 | Não (provável): fica dentro de Vertex/Model Garden, mas **a doc não cita Veo pelo nome** | Só para B-roll gerado; não é o foco do editor |
| Imagen 4 US$ 0,04 por imagem (Fast US$ 0,02) | mesma página | Não (provável) | Capa/arte, baixa prioridade |
| Lyria 3 Pro US$ 0,08 por música (até 3 min); Lyria 3 clipe US$ 0,04 | mesma página; no AI Studio, Lyria 3.5 a US$ 0,08 por música | Não (provável) | **Direito de uso comercial em anúncio não está claro** (seção 5.5) |
| Speech-to-Text v2 / Chirp: US$ 0,016 por minuto padrão (de 0 a 500 mil min por mês); US$ 0,003 em lote dinâmico | cloud.google.com/speech-to-text/pricing, lido 26/11 | Sim (provável): a lista de serviços dos termos do Google separa "Speech-to-Text" de "Gemini platform" | Sim, para a rodada de comparação e como transcrição de reserva |
| Video Intelligence API: legenda de fala US$ 0,048 por min, detecção de plano US$ 0,05, rosto/pessoa US$ 0,10, objeto/texto/logo US$ 0,15; primeiros 1.001 min por mês grátis em cada recurso | cloud.google.com/video-intelligence/pricing, lido 26/11 | Sim (provável); o grátis nem usa o crédito | Detecção de plano e de pessoa como segunda opinião barata |
| Cloud Storage (guardar bruto), Cloud Run (motor), Compute Engine com GPU L4 (depois de migrar para conta paga) | tabela de preços do Google, não lida por mim | Sim (provável) | **Melhor uso do crédito**: tira o bruto do disco da Railway (o problema de 500 MB/5 GB de 26/11), roda Whisper large-v3 e pyannote em GPU e permite testar modelos abertos de vídeo |

Aviso: migrar para conta paga é o que abre a GPU, e a conta paga cobra no cartão o que o crédito não cobre. Só migrar com alerta de orçamento e teto ligados.

---

## 3. O cérebro que entende vídeo

### 3.1 Quem aceita vídeo com áudio de verdade

| Modelo | Aceita vídeo com áudio? | Tempo marcado? | Limites | Preço | Veredito |
|---|---|---|---|---|---|
| **Gemini 3.8 Flash** (`gemini-3.8-flash`, GA 02/09/2026) | Sim (vídeo e áudio de entrada) | Sim, em `MM:SS` na doc | Vertex: cerca de 45 min com áudio (cerca de 1 h sem áudio), até 10 vídeos por pedido, 2 GiB por arquivo do Cloud Storage, janela de 1.048.576 tokens | Entrada US$ 0,75 e saída US$ 3,75 por milhão até 31/12/2026; US$ 1,50 e US$ 7,50 em 01/01/2027. Mesmo preço na Vertex em fontes secundárias; a página oficial da Vertex que li ainda não tinha a linha do 3.8 | **Escolha principal** |
| **Gemini 4 Argon** (`gemini-4-argon`, GA 13/10/2026) | Sim | Sim | Iguais ao 3.8 Flash | US$ 2 e US$ 10 até 30/11/2026; US$ 4 e US$ 20 depois (página do Gemini API, lida 26/11) | Segunda opinião e direção reserva |
| Gemini 3.5 Flash-Lite | Sim (texto, imagem, vídeo, áudio) | Sim | — | US$ 0,30 entrada e US$ 2,50 saída | Triagem barata de muitos clipes |
| **TwelveLabs Pegasus 1.6** (06/10/2026) | Sim, analisa vídeo e até 20 imagens por pedido | Sim: eventos com tempo dentro de cada segmento | Até 1 h síncrono; 2 h assíncrono; arquivos até 10 GB por upload em partes; **suporte a áudio e a pt-BR não aparecem nas notas de versão** | Páginas oficiais lidas não listam preço do Pegasus. Fontes secundárias citam Marengo a US$ 0,042 por minuto indexado (não verificado em página oficial) | **Candidato a teste cego**, não a substituto |
| TwelveLabs Marengo 3.5 | Embeddings de vídeo, áudio, imagem e PDF | Busca (3.0), embeddings (3.5) | Sem limite de duração (3.5) | Preço oficial não lido | Útil se um dia tivermos biblioteca de bruto para buscar |
| Claude (Fable, Opus, Sonnet, Haiku 5.x) | **Não**: só imagem (JPEG, PNG, GIF, WebP; GIF animado = primeiro quadro; até 600 imagens por pedido, 128 MB) | — | — | — | Segue como diretor e redator, lendo texto mais folhas de quadros |
| OpenAI | **Não confirmei** documentação oficial de vídeo de entrada na API; achei só guias de terceiros ("frames extraídos pelo chamador") e um exemplo oficial de diarização por áudio | — | — | — | Fora da disputa por falta de prova |
| Qwen3-Omni, WeMM-Video (Tencent, 19/11/2026) | Sim, abertos | Não verifiquei saída com tempo | WeMM é bilíngue **chinês e inglês**; pt-BR não é alvo | Pesos abertos; exige GPU | Só como curiosidade e teste futuro em GPU do crédito. WeMM-Video-35B-A3B reporta liderança entre abertos, mas é artigo de 19/11/2026, sem reprodução independente |

**Fatos que sustentam a escolha do Gemini:**
- O guia oficial de "video understanding" diz que os modelos Gemini descrevem, segmentam, extraem informação, respondem perguntas e **citam tempos do vídeo**. Modo estático: 1 quadro por segundo mais áudio, com marca de tempo a cada segundo. Modo "agentic": o modelo decide o que olhar e usa até 88% menos tokens em vídeo longo (a própria doc avisa que em clipes com menos de 5 min pode gastar mais). Fonte: https://ai.google.dev/gemini-api/docs/video-understanding (lida 26/11/2026).
- Contagem de tokens: cerca de 100 tokens por segundo em resolução baixa e cerca de 300 em alta.
- Na Vertex: 3.8 Flash e Argon aceitam `gs://` de até 2 GiB, 10 vídeos por pedido, "agentic video understanding: supported". Fonte: docs.cloud.google.com, páginas "Gemini 3.8 Flash" e "Gemini 4 Argon", atualizadas em 23 e 24/11/2026.

**Limites reais que a doc admite (fatos):** amostragem de 1 quadro por segundo "pode perder detalhe em ação rápida" (modo estático); em fórum oficial de desenvolvedores há relato de erro do modo "agentic" no 3.8 Flash depois de 23 chamadas de processamento (29/10/2026). Isso é relato de usuário, não confirmação.

**Qual é o melhor para dirigir edição?** **Não achei benchmark independente "dirigir edição de vídeo"**. Posso dizer o que está provado: (a) só o Gemini tem entrada nativa de vídeo e áudio verificada em doc oficial, GA, com tempo e multi-vídeo; (b) o Pegasus 1.6 tem evento com tempo, mas sem preço nem prova de áudio e pt-BR. **Minha opinião:** dividir o trabalho. O Gemini **assiste** e devolve uma "folha de observação" (JSON com tempos); o Claude **dirige** em texto, que é o que ele faz melhor e onde já temos QA de 3 reprovações. A prova só vem de um teste cego nos nossos casos (seção 8).

### 3.2 Formato recomendado da saída do "assistir"
Pedir ao Gemini JSON estruturado (a Vertex aceita "structured output") por clipe e por câmera, com `MM:SS` em segundos inteiros: falas e quem fala (nome por rosto/voz), momentos fortes (gancho, pico de emoção, risada, gesto), erros (fala cortada, olhar para a câmera, voz de outra pessoa ao fundo, ruído, trecho tremido), enquadramento (rosto centrado, rosto cortado), "pode ser b-roll sem som de gente?". Uma chamada por câmera, e uma segunda com as duas câmeras juntas para dizer qual ângulo mostra quem fala. O catálogo textual de hoje (15k tokens) ganha uma coluna "visto por Gemini".

---

## 4. Produtos de edição por IA "agente" (o que é de verdade)

Todas as notas de "quem está na frente" vêm de blogs de fornecedores concorrentes (loopdesk.ai, opus.pro, tella.com, higgsfield.ai, descript.com) e foram lidas como **marketing**, não como ranking independente. Abaixo só entra o que li em página oficial.

| Produto | O que faz de melhor que nós não fazemos | Dá para integrar por API? Preço | Veredito |
|---|---|---|---|
| **Adobe Premiere AI Assistant** (beta; FAQ oficial atualizada em 10/11/2026) | Agente dentro do Premiere que organiza o projeto, processa transcrições, marca clapper, monta "stringout" e primeiro corte, cria legendas, reenquadra, faz máscaras e cor; **modo de permissão em três níveis**; "skills" salvas pelo editor; gasta créditos do Firefly; "o assistente vê clipes, bins, transcrições e mídia local" | Não: é painel dentro do app. Terceiros por MCP é meta "início de 2027" (fonte secundária). Preço em créditos Firefly, não achado | Copiar o desenho (Plano antes de executar, três modos de permissão, skills do dono). Não integrar |
| **Descript Underlord** (página de preços lida em 26/11/2026) | Edição por transcrição, "co-editor" que aceita pedido em frase; Studio Sound; transcrição pt-BR em todos os planos | A página cita "API + MCP" sem dizer de qual plano. Planos: Hobbyist US$ 16 ou 24, Creator US$ 24 ou 35, Business US$ 50 ou 65 por pessoa por mês (anual ou mensal, a página não rotula) | Referência de interface. Não integrar |
| **Runway Aleph 2.0** (API oficial) | Edita **dentro** de um plano existente por texto (trocar fundo, tirar objeto); saída com a resolução da entrada | Sim: US$ 0,28 por segundo, mínimo US$ 0,56 por pedido. A mesma API revende Voice Isolation (US$ 0,01 por 6 s) e Eleven Music v2.5 (US$ 0,20 por minuto) | É edição generativa, não corte. Útil para consertar um plano ruim; nada a ver com direção. A API de áudio é o achado útil |
| **OpusClip API** (doc oficial lida em 26/11/2026) | Achar clipes em vídeo longo, reenquadrar, legenda, publicar. 1 crédito = 1 min; até 10 h e 30 GB por vídeo; 30 pedidos por minuto; API só nos planos Pro (Beta), Max e Business; "mais de 20 idiomas", **português não nomeado** na página | Sim, mas por plano mensal (Starter US$ 15 e Pro US$ 29 segundo site secundário, 28/08/2026; não li a tabela oficial de preço) | Concorrente de uma função nossa ("achar momento"), sem a nossa marca, QA nem diálogo de duas câmeras. Não integrar |
| **DaVinci Resolve 21** (Blackmagic; lançamento 03/06/2026, 21.1 em 08/09/2026) | "Multicam SmartSwitch" corta para o ângulo de quem está falando, IntelliScript monta linha do tempo a partir de roteiro, isolamento de voz. As páginas que li são secundárias (a página oficial não abriu) | Não: app de mesa | Copiar a ideia: **trocar de câmera pelo falante** (nossa diarização mais a observação do Gemini) |
| **ElevenLabs Instant Soundtracks / Video to Music API** (15/10/2026, segundo imprensa; não li a página oficial) | Compõe música para o vídeo enviado e posiciona efeitos sonoros em camada separada; API com `add_sfx`, `separate_tracks`, `use_audio_as_reference`; até 10 vídeos e 600 s por pedido | Sim, API. **Preço não divulgado no anúncio**; termos de música lidos na página oficial (09/10/2026) | **Candidato nº 1 a trilha mais efeitos** |
| **Epidemic Sound Soundtrack API** (beta; texto oficial de 02/11/2026) | Escolhe música do catálogo certo pelo ritmo e clima do vídeo; vídeo até 4 min e 600 MB; 2.500 créditos por trabalho; sem efeitos ainda; sem "ducking" ainda | Exige chave e contrato pago da API (níveis "Scale" ou "Enterprise", preço sob consulta); o nível grátis é só para protótipo e não pode ir ao ar | Fora do nosso alcance agora |
| **Submagic, CapCut, Captions (Mirage)** | Legendas animadas e cortes de silêncio | Submagic: API só no plano Business, US$ 69 por mês (US$ 41 no anual); CapCut Pro US$ 19,99 por mês sem API verificada; Captions/Mirage não verificado | Nosso kit HTML já faz; não vale |
| **Google Gemini Omni Flash, Veo 3.1** | Gera e edita até 15 s de vídeo com áudio nativo (Omni); Veo gera b-roll | Omni Flash: preço no site, não li; Veo: seção 2 | Geração, não edição; nicho de b-roll |
| **Código aberto** (video-use, MartinDelophy/ai-video-editor com MCP, podcast-shorts-factory, OpenFilm, Tencent WeVisCut) | Agentes que editam por texto com FFmpeg | Grátis | Só vi resultados de busca, **não li o código**; WeVisCut é de roteiro para vídeo, outro problema. Não trazer sem passar pela skill `find-skills` |
| **Higgsfield (conta do dono)** e **Picsart (MCP conectado)** | Têm ferramentas de "sala de edição" e "análise de vídeo" no conector | Não testei nenhuma (enviariam mídia a serviço externo) | Mencionar: se um dia valer, testar com material sintético |

**O que é só marketing (opinião minha, apoiada nos fatos acima):** "agente que edita tudo sozinho" aparece em quase todos os textos de comparação, mas só o Premiere (beta) e o Descript mostram em doc própria o que o agente executa, e ambos são programas de mesa com o editor humano no meio. Nenhum aceita as duas câmeras de um diálogo e devolve um filme conferido por QA, que é o que o nosso motor tenta.

---

## 5. Peças para as lacunas provadas (26/11)

### 5.1 Sincronia multicâmera pelo áudio
- **BBC `audio-offset-finder`** (Apache-2.0, ativo em 2026): correlação cruzada de MFCC; precisão típica de cerca de 0,01 s; devolve "standard score" (acima de 10 provavelmente correto; abaixo de 5 provavelmente errado, conferir à mão). Instala por `pip`, usa FFmpeg. Fonte: https://github.com/bbc/audio-offset-finder (lida em 26/11/2026).
- **`audalign`** (MIT): fingerprint e correlação, alinha vários arquivos do mesmo evento, tem redução de ruído embutida. https://github.com/benfmiller/audalign
- **`syncstart`** (MIT, v1.1.1): mais simples, por correlação em FFT. https://github.com/rpuntaie/syncstart
- **Minha opinião:** audio-offset-finder para o par de celulares (as duas câmeras captam a mesma sala), com o "standard score" como critério de aceitar ou pedir olho humano. Rodar em janelas de 20 s no começo, meio e fim para pegar deriva entre aparelhos.
- **Não confirmado:** nenhum dos três foi testado por mim em áudio de celular com conversa sobreposta.

### 5.2 Diarização (quem fala), em português
- **pyannote community-1**: aberto; versão atual da biblioteca 4.1.0 segundo blog de fornecedor concorrente; WhisperX o usa e declara a licença dos pesos como CC-BY-4.0 (README do WhisperX, lido 26/11). Hospedado a €0,035 por hora de áudio (página de preço do pyannoteAI, lida 26/11). Precision-2 (pago): "cerca de 28% mais preciso que o community-1" segundo a própria doc; preço não listado na página.
- **Gemini 3.5 Transcribe**: diarização "até 8 vozes", **experimental**, e com diarização ou tempo por palavra o limite é de **15 min por arquivo**. pt-BR e pt-PT constam como "Supported" na lista de idiomas. Fonte: doc oficial na Vertex, lida 26/11/2026. Relato em fórum oficial (01/09/2026): vocabulário personalizado **não pode** ser combinado com diarização nem com tempo por palavra; a doc oficial que li não diz isso.
- **Chirp 3**: diarização disponível (GA) em `Recognize` e `BatchRecognize`; funciona com detecção de idioma "se o idioma suportar"; **não confirmei se pt-BR está na lista de diarização**. Tempo por palavra existe (GA), mas "pode reduzir levemente a precisão"; em lote, até 20 min com tempo por palavra. Fonte: doc oficial do Chirp 3, lida 26/11/2026.
- **ElevenLabs Scribe v2**: diarização de até 32 vozes, tempo por palavra, "keyterm prompting" (fontes secundárias, 18/10 a 07/11/2026; não li a página oficial).
- **Minha opinião:** diarização local com pyannote community-1 (via WhisperX) mais a "folha de observação" do Gemini (quem aparece falando) como cruzamento. No diálogo de 26/11, uma heurística extra e barata: a voz do dono do aparelho é mais alta no áudio dele.

### 5.3 Transcrição pt-BR com nomes próprios
**Não achei benchmark independente de português brasileiro informal (celular, sala barulhenta) que compare Whisper large-v3, Chirp 3, Scribe v2 e Gemini.** O que existe:
- Estudo da Tech for Humans (27/07/2026, brasileiro): campeão em custo-benefício foi o **Gemini 2.0 Flash Lite**, e **sotaque de Goiás** foi o cenário mais crítico, com quase todos os modelos errando ou "alucinando"; **limpar o ruído com rede neural antes de transcrever** foi decisivo. Sem tabela de erro no resumo (o PDF completo exige cadastro). Esse estudo testou modelos antigos.
- Agregados multilíngues de sites secundários: no site pikkaai.com (17/09/2026) Scribe v2 3,8% de erro de caracteres, Gemini 3.5 Transcribe 6,6%, **Chirp 3 12,2%** em 95 idiomas; no yapapp.cc (19/10/2026), no FLEURS em português, Whisper large-v3 3,90% de erro de palavras e Parakeet TDT v3 3,62%. São bancos de leitura limpa, não conversa de celular. Nada disso é pt-BR informal.
- Medição da casa (`ARQUITETURA.md`): turbo com 6,7% de erro e Parakeet com 11,6% em pt-BR informal; modelo `small` errou "Guerreiro, Sisal, Bacia do Jacuípe" no caso de 26/11 e `large-v3` com vocabulário do pedido resolveu.
- **Recomendação:** manter Whisper large-v3 mais vocabulário do pedido como padrão (já provado no caso real) e **rodar uma rodada cega de 3 trechos reais** (1 min cada) contra Scribe v2, Chirp 3 e Gemini 3.5 Transcribe. Custo total estimado: menos de US$ 0,10 (meu cálculo). Só com o "pode" do dono, porque envia áudio do cliente a terceiro.

### 5.4 Fim de fala para corte
- Silero VAD (MIT, 10,8 mil estrelas) e TEN VAD (Apache-2.0 "com condições adicionais": ler a licença antes de usar); WhisperX usa Silero. Contudo a própria casa mediu que **VAD derrubou 5 de 6 falas gritadas ou sobre música** (`ARQUITETURA.md`). **Opinião:** não usar VAD como critério de corte; usar o tempo de palavra do WhisperX mais energia, e VAD só para achar silêncio longo.

### 5.5 Música licenciada por API (uso comercial em anúncio)
| Opção | Licença para anúncio | API | Custo | Observação |
|---|---|---|---|---|
| **ElevenLabs Music** (termos de 09/10/2026) | "Uso comercial online e offline permitido, **exceto filme, TV, rádio e jogos de estúdio**" em todos os planos até Business; sem atribuição nos planos pagos; **plano Free só para uso individual e com atribuição**; API a partir do Starter | Sim | Runway lista Eleven Music v2.5 a US$ 0,20 por minuto; segundo um site secundário (01/11/2026) US$ 0,15 por minuto na API própria | Serve para anúncio de Meta e Instagram. **Não serve para comercial de TV ou rádio do Super Kal** sem plano Enterprise. Os termos proíbem pedir "no estilo de [artista]" |
| **Lyria 3.5** (Google, US$ 0,08 por música) | **Não confirmado.** Fóruns de desenvolvedores (14/10 a 22/11/2026) ainda perguntam a Google sobre uso comercial; todas as faixas levam marca SynthID | Sim (Gemini API e Vertex) | US$ 0,08 | Sem resposta oficial: não usar em anúncio de cliente |
| **Envato Elements** (€ 14,50 por mês no anual) | "Cobre anúncio pago em Meta, Google e LinkedIn"; **uma licença por peça de anúncio** | Não achado | € 14,50 por mês | Fonte secundária (tallyterms, checada em 23/11/2026) |
| **Artlist Pro** (€ 199 por ano, só música) e **Epidemic Sound Pro** | Cobrem anúncio pago | Epidemic tem API, mas para plataformas, com contrato sob consulta | € 199 por ano (Artlist) | Fonte secundária |
- **Opinião:** ElevenLabs Music pela API para anúncio digital (cobre o buraco da biblioteca vazia) mais Envato Elements para "música de catálogo" quando um cliente exigir. Registrar plano e data de cada trilha entregue, como já se faz com Suno.

### 5.6 Remoção de ruído de voz
- **DeepFilterNet** (Rikorose, código e pesos em MIT ou Apache-2.0 à escolha, ~5,1 mil estrelas): binário `deep-filter` pronto, áudio de 48 kHz, baixa complexidade. https://github.com/Rikorose/DeepFilterNet
- **ElevenLabs Voice Isolator** via API da Runway: US$ 0,01 por 6 s. Fontes secundárias dizem que "puxa a voz do ruído de forma mais agressiva" e o Adobe Podcast soa mais natural (comparativos de blog, out/2026); Adobe Podcast Enhance Speech: até 1 h por dia grátis, 30 min por arquivo (site secundário), **sem API pública achada**.
- **Opinião:** DeepFilterNet em passagem moderada (regra do dono: voz natural, sem bombeamento), isolador só quando o ruído for forte. O estudo brasileiro (seção 5.3) indica fazer isso **antes** de transcrever.

### 5.7 Legendas animadas e reenquadramento
- Legenda: o kit HTML da casa (GSAP) já cobre; nada de fora supera sem custo. Submagic só dá API a US$ 69 por mês.
- Reenquadramento: já fazemos por rosto. O Gemini pode confirmar "o rosto de quem fala está no centro?" na folha de observação. Opus (ReframeAnything) e Premiere (Auto Reframe) existem, mas não por API aberta.

---

## 6. Arquitetura recomendada: "cérebro em conjunto"

```
bruto ──► [armazenamento: Cloud Storage do Google*] ──► sincronia (audio-offset-finder) ──┐
                                                                                         ▼
 limpeza (DeepFilterNet)  ──► transcrição (Whisper large-v3 + vocabulário) ──► diarização (pyannote) ──► catálogo em texto
                                                                                         │
 ASSISTIR: Gemini 3.8 Flash (câmeras juntas, JSON com tempos) ───────────────────────────┤
                                                                                         ▼
                    DIRIGIR: Claude (Opus 5.5 ou Fable 5.2)  ◄──  memória e regras da casa
                                                                                         │
                         resolvedor em código ──► montagem ffmpeg + kit HTML ──► QA em código
                                                                                         ▼
                               CONFERIR: Gemini 3.8 Flash assiste ao filme final ──► QA aprova ou devolve
 música/efeitos: ElevenLabs Music (API) ou biblioteca licenciada
```
\* o Cloud Storage entra para tirar o bruto do disco da Railway; Gemini lê direto por `gs://`.

| Papel | Modelo ou ferramenta | Por quê |
|---|---|---|
| Assistir | Gemini 3.8 Flash (Argon só em empate difícil) | Único com vídeo e áudio nativos, tempo, multi-vídeo e `gs://` verificados |
| Dirigir | Claude Opus 5.5 (Fable 5.2 em direção premium) | Já é o motor das direções aprovadas; texto estruturado e regras da casa |
| Texto de venda | Claude (mesmo) | Português do Brasil, tom da marca |
| Conferir o filme | Gemini 3.8 Flash + QA em código | O QA de hoje mede e não vê; o Gemini vê |
| Transcrever | Whisper large-v3 (padrão); Scribe v2 se a rodada vencer | Padrão provado no caso real |
| Sincronia, diarização, fim de fala, limpeza | Código local aberto (seção 5) | Grátis, sem enviar dado |
| Música/SFX | ElevenLabs Music API | Licença cobre anúncio digital |

### Custo estimado por vídeo de 60 s (meu cálculo, preços de tabela de 26/11/2026; bruto de 10 min)
| Item | US$ | R$ (a 5,50) |
|---|---|---|
| Assistir ao bruto (3.8 Flash, 60 mil a 180 mil tokens de entrada, 8 mil de saída) | 0,08 a 0,17 | 0,45 a 0,95 |
| Conferir o filme final (1 min, 6 mil a 18 mil tokens) | 0,01 a 0,02 | 0,05 a 0,10 |
| Direção e crítica (Opus 5.5: 2 chamadas de 15 mil entrada e 4 mil saída; texto de venda incluso) | cerca de 0,28 a 0,40 | 1,55 a 2,20 |
| Transcrição local (large-v3) | 0 (se for Scribe: 0,04) | 0 (ou 0,22) |
| Diarização local (se for hospedada: cerca de €0,006) | 0 | 0 |
| Música gerada (1 minuto) | 0,15 a 0,20 | 0,80 a 1,10 |
| Limpeza com isolador pago (opcional, 1 min) | 0,10 | 0,55 |
| **Total** | **cerca de 0,60 a 1,00** | **cerca de 3,30 a 5,50** |

- **Pago por fora do Google:** Claude (Anthropic, hoje sem saldo) e ElevenLabs (música). Nada dessa lista é pago com o crédito do Google, mesmo que o Gemini fosse coberto.
- **Pago pelo Google e talvez coberto:** Gemini (Não provável), armazenamento e GPU (Sim provável).
- O preço do Gemini 3.8 Flash **dobra em 01/01/2027** (US$ 1,50 e US$ 7,50): o item "assistir" sobe para cerca de US$ 0,15 a 0,33 por vídeo. Continua pequeno.
- Os tokens do Claude 4.7 e posteriores são cerca de 30% mais numerosos para o mesmo texto (nota oficial de preço); as chamadas acima já são estimativa folgada.

---

## 7. Cuidados de privacidade e licença
- **Não usar o nível grátis do Gemini API/AI Studio com material de cliente:** a própria tabela diz que "Used to improve our products: Yes" no grátis e "No" no pago.
- Chave de AI Studio nunca usa o crédito de US$ 300 (fato oficial).
- ElevenLabs Free: música só para uso individual e com atribuição. Para anúncio de cliente, plano pago.
- TEN VAD tem licença "Apache 2.0 com condições adicionais": ler antes de adotar. Pesos do pyannote community-1: CC-BY-4.0 (atribuição).
- Nada de rodar código de repositório achado em busca sem a skill `find-skills` (regra da casa).

---

## 8. O que não deu para confirmar (e como fechar)

1. **Se o crédito do dono cobre Gemini/Vertex.** Pela conta de datas, provavelmente não. Teste da seção 2.
2. **Se Veo, Imagen, Lyria e Chirp estão dentro ou fora da exclusão "plataforma Gemini".** A doc só nomeia "Gemini platform (formerly Vertex AI)". Inferi pelos termos do Google, que listam "Speech-to-Text" como serviço separado.
3. **Preço do Pegasus 1.6 e do Marengo** em página oficial (a de preços lida não os lista), e se Pegasus entende áudio em português.
4. **Preço do Instant Soundtracks e do Video to Music** da ElevenLabs (o anúncio não traz).
5. **Qual modelo dirige melhor a edição.** Sem benchmark independente. Proposta de teste cego com o caso real do dono (anúncio de diálogo Super Kal, os 15 vídeos já em `p_d79b29f853`): Gemini 3.8 Flash contra Argon contra Pegasus 1.6, medindo (a) acertou quem fala, (b) achou os erros que o QA reprovou (fala cortada, voz externa, câmera sem sincronia), (c) tempos com erro menor que 0,5 s. Custo estimado das duas primeiras: menos de US$ 2 (meu cálculo). **Precisa do "pode" do dono** por mandar material do cliente a serviço externo; ele já usou a chave do Vertex, então é a primeira a testar.
6. **Erro de pt-BR informal** de Chirp 3, Scribe v2 e Gemini 3.5 Transcribe, sem benchmark independente.
7. **DaVinci Resolve 21 e Epidemic Sound Soundtrack API:** páginas oficiais não abriram para funções detalhadas; usei texto oficial do Epidemic (02/11/2026) e fontes secundárias para o Resolve.
8. **OpenAI:** entrada de vídeo na API não confirmada em doc oficial.
9. **Direito comercial da Lyria 3.5 para anúncio:** sem resposta oficial.
10. Dados de preço da Vertex para o 3.8 Flash vêm de fonte secundária (a página oficial lida ainda não listava o 3.8). Preço oficial do Gemini API foi lido.

---

## 9. Próximos passos (em ordem; nada gasta sem o "pode" do dono)

1. **Hoje, grátis:** teste do relatório de faturamento (seção 2) e alerta de orçamento.
2. **Grátis:** instalar `audio-offset-finder` e `pyannote community-1` no ambiente do editor e rodar sobre o caso real do Super Kal (os arquivos já estão no editor; nada sai da casa).
3. **Barato, com "pode":** teste cego "assistir" (Gemini 3.8 Flash contra Argon contra Pegasus 1.6) e rodada de transcrição (seção 5.3).
4. **Construção:** etapa "assistir" no motor (`etapas/`), com saída em `analise.json` e coluna nova no catálogo; etapa "conferir o filme" no QA.
5. **Sob decisão do dono:** assinar ElevenLabs (plano Starter ou superior) para trilha por API; Envato Elements para catálogo; recarregar a Anthropic.
6. **Se o crédito do Google ficar de pé para infra:** Cloud Storage para o bruto, VM com GPU L4 para Whisper large-v3 e pyannote, e rodar WeMM-Video em teste.

---

## 10. Fontes (todas lidas em 26/11/2026, salvo indicação)

**Google (oficial)**
- Free trial, o que é excluído: https://cloud.google.com/free/docs/free-cloud-features
- Gemini API, preços: https://ai.google.dev/gemini-api/docs/pricing
- Gemini API, entendimento de vídeo: https://ai.google.dev/gemini-api/docs/video-understanding
- Gemini API, áudio: https://aistudio.google.com/docs/audio (antes https://ai.google.dev/gemini-api/docs/audio)
- Gemini API, lista de modelos: https://aistudio.google.com/docs/models
- Vertex, Gemini 3.8 Flash (atualizada 24/11/2026): https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash
- Vertex, Gemini 4 Argon (atualizada 23/11/2026): https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-argon
- Vertex, Gemini 3.5 Transcribe: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-transcribe
- Vertex, preços (Imagen, Veo, Lyria): https://cloud.google.com/vertex-ai/generative-ai/pricing
- Chirp 3: https://docs.cloud.google.com/speech-to-text/v2/docs/chirp_3-model
- Speech-to-Text, preço: https://cloud.google.com/speech-to-text/pricing
- Video Intelligence, preço: https://cloud.google.com/video-intelligence/pricing
- Termos do free trial: https://cloud.google.com/terms/free-trial

**Anthropic (oficial)**
- Visão (só imagem): https://platform.claude.com/docs/en/build-with-claude/vision
- Preços: https://platform.claude.com/docs/en/about-claude/pricing

**Vídeo e produtos**
- TwelveLabs, notas de versão (Pegasus 1.6, 06/10/2026; Marengo 3.5, 31/08/2026): https://docs.twelvelabs.io/docs/get-started/release-notes ; preços (sem valores de modelo): https://www.twelvelabs.io/pricing
- Adobe Premiere AI Assistant, FAQ oficial (10/11/2026): https://helpx.adobe.com/premiere/desktop/premiere-ai-assistant/assistant-faq.html
- Descript, preços: https://www.descript.com/pricing
- Runway, preços da API: https://dev.runway.com/pricing?model=all
- OpusClip, API: https://help.opus.pro/api-reference/overview
- ElevenLabs, termos de música (09/10/2026): https://elevenlabs.io/music-terms
- Epidemic Sound, Soundtrack API (02/11/2026) e nível grátis (25/06/2026): https://epidemicsound.com/blog/soundtrack-api ; https://epidemicsound.com/blog/free-api
- WeMM-Video (19/11/2026): https://arxiv.org/abs/2611.26409 ; WeVisCut: https://huggingface.co/tencent/WeVisCut

**Peças abertas**
- audio-offset-finder: https://github.com/bbc/audio-offset-finder ; audalign: https://github.com/benfmiller/audalign ; syncstart: https://github.com/rpuntaie/syncstart
- pyannote, modelos e preços: https://docs.pyannote.ai/models ; https://www.pyannote.ai/pricing
- WhisperX: https://github.com/m-bain/whisperX ; Silero VAD: https://github.com/snakers4/silero-vad ; TEN VAD: https://github.com/TEN-framework/ten-vad ; DeepFilterNet: https://github.com/Rikorose/DeepFilterNet

**Secundárias (tratadas como apoio fraco)**
- Mudança de 16/11 repetida: https://aicoder.com/news/news-20261115-google-cloud-300-free-trial-credit-no-longer-covers-gemini-platform-vertex-ai-from-nov-16 (12/11/2026) ; https://programscape.com/watch/gcp-free-program-change-2026-11-16 ; https://costbrake.com/guides/google-cloud-free-trial-credits
- Relato de limite do custom vocabulary com diarização: https://discuss.ai.google.dev/t/gemini-3-5-transcribe-documented-custom-vocabulary-diarization-timestamps-configuration-is-rejected-by-the-interactions-api/180240/3 (01/09/2026)
- Estudo de transcrição em português: https://www.techforhumans.com.br/researches-en/whats-the-best-ai-for-portuguese-speech-transcription-a-comprehensive-technical-study (27/07/2026)
- Agregados de erro: https://pikkaai.com/speech/accuracy (17/09/2026) ; https://yapapp.cc/questions/speech-recognition-accuracy-portuguese (19/10/2026)
- Licenças de música por plano: https://tallyterms.com/blog/music-licence-subscriptions-for-creators (checado 23/11/2026) ; imprensa sobre Instant Soundtracks: https://wearethemusicmakers.co/news/2026/10/elevenlabs-instant-soundtracks-sync-library-squeeze (23/10/2026)
- Preços de Scribe v2: https://www.developersdigest.tech/models/speech/elevenlabs (18/10/2026) ; https://therundown.ai/tools/scribe-v2 (29/08/2026)
- DaVinci Resolve 21: https://davinciresolveclub.com/davinci-resolve-21-ai-tools (30/06/2026)
- Comparativos de fornecedores sobre "agentes de edição" (lidos só como marketing): https://loopdesk.ai/blog/best-ai-video-editing-agents-2026 ; https://opus.pro/blog/best-ai-video-editing-agents
