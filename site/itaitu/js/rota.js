// rota.js · destino do GPS (distância, rumo, trilha, fora da trilha) e perfil de altitude. Frontend A.
// Honestidade (ARQUITETURA 6.3): sem traçado, nada de linha confiante; a reta tracejada diz
// "direção em linha reta, não é o caminho".
// O perfil segue o contrato de perfil.js (2.2): perfilDeCoordenadas, perfilDaTrilha e desenharPerfil
// moram aqui porque a tarefa T6 os pôs no rota.js; perfil.js pode reexportar daqui.

import { T, t, duracaoTexto, rumoTexto, numeroBR } from './textos.js';
import { el, icone, distanciaM, rumoGraus, formatarDistancia, projetarNaLinha, comprimentoM, subidaDescida } from './util.js';
import { gradeDeTiles, amostrar } from './motor/nucleo.js';
import * as gps from './gps.js';

const FORA_DA_TRILHA_M = 40;
const LONGE_DA_TRILHA_M = 300;        // mais longe que isso: ainda a caminho do início da trilha
const CHEGOU_M = 40;
const KMH_A_PE = 3;

let ctx = null, map = null;
let alvo = null;                       // { id, nome, lonLat, trilha: [[lon,lat],...] | null, tipo }
let foraAvisado = false, chegouAvisado = false;
let desligarOuvinte = null;

export function iniciarRota(contexto, mapa) {
  ctx = contexto;
  map = mapa;
  desligarOuvinte = gps.aoMudar(atualizar);
  map?.on('rotate', () => { if (alvo) desenharFaixa(); });
}

export function alvoAtual() { return alvo; }

// ponto: Feature de pontos (com geometria). trilha: Feature LineString ou registro do banco.
export function definirAlvo({ ponto = null, trilha = null, nome = null } = {}) {
  let coords = null;
  if (trilha) coords = coordsDe(trilha).map((c) => [c[0], c[1]]);
  let lonLat = ponto?.geometry?.coordinates || (coords && coords[coords.length - 1]);
  if (!lonLat) { limparAlvo(); return; }
  if (coords && coords.length > 1 && ponto) {
    // a trilha termina no destino: se o começo está mais perto do destino, inverte
    if (distanciaM(coords[0], lonLat) < distanciaM(coords[coords.length - 1], lonLat)) coords.reverse();
  }
  alvo = {
    id: ponto?.properties?.id || trilha?.id || trilha?.properties?.id || null,
    nome: nome || ponto?.properties?.nome || trilha?.nome || trilha?.properties?.nome || '',
    lonLat: [lonLat[0], lonLat[1]],
    trilha: coords && coords.length > 1 ? coords : null,
  };
  foraAvisado = false; chegouAvisado = false;
  atualizar(gps.ultimaPosicao());
  ctx.anunciar?.(t('gps.destino', { nome: alvo.nome }));
}

export function limparAlvo() {
  alvo = null;
  map?.getSource('rota-gps')?.setData({ type: 'FeatureCollection', features: [] });
  const f = document.getElementById('rota-faixa');
  if (f) { f.hidden = true; f.replaceChildren(); }
  ctx?.layout?.();
}

let calculo = null;
function atualizar(pos) {
  if (!alvo) return;
  calculo = calcular(pos);
  desenharRota(pos, calculo);
  desenharFaixa();
}

function calcular(pos) {
  if (!pos) return null;
  const aqui = [pos.lon, pos.lat];
  const reta = distanciaM(aqui, alvo.lonLat);
  const rumo = rumoGraus(aqui, alvo.lonLat);
  const r = { reta, rumo, pelaTrilha: null, fora: null, naTrilha: false, tempoMin: null, inicio: null };
  if (alvo.trilha) {
    const p = projetarNaLinha(alvo.trilha, aqui);
    if (p) {
      const fimAoDestino = distanciaM(alvo.trilha[alvo.trilha.length - 1], alvo.lonLat);
      r.naTrilha = p.distM <= FORA_DA_TRILHA_M;
      if (r.naTrilha) alvo.entrou = true;
      // "fora da trilha" só depois de ter entrado nela; antes disso a pessoa ainda vai ao começo
      if (alvo.entrou && p.distM <= LONGE_DA_TRILHA_M) {
        r.pelaTrilha = (r.naTrilha ? 0 : p.distM) + Math.max(0, p.totalM - p.aoLongoM) + fimAoDestino;
        r.tempoMin = Math.max(1, Math.round((r.pelaTrilha / 1000) / KMH_A_PE * 60));
        r.projecao = p;
        if (!r.naTrilha) r.fora = p.distM;
      } else if (!alvo.entrou) {
        r.inicio = distanciaM(aqui, alvo.trilha[0]);
      }
    }
  }
  return r;
}

