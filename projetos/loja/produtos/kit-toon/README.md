# Kit Toon 3D para Three.js

[Português](#português) · [English](#english)

```
kit-toon-3d-threejs/
├── toon-kit.js            o kit (um arquivo, sem dependências além do three)
├── demo/index.html        mascote nuvem montado só com o kit
├── vendor/
│   ├── three.module.min.js        three.js r160 (0.160.0), para rodar sem internet
│   ├── addons/controls/OrbitControls.js
│   └── LICENSE-three.txt          licença MIT do three.js
├── README.md
└── LICENSE
```

---

## Português

Sombra em 3 tons, contorno de nanquim e pulo com comprimir e esticar para Three.js. Um arquivo, uma função que devolve dez peças, feito para cenas com cara de desenho animado que rodam bem no celular.

### Instalação em 3 passos

1. **Copie** `toon-kit.js` para a pasta do seu projeto.
2. **Carregue o three.js** com versão fixa num import map (testado com 0.160.0; o kit funciona do r160 em diante):
   ```html
   <script type="importmap">
   {"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js",
               "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}
   </script>
   ```
3. **Crie o kit** e monte suas malhas:
   ```js
   import * as THREE from 'three';
   import { createToonKit } from './toon-kit.js';
   const kit = createToonKit(THREE);
   scene.add(kit.sph(0.5, '#FF6B6B'));
   ```

### Ver a demo

Módulos JavaScript precisam de um servidor (o Chrome bloqueia módulos abertos por `file://`; o Firefox costuma abrir). Na pasta `kit-toon-3d-threejs/`, que sai do zip:

```bash
npx serve .            # ou: python3 -m http.server 8000
```

Abra `http://localhost:3000/demo/` (ou `:8000/demo/`). Toque ou clique na cena para a nuvem pular; arraste para girar; o botão no canto troca o tema. Se a página abrir por `file://` e o módulo não carregar, ela mostra esse mesmo aviso.

### Sem internet (three.js local)

A demo já vem apontando para `vendor/`, então funciona offline. Para fazer o mesmo no seu projeto:

```bash
npm pack three@0.160.0                       # baixa three-0.160.0.tgz
tar -xzf three-0.160.0.tgz
mkdir -p vendor/addons
cp package/build/three.module.min.js vendor/
cp -r package/examples/jsm/controls vendor/addons/   # só os addons que usar
cp package/LICENSE vendor/LICENSE-three.txt
```

E troque o import map:

```html
<script type="importmap">
{"imports":{"three":"./vendor/three.module.min.js","three/addons/":"./vendor/addons/"}}
</script>
```

Regra: three e addons sempre da **mesma versão**.

### API

Tudo sai de uma chamada: `const kit = createToonKit(THREE, opções)`.

#### `createToonKit(THREE, { ink, tones })`
Cria o kit ligado à sua cópia do three.
- `THREE`: o módulo three (`import * as THREE from 'three'`).
- `ink` (string, padrão `'#1E1B2E'`): cor do contorno.
- `tones` (array de 0 a 255, padrão `[72, 165, 255]`): os degraus da sombra, do escuro ao claro. Quatro valores dão 4 tons.
- **Retorna** `{ gradient, toon, INK, outlineMat, mk, sph, faceted, hopPose, onTwos, SPH }`.
```js
const kit = createToonKit(THREE, { ink: '#2A1F3D', tones: [60, 150, 255] });
```

#### `kit.toon(cor, opções?)`
`MeshToonMaterial` com a sombra em degraus. Fica em cache: a mesma cor com as mesmas opções devolve o mesmo material.
- `cor`: qualquer cor aceita pelo three (`'#FF6B6B'`, `0xff6b6b`).
- `opções`: repassadas ao `MeshToonMaterial` (`{ transparent: true, opacity: .8 }`).
- **Retorna** `THREE.MeshToonMaterial`.
```js
const pele = kit.toon('#FFC48C');
pele.color.set('#F2A86B'); // muda em todas as malhas que usam esse material
```

#### `kit.mk(geometria, material, { ol, cast, recv })`
Malha com material de desenho e contorno de nanquim (casca invertida como filha).
- `geometria`: qualquer `BufferGeometry` com normais lisas.
- `material`: string de cor (vira `kit.toon(cor)`) ou um material pronto.
- `ol` (padrão `0.022`): espessura do contorno em unidades do objeto; `0` = sem contorno.
- `cast` (padrão `true`) e `recv` (padrão `false`): projeta e recebe sombra.
- **Retorna** `THREE.Mesh` (o contorno é `mesh.children[0]`, com `raycast` vazio).
```js
const corpo = kit.mk(new THREE.CapsuleGeometry(.34, .3, 6, 18), '#FF6B6B');
const chao = kit.mk(new THREE.CircleGeometry(3, 48), '#8ED98A', { ol: 0, cast: false, recv: true });
```

#### `kit.sph(raio, material, ol?)`
Esfera que reaproveita uma geometria só (`kit.SPH`) e mantém o contorno com espessura constante, seja qual for o raio.
- `raio`: raio em unidades da cena.
- `material`: cor ou material.
- `ol` (padrão `0.022`): espessura do contorno em unidades da cena; `0` = sem.
- **Retorna** `THREE.Mesh` com `scale` igual ao raio.
```js
const cabeca = kit.sph(.44, '#FF6B6B');
cabeca.position.y = 1.1;
```

#### `kit.faceted(geometria, cor, ol?)`
Superfície facetada (rocha, cristal) com sombreamento plano e contorno sem rachaduras.
- `geometria`: geometria indexada (ex.: `IcosahedronGeometry`).
- `cor`: string de cor.
- `ol` (padrão `0.04`): espessura do contorno.
- **Retorna** `THREE.Mesh`.
```js
const pedra = kit.faceted(new THREE.IcosahedronGeometry(.5, 0), '#9C8CB9');
```

#### `kit.hopPose(p, h)`
Pose de um pulo com antecipação (agacha nos primeiros 20%) e comprimir e esticar com volume constante.
- `p`: progresso do pulo, de 0 a 1.
- `h`: altura máxima.
- **Retorna** `{ y, sx, sy }`. Aplique num grupo com pivô nos pés: `rig.position.y = y; rig.scale.set(sx, sy, sx)`.
```js
const { y, sx, sy } = kit.hopPose(tempoNoPulo / 0.7, 0.75);
rig.position.y = y; rig.scale.set(sx, sy, sx);
```
Dica: no último quadro do pulo o `sy` está em 1.16 (esticado na queda). A demo faz um assentamento de 0,26 s que passa por um leve achatamento e volta a 1; copie a função de lá.

#### `kit.onTwos(t, fps?)`
Tempo "em dois": arredonda `t` para 12 desenhos por segundo, como animação tradicional.
- `t`: tempo em segundos.
- `fps` (padrão `12`).
- **Retorna** número (segundos, em degraus).
```js
const t2 = kit.onTwos(relogio);
braco.rotation.z = Math.sin(t2 * 3) * .2; // pose em dois; câmera continua a 60 fps
```

#### `kit.INK`
Uniform compartilhado `{ value: THREE.Color }` com a cor de todos os contornos.
```js
kit.INK.value.set('#0B0918'); // tema escuro: muda todos os contornos de uma vez
```

#### `kit.outlineMat(w)`
Material de contorno (casca invertida) para espessura `w`, em cache. Use quando montar o contorno à mão.
- **Retorna** `THREE.ShaderMaterial`.
```js
const contorno = new THREE.Mesh(minhaGeo, kit.outlineMat(0.03));
```

#### `kit.gradient` e `kit.SPH`
`gradient` é a `DataTexture` de 3 tons (filtro `Nearest`) usada nos materiais; serve para seus próprios `MeshToonMaterial`. `SPH` é a `SphereGeometry(1, 28, 18)` compartilhada; use com `scale` em vez de criar esferas novas.

### Receita do mascote (a nuvem da demo)

1. **Hierarquia**: `rig` (pivô nos pés, recebe pulo e escala) > `giro` (rotação) > `corpo` (respiração) > peças.
2. **Corpo**: 6 esferas `kit.sph` brancas sobrepostas, uma grande no centro (r .5), duas laterais (r .36), duas no topo e uma atrás. Os contornos internos ficam escondidos dentro das outras esferas; só a silhueta aparece.
3. **Rosto**: olhos brancos achatados (`kit.mk(kit.SPH, MeshBasicMaterial)` com `scale` não uniforme), pupila escura, brilho branco; boca em meio toro (`TorusGeometry(.075, .018, 8, 20, Math.PI)` girado 180°); bochechas rosadas em `MeshBasicMaterial`, que não recebem luz.
4. **Uma cor de personagem**: sapatinhos laranja. O resto é branco e nanquim.
5. **Vida**: respiração e aceno dos braços em `kit.onTwos`; piscar a cada 2 a 5 s (escala Y dos olhos a .1 por 120 ms); pulo com `kit.hopPose` ao tocar e sozinho a cada 3 a 5 s; o pufe do topo numa mola ligada à velocidade vertical (sobreposição: ele chega atrasado).
6. **Tema escuro**: um objeto de paleta por tema; troque céu (`CanvasTexture`), luzes, `material.color` e `kit.INK.value`. A cena não é duplicada.
7. **Movimento reduzido**: com `prefers-reduced-motion`, sem pulo ocioso, giro vira balanço lento, pulo baixo e menos esticado.

### Desempenho

- `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
- Reaproveite geometria (`kit.SPH`) e materiais (`kit.toon` já tem cache). Trocar a cor do material vale para todas as malhas.
- O contorno é uma segunda malha: não ponha contorno em peças minúsculas (pupilas, brilhos), passe `ol: 0`.
- Sombra: `mapSize` 1024 no celular, 2048 no desktop; feche a câmera de sombra em volta da cena.
- Pause o loop com `document.hidden` (`renderer.setAnimationLoop(null)`) e limite o `dt` ao voltar.
- Muitas peças iguais (partículas, grama): `InstancedMesh` com `kit.toon`.
- Objetos grandes e redondos (chão, ilha) ficam melhores com uma esfera de mais segmentos que o `kit.SPH`, para a borda não aparecer poligonal.

### Licença

O kit é vendido com a licença em `LICENSE`: uso em projetos pessoais e comerciais, inclusive de clientes; não pode ser revendido nem redistribuído como está. O three.js em `vendor/` é MIT, com a licença em `vendor/LICENSE-three.txt`.

---

## English

Three-tone cel shading, ink outlines and squash-and-stretch hops for Three.js. One file, one function returning ten pieces, built for cartoon-looking scenes that run well on phones.

### Install in 3 steps

1. **Copy** `toon-kit.js` into your project.
2. **Load three.js** with a pinned version in an import map (tested with 0.160.0; the kit works from r160 on):
   ```html
   <script type="importmap">
   {"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js",
               "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}
   </script>
   ```
3. **Create the kit** and build your meshes:
   ```js
   import * as THREE from 'three';
   import { createToonKit } from './toon-kit.js';
   const kit = createToonKit(THREE);
   scene.add(kit.sph(0.5, '#FF6B6B'));
   ```

### Run the demo

JavaScript modules need a server (Chrome blocks modules opened from `file://`; Firefox usually allows it). In the `kit-toon-3d-threejs/` folder you get from the zip:

```bash
npx serve .            # or: python3 -m http.server 8000
```

Open `http://localhost:3000/demo/` (or `:8000/demo/`). Tap or click the scene to make the cloud hop; drag to orbit; the corner button switches theme. If the page is opened from `file://` and the module fails to load, it shows this same hint.

### Offline (local three.js)

The demo already points to `vendor/`, so it works offline. To do the same in your project:

```bash
npm pack three@0.160.0
tar -xzf three-0.160.0.tgz
mkdir -p vendor/addons
cp package/build/three.module.min.js vendor/
cp -r package/examples/jsm/controls vendor/addons/
cp package/LICENSE vendor/LICENSE-three.txt
```

Then change the import map to `{"imports":{"three":"./vendor/three.module.min.js","three/addons/":"./vendor/addons/"}}`. Always keep three and its addons on the **same version**.

### API

Everything comes from one call: `const kit = createToonKit(THREE, options)`.

| Function | Signature | Returns | Notes |
|---|---|---|---|
| `createToonKit` | `(THREE, { ink = '#1E1B2E', tones = [72,165,255] })` | kit object | `ink`: outline color. `tones`: shadow steps, dark to light (0 to 255). |
| `toon` | `(color, opts?)` | `MeshToonMaterial` | Cached per color + opts; `opts` go to the material. |
| `mk` | `(geo, mat, { ol = .022, cast = true, recv = false })` | `Mesh` | `mat` is a color string or a material. `ol` = outline width in object units, `0` = none. Outline is `children[0]` and ignores raycasts. |
| `sph` | `(r, mat, ol = .022)` | `Mesh` | Sphere reusing `kit.SPH`; outline width stays constant in scene units. |
| `faceted` | `(geo, color, ol = .04)` | `Mesh` | Flat-shaded rock or crystal with a crack-free outline. |
| `hopPose` | `(p, h)` | `{ y, sx, sy }` | `p` 0..1 hop progress, `h` height. Anticipation, then stretch; volume preserved. Apply to a rig pivoted at the feet. |
| `onTwos` | `(t, fps = 12)` | number | Steps time to 12 drawings per second for poses. |
| `INK` | `{ value: Color }` | | Shared uniform: set it to recolor every outline (dark theme). |
| `outlineMat` | `(w)` | `ShaderMaterial` | Cached inverted-hull material for hand-made outlines. |
| `gradient`, `SPH` | | `DataTexture`, `SphereGeometry` | The 3-tone ramp and the shared unit sphere. |

```js
const kit = createToonKit(THREE);
const body = kit.mk(new THREE.CapsuleGeometry(.34, .3, 6, 18), '#FF6B6B');
const head = kit.sph(.44, '#FF6B6B'); head.position.y = 1.1;
const rock = kit.faceted(new THREE.IcosahedronGeometry(.5, 0), '#9C8CB9');
const { y, sx, sy } = kit.hopPose(timeInHop / 0.7, 0.75);
rig.position.y = y; rig.scale.set(sx, sy, sx);
arm.rotation.z = Math.sin(kit.onTwos(clock) * 3) * .2;
kit.INK.value.set('#0B0918');
```

On the last hop frame `sy` is 1.16 (stretched on the fall). The demo adds a 0.26 s settle that dips into a slight squash and returns to 1; copy it from there.

### Mascot recipe (the demo cloud)

1. **Hierarchy**: `rig` (feet pivot, hop and scale) > `spin` (rotation) > `body` (breathing) > parts.
2. **Body**: 6 overlapping white `kit.sph` spheres. Inner outlines hide inside the other spheres, so only the silhouette is inked.
3. **Face**: flattened white eyes, dark pupils, white highlight; half-torus mouth turned 180°; pink cheeks in `MeshBasicMaterial` (unlit).
4. **One character color**: orange shoes.
5. **Life**: breathing and arm sway on twos; blink every 2 to 5 s; `hopPose` on tap and on its own every 3 to 5 s; the top puff on a spring driven by vertical speed (overlapping action).
6. **Dark theme**: one palette object per theme; swap sky, lights, `material.color` and `kit.INK.value`. No duplicated scene.
7. **Reduced motion**: no idle hops, spin becomes a slow sway, lower and softer hop.

### Performance

- `setPixelRatio(Math.min(devicePixelRatio, 2))`; reuse `kit.SPH` and cached materials.
- No outline on tiny parts (`ol: 0`); shadow map 1024 on phones, 2048 on desktop.
- Pause on `document.hidden` and clamp `dt` on resume; use `InstancedMesh` for many copies.
- Use a higher-segment sphere for large round props so the rim does not look faceted.

### License

The kit ships under the license in `LICENSE`: personal and commercial use, client work included; no resale or redistribution as-is. three.js in `vendor/` is MIT, see `vendor/LICENSE-three.txt`.
