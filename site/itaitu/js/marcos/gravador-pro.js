// gravador-pro.js · gravador de campo do Marcos (frontend C).
// Por cima do gps.js do app público (mesmo ponto azul, mesmo watch). O que soma ao gravador do hóspede:
// pausa automática por parada (60 s num raio de 8 m; volta sozinho ao andar 15 m), passagens com nota,
// perfil de altitude ao vivo (rota.js) e salvar como trilha OFICIAL de um destino, com "fincada pela
// ACAGI", nome do condutor (só no aparelho) e sol_ajuste_min opcional.
// A gravação em andamento fica em 'config' (chave 'gravacao-pro'), não em 'trilhas', para o gravador do
// app público não a "recuperar" como dele. A trilha salva vai para 'trilhas' (origem 'gravada',
// oficial: true quando marcada), aparece no mapa e no "Minhas trilhas" e entra no pacote.

import { numeroBR } from '../textos.js';
import { el, distanciaM, comprimentoM, subidaDescida, duracaoCurta } from '../util.js';
import * as banco from '../banco.js';
import * as gps from '../gps.js';
import { estadoGravacao } from '../gravador.js';
import { perfilDaTrilha, desenharPerfil } from '../rota.js';
import { atualizarTrilhas, margensVisiveis } from '../mapa.js';
import { $, m, avisar, anunciar, horaDe, hoje, dataBR, slugDe } from './comum.js';
import { AJUSTE_MAX } from './pacote.js';

const PRECISAO_MAX = 30;      // m: trilha oficial pede leitura boa
const PASSO_MIN = 4;          // m entre pontos
const PAUSA_S = 60;
const PAUSA_RAIO = 8;
const RETOMA_RAIO = 15;
const SALVAR_A_CADA = 5;
const CHAVE = 'gravacao-pro';
export const NOTAS_RAPIDAS = ['porteira', 'bifurcação: siga à esquerda', 'bifurcação: siga à direita', 'ponte', 'água boa', 'mirante', 'trecho perigoso', 'placa'];

let ctx = null, map = null;
let rec = null;
let estado = 'parada';          // gravando | pausada | parada
let pausaAuto = false;
let ativoDesde = null;
let referenciaParada = null;
let pendentes = 0;
let relogio = null;
let wake = null;
let ultimoPerfil = 0;

// ---------------------------------------------------------------- estado e persistência
async function salvarAgora() {
  if (!rec) return;
  pendentes = 0;
  try { await banco.gravar('config', { chave: CHAVE, valor: { ...rec, ativo_ms: tempoAtivoMs(), estado, pausaAuto } }); }
  catch (e) { console.info('[gravador-pro] não salvou agora', e && e.message); }
}
async function limparRascunho() { try { await banco.apagar('config', CHAVE); } catch (_) {} }

function tempoAtivoMs() { return rec ? (rec.ativo_ms || 0) + (ativoDesde != null ? Date.now() - ativoDesde : 0) : 0; }
function acumular() { if (rec && ativoDesde != null) { rec.ativo_ms = (rec.ativo_ms || 0) + (Date.now() - ativoDesde); ativoDesde = null; } }

export function estadoPro() { return { estado, pontos: rec?.pontos.length || 0, passagens: rec?.passagens.length || 0 }; }

function iniciar() {
  if (estado !== 'parada') return;
  if (estadoGravacao().estado !== 'parada') { avisar(m('gravador_ocupado')); return; }
  const agora = Date.now();
  rec = { id: `oficial-${agora}`, criada_em: agora, pontos: [], passagens: [], km: 0, ativo_ms: 0 };
  estado = 'gravando';
  pausaAuto = false;
  ativoDesde = agora;
  referenciaParada = null;
  gps.ligar();
  const p = gps.ultimaPosicao();
  if (p) aoPosicao(p);
  telaAcesa(true);
  salvarAgora();
  mudou();
  mostrarTela(true);
}

