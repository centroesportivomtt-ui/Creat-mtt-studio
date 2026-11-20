// luz.js · a luz do relevo ligada ao sol do minuto. Órbita (motion-3d), Creat Nuvem, 20/11/2026.
// ARQUITETURA 9.3. Ouve itaitu:hora e liga, pelas propriedades NATIVAS do MapLibre 5.24:
//   relevo-sombra  hillshade-illumination-direction = azimute do sol (0 = norte, horário)
//                  hillshade-illumination-altitude  = elevação do sol, presa em 0..90
//                  hillshade-illumination-anchor    = 'map' (a luz não gira com a câmera)
//                  realce e sombra mudam de temperatura (quente no fim de tarde, azul na hora azul)
//   relevo-cor     a rampa de cores do relevo esquenta ou esfria (setPaintProperty: não recarrega tile)
//   céu e névoa    map.setSky pela altura do sol: dia azul, dourado no entardecer, azul frio com o sol
//                  baixo abaixo do horizonte, noite escura. Em economia o céu fica com o economia.js/mapa.js.
// O exagero do terreno nunca é tocado aqui (fica 1,4, do estilo.js), para o vale não "respirar".
// Throttle: um pedido por quadro, no máximo uma troca de pintura a cada 120 ms (ver INTERVALO_MS) e
// só a pintura que mudou de verdade.
// Em economia, o minuto anda em degraus de 15 min.

import { posicaoDoSol, utcDe, dataLocal, minutoDoDia } from './motor/nucleo.js';
import { PALETA, LUZ_RELEVO } from './estilo.js';

const CENTRO_PADRAO = [-40.495, -11.34];
const PASSO_ECONOMIA = 15;

// ---------------------------------------------------------------- cor
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbHex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const lerp = (a, b, f) => a + (b - a) * f;
const misturarRgb = (a, b, f) => [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));

// Paradas por elevação do sol (graus). Uma tabela só para céu, horizonte, névoa e temperatura do relevo:
// cada linha é um "momento" da luz. Valores conferidos em print às 08:00, 12:00, 15:30, 16:30, 17:00, 17:30, 18:20 e 19:10.
// Com o sol baixo a sombra do relevo fica mais leve e o realce mais forte e quente: o hillshade 'basic'
// escurece o chão plano quando o sol desce, e quem conta a sombra de verdade é a CanvasSource do B.
//   elev   céu        horizonte  névoa      tinta do relevo  força  realce (rgb, alfa x)   sombra (rgb, alfa x)
const PARADAS = [
  { e: -14, ceu: '#0B1120', hor: '#151C30', nev: '#141A2C', tinta: '#121A2E', f: 0.6, real: '#93A6D6', ra: 0.25, somb: '#0A0E1C', sa: 1.15, nevoa: 0.78 },
  { e: -6, ceu: '#1E2B4C', hor: '#45577F', nev: '#38466A', tinta: '#22325A', f: 0.48, real: '#A9B9E2', ra: 0.45, somb: '#101830', sa: 1.1, nevoa: 0.66 },
  { e: -1.5, ceu: '#4B6596', hor: '#C48A7A', nev: '#8C8CA6', tinta: '#41507E', f: 0.3, real: '#F4B88A', ra: 1.2, somb: '#1E2550', sa: 0.85, nevoa: 0.58 },
  { e: 2, ceu: '#7E9FC6', hor: '#F2A65E', nev: '#EDBB86', tinta: '#E8914A', f: 0.24, real: '#FFB86A', ra: 2.6, somb: '#2B2A5C', sa: 0.62, nevoa: 0.55 },
  { e: 9, ceu: '#93B8DC', hor: '#F2C58A', nev: '#F1D4A6', tinta: '#EBA960', f: 0.16, real: '#FFCB80', ra: 2.2, somb: '#27305C', sa: 0.62, nevoa: 0.66 },
  { e: 16, ceu: '#9EC4E3', hor: '#E8D9BC', nev: '#ECE2CC', tinta: '#F3D29C', f: 0.07, real: '#FFDA98', ra: 1.5, somb: '#202C4C', sa: 0.82, nevoa: 0.78 },
  { e: 26, ceu: '#A9CDE8', hor: '#DCE9F2', nev: '#E6ECEC', tinta: '#FFF4DC', f: 0.0, real: '#FFE3A6', ra: 1.0, somb: '#1F2A44', sa: 1.0, nevoa: 0.85 },
  { e: 90, ceu: '#A9CDE8', hor: '#DCE9F2', nev: '#E6ECEC', tinta: '#FFF4DC', f: 0.0, real: '#FFE3A6', ra: 1.0, somb: '#1F2A44', sa: 1.0, nevoa: 0.85 },
];
const PARADAS_RGB = PARADAS.map((p) => ({ ...p, ceu: hexRgb(p.ceu), hor: hexRgb(p.hor), nev: hexRgb(p.nev), tinta: hexRgb(p.tinta), real: hexRgb(p.real), somb: hexRgb(p.somb) }));

