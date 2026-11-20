// marca.js · marca do parceiro por JSON (ARQUITETURA 7.1). Frontend A.
// ?m=<slug> carrega marcas/<slug>.json; sem parâmetro, a última marca válida guardada no aparelho
// (o app instalado abre start_url './' sem ?m= e não pode perder a pousada: pedido do DESIGN.md 12);
// sem nada, padrao.json. Falhou: padrao.json, sem erro na tela. Trocar de parceiro = um JSON novo.

import { T, t, textoDaCasa } from './textos.js';
import { el, icone, linkSeguro, lerLocal, gravarLocal } from './util.js';

const SLUG = /^[a-z0-9-]{1,40}$/;
const COR = /^#[0-9A-Fa-f]{6}$/;
const LOGO = /^\.\/arte\/parceiros\/[a-z0-9][a-z0-9._-]{0,80}\.(png|svg|webp|jpg|jpeg)$/;
const TIPOS_PARCEIRO = new Set(['guia', 'onde-comer', 'hospedagem', 'outro']);
const TINTA = '#FFF4DC';
const CHAVE_LOCAL = 'itaitu:marca';

export const MARCA_PADRAO = Object.freeze({
  versao: 1, slug: 'padrao', nome_app: T.app.nome, parceiro: '', cor: '#C9283E', logo: '',
  ponto_base_id: 'village-serra-do-cruzeiro', whatsapp: '', instagram: '', boas_vindas: '',
  credito: T.app.credito, parceiros: [],
});

