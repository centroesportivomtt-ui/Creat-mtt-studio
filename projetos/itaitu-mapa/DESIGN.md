# Design: Trilhas de Itaitu + Hora da Serra

Paleta (designer), 20/11/2026. Ficha do sistema visual. O contrato de código continua na `ARQUITETURA.md`; aqui ficam valores, medidas e o porquê.

## 1. Ficha de direção

- **Conceito:** Hora da Serra. Todo app de trilha responde ONDE; este responde QUANDO.
- **Momento-assinatura:** o hóspede escaneia o QR e, em 5 s, vê a sombra da serra atravessar o vale e as horas acenderem nas etiquetas. Depois o polegar arrasta o sol pela régua, e o marcador do Véu passa de dourado para azul.
- **Layout:** o mapa ocupa a tela inteira. Por cima dele vão só três objetos, todos tirados da placa da recepção:
  - as tábuas (destinos);
  - a faixa "saia até";
  - a régua do dia, no rodapé, onde o polegar alcança.
- **Ousadia única: as tábuas da placa.**
  - Madeira `#3A2618` com tinta creme `#FFF4DC` (13,1:1), veio só em CSS e um prego em cada ponta.
  - O estado honesto da posição vira forma:
    - a tábua confirmada tem **ponta de seta**, porque sabemos onde é;
    - a aproximada tem **contorno tracejado**;
    - a sem coordenada não tem seta e traz o botão "Chamar um guia".
  - O resto é calmo: papel creme de dia e noite de serra no escuro. Não há gradiente decorativo nem sombra em tudo.
- **Uma família só**, Atkinson Hyperlegible Next, a fonte de legibilidade do Braille Institute. O caráter vem da madeira e dos números grandes, com o zero cortado e algarismos tabulares, e não de uma segunda fonte.
- **Cor com significado fixo.**
  - Dourado (`--sol`) só quer dizer "sol direto agora".
  - Azul frio (`--sombra`) só quer dizer "a serra já cobriu".
  - A seleção usa a tinta creme, nunca o dourado.
  - Toda cor de estado vem com palavra.
- **Clichês evitados:** gradiente roxo-azul, creme com serifa e terracota, preto com verde ácido, emoji, tudo centralizado e canto arredondado com sombra em tudo. A madeira é quase reta (raio de 2 px). Na placa física o texto vai à esquerda, como numa placa de trilha.

## 2. Arquivos e ordem de carga

| arquivo | o que é |
|---|---|
| `site/itaitu/css/fontes.css` | `@font-face` local, 400 e 700, `font-display: swap` |
| `site/itaitu/css/tokens.css` | todas as variáveis, temas e modos (`data-*` no `<html>`) |
| `site/itaitu/css/tabuas.css` | tábuas da placa (3 estados, plano B clara, modo sol) |
| `site/itaitu/css/regua.css` | régua do dia, faixa "saia até" (`#hora-faixa` / `.faixa-saia`), `.etiqueta-hora`, `.polegar-fantasma` |
| `site/itaitu/fontes/` | `AtkinsonHyperlegibleNext-Regular.woff2` (24,9 KB), `-Bold.woff2` (25,9 KB), `LICENSE.txt` (OFL 1.1) |
| `site/itaitu/icones/` | ícone do app (SVG, 192, 512, maskable 512, apple-touch 180, favicon SVG e 32), variação do Marcos (`marcos.svg`, `marcos-192.png`, `marcos-512.png`, `marcos-maskable.png`, `marcos-maskable.svg`) e o sprite `ui.svg` |
| `site/itaitu/arte/placa-qr.svg` | placa da recepção, 15 x 20 cm (3:4), fontes embutidas |
| `site/itaitu/manifest.webmanifest` | app público |

A ordem no `<head>` é `fontes.css`, `tokens.css`, `tabuas.css`, `regua.css` e, depois, `app.css` e `hora.css`. A ARQUITETURA (seção 1) põe a faixa e a etiqueta em `tabuas.css`; elas estão em `regua.css`, como pediu a tarefa T3. Os dois arquivos são do designer e sempre carregam juntos.

No `index.html` (frontend A):
```html
<meta name="theme-color" content="#3A2618">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="icon" href="./icones/favicon.svg" type="image/svg+xml">
<link rel="icon" href="./icones/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="./icones/apple-touch-icon.png">
<link rel="preload" href="./fontes/AtkinsonHyperlegibleNext-Bold.woff2" as="font" type="font/woff2" crossorigin>
```

