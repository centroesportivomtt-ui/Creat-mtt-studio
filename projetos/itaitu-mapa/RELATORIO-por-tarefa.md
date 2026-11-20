# Trilhas de Itaitu · registro por tarefa (arquivo do RELATÓRIO parcial, 20/11/2026). O relatório final está em RELATORIO.md

## Resumo
- **O que é:** app web offline do vale de Itaitu (Jacobina, BA) em `site/itaitu/`. Mapa 3D do relevo iluminado pelo sol do minuto, a sombra da serra andando no mapa e, em cada poço com coordenada, a hora em que a serra tira o sol, "saia até" e "volte com luz até". Marca da pousada por JSON (`?m=<slug>`), GPS, gravador de trilha, SOS, cartão 1080x1920 e demo de 60 s (`?demo=1`). App particular do Marcos em `marcos.html` (confirmar pontos, gravar trilha oficial, pacote, vitrine, placa com QR, caderno, kit).
- **Prova local (T12):** `node projetos/itaitu-mapa/testes/rodar-tudo.mjs` passou inteiro: 37 testes de unidade, pré-cache completo (356 arquivos, 14,53 MB), conferência em celular Android emulado online e **offline** (mapa, relevo, satélite, sombra, horas, régua, cartão e `marcos.html` sem rede) e as horas da tela contra um cálculo independente (Véu 16:05 na tela, 16:07 bruto; Arapongas 15:40).
- **Não verificado no ar.** Nada foi publicado. A conferência no endereço de produção só vale depois do deploy que o dono autorizar.
- **Gasto:** nenhum. Nenhuma imagem comprada, nenhuma API paga, nenhuma dependência nova.

## Como rodar e testar
```
cd site && python3 -m http.server 8000
# abrir http://localhost:8000/itaitu/            app do hóspede
# http://localhost:8000/itaitu/?m=demo-village   com a marca de demonstração do Village
# http://localhost:8000/itaitu/?demo=1&m=demo-village   demonstração de 60 s
# http://localhost:8000/itaitu/marcos.html       app particular do Marcos (PIN no 1º uso)
# ?agora=2026-11-20T13:00 fixa o relógio; ?sw=0 desliga o service worker (desenvolvimento)

node projetos/itaitu-mapa/testes/rodar-tudo.mjs          # todos os testes, ~4 min (LEIA: testes/LEIA.md)
node projetos/itaitu-mapa/testes/rodar-tudo.mjs --rapido # sem a demo de 60 s
```
Mudou arquivo em `site/itaitu/`: `node projetos/itaitu-mapa/scripts/gerar-precache.mjs` e troque `VERSAO_DA_LISTA` no `sw.js` pela versão impressa.

**Instalar no celular:** abrir o endereço uma vez com sinal e esperar "Pronto para usar sem internet" (14,5 MB). Android/Chrome: menu, "Instalar app". iPhone/Safari: Compartilhar, "Adicionar à Tela de Início". Para a demonstração na pousada, o `marcos.html` tem a vitrine ("Rodar demonstração" abre `?m=<slug>&demo=1&vitrine=1` presa na trava).

**Publicar (decisão do dono, não feito):** o workflow `.github/workflows/sede-ao-vivo.yml` publica a pasta `site/` inteira no GitHub Pages a cada push na `main`. Hoje os arquivos do app ainda não estão commitados (`git status` mostra `site/itaitu/` quase todo como novo). Publicar = commitar na branch `claude/epic-darwin-1jgb15`, abrir PR para a `main` (o CI do `sede-ao-vivo` roda nos PRs que mexem em `site/**`) e fazer o merge. Endereço resultante: `https://centroesportivomtt-ui.github.io/Creat-mtt-studio/itaitu/`. Depois do merge, rodar a conferência no endereço real: `node projetos/itaitu-mapa/testes/conferir-app.cjs https://centroesportivomtt-ui.github.io/Creat-mtt-studio/itaitu/` e `node projetos/itaitu-mapa/testes/comparar-com-app.cjs <mesmo endereço>`, e abrir num celular com internet móvel. Até isso: **não verificado no ar**.

---


## T2 (Trilho, DevOps): tiles, mapa-base, vendor, service worker, pré-cache, protótipos (20/11)

**Feito**
- `scripts/baixar-tiles.mjs` rodado de verdade. bbox -40.60,-11.42,-40.40,-11.26, z8 a z14. Relevo Terrarium (AWS): 132 tiles, 11,35 MB (z8 1, z9 1, z10 2, z11 4, **z12 9/9 completo**, z13 25, z14 90). Satélite Sentinel-2 cloudless **2016** (camada `s2cloudless_3857`, CC BY 4.0): 132 tiles, 1,22 MB, mesma contagem. Nenhum 404 e nenhum erro. Total 12,57 MB, dentro da meta de 20 MB, então o z14 do satélite não precisou ser cortado. Contagem em `dados/tiles-contagem.json`.
- Altitude decodificada do z12: vila 562 m, Véu 659 m, Arapongas 593 m (no z14: 562, 656, 590).
- `scripts/gerar-base.mjs` gera `site/itaitu/dados/base.geojson` (381 KB, 655 features): ruas 400 (com `classe`), rios 87 (14 com nome), prédios 94, parque 1 (Sete Passagens), área 73 (uso do solo e pontos `tipo:'lugar'` com nome de localidade). Coordenadas com 6 casas, Douglas-Peucker de cerca de 2 m.
- `scripts/preparar-vendor.mjs`: MapLibre 5.24.0 (js, css, licença) copiado para `site/itaitu/vendor/`, e qrcode-generator **2.0.4** baixado do tarball oficial do npm, com integridade sha512 conferida. Ficam `qrcode-generator.js` (global `qrcode`) e `qrcode-generator.mjs` (`export default`). O pacote do npm não traz o arquivo LICENSE, então o texto MIT vem de `github.com/kazuhikoarase/qrcode-generator` (master). Hashes em `site/itaitu/vendor/VERSOES.json`. SHA-256 do qrcode-generator.js: `de4863c835264c5700e6f46b18297563a4f3558729c5996958cf5866bad59dac`.
- `site/itaitu/dados/atribuicoes.json`: OSM (ODbL), Terrain Tiles, Sentinel-2 cloudless 2016 (CC BY 4.0), MapLibre (BSD-3), qrcode-generator (MIT), Atkinson Hyperlegible Next (OFL; a fonte ainda não está na pasta, o designer baixa).
- `site/itaitu/sw.js`: protocolo documentado no cabeçalho (precachear, estado, atualizar e BroadcastChannel `itaitu-cache`). Um acréscimo ao protocolo: `estado` pode trazer `nova_versao`, para a página mostrar "atualizar mapa". `precache.json` traz `hash` por arquivo, e assim o `atualizar` copia do cache antigo o que não mudou.
- `scripts/gerar-precache.mjs` gerou `site/itaitu/precache.json` (versão 9a0af159a178, 275 arquivos, 13,59 MB; o casco tem só o vendor por enquanto). Aceita `--app=<pasta>` para testar uma cópia.
- Protótipos copiados para `prototipos/`: hora_da_serra.py, sol_serra.py, cartao_mock.py e relevo.py. Eles leem os tiles num formato plano `dem12/{x}_{y}.png` do scratchpad. No app, o mesmo dado está em `site/itaitu/tiles/dem/12/{x}/{y}.png`.

**Como verificar**
- `node projetos/itaitu-mapa/scripts/baixar-tiles.mjs` roda de novo e pula o que já foi baixado. Depois, `du -sh site/itaitu/tiles`.
- `node projetos/itaitu-mapa/scripts/gerar-precache.mjs` **tem de rodar de novo quando todos os arquivos do app existirem** (tarefa final do devops).
- Teste feito no Chromium (Playwright), numa cópia em scratchpad com página de teste: o install guardou o casco; `precachear` chegou a `pronto` (14,25 MB, 0 erros); offline com `?demo=1`, tile z12, satélite z14, base.geojson e vendor responderam 200; tile fora do recorte deu 404 limpo; navegação `/marcos` offline caiu na página certa; `atualizar` para uma versão nova não baixou nenhum tile de novo (copiou pelo hash), deixou só um cache `itaitu-v*` e continuou offline.

**Pendente / para os outros módulos**
- Nas fontes do MapLibre, usar `bounds: [-40.60,-11.42,-40.40,-11.26]` e `maxzoom: 14`. Sem isso, o mapa pede tiles fora do recorte e o console mostra 404 (critério 2).
- A página deve registrar `./sw.js`, mandar `{tipo:'precachear'}` na primeira visita com sinal e chamar `navigator.storage.persist()`.
- O SW usa `skipWaiting` e `clients.claim`. Uma página aberta durante a troca de versão pode receber js novo num import tardio. O risco é baixo.
- O satélite 2016 tem cerca de 10 m por pixel: serve de contexto, não de detalhe.
## T1 · Arquitetura (Cirro, 20/11/2026)

**O que foi feito:** `ARQUITETURA.md`, o contrato único que as outras 11 tarefas leem: árvore de `site/itaitu/` com um dono por arquivo, `window.Itaitu` e eventos, relógio UTC−3, API do motor (nucleo/worker/cliente), ids de fontes e camadas, regras exatas de estado e de horas (saia até, volte com luz, amanhã), esquemas JSON (recorte, marca, índice, info, base, pacote v1, kit v1, IndexedDB), protocolo do service worker, abertura de 5 s, voos, luz, som, demo de 60 s, cartão, orçamentos, escopo cortado, riscos e 18 divergências justificadas. Nenhum código do app foi escrito.

**Arquivos tocados:** `projetos/itaitu-mapa/ARQUITETURA.md` (novo), `projetos/itaitu-mapa/RELATORIO.md` (esta seção).

**Conferido nesta tarefa:**
- Protótipo `sol_serra.py` com só a grade 3x3 do recorte (z12 x 1586–1588, y 2176–2178) dá Véu 16:07 e Arapongas 15:40 em 20/11/2026, os mesmos valores da grade 7x6 do `hora_da_serra.py`. Logo a grade do recorte basta para o motor.
- Estado dos pontos com os dados atuais: placa com 3 confirmadas (Véu, Arapongas, Coxinho), Flores aproximada, 3 sem coordenada; Urubu confirmada fora da placa. Diverge do conceito ("2 e 5"); registrado.
- `vendor/maplibre-gl.js` é 5.24.0 UMD, tem color-relief, hillshade-illumination-altitude e avisa no console se hillshade divide fonte com o terreno (por isso `dem` e `dem-relevo`).
- `pause()` da CanvasSource sobe a textura (por isso `play(); pause();` para atualizar a sombra).
- Contraste #3A2618 / #FFF4DC = 13,1:1.
- Node 22.23 importa `.js` com `export` sem package.json (o teste do motor importa `nucleo.js` direto).

**Como verificar:** ler `ARQUITETURA.md`; cada tarefa confere se os seus arquivos aparecem na seção 1 com o seu nome e se as assinaturas que consome existem nas seções 2, 4, 6 e 9.

**Alinhado com o T2 (devops rodou em paralelo):** a seção 8 descreve o `sw.js` e o `precache.json` que já existem (`hash`, `bytes_total`, `nova_versao`, rede primeiro de 2,5 s, URLs sem `./`); `base.geojson` usa `camada` no plural (`ruas`, `rios`, `predios`, `parque`, `area`); vendor com `qrcode-generator.mjs` 2.0.4; fontes raster com `bounds` e `maxzoom: 14`.

**Pendente:**
- Pedido ao devops: criar `site/itaitu/dados/recorte.json` (seção 7.0 da arquitetura) e incluí-lo no `precache.json` final.
- Valores de Coxinho e Urubu: o teste em Node do backend calcula e registra; não há valor de referência.
- A recomendação de satélite pago ficou fora desta entrega, por decisão do conceito.

## T1 (revisão) · Arquitetura, ajustes pedidos pelo revisor (Cirro, 20/11/2026)

**O que mudou em `ARQUITETURA.md`:**
- **Nota de incerteza por confiança (6.3, riscos 1).** Agora é ±10 min para `alta` e ±15 min para `media` (`incertezaMin` em `hora/regras.js`; chave `hora.nota` com `{min}`). `escurece` e "volte com luz" não levam a nota. Teste novo de sensibilidade (seção 10): cada ponto confirmado é deslocado 50 m para N, S, L e O, a variação vai para o RELATORIO e o teste falha se passar da nota.
- **Perfil, toque longo e Marcar ponto aqui com dono (2.1, 2.2).** Tabela "função do briefing → arquivo → onde aparece". `perfil.js` e `marcar.js` são arquivos novos do frontend A. O toque longo fica no `mapa.js`, com o botão "Coordenada do centro do mapa" como alternativa de teclado. A formatação de coordenada fica em `util.js` (puro), junto com o SOS. O motor ganhou `altitudes()` (4.3) e o `Itaitu.motor` com o evento `itaitu:motor`. O banco ganhou a store `marcados` (7.7), e o mapa ganhou a fonte `marcados` e a camada `pontos-marcados`.
- **Régua (6.4).** `min = arredondar5(nascer,'cima')` e `max = arredondar5(escurece,'baixo')`, em minutos inteiros (20/11: 310 e 1090). O `value` vem de `valorDaRegua`, e o `aria-valuetext` usa `hhmm`.
- **Critérios de aceite numerados (seção 12).** Os 9 critérios do conceito aprovado "Hora da Serra" foram copiados do texto da tarefa do fluxo, com o ajuste deste contrato entre colchetes e "como conferir" em cada um. O resumo do conceito também está lá.
- **Estimativa e fato (6.2, 9.6).** A regra dos múltiplos de 5 vale só para estimativa. A chegada do cartão é fato e aparece exata. `minutosDeSolNoPoco` = chegada exata menos o apaga exibido. Os números do cartão estão marcados como ilustrativos. Novas chaves `cartao.frase_sombra` e `cartao.frase_sem_hora`.
- **Tempo da placa (6.1).** `tempoMaisLentoMin` em `util.js` aceita uma lista fechada de formatos (`N h`, `N h M`, `NhM`, `N min`, faixas). Os casos de exemplo estão numa tabela. O que não se encaixa vira `null`, o que leva à situação `sem-tempo`, nunca a um valor chutado.
- **Casos de borda (6.2, 9.1).** Com a lista vazia, `deveMostrarAmanha` dá falso. O alvo do arraste da abertura é o 1º ponto que ainda tem sol. Sem alvo, o passo dos 4 a 5 s não acontece.
- **Camadas (5).** Cada camada filtra por `camada` e por tipo de geometria: `area`, `parque`, `parque-contorno`, `rios-agua` (8 polígonos), `rios` (79 linhas), `ruas` e `predios`. Os 45 Points `tipo:'lugar'` viram marcador HTML `.rotulo-lugar` do `mapa.js`, com zoom ≥ 12,5. A conta fecha nas 655 features.
- Divergências 19 a 23 registradas.

**Conferido nesta tarefa (protótipo `sol_serra.py`, grade 3x3 do recorte, 20/11/2026, deslocamento de 50 m, ordem N, S, L, O, em min):** Véu (alta) +6, −6, 0, −1; Arapongas (media) +11, −6, +4, −4; Coxinho (media) +2, −5, +1, 0; Urubu (media) +2, 0, +11, −7. Todos ficam dentro da nota nova. A contagem de `base.geojson` por camada e geometria foi conferida no arquivo: area 28 polígonos + 45 Points, parque 1, rios 8 + 79, ruas 400, predios 94.

**Arquivos tocados:** `projetos/itaitu-mapa/ARQUITETURA.md` e `projetos/itaitu-mapa/RELATORIO.md` (esta seção). Nenhum código do app.

**Como verificar:** confira em `ARQUITETURA.md` as seções 2.1, 2.2, 5, 6.1 a 6.4, 9.1, 9.6, 10 e 12. A busca por `min="nascer"`, por "maior número" como regra e por critério sem número tem de voltar vazia.

**Pendente:**
- O backend escreve os casos novos do teste (sensibilidade, `tempoMaisLentoMin`, `deveMostrarAmanha` vazio, régua, `minutosDeSolNoPoco`).
- O shader acrescenta `altitudes` ao worker e ao cliente.
- O copywriter fecha as chaves novas (`hora.nota` com `{min}`, `cartao.frase_sombra`, `cartao.frase_sem_hora`, `perfil.*`, `mapa.*`, `marcar.*`).
- Um erro de posição acima de cerca de 100 m num ponto `media` ainda pode passar de 15 min. A defesa é confirmar a posição em campo pelo pacote.

## T3 · Sistema visual (Paleta, designer, 20/11/2026)

**Feito**
- `site/itaitu/css/tokens.css` traz as variáveis do sistema:
  - cores com papel fixo (dourado só quer dizer sol, azul só quer dizer sombra);
  - relevo pintado, de 480 m a 1050 m, conferido num render com os tiles z13;
  - temas claro (papel) e escuro (noite de serra), desenhados um a um;
  - os modos `data-contraste="sol"`, `data-texto="grande"`, `data-economia="1"`, `data-tabua="clara"` e `data-tema`;
  - escala de tipo, espaço, alvos, raios, sombras, tempos e curvas.
  - `--cor-parceiro` (que o `marca.js` escreve) alimenta `--cor-marca`.
- `site/itaitu/css/fontes.css` e `site/itaitu/fontes/`: Atkinson Hyperlegible Next 2.001.
  - Fonte: repositório oficial `googlefonts/atkinson-hyperlegible-next`, commit 7925f50.
  - Pesos 400 e 700 em woff2, sem modificação, 50,8 KB no total. `LICENSE.txt` é a OFL 1.1.
  - **A fonte tem `tnum`** (conferido no GSUB, dígito de 632/1000), então não foi preciso trocar de fonte.
- `site/itaitu/css/tabuas.css`: as tábuas da placa.
  - Madeira, veio, pregos e botões HTML de verdade.
  - A confirmada tem **ponta de seta**. A aproximada tem contorno tracejado e selo. A sem coordenada tem "vá com guia" e o botão "Chamar um guia".
  - O CSS esconde as horas nas tábuas aproximada e sem coordenada, mesmo que venham no HTML.
  - Plano B `.tabua--clara` ou `[data-tabua='clara']`, e o modo sol em preto e branco.
- `site/itaitu/css/regua.css`:
  - a régua (`input range` com alça de 48 px desenhando o sol, janela de sol, crepúsculo, "agora", marcas, foco em dois tons, estado arrastando);
  - a faixa `#hora-faixa` / `.faixa-saia`, com número de 40 px;
  - `.etiqueta-hora`, que acende uma vez;
  - `.polegar-fantasma`.
  - Tudo respeita `prefers-reduced-motion` e a economia.
- `site/itaitu/icones/`:
  - o ícone (a serra de mesa tirando o sol, com a sombra azul avançando sobre o vale) em SVG, 192, 512, maskable 512, apple-touch 180, favicon SVG e 32;
  - a variação do Marcos em negativo (`marcos-192.png`, `marcos-512.png`, `marcos-maskable.png` e os SVG);
  - o sprite `ui.svg`, com 16 ícones e sem marca de terceiros (`i-whatsapp` é um balão genérico).
  - Os PNG foram gerados com o Chromium do Playwright.
- `site/itaitu/manifest.webmanifest`: "Trilhas de Itaitu", short_name "Itaitu", `id`/`start_url`/`scope` `./`, standalone, cores `#3A2618`.
- `site/itaitu/arte/placa-qr.svg`: placa da recepção.
  - 15 x 20 cm (3:4), quatro tábuas, "Aponte a câmera: esta placa vai com você."
  - Tem `#qr-area` de 56 mm numa chapa branca, `#nome-parceiro` e `#endereco`.
  - As fontes vão embutidas (75 KB).
- `projetos/itaitu-mapa/DESIGN.md`:
  - ficha, tokens, escala, grade e estados;
  - especificação do cartão 1080 x 1920 em pixels, com zona segura de `y` 250 a 1680, texto mínimo de 30 px e selo desenhado com `ctx.arc`;
  - especificação da placa e a tabela de 42 pares de contraste. Madeira com tinta dá 13,08:1, e todos os pares ficam em AA ou acima.

