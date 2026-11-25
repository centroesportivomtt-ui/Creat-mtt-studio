# Fontes das coordenadas: Trilhas de Itaitu

Consolidado em 20/11/2026, revisado pelo crítico final na mesma data. Arquivos que o app lê: `site/itaitu/dados/pontos.geojson` (24 pontos, 16 com coordenada) e `site/itaitu/dados/trilhas.geojson` (6 traçados).
Regra: nenhuma coordenada foi inventada. Cada ponto tem uma fonte com URL e trecho, ou um método que dá para reproduzir. O Wikiloc não foi aberto, por regra da rodada. Onde a fonte é "resumo de busca", o texto vem de um resultado do WebSearch (um resumo escrito pela ferramenta, não a página nem uma citação literal) e não da página.

## Pontos com coordenada

| ponto | coordenada (lat, lon) | confiança | aprox. | fonte |
|---|---|---|---|---|
| Cachoeira Véu da Noiva | -11.3331084, -40.5035718 | alta | não | Nó OSM 10238223938. Tag amenity=fountain. Confere com a Wikipédia pt (11°19'59"S 40°30'12"O, a 27 m) e com o SGB Geossit 2296 (-11,332848549 / -40,503246307, a 46 m; resumo de busca). O aroundus foi lido numa rodada anterior e não foi reaberto |
| Cachoeira das Arapongas | -11.3720509, -40.5063201 | média | não | Nó OSM 10238231425 (waterway=waterfall). Segunda leitura do crítico: resumos de busca de duas trilhas Wikiloc dão -11.371969/-40.505958 e -11.37203/-40.506053, a 41 m e 29 m do nó. Fica média porque o Wikiloc só foi lido em resumo |
| Cachoeira do Coxinho | -11.330183, -40.49041748 | média | não | SGB Geossit 2294 (https://www.sgb.gov.br/geossit/geossitios/ver/2294): WGS 84 -11,330183029 / -40,490417480, cota 541 m. Lido só pelo resumo de busca (4 leituras iguais), porque a página não abre por robô (WebFetch 404; o HTML salvo é a home do portal). O UTM do inventário geológico de Jacobina (337348 E / 8747096 N) converte para o mesmo ponto, mas vem da mesma base SGB. O waypoint "Coxinho Waterfall" da trilha Wikiloc 86343066 (resumo de busca) está a 8 m. Coerente com uma quebra de relevo a 18 m e com um rio OSM a 37 m |
| Cachoeira das Flores | -11.32366, -40.50592 | média | sim | Waypoints das trilhas Wikiloc 35819879 e 123961804, vistos só no resumo de busca (6 leituras em duas rodadas, espalhamento de 26 m, usada a média; a releitura deu média a 8 m dela). Conferido com o talvegue calculado no Terrarium (40 m) e com a altitude (765 m no DEM contra 770 m) |
| Village Serra do Cruzeiro | -11.339013, -40.488777 | baixa | sim | https://www.br-hotels.com/en/vacation-rentals/jacobina/, trecho `"HotelID": 22478315, "Latitude": -11.339013, "Longitude": -40.488777` ("Village Vista Do Cruzeiro Itaitu"). Origem única (br-hotels e Booking A são o mesmo pin); o Booking B fica a 246 m. Raio de incerteza de 250 m. Não está provado que é o Village da placa |
| Vila de Itaitu | -11.339931, -40.486526 | alta | não | Nó OSM 416643032 (place=village, IBGE). Confere com a Wikipédia e o Mapcarta |
| Praça da Matriz de Itaitu | -11.33985, -40.48641 | média | não | Way OSM 248603522 (tag highway=residential, 6 vértices, não fechado), média dos vértices. A Wikipédia pt confirma que a praça existe em Itaitu. Existe homônimo em Cachoeira Grande |
| Igreja Matriz de Itaitu | -11.33985, -40.48641 | baixa | sim | Usa a coordenada da praça, porque a Wikipédia pt diz que a igreja histórica fica na Praça da Matriz. Não há nó próprio. Erro esperado de até ~60 m |
| Torre de comunicação (celular) | -11.3394156, -40.4866927 | média | não | Nó OSM 7961194194 (man_made=tower, mobile_phone), fonte única. Era alta, rebaixada pelo crítico |
| Cachoeira do Urubu | -11.4021353, -40.5383116 | média | não | Nó OSM 11143166473 (waterway=waterfall) |
| Pico dos Payayas | -11.3138142, -40.5047642 | média | não | OSM natural=peak |
| Parque Estadual das Sete Passagens (ponto de referência) | -11.388887, -40.524104 | baixa | sim | Coordenada da Wikidata Q10345048, igual à da Wikipédia em inglês (11°23′20″S 40°31′27″W). Substitui o centro dos vértices do way OSM 524775361, descartado porque o polígono tem 92 km² e o parque oficial 28,2 km² |
| Entrada da trilha das Arapongas, Sossego e Geladeira | -11.3725988, -40.494775 | baixa | não | Nó OSM 8568154125, início do track way 922994533 (1,32 km até 44 m da queda), ao lado de um vau. O OSM não marca o ponto como entrada. Um veredito deu média e outro deu baixa, e ficou a menor |
| Entrada da trilha do Véu da Noiva e das Flores | -11.3354097, -40.4991218 | média | não | Primeiro nó do path OSM 922994535. Fica a 10 m do início da trilha Wikiloc 123961804 (resumo de busca) |
| Ponto de partida provável da trilha do Coxinho (Wikiloc) | -11.340485, -40.489614 | baixa | sim | Posição que o dado estruturado do Wikiloc 35986276 dá à trilha, em duas leituras de resumo de busca. Não confirmado que seja o início. Fica a 342 m da vila (e não a 100 m, como constava) e a 55 m do que uma busca deu para o Camping Vale do Mamute |
| Mirante do Parque Estadual das Sete Passagens | -11.39262, -40.540359 | baixa | sim | Geotag de foto do Commons ("Vista do Mirante - PESP ... panoramio.jpg"). É a posição da câmera, não um ponto oficial, e o parque tem mais de um mirante. O relevo mostra borda de escarpa (979 m, 61 m acima do mais baixo em 100 m) |

Totais: 2 alta, 8 média e 6 baixa (16 com coordenada). 8 pontos estão sem coordenada.

## Traçados (trilhas.geojson)

Todos usam só a geometria real do OSM, do recorte `osm/recorte-api06.json`. A rota de carro sai do Village (coordenada baixa, aproximada) e é calculada por Dijkstra nas vias tertiary, unclassified, residential, track e service. O desnível vem do Terrarium z14, reamostrado a cada 30 m. `desnivel_m` é a subida acumulada na ida, e a descida está em `descida_m`.

| id | destino | modo | km | subida / descida (m) | nota |
|---|---|---|---|---|---|
| carro-arapongas | entrada Arapongas (serve Sossego e Geladeira) | carro | 4,40 | 102 / 133 | a placa dá 4,0 km. Confiança baixa (destino e origem aproximados) |
| carro-veu-flores | entrada Véu e Flores | carro | 1,27 | 126 / 0 | a placa dá 1,2 km |
| carro-coxinho | Cachoeira do Coxinho | carro | 1,08 | 28 / 43 | para na rua. A queda fica a 285 m dela, trecho sem traçado. A placa dá 1,2 km |
| pe-arapongas | Cachoeira das Arapongas | pé | 1,32 | 59 / 15 | track OSM 922994533, termina a 44 m da queda. A placa dá 1,2 km |
| pe-veu-da-noiva-1 | Cachoeira Véu da Noiva | pé | 0,76 | 52 / 86 | path OSM 922994535, termina a 46 m da queda. A placa e o blog dão 2,0 km de trilha, o OSM 0,76 km: divergência aberta |
| pe-veu-da-noiva-2 | Cachoeira Véu da Noiva | pé | 0,84 | 25 / 90 | path OSM 922994536, termina a 69 m. Traçado paralelo, e não se sabe qual dos dois é o usado |

Ficaram de fora:
- Carro até o Urubu: a rua mais próxima fica a 794 m e não se liga à rede da vila no recorte.
- Carro até o início a pé do Coxinho: são 234 m dentro da vila e o ponto não foi verificado.
- Trilha a pé para o Coxinho, as Flores e o Urubu: nenhuma via path, footway ou track do OSM chega a menos de 100 m deles.

Scripts (fora do repositório): `/tmp/claude-0/-home-user-Creat-mtt-studio/94a84be8-30f2-5dca-8c94-d8ca3492cd31/scratchpad/itaitu/varredura/scripts/` (`rotas.mjs`, `desnivel.py`, `montar.mjs`, `validar.mjs`).

## Continua sem coordenada, e como fechar

| ponto | o que se sabe | caminho para fechar |
|---|---|---|
| Cachoeira do Sossego | Fica no riacho acima das Arapongas (OSM way 1539166301), entre 300 e 650 m a montante. A placa e o blog discordam sobre se vem antes ou depois da Geladeira | GPX da trilha no Wikiloc baixado pelo dono, ou "Marcar ponto aqui" no app, no local |
| Poço da Geladeira | Fica no mesmo corredor do Sossego. O relevo não separa os dois | O mesmo GPX do Wikiloc (o título cita o "Poço do Gelo"), ou gravação no local |
| Cachoeira do Piancó | Fica no ramo sul, depois do Coxinho. A trilha tem de 1,5 a 3 km, conforme a fonte. PISTA NOVA, não incorporada: resumos de busca do Wikiloc dão uma queda "Pinhacó" em -11,314401 / -40,494095 (provável trilha 54863543, ago/2020, id não confirmado) e o estacionamento em -11,314337 / -40,487416 (trilha 86343066), a 8,6 m de uma via OSM unclassified. Fica a 2,96 km da vila em linha reta, coerente com os 3,7 km de carro da placa. Só entra com a página aberta ou segunda leitura | GPX do Wikiloc 123080128 (Camping Vale do Mamute) baixado pelo dono, ou guia da ACAGI |
| Cachoeira do Santuário | Só o nome. Há trilhas no Wikiloc (203400324, 132794295, 61817748) | GPX do Wikiloc baixado pelo dono |
| Cachoeira dos Índios | Só a menção na trilha Wikiloc 161436275 | Waypoint "Índios" dessa trilha (conta do dono), ou guia da ACAGI |
| Cachoeira das Andorinhas | A trilha Wikiloc 161436275 entra pela placa do Piancó | GPX dessa trilha (conta do dono), ou guia da ACAGI / @guiasdeitaitu |
| Cachoeira do Riachinho | "A 500 m da vila", sem direção | Guia da ACAGI, ou "Marcar ponto aqui" no local |
| Cachoeira dos Sonhos | Só aparece na Wikipédia | Artigo de Macedo (2021, DOI 10.47363/jeesr/2021(3)146) e guias da ACAGI |

Para subir a confiança dos que já têm ponto:
- **Village:** o pin do Google Maps do próprio Village.
- **Coxinho:** abrir a página do SGB num navegador.
- **Flores:** o waypoint do Wikiloc com a conta do dono.
- **Entradas e Arapongas:** gravar no local com o app ("Gravar trilha" e "Marcar ponto aqui") e importar o GPX.

## Revisão do crítico final (20/11/2026)

Método: cada coordenada alta ou média foi conferida contra o recorte OSM cru (`osm/recorte-api06.json`, nós e vias lidos um a um), contra os arquivos de trabalho da varredura e, onde a fonte era externa, relida por busca. Wikiloc: nenhuma página aberta, só resultados de busca.

Corrigido:
- Torre de celular: alta para média (fonte única, nó mapeado por um colaborador em 2020).
- Parque das Sete Passagens: o ponto era o centro dos vértices de um polígono OSM de 92 km², contra 2.821 ha (28,2 km²) do parque oficial, e o polígono inclui Véu, Flores e Arapongas. Trocado pelo ponto da Wikidata (baixa, aproximado) e renomeado "ponto de referência". O polígono não vai no app.
- Ponto do Coxinho a pé: constava "a ~100 m da vila"; são 342 m. Renomeado "ponto de partida provável" e com o aviso de que pode ser o Camping Vale do Mamute (55 m).
- Véu da Noiva: o SGB fica a 46 m do nó OSM, não 25 m. Mantida alta (OSM, Wikipédia e SGB).
- Rota carro-arapongas: média para baixa (destino baixa, origem com 250 m de incerteza). As outras duas rotas de carro ficaram médias e ganharam `aproximado: true` pela origem.
- Village: registrado o segundo pin do Booking (246 m do primeiro) e o argumento que sustenta a posição (km das três rotas contra a placa).
- Arapongas e Coxinho ganharam segunda leitura (Wikiloc, por resumo de busca) e continuam médias.

As 3 rotas de carro (todas, porque só existem 3) seguem ruas reais: os 112, 29 e 53 pontos são nós OSM, cada par consecutivo pertence a uma via highway listada (residential, unclassified, tertiary), e o km recalculado por haversine bate com o arquivo.

| rota | km calculado | placa | diferença |
|---|---|---|---|
| carro-arapongas | 4,40 | 4,0 | +10% |
| carro-veu-flores | 1,27 | 1,2 | +6% |
| carro-coxinho | 1,08 | 1,2 | -10% (para 285 m antes da queda) |

Divergência que o km de carro não pega: a trilha a pé até o Véu. A placa e o blog dão 2,0 a 2,08 km; o traçado OSM tem 0,76 km e a linha reta entrada-queda é 0,55 km. A entrada bate com o início da trilha Wikiloc 123961804 (10 m), então o traçado parece certo e o número da placa parece contar outra coisa, mas não está provado. Para as Flores, a placa dá 1,5 km e a estimativa é ~2,1 km.

Não foi possível ler nem rodar:
- Wikiloc (qualquer página): proibido na rodada. Todos os waypoints do Wikiloc (Flores, Arapongas, Coxinho, ponto de partida) vêm de resumo de busca, que é texto resumido pela ferramenta, sem URL de trilha para cada número.
- SGB Geossit 2294 e 2296: a página não abre por robô (WebFetch 404; os HTML salvos são a home do portal). Os números vêm de resumos de busca, repetidos entre leituras.
- aroundus.com (Véu): lido numa rodada anterior, não reaberto.
- Commons: a API recusou a releitura por excesso de requisições; vale o `commons.json` salvo antes.
- Segunda fonte para Cachoeira do Urubu e Pico dos Payayas: só OSM (mais o relevo, que combina). Seguem médias.
- Modos de busca não tentados: Mapcarta e GeoNames por nome de cachoeira, o Instagram @guiasdeitaitu e a ACAGI (guias), o waypoint SKZG68 do Wikiloc (apareceu na busca, é página do Wikiloc) e um GPX gravado em campo. Sossego e Geladeira: uma busca específica não devolveu coordenada.