## 3. Tokens

### 3.1 Objetos da placa e luz (iguais nos dois temas)
| token | valor | papel |
|---|---|---|
| `--madeira` | `#3A2618` | tábua, faixa (claro), etiqueta, theme_color |
| `--madeira-veio` / `--madeira-funda` | `#4A3020` / `#2B1B10` | veio claro / veio escuro, quina, selo do cartão |
| `--tinta` | `#FFF4DC` | tinta creme (texto na madeira) |
| `--tinta-apoio` | `#E8D3AC` | texto secundário na madeira |
| `--sol` / `--sol-tinta` | `#F5B83D` / `#8A5A00` | sol sobre escuro / sol escrito sobre claro |
| `--sombra` / `--sombra-tinta` | `#93AEF5` / `#2F4E9E` | sombra sobre escuro / sombra escrita sobre claro |
| `--poco-sol` / `--poco-sombra` | `#F5B83D` / `#4A6FD8` | marcador do poço (sempre com anel creme) |
| `--cor-parceiro` → `--cor-marca` | padrão `#C9283E` (vermelho de tinta de trilha) | o `marca.js` escreve `--cor-parceiro`; todo CSS usa `--cor-marca`. Nunca carrega texto: só o traço, o filete e o acento, sempre com contorno creme |
| `--foco-claro` / `--foco-escuro` | `#FFD23F` / `#17120D` | anel de foco em dois tons, que aparece na madeira, no papel e no mapa |

### 3.2 Temas (desenhados, não invertidos)
| token | claro (papel) | escuro (noite de serra) | economia |
|---|---|---|---|
| `--fundo` | `#F6EDDA` | `#17120D` | `#0E0B08` |
| `--superficie` | `#FFF8EA` | `#231A12` | `#17120D` |
| `--superficie-2` | `#EADCC0` | `#3A2C20` | `#2A2018` |
| `--tinta-ui` | `#3A2618` | `#FFF4DC` | `#FFF4DC` |
| `--tinta-ui-apoio` | `#6B5340` | `#C9B492` | `#C9B492` |
| `--linha` | `#8A7056` | `#7D6750` | `#7D6750` |
| faixa "saia até" | madeira com tinta (o objeto **mais escuro** da tela) | tinta com madeira (o objeto **mais claro**) | tinta com madeira |

As tábuas são madeira nos dois temas, porque são um objeto e não uma superfície.

### 3.3 Relevo pintado (para o `estilo.js` do frontend A e o `luz.js` do motion)
Conferido com os tiles z13 do recorte. A altitude vai de 462 a 1271 m, com mediana de 619 m. Num render de teste, com o sol das 15:55 e esta paleta, o paredão de quartzito aparece claro, o cerrado ocre nas encostas e a sombra azul no lado leste.
```js
'color-relief-color': ['interpolate', ['linear'], ['elevation'],
  480, '#2E4A2C',  580, '#3F5F38',  680, '#7E7B47',
  800, '#A8925A',  920, '#C9B998', 1050, '#E6DAC3'],
// hillshade (relevo-sombra), luz do sol real:
'hillshade-highlight-color': '#FFE3A6', 'hillshade-shadow-color': '#1F2A44',
'hillshade-accent-color': '#2B1B10', 'hillshade-exaggeration': 0.6,
// rios '#4F9BD0'; sombra da serra (CanvasSource): '#1E2F5C' com opacidade 0.55
// céu: dia '#A9CDE8', tarde '#F2C58A', noite '#1B2338'
```
Sugestões para as camadas vetoriais (o dono é o A):
- ruas em `#FFF4DC`, com contorno `#3A2618` de 1 px a partir do zoom 13;
- `parque-contorno` em `#2E4A2C`, tracejado;
- `predios` em `#8A7056`;
- `trilhas-linhas` na `--cor-marca`, com contorno creme.

Não use satélite como fundo padrão. A foto traz a sombra congelada de outro dia, e isso contradiz a hora da serra.

## 4. Tipografia

