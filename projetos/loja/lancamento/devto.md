<!--
Horário sugerido: quinta, 10h (horário de Brasília). Publique pelo menos um dia depois do TabNews.
Onde publicar: https://dev.to/new > botão "..." > colar o Markdown inteiro a partir da linha "---" abaixo (o editor lê o front matter).
Troque "published: false" por "true" só depois de revisar a pré-visualização. Apague este comentário antes de colar.
Contagem: o corpo (sem front matter, sem este comentário e sem os blocos de código) tem 637 palavras (meta: cerca de 600).
-->
---
title: Como montar uma agência de agentes no Claude Code
published: false
description: Agentes com papel fixo, ferramentas limitadas, skills que dão olhos ao QA e um fluxo em ondas. O que funcionou e o que custa.
tags: claude, ai, webdev, braziliandevs
---

Quando comecei a usar o Claude Code em projetos de frontend, eu pedia tudo para uma conversa só. Ela escrevia a página, revisava e dizia que estava pronta. O problema aparecia no celular do cliente: rolagem lateral, erro no console, texto minúsculo. A mesma sessão que escreveu o código era a que julgava o código.

A saída foi tratar o Claude Code como uma pequena agência: cada função vira um agente com cargo, regras e ferramentas próprias. Este texto mostra como montar isso e o que aprendi.

## 1. Um agente é um arquivo

No Claude Code, um subagente é um Markdown em `.claude/agents/` com um cabeçalho:

```markdown
---
name: revisor
description: Revisor de Código. Use depois de qualquer implementação para revisar diffs.
model: sonnet
tools: Read, Grep, Glob, Bash, Skill
---
Você é Crivo, revisor. Cada achado: arquivo:linha, o problema em uma frase,
o cenário concreto que quebra e a correção sugerida.
```

Três campos fazem quase todo o trabalho:

- **`description`** diz quando delegar. O Claude Code lê esse texto para decidir quem chamar. Escreva o gatilho, não um elogio.
- **`tools`** limita o poder. Meu revisor não tem `Edit` nem `Write`: ele aponta, e quem construiu corrige. Assim ele não "conserta" o que leu errado.
- **`model`** separa custo por função. Quem cria roda num modelo maior; quem lê e julga roda num menor, que custa menos por token.

## 2. Papéis que não se sobrepõem

Comecei com três (frontend, revisor e QA) e cheguei a quinze: direção, conceito criativo, arquitetura, backend, design, 3D, shaders, som, texto, pesquisa, segurança e deploy. O número importa menos que a regra: **cada tarefa tem um dono, e cada arquivo também.** Dois agentes editando o mesmo arquivo ao mesmo tempo é o jeito mais rápido de perder trabalho.

## 3. Skills dão olhos e método

Uma skill é um manual em `.claude/skills/<nome>/SKILL.md`, às vezes com um script. A que mais mudou meus resultados é a de verificação visual: um script Node com Playwright que abre a página em celular e desktop, claro e escuro, salva prints e aponta erro de console, requisição quebrada, rolagem lateral e texto menor que 11 px.

```sh
node .claude/skills/verificacao-visual/olhar.cjs index.html
```

Se encontra problema, sai com código 1. O agente não consegue declarar "pronto" com a tela quebrada. Depois ele lê os prints como imagem e olha de verdade.

## 4. Um fluxo em ondas

Para projetos maiores, um script de workflow passa o trabalho de agente em agente. O diretor lê o repositório e devolve um plano em **ondas**: tarefas da mesma onda rodam em paralelo e não podem tocar os mesmos arquivos. A ordem típica é conceito, plano, construção com revisão, QA e segurança, correções, entrega.

Um detalhe que me salvou mais de uma vez: cada agente acrescenta uma seção a um `RELATORIO.md` da pasta do projeto ao terminar. Se a cota acaba no meio, o arquivo mostra onde o trabalho parou.

## 5. O que custa

Mais agentes, mais tokens. Cada agente começa com contexto próprio e relê o que precisa. Um fluxo completo gasta bem mais que uma conversa. Minhas regras:

- ajuste pequeno: um agente só;
- página nova: construtor, revisor e QA;
- projeto inteiro: o fluxo, com limite de tarefas;
- antes de rodar num projeto grande, medir num pequeno.

## 6. O que aprendi

- Revisor com contexto limpo pega o que o autor racionaliza.
- Critério de aceite precisa ser checável: "abre sem erro no console em 390 px".
- Agente não lembra da conversa anterior. O que importa vai no pedido ou num arquivo.
- Edite os agentes. Se um erra sempre do mesmo jeito, uma linha nova no arquivo dele resolve.

## Para testar

Abri a versão mínima, com frontend, revisor, QA e a skill de verificação visual, sob licença MIT: [LINK_LITE_REPO]. Os arquivos estão em português.

Precisa de uma conta do Claude Code e do Playwright. Não é um projeto da Anthropic, só é compatível. Transparência: eu vendo a versão com os 15 agentes, o fluxo e uma sede 3D em [LINK_LOJA].

Como vocês organizam revisão e teste quando o código vem de IA?
