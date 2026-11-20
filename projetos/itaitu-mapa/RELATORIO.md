# Trilhas de Itaitu · Hora da Serra · RELATÓRIO FINAL (Nimbus, 20/11/2026)

O detalhe de cada tarefa (decisões, medidas, pedidos entre times) está em `RELATORIO-por-tarefa.md`, que é o relatório parcial arquivado sem corte. Este arquivo é o fechamento.

## 1. O que foi feito
App web offline do vale de Itaitu (Jacobina, BA) em `site/itaitu/`, sem servidor e sem dependência nova. O app particular do Marcos está em `site/itaitu/marcos.html`.

- **Hora da Serra (recurso-assinatura):** o mapa 3D mostra o relevo iluminado pelo sol do minuto. A sombra da serra anda no mapa conforme a régua do dia. Em cada poço com coordenada confirmada, a tábua mostra a hora em que a serra tira o sol, o "saia até" e o "volte com luz até".
  - Véu da Noiva em 20/11/2026: sol até 16:05, saia até 14:30, volte com luz até 17:10.
  - Arapongas: sol até 15:40, saia até 13:55.
  - Toda hora de estimativa é múltiplo de 5 min, arredondada para baixo, com a nota "calculado pelo relevo, ±N min".
- **Tábuas honestas:** o estado de cada ponto vem dos dados. Hoje são 13 cachoeiras e poços: 4 confirmados (Véu, Arapongas, Coxinho, Urubu), 1 aproximado (Flores, sem hora) e 8 sem coordenada (Sossego, Geladeira, Piancó, Santuário, Índios, Andorinhas, Riachinho, Sonhos). Estes mostram "vá com guia" e o botão "Chamar um guia", nunca uma hora.
- **Cartão 1080x1920:** gerado no celular, offline, com o relevo desenhado pelo worker, o traçado na cor da marca e a frase "Cheguei HH:MM · a serra apaga o sol HH:MM · N min de sol no poço". Tem versão honesta para quem chega depois da sombra (nunca "0 min"). Sai por Web Share de arquivo ou download.
- **Demo `?demo=1` de 60 s:** dia correndo, voo ao Véu e às Arapongas, trilha simulada e cartão.
- **App:** marca por JSON (`?m=<slug>`, 3 marcas e índice), mapa 3D/2D, satélite/relevo, GPS e bússola, rota, gravador de trilha (IndexedDB, Wake Lock, GPX), SOS (coordenadas em letra grande, SMS de uma parte, 193/192/190), busca offline, modo economia, contraste sol, texto grande, som por Web Audio (tóin da araponga e 3 ambiências), abertura de 5 s.
- **App particular do Marcos:** instalação própria, confirmar posição por média de GPS, gravador de campo, pacote v1 (valida em `scripts/aplicar-pacote.mjs`), vitrine presa por trava, QR e placa PNG/SVG, caderno de vendas e kit, PIN só com hash. A trava é proteção de uso, não cofre.
- **Dados e infraestrutura:** 264 tiles (relevo 10,8 MB e satélite 2016 1,2 MB, z8 a z14), mapa-base com 655 feições, MapLibre 5.24.0 e gerador de QR 2.0.4 (MIT) em `vendor/`, service worker com pré-cache atômico de 356 arquivos (14,5 MB, versão `d8c5c707d4e8`), atribuições visíveis no painel Informações.
- **Kit de venda (fora do git, `projetos/itaitu-mapa/venda/`):** mercado, oferta, proposta de uma página, roteiro da visita, painel de objeções, placa e legenda. O conteúdo não está no repositório.

Gasto: nenhum. Nenhuma imagem comprada, nenhuma API paga.

## 2. Como rodar e testar
```
cd site && python3 -m http.server 8000
# http://localhost:8000/itaitu/                             app do hóspede
# http://localhost:8000/itaitu/?m=demo-village              marca de demonstração
# http://localhost:8000/itaitu/?demo=1&m=demo-village       demo de 60 s
# http://localhost:8000/itaitu/marcos.html                  app do Marcos (PIN no 1º uso)
# ?agora=2026-11-20T13:00 fixa o relógio; ?sw=0 desliga o service worker (só em localhost)

node --test 'projetos/itaitu-mapa/testes/*.test.mjs'       # 41 testes, ~1 s (as aspas são necessárias no Node 22)
node projetos/itaitu-mapa/testes/rodar-tudo.mjs            # tudo, ~4 min (--rapido pula a demo)
node projetos/itaitu-mapa/testes/comparar-com-app.cjs [URL]   # horas da tela x referência independente
node projetos/itaitu-mapa/testes/conferir-app.cjs [URL]       # celular emulado, online e offline
node site/ao-vivo/teste-nucleo.cjs                         # sede ao vivo, não pode quebrar
```
Mudou arquivo em `site/itaitu/`: `node projetos/itaitu-mapa/scripts/gerar-precache.mjs` e copie a versão impressa para `VERSAO_DA_LISTA` no `sw.js`. O `rodar-tudo.mjs` reprova se as duas divergirem.

