/*
 * Porta Aberta · fundação do funil para o visitante frio (Pixel, 10/11/2026).
 * Roda com: CREAT_TESTE_TMP=/tmp npm test
 *
 * 1. Preço que não quebra sozinho (ADR-005): inauguração vale até 7 dias; contadores só até 48 h.
 * 2. Escolha do link de pagamento por praça; o anual cobra só a Abertura hoje (decisão D3, sem combo).
 * 3. Volta do Mercado Pago (lerRetornoMP) e Purchase só aprovado, com preference_id de link conhecido
 *    e uma vez por payment_id (sem global de teste: medirCompra recebe quem envia).
 * 4. Origem do primeiro toque (30 dias), lista fechada de parâmetros do Pixel, prazos do que fica no
 *    aparelho e "Esquecer meus dados" apagando todas as chaves do site.
 * 5. No navegador (se o Playwright existir): endereço limpo antes de medir, eventos do Pixel em /abrir/
 *    e /obrigado/, link da praça no botão de pagar, Purchase sem duplicar na recarga, Clarity só na home,
 *    banner e revogação em /abrir/, contadores fora da tela, nome longo sem rolagem lateral, WhatsApp
 *    flutuante fora do campo do nome e "Ver a prévia de novo" abrindo a prévia.
 * 6. Sede viva (#sede): negocios.json da cena igual aos tenant.json, contrato da cena (passos, sem innerHTML/eval/
 *    texto próprio) e, no navegador, nada baixado no topo, cena tocando sozinha ao entrar, pausa fora da tela,
 *    troca de negócio e movimento reduzido sem nada rodando. O portão completo é scripts/conferir-sede-viva.cjs.
 * vitrine.js roda num contexto vm com um DOM mínimo; nenhuma rede.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FONTE_CK = fs.readFileSync(path.join(RAIZ, 'checkout.config.js'), 'utf8');
const FONTE_VIT = fs.readFileSync(path.join(RAIZ, 'assets', 'vitrine.js'), 'utf8');
const H = 3600 * 1000;

const PREF = {
  inaug: '2189692475-388377b3-87f4-43db-b88c-af75b6ce6526',
  padrao: '2189692475-fc609d62-006f-49e5-ae5a-93e73f762a68',
  feira: '2189692475-c33953d5-4c69-4bc9-8de8-0ff4d7dfbeff',
  salvador: '2189692475-621eec2b-8af5-477a-a64e-53ba326d8d53',
  aracaju: '2189692475-88c3e2e4-b65b-444e-8e28-bbd5ec4c5ac2',
  comboAberto: '2189692475-78effa57-7b26-4cd5-9617-6d6bc32cce32',
  comboVitrine: '2189692475-9914ecb8-0c03-45b7-a9bc-3c36972f372d'
};
const D30 = 30 * 24 * 3600 * 1000;
const link = (p) => 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=' + p;

function armazem() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; }, _m: m };
}
// Carrega checkout.config.js + vitrine.js num contexto com DOM mínimo. A página não "inicia" (readyState loading).
function carregar(opcoes = {}) {
  const { precos = null, vagas = null, href = 'http://creat.local/abrir/' } = opcoes;
  const local = new URL(href);
  const D = {
    currentScript: null, body: null, readyState: 'loading', hidden: false,
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ setAttribute() {}, style: {} }), documentElement: { classList: { add() {} }, style: {} }
  };
  const resposta = (dado) => Promise.resolve(dado ? { ok: true, json: () => Promise.resolve(JSON.parse(JSON.stringify(dado))) } : { ok: false, json: () => Promise.resolve(null) });
  const ctx = {
    URL, URLSearchParams, Promise, Date, Math, JSON, setTimeout, clearTimeout, AbortController, console, crypto: globalThis.crypto, btoa, Blob, Intl,
    document: D, location: { href, search: local.search, hash: local.hash, pathname: local.pathname, origin: local.origin, host: local.host, hostname: local.hostname, protocol: local.protocol },
    history: { replaceState() {}, pushState() {} },
    localStorage: armazem(), sessionStorage: armazem(),
    fetch: (u) => resposta(String(u).endsWith('dados/precos.json') ? precos : String(u).endsWith('dados/vagas.json') ? vagas : null)
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(FONTE_CK, ctx, { filename: 'checkout.config.js' });
  vm.runInContext(FONTE_VIT, ctx, { filename: 'vitrine.js' });
  return ctx;
}
const iso = (msAtras) => new Date(Date.now() - msAtras).toISOString();
function precosCom(msAtras, mudar) {
  const p = { prazoHoras: 72, abertura: { padrao: 497, inauguracao: { ativa: true, preco: 297, vagasTotal: 20, vagasRestantes: 14 } }, planos: { aberto: 147, vitrine: 297 }, anualMesesPagos: 10, bastidores: 67, atualizado_em: iso(msAtras) };
  if (mudar) mudar(p);
  return p;
}
const vagasCom = (msAtras) => ({ capacidade_dia: 3, em_producao: 0, vagas_hoje: 2, atualizado_em: iso(msAtras) });

/* ------------------------------------------------------------ 1. preço (ADR-005) */
test('preço: dado de 1 h mostra inauguração, contador e vagas de hoje', async () => {
  const pr = await carregar({ precos: precosCom(1 * H), vagas: vagasCom(1 * H) }).Vitrine.lerPrecos();
  assert.equal(pr.aberturaAtual, 297);
  assert.equal(pr.inauguracao.vagasRestantes, 14);
  assert.equal(pr.vagasHoje.vagas_hoje, 2);
  assert.equal(pr.linkChave, 'aberturaInauguracao');
});

test('preço: precos.json de 3 dias mantém R$ 297, mas sem "Restam X" e sem vagas de hoje', async () => {
  const pr = await carregar({ precos: precosCom(72 * H), vagas: vagasCom(72 * H) }).Vitrine.lerPrecos();
  assert.equal(pr.aberturaAtual, 297, 'a página não volta a R$ 497 sozinha antes de 7 dias');
  assert.equal(pr.inauguracao.preco, 297);
  assert.equal(pr.inauguracao.vagasRestantes, null, 'contador escondido com dado de mais de 48 h');
  assert.equal(pr.vagasHoje, null);
  assert.equal(pr.linkChave, 'aberturaInauguracao');
});

test('preço: a inauguração não depende mais de vagas.json', async () => {
  const pr = await carregar({ precos: precosCom(2 * H), vagas: null }).Vitrine.lerPrecos();
  assert.equal(pr.aberturaAtual, 297);
  assert.equal(pr.inauguracao.vagasRestantes, 14);
  assert.equal(pr.vagasHoje, null);
});

test('preço: precos.json com mais de 7 dias cai no padrão, sem inauguração', async () => {
  const pr = await carregar({ precos: precosCom(7 * 24 * H + 10 * 60 * 1000), vagas: vagasCom(1 * H) }).Vitrine.lerPrecos();
  assert.equal(pr.inauguracao, null);
  assert.equal(pr.aberturaAtual, 497);
  assert.equal(pr.linkChave, 'aberturaPadrao');
});

test('preço: inauguração inativa, sem vaga, inválida, no futuro ou sem arquivo = padrão', async () => {
  const casos = [
    precosCom(1 * H, (p) => { p.abertura.inauguracao.ativa = false; }),
    precosCom(1 * H, (p) => { p.abertura.inauguracao.vagasRestantes = 0; }),
    precosCom(1 * H, (p) => { p.abertura.inauguracao.preco = 600; }),
    precosCom(-2 * H),
    precosCom(1 * H, (p) => { p.atualizado_em = 'ontem'; }),
    null
  ];
  for (const precos of casos) {
    const pr = await carregar({ precos, vagas: vagasCom(1 * H) }).Vitrine.lerPrecos();
    assert.equal(pr.inauguracao, null, JSON.stringify(precos));
    assert.equal(pr.aberturaAtual, 497);
  }
});

test('preço: inauguração com preço diferente do valor do link de pagamento não aparece', async () => {
  const pr = await carregar({ precos: precosCom(1 * H, (p) => { p.abertura.inauguracao.preco = 247; }) }).Vitrine.lerPrecos();
  assert.equal(pr.inauguracao, null, 'a tela nunca mostra R$ 247 com um link que cobra R$ 297');
  assert.equal(pr.aberturaAtual, 497);
});

test('fresco: janela padrão de 48 h e janela de 7 dias', () => {
  const V = carregar().Vitrine;
  const d = (ms) => ({ atualizado_em: iso(ms) });
  assert.equal(V.fresco(d(47 * H)), true);
  assert.equal(V.fresco(d(49 * H)), false);
  assert.equal(V.fresco(d(6 * 24 * H), undefined, 7 * 24 * H), true);
  assert.equal(V.fresco(d(8 * 24 * H), undefined, 7 * 24 * H), false);
});

/* ------------------------------------------------------------ 2. link por praça e combos */
const C = carregar().CREAT_CHECKOUT;

test('link: cada praça da campanha cai no próprio link de R$ 297', () => {
  for (const [praca, pref] of [['feira', PREF.feira], ['salvador-rms', PREF.salvador], ['aracaju', PREF.aracaju]]) {
    const r = C.escolherAbertura({ inauguracao: true, plano: 'vitrine', praca });
    assert.equal(r.link, link(pref), praca);
    assert.equal(r.praca, praca);
    assert.equal(r.valor, 297);
  }
  for (const praca of ['fortaleza', 'recife', 'petrolina-juazeiro']) assert.equal(C.escolherAbertura({ inauguracao: true, plano: 'aberto', praca }).praca, praca);
});

test('link: sem praça, praça desconhecida ou nome de propriedade do objeto = link padrão da inauguração', () => {
  for (const praca of [undefined, '', 'brasil', 'FEIRA', '__proto__', 'constructor', 'toString']) {
    const r = C.escolherAbertura({ inauguracao: true, plano: 'vitrine', praca });
    assert.equal(r.link, link(PREF.inaug), String(praca));
    assert.equal(r.praca, null);
  }
});

test('link: fora da inauguração vale o padrão de R$ 497, mesmo com praça e com anual', () => {
  for (const plano of ['aberto', 'vitrine', 'aberto_anual', 'vitrine_anual']) {
    const r = C.escolherAbertura({ inauguracao: false, plano, praca: 'feira', totalAnual: 1767 });
    assert.equal(r.link, link(PREF.padrao), plano);
    assert.equal(r.valor, 497);
  }
});

