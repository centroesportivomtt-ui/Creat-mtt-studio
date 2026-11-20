# Briefing: Trilhas de Itaitu, mapa 3D com GPS que funciona sem internet

Pedido do dono (Marcos), 20/11/2026: "pegue a foto do mapa de Itaitu como base, pesquise tudo na internet e crie um roteiro como se fosse um GPS, dinâmico, em 3D, um aplicativo onde eu tenha todos os trajetos mapeados e que funcione mesmo sem internet. Mapeamento completo."

Itaitu é um distrito de Jacobina (BA), o "vale das cachoeiras", na Chapada Diamantina norte. O sinal de celular só existe na vila e falha nas trilhas. Por isso o app tem de **abrir e funcionar inteiro sem internet** depois da primeira visita com sinal.

## Leituras obrigatórias (nesta ordem)
1. `projetos/itaitu-mapa/dados/placa.json`: a placa "Guia das Cachoeiras de Itaitu" fotografada pelo dono. Tem 7 cachoeiras com distâncias de carro e de trilha, tempos e nível. **A placa é esquemática e fora de escala.** Vale para distância, tempo e dificuldade, nunca para posição.
2. `projetos/itaitu-mapa/dados/pesquisa-radar.md`: a pesquisa do Radar. Traz coordenadas, fontes, trilhas, estradas, taxas, riscos, guias e licenças.
3. `site/itaitu/dados/pontos.geojson`: os pontos de interesse (contrato abaixo).
4. `projetos/itaitu-mapa/dados/osm/recorte-api06.json`: recorte cru do OpenStreetMap (API 0.6, bbox -40.60,-11.42,-40.40,-11.26). São 21.906 elementos: ruas, rios, prédios e o polígono do Parque Estadual das Sete Passagens.

## Onde fica e como vai ao ar
- O app inteiro mora em `site/itaitu/`. O GitHub Pages já publica a pasta `site/` quando há push na `main` (workflow `.github/workflows/sede-ao-vivo.yml`). Endereço final: `https://centroesportivomtt-ui.github.io/Creat-mtt-studio/itaitu/`, com HTTPS, que GPS e service worker exigem.
- **Ninguém faz merge na main nem muda o workflow.** O dono decide quando publicar. O teste é local, servindo `site/` (por exemplo `python3 -m http.server` dentro de `site/`, abrindo `http://localhost:PORTA/itaitu/`).
- Todos os caminhos são relativos (`./`), porque o app roda sob `/Creat-mtt-studio/itaitu/`. O escopo do service worker é a própria pasta.
- **Não mexer** em `site/index.html`, `site/ao-vivo/`, `site/vendor/` nem `.github/`. O CI do PR roda os testes de `site/ao-vivo` e eles têm de continuar passando.
- Scripts de preparação (baixar tiles, gerar o mapa-base) ficam em `projetos/itaitu-mapa/scripts/`. Usam Node 22 só com módulos nativos (fetch, fs, zlib), sem package.json e sem dependência nova.

## Stack (decidido, não reabrir)
- HTML, CSS e JS puros em módulos ES, sem etapa de build.
- MapLibre GL JS 5.24.0, já guardado em `projetos/itaitu-mapa/vendor/` (js, css, licença). Copiar para `site/itaitu/vendor/`. **Zero CDN em tempo de execução:** tudo que o app usa sai da própria pasta.
- **Relevo 3D:** tiles Terrarium da AWS (`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`, testado e decodificado: vila 562 m, Véu 659 m). Baixar o bbox do recorte, do z8 ao z14, para `site/itaitu/tiles/dem/{z}/{x}/{y}.png`. Fonte `raster-dem` com `encoding: 'terrarium'`, terreno 3D com exagero entre 1,3 e 1,6, hillshade, céu e névoa.
- **Satélite:** Sentinel-2 cloudless **2016** da EOX (`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg`, ordem z/y/x, testado: responde 200). Baixar z8–z14 do mesmo bbox para `site/itaitu/tiles/sat/{z}/{x}/{y}.jpg`.
  - Licença: a versão 2016 é CC BY 4.0. Atribuição obrigatória: "Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2016)".
  - **Proibido usar** as versões 2018 em diante (CC BY-NC-SA, não comercial) e a Esri World Imagery (os termos não permitem guardar para uso offline).
