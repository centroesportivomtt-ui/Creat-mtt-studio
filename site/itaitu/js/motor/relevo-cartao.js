// relevo-cartao.js · o relevo do cartão da trilha, desenhado direto da altitude (Prisma, Creat Nuvem)
// PURO: sem DOM, sem fetch. Não copia a tela WebGL: pinta o relevo com a luz do minuto da chegada.
//
// relevoDoCartao(gradeDetalhe, gradeSombra, trilha, sol, largura, altura, opcoes)
//   -> { rgba, largura, altura, tracadoPx, bbox, semente, metrosPorPx }
// gradeDetalhe: z14 (ou o que houver) cobrindo o recorte; gradeSombra: z12 inteira (sombra da serra distante).
// Paleta e luz = protótipo cartao_mock.py: mata no fundo, cerrado nas encostas, quartzito claro no alto,
// sol quente, sombra puxada para azul. Recorte e grão vêm de uma semente (traçado + minuto): nenhum cartão igual.

import { metrosPorPixel, semente as fazerSemente, aleatorio, SEMIDIAMETRO } from './nucleo.js';
import { varrerSombra } from './sombra.js';

const RAD = Math.PI / 180;
const TAM = 256;
// caixa do traço no cartão 1080x1920 (DESIGN.md 7, zona E)
export const CAIXA_1080x1920 = [96, 440, 984, 960];

// ---------------------------------------------------------------- Web Mercator em pixel de mundo
const mundoX = (lon, z) => (lon + 180) / 360 * 2 ** z * TAM;
const mundoY = (lat, z) => { const lr = lat * RAD; return (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * 2 ** z * TAM; };
const lonDe = (x, z) => x / (2 ** z * TAM) * 360 - 180;
const latDe = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / (2 ** z * TAM)))) * 180 / Math.PI;

// ---------------------------------------------------------------- recorte (dá para planejar antes de ter os tiles)
// Recorte centrado no traçado: 30% de margem de cada lado, no mínimo 1,5 km de largura na caixa do traço.
// A semente desloca o centro dentro da folga e dá até 8% de zoom: o traço nunca sai da caixa.
export function planejarRecorte(z, trilha, largura, altura, opcoes = {}) {
  if (!trilha || trilha.length < 1) throw new Error('trilha vazia');
  const caixa = opcoes.caixa || (largura === 1080 && altura === 1920 ? CAIXA_1080x1920 : [largura * 0.1, altura * 0.1, largura * 0.9, altura * 0.9]);
  const s0 = opcoes.semente ?? fazerSemente(trilha, opcoes.minuto ?? 0);
  const rnd = aleatorio(s0);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, latMed = 0;
  for (const [lon, lat] of trilha) {
    const x = mundoX(lon, z), y = mundoY(lat, z);
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); latMed += lat;
  }
  latMed /= trilha.length;
  const mpp = 40075016.686 * Math.cos(latMed * RAD) / (TAM * 2 ** z);        // metros por pixel da grade
  const cw = caixa[2] - caixa[0], ch = caixa[3] - caixa[1];
  const tw = Math.max(x1 - x0, 1), th = Math.max(y1 - y0, 1);                // traçado em pixels da grade
  const minLarg = (opcoes.minLarguraM ?? 1500) / mpp;
  const margem = 1 + 2 * (opcoes.margem ?? 0.3);
  let esc = Math.min(cw / Math.max(tw * margem, minLarg), ch / (th * margem)); // px do cartão por px da grade
  esc *= 0.92 + 0.08 * rnd();                                                 // zoom da semente (só afasta)
  const folgaX = Math.max(0, (cw - tw * esc) / 2), folgaY = Math.max(0, (ch - th * esc) / 2);
  const cx = (caixa[0] + caixa[2]) / 2 + (rnd() - 0.5) * 0.8 * folgaX;        // centro do traço no cartão
  const cy = (caixa[1] + caixa[3]) / 2 + (rnd() - 0.5) * 0.8 * folgaY;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;                               // centro do traço no mundo
  const oxMundo = mx - cx / esc, oyMundo = my - cy / esc;                     // pixel de mundo do canto (0,0) do cartão
  const fimX = oxMundo + largura / esc, fimY = oyMundo + altura / esc;
  return {
    z, largura, altura, caixa, semente: s0, esc, oxMundo, oyMundo, latMed,
    metrosPorPx: mpp / esc,
    bbox: [lonDe(oxMundo, z), latDe(fimY, z), lonDe(fimX, z), latDe(oyMundo, z)],   // oeste, sul, leste, norte
    tiles: { x0: Math.floor(oxMundo / TAM), x1: Math.floor(fimX / TAM), y0: Math.floor(oyMundo / TAM), y1: Math.floor(fimY / TAM) },
    tracadoPx: trilha.map(([lon, lat]) => [(mundoX(lon, z) - oxMundo) * esc, (mundoY(lat, z) - oyMundo) * esc]),
  };
}