**Arquivos tocados:** `projetos/itaitu-mapa/DESIGN.md`, `site/itaitu/css/{tokens,fontes,tabuas,regua}.css`, `site/itaitu/fontes/*`, `site/itaitu/icones/*`, `site/itaitu/arte/placa-qr.svg`, `site/itaitu/manifest.webmanifest` e esta seção.

**Como verificar**
- Página de teste temporária fora do repositório, com link simbólico para `site/itaitu`, rodada com `olhar.cjs` nas 4 configurações: "Tudo limpo".
- Script de medição em 390 px, em 9 combinações de modo:
  - `scrollWidth` 390;
  - nenhum alvo abaixo de 44 px;
  - números da tábua em 30 px (37,5 no texto grande) e da faixa em 40 px;
  - fontes carregadas e `tabular-nums` ativo;
  - nenhuma tábua sem posição com hora;
  - polegar e animações desligados no movimento reduzido e na economia;
  - a seta do teclado move a régua de 5 em 5;
  - zero erro de console.
- Os prints foram olhados. O cartão foi provado num canvas com o relevo real, nas variantes sol, sombra e sem hora, sem texto fora da zona segura.

**Pendente / pedidos (detalhe no DESIGN.md, seção 12)**
- **Pedido ao A, que afeta a venda:** guardar o último `?m=` válido e reaplicar quando o app instalado abrir sem parâmetro. Sem isso, o hóspede que instala pelo QR da pousada perde a marca dela.
- **Pedido ao A:** validar `cor` da marca com 3:1 ou mais contra `#FFF4DC`; o demo do Village (`#C8742B`) dá 3,21:1.
- **Pedido ao B:** etiqueta com `anchor: 'bottom'`, `data-luz` na `<li>` da tábua e cartão desenhado pela seção 7 com `numeroTabular`.
- **Pedido ao C:** `manifest-marcos.webmanifest` com os ícones `marcos-*`.
- **Pedido ao copywriter:** espaço que não quebra em "≈ 30 min" e "30–40 min".
- **Pedido ao devops:** incluir `fontes/`, `css/`, `icones/` e o manifest no pré-cache. A placa não precisa ir. Em `dados/atribuicoes.json` ainda está escrito que a fonte "ainda não está na pasta"; ela já está.
- **Não verificado ao sol de verdade.** A troca para a tábua clara (plano B) fica para a caminhada de prova com o app pronto. A placa ainda não foi impressa nem lida com QR real.

---

## T5 · Som (Eco): tóin da araponga, 3 ambiências e liberação por toque

**O que foi feito**
- `site/itaitu/js/som.js` (26.002 bytes; 8,6 KB com gzip), módulo ES só com Web Audio. Não usa arquivo de áudio, biblioteca nem rede. Importar não cria nada; o `AudioContext` só nasce em `liberar()` **dentro de um gesto** (confere `navigator.userActivation.isActive`).
- API da T5: `liberar()`, `toin({intensidade, pan})`, `tic({hora})`, `ambiencia(hora)`, `definirModo({economia, mudo})`, `parar()`, `estado()`. Também tem os nomes do contrato 9.4: `tocar('araponga')` e `silenciar(sim)`. `ambiencia` aceita hora decimal (0–24), minuto do dia (> 24, como diz a 9.4) ou o `detail` do `itaitu:hora`.
- **Tóin:** ataque metálico (FM que some em 40 ms e estalo de ruído em 3–4 kHz), parciais de barra (1; 2,0–2,1; 2,76; 5,4), tom que cai 3 semitons em 50 ms e segue caindo na cauda (400 a 700 ms, sorteada). Fundamental, cauda, parciais e panorama mudam a cada chamada. O eco do paredão (resposta de vale gerada em código, ecos em 0,29 e 0,58 s, agudos cortados em 5 kHz) é a assinatura.
- **Ambiências:** manhã (vento com filtro que respira e passarinhos distantes sorteados), tarde (duas cigarras: ruído em faixa estreita, zumbido por AM de 118 e 147 Hz e inchaço lento) e noite (três grilos com 3 a 4 pulsos por cricrilo, coro distante e fundo). O cruzamento é de potência constante pela hora: manhã das 4h30 às 11h30, tarde das 9h30 às 18h30, noite a partir das 17h30. Cada camada só existe enquanto tem peso.
- **Regras:** saída com teto por WaveShaper, linear até -18 dBFS e nunca acima de -14,7 dBFS. Toda entrada e saída tem rampa. A ambiência abaixa 6 dB sob o tóin. Pausa (suspende) com a aba oculta e volta ao reaparecer. Economia ou mudo fecham o contexto. A escolha do mudo fica em `localStorage 'itaitu:som'` (`{mudo}`), sempre em try/catch.
- `som.js` se liga sozinho, na primeira liberação, a `itaitu:economia` e a `itaitu:hora`. Sem hora conhecida, usa `Itaitu.agora()` em UTC-3.
- **`botao()`** devolve um `<button class="botao-som">` pronto. O texto diz o estado ("Som: ligado", "Som: desligado", "Som: desligado na economia"), com `aria-pressed`. Ao religar, toca um tóin fraco de confirmação.
- `renderizar(nome, opcoes)` faz a renderização offline usada pela bancada.
- `projetos/itaitu-mapa/testes/som-bancada.html`: botões para ouvir cada som, régua de hora, mudo, economia e o modo "Renderizar e medir" (OfflineAudioContext). Ele imprime pico, RMS, duração, NaN, primeira e última amostra, início 2 ms, fim 20 ms, salto máximo sobre o p99,9 e cauda, e confere a emenda do laço de ruído. O resultado fica em `window.resultadoBancada`.

**Decisão que diverge da ARQUITETURA (9.4 e critério 9), com o porquê**
- A 9.4 diz "mudo em movimento reduzido"; a T5 diz que movimento reduzido não é mudo. Adotado: **em `prefers-reduced-motion` a ambiência contínua não toca**, e o tóin e o tic só soam num gesto explícito.
- Isso cumpre o critério 9 na prática: a abertura é pulada, então nada soa sozinho. Também respeita a pessoa que tocou de propósito. Só economia e mudo calam tudo.
- Quem conferir o critério 9 deve procurar "sem som automático".

**Medido (Chromium do Playwright da sessão, 20/11, `testar.cjs` e `gesto.cjs` no scratchpad)**

| evento | som | duração | pico | RMS |
|---|---|---|---|---|
| arrastar o sol na abertura (4–5 s) e `tocar('araponga')` | tóin da araponga | ataque 3 ms, cauda 0,4–0,7 s, -40 dB em 0,77–0,89 s com o eco | cerca de -18 a -24 dBFS, variando por sorteio (40 renderizações, intensidade 1) | -41 dBFS |
| passar hora cheia na régua | tic (1,6–2,6 kHz, sobe com o sol) | 35 ms | -34 dBFS | -57 dBFS |
| hora 4h30–11h30 | manhã: vento e passarinhos | contínua | -24,7 dBFS | -39,3 dBFS |
| hora 9h30–18h30 | tarde: cigarras | contínua | -22,0 dBFS | -39,1 dBFS |
| hora 17h30–6h | noite: grilos | contínua | -21,6 dBFS | -38,9 dBFS |
| régua arrastada 16h→20h e 4h→12h em 8 s | cruzamento | contínua | -22,5 e -23,5 dBFS | -38,5 e -40,3 dBFS |

- 12 renderizações offline: zero NaN, primeira e última amostra iguais a 0, pico sempre abaixo de -14 dBFS. O maior salto entre amostras fica entre 1,5 e 2,1 vezes o p99,9, sem pico isolado e sem estalo nas trocas de hora.
- Laço de ruído de 6 s: a emenda rosa fica no percentil 54 dos saltos, com 0,36 dB de diferença de nível entre o começo e o fim. O branco fica no percentil 34. O ruído rosa é filtrado em duas voltas, e por isso o fim emenda no começo.
- Ao vivo, com clique de verdade: importar não cria contexto. `liberar()` fora de gesto devolve falso e não cria contexto; com o clique, o contexto fica `running`. Aba oculta deixa o contexto `suspended`, e a volta deixa `running`. Mudo fecha o contexto (`closed`), grava `{"mudo":true}` e continua mudo depois de recarregar. O evento `itaitu:economia` fecha o contexto e o botão diz "desligado na economia". Zero `console.error`.
- Os espectrogramas foram olhados (ffmpeg `showspectrumpic`): parciais e ecos do tóin, glissandos dos passarinhos, faixas das cigarras em 4,7 e 5,6 kHz e a troca de cigarra para grilo na varredura.
- **Não foi ouvido por ouvido humano.** A sessão não tem alto-falante. A análise numérica cobre nível, estalos, NaN, emendas e o espectro; não cobre se o tóin "parece araponga", se a ambiência agrada nem o volume num celular real. Para isso: abrir a bancada no celular e ouvir.

**Como verificar**
- Sirva a raiz do repositório (por exemplo `python3 -m http.server` na raiz) e abra `/projetos/itaitu-mapa/testes/som-bancada.html`. Clique em "Renderizar e medir": deve sair "Tudo dentro do limite.". Depois ouça os botões, de preferência no celular.
- Tamanho: `wc -c site/itaitu/js/som.js` deve dar menos de 30.720.

**Pendente / pedidos**
- **Pedido ao B (`hora/index.js`, `abertura.js`):**
  - chamar `Som.liberar()` no primeiro `pointerdown` ou `keydown` (captura, no `document`);
  - passar `tocarSom: (n) => Som.tocar(n)` à abertura;
  - na régua, `Som.tic({hora})` ao cruzar hora cheia;
  - no arraste, `Som.toin({pan})` com o `pan` da posição do marcador na tela (-1 a 1);
  - a ambiência segue sozinha pelo `itaitu:hora`.
- **Pedido ao A:** montar `Som.botao()` no painel Informações, perto da economia, ou nos controles do mapa. O som é sempre acompanhado da palavra no botão.
- **Pedido ao devops:** incluir `js/som.js` no `precache.json` quando o script rodar de novo.
- A ouvir no aparelho: o nível da ambiência (-39 dBFS RMS) pode ser baixo demais num alto-falante de celular ao ar livre. Se for, sobe por `NIVEL` em `som.js`, com o teto garantido.

## T4 · Textos, notas de honestidade, info.json e marcas (Verbo, copywriter, 20/11/2026)

**Feito**
- `site/itaitu/js/textos.js`: módulo ES puro, sem DOM. Tem 460 chaves em 25 namespaces: os 16 pedidos mais app, hora, destinos, marca, marcar, perfil, mapa, informacoes e marcos. Cada chave está comentada no topo.
  - `t(chave, vars, provisorio)` segue a ARQUITETURA 6.5, e as 43 chaves mínimas existem.
  - `T['hora.nota']` também funciona. Os apelidos `tabua`, `gravar`, `cache` e `rota` apontam para `tabuas`, `gravador`, `armazenamento` e `gps`.
  - O artigo sai sozinho: `{o:nome}`, `{do:nome}`, `{no:nome}` e `{ao:nome}` dão "o Véu", "das Arapongas", "à Geladeira". Quem chama passa só o nome.
- Funções com a assinatura pedida: `fraseApaga`, `fraseSaiaAte`, `fraseVolteComLuz`, `fraseCartao`, `notaCalculo`, `notaNublado`, `avisoSemCoordenada`, `avisoAproximada`, `ariaRegua`, `ariaSombra`, `nomeCurto` e `textoAmanha`.
  - Extras: `fraseDaHora` (a frase dos 5 s inteira), `notaDeCalculo(min)`, `comArtigo`, `duracaoTexto`, `numeroBR`, `linhaDaPlaca`, `semQuebra`, `rumoTexto`, `textoSMS` e `legendasDoCartao`.
- Textos fixos alinhados ao `DESIGN.md`, seção 7: os rótulos do cartão ("cheguei", "trilha", "tempo", "desnível"), o selo "06:10–16:05", "sem hora de sol", "luz real de 20/11 às 15:50" e o pé. A régua usa "nascer 05:10" e "pôr 17:50 · escurece 18:10". A placa é `T.placa`, com o mesmo título do `placa-qr.svg`.
- SEO em `T.meta`:
  - `<title>` com 54 caracteres e um alternativo com 57;
  - descrição com 150;
  - og, h1 e canonical;
  - og:image vazio até existir a arte.
- `site/itaitu/dados/info.json`: 18 informações, cada uma com fonte, data, `confirmado` e `desatualizado`.
  - 11 ficam como não confirmadas e 4 como desatualizadas.
  - Conferido na web em 20/11: o Estado de Minas (21/07/2026) diz "Evite trilhas durante chuva forte por risco de enxurradas" e "mais de 40 quedas d'água".
  - A busca não achou fonte para "não há caixa eletrônico", que fica como não confirmado.
- Marcas, todas com `credito`, boas-vindas de 2 frases sobre a Hora da Serra e `_pendente`:
  - `padrao.json`: `#C9283E` (a cor do designer), base no Village;
  - `demo-village.json`: `#8E2C6E` (7,0:1 no creme);
  - `demo-camping.json`: Camping Payayás, `#1E7A46` (4,9:1); a base fica vazia e cai na vila;
  - `indice.json` lista as três.

**Decisões**
1. `notaCalculo` é a constante de ±10 pedida. Pela ARQUITETURA 6.3, a confiança `media` (Arapongas, Coxinho e Urubu) leva ±15: a tábua usa `notaDeCalculo(incertezaMin(ponto))`.
2. `fraseSaiaAte` faz sentido sozinha, porque diz o lugar. A frase do conceito sai de `fraseDaHora`. Use uma das duas formas, não as três funções juntas.
3. Nas demos, o nome leva "(demonstração)". O site é público, e sem isso `?m=demo-village` parece o app oficial da pousada. Sai quando o parceiro assinar.
4. O botão do WhatsApp da marca diz "Falar com a recepção", que serve para pousada e para camping.
5. Legenda 6 nova, da Hora da Serra: aparece primeiro só quando o hóspede chegou com sol. As 5 do `legenda-story.md` ficam iguais e com o mesmo número.
6. O SMS do SOS vai sem acento. Com ç e ã, o celular manda 70 caracteres por parte; sem eles, a mensagem cabe numa parte só (152 de 160). **Corrigido na revisão:** o 152 estava errado. Com o link do app (`T.meta.url`, 64 caracteres) a mensagem dava de 165 a 168, conforme a precisão. Agora o `textoSMS` garante até 160; os números estão na seção "T4, ajustes do revisor".
7. Em parceiros só entra a ACAGI, com o perfil público. O contrato 7.1 pede link https, e o revisor conta link vazio como falso pronto. O "onde comer" fica vazio e marcado.
8. Espaço que não quebra (pedido do designer) só em `linhaDaPlaca`. A nota de ± e as frases de hora usam espaço comum, para os testes acharem "±10 min".

**Como verificar**
- `node --input-type=module -e 'import * as X from "./site/itaitu/js/textos.js"; console.log(X.fraseDaHora({nomeCurto:"Véu",apagaHHMM:"16:05",saiaHHMM:"14:30",minutosDeSol:60}))'` imprime "A serra apaga o sol do Véu às 16:05. Para ter 1 hora de sol no poço, saia até 14:30."
- `for f in site/itaitu/dados/info.json site/itaitu/marcas/*.json; do node -e 'JSON.parse(require("fs").readFileSync(process.argv[1]))' "$f" && echo ok $f; done`
- A varredura de falso pronto do revisor nos 6 arquivos dá zero acerto, e a busca por "único no mundo" também.
- No Chromium (Playwright, 390 px, servindo uma cópia por link simbólico), o módulo e os 5 JSON carregaram com o console vazio.

**Pendente / pedidos**
- **Ao B (cartao.js), que afeta a honestidade:** a conta "apaga − chegada" inclui tempo sem sol se o hóspede chegar antes de o sol entrar no poço. Use `max(chegada, nasce)`.
- **Ao A (marca.js):** ignorar campos que começam com `_` e aceitar parceiro só com link https.
- **Ao devops:** rodar o `gerar-precache.mjs` de novo para incluir `js/textos.js`, `dados/info.json` e `marcas/`.
- **Ao designer:** `arte/og.png` de 1200x630. Quando existir, preencher `meta.og_imagem` e trocar `twitter_card` para `summary_large_image`.
- **Em campo, com o Marcos:** confirmar o caixa eletrônico e as taxas (Véu, jul/2025; Piancó, out/2025; parque, abr/2023). Também o horário do posto do parque (abr/2023) e o ônibus, em que as fontes divergem.

## T5, ajustes do revisor (Eco, 20/11)

**O que mudou**
- **Correção em `site/itaitu/js/som.js`:** `ultimoToin` e `ultimoTic` voltam a `-Infinity` dentro de `fechar()` e logo depois de `new AC(...)` em `liberar()`, e já nascem assim. Cada contexto novo recomeça o relógio em 0, e o valor do contexto antigo travava o tóin e o tic.
- **O furo era maior do que o relato do revisor:** com o valor inicial `0`, o **primeiro tóin da vida da página também não soava**, porque no primeiro gesto o relógio do contexto ainda está abaixo de 0,12 s. Na versão anterior, o 1º gesto em "Tóin da araponga" criou 4 osciladores, só a ambiência. Na corrigida, criou 9: 4 da ambiência e 5 do tóin.
- **Teste novo** `ciclo.cjs` no scratchpad do Eco, chamado ao fim do `gesto.cjs`: o 1º gesto toca o tóin, espera 3 s, toca de novo, clica no botão de som para mudo, clica de novo para religar, toca o tóin e o tic logo depois, liga a economia, desliga e toca o tóin. Os osciladores são contados por contexto.
- **Documentação:** na tabela de sons, o pico do tóin agora é "cerca de -18 a -24 dBFS, variando por sorteio". Medido em 40 renderizações offline: mínimo -24,1 e máximo -18,1 dBFS. Isso fica abaixo do teto de -14,7 e dentro do limite de -18 dos microssons, com folga de 0,1 dB no pior sorteio.

**Resultado do ciclo (Chromium, `--autoplay-policy=user-gesture-required`)**

| passo | antes da correção | depois |
|---|---|---|
| 1º gesto, tóin | ctx 1, 4 osc (tóin mudo) | ctx 1, 9 osc |
| tóin após 3 s | 5 osc | 5 osc |
| mudo | ctx fechado | ctx fechado |
| religar (tóin de confirmação do botão) | ctx 2, 4 osc (tóin mudo) | ctx 2, 9 osc |
| tóin logo depois | 0 osc | 5 osc |
| tic logo depois | 1 osc | 1 osc |
| economia liga, depois desliga | ctx 3, 4 osc | ctx 3, 4 osc |
| tóin depois da economia | 0 osc | 5 osc |
| veredito | FALHOU | passou, console sem erro |

**Arquivos tocados:** `site/itaitu/js/som.js` (26.213 bytes, abaixo de 30 KB) e este relatório. Fora do repositório, no scratchpad: `gesto.cjs`, `ciclo.cjs` e `picos.cjs`.

**Como verificar:** com o scratchpad do Eco, `node gesto.cjs` imprime primeiro `semGesto.ok:false` e `ctx:0`, depois `"ciclo": "passou"` e sai com código 0. Para ver o defeito antigo, rode `node ciclo.cjs som-antes.js`, que imprime `"FALHOU"`. A bancada `testar.cjs` continua verde, com console vazio. A varredura de falso pronto do revisor já tinha dado zero acerto.

**Pendente:** ouvir no aparelho o ciclo mudo e religar, num celular de verdade, com o Marcos. O teste conta osciladores e não substitui o ouvido. Segue valendo a pendência do nível da ambiência no alto-falante do celular.


## T7 · Motor da Hora da Serra (Prisma, shader, 20/11/2026)

