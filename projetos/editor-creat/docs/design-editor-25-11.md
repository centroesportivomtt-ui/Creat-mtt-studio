# Design do editor creat.MTT: auditoria e redesenho (25/11)

Pedido do dono, com as palavras dele: melhorar "design e apresentação do próprio editor… a questão dos botões, da apresentação… da parte toda de estrutura… dos botões para poder entrar corretamente, a parte interna, do dinamismo, enfim, tudo". Ele usa **só pelo celular**.

Como ajuda a vender: o editor é a fábrica dos Reels que trazem cliente para a creat.MTT. Cada toque a menos e cada dúvida a menos no celular é filme saindo mais rápido, sem o dono operar.

- Autor: Paleta (designer). Nada de código do site ou do motor foi mudado. Os únicos arquivos criados são este documento e os prints.
- **Prints desta auditoria:** `apps/web/.verificacao/design-25-11/` (pasta ignorada pelo git). Foram tirados em 390x844 (celular) nos temas escuro e claro e em 1440x900 (desktop), percorrendo o fluxo inteiro com o motor falso. O nome segue o padrão `NN-<tema>-<tela>.png`, por exemplo `14-dark-entregue-topo.png`. Também estão lá `audit-dark.json` e `audit-light.json` (alvos de toque abaixo de 44 px e textos abaixo de 13 px, por tela).
- Prints de página inteira do aceite oficial: `apps/web/.verificacao/aceite/` (build de 25/11 01:30, o mesmo código de hoje).
- Caminhos relativos a `projetos/editor-creat/`.

---

## (a) Diagnóstico por tela

### O que já está certo (fica)
- Todo alvo de toque mede 44 px ou mais (auditoria automática: zero violações nas 7 telas). Os campos usam fonte de 16 px, então o iPhone não dá zoom.
- O conceito "Ilha de edição", com o timecode em Anton, tem personalidade e conversa com o mundo do vídeo. A claquete no Aprovar é um bom gesto.
- Existe `prefers-reduced-motion`, os textos estão em português claro na maior parte e não há rolagem lateral.

O problema não é acabamento. É **estrutura**: a tela não diz qual é o próximo toque, o âmbar está em tudo e a coisa mais importante (o filme pronto) fica na terceira tela de rolagem.

### Os 10 problemas mais graves (ordem de impacto para o dono)

