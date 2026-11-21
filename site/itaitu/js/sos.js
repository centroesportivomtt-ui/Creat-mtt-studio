// sos.js · tela SOS: coordenada em letra grande (decimal e GMS), SMS com a posição, 193, 192 e 190.
// Frontend A. A ligação funciona sem posição; o SMS sai em uma parte só (textoSMS, do copywriter),
// com o ponto num mapa (não o endereço do app, que não mostra onde a pessoa está).

import { T, t, textoSMS } from './textos.js';
import { hhmm, minutoDoDia } from './motor/nucleo.js';
import { el, formatarDecimal, formatarGMS } from './util.js';
import * as gps from './gps.js';

let ctx = null;
let desligar = null;
const ORDEM = ['193', '192', '190'];

export function montarSOS(contexto) {
  ctx = contexto;
  const dlg = document.getElementById('sos');
  if (!dlg) return;
  document.getElementById('abrir-sos')?.addEventListener('click', abrir);
  document.getElementById('sos-fechar')?.addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { desligar?.(); desligar = null; });
  montarLigacoes();
  montarAvisos();
}

function abrir() {
  const dlg = document.getElementById('sos');
  if (!dlg) return;
  gps.ligar();
  desenhar(gps.ultimaPosicao());
  desligar?.();
  desligar = gps.aoMudar(desenhar);
  dlg.showModal();
  document.getElementById('sos-titulo')?.focus();
}

function linkMapa(lat, lon) {
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

function desenhar(pos) {
  const dec = document.getElementById('sos-decimal');
  const gmsEl = document.getElementById('sos-gms');
  const info = document.getElementById('sos-info');
  const sms = document.getElementById('sos-sms');
  if (!dec) return;
  if (!pos) {
    dec.textContent = '–';
    gmsEl.textContent = '';
    info.textContent = T.sos.sem_posicao;
    sms.removeAttribute('href');
    sms.setAttribute('aria-disabled', 'true');
    return;
  }
  dec.textContent = formatarDecimal(pos.lon, pos.lat);
  gmsEl.textContent = formatarGMS(pos.lon, pos.lat).replace(/ ([NSOL])(?= |$)/g, '\u00A0$1');
  const partes = [];
  if (pos.precisao != null) partes.push(t('sos.precisao', { m: Math.round(pos.precisao) }));
  partes.push(t('sos.hora', { hora: hhmm(minutoDoDia(pos.t || Date.now())) }));
  info.textContent = partes.join(' · ');
  const corpo = textoSMS({ lat: pos.lat, lon: pos.lon, precisaoM: pos.precisao != null ? Math.round(pos.precisao) : null, link: linkMapa(pos.lat, pos.lon) });
  // 'sms:?&body=' abre o app de mensagens no Android e no iPhone
  sms.href = `sms:?&body=${encodeURIComponent(corpo)}`;
  sms.removeAttribute('aria-disabled');
}

// ctx.params só traz vitrine=1 dentro do iframe da vitrine do marcos.html (app.js + util.emVitrine).
function vitrine() { return ctx.params.get('vitrine') === '1'; }

// Na vitrine o SOS NUNCA fica desligado: o 1º toque avisa que é demonstração e arma o botão por 5 s;
// o 2º toque, dentro desse tempo, liga ou manda o SMS de verdade. Fora da vitrine, um toque basta.
const ARMADO_MS = 5000;
function confirmarNaVitrine(a, acao) {
  return (ev) => {
    if (!vitrine()) return true;
    if (a.dataset.armado === '1') { a.dataset.armado = '0'; avisoVitrine(''); return true; }
    ev.preventDefault();
    a.dataset.armado = '1';
    avisoVitrine(t('demo.vitrine_sos', { acao }, `Isto é a demonstração. Toque de novo em até 5 segundos para ${acao} de verdade.`));
    clearTimeout(a._armado);
    a._armado = setTimeout(() => { a.dataset.armado = '0'; avisoVitrine(''); }, ARMADO_MS);
    return false;
  };
}
// aviso DENTRO do diálogo (o #aviso do app fica atrás do modal e não aparece)
function avisoVitrine(texto) {
  const alvo = document.getElementById('sos-ligacoes');
  if (!alvo) return;
  let p = document.getElementById('sos-vitrine');
  if (!p) {
    p = el('p', { id: 'sos-vitrine', class: 'sos__vitrine', role: 'status' });
    alvo.before(p);
  }
  p.textContent = texto;
  p.hidden = !texto;
}

function montarLigacoes() {
  const alvo = document.getElementById('sos-ligacoes');
  if (!alvo) return;
  const lista = Array.isArray(ctx.dados?.info?.emergencia) && ctx.dados.info.emergencia.length
    ? ctx.dados.info.emergencia.filter((e) => /^\d{3}$/.test(String(e.numero)))
    : [{ numero: '193', nome: 'Bombeiros' }, { numero: '192', nome: 'SAMU' }, { numero: '190', nome: 'Polícia' }];
  lista.sort((a, b) => ORDEM.indexOf(String(a.numero)) - ORDEM.indexOf(String(b.numero)));
  alvo.replaceChildren();
  for (const e of lista) {
    const chave = `ligar_${e.numero}`;
    const rotulo = T.sos[chave] || t('seguranca.ligar', { numero: e.numero, nome: e.nome });
    const a = el('a', { class: 'botao botao--sos', href: `tel:${e.numero}` }, el('span', { class: 'botao--sos__num num' }, String(e.numero)), el('span', {}, rotulo.replace(/^Ligar \d+ · /, '')));
    a.setAttribute('aria-label', rotulo);
    a.addEventListener('click', confirmarNaVitrine(a, t('demo.vitrine_acao_ligar', { numero: e.numero }, `ligar para o ${e.numero}`)));
    alvo.append(a);
  }
  const sms = document.getElementById('sos-sms');
  const confirmarSMS = sms ? confirmarNaVitrine(sms, t('demo.vitrine_acao_sms', {}, 'mandar o SMS')) : null;
  sms?.addEventListener('click', (ev) => {
    if (sms.getAttribute('aria-disabled') === 'true') { ev.preventDefault(); avisoVitrine(T.sos.sem_posicao); return; }
    confirmarSMS(ev);
  });
}

function montarAvisos() {
  const alvo = document.getElementById('sos-avisos');
  if (!alvo) return;
  const avisos = (ctx.dados?.info?.avisos || []).filter((a) => a && typeof a.texto === 'string');
  alvo.replaceChildren(...avisos.map((a) => el('li', {}, a.texto)));
  alvo.hidden = !avisos.length;
}