- **Mapa-base vetorial:** gerado do recorte do OSM para `site/itaitu/dados/base.geojson`, ou em poucos arquivos por camada. Inclui ruas por classe (tertiary, unclassified, residential, track, path, service), rios e córregos com nome, prédios da vila, áreas e o parque. Atribuição: "© OpenStreetMap contributors (ODbL)".
- Atribuição do relevo: "Terrain Tiles (Mapzen/AWS Open Data): SRTM, GMTED, ETOPO1 e outras fontes".
- Baixar tiles com respeito: em série ou com pouca concorrência, uma vez só, com cache no disco. O resultado vai para o repositório (estimativa: menos de 20 MB no total). Registre a contagem e o tamanho no RELATORIO.
- **Offline:** service worker com cache versionado.
  - Pré-cacheia o app, os dados e todos os tiles, a partir de uma lista gerada por script (`site/itaitu/precache.json`).
  - Na primeira visita com sinal, o app mostra o progresso ("Guardando o mapa no celular: 63%") até "Pronto para usar sem internet".
  - Pede `navigator.storage.persist()`.
  - Instala na tela inicial: `manifest.webmanifest` e ícones gerados localmente, sem marca de terceiros.

## Contrato de dados (o time de dados escreve, o app só lê)
Um processo separado de pesquisa continua procurando as coordenadas que faltam e vai **reescrever** estes dois arquivos durante a construção. **O time de construção não edita** `site/itaitu/dados/pontos.geojson` nem `site/itaitu/dados/trilhas.geojson`. O app lê os dois em tempo de execução e tem de funcionar com qualquer conteúdo que siga o contrato:

- `pontos.geojson`: FeatureCollection. `geometry` é um Point **ou `null`** (ponto ainda sem coordenada). Propriedades:
  - `id` (slug), `nome` e `tipo`: cachoeira, poco, vila, praca, igreja, hospedagem, infra, pico, area, mirante, estacionamento ou entrada-trilha.
  - `grupo`: placa, vila, base ou fora-da-placa.
  - `confianca`: alta, media, baixa ou sem-coordenada. `aproximado` (bool) e `fonte`.
  - Da placa: `carro_km`, `carro_tempo`, `trilha_km`, `trilha_tempo` e `nivel` (Fácil, Moderada ou Difícil).
  - Opcionais: `notas`, `outros_nomes`, `taxa`, `horario`, `riscos`, `entrada_trilha_id`.
- `trilhas.geojson`: FeatureCollection de LineString. Propriedades: `id`, `destino_id` (id do ponto), `nome`, `modo` (carro ou pe), `confianca`, `aproximado`, `fonte`, `autor`, `km` e `desnivel_m`. **Hoje está vazio.** O app tem de funcionar sem nenhuma trilha e desenhar as que aparecerem.
- Antes de passar ao MapLibre, filtre as features com geometria nula. Ponto `aproximado` aparece com marcador diferente, por exemplo tracejado, e com o aviso "posição aproximada". Ponto sem coordenada aparece só na lista, com os dados da placa e "posição ainda não confirmada: vá com guia".

`site/itaitu/dados/info.json` (informações práticas) é do time de construção (copywriter). O conteúdo sai de `pesquisa-radar.md`, seção 5, com a data de cada informação.

## O que o app faz (funções obrigatórias)
1. **Mapa 3D da região** com relevo, satélite e camadas vetoriais por cima: ruas, rios, vila e parque. Botões para alternar 3D/2D e Satélite/Mapa e para voltar ao norte.
2. **Lista de destinos:** as 7 cachoeiras da placa primeiro, depois os outros pontos.
   - Cada cachoeira tem um cartão com carro (km e tempo a partir do Village Serra do Cruzeiro), trilha (km e tempo), nível, taxa, horário, riscos e grau de confiança da posição.
   - Tocar no cartão leva a câmera até o ponto com um voo 3D.
