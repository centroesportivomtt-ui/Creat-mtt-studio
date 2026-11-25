// trava.js · trava da vitrine e portão do PIN (frontend C).
// - Vitrine: o app público da marca abre em tela cheia num iframe (./index.html?m=<slug>&demo=1&vitrine=1).
//   Fica preso: o resto da página fica inerte, o botão Voltar do celular volta para a vitrine e,
//   se a página recarregar, a vitrine reabre sozinha (localStorage 'itaitu:marcos-vitrine').
//   Sair = toque longo (1,5 s) no canto de cima + PIN. Teclado: Enter no mesmo botão pede o PIN.
// - Portão: caderno, preços e kit só abrem com o PIN; ficam abertos por 10 min nesta aba e trancam
//   sozinhos (timer de 10 min), ao entrar na vitrine ou ao esconder a página por mais de 5 min.
// Proteção de uso, não cofre (ver pin.js). Não segura o botão de início do Android nem a troca de app.

import { $, m, anunciar } from './comum.js';
import { lerLocal, gravarLocal } from '../util.js';
import { temPin, definirPin, conferirPin, criptoDisponivel, PIN_VALIDO } from './pin.js';

const CHAVE_VITRINE = 'itaitu:marcos-vitrine';
const SEGURAR_MS = 1500;
const ABERTO_MS = 10 * 60 * 1000;
const ESCONDIDO_MS = 5 * 60 * 1000;

let liberadoAte = 0;
let timerTrava = null;
let escondidoDesde = 0;
const ouvintesTrava = new Set();
let ativa = false;

// ---------------------------------------------------------------- diálogo do PIN
function dialogoPin({ titulo, texto, botao = 'Confirmar' }) {
  return new Promise((resolve) => {
    const dlg = $('pin-dlg'), campo = $('pin-campo'), erro = $('pin-erro');
    $('pin-titulo').textContent = titulo;
    $('pin-texto').textContent = texto;
    $('pin-ok').textContent = botao;
    $('pin-aviso').textContent = m('pin_aviso');
    campo.value = '';
    erro.hidden = true;
    let valor = null;
    const form = $('pin-form');
    form.onsubmit = (e) => {
      e.preventDefault();
      const v = campo.value.trim();
      if (!PIN_VALIDO.test(v)) { erro.textContent = m('pin_formato'); erro.hidden = false; campo.focus(); return; }
      valor = v;
      dlg.close();
    };
    campo.oninput = () => { campo.value = campo.value.replace(/\D/g, '').slice(0, 4); erro.hidden = true; };
    $('pin-cancelar').onclick = () => dlg.close();
    dlg.addEventListener('close', () => { campo.value = ''; resolve(valor); }, { once: true });
    dlg.showModal();
    campo.focus();
  });
}

function mostrarErroPin(texto) {
  // o diálogo já fechou; reabre com a mensagem na próxima pergunta
  anunciar(texto);
  return texto;
}

// Cria o PIN (digitar duas vezes). true = criado.
export async function criarPin() {
  if (!criptoDisponivel()) { anunciar(m('pin_sem_cripto')); window.Itaitu?.avisar?.(m('pin_sem_cripto')); return false; }
  const a = await dialogoPin({ titulo: 'Criar PIN', texto: m('pin_criar'), botao: 'Continuar' });
  if (!a) return false;
  const b = await dialogoPin({ titulo: 'Criar PIN', texto: m('pin_confirmar'), botao: 'Criar PIN' });
  if (!b) return false;
  if (a !== b) { window.Itaitu?.avisar?.(m('pin_diferente')); return false; }
  await definirPin(a);
  anunciar('PIN criado.');
  return true;
}

export async function garantirPin() {
  if (await temPin()) return true;
  return criarPin();
}

// Pergunta o PIN até acertar ou cancelar. true = certo.
export async function pedirPin({ titulo = 'PIN', texto = m('pin_pedir') } = {}) {
  if (!(await garantirPin())) return false;
  let aviso = '';
  for (;;) {
    const v = await dialogoPin({ titulo, texto: aviso ? `${aviso} ${texto}` : texto });
    if (v == null) return false;
    const r = await conferirPin(v);
    if (r.ok) return true;
    if (r.motivo === 'cripto') { window.Itaitu?.avisar?.(m('pin_sem_cripto')); return false; }
    aviso = mostrarErroPin(r.motivo === 'espere' ? m('pin_espere', { s: r.esperaS }) : m('pin_errado'));
  }
}

// Trocar o PIN: pede o atual, depois cria outro.
export async function trocarPin() {
  if (await temPin()) {
    const ok = await pedirPin({ titulo: 'Trocar PIN', texto: m('pin_atual') });
    if (!ok) return false;
  }
  return criarPin();
}

