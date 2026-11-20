// index.js · boot do app particular do Marcos (marcos.html). Frontend C, Pixel, 20/11/2026.
// 1. Copia o <body> do index.html (vem do cache do SW, funciona offline) para cá: um casco só para os
//    dois apps, sem cópia de HTML que envelhece. Depois carrega ../app.js, que reconhece data-app="marcos"
//    e faz o dados.js sobrepor os pontos confirmados em campo (store 'pontos-local').
// 2. Põe o botão "Marcos" no topo e o painel com 5 abas: Campo, Pacote, Vitrine, Venda (PIN) e Ajustes.
// 3. A trava da vitrine sobe antes de tudo: se a página recarregou no meio de uma demonstração, ela
//    volta presa na vitrine.
// Nada aqui edita módulo do app público; o que falta neles está pedido no RELATORIO.md.

import { $, m, anunciar, avisar } from './comum.js';
import { montarTrava, destrancar, trancar, liberado, aoMudarTrava, trocarPin } from './trava.js';
import { temPin, lerRegistro, criptoDisponivel } from './pin.js';

const PRONTO_MS = 12000;

async function transplantarCasco() {
  const alvo = $('marcos-casco');
  let html = null;
  try {
    const r = await fetch('./index.html');
    if (r.ok) html = await r.text();
  } catch (e) { console.info('[marcos] index.html indisponível', e && e.message); }
  if (!html) {
    alvo.replaceWith(Object.assign(document.createElement('p'), { className: 'mapa-erro', textContent: 'Abra uma vez com sinal para guardar o app neste celular.' }));
    return false;
  }
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const frag = document.createDocumentFragment();
  for (const n of [...doc.body.childNodes]) {
    if (n.nodeType === 1 && n.tagName === 'SCRIPT') continue;
    frag.append(document.importNode(n, true));
  }
  alvo.replaceWith(frag);
  return true;
}

// ---------------------------------------------------------------- painel e abas
let ctx = null;
let aberto = false;

function abrirPainel() {
  ctx?.fecharPaineis?.();
  const p = $('painel-marcos');
  p.hidden = false;
  aberto = true;
  $('marcos-abrir')?.setAttribute('aria-expanded', 'true');
  document.documentElement.dataset.painel = 'painel-marcos';
  $('painel-marcos-titulo').focus();
  ctx?.layout?.();
}

function fecharPainel({ foco = true } = {}) {
  const p = $('painel-marcos');
  if (!p || p.hidden) return;
  p.hidden = true;
  aberto = false;
  $('marcos-abrir')?.setAttribute('aria-expanded', 'false');
  if (document.documentElement.dataset.painel === 'painel-marcos') delete document.documentElement.dataset.painel;
  if (foco) $('marcos-abrir')?.focus();
  ctx?.layout?.();
}

const ABAS = ['campo', 'pacote', 'vitrine', 'venda', 'ajustes'];
const aoAbrirAba = {};

function escolherAba(nome, { foco = false } = {}) {
  for (const a of ABAS) {
    const b = $(`aba-${a}`), s = $(`sec-${a}`);
    const sim = a === nome;
    b.setAttribute('aria-selected', sim ? 'true' : 'false');
    b.tabIndex = sim ? 0 : -1;
    s.hidden = !sim;
  }
  if (foco) $(`aba-${nome}`).focus();
  try { aoAbrirAba[nome]?.(); } catch (e) { console.info('[marcos] aba', nome, e && e.message); }
}

function ligarAbas() {
  const lista = document.querySelector('.abas');
  lista.addEventListener('click', (e) => {
    const b = e.target.closest('.aba');
    if (b) escolherAba(b.id.replace('aba-', ''));
  });
  lista.addEventListener('keydown', (e) => {
    const i = ABAS.findIndex((a) => $(`aba-${a}`).getAttribute('aria-selected') === 'true');
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % ABAS.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + ABAS.length) % ABAS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = ABAS.length - 1;
    if (j == null) return;
    e.preventDefault();
    escolherAba(ABAS[j], { foco: true });
  });
}

function ligarPainel() {
  const acoes = document.querySelector('.topo__acoes');
  const tpl = $('marcos-botao-tpl');
  if (acoes && tpl) {
    acoes.append(tpl.content.cloneNode(true));
    acoes.classList.add('topo__acoes--marcos');
  }
  $('marcos-abrir')?.addEventListener('click', () => (aberto ? fecharPainel() : abrirPainel()));
  $('marcos-fechar').addEventListener('click', () => fecharPainel());
  // os painéis do app público fecham o do Marcos (e vice-versa, pelo fecharPaineis acima)
  acoes?.addEventListener('click', (e) => {
    const b = e.target.closest('[aria-controls]');
    if (b && b.id !== 'marcos-abrir') fecharPainel({ foco: false });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && aberto && !document.querySelector('dialog[open]')) { e.preventDefault(); fecharPainel(); }
  });
  document.addEventListener('itaitu:marcos-fechar', () => fecharPainel({ foco: false }));
  ligarAbas();
}

// ---------------------------------------------------------------- venda (atrás do PIN) e ajustes
let caderno = null, kit = null;

function desenharVenda() {
  const sim = liberado();
  $('venda-trancada').hidden = sim;
  $('venda-aberta').hidden = !sim;
  if (sim) { caderno?.listar(); kit?.mostrar(); }
  else {
    $('caderno-lista').replaceChildren(); $('kit-conteudo').replaceChildren();
    const dlg = $('caderno-dlg');
    if (dlg?.open) dlg.close();              // trancou com o negócio aberto na tela: fecha também
  }
}