| # | Tela | Problema concreto | Print |
|---|---|---|---|
| 1 | Projeto entregue | **O filme pronto está a cerca de 1.050 px do topo no celular.** Aprovar e Baixar ficam a cerca de 2.000 px, embaixo de um bloco técnico de QA ("✕ voz de fora", "semelhança 0.30", "Olho de IA: custo US$ 0.12"). No desktop o player também abre abaixo da dobra. Quem abre um projeto entregue quer assistir e decidir, mas a tela ainda mostra o relógio e 6 passos concluídos. | `15-dark-entregue-inteiro.png`, `14-dark-entregue-topo.png`, `17-dark-entregue-botoes.png`, `27-dark-desk-projetos_p_*.png` |
| 2 | Projeto (envio e pedido) | **Começar a edição exige dois toques em pontas opostas da página:** "Terminei de enviar" no cartão 01 e "Mandar pedido" no fim do 02, cerca de 1.700 px abaixo. Nenhum dos dois avisa que falta o outro. O botão "Terminei de enviar" fica apagado, sem dizer por quê (lacunas 23 e 44). | `05-dark-projeto-vazio.png`, `10-dark-mandar.png`, `06-dark-projeto-vazio-inteiro.png` (4.091 px de altura) |
| 3 | Todas (cabeçalho) | **O menu ocupa 115 px no topo e quebra em duas linhas** (Projetos, Caderno, Gastos, Sair). É o canto mais difícil de alcançar com o polegar, "Sair" tem o mesmo peso visual de "Projetos" e não há "Novo" à mão. Ao rolar, 14% da tela fica tomada por esse menu. | `03-dark-projetos.png`, `13-dark-ao-vivo-rolado.png` |
| 4 | Projeto (envio fechado) | **Depois de fechar o envio, a área de envio continua dominando a tela.** "Solte o material aqui" (gesto de arrastar, que não existe no celular), o botão "Escolher arquivos" e o campo de links seguem visíveis com o projeto já em "Lendo". O dono não sabe se ainda deve mandar algo. | `11-dark-fechado-topo.png` |
| 5 | Sistema de cor | **O âmbar está em tudo:** botão principal, opção marcada (todo chip "O editor decide"), sobretítulo, números 01/02, timecode, passo atual e borda de foco. Quando tudo é destaque, nada é. O botão principal não se separa das escolhas já feitas, e numa pergunta com 4 opções o olho cai na opção padrão, não no "Mandar pedido". | `09-dark-perguntas.png`, `04-dark-novo.png` |
| 6 | Pedido | **Formulário longo de cartão dentro de cartão:** um quadro tracejado dentro de outro cartão, com 7 perguntas e de 3 a 6 chips cada, numa rolagem de cerca de 1.400 px. Falta progressão: tudo aparece de uma vez, sem resumo do que foi escolhido. O campo de links mostra o texto de exemplo cortado ("link de pasta…"). | `09-dark-perguntas.png`, `05-dark-projeto-vazio.png` |
| 7 | Ilha ao vivo | **A trilha de 6 passos mostra textos que confundem:** "Aguardando material" aparece marcado com a frase "C0016.MP4: quadros-chave e áudio prontos", e "Lendo" diz "Falta o pedido." depois que o pedido já foi feito. "arquivo(s)" é linguagem de sistema. A régua dos 30 minutos mal se vê: em 00:50 a barra feita tem 4 px e as marcas se empilham no zero. | `12-dark-ao-vivo-montando.png`, `14-dark-entregue-topo.png` |
| 8 | Caderno | **Uma página de 9.075 px**, ou seja, 11 telas de rolagem. Backup, Biblioteca e respostas de clientes ficam escondidos no fim, sem índice. A numeração pula ("01", "01b") e textos de 11 px trazem jargão ("segura a entrega · dono 17/11/…") (lacuna 27). | `23-dark-caderno-inteiro.png`, `21-dark-caderno.png` |
| 9 | Contraste e feedback | No tema claro, o texto escuro sobre o verde do Aprovar (`#06150c` sobre `#24733b`) dá **3,2:1** e reprova no AA. A claquete preta some sobre o verde. Os passos futuros, com opacidade 0,62, ficam em 3,7:1 no escuro e 2,9:1 no claro. O detalhe do QA só aparece em `title`, que não existe no toque. Nenhuma ação dá retorno além do próprio botão: não há toast de "link copiado", "pedido recebido" ou "aprovada". | `17-light-entregue-botoes.png`, `12-light-ao-vivo-montando.png` |
| 10 | Estados vazios e de espera | O player vazio é um retângulo listrado de 9:16 que ocupa uma tela inteira e diz "aparece aqui só depois de passar no QA" (jargão). A lista vazia é uma caixa tracejada centralizada e genérica. A lista cheia não tem capa, duração nem selo "esperando você". O "Diário da ilha (30)" fechado é um cartão de 80 px sem nada dentro. | `13-dark-ao-vivo-rolado.png`, `03-dark-projetos.png`, `03-light-projetos.png` |

### Por tela (o resto, em ordem de toque)

**Entrar** (`01-dark-entrar.png`, `02-dark-entrar-erro.png`, `01-light-entrar.png`)
- É a melhor tela do editor: título forte, um campo, um botão.
- Falta "mostrar senha" (o olho no campo). No celular, digitar a senha às cegas é o erro mais comum de "não consigo entrar".
- O conjunto fica no meio vertical da tela. Com o teclado aberto, o botão Entrar cai para baixo do teclado em telas de 667 px. Ancorar o formulário no terço de baixo e o título no de cima.
- O timecode "00:00:00:00 / 30:00" é bonito, mas fica parado. Aqui cabe um gesto pequeno: ele corre 1 segundo quando a senha é aceita, antes de trocar de tela.

**Projetos** (`03-dark-projetos.png`, `03-light-projetos.png`, `26-dark-desk-projetos.png`)
- O cartão do projeto tem só nome, chip e meta em 12 px mono. Faltam a capa (o quadro do vídeo), a duração e o selo "esperando você" (entregue sem aprovação, cliente respondeu, erro).
- "Ilha de edição" em âmbar acima de "PROJETOS" não informa nada. Trocar por um resumo útil: "2 esperando você · 1 editando".
- "Novo projeto" fica no topo à direita, a zona menos alcançável. Vai para a barra inferior.

**Novo projeto** (`04-dark-novo.png`)
- "Passo 1 de 3", mas os passos 2 e 3 não aparecem em lugar nenhum. É promessa sem mapa.
- 7 tipos de vídeo em chips soltos, com o padrão "O editor decide" em âmbar cheio, o que parece já escolhido e importante. O chip selecionado deve ser tinta invertida, e o âmbar fica só para o botão.

**Projeto, aguardando material** (`05-dark-projeto-vazio.png`, `06-dark-projeto-vazio-inteiro.png`)
- "Solte o material aqui" é texto de desktop. No celular o gesto é "Escolher vídeos da galeria".
- O texto de ajuda do link do Dropbox está em 13 px, dentro da área de soltar, e compete com o botão.
- A ordem 01 Material, 02 Pedido, 03 Ilha, 04 Versões está certa no início. No celular, depois do envio, a ilha sobe para o topo com o número 03 antes do 01 (`15-dark-entregue-inteiro.png`). São números sem sequência real, que é um clichê proibido pela casa.

