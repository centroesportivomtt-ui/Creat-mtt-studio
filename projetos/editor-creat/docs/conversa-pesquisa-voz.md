# Frente VOZ: o dono manda áudio pelo iPhone e recebe resposta rápida

Pesquisa de 25/11/2026 (Radar). Pedido do Marcos: "eu lhe mando um áudio… vejo o que está executando… tem que ter lá também". Aqui só a entrada por voz, a transcrição e a resposta falada. A conversa em si (o editor perguntar de volta) e a tela ao vivo são de outras frentes.

Convenções: "medido" = rodei nesta máquina (4 vCPU Xeon 2,1 GHz, 16 GB, 25/11/2026). "Não confirmado" = não achei fonte primária nem medi. Preços em dólar, como as páginas dos fornecedores mostram, lidos em 25/11/2026. Nada foi contratado.

---

## 1. Resposta curta

- **Caminho mais simples que já fica excelente:** um botão de microfone dentro do campo de mensagem que grava (toque para começar, toque para parar), manda o áudio ao motor, e o motor transcreve com o faster-whisper que ele já tem (`small`, int8, CPU). O texto cai no campo, editável, e o dono envia com um toque. Custo: zero além da CPU. Medido: 22,7 s de áudio em 2,5 s; 8,6 s em 1,8 s.
- **Hoje, sem código:** o ditado do teclado do iPhone já funciona em qualquer campo de texto, roda no aparelho, não precisa de internet e lista "Portuguese (Brazil)" entre os idiomas com ditado no aparelho. Além disso, foge dos problemas de permissão de microfone em PWA (seção 2.3).
- **Voz na resposta do editor: opcional, nunca padrão.** Texto sempre; um botão "ouvir" com a voz do próprio iPhone (grátis). Voz paga (ElevenLabs ~US$ 10,80/mês no uso estimado) só se o dono sentir falta.
- **Maior risco real:** PWA instalada no iPhone pede de novo a permissão do microfone a cada abertura (bug aberto no WebKit, 12/10/2026) e o `MediaRecorder` já falhou depois de reabrir o app. Isso decide o desenho (2.3).
- **Passo seguinte, só com autorização do Marcos e depois de medir erro real:** Groq `whisper-large-v3-turbo` (US$ 0,04/hora) ou OpenAI `gpt-transcribe` (US$ 0,0045/min, aceita dicas de palavras) se o `small` errar muito os nomes ou a CPU estiver ocupada com render.

---

## 2. Gravação no navegador do iPhone

### 2.1 Formatos (`MediaRecorder` no Safari)