test('link: o anual cobra hoje só a Abertura (da praça ou padrão); nenhum combo no arquivo público (D3)', () => {
  assert.equal(C.combosAnual, undefined, 'combosAnual saiu do checkout.config.js');
  for (const plano of ['aberto_anual', 'vitrine_anual']) {
    const r = C.escolherAbertura({ inauguracao: true, plano, praca: 'feira', totalAnual: 1767 });
    assert.equal(r.link, link(PREF.feira), plano);
    assert.equal(r.valor, 297);
    const s2 = C.escolherAbertura({ inauguracao: true, plano });
    assert.equal(s2.link, link(PREF.inaug));
  }
  assert.doesNotMatch(FONTE_CK.replace(/\/\*[\s\S]*?\*\//g, ''), /78effa57|9914ecb8/, 'os links dos combos não estão no código público');
});

test('contadores ao vivo: desligados na configuração pública (D1)', () => {
  assert.equal(C.contadoresAoVivo, false);
});

test('link: todo link escolhido passa por linkValido', () => {
  const ctx = carregar();
  ctx.CREAT_CHECKOUT.linksPorPraca.feira = 'https://mpago.la.golpe.com/x';
  const r = ctx.CREAT_CHECKOUT.escolherAbertura({ inauguracao: true, plano: 'vitrine', praca: 'feira' });
  assert.equal(r.link, link(PREF.inaug), 'link de praça inválido cai no padrão da inauguração');
  for (const k of Object.keys(C.linksPorPraca)) assert.equal(C.linkValido(C.linksPorPraca[k]), true, k);
});

test('valor da preferência: o Purchase usa o valor que o link cobra, só para link conhecido', () => {
  assert.equal(C.valorDaPreferencia(PREF.inaug), 297);
  assert.equal(C.valorDaPreferencia(PREF.feira), 297);
  assert.equal(C.valorDaPreferencia(PREF.padrao), 497);
  assert.equal(C.valorDaPreferencia(PREF.comboAberto), null, 'combo fora da página: desconhecido');
  assert.equal(C.valorDaPreferencia(PREF.comboVitrine), null);
  assert.equal(C.valorDaPreferencia('2189692475-desconhecida'), null);
  assert.equal(C.valorDaPreferencia(null), null);
});

/* ------------------------------------------------------------ 3. volta do Mercado Pago e Purchase */
test('volta do Mercado Pago: aprovado só com status approved E payment_id', () => {
  const V = carregar().Vitrine;
  assert.equal(V.lerRetornoMP('?collection_status=approved&payment_id=1234567890&preference_id=' + PREF.feira).aprovado, true);
  assert.equal(V.lerRetornoMP('?status=approved&payment_id=1234567890').aprovado, true);
  assert.equal(V.lerRetornoMP('?collection_status=approved').aprovado, false);
  assert.equal(V.lerRetornoMP('?collection_status=pending&payment_id=1234567890').aprovado, false);
  assert.equal(V.lerRetornoMP('?status=rejected&payment_id=1234567890').aprovado, false);
  assert.equal(V.lerRetornoMP('?collection_status=approved&payment_id=abc').aprovado, false);
  assert.equal(V.lerRetornoMP('?collection_id=1234567890&collection_status=approved').aprovado, false, 'payment_id é obrigatório');
  assert.equal(V.lerRetornoMP(''), null);
});

test('Purchase: sem consentimento não sai e não marca o payment_id; valor vem do link; sem global de teste', () => {
  const ctx = carregar({ href: 'http://creat.local/obrigado/' }), V = ctx.Vitrine;
  assert.equal(ctx.__creatPixel, undefined, 'window.__creatPixel não existe na página pública');
  const volta = V.lerRetornoMP('?collection_status=approved&payment_id=987654321&preference_id=' + PREF.salvador);
  assert.equal(V.medirCompra(volta), 'sem-pixel', 'sem consentimento o Pixel não está ligado');
  assert.equal(ctx.localStorage.getItem('creat:px:compras'), null);
  const enviados = [];
  const enviar = (nome, params, id) => { enviados.push(JSON.parse(JSON.stringify([nome, params, id]))); return true; };
  assert.equal(V.medirCompra(volta, enviar), 'enviada');
  assert.deepEqual(enviados, [['Purchase', { value: 297, currency: 'BRL' }, '987654321']]);
  assert.equal(V.medirCompra(volta, enviar), 'repetida');
  const g = JSON.parse(ctx.localStorage.getItem('creat:px:compras'));
  assert.equal(g[0].id, '987654321'); assert.ok(!isNaN(Date.parse(g[0].em)));
  assert.equal(V.medirCompra(V.lerRetornoMP('?collection_status=pending&payment_id=987654321'), enviar), 'sem-aprovacao');
  assert.equal(V.medirCompra(V.lerRetornoMP('?collection_status=approved&payment_id=987654322&preference_id=2189692475-outra'), enviar), 'sem-valor');
  assert.equal(V.medirCompra(V.lerRetornoMP('?collection_status=approved&payment_id=987654323'), enviar), 'sem-valor', 'sem preference_id: nenhum valor adivinhado');
  assert.equal(V.medirCompra(V.lerRetornoMP('?collection_status=approved&payment_id=987654324&preference_id=' + PREF.comboAberto), enviar), 'sem-valor');
  assert.equal(enviados.length, 1);
});

test('Pixel: só os parâmetros da lista fechada, sem dado pessoal', () => {
  const V = carregar().Vitrine;
  assert.deepEqual(JSON.parse(JSON.stringify(V.filtrarPixel('ViewContent', { content_category: 'salao', content_name: 'previa', nome: 'Studio Bela', cidade: 'Feira' }))), { content_category: 'salao', content_name: 'previa' });
  assert.equal(V.filtrarPixel('ViewContent', { content_category: 'clinica', content_name: 'previa' }), null);
  assert.deepEqual(JSON.parse(JSON.stringify(V.filtrarPixel('InitiateCheckout', { value: 297, currency: 'BRL', email: 'a@b.com', phone: '5575999999999' }))), { value: 297, currency: 'BRL' });
  assert.equal(V.filtrarPixel('Purchase', { value: 297 }), null, 'sem currency não manda');
  assert.equal(V.filtrarPixel('Lead', { value: 1, currency: 'BRL' }), null, 'evento fora da lista não sai');
});

/* ------------------------------------------------------------ 4. origem do primeiro toque */
test('origem: guarda só utm_source/medium/campaign/content, o primeiro toque vale 30 dias', () => {
  const ctx = carregar(), V = ctx.Vitrine;
  assert.equal(V.guardarOrigem({ utm_source: 'meta', utm_medium: 'pago', utm_campaign: 'feira', utm_content: 'dor', utm_term: 'x', n: 'Studio Bela' }), true);
  const g = JSON.parse(ctx.localStorage.getItem('creat:origem:v1'));
  assert.deepEqual(Object.keys(g).sort(), ['em', 'utm_campaign', 'utm_content', 'utm_medium', 'utm_source']);
  assert.equal(V.guardarOrigem({ utm_campaign: 'salvador-rms' }), false, 'segundo toque não sobrescreve');
  assert.equal(V.lerOrigem().utm_campaign, 'feira');
  assert.equal(V.lerOrigem(Date.now() + 31 * 24 * H), null, 'depois de 30 dias a origem some');
  assert.equal(ctx.localStorage.getItem('creat:origem:v1'), null);
  assert.equal(V.guardarOrigem({ utm_campaign: 'salvador-rms' }), true, 'expirou: o próximo toque vira o primeiro');
  assert.equal(V.guardarOrigem({}), false);
});

/* ------------------------------------------------------------ 4b. prazos e "Esquecer meus dados" */
test('prazos: compras medidas vencem em 30 dias, consentimento em 180 dias, chave antiga de checkout some', () => {
  const ctx = carregar(), V = ctx.Vitrine, ls = ctx.localStorage;
  const velho = new Date(Date.now() - D30 - H).toISOString(), novo = new Date(Date.now() - H).toISOString();
  ls.setItem('creat:px:compras', JSON.stringify([{ id: '111', em: velho }, { id: '222', em: novo }, '333']));
  ls.setItem('creat:checkout:v1', JSON.stringify({ valor: 297, em: novo }));
  ls.setItem('creat:consentimento', JSON.stringify({ versao: 1, pixel: true, em: new Date(Date.now() - 181 * 24 * H).toISOString() }));
  V.limparVencidos();
  assert.deepEqual(JSON.parse(ls.getItem('creat:px:compras')).map((x) => x.id), ['222']);
  assert.equal(ls.getItem('creat:checkout:v1'), null);
  assert.equal(ls.getItem('creat:consentimento'), null, 'escolha de 181 dias pergunta de novo');
  ls.setItem('creat:consentimento', JSON.stringify({ versao: 1, pixel: true, em: novo }));
  assert.equal(V.consentimento().pixel, true);
  ls.setItem('creat:px:compras', JSON.stringify([{ id: '222', em: velho }]));
  V.limparVencidos();
  assert.equal(ls.getItem('creat:px:compras'), null, 'lista vazia sai do aparelho');
});

test('esquecer: apaga todas as chaves "creat:" do localStorage e do sessionStorage, e só elas', () => {
  const ctx = carregar(), V = ctx.Vitrine;
  for (const k of ['creat:pedido:v1', 'creat:origem:v1', 'creat:px:compras', 'creat:consentimento', 'creat:checkout:v1']) ctx.localStorage.setItem(k, '{}');
  for (const k of ['creat:abrir:negocio', 'creat:px:vc:salao']) ctx.sessionStorage.setItem(k, '{}');
  ctx.localStorage.setItem('outro-site', 'fica');
  V.esquecerTudo();
  assert.deepEqual(Array.from(ctx.localStorage._m.keys()), ['outro-site']);
  assert.equal(ctx.sessionStorage.length, 0);
});

/* ------------------------------------------------------------ 5. no navegador */
let chromium = null;
try { ({ chromium } = require(require.resolve('playwright', { paths: [RAIZ] }))); } catch (e) { chromium = null; }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
function servidor() {
  const srv = http.createServer((q, r) => {
    let f = path.join(RAIZ, decodeURIComponent(new URL(q.url, 'http://x').pathname));
    if (!f.startsWith(RAIZ)) { r.writeHead(403); return r.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    // dados de hoje: o teste não depende da rotina diária ter rodado
    if (/dados[\\/](precos|vagas)\.json$/.test(f)) { const o = JSON.parse(fs.readFileSync(f, 'utf8')); o.atualizado_em = new Date(Date.now() - 3600 * 1000).toISOString(); r.writeHead(200, { 'content-type': MIME['.json'] }); return r.end(JSON.stringify(o)); }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}
async function pagina(navegador, base, opcoes = {}) {
  const pg = await navegador.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const erros = []; pg.on('pageerror', (e) => erros.push(e.message));
  const clarity = []; pg.on('request', (q) => { if (/clarity\.ms/.test(q.url())) clarity.push(new URL(pg.url()).pathname); });
  await pg.route(/^https:\/\/(connect\.facebook\.net|www\.clarity\.ms|fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  // ID do Clarity real (formato válido) só no teste, para provar que ele não carrega em /abrir/ nem em /obrigado/
  if (opcoes.clarity) await pg.route(/\/checkout\.config\.js$/, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FONTE_CK.replace("clarity: 'ID_DO_PROJETO_CLARITY'", "clarity: 'abcd1234ef'") }));
  await pg.goto(base + '/termos/'); // mesma origem, para gravar o consentimento antes das páginas do funil
  if (opcoes.consentir !== false) await pg.evaluate(() => localStorage.setItem('creat:consentimento', JSON.stringify({ versao: 1, analytics: true, pixel: true, clarity: true, em: new Date().toISOString() })));
  return { pg, erros, clarity };
}
const filaPixel = (pg) => pg.evaluate(() => (window.fbq && window.fbq.queue ? Array.from(window.fbq.queue).map((a) => JSON.parse(JSON.stringify(Array.from(a)))) : []));

test('navegador: /abrir/ limpa nome e cidade do endereço, escolhe o link da praça e manda InitiateCheckout com o valor', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, erros } = await pagina(nav, base);
    await pg.goto(base + '/?nicho=salao&utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=dor');
    await pg.goto(base + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela%20%26%20Cia&c=Feira%20de%20Santana&p=1');
    await pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    const url = pg.url();
    assert.doesNotMatch(url, /Studio|Bela|Feira|n=|c=/, 'nome e cidade fora do endereço: ' + url);
    assert.match(url, /plano=vitrine/);
    assert.equal(await pg.textContent('#abrir-negocio-nome'), 'Studio Bela & Cia');
    const fila = await filaPixel(pg);
    assert.ok(fila.some((a) => a[0] === 'track' && a[1] === 'PageView'), 'PageView em /abrir/ com o consentimento da home');
    assert.ok(!fila.some((a) => a[1] === 'InitiateCheckout'), 'InitiateCheckout só no clique');
    const href = await pg.getAttribute('.pagar [data-checkout]', 'href');
    assert.equal(href, link(PREF.feira), 'link da praça feira');
    assert.equal(await pg.getAttribute('#barra-pagar [data-checkout]', 'href'), link(PREF.feira));
    assert.match(await pg.textContent('#resumo-mensal'), /Por mês\s*R\$\s297\s*Plano Vitrine, só com o site no ar\. No cartão, ou anual no Pix\./);
    assert.equal(await pg.evaluate(() => document.querySelector('#trocar-plano').open), false, 'veio da home com o Vitrine: a lista de planos fica recolhida, o plano aparece na conta');
    assert.equal(await pg.isChecked('input[name="plano"][value="vitrine"]'), true);
    // recarregar não traz nome de volta ao endereço e mantém o negócio na tela
    await pg.reload(); await pg.waitForTimeout(300);
    assert.doesNotMatch(pg.url(), /Studio|Feira/);
    assert.equal(await pg.textContent('#abrir-negocio-nome'), 'Studio Bela & Cia');
    // anual: hoje só a Abertura (link da praça), com o anual cobrado quando o site entra no ar (D3)
    await pg.click('#trocar-plano summary');
    await pg.click('label.plano-opcao:has(input[value="aberto_anual"])');
    assert.equal(await pg.getAttribute('.pagar [data-checkout]', 'href'), link(PREF.feira));
    assert.match(await pg.textContent('.pagar-total'), /R\$ 297$/);
    assert.match(await pg.textContent('#resumo-anual'), /No dia em que o site entra no ar\s*R\$\s1\.470\s*Plano Aberto anual, 12 meses no Pix\. Nada do anual é cobrado antes\./);
    assert.equal(await visivel(pg, '#resumo-mensal'), false, 'no anual, a linha do mês sai');
    assert.equal(await pg.textContent('#barra-pagar strong'), 'R$ 297');
    // sem contador numérico na tela (D1) e parcelas explicadas (D7)
    assert.equal(await pg.isVisible('[data-se="varias-vagas"]'), false);
    assert.equal(await pg.isVisible('[data-se="ultima-vaga"]'), false);
    assert.match(await pg.textContent('#pagar-parcelas'), /Pix ou cartão.*parcelamento aparecem/);
    assert.match(await pg.textContent('#pagar-aviso-dados'), /Ao tocar em Pagar, enviamos à Creat os dados .*30 dias/, 'aviso dos dados ao lado do botão Pagar');
    assert.equal(await pg.locator('.pagar [data-checkout]').count(), 1);
    await pg.click('label.plano-opcao:has(input[value="vitrine"])');
    // formulário completo e clique em pagar (navegação para o Mercado Pago bloqueada)
    await pg.route(/mercadopago\.com\.br/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>mp</p>' }));
    await preencherAbrir(pg, { completo: true });
    const antes = await filaPixel(pg);
    await Promise.all([pg.waitForURL(/mercadopago/), pg.click('.pagar [data-checkout]')]);
    // a fila do fbq fica na página que saiu: o registro de teste guarda o evento antes da navegação
    assert.ok(!antes.some((a) => a[1] === 'InitiateCheckout'));
    assert.deepEqual(erros, []);
    await pg.close();
    // InitiateCheckout: confere na própria página, sem sair (o clique com Ctrl abre outra aba e não navega)
    const { pg: pg2 } = await pagina(nav, base);
    await pg2.goto(base + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela&p=1&utm_campaign=salvador-rms');
    await pg2.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    await pg2.fill('#p-cidade', 'Salvador');
    await pg2.fill('#p-whatsapp', '71991234567'); await pg2.fill('#p-email', 'maria@exemplo.com.br'); await pg2.check('#p-aceite');
    await pg2.evaluate(() => { document.querySelectorAll('[data-checkout]').forEach((a) => a.addEventListener('click', (e) => e.preventDefault())); });
    await pg2.click('.pagar [data-checkout]'); await pg2.click('.pagar [data-checkout]');
    const ic = (await filaPixel(pg2)).filter((a) => a[1] === 'InitiateCheckout');
    assert.equal(ic.length, 1, 'clique duplo não duplica');
    assert.deepEqual(ic[0][2], { value: 297, currency: 'BRL' });
    assert.equal(await pg2.getAttribute('.pagar [data-checkout]', 'href'), link(PREF.salvador), 'utm do fragmento sem origem guardada');
    const tudo = JSON.stringify(await filaPixel(pg2));
    assert.doesNotMatch(tudo, /Maria|Salvador|maria@|71991234567|Studio/, 'nenhum dado pessoal nos eventos');
    await pg2.close();
  } finally { await nav.close(); srv.close(); }
});

test('navegador: /obrigado/ manda Purchase só com o servidor confirmando, eventID = payment_id, uma vez, e limpa o endereço', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const compras = async (pg) => (await filaPixel(pg)).filter((a) => a[1] === 'Purchase');
    // 1) URL aprovada e servidor sem confirmar (aguardando): nenhum Purchase, mesmo com o aceite e um preference_id público
    const a = await paginaApi(nav, base, { pedido: PEDIDO_CHEIO() });
    await a.pg.goto(base + '/obrigado/?collection_id=111222333&collection_status=approved&payment_id=111222333&status=approved&external_reference=null&payment_type=bank_transfer&merchant_order_id=99&preference_id=' + PREF.feira + '&site_id=MLB&processing_mode=aggregator&merchant_account_id=null');
    await a.pg.waitForFunction(() => document.querySelector('main').getAttribute('data-texto') === 'a_conferir');
    await a.pg.waitForTimeout(500);
    assert.doesNotMatch(a.pg.url(), /payment_id|collection|preference_id|status=/, 'parâmetros do pagamento saem do endereço');
    assert.equal((await compras(a.pg)).length, 0, 'URL aprovada sem o servidor: Purchase nenhum');
    assert.ok((await filaPixel(a.pg)).some((x) => x[1] === 'PageView'));
    assert.deepEqual(a.erros, []);
    await a.ctx.close();
    // 2) servidor confirma: um Purchase, com o valor do link e eventID = payment_id; a recarga não repete
    const prazo = new Date(Date.now() + 71 * H).toISOString();
    const b = await paginaApi(nav, base, { pedido: PEDIDO_CHEIO(), api: {
      confirmarPagamento: { status: 200, json: { ok: true, status: 'pago' } },
      consultarPedido: { status: 200, json: { ok: true, status: 'pago', prazo_fim: prazo, entrega_prevista_em: prazo } }
    } });
    await b.pg.goto(base + '/obrigado/?collection_status=approved&payment_id=111222333&preference_id=' + PREF.feira);
    await b.pg.waitForFunction(() => document.querySelector('main').getAttribute('data-texto') === 'aprovado');
    const c1 = await compras(b.pg);
    assert.equal(c1.length, 1);
    assert.deepEqual(c1[0].slice(2), [{ value: 297, currency: 'BRL' }, { eventID: '111222333' }]);
    assert.match(await b.pg.textContent('#obrigado-servidor'), /O prazo de 72 h começou\./);
    await b.pg.goto(base + '/obrigado/?collection_status=approved&payment_id=111222333&preference_id=' + PREF.feira);
    await b.pg.waitForFunction(() => document.querySelector('main').getAttribute('data-texto') === 'aprovado');
    await b.pg.waitForTimeout(300);
    assert.equal((await compras(b.pg)).length, 0, 'payment_id já medido');
    assert.deepEqual(b.erros, []);
    await b.ctx.close();
    // 3) pago fora do horário: o servidor só liga o relógio às 11h do próximo dia de atendimento
    const longe = new Date(Date.now() + 90 * H).toISOString();
    const c = await paginaApi(nav, base, { pedido: PEDIDO_CHEIO(), api: {
      confirmarPagamento: { status: 200, json: { ok: true, status: 'pago' } },
      consultarPedido: { status: 200, json: { ok: true, status: 'pago', prazo_fim: longe, entrega_prevista_em: longe } }
    } });
    await c.pg.goto(base + '/obrigado/?collection_status=approved&payment_id=111222334&preference_id=' + PREF.feira);
    await c.pg.waitForFunction(() => document.querySelector('#obrigado-servidor').getAttribute('data-linha') === 'pago_depois');
    assert.match(await c.pg.textContent('#obrigado-servidor'), /começa às 11h do próximo dia de atendimento/);
    assert.doesNotMatch(await c.pg.textContent('#obrigado-servidor'), /começou/);
    await c.ctx.close();
    // 4) pendente e teste: nada; sem consentimento: nem o Pixel carrega
    const d = await paginaApi(nav, base, { pedido: PEDIDO_CHEIO(), api: { consultarPedido: { status: 200, json: { ok: true, status: 'teste_ok' } }, confirmarPagamento: { status: 200, json: { ok: true, status: 'teste_ok' } } } });
    await d.pg.goto(base + '/obrigado/?collection_status=pending&payment_id=444555666');
    await d.pg.waitForTimeout(300);
    assert.equal((await compras(d.pg)).length, 0);
    await d.pg.goto(base + '/obrigado/?pago=mp&produto=pa-teste&collection_status=approved&payment_id=444555667&preference_id=' + PREF.feira);
    await d.pg.waitForFunction(() => document.querySelector('main').getAttribute('data-texto') === 'teste_ok');
    await d.pg.waitForTimeout(300);
    assert.equal((await compras(d.pg)).length, 0, 'o pagamento de teste nunca vira Purchase');
    await d.pg.evaluate(() => localStorage.removeItem('creat:consentimento'));
    await d.pg.goto(base + '/obrigado/?collection_status=approved&payment_id=777888999&preference_id=' + PREF.feira);
    await d.pg.waitForTimeout(300);
    assert.equal(await d.pg.evaluate(() => typeof window.fbq), 'undefined');
    await d.ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('navegador: Clarity só na home; /abrir/ e /obrigado/ carregam o Pixel e nunca o Clarity', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, erros, clarity } = await pagina(nav, base, { clarity: true });
    await pg.goto(base + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela&p=1'); await pg.waitForTimeout(400);
    await pg.goto(base + '/obrigado/?collection_status=approved&payment_id=5555666677&preference_id=' + PREF.inaug); await pg.waitForTimeout(400);
    assert.ok((await filaPixel(pg)).some((a) => a[1] === 'PageView'), 'Pixel ligado em /obrigado/');
    assert.deepEqual(clarity, [], 'nenhuma requisição ao Clarity em /abrir/ nem em /obrigado/');
    await pg.goto(base + '/'); await pg.waitForTimeout(600);
    assert.ok(clarity.includes('/'), 'na home, com o aceite, o Clarity carrega');
    assert.equal(await pg.getAttribute('#nome', 'data-clarity-mask'), 'True');
    assert.deepEqual(erros, []);
  } finally { await nav.close(); srv.close(); }
});

test('navegador: em /abrir/ sem escolha o banner aparece; aceitar liga o Pixel e "Preferências de medição" revoga', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, erros } = await pagina(nav, base, { consentir: false });
    await pg.goto(base + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela&p=1'); await pg.waitForTimeout(300);
    assert.equal(await pg.isVisible('#consentimento'), true, 'quem pulou o banner da home decide aqui');
    assert.equal(await pg.evaluate(() => typeof window.fbq), 'undefined', 'nada carrega antes do Aceitar');
    // mutirão 11/11: o botão fixo de pagar não some com o banner; a faixa fica em cima e não cobre a barra
    assert.equal(await pg.isVisible('#barra-pagar'), true, 'botão de pagar visível mesmo sem a escolha de medição');
    const sobre = await pg.evaluate(() => { const c = document.querySelector('#consentimento').getBoundingClientRect(), b = document.querySelector('#barra-pagar').getBoundingClientRect(); return c.bottom > b.top && c.top < b.bottom; });
    assert.equal(sobre, false, 'banner e barra de pagar não se sobrepõem');
    await pg.click('#consentimento [data-consentir="sim"]');
    assert.ok((await filaPixel(pg)).some((a) => a[1] === 'PageView'));
    assert.equal(await pg.isVisible('#consentimento'), false);
    assert.equal(await pg.isVisible('#barra-pagar'), true);
    // revogar de dentro do pedido
    await pg.click('footer [data-preferencias]');
    assert.equal(await pg.isVisible('#consentimento'), true);
    await Promise.all([pg.waitForEvent('load'), pg.click('#consentimento [data-consentir="nao"]')]);
    await pg.waitForTimeout(300);
    assert.equal(await pg.evaluate(() => typeof window.fbq), 'undefined', 'depois de recusar a página recarrega sem Pixel');
    assert.equal(JSON.parse(await pg.evaluate(() => localStorage.getItem('creat:consentimento'))).pixel, false);
    // /obrigado/ também tem o link no rodapé; termos e privacidade levam à home com #preferencias
    await pg.goto(base + '/obrigado/'); assert.equal(await pg.locator('footer [data-preferencias]').count(), 1);
    await pg.goto(base + '/termos/'); await pg.click('footer a[href="../#preferencias"]'); await pg.waitForTimeout(300);
    assert.equal(await pg.isVisible('#consentimento'), true, 'a home abre a escolha vinda de #preferencias');
    assert.doesNotMatch(pg.url(), /#preferencias/);
    assert.deepEqual(erros, []);
  } finally { await nav.close(); srv.close(); }
});

test('navegador: home sem contador, com "preço de inauguração"; WhatsApp flutuante fora do campo do nome; "Ver a prévia de novo" abre a prévia', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, erros } = await pagina(nav, base);
    await pg.goto(base + '/?nicho=salao&utm_source=meta&utm_medium=pago&utm_campaign=salvador-rms&utm_content=A1-salao-v1');
    await pg.waitForFunction(() => !document.querySelector('.cartao-preco.abertura [data-se="inauguracao"]').hidden);
    const precos = await pg.innerText('#precos');   // só o texto visível
    assert.doesNotMatch(precos, /Restam|Resta 1|Vagas de produção hoje|primeiras vagas/);
    assert.match(precos, /preço de inauguração/i);
    for (const k of ['varias-vagas', 'ultima-vaga', 'vagas-hoje', 'vagas-esgotadas']) assert.equal(await pg.locator('[data-se="' + k + '"]:visible').count(), 0, k);
    // o centro do campo do nome é o próprio campo, nunca o botão flutuante do WhatsApp
    await pg.waitForTimeout(300);
    const alvo = await pg.evaluate(() => { const r = document.querySelector('#nome').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e && (e.id || e.className); });
    assert.equal(alvo, 'nome');
    assert.equal(await pg.isVisible('.zap-flutuante'), false, 'com o hero na tela o flutuante fica fora');
    // "Ver a prévia de novo" (vindo de /abrir/) abre a prévia e o contador mostra o tamanho do nome
    await pg.goto(base + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela&c=Salvador&p=1');
    await pg.click('#abrir-voltar');
    await pg.waitForFunction(() => { const e = document.querySelector('#previa'); return !!e && !e.hidden; });
    assert.equal(await pg.textContent('#previa-nome'), 'Studio Bela');
    assert.equal(await pg.textContent('#contador-giz'), '11 de 40');
    assert.doesNotMatch(pg.url(), /Studio|Salvador|ver=1/);
    assert.deepEqual(erros, []);
  } finally { await nav.close(); srv.close(); }
});

test('navegador: nome de 40 letras sem espaço não cria rolagem lateral em /abrir/ nem em /obrigado/', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, erros } = await pagina(nav, base);
    const nome = 'A'.repeat(40);
    await pg.goto(base + '/abrir/#plano=vitrine&k=salao&n=' + nome + '&c=Salvador&p=1'); await pg.waitForTimeout(300);
    assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth) <= 390, '/abrir/');
    await pg.evaluate((n) => localStorage.setItem('creat:pedido:v1', JSON.stringify({ id: 'PA-ABCDEFGH', plano: 'vitrine', nicho: 'salao', negocio: n, cidade: 'Salvador', responsavel: 'Maria', whatsapp_negocio: '5571991234567', endereco: 'Rua A, 10, Centro, Salvador-BA, 40000-000', horarios: 'seg=09:00-18:00', email: 'a@b.com', origem: 'direto', previa: 'x', aceite_termos: 'x', paleta: 1, salvo_em: new Date().toISOString() })), nome);
    await pg.goto(base + '/obrigado/'); await pg.waitForTimeout(300);
    assert.equal(await pg.textContent('#obrigado-negocio'), nome);
    assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth) <= 390, '/obrigado/');
    // "Esquecer meus dados" em /obrigado/ apaga tudo do site, inclusive a cópia da aba de /abrir/
    await Promise.all([pg.waitForEvent('load'), pg.click('#esquecer')]);
    const sobrou = await pg.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) => k.startsWith('creat:')));
    assert.deepEqual(sobrou, []);
    assert.deepEqual(erros, []);
  } finally { await nav.close(); srv.close(); }
});

