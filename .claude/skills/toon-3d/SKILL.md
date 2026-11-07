---
name: toon-3d
description: Pipeline 3D em estilo desenho animado da Creat Nuvem (Three.js) — sombra em 3 tons, contorno de nanquim, personagens com comprimir-e-esticar e animação "em dois". Use para cenas 3D, mascotes, heróis interativos ou qualquer pedido de "3D com cara de desenho".
---

# 3D com cara de desenho

O kit pronto está em `.claude/skills/toon-3d/toon-kit.js`. Copie para o projeto e importe; a sede (`sede/index.html`) é o exemplo completo em produção.

## Carregar o three.js
```html
<script type="importmap">
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
            "three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}
</script>
```
Versão fixa sempre; addons da mesma versão. Em artefatos do Claude só valem cdnjs, jsdelivr e unpkg.

## As 6 regras do visual
1. **Material**: `kit.toon(cor)` — `MeshToonMaterial` com gradientMap de 3 tons e filtro `Nearest`. Nada de PBR.
2. **Contorno**: `kit.mk(geo, cor, { ol })`. Geometrias com cantos vivos (caixas) usam `RoundedBoxGeometry` para o contorno não abrir nas quinas. Para facetado use `kit.faceted`.
3. **Cores chapadas e saturadas**, uma por personagem. Bochechas e brilho do olho em `MeshBasicMaterial` (não recebem luz).
4. **Luz**: `HemisphereLight` + uma `DirectionalLight` com sombra (mapSize 1024 no celular, 2048 no desktop).
5. **Céu**: gradiente em `CanvasTexture` como `scene.background`; nuvens = 4 a 7 esferas achatadas com contorno.
6. **Tema escuro**: troque céu, luzes e `kit.INK.value` (contorno) — não duplique a cena.

## Personagem padrão (proporção de mascote)
Corpo cápsula (r .34) · cabeça esfera grande (r .44) · olhos brancos achatados com pupila e brilho · boca em meio-toro · bochechas rosadas · braços em pivôs nos ombros · acessório que conta a profissão (chapéu, óculos, ferramenta na mão).

## Animação
- **Em dois**: `kit.onTwos(t)` nas poses (digitar, respirar, olhar). Câmera, partículas e nuvens continuam a 60 fps.
- **Comprimir e esticar** em todo pulo: `kit.hopPose(p, h)`; volume constante.
- **Antecipação** antes de ações, **sobreposição** em antenas/cabelo (mola com seno defasado).
- Piscar a cada 2–5 s (escala Y do grupo dos olhos para .1 por 120 ms).
- `prefers-reduced-motion`: sem auto-rotação, sem pulos ociosos, deriva lenta.

## Desempenho (celular primeiro)
`setPixelRatio(Math.min(devicePixelRatio, 2))` · reaproveite geometrias (`kit.SPH`) e materiais (cache) · `InstancedMesh` para partículas · pause quando `document.hidden` · contorno é uma segunda malha: não ponha contorno em peças minúsculas.

## Interação
`OrbitControls` com damping, sem pan; `Raycaster` só nas malhas clicáveis (contornos têm `raycast` vazio); rótulos com `CSS2DRenderer`; câmera voa com easing e `setViewOffset` para o objeto não ficar atrás de painéis.

## Verificar
Rode a skill `verificacao-visual` (ela já liga WebGL por software) e confira o print no celular e no desktop.