**Envio** (`07-dark-enviando.png`, `08-dark-enviado.png`)
- O progresso é uma barra verde de 4 px com "No armazenamento. O motor já está lendo." Funciona, mas é mudo: não mostra velocidade nem tempo restante em letra grande, e a lista "na fila" logo abaixo repete o mesmo arquivo.
- "na fila", "lendo falas" e "lido" ficam em 12 px mono cinza. O estado do arquivo merece um ícone e uma cor.

**Pedido e perguntas** (`09-dark-perguntas.png`, `10-dark-mandar.png`)
- As 7 perguntas aparecem todas abertas. O certo para o polegar é mostrar a pergunta, a resposta padrão em texto ("O editor decide") e "trocar" abrindo uma gaveta com as opções. A tela vira um resumo de 7 linhas.
- "Duração" é um `<select>` nativo depois das perguntas, mas é a escolha mais importante depois do texto. Deve virar chips (15, 30, 45, 60, 90 s) logo abaixo do texto.
- "A edição começa sozinha quando o envio estiver fechado e o material lido." é uma regra explicada em vez de resolvida (ver problema 2).

**Ilha ao vivo** (`12-dark-ao-vivo-montando.png`, `13-dark-ao-vivo-rolado.png`, `12-light-ao-vivo-montando.png`)
- O timecode de 112 px é o momento-assinatura e funciona. Mas no tema claro o âmbar escuro `#8a5300` deixa o número marrom e sem brilho. No claro, o timecode deve ser tinta preta, com a régua em âmbar.
- O ponto "ao vivo" é vermelho, o mesmo da "Aba 71". O vermelho de marca virando sinal de status dilui a assinatura. Ver a direção abaixo.
- Os 6 passos em lista vertical ocupam uma tela. No celular, o passo atual deve ficar grande e os outros numa faixa de 6 segmentos.

**Versão entregue, aprovar e reprovar** (`16-dark-entregue-player.png`, `17-dark-entregue-botoes.png`, `18-dark-reprovar-aberto.png`, `19-dark-aprovada.png`, `20-dark-link-cliente.png`)
- O bloco da versão empilha 9 chips de QA, 2 parágrafos técnicos, "Cor: antes e depois", o link do cliente (com `<select>` de validade e "Gerar link"), Baixar, Aprovar e Reprovar. São **6 ações com peso parecido**. Para o dono, a ordem é Aprovar, Pedir ajuste e Mandar para o cliente. O resto vai para uma gaveta "Mais".
- "Reprovar com motivo" é um botão vermelho grande, ao lado do Aprovar e do mesmo tamanho. O texto "Vira regra da casa." assusta e não diz o custo (lacuna 13). Deve se chamar "Pedir ajuste", abrir numa gaveta e mostrar uma linha de consequência antes de confirmar.
- Depois de aprovar, o link do cliente abre 4 botões empilhados (Copiar, WhatsApp, Gerar outro, Desligar), com o vermelho "Desligar" do mesmo tamanho de "Copiar".

**Caderno** (`21-dark-caderno.png`, `23-dark-caderno-inteiro.png`)
- O conteúdo é bom, mas está organizado como documento. São quatro telas misturadas numa só: Regras, Modos, Clientes e Sistema.

**Gastos** (`22-dark-gastos.png`)
- "US$ 0,378" é o número-herói, mas o dono pensa em reais. As barras em cinza claro parecem desabilitadas, e "3 chamada(s) paga(s)" é linguagem de sistema (lacuna 42).

**Página do cliente /c/** (`24-dark-cliente.png`, `25-dark-cliente-inteiro.png`)
- É a tela mais limpa: marca, título, vídeo e dois botões. "Pedir ajuste" fantasma ao lado de "Aprovar" verde está certo.
- O título em Anton de 52 px empurra o vídeo. Nesta tela, o vídeo deve começar a 120 px do topo. Falta assinatura de quem entrega: uma etiqueta "Aba 71" e uma linha "feito pela creat.MTT" no rodapé, discretas.

---

## (b) Direção de arte: "Mesa de corte"

```
/* Conceito: Mesa de corte — o editor é uma claquete e uma timeline no bolso. Cada tela mostra UMA coisa:
   a próxima jogada. O resto fica guardado na gaveta, como na ilha de edição de verdade.
   Momento-assinatura: "o relógio vira o filme". Enquanto edita, o timecode Anton corre na régua de 30:00.
   Na entrega, a régua se fecha num quadro 9:16 e o timecode encolhe e vira a etiqueta "feito em 18:42"
   no canto do player. A capa do filme ocupa o lugar do relógio. Um movimento, 600 ms, uma vez por versão.
   Layout: celular = topo de 56 px (marca e status) + palco + barra de comando fixa no polegar + navegação inferior.
   Desktop = mesa de duas colunas (palco à direita, fixo; material e pedido à esquerda). */
