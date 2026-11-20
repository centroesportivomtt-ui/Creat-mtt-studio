# Briefing: Trilhas de Itaitu, mapa 3D com GPS que funciona sem internet

Pedido do dono (Marcos), 20/11/2026: "pegue a foto do mapa de Itaitu como base, pesquise tudo na internet e crie um roteiro como se fosse um GPS, dinâmico, em 3D, um aplicativo onde eu tenha todos os trajetos mapeados e que funcione mesmo sem internet. Mapeamento completo."

Itaitu é um distrito de Jacobina (BA), o "vale das cachoeiras", na Chapada Diamantina norte. O sinal de celular só existe na vila e falha nas trilhas. Por isso o app tem de **abrir e funcionar inteiro sem internet** depois da primeira visita com sinal.

## Atualização do dono (20/11, a que manda): é PRODUTO PARA VENDER em Itaitu
"Pode usar o que precisar pra me entregar algo tão foda que eu possa vender pra alguém aqui de Itaitu."

**Quem compra:**
- Primeiro alvo: a pousada **Village Serra do Cruzeiro**, que é dona da placa fotografada.
- Depois: outras pousadas e campings (Camping Payayás, Camping Vale do Mamute), a associação de guias (ACAGI), restaurantes e o turismo de Jacobina.

**O que eles compram:** um app de trilhas 3D offline com a marca deles, que o hóspede abre por um QR na recepção. O hóspede volta encantado e conta para os outros, e a pousada se diferencia de todas as vizinhas. Toda oferta da casa tem **plano mensal** (atualização de trilhas, novos pontos, suporte, hospedagem). Por isso o produto precisa ser:
1. **Marca do parceiro (white-label) por configuração.** Arquivo `site/itaitu/marcas/<slug>.json`, escolhido por `?m=<slug>`; sem parâmetro abre `padrao.json`. Campos:
   - nome do app e nome do parceiro;
   - cor de destaque e logo (caminho; opcional);
   - id do ponto-base no mapa, de onde saem as rotas de carro;
   - WhatsApp de reserva (link `wa.me`) e Instagram;
   - texto de boas-vindas;
   - lista de parceiros em destaque ("onde comer", "guias") com nome, tipo, link e ponto no mapa quando houver.
   Trocar de parceiro = criar um JSON, sem mexer em código.
   - Faça três: `padrao.json` (neutro, "Trilhas de Itaitu"), `demo-village.json` e `demo-camping.json`.
   - O `demo-village.json` usa o Village só pelo **nome em texto** e como ponto-base. **Sem logo dele** (não temos autorização). Os campos de logo e WhatsApp ficam vazios, marcados "preencher quando o parceiro autorizar".
   - Crédito discreto "feito pela Creat".
2. **"Cartão da trilha", o pulo do gato para quem compra.** Ao terminar uma trilha gravada, o app gera uma imagem pronta para story (canvas, 1080×1920), feita no próprio celular e offline:
   - o traçado sobre o relevo;
   - os números da trilha: km, tempo, desnível, cachoeira;
   - a marca do parceiro.
   A pessoa compartilha (Web Share API, com download como alternativa). **Cada hóspede vira anúncio da pousada.**
3. **Botões que geram negócio para o parceiro:** "Falar com a pousada" (WhatsApp), "Chamar um guia" (ACAGI) e "Onde comer" (parceiros).
4. **Modo demonstração para a venda presencial.** Um botão escondido, ou `?demo=1`, faz um tour automático: abertura 3D, voo até cada cachoeira e uma trilha gravada simulada que vira o cartão da trilha. Assim o Marcos mostra tudo em 60 segundos na recepção de uma pousada, sem precisar andar a trilha.

**Imagem de satélite melhor (vale gastar):**
- Sentinel-2 com 10 m por pixel é borrado demais para o 3D impressionar. Tente, nesta ordem:
  - (a) **CBERS-4A WPM do INPE**: satélite brasileiro, 2 m pancromático, dado gratuito. Ache uma cena sem nuvem sobre o bbox pelo catálogo do INPE / Brazil Data Cube, faça o pansharpen e corte em tiles WebMercator até o z16 só na área das cachoeiras e da vila. Registre a licença e a atribuição exatas.
  - (b) Se não for viável daqui, levante as opções pagas com licença que permite uso offline em app próprio, com preço e fonte. Exemplos: arquivo Pléiades/SPOT por UP42 ou Apollo Mapping, MapTiler Data satélite para auto-hospedagem. Devolva a recomendação pronta para o dono decidir. **Não compre nada.**
  - (c) Alternativa garantida: estilo ilustrado/toon sobre o relevo (skill `toon-3d`), que pode ficar mais bonito que um satélite borrado.
- A decisão final de estilo é do conceito, mas o Sentinel-2 2016 fica como camada de reserva.
- O dono autorizou ferramentas pagas ("pode usar o que precisar"). Registre todo gasto em `projetos/itaitu-mapa/RELATORIO.md` (o quê, quanto, por quê). Antes de gastar, rode a rota da economia (grátis, crédito, mais barato com a mesma qualidade).

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
- O nome do parceiro só entra pelo arquivo de marca. Logo de terceiro só com autorização dele. Na versão padrão, o Village aparece só como um lugar no mapa.
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
