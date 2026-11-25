# Direção de arte · Porta Aberta (vitrine da Creat Nuvem)

T2 · Paleta · 08/11/2026. Fonte da verdade visual para T4, T5, T6, T7 e T8. Tokens em `assets/tokens.css`, componentes em `assets/vitrine.css`, desenhos em `assets/svg/`.

**Como isto vende:** a placa é a pergunta de venda transformada em gesto. O dono de negócio vê o próprio negócio "fechado" para a internet, puxa a placa com o polegar e ela vira ABERTO com o nome dele escrito em giz. O desejo de ver o próprio site nasce desse segundo, antes de qualquer texto de venda. Todo o resto da página fica calmo para não competir com ele.

## 1. Ficha

```
Conceito: A Porta da Ilha. A vitrine é a porta da loja do visitante, vista do lado de fora:
          vidro de noite, placa de madeira pendurada por correntinha, nome escrito em giz.
          Herda a loja (céu da ilha, papel, nanquim, sol, sombra dura) porque a sede 3D
          é a mesma ilha, e o cliente vai vê-la depois com o nome dele na fachada.
Momento-assinatura: no hero, a placa FECHADO presa por correntinha balança 2 graus
          (pêndulo de 3,2 s). Enquanto o visitante digita, as letras do nome aparecem em giz
          na borda. Ao arrastar a placa para baixo (mais de 40% da altura) ou tocar em
          "Abrir meu negócio", ela gira com mola em 600 ms (comprime 4%, estica 3%), mostra
          o verso de madeira com a nuvem queimada no meio do giro e para em ABERTO, com o
          nome em giz na lousa. Sininho de porta (T7). Depois, a prévia sobe.
Layout:   celular: título, placa, subtítulo, campo, chips, botão (a placa já está na 1ª tela
          a 390 x 844). Desktop: título e formulário à esquerda, porta de vidro com a placa
          à direita, pendurada no topo do hero.
Ousadia:  só uma, a placa. Nada mais na página gira, quica ou brilha sozinho.
```

### O mundo da porta (materiais como conteúdo, não enfeite)
| material | onde aparece | token |
|---|---|---|
| madeira (3 tons + veio) | face FECHADO, moldura da lousa, verso | `--madeira` `--madeira-clara` `--madeira-veio` `--madeira-sombra` |
| correntinha e prego | prende a placa; é o pivô do balanço | `--corrente` `--corrente-brilho` |
| lousa e giz | face ABERTO, nome do negócio, sublinhado | `--lousa` `--giz` `--giz-apagado` |
| vidro de noite | porta atrás da placa, barra da prévia, janela da sede, chamada final | `--vidro` `--vidro-reflexo` `--vidro-luz` |
| céu, papel, nanquim, sol (loja) | página inteira | `--ceu` `--papel` `--fundo` `--tinta` `--sol` |

Regra do `--sol`: é a única cor de ação. Só o botão principal de cada tela, o cartão recomendado (Vitrine) e a palavra ABERTO usam amarelo. O banner de consentimento não usa amarelo em nenhum dos dois botões (escolha livre, mesmo destaque).

## 2. Tipografia

