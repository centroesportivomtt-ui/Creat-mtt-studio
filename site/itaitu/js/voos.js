// voos.js · a câmera da Hora da Serra. Órbita (motion-3d), Creat Nuvem, 20/11/2026.
// ARQUITETURA 9.2. Movimento com motivo:
//   voarPara              orienta: leva o olho ao destino e aponta a câmera para o paredão que vai
//                         apagar o sol dele (rumo do sol na hora em que a serra o cobre).
//   voarPresentacao       abre o vale: sobe sobre a serra, visita os poços confirmados e pousa no vale.
//   seguirTrilhaSimulada  conta a caminhada: a câmera segue um ponto que anda pela trilha de verdade,
//                         com o centro preso ao relevo (sobe e desce o morro com o terreno 3D).
// Regras: cancela o voo anterior; qualquer toque do usuário interrompe; em movimento reduzido vira
// salto (easeTo de duração 0, que respeita a gaveta) e resolve na hora; em economia vira um easeTo curto, sem inclinação e sem giro.

import { posicaoDoSol, utcDe, dataLocal } from './motor/nucleo.js';
import { distanciaM } from './util.js';
import { deslocamento, estadoMapa, margensVisiveis } from './mapa.js';
import { aberturaTocando } from './abertura.js';

const ctx = () => window.Itaitu;
const mapa = () => window.Itaitu?.map || null;
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
const reduzido = () => { try { return !!ctx()?.reduzMovimento?.(); } catch (_) { return false; } };   // movimento reduzido OU economia
const prefereReduzido = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const economia = () => { try { return !!ctx()?.economia?.(); } catch (_) { return false; } };
const tresD = () => { try { return estadoMapa().tresD !== false && !economia(); } catch (_) { return !economia(); } };

// curva do voo: entra devagar, sai assentando (cubic-bezier .2,.8,.2,1 dos tokens, --curva-saida)
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= (sx(t) - x) / d; }
    return sy(limitar(t, 0, 1));
  };
}
export const curvaSaida = bezier(0.2, 0.8, 0.2, 1);
export const curvaDia = bezier(0.45, 0, 0.55, 1);
// padding de fitBounds com as margens da tela que painel e gaveta cobrem, mais uma folga (px).
// cabe = false quando a gaveta deixa menos de MIN_VISIVEL px livres (no celular, o detalhe do destino ocupa
// 62dvh): aí o MapLibre recusaria o fitBounds ("Map cannot fit within canvas") e a câmera nem sairia do
// lugar. Quem chama enquadra na tela inteira e empurra o centro para a faixa livre com offset.
const MIN_VISIVEL = 120;
function paddingVisivel(folga) {
  let p;
  try { const v = margensVisiveis(); p = { top: v.top + folga, bottom: v.bottom + folga, left: v.left + folga, right: v.right + folga }; }
  catch (_) { return { padding: { top: 24, bottom: 24, left: 24, right: 24 }, cabe: true }; }
  const c = mapa()?.getCanvas?.();
  const W = c?.clientWidth || 0, H = c?.clientHeight || 0;
  const cabe = !W || !H || (H - p.top - p.bottom >= MIN_VISIVEL && W - p.left - p.right >= MIN_VISIVEL);
  return { padding: p, cabe };
}

const suave = (x) => 0.5 - 0.5 * Math.cos(Math.PI * limitar(x, 0, 1));

// ---------------------------------------------------------------- alvos
function ponto(id) {
  return ctx()?.dados?.pontos?.features?.find((f) => f.properties?.id === id) || null;
}

// alvo: id de ponto | [lon, lat] | bounds [[o, s], [l, n]] | [o, s, l, n]
function resolverAlvo(alvo) {
  if (typeof alvo === 'string') {
    const f = ponto(alvo);
    if (!f?.geometry) return null;
    return { tipo: 'ponto', centro: f.geometry.coordinates.slice(0, 2), feature: f };
  }
  if (Array.isArray(alvo) && alvo.length === 2 && Array.isArray(alvo[0])) return { tipo: 'bounds', bounds: alvo };
  if (Array.isArray(alvo) && alvo.length === 4 && alvo.every(Number.isFinite)) return { tipo: 'bounds', bounds: [[alvo[0], alvo[1]], [alvo[2], alvo[3]]] };
  if (Array.isArray(alvo) && alvo.length >= 2 && Number.isFinite(alvo[0]) && Number.isFinite(alvo[1])) return { tipo: 'ponto', centro: [alvo[0], alvo[1]] };
  if (alvo && alvo.type === 'Feature' && alvo.geometry?.type === 'Point') return { tipo: 'ponto', centro: alvo.geometry.coordinates.slice(0, 2), feature: alvo };
  return null;
}

