
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