**Feito** (JS puro em módulos ES, sem build, sem dependência, sem rede externa), em `site/itaitu/js/motor/`:
- `nucleo.js` (puro, roda no Node 22 e no worker): relógio da seção 3, `posicaoDoSol` (NOAA, Bennett, limbo +0,267°), `horizonte` (720 direções, olho 1,7 m, 15/30 m, curvatura com k = 0,13, corte exato pelo pico mais alto da grade), `horasDeSol`, `nascerEPor`, `arredondar5`, `gradeDeTiles`/`montarGrade` (com `grade.paraPixel`, `paraLonLat` e `amostrar` não enumeráveis: a grade continua clonável), `amostrar`, `cantosDaGrade` e um leitor de PNG (`decodificarPNG(bytes, inflar)`) que serve ao teste em Node.
- `sombra.js`: varredura de linhas na direção do sol, O(pixels), com interpolação linear da altura de sombra, borda suave e escala 1, 0,5 e 0,25. Devolve RGBA (`[27,42,74,140]` por padrão) e a máscara 0–255 (`sombraEm` consulta um lon/lat).
- `worker.js`: `init`, `horas`, `sombra`, `dia` (quadros progressivos e transferidos, cancelável), `relevoCartao`, `altitudes` e `cancelar`, respondendo sempre `{id, ok, erro?, codigo?}`. A decodificação usa `createImageBitmap` + `OffscreenCanvas` sem gestão de cor. Sem `OffscreenCanvas`, o worker avisa (`{tipo:'aviso', codigo:'sem-offscreencanvas'}`) e usa `DecompressionStream`. Sem os dois, ele pede cada tile ao cliente (`pedirTiles`).
- `cliente.js`: `abrirMotor()` (contrato 4.3) e o atalho `Motor.iniciar()/horas()/sombra()/dia()/relevoCartao()/altitudes()`, com `quadroMaisProximo(minuto)` para arrastar a régua. Uma `sombra()` nova tira da fila a anterior, que rejeita com `AbortError`; um `dia()` novo cancela o anterior; todos aceitam `{signal}`. Sem Worker, o mesmo processador roda no fio principal. O worker é criado por `new URL('./worker.js', import.meta.url)`.
- `relevo-cartao.js`: `planejarRecorte` + `relevoDoCartao`. O recorte fica centrado no traçado, com 30% de margem e no mínimo 1,5 km de largura, encaixado na caixa E do DESIGN (96,440–984,960) no 1080x1920. Usa z14 (o que faltar sai do z12), a paleta do `cartao_mock.py` (mata, cerrado e quartzito) e a luz do minuto da chegada. A semente, tirada do traçado e do minuto, muda o recorte (deslocamento e até 8% de zoom) e o grão. O resultado é ImageData com `tracadoPx`, `bbox`, `semente` e `metrosPorPx`.

**Números conferidos (20/11/2026)**
- Node, grade 3x3 z12 decodificada à mão (zlib): Véu 16:07 (967), Arapongas 15:40 (940), vila 16:54, Coxinho 16:49, Urubu 16:36, Payayas 16:25; exibidos Véu 16:05 e Arapongas 15:40; escurece 18:11 → 18:10. O `hora_da_serra.py` rodado com `python3 -I` na mesma grade 3x3 dá **diferença de 0 min** em todos os pontos e nas 3 datas dele (20/11/2026, 21/06/2027 e 22/09/2027).
- Chromium: o worker dá as mesmas horas (967 e 940). O modo sem Worker e o decodificador por `DecompressionStream` também dão 967 e 940. Nenhum erro de console.
- A sombra do mapa cobre o ponto entre −5 e +5 min da hora do texto (Véu +5, Arapongas 0 a +4, vila 0, Urubu −4).
- Custo por quadro de sombra no worker, sem freio de CPU: escala 1 = 9 ms, 0,5 = 2 ms, 0,25 = 0,5 ms. No fio principal com CPU 4x mais lenta: 41, 8 e 1,9 ms. **Escala 1 passa de 35 ms no celular lento: a abertura e o arraste usam 0,5**, e a escala 1 fica para a régua parada e o tique de 5 min (orçamento de 150 ms). Os 20 primeiros quadros de `dia` (0,5, passo de 10 min) saem em ~106 ms, o equivalente a mais de 180 fps. O freio de CPU do CDP não vale dentro do worker, então os números lentos foram medidos no fio principal.
- `horas` (3 pontos, primeira chamada, CPU 4x, fio principal) leva 387 ms, quase todo de JIT frio; aquecido, cada ponto custa ~9 ms. O horizonte de cada ponto fica em cache.
- `relevoCartao` 1080x1920 da `pe-veu-da-noiva-1` às 15:50 leva 230 a 360 ms no worker, em z14, a 1,78 m/px. O Véu fica no sol com a sombra encostando; às 16:15 fica coberto.

**Decisões**
- `apagaMin` e `escureceMin` já saem arredondados para baixo a 5 (como pedido na T7). Os brutos ficam em `apagaBrutoMin` e `escureceBrutoMin`, e `nascePocoMin` sai bruto. Arredondar de novo em `regras.js` não muda nada (a operação é idempotente).
- A sombra do cartão vem da grade z12, a mesma do mapa e das horas; o z14 só desenha a luz das encostas. Com a sombra do z14 o cânion do Véu escurecia antes de 16:07, e o cartão contradiria a frase. A borda vem da profundidade contínua da sombra, interpolada, e não fica serrilhada na ampliação de 20x.
- O motor não busca `dados/recorte.json`, porque o 404 apareceria como erro de console enquanto o arquivo não existe. Quem chama `abrirMotor({recorte})` passa o recorte; sem ele, vale o de Itaitu.

**Como verificar**
- Horas em Node: montar a grade com `decodificarPNG(readFileSync(png), zlib.inflateSync)` + `gradeDeTiles(12, tiles)` e rodar `horasDeSol(g, {lon, lat}, '2026-11-20')`.
- No navegador: `const m = await abrirMotor(); await m.sombra({minuto: 967, data: '2026-11-20'})` e desenhar `bitmap` em `m.info.cantos`.
- Prints desta tarefa (fora do repositório, no scratchpad da sessão): `print-sombra.png` (15:00, 16:07 e 17:00) e `print-cartao.png`.

**Pendente**
- O `gerar-precache.mjs` (devops) tem de incluir `js/motor/*`. O offline com `setOffline(true)` só pode ser conferido na página montada.
- O B (`hora/index.js`) deve passar `recorte` e `corSombra` (DESIGN: `[30,47,92,140]`), usar `escala: 0.5` no `dia` da abertura e `quadroMaisProximo` no arraste.
- A medição de quadros num Android de verdade fica para o qa.

## T4, ajustes do revisor (Verbo, copywriter, 20/11/2026)

**O que mudou**
1. **Regras do Véu com a fonte certa (`dados/info.json`, ALTO).** Baixei as duas páginas da Wikipédia em 20/11/2026 e procurei as palavras. A "Cachoeira Véu de Noiva (Itaitu)" não fala de acampar, de água nem de coliforme. O trecho está na página "Itaitu": "Acampamentos na Cachoeira Véu de Noiva, por exemplo, são proibidos, já que é de lá que se capta a água que abastece a vila". Bebida alcoólica não aparece na Wikipédia, no Bahia Notícias de 22/04/2020 (a ação do Ministério Público que a Wikipédia cita) nem numa busca na web.
   - `regras-veu`: "Não acampe no Véu da Noiva. Moradores da vila usam a água dali." Url e data da página "Itaitu", sem bebida alcoólica, `confirmado: false`. O texto aconselha em vez de afirmar a regra: a proibição só aparece na Wikipédia, e a ação do MP *pede* o isolamento das áreas de camping não autorizadas.
   - `agua`: "Não beba a água do rio sem tratar. Em 2020, uma ação do Ministério Público citou coliforme fecal na água do Véu da Noiva." Fontes: Wikipédia "Itaitu" e Bahia Notícias, com a frase do exame. Data 2020-04-22, `confirmado: false` (o site do MP recusou a conexão duas vezes e não tem cópia no Wayback) e `desatualizado: true` (exame de 2020).
   - Contagem: 18 informações, 11 não confirmadas (igual) e 5 desatualizadas (eram 4).
2. **Nenhum `{casa}` na marca padrão (`js/textos.js`, ALTO).** Chaves novas: `cartao.compartilhado_sem_casa` ("Pronto. Cartão compartilhado.") e `cartao.legenda_copiada_sem_casa` ("Legenda copiada. Cole no post."). Não usei "Poste no story": o cartão pode ter ido para o WhatsApp, e a frase diz o que aconteceu.
   - Função nova `textoDaCasa(chave, marca)`, que escolhe a versão. "Marque" pede o @, então parceiro sem Instagram (as duas demos de hoje) também recebe a versão sem casa. As três cortesias (`cartao`, `marca`, `placa`) devolvem `''` sem parceiro.
   - Mais dois casos do mesmo defeito: `demo.fase4` dizia "a marca da casa" também na padrão (nova `demo.fase4_sem_casa`), e `meta.titulo_marca` sem parceiro agora devolve `T.meta.titulo`. O cabeçalho do arquivo diz que essas chaves só saem por `textoDaCasa`.
3. **SMS numa parte só (`textoSMS`, MÉDIO).** Medido antes, no Node: 165 a 168 caracteres com o link do app, conforme a precisão (5 m a 1.500 m). O `T.meta.url` tem 64 caracteres, não 66; com 12 m dá os 166 do revisor.
   - Saíram "Minha" e "Mapa:". A função garante até 160 por construção: quando não cabe, sai o link e depois a precisão. A coordenada nunca sai. Tudo passa por um filtro GSM-7 (sem acento, sem °). Novos `SMS_LIMITE` e `cabeEmUmSMS(texto)`.
   - Depois: com o link do ponto (`https://maps.google.com/?q=lat,lon`, 48 caracteres), 141 com precisão de 12 m e no máximo 145. Com o link do app, 156 a 160 com precisão de 1 m a 25 km; acima disso o link sai.
   - A decisão 6 da seção T4 ganhou a correção na própria linha.
4. **Nota pública das demos (MÉDIO).** A `_nota` de `demo-village.json` e de `demo-camping.json` começa agora por "Marca de demonstração, sem contato e sem logo". Saíram "visita de venda" e "2º alvo". A ordem de alvos fica só em `venda/`, ignorada pelo git (`.gitignore`, linha 2). Também tirei de `textos.js` as duas menções ao caminho `venda/legenda-story.md`.
5. **`fraseCartao` sem conta (BAIXO).** Sem `minutosDeSol`, a frase sai sem número (chave nova `cartao.frase_sem_minutos`): "Cheguei 05:00 · a serra apaga o sol 16:05". Antes saía "665 min de sol no poço". A função só compara as horas para escolher o tempo do verbo: chegada no apaga ou depois leva a frase da sombra.
   - O mesmo defeito estava na legenda 6 ("Eu sabia e cheguei com sol no poço"): quem chegou antes de o sol entrar no poço também a recebia. `legendasDoCartao` aceita agora `chegadaHHMM` e `nasceHHMM`, opcionais, e tira a 6 nesse caso e no de chegada depois do apaga.

**Teste novo:** `projetos/itaitu-mapa/testes/textos.test.mjs` (dono: copywriter), com 9 casos: SMS no pior caso (4 pontos, 10 precisões, 6 links), link do ponto sempre dentro, filtro GSM-7, nenhum `{` nas 3 marcas, `fraseCartao` sem conta, legenda 6, campos do `info.json` sem "alcoól" na tela, notas das marcas sem ordem de venda e limites de SEO. **9 de 9 passam.**

**Arquivos tocados**
- `site/itaitu/js/textos.js` (85.015 bytes; 464 chaves em 25 namespaces, eram 460; 28 exportações, 3 novas)
- `site/itaitu/dados/info.json`
- `site/itaitu/marcas/demo-village.json` e `site/itaitu/marcas/demo-camping.json`
- `projetos/itaitu-mapa/testes/textos.test.mjs` (novo)
- `projetos/itaitu-mapa/RELATORIO.md` (esta seção e a correção na decisão 6)

**Como verificar**
- `node --test 'projetos/itaitu-mapa/testes/**/*.test.mjs'` imprime `# pass 9` e `# fail 0`.
- No Chromium (porta livre sorteada, 390 px), o módulo e os 5 JSON carregaram com o console vazio.
- `grep -n -i alco site/itaitu/dados/info.json` acha só a `_nota` que explica a saída.
- `grep -n -i -E "alvo|visita de venda" site/itaitu/marcas/*.json` não acha nada.

**Pendente / pedidos**
- **Ao A (`sos.js`):** passar em `link` o ponto num mapa, não o endereço do app, que não mostra onde a pessoa está. Testado em 20/11/2026: `https://maps.google.com/?q=-11.333108,-40.503572` responde 302 para o mapa com o ponto, e `https://osm.org/?mlat=…&mlon=…` responde 301 para o OpenStreetMap. Os dois têm 48 caracteres. O formato longo do Google (`/maps/search/?api=1`, 69) não cabe com a precisão e sai sozinho.
- **Ao B (`cartao.js`):** chamar `textoDaCasa` para compartilhado, legenda copiada, cortesia e fase 4 da demo. Passar a `legendasDoCartao` a `chegadaHHMM` e a `nasceHHMM` (o `nascePocoMin` do motor, arredondado para cima). Segue valendo o pedido de `minutosDeSol` = apaga exibido − max(chegada, nasce).
- **Ao arquiteto e ao backend:** o comando da seção 10, `node --test projetos/itaitu-mapa/testes/`, falha no Node 22.23 com "Cannot find module .../testes". Funciona com `node --test 'projetos/itaitu-mapa/testes/**/*.test.mjs'`. E `minutosDeSolNoPoco(apaga, chegada)`, da 9.6, ainda não recebe o nasce.
- **Ao Radar:** `dados/pesquisa-radar.md`, linha 92, ainda diz que o Véu "proíbe ... bebida alcoólica", sem fonte.
- **Ao devops:** rodar o `gerar-precache.mjs` de novo, porque `textos.js`, `info.json` e as duas demos mudaram.
- **Em aberto:** ler o original do MP (`mpba.mp.br/noticia/51018`) quando o site responder. Aí o `agua` pode virar `confirmado: true`.

## T6 · Núcleo do app Trilhas de Itaitu (Pixel, frontend A, 20/11/2026)

**Como isto vende:** o hóspede abre o QR e o mapa já está na tela, na luz do minuto, sem tela de espera. Com isso o app funciona inteiro sem sinal: GPS, gravação, SOS, busca e "Chamar um guia". A marca da pousada fica guardada no aparelho, então o hóspede que instala pelo QR não perde a pousada. A Hora da Serra (B e Órbita) entra por cima disso.

**Feito** (HTML, CSS e JS em módulos ES, sem build, sem CDN e sem dependência nova)
- `index.html`: casco, metas, manifest e os CSS na ordem do DESIGN 2. Tem os ids de montagem do B vazios (`#hora-regua`, `#hora-faixa`, `#hora-tabuas`, `#hora-horarios`, `#hora-cartao`, `#hora-demo-controle`, `#hora-live`), três folhas (Cachoeiras, Gravar, Informações), a tela SOS, os diálogos de marcar ponto e de salvar trilha, e a tela escura da gravação. Todo texto sai de `textos.js` (`data-t`; o HTML guarda o português como reserva).
- `app.js` monta `window.Itaitu` com o contrato 2 mais `avisar`, `anunciar`, `abrirPainel`, `fecharPaineis` e `layout`. O `?agora=` anda em tempo real. O mapa nasce depois do recorte e das atribuições (prazo de 1,5 s). Marca e dados entram por cima. Os módulos são montados um a um, cada um em try/catch. Depois do `load` da página entram o SW, o `Som.botao()` (pedido do Eco), `luz.js` e `hora/index.js`, com `console.info` se faltar. Ele emite `itaitu:pronto`.
- `estilo.js` e `mapa.js`:
  - Estilo 100% local, sem glyphs. Fontes e camadas com os ids da seção 5, `bounds` e `maxzoom: 14`, terreno 1,4 e céu pela altura do sol (`posicaoDoSol`).
  - Relevo pintado como padrão. O satélite 2016 só aparece no botão, com o aviso "as sombras dela são de outro dia".
  - Nomes viram marcadores HTML: o ponto é um botão de 44 px e o lugar aparece a partir do zoom 12,5.
  - Toque longo de 550 ms e menos de 10 px, ou `contextmenu`. O balão mostra o decimal, os graus/minutos/segundos, a altitude do relevo, a distância até você, "Copiar coordenada" e "Marcar ponto aqui". O botão "Coordenada do centro do mapa" faz o mesmo pelo teclado. Ele emite `itaitu:toque-longo` e fica desligado com a trava e com `?demo=1`.
  - As atribuições vêm de `atribuicoes.json`, por fonte visível: o Sentinel só aparece com o satélite.
- `dados.js` valida os dados e enriquece pela 6.1 (`_estado`, `_carro_min`, `_trilha_min`, `_hora_de_sol`, `_ordem`). Geometria nula ou inválida vira sem coordenada. No `marcos.html` sobrepõe os `pontos-local`. Hoje dá 3 confirmadas, 1 aproximada e 3 sem coordenada na placa.
- `marca.js`:
  - Lê `?m=`. Sem parâmetro, usa a última marca válida (`localStorage itaitu:marca`; a vitrine não grava). Sem nada, usa `padrao.json`.
  - Valida campo a campo e ignora os campos `_`. A cor só passa com 3:1 ou mais contra o creme (pedido do designer). Link só https, wa.me e Instagram.
  - Botões: "Falar com a recepção" (só com número), "Chamar um guia" e "Onde comer" (por tipo de parceiro). Exporta `linkGuia(marca, info)` para o B.
- `destinos.js`:
  - Lista simples, com as 7 da placa primeiro. Quando o B põe filhos em `#hora-tabuas`, ela se recolhe sozinha (MutationObserver).
  - Ouve `itaitu:destino-escolhido` e ignora `origem: 'demo'`.
  - O detalhe mostra carro, trilha, nível, taxa e horário (vindos do `info.json`, com data e "pode estar desatualizado"), riscos, confiança, fonte e perfil.
  - O voo usa `voos.js` se ele existir; senão, `flyTo` (salto com movimento reduzido).
- `gps.js` mostra o ponto, o círculo de precisão no plano do mapa, o cone da bússola e o modo seguir. No iOS, a bússola pede permissão num toque.
- `rota.js`:
  - Destino com distância e rumo. Com traçado: distância pela trilha e tempo a 3 km/h. "Fora da trilha" só aparece depois de a pessoa entrar nela, a mais de 40 m; antes disso, a reta tracejada leva ao começo da trilha. Sem traçado: reta tracejada e "direção em linha reta, não é o caminho".
  - Seta para o destino e perfil de altitude em SVG (gráfico com `aria-label` e resumo escrito embaixo).
- `banco.js` usa o IndexedDB `itaitu` v1 com as 7 stores da 7.7. Sem IndexedDB, guarda na memória.
- `gravador.js`:
  - Grava pelo GPS (descarta precisão pior que 50 m e pontos a menos de 4 m) e salva no banco a cada 5 pontos e ao esconder a página.
  - A gravação volta sozinha ao reabrir. Tem pausa automática depois de 90 s parado e Wake Lock repedido.
  - Tela quase preta com trava: segurar 1 s para soltar; pelo teclado solta direto.
  - Salvar pede nome e destino (sugere o mais perto). Emite `itaitu:trilha-gravada` e `itaitu:gravacao`.
  - "Minhas trilhas" tem perfil, "Levar o GPS até aqui", "Exportar GPX", "Gerar cartão da trilha" (reemite o evento com `reemitido: true`) e apagar com confirmação na tela.
  - "Marcar ponto aqui" e "Meus pontos" exportam GeoJSON e GPX com `<wpt>`.
- `gpx.js` exporta GPX 1.1 e importa trk, rte e wpt (limite de 8 MB e 50 mil pontos). O importado vira trilha no banco, aparece no mapa e serve de rota.
- `sos.js` abre a tela inteira:
  - coordenada grande em decimal e em graus/minutos/segundos, com precisão e hora;
  - "Enviar minha posição por SMS" (`sms:?&body=` + `textoSMS` com o link do ponto no mapa, 141 caracteres, numa parte só);
  - botões 193, 192 e 190;
  - avisos do `info.json`.
  - Na vitrine, ligação e SMS ficam desligados, com aviso.
- `busca.js` busca offline por nome, outros nomes, lugares do mapa-base e coordenada (decimal ou graus/minutos/segundos).
- `armazenamento.js` registra o SW (`?sw=0` desregistra). O selo "Guardando o mapa no celular: N%" vira "Pronto para usar sem internet". Também pede `persist()`, mostra tamanho e data, e tem "Atualizar mapa" e "Guardar o que faltou".
- `economia.js`:
  - economia: 2D, sem terreno, sem rotação e céu chapado, com aviso pela bateria baixa;
  - contraste sol;
  - texto grande.
  - Tudo fica guardado em `localStorage` e emite `itaitu:economia`.
