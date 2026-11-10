/*
 * scripts/testes/agendamento.test.mjs · "Pedir horário" do motor v1 e cabeça do build (onda 3, pacote 3B · Pixel)
 *
 * Confere, sem rede:
 *  - a mensagem da demonstração começa com "Testei a demonstração de <nicho> da Creat (<nome>). Simulação: "
 *    e termina com " Quero saber como ter um site assim."; site de cliente nunca leva esse texto nem o
 *    número da Creat; a prévia leva só "Teste da prévia do site: ";
 *  - dia da semana na mensagem ("quarta, 11/11"), "hoje" e "amanhã" só na tela;
 *  - preço sem valor com a classe "preco is-consulta";
 *  - horários agrupados por turno, só o de mais vagas aberto, os outros em "Ver tarde (12)";
 *  - relógio do negócio: com o aparelho em America/Manaus, os horários livres seguem America/Bahia;
 *  - build: ícone próprio, og:*, theme-color claro e escuro, fecho lido de precos.json (trocar o valor
 *    muda o texto), galeria só com o que o tenant cita, publicar-site aceita a galeria.
 * A parte com navegador roda no Chromium do Playwright (pulada sem ele), servindo os arquivos por rota.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const PROD = path.join(RAIZ, 'scripts', 'producao');
const TMP = fs.mkdtempSync(path.join(process.env.CREAT_TESTE_TMP || os.tmpdir(), 'creat-agenda-'));
const AG = require(path.join(RAIZ, 'motor', 'v1', 'agendamento.js'));
const B = require(path.join(PROD, 'build-site.cjs'));
const PUB = require(path.join(PROD, 'publicar-site.cjs'));
const WHATS_CREAT = '5575981151202';
const WHATS_CLIENTE = '5571988887777';                 // fictício: nenhuma mensagem sai do teste
const HOME = 'https://creat-nuvem-404b1994.base44.app/';
let temPlaywright = true;
try { require.resolve('playwright', { paths: [RAIZ] }); } catch (e) { temPlaywright = false; }
const SEM_PW = temPlaywright ? false : 'Playwright não instalado (npm install)';

test.after(() => { if (!process.env.CREAT_TESTE_MANTER) fs.rmSync(TMP, { recursive: true, force: true }); });

const PRECOS = {
  prazoHoras: 72,
  abertura: { padrao: 497, inauguracao: { ativa: true, preco: 297, vagasTotal: 20, vagasRestantes: 20 } },
  planos: { aberto: 147, vitrine: 297 }, anualMesesPagos: 10, bastidores: 67,
  atualizado_em: new Date().toISOString()
};

/* tenant de teste: o da demo de barbearia, com funcionamento e serviços fixos (um sem preço) e sem galeria */
function tenantTeste(extra) {
  const t = JSON.parse(fs.readFileSync(path.join(RAIZ, 'sites', 'demo-barbearia', 'tenant.json'), 'utf8'));
  delete t.galeria;
  t.funcionamento = { passoMin: 30, antecedenciaMin: 30, diasNaFita: 7, semana: { 0: null, 1: { abre: '08:00', fecha: '20:00' }, 2: { abre: '08:00', fecha: '20:00' }, 3: { abre: '08:00', fecha: '20:00' }, 4: { abre: '08:00', fecha: '20:00' }, 5: { abre: '08:00', fecha: '20:00' }, 6: { abre: '08:00', fecha: '17:00' } } };
  t.servicos = [
    { id: 'corte', nome: 'Corte', duracaoMin: 30, preco: 40, descricao: 'Corte na tesoura e na máquina.' },
    { id: 'barba', nome: 'Barba', duracaoMin: 30, preco: null, descricao: 'Barba na toalha quente.' }
  ];
  return Object.assign(t, extra || {});
}
function construir(nome, tenant, site, opc) {
  const destino = path.join(TMP, 'dist', nome);
  const pastaTenant = path.join(TMP, 'sites', nome);
  fs.mkdirSync(pastaTenant, { recursive: true });
  return B.buildSite(Object.assign({ tenant, destino, saida: TMP, pastaTenant, precos: PRECOS, site }, opc || {}));
}