Atkinson Hyperlegible Next 2.001: OFL 1.1, do repositório oficial `googlefonts/atkinson-hyperlegible-next` (commit `7925f50`), com os arquivos `fonts/webfonts/*.woff2` sem modificação.
- **Cobertura:** 392 glifos, com latim, Latin-1 e Latin Extended-A. Cobre todo acento do português e os sinais `·`, `±`, `≈`, `–`, `—`, `°`, `“` e `”`.
- **Setas:** a fonte não tem `→` nem `↑`. Use os ícones do sprite.
- **Algarismos tabulares: tem.** A feature `tnum` existe e foi conferida na tabela GSUB, nos dois pesos: o avanço do dígito é 632/1000 e o dos dois-pontos é 210 (Regular) e 272 (Bold). Por isso não foi preciso fonte alternativa. No navegador vale `font-variant-numeric: tabular-nums`, e o Chromium resolveu `tabular-nums` nas tábuas.

| token | px (normal) | px (texto grande) | uso |
|---|---|---|---|
| `--t-legenda` | 13 | 16,25 | "agora", nascer e pôr na régua (mínimo da casa: 11) |
| `--t-pequeno` | 14 | 17,5 | rótulo das horas, nota ±, selos |
| `--t-apoio` | 15 | 18,75 | linha da placa na tábua, destino da faixa |
| `--t-corpo` | 17 | 21,25 | texto, botão "Chamar um guia" |
| `--t-destaque` | 20 | 25 | título da tábua, "saia até" |
| `--t-titulo` | 24 | 30 | títulos de painel |
| `--t-num` | **30** | **37,5** | horas da tábua (preso entre `--num-min` 28 e `--num-max` 40) |
| `--t-num-regua` | 28 | 35 | hora da régua |
| `--t-num-faixa` | **40** | 40 | número da faixa "saia até" |

Pesos: 400 para texto e 700 para títulos e números. Entrelinha de 1,35 no texto e de 1,1 nos títulos e números. Títulos com `text-wrap: balance`.

## 5. Grade e espaço (celular de 390 px primeiro)

- **Ritmo:** 4, 8, 12, 16, 24, 32, 48 e 64 px (`--ritmo-1` a `--ritmo-8`).
- **Margem lateral:** 16 px.
- **Alvos:** `--alvo` de 44 px e alça da régua de 48 px. No texto grande, 48 e 52 px.
- **Pilha de baixo para cima no celular:**
  - a régua, presa ao rodapé, com `env(safe-area-inset-bottom)`, por volta de 112 px;
  - a faixa "saia até" logo acima, por volta de 64 px;
  - o painel de tábuas, que o A abre por cima do mapa.
- A largura útil vai até 560 px. No desktop, a faixa e a régua centralizam nessa largura.
- **Tábua:**
  - padding de 12/16 px, com 22 px à esquerda para o prego;
  - a ponta de seta mede 16 px e fica fora da caixa, pela `margin-inline-end`;
  - as horas ficam em 3 colunas.
  - Com o painel abaixo de 340 px, ou no texto grande, as horas viram linhas, "rótulo ..... 16:05", como na placa original. Isso usa container query no `.tabuas`.

## 6. Estados

| componente | estado | como aparece |
|---|---|---|
| tábua | `confirmada` | ponta de seta, 3 horas, nota "calculado pelo relevo, ±10/15 min" |
| tábua | `aproximada` | sem seta, contorno creme tracejado, selo tracejado "posição aproximada"; o CSS **esconde** `.tabua__horas` e `.tabua__nota` mesmo que venham no HTML |
| tábua | `sem-coordenada` | sem seta, sem hora (também forçado no CSS), "posição não confirmada: vá com guia" e o botão creme "Chamar um guia" (48 px) |
| tábua | `data-amanha="1"` | selo "amanhã" no canto, com contorno creme |
| tábua | `data-luz="sombra"` (extra) | o disco antes de "sol no poço até" fica azul |
| tábua | `aria-current="true"` ou `.tabua--ativa` | borda e ponta em creme |
| tábua | `.tabua__fincada` | "fincada pela ACAGI" com uma cabeça de prego |
| régua | repouso | alça de 48 px desenhando o sol (disco dourado, anel madeira, anel creme); trilho com o crepúsculo listrado do pôr ao escurecer; janela de sol dourada com contorno madeira |
| régua | foco (teclado) | dois anéis em volta do sol, amarelo e escuro; a borda de cima fica na cor da tinta |
| régua | arrastando (`data-arrastando="1"` ou `:active`) | sol maior com halo; some a palavra "agora" |
| régua | `.regua__marca[data-luz]` | marcador do poço, dourado ou azul |
| etiqueta | `data-acesa="0"` | só o nome, opacidade 0,78 |
| etiqueta | `data-acesa="1"` | acende uma vez (520 ms, curva de mola) com um anel azul que se abre; a hora entra subindo 4 px |
| etiqueta | `data-luz="sol"` ou `"sombra"` | disco dourado ou azul, sempre com anel creme |
| polegar fantasma | `data-ativo="1"` e `--de`/`--para` | sai de `--de`, aperta e arrasta até `--para` em `--dur-polegar` (1 s) |
| modo | `data-contraste="sol"` | preto e branco puros (21:1); sol = disco cheio e sombra = anel vazado; janela preta; tábua branca com borda de 3 px |
| modo | `data-texto="grande"` | escala 1,25; números travados em 40 px; horas em linhas |
| modo | `data-tabua="clara"` | plano B: tábua creme com tinta madeira (13,1:1) |
| modo | `data-economia="1"` | durações em 0, sem veio, sem sombra, superfícies quase pretas (tela OLED), sem polegar e sem animação |
| modo | `prefers-reduced-motion` | durações em 0; polegar, faixa e etiqueta sem animação |

