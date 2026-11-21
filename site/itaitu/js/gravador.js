// gravador.js · gravar trilha pelo GPS, tela quase preta com trava de bolso, salvar, exportar GPX,
// "Marcar ponto aqui" e "Meus pontos". Frontend A.
// - A gravação vai para o IndexedDB a cada poucos pontos e ao esconder a página: sobrevive a fechar o app.
// - Página web não grava com a tela bloqueada: Wake Lock (repedido ao voltar), fundo quase preto e o aviso.
// - "Marcar ponto aqui" segue o contrato de marcar.js (ARQUITETURA 2.2): marcarPonto, listarMarcados,
//   apagarMarcado e exportarMarcados moram aqui porque a tarefa T6 os pôs no gravador.js.

import { T, t, numeroBR, duracaoTexto } from './textos.js';
import { hhmm, minutoDoDia } from './motor/nucleo.js';
import { el, icone, distanciaM, comprimentoM, subidaDescida, baixarArquivo, dataArquivo, normalizar, duracaoCurta } from './util.js';
import * as banco from './banco.js';
import * as gps from './gps.js';
import { gerarGPX, blobGPX, importarArquivo } from './gpx.js';
import { perfilDaTrilha, montarPerfil, definirAlvo } from './rota.js';
import { atualizarTrilhas, atualizarMarcados, margensVisiveis, deslocamento } from './mapa.js';

const PRECISAO_MAX = 50;       // m: ponto pior que isso não entra no traçado
const PASSO_MIN = 4;           // m entre pontos gravados
const PAUSA_AUTO_S = 90;       // parado por 90 s: pausa automática
const PAUSA_RAIO = 8;          // m
const RETOMA_RAIO = 15;        // m longe do ponto da pausa: volta a gravar
const SALVAR_A_CADA = 5;       // pontos

let ctx = null, map = null;
let rec = null;                // registro em andamento (store 'trilhas', em_andamento: true)
let estado = 'parada';         // gravando | pausada | parada
let pausaAuto = false;
let ativoDesde = null;         // ms em que a contagem de tempo ativo recomeçou
let pendentes = 0;
let salvando = false;           // entre o toque em Salvar e o registro final gravado: salvarAgora() não escreve
let relogio = null;
let wake = null;
let ultimaParada = null;       // { lon, lat, t } referência da pausa automática
let desligarGPS = null;

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- montagem
export async function montarGravador(contexto, mapa) {
  ctx = contexto;
  map = mapa;
  $('gravar-iniciar')?.addEventListener('click', iniciar);
  $('gravar-pausar')?.addEventListener('click', () => (estado === 'gravando' ? pausar(false) : continuar()));
  $('gravar-parar')?.addEventListener('click', pedirSalvar);
  $('gravar-tela')?.addEventListener('click', () => mostrarTela(true));
  $('gravar-tela-barra')?.addEventListener('click', () => mostrarTela(true));
  $('marcar-aqui')?.addEventListener('click', marcarAqui);
  $('marcar-ligar-gps')?.addEventListener('click', () => gps.ligar());
  $('gpx-arquivo')?.addEventListener('change', importar);
  $('pontos-exportar-geojson')?.addEventListener('click', () => exportarMarcados('geojson').then((b) => baixarArquivo(b, `meus-pontos-itaitu-${dataArquivo(Date.now())}.geojson`)));
  $('pontos-exportar-gpx')?.addEventListener('click', () => exportarMarcados('gpx').then((b) => baixarArquivo(b, `meus-pontos-itaitu-${dataArquivo(Date.now())}.gpx`)));
  montarTelaEscura();
  desligarGPS = gps.aoMudar(aoPosicao);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') salvarAgora();
    else if (estado === 'gravando' && !wake) pedirTelaAcesa(false);
  });
  window.addEventListener('pagehide', salvarAgora);
  document.addEventListener('itaitu:ponto-marcado', listarPontosNaTela);
  atualizarMarcarBotao();
  await recuperar();
  await listarTrilhasNaTela();
  await listarPontosNaTela();
}

