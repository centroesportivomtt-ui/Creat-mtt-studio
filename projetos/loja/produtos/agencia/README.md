# Creat Nuvem: agência de 15 agentes para Claude Code

Uma equipe fixa de 15 agentes especialistas, 6 skills da casa (mais o gerador da sede ao vivo), um fluxo que coordena o trabalho entre eles e uma sede em 3D para ver a equipe em ação. Você copia duas coisas para o seu repositório e passa a pedir trabalho pelo nome de quem faz.

> **Antes de começar**
> - Este pacote é compatível com o Claude Code. Não é um produto oficial da Anthropic e não tem vínculo com ela.
> - Você precisa de uma assinatura ou conta do Claude Code ativa. O pacote não inclui acesso ao Claude.
> - Cada agente consome tokens da sua conta. Um fluxo completo da agência chama vários agentes e gasta bem mais que uma conversa comum. Leia a seção "Custos" do `GUIA.pdf` antes do primeiro fluxo grande.

## O que vem no pacote

| caminho | o que é |
|---|---|
| `.claude/agents/` | os 15 agentes, um arquivo `.md` cada |
| `.claude/skills/` | as skills da casa: `ideacao`, `direcao-de-arte`, `toon-3d`, `verificacao-visual`, `navegador`, `padrao-de-entrega` e o gerador `sede-ao-vivo` |
| `.claude/workflows/agencia.js` | o fluxo que passa o trabalho de agente em agente, em ondas |
| `CLAUDE.md` | as regras da casa que o Claude Code lê em toda sessão |
| `sede/` | a ilha 3D da agência (`index.html`) e o servidor local com modo ao vivo (`servidor.cjs`) |
| `GUIA.pdf` | guia de uso: cada agente com exemplos de prompt, o fluxo em ondas, custos, boas práticas e erros comuns |
| `LICENSE` | o que você pode e o que não pode fazer com o pacote |

## Instalar em 2 minutos

Faça isto na raiz do repositório onde você quer a agência.

**1. Copie as pastas.** Descompacte o zip e copie `.claude/` e `CLAUDE.md` para a raiz do seu repositório. Copie `sede/` também, se quiser a visualização 3D.

```sh
unzip creat-nuvem-agencia-15-agentes.zip
cp -R creat-nuvem-agencia-15-agentes/.claude ./
cp creat-nuvem-agencia-15-agentes/CLAUDE.md ./
cp -R creat-nuvem-agencia-15-agentes/sede ./      # opcional
```

**Se o repositório já tem `.claude/` ou `CLAUDE.md`, mescle em vez de substituir:**

- `.claude/` existente: copie só as subpastas `agents/`, `skills/` e `workflows/` para dentro dela. Se já existe um agente com o mesmo nome (por exemplo `frontend.md`), renomeie um dos dois antes de copiar. O `cp -R` sobrescreve arquivos de mesmo nome sem perguntar.
- `CLAUDE.md` existente: cole o conteúdo do nosso no fim do seu, sob um título como `## Agência Creat Nuvem`. Leia as duas versões e apague regras que se contradigam.
- Não mexa no seu `.claude/settings.json` nem no `settings.local.json`. O pacote não traz nenhum dos dois.

**2. Instale o navegador dos agentes.** As skills `navegador` e `verificacao-visual` usam o Playwright para abrir páginas, tirar prints e ler o console. Na raiz do repositório:

```sh
npm install -D playwright
npx playwright install chromium
```

Na nuvem do Claude Code o Playwright costuma já vir instalado. Sem ele, os outros agentes funcionam; só o QA e as verificações visuais ficam sem olhos.

**3. Abra o Claude Code** na raiz do repositório e confira:

```
Liste os agentes que você tem disponíveis
```

A resposta deve citar os 15 nomes da tabela abaixo.

## Chamar cada agente

Peça pelo nome do agente (a primeira coluna). O apelido aparece nos relatórios e na sede.

| agente | apelido | faz | exemplo de pedido |
|---|---|---|---|
| `diretor` | Nimbus | transforma briefing em plano em ondas, com responsáveis e critérios de aceite | `Use o agente diretor para planejar um site de cardápio para uma pizzaria` |
| `criativo` | Faísca | gera 3 conceitos fora do óbvio, cada um com momento-assinatura | `Use o agente criativo para propor 3 conceitos para a landing page de um estúdio de tatuagem` |
| `arquiteto` | Cirro | decide stack, estrutura de pastas e contratos de API | `Use o agente arquiteto para definir a estrutura de um app de lista de compras com login` |
| `frontend` | Pixel | constrói páginas e componentes responsivos | `Use o agente frontend para construir a página de preços responsiva` |
| `backend` | Forja | APIs, banco, autenticação, webhooks | `Use o agente backend para criar a rota POST /reservas com validação e testes` |
| `designer` | Paleta | identidade visual, tokens, layout, revisão de UX | `Use o agente designer para criar o tokens.css com tema claro e escuro` |
| `motion-3d` | Órbita | Three.js, animações, microinterações | `Use o agente motion-3d para animar a entrada do hero com comprimir e esticar` |
| `shader` | Prisma | shaders GLSL, partículas, arte generativa | `Use o agente shader para criar um fundo de ruído animado que rode a 60 fps no celular` |
| `som` | Eco | microssons e trilha em Web Audio, com botão de mudo | `Use o agente som para criar o som de clique e de sucesso do formulário` |
| `copywriter` | Verbo | textos, microcopy, tom de voz e SEO em PT-BR | `Use o agente copywriter para reescrever os textos da home com foco em agendamento` |
| `pesquisador` | Radar | concorrentes, referências e documentação, com fonte | `Use o agente pesquisador para listar 5 concorrentes e o que cada um faz na página inicial` |
| `revisor` | Crivo | revisa o diff atrás de bugs e complexidade; não edita | `Use o agente revisor para revisar o diff desta branch` |
| `qa` | Lupa | testa no navegador, no celular e no desktop, e reporta bugs | `Use o agente qa para testar o fluxo de cadastro em 390px e no tema escuro` |
| `seguranca` | Muralha | audita segredos, dependências, XSS, LGPD; não edita | `Use o agente seguranca para auditar o formulário de contato antes de publicar` |
| `devops` | Trilho | build, CI, deploy e variáveis de ambiente | `Use o agente devops para configurar o GitHub Actions com lint, teste e build` |

