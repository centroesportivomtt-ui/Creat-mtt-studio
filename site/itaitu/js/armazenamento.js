// armazenamento.js · service worker, pré-cache com progresso, persistência e "atualizar mapa".
// Frontend A. Protocolo: ARQUITETURA 8 e cabeçalho de sw.js (devops). ?sw=0 desregistra (desenvolvimento).

import { T, t, numeroBR } from './textos.js';

let ctx = null;
let canal = null;
let ultimoEstado = null;
let erros = 0;
let escondeEm = null;
const $ = (id) => document.getElementById(id);

export async function montarArmazenamento(contexto) {
  ctx = contexto;
  $('armaz-atualizar')?.addEventListener('click', () => enviar({ tipo: 'atualizar' }, T.armazenamento.atualizando));
  $('armaz-guardar')?.addEventListener('click', () => { erros = 0; enviar({ tipo: 'precachear' }); });
  if (!('serviceWorker' in navigator)) { pintar({ texto: T.armazenamento.persistencia }); return; }
  if (ctx.params.get('sw') === '0') {
    try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch (_) {}
    console.info('[armazenamento] ?sw=0: service worker desligado');
    return;
  }
  try { canal = new BroadcastChannel('itaitu-cache'); canal.onmessage = (e) => receber(e.data); }
  catch (_) { canal = null; }
  navigator.serviceWorker.addEventListener('message', (e) => receber(e.data));
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (e) { console.info('[armazenamento] service worker não registrou', e && e.message); return; }
  pedirPersistencia();
  const reg = await navigator.serviceWorker.ready;
  (navigator.serviceWorker.controller || reg.active)?.postMessage({ tipo: 'estado' });
  window.addEventListener('online', () => { if (ultimoEstado && !ultimoEstado.pronto) enviar({ tipo: 'precachear' }); pintarRede(); });
  window.addEventListener('offline', pintarRede);
}

async function alvoSW() {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.ready;
  return navigator.serviceWorker.controller || reg.active;
}

async function enviar(msg, aviso) {
  if (navigator.onLine === false && msg.tipo !== 'estado') { ctx.avisar?.(T.armazenamento.sem_sinal); return; }
  const sw = await alvoSW();
  sw?.postMessage(msg);
  if (aviso) ctx.avisar?.(aviso);
}

async function pedirPersistencia() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      const ok = await navigator.storage.persist();
      if (!ok) $('armaz-persistencia')?.removeAttribute('hidden');
    }
  } catch (_) {}
}

function receber(m) {
  if (!m || typeof m !== 'object') return;
  if (m.tipo === 'estado') {
    ultimoEstado = m;
    if (!m.pronto && navigator.onLine !== false) enviar({ tipo: 'precachear' });
    if (m.pronto) pintar({ pronto: true, silencioso: true });
    pintarInfo();
  } else if (m.tipo === 'progresso') {
    const pct = m.total ? Math.min(100, Math.floor((m.feito / m.total) * 100)) : 0;
    pintar({ texto: t('cache.progresso', { pct }), pct });
  } else if (m.tipo === 'pronto') {
    ultimoEstado = { ...(ultimoEstado || {}), pronto: true, versao: m.versao, bytes: m.bytes, quando: m.quando, nova_versao: undefined };
    pintar({ pronto: true });
    if (erros) erros = 0;
    pintarInfo();
    ctx.anunciar?.(T.armazenamento.pronto);
  } else if (m.tipo === 'erro') {
    erros++;
    if (m.url === 'precache.json') return;
    pintar({ texto: T.armazenamento.falhou, erro: true });
    $('armaz-guardar')?.removeAttribute('hidden');
  }
}

// selo do topo: "Guardando o mapa no celular: 63%" até "Pronto para usar sem internet"
function pintar({ texto, pct = null, pronto = false, erro = false, silencioso = false }) {
  const s = $('cache-estado');
  if (!s) return;
  clearTimeout(escondeEm);
  if (pronto) {
    if (silencioso && s.hidden) return;          // já estava pronto em outra visita: não mostra nada
    s.textContent = T.armazenamento.pronto;
    s.dataset.estado = 'pronto';
    s.hidden = false;
    s.style.removeProperty('--pct');
    escondeEm = setTimeout(() => { s.hidden = true; }, 5000);
    return;
  }
  s.textContent = texto || '';
  s.dataset.estado = erro ? 'erro' : 'guardando';
  if (pct != null) s.style.setProperty('--pct', `${pct}%`);
  s.hidden = !texto;
}

function pintarRede() {
  const n = $('armaz-rede');
  if (n) { n.textContent = navigator.onLine === false ? T.armazenamento.sem_sinal : ''; n.hidden = navigator.onLine !== false; }
}

async function pintarInfo() {
  const e = ultimoEstado || {};
  const tam = $('armaz-tamanho');
  let bytes = e.bytes || 0;
  if (!bytes) { try { bytes = (await navigator.storage?.estimate?.())?.usage || 0; } catch (_) {} }
  if (tam) tam.textContent = bytes ? t('armazenamento.tamanho', { mb: numeroBR(bytes / 1048576, 1) }) : '';
  const quando = $('armaz-quando');
  if (quando) {
    quando.textContent = e.quando ? t('armazenamento.guardado_em', { data: new Date(e.quando).toLocaleDateString('pt-BR', { timeZone: 'America/Bahia' }) }) : T.armazenamento.primeira_visita;
  }
  const versao = $('armaz-versao');
  if (versao) versao.textContent = e.versao ? t('informacoes.versao', { versao: e.versao }) : '';
  const nova = $('armaz-nova');
  if (nova) nova.hidden = !e.nova_versao;
  const at = $('armaz-atualizar');
  if (at) at.dataset.destaque = e.nova_versao ? '1' : '0';
  pintarRede();
}