// tile sintético a partir de outra grade (quando falta o z14 de algum pedaço: cai para o z12)
export function tileDeOutraGrade(g, z, x, y) {
  const out = new Float32Array(TAM * TAM), f = 2 ** (g.z - z);
  for (let j = 0; j < TAM; j++) for (let i = 0; i < TAM; i++) {
    const px = ((x * TAM + i + 0.5) * f) - g.x0 * TAM - 0.5, py = ((y * TAM + j + 0.5) * f) - g.y0 * TAM - 0.5;
    const cx = Math.min(Math.max(px, 0), g.w - 1.001), cy = Math.min(Math.max(py, 0), g.h - 1.001);
    const x0 = cx | 0, y0 = cy | 0, fx = cx - x0, fy = cy - y0, k = y0 * g.w + x0, d = g.dados;
    out[j * TAM + i] = d[k] * (1 - fx) * (1 - fy) + d[k + 1] * fx * (1 - fy) + d[k + g.w] * (1 - fx) * fy + d[k + g.w + 1] * fx * fy;
  }
  return out;
}

// ---------------------------------------------------------------- paleta (cartao_mock.py)
const MATA = [0.24, 0.36, 0.22], CERRADO = [0.62, 0.56, 0.36], PEDRA = [0.86, 0.80, 0.70];
const TOM_SOL = [1.10, 1.00, 0.84], TOM_SOMBRA = [0.62, 0.70, 1.25];