```

### Princípios
1. **Uma ousadia só: o timecode.** Ele é o herói na ilha ao vivo e vira etiqueta no filme entregue. Nenhum outro elemento usa Anton acima de 40 px dentro do projeto. O nome do projeto cai para 32 a 40 px.
2. **Cada cor tem um trabalho.** Âmbar = "toque aqui agora" (só o botão principal e o passo atual). Vermelho Aba 71 = assinatura da marca (a etiqueta e o ponto "gravando"), nunca erro. Verde = aprovado. Coral = problema. Escolhas feitas = tinta invertida (fundo claro e texto escuro no escuro, e o inverso no claro).
3. **A tela segue o estado do projeto**, e não uma ordem fixa de cartões. Aguardando material: o palco é o envio. Editando: o palco é o relógio. Entregue: o palco é o filme. Erro: o palco é o motivo e "Tentar de novo".
4. **Tudo que é ação mora no terço de baixo.** Navegação inferior e barra de comando com o próximo passo. O topo só informa.
5. **Nada de jargão na primeira camada.** "QA", "LUFS", "semelhança 0.30" e "worker" ficam em "ver detalhes". A primeira camada fala como o Marcos fala: "Pronto. Passou em 8 de 9 conferências; uma pede seu olho."

### Paleta (tokens nomeados pelo papel)

Neutros puxados para o âmbar (grafite quente, nunca cinza puro). O tema claro é a "mesa de luz": branco frio de monitor de referência, não creme.

| token | papel | escuro (sala de corte) | claro (mesa de luz) |
|---|---|---|---|
| `--cor-fundo` | fundo da página | `#111113` | `#F3F3F1` |
| `--cor-superficie` | cartão, barra | `#1A1A1D` | `#FFFFFF` |
| `--cor-superficie-2` | cartão dentro do palco, campo | `#232327` | `#ECEBE8` |
| `--cor-linha` | divisória | `#303036` | `#D9D7D2` |
| `--cor-tinta` | texto principal | `#F4F1EA` | `#141416` |
| `--cor-tinta-2` | texto de apoio (≥ 4,5:1 nos dois) | `#ADA9A1` | `#55534D` |
| `--cor-acao` | **só** botão principal e passo atual | `#F2A516` | `#F2A516` (fundo), texto `#17130A` |
| `--cor-acao-tinta` | âmbar como texto | `#F6B73C` | `#8A5300` (só texto pequeno, nunca o timecode) |
| `--cor-aba` | assinatura Aba 71 e "gravando" | `#E8261F` | `#C81E18` |
| `--cor-ok` | aprovado | `#7CC98F` (texto escuro em cima) | `#1F6B35` (**texto branco** em cima: 6,2:1) |
| `--cor-alerta` | problema e erro | `#FF7A70` | `#B3261E` |

Regras de uso: a opção marcada usa `--cor-tinta` de fundo e `--cor-fundo` de texto. Os passos futuros usam `--cor-tinta-2` sem opacidade. No tema claro, o timecode usa `--cor-tinta`.

### Tipografia (escala fixa)

| papel | fonte | tamanhos |
|---|---|---|
| display (timecode, título de tela) | Anton, já na casa | 96 a 120 (timecode) / 40 (título de tela) / 28 (título de seção grande) |
| texto | `system-ui`, que no iPhone é SF Pro e no Android é Roboto: zero peso e a melhor leitura em cada aparelho | 17 (corpo no celular) / 15 (apoio) / 20 semibold (título de cartão) |
| dado (tempo, tamanho, estado) | JetBrains Mono Bold, já na casa | 13 (piso; hoje há 11 e 12) / 15 / 20 (velocidade do envio) |
| marca | Montserrat Black (já na casa) | só na etiqueta Aba 71 |

- O rótulo de cartão hoje é mono de 13 px, maiúsculo e cinza ("01 MATERIAL"). Ele vira título de cartão em texto de 20 px semibold, com o estado à direita. O mono fica para os dados.
- Use `font-variant-numeric: tabular-nums` em todo número que muda (timecode, porcentagem, US$ e R$).