async function recuperar() {
  try {
    const todas = await banco.listar('trilhas');
    const andando = todas.filter((r) => r.em_andamento).sort((a, b) => b.criada_em - a.criada_em)[0];
    if (!andando) return;
    rec = andando;
    pendentes = 0;
    if (andando.estado === 'pausada') { estado = 'pausada'; pausaAuto = false; }
    else { estado = 'gravando'; ativoDesde = Date.now(); gps.ligar(); pedirTelaAcesa(false); }
    ctx.avisar?.(T.gravador.recuperada);
    desenharTracado();
    mudouEstado();
  } catch (e) { console.info('[gravador] nada para recuperar', e && e.message); }
}

// ---------------------------------------------------------------- estados
function iniciar() {
  if (estado !== 'parada') return;
  const agora = Date.now();
  rec = {
    id: `gravada-${agora}`, nome: '', destino_id: null, criada_em: agora, fim_em: null,
    pontos: [], passagens: [], km: 0, desnivel_m: 0, duracao_s: 0,
    origem: 'gravada', oficial: false, em_andamento: true, estado: 'gravando', ativo_ms: 0,
  };
  estado = 'gravando';
  pausaAuto = false;
  ativoDesde = agora;
  ultimaParada = null;
  gps.ligar();
  const p = gps.ultimaPosicao();
  if (p) aoPosicao(p);
  salvarAgora();
  pedirTelaAcesa(true);
  mostrarTela(true);
  mudouEstado();
}

function acumularAtivo() {
  if (ativoDesde != null && rec) { rec.ativo_ms = (rec.ativo_ms || 0) + (Date.now() - ativoDesde); ativoDesde = null; }
}

function pausar(automatica) {
  if (estado !== 'gravando') return;
  acumularAtivo();
  estado = 'pausada';
  pausaAuto = !!automatica;
  rec.estado = 'pausada';
  salvarAgora();
  if (automatica) ctx.anunciar?.(T.gravador.pausa_auto);
  mudouEstado();
}

function continuar() {
  if (estado !== 'pausada') return;
  estado = 'gravando';
  pausaAuto = false;
  ativoDesde = Date.now();
  ultimaParada = null;
  rec.estado = 'gravando';
  gps.ligar();
  pedirTelaAcesa(false);
  salvarAgora();
  mudouEstado();
}

function mudouEstado() {
  ctx.emit('itaitu:gravacao', { estado });
  const raiz = document.documentElement;
  raiz.dataset.gravando = estado === 'parada' ? '0' : '1';
  const parado = estado === 'parada';
  for (const id of ['gravar-pausar', 'gravar-parar', 'gravar-tela']) { const b = $(id); if (b) b.hidden = parado; }
  const ini = $('gravar-iniciar'); if (ini) ini.hidden = !parado;
  const pa = $('gravar-pausar');
  if (pa) { pa.querySelector('span').textContent = estado === 'pausada' ? T.gravador.continuar : T.gravador.pausar; }
  const barra = $('gravando-barra');
  if (barra) barra.hidden = parado;
  clearInterval(relogio);
  if (!parado) relogio = setInterval(atualizarNumeros, 1000);
  else {
    liberarTelaAcesa();
    for (const id of ['gravar-status', 'gravando-barra-texto', 'tela-gravando-status']) { const n = $(id); if (n) n.textContent = ''; }
  }
  atualizarNumeros();
  atualizarTela();
  ctx.layout?.();
}

function tempoAtivoMs() {
  if (!rec) return 0;
  return (rec.ativo_ms || 0) + (ativoDesde != null ? Date.now() - ativoDesde : 0);
}

function atualizarNumeros() {
  if (!rec) return;
  const km = numeroBR(rec.km || 0, 2);
  const tempo = duracaoCurta(tempoAtivoMs() / 1000);
  const linha = estado === 'pausada' ? (pausaAuto ? T.gravador.pausa_auto : T.gravador.pausada) : t('gravador.gravando', { km, tempo });
  for (const id of ['gravar-status', 'gravando-barra-texto', 'tela-gravando-status']) { const n = $(id); if (n) n.textContent = linha; }
  const g = $('tela-gravando-km'); if (g) g.textContent = `${km} km`;
  const h = $('tela-gravando-tempo'); if (h) h.textContent = tempo;
}

