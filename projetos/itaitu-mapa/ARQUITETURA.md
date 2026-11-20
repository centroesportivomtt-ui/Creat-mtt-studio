# Arquitetura: Trilhas de Itaitu + Hora da Serra

Autor: Cirro (arquiteto), 20/11/2026. Este é o contrato que todas as tarefas leem. O briefing (`BRIEFING.md`) diz o que o produto faz; este arquivo diz **quem escreve o quê, com que nome e em que formato**. Onde este arquivo e o briefing divergem, vale este arquivo, e a divergência está explicada no fim.

Pergunta de venda: o hóspede escaneia o QR e em 5 s vê o vale com a luz do minuto e "a serra apaga o sol do Véu às 16:05. Para ter 1 hora de sol no poço, saia até 14:30". Tudo abaixo existe para essa frase aparecer rápido, certa, honesta e sem internet.

---

## 1. Pastas e dono único de cada arquivo

Regra: **um escritor por arquivo**. Quem precisa de algo num arquivo de outro dono pede no RELATORIO.md e usa o contrato deste documento enquanto isso.

```
site/itaitu/
├── index.html                    frontend A   app público (hóspede)
├── marcos.html                   frontend C   app particular do Marcos
├── manifest.webmanifest          designer     app público
├── manifest-marcos.webmanifest   frontend C   "Itaitu · Marcos", id e start_url próprios
├── sw.js                         devops       service worker (seção 8)
├── precache.json                 devops       gerado por script (seção 8)
├── css/
│   ├── tokens.css                designer     variáveis (cores, tipos, alvos)
│   ├── fontes.css                designer     @font-face locais
│   ├── tabuas.css                designer     tábua, faixa "saia até", etiqueta de hora
│   ├── regua.css                 designer     régua do dia
│   ├── app.css                   frontend A   casco, mapa, painéis, SOS, gravador
│   ├── hora.css                  frontend B   só encaixe dos #hora-* (sem cor nova)
│   └── marcos.css                frontend C
├── js/
│   ├── app.js estilo.js mapa.js dados.js marca.js destinos.js gps.js rota.js
│   │   gravador.js banco.js gpx.js sos.js busca.js armazenamento.js
│   │   economia.js util.js perfil.js marcar.js   frontend A (seção 2.1)
│   ├── textos.js                 copywriter   todos os textos da interface
│   ├── som.js                    som          Web Audio sintetizado
│   ├── luz.js voos.js abertura.js  motion-3d
│   ├── motor/                    shader
│   │   ├── nucleo.js             puro (navegador e Node): sol, horizonte, horas, relógio
│   │   ├── sombra.js             máscara da sombra projetada (varredura de linhas)
│   │   ├── relevo-cartao.js      relevo sombreado do cartão
│   │   ├── worker.js             Web Worker (módulo)
│   │   └── cliente.js            Promises no main thread
│   ├── hora/                     frontend B
│   │   ├── index.js              montar(ctx), orquestra o recurso
│   │   ├── regua.js              régua do dia
│   │   ├── sombra-canvas.js      CanvasSource 'sombra-serra' e etiquetas de hora no mapa
│   │   ├── tabuas.js             tábuas dos destinos d'água
│   │   ├── regras.js             puro: saia até, volte com luz, amanhã (Node importa)
│   │   ├── horarios.js           nascer, pôr, escurece, "faltam X min"
│   │   ├── cartao.js             cartão 1080x1920
│   │   └── demo.js               ?demo=1
│   └── marcos/**                 frontend C   (nomes internos livres)
├── dados/
│   ├── pontos.geojson            time de dados. NINGUÉM do time de construção edita
│   ├── trilhas.geojson           time de dados. NINGUÉM do time de construção edita
│   ├── base.geojson              devops       gerado do recorte OSM
│   ├── atribuicoes.json          devops
│   ├── recorte.json              devops       recorte do vale (seção 7.0)
│   └── info.json                 copywriter
├── marcas/
│   ├── indice.json padrao.json demo-village.json demo-camping.json   copywriter
├── tiles/dem/{z}/{x}/{y}.png     devops       Terrarium z8–z14 (132 tiles)
├── tiles/sat/{z}/{x}/{y}.jpg     devops       Sentinel-2 2016 z8–z14 (132 tiles)
├── vendor/                       devops       maplibre-gl.js, maplibre-gl.css, LICENSE.txt (MapLibre 5.24.0),
│                                              qrcode-generator.js (global `qrcode`) e .mjs (export default),
│                                              LICENSE-qrcode-generator.txt, VERSOES.json (só o marcos.html usa o QR)
├── fontes/**                     designer     Atkinson Hyperlegible Next (OFL) + licença
├── icones/**                     designer     ícones do manifest e da interface
└── arte/**                       designer     ilustrações; logos de parceiro AUTORIZADOS em arte/parceiros/

projetos/itaitu-mapa/
├── ARQUITETURA.md                arquiteto
├── RELATORIO.md                  todos, só acrescentam seção
├── scripts/aplicar-pacote.mjs    backend
├── scripts/baixar-tiles.mjs, gerar-base.mjs, gerar-precache.mjs, preparar-vendor.mjs   devops
├── prototipos/*.py               devops (cópia de referência; o shader lê, ninguém edita)
├── testes/motor.test.mjs, testes/png.mjs, testes/pacote.test.mjs  backend
└── testes/e2e-*.mjs              qa (se a verificação criar)
```

Por que cada pasta: `js/motor` isola o cálculo (testável em Node, roda em worker); `js/hora` isola o recurso-assinatura (o app abre e funciona se ele falhar); `js/marcos` isola o app particular (nunca carregado pelo `index.html`); `dados` e `marcas` são JSON que mudam sem tocar em código; `tiles` e `vendor` são binários de terceiros com licença.

Nada fora de `site/itaitu/` e `projetos/itaitu-mapa/`. Não tocar `site/index.html`, `site/ao-vivo/`, `site/vendor/`, `.github/`.

---

## 2. Estado global e ganchos

`index.html` carrega `./vendor/maplibre-gl.js` como script clássico (é UMD, expõe `window.maplibregl`) e depois `<script type="module" src="./js/app.js">`. O `marcos.html` faz o mesmo e carrega `./js/marcos/` por cima.

```js
window.Itaitu = {
  app: 'publico' | 'marcos',
  params: URLSearchParams,          // cópia de location.search na abertura
  map: null | maplibregl.Map,       // preenchido no 'load'
  recorte: {...},                   // dados/recorte.json
  dados: { pontos, trilhas, base, info },  // FeatureCollections já enriquecidas (seção 6) e info.json
  marca: {...},                     // marca validada (seção 7.1)
  motor: null | Motor,              // seção 4.3; o B preenche depois do 'init' e emite itaitu:motor. O A só lê (perfil, toque longo)
  agora(): Date,                    // seção 3
  economia(): boolean,
  reduzMovimento(): boolean,        // prefers-reduced-motion OU economia()
  on(nome, fn): () => void,         // devolve a função de desligar
  emit(nome, detalhe): void,        // document.dispatchEvent(new CustomEvent(nome, {detail}))
};
```

Boot do `app.js` (o mapa nunca espera o show):
1. Lê parâmetros; carrega `recorte.json`, marca e dados em paralelo.
2. Cria o mapa com `estilo.js` já com a luz do minuto (`posicaoDoSol` de `./motor/nucleo.js`).
3. No `'load'` do mapa: põe os dados nas fontes, cria `window.Itaitu.map`, emite `itaitu:pronto`.
4. Depois, **sem await que segure a tela**, cada um em `try/catch` com `console.info` (nunca `console.error`):
   `(await import('./luz.js')).ligar(window.Itaitu)` e `(await import('./hora/index.js')).montar(window.Itaitu)`.
5. Registra o SW (`navigator.serviceWorker.register('./sw.js', {scope: './'})`), exceto com `?sw=0`, que desregistra (uso em desenvolvimento e testes).

Eventos (sempre no `document`, nome com o prefixo):

| evento | quem emite | `detail` |
|---|---|---|
| `itaitu:pronto` | app.js | `{ map }` |
| `itaitu:destinos` | dados.js / destinos.js | `{ pontos }` (FeatureCollection enriquecida) |
| `itaitu:economia` | economia.js | `{ ligado: boolean }` |
| `itaitu:hora` | hora/index.js, regua.js, abertura (via B), demo.js | `{ minutos, data: 'AAAA-MM-DD', origem: 'relogio'\|'regua'\|'abertura'\|'demo' }` |
| `itaitu:destino-escolhido` | tabuas.js, destinos.js, busca.js | `{ id, origem: 'tabua'\|'lista'\|'mapa'\|'busca'\|'demo' }` |
| `itaitu:trilha-gravada` | gravador.js | `{ id, destino_id\|null, km, desnivel_m, duracao_s, inicioMs, fimMs }` |
| `itaitu:gravacao` | gravador.js | `{ estado: 'gravando'\|'pausada'\|'parada' }` |
| `itaitu:motor` | hora/index.js | `{ ok: boolean }` (falso: sem OffscreenCanvas ou `init` falhou) |
| `itaitu:toque-longo` | mapa.js | `{ lon, lat, origem: 'toque'\|'centro' }` |
| `itaitu:ponto-marcado` | marcar.js | `{ id }` (Feature já gravada em `marcados`) |

Quem reage: destinos.js ouve `itaitu:destino-escolhido` (voo e alvo do GPS); luz.js ouve `itaitu:hora`; cartao.js ouve `itaitu:trilha-gravada`; horarios.js ouve `itaitu:gravacao`; perfil.js ouve `itaitu:motor` (refaz os perfis que esperavam o relevo) e `itaitu:trilha-gravada`; mapa.js ouve `itaitu:ponto-marcado` (atualiza a fonte `marcados`).

Ids de montagem que o frontend A cria vazios em `index.html` para o B preencher (o A não escreve dentro deles):