// Rumo da câmera com motivo: olhar para o paredão que vai apagar o sol do ponto, ou seja, o azimute
// do sol na hora em que a serra o cobre. Sem a hora calculada, o sol das 16:00 do dia (fim de tarde,
// a luz que a Hora da Serra conta). Câmera de costas para o sol nunca: olha o contraluz da serra.
export function rumoDoParedao(feature, centro) {
  const p = feature?.properties || {};
  const agora = ctx()?.agora?.() || new Date();
  const data = dataLocal(agora.getTime());
  const apaga = [p._apaga_min, p._horas?.apagaMin, p.apagaMin].find(Number.isFinite);
  const min = Number.isFinite(apaga) ? apaga : 960;
  const [lon, lat] = centro || ctx()?.recorte?.centro || [-40.495, -11.34];
  const s = posicaoDoSol(utcDe(data, min), lat, lon);
  return Math.round(((s.azimute % 360) + 360) % 360);
}

// ---------------------------------------------------------------- voo único, cancelável
let vooAtual = null;            // { fim(resultado) }

function encerrarVooAtual(resultado) {
  const v = vooAtual;
  vooAtual = null;
  if (v) v.fim(resultado);
}

function duracaoPorDistancia(map, centro, zoomAlvo) {
  const c = map.getCenter();
  const km = distanciaM([c.lng, c.lat], centro) / 1000;
  const dz = Math.abs(map.getZoom() - zoomAlvo);
  return Math.round(limitar(1000 + 620 * Math.log2(1 + km) + 160 * dz, 1100, 3400));
}

function ouvirToque(fn, ev = ['pointerdown', 'wheel', 'keydown']) {
  const h = (e) => { if (e.isTrusted !== false) fn(e); };
  for (const n of ev) window.addEventListener(n, h, { capture: true, passive: true });
  return () => { for (const n of ev) window.removeEventListener(n, h, { capture: true }); };
}