Extras de marcação que o CSS entende. São opcionais; o B gera se quiser:
```html
<span class="regua__legenda" data-luz="sol">sol no Véu da Noiva</span>      <!-- linha 1, à direita -->
<div class="regua__trilho" style="--por: 97.4%">                             <!-- onde o sol se põe -->
  <span class="regua__evento" data-evento="nascer|por|escurece" style="--pos: 97.4%"></span>
</div>
<span class="polegar-fantasma" aria-hidden="true" data-ativo="1" style="--de: 82.7%; --para: 85.3%"></span>
<div class="regua__eventos"><span>nascer 05:10</span><span>pôr 17:50 · escurece 18:10</span></div>
```

Regras para quem monta:
- **Etiqueta de hora no mapa:** `new maplibregl.Marker({ element, anchor: 'bottom' })`. A ponta da plaquinha fica no ponto.
- **`.regua__sol` é o "agora"**, um risco fino com a palavra em cima. A alça é a hora escolhida.
- **Porcentagens:** `--pos`, `--ini`, `--fim` e `--por` valem `(minuto − min) / (max − min) × 100%`. O trilho já é recuado meia alça de cada lado, então a porcentagem casa com a posição da alça do `input range`.
- **Espaço que não quebra:** o copywriter e o B usam espaço que não quebra (U+00A0) em "≈ 30 min", "30–40 min" e "2 km". No texto grande, a quebra "30– / 40" aparece.

## 7. Cartão da trilha (1080 x 1920, canvas, offline)

Prova feita: uma página temporária no scratchpad da sessão (`teste/cartao.html`, fora do repositório) desenhou esta especificação com o relevo real, nas variantes com sol, com sombra e sem hora. Nenhum texto passou da zona segura, nem colidiu com outro.

- **Zona segura do story:** `x` de 72 a 1008 e `y` de 250 a 1680.
  - Acima de 250 e abaixo de 1680, o Instagram põe barra de perfil e caixa de resposta. Ali só fica o relevo e o crédito.
- **Texto mínimo:** 30 px. O story aparece a cerca de 1/2,77 num celular de 390 px, então 30 px viram cerca de 11 px na tela.
- **Fontes:** `await document.fonts.load('700 112px "Atkinson Hyperlegible Next"')` e `load('400 32px ...')` antes de desenhar.