// ---------------------------------------------------------------- pontos do GPS
function aoPosicao(p) {
  atualizarMarcarBotao();
  if (!rec || estado === 'parada' || salvando || !p) return;
  if (p.precisao != null && p.precisao > PRECISAO_MAX) return;
  const ponto = { lon: p.lon, lat: p.lat, alt: p.alt, precisao: p.precisao, t: p.t || Date.now() };
  const ult = rec.pontos[rec.pontos.length - 1];
  const d = ult ? distanciaM([ult.lon, ult.lat], [ponto.lon, ponto.lat]) : Infinity;

  if (estado === 'pausada') {
    if (pausaAuto && ult && d >= RETOMA_RAIO) continuar();
    else return;
  }
  // pausa automática: parado no mesmo raio por 90 s
  if (!ultimaParada || distanciaM([ultimaParada.lon, ultimaParada.lat], [ponto.lon, ponto.lat]) > PAUSA_RAIO) ultimaParada = { lon: ponto.lon, lat: ponto.lat, t: ponto.t };
  else if (ponto.t - ultimaParada.t > PAUSA_AUTO_S * 1000 && rec.pontos.length > 1) { pausar(true); return; }

  if (ult && d < PASSO_MIN) return;
  rec.pontos.push(ponto);
  if (ult) rec.km = Math.round(((rec.km || 0) * 1000 + d)) / 1000;
  pendentes++;
  if (pendentes >= SALVAR_A_CADA) salvarAgora();
  desenharTracado();
  atualizarNumeros();
}

function desenharTracado() {
  const fonte = map?.getSource('gravacao');
  if (!fonte) return;
  const c = rec ? rec.pontos.map((p) => [p.lon, p.lat]) : [];
  fonte.setData({ type: 'FeatureCollection', features: c.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } }] : [] });
}

async function salvarAgora() {
  // durante salvar() a cópia em andamento chegaria ao IndexedDB depois do registro final e o sobrescreveria
  if (!rec || !rec.em_andamento || salvando) return;
  pendentes = 0;
  const copia = { ...rec, ativo_ms: tempoAtivoMs() };
  try { await banco.gravar('trilhas', copia); } catch (e) { console.info('[gravador] não salvou agora', e && e.message); }
}

// ---------------------------------------------------------------- tela acesa e tela escura
async function pedirTelaAcesa(avisarFalha) {
  if (!('wakeLock' in navigator)) { if (avisarFalha) ctx.avisar?.(T.gravador.tela_acesa_falhou); return; }
  try {
    wake = await navigator.wakeLock.request('screen');
    wake.addEventListener('release', () => { wake = null; });
  } catch (_) { wake = null; if (avisarFalha) ctx.avisar?.(T.gravador.tela_acesa_falhou); }
}
function liberarTelaAcesa() { try { wake?.release(); } catch (_) {} wake = null; }

function montarTelaEscura() {
  const tela = $('tela-gravando');
  if (!tela) return;
  $('tela-gravando-mapa')?.addEventListener('click', () => mostrarTela(false));
  $('tela-gravando-travar')?.addEventListener('click', () => travar(true));
  $('tela-gravando-pausar')?.addEventListener('click', () => (estado === 'gravando' ? pausar(false) : continuar()));
  $('tela-gravando-parar')?.addEventListener('click', () => { mostrarTela(false); pedirSalvar(); });
  $('tela-gravando-passagem')?.addEventListener('click', marcarPassagem);
  const dest = $('tela-gravando-destravar');
  if (dest) {
    let timer = null;
    const cancelar = () => { clearTimeout(timer); timer = null; dest.dataset.segurando = '0'; };
    dest.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      dest.dataset.segurando = '1';
      timer = setTimeout(() => { cancelar(); travar(false); }, 1000);
    });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) dest.addEventListener(ev, cancelar);
    // teclado (Enter/Espaço) não acontece no bolso: destrava direto
    dest.addEventListener('click', (e) => { if (e.detail === 0) travar(false); });
    dest.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  tela.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tela.dataset.travada !== '1') { e.preventDefault(); mostrarTela(false); }
  });
}

function mostrarTela(sim) {
  const tela = $('tela-gravando');
  if (!tela) return;
  tela.hidden = !sim || estado === 'parada';
  if (!tela.hidden) { atualizarTela(); tela.querySelector('h2')?.focus(); }
  else { travar(false); $('gravar-tela')?.focus?.(); }
}