Somente Google Fonts (a CSP precisa liberar `fonts.googleapis.com` em `style-src` e `fonts.gstatic.com` em `font-src`):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;800&family=JetBrains+Mono:wght@500&family=Lilita+One&display=swap">
```

| papel | fonte | uso |
|---|---|---|
| display (`--f-display`) | Lilita One 400 | H1, H2, H3, preço, FECHADO/ABERTO, letreiro. Nunca em parágrafo. |
| texto (`--f-texto`) | Figtree 400/600/800 | corpo, rótulos (800), botões (800), nome em giz na placa (800) |
| dado (`--f-dado`) | JetBrains Mono 500 | olho de seção, selos ("recomendado", "exemplo", "Demonstração"), contadores, "avise-me" |

Escala (390 px → 1280 px, todos em tokens):

| token | valor | uso |
|---|---|---|
| `--t-h1` | clamp(40px … 72px) | só o H1 do hero, `max-width: 14ch`, `text-wrap: balance` |
| `--t-h2` | clamp(32px … 48px) | títulos de seção |
| `--t-h3` | clamp(22px … 28px) | cartões, passos |
| `--t-preco` | clamp(40px … 52px) | valores em reais |
| `--t-placa` | clamp(44px … 88px) | FECHADO/ABERTO se forem desenhados em HTML |
| `--t-lead` | clamp(18px … 21px) | subtítulo |
| `--t-corpo` | 17px | texto corrido, linha de 65 caracteres (`--medida`) |
| `--t-menor` | 15px | listas densas, rodapé |
| `--t-nota` | 14px | ajudas de campo, legendas |
| `--t-micro` | 12px | só rótulos em mono; nada abaixo disso (aceite pede ≥ 11 px) |

## 3. Grid e espaçamento

- Régua da loja: `--r1..--r7` = 4, 8, 12, 16, 24, 40, 72 px (aliases `--esp-1..7`). Seções: `--secao` (56 → 104 px).
- Container `.cx`: até 1180 px, calha de 16 px (respeita `safe-area`).
- Celular primeiro: coluna única a 390 px. 720 px: formulários e preços em 2 colunas. 1000 px: hero em 2 colunas (`"cabeca placa" / "corpo placa"`), passos em 4, preços em 3.
- Marcação do hero esperada por `vitrine.css` (T5): `.heroi > .cx > .heroi-cabeca (olho + h1) + .palco-placa (.porta + ponto de montagem da placa) + .heroi-corpo (sub + form.abrir)`. O `.palco-placa` reserva a altura (250 a 320 px no celular, 520 px no desktop) para não haver salto quando o JS montar a placa.
- Alvos: `--alvo` 44 px (chips, links da barra, rodapé, "avise-me"); campo `--campo-altura` 56 px com `label` visível acima; botões 48 px (56 px no `.btn-g`).
- Raios: `--raio` 18 (cartões), `--raio-campo` 14, `--raio-p` 12, `--raio-pilula` (botões e chips), `--raio-placa` 22. Sombra sempre dura: `--sombra-p` 3 px, `--sombra` 4 px, `--sombra-g` 6 px (placa, janela da sede, cartão recomendado). Nunca sombra borrada.

## 4. Componentes de `vitrine.css`

| componente | classe | nota |
|---|---|---|
| barra | `.barra`, `.marca`, `.barra-links`, `.barra-zap` | links quebram para 2ª linha no celular; sem link de Bastidores |
| hero | `.heroi`, `.heroi-cabeca`, `.palco-placa`, `.porta`, `.heroi-corpo` | `.porta` é o vidro de noite atrás da placa |
| formulário | `.abrir`, `.campo` (+ `data-estado="erro|ok"`, `.ajuda`, `.erro`), `.contador-giz` | campo de 56 px, label visível |
| chips de nicho | `fieldset.chips > label.chip > input[type=radio]`; `button.chip.chip-avise` | radio nativo invisível sobre o chip inteiro; "avise-me" é tracejado e escreve o rótulo sozinho |
| prévia | `.previa`, `.previa-topo`, `.rotulo-previa`, `iframe`, `.previa-base` | barra inferior fixa de 72 px com 2 botões; `body.com-previa` esconde o WhatsApp flutuante |
| teste de verdade | `.teste`, `.linha-campos`, `.nota-aparelho`, `.celular-desenho` | |
| como funciona | `ol.passos`, `.de-verdade` | numeração real (ordem do processo) |
| preços | `.precos-grade`, `.cartao-preco(.abertura|.recomendado)`, `.selo`, `.preco`, `.vagas`, `.lista.inclui`, `.lista.nao-inclui`, `.rotulo-lista`, `ol.contrato`, `.precisa` | botão desativado: `.btn[disabled]` tracejado com texto "Link de pagamento em configuração" |
| sede | `.janela-sede`, `.ver-ao-vivo`, `.selo-demo`, `.sede-grade` | moldura de vidro de noite; "Demonstração" sempre visível no modo demo |
| prova | `.prova-lista` | só renderiza com item `autorizadoEm` |
| perguntas | `.faq details/summary/.resp` | resumo de 56 px |
| chamada final | `.chamada .painel` | vidro de noite com giz |
| rodapé | `.rodape`, `.discreto` | link de Bastidores discreto, mas com alvo de 44 px |
| WhatsApp flutuante | `.btn.zap-flutuante` | some com a prévia aberta e com o consentimento na tela, para não cobrir o CTA |
| consentimento | `.consentimento`, `.botoes` | Aceitar e Recusar com a mesma classe, mesmo tamanho e mesma cor |
| carregamento | `.carregando`, `.placa-mini`, `.giz-pontos`, `.esqueleto` | placa pequena balançando + "Abrindo a porta..." em vez de tela branca |
| aviso | `.aviso.on` | sobe acima da barra da prévia quando ela está aberta |
| utilitários | `.so-leitor`, `.exemplo`, `.olho`, `.painel`, `.link-config` | `.exemplo` rotula todo valor de exemplo (regra 2) |

## 5. Desenhos (`assets/svg/`)

Traço de desenho animado: contorno de nanquim 4 a 5 px, cores chapadas, 3 tons (luz, base, sombra), sombra dura deslocada. Sem scripts, com `<title>` e `<desc>` ligados por `aria-labelledby`. Cores via classes prefixadas (`pl-`, `le-`, `rb-`, `rs-`, `ra-`) que leem os tokens com valor de reserva, então funcionam como `<img>` e mudam de tema quando embutidos no HTML. **Para a placa e o letreiro, embutir o SVG no HTML** (o texto usa Lilita One e Figtree da página; como `<img>` cai na fonte de reserva).

| arquivo | ids para animação | observação |
|---|---|---|
| `placa.svg` (330 x 300) | `corrente`, `corrente-esq`, `corrente-dir`, `corrente-*-elo-N`, `argola-esq/dir`, `prego`, `face-fechado`, `palavra-fechado` | composição estática completa: fallback sem JS e pôster. Pivô do balanço: o prego, em (160, 22) = `transform-origin: 48.5% 7.3%` |
| `corrente.svg` (330 x 112) | os mesmos de corrente | para a T6 separar corrente (fica) da tábua (gira) |
| `placa-fechado.svg` (330 x 200) | `face-fechado`, `fechado-tabua`, `fechado-veios`, `parafusos-fechado`, `palavra-fechado` | argolas da corrente em (70, 10) e (250, 10) do quadro |
| `placa-aberto.svg` (330 x 200) | `face-aberto`, `lousa`, `palavra-aberto`, `sublinhado-giz`, `placa-nome`, `poeira-giz`, `giz-bastao` | `#placa-nome` é um `<text>` com `data-max-caracteres="28"`; a T6 troca o `textContent` (nunca `innerHTML`) e reduz `font-size` acima de 16 caracteres. Filtro `#pl-filtro-giz` dá o grão do giz |
| `placa-verso.svg` (330 x 200) | `face-verso`, `marca-queimada` | mostrado no meio do giro (90°); nuvem da Creat queimada na madeira |
| `letreiro.svg` (660 x 230) | `letreiro-nome`, `letreiro-legenda`, `tabua-letreiro`, `lampada-esq/dir`, `luz-esq/dir` | para `/obrigado/` e anúncios; legenda "ABERTO PELA CREAT NUVEM", igual à placa da sede |
| `ritual-barbearia.svg` (200) | `couro`, `couro-tira`, `couro-costura`, `couro-argola`, `couro-alca`, `navalha`, `navalha-cabo`, `navalha-lamina`, `navalha-fio`, `navalha-pino`, `brilhos`, `brilho-1..3` | afiar: `#navalha` desliza em X sobre `#couro`; brilhos piscam no fim |
| `ritual-salao.svg` (200) | `dedo`, `dedo-pele`, `dedo-dobra`, `unha`, `unha-base`, `esmalte`, `esmalte-preenchimento`, `esmalte-reflexo`, `pincel`, `pincel-cabo`, `pincel-cerdas`, `pincel-gota`, `frasco`, `frasco-vidro`, `frasco-liquido`, `frasco-tampa` | pincelar: `#esmalte-preenchimento` cresce em `scaleY` de baixo para cima (recortado por `#rs-clip-unha`) enquanto `#pincel` desce. Pele em `var(--pele, #F2C7A5)` para o preset trocar |
| `ritual-academia.svg` (200) | `chao`, `conjunto-barra`, `barra`, `barra-recartilhado`, `anilha-esq/dir`, `anilha-*-25`, `anilha-*-10`, `presilha-esq/dir`, `poeira`, `poeira-1..3` | levantar: `#conjunto-barra` sobe em Y com comprimir e esticar; `#poeira` sai do chão |