| zona | caixa (px) | conteúdo e medida |
|---|---|---|
| A. Relevo | 0,0 a 1080,1080 | relevo desenhado pelo worker a partir da altitude, com a luz do **minuto da chegada** (`relevo-cartao.js`), sem copiar a tela WebGL; paleta 3.3 |
| B. Véu de cima | 0,0 a 1080,420 | gradiente linear `rgba(23,18,13,0.78)` → 0, só para legibilidade da marca |
| C. Marca | `y` 262 a 360 | filete de 10 x 92 px na `--cor-marca` em `x` 72; nome do parceiro Bold 48 px tinta em `x` 100, `y` 262 (encolhe até 36 px para caber em 836 px); abaixo, "Trilhas de Itaitu" Regular 30 px `#E8D3AC` em `y` 322. Na marca padrão: "Trilhas de Itaitu" e "mapa das cachoeiras sem internet". Logo autorizado: caixa de 400 x 100 em `x` 100, `y` 256, numa chapa creme com 12 px de respiro, e o nome desce para 30 px |
| D. Luz | `y` 384 | "luz real de 20/11 às 15:50" Regular 30 px tinta, com sombra de texto `rgba(23,18,13,.9)` e blur 8 |
| E. Traço | caixa de 96,440 a 984,960 | trilha ajustada à caixa, sem distorcer; contorno tinta de 18 px e linha `--cor-marca` de 10 px, `lineJoin` e `lineCap` `round`; início com círculo de r 14 tinta e borda madeira de 5 px; chegada com marcador do poço de r 22 (`#F5B83D` se chegou com sol, `#4A6FD8` se chegou com sombra), anel tinta de 6 px |
| F. Tábua | 0,1040 a 1080,1920 | madeira `#3A2618`; quina escura de 6 px em `y` 1034; luz rasante `rgba(255,244,220,.10)` de 4 px em `y` 1040; veio com linhas de 1 a 2 px a cada 9 px (`rgba(74,48,32,.55)` e `rgba(43,27,16,.45)`), levemente curvas; 4 pregos de r 7 `#B8A48A`, com anel `#2B1B10`, em (40,1084), (1040,1084), (40,1880) e (1040,1880) |
| G. Selo Hora da Serra | centro (852,1052), r 156 | carimbado na emenda do relevo com a tábua. Disco `#2B1B10`, anel tinta de 6 px em r 150. Arco do dia: centro (852,1072), r 112, de π a 2π (nascer à esquerda e pôr à direita), traço de 16 px `rgba(255,244,220,.28)`, `lineCap` `butt`. **Janela de sol do poço:** o mesmo arco em `#F5B83D` de `ang(sol chega)` a `ang(apaga)`, com `ang(m) = π + π·(m − nascer)/(pôr − nascer)`, desenhado com `ctx.arc`. Chegada: círculo de r 13 (tinta, ou `#4A6FD8` se chegou com sombra) com borda madeira de 4 px. "HORA DA SERRA" Bold 30 px tinta, centrado, topo em `y` 1086 (largura medida: 239 px). "06:10–16:05" Bold 30 px `#F5B83D`, tabular, topo em `y` 1124 (183 px). Sem hora de sol: arco sem janela e "sem hora de sol" Regular 30 px `#E8D3AC` (211 px) |
| H. Destino | `x` 72, `y` 1100, largura máxima 600 | Bold 64 px tinta, até 2 linhas com passo de 70; acima de 2 linhas, 56 px |
| I. Frase | `y` 1272 a 1552 | "cheguei" Regular 32 px `#E8D3AC` em (72,1272); hora Bold **112 px** tinta em (72,1312), por exemplo **15:50**. "a serra apaga o sol" Regular 32 px em (560,1272); hora Bold 112 px em (560,1312), por exemplo **16:05**. Linha de sol: "**15 min de sol no poço**" Bold 56 px `#F5B83D` em (72,1452). Nota "calculado pelo relevo, ±10 min" (±15 se `media`) Regular 30 px `#E8D3AC` em (72,1522) |
| J. Números | `y` 1576 a 1668 | três colunas em `x` 72, 384 e 696: rótulo Regular 30 px `#E8D3AC` ("trilha", "tempo", "desnível") e valor Bold 56 px tinta em `y` 1612 ("2,0 km", "34 min", "+90 m") |
| K. Pé (fora da zona segura) | `y` 1720 a 1790 | filete `rgba(255,244,220,.2)` de 936 x 2 em (72,1720); "Trilhas de Itaitu · Hora da Serra" Regular 30 px `#E8D3AC` em (72,1752); "feito pela Creat" Regular 30 px, alinhado à direita em `x` 1008 |

A frase lida em sequência é "Cheguei 15:50 · a serra apaga o sol 16:05 · 15 min de sol no poço". No demo, a chegada é o apaga exibido menos 15 min, como diz a ARQUITETURA 9.5. O texto de compartilhar (`navigator.share({ text })`) leva a frase inteira, porque a imagem não tem texto alternativo.

