# Itaitu (Jacobina-BA): base de dados para o mapa offline 3D

Pesquisa de 20/11/2026. Fontes públicas, leitura sem raspagem. Wikiloc bloqueou o acesso automático (bot_blocked / 403): só vi títulos, distâncias e trechos que apareceram na busca; nenhum GPX foi baixado.

## Resposta curta
- Coordenada confiável (alta ou média): 7 pontos. Alta: Vila de Itaitu, Véu da Noiva, torre de celular. Média (uma só fonte, OSM): Arapongas, Praça da Matriz, Cachoeira do Urubu, Pico dos Payayas.
- Das 7 cachoeiras da placa, só Véu da Noiva (alta) e Arapongas (média) têm coordenada. Sossego, Geladeira, Piancó, Coxinho e Flores não têm coordenada em nenhuma fonte aberta que consegui ler. Estão no Wikiloc, que exige download com login e bloqueia robô.
- Overpass: não responde daqui (3 espelhos sem conexão). A API comum do OSM responde e entregou o recorte. Salvo em `osm.json`.
- Elevação: funciona (Terrarium da AWS, testado e decodificado).
- Village Serra do Cruzeiro e a igreja: sem coordenada própria.

## 1. Atrativos
Tabela completa em `pontos.json` (20 entradas, campo `grupo` separa "placa", "vila", "base" e "fora da placa").

Dados da placa (fonte: `projetos/itaitu-mapa/dados/placa.json`) cruzados com o que achei:

