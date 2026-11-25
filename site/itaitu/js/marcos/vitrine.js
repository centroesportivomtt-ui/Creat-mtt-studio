// vitrine.js · vitrine de parceiros (frontend C): troca de marca, demonstração presa na trava, QR do link
// do parceiro e placa da recepção. As marcas vêm de ../../marcas/indice.json; cada uma passa pelo mesmo
// validarMarca do app público (marca.js), então o que aparece aqui é o que o hóspede vai ver.

import { validarMarca, contraste } from '../marca.js';
import { el, linkSeguro } from '../util.js';
import { $, m, avisar, anunciar, lerConfig, gravarConfig, compartilharOuBaixar, hoje } from './comum.js';
import { desenharQR, pngDoCanvas } from './qr.js';
import { montarPlacaSVG, placaPNG } from './placa.js';
import { entrarVitrine } from './trava.js';

export const URL_PADRAO = 'https://centroesportivomtt-ui.github.io/Creat-mtt-studio/itaitu/';
const SLUG = /^[a-z0-9-]{1,40}$/;

let marcas = [];             // [{ slug, nome, marca }]
let atual = null;
let urlBase = URL_PADRAO;
let ultimaPlaca = null;      // { svg, png, slug }

export function urlValida(u) {
  const s = linkSeguro(String(u || '').trim(), 'https');
  return s && s.endsWith('/') && !/[?#]/.test(s) ? s : '';
}

export function linkDoParceiro(base, slug) {
  return slug && slug !== 'padrao' ? `${base}?m=${slug}` : base;
}

async function lerJSON(url) {
  try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch (_) { return null; }
}

async function carregarMarcas() {
  const indice = await lerJSON('./marcas/indice.json');
  const lista = (indice && Array.isArray(indice.marcas) ? indice.marcas : []).filter((x) => x && SLUG.test(x.slug || ''));
  if (!lista.some((x) => x.slug === 'padrao')) lista.unshift({ slug: 'padrao', nome: 'Trilhas de Itaitu (padrão)' });
  const saida = [];
  for (const x of lista) {
    const bruta = await lerJSON(`./marcas/${x.slug}.json`);
    if (!bruta) { console.info('[vitrine] marca não carregou', x.slug); continue; }
    saida.push({ slug: x.slug, nome: String(x.nome || x.slug).slice(0, 80), marca: validarMarca(bruta, x.slug) });
  }
  return saida;
}

function ficha(marca) {
  const pend = [];
  if (!marca.logo) pend.push('logo');
  if (!marca.whatsapp) pend.push('WhatsApp');
  if (!marca.instagram) pend.push('Instagram');
  const guia = marca.parceiros.find((p) => p.tipo === 'guia');
  return [
    el('p', { class: 'm-ficha__nome' }, el('span', { class: 'm-ficha__cor', style: `background:${marca.cor}`, 'aria-hidden': 'true' }), marca.parceiro || marca.nome_app),
    el('p', { class: 'nota' }, `Nome no app: ${marca.nome_app} · cor ${marca.cor} (${contraste(marca.cor, '#FFF4DC').toFixed(1).replace('.', ',')}:1 no creme)`),
    el('p', { class: 'nota' }, guia ? `Chamar um guia leva para: ${guia.nome}` : 'Chamar um guia leva para o link da ACAGI do info.json.'),
    pend.length && marca.slug !== 'padrao' ? el('p', { class: 'nota' }, `Falta o parceiro autorizar: ${pend.join(', ')}.`) : null,
  ];
}

function desenharAtual() {
  if (!atual) return;
  const url = linkDoParceiro(urlBase, atual.slug);
  $('vitrine-ficha').replaceChildren(...ficha(atual.marca).filter(Boolean));
  $('vitrine-url').textContent = url;
  const c = $('vitrine-qr');
  desenharQR(c, url, { lado: 330 });
  c.dataset.url = url;
  c.setAttribute('aria-label', `QR code do link ${url}`);
  document.documentElement.style.setProperty('--marcos-cor-vitrine', atual.marca.cor);
  $('placa-previa').hidden = true;
  $('placa-status').textContent = '';
  ultimaPlaca = null;
}

function srcDemo(slug, demo) { return `./index.html?m=${slug}&demo=${demo ? 1 : 0}&vitrine=1`; }

async function gerarPlaca() {
  if (!atual) return;
  const st = $('placa-status');
  st.textContent = m('placa_gerando');
  const botao = $('placa-gerar');
  botao.disabled = true;
  try {
    const url = linkDoParceiro(urlBase, atual.slug);
    const svg = await montarPlacaSVG({ marca: atual.marca, url });
    const { png, largura, altura } = await placaPNG(svg);
    ultimaPlaca = { svg, png, slug: atual.slug };
    const slot = $('placa-img-slot');
    const antiga = slot.querySelector('img');
    if (antiga?.src) URL.revokeObjectURL(antiga.src);
    slot.replaceChildren(el('img', { src: URL.createObjectURL(png), alt: `Prévia da placa da recepção de ${atual.marca.parceiro || atual.marca.nome_app}, com o QR para ${url}`, width: 300, height: 400, decoding: 'async' }));
    $('placa-previa').hidden = false;
    st.textContent = m('placa_pronta', { px: `${largura} x ${altura}` });
  } catch (e) {
    console.info('[vitrine] placa falhou', e && e.message);
    st.textContent = m('placa_falhou');
  } finally {
    botao.disabled = false;
  }
}

const nomeArquivo = (slug, ext, tipo) => `itaitu-${tipo}-${slug}-${hoje()}.${ext}`;

export async function montarVitrine() {
  urlBase = urlValida(await lerConfig('url-base', URL_PADRAO)) || URL_PADRAO;
  const sel = $('vitrine-marca');
  marcas = await carregarMarcas();
  sel.replaceChildren(...marcas.map((x) => el('option', { value: x.slug }, x.nome)));
  const guardada = await lerConfig('vitrine-marca', null);
  atual = marcas.find((x) => x.slug === guardada) || marcas.find((x) => x.slug !== 'padrao') || marcas[0] || null;
  if (atual) sel.value = atual.slug;
  sel.addEventListener('change', () => {
    atual = marcas.find((x) => x.slug === sel.value) || atual;
    gravarConfig('vitrine-marca', atual.slug).catch(() => {});
    desenharAtual();
    anunciar(`Marca: ${atual.nome}`);
  });
  desenharAtual();

  $('vitrine-demo').addEventListener('click', () => atual && entrarVitrine(srcDemo(atual.slug, true)));
  $('vitrine-livre').addEventListener('click', () => atual && entrarVitrine(srcDemo(atual.slug, false)));
  $('vitrine-qr-png').addEventListener('click', async () => {
    if (!atual) return;
    const c = document.createElement('canvas');
    desenharQR(c, linkDoParceiro(urlBase, atual.slug), { lado: 1200 });
    await compartilharOuBaixar(await pngDoCanvas(c), nomeArquivo(atual.slug, 'png', 'qr'), 'QR do parceiro');
  });
  $('vitrine-copiar').addEventListener('click', async () => {
    const url = $('vitrine-url').textContent;
    try { await navigator.clipboard.writeText(url); avisar(m('link_copiado')); }
    catch (_) { const r = document.createRange(); r.selectNodeContents($('vitrine-url')); getSelection().removeAllRanges(); getSelection().addRange(r); }
  });
  $('placa-gerar').addEventListener('click', gerarPlaca);
  $('placa-png').addEventListener('click', () => ultimaPlaca && compartilharOuBaixar(ultimaPlaca.png, nomeArquivo(ultimaPlaca.slug, 'png', 'placa'), 'Placa da recepção'));
  $('placa-svg').addEventListener('click', () => ultimaPlaca && compartilharOuBaixar(new Blob([ultimaPlaca.svg], { type: 'image/svg+xml' }), nomeArquivo(ultimaPlaca.slug, 'svg', 'placa'), 'Placa da recepção'));

  // ajustes: endereço base
  const campo = $('url-base'), erro = $('url-erro');
  campo.value = urlBase;
  $('url-salvar').addEventListener('click', async () => {
    const v = urlValida(campo.value);
    if (!v) { erro.textContent = m('url_invalida'); erro.hidden = false; campo.focus(); return; }
    erro.hidden = true;
    urlBase = v;
    await gravarConfig('url-base', v);
    desenharAtual();
    avisar(m('url_salva'));
  });
  $('url-padrao').addEventListener('click', async () => {
    urlBase = URL_PADRAO; campo.value = URL_PADRAO; erro.hidden = true;
    await gravarConfig('url-base', URL_PADRAO);
    desenharAtual();
    avisar(m('url_salva'));
  });
}