**Variantes**
- **`cartao.frase_sombra`** (chegou depois do apaga):
  - a segunda coluna diz "a serra apagou o sol", com a hora em `#93AEF5` (6,5:1);
  - a linha I vira a frase de sombra do copywriter, por exemplo "a sombra já cobria o poço", Bold 56 px `#93AEF5`;
  - a chegada no selo fica azul;
  - nunca aparece "0 min".
- **`cartao.frase_sem_hora`**:
  - só a coluna "cheguei";
  - a linha I vira a frase sem hora, Regular 32 px `#E8D3AC`;
  - o selo fica sem janela.

**Números tabulares no canvas.** O canvas não tem `font-variant-numeric`. Para as horas de 112 px e do selo, desenhe dígito a dígito numa célula fixa de 0,632 em:
```js
function numeroTabular(ctx, texto, x, y, px) {        // ctx.font já em `700 ${px}px "Atkinson Hyperlegible Next"`
  let a = x;
  for (const c of texto) {
    const w = ctx.measureText(c).width;
    if (/\d/.test(c)) { ctx.fillText(c, a + (0.632 * px - w) / 2, y); a += 0.632 * px; }
    else { ctx.fillText(c, a, y); a += w; }
  }
  return a - x;
}
```

**Nenhum cartão sai igual.** A luz do relevo é a do minuto da chegada, o traço é o gravado e a janela do selo é a do dia. A cor do traço e do filete vem do JSON da marca. Nome do arquivo: `trilhas-de-itaitu-<destino>-<AAAA-MM-DD>.png`.

## 8. Placa física com QR (`site/itaitu/arte/placa-qr.svg`)

**Formato e acabamento**
- 15 x 20 cm (3:4), `viewBox` 1500 x 2000, com 1 unidade = 0,1 mm.
- Material sugerido: ACM ou PVC de 3 mm, impresso com laminação **fosca**. O brilho atrapalha a leitura do QR sob a luz da recepção.
- Fica pendurada ao lado da placa antiga "Guia das Cachoeiras", no mesmo estilo.

**As quatro tábuas, de cima para baixo**
1. **Quem oferece:**
   - "Trilhas de Itaitu · cortesia de", com 4,4 mm de altura de corpo;
   - `#nome-parceiro` Bold, com 8,4 mm;
   - o ícone (arco do dia, sol e serra) à direita.
2. **A frase**, numa tábua de seta como as placas de trilha: "Aponte a câmera: / esta placa vai / com você." Bold, com 10,4 mm de corpo, legível a 3 m.
3. **O QR:**
   - chapa branca de 74 x 74 mm, pregada;
   - `#qr-area` de 56 x 56 mm (o mínimo do kit é 4 cm), com 9 mm de margem branca, o que equivale a 4 módulos ou mais com 33 módulos;
   - à direita: "Funciona sem sinal." e "Abra com o Wi-Fi da casa e espere “Pronto para usar sem internet”. Sem loja de aplicativo e sem cadastro.";
   - embaixo da chapa, `#endereco`, o endereço por extenso, para quem não lê QR.
4. **Emergência e crédito:**
   - "Emergência: 192 SAMU · 193 Bombeiros";
   - "O mapa ajuda, mas não substitui o guia.";
   - "feito pela Creat".

**Como preencher**
- Troque o texto de `#nome-parceiro` e de `#endereco`.
- Ponha o PNG do QR, gerado no `marcos.html`, como `<image>` dentro de `#qr-area` (x 210, y 970, 560 x 560).
  - Use correção de erro M ou Q.
  - O QR fica em preto puro sobre branco.
- As fontes estão embutidas no SVG (75 KB), e o arquivo abre igual em qualquer Chrome.
- Para a gráfica: abra no Chrome, imprima em PDF com 150 x 200 mm e margem zero, e confira a leitura com 1 Android e 1 iPhone a 40 cm (checklist de `venda/placa-qr.md`).
- Não leva logo de terceiros. Logo da pousada só com autorização, em `arte/parceiros/`.

**O que fica do lado do copywriter**
- O texto de mesa A5 (frente e verso) está em `venda/placa-qr.md`.
- Esta placa usa a frase pedida pela tarefa e reaproveita "sem loja de aplicativo e sem cadastro" e a emergência dele.

## 9. Ícones

