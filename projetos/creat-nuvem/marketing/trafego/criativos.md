# Criativos de tráfego · Porta Aberta · 6 briefs

Paleta (designer), 09/11/2026. Complementa `../anuncios.md` (textos A a E e W) e `../roteiros-video.md` (R1 a R3, 15 s). Não repete nada deles: os textos de anúncio continuam lá; aqui estão a imagem, o roteiro cena a cena e as peças prontas.

**Como isto ajuda a vender:** o anúncio de preço direto da conta saiu cerca de 14x mais caro por clique que o Reel com gancho de dor (R$ 74,87 → 345 cliques, CPC ~R$ 0,22; dado da conta act_4078332059160918, briefing de 09/11/2026). Os 6 criativos abaixo mostram a prova (ver o site pronto e testar o pedido no próprio WhatsApp antes de pagar) que não apareceu nas duas páginas de concorrentes que o Radar leu (Vokel e Vicine). Isso não diz o que os concorrentes anunciam: a Biblioteca de Anúncios da Meta deu HTTP 403 e não foi consultada, em 3 conceitos de formato e ângulo realmente diferentes, porque o algoritmo atual trata a mesma imagem com texto diferente como quase o mesmo criativo (E-Commerce Brasil, 25/06/2026, alegação de blog).

| código | formato | conceito | ângulo do texto (`anuncios.md`) | status |
|---|---|---|---|---|
| R4 | Reel 9:16, 26 s + corte de 15 s | A placa ao vivo (demonstração de tela) | A · prévia | roteiro pronto, gravar |
| R5 | Reel 9:16, 24 s + corte de 15 s | O pedido chega no seu WhatsApp | A3 · W1 | roteiro pronto, gravar |
| R6 | Reel 9:16, 28 s + corte de 15 s | Cena de dor + a equipe na sede | C · W1 | roteiro pronto, gravar (2 versões) |
| S1 | estático 1080x1080 | A porta de vidro: placa ABERTO sobre a sede | A2 | **arquivo pronto** |
| S2 | estático 1080x1920 | A porta de vidro, versão Stories/Reels | A2 · W1 | **arquivo pronto** |
| K1 | carrossel 5 cards 1080x1080 | Do nome ao pedido, em 5 passos | A1 · B3 | brief pronto, montar |

Os códigos R4 a R6 continuam a série de `roteiros-video.md`. Os estáticos usam S e o carrossel K para não colidir com o ângulo E de `utm.md`. O `utm_content` segue a régua de `utm.md`: `<texto>-<nicho>-v<versão>`, e o nome do arquivo de mídia acompanha (ex.: `R4-barbearia-v1.mp4` com o texto `A2-barbearia-v1`).

---

## 1. Identidade nas peças

Conceito: **A porta de vidro**. A placa da vitrine vira de FECHADO para ABERTO pendurada no vidro da porta; pelo vidro se vê a sede 3D com a equipe trabalhando. Junta as duas provas da casa numa imagem só: o produto (a placa e a prévia) e o processo (a sede).
Ousadia em um lugar só: a placa virando. O resto fica calmo: céu, tinta e um único amarelo.

| token | valor | papel no criativo |
|---|---|---|
| `--ceu` | `#CDEBFF` | fundo de todas as peças e quadros finais |
| `--tinta` | `#1E1B2E` | texto, contorno de nanquim (6 px no estático, 4 px na legenda de vídeo) e sombra dura |
| `--sol` | `#FFC93C` | a única cor de ação: palavra-chave do título, chip "Grátis para ver", faixa de legenda |
| `--papel` | `#FFFDF6` | selos ("nome fictício", "1 toque"), nuvens, cartões |
| `--lousa` / `--giz` | `#22322D` / `#F4F1E6` | face ABERTO da placa e o nome em giz |
| `--madeira` | `#D39A5B` | tábua FECHADO e moldura da porta |