function pausar(auto) {
  if (estado !== 'gravando') return;
  acumular();
  estado = 'pausada';
  pausaAuto = !!auto;
  salvarAgora();
  anunciar(auto ? 'Pausa automática: você parou. Volta a gravar quando andar.' : 'Gravação pausada.');
  mudou();
}
function continuar() {
  if (estado !== 'pausada') return;
  estado = 'gravando';
  pausaAuto = false;
  ativoDesde = Date.now();
  referenciaParada = null;
  gps.ligar();
  telaAcesa(false);
  salvarAgora();
  anunciar('Gravando de novo.');
  mudou();
}

function aoPosicao(p) {
  if (!rec || estado === 'parada' || !p) return;
  if (p.precisao != null && p.precisao > PRECISAO_MAX) return;
  const ponto = { lon: p.lon, lat: p.lat, alt: Number.isFinite(p.alt) ? Math.round(p.alt * 10) / 10 : null, precisao: p.precisao, t: p.t || Date.now() };
  const ult = rec.pontos[rec.pontos.length - 1];
  const d = ult ? distanciaM([ult.lon, ult.lat], [ponto.lon, ponto.lat]) : Infinity;
  if (estado === 'pausada') {
    if (pausaAuto && ult && d >= RETOMA_RAIO) continuar();
    else return;
  }
  if (!referenciaParada || distanciaM([referenciaParada.lon, referenciaParada.lat], [ponto.lon, ponto.lat]) > PAUSA_RAIO) referenciaParada = { lon: ponto.lon, lat: ponto.lat, t: ponto.t };
  else if (ponto.t - referenciaParada.t > PAUSA_S * 1000 && rec.pontos.length > 1) { pausar(true); return; }
  if (ult && d < PASSO_MIN) return;
  rec.pontos.push(ponto);
  if (ult) rec.km = Math.round((rec.km * 1000 + d)) / 1000;
  if (++pendentes >= SALVAR_A_CADA) salvarAgora();
  desenharTracado();
  numeros();
  if (Date.now() - ultimoPerfil > 15000) perfilAoVivo();
}

function desenharTracado() {
  const fonte = map?.getSource('gravacao');
  if (!fonte) return;
  const c = rec ? rec.pontos.map((p) => [p.lon, p.lat]) : [];
  fonte.setData({ type: 'FeatureCollection', features: c.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } }] : [] });
}

// ---------------------------------------------------------------- tela
function linhaStatus() {
  if (!rec) return '';
  const km = numeroBR(rec.km || 0, 2);
  const tempo = duracaoCurta(tempoAtivoMs() / 1000);
  const ult = rec.pontos[rec.pontos.length - 1];
  const alt = ult?.alt != null ? ` · ${Math.round(ult.alt)} m` : '';
  if (estado === 'pausada') return pausaAuto ? `Pausa automática · ${km} km · ${tempo}` : `Pausada · ${km} km · ${tempo}`;
  return `Gravando: ${km} km · ${tempo}${alt} · ${rec.passagens.length} passagens`;
}

function numeros() {
  const l = linhaStatus();
  for (const id of ['pro-status', 'pro-tela-status']) { const n = $(id); if (n) n.textContent = l; }
  if (rec) {
    $('pro-tela-km').textContent = `${numeroBR(rec.km || 0, 2)} km`;
    $('pro-tela-tempo').textContent = duracaoCurta(tempoAtivoMs() / 1000);
  }
}

function mudou() {
  const parado = estado === 'parada';
  $('pro-iniciar').hidden = !parado;
  for (const id of ['pro-pausar', 'pro-passagem', 'pro-tela', 'pro-parar']) $(id).hidden = parado;
  const txt = estado === 'pausada' ? 'Continuar gravando' : 'Pausar';
  $('pro-pausar').querySelector('span').textContent = txt;
  $('pro-tela-pausar').textContent = txt;
  $('pro-perfil').hidden = parado;
  $('pro-passagens').hidden = parado || !rec?.passagens.length;
  document.documentElement.dataset.gravandoPro = parado ? '0' : '1';
  clearInterval(relogio);
  if (!parado) relogio = setInterval(numeros, 1000);
  else { telaAcesaSolta(); $('pro-status').textContent = ''; mostrarTela(false); }
  numeros();
  listarPassagens();
}

