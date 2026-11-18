# QA de zona segura do kit

Todo modelo de `kit/modelos` é testado com textos difíceis em português e precisa ficar dentro da zona segura 9:16 em
todos os instantes medidos da animação. Não basta passar no filme de hoje: o texto do próximo cliente pode ser maior.

## Fonte única da zona

`kit/zona.json` define a zona (topo 285, base 440, direita 120, esquerda 60 px em 1080x1920), a tolerância (16 px), o
limiar de alfa (200), o passo de amostragem (3 quadros), a lista `tela_cheia` e os modelos `isentos`. Três lugares leem
esse arquivo:

- `kit/nucleo.js`, para montar `ZONA` dos modelos;
- `ferramentas/zona.cjs`, o QA do kit descrito aqui;
- `services/motor/motor/etapas/qa/zona_segura.py`, o QA de entrega, que mede o alfa dos quadros do filme.

`tokens.css` repete os números só como referência visual. Se mudar a zona, mude o JSON.

## Como rodar

```bash
cd packages/kit
npm install --no-save --legacy-peer-deps --no-package-lock gsap@3.12.5 three@0.160.0   # uma vez (node_modules fica fora do git)
node ferramentas/zona.cjs                       # matriz inteira (~13 s em 4 núcleos)
node ferramentas/zona.cjs --json saida/zona.json --so gancho,chip --casos longo,quebra
node ferramentas/zona.cjs --rapido              # 5 casos por modelo, a cada 9 quadros
node ferramentas/zona.cjs --cena cenas/zona/negativo.json   # mede uma cena qualquer (sai com 1: fura de propósito)
node ferramentas/zona.cjs --gravar-cenas /tmp/cenas         # grava a cena de cada modelo para o render.cjs olhar
```

Pelo pytest, sem marca `lento`, porque a matriz roda em cerca de 15 s:
`PYTHONPATH=. python -m pytest tests/test_kit_zona_segura.py` (em `services/motor`). O teste é pulado, com o motivo
escrito, se faltar node, o gsap do kit, Playwright ou Chromium. Usa `MK_CHROME` e `MK_BF` como o `render.cjs`.

## O que é medido

O verificador monta, para cada modelo, uma cena com uma camada por caso, separadas no tempo. Usa o mesmo Chromium
headless do `render.cjs`, sem rede. Mede a cada 3 quadros e também no início, no meio e no fim de cada tween da timeline
e no último quadro da camada.

- **texto**: todo nó de texto com opacidade efetiva >= 50%. A caixa vem de `Range.getClientRects()`, já com os
  transforms, e é reduzida à tinta real da fonte. Sem esse ajuste, a Anton tem área de conteúdo de 1,5 em e dá falso
  vazamento. A caixa também é recortada por `overflow` e `clip-path`.
- **peça**: img, svg e caixas com fundo ou borda sólidos (alfa >= 200, como no motor). Só vale fora de `tela_cheia`.
- **declarada**: um elemento com `data-mk-zona` diz onde o canvas desenha. O `heroi` usa isso para o texto em partículas.

Um ponto fica fora quando qualquer caixa passa mais de 16 px de um lado da zona. A saída JSON traz a matriz
modelo × caso × instante, com dentro ou fora, px e lado.

Também sai um aviso de **texto recortado**: texto que nunca aparece inteiro no caso, como um nome engolido pela placa ou o
til do Ã aparado. O pytest reprova esse aviso também.

Casos (`cenas/zona/casos.cjs`): `curto` (VENDA MAIS.), `medio`, `longo` (frase de 3 a 4 linhas), `infraestrutura`,
`estaticos` (ESTÁTICOS.), `eletrodomesticos`, `acentos`, `numeros` (R$ 12.999,90) e `quebra` (2 linhas forçadas).
Alguns modelos têm casos a mais: `demo_troca` e `troca_longa` no gancho, `motor_longo` e `motor_gigante` na legenda (no
formato que o motor monta), `direita` no rótulo, `assinatura` no selo e `aba71` no herói. A `pilha` não recebe texto do
autor, por isso varia só a contagem.