/* ======================================================================
   Onda 2, pacote 2A (10/11/2026): pedido no servidor, estados de /obrigado/, contador, link de teste e aviso honesto.
   Contrato: docs/PEDIDO-API.md. As regras do servidor (schema/pedido-regras.mjs) julgam o que a página manda.
   ====================================================================== */
const REGRAS = await import(new URL('../../schema/pedido-regras.mjs', import.meta.url));
const { lerPedidoTexto } = require('../producao/lib/pedido.cjs');
const PEDIDO_CHEIO = () => ({
  id: 'PA-7K3QX2MD4R', segredo: 'q1Zr8Xn4Lw0bT6yHc9VfEA', produto: 'pa-abertura-inauguracao-2026-11', valor: 297, praca: 'feira',
  link: link(PREF.feira), plano: 'vitrine', nicho: 'salao', negocio: 'Studio Bela & Cia', cidade: 'Feira de Santana',
  responsavel: 'Maria Souza', whatsapp_negocio: '5575900000000', endereco: 'Rua das Flores, 120, Centro, Feira de Santana-BA, 44001-000',
  horarios: 'seg=09:00-18:00;ter=09:00-18:00;qua=09:00-18:00;qui=09:00-18:00;sex=09:00-18:00;sab=09:00-13:00;dom=fechado',
  email: 'maria@exemplo.com.br', origem: 'utm_source=meta;utm_campaign=feira;utm_content=A1-salao-v1', previa: 'http://x/previa/#k=salao&n=Studio&p=1',
  aceite_termos: '2026-11-10T10:00:00-03:00 termos-v1', paleta: 1, salvo_em: new Date().toISOString(), status: 'enviado'
});
const limpar = (o) => JSON.parse(JSON.stringify(o));

test('2A pedido: id PA- e 10, segredo de 128 bits no formato que o servidor aceita, sem repetir', () => {
  const V = carregar().Vitrine, ids = new Set(), seg = new Set();
  for (let i = 0; i < 300; i++) {
    const id = V.novoId(), s = V.novoSegredo();
    assert.match(id, REGRAS.RE.pedidoId); assert.match(s, REGRAS.RE.segredo); assert.equal(s.length, 22);
    ids.add(id); seg.add(s);
  }
  assert.equal(ids.size, 300); assert.equal(seg.size, 300);
});

test('2A volta: cada URL de volta vira o estado certo (lerVolta + estadoDaVolta)', () => {
  const V = carregar({ href: 'http://creat.local/obrigado/' }).Vitrine;
  const e = (q) => V.estadoDaVolta(V.lerVolta(q));
  const casos = [
    ['?pago=mp&produto=pa-abertura-inauguracao&collection_status=approved&payment_id=123', 'aprovado'],
    ['?pago=mp&produto=pa-abertura-inauguracao&collection_status=rejected&payment_id=123', 'recusado'],
    ['?pago=mp&produto=pa-abertura-inauguracao&status=cancelled', 'recusado'],
    ['?pago=mp&produto=pa-teste&resultado=recusado', 'recusado'],
    ['?pago=mp&produto=pa-abertura-inauguracao&resultado=pendente', 'pendente'],
    ['?collection_status=in_process&payment_id=55', 'pendente'],
    ['', 'sem_retorno'],
    ['?pago=mp&produto=pa-abertura&collection_status=null&payment_id=null', 'sem_retorno'],
    ['?collection_status=approved', 'sem_retorno'],
    ['?espera=1', 'aguardando'],
    ['?assinatura=ok&plano=aberto', 'assinatura_ok'],
    ['?assinatura=cancelada', 'assinatura_cancelada'],
    ['?pago=mp&produto=pa-anual-aberto&collection_status=approved&payment_id=123', 'anual_pago'],
    ['?pago=mp&produto=pa-anual-vitrine&status=approved&payment_id=123', 'anual_pago'],
    ['?pago=mp&produto=pa-teste&resultado=aprovado&payment_id=188866285972', 'teste_ok'],
    ['?pago=mp&produto=pa-bastidores&collection_status=approved&payment_id=123', 'bastidores_pago']
  ];
  for (const [q, esperado] of casos) assert.equal(e(q), esperado, q);
  const v = limpar(V.lerVolta('?collection_status=approved&payment_id=188866285972&payment_type=bank_transfer&produto=pa-abertura-inauguracao&praca=feira&preference_id=' + PREF.feira));
  assert.equal(v.meio, 'pix'); assert.equal(v.praca, 'feira'); assert.equal(v.produto, 'pa-abertura-inauguracao'); assert.equal(v.preferencia, PREF.feira);
  assert.equal(V.lerVolta('?payment_type=credit_card').meio, 'cartao');
  assert.equal(V.lerVolta('?produto=<script>&plano=ouro&praca=marte').produto, null, 'produto fora do formato é ignorado');
});

test('2A registro: o corpo que a página manda passa no validarRegistro do servidor, sem chave a mais e abaixo de 2 KB', () => {
  const V = carregar().Vitrine;
  const corpo = limpar(V.corpoRegistro(PEDIDO_CHEIO(), ''));
  const r = REGRAS.validarRegistro(corpo);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(Object.keys(corpo).sort(), ['cidade', 'consentimento_dados', 'email', 'endereco', 'horarios', 'hp', 'id', 'negocio', 'nicho', 'plano', 'praca', 'produto', 'responsavel', 'segredo', 'termos_versao', 'teste', 'utm_campaign', 'utm_content', 'utm_source', 'valor', 'whatsapp']);
  assert.equal(corpo.teste, false); assert.equal(corpo.consentimento_dados, true);
  assert.equal(corpo.utm_content, 'A1-salao-v1'); assert.equal(corpo.praca, 'feira');
  assert.ok(Buffer.byteLength(JSON.stringify(corpo)) < 2048);
  // pa-teste e padrão também passam; sem origem, as utm vão nulas
  const t = PEDIDO_CHEIO(); t.produto = 'pa-teste'; t.valor = 1; t.praca = null; t.origem = 'direto';
  assert.equal(REGRAS.validarRegistro(limpar(V.corpoRegistro(t, ''))).ok, true);
  const p = PEDIDO_CHEIO(); p.produto = 'pa-abertura-2026-11'; p.valor = 497;
  assert.equal(REGRAS.validarRegistro(limpar(V.corpoRegistro(p, ''))).ok, true);
});

test('2A contador: corpo do contar sem dado pessoal, aceito pelo normalizarContagem do servidor', () => {
  const ctx = carregar(), V = ctx.Vitrine;
  V.guardarOrigem({ utm_source: 'meta', utm_campaign: 'feira', utm_content: 'A1-salao-v1' });
  const c = limpar(V.corpoContagem('clique_pagar', 'salao'));
  assert.deepEqual(c, { evento: 'clique_pagar', nicho: 'salao', praca: 'feira', utm_content: 'A1-salao-v1' });
  assert.deepEqual(limpar(REGRAS.normalizarContagem(c)), { conferencia: false, evento: 'clique_pagar', nicho: 'salao', praca: 'feira', anuncio: 'A1-salao-v1' });
  for (const ev of ['visita', 'previa', 'ida_pagamento', 'clique_pagar']) assert.ok(REGRAS.normalizarContagem(limpar(V.corpoContagem(ev, 'barbearia'))), ev);
  assert.equal(limpar(V.corpoContagem('visita', 'clinica')).nicho, 'outro');
});

test('2A PEDIDO v1 no WhatsApp: frase de gente na 1ª linha, linhas do pagamento depois do aceite, pedido enxuto sem dado pessoal', () => {
  const V = carregar().Vitrine, p = PEDIDO_CHEIO();
  const m = V.mensagemPedido(p, 'aprovado', { pagamento: 'aprovado', paymentId: '188866285972', produto: 'pa-abertura-inauguracao-2026-11', valor: 297 });
  const [abre, branco, ...resto] = m.split('\n');
  assert.equal(abre, 'Oi! Acabei de pagar a Abertura do Porta Aberta. Segue o meu pedido:');
  assert.equal(branco, '');
  assert.equal(resto[0], 'PEDIDO v1');
  assert.deepEqual(resto.slice(-4), ['pagamento: aprovado', 'mp_pagamento: 188866285972', 'produto: pa-abertura-inauguracao-2026-11', 'valor: 297']);
  assert.doesNotMatch(m, /segredo|q1Zr8Xn4/, 'o segredo nunca vai ao WhatsApp');
  assert.doesNotMatch(V.mensagemPedido(p, 'pendente', { pagamento: 'pendente', paymentId: '123' }), /mp_pagamento/, 'número fora do formato não entra');
  // o bloco PEDIDO v1 (sem as linhas novas) continua lido pelo produzir.mjs
  assert.equal(lerPedidoTexto(V.textoPedido(p)).id, 'PA-7K3QX2MD4R');
  const enx = Object.assign({}, p, { enxuto: true }); for (const k of ['responsavel', 'whatsapp_negocio', 'endereco', 'horarios', 'email']) delete enx[k];
  assert.equal(V.mensagemPedido(enx, 'aprovado', { paymentId: '188866285972' }), 'Oi! Acabei de pagar a Abertura do Porta Aberta. Meu pedido é PA-7K3QX2MD4R, pagamento nº 188866285972.');
});

test('2A PEDIDO v1 inteiro do WhatsApp (frase + linhas do pagamento) passa no leitor da produção', () => {
  // fecho F2: lerPedidoTexto descarta a frase antes de "PEDIDO v1" e aceita e ignora as 4 linhas do pagamento
  const V = carregar().Vitrine;
  const m = V.mensagemPedido(PEDIDO_CHEIO(), 'aprovado', { pagamento: 'aprovado', paymentId: '188866285972', produto: 'pa-abertura-inauguracao-2026-11', valor: 297 });
  const lido = lerPedidoTexto(m);
  assert.equal(lido.id, 'PA-7K3QX2MD4R');
  assert.deepEqual(lido, lerPedidoTexto(V.textoPedido(PEDIDO_CHEIO())), 'a frase e o pagamento não entram no pedido');
  for (const k of ['pagamento', 'mp_pagamento', 'produto', 'valor']) assert.equal(k in lido, false, k);
});

test('2A aparelho: link de pagamento guardado volta a passar por linkValido na leitura (nunca javascript:)', () => {
  const ctx = carregar(), V = ctx.Vitrine, ls = ctx.localStorage;
  ls.setItem('creat:pedido:v1', JSON.stringify(Object.assign(PEDIDO_CHEIO(), { salvo_em: iso(1 * H), link: 'javascript:alert(1)' })));
  assert.equal(V.lerPedidoSalvo().link, null);
  ls.setItem('creat:pedido:v1', JSON.stringify(Object.assign(PEDIDO_CHEIO(), { salvo_em: iso(1 * H), link: 'https://mercadopago.com.br.golpe.example/x' })));
  assert.equal(V.lerPedidoSalvo().link, null);
  const bom = link(PREF.feira);
  ls.setItem('creat:pedido:v1', JSON.stringify(Object.assign(PEDIDO_CHEIO(), { salvo_em: iso(1 * H), link: bom })));
  assert.equal(V.lerPedidoSalvo().link, bom);
});

test('2A aparelho: dado pessoal sai em 7 dias (id e segredo ficam até 30); pedido antigo sem segredo some em 7 dias', () => {
  const ctx = carregar(), V = ctx.Vitrine, ls = ctx.localStorage, dia = 24 * H;
  ls.setItem('creat:pedido:v1', JSON.stringify(Object.assign(PEDIDO_CHEIO(), { salvo_em: iso(8 * dia) })));
  const e = limpar(V.lerPedidoSalvo());
  assert.equal(e.enxuto, true); assert.equal(e.id, 'PA-7K3QX2MD4R'); assert.equal(e.segredo, 'q1Zr8Xn4Lw0bT6yHc9VfEA');
  for (const k of ['responsavel', 'whatsapp_negocio', 'endereco', 'horarios', 'email', 'previa', 'aceite_termos']) assert.equal(k in e, false, k);
  assert.doesNotMatch(ls.getItem('creat:pedido:v1'), /maria@|5575900000000|Rua das Flores|Maria Souza/);
  ls.setItem('creat:pedido:v1', JSON.stringify(Object.assign(JSON.parse(ls.getItem('creat:pedido:v1')), { salvo_em: iso(31 * dia) })));
  assert.equal(V.lerPedidoSalvo(), null); assert.equal(ls.getItem('creat:pedido:v1'), null);
  const antigo = Object.assign(PEDIDO_CHEIO(), { id: 'PA-ABCDEFGH', segredo: undefined, salvo_em: iso(8 * dia) });
  ls.setItem('creat:pedido:v1', JSON.stringify(antigo));
  assert.equal(V.lerPedidoSalvo(), null);
  ls.setItem('creat:pedido:v1', JSON.stringify(Object.assign(antigo, { salvo_em: iso(1 * H) })));
  assert.equal(V.lerPedidoSalvo().id, 'PA-ABCDEFGH', 'o pedido antigo de 8 continua valendo até 7 dias');
});