Mapeamento com o contrato da T1 (`ritual` do preset): `'navalha'` → `ritual-barbearia.svg`, `'esmalte'` → `ritual-salao.svg`, `'barra'` → `ritual-academia.svg`. O `paletas:[3 × cores]` do preset segue a ordem 1, 2, 3 desta ficha (`p=1..3` no fragmento).

Os rituais usam `var(--n-destaque)` na cor de destaque: dentro de um elemento com `data-paleta="academia-2"`, as anilhas ficam azuis sozinhas. Ao embutir dois SVGs iguais na mesma página, prefixe os ids (`clipPath` e `filter` repetidos são idênticos, mas a T6/T8 devem evitar duplicar).

## 6. Movimento

| quando | o quê | duração e curva | motivo |
|---|---|---|---|
| repouso | placa balança ±2° em torno do prego | `--duracao-balanco` 3,2 s, `--curva-balanco`, infinito | convida a mexer (encantar) |
| digitando | letra do nome aparece em giz na borda | `--giz-por-letra` 45 ms por letra | responde ao visitante |
| arrastar | placa acompanha o dedo até 40% da altura, depois solta | 1:1 com o dedo, `touch-action:none` só na placa | gesto com o polegar |
| abrir | giro em Y de 0 a 180°, comprime 4% em 0–15%, estica 3% em 60–80% | `--duracao-giro` 600 ms, `--curva-mola` | o momento-assinatura |
| depois do giro | prévia sobe de baixo | `--duracao-longa` 700 ms, `--curva-entrada` | orienta: o site veio da placa |
| botões | afunda 3 px ao tocar, sobe 1 px no hover | `--duracao-curta` 140 ms, `--curva-saida` | resposta |
| carregamento | placa mini balança | 3,2 s | nunca tela branca |