| id | onde | conteúdo (B) |
|---|---|---|
| `#hora-regua` | rodapé fixo sobre o mapa | régua do dia |
| `#hora-faixa` | logo acima da régua | faixa "saia até" |
| `#hora-tabuas` | painel de destinos | `<ul class="tabuas">` |
| `#hora-horarios` | painel de destinos, topo | nascer, pôr, escurece, alerta |
| `#hora-cartao` | `<dialog>` | prévia e compartilhar do cartão |
| `#hora-demo-controle` | canto, só com ?demo=1 | sair/pausar demonstração |
| `#hora-live` | invisível, `aria-live="polite"` | anúncios de hora e sombra |

O `marcos.html` mostra a vitrine num `<iframe src="./index.html?m=<slug>&demo=1&vitrine=1">`; com `vitrine=1` o A desliga links externos (wa.me, tel, sms) com aviso "na demonstração". A trava (toque longo + PIN) fica no `marcos.html`, por cima do iframe.

### 2.1 Cada função do briefing tem um arquivo dono

Regra: função obrigatória do briefing ("O que o app faz", "Realmente completo") sem linha nesta tabela não tem autor. Quem achar uma falta pede no RELATORIO.

| função do briefing | arquivo (dono) | onde aparece na tela |
|---|---|---|
| mapa 3D, 3D/2D, Satélite/Mapa, voltar ao norte | `estilo.js`, `mapa.js` (A) | controles no canto do mapa |
| lista de destinos, cartão do destino, voo | `destinos.js` (A); tábuas `hora/tabuas.js` (B); voo `voos.js` (motion-3d) | painel de destinos; detalhe em `#destino-detalhe` |
| GPS ao vivo, seguir, rumo e distância, fora da trilha, bússola | `gps.js`, `rota.js` (A) | ponto azul; faixa de rumo no rodapé com destino escolhido |
| gravar trilha, GPX de saída | `gravador.js`, `gpx.js` (A) | painel Gravar |
| **Marcar ponto aqui** (briefing, item 4) | `marcar.js` (A) | botão no painel Gravar e no balão do toque longo; lista "Meus pontos" no mesmo painel (seção 2.2) |
| importar GPX | `gpx.js` (A) | painel Gravar, "Importar GPX" |
| **perfil de altitude de cada trilha** | `perfil.js` (A) | `#destino-detalhe` (trilha `pe` do destino), resumo ao parar a gravação, item de "Minhas trilhas" (seção 2.2) |
| **coordenada do toque longo no mapa** | `mapa.js` (A), formatação em `util.js` (A) | balão sobre o ponto tocado (seção 2.2) |
| busca offline por nome | `busca.js` (A) | campo no topo do painel de destinos |
| SOS (coordenada grande, SMS, 192/193/190) | `sos.js` (A), formatação em `util.js` | botão SOS fixo |
| segurança (avisos, guias, melhor época) | `app.js` lê `info.json` (A); texto do copywriter | painel Informações |
| horários do dia, "faltam X min para escurecer" | `hora/horarios.js` (B) | `#hora-horarios` |
| armazenamento, "atualizar mapa" | `armazenamento.js` (A) | painel Informações |
| economia | `economia.js` (A) | botão no painel Informações |
| contraste alto, texto grande | `app.js` (A), atributos no `<html>` (6.4) | painel Informações |
| marca, "Falar com a pousada", "Onde comer" | `marca.js` (A) | topo do app e painel de destinos |
| "Chamar um guia" | `hora/tabuas.js` (B) na tábua; `marca.js` (A) no painel | tábua e painel |
| cartão da trilha | `hora/cartao.js` (B) | `#hora-cartao` |
| demonstração | `hora/demo.js` (B) | `?demo=1` |
| app particular inteiro | `marcos.html`, `js/marcos/**` (C) | só no `marcos.html` |

### 2.2 Perfil, toque longo e Marcar ponto aqui (frontend A)

**`js/util.js`** é puro (nada de DOM ao importar; Node importa para teste):
```js
export function tempoMaisLentoMin(texto) -> int | null        // seção 6.1
export function formatarDecimal(lon, lat) -> '-11.333108, -40.503572'      // lat primeiro, 6 casas, ponto decimal
export function formatarGMS(lon, lat) -> '11°19′59,2″ S · 40°30′12,9″ O'   // segundos com 1 casa e vírgula
export function distanciaM([lon, lat], [lon, lat]) -> number                // haversine, R = 6.371.000
```
`sos.js` e `mapa.js` usam as mesmas funções; ninguém formata coordenada por conta própria.

**`js/perfil.js`**
```js
export function perfilDeCoordenadas(coords /*[[lon, lat, alt], ...]*/, passoM = 25) -> Perfil | null
//   null se algum ponto não tem altitude; reamostra por distância ao longo da linha a cada passoM
export async function perfilDaTrilha(trilha /*Feature LineString ou registro de banco.js*/, motor /*Itaitu.motor*/) -> Perfil | null
//   1º: altitudes da própria trilha (gravada ou GPX com <ele>), fonte 'gps'
//   2º: sem altitude, motor.altitudes(...) (seção 4.3) sobre a grade z12, fonte 'relevo'
//   3º: sem motor, null; a tela diz t('perfil.indisponivel') e tenta de novo no itaitu:motor
export function desenharPerfil(el, perfil, { posicaoM } = {})   // SVG inline, sem biblioteca; posicaoM marca "você está aqui"
Perfil = { pontos: [[dist_m, alt_m], ...],   // inteiros, começa em [0, alt]
           km, subida_m, descida_m, min_m, max_m, fonte: 'gps' | 'relevo' }
```
- Subida e descida somam só variações de 3 m ou mais (histerese), para o ruído do GPS não inflar o desnível. `desnivel_m` em todo o app (evento `itaitu:trilha-gravada`, banco, pacote, cartão) é o `subida_m` desta função.
- O SVG tem `role="img"` e `aria-label` com o resumo em texto ("sobe 61 m, desce 12 m, de 560 a 621 m de altitude"); o mesmo resumo aparece escrito abaixo do gráfico. Fonte 'relevo' vem com t('perfil.do_relevo'), "altitude do relevo, ~37 m por pixel".
- O app particular (C) importa `perfil.js` para preencher o campo `perfil` do pacote (7.5); não reimplementa.

**Toque longo (`js/mapa.js`)**
- Disparo: um dedo parado 550 ms com movimento < 10 px; no desktop, `contextmenu`. Arrastar, pinçar ou girar cancela. Desligado com a trava da gravação ativa e durante a demonstração.
- Alternativa de teclado e leitor de tela: botão "Coordenada do centro do mapa" nos controles do mapa, que abre o mesmo balão no centro (`origem: 'centro'`).
- Balão (`maplibregl.Popup`, conteúdo montado com `textContent`): `formatarDecimal`, `formatarGMS`, altitude do relevo (`motor.altitudes`, omitida se não houver motor), distância até o GPS quando ligado, e os botões "Copiar coordenada" (`navigator.clipboard.writeText`; sem permissão, seleciona o texto) e "Marcar ponto aqui" (chama `marcarPonto` com `origem: 'toque'`). Fecha com Esc e com o X de 44 px.
- Emite `itaitu:toque-longo`.

**Marcar ponto aqui (`js/marcar.js`)**, nos dois apps
```js
export async function marcarPonto({ lon, lat, alt = null, precisao_m = null, origem /*'gps'|'toque'*/ }) -> Promise<Feature | null>  // null = cancelado
export async function listarMarcados() -> Feature[]
export async function apagarMarcado(id)
export async function exportarMarcados(formato /*'geojson'|'gpx'*/) -> Blob   // GPX com <wpt>, montado por gpx.js
```
- Botão "Marcar ponto aqui" no painel Gravar, com ou sem gravação em andamento: usa a última posição do `gps.js`. Sem posição ainda: desabilitado com "aguardando o GPS". Com precisão pior que 30 m: grava assim mesmo, com o aviso "precisão de N m".
- Formulário em `<dialog id="marcar-ponto">`: nome (obrigatório, até 60 caracteres), tipo (`<select>` com os tipos do contrato de `pontos.geojson`; padrão `mirante`), nota (até 280).
- Grava no IndexedDB, store `marcados` (7.7), como Feature Point: `{ id: 'marcado-<ms>', nome, tipo, nota, origem, precisao_m, alt_m, criado_em, aproximado, fonte: 'marcado no aparelho' }`, com `aproximado = origem == 'toque' || precisao_m == null || precisao_m > 30`. Emite `itaitu:ponto-marcado`.
- No mapa: fonte `marcados`, camada `pontos-marcados` (seção 5). Lista "Meus pontos" no painel Gravar, com "Exportar GeoJSON", "Exportar GPX" e apagar.
- O ponto marcado nunca vira ponto oficial sozinho e nunca recebe hora de sol (não passa pelo enriquecimento da 6.1). O caminho oficial é o "Estou aqui: confirmar posição" do `marcos.html` (C) e o pacote (7.5).

---

## 3. Relógio

- Fuso fixo `America/Bahia` = UTC−3, sem horário de verão. Constante `FUSO_MIN = -180` em `nucleo.js` (vem também em `recorte.json`, campo `fuso_min`).
- `Itaitu.agora()` devolve `Date`. Com `?agora=AAAA-MM-DDTHH:MM`, o relógio parte desse instante (hora local da Bahia) e **anda em tempo real** a partir dele. Data oficial de teste: `?agora=2026-11-20T13:00`.
- Minutos do dia: inteiro `0..1439`, sempre hora local. Data: texto `'AAAA-MM-DD'` local.
- Funções únicas (em `nucleo.js`, todos importam daqui; ninguém reimplementa):
  - `minutoDoDia(utcMs, fusoMin = -180) -> int`
  - `dataLocal(utcMs, fusoMin = -180) -> 'AAAA-MM-DD'`
  - `utcDe(data, minuto, fusoMin = -180) -> utcMs`
  - `somarDias(data, n) -> 'AAAA-MM-DD'`
  - `hhmm(minuto) -> 'HH:MM'` (24 h, dois dígitos)

---

## 4. API do motor (shader)

### 4.1 `js/motor/nucleo.js` (puro: sem DOM, sem fetch; importável em Node 22 e no worker)