- `util.js` é puro: `tempoMaisLentoMin` (a tabela 6.1 inteira confere), `formatarDecimal`, `formatarGMS`, `distanciaM`, rumo, projeção na linha, histerese de 3 m e leitura de coordenada.
- `css/app.css`:
  - casco sobre os tokens; 390 px sem rolagem lateral, alvos de 44 px ou mais, texto de 12 px ou mais;
  - foco em dois tons;
  - claro, escuro, sol, texto grande, economia, `prefers-reduced-motion` e `forced-colors`.
  - Três tokens novos do A com papel único: `--sos-fundo`, `--gps` e `--tela-escura`.

**Arquivos tocados:** `site/itaitu/index.html`, `site/itaitu/css/app.css`, `site/itaitu/js/{app,estilo,mapa,dados,marca,destinos,gps,rota,gravador,banco,gpx,sos,busca,armazenamento,economia,util}.js` e esta seção. Nenhum arquivo de outra tarefa foi editado (o `precache.json` do repositório ficou intacto; o teste offline usou uma cópia).

**Como verificar** (servir `site/` com `python3 -m http.server <porta> --bind 127.0.0.1` e abrir `/itaitu/`)
- Fluxo no Chromium do Playwright, 390 px, celular emulado, com GPS em (-11.3335, -40.4990): **15 de 15 passaram**, em três rodadas seguidas.
  - Perfil do Véu: "sobe 41 m, desce 71 m, de 653 a 725 m".
  - Véu: "500 m em linha reta, rumo oeste, direção em linha reta, não é o caminho, começo da trilha a 210 m". A conta independente dá 500 m e 275°.
  - Busca por nome e por coordenada.
  - Coordenada do centro com decimal, graus/minutos/segundos e altitude.
  - Trava e destrava.
  - 11 pontos no IndexedDB durante a gravação.
  - Evento `itaitu:trilha-gravada` com km 0,706, desnível 34 e duração.
  - GPX exportado válido (raiz `gpx`, namespace 1.1, 12 trkpt).
  - GPX de teste importado, no mapa e como rota.
  - Ponto marcado exportado em GPX com `<wpt>`.
  - SOS com `tel:193,192,190`.
  - Console sem erro além dos 4 arquivos de outras tarefas que ainda não existem (`css/hora.css`, `js/luz.js`, `js/hora/index.js`, `js/voos.js`).
  - Script: `fluxo.cjs` no scratchpad da sessão.
- Offline: cópia do app com `gerar-precache.mjs --app=<cópia>`.
  - O selo passou de "Guardando… N%" a "Pronto para usar sem internet" em 7 a 9 s, com 329 entradas no cache.
  - Depois, `setOffline(true)` e recarga: SW no controle, 24 pontos, 655 feições da base e relevo desenhado.
  - O satélite voltou com 15 tiles "200 do SW" e pixels verdes lidos no buffer WebGL.
  - Zero falha e zero erro. Script: `offline.cjs`.
- `verificacao-visual` (4 configurações, `?m=demo-village`): sem rolagem lateral e sem texto pequeno. Os únicos achados são os 404 dos três arquivos do B e do Órbita. Os prints foram olhados.
- Skill `navegador` (celular): o painel foi percorrido pelo `ver`. O Sossego mostra "posição não confirmada: vá com guia" e "Chamar um guia", sem hora.
- Modos: economia (pitch 0, sem terreno, 3D desabilitado, lembrado ao recarregar), sol e texto grande a 390 px sem alvo menor que 44 px. Esc fecha o painel e devolve o foco.

**Decisões e divergências (com o porquê)**
1. **`perfil.js` e `marcar.js` não estavam na lista de arquivos desta tarefa.** As funções do contrato 2.2 estão com as mesmas assinaturas:
   - em `rota.js`: `perfilDeCoordenadas`, `perfilDaTrilha`, `desenharPerfil` e `altitudesDoRelevo`;
   - em `gravador.js`: `marcarPonto`, `listarMarcados`, `apagarMarcado` e `exportarMarcados`.
   - **Pedido ao arquiteto:** criar `js/perfil.js` com `export { perfilDeCoordenadas, perfilDaTrilha, desenharPerfil } from './rota.js';` e `js/marcar.js` com `export { marcarPonto, listarMarcados, apagarMarcado, exportarMarcados } from './gravador.js';`, para o C importar pelo nome do contrato.
2. **Perfil sem o motor do B:** lê a mesma grade z12 dos tiles aqui (fonte "relevo", ~37 m/px). Com `Itaitu.motor`, usa `motor.altitudes`.
3. **Luz do relevo com transparência** (`LUZ_RELEVO` em `estilo.js`): realce `rgba(255,227,166,.25)`, sombra `rgba(31,42,68,.7)` e exagero 0,8; no satélite, .12, .5 e 0,3. Com a cor cheia do DESIGN 3.3 e o sol das 13:00, o relevo pintado e a foto ficavam lavados de creme (prints comparados). **Ao designer e ao Órbita:** o `luz.js` muda direção e altitude; as cores ficam estas, ou o designer revisa.
4. **Três camadas extras do A:** `fundo` (background), `ruas-contorno` e `trilhas-contorno`. São os contornos pedidos no DESIGN 3.3. Os ids do contrato não mudaram.
5. **Sem `map.setPadding`:** os voos usam `offset` pela parte visível (`deslocamento()` em `mapa.js`). O padding ficaria gravado na câmera de todos.
6. **O topo nunca fica sem sombra.** Na economia e no modo sol, com `box-shadow: none` no `.topo`, o Chromium deixou de compor uma faixa no pé do mapa da altura do topo; foi isolado ligando e desligando a sombra. **Ao designer e ao B:** elemento fixo sobre o mapa sem sombra pode repetir isso.
7. **`dados/recorte.json` ainda não existe.** O app só o pede se o `precache.json` listar o arquivo (evita 404 no console); até lá, vale o recorte da seção 7.0 embutido em `app.js`.
8. **Rumo e distância ficam no rodapé, como informação secundária** (divergência 12): a faixa não fala em voz alta a cada fixo de GPS, só "fora da trilha", "de volta" e "chegou".

**Pendente / pedidos**
- **Ao copywriter:** chaves que hoje saem do texto provisório, sem erro na tela:
  - `destinos.botao` ("Cachoeiras"), `mapa.coord_curto` ("Coord."), `mapa.controles`;
  - `gravador.tela_escura`, `gravador.travar`, `gravador.ver_mapa`;
  - `gps.faixa`, `gps.inicio_trilha` ("Começo da trilha a {dist}");
  - `busca.coordenada`, `busca.fora_do_mapa`.
- **Ao B (`hora/*`):**
  - o `itaitu:destinos` sai antes do `montar`, então leia `ctx.dados.pontos` ao montar;
  - os botões da tábua emitem `itaitu:destino-escolhido` com `origem: 'tabua'`;
  - "Chamar um guia": use `linkGuia(ctx.marca, ctx.dados.info)` de `marca.js`;
  - o rodapé e o topo são medidos sozinhos (ResizeObserver), e `ctx.layout()` também pode ser chamado;
  - `Itaitu.avisar(texto)` e `Itaitu.anunciar(texto)` estão disponíveis;
  - na economia, o mapa já nasce em 2D.
- **Ao Órbita:** o `voarPara(id)` de `voos.js` é usado se existir. Para cair no centro visível, use `deslocamento()` de `mapa.js` como `offset`. O céu inicial sai de `luzInicial()` em `estilo.js`, com a mesma regra da 9.3.
- **Ao devops:** rodar `gerar-precache.mjs` com estes arquivos e criar `dados/recorte.json`.
- **Ao C:** o `marcos.html` tem de pôr `data-app="marcos"` no `<html>` (o `app.js` também reconhece `/marcos.html`) e carregar `./js/app.js`. Com `?vitrine=1`, links, ligação e SMS ficam desligados e a marca da vitrine não é gravada.
- **Não verificado:**
  - celular de verdade: GPS real, bússola do aparelho, Wake Lock, SMS e ligação;
  - gravação com a tela bloqueada (página web não grava, e o aviso diz isso);
  - Safari e iOS;
  - persistência: `persist()` deu falso no Chromium de teste, o normal sem instalação; o aviso aparece no painel.
- Quem conferir no ar: depois do pré-cache, testar "Atualizar mapa" com uma versão nova.

**Lição da rodada:** print parado engana no WebGL. A "faixa vazia" no pé do mapa era composição do navegador (sombra do topo), não o MapLibre, e o "satélite pálido" era o realce do relevo ao meio-dia. Os dois só foram separados lendo o buffer com `gl.readPixels` no evento `render` e trocando uma propriedade por vez.

---

## T8 · Luz ligada ao sol, céu e névoa, voos 3D e a coreografia dos 5 primeiros segundos (Órbita, motion-3d, 20/11/2026)

**Como isto vende:** o hóspede abre e o vale já está na luz do minuto. O dia corre em 2,5 s, cada etiqueta acende quando a serra cobre o lugar, e o arraste do sol mostra o Véu passando de dourado a azul. O gesto é esse; o resto é contexto.

**O que fiz**
- **`js/luz.js`**: `ligar(ctx)`, `luzDoMinuto(utcMs, centro?)`, `estadoLuz()`, `aplicarAgora(min, data)`, `desligarLuz()`.
  - Ouve `itaitu:hora` e pinta `relevo-sombra` pelas propriedades nativas do 5.24: `hillshade-illumination-direction` = azimute do `posicaoDoSol` no `recorte.centro`, inteiro de 0 a 359 (a spec não aceita 359,6); `-altitude` = elevação presa em 0 a 90; `-anchor` = `'map'`.
  - Muda a temperatura do realce e da sombra e da rampa do `relevo-cor` sem recarregar tile. O céu e a névoa (`setSky`) seguem uma tabela única por elevação: dia, dourado (2 a 9°), hora azul (−1,5 a −6°) e noite.
  - Não toca no exagero do terreno.
  - Em economia, anda em degraus de 15 min e não mexe no céu.
  - Volta a valer sozinho depois do botão Satélite/Mapa e da economia. Segue o relógio sozinho enquanto ninguém emite `itaitu:hora`.
- **`js/voos.js`**:
  - `voarPara(alvo, opcoes)` aceita id, `[lon, lat]`, bounds ou Feature. Pitch 62 e zoom 15,2 em cachoeira. A duração cresce com a distância (1,1 a 3,4 s). Cancela o voo anterior (`{cancelado: true}`) e marca `interrompido` no toque. Em movimento reduzido salta; em economia faz um `easeTo` de 300 ms sem pitch e sem giro.
  - **Rumo com motivo:** a câmera olha para o paredão que apaga o sol do ponto, no azimute do sol na hora do apaga. Lê `_apaga_min` ou `_horas.apagaMin` se o B gravar no ponto; sem isso, usa 16:00.
  - `voarPresentacao(ids, {pausaMs, aoChegar, aoSair})`: sobe sobre a serra, visita os 2 primeiros confirmados e pousa no vale. Espera `itaitu:pronto` e não roda com a abertura tocando.
  - `seguirTrilhaSimulada(trilha, {duracaoMs, aoQuadro, aoPasso})`: a câmera segue o ponto pelo traçado, com o centro preso ao relevo 3D. `aoQuadro` recebe `{i, frac, lonLat, alt, bearing}`, com `alt` de `queryTerrainElevation`.
  - `pararVoos()`, `rumoDoParedao()`.
- **`js/abertura.js`**: `tocarAbertura(opcoes)`, `aberturaTocando()`, `esquecerAbertura()`.
  - Segue a linha do tempo da 9.1 num laço de rAF. Os tempos vêm dos tokens `--dur-dia`, `--dur-volta` e `--dur-polegar` e as curvas, de `--curva-dia` e `--curva-saida`.
  - O arraste interno segue o keyframe do polegar fantasma do `regua.css` (15–85%). O `tocarSom('araponga')` cai no instante em que o sol cruza o apaga do alvo.
  - Se o B passar `arrastarSolDemo`, a abertura espera a Promise dele.
  - O retorno traz os dois formatos: `{concluida, interrompida, pulada}` da ARQUITETURA e `{parado, interrompido}` da tarefa, mais `motivo`, `fase` e `fps`.
  - Pula (`pulada`) em economia, movimento reduzido, `amanha`, sem dia restante, já tocada nesta página ou com menos de 30 min desde a última (`localStorage 'itaitu:abertura'`). `?abertura=1` ou `forcar: true` força, para o QA.
  - Em todo fim que não é concluído, aplica o estado parado: volta a agora, acende todas as etiquetas e mostra a faixa.

**Divergências e decisões**
1. **A luz troca no máximo a cada 120 ms.** As cores do hillshade ficaram sem transição.
   - Medido no Chromium por software: com o terreno 3D, cada troca de pintura do relevo redesenha o vale inteiro, porque invalida a textura por tile. O mapa ia de 10,4 fps parado para 1,7 a 2,4 fps trocando hillshade ou rampa a cada quadro, e o `setSky` dava 6,5 fps.
   - No dia correndo, a CanvasSource do B já força esse redesenho a cada quadro, então a luz junto custa pouco a mais.
2. **O portão de fps mede os 20 primeiros quadros do dia correndo.** Inclui o intervalo que entra no dia e decide antes do 20º quadro quando a soma passa de 667 ms.
   - Medir desde o início deu um falso "60 fps": na espera de 0,5 s o mapa está parado e desenha de graça.
3. **Na trilha simulada, pitch 50 e zoom 15.** Com 64° e zoom 15,6, a encosta tapava o ponto no fim da trilha do Véu (print).
4. **A deriva de câmera da abertura é de 1,5° no rumo**, um `easeTo` que o toque do usuário cancela. Desliga com `deriva: false`.

**Como verificar** (scripts em scratchpad; servidor estático em `site/itaitu`, `?sw=0&agora=2026-11-20T13:00`, celular 390x844, CPU 4x pelo CDP)

*Luz*
- `hillshade-illumination-direction` contra o azimute do `nucleo.js` (diferença 0,1 a 0,4°, só o arredondamento para inteiro):

  | hora | direção | azimute | altitude |
  |---|---|---|---|
  | 08:00 | 106 | 106,3 | 39,5 |
  | 12:00 | 222 | 221,7 | 78,5 |
  | 17:00 | 252 | 251,6 | 10,3 |
  | 18:20 | 248 | 247,8 | 0 |
  | 19:10 | 244 | 244,1 | 0 |

- Céu, horizonte e névoa:
  - 08:00 e 12:00: `#A9CDE8`, `#DCE9F2`, névoa no chão 0,85;
  - 17:00: `#94B9DD`, `#F1C78F` dourado, névoa 0,67;
  - 18:20: `#1B2644`, `#3C4C71`;
  - 19:10: `#0B1120`.
- O exagero ficou em 1,4 em todas as horas.
- 15 eventos `itaitu:hora` viraram 4 aplicações e 1 troca de céu.
- Em economia, 17:07 vira 17:00 e o céu não é trocado.
- Satélite: o realce pintado é igual ao calculado com o alfa do satélite.
- Prints em `.verificacao/t8-luz/` (git-ignorado): `luz-0800.png`, `luz-1200.png`, `luz-1700.png`, `luz-1820.png`, `luz-1910.png`, `luz-comparacao2.png` (08:00, 12:00, 15:30, 16:30, 17:00 e 17:30), `voos-comparacao.png` e `trilha-comparacao.png`.

*Voos*
- `voarPara` chegou ao Véu e às Arapongas: zoom 15,2, pitch 62, rumo 253°, a 20 e 22 px do centro visível.
- Dois voos seguidos: o 1º sai `{cancelado: true}` e o 2º `{chegou: true}`.
- Movimento reduzido: salto em cerca de 100 ms.
- Apresentação: visitou os 2 confirmados e pousou no vale.
- Trilha simulada: altitude de 973 a 927 m no Véu e de 753 a 814 m nas Arapongas.

*Abertura*
- Página leve (só o módulo), CPU 4x, 60 fps, 5,31 s no total:
  - etiquetas em 1,77 s (Arapongas), 1,89 s (Véu) e 2,11 s (vila);
  - faixa em 2,99 s; tóin em 4,72 s;
  - volta para 13:00 no fim.
- Toque real (`touchscreen.tap`) e tecla em 1,2 s: `{interrompido: true}`, `fase: 'dia'`, minuto final 13:00, todas as etiquetas e a faixa.
- Recarga 5 min depois: `pulada: 'recente'`. Depois de 31 min toca; a 2ª chamada na mesma página sai `'ja-tocou'`.
- `prefers-reduced-motion` emulado: `pulada: 'movimento-reduzido'`, só etiquetas e faixa, sem `setMinuto`.
- Mapa real com WebGL por software, 1x e 4x: 0,9 a 7,1 fps medidos e queda para `{parado: true}` entre 0,7 e 2,2 s. O portão funciona.

*Console:* sem erro dos três módulos. Os únicos 404 são de `css/hora.css` e `js/hora/index.js`, do frontend B, que ainda não existem. Sem rolagem horizontal (390 = 390). `verificacao-visual` em celular claro e escuro às 17:00 só apontou esses dois 404.

**Pendente**
- **Fps real no celular.** O Chromium daqui não tem GPU: SwiftShader dá 3 a 11 fps com qualquer mudança no vale 3D. Os 30 fps do critério 5 só podem ser medidos num Android de verdade ou num Chromium com GPU. Até lá, o portão garante que o aparelho lento cai no modo parado.
- **Ao B (`hora/index.js`):**
  - chamar `tocarAbertura` com `etiquetas` (apaga exibido de cada ponto com hora de sol), `minutoFim` = escurece exibido, `amanha` = `deveMostrarAmanha` e `tocarSom` que só toca com o áudio liberado;
  - o `setMinuto` emite `itaitu:hora` com `origem: 'abertura'`, e a luz segue;
  - as etiquetas e a faixa precisam aceitar chamada repetida;
  - para o rumo do voo usar o apaga calculado, gravar `_apaga_min` no ponto;
  - o demo usa `voarPresentacao(undefined, {pausaMs, aoChegar})` e `seguirTrilhaSimulada('pe-veu-da-noiva-1', {duracaoMs: 15000, aoQuadro})`.
- **Ao A (opcional):** `luzInicial` do `estilo.js` usa uma regra de céu mais simples. Na troca para o `luz.js`, logo depois do `load`, o céu muda de tom uma vez; dá para usar `luzDoMinuto` de `luz.js` no `estilo.js`.
- **Não verificado:** iOS e Safari; voo com painel lateral aberto no desktop; demo de 60 s inteiro (depende do B).

## T9 · App particular do Marcos (`marcos.html`) · Pixel (frontend C), 20/11/2026