async function perfilAoVivo() {
  ultimoPerfil = Date.now();
  const alvo = $('pro-perfil');
  if (!alvo || !rec || rec.pontos.length < 2) return;
  try { desenharPerfil(alvo, await perfilDaTrilha({ pontos: rec.pontos })); } catch (_) { /* perfil é extra */ }
}

function listarPassagens() {
  const ul = $('pro-passagens');
  if (!ul) return;
  ul.replaceChildren(...(rec?.passagens || []).map((p) => el('li', {}, el('span', { class: 'num' }, p.hora || ''), ` ${p.nota}`)));
}

async function telaAcesa(avisarFalha) {
  if (!('wakeLock' in navigator)) { if (avisarFalha) avisar('Este navegador não deixa a tela acesa sozinha: ajuste o tempo de tela nas configurações.'); return; }
  try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
  catch (_) { wake = null; }
}
function telaAcesaSolta() { try { wake?.release(); } catch (_) {} wake = null; }

function mostrarTela(sim) {
  const tela = $('pro-tela-escura');
  if (!tela) return;
  tela.hidden = !sim || estado === 'parada';
  if (!tela.hidden) { numeros(); $('pro-tela-titulo').focus(); } else travar(false);
}

function travar(sim) {
  const tela = $('pro-tela-escura');
  tela.dataset.travada = sim ? '1' : '0';
  for (const n of tela.querySelectorAll('[data-some-na-trava]')) n.hidden = sim;
  const d = $('pro-tela-destravar');
  d.hidden = !sim;
  if (sim) { anunciar('Tela travada contra toque no bolso.'); d.focus(); }
}

function ligarTela() {
  $('pro-tela-travar').addEventListener('click', () => travar(true));
  $('pro-tela-pausar').addEventListener('click', () => (estado === 'gravando' ? pausar(false) : continuar()));
  $('pro-tela-passagem').addEventListener('click', pedirPassagem);
  $('pro-tela-sair').addEventListener('click', () => mostrarTela(false));
  const dest = $('pro-tela-destravar');
  let timer = null;
  const cancelar = () => { clearTimeout(timer); timer = null; dest.dataset.segurando = '0'; };
  dest.addEventListener('pointerdown', (e) => { e.preventDefault(); dest.dataset.segurando = '1'; timer = setTimeout(() => { cancelar(); travar(false); $('pro-tela-travar').focus(); }, 1000); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) dest.addEventListener(ev, cancelar);
  dest.addEventListener('click', (e) => { if (e.detail === 0) { travar(false); $('pro-tela-travar').focus(); } });
  dest.addEventListener('contextmenu', (e) => e.preventDefault());
  $('pro-tela-escura').addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('pro-tela-escura').dataset.travada !== '1') { e.preventDefault(); mostrarTela(false); } });
}

// ---------------------------------------------------------------- passagem com nota
function pedirPassagem() {
  const p = gps.ultimaPosicao();
  if (!rec || !p) { avisar('Esperando o GPS para marcar a passagem.'); return; }
  const dlg = $('passagem-dlg');
  const campo = $('passagem-nota');
  campo.value = '';
  $('passagem-onde').textContent = `${horaDe(Date.now())} · precisão de ${p.precisao != null ? Math.round(p.precisao) : '–'} m`;
  const rapidas = $('passagem-rapidas');
  rapidas.replaceChildren(...NOTAS_RAPIDAS.map((n) => el('button', { class: 'm-chip', type: 'button', onclick: () => { campo.value = n; campo.focus(); } }, n)));
  $('passagem-cancelar').onclick = () => dlg.close();
  $('passagem-form').onsubmit = (e) => {
    e.preventDefault();
    const nota = campo.value.trim().slice(0, 120) || `passagem ${horaDe(Date.now())}`;
    rec.passagens.push({ lon: p.lon, lat: p.lat, alt: Number.isFinite(p.alt) ? Math.round(p.alt) : null, nota, hora: horaDe(Date.now()), t: Date.now() });
    salvarAgora();
    dlg.close();
    listarPassagens();
    $('pro-passagens').hidden = false;
    anunciar(`Passagem marcada: ${nota}`);
    numeros();
  };
  dlg.showModal();
  campo.focus();
}

