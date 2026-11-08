# Cakto · Produto 2 · Mini-curso Kit Toon 3D para Three.js

**Onde colar cada campo** (Cakto > Produtos > Criar produto; os nomes dos campos podem mudar no painel):

| campo deste arquivo | onde fica na Cakto |
|---|---|
| Nome do produto | Nome do produto |
| Tipo | Tipo/formato: curso ou material digital com área de membros |
| Categoria | Educação / Tecnologia |
| Preço | Preço da oferta principal |
| Descrição | Descrição do produto |
| Justificativa educativa | Descrição detalhada, ou resposta à análise da Cakto se for pedida |
| Mini-guia incluído | Área de membros: crie um módulo "Mini-guia" e cole cada lição como uma aula em texto |
| Entrega | Na última aula, anexe o zip como material de apoio |
| Mensagem pós-compra | Página de obrigado e e-mail de acesso |
| Link do checkout | Depois de criado, copie o link e anote em [LINK_CAKTO_PRODUTO_2] no fim deste arquivo. A página de vendas (`index.html`) aponta para o Payhip; use o link da Cakto onde você divulgar só em reais, ou troque o `href` do botão do produto 2 se preferir a Cakto |

---

## Nome do produto

Mini-curso: 3D com Cara de Desenho no Three.js

## Tipo e categoria

Curso em texto com material de apoio · Educação / Tecnologia

## Preço

R$ 39,00

## Descrição

Saiba como dar cara de desenho animado a uma cena Three.js: sombra em 3 tons chapados, contorno de nanquim, pulo com comprimir e esticar e animação a 12 poses por segundo. São 5 lições curtas em texto, com código, e um kit pronto para usar no seu projeto, com uma demo de mascote para estudar.

Pré-requisito: JavaScript básico e um primeiro contato com Three.js.

Não depende do Claude Code. Não há promessa de resultado financeiro.

## Justificativa educativa

O produto ensina uma técnica de computação gráfica (toon shading ou cel shading) aplicada à web. O conteúdo didático é o mini-guia abaixo, com 5 lições que explicam o porquê de cada técnica antes de mostrar o código. O kit (`toon-kit.js`), a demo e o README bilíngue são o material de prática: o aluno lê a lição, abre a demo e muda os parâmetros para ver o efeito.

## Mini-guia incluído (cole cada lição como uma aula)

### Lição 1 · Por que o 3D comum não parece desenho

O material padrão do Three.js (`MeshStandardMaterial`) imita a luz real: a sombra passa do claro ao escuro em degradê suave. Desenho animado faz o oposto. O pintor de animação usa poucas cores chapadas, com a borda da sombra bem marcada, e contorna tudo com tinta preta.

Para chegar lá, mudamos três coisas:
1. A sombra deixa de ser contínua e vira degraus (3 tons).
2. Cada objeto ganha um contorno de espessura constante.
3. O movimento ganha os princípios clássicos da animação: antecipação, comprimir e esticar, poses espaçadas.

Exercício: abra a demo do kit, depois troque mentalmente cada parte por um material comum e repare no que se perde.

### Lição 2 · Sombra em 3 tons

O `MeshToonMaterial` do Three.js aceita um `gradientMap`: uma textura minúscula que diz quantos degraus a sombra tem. O kit cria essa textura com 3 valores (escuro, médio, claro) e filtro `NearestFilter`, que impede o Three.js de suavizar a passagem entre eles.

```js
import * as THREE from 'three';
import { createToonKit } from './toon-kit.js';
const kit = createToonKit(THREE);              // tons padrão: [72, 165, 255]
const material = kit.toon('#FFC93C');          // amarelo com sombra em 3 degraus
```

O kit guarda cada material em cache: pedir `kit.toon('#FFC93C')` duas vezes devolve o mesmo objeto, o que economiza memória.

Exercício: crie o kit com `tones: [40, 255]` e veja a cena ficar com apenas 2 tons, mais dura. Depois teste `[90, 150, 210, 255]`.

### Lição 3 · Contorno de nanquim

A técnica se chama casca invertida. Para cada malha, o kit desenha uma segunda cópia um pouco maior, empurrando os vértices na direção da normal, e pinta só a parte de trás (`BackSide`) com uma cor sólida. O que sobra visível dessa casca é exatamente a borda: o contorno.

```js
const corpo = kit.mk(new THREE.CapsuleGeometry(.34, .3, 6, 18), '#FF6B6B', { ol: 0.022 });
const cabeca = kit.sph(.44, '#FF6B6B');        // esfera com contorno de espessura constante
kit.INK.value.set('#FFFDF7');                  // troca a cor de todos os contornos de uma vez
```

Dois cuidados:
- Caixas com cantos vivos abrem o contorno nas quinas. Use `RoundedBoxGeometry` ou `kit.faceted` para pedras e cristais.
- O contorno é uma malha a mais. Não coloque contorno em peças minúsculas.

Exercício: na demo, mude `kit.INK.value` para branco e veja todos os contornos trocarem de cor com uma linha só. É assim que se faz o tema escuro sem duplicar a cena.

### Lição 4 · Pulo com comprimir e esticar

Um pulo convincente tem três fases: o personagem agacha (antecipação), estica na subida, comprime de novo ao tocar o chão. Para não parecer que ele incha, o volume fica constante: se estica na altura, afina na largura.

```js
// p vai de 0 a 1 durante o pulo; 0.5 é a altura máxima
const { y, sx, sy } = kit.hopPose(p, 0.6);
rig.position.y = y;
rig.scale.set(sx, sy, sx);                     // pivô do grupo nos pés
```

Os primeiros 20% do pulo são o agachamento. Depois, a altura segue um seno e a escala vertical aumenta perto do chão.

Exercício: na demo, toque no mascote várias vezes seguidas e repare no agachamento antes de cada salto.

### Lição 5 · Animação "em dois" e desempenho no celular

Desenho animado tradicional usa 12 poses por segundo para os personagens. O kit oferece `kit.onTwos(t)`, que arredonda o tempo para essas poses. Use nas poses do personagem (respirar, olhar, acenar) e deixe a câmera e as nuvens a 60 quadros por segundo: o contraste dá a sensação de desenho.

```js
const tPose = kit.onTwos(clock.getElapsedTime());
cabeca.rotation.z = Math.sin(tPose * 2) * 0.08;
```

Checklist de desempenho:
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
- Reaproveite a geometria `kit.SPH` e os materiais do cache.
- Pause o loop quando `document.hidden` for verdadeiro.
- Com `prefers-reduced-motion`, desligue a rotação automática e os pulos sozinhos.

Exercício final: monte um personagem seu com corpo, cabeça e um acessório que conte a profissão dele, usando só as funções do kit.

## Entrega

1. **Item principal:** o mini-guia acima, publicado como 5 aulas em texto na área de membros.
2. **Material de apoio:** `projetos/loja/dist/kit-toon-3d-threejs.zip`, anexado na lição 5 ou num módulo "Arquivos".

## Mensagem pós-compra e e-mail de acesso

Assunto: Seu mini-curso de 3D com cara de desenho está liberado

Olá!

Seu acesso está liberado. Comece pela lição 1 na área de membros; cada lição leva poucos minutos e termina com um exercício.

O material de apoio, `kit-toon-3d-threejs.zip`, traz o `toon-kit.js`, a demo do mascote e o README com a API completa. Abra a demo antes da lição 2 para ter algo para mexer enquanto lê.

Dúvidas: [EMAIL_SUPORTE]

Bons estudos!
Creat Nuvem

## Link do checkout da Cakto (anote aqui depois de criar)

[LINK_CAKTO_PRODUTO_2]