Só `transform` e `opacity` animam (60 fps sem WebGL). Pausar o balanço com `document.hidden`.

**`prefers-reduced-motion: reduce`:** os tokens zeram sozinhos (`--balanco-graus: 0deg`, `--duracao-giro: 1ms`, `--giz-por-letra: 0ms`). A placa fica parada; abrir vira crossfade de 200 ms entre FECHADO e ABERTO, sem giro e sem som; a prévia aparece sem subir; `scroll-behavior` volta a `auto`.

## 7. Tema escuro desenhado: "vidro de noite"

Não é inversão: é a mesma loja vista pela vitrine à noite. O céu vira azul de noite (`#1D2552`, aprovado na loja), o papel vira o cartão iluminado por dentro, o nanquim do contorno fica ainda mais escuro (`#05061A`) para os desenhos continuarem "recortados", a madeira escurece um tom e o giz esfria. O `--sol` fica mais claro (`#FFD25E`) para manter a luz de vitrine. As letras pintadas da placa e do letreiro usam `--sol-tinta` (sempre escuro), porque tinta na madeira não muda de cor à noite.

Ativação: `prefers-color-scheme` por padrão; `data-tema="claro"` ou `data-tema="escuro"` no `<html>` força o tema (o seletor de tema da T5 grava isso).

## 8. Contraste medido (WCAG 2.x, razão calculada pela fórmula de luminância relativa)

Critério: texto normal ≥ 4,5; texto grande (≥ 24 px, ou ≥ 18,66 px negrito) ≥ 3. Script de cálculo usado: fórmula sRGB → luminância relativa, (L1 + 0,05) / (L2 + 0,05).

### 8.1 Vitrine

