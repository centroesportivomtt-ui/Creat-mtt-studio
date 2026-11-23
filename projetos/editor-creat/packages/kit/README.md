# packages/kit — motion kit da creat.MTT

Cópia do kit estendido usado no filme V2 de 17/11 (modelos: abas, camadas, checklist, chip, fecho, fecho2, fundo, gancho, gancho2, heroi, hud, legenda, pilha, rotulo, selo, stats, transicao). Sem material de cliente: só logos da creat.MTT e fontes OFL (`assets/fonts/FONTES.txt`).

Contrato: `window.__mk.seek(t)` posiciona uma timeline GSAP pausada; nada de relógio, aleatório sem semente ou rede durante o seek. Uma cena = `cenas/*.json` com `formato`, `duracao` e `camadas[{id, modelo, de, ate, props}]` — o mesmo formato de `motion[]` no EDL.

Frente C: trocar a captura do `ferramentas/render.cjs` por `HeadlessExperimental.beginFrame` com `optimizeForSpeed` e `--workers N` (pesquisa B: 299 → 118 ms/quadro, pixel-idêntico), integrar o pacote turbo quando ficar pronto e tirar o caminho fixo de `som.cjs` (usar só `MK_SOM`).

## QA de zona segura

Todo modelo é medido contra a zona segura com textos longos de verdade: veja `QA.md` (`npm run zona`).