- Até o Safari 18.3 só saía MP4 (AAC no áudio): o WebKit diz que "currently supports the MP4 file format with H.264 as video codec and AAC as audio codec" (https://webkit.org/blog/11353/mediarecorder-api/, nov/2020).
- Safari 18.4 passou a gravar WebM com Opus, Ogg (Opus/Vorbis), MP4 fragmentado e áudio sem perda (ALAC/PCM) (https://webkit.org/blog/16574/webkit-features-in-safari-18-4/). Informação de mais de um ano (março/2025), mas ainda vale; o iOS atual é 26.x/27 (https://caniuse.com/wake-lock lista 27.0 a 27.2).
- Por isso o código tem de perguntar ao navegador, não presumir: `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')` dá falso do 14.1 ao 18.3 e verdadeiro do 18.4 em diante (relato de terceiro, não de nota oficial da Apple). Ordem sugerida: `audio/webm;codecs=opus`, depois `audio/mp4`, depois o padrão do navegador.
- Por que WebM primeiro (decisão minha, a testar no aparelho): a regressão do iOS 26 que truncava gravações MP4 (1 min virava ~29 s; https://bugs.webkit.org/show_bug.cgi?id=299164) foi corrigida no iOS 26.2 e foi reproduzida só em vídeo (um engenheiro do WebKit não conseguiu reproduzir com `audio/mp4`), mas um bug parente, "MediaRecorder produces broken file for video/mp4" (315091), segue aberto. WebM não foi afetado. O ffmpeg do motor lê os dois formatos sem mudança (`ler_16k`, `transcricao_fw.py:68-73`).
- Tamanho: 30 s a 48 kbps = 180 KB; 60 s a 64 kbps = 480 KB; 60 s a 128 kbps = 960 KB (conta minha). O proxy do site recusa corpo acima de **1.000.000 bytes** (`apps/web/app/api/motor/[...rota]/route.ts:32-35`). Pedir `audioBitsPerSecond: 48000` e limitar a gravação a ~90 s mantém folga. Se o Safari respeita `audioBitsPerSecond` no áudio: não confirmado.

### 2.2 Permissão, tela bloqueada, duração

- **Permissão em Safari (aba):** o usuário pode marcar "Permitir" por site e ela fica. O site já libera o microfone no `Permissions-Policy` (`apps/web/next.config.mjs:6`, `microphone=(self)`).
- **Tela bloqueada:** em 2020 o WebKit tinha o bug "WebRTC Audio fail to capture from lock screen" (https://bugs.webkit.org/show_bug.cgi?id=211829): depois de bloquear e desbloquear, a captura não voltava; em fev/2022 o WebKit disse que estava corrigido ("These fixes should be in shipping releases"). Um post de fórum de fev/2025 afirma que WebRTC e Web Audio "are suspended as soon as the screen locks or Safari goes into the background" (https://developer.apple.com/forums/thread/774239), mas é opinião de um desenvolvedor, sem resposta do WebKit. **Comportamento atual do `MediaRecorder` com a tela bloqueada no iOS 26/27: não confirmado; precisa de teste no aparelho do dono.**
- **Manter a tela acesa durante a gravação:** a Screen Wake Lock API existe no iOS Safari a partir da 16.4 (https://caniuse.com/wake-lock). Se funciona na PWA instalada: não confirmado.
- **Limite de duração do áudio:** não achei limite documentado para áudio no Safari. Relatos de travamento são de gravação longa de vídeo (https://developer.apple.com/forums/thread/694867, citado na busca, não aberto). Limite de interface: 90 s, com `start(1000)` para receber blocos de 1 s (exemplo do próprio WebKit no artigo de 2020) e não perder tudo se a gravação cortar.

### 2.3 PWA instalada (`getUserMedia` fora do Safari)

O site é PWA: `display: "standalone"` (`apps/web/public/manifest.webmanifest:8`) e `appleWebApp.capable` (`apps/web/app/layout.tsx:9`). É exatamente o caso problemático:

- WebKit bug 327237, aberto em 12/10/2026, status NEW: apps da Tela de Início "ask for camera/microphone permission again on every launch, with no way to keep it persistent" (https://bugs.webkit.org/show_bug.cgi?id=327237). O Safari tem "Permitir" por site; a PWA não usa isso.
- WebKit bug 215884 (https://bugs.webkit.org/show_bug.cgi?id=215884): em PWA, mudar a rota/hash derrubava a captura e repetia o pedido de permissão. Marcado como resolvido, mas a conversa continua (último comentário 12/10/2026).
- Fórum Apple, ago/2025 (https://developer.apple.com/forums/thread/797987): `MediaRecorder` em PWA funciona na primeira abertura; depois de fechar e reabrir o app não grava até reiniciar o iPhone. Sem correção confirmada; o engenheiro do WebKit pediu um caso mínimo.
- **Web Speech API (`SpeechRecognition`) fica fora:** o WebKit respondeu que "is not available in SafariViewController and web apps added to Home Screen for now" (https://bugs.webkit.org/show_bug.cgi?id=225298, 04/05/2021, "RESOLVED LATER", comentários cobrando até mar/2025). Um app em Vue com `lang = 'pt-BR'` funcionava no Safari e parou na Tela de Início (https://developer.apple.com/forums/thread/748048, mar/2024).

**Consequência de desenho:**
1. O botão de microfone do app deve poder falhar com elegância: se `getUserMedia` der erro ou travar, mostrar "toque no microfone do teclado" (ditado do teclado) em vez de erro técnico.
2. O gravador mora no layout raiz, não em uma página que é desmontada na navegação; parar e soltar as faixas (`track.stop()`) ao terminar. Navegar com a gravação aberta é o cenário do bug 215884.
3. O Marcos pode usar o site em aba do Safari quando o microfone do app falhar: lá a permissão fica salva por site.
4. O ditado do teclado não passa por `getUserMedia`; é do sistema (inferência minha: os bugs acima são todos de `getUserMedia`/Web Speech, e o ditado do teclado é outro caminho). Confirmar no aparelho.

---

## 3. Transcrição: o que existe, o que mede, o que custa

### 3.1 O que o motor já tem (lido)

- `faster-whisper` em CPU, int8, `EDITOR_WHISPER_MODELO` (padrão `small`, `config.py:45`), `EDITOR_THREADS` (padrão 2, `config.py:55`), modelo carregado uma vez por processo (`transcricao_fw.py:19`, `:86-92`). Sem VAD, temperatura 0, `condition_on_previous_text=False` (`transcricao_fw.py:98-104`).
- **O motor já aceita pedido por áudio:** `PedidoEntrada.audio_chave` (`api/direcao.py:51`), `_transcrever_pedido` (`:84-94`, chama o provedor com `palavras=False` e dicas `["creat.MTT", "Ruan", "Xande", "Marcos"]`) e `gravar_pedido` (`:97-125`). O áudio chega pelo upload resumível `/api/envio` (tus) e a transcrição roda dentro da própria requisição. Falta o lado do site: não existe `MediaRecorder` nem `getUserMedia` em `apps/web` (busca no código, 25/11/2026); só o seletor de arquivos aceita `audio/*` (`componentes/Envio.tsx:208`).
- **As dicas de nomes hoje não chegam ao Whisper:** viram `hotwords` só se `EDITOR_WHISPER_DICAS=1` (`transcricao_fw.py:103`), desligado de propósito porque em música/tom elas geraram laço "marcos marcos marcos" (`:4`, `:101-102`). Para comando de voz (fala, sem música) isso pode ser diferente: ver 3.3.
- Alternativas já escritas: `parakeet` (sherpa-onnx, `provedores/transcricao_parakeet.py`) e `scribe` (ElevenLabs, pago, desligado sem chave; `transcricao_scribe.py:1-5`). A própria arquitetura anota Parakeet pior em pt-BR informal: 11,6% x 6,7% de erro contra o Whisper (`ARQUITETURA.md:14`).

### 3.2 Medição do faster-whisper `small` nesta CPU

Método: áudio de teste gerado com `espeak-ng -v pt-br` (voz sintética, o texto é um pedido de reel com "creat M T T" e "Grupo Super Kal"), convertido para AAC 32 kbps em .m4a, decodificado pelo mesmo caminho do motor (ffmpeg direto para float 16 kHz), `beam_size=1`, temperatura 0, sem VAD, modelo `small` int8 em cache. Cada tempo é a mediana de 3 rodadas, modelo já carregado.

| clipe | threads | palavras (timestamps) | tempo | velocidade |
|---|---|---|---|---|
| 8,6 s | 2 | não | 1,8 s | 4,7x |
| 22,7 s | 2 | não | 2,5 s | 9,1x |
| 22,7 s | 2 | sim | 2,9 s | 7,8x |
| 22,7 s | 4 | não | 3,2 s | 7,1x |
| 32,0 s | 2 | sim | 8,6 a 9,0 s (laço de repetição, ver abaixo) | 3,6x |
| 32,0 s | 2 | não | 3,8 a 4,4 s | 7 a 8x |

- **Custo fixo de ~1,5 s mesmo em áudio curto** (8,6 s levou 1,8 s); a explicação provável é que o Whisper trabalha em janelas de 30 s (inferência minha, não testada). Carregar o modelo na primeira vez: 1,5 a 1,7 s (medido).
- **Mais threads não ajudou** (4 threads ficaram mais lentas que 2 no clipe de 22,7 s). Pode ser ruído desta máquina; manter 2.
- **Estimativa para 30 s de fala do dono: ~3 a 4 s com a CPU ociosa**, sem palavras. Isso é bem melhor que os "~4-5x tempo real" de `ARQUITETURA.md:186` (que é para arquivo longo, com palavras e com a máquina dividida). **Sob render (3 workers de overlay, ffmpeg) o tempo não foi medido**; o worker roda com `nice 5` (`config.py:56`, `worker.py:133-137`), então um endpoint de voz no processo da API (sem `nice`) tende a ganhar a disputa. Não confirmado.
- **Laço de repetição:** em 3 de 8 configurações rodadas no clipe de 32 s apareceu o laço "o que é o que é o que é…" até o teto de tokens, que dobrou o tempo. `no_repeat_ngram_size=4` e `repetition_penalty=1.1` com ele não repetiram o laço nessas rodadas, mas o laço também é aleatório (uma rodada sem proteção também escapou), então **uma amostra não prova correção**. Dois cuidados baratos, a validar com fala real: (a) o endpoint de voz usa `palavras=False` (o motor já faz isso em `direcao.py:92`), e (b) rejeitar o resultado se uma mesma frase de 3 palavras se repetir mais de 3 vezes e tentar de novo com `no_repeat_ngram_size=4`.
- **Ressalva grande:** voz sintética não representa o Marcos falando num celular, na loja. Os tempos valem; a taxa de erro absoluta não. As trocas "Madacos" e "Supercow" abaixo mostram o tipo de erro, não a frequência.

### 3.3 Nomes próprios e marcas

Teste no mesmo clipe de 32 s, `small`, 2 threads, mesma frase falada:

- Sem dica: "Madocos da Creeace metete", "grupo Super Cow".
- Com `initial_prompt="Marcos, creat.MTT, Super Kal, Grupo Super Kal, Xande, Ruan, reel, take."`: "Marcos da creat.MTT", "Grupo Super Kal". O restante do texto não piorou e o tempo ficou igual (4,3 s).
- Leitura: nesta amostra (1 clipe sintético, 1 rodada) o `initial_prompt` consertou os nomes que o `small` errava. **Hipótese a confirmar com a voz real do Marcos:** no caminho de voz (só fala, curto, sem música) vale usar `initial_prompt` com o vocabulário do cliente (`loja.vocabulario()`, `etapas/direcao.py:123`, e `DICAS_CASA`, `etapas/analise.py:33`), sem tocar no caminho de análise de vídeo, onde dicas geraram laço.
- Camada que não depende do Whisper: o Claude que lê a transcrição já recebe o vocabulário do projeto; "Super Cow" vira "Super Kal" com facilidade quando o contexto diz que o cliente é o Super Kal. A direção já tem o campo `corrigir` para isso (`cerebro/prompts/diretor.md:13`).
- Literatura geral: `initial_prompt` só vale para a primeira janela e pode induzir alucinação em áudio difícil (relatos citados na busca; nada específico de pt-BR achado). Para áudio de comando com menos de 30 s, uma janela só, isso não pesa.
- OpenAI `gpt-transcribe` "supports unstructured context, keyword hints, and multiple language hints to improve transcription of domain terms" (https://developers.openai.com/api/docs/models/gpt-transcribe). Nome do parâmetro e limites: não confirmado.

### 3.4 Comparativo de custos (cenário: 30 comandos por dia, 15 s cada = 225 min/mês)

| opção | preço (fonte) | custo no cenário | latência | notas |
|---|---|---|---|---|
| faster-whisper `small` local | já instalado | US$ 0 | 2 a 4 s (medido, CPU ociosa) | disputa CPU com render; áudio não sai do servidor |
| Ditado do teclado do iPhone | grátis (https://support.apple.com/guide/iphone/dictate-text-iph2c0651d2/ios) | US$ 0 | ao vivo, enquanto fala | "processed on your iPhone in many languages, and no internet connection is required"; pt-BR consta em https://www.apple.com/ios/feature-availability/ ("Portuguese (Brazil)" em ditado no aparelho); para sozinho após 30 s de silêncio |
| Groq `whisper-large-v3-turbo` | US$ 0,04/hora, mínimo cobrado 10 s por pedido, fator 216x, 12% de erro na página (https://console.groq.com/docs/speech-to-text) | ~US$ 0,15/mês | não medido (a página dá só o fator de velocidade) | aceita m4a e webm; retenção de dados: não confirmado |
| OpenAI `gpt-4o-mini-transcribe` | US$ 0,003/min (https://developers.openai.com/api/docs/pricing) | ~US$ 0,68/mês | não confirmado | |
| OpenAI `gpt-transcribe` (novo) | US$ 0,0045/min | ~US$ 1,01/mês | não confirmado | dicas de palavras e contexto; guia de pt-BR da OpenAI o recomenda para fala gravada; sem WER de pt-BR achado |
| OpenAI `gpt-4o-transcribe` | US$ 0,006/min | ~US$ 1,35/mês | não confirmado | a página manda usar os novos em integração nova |
| ElevenLabs Scribe v2 (batch) | US$ 0,20/hora (https://elevenlabs.io/pricing/api); tempo real US$ 0,22/hora, ~150 ms | ~US$ 0,75/mês | não confirmado no batch | o motor já tem o provedor `scribe`; exige autorização (`transcricao_scribe.py:2`) |
| Deepgram Nova-3 pré-gravado, multilíngue | US$ 0,0052/min; US$ 200 de crédito grátis (https://deepgram.com/pricing) | ~US$ 1,17/mês | não confirmado | a página não cita português explicitamente |
| Parakeet TDT 0.6B v3 local | grátis, CC BY 4.0; 25 idiomas incluindo português; erro 4,76% (FLEURS) e 7,50% (MLS) em português (https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3) | US$ 0 | não medido aqui; `ARQUITETURA.md:14` fala em 15x tempo real | os dados de treino em português são de Portugal; pior que o Whisper em pt-BR informal no teste da casa |

Conclusão de custo: qualquer opção paga custa menos de US$ 1,50 por mês nesse uso. O motivo para pagar não é a conta; é erro de nome e CPU ocupada. Por isso o padrão é o local, e o pago só entra quando houver medida.

---

## 4. Resposta em voz do editor: vale a pena?

Resposta: **como opção, sim; como padrão, não.** Razões:

- O dono lê. A tela ao vivo da equipe e as perguntas do editor são para olhar, e o texto permite reler, copiar e tem pergunta com botão de resposta. Voz obriga a ouvir até o fim.
- Voz serve quando a mão ou o olho estão ocupados (na loja gravando, dirigindo). É um botão "ouvir", não uma conversa em voz alta.
- iOS exige gesto do usuário para tocar som: o WebKit explica que, no Safari do iPhone, mídia com som só toca se o `play()` vier de um toque (`touchend`, `click`, `keydown`) (https://webkit.org/blog/6784/new-video-policies-for-ios/, artigo sobre `<audio>/<video>`; para `speechSynthesis` e Web Audio: não confirmado). Resposta que chega depois de 20 s e fala sozinha pode ser barrada. Por isso o botão "ouvir" é o desenho certo: o toque libera o som.

Opções, com custo:

| opção | custo | qualidade | observação |
|---|---|---|---|
| `speechSynthesis` do iPhone (voz do sistema) | grátis, sem código no servidor | voz robótica a boa, depende das vozes pt-BR instaladas | no iOS "all voices return true for default" e vozes baixadas não aparecem na lista (https://readium.org/speech/docs/WebSpeech.html); esperar `voiceschanged` antes de listar (MDN). Funcionamento na PWA instalada: não confirmado |
| Kokoro-82M no motor (Apache-2.0) | grátis, CPU | vozes pt-BR `pf_dora`, `pm_alex`, `pm_santa` (https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) | tempo de geração e RAM na nossa CPU: não medido; mais um modelo para o motor carregar |
| Piper no motor | grátis, CPU | vozes pt_BR `cadu`, `edresson`, `faber`, `jeff` (https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR); pasta inteira 253 MB | licença de cada voz: não confirmado |
| ElevenLabs Flash/Turbo | US$ 0,04 por 1.000 caracteres; Multilingual v2 US$ 0,08 (https://elevenlabs.io/pricing/api) | a melhor entre as listadas (julgamento meu, não medido) | 30 respostas/dia x 300 caracteres = 270 mil caracteres/mês = **US$ 10,80/mês** (Flash/Turbo) ou US$ 21,60 (Multilingual v2). Paga: só com autorização do Marcos |
| OpenAI `gpt-4o-mini-tts` | US$ 0,60 por 1 milhão de tokens de texto + US$ 12,00 por 1 milhão de tokens de áudio de saída | não avaliada | preço por minuto não está na página: não confirmado |

Recomendação: texto sempre visível (a voz nunca substitui a legenda do que o editor disse) + botão "ouvir" com `speechSynthesis`; se o dono gostar e quiser voz de verdade, testar Kokoro local antes de pagar ElevenLabs.

---

## 5. Experiência de uso

### 5.1 Segurar para falar x tocar para gravar

- **Padrão: tocar para começar e tocar para parar**, com um contador visível e um botão grande. Razões (julgamento de projeto, a testar): o dono fala pedidos de 15 a 60 s, segurar o dedo esse tempo cansa e escorrega; segurar no iOS pode acionar seleção de texto ou menu de contexto do sistema; e tocar é mais fácil para quem tem pouca precisão motora.
- **Opcional:** segurar para falar com deslizar para travar, depois que o toque simples estiver bom. Para comandos curtos ("aprova", "mais rápido") o segurar é natural.
- Ao parar: mostrar de imediato "transcrevendo…" e o texto em 2 a 4 s.

### 5.2 Mostrar a transcrição antes de mandar ou mandar direto

- **Padrão: preencher o campo de mensagem com a transcrição, editável, com o botão Enviar já em foco.** Um toque extra evita refazer um filme: a promessa do produto é filme em até 30 minutos (`manifest.webmanifest:5`, `description`), e um nome de marca errado custa uma volta de montagem. O dono corrige no teclado, ou grava de novo.
- **Enviar direto** como chave de configuração, ligada só para comandos curtos de ação e quando a confiança for alta. O motor já calcula a confiança do segmento (`math.exp(avg_logprob)`, `transcricao_fw.py:114`). O limite (por exemplo 0,8) precisa ser calibrado com a fala real do dono: não confirmado.
- Segundo seguro, barato: o editor repete o que entendeu na primeira linha da resposta ("Entendi: reel de 30 s da oferta de carnes do Super Kal…"). Se a transcrição escorregou, o dono vê na hora. Isso casa com o modo de resposta pedido (o editor também pergunta de volta).
- Guardar, para cada mensagem de voz, o texto transcrito e o texto enviado (se o dono corrigiu). A diferença entre os dois é a taxa de erro real, que decide o passo seguinte (seção 7).

### 5.3 Ambiente barulhento (loja)

Nada disto foi testado com áudio de loja real; não havia amostra. Plano:

1. Falar perto da boca; tocar para gravar depois de escolher onde falar. Fone com microfone (AirPods, por exemplo): se o Safari usa o microfone do fone: não confirmado.
2. Pedir ao navegador `noiseSuppression`, `echoCancellation` e `autoGainControl` em `getUserMedia`, verificando antes com `navigator.mediaDevices.getSupportedConstraints()` (MDN). Se o iOS Safari honra cada um: não confirmado; testar no aparelho.
3. Usar a confiança como alarme: abaixo do limite, não enviar sozinho; destacar o texto em dúvida e perguntar "ouvi X, é isso?". É o mesmo mecanismo da conversa de volta.
4. O motor tem limpeza de voz (DeepFilterNet, `modelos.py:35`, "limpeza_voz"). Aplicar antes do Whisper acrescenta tempo e pode ajudar ou piorar: não medido; só vale testar se o passo 3 disparar muito.
5. Protocolo de teste (1 hora no aparelho do dono): 20 frases reais com nomes (Super Kal, creat.MTT, Xande, Ruan, produtos), 10 em silêncio e 10 na loja; comparar texto esperado com o transcrito de cada opção da tabela 3.4; contar nomes errados. Isso responde se vale pagar.

---

## 6. Acessibilidade e privacidade

### 6.1 Acessibilidade

- Botão de microfone grande (a diretriz da Apple fala em 44 x 44 pt; não verificada nesta pesquisa), com estado visível em texto, ícone e contador, não só cor: "gravando 0:12", "transcrevendo", "pronto".
- O resultado e os estados em uma região `aria-live="polite"` para leitor de tela.
- Tudo o que o editor disser em voz aparece também em texto; tudo o que se faz por voz se faz por texto. O ditado do teclado já cobre quem não puder gravar pelo app.
- Respeitar `prefers-reduced-motion` no desenho da onda sonora.

### 6.2 Privacidade e retenção do áudio

- **Hoje (se o pedido por áudio for ligado como está):** o áudio sobe pelo tus, é movido para `entrada/<projeto>/<nome>-<id>.<ext>` (`apps/web/lib/armazenamento.ts:38-42`; `app/api/envio/[[...tus]]/route.ts:45-50`) e o caminho é gravado no `pedido.json` (`direcao.py:111`). Fica no volume do motor, **fora do backup** (`backup.py:1-14`: "Vídeo e áudio ficam de fora"), e não achei rotina que apague. Uploads incompletos expiram em 7 dias (`route.ts:29`).
- **Proposta para voz:** endpoint próprio que recebe os bytes, transcreve e apaga o arquivo temporário no mesmo instante; guarda só o texto (e o texto corrigido). Gravar o áudio original só se o dono marcar "guardar áudio" naquele pedido. Motivo: o microfone numa loja capta clientes e funcionários, e o dono não tem razão para acumular isso.
- **Local:** o áudio não sai do servidor do dono.
- **OpenAI:** dados da API não treinam modelo por padrão; os logs de abuso são mantidos por até 30 dias; `/v1/audio/transcriptions` é elegível a Zero Data Retention, que exige aprovação prévia (https://developers.openai.com/api/docs/guides/your-data).
- **Groq, Deepgram, ElevenLabs:** retenção de áudio e treino: não confirmado (não abri as políticas).
- **Ditado do teclado:** processado no aparelho; em campo de busca o texto pode ir ao buscador (mesma página da Apple). O campo do editor não é de busca.

---

## 7. Recomendação

### 7.1 Caminho mais simples que já fica excelente

1. **Hoje:** garantir que o campo de mensagem aceite o ditado do teclado (`<textarea lang="pt-BR">`, sem bloquear o botão do microfone do teclado). Custo zero, sem código novo de voz.
2. **Botão de microfone do app:**
   - gravador no layout raiz, `isTypeSupported` na ordem webm/opus, mp4; `audioBitsPerSecond: 48000`; blocos de 1 s; teto de 90 s; Wake Lock se existir; ao ir para segundo plano, parar e mandar o que há;
   - tocar para gravar, tocar para parar; se `getUserMedia` falhar, mostrar a dica do ditado do teclado;
   - `POST` dos bytes para uma rota nova do proxy (a lista `PERMITIDAS` em `route.ts:10` não tem rota de voz; o limite de 1 MB já cobre ~90 s a 48 kbps);
   - no motor, rota que recebe os bytes, grava num temporário, chama o `FasterWhisper` com `palavras=False` e `initial_prompt` com o vocabulário do projeto, rejeita laço de repetição, devolve `{texto, confianca, segundos}` e apaga o temporário;
   - o processo da API carrega o próprio modelo (o cache `_MODELOS` é por processo, `transcricao_fw.py:19`); o modelo ocupa 464 MB em disco (medido); RAM no Railway: não medida.
3. **Mostrar a transcrição no campo, editável, Enviar em um toque**; opção "enviar direto" desligada no começo.
4. **Resposta em voz:** botão "ouvir" com `speechSynthesis`, texto sempre visível.

### 7.2 Passo seguinte (decidir com dados)

- Registrar por 1 a 2 semanas, para cada voz: texto transcrito, texto enviado, confiança, segundos de transcrição, se havia render rodando.
- **Gatilhos para pagar transcrição:** (a) o dono corrige o texto em mais de 1 de cada 4 mensagens; ou (b) a transcrição passa de 6 s durante render. Nesse caso propor ao Marcos, com a conta: Groq `whisper-large-v3-turbo` (~US$ 0,15/mês) ou OpenAI `gpt-transcribe` com dicas (~US$ 1,01/mês), e qual dado sai do servidor. Só contratar com autorização dele.
- **Voz do editor:** se o dono usar muito o "ouvir" e achar a voz do iPhone fraca, testar Kokoro no motor (grátis) antes de ElevenLabs (~US$ 10,80/mês).
- **Se o app instalado atrapalhar o microfone** (permissão a cada abertura, falha depois de reabrir): decidir entre aceitar o pedido de permissão, orientar a usar o Safari em aba, ou deixar o ditado do teclado como caminho principal. O bug 327237 do WebKit está sem responsável.

---

## 8. O que não deu para confirmar

- Comportamento do `MediaRecorder` de áudio com a tela bloqueada e com o app em segundo plano no iOS 26/27 (só há bug de 2020 e um post de fórum de 2025 sem resposta do WebKit).
- Se `getUserMedia` e `MediaRecorder` funcionam bem na PWA instalada do dono hoje; só há bugs abertos e relatos (bug 327237, fórum 797987).
- Limite de duração do `MediaRecorder` de áudio no Safari; se `audioBitsPerSecond` é respeitado; qual é o formato padrão sem `mimeType`.
- Se o iOS Safari honra `noiseSuppression`, `echoCancellation` e `autoGainControl` (a página da MDN não trouxe a tabela de compatibilidade).
- Se `speechSynthesis` toca na PWA instalada e fora de um toque do usuário; vozes pt-BR disponíveis no iPhone do dono.
- Taxa de erro real em pt-BR com a voz do Marcos, com ruído de loja e com marcas ("Super Kal", "creat.MTT"): o único áudio disponível foi sintético (espeak-ng). Os tempos valem; a taxa de erro não.
- Tempo de transcrição com render rodando e no hardware do Railway (medi nesta máquina, ociosa).
- Latência de ponta a ponta de Groq, OpenAI, Deepgram e Scribe batch (as páginas só dão preço e fator de velocidade); WER de pt-BR do `gpt-transcribe`; nome e limites do parâmetro de dicas da OpenAI.
- Retenção e treino de dados de Groq, Deepgram e ElevenLabs; preço por minuto do `gpt-4o-mini-tts`; licença das vozes do Piper; velocidade e RAM do Kokoro e do Piper na CPU do motor.
- Parakeet: não medi nesta máquina (o `15x tempo real` é da documentação da casa, `ARQUITETURA.md:14` e `transcricao_parakeet.py:1`).
- Preços do ElevenLabs foram lidos de uma página resumida por ferramenta, sem data na página (só "Promotion ends December 1"); conferir antes de qualquer contratação.

---

## 9. Fontes

Código lido (arquivo:linha): `services/motor/motor/provedores/transcricao_fw.py` (:4, :19, :68-73, :86-104, :114), `transcricao_parakeet.py` (:1-5), `transcricao_scribe.py` (:1-5), `config.py` (:44-56), `api/direcao.py` (:51, :73-75, :84-94, :97-125), `etapas/analise.py` (:33), `etapas/direcao.py` (:123), `modelos.py` (:35), `backup.py` (:1-14), `worker.py` (:133-137), `ARQUITETURA.md` (:14, :186), `apps/web/app/api/motor/[...rota]/route.ts` (:10, :32-35), `apps/web/app/api/envio/[[...tus]]/route.ts` (:29, :45-50), `apps/web/lib/armazenamento.ts` (:38-42), `apps/web/next.config.mjs` (:6), `apps/web/public/manifest.webmanifest` (:5, :8), `apps/web/app/layout.tsx` (:9), `apps/web/componentes/Envio.tsx` (:208).

Web (lidas em 25/11/2026):
- WebKit, MediaRecorder: https://webkit.org/blog/11353/mediarecorder-api/ e https://webkit.org/blog/16574/webkit-features-in-safari-18-4/
- Bugs WebKit: https://bugs.webkit.org/show_bug.cgi?id=299164 · 323550 · 293309 · 215884 · 327237 · 211829 · 225298
- Fóruns Apple: https://developer.apple.com/forums/thread/797987 · 748048 · 774239
- Política de mídia do iOS: https://webkit.org/blog/6784/new-video-policies-for-ios/
- Wake Lock: https://caniuse.com/wake-lock
- Ditado: https://support.apple.com/guide/iphone/dictate-text-iph2c0651d2/ios · https://www.apple.com/ios/feature-availability/
- Preços: https://developers.openai.com/api/docs/pricing · https://developers.openai.com/api/docs/models/gpt-transcribe · https://console.groq.com/docs/speech-to-text · https://deepgram.com/pricing · https://elevenlabs.io/pricing/api
- Retenção OpenAI: https://developers.openai.com/api/docs/guides/your-data
- Modelos: https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3 · https://huggingface.co/hexgrad/Kokoro-82M · https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR
- Síntese de voz no navegador: https://readium.org/speech/docs/WebSpeech.html
- Restrições de áudio: https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackSupportedConstraints/noiseSuppression

## 10. Apêndice: como medi

Scripts em `/tmp/claude-0/-home-user-creat-mtt-studio/405b04e4-0871-5a29-ac04-4d1e835b28f9/scratchpad/bench/` (`bench.py`, `bench2.py`, `bench3.py`), fora do projeto. faster-whisper 1.2.1, CTranslate2 4.9.0, modelo `Systran/faster-whisper-small` (já em cache), int8, `language="pt"`, `beam_size=1`, `temperature=[0.0]`, `vad_filter=False`, `condition_on_previous_text=False` (os mesmos parâmetros de `transcricao_fw.py:98-104`). Áudio: `espeak-ng -v pt-br -s 150`, depois AAC 32 kbps mono 16 kHz. Nenhum arquivo do projeto foi alterado, só este documento foi criado.