| tema | uso | par | cores | razão | mínimo | resultado |
|---|---|---|---|---|---|---|
| claro | texto do corpo | `--tinta` sobre `--fundo` | #1E1B2E / #FBF6EA | 15.56 | 4.5 | passa |
| claro | texto em cartão | `--tinta` sobre `--papel` | #1E1B2E / #FFFDF6 | 16.49 | 4.5 | passa |
| claro | texto no hero e barra | `--tinta` sobre `--ceu` | #1E1B2E / #CDEBFF | 13.52 | 4.5 | passa |
| claro | texto secundário | `--apagado` sobre `--fundo` | #5E5974 / #FBF6EA | 6.17 | 4.5 | passa |
| claro | secundário em cartão | `--apagado` sobre `--papel` | #5E5974 / #FFFDF6 | 6.54 | 4.5 | passa |
| claro | secundário no hero | `--apagado` sobre `--ceu` | #5E5974 / #CDEBFF | 5.36 | 4.5 | passa |
| claro | rótulo do botão principal | `--sol-tinta` sobre `--sol` | #1E1B2E / #FFC93C | 10.93 | 4.5 | passa |
| claro | erro de campo / link em configuração | `--alerta` sobre `--papel` | #963208 / #FFFDF6 | 7.49 | 4.5 | passa |
| claro | mensagem de sucesso | `--ok` sobre `--papel` | #1F6B43 / #FFFDF6 | 6.36 | 4.5 | passa |
| claro | FECHADO na madeira (texto grande) | `--sol-tinta` sobre `--madeira` | #1E1B2E / #D39A5B | 6.83 | 3 | passa |
| claro | ABERTO na lousa (texto grande) | `--sol` sobre `--lousa` | #FFC93C / #22322D | 8.75 | 3 | passa |
| claro | nome em giz | `--giz` sobre `--lousa` | #F4F1E6 / #22322D | 11.89 | 4.5 | passa |
| claro | texto sobre o vidro de noite | `--giz` sobre `--vidro` | #F4F1E6 / #13213A | 14.22 | 4.5 | passa |
| escuro | texto do corpo | `--tinta` sobre `--fundo` | #F4F1FF / #141A3C | 15.19 | 4.5 | passa |
| escuro | texto em cartão | `--tinta` sobre `--papel` | #F4F1FF / #2A3062 | 11.12 | 4.5 | passa |
| escuro | texto no hero e barra | `--tinta` sobre `--ceu` | #F4F1FF / #1D2552 | 13.12 | 4.5 | passa |
| escuro | texto secundário | `--apagado` sobre `--fundo` | #C4C0E6 / #141A3C | 9.68 | 4.5 | passa |
| escuro | secundário em cartão | `--apagado` sobre `--papel` | #C4C0E6 / #2A3062 | 7.09 | 4.5 | passa |
| escuro | secundário no hero | `--apagado` sobre `--ceu` | #C4C0E6 / #1D2552 | 8.36 | 4.5 | passa |
| escuro | rótulo do botão principal | `--sol-tinta` sobre `--sol` | #1E1B2E / #FFD25E | 11.69 | 4.5 | passa |
| escuro | erro de campo / link em configuração | `--alerta` sobre `--papel` | #FFB27A / #2A3062 | 7.01 | 4.5 | passa |
| escuro | mensagem de sucesso | `--ok` sobre `--papel` | #7FD9A3 / #2A3062 | 7.28 | 4.5 | passa |
| escuro | FECHADO na madeira (texto grande) | `--sol-tinta` sobre `--madeira` | #1E1B2E / #B9824A | 5.08 | 3 | passa |
| escuro | ABERTO na lousa (texto grande) | `--sol` sobre `--lousa` | #FFD25E / #1A2824 | 10.66 | 3 | passa |
| escuro | nome em giz | `--giz` sobre `--lousa` | #EDEAE0 / #1A2824 | 12.71 | 4.5 | passa |
| escuro | texto sobre o vidro de noite | `--giz` sobre `--vidro` | #EDEAE0 / #0B1428 | 15.24 | 4.5 | passa |

### 8.2 Nove paletas de nicho (3 por nicho, claro e escuro)

Cada paleta tem 6 papéis. Pares medidos: texto sobre fundo, texto sobre superfície, apoio (texto secundário) sobre fundo, destaque sobre fundo (usado também como texto, por isso medido a 4,5) e sobre-destaque (rótulo do botão) sobre destaque. **Todas as 18 combinações passam AA para texto normal em todos os pares**, mais rígido que o pedido (grande ≥ 3).

