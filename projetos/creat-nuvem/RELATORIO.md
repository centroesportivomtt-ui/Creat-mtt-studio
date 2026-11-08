
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

## T3 (ajustes do revisor) · Verbo
- **O que fiz:**
  - Tirei a Pigmentação do preset da barbearia. O vídeo R1 rola a tabela de serviços da prévia, e a Meta trata pigmentação como procedimento cosmético 18+. O preset ficou com 5 serviços. O roteiro R1 agora diz qual tabela gravar e proíbe gravar se a pigmentação voltar. Corrigi a frase do `docs/relatorio/T3.md` e a nota de política do `anuncios.md`.
  - R13 (indicação) não promete mais "próximo mês grátis". Nenhuma cláusula dos termos cobre indicação. O link sai sem `utm_content={id}` até a Muralha aprovar o uso do id do pedido no analytics. Ajustei `utm.md` para a mesma regra.
  - Ângulo B: o domínio não está incluído, então nenhum anúncio promete "domínio no seu nome" para todos. B2 (3 nichos) virou "Se tiver domínio próprio, ele fica no seu nome". O título "O domínio fica no seu nome" virou "Saiu? Leva o site e os arquivos" (31 caracteres). Mesmo ajuste no cartão 3 do vídeo R2 e no texto orgânico do R2.
- **Arquivos:** `conteudo/nichos/barbearia.json`, `marketing/anuncios.md`, `marketing/roteiros-video.md`, `marketing/whatsapp-scripts.md`, `marketing/utm.md`, `docs/relatorio/T3.md`, `RELATORIO.md`.
- **Como verificar:** `grep -rn -i pigment conteudo/nichos marketing` só acha as notas de regra. `grep -n "domínio no seu nome\|O domínio fica" marketing/anuncios.md marketing/roteiros-video.md` volta vazio. `grep -n "grátis\|utm_content" marketing/whatsapp-scripts.md` mostra que o R13 não tem recompensa nem `utm_content` no link. `python3 -c "import json;json.load(open('conteudo/nichos/barbearia.json'))"` passa.
- **Pendente:**
  - **Marcos:** decidir se existe recompensa por indicação. Se existir, definir quando vale, quem recebe e quantas vezes. Depois disso, a regra entra em `termos.md` e volta ao R13.
  - **Muralha:** aprovar ou recusar o id curto do pedido (`PA-` + 8 caracteres) no `utm_content` do R13.
  - Os exemplos de `schema/exemplos/*.json` ainda trazem `pigmentacao`. Não vão para anúncio; o Cirro decide se troca.
  - O `checar_t3.py` acusa `pagina.titulo` acima de 70 nos 3 presets (40 + 20 do nome). Não veio desta rodada; fica com a T4/T5 conferir o limite real no motor.

## BLOQUEIO DE PUBLICAÇÃO · calibragem de 16/11/2026
A calibragem de 16 a 22/11 **não sobe** enquanto faltar qualquer item abaixo. Não é bug de texto; é dado que falta.

| item | onde | dono | prazo |
|---|---|---|---|
| CNPJ ou CPF da Creat.MTT Studio (`{{empresa.documento}}`) | `conteudo/termos.md`, `conteudo/privacidade.md` | Marcos | 12/11/2026 |
| Endereço da Creat.MTT Studio (`{{empresa.endereco}}`) | `conteudo/termos.md` | Marcos | 12/11/2026 |
| Domínio final (`{{site.url}}`) | termos, privacidade, anúncios, scripts, UTM | Marcos | 12/11/2026 |
| Metas e regra de parada da calibragem | `marketing/anuncios.md`, seção da calibragem | Marcos | 13/11/2026 |
| Revisão jurídica de termos e privacidade (tirar `REVISAO_JURIDICA_PENDENTE`) | `conteudo/termos.md`, `conteudo/privacidade.md` | Marcos (advogado) | 14/11/2026 |
| Segunda leitura dos anúncios e roteiros | `marketing/` | Lupa | 14/11/2026 |
| Preço de bastidores em `precos.json` | `precos.json` | Pixel (T5) | antes do build |
| Liberar no `checar.cjs` as 2 strings com "agenda" que o briefing exige | `checar.cjs`, lista em `conteudo/README.md` | Pixel (T5) | antes do build |

Os prazos são sugestão do Verbo para caber antes de 16/11; o Nimbus confirma ou troca.

