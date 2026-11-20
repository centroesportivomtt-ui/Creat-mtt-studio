// caderno.js · caderno de vendas offline (store 'caderno', ARQUITETURA 7.7). Fica SÓ no aparelho.
// { id, negocio, status: visitar|visitado|interessado|proposta|fechado, nota, proximo_passo, data, atualizado_em }
// Exporta CSV com ';' (o Excel em português abre direto), BOM UTF-8 e proteção contra fórmula
// (célula que começa com = + - @ ganha um apóstrofo na frente).

import { el } from '../util.js';
import * as banco from '../banco.js';
import { $, m, avisar, hoje, dataBR, compartilharOuBaixar } from './comum.js';

export const STATUS = ['visitar', 'visitado', 'interessado', 'proposta', 'fechado'];
const ROTULO = { visitar: 'visitar', visitado: 'visitado', interessado: 'interessado', proposta: 'proposta', fechado: 'fechado' };
let filtro = 'todos';
let podeVer = () => false;
let aoTrancado = () => {};
// true se pode seguir; se a trava fechou, redesenha a aba e avisa
function aberto() { if (podeVer()) return true; aoTrancado(); return false; }

export function celulaCSV(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function gerarCSV(lista) {
  const cab = ['negocio', 'status', 'nota', 'proximo_passo', 'data', 'atualizado_em'];
  const linhas = [cab.join(';'), ...lista.map((r) => cab.map((k) => celulaCSV(r[k])).join(';'))];
  return `\uFEFF${linhas.join('\r\n')}\r\n`;
}

export function validarNegocio(r) {
  return !!(r && typeof r.negocio === 'string' && r.negocio.trim() && STATUS.includes(r.status));
}

async function todos() {
  try {
    return (await banco.listar('caderno')).sort((a, b) =>
      STATUS.indexOf(a.status) - STATUS.indexOf(b.status) || String(a.data || '9').localeCompare(String(b.data || '9')) || a.negocio.localeCompare(b.negocio, 'pt-BR'));
  } catch (_) { return []; }
}

function filtros(lista) {
  const alvo = $('caderno-filtros');
  const contagem = (s) => (s === 'todos' ? lista.length : lista.filter((r) => r.status === s).length);
  alvo.replaceChildren(...['todos', ...STATUS].map((s) => el('button', {
    class: 'm-chip', type: 'button', 'aria-pressed': filtro === s ? 'true' : 'false',
    onclick: () => { filtro = s; listar(); },
  }, `${s === 'todos' ? 'todos' : ROTULO[s]} (${contagem(s)})`)));
}

export async function listar() {
  const ul = $('caderno-lista');
  if (!ul || !podeVer()) return;
  const lista = await todos();
  filtros(lista);
  const vis = filtro === 'todos' ? lista : lista.filter((r) => r.status === filtro);
  ul.replaceChildren();
  if (!vis.length) { ul.append(el('li', { class: 'vazio' }, m('caderno_vazio'))); return; }
  for (const r of vis) {
    ul.append(el('li', { class: 'm-item', dataset: { status: r.status } },
      el('p', { class: 'm-item__nome' }, r.negocio),
      el('p', { class: 'm-item__info' }, [ROTULO[r.status], r.data ? dataBR(r.data) : null, r.proximo_passo || null].filter(Boolean).join(' · ')),
      r.nota ? el('p', { class: 'nota' }, r.nota) : null,
      el('div', { class: 'linha-botoes' }, el('button', { class: 'botao botao--linha', type: 'button', onclick: () => editar(r) }, 'Editar'))));
  }
}

function editar(r = null) {
  const dlg = $('caderno-dlg');
  const sel = $('caderno-status');
  if (!sel.options.length) for (const s of STATUS) sel.append(el('option', { value: s }, ROTULO[s]));
  $('caderno-titulo').textContent = r ? 'Editar negócio' : 'Novo negócio';
  $('caderno-negocio').value = r?.negocio || '';
  sel.value = r?.status || 'visitar';
  $('caderno-nota').value = r?.nota || '';
  $('caderno-passo').value = r?.proximo_passo || '';
  $('caderno-data').value = r?.data || hoje();
  $('caderno-erro').hidden = true;
  $('caderno-apagar').hidden = !r;
  $('caderno-confirma').hidden = true;
  $('caderno-cancelar').onclick = () => dlg.close();
  $('caderno-apagar').onclick = () => { $('caderno-confirma').hidden = false; $('caderno-apagar-sim').focus(); };
  $('caderno-apagar-nao').onclick = () => { $('caderno-confirma').hidden = true; };
  $('caderno-apagar-sim').onclick = async () => { if (!aberto()) { dlg.close(); return; } await banco.apagar('caderno', r.id); dlg.close(); await listar(); };
  $('caderno-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!aberto()) { dlg.close(); return; }
    const registro = {
      id: r?.id || `negocio-${Date.now().toString(36)}`,
      negocio: $('caderno-negocio').value.trim().slice(0, 80),
      status: sel.value,
      nota: $('caderno-nota').value.trim().slice(0, 600),
      proximo_passo: $('caderno-passo').value.trim().slice(0, 140),
      data: /^\d{4}-\d{2}-\d{2}$/.test($('caderno-data').value) ? $('caderno-data').value : '',
      atualizado_em: new Date().toISOString(),
    };
    if (!validarNegocio(registro)) { $('caderno-erro').textContent = m('negocio_obrigatorio'); $('caderno-erro').hidden = false; $('caderno-negocio').focus(); return; }
    await banco.gravar('caderno', registro);
    dlg.close();
    await listar();
  };
  dlg.showModal();
  $('caderno-negocio').focus();
}

async function exportarCSV() {
  if (!aberto()) return;
  const lista = await todos();
  if (!lista.length) { avisar(m('caderno_vazio')); return; }
  await compartilharOuBaixar(new Blob([gerarCSV(lista)], { type: 'text/csv;charset=utf-8' }), `caderno-de-vendas-${hoje()}.csv`, 'Caderno de vendas');
}

export function montarCaderno({ liberado, trancado }) {
  podeVer = liberado;
  if (trancado) aoTrancado = trancado;
  $('caderno-novo').addEventListener('click', () => aberto() && editar(null));
  $('caderno-csv').addEventListener('click', exportarCSV);
}