/* ---- navegador: API simulada (window.__creatApi), corpos guardados para conferir com as regras do servidor */
async function paginaApi(navegador, base, opcoes = {}) {
  const ctx = await navegador.newContext(opcoes.desktop ? { viewport: { width: 1440, height: 900 } } : { viewport: { width: opcoes.w || 390, height: opcoes.h || 844 }, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  const erros = []; pg.on('pageerror', (e) => erros.push(e.message));
  const api = [];
  await pg.addInitScript(() => { window.__creatApi = '/api/pa/'; });
  await pg.route(/^https:\/\/(connect\.facebook\.net|www\.clarity\.ms|fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await pg.route(/mercadopago\.com\.br/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>mp</p>' }));
  await pg.route('**/api/pa/**', async (r) => {
    const nome = r.request().url().split('/api/pa/')[1];
    let corpo = null; try { corpo = JSON.parse(r.request().postData() || 'null'); } catch (e) { corpo = 'invalido'; }
    api.push({ nome, corpo });
    const resp = opcoes.api && opcoes.api[nome];
    if (resp === 'abortar') return r.abort();
    if (resp && resp.atraso) await new Promise((ok) => setTimeout(ok, resp.atraso));
    if (resp && resp.status) return r.fulfill({ status: resp.status, contentType: 'application/json', body: JSON.stringify(resp.json || {}) });
    if (nome === 'contar') return r.fulfill({ status: 204, body: '' });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nome === 'consultarPedido' ? { ok: true, status: 'aguardando_pagamento' } : nome === 'confirmarPagamento' ? { ok: false, motivo: 'nao_confirmado' } : { ok: true }) });
  });
  await pg.goto(base + '/termos/');
  if (opcoes.consentir !== false) await pg.evaluate(() => localStorage.setItem('creat:consentimento', JSON.stringify({ versao: 1, analytics: true, pixel: true, clarity: true, em: new Date().toISOString() })));
  if (opcoes.pedido) await pg.evaluate((p) => localStorage.setItem('creat:pedido:v1', JSON.stringify(p)), opcoes.pedido);
  return { pg, ctx, erros, api };
}
// Só o indispensável (compra curta): WhatsApp, e-mail e aceite. completo: abre o bloco recolhido e adianta nome,
// endereço e horário (com a confirmação do horário marcada).
async function preencherAbrir(pg, opcoes = {}) {
  await pg.fill('#p-whatsapp', '75900000000');
  await pg.fill('#p-email', 'maria@exemplo.com.br');
  if (opcoes.completo) {
    if (!(await pg.evaluate(() => document.querySelector('#p-depois').open))) await pg.click('#p-depois summary');
    await pg.fill('#p-responsavel', 'Maria Souza');
    await pg.fill('#p-endereco', 'Rua das Flores, 120, Centro, Feira de Santana-BA, 44001-000');
    await pg.check('#p-horarios-confirmo');
  }
  await pg.check('#p-aceite');
}
const visivel = (pg, s) => pg.evaluate((x) => { const e = document.querySelector(x); return !!(e && !e.closest('[hidden]') && e.getClientRects().length); }, s);

test('2A navegador: /obrigado/ nos 6 estados da volta, cada um com título, texto, botão e WhatsApp próprios', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const casos = [
      { q: '?pago=mp&produto=pa-abertura-inauguracao&collection_status=approved&payment_id=123', texto: 'a_conferir', titulo: /conferindo/i, botao: /WhatsApp/, form: true, relogio: false, zap: /Paguei a Abertura/ },
      { q: '?pago=mp&produto=pa-abertura-inauguracao&collection_status=rejected&payment_id=123', texto: 'recusado', titulo: /não passou/, botao: /^Tentar de novo$/, href: /\/abrir\//, form: false, relogio: false, zap: /Tentei pagar/, notas: true },
      { q: '?pago=mp&produto=pa-abertura-inauguracao&resultado=pendente', texto: 'pendente', titulo: /Pix espera/, botao: /Voltar para o pagamento/, href: /\/abrir\//, form: true, relogio: false, zap: /Gerei o Pix/, notas: true },
      { q: '', texto: 'sem_retorno', titulo: /ainda não pagou/, botao: /Voltar para o pagamento/, href: /\/abrir\//, form: true, relogio: false, zap: /dúvida sobre o pagamento/ },
      { q: '?assinatura=ok&plano=aberto', texto: 'assinatura_ok', titulo: /Assinatura ativa/, lead: /Aberto/, botao: /portal do assinante/i, href: /billing\.stripe\.com/, form: false, relogio: false, zap: /Assinei o plano Aberto/ },
      { q: '?pago=mp&produto=pa-anual-aberto&collection_status=approved&payment_id=123', texto: 'anual_conferir', titulo: /Mercado Pago aprovou o plano anual/, lead: /Aberto anual\. A equipe confere/, semLead: /Recebemos/, botao: /WhatsApp/, form: false, relogio: false, zap: /anual/ },
      { q: '?pago=mp&produto=pa-bastidores&collection_status=approved&payment_id=123', texto: 'bastidores_conferir', titulo: /Mercado Pago aprovou o Bastidores/, lead: /A equipe confere/, botao: /WhatsApp/, form: false, relogio: false, zap: /Bastidores/ }
    ];
    for (const c of casos) {
      const { pg, ctx, erros } = await paginaApi(nav, base, { consentir: false });
      await pg.goto(base + '/obrigado/' + c.q);
      await pg.waitForFunction((t) => document.querySelector('main').getAttribute('data-texto') === t, c.texto);
      assert.match(await pg.textContent('#obrigado-titulo'), c.titulo, c.q);
      if (c.lead) assert.match(await pg.textContent('#obrigado-lead'), c.lead, c.q);
      if (c.semLead) assert.doesNotMatch(await pg.textContent('#obrigado-lead'), c.semLead, c.q);
      // recebedor (CNPJ) e os 7 dias para desistir: só onde a pessoa ainda vai pagar ou tentar de novo
      assert.equal(await visivel(pg, '#obrigado-notas-pagar'), !!c.notas, 'recebedor e desistir: ' + c.q);
      if (c.notas) assert.match(await pg.textContent('#obrigado-notas-pagar'), /CNPJ 57\.068\.874.*7 dias para desistir/s, c.q);
      assert.match((await pg.textContent('#obrigado-botao')).trim(), c.botao, c.q);
      if (c.href) assert.match(await pg.getAttribute('#obrigado-botao', 'href'), c.href, c.q);
      // detalhes do formulário de dados (fechado no "sem retorno"), relógio e o "Ainda não pagou" antigo
      assert.equal(await visivel(pg, '#obrigado-sem-dados'), c.form, 'formulário: ' + c.q);
      assert.equal(await visivel(pg, '.relogio'), c.relogio, 'relógio: ' + c.q);
      assert.equal(await pg.locator('text=Ainda não pagou?').count(), 0, c.q);
      assert.match(decodeURIComponent(await pg.getAttribute('header [data-zap]', 'href')), c.zap, 'WhatsApp do cabeçalho (PG-08): ' + c.q);
      assert.doesNotMatch(pg.url(), /payment_id|collection|status|assinatura|produto|resultado/, 'endereço limpo: ' + c.q);
      assert.ok(await pg.evaluate(() => document.documentElement.scrollWidth) <= 390, 'sem rolagem lateral: ' + c.q);
      assert.deepEqual(erros, [], c.q);
      await ctx.close();
    }
    // recusado e pendente com o pedido no aparelho: o pedido não vira "enviar no WhatsApp"; o relógio aparece no pendente
    const { pg, ctx } = await paginaApi(nav, base, { pedido: PEDIDO_CHEIO() });
    await pg.goto(base + '/obrigado/?pago=mp&produto=pa-abertura-inauguracao&collection_status=rejected&payment_id=123');
    await pg.waitForFunction(() => document.querySelector('main').getAttribute('data-texto') === 'recusado');
    assert.equal(await visivel(pg, '#obrigado-pedido'), false); assert.equal(await visivel(pg, '#obrigado-sem-dados'), false);
    assert.match(await pg.getAttribute('#obrigado-botao', 'href'), /\/abrir\/#plano=vitrine&k=salao&n=Studio/, 'Tentar de novo volta ao plano guardado');
    await pg.goto(base + '/obrigado/?pago=mp&produto=pa-abertura-inauguracao&resultado=pendente');
    await pg.waitForFunction(() => document.querySelector('main').getAttribute('data-texto') === 'pendente');
    assert.equal(await visivel(pg, '.relogio'), true);
    assert.match(await pg.textContent('#enviar-titulo'), /^Seu pedido: Studio Bela & Cia$/, 'sem artigo fixo (PG-N4)');
    await ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('2A navegador: aprovado só vira "confirmado" com o servidor; recibo de 3 linhas, relógio real e "Ainda não pagou" fora', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const prazo = new Date(Date.now() + 71 * H).toISOString();
    const { pg, ctx, erros, api } = await paginaApi(nav, base, { pedido: PEDIDO_CHEIO(), api: {
      confirmarPagamento: { status: 200, json: { ok: true, status: 'pago' } },
      consultarPedido: { status: 200, json: { ok: true, status: 'pago', prazo_fim: prazo, entrega_prevista_em: prazo, recibo: { pedido: 'PA-7K3QX2MD4R', produto: 'Abertura do site (preço de inauguração)', valor: 297, meio: 'Mercado Pago', pagamento: '188866285972' } } }
    } });
    await pg.goto(base + '/obrigado/?pago=mp&produto=pa-abertura-inauguracao&praca=feira&collection_status=approved&payment_id=188866285972&payment_type=bank_transfer&preference_id=' + PREF.feira);
    await pg.waitForFunction(() => document.querySelector('main').getAttribute('data-texto') === 'aprovado');
    assert.match(await pg.textContent('#obrigado-titulo'), /Pagamento confirmado/);
    const recibo = await pg.innerText('#obrigado-recibo');
    assert.match(recibo, /R\$\u00a0297/, "R$ e o valor sem quebra"); assert.match(recibo, /Pix/); assert.match(recibo, /188866285972/);
    assert.match(await pg.textContent('#relogio-digitos'), /^(70|71):\d\d:\d\d$/, 'relógio conta do prazo_fim do servidor');
    const conf = api.find((a) => a.nome === 'confirmarPagamento');
    assert.deepEqual(conf.corpo, { payment_id: '188866285972', pedido_id: 'PA-7K3QX2MD4R', segredo: 'q1Zr8Xn4Lw0bT6yHc9VfEA' });
    assert.ok(api.every((a) => !/segredo/.test(a.nome)), 'o segredo só vai no corpo');
    // PV-16: com a resposta do servidor, e-mail, WhatsApp, endereço e responsável saem do aparelho
    const guardado = await pg.evaluate(() => localStorage.getItem('creat:pedido:v1'));
    assert.doesNotMatch(guardado, /maria@|5575900000000|Rua das Flores|Maria Souza/);
    assert.match(guardado, /"segredo":"q1Zr8Xn4Lw0bT6yHc9VfEA"/);
    assert.equal(await visivel(pg, '#bloco-whats'), false, 'servidor com o pedido: nada de reenviar pelo WhatsApp');
    // recarga: o estado volta da sessão da aba, sem os parâmetros na URL
    await pg.reload(); await pg.waitForFunction(() => document.querySelector('main').getAttribute('data-texto') === 'aprovado');
    assert.deepEqual(erros, []);
    await ctx.close();
    // função fora do ar: o WhatsApp vira o caminho, com a frase de gente e as linhas do pagamento
    const b = await paginaApi(nav, base, { pedido: PEDIDO_CHEIO(), api: { confirmarPagamento: 'abortar', consultarPedido: 'abortar', registrarPedido: 'abortar' } });
    await b.pg.goto(base + '/obrigado/?pago=mp&produto=pa-abertura-inauguracao&collection_status=approved&payment_id=188866285972&preference_id=' + PREF.feira);
    await b.pg.waitForFunction(() => !document.querySelector('#bloco-whats').hidden);
    const texto = await b.pg.textContent('#pedido-texto');
    assert.match(texto, /^Oi! Acabei de pagar a Abertura do Porta Aberta\. Segue o meu pedido:\n\nPEDIDO v1\n/);
    assert.match(texto, /pagamento: aprovado\nmp_pagamento: 188866285972\nproduto: pa-abertura-inauguracao-2026-11\nvalor: 297$/);
    await b.ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('2A navegador: com registrarPedido bloqueado, Pagar chega ao Mercado Pago em menos de 300 ms e checkout_iniciado sai', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    for (const modo of ['abortar', 'pendurado']) {
      const { pg, ctx, api } = await paginaApi(nav, base, { api: { registrarPedido: modo === 'abortar' ? 'abortar' : { atraso: 4000, status: 200, json: { ok: true } } } });
      await pg.goto(base + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela&c=Feira%20de%20Santana&p=1&utm_campaign=feira');
      await pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
      await preencherAbrir(pg);
      let tMp = 0; pg.on('request', (q) => { if (!tMp && /mercadopago\.com\.br/.test(q.url())) tMp = Date.now(); });
      const t0 = Date.now();
      const eventos = await pg.evaluate(() => { document.querySelector('.pagar [data-checkout]').click(); return window.__creatEventos.map((e) => e.evento); });
      await pg.waitForURL(/mercadopago/);
      const ms = tMp - t0;
      console.log('# 2A tempo até o Mercado Pago com registrarPedido ' + modo + ': ' + ms + ' ms');
      assert.ok(tMp && ms < 300, modo + ': ' + ms + ' ms');
      assert.ok(eventos.includes('checkout_iniciado'), 'checkout_iniciado sai');
      const reg = api.find((a) => a.nome === 'registrarPedido');
      assert.ok(reg, 'o pedido foi enviado no clique');
      assert.equal(REGRAS.validarRegistro(reg.corpo).ok, true, JSON.stringify(REGRAS.validarRegistro(reg.corpo)));
      assert.equal(reg.corpo.produto, 'pa-abertura-inauguracao-2026-11'); assert.equal(reg.corpo.valor, 297); assert.equal(reg.corpo.praca, 'feira');
      assert.ok(api.some((a) => a.nome === 'contar' && a.corpo.evento === 'clique_pagar'));
      await ctx.close();
    }
    // depois do ack do servidor (consultarPedido 200), não sobra e-mail nem WhatsApp no aparelho
    const { pg, ctx } = await paginaApi(nav, base);
    await pg.goto(base + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela&c=Feira%20de%20Santana&p=1');
    await pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    await preencherAbrir(pg);
    await Promise.all([pg.waitForURL(/mercadopago/), pg.click('.pagar [data-checkout]')]);
    await pg.goto(base + '/termos/');
    assert.match(await pg.evaluate(() => localStorage.getItem('creat:pedido:v1')), /maria@exemplo\.com\.br/, 'antes do ack o aparelho guarda o pedido inteiro');
    await pg.goto(base + '/obrigado/?pago=mp&produto=pa-abertura-inauguracao&resultado=pendente');
    await pg.waitForFunction(() => /"enxuto":true/.test(localStorage.getItem('creat:pedido:v1') || ''));
    const g = await pg.evaluate(() => localStorage.getItem('creat:pedido:v1'));
    assert.doesNotMatch(g, /maria@|75900000000|"whatsapp_negocio"|"email"/);
    await ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('2A navegador: link de teste mostra só o botão de R$ 1 e registra pa-teste; /abrir/ sem o parâmetro não mostra nada de teste', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const T = carregar().CREAT_CHECKOUT.teste, vale = Date.parse(T.valeAte) > Date.now();
    const { pg, ctx, api, erros } = await paginaApi(nav, base);
    await pg.goto(base + '/abrir/?teste=pa-teste#plano=vitrine&k=salao&n=Studio%20Bela&c=Feira%20de%20Santana&p=1');
    await pg.waitForFunction(() => !document.querySelector('[data-carregando-precos]') || document.querySelector('.pagar [data-checkout]').getAttribute('data-checkout') === 'teste');
    assert.equal(await pg.getAttribute('meta[name="robots"]', 'content'), 'noindex');
    assert.equal(await pg.locator('[data-checkout]:visible').count(), 1, 'um único botão de pagar');
    assert.equal(await visivel(pg, '#modo-teste'), true);
    if (vale) {
      assert.match((await pg.textContent('.pagar [data-checkout]')).trim(), /^Pagar R\$ 1 \(teste\)$/);
      assert.equal(await pg.getAttribute('.pagar [data-checkout]', 'href'), T.link);
      await preencherAbrir(pg);
      await Promise.all([pg.waitForURL(/mercadopago/), pg.click('.pagar [data-checkout]')]);
      const reg = api.find((a) => a.nome === 'registrarPedido');
      assert.equal(reg.corpo.produto, 'pa-teste'); assert.equal(reg.corpo.valor, 1);
      assert.equal(REGRAS.validarRegistro(reg.corpo).ok, true);
      assert.equal(api.filter((a) => a.nome === 'contar').length, 0, 'o link de teste não entra no contador');
    } else {
      assert.match(await pg.textContent('.pagar [data-checkout]'), /venceu/);
      assert.equal(await pg.getAttribute('.pagar [data-checkout]', 'aria-disabled'), 'true');
    }
    await pg.goto(base + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela&p=1');
    await pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    assert.equal(await visivel(pg, '#modo-teste'), false);
    assert.equal(await pg.locator('text=/R\\$ 1 \\(teste\\)/').count(), 0);
    assert.notEqual(await pg.getAttribute('.pagar [data-checkout]', 'href'), T.link);
    assert.deepEqual(erros, []);
    await ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('2A navegador: no desktop o pagamento abre em outra aba e esta aba vai a /obrigado/ esperando; no celular, mesma aba', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, ctx, erros } = await paginaApi(nav, base, { desktop: true });
    await pg.goto(base + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela&c=Feira%20de%20Santana&p=1');
    await pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    assert.equal(await pg.getAttribute('.pagar [data-checkout]', 'target'), '_blank');
    assert.equal(await pg.getAttribute('.pagar [data-checkout]', 'rel'), 'noopener noreferrer');
    await preencherAbrir(pg);
    const [aba] = await Promise.all([ctx.waitForEvent('page'), pg.click('.pagar [data-checkout]')]);
    await aba.waitForURL(/mercadopago/);
    await pg.waitForURL(/\/obrigado\//);
    await pg.waitForFunction(() => document.querySelector('main').getAttribute('data-estado') === 'aguardando');
    assert.match(await pg.textContent('#obrigado-titulo'), /outra aba/);
    assert.match(await pg.getAttribute('#obrigado-botao', 'href'), /mercadopago/);
    assert.deepEqual(erros, []);
    await ctx.close();
    const m = await paginaApi(nav, base);
    await m.pg.goto(base + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela&p=1');
    await m.pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    assert.equal(await m.pg.getAttribute('.pagar [data-checkout]', 'target'), null, 'celular: mesma aba (lá existe o Voltar à loja)');
    await m.ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('2A navegador: contador manda visita, prévia, ida ao pagamento e clique sem aceite e sem dado pessoal', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, ctx, api } = await paginaApi(nav, base, { consentir: false });
    await pg.goto(base + '/?nicho=salao&utm_source=meta&utm_campaign=feira&utm_content=A1-salao-v1');
    await pg.fill('#nome', 'Studio Bela'); await pg.click('#form-abrir [type=submit]');
    await pg.waitForFunction(() => { const e = document.querySelector('#previa'); return !!e && !e.hidden; });
    await pg.goto(base + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela&c=Feira%20de%20Santana&p=1');
    await pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    await preencherAbrir(pg);
    await Promise.all([pg.waitForURL(/mercadopago/), pg.click('.pagar [data-checkout]')]);
    const contagens = api.filter((a) => a.nome === 'contar').map((a) => a.corpo);
    assert.deepEqual(contagens.map((c) => c.evento), ['visita', 'previa', 'ida_pagamento', 'clique_pagar']);
    for (const c of contagens) {
      assert.deepEqual(Object.keys(c).sort(), ['evento', 'nicho', 'praca', 'utm_content']);
      assert.equal(c.nicho, 'salao'); assert.equal(c.praca, 'feira'); assert.equal(c.utm_content, 'A1-salao-v1');
    }
    assert.doesNotMatch(JSON.stringify(contagens), /Studio|Maria|maria@|75900000000|Feira de Santana/);
    await ctx.close();
  } finally { await nav.close(); srv.close(); }
});

// Controles do formulário na tela com algum ponto (centro e 4 cantos recuados) atrás do aviso de medição.
const COBERTOS = (sel) => [...document.querySelectorAll(sel + ' input:not([type=hidden]):not(#p-site), ' + sel + ' select, ' + sel + ' button, ' + sel + ' .chip, ' + sel + ' .aceite')].filter((e) => {
  const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= innerHeight) return false;
  const pts = [[.5, .5], [.15, .2], [.85, .2], [.15, .8], [.85, .8]].map(([fx, fy]) => [r.left + r.width * fx, r.top + r.height * fy]).filter(([, y]) => y > 0 && y < innerHeight);
  return pts.some(([x, y]) => { const el = document.elementFromPoint(x, y); return el && el.closest('#consentimento'); });
}).map((e) => e.id || e.className);

test('2A navegador: aviso de medição vira faixa de até 64 px com o formulário na tela, nunca cobre campo e avisa a hospedagem', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    for (const [w, h] of [[390, 844], [360, 640]]) {
      // home: o aviso aparece ao passar do hero; com o formulário na tela é faixa
      const { pg, ctx, erros } = await paginaApi(nav, base, { consentir: false, w, h });
      await pg.goto(base + '/?nicho=salao');
      await pg.evaluate(() => window.scrollTo(0, 400)); await pg.waitForTimeout(400);
      await pg.waitForSelector('#consentimento:not([hidden])');
      const faixa = await pg.evaluate(() => { const c = document.querySelector('#consentimento'); return { faixa: c.classList.contains('is-faixa'), h: c.getBoundingClientRect().height }; });
      assert.equal(faixa.faixa, true, w + ' home');
      assert.ok(faixa.h <= 64, w + ' home: ' + faixa.h + ' px');
      for (const y of [250, 400, 550, 700, 900]) {
        await pg.evaluate((yy) => window.scrollTo(0, yy), y); await pg.waitForTimeout(120);
        assert.deepEqual(await pg.evaluate(COBERTOS, '#form-abrir'), [], w + ' home y=' + y);
      }
      await pg.evaluate(() => window.scrollTo(0, 400)); await pg.waitForTimeout(120);

      // foco num campo: a faixa sai da frente
      await pg.focus('#cidade');
      assert.equal(await pg.evaluate(() => getComputedStyle(document.querySelector('#consentimento')).visibility), 'hidden');
      await pg.evaluate(() => document.activeElement.blur());
      // alvos >= 44 px e texto >= 11 px
      const medidas = await pg.evaluate(() => ({ botoes: [...document.querySelectorAll('#consentimento .btn')].map((b) => b.getBoundingClientRect().height), fonte: parseFloat(getComputedStyle(document.querySelector('#consentimento .cons-curto')).fontSize) }));
      assert.ok(medidas.botoes.every((x) => x >= 44), JSON.stringify(medidas)); assert.ok(medidas.fonte >= 11);
      // o "Aceitar" avisa a hospedagem (dataLayer, lido pelo b44-visitor-tracking no ar) e o "Recusar" também
      await pg.click('#consentimento [data-consentir="sim"]');
      assert.deepEqual(await pg.evaluate(() => JSON.parse(JSON.stringify(window.dataLayer))), [['consent', 'update', { analytics_storage: 'granted' }]]);
      assert.deepEqual(erros, []);
      await ctx.close();
      // /obrigado/: sempre faixa, e os campos do formulário ficam livres
      const o = await paginaApi(nav, base, { consentir: false, w, h });
      await o.pg.goto(base + '/obrigado/?pago=mp&produto=pa-abertura-inauguracao&collection_status=approved&payment_id=188866285972');
      await o.pg.waitForSelector('#consentimento:not([hidden])');
      assert.ok(await o.pg.evaluate(() => document.querySelector('#consentimento').classList.contains('is-faixa') && document.querySelector('#consentimento').getBoundingClientRect().height <= 64));
      for (const y of [300, 700, 1100, 1500]) {
        await o.pg.evaluate((yy) => window.scrollTo(0, yy), y); await o.pg.waitForTimeout(80);
        const cob = await o.pg.evaluate(COBERTOS, '#form-pedido');
        assert.deepEqual(cob, [], w + ' /obrigado/ y=' + y);
      }
      // a página reserva a altura da faixa no fim: rolando até o fim, o último botão fica livre
      await o.pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await o.pg.waitForTimeout(120);
      assert.deepEqual(await o.pg.evaluate(COBERTOS, '#form-pedido'), [], w + ' /obrigado/ fim');
      assert.deepEqual(o.erros, []);
      await o.ctx.close();
    }
  } finally { await nav.close(); srv.close(); }
});

test('2A páginas: meta do b44-visitor-tracking pede consentimento nas 8 páginas (index, abrir, obrigado, termos, privacidade, bastidores, previa e 404); selo "recomendado" fora do /obrigado/', () => {
  const PAGINAS = ['index.html', 'abrir/index.html', 'obrigado/index.html', 'termos/index.html', 'privacidade/index.html', 'bastidores/index.html', 'previa/index.html', '404.html'];
  assert.equal(PAGINAS.length, 8);
  for (const f of PAGINAS) {
    const html = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    assert.match(html, /<meta name="base44-visitor-tracking" content="consent" data-privacy-signals="honor">/, f);
    assert.equal(html.split('base44-visitor-tracking').length - 1, 1, f + ': uma meta só');
    assert.ok(html.indexOf('base44-visitor-tracking') < html.indexOf('</head>'), f + ': no head');
  }
  const ob = fs.readFileSync(path.join(RAIZ, 'obrigado/index.html'), 'utf8');
  // promessas antigas que contradizem os termos v2 (PV-05, PV-11, PV-N2): nenhuma nas páginas que o comprador lê
  const PROIBIDAS = [/recomendad/i, /No ar, você aprova/, /Nada vai ao ar sem/, /Site no ar em até/, /vão pelo seu próprio WhatsApp/, /arrependimento depois do pagamento/,
    /Endereço do site na Creat/, /andamento do seu pedido chega no seu WhatsApp/, /7 dias de arrependimento/,
    /Sem resposta em 7 dias/, /não responder em 7 dias/];   // aceite por silêncio guardado (conteudo/README.md, Textos guardados)
  for (const f of ['index.html', 'abrir/index.html', 'obrigado/index.html']) {
    const html = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    for (const r of PROIBIDAS) assert.doesNotMatch(html, r, f + ': ' + r);
  }
  const ab = fs.readFileSync(path.join(RAIZ, 'abrir/index.html'), 'utf8');
  assert.ok((ab.match(/No cartão, ou anual no Pix/g) || []).length >= 1, '/abrir/ diz "No cartão, ou anual no Pix" na conta do preço (PV-06)');
  // FAQ da home = conteudo/faq.json, palavra por palavra (o texto que a pessoa lê é o do conteúdo)
  const home = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const semTag = (t) => t.replace(/<span data-v="precos\.prazoHoras"><\/span>/g, '72').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  for (const it of JSON.parse(fs.readFileSync(path.join(RAIZ, 'conteudo/faq.json'), 'utf8')).itens) {
    const m = new RegExp('<details id="faq-' + it.id + '"><summary>(.*?)</summary><div class="resp"><p>(.*?)</p>').exec(home);
    assert.ok(m, 'faq ' + it.id);
    assert.equal(semTag(m[1]), it.pergunta, 'pergunta ' + it.id);
    assert.equal(semTag(m[2]), it.resposta.replace(/\{\{precos\.prazoHoras\}\}/g, '72'), 'resposta ' + it.id);
  }
  // "Como funciona" e "Quem monta" da home e de /abrir/ = conteudo/home.json (a promessa de aprovação muda num lugar só)
  const hj = JSON.parse(fs.readFileSync(path.join(RAIZ, 'conteudo/home.json'), 'utf8'));
  const passos = /<ol class="passos">([\s\S]*?)<\/ol>/.exec(home)[1].match(/<li>[\s\S]*?<\/li>/g).map((li) => [semTag(/<h3>(.*?)<\/h3>/.exec(li)[1]), semTag(/<p>(.*?)<\/p>/.exec(li)[1])]);
  assert.deepEqual(passos, hj.comoFunciona.passos.map((p) => [p.titulo, p.texto]), 'home: Como funciona');
  for (const [f, html] of [['index.html', home], ['abrir/index.html', ab]]) {
    const quem = /<ol class="quem-passos">([\s\S]*?)<\/ol>/.exec(html)[1].match(/<li>[\s\S]*?<\/li>/g).map(semTag);
    assert.deepEqual(quem, hj.quemMonta.passos.map((p) => p.titulo + ' ' + p.texto), f + ': Quem monta');
  }
  assert.doesNotMatch(ob, /recomendado/i);
  assert.match(ob, /<option value="" selected disabled>Escolha o plano<\/option>/);
  assert.doesNotMatch(fs.readFileSync(path.join(RAIZ, 'assets/vitrine.js'), 'utf8'), /'Pedido da '|abrir a ' \+|site da ' \+/, 'sem artigo fixo antes do nome (PG-N4)');
});

test('2A navegador: toque longo e clique do meio em Pagar também exigem o formulário e o aceite, e registram o pedido', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, ctx, api, erros } = await paginaApi(nav, base);
    await pg.goto(base + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela&c=Feira%20de%20Santana&p=1');
    await pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    const disparar = (tipo) => pg.evaluate((t) => {
      const b = document.querySelector('.pagar [data-checkout]');
      const ev = t === 'contextmenu' ? new MouseEvent('contextmenu', { bubbles: true, cancelable: true }) : new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
      return b.dispatchEvent(ev) === false;   // true = a página impediu (menu ou nova aba)
    }, tipo);
    assert.equal(await disparar('contextmenu'), true, 'sem formulário: o menu de "abrir em nova aba" não abre');
    assert.equal(await disparar('auxclick'), true, 'sem formulário: o clique do meio não abre a nova aba');
    assert.equal(await visivel(pg, '#p-resumo'), true, 'a pessoa vê o que falta');
    assert.equal(api.filter((a) => a.nome === 'registrarPedido').length, 0);
    await preencherAbrir(pg);
    assert.equal(await disparar('contextmenu'), false, 'formulário certo: o menu abre normalmente');
    await pg.waitForFunction(() => /"segredo"/.test(localStorage.getItem('creat:pedido:v1') || ''));
    await pg.waitForTimeout(200);
    const reg = api.find((a) => a.nome === 'registrarPedido');
    assert.ok(reg, 'o toque longo já registra o pedido com o aceite');
    assert.equal(REGRAS.validarRegistro(reg.corpo).ok, true);
    assert.deepEqual(erros, []);
    await ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('2A navegador: o exemplo do campo do nome segue o nicho do anúncio', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, ctx, erros } = await paginaApi(nav, base, { consentir: false });
    for (const [q, ex] of [['?nicho=salao', 'Exemplo: Studio da Ana'], ['?nicho=academia', 'Exemplo: Academia Ponto Forte'], ['?nicho=barbearia', 'Exemplo: Barbearia do Zé'], ['', 'Exemplo: Barbearia do Zé']]) {
      await pg.goto(base + '/' + q);
      await pg.waitForFunction(() => document.documentElement.classList.contains('js-pronto'));
      assert.equal(await pg.getAttribute('#nome', 'placeholder'), ex, q || 'sem nicho');
    }
    await pg.check('input[name="nicho"][value="salao"]', { force: true });
    assert.equal(await pg.getAttribute('#nome', 'placeholder'), 'Exemplo: Studio da Ana', 'trocar o nicho troca o exemplo');
    assert.deepEqual(erros, []);
    await ctx.close();
  } finally { await nav.close(); srv.close(); }
});

/* Primeira dobra (11/11/2026): em produção, cerca de 55 visitas de anúncio e nenhuma prévia, porque o campo do nome
   ficava fora da primeira tela do celular. Este teste trava o que a dobra nova garante. */
test('dobra no celular 360x640: título do nicho na chegada, campo e botão sem rolar, apóstrofo do teclado vale e a prévia conta', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, ctx, api } = await paginaApi(nav, base, { consentir: false });
    await pg.setViewportSize({ width: 360, height: 640 });
    await pg.goto(base + '/?nicho=salao&utm_source=meta&utm_campaign=feira&utm_content=A1-salao-v1');
    assert.equal(await pg.getAttribute('html', 'data-nicho'), 'salao');
    const visiveis = await pg.$$eval('h1 .h1-v, h1 [data-h1]', (els) => els.filter((e) => e.offsetParent !== null).map((e) => e.textContent.trim()));
    const h1 = (await pg.innerText('h1')).replace(/\s+/g, ' ').trim();
    assert.match(h1, /^Veja o site do seu salão pronto\.$/, 'o título fala do nicho do anúncio: ' + h1 + ' ' + JSON.stringify(visiveis));
    const m = await pg.evaluate(() => {
      const c = document.querySelector('#nome').getBoundingClientRect(), b = document.querySelector('#form-abrir [type=submit]').getBoundingClientRect();
      return { campoTopo: c.top, campoBaixo: c.bottom, botaoBaixo: b.bottom, botaoAlt: b.height, rotulo: document.querySelector('#form-abrir [type=submit]').textContent.trim(), lateral: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    assert.ok(m.campoTopo > 0 && m.campoBaixo < 640, 'campo do nome inteiro na primeira tela');
    assert.ok(m.botaoBaixo <= 600, 'botão inteiro na primeira tela: ' + m.botaoBaixo);
    assert.ok(m.botaoAlt >= 48, 'alvo de toque do botão');
    assert.equal(m.rotulo, 'Ver meu site pronto');
    assert.equal(m.lateral, false, 'sem rolagem lateral');
    await pg.fill('#nome', 'Studio D’Ávila'); await pg.keyboard.press('Enter');
    await pg.waitForFunction(() => { const e = document.querySelector('#previa'); return !!e && !e.hidden; });
    assert.equal(await pg.innerText('#previa-nome'), "Studio D'Ávila", 'o apóstrofo curvo do teclado vira o reto');
    assert.deepEqual(api.filter((a) => a.nome === 'contar').map((a) => a.corpo.evento), ['visita', 'previa']);
    await ctx.close();
    // nicho desconhecido e sem nicho: título genérico, sem marca no <html>
    const b = await paginaApi(nav, base, { consentir: false });
    await b.pg.setViewportSize({ width: 360, height: 640 });
    await b.pg.goto(base + '/?nicho=pet');
    assert.equal(await b.pg.getAttribute('html', 'data-nicho'), null);
    assert.match((await b.pg.innerText('h1')).replace(/\s+/g, ' ').trim(), /^Veja o site do seu negócio pronto\.$/);
    await b.ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('mutirão 11/11 · 360x640: aviso de medição ao tocar no nome, sobre a prévia sem cobrir os botões; preço junto do "Quero"; Testar secundário; pedir depois do teste; pagar visível em /abrir/', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  const livre = (sel) => { const e = document.querySelector(sel), r = e.getBoundingClientRect(); return [[.5, .5], [.15, .25], [.85, .25], [.15, .75], [.85, .75]].every(([fx, fy]) => { const x = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy); return !!x && !x.closest('#consentimento') && (x === e || e.contains(x)); }); };
  try {
    const { pg, ctx, erros } = await paginaApi(nav, base, { consentir: false, w: 360, h: 640 });
    await pg.goto(base + '/?nicho=barbearia');
    await pg.waitForTimeout(300);
    assert.equal(await pg.isVisible('#consentimento'), false, 'a primeira tela abre sem o aviso');
    // o toque no campo do nome mostra a faixa, que não cobre o campo, os chips, a cidade nem o botão
    await pg.focus('#nome');
    await pg.waitForSelector('#consentimento:not([hidden])');
    const f = await pg.evaluate(() => { const c = document.querySelector('#consentimento'); return { faixa: c.classList.contains('is-faixa'), vis: getComputedStyle(c).visibility, h: c.getBoundingClientRect().height }; });
    assert.equal(f.faixa, true); assert.equal(f.vis, 'visible', 'com o foco no nome a faixa continua na tela'); assert.ok(f.h <= 64, 'faixa de até 64 px: ' + f.h);
    await pg.keyboard.type('TESTE Barbearia do Ze');
    assert.deepEqual(await pg.evaluate(COBERTOS, '#form-abrir'), [], 'a faixa não cobre campo nem botão');
    assert.equal(await pg.evaluate(() => getComputedStyle(document.querySelector('#consentimento')).visibility), 'visible', 'digitando o nome a faixa segue visível');
    // nada vem marcado, nada carrega antes da escolha, Aceitar e Recusar têm o mesmo peso
    assert.equal(await pg.evaluate(() => localStorage.getItem('creat:consentimento')), null);
    assert.equal(await pg.evaluate(() => typeof window.fbq), 'undefined');
    const pesos = await pg.$$eval('#consentimento [data-consentir]', (bs) => bs.map((b) => [getComputedStyle(b).backgroundColor, Math.round(b.getBoundingClientRect().height)]));
    assert.deepEqual(pesos[0], pesos[1], 'Aceitar e Recusar iguais');
    // enviar o nome sem escolher não é bloqueado; a faixa fica sobre a prévia, acima dos dois botões
    await pg.keyboard.press('Enter');
    await pg.waitForFunction(() => !document.querySelector('#previa').hidden);
    await pg.waitForTimeout(400);
    const p = await pg.evaluate(() => { const c = document.querySelector('#consentimento').getBoundingClientRect(), b = document.querySelector('.previa-base').getBoundingClientRect(); return { vis: getComputedStyle(document.querySelector('#consentimento')).visibility, disp: getComputedStyle(document.querySelector('#consentimento')).display, cBottom: c.bottom, cTop: c.top, bTop: b.top }; });
    assert.equal(p.disp !== 'none' && p.vis === 'visible', true, 'a faixa continua visível sobre a prévia');
    assert.ok(p.cBottom <= p.bTop + 1 && p.cTop > 52, 'a faixa fica entre o topo e a barra de baixo: ' + JSON.stringify(p));
    assert.equal(await pg.evaluate(livre, '#previa-quero'), true, '"Quero este site no ar" livre');
    assert.equal(await pg.evaluate(livre, '#previa-testar'), true, '"Testar no meu WhatsApp" livre');
    // preço na decisão: Abertura e mensalidade juntas, vindas do dado (nunca escritas no HTML)
    const nota = (await pg.innerText('.previa-base')).replace(/\s+/g, ' ');
    assert.match(nota, /Abertura de R\$ 297, uma vez \(inauguração; depois, R\$ 497\)\. Mensalidade a partir de R\$ 147, só com o site no ar\. 7 dias para desistir, com devolução\./);
    // Testar é secundário; o único botão cheio é o de pedir
    assert.equal(await pg.evaluate(() => document.querySelector('#previa-testar').classList.contains('btn-sol')), false);
    assert.equal(await pg.evaluate(() => getComputedStyle(document.querySelector('#previa-testar')).boxShadow), 'none');
    // topo: o nome inteiro cabe em 360 ("copiar link" vira ícone de 44 px, com o nome para o leitor de tela) e a tela de carregamento mostra o nome
    const topo = await pg.evaluate(() => { const c = document.querySelector('#previa-copiar'), cr = c.getBoundingClientRect(), r = document.querySelector('#previa-rotulo'); return { copiar: Math.round(cr.width) >= 44 && Math.round(cr.height) >= 44, nomeCopiar: c.textContent.trim(), cabe: r.scrollWidth <= r.clientWidth + 1 && r.getBoundingClientRect().right <= cr.left, carregando: document.querySelector('#previa-carregando-nome').textContent }; });
    assert.deepEqual(topo, { copiar: true, nomeCopiar: 'copiar link', cabe: true, carregando: 'TESTE Barbearia do Ze' });
    // Recusar é um toque e não carrega o Pixel
    await pg.click('#consentimento [data-consentir="nao"]');
    assert.equal(await pg.isVisible('#consentimento'), false);
    assert.equal(JSON.parse(await pg.evaluate(() => localStorage.getItem('creat:consentimento'))).pixel, false);
    assert.equal(await pg.evaluate(() => typeof window.fbq), 'undefined');
    // "Testar" leva ao teste, e logo abaixo dele está o pedido do site, com o nome e o preço completo
    await pg.click('#previa-testar'); await pg.waitForTimeout(300);
    assert.equal(await pg.innerText('#teste-pedir-nome'), 'TESTE Barbearia do Ze');
    assert.match((await pg.innerText('#teste-pedir')).replace(/\s+/g, ' '), /Abertura de R\$ 297, uma vez, e mensalidade a partir de R\$ 147, só com o site no ar/);
    await Promise.all([pg.waitForURL(/\/abrir\/#/), pg.click('#teste-quero')]);
    assert.match(pg.url(), /plano=aberto/);
    assert.deepEqual(erros, []);
    await ctx.close();
    // sem preço carregado: a nota volta ao texto sem número (falha fechada, nunca valor fixo no HTML)
    const s = await paginaApi(nav, base, { consentir: false, w: 360, h: 640 });
    await s.pg.route(/dados\/precos\.json/, (r) => r.fulfill({ status: 404, body: '' }));
    await s.pg.goto(base + '/?nicho=barbearia'); await s.pg.waitForTimeout(400);
    const html = await s.pg.evaluate(() => [...document.querySelectorAll('.previa-nota')].map((e) => e.outerHTML).join(''));
    assert.doesNotMatch(html, /R\$\s*\d/);
    await s.ctx.close();
    // /abrir/ sem escolha: o botão fixo de pagar fica visível e a faixa não o cobre
    const a = await paginaApi(nav, base, { consentir: false, w: 360, h: 640 });
    await a.pg.goto(base + '/abrir/#plano=aberto&k=barbearia&n=TESTE%20Barbearia%20do%20Ze'); await a.pg.waitForTimeout(500);
    assert.equal(await a.pg.isVisible('#consentimento'), true);
    assert.equal(await a.pg.isVisible('#barra-pagar'), true);
    assert.equal(await a.pg.evaluate(livre, '#barra-pagar .btn'), true, 'o botão de pagar não fica atrás da faixa');
    for (const y of [400, 900, 1500]) {
      await a.pg.evaluate((yy) => window.scrollTo(0, yy), y); await a.pg.waitForTimeout(300);
      const vis = await a.pg.evaluate(() => getComputedStyle(document.querySelector('#barra-pagar')).visibility === 'visible');
      if (vis) assert.equal(await a.pg.evaluate(livre, '#barra-pagar .btn'), true, '/abrir/ y=' + y);
    }
    // "Dúvidas" diz WhatsApp quando abre o WhatsApp
    const zap = await a.pg.evaluate(() => { const l = document.querySelector('.link-duvidas'); return { txt: l.textContent.trim(), wa: /wa\.me|whatsapp/.test(l.href) }; });
    assert.equal(zap.txt, zap.wa ? 'Dúvidas no WhatsApp' : 'Falar com o suporte');
    assert.deepEqual(a.erros, []);
    await a.ctx.close();
  } finally { await nav.close(); srv.close(); }
});

/* ------------------------------------------------------------ 6. sede viva (seção #sede da home) */
const PASTA_CENA = (/var SEDE_CENA = \{ pasta: '([^']+)'/.exec(FONTE_VIT) || [])[1];

test('sede viva: a pasta da cena está no vitrine.js e o negocios.json dela bate com sites/demo-*/tenant.json', () => {
  assert.ok(PASTA_CENA && /^assets\/[a-z-]+\/$/.test(PASTA_CENA), 'SEDE_CENA.pasta');
  const neg = JSON.parse(fs.readFileSync(path.join(RAIZ, PASTA_CENA, 'negocios.json'), 'utf8')).negocios;
  const preco = (v) => (+v === 0 ? 'Grátis' : 'R$ ' + v);   // a regra do motor.js: 0 vira "Grátis"
  const esp = (x) => String(x).replace(/\s/g, ' ');            // o Intl separa "R$" do número com espaço fixo
  for (const k of ['barbearia', 'salao', 'academia']) {
    const t = JSON.parse(fs.readFileSync(path.join(RAIZ, 'sites', 'demo-' + k, 'tenant.json'), 'utf8'));
    const n = neg[k];
    assert.equal(n.marca, t.negocio.nome, k + ': marca');
    assert.equal(n.titulo, t.textos.heroTitulo, k + ': título');
    assert.equal(n.botao, t.textos.pedidoTitulo, k + ': botão');
    assert.deepEqual(n.servicos.map((s) => s.nome), t.servicos.slice(0, 2).map((s) => s.nome), k + ': serviços');
    assert.deepEqual(n.servicos.map((s) => esp(s.preco)), t.servicos.slice(0, 2).map((s) => preco(s.preco)), k + ': preços');
    for (const c of ['fundo', 'texto', 'destaque', 'apoio']) assert.equal(n.cores[c], t.cores[c], k + ': cor ' + c);
  }
  // o chip de cada negócio aponta para o nicho certo e o site certo
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  for (const k of ['barbearia', 'salao', 'academia']) assert.match(html, new RegExp('data-nicho="' + k + '" data-marca="[^"]+" data-site="sites/demo-' + k + '/"'));
});

test('sede viva: cena.js sem innerHTML, eval, endereço de fora nem texto em português, e passos contíguos de 0 a 16000', () => {
  const js = fs.readFileSync(path.join(RAIZ, PASTA_CENA, 'cena.js'), 'utf8');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|\beval\(|new Function|https?:\/\/(?!www\.w3\.org\/)/);
  assert.doesNotMatch(js, /[À-ÿ]/, 'todo texto visível vem da página (opc.textos) ou do negocios.json');
  // só transform e opacity: conferido por dentro no teste da cena (scripts/testes/sede-viva-cena.test.mjs)
  const ctx = { window: {}, document: {} }; ctx.window = ctx;
  vm.createContext(ctx); vm.runInContext(js, ctx);
  const P = ctx.CreatSedeViva.PASSOS;
  assert.equal(ctx.CreatSedeViva.CICLO_MS, 16000);
  assert.equal(P.length, 9);
  P.forEach((p, i) => { assert.equal(p.passo, i); if (i) assert.equal(p.de, P[i - 1].ate); });
  assert.equal(P[0].de, 0); assert.equal(P[8].ate, 16000);
  assert.deepEqual(Array.from(P, (p) => p.item), [0, 0, 1, 2, 3, 4, 5, 6, 7]);
  // a lista da página tem um item por "item" da cena, na mesma ordem dos agentes
  const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  const lis = Array.from(html.matchAll(/<li data-item="(\d)" data-agente="(\w+)"/g), (m) => [+m[1], m[2]]);
  assert.deepEqual(lis.map((l) => l[0]), [0, 1, 2, 3, 4, 5, 6, 7]);
  P.slice(0, 8).forEach((p) => assert.equal(lis[p.item][1], p.agente));
});

test('navegador: sede viva não carrega antes, toca sozinha ao entrar na tela, pausa fora, troca de negócio e respeita movimento reduzido', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  const abrirCtx = async (reduzido) => {
    const ctx = await nav.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true, reducedMotion: reduzido ? 'reduce' : 'no-preference' });
    await ctx.route(/^https:\/\//, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await ctx.addInitScript(() => { try { localStorage.setItem('creat:consentimento', JSON.stringify({ versao: 1, analytics: false, pixel: false, clarity: false, em: new Date().toISOString() })); } catch (e) {} });
    const pg = await ctx.newPage();
    const erros = [], cena = [];
    pg.on('pageerror', (e) => erros.push(e.message));
    pg.on('request', (q) => { if (new URL(q.url()).pathname.startsWith('/' + PASTA_CENA)) cena.push(q.url()); });
    return { ctx, pg, erros, cena };
  };
  const irAoPalco = (pg) => pg.evaluate(() => { const c = document.querySelector('#sede .sede-marcas'); window.scrollTo({ top: c.getBoundingClientRect().top + scrollY - 76, behavior: 'instant' }); });
  const rodando = (pg) => pg.evaluate(() => document.querySelector('[data-sede-palco]').getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length);
  const itemAtual = (pg) => pg.evaluate(() => { const li = document.querySelector('.esteira-lista li[aria-current="step"]'); return li ? +li.getAttribute('data-item') : -1; });
  try {
    const { ctx, pg, erros, cena } = await abrirCtx(false);
    await pg.goto(base + '/');
    await pg.waitForTimeout(1500);
    assert.deepEqual(cena, [], 'no topo nada da cena é baixado');
    assert.equal(await pg.$('.sv-mundo'), null);
    await irAoPalco(pg);
    await pg.waitForSelector('[data-sede-palco] .sv-mundo', { timeout: 8000 });
    assert.ok(cena.length > 0, 'a cena baixa quando a seção chega');
    // toca sozinha: sem toque nenhum, a lista sai do item 0 (Nimbus) e chega ao Verbo
    await pg.waitForFunction(() => { const li = document.querySelector('.esteira-lista li[aria-current="step"]'); return li && +li.getAttribute('data-item') >= 1; }, null, { timeout: 6000 });
    assert.ok((await rodando(pg)) > 0, 'animações rodando com o palco na tela');
    assert.equal(await pg.isVisible('#janela-sede .selo-demo'), true, 'selo Demonstração à vista');
    assert.equal(await pg.isHidden('[data-sede-pausar]'), false, 'Pausar à vista com movimento');
    // fora da tela pausa; de volta, continua
    await pg.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await pg.waitForFunction(() => document.querySelector('[data-sede-palco]').getAnimations({ subtree: true }).every((a) => a.playState !== 'running'), null, { timeout: 3000 });
    await irAoPalco(pg);
    await pg.waitForFunction(() => document.querySelector('[data-sede-palco]').getAnimations({ subtree: true }).some((a) => a.playState === 'running'), null, { timeout: 3000 });
    // troca de negócio: recomeça no item 0 com o site do salão e o link do salão
    await pg.click('.sede-marcas .chip[data-nicho="salao"]');
    assert.equal(await itemAtual(pg), 0, 'trocar de negócio recomeça no passo 1');
    assert.equal(await pg.getAttribute('.chip[data-nicho="salao"]', 'aria-pressed'), 'true');
    assert.equal(await pg.getAttribute('[data-esteira-abrir]', 'href'), 'sites/demo-salao/');
    assert.match(await pg.getAttribute('[data-sede-palco]', 'aria-label'), /Esmalte & Fio, nome fictício/);
    await pg.waitForFunction(() => /Cadeira pronta e esmalte aberto no Centro\./.test(document.querySelector('[data-sede-palco]').textContent.replace(/\s+/g, ' ')), null, { timeout: 3000 });
    assert.deepEqual(erros, []);
    await ctx.close();

    // movimento reduzido: nada roda, quadro final (ABERTO), lista à vista, sem Pausar; o chip troca o site parado
    const r = await abrirCtx(true);
    await r.pg.goto(base + '/');
    await irAoPalco(r.pg);
    await r.pg.waitForSelector('[data-sede-palco] .sv-mundo', { timeout: 8000 });
    await r.pg.waitForFunction(() => document.querySelector('#sede').classList.contains('sede-estatica'), null, { timeout: 8000 });
    await r.pg.waitForTimeout(600);
    assert.equal(await rodando(r.pg), 0);
    assert.match(await r.pg.textContent('[data-sede-palco]'), /ABERTO/);
    assert.equal(await r.pg.isHidden('[data-sede-pausar]'), true);
    assert.ok(await r.pg.evaluate(() => document.querySelector('#esteira').getBoundingClientRect().width > 100), 'lista de etapas à vista');
    assert.equal(await itemAtual(r.pg), 7, 'o quadro parado é o fim: site no ar');
    await r.pg.click('.sede-marcas .chip[data-nicho="academia"]');
    await r.pg.waitForFunction(() => /A barra está montada\./.test(document.querySelector('[data-sede-palco]').textContent), null, { timeout: 3000 });
    await r.pg.waitForTimeout(150);   // a regra global de movimento reduzido (vitrine.css) deixa transições de 1 ms: um quadro e acabou
    assert.equal(await rodando(r.pg), 0);
    assert.deepEqual(r.erros, []);
    await r.ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('navegador 360x640: chegando à seção da equipe o aviso de medição é faixa, não a caixa grande por cima da cena', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, ctx } = await paginaApi(nav, base, { consentir: false, w: 360, h: 640 });
    await pg.goto(base + '/?nicho=barbearia');
    await pg.evaluate(() => { const s = document.querySelector('#sede'); window.scrollTo(0, s.getBoundingClientRect().top + scrollY - 60); });
    await pg.waitForSelector('#consentimento:not([hidden])');
    await pg.waitForFunction(() => document.querySelector('#consentimento').classList.contains('is-faixa'), null, { timeout: 3000 });
    const h = await pg.evaluate(() => document.querySelector('#consentimento').getBoundingClientRect().height);
    assert.ok(h <= 64, 'faixa de até 64 px sobre a seção da equipe: ' + h);
    await ctx.close();
  } finally { await nav.close(); srv.close(); }
});

/* ======================================================================
   Compra curta (11/11/2026): do "Quero este site no ar" ao botão de pagar em até 2 telas de 640 px.
   Antes de pagar, só o indispensável do contrato (docs/PEDIDO-API.md): nicho, negócio e cidade (da prévia), WhatsApp,
   e-mail e aceite. Nome, endereço e horário ficam num bloco recolhido e, vazios, não vão no corpo. /obrigado/ pede
   o que faltou pelo WhatsApp do suporte (não há rota que complete o pedido com o segredo).
   ====================================================================== */
const SEM_DEPOIS = () => { const p = PEDIDO_CHEIO(); delete p.responsavel; p.endereco = null; p.horarios = null; p.faltam = ['endereco', 'horarios']; return p; };

test('compra curta: pedido sem nome, endereço e horário passa no servidor, fica no aparelho e vira PEDIDO v1 sem "undefined"', () => {
  const ctx = carregar(), V = ctx.Vitrine;
  const corpo = limpar(V.corpoRegistro(SEM_DEPOIS(), ''));
  for (const k of ['responsavel', 'endereco', 'horarios']) assert.equal(k in corpo, false, k + ' fora do corpo');
  assert.equal(REGRAS.validarRegistro(corpo).ok, true, JSON.stringify(REGRAS.validarRegistro(corpo)));
  ctx.localStorage.setItem('creat:pedido:v1', JSON.stringify(Object.assign(SEM_DEPOIS(), { salvo_em: iso(1 * H) })));
  const lido = limpar(V.lerPedidoSalvo());
  assert.equal(lido.id, 'PA-7K3QX2MD4R', '/obrigado/ acha o pedido sem endereço e horário');
  assert.deepEqual(lido.faltam, ['endereco', 'horarios']);
  const txt = V.textoPedido(lido);
  assert.doesNotMatch(txt, /undefined|null|endereco|horarios|responsavel/);
  const prod = lerPedidoTexto(txt);
  assert.equal(prod.id, 'PA-7K3QX2MD4R'); assert.equal('endereco' in prod, false, 'a produção vê a falta, nunca um endereço inventado');
  // enxuto (depois do ack do servidor): os nomes do que falta ficam, os dados pessoais saem
  ctx.localStorage.setItem('creat:pedido:v1', JSON.stringify(Object.assign(SEM_DEPOIS(), { salvo_em: iso(8 * 24 * H) })));
  const e = limpar(V.lerPedidoSalvo());
  assert.equal(e.enxuto, true); assert.deepEqual(e.faltam, ['endereco', 'horarios']);
  // tipo errado no aparelho não passa
  ctx.localStorage.setItem('creat:pedido:v1', JSON.stringify(Object.assign(SEM_DEPOIS(), { salvo_em: iso(1 * H), endereco: { rua: 'x' } })));
  assert.equal(V.lerPedidoSalvo(), null);
});

test('compra curta · navegador: só com WhatsApp, e-mail e aceite, Pagar registra o pedido sem endereço nem horário e vai ao Mercado Pago', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, ctx, api, erros } = await paginaApi(nav, base);
    await pg.goto(base + '/abrir/#plano=aberto&k=barbearia&n=TESTE%20Barbearia%20do%20Ze&c=Campinas&p=1');
    await pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    assert.equal(await pg.evaluate(() => document.querySelector('#p-depois').open), false, 'bloco do depois fechado');
    assert.equal(await pg.isVisible('#p-endereco'), false); assert.equal(await pg.isVisible('#p-responsavel'), false);
    assert.equal(await pg.isVisible('#p-cidade'), false, 'cidade veio da prévia: sem campo');
    await preencherAbrir(pg);
    await Promise.all([pg.waitForURL(/mercadopago/), pg.click('.pagar [data-checkout]')]);
    const reg = api.find((a) => a.nome === 'registrarPedido');
    assert.ok(reg, 'o pedido foi registrado no clique');
    assert.equal(REGRAS.validarRegistro(reg.corpo).ok, true, JSON.stringify(REGRAS.validarRegistro(reg.corpo)));
    for (const k of ['responsavel', 'endereco', 'horarios']) assert.equal(k in reg.corpo, false, k + ' não vai com o bloco fechado');
    assert.equal(reg.corpo.plano, 'aberto'); assert.equal(reg.corpo.cidade, 'Campinas'); assert.equal(reg.corpo.whatsapp, '5575900000000');
    assert.equal(reg.corpo.termos_versao, carregar().CREAT_CHECKOUT.termosVersao); assert.equal(reg.corpo.consentimento_dados, true);
    await pg.goto(base + '/termos/');
    assert.deepEqual(await pg.evaluate(() => JSON.parse(localStorage.getItem('creat:pedido:v1')).faltam), ['endereco', 'horarios']);
    assert.deepEqual(erros, []);
    await ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('compra curta · navegador: bloco recolhido preenchido vai no corpo; horário de exemplo sem confirmação não vai; endereço errado trava e abre o bloco', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    // (a) aberto e com endereço, mas sem mexer no horário: o horário do nicho não vai (seria dado de exemplo)
    let s = await paginaApi(nav, base);
    await s.pg.goto(base + '/abrir/#plano=aberto&k=barbearia&n=TESTE%20Barbearia&c=Campinas&p=1');
    await s.pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    await s.pg.click('#p-depois summary');
    await s.pg.fill('#p-endereco', 'Rua das Flores, 120, Centro, Campinas-SP, 13010-000');
    await preencherAbrir(s.pg);
    await Promise.all([s.pg.waitForURL(/mercadopago/), s.pg.click('.pagar [data-checkout]')]);
    let reg = s.api.find((a) => a.nome === 'registrarPedido');
    assert.equal(reg.corpo.endereco, 'Rua das Flores, 120, Centro, Campinas-SP, 13010-000');
    assert.equal('horarios' in reg.corpo, false, 'horário do nicho sem confirmação não vai');
    assert.equal(REGRAS.validarRegistro(reg.corpo).ok, true);
    await s.ctx.close();
    // (b) mexer num dia marca a confirmação: endereço, horário e nome vão, no formato do servidor
    s = await paginaApi(nav, base);
    await s.pg.goto(base + '/abrir/#plano=aberto&k=barbearia&n=TESTE%20Barbearia&c=Campinas&p=1');
    await s.pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    await s.pg.click('#p-depois summary');
    await s.pg.waitForTimeout(300);   // horário do nicho montado
    await s.pg.fill('#p-responsavel', 'Maria Souza');
    await s.pg.fill('#p-endereco', 'Rua das Flores, 120, Centro, Campinas-SP, 13010-000');
    if (!(await s.pg.isChecked('#h-dom-aberto'))) await s.pg.check('#h-dom-aberto');
    await s.pg.selectOption('#h-dom-fecha', '13:00');
    assert.equal(await s.pg.isChecked('#p-horarios-confirmo'), true, 'mexer no horário confirma');
    await preencherAbrir(s.pg);
    await Promise.all([s.pg.waitForURL(/mercadopago/), s.pg.click('.pagar [data-checkout]')]);
    reg = s.api.find((a) => a.nome === 'registrarPedido');
    assert.equal(reg.corpo.responsavel, 'Maria Souza');
    assert.match(reg.corpo.horarios, /dom=\d{2}:\d{2}-13:00$/);
    assert.equal(REGRAS.validarRegistro(reg.corpo).ok, true, JSON.stringify(REGRAS.validarRegistro(reg.corpo)));
    await s.pg.goto(base + '/termos/');
    assert.deepEqual(await s.pg.evaluate(() => JSON.parse(localStorage.getItem('creat:pedido:v1')).faltam), []);
    await s.ctx.close();
    // (c) endereço incompleto com o bloco fechado: a validação de sempre trava, abre o bloco e leva o foco ao campo
    s = await paginaApi(nav, base);
    await s.pg.goto(base + '/abrir/#plano=aberto&k=barbearia&n=TESTE%20Barbearia&c=Campinas&p=1');
    await s.pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    await s.pg.click('#p-depois summary'); await s.pg.fill('#p-endereco', 'Rua A'); await s.pg.click('#p-depois summary');
    await preencherAbrir(s.pg);
    await s.pg.click('.pagar [data-checkout]');
    await s.pg.waitForTimeout(200);
    assert.doesNotMatch(s.pg.url(), /mercadopago/);
    assert.equal(await s.pg.evaluate(() => document.querySelector('#p-depois').open), true, 'o bloco abre para mostrar o erro');
    assert.equal(await s.pg.evaluate(() => document.activeElement.id), 'p-endereco');
    assert.equal(s.api.filter((a) => a.nome === 'registrarPedido').length, 0);
    assert.deepEqual(s.erros, []);
    await s.ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('compra curta · navegador: a confirmação do horário cai quando a grade é redesenhada com o padrão de outro nicho', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  const HORARIO_CLIENTE = 'seg=08:00-12:00;ter=08:00-12:00;qua=08:00-12:00;qui=08:00-12:00;sex=08:00-12:00;sab=fechado;dom=fechado';
  const salvoBarbearia = () => Object.assign(PEDIDO_CHEIO(), { nicho: 'barbearia', plano: 'aberto', negocio: 'TESTE Studio Bela', horarios: HORARIO_CLIENTE, salvo_em: new Date().toISOString() });
  try {
    // controle: pedido salvo do mesmo nicho, a grade volta com o horário do cliente e a confirmação continua marcada
    let s = await paginaApi(nav, base, { pedido: salvoBarbearia() });
    await s.pg.goto(base + '/abrir/#plano=aberto&k=barbearia&n=TESTE%20Studio%20Bela&c=Campinas&p=1');
    await s.pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    await s.pg.waitForTimeout(400);
    assert.equal(await s.pg.isChecked('#p-horarios-confirmo'), true, 'mesmo nicho: o horário é o do cliente');
    assert.equal(await s.pg.inputValue('#h-seg-abre'), '08:00');
    await s.ctx.close();
    // cenário 1: horário confirmado de barbearia, a pessoa troca para salão na prévia com o mesmo nome e abre /abrir/
    s = await paginaApi(nav, base, { pedido: salvoBarbearia() });
    await s.pg.goto(base + '/abrir/#plano=aberto&k=salao&n=TESTE%20Studio%20Bela&c=Campinas&p=1');
    await s.pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    await s.pg.waitForFunction(() => !document.querySelector('#p-horarios-confirmo').checked, null, { timeout: 4000 });
    assert.equal(await s.pg.isChecked('#h-seg-aberto'), false, 'a grade é a do salão (padrão: segunda fechada), não a do cliente');
    await s.pg.fill('#p-endereco', '');
    await preencherAbrir(s.pg);
    await Promise.all([s.pg.waitForURL(/mercadopago/), s.pg.click('.pagar [data-checkout]')]);
    let reg = s.api.find((a) => a.nome === 'registrarPedido');
    assert.equal('horarios' in reg.corpo, false, 'o padrão do salão não vai como horário do cliente');
    assert.deepEqual(s.erros, []);
    await s.ctx.close();
    // cenário 2: sem nicho da prévia; mexer num dia confirma; trocar o tipo do negócio redesenha e desmarca
    s = await paginaApi(nav, base);
    await s.pg.goto(base + '/abrir/#plano=aberto&n=TESTE%20Studio%20Bela&c=Campinas&p=1');
    await s.pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    await s.pg.selectOption('#p-nicho', 'barbearia'); await s.pg.waitForTimeout(400);
    await s.pg.click('#p-depois summary');
    await s.pg.selectOption('#h-qua-fecha', '13:00');
    assert.equal(await s.pg.isChecked('#p-horarios-confirmo'), true, 'mexer no horário confirma');
    await s.pg.selectOption('#p-nicho', 'salao');
    await s.pg.waitForFunction(() => !document.querySelector('#p-horarios-confirmo').checked, null, { timeout: 4000 });
    await preencherAbrir(s.pg);
    await Promise.all([s.pg.waitForURL(/mercadopago/), s.pg.click('.pagar [data-checkout]')]);
    reg = s.api.find((a) => a.nome === 'registrarPedido');
    assert.equal(reg.corpo.nicho, 'salao');
    assert.equal('horarios' in reg.corpo, false, 'o padrão do novo nicho não vai marcado como do cliente');
    assert.deepEqual(s.erros, []);
    await s.ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('compra curta · navegador 360x640: botão de pagar até 1.400 px do topo, na ordem negócio, preço, o que leva, campos, aceite, garantia e botão', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, ctx, erros } = await paginaApi(nav, base, { w: 360, h: 640 });
    await pg.goto(base + '/abrir/#plano=aberto&k=barbearia&n=Barbearia%20do%20Teste&c=Campinas&p=1');
    await pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(300);
    const m = await pg.evaluate(() => {
      const topo = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + scrollY) : -1; };
      const b = document.querySelector('.pagar [data-checkout]').getBoundingClientRect();
      return {
        fundo: Math.round(b.bottom + scrollY), largura: document.documentElement.scrollWidth,
        aviso: !document.querySelector('#consentimento').hidden, barra: !document.querySelector('#barra-pagar').hidden,
        ordem: ['#abrir-negocio', '.conta', '.leva', '#p-whatsapp', '#p-email', '#p-depois', '#p-aceite', '#garantia-curta', '.pagar [data-checkout]'].map(topo),
        leva: document.querySelectorAll('#leva-lista li').length, aberto: document.querySelector('#trocar-plano').open
      };
    });
    console.log('# compra curta: borda de baixo do botão de pagar em 360x640 = ' + m.fundo + ' px (antes: 5.532 no ar)');
    assert.equal(m.aviso, false, 'sem aviso de medição aberto');
    assert.ok(m.fundo <= 1400, 'botão a ' + m.fundo + ' px do topo');
    assert.equal(m.largura, 360, 'sem rolagem lateral');
    assert.equal(m.barra, true, 'a barra fixa Total de hoje / Pagar continua');
    assert.deepEqual([...m.ordem].sort((a, b) => a - b), m.ordem, 'ordem: ' + m.ordem.join(', '));
    assert.ok(m.ordem.every((y) => y > 0));
    assert.ok(m.leva >= 3 && m.leva <= 5);
    assert.equal(m.aberto, false, 'Aberto marcado e os outros planos recolhidos');
    assert.equal(await pg.isChecked('input[name="plano"][value="aberto"]'), true);
    assert.equal(await pg.textContent('#garantia-curta'), '7 dias para desistir com devolução. Mensalidade só com o site no ar. Sem fidelidade.');
    assert.equal(await pg.textContent('#abrir-titulo'), 'Falta pouco para abrir as portas.', 'sem artigo antes do nome');
    // preço da conta = dados: Abertura de hoje e a mensalidade do Aberto, juntas
    assert.match(await pg.textContent('.conta'), /Hoje\s*R\$\s297\s*Abertura, uma vez\. Preço de inauguração; depois, R\$\s497\s*Por mês\s*R\$\s147\s*Plano Aberto, só com o site no ar/);
    assert.deepEqual(erros, []);
    await ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('compra curta: "O que você leva" e a garantia vêm dos textos de conteudo/ (home.json e abrir.json), sem item inventado', () => {
  const hj = JSON.parse(fs.readFileSync(path.join(RAIZ, 'conteudo/home.json'), 'utf8'));
  const aj = JSON.parse(fs.readFileSync(path.join(RAIZ, 'conteudo/abrir.json'), 'utf8'));
  const ab = fs.readFileSync(path.join(RAIZ, 'abrir/index.html'), 'utf8');
  const caminho = (o, c) => c.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
  const lis = [...ab.matchAll(/<li data-leva="([^"]+)">([\s\S]*?)<\/li>/g)];
  assert.deepEqual(lis.map((x) => x[1]), aj.leva.itens, 'abrir.json leva.itens = data-leva do HTML');
  for (const [, c, html] of lis) {
    const t = caminho(hj, c);
    assert.equal(typeof t, 'string', c);
    assert.equal(html.replace(/<span data-v="precos\.prazoHoras"><\/span>/g, '{{precos.prazoHoras}}').replace(/<[^>]+>/g, '').trim(), t, c);
  }
  assert.match(ab, new RegExp('data-texto="pagar.garantia">' + aj.pagar.garantia.replace(/\./g, '\\.') + '<'));
  // prazo honesto: os termos v2 contam as 72 h do pagamento; nada diz que o prazo espera endereço ou horário
  for (const t of [ab, JSON.stringify(aj), fs.readFileSync(path.join(RAIZ, 'obrigado/index.html'), 'utf8'), fs.readFileSync(path.join(RAIZ, 'conteudo/obrigado.json'), 'utf8')]) {
    assert.doesNotMatch(t, /prazo[^.]{0,60}(depende|conta|começa)[^.]{0,40}(endere|horário)/i);
  }
});

test('compra curta · navegador: plano escolhido na home continua valendo em /abrir/, marcado na conta e com a lista de planos recolhida', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, ctx, api, erros } = await paginaApi(nav, base);
    await pg.goto(base + '/?nicho=salao');
    await pg.fill('#nome', 'TESTE Studio Bela'); await pg.click('#form-abrir [type=submit]');
    await pg.waitForFunction(() => { const e = document.querySelector('#previa'); return !!e && !e.hidden; });
    await Promise.all([pg.waitForURL(/\/abrir\//), pg.evaluate(() => document.querySelector('a[data-plano="vitrine"]').click())]);
    await pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    assert.equal(await pg.isChecked('input[name="plano"][value="vitrine"]'), true);
    assert.equal(await pg.evaluate(() => document.querySelector('#trocar-plano').open), false, 'a lista fica recolhida: o plano escolhido já está na conta');
    assert.match(await pg.textContent('#resumo-mensal'), /R\$\s297\s*Plano Vitrine/);
    // o que o Vitrine soma aparece em "O que você leva" (frase de home.json), e some ao trocar para o Aberto
    const hj = JSON.parse(fs.readFileSync(path.join(RAIZ, 'conteudo/home.json'), 'utf8'));
    assert.equal(await visivel(pg, '#leva-lista [data-se-plano="vitrine"]'), true);
    assert.equal((await pg.textContent('#leva-lista [data-se-plano="vitrine"]')).trim(), hj.precos.planos.vitrine.inclui[1]);
    const fundo = () => pg.evaluate(() => Math.round(document.querySelector('.pagar [data-checkout]').getBoundingClientRect().bottom + scrollY));
    const fundoVitrine = await fundo();
    await pg.click('#trocar-plano summary'); await pg.click('label.plano-opcao:has(input[value="aberto"])');
    await pg.click('#trocar-plano summary');
    const fundoAberto = await fundo();
    console.log('# Vitrine vindo da home, 390x844: botão a ' + fundoVitrine + ' px (Aberto: ' + fundoAberto + ' px)');
    assert.ok(fundoVitrine - fundoAberto <= 100, 'o Vitrine custa só a linha a mais: ' + fundoVitrine + ' x ' + fundoAberto);
    assert.equal(await visivel(pg, '#leva-lista [data-se-plano="vitrine"]'), false, 'no Aberto, a linha do Vitrine sai');
    await pg.click('#trocar-plano summary');
    assert.match(await pg.textContent('#resumo-mensal'), /Plano Aberto/);
    await pg.click('label.plano-opcao:has(input[value="vitrine_anual"])');
    assert.equal(await visivel(pg, '#leva-lista [data-se-plano="vitrine"]'), true, 'no Vitrine anual, a linha volta');
    await pg.click('label.plano-opcao:has(input[value="vitrine"])');
    assert.equal(await pg.textContent('#abrir-negocio-nome'), 'TESTE Studio Bela');
    assert.equal(await pg.isVisible('#p-cidade'), true, 'sem cidade na prévia: o campo aparece, porque o servidor exige');
    await pg.fill('#p-cidade', 'Campinas');
    await preencherAbrir(pg);
    await Promise.all([pg.waitForURL(/mercadopago/), pg.click('.pagar [data-checkout]')]);
    assert.equal(api.find((a) => a.nome === 'registrarPedido').corpo.plano, 'vitrine');
    assert.deepEqual(erros, []);
    await ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('compra curta · navegador: /obrigado/ pago sem endereço e horário mostra "Falta pouco" com o WhatsApp do suporte e só o número do pedido', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const conf = { confirmarPagamento: { status: 200, json: { ok: true } }, consultarPedido: { status: 200, json: { ok: true, status: 'pago', prazo_fim: new Date(Date.now() + 70 * H).toISOString() } } };
    const a = await paginaApi(nav, base, { pedido: Object.assign(SEM_DEPOIS(), { salvo_em: new Date().toISOString() }), api: conf });
    await a.pg.goto(base + '/obrigado/?pago=mp&produto=pa-abertura-inauguracao&collection_status=approved&payment_id=188866285972');
    await a.pg.waitForFunction(() => document.querySelector('main').getAttribute('data-estado') === 'confirmado');
    assert.equal(await visivel(a.pg, '#obrigado-falta'), true);
    assert.match(await a.pg.textContent('#falta-titulo'), /Falta pouco para a produção começar/);
    assert.equal(await visivel(a.pg, '[data-falta="endereco"]'), true); assert.equal(await visivel(a.pg, '[data-falta="horarios"]'), true);
    const href = await a.pg.getAttribute('#falta-zap', 'href');
    const texto = decodeURIComponent(href.replace(/^[^?]*\?(text|body)=/, '').replace(/^.*&body=/, ''));
    assert.match(href, /^(https:\/\/wa\.me\/\d+\?text=|mailto:)/);
    assert.match(texto, /vou mandar o endereço e o horário do pedido PA-7K3QX2MD4R\./);
    assert.doesNotMatch(href, /maria|5575900000000|Rua|segredo|q1Zr8Xn4/i, 'nenhum dado pessoal nem o segredo na URL');
    assert.equal(await a.pg.evaluate(() => document.querySelector('#obrigado-botao').classList.contains('btn-sol')), false, 'um só botão amarelo');
    assert.equal(await a.pg.textContent('#obrigado-lead'), 'Recebemos o seu pagamento. Guarde o recibo abaixo.', 'sem dizer que a equipe já começou');
    assert.equal(await visivel(a.pg, '#obrigado-botao'), false, 'o botão do estado (o mesmo WhatsApp do suporte) sai: um só caminho no corpo da página');
    assert.equal(await a.pg.locator('main a.btn-sol:visible').count(), 1, 'um só link amarelo na tela (o da sede é botão, não WhatsApp)');
    // o bloco vem logo depois do título e do texto do estado, e o botão dele cabe na primeira tela de 390x844
    const pos = await a.pg.evaluate(() => {
      const t = (s) => Math.round(document.querySelector(s).getBoundingClientRect().top + scrollY);
      return { lead: t('#obrigado-lead'), falta: t('#obrigado-falta'), acoes: t('.obrigado-acoes'), recibo: t('#obrigado-recibo'), zap: Math.round(document.querySelector('#falta-zap').getBoundingClientRect().bottom + scrollY) };
    });
    assert.ok(pos.lead < pos.falta && pos.falta < pos.acoes && pos.falta < pos.recibo, JSON.stringify(pos));
    assert.ok(pos.zap <= 844, 'botão do suporte a ' + pos.zap + ' px do topo');
    assert.deepEqual(a.erros, []);
    await a.ctx.close();
    // servidor fora do ar: "Enviar pedido no WhatsApp" continua lá, mas secundário (sem o amarelo) enquanto o bloco estiver na tela
    const d = await paginaApi(nav, base, { pedido: Object.assign(SEM_DEPOIS(), { salvo_em: new Date().toISOString() }), api: { confirmarPagamento: 'abortar', consultarPedido: 'abortar', registrarPedido: 'abortar' } });
    await d.pg.goto(base + '/obrigado/?pago=mp&produto=pa-abertura-inauguracao&collection_status=approved&payment_id=188866285972');
    await d.pg.waitForFunction(() => { const e = document.querySelector('#enviar-pedido'); return e && !e.closest('[hidden]') && !e.hidden; }, null, { timeout: 15000 });
    assert.equal(await visivel(d.pg, '#obrigado-falta'), true);
    assert.equal(await d.pg.evaluate(() => document.querySelector('#enviar-pedido').classList.contains('btn-sol')), false, 'Enviar pedido fica secundário');
    assert.equal(await d.pg.evaluate(() => document.querySelector('#falta-zap').classList.contains('btn-sol')), true);
    assert.equal(await d.pg.locator('main a.btn-sol:visible').count(), 1, 'um só botão amarelo também com o servidor fora');
    await d.ctx.close();
    // Pix pendente (ainda não pagou) e pedido completo: sem o bloco
    const b = await paginaApi(nav, base, { pedido: Object.assign(SEM_DEPOIS(), { salvo_em: new Date().toISOString() }) });
    await b.pg.goto(base + '/obrigado/?pago=mp&produto=pa-abertura-inauguracao&resultado=pendente');
    await b.pg.waitForFunction(() => document.querySelector('main').getAttribute('data-estado') === 'pendente');
    assert.equal(await visivel(b.pg, '#obrigado-falta'), false);
    await b.ctx.close();
    const c = await paginaApi(nav, base, { pedido: Object.assign(PEDIDO_CHEIO(), { faltam: [] }), api: conf });
    await c.pg.goto(base + '/obrigado/?pago=mp&produto=pa-abertura-inauguracao&collection_status=approved&payment_id=188866285972');
    await c.pg.waitForFunction(() => document.querySelector('main').getAttribute('data-estado') === 'confirmado');
    assert.equal(await visivel(c.pg, '#obrigado-falta'), false);
    assert.match(await c.pg.textContent('#obrigado-lead'), /a equipe começa o seu site/, 'pedido completo: o texto de sempre');
    assert.equal(await visivel(c.pg, '#obrigado-botao'), true, 'pedido completo: o botão do estado volta');
    await c.ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('compra curta · /abrir/: o título mora no HTML (sem nome e data-com-nome) igual ao abrir.json, sem terceira cópia no JS', () => {
  const ab = fs.readFileSync(path.join(RAIZ, 'abrir/index.html'), 'utf8');
  const j = JSON.parse(fs.readFileSync(path.join(RAIZ, 'conteudo/abrir.json'), 'utf8'));
  const m = /<h1 id="abrir-titulo" data-com-nome="([^"]+)">([^<]+)<\/h1>/.exec(ab);
  assert.ok(m, 'h1#abrir-titulo com data-com-nome');
  assert.equal(m[1], j.titulo, 'data-com-nome = abrir.json titulo');
  assert.equal(m[2], j.tituloSemNome, 'texto do h1 = abrir.json tituloSemNome');
  assert.doesNotMatch(FONTE_VIT, /TITULO_ABRIR|Falta pouco para abrir as portas/, 'o título não é escrito de novo no vitrine.js');
});

test('compra curta · navegador: no formulário de /obrigado/ (outro aparelho), o horário de exemplo só vai com a confirmação', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  const Q = '/obrigado/?pago=mp&produto=pa-abertura-inauguracao&collection_status=approved&payment_id=188866285972';
  const preencherObrigado = async (pg) => {
    await pg.selectOption('#p-plano', 'aberto');
    await pg.fill('#p-negocio', 'TESTE Barbearia');
    await pg.fill('#p-cidade', 'Campinas');
    await pg.fill('#p-responsavel', 'Maria Souza');
    await pg.fill('#p-whatsapp', '75900000000');
    await pg.fill('#p-endereco', 'Rua das Flores, 120, Centro, Campinas-SP, 13010-000');
    await pg.fill('#p-email', 'maria@exemplo.com.br');
    await pg.check('#p-aceite');
  };
  try {
    // (a) só os campos obrigatórios, sem mexer na grade nem confirmar: não envia, pede a confirmação e leva o foco à caixa
    let s = await paginaApi(nav, base);
    await s.pg.goto(base + Q);
    await s.pg.waitForFunction(() => { const e = document.querySelector('#obrigado-sem-dados'); return e && !e.hidden; });
    await s.pg.selectOption('#p-nicho', 'barbearia'); await s.pg.waitForTimeout(400);
    await preencherObrigado(s.pg);
    assert.equal(await s.pg.isChecked('#p-horarios-confirmo'), false, 'a grade começa com o horário de exemplo, sem confirmação');
    await s.pg.click('#enviar-dados'); await s.pg.waitForTimeout(200);
    assert.equal(s.api.filter((a) => a.nome === 'registrarPedido').length, 0, 'o horário de exemplo não vai');
    assert.equal(await visivel(s.pg, '#p-horarios-erro'), true);
    assert.match(await s.pg.textContent('#p-horarios-erro'), /Este é o horário do meu negócio/);
    assert.equal(await s.pg.evaluate(() => document.activeElement.id), 'p-horarios-confirmo');
    // (b) a pessoa confere e confirma: o erro sai e o pedido vai com o horário, no formato do servidor
    await s.pg.check('#p-horarios-confirmo');
    assert.equal(await visivel(s.pg, '#p-horarios-erro'), false, 'confirmou: o erro sai na hora');
    await s.pg.click('#enviar-dados');
    await s.pg.waitForFunction(() => document.querySelector('#obrigado-sem-dados').hidden);
    let reg = s.api.find((a) => a.nome === 'registrarPedido');
    assert.ok(reg && typeof reg.corpo.horarios === 'string', 'horário confirmado vai');
    assert.equal(REGRAS.validarRegistro(reg.corpo).ok, true, JSON.stringify(REGRAS.validarRegistro(reg.corpo)));
    assert.deepEqual(s.erros, []);
    await s.ctx.close();
    // (c) mexer num dia confirma sozinho, como em /abrir/; trocar o tipo do negócio redesenha e desmarca
    s = await paginaApi(nav, base);
    await s.pg.goto(base + Q);
    await s.pg.waitForFunction(() => { const e = document.querySelector('#obrigado-sem-dados'); return e && !e.hidden; });
    await s.pg.selectOption('#p-nicho', 'barbearia'); await s.pg.waitForTimeout(400);
    await s.pg.selectOption('#h-qua-fecha', '13:00');
    assert.equal(await s.pg.isChecked('#p-horarios-confirmo'), true, 'mexer no horário confirma');
    await s.pg.selectOption('#p-nicho', 'salao');
    await s.pg.waitForFunction(() => !document.querySelector('#p-horarios-confirmo').checked, null, { timeout: 4000 });
    await s.pg.selectOption('#h-qua-fecha', '13:00');
    await preencherObrigado(s.pg);
    await s.pg.click('#enviar-dados');
    await s.pg.waitForFunction(() => document.querySelector('#obrigado-sem-dados').hidden);
    reg = s.api.find((a) => a.nome === 'registrarPedido');
    assert.match(reg.corpo.horarios, /qua=\d{2}:\d{2}-13:00/);
    assert.equal(reg.corpo.nicho, 'salao');
    assert.deepEqual(s.erros, []);
    await s.ctx.close();
  } finally { await nav.close(); srv.close(); }
});

test('compra curta · navegador: sem o WhatsApp do suporte configurado, "Falta pouco" fala de e-mail no texto e no botão', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const conf = { confirmarPagamento: { status: 200, json: { ok: true } }, consultarPedido: { status: 200, json: { ok: true, status: 'pago', prazo_fim: new Date(Date.now() + 70 * H).toISOString() } } };
    const a = await paginaApi(nav, base, { pedido: Object.assign(SEM_DEPOIS(), { salvo_em: new Date().toISOString() }), api: conf });
    await a.pg.route('**/checkout.config.js', async (r) => {
      const resp = await r.fetch(); const corpo = (await resp.text()).replace(/whatsappSuporte:\s*'\d+'/, "whatsappSuporte: ''");
      assert.match(corpo, /whatsappSuporte: ''/);
      await r.fulfill({ response: resp, body: corpo });
    });
    await a.pg.goto(base + '/obrigado/?pago=mp&produto=pa-abertura-inauguracao&collection_status=approved&payment_id=188866285972');
    await a.pg.waitForFunction(() => document.querySelector('main').getAttribute('data-estado') === 'confirmado');
    await a.pg.waitForTimeout(300);   // obrigado.json aplicado
    assert.equal(await visivel(a.pg, '#obrigado-falta'), true);
    assert.match(await a.pg.getAttribute('#falta-zap', 'href'), /^mailto:/);
    assert.equal((await a.pg.textContent('#falta-zap')).trim(), 'Mandar por e-mail');
    assert.match(await a.pg.textContent('#falta-texto'), /Mande logo por e-mail:$/);
    assert.doesNotMatch(await a.pg.textContent('#obrigado-falta'), /WhatsApp do suporte/, 'nenhuma frase fala de WhatsApp');
    assert.deepEqual(a.erros, []);
    await a.ctx.close();
  } finally { await nav.close(); srv.close(); }
});
