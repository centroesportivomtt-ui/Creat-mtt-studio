# Frente TELA AO VIVO E CONVERSA NO CELULAR

Pesquisa e proposta de 25/11/2026, por Paleta (designer). Pedido do Marcos, nas palavras dele: "no meu editor ele tem que ter também um modo de resposta, onde eu falo alguma coisa, ele pode me perguntar também de volta" e "como eu converso com você aqui, que eu lhe mando um áudio, vejo o que está executando, vejo o que está sendo feito… uma tela de atualização do que está sendo feito de forma ao vivo… eu verifico as ferramentas que está utilizando. Tudo isso… tem que ter lá também".

**Leitura além do literal:** ele não quer um chat colado no editor. Quer dirigir o filme conversando, como dirige o Xande no set, e ver a equipe trabalhando sem precisar perguntar "e aí, como está?". A tela tem que responder três perguntas a qualquer momento, sem rolar: **quem está mexendo no meu filme agora, fazendo o quê, e se estão esperando por mim.**

**Como isso vende:** cada pergunta que o editor faz no lugar certo é uma volta de montagem a menos, e o filme sai antes. E a mesma "equipe trabalhando" que o Marcos vê vira prova para o cliente na página de aprovação (seção 6.4), que é a tese da casa: o cliente assiste a equipe.

Escopo e regras:
- Só este arquivo foi criado. Nada em `apps/`, `services/` ou `packages/` foi alterado.
- Caminhos relativos a `projetos/editor-creat/`, salvo quando começam com `sede/` ou `.claude/` (raiz do repositório).
- Esta frente cuida da **tela**. O cérebro (laço, eventos SSE, ferramentas, custo) está em `docs/conversa-pesquisa-agente.md` e a voz (gravação, transcrição) em `docs/conversa-pesquisa-voz.md`. Uso os nomes de evento e de ferramenta de lá para que as três frentes encaixem.
- "Não confirmado" = não achei fonte primária ou não testei no aparelho.

---

## 1. Resposta curta

1. **A conversa não é aba nem gaveta: ela é a mesa do projeto.** Dentro de um projeto, a tela vira "palco em cima, conversa embaixo, barra de comando no polegar". Ao rolar a conversa, o palco encolhe para uma faixa fixa de 72 px com a capa, o timecode e quem está trabalhando. Um toque nela devolve o palco grande. O filme e o relógio nunca somem.
2. **Cada turno segue sempre a mesma ordem:** fala do dono → "Entendi: …" (o eco do que ele quis) → linhas de andamento → **grupo da equipe** (as ferramentas, recolhidas numa linha quando terminam) → cartões de resultado → resposta → pergunta ou confirmação → rodapé com custo e tempo. É a ordem que o Claude Code mostra, com as falhas que os usuários reclamam já corrigidas (seção 2.6).
3. **Ferramenta em uso fala a língua do Marcos e tem dono:** "Radar · Ouvindo as 14 falas da Lavínia · 0:06". O nome técnico, a entrada e o resultado ficam no "ver detalhes", numa gaveta. Os rótulos vêm de uma tabela do site (`lib/equipe.ts`), não do modelo.
4. **Quem faz o quê sem virar brinquedo:** cada ferramenta e cada etapa do motor tem um agente da casa responsável (tabela da seção 6.2). Só aparece quem está executando algo de verdade. Avatar de 24 px parado, nome e verbo; nada de balão pulando, nada de "Oi, sou a Paleta!". A sede 3D fica a um toque ("ver na sede"), fora do editor, porque o editor abre no 4G de evento.
5. **Pergunta do editor = cartão com até 4 botões grandes** (a ferramenta `perguntar` já prevê `opcoes[]` até 4, `padrao` e `permite_texto`; `conversa-pesquisa-agente.md`, seção 10, linha 338). A sugestão do editor leva a etiqueta "sugestão", nunca o âmbar. Responder também por texto ou áudio.
6. **Gastar só com toque, e o toque mostra a conta:** o cartão de confirmação diz o que roda de novo, quanto custa, quanto demora e se dá para desfazer. Exemplo: refazer a direção ≈ US$ 0,19 por chamada pelos limites do `orcamento.py` (`conversa-pesquisa-agente.md`, linha 100).
7. **Montagem longa com a tela bloqueada: notificação de verdade.** O editor já é app da Tela de Início (`apps/web/public/manifest.webmanifest`: `"display": "standalone"`), que é a condição do iPhone para Web Push (WebKit, iOS 16.4). O Declarative Web Push (iOS 18.4) dispensa service worker para mostrar a notificação. Hoje não existe service worker nem push no `apps/web` (busca no código, 25/11). Custo: zero de serviço; precisa de chaves VAPID e uma rota no motor.
8. **Uma ousadia só continua sendo o timecode.** A conversa é calma de propósito: texto `system-ui`, mono para dados, âmbar só na próxima jogada. O "momento que o Marcos conta para um amigo" vem do conteúdo, não de efeito: o editor **cita o tempo exato e mostra o quadro** ("a virada da música é em 0:14, olha aqui") e, na entrega, a **ficha técnica** do filme com quem fez cada parte.

---

## 2. O que os melhores mostram hoje (pesquisa com fonte)

Lidas em 25/11/2026. Onde a página oficial não descreve um detalhe, digo isso.