**O que foi feito**
- `marcos.html` + `manifest-marcos.webmanifest` ("Itaitu · Marcos", `id` e `start_url` `./marcos.html`, escopo `./`, ícones `marcos-*` do designer, `noindex`). Instala como 2º ícone. **Nenhum link no app público** (conferido: `index.html` não cita "marcos").
- **Um casco só:** `js/marcos/index.js` copia o `<body>` do `index.html` (do cache do SW, funciona offline) e só depois carrega `./js/app.js`. Mapa, SOS, gravador do hóspede e destinos são os do A, sem cópia de HTML que envelhece. Por cima: botão "Marcos" no topo e uma folha com 5 abas (Campo, Pacote, Vitrine, Venda, Ajustes).
- **Confirmar posição** (`confirmar.js`): botão "Estou aqui: confirmar posição" em todo ponto sem coordenada, aproximado ou de confiança média/baixa (lista na aba Campo e também no detalhe do destino). Média do GPS por ~20 s (até 40 s se faltar leitura), com a precisão ao vivo. Descarta leitura > 30 m e leitura fora do bolo (2,5x a distância mediana, mínimo 6 m); média ponderada por 1/precisão²; a precisão declarada é a **mediana** das leituras que ficaram (conservadora). Só salva com ≥ 10 leituras e ≤ 30 m (as regras do pacote). Grava em `pontos-local` com `confianca: 'alta'`, `aproximado: false`, `fonte: 'GPS no local, AAAA-MM-DD'`, nota e `sol_ajuste_min` opcional; o mapa recarrega os dados e mostra a camada mesclada. "Criar ponto novo": porteira, estacionamento, ponte, mirante, poço, cachoeira, entrada de trilha (porteira e ponte viram `tipo: 'infra'`, o contrato não tem esses tipos). "Desfazer confirmação" apaga o local.
- **Gravador de campo** (`gravador-pro.js`): pausa automática (60 s num raio de 8 m; retoma sozinho ao andar 15 m), passagens com nota (8 notas rápidas + texto), perfil de altitude ao vivo (`rota.js`), tela quase preta com Wake Lock e trava de bolso, aviso "página web não grava com a tela bloqueada". Salvar: destino, modo, "trilha oficial" e "fincada pela ACAGI" com nome do condutor (**fica só no aparelho**) e `sol_ajuste_min`. Rascunho em `config`/`gravacao-pro` (para o gravador do hóspede não "recuperar" como dele). Os dois gravadores não gravam ao mesmo tempo.
- **Pacote** (`pacote.js` puro + `pacote-tela.js`): formato exato da 7.5, `itaitu-pacote-AAAA-MM-DD.json`, GPX único (wpt dos pontos, trk e passagens das trilhas) dentro e em "Só o GPX". Web Share com arquivo; sem ele, download. `validarPacote()` aplica as regras do script (formato, versão, recorte, precisão ≤ 30, amostras ≥ 10); item que não passa fica fora com o motivo na tela.
- **Vitrine** (`vitrine.js`, `qr.js`, `placa.js`): marcas de `marcas/indice.json` passadas pelo `validarMarca` do A; "Rodar demonstração" abre `./index.html?m=<slug>&demo=1&vitrine=1` em tela cheia, presa na trava; QR (M, preto no branco, 4 módulos de margem) do link `URL base + ?m=<slug>`, URL base configurável em Ajustes (padrão `https://centroesportivomtt-ui.github.io/Creat-mtt-studio/itaitu/`), PNG de 1200 px; **"Gerar placa com QR"** preenche `arte/placa-qr.svg` (nome do parceiro, "Ou digite: <endereço>", QR vetorial dentro de `#qr-area`, texto provisório "QR aqui" removido) e sai em PNG 3000 x 4000 (508 dpi em 15 x 20 cm) e em SVG vetorial para a gráfica.
- **Caderno** (`caderno.js`): negócios com status (visitar, visitado, interessado, proposta, fechado), nota, próximo passo, data, filtro por status; CSV com `;`, BOM UTF-8 e proteção contra fórmula. Só IndexedDB.
- **Kit** (`kit.js`): "Importar kit" (.json até 512 KB), valida e limpa, guarda em `kit`/`atual`, mostra preços (R$), roteiro, objeções e notas, tudo por `textContent`.
- **Trava e PIN** (`trava.js`, `pin.js`): PIN de 4 dígitos criado no 1º uso, guardado como PBKDF2-SHA-256 (WebCrypto, 100.000 iterações, sal aleatório de 16 bytes) em `config`/`pin`; 5 erros = espera de 30 s. Vitrine: resto da página `inert`, botão Voltar volta para a vitrine, recarregar reabre presa (`localStorage itaitu:marcos-vitrine`); sair = toque longo de 1,5 s no canto de cima + PIN (teclado: Enter no mesmo botão pede o PIN). Caderno e kit atrás do PIN, abertos por 10 min, trancam ao entrar na vitrine ou após 5 min com a página escondida. **Proteção de uso, não cofre** (dito também na tela de Ajustes): 4 dígitos são 10.000 combinações, quem tem o celular destravado pode ler o IndexedDB; não segura o botão de início do Android nem a troca de app.

**Formato do kit v1 (o conteúdo nunca entra no repositório; vem do Dropbox):**
```json
{ "formato": "itaitu-kit", "versao": 1, "gerado_em": "2026-11-20T10:00:00-03:00",
  "roteiro":  [ { "titulo": "…", "texto": "…" } ],
  "objecoes": [ { "pergunta": "…", "resposta": "…" } ],
  "precos":   [ { "plano": "…", "valor_centavos": 0, "periodo": "mensal" | "unico", "inclui": ["…"] } ],
  "notas": "…" }
```
Limites: arquivo ≤ 512 KB; até 60 passos, 80 objeções, 20 preços; preço sem `valor_centavos` inteiro é descartado.

**Arquivos tocados (só os desta tarefa):** `site/itaitu/marcos.html`, `site/itaitu/manifest-marcos.webmanifest`, `site/itaitu/css/marcos.css`, `site/itaitu/js/marcos/` (`index.js`, `comum.js`, `confirmar.js`, `gravador-pro.js`, `pacote.js`, `pacote-tela.js`, `vitrine.js`, `qr.js`, `placa.js`, `caderno.js`, `kit.js`, `trava.js`, `pin.js`). Nenhum módulo do app público foi editado.

**Como verificar**
- `cd site && python3 -m http.server 8765` e abrir `http://localhost:8765/itaitu/marcos.html?sw=0&agora=2026-11-20T13:00`.
- Teste de ponta a ponta (Playwright, 390 px, celular emulado, geolocalização emulada), no scratchpad da sessão: `t9/fluxo.cjs` e `t9/conferir.mjs`. Resultado desta rodada, tudo OK:
  - manifest válido (`id`, `start_url`, escopo, nome) e os 4 ícones respondem 200; sem rolagem horizontal; nenhum alvo < 44 px no painel;
  - Sossego confirmado com 24 leituras emuladas (2 com precisão de 80 m): "20 leituras boas · 2 descartadas", precisão 6 m, gravado em `pontos-local` com `confianca: 'alta'` e `fonte: 'GPS no local, 2026-11-20'`; o mapa passou a ter o Sossego na fonte `pontos` com `_estado: 'confirmada'`;
  - ponto novo (porteira) salvo; gravador: pausa automática depois de 65 s parado e retomada ao andar 20 m; perfil ao vivo; trilha salva fincada pela ACAGI com ajuste −4;
  - pacote baixado validou no `validarPacote` e numa checagem independente das chaves exatas da 7.5 (2 pontos, 1 trilha, perfil a cada 25 m começando em 0, 25 trkpt, 3 wpt); nenhum nome de pessoa; o validador recusa precisão 31, 9 amostras, coordenada fora do recorte, formato e versão errados;
  - QR: os 37 x 37 módulos lidos do canvas da tela e do PNG da placa (dentro do `#qr-area`, margem branca limpa) são **iguais um a um** à matriz do qrcode-generator para `…/itaitu/?m=demo-village`; os bits de formato decodificados dizem nível M, máscara 2. (Não houve leitor de QR independente: a instalação de um decodificador foi negada no ambiente; a leitura com 1 Android e 1 iPhone fica para o teste físico da placa.)
  - CSV com BOM, cabeçalho e `"TESTE Pousada; ""Serra"" =1+1"` escapado; kit importado mostrou "por mês";
  - trava: Voltar e recarregar não saem da vitrine; PIN errado (0000) não sai e o diálogo volta com "PIN errado"; 1234 sai; no IndexedDB o `config.pin` tem só `alg`, `iteracoes`, `sal` (24 b64) e `hash` (44 b64), sem "1234" em nenhuma store.
  - Console: só os 404 de `css/hora.css` e `js/hora/index.js` (arquivos do B, ainda não existem) e avisos do WebGL por software.
- `verificacao-visual` em `marcos.html` (4 configurações): os únicos apontamentos são os mesmos 404 do B; prints olhados (`.verificacao/`). Skill `navegador` (celular): painel e aba Ajustes percorridos.

**Pedidos a outras tarefas**
- **Devops:** rodar `gerar-precache.mjs` de novo para pôr no casco `marcos.html`, `manifest-marcos.webmanifest`, `css/marcos.css`, `js/marcos/*.js`, `vendor/qrcode-generator.js` **e `arte/placa-qr.svg`** (o DESIGN dizia que a placa não precisava de pré-cache, mas o Marcos gera a placa na visita de venda, muitas vezes sem sinal). Sem isso, o `marcos.html` só funciona offline depois de aberto uma vez com sinal.
- **Backend (`aplicar-pacote.mjs`):** a trilha pode trazer `sol_ajuste_min` (opcional, inteiro de −30 a 30, ARQUITETURA 7.3; corrigido na rodada de ajustes do T9: o motor zera qualquer valor acima de 30) quando foi fincada com a ACAGI; copiar para o ponto `destino_id`. `alt_m` do ponto pode vir `null` (GPS sem altitude). Coordenada de trilha sem altitude vem com 2 números.
- **Copywriter:** chaves que hoje saem do texto provisório de `js/marcos/comum.js` (sem aviso no console): `marcos.confirmar_de_novo`, `poucas_amostras`, `precisao_agora`, `distancia_antiga`, `sem_gps`, `nome_obrigatorio`, `salvo_local`, `desfazer`, `desfeito`, `estado_*`, `nada_a_confirmar`, `pacote_vazio`, `pacote_resumo`, `pacote_fora`, `link_copiado`, `placa_*`, `caderno_vazio`, `negocio_obrigatorio`, `kit_vazio`, `pin_diferente`, `pin_pedir`, `pin_atual`, `pin_espere`, `pin_formato`, `pin_definido`, `pin_nenhum`, `pin_sem_cripto`, `url_*`, `gravador_ocupado`. Os textos do HTML do `marcos.html` também estão escritos direto (app particular, sem `data-t`).
- **Designer (opcional):** a placa encolhe o `#nome-parceiro` para caber até x 1120 (nome longo como "Village Serra do Cruzeiro (demonstração)" sai em ~44 unidades); vale uma regra de 2 linhas na arte se os parceiros reais tiverem nome longo.
- **A:** o `.mjs` do QR não é usado: servidor que não conhece `.mjs` (o `python -m http.server` local) manda `application/octet-stream` e o navegador recusa o módulo; o `marcos.html` carrega o `.js` clássico.

**Pendente / não verificado (honesto)**
- Offline do `marcos.html` depende do pedido ao devops acima; não testei `setOffline(true)` nesta tarefa.
- Celular de verdade: GPS real (a média foi com geolocalização emulada), Wake Lock, Web Share com arquivo (no Chromium de teste caiu no download), tela cheia e trava no Android/iOS, leitura do QR impresso.
- A demonstração de 60 s dentro da vitrine depende do `hora/demo.js` (B), que ainda não existe; o iframe abre o app da marca certa com `demo=1&vitrine=1`.

**Lição da rodada:** o toque longo da trava falhava às vezes no teste porque o mapa 3D por software segurava a thread e o `setTimeout` de 1,5 s atrasava; agora soltar depois de 1,5 s também vale (prova: `fluxo.cjs` verde com PIN errado e certo depois de recarregar).

## T8 · ajustes da revisão do Crivo (Órbita, motion-3d, 20/11/2026)

**Como isto vende:** quem usa movimento reduzido (ou o celular pede) toca numa cachoeira e vê o ponto na faixa de mapa acima da gaveta, não escondido atrás dela. É o mesmo gesto do voo animado, sem animação.

**O que mudou**
- `site/itaitu/js/voos.js`
  - `voarPara` com movimento reduzido: troquei `map.jumpTo(alvoCam)` por `map.easeTo({ ...alvoCam, offset, duration: 0 })`. O `jumpTo` ignora `offset`; o `easeTo` com duração 0 aceita e roda na hora (conferi no `vendor/maplibre-gl.js`: `_ease` com `duration 0` chama o quadro final e o fim na mesma pilha).
  - Novo `paddingVisivel(folga)`: devolve as margens de painel e gaveta mais a folga, e `cabe: false` quando sobram menos de 120 px livres. **Achado novo da conferência:** no celular, o detalhe do destino ocupa 62dvh e sobram cerca de 58 a 66 px de mapa. Nesse caso o `fitBounds` com as margens cheias é recusado pelo MapLibre ("Map cannot fit within canvas") e a câmera nem se move. Na primeira versão deste ajuste, só com as margens, a trilha ficou fora da tela, em x de 1696 a 1811 px; a conferência pegou e o `cabe` corrige.
  - `voarPara` com bounds, nos dois modos, salto e animado: usa as margens visíveis. Sem espaço, enquadra na tela inteira (`cameraForBounds`) e leva o centro para a faixa livre com `offset`.
  - `seguirTrilhaSimulada` com movimento reduzido: troquei `padding: 48` pelas margens visíveis. Sem espaço, mostra o quadro final do caminho animado: o fim da trilha no centro visível, com o rumo do último trecho.
- `site/itaitu/js/abertura.js`: a espera pelo `arrastarSolDemo` do B agora tem teto de 1,5 s (`TETO_ARRASTE_MS`, com `Promise.race`). Se a Promise do B nunca resolver, a abertura fecha `concluida` e `tocando` volta a `false`.

**Como verificar**
- `node --check` passa em `voos.js` e `abertura.js`.
- `node .verificacao/t8-luz/ajustes.cjs`, com o servidor em `site/itaitu` na porta 8793. Ambiente: celular 390×844, `reducedMotion: 'reduce'` (confirmado `true` na página) e a gaveta aberta pelo fluxo real (lista e depois `itaitu:destino-escolhido`):
  - Véu: o ponto ficou a 13 px do centro visível e acima da gaveta (y 159, gaveta em 196). Com o `jumpTo` antigo, na mesma câmera, ficava a 264 px, **debaixo da gaveta** (y 422).
  - Arapongas: 27 px do centro visível, acima da gaveta. Com o antigo, 264 px e debaixo da gaveta.
  - Trilha `pe-veu-da-noiva-1` com o detalhe aberto: 0 de 11 pontos debaixo da gaveta, nenhum fora da tela na horizontal, e o fim da trilha visível em (167, 129). Antes desta correção, com `padding` de margens cheias, eram 11 de 11 debaixo da gaveta.
  - Bounds em salto com a gaveta aberta: centro em y 124, visível.
  - Teto: `arrastarSolDemo` que nunca resolve. **Depois:** `{concluida: true, fps: 60}` em 7,3 s e `tocando` volta a `false`. **Antes** (o mesmo módulo sem o `race`): não resolveu em 12 s e `tocando` ficou `true`. Esse teste roda numa página leve do mesmo servidor, para o portão de fps não cair por causa do SwiftShader.
- `node .verificacao/t8-luz/animado.cjs`, sem movimento reduzido: o voo animado para bounds com o detalhe aberto chegou (`chegou: true`), com o centro em y 159, visível, e sem o aviso "cannot fit".
- Prints olhados em `.verificacao/t8-luz/reduzido-gaveta-cachoeira-veu-da-noiva.png` (o ponto azul do Véu está na faixa acima da gaveta), `reduzido-gaveta-cachoeira-das-arapongas.png` e `reduzido-gaveta-trilha-detalhe.png`.
- Console: nenhum erro de página. Os únicos erros são dois 404, de `css/hora.css` e `js/hora/index.js` (arquivos do B que ainda não existem), e avisos de desempenho do driver GL por software.

**Pendente / NÃO VERIFICADO**
- (a) Os 30 fps num Android real ou num Chromium com GPU. Aqui só ficou provado que o portão cai em `parado` no modo por software.
- (b) A integração do B em `hora/index.js`: `tocarAbertura` com etiquetas, `minutoFim`, `amanha` e `tocarSom`; etiquetas e faixa idempotentes; `_apaga_min` gravado no ponto. Sem o `_apaga_min`, o rumo do voo usa 16:00 fixo.
- (c) Voo com o painel lateral aberto no desktop, e Safari/iOS.
- **Ao Pixel / Paleta (layout, não é motion):** com a lista cheia aberta no celular sobram 12 px de mapa (gaveta em 134, topo em 122). Nenhum enquadramento resolve isso. No fluxo real, tocar num destino abre o detalhe (62dvh), e aí sobram cerca de 60 px: o ponto aparece, mas a faixa é estreita. Vale decidir se a gaveta do detalhe deve abrir mais baixa (por exemplo, 50dvh) quando há voo.
- A trilha simulada com a lista cheia aberta: o fim cai sob o topo (y 99). É o mesmo limite de layout acima. No fluxo real ela não roda com a lista cheia.

## T9 · ajustes da revisão do Crivo (Pixel, frontend C, 20/11/2026)

**O que mudou (4 pedidos, todos feitos):**
- **Ajuste de sol limitado a ±30 min (ARQUITETURA 7.3).** Constante única `AJUSTE_MAX = 30` em `js/marcos/pacote.js`, usada pela confirmação (`confirmar.js`), pelo gravador (`gravador-pro.js`) e pelos dois validadores do pacote (ponto e trilha). Em `marcos.html`, os campos `#confirmar-ajuste` e `#pro-ajuste` passaram a ter `min="-30" max="30"`, e os rótulos dizem "de −30 a 30 minutos". O valor 45 agora é recusado na tela ("O ajuste vai de −30 a 30 min.") e também no pacote. O pedido ao backend na seção T9 acima foi corrigido de 120 para 30.
- **A trava de 10 min fecha a tela de verdade.** `trava.js`: `destrancar()` agenda `setTimeout(trancar, ABERTO_MS)`, e `trancar()` cancela esse timer. Se o celular dormiu e o timer atrasou, a trava confere o relógio quando a página volta a ficar visível. Ao trancar, `desenharVenda()` esconde preços e negócios e fecha o diálogo do caderno se ele estiver aberto (`index.js`). Novo negócio, Exportar CSV, Apagar kit, Importar kit, salvar e apagar negócio, quando acionados com a trava fechada, redesenham a aba e avisam "Trancado: digite o PIN." (`caderno.js` e `kit.js` recebem o callback `trancado`).
- **A pausa automática continua automática depois de recarregar.** `salvarAgora` grava `pausaAuto` no rascunho. Na recuperação, o valor é restaurado, e com pausa automática o GPS fica ligado para a gravação retomar sozinha depois de 15 m de caminhada. A pausa manual continua manual.
- **Porteira e ponte não se perdem no pacote.** A função nova `notaComSubtipo()` (`pacote.js`) põe o rótulo na frente da `nota` do item quando existe `confirmacao.subtipo`: "Porteira", ou "Porteira: fechada aos domingos" quando há nota. O pacote não ganhou chave nova, porque o formato 7.5 continua fixo.

**Arquivos tocados:** `site/itaitu/marcos.html`, `site/itaitu/js/marcos/{pacote,confirmar,gravador-pro,trava,caderno,kit,index}.js`, este relatório.

**Como verificar:**
- Servidor em `site/` na porta 8765. Os scripts ficam no scratchpad da sessão, em `t9/`.
- `node ajustes.cjs`: os 4 ajustes, com Playwright a 390 px e celular emulado. O relógio é controlado com `page.clock`. Resultado: **TUDO OK, 14 de 14.** Foram conferidos estes pontos:
  - limites e rótulos na tela;
  - o ajuste 45 é barrado pelo HTML e também pelo JS sem `max`, e nada é gravado;
  - a Porteira sem nota sai no pacote como `tipo: infra, nota: "Porteira"`, só com as chaves da 7.5;
  - um rascunho com pausa automática volta como "Pausa automática", grava `pausaAuto: true` e retoma ao andar 22 m;
  - um rascunho com pausa manual continua pausado;
  - aos 9 min 50 s o caderno está aberto, e aos 10 min 10 s trancou sozinho, sem preços na tela e com o diálogo fechado;
  - as 4 ações com a trava fechada avisam;
  - o kit não é apagado com a trava fechada;
  - o console não tem erro fora dos 404 da tarefa B.
- Regressão com `node fluxo.cjs` e `node conferir.mjs`. Tudo verde, menos o item de console, pelos mesmos 404 de `css/hora.css` e `js/hora/index.js`, que são da tarefa B. A porteira do fluxo agora sai com `nota: "Porteira"`.
- A varredura de falso pronto (TODO, FIXME, lorem, `[PREENCHER]`, `href="#"`) nos arquivos do T9 deu 0 acertos.

