# Porta Aberta · Fase 1 "A Porta que vende" · RELATORIO

Projeto `projetos/creat-nuvem/` · Creat Nuvem para Creat.MTT Studio (Marcos) · 08/11/2026 · briefing: `docs/briefing-porta-aberta-fase1.md` (raiz do repositório).
Entrega: vitrine com a placa que vira ABERTO, prévia gerada no navegador, motor com 3 nichos (barbearia, salão, academia), checkout com placeholders marcados, sede com a marca do cliente, kit de anúncios, scripts de WhatsApp e CLI de produção v0.

Como ler este arquivo: (1) este cabeçalho e "Como rodar"; (2) o **diário**, logo abaixo, com a seção curta que cada agente escreveu ao terminar (inclui ajustes do revisor); (3) a **Consolidação T1 a T10**, no fim, com o fragmento completo de cada tarefa (`docs/relatorio/T*.md`) e as seções finais: placeholders abertos, revisão jurídica, números não verificados, o que depende do Marcos e desvios do briefing.

## Como rodar (Node 22, a partir de `projetos/creat-nuvem/`)

```
npm ci                                   # versões fixadas no package-lock.json
node scripts/checar.cjs                  # aceite 1: schemas, presets, dados, sem emoji, sem "agenda"
npm test                                 # produção v0 com fixture, sem rede e sem chave
node scripts/checar-placeholders.cjs     # aceite 14: FALHA (código 1) enquanto houver marcador
node scripts/montar-publico.cjs          # dist/publico/: só o que é público + sede/index.html
python3 -m http.server 8080 -d dist/publico                 # servir sem cabeçalhos
npx --yes wrangler@4.158.0 dev                              # servir com _headers (o [build] exige os marcadores trocados)
node ../../.claude/skills/verificacao-visual/olhar.cjs http://127.0.0.1:8080/
```

Publicar (só com o ok do Marcos): `CLOUDFLARE_API_TOKEN=<token> npx --yes wrangler@4.158.0 deploy`. O `[build]` do `wrangler.toml` roda `checar-placeholders.cjs` e trava enquanto faltar link. Produção de pedido: `cp .env.example .env`, preencher `ANTHROPIC_API_KEY` (Console) e `CREAT_CAMBIO`, e rodar `node --env-file=.env scripts/producao/produzir.mjs --pedido <arquivo>`.

---

# Diário das tarefas (seções escritas por cada agente)

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

## T7 · Eco · Som da vitrine
- **O que fiz:** `window.CreatSom` 100% sintetizado em Web Audio, sem arquivos de áudio nem dependências.
  - Sininho de porta com parciais inarmônicos, badalo que quica e reverb gerado em código. Giz por letra, com limite de 60 ms. Plim de notificação. Clique.
  - Nada toca antes do gesto. O mudo fica em `localStorage['creat:som']` e avisa a página pelo evento `creat:som`.
  - Ganho mestre de 0,22 com limitador. Silêncio com a aba oculta e com `prefers-reduced-motion`. Sem Web Audio, tudo vira no-op.
- **Arquivos:** `assets/som/creat-som.js`, `docs/relatorio/T7.md`.
- **Como verificar:** abra a home, escolha o nicho, digite o nome e toque em "Abrir meu negócio". O sino toca junto com a virada da placa.
  - No console, `CreatSom.estado` mostra `contexto: "nenhum"` antes do primeiro toque.
  - O botão de som persiste após recarregar.
  - A tabela de casos testados está em `docs/relatorio/T7.md`.
- **Pendente:**
  - Ouvir em celular real (o sandbox não tem saída de áudio).
  - `plim` no fluxo "Teste de verdade" (T5).
  - No celular, o banner de consentimento cobriu o botão "Abrir meu negócio" no teste (T5 e Lupa).
  - Revisor, QA e Muralha.

## T6 · Órbita · Placa e sede com a marca do cliente
- **O que fiz:** placa interativa (`CreatPlaca`, contrato T1) com os SVGs da T2: arrastar mais de 40% (Pointer Events, `touch-action:none` só na placa), toque, Enter ou Espaço, ou `CreatPlaca.abrir('botao')` giram com mola em 600 ms (antecipação, compressão 4%, esticada 3%, verso com a nuvem queimada) até ABERTO com o nome em giz. Depois tocam sino, vibração e `onAberto`. Giz letra a letra na borda e balanço de 2°. Com reduced-motion: crossfade sem giro e sem som. Na sede: `?marca=` (fillText, até 28 caracteres, marcação ignorada), `?modo=demo|publico|local` (publico lê só `estado-publico.json`; demo tem a legenda "Demonstração" fixa e não faz requisição) e `?lite=1`. Também criei `sede/publicar-estado.cjs`, que traduz o estado interno para um vocabulário fechado, com conferência e `--autoteste`.
- **Arquivos:** `ritual/placa.js`, `ritual/placa.css`, `../../sede/index.html`, `../../sede/publicar-estado.cjs`, `../../sede/estado-publico.exemplo.json`, `docs/relatorio/T6.md`.
- **Como verificar:** `node sede/publicar-estado.cjs --autoteste` (código 0). `node sede/servidor.cjs` e abra `/?marca=Barbearia%20do%20Ze&modo=demo`, `/?modo=publico` e `/` (local). Tabela de resultados do Playwright (toque em 390 px, reduced-motion, XSS, rede) em `docs/relatorio/T6.md`.
- **Decisão registrada:** sem `?modo`, a sede fica em `local` em localhost, arquivo e artefato do Claude (preserva o ao vivo de hoje) e em `publico` em qualquer outro host (T1).
- **Pendente:** T5 deve chamar `placa.definirNome(...)` depois de `placa.reiniciar()` em `aoAbrirPlaca`; sem isso, o giz some quando falta escolher o nicho. T7: `creat-som.js` ainda não existe (404 na home). T10: `.gitignore` para `sede/estado-publico.json` e não publicar `sede/estado.json`. Revisor, QA e Muralha.

## T5 · Pixel · Ajustes do revisor (08/11/2026)
- **O que fiz:**
  - Renomeei o evento `pago_pagina` para `pedido_enviado_pagina`. No `schema/evento.schema.json` (`$comment`) ficou documentado que ele é um indicador aproximado: o pedido é gravado ao clicar em Pagar, antes do Pix, então não é pagamento confirmado. Não use esse número como compra para otimizar anúncio.
  - Tirei o disparo do ramo sem pedido, que contava como compra do plano Vitrine quem abria `/obrigado/` sem ter pago. Agora o evento só sai com pedido real e no máximo 1 vez por carga (flag `pedidoContado`).
  - Refiz a verificação com `assets/som/creat-som.js` presente e corrigi o relatório da T5, que ainda dizia que o arquivo dava 404.
- **Arquivos:** `assets/vitrine.js`, `schema/evento.schema.json`, `docs/CONTRATOS-DETALHE.md`, `docs/relatorio/T5.md`, `RELATORIO.md`.
- **Como verificar:**
  - `node scripts/checar.cjs` dá código 0.
  - `verificacao-visual` em `/`, `/abrir/` e `/obrigado/` (servidor na pasta do projeto) dá "Tudo limpo" nas 4 configurações. Prints em `.verificacao/t5b-*`.
  - Em `/obrigado/`, `window.__creatEventos` mostra:
    - sem pedido: 0 eventos;
    - depois de enviar o formulário 2 vezes: 1 `pedido_enviado_pagina`;
    - ao recarregar: 1.
  - Som: o botão alterna `aria-pressed` e o texto. Trocar de nicho toca `clique`, e o Teste de verdade toca `plim`. Em mudo, nada toca.
- **Pendente:**
  - Até 08/11/2026 continuam sem teste o aceite 4 da T6 (arrastar a placa) e a chamada real ao PostHog na rede. Os dois precisam da verificação da Lupa (qa) antes de publicar.
  - Ponto fora do escopo: em `/obrigado/` sem número de suporte configurado, a frase "O WhatsApp abre com o pedido escrito" fica acima da caixa que manda enviar por e-mail. Vale o Verbo ajustar esse texto no modo e-mail.
  - `checar-placeholders.cjs` segue em código 1 até o Marcos trocar os marcadores (esperado).

## T6 · Órbita · Ajustes do revisor (08/11/2026)
- **O que fiz:**
  - **Placa (T5, uma linha):** em `aoAbrirPlaca`, quando a validação falha, a vitrine agora chama `placa.reiniciar(); placa.definirNome(limparNome(campoNome.value))`. Assim o nome escrito em giz continua na placa quando falta escolher o nicho.
  - **Prazo de validade do estado público:** na sede, `dePublico` trata como vencido o estado com mais de 10 min (ou mais de 2 min no futuro). Nesse caso a sede some com o selo "Ao vivo" do painel e do botão, mostra "equipe em pausa" e a frase "A equipe espera o próximo pedido.". O último JSON recebido é reavaliado a cada 15 s, então o estado vence mesmo se ninguém publicar de novo ou se a rede cair.
  - **`.gitignore`:** incluí `sede/estado-publico.json`, além de `sede/estado.json`.
  - **`publicar-estado.cjs`:** o cabeçalho agora documenta três regras: o padrão de nome do fluxo, o prazo de validade e o que pode ir para o deploy.
- **Decisão registrada:** quando a URL não traz `?modo`, a sede escolhe o modo pelo host. Em `localhost`, arquivo e artefato do Claude ela fica em `local`; em qualquer outro host fica em `publico`. Motivo: no site público, um link sem parâmetro nunca deve ler `estado.json` (o estado interno, com rótulos e nomes de fluxo). Por padrão ele lê só o vocabulário fechado. Quem opera a sede na máquina continua vendo o ao vivo completo.
- **Arquivos:** `assets/vitrine.js`, `../../sede/index.html`, `../../sede/publicar-estado.cjs`, `../../.gitignore`, `docs/relatorio/T6.md`, `RELATORIO.md`.
- **Como verificar:**
  - `node sede/publicar-estado.cjs --autoteste` → 20 verificações ok, código 0.
  - **Estado novo:** grave `sede/estado-publico.json` com a hora atual, rode `node sede/servidor.cjs 8123` e abra `/?modo=publico`. Aparecem o selo "Ao vivo", "3 trabalhando agora" e o selo no botão.
  - **Estado vencido:** com o mesmo arquivo 3 h mais velho, aparecem "A equipe espera o próximo pedido." e "equipe em pausa", sem selo.
  - **Vencimento na mesma sessão:** adiante o relógio da página em 11 min. No ciclo seguinte de 15 s a sede passa sozinha de ao vivo para pausa.
  - Testei os três casos no navegador da casa, com console limpo (print em `.verificacao/print-3.png`).
  - **Home:** escreva o nome e chame `CreatPlaca.abrir('toque')` sem nicho. O giz mantém "Barbearia do Ze". `CreatSom` carrega e não há mais 404.
- **Pendente:**
  - **Publicação recorrente do estado (T10, Trilho):** nada roda `publicar-estado.cjs` sozinho. Não há cron, loop nem CI no repositório. Para "a venda rodar sem o dono", o script precisa rodar a cada 1 ou 2 min, dentro do prazo de 10 min, onde a agência roda, e enviar **só** `sede/estado-publico.json` ao host. Sem isso, o site público mostra sempre "A equipe espera o próximo pedido.", o que é honesto, mas não prova nada.
  - **Deploy (T10):** o repositório ainda não tem configuração de deploy. A T10 precisa garantir que `sede/estado.json` nunca vá para o site: copiar `sede/` excluindo esse arquivo ou bloquear a rota.
  - **Nome dos fluxos:** fluxos de cliente precisam ter nome começando por `pedido` ou `producao` (ex.: `pedido-barbearia-ze`) para aparecer como "Pedido da Creat". Hoje o fluxo real `agencia` sempre sai como "Projeto interno". Quem cria os fluxos de produção (Nimbus/Trilho) deve seguir esse padrão.
  - Revisor, QA (Lupa) e Muralha.

## T8 · Pixel · Nichos salão e academia (08/11/2026)
- **O que foi feito:** presets `salao` (ritual `esmalte`: tirar o pincel do vidrinho e pintar a unha com o dedo) e `academia` (ritual `barra`: levantar a barra que pesa, enverga e solta pó), com textos da T3, 3 paletas AA da T2, preços "exemplo" no salão e "sob consulta" na academia, sem equipe, avaliação ou horário inventado. Os rituais ficam em `motor/v1/rituais/` e têm teclado, toque, tira de confirmar e `prefers-reduced-motion`. Os dois nichos foram registrados no `index.js`. `dados/nichos.json` traz 3 ativos e 4 "avise-me", sem clínica.
- **Arquivos tocados:**
  - `motor/nichos/{salao,academia,index}.js`
  - `motor/v1/rituais/{comum,esmalte,barra}.js` e `rituais.css`
  - `dados/nichos.json`
  - `docs/relatorio/T8.md`
  - gancho aditivo de 10 linhas em `motor/v1/motor.js` (`comRitual` no `preencherTemplate`, para o site entregue carregar o ritual)
- **Como verificar:**
  - `node scripts/checar.cjs` (tudo certo);
  - `previa/#k=salao&n=...` e `#k=academia&n=...` a 390 e 1280, claro e escuro;
  - `build-site.cjs` com tenant de salão ou academia abre por `file://`.
  - Detalhes em `docs/relatorio/T8.md`.
- **Pendente:**
  - Revisor, QA (gesto em celular real) e Muralha;
  - a home (T5) ainda não lê `dados/nichos.json`.

## T9 · Forja · Produção v0 (CLI, validador, build e SAIR)
- **O que fiz:** `scripts/producao/produzir.mjs --pedido <arquivo>` aceita PEDIDO v1 em texto ou em JSON e roda os 7 passos da seção 15:
  1. valida o pedido e monta o tenant parcial a partir do preset de `motor/nichos/`;
  2. faz UMA chamada ao Claude, pelo SDK oficial, com `ANTHROPIC_API_KEY` do Console e `claude-sonnet-5-5` como padrão. A saída é estruturada, não há ferramentas e o pedido entra como dado delimitado e mínimo;
  3. valida de novo;
  4. build do `dist/<slug>/`;
  5. teste no Playwright a 390 px;
  6. grava `custo.json` em R$ e o RELATORIO do pedido;
  7. gera o zip do SAIR com varredura de domínio.
  - É idempotente: rodar de novo o mesmo pedido não cobra outra vez.
  - Junto foram `validar-tenant.mjs`, `build-site.cjs`, `testar-site.cjs` e `exportar-sair.cjs`, além de 38 testes sem rede e sem chave.
- **Decisões:**
  - No SAIR, o rodapé "Aberto pela Creat" é **removido**, não vira texto.
  - O pedido não traz preço, então no site entregue todo preço sai "sob consulta". A nota de preço é escrita pelo código, fora da IA.
  - Sem `CREAT_CAMBIO`, o fluxo para antes de cobrar.
  - As fontes do Google ficam no SAIR. São de terceiro e o site funciona offline sem elas.
- **Arquivos:** `scripts/producao/**`, `scripts/testes/**`, `package.json` e `docs/relatorio/T9.md`.
- **Como verificar:**
  - `cd projetos/creat-nuvem && npm install && npm test`: 38 de 38 passam.
  - Ponta a ponta com a fixture: `CREAT_CAMBIO=5.5 node scripts/producao/produzir.mjs --pedido scripts/testes/fixtures/pedido-valido.txt --fixture-ia scripts/testes/fixtures/resposta-modelo.json --saida <tmp>`.
  - `node scripts/producao/validar-tenant.mjs schema/exemplos/tenant.whatsapp-zerado.invalido.json` sai com código 1 e cita `negocio.whatsapp`.
  - A saída completa está em `docs/relatorio/T9.md`.
- **Variáveis usadas (para o `.env.example` da T10):** `ANTHROPIC_API_KEY`, `CREAT_MODELO`, `CREAT_CAMBIO`, `CREAT_HOME`, `CREAT_URL_SITES`, `CREAT_DOMINIOS`, `CREAT_SAIDA`, `CREAT_FALLBACK` e `CREAT_IA_FIXTURE` (só teste).
- **Pendente:**
  - Primeira chamada real à API: não há chave no ambiente. O formato da requisição foi provado contra um servidor local.
  - Definir `CREAT_URL_SITES` e `CREAT_DOMINIOS`.
  - T10: `.gitignore` de `sites/`, `pedidos/` e `dist/`, `.env.example` e lockfile.
  - T4: o comentário do `template.html` é preenchido junto com os marcadores (o build já o remove).
  - Revisor, QA e Muralha.