/* ======================= funções puras ======================= */
test('demonstração: prefixo e sufixo nos 3 nichos; prévia só com o prefixo de teste; cliente sem nada', () => {
  const base = 'Olá! Meu nome é TESTE Pixel. Quero pedir um horário: Corte, quarta, 11/11 às 14h.';
  const casos = [['barbearia', 'Barbearia Navalha Fictícia', 'barbearia'], ['salao', 'Esmalte & Fio', 'salão'], ['academia', 'Studio Barra Fictícia', 'academia']];
  for (const [nicho, nome, palavra] of casos) {
    const m = AG.mensagemFinal(base, { demonstracao: true, nicho, nome });
    assert.equal(m, `Testei a demonstração de ${palavra} da Creat (${nome}). Simulação: ${base} Quero saber como ter um site assim.`);
    assert.ok(m.startsWith('Testei a demonstração de ') && m.endsWith('Quero saber como ter um site assim.'));
    assert.match(AG.mensagemFlutuante({ nicho, nome }), new RegExp(`^Vi a demonstração de ${palavra} da Creat \\(`));
  }
  for (const o of [{}, { demonstracao: false }, { demonstracao: 'true' }, { demonstracao: 1 }, { nicho: 'salao', nome: 'X' }]) {
    const m = AG.mensagemFinal(base, o);
    assert.equal(m, base, `sem demonstracao:true a mensagem não muda (${JSON.stringify(o)})`);
    assert.doesNotMatch(m, /Testei a demonstração|Quero saber como ter um site assim/);
  }
  const p = AG.mensagemFinal(base, { previa: true, demonstracao: true, nicho: 'salao', nome: 'X' });
  assert.equal(p, 'Teste da prévia do site: ' + base, 'a prévia nunca leva o prefixo da demo');
  assert.equal(AG.nomeDoNicho('pet', 'Pet shop'), 'pet shop');
});

test('dia da semana na mensagem; a tela continua com hoje e amanhã', () => {
  assert.equal(AG.diaDaMensagem(new Date(2026, 10, 11)), 'quarta, 11/11');
  assert.equal(AG.diaDaMensagem(new Date(2026, 10, 15)), 'domingo, 15/11');
  assert.equal(AG.diaDaMensagem(new Date(2027, 0, 2)), 'sábado, 02/01');
  const fonte = fs.readFileSync(path.join(RAIZ, 'motor', 'v1', 'agendamento.js'), 'utf8');
  assert.match(fonte, /dia: diaDaMensagem\(P\.dataDaChave\(est\.dia\)\)/, 'a mensagem usa diaDaMensagem');
  assert.match(fonte, /maiuscula\(P\.diaLongo\(P\.dataDaChave\(est\.dia\), agora\(\)\)\)/, 'o resumo da tela continua com hoje/amanhã');
});

test('preço sem valor: classe "preco is-consulta"', () => {
  assert.equal(AG.classePreco(null), 'preco is-consulta');
  assert.equal(AG.classePreco(undefined), 'preco is-consulta');
  assert.equal(AG.classePreco(0), 'preco');
  assert.equal(AG.classePreco(35), 'preco');
});