// contraste WCAG entre duas cores #RRGGBB
function luminancia(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const texto = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Valida campo a campo; o que não passa cai no valor da padrão. Campos com '_' são nota da equipe.
export function validarMarca(bruta, slugPedido) {
  const b = bruta && typeof bruta === 'object' ? bruta : {};
  const m = { ...MARCA_PADRAO, parceiros: [] };
  m.slug = SLUG.test(b.slug || '') ? b.slug : (slugPedido || 'padrao');
  m.nome_app = texto(b.nome_app, 60) || MARCA_PADRAO.nome_app;
  m.parceiro = texto(b.parceiro, 80);
  if (COR.test(b.cor || '') && contraste(b.cor, TINTA) >= 3) m.cor = b.cor.toUpperCase();
  else if (b.cor) console.info('[marca] cor recusada (formato ou contraste < 3:1 contra o creme):', b.cor);
  m.logo = LOGO.test(b.logo || '') ? b.logo : '';
  m.ponto_base_id = texto(b.ponto_base_id, 80) || '';
  m.whatsapp = linkSeguro(b.whatsapp || '', 'whatsapp');
  m.instagram = linkSeguro(b.instagram || '', 'instagram');
  m.boas_vindas = texto(b.boas_vindas, 400);
  m.credito = texto(b.credito, 40) || T.app.credito;
  for (const p of Array.isArray(b.parceiros) ? b.parceiros : []) {
    const link = linkSeguro(p && p.link, 'https');
    if (!p || !texto(p.nome) || !TIPOS_PARCEIRO.has(p.tipo) || !link) { console.info('[marca] parceiro ignorado', p && p.nome); continue; }
    m.parceiros.push({ nome: texto(p.nome, 80), tipo: p.tipo, link, ponto_id: texto(p.ponto_id, 80) || null });
  }
  return m;
}

async function buscar(slug) {
  try {
    const r = await fetch(`./marcas/${slug}.json`);
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; }
}

// Slugs que existem (marcas/indice.json, no pré-cache). Só se busca <slug>.json listado: um QR ou link
// de parceiro digitado errado cai na padrão sem requisição 404. Sem índice (falha de rede antes do
// pré-cache), devolve null e o app tenta o arquivo como antes.
let indice = null;
async function slugsConhecidos() {
  if (!indice) {
    indice = (async () => {
      try {
        const r = await fetch('./marcas/indice.json');
        const j = r.ok ? await r.json() : null;
        const lista = Array.isArray(j?.marcas) ? j.marcas.map((x) => x && x.slug).filter((x) => SLUG.test(x || '')) : null;
        return lista && lista.length ? new Set(lista) : null;
      } catch (_) { return null; }
    })();
  }
  return indice;
}

export async function carregarMarca(params, { lembrar = true } = {}) {
  const pedido = params.get('m');
  const conhecidos = await slugsConhecidos();
  const existe = (s) => !!s && SLUG.test(s) && (!conhecidos || conhecidos.has(s));
  let slug = existe(pedido) ? pedido : null;
  if (pedido && !slug) console.info('[marca] marca fora do índice, usando a padrão:', pedido.slice(0, 40));
  if (!slug && !pedido) {
    const salvo = lerLocal(CHAVE_LOCAL);
    if (existe(salvo)) slug = salvo;
  }
  slug = slug || 'padrao';
  let bruta = await buscar(slug);
  if (!bruta && slug !== 'padrao') { console.info('[marca] marca não carregou, usando a padrão:', slug); slug = 'padrao'; bruta = await buscar('padrao'); }
  const marca = validarMarca(bruta, slug);
  if (lembrar && pedido && bruta && slug === pedido) gravarLocal(CHAVE_LOCAL, slug === 'padrao' ? null : slug);
  return marca;
}

// ponto_base_id inexistente nos dados -> vila-de-itaitu (7.1)
export function conferirBase(marca, pontos) {
  const ids = new Set(pontos.features.map((f) => f.properties.id));
  if (!ids.has(marca.ponto_base_id)) marca.ponto_base_id = 'vila-de-itaitu';
  return marca;
}

// "Chamar um guia": 1º parceiro tipo 'guia'; senão info.guias.link (6.3)
export function linkGuia(marca, info) {
  const g = (marca?.parceiros || []).find((p) => p.tipo === 'guia');
  return (g && g.link) || linkSeguro(info?.guias?.link || '', 'https') || '';
}

export function aplicarMarca(marca) {
  const raiz = document.documentElement;
  raiz.style.setProperty('--cor-parceiro', marca.cor);
  raiz.dataset.marca = marca.slug;
  document.title = textoDaCasa('meta.titulo_marca', marca);
  const nome = document.getElementById('marca-nome');
  if (nome) nome.textContent = marca.nome_app;
  const cortesia = document.getElementById('marca-cortesia');
  if (cortesia) { const c = textoDaCasa('marca.cortesia', marca); cortesia.textContent = c; cortesia.hidden = !c; }
  for (const id of ['marca-credito', 'marca-credito-painel']) { const n = document.getElementById(id); if (n) n.textContent = marca.credito; }
  const slot = document.getElementById('marca-logo');
  if (slot) {
    slot.replaceChildren();
    slot.hidden = !marca.logo;
    if (marca.logo) {
      const img = el('img', { class: 'topo__logo', src: marca.logo, alt: marca.parceiro || marca.nome_app, width: 120, height: 30, decoding: 'async' });
      img.addEventListener('error', () => { slot.hidden = true; }, { once: true });
      slot.append(img);
    }
  }
  const boas = document.getElementById('boas-vindas');
  if (boas) { boas.textContent = marca.boas_vindas; boas.hidden = !marca.boas_vindas; }
}

// Link externo: na vitrine (iframe do marcos.html) fica desligado com aviso; sem sinal, avisa antes.
function linkExterno({ href, textoBotao, rotulo, iconeId, classe = 'botao botao--linha', avisar, vitrine }) {
  const a = el('a', { class: classe, href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': rotulo || null },
    iconeId ? icone(iconeId) : null, el('span', {}, textoBotao));
  if (vitrine) {
    a.setAttribute('aria-disabled', 'true');
    a.dataset.vitrine = '1';
  }
  a.addEventListener('click', (e) => {
    if (vitrine) { e.preventDefault(); avisar?.(T.demo.vitrine); return; }
    if (navigator.onLine === false) { e.preventDefault(); avisar?.(T.erros.link_offline); }
  });
  return a;
}

// Botões que geram negócio para o parceiro: Falar com a recepção, Instagram, Chamar um guia, Onde comer.
export function montarBotoesMarca(alvo, marca, info, { avisar, vitrine = false, irParaPonto } = {}) {
  if (!alvo) return;
  alvo.replaceChildren();
  const botoes = el('div', { class: 'marca-botoes__linha' });
  if (marca.whatsapp) botoes.append(linkExterno({ href: marca.whatsapp, textoBotao: T.marca.falar, rotulo: T.marca.falar_rotulo, iconeId: 'i-whatsapp', classe: 'botao botao--marca', avisar, vitrine }));
  const guia = linkGuia(marca, info);
  if (guia) botoes.append(linkExterno({ href: guia, textoBotao: T.tabuas.chamar_guia, iconeId: 'i-guia', avisar, vitrine }));
  if (marca.instagram) botoes.append(linkExterno({ href: marca.instagram, textoBotao: T.marca.instagram, avisar, vitrine }));
  if (botoes.childElementCount) alvo.append(botoes);

  // grupos de parceiros por tipo (o guia já está no botão acima)
  const grupos = new Map();
  for (const p of marca.parceiros) {
    if (p.tipo === 'guia' && p.link === guia) continue;
    if (!grupos.has(p.tipo)) grupos.set(p.tipo, []);
    grupos.get(p.tipo).push(p);
  }
  for (const [tipo, lista] of grupos) {
    const titulo = T.marca.tipos[tipo] || T.marca.tipos.outro;
    const det = el('details', { class: 'marca-grupo' },
      el('summary', { class: 'marca-grupo__titulo' }, tipo === 'onde-comer' ? icone('i-comer') : null, el('span', {}, titulo)));
    const ul = el('ul', { class: 'marca-grupo__lista' });
    for (const p of lista) {
      const li = el('li', {}, linkExterno({ href: p.link, textoBotao: p.nome, rotulo: t('marca.abrir', { nome: p.nome }), avisar, vitrine }));
      if (p.ponto_id && irParaPonto) li.append(el('button', { class: 'botao botao--texto', type: 'button', onclick: () => irParaPonto(p.ponto_id) }, T.marca.ver_no_mapa));
      ul.append(li);
    }
    det.append(ul, el('p', { class: 'nota' }, T.marca.precisa_sinal));
    alvo.append(det);
  }
}
