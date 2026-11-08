// Kit de desenho 3D da Creat Nuvem (Three.js r160+).
// Uso:
//   import * as THREE from 'three';
//   import { createToonKit } from './toon-kit.js';
//   const kit = createToonKit(THREE);
//   const corpo = kit.mk(new THREE.CapsuleGeometry(.34, .3, 6, 18), '#FF6B6B');
//   const cabeca = kit.sph(.44, '#FF6B6B');

export function createToonKit(THREE, { ink = '#1E1B2E', tones = [72, 165, 255] } = {}) {
  // Sombra em degraus: 3 tons chapados, como pintura de animação.
  const gradient = new THREE.DataTexture(new Uint8Array(tones), tones.length, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;

  const matCache = new Map();
  function toon(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...opts }));
    return matCache.get(key);
  }

  // Contorno de nanquim por casca invertida: empurra os vértices pela normal e desenha só as costas.
  // A cor é um uniform compartilhado: troque INK.value para mudar todos os contornos (ex.: tema escuro).
  const INK = { value: new THREE.Color(ink) };
  const olCache = new Map();
  function outlineMat(w) {
    const k = w.toFixed(4);
    if (!olCache.has(k)) olCache.set(k, new THREE.ShaderMaterial({
      uniforms: { w: { value: w }, c: INK },
      vertexShader: 'uniform float w; void main(){ vec3 p = position + normal * w; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
      fragmentShader: 'uniform vec3 c; void main(){ gl_FragColor = vec4(c, 1.0); }',
      side: THREE.BackSide,
    }));
    return olCache.get(k);
  }
  const noRay = () => {};

  // Malha com material de desenho + contorno. ol = espessura do contorno em unidades do objeto (0 = sem).
  function mk(geo, mat, { ol = 0.022, cast = true, recv = false } = {}) {
    const m = new THREE.Mesh(geo, typeof mat === 'string' ? toon(mat) : mat);
    m.castShadow = cast; m.receiveShadow = recv;
    if (ol) { const o = new THREE.Mesh(geo, outlineMat(ol)); o.raycast = noRay; m.add(o); }
    return m;
  }
  const SPH = new THREE.SphereGeometry(1, 28, 18);
  // Esfera de raio r com contorno de espessura constante, reaproveitando uma geometria só.
  function sph(r, mat, ol = 0.022) { const m = mk(SPH, mat, { ol: ol ? ol / r : 0 }); m.scale.setScalar(r); return m; }

  // Superfície facetada (rocha, cristal): sombreamento plano + contorno liso sem rachaduras.
  function faceted(geo, color, ol = 0.04) {
    const flat = geo.toNonIndexed(); flat.computeVertexNormals();
    const m = new THREE.Mesh(flat, toon(color)); m.castShadow = true;
    const o = new THREE.Mesh(geo, outlineMat(ol)); o.raycast = noRay; m.add(o);
    return m;
  }

  // Pulo com antecipação, comprimir e esticar. p = progresso 0..1 de um pulo, h = altura.
  // Retorna { y, sx, sy }: aplique em rig.position.y e rig.scale (pivô nos pés).
  function hopPose(p, h) {
    let y = 0, sy = 1;
    if (p < 0.2) sy = 1 - 0.22 * Math.sin((p / 0.2) * Math.PI);           // antecipação: agacha
    else { const q = (p - 0.2) / 0.8; y = h * Math.sin(q * Math.PI); sy = 1 + 0.16 * Math.abs(Math.cos(q * Math.PI)); } // estica na subida e na queda
    return { y, sx: 1 / Math.sqrt(sy), sy };                                // volume constante
  }

  // Tempo "em dois": poses a 12 desenhos por segundo, como animação tradicional. A câmera continua lisa.
  const onTwos = (t, fps = 12) => Math.floor(t * fps) / fps;

  return { gradient, toon, INK, outlineMat, mk, sph, faceted, hopPose, onTwos, SPH };
}