function desenharRota(pos, c) {
  const fonte = map?.getSource('rota-gps');
  if (!fonte) return;
  const feats = [];
  if (alvo.trilha) {
    let resto = alvo.trilha;
    if (c?.projecao && c.pelaTrilha != null) resto = alvo.trilha.slice(c.projecao.indice + 1);
    if (resto.length > 1) feats.push({ type: 'Feature', properties: { tipo: 'trilha' }, geometry: { type: 'LineString', coordinates: resto } });
  }
  if (pos && c && c.pelaTrilha == null) {
    // sem traçado (ou longe dele): reta tracejada, sempre com a palavra na faixa.
    // Com traçado e antes de entrar nele, a reta vai até o começo da trilha.
    const ate = alvo.trilha && c.inicio != null ? alvo.trilha[0] : alvo.lonLat;
    feats.push({ type: 'Feature', properties: { tipo: 'reta' }, geometry: { type: 'LineString', coordinates: [[pos.lon, pos.lat], ate] } });
  }
  fonte.setData({ type: 'FeatureCollection', features: feats });
}

function desenharFaixa() {
  const f = document.getElementById('rota-faixa');
  if (!f || !alvo) return;
  const c = calculo;
  const linhas = [];
  const titulo = el('p', { class: 'rota__destino' }, t('gps.destino', { nome: alvo.nome }));
  if (!c) {
    linhas.push(el('p', { class: 'rota__info' }, T.gps.procurando));
  } else {
    if (c.pelaTrilha != null) {
      linhas.push(el('p', { class: 'rota__dist num' }, t('gps.pela_trilha', { dist: formatarDistancia(c.pelaTrilha) })));
      linhas.push(el('p', { class: 'rota__info' }, [t('gps.rumo', { rumo: rumoTexto(c.rumo) }), t('gps.tempo', { tempo: duracaoTexto(c.tempoMin) })].join(' · ')));
    } else {
      linhas.push(el('p', { class: 'rota__dist num' }, t('gps.em_linha_reta', { dist: formatarDistancia(c.reta) })));
      linhas.push(el('p', { class: 'rota__info' }, t('gps.rumo', { rumo: rumoTexto(c.rumo) })));
      linhas.push(el('p', { class: 'rota__aviso' }, T.gps.linha_reta));
      if (c.inicio != null) linhas.push(el('p', { class: 'rota__info num' }, t('gps.inicio_trilha', { dist: formatarDistancia(c.inicio) }, `Começo da trilha a ${formatarDistancia(c.inicio)}`)));
      if (!alvo.trilha) linhas.push(el('p', { class: 'rota__nota' }, T.gps.sem_tracado));
    }
    if (c.fora != null) linhas.push(el('p', { class: 'rota__alerta', role: 'alert' }, t('gps.fora_da_trilha', { m: Math.round(c.fora) })));
    if (c.fora != null && !foraAvisado) { foraAvisado = true; ctx.anunciar?.(t('gps.fora_da_trilha', { m: Math.round(c.fora) })); }
    if (c.fora == null && foraAvisado && c.naTrilha) { foraAvisado = false; ctx.anunciar?.(T.gps.de_volta); }
    if (c.reta <= CHEGOU_M && !chegouAvisado) { chegouAvisado = true; ctx.avisar?.(t('gps.chegou', { nome: alvo.nome })); }
  }
  // seta: aponta o destino na tela (bússola do aparelho se houver; senão o rumo do mapa)
  const seta = el('span', { class: 'rota__seta', 'aria-hidden': 'true' }, icone('i-norte'));
  if (c) {
    const ref = gps.rumoAtual() ?? map?.getBearing() ?? 0;
    seta.style.setProperty('--giro', `${(c.rumo - ref).toFixed(0)}deg`);
  } else seta.hidden = true;
  const acoes = el('div', { class: 'rota__acoes' });
  if (!gps.ultimaPosicao()) acoes.append(el('button', { class: 'botao botao--marca', type: 'button', onclick: () => gps.ligar({ seguir: false }) }, icone('i-gps'), el('span', {}, T.gps.ligar)));
  acoes.append(el('button', { class: 'botao botao--icone', type: 'button', 'aria-label': T.gps.tirar_destino, title: T.gps.tirar_destino, onclick: limparAlvo }, icone('i-fechar')));
  f.replaceChildren(el('div', { class: 'rota__corpo' }, seta, el('div', { class: 'rota__textos' }, titulo, ...linhas)), acoes);
  f.hidden = false;
  ctx.layout?.();
}

