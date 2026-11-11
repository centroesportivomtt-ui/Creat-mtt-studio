/*
 * Porta Aberta · endereço único (pacote H1, Pixel, 11/11/2026).
 * Roda com: CREAT_TESTE_TMP=/tmp npm test   (ou node --test scripts/testes/endereco.test.mjs)
 *
 * O canônico é https://nuvem.creatmtt.com.br. Quem abre o endereço antigo vai ao mesmo caminho, consulta e
 * fragmento no canônico (assets/canonico.js), levando o pedido e a escolha de medição no fragmento de transição.
 *
 * 1. Sem navegador: configuração, pacote (ida e volta, falha fechada), listas iguais às de vitrine.js, ordem dos
 *    scripts no <head> das 8 páginas e da prévia, canonical e og:url, e o host antigo só na lista de antigos.
 * 2. Com navegador de verdade (Playwright): os dois hosts reais servidos da pasta pública local (a lista ENTRA
 *    de scripts/montar-publico.cjs) por roteamento do contexto, com a origem de cada um isolada como no ar
 *    (localStorage por origem). Terceiros simulados e capturados (endereço, Referer e o endereço da página na hora).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const C = require(path.join(RAIZ, 'assets', 'canonico.js'));
const { ENTRA } = require(path.join(RAIZ, 'scripts', 'montar-publico.cjs'));
const FONTE_CK = fs.readFileSync(path.join(RAIZ, 'checkout.config.js'), 'utf8');
const FONTE_VIT = fs.readFileSync(path.join(RAIZ, 'assets', 'vitrine.js'), 'utf8');

// o canônico e o antigo vêm da fonte única (ENDERECO de scripts/producao/lib/comum.cjs): se ela mudar, as páginas
// que ficaram para trás reprovam aqui, e não passam por terem sido conferidas contra uma constante do próprio teste
const { ENDERECO } = require(path.join(RAIZ, 'scripts', 'producao', 'lib', 'comum.cjs'));
const HA = new URL(ENDERECO.antigo).hostname, HN = new URL(ENDERECO.canonico).hostname, HO = 'outro.exemplo';
const A = 'https://' + HA, N = 'https://' + HN, O = 'https://' + HO;
const SEGREDO = 'q1Zr8Xn4Lw0bT6yHc9VfEA', ID = 'PA-7K3QX2MD4R';
const PREF_FEIRA = '2189692475-c33953d5-4c69-4bc9-8de8-0ff4d7dfbeff';
const PAGINAS = ['index.html', 'abrir/index.html', 'obrigado/index.html', 'termos/index.html', 'privacidade/index.html', 'bastidores/index.html', '404.html', 'previa/index.html'];
const H = 3600 * 1000;

const PEDIDO_CHEIO = (o = {}) => Object.assign({
  id: ID, segredo: SEGREDO, produto: 'pa-abertura-inauguracao-2026-11', valor: 297, praca: 'feira',
  link: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=' + PREF_FEIRA, plano: 'vitrine', nicho: 'salao', negocio: 'Studio Bela & Cia', cidade: 'Feira de Santana',
  responsavel: 'Maria Souza', whatsapp_negocio: '5575900000000', endereco: 'Rua das Flores, 120, Centro, Feira de Santana-BA, 44001-000',
  horarios: 'seg=09:00-18:00;ter=09:00-18:00;qua=09:00-18:00;qui=09:00-18:00;sex=09:00-18:00;sab=09:00-13:00;dom=fechado',
  email: 'maria@example.com', origem: 'utm_source=meta;utm_campaign=feira;utm_content=A1-salao-v1', previa: N + '/previa/#k=salao&n=Studio&p=1',
  aceite_termos: '2026-11-10T10:00:00-03:00 termos-v2', paleta: 1, salvo_em: new Date(Date.now() - H).toISOString(), status: 'enviado'
}, o);
const EM = new Date(Math.floor((Date.now() - 2 * H) / 1000) * 1000).toISOString();
const CONSENT = (pixel, em = EM) => ({ versao: 1, analytics: true, pixel, clarity: pixel, em });
// Depois do prazo do pedido (20/11/2026), os testes de navegador injetam um prazo de amanhã para continuar valendo.
const PRAZO_TESTE = Date.now() > C.PRAZO_PEDIDO ? new Date(Date.now() + 24 * H).toISOString() : null;
const DEPOIS_DO_PRAZO = Math.floor(C.PRAZO_PEDIDO / 1000) + 60;
const PESSOAIS = /Maria Souza|5575900000000|maria@example|Rua das Flores|seg=09/;

// Memória de localStorage simples, para a parte sem navegador.
function memoria(inicial = {}) {
  const m = new Map(Object.entries(inicial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
const cfg = () => C.configuracao({ canonico: N, antigos: [HA], prazo_pedido: PRAZO_TESTE || undefined });
const loc = (u) => { const x = new URL(u); return { pathname: x.pathname, search: x.search, hash: x.hash, hostname: x.hostname, protocol: x.protocol }; };
const fragDe = (url) => url.slice(url.indexOf('#') + 1);

/* ======================================================================== 1. sem navegador */

test('H1 configuração: canônico https sem caminho; o próprio canônico nunca entra na lista de antigos (sem laço)', () => {
  assert.deepEqual(C.configuracao({ canonico: N, antigos: [HA] }), { origem: N, host: HN, antigos: [HA], prazo: C.PRAZO_PEDIDO });
  assert.deepEqual(C.configuracao({ canonico: N, antigos: [HA, HN, HN + '.', 'Ruim Host', 3] }).antigos, [HA]);
  assert.deepEqual(C.configuracao({ canonico: N, antigos: [HA + '.'] }).antigos, [HA], 'ponto final some da lista');
  assert.equal(C.PRAZO_PEDIDO, Date.parse('2026-11-20T23:59:59-03:00'), 'o pedido atravessa até o fim de 20/11 (Bahia)');
  assert.equal(C.configuracao({ canonico: N, antigos: [HA], prazo_pedido: '2026-11-15T00:00:00-03:00' }).prazo, Date.parse('2026-11-15T00:00:00-03:00'));
  assert.equal(C.configuracao({ canonico: N, antigos: [HA], prazo_pedido: 'amanhã' }).prazo, C.PRAZO_PEDIDO, 'prazo ruim vale o padrão');
  for (const ruim of ['http://' + HN, N + '/x', N + ':8443', 'https://u:s@' + HN, N + '/?a=1', 'nada', '']) assert.equal(C.configuracao({ canonico: ruim, antigos: [HA] }), null, ruim);
  assert.equal(C.configuracao(null), null);
  assert.equal(C.configuracao({ canonico: N }), null);
});

test('H1 checkout.config.js: endereço canônico e lista de antigos, iguais em CREAT_CHECKOUT.endereco e CREAT_ENDERECO', async () => {
  const vm = await import('node:vm');
  const ctx = { window: {} }; vm.createContext(ctx); vm.runInContext(FONTE_CK, ctx);
  assert.equal(ctx.window.CREAT_ENDERECO.canonico, N);
  assert.deepEqual(Array.from(ctx.window.CREAT_ENDERECO.antigos), [HA]);
  assert.equal(ctx.window.CREAT_CHECKOUT.endereco, ctx.window.CREAT_ENDERECO);
});