**Pendente (não é código deste ajuste):**
- `scripts/aplicar-pacote.mjs` e `testes/pacote.test.mjs` ainda não existem. A frase "as mesmas regras do script" em `pacote.js` só pode ser conferida quando o backend entregar. Junto com ela, é preciso conferir se o script também aplica ±30.
- Pré-cache: `precache.json` ainda não tem o `marcos.html` nem a placa. O devops precisa rodar `gerar-precache.mjs` de novo antes da visita de venda sem sinal.
- Testes em celular real antes de levar ao parceiro de Itaitu:
  - QR da placa impressa lido por um Android e por um iPhone;
  - tela cheia com o diálogo do PIN por cima;
  - GPS real;
  - Web Share;
  - o timer de 10 min com a tela apagada num Android de verdade. No teste, a conferência ao voltar à página cobre isso, mas ela só foi provada com relógio simulado.

**Lição da rodada:** dois limites para o mesmo dado (o motor com 30 e o app com 120) deixaram passar um valor que o motor descartava em silêncio. Agora o limite é uma constante só, importada pela tela e pelo validador. Prova: `ajustes.cjs` recusa 45 nas duas camadas.

## T10 · Prova da Hora da Serra e aplicar-pacote (Forja, backend, 20/11/2026)

**Feito** (Node 22, só módulos nativos, sem servidor, sem dependência nova):
- `testes/png.mjs`: decodificador de PNG próprio (RGB/RGBA 8 bits, filtros 0 a 4, `node:zlib`), separado do leitor do motor.
- `testes/referencia.mjs`: porte fiel do `hora_da_serra.py` (NOAA, Bennett, limbo +0,267°, horizonte de 720 direções, olho 1,7 m, passo 15/30 m, curvatura k = 0,13, `round()` do Python). Não importa `nucleo.js`; usa Float64 e varre o horizonte sem o corte antecipado do motor.
- `testes/hora-da-serra.test.mjs`: (a) a referência dá o alvo; (b) `nucleo.js` contra a referência em todo ponto `confirmada` do `pontos.geojson`, em 3 datas (20/11/2026, 21/06/2027, 22/09/2027): apaga, nasce no poço e escurece; (c) exibidos múltiplos de 5, apaga e escurece para baixo, nasce para cima, ajuste de campo incluído; (d1) `tempoMaisLentoMin` (tabela 6.1); (d2) `hora/regras.js` (saia até 14:30 e volte com luz 17:10 no Véu, 13:55 nas Arapongas, Urubu `sem-tempo`); (e) nenhum ponto aproximado ou sem coordenada recebe hora de sol (regra 6.1 conferida contra o `enriquecer()` do app); (f) nota "calculado pelo relevo, ±10 min" em `textos.js`.
- `testes/comparar-com-app.cjs`: Playwright em 390 px com `?agora=2026-11-20T15:20`; lê "sol no poço até" nas tábuas do Véu e das Arapongas e compara com a referência (±10 min, múltiplo de 5, nunca depois do bruto, nota ±10/±15), confere que tábua sem coordenada não tem hora e tem "Chamar um guia" com link, aproximada sem hora, sem rolagem horizontal e sem erro de console (lista os 404). Sem URL, serve `site/` sozinho.
- `scripts/aplicar-pacote.mjs`: valida o pacote v1 (7.5) e funde em `pontos.geojson` e `trilhas.geojson`. `--simular` é o padrão; `--aplicar` grava só o que mudou, por arquivo temporário + rename, no mesmo formato do time de dados (indentação 1). Idempotente: o mesmo pacote de novo sai como "já aplicado" e não muda um byte. Saída 0 aceito, 1 recusado inteiro, 2 uso errado, 3 com itens recusados.
- `testes/pacote.test.mjs` + `testes/fixtures/` (1 válido, 8 inválidos): roda o script em cópias temporárias; um `after()` confere por SHA-256 que os dados reais não mudaram.

**Horas brutas medidas em 20/11/2026** (referência = app, diferença 0 min em todos): Véu da Noiva **16:07** (exibe 16:05), Arapongas **15:40** (exibe 15:40), Coxinho 16:49, Urubu 16:36, vila 16:54, Payayas 16:25; escurece 18:11 (exibe 18:10). Terceira opinião: `sol_serra.py` (outra fórmula do sol, outro passo) rodado com `python3 -I` na mesma grade deu Véu 16:07 e Arapongas 15:40.

**Decisões**
- Precisão: a tarefa pedia recusar acima de 50 m; o contrato 7.5 e o exportador (`js/marcos/pacote.js`) recusam acima de 30 m. Ficou 30 m (o mais rígido), com mínimo de 10 amostras.
- Ponto confirmado guarda a fonte antiga em `fonte_anterior` e a medição em `campo: {data, precisao_m, n_amostras, alt_m}`; a nota do pacote entra em `notas` como "Campo AAAA-MM-DD: …". Ponto novo entra em `grupo: 'fora-da-placa'`. Trilha fincada pela ACAGI entra com `autor: 'ACAGI'`, `fincada_por` e `sol_ajuste_min`; o ajuste vai também para o ponto `destino_id`, a não ser que o pacote traga um ajuste próprio para o ponto. Nenhum nome de pessoa.
- `confirmar` de id que não existe, `novo` de id que existe e trilha com id já usado (com outro conteúdo) são recusados com motivo.

**Como verificar**
- Testes: `node --test 'projetos/itaitu-mapa/testes/*.test.mjs'` (30 testes, 0 falhas, ~0,7 s). Atenção: `node --test projetos/itaitu-mapa/testes/` (pasta) falha no Node 22 com MODULE_NOT_FOUND, para qualquer arquivo; use o padrão entre aspas.
- Navegador (depois do frontend B): `node projetos/itaitu-mapa/testes/comparar-com-app.cjs` ou com a URL, ex. `node projetos/itaitu-mapa/testes/comparar-com-app.cjs http://localhost:8000/itaitu/`.
- Pacote: `node projetos/itaitu-mapa/scripts/aplicar-pacote.mjs itaitu-pacote-AAAA-MM-DD.json` (simula); `--aplicar` grava.

**Pendente**
- `comparar-com-app.cjs` ainda não passa: rodado agora, as tábuas não existem e `css/hora.css` dá 404 (o frontend B está na mesma onda). A tarefa final do devops roda o script e cola a saída.
- Rodar `aplicar-pacote.mjs --aplicar` nos arquivos reais é do time de dados; não foi rodado aqui.

## T10 · Ajustes da revisão (Forja, backend, 20/11/2026)

**Feito**
- `testes/hora-da-serra.test.mjs`: novo teste **(s) sensibilidade de 50 m**. Cada ponto confirmado com hora de sol é deslocado 50 m para N, S, L e O (`dLat = 50/111320`, `dLon = dLat/cos(lat)`), o `apagaBrutoMin` é recalculado no motor do app, e o teste falha se a variação passar de `incertezaMin(ponto)` (alta 10, media 15) ou se o ponto perder o sol. Variação medida em 20/11/2026, em minutos (N, S, L, O):

  | ponto | confiança | limite | N | S | L | O |
  |---|---|---|---|---|---|---|
  | Véu da Noiva | alta | ±10 | +6 | −6 | 0 | −3 |
  | Arapongas | media | ±15 | +11 | −6 | +4 | −4 |
  | Coxinho | media | ±15 | +2 | −6 | +1 | 0 |
  | Urubu | media | ±15 | +2 | +1 | +11 | −7 |

  Bate com a medição do revisor. Pior caso: Arapongas para N e Urubu para L, com +11 min. Os dois ficam dentro de ±15, mas passariam de ±10. A nota ±15 para `media` é necessária, não é folga.
- Novo teste **(d3) régua**: `limitesDaRegua` com o dia que o app monta (centro do `RECORTE_PADRAO` lido de `js/app.js`) dá `min` 310 (05:10) e `max` 1090 (18:10). `valorDaRegua` de 0 a 1439 sempre devolve múltiplo de 5 dentro dos limites e arredonda para baixo.
- (d2) ganhou os casos de `deveMostrarAmanha`. Com lista vazia (objeto e array) e com lista só `sem-sol`, às 06:00, 17:00 e 23:55, o resultado é falso. Com todos os apagas passados (16:10) é verdadeiro, inclusive com `sem-sol` misturado. Às 15:50 é falso. Com as Horas brutas (`apagaMin`) também funciona.
- (d2) não pula mais: sem `regras.js`, falha com o motivo.
- `testes/comparar-com-app.cjs`: o `--agora` padrão passou de 15:20 para **13:00**, o horário do critério de aceite 1. O cabeçalho agora explica por que um horário depois da chegada possível às Arapongas reprova um app correto.
- Comando dos testes corrigido para `node --test 'projetos/itaitu-mapa/testes/*.test.mjs'` em `hora-da-serra.test.mjs:4`, `pacote.test.mjs:2` e `ARQUITETURA.md` (seção 10 e critério de aceite 1).

**Arquivos tocados:** `testes/hora-da-serra.test.mjs`, `testes/pacote.test.mjs`, `testes/comparar-com-app.cjs`, `ARQUITETURA.md` (2 linhas), este RELATORIO.

**Como verificar**
- `node --test 'projetos/itaitu-mapa/testes/*.test.mjs'` → `# tests 32`, `# pass 32`, `# fail 0`, `# skipped 0` (Node v22, ~1,1 s). A linha `[hora-da-serra] sensibilidade 50 m ...` mostra a tabela acima.
- `node projetos/itaitu-mapa/testes/comparar-com-app.cjs` (local, serve `site/`) → saída 0 e última linha `RESULTADO: tudo bateu`. Véu 16:05 na tela contra 16:07 na referência (−2 min), saia até 14:30, volte 17:10, nota ±10. Arapongas 15:40 contra 15:40, saia até 13:55, nota ±15, `data-amanha=0`. Há 8 tábuas sem coordenada, todas sem hora e com "Chamar um guia", e Flores (aproximada) aparece sem hora. Sem rolagem horizontal em 390 px e sem erro de console.
- Contraprova: com `--agora=2026-11-20T15:20` o script dá 1 falha, só "Arapongas: hora de hoje (data-amanha=1)". Isso confirma o falso negativo do padrão antigo.
- Varredura de falso pronto (expressão do `revisor.md`) nos arquivos da T10: zero acertos.

**O que mudou fora do meu código:** `site/itaitu/css/hora.css` já existe (criado por outra tarefa às 19:54). O 404 que o revisor viu sumiu, e a conferência no navegador não acusa mais erro de console. Não mexi nele.

**Pendente**
- `testes/textos.test.mjs:2` (arquivo do copywriter) ainda traz o comando da pasta, que não funciona. Não editei porque a regra é um escritor por arquivo. A troca é por `node --test 'projetos/itaitu-mapa/testes/*.test.mjs'`.
- A verificação foi local. A conferência no endereço de produção é da tarefa final do devops, que roda `comparar-com-app.cjs <URL de produção>` e cola a saída.
- Continua pendente o que já estava: `aplicar-pacote.mjs --aplicar` nos dados reais é do time de dados.

**Lição da rodada:** um teste de navegador com horário padrão depois do apaga reprova um app correto. O horário padrão de um script de conferência tem de ser o do critério de aceite. Prova: padrão 13:00 dá `RESULTADO: tudo bateu`, e `--agora=2026-11-20T15:20` dá 1 falha só em `data-amanha=1`.

## T11 · Hora da Serra ao vivo (Pixel, frontend B, 20/11/2026)

**Feito** (JS puro, sem dependência nova, caminhos `./`; nenhum arquivo de outra tarefa editado)
- `js/hora/index.js`: `montar(ctx)`. Régua, tábuas e horários aparecem na hora (nascer e escurecer pelo `nucleo.js`, sem motor). Depois: `abrirMotor({urlBase, recorte, corSombra: [30,47,92,140]})`, `Itaitu.motor` + `itaitu:motor`, horas de hoje **e** de amanhã de cada ponto com `_hora_de_sol`, `_apaga_min` gravado no ponto (rumo do voo), sombra, etiquetas, cartão, relógio (15 s; sombra a cada 5 min, 15 na economia; parado com a aba oculta), abertura ou demo. Som só depois do 1º `pointerdown`/`keydown` (`Som.liberar`), nunca em movimento reduzido. API para qa e demo em `window.Itaitu.hora` (`horas()`, `abertura`, `irPara`, `voltarAgora`, `gerarCartao`).
- `js/hora/regras.js` (puro, Node importa): `horasExibidas`, `deveMostrarAmanha`, `minutosDeSolNoPoco(apaga, chegada, nasce?)` (pedido do Verbo: `max(chegada, nasce)`), `incertezaMin`, `limitesDaRegua`, `valorDaRegua`, `posicaoNaRegua`, `luzNoMinuto`, `escolherAlvo`, `faltamParaEscurecer`. Contas da 6.2 com os valores já exibidos.
- `js/hora/regua.js` (`#hora-regua`): `input range` nativo (min 310, max 1090, passo 5). Setas 5 min, PageUp/PageDown 1 h, Home/End nascer/escurecer. `aria-valuetext` = "16:05, a sombra da serra cobre o Véu da Noiva"; `#hora-live` lê todos os poços ("16:25, a sombra da serra cobre o Véu da Noiva e as Arapongas; sol no Coxinho e no Urubu"). Marcas dos poços, janela de sol do destino, pôr e escurecer, risco do "agora", botão "Voltar para agora", polegar fantasma, tic na hora cheia e tóin quando o sol cruza o apaga.
- `js/hora/sombra-canvas.js`: CanvasSource `sombra-serra` + `sombra-serra-camada` antes de `camada-vetorial-base` (ordem conferida no estilo), `play(); pause();` para subir a textura, `play()` só no dia correndo. Arraste usa o quadro pré-calculado mais perto e pede o exato (escala 0,5 arrastando, 1 ao soltar). Etiquetas `.etiqueta-hora` num Marker `anchor: 'bottom'` (embrulho próprio, porque o `.etiqueta-hora` tem `position: relative`), com `aria-label` "Véu da Noiva: na sombra desde 16:05".
- `js/hora/tabuas.js` (`#hora-tabuas`, `#hora-faixa`): marcação da 6.4; estado dos dados. Confirmada: sol no poço até, saia até, volte com luz até, nota ±10/±15. Aproximada: "posição aproximada". Sem coordenada: "vá com guia" + "Chamar um guia" (`linkGuia` passado por `linkSeguro`; desligado na vitrine e sem sinal). Ponto que já perdeu o sol hoje (`sol-foi`) mostra amanhã com selo; `saia-agora` mostra "saia até: agora" e "saindo agora: N min de sol no poço"; `sem-tempo` (Urubu) mostra apaga e escurece, nunca um "saia até" inventado. Faixa "saia até" do destino escolhido; sem escolha, o 1º na ordem que ainda dá sol. Plano B: `?tabua=clara` grava `localStorage 'itaitu:tabua'` e liga `data-tabua="clara"`.
- `js/hora/horarios.js` (`#hora-horarios`): nascer, pôr e escurece; nota de dia nublado com a hora; aviso "as horas são de amanhã"; "Como a hora é calculada" (textos `hora.como_*`); "Faltam X min para escurecer" durante a gravação (`itaitu:gravacao`), com toast e `#hora-live` a 60, 30 e 15 min e ao escurecer.
- `js/hora/cartao.js` (`#hora-cartao`): 1080x1920 pela DESIGN 7 (zonas A a K, `numeroTabular`, veio com semente, selo com a janela de sol e a chegada no arco). Relevo de `Motor.relevoCartao` com o minuto da chegada; sem motor, fundo pintado e traço projetado. Chegada = 1º ponto a 60 m do destino, senão o fim. Variantes: sol ("13 min de sol no poço"), sombra ("a serra apagou o sol", sem "0 min") e sem hora (texto do motivo). Web Share com arquivo, senão download; legenda de `legendasDoCartao` com "Copiar legenda"; `textoDaCasa` para compartilhado e legenda copiada. Na vitrine, compartilhar e salvar ficam desligados.
- `js/hora/demo.js` (`?demo=1`, `#hora-demo-controle`): 0–8 s dia correndo e etiquetas acendendo; 8–30 s `voarPresentacao` com a régua varrendo a janela de cada poço; 30–45 s `seguirTrilhaSimulada('pe-veu-da-noiva-1')` desenhando a trilha (fonte e camada próprias `hora-demo-trilha`, removidas no fim) e o relógio correndo; 45–60 s cartão com chegada = apaga − 15 min e a marca de `?m=`. Cada fase tem prazo: aparelho lento corta a câmera no tempo. Pausar/Continuar, Sair (tira `demo=1`), "Ver de novo". Não grava no IndexedDB. À noite usa amanhã.
- `css/hora.css`: só encaixe (botão "agora", títulos das tábuas, horários, diálogo do cartão, painel da demo, `[hidden]` acima das classes do A). Sem cor nova.

**Como verificar** (servidor estático em `site/`)
- `node --test 'projetos/itaitu-mapa/testes/*.test.mjs'` → `# pass 32`, `# fail 0`.
- `node projetos/itaitu-mapa/testes/comparar-com-app.cjs http://127.0.0.1:PORTA/itaitu/` → `RESULTADO: tudo bateu` (Véu 16:05 contra 16:07 bruto, Arapongas 15:40, 8 sem coordenada sem hora e com guia, Flores sem hora, 390 px sem rolagem, console limpo).
- `?sw=0&agora=2026-11-20T13:00`: faixa "saia até 14:30 para 1 hora de sol no Véu da Noiva"; tábuas Véu 16:05 · 14:30 · 17:10 (±10) e Arapongas 15:40 · 13:55 · 17:10 (±15); todas as horas na tela são múltiplos de 5 (conferido por script).
- `?agora=2026-11-20T15:20`: Véu "saia até: agora", "saindo agora: 10 min"; Arapongas amanhã (selo); Coxinho 55 min. 16:30: faixa "amanhã, saia até 14:30". 21:00: tudo amanhã, abertura pulada (`motivo: 'amanha'`).
- Teclado na régua (Playwright): 920 → 925 → 930 → PageUp 990 → End 1090 ("18:10, já escureceu") → Home 310; `#hora-live` acompanha cada passo; 965 = "16:05, a sombra da serra cobre o Véu da Noiva", 960 = "16:00, sol no Véu da Noiva". Arraste com o ponteiro de 13:00 a 16:25: `data-arrastando=1`, sombra e etiqueta azul; "Voltar para agora" volta a 13:00. Nenhum alvo dos `#hora-*` abaixo de 44 px.
- `navegador` (celular, `--rede-interna`): Cachoeiras → tábua das Arapongas voa e a faixa vira "saia até 13:55 para 1 hora de sol nas Arapongas"; console sem erro (só tiles cancelados pelo próprio MapLibre no voo).
- `?sw=0&demo=1&m=demo-village&agora=2026-11-20T13:00`: os 60 s inteiros sem erro de console; aos 56 s o cartão 1080x1920 diz "Cheguei 15:50 · a serra apaga o sol 16:05 · 15 min de sol no poço"; aos 64 s, "Fim da demonstração".
- Offline: numa cópia de `site/itaitu` no scratchpad com `gerar-precache.mjs --app=<cópia>` (casco de 84 arquivos), abrir com SW, recarregar, `setOffline(true)`, recarregar: sombra na camada, horas 965/940/1005/995 e cartão gerado offline com a marca do Village ("Cheguei 15:52 · a serra apaga o sol 16:05 · 13 min de sol no poço").
- Movimento reduzido: abertura `pulada: 'movimento-reduzido'`, etiquetas e faixa paradas, nenhum `itaitu:hora` de abertura, sem som. Economia: `pulada: 'economia'`, mapa em pitch 0, sombra em degraus de 15 min.
- Abertura com o mapa real (CPU 4x): `{parado: true, motivo: 'fps', fps: 2,6}`; sem CPU lenta, 7,3 fps → parado. Com o desenho do mapa desligado só no teste, a coreografia completa: dia de 13:00 a 18:01 entre 0,5 e 3,0 s, etiquetas às 1,79 s (Arapongas), 1,91 s (Véu), 2,04 s (Urubu), 2,09 s (Coxinho), faixa aos 3,03 s, volta a 13:00 aos 3,26 s, polegar de 4,03 a 5,04 s, `concluida`, 60 fps.
- `verificacao-visual` (`--espera 16000`, 15:50): "Tudo limpo" nas 4 configurações. Prints olhados em `.verificacao/t11/` e no scratchpad (mapa às 13:00, 15:20 e 16:30, painel, desktop, fases da demo e os 3 cartões).