- **Fontes:** Lilita One só no título e na palavra da placa; Figtree 600/800 no texto; JetBrains Mono 500 nos selos e rótulos ("prévia real", "nome fictício", "sede da Creat · demonstração"). Todas do Google Fonts, as mesmas da vitrine (`assets/tokens.css`).
- **Escala (canvas 1080 px de largura):** título 94 px (feed) e 122 px (Stories); legenda de vídeo 64 a 72 px; texto 28 a 36 px; selo 22 px. Nada abaixo de 22 px.
- **Contorno e sombra:** borda de nanquim de 6 px e sombra dura `10px 10px 0 #1E1B2E`. Nunca sombra borrada, nunca degradê, nunca brilho.
- **Legenda queimada em vídeo:** Lilita One 64 px mínimo, tinta sobre faixa `--sol` com contorno de 4 px, no máximo 2 linhas de 18 caracteres. Uma frase por cena.
- **Área segura 9:16 (regra mais conservadora entre as duas fontes):** nada de texto ou marca nos 14% de cima (269 px), nos 35% de baixo (672 px) nem nos 6% laterais (65 px). Texto só entre y 269 e y 1248. Fontes: CineRads (lendo o Guia de Anúncios da Meta, 07/09/2026) e Digital Applied (02/02/2026). Guia visual em `saida/S2-placa-porta-1080x1920-guia.png` (linha tracejada vermelha).
- **Tamanho de vídeo:** exportar 1440x2560 (especificação 2026 citada pela CineRads) com cópia 1080x1920. 30 fps, H.264.
- **Honestidade (regra dura):** nome fictício com o selo "nome fictício" sempre que aparecer; "prévia real" só sobre print verdadeiro, e todo print ou gravação da sede leva "sede da Creat · demonstração" (hoje a sede pública é demonstração; "tela real" sozinho sugere acompanhamento ao vivo, que não existe); número de WhatsApp sempre de teste e coberto pela faixa "número de teste"; sede gravada em `?modo=demo` mantém a legenda "Demonstração" visível.

### Proibido em todas as peças
Preço, prazo, promessa de ganho ou de resultado, "agenda", pergunta sobre quem vê ("Você é dono...?", "Cansado de...?"), afirmação sobre o estado do negócio de quem vê, antes e depois, depoimento, estrela, logo do WhatsApp ou da Meta alterado (usar o balão próprio da vitrine), tela piscando, música fora da Sound Collection da Meta, emoji. Fontes: `../anuncios.md` (conferência de 08/11/2026) e Padrões de Publicidade da Meta (lidos em 09/11/2026).

---

## 2. Prints reais usados

Todos existem no repositório. Os de `saida/prints/` foram capturados hoje do código atual da vitrine, em 390x844 com escala 3 (1170x2532), pelo script `estaticos/capturar-prints.cjs`.

| arquivo | o que mostra | usado em |
|---|---|---|
| `projetos/creat-nuvem/assets/img/sede-ilha.webp` (= `projetos/loja/assets/sede-ilha.webp`) | a ilha da sede, 15 agentes nas mesas, letreiro CREAT NUVEM | S1, S2, R6, K1 card 4 |
| `projetos/creat-nuvem/assets/img/sede-ao-vivo.webp` | sede com o painel "Operações", AO VIVO e etapas | R6 cena 4, K1 card 4 |
| `projetos/creat-nuvem/assets/img/sede-ficha-agente.webp` | close do Pixel com a ficha do agente | R6 cena 5 |
| `projetos/creat-nuvem/assets/img/sede-celular-escuro.webp` | ficha da Órbita no celular, tema escuro | R6 alternativa 9:16 |
| `projetos/creat-nuvem/assets/svg/placa-fechado.svg`, `placa-aberto.svg`, `corrente.svg` | a placa vetorial da vitrine (nome em giz editável) | S1, S2, K1 cards 1 e 2, quadro final dos Reels |
| `saida/prints/home-fechado.png` | hero da home com a placa FECHADO, celular | R4 cena 1, K1 card 1 |
| `saida/prints/previa-barbearia-topo.png` | prévia "Barbearia Navalha Fictícia", topo com a navalha | S1, S2, R4, K1 card 2 |
| `saida/prints/previa-barbearia-servicos.png` / `-pedido.png` | texto da casa e o seletor de dia e horário | R4 cena 4, K1 card 3 |
| `saida/prints/previa-salao-*.png`, `previa-academia-*.png` | as mesmas telas nos nichos salão e academia | versões por nicho de R4, K1 |
| `saida/prints/whatsapp-pedido-chega.png` | celular desenhado com "Pedido pelo site da Barbearia Navalha Fictícia" e a mensagem de exemplo | R5 cena 3, K1 card 3 |
| `saida/prints/home-teste-whatsapp.png` | o formulário "Enviar o teste para o meu WhatsApp" e o celular | R5 cena 2 |

