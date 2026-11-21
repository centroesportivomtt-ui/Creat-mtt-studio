// sombra.js · sombra projetada da serra por varredura de linhas (Prisma, Creat Nuvem)
// PURO: sem DOM. Usado pelo worker (e pelo cliente quando não há Worker).
//
// Ideia: andando de pixel em pixel no sentido OPOSTO ao sol, carrega-se a "altura de sombra" H,
// que cai tan(elevação) metros por metro andado. Onde H passa do chão, há sombra; onde o chão
// passa de H, o chão vira a nova H (ele mesmo projeta sombra adiante). Um passo por pixel = O(pixels).
// O ponto anterior na linha do sol cai entre dois pixels da coluna (ou linha) já processada:
// interpola-se H ali, então qualquer azimute funciona sem girar a imagem.

import { metrosPorPixel, SEMIDIAMETRO } from './nucleo.js';

export const COR_SOMBRA = [27, 42, 74, 140];     // ARQUITETURA 4.2 (azul frio translúcido)
const RAD = Math.PI / 180;

// ---------------------------------------------------------------- grade reduzida (cache por escala)
const reduzidas = new WeakMap();
export function gradeNaEscala(g, escala = 1) {
  if (escala >= 1) return g;
  let porEscala = reduzidas.get(g);
  if (!porEscala) { porEscala = new Map(); reduzidas.set(g, porEscala); }
  const k = Math.round(1 / escala);
  if (porEscala.has(k)) return porEscala.get(k);
  const w = Math.floor(g.w / k), h = Math.floor(g.h / k), dados = new Float32Array(w * h);
  // média do bloco k×k (NaN do bloco ignorado)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let j = 0; j < k; j++) { const lin = (y * k + j) * g.w + x * k; for (let i = 0; i < k; i++) { const v = g.dados[lin + i]; if (v === v) { s += v; n++; } } }
    dados[y * w + x] = n ? s / n : NaN;
  }
  // mesma área geográfica; z virtual fracionário só serve a metrosPorPixel (paraPixel vale na grade de origem)
  const r = { w, h, z: g.z - Math.log2(k), x0: g.x0, y0: g.y0, dados, k, origem: g };
  porEscala.set(k, r);
  return r;
}

// ---------------------------------------------------------------- varredura
// Devolve a máscara (0 = sol, 255 = sombra cheia), com borda suave de `suave` metros.
// sol = { elevacao (aparente, centro), azimute }. Elevação usada = limbo superior (igual ao horasDeSol).
// latRef: latitude para metros por pixel (centro do recorte).
// campo (opcional, Float32Array w*h): recebe a profundidade contínua da sombra em metros (altura de sombra
// menos o chão; negativo = sol). Interpolado e cortado em zero, dá bordas lisas em qualquer ampliação (cartão).
export function varrerSombra(g, sol, { latRef, suave = 6, olho = 1.7, saida, interp = 'linear', campo } = {}) {
  const { w, h, dados } = g;
  const n = w * h;
  const masc = saida && saida.length === n ? saida : new Uint8Array(n);
  const el = sol.elevacao + SEMIDIAMETRO;
  if (!(el > 0)) { masc.fill(255); if (campo) campo.fill(1000); return masc; }   // noite: tudo coberto
  const mpp = metrosPorPixel(g, latRef ?? -11.34);
  const az = sol.azimute * RAD;
  const sx = Math.sin(az), sy = -Math.cos(az);                     // rumo do sol em pixels (x leste, y sul)
  const tanEl = Math.tan(Math.max(el, 0.05) * RAD);
  const inv = 1 / suave;
  const H = varrerSombra._H && varrerSombra._H.length === n ? varrerSombra._H : (varrerSombra._H = new Float32Array(n));
  const xDomina = Math.abs(sx) >= Math.abs(sy);
  if (xDomina) {
    // passo de 1 coluna rumo ao sol; deslocamento fracionário na vertical
    const dx = sx > 0 ? 1 : -1, dy = sy / Math.abs(sx);
    const queda = Math.hypot(1, dy) * mpp * tanEl;
    const xIni = sx > 0 ? w - 1 : 0;
    for (let x = xIni; x >= 0 && x < w; x -= dx) {
      const xa = x + dx, temAnt = xa >= 0 && xa < w;
      for (let y = 0; y < h; y++) {
        const i = y * w + x, chao = dados[i] + olho;
        let hAnt = -1e9;
        if (temAnt) {
          const ya = y + dy;
          if (ya >= 0 && ya <= h - 1) {
            const y0 = ya | 0, f = ya - y0, y1 = y0 + 1 < h ? y0 + 1 : y0;
            const a = H[y0 * w + xa], b = H[y1 * w + xa];
            hAnt = (interp === 'max' ? (a > b ? a : b) : interp === 'perto' ? (f < 0.5 ? a : b) : a * (1 - f) + b * f) - queda;
          }
        }
        const dif = hAnt - chao;
        if (campo) campo[i] = dif > 1000 ? 1000 : dif < -1000 ? -1000 : dif;
        if (dif > 0) { H[i] = hAnt; masc[i] = dif >= suave ? 255 : (dif * inv * 255) | 0; }
        else { H[i] = dados[i] > hAnt ? dados[i] : hAnt; masc[i] = 0; }   // chão vira a nova altura de sombra
      }
    }
  } else {
    const dy = sy > 0 ? 1 : -1, dx = sx / Math.abs(sy);
    const queda = Math.hypot(1, dx) * mpp * tanEl;
    const yIni = sy > 0 ? h - 1 : 0;
    for (let y = yIni; y >= 0 && y < h; y -= dy) {
      const ya = y + dy, temAnt = ya >= 0 && ya < h, lin = y * w, linA = ya * w;
      for (let x = 0; x < w; x++) {
        const i = lin + x, chao = dados[i] + olho;
        let hAnt = -1e9;
        if (temAnt) {
          const xa = x + dx;
          if (xa >= 0 && xa <= w - 1) {
            const x0 = xa | 0, f = xa - x0, x1 = x0 + 1 < w ? x0 + 1 : x0;
            const a = H[linA + x0], b = H[linA + x1];
            hAnt = (interp === 'max' ? (a > b ? a : b) : interp === 'perto' ? (f < 0.5 ? a : b) : a * (1 - f) + b * f) - queda;
          }
        }
        const dif = hAnt - chao;
        if (campo) campo[i] = dif > 1000 ? 1000 : dif < -1000 ? -1000 : dif;
        if (dif > 0) { H[i] = hAnt; masc[i] = dif >= suave ? 255 : (dif * inv * 255) | 0; }
        else { H[i] = dados[i] > hAnt ? dados[i] : hAnt; masc[i] = 0; }
      }
    }
  }
  return masc;
}