## T9 · Forja · ajustes do revisor (rodada 2)
- **O que fiz:**
  - **Custo de chamada paga que falha:** agora fica gravado. A resposta bruta vai para `sites/<slug>/resposta-ia.json` e o custo vai para `custo.json` antes de a resposta ser interpretada. O `custo.json` guarda o histórico `chamadas[]` e o `total`.
  - **`IA.custo()` não lança mais exceção.** Com modelo fora de `PRECOS`, devolve `custo_ia: null`, os tokens e um aviso.
  - **Falha de leitura** (refusal, max_tokens ou JSON inválido): grava `producao.json` com `ia_falhou`. A rodada seguinte só chama a IA de novo com `--refazer-textos`; a outra saída é `--sem-ia`.
  - **`.gitignore` do projeto:** cobre `sites/`, `pedidos/`, `dist/*` (com exceção de `dist/publico/`) e `.env*`. Assim, a PII do pedido não vai para o git.
  - **Lockfile:** confirmei que já está versionado.
  - **T9.md:** marquei o custo real e a qualidade dos textos como **não verificado**. O R$ 0,1028 é o número da fixture, não o custo de produção.
- **Arquivos:**
  - `scripts/producao/produzir.mjs`;
  - `scripts/producao/lib/ia.cjs`;
  - `scripts/testes/producao.test.mjs`;
  - `scripts/testes/fixtures/resposta-modelo-{max-tokens,desconhecido,json-invalido}.json`;
  - `.gitignore` (novo);
  - `docs/relatorio/T9.md`.
- **Como verificar:**
  - `cd projetos/creat-nuvem && npm test`: 41 de 41 passam.
  - `git check-ignore -v sites/x/pedido.json pedidos/a.txt dist/x-sair.zip` mostra a regra do `.gitignore`.
- **Pendente:**
  - Primeira chamada real, para confirmar o custo e `PRECOS` contra a fatura do Console e conferir a qualidade dos textos.
  - O Trilho decide se `dist/publico/` continua versionado.
  - Revisor, QA e Muralha. **A T9 não está pronta até `qa` e `seguranca` passarem.**

---

# Consolidação T1 a T10 (Trilho, T10, 08/11/2026)

Cópia integral de cada fragmento `docs/relatorio/T<n>.md`, com o autor. Só os títulos desceram dois níveis para caber neste arquivo. Em conflito entre o diário acima e o fragmento, vale o mais recente (os ajustes do revisor estão no diário).

## T1 · autor: Cirro (arquiteto) · fonte: `docs/relatorio/T1.md`

### T1 · Cirro · Arquitetura, ADRs e schemas de contrato

Pergunta de venda: os contratos deixam a venda rodar sem o dono (prévia, checkout e PEDIDO v1 sem servidor e sem o Marcos digitando nada) e a Fase 2 grava os mesmos objetos (TenantConfig v1, Pedido, EventoPedido) sem conversão.

#### O que foi feito
- `docs/ARQUITETURA.md` (página única) e `docs/CONTRATOS-DETALHE.md` (anexo com limites, listas e tabelas): diagrama em texto e contratos (a) a (j): CreatPlaca, CreatSom, fragmento, leitura de dados, CREAT_CHECKOUT, chaves de localStorage, PEDIDO v1, motor, sede, analytics. Mais os 6 riscos, do mais grave ao menos grave.
- `docs/ADR-001-motor-congelado.md`, `docs/ADR-002-estado-no-fragmento.md`, `docs/ADR-003-dados-velhos-fail-closed.md`.
- `schema/tenant.schema.json`, `schema/pedido.schema.json` (PedidoEntrada e Pedido), `schema/evento.schema.json` (EventoAnalytics e EventoPedido): JSON Schema draft 2020-12 com `additionalProperties: false` em todo objeto tipado.
- `schema/exemplos/`: 6 válidos, 12 inválidos e `validar.cjs`, que prova o resultado esperado de cada um.

#### Decisões que tomei dentro do briefing
- A placa ganhou `definirNome(nome)`, `abrir(via)` e o callback `onSemNome`, além de `montar` e `reiniciar`: sem eles a vitrine não liga o campo nem o botão "Abrir meu negócio". O som ganhou `clique()`, que a T7 pede.
- `?modo` ausente na sede = `local` em localhost/file e `publico` em qualquer outro host. Assim o modo ao vivo do Marcos continua igual, e uma sede publicada nunca busca `estado.json`.
- O plano anual é valor do campo `plano` (`aberto_anual`, `vitrine_anual`); não criei campo novo.
- A prévia é validada pelo próprio schema: `meta.previa: true` proíbe avaliação, equipe e `negocio.whatsapp`; `meta.previa: false` exige WhatsApp, telefone e endereço completo.
- O rodapé "Aberto pela Creat" não é campo do tenant (a seção 7.1 do briefing não o lista). Ele se desliga pela flag `--sem-rodape` do build, registrada no relatório do pedido.
- PostHog: conferi no pacote `posthog-js@1.447.3` (npm, 08/11/2026) que `before_send` e `disable_capture_url_hashes` existem e que `sanitize_properties` está obsoleto. Não consegui abrir posthog.com (domínio bloqueado nesta sessão), então tirei isso do código do pacote.

#### Como verificar
Instale o ajv antes (qualquer pasta fora do repositório; `/tmp/ajv` era só a pasta desta sessão e não existe em outra):
```
mkdir -p <pasta> && cd <pasta> && npm init -y >/dev/null && npm install --save-exact ajv@8.20.0 ajv-formats@3.0.1
cd projetos/creat-nuvem && AJV_DIR=<pasta> node schema/exemplos/validar.cjs
```
Sem `AJV_DIR`, ou com uma pasta sem ajv, o `validar.cjs` não quebra com stack trace: mostra estes dois comandos e sai com código 2.
Saída obtida em 08/11/2026: 18 linhas `ok` e "todos os exemplos com o resultado esperado" (código de saída 0). Destaques:
- `tenant.ocupacao-ficticia.invalido.json` foi rejeitado por chave extra (`demo`).
- `tenant.whatsapp-zerado.invalido.json` e `pedido.texto-whatsapp-zerado.invalido.txt` foram rejeitados pelo número 5500000000000.
- `tenant.avaliacao-sem-origem` e `tenant.previa-com-avaliacao` foram rejeitados.
- `pedido.registro-com-cpf` e `pedido.texto-linha-extra` foram rejeitados por chave extra.
- `evento.analytics-com-negocio` e `-com-whatsapp` foram rejeitados por propriedade extra.

Conferi também que 2000 tokens aleatórios de 128 bits em base64url casam com o padrão de `token_publico`, e que todo objeto tipado dos 3 schemas tem `additionalProperties: false`.

#### Padrão de entrega
- Schemas validam os fixtures: ok (comando acima).
- Contratos em 1 página: ok. `docs/ARQUITETURA.md` tem cerca de 510 palavras (assinaturas, regras e riscos) e cabe numa A4 em fonte normal. Limites, listas e tabelas foram para o anexo `docs/CONTRATOS-DETALHE.md`, e a página aponta para os schemas.
- Motor congelado documentado: ok (ADR-001).
- Dependências com versão fixada: ok (ajv 8.20.0 e ajv-formats 3.0.1, instalados fora do repositório; o projeto não ganhou `package.json`).
- Interface, navegador e prints: não se aplica (T1 não tem tela).
- Revisor e segurança: não verificados (rodam depois da onda de construção).

#### Pendências
- T9: `validar-tenant.mjs` precisa cobrir o que o schema não expressa (fecha > abre, termos proibidos, chave de `textos` fora de `textosPermitidos` do preset, frase "o dono confirma pelo WhatsApp"). Pode reaproveitar `lerPedidoTexto` de `validar.cjs`.
- T5: `checar.cjs` deve rodar este validador; a pasta `node_modules` e o `package.json` com ajv fixado ficam a cargo de T5/T10.
- T5: o `before_send` do PostHog é obrigatório (risco 1); Muralha confere na aba de rede.
- O briefing fala em "outros 5 nichos" na lista de espera, mas cita só 4 (pet, restaurante, oficina, tatuagem). Usei `outro` como quinto valor; a T3 ou o Marcos podem nomeá-lo.
- O `$id` dos schemas é `urn:creat-nuvem:schema:<nome>:v1`, que não é um endereço resolvível. Os exemplos de prévia usam `dominio-a-confirmar.invalid` (TLD reservado). Quando o domínio real for confirmado, troque só os exemplos; o `$id` pode ficar como está.

#### Ajustes pedidos pelo revisor (08/11/2026)
- `ARQUITETURA.md` caiu de cerca de 1.300 para cerca de 510 palavras. O texto anterior virou `CONTRATOS-DETALHE.md`, com um cabeçalho dizendo que, em conflito, o schema vence. `ADR-002` agora aponta os limites para o anexo.
- `$id`: troquei `https://creatnuvem.com.br/schema/<n>.schema.json` por `urn:creat-nuvem:schema:<n>:v1`. O `validar.cjs` lê o `$id` do schema compilado e não o repete mais à mão. Os 3 fixtures `.txt` usam `https://dominio-a-confirmar.invalid/previa/...`.
- `validar.cjs`: mensagem clara e código 2 quando falta o ajv. Rodei de novo com ajv@8.20.0 e ajv-formats@3.0.1 instalados no scratchpad: 18 `ok`, código 0. Sem ajv: mensagem e código 2.
- `before_send` do PostHog: registrado como bloqueante da T5 no `RELATORIO.md` do projeto.

## T2 · autor: Paleta (designer) · fonte: `docs/relatorio/T2.md`

### T2 · Paleta · Direção de arte, tokens e desenhos

Data: 08/11/2026. Como isto vende: a placa que vira ABERTO com o nome do visitante em giz é o gesto que faz o dono querer ver o próprio site; os tokens garantem que vitrine, prévia e sites entregues falem a mesma língua visual da sede.

#### O que foi feito
- `docs/DIRECAO.md`: ficha (conceito "A Porta da Ilha", momento-assinatura, layout, ousadia única), mundo da porta, tipografia e escala, grid, componentes, desenhos com ids, movimento e reduced-motion, tema escuro "vidro de noite", contraste medido (vitrine e 9 paletas, claro e escuro), clichês proibidos, pesos das imagens e orçamento.
- `assets/tokens.css`: cores da loja + madeira, corrente, lousa, giz, vidro; tipografia; escala; espaçamento; raios; sombras duras; alvos; durações e curvas; camadas; tema escuro por `prefers-color-scheme` e `data-tema`; 9 paletas `--p-<nicho>-<n>-<papel>` e `--p-<nicho>-<n>-escuro-<papel>`; atalho `data-paleta` → `--n-*`; zeragem de movimento em `prefers-reduced-motion`.
- `assets/vitrine.css`: base mobile-first e todos os componentes pedidos (barra, hero com palco reservado da placa, campo de 56 px com label, chips de 44 px com radio nativo, prévia com barra inferior fixa, teste de verdade, passos, preços com botão desativado "em configuração", sede em vidro de noite, prova, FAQ, chamada final, rodapé, WhatsApp flutuante, consentimento com aceitar e recusar iguais, carregamento desenhado, aviso).
- `assets/svg/`: placa.svg, corrente.svg, placa-fechado.svg, placa-aberto.svg, placa-verso.svg, letreiro.svg, ritual-barbearia.svg, ritual-salao.svg, ritual-academia.svg. Sem script, com title/desc e ids por parte.
- `assets/img/`: 4 .webp copiados da loja + 3 versões 640 px (35 a 40 KB cada).

#### Como verificar
1. `grep -c "\-\-p-" projetos/creat-nuvem/assets/tokens.css` (108 definições de paleta + mapeamentos).
2. `grep -l "<script" projetos/creat-nuvem/assets/svg/*.svg` não deve listar nada.
3. Contraste: tabelas em `docs/DIRECAO.md` §8 (todas passam AA texto normal; menor razão 4,76 em academia-3 claro, destaque sobre fundo).
4. Página de teste descartável: `/tmp/claude-0/-home-user/481145aa-44c7-587c-be27-bbadde2428c0/scratchpad/t2/teste/index.html` (montada por `/tmp/claude-0/-home-user/481145aa-44c7-587c-be27-bbadde2428c0/scratchpad/t2/monta-teste.cjs`); `node .claude/skills/verificacao-visual/olhar.cjs /tmp/claude-0/-home-user/481145aa-44c7-587c-be27-bbadde2428c0/scratchpad/t2/teste`.

#### Prints olhados
- verificacao-visual (390 x 844 e 1440 x 900, claro e escuro): `/tmp/claude-0/-home-user/481145aa-44c7-587c-be27-bbadde2428c0/scratchpad/t2/prints/celular-claro.png`, `celular-escuro.png`, `desktop-claro.png`, `desktop-escuro.png`. Resultado: "Tudo limpo".
- Página inteira, script próprio a 390 e 1280: `/tmp/claude-0/-home-user/481145aa-44c7-587c-be27-bbadde2428c0/scratchpad/t2/prints/390-claro.png`, `390-escuro.png`, `1280-claro.png`, `1280-escuro.png` (e recortes `f-*.png`). scrollWidth = largura da janela, 0 erros de console, nenhum texto < 11 px.
- Ícones claro e escuro: `/tmp/claude-0/-home-user/481145aa-44c7-587c-be27-bbadde2428c0/scratchpad/t2/prints/icones-light.png`, `icones-dark.png`.

O que os prints mostraram e foi corrigido: placa sumia no desktop (largura do wrapper colapsava); placa ficava abaixo do formulário no celular (reordenada para logo após o H1, na 1ª tela); FECHADO ficava branco no escuro (agora `--sol-tinta`); unha do salão parecia um picolé (redesenhada como ponta de dedo); anilhas grandes por fora (invertidas, como na barra real); link de Bastidores com 17 px de alvo (agora 44 px).

#### Padrão de entrega
- Funciona: ok para CSS e SVG (página de teste sem erro). Build/testes do projeto: não se aplica à T2.
- 390 px sem rolagem lateral, texto ≥ 11 px: ok. Alvos ≥ 44 px: ok nos chips (o label tem 44 px; o radio invisível dentro mede 40 px por causa da borda, mas o alvo de toque é o label inteiro).
- Contraste AA: ok, medido. Reduced-motion e escuro: ok nos tokens; o comportamento da placa é da T6.
- Momento-assinatura: desenhado e especificado; animação real é da T6 (não verificado aqui).
- Revisor, QA e segurança: pendentes (fluxo da agência).

#### Pendências e avisos para outras tarefas
- T4/T1: o `TenantConfig.cores` tem 4 campos; o tema escuro da prévia deve vir do id da paleta (`--p-<nicho>-<n>-escuro-*`), não de inversão. Sugestão registrada em DIRECAO §8.2.
- T5: marcação do hero esperada (`.heroi-cabeca`, `.palco-placa`, `.heroi-corpo`); botões de pagamento usam `.btn[disabled]`; consentimento sem amarelo nos dois botões.
- T6: embutir os SVGs da placa (fonte da página), trocar `#placa-nome` por `textContent`, pivô em 48,5% 7,3% do placa.svg, prefixar ids se repetir SVG.
- T8: rituais com ids por parte e cor por `--n-destaque`; pele do dedo por `--pele`.
- Os SVGs com texto como `<img>` usam fonte de reserva; conversão do texto em curvas fica para depois, se a T6 precisar de `<img>`.

## T3 · autor: Verbo (copywriter) · fonte: `docs/relatorio/T3.md`

### T3 · Verbo · Conteúdo

Pergunta de venda: estes textos fazem a venda rodar sem o Marcos. O anúncio traz a pessoa, a home responde para quem é, qual a dor, qual a prova e qual o próximo passo, e o WhatsApp responde as 14 situações sem ele escrever nada novo.

#### O que foi feito
- **Vitrine** (`conteudo/`): home com as seções 1 a 10 da 5.1. O H1 e o subtítulo são exatos do briefing. Também: os 4 passos, "Como funciona de verdade", preços com o que inclui e o que não inclui, "O que você precisa ter", o contrato em 6 linhas, o bloco da agenda externa, a sede, a prova (some sem depoimento autorizado), a chamada final e o rodapé.
- **FAQ** com 14 perguntas. As 10 do briefing vêm primeiro. "Serve para clínica?" responde que o serviço não atende o segmento, sem lista de espera.
- **Páginas**: `/abrir/` (com o total exato do briefing), `/obrigado/` (com a frase exata e sem afirmar que o pagamento foi confirmado) e `/bastidores/` (a primeira linha é exata e vem antes do preço; licença em linguagem simples a partir dos `LICENSE-*.txt`). Mais o 404, o banner de consentimento, os erros, os estados vazios e de carregamento, o Teste de verdade, as mensagens de WhatsApp e a lista de espera (Pet, Restaurante, Oficina, Tatuagem e Outro).
- **Presets dos 3 nichos**: bordão, manifesto, serviços de exemplo (preços de exemplo na barbearia e no salão, academia "sob consulta"), FAQ do nicho, mensagem do pedido, os 18 textos da lista branca, as paletas com nome (os nomes do `tokens.css` da T2), o horário sugerido e os textos do ritual. "O dono confirma pelo WhatsApp" aparece em `pedidoNota` e em `confirmacaoTexto`.
- **Termos e privacidade**: os dois arquivos abrem com `REVISAO_JURIDICA_PENDENTE` e cobrem todos os itens pedidos.
- **Marketing**: `anuncios.md` tem 5 ângulos × 3 nichos, cada um com 3 textos, 3 títulos e 2 descrições. O ângulo D está marcado como condicional e o E traz a nota de evidência antiga. Inclui a calibragem de 16 a 22/11 e o conjunto Click-to-WhatsApp de janeiro. Também: `roteiros-video.md` (R1, R2, R3), `whatsapp-scripts.md` (saudação, ausência, R1 a R14 e etiquetas) e `utm.md`.