---

## 3. Reels (9:16)

Duração: o briefing pede 20 a 30 s. A Meta recomenda 6 a 15 s para vídeo no Feed e menos de 10 s em Stories (Central de Ajuda, página 188534925073536, lida em 09/11/2026). Por isso cada Reel tem um **master de 24 a 28 s** e um **corte de 15 s** já marcado na coluna "corte". Sobem os dois no mesmo conjunto; a Meta escolhe e a leitura diz qual duração vence. Hipótese, não fato.

Estrutura comum (Meta + Digital Applied, 02/02/2026): gancho com movimento no primeiro quadro e a marca nos 3 primeiros segundos, demonstração, uma chamada só. Legível sem som. Texto principal do anúncio curto (40 a 44 letras visíveis em Reels segundo a CineRads; conferir no Gerenciador).

Gravação de tela: Chromium da skill `navegador` em 390x844 com escala 3, ou o celular real com gravação nativa. Som de interface: o sino da placa e o "plim" do WhatsApp são sintetizados pela própria vitrine (`assets/som/creat-som.js`); gravar o áudio da aba com o som ligado.

### R4 · A placa ao vivo (26 s · corte de 15 s)

Para quem: dono de barbearia, salão ou academia rolando o Reels. Dor: não ter onde o cliente peça horário sem ligar. Prova: o site aparece pronto com o nome dele. Próximo passo: digitar o nome.
Gancho a testar (2 versões dos 3 primeiros segundos, mesmo corpo): **G1** a placa FECHADO balançando já no quadro 1 e o polegar entrando; **G2** o nome sendo digitado letra a letra no quadro 1.

| tempo | quadro | ação / câmera | texto na tela | som | corte 15 s |
|---|---|---|---|---|---|
| 0,0 a 2,5 | Home no celular (`home-fechado.png`), placa FECHADO balançando, selo da marca Creat Nuvem no topo da área segura | G1: polegar entra e toca o campo. G2: abre já digitando | **Digitei o nome da barbearia** | sino suave da placa | 0,0 a 2,5 |
| 2,5 a 6,0 | "Barbearia Navalha Fictícia" aparece letra a letra, giz na borda da placa | digitar em ritmo real, sem acelerar | selo "nome fictício" | teclas leves | 2,5 a 5,0 |
| 6,0 a 8,5 | a placa gira com mola e mostra ABERTO com o nome em giz | arrastar a placa para baixo; manter 1 s parado no ABERTO | **e a placa virou** | sino forte, um toque | 5,0 a 7,0 |
| 8,5 a 14,0 | a prévia sobe em tela cheia (`previa-barbearia-topo.png`), rolar devagar até o texto da casa | rolagem lenta e contínua | **O site pronto, com o nome dele** · faixa "Prévia · serviços e preços são exemplo" visível 1 s | trilha entra | 7,0 a 10,0 |
| 14,0 a 19,0 | seletor de dia e horário (`previa-barbearia-pedido.png`); tocar "ter 10", "10h" | toques visíveis com círculo de toque | **O cliente escolhe dia e horário** | clique seco por toque | fora |
| 19,0 a 22,0 | botão "Testar no meu WhatsApp"; corte seco para o balão do pedido | tocar e cortar no "plim" | **O pedido chega no seu WhatsApp** | plim | 10,0 a 12,5 |
| 22,0 a 26,0 | quadro final: fundo `--ceu`, placa ABERTO com corrente, chip amarelo "Grátis para ver · Sem cadastro", botão desenhado "Abrir meu negócio" | parado | **Digite o nome do seu negócio** | trilha fecha | 12,5 a 15,0 |

