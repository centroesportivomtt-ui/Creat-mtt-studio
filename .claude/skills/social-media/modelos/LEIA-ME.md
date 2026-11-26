# Modelos do padrão Social Media creat.MTT

Geram arquivo final a partir de JSON, sem IA e sem custo (Playwright local, fontes locais).

```bash
node render-carrossel.cjs exemplo-carrossel.json <pasta-saida> [--marca marca.json]
node render-apresentacao.cjs exemplo-apresentacao.json <saida.pdf> [--marca marca.json]
```

- Carrossel: um `cartao-NN.png` 1080x1350 por cartão, `prancha.jpg` (todos lado a lado) e `legenda.txt`.
- Apresentação: PDF 1920x1080 e a pasta `<nome>-slides/` com um PNG por slide.
- Campos e regras de cada tipo: comentário no topo de cada `render-*.cjs`. `*palavra*` = destaque na cor da marca.
- Código de saída 1 = algum cartão ou slide estourou, saiu da zona segura (80 px no carrossel) ou ficou com letra menor que 28 px. A mensagem diz qual e o que cortar. 2 = JSON ou marca inválidos.
- Outra empresa: copie `marca-creat-mtt.json`, troque nome, @, logo e as 7 cores e passe `--marca`. Logo PNG ou SVG com fundo transparente, caminho relativo ao arquivo da marca. Fontes podem continuar as da casa (`fontes/`).
- Gesto: uma tomada só. O ponto vermelho do "creat." vira a emenda entre os cartões (metade em cada um) em cima da régua que avança 1/N; na apresentação ele é a agulha da régua. Seta "arrasta" só na capa.