**Ícone do app**
- A serra de mesa (o paredão de quartzito, em creme) tira o sol dourado sob o arco do dia.
- No vale, a sombra azul avança sobre o cerrado ocre, e um poço dourado ainda está no sol.
- É o produto inteiro num quadrado.
- O maskable reduz a arte a 80% em volta do centro. O poço fica dentro da zona segura.
- A variação do Marcos é o mesmo desenho em negativo: fundo creme, serra e arco em madeira. Na tela inicial ele vê os dois apps lado a lado e não confunde.

**Sprite `icones/ui.svg`**
- Grade de 24, traço de 2 em `currentColor`, ponta redonda.
- Os atributos ficam inline, o que funciona com `<use href="./icones/ui.svg#i-…">` de arquivo externo. Foi conferido no Chromium.
- Ids: `i-norte`, `i-camadas`, `i-3d`, `i-2d`, `i-gps`, `i-gravar`, `i-pausa`, `i-ponto`, `i-sos` (boia), `i-compartilhar`, `i-sol`, `i-sombra`, `i-guia` (caminhante com cajado), `i-comer`, `i-whatsapp` e `i-fechar`.
- `i-whatsapp` é um balão de conversa genérico, não o logotipo do WhatsApp (sem marca de terceiros).
- O ícone é sempre `aria-hidden`; o texto do botão diz a ação.

## 10. Contraste (WCAG 2.x, luminância relativa, calculado em 20/11/2026)

Meta: AA. Texto pede 4,5:1, texto grande e elemento gráfico pedem 3:1, e madeira com tinta pede 13:1.

| par | uso | razão |
|---|---|---|
| `#FFF4DC` / `#3A2618` | tinta na madeira: texto e números da tábua, faixa (claro), etiqueta, placa | **13,08:1** |
| `#FFF4DC` / `#4A3020` | tinta no ponto mais claro do veio | 11,08:1 |
| `#E8D3AC` / `#3A2618` | texto de apoio na madeira (linha da placa, rótulos, nota ±, cartão) | 9,76:1 |
| `#E8D3AC` / `#4A3020` | apoio no veio claro | 8,27:1 |
| `#F5B83D` / `#3A2618` | sol na madeira: disco, rótulo "saia até", "15 min de sol no poço" | 8,03:1 |
| `#93AEF5` / `#3A2618` | sombra na madeira: disco, frase de sombra do cartão | 6,54:1 |
| `#3A2618` / `#FFF4DC` | botão "Chamar um guia", tábua clara, faixa (escuro) | 13,08:1 |
| `#5A4330` / `#FFF4DC` | apoio na tábua clara | 8,43:1 |
| `#8A5A00` / `#FFF4DC` | sol escrito na tábua clara | 5,43:1 |
| `#2F4E9E` / `#FFF4DC` | sombra escrita na tábua clara | 7,11:1 |
| `#3A2618` / `#F6EDDA` | texto no fundo claro | 12,27:1 |
| `#3A2618` / `#FFF8EA` | texto na régua clara | 13,51:1 |
| `#6B5340` / `#FFF8EA` | apoio na régua clara | 6,77:1 |
| `#8A7056` / `#FFF8EA` | borda e contorno do trilho (gráfico) | 4,38:1 |
| `#8A5A00` / `#FFF8EA` | legenda "sol no Véu" (claro) | 5,61:1 |
| `#2F4E9E` / `#FFF8EA` | legenda "a sombra cobre" (claro) | 7,35:1 |
| `#3A2618` / `#F5B83D` | contorno da janela dourada (o dourado puro no papel dá 1,53:1, por isso leva contorno) | 8,03:1 |
| `#FFF4DC` / `#231A12` | texto na régua escura | 15,66:1 |
| `#C9B492` / `#231A12` | apoio na régua escura | 8,49:1 |
| `#7D6750` / `#231A12` | borda e trilho (escuro, gráfico) | 3,20:1 |
| `#F5B83D` / `#231A12` | legenda de sol (escuro) | 9,61:1 |
| `#93AEF5` / `#231A12` | legenda de sombra (escuro) | 7,83:1 |
| `#FFF4DC` / `#17120D` | economia: texto | 17,03:1 |
| `#C9B492` / `#17120D` | economia: apoio | 9,24:1 |
| `#F5B83D` / `#17120D` | economia: sol | 10,46:1 |
| `#4A6FD8` / `#FFF4DC` | marcador sem sol com anel creme (gráfico) | 4,22:1 |
| `#4A6FD8` / `#3A2618` | marcador sem sol na etiqueta (separado pelo anel creme) | 3,10:1 |
| `#FFD23F` / `#3A2618` | foco na madeira | 9,89:1 |
| `#17120D` / `#FFF8EA` | foco no papel | 17,60:1 |
| `#FFD23F` / `#17120D` | foco na noite | 12,88:1 |
| `#C9283E` / `#FFF4DC` | cor padrão do parceiro com contorno creme (traço) | 4,99:1 |
| `#C8742B` / `#FFF4DC` | cor do Village (demo) com contorno creme | 3,21:1 |
| `#FFF4DC` / `#2B1B10` | texto do selo do cartão | 15,17:1 |
| `#F5B83D` / `#2B1B10` | janela de sol no selo | 9,32:1 |
| `#8A7056` / `#FFFFFF` | texto provisório "QR aqui" na placa | 4,63:1 |
| `#000000` / `#FFFFFF` | modo sol | 21:1 |