// ---------------------------------------------------------------- desenho
export function relevoDoCartao(gd, gs, trilha, sol, largura = 1080, altura = 1920, opcoes = {}) {
  const plano = opcoes.plano || planejarRecorte(gd.z, trilha, largura, altura, opcoes);
  const { esc, oxMundo, oyMundo } = plano;
  const W = gd.w, Hh = gd.h, E = gd.dados;
  const mpp = metrosPorPixel(gd, plano.latMed);

  // 1) luz do relevo pelo sol real, calculada na grade de detalhe (depois interpolada: sem facetas)
  const el = sol.elevacao + SEMIDIAMETRO, elLuz = Math.max(el, 0.3) * RAD, azr = sol.azimute * RAD;
  const sx = Math.sin(azr) * Math.cos(elLuz), sy = -Math.cos(azr) * Math.cos(elLuz), sz = Math.sin(elLuz);
  const exag = opcoes.exagero ?? 1.3;
  const lam = new Float32Array(W * Hh);
  for (let y = 0; y < Hh; y++) {
    const ya = y > 0 ? y - 1 : y, yb = y < Hh - 1 ? y + 1 : y;
    for (let x = 0; x < W; x++) {
      const xa = x > 0 ? x - 1 : x, xb = x < W - 1 ? x + 1 : x;
      const gx = (E[y * W + xb] - E[y * W + xa]) / ((xb - xa) * mpp), gy = (E[yb * W + x] - E[ya * W + x]) / ((yb - ya) * mpp);
      const nx = -gx * exag, ny = -gy * exag, l = (nx * sx + ny * sy + sz) / Math.sqrt(nx * nx + ny * ny + 1);
      lam[y * W + x] = l > 0 ? l : 0;
    }
  }
  // 2) sombra projetada pela grade z12 (a mesma do mapa e das horas: o cartão nunca contradiz a frase).
  //    O detalhe z14 só desenha a luz das encostas. Sem grade z12, a sombra sai do próprio detalhe.
  const solM = { elevacao: sol.elevacao, azimute: sol.azimute };
  const longe = gs ? new Float32Array(gs.w * gs.h) : null;           // profundidade da sombra (m), contínua
  if (longe) varrerSombra(gs, solM, { latRef: plano.latMed, campo: longe });
  const perto = !gs || opcoes.sombraLocal ? new Float32Array(W * Hh) : null;
  if (perto) varrerSombra(gd, solM, { latRef: plano.latMed, campo: perto });
  const BORDA = 5;                                                     // metros de transição sol/sombra
  const fz = gs ? 2 ** (gs.z - gd.z) : 1;                 // px z12 por px do detalhe

  // 3) cada pixel do cartão: amostra bilinear de altitude, luz e sombra; cor da paleta; grão da semente
  const rgba = new Uint8ClampedArray(largura * altura * 4);
  const rnd = aleatorio(plano.semente ^ 0x9e3779b9);
  const grao = opcoes.grao ?? 0.035;
  const ruido = new Float32Array(4096); for (let i = 0; i < 4096; i++) ruido[i] = (rnd() - 0.5) * 2 * grao;
  const sem = plano.semente | 0;
  const gdx0 = gd.x0 * TAM, gdy0 = gd.y0 * TAM;
  const bil = (A, px, py, w, h) => {
    const cx = px < 0 ? 0 : px > w - 1.001 ? w - 1.001 : px, cy = py < 0 ? 0 : py > h - 1.001 ? h - 1.001 : py;
    const x0 = cx | 0, y0 = cy | 0, fx = cx - x0, fy = cy - y0, k = y0 * w + x0;
    return A[k] * (1 - fx) * (1 - fy) + A[k + 1] * fx * (1 - fy) + A[k + w] * (1 - fx) * fy + A[k + w + 1] * fx * fy;
  };
  const noite = !(el > 0);
  for (let Y = 0; Y < altura; Y++) {
    const py = oyMundo + (Y + 0.5) / esc - gdy0 - 0.5;
    const pyL = gs ? (py + 0.5 + gdy0) * fz - gs.y0 * TAM - 0.5 : 0;
    for (let X = 0; X < largura; X++) {
      const px = oxMundo + (X + 0.5) / esc - gdx0 - 0.5;
      const h = bil(E, px, py, W, Hh);
      const l = bil(lam, px, py, W, Hh);
      let d = perto ? bil(perto, px, py, W, Hh) : -1e9;           // profundidade interpolada, depois o corte
      if (longe) { const pxL = (px + 0.5 + gdx0) * fz - gs.x0 * TAM - 0.5; const dl = bil(longe, pxL, pyL, gs.w, gs.h); if (dl > d) d = dl; }
      let f = noite ? 1 : Math.min(1, Math.max(0, (d + BORDA) / (2 * BORDA)));
      f = f * f * (3 - 2 * f);                                     // borda lisa da sombra
      const t = Math.min(1, Math.max(0, (h - 480) / 620));         // altitude normalizada (480 a 1100 m)
      let r, g, b;
      if (t < 0.45) { const u = t / 0.45; r = MATA[0] + (CERRADO[0] - MATA[0]) * u; g = MATA[1] + (CERRADO[1] - MATA[1]) * u; b = MATA[2] + (CERRADO[2] - MATA[2]) * u; }
      else { const u = (t - 0.45) / 0.55; r = CERRADO[0] + (PEDRA[0] - CERRADO[0]) * u; g = CERRADO[1] + (PEDRA[1] - CERRADO[1]) * u; b = CERRADO[2] + (PEDRA[2] - CERRADO[2]) * u; }
      const ls = 0.32 + 0.9 * l, lo = 0.30 + 0.25 * l;             // luz no sol e na sombra
      let hq = Math.imul(X ^ sem, 0x27d4eb2d) ^ Math.imul(Y + sem, 0x165667b1); hq ^= hq >>> 15;
      const n = 1 + ruido[hq & 4095];                                 // grão fino reproduzível (hash do pixel)
      const k = (Y * largura + X) * 4;
      rgba[k] = 255 * n * (r * ls * TOM_SOL[0] * (1 - f) + r * lo * TOM_SOMBRA[0] * f);
      rgba[k + 1] = 255 * n * (g * ls * TOM_SOL[1] * (1 - f) + g * lo * TOM_SOMBRA[1] * f);
      rgba[k + 2] = 255 * n * (b * ls * TOM_SOL[2] * (1 - f) + b * lo * TOM_SOMBRA[2] * f);
      rgba[k + 3] = 255;
    }
  }
  return { rgba, largura, altura, tracadoPx: plano.tracadoPx, bbox: plano.bbox, semente: plano.semente, metrosPorPx: plano.metrosPorPx, caixa: plano.caixa };
}