Nomes das variáveis (estáveis; T4 e T8 usam estes): `--p-<nicho>-<n>-<papel>` para o claro e `--p-<nicho>-<n>-escuro-<papel>` para o escuro, com `<papel>` em `fundo`, `superficie`, `texto`, `apoio`, `destaque`, `sobre-destaque`. Atalho: `data-paleta="salao-2"` em qualquer elemento expõe `--n-fundo`, `--n-superficie`, `--n-texto`, `--n-apoio`, `--n-destaque`, `--n-sobre-destaque` já resolvidos para o tema atual.

Mapeamento para o `TenantConfig.cores` (T1/T4): `fundo` → `cores.fundo`, `texto` → `cores.texto`, `destaque` → `cores.destaque`, `apoio` → `cores.apoio`, usando os valores do tema claro; o motor aplica o escuro pelo id da paleta (`p=2` no fragmento → `<nicho>-2`). Paleta personalizada de cliente real precisa passar pela mesma medição antes de entrar.

Os nomes vêm do mundo de cada nicho: barbearia (couro e latão do Fio no Couro, o poste listrado, a lousa da tabela de preços), salão (vidrinho de esmalte, toalha de sálvia, pó compacto), academia (as cores oficiais das anilhas olímpicas: 25 kg vermelha, 20 kg azul, 15 kg amarela).

#### barbearia-1 · Fio no Couro (couro cru, latão, aço fosco)

| tema | fundo | superfície | texto | apoio | destaque | sobre-destaque |
|---|---|---|---|---|---|---|
| claro | #EFDCC0 | #F8EEDD | #1F1612 | #5A4232 | #7A4E1D | #FFF6E6 |
| escuro | #1F1612 | #2B201A | #E9EFE6 | #C9BBA8 | #C9995A | #1F1612 |

| tema | texto/fundo | texto/superfície | apoio/fundo | destaque/fundo | sobre-destaque/destaque | resultado |
|---|---|---|---|---|---|---|
| claro | 13.26 | 15.46 | 6.93 | 5.34 | 6.67 | AA texto normal em todos os pares |
| escuro | 15.19 | 13.56 | 9.44 | 6.93 | 6.93 | AA texto normal em todos os pares |

#### barbearia-2 · Poste (o poste listrado: vermelho, branco, azul-marinho)

| tema | fundo | superfície | texto | apoio | destaque | sobre-destaque |
|---|---|---|---|---|---|---|
| claro | #F7F4EF | #FFFFFF | #14213D | #46506A | #B3261E | #FFFFFF |
| escuro | #0F1729 | #18223A | #F2EEE8 | #BFC5D4 | #FF6B5E | #0F1729 |

| tema | texto/fundo | texto/superfície | apoio/fundo | destaque/fundo | sobre-destaque/destaque | resultado |
|---|---|---|---|---|---|---|
| claro | 14.56 | 15.97 | 7.32 | 5.96 | 6.54 | AA texto normal em todos os pares |
| escuro | 15.47 | 13.67 | 10.34 | 6.40 | 6.40 | AA texto normal em todos os pares |

#### barbearia-3 · Lousa (lousa da tabela de preços, giz, latão)

| tema | fundo | superfície | texto | apoio | destaque | sobre-destaque |
|---|---|---|---|---|---|---|
| claro | #E8EEEA | #F5F8F5 | #1B2D28 | #4A5C55 | #7C5A1E | #FFFFFF |
| escuro | #1B2D28 | #233932 | #EEF2EA | #B9C7BF | #E0B76A | #1B2D28 |

| tema | texto/fundo | texto/superfície | apoio/fundo | destaque/fundo | sobre-destaque/destaque | resultado |
|---|---|---|---|---|---|---|
| claro | 12.29 | 13.51 | 6.04 | 5.35 | 6.29 | AA texto normal em todos os pares |
| escuro | 12.75 | 10.88 | 8.25 | 7.68 | 7.68 | AA texto normal em todos os pares |

#### salao-1 · Esmalte cereja (vidrinho de esmalte vermelho, toalha branca)

| tema | fundo | superfície | texto | apoio | destaque | sobre-destaque |
|---|---|---|---|---|---|---|
| claro | #FBF1EE | #FFFFFF | #2A1418 | #6A4A50 | #A8123A | #FFFFFF |
| escuro | #1E1013 | #2A171C | #F8E9EC | #D9BEC4 | #FF7A98 | #1E1013 |