// ---------------------------------------------------------------- salvar
function destinoMaisPerto(pontos) {
  const dests = (ctx.dados?.pontos?.features || []).filter((f) => f.geometry && ['cachoeira', 'poco', 'mirante', 'pico'].includes(f.properties.tipo));
  const ult = pontos[pontos.length - 1];
  if (!ult) return '';
  let melhor = '', dm = 150;
  for (const f of dests) { const d = distanciaM([ult.lon, ult.lat], f.geometry.coordinates); if (d < dm) { dm = d; melhor = f.properties.id; } }
  return melhor;
}

function pedirSalvar() {
  if (!rec) return;
  const dlg = $('pro-salvar-dlg');
  const sel = $('pro-destino');
  sel.replaceChildren(el('option', { value: '' }, 'sem destino'));
  for (const f of (ctx.dados?.pontos?.features || [])) sel.append(el('option', { value: f.properties.id }, f.properties.nome + (f.geometry ? '' : ' (sem coordenada)')));
  sel.value = destinoMaisPerto(rec.pontos);
  const nomeDestino = () => ctx.dados?.pontos?.features.find((f) => f.properties.id === sel.value)?.properties.nome || '';
  $('pro-nome').value = rec.nome || (nomeDestino() ? `Trilha ${nomeDestino()} ${dataBR(hoje(rec.criada_em))}` : `Trilha ${dataBR(hoje(rec.criada_em))}`);
  sel.onchange = () => { if (/^Trilha /.test($('pro-nome').value)) $('pro-nome').value = `Trilha ${nomeDestino() || ''} ${dataBR(hoje(rec.criada_em))}`.replace(/\s+/g, ' '); };
  $('pro-salvar-resumo').textContent = linhaStatus().replace(/^Gravando: |^Pausada · |^Pausa automática · /, '');
  const fincada = $('pro-fincada');
  fincada.onchange = () => { $('pro-fincada-campos').hidden = !fincada.checked; };
  $('pro-fincada-campos').hidden = !fincada.checked;
  $('pro-salvar-erro').hidden = true;
  $('pro-salvar-confirma').hidden = true;
  $('pro-salvar-acoes').hidden = false;
  $('pro-salvar-voltar').onclick = () => dlg.close();
  $('pro-salvar-descartar').onclick = () => { $('pro-salvar-confirma').hidden = false; $('pro-salvar-acoes').hidden = true; $('pro-descartar-sim').focus(); };
  $('pro-descartar-nao').onclick = () => { $('pro-salvar-confirma').hidden = true; $('pro-salvar-acoes').hidden = false; };
  $('pro-descartar-sim').onclick = async () => { dlg.close(); await descartar(); };
  $('pro-salvar-form').onsubmit = async (e) => {
    e.preventDefault();
    const erro = $('pro-salvar-erro');
    if (rec.pontos.length < 2) { erro.textContent = 'A gravação ainda não tem traçado (menos de 2 pontos com GPS bom).'; erro.hidden = false; return; }
    const ajusteTxt = $('pro-ajuste').value.trim();
    const ajuste = fincada.checked && ajusteTxt !== '' ? Math.round(Number(ajusteTxt)) : null;
    if (ajuste != null && (!Number.isFinite(ajuste) || Math.abs(ajuste) > AJUSTE_MAX)) { erro.textContent = `O ajuste vai de −${AJUSTE_MAX} a ${AJUSTE_MAX} min.`; erro.hidden = false; return; }
    dlg.close();
    await salvar({
      nome: $('pro-nome').value.trim().slice(0, 80) || `Trilha ${dataBR(hoje(rec.criada_em))}`,
      destino_id: sel.value || null,
      modo: $('pro-modo').value === 'carro' ? 'carro' : 'pe',
      oficial: $('pro-oficial').checked,
      fincada: fincada.checked,
      condutor: fincada.checked ? $('pro-condutor').value.trim().slice(0, 60) : '',
      ajuste,
    });
  };
  dlg.showModal();
  $('pro-nome').focus();
}