test('H1 listas de canonico.js iguais às de vitrine.js (planos, nichos, praças e catálogo)', () => {
  const lista = (nome) => JSON.parse(FONTE_VIT.match(new RegExp('var ' + nome + " = (\\[[^\\]]*\\])"))[1].replace(/'/g, '"'));
  assert.deepEqual(C.PLANOS, lista('PLANOS'));
  assert.deepEqual(C.NICHOS, lista('NICHOS'));
  assert.deepEqual(C.PRACAS, lista('PRACAS'));
  const cat = FONTE_VIT.match(/var CATALOGO = (\{[^}]*\})/)[1].replace(/'/g, '"');
  assert.deepEqual(C.CATALOGO, JSON.parse(cat));
  // os formatos do id e do segredo são os do servidor (schema/pedido-regras.mjs, via vitrine.js)
  assert.ok(FONTE_VIT.includes("RE_ID = /^PA-[0-9A-Z]{10}$/") && FONTE_VIT.includes("RE_SEGREDO = /^[A-Za-z0-9_-]{21}[AQgw]$/"));
});

test('H1 pacote: só id, segredo e o enxuto do pedido e a escolha de medição; nenhum dado pessoal; ida e volta exata', () => {
  const ls = memoria({ 'creat:pedido:v1': JSON.stringify(PEDIDO_CHEIO()), 'creat:consentimento': JSON.stringify(CONSENT(false)) });
  const url = C.destino(cfg(), loc(A + '/obrigado/?payment_id=188866285972&resultado=aprovado#k=salao'), ls);
  assert.ok(url.startsWith(N + '/obrigado/?payment_id=188866285972&resultado=aprovado#m=v1.'), url);
  assert.ok(url.endsWith('~k=salao'), 'fragmento original no fim');
  const antes = url.slice(0, url.indexOf('#'));
  assert.ok(!antes.includes(SEGREDO), 'segredo nunca no caminho nem na consulta');
  const tr = C.lerTransicao(fragDe(url));
  assert.equal(tr.original, 'k=salao');
  assert.deepEqual(Object.keys(tr.pacote).sort(), ['c', 'p', 'v']);
  assert.deepEqual(Object.keys(tr.pacote.p).sort(), ['c', 'i', 'k', 'n', 'pc', 'pl', 'pr', 's', 'st', 't', 'va']);
  assert.equal(tr.pacote.p.i, ID); assert.equal(tr.pacote.p.s, SEGREDO); assert.equal(tr.pacote.c.x, false);
  assert.doesNotMatch(C.deB64(fragDe(url).slice(5).split('~')[0]), PESSOAIS);
  assert.ok(fragDe(url).split('~')[0].length < 450, 'pacote pequeno: ' + fragDe(url).length);
  // nada a levar: o fragmento original passa sozinho; sem fragmento, sem '#'
  assert.equal(C.destino(cfg(), loc(A + '/?utm_source=meta#k=salao'), memoria()), N + '/?utm_source=meta#k=salao');
  assert.equal(C.destino(cfg(), loc(A + '/termos/'), memoria()), N + '/termos/');
  // chegou no antigo com um fragmento de transição: nunca empilha
  assert.equal(C.destino(cfg(), loc(A + '/#m=v1.QUFB~k=salao'), memoria()), N + '/#k=salao');
  // pedido antigo de 8 sem segredo, pedido vencido e consentimento de 181 dias não viajam
  const velho = memoria({ 'creat:pedido:v1': JSON.stringify(PEDIDO_CHEIO({ id: 'PA-ABCDEFGH', segredo: undefined })), 'creat:consentimento': JSON.stringify(Object.assign(CONSENT(true), { em: new Date(Date.now() - 181 * 24 * H).toISOString() })) });
  assert.equal(C.montarPacote(velho), '');
  assert.equal(C.montarPacote(memoria({ 'creat:pedido:v1': JSON.stringify(PEDIDO_CHEIO({ salvo_em: new Date(Date.now() - 31 * 24 * H).toISOString() })) })), '');
  // da escolha de medição só a RECUSA viaja; aceite fica no antigo e o canônico pergunta de novo
  const aceito = C.lerTransicao(C.montarPacote(memoria({ 'creat:pedido:v1': JSON.stringify(PEDIDO_CHEIO()), 'creat:consentimento': JSON.stringify(CONSENT(true)) }))).pacote;
  assert.equal('c' in aceito, false, 'aceite não viaja');
  assert.equal(C.montarPacote(memoria({ 'creat:consentimento': JSON.stringify(CONSENT(true)) })), '', 'só aceite: nada a levar');
  // depois do prazo o pedido não viaja mais; a recusa continua
  const depois = C.montarPacote(memoria({ 'creat:pedido:v1': JSON.stringify(PEDIDO_CHEIO({ salvo_em: new Date(C.PRAZO_PEDIDO - H).toISOString() })), 'creat:consentimento': JSON.stringify(CONSENT(false, new Date(C.PRAZO_PEDIDO - H).toISOString())) }), DEPOIS_DO_PRAZO);
  assert.deepEqual(Object.keys(JSON.parse(C.deB64(depois.slice(5)))).sort(), ['c', 'v'], 'depois do prazo: só a recusa');
  // cidade fora da regra sai sozinha; o pedido continua
  const p2 = C.lerTransicao(C.montarPacote(memoria({ 'creat:pedido:v1': JSON.stringify(PEDIDO_CHEIO({ cidade: '<b>x</b>' })) }))).pacote.p;
  assert.equal('c' in p2, false); assert.equal(p2.i, ID);
});

test('H1 pacote: falha fechada em formato, tamanho, chave extra, tipo, id, segredo, data e protótipo', () => {
  const bom = { v: 1, p: { i: ID, s: SEGREDO, pl: 'vitrine', k: 'salao', n: 'Studio Bela & Cia', st: 'enviado', t: Math.floor(Date.now() / 1000) - 60 } };
  const f = (o) => 'm=v1.' + C.paraB64(typeof o === 'string' ? o : JSON.stringify(o));
  assert.ok(C.lerTransicao(f(bom)).pacote, 'o bom passa');
  const ruins = {
    'chave extra no topo': Object.assign({}, bom, { z: 1 }),
    'chave extra no pedido': { v: 1, p: Object.assign({}, bom.p, { whatsapp: '5575900000000' }) },
    'versão 2': Object.assign({}, bom, { v: 2 }),
    'sem nada': { v: 1 },
    'id curto': { v: 1, p: Object.assign({}, bom.p, { i: 'PA-ABCDEFGH' }) },
    'id com minúscula': { v: 1, p: Object.assign({}, bom.p, { i: 'PA-7k3qx2md4r' }) },
    'segredo errado': { v: 1, p: Object.assign({}, bom.p, { s: SEGREDO.slice(0, 21) + 'B' }) },
    'segredo número': { v: 1, p: Object.assign({}, bom.p, { s: 123 }) },
    'plano fora': { v: 1, p: Object.assign({}, bom.p, { pl: 'gratis' }) },
    'nome com <': { v: 1, p: Object.assign({}, bom.p, { n: '<img src=x>' }) },
    'nome de 41': { v: 1, p: Object.assign({}, bom.p, { n: 'A'.repeat(41) }) },
    'valor trocado': { v: 1, p: Object.assign({}, bom.p, { pr: 'pa-abertura-2026-11', va: 1 }) },
    'status fora': { v: 1, p: Object.assign({}, bom.p, { st: 'pago' }) },
    'data no futuro': { v: 1, p: Object.assign({}, bom.p, { t: Math.floor(Date.now() / 1000) + 3600 }) },
    'data velha': { v: 1, p: Object.assign({}, bom.p, { t: Math.floor(Date.now() / 1000) - 31 * 86400 }) },
    'consentimento texto': { v: 1, c: { x: 'true', t: Math.floor(Date.now() / 1000) } },
    'consentimento aceito (aceite nunca vem de endereço)': { v: 1, c: { x: true, t: Math.floor(Date.now() / 1000) } },
    'pedido com aceite junto': { v: 1, p: bom.p, c: { x: true, t: Math.floor(Date.now() / 1000) } },
    'consentimento com chave extra': { v: 1, c: { x: true, t: Math.floor(Date.now() / 1000), y: 1 } },
    'lista': [bom],
    'protótipo': '{"v":1,"__proto__":{"x":1},"c":{"x":true,"t":' + Math.floor(Date.now() / 1000) + '}}',
    'json quebrado': '{"v":1,'
  };
  for (const [nome, o] of Object.entries(ruins)) assert.equal(C.lerTransicao(f(o)).pacote, null, nome);
  assert.equal(C.lerTransicao('m=v1.' + 'A'.repeat(C.MAX_B64 + 1)).pacote, null, 'gigante');
  const pertoDoPrazo = Object.assign({}, bom.p, { t: Math.floor(C.PRAZO_PEDIDO / 1000) - 3600 });
  assert.equal(C.lerTransicao(f({ v: 1, p: pertoDoPrazo }), DEPOIS_DO_PRAZO).pacote, null, 'pedido depois do prazo');
  assert.ok(C.lerTransicao(f({ v: 1, p: pertoDoPrazo }), DEPOIS_DO_PRAZO - 120).pacote, 'o mesmo pedido antes do prazo passa');
  assert.ok(C.lerTransicao(f({ v: 1, c: { x: false, t: DEPOIS_DO_PRAZO } }), DEPOIS_DO_PRAZO + 60).pacote, 'a recusa continua depois do prazo');
  assert.equal(C.lerTransicao('m=v1.@@@~k=salao').pacote, null, 'fora do alfabeto');
  assert.equal(C.lerTransicao('m=v1.@@@~k=salao').original, 'k=salao', 'o original sobrevive ao pacote ruim');
  assert.equal(C.lerTransicao('m=v9.QUFB').pacote, null, 'versão desconhecida');
  assert.equal(C.lerTransicao('k=salao'), null, 'fragmento comum não é transição');
});

test('H1 aplicar: só com o Referer do salto; o pedido do canônico vence; recusar nunca vira aceitar', () => {
  const agora = Math.floor(Date.now() / 1000), c = cfg();
  const pac = C.lerTransicao(C.montarPacote(memoria({ 'creat:pedido:v1': JSON.stringify(PEDIDO_CHEIO()), 'creat:consentimento': JSON.stringify(CONSENT(false)) }), agora, c.prazo), agora, c.prazo).pacote;
  assert.ok(pac && pac.p && pac.c);
  // sem a prova do salto nada entra (fragmento colado, mandado por mensagem ou vindo de outro site)
  const semProva = memoria();
  assert.deepEqual(C.aplicar(pac, semProva), { pedido: false, consentimento: false });
  assert.deepEqual(C.aplicar(pac, semProva, 'sim'), { pedido: false, consentimento: false }, 'só true conta');
  assert.equal(semProva._m.size, 0);
  // a prova: Referer exatamente igual à origem do antigo (o salto manda só a origem)
  for (const ok of [A + '/', 'https://' + HA + './', 'https://' + HN + './']) assert.equal(C.veioDoAntigo(c, ok), true, ok);
  for (const ruim of ['', A, A + '/termos/', A + '/?x=1', N + '/', O + '/', 'https://atacante.exemplo/', 'http://' + HA + '/', 'https://' + HA + '.atacante.exemplo/']) assert.equal(C.veioDoAntigo(c, ruim), false, ruim);
  const vazio = memoria();
  assert.deepEqual(C.aplicar(pac, vazio, true), { pedido: true, consentimento: true });
  const p = JSON.parse(vazio.getItem('creat:pedido:v1'));
  assert.equal(p.enxuto, true); assert.equal(p.id, ID); assert.equal(p.segredo, SEGREDO); assert.equal(p.veio_do_endereco_antigo, true);
  assert.doesNotMatch(vazio.getItem('creat:pedido:v1'), PESSOAIS);
  assert.equal(JSON.parse(vazio.getItem('creat:consentimento')).pixel, false);
  assert.equal(JSON.parse(vazio.getItem('creat:consentimento')).em, EM, 'o prazo de 180 dias continua do dia da recusa');
  // pedido do canônico vence
  const cheio = memoria({ 'creat:pedido:v1': JSON.stringify(PEDIDO_CHEIO({ id: 'PA-AAAAAAAAAA' })) });
  assert.equal(C.aplicar(pac, cheio, true).pedido, false);
  assert.equal(JSON.parse(cheio.getItem('creat:pedido:v1')).id, 'PA-AAAAAAAAAA');
  // recusa do antigo (há 2 h) contra aceite do canônico: o aceite mais velho cai; o mais novo fica
  const aceiteVelho = memoria({ 'creat:consentimento': JSON.stringify(CONSENT(true, new Date(Date.now() - 72 * H).toISOString())) });
  assert.equal(C.aplicar(pac, aceiteVelho, true).consentimento, true);
  assert.equal(JSON.parse(aceiteVelho.getItem('creat:consentimento')).pixel, false, 'recusa mais nova vence aceite mais velho');
  const aceiteNovo = memoria({ 'creat:consentimento': JSON.stringify(CONSENT(true, new Date(Date.now() - 60 * 1000).toISOString())) });
  assert.equal(C.aplicar(pac, aceiteNovo, true).consentimento, false);
  assert.equal(JSON.parse(aceiteNovo.getItem('creat:consentimento')).pixel, true, 'aceite dado depois da recusa fica');
  const recusaDaqui = memoria({ 'creat:consentimento': JSON.stringify(CONSENT(false, new Date(Date.now() - 72 * H).toISOString())) });
  assert.equal(C.aplicar(pac, recusaDaqui, true).consentimento, false, 'recusa daqui fica como está');
  // aceite forjado nunca grava, nem com a prova do salto: o pacote inteiro cai
  const forjado = C.lerTransicao('m=v1.' + C.paraB64(JSON.stringify({ v: 1, c: { x: true, t: agora } })));
  assert.equal(forjado.pacote, null);
  const v2 = memoria(); assert.deepEqual(C.aplicar(forjado.pacote, v2, true), { pedido: false, consentimento: false }); assert.equal(v2._m.size, 0);
});

test('H1 <head>: checkout.config.js e canonico.js sem defer antes de qualquer outro script e folha de estilo, nas 8 páginas e na prévia', () => {
  for (const f of PAGINAS) {
    const h = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    const cab = h.slice(0, h.indexOf('</head>'));
    const tags = [...cab.matchAll(/<(script|link)\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/application\/ld\+json/.test(t));
    assert.match(tags[0], /^<script src="(\.\.\/|\/)?checkout\.config\.js">$/, f + ': 1º ' + tags[0]);
    assert.match(tags[1], /^<script src="(\.\.\/|\/)?assets\/canonico\.js">$/, f + ': 2º ' + tags[1]);
    assert.ok(!/defer|async|type="module"/.test(tags[0] + tags[1]), f);
    assert.equal((h.match(/<script[^>]*checkout\.config\.js/g) || []).length, 1, f + ': checkout.config.js uma vez só');
    // nenhum script inline novo que rode (dados estruturados não rodam)
    assert.equal([...h.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/g)].length, 0, f + ': script inline');
  }
  const esperado = { 'index.html': '/', 'abrir/index.html': '/abrir/', 'obrigado/index.html': '/obrigado/', 'termos/index.html': '/termos/', 'privacidade/index.html': '/privacidade/', 'bastidores/index.html': '/bastidores/' };
  for (const [f, cam] of Object.entries(esperado)) {
    const h = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    assert.ok(h.includes(`<link rel="canonical" href="${N}${cam}">`), f + ': canonical');
    assert.ok(h.includes(`<meta property="og:url" content="${N}${cam}">`), f + ': og:url');
  }
  const home = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');
  assert.ok(home.includes(`<meta property="og:image" content="${N}/assets/img/sede-ilha.webp">`));
  const ld = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.ok(ld['@graph'].every((x) => x.url === N + '/'));
});

test('H1 o host antigo só existe na lista de antigos, nos arquivos do pacote', () => {
  const arquivos = PAGINAS.concat(['assets/vitrine.js', 'assets/canonico.js', 'previa/previa.js', 'checkout.config.js', '_headers']);
  for (const f of arquivos) {
    const linhas = fs.readFileSync(path.join(RAIZ, f), 'utf8').split('\n').filter((l) => l.includes(HA));
    if (f === 'checkout.config.js') assert.deepEqual(linhas.map((l) => l.trim()), ["antigos: ['" + HA + "']"], f);
    else assert.deepEqual(linhas, [], f);
  }
});

test('H1 tempo limite: sem resposta do canônico em 2,5 s, cancela, marca a aba e recarrega o antigo inteiro; sem marca possível só mostra; erro mostra na hora', () => {
  const janela = (opcoes = {}) => {
    const tempos = [], eventos = [], estilo = new Map(), filhos = [], feitos = [];
    const doc = { documentElement: { style: { setProperty: (k, v) => estilo.set(k, v), removeProperty: (k) => estilo.delete(k) }, appendChild: (x) => filhos.push(x) }, head: { appendChild: (x) => filhos.push(x) }, createElement: () => ({}) };
    const ss = opcoes.ss === 'quebrado' ? { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } } : (opcoes.ss || memoria());
    const W = { document: doc, CREAT_ENDERECO: { canonico: N, antigos: [HA] }, localStorage: memoria(), sessionStorage: ss, history: { state: null, replaceState() {} },
      location: Object.assign(loc(opcoes.url || A + '/termos/?x=1#k=salao'), { replace: opcoes.replace || ((u) => feitos.push(['replace', u])), reload: () => feitos.push(['reload']) }),
      stop: () => feitos.push(['stop']), setTimeout: (f, ms) => tempos.push([ms, f]), dispatchEvent: (e) => eventos.push(e.type) };
    if (opcoes.nomeTravado) Object.defineProperty(W, 'name', { get: () => '', set() {} }); else W.name = opcoes.nome || '';
    W.top = W;
    return { W, tempos, eventos, estilo, filhos, feitos };
  };
  const j = janela();
  C.estado.mudando = false;
  C.rodar(j.W);
  assert.deepEqual(j.feitos, [['replace', N + '/termos/?x=1#k=salao']]);
  assert.equal(C.estado.mudando, true);
  assert.equal(j.estilo.get('visibility'), 'hidden', 'escondida enquanto troca');
  assert.equal(j.filhos[0].content, 'origin', 'o salto leva no Referer só a origem do antigo');
  assert.deepEqual(j.tempos.map((t) => t[0]), [2500, 8000]);
  j.tempos[0][1]();
  assert.equal(j.W.sessionStorage.getItem(C.MARCA), '1', 'a aba fica marcada');
  assert.deepEqual(j.feitos.slice(1), [['stop'], ['reload']], 'cancela a navegação pendente e recarrega o antigo');
  assert.equal(j.estilo.has('visibility'), false, 'mostrou em 2,5 s');
  j.tempos[1][1]();
  assert.equal(C.estado.mudando, false); assert.deepEqual(j.eventos, ['creat:canonico-ficou'], 'rede de proteção de 8 s, se a recarga não vier');
  // depois da recarga: com a marca, o antigo abre inteiro e não tenta de novo nesta aba
  const r = janela({ ss: j.W.sessionStorage });
  C.rodar(r.W);
  assert.deepEqual(r.feitos, []); assert.equal(r.estilo.has('visibility'), false); assert.equal(C.estado.mudando, false); assert.deepEqual(r.tempos, []);
  // sessionStorage bloqueado: a marca vai no nome da janela, que sobrevive à recarga
  const q = janela({ ss: 'quebrado' });
  C.rodar(q.W); q.tempos[0][1]();
  assert.equal(q.W.name, C.MARCA); assert.deepEqual(q.feitos.slice(1), [['stop'], ['reload']]);
  const q2 = janela({ ss: 'quebrado', nome: C.MARCA });
  C.rodar(q2.W); assert.deepEqual(q2.feitos, [], 'com a marca no nome, não troca');
  C.estado.mudando = false;
  // nenhuma marca possível: recarregar voltaria a trocar (laço). Só mostra e libera a vitrine
  const t = janela({ ss: 'quebrado', nomeTravado: true });
  C.rodar(t.W); t.tempos[0][1]();
  assert.deepEqual(t.feitos.map((x) => x[0]), ['replace'], 'sem recarga sem marca');
  assert.equal(t.estilo.has('visibility'), false); assert.equal(C.estado.mudando, false); assert.deepEqual(t.eventos, ['creat:canonico-ficou']);
  // host com ponto final: o antigo e o próprio canônico vão ao canônico sem ponto
  for (const u of ['https://' + HA + './obrigado/?payment_id=1', 'https://' + HN + './obrigado/?payment_id=1']) {
    const d = janela({ url: u }); C.estado.mudando = false; C.rodar(d.W);
    assert.deepEqual(d.feitos, [['replace', N + '/obrigado/?payment_id=1']], u);
  }
  C.estado.mudando = false;
  // location.replace que falha: a página aparece e a vitrine roda na hora; o temporizador de 2,5 s não recarrega depois
  const k = janela({ replace: () => { throw new Error('bloqueado'); } });
  assert.throws(() => C.rodar(k.W));
  C.ficar(k.W); C.mostrar(k.W);
  assert.equal(k.estilo.has('visibility'), false); assert.equal(C.estado.mudando, false); assert.deepEqual(k.eventos, ['creat:canonico-ficou']);
  k.tempos[0][1](); assert.deepEqual(k.feitos, [], 'nada de recarga depois do erro');
  // o envoltório de verdade: o arquivo rodado como no navegador, com replace quebrado
  const vm = require('node:vm');
  const z = janela({ replace: () => { throw new Error('bloqueado'); } });
  z.W.window = z.W; z.W.URL = URL; z.W.Event = class { constructor(t) { this.type = t; } };
  vm.createContext(z.W); vm.runInContext(fs.readFileSync(path.join(RAIZ, 'assets', 'canonico.js'), 'utf8'), z.W);
  assert.equal(z.estilo.has('visibility'), false, 'erro: a página aparece na hora');
  assert.equal(z.W.CreatCanonico.mudando, false); assert.deepEqual(z.eventos, ['creat:canonico-ficou']);
  C.estado.mudando = false;
});

/* ======================================================================== 2. no navegador */
let chromium = null;
try { ({ chromium } = require(require.resolve('playwright', { paths: [RAIZ] }))); } catch (e) { chromium = null; }
const pular = !chromium && 'sem Playwright';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const CSP = fs.readFileSync(path.join(RAIZ, '_headers'), 'utf8').match(/^\/\*\n\s+Content-Security-Policy: (.+)$/m)[1];
const TOPO = new Set(ENTRA.map((e) => e.split('/')[0]));

// Arquivo da pasta pública (só o que montar-publico.cjs publica), como o host serve.
function arquivo(caminho) {
  const rel = decodeURIComponent(caminho).replace(/^\/+/, '');
  if (rel && (!TOPO.has(rel.split('/')[0]) || rel.split('/').some((p) => p.startsWith('.') || p === '..') || /\.(cjs|mjs)$/.test(rel) || /README\.md$/i.test(rel))) return null;
  let f = path.join(RAIZ, rel);
  if (!f.startsWith(RAIZ)) return null;
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  return fs.existsSync(f) ? f : null;
}

async function abrir(nav, opcoes = {}) {
  const ctx = await nav.newContext(Object.assign({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true }, opcoes.contexto || {}));
  const reg = { reqs: [], terceiros: [], navs: [], api: [], erros: [], console: [] };
  ctx.on('request', (q) => {
    const principal = q.isNavigationRequest() && !q.frame().parentFrame();
    reg.reqs.push({ url: q.url(), referer: q.headers().referer || '', nav: principal, host: new URL(q.url()).hostname });
    if (principal) reg.navs.push(q.url());   // documentos carregados na aba (replaceState não conta)
  });
  await ctx.route('**/*', async (r) => { try { await rotear(r); } catch (e) { if (!/cancel|handled|closed|destroyed|Target/i.test(String(e && e.message))) throw e; } });
  async function rotear(r) {
    const q = r.request(), u = new URL(q.url()), hn = u.hostname.replace(/\.$/, '');
    if ([HA, HN, HO].includes(hn)) {
      // canônico lento ou fora: o documento do novo demora (a navegação pode ser cancelada no meio)
      if (opcoes.atrasoNovo && hn === HN && q.isNavigationRequest()) await pausa(opcoes.atrasoNovo);
      if (u.pathname === '/__semente') return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>semente</title><p>semente</p>' });
      if (u.pathname.startsWith('/api/pa/')) {
        const nome = u.pathname.slice('/api/pa/'.length);
        let corpo = null; try { corpo = JSON.parse(q.postData() || 'null'); } catch (e) { corpo = 'invalido'; }
        reg.api.push({ host: hn, nome, corpo });
        const resp = opcoes.api && opcoes.api[nome];
        if (resp) return r.fulfill({ status: resp.status, contentType: 'application/json', body: JSON.stringify(resp.json || {}) });
        if (nome === 'contar') return r.fulfill({ status: 204, body: '' });
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(nome === 'consultarPedido' ? { ok: true, status: 'aguardando_pagamento' } : nome === 'confirmarPagamento' ? { ok: false, motivo: 'nao_confirmado' } : { ok: true }) });
      }
      const prazo = opcoes.prazo || PRAZO_TESTE;
      if ((opcoes.config || prazo) && u.pathname === '/checkout.config.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: FONTE_CK.replace("antigos: ['" + HA + "']", 'antigos: ' + JSON.stringify(opcoes.config || [HA]) + (prazo ? ', prazo_pedido: ' + JSON.stringify(prazo) : '')) });
      const f = arquivo(u.pathname);
      const cab = opcoes.csp ? { 'content-security-policy': CSP } : {};
      if (!f) return r.fulfill({ status: 404, headers: Object.assign({ 'content-type': MIME['.html'] }, cab), body: fs.readFileSync(path.join(RAIZ, '404.html')) });
      if (/dados[\\/](precos|vagas)\.json$/.test(f)) { const o = JSON.parse(fs.readFileSync(f, 'utf8')); o.atualizado_em = new Date(Date.now() - H).toISOString(); return r.fulfill({ status: 200, contentType: MIME['.json'], body: JSON.stringify(o) }); }
      let corpo = fs.readFileSync(f);
      // O Base44 injeta scripts dele no fim do <head>. O espião faz o mesmo: lê o endereço e manda a um terceiro.
      if (opcoes.espiao && f.endsWith('.html')) corpo = corpo.toString('utf8').replace('</head>', '<script src="https://terceiro.exemplo/espiao.js"></script></head>');
      return r.fulfill({ status: 200, headers: Object.assign({ 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }, cab), body: corpo });
    }
    // terceiro: registra o endereço, o Referer e o endereço da página no momento da requisição
    let naHora = ''; try { naHora = q.frame().url(); } catch (e) {}
    reg.terceiros.push({ url: q.url(), referer: q.headers().referer || '', naHora, tipo: q.resourceType() });
    if (u.hostname === 'terceiro.exemplo' && u.pathname === '/espiao.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.__espiao=location.href;try{window.__espiaoNav=performance.getEntriesByType("navigation")[0].name}catch(e){};(new Image()).src="https://terceiro.exemplo/px?u="+encodeURIComponent(location.href);' });
    if (/mercadopago\.com\.br$/.test(u.hostname)) return r.fulfill({ status: 200, contentType: 'text/html', body: '<p>mp</p>' });
    return r.fulfill({ status: 200, contentType: /fonts\.googleapis/.test(u.hostname) ? 'text/css' : 'text/javascript', body: '' });
  }
  const pg = await ctx.newPage();
  pg.on('pageerror', (e) => reg.erros.push(e.message));
  pg.on('console', (m) => { if (m.type() === 'error') reg.console.push(m.text()); });
  return { ctx, pg, reg };
}
// grava no localStorage de uma origem sem passar pela vitrine (página semente, sem canonico.js)
async function semear(pg, origem, dados) {
  await pg.goto(origem + '/__semente');
  await pg.evaluate((d) => { localStorage.clear(); for (const [k, v] of Object.entries(d)) localStorage.setItem(k, JSON.stringify(v)); }, dados);
}
async function lerLS(pg, origem) {
  await pg.goto(origem + '/__semente');
  return pg.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
}
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const estadoObrigado = (pg, t) => pg.waitForFunction((x) => document.querySelector('main').getAttribute('data-texto') === x, t, { timeout: 15000 });
const semSegredo = (reg, rotulo) => {
  for (const q of reg.reqs) {
    const semFrag = q.url.split('#')[0];
    assert.ok(!semFrag.includes(SEGREDO), rotulo + ': segredo no endereço de ' + semFrag);
    assert.ok(!q.referer.includes(SEGREDO) && !q.referer.includes('m=v1'), rotulo + ': segredo no Referer de ' + semFrag);
  }
  for (const t of reg.terceiros) {
    assert.ok(!t.url.includes(SEGREDO) && !decodeURIComponent(t.url).includes(SEGREDO), rotulo + ': segredo em ' + t.url);
    // Folha de estilo, fonte e arquivo de script declarados no HTML saem pelo leitor antecipado do navegador antes de qualquer
    // script rodar: baixar não executa código, e o Referer leva só a origem (o fragmento nunca vai no Referer). O que o código
    // de terceiro manda ao rodar (imagem, fetch, beacon) só pode sair com a barra já limpa; o espião prova o que ele vê ao rodar.
    if (!/^(stylesheet|font|script)$/.test(t.tipo)) assert.ok(!t.naHora.includes('m=v1') && !t.naHora.includes(SEGREDO), rotulo + ': a barra ainda tinha o fragmento de transição quando ' + t.url + ' (' + t.tipo + ') saiu');
  }
};