### Grid e ritmo
- Celular: gutter de 16 px, coluna única e espaçamento na escala 4, 8, 12, 16, 24, 32, 48. Há duas barras fixas: navegação (64 px + safe-area) e comando (64 px, logo acima da navegação, só no projeto).
- Desktop (≥ 960 px): duas colunas. O palco fica à direita, `position: sticky`, para o filme ou o relógio estar sempre visíveis. Material e pedido ficam à esquerda. A navegação inferior vira trilho lateral de 72 px.
- Raio: 12 px em cartão, 999 px em chip, 14 px no botão grande. Sombra só nas barras fixas e na gaveta. Cartão no chão não leva sombra.

### Movimento
- Curvas: entrada `cubic-bezier(0.22,1,0.36,1)`, saída `cubic-bezier(0.55,0,1,0.45)`, mola de gaveta `cubic-bezier(0.32,0.72,0,1)`. Durações: 120 ms (toque), 240 ms (troca de estado), 360 ms (gaveta), 600 ms (momento-assinatura).
- Onde há movimento, sempre com motivo:
  - **Responder:** todo botão faz escala 0,97 em 120 ms e, no Android, `navigator.vibrate(8)` no Aprovar e no Começar.
  - **Orientar:** o passo concluído desenha o ✓ como traço de SVG em 240 ms. A barra de comando troca o texto com um deslize vertical de 8 px. A gaveta sobe com a mola.
  - **Encantar:** um único momento, "o relógio vira o filme" (acima), e a claquete do Aprovar, que já existe e só ganha o som opcional.
- Tudo cai para corte seco com `prefers-reduced-motion`.

### Som (opcional, desligado por padrão)
- Um único som: a batida da claquete ao aprovar, com 120 ms e volume baixo. Interruptor em Sistema. Nada de som no ao vivo. O som só vale se o dono ligar, porque o editor é usado em evento e na rua.

### Assinatura Aba 71
- A etiqueta vermelha "Aba 71" aparece em três lugares e só neles: na tela de entrar (já existe "pula o óbvio"), no canto do player entregue (junto de "feito em 18:42") e no rodapé da página do cliente. Ela nunca vira botão nem status.

---

## (c) Sistema de componentes

### Botões

| variante | uso | aparência | estado carregando | desabilitado |
|---|---|---|---|---|
| **principal** | uma por tela: Começar a edição, Aprovar (na barra), Entrar, Criar | fundo `--cor-acao`, texto `#17130A`, 52 px de altura, largura total no celular | o texto troca pelo verbo no gerúndio ("Começando…") + barra fina de 2 px correndo na base do botão; largura travada para não pular | **nunca só apagado**: opacidade 0,45 + linha de 13 px embaixo dizendo o que falta ("Falta: mandar 1 vídeo") com link que rola até lá |
| **secundário** | Pedir ajuste, Baixar, Colar link | fundo `--cor-superficie-2`, borda `--cor-linha`, texto tinta, 48 px | igual ao principal | igual |
| **aprovar** | só o Aprovar da versão | fundo `--cor-ok`; no claro, texto branco; claquete na cor do texto | "Batendo…" com a claquete fechando | não existe desabilitado: some quando já aprovada |
| **perigo** | Desligar link, Remover arquivo | texto `--cor-alerta`, sem borda, sem fundo; nunca do tamanho do principal | — | — |
| **confirmação de perigo** | dentro da gaveta | fundo `--cor-alerta`, texto branco, com uma linha de consequência acima ("A V1 sai do ar e o link do cliente para de abrir.") | — | — |
| **ícone** | fechar, mais, copiar | 44x44 de área, ícone de 20 px (Lucide), `aria-label` obrigatório | — | — |

### Cartões
- **Cartão de projeto (lista):** capa 9:16 de 56x100 à esquerda, nome em 17 semibold, linha de dado (`45 s · bastidor · há 2 h`) e selo à direita. Os selos usam cor + ícone + texto: "Esperando você" (âmbar, ponto pulsando), "Editando 12:04" (timecode correndo), "Aprovado" (verde), "Precisa de você" (coral). O cartão inteiro é tocável e afunda 0,99 ao toque.
- **Cartão de palco:** sem borda e com fundo `--cor-superficie`. É o maior da tela. Só há um por estado.
- **Cartão resumo (recolhido):** uma linha com título, resumo e "ver". Usado para Material e Pedido depois que a edição começa ("Material · 4 vídeos, 2,3 GB · ver").

### Navegação inferior (celular)
- Quatro itens com ícone e rótulo de 12 px semibold, alvo de 64x56: **Projetos · Novo · Caderno · Mais**.
- "Novo" é o botão central com fundo `--cor-acao` e ícone de +. É o único âmbar da barra.
- "Mais" abre uma gaveta com Gastos, Biblioteca, Clientes, Sistema (backup e saúde) e Sair. O "Sair" fica por último e em texto de perigo.
- A barra usa fundo `--cor-superficie` a 92%, blur de 12 px, borda de cima em `--cor-linha` e `padding-bottom: env(safe-area-inset-bottom)`.
- Um contador vermelho no item Projetos mostra quantos estão "esperando você".
- O topo fica com 56 px de altura: logo à esquerda e, à direita, um ponto de saúde que fica coral só quando o backup ou o motor falham (lacuna 1). Tocar no ponto abre o detalhe.