function travar(sim) {
  const tela = $('tela-gravando');
  if (!tela) return;
  tela.dataset.travada = sim ? '1' : '0';
  document.documentElement.dataset.trava = sim ? '1' : '0';
  const d = $('tela-gravando-destravar');
  if (d) d.hidden = !sim;
  for (const n of tela.querySelectorAll('[data-some-na-trava]')) n.hidden = sim;
  if (sim) { ctx.anunciar?.(T.gravador.trava); d?.focus(); }
  else $('tela-gravando-travar')?.focus?.();
}

function atualizarTela() {
  const b = $('tela-gravando-pausar');
  if (b) b.querySelector('span').textContent = estado === 'pausada' ? T.gravador.continuar : T.gravador.pausar;
  if (estado === 'parada') { const tela = $('tela-gravando'); if (tela) tela.hidden = true; travar(false); }
}

async function marcarPassagem() {
  const p = gps.ultimaPosicao();
  if (!rec || !p) { ctx.avisar?.(T.marcar.aguardando_gps); return; }
  rec.passagens.push({ lon: p.lon, lat: p.lat, nota: `${T.gravador.passagem} ${hhmm(minutoDoDia(Date.now()))}` });
  salvarAgora();
  ctx.avisar?.(T.marcar.salvo);
}

// ---------------------------------------------------------------- salvar
function destinoMaisPerto(pontos) {
  const dests = (ctx.dados?.pontos?.features || []).filter((f) => f.geometry);
  let melhor = null, dm = 100;
  for (const f of dests) {
    for (const p of pontos) {
      const d = distanciaM([p.lon, p.lat], f.geometry.coordinates);
      if (d < dm) { dm = d; melhor = f.properties.id; }
    }
  }
  return melhor;
}

function pedirSalvar() {
  if (!rec) return;
  const dlg = $('salvar-trilha');
  if (!dlg) return;
  const nome = $('salvar-trilha-nome');
  const sel = $('salvar-trilha-destino');
  const data = new Date(rec.criada_em - 3 * 3600000).toISOString().slice(0, 10).split('-').reverse().join('/');
  if (nome) nome.value = rec.nome || t('gravador.nome_padrao', { data });
  if (sel) {
    sel.replaceChildren(el('option', { value: '' }, T.gravador.sem_destino));
    for (const f of (ctx.dados?.pontos?.features || []).filter((f) => f.geometry)) sel.append(el('option', { value: f.properties.id }, f.properties.nome));
    sel.value = rec.destino_id || destinoMaisPerto(rec.pontos) || '';
  }
  $('salvar-trilha-confirma').hidden = true;
  $('salvar-trilha-acoes').hidden = false;
  dlg.showModal();
  const form = $('salvar-trilha-form');
  form.onsubmit = async (e) => { e.preventDefault(); dlg.close(); await salvar(nome.value.trim(), sel.value || null); };
  $('salvar-trilha-descartar').onclick = () => { $('salvar-trilha-confirma').hidden = false; $('salvar-trilha-acoes').hidden = true; $('salvar-trilha-descartar-sim').focus(); };
  $('salvar-trilha-descartar-nao').onclick = () => { $('salvar-trilha-confirma').hidden = true; $('salvar-trilha-acoes').hidden = false; };
  $('salvar-trilha-descartar-sim').onclick = async () => { dlg.close(); await descartar(); };
  $('salvar-trilha-voltar').onclick = () => dlg.close();
}

async function descartar() {
  if (!rec) return;
  const id = rec.id;
  rec = null; estado = 'parada';
  try { await banco.apagar('trilhas', id); } catch (_) {}
  desenharTracado();
  mudouEstado();
}

async function salvar(nome, destino_id) {
  if (!rec || salvando) return;
  acumularAtivo();
  salvando = true;               // trava salvarAgora() e o GPS até o registro final estar no banco (QA, 20/11)
  const fim = Date.now();
  const final = {
    ...rec, pontos: rec.pontos.slice(), passagens: Array.isArray(rec.passagens) ? rec.passagens.slice() : rec.passagens,
    nome: (nome || t('gravador.nome_padrao', { data: '' })).slice(0, 80), destino_id, fim_em: fim, em_andamento: false, estado: 'parada',
  };
  delete final.em_andamento;
  final.km = Math.round(comprimentoM(final.pontos.map((p) => [p.lon, p.lat]))) / 1000;
  final.duracao_s = Math.round((final.ativo_ms || 0) / 1000);
  let perfil = null;
  try { perfil = final.pontos.length > 1 ? await perfilDaTrilha(final) : null; } catch (_) {}
  final.desnivel_m = perfil ? perfil.subida_m : subidaDescida(final.pontos.map((p) => p.alt)).subida_m;
  try { await banco.gravar('trilhas', final); }
  catch (e) { salvando = false; ctx.avisar?.(T.erros.salvar); console.info('[gravador] salvar falhou', e && e.message); return; }
  salvando = false;
  rec = null;
  estado = 'parada';
  desenharTracado();
  mudouEstado();
  await atualizarTrilhas();
  await listarTrilhasNaTela(final.id);
  ctx.avisar?.(T.gravador.salva);
  ctx.emit('itaitu:trilha-gravada', {
    id: final.id, destino_id: final.destino_id || null, km: final.km, desnivel_m: final.desnivel_m,
    duracao_s: final.duracao_s, inicioMs: final.criada_em, fimMs: final.fim_em,
  });
}