// ação de caderno ou kit com a trava já fechada: mostra a tela trancada e diz o porquê
function avisarTrancado() {
  desenharVenda();
  avisar('Trancado: digite o PIN.');
  $('venda-destrancar')?.focus();
}

async function desenharAjustes() {
  const st = $('pin-estado');
  if (!criptoDisponivel()) { st.textContent = m('pin_sem_cripto'); $('pin-definir').disabled = true; return; }
  const r = await lerRegistro();
  st.textContent = r && r.hash ? m('pin_definido', { data: String(r.criado_em || '').slice(0, 10).split('-').reverse().join('/') }) : m('pin_nenhum');
  $('pin-definir').textContent = r && r.hash ? 'Trocar PIN' : 'Criar PIN';
}

async function montarVendaEAjustes() {
  caderno = await import('./caderno.js');
  kit = await import('./kit.js');
  caderno.montarCaderno({ liberado, trancado: avisarTrancado });
  kit.montarKit({ liberado, trancado: avisarTrancado });
  $('venda-destrancar').addEventListener('click', async () => { if (await destrancar()) { desenharVenda(); $('caderno-novo').focus(); } });
  $('venda-trancar').addEventListener('click', () => { trancar(); $('venda-destrancar').focus(); });
  aoMudarTrava(desenharVenda);
  aoAbrirAba.venda = desenharVenda;
  aoAbrirAba.ajustes = desenharAjustes;
  $('pin-definir').addEventListener('click', async () => { if (await trocarPin()) desenharAjustes(); });
  desenharVenda();
  desenharAjustes();
  if (!(await temPin())) console.info('[marcos] sem PIN ainda: será criado no primeiro uso da vitrine ou do caderno');
}

// ---------------------------------------------------------------- dados (depois de confirmar)
async function recarregarDados() {
  const [{ carregarDados }, { conferirBase }, mapa, destinos] = await Promise.all([
    import('../dados.js'), import('../marca.js'), import('../mapa.js'), import('../destinos.js'),
  ]);
  const d = await carregarDados({ app: 'marcos' });
  ctx.dados = d;
  if (ctx.marca) conferirBase(ctx.marca, d.pontos);
  try { mapa.porDados(d); } catch (e) { console.info('[marcos] mapa não redesenhou', e && e.message); }
  try { destinos.renderizarLista(); } catch (e) { console.info('[marcos] lista não redesenhou', e && e.message); }
  ctx.emit('itaitu:destinos', { pontos: d.pontos });
  ctx.emit('itaitu:marcos-mudou', { tipo: 'pontos' });
  const conf = await import('./confirmar.js');
  await conf.listarNaTela();
}

function esperarPronto() {
  return new Promise((ok) => {
    let feito = false;
    const fim = () => { if (!feito) { feito = true; ok(); } };
    document.addEventListener('itaitu:pronto', fim, { once: true });
    setTimeout(fim, PRONTO_MS);
  });
}

// O gravador do hóspede e o de campo não gravam ao mesmo tempo
function separarGravadores(estadoPro) {
  document.addEventListener('click', (e) => {
    if (!e.target.closest?.('#gravar-iniciar')) return;
    if (estadoPro().estado !== 'parada') { e.stopImmediatePropagation(); e.preventDefault(); ctx.avisar?.('O gravador de campo está gravando. Pare aquele primeiro (Marcos > Campo).'); }
  }, true);
  const painel = $('painel-gravar')?.querySelector('.folha__corpo');
  if (painel) {
    const nota = document.createElement('p');
    nota.className = 'aviso-honesto m-nota-gravar';
    nota.textContent = 'No app do Marcos, a trilha oficial é gravada em Marcos > Campo: pausa sozinha, passagens com nota, perfil e “fincada pela ACAGI”.';
    painel.prepend(nota);
  }
}

// ---------------------------------------------------------------- boot
async function iniciar() {
  const ok = await transplantarCasco();
  ligarPainel();
  montarTrava();
  if (!ok) return;
  await import('../app.js');
  ctx = window.Itaitu;
  montarVendaEAjustes().catch((e) => console.info('[marcos] venda/ajustes', e && e.message));
  import('./vitrine.js').then((v) => v.montarVitrine()).catch((e) => console.info('[marcos] vitrine', e && e.message));
  await esperarPronto();
  document.title = m('titulo');
  const [conf, pro, pac] = await Promise.all([import('./confirmar.js'), import('./gravador-pro.js'), import('./pacote-tela.js')]);
  try { conf.montarConfirmar(ctx, { recarregar: recarregarDados }); } catch (e) { console.info('[marcos] confirmar', e && e.message); }
  try { await pro.montarGravadorPro(ctx, ctx.map); separarGravadores(pro.estadoPro); } catch (e) { console.info('[marcos] gravador de campo', e && e.message); }
  try { pac.montarPacoteTela(ctx); aoAbrirAba.pacote = () => pac.atualizarResumo(); } catch (e) { console.info('[marcos] pacote', e && e.message); }
  document.documentElement.dataset.marcosPronto = '1';
  anunciar('App do Marcos pronto.');
}

iniciar().catch((e) => console.info('[marcos] falha no boot', e && e.message));