function momento(elev) {
  const P = PARADAS_RGB;
  if (elev <= P[0].e) return P[0];
  for (let i = 1; i < P.length; i++) {
    if (elev <= P[i].e) {
      const a = P[i - 1], b = P[i];
      const f = (elev - a.e) / (b.e - a.e);
      const s = f * f * (3 - 2 * f);                       // suave nas emendas
      const o = {};
      for (const k of Object.keys(a)) o[k] = Array.isArray(a[k]) ? misturarRgb(a[k], b[k], s) : lerp(a[k], b[k], s);
      return o;
    }
  }
  return P[P.length - 1];
}

const RELEVO_RGB = [];
for (let i = 1; i < PALETA.relevo.length; i += 2) RELEVO_RGB.push(hexRgb(PALETA.relevo[i]));

// alfa embutido nas cores do estilo.js (LUZ_RELEVO), por modo
const alfaDe = (rgba) => { const m = /,\s*([\d.]+)\s*\)$/.exec(rgba || ''); return m ? Number(m[1]) : 1; };

// ---------------------------------------------------------------- cálculo puro
// luzDoMinuto(utcMs, centro?) -> tudo que a tela precisa para aquele instante (o estilo.js pode usar na abertura)
export function luzDoMinuto(utcMs, centro = CENTRO_PADRAO, { satelite = false } = {}) {
  const [lon, lat] = centro;
  const s = posicaoDoSol(utcMs, lat, lon);
  const m = momento(s.elevacao);
  const direcao = Math.round(((s.azimute % 360) + 360) % 360) % 360;   // a spec do 5.24 aceita 0..359, inteiro basta (erro ≤ 0,5°)
  const altitude = Math.round(limitar(s.elevacao, 0, 90) * 10) / 10;
  const modo = satelite ? LUZ_RELEVO.satelite : LUZ_RELEVO.mapa;
  const aR = limitar(alfaDe(modo.luz) * m.ra, 0, 0.9);
  const aS = limitar(alfaDe(modo.escuro) * m.sa, 0, 0.9);
  const ceu = rgbHex(m.ceu), hor = rgbHex(m.hor), nev = rgbHex(m.nev);
  const forca = Math.round(m.f * 40) / 40;                 // quantizado: a rampa só troca quando muda
  const tinta = rgbHex(m.tinta);
  const rampa = ['interpolate', ['linear'], ['elevation']];
  for (let i = 0; i < RELEVO_RGB.length; i++) rampa.push(PALETA.relevo[i * 2], rgbHex(misturarRgb(RELEVO_RGB[i], m.tinta, forca)));
  const rgba = (c, a) => `rgba(${c.map((v) => Math.round(v)).join(', ')}, ${a.toFixed(2)})`;
  return {
    elevacao: s.elevacao, azimute: s.azimute, direcao, altitude,
    realce: rgba(m.real, aR), sombra: rgba(m.somb, aS),
    rampa, chaveRampa: tinta + '|' + forca,
    sky: {
      'sky-color': ceu,
      'horizon-color': hor,
      'fog-color': nev,
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': Math.round(m.nevoa * 100) / 100,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 14, 0.2],
    },
    chaveCeu: ceu + hor + nev + Math.round(m.nevoa * 100),
  };
}