Versões: uma por nicho (barbearia, salão com "Salão Esmalte Fictício", academia com "Studio Barra Fictícia" e "aula experimental"). Texto principal curto: "Digite o nome e veja o site pronto" (34). Título: "Vire a placa da barbearia para ABERTO". Destino: célula A (home com `?nicho=`).
Trilha: Meta Sound Collection, busca "ukulele" ou "acoustic upbeat", 100 a 115 BPM, sem voz; entra em 8,5 s embaixo do sino, a −18 dB.

### R5 · O pedido chega (24 s · corte de 15 s)

Para quem: quem já ouviu falar de site e acha que é só vitrine parada. Dor: pedido de horário perdido no meio das mensagens. Prova: o próprio dono faz o teste e o pedido chega no WhatsApp dele. Próximo passo: abrir a conversa (célula B) ou digitar o nome (célula A).
Ganchos: **G1** tela do celular com a notificação "Pedido pelo site da Barbearia Navalha Fictícia" já no quadro 1 (movimento: o balão entrando); **G2** relógio "23:12" no topo da tela e o balão chegando.

| tempo | quadro | ação / câmera | texto na tela | som | corte 15 s |
|---|---|---|---|---|---|
| 0,0 a 3,0 | `whatsapp-pedido-chega.png` em tela cheia, o balão "Olá! Quero pedir um horário: Corte, amanhã às 10:00" entrando | G1: balão sobe com mola; G2: relógio 23:12 visível | **O horário chega assim** | plim | 0,0 a 3,0 |
| 3,0 a 7,0 | volta para a prévia: o cliente escolhendo serviço, dia, horário | rolagem e toques | **pedido pelo site da barbearia** · selo "nome fictício" | cliques | 3,0 a 6,0 |
| 7,0 a 12,0 | `home-teste-whatsapp.png`: o dono digita o próprio número (de teste, coberto pela faixa "número de teste") e toca "Enviar o teste para o meu WhatsApp" | gravação real do fluxo | **Teste no seu próprio WhatsApp** | — | 6,0 a 9,0 |
| 12,0 a 16,0 | o WhatsApp abre com o pedido pronto; dedo segura no "enviar" | corte seco no plim | **antes de pagar qualquer coisa** | plim | 9,0 a 11,5 |
| 16,0 a 20,0 | prévia rolando no nicho; faixa "Prévia · exemplo" | rolagem | **Ver é grátis. Sem cadastro.** | trilha | fora |
| 20,0 a 24,0 | quadro final `--ceu`: celular desenhado com o balão + placa ABERTO pequena + botão "Enviar mensagem" desenhado (célula B) ou "Abrir meu negócio" (célula A) | parado | célula B: **Toque e receba o link no chat** · célula A: **Digite o nome do seu negócio** | trilha fecha | 11,5 a 15,0 |

A Meta pede que o criativo de conversa deixe claro que o toque abre um chat (Central de Ajuda, página 269324800441478, lida em 09/11/2026): na célula B a última legenda diz "no chat" e o botão é **Enviar mensagem**. Texto principal curto: "Teste o pedido no seu WhatsApp" (30). Destino: célula B, WhatsApp 5575981151202, mensagem pré-preenchida "Oi! Quero ver o site da minha barbearia pronto." (código do vídeo no início, ex. "R5:", para atribuir a venda à mão até existir API).
Trilha: Sound Collection, "lo-fi" ou "soft funk", 90 a 100 BPM; o plim fica 6 dB acima da trilha.

### R6 · A cena e a equipe (28 s · corte de 15 s)