// ---------------------------------------------------------------- minhas trilhas
const nomeArquivo = (nome, ms, ext) => `trilhas-de-itaitu-${normalizar(nome).replace(/ /g, '-').slice(0, 40) || 'trilha'}-${dataArquivo(ms)}.${ext}`;

export async function exportarTrilha(id) {
  const r = await banco.obter('trilhas', id);
  if (!r) return;
  const txt = gerarGPX({ nome: r.nome, pontos: r.pontos, passagens: r.passagens || [] });
  baixarArquivo(blobGPX(txt), nomeArquivo(r.nome, r.criada_em, 'gpx'));
}

async function listarTrilhasNaTela(abrirId = null) {
  const lista = $('minhas-trilhas');
  if (!lista) return;
  let todas = [];
  try { todas = (await banco.listar('trilhas')).filter((r) => !r.em_andamento).sort((a, b) => b.criada_em - a.criada_em); } catch (_) {}
  lista.replaceChildren();
  if (!todas.length) { lista.append(el('li', { class: 'vazio' }, T.gravador.vazia)); return; }
  for (const r of todas) lista.append(itemTrilha(r, r.id === abrirId));
}

function itemTrilha(r, aberto) {
  const resumo = t('gravador.resumo', { km: numeroBR(r.km || 0, 2), tempo: r.duracao_s ? duracaoTexto(Math.max(1, Math.round(r.duracao_s / 60))) : '–', sobe: r.desnivel_m ?? '–' });
  const horas = r.origem === 'gravada' && r.fim_em
    ? `${t('gravador.inicio', { hora: hhmm(minutoDoDia(r.criada_em)) })} · ${t('gravador.fim', { hora: hhmm(minutoDoDia(r.fim_em)) })}` : '';
  const perfilEl = el('div', { class: 'perfil' });
  const det = el('details', { class: 'trilha-item', open: aberto },
    el('summary', {}, el('span', { class: 'trilha-item__nome' }, r.nome || T.gravador.titulo), el('span', { class: 'trilha-item__resumo num' }, resumo)));
  const confirma = el('div', { class: 'confirma', hidden: true },
    el('p', {}, t('gravador.apagar_pergunta', { nome: r.nome })),
    el('div', { class: 'linha-botoes' },
      el('button', { class: 'botao botao--perigo', type: 'button', onclick: async () => { await banco.apagar('trilhas', r.id); await atualizarTrilhas(); await listarTrilhasNaTela(); } }, T.gravador.apagar),
      el('button', { class: 'botao botao--linha', type: 'button', onclick: (e) => { e.currentTarget.closest('.confirma').hidden = true; } }, T.gravador.manter)));
  det.append(
    horas ? el('p', { class: 'trilha-item__horas num' }, horas) : null,
    r.origem === 'gpx' ? el('p', { class: 'nota' }, t('gravador.importada', { nome: r.nome })) : null,
    perfilEl,
    el('div', { class: 'linha-botoes' },
      el('button', { class: 'botao botao--linha', type: 'button', onclick: () => verNoMapa(r) }, T.tabuas.ver_no_mapa),
      el('button', { class: 'botao botao--linha', type: 'button', onclick: () => { definirAlvo({ trilha: r, nome: r.nome }); gps.ligar(); ctx.fecharPaineis?.(); } }, icone('i-gps'), el('span', {}, T.tabuas.seguir_ate)),
      el('button', { class: 'botao botao--linha', type: 'button', onclick: () => exportarTrilha(r.id) }, T.gravador.exportar_gpx),
      r.origem === 'gravada' ? el('button', { class: 'botao botao--linha', type: 'button', onclick: () => ctx.emit('itaitu:trilha-gravada', { id: r.id, destino_id: r.destino_id || null, km: r.km, desnivel_m: r.desnivel_m, duracao_s: r.duracao_s, inicioMs: r.criada_em, fimMs: r.fim_em, reemitido: true }) }, icone('i-compartilhar'), el('span', {}, T.gravador.gerar_cartao)) : null,
      el('button', { class: 'botao botao--texto', type: 'button', onclick: (e) => { const c = e.currentTarget.closest('details').querySelector('.confirma'); c.hidden = false; c.querySelector('button').focus(); } }, T.gravador.apagar)),
    confirma);
  const carregar = () => { if (det.open && !perfilEl.dataset.feito) { perfilEl.dataset.feito = '1'; montarPerfil(perfilEl, r); } };
  det.addEventListener('toggle', carregar);
  if (aberto) queueMicrotask(carregar);
  return el('li', {}, det);
}