export function voarPara(alvo, opcoes = {}) {
  const map = mapa();
  if (!map) return Promise.resolve({ chegou: false, motivo: 'sem-mapa' });
  const a = resolverAlvo(alvo);
  if (!a) return Promise.resolve({ chegou: false, motivo: 'sem-coordenada' });

  encerrarVooAtual({ chegou: false, cancelado: true });
  map.stop();

  const eco = economia();
  const salto = prefereReduzido() || (reduzido() && !eco);
  const d3 = tresD();
  const offset = (() => { try { return deslocamento(); } catch (_) { return [0, 0]; } })();

  return new Promise((resolver) => {
    let feito = false;
    let tirarToque = () => {};
    let prazo = 0;
    const fim = (r) => {
      if (feito) return;
      feito = true;
      clearTimeout(prazo);
      tirarToque();
      map.off('moveend', aoParar);
      if (vooAtual?.fim === fim) vooAtual = null;
      resolver(r);
    };
    let tocou = false;
    const aoParar = () => fim(tocou ? { chegou: false, interrompido: true } : { chegou: true });
    vooAtual = { fim };

    if (a.tipo === 'bounds') {
      const pv = paddingVisivel(16);
      const base = { padding: pv.padding, pitch: d3 ? (opcoes.pitch ?? 55) : 0, bearing: d3 ? (opcoes.bearing ?? map.getBearing()) : 0, maxZoom: opcoes.zoom ?? 15 };
      // gaveta alta demais: enquadra na tela inteira e desloca o centro para a faixa livre
      const camTela = pv.cabe ? null : map.cameraForBounds(a.bounds, { ...base, padding: 24 });
      const camFaixa = camTela ? { center: camTela.center, zoom: camTela.zoom, pitch: base.pitch, bearing: base.bearing, offset } : null;
      if (salto) {
        if (camFaixa) map.easeTo({ ...camFaixa, duration: 0 }); else map.fitBounds(a.bounds, { ...base, animate: false });
        fim({ chegou: true, salto: true }); return;
      }
      map.on('moveend', aoParar);
      tirarToque = ouvirToque(() => { tocou = true; }, ['pointerdown', 'wheel']);
      const dur = opcoes.duracaoMs ?? (eco ? 300 : 1800);
      if (camFaixa) map.easeTo({ ...camFaixa, duration: dur, easing: curvaSaida, essential: true });
      else map.fitBounds(a.bounds, { ...base, duration: dur, easing: curvaSaida, essential: true });
      prazo = setTimeout(() => fim({ chegou: true }), dur + 1500);
      return;
    }

    const zoom = opcoes.zoom ?? (a.feature?.properties?.tipo === 'cachoeira' || a.feature?.properties?.tipo === 'poco' ? 15.2 : 15);
    const alvoCam = {
      center: a.centro,
      zoom,
      pitch: d3 ? (opcoes.pitch ?? 62) : 0,
      bearing: d3 ? (opcoes.bearing ?? rumoDoParedao(a.feature, a.centro)) : 0,
    };
    // salto também respeita a gaveta: jumpTo não aceita offset, easeTo com duration 0 aceita e é síncrono
    if (salto) { map.easeTo({ ...alvoCam, offset, duration: 0 }); fim({ chegou: true, salto: true }); return; }
    map.on('moveend', aoParar);
    tirarToque = ouvirToque(() => { tocou = true; }, ['pointerdown', 'wheel']);
    if (eco) {
      const dur = opcoes.duracaoMs ? Math.min(opcoes.duracaoMs, 400) : 300;
      map.easeTo({ ...alvoCam, offset, duration: dur, easing: curvaSaida, essential: true });
      prazo = setTimeout(() => fim({ chegou: true }), dur + 1500);
      return;
    }
    const dur = opcoes.duracaoMs ?? duracaoPorDistancia(map, a.centro, zoom);
    // flyTo com curva baixa: sobe pouco, o vale continua à vista durante o voo (orienta, não deslumbra)
    map.flyTo({ ...alvoCam, offset, duration: dur, curve: opcoes.curva ?? 1.25, easing: curvaSaida, essential: true });
    prazo = setTimeout(() => fim({ chegou: true }), dur + 1500);
  });
}

// ---------------------------------------------------------------- espera cancelável (pausa entre voos)
function esperar(ms, sinal) {
  return new Promise((ok) => {
    if (ms <= 0 || sinal.parou) { ok(); return; }
    const t = setTimeout(fimEspera, ms);
    function fimEspera() { clearTimeout(t); sinal.ouvintes.delete(fimEspera); ok(); }
    sinal.ouvintes.add(fimEspera);
  });
}

function mapaInterativo() {
  const map = mapa();
  if (map) return Promise.resolve(map);
  return new Promise((ok) => {
    const h = (e) => { document.removeEventListener('itaitu:pronto', h); ok(e.detail?.map || mapa()); };
    document.addEventListener('itaitu:pronto', h);
  });
}

function primeirosConfirmados(n = 2) {
  const fs = ctx()?.dados?.pontos?.features || [];
  return fs.filter((f) => f.geometry && f.properties?._hora_de_sol)
    .sort((a, b) => (a.properties._ordem ?? 99) - (b.properties._ordem ?? 99))
    .slice(0, n).map((f) => f.properties.id);
}