test('turnos: Manhã, Tarde e Noite; abre o de mais vagas, ou o do horário escolhido', () => {
  const hs = [480, 510, 540, 690, 720, 750, 780, 810, 840, 870, 1080, 1110];   // 4 de manhã, 6 de tarde, 2 de noite
  const g = AG.agruparTurnos(hs);
  assert.deepEqual(g.map((x) => [x.id, x.rotulo, x.horarios.length]), [['manha', 'Manhã', 4], ['tarde', 'Tarde', 6], ['noite', 'Noite', 2]]);
  assert.equal(AG.turnoAberto(g, null), 'tarde');
  assert.equal(AG.turnoAberto(g, 1110), 'noite', 'o turno do horário escolhido fica aberto');
  assert.equal(AG.turnoAberto(AG.agruparTurnos([480, 780]), null), 'manha', 'empate: o mais cedo');
  assert.deepEqual(AG.agruparTurnos([]), []);
  assert.equal(AG.turnoAberto([], null), null);
  assert.equal(AG.turnoDe(719).id, 'manha'); assert.equal(AG.turnoDe(720).id, 'tarde'); assert.equal(AG.turnoDe(1079).id, 'tarde'); assert.equal(AG.turnoDe(1080).id, 'noite');
});

test('relógio do negócio: aceita Date e {ano, mes, dia, hora, minuto, diaSemana}', () => {
  const d = new Date(2026, 10, 11, 8, 31);
  assert.equal(AG.dataDoRelogio(d), d);
  const o = AG.dataDoRelogio({ ano: 2026, mes: 11, dia: 11, hora: 8, minuto: 31, diaSemana: 3 });
  assert.deepEqual([o.getFullYear(), o.getMonth(), o.getDate(), o.getHours(), o.getMinutes(), o.getDay()], [2026, 10, 11, 8, 31, 3]);
  const z = AG.dataDoRelogio({ ano: 2026, mes: 10, dia: 11, hora: 8, minuto: 31, diaSemana: 3 });   // mês contado de 0
  assert.equal(z.getMonth(), 10);
  assert.equal(AG.dataDoRelogio(null), null);
  assert.equal(AG.dataDoRelogio(new Date('x')), null);
  assert.equal(AG.dataDoRelogio({ ano: 'a' }), null);
});