// ---------------------------------------------------------------- altitude do relevo
let gradeLocal = null;

async function decodificar(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  const blob = await r.blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = document.createElement('canvas');
  cv.width = bmp.width; cv.height = bmp.height;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(bmp, 0, 0);
  bmp.close?.();
  return cx.getImageData(0, 0, cv.width, cv.height).data;
}

function carregarGradeLocal() {
  if (gradeLocal) return gradeLocal;
  const d = ctx?.recorte?.dem || { z: 12, x0: 1586, x1: 1588, y0: 2176, y1: 2178 };
  gradeLocal = (async () => {
    const pedidos = [];
    for (let x = d.x0; x <= d.x1; x++) for (let y = d.y0; y <= d.y1; y++) {
      pedidos.push(decodificar(`./tiles/dem/${d.z}/${x}/${y}.png`).then((rgba) => (rgba ? { x, y, rgba } : null)).catch(() => null));
    }
    const tiles = (await Promise.all(pedidos)).filter(Boolean);
    return tiles.length ? gradeDeTiles(d.z, tiles) : null;
  })().catch((e) => { console.info('[rota] grade do relevo indisponível', e && e.message); gradeLocal = null; return null; });
  return gradeLocal;
}

// [[lon, lat], ...] -> (number | null)[]  (motor do B se houver; senão a mesma grade z12, lida aqui)
export async function altitudesDoRelevo(coordenadas) {
  if (ctx?.motor?.altitudes) {
    try { return (await ctx.motor.altitudes({ coordenadas })).alt; } catch (e) { console.info('[rota] motor.altitudes falhou, usando a grade local', e && e.message); }
  }
  const g = await carregarGradeLocal();
  if (!g) return coordenadas.map(() => null);
  return coordenadas.map(([lon, lat]) => amostrar(g, lon, lat));
}

// ---------------------------------------------------------------- perfil (contrato de perfil.js, 2.2)
function coordsDe(trilha) {
  if (!trilha) return [];
  if (trilha.geometry?.coordinates) return trilha.geometry.coordinates;
  if (Array.isArray(trilha.pontos)) return trilha.pontos.map((p) => [p.lon, p.lat, p.alt ?? null]);
  if (Array.isArray(trilha)) return trilha;
  return [];
}

function reamostrar(coords, passoM) {
  const dist = [0];
  for (let i = 1; i < coords.length; i++) dist.push(dist[i - 1] + distanciaM(coords[i - 1], coords[i]));
  const total = dist[dist.length - 1];
  const saida = [];
  let j = 1;
  for (let d = 0; d <= total + 0.001; d += passoM) {
    while (j < coords.length - 1 && dist[j] < d) j++;
    const a = coords[j - 1], b = coords[j];
    const seg = dist[j] - dist[j - 1];
    const f = seg > 0 ? Math.min(1, Math.max(0, (d - dist[j - 1]) / seg)) : 0;
    const alt = a[2] != null && b[2] != null ? a[2] + (b[2] - a[2]) * f : null;
    saida.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, alt, d]);
  }
  const ult = coords[coords.length - 1];
  if (!saida.length || total - saida[saida.length - 1][3] > 1) saida.push([ult[0], ult[1], ult[2] ?? null, total]);
  return { saida, total };
}

export function perfilDeCoordenadas(coords, passoM = 25) {
  if (!coords || coords.length < 2) return null;
  if (coords.some((c) => c[2] == null || !Number.isFinite(c[2]))) return null;
  const { saida, total } = reamostrar(coords, passoM);
  const pontos = saida.map((c) => [Math.round(c[3]), Math.round(c[2])]);
  pontos[0][0] = 0;
  const alts = pontos.map((p) => p[1]);
  const { subida_m, descida_m } = subidaDescida(alts, 3);
  return { pontos, km: Math.round(total) / 1000, subida_m, descida_m, min_m: Math.min(...alts), max_m: Math.max(...alts), fonte: 'gps' };
}