**Cor de parceiro.** Uma cor nova de parceiro precisa de 3:1 ou mais contra `#FFF4DC`, o contorno do traço. Abaixo disso o traço some no quartzito claro. O `marca.js` pode validar com a mesma fórmula; pedido registrado no RELATORIO.

## 11. Verificação feita

Página de teste temporária, fora do repositório (scratchpad da sessão, `teste/index.html`, com link simbólico para `site/itaitu`). Ela tem as tábuas nos 3 estados mais amanhã e fincada, a faixa, a régua com marcas e eventos, as etiquetas sobre o relevo pintado, o polegar e o sprite.

**`olhar.cjs` nas 4 configurações:** "Tudo limpo". Sem erro de console, sem requisição quebrada, sem rolagem horizontal e sem texto pequeno.

**Script de medição em 390 px, nos modos padrão, movimento reduzido, escuro, sol, grande, clara, economia e Village:**
- `scrollWidth` 390 em todos;
- nenhum alvo abaixo de 44 px;
- números da tábua em 30 px (37,5 px no texto grande);
- número da faixa em 40 px;
- menor texto de 13 px;
- as 2 fontes carregadas e `tabular-nums` ativo;
- nenhuma tábua aproximada ou sem coordenada exibe hora;
- polegar e animação da faixa desligados no movimento reduzido e na economia;
- a seta para a direita na régua vai de 955 para 960 (passo de 5);
- zero erro.

**Prints olhados:** tábuas nos 3 estados em cada modo, rodapé nos modos, foco, arrastando, polegar no meio do gesto, ícones, os 3 cartões e a placa.

## 12. Pedidos a outras tarefas (não editei arquivos delas)

- **A (`index.html`, `marca.js`, `estilo.js`, `app.css`):**
  - carregar os CSS na ordem da seção 2 e as metas de ícone;
  - **guardar o último `?m=` válido** em `localStorage` e reaplicar quando a página abrir sem `?m=`. O app instalado abre `start_url: './'` sem parâmetro e cairia na marca padrão, apagando a pousada da tela do hóspede. Isso mata a venda;
  - validar `cor` com 3:1 ou mais contra `#FFF4DC`;
  - paleta do relevo da seção 3.3;
  - `.rotulo-lugar` e `.rotulo-ponto` no `app.css`, com as mesmas variáveis.
- **B (`hora/*.js`, `hora.css`):**
  - marcação da 6.4 e extras da seção 6;
  - `anchor: 'bottom'` nas etiquetas;
  - cartão pela seção 7, com `numeroTabular`;
  - `data-luz` na `<li>` da tábua para o disco mudar de cor.
- **C (`manifest-marcos.webmanifest`):** ícones `./icones/marcos.svg`, `marcos-192.png`, `marcos-512.png` e `marcos-maskable.png` (`purpose: maskable`), com `theme_color` `#3A2618`. Sugestão de venda: um botão "Baixar placa" que preenche `placa-qr.svg` com o nome, o endereço e o QR da marca escolhida.
- **Copywriter:** espaço que não quebra nos tempos e distâncias da placa (seção 6).
- **Devops:** incluir no pré-cache:
  - `fontes/*.woff2` e `fontes/LICENSE.txt`;
  - `css/*`;
  - `icones/*`;
  - `manifest.webmanifest`.

  A `arte/placa-qr.svg` (75 KB) não precisa ir para o pré-cache.