### Barra de comando (dentro do projeto)
- Fica fixa acima da navegação e mostra sempre **o próximo passo** em um botão principal + no máximo um secundário. É ela que resolve o problema 2.

| estado | principal | secundário | linha de motivo |
|---|---|---|---|
| sem material | Escolher vídeos | Colar link | — |
| material ok, sem pedido | Escrever o pedido (rola e foca) | — | "Falta: o pedido" |
| pronto para começar | **Começar a edição** (fecha o envio e manda o pedido) | — | — |
| editando | Ver ao vivo (rola até o relógio) | — | "Montando · faltam ~14 min" |
| entregue | **Aprovar** | Pedir ajuste | — |
| aprovado | Mandar para o cliente | Baixar | — |
| erro | Tentar de novo (depende da lacuna 2 no motor) | Ver motivo | motivo em uma frase |

- Os atributos `data-teste` atuais (`fechar-envio`, `mandar-pedido`, `aprovar`) continuam valendo. A barra chama as mesmas funções e um único elemento fica com cada `data-teste`, para não quebrar o aceite.

### Gaveta de ações (bottom sheet)
- Sobe do rodapé com uma alça de 36x4 px no topo. Fecha arrastando para baixo, tocando fora ou no ×. A altura vai até 85 dvh. O foco fica preso dentro e o Esc fecha.
- Usos:
  - **Mais da versão:** Baixar, Cor antes e depois, Conferência em detalhes, Diário da ilha, Link do cliente.
  - **Pedir ajuste:** campo de texto, chips "só neste vídeo" ou "vale como regra" (lacuna 5) e uma linha de consequência com custo estimado (lacuna 13).
  - **Trocar resposta** de uma pergunta do pedido.
  - **Menu Mais** da navegação.

### Estados de progresso do filme
- **Faixa de 6 segmentos** (Material, Lendo, Dirigindo, Montando, Conferindo, Pronto) com 6 px de altura no topo do palco. Segmento feito = tinta, atual = âmbar com brilho correndo, futuro = `--cor-linha`.
- Embaixo vai o **passo atual grande**: nome em 20 semibold, a mensagem do motor em 15 já traduzida e a barra de progresso da etapa. Os passos concluídos ficam em "ver todos", que abre a trilha completa.
- **Relógio:** o timecode Anton com "de 30:00 · faltam 18:12" em mono 15. A régua vira a própria faixa de segmentos, então não ficam duas réguas.
- **Entregue:** o relógio vira a etiqueta "feito em 00:50" sobre a capa (momento-assinatura).
- **Erro:** a faixa fica coral no segmento que parou, com o motivo em uma frase e "Tentar de novo".
- **Desconectado:** o ponto "ao vivo" vira "reconectando…" em `--cor-tinta-2` (não vermelho), e depois de 10 s aparece um toast.

### Toasts
- Ficam acima da barra de comando, com uma linha e no máximo 2, somem em 4 s e podem ser arrastados para o lado. Têm `role="status"` (sucesso) ou `role="alert"` (erro).
- Mensagens: "Link copiado", "Pedido recebido. A edição começou.", "V1 aprovada. Corta!", "2 links na fila", "Sem internet: tentando de novo".
- Erro com ação: "Não deu para mandar o pedido · Tentar de novo".

### Estados vazios
- **Lista vazia:** em vez da caixa tracejada, uma claquete aberta desenhada em traço com "Nenhum filme na mesa ainda." e o botão principal "Começar o primeiro". Abaixo, 3 linhas de dado mostrando como funciona ("1 · sobe o bruto · 2 · diz o que quer · 3 · recebe em ~30 min").
- **Player esperando:** a capa (quadro-chave do material) desfocada atrás, com o timecode correndo por cima, em vez do retângulo listrado. Sem quadro-chave, usar a faixa de segmentos grande.

---

## (d) Plano de implementação em ondas

Cada onda é pequena, entra num commit só e precisa passar em `pnpm aceite` (os `data-teste` não mudam de nome) e em `verificacao-visual` (celular e desktop, claro e escuro). Os prints novos entram em `.verificacao/`. A ordem é a do maior alívio para o polegar do dono pelo menor risco.