async function descartar() {
  rec = null; estado = 'parada';
  await limparRascunho();
  desenharTracado();
  mudou();
}

export async function salvar({ nome, destino_id, modo, oficial, fincada, condutor, ajuste }) {
  acumular();
  const fim = Date.now();
  const data = hoje(rec.criada_em);
  const pontos = rec.pontos;
  const km = Math.round(comprimentoM(pontos.map((p) => [p.lon, p.lat]))) / 1000;
  let perfil = null;
  try { perfil = await perfilDaTrilha({ pontos }); } catch (_) {}
  const id = destino_id ? `${modo}-${slugDe(destino_id).slice(0, 40)}-${data}-${(fim % 100000).toString(36)}` : rec.id;
  const final = {
    id, nome, destino_id, criada_em: rec.criada_em, fim_em: fim,
    pontos, passagens: rec.passagens.map(({ lon, lat, alt, nota, t }) => ({ lon, lat, alt, nota, t })),
    km, desnivel_m: perfil ? perfil.subida_m : subidaDescida(pontos.map((p) => p.alt)).subida_m,
    duracao_s: Math.round((rec.ativo_ms || 0) / 1000),
    origem: 'gravada', oficial: !!oficial, modo, app: 'marcos',
    ...(fincada ? { fincada_por: 'ACAGI', condutor: condutor || '' } : {}),
    ...(ajuste != null ? { sol_ajuste_min: ajuste } : {}),
  };
  try { await banco.gravar('trilhas', final); }
  catch (e) { avisar('Não deu para salvar a trilha neste celular.'); console.info('[gravador-pro] salvar falhou', e && e.message); return null; }
  rec = null;
  estado = 'parada';
  await limparRascunho();
  desenharTracado();
  mudou();
  await atualizarTrilhas();
  await listarOficiais(final.id);
  avisar(fincada ? 'Trilha salva, fincada pela ACAGI.' : 'Trilha salva.');
  ctx.emit('itaitu:trilha-gravada', { id: final.id, destino_id: final.destino_id || null, km: final.km, desnivel_m: final.desnivel_m, duracao_s: final.duracao_s, inicioMs: final.criada_em, fimMs: final.fim_em });
  ctx.emit('itaitu:marcos-mudou', { tipo: 'trilha', id: final.id });
  return final;
}

// ---------------------------------------------------------------- lista de trilhas do Marcos
export async function trilhasDoMarcos() {
  try { return (await banco.listar('trilhas')).filter((r) => r.app === 'marcos' && !r.em_andamento).sort((a, b) => b.criada_em - a.criada_em); }
  catch (_) { return []; }
}