```js
export const FUSO_MIN = -180;
export function decodificarTerrarium(rgba /*Uint8ClampedArray 256*256*4*/) -> Float32Array // (R*256 + G + B/256) - 32768
export function gradeDeTiles(z, tiles /*[{x, y, rgba}]*/) -> Grade
// Grade = { w, h, z, x0, y0, dados: Float32Array(w*h) }  linhas de cima p/ baixo, metros
export function lonLatParaPixel(grade, lon, lat) -> [px, py]
export function pixelParaLonLat(grade, px, py) -> [lon, lat]
export function amostrar(grade, lon, lat) -> number | null           // bilinear; null fora da grade
export function cantosDaGrade(grade) -> [[lon,lat],[lon,lat],[lon,lat],[lon,lat]]  // NO, NE, SE, SO
export function posicaoDoSol(dateUtcMs, lat, lon) -> { elevacao, azimute }
//   NOAA (equação do tempo + declinação), elevação APARENTE com refração; azimute 0 = norte, horário
export function horizonte(grade, lon, lat, direcoes = 720) -> Float32Array(direcoes)  // graus, índice i = azimute i*360/direcoes
export function horasDeSol(grade, ponto /*{lon, lat, sol_ajuste_min?}*/, data /*'AAAA-MM-DD'*/) -> Horas
export function nascerEPor(data, lat, lon) -> { nascerMin, porMin, escureceMin }
export function arredondar5(min, modo /*'baixo'|'perto'|'cima'*/) -> int
// + funções de relógio da seção 3
```

`Horas`:
```js
{
  nascerMin, porMin,          // horizonte livre (limbo superior em 0°)
  escureceMin,                // fim do crepúsculo civil: elevação geométrica < -6°
  nascePocoMin: int | null,   // início do primeiro intervalo de sol direto
  apagaBrutoMin: int | null,  // fim do último intervalo de sol direto que termina depois de 12:00, só relevo
  apagaMin: int | null,       // apagaBrutoMin + (sol_ajuste_min ?? 0)
  ajusteMin: int,             // 0 se o ponto não tem sol_ajuste_min
  intervalos: [[iniMin, fimMin], ...],  // sol direto no ponto, ordem crescente
  altitudeM: number
}
```

Modelo fixo (é o do protótipo `hora_da_serra.py`, que deu Véu 16:07 e Arapongas 15:40 em 20/11/2026; reproduzido com a grade 3x3 do recorte):
- olho a 1,7 m do chão; passo de 15 m até 3 km e de 30 m depois, até a borda da grade; curvatura da Terra com refração `d²/(2R)·(1−0,13)`, R = 6.371.000 m;
- "sol no ponto" = elevação aparente + 0,267° (limbo superior) > horizonte no índice `round(azimute*2) % 720`;
- varredura de 04:30 a 19:30, de 1 em 1 min;
- grade = os tiles z12 de `recorte.dem` (hoje x 1586–1588, y 2176–2178, 768x768 px, ~37 m/px).

### 4.2 `sombra.js` e `relevo-cartao.js` (puros, usados pelo worker)

```js
mascaraDeSombra(grade, sol /*{elevacao, azimute}*/, escala = 1, cor = [27, 42, 74, 140])
  -> { largura, altura, rgba: Uint8ClampedArray }   // varredura de linhas na direção do sol; noite = tudo coberto
relevoDoCartao(gradeDetalhe, gradeSombra, trilha /*[[lon,lat],...]*/, sol, largura, altura)
  -> { rgba, tracadoPx: [[x,y],...], bbox: [oeste, sul, leste, norte] }
```
O sol da sombra do mapa é calculado no `recorte.centro`. O relevo do cartão usa tiles z14 no bbox da trilha com 30% de margem (mínimo 1,5 km de largura), sombreado pelo sol do minuto e com a sombra projetada da grade z12. Nada é copiado da tela WebGL.

### 4.3 `worker.js` + `cliente.js`

```js
// cliente.js
export async function abrirMotor({ urlBase, recorte, corSombra }) -> Motor
// urlBase = new URL('./', document.baseURI).href  (o worker resolve URLs relativas à pasta dele; por isso absoluta)
Motor = {
  horas({ pontos: [{ id, lon, lat, sol_ajuste_min? }], data })
    -> Promise<{ data, pontos: { [id]: Horas } }>
  sombra({ minuto, data, escala = 1 })
    -> Promise<{ minuto, bitmap: ImageBitmap, cantos }>
  dia({ data, deMin, ateMin, passoMin, escala = 0.5 })      // pré-calcula os quadros do dia
    -> Promise<{ cantos, quadros: [{ minuto, bitmap }] }>
  relevoCartao({ trilha, minuto, data, largura, altura })
    -> Promise<{ imagem: ImageData, tracadoPx, bbox }>
  altitudes({ coordenadas: [[lon, lat], ...] })             // amostrar() na grade z12; para perfil.js e o toque longo
    -> Promise<{ alt: (number | null)[] }>                  // null fora da grade
  encerrar(): void
}
```
- Criação: `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`.
- Mensagens: página → worker `{ id, tipo: 'init'|'horas'|'sombra'|'dia'|'relevoCartao'|'altitudes', ...args }`; worker → página `{ id, ok: true, resultado }` ou `{ id, ok: false, erro: 'texto' }`. Bitmaps e buffers vão como transferíveis.
- `init` busca os PNG com `fetch` (o SW responde do cache), decodifica com `createImageBitmap` + `OffscreenCanvas`, monta a grade e guarda os horizontes por ponto. Sem `OffscreenCanvas` o motor rejeita `init`; o B mostra "horas de sol indisponíveis neste aparelho" e o mapa segue.
- Quem abre o motor é o `hora/index.js` (B), uma vez. Depois do `init` ele põe o objeto em `Itaitu.motor` e emite `itaitu:motor` `{ ok: true }`; se falhar, deixa `null` e emite `{ ok: false }`. O A nunca chama `abrirMotor`.
- Propriedade opcional `sol_ajuste_min` nos pontos (inteiro, −30 a +30, medido em campo): soma ao `apagaMin`. O app funciona sem ela.

---

## 5. Ids estáveis de fontes e camadas

Sem `glyphs` no estilo: **nenhum texto é desenhado pelo MapLibre** (offline não há PBF de fontes). Nomes no mapa são `maplibregl.Marker` de HTML.

URLs de tiles no estilo são absolutas montadas em execução, sem passar `{z}` por `new URL` (que codifica as chaves): `const base = new URL('./', location.href).href; base + 'tiles/dem/{z}/{x}/{y}.png'`.

Todas as fontes raster e raster-dem levam `bounds: recorte.bbox` e `maxzoom: 14`; sem isso o mapa pede tile fora do recorte e o console mostra 404.

Fontes:

| id | tipo | dono | nota |
|---|---|---|---|
| `dem` | raster-dem terrarium, tileSize 256, maxzoom 14 | A (estilo.js) | só o terreno 3D, exagero 1,4 |
| `dem-relevo` | raster-dem, mesmos tiles | A | hillshade e color-relief (o MapLibre 5.24 avisa no console se dividirem fonte com o terreno) |
| `sat` | raster, maxzoom 14 | A | Sentinel-2 2016 |
| `base` | geojson `dados/base.geojson` | A | |
| `pontos` | geojson, só features com geometria | A | |
| `trilhas` | geojson (arquivo + gravadas + GPX importado) | A | |
| `rota-gps` | geojson | A (rota.js) | |
| `gravacao` | geojson | A (gravador.js) | |
| `marcados` | geojson (store `marcados`) | A (marcar.js escreve, mapa.js atualiza) | |
| `sombra-serra` | canvas, `animate: false` | B (sombra-canvas.js) | cantos de `cantosDaGrade` |

Camadas, de baixo para cima. Toda camada da fonte `base` filtra por `camada` **e** por tipo de geometria; nenhuma camada desenha geometria que não é sua:

```js
const POLI  = ['in', ['geometry-type'], ['literal', ['Polygon', 'MultiPolygon']]];
const LINHA = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
const de = (c, g) => ['all', ['==', ['get', 'camada'], c], g];
```

| ordem | id | tipo | fonte e filtro | dono |
|---|---|---|---|---|
| 1 | `satelite` | raster | `sat`, `visibility: none` por padrão | A |
| 2 | `relevo-cor` | color-relief | `dem-relevo` | A |
| 3 | `relevo-sombra` | hillshade | `dem-relevo`, `hillshade-method: 'basic'`, `hillshade-illumination-anchor: 'map'` | A cria, luz.js muda direção e altitude |
| 4 | `sombra-serra-camada` | raster | `sombra-serra`, `beforeId: 'camada-vetorial-base'` | B |
| 5 | `camada-vetorial-base` | fill | âncora: `['==', ['get', 'camada'], '__ancora__']`, opacidade 0 | A |
| 6 | `area` | fill | `base`, `de('area', POLI)` (28 hoje: quadra, pedreira, praça, residencial...) | A |
| 7 | `parque` | fill | `base`, `de('parque', POLI)` (1: Sete Passagens) | A |
| 8 | `parque-contorno` | line | `base`, `de('parque', POLI)` (a linha desenha a borda do polígono) | A |
| 9 | `rios-agua` | fill | `base`, `de('rios', POLI)` (8 hoje, `tipo: 'agua'`) | A |
| 10 | `rios` | line | `base`, `de('rios', LINHA)` (79 hoje) | A |
| 11 | `ruas` | line | `base`, `de('ruas', LINHA)` (400), largura por `classe` | A |
| 12 | `predios` | fill | `base`, `de('predios', POLI)` (94) | A |
| 13 | `trilhas-linhas` | line | `trilhas`, tracejado se `aproximado` | A |
| 14 | `rota-gps`, `gravacao` | line | fontes de mesmo nome | A |
| 15 | `pontos-marcados` | circle | `marcados`, contorno tracejado se `aproximado` | A |
| 16 | `pontos-aproximados` | circle | `pontos`, `_estado == 'aproximada'`, contorno tracejado no marcador HTML | A |
| 17 | `pontos-confirmados` | circle | `pontos`, `_estado == 'confirmada'` | A |