test('H1 navegador: antigo com utm vai ao novo com utm, mesmo caminho e fragmento; uma troca só, sem laço', { skip: pular }, async () => {
  const nav = await chromium.launch();
  try {
    const { ctx, pg, reg } = await abrir(nav);
    await pg.goto(A + '/?utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=A1-salao-v1');
    await pg.waitForURL((u) => u.hostname === HN);
    await pg.waitForFunction(() => document.documentElement.classList.contains('js-pronto'));
    await pausa(1500);
    const u = new URL(pg.url());
    assert.equal(u.origin, N); assert.equal(u.pathname, '/');
    assert.equal(u.search, '?utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=A1-salao-v1');
    assert.deepEqual(reg.navs.map((x) => new URL(x).hostname), [HA, HN], 'uma troca só: ' + reg.navs.join(' > '));
    // no antigo nada mediu, contou nem carregou terceiro antes de trocar
    assert.equal(reg.api.filter((a) => a.host === HA).length, 0, 'contador no antigo');
    assert.deepEqual(reg.erros, []);
    // caminho, consulta e fragmento numa página comum
    await pg.goto(A + '/termos/?teste=1#preferencias');
    await pg.waitForURL((x) => x.hostname === HN);
    assert.equal(pg.url(), N + '/termos/?teste=1#preferencias');
    // prévia aberta direto no antigo (link copiado antes da troca) e rota que não existe
    await pg.goto(A + '/previa/#k=salao&n=Studio%20Bela&c=Salvador&p=2');
    await pg.waitForURL((x) => x.hostname === HN);
    assert.equal(pg.url(), N + '/previa/#k=salao&n=Studio%20Bela&c=Salvador&p=2');
    await pg.waitForSelector('#motor-raiz header, #motor-raiz .hero, #motor-raiz h1', { timeout: 15000 });
    const r404 = await pg.goto(A + '/nao-existe/?x=1');
    await pg.waitForURL((x) => x.hostname === HN);
    assert.equal(new URL(pg.url()).pathname, '/nao-existe/');
    assert.ok(r404);
    assert.deepEqual(reg.erros, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test('H1 navegador: /obrigado/ com payment_id e resultado no antigo chega igual no novo e acha o pedido salvo no antigo; o segredo nunca vaza; o aceite não atravessa', { skip: pular }, async (t) => {
  const nav = await chromium.launch();
  try {
    const prazo = new Date(Date.now() + 71 * H).toISOString();
    const { ctx, pg, reg } = await abrir(nav, { espiao: true, api: {
      confirmarPagamento: { status: 200, json: { ok: true, status: 'pago' } },
      consultarPedido: { status: 200, json: { ok: true, status: 'pago', prazo_fim: prazo, entrega_prevista_em: prazo } }
    } });
    await semear(pg, A, { 'creat:pedido:v1': PEDIDO_CHEIO(), 'creat:consentimento': CONSENT(true) });
    await semear(pg, N, {});
    reg.reqs.length = 0; reg.terceiros.length = 0; reg.navs.length = 0;
    const q = '?pago=mp&produto=pa-abertura-inauguracao&praca=feira&payment_id=188866285972&resultado=aprovado&payment_type=bank_transfer&preference_id=' + PREF_FEIRA;
    await pg.goto(A + '/obrigado/' + q);
    await pg.waitForURL((x) => x.hostname === HN);
    await estadoObrigado(pg, 'aprovado');
    const chegada = reg.reqs.find((x) => x.nav && x.host === HN);
    assert.equal(new URL(chegada.url).pathname + new URL(chegada.url).search, '/obrigado/' + q, 'a consulta chega igual no novo');
    assert.equal(chegada.referer, A + '/', 'o salto leva no Referer só a origem do antigo');
    assert.equal(await pg.textContent('#pedido-id'), ID, 'o pedido salvo no antigo aparece no novo');
    assert.equal(await pg.textContent('#obrigado-negocio'), 'Studio Bela & Cia');
    const conf = reg.api.find((x) => x.nome === 'confirmarPagamento');
    assert.equal(conf.host, HN);
    assert.deepEqual(conf.corpo, { payment_id: '188866285972', pedido_id: ID, segredo: SEGREDO }, 'o segredo só no corpo da rota que já o recebe');
    // o fragmento de transição sumiu da barra antes de qualquer terceiro (Pixel, espião no fim do <head>)
    assert.doesNotMatch(pg.url(), /m=v1|#/);
    const espiao = await pg.evaluate(() => window.__espiao);
    assert.ok(espiao && espiao.startsWith(N + '/obrigado/'), 'o espião rodou: ' + espiao);
    assert.doesNotMatch(espiao, /m=v1/);
    assert.ok(!espiao.includes(SEGREDO));
    // limite conhecido (DOMINIO.md): a Navigation Timing guarda o endereço de chegada enquanto a página vive.
    // Nenhum terceiro que a vitrine carrega lê essa entrada (fbevents.js, PostHog e os scripts do Base44, conferido em 11/11).
    const navTiming = await pg.evaluate(() => window.__espiaoNav);
    assert.equal(typeof navTiming, 'string');
    t.diagnostic('Navigation Timing do espião ' + (navTiming.includes('m=v1') ? 'AINDA traz o fragmento de transição (limite do navegador, documentado)' : 'sem o fragmento de transição'));
    // o aceite do antigo não atravessa: o canônico pergunta de novo e nada da Meta carrega antes da resposta
    assert.equal(await pg.evaluate(() => document.querySelector('#consentimento').hidden), false, 'o banner aparece no canônico');
    assert.equal(reg.terceiros.filter((x) => /facebook/.test(x.url)).length, 0, 'sem Pixel antes do aceite daqui');
    await pg.click('#consentimento [data-consentir="sim"]');
    await pg.waitForFunction(() => typeof window.fbq === 'function');
    await pausa(500);
    assert.ok(reg.terceiros.some((x) => /connect\.facebook\.net/.test(x.url)), 'o Pixel carregou com o aceite dado no canônico');
    assert.ok(reg.terceiros.some((x) => /terceiro\.exemplo\/px/.test(x.url)));
    semSegredo(reg, 'obrigado');
    // no novo: pedido enxuto, sem dado pessoal; no antigo: nada apagado
    const novo = await lerLS(pg, N);
    assert.match(novo['creat:pedido:v1'], /"enxuto":true/); assert.doesNotMatch(novo['creat:pedido:v1'], PESSOAIS);
    const antigo = await lerLS(pg, A);
    assert.deepEqual(JSON.parse(antigo['creat:pedido:v1']), PEDIDO_CHEIO({ salvo_em: JSON.parse(antigo['creat:pedido:v1']).salvo_em }), 'o antigo continua com o pedido inteiro');
    assert.ok(antigo['creat:consentimento']);
    assert.deepEqual(reg.erros, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test('H1 navegador: os estados de /obrigado/ chegando pelo antigo (aprovado a conferir, recusado, pendente, sem retorno, assinatura, anual, Bastidores)', { skip: pular }, async () => {
  const nav = await chromium.launch();
  try {
    const casos = [
      ['?pago=mp&produto=pa-abertura-inauguracao&collection_status=approved&payment_id=123', 'a_conferir'],
      ['?pago=mp&produto=pa-abertura-inauguracao&collection_status=rejected&payment_id=123', 'recusado'],
      ['?pago=mp&produto=pa-abertura-inauguracao&resultado=pendente', 'pendente'],
      ['', 'sem_retorno'],
      ['?assinatura=ok&plano=aberto', 'assinatura_ok'],
      ['?pago=mp&produto=pa-anual-aberto&collection_status=approved&payment_id=123', 'anual_conferir'],
      ['?pago=mp&produto=pa-bastidores&collection_status=approved&payment_id=123', 'bastidores_conferir'],
      ['?pago=mp&produto=pa-teste&collection_status=approved&payment_id=444555667&preference_id=' + PREF_FEIRA, 'teste_ok', { consultarPedido: { status: 200, json: { ok: true, status: 'teste_ok' } }, confirmarPagamento: { status: 200, json: { ok: true, status: 'teste_ok' } } }]
    ];
    for (const [q, texto, api] of casos) {
      const { ctx, pg, reg } = await abrir(nav, { api });
      if (texto === 'teste_ok') await semear(pg, A, { 'creat:pedido:v1': PEDIDO_CHEIO() });
      reg.reqs.length = 0;
      await pg.goto(A + '/obrigado/' + q);
      await pg.waitForURL((x) => x.hostname === HN);
      await estadoObrigado(pg, texto);
      const chegada = reg.reqs.find((x) => x.nav && x.host === HN);
      assert.equal(new URL(chegada.url).search, q, texto + ': consulta igual');
      assert.doesNotMatch(pg.url(), /payment_id|collection|resultado|assinatura|m=v1/, texto + ': endereço limpo no novo');
      assert.deepEqual(reg.erros, [], texto);
      await ctx.close();
    }
  } finally { await nav.close(); }
});

test('H1 navegador: pedido e consentimento que já existem no novo não são sobrescritos', { skip: pular }, async () => {
  const nav = await chromium.launch();
  try {
    const { ctx, pg, reg } = await abrir(nav);
    const doNovo = PEDIDO_CHEIO({ id: 'PA-AAAAAAAAAA', segredo: 'AAAAAAAAAAAAAAAAAAAAAA', negocio: 'Barbearia do Novo', nicho: 'barbearia' });
    await semear(pg, N, { 'creat:pedido:v1': doNovo, 'creat:consentimento': CONSENT(false) });
    await semear(pg, A, { 'creat:pedido:v1': PEDIDO_CHEIO(), 'creat:consentimento': CONSENT(true) });
    await pg.goto(A + '/obrigado/?pago=mp&produto=pa-abertura-inauguracao&resultado=pendente');
    await pg.waitForURL((x) => x.hostname === HN);
    await estadoObrigado(pg, 'pendente');
    assert.equal(await pg.textContent('#pedido-id'), 'PA-AAAAAAAAAA');
    const ls = await lerLS(pg, N);
    assert.equal(JSON.parse(ls['creat:pedido:v1']).id, 'PA-AAAAAAAAAA');
    assert.equal(JSON.parse(ls['creat:consentimento']).pixel, false);
    assert.equal(reg.terceiros.filter((t) => /facebook/.test(t.url)).length, 0, 'a recusa do novo vale');
    assert.deepEqual(reg.erros, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test('H1 navegador: consentimento recusado no antigo chega recusado no novo (sem banner, sem Pixel)', { skip: pular }, async () => {
  const nav = await chromium.launch();
  try {
    const { ctx, pg, reg } = await abrir(nav);
    await semear(pg, A, { 'creat:consentimento': CONSENT(false) });
    await pg.goto(A + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela&c=Salvador&p=1');
    await pg.waitForURL((x) => x.hostname === HN);
    await pg.waitForFunction(() => document.documentElement.classList.contains('js-pronto'));
    await pausa(800);
    assert.equal(new URL(pg.url()).hash.indexOf('m=v1'), -1);
    assert.equal(await pg.evaluate(() => document.querySelector('#consentimento').hidden), true, 'sem banner: a escolha veio do antigo');
    assert.equal(await pg.evaluate(() => typeof window.fbq), 'undefined');
    assert.equal(reg.terceiros.filter((t) => /facebook|clarity/.test(t.url)).length, 0);
    assert.equal(await pg.textContent('#abrir-negocio-nome'), 'Studio Bela', 'o fragmento original foi devolvido à página');
    const ls = await lerLS(pg, N);
    assert.equal(JSON.parse(ls['creat:consentimento']).pixel, false);
    assert.equal(JSON.parse(ls['creat:consentimento']).em, EM, 'o prazo de 180 dias continua do mesmo dia');
    assert.deepEqual(reg.erros, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test('H1 navegador: fragmento de transição malformado, gigante ou com chave extra é ignorado sem erro e some da barra', { skip: pular }, async () => {
  const nav = await chromium.launch();
  try {
    const agora = Math.floor(Date.now() / 1000);
    const bom = { v: 1, p: { i: ID, s: SEGREDO, pl: 'vitrine', k: 'salao', n: 'Studio Bela & Cia', st: 'enviado', t: agora - 60 } };
    const casos = {
      malformado: 'm=v1.@@@~k=salao&p=2',
      gigante: 'm=v1.' + C.paraB64(JSON.stringify(Object.assign({}, bom, { lixo: 'x'.repeat(5000) }))) + '~k=salao&p=2',
      'chave extra': 'm=v1.' + C.paraB64(JSON.stringify({ v: 1, p: Object.assign({}, bom.p, { whatsapp: '5575900000000' }) })) + '~k=salao&p=2',
      'json quebrado': 'm=v1.' + C.paraB64('{"v":1,"p":') + '~k=salao&p=2',
      'versão nova': 'm=v2.' + C.paraB64(JSON.stringify(bom)) + '~k=salao&p=2'
    };
    for (const [nome, frag] of Object.entries(casos)) {
      const { ctx, pg, reg } = await abrir(nav);
      await pg.goto(N + '/termos/#' + frag);
      await pg.waitForFunction(() => document.documentElement.classList.contains('js-pronto'));
      assert.equal(pg.url(), N + '/termos/#k=salao&p=2', nome + ': a barra fica só com o fragmento original');
      const ls = await lerLS(pg, N);
      assert.equal(ls['creat:pedido:v1'], undefined, nome + ': nada gravado');
      assert.deepEqual(reg.erros, [], nome);
      semSegredo(reg, nome);
      await ctx.close();
    }
  } finally { await nav.close(); }
});

test('H1 navegador: no novo, em localhost, em file://, em outro host e em moldura nada redireciona; configuração errada não cria laço', { skip: pular }, async () => {
  const nav = await chromium.launch();
  try {
    const { ctx, pg, reg } = await abrir(nav);
    for (const p of ['/', '/abrir/', '/obrigado/?resultado=pendente', '/termos/', '/privacidade/', '/bastidores/', '/previa/#k=salao&n=Studio&p=1', '/nao-existe/']) {
      reg.navs.length = 0;
      await pg.goto(N + p);
      await pausa(400);
      assert.equal(new URL(pg.url()).origin, N, p);
      assert.equal(reg.navs.length, 1, 'novo sem troca: ' + p + ' ' + reg.navs.join(' > '));
    }
    reg.navs.length = 0;
    await pg.goto(O + '/termos/'); await pausa(400);
    assert.equal(new URL(pg.url()).origin, O, 'outro host fica'); assert.equal(reg.navs.length, 1);
    // moldura: a prévia no quadro da home, mesmo no antigo, nunca troca sozinha
    await semear(pg, A, {});
    const quadro = await pg.evaluate((u) => new Promise((ok) => { const f = document.createElement('iframe'); f.src = u; f.onload = () => { try { ok(f.contentWindow.location.href); } catch (e) { ok('cruzou'); } }; document.body.appendChild(f); }), A + '/previa/#k=salao&p=1');
    assert.equal(quadro, A + '/previa/#k=salao&p=1', 'a moldura não trocou');
    assert.deepEqual(reg.erros, []);
    await ctx.close();
    // configuração errada: canônico também na lista de antigos, e outro host como antigo; o canônico nunca sai de si
    const b = await abrir(nav, { config: [HN, HO, HA] });
    b.reg.navs.length = 0;
    await b.pg.goto(N + '/termos/'); await pausa(500);
    assert.equal(b.pg.url(), N + '/termos/'); assert.equal(b.reg.navs.length, 1);
    b.reg.navs.length = 0;
    await b.pg.goto(O + '/termos/'); await b.pg.waitForURL((x) => x.hostname === HN); await pausa(500);
    assert.deepEqual(b.reg.navs.map((x) => new URL(x).hostname), [HO, HN]);
    await b.ctx.close();
    // localhost (http) e file://
    const srv = http.createServer((q, r) => { const f = arquivo(new URL(q.url, 'http://x').pathname); if (!f) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
    await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
    const local = await nav.newPage();
    const navsL = []; local.on('framenavigated', (f) => { if (f === local.mainFrame()) navsL.push(f.url()); });
    const base = 'http://127.0.0.1:' + srv.address().port;
    await local.goto(base + '/termos/'); await pausa(500);
    await local.goto('http://localhost:' + srv.address().port + '/termos/'); await pausa(500);
    await local.goto(pathToFileURL(path.join(RAIZ, 'termos', 'index.html')).href); await pausa(500);
    assert.deepEqual(navsL.map((x) => new URL(x).protocol + new URL(x).hostname), ['http:127.0.0.1', 'http:localhost', 'file:']);
    await local.close(); srv.close();
  } finally { await nav.close(); }
});

test('H1 navegador: com a CSP de _headers, a troca e as páginas rodam sem violação e sem erro', { skip: pular }, async () => {
  const nav = await chromium.launch();
  try {
    const { ctx, pg, reg } = await abrir(nav, { csp: true });
    await semear(pg, A, { 'creat:pedido:v1': PEDIDO_CHEIO(), 'creat:consentimento': CONSENT(true) });
    for (const p of ['/', '/abrir/#plano=vitrine&k=salao&n=Studio&c=Salvador&p=1', '/obrigado/?resultado=pendente&pago=mp&produto=pa-abertura-inauguracao', '/termos/', '/privacidade/', '/bastidores/', '/previa/#k=salao&n=Studio&p=1', '/nao-existe/']) {
      await pg.goto(A + p);
      await pg.waitForURL((x) => x.hostname === HN);
      await pausa(600);
      assert.doesNotMatch(pg.url(), /m=v1/, p);
    }
    assert.deepEqual(reg.console.filter((m) => /Content Security Policy|Refused/i.test(m)), [], 'sem violação de CSP');
    assert.deepEqual(reg.erros, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test('H1 navegador: link da prévia copiado e link da prévia gravado no pedido nascem no canônico', { skip: pular }, async () => {
  const nav = await chromium.launch();
  try {
    const { ctx, pg, reg } = await abrir(nav);
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: N });
    await semear(pg, N, { 'creat:consentimento': CONSENT(false) });
    await pg.goto(N + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela&c=Salvador&p=2');
    await pg.click('#abrir-voltar');
    await pg.waitForFunction(() => { const e = document.querySelector('#previa'); return !!e && !e.hidden; });
    await pg.click('#previa-copiar');
    await pg.waitForFunction(() => navigator.clipboard.readText().then((t) => !!t));
    assert.match(await pg.evaluate(() => navigator.clipboard.readText()), /^https:\/\/nuvem\.creatmtt\.com\.br\/previa\/#k=salao&n=Studio%20Bela&c=Salvador&p=[123]$/);
    await pg.goto(N + '/abrir/#plano=vitrine&k=salao&n=Studio%20Bela&c=Salvador&p=2');
    await pg.waitForFunction(() => document.querySelector('.pagar [data-checkout]').getAttribute('data-link-ok') === '1');
    await pg.fill('#p-responsavel', 'Maria Souza'); await pg.fill('#p-whatsapp', '75900000000');
    await pg.fill('#p-endereco', 'Rua das Flores, 120, Centro, Feira de Santana-BA, 44001-000'); await pg.fill('#p-email', 'maria@example.com');
    await pg.check('#p-aceite');
    await Promise.all([pg.waitForURL(/mercadopago/), pg.click('.pagar [data-checkout]')]);
    const ls = await lerLS(pg, N);
    assert.match(JSON.parse(ls['creat:pedido:v1']).previa, /^https:\/\/nuvem\.creatmtt\.com\.br\/previa\/#k=salao&n=Studio%20Bela&c=Salvador&p=2$/);
    assert.deepEqual(reg.erros, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test('H1 navegador: sem JavaScript o antigo continua de pé; a vitrine espera a troca e só começa com o aviso de que ficou', { skip: pular }, async () => {
  const nav = await chromium.launch();
  try {
    const a = await abrir(nav, { contexto: { javaScriptEnabled: false } });
    for (const p of ['/', '/termos/', '/obrigado/?resultado=pendente']) {
      await a.pg.goto(A + p);
      await pausa(300);
      assert.equal(a.pg.url(), A + p, 'sem JavaScript fica no antigo: ' + p);
      const vis = await a.pg.locator('body').isVisible();
      assert.equal(vis, true, p);
      assert.ok((await a.pg.innerText('body')).length > 200, 'conteúdo na tela: ' + p);
    }
    await a.ctx.close();
    // a vitrine espera a troca: com CreatCanonico.mudando, nada inicia (banner, medição, contador) até o aviso de que ficou
    const b = await abrir(nav);
    await b.pg.addInitScript(() => {
      let c; Object.defineProperty(window, 'CreatCanonico', { configurable: true, get: () => c, set: (v) => { c = v; c.mudando = true; } });
    });
    await b.pg.goto(O + '/abrir/#plano=vitrine&k=salao&n=Studio&c=Salvador&p=1');
    await pausa(800);
    assert.equal(await b.pg.evaluate(() => document.documentElement.classList.contains('js-pronto')), false, 'parada durante a troca');
    assert.equal(b.reg.api.length, 0, 'nada contado durante a troca');
    await b.pg.evaluate(() => { window.CreatCanonico.mudando = false; window.dispatchEvent(new Event('creat:canonico-ficou')); });
    await b.pg.waitForFunction(() => document.documentElement.classList.contains('js-pronto'), null, { timeout: 5000 });
    assert.deepEqual(b.reg.erros, []);
    await b.ctx.close()
  } finally { await nav.close(); }
});

/* ======================================================================== 3. achados da conferência (rodada 2) */

test('H1 navegador: canônico lento de verdade (6 s): até os 3 s o antigo está inteiro na tela e vivo, sem tela branca, e não troca mais nesta aba', { skip: pular }, async () => {
  const nav = await chromium.launch();
  try {
    const { ctx, pg, reg } = await abrir(nav, { atrasoNovo: 6000 });
    await semear(pg, A, { 'creat:pedido:v1': PEDIDO_CHEIO() });
    reg.navs.length = 0;
    const t0 = Date.now();
    await pg.goto(A + '/obrigado/?pago=mp&produto=pa-abertura-inauguracao&resultado=pendente', { waitUntil: 'commit' });
    // a página nasce escondida (a troca está a caminho) e volta inteira com a recarga dos 2,5 s
    await pg.waitForFunction((h) => location.hostname === h && !!document.body && document.body.innerText.length > 200 &&
      getComputedStyle(document.documentElement).visibility === 'visible' && document.documentElement.classList.contains('js-pronto'), HA, { timeout: 6000, polling: 50 });
    const ms = Date.now() - t0;
    assert.ok(ms <= 3000, 'o antigo inteiro na tela em ' + ms + ' ms (limite 3 s)');
    const quadro = await pg.evaluate(() => ({ corpo: document.body.children.length, marca: sessionStorage.getItem('creat:canonico-ficou') }));
    assert.ok(quadro.corpo > 2, 'corpo com conteúdo'); assert.equal(quadro.marca, '1', 'a aba ficou marcada');
    await estadoObrigado(pg, 'pendente');
    assert.equal(await pg.textContent('#pedido-id'), ID, 'o pedido do antigo continua valendo no antigo');
    // passa o momento em que o canônico responderia: a navegação foi cancelada, a aba fica no antigo
    await pausa(Math.max(0, 7000 - (Date.now() - t0)));
    assert.equal(new URL(pg.url()).hostname, HA, 'fica no antigo');
    assert.deepEqual(reg.navs.map((x) => new URL(x).hostname), [HA, HN, HA], 'antigo, a troca cancelada e a recarga do antigo');
    // nesta aba o antigo não tenta de novo (sem laço de recarga)
    reg.navs.length = 0;
    await pg.goto(A + '/termos/'); await pausa(3200);
    assert.equal(new URL(pg.url()).hostname, HA); assert.deepEqual(reg.navs.map((x) => new URL(x).hostname), [HA]);
    assert.deepEqual(reg.erros, []);
    await ctx.close();
  } finally { await nav.close(); }
});

test('H1 navegador: fragmento forjado (link colado, vindo de outro site ou passando pelo antigo) não planta pedido nem aceite; a recusa do antigo vence o aceite mais velho do canônico', { skip: pular }, async () => {
  const nav = await chromium.launch();
  try {
    const agora = Math.floor(Date.now() / 1000);
    const ataque = { v: 1, p: { i: 'PA-ATAQUE0001', s: 'Z'.repeat(21) + 'A', pl: 'vitrine', k: 'barbearia', n: 'Pague Aqui 75900000000', st: 'registrado', t: agora - 60 } };
    assert.ok(C.lerTransicao('m=v1.' + C.paraB64(JSON.stringify(ataque))).pacote, 'o pacote forjado tem formato válido: só a prova do salto o barra');
    const frag = (o) => 'm=v1.' + C.paraB64(JSON.stringify(o));
    const q = '?pago=mp&produto=pa-abertura-inauguracao&praca=feira&payment_id=188866285972&resultado=aprovado';
    // (a) link colado no canônico, sem Referer
    {
      const { ctx, pg, reg } = await abrir(nav);
      await semear(pg, N, {});
      await pg.goto(N + '/obrigado/' + q + '#' + frag(ataque), { referer: '' });
      await estadoObrigado(pg, 'a_conferir');
      assert.doesNotMatch(pg.url(), /m=v1/);
      const ls = await lerLS(pg, N);
      assert.equal(ls['creat:pedido:v1'], undefined, 'nada plantado');
      const conf = reg.api.find((x) => x.nome === 'confirmarPagamento');
      assert.deepEqual(conf && conf.corpo, { payment_id: '188866285972' }, 'confirmação só com o pagamento, sem id nem segredo de ninguém');
      assert.equal(reg.api.some((x) => x.nome === 'consultarPedido'), false);
      assert.deepEqual(reg.erros, []);
      await ctx.close();
    }
    // (b) vindo de outro site (Referer do atacante), com pedido e com aceite forjados
    for (const [rotulo, pacote] of [['pedido', ataque], ['aceite', { v: 1, c: { x: true, t: agora } }]]) {
      const { ctx, pg, reg } = await abrir(nav);
      await semear(pg, N, {});
      await pg.goto(O + '/__semente');
      reg.reqs.length = 0;
      await Promise.all([pg.waitForURL((x) => x.hostname === HN), pg.evaluate((u) => { location.href = u; }, N + '/abrir/#' + frag(pacote) + '~plano=vitrine&k=salao&n=Studio&c=Salvador&p=1')]);
      await pg.waitForFunction(() => document.documentElement.classList.contains('js-pronto'));
      await pausa(600);
      const chegada = reg.reqs.find((x) => x.nav && x.host === HN);
      assert.equal(chegada.referer, O + '/', rotulo + ': Referer do outro site');
      // só o fragmento original fica (a vitrine ainda tira dele o nome e a cidade)
      assert.equal(new URL(pg.url()).hash, '#plano=vitrine&k=salao&p=1', rotulo + ': só o fragmento original fica');
      assert.equal(await pg.evaluate(() => document.querySelector('#consentimento').hidden), false, rotulo + ': o banner pergunta');
      assert.equal(reg.terceiros.filter((x) => /facebook/.test(x.url)).length, 0, rotulo + ': sem Pixel');
      const ls = await lerLS(pg, N);
      assert.equal(ls['creat:pedido:v1'], undefined, rotulo + ': sem pedido');
      assert.equal(ls['creat:consentimento'], undefined, rotulo + ': sem consentimento');
      assert.deepEqual(reg.erros, [], rotulo);
      await ctx.close();
    }
    // (c) passando pelo antigo: o antigo descarta o pacote que chegou e só leva o dele (aqui, nada)
    {
      const { ctx, pg, reg } = await abrir(nav);
      await semear(pg, A, {}); await semear(pg, N, {});
      await pg.goto(A + '/termos/#' + frag(ataque) + '~preferencias');
      await pg.waitForURL((x) => x.hostname === HN);
      await pg.waitForFunction(() => document.documentElement.classList.contains('js-pronto'));
      assert.equal(pg.url(), N + '/termos/#preferencias');
      assert.equal((await lerLS(pg, N))['creat:pedido:v1'], undefined, 'nada plantado pelo antigo');
      assert.deepEqual(reg.erros, []);
      await ctx.close();
    }
    // (d) aceitou no canônico há 3 dias, recusou no antigo há 1 h: vale a recusa, e o Pixel não carrega
    {
      const { ctx, pg, reg } = await abrir(nav);
      await semear(pg, N, { 'creat:consentimento': CONSENT(true, new Date(Date.now() - 72 * H).toISOString()) });
      const recusa = new Date(Math.floor((Date.now() - H) / 1000) * 1000).toISOString();
      await semear(pg, A, { 'creat:consentimento': CONSENT(false, recusa) });
      reg.terceiros.length = 0;
      await pg.goto(A + '/');
      await pg.waitForURL((x) => x.hostname === HN);
      await pg.waitForFunction(() => document.documentElement.classList.contains('js-pronto'));
      await pausa(800);
      assert.equal(await pg.evaluate(() => typeof window.fbq), 'undefined');
      assert.equal(reg.terceiros.filter((x) => /facebook|clarity/.test(x.url)).length, 0, 'recusar nunca vira aceitar');
      const c = JSON.parse((await lerLS(pg, N))['creat:consentimento']);
      assert.equal(c.pixel, false); assert.equal(c.em, recusa);
      assert.deepEqual(reg.erros, []);
      await ctx.close();
    }
  } finally { await nav.close(); }
});

test('H1 navegador: pedido do antigo que nunca chegou ao servidor: no canônico a tela manda ao suporte com o número do pagamento e do pedido', { skip: pular }, async () => {
  const nav = await chromium.launch();
  try {
    const { ctx, pg, reg } = await abrir(nav, { api: {
      confirmarPagamento: { status: 200, json: { ok: true, status: 'pago' } },
      consultarPedido: { status: 404, json: { ok: false, erro: 'nao_encontrado' } }
    } });
    await semear(pg, A, { 'creat:pedido:v1': PEDIDO_CHEIO() });
    await semear(pg, N, {});
    await pg.goto(A + '/obrigado/?pago=mp&produto=pa-abertura-inauguracao&praca=feira&payment_id=188866285972&resultado=aprovado');
    await pg.waitForURL((x) => x.hostname === HN);
    await pg.waitForFunction(() => document.querySelector('#obrigado-servidor').getAttribute('data-linha') === 'nao_encontrado', null, { timeout: 15000 });
    const linha = await pg.textContent('#obrigado-servidor');
    assert.match(linha, /suporte/i); assert.match(linha, /188866285972/, 'a linha leva o número do pagamento');
    assert.equal(await pg.isVisible('#obrigado-servidor'), true);
    // o pedido enxuto não registra de novo (sem dado pessoal no canônico): a saída é o suporte, com os dois números
    assert.equal(reg.api.filter((x) => x.nome === 'registrarPedido').length, 0);
    const zap = await pg.evaluate(() => [...document.querySelectorAll('a[href*="wa.me"]')].filter((a) => a.offsetParent && !a.hidden).map((a) => decodeURIComponent(a.href)));
    assert.ok(zap.some((h) => h.includes(ID) && h.includes('188866285972')), 'botão visível do WhatsApp com o pedido e o pagamento: ' + zap.map((h) => h.slice(0, 40)).join(' | '));
    assert.deepEqual(reg.erros, []);
    await ctx.close();
  } finally { await nav.close(); }
});