#### Políticas da Meta
Li as políticas em 08/11/2026 pelo TinyFish, porque o WebFetch não resolvia `transparency.meta.com` nesta sessão. As URLs e as datas estão no topo de `marketing/anuncios.md`: Padrões de Publicidade, Práticas Comerciais Proibidas (alterada em 29/10/2026), Saúde e bem-estar (22/07/2026) e Política do WhatsApp Business (23/09/2026). Conferi cada texto contra 7 regras. As páginas próprias de "Personal Attributes" e "Misleading claims" deram 404. Usei o texto dessas regras que está na página de introdução.

Duas descobertas mudaram o texto:
1. A regra de atributos pessoais agora inclui "name". Nenhum anúncio usa o nome de quem vê.
2. A Meta trata pigmentação como procedimento cosmético, com público 18+. Nenhum texto de anúncio cita pigmentação, e ela saiu do preset da barbearia (`conteudo/nichos/barbearia.json`) em 08/11/2026, porque o vídeo R1 rola a tabela de serviços da prévia. (Correção após revisão: a versão anterior dizia que ela não aparecia em nenhum anúncio, mas aparecia na tabela gravada no R1.)

#### Decisões que tomei (confirmar com o Marcos)
- **O que cada plano inclui e não inclui.** O briefing não lista. Montei a lista a partir da `docs/ESTRATEGIA.md`, seção 4.4: alterações sem limite nos 7 campos, janela de 1 dia útil no Aberto e de 4 h úteis no Vitrine, posts só no Vitrine. Coloquei a anuidade do domínio como **não incluída** (paga pelo cliente ao Registro.br). **Ainda falta definir:** quantos posts por mês o Vitrine entrega. O texto diz só "posts prontos todo mês".
- **Os 4 dados do relógio** seguem a estratégia: nome, WhatsApp, endereço e horário. Logo e foto ficam fora do relógio e entram como melhoria em até 24 h.
- **Prazos contratuais** (7 dias, 30 dias, D+7, 4 h úteis) estão escritos por extenso. Preço, prazo de produção e vagas só aparecem por marcador.
- **A palavra "agenda"** aparece em exatamente 2 strings, as duas que o briefing exige. Ver `conteudo/README.md`. O `checar.cjs` precisa liberar essas duas.
- Defini `{nome}` nos presets como o nome do cliente final (como no Fio no Couro) e mantive os marcadores do schema. Os títulos de página usam `{negocio}`, que é resolvido na montagem do tenant.
- O letreiro diz "Aberto agora · peça o seu horário", e não "próximo horário livre": sem uma agenda real, "livre" seria um horário inventado.
- O botão "Cartão em até 2x" ficou com o número literal, como está no briefing.

#### Como verificar
```
python3 -I <scratchpad>/checar_t3.py
```
O script fica fora do repositório, por isso o `<scratchpad>`. Ele confere 7 coisas:
- JSON válido;
- ausência de emoji, "agenda" fora da lista de permissão, "garantido", lorem ipsum, `[PREENCHER` e cliente real;
- preço ou prazo escrito sem marcador;
- limites do `tenant.schema.json` nos presets;
- títulos de anúncio até 40 caracteres e descrições até 30;
- respostas de WhatsApp com até 4 linhas;
- `REVISAO_JURIDICA_PENDENTE` na primeira linha dos dois textos jurídicos.

Resultado final: sobram só 3 avisos, todos esperados:
- O título da página fica acima de 70 caracteres com nome de 40 e cidade de 20. Nesse caso entra o `tituloSemCidade`, regra documentada.
- Trinks e Booksy aparecem na resposta da FAQ, como o exemplo que o briefing permite.
- A palavra "agenda" aparece nas listas de proibições internas de `marketing/`.

Para checar à mão: `head -1 conteudo/termos.md conteudo/privacidade.md` e `grep -rn "R\$ [0-9]" conteudo/` (esse grep deve voltar vazio).

#### Padrão de entrega
- **Textos reais, sem lorem e sem `[PREENCHER]`: ok** (conferido pelo script).
- **Regras duras 1, 2 e 7: ok.** Nenhum depoimento, nota ou horário ocupado; exemplos rotulados; nenhuma promessa de ganho; nenhum concorrente nomeado fora do exemplo; nenhum estado negativo de quem vê; nenhum cliente real.
- **Políticas conferidas e datadas: ok**, com a ressalva acima.
- **Interface, navegador e prints:** não se aplica. A T3 não tem tela; a Lupa confere os textos já na página.
- **Revisor e Lupa:** não verificado. Os dois rodam depois da construção. O briefing pede que a Lupa leia os anúncios de novo.

#### Pendências
1. **O Marcos precisa informar:** `{{empresa.documento}}` e `{{empresa.endereco}}` (CNPJ ou CPF e endereço da Creat.MTT Studio, exigidos pelo Decreto 7.962/2013), `{{site.url}}` (o domínio final) e a confirmação de `{{contato.email}}` = mttcreatt@gmail.com.
2. **T5:** acrescentar `bastidores: 67` em `precos.json` e em `CREAT_CHECKOUT.precosPadrao`, ou trocar `{{precos.bastidores}}`. Implementar os marcadores derivados (`abertura.atual`, `anual.*`) e liberar as 2 strings de "agenda".
3. **Ângulo E:** reabrir o artigo do Search Engine Journal de 29/02/2024 antes de subir. O domínio não estava acessível nesta sessão.
4. **Ângulo D:** só sobe com capacidade real em `vagas.json`.
5. **Metas da calibragem:** "meta a definir pelo Marcos", porque a seção 18 do briefing não traz números.
6. **Quantidade de posts do Vitrine** a definir.

#### Textos que dependem de revisão jurídica
- `conteudo/termos.md` inteiro, com atenção a estes pontos:
  - se o MEI conta como consumidor para os 7 dias do art. 49 (não verificado);
  - a liberação do SAIR só depois dos 7 dias;
  - a devolução proporcional no plano anual;
  - a régua de inadimplência até a saída do ar em D+60;
  - a licença do motor no site exportado (o cliente usa sem prazo e não pode revender);
  - a publicação automática do post depois de 48 h sem resposta;
  - o foro.
- `conteudo/privacidade.md` inteiro, com atenção a estes pontos:
  - as bases legais;
  - a retenção de 90 dias das conversas;
  - a transferência internacional (Anthropic, Meta, Microsoft, hospedagem);
  - o canal do encarregado sem pessoa nomeada;
  - o prazo de resposta de 15 dias.
- `conteudo/abrir.json`, campo `aceite.texto`: o pedido de início imediato junto com o direito de arrependimento.
- `conteudo/bastidores.json`: os 7 dias de arrependimento para produto digital baixado.

## T4 · autor: Pixel (frontend) · fonte: `docs/relatorio/T4.md`

### T4 · Pixel · Motor v1 e prévia

08/11/2026. Como isto ajuda a vender: o dono digita o nome na home e, em menos de meio segundo, vê o site dele com o nome gravado no couro e manda um pedido de horário de teste para o próprio WhatsApp. É o momento em que ele pensa "é o meu site".

#### O que foi feito
- **Motor v1** (`motor/v1/`), em script clássico (sem import/export). Abre por `file://` com duplo clique e lê só `window.TENANT`, sem nenhum dado de cliente no código.
  - `motor.js`: núcleo e funções puras, com render seguro (só `createElement`/`textContent`). Faz letreiro, herói, manifesto, pedido, tabela, equipe, recados, onde fica, perguntas e rodapé. Também cuida de tema claro e escuro (o escuro vem do id da paleta), JSON-LD `LocalBusiness` (só no site entregue) e do rodapé "Aberto pela Creat · veja o seu" com `utm_source=rodape&utm_medium=ref&utm_campaign=rodape-v1&utm_content=<nicho>`, como pede `marketing/utm.md`.
  - `agendamento.js`: "Pedir horário" com fita de dias, horário, serviço que cabe até o fechamento, profissional (se houver), nome e WhatsApp. Confirma pelo ritual ou por "Enviar sem arrastar". A mensagem vai para o WhatsApp e há o espelho de conferência.
    - Nunca promete confirmação. Não existe horário "ocupado".
    - Na prévia, o último campo é "Seu WhatsApp para receber o teste": só memória, nada no aparelho, nada em analytics.
    - No site entregue, o WhatsApp abre em `wa.me/<negocio.whatsapp>`. O nome e o WhatsApp ficam em `site:<slug>:cliente`, com "Esquecer meus dados" e o atalho "O de sempre".
    - Com `link_externo`, o fluxo vira o botão "Agendar" para `urlExterna`.
  - `efeito.js`: ritual `navalha` portado do Fio no Couro. O couro em canvas, a navalha com mola, quatro passadas e o nome vira cromo. A tira confirma o pedido. Registrado em `window.CREAT_RITUAIS.navalha = {montarHeroi, criarTira, resetarTira}`, a mesma interface para os rituais da T8.
  - `som.js`: Web Audio sintetizado (chhk, tiiing, trava). Silêncio até o primeiro gesto, suspende com a aba oculta e o mudo fica em `site:<slug>:som`.
  - `styles.css`: tokens `--pc-*` (claro) e `--pe-*` (escuro) escritos pelo motor a partir da paleta T2. O resto é derivado com color-mix. O herói é sempre o "couro" escuro da paleta. Inclui `prefers-reduced-motion` (navalha já afiada, sem tira).
  - `template.html`: a página do site entregue para o `build-site.cjs`.
- **Nichos.**
  - `motor/nichos/index.js`: registro tolerante. Nicho ausente, fora da lista, arquivo que não carrega ou preset inválido caem no padrão, sem erro.
  - `motor/nichos/barbearia.js`: textos e serviços de `conteudo/nichos/barbearia.json`, 3 paletas AA da T2, ritual `navalha`, sem equipe nem depoimento.
- **Prévia** (`previa/index.html`, `previa.js`, `previa.css`): lê `#k&n&c&p`, monta o tenant (`meta.previa=true`) e renderiza.
  - Tem `noindex`, `<noscript>` e estado de carregamento desenhado (passadas no couro).
  - Fragmento inválido cai em barbearia/paleta 1 com o aviso "Escolha o seu nicho".
  - Avisa a home por `postMessage {tipo:'creat:previa', evento:'pronta'|'reserva_teste', nicho}`, sem dado pessoal.

#### Contrato para a T9 (build-site.cjs) e a T8
```js
require('motor/nichos/index.js'); require('motor/nichos/barbearia.js');
const N = require('motor/nichos/index.js'), M = require('motor/v1/motor.js');
const preset = N.obter(tenant.nicho);
M.construirEstado(tenant, { preset, site: { home, url, rodape } })   // estado de tela puro (usado pelo navegador também)
M.montarTenantPrevia(preset, { nome, cidade, paleta, previa:false }) // tenant parcial a partir do preset
M.preencherTemplate(fs.readFileSync('motor/v1/template.html','utf8'), tenant, { preset, site, caminhoMotor:'motor/' }) // index.html
M.scriptTenant(tenant, site)   // conteúdo de tenant.js (window.TENANT + window.CREAT_SITE)
M.jsonLd(tenant, { preset, site })
```
- **Layout do dist:** `index.html` + `tenant.js` + `motor/v1/*` + `motor/nichos/{index,<nicho>}.js`. Testado em `file://`: abre, wa.me certo, JSON-LD presente, sem erro.
- **Rodapé:** `site.rodape:false` só com `--sem-rodape` (decisão do Marcos).
- **T8:**
  - criar `motor/nichos/<id>.js` com `CreatNichos.registrar({...})`, no formato do `barbearia.js`;
  - acrescentar o id em `DISPONIVEIS` no `index.js`;
  - registrar o ritual em `CREAT_RITUAIS.<nome>` com `montarHeroi/criarTira/resetarTira`, emitindo `ritual:confirmar {origem:'tira', el}`;
  - carregar o arquivo do ritual na prévia e no template.

#### Verificação
- **Navegador, 390 px, `#k=barbearia&n=Barbearia%20do%20Ze&c=Campinas&p=2`:** fluxo completo (quarta 19h, Degradê; Corte + barba "não cabe até o fechamento"). Abriu `https://wa.me/5511987654321?text=Teste da prévia do site: Olá! Meu nome é João Teste. Quero pedir um horário: Degradê, quarta, 11/11 às 19h. Pode confirmar por aqui? Meu WhatsApp: (11) 98765-4321.` O localStorage ficou vazio. Com WhatsApp inválido, aparece erro claro e o foco vai para o campo. Pela tira com Enter (ritual), a mensagem saiu certa. Ritual do herói pelo teclado: 4 passadas, `is-afiada`, medidor em 100.
- **Site entregue gerado do template em `file://`:** sem erro de console. JSON-LD HairSalon. wa.me do negócio com profissional na mensagem. "O de sempre" volta depois de recarregar. "Esquecer meus dados" limpa o localStorage. `link_externo` mostra "Agendar", sem formulário.
- **Casos de borda:** sem fragmento, `k` desconhecido, `n=<img onerror>`, fragmento quebrado e nome de 36 caracteres com cidade longa. Nenhum erro, nenhum diálogo e nenhum `<img>`. Os únicos hosts externos são `fonts.googleapis.com` e `fonts.gstatic.com`.
- **`verificacao-visual`** (390 e 1440, claro e escuro): "Tudo limpo", também sem fragmento.
- **Playwright 1280 e 390, claro e escuro, página inteira:** prévia pronta em 255 a 599 ms. `scrollWidth` igual à largura, nenhum texto abaixo de 11 px e nenhum alvo abaixo de 44 px. Prints olhados.
- **Schema:** `ajv@8.20.0` contra `schema/tenant.schema.json`. Passaram os tenants da prévia (4 nomes), o `tenantBase` e um tenant entregue.
- **Contraste:** nome gravado no couro contra fundo e veio de 4,56 a 5,29:1 nas 3 paletas. Os demais pares vêm da T2.
- **grep:** `grep -rn ocupacaoFicticia motor previa` volta vazio. Nenhum `innerHTML` em `motor/` nem `previa/`.

#### Pendente
- **Desktop a 1440:** a `verificacao-visual` tem 1440 fixo, então os prints a 1280 saíram de um script Playwright próprio no scratchpad.
- **Home (T5):** o iframe da prévia precisa de `allow-popups` (e `allow-scripts allow-same-origin`) para o `window.open` do wa.me. Sem isso, o link "Abrir o teste no meu WhatsApp" do espelho continua funcionando.
- **Gradiente no texto:** o hook do impeccable acusou gradient-text no cromo do nome. É o momento-assinatura herdado do Fio no Couro, aparece só depois do ritual e foi mantido de propósito.
- **Arquivos do Fio:** pedem `nichos/<nicho>.js` mais o ritual. Revisor, QA e segurança ficam para o fim do fluxo.

## T5 · autor: Pixel (frontend) · fonte: `docs/relatorio/T5.md`

### T5 · Pixel · Vitrine, checkout, dados e scripts de verificação

08/11/2026. Venda: do primeiro toque ao Pix sem o dono no meio. O visitante digita o nome e vê o site dele. Escolhe o plano com o total na tela, paga no Asaas e manda o PEDIDO v1 pronto no WhatsApp.

#### O que foi feito
- **`index.html` (A Porta)** tem as 10 seções na ordem da 5.1:
  - barra sem Bastidores;
  - hero com placa (T6), campo de 56 px com label, chips ativos e "avise-me" (wa.me ou e-mail de reserva), botão sempre visível e dica de arrastar;
  - prévia em tela cheia por iframe de `previa/`, com barra superior e inferior;
  - teste de verdade (máscara BR, validação, dia e hora pelo preset do nicho, celular desenhado como alternativa);
  - como funciona, preços e sede (pôster no celular; 3D só com toque ou, no desktop, ao chegar perto);
  - prova (some sem `autorizadoEm`), 14 perguntas, chamada final e rodapé.
  
  A placa SVG embutida é a reserva sem JS. Nenhum número de preço está escrito no HTML: tudo vem de `data-v` lido de `dados/`.