// voarPresentacao(ids, { pausaMs, aoChegar(id), aoSair(id) })
// 1) sobe sobre a serra (o vale inteiro e o paredão), 2) visita cada poço e espera pausaMs,
// 3) pousa no vale. Nunca começa antes do mapa interativo nem com a abertura de 5 s tocando.
export async function voarPresentacao(ids, opcoes = {}) {
  if (aberturaTocando()) return { concluida: false, pulada: true, motivo: 'abertura' };
  const map = await mapaInterativo();
  if (!map) return { concluida: false, pulada: true, motivo: 'sem-mapa' };
  if (aberturaTocando()) return { concluida: false, pulada: true, motivo: 'abertura' };
  const lista = (Array.isArray(ids) && ids.length ? ids : primeirosConfirmados(2)).filter((id) => ponto(id)?.geometry);
  const recorte = ctx()?.recorte || {};
  const pausa = opcoes.pausaMs ?? (reduzido() ? 0 : 4500);
  const sinal = { parou: false, ouvintes: new Set() };
  const parar = () => { sinal.parou = true; for (const f of [...sinal.ouvintes]) f(); };
  const tirarToque = ouvirToque(parar);
  try {
    // 1) sobre a serra: o centro dos poços, alto, olhando o paredão
    const cs = lista.map((id) => ponto(id).geometry.coordinates);
    const centro = cs.length ? [cs.reduce((s, c) => s + c[0], 0) / cs.length, cs.reduce((s, c) => s + c[1], 0) / cs.length] : (recorte.centro || map.getCenter().toArray());
    const r = await voarPara(centro, { zoom: 12.6, pitch: 70, bearing: rumoDoParedao(null, centro), duracaoMs: opcoes.subidaMs ?? 2200 });
    if (sinal.parou || r.interrompido || r.cancelado) return { concluida: false, interrompida: true };
    // 2) cada poço
    for (const id of lista) {
      const v = await voarPara(id, { zoom: 15.1, pitch: 64, duracaoMs: opcoes.vooMs ?? 3000 });
      if (sinal.parou || v.interrompido || v.cancelado) return { concluida: false, interrompida: true };
      try { opcoes.aoChegar?.(id); } catch (e) { console.info('[voos] aoChegar', e && e.message); }
      await esperar(pausa, sinal);
      try { opcoes.aoSair?.(id); } catch (_) {}
      if (sinal.parou) return { concluida: false, interrompida: true };
    }
    // 3) pousa no vale
    const fim = await voarPara(recorte.centro || centro, { zoom: recorte.zoom ?? 13, pitch: recorte.pitch ?? 60, bearing: recorte.bearing ?? 250, duracaoMs: opcoes.pousoMs ?? 2600 });
    if (sinal.parou || fim.interrompido || fim.cancelado) return { concluida: false, interrompida: true };
    return { concluida: true, visitados: lista };
  } finally {
    tirarToque();
  }
}

// ---------------------------------------------------------------- trilha simulada (demo)
function coordsDaTrilha(trilha) {
  if (!trilha) return null;
  if (typeof trilha === 'string') {
    const f = ctx()?.dados?.trilhas?.features?.find((x) => x.properties?.id === trilha);
    return f ? coordsDaTrilha(f) : null;
  }
  if (Array.isArray(trilha)) return trilha.filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]));
  if (trilha.type === 'Feature') return coordsDaTrilha(trilha.geometry);
  if (trilha.type === 'LineString') return coordsDaTrilha(trilha.coordinates);
  if (trilha.type === 'MultiLineString') return coordsDaTrilha(trilha.coordinates.flat());
  if (Array.isArray(trilha.pontos)) return coordsDaTrilha(trilha.pontos.map((p) => [p.lon, p.lat]));
  return null;
}

function rumo([lon1, lat1], [lon2, lat2]) {
  const r = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
}
const difAngulo = (a, b) => ((b - a + 540) % 360) - 180;