### 2.1 Claude Code (desktop e celular)
- **Três níveis de transparência:** o redesenho de 14/04/2026 trouxe "Three view modes—Verbose, Normal, and Summary", do detalhe de cada chamada de ferramenta até só os resultados. As respostas "now streams responses as Claude generates them". Há um botão de uso que mostra janela de contexto e uso da sessão "at a glance". Fonte: https://claude.com/blog/claude-code-desktop-redesign
- **Agrupamento:** chamadas seguidas viram uma linha "Ran 7 commands" ou "Edited 3 files", com seta para abrir. Os usuários pedem para manter abertas por padrão. Fonte: relato de usuário, não doc oficial: https://claudeissues.com/issue/85248-desktop-app-option-to-expand-tool-call-groups-ran-n-commands-by-default
- **A reclamação que interessa:** o texto escrito entre ferramentas some dentro da dobra "Ran N commands", e o usuário só vê com certeza o último bloco de texto do turno (https://claudeissues.com/issue/90425-desktop-app-collapses-assistant-text-written-between-tool-calls-substantive-answ). Outro relato: os resumos de raciocínio aparecem como se fossem mensagens normais (https://claudeissues.com/issue/94354-desktop-normal-view-shows-thinking-summaries-that-look-like-normal-chat-messages). **Lição: recolher ferramentas, nunca recolher o que o agente disse ao dono; e o andamento tem que ter cara diferente da resposta.**
- **No celular:** o app do Claude é cliente das sessões. "Open a session in the app to check progress, answer Claude's questions, or steer it in a new direction." Com Remote Control, "Claude can send push notifications to your phone when a long-running task finishes or when it needs a decision from you", e só há dois interruptores, sem configuração por evento. Também pula o push enquanto a pessoa está no terminal. Fontes: https://code.claude.com/docs/en/mobile.md e https://code.claude.com/docs/en/remote-control.md (seção "Mobile push notifications"). **Lição: dois motivos de notificação bastam, "terminou" e "precisa de você"; e não notificar quem está olhando.**
- O app oficial não tem Live Activity (Ilha Dinâmica) para sessões; os que têm são apps de terceiros (CodeLight, Sessix). Fonte: busca, sem doc oficial que mencione.

### 2.2 Devin
- Aba **Progress** com todas as atividades num só lugar: "All shell commands, code edits, and browser activity will be logged in one unified view". Cada atualização de progresso abre os comandos daquela subtarefa, "in context with the work being performed". Tocar num comando leva a sessão àquele ponto no tempo; os que vêm depois ficam acinzentados. **Side chats** abrem ao lado do worklog, só leitura, e não mexem na sessão principal. Fonte: https://docs.devin.ai/work-with-devin/devin-session-tools
- O Planner tem Work Log com passos graduados por cor, horário e duração de cada passo; o Timeline de "Session Insights" é só depois da sessão e precisa ser pedido. Fonte: https://docs.devin.ai/product-guides/session-insights (resumo da busca; não abri a página inteira).
- **Lição:** progresso agrupado por "passo com intenção", e o técnico pendurado embaixo do passo. Viagem no tempo é coisa de desktop; no celular não entra.

### 2.3 ChatGPT agent (retirado) e Manus
- Lançamento (17/07/2025): "an on-screen narration provides visibility into exactly what ChatGPT is doing"; dá para interromper "at any point to clarify your instructions"; o agente "may proactively seek additional details from you when needed"; "requests permission before taking actions of consequence"; e "will send you a notification when it's done with your task". Fonte: https://openai.com/index/introducing-chatgpt-agent/ (a própria página avisa que o post está desatualizado). A central de ajuda diz que o ChatGPT agent não existe mais e manda usar o "ChatGPT Work": https://help.openai.com/en/articles/11752874-chatgpt-agent
- Manus: painel "Manus's computer" com os passos ao vivo e lista de tarefas inicial, segundo análises de terceiros (sem doc oficial de interface encontrada). O Manus 2.0 (28/09) diz que dá para "watch your desktop live on your phone while it does". Fonte: https://manus.im/blog/introducing-manus-2-0
- **Lição:** narração em primeira pessoa e curta, permissão antes do que tem consequência e aviso no fim. A tela de "computador do agente" não serve para nós: o que o Marcos quer ver é o filme, não um terminal.

### 2.4 Cursor
- Lista de tarefas: "Agents now plan ahead with structured to-do lists", mostrada no chat e atualizada enquanto trabalha. Mensagens em fila: "queue follow-up messages for Agent once it's done with current task", com reordenação. Fonte: https://cursor.com/changelog/1-2 (03/07/2025).
- Há a escolha entre **fila** e **"Steer"**, que entrega a mensagem ao agente no meio da tarefa (resposta de fórum de 09/2026; o caminho do menu mudou entre versões): https://forum.cursor.com/t/critical-regression-task-queues-no-longer-work-new-messages-cancel-previous-tasks/171529
- **Lição:** o Marcos vai falar enquanto a montagem roda. A tela precisa dizer o que acontece com a fala dele: entra no próximo passo ou para tudo.

### 2.5 Lovable
- Cartão de atividade no chat com o "Current step being executed"; tocar abre o **Details view** "where the preview usually appears", com abas **Timeline** ("lists every step Lovable took, including tool calls") e **Changes**. O botão parar mantém o que já foi feito. Fonte: https://docs.lovable.dev/features/agent-mode.md
- Custo: "Lovable does not show an upfront credit estimate before a Build mode request runs"; mostra "Credits used" durante a execução, no menu "More options"; trabalho parado é cobrado só até onde foi; sem crédito, "pauses the message instead of ending it". Mesma fonte.
- No Chat mode, a ferramenta que cria, envia ou muda algo pede aprovação, a menos que a pessoa tenha marcado "Always allow". Fonte: https://docs.lovable.dev/features/chat-mode
- **Lição:** o detalhe abre no lugar do palco, e o custo aparece durante. Nós vamos além: estimativa **antes** do que é pago (o cartão de confirmação), que o Lovable não dá.

### 2.6 v0 e padrões de SDK de chat
- Não achei doc do v0 sobre "Thought for" nem sobre ferramentas recolhidas. Os padrões encontrados são de SDKs: o raciocínio mostra a duração ("Thought for 12s") ao terminar (Stream, https://getstream.io/chat/docs/sdk/react/features/ai/reasoning-and-tool-calls/); manter raciocínio e ferramentas **na ordem em que o modelo produziu**, sem juntar tudo no topo (TanStack AI, https://tanstack.com/ai/latest/docs/chat/thinking-content); recolher o raciocínio quando o streaming termina (Ably, https://render.ably.com/docs/ai-transport/features/chain-of-thought).

### 2.7 Editores de vídeo com IA
- **Descript Underlord:** painel na barra lateral direita; cada pedido gasta créditos de raciocínio e cada ferramenta ou efeito cobra à parte; os custos são "non-deterministic"; tudo aparece em "Underlord" na aba Usage; polegar para cima e para baixo em cada resposta; a própria página avisa que ele pode "overpromise, make incorrect assumptions". Fonte: https://help.descript.com/getting-started/underlord-beta-your-ai-co-editor-in-descript.md. O changelog diz que a conversa persiste entre aparelhos, que dá para voltar atrás ("rolling back") e que uma segunda passada confere a alteração contra o que foi pedido (resumo de busca de https://feedback.descript.com/changelog; não abri a nota exata).
- **Runway Agent** (13/05/2026): "proposes a concept, develops story beats and lays out a full visual direction" e "hands control back to you at every step"; depois, "the timeline editor is yours". A página não diz como mostra progresso nem se pergunta de volta. Fonte: https://runway.com/news/introducing-runway-agent
- **CapCut EditPilot** (PC): a FAQ de 31/07/2026 não descreve passos, perguntas nem custo; só o princípio "A reviewable workflow should always leave room to revise, roll back, or restage changes". Fonte: https://www.capcut.com/resource/capcut-pc-editpilot-faq. Agente por conversa no app de celular do CapCut: não confirmado.
- **Lição:** ninguém no vídeo mostra bem "quem está fazendo o quê" no celular. A janela está aberta para a creat.MTT.

### 2.8 O que vira regra para nós

| padrão de mercado | vira, no editor | de onde |
|---|---|---|
| Ferramentas agrupadas numa linha com seta | "Grupo da equipe": linha "Radar, Faísca e Eco · 6 passos · 0:41 ›" | Claude Code |
| Texto entre ferramentas escondido na dobra | **proibido**: andamento e resposta nunca entram na dobra | reclamação 90425 |
| Três modos de visão | dois no celular: **Resumo** (padrão) e **Bastidores** (abre tudo e mostra nomes técnicos) | Claude Code |
| Detalhe abre onde fica a prévia | o detalhe técnico abre em gaveta por cima do fio; a prévia de resultado abre **no palco** | Lovable |
| Push "terminou" e "precisa de você" | as mesmas duas notificações, e nada além delas por padrão | Claude Code, ChatGPT agent |
| Permissão antes do que tem consequência | cartão de confirmação com custo e tempo antes, não só durante | ChatGPT agent, Lovable (que só mostra durante) |
| Fila ou intervenção | mensagem enviada durante um turno: "entra no próximo passo"; botão Parar separado | Cursor |
| Voltar atrás | "Desfazer" em toda ação de risco `avisa` | Descript, `conversa-pesquisa-agente.md` 5.3 |

---

## 3. Onde mora a conversa

### 3.1 Decisão: a conversa é o próprio projeto

Três opções, avaliadas para o polegar do Marcos:

| opção | a favor | contra | veredito |
|---|---|---|---|
| Aba "Conversa" no projeto | separa | o filme some quando ele fala; pede troca de aba para conferir o que o editor disse "em 0:14" | não |
| Gaveta que sobe da barra de comando | não mexe no layout da onda 1 | conversa longa dentro de gaveta briga com o gesto de arrastar para fechar (a gaveta fecha quando ele só queria rolar) e com o teclado do iPhone; gaveta é para ação de momento (`design-editor-25-11.md:204-210`) | não |
| Tela cheia de chat com o filme escondido | máximo de texto | perde o relógio e o filme, que são a razão de existir | não |
| **Palco + fio + barra de comando, com palco que encolhe** | o filme e o relógio estão sempre visíveis, a conversa tem a tela toda para rolar, a barra fica no polegar | muda a barra de comando da onda 1 (ver 3.3) | **sim** |

O nome na interface: **Mesa**. "Fale com a mesa" é o texto do campo. Combina com o conceito "Mesa de corte" (`design-editor-25-11.md:94`) e não promete uma pessoa.

### 3.2 Regiões em 390x844

```
 y=0   ┌──────────────────────────────────────────────┐
       │ status do iPhone (safe-area, ~47)            │
 47    ├──────────────────────────────────────────────┤
       │ TOPO 56: ‹ (badge)  Reel Super Kal   ● ao vivo│
 103   ├──────────────────────────────────────────────┤
       │ PALCO                                        │
       │  grande: 9:16 ou relógio (até ~420)          │
       │  encolhido: faixa fixa de 72                 │
       ├──────────────────────────────────────────────┤
       │ FIO DA CONVERSA (role="log", rola)           │
       │   …                                          │
       │   ↓ 3 novidades  (pílula, só se rolou p/ cima)│
 ~690  ├──────────────────────────────────────────────┤
       │ BARRA DE COMANDO                             │
       │  linha 1 (opcional, 44): próxima jogada      │
       │  linha 2 (56): [mic] Fale com a mesa… [↑]    │
 ~810  │ safe-area de baixo (~34)                     │
 844   └──────────────────────────────────────────────┘
```

- **Navegação inferior some dentro do projeto.** O projeto é uma sala; o caminho de volta é o "‹" do topo, que carrega o contador vermelho de "esperando você" dos outros projetos. É o mesmo que o iMessage faz dentro de uma conversa. Isso devolve 64 px ao fio, que é onde eles fazem falta.
- **Palco encolhido (faixa de 72 px, fixa abaixo do topo):** capa 9:16 de 40x72 à esquerda; timecode Anton 32 px ("12:04", "de 30:00" em mono 13 ao lado); à direita, os avatares de quem está trabalhando (até 3 + "+2"). Tocar na faixa devolve o palco grande e rola o fio até o fim. Ele encolhe quando o fio rola mais de 120 px para cima do fim, ou quando o teclado abre.
- **Palco grande:** é o da onda 1 e muda com o estado do projeto (`design-editor-25-11.md:106`): envio, relógio, filme ou erro. A conversa não muda o palco por conta própria, a não ser em `mostrar_no_player` (o editor pede para mostrar um tempo) e nos cartões de resultado, quando o Marcos toca neles.
- **Teclado aberto:** o palco encolhe para a faixa, o fio fica entre a faixa e a barra. Posicionar a barra pelo `visualViewport` (altura visível real); se a PWA do iOS 26/27 se comporta igual ao Safari em aba: não confirmado, testar no aparelho.

### 3.3 Barra de comando com a conversa (substitui a tabela de `design-editor-25-11.md:192-200`)

A barra passa a ter duas linhas. A **linha 2 é sempre o campo da conversa**. A **linha 1 é a próxima jogada** da onda 1, como um botão de largura total, e some quando a próxima jogada é responder ao editor (aí o âmbar fica no cartão).

| estado | linha 1 (âmbar, 52 px) | linha 2 |
|---|---|---|
| sem material | Escolher vídeos | `[mic] Fale com a mesa…` |
| material ok, sem pedido | **some**: o pedido agora é a primeira mensagem ("Diga o que você quer, ou escreva o pedido") | campo com foco sugerido |
| pronto para começar | Começar a edição | campo |
| editando | some (o relógio já está no palco) | campo + botão **Parar** (■) no lugar do enviar quando o campo está vazio e há turno da mesa rodando |
| mesa esperando resposta | some; aparece a pílula "Nimbus espera sua resposta ↑" que rola até o cartão | campo |
| entregue | Aprovar (com Pedir ajuste ao lado, secundário) | campo |
| aprovado | Mandar para o cliente | campo |
| erro | Tentar de novo | campo |

- Os `data-teste` da onda 1 (`fechar-envio`, `mandar-pedido`, `aprovar`) ficam nos mesmos botões; a conversa não ganha esses atributos.
- "O pedido agora é a primeira mensagem" depende do motor aceitar pedido pela conversa (`mudar_pedido`, `conversa-pesquisa-agente.md`, linha 334). Enquanto isso não existir, a linha 1 continua "Escrever o pedido".
- Altura total da barra: 44 + 56 + 12 de respiro = 112 px + safe-area. Com a nav escondida, o fio ganha 16 px em relação à onda 1 (64 nav + 64 comando = 128).

### 3.4 Fora do projeto
- **Lista de projetos:** o cartão do projeto ganha a linha viva "Faísca dirigindo · 2:10" (avatar 20 px + verbo + tempo) e o selo "Nimbus espera você" quando há pergunta aberta. É a "tela de atualização ao vivo" de todos os filmes ao mesmo tempo, sem entrar em nenhum.
- **Desktop (≥ 960 px):** palco fixo à direita (`design-editor-25-11.md:144`), conversa na coluna da esquerda no lugar de "material e pedido", que viram cartões-resumo no topo do fio.

---

## 4. Formato de cada item

### 4.1 Ordem dentro de um turno (sempre a mesma)

```
 [fala do dono]                                  ← direita, bloco
 Entendi: reel de 30 s com a oferta de carnes.   ← 1ª linha da resposta, tinta-2
 ┊ Vou ouvir a Lavínia e achar a melhor fala.    ← andamento (itálico? não: fio vertical à esquerda)
 ▸ Radar · Ouvindo as 14 falas da Lavínia  0:06  ← grupo da equipe (vivo)
 ┊ Achei. Agora a virada da música.              ← andamento
 ▸ Eco · Procurando a virada da música     0:03
 [cartão de resultado: quadro em 0:14]
 Resposta em texto corrido…                      ← sem balão, largura total
 [cartão de pergunta / confirmação]              ← se houver
 R$ 0,59 · 38 s · ouvir                          ← rodapé do turno
```

- Andamento e resposta **nunca** entram na dobra das ferramentas (lição 2.1). O andamento tem cara própria: texto 15 px em `--cor-tinta-2`, com um fio vertical de 2 px à esquerda em `--cor-linha`, para não ser confundido com resposta (reclamação 94354).
- A ordem é a da produção do modelo (2.6). Nada é reordenado para o topo.
- "Entendi: …" vem do prompt do agente (a frente de voz já recomenda esse eco como segundo seguro contra transcrição errada, `conversa-pesquisa-voz.md:144`). Se o modelo não escrever, a tela não inventa.

### 4.2 Fala do dono

**Texto:** bloco alinhado à direita, largura máxima 85%, fundo `--cor-superficie-2`, raio 12, texto 17 px. Hora em mono 13 acima ("14:32"), só quando passa de 5 min da fala anterior.

**Áudio:**
```
                    ┌───────────────────────────────┐
                    │ ▶  ▂▅▇▃▆▂▅▇▆▃▂▅▃▆▇▅▂  0:24    │
                    │ "Faz o gancho com a Lavínia   │
                    │ falando da picanha, e corta   │
                    │ seco na virada da música."    │
                    │                  editado · ver│
                    └───────────────────────────────┘
```
- O botão ▶ toca o áudio original **só se ele foi guardado**; pela frente de voz, o padrão é apagar o áudio depois de transcrever (`conversa-pesquisa-voz.md:171`). Sem áudio guardado, o bloco mostra só a transcrição com um ícone de microfone e "0:24".
- As barras da onda são estáticas (calculadas na gravação), 24 barras, sem animação.
- "editado" aparece quando o Marcos corrigiu a transcrição antes de mandar; "ver" mostra as duas versões. É o dado que a frente de voz usa para decidir se vale pagar transcrição (`conversa-pesquisa-voz.md:145`, `:196`).
- Mensagem enviada durante um turno da mesa ganha a etiqueta mono 13 "na fila · entra no próximo passo".
- Sem internet: etiqueta "não enviada · tentar" em `--cor-alerta`.

### 4.3 Resposta da mesa
- Sem balão, largura total, texto 17 px, linha 1,5. Markdown restrito: negrito, listas, tempo em mono. **Sem imagem remota e sem link automático** (defesa contra injeção, `conversa-pesquisa-agente.md`, linha 66).
- **Todo tempo citado vira toque:** "0:14" em mono sublinhado pontilhado abre o palco naquele ponto. É o gesto que faz o Marcos sentir que conversa com alguém que viu o filme.
- Assinatura: a voz da mesa é o **Nimbus** (o diretor de operações da casa, que coordena). Avatar de 24 px na primeira linha da resposta, só quando muda quem fala. O prompt de sistema da frente do agente chama a voz de "Montador" (`conversa-pesquisa-agente.md`, linha 306); proponho trocar para Nimbus para casar com a casa. Se o Marcos preferir outro nome, muda numa linha do prompt e numa constante do site.
- Escrevendo: o texto entra em lotes de ~60 ms (o servidor já junta assim, `conversa-pesquisa-agente.md`, linha 44) sem cursor piscando.

### 4.4 Grupo da equipe e cartão de ferramenta em uso

Rodando (um por ferramenta ativa, empilhados):
```
 ◐ Radar   Ouvindo as 14 falas da Lavínia      0:06
 ━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░░░░░░░░   (2 px, só se houver progresso)
```
Concluído, o grupo recolhe numa linha:
```
 ✓ Radar, Eco · 4 passos · 0:41                      ›
```
Aberto (toque na linha):
```
 ✓ Radar  Ouviu 14 falas da Lavínia             0:06  ›
 ✓ Radar  Revisou 38 planos                     0:02  ›
 ✓ Eco    Achou a virada da música em 0:14      0:03  ›
 ✓ Nimbus Lembrou 12 regras da casa             0:01  ›
```
Toque num passo abre a **gaveta "Bastidores do passo"** (detalhe técnico):
```
 ┌──────────────────────────────────────────────┐
 │                ────                          │
 │ Eco · Achou a virada da música em 0:14       │
 │ ferramenta   listar_biblioteca               │
 │ começou      14:32:08 · durou 3,1 s          │
 │ pedido                                        │
 │ { "filtro": "trilha_atual", "pagina": 1 }    │
 │ resultado (resumo)                            │
 │ 6 trilhas · atual: "Feira Quente" 0:14 drop  │
 │ [ Copiar ]                                    │
 └──────────────────────────────────────────────┘
```
- O ícone de estado combina forma e texto, não só cor: ◐ rodando, ✓ feito, ! erro, ⏸ esperando você. Ícones em traço Lucide (`design-editor-25-11.md:305`), nunca emoji.
- O tempo corre em mono 13 com `tabular-nums`.
- Rótulo no **gerúndio** enquanto roda e no **passado com o número** quando termina ("Ouvindo as falas…" → "Ouviu 14 falas…"), como o "Ran 7 commands" do Claude Code. O número vem do resultado da ferramenta, montado pelo site, nunca do texto do modelo.
- JSON no detalhe: mono 13, no máximo 12 linhas e o resto em "ver tudo"; campos com `"nao_confiavel": true` aparecem com a etiqueta "texto de fora" (`conversa-pesquisa-agente.md`, seção 8).
- **Modo Bastidores** (interruptor no menu "…" do topo, lembrado por aparelho em `localStorage`): todos os grupos abertos e o nome técnico ao lado do rótulo. É o "Verbose" do Claude Code para quando o Marcos quiser conferir as ferramentas, como ele pediu.
- Etapas do pipeline (ingest, análise, montagem…) entram no fio pelo mesmo cartão, alimentadas pelos eventos `etapa_inicio`, `etapa_progresso`, `etapa_fim` e `etapa_erro` que o site já escuta (`apps/web/componentes/Projeto.tsx:103-104`). Assim, a montagem disparada por botão também aparece na conversa, e o fio vira o diário completo do filme.

### 4.5 Pergunta da mesa (ferramenta `perguntar`)
```
 ┌──────────────────────────────────────────────┐
 │ ⏸ Nimbus pergunta                            │
 │ A trilha nova tem a virada em 0:14, mas a    │
 │ melhor fala da Lavínia termina em 0:16.      │
 │ Qual caminho?                                 │
 │ ┌──────────────────────────────────────────┐ │
 │ │ Cortar a fala em 0:14      sugestão      │ │
 │ └──────────────────────────────────────────┘ │
 │ ┌──────────────────────────────────────────┐ │
 │ │ Atrasar a virada para 0:16               │ │
 │ └──────────────────────────────────────────┘ │
 │ ┌──────────────────────────────────────────┐ │
 │ │ Manter a trilha antiga                   │ │
 │ └──────────────────────────────────────────┘ │
 │ Responder do meu jeito                        │
 └──────────────────────────────────────────────┘
```
- Opções empilhadas em largura total, 52 px cada (cabe dedo grande andando na loja). Fundo `--cor-superficie-2`, borda `--cor-linha`. **A sugestão do editor leva a etiqueta mono 13 "sugestão", não o âmbar** (âmbar = "toque aqui agora", `design-editor-25-11.md:105`). Assim o Marcos escolhe, não só confirma.
- "Responder do meu jeito" põe o foco no campo, com o texto "Respondendo ao Nimbus…" no lugar do placeholder. O microfone também responde.
- Respondida: o cartão recolhe para uma linha "Você escolheu: Cortar a fala em 0:14" e a escolha fica em tinta invertida.
- Pergunta sem resposta quando o Marcos manda outra coisa: o cartão fica com "respondida pela sua mensagem" (o servidor transforma o texto dele no `tool_result`, `conversa-pesquisa-agente.md`, linha 86).
- Até 4 opções (limite da ferramenta). Pergunta aberta, sem opções, é só texto da resposta, sem cartão.

### 4.6 Confirmação antes de gastar ou refazer (risco `confirma`)
```
 ┌──────────────────────────────────────────────┐
 │ ⏸ Antes de seguir, preciso do seu toque      │
 │ Refazer a direção da V2 com a trilha nova    │
 │                                               │
 │ roda de novo   Direção → Montagem → Conferência│
 │ custa          ≈ R$ 1,03 (US$ 0,19)          │
 │ demora         ~ 9 min                        │
 │ dá para voltar sim, a V1 fica guardada        │
 │ ┌──────────────────────────────────────────┐ │
 │ │ Refazer a direção                        │ │  ← âmbar
 │ └──────────────────────────────────────────┘ │
 │   Agora não                                   │
 └──────────────────────────────────────────────┘
```
- As quatro linhas vêm do registro de ferramentas e da cascata do pipeline (`pipeline.py:50-92`; `conversa-pesquisa-agente.md`, linha 102), não do texto do modelo.
- Custo: o número em reais primeiro, o dólar entre parênteses. **A taxa de câmbio não existe no código hoje**: proponho `EDITOR_CAMBIO` com a data da cotação no Caderno. O exemplo usa 5,40 apenas para a conta (US$ 0,19 × 5,40 = R$ 1,03); cotação real: não confirmada.
- Tempo: média das últimas 5 rodadas daquela etapa no projeto (dado que o motor tem em `eventos`, com `ts`); sem histórico, "alguns minutos".
- O botão âmbar diz o verbo da ação ("Refazer a direção"), nunca "Confirmar". "Agora não" é texto, sem caixa.
- Ação `avisa` (executa e permite voltar): sem cartão, só uma linha no grupo, "✓ Eco · Trilha trocada · **Desfazer**", e um toast "Trilha trocada. Desfazer" por 6 s.

### 4.7 Cartões de resultado
Aparecem logo depois do grupo da equipe que os produziu. Todos tocáveis, abrindo o resultado **no palco** (padrão Lovable: o detalhe abre onde fica a prévia).

| cartão | o que mostra | toque |
|---|---|---|
| **Quadro** | imagem do quadro 16:9 ou 9:16 com etiqueta mono "0:14 · C0016" no canto | abre o palco em 0:14 |
| **Prévia do plano** (direção) | até 6 linhas "0:00–0:03 Gancho · Lavínia: 'Gente, olha isso'" com miniatura de 32x56 por linha; "ver as 11 cenas" | abre a gaveta com o plano inteiro |
| **Antes e depois de cor** | um quadro dividido com alça de 44 px que arrasta; rótulos "Antes" e "Depois · look Feira"; o componente `Cor.tsx` já existe | arrastar compara; toque longo segura "antes" |
| **Música** | onda da trilha com marcador na virada e "▶ ouvir 10 s" a partir de 4 s antes | toca o trecho (toque do usuário libera o som no iOS, `conversa-pesquisa-voz.md:116`) |
| **Falas** | 3 falas com tempo e quem fala, a escolhida em negrito; "ver as 14" | abre o palco na fala |
| **Versão pronta** | capa, "V2 pronta · 0:45 · feita em 18:42" e "Assistir" | abre o palco grande com o filme; Aprovar continua na barra |
| **Conferência** | "Passou em 20 de 21 conferências; uma pede seu olho: legenda sobre o rosto em 0:09" (o QA tem 21 verificações em `services/motor/motor/etapas/qa/`) | abre o palco em 0:09 |

### 4.8 Custo
- **Rodapé do turno** (mono 13, `--cor-tinta-2`): "R$ 0,59 · 38 s · ouvir". O valor é o do evento `turno_fim` (tokens e US$ calculados por `orcamento.uso`, `conversa-pesquisa-agente.md`, linha 63). Ordem de grandeza: ~US$ 0,11 por turno e US$ 2,22 por conversa de 20 turnos na simulação da frente do agente (linhas 163 e 168), que é premissa, não medida.
- **Gasto da conversa** no menu "…" do topo: "Esta conversa: R$ 4,10 · hoje: R$ 6,80 de R$ 15,00". O teto vem de `EDITOR_CONVERSA_TETO_USD_DIA` (proposto na frente do agente, linha 24); os R$ 15,00 do exemplo são ilustrativos.
- **Cartão de teto** (só quando passa de 80% do teto do dia):
  ```
  ! Perto do limite de hoje: R$ 12,40 de R$ 15,00.
    Posso seguir conversando, mas nada pago roda sem o seu toque.
    [ Ver gastos ]
  ```
- Sem custo em toda linha de ferramenta. O Descript diz que o custo é "non-deterministic"; mostrar centavos a cada passo vira ruído e ansiedade. O total do turno e a estimativa antes do que é pago cobrem o que importa.

### 4.9 Erro com "Tentar de novo"
```
 ┌──────────────────────────────────────────────┐
 ▌ ! A montagem parou                           │
 ▌ Falta o logo do Super Kal na biblioteca.     │
 ▌ ┌──────────────────────────────────────────┐ │
 ▌ │ Tentar de novo                           │ │  ← âmbar se for a próxima jogada
 ▌ └──────────────────────────────────────────┘ │
 ▌ Mandar o logo   ·   ver detalhes            │
 └──────────────────────────────────────────────┘
```
- Filete de 3 px em `--cor-alerta` à esquerda, fundo neutro. Nada de cartão inteiro vermelho, e nunca o vermelho Aba 71 (`design-editor-25-11.md:105`).
- A primeira linha diz **o que parou**, a segunda **por quê, em uma frase**, e o botão diz o que fazer. "ver detalhes" abre a gaveta com etapa, horário, mensagem técnica do motor (`pipeline.py:97-100` corta em 300 caracteres) e o id do turno.
- Tipos e textos exatos na seção 8.6.

---

## 5. Wireframes (390x844, celular, tema escuro)

Largura útil de 358 px (gutter 16). Alturas em px.

### W1. Projeto editando, conversa rolada (palco encolhido)
```
┌──────────────────────────────────────────────┐ 0
│ 9:41                                  ▮▮▮ ◼  │
├──────────────────────────────────────────────┤ 47
│ ‹ ²   Reel Super Kal · carnes      ● ao vivo │ 56
├──────────────────────────────────────────────┤ 103
│ ▓▓  12:04  de 30:00          (Fa)(Ec)(Pa) +1 │ 72  palco encolhido
│ ▓▓  Montando a V1                            │
├──────────────────────────────────────────────┤ 175
│                     ┌──────────────────────┐ │
│                     │ Deixa a música mais  │ │
│                     │ baixa quando ela fala│ │
│                     └──────────────────────┘ │
│ (Ni) Entendi: música abaixo da fala, sem     │
│      perder a energia.                       │
│ ┊ Vou pedir para o Eco refazer só a mixagem. │
│ ◐ Eco   Mixando: música abaixo da fala  0:21 │
│ ━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░░░░░░░░░ │
│                                              │
│                                              │
│                 ↓ 1 novidade                 │
├──────────────────────────────────────────────┤ ~698
│ [mic]  Fale com a mesa…                [ ■ ] │ 56  (■ = Parar)
│                                              │
└──────────────────────────────────────────────┘ 844
```
(Fa)(Ec)(Pa) = avatares de 24 px de Faísca, Eco e Paleta.

### W2. Projeto novo, conversa vazia (palco grande = envio)
```
│ ‹      Reel Super Kal · carnes               │
├──────────────────────────────────────────────┤
│ PALCO: envio                                 │
│  4 vídeos · 2,3 GB · lidos                   │
│  [ + Mais vídeos ]                           │
├──────────────────────────────────────────────┤
│ (Ni) Li os 4 vídeos. Tem a Lavínia falando   │
│      da picanha e da promoção de sexta.      │
│      O que você quer com eles?               │
│                                              │
│  ┌ Reel de 30 s com a promoção ────────────┐ │
│  ┌ Me mostra as melhores falas ────────────┐ │
│  ┌ Decide você e me mostra ────────────────┐ │
├──────────────────────────────────────────────┤
│ [ Começar a edição ]   (só depois do pedido) │
│ [mic]  Diga o que você quer…           [ ↑ ] │
```
As três sugestões são mensagens prontas (tocar envia). Elas vêm do estado do projeto, não são fixas. A primeira mensagem do Nimbus só aparece depois que o material foi lido e custa um turno (~US$ 0,11): ligar por preferência no Caderno, padrão desligado até o Marcos aprovar o gasto (ver 9.2).

### W3. Pergunta aberta (barra sem âmbar)
```
│ ▓▓  08:40  de 30:00                 (Ni)     │
├──────────────────────────────────────────────┤
│ ✓ Faísca, Eco · 3 passos · 0:12            › │
│ ┌──────────────────────────────────────────┐ │
│ │ ⏸ Nimbus pergunta                        │ │
│ │ A trilha nova tem a virada em 0:14, mas  │ │
│ │ a melhor fala termina em 0:16.           │ │
│ │ ┌────────────────────────────────────┐   │ │
│ │ │ Cortar a fala em 0:14   sugestão   │   │ │
│ │ ├────────────────────────────────────┤   │ │
│ │ │ Atrasar a virada para 0:16         │   │ │
│ │ ├────────────────────────────────────┤   │ │
│ │ │ Manter a trilha antiga             │   │ │
│ │ └────────────────────────────────────┘   │ │
│ │ Responder do meu jeito                   │ │
│ └──────────────────────────────────────────┘ │
├──────────────────────────────────────────────┤
│ [mic]  Fale com a mesa…                [ ↑ ] │
```

### W4. Confirmação com custo
Igual ao cartão da seção 4.6, no fim do fio. A linha 1 da barra some. O cartão é o único âmbar da tela.

### W5. Gravando e transcrevendo
```
gravando:
├──────────────────────────────────────────────┤
│ ● Gravando  0:12 / 1:30                      │  ● em --cor-aba
│ ▁▂▅▇▅▃▂▁▂▅▇▆▃▂ (nível ao vivo)               │
│ [ Lixeira ]                     [ ■ Parar ]  │  56 px cada
└──────────────────────────────────────────────┘
transcrevendo:
│ ◐ Transcrevendo 0:24 de áudio…               │
│ ━━━━━━━━━━━━━━━░░░░░░░░                      │
pronto:
│ ┌──────────────────────────────────────────┐ │
│ │ Faz o gancho com a Lavínia falando da    │ │  campo editável
│ │ picanha, e corta seco na virada.         │ │
│ └──────────────────────────────────────────┘ │
│ [ Gravar de novo ]              [ Enviar ↑ ] │
```
- Tocar para começar e tocar para parar, teto de 90 s, e cair para "Toque no microfone do teclado" se o `getUserMedia` falhar (decisões da frente de voz, `conversa-pesquisa-voz.md:46`, `:136`, `:185`).
- O ponto vermelho "gravando" é o único uso de status do vermelho Aba 71, como já prevê a direção (`design-editor-25-11.md:124`).
- Enquanto grava, o fio continua vivo: o Marcos pode ver a montagem andando enquanto fala.

### W6. Bastidores de um passo (gaveta)
Ver o desenho da seção 4.4. Gaveta de até 85 dvh, alça 36x4, fecha arrastando (`design-editor-25-11.md:205`).

### W7. Execução longa e notificação
```
│ ▓▓  14:30  de 30:00       (Ec)(Pa)(Ór) +1    │
├──────────────────────────────────────────────┤
│ ◐ Órbita  Animando as legendas        1:12   │
│ ◐ Trilho  Renderizando 1080x1920      3:12   │
│ ━━━━━━━━━━━━━━━━░░░░░░░░░░░░  ~6 min        │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ Pode bloquear a tela. Eu aviso quando a  │ │
│ │ V2 ficar pronta ou se eu precisar de você.│ │
│ │ [ Me avisar no celular ]                 │ │  só se ainda não autorizou
│ └──────────────────────────────────────────┘ │
```
Tela bloqueada (notificação do sistema):
```
┌──────────────────────────────────────────────┐
│ EDITOR                               agora   │
│ V2 pronta · 0:45 · feita em 18:42            │
│ Reel Super Kal · carnes. Toque para assistir.│
└──────────────────────────────────────────────┘
```
Ao voltar para o app depois de mais de 2 min fora, o fio abre com um cartão-resumo:
```
│ Enquanto você esteve fora (12 min)           │
│ ✓ 9 passos · Faísca, Eco, Paleta, Lupa       │
│ ✓ V2 pronta · passou em 20 de 21 conferências│
│ [ Assistir a V2 ]                            │
```

### W8. Erro e sem internet
```
├──────────────────────────────────────────────┤
│ Sem internet. O que você mandar sai quando   │  faixa de 40 px, abaixo do topo
│ voltar.                                      │  --cor-superficie-2, sem vermelho
├──────────────────────────────────────────────┤
│                     ┌──────────────────────┐ │
│                     │ Troca a trilha       │ │
│                     └──────────────────────┘ │
│                          não enviada · tentar │
│ ▌ ! A montagem parou                         │
│ ▌ Falta o logo do Super Kal na biblioteca.   │
│ ▌ [ Tentar de novo ]                         │
│ ▌ Mandar o logo · ver detalhes               │
```

### W9. Entregue (o palco volta grande)
```
│ ‹      Reel Super Kal · carnes               │
├──────────────────────────────────────────────┤
│ ┌──────────────┐                             │
│ │   FILME 9:16 │  feito em 18:42  [Aba 71]   │  momento-assinatura da onda 4
│ │              │                             │
│ └──────────────┘                             │
│ Ficha técnica: Direção Faísca · Cor Paleta · │
│ Som Eco · Legendas Órbita · Conferência Lupa │
├──────────────────────────────────────────────┤
│ (Ni) A V2 está pronta. Mudei o gancho para a │
│      fala da picanha em 0:03 e baixei a      │
│      música 9 dB sob a fala. Uma conferência │
│      pede seu olho: legenda no rosto em 0:09.│
├──────────────────────────────────────────────┤
│ [ Aprovar ]               [ Pedir ajuste ]   │
│ [mic]  Fale com a mesa…                [ ↑ ] │
```
"Pedir ajuste" pode ser falado: o que o Marcos disser no campo depois de uma entrega vira ajuste da versão (pela ferramenta `reprovar_versao` ou `mudar_pedido`, com confirmação). A gaveta de ajuste da onda 2 continua para quem preferir.

---

## 6. A equipe trabalhando

### 6.1 Princípio
A casa tem 15 agentes com nome, cor e boneco (`CLAUDE.md` da raiz; `sede/index.html:263-341`, lista `AGENTS` com `nick`, `role` e `color`). O editor não tem 15 modelos rodando; tem ferramentas do agente e etapas do motor. A proposta é **dar a cada função real um responsável da casa**, de forma fixa e documentada. Assim:
- é verdade (só aparece quem tem trabalho real executando; "ousadia na forma, verdade no conteúdo");
- é útil (o Marcos lê "Eco" e já sabe que é som, sem ler o rótulo inteiro);
- é a mesma equipe que o cliente vê na sede e na página de aprovação (tese).

### 6.2 Quem faz o quê (tabela para `lib/equipe.ts`)

Ferramentas do agente (nomes de `conversa-pesquisa-agente.md`, seção 10) e etapas do motor (`services/motor/motor/etapas/`).

| função real | agente | rodando (gerúndio) | feito (passado, com número) |
|---|---|---|---|
| conversa, `perguntar`, `ler_projeto`, `ler_memoria`, `registrar_decisao`, `ver_gastos` | **Nimbus** | "Olhando o projeto" · "Lembrando as regras da casa" · "Anotando a decisão" · "Somando os gastos" | "Olhou o projeto: 4 vídeos, pedido de 30 s" · "Lembrou 12 regras" · "Anotado: legenda amarela neste cliente" |
| `ingest`, `etapas/montagem/comp.py` (render), `entrega` | **Trilho** | "Recebendo C0016.MP4 (1,2 GB)" · "Renderizando 1080x1920" · "Entregando o filme" | "Recebeu 4 vídeos" · "Renderizou em 3:40" · "Entregou a V2" |
| `analise`, `catalogo`, `ler_catalogo`, `mostrar_falas` | **Radar** | "Lendo o material: falas e quadros" · "Ouvindo as falas da Lavínia" · "Revendo os planos" | "Ouviu 14 falas da Lavínia" · "Revisou 38 planos" |
| `direcao`, `mudar_pedido` | **Faísca** | "Dirigindo o filme" · "Ajustando o pedido" | "Dirigiu a V2: 11 cenas, 45 s" · "Pedido ajustado · Desfazer" |
| `resolvedor` (encaixe de tempos) | **Cirro** | "Encaixando os cortes no tempo" | "Encaixou 11 cortes" |
| `cor` (`etapas/cor.py`) | **Paleta** | "Corrigindo a cor por ambiente" | "Corrigiu 3 ambientes · look Feira" |
| `montagem/trilha.py`, `mix.py`, `voz.py`, `dfn3.py`, `listar_biblioteca`, `trocar_trilha` | **Eco** | "Procurando a virada da música" · "Limpando a voz" · "Mixando: música abaixo da fala" | "Achou a virada em 0:14" · "Voz limpa" · "Música 9 dB abaixo da fala" |
| `montagem/overlay.py` (legendas animadas) | **Órbita** | "Animando as legendas" | "Animou 23 legendas" |
| `montagem/fx.py` (efeitos e transições) | **Prisma** | "Desenhando as transições" | "Fez 4 transições" |
| texto de legenda e correção de fala (`qa/fatos.py` corrige na legenda o que a pessoa falou errado) | **Verbo** | "Acertando o texto das legendas" | "Corrigiu 2 legendas" |
| `qa` (21 conferências em `etapas/qa/`), `ler_versao` | **Lupa** | "Conferindo o rótulo: 275 ml" · "Conferindo áudio, logo e zona segura" | "Passou em 20 de 21" |
| `reprovar_versao`, `qa/regra_memoria.py` (regras da casa aplicadas) | **Crivo** | "Revisando contra as regras da casa" | "Virou regra: nunca legenda sobre o rosto" |
| triagem de texto de fora (`ler_cliente`, eventos tipo `cliente`) | **Muralha** | "Conferindo o texto do cliente" | "Texto do cliente lido; tinha uma ordem escondida, não segui" |
| — | **Pixel, Forja** | nunca aparecem no filme | eles construíram o editor; aparecem só no Caderno, em "Sistema" |

- O rótulo é montado pelo site com os dados do evento (`entrada` da ferramenta e resumo do `ferramenta_fim`). O modelo não escreve rótulo, então não inventa número.
- Ferramenta sem linha na tabela cai em "Nimbus · Trabalhando" e o nome técnico aparece no detalhe. Isso evita tela quebrada quando o motor ganhar ferramenta nova antes do site.

### 6.3 Como aparece (e o que é proibido)
- **Avatar de 24 px** com o busto do boneco **aprovado** daquele agente, recortado de uma arte que já existe (os bonecos da sessão de vídeo, `assets/brand/agentes`, citados no CLAUDE.md global; não encontrei essa pasta neste repositório: não confirmado onde estão hoje). Enquanto a arte não estiver no projeto, o avatar é um disco com a cor do agente (`sede/index.html:264-341`) e a inicial em Montserrat Black. **Nunca desenhar um boneco novo ou simplificado** para caber no ícone (regra do Marcos de 11/11 sobre personagens; vale como cuidado também para os bonecos dos agentes).
- A cor do agente só existe dentro do avatar. Nunca em texto, fundo ou borda de cartão. Cada cor da interface continua com um trabalho só (`design-editor-25-11.md:105`).
- "Trabalhando" = anel de 2 px em volta do avatar, pulsando a cada 1,6 s com opacidade de 0,4 a 1. Com `prefers-reduced-motion`, o anel fica fixo.
- Nome + verbo + tempo. Sem frases de personagem ("Oi! Sou o Eco!"), sem balão, sem pulinho, sem som. A personalidade fica no boneco e na sede.
- Quando um agente termina, o ✓ é desenhado como traço de SVG em 240 ms (movimento que a direção já previu, `design-editor-25-11.md:151`).

### 6.4 Sede 3D e página do cliente
- **No editor, a sede não roda.** Three.js com 15 personagens em 4G e bateria de celular de evento não é a próxima jogada do Marcos. No menu "…" do projeto fica "Ver a equipe na sede", que abre a sede com o estado deste projeto.
- **A sede já sabe ler um estado ao vivo:** `aplicarEstado` e `renderLive` usam `fluxos[].agentes[]` com `personagem`, `status` (`trabalhando`/`feito`), `acao`, `label` e `segundos` (`sede/index.html:1054-1069`), puxando `estado.json` a cada 5 s ou o banco do artefato (`sede/index.html:1080-1092`). E a cada 6 s quem trabalha "conta" o que faz num balão (`sede/index.html:1071-1078`). Basta o motor publicar o fio do projeto nesse mesmo formato (um `fluxo` por versão, um `agente` por passo, com o rótulo da tabela 6.2). Nenhuma mudança na sede.
- **Página do cliente (`/c/`):** no rodapé, a **ficha técnica** do filme, como créditos de cinema: "Direção Faísca · Cor Paleta · Som Eco · Legendas Órbita · Conferência Lupa · Produção creat.MTT" e "feito em 18:42", com o link "ver a equipe na sede". Só entram os agentes que executaram passos daquela versão. É a prova que vende o próximo filme e respeita a regra de não afirmar o que não aconteceu.

---

## 7. Estados

| estado | o que aparece | onde |
|---|---|---|
| **vazio** (projeto sem conversa) | nada do Nimbus até o material ser lido; depois, a mensagem de abertura (W2) se a preferência estiver ligada, ou só o placeholder "Diga o que você quer…" e 3 sugestões | fio |
| **digitando** | o campo cresce até 5 linhas (máximo de 132 px) e depois rola por dentro; o botão enviar fica em tinta cheia (não âmbar); `enterkeyhint="send"`; Enter no celular quebra linha | barra |
| **gravando** | W5; `navigator.wakeLock` se existir (iOS Safari 16.4+, `conversa-pesquisa-voz.md:33`; na PWA, não confirmado) | barra |
| **transcrevendo** | "Transcrevendo 0:24 de áudio…" com barra; 2 a 4 s medidos com CPU ociosa (`conversa-pesquisa-voz.md:11`) | barra |
| **pensando** (antes do primeiro texto ou ferramenta) | "Nimbus está pensando · 4 s" com o tempo correndo; aos 20 s soma "ainda pensando, é uma decisão grande"; nunca três pontinhos. A doc avisa que há "uma pausa de alguns segundos antes do bloco de progresso abrir" (`conversa-pesquisa-agente.md`, linha 65) | fio |
| **escrevendo** | o texto entra em lotes; o botão Parar ■ substitui o enviar com o campo vazio | fio e barra |
| **executando longo** | W7: grupo da equipe vivo, barra com "~6 min" e cartão "Pode bloquear a tela"; o fio para de rolar sozinho se o Marcos rolou para cima | fio |
| **tela bloqueada** | notificação "pronta" ou "precisa de você" (seção 7.1); ao voltar, o cartão "Enquanto você esteve fora" | sistema e fio |
| **esperando você** | cartão de pergunta ou confirmação; pílula "Nimbus espera sua resposta ↑" na barra se o cartão saiu da tela; selo no cartão da lista de projetos; badge no ícone do app | fio, barra, lista |
| **na fila** | mensagem mandada durante um turno: "na fila · entra no próximo passo"; tocar oferece "Parar e mandar agora" | fio |
| **reconectando** | o ponto "ao vivo" do topo vira "reconectando…" em `--cor-tinta-2`; depois de 10 s, toast (`design-editor-25-11.md:218`) | topo |
| **offline** | faixa de 40 px "Sem internet. O que você mandar sai quando voltar."; mensagens ficam "não enviadas" e saem sozinhas na volta, na ordem | abaixo do topo |
| **interrompido** (motor reiniciou no meio) | cartão "Fui interrompido no meio do passo. Continuo de onde parei?" com "Continuar" | fio |

### 7.1 Notificação com a tela bloqueada (o melhor disponível no iPhone hoje)
- **Requisito:** só app da Tela de Início recebe Web Push no iPhone, e o pedido de permissão tem de vir "in response to direct user interaction" (WebKit, 16/02/2023, iOS 16.4: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). O editor já é `standalone` (`apps/web/public/manifest.webmanifest`), e no iOS 26 todo site adicionado à Tela de Início abre como app por padrão (resumo de busca citando a doc da Apple; não abri a página).
- **Declarative Web Push** (WebKit, 27/03/2025, iOS 18.4): mostra a notificação "without requiring an installed service worker", com JSON padrão: `web_push`, `notification.title` (obrigatório), `notification.navigate` (obrigatório, a URL que abre), `body`, `silent` e `app_badge` (https://webkit.org/blog/16535/meet-declarative-web-push/). Ainda é proposta experimental do WebKit; o `pushsubscriptionchange` não é emitido no WebKit (https://bugs.webkit.org/show_bug.cgi?id=294421, resumo de busca), então o site precisa reassinar quando abrir.
- **Badge no ícone** = número de projetos "esperando você", pela Badging API (iOS 16.4+, mesma fonte de 2023) e pelo `app_badge` do push.
- **Quando mandar** (só duas razões, como o Claude Code): (1) versão pronta ou etapa longa terminada; (2) o editor precisa de uma decisão (pergunta, confirmação, erro que pede ação). **Não mandar** se o app está visível (`document.visibilityState === "visible"` informado ao motor pelo SSE aberto), seguindo o "skips mobile push notifications while you are typing" do Claude Code.
- **Pedido de permissão:** nunca no primeiro acesso. Só no cartão "Pode bloquear a tela. Eu aviso…" de uma execução longa, com o botão "Me avisar no celular" (é o gesto que o iOS exige).
- **Custo:** o envio passa pelo serviço de push da Apple, de graça até onde sei (não achei a frase oficial sobre preço: não confirmado). Do nosso lado: chaves VAPID e uma biblioteca de Web Push no motor ou no site (versão e licença a conferir antes de instalar: não confirmado).
- **Live Activity (Ilha Dinâmica):** não existe para web app; só app nativo (os exemplos da busca são apps nativos de terceiros). Fica fora.
- **Vibração:** a Vibration API não existe no Safari do iPhone, de 3.2 a 27.2 (https://caniuse.com/vibration). O `navigator.vibrate(8)` da direção (`design-editor-25-11.md:150`) só vale no Android; nada na conversa pode depender de vibrar.
- **União Europeia:** relato de terceiro diz que push em PWA não funciona lá; irrelevante para o Marcos no Brasil.

---

## 8. Componentes novos e textos exatos

### 8.1 Componentes (para `apps/web/componentes/`, nenhum criado)

| componente | papel | entra de | notas |
|---|---|---|---|
| `Mesa.tsx` | o layout palco + fio + barra dentro do projeto; decide palco grande ou encolhido | `Projeto.tsx` | usa `IntersectionObserver` no fim do fio para "↓ N novidades" |
| `PalcoFaixa.tsx` | a faixa de 72 px (capa, timecode 32 px, avatares ativos) | `Mesa` | toque = palco grande |
| `Fio.tsx` | a lista com `role="log"` e `aria-label="Conversa com a mesa"` | SSE da conversa + eventos do pipeline | agrupa por turno |
| `FalaDono.tsx` | texto ou áudio + transcrição, estados "na fila" e "não enviada" | `Fio` | |
| `RespostaMesa.tsx` | texto em Markdown restrito, tempos tocáveis, assinatura do agente | `texto`, `texto_final` | `aria-busy="true"` até `texto_final` |
| `Andamento.tsx` | linha de progresso com fio vertical | `andamento` | |
| `GrupoEquipe.tsx` + `PassoEquipe.tsx` | linha recolhível e cada passo | `ferramenta_inicio/entrada/fim`, `etapa_*` | rótulos de `lib/equipe.ts` |
| `AvatarAgente.tsx` | 24 px, anel "trabalhando" | `lib/equipe.ts` | só arte aprovada ou disco com inicial |
| `CartaoPergunta.tsx` | até 4 opções + "Responder do meu jeito" | `pergunta` | POST `/conversa/respostas` |
| `CartaoConfirmacao.tsx` | o quê, roda de novo, custa, demora, dá para voltar | `confirmacao` | POST `/conversa/confirmacoes` com `entrada_hash` |
| `CartaoResultado.tsx` | variantes quadro, plano, cor, música, falas, versão, conferência | resultado das ferramentas | reaproveita `Cor.tsx` |
| `CartaoErro.tsx` | o que parou, por quê, ação | `erro`, `etapa_erro` | |
| `RodapeTurno.tsx` | R$ · tempo · ouvir | `turno_fim` | "ouvir" com `speechSynthesis` (`conversa-pesquisa-voz.md:128`) |
| `Compositor.tsx` | campo, microfone, enviar/Parar, gravação, transcrição | layout raiz (o gravador fica fora da página, `conversa-pesquisa-voz.md:47`) | `<textarea lang="pt-BR" enterkeyhint="send">` |
| `GavetaBastidores.tsx` | detalhe técnico de um passo | `Gaveta.tsx` da onda 2 | |
| `ResumoAusencia.tsx` | "Enquanto você esteve fora" | estado salvo do último evento visto | |
| `lib/equipe.ts` | tabela 6.2: função → agente → rótulos | — | testes de unidade dos rótulos |

Eventos usados (definidos na frente do agente, `conversa-pesquisa-agente.md`, linhas 41-43): `turno_inicio`, `ferramenta_inicio`, `ferramenta_entrada`, `ferramenta_fim`, `pergunta`, `confirmacao`, `texto_final`, `turno_fim`, `erro` (com `id`), e os efêmeros `texto`, `andamento`, `pipeline` (sem `id`), mais o `instantaneo` ao reconectar. A tela não precisa de nenhum evento além desses e dos que o pipeline já emite.

### 8.2 Tokens novos (somam aos de `app/globals.css:17-56`)
```
--altura-faixa-palco: 72px;
--altura-compositor: 56px;
--largura-fala-dono: 85%;
--fio-andamento: 2px solid var(--cor-linha);
--anel-trabalhando: 2px;
--duracao-anel: 1600ms;       /* pulso do avatar; corte seco com reduced-motion */
--lote-texto: 60ms;           /* casa com o lote do servidor */
```
Nenhuma cor nova. Cores dos agentes só dentro de `AvatarAgente` (`sede/index.html:264-341`).

### 8.3 Textos da barra e do campo
| situação | texto |
|---|---|
| placeholder padrão | Fale com a mesa… |
| projeto sem pedido | Diga o que você quer… |
| respondendo a uma pergunta | Respondendo ao Nimbus… |
| botão microfone (`aria-label`) | Gravar áudio |
| botão enviar (`aria-label`) | Enviar |
| botão parar (`aria-label`) | Parar a mesa |
| pílula de pergunta fora da tela | Nimbus espera sua resposta |
| pílula de novidades | ↓ 1 novidade / ↓ 3 novidades |
| microfone falhou | O microfone do app não abriu. Toque no microfone do teclado para ditar. |
| gravando | Gravando 0:12 / 1:30 |
| perto do teto da gravação | Faltam 10 s |
| transcrevendo | Transcrevendo 0:24 de áudio… |
| transcrição pronta | Confira e envie. Gravar de novo |

### 8.4 Textos do fio
| situação | texto |
|---|---|
| pensando | Nimbus está pensando · 4 s |
| pensando longo (20 s) | Ainda pensando. É uma decisão grande. |
| grupo concluído | Radar, Eco · 4 passos · 0:41 |
| cabeçalho da pergunta | Nimbus pergunta |
| sugestão | sugestão |
| resposta livre | Responder do meu jeito |
| pergunta respondida | Você escolheu: {opção} |
| pergunta respondida por texto | Respondida pela sua mensagem |
| cabeçalho da confirmação | Antes de seguir, preciso do seu toque |
| linhas da confirmação | roda de novo · custa · demora · dá para voltar |
| recusa | Agora não |
| depois de recusar | Combinado, não refiz nada. |
| ação com volta | Trilha trocada. Desfazer |
| depois de desfazer | Voltei para a trilha anterior. |
| mensagem na fila | na fila · entra no próximo passo |
| opção da fila | Parar e mandar agora |
| não enviada | não enviada · tentar |
| rodapé do turno | R$ 0,59 · 38 s · ouvir |
| execução longa | Pode bloquear a tela. Eu aviso quando a V2 ficar pronta ou se eu precisar de você. |
| botão de permissão | Me avisar no celular |
| permissão negada | Sem aviso no celular. Você pode ligar em Ajustes > Notificações > Editor. |
| resumo de ausência | Enquanto você esteve fora (12 min) |
| teto perto | Perto do limite de hoje: R$ 12,40 de R$ 15,00. Posso seguir conversando, mas nada pago roda sem o seu toque. |
| modo | Resumo / Bastidores |
| abrir a sede | Ver a equipe na sede |

### 8.5 Notificações (título · corpo · abre)
| quando | título | corpo | `navigate` |
|---|---|---|---|
| versão pronta | V2 pronta · 0:45 · feita em 18:42 | Reel Super Kal · carnes. Toque para assistir. | `/projetos/{id}#palco` |
| pergunta | Nimbus precisa de você | Trilha nova ou antiga? Responda em um toque. | `/projetos/{id}#pergunta-{tool_use_id}` |
| confirmação | Preciso do seu toque para seguir | Refazer a direção da V2 · ≈ R$ 1,03 | `/projetos/{id}#confirmacao-{tool_use_id}` |
| erro que pede ação | A montagem parou | Falta o logo do Super Kal. Toque para resolver. | `/projetos/{id}#erro` |
| cliente respondeu | O cliente respondeu | Super Kal pediu ajuste na V2. | `/projetos/{id}` |

Sem emoji, sem ponto de exclamação, até ~60 caracteres no título para não cortar na tela bloqueada (limite exato do iOS: não confirmado).

### 8.6 Erros (o que parou · por quê · ação)
| caso | primeira linha | segunda linha | botão |
|---|---|---|---|
| etapa do pipeline falhou | A montagem parou | {mensagem do motor traduzida pela tabela de `lib/estados.ts`, `design-editor-25-11.md:278`} | Tentar de novo |
| API sobrecarregada (`overloaded_error`, `conversa-pesquisa-agente.md`, linha 203) | A mesa está congestionada | Tento de novo em 20 s. | Tentar agora |
| turno cortado pelo reinício | Fui interrompido no meio do passo | Nada foi perdido do que já estava pronto. | Continuar |
| limite de passos (`MAX_VOLTAS = 12`, linha 201) | Parei depois de 12 passos | Para não gastar à toa. Sigo? | Seguir |
| recusa do modelo | Não consigo fazer isso | {primeira frase da recusa} | Reformular |
| teto do dia | O limite de hoje acabou | Nada pago roda até amanhã, a não ser que você aumente o limite. | Ver gastos |
| texto suspeito de fora (Muralha) | O texto do cliente tinha uma ordem escondida | Não segui. Quer ver o que estava escrito? | Ver o texto |
| mensagem não saiu | Não deu para mandar | Sem internet ou o editor está reiniciando. | Tentar de novo |

---

## 9. Acessibilidade e movimento

### 9.1 Leitor de tela
- O fio é `role="log"` com nome acessível. Pela MDN, `log` tem `aria-live="polite"` e `aria-atomic="false"` implícitos e o conteúdo novo entra só no fim (https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/log_role).
- **Não anunciar token a token:** a resposta em curso fica com `aria-busy="true"` e só é lida inteira no `texto_final`. Os tempos que correm ("0:06") ficam `aria-hidden`; o passo é anunciado uma vez ao começar ("Radar começou: ouvindo as falas da Lavínia") e uma ao terminar.
- Pergunta, confirmação e erro: além do log, uma região `role="alert"` separada (assertive) com a primeira linha do cartão, porque pedem ação. O foco **não** pula para o cartão se o Marcos está digitando; a pílula "Nimbus espera sua resposta" leva até lá.
- Cada cartão de pergunta é `role="group"` com `aria-labelledby` no texto da pergunta; as opções são `<button>`.

### 9.2 Toque, texto e contraste
- Alvos de 44 px ou mais em tudo (a regra que a auditoria já cumpre, `design-editor-25-11.md:17`), acima dos 24x24 px do WCAG 2.2 nível AA (critério 2.5.8, https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Opções de pergunta e botões de cartão com 52 px.
- Texto: corpo 17, apoio 15, mono 13 no mínimo (`design-editor-25-11.md:135-136`). Campo com 16 px ou mais para o iPhone não dar zoom.
- Estado nunca só por cor: ícone + palavra ("rodando", "feito", "parou", "esperando você").
- Contraste: `--cor-tinta-2` sobre as superfícies já está acima de 4,5:1 nos dois temas (`app/globals.css:22`); o andamento usa essa cor sem opacidade.
- Tamanho de texto do sistema (Dynamic Type) na PWA: usar `rem` e testar; se o `font: -apple-system-body` respeita o ajuste do iPhone dentro da PWA: não confirmado.

### 9.3 Movimento
- Mesmas curvas e durações da direção (`app/globals.css:53-56`; `design-editor-25-11.md:148`): entrada de item no fio 240 ms (sobe 8 px e aparece), gaveta 360 ms com a mola, palco grande ↔ faixa 240 ms.
- O fio só rola sozinho se o Marcos estiver a até 80 px do fim. Se ele rolou para ler, nada se mexe; aparece "↓ N novidades".
- Anel do avatar 1,6 s; barra de progresso de 2 px correndo. **Nada pisca** (sem cursor piscando, sem três pontinhos).
- `prefers-reduced-motion`: itens entram sem deslize, o anel fica fixo, o ✓ aparece pronto, palco troca com corte seco.
- Som: nenhum na conversa. O único som da casa continua sendo a claquete opcional do Aprovar (`design-editor-25-11.md:156`).

---

## 10. Plano em ondas (depois da onda 5 do redesenho, sem colidir com a equipe atual)

| onda | entra | depende de | teste |
|---|---|---|---|
| C1 "Fio do pipeline" | `Mesa`, `PalcoFaixa`, `Fio`, `GrupoEquipe`, `AvatarAgente`, `lib/equipe.ts`, usando **só os eventos que já existem** (`etapa_*`, `estado`, `versao_pronta`, `qa_reprovado`, `entregue`, `Projeto.tsx:103`) | nada no motor | `pnpm aceite` + `verificacao-visual` em 390x844 com o motor falso; o Marcos já vê a equipe trabalhando sem o cérebro novo |
| C2 "Conversa" | `Compositor` (texto), `RespostaMesa`, `Andamento`, `CartaoPergunta`, `RodapeTurno` | laço e rotas da frente do agente | turno sobrevive a recarregar a página; pergunta respondida por botão e por texto |
| C3 "Gastar com toque" | `CartaoConfirmacao`, "Desfazer", cartão de teto, `EDITOR_CAMBIO` | registro de risco no motor | com `tool_use` forjado, nada pago roda sem toque (aceite da frente do agente, linha 348) |
| C4 "Voz" | gravação e transcrição no `Compositor` | rota de voz da frente de voz | teste no iPhone do Marcos: PWA e aba do Safari |
| C5 "Aviso" | Web Push declarativo, badge, `ResumoAusencia` | chaves VAPID, rota de assinatura no motor | iPhone com a tela bloqueada durante uma montagem de 10 min |
| C6 "Prova" | ficha técnica no `/c/` e estado da sede publicado pelo motor | C1 | print da página do cliente e da sede com o estado de um projeto real |

C1 é a que dá mais resultado pelo menor risco: entrega a "tela de atualização ao vivo" e a equipe trabalhando com o que o motor já emite.

---

## 11. O que não deu para confirmar

- **Claude Code:** o agrupamento "Ran N commands" e a dobra que esconde texto vêm de relatos de usuários, não de documentação; a página oficial do redesenho só fala dos três modos.
- **Devin:** não achei doc datada de 2026 de uma linha do tempo ao vivo; o Timeline de Insights é pós-sessão.
- **ChatGPT agent** foi retirado; não achei como o "ChatGPT Work" mostra narração ou toma o controle.
- **Manus:** os rótulos do painel "Manus's computer" vêm de análises de terceiros.
- **v0:** nenhuma doc sobre "Thought for" ou ferramentas recolhidas.
- **Underlord:** a página de ajuda não descreve passos, perguntas, aprovações nem erro; voltar atrás e a segunda passada vêm do changelog resumido, que não abri por inteiro.
- **Runway Agent** e **CapCut EditPilot:** as páginas não dizem como mostram progresso nem se perguntam de volta. Agente por conversa no app de celular do CapCut: não confirmado.
- **iPhone:** comportamento do teclado com `visualViewport` na PWA do iOS 26/27; Wake Lock na PWA; Dynamic Type com `-apple-system-body` na PWA; limite de caracteres do título da notificação; se o Web Push é grátis pela Apple (não achei a frase oficial); versão e licença da biblioteca de Web Push.
- **Câmbio:** não existe taxa no código; o R$ 5,40 dos exemplos é só ilustração da conta.
- **Arte dos bonecos dos agentes:** a pasta `assets/brand/agentes` citada no CLAUDE.md global não está neste repositório; não sei onde está a arte aprovada hoje. Até achar, o avatar é disco com cor e inicial.
- **Custo por turno** (~US$ 0,11) e por conversa (US$ 2,22) vêm da simulação da frente do agente, com premissas dela; não medidos.
- **Nada foi construído nem testado no aparelho do Marcos.** Os wireframes são texto; a prova de verdade é C1 com `verificacao-visual` e o fluxo no `navegador`.

## 12. Fontes

Web (lidas em 25/11/2026):
- https://claude.com/blog/claude-code-desktop-redesign · https://code.claude.com/docs/en/mobile.md · https://code.claude.com/docs/en/remote-control.md
- https://claudeissues.com/issue/85248-desktop-app-option-to-expand-tool-call-groups-ran-n-commands-by-default · https://claudeissues.com/issue/90425-desktop-app-collapses-assistant-text-written-between-tool-calls-substantive-answ · https://claudeissues.com/issue/94354-desktop-normal-view-shows-thinking-summaries-that-look-like-normal-chat-messages
- https://docs.devin.ai/work-with-devin/devin-session-tools · https://docs.devin.ai/product-guides/session-insights
- https://openai.com/index/introducing-chatgpt-agent/ · https://help.openai.com/en/articles/11752874-chatgpt-agent
- https://manus.im/blog/introducing-manus-2-0
- https://cursor.com/changelog/1-2 · https://forum.cursor.com/t/critical-regression-task-queues-no-longer-work-new-messages-cancel-previous-tasks/171529
- https://docs.lovable.dev/features/agent-mode.md · https://docs.lovable.dev/features/chat-mode
- https://getstream.io/chat/docs/sdk/react/features/ai/reasoning-and-tool-calls/ · https://tanstack.com/ai/latest/docs/chat/thinking-content · https://render.ably.com/docs/ai-transport/features/chain-of-thought
- https://help.descript.com/getting-started/underlord-beta-your-ai-co-editor-in-descript.md · https://feedback.descript.com/changelog
- https://runway.com/news/introducing-runway-agent · https://www.capcut.com/resource/capcut-pc-editpilot-faq
- https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ · https://webkit.org/blog/16535/meet-declarative-web-push/ · https://bugs.webkit.org/show_bug.cgi?id=294421
- https://caniuse.com/vibration · https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/log_role · https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

Repositório (lido, não alterado): `docs/design-editor-25-11.md`, `docs/conversa-pesquisa-agente.md`, `docs/conversa-pesquisa-voz.md`, `apps/web/app/globals.css`, `apps/web/componentes/Projeto.tsx:87-110`, `apps/web/public/manifest.webmanifest`, `apps/web/package.json`, `services/motor/motor/pipeline.py:40-100`, `services/motor/motor/banco.py:19-96`, `services/motor/motor/etapas/` (montagem e qa), `services/motor/motor/etapas/qa/fatos.py:1-5`; na raiz, `CLAUDE.md`, `sede/index.html:263-341` e `:1040-1092`, `.claude/skills/direcao-de-arte/SKILL.md`, `.claude/skills/consciencia/SKILL.md`.