É a família do Reel que deu CPC ~R$ 0,22 (gancho de dor). A dor é contada como **cena** com personagem fictício, nunca como afirmação sobre quem assiste (regra de atributo pessoal da Meta e regra da casa).
Duas versões, porque `anuncios.md` proíbe "foto de pessoa":
- **R6a · fala para a câmera** com o Marcos (ele é o dono da Creat, não cliente; precisa do OK dele para abrir essa exceção à regra do kit). Selfie vertical, luz de janela, sem cenário montado.
- **R6b · sem pessoa**: mãos segurando o celular e telas. Pronto para gravar já.

| tempo | quadro | ação / câmera | texto na tela | som | corte 15 s |
|---|---|---|---|---|---|
| 0,0 a 3,0 | R6a: Marcos olhando para a câmera, celular na mão. R6b: mão segurando celular com mensagem "Tem horário amanhã?" chegando às 23:12 | movimento no quadro 1: o celular entra na tela | **23h. Um cliente quer horário amanhã.** | notificação | 0,0 a 3,0 |
| 3,0 a 7,0 | a mensagem fica sem resposta; a tela apaga e acende (sem piscar: um único fade de 400 ms) | dedo some do quadro | **e a mensagem ficou sem resposta** | silêncio de 1 s | fora |
| 7,0 a 11,0 | corte para a prévia: o cliente fictício escolhe "Corte · ter 10 · 10h" sozinho | rolagem e toques | **Com o site, ele mesmo pede** | cliques | 3,0 a 6,0 |
| 11,0 a 15,0 | o balão do pedido chega (`whatsapp-pedido-chega.png`) | corte seco | **e o pedido espera no WhatsApp** | plim | 6,0 a 8,5 |
| 15,0 a 20,0 | a sede: `sede-ilha.webp` com zoom lento de 6% até o letreiro CREAT NUVEM; depois `sede-ao-vivo.webp` com o painel "Operações" | Ken Burns lento, sem tremer | **Quem monta: esta equipe** · selo "sede da Creat · demonstração", visível o tempo todo (hoje a sede pública mostra demonstração, `RELATORIO.md`) | trilha entra | 8,5 a 11,5 |
| 20,0 a 23,5 | `sede-ficha-agente.webp`: o Pixel na mesa, ficha "Telas rápidas, responsivas" | aproximação curta | **A equipe que monta o site** · selo "demonstração" | — | fora |
| 23,5 a 28,0 | quadro final `--ceu`: placa ABERTO + chip "Grátis para ver · Sem cadastro" | parado | **Digite o nome e veja o seu pronto** | trilha fecha | 11,5 a 15,0 |

Cuidados: a legenda era "e a barbearia já fechou", que, ao lado do público de donos de barbearia, pode ser lida como afirmação sobre o negócio de quem vê. Trocada em 09/11/2026 por "e a mensagem ficou sem resposta", que descreve só a cena. Na sede, só prints reais; grave com `?modo=demo` e mantenha "Demonstração" visível o tempo todo; não mostrar pedido real de outro cliente. Texto principal curto: "Seu cliente pede horário sozinho" (32). Título: "Conheça a equipe que monta o site" ("Assista ao seu site sendo montado" saiu em 09/11/2026: a sede pública é demonstração e a publicação ao vivo não existe, então "assista" não bate com a página).
Trilha: Sound Collection, "piano minimal" de 0 a 7 s, virando "indie pop" a partir de 15 s; na R6a, a fala do Marcos com ducking da trilha a −20 dB e limpeza de voz por IA se gravado sem microfone (regra de vídeo da casa).

---

## 4. Estáticos (prontos)

Gerados por HTML + Playwright, com os SVGs e prints reais. Fonte: `estaticos/feed-1080x1080.html`, `estaticos/stories-1080x1920.html`, `estaticos/base.css`, `estaticos/montar.js` (monta a placa a partir dos SVGs da vitrine e escreve o nome em giz). Para refazer: `node projetos/creat-nuvem/marketing/trafego/estaticos/renderizar.cjs` (acrescente `--guia` para a versão com a área segura marcada).

