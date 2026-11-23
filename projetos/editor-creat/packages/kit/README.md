# packages/kit — motion kit da creat.MTT

Cópia do kit estendido usado no filme V2 de 17/11 (modelos: abas, camadas, checklist, chip, fecho, fecho2, fundo, gancho, gancho2, heroi, hud, legenda, pilha, rotulo, selo, stats, transicao). Sem material de cliente: só logos da creat.MTT e fontes OFL (`assets/fonts/FONTES.txt`).

Linguagem "Em Revelação" (20/11/2026): `revelacao` (grão, luz de segurança, preto e latentes revelados pela frente do FX `revela`), `legenda_revelada` (frase inteira em Instrument Serif, palavra-chave em itálico), `laboratorio` (tiras datilografadas, carimbo, lápis e código de borda), `papel` (modos folha, envelope e cartao) e a transição `salto` (perfurações do filme, par do FX `salto`). Peças e contas comuns em `kit/revelacao_comum.js`; o contrato de cada prop está no cabeçalho de cada modelo. Fontes novas: Instrument Serif, Special Elite e Caveat Brush (`assets/fonts/FONTES.txt`).

Contrato: `window.__mk.seek(t)` posiciona uma timeline GSAP pausada; nada de relógio, aleatório sem semente ou rede durante o seek. Uma cena = `cenas/*.json` com `formato`, `duracao` e `camadas[{id, modelo, de, ate, props}]` — o mesmo formato de `motion[]` no EDL.

Frente C: trocar a captura do `ferramentas/render.cjs` por `HeadlessExperimental.beginFrame` com `optimizeForSpeed` e `--workers N` (pesquisa B: 299 → 118 ms/quadro, pixel-idêntico), integrar o pacote turbo quando ficar pronto e tirar o caminho fixo de `som.cjs` (usar só `MK_SOM`).