| tema | texto/fundo | texto/superfície | apoio/fundo | destaque/fundo | sobre-destaque/destaque | resultado |
|---|---|---|---|---|---|---|
| claro | 15.61 | 17.33 | 6.99 | 6.73 | 7.47 | AA texto normal em todos os pares |
| escuro | 15.68 | 14.43 | 10.64 | 7.46 | 7.46 | AA texto normal em todos os pares |

#### salao-2 · Sálvia (toalha verde, folha, porcelana)

| tema | fundo | superfície | texto | apoio | destaque | sobre-destaque |
|---|---|---|---|---|---|---|
| claro | #EEF2EA | #FAFCF8 | #1D2A22 | #4C5C51 | #3A644A | #FFFFFF |
| escuro | #141C17 | #1D2821 | #E7EFE6 | #B8C6BB | #8FC79F | #141C17 |

| tema | texto/fundo | texto/superfície | apoio/fundo | destaque/fundo | sobre-destaque/destaque | resultado |
|---|---|---|---|---|---|---|
| claro | 13.17 | 14.46 | 6.26 | 5.97 | 6.77 | AA texto normal em todos os pares |
| escuro | 14.80 | 12.98 | 9.79 | 8.97 | 8.97 | AA texto normal em todos os pares |

#### salao-3 · Base nude (pó compacto, tampa dourada, espelho)

| tema | fundo | superfície | texto | apoio | destaque | sobre-destaque |
|---|---|---|---|---|---|---|
| claro | #F6EADF | #FFF8F1 | #2B1D14 | #634D3E | #85532A | #FFFFFF |
| escuro | #1C140F | #281D16 | #F3E6D8 | #D2BFAE | #E0A86A | #1C140F |

| tema | texto/fundo | texto/superfície | apoio/fundo | destaque/fundo | sobre-destaque/destaque | resultado |
|---|---|---|---|---|---|---|
| claro | 13.78 | 15.48 | 6.67 | 5.43 | 6.43 | AA texto normal em todos os pares |
| escuro | 14.81 | 13.40 | 10.21 | 8.63 | 8.63 | AA texto normal em todos os pares |

#### academia-1 · Anilha 25 (anilha olímpica vermelha de 25 kg, borracha preta)

| tema | fundo | superfície | texto | apoio | destaque | sobre-destaque |
|---|---|---|---|---|---|---|
| claro | #F1F0EC | #FFFFFF | #161616 | #4D4B47 | #B8141E | #FFFFFF |
| escuro | #131313 | #1E1E1E | #F1F0EC | #BDBAB3 | #FF5A5F | #131313 |

| tema | texto/fundo | texto/superfície | apoio/fundo | destaque/fundo | sobre-destaque/destaque | resultado |
|---|---|---|---|---|---|---|
| claro | 15.87 | 18.10 | 7.63 | 5.83 | 6.65 | AA texto normal em todos os pares |
| escuro | 16.29 | 14.62 | 9.59 | 6.09 | 6.09 | AA texto normal em todos os pares |

#### academia-2 · Anilha 20 (anilha olímpica azul de 20 kg, aço da barra)

| tema | fundo | superfície | texto | apoio | destaque | sobre-destaque |
|---|---|---|---|---|---|---|
| claro | #EDF0F2 | #FFFFFF | #111A22 | #47525C | #1556A8 | #FFFFFF |
| escuro | #10161C | #1A222A | #ECF0F3 | #B5C0CA | #6FA8F0 | #10161C |

| tema | texto/fundo | texto/superfície | apoio/fundo | destaque/fundo | sobre-destaque/destaque | resultado |
|---|---|---|---|---|---|---|
| claro | 15.36 | 17.58 | 6.98 | 6.27 | 7.17 | AA texto normal em todos os pares |
| escuro | 15.89 | 14.03 | 9.85 | 7.40 | 7.40 | AA texto normal em todos os pares |

#### academia-3 · Anilha 15 (anilha olímpica amarela de 15 kg, magnésio)

| tema | fundo | superfície | texto | apoio | destaque | sobre-destaque |
|---|---|---|---|---|---|---|
| claro | #F4F1E8 | #FFFDF6 | #181611 | #514B3E | #8A6400 | #FFFFFF |
| escuro | #151410 | #211F19 | #F4F1E8 | #C8C1AF | #FFD23F | #151410 |