function verNoMapa(r) {
  if (!map || !r.pontos?.length) return;
  let o = 180, s = 90, l = -180, n = -90;
  for (const p of r.pontos) { o = Math.min(o, p.lon); l = Math.max(l, p.lon); s = Math.min(s, p.lat); n = Math.max(n, p.lat); }
  ctx.fecharPaineis?.();
  const m = margensVisiveis();
  map.fitBounds([[o, s], [l, n]], { padding: { top: m.top + 32, bottom: m.bottom + 32, left: m.left + 32, right: m.right + 32 }, duration: ctx.reduzMovimento() ? 0 : 900, maxZoom: 16.5 });
}

async function importar(e) {
  const arq = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!arq) return;
  try {
    const r = await importarArquivo(arq);
    await atualizarTrilhas();
    await listarTrilhasNaTela(r.id);
    ctx.avisar?.(t('gravador.importada', { nome: r.nome }));
    verNoMapa(r);
  } catch (err) {
    ctx.avisar?.(err && err.message && err.message.length < 200 ? err.message : T.erros.gpx);
  }
}

// ---------------------------------------------------------------- Marcar ponto aqui (contrato de marcar.js)
const TIPO_PADRAO = 'mirante';

function atualizarMarcarBotao() {
  const b = $('marcar-aqui');
  if (!b) return;
  const p = gps.ultimaPosicao();
  b.disabled = !p;
  const st = $('marcar-status');
  if (st) st.textContent = p ? (p.precisao != null ? t('marcar.precisao', { m: Math.round(p.precisao) }) : '') : T.marcar.aguardando_gps;
  const lg = $('marcar-ligar-gps');
  if (lg) lg.hidden = !!p || gps.estadoGPS().estado !== 'desligado';
}

function marcarAqui() {
  const p = gps.ultimaPosicao();
  if (!p) { ctx.avisar?.(T.marcar.aguardando_gps); return; }
  marcarPonto({ lon: p.lon, lat: p.lat, alt: p.alt, precisao_m: p.precisao, origem: 'gps' });
}