Quem cria e constrói roda em Opus; diretor, revisor, segurança e pesquisador rodam em Sonnet, que custa menos. O modelo de cada um está na linha `model:` do arquivo do agente. Troque ali se quiser.

## Rodar a agência inteira

O fluxo `.claude/workflows/agencia.js` coordena a equipe em seis etapas: conceito (três Faíscas e um júri), plano do Nimbus, construção em ondas com revisão do Crivo, QA com Lupa, Muralha e Crivo, correções e entrega.

Peça no Claude Code:

```
rode o workflow agencia com o briefing: landing page para uma barbearia com agendamento online
```

Opções, passando um objeto em vez de texto:

```
rode o workflow agencia com { briefing: "app de lista de compras", conceito: false, max_tarefas: 5 }
```

- `conceito: false` pula a etapa dos três conceitos. Use em tarefas técnicas, sem parte visual.
- `max_tarefas` limita o tamanho do plano (padrão 10). Menos tarefas, menos tokens.
- Cada agente acrescenta uma seção ao `RELATORIO.md` da pasta do projeto. Se a cota acabar no meio, o que foi feito fica registrado ali.

O fluxo só roda numa versão do Claude Code que tenha a ferramenta de workflows. Se a sua não tiver, chame os agentes um a um na ordem do plano do `diretor`.

## Abrir a sede 3D

A sede mostra a ilha da agência com os 15 personagens. Toque num agente para ver a ficha, o arsenal e o comando para chamá-lo.

**Modo ao vivo** (mostra os fluxos reais que estão rodando na sua máquina). Na raiz do repositório:

```sh
node sede/servidor.cjs
# abra http://localhost:8000
```

Para outra porta: `node sede/servidor.cjs 3000`. O servidor regenera o estado a cada 3 segundos lendo os diários do Claude Code em `~/.claude/projects` (com `.claude/skills/sede-ao-vivo/estado.cjs`). Por isso ele precisa de `sede/` e `.claude/` lado a lado, na mesma raiz.

O modo ao vivo é só para esta máquina: o servidor escuta em `127.0.0.1`, e ninguém na mesma rede (Wi-Fi de café, coworking) consegue abrir a sede ou o `estado.json`, que traz o nome dos seus fluxos e o que cada agente está fazendo. Se quiser abrir no celular pela rede de casa, rode `HOST=0.0.0.0 node sede/servidor.cjs` e use o IP do computador. Só faça isso numa rede em que você confia, porque qualquer pessoa conectada a ela passa a ver o estado dos seus fluxos.

**Modo demonstração** (sem dados reais, só a cena e a simulação do botão "Rodar projeto"):

```sh
cd sede && python3 -m http.server 8000
```

A cena carrega o Three.js do CDN jsdelivr; abra com internet.

## Sobre o `.mcp.json` (não incluso)

O pacote não traz `.mcp.json`, porque ele é configuração da sua máquina e pode conter coisas que só valem para você. O QA e o frontend funcionam sem ele, pela skill `navegador`.

Se quiser também as ferramentas nativas do Playwright como MCP, crie `.mcp.json` na raiz do repositório:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@0.0.83", "--headless", "--isolated"]
    }
  }
}
```

Fixe a versão do pacote (o exemplo usa a que testamos). Na próxima sessão o Claude Code pergunta se você aprova esse servidor. Nunca coloque chave ou token nesse arquivo se o repositório for público.

## Personalizar

- Mudar o jeito de um agente trabalhar: edite o arquivo dele em `.claude/agents/`.
- Contratar um agente novo: crie outro `.md` no mesmo formato (cabeçalho com `name`, `description`, `model`) e acrescente o nome em `ESPECIALISTAS` dentro de `agencia.js` se ele for receber tarefas do fluxo.
- Textos em outro idioma: troque a regra "Textos em português do Brasil" no `CLAUDE.md`.

## Suporte

Dúvidas sobre o pacote: [EMAIL_SUPORTE]. Dúvidas sobre conta, cobrança ou limites do Claude Code são com a Anthropic, não com a gente.

## Licença

Uso pessoal e comercial permitido, inclusive em projetos que você entrega a clientes. Não é permitido revender, redistribuir ou publicar o pacote em si, nem partes dele como produto. Sem garantia. Texto completo em `LICENSE`.
