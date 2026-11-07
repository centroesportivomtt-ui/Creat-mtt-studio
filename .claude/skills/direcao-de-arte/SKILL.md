---
name: direcao-de-arte
description: Padrão de direção de arte da Creat Nuvem — como transformar um conceito em sistema visual (paleta, tipografia, grid, movimento, som) com um momento-assinatura. Use ao criar identidade, landing page, experiência interativa ou ao revisar se algo está "com cara de template".
---

# Direção de arte

## Saída obrigatória: a ficha de direção
Antes de qualquer código, escreva no topo do CSS (ou em `docs/direcao.md`):

```
/* Conceito: <nome> — <frase>
   Momento-assinatura: <o que acontece, onde, quando>
   Layout: <ideia de layout em uma linha> */
:root{
  --cor-*: 4 a 6 tokens nomeados pelo papel (fundo, tinta, destaque, apoio)
  --fonte-display / --fonte-texto / --fonte-dado
  --ritmo: escala de espaçamento
  --curva-entrada / --curva-saida / --duracao-*
}
```

## Regras
1. **Uma ousadia só.** Escolha onde o projeto arrisca (tipografia gigante, 3D, cor, som, interação) e deixe o resto calmo.
2. **Tipografia é personalidade.** Display com caráter usado com moderação + texto que lê bem. Escala definida, `text-wrap: balance` nos títulos, ~65 caracteres por linha.
3. **Neutros com intenção.** Cinza puro parece descuido; puxe o neutro para o tom do destaque.
4. **Claro e escuro desenhados**, não invertidos.
5. **Movimento com motivo**: orientar, responder, encantar. Um momento orquestrado vale mais que dez efeitos soltos. Sempre com `prefers-reduced-motion`.
6. **Detalhe que só esse cliente teria**: unidades reais, jargão, objetos do mundo dele como conteúdo, não decoração.
7. **Celular primeiro.** O momento-assinatura precisa funcionar com o polegar.

## Clichês proibidos (a não ser que o cliente peça)
Creme com serifa e terracota · preto com um verde ácido · gradiente roxo-azul · Inter/Space Grotesk "por segurança" · tudo centralizado · cantos arredondados e sombra em tudo · números 01/02/03 sem sequência real · emoji como ícone.

## Skills e conexões da casa
- `impeccable:impeccable` e `taste-skill:design-taste-frontend` para o acabamento e o filtro de bom gosto.
- `frontend-design:frontend-design` para páginas e interfaces web.
- `emil-skills:apple-design`, `emil-skills:animate`, `emil-skills:choreograph` para movimento.
- `design:design-critique` e `design:accessibility-review` para revisar.
- MCP Adobe (`font_recommend`, `suggest_type_palettes`) para pares tipográficos; MCP Figma para levar o design ao Figma ou trazer de lá.
- Skill `toon-3d` quando o conceito pede 3D em estilo desenho.
