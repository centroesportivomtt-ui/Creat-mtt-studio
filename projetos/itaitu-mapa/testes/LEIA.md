# Testes do Trilhas de Itaitu

Um comando, da raiz do repositório:

```
node projetos/itaitu-mapa/testes/rodar-tudo.mjs           # tudo, cerca de 4 min
node projetos/itaitu-mapa/testes/rodar-tudo.mjs --rapido  # sem a demo de 60 s
```

Precisa de Node 22, `python3` e do Playwright com o Chromium que já estão na sessão. Nada de `npm install`, `package.json` ou `playwright install`. Sai com 0 só se todas as etapas passarem.

Depois de mudar qualquer arquivo de `site/itaitu/`, rode antes:

```
node projetos/itaitu-mapa/scripts/gerar-precache.mjs
```

e troque `VERSAO_DA_LISTA` no `site/itaitu/sw.js` pela versão que o script imprimir. A etapa 2 reprova se você esquecer.

## O que cada etapa prova

| etapa | arquivo | prova | não prova |
|---|---|---|---|
| 1 | `*.test.mjs` (`node --test`) | motor (NOAA, horizonte pelo relevo z12), regras de "saia até" e "volte com luz", arredondamento para 5 min, sensibilidade de 50 m, textos e pacote do app particular. Véu 16:07 e Arapongas 15:40 brutos em 20/11/2026 | que a tela mostra isso (etapas 4 e 5) |
| 2 | dentro do `rodar-tudo.mjs` | `precache.json` tem todo arquivo de `site/itaitu` com o hash atual; nenhum arquivo citado por import, link, src, `url()` ou fetch fica fora; `sw.js` acompanha a versão da lista | referência montada em execução com `${}` (tiles), que a etapa 4 cobre ao abrir offline |
| 3 | dentro do `rodar-tudo.mjs` | `python3 -m http.server` em `site/` numa porta livre | nada sobre o GitHub Pages |
| 4 | `conferir-app.cjs` | celular Android emulado (390x844, agente de usuário Android, toque): (2) sem erro de console nem requisição falhando, sem rolagem horizontal, alvos de 44 px, números das tábuas de 28 a 40 px; (3) régua com Tab, setas de 5 min, PageUp de 1 h, `#hora-live` e `aria-valuetext` com a hora e a palavra "sombra"; (4) pré-cache até `pronto`, `setOffline(true)`, recarrega: mapa, relevo 3D, satélite, sombra, horas e régua do cache; (5) fps dos 20 primeiros quadros com CPU 4x e queda para o modo parado; (6) toda cachoeira ou poço sem coordenada no `pontos.geojson` sem hora, com "vá com guia" e "Chamar um guia"; (7) cartão 1080x1920 offline com a marca e a cor de `marcas/demo-village.json`; (8) `?demo=1` até "Ver de novo", com o cartão na fase 4 e sem erro; (9) movimento reduzido pula o dia correndo; `marcos.html` online e offline com manifest próprio | desempenho num celular de verdade (o Chromium da sessão desenha com SwiftShader, sem GPU: o fps medido aqui é o pior caso, não o do aparelho); som (só confere que nada quebra); GPS real; Web Share de verdade; iPhone/Safari |
| 5 | `comparar-com-app.cjs` | as horas que o hóspede lê nas tábuas (Véu 16:05, Arapongas 15:40) contra um cálculo independente (`referencia.mjs`), ±10 min e múltiplo de 5 | se o relevo SRTM bate com a serra real: isso só a gravação em campo com a ACAGI calibra (`sol_ajuste_min`) |

## Rodar uma parte só

```
node projetos/itaitu-mapa/testes/conferir-app.cjs                       # sobe o próprio servidor
node projetos/itaitu-mapa/testes/conferir-app.cjs --so=4,7              # só offline e cartão
node projetos/itaitu-mapa/testes/conferir-app.cjs http://127.0.0.1:8000/itaitu/ --sem-demo
node projetos/itaitu-mapa/testes/comparar-com-app.cjs [URL_BASE] [--agora=2026-11-20T13:00]
node --test 'projetos/itaitu-mapa/testes/*.test.mjs'
```

`--so` aceita 2, 3, 4, 5, 6, 7, 8, 9, 10 e `marcos`.

## O que nenhum destes testes prova

O endereço de produção. Teste local verde não é prova do site no ar. Depois de um deploy autorizado pelo dono, a conferência tem de rodar no endereço real, em celular com internet móvel. Até lá o status é **não verificado no ar**.