## T4 · Pixel · Motor v1 e prévia
- **O que fiz:** generalizei o Fio no Couro no motor v1 em script clássico, que lê `window.TENANT`.
  - Letreiro, fita de dias, horários, ritual da navalha, tema claro e escuro, som opcional.
  - Pedido de horário sem "ocupado" e sem promessa de confirmação. Na prévia vai para o WhatsApp de teste; no site entregue, para `wa.me/<negocio>`; com `link_externo`, vira o botão "Agendar".
  - JSON-LD, rodapé "Aberto pela Creat · veja o seu" com UTM, "Esquecer meus dados".
  - Registro de nichos tolerante, preset barbearia com 3 paletas AA e a prévia `/previa/#k&n&c&p` com noindex, noscript e carregamento desenhado.
- **Arquivos:** `motor/v1/{motor,agendamento,efeito,som}.js`, `motor/v1/styles.css`, `motor/v1/template.html`, `motor/nichos/index.js`, `motor/nichos/barbearia.js`, `previa/{index.html,previa.js,previa.css}`, `docs/relatorio/T4.md`.
- **Como verificar:**
  - Suba o servidor com `python3 -m http.server` na pasta do projeto e abra `/previa/#k=barbearia&n=Barbearia%20do%20Ze&c=Campinas&p=2`.
  - Peça um horário: o link do wa.me sai com serviço, dia e hora.
  - Rode `node .claude/skills/verificacao-visual/olhar.cjs "<url>"`: "Tudo limpo".
  - `grep -rn ocupacaoFicticia motor previa` volta vazio.
  - O contrato do `build-site.cjs` (T9) e da T8 está em `docs/relatorio/T4.md`.
- **Pendente:**
  - **T5:** iframe com `allow-popups`.
  - **T8:** salao.js e academia.js, mais o ritual de cada um; até lá, `k=salao` cai em barbearia com o aviso "Escolha o seu nicho".
  - Revisor, QA e Muralha.

## T5 · Pixel · Vitrine, checkout, dados e scripts
- **O que fiz:**
  - Home "A Porta" com as 10 seções da 5.1, integrada à placa real da T6 e à prévia da T4 por iframe.
  - `/abrir/` com plano trocável, TOTAL antes de pagar, 5 campos, aceite e Pix ou cartão pelo mesmo link.
  - `/obrigado/` sem afirmar pagamento, com o PEDIDO v1 completo e a origem utm, a sede com o letreiro e o relógio.
  - Bastidores com o aviso antes do preço; termos e privacidade com `REVISAO_JURIDICA_PENDENTE`; página 404.
  - `assets/vitrine.js` com leitura fail-closed, PostHog sem cookie e com `before_send`, e Pixel e Clarity só depois do aceite.
  - `checkout.config.js` com os 4 marcadores só nele; `dados/*.json`; os scripts `checar.cjs` (sem dependência, 18/18 fixtures), `checar-placeholders.cjs` e `atualizar-vagas.cjs`.
  
  Decidi adiar o banner de consentimento até o visitante passar do hero, para ele não cobrir o campo do nome. Detalhes em `docs/relatorio/T5.md`.
- **Arquivos:** `index.html`, `abrir/index.html`, `abrir/pedido.css`, `obrigado/index.html`, `bastidores/index.html`, `termos/index.html`, `privacidade/index.html`, `404.html`, `assets/vitrine.js`, `checkout.config.js`, `dados/{precos,vagas,depoimentos}.json`, `scripts/{checar,checar-placeholders,atualizar-vagas}.cjs`, `docs/relatorio/T5.md`.
- **Como verificar:**
  - `node scripts/checar.cjs` dá código 0.
  - `node scripts/checar-placeholders.cjs` dá código 1 enquanto houver marcador; numa cópia com os links trocados, dá 0.
  - Suba um servidor na raiz do repositório e abra `/projetos/creat-nuvem/?nicho=barbearia&utm_source=meta`. Prints em `.verificacao/t5-*`.
- **Pendente:**
  - `assets/som/creat-som.js` (T7) ainda dá 404; os sons ficaram não verificados.
  - Nichos salão e academia na prévia dependem da T8.
  - O gesto de arrastar a placa fica com a T6 e a Lupa.
  - A chamada real ao PostHog não foi verificada na rede: a chave é de exemplo e o CDN está bloqueado no sandbox.
  - T10: CSP com `style-src 'unsafe-inline'` (por causa dos SVGs embutidos), jsdelivr e PostHog liberados, Meta e Clarity só depois do aceite; `sede/` publicada em `/sede/`; site na raiz do domínio.
  - Marcos: trocar os 4 marcadores, pôr as chaves públicas de medição em `CREAT_MEDICAO` e rodar `atualizar-vagas.cjs --confirmar` todo dia, de preferência numa tarefa agendada; sem isso, depois de 48 h a página cai no preço padrão.