**Nomes de lugar.** Os 45 Points de `base` com `camada: 'area'` e `tipo: 'lugar'` (localidades com `nome`) não têm camada: o `mapa.js` (A) cria um `maplibregl.Marker` de HTML para cada um, `<span class="rotulo-lugar">` com `textContent = nome`, visível só com zoom ≥ 12,5 (liga e desliga no evento `zoom`, sem recriar). O designer estiliza `.rotulo-lugar` em `app.css` por meio do A. Os nomes dos pontos de `pontos` também são marcadores HTML do `mapa.js` (`.rotulo-ponto[data-estado]`); as etiquetas de hora são do B (`.etiqueta-hora`, `sombra-canvas.js`).

Conta com a `base.geojson` de hoje (655 features): `area` 28 polígonos + 45 lugares; `parque` 1; `rios` 8 + 79; `ruas` 400; `predios` 94. Tudo tem dono. Feature com `camada` fora dessa lista é ignorada pelo estilo, e o `dados.js` avisa uma vez com `console.info`.

Botão Satélite (A): `satelite` visível, `relevo-cor` oculta, `hillshade-exaggeration` 0,15. A `sombra-serra-camada` continua nos dois modos.
Atualizar a CanvasSource sem animação: desenhar no canvas e chamar `fonte.play(); fonte.pause();` (o `pause` do 5.24 sobe a textura). Durante o dia correndo, `play()` no início e `pause()` no fim.

---

## 6. Regras de negócio exatas (os dados decidem, nunca lista fixa)

### 6.1 Enriquecimento feito por `dados.js` (A) ao carregar, em cada ponto

| propriedade | regra |
|---|---|
| `_estado` | `geometry == null` → `'sem-coordenada'`; senão `confianca ∈ {alta, media}` e `aproximado !== true` → `'confirmada'`; senão → `'aproximada'` |
| `_carro_min` | `tempoMaisLentoMin(carro_tempo)` (`util.js`), ou `null` |
| `_trilha_min` | `tempoMaisLentoMin(trilha_tempo)` (`util.js`), ou `null` |
| `_hora_de_sol` | `_estado == 'confirmada'` e `tipo ∈ {cachoeira, poco}` |
| `_ordem` | `grupo == 'placa'` primeiro, na ordem do arquivo; depois os outros por estado (confirmada, aproximada, sem-coordenada) e nome |

Tempo mais lento de um texto da placa, `tempoMaisLentoMin(texto)`. Lista fechada de formatos; o que não se encaixa devolve `null`, **nunca um número chutado** (chutar para menos adia o "saia até", o que é inseguro):
1. Normaliza: `null`/vazio → `null`; minúsculas; tira `≈`, `~` e "cerca de"; `–` e `—` viram `-`; espaços repetidos viram um.
2. Separa em até 2 partes pelo `-` (faixa). Mais de 2 partes → `null`.
3. Cada parte tem de casar inteira com uma destas formas (`h` aceita `h`, `hr`, `hora`, `horas`; `min` aceita `min`, `mins`, `minuto`, `minutos`):
   - `N h` → `N*60`;
   - `N h M`, `N h M min`, `NhM`, `NhMmin` → `N*60 + M` (com `M < 60`);
   - `N min` → `N`;
   - `N` sozinho, só na 1ª parte de uma faixa: herda a unidade da 2ª (`'25-30 min'` → 25 e 30; `'1-2 h'` → 60 e 120).
4. Resultado = o maior valor das partes, inteiro maior que 0. Qualquer outra coisa (`'meia hora'`, `'1,5 h'`, `'30'` sem unidade, `'2 km'`) → `null`.

| texto | resultado |
|---|---|
| `'12 min'`, `'≈ 30 min'`, `'≈ 60 min'` | 12, 30, 60 |
| `'25–30 min'`, `'35–45 min'` | 30, 45 |
| `'1 h'`, `'1h'` | 60 |
| `'1 h 30'`, `'1h30'`, `'1h30min'`, `'1 h 30 min'` | 90 |
| `'1-2 h'`, `'40 min–1 h'`, `'1h–1h30'` | 120, 60, 90 |
| `'meia hora'`, `'1,5 h'`, `'30'`, `''`, `null` | `null` |

Com `_trilha_min` ou `_carro_min` `null`, o ponto confirmado cai na situação `'sem-tempo'` (6.2): mostra apaga e escurece, nunca "saia até".

Com os dados de hoje isso dá (o conceito citado é o da seção 12), na placa: **confirmadas** Véu da Noiva (alta), Arapongas (media) e Coxinho (media); **aproximada** Flores; **sem coordenada** Sossego, Geladeira e Piancó. Fora da placa: Cachoeira do Urubu também sai confirmada (tem hora de sol, mas sem tempo de placa); Santuário, Índios, Andorinhas, Riachinho e Sonhos sem coordenada. Quando o time de dados reescrever o arquivo, a contagem muda sozinha.

No `marcos.html`, e só nele, `dados.js` sobrepõe os pontos de `pontos-local` (IndexedDB) antes de enriquecer.

### 6.2 Horas exibidas (`hora/regras.js`, puro, importável em Node)

Toda **estimativa** exibida (apaga, nasce, escurece, saia até, volte com luz, saindo agora, régua, etiquetas) é múltiplo de 5. Os brutos (16:07, 15:40) só existem no motor e nos testes.

**Fato** gravado aparece exato, em `hhmm`, sem arredondar: a chegada ao poço, o início e o fim de uma gravação e a hora do relógio quando ela é mostrada como "agora". A regra dos múltiplos de 5 não vale para fato.

| nome | conta | arredonda |
|---|---|---|
| `apaga` ("sol no poço até") | `apagaMin` | baixo |
| `nasce` ("sol chega ao poço") | `nascePocoMin` | **cima** |
| `escurece` | `escureceMin` | baixo |
| `saiaAte` | `apaga − 60 − _carro_min − _trilha_min` | baixo |
| `volteComLuzAte` | `escurece − _trilha_min − 30` | baixo |
| sol no cartão | `minutosDeSolNoPoco(apaga exibido, chegada exata)` | não arredonda (o `apaga` já veio arredondado para baixo) |

Contas usam os valores **já exibidos**. Exemplo Véu em 20/11/2026: apaga 16:07 → 16:05; saia até 16:05 − 60 − 3 − 30 = 14:32 → **14:30**; escurece 18:11 → 18:10; volte com luz até 18:10 − 30 − 30 = **17:10**. Arapongas: apaga 15:40; saia até 15:40 − 60 − 12 − 30 = 13:58 → **13:55**.

```js
export function horasExibidas(horas, props, agoraMin) -> {
  apaga, nasce, escurece, saiaAte, volteComLuzAte,     // int | null
  saindoAgoraMin,                                      // int | null: sol no poço se sair agora (baixo)
  situacao: 'planejar' | 'saia-agora' | 'sol-foi' | 'sem-sol' | 'sem-tempo'
}
export function deveMostrarAmanha(horasPorId, agoraMin) -> boolean
export function minutosDeSolNoPoco(apagaExibido, chegadaMin) -> int   // max(0, apagaExibido − chegadaMin)
export function incertezaMin(props) -> 10 | 15                        // 10 se confianca == 'alta'; 15 nos outros
export function valorDaRegua(minuto, nascerMin, escureceMin) -> int    // arredondar5(minuto,'baixo') preso entre min e max da régua (6.4)
```
- `chegadaMin` é `minutoDoDia(chegadaMs)`, o minuto exato do GPS (15:52 fica 15:52). `minutosDeSolNoPoco` usa essa chegada exata menos o `apaga` **exibido**: chegada 15:52 com apaga exibido 16:05 dá 13 min. Assim o número do cartão bate com as duas horas escritas nele.
- `planejar`: `agoraMin ≤ saiaAte`.
- `saia-agora`: passou do `saiaAte`, mas `agora + carro + trilha < apaga`; mostra "saindo agora: N min de sol no poço".
- `sol-foi`: o sol do poço já foi hoje; mostra o `saiaAte` de amanhã.
- `sem-sol`: `apagaMin == null` (sem sol direto no dia).
- `sem-tempo`: confirmado, mas sem `_carro_min` ou `_trilha_min` (ex.: Urubu); mostra só apaga e escurece, com "tempo de trilha fora da placa: combine com um guia".
- `deveMostrarAmanha`: seja `P` a lista dos pontos com `_hora_de_sol` e `apaga != null`. Devolve `P.length > 0 && P.every(p => agoraMin > apaga(p))`. **Lista vazia dá falso** (zero pontos com hora, ou todos `sem-sol`): o app mostra hoje, nunca "amanhã" para sempre. Verdadeiro: tudo é calculado para `somarDias(hoje, 1)` com o rótulo "amanhã".
- O tempo de carro é o da placa, a partir do Village, para qualquer marca; a tábua diz "de carro a partir do Village (placa)".

### 6.3 Honestidade na tela (obrigatório, não é rodapé)

- Toda hora de sol (apaga, nasce, saia até, saindo agora, etiqueta e cartão) vem com `calculado pelo relevo, ±{min} min`, onde `min = incertezaMin(ponto)`: **±10 min para confiança `alta` e ±15 min para `media`**. Motivo, medido no protótipo em 20/11/2026: deslocar o ponto 50 m muda o apaga do Véu (alta) entre −6 e +6 min e o das Arapongas (media) entre −6 e +11 min; com 111 m, o Véu vai de −15 a +12 e as Arapongas de −12 a +13. A coordenada `media` pode estar errada nessa escala, e o arredondamento para baixo não cobre o erro quando a hora real é mais cedo. Ponto confirmado em campo pelo pacote (7.5) entra como `alta`.
- `escurece` e `volte com luz até` não dependem do relevo (crepúsculo civil) e não levam a nota de ±.
- Junto das horas: "Em dia nublado, o 'escurece às …' continua valendo; a hora de sol é para sol direto."
- `aproximada`: tábua com contorno tracejado, "posição aproximada", **sem hora de sol**.
- `sem-coordenada`: tábua sem hora, "posição não confirmada: vá com guia" e o botão "Chamar um guia".
- Sem traçado: nada de linha confiante; a rota em linha reta diz "direção em linha reta, não é o caminho".
- Sombra no mapa sempre acompanhada da palavra (anúncio em `#hora-live` e na régua: "16:05, a sombra da serra cobre o Véu da Noiva").
- "Chamar um guia": primeiro parceiro da marca com `tipo: 'guia'`; senão `info.guias.link`.

