# ADR-005 · O preço de inauguração vale 7 dias; os contadores, 48 h

Status: aceito · 10/11/2026 · Pixel (frontend) · revisa em parte o ADR-003

## Contexto
Pelo ADR-003, `dados/precos.json` ou `dados/vagas.json` com mais de 48 h derrubavam tudo para o padrão: sem contador e sem inauguração. Na prática, a página voltava a R$ 497 sozinha sempre que a rotina diária atrasava, enquanto a oferta de R$ 297 seguia válida e os anúncios pagos (desde 09/11) prometiam R$ 297. O visitante que chega do anúncio via outro preço na página: atrito de compra e risco de reprovação por divergência entre anúncio e destino.

A trava que importa já existe fora da página: a 21ª venda é bloqueada à mão no painel do Mercado Pago (o link de inauguração tem vencimento e quantidade), então o risco do ADR-003, anunciar desconto que não existe mais, continua coberto por quem opera o link.

## Decisão
- **Preço de inauguração** vale com `precos.json` válido, `abertura.inauguracao.ativa: true`, `vagasRestantes > 0` e `atualizado_em` de até **7 dias** (com 5 min de folga para relógio adiantado). Não depende mais de `vagas.json`.
- **Contadores** ("Restam X vagas", "Resta 1 vaga", "Vagas de produção hoje") só com dado de até **48 h**. Com dado mais velho, o número some e o preço continua.
- O preço da tela tem de bater com o valor do link: se `checkout.config.js` `valorDosLinks.aberturaInauguracao` for diferente do preço de inauguração do JSON, a página mostra o padrão. `scripts/checar.cjs` avisa a diferença.
- Fora disso, vale o ADR-003: preço padrão, sem contador, sem inauguração e sem mensagem de erro.

## Consequências
- Esquecer a rotina por até 7 dias não muda o preço da página; o "Restam X" some depois de 48 h, então nenhum número velho fica na tela.
- Acabar a inauguração exige ação explícita: `ativa: false` ou `vagasRestantes: 0` em `precos.json` (e desativar o link no Mercado Pago, como já diz o `checkout.config.js`). Depois de 7 dias sem atualizar, a página cai no padrão por segurança.
- `scripts/checar.cjs`: aviso acima de 48 h (contadores escondidos) e outro acima de 7 dias (inauguração derrubada).
- Código: `assets/vitrine.js` (`fresco` com janela, `lerPrecos`, `aplicarPrecos`). Testes: `scripts/testes/funil.test.mjs`.

## Revisão de 10/11/2026 (decisões D1 e D2 do diretor, depois da revisão de Crivo, Muralha e Lupa)
- **Contadores fora da tela (D1).** Nenhum contador numérico ao vivo ("Restam X vagas", "Resta 1 vaga", "Vagas de produção hoje: X de Y") até o número vir de pedido pago gravado em servidor. O código continua, desligado por `checkout.config.js` `contadoresAoVivo: false`; `scripts/checar.cjs` avisa se alguém ligar. A página diz só "preço de inauguração"; os termos explicam a regra (válido para as 20 primeiras Aberturas), sem número restante. O preço de R$ 497 aparece como "depois da inauguração", sem preço riscado (de/por), porque ainda não foi praticado.
- **O teto de 20 é de todos os links (D2).** Há 7 links de R$ 297 (o padrão de inauguração e os 6 de `linksPorPraca`), e a quantidade máxima do Mercado Pago é por link. A soma das quantidades máximas dos 7 links tem de ser no máximo `vagasTotal` (20); se não der para dividir, o corte é manual e vale para os 7 ao mesmo tempo. Os 2 combos do anual (fora da página desde a decisão D3) também usam o preço de inauguração.
- **Fim da inauguração.** `scripts/atualizar-vagas.cjs` lê o `checkout.config.js` como o navegador lê e falha na `--rotina` (código 2) enquanto `aberturaInauguracao` **ou qualquer** link de `linksPorPraca` estiver publicado com a inauguração encerrada. A mensagem de ATENÇÃO lista todos os links a desativar no Mercado Pago, combos incluídos.
