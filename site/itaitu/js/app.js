// app.js · casco do app público Trilhas de Itaitu (e base do marcos.html). Frontend A, Pixel, 20/11/2026.
// Boot (ARQUITETURA 2): o mapa NUNCA espera o show. Ele nasce na luz do minuto assim que o recorte e as
// atribuições chegam; marca e dados entram por cima; luz.js e hora/index.js só depois do 'load',
// cada um em try/catch (console.info, nunca console.error). O app funciona se o recurso-assinatura falhar.

import { T, t } from './textos.js';
import { utcDe } from './motor/nucleo.js';
import { el, ganchoDeTeste, emVitrine } from './util.js';
import { aplicarPreferencias, economiaLigada, montarEconomia } from './economia.js';
import { carregarDados } from './dados.js';
import { carregarMarca, aplicarMarca, conferirBase, montarBotoesMarca, linkGuia } from './marca.js';
import { criarMapa, porDados, ligarControles, corDaMarca, ajustarMargens, irPara } from './mapa.js';
import { iniciarGPS } from './gps.js';
import { iniciarRota } from './rota.js';
import { montarDestinos, fecharDetalhe } from './destinos.js';
import { montarBusca } from './busca.js';
import { montarGravador } from './gravador.js';
import { montarSOS } from './sos.js';
import { montarArmazenamento } from './armazenamento.js';

// Recorte de Itaitu (ARQUITETURA 7.0). dados/recorte.json, quando existir, manda.
export const RECORTE_PADRAO = Object.freeze({
  versao: 1, nome: 'Itaitu', bbox: [-40.60, -11.42, -40.40, -11.26],
  centro: [-40.4950, -11.3400], zoom: 13, pitch: 60, bearing: 250,
  fuso_min: -180, tiles_z: [8, 14],
  dem: { z: 12, x0: 1586, x1: 1588, y0: 2176, y1: 2178 },
});

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
// Parâmetros que desligam coisa ou mudam a hora só valem onde devem (util.js). Fora disso saem daqui,
// e todo módulo que lê ctx.params (sos, destinos, tábuas, cartão, armazenamento) nunca os vê.
if (!ganchoDeTeste()) { params.delete('agora'); params.delete('sw'); }
if (!emVitrine(params)) params.delete('vitrine');
const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)');

// ---------------------------------------------------------------- relógio (?agora= anda em tempo real)
let deslocamentoMs = 0;
(function lerAgora() {
  const a = params.get('agora');
  const m = a && /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(a);
  if (!m) return;
  const alvo = utcDe(m[1], Number(m[2]) * 60 + Number(m[3]));
  if (Number.isFinite(alvo)) deslocamentoMs = alvo - Date.now();
})();

// ---------------------------------------------------------------- window.Itaitu (ARQUITETURA 2)
const Itaitu = {
  app: document.documentElement.dataset.app === 'marcos' || /marcos(\.html)?$/.test(location.pathname) ? 'marcos' : 'publico',
  params: new URLSearchParams(params),
  map: null,
  recorte: RECORTE_PADRAO,
  dados: { pontos: { type: 'FeatureCollection', features: [] }, trilhas: { type: 'FeatureCollection', features: [] }, base: { type: 'FeatureCollection', features: [] }, info: {} },
  marca: null,
  motor: null,
  agora: () => new Date(Date.now() + deslocamentoMs),
  economia: () => economiaLigada(),
  reduzMovimento: () => !!reduzido?.matches || economiaLigada(),
  on(nome, fn) { const h = (e) => fn(e.detail, e); document.addEventListener(nome, h); return () => document.removeEventListener(nome, h); },
  emit(nome, detalhe) { document.dispatchEvent(new CustomEvent(nome, { detail: detalhe })); },
  // utilidades da casca para os módulos (não fazem parte do contrato 2; os outros podem usar)
  avisar,
  anunciar,
  abrirPainel,
  fecharPaineis,
  layout,
};
window.Itaitu = Itaitu;

// ---------------------------------------------------------------- avisos
let avisoTimer = null;
function avisar(texto, { acao } = {}) {
  const a = $('aviso');
  if (!a || !texto) return;
  clearTimeout(avisoTimer);
  const filhos = [el('span', { class: 'aviso__texto' }, texto)];
  if (acao) filhos.push(el('button', { class: 'botao botao--linha', type: 'button', onclick: () => { a.hidden = true; acao.fazer(); } }, acao.texto));
  a.replaceChildren(...filhos);
  a.hidden = false;
  avisoTimer = setTimeout(() => { a.hidden = true; }, acao ? 9000 : 5000);
}
function anunciar(texto) {
  const l = $('app-live');
  if (!l || !texto) return;
  l.textContent = '';
  setTimeout(() => { l.textContent = texto; }, 30);
}