- **`/abrir/`**:
  - 4 planos trocáveis em um toque, com o fragmento atualizado;
  - TOTAL visível antes de pagar;
  - 5 campos obrigatórios com rótulo, mais negócio, nicho e cidade quando não vêm do fragmento; horário pré-preenchido pelo nicho;
  - aceite obrigatório e "Pagar no Pix" e "Cartão em até 2x" com o mesmo link, escolhido por `lerPrecos()`;
  - garantia de prazo, "o que acontece depois", `localStorage` com 7 dias e "Esquecer meus dados".
- **`/obrigado/`**:
  - não afirma pagamento;
  - letreiro com o nome e a sede `?marca=&modo=demo&lite=1` com "Demonstração";
  - relógio de `prazoHoras` "aguardando confirmação";
  - PEDIDO v1 com os 13 campos e a origem utm, pelo botão de WhatsApp ou pelo e-mail de reserva;
  - pede os campos de novo quando o aparelho não tem dados.
- **`/bastidores/`**: o aviso "Exige Claude Code" é o primeiro elemento, antes do preço.
- **`/termos/` e `/privacidade/`**: `REVISAO_JURIDICA_PENDENTE` no topo; o Markdown de `conteudo/` é renderizado por DOM, sem `innerHTML`.
- **`404.html`**: com caminhos absolutos.
- **`assets/vitrine.js`**:
  - leitura fail-closed dos dados (ADR-003);
  - contratos (a) a (j);
  - PostHog `posthog-js@1.447.3` com `persistence:'memory'`, `disable_capture_url_hashes` e um `before_send` que corta o `#` e descarta propriedade fora da lista;
  - Pixel e Clarity só depois do Aceitar e só na home.
  
  A home limpa o próprio fragmento ao abrir, para nome e cidade nunca ficarem na URL que Pixel e Clarity leem.
- **`checkout.config.js`**: `CREAT_CHECKOUT`, com os 4 marcadores **só aqui**, e `CREAT_MEDICAO` com IDs públicos em formato de exemplo. Fora do formato, a medição fica desligada e nenhuma requisição sai.
- **`dados/`**:
  - `precos.json` com a seção 8 e `bastidores: 67`, chave pedida pelo Verbo;
  - `vagas.json`;
  - `depoimentos.json` vazio.
- **Scripts**:
  - `checar.cjs` sem dependências, com validador JSON Schema embutido; com `AJV_DIR` usa o ajv. A exceção da palavra "agenda" está documentada no cabeçalho;
  - `checar-placeholders.cjs`;
  - `atualizar-vagas.cjs`.
- **`abrir/pedido.css`**: estilos das páginas internas, só com tokens. A home tem um `<style>` próprio, também só com tokens.

#### Como verificar
```
node projetos/creat-nuvem/scripts/checar.cjs              # tudo certo, código 0 (18/18 fixtures; com AJV_DIR=<pasta> usa o ajv)
node projetos/creat-nuvem/scripts/checar-placeholders.cjs # FALHA, código 1, lista os 4 marcadores
node projetos/creat-nuvem/scripts/atualizar-vagas.cjs     # mostra o estado; --confirmar carimba; --ajuda
python3 -m http.server 8791   # na raiz do repositório
# abra http://127.0.0.1:8791/projetos/creat-nuvem/?nicho=barbearia&utm_source=meta
```

#### Status (padrão de entrega)
| item | status | prova |
|---|---|---|
| 18.1 `checar.cjs` passa | ok | código 0; numa cópia com emoji, "Agenda", "R$ 297" no HTML, `vagas_hoje` > capacidade e `ocupacaoFicticia` deu 5 falhas e código 1 |
| 18.2 páginas a 390 e 1280, claro e escuro | ok | `verificacao-visual` em home, abrir, obrigado, bastidores, termos e privacidade: sem rolagem lateral, sem texto < 11 px, sem erro de JS. Rodada de 08/11/2026 com `assets/som/creat-som.js` (T7) presente: home, `/abrir/` e `/obrigado/` deram "Tudo limpo", sem 404. Prints em `.verificacao/t5-*` e `.verificacao/t5b-*` |
| sons (T7) | ok | 08/11/2026, Playwright a 390 px: `CreatSom` carrega em home, `/abrir/` e `/obrigado/`. Botão de som visível, `aria-pressed` true → false ("Som desligado", `mudo` true) → true. Trocar de nicho chama `clique` e cria 1 oscilador. "Não abriu? Veja como o pedido chega" no Teste de verdade chama `plim` (4 osciladores). Em mudo: 0 osciladores. Sem erro de console |
| 18.3 fluxo no navegador | ok | nome e "Abrir meu negócio" com a placa real da T6. A prévia abre com `previa/#k=salao&n=Sal%C3%A3o%20da%20Bia&p=1` só no iframe. O endereço da home fica `?nicho=&utm_*#previa`, sem dado pessoal na query |
| 18.5 teste de verdade | ok | número inválido: erro claro. Válido: `wa.me/5511987654321?text=...` com serviço, dia e hora. Nenhuma requisição carrega o número (`performance` filtrado deu 0) |
| 18.6 `/abrir/` | ok | total na tela. Sem aceite: "Falta 1 campo" e o clique é bloqueado. Com placeholders: botões sem `href`, `aria-disabled`, "Link de pagamento em configuração". Numa cópia com links reais: o href é o de inauguração; o `localStorage` grava o pedido |
| 18.7 dado velho ou ausente | ok | numa cópia: fresco mostra "R$ 297 de R$ 497" e o contador. Com `vagas.json` velho, apagado ou `precos.json` quebrado: "R$ 497 uma vez", sem contador e sem erro |
| 18.8 `/obrigado/` | ok | o texto não afirma pagamento. O PEDIDO v1 gerado passou no ajv em `PedidoEntrada` (com URL https de produção) |
| 18.10 Bastidores | ok | o aviso é o 1º elemento; na home, Bastidores só aparece no rodapé |
| 18.11 consentimento e analytics | ok, com 1 parte não verificada | antes do Aceitar: 0 script ou requisição de Pixel e Clarity; depois: `fbevents.js` e a tag do Clarity. `before_send` testado: corta `#`, descarta nome, WhatsApp e `$set`. **Não verificado na rede:** a chamada real ao PostHog, porque a chave é de exemplo e o jsdelivr está bloqueado no sandbox; a Muralha confere com a chave real |
| 18.14 `checar-placeholders` | ok | com os marcadores: código 1. Numa cópia com links Asaas e Cakto e número reais: código 0. `[PREENCHER]` em `404.html`: 1. Link `http://` fora do Asaas: 1 |
| 18.15 peso e carregamento | ok | home sem a sede: 167 KB medidos (HTML 44 + CSS 45 + JS 73 + SVG 7), mais cerca de 53 KB de fontes e do pôster lazy, bem abaixo de 500 KB. Prévia, sede e termos têm carregamento desenhado (placa mini) |
| 18.16 textos | ok | textos do Verbo, sem emoji nem lorem; `REVISAO_JURIDICA_PENDENTE` nas duas páginas |
| alvos ≥ 44 px, foco, reduzido, escuro | ok | tokens da T2; `prefers-reduced-motion` encurta a espera da prévia e zera as transições |

#### Decisões registradas
- **Banner de consentimento adiado.** Ele aparece ao passar do hero, ao fechar a prévia ou depois de 25 s; antes disso cobria o campo do nome a 390 px. Nada de Pixel ou Clarity antes do Aceitar. Enquanto está na tela, ele reserva o próprio espaço no fim da página.
- **Chips "avise-me" sempre visíveis.** O contrato (d) os escondia sem `dados/nichos.json`, mas a tarefa os pede sempre e eles não dependem de servidor. Ficaram abaixo do botão "Abrir meu negócio" para o CTA subir no desktop.
- **"Ver a prévia de novo"** em `/abrir/` volta para a home com o nome preenchido; a home limpa o fragmento na hora.
- **Termos:** o preço de inauguração vem de `precos.json`, sem número fixo no código.

#### Pendente
- **T8:** salão e academia caem no preset da barbearia, com o aviso "Escolha o seu nicho" da T4.
- **Sem teste até 08/11/2026, dependem da Lupa (qa) antes de publicar:** (1) o aceite 4 da T6, arrastar a placa; o botão foi testado com a placa real, o gesto não. (2) A chamada real ao PostHog na rede; a chave é de exemplo e o CDN está bloqueado no sandbox.
- **T10:**
  - a CSP precisa liberar `style-src 'unsafe-inline'`, porque os SVGs embutidos da T2 têm `<style>` e as páginas têm `<style>` próprio; não há script inline;
  - liberar `cdn.jsdelivr.net` e `*.posthog.com` (PostHog) e, com consentimento, `connect.facebook.net` e `www.clarity.ms`;
  - copiar `sede/` para `/sede/` no site publicado;
  - publicar na raiz do domínio, porque o schema exige `https://<host>/previa/`.
- **Marcos:**
  - trocar os 4 marcadores;
  - pôr as chaves públicas de PostHog, Pixel e Clarity em `CREAT_MEDICAO`;
  - rodar `atualizar-vagas.cjs --confirmar` todo dia (ideal: tarefa agendada). Sem isso, depois de 48 h a página cai sozinha no preço padrão.

#### Ajustes pedidos pelo revisor (08/11/2026)
- `pago_pagina` virou **`pedido_enviado_pagina`** em `assets/vitrine.js`, `schema/evento.schema.json` e `docs/CONTRATOS-DETALHE.md`. O nome antigo sugeria pagamento confirmado. O evento é um indicador aproximado: o pedido é gravado ao clicar em Pagar, antes do Pix, então quem clica e volta sem pagar também conta. Isso está escrito no `$comment` do schema. Não otimize anúncio por ele como se fosse compra.
- Saiu o disparo no ramo sem pedido (`{ plano: 'vitrine' }` inventado). Agora o evento só dispara dentro de `renderizar`, com pedido real, e uma flag `pedidoContado` limita a 1 evento por carga.
- Prova (Playwright, 390 px): `/obrigado/` sem pedido dá 0 eventos. Preencher o formulário e enviar 2 vezes seguidas dá 1 evento `{plano:"vitrine", nicho:"barbearia"}`. Recarregar com o pedido salvo dá 1 evento. Sem erro de console.
- Sons (T7) verificados; ver a linha "sons (T7)" na tabela.

## T6 · autor: Órbita (motion-3d) · fonte: `docs/relatorio/T6.md`

### T6 · Órbita · Placa e sede com a marca do cliente

08/11/2026. Como isto ajuda a vender: a placa é o gesto que a pessoa conta para um amigo. Ela puxa com o polegar, a placa gira, mostra a nuvem queimada no verso e para em ABERTO com o nome dela em giz. A sede com o nome dela na fachada prova que existe uma equipe trabalhando.

#### O que foi feito
##### 1. Placa (`ritual/placa.js`, `ritual/placa.css`)
- Script clássico, sem WebGL e sem dependência. Segue a API da T1: `CreatPlaca.montar(el,{nome,onAberto,onSemNome})`, `definirNome`, `abrir(via)`, `reiniciar`, `desmontar` e `aberta`. Ao virar, dispara o evento `creatplaca:aberta` (`detail.via`). Quem monta aciona o botão "Abrir meu negócio" por `CreatPlaca.abrir('botao')`; a T5 já faz isso.
- Usa os SVGs da T2 (`corrente`, `placa-fechado`, `placa-verso`, `placa-aberto`), embutidos no JS para funcionar por `file://`. Os ids ganham o prefixo `cp-` e os SVGs ficam com `aria-hidden`.
- Acessibilidade: a placa é um `div role=button tabindex=0` com `aria-label` que muda com o estado. Enter e Espaço abrem (sem repetir enquanto a tecla fica presa), o foco é visível (contorno `--sol`) e há uma região `aria-live` que anuncia "Aberto: nome". Leitores de tela ativam a placa pelo `click`.
- Gesto de arrastar com Pointer Events e `setPointerCapture`:
  - A tábua acompanha o dedo 1:1 até 40% da altura dela. Depois disso, resiste (elástico de 0,3) e a corrente estica a partir do prego.
  - Soltar abaixo de 40%: volta com mola. Soltar acima: volta e gira.
  - Toque simples abre. O clique que vem depois de um arraste é ignorado.
  - `touch-action:none` vale só em `.cp-placa`.
- Giro com WAAPI em 600 ms:
  - Antecipação de -16° com compressão de 4%, depois esticada de 3% e leve passada (372°) antes de assentar em 360°.
  - A face troca escondida atrás do verso (180°), então o visitante vê FECHADO, a nuvem queimada e ABERTO.
  - Depois vêm `CreatSom.sino()` (checa se existe), `navigator.vibrate?.(30)` e `onAberto`.
  - Só `transform` e `opacity` se movem.
- Giz: uma faixa de lousa na borda de baixo da face FECHADO. Só as letras novas aparecem, uma a cada 45 ms, e `CreatSom.giz()` toca uma vez por atualização com letra nova. Nomes longos encolhem a fonte. O nome entra só por `textContent`.
- Balanço ocioso de ±2° (3,2 s) com tokens da T2, parado durante o arraste. Nome vazio: a placa nega com a cabeça e chama `onSemNome`.
- `prefers-reduced-motion`: sem balanço, troca por crossfade de 200 ms, sem giro, sem som e sem animação no giz.

##### 2. Sede (`sede/index.html`, cirurgia mínima: 5 linhas trocadas, o resto acrescentado)
- `?marca=`: tira acentos combinados soltos e tudo que não for letra, número, espaço ou `& . - '`, e corta em 28 caracteres na última palavra. Valor com `<` ou `>` é ignorado e a placa fica a atual (contrato T1: "senão ignorado").
  - O nome é desenhado só com `fillText` no `signTex` (1024x300), encolhendo até caber, com a legenda "ABERTO PELA CREAT NUVEM".
  - Também vai para `document.title` e para a mensagem do carregador ("Pendurando a placa de...").
- `?modo=`:
  - `demo`: estado fictício embutido que passa o pedido de mão em mão em ciclo. A legenda fixa "Demonstração" fica sempre visível e o painel diz "dados de exemplo". Não faz nenhuma requisição.
  - `publico`: busca só `estado-publico.json` a cada 15 s. A frase é refeita pela tabela fechada no próprio navegador; o texto do arquivo é ignorado. Não lê o banco do artefato nem o `estado.json`.
  - `local`: comportamento de antes.
  - Em `demo` e `publico`, a simulação com briefing fica escondida e o botão vira "Ver a equipe".
- Padrão sem `?modo` (decisão): `local` em localhost, `file:` e no artefato publicado do Claude (claude.ai/claudeusercontent), para não quebrar o ao vivo de hoje do Marcos. Em qualquer outro host vale `publico`, como na T1, para uma cópia em `/sede/` do site nunca ler o `estado.json`.
- `?lite=1`: pixel ratio 1, sem sombras, no máximo 30 quadros por segundo.
- Honestidade: só fica "trabalhando" quem o estado marca assim. Agente interrompido não aparece.
- Three.js continua fixo em 0.160.0 (jsDelivr, pacote npm `three`, addons da mesma versão). Isso está registrado num comentário acima do importmap.