## Modelo novo

1. Crie `kit/modelos/<nome>.js` e registre em `kit/player.js`.
2. Acrescente `<nome>` em `MODELOS` de `cenas/zona/casos.cjs`, com `comTextos((x, de, ate, caso) => props)` para
   ganhar os 9 casos. Só um isento declarado em `kit/zona.json` dispensa os casos.
3. O verificador descobre os modelos lendo a pasta. Modelo sem entrada faz `zona.cjs` sair com 1, e o pytest falha
   (`test_modelo_novo_sem_caso_de_teste_falha`).
4. Texto de autor passa por `ctx.caber()` (núcleo). A ordem é: uma linha até o tamanho mínimo, quebra equilibrada,
   encolhe até o piso e só então reticências. O que já cabe fica igual. Texto desenhado em canvas declara a caixa com
   `data-mk-zona`.

## Resultado (18/11/2026)

Na matriz final, 15 modelos são medidos e 2 ficam isentos (`fundo` e `transicao`). São 135 casos e 4.958 instantes.

Antes das correções, 39 casos ficaram fora da zona, somando 1.008 instantes, em 11 modelos. Um desses casos também
derrubava a montagem: o `gancho2` com "R$ 12.999,90". Outros 10 casos tinham texto recortado, em 3 modelos.

Depois das correções, nenhum caso fica fora, nenhum instante vaza, nenhum texto é recortado e nenhum erro aparece.

| modelo | antes | correção | depois |
|---|---|---|---|
| abas | longo +741 px dir. | título encolhe até 18 px e, no fim, recebe reticências (a pílula tem uma linha) | 9/9 |
| camadas | longo +838 px dir. | rótulo dentro da placa, em até 2 linhas | 9/9 |
| checklist | 4 casos recortados pelo cartão | título, apoio e itens encolhem e quebram | 9/9 |
| chip | nome cortado na placa; acento e cedilha aparados | nome em 2 linhas; recorte maior para acento | 9/9 |
| fecho | longo +760, acentos +35 | CTA quebra em até 3 linhas; apoio dentro da zona | 9/9 |
| fecho2 | 8 de 9 fora (até +6.640 px) | CTA encolhe e usa 2 linhas na faixa de 190 px; @ e apoio dentro | 9/9 |
| gancho | longo +1.510, acentos +61, troca_longa +42 esq. | linha quebra em até 4; escala do pouso limitada | 11/11 |
| gancho2 | 9 de 9 fora; "R$ 12.999,90" derrubava a montagem | fase A quebra; topo, trocas e fim cabem; risco robusto | 9/9 |
| heroi | longo +745, acentos +29 (caixa declarada) | texto em até 3 linhas no canvas | 10/10 |
| hud | longo +116 | rótulo e linhas encolhem e, no fim, recebem reticências | 9/9 |
| legenda | eletrodomésticos +43, motor_gigante +133 | página encolhe; escala de entrada limitada | 11/11 |
| pilha | dentro | nenhuma | 2/2 |
| rotulo | longo +940, direita +940 esq. | título e apoio em até 2 linhas, limitados à zona | 10/10 |
| selo | 8 de 10 fora | as 3 linhas cabem ao lado da logo | 10/10 |
| stats | palavra recortada; preço aparecia como "NaN" | rótulo e número encolhem; conta no formato BR | 9/9 |

Os casos que já cabiam ficaram iguais. O demo (`cenas/demo.json`) também: o overlay é pixel-idêntico ao kit original
em 58 instantes. A única diferença no quadro cheio é o fundo "código", que mostra o próprio `heroi.js`. Dos 402 quadros
de comparação, ficaram iguais todos os casos sem defeito medido, com estas exceções:

- `camadas` e `checklist`: o texto saía da placa ou do cartão, ainda dentro da zona;
- `stats/numeros`: o preço aparecia como "NaN".

Prova cruzada com o critério do motor: em 204 quadros PNG dos modelos que não são de tela cheia, a caixa de alfa > 200
ficou dentro da zona + 16 px em todos.