### S1 · A porta de vidro · 1080x1080 (Feed)
Arquivo: `saida/S1-placa-porta-1080x1080.png`

Ordem de leitura: marca "Creat Nuvem · Porta Aberta" → título "Digite o nome. Vire a **placa.**" (a palavra placa no bloco amarelo, girado −2°) → mini placa FECHADO no canto, com seta pontilhada e selo "1 toque" até a placa grande → a porta: moldura de madeira, vidro com a sede real, placa ABERTO pendurada pela corrente com "Barbearia Navalha Fictícia" em giz, selos "nome fictício" e "sede da Creat · demonstração" (corrigido e renderizado de novo em 09/11/2026; antes dizia "tela real") → o celular com a prévia real, selo "prévia real" → rodapé: chip "Grátis para ver · Sem cadastro" e "O site pronto, com pedido de horário no seu WhatsApp."
Texto do anúncio: A2 do nicho. Destino: célula A.

### S2 · A porta de vidro · 1080x1920 (Stories e Reels)
Arquivos: `saida/S2-placa-porta-1080x1920.png` e a conferência `saida/S2-placa-porta-1080x1920-guia.png`

Mesmo conceito, empilhado: nuvens nos 14% de cima (sem texto) → marca → título 122 px → chip → porta grande com a placa e a sede, mini FECHADO à direita com "1 toque" → o celular com a prévia sangrando para a faixa de baixo (só imagem nos 35% de baixo, onde ficam os botões do Instagram). Todo texto e marca ficam entre y 290 e y 1236, dentro da área segura.
Texto do anúncio: A2 (célula A) ou W1 (célula B, botão Enviar mensagem).

Verificação: renderizados sem erro de console nem recurso faltando; prints conferidos a olho (alinhamento, contraste, nome dentro da lousa). `verificacao-visual` em desktop sem problema; no celular aponta rolagem horizontal, esperado porque a página é uma tela fixa de 1080 px que serve de matriz de imagem, não página pública. Variações por nicho: troque `data-nome` e o print da prévia no HTML e renderize de novo.

### Tentativa no Canva do dono (registro)
O MCP do Canva funcionou (`create-design`), com o mesmo brief e sem brand kit:
- S1: https://canva.link/oxgeony5h3eerur · exportado em `saida/canva/canva-S1-1080x1080.png`
- S2: https://canva.link/i35stqacky96lye · exportado em `saida/canva/canva-S2-1080x1920.png`

Avaliação: **não usar o Canva-S2 em anúncio.** Ele inventou uma "sede" com personagens que não são os da Creat e um letreiro ilegível ("NIVM"), o que contraria a regra de mostrar o processo real, e põe texto dentro dos 35% de baixo. O Canva-S1 está correto no texto, mas sai do sistema (fonte de título genérica, placa de outro desenho, sem a sede); serve só como variação de formato se a leitura pedir mais um criativo. As peças oficiais são S1 e S2 do Playwright. O Canva não recebe arquivo local por estes MCPs (só URL pública), por isso não deu para levar os prints reais até lá.

---

## 5. K1 · Carrossel "Do nome ao pedido" · 5 cards 1080x1080

Para quem: quem para para ler no Feed. Cada card é um passo real do produto; a sequência é verdadeira (é o fluxo da vitrine), então a numeração tem motivo. Mesmo sistema de S1: fundo `--ceu`, contorno 6 px, sombra dura, título Lilita 84 px no topo, um elemento de prova por card. Margem de 64 px. Texto do anúncio: A1 do nicho. Título do carrossel: "Veja seu negócio aberto na internet". Fonte das telas: `saida/prints/`.