### 6.4 Marcação HTML compartilhada (designer estiliza, B gera)

```html
<ul class="tabuas">
  <li class="tabua" data-estado="confirmada|aproximada|sem-coordenada" data-ponto="cachoeira-veu-da-noiva" data-amanha="0|1">
    <button class="tabua__titulo" type="button">Cachoeira Véu da Noiva</button>
    <p class="tabua__placa">3 min de carro · 2 km de trilha · ≈ 30 min · Fácil</p>
    <dl class="tabua__horas">
      <div class="tabua__hora"><dt>sol no poço até</dt><dd class="tabua__num">16:05</dd></div>
      <div class="tabua__hora"><dt>saia até</dt><dd class="tabua__num">14:30</dd></div>
      <div class="tabua__hora"><dt>volte com luz até</dt><dd class="tabua__num">17:10</dd></div>
    </dl>
    <p class="tabua__nota">calculado pelo relevo, ±10 min</p>   <!-- ±15 quando a confiança é media (6.3) -->
    <p class="tabua__aviso">posição aproximada</p>
    <a class="tabua__guia" href="…">Chamar um guia</a>
    <span class="tabua__selo">amanhã</span>
    <span class="tabua__fincada">fincada pela ACAGI</span>
  </li>
</ul>
<div class="faixa-saia"><span class="faixa-saia__rotulo">saia até</span><span class="faixa-saia__num">14:30</span><span class="faixa-saia__destino">para 1 hora de sol no Véu da Noiva</span></div>
<div class="regua" role="group" aria-label="Régua do dia">
  <input class="regua__controle" type="range" min="310" max="1090" step="5" value="955" aria-valuetext="15:55, sol no Véu da Noiva">
  <div class="regua__trilho" aria-hidden="true">
    <span class="regua__janela" style="--ini:20%;--fim:70%"></span>
    <span class="regua__marca" data-ponto="…" data-luz="sol|sombra" style="--pos:64%"></span>
    <span class="regua__sol" style="--pos:55%"></span>
  </div>
  <output class="regua__hora">15:55</output>
</div>
<div class="etiqueta-hora" data-luz="sol|sombra"><span class="etiqueta-hora__nome">Véu</span><span class="etiqueta-hora__num">16:05</span></div>
```
A régua é um `input range` nativo: teclado e leitor de tela vêm de graça.
- `min`, `max` e `value` são **minutos inteiros do dia**, nunca texto: `min = arredondar5(nascerMin, 'cima')`, `max = arredondar5(escureceMin, 'baixo')`, `step = 5`. No `input range` o `step` conta a partir do `min`; com o `min` bruto (nascer 05:07 = 307) a régua cairia em 05:12, 05:17... e quebraria a regra dos múltiplos de 5. Em 20/11/2026: `min="310"` (05:10) e `max="1090"` (18:10).
- `value` sempre por `valorDaRegua` (6.2); quando o relógio anda, a régua mostra a hora atual arredondada para baixo.
- `aria-valuetext` = `hhmm(value)` + ", " + a palavra da sombra do destino escolhido (ou do 1º confirmado): "16:05, a sombra da serra cobre o Véu da Noiva" ou "15:55, sol no Véu da Noiva". O `<output class="regua__hora">` mostra o mesmo `hhmm(value)`.

Variáveis de `tokens.css` que todo mundo usa (designer define os valores): `--madeira: #3A2618`, `--tinta: #FFF4DC` (13,1:1, conferido), `--sol`, `--sombra`, `--cor-parceiro` (o `marca.js` escreve), `--fonte: 'Atkinson Hyperlegible Next'`, `--num-min: 28px`, `--num-max: 40px`, `--alvo: 44px`. Atributos no `<html>`: `data-contraste="sol"` (preto e branco puros), `data-texto="grande"`, `data-economia="1"`. Números com `font-variant-numeric: tabular-nums`; se a fonte não tiver `tnum`, o designer registra e fixa a largura da caixa.

### 6.5 Textos (`js/textos.js`, copywriter)

```js
export const T = { /* chaves com ponto: 'hora.nota', 'tabua.sem_coordenada', ... */ };
export function t(chave, vars = {}, provisorio) -> string   // troca {var}; chave ausente: provisorio ?? chave, e console.info uma vez
```
Chaves mínimas: `app.nome`, `app.credito` ("feito pela Creat"), `hora.nota` ({min}), `hora.nublado`, `hora.amanha`, `hora.apaga` ("sol no poço até"), `hora.nasce`, `hora.saia_ate`, `hora.volte_com_luz`, `hora.escurece`, `hora.saindo_agora` ({min}), `hora.sol_foi`, `hora.sem_sol`, `hora.sem_tempo`, `hora.carro_da_placa`, `hora.indisponivel`, `hora.sombra_cobre` ({hora}, {nome}), `hora.faixa_destino` ({nome}), `hora.faltam_escurecer` ({min}), `tabua.aproximada`, `tabua.sem_coordenada`, `tabua.chamar_guia`, `tabua.fincada`, `cartao.frase` ({chegada}, {apaga}, {min}), `cartao.frase_sombra` ({chegada}, {apaga}: chegou depois da sombra), `cartao.frase_sem_hora` ({chegada}: destino sem hora de sol), `cartao.selo` ("Hora da Serra"), `cartao.compartilhar`, `cartao.baixar`, `rota.linha_reta`, `perfil.indisponivel`, `perfil.do_relevo`, `perfil.resumo` ({sobe}, {desce}, {min}, {max}), `mapa.toque_copiar`, `mapa.coord_centro`, `marcar.botao` ("Marcar ponto aqui"), `marcar.aguardando_gps`, `marcar.precisao` ({m}), `marcar.meus_pontos`, `gravar.aviso_tela` ("página web não grava com a tela bloqueada"), `cache.progresso` ({pct}), `cache.pronto`, `demo.sair`. Quem precisa de chave nova usa `t('x.y', vars, 'texto provisório')` e anota no RELATORIO; o copywriter fecha.

---

## 7. Esquemas JSON

### 7.0 `dados/recorte.json` (devops)
```json
{ "versao": 1, "nome": "Itaitu", "bbox": [-40.60, -11.42, -40.40, -11.26],
  "centro": [-40.4950, -11.3400], "zoom": 13, "pitch": 60, "bearing": 250,
  "fuso_min": -180, "tiles_z": [8, 14],
  "dem": { "z": 12, "x0": 1586, "x1": 1588, "y0": 2176, "y1": 2178 } }
```
Trocar de vale (Capão, Lençóis, Cipó, Veadeiros) = outro `recorte.json`, outros tiles e outros dados. Nenhum código muda.

### 7.1 Marca: `marcas/<slug>.json` (copywriter)
`?m=<slug>` com `slug` em `^[a-z0-9-]{1,40}$`; inválido ou ausente → `padrao.json`. Falhou o fetch → `padrao.json`, sem erro na tela.

| campo | tipo | regra |
|---|---|---|
| `versao` | 1 | |
| `slug` | string | igual ao nome do arquivo |
| `nome_app` | string | ex. "Trilhas de Itaitu" |
| `parceiro` | string | `""` na padrão |
| `cor` | `#RRGGBB` | validada; inválida → cor da padrão |
| `logo` | string | `""` ou caminho relativo em `./arte/parceiros/`; só com autorização |
| `ponto_base_id` | string | id de `pontos.geojson`; inexistente → `vila-de-itaitu` |
| `whatsapp` | string | `""` ou `https://wa.me/<dígitos>` |
| `instagram` | string | `""` ou `https://www.instagram.com/<perfil>/` |
| `boas_vindas` | string | texto puro (sempre `textContent`) |
| `parceiros[]` | `{ nome, tipo: 'guia'\|'onde-comer'\|'hospedagem'\|'outro', link (https), ponto_id? }` | |
| `_pendente` | objeto | campo → `"preencher quando o parceiro autorizar"` |

```json
{ "versao": 1, "slug": "demo-village", "nome_app": "Trilhas de Itaitu",
  "parceiro": "Village Serra do Cruzeiro", "cor": "#C8742B", "logo": "",
  "ponto_base_id": "village-serra-do-cruzeiro", "whatsapp": "", "instagram": "",
  "boas_vindas": "…",
  "parceiros": [ { "nome": "ACAGI", "tipo": "guia", "link": "https://www.instagram.com/guiasdeitaitu/" } ],
  "_pendente": { "logo": "preencher quando o parceiro autorizar", "whatsapp": "preencher quando o parceiro autorizar" } }
```
Valor vazio = ausente: o botão correspondente não aparece.

### 7.2 `marcas/indice.json`
```json
{ "versao": 1, "marcas": [ { "slug": "padrao", "nome": "Trilhas de Itaitu", "arquivo": "padrao.json" },
                           { "slug": "demo-village", "nome": "Village (demonstração)", "arquivo": "demo-village.json" } ] }
```

### 7.3 `dados/info.json` (copywriter; campos mínimos que o app lê, pode acrescentar, nunca renomear)
```json
{ "versao": 1, "atualizado_em": "2026-11-20",
  "emergencia": [ { "nome": "SAMU", "numero": "192" }, { "nome": "Bombeiros", "numero": "193" }, { "nome": "Polícia", "numero": "190" } ],
  "avisos": [ { "chave": "cabeca-dagua", "texto": "…", "fonte": "…", "data": "AAAA-MM-DD" } ],
  "guias": { "nome": "ACAGI", "link": "https://…", "instagram": "https://www.instagram.com/guiasdeitaitu/", "fonte": "…", "data": "…" },
  "melhor_epoca": { "texto": "abril a outubro", "fonte": "…", "data": "…" } }
```