/* ======================= build ======================= */
test('build: fecho de venda lido de precos.json; trocar o valor no JSON muda o texto; nunca preço à mão', () => {
  const agora = Date.parse('2026-11-10T12:00:00Z');
  const p = JSON.parse(JSON.stringify(PRECOS)); p.atualizado_em = '2026-11-09T23:45:26Z';
  const f = B.fechoDemo(p, agora);
  assert.match(f.linha, /^R\$ 297 de abertura \(preço de inauguração\) e R\$ 147 por mês no plano Aberto/);
  assert.match(f.titulo, /em até 72 h/);
  p.abertura.inauguracao.preco = 197; p.planos.aberto = 129;
  assert.match(B.fechoDemo(p, agora).linha, /^R\$ 197 de abertura \(preço de inauguração\) e R\$ 129 por mês/);
  assert.match(B.fechoDemo(p, Date.parse('2026-11-20T12:00:00Z')).linha, /^R\$ 497 de abertura e R\$ 129/, 'carimbo de mais de 7 dias: preço padrão (ADR-005)');
  p.abertura.inauguracao.vagasRestantes = 0;
  assert.match(B.fechoDemo(p, agora).linha, /^R\$ 497 de abertura e/);
  p.abertura.padrao = 1497;
  assert.match(B.fechoDemo(p, agora).linha, /^R\$ 1\.497 de abertura/);
  assert.equal(B.fechoDemo(null), null);
  assert.equal(B.fechoDemo({ abertura: {} }), null);

  const pr = JSON.parse(JSON.stringify(PRECOS)); pr.abertura.inauguracao.preco = 233;
  const arq = path.join(TMP, 'precos-teste.json'); fs.writeFileSync(arq, JSON.stringify(pr));
  const r = construir('fecho-demo', tenantTeste(), { home: HOME, url: `${HOME}sites/fecho-demo/`, rodape: true, demonstracao: true }, { precos: undefined, arqPrecos: arq });
  const js = fs.readFileSync(path.join(r.destino, 'tenant.js'), 'utf8');
  assert.match(js, /"fecho":\{"titulo":"Este site, com o nome do seu negócio, pronto para você aprovar em até 72 h\.","linha":"R\$ 233 de abertura/);
  const semPreco = construir('fecho-sem', tenantTeste(), { home: HOME, demonstracao: true }, { precos: null });
  assert.doesNotMatch(fs.readFileSync(path.join(semPreco.destino, 'tenant.js'), 'utf8'), /"fecho"/);
  assert.ok(semPreco.avisos.some((a) => /sem o fecho de venda/.test(a)));
  const cli = construir('fecho-cliente', tenantTeste({ negocio: Object.assign(tenantTeste().negocio, { whatsapp: WHATS_CLIENTE }) }), { home: HOME, rodape: true });
  assert.doesNotMatch(fs.readFileSync(path.join(cli.destino, 'tenant.js'), 'utf8'), /"fecho"|"demonstracao"/, 'site de cliente não leva fecho');
});

test('build: ícone próprio, og:*, twitter:card, theme-color claro e escuro; og:image só da demo com arquivo', () => {
  const r = construir('cabeca-demo', tenantTeste(), { home: HOME, url: `${HOME}sites/cabeca-demo/`, rodape: true, demonstracao: true });
  const h = fs.readFileSync(path.join(r.destino, 'index.html'), 'utf8');
  const icones = h.match(/<link rel="icon"[^>]*>/g) || [];
  assert.equal(icones.length, 1);
  assert.match(icones[0], /href="data:image\/svg\+xml,%3Csvg[^"]+" type="image\/svg\+xml"/);
  assert.ok(decodeURIComponent(icones[0].match(/href="data:image\/svg\+xml,([^"]+)"/)[1]).includes('>N</text>'), 'inicial do negócio (pula "Barbearia")');
  assert.doesNotMatch(h, /base44\.com|favicon/i);
  for (const re of [/<meta property="og:type" content="website">/, /<meta property="og:locale" content="pt_BR">/, /<meta property="og:site_name" content="Barbearia Navalha Fictícia">/,
    /<meta property="og:title" content="[^"]+">/, /<meta property="og:description" content="[^"]+">/, /<meta property="og:url" content="https:\/\/creat-nuvem-404b1994\.base44\.app\/sites\/cabeca-demo\/">/,
    /<meta name="theme-color" content="#[0-9A-F]{6}" media="\(prefers-color-scheme: light\)" data-barra>/, /<meta name="theme-color" content="#[0-9A-F]{6}" media="\(prefers-color-scheme: dark\)" data-barra>/]) assert.match(h, re);
  const temOg = fs.existsSync(path.join(RAIZ, 'assets', 'img', 'og-demo-barbearia.jpg'));
  if (temOg) {
    assert.match(h, /<meta property="og:image" content="https:\/\/creat-nuvem-404b1994\.base44\.app\/assets\/img\/og-demo-barbearia\.jpg">/);
    assert.match(h, /<meta property="og:image:alt" content="Foto de exemplo/);
    assert.match(h, /<meta name="twitter:card" content="summary_large_image">/);
  } else {
    assert.doesNotMatch(h, /og:image/); assert.match(h, /<meta name="twitter:card" content="summary">/);
  }
  assert.doesNotMatch(h, /\{\{|<!--\{\{/, 'nenhum marcador sobrando');
  const barra = B.coresDaBarra({ claro: { fundo: '#F7F4EF', texto: '#14213D' }, escuro: { fundo: '#0F1729', superficie: '#18223A', texto: '#F2EEE8' } }, true);
  assert.equal(barra.claro, '#14213D', 'demo clara: a faixa é var(--tinta)');
  assert.match(barra.escuro, /^#[0-9A-F]{6}$/);
  assert.deepEqual(B.coresDaBarra({ claro: { fundo: '#F7F4EF', texto: '#14213D' }, escuro: { fundo: '#0F1729', superficie: '#18223A', texto: '#F2EEE8' } }, false), { claro: '#F7F4EF', escuro: '#0F1729' });
  assert.equal(B.misturar('#000000', '#FFFFFF', 1), '#000000'); assert.equal(B.misturar('#000000', '#FFFFFF', 0), '#FFFFFF');
  // site de cliente: sem og:image, sem og:url sem URL, ícone próprio
  const c = construir('cabeca-cliente', tenantTeste({ negocio: Object.assign(tenantTeste().negocio, { whatsapp: WHATS_CLIENTE }) }), { home: '', url: false, rodape: false });
  const hc = fs.readFileSync(path.join(c.destino, 'index.html'), 'utf8');
  assert.doesNotMatch(hc, /og:image|og:url/);
  assert.equal((hc.match(/<link rel="icon"/g) || []).length, 1);
  assert.match(hc, /<noscript><p>/, 'o <noscript> que conferir-sites-no-ar lê continua');
});

test('build e publicar: galeria só com o que o tenant cita; tenant sem galeria não leva pasta', () => {
  const pt = path.join(TMP, 'gal', 'sites', 'demo-gal');
  fs.mkdirSync(path.join(pt, 'galeria'), { recursive: true });
  fs.writeFileSync(path.join(pt, 'galeria', 'barbearia-1.webp'), 'RIFF....WEBP');
  fs.writeFileSync(path.join(pt, 'galeria', 'sobra.webp'), 'RIFF....WEBP');
  const d = path.join(TMP, 'gal', 'dist');
  fs.mkdirSync(d, { recursive: true });
  const t = { slug: 'demo-gal', galeria: [{ src: 'galeria/barbearia-1.webp', alt: 'Foto de exemplo: cadeira' }] };
  assert.deepEqual(B.copiarGaleria(t, pt, d), ['galeria/barbearia-1.webp']);
  assert.ok(fs.existsSync(path.join(d, 'galeria', 'barbearia-1.webp')));
  assert.ok(!fs.existsSync(path.join(d, 'galeria', 'sobra.webp')), 'o que o tenant não cita não vai');
  assert.throws(() => B.copiarGaleria({ slug: 'x', galeria: [{ src: '../tenant.json' }] }, pt, d), /galeria\[0\]\.src/);
  assert.throws(() => B.copiarGaleria({ slug: 'x', galeria: [{ src: 'galeria/nao-existe.webp' }] }, pt, d), /não encontrado/);
  assert.throws(() => B.copiarGaleria({ slug: 'x', galeria: [{ src: 'galeria/x.html' }] }, pt, d), /galeria\[0\]\.src/);
  const d2 = path.join(TMP, 'gal', 'dist2'); fs.mkdirSync(d2, { recursive: true });
  assert.deepEqual(B.copiarGaleria({ slug: 'x' }, pt, d2), []);
  assert.ok(!fs.existsSync(path.join(d2, 'galeria')));
  for (const ok of ['galeria/a.webp', 'galeria/a.avif', 'galeria/a.jpg', 'galeria/a.jpeg', 'galeria/a.png', 'galeria/a.svg']) assert.ok(PUB.LISTA_BRANCA.some((re) => re.test(ok)), ok);
  for (const ruim of ['galeria/a.html', 'galeria/../a.webp', 'galeria/sub/a.webp', 'galeria/.a.webp']) assert.ok(!PUB.LISTA_BRANCA.some((re) => re.test(ruim)), ruim);
  // publicar-site: galeria só com o que o tenant cita, e tudo o que ele cita
  const dp = path.join(TMP, 'gal', 'pub', 'demo-gal');
  fs.mkdirSync(path.join(dp, 'motor', 'v1'), { recursive: true }); fs.mkdirSync(path.join(dp, 'galeria'), { recursive: true });
  fs.writeFileSync(path.join(dp, 'index.html'), '<!doctype html>'); fs.writeFileSync(path.join(dp, 'tenant.js'), '');
  fs.writeFileSync(path.join(dp, 'motor', 'v1', 'motor.js'), '');
  fs.writeFileSync(path.join(dp, 'tenant.json'), JSON.stringify({ slug: 'demo-gal', meta: { previa: false }, galeria: t.galeria }));
  fs.writeFileSync(path.join(dp, 'galeria', 'barbearia-1.webp'), 'x');
  assert.ok(PUB.conferir(dp, 'demo-gal', {}).arquivos.includes('galeria/barbearia-1.webp'));
  fs.writeFileSync(path.join(dp, 'galeria', 'sobra.webp'), 'x');
  assert.throws(() => PUB.conferir(dp, 'demo-gal', {}), /galeria fora das regras/);
  fs.rmSync(path.join(dp, 'galeria', 'sobra.webp')); fs.rmSync(path.join(dp, 'galeria', 'barbearia-1.webp'));
  assert.throws(() => PUB.conferir(dp, 'demo-gal', {}), /galeria fora das regras/, 'citada e ausente também recusa');
  // site sem galeria: nenhuma pasta (o build de cliente não herda a galeria da demo)
  const r = construir('sem-galeria', tenantTeste(), { home: HOME, demonstracao: true });
  assert.ok(!fs.existsSync(path.join(r.destino, 'galeria')));
});

/* ======================= navegador ======================= */
function servirRotas(ctx, raizes) {
  const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
  return ctx.route(/^https?:\/\//, (rota) => {
    const u = new URL(rota.request().url());
    if (/fonts\.(googleapis|gstatic)\.com$/.test(u.host)) return rota.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (u.host !== 'creat.teste') return rota.abort('blockedbyclient');
    const [, chave, ...resto] = decodeURIComponent(u.pathname).split('/');
    const base = raizes[chave];
    let arq = base ? path.join(base, ...resto) : '';
    if (arq && (arq.endsWith(path.sep) || (fs.existsSync(arq) && fs.statSync(arq).isDirectory()))) arq = path.join(arq, 'index.html');
    if (!base || !arq.startsWith(base) || !fs.existsSync(arq)) return rota.fulfill({ status: 404, body: '404' });
    return rota.fulfill({ status: 200, contentType: tipos[path.extname(arq)] || 'application/octet-stream', body: fs.readFileSync(arq) });
  });
}
async function abrir(nav, url, opc) {
  const ctx = await nav.newContext(Object.assign({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/Manaus', serviceWorkers: 'block' }, opc || {}));
  await servirRotas(ctx, { d: path.join(TMP, 'dist'), p: RAIZ });
  await ctx.addInitScript(() => {
    window.__abertos = [];
    window.open = (u) => { window.__abertos.push(String(u)); return null; };
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (ev) => window.__csp.push(ev.violatedDirective));
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('pageerror', (e) => erros.push(e.message));
  // quarta, 11/11/2026, 08:31 na Bahia (07:31 em Manaus, onde o aparelho está)
  await page.clock.install({ time: new Date('2026-11-11T11:31:00Z') });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('#lista-horarios .horarios:not([hidden]) .horario', { timeout: 10000 });
  return { ctx, page, erros };
}
/* dia já marcado (hoje), primeiro horário visível, primeiro serviço que cabe, nome e WhatsApp, enviar sem arrastar */
async function pedir(page, whats, servico) {
  await page.locator('#lista-horarios .horarios:not([hidden]) .horario').first().click();
  await page.locator(servico ? `#lista-servicos .servico-opcao[data-servico="${servico}"]` : '#lista-servicos .servico-opcao:not([aria-disabled="true"])').first().click();
  await page.fill('#cliente-nome', 'TESTE Pixel');
  await page.fill('#cliente-whats', whats);
  await page.click('#confirmar-sem-arrastar');
  await page.waitForFunction(() => window.__abertos.length > 0, null, { timeout: 5000 });
  const u = await page.evaluate(() => window.__abertos[0]);
  return { url: u, texto: decodeURIComponent(new URL(u).searchParams.get('text') || '') };
}

test('navegador: demo, cliente e prévia; turnos; fuso da Bahia num aparelho de Manaus; barra do navegador', { skip: SEM_PW }, async () => {
  construir('demo-nav', tenantTeste(), { home: HOME, url: `${HOME}sites/demo-nav/`, rodape: true, demonstracao: true });
  const tc = tenantTeste({ negocio: Object.assign(tenantTeste().negocio, { whatsapp: WHATS_CLIENTE, nome: 'Barbearia do Teste' }) });
  construir('cliente-nav', tc, { home: HOME, url: `${HOME}sites/cliente-nav/`, rodape: true });
  const { chromium } = require(require.resolve('playwright', { paths: [RAIZ] }));
  const nav = await chromium.launch();
  try {
    // ---- demonstração ----
    let { ctx, page, erros } = await abrir(nav, 'https://creat.teste/d/demo-nav/');
    const r = await page.evaluate(() => {
      const ag = window.CreatMotor.agoraNoNegocio ? window.CreatMotor.agoraNoNegocio() : null;
      const turnos = [...document.querySelectorAll('#lista-horarios .turno')].map((t) => ({ id: t.getAttribute('data-turno'), titulo: t.querySelector('.turno-titulo').textContent, aberto: !t.querySelector('.horarios').hidden, n: t.querySelectorAll('.horario').length, ver: (t.querySelector('[data-ver-turno]') || {}).textContent || '' }));
      const primeiro = document.querySelector('#lista-horarios .horario').getAttribute('data-hora');
      return { horaNegocio: ag ? ag.getHours() * 60 + ag.getMinutes() : null, horaAparelho: new Date().getHours() * 60 + new Date().getMinutes(), turnos, primeiro, fab: (document.getElementById('whats-flutuante') || {}).href || '' };
    });
    assert.equal(r.horaAparelho, 7 * 60 + 31, 'o aparelho está em Manaus');
    if (r.horaNegocio !== null) assert.equal(r.horaNegocio, 8 * 60 + 31, 'agoraNoNegocio segue America/Bahia');
    const [h, m] = r.primeiro.split(':').map(Number);
    assert.ok(h * 60 + m >= 8 * 60 + 31 + 30, `primeiro horário de hoje ${r.primeiro}: tem de seguir o relógio da Bahia (8h31 + 30 min de antecedência), não o de Manaus`);
    // 08:00 a 20:00, de 30 em 30, a partir de 9h01: manhã 9h30 a 11h30 (5), tarde 12h a 17h30 (12), noite a partir de 18h
    assert.deepEqual(r.turnos.map((t) => [t.id, t.titulo, t.aberto]), [['manha', 'Manhã', false], ['tarde', 'Tarde', true], ['noite', 'Noite', false]]);
    const manha = r.turnos.find((t) => t.id === 'manha');
    assert.equal(manha.ver, `Ver manhã (${manha.n})`);
    assert.match(r.fab, /^https:\/\/wa\.me\/5575981151202\?text=/);
    assert.match(decodeURIComponent(new URL(r.fab).searchParams.get('text')), /^Vi a demonstração de barbearia da Creat \(Barbearia Navalha Fictícia\)\. Quero saber como ter um site assim\.$/);
    await page.click('[data-ver-turno="manha"]');
    assert.equal(await page.locator('#turno-manha-horarios').isHidden(), false, '"Ver manhã" abre o turno');
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('horario')), true, 'o foco vai para o primeiro horário do turno');
    // barra do navegador = cor real da faixa do topo, e segue o botão de tema
    const barra = await page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"][data-barra]')].map((x) => x.content));
    assert.equal(barra[0], tenantTeste().cores.texto.toUpperCase(), 'claro: a cor da faixa de demonstração (--tinta da paleta)');
    assert.equal(barra.length, 2); assert.equal(barra[0], barra[1]); assert.match(barra[0], /^#[0-9A-F]{6}$/);
    assert.equal(await page.locator('#alternar-tema').isVisible(), true, 'a paleta da barbearia tem tema escuro');
    await page.click('#alternar-tema');
    await page.waitForFunction((antes) => document.querySelector('meta[name="theme-color"][data-barra]').content !== antes, barra[0], { timeout: 3000 });
    const escuro = await page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"][data-barra]')].map((x) => x.content));
    assert.equal(escuro[0], escuro[1]); assert.notEqual(escuro[0], barra[0], 'o botão de tema troca a cor da barra');
    await page.click('#alternar-tema');
    await page.waitForFunction((antes) => document.querySelector('meta[name="theme-color"][data-barra]').content === antes, barra[0], { timeout: 3000 });
    // "Pedir este": pré-seleciona o serviço
    assert.equal(await page.evaluate(() => window.CreatAgendamento.escolherServico('barba')), true);
    assert.match(await page.textContent('#atalho-nota'), /Barba escolhido/);
    await page.locator('#lista-horarios .horarios:not([hidden]) .horario').first().click();
    assert.equal(await page.getAttribute('#lista-servicos .servico-opcao[data-servico="barba"]', 'aria-checked'), 'true', 'o serviço pedido antes do horário fica marcado ao escolher o horário');
    const demo = await pedir(page, '11900000000', 'barba');
    assert.match(demo.url, /^https:\/\/wa\.me\/5575981151202\?text=/);
    assert.ok(demo.texto.startsWith('Testei a demonstração de barbearia da Creat (Barbearia Navalha Fictícia). Simulação: '), demo.texto);
    assert.ok(demo.texto.endsWith(' Quero saber como ter um site assim.'), demo.texto);
    assert.match(demo.texto, /quarta, 11\/11 às /, 'dia da semana na mensagem');
    assert.doesNotMatch(demo.texto, /\bhoje\b|amanhã/);
    const valor = await page.evaluate(() => [...document.querySelectorAll('#espelho-dados dd')].map((d) => [d.className, d.textContent]));
    assert.ok(valor.some(([c, t]) => c === 'preco is-consulta' && /sob consulta/.test(t)), JSON.stringify(valor));
    assert.deepEqual(await page.evaluate(() => window.__csp), [], 'nenhuma violação de CSP (estilos pelo CSSOM)');
    assert.deepEqual(erros, []);
    await ctx.close();

    // ---- site de cliente: nunca a marca de demo nem o número da Creat ----
    ({ ctx, page, erros } = await abrir(nav, 'https://creat.teste/d/cliente-nav/'));
    const cli = await pedir(page, '11900000000');
    assert.match(cli.url, new RegExp(`^https://wa\\.me/${WHATS_CLIENTE}\\?text=`));
    assert.doesNotMatch(cli.url + cli.texto, /5575981151202|Testei a demonstração|Quero saber como ter um site assim|Simulação/);
    assert.match(cli.texto, /^Olá! Meu nome é TESTE Pixel\. Quero pedir um horário: .+, quarta, 11\/11 às /);
    assert.equal(await page.evaluate(() => document.getElementById('whats-flutuante').getAttribute('href')), `https://wa.me/${WHATS_CLIENTE}`);
    assert.deepEqual(erros, []);
    await ctx.close();

    // ---- prévia: só "Teste da prévia do site: " ----
    ({ ctx, page, erros } = await abrir(nav, 'https://creat.teste/p/previa/#k=barbearia&n=TESTE%20Pixel&c=Feira%20de%20Santana&p=1'));
    const pv = await pedir(page, '11900000000');
    assert.match(pv.url, /^https:\/\/wa\.me\/5511900000000\?text=/, 'na prévia o pedido vai para o WhatsApp de teste do visitante');
    assert.ok(pv.texto.startsWith('Teste da prévia do site: '), pv.texto);
    assert.doesNotMatch(pv.texto, /Testei a demonstração|Quero saber como ter um site assim/);
    assert.deepEqual(erros, []);
    await ctx.close();
  } finally { await nav.close(); }
});