| tema | texto/fundo | texto/superfície | apoio/fundo | destaque/fundo | sobre-destaque/destaque | resultado |
|---|---|---|---|---|---|---|
| claro | 16.01 | 17.76 | 7.66 | 4.76 | 5.38 | AA texto normal em todos os pares |
| escuro | 16.32 | 14.59 | 10.27 | 12.76 | 12.76 | AA texto normal em todos os pares |

## 9. Clichês proibidos (regra dura 5 do briefing)

- Gradiente roxo-azul genérico. O azul de noite herdado da loja é chapado, sem gradiente, e só no tema escuro.
- Mockup de celular flutuando. A prévia é o site de verdade em tela cheia; o "celular recebendo a mensagem" do teste é desenho chapado de nanquim, apoiado, nunca inclinado em 3D com sombra borrada.
- Ícones em círculo em três colunas. Os passos são 4, numerados pela ordem real; os rituais aparecem um por nicho, nunca como grade de "benefícios".
- Emoji como marcador ou ícone. Marcadores de lista são desenhados em CSS (visto de nanquim, traço de "não inclui").
- Creme com serifa e terracota; preto com verde ácido (por isso nenhuma paleta escura usa verde saturado sobre preto); Inter ou Space Grotesk "por segurança".
- Tudo centralizado. Hero e seções alinhados à esquerda; só a placa fica no eixo da porta.
- Cantos arredondados e sombra em tudo. Sombra dura só em cartões interativos, campos e na placa; seções não têm sombra.
- Foto de pessoa, depoimento, nota ou horário "ocupado" inventado (regra dura 1). Valor de exemplo sempre com `.exemplo`.
- Mais de uma ousadia. Se alguém propuser partícula, parallax ou 3D extra na home, a resposta é não: a placa é a ousadia.

## 10. Imagens (`assets/img/`) e orçamento de peso

| arquivo | dimensão | peso | uso |
|---|---|---|---|
| `sede-ilha.webp` | 1280 x 800 | 98.804 B | pôster da sede no desktop |
| `sede-ilha-640.webp` | 640 x 400 | 35.428 B | pôster da sede no celular (`srcset`) |
| `sede-ao-vivo.webp` | 1280 x 800 | 111.924 B | seção sede, só sob demanda (`loading="lazy"`) |
| `sede-ao-vivo-640.webp` | 640 x 400 | 40.006 B | idem, celular |
| `sede-ficha-agente.webp` | 1280 x 800 | 99.044 B | seção sede (lazy) |
| `sede-ficha-agente-640.webp` | 640 x 400 | 36.216 B | idem, celular |
| `sede-celular-escuro.webp` | 390 x 844 | 32.440 B | anúncios e `/obrigado/` |

Originais copiados de `projetos/loja/assets/` sem alteração; as versões `-640` foram geradas com Pillow (Lanczos, WebP qualidade 74).

Estimativa da home sem a sede 3D, no celular: fontes 53 KB (Figtree é variável, 1 arquivo de 20 KB para os 3 pesos; JetBrains Mono 22 KB; Lilita One 11 KB, subconjunto latin) + `tokens.css` 22 KB (5 KB gzip) + `vitrine.css` 23 KB (6 KB gzip) + SVGs embutidos da placa cerca de 14 KB + pôster `sede-ilha-640.webp` 35 KB = cerca de 147 KB antes do HTML e dos scripts da T5, T6 e T7. Com as duas imagens lazy da seção sede em 640 px, cerca de 223 KB. Folga para o limite de 500 KB. Regra: na home, só o pôster carrega de imediato; as outras imagens com `loading="lazy"` e `srcset` 640w/1280w.

## 11. Verificação feita (T2)

Página de teste descartável fora da árvore entregue (scratchpad), usando `tokens.css`, `vitrine.css` e os SVGs embutidos. Rodado `verificacao-visual` (4 configurações: "Tudo limpo", sem erro de console, sem requisição falhando, sem rolagem horizontal, sem texto pequeno) e um script Playwright próprio a 390 x 844 e 1280 x 800, claro e escuro, página inteira: largura de rolagem igual à da janela nos 4 casos, nenhum texto abaixo de 11 px, 0 erros de console. Prints olhados e listados em `docs/relatorio/T2.md`.