export function marcarPonto({ lon, lat, alt = null, precisao_m = null, origem = 'gps' }) {
  return new Promise((resolve) => {
    const dlg = $('marcar-ponto');
    if (!dlg) { resolve(null); return; }
    const nome = $('marcar-nome'), tipo = $('marcar-tipo'), nota = $('marcar-nota'), aviso = $('marcar-aviso'), erro = $('marcar-erro');
    nome.value = ''; nota.value = ''; erro.hidden = true;
    if (!tipo.options.length) for (const [k, v] of Object.entries(T.marcar.tipos)) tipo.append(el('option', { value: k }, v));
    tipo.value = TIPO_PADRAO;
    const aproximado = origem === 'toque' || precisao_m == null || precisao_m > 30;
    aviso.textContent = origem === 'toque' ? T.marcar.do_toque
      : (precisao_m != null && precisao_m > 30 ? t('marcar.precisao_ruim', { m: Math.round(precisao_m) }) : (precisao_m != null ? t('marcar.precisao', { m: Math.round(precisao_m) }) : ''));
    let resultado = null;
    const form = $('marcar-form');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const n = nome.value.trim().slice(0, 60);
      if (!n) { erro.textContent = T.marcar.nome_obrigatorio; erro.hidden = false; nome.focus(); return; }
      const agora = Date.now();
      const f = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: alt != null ? [lon, lat, Math.round(alt)] : [lon, lat] },
        properties: {
          id: `marcado-${agora}`, nome: n, tipo: tipo.value || TIPO_PADRAO, nota: nota.value.trim().slice(0, 280), origem,
          precisao_m: precisao_m != null ? Math.round(precisao_m * 10) / 10 : null, alt_m: alt != null ? Math.round(alt) : null,
          criado_em: new Date(agora).toISOString(), aproximado, fonte: 'marcado no aparelho',
        },
      };
      f.id = f.properties.id;
      try { await banco.gravar('marcados', f); } catch (_) { ctx.avisar?.(T.erros.salvar); return; }
      resultado = f;
      dlg.close();
      ctx.avisar?.(T.marcar.salvo);
      ctx.emit('itaitu:ponto-marcado', { id: f.id });
    };
    $('marcar-cancelar').onclick = () => dlg.close();
    dlg.addEventListener('close', () => resolve(resultado), { once: true });
    dlg.showModal();
    nome.focus();
  });
}

export async function listarMarcados() {
  return (await banco.listar('marcados')).sort((a, b) => (a.properties.criado_em < b.properties.criado_em ? 1 : -1));
}

export async function apagarMarcado(id) {
  await banco.apagar('marcados', id);
  ctx?.emit('itaitu:ponto-marcado', { id, apagado: true });
}

export async function exportarMarcados(formato = 'geojson') {
  const lista = await listarMarcados();
  if (formato === 'gpx') {
    const waypoints = lista.map((f) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], alt: f.properties.alt_m, nome: f.properties.nome, nota: f.properties.nota, tipo: f.properties.tipo, t: Date.parse(f.properties.criado_em) || null }));
    return blobGPX(gerarGPX({ nome: T.marcar.meus_pontos, waypoints }));
  }
  return new Blob([JSON.stringify({ type: 'FeatureCollection', features: lista }, null, 1)], { type: 'application/geo+json' });
}

async function listarPontosNaTela() {
  const ul = $('meus-pontos');
  if (!ul) return;
  let lista = [];
  try { lista = await listarMarcados(); } catch (_) {}
  ul.replaceChildren();
  const exp = $('pontos-exportar');
  if (exp) exp.hidden = !lista.length;
  if (!lista.length) { ul.append(el('li', { class: 'vazio' }, T.marcar.vazio)); return; }
  for (const f of lista) {
    const p = f.properties;
    const confirma = el('div', { class: 'confirma', hidden: true },
      el('p', {}, t('marcar.apagar_pergunta', { nome: p.nome })),
      el('div', { class: 'linha-botoes' },
        el('button', { class: 'botao botao--perigo', type: 'button', onclick: () => apagarMarcado(p.id) }, T.marcar.apagar),
        el('button', { class: 'botao botao--linha', type: 'button', onclick: (e) => { e.currentTarget.closest('.confirma').hidden = true; } }, T.marcar.manter)));
    ul.append(el('li', { class: 'ponto-item' },
      el('p', { class: 'ponto-item__nome' }, p.nome),
      el('p', { class: 'ponto-item__info' }, [T.marcar.tipos[p.tipo] || p.tipo, p.aproximado ? T.destinos.aproximada : null, p.nota || null].filter(Boolean).join(' · ')),
      el('div', { class: 'linha-botoes' },
        el('button', { class: 'botao botao--linha', type: 'button', onclick: () => { ctx.fecharPaineis?.(); map?.flyTo({ center: f.geometry.coordinates.slice(0, 2), zoom: Math.max(map.getZoom(), 16), offset: deslocamento(), duration: ctx.reduzMovimento() ? 0 : 900 }); } }, T.tabuas.ver_no_mapa),
        el('button', { class: 'botao botao--texto', type: 'button', onclick: (e) => { const c = e.currentTarget.closest('li').querySelector('.confirma'); c.hidden = false; c.querySelector('button').focus(); } }, T.marcar.apagar)),
      confirma));
  }
  atualizarMarcados();
}

export function estadoGravacao() { return { estado, id: rec?.id || null }; }
export function desligar() { desligarGPS?.(); }
