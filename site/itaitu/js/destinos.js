// destinos.js · lista de destinos (as 7 da placa primeiro), detalhe de cada um e o voo até o ponto.
// Frontend A. A lista daqui é simples e limpa; o frontend B põe as tábuas em #hora-tabuas ouvindo
// itaitu:destinos. Quando as tábuas chegam, a lista simples se recolhe sozinha (MutationObserver).
// Quem escolhe um destino emite itaitu:destino-escolhido; este módulo ouve, voa e põe o alvo do GPS.

import { T, t, linhaDaPlaca } from './textos.js';
import { el, icone, linkSeguro } from './util.js';
import { pontoPorId, trilhaDoDestino } from './dados.js';
import { linkGuia } from './marca.js';
import { irPara } from './mapa.js';
import { definirAlvo, montarPerfil } from './rota.js';
import * as gps from './gps.js';

let ctx = null;
let voos = null;
const $ = (id) => document.getElementById(id);

function carregarVoos() {
  if (!voos) voos = import('./voos.js').catch((e) => { console.info('[destinos] voos.js ainda não existe, uso flyTo', e && e.message); return null; });
  return voos;
}

export function montarDestinos(contexto) {
  ctx = contexto;
  renderizarLista();
  vigiarTabuas();
  document.addEventListener('itaitu:destino-escolhido', (e) => escolhido(e.detail || {}));
  $('destino-fechar')?.addEventListener('click', () => fecharDetalhe());
  ctx.emit('itaitu:destinos', { pontos: ctx.dados.pontos });
}

// ---------------------------------------------------------------- lista simples
const ESTADO_TEXTO = () => ({ confirmada: T.tabuas.confirmada, aproximada: T.tabuas.aproximada, 'sem-coordenada': T.tabuas.sem_coordenada });

export function renderizarLista() {
  const alvo = $('destinos-lista');
  if (!alvo) return;
  const feats = ctx.dados.pontos.features;
  alvo.replaceChildren();
  if (!feats.length) { alvo.append(el('p', { class: 'vazio' }, T.tabuas.vazia)); return; }
  const grupos = [
    [T.destinos.grupo_placa, feats.filter((f) => f.properties.grupo === 'placa')],
    [T.destinos.grupo_outros, feats.filter((f) => f.properties.grupo !== 'placa')],
  ];
  for (const [titulo, lista] of grupos) {
    if (!lista.length) continue;
    const id = `grupo-${titulo === T.destinos.grupo_placa ? 'placa' : 'outros'}`;
    const ul = el('ul', { class: 'destinos', 'aria-labelledby': id });
    for (const f of lista) ul.append(itemDestino(f));
    alvo.append(el('h3', { class: 'destinos__grupo', id }, titulo), ul);
    if (titulo === T.destinos.grupo_placa) alvo.append(el('p', { class: 'nota' }, T.tabuas.da_placa));
  }
}

function itemDestino(f) {
  const p = f.properties;
  const placa = linhaDaPlaca(p);
  const b = el('button', { class: 'destino', type: 'button', 'data-estado': p._estado, 'data-ponto': p.id, onclick: () => ctx.emit('itaitu:destino-escolhido', { id: p.id, origem: 'lista' }) },
    el('span', { class: 'destino__nome' }, p.nome),
    placa ? el('span', { class: 'destino__placa' }, placa) : null,
    el('span', { class: 'destino__estado' }, ESTADO_TEXTO()[p._estado]));
  return el('li', {}, b);
}

function vigiarTabuas() {
  const tabuas = $('hora-tabuas');
  const painel = $('painel-destinos');
  if (!tabuas || !painel) return;
  const aplicar = () => { painel.dataset.tabuas = tabuas.childElementCount ? '1' : '0'; };
  new MutationObserver(aplicar).observe(tabuas, { childList: true });
  aplicar();
}

// ---------------------------------------------------------------- escolha
async function escolhido({ id, origem }) {
  if (!id || origem === 'demo') return;
  const f = pontoPorId(ctx.dados, id);
  if (!f) return;
  if (origem === 'mapa' || origem === 'busca') ctx.abrirPainel?.('painel-destinos', { foco: false });
  mostrarDetalhe(f);
  if (!f.geometry) return;
  definirAlvo({ ponto: f, trilha: trilhaDoDestino(ctx.dados, id) });
  ctx.layout?.();
  await voar(f);
}

async function voar(f) {
  const m = await carregarVoos();
  if (m && typeof m.voarPara === 'function') {
    try { await m.voarPara(f.properties.id); return; } catch (e) { console.info('[destinos] voarPara falhou, uso flyTo', e && e.message); }
  }
  irPara(f.geometry.coordinates, { zoom: 14.6, pitch: 58 });
}

// ---------------------------------------------------------------- detalhe
function linha(rotulo, valor, classe = '') {
  if (!valor) return null;
  return el('div', { class: `destino-dado ${classe}` }, el('dt', {}, rotulo), el('dd', {}, valor));
}

function infoDoPonto(lista, id) {
  return (Array.isArray(lista) ? lista : []).filter((x) => Array.isArray(x.pontos) && x.pontos.includes(id));
}

function textoComQuando(item) {
  const partes = [item.texto];
  if (item.quando) partes.push(t('seguranca.quando', { quando: item.quando }));
  if (item.desatualizado) partes.push(T.seguranca.desatualizado);
  else if (item.confirmado === false) partes.push(T.seguranca.nao_confirmado);
  if (item.conferir) partes.push(item.conferir);
  return partes.filter(Boolean).join(' · ');
}