### 7.4 `dados/base.geojson` e `dados/atribuicoes.json` (devops)
- base (já gerado, 655 features): `properties.camada ∈ {'ruas', 'rios', 'predios', 'parque', 'area'}`, mais `classe`, `nome`, `tipo`, `lugar`, `piso`, `protecao`, `tracktype` quando houver. As camadas e os filtros por `camada` e por tipo de geometria estão na seção 5, que cobre as 655 features (inclusive os 45 Points `tipo: 'lugar'` de `area`, desenhados como marcador HTML).
- atribuições (já gerado): `[{ "nome", "texto", "licenca", "url" }]`, com os textos exatos do briefing. O A monta o controle de atribuição a partir de `texto`.

### 7.5 Pacote de atualização v1 (`marcos.html` exporta; `scripts/aplicar-pacote.mjs` valida e funde)
Arquivo `itaitu-pacote-AAAA-MM-DD.json`:
```json
{ "formato": "itaitu-pacote", "versao": 1, "gerado_em": "2026-11-20T17:40:00-03:00",
  "pontos": [ { "id": "cachoeira-do-sossego", "acao": "confirmar"|"novo", "nome": "…", "tipo": "cachoeira",
                "gps_media": [-40.5, -11.37], "alt_m": 590, "precisao_m": 6.5, "n_amostras": 20,
                "data": "2026-11-20", "nota": "…", "sol_ajuste_min": 0 } ],
  "trilhas": [ { "id": "pe-sossego-2026-11-20", "destino_id": "cachoeira-do-sossego", "nome": "…", "modo": "pe",
                 "fincada_por": "ACAGI", "data": "2026-11-20", "km": 1.48, "desnivel_m": 61, "duracao_s": 2280,
                 "coordenadas": [[-40.5, -11.37, 560], "…"],
                 "passagens": [ { "lon": -40.5, "lat": -11.37, "nota": "porteira" } ],
                 "perfil": [[0, 560], [25, 562], "…"] } ],
  "gpx": "<?xml version=\"1.0\"?><gpx version=\"1.1\" …>…</gpx>" }
```
`perfil` é `Perfil.pontos` de `perfilDeCoordenadas` (2.2): `[distância_m, altitude_m]` inteiros a cada 25 m, começando em 0; `desnivel_m` é o `subida_m` do mesmo perfil.

Regras do script: rejeita `formato`/`versao` errados, coordenada fora do `recorte.bbox`, `precisao_m > 30`, `n_amostras < 10`; ponto confirmado entra com `confianca: 'alta'`, `aproximado: false`, `fonte: 'GPS no local, AAAA-MM-DD'` (sem nome de pessoa); `sol_ajuste_min` e `fincada_por` só são copiados se presentes; relatório do que mudou no terminal. Nunca roda sozinho: o time de dados decide quando.

### 7.6 Kit de venda v1 (só o formato; o conteúdo nunca entra no repositório)
```json
{ "formato": "itaitu-kit", "versao": 1, "gerado_em": "…",
  "roteiro": [ { "titulo": "…", "texto": "…" } ],
  "objecoes": [ { "pergunta": "…", "resposta": "…" } ],
  "precos": [ { "plano": "…", "valor_centavos": 0, "periodo": "mensal"|"unico", "inclui": ["…"] } ],
  "notas": "…" }
```

### 7.7 IndexedDB: um banco `itaitu`, versão 1, aberto só por `banco.js` (A)

| store | keyPath | conteúdo |
|---|---|---|
| `trilhas` | `id` | `{ id, nome, destino_id, criada_em, fim_em, pontos: [{lon,lat,alt,precisao,t}], passagens, km, desnivel_m, duracao_s, origem: 'gravada'\|'gpx', oficial }`; índice `criada_em` |
| `marcas-local` | `slug` | marca editada no app particular |
| `pontos-local` | `id` | Feature GeoJSON confirmada em campo (só o `marcos.html` escreve) |
| `marcados` | `id` | Feature Point do "Marcar ponto aqui" (2.2), nos dois apps; nunca vira ponto oficial sozinha |
| `caderno` | `id` | `{ id, negocio, status: 'visitar'\|'visitado'\|'interessado'\|'proposta'\|'fechado', nota, proximo_passo, data }` |
| `kit` | `chave` | `{ chave: 'atual', kit }` |
| `config` | `chave` | `{ chave: 'pin', sal, hash }` (PBKDF2-SHA-256 via `crypto.subtle`, 100.000 iterações; proteção de uso, não cofre) e outras preferências |

`localStorage` só para preferências pequenas, sempre com prefixo: `itaitu:abertura` (ms da última abertura), `itaitu:economia`, `itaitu:contraste`, `itaitu:texto`.

---

## 8. Protocolo do service worker (devops, já implementado em `sw.js`)

O cabeçalho de `site/itaitu/sw.js` é a fonte de verdade; aqui está o que os outros módulos usam.

`precache.json` (gerado por `scripts/gerar-precache.mjs`; URLs relativas à pasta, sem `./`):
```json
{ "versao": "9a0af159a178", "gerado_em": "2026-11-20T16:11:19.018Z", "bytes_total": 14253215,
  "casco": ["index.html", "marcos.html", "css/…", "js/…", "vendor/…", "marcas/…", "manifest.webmanifest", "icones/…"],
  "arquivos": [ { "url": "tiles/dem/12/1586/2176.png", "bytes": 81234, "hash": "425fdae5260d420f" } ] }
```
`versao` é derivada do conteúdo; `arquivos` traz tudo, inclusive o casco; `hash` = 16 hex do SHA-256. O script **roda de novo no fim**, quando todos os arquivos do app existirem.

- Caches: `itaitu-v<versao>` (um por versão) e `itaitu-meta` (ponteiro da versão atual e estado).
- `install` guarda só o casco; se a versão anterior estava `pronto`, monta a nova completa (copia pelo `hash`, baixa só o que mudou). `activate` aponta o ponteiro e apaga os outros `itaitu-v*`. Usa `skipWaiting` e `clients.claim`.
- Página → SW (`navigator.serviceWorker.controller.postMessage`; na primeira visita, `(await navigator.serviceWorker.ready).active`): `{tipo:'precachear'}`, `{tipo:'estado'}`, `{tipo:'atualizar'}`.
- SW → páginas, só por `BroadcastChannel('itaitu-cache')`: `{tipo:'progresso', feito, total, bytes}`, `{tipo:'pronto', versao, bytes, quando}`, `{tipo:'erro', url}`, `{tipo:'estado', versao, pronto, bytes, quando, nova_versao?}`.
- `precachear` é retomável (pula o que já está no cache), um por vez, segue depois de erro.
- `atualizar` monta a versão nova inteira e só então troca e apaga a antiga. Nunca quebra o offline.
- `fetch` (só GET da mesma origem, query ignorada no cache, por isso `?m=`, `?demo=1` e `?agora=` funcionam offline): cache primeiro para tiles, vendor, fontes, js, css, ícones e imagens; rede primeiro (2,5 s, cai para o cache) para `dados/*.geojson`, `dados/info.json`, `marcas/*.json` e `precache.json`; navegação cai em `index.html` (ou `marcos.html` para `/marcos*`); tile ausente = 404 limpo.
- `dados/recorte.json` (seção 7.0) fica no cache primeiro com o `sw.js` atual (o padrão de rede primeiro só pega `dados/*.geojson` e `dados/info.json`). Está certo assim: o recorte só muda com versão nova. O devops cria o arquivo e roda o `gerar-precache.mjs` de novo para incluí-lo.
- `armazenamento.js` (A): registra `./sw.js`, manda `precachear` na primeira visita com sinal, pede `navigator.storage.persist()`, mostra "Guardando o mapa no celular: N%" até "Pronto para usar sem internet", tamanho, data e o botão "atualizar mapa" quando `estado` traz `nova_versao`.

Consequência: com o cache primeiro em JS e CSS, código novo só chega por "atualizar" ou nova versão do SW. Em desenvolvimento, use `?sw=0`.

---

## 9. Os 5 primeiros segundos e o demo

### 9.1 `abertura.js` (motion-3d)
```js
export function tocarAbertura({
  minutoAgora, minutoFim,                  // fim = escurece exibido
  etiquetas: [{ pontoId, minuto }],        // apaga de cada ponto com hora de sol
  setMinuto(m), acenderEtiqueta(pontoId, minuto), mostrarFaixa(),
  arrastarSolDemo(deMin, paraMin, marcadorId) /* -> Promise */, tocarSom /* (nome) => void */
}) -> Promise<{ concluida: boolean, interrompida: boolean, pulada: boolean }>
```
Quem chama: `hora/index.js`, depois do primeiro `horas` e do `dia` pré-calculado. Linha do tempo:

| tempo | o que acontece |
|---|---|
| 0,0–0,5 s | mapa parado na luz do minuto, marca no topo, régua com o sol na hora atual |
| 0,5–3,0 s | `setMinuto` corre de agora até `minutoFim`; cada etiqueta acende quando a sombra passa; câmera quase parada |
| 3,0–3,3 s | volta para agora; etiquetas ficam |
| 3,0–4,0 s | `mostrarFaixa()` |
| 4,0–5,0 s | `arrastarSolDemo(agoraExibido, min(alvo.apaga + 10, minutoFim), alvo.id)`: marcador vai de `data-luz="sol"` a `"sombra"`; `tocarSom('araponga')` só se o áudio já foi liberado por um toque |

- `alvo` = o primeiro ponto, na ordem `_ordem` (6.1), com `_hora_de_sol`, `apaga != null` e **`apaga > agoraExibido`** (ainda tem sol). Nunca "o 1º confirmado" às cegas: se ele já perdeu o sol e outro ainda tem, o arraste andaria para trás. Sem alvo, o passo 4,0–5,0 s não acontece e a abertura termina em 4 s com `concluida: true`.
- `agoraExibido = valorDaRegua(agoraMin, ...)` (6.2). `etiquetas` traz todos os pontos com `apaga != null`; as que têm `minuto ≤ agoraExibido` já começam acesas em `data-luz="sombra"`.
- Qualquer `pointerdown` ou `keydown` interrompe: volta a agora, acende todas as etiquetas, mostra a faixa.
- Uma vez por abertura e não repete antes de 30 min (`localStorage 'itaitu:abertura'`).
- Pulada (`pulada: true`, tudo aparece parado) em `reduzMovimento()`, `economia()` ou quando `deveMostrarAmanha` é verdadeiro.
- Os 20 primeiros quadros do dia correndo são medidos pelo B; média acima de 33,3 ms → interrompe e fica no modo parado.