### Onda 1: "Polegar" (só estrutura e tokens, sem biblioteca nova)
- **Objetivo:** o dono alcança tudo com o polegar, vê o filme pronto primeiro e nunca fica sem saber o próximo toque.
- `app/globals.css`:
  - Tokens novos da paleta acima, com nomes compatíveis (manter `--cor-ambar` como apelido de `--cor-acao` durante a transição).
  - Chip marcado em tinta invertida e passos futuros sem opacidade.
  - Texto mínimo de 13 px no mono.
  - Botão OK do claro com texto branco.
  - Timecode do claro em tinta.
  - Classes `.nav-inferior`, `.barra-comando`, `.botao[data-motivo]` (linha de motivo) e `padding-bottom` da `.pagina` para as duas barras.
- `componentes/Topo.tsx`:
  - Topo de 56 px com logo e ponto de saúde (por enquanto estático).
  - Navegação inferior Projetos, Novo, Caderno e Mais. Nesta onda, "Mais" é um `<details>` simples com Gastos e Sair, e vira gaveta na onda 2.
  - No desktop, a mesma navegação fica no topo à direita, como hoje.
- `componentes/Projeto.tsx`:
  - Ordem por estado: entregue → Versões primeiro (player no topo), relógio recolhido. Editando → relógio primeiro. Aberto → material primeiro.
  - Tirar os números 01 a 04 dos títulos de cartão.
  - Barra de comando com o próximo passo e os mesmos handlers (`postar('/fechar-envio')` e o envio do formulário do pedido via `form` + `requestSubmit`). O `data-teste` fica num único elemento.
  - Linha "Falta: …" abaixo de botão apagado.
  - Esconder o `Envio` quando `fechado` for verdadeiro, deixando só o resumo do material.
- `componentes/Envio.tsx`: "Solte o material aqui" vira "Escolher vídeos" no celular (`@media (hover: none)`), e o texto do Dropbox desce para depois do botão.
- `app/layout.tsx`: `themeColor` com os fundos novos.
- **Teste:**
  - `pnpm aceite` verde.
  - `olhar.cjs` sem texto abaixo de 13 px no projeto.
  - Print `celular-escuro-projeto` entregue com o player a menos de 200 px do topo e Aprovar visível sem rolar.
  - Contraste do botão OK no claro ≥ 4,5:1.

### Onda 2: gaveta e toasts
- Dependências: `@base-ui/react` (Drawer) e `sonner` (ver a seção e).
- Arquivos:
  - `componentes/Gaveta.tsx` (novo, envolve o Drawer com os tokens).
  - `componentes/Avisos.tsx` (novo, `<Toaster>` no `layout.tsx`).
  - `Projeto.tsx`: "Mais da versão", e "Reprovar com motivo" vira "Pedir ajuste" na gaveta, com a linha de consequência.
  - `LinkCliente.tsx`: os 4 botões viram gaveta; o principal é "Mandar no WhatsApp" e "Copiar" fica como secundário com o toast.
  - `Topo.tsx`: "Mais" vira gaveta.
- **Teste:** o aceite ganha um passo que abre a gaveta de ajuste e cancela, e confere o toast "Link copiado". Também verificação visual da gaveta aberta em 390x844.

### Onda 3: projeto por estado e pedido em resumo
- Arquivos:
  - `Projeto.tsx`: perguntas como linhas de resumo ("Quem fala · O editor decide · trocar") que abrem a gaveta.
  - Duração em chips logo abaixo do texto.
  - Faixa de 6 segmentos e passo atual grande, com a trilha completa em "ver todos".
  - Material e Pedido recolhidos em cartão resumo depois de começar.
  - Traduzir as mensagens do motor numa tabela em `lib/estados.ts`, sem mexer no motor (ex.: "Falta o pedido" some quando já há pedido).
  - `app/projetos/page.tsx`: cartão com capa, se o motor devolver o quadro-chave; senão, um monograma. Selo "esperando você" e resumo no topo.
- **Teste:** o aceite já percorre todos os estados. Somar prints de cada estado (aguardando, editando, entregue, aprovado) nos dois temas.

### Onda 4: movimento-assinatura e Caderno em telas
- Arquivos:
  - `Projeto.tsx` + `globals.css`: "o relógio vira o filme" com CSS (o timecode encolhe para a etiqueta e a capa entra com `clip-path`), disparado uma vez quando o estado vira `entregue`, guardando a versão já mostrada em `sessionStorage`. Também o ✓ desenhado e o som opcional da claquete.
  - `app/caderno/page.tsx` dividido em `/caderno` (regras, com índice e seções recolhidas), `/clientes`, `/biblioteca` e `/sistema` (backup e saúde), a partir dos componentes que já existem (`Backup.tsx`, `Biblioteca.tsx`, `PedidosCliente.tsx`). Liga com a lacuna 27.
- **Teste:** aceite com `prefers-reduced-motion` ligado e desligado (sem erro de console). Print do Caderno abaixo de 3 telas.

