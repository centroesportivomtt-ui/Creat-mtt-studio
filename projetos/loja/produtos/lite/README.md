# Creat Nuvem Lite: 3 agentes de frontend para Claude Code

Três agentes que trabalham em equipe dentro do seu Claude Code: um constrói a interface, outro revisa o código e o terceiro testa no navegador. A skill `verificacao-visual` dá olhos aos três: abre a página no celular e no desktop, no tema claro e no escuro, tira prints e aponta erro de console, rolagem lateral e texto pequeno.

Grátis, licença MIT.

> - Compatível com o Claude Code. Não é produto oficial da Anthropic.
> - Precisa de uma assinatura ou conta do Claude Code ativa.
> - Cada agente consome tokens da sua conta.

## Os 3 agentes

| agente | apelido | faz | quando chamar |
|---|---|---|---|
| `frontend` | Pixel | constrói páginas e componentes responsivos, celular primeiro, com foco visível e contraste AA | para criar ou mudar qualquer tela |
| `revisor` | Crivo | lê o diff e aponta bugs, código duplicado e desvios das convenções, com arquivo e linha; não edita nada | depois de toda implementação |
| `qa` | Lupa | roda os testes, abre a página no navegador em 390px e 1440px e reporta bugs com passos para reproduzir | antes de dar algo como pronto |

## Instalar em 1 minuto

Na raiz do seu repositório:

```sh
mkdir -p .claude
cp -R creat-nuvem-lite-gratis/.claude/agents .claude/
cp -R creat-nuvem-lite-gratis/.claude/skills .claude/
npm install -D playwright
npx playwright install chromium
```

Se você já tem agentes com os nomes `frontend`, `revisor` ou `qa`, renomeie um dos lados antes de copiar: o `cp` sobrescreve sem perguntar.

## Usar

No Claude Code, peça pelo nome:

```
Use o agente frontend para construir a página de contato com formulário
Use o agente revisor para revisar o diff desta branch
Use o agente qa para testar a página de contato no celular e no tema escuro
```

A verificação visual também roda sozinha, sem agente:

```sh
node .claude/skills/verificacao-visual/olhar.cjs index.html
node .claude/skills/verificacao-visual/olhar.cjs http://localhost:3000 --so celular-claro,desktop-escuro
```

Os prints vão para `.verificacao/`. Acrescente essa pasta ao seu `.gitignore`.

## Sobre os arquivos dos agentes

Os três arquivos são versões do Lite: citam só a skill `verificacao-visual`, que vem no pacote. O `qa` e o `frontend` conferem a página com `olhar.cjs` (prints, console, requisições e rolagem). Para fluxos com clique e digitação, o `qa` usa o MCP `playwright` se você tiver conectado; sem ele, escreve um teste Playwright curto.

A seção "Arsenal" de cada agente cita skills de plugins (como `frontend-design:frontend-design`). Elas são opcionais: se o plugin não estiver instalado, o agente segue sem elas.

## Versão completa

A agência completa tem 15 agentes (direção, conceito criativo, arquitetura, backend, design, 3D, shaders, som, texto, pesquisa, segurança, deploy), 6 skills da casa, o fluxo que coordena a equipe em ondas, a sede 3D e um guia em PDF com exemplos de prompt para cada agente: https://creat-nuvem-404b1994.base44.app

## Licença

MIT. Veja `LICENSE`.