##### 3. `sede/publicar-estado.cjs`
- Roda `.claude/skills/sede-ao-vivo/estado.cjs` (ou lê `--entrada`) e grava `sede/estado-publico.json` de forma atômica, com `{versao:1, atualizado_em, mensagem, fluxos:[{nome, em_andamento, agentes:[{personagem,status,frase}]}]}`.
- As frases vêm da tabela do anexo (i) da T1: Verbo "escrevendo os textos", Paleta "escolhendo as cores", Pixel "montando a página", Lupa "testando no celular", Muralha "conferindo segurança", Trilho "publicando", Radar "conferindo os dados", Nimbus "organizando a fila", e as frases neutras dos outros sete. `feito` = "terminou a parte dele".
- Só entram fluxos em andamento, no máximo 3. O rótulo é "Pedido da Creat" se o script se chamar `pedido*`/`producao*`, e "Projeto interno" nos demais casos. Sem fluxo, a mensagem é "A equipe espera o próximo pedido."
- Antes de gravar, `conferir()` recusa (código 1) se aparecer `/`, `\`, `.cjs`, `.js`, `.json`, `scratchpad`, `token`, `wf_`, `agencia`, `http` ou `:` em qualquer valor ou chave, frase ou rótulo fora da tabela, ou texto livre do estado interno.
- `--autoteste` roda sem rede, com um estado interno cheio de armadilhas (caminhos, nome de cliente, telefone, `<script>`, tokens).
- `--exemplo` regrava `sede/estado-publico.exemplo.json`.

#### Como verificar
```bash
node sede/publicar-estado.cjs --autoteste         # 22 ok, "autoteste ok", código 0
node sede/publicar-estado.cjs                     # gera sede/estado-publico.json (não versionar)
grep -c '/\|\.cjs\|scratchpad\|tokens' sede/estado-publico.json sede/estado-publico.exemplo.json   # 0 e 0
node sede/servidor.cjs   # http://localhost:8000/?marca=Barbearia%20do%20Ze&modo=demo · ?modo=publico · sem parâmetro = local
```

Resultados no Playwright (Chromium, WebGL por software, three servido de `node_modules` porque o CDN está bloqueado neste ambiente):

| item | resultado |
|---|---|
| 390 px com toque (CDP) | arrastar 20%: não abre; 55%: abre com `via:'arrastar'`, 1 sino; deslizar fora da placa rolou 285 px; deslizar sobre a placa rolou 0; `touch-action` é `none` na placa e `auto` no body |
| reduced-motion + teclado | sem animação no pêndulo; as únicas animações são as opacidades 1→0 e 0→1; 0 sino, 0 giz; Enter abre com `via:'teclado'` |
| desktop escuro | sem nome: não vira, mostra o erro e foca o campo; botão "Abrir meu negócio" gira a 60 fps medidos |
| `navegador` (celular) | digitar, escolher o nicho e tocar na placa: ABERTO e a prévia sobe; console sem erros |
| `?marca=Barbearia%20do%20Ze` | a placa da fachada mostra o nome e a legenda |
| `?marca=<script>alert(1)</script><img onerror>` | 0 alertas, 0 elementos injetados, placa original |
| `?modo=publico` | pediu `estado-publico.json`, 0 pedidos a `estado.json`, painel só com frases da tabela |
| sem parâmetro (localhost) | pediu `estado.json`, ao vivo de antes intacto, sem erros |
| `?lite=1` | sem erros |
| `verificacao-visual` (sede demo com marca) | "Tudo limpo" nos 4 prints |

Prints olhados: placa fechada com giz, arrastando, meio do giro com o verso, ABERTO claro e escuro com nome longo, e a sede demo/pública/lite (celular e desktop).

#### Pendente
- **T5 (`assets/vitrine.js`), corrigido em 08/11/2026 a pedido do revisor:** em `aoAbrirPlaca`, quando a validação falha (nicho não escolhido), a vitrine chama `placa.reiniciar()`, que pelo contrato apaga o giz, mas não chama `placa.definirNome(limparNome(campoNome.value))` em seguida. Resultado: o nome some da placa embora continue no campo. Correção de uma linha: chamar `definirNome` logo depois do `reiniciar()`, como `fecharPrevia` já faz.
- ~~T7: `assets/som/creat-som.js` ainda não existe.~~ Atualizado em 08/11/2026: o arquivo existe e carrega na home sem 404 (`CreatSom.estado` responde e o console fica limpo).
- `sede/estado-publico.json` é um artefato gerado: apaguei depois do teste. T10 deve pô-lo no `.gitignore` (ou publicá-lo só pelo deploy) e copiar `sede/` sem o `estado.json` para o site.
- Lazy loading do 3D no celular (pôster `sede-ilha.webp` + "Ver ao vivo") fica na home (T5).
- Revisor, QA e Muralha no fim do fluxo.

## T7 · autor: Eco (som) · fonte: `docs/relatorio/T7.md`

### T7 · Eco · Som da vitrine

**Como isto vende:** o sininho é o som do momento que a pessoa conta para um amigo, quando a placa vira ABERTO com o nome dela. Ele só toca depois de um gesto dela, fica baixo e se cala com a aba oculta, no mudo ou com movimento reduzido. Assim marca o momento sem nunca incomodar.

#### Entrega
`assets/som/creat-som.js` é um script clássico, sem dependência e sem arquivo de áudio: 100% sintetizado em Web Audio (cerca de 11 KB sem minificar). A API segue `docs/CONTRATOS-DETALHE.md` (b):

| chamada | som | duração | pista visual equivalente |
|---|---|---|---|
| `sino()` | dois sininhos de latão (sol6 e dó7, parciais inarmônicos 1 · 2,08 · 2,76 · 3,9 · 5,43), badalo que quica em 7 batidas cada vez mais fracas, reverb curto por convolução gerada em código | ~0,35 s de batidas + ~0,9 s de cauda | a placa vira ABERTO (T6) |
| `giz()` | ruído em banda de 2,6 a 4,1 kHz, cor e panorama variam por letra, grão agudo | 28 a 42 ms, no máximo 1 a cada 60 ms | a letra aparece em giz |
| `plim()` | duas notas subindo (mi6 e lá6), seno com um pouco de 2º harmônico | ~0,34 s | a mensagem chega no celular desenhado |
| `clique()` | estalo filtrado de 18 ms com seno caindo de 1400 para 900 Hz | 30 ms | estado do botão ou do rádio |
| `silenciar(m?)` | alterna ou define o mudo e devolve `mudo`; ao religar, toca `clique()` como confirmação | | rótulo e `aria-pressed` do botão (vitrine.js) |

- `mudo` é só leitura. `estado` (não enumerável) devolve `{suportado, armado, gesto, contexto, mudo, oculto, reduzido}` e serve só para teste.

#### Regras implementadas
- **Nenhum som antes do gesto.** `armar()` é idempotente e só registra ouvintes (`pointerdown/pointerup/touchend/keydown/click`, em captura). O `AudioContext` nasce no primeiro gesto real: eventos sintéticos e a tecla Esc não contam. Chamadas anteriores são no-op e não entram em fila.
- **O som pedido no próprio gesto não se perde.** Se o contexto ainda está no `resume()`, a voz espera por no máximo 300 ms. É isso que garante o sino na primeira abertura da placa.
- **Mudo persistido** em `localStorage['creat:som'] = 'on'|'off'`, com try/catch e cópia em memória. Cada mudança dispara `CustomEvent('creat:som', {detail:{mudo}})`, inclusive quando a troca vem de outra aba (evento `storage`). Em mudo, o contexto é suspenso depois de 400 ms para poupar bateria. Se o primeiro gesto acontece em mudo, o contexto nem é criado.
- **Volume:** ganho mestre de 0,22 e compressor-limitador (−20 dB, 6:1). Os picos dos microssons ficam abaixo de −18 dBFS. Toda voz tem ataque em rampa e soltura exponencial, sem corte seco.
- **Aba oculta:** o contexto é suspenso e as chamadas viram no-op. Ao voltar, ele retoma só se já houve gesto e o som está ligado.
- **`prefers-reduced-motion`:** sem som nenhum, como pede a placa. A preferência é lida ao vivo.
- **Sem Web Audio:** tudo vira no-op, sem erro.
- Também se arma sozinho ao carregar, porque ouvir gestos não cria contexto. Assim `/abrir/` e `/obrigado/` funcionam mesmo sem chamar `armar()`. Carregar o script duas vezes mantém a primeira instância.

#### Verificação (skill navegador + Playwright, 08/11/2026)
Página de teste descartável no scratchpad, com espião que conta `AudioContext` criados e `OscillatorNode.start`.
| caso | resultado |
|---|---|
| `sino/giz/plim` chamados antes do gesto | 0 contextos, 0 vozes · **ok** |
| primeiro toque em "Sino" | 1 contexto `running`, 35 osciladores (7 batidas × 5 parciais) · **ok** |
| mudo → recarregar | `mudo=true`, `localStorage='off'`, botão "Som desligado" · **ok** |
| gesto e chamadas em mudo | 0 contextos, 0 vozes · **ok** |
| religar | `'on'`, 1 oscilador (clique de confirmação) · **ok** |
| `giz()` 10× no mesmo instante | 1 batida (2 buffers); outra após 70 ms · **ok** (achei e corrigi um vazamento: os ouvintes de gesto ficavam ativos quando o contexto nascia pelo `silenciar`) |
| aba oculta | contexto `suspended`, 0 vozes; volta a `running` ao reaparecer · **ok** |
| `reducedMotion: 'reduce'` | 0 contextos e 0 vozes mesmo com cliques · **ok** |
| sem `AudioContext` | sem erro, API responde · **ok** |
| home real (390 px): nicho → "Abrir meu negócio" | clique do nicho (1) + sino na virada (35), placa `.cp-aberta`, console limpo · **ok** |

`plim()` na home não foi exercitado de ponta a ponta, porque ele sai no fluxo "Teste de verdade" da T5. A voz foi verificada isoladamente.

#### Pendente
- A escuta crítica em fone e alto-falante de celular real ficou **não verificada** (o sandbox não tem saída de áudio). O timbre foi conferido pela estrutura e pela contagem de vozes, não de ouvido.
- Para a T5 e a Lupa: no teste em 390 px, o banner de consentimento cobriu o botão "Abrir meu negócio" depois que o campo de nome rolou a página. O primeiro clique foi parar no banner.
- Revisor, QA e Muralha.

## T8 · autor: Pixel (frontend) · fonte: `docs/relatorio/T8.md`

### T8 · Pixel · Nichos salão e academia com rituais próprios

08/11/2026. Como isto ajuda a vender: o dono do salão vê o site dele com uma unha para pintar com o dedo, e o dono da academia vê uma barra para levantar. Cada nicho parece feito para ele, não um molde trocado de cor. É o momento que ele mostra para alguém.

#### O que foi feito
- **`motor/nichos/salao.js`** (salão, unhas, estética). Textos, serviços e mensagem vêm de `conteudo/nichos/salao.json` (T3). Os 7 serviços (corte, escova, coloração, manicure, pedicure, design de sobrancelha, hidratação) têm preço de exemplo; a prévia mostra o selo "exemplo" e a nota "Preços de exemplo". Inclui 3 paletas AA da T2 (Esmalte cereja, Sálvia, Base nude), Bodoni Moda com Figtree, `schemaOrgTipo: BeautySalon` e o ritual `esmalte`. Ficaram fora do preset os procedimentos de saúde e o antes e depois.
- **`motor/nichos/academia.js`** (academia, studio, personal). O pedido é aula experimental ou avaliação. As 6 modalidades têm `preco: null`, que aparece como "sob consulta". Inclui 3 paletas AA nas cores das anilhas olímpicas, Barlow Condensed com Barlow, `ExerciseGym` e o ritual `barra`.
- Os dois presets têm bordão, manifesto, FAQ do nicho com "o dono confirma pelo WhatsApp" e a mensagem de WhatsApp. Não há equipe, avaliação, foto ou horário ocupado. Os microtextos `heroiDica`, `heroiInstrucao` e `heroiPronto` foram escritos na T8, no tom da T3.
- **`motor/v1/rituais/`** (scripts clássicos, novos):
  - **`comum.js`**: mola, arrasto 2D do palco, decisor de eixo da tira, a tira de confirmar genérica (confirma só no `pointerup`, Enter ou Espaço, clique sintético de leitor de tela) e reação ao vivo a `prefers-reduced-motion`. Garante o `rituais.css` se a página não o trouxe.
  - **`esmalte.js`**: o pincel mora no vidrinho, porque a tampa é o cabo. A pessoa o tira e pinta a unha, e a tinta fica onde o pincel passou (cobertura medida por amostras dentro da unha). Com 82% coberto, o esmalte assenta, ganha brilho, o pincel volta ao vidro e o nome fica na cor do esmalte. Pelo teclado, setas, Espaço ou Enter dão 3 pinceladas. Na tira, o pincel pinta uma unha comprida.
  - **`barra.js`**: a barra pesa. Sobe atrás do dedo, enverga, as anilhas balançam; solta antes do topo, ela cai, quica e solta pó de magnésio. No topo, ela trava e o nome ganha a faixa da anilha. Pelo teclado, seta para cima, Espaço ou Enter sobem um terço por toque. Na tira, a barra sobe a rampa.
  - **`rituais.css`**: só tokens do motor. `touch-action: none` vale só no palco do gesto; a tira usa `pan-y` e a página sempre rola. Alvos de toque de 56 px. Com movimento reduzido, os rituais começam no estado final, sem gesto e sem tira, e fica o "Enviar sem arrastar".
  - Os desenhos são os da T2 (`ritual-salao.svg`, `ritual-academia.svg`), refeitos em nós SVG porque o site entregue abre por `file://` e não pode buscar arquivos. Os rituais não emitem `ritual:passada` nem `ritual:afiada`, que são os sons de navalha; usam `CreatMotorSom.tocar('clique'|'trava')`, que respeita o mudo.
- **`motor/nichos/index.js`**: `DISPONIVEIS` passa a ter `salao` e `academia`. O preset declara `ritualArquivos` (relativos a `motor/`, só `v1/rituais/*.js|css`). `carregar()` traz o CSS e os scripts em ordem antes de chamar o motor. Se algo falhar, o motor segue sem ritual, sem erro.
- **`dados/nichos.json`**: os 3 ativos e os 4 "avise-me" (pet, restaurante, oficina, tatuagem), com a mensagem de WhatsApp de `conteudo/comum.json`. O número do Suporte vem só do `CREAT_CHECKOUT`. Clínica e saúde não aparecem.

#### Gancho no motor (mudança mínima e aditiva em `motor/v1/motor.js`, arquivo da T4)
`preencherTemplate` chama a nova `comRitual(html, preset, caminho)`. Para preset com `ritualArquivos`, ela põe `<link data-rituais-css>` e `<script defer>` antes de `</head>`; sem esse campo, o HTML sai igual ao de antes (barbearia sem mudança). Diff: 10 linhas, nenhuma removida além do `return` reescrito.

#### Verificação
- `node scripts/checar.cjs`: tudo certo (presets barbearia, salao e academia no schema, 3 paletas, sem dado inventado).
- **Validador da T9** (`scripts/producao/validar-tenant.mjs`, função `validar`): os tenants de prévia dos 3 nichos × 3 paletas, com e sem nome, passaram. Os `tenantBase` também passaram. Um tenant entregue completo de cada nicho também passou.
- **`build-site.cjs` da T9** com salão e academia: o `dist` traz `motor/v1/rituais/` e as tags no `index.html`. Aberto em `file://`: ritual montado, JSON-LD `BeautySalon` e `ExerciseGym`, sem erro.
- **Navegador:** a prévia do salão a 390 px abriu sem erro de console. Com Playwright a 390 e 1280, claro e escuro:
  - gesto no herói: salão `is-pintada` e academia `is-levantada`, medidor em 100;
  - `scrollWidth` igual à largura;
  - nenhuma seção de equipe ou recados.
- **Fluxo do pedido a 390 px:** dia, horário, serviço, nome e WhatsApp, depois a tira.
  - Arrastando a tira, no salão e na academia, abriu `wa.me/5571987654321` com serviço, dia e hora.
  - A tira pelo teclado (Enter) também abriu.
  - Com movimento reduzido: herói no estado final, sem tira, e "Enviar sem arrastar" funciona.
  - Herói pelo teclado (3 × Espaço): os dois ficam prontos.
  - O `touch-action` do herói continua `auto`.
- **`verificacao-visual`** nos 3 nichos (390 e 1440, claro e escuro): "Tudo limpo". Prints olhados.

#### Pendente
- **Revisor, QA e Muralha** ficam para o fim do fluxo. A Lupa deve testar o gesto num celular real (arrasto 2D no palco e rolagem fora dele).
- A **`verificacao-visual`** só tem 1440 fixo; os prints a 1280 saíram do Playwright no scratchpad.
- **T5:** a home ainda lê `conteudo/` para os chips. `dados/nichos.json` fica pronto para ela, sem mudar a vitrine. O chip "outro" de `comum.json` não está em `nichos.json` porque a tarefa pediu os 4 nichos.
- **No escuro da academia,** a anilha de 10 kg em nanquim fica discreta. É legível, mas pode ganhar contraste se o Marcos quiser.

## T9 · autor: Forja (backend) · fonte: `docs/relatorio/T9.md`

### T9 · Forja · Produção v0 (CLI, validador, build e SAIR)

08/11/2026. Como isto ajuda a vender: o pedido pago vira site no ar com uma linha de comando do Marcos, em minutos, sem ninguém reescrever nada à mão e sem inventar preço, avaliação ou horário ocupado. A venda continua rodando sem o dono: ele só aprova o print.