// ---------------------------------------------------------------- ligação ao mapa
let ctx = null;
let map = null;
let ultimo = null;               // o que está pintado agora
let pedido = null;               // { minutos, data } esperando o próximo quadro
let quadro = 0;
let forcar = false;
let ouviuHora = false;
let relogio = 0;
const contagem = { eventos: 0, aplicacoes: 0, pinturas: 0, ceus: 0 };
const desligar = [];

function economia() {
  try { return !!ctx?.economia?.(); } catch (_) { return document.documentElement.dataset.economia === '1'; }
}
function emSatelite() {
  try { return map.getLayoutProperty('satelite', 'visibility') === 'visible'; } catch (_) { return false; }
}

function pedir(minutos, data, { forcado = false } = {}) {
  if (!Number.isFinite(minutos)) return;
  pedido = { minutos, data };
  if (forcado) forcar = true;
  if (!quadro) quadro = requestAnimationFrame(aplicarPedido);
}

// Com o terreno 3D, toda troca de pintura do relevo invalida as texturas que o MapLibre guarda por tile
// (render-to-texture) e o quadro seguinte redesenha o vale inteiro. Medido no Chromium por software:
// 10,4 fps parado contra 1,7 a 2,4 fps trocando hillshade ou rampa a cada quadro. Por isso a luz troca
// no máximo a cada INTERVALO_MS quando a hora corre depressa (régua arrastada, abertura, demo) e
// sempre aplica a última hora pedida no fim (pedido final nunca se perde).
const INTERVALO_MS = 120;
let ultimaPintura = 0;
let atrasado = 0;

function aplicarPedido() {
  quadro = 0;
  const p = pedido;
  if (!p || !map) { pedido = null; return; }
  const espera = INTERVALO_MS - (performance.now() - ultimaPintura);
  if (espera > 0 && !forcar) {
    if (!atrasado) atrasado = setTimeout(() => { atrasado = 0; if (pedido && !quadro) quadro = requestAnimationFrame(aplicarPedido); }, espera);
    return;
  }
  pedido = null;
  aplicar(p.minutos, p.data);
}

function aplicar(minutos, data) {
  const eco = economia();
  let min = Math.round(minutos);
  if (eco) min = Math.floor(min / PASSO_ECONOMIA) * PASSO_ECONOMIA;
  const dia = data || dataLocal(ctx.agora().getTime());
  const utc = utcDe(dia, min);
  const sat = emSatelite();
  const L = luzDoMinuto(utc, ctx.recorte?.centro || CENTRO_PADRAO, { satelite: sat });
  const f = forcar || !ultimo || ultimo.sat !== sat;
  forcar = false;
  contagem.aplicacoes++;
  try {
    if (map.getLayer('relevo-sombra')) {
      const pintar = (k, v) => { map.setPaintProperty('relevo-sombra', k, v); contagem.pinturas++; };
      if (f) {
        pintar('hillshade-illumination-anchor', 'map');
        // cores sem transição: cada transição de 300 ms redesenharia o vale 3D por 300 ms a cada troca
        pintar('hillshade-highlight-color-transition', { duration: 0, delay: 0 });
        pintar('hillshade-shadow-color-transition', { duration: 0, delay: 0 });
      }
      if (f || Math.abs(difAngulo(ultimo.direcao, L.direcao)) >= 0.5) pintar('hillshade-illumination-direction', L.direcao);
      if (f || Math.abs(ultimo.altitude - L.altitude) >= 0.5) pintar('hillshade-illumination-altitude', L.altitude);
      if (f || ultimo.realce !== L.realce) pintar('hillshade-highlight-color', L.realce);
      if (f || ultimo.sombra !== L.sombra) pintar('hillshade-shadow-color', L.sombra);
    }
    if (!sat && map.getLayer('relevo-cor') && (f || ultimo.chaveRampa !== L.chaveRampa)) {
      map.setPaintProperty('relevo-cor', 'color-relief-color', L.rampa);
      contagem.pinturas++;
    }
    if (!eco && (f || ultimo.chaveCeu !== L.chaveCeu || ultimo.eco)) {
      map.setSky(L.sky);
      contagem.ceus++;
    }
  } catch (e) {
    console.info('[luz] não consegui pintar a luz', e && e.message);
    return;
  }
  ultimaPintura = performance.now();
  // a rampa só é lembrada quando foi pintada (no satélite ela fica para quando o relevo voltar)
  ultimo = { ...L, chaveRampa: sat ? ultimo?.chaveRampa : L.chaveRampa, minutos: min, data: dia, sat, eco, utc };
  document.documentElement.dataset.luz = L.elevacao >= 6 ? 'dia' : L.elevacao >= -0.833 ? 'dourada' : L.elevacao >= -6 ? 'azul' : 'noite';
}