// ---------------------------------------------------------------- painéis (folhas)
const PAINEIS = ['painel-destinos', 'painel-gravar', 'painel-info'];
let painelAberto = null;
let gatilho = null;

function botaoDoPainel(id) { return document.querySelector(`[aria-controls="${id}"]`); }

function abrirPainel(id, { foco = true } = {}) {
  for (const p of PAINEIS) if (p !== id) fecharUm(p);
  const painel = $(id);
  if (!painel) return;
  painel.hidden = false;
  painelAberto = id;
  const b = botaoDoPainel(id);
  b?.setAttribute('aria-expanded', 'true');
  if (foco) { gatilho = document.activeElement; painel.querySelector('.folha__titulo')?.focus(); }
  document.documentElement.dataset.painel = id;
  layout();
}
function fecharUm(id) {
  const painel = $(id);
  if (!painel || painel.hidden) return;
  painel.hidden = true;
  botaoDoPainel(id)?.setAttribute('aria-expanded', 'false');
}
function fecharPaineis({ devolverFoco = false } = {}) {
  for (const p of PAINEIS) fecharUm(p);
  painelAberto = null;
  delete document.documentElement.dataset.painel;
  if (devolverFoco && gatilho && document.contains(gatilho)) gatilho.focus();
  layout();
}

function ligarPaineis() {
  for (const id of PAINEIS) {
    const b = botaoDoPainel(id);
    b?.addEventListener('click', () => {
      if (painelAberto === id) { fecharPaineis({ devolverFoco: false }); return; }
      if (id === 'painel-destinos') fecharDetalhe({ foco: false });   // pelo menu, abre sempre na lista
      abrirPainel(id);
    });
    $(id)?.querySelector('.folha__fechar')?.addEventListener('click', () => fecharPaineis({ devolverFoco: true }));
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !painelAberto || document.querySelector('dialog[open]')) return;
    if (painelAberto === 'painel-destinos' && !$('destino-detalhe')?.hidden) { fecharDetalhe(); return; }
    fecharPaineis({ devolverFoco: true });
  });
}

// ---------------------------------------------------------------- medidas do layout e margens do mapa
function layout() {
  const raiz = document.documentElement;
  const topo = document.querySelector('.topo');
  const rodape = document.querySelector('.rodape');
  const hT = topo ? Math.round(topo.getBoundingClientRect().height) : 0;
  const hR = rodape ? Math.round(rodape.getBoundingClientRect().height) : 0;
  raiz.style.setProperty('--topo-h', `${hT}px`);
  raiz.style.setProperty('--rodape-h', `${hR}px`);
  const largo = window.matchMedia('(min-width: 900px)').matches;
  let esquerda = 0, baixo = hR;
  if (painelAberto) {
    const p = $(painelAberto);
    const r = p?.getBoundingClientRect();
    if (r) { if (largo) esquerda = Math.round(r.right); else baixo = Math.max(hR, Math.round(window.innerHeight - r.top)); }
  }
  ajustarMargens({ top: hT + 8, bottom: baixo + 8, left: esquerda + 8, right: 64 });
}

// ---------------------------------------------------------------- dados auxiliares
async function lerJSON(url) {
  try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch (_) { return null; }
}

// recorte.json só é pedido se o pré-cache diz que existe (evita 404 no console enquanto o devops não cria)
async function carregarRecorte() {
  const lista = await lerJSON('./precache.json');
  const tem = lista && Array.isArray(lista.arquivos) && lista.arquivos.some((a) => a.url === 'dados/recorte.json');
  if (!tem) return RECORTE_PADRAO;
  const r = await lerJSON('./dados/recorte.json');
  if (r && Array.isArray(r.bbox) && r.bbox.length === 4 && Array.isArray(r.centro)) return { ...RECORTE_PADRAO, ...r };
  return RECORTE_PADRAO;
}

const comPrazo = (p, ms, padrao) => Promise.race([p, new Promise((ok) => setTimeout(() => ok(padrao), ms))]);

// ---------------------------------------------------------------- painel Informações (info.json)
function itemInfo(item, extra) {
  if (!item || !item.texto) return null;
  const meta = [item.quando ? t('seguranca.quando', { quando: item.quando }) : null,
    item.desatualizado ? T.seguranca.desatualizado : (item.confirmado === false ? T.seguranca.nao_confirmado : null)].filter(Boolean).join(' · ');
  return el('li', {}, el('p', {}, item.texto), extra || null, item.conferir ? el('p', { class: 'nota' }, item.conferir) : null, meta ? el('p', { class: 'nota' }, meta) : null);
}

