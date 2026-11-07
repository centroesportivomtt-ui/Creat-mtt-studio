---
name: navegador
description: Navegador interativo da Creat Nuvem — um Chromium que fica aberto entre comandos para o agente abrir páginas, listar o que dá para clicar, clicar, digitar, ler o texto, tirar print e checar o console, como uma pessoa testando. Use para testar fluxos (formulário, agendamento, login), reproduzir bugs e conferir uma página passo a passo. Para prints em lote em 4 configurações use `verificacao-visual`.
---

# Navegador interativo

```bash
N="node .claude/skills/navegador/navegar.cjs"
$N abrir http://localhost:3000            # ou um arquivo .html / pasta; --celular, --escuro
$N ver                                    # lista elementos interativos numerados [n]
$N clicar 4                               # por número, seletor CSS ou "texto visível"
$N digitar "#nome" "Maria Silva"          # --enter para enviar
$N ler                                    # texto visível da página
$N print                                  # salva .verificacao/print-N.png → abra com Read
$N console                                # erros de console e requisições falhas
$N rolar 800 · tecla Escape · esperar 1500 · tamanho 390 844 · js "document.title"
$N fechar
```

O primeiro comando sobe o navegador em segundo plano; os seguintes reaproveitam a mesma página, então o estado (login, formulário preenchido, rota) se mantém. Ele fecha sozinho após 30 minutos.

## Roteiro de teste de um fluxo
1. `abrir` a página no **celular** primeiro (`--celular`); a maioria dos clientes vai usar assim.
2. `ver` para descobrir os elementos; nunca adivinhe seletores.
3. Execute o fluxo passo a passo (`clicar`, `digitar`), chamando `ler` ou `print` depois de cada etapa que muda a tela.
4. `console` ao final de cada fluxo. Erro de console é bug, mesmo que a tela pareça certa.
5. Repita no desktop (`abrir` sem `--celular`) e no escuro (`--escuro`) para os fluxos principais.
6. Casos de borda: campo vazio, texto enorme, clique duplo no botão de enviar, voltar com `tecla Escape`.

## Observações
- Páginas 3D ou pesadas levam alguns segundos para montar: `esperar 5000` antes de `ver`.
- Sem acesso ao CDN (sandbox)? `npm i --no-save three@0.160.0` e `abrir ... --cdn-local`.
- `clicar` tenta um clique normal e, se o elemento não para de se mexer (rótulos animados), força o clique.
- Diálogos `alert/confirm` são aceitos automaticamente e aparecem em `console`.
- Precisa do Playwright (`npm i -D playwright && npx playwright install chromium`); na nuvem do Claude Code já vem.
- Na próxima sessão, o MCP `playwright` definido em `.mcp.json` também fica disponível, com ferramentas nativas de navegação; este script continua funcionando igual.