3. **GPS ao vivo:**
   - Ponto azul com círculo de precisão e direção (bússola do aparelho; no iOS pedir permissão com um toque) e modo "seguir".
   - Ao escolher um destino: distância e rumo até ele, distância restante ao longo da trilha quando existir traçado, tempo estimado e aviso de "fora da trilha" a mais de 40 m do traçado.
   - Sem traçado, mostra uma linha reta tracejada com o rótulo "direção em linha reta, não é o caminho", o rumo e a distância em linha reta.
4. **Gravar trilha:** grava o percurso pelo GPS (IndexedDB, sobrevive a fechar o app), mostra o traçado ao vivo, salva com nome e exporta GPX (download).
   - **Marcar ponto aqui:** salva a posição atual com nome e tipo, por exemplo "Cachoeira do Coxinho". Exporta GeoJSON e GPX.
   - É assim que o dono ou um guia completa o mapa no local.
5. **Importar GPX:** escolher um arquivo .gpx no celular, por exemplo os baixados do Wikiloc com a conta do dono. O app desenha e guarda no IndexedDB, e a trilha fica disponível offline e como rota para o GPS.
6. **Segurança:**
   - Telefones 192 (SAMU), 193 (Bombeiros) e 190 (Polícia), com link `tel:`.
   - "Chuva forte: saia do rio, risco de cabeça d'água."
   - "Não há caixa eletrônico na vila: leve dinheiro."
   - Guias: ACAGI, @guiasdeitaitu. Melhor época: abril a outubro.
   - Hora do pôr do sol do dia calculada offline (fórmula solar) com "volte antes de escurecer".
7. **Bateria e sol:**
   - Alto contraste e legível sob sol forte, com alvos de toque de pelo menos 44 px.
   - Modo economia (2D, menos quadros, pausa a renderização quando nada muda).
   - Deve rodar liso num Android intermediário.

Tudo em português do Brasil. Nome do app: "Trilhas de Itaitu", ou algo melhor que o conceito propuser.
- **Não usar a marca, o logo nem o nome do Village Serra do Cruzeiro como marca do app.** O Village aparece só como um lugar no mapa.
- Não citar pessoas físicas. Nada de telefone pessoal.

## Momento-assinatura
Fica com o conceito, mas a função vem antes do espetáculo. Ideias para o criativo julgar:
- Abertura em voo sobre a serra que pousa na vila.
- A trilha escolhida se "desenha" sobre o relevo.
- O GPS mostra a pessoa como um ponto que sobe o morro de verdade.
Nada pode atrasar abrir o mapa nem gastar bateria à toa.

## Verificação obrigatória (definição de pronto)
- Playwright com o Chromium da sessão (sem `playwright install`), servindo `site/` localmente:
  - (a) abre sem erro de console;
  - (b) depois que o SW termina o pré-cache, `context.setOffline(true)` e recarrega: o mapa, o relevo e o satélite aparecem;
  - (c) geolocalização emulada perto do Véu da Noiva (-11.3335, -40.4990): escolher Véu mostra distância e rumo coerentes;
  - (d) gravar trilha com posições simuladas e exportar um GPX válido;
  - (e) importar um GPX de teste.
- Prints de celular e desktop com `.claude/skills/verificacao-visual/olhar.cjs`. O fluxo percorrido com a skill `navegador`.
- Testes automatizados em `projetos/itaitu-mapa/testes/` (Node + Playwright já instalado na máquina), rodáveis com um comando documentado.
- `projetos/itaitu-mapa/RELATORIO.md`: o que foi feito, como testar, tamanhos, licenças e o que falta (as coordenadas sem confirmação).
- Coordenada inventada é proibida. O que não tem fonte fica marcado como aproximado ou sem coordenada, como manda o contrato.
