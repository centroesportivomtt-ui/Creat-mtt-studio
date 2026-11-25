// gps.js · GPS ao vivo: ponto azul, círculo de precisão, direção pela bússola e modo seguir. Frontend A.
// O GPS só liga com um toque (nunca pede permissão sozinho ao abrir). No iOS, a bússola também pede
// permissão num toque (DeviceOrientationEvent.requestPermission).

import { T, t } from './textos.js';
import { el } from './util.js';
import { deslocamento } from './mapa.js';

const ML = () => window.maplibregl;
let ctx = null;
let map = null;
let watchId = null;
let estado = 'desligado';            // desligado | procurando | ligado | erro
let seguindo = false;
let ultima = null;                    // { lon, lat, alt, precisao, t, velocidade, rumoGps }
let rumoBussola = null;               // graus, 0 = norte
let bussolaLigada = false;
let marcadorPonto = null, marcadorPrecisao = null, elPonto = null, elPrecisao = null;
const ouvintes = new Set();
let ultimoAvisoFraco = 0;
let ultimaBussolaMs = 0;

export function iniciarGPS(contexto, mapa) {
  ctx = contexto;
  map = mapa;
  map?.on('zoom', ajustarPrecisao);
  map?.on('dragstart', (e) => { if (e.originalEvent && seguindo) definirSeguir(false); });
  document.getElementById('ctl-gps')?.addEventListener('click', alternar);
  document.getElementById('ctl-bussola')?.addEventListener('click', () => ligarBussola(true));
  atualizarBotao();
}