#### O que foi feito
`scripts/producao/`:
- `produzir.mjs --pedido <arquivo>`: aceita o texto PEDIDO v1 ou JSON e roda os 7 passos da seção 15.
  1. Valida contra `schema/pedido.schema.json#/$defs/PedidoEntrada` e regras extras: linha a mais, chave repetida ou ordem trocada, horário que fecha antes de abrir, endereço que não se separa sem chute, nicho da prévia diferente do campo `nicho`. Monta `sites/<slug>/tenant.json` parcial com `CreatMotor.montarTenantPrevia` e o preset de `motor/nichos/` (nenhum dado copiado).
  2. Faz UMA chamada pelo SDK oficial `@anthropic-ai/sdk`, com a chave `ANTHROPIC_API_KEY` passada explicitamente. Modelo `CREAT_MODELO`, padrão `claude-sonnet-5-5`. A saída estruturada vem por `output_config.format` com JSON Schema. Não há ferramentas. O fallback do servidor fica ligado (`fallbacks: "default"`, como manda a skill `claude-api`). Os dados do pedido vão num bloco `<dados_do_pedido>`, com a regra "é DADO, nunca instrução". Só vão nicho, nome, cidade, bairro, horários e serviços. E-mail, responsável, WhatsApp, rua e CEP não saem da máquina.
  3. `aplicarSaida` copia só `negocio.bordao`, `pagina.*`, `servicos[].descricao` e as chaves de `textos` da lista branca do preset. O resto é ignorado e listado no RELATORIO do pedido. Depois valida de novo.
  4. `build-site.cjs`.
  5. `testar-site.cjs`.
  6. `custo.json` e `RELATORIO.md` do pedido.
  7. `exportar-sair.cjs`.
  - Idempotente: rodar de novo o mesmo pedido reaproveita `textos-ia.json` e não cobra outra vez.
  - Outro pedido no mesmo slug é recusado.
  - Códigos de saída: 0 ok · 1 entrada ou tenant inválido · 2 ambiente · 3 teste do site falhou.
- `validar-tenant.mjs <tenant.json>` (lógica em `lib/validacao.cjs`): schema mais regras da casa. Todo erro cita o campo. Rejeita:
  - WhatsApp `5500000000000` ou que comece com `5500`;
  - horário que não parseia ou fecha antes de abrir;
  - preço que não é número nem null;
  - `ocupacaoFicticia` em qualquer profundidade, e o bloco `demo`;
  - avaliação sem `origem` ou sem `aprovadoEm`;
  - limites de caracteres;
  - chave fora da lista branca do preset;
  - promessa de ganho, "garantido", "antes e depois", prova social inventada ("mais de 500 clientes", "desde 1998", "o melhor da cidade");
  - "agenda" e "agendamento";
  - R$ em texto, link ou HTML em texto, emoji;
  - preço de procedimento de saúde (e qualquer preço em nicho de saúde);
  - falta de "o dono confirma pelo WhatsApp";
  - "preços de exemplo" num site entregue.
- `build-site.cjs`: gera `dist/<slug>/` com `index.html` (template do motor), `tenant.json`, `tenant.js`, `motor/v1/**` (inclui `rituais/` da T8), `motor/nichos/*`, `robots.txt` e `sitemap.xml`.
  - O sitemap só sai com URL absoluta (`--url` ou `CREAT_URL_SITES`).
  - Prévia: `noindex, nofollow` e `Disallow`. Site entregue: JSON-LD `LocalBusiness`.
  - Tudo em script clássico: abre de `file://`.
  - Tira o comentário de documentação do template, que repetia título e descrição dentro do HTML entregue.
- `testar-site.cjs`: Playwright 1.63.0, `file://` a 390 x 844. Confere:
  - console limpo e sem exceção;
  - sem rolagem lateral;
  - todo wa.me igual ao número do pedido;
  - nenhum texto visível abaixo de 11 px;
  - JSON-LD válido;
  - rodapé com link no site entregue e sem rodapé no SAIR;
  - rede: as fontes do Google respondem com CSS vazio (teste determinístico, sem rede), o resto é bloqueado e anotado.
  - Grava um print de página inteira.
- `exportar-sair.cjs --slug <slug> [--dominio x.com.br]`: refaz o site sem home, sem subdomínio da Creat e sem rodapé, acrescenta `LEIA-ME.txt` e gera `dist/<slug>-sair.zip` (fflate 0.8.3).
  - Varre todos os arquivos e o zip relido. Nenhum host da Creat (`CREAT_DOMINIOS`, host de `CREAT_HOME`, de `CREAT_URL_SITES` e do link da prévia, e qualquer host com "creat"). Todo host citado precisa estar na lista de terceiros conhecidos: wa.me, fontes do Google, schema.org, mapa, Instagram, w3.org.
- `lib/`: `comum.cjs` (ajv 8.20.0 com os schemas da T1, presets, args), `pedido.cjs`, `tenant.cjs`, `ia.cjs` (prompt, schema de saída, preços por modelo, custo), `validacao.cjs`.
- `package.json` com versões exatas e sem ranges: `@anthropic-ai/sdk 1.1.0`, `ajv 8.20.0`, `ajv-formats 3.0.1`, `fflate 0.8.3` e `playwright 1.63.0`. O Playwright é o mesmo dos navegadores já instalados no ambiente. As versões foram escolhidas com pelo menos duas semanas de publicação, conferidas no npm em 08/11/2026.
- `scripts/testes/producao.test.mjs` tem 38 testes, sem rede e sem chave. As fixtures ficam em `scripts/testes/fixtures/`:
  - pedido válido em `.txt` e `.json`;
  - 7 pedidos inválidos;
  - pedido com tentativa de injeção no endereço;
  - 4 respostas do modelo: normal, com campos extras, com termos proibidos e com recusa.

#### Decisões registradas
- **Rodapé no SAIR: removido**, em vez de virar texto. Quem encerrou o contrato não carrega propaganda da Creat sem ter pedido. A string "Aberto pela Creat" continua só dentro de `motor/v1/motor.js` (texto de interface, não é link nem domínio). A varredura ignora o código do motor para essa string e para `utm_source=rodape`, que lá é o montador do link e devolve vazio sem home. O teste no navegador prova que o rodapé não aparece.
- **Preço:** o PEDIDO v1 não traz preço, e os preços do preset são exemplo da prévia. No site entregue todo preço vira `null` ("sob consulta"). `servicosNota` é escrita pelo código ("Valores sob consulta: pergunte no WhatsApp da casa..."), fora da IA, para o modelo não ter onde inventar valor.
- **Câmbio obrigatório:** sem `CREAT_CAMBIO` o fluxo para antes de chamar a API (nada é cobrado). Um câmbio padrão seria um número inventado.
- **Fontes do Google no SAIR:** ficam. São de terceiro neutro, não da Creat. Sem internet, o site usa as fontes do sistema e funciona igual.
- **Home do rodapé:** vem da origem do link `previa` do pedido, ou de `CREAT_HOME`.
- **Endereço:** o campo é texto livre. O separador aceita "Rua, número, bairro, cidade-UF, CEP" e variações ("Rua X 120 - Bairro, Cidade/UF 13010000"). Fora disso, rejeita citando `endereco`.

#### Variáveis de ambiente usadas (para o `.env.example` da T10)
`ANTHROPIC_API_KEY`, `CREAT_MODELO`, `CREAT_CAMBIO`, `CREAT_HOME`, `CREAT_URL_SITES` (com `{slug}`), `CREAT_DOMINIOS` (vírgula), `CREAT_SAIDA`, `CREAT_FALLBACK` (0 desliga o fallback do servidor) e `CREAT_IA_FIXTURE` (só teste). Não há nenhum valor no repositório.

#### Como rodar
```
cd projetos/creat-nuvem && npm install            # versões fixadas
npm test                                          # 38 testes, sem rede e sem chave
CREAT_CAMBIO=5.5 node scripts/producao/produzir.mjs --pedido scripts/testes/fixtures/pedido-valido.txt \
  --fixture-ia scripts/testes/fixtures/resposta-modelo.json --saida <pasta temporária>
# produção de verdade: ANTHROPIC_API_KEY (Console) + CREAT_CAMBIO + CREAT_URL_SITES + CREAT_DOMINIOS, sem --fixture-ia
node scripts/producao/validar-tenant.mjs sites/<slug>/tenant.json
node scripts/producao/exportar-sair.cjs --slug <slug> [--dominio dominio-do-cliente.com.br]
```

#### Verificação (comando e saída)
`CREAT_TESTE_TMP=<scratchpad> npm test`:
```
ok 1 - pedido: texto PEDIDO v1 e JSON viram o mesmo objeto e passam no schema
ok 2..8 - pedido inválido falha citando o campo (whatsapp zerado, linha extra cpf, email ausente,
          horarios.sab invertido, endereco sem CEP, ordem trocada, nicho clinica)
ok 9 - produzir --sem-navegador: tenant entregue válido, custo.json no formato Pedido.custo_ia
ok 10..28 - validar-tenant rejeita: whatsapp 5500000000000, avaliação sem origem, ocupacaoFicticia (e aninhada),
          limite, preço texto, horário 25:00, fecha antes de abrir, garantido, ganho, antes e depois, prova social,
          agendamento, procedimento de saúde com preço, chave fora da lista, sem "o dono confirma", exemplo, link, emoji
ok 29 - validar-tenant (CLI): fixtures da T1 com o resultado certo e código de saída
ok 30..33 - IA: dado delimitado e mínimo; campos extras ignorados; termo proibido barra o site; recusa e falta de chave/câmbio
ok 34 - idempotência
ok 35..36 - build-site: prévia noindex/Disallow; entregue com canonical, sitemap, JSON-LD HairSalon; tenant inválido recusado
ok 37 - varredura do SAIR acha domínio da Creat, rodapé viral e host desconhecido
ok 38 - critério 12 de ponta a ponta: fixture -> dist/<slug> que abre de file:// a 390 px, zip do SAIR sem domínio da Creat, custo registrado
# tests 38 · pass 38 · fail 0 · skipped 0
```
Validador direto nos fixtures da T1:
```
$ node scripts/producao/validar-tenant.mjs schema/exemplos/tenant.whatsapp-zerado.invalido.json      -> código 1
  - negocio.whatsapp: número de mentira (5500000000000) é proibido; use o WhatsApp real do negócio
$ ... tenant.avaliacao-sem-origem.invalido.json                                                       -> código 1
  - avaliacoes[0].origem: avaliação sem origem (dono ou cliente_autorizado) é rejeitada: depoimento inventado é proibido
$ ... tenant.ocupacao-ficticia.invalido.json                                                          -> código 1
  - demo.ocupacaoFicticia: proibido: horário "ocupado" inventado não entra no motor (regra dura 1)
$ ... tenant.entregue.valido.json                                                                     -> código 0
$ node scripts/producao/produzir.mjs --pedido scripts/testes/fixtures/pedido-whatsapp-zerado.txt ...  -> código 1
  - whatsapp_negocio: precisa ser só dígitos, 55 + DDD + 8 ou 9 números, e não pode ser 5500000000000 nem começar por 5500
```
Ponta a ponta, com a fixture:
```
[1] pedido validado e tenant parcial do preset: ok (PA-9TQ4HN2X, barbearia, slug barbearia-navalha-teste-campinas)
[2] textos pela IA: ok (fixture (sem rede): claude-sonnet-5-5, 3412+1186 tokens, R$ 0.1028)   <- número da FIXTURE, não é custo de produção
[3] validar-tenant: ok
[4] build-site: ok (17 arquivos em dist/barbearia-navalha-teste-campinas/)
[5] teste headless 390 px: ok (sem rolagem lateral, menor texto 12px, 2 links wa.me/5519999990000, console limpo)
[7] pacote SAIR: ok (18 arquivos no zip, nenhum domínio da Creat; abriu de file:// sem erro, 0 requisições fora das fontes, sem rodapé da Creat)
[6] custo.json e RELATORIO do pedido: ok (R$ 0.1028)
```
Outras verificações:
- **Salão e academia (presets da T8), com `--sem-ia`:** passaram nos 7 passos. Os rituais em `motor/v1/rituais/` vão para o dist.
- **Caminho real do SDK contra um servidor local de mentira** (`ANTHROPIC_BASE_URL`, chave falsa): `POST /v1/messages?beta=true` com `anthropic-beta: server-side-fallback-2026-07-01`, `anthropic-version: 2026-10-21`, `fallbacks: "default"`, `output_config {effort: high, format: json_schema}` e sem `tools`.
- **Print:** o de 390 px foi olhado.
- **Checagens do projeto:** `node scripts/checar.cjs` deu "tudo certo". `grep sk-ant` em `scripts/` voltou vazio.

#### Padrão de entrega
- Build e testes: **ok** (acima).
- Página sem erro de console, 390 px, texto >= 11 px: **ok** no Playwright para os 3 nichos. Alvos de 44 px, teclado e contraste ficam com o motor (T4/T8) e não foram medidos de novo aqui.
- Dependências fixadas: **ok**. As diretas estão com versão exata no `package.json` e as transitivas no `package-lock.json`, que já está versionado. Sem segredo no repositório: **ok**. O `.env.example` é da T10 (variáveis listadas acima).
- Chamada real à API: **não verificado**. Não há chave do Console no ambiente. O formato da requisição foi provado contra o servidor local.
- **Custo real de produção: não verificado.** O R$ 0,1028 que aparece acima é o custo calculado em cima da *fixture* (3412+1186 tokens inventados para o teste) e não deve ser usado como custo por site. A tabela `PRECOS` e o modelo `claude-sonnet-5-5` vêm só do cache da skill `claude-api` (06/10/2026). O custo de verdade só se confirma com a primeira chamada real, conferindo `custo.json` contra a fatura do Console.
- **Qualidade dos textos da IA: não verificado.** Nos testes, os textos vêm da fixture e não do modelo.
- Custo gravado quando a chamada falha (refusal, max_tokens, JSON inválido, modelo fora de `PRECOS`): **ok**. Ver "Ajustes do revisor" abaixo.
- PII fora do git: **ok**. `projetos/creat-nuvem/.gitignore` ignora `sites/`, `pedidos/` e `dist/*` (menos `dist/publico/`, o build público da T10).
- Revisor, QA e segurança: **não verificado** (próximas etapas do fluxo). **A T9 não está pronta** até `qa` e `seguranca` passarem, porque o fluxo trata dado pessoal e entrada não confiável que vai ao modelo.

#### Pendente
- **Primeira produção real (custo e qualidade não verificados):** rodar com `ANTHROPIC_API_KEY` do Console, conferir a qualidade dos textos e o custo real em `custo.json` contra a fatura, e ajustar `PRECOS` em `lib/ia.cjs` se a página de preço mudar. Os preços vêm da skill `claude-api` (cache de 06/10/2026).
- **URL dos sites:** definir `CREAT_URL_SITES`. Sem ela não há canonical nem sitemap, e o RELATORIO avisa. Definir também `CREAT_DOMINIOS` com os domínios reais da Creat.
- **T10:** pôr as variáveis acima no `.env.example`. O `.gitignore` e o `package-lock.json` já foram resolvidos na T9 (ver abaixo). Fica para o Trilho decidir se `dist/publico/` continua versionado ou passa a ser só build.
- **T4 (sugestão):** o comentário do `template.html` cita os marcadores `{{...}}` e por isso é preenchido também. O build já o remove, mas vale trocar a escrita no template.
- **Fase 2:** o `custo.json` já usa o formato `Pedido.custo_ia`. Faltam publicar o `EventoPedido` (etapas) para a sede e nomear o fluxo `pedido-<slug>`, como pede a T6.

#### Ajustes do revisor (rodada 2, 08/11/2026)
1. **O custo não se perde quando a chamada paga falha.** Assim que a resposta chega, e antes de interpretá-la, o `produzir.mjs` grava:
   - `sites/<slug>/resposta-ia.json`, com id, model, stop_reason, stop_details, usage e content (sem chave e sem cabeçalho);
   - um `custo.json` parcial.

   O `custo.json` agora tem `chamadas[]`, o histórico de toda chamada paga do pedido, e `total` (usd, brl, chamadas, sem_preco). `IA.custo()` não lança mais exceção. Quando o modelo cobrado está fora de `PRECOS`, o que pode acontecer com o fallback do servidor, ele devolve `custo_ia: null` com os tokens e o motivo. O site sai normalmente e o RELATORIO do pedido avisa que o custo "não foi calculado".

   Se `lerResposta` falhar (refusal, max_tokens ou JSON inválido), o `producao.json` recebe `status: "ia_falhou"` com o `hashPedido` e a falha, e o processo sai com código 2. Na rodada seguinte do mesmo pedido, o fluxo **para sem chamar a IA** até alguém escolher `--refazer-textos` (nova cobrança, que entra somada no histórico) ou `--sem-ia`.
2. **PII fora do git:** foi criado `projetos/creat-nuvem/.gitignore` com `sites/`, `pedidos/`, `dist/*` (com exceção de `!dist/publico/`, que já era versionado e não tem PII) e `.env*` (com exceção de `!.env.example`). Conferido com `git check-ignore`: nenhum arquivo de `sites/` ou `pedidos/` está no git.
3. **Lockfile:** o `package-lock.json` (lockfileVersion 3, com resolved e integrity em todas as 17 entradas) já está versionado num snapshot WIP. `npm ls --depth=0` bate com as versões exatas do `package.json`.
4. **Custo e qualidade marcados como "não verificado"** no Padrão de entrega. O R$ 0,1028 está identificado como número da fixture.
5. **Testes novos (41 de 41 passam, inclusive o de ponta a ponta com Playwright):**
   - max_tokens: grava custo, resposta e `ia_falhou`; a 2ª rodada para; com `--refazer-textos` são 2 chamadas e R$ 0,2056; a 4ª rodada reaproveita;
   - JSON inválido e recusa gravam o custo;
   - modelo desconhecido gera o site com `custo_ia: null` e os tokens gravados.

   Fixtures novas: `resposta-modelo-max-tokens.json`, `resposta-modelo-desconhecido.json` e `resposta-modelo-json-invalido.json`.

