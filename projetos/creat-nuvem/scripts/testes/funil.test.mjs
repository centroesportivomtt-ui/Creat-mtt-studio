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
    URL, URLSearchParams, Promise, Date, Math, JSON, setTimeout, clearTimeout, AbortController, console,
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
    assert.match(await pg.textContent('#resumo-mensal'), /Abertura de R\$ 297\..*R\$ 297 só começa com o site no ar/);
    // recarregar não traz nome de volta ao endereço e mantém o negócio na tela
    await pg.reload(); await pg.waitForTimeout(300);
    assert.doesNotMatch(pg.url(), /Studio|Feira/);
    assert.equal(await pg.textContent('#abrir-negocio-nome'), 'Studio Bela & Cia');
    // anual: hoje só a Abertura (link da praça), com o anual cobrado quando o site entra no ar (D3)
    await pg.click('label.plano-opcao:has(input[value="aberto_anual"])');
    assert.equal(await pg.getAttribute('.pagar [data-checkout]', 'href'), link(PREF.feira));
    assert.match(await pg.textContent('.pagar-total'), /R\$ 297$/);
    assert.match(await pg.textContent('#resumo-anual'), /só a Abertura, R\$ 297\..*R\$ 1\.470 pelos 12 meses, é cobrado no dia em que o site entra no ar/);
    assert.equal(await pg.textContent('#barra-pagar strong'), 'R$ 297');
    // sem contador numérico na tela (D1) e parcelas explicadas (D7)
    assert.equal(await pg.isVisible('[data-se="varias-vagas"]'), false);
    assert.equal(await pg.isVisible('[data-se="ultima-vaga"]'), false);
    assert.match(await pg.textContent('#pagar-parcelas'), /Pix ou cartão em até 2x; as condições do parcelamento aparecem no Mercado Pago antes de você pagar/);
    assert.equal(await pg.locator('.pagar [data-checkout]').count(), 1);
    await pg.click('label.plano-opcao:has(input[value="vitrine"])');
    // formulário completo e clique em pagar (navegação para o Mercado Pago bloqueada)
    await pg.route(/mercadopago\.com\.br/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>mp</p>' }));
    await pg.fill('#p-responsavel', 'Maria Souza');
    await pg.fill('#p-whatsapp', '75991234567');
    await pg.fill('#p-endereco', 'Rua das Flores, 120, Centro, Feira de Santana-BA, 44001-000');
    await pg.fill('#p-email', 'maria@exemplo.com.br');
    await pg.check('#p-aceite');
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
    await pg2.fill('#p-responsavel', 'Maria Souza'); await pg2.fill('#p-whatsapp', '71991234567');
    await pg2.fill('#p-endereco', 'Rua A, 10, Centro, Salvador-BA, 40000-000'); await pg2.fill('#p-email', 'maria@exemplo.com.br'); await pg2.check('#p-aceite');
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

test('navegador: /obrigado/ manda Purchase só com aprovado, eventID = payment_id, uma vez, e limpa o endereço', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, erros } = await pagina(nav, base);
    await pg.goto(base + '/obrigado/?collection_id=111222333&collection_status=approved&payment_id=111222333&status=approved&external_reference=null&payment_type=bank_transfer&merchant_order_id=99&preference_id=' + PREF.feira + '&site_id=MLB&processing_mode=aggregator&merchant_account_id=null');
    await pg.waitForTimeout(400);
    assert.doesNotMatch(pg.url(), /payment_id|collection|preference_id|status=/, 'parâmetros do pagamento saem do endereço');
    let fila = await filaPixel(pg);
    const compras = fila.filter((a) => a[1] === 'Purchase');
    assert.equal(compras.length, 1);
    assert.deepEqual(compras[0].slice(2), [{ value: 297, currency: 'BRL' }, { eventID: '111222333' }]);
    assert.ok(fila.some((a) => a[1] === 'PageView'));
    assert.match(await pg.textContent('#obrigado-lead'), /aprovou o pagamento/);
    // a mesma volta de novo (recarga ou voltar): sem segundo Purchase
    await pg.goto(base + '/obrigado/?collection_status=approved&payment_id=111222333&preference_id=' + PREF.feira);
    await pg.waitForTimeout(300);
    fila = await filaPixel(pg);
    assert.equal(fila.filter((a) => a[1] === 'Purchase').length, 0, 'payment_id já medido');
    // pendente: nada
    await pg.goto(base + '/obrigado/?collection_status=pending&payment_id=444555666');
    await pg.waitForTimeout(300);
    assert.equal((await filaPixel(pg)).filter((a) => a[1] === 'Purchase').length, 0);
    // sem consentimento: nem Pixel carrega
    await pg.evaluate(() => localStorage.removeItem('creat:consentimento'));
    await pg.goto(base + '/obrigado/?collection_status=approved&payment_id=777888999&preference_id=' + PREF.feira);
    await pg.waitForTimeout(300);
    assert.equal(await pg.evaluate(() => typeof window.fbq), 'undefined');
    assert.deepEqual(erros, []);
  } finally { await nav.close(); srv.close(); }
});

test('navegador: Clarity só na home; /abrir/ e /obrigado/ carregam o Pixel e nunca o Clarity', { skip: !chromium && 'sem Playwright' }, async () => {
  const srv = await servidor(), base = 'http://127.0.0.1:' + srv.address().port;
  const nav = await chromium.launch();
  try {
    const { pg, erros, clarity } = await pagina(nav, base, { clarity: true });
    await pg.goto(base + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela&p=1'); await pg.waitForTimeout(400);
    await pg.goto(base + '/obrigado/?collection_status=approved&payment_id=5555666677&preference_id=' + PREF.inaug); await pg.waitForTimeout(400);
    assert.ok((await filaPixel(pg)).some((a) => a[1] === 'Purchase'), 'Pixel ligado em /obrigado/');
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
    assert.equal(await pg.isVisible('#barra-pagar'), false, 'banner e barra de pagar não se sobrepõem');
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
    await pg.waitForFunction(() => !document.querySelector('#previa').hidden);
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
    await Promise.all([pg.waitForEvent('load'), pg.click('#obrigado-pedido #esquecer')]);
    const sobrou = await pg.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) => k.startsWith('creat:')));
    assert.deepEqual(sobrou, []);
    assert.deepEqual(erros, []);
  } finally { await nav.close(); srv.close(); }
});