function montarInfo(atribuicoes) {
  const info = Itaitu.dados.info || {};
  const vitrine = params.get('vitrine') === '1';   // só dentro da vitrine do marcos.html (ver topo)
  const seg = $('info-seguranca');
  if (seg) {
    const blocos = [];
    const avisos = (info.avisos || []).map((a) => itemInfo(a)).filter(Boolean);
    avisos.push(el('li', {}, el('p', {}, T.seguranca.volte_antes)), el('li', {}, el('p', {}, T.seguranca.bateria)));
    blocos.push(el('h3', {}, T.seguranca.antes_de_sair), el('ul', { class: 'lista-info' }, avisos));
    const emerg = el('div', { class: 'linha-botoes' });
    for (const e of (info.emergencia || [])) {
      if (!/^\d{3}$/.test(String(e.numero))) continue;
      const a = el('a', { class: 'botao botao--linha', href: `tel:${e.numero}` }, t('seguranca.ligar', { numero: e.numero, nome: e.nome }));
      // na vitrine a emergência não desliga: o 1º toque avisa e arma por 5 s, o 2º liga de verdade
      if (vitrine) {
        a.addEventListener('click', (ev) => {
          if (a.dataset.armado === '1') { a.dataset.armado = '0'; return; }
          ev.preventDefault();
          a.dataset.armado = '1';
          avisar(t('demo.vitrine_sos', { acao: t('demo.vitrine_acao_ligar', { numero: e.numero }) }));
          setTimeout(() => { a.dataset.armado = '0'; }, 5000);
        });
      }
      emerg.append(a);
    }
    blocos.push(el('h3', {}, T.seguranca.emergencia), emerg);
    if (info.guias) {
      const g = linkGuia(Itaitu.marca, info);
      const a = g ? el('a', { class: 'botao botao--marca', href: g, target: '_blank', rel: 'noopener noreferrer' }, T.tabuas.chamar_guia) : null;
      if (a) a.addEventListener('click', (ev) => { if (vitrine) { ev.preventDefault(); avisar(T.demo.vitrine); } else if (navigator.onLine === false) { ev.preventDefault(); avisar(T.erros.link_offline); } });
      blocos.push(el('h3', {}, T.seguranca.guias), el('p', {}, info.guias.nome_completo || info.guias.nome || ''), el('p', { class: 'nota' }, T.seguranca.guias_dica), a, el('p', { class: 'nota' }, T.seguranca.nao_substitui));
    }
    if (info.melhor_epoca?.texto) blocos.push(el('h3', {}, T.seguranca.melhor_epoca), el('ul', { class: 'lista-info' }, itemInfo(info.melhor_epoca)));
    const grupo = (titulo, lista) => { const itens = (lista || []).map((x) => itemInfo(x)).filter(Boolean); if (itens.length) blocos.push(el('h3', {}, titulo), el('ul', { class: 'lista-info' }, itens)); };
    grupo(T.seguranca.taxas, info.taxas);
    grupo(T.seguranca.horarios, info.horarios);
    grupo(T.seguranca.acesso, info.acesso);
    if (info.atualizado_em) blocos.push(el('p', { class: 'nota' }, t('informacoes.atualizado', { data: info.atualizado_em.split('-').reverse().join('/') })));
    seg.replaceChildren(...blocos.filter(Boolean));
  }
  const cred = $('info-creditos');
  if (cred) {
    cred.replaceChildren(...atribuicoes.map((a) => el('li', {},
      el('span', { class: 'credito__texto' }, a.texto || a.nome),
      el('span', { class: 'nota' }, ` · ${a.licenca || ''}`),
      /^https:\/\//.test(a.url || '') ? el('a', { href: a.url, target: '_blank', rel: 'noopener noreferrer', class: 'credito__link' }, ` ${a.nome}`) : null)));
  }
}

// ---------------------------------------------------------------- textos do HTML (todo texto sai de textos.js)
// O HTML traz o texto em português como reserva; aqui ele é trocado pelo de textos.js.
// Chave que o copywriter ainda não criou: fica o texto do HTML (t() avisa uma vez com console.info).
function traduzir() {
  for (const n of document.querySelectorAll('[data-t]')) n.textContent = t(n.dataset.t, {}, n.textContent.trim());
  for (const n of document.querySelectorAll('[data-t-aria]')) n.setAttribute('aria-label', t(n.dataset.tAria, {}, n.getAttribute('aria-label') || ''));
  for (const n of document.querySelectorAll('[data-t-placeholder]')) n.setAttribute('placeholder', t(n.dataset.tPlaceholder, {}, n.getAttribute('placeholder') || ''));
  for (const n of document.querySelectorAll('[data-t-fechar]')) n.setAttribute('aria-label', t('acessibilidade.fechar', { nome: t(n.dataset.tFechar) }));
}

// ---------------------------------------------------------------- boot
async function iniciar() {
  aplicarPreferencias();
  traduzir();
  const raiz = document.documentElement;
  raiz.dataset.app = Itaitu.app;
  if (params.get('vitrine') === '1') raiz.dataset.vitrine = '1';
  if (params.get('demo') === '1') { raiz.dataset.demo = '1'; const d = $('hora-demo-controle'); if (d) d.hidden = false; }
  if (reduzido) reduzido.addEventListener?.('change', () => Itaitu.emit('itaitu:movimento', { reduzido: reduzido.matches }));
  ligarPaineis();
  const medir = new ResizeObserver(() => layout());
  for (const n of [document.body, document.querySelector('.topo'), document.querySelector('.rodape')]) if (n) medir.observe(n);

  // marca e dados começam já; o mapa não espera por eles
  const pMarca = carregarMarca(params, { lembrar: params.get('vitrine') !== '1' })
    .then((m) => { Itaitu.marca = m; aplicarMarca(m); return m; });
  const pDados = carregarDados({ app: Itaitu.app }).then((d) => { Itaitu.dados = d; return d; });
  const [recorte, atrib] = await Promise.all([comPrazo(carregarRecorte(), 1500, RECORTE_PADRAO), comPrazo(lerJSON('./dados/atribuicoes.json'), 1500, null)]);
  Itaitu.recorte = recorte;
  const atribuicoes = Array.isArray(atrib) ? atrib : [];

  let map = null;
  try {
    if (!window.maplibregl) throw new Error('MapLibre não carregou');
    map = criarMapa(Itaitu, {
      container: 'mapa', recorte, atribuicoes, economia: economiaLigada(), utcMs: Itaitu.agora().getTime(),
      corMarca: getComputedStyle(raiz).getPropertyValue('--cor-parceiro').trim() || '#C9283E',
    });
    map.on('error', (e) => console.info('[mapa]', e?.error?.message || e?.message || 'erro do mapa'));
    ligarControles();
  } catch (e) {
    console.info('[app] mapa indisponível', e && e.message);
    const m = $('mapa-erro');
    if (m) { m.textContent = T.erros.mapa; m.hidden = false; }
  }

  const carregado = map ? new Promise((ok) => (map.loaded() ? ok() : map.once('load', ok))) : Promise.resolve();
  const [marca, dados] = await Promise.all([pMarca, pDados, carregado]);
  conferirBase(marca, dados.pontos);
  if (dados.falhou) avisar(T.erros.dados);
  if (map) { porDados(dados); corDaMarca(marca.cor); Itaitu.map = map; }

  // módulos da casca (cada um falha sozinho, sem derrubar os outros)
  const passos = [
    () => iniciarGPS(Itaitu, map),
    () => iniciarRota(Itaitu, map),
    () => montarDestinos(Itaitu),
    () => montarBusca(Itaitu),
    () => montarBotoesMarca($('marca-botoes'), marca, dados.info, { avisar, vitrine: params.get('vitrine') === '1', irParaPonto: (id) => { const f = dados.pontos.features.find((x) => x.properties.id === id); if (f?.geometry) { fecharPaineis(); irPara(f.geometry.coordinates); } } }),
    () => montarInfo(atribuicoes),
    () => montarSOS(Itaitu),
    () => montarEconomia(Itaitu),
    () => montarGravador(Itaitu, map),
  ];
  for (const p of passos) { try { await p(); } catch (e) { console.info('[app] módulo falhou', e && e.message); } }
  if (map) Itaitu.emit('itaitu:pronto', { map });
  if (window.matchMedia('(min-width: 1024px)').matches && params.get('demo') !== '1') abrirPainel('painel-destinos', { foco: false });
  layout();

  // depois do 'load' da página: SW, som, luz e Hora da Serra. Nada disso segura a tela.
  const depois = async () => {
    try { await montarArmazenamento(Itaitu); } catch (e) { console.info('[app] armazenamento', e && e.message); }
    try {
      const Som = await import('./som.js');
      const slot = $('som-slot');
      if (slot && typeof Som.botao === 'function') slot.replaceChildren(Som.botao());
    } catch (e) { console.info('[app] som.js indisponível', e && e.message); }
    if (!map) return;
    try { (await import('./luz.js')).ligar(Itaitu); } catch (e) { console.info('[app] luz.js ainda não disponível', e && e.message); }
    try { await (await import('./hora/index.js')).montar(Itaitu); } catch (e) { console.info('[app] Hora da Serra ainda não disponível', e && e.message); }
    layout();
  };
  if (document.readyState === 'complete') depois();
  else window.addEventListener('load', depois, { once: true });
}

iniciar().catch((e) => {
  console.info('[app] falha no boot', e && e.message);
  avisar(T.erros.generico);
});

export { Itaitu };