// ---------------------------------------------------------------- portão do caderno e do kit
export function liberado() { return Date.now() < liberadoAte; }
export async function destrancar() {
  if (liberado()) return true;
  const ok = await pedirPin({ titulo: 'Caderno e kit', texto: m('pin_pedir') });
  if (ok) {
    liberadoAte = Date.now() + ABERTO_MS;
    clearTimeout(timerTrava);
    // passados os 10 min, tranca a tela de verdade (não só na próxima vez que alguém redesenhar)
    timerTrava = setTimeout(trancar, ABERTO_MS);
    avisarTrava();
  }
  return ok;
}
export function trancar() { clearTimeout(timerTrava); timerTrava = null; liberadoAte = 0; avisarTrava(); }
export function aoMudarTrava(fn) { ouvintesTrava.add(fn); return () => ouvintesTrava.delete(fn); }
function avisarTrava() { for (const fn of ouvintesTrava) { try { fn(liberado()); } catch (_) {} } }

// ---------------------------------------------------------------- vitrine
const URL_VITRINE = /^\.\/index\.html\?m=[a-z0-9-]{1,40}&demo=[01]&vitrine=1$/;

function inerteFora(sim) {
  for (const n of document.body.children) {
    if (n.id === 'vitrine' || n.id === 'pin-dlg' || n.id === 'marcos-live') continue;
    if (sim) n.setAttribute('inert', ''); else n.removeAttribute('inert');
  }
}

function aoVoltar() {
  if (ativa) history.pushState({ vitrine: 1 }, '', location.href);
}

export function vitrineAtiva() { return ativa; }

export async function entrarVitrine(src) {
  if (!URL_VITRINE.test(src)) { console.info('[trava] endereço de vitrine recusado', src); return false; }
  if (!(await garantirPin())) return false;
  trancar();
  const v = $('vitrine'), f = $('vitrine-frame');
  if (f.getAttribute('src') !== src) f.setAttribute('src', src);
  v.hidden = false;
  ativa = true;
  document.documentElement.dataset.vitrineMarcos = '1';
  gravarLocal(CHAVE_VITRINE, src);
  inerteFora(true);
  history.pushState({ vitrine: 1 }, '', location.href);
  window.addEventListener('popstate', aoVoltar);
  try { if (document.fullscreenEnabled && !document.fullscreenElement) await v.requestFullscreen({ navigationUI: 'hide' }); } catch (_) { /* sem tela cheia: a trava vale igual */ }
  f.focus();
  return true;
}

export async function sairVitrine() {
  ativa = false;
  window.removeEventListener('popstate', aoVoltar);
  gravarLocal(CHAVE_VITRINE, null);
  inerteFora(false);
  delete document.documentElement.dataset.vitrineMarcos;
  const v = $('vitrine'), f = $('vitrine-frame');
  v.hidden = true;
  f.removeAttribute('src');
  try { if (document.fullscreenElement) await document.exitFullscreen(); } catch (_) {}
  $('marcos-abrir')?.focus();
}

async function pedirSaida() {
  const ok = await pedirPin({ titulo: 'Sair da vitrine', texto: m('pin_pedir') });
  if (ok) await sairVitrine();
  else $('vitrine-frame')?.focus();
}

export function montarTrava() {
  const sair = $('vitrine-sair'), dica = $('vitrine-dica');
  let timer = null;
  let desde = 0;
  const cancelar = () => { clearTimeout(timer); timer = null; sair.dataset.segurando = '0'; dica.hidden = true; };
  sair.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    desde = performance.now();
    sair.dataset.segurando = '1';
    dica.textContent = m('sair_vitrine');
    dica.hidden = false;
    timer = setTimeout(() => { cancelar(); pedirSaida(); }, SEGURAR_MS);
  });
  // celular ocupado (mapa 3D desenhando) pode atrasar o setTimeout: soltar depois de 1,5 s também vale
  sair.addEventListener('pointerup', () => {
    const segurou = timer != null && performance.now() - desde >= SEGURAR_MS;
    cancelar();
    if (segurou) pedirSaida();
  });
  for (const ev of ['pointerleave', 'pointercancel']) sair.addEventListener(ev, cancelar);
  sair.addEventListener('contextmenu', (e) => e.preventDefault());
  // teclado e leitor de tela (Enter/Espaço chegam como click com detail 0): o PIN é a proteção
  sair.addEventListener('click', (e) => { if (e.detail === 0) pedirSaida(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') escondidoDesde = Date.now();
    else if (escondidoDesde && Date.now() - escondidoDesde > ESCONDIDO_MS) trancar();
    else if (liberadoAte && !liberado()) trancar();   // timer atrasado pelo celular dormindo
  });
  // recarregou no meio da demonstração: volta presa na vitrine
  const pendente = lerLocal(CHAVE_VITRINE);
  if (pendente && URL_VITRINE.test(pendente)) {
    const v = $('vitrine'), f = $('vitrine-frame');
    f.setAttribute('src', pendente);
    v.hidden = false;
    ativa = true;
    document.documentElement.dataset.vitrineMarcos = '1';
    inerteFora(true);
    history.pushState({ vitrine: 1 }, '', location.href);
    window.addEventListener('popstate', aoVoltar);
  }
}