// seguirTrilhaSimulada(trilha, { duracaoMs, aoQuadro({ i, frac, lonLat, alt, bearing }), aoPasso(i, frac), zoom, pitch })
export function seguirTrilhaSimulada(trilha, opcoes = {}) {
  const map = mapa();
  const cs = coordsDaTrilha(trilha);
  if (!map || !cs || cs.length < 2) return Promise.resolve({ concluida: false, motivo: 'sem-trilha' });
  encerrarVooAtual({ chegou: false, cancelado: true });
  map.stop();
  const duracao = Math.max(1000, opcoes.duracaoMs ?? 15000);
  // zoom e inclinação moderados: com 64° e z15,6 a encosta da frente tapava o ponto ao subir o morro
  // (conferido em print no fim da trilha do Véu); 50° e z15 mostram o ponto, a encosta e o vale atrás
  const zoom = opcoes.zoom ?? 15;
  const pitch = tresD() ? (opcoes.pitch ?? 50) : 0;
  const acum = [0];
  for (let i = 1; i < cs.length; i++) acum.push(acum[i - 1] + distanciaM(cs[i - 1], cs[i]));
  const total = acum[acum.length - 1] || 1;

  const posEm = (m) => {
    m = limitar(m, 0, total);
    let lo = 0, hi = acum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (acum[mid] <= m) lo = mid; else hi = mid; }
    const seg = acum[hi] - acum[lo] || 1;
    const f = (m - acum[lo]) / seg;
    return { i: lo, lonLat: [cs[lo][0] + (cs[hi][0] - cs[lo][0]) * f, cs[lo][1] + (cs[hi][1] - cs[lo][1]) * f] };
  };
  const altEm = (ll) => { try { const a = map.queryTerrainElevation?.(ll); return Number.isFinite(a) ? Math.round(a) : null; } catch (_) { return null; } };
  const avisar = (q) => {
    try { opcoes.aoQuadro?.(q); } catch (e) { console.info('[voos] aoQuadro', e && e.message); }
    try { opcoes.aoPasso?.(q.i, q.frac); } catch (_) {}
  };

  if (prefereReduzido() || (reduzido() && !economia())) {
    const o = Math.min(...cs.map((c) => c[0])), l = Math.max(...cs.map((c) => c[0]));
    const s = Math.min(...cs.map((c) => c[1])), n = Math.max(...cs.map((c) => c[1]));
    const fimP = cs[cs.length - 1];
    const pv = paddingVisivel(32);
    if (pv.cabe) map.fitBounds([[o, s], [l, n]], { padding: pv.padding, maxZoom: zoom, pitch, animate: false });
    else {
      // gaveta alta: a faixa livre não comporta a trilha inteira; fica o quadro final do caminho animado
      // (o fim da trilha no centro visível), que é onde o passeio termina
      let offset = [0, 0];
      try { offset = deslocamento(); } catch (_) {}
      map.easeTo({ center: fimP, zoom, pitch, bearing: tresD() ? rumo(cs[Math.max(0, cs.length - 2)], fimP) : 0, offset, duration: 0 });
    }
    avisar({ i: cs.length - 1, frac: 1, lonLat: fimP, alt: altEm(fimP), bearing: map.getBearing() });
    return Promise.resolve({ concluida: true, salto: true });
  }

  return new Promise((resolver) => {
    let feito = false;
    let raf = 0;
    let ultimoT = 0;
    let gasto = 0;
    let bearing = rumo(cs[0], posEm(Math.min(total, 150)).lonLat);
    const fim = (r) => {
      if (feito) return;
      feito = true;
      cancelAnimationFrame(raf);
      tirarToque();
      if (vooAtual?.fim === fim) vooAtual = null;
      resolver(r);
    };
    vooAtual = { fim };
    const tirarToque = ouvirToque(() => fim({ concluida: false, interrompido: true }));
    const passo = (t) => {
      if (feito) return;
      const dt = ultimoT ? Math.min(200, t - ultimoT) : 16;  // aba oculta pausa, não pula; aparelho lento anda no tempo real
      ultimoT = t;
      gasto += dt;
      const frac = limitar(gasto / duracao, 0, 1);
      const m = suave(frac) * total;
      const { i, lonLat } = posEm(m);
      // rumo olhando 140 m à frente, filtrado (sem tremer nas curvas do traçado)
      const frente = posEm(m + 140).lonLat;
      if (distanciaM(lonLat, frente) > 5) {
        const k = 1 - Math.exp(-dt / 450);
        bearing = (bearing + difAngulo(bearing, rumo(lonLat, frente)) * k + 360) % 360;
      }
      let offset = [0, 0];
      try { offset = deslocamento(); } catch (_) {}
      map.easeTo({ center: lonLat, zoom, pitch, bearing: tresD() ? bearing : 0, offset, duration: 0 });
      avisar({ i, frac, lonLat, alt: altEm(lonLat), bearing });
      if (frac >= 1) { fim({ concluida: true }); return; }
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
  });
}

// para o demo e a abertura: para qualquer voo em andamento
export function pararVoos() {
  encerrarVooAtual({ chegou: false, cancelado: true });
  mapa()?.stop();
}