| Atrativo | Coordenada | Fonte | Confiança |
|---|---|---|---|
| Véu da Noiva | -11.3331084, -40.5035718 | OSM; Wikipédia pt (11°19'59"S 40°30'12"O); aroundus.com (-11.33306, -40.50336) | alta |
| Arapongas | -11.3720509, -40.5063201 | OSM nó waterfall "Cachoeira Arapongas" | média |
| Sossego, Geladeira, Piancó, Coxinho, Flores | não achada | Wikiloc tem trilhas, bloqueado | sem coordenada |
| Vila de Itaitu | -11.339931, -40.486526 | OSM (IBGE); Wikipédia; Mapcarta (562 m) | alta |
| Praça da Matriz | -11.33985, -40.48641 | OSM way 248603522 | média |
| Igreja Matriz | = praça | estimado | baixa |
| Village Serra do Cruzeiro | não achada | Booking/Airbnb listam "Village Vista do Cruzeiro"; talvez o mesmo | sem coordenada |

Cuidados de consistência:
- Existe outra "Praça da Matriz" e "Igreja do Bom Jesus da Glória" em Cachoeira Grande (-11.339, -40.413), 8 km a leste. Não é Itaitu.
- A coordenada do Véu no OSM é o ponto da queda (tag fountain), não a entrada da trilha. Linha reta vila→Véu ≈ 2,0 km; placa: carro 1,2 km + trilha 2,0 km. Coerente.
- Linha reta vila→Arapongas ≈ 4,2 km; placa: 4,0 km de carro + 1,2 km de trilha a partir do Village. Plausível, mas o ponto do OSM pode ser a queda, não a entrada.
- Piancó: a placa diz trilha de 3,0 km. O Wikiloc 123080128 diz 1,5 km da porteira até a cachoeira. Provável que a placa some o trecho até a porteira. Conferir com guia.
- Nomes antigos (Wikipédia pt): Véu de Noiva = Cachoeira de Clarindo; Arapongas = Jaqueira; Coxinho = Cocino. Piancó = Pinhacó.
- Cachoeira das Flores fica acima da Véu na mesma trilha: do topo, segue o rio, 3 travessias e uma pedra a escalar (Viaje com Norma, jan/2023).
- Sossego fica ~100 m acima do Poço da Geladeira, que fica um pouco acima de Arapongas (Viaje com Norma, abr/2023).
- Fora da placa, sem coordenada: Cachoeira do Santuário (moderada), dos Índios, das Andorinhas (difícil), do Riachinho (500 m da vila), dos Sonhos. Com coordenada (OSM): Cachoeira do Urubu (-11.4021, -40.5383), Pico dos Payayas (-11.3138, -40.5048), polígono do Parque Estadual das Sete Passagens.
- Itaitu tem 40+ cachoeiras (42 segundo Rede Globo, 2018), várias em propriedade particular.

## 2. Trilhas e estradas

Trilhas no Wikiloc (todas sem GPX baixado; download exige login e o site bloqueia robô). Distância e desnível vêm de trechos de busca, salvo onde indicado.

| Trilha | Distância / desnível | Link |
|---|---|---|
| Cachoeira do Pinhacó/Piancó e Coxinho (saindo do Camping Vale do Mamute) | 11,23 km, +161 m | https://wikiloc.com/hiking-trails/cachoeira-do-pinhaco-pianco-e-cachoeira-coxinho-jacobina-ba-trilha-saindo-do-camping-vale-do-mamute-123080128 |
| Arapongas, Poço da Geladeira e Sossego (Parque Sete Passagens) | n/d | https://pt.wikiloc.com/trilhas-trekking/cachoeira-arapongas-poco-da-geladeira-e-cachoeira-do-sossego-no-parque-estadual-sete-passagens-em-m-123204701 |
| Arapongas x Poço do Gelo x Sossego | n/d | https://pt.wikiloc.com/trilhas-trekking/cachoeira-das-arapongas-x-poco-do-gelo-x-cachoeira-do-sossego-46961519 |
| Vila de Itaitu x Coxinho x Piancó x Jacobina | 28,33 km, +229 m, moderada; autor Túlio Simões (Simões Turismo), pelo trecho da busca | https://pt.wikiloc.com/trilhas-trekking/trilha-cachoeira-das-flores-itaitu-jacobina-ba-152085097 (aparece como relacionada) |
| Trilha Cachoeira das Flores | n/d | https://pt.wikiloc.com/trilhas-trekking/trilha-cachoeira-das-flores-itaitu-jacobina-ba-152085097 |
| Itaitu x Cachoeira das Flores | 3,78 km +276 m (outra listagem: 3,97 km +259 m, autor Meirelle Santos) | https://es.wikiloc.com/rutas-senderismo/itaitu-x-cachoeira-das-flores-153701109 |
| Flores e Véu de Noiva, circular a partir de Itaitu | Flores a 4,0 km, Véu a 6,4 km | https://es.wikiloc.com/rutas-senderismo/cachoeira-das-flores-e-cachoeira-veu-de-noiva-com-partida-em-itaitu-214127412 |
| Véu de Noiva e Flores | n/d | https://pt.wikiloc.com/trilhas-trekking/cachoeira-veu-de-noiva-cachoeira-das-flores-175860984 |
| Rotas Cachoeiras, Complexo Véu Noiva | 6,67 km, 412 m | https://wikiloc.com/hiking-trails/rotas-cachoeiras-complexo-veu-noiva-85187128 |
| Cachoeira Véu de Noiva, Itaitu (bicicleta, jul/2025) | n/d | https://pt.wikiloc.com/trilhas-trekking/cachoeira-veu-de-noiva-itaitu-jacobina-ba-224146323 |
| Cachoeira Véu de Noiva, vila de Itaitú (2020) | n/d | https://pt.wikiloc.com/trilhas-trekking/cachoeira-veu-de-noiva-vila-de-itaitu-ba-59020193 |
| Cachoeira do Coxinho, Itaitu | n/d | https://pt.wikiloc.com/trilhas-trekking/cachoeira-do-coxinho-itaitu-35986276 |
| Cachoeira Piancó | n/d | https://pt.wikiloc.com/trilhas-trekking/cachoeira-pianco-43556429 |
| Cachoeira do Pinhacó | n/d | https://pt.wikiloc.com/trilhas-trekking/cachoeira-do-pinhaco-jacobina-ba-54863543 |
| Jacobina/BA, Itaitu: Cachoeira do Piancó | n/d | https://eu.wikiloc.com/ibilbide-senderismo/jacobina-ba-itaitu-cachoeira-do-pianco-276854360 |
| Cachoeira do Santuário (lido na página) | 4,56 km, +143 m, máx. 692 m, fácil, do vilarejo a pé, enviada 01/03/2025 | https://is.wikiloc.com/fjallaferd-slodir/cachoeira-do-santuario-203400324 |
| Travessia Jacobina x Itaitu (dez/2025) | 24,2 km (15,01 mi), +895 m (2.936 ft), difícil | https://wikiloc.com/hiking-trails/travessia-jacobina-x-itaitu-244807186 |
| Jacobina x Véu de Noiva, Itaitú | 34,9 km (21,67 mi), +570 m (1.870 ft), difícil | https://wikiloc.com/trails/hiking/brazil/bahia/missao |
| Jacobina a Itaitu via Topo do Mundo | n/d | https://wikiloc.com/hiking-trails/jacobina-para-itaitu-via-trilha-topo-do-mundo-59613183 |

Outros: Komoot, AllTrails e Strava não apareceram com trilhas de Itaitu nas buscas (não confirmado que não existam). Nada de KML/GPX público fora do Wikiloc.

Estradas de acesso:
- Viaje com Norma (jan/2023 e abr/2023): BR-324 a 7 km de Jacobina, depois 17,2 km de terra até a vila. Outro post do mesmo blog: BR-324 por 8,6 km, entrada à direita na "BA 425", mais 13,5 km de terra. Os dois divergem entre si; o número "BA 425" não confirmei.
- Book Transfer (11/02/2026): cerca de 30 km do centro de Jacobina, "estrada recentemente asfaltada". Mais recente. A informação de terra x asfalto mudou; confirmar no local.
- Camping Payayás: 24 km de Jacobina, 1,7 km da vila. Não há ônibus até a vila; só transfer, táxi ou carro.
- Estradas internas (placa): Village → dois ramos (norte: Arapongas, Sossego, Geladeira, Véu; sul: Piancó, Coxinho, Flores). Esquemático.

## 3. OpenStreetMap
- Overpass: `overpass-api.de`, `overpass.kumi.systems` e `overpass.private.coffee` não conectam daqui (código 000, bloqueio de saída). `overpass.osm.ch` responde 200 mas é extrato suíço (não testei Brasil). `overpass.openstreetmap.fr` dá 403.
- A API comum funciona: `https://api.openstreetmap.org/api/0.6/map.json?bbox=-40.60,-11.42,-40.40,-11.26` (limite de 0,25 grau², 50 mil nós). Salvo em `osm.json` (raw, 4,0 MB).
- Bbox certo: oeste -40.60, sul -11.42, leste -40.40, norte -11.26. A vila está em -11.3399, -40.4865, bem mais ao sul e leste que o palpite -11.3/-40.6.
- Conteúdo: 21.906 elementos (21.232 nós, 666 vias, 8 relações). Caminhos: 6 `path`, 7 `track`, 206 `unclassified`, 138 `residential`, 31 `tertiary`, 10 `service`, 2 `primary` (BA-131, em Miguel Calmon). Cachoeiras (`waterway=waterfall`): 2 (Arapongas, Urubu); Véu da Noiva entra como `amenity=fountain`. Nós com tag: 623. Rios: dezenas de `waterway=stream`.
- Lacuna: o OSM não tem as trilhas das cachoeiras (só 13 path/track no recorte) nem Sossego, Geladeira, Piancó, Coxinho, Flores. As trilhas boas estão no Wikiloc.
- Licença: ODbL, citar "© OpenStreetMap contributors".

## 4. Relevo
- Funciona: tiles Terrarium da AWS. `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`. Testei z12, tiles 1587/2177 e 1587/2178 (cobrem vila, Véu e Arapongas), 200 OK, ~48 KB cada.
- Decodifiquei (R*256+G+B/256-32768): vila 562 m (bate com Mapcarta, 562 m), Véu 659 m, Arapongas 593 m. Resolução prática ~30 m.
- Também respondem a HEAD (200): `copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_S12_00_W041_00_DEM/...tif` e `elevation-tiles-prod/skadi/S12/S12W041.hgt.gz`. Não baixei.
- OpenTopography (`portal.opentopography.org/API/globaldem`): 401, exige chave de API.

## 5. Informações úteis no app
- Guias: ACAGI, Associação de Condutores(as) e Guias de Itaitu, Instagram @guiasdeitaitu (4,2 mil seguidores). Outros operadores citados: Eco Sistema Adventure (rapel na Véu, com agendamento). Sem telefone aqui, de propósito.
- Melhor época: abril a outubro, menos chuva (Book Transfer, fev/2026). Em chuva trilhas escorregam e pedem guia.
- Taxas: Véu da Noiva R$ 5 por pessoa (Wikiloc, jul/2025); Piancó R$ 5 de manutenção (blog, jan/2023); Arapongas tem posto do parque com taxa, valor não achado. Datas: conferir antes de publicar.
- Horário: Arapongas/Parque Sete Passagens, todos os dias 08h-16h (blog, abr/2023). Outros: não achei.
- Sinal: OSM mostra torre de celular na vila; não achei cobertura nas trilhas nem operadora. Não há caixa eletrônico: levar dinheiro.
- Regras: Véu da Noiva proíbe acampar e bebida alcoólica (água da vila é captada ali; já houve coliforme fecal detectado, citado na Wikipédia, data da análise não informada).
- Riscos: poço mais fundo sob a queda da Véu; evitar banho depois de chuva forte (ri7lati); travessia de riacho na estrada de Arapongas em cheia; Sossego tem trecho dentro do rio e pedra; Geladeira é íngreme; Piancó tem duas travessias de rio. "Cabeça d'água": não achei fonte específica sobre Itaitu, tratar como risco genérico e dizer ao app para avisar em chuva.

## Não deu para confirmar
- Coordenadas de Sossego, Geladeira, Piancó, Coxinho, Flores e Village Serra do Cruzeiro, e entradas de trilha de todas.
- Traçado das trilhas (GPX): precisa baixar do Wikiloc com conta, ou o dono/guia gravar. Eu não estimei coordenadas.
- Valores e horários atuais de taxa (maioria é de 2023 a 2025).
- Cobertura de celular nas trilhas; existência de trilhas em Komoot/AllTrails/Strava.
- Se "Village Serra do Cruzeiro" = "Village Vista do Cruzeiro" do Booking.

## Recomendação
1. Usar agora: vila, Véu da Noiva e Arapongas como âncoras reais; Terrarium para o relevo; recorte OSM para ruas e rios.
2. Para as 5 cachoeiras sem coordenada: pedir ao dono para (a) mandar o GPX do Wikiloc dele, ou (b) pedir ao ACAGI os pontos, ou (c) marcar pelo mapa da placa depois, com confiança baixa visível no app.
3. A placa é esquemática: use-a para distâncias e dificuldade, não para posição.

## Fontes principais
- OSM API 0.6 (20/11/2026); https://pt.wikipedia.org/wiki/Itaitu; https://pt.wikipedia.org/wiki/Cachoeira_Véu_de_Noiva_(Itaitu); https://mapcarta.com/19267382; https://aroundus.com/p/163587680-cachoeira-veu-de-noiva
- https://viajecomnorma.com.br/cachoeira-das-arapongas-itaitu-jacobina-ba/ (abr/2023); /cachoeira-do-pinhaco-itaitu-jacobina-ba/ (fev/2023); /cachoeira-veu-de-noiva/ (jan/2023); /visite-itaitu-em-jacobina-ba/ (jul/2023)
- https://booktransfer.com.br/vila-de-itaitu/ (11/02/2026); https://www.campingpayayas.com/ (2026); https://redeglobo.globo.com/redebahia/conexao-bahia/noticia/conheca-a-veu-de-noiva-uma-das-42-cachoeiras-de-itaitu.ghtml (2018); https://www.instagram.com/guiasdeitaitu/
