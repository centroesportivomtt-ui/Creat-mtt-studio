
## T1 · Cirro · Arquitetura e contratos
- **O que fiz:** escrevi os contratos entre os módulos em 1 página com diagrama: placa, som, fragmento da prévia, dados com a regra das 48 h, CREAT_CHECKOUT, chaves de localStorage, PEDIDO v1, motor, sede e analytics. Registrei 3 ADRs (motor congelado, estado no fragmento, dado velho fail-closed) e criei 3 JSON Schemas estritos (draft 2020-12) com exemplos válidos e inválidos.
- **Arquivos:** `docs/ARQUITETURA.md`, `docs/ADR-001-motor-congelado.md`, `docs/ADR-002-estado-no-fragmento.md`, `docs/ADR-003-dados-velhos-fail-closed.md`, `schema/tenant.schema.json`, `schema/pedido.schema.json`, `schema/evento.schema.json`, `schema/exemplos/*` (com `validar.cjs`), `docs/relatorio/T1.md`.
- **Como verificar:** instale `ajv@8.20.0` e `ajv-formats@3.0.1` numa pasta fora do repositório e rode `AJV_DIR=<pasta> node schema/exemplos/validar.cjs`. Resultado esperado: 18 `ok`, saída 0. Os válidos passam; `ocupacaoFicticia`, WhatsApp 5500000000000, avaliação sem origem, CPF e propriedade pessoal em evento são rejeitados.
- **Pendências:** regras fora do schema vão para `validar-tenant.mjs` (T9). `before_send` do PostHog cortando o `#` é obrigatório (T5, risco 1). Quinto nicho da lista de espera sem nome (usei `outro`). Ajv entra no `package.json` do projeto (T5/T10). Detalhes em `docs/relatorio/T1.md`.

## T2 · Paleta · Direção de arte, tokens e desenhos
- **Feito:** ficha de direção "A Porta da Ilha" herdando a loja (Lilita One, Figtree, JetBrains Mono, céu, papel, nanquim, sol, sombra dura) + mundo da porta (madeira, correntinha, lousa e giz, vidro de noite); 9 paletas de nicho com contraste AA medido em claro e escuro (todas ≥ 4,5 em todos os pares); tokens e CSS da vitrine mobile-first; 9 SVGs (placa nas 3 faces, corrente, letreiro, 3 rituais) com ids por parte; imagens da loja copiadas + versões 640 px.
- **Arquivos:** `assets/tokens.css`, `assets/vitrine.css`, `assets/svg/*.svg` (9), `assets/img/*.webp` (7), `docs/DIRECAO.md`, `docs/relatorio/T2.md`.
- **Verificar:** `docs/DIRECAO.md` §8 (contraste) e §10 (pesos); página de teste no scratchpad rodada em `verificacao-visual` ("Tudo limpo") e a 390/1280 claro e escuro, sem rolagem lateral nem erro de console. Detalhes e prints em `docs/relatorio/T2.md`.
- **Pendente:** animação da placa (T6) e rituais (T8) usando os ids; marcação do hero pela T5 conforme DIRECAO §3; motor (T4) aplicar tema escuro pelo id da paleta. Revisor, QA e segurança no fim do fluxo.

## BLOQUEANTE PARA A T5 (Pixel) · PostHog `before_send`
Antes de ligar o PostHog na vitrine, configure um `before_send` que **corte o `#` de toda propriedade com URL** (`$current_url`, `$referrer`, `$initial_current_url`, `$initial_referrer` e qualquer `$*_url`) e **descarte toda propriedade que não esteja na lista** de `schema/evento.schema.json#/$defs/EventoAnalytics`. Use também `disable_capture_url_hashes:true`, `persistence:'memory'`, `autocapture:false`, `capture_pageview:false` e `disable_session_recording:true`. Sem isso, a URL `/previa/#k=...&n=<nome do negócio>&c=<cidade>` vai para um terceiro. A T5 só fica pronta quando a Muralha confirmar, na aba de rede, que nenhuma requisição ao PostHog carrega `#`, `n=` ou `c=`. Origem: risco 1 de `docs/ARQUITETURA.md` e ADR-002.