function difAngulo(a, b) { return ((b - a + 540) % 360) - 180; }

function minutoAgora() {
  const t = ctx.agora().getTime();
  return { minutos: minutoDoDia(t), data: dataLocal(t) };
}

// ligar(ctx): chamado pelo app.js depois do 'load'. Devolve controles para teste e para o demo.
export function ligar(contexto) {
  if (ctx) return controles;                    // uma vez só
  ctx = contexto;
  map = contexto.map;
  if (!map) throw new Error('luz.js precisa do mapa pronto');
  const on = (nome, fn) => { document.addEventListener(nome, fn); desligar.push(() => document.removeEventListener(nome, fn)); };

  on('itaitu:hora', (e) => {
    const d = e.detail || {};
    contagem.eventos++;
    ouviuHora = true;
    pedir(Number(d.minutos), d.data);
  });
  // economia liga/desliga: o mapa.js troca o céu na mesma hora; a luz assume no quadro seguinte
  on('itaitu:economia', () => { const p = ultimo || minutoAgora(); pedir(p.minutos, p.data, { forcado: true }); });
  // botão Satélite/Mapa do mapa.js regrava realce e sombra: a luz volta a valer no quadro seguinte
  const aoClicar = (e) => {
    if (!e.target?.closest?.('#ctl-camada')) return;
    const p = ultimo || minutoAgora();
    pedir(p.minutos, p.data, { forcado: true });
  };
  document.addEventListener('click', aoClicar);
  desligar.push(() => document.removeEventListener('click', aoClicar));

  // enquanto ninguém fala a hora (hora/index.js ainda não montou), a luz segue o relógio sozinha
  relogio = setInterval(() => {
    if (ouviuHora || document.hidden) return;
    const a = minutoAgora();
    pedir(a.minutos, a.data);
  }, 60000);
  desligar.push(() => clearInterval(relogio));

  const a = minutoAgora();
  pedir(a.minutos, a.data, { forcado: true });
  return controles;
}

export function estadoLuz() {
  if (!ultimo) return null;
  const { direcao, altitude, elevacao, azimute, realce, sombra, sky, minutos, data, sat, eco } = ultimo;
  return { direcao, altitude, elevacao, azimute, realce, sombra, sky, minutos, data, satelite: sat, economia: eco, contagem: { ...contagem } };
}

// aplica já, sem esperar o quadro (teste e demo). Não emite itaitu:hora.
export function aplicarAgora(minutos, data) {
  if (!map) return null;
  if (quadro) { cancelAnimationFrame(quadro); quadro = 0; }
  clearTimeout(atrasado); atrasado = 0; pedido = null;
  aplicar(minutos, data);
  return estadoLuz();
}

export function desligarLuz() {
  while (desligar.length) desligar.pop()();
  if (quadro) cancelAnimationFrame(quadro);
  clearTimeout(atrasado); atrasado = 0;
  ctx = null; map = null; ultimo = null; quadro = 0; ouviuHora = false;
}

const controles = { estado: estadoLuz, aplicarAgora, desligar: desligarLuz };