export async function listarOficiais(abrirId = null) {
  const ul = $('pro-lista');
  if (!ul) return;
  const lista = await trilhasDoMarcos();
  ul.replaceChildren();
  if (!lista.length) { ul.append(el('li', { class: 'vazio' }, 'Nenhuma trilha gravada por aqui ainda.')); return; }
  for (const r of lista) {
    const dest = ctx.dados?.pontos?.features.find((f) => f.properties.id === r.destino_id)?.properties.nome;
    const selos = [r.oficial ? 'oficial' : 'não oficial', r.fincada_por ? `fincada pela ${r.fincada_por}${r.condutor ? ` (${r.condutor})` : ''}` : null, r.sol_ajuste_min != null ? `ajuste de sol ${r.sol_ajuste_min > 0 ? '+' : ''}${r.sol_ajuste_min} min` : null].filter(Boolean);
    const perfilEl = el('div', { class: 'perfil' });
    const det = el('details', { class: 'trilha-item', open: r.id === abrirId },
      el('summary', {}, el('span', { class: 'trilha-item__nome' }, r.nome), el('span', { class: 'trilha-item__resumo num' }, `${numeroBR(r.km || 0, 2)} km · sobe ${r.desnivel_m ?? '–'} m · ${duracaoCurta(r.duracao_s || 0)}`)),
      el('p', { class: 'nota' }, [dest ? `destino: ${dest}` : 'sem destino', ...selos].join(' · ')),
      r.passagens?.length ? el('ul', { class: 'm-passagens' }, r.passagens.map((p) => el('li', {}, p.nota))) : null,
      perfilEl,
      el('div', { class: 'linha-botoes' },
        el('button', { class: 'botao botao--linha', type: 'button', onclick: async () => { r.oficial = !r.oficial; await banco.gravar('trilhas', r); await listarOficiais(r.id); ctx.emit('itaitu:marcos-mudou', { tipo: 'trilha' }); } }, r.oficial ? 'Tirar do pacote' : 'Marcar como oficial'),
        el('button', { class: 'botao botao--linha', type: 'button', onclick: () => verNoMapa(r) }, 'Ver no mapa')));
    det.addEventListener('toggle', () => { if (det.open && !perfilEl.dataset.feito) { perfilEl.dataset.feito = '1'; perfilDaTrilha(r).then((p) => desenharPerfil(perfilEl, p)).catch(() => {}); } });
    if (r.id === abrirId) queueMicrotask(() => det.dispatchEvent(new Event('toggle')));
    ul.append(el('li', {}, det));
  }
}

function verNoMapa(r) {
  if (!map || !r.pontos?.length) return;
  let o = 180, s = 90, l = -180, n = -90;
  for (const p of r.pontos) { o = Math.min(o, p.lon); l = Math.max(l, p.lon); s = Math.min(s, p.lat); n = Math.max(n, p.lat); }
  ctx.emit('itaitu:marcos-fechar', {});
  const mg = margensVisiveis();
  map.fitBounds([[o, s], [l, n]], { padding: { top: mg.top + 32, bottom: mg.bottom + 32, left: mg.left + 32, right: mg.right + 32 }, duration: ctx.reduzMovimento() ? 0 : 900, maxZoom: 16.5 });
}

// ---------------------------------------------------------------- montagem
export async function montarGravadorPro(contexto, mapa) {
  ctx = contexto;
  map = mapa;
  $('pro-iniciar').addEventListener('click', iniciar);
  $('pro-pausar').addEventListener('click', () => (estado === 'gravando' ? pausar(false) : continuar()));
  $('pro-passagem').addEventListener('click', pedirPassagem);
  $('pro-tela').addEventListener('click', () => mostrarTela(true));
  $('pro-parar').addEventListener('click', () => { mostrarTela(false); pedirSalvar(); });
  ligarTela();
  gps.aoMudar(aoPosicao);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') salvarAgora();
    else if (estado === 'gravando' && !wake) telaAcesa(false);
  });
  window.addEventListener('pagehide', salvarAgora);
  // recupera a gravação se a aba fechou no meio
  try {
    const r = await banco.obter('config', CHAVE);
    if (r && r.valor && Array.isArray(r.valor.pontos)) {
      rec = r.valor;
      estado = rec.estado === 'pausada' ? 'pausada' : 'gravando';
      // pausa automática volta automática: o GPS fica ligado para retomar sozinho ao andar 15 m
      pausaAuto = estado === 'pausada' && rec.pausaAuto === true;
      delete rec.estado;
      delete rec.pausaAuto;
      if (estado === 'gravando') { ativoDesde = Date.now(); gps.ligar(); telaAcesa(false); }
      else if (pausaAuto) gps.ligar();
      avisar('A gravação de campo continuou de onde parou.');
      desenharTracado();
    }
  } catch (_) {}
  mudou();
  await listarOficiais();
}