| card | título (Lilita) | imagem | apoio (Figtree 32 px) | selo |
|---|---|---|---|---|
| 1 | Digite o nome. | `home-fechado.png` recortado no campo do nome + placa FECHADO vetorial balançando (inclinada 3°) | "Barbearia, salão ou academia." | — |
| 2 | Vire a placa. | placa ABERTO vetorial grande com "Barbearia Navalha Fictícia" em giz, a corrente saindo do topo do card | "Um toque, e ela abre." | nome fictício |
| 3 | Veja o site pronto. | celular com `previa-barbearia-topo.png` e, sobreposto 30%, `previa-barbearia-pedido.png` | "Serviços, dia e horário. Prévia de exemplo." | prévia real |
| 4 | Teste no seu WhatsApp. | `whatsapp-pedido-chega.png` + ao fundo, no vidro de uma porta pequena, `sede-ilha.webp` | "O pedido chega como vai chegar do cliente. A equipe que monta o site aparece na sede (demonstração)." | sede da Creat · demonstração |
| 5 | Só paga se gostar. | quadro final: placa ABERTO + chip "Grátis para ver · Sem cadastro" + botão desenhado "Abrir meu negócio" | "A mensalidade só começa com o site no ar." | — |

Regras: sem preço (a mensalidade é citada sem valor, como em B3, e a página mostra os valores antes do Pix); seta desenhada à direita nos cards 1 a 4 indicando que continua; o card 1 sozinho já precisa vender (é o único que muita gente vê). Para montar: copie `estaticos/feed-1080x1080.html` cinco vezes, troque o miolo, acrescente a linha em `PECAS` do `renderizar.cjs` e renderize.

---

## 6. Plano de teste (resumo para o Gerenciador)

- 1 campanha, 1 conjunto, criada **pausada** (regra da casa). Até 10 criativos por conjunto, teste de no mínimo 4 dias e campanha de 7 dias antes de decidir (Meta, página 188534925073536).
- Célula A (home com `?nicho=` e Pixel 2223314621951948): R4 G1, R4 G2, S1, K1. Célula B (Enviar mensagem): R5 G1, R6b, S2. R6a entra só com o OK do Marcos.
- Medir taxa de gancho (reproduções de 3 s ÷ impressões; acima de 25% forte, abaixo de 15% fraca, segundo Digital Applied, 02/02/2026, blog de agência) e trocar o gancho antes do corpo. Decidir por custo por Pix pago, não por clique.
- Antes de subir: Lupa faz a segunda leitura das legendas contra `anuncios.md`; conferir no Gerenciador o limite real do texto principal em Reels.

## 7. O que falta e de quem depende

1. **Gravar R4, R5 e R6b** (tela real; roteiro acima). Sem custo. Pode ser feito pelo Órbita com o `navegador` + gravação de vídeo do Playwright, ou pelo Marcos no celular.
2. **R6a**: decisão do Marcos de aparecer no vídeo (abre exceção à regra "sem foto de pessoa" do kit).
3. **Trilhas**: escolher na Meta Sound Collection dentro do Gerenciador (única biblioteca aceita em Reels de anúncio); nenhuma trilha paga foi usada.
4. **K1**: montar os 5 cards a partir do HTML do S1 (cerca de 1 h).
5. **Pré-requisito de venda**: o botão Pagar de `/abrir/` ainda cai no WhatsApp; ver o plano de checkout Mercado Pago na inteligência desta rodada antes de ativar mídia.

## 8. Arquivos

```
projetos/creat-nuvem/marketing/trafego/
  criativos.md                         este arquivo
  estaticos/
    base.css                           tokens e componentes das peças
    montar.js                          monta a placa a partir dos SVGs reais
    feed-1080x1080.html                fonte do S1
    stories-1080x1920.html             fonte do S2 (com guia de área segura)
    renderizar.cjs                     gera os PNG (Playwright)
    capturar-prints.cjs                captura os prints reais da vitrine
  saida/
    S1-placa-porta-1080x1080.png       estático feed, oficial
    S2-placa-porta-1080x1920.png       estático Stories/Reels, oficial
    S2-placa-porta-1080x1920-guia.png  conferência da área segura (não subir)
    canva/canva-S1-1080x1080.png       versão Canva, só reserva
    canva/canva-S2-1080x1920.png       versão Canva, não usar
    prints/                            12 prints reais da vitrine (1170x2532 e recortes)
```
