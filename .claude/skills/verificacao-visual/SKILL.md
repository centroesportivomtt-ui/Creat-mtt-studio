---
name: verificacao-visual
description: Os olhos da Creat Nuvem — abre uma página em celular e desktop, claro e escuro, salva prints e aponta erros de console, requisições quebradas, rolagem horizontal e texto pequeno demais. Use depois de construir ou mudar qualquer interface, e antes de dizer que está pronto.
---

# Verificação visual

```bash
node .claude/skills/verificacao-visual/olhar.cjs sede/index.html
node .claude/skills/verificacao-visual/olhar.cjs http://localhost:3000 --so celular-claro,desktop-escuro
node .claude/skills/verificacao-visual/olhar.cjs sede/index.html --hash frontend --clique "#runBtn"
```

- Aceita URL, arquivo `.html` ou pasta (sobe um servidor local sozinho).
- Prints vão para `.verificacao/` (ignorada pelo git) junto com `relatorio.json`.
- WebGL liga por software, então cenas Three.js renderizam mesmo sem GPU.
- Sem internet para o CDN? Instale o pacote (`npm i three@0.160.0`) e use `--cdn-local`: ele serve os arquivos do jsdelivr a partir de `node_modules`.
- Precisa do Playwright. Na nuvem do Claude Code já vem instalado; na sua máquina: `npm i -D playwright && npx playwright install chromium`.

## Depois de rodar
1. **Abra os prints** (ferramenta Read na imagem) e olhe de verdade: alinhamento, cortes, contraste, se o momento-assinatura aparece.
2. Corrija o que o relatório apontou. Código de saída 1 = tem problema.
3. Repita só a configuração que falhou com `--so`.

Para navegar interativamente (clicar, digitar, inspecionar), use o MCP `playwright` se ele estiver conectado (instruções no README).