### 9.2 `voos.js` (motion-3d)
```js
export function voarPara(alvo /* pontoId | [lon,lat] */, opcoes = { zoom: 15, pitch: 62, bearing, duracaoMs: 2400 }) -> Promise
export function voarPresentacao(ids = /* 2 primeiros confirmados da placa */) -> Promise
export function seguirTrilhaSimulada(coords, { duracaoMs: 15000, aoPasso(i, frac) }) -> Promise
```
Com `reduzMovimento()` todos viram `jumpTo` e resolvem na hora.

### 9.3 `luz.js` (motion-3d)
`export function ligar(ctx)`: ouve `itaitu:hora`, calcula `posicaoDoSol` no `recorte.centro` e aplica em `relevo-sombra`: `hillshade-illumination-direction = azimute`, `hillshade-illumination-altitude = clamp(elevacao, 0, 90)`; céu e névoa (`setSky`) pela elevação do sol. Em economia não mexe no céu. Também `export function luzDoMinuto(utcMs) -> { direcao, altitude, sky }` para o `estilo.js` usar na abertura, se quiser.

### 9.4 `som.js` (som)
```js
export function liberar()              // no primeiro toque do usuário
export function tocar(nome /* 'araponga' */)
export function ambiencia(minutoDoDia) // cigarra de dia, grilo à noite, cruzamento suave
export function silenciar(sim)
```
Tudo sintetizado em código, `som.js` abaixo de 30 KB, mudo em economia e em movimento reduzido.

### 9.5 Demo `?demo=1` (`hora/demo.js`, 60 s)
`export function rodarDemo(ctx) -> Promise`

| fase | tempo | o que |
|---|---|---|
| 1 | 0–8 s | o resto do dia passa sobre o vale (mesmo motor da abertura) |
| 2 | 8–30 s | `voarPresentacao()` no Véu e nas Arapongas; tábua de cada um com a janela de sol |
| 3 | 30–45 s | `seguirTrilhaSimulada` na primeira trilha `modo: 'pe'` do primeiro confirmado (hoje `pe-veu-da-noiva-1`), relógio correndo; sem trilha `pe`, pula a fase |
| 4 | 45–60 s | cartão gerado com chegada = apaga exibido − 15 min (dá "15 min de sol") e a marca de `?m=` |

`#hora-demo-controle` tem "Sair da demonstração". A demo não grava nada no IndexedDB.

### 9.6 Cartão (`hora/cartao.js`)
```js
export async function gerarCartao({ trilhaId | trilha, destinoId, chegadaMs, marca }) -> Blob   // PNG 1080x1920
export async function compartilharCartao(blob, nomeArquivo)  // navigator.canShare({files}) ? share : download
```
Chegada = instante (`t`) do primeiro ponto gravado a até 60 m do destino; senão o fim da gravação. É fato: aparece exata (6.2). Frase, por exemplo (valores ilustrativos): "Cheguei 15:52 · a serra apaga o sol 16:05 · 13 min de sol no poço", com `min = minutosDeSolNoPoco(apaga exibido, chegada exata)`. Chegou depois do apaga: `cartao.frase_sombra`, sem "0 min". Destino sem hora de sol (aproximado, sem coordenada, `sem-sol` ou trilha sem destino): `cartao.frase_sem_hora`. Depois da frase: km, tempo, desnível, selo Hora da Serra (arco do nascer ao pôr com a janela de sol do poço e a marca da chegada), marca do parceiro e "feito pela Creat". Espera `document.fonts.load` da fonte antes de desenhar. Nome do arquivo: `trilhas-de-itaitu-<destino>-<AAAA-MM-DD>.png`.

---

## 10. Orçamentos e regras de qualidade

- Zero CDN, zero chamada a domínio externo em execução, zero dependência nova (sem npm, sem package.json, sem build).
- Todos os caminhos relativos (`./`); URL absoluta só montada em execução a partir de `location`.
- 390 px sem rolagem horizontal; alvos ≥ 44 px; texto ≥ 11 px; números das tábuas entre 28 e 40 px.
- 20 primeiros quadros do dia correndo > 30 fps no celular emulado; senão modo parado.
- Sombra recalculada só ao arrastar a régua (com `requestAnimationFrame`, um pedido por vez ao worker) ou a cada 5 min pelo relógio.
- Modo economia: 2D (`setTerrain(null)`, pitch 0), sombra a cada 15 min, sem dia correndo, sem som, sem céu. Horas continuam na tela.
- `prefers-reduced-motion`: sem dia correndo, voos viram saltos, sem som.
- Nada de `console.error` em fluxo normal (falha prevista = `console.info`).
- Conteúdo de JSON entra no DOM só por `textContent`; links só `https:`, `tel:`, `sms:` e os padrões de `wa.me` e Instagram.
- Gravação: Wake Lock (repedido no `visibilitychange`), fundo quase preto, trava contra toque no bolso (toque longo para soltar) e o aviso "página web não grava com a tela bloqueada".
- Orçamento de peso: `bytes_total` do `precache.json` ≤ 25 MB (hoje 14,25 MB com tiles e vendor); motor responde `horas` em < 300 ms e `sombra` (escala 1) em < 150 ms num Android intermediário emulado.
- Testes: `node --test 'projetos/itaitu-mapa/testes/*.test.mjs'` (backend; o padrão entre aspas: a pasta sozinha, `node --test projetos/itaitu-mapa/testes/`, falha no Node 22 com MODULE_NOT_FOUND). O teste lê os PNG de `site/itaitu/tiles/dem/12/` com decodificador PNG próprio (zlib nativo), importa `site/itaitu/js/motor/nucleo.js` e `js/hora/regras.js`, e confere: Véu `apagaBrutoMin` 967 ± 10 e Arapongas 940 ± 10 em 2026-11-20; exibidos 16:05 e 15:40; saia até 14:30 e 13:55. Coxinho e Urubu são calculados e registrados no RELATORIO, sem valor de referência. Casos obrigatórios a mais, no mesmo comando:
  - **Sensibilidade de posição:** para cada ponto confirmado com hora de sol, recalcula `apagaBrutoMin` com o ponto deslocado 50 m para norte, sul, leste e oeste (`dLat = 50/111320`, `dLon = dLat/cos(lat)`). Registra no RELATORIO a variação de cada direção e falha se alguma passar de `incertezaMin(ponto)` (6.3). Referência do protótipo em 20/11/2026 (N, S, L, O): Véu +6, −6, 0, −1; Arapongas +11, −6, +4, −4; Coxinho +2, −5, +1, 0; Urubu +2, 0, +11, −7.
  - `tempoMaisLentoMin` (`js/util.js`): todas as linhas da tabela da 6.1.
  - `deveMostrarAmanha`: lista vazia e lista só com `sem-sol` dão falso; todos com apaga passado dá verdadeiro.
  - `valorDaRegua` e os atributos da régua para 20/11/2026: `min` 310, `max` 1090, todo valor múltiplo de 5.
  - `minutosDeSolNoPoco(965, 952)` = 13; `minutosDeSolNoPoco(965, 970)` = 0.

---

## 11. Escopo cortado de propósito

Placa que tomba; letra pintada de licença incerta; bússola com portão de confiança como centro do app; pedra e ritual de GPS; Three.js; qualquer dependência nova; qualquer imagem paga (inclui CBERS-4A e satélite pago: ficam fora desta entrega; o satélite é o Sentinel-2 2016 da EOX, CC BY 4.0).

O rumo e a distância até o destino do briefing continuam no `gps.js`, como informação secundária, não como centro.

---

## 12. Conceito aprovado e critérios de aceite

Fonte: o conceito "Hora da Serra" aprovado pelo júri em 20/11/2026 e entregue ao diretor no texto da tarefa do fluxo da agência. Ele não existia em arquivo; o essencial fica aqui para quem confere.

**Conceito, em uma frase:** todo app de trilha responde ONDE; este responde QUANDO. O vale em 3D, iluminado pelo sol do minuto, com a sombra do paredão andando no mapa e a hora em que a serra tira o sol de cada poço, calculada pelo relevo, sem internet. O app se chama "Trilhas de Itaitu" na marca padrão; "Hora da Serra" é o recurso-assinatura e o selo do cartão. Enxerto da Placa Viva: destinos como tábuas da placa (seção 6.4), "a placa se completa" (trilha "fincada pela ACAGI", `sol_ajuste_min`) e placa física com QR.

**Critérios de aceite numerados** (texto do conceito, com o ajuste deste contrato entre colchetes; a coluna "como conferir" diz o comando ou o passo):