## T10 · autor: Trilho (devops) · Infra, higiene do repositório e consolidação

Pergunta de venda: publicar rápido e sem risco, com dado de cliente fora do repositório. Um comando publica; o mesmo comando se recusa a publicar enquanto faltar link de pagamento.

**Feito**
- `wrangler.toml`: Workers Static Assets, só assets (sem Worker), `compatibility_date = "2026-11-05"`, wrangler fixado em `4.158.0` (última no npm, publicada em 05/11/2026), `not_found_handling = "404-page"`, `html_handling = "auto-trailing-slash"`, `preview_urls = false`. `[build]` roda `checar-placeholders.cjs && montar-publico.cjs`. Sem segredo.
- `scripts/montar-publico.cjs` (novo, ver desvios): monta `dist/publico/` por lista branca (vitrine, prévia, motor, ritual, assets, dados, conteudo, `_headers`) e copia da raiz só `sede/index.html` e, se existir, `sede/estado-publico.json`. Nunca entra `sede/estado.json`, `docs/`, `scripts/`, `schema/`, `marketing/`, `RELATORIO.md`, `.cjs`/`.mjs`, `README.md`, `.env*`. Recalcula os hashes dos scripts inline da sede no `_headers` publicado. Resultado: 65 arquivos, 1159 KB.
- `_headers`: CSP sem script inline na vitrine; Google Fonts, jsDelivr (PostHog fixado e Three.js da sede), PostHog EU, Pixel da Meta e Clarity liberados explicitamente; `frame-src 'self'` e `frame-ancestors 'self'`; `object-src 'none'`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer-when-downgrade`; `X-Frame-Options`, `Permissions-Policy` e HSTS; `X-Robots-Tag: noindex, nofollow` em `/previa/*`. A sede tem CSP própria (`! Content-Security-Policy`) com os 3 scripts inline liberados por hash e `noindex`. `/dados/*` com `Cache-Control: no-cache`, para a regra das 48 h valer.
- `.env.example`: `ANTHROPIC_API_KEY`, `CREAT_MODELO`, `CREAT_CAMBIO`, `CLOUDFLARE_API_TOKEN` sem valores, mais os opcionais que a T9 usa (`CREAT_HOME`, `CREAT_URL_SITES`, `CREAT_DOMINIOS`, `CREAT_FALLBACK`, `CREAT_SAIDA`, `CREAT_IA_FIXTURE`), com o caminho do painel de onde tirar cada chave.
- `.gitignore` (raiz): acrescentei `sites/`, `pedidos/`, `dist/`, `.env`, `.env.*`, `!.env.example`, `.wrangler/`. Não removi nada.
- `README.md`: novos arquivos da sede, estrutura do Porta Aberta, como rodar, verificar e publicar.
- `docs/stack-ferramentas-2026.md` linha 17: "Claude Code (Pro) para construir; Claude API (Console) para produzir", com nota ¹ (fonte, data e preços marcados não verificados).
- `docs/ADR-004-executor-fase2.md`: recomenda GitHub Actions privado disparado por `repository_dispatch` a partir do Worker da Fase 2. Custo R$ 0 até cerca de 250 pedidos por mês e cerca de R$ 0,26 por pedido acima disso. Gatilhos de troca para VPS definidos. Preços e limites com fonte e data, marcados como não verificados na página oficial.
- `docs/CHECKLIST-REPOSITORIO-PRIVADO.md`: organização, transferência, tornar privado, rotação de chaves (Anthropic, Cloudflare, Asaas), ruleset do branch principal, secret scanning e push protection.

**Como verificar (comandos rodados em 08/11/2026)**

| item | status | prova |
|---|---|---|
| CI local `checar-placeholders.cjs` | ok (falha como deve) | `node scripts/checar-placeholders.cjs` → 4 `FALHA` (os 4 marcadores do `checkout.config.js`), código 1. Numa cópia no scratchpad com links válidos de teste: "nenhum marcador aberto", código 0. |
| deploy travado | ok | `wrangler deploy --dry-run` na pasta real: o `[build]` falha com código 1. Na cópia com links válidos: build ok, "Read 84 files from the assets directory", saída do dry-run sem erro. |
| `checar.cjs` | ok | "tudo certo", código 0 |
| `npm test` | ok | `CREAT_TESTE_TMP=<pasta existente> npm test` → 41 testes, 41 passam (a pasta precisa existir, senão `mkdtemp` falha) |
| cabeçalhos servidos | ok | `wrangler dev` local: `/` traz CSP, nosniff, Referrer-Policy; `/previa/` traz `x-robots-tag: noindex, nofollow`; `/sede/` troca a CSP pela da sede; `/sede/estado.json` dá 404 |
| CSP não quebra a vitrine | ok | `verificacao-visual` (4 configurações, `--cdn-local`) em `/`, `/previa/#k=barbearia&n=...`, `/abrir/`, `/obrigado/`, `/bastidores/`, `/termos/`: "Tudo limpo", zero violação |
| CSP com medição ligada | ok | Playwright com IDs falsos válidos e "Aceitar": antes do aceite, só o PostHog/jsDelivr; depois, `fbevents.js` e a tag do Clarity carregam; fetch e imagem para `eu.i.posthog.com`, `eu-assets.i.posthog.com`, `*.clarity.ms`, `c.bing.com` e `www.facebook.com/tr` passam; **0 violações de CSP** |
| sede com CSP por hash | ok, com aviso | `/sede/?marca=Teste&modo=publico` sem violação de CSP; 6 erros 404 de `sede/estado-publico.json`, que não existe até alguém rodar `publicar-estado.cjs` (pendência da T6) |
| sem segredo no repositório | ok | varredura abaixo: 0 achados na árvore e nos 48 commits |
| revisor, QA, Muralha | não verificado | próximas etapas do fluxo |

**Varredura de segredos (08/11/2026, raiz do repositório)**

```
P='sk-ant-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{32,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\$aact_[A-Za-z0-9_]{20,}|(api[_-]?key|secret|token|password|senha)["'"'"']?\s*[:=]\s*["'"'"'][A-Za-z0-9_\-]{24,}["'"'"']'
git grep -nIE --untracked "$P" -- . ':!**/node_modules/**'      # árvore: 0 linhas
git log --all -p --no-color | grep -nE "$P"                    # histórico (48 commits): 0 linhas
git grep -nIE --untracked "ANTHROPIC_API_KEY\s*=\s*\S|CLOUDFLARE_API_TOKEN\s*=\s*\S" -- . ':!**/node_modules/**'
#   só README.md e wrangler.toml, com o texto literal <token> (exemplo de comando)
git ls-files --others --cached --exclude-standard | grep -E '(^|/)\.env($|\.)'   # só .env.example
```
Prova de que o padrão pega chave: `printf 'x sk-ant-api03-AAAA...\nconst token = "abc...12"\n' | grep -cE "$P"` → 2. Padrões cobertos: Anthropic, OpenAI, GitHub, AWS, Slack, Google, chave privada PEM, Asaas (`$aact_`) e atribuição genérica de chave longa. IDs públicos (PostHog `phc_`, Pixel, Clarity) vão ao navegador por desenho; hoje estão no formato de exemplo.

**Pendente**
- `dist/publico/` entrou no git pelos commits automáticos "WIP snapshot" e pelo `!dist/publico/` do `.gitignore` da T9. Decisão do Trilho: `dist/` é saída de build, regenerada no deploy, e fica fora do git, como manda o briefing §16. Falta tirar do índice: `git rm -r --cached projetos/creat-nuvem/dist`. Não rodei porque esta tarefa não faz commit. O comentário do `.gitignore` da T9 ("já versionado") precisa de ajuste pela Forja.
- `sede/estado-publico.json` não é gerado sozinho. Sem ele, a sede pública mostra o estado de espera e o console registra 404. Executor recorrente: ADR-004.
- Se `sede/index.html` mudar, o build já recalcula os hashes no `_headers` publicado e avisa. Copie os novos valores para o `_headers` da fonte, para quem publica em outro host.
- CSP do Pixel e do Clarity testada com stubs, sem os scripts reais (a rede do sandbox bloqueia esses hosts). Quando os IDs reais entrarem, a Muralha confere a aba Console em produção. Os scripts reais podem pedir outros hosts (por exemplo `connect.facebook.net/signals/`, já coberto, ou outro subdomínio do Clarity).
- `compatibility_date` 2026-11-05: o `wrangler dev` 4.158.0 aceitou. Atualize junto com o wrangler.
- Marcos: criar o token da Cloudflare e aprovar o primeiro deploy, que não foi feito.

---

# Seções finais do relatório

## Placeholders ainda abertos (deploy travado até trocar)
Todos em `checkout.config.js`, o único arquivo onde podem existir (`node scripts/checar-placeholders.cjs` → 4 FALHA em 08/11/2026):
- `[LINK_ASAAS_ABERTURA_INAUGURACAO]`: link de pagamento do Asaas, Abertura no preço de inauguração (20 primeiras vagas).
- `[LINK_ASAAS_ABERTURA_PADRAO]`: link de pagamento do Asaas, Abertura no preço padrão.
- `[LINK_CAKTO_BASTIDORES]`: checkout da Cakto do produto Bastidores.
- `[WHATSAPP_SUPORTE_55DDDNUMERO]`: WhatsApp do Suporte Creat, só dígitos (55 + DDD + número).
Também em formato de exemplo, mas sem travar: `posthogChave`, `metaPixel`, `clarity` em `CREAT_MEDICAO`. Ficam desligados, e nenhuma requisição sai. Marcadores de texto que dependem do Marcos: `{{empresa.documento}}`, `{{empresa.endereco}}`, `{{site.url}}` (T3).

## Textos pendentes de REVISAO_JURIDICA_PENDENTE
- `conteudo/termos.md` (renderizado em `/termos/`): MEI como consumidor no art. 49, liberação do SAIR após 7 dias, devolução proporcional no anual, régua de inadimplência até D+60, licença do motor no site exportado. Lista completa no fragmento da T3.
- `conteudo/privacidade.md` (renderizado em `/privacidade/`).
- `scripts/checar.cjs` exige a primeira linha `REVISAO_JURIDICA_PENDENTE` nos dois. Só o Marcos, com advogado, tira a linha.

## Números não verificados
- Custo real da produção por pedido: só há o custo da fixture (R$ 0,1028, tokens inventados). Preços em `scripts/producao/lib/ia.cjs` (Sonnet 5.5 US$ 2 entrada / US$ 10 saída por milhão) vêm do cache da skill `claude-api` (06/10/2026), sem conferência na página oficial (T9 e T10).
- Câmbio R$ 5,50 por US$ (estudo do stack, 06/11/2026); câmbio do euro R$ 6,40 no ADR-004 é estimativa.
- GitHub Actions: 2.000 min/mês grátis, US$ 0,006/min, taxa de plataforma US$ 0,002/min com status incerto. Hetzner CX23 a € 5,99. Tudo vem de busca, não da página oficial (ADR-004).
- Tempo por pedido no executor (5 a 10 min): estimativa, não medido.
- Benchmarks de CPL e metas da calibragem de anúncios: metas "a definir pelo Marcos" (T3).
- Prazo `prazoHoras: 72`: promessa do briefing; vira 48 só depois de medido.
- Escuta do som em aparelho real (T7) e gesto da placa em celular real (T5/T6/T8): não verificados.

## O que depende do Marcos
1. Trocar os 4 marcadores do `checkout.config.js` pelos links reais e pelo número do suporte. Sem isso o deploy não sai.
2. Pôr as chaves públicas de PostHog, Pixel e Clarity em `CREAT_MEDICAO`.
3. Informar CNPJ ou CPF, endereço da Creat.MTT Studio e domínio final. Confirmar o e-mail de contato e a quantidade de posts do Vitrine.
4. Revisão jurídica de termos e privacidade.
5. Metas e regra de parada da calibragem de 16 a 22/11. Decidir se existe recompensa por indicação (R13).
6. Rodar `atualizar-vagas.cjs --confirmar` todo dia, ou aprovar uma tarefa agendada. Sem isso, após 48 h a página cai no preço padrão (fail-closed).
7. Criar a organização, transferir o repositório, torná-lo privado e rotacionar as chaves (`docs/CHECKLIST-REPOSITORIO-PRIVADO.md`).
8. Criar o token da Cloudflare, aprovar o primeiro `wrangler deploy` e, depois, escolher o executor da Fase 2 (ADR-004).
9. Primeira produção real com chave do Console, conferindo custo e qualidade contra a fatura.

## Desvios do briefing registrados
- **T1:** o briefing fala em "outros 5 nichos" na lista de espera, mas cita 4. O schema usa `outro` como quinto valor.
- **T3:** a pigmentação saiu do preset da barbearia, porque a política da Meta trata o tema como procedimento 18+ e o vídeo R1 mostra a tabela. O R13 ficou sem recompensa e sem `utm_content`, à espera da decisão do Marcos e da Muralha.
- **T5:** `pago_pagina` virou `pedido_enviado_pagina`, porque o nome antigo sugeria pagamento confirmado. O schema acompanhou.
- **T6:** sem `?modo`, a sede assume `local` em localhost, `file:` e no artefato do Claude, para não quebrar o modo ao vivo de hoje. Nos outros hosts assume `publico`.
- **T10:** criei `scripts/montar-publico.cjs`, arquivo fora da lista da T10. O motivo: a sede mora fora da pasta do projeto, e `sede/estado.json` não pode ir ao ar. Publicar a pasta inteira levaria `docs/`, `marketing/`, `node_modules/` e `RELATORIO.md`. O `wrangler.toml` aponta para `dist/publico/` (montado a partir da pasta), não para a pasta crua. No `.gitignore` acrescentei também `.env*` e `.wrangler/`.
- **T10 × T9:** o `.gitignore` da T9 mantém `dist/publico/` versionado. A decisão da T10 é que `dist/` fica fora do git (ver pendências da T10).

## Correções do QA · Trilho · 09/11/2026 (rotina de vagas, sede, link da inauguração, referrer)
- **O que fiz:**
  1. **[alto] Preço de inauguração caía em 48 h.** Criei a rotina diária `.github/workflows/rotina-vagas.yml`, que roda às 00:07 de Salvador e também por botão (`workflow_dispatch`). Ela faz quatro passos em ordem: roda `atualizar-vagas.cjs --rotina` (novo dia + carimbo), roda `checar.cjs`, faz commit dos dois JSON e publica com `wrangler@4.158.0 deploy`. Se algum passo falha, abre ou comenta a issue "Rotina de vagas falhou", e o GitHub manda e-mail. As actions estão fixadas por SHA e o Node em 22.12.0. A rotina nasce **desligada** e só roda com a variável `ROTINA_VAGAS_ATIVA=true`. Nada foi publicado. O commit diário também evita que o GitHub desligue o agendamento depois de 60 dias sem atividade.
  2. **[alto] Promessa de acompanhar o próprio pedido na sede.** Fui pela opção 2 do QA (texto honesto), porque o estado ao vivo depende da sessão local da agência e não roda em CI. Mudei três textos. `/obrigado/`: a legenda e o item "O que esperar" agora dizem que a sede é demonstração e que o andamento chega no WhatsApp. `/abrir/` passo 4: idem. `conteudo/termos.md`: tirei o "link de acompanhamento". As cópias em `conteudo/abrir.json`, `conteudo/obrigado.json` e `marketing/whatsapp-scripts.md` acompanharam.
  3. **[médio] 404 do `estado-publico.json`.** Quando o estado real não existe, `montar-publico.cjs` grava um estado de espera válido em `dist/publico/sede/`: `versao 1`, sem fluxo, com a mensagem "A equipe espera o próximo pedido.".
  4. **[médio] Link da inauguração pagável depois do fim.** `atualizar-vagas.cjs` avisa sempre que a inauguração acaba (0 vaga ou `off`) e mostra o caminho para desativar o link no Asaas. Com `--rotina`, sai com código 2 se o link real continuar em `checkout.config.js`. Nesse caso a rotina publica do mesmo jeito (a página já mostra o preço padrão) e falha no fim, para gerar o alerta. O comentário de `checkout.config.js` explica como criar o link com limite de pagamentos e data de encerramento.
  5. **[médio] Nome do negócio vazava no Referer.** `sede/index.html` ganhou `<meta name="referrer" content="no-referrer">`. No `_headers`, o global passou a `strict-origin-when-cross-origin` e `/sede/*` desliga o global (`! Referrer-Policy`) e aplica `no-referrer`. Os hashes da CSP da sede não mudaram, porque a meta não é script.
- **Arquivos:** `.github/workflows/rotina-vagas.yml` (novo), `scripts/atualizar-vagas.cjs`, `scripts/montar-publico.cjs`, `checkout.config.js` (só comentário), `_headers`, `obrigado/index.html`, `abrir/index.html`, `conteudo/termos.md`, `conteudo/abrir.json`, `conteudo/obrigado.json`, `marketing/whatsapp-scripts.md`, `../../sede/index.html`.
- **Como verificar:**
  - `node scripts/checar.cjs` e `npm test` dão 0, os dois verificados.
  - `node scripts/montar-publico.cjs`: depois dele, `dist/publico/sede/estado-publico.json` existe.
  - Sirva `dist/publico` e abra `/sede/index.html?marca=Barbearia%20do%20Ze&modo=publico`. Com o three.js servido pelo `node_modules`, porque o jsDelivr é bloqueado no sandbox, deu zero erro de console, `estado-publico.json` com 200, o texto do estado de espera, e as requisições ao jsDelivr saíram sem Referer.
  - Rotina numa cópia: `node scripts/atualizar-vagas.cjs --raiz <cópia> --rotina` dá 0. Com a inauguração desligada e um link `https://www.asaas.com/...` em `aberturaInauguracao`, dá 2 com o aviso.
  - `vendeu` na última vaga desliga a inauguração e avisa.
- **Pendente (Marcos):**
  - Ligar a rotina. Em GitHub > repositório > Settings > Secrets and variables > Actions, crie dois segredos (`CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`) e a variável `ROTINA_VAGAS_ATIVA=true`. Depois teste uma vez em Actions > Rotina de vagas > Run workflow.
  - Enquanto houver marcador no `checkout.config.js`, o deploy falha de propósito e a rotina abre a issue.
  - Com proteção de branch na `main`, libere o push do `github-actions`.
  - O contador da inauguração só desce com `--vendeu`. A cada pedido pago: `git pull`, `node scripts/atualizar-vagas.cjs --vendeu`, depois commit e push. Próximo passo sugerido: o `produzir.mjs` chamar `--vendeu` sozinho, ou um webhook do Asaas.
  - Criar o link da inauguração no Asaas com quantidade máxima de pagamentos e data de encerramento, e desativá-lo quando a inauguração acabar.
  - Publicar o estado ao vivo da sede (`publicar-estado.cjs` a cada 1 a 2 min, com o id do pedido) continua pendente. Quando existir, os textos de `/obrigado/` e `/abrir/` podem voltar a prometer acompanhamento na sede.
  - Não verificado: a rotina rodando de verdade no GitHub, porque não há segredos e nada foi publicado; o `_headers` aplicado pela Cloudflare, porque só foi conferido o arquivo.

---

## Correções do QA (Pixel, 09/11/2026)

**O que foi feito**
1. **[alto] Rolagem horizontal em /abrir/ no celular.** As colunas do grid agora são `minmax(0,1fr)` (`.grade-pedido`, `.horarios`, `.dia`, `.dia-horas`, `.dia-hora`), os `input[type=time]` têm `min-width:0` e abaixo de 360 px "Abre" e "Fecha" empilham. Resultado medido com emulação mobile (isMobile): Galaxy S9+ e iPhone SE 320/320, iPhone 13 390/390, Pixel 7 412/412 (scrollWidth/viewport), sem erro de console.
2. **[baixo] Nome com 60 caracteres e limite de 40.** `maxlength="40"` no `#nome` e no `#cidade` da home e no `#p-negocio` e `#p-cidade` de /abrir/ (a regra do JS já era 40). Contador agora para em "40 de 40".
3. **[baixo] SRI e CSP.** PostHog carrega com `integrity` sha384 (`posthogIntegridade` em `checkout.config.js`, passado em `carregarScript`). Importmap da sede com chave `integrity` para three.module.js e os 3 addons usados. CSP: `script-src` só libera `cdn.jsdelivr.net/npm/posthog-js@1.447.3/` e `/npm/three@0.160.0/`, nunca o CDN inteiro; hashes dos scripts inline da sede recalculados no `_headers` da fonte. Hashes tirados do tarball oficial do npm (o jsDelivr serve esses arquivos sem alterar).
4. **[alto] Endereço aceito na vitrine e recusado pela produção.** Criei `assets/endereco.js` (UMD), a **regra única** do endereço: a vitrine valida com ela antes do pagamento e `scripts/producao/lib/pedido.cjs#partesEndereco` passou a usar a mesma função. Exige CEP e UF; aceita o prefixo "CEP"/"CEP:" e "cidade/UF" (também UF minúscula grudada na cidade). Mensagens dizem o que falta ("Falta o CEP…", "Falta a sigla do estado…") e o campo mostra o exemplo `Rua das Flores, 120, Centro, Campinas-SP, 13010-000`. Testes novos em `producao.test.mjs`.

**Arquivos tocados**
- `abrir/pedido.css`, `abrir/index.html`, `index.html`, `assets/endereco.js` (novo), `assets/vitrine.js`, `checkout.config.js`, `_headers`, `conteudo/abrir.json`, `scripts/producao/lib/pedido.cjs`, `scripts/testes/producao.test.mjs`
- fora do projeto: `sede/index.html` (importmap com SRI)

**Como verificar**
- `npm test` em `projetos/creat-nuvem`: 42 de 42 passando. `npm run checar`: tudo certo.
- Celular: abrir `/abrir/#plano=vitrine&k=barbearia&n=Barbearia%20do%20Z%C3%A9&c=Campinas` em Playwright com `devices['Galaxy S9+']`, `['iPhone 13']`, `['Pixel 7']` e conferir `document.documentElement.scrollWidth === innerWidth`.
- Endereço: em /abrir/, "Rua das Flores, 120, Centro, Campinas" bloqueia com "Falta o CEP"; "…, Campinas/SP, CEP 13010-000" passa.
- Sede: `node .claude/skills/verificacao-visual/olhar.cjs sede/index.html --cdn-local` sem erro (SRI conferido contra o pacote do npm).

**Pendente**
- Conferir os hashes SRI contra o jsDelivr de verdade antes do deploy (o sandbox não alcança o CDN): `curl -s https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js | openssl dgst -sha384 -binary | base64` deve dar o valor do importmap (idem para os addons e o posthog). Se algum divergir, a sede não carrega o 3D: avaliar copiar o three para o próprio domínio (self-host), que elimina o CDN de vez.
- Rodar `scripts/montar-publico.cjs` de novo para o `dist/publico` levar `assets/endereco.js` e o `_headers` novo.
- `checar-placeholders` segue bloqueando o deploy pelos marcadores de link Cakto e WhatsApp do Suporte (dados do dono, anterior a esta tarefa).
- Detalhe visual visto nos prints, não corrigido aqui: a caixinha "Aberto" de cada dia tem uma sombra em L deslocada que parece um traço solto; vale o designer olhar.

## Correção QA · nome do negócio fora da query string da sede (Órbita, 2026-11-09)

**O que foi feito.** A vitrine (home e `/obrigado/`) passava o nome digitado em `?marca=` ao carregar a sede no iframe, e o nome ia para o servidor/CDN antes de qualquer consentimento (contra a ADR-002). Agora o nome vai no fragmento: `sede/index.html?modo=demo&lite=1#marca=...`. O fragmento não é enviado ao servidor nem no Referer. A sede lê `#marca=` primeiro e mantém `?marca=` só para links feitos à mão. O deep link de agente (`#frontend`) continua igual: hash com `=` não é tratado como id de agente.

**Arquivos tocados.**
- `assets/vitrine.js` (`carregarSede`): `marca` sai da query e vai para `#marca=`.
- `/sede/index.html` (raiz do repo): lê `#marca=` (`HS`) antes de `?marca=`; `startId` ignora hash com `=`; comentário do topo atualizado.
- `_headers`: hash CSP do script inline da sede atualizado (copiado do que `montar-publico.cjs` gerou).
- `dist/publico/` remontado com `node scripts/montar-publico.cjs`.

**Como verificar.** `npm test` (0 falhas). Playwright em 1440x900 servindo `dist/publico/`: digitar "José Pereira Cabeleireiro" em `#nome` e rolar até a sede → a única requisição da sede é `GET /sede/index.html?modo=demo&lite=1`. Nenhuma requisição contém o nome. O iframe fica em `...#marca=Jos%C3%A9%20Pereira%20Cabeleireiro`, o título é "Sede · José Pereira Cabeleireiro", a placa 3D mostra o nome e o console não tem erros. `/sede/index.html?modo=demo&marca=Teste%20Manual#frontend` continua aplicando a marca e abrindo a ficha do Pixel.

**Pendente.** Depois que a pessoa seleciona um agente, a sede troca o hash por `#<agente>` e o `#marca=` sai da URL do iframe. A placa continua certa na sessão, mas um recarregamento manual do iframe voltaria à placa padrão. Isso tem impacto baixo, porque o iframe não é recarregado no fluxo normal. O `/obrigado/` usa a mesma função e não foi percorrido separadamente no navegador.

---

## Correção do QA: mudo da vitrine vale na prévia (Eco, 09/11/2026)

**O que foi feito**
- **[médio] A prévia tocava o som do ritual com "Som desligado".** Em `motor/v1/som.js`, quando o site roda como prévia (`CREAT_SITE.manual`, confirmado por `estado.previa`), o mudo deixa de ficar só em memória e passa a seguir a escolha da vitrine:
  - ao abrir, lê `CreatSom.mudo` da janela-mãe (mesma origem; vale até sem localStorage) e, sem mãe, `localStorage['creat:som']`;
  - acompanha o evento `storage` da chave `creat:som` e o `CustomEvent('creat:som')` da janela-mãe. Ao silenciar, suspende o AudioContext; o ouvinte na mãe sai no `pagehide`, para não ficar órfão quando a prévia recarrega;
  - o botão de som da prévia grava em `creat:som`, e a vitrine atualiza o rótulo pelo `storage`. Sem localStorage, chama `parent.CreatSom.silenciar()` direto.
- Sites de cliente publicados não mudam: continuam em `site:<slug>:som`, e o mudo da vitrine não vaza para eles.
- `dist/publico` montado de novo (`scripts/montar-publico.cjs`).

**Arquivos tocados**
- `motor/v1/som.js` (e a cópia em `dist/publico/motor/v1/som.js`)

**Como verificar**
- Na home, tocar em "Som ligado" para ficar "Som desligado". Depois abrir a prévia de Barbearia: no iframe, `CreatMotorSom.mudo === true` e `#alternar-som` com `aria-pressed="false"`. Gesto + `ritual:afiada`/`ritual:passada` não criam fonte de som; só conta a amostra muda de destrave, que é sempre silenciosa.
- Com a prévia aberta, `CreatSom.silenciar(false)` na mãe faz a prévia passar a `mudo === false`, e o `tiiing` toca (8 fontes). O botão da prévia grava `creat:som=off`, e a vitrine passa a "Som desligado".
- Link direto `previa/#k=barbearia&n=Teste` no mesmo navegador, com `creat:som=off`, abre mudo.
- Teste automatizado com Playwright (servidor local, contagem de `createOscillator`/`createBufferSource`): todos os passos acima passaram, sem erro de console. `npm test`: 42 de 42.

**Pendente**
- Não testei em Safari/iOS de verdade. O caminho com localStorage bloqueado (modo privado antigo) só foi conferido por leitura do código.

## Correção QA · servidor da sede e trava do --destino (Forja, 2026-11-09)

**O que foi feito.**
- `sede/servidor.cjs`: escuta só em `127.0.0.1` por padrão (`HOST=0.0.0.0` abre para a rede de propósito e imprime um aviso). Serve só uma lista branca: `/`, `/index.html`, `/estado.json` (da memória) e `/estado-publico.json` se existir. O resto dá 404, inclusive `servidor.cjs` e `publicar-estado.cjs`. URL malformada (`/%E0%A4%A`) devolve 400 e o processo continua no ar. A checagem de pasta usa `path.relative` em vez de `startsWith`. Só aceita GET e HEAD (os outros dão 405) e manda `nosniff`.
- `scripts/producao/build-site.cjs`: nova `checarDestino` roda antes do `rm -rf`. Recusa `--destino` sem valor e recusa a raiz do disco, a home, o cwd, a raiz do projeto, a pasta de saída (`--saida`/`CREAT_SAIDA`), `sites/` ou um pai de qualquer uma delas. Também recusa qualquer coisa dentro de `sites/`, um symlink ou arquivo e uma pasta com arquivos que não seja um build anterior (o marcador é `tenant.json` + `index.html` + `motor/v1/`). Pasta nova, pasta vazia e rebuild por cima de um build continuam funcionando. A recusa sai com código 1 e cita `--destino`.

**Arquivos tocados.** `/sede/servidor.cjs` (raiz do repo), `scripts/producao/build-site.cjs`, `scripts/producao/produzir.mjs` (passa `saida` ao `buildSite`), `scripts/testes/producao.test.mjs` (novo teste "build-site recusa --destino perigoso e não apaga nada").

**Como verificar.**
- `npm test` em `projetos/creat-nuvem`: 43 de 43 passando.
- Para a sede, rode `node sede/servidor.cjs 8123` e depois `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8123<rota>`. Resultado esperado: `/` e `/estado.json` dão 200, `/servidor.cjs` dá 404, `/%E0%A4%A` dá 400 (e uma requisição seguinte para `/` ainda dá 200) e `/../CLAUDE.md` dá 404. O log mostra `http://127.0.0.1:8123`.
- `node scripts/producao/build-site.cjs --tenant <t.json> --destino .` termina com código 1 e a mensagem "recusado". Nada é apagado.

**Pendente.**
- `projetos/loja/produtos/agencia/sede/servidor.cjs` (cópia do pacote à venda) já escuta em loopback e trata URL malformada. Mas ainda serve qualquer arquivo de dentro de `sede/`, e dá para aplicar a mesma lista branca se o pacote só precisar da página e do estado.
- `exportar-sair.cjs` passa pela mesma trava, mas não passa `saida`. A pasta `<slug>-sair/<slug>` fica protegida pelo marcador.

---

## Correção do QA: contagem de dados do pedido unificada (Verbo, 09/11/2026)

**O que foi feito**
- **[baixo] "5 dados" e "4 dados" no mesmo formulário.** Agora a regra é uma só em todo texto público: o relógio do prazo começa com **4 dados do pedido** (nome do negócio, WhatsApp que recebe os pedidos, endereço e horário). O nome do responsável e o e-mail aparecem como campos de contato e recibo que **não mudam o prazo**.
- A meta description de `/abrir/` deixou de contar campos: "Veja o total antes de pagar, informe WhatsApp, endereço e horário e pague a Abertura por Pix ou cartão. Mensalidade só com o site no ar." (136 caracteres). "Sem fidelidade" saiu para caber em 155; a informação continua na página e nos termos.
- O texto de abertura dos campos e o bloco do prazo em `/abrir/` agora listam os 4 dados e explicam o papel de nome e e-mail.
- O FAQ "E se passar do prazo?" (home e `faq.json`), os termos (seção de prazo) e as respostas R3 e R5 do WhatsApp foram alinhados com a mesma redação.
- `dist/publico/` remontado com `node scripts/montar-publico.cjs`.

**Arquivos tocados**
- `conteudo/abrir.json`, `abrir/index.html`
- `conteudo/faq.json`, `index.html` (FAQ estático)
- `conteudo/termos.md`
- `marketing/whatsapp-scripts.md`
- `dist/publico/` (cópia montada)

**Como verificar**
- `grep -rn "5 dados" --include=*.html --include=*.json --include=*.md . | grep -v node_modules` não acha nada em texto público.
- Abrir `/abrir/`: a nota abaixo de "Os dados do seu negócio" e o bloco do prazo citam os mesmos 4 dados; a meta description não fala em número de campos.
- Home, FAQ "E se passar do prazo?", e `/termos/`: mesma lista de 4 dados e a frase sobre nome e e-mail.
- `npm test`: 43 de 43. `node scripts/checar.cjs`: tudo certo.

**Pendente**
- O texto dos termos mudou só para esclarecer (nenhuma obrigação nova). Mesmo assim, ele precisa de revisão jurídica antes de publicar. O jurídico também precisa decidir se a mudança pede `termos-v2` ou se pode continuar como `termos-v1`.
- As respostas rápidas já cadastradas no WhatsApp Business precisam ser trocadas à mão pelas novas R3 e R5.
- Não percorri `/abrir/` no navegador nem rodei `verificacao-visual`. Só mudou texto, sem alterar layout; o QA deve confirmar se o parágrafo maior dos campos quebra bem no celular.