**Decisões**
1. **Depois de escurecer a régua mostra o dia de amanhã** (rótulo "amanhã"); a luz do mapa continua sendo a real de agora (noite).
2. **"Vila e outros pontos"** no fim das tábuas: o `destinos.js` recolhe a lista simples quando as tábuas chegam, e vila, pico, mirante e entradas sumiriam do painel.
3. **Faixa sem destino escolhido** usa o 1º ponto, na ordem da placa, que ainda dá sol (às 15:50 é o Coxinho, porque o Véu já não dá); se nenhum dá, o 1º de amanhã.
4. **Etiqueta no mapa sempre com a hora de hoje** (quando a sombra cobre o lugar no mapa de hoje); a tábua pode mostrar amanhã. **Corrigida nos ajustes do revisor (abaixo):** a etiqueta segue o dia da régua, o mesmo da sombra no mapa; depois de escurecer mostra amanhã com o selo "amanhã" visível e no nome acessível.
5. **Fase da demo com prazo**: sem GPU o seguidor de trilha anda mais devagar que o relógio; no prazo a câmera é cortada e a trilha aparece inteira.

**Pedidos**
- **Copywriter:** chaves que hoje saem do texto provisório: `hora.como_titulo` ("Como a hora é calculada"), `tabuas.titulo_lugares` ("Vila e outros pontos"), `faixa.saindo_agora_sol` ("de sol {no:nome}"), `cartao.slogan_padrao` ("mapa das cachoeiras sem internet"), `cartao.apagou_rotulo` ("a serra apagou o sol"), `cartao.copiar_legenda` ("Copiar legenda"), `demo.de_novo` ("Ver de novo").
- **Devops:** rodar `gerar-precache.mjs` de novo. O `precache.json` de hoje tem casco de 7 arquivos (só `vendor/`) e não lista `index.html`: offline não abre a página. Com o script rodado numa cópia, o offline passou inteiro.
- **Frontend A (opcional):** no celular, a câmera inicial põe a etiqueta do Véu ("Véu 16:05") embaixo da coluna de controles. Centralizar a câmera inicial na parte visível (como os voos fazem com `deslocamento()`) mostraria a hora do Véu inteira nos 5 primeiros segundos.

**Não verificado**
- Fps num Android de verdade: o Chromium daqui não tem GPU (SwiftShader, 3 a 7 fps), então o portão de 30 fps cai sempre no modo parado aqui. O caminho completo da abertura só foi visto com o desenho do mapa desligado.
- Web Share com arquivo num celular real (aqui cai no download) e o som (sem alto-falante).
- Conferência no endereço de produção: é da tarefa final do devops.

**Lição da rodada:** em Chromium sem GPU, `requestAnimationFrame` e timers atrasam por segundos e mascaram bug de tempo: o `#hora-live` parecia atrasar um passo e a fase 3 da demo passava do minuto. A prova separa ambiente de código: com 1,5 s entre teclas o anúncio acompanha todos os passos; com prazo por fase, a demo fecha em 60 s (`Fim da demonstração` aos 64 s, console limpo).

## T11, ajustes do revisor (Pixel, frontend B, 20/11/2026)

**Feito**
1. **Tábua não diz mais que o sol foi quando ele ainda está no poço.** `regras.js`: `horasExibidas` separa `sem-tempo-hoje` (agora < apaga, mas não dá para chegar com sol) de `sol-foi` (agora >= apaga). Novas funções puras `diaDaTabua` (só `sol-foi` ou "tudo amanhã" vira amanhã) e `chaveDaSituacao` (`hora.sol_foi` só com o sol já fora). `index.js` usa `diaDaTabua`; `tabuas.js` usa `chaveDaSituacao`. Em `sem-tempo-hoje` a tábua fica em hoje: sol no poço até 16:05, sem o "saia até" vencido, volte com luz até 17:10 e a frase que já existia, `hora.frase_sem_tempo_hoje_apaga`. A faixa do poço nessa situação mostra "sol no poço até 16:05 no Véu da Noiva", e o nome acessível traz a frase inteira.
2. **Demo: o cartão abre sem modal.** `cartao.js`: com `?demo=1` (ou `H.emDemo`) usa `dlg.show()`, e o cartão fica logo abaixo do painel da demo (`--hora-cartao-topo` medido do painel). O foco fica com quem apresenta. `hora.css`: posição fixa do cartão na demo, a imagem cabe na altura, e o painel da demo fica uma camada acima. Fora da demo, segue `showModal()`.
3. **Chave inventada removida.** A faixa em `saia-agora` usa `faixa.saindo_agora_destino` ("{min} min de sol {no:nome}"): o número vai para a coluna grande e o resto para o destino. Se um dia o texto não começar pelo número, o texto inteiro vai para o destino, sem número duplicado (regra em `hora.css`). Saiu `duracaoTexto`: em `saia-agora` a sobra fica abaixo de 60 min, ou exatamente 60 no limite do arredondamento, e "60 min" está correto. **Pedido ao copywriter cai de 7 para 6 chaves** (sai `faixa.saindo_agora_sol`).
4. **Etiqueta no mapa e relatório alinhados.** A etiqueta continua no dia da régua, que é o mesmo dia da sombra desenhada. Ganhou o selo "amanhã" (span `.hora-etiqueta__amanha`, que só aparece com a hora acesa) e o prefixo "amanhã," no `aria-label`. A decisão 4 da T11 ganhou a correção na própria linha.
5. **Notas menores.** Saiu o `if (!tracado.length) return;` sem efeito de `relevoReserva` (e o parâmetro que sobrou). O bitmap `r0` agora é fechado com `close()` depois de desenhado.

**Arquivos tocados:** `site/itaitu/js/hora/regras.js`, `site/itaitu/js/hora/index.js`, `site/itaitu/js/hora/tabuas.js`, `site/itaitu/js/hora/cartao.js`, `site/itaitu/js/hora/sombra-canvas.js`, `site/itaitu/css/hora.css`, `projetos/itaitu-mapa/testes/regras-situacao.test.mjs` (novo, meu; não editei o `hora-da-serra.test.mjs` do Forja), este RELATORIO (esta seção e a correção na decisão 4).

**Como verificar**
- `node --test 'projetos/itaitu-mapa/testes/*.test.mjs'` → `# tests 37`, `# pass 37`, `# fail 0`. São 5 testes novos: o Véu às 13:00 e 14:30 dá `planejar`; às 15:20 dá `saia-agora` com 10 min; às 15:30, 15:50 e 16:04 dá `sem-tempo-hoje`; às 16:05 e 17:00 dá `sol-foi`. Também cobrem o nasce limitando a sobra, `diaDaTabua`, `chaveDaSituacao` e o texto exato da frase.
- `node projetos/itaitu-mapa/testes/comparar-com-app.cjs` → `RESULTADO: tudo bateu`.
- Navegador (Playwright, 390x844, `?sw=0&agora=2026-11-20T15:50`): a tábua do Véu fica com `data-amanha=0` e `data-luz=sol` e diz "sol no poço até 16:05 · volte com luz até 17:10 · Hoje não dá mais tempo de chegar ao Véu da Noiva com sol: a serra apaga o sol às 16:05." A etiqueta diz "Véu da Noiva: sol até 16:05". A faixa padrão vai para o Coxinho, com "saindo agora 25 min de sol no Coxinho". Às 15:20, a faixa diz "saindo agora 10 min de sol no Véu da Noiva". Às 16:30, a tábua mostra amanhã e diz "a serra já tirou o sol deste poço hoje", e a faixa diz "amanhã, saia até 14:30". Às 21:00, as 4 etiquetas mostram "Véu amanhã 16:05" e "amanhã, Véu da Noiva: na sombra desde 16:05". Nenhum erro de console.
- Demo (`?sw=0&demo=1&m=demo-village&agora=2026-11-20T13:00`, celular): o cartão abre com `:modal` falso, do y=295 ao y=832, logo abaixo do painel (fundo em y=287). `elementFromPoint` no centro de "Pausar" e de "Sair" acha o próprio botão. O toque em Pausar vira "Continuar demonstração", o segundo toque volta, e "Sair da demonstração" tira o `demo=1`. Nenhum erro de console. Print: scratchpad `t11b/demo-cartao-celular.png`.
- `verificacao-visual site/itaitu --espera 16000 --saida .verificacao/t11b`: "Tudo limpo" nas 4 configurações. Olhei o print do celular claro.
- Varredura de falso pronto em `js/hora`, `css/hora.css` e no teste novo: zero acertos. `saindo_agora_sol` no repositório: zero.

**Pendente (não é da T11, mas trava o "pronto")**
- **Devops:** rodar `gerar-precache.mjs` no repositório. O `precache.json` continua velho, com casco de 7 arquivos, sem `index.html`, CSS e `js/hora`. Depois, refazer a conferência offline (`setOffline(true)`) no repositório e no endereço de produção, não numa cópia. Não rodei porque o arquivo gerado é do devops (um escritor por arquivo).
- **Copywriter:** 6 chaves provisórias: `hora.como_titulo`, `tabuas.titulo_lugares`, `cartao.slogan_padrao`, `cartao.apagou_rotulo`, `cartao.copiar_legenda`, `demo.de_novo`.

**Não verificado (continua)**
- O portão de 30 fps da abertura, o Web Share com arquivo e o som num Android real. Aqui não tem GPU nem alto-falante.
- **Tempo da demo:** neste Chromium sem GPU, o cartão abriu aos 62,8 s com o teste rodando sozinho, e aos 74,7 s com outro navegador rodando em paralelo. A rodada anterior deu 56 s. O fim passa dos 60 s do critério. É preciso medir num aparelho real e, no mesmo teste, conferir se o fim fica em 60 s ou perto disso. Não mexi no tempo das fases.

**Lição da rodada:** uma situação que junta dois estados ("não dá para chegar" e "o sol já foi") produz frase falsa em um deles. A prova é o teste `regras-situacao`: às 15:50 o resultado é `sem-tempo-hoje` e a chave é `hora.frase_sem_tempo_hoje_apaga`; às 16:10 o resultado é `sol-foi` e a chave é `hora.sol_foi`. No navegador, às 15:50 a tábua aparece com `data-amanha=0`.

## T12 · Pré-cache final, prova offline em celular emulado e comando único de testes (Trilho, devops, 20/11/2026)

**Feito**
1. `node projetos/itaitu-mapa/scripts/gerar-precache.mjs` → `precache.json: versao 1cbbca14422d, 356 arquivos, 14.53 MB; casco 84 arquivos, 2.06 MB`. O casco tem `index.html`, `marcos.html`, os dois manifests, todo `js/` (inclusive `js/hora`, `js/motor`, `js/marcos`), `css/`, `icones/`, `arte/placa-qr.svg`, `marcas/` e `vendor/`; fontes, dados e tiles ficam no pré-cache pesado. Varredura de referências relativas (import, `import()`, link, src, `url()`, fetch; comentários fora): 271 referências, **nenhuma fora do pré-cache**. A única ausência é `dados/recorte.json`, que o `app.js` só pede quando está na lista (vale o recorte padrão de Itaitu); fica assim.
2. `sw.js`: só ganhou `const VERSAO_DA_LISTA = '1cbbca14422d'` (estratégia intacta). Motivo: o `sw.js` lê a lista em tempo de execução, então os bytes dele não mudavam quando o app mudava, e o navegador nunca reinstalava o SW. Com JS e CSS em cache primeiro, uma correção publicada só chegaria a quem tocasse em "Atualizar mapa". Agora cada publicação muda o `sw.js`, o install monta a versão nova inteira (copiando pelo hash o que não mudou) e troca sem quebrar o offline. O `rodar-tudo.mjs` reprova se a linha ficar diferente do `precache.json`.
3. **Higiene de `site/itaitu`** (achados; nada para corrigir em arquivo meu):
   - Nenhum `fetch` para fora: todos os 9 `fetch(` do código são relativos. URLs absolutas que existem são links ou texto, não chamadas: créditos (`dados/atribuicoes.json`), fontes do `info.json` (Wikipédia, EM, Bahia Notícias), Instagram da ACAGI em `marcas/*.json` e `info.json`, namespaces XML (`w3.org`, `topografix.com` no GPX), o endereço canônico do próprio app (`index.html`, `textos.js`, `marcos/vitrine.js`, conteúdo do QR) e **`https://maps.google.com/?q=lat,lon` no SMS do SOS** (`js/sos.js`, `js/textos.js`; dono: Pixel/frontend A e Verbo). Este último está fora da lista "atribuição, wa.me, tel:, sms:", mas é de propósito (link para quem resgata abrir a posição) e só sai no SMS que a pessoa manda; não é carregado pelo app. Fica para o dono decidir; recomendo manter.
   - Segredo, token, chave: nenhum. `TODO`, `FIXME`, lorem, `[PREENCHER]`, link `#`: zero. Telefones: só 190, 192, 193 (`info.json`); WhatsApp das marcas vazio, com `_pendente: "preencher quando o parceiro autorizar"` (é nota de dado, não aparece na tela).
   - `git diff -- site/itaitu/dados/pontos.geojson site/itaitu/dados/trilhas.geojson`: vazio.
   - Imagem paga: nenhuma. Tiles de relevo Terrain Tiles (AWS Open Data) e satélite Sentinel-2 cloudless 2016 (CC BY 4.0); arte e ícones feitos pela casa.
4. `testes/conferir-app.cjs` (novo), `testes/rodar-tudo.mjs` (novo, um comando), `testes/LEIA.md` (o que cada teste prova e o que não prova).

**Saída do comando único** (`node projetos/itaitu-mapa/testes/rodar-tudo.mjs`, saída 0, 138 linhas ok, nenhuma falhou):
```
ok      node --test (motor, regras, textos, pacote)        # tests 37, pass 37, fail 0
ok      pré-cache completo e atualizado                     # 356 arquivos, 14.53 MB; 271 referências
ok      python3 -m http.server em http://127.0.0.1:41147/itaitu/
ok      conferir-app.cjs (celular Android, online e offline)
ok      comparar-com-app.cjs (horas da tela x referência)
RESULTADO: tudo passou
```
Trechos do `conferir-app.cjs` (Android emulado, 390x844):
```
ok      sem rolagem horizontal no mapa (390 <= 390 px) · alvos de toque >= 44 px (mapa e painel) · números das tábuas 30 px
ok      a régua é alcançável com Tab · seta direita anda 5 min (780 -> 785) · PageUp anda 1 h (785 -> 845)
ok      #hora-live anuncia a hora ("14:05, sol no Véu da Noiva, nas Arapongas, no Coxinho e no Urubu")
ok      depois de 16:05 a sombra vem com a palavra ("16:10, a sombra da serra cobre o Véu da Noiva")
ok      pré-cache terminou ('pronto' no BroadcastChannel) · versão guardada = precache.json (1cbbca14422d) · 14.53 MB
ok      navegador está sem rede (navigator.onLine = false) · página servida pelo service worker
ok      offline: mapa carregou o estilo (21 camadas) · relevo 3D (34 tiles dem com 200) · satélite 2016 (15 tiles sat)
ok      offline: motor da sombra ligado e camada da sombra no mapa · hora do Véu na tábua (16:05 / 14:30 / 17:10)
ok      cartão 1080x1920 (1987 KB, image/png) · marca de marcas/demo-village.json · --cor-marca #8E2C6E
ok      frase do cartão: "Cheguei 15:50 · a serra apaga o sol 16:05 · 15 min de sol no poço"
ok      marcos.html abre sem rede (200) · manifest próprio · sem erro de console (online e offline)
ok      3.2 fps < 30: app caiu no modo parado (parado=true)        # CPU 4x
ok      abertura pulada com movimento reduzido · horas e faixa paradas
ok      demonstração chegou ao fim ("Ver de novo") em 75 s · cartão 1080x1920 na fase 4 · sem erro de console
ok      8 cachoeiras/poços sem coordenada: sem hora, "vá com guia" e "Chamar um guia" com link
```
`node site/ao-vivo/teste-nucleo.cjs` → `núcleo: 18 verificações ok` (saída 0): o CI da sede ao vivo continua passando.
`verificacao-visual` (`?agora=2026-11-20T13:00&m=demo-village&sw=0`, 4 configurações): "Tudo limpo". Print do celular claro olhado.

**Medidas**
| item | valor |
|---|---|
| tiles de relevo (`tiles/dem`, PNG Terrarium, z8 a z14) | 132 arquivos, 10,82 MB |
| tiles de satélite (`tiles/sat`, JPG Sentinel-2 2016, z8 a z14) | 132 arquivos, 1,16 MB |
| `site/itaitu` inteiro (`du -sh`) | 16 MB em disco (15 MB aparente) |
| o que o SW pré-cacheia (`bytes_total`) | 356 arquivos, 14,53 MB (orçamento: 25 MB) |
| casco (guardado já no install) | 84 arquivos, 2,06 MB |
| vendor / js / css / fontes / ícones / dados | 1,3 MB / 648 KB / 116 KB / 68 KB / 160 KB / 456 KB |

**Licenças e atribuições** (todas na tela, em Informações > Créditos, vindas de `dados/atribuicoes.json`): MapLibre GL JS 5.24.0 (BSD-3-Clause, `vendor/LICENSE.txt`); OpenStreetMap (ODbL 1.0, "© OpenStreetMap contributors", também no canto do mapa); Terrain Tiles Mapzen/AWS Open Data (SRTM, GMTED, ETOPO1; atribuição conforme as fontes); Sentinel-2 cloudless 2016 da EOX (CC BY 4.0); qrcode-generator 2.0.4 (MIT, `vendor/LICENSE-qrcode-generator.txt`); Atkinson Hyperlegible Next (SIL OFL 1.1, `fontes/LICENSE.txt`).

**Gastos:** nenhum. Nenhuma imagem comprada, nenhum serviço pago, nenhuma dependência nova, nenhum `package.json`.

**Padrão de entrega (status de cada item)**
| item | status | motivo / prova |
|---|---|---|
| Build, lint e testes rodam sem erro | ok | `rodar-tudo.mjs` saída 0 (sem build: app estático; sem lint configurado no projeto). Critério de aceite dos testes cumprido por `node --test 'projetos/itaitu-mapa/testes/*.test.mjs'` (com o padrão entre aspas) e por `rodar-tudo.mjs`. A forma de pasta, `node --test projetos/itaitu-mapa/testes/`, **não funciona no Node 22**: sai com MODULE_NOT_FOUND e exit 1 (o Node 22 trata o argumento como módulo, não como pasta). Não é falha dos testes. Ver a seção "Correção do QA: comando do critério de aceite" no fim. |
| Abre sem erro de console e sem requisição falhando | ok | online, offline, CPU 4x, movimento reduzido, demo e `marcos.html` |
| Fluxos principais de ponta a ponta | ok (local) | régua, tábuas, offline, cartão, demo; GPS e gravação foram provados nas tarefas T6 e T9 com geolocalização emulada |
| 390 px, alvos >= 44 px, texto >= 11 px | ok, com exceção | o link "© OpenStreetMap contributors" do crédito do mapa tem 16 px de altura: é link dentro de frase (exceção do WCAG 2.5.8), o teste o deixa de fora de propósito |
| Teclado e foco visível | ok | régua por Tab, setas, PageUp, Home/End; foco visível |
| Contraste AA, alt, rótulos | ok (pelas tarefas T3 e T6) | não remedido nesta tarefa |
| `prefers-reduced-motion` e tema escuro | ok | (9) no teste; prints claro e escuro limpos |
| Momento-assinatura no celular | ok no emulador, não verificado em aparelho | aqui o dia correndo cai para o modo parado (3,2 fps com SwiftShader sem GPU e CPU 4x), como manda o portão; a animação real só aparece num aparelho com GPU |
| Revisor | não verificado nesta tarefa | os módulos T6 a T11 passaram pelo Crivo; `conferir-app.cjs`, `rodar-tudo.mjs` e a linha nova do `sw.js` ainda não |
| Segurança | não verificado nesta tarefa | varredura de higiene feita aqui (sem segredo, sem chamada externa); auditoria da Muralha não rodou nesta tarefa |
| Sem segredos no repositório | ok | varredura acima; o projeto não tem `.env` |
| Dependências novas com versão fixada | ok | nenhuma nova; vendor com versão e SHA-256 em `vendor/VERSOES.json` |
| Textos reais, sem falso pronto | ok | varredura acima, zero acertos |
| Sem tela branca | ok | o mapa aparece antes das horas |
| Publicado e conferido no ar | **não verificado no ar** | sem deploy (decisão do dono). Depois do merge: `conferir-app.cjs` e `comparar-com-app.cjs` contra o endereço do Pages e um celular com internet móvel |
| Integrações (5 fatos) | SW/offline: registrado, configurado, saudável no teste local; alcançável e autorizado: não (sem deploy). Web Share, Wake Lock, GPS e som reais: não verificados (sem aparelho) | |

