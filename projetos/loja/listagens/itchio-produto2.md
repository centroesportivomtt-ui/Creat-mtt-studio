# itch.io · Produto 2 · Toon 3D Kit for Three.js (EN)

**Onde colar cada campo** (itch.io > Dashboard > Create new project; textos em inglês):

| campo deste arquivo | onde fica no itch.io |
|---|---|
| Title | Title |
| Short description | Short description or tagline |
| Classification | Classification: Assets (ou Tools) · Kind of project: Downloadable |
| Pricing | Pricing: Paid · Price USD 9.00 |
| Uploads | Upload `projetos/loja/dist/kit-toon-3d-threejs.zip` |
| Long description | Details > Description |
| Tags | Tags (até 10) |
| Delivery text | Cole no fim da descrição, sob "After you download" |

---

## Title

Toon 3D Kit for Three.js

## Short description

Three-tone cel shading, ink outlines and squash-and-stretch hops in one small file.

## Classification

Assets · Downloadable

## Pricing

USD 9.00

## Long description

Make a Three.js scene look hand-drawn: flat three-tone shading, ink outlines and bouncy, volume-preserving hops. The kit is one small JavaScript module with no dependencies besides Three.js itself.

**What's in the zip**

- `toon-kit.js`: one function, `createToonKit(THREE)`, that returns the building blocks: a cached three-tone toon material, inverted-hull outlines that share a single ink color (switch it for dark mode in one line), helpers for outlined meshes and spheres, a faceted variant for rocks and crystals, a hop pose with anticipation and squash and stretch, and "on twos" timing (12 poses per second, like traditional animation).
- A demo: a smiling cloud mascot built only with the kit. It spins, hops when you tap it, has light and dark themes and respects reduced motion.
- `README.md` in English and Portuguese, with a 3-step setup, the API of every function with a short example, the mascot recipe and mobile performance tips.

**Who it's for**

Developers who already write Three.js and want a cartoon look without building gradient maps, outline shaders and hop curves from scratch. It's the same kit behind the Creat Nuvem 3D headquarters.

**Before you buy**

- Requires basic JavaScript and Three.js r160 or newer.
- The demo ships with Three.js r160 in `vendor/`, so it works offline. It needs a local server (`npx serve .` or `python3 -m http.server`), because browsers block modules opened from `file://`. The README shows both commands.
- Doesn't need Claude Code. Works in any Three.js project.

**License**

Personal and commercial use allowed, including client work. Reselling or redistributing the kit itself is not allowed.

Questions: [EMAIL_SUPORTE]

## Tags

threejs, webgl, 3d, toon-shader, cel-shading, javascript, animation, mascot, cartoon, creative-coding

## Delivery text (after you download)

Thanks for buying the Toon 3D Kit.

1. Unzip `kit-toon-3d-threejs.zip` and open the demo (`demo/index.html`) as described in `README.md`. You should see the cloud mascot spinning; tap it to make it hop.
2. Copy `toon-kit.js` into your project and import it: `import { createToonKit } from './toon-kit.js'`.
3. The README has the mascot recipe and the full API.

Something not working? Email [EMAIL_SUPORTE] with your browser and the console message (F12).