Instalar no celular: abrir uma vez com sinal e esperar "Pronto para usar sem internet" (14,5 MB). Android/Chrome: "Instalar app". iPhone/Safari: Compartilhar, "Adicionar à Tela de Início".

## 3. Rodada de fechamento (20/11/2026, nesta sessão)
- `node --test 'projetos/itaitu-mapa/testes/*.test.mjs'`: `# tests 41`, `# pass 41`, `# fail 0`.
- `node projetos/itaitu-mapa/testes/rodar-tudo.mjs`: saída 0, última linha `RESULTADO: tudo passou` (testes, pré-cache, `conferir-app.cjs` online e offline, `comparar-com-app.cjs` com `RESULTADO: tudo bateu`).
- `node site/ao-vivo/teste-nucleo.cjs`: `núcleo: 18 verificações ok`.
- Varredura de falso pronto (expressão do `revisor.md`) em `site/itaitu` sem vendor e tiles: zero acerto.
- `git status`: `site/index.html`, `site/ao-vivo`, `site/vendor` e `.github` sem alteração; `pontos.geojson` e `trilhas.geojson` com `git diff` vazio; nenhum `package.json` nem lockfile novo.
- `git ls-files projetos/itaitu-mapa/venda` vazio (a pasta está no `.gitignore`).

## 4. Critérios de aceite