## T1 (ajustes do revisor) · Cirro
- **O que fiz:** reduzi `docs/ARQUITETURA.md` a uma página de verdade, com cerca de 510 palavras (assinaturas, regras e riscos), apontando para os schemas. O detalhe foi para o anexo `docs/CONTRATOS-DETALHE.md`. Troquei o `$id` dos schemas por `urn:creat-nuvem:schema:<nome>:v1`, que não é endereço resolvível, e os exemplos de prévia por `dominio-a-confirmar.invalid`. O `validar.cjs` agora explica como instalar o ajv quando ele falta. Registrei acima o bloqueante do PostHog para a T5.
- **Arquivos:** `docs/ARQUITETURA.md`, `docs/CONTRATOS-DETALHE.md` (novo), `docs/ADR-002-estado-no-fragmento.md` (referência), `schema/{tenant,pedido,evento}.schema.json` (`$id`), `schema/exemplos/validar.cjs`, `schema/exemplos/pedido.texto*.txt` (3), `docs/relatorio/T1.md`, `RELATORIO.md`.
- **Como verificar:** instale o ajv numa pasta fora do repositório (`npm install --save-exact ajv@8.20.0 ajv-formats@3.0.1`) e rode `AJV_DIR=<pasta> node schema/exemplos/validar.cjs`: 18 `ok`, código 0. Sem `AJV_DIR`: mensagem com os comandos de instalação, código 2. `wc -w docs/ARQUITETURA.md` dá cerca de 510. `grep -rn creatnuvem projetos/creat-nuvem/schema` não acha nada.
- **Pendente:** quando o domínio real for confirmado, trocar o host dos 3 fixtures `.txt`. O ajv entra no `package.json` do projeto pela T5/T10. Continuam valendo as pendências anteriores: T9 `validar-tenant.mjs` e o quinto nicho da lista de espera.

## T3 · Verbo · Conteúdo
- **O que fiz:** escrevi todos os textos públicos em `conteudo/`:
  - home com as seções 1 a 10, FAQ com 14 perguntas, `/abrir/`, `/obrigado/`, `/bastidores/`, 404, banner de consentimento, erros, estados vazios e lista de espera;
  - presets dos 3 nichos com paletas nomeadas;
  - termos e privacidade, os dois abrindo com `REVISAO_JURIDICA_PENDENTE`.
  
  Em `marketing/`, escrevi o kit de anúncios: 5 ângulos × 3 nichos, calibragem de 16 a 22/11 e o conjunto Click-to-WhatsApp de janeiro. Também 3 roteiros de 15 s, os scripts de WhatsApp (R1 a R14 e etiquetas) e a régua de UTM. Conferi os textos contra as políticas da Meta lidas em 08/11/2026; URLs e datas estão no topo de `anuncios.md`. Preço, prazo e vagas aparecem só por marcador `{{...}}`.
- **Arquivos:**
  - `conteudo/README.md` (chaves, marcadores e regras de exibição para o Pixel);
  - `conteudo/home.json`, `faq.json`, `abrir.json`, `obrigado.json`, `bastidores.json`, `comum.json`, `termos.md`, `privacidade.md`;
  - `conteudo/nichos/barbearia.json`, `salao.json`, `academia.json`;
  - `marketing/anuncios.md`, `roteiros-video.md`, `whatsapp-scripts.md`, `utm.md`;
  - `docs/relatorio/T3.md`.
- **Como verificar:** abra `docs/relatorio/T3.md`, seção "Como verificar". O script de conferência checa JSON, emoji, "agenda", preço sem marcador, limites do schema, tamanho de títulos e descrições de anúncio e linhas de WhatsApp. Para checar à mão: `head -1 conteudo/termos.md conteudo/privacidade.md` e `grep -rn "R\$ [0-9]" conteudo/` (deve voltar vazio).
- **Pendências:**
  - O Marcos precisa informar o CNPJ ou CPF e o endereço da Creat.MTT Studio para os termos, o domínio final (`{{site.url}}`) e quantos posts por mês o Vitrine entrega. As metas da calibragem ficaram "a definir pelo Marcos", porque a seção 18 não traz números.
  - A T5 precisa acrescentar `bastidores` em `precos.json` e liberar no `checar.cjs` as 2 strings com "agenda" que o briefing exige.
  - O ângulo E só sobe depois de alguém reabrir a fonte de 2024. O ângulo D só sobe com capacidade real em `vagas.json`.
  - Termos e privacidade aguardam revisão jurídica; a lista de pontos está no T3.md.