export function ultimaPosicao() { return ultima ? { ...ultima, rumo: rumoAtual() } : null; }
export function estadoGPS() { return { estado, seguindo, bussola: bussolaLigada }; }
export function aoMudar(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
export function rumoAtual() { return rumoBussola ?? ultima?.rumoGps ?? null; }

function avisarOuvintes() { for (const fn of ouvintes) { try { fn(ultimaPosicao()); } catch (e) { console.info('[gps] ouvinte falhou', e); } } }

// 1º toque: liga; com posição: seguir; seguindo: para de seguir.
function alternar() {
  if (estado === 'desligado' || estado === 'erro') { ligar({ seguir: true }); return; }
  definirSeguir(!seguindo);
}

export function ligar({ seguir = false } = {}) {
  if (!('geolocation' in navigator)) { estado = 'erro'; ctx.avisar?.(T.gps.indisponivel); atualizarBotao(); return false; }
  if (seguir) seguindo = true;
  if (watchId != null) { atualizarBotao(); if (seguindo && ultima) centrar(); return true; }
  estado = 'procurando';
  atualizarBotao();
  ctx.avisar?.(T.gps.procurando);
  watchId = navigator.geolocation.watchPosition(receber, erro, { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 });
  ligarBussola(false);
  return true;
}

export function desligar() {
  if (watchId != null) navigator.geolocation.clearWatch(watchId);
  watchId = null;
  estado = 'desligado';
  seguindo = false;
  atualizarBotao();
}

export function definirSeguir(sim) {
  seguindo = !!sim;
  atualizarBotao();
  if (seguindo && ultima) centrar();
  ctx.anunciar?.(seguindo ? T.gps.seguir : T.gps.parar_seguir);
}

function receber(pos) {
  const c = pos.coords;
  const novo = {
    lon: c.longitude, lat: c.latitude,
    alt: Number.isFinite(c.altitude) ? c.altitude : null,
    precisao: Number.isFinite(c.accuracy) ? c.accuracy : null,
    t: pos.timestamp || Date.now(),
    velocidade: Number.isFinite(c.speed) ? c.speed : null,
    rumoGps: Number.isFinite(c.heading) && (c.speed ?? 0) > 0.6 ? c.heading : (ultima?.rumoGps ?? null),
  };
  const primeira = !ultima;
  ultima = novo;
  if (estado !== 'ligado') { estado = 'ligado'; atualizarBotao(); }
  desenhar();
  if (primeira || seguindo) centrar(primeira);
  if (novo.precisao != null && novo.precisao > 50 && Date.now() - ultimoAvisoFraco > 60000) {
    ultimoAvisoFraco = Date.now();
    ctx.avisar?.(t('gps.precisao_ruim', { m: Math.round(novo.precisao) }));
  }
  avisarOuvintes();
}

function erro(e) {
  if (e.code === 1) { estado = 'erro'; seguindo = false; ctx.avisar?.(T.gps.negado); if (watchId != null) navigator.geolocation.clearWatch(watchId); watchId = null; }
  else if (e.code === 3) ctx.avisar?.(T.gps.demorou);
  else ctx.avisar?.(T.gps.indisponivel);
  atualizarBotao();
}

function centrar(primeira = false) {
  if (!map || !ultima) return;
  const centro = [ultima.lon, ultima.lat];
  const zoom = primeira ? Math.max(map.getZoom(), 14.6) : map.getZoom();
  map.easeTo({ center: centro, zoom, offset: deslocamento(), duration: ctx.reduzMovimento() || ctx.economia() ? 0 : (primeira ? 900 : 500) });
}

// ---------------------------------------------------------------- desenho
function desenhar() {
  if (!map || !ultima) return;
  if (!marcadorPonto) {
    elPrecisao = el('div', { class: 'gps-precisao', 'aria-hidden': 'true', role: 'presentation' });
    elPonto = el('div', { class: 'gps-ponto', role: 'img', 'aria-label': T.gps.ligar }, el('span', { class: 'gps-ponto__cone' }), el('span', { class: 'gps-ponto__disco' }));
    marcadorPrecisao = new (ML().Marker)({ element: elPrecisao, pitchAlignment: 'map', rotationAlignment: 'map' });
    marcadorPonto = new (ML().Marker)({ element: elPonto, rotationAlignment: 'map', pitchAlignment: 'map' });
  }
  marcadorPrecisao.setLngLat([ultima.lon, ultima.lat]).addTo(map);
  marcadorPonto.setLngLat([ultima.lon, ultima.lat]).addTo(map);
  if (ultima.precisao != null) elPonto.setAttribute('aria-label', `${T.gps.ligar}: ${t('gps.precisao', { m: Math.round(ultima.precisao) })}`);
  ajustarPrecisao();
  desenharRumo();
}

function ajustarPrecisao() {
  if (!elPrecisao || !ultima || ultima.precisao == null) return;
  const mpp = 40075016.686 * Math.cos(ultima.lat * Math.PI / 180) / (512 * 2 ** map.getZoom());
  const px = Math.min(1600, Math.max(0, (2 * ultima.precisao) / mpp));
  elPrecisao.style.width = elPrecisao.style.height = `${px.toFixed(0)}px`;
  elPrecisao.dataset.fraco = ultima.precisao > 30 ? '1' : '0';
}

function desenharRumo() {
  if (!elPonto) return;
  const r = rumoAtual();
  elPonto.dataset.rumo = r == null ? '0' : '1';
  if (r != null) elPonto.style.setProperty('--rumo', `${r.toFixed(0)}deg`);
}

function atualizarBotao() {
  const b = document.getElementById('ctl-gps');
  if (!b) return;
  let txt = T.gps.ligar;
  if (estado === 'ligado' || estado === 'procurando') txt = seguindo ? T.gps.parar_seguir : T.gps.seguir;
  const s = b.querySelector('.controle__texto');
  if (s) s.textContent = estado === 'procurando' ? '…' : 'GPS';
  b.setAttribute('aria-label', txt);
  b.title = txt;
  b.setAttribute('aria-pressed', seguindo ? 'true' : 'false');
  b.dataset.estado = estado;
  const bu = document.getElementById('ctl-bussola');
  if (bu) bu.hidden = bussolaLigada || estado === 'desligado' || typeof DeviceOrientationEvent === 'undefined';
}

// ---------------------------------------------------------------- bússola do aparelho
async function ligarBussola(porToque) {
  if (bussolaLigada || typeof window.DeviceOrientationEvent === 'undefined') { atualizarBotao(); return; }
  const DOE = window.DeviceOrientationEvent;
  if (typeof DOE.requestPermission === 'function') {
    if (!porToque) { atualizarBotao(); return; }            // iOS: só com um toque
    try {
      const r = await DOE.requestPermission();
      if (r !== 'granted') { ctx.avisar?.(T.gps.bussola_negada); return; }
    } catch (_) { ctx.avisar?.(T.gps.bussola_negada); return; }
  }
  const absoluto = 'ondeviceorientationabsolute' in window;
  window.addEventListener(absoluto ? 'deviceorientationabsolute' : 'deviceorientation', aoOrientar, { passive: true });
  bussolaLigada = true;
  atualizarBotao();
}

function aoOrientar(e) {
  const agora = performance.now();
  if (agora - ultimaBussolaMs < (ctx.economia() ? 1000 : 120)) return;
  ultimaBussolaMs = agora;
  let r = null;
  if (typeof e.webkitCompassHeading === 'number') r = e.webkitCompassHeading;
  else if (e.absolute !== false && typeof e.alpha === 'number') r = 360 - e.alpha;
  if (r == null || !Number.isFinite(r)) return;
  const tela = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
  rumoBussola = ((r + tela) % 360 + 360) % 360;
  desenharRumo();
  avisarOuvintes();
}