| # | Critério | Status | Prova e ressalva |
|---|---|---|---|
| 1 | Hora de sol: Véu ~16:07 e Arapongas ~15:40; testes passam; horas em múltiplos de 5, para baixo, com nota | **ok, com 2 ajustes** | Motor 967 e 940 min (16:07 e 15:40), 0 min de diferença para a referência independente em Node e para o `sol_serra.py`; 41 testes passam. Na tela: Véu 16:05, Arapongas 15:40. A nota é ±10 min para confiança alta e **±15 min para média** (Arapongas, Coxinho, Urubu), não ±10 para todos: o teste de sensibilidade de 50 m deu até 11 min nesses pontos. O comando `node --test projetos/itaitu-mapa/testes/` (pasta) falha no Node 22 com MODULE_NOT_FOUND, com qualquer conteúdo; o comando que cumpre o critério é o do glob entre aspas. |
| 2 | Regra da recepção (saia até 14:30, volte com luz até) | **ok** | Funções puras de `js/hora/regras.js`, testes do Véu ao longo da tarde (13:00 a 17:00) e das Arapongas (13:55). Volte com luz: 18:10 menos 30 menos 30 = 17:10. |
| 3 | Abre sem erro em 390 px, sem rolagem horizontal, alvos ≥ 44 px, texto ≥ 11 px | **ok (emulador)** | `conferir-app.cjs` e `verificacao-visual` ("Tudo limpo") em 4 configurações. |
| 4 | Régua por teclado e leitor de tela, `#hora-live`, sombra com texto | **ok (automático)** | Setas 5 min, PageUp/PageDown 1 h, Home/End, `aria-valuetext`. **Não verificado** com TalkBack ou VoiceOver. |
| 5 | Offline completo; atualizar só troca versão depois de completa | **ok (emulador)** | `setOffline(true)` após "pronto": mapa, relevo, satélite, sombra, horas, régua, cartão e `marcos.html`. Troca de versão testada: não baixou nenhum tile de novo e deixou um só cache. "Atualizar mapa" com uma versão nova no ar: **não verificado**. |
| 6 | 20 primeiros quadros acima de 30 fps, senão modo parado | **parcial** | A queda para o modo parado está provada (3,2 fps, `parado=true`, horas e frase aparecem paradas). Os 30 fps em aparelho real **não foram verificados**: o Chromium da sessão não tem GPU. Sem o desenho do mapa, a abertura de 5 s correu a 60 fps. |
| 7 | Estados honestos pelos dados; geojson sem diff | **ok** | 8 sem coordenada sem hora e com "Chamar um guia"; Flores tracejada sem hora; 4 confirmados com hora. Os números do critério (3 sem coordenada, Coxinho) estavam velhos: hoje são 8, 1 aproximado e 4 confirmados. Os dois geojson têm diff vazio. |
| 8 | Cartão 1080x1920 offline, frase, km/tempo/desnível, selo, marca, Web Share ou download, cartões distintos | **ok (emulador)** | Gerado offline com a marca do Village; 15:52 dá "13 min de sol no poço"; versões honestas para depois da sombra e sem coordenada; semente muda o recorte. Web Share de arquivo em celular: **não verificado** (no teste caiu no download). |
| 9 | Marca por configuração | **ok** | `padrao`, `demo-village`, `demo-camping` e `indice` existem. Logo, WhatsApp e Instagram vazios, marcados "preencher quando o parceiro autorizar". `?m=` fora do índice cai na padrão sem 404. Os nomes das demos levam "(demonstração)", porque o site é público. |
| 10 | `?demo=1` percorre 60 s sem erro, inclusive à noite | **ok no erro, parcial no tempo** | Sem erro de console do início ao fim; à noite mostra horas de amanhã. No emulador sem GPU a demo terminou em 56 a 75 s, conforme a carga. O fim em 60 s num aparelho real **não foi verificado**. |
| 11 | Movimento reduzido e economia | **ok (emulador)** | Abertura pulada, dia parado, sem som, mapa 2D, sombra a cada 15 min; abertura não repete em menos de 30 min; qualquer toque interrompe. Divergência registrada: em movimento reduzido o tóin e o tic soam ao toque, mas nada toca sozinho. |
| 12 | App particular | **ok, com 3 buracos** | `marcos.html` abre, tem manifest próprio, sem link a partir do app público; confirmar posição grava no IndexedDB; pacote valida; PIN só com hash; kit fora do git. QR: os módulos lidos da tela e do PNG batem um a um com a matriz gerada, **sem leitor independente**. Não verificados: QR impresso lido por Android e iPhone, GPS real, Web Share, trava de 10 min com a tela apagada. |
| 13 | Zero CDN, zero dependência, sem segredo, sem imagem comprada, atribuições visíveis | **ok** | Nenhuma chamada de rede externa em tempo de execução. As URLs `https` no código são o endereço canônico, `wa.me`, `tel:`, `sms:`, o link `maps.google.com` do SMS do SOS (texto enviado, não requisição) e o namespace do GPX. Atribuições (OSM, Terrain Tiles, Sentinel-2 2016 CC BY 4.0, MapLibre, qrcode-generator, Atkinson) saem de `dados/atribuicoes.json` no painel Informações. |
| 14 | Nada fora de `site/itaitu` e `projetos/itaitu-mapa`; sem merge; teste do núcleo passa | **ok** | Ver seção 3. |
| 15 | Linguagem honesta | **ok** | Varredura: "único no mundo" não existe; "mapeamento completo" só aparece como proibição. |
| 16 | RELATORIO com tudo isso | **ok** | Este arquivo e `RELATORIO-por-tarefa.md`. |

**No ar:** não verificado. Nada foi commitado, publicado nem mesclado. A conferência no endereço de produção só vale depois do deploy que o dono autorizar.

## 5. Padrão de entrega, resumo
- Build, lint e testes: ok (seção 3).
- Fluxos principais ponta a ponta no navegador: ok no Chromium emulado.
- Celular e acessibilidade: ok no emulador; leitor de tela, sol real e aparelho físico não verificados.
- Revisor: passou em T1, T4, T5, T8, T9, T10 e T11, com ajustes aplicados. **Não passou** nas correções finais do QA (`js/util.js`, `sos.js`, `marca.js`, `gravador.js`, `hora/*` da rodada de 20/11).
- Segurança (Muralha): **não verificado**. Falta auditar `emVitrine`, a regra do 2º toque no SOS, o PIN e a trava, e o `aplicar-pacote.mjs`.
- Integrações como cinco fatos (registrado, configurado, alcançável, saudável, autorizado): service worker e pré-cache registrados, configurados, alcançáveis e saudáveis no emulador; **não autorizados** para publicar. WhatsApp e Instagram dos parceiros: não configurados (vazios por decisão).

## 6. O que ficou de fora de propósito
Servidor, conta e login do hóspede, analytics, contador de uso, rotas de carro, tiles de ruas com texto, satélite novo (só o de 2016, grátis), qualquer logo ou número real de parceiro, e trilhas gravadas.