### Onda 5: entrar, cliente e desktop
- Arquivos:
  - `FormEntrar.tsx`: "mostrar senha" e formulário ancorado no terço de baixo.
  - `app/c/[token]/page.tsx` + `AprovacaoCliente.tsx`: título menor, vídeo a 120 px do topo e rodapé com Aba 71.
  - Desktop: palco `sticky` à direita e a navegação como trilho lateral.
- **Teste:** aceite (login com senha errada e certa) e verificação visual em 1440x900.

---

## (e) Ferramentas: o que entra, o que não entra e por quê

Critérios da casa: resultado comprovado, integração, risco e, por último, custo. Nada foi instalado e nada pago foi usado. As versões foram lidas no npm em 25/11/2026.

| função | escolha | por quê | fonte |
|---|---|---|---|
| Gaveta (bottom sheet) | **Base UI `@base-ui/react` 1.9.0**, só o Drawer | Tem gesto de arrastar para fechar e pontos de parada, foco preso e acessibilidade prontos, licença MIT, mantido (1.9.0, publicado em 10/2026) e sem estilo próprio, então usa os nossos tokens. **O Vaul, que era a referência, está sem manutenção:** o README diz "This repo is unmaintained" e a última versão, 1.1.2, é de 12/2024. Não entra. | https://base-ui.com/react/components/drawer · https://github.com/emilkowalski/vaul · `npm view @base-ui/react` |
| Toasts | **sonner 2.0.8** (MIT) | Padrão de mercado para toast em React, empilha e aceita arrastar no celular, `role` certo e pouco código. Alternativa sem dependência: um componente próprio de 40 linhas com `aria-live`. Fica em aberto se o revisor preferir zero dependência. | `npm view sonner` (08/2026) |
| Ícones | **lucide-react 1.79.0** (ISC) | Substitui os glifos de texto ✓ ✕ e dá ícones à navegação inferior. Importação por ícone, com peso só do que usar. Traço de 1,75 px combina com o mono. | `npm view lucide-react` (24/11/2026) |
| Animação | **CSS primeiro.** Motion 14.14.0 (MIT) só se a onda 4 precisar de animação de layout que o CSS não faça bem. | O momento-assinatura e a gaveta cabem em CSS mais o Base UI. O Motion é excelente, mas soma peso a um app que o dono abre no 4G de evento. Decidir na onda 4 com o print na mão. | `npm view motion` (13/11/2026) |
| Transição entre telas | **Não agora.** | No Next 15, `viewTransition` é flag experimental, "não recomendado para produção", com `unstable_ViewTransition`. Só vale depois de subir para o Next 16 com React 19.3. | https://nextjs.org/docs/15/app/api-reference/config/next-config-js/viewTransition · https://react.dev/reference/react/ViewTransition |
| Radix | Não entra | O Base UI cobre o mesmo papel, é da mesma equipe que manteve o Radix e já traz o Drawer, que o Radix não tem. Uma biblioteca de primitivos basta. | `npm view @radix-ui/react-dialog` |
| Figma (MCP) | Opcional, só para apresentar ao dono | O estudo da casa registra 20 chamadas por mês no assento View/Collab: "tratar como opcional" (`docs/stack-ferramentas-2026.md:211`, `:283`). O código é a fonte de verdade, e os prints da verificação visual mostram ao dono o que mudou. | estudo da casa |
| 21st.dev, Stewdio, Canva, Adobe (MCP) | Não entram na implementação | O 21st.dev entrega componentes em Tailwind e shadcn, e este projeto usa CSS próprio com tokens: serviria só de referência visual. Stewdio e Canva são para peça de motion e rede social, não interface de app. O Adobe `font_recommend` é dispensável porque as fontes já são da marca (Anton, JetBrains Mono, Montserrat Black) e o texto fica em `system-ui` de propósito. | catálogo de ferramentas da sessão |

**Registro no estudo:** o `docs/stack-ferramentas-2026.md` não tem categoria de "componentes de interface". Quando a onda 2 for aprovada, acrescentar a linha "Gaveta: Base UI Drawer (Vaul sem manutenção desde 12/2024)" com as fontes acima. Não editei o estudo agora porque a tarefa pede um arquivo só.

---

## Resumo para quem implementa
- **Onda 1 é só CSS, `Topo.tsx`, `Projeto.tsx`, `Envio.tsx` e `layout.tsx`:** navegação inferior, barra de comando com o próximo passo, filme pronto no topo, âmbar só para ação, contraste corrigido.
- Sem biblioteca nova e sem mexer no motor, então não colide com a equipe que está no `services/motor`.
- Nada aqui pede serviço pago. O som da claquete é opcional e local.