export async function perfilDaTrilha(trilha, motor = ctx?.motor) {
  const coords = coordsDe(trilha);
  if (coords.length < 2) return null;
  const comAlt = coords.every((c) => c[2] != null && Number.isFinite(c[2]));
  if (comAlt) return perfilDeCoordenadas(coords);
  // sem altitude: relevo a cada 25 m ao longo da linha
  const { saida } = reamostrar(coords.map((c) => [c[0], c[1], 0]), 25);
  const lonlat = saida.map((c) => [c[0], c[1]]);
  let alts = null;
  if (motor?.altitudes) { try { alts = (await motor.altitudes({ coordenadas: lonlat })).alt; } catch (_) { alts = null; } }
  if (!alts) alts = await altitudesDoRelevo(lonlat);
  if (!alts || alts.some((a) => a == null)) return null;
  const p = perfilDeCoordenadas(lonlat.map((c, i) => [c[0], c[1], alts[i]]));
  if (p) p.fonte = 'relevo';
  return p;
}

const SVG = 'http://www.w3.org/2000/svg';
export function resumoDoPerfil(p) {
  return t('perfil.resumo', { sobe: p.subida_m, desce: p.descida_m, min: p.min_m, max: p.max_m });
}

export function desenharPerfil(alvoEl, perfil, { posicaoM } = {}) {
  if (!alvoEl) return;
  alvoEl.replaceChildren();
  if (!perfil) { alvoEl.append(el('p', { class: 'perfil__vazio' }, T.perfil.indisponivel)); return; }
  const L = 320, A = 120, m = { e: 36, d: 8, c: 8, b: 22 };
  const w = L - m.e - m.d, h = A - m.c - m.b;
  const maxD = perfil.pontos[perfil.pontos.length - 1][0] || 1;
  const faixa = Math.max(20, perfil.max_m - perfil.min_m);
  const base = perfil.min_m - faixa * 0.08;
  const topo = base + faixa * 1.16;
  const x = (d) => m.e + (d / maxD) * w;
  const y = (a) => m.c + h - ((a - base) / (topo - base)) * h;
  const pts = perfil.pontos.map(([d, a]) => `${x(d).toFixed(1)},${y(a).toFixed(1)}`);
  const resumo = resumoDoPerfil(perfil);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${L} ${A}`);
  svg.setAttribute('class', 'perfil__grafico');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${T.perfil.titulo}: ${resumo}`);
  const add = (tag, attrs, txt) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (txt != null) n.textContent = txt; svg.append(n); return n; };
  add('polygon', { points: `${x(0)},${m.c + h} ${pts.join(' ')} ${x(maxD)},${m.c + h}`, class: 'perfil__area' });
  add('polyline', { points: pts.join(' '), class: 'perfil__linha' });
  add('line', { x1: m.e, y1: m.c + h, x2: m.e + w, y2: m.c + h, class: 'perfil__eixo' });
  add('text', { x: m.e - 4, y: y(perfil.max_m) + 4, class: 'perfil__rotulo', 'text-anchor': 'end' }, `${perfil.max_m}`);
  add('text', { x: m.e - 4, y: y(perfil.min_m) + 4, class: 'perfil__rotulo', 'text-anchor': 'end' }, `${perfil.min_m}`);
  add('text', { x: m.e, y: A - 6, class: 'perfil__rotulo' }, '0');
  add('text', { x: m.e + w, y: A - 6, class: 'perfil__rotulo', 'text-anchor': 'end' }, `${numeroBR(perfil.km, 2)} km`);
  if (posicaoM != null && posicaoM >= 0) {
    const i = perfil.pontos.findIndex((p) => p[0] >= posicaoM);
    const p = perfil.pontos[i < 0 ? perfil.pontos.length - 1 : i];
    add('circle', { cx: x(p[0]), cy: y(p[1]), r: 5, class: 'perfil__voce' });
    add('text', { x: x(p[0]), y: y(p[1]) - 9, class: 'perfil__rotulo', 'text-anchor': 'middle' }, T.perfil.voce_esta_aqui);
  }
  alvoEl.append(
    el('p', { class: 'perfil__titulo' }, T.perfil.titulo),
    svg,
    el('p', { class: 'perfil__resumo' }, resumo),
    el('p', { class: 'perfil__fonte' }, perfil.fonte === 'relevo' ? T.perfil.do_relevo : T.perfil.do_gps),
  );
}

// Desenha o perfil de uma trilha; se o relevo ainda não deu altitude, tenta de novo no itaitu:motor.
export async function montarPerfil(alvoEl, trilha) {
  if (!alvoEl) return;
  alvoEl.replaceChildren(el('p', { class: 'perfil__vazio' }, '…'));
  const p = await perfilDaTrilha(trilha).catch(() => null);
  desenharPerfil(alvoEl, p);
  if (!p) document.addEventListener('itaitu:motor', () => montarPerfil(alvoEl, trilha), { once: true });
}

export function kmDaLinha(coords) { return comprimentoM(coords) / 1000; }
export function desligar() { desligarOuvinte?.(); }