function mostrarDetalhe(f) {
  const box = $('destino-detalhe');
  const corpo = $('destino-corpo');
  if (!box || !corpo) return;
  const p = f.properties;
  const info = ctx.dados.info || {};
  const carro = [p.carro_km != null ? `${String(p.carro_km).replace('.', ',')} km` : null, p.carro_tempo].filter(Boolean).join(' · ');
  const trilha = [p.trilha_km != null ? `${String(p.trilha_km).replace('.', ',')} km` : null, p.trilha_tempo].filter(Boolean).join(' · ');
  const taxas = infoDoPonto(info.taxas, p.id);
  const horarios = infoDoPonto(info.horarios, p.id);
  const guia = linkGuia(ctx.marca, info);
  const vitrine = ctx.params.get('vitrine') === '1';

  const estadoTexto = { confirmada: T.tabuas.confirmada, aproximada: T.tabuas.aproximada, 'sem-coordenada': T.tabuas.sem_coordenada }[p._estado];
  const dl = el('dl', { class: 'destino-dados' },
    linha(T.destinos.carro, carro ? `${carro} · ${T.hora.carro_da_placa}` : null),
    linha(T.destinos.trilha, trilha),
    linha(T.destinos.nivel, p.nivel),
    taxas.length ? linha(T.destinos.taxa, taxas.map(textoComQuando).join(' / ')) : linha(T.destinos.taxa, null),
    linha(T.destinos.horario, horarios.length ? horarios.map(textoComQuando).join(' / ') : (p.horario || null)),
    linha(T.destinos.riscos, p.riscos, 'destino-dado--risco'),
    linha(T.destinos.confianca, T.tabuas.confianca[p.confianca] || T.tabuas.confianca[p._estado] || null),
    Array.isArray(p.outros_nomes) && p.outros_nomes.length ? linha(T.destinos.notas, t('destinos.outros_nomes', { nomes: p.outros_nomes.join(', ') })) : null,
  );

  const acoes = el('div', { class: 'linha-botoes' });
  if (f.geometry) {
    acoes.append(
      el('button', { class: 'botao botao--marca', type: 'button', onclick: () => { definirAlvo({ ponto: f, trilha: trilhaDoDestino(ctx.dados, p.id) }); gps.ligar(); ctx.fecharPaineis?.(); } }, icone('i-gps'), el('span', {}, T.tabuas.seguir_ate)),
      el('button', { class: 'botao botao--linha', type: 'button', onclick: () => { ctx.fecharPaineis?.(); voar(f); } }, T.tabuas.ver_no_mapa));
  }
  if (guia) {
    const a = el('a', { class: p._estado === 'sem-coordenada' ? 'botao botao--marca' : 'botao botao--linha', href: linkSeguro(guia), target: '_blank', rel: 'noopener noreferrer' }, icone('i-guia'), el('span', {}, T.tabuas.chamar_guia));
    a.addEventListener('click', (e) => {
      if (vitrine) { e.preventDefault(); ctx.avisar?.(T.demo.vitrine); }
      else if (navigator.onLine === false) { e.preventDefault(); ctx.avisar?.(T.erros.link_offline); }
    });
    if (vitrine) a.setAttribute('aria-disabled', 'true');
    acoes.append(a);
  }

  const perfilEl = el('div', { class: 'perfil' });
  const trilhaPe = trilhaDoDestino(ctx.dados, p.id);
  const fonte = p.fonte ? el('details', { class: 'destino-fonte' }, el('summary', {}, T.tabuas.fonte.replace(': {fonte}', '')), el('p', {}, p.fonte)) : null;

  corpo.replaceChildren(...[
    el('h3', { class: 'destino-detalhe__titulo', id: 'destino-titulo', tabindex: '-1' }, p.nome),
    el('p', { class: 'destino-detalhe__estado', 'data-estado': p._estado }, estadoTexto),
    p._estado === 'aproximada' ? el('p', { class: 'aviso-honesto' }, T.tabuas.aproximada_detalhe) : null,
    p._estado === 'sem-coordenada' ? el('p', { class: 'aviso-honesto' }, T.destinos.so_na_lista) : null,
    linhaDaPlaca(p) ? el('p', { class: 'destino-detalhe__placa' }, linhaDaPlaca(p)) : null,
    dl,
    acoes,
    p._estado === 'sem-coordenada' && guia ? el('p', { class: 'nota' }, T.tabuas.chamar_guia_dica) : null,
    trilhaPe ? perfilEl : null,
    fonte,
  ].filter(Boolean));
  box.hidden = false;
  box.dataset.ponto = p.id;
  $('painel-destinos')?.setAttribute('data-detalhe', '1');
  if (trilhaPe) montarPerfil(perfilEl, trilhaPe);
  requestAnimationFrame(() => $('destino-titulo')?.focus({ preventScroll: false }));
  ctx.anunciar?.(`${p.nome}. ${estadoTexto}`);
  // marca o item da lista como atual
  for (const b of document.querySelectorAll('#destinos-lista .destino')) b.toggleAttribute('aria-current', b.dataset.ponto === p.id);
}

export function fecharDetalhe({ foco = true } = {}) {
  const box = $('destino-detalhe');
  if (!box || box.hidden) return;
  const id = box.dataset.ponto;
  box.hidden = true;
  $('painel-destinos')?.setAttribute('data-detalhe', '0');
  const volta = document.querySelector(`#destinos-lista .destino[data-ponto="${CSS.escape(id || '')}"], #hora-tabuas [data-ponto="${CSS.escape(id || '')}"] button`);
  if (foco) volta?.focus();
  ctx.layout?.();
}