| nº | critério | como conferir |
|---|---|---|
| 1 | Horas do Véu (16:07 bruto) e das Arapongas (15:40) em 20/11/2026 batem com o teste em Node dentro de ±10 min e aparecem arredondadas para 5 min (16:05 e 15:40) com a nota [±10 min no Véu, `alta`; ±15 min nas Arapongas, `media`, seção 6.3] | `node --test 'projetos/itaitu-mapa/testes/*.test.mjs'` (seção 10, inclui a sensibilidade de 50 m); tábua com `?agora=2026-11-20T13:00` |
| 2 | Abre sem erro de console em 390 px, sem rolagem horizontal, alvos ≥ 44 px | `verificacao-visual` em `index.html` e `marcos.html` |
| 3 | Régua operável por teclado e leitor de tela; horas anunciadas em `aria-live`; sombra sempre com a palavra | setas na régua mudam de 5 em 5; `aria-valuetext` e `#hora-live` (6.3, 6.4) |
| 4 | Offline depois do pré-cache: com `setOffline(true)` e recarga, a sombra, as horas e o cartão funcionam | Playwright, briefing (b) |
| 5 | Os 20 primeiros quadros do dia correndo ficam acima de 30 fps no celular emulado; senão modo parado | medição do B (9.1) registrada no RELATORIO |
| 6 | [Toda tábua `sem-coordenada` (hoje 8: Sossego, Geladeira, Piancó, Santuário, Índios, Andorinhas, Riachinho, Sonhos)] não mostra hora de sol e mostra "vá com guia" e "Chamar um guia"; a `aproximada` (Flores) não mostra hora e mostra "posição aproximada" | contar `.tabua[data-estado="sem-coordenada"]` sem `.tabua__horas` |
| 7 | Cartão 1080x1920 gerado offline com a marca do parceiro vinda do JSON; [chegada exata e "N min" = chegada menos apaga exibido, 9.6] | `?m=demo-village&demo=1` offline; abrir o PNG |
| 8 | `?demo=1` percorre os 60 s sem erro | console limpo do início ao fim (9.5) |
| 9 | `prefers-reduced-motion` respeitado | emulação no Playwright: sem dia correndo, voos viram saltos, sem som |

Valem também as verificações (a) a (e) da seção "Verificação obrigatória" do `BRIEFING.md` e o padrão da skill `padrao-de-entrega`.

---

## Riscos técnicos (do mais grave ao menos grave)

1. **Precisão da hora.** DEM de ~30 m reamostrado em z12 (~37 m/px) e coordenada de confiança `media`. Medido no protótipo: 50 m de erro de posição já mudam o apaga das Arapongas em até +11 min; 111 m mudam o Véu de −15 a +12. Arredondar para baixo não cobre o erro quando a hora real é mais cedo. Defesa: nota de ±10 min só para `alta` e ±15 min para `media` (6.3), teste de sensibilidade de 50 m que falha se a nota mentir (10), `sol_ajuste_min` medido em campo com a ACAGI e confirmação de posição pelo pacote (que sobe o ponto para `alta`). Resta: erro de posição acima de ~100 m num ponto `media` ainda pode passar de 15 min; a venda fala em "hora calculada pelo relevo", nunca em hora garantida.
2. **iOS.** `OffscreenCanvas` no worker e Wake Lock exigem iOS 16.4+; Web Share com arquivo varia; o Safari pode despejar o armazenamento sem `persist()`. Defesa: falha mansa por recurso, download como alternativa.
3. **Desempenho no Android intermediário.** Terreno 3D + CanvasSource + hillshade. Defesa: portão de 30 fps, economia, quadros do dia em escala 0,5.
4. **Código velho no cache.** Cache primeiro em JS: um bug publicado fica até "atualizar". Defesa: `versao` no `precache.json` a cada publicação e conferência no ar.
5. **Tempo de carro da placa** vale a partir do Village; para marca com outra base o "saia até" erra alguns minutos. Dito na tela.
6. **Trilha do Véu diverge** (placa 2 km, OSM 0,76 km). As regras usam o tempo da placa (mais lento), não o km do traçado.

---

## Quem lê o quê

| quem | seções obrigatórias |
|---|---|
| shader (Prisma) | 3, 4 (com `altitudes`), 5 (`sombra-serra`), 10 |
| frontend A (Pixel) | 1, 2 (com 2.1 e 2.2), 3, 4.3 (`altitudes`), 5, 6.1, 6.3, 7.0, 7.1, 7.3, 7.4, 7.7, 8 (parte da página), 10 |
| frontend B (Pixel) | 2, 3, 4.3, 5, 6, 9, 10, 12 |
| frontend C (Pixel) | 2 (vitrine, 2.2 `perfil.js` e `marcar.js`), 6.1, 7.1, 7.2, 7.5, 7.6, 7.7, 10 |
| motion-3d (Órbita) | 2, 3, 4.1 (`posicaoDoSol`), 5 (`relevo-sombra`), 9.1–9.3, 10 |
| som (Eco) | 9.1, 9.4, 10 |
| designer (Paleta) | 1, 6.3, 6.4, 10 |
| copywriter (Verbo) | 6.3, 6.5, 7.1, 7.2, 7.3 |
| devops (Trilho) | 1, 5 (URLs), 7.0, 7.4, 8, 10 |
| backend (Forja) | 2.2 (`util.js`), 4.1, 6.1 (tempo), 6.2, 6.3 (incerteza), 7.5, 10 (testes), 12 |
| revisor, qa, segurança | tudo; os critérios numerados estão na seção 12; qa usa `?agora=2026-11-20T13:00`, `?sw=0`, `?demo=1` |

## Decisões que divergem do briefing ou do conceito (conceito: seção 12)

1. **Contagem de pontos.** O conceito dizia "só Véu e Arapongas têm coordenada; as outras 5 sem hora". Os dados novos (commit f851853) dão, na placa, 3 confirmadas (Véu, Arapongas, Coxinho), 1 aproximada (Flores) e 3 sem coordenada; fora da placa, Urubu confirmada e 5 sem coordenada. Vale a regra da seção 6.1, nunca a lista. O critério de aceite (6) da seção 12 passa a ser "toda tábua sem coordenada não mostra hora e mostra 'vá com guia' e 'Chamar um guia'" (hoje 8).
2. **Horas na tela são múltiplos de 5, para baixo.** "16:07", "escurece às 18:11" e "17 min de sol" do conceito aparecem como 16:05, 18:10 e 15 min. Motivo: nunca prometer sol que não há.
3. **"Sol chega ao poço" arredonda para cima.** Para baixo prometeria sol antes da hora; o mesmo princípio de honestidade, aplicado ao início da janela.
4. **Duas fontes de relevo (`dem` e `dem-relevo`).** O MapLibre 5.24 avisa no console quando hillshade ou color-relief divide a fonte com o terreno (conferido no `vendor/maplibre-gl.js`). Os tiles são os mesmos; o SW serve os dois.
5. **Sem texto no estilo do mapa.** Texto em camada pede `glyphs` (PBF), que não temos offline sem gerar fontes. Rótulos e etiquetas de hora são marcadores HTML, o que também dá acessibilidade e a fonte da casa.
6. **Fontes extras `rota-gps` e `gravacao`.** As camadas de mesmo nome precisam de fonte própria.
7. **`dados/recorte.json` (devops).** Uma fonte única para bbox, centro, fuso e grade z12 do motor. É o que torna "trocar de vale" troca de dados.
8. **`precache.json` com `casco` e `hash`, e `estado` com `nova_versao`** (decididos pelo devops no T2, adotados aqui). `casco` diz o que o install guarda; `hash` deixa o "atualizar" copiar do cache antigo o que não mudou, sem rebaixar 14 MB no 4G; `nova_versao` liga o botão "atualizar mapa".
9. **QR no app particular por `vendor/qrcode-generator.mjs` 2.0.4 (MIT, Kazuhiko Arase), carregado só no `marcos.html`.** O briefing pede gerador MIT em `vendor/`; o conceito proíbe "dependência nova". Leitura adotada: arquivo local com licença e hash em `VERSOES.json`, sem npm em execução, sem CDN e fora do app público.
10. **Formato do kit de venda documentado aqui (7.6), não no RELATORIO.** O RELATORIO aponta para cá; o conteúdo do kit continua fora do repositório.
11. **Satélite sai do papel principal.** O briefing pedia CBERS-4A e um levantamento de satélite pago; o conceito escolheu o relevo pintado com o sol real, porque foto traz sombra congelada de outro dia. CBERS e pago ficam fora desta entrega; o Sentinel-2 2016 fica no botão Satélite.
12. **Bússola.** O briefing pede "bússola com rumo"; o conceito corta a bússola como centro. O rumo e a distância ficam no `gps.js` como informação secundária.
13. **Pontos confirmados em campo só aparecem no `marcos.html`.** O hóspede vê o arquivo oficial; o que o Marcos confirma entra para todos pelo pacote e pelo `aplicar-pacote.mjs`.
14. **Vitrine em iframe com `vitrine=1`.** É o jeito simples de a trava (toque longo + PIN) ficar por fora do app público sem duplicar código.
15. **`tocarAbertura` recebe `etiquetas` e devolve um objeto.** Sem a lista, a abertura não sabe quando acender cada hora; o retorno diz ao B se precisa mostrar o estado final.
16. **Evento extra `itaitu:gravacao`.** O alerta "faltam X min para escurecer" do briefing precisa saber quando há trilha em andamento.
17. **`?agora=` anda em tempo real e `?sw=0` desliga o SW.** Testes ganham data fixa sem travar o relógio da gravação; desenvolvimento não briga com o cache primeiro.
18. **Tempo de carro é sempre o da placa (a partir do Village).** Não há dado de carro para outras bases; a tela diz de onde vem o número.
19. **A nota "±10 min" do conceito vale só para confiança `alta`; `media` mostra ±15 min.** O protótipo deslocado 50 a 111 m passou de 10 min nas Arapongas e no Véu (6.3). O critério (1) da seção 12 muda junto.
20. **Estimativa em múltiplo de 5, fato exato.** A chegada do cartão vem do GPS e aparece como foi (15:52); o "N min de sol" é a chegada exata menos o apaga exibido. O conceito escrevia "Cheguei 15:50 · ... · 17 min"; os números do cartão são sempre ilustrativos neste documento.
21. **Tempo da placa ilegível vira `null`.** Antes o "maior número" lia `'1 h'` como 1 min. Agora uma lista fechada de formatos (6.1); fora dela, `sem-tempo`.
22. **Perfil, toque longo e Marcar ponto aqui ganharam dono** (2.1 e 2.2): `perfil.js` e `marcar.js` novos no A, toque longo no `mapa.js`, método `altitudes` no motor e store `marcados`. O toque longo também oferece "Marcar ponto aqui", sempre como `aproximado`, porque não é GPS no local.
23. **Critérios de aceite escritos aqui (seção 12).** O conceito aprovado só existia no texto da tarefa do fluxo; o qa e o revisor precisam conferir por número.
