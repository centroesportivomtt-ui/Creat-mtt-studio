# TabNews · post técnico (PT)

**Horário sugerido:** terça ou quarta, 9h30 (horário de Brasília). Publique num dia diferente dos outros posts.
**Onde publicar:** https://www.tabnews.com.br > Publicar novo conteúdo. Cole o título no campo de título e o corpo no editor (aceita Markdown). No campo "Fonte", deixe [LINK_LITE_REPO].
**Regra:** este post é só técnico. Não cite a versão paga, não ponha link de loja. Se alguém perguntar, responda nos comentários com transparência.

---

## Título

Como separei o Claude Code em 3 agentes que constroem, revisam e testam no navegador

## Corpo

Eu pedia tudo para uma conversa só do Claude Code: "faz a página", "agora revisa", "agora testa". Funcionava, mas a mesma sessão que escreveu o código era a que dizia que estava tudo certo. Separei o trabalho em agentes com papéis fixos. No meu uso, passaram a chegar menos erros de console e menos rolagem lateral no celular ao fim do trabalho.

Abri a versão mínima disso como repositório MIT: três agentes e uma skill.

### O que é um agente no Claude Code

É um arquivo Markdown em `.claude/agents/` com um cabeçalho e instruções:

```markdown
---
name: revisor
description: Revisor de Código. Use depois de qualquer implementação para revisar diffs em busca de bugs...
model: sonnet
tools: Read, Grep, Glob, Bash, Skill
---
Você é Crivo, revisor de código. Rigoroso e justo.
...
```

Três detalhes que fizeram diferença:

1. **`description` diz quando chamar.** É o que o Claude Code lê para decidir se delega. Descrição vaga, delegação errada.
2. **`tools` limita o que o agente pode fazer.** O revisor não tem `Edit` nem `Write`: ele só aponta. Quem corrige é quem construiu. Isso impede o revisor de "consertar" algo que não entendeu.
3. **`model` por função.** Quem constrói roda num modelo maior; quem lê e julga roda no Sonnet, que custa menos por token e perde pouco em revisão.

### Os três agentes

- **frontend**: constrói celular primeiro, com foco visível, contraste AA e `prefers-reduced-motion`. Antes de entregar, abre a página e confere o console.
- **revisor**: lê o `git diff` e cada achado vem com arquivo, linha e o cenário concreto que quebra. Regra que eu gosto: "se não consegue descrever o cenário que quebra, não é bug".
- **qa**: roda build e testes, abre a página em 390 px e 1440 px e escreve o relatório de bug com passos para reproduzir.

### A skill que dá olhos aos três

O ponto fraco de agente fazendo frontend é que ele não vê a tela. A skill `verificacao-visual` é um script Node com Playwright:

```sh
node .claude/skills/verificacao-visual/olhar.cjs index.html
```

Ele abre a página em quatro configurações (celular e desktop, claro e escuro), salva os prints em `.verificacao/` e um `relatorio.json` com:

- erros de console e requisições que falharam;
- rolagem horizontal (compara `scrollWidth` com a largura da janela);
- texto com fonte menor que 11 px;
- código de saída 1 se achou problema, para o agente não declarar "pronto".

Liga WebGL por software, então até cena Three.js renderiza num container sem GPU. Depois o agente lê os prints como imagem e olha de verdade.

### O que aprendi

- **Revisão separada pega mais.** O agente que escreveu tende a confirmar o próprio raciocínio. Um agente com contexto limpo, lendo só o diff, não.
- **Critério de aceite verificável muda tudo.** "Abre sem erro no console em 390 px" funciona; "fica bonito" não.
- **Custa tokens.** Três agentes gastam mais que uma conversa. Para mudança pequena, chamo um só.
- **Cada agente começa do zero.** O que importa precisa estar no pedido ou num arquivo do repositório.

### Instalar

```sh
mkdir -p .claude
cp -R creat-nuvem-lite-gratis/.claude/agents .claude/
cp -R creat-nuvem-lite-gratis/.claude/skills .claude/
npm install -D playwright && npx playwright install chromium
```

Depois, no Claude Code: `Use o agente qa para testar a página de contato no celular`.

Precisa de uma conta do Claude Code. Não é projeto da Anthropic, é só compatível.

Repositório: [LINK_LITE_REPO]

Curioso para saber como vocês organizam revisão e teste quando o código vem de IA. Alguém já separou papéis assim?