**O que ficou de fora de propósito:** a abertura da placa que tomba (atrasa o mapa e promete mais do que 2 coordenadas entregam), a letra pintada de licença incerta, Three.js (o MapLibre faz o 3D), CBERS e qualquer satélite pago (o relevo pintado com a luz real é o estilo principal; o Sentinel-2 2016 fica no botão Satélite), a bússola com portão de confiança como centro do app, e qualquer dependência nova.

**O que falta (honesto)**
- Coordenadas: hoje **8 cachoeiras e poços sem coordenada** no `pontos.geojson` (Sossego, Geladeira, Piancó, Santuário, Índios, Andorinhas, Riachinho e Sonhos). A tarefa citava 3 (Sossego, Geladeira e Piancó); o arquivo atual tem 8, e todas aparecem sem hora, com "vá com guia" e "Chamar um guia". Flores está aproximada e o Village está aproximado (confiança baixa). **Só os pontos confirmados têm hora de sol** (Véu, Arapongas, Coxinho e Urubu). A oferta é "a placa se completa": cada trilha gravada em campo com um condutor da ACAGI entra "fincada pela ACAGI" e pode calibrar `sol_ajuste_min`.
- Aparelho real: fps do dia correndo, som, Web Share com arquivo, Wake Lock, GPS e leitura do QR impresso.
- Tempo da demo: no emulador sem GPU, o "Ver de novo" chega aos 75 s contados do `goto` (inclui ~12 s até as horas aparecerem). Falta medir num celular.
- Primeira abertura no emulador: o mapa aparece em ~5 s e as horas em ~8,5 s a 12 s (SwiftShader). Medir num celular de verdade.
- Na tela do celular, a etiqueta "Véu 16:05" do mapa fica parcialmente atrás da coluna de controles na câmera inicial (print `celular-claro.png`). Dono: Órbita (câmera inicial) ou Pixel (posição dos controles). Não é bloqueio.
- O CI do GitHub (`sede-ao-vivo.yml`) não roda os testes do Itaitu, e as actions estão fixadas por tag (`@v4`), não por SHA. Não mexi em `.github` (fora do escopo). Recomendação: um passo `node --test 'projetos/itaitu-mapa/testes/*.test.mjs'` com Node 22 no job `testes`.

**Kit v1 e PIN:** o formato do kit de venda é o da ARQUITETURA 7.6 (`{ "formato": "itaitu-kit", "versao": 1, "gerado_em", "roteiro": [{titulo, texto}], "objecoes": [{pergunta, resposta}], "precos": [{plano, valor_centavos, periodo: "mensal"|"unico", inclui}], "notas" }`, até 512 KB). O conteúdo vem do Dropbox e nunca entra no repositório. A trava com PIN do `marcos.html` (PBKDF2-SHA-256, 100.000 iterações) é **proteção de uso, não cofre**: impede que o hóspede saia da vitrine ou abra o caderno, mas quem tem o celular destravado lê o IndexedDB.

**Arquivos tocados:** `site/itaitu/precache.json`, `site/itaitu/sw.js` (só a linha `VERSAO_DA_LISTA` e o comentário dela), `projetos/itaitu-mapa/testes/conferir-app.cjs`, `projetos/itaitu-mapa/testes/rodar-tudo.mjs`, `projetos/itaitu-mapa/testes/LEIA.md`, este RELATORIO (resumo no topo e esta seção; nada apagado).

**Como verificar:** `node projetos/itaitu-mapa/testes/rodar-tudo.mjs` → última linha `RESULTADO: tudo passou`. `node site/ao-vivo/teste-nucleo.cjs` → `núcleo: 18 verificações ok`.

**Lição da rodada:** o `sw.js` que lê a lista em tempo de execução nunca muda de bytes, e o navegador nunca reinstala o service worker: correção de JS publicada não chegaria a quem já tinha o mapa. Prova: a linha `VERSAO_DA_LISTA` agora acompanha o `precache.json`, e o `rodar-tudo.mjs` reprova se ela ficar para trás (`pré-cache completo e atualizado: ok`, versão 1cbbca14422d).

---

## Correções do QA, rodada de 20/11 (Pixel, frontend)

**O que fiz (8 achados, todos corrigidos):**
1. **[médio] Régua à noite:** depois de escurecer, a régua abria em "amanhã, 18:10, já escureceu". Agora ela abre no "saia até" de amanhã do destino da faixa, ou no nascer de amanhã quando não há "saia até". Às 22:30 o leitor de tela ouve "amanhã, 14:30, sol no Véu da Noiva" (`hora/index.js`, `h.minutoInicialDaRegua`).
2. **[baixo] `?m=` inexistente:** a marca só busca `<slug>.json` listado em `marcas/indice.json`. Fora do índice cai na padrão, sem 404. Sem índice (rede caiu antes do pré-cache), o comportamento é o de antes (`marca.js`).
3. **[médio] `?vitrine=1` desligava o SOS:** o parâmetro só vale dentro do iframe `#vitrine-frame` do `marcos.html`, na mesma origem (`util.emVitrine`). Fora disso o `app.js` tira o parâmetro de `Itaitu.params`, e nenhum módulo o vê (sos, destinos, tábuas, cartão, marca). Na vitrine de verdade o SOS **não desliga mais**: o 1º toque avisa dentro do próprio diálogo ("Isto é a demonstração. Toque de novo em até 5 segundos para ligar para o 193 de verdade"), e o 2º toque liga ou manda o SMS. Os 193/192/190 do painel Informações seguem a mesma regra. WhatsApp, Instagram e "Chamar um guia" continuam desligados só na vitrine verdadeira.
4. **[médio] `?agora=` e `?sw=0` no endereço público:** passam a valer só em localhost, 127.x e ::1 (`util.ganchoDeTeste`). No endereço público são ignorados: não há relógio falso nem SW desligado por link. Não abri a exceção do "app particular destrancado": nenhum fluxo de produção precisa disso.
5. **[médio] Polegar fantasma depois do toque:** `h.abrir` chama `regua.pararPolegar()` assim que a abertura termina ou é interrompida. O laço do `arrastarSolDemo` confere `data-ativo` antes de escrever na régua e resolve com `parado: true`. O toque do hóspede na régua também para o polegar.
6. **[médio] Cartão sem motor:** o cartão é montado antes do motor. Se o motor falhar, ele sai com o relevo de reserva e a frase sem hora de sol.
7. **[baixo] Avisos repetidos de "faltam X min":** a regra virou uma função pura, `regras.limiarParaAvisar`, que dá só o menor limiar alcançado. Começando com 20 min sai 1 aviso (o de 30). Com 8 min, 1 aviso (o de 15).
8. **[baixo] Corrida no salvar:** `salvar()` trava com `salvando`, e nessa janela `salvarAgora()` e o GPS não escrevem. Os pontos e as passagens vão copiados para o registro final. Se a gravação no banco falhar, a trava solta e a trilha continua em andamento.

**Textos:** `demo.vitrine` foi reescrito ("WhatsApp e links para fora do app ficam desligados. As ligações de emergência continuam valendo."). Entraram `demo.vitrine_sos`, `demo.vitrine_acao_ligar` e `demo.vitrine_acao_sms`. Verbo, confira o tom.

**Arquivos tocados:**
- código: `site/itaitu/js/util.js`, `js/app.js`, `js/sos.js`, `js/marca.js`, `js/gravador.js`, `js/textos.js`, `js/hora/index.js`, `js/hora/regua.js`, `js/hora/regras.js`, `js/hora/horarios.js`, `css/app.css` (`.sos__vitrine`)
- service worker: `site/itaitu/precache.json` (regenerado) e `site/itaitu/sw.js` (`VERSAO_DA_LISTA` = `d8c5c707d4e8`)
- testes: `projetos/itaitu-mapa/testes/conferir-app.cjs` (seção 10 nova), `regras-situacao.test.mjs` (+2 testes), `ganchos.test.mjs` (novo) e `LEIA.md` (`--so=10`)

**Como verificar:**
- `node projetos/itaitu-mapa/testes/rodar-tudo.mjs`: rodei nesta rodada, e a última linha foi `RESULTADO: tudo passou`. Foram 41 testes de unidade, o pré-cache e o conferir-app inteiro (seções 2 a 10 e `marcos.html`).
- Só as correções: `node projetos/itaitu-mapa/testes/conferir-app.cjs --so=10` (18 ok). O teste mostra:
  - às 22:30 a régua fica em 870 (14:30) e não em 1090;
  - `?m=naoexiste` não pede o JSON;
  - `?vitrine=1` aberto direto deixa o SOS ligado;
  - no iframe do `marcos.html` o 1º toque avisa e o 2º passa;
  - com `motor/cliente.js` bloqueado, o cartão sai em 1080x1920.
- Polegar (item 5): a abertura neste emulador cai no modo parado (3,4 fps, SwiftShader), então o polegar nunca chega a rodar aqui. Testei o módulo `regua.js` direto: depois de `pararPolegar()`, o polegar faz **0** chamadas a `irPara`, e a promessa resolve com `parado: true`.
- Prints com `verificacao-visual` às 22:30 (celular claro e escuro, desktop): sem achado. Com o painel aberto, a régua mostra "14:30 · sol no Véu da Noiva" e "amanhã · nascer 05:10".

**O que ficou pendente:**
- **Não verificado em aparelho:** o polegar fantasma interrompido no meio do arraste, porque o emulador não chega nessa fase. Também não verifiquei a ligação e o SMS reais depois do 2º toque na vitrine (o teste anula a navegação para `tel:`).
- **Não verificado no ar:** não houve deploy.
- **Achado novo, fora do escopo:** no celular, com o painel Cachoeiras aberto, a atribuição do mapa ("© OpenStreetMap contributors | Terrain Tiles…") aparece por cima da faixa escura do "saia até" (print `.verificacao/celular-claro.png` com o painel aberto). É de camada (z-index) entre `.maplibregl-ctrl-attrib` e a faixa. Dono: Pixel, na próxima rodada.
- Revisor e segurança ainda não passaram por estas mudanças. A segurança deve olhar `util.emVitrine` e a regra do 2º toque.

**Lição da rodada:** parâmetro de URL que desliga algo (SOS, offline, relógio) tem de ser limpo num lugar só, na entrada do app. Os outros módulos não podem confiar nele. Prova: `conferir-app.cjs --so=10`, com "?vitrine=1 fora do iframe é ignorado (param=null)" e "botões de SOS ligados (tel:193, tel:192, tel:190)".

## Correção do QA · número do mapa no kit de venda (Verbo, copywriter, 20/11/2026)

**O problema:** o kit de venda dizia "5 das 7 cachoeiras sem coordenada". O número vinha da `pesquisa-radar.md`, de antes de o Coxinho e as Flores entrarem no mapa. Numa demonstração, o Marcos falaria um número e o dono veria outro.

**A conta, refeita hoje por script (arquivo e tela batem):**
- `site/itaitu/dados/pontos.geojson`: 13 cachoeiras e poços. 4 confirmadas (Véu da Noiva, Arapongas, Coxinho, Urubu), 1 aproximada (Flores), 8 sem coordenada (Sossego, Geladeira, Piancó, Santuário, Índios, Andorinhas, Riachinho, Sonhos). Da placa: 3 confirmadas, 1 aproximada e 3 sem coordenada.
- Tela, 390 px, tocando em "Cachoeiras" e rolando a lista: 13 tábuas. As 4 confirmadas mostram a hora do sol (Véu 16:05, Arapongas 15:40, Coxinho 16:45, Urubu 16:35, em 20/11 às 13:00). Flores mostra "posição aproximada". As 8 mostram "posição não confirmada: vá com guia" e "Chamar um guia". Console limpo.
- As 4 confirmadas vêm de fonte pública (OSM, SGB Geossit, Wikiloc pela busca). Nenhuma foi conferida em campo. Nenhuma trilha foi gravada com guia: o `trilhas.geojson` só tem traçados do OSM e rotas de carro.

**A frase única, agora igual no kit, na fala e aqui:**
- Escrita: "Das 13 cachoeiras e poços do app, 4 têm posição confirmada em mapa público e hora do sol (Véu da Noiva, Arapongas, Coxinho e Urubu), 1 tem posição aproximada (Flores) e 8 aparecem como "vá com guia", sem coordenada. Da placa, as sem coordenada são 3 de 7: Sossego, Geladeira e Piancó."
- Falada (roteiro, seções 2 e 4): "Hoje o mapa tem 13 cachoeiras e poços. Em 4, a posição está confirmada em mapa público, e ele vê a hora do sol: Véu da Noiva, Arapongas, Coxinho e Urubu. A das Flores está aproximada. As outras 8 aparecem como 'vá com guia'."
- A regra que vai junto: o número dito é o da lista do botão "Cachoeiras" no dia da visita. Se a tela mudar, vale a tela.

**Arquivos tocados** (`projetos/itaitu-mapa/venda/`, fora do git) **e este RELATORIO** (só esta seção):
- `LEIA-PRIMEIRO.md`: trava 4 com a frase e a regra da tela. A trava 1 dizia "o app ainda não tem tela" e contradizia a trava 4; agora diz que a tela e a demo passam no teste local e que o app não está no ar.
- `mercado.md`: resposta curta; seção 3 (o OSM tem 3 cachoeiras com coordenada no recorte, Véu, Arapongas e Urubu, e nenhuma trilha com nome, conferido em `dados/osm/recorte-api06.json`); seção 5 ("4 das 13", nenhuma trilha gravada em campo).
- `oferta.md`: obstáculo 14 e risco 6.
- `roteiro.md`: de 10 a 30 s a fala nomeava as 7 da placa "com a distância de carro e de trilha", mas o voo da demo para só em duas cachoeiras, com a hora do sol (legenda lida a cada segundo; print aos 14 s com "Arapongas: sol no poço até 15:40"). A fala agora diz o que a tela mostra. A frase falada entrou na seção 2 e na objeção "O mapa está certo?".
- `proposta.md`: linha "Mapa hoje ([PREENCHER: data])" nos prazos da página impressa, item novo em "Antes de imprimir" e a linha protegida do corte. Tamanho remedido: 659 palavras e 3.333 caracteres (a linha somou 28 palavras).

**Como verificar:**
- `grep -rn -E "5 das 7|2 das 7" projetos/itaitu-mapa/venda/` não acha nada.
- `python3 -I -c "import json,collections;g=json.load(open('site/itaitu/dados/pontos.geojson'));c=collections.Counter(('sem-coordenada' if not f['geometry'] else 'aproximada' if f['properties']['aproximado'] else 'confirmada') for f in g['features'] if f['properties']['tipo'] in ('cachoeira','poco'));print(sum(c.values()),dict(c))"` dá `13 {'confirmada': 4, 'sem-coordenada': 8, 'aproximada': 1}`.
- `node projetos/itaitu-mapa/testes/comparar-com-app.cjs` dá `ok 8 tábua(s) sem coordenada na tela`, Flores sem hora e `RESULTADO: tudo bateu` (rodado nesta rodada).

**Pendente:**
- **Dropbox desatualizado.** Em `/Creat.MTT Studio/Creat Nuvem/Trilhas de Itaitu`, 4 arquivos ainda são a versão antiga (mesmo tamanho em bytes da versão local de antes desta correção): `4 - Textos/Creat Nuvem - Trilhas de Itaitu - roteiro de venda.md`, `4 - Textos/... - proposta de uma página.md`, `5 - Relatórios/... - oferta e conta.md` e `5 - Relatórios/... - mercado e compradores.md`. Não mexi: o conector pede a confirmação do dono antes de criar ou mover arquivo, e esta etapa roda sem ele. Na entrega: mover os 4 para `9 - Versões antigas` e subir os novos com o mesmo nome. A pasta também não tem `LEIA PRIMEIRO.md`.
- O número muda a cada ponto confirmado ou trilha gravada em campo. A regra "vale a tela" cobre a fala; o papel depende do item "Antes de imprimir" da proposta.
- "Trilha não gravada aparece como 'vá com guia'" (proposta, oferta, roteiro) não bate exatamente com o app. A tábua mostra "vá com guia" só em ponto sem coordenada; o Coxinho não tem trilha gravada e mostra a hora do sol. Para destino sem traçado, a rota diz "Sem traçado desta trilha no mapa. Siga a placa e, na dúvida, vá com guia." (`rota.js`, lido no código, não na tela). Decidir se muda a frase ou o app: Diretor e Pixel.
- `placa-qr.md`, linha 9, ainda diz que `site/itaitu/` não tem tela. A conferência dos nomes da placa com a tela já pode ser feita.
- O Pixel pediu que eu confira o tom de `demo.vitrine`, `demo.vitrine_sos`, `demo.vitrine_acao_ligar` e `demo.vitrine_acao_sms`. Não fiz: o `textos.js` estava com ele nesta onda (um escritor por arquivo).

---

## Correção do QA: comando do critério de aceite (Trilho, devops, 20/11/2026)

**Achado [baixo]:** quem roda o critério ao pé da letra, `node --test projetos/itaitu-mapa/testes/`, vê falha. No Node v22.23.5 sai `Error: Cannot find module '/home/user/Creat-mtt-studio/projetos/itaitu-mapa/testes'`, exit 1, 0 testes. Isso acontece com qualquer pasta, porque nessa versão o Node trata o argumento como arquivo de entrada e não varre a pasta. Não é defeito dos testes.

**O que fiz:**
- Na tabela do padrão de entrega da T12, a linha "Build, lint e testes" agora diz qual comando cumpre o critério (o padrão com glob e o `rodar-tudo.mjs`) e que a forma de pasta não serve no Node 22.
- Conferi onde o comando aparece. A `ARQUITETURA.md` (seção 10 e critério 1, linha 744) e os cabeçalhos de `hora-da-serra.test.mjs`, `pacote.test.mjs`, `regras-situacao.test.mjs`, `ganchos.test.mjs` e `LEIA.md` já usam o glob. O código não mudou.

**Arquivos tocados:** só este `RELATORIO.md` (uma célula da tabela da T12 e esta seção, nada apagado).

**Como verificar (rodei agora, Node v22.23.5):**
- `node --test 'projetos/itaitu-mapa/testes/*.test.mjs'` deu `# tests 41`, `# pass 41`, `# fail 0`. Hoje são 41 testes, e não os 37 que o QA contou, porque a rodada do Pixel acrescentou 4.
- `node projetos/itaitu-mapa/testes/rodar-tudo.mjs --rapido` saiu com exit 0 e a última linha foi `RESULTADO: tudo passou`. Passaram o node --test, o pré-cache, o `conferir-app.cjs` online e offline e o `comparar-com-app.cjs`.
- `node --test projetos/itaitu-mapa/testes/` continua com exit 1 e MODULE_NOT_FOUND. O resultado é esperado e agora está documentado.

**Pendente:**
- `testes/textos.test.mjs:2` ainda tem o comentário com a forma de pasta. O arquivo é do Verbo, e a regra é um escritor por arquivo. A linha certa é `// Rodar:  node --test 'projetos/itaitu-mapa/testes/*.test.mjs'`.
- A solução de vez é um `"test": "node --test 'projetos/itaitu-mapa/testes/*.test.mjs'"` no `package.json` e um passo no CI (`sede-ao-vivo.yml`, job `testes`, Node 22). Isso fica para quando o escopo permitir mexer no `package.json` e em `.github`.

**Lição da rodada:** no Node 22, `node --test <pasta>/` não varre a pasta. Critério de aceite com `node --test` leva o glob entre aspas. Prova: a pasta dá exit 1 com MODULE_NOT_FOUND, e o glob dá 41 de 41.