// ---------------------------------------------------------------- pintura RGBA
export function pintarMascara(masc, largura, altura, cor = COR_SOMBRA, saida) {
  const n = largura * altura;
  const rgba = saida && saida.length === n * 4 ? saida : new Uint8ClampedArray(n * 4);
  const [r, g, b, a] = cor;
  // tabela de alfa: 256 níveis da máscara -> alfa final (curva suave nas bordas)
  const tab = pintarMascara._tab && pintarMascara._a === a ? pintarMascara._tab : (pintarMascara._a = a, pintarMascara._tab = Uint8Array.from({ length: 256 }, (_, v) => { const t = v / 255; return Math.round(a * t * t * (3 - 2 * t)); }));
  const u32 = new Uint32Array(rgba.buffer, rgba.byteOffset, n);
  const base = (r | (g << 8) | (b << 16)) >>> 0;                  // little-endian: R,G,B,A na memória
  for (let i = 0; i < n; i++) { const m = masc[i]; u32[i] = m ? (base | (tab[m] << 24)) >>> 0 : 0; }
  return rgba;
}

// ---------------------------------------------------------------- API do contrato (ARQUITETURA 4.2)
// mascaraDeSombra(grade, sol, escala = 1, cor) -> { largura, altura, rgba, mascara, escala }
export function mascaraDeSombra(g, sol, escala = 1, cor = COR_SOMBRA, opcoes = {}) {
  const gr = gradeNaEscala(g, escala);
  const mascara = varrerSombra(gr, sol, opcoes);
  const rgba = pintarMascara(mascara, gr.w, gr.h, cor);
  return { largura: gr.w, altura: gr.h, rgba, mascara, escala: g.w / gr.w === 1 ? 1 : 1 / Math.round(g.w / gr.w) };
}

// consulta: quanto de sombra (0..1) há na máscara num lon/lat
export function sombraEm(g, mascara, largura, lon, lat) {
  const n = 2 ** g.z, lr = lat * RAD;
  const fx = ((lon + 180) / 360 * n - g.x0) * 256 / g.w;
  const fy = ((1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n - g.y0) * 256 / g.h;
  const altura = mascara.length / largura;
  const x = Math.floor(fx * largura), y = Math.floor(fy * altura);
  if (x < 0 || y < 0 || x >= largura || y >= altura) return null;
  return mascara[y * largura + x] / 255;
}