## 7. O que falta antes de vender
1. **Caminhada de prova com um guia da ACAGI:** confirmar o Véu e as Arapongas pelo `marcos.html` e gravar a trilha do Coxinho. Hoje nenhuma posição foi conferida em campo. As horas vêm do relevo e de mapas públicos, e o app avisa isso.
2. **Aparelho real:** 30 fps da abertura, som, Web Share, GPS, Wake Lock, SMS e ligação, e a demo em 60 s.
3. **Placa:** imprimir e ler o QR com um Android e um iPhone.
4. **Auditoria da Muralha** e passagem do Crivo nas correções do QA.
5. **Publicar (decisão do dono):** commitar na branch, abrir PR para a `main` (o CI `sede-ao-vivo` roda em PR que mexe em `site/**`), mesclar. Depois, `node projetos/itaitu-mapa/testes/conferir-app.cjs https://centroesportivomtt-ui.github.io/Creat-mtt-studio/itaitu/` e `comparar-com-app.cjs` no mesmo endereço, e abrir num celular com internet móvel.
6. **Dropbox:** a pasta `/Creat.MTT Studio/Creat Nuvem/Trilhas de Itaitu` tem a versão antiga de 4 textos do kit (roteiro, proposta, oferta e mercado) e nenhum `LEIA PRIMEIRO.md`. Mover os 4 para `9 - Versões antigas` e subir os novos exige o "pode" do dono no chat.
7. **Texto do kit:** a frase "trilha não gravada aparece como 'vá com guia'" (proposta, oferta e roteiro) não bate com o app, porque só ponto sem coordenada mostra "vá com guia" (o Coxinho mostra hora sem trilha). Corrigir a frase antes de falar na visita. A linha 9 de `venda/placa-qr.md` também está velha.
8. **Pendências menores:**
   - 6 chaves de texto provisórias (`hora.como_titulo`, `tabuas.titulo_lugares`, `cartao.slogan_padrao`, `cartao.apagou_rotulo`, `cartao.copiar_legenda`, `demo.de_novo`) e o tom de `demo.vitrine*`, para o Verbo.
   - Etiqueta do Véu sob os controles do mapa no celular e atribuição do OSM por cima da faixa "saia até" com o painel aberto, para o Pixel.
   - Comentário da linha 2 de `testes/textos.test.mjs` com o comando de pasta, que não funciona.
   - Falta um passo dos testes do Itaitu no CI e um script `test` (exige `package.json`, que é do devops e está fora do escopo).
   - 2 horas sem referência externa: Coxinho 16:49 e Urubu 16:36 vêm só do cálculo do app e da referência em Node (o `sol_serra.py` não foi rodado nesses pontos).

## 8. Licenças
OpenStreetMap (ODbL), Terrain Tiles (Mapzen/AWS Open Data), Sentinel-2 cloudless 2016 da EOX (CC BY 4.0), MapLibre 5.24.0 (BSD-3-Clause), qrcode-generator 2.0.4 (MIT), Atkinson Hyperlegible Next (OFL). Textos e hashes em `site/itaitu/vendor/` e `site/itaitu/dados/atribuicoes.json`.

## 9. Formato do kit v1 (o conteúdo nunca entra no repositório)
Arquivo `.json` importado na aba Venda do `marcos.html`, atrás do PIN, guardado só no IndexedDB. O esquema completo está na seção "T9" de `RELATORIO-por-tarefa.md` e na seção 7 de `ARQUITETURA.md`.

## 10. Lição da rodada
- Número que vem de dado se conta no arquivo e na tela, nunca se copia da pesquisa: o kit dizia "5 das 7 sem coordenada" e a conta real era 8 de 13. Prova: script de contagem em `pontos.geojson` e a lista de 13 tábuas em 390 px.
- Teste local verde não é "no ar": `node --test <pasta>` falhava no Node 22 e o glob passava. Prova: MODULE_NOT_FOUND e `# pass 41`.
- Limite medido sem o pior caso engana: a nota ±10 min só ficou honesta depois do teste de 50 m, que deu 11 min em ponto de confiança média.

## Conselho do Diretor
- **Venda:** o app já demonstra o diferencial (a hora em que a serra tira o sol do poço, com a marca da pousada) e roda sem sinal. Leve a vitrine do `marcos.html` e fale só com a frase da seção 2 do roteiro. Diga o número da lista "Cachoeiras" do dia, nunca "mapeamento completo".
- **Antes de mostrar ao dono da pousada:** faça a caminhada de prova com o guia e publique com a conferência no ar. Sem isso, a demo roda, mas a promessa "calculado pelo relevo" não tem uma conferência em campo para sustentar.
- **Decisão sua:** autorizar o PR e o deploy, e autorizar mover os 4 textos do Dropbox.
