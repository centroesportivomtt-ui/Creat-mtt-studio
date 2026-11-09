/*
 * scripts/testes/demonstracao.test.mjs · sites-demonstração (motor v1.1, --demonstracao) · Pixel/Verbo
 *
 * Roda a esteira real (produzir.mjs) com os pedidos e as respostas de IA gravadas em demos/
 * numa pasta temporária (CREAT_TESTE_TMP ou TMPDIR), sem rede e sem chave, e confere:
 * faixa "demonstração · nome fictício" (no HTML sem JS e na página montada), noindex, sem JSON-LD,
 * robots.txt Disallow, WhatsApp do Suporte Creat e que o bloco "demo" continua proibido no tenant.
 * A pasta temporária é apagada no fim (CREAT_TESTE_MANTER=1 guarda, como em producao.test.mjs).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const DEMOS = path.join(RAIZ, 'demos');
const TMP = fs.mkdtempSync(path.join(process.env.CREAT_TESTE_TMP || os.tmpdir(), 'creat-demo-'));
const { validarTenant } = require(path.join(RAIZ, 'scripts', 'producao', 'lib', 'validacao.cjs'));
const WHATS = '5575981151202';
const FAIXA = 'demonstração · nome fictício';

let temPlaywright = true;
try { require.resolve('playwright', { paths: [RAIZ] }); } catch (e) { temPlaywright = false; }

function produzir(k, extra) {
  const e = Object.assign({}, process.env, { CREAT_CAMBIO: '5.4', CREAT_SILENCIO: '1' });
  delete e.ANTHROPIC_API_KEY; delete e.CREAT_URL_SITES; delete e.CREAT_HOME; delete e.CREAT_IA_FIXTURE;
  const slug = `demo-${k}`;
  return spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'producao', 'produzir.mjs'),
    '--pedido', path.join(DEMOS, `pedido-${k}.txt`), '--fixture-ia', path.join(DEMOS, `resposta-ia-${k}.json`),
    '--slug', slug, '--saida', TMP, '--sem-sair', '--demonstracao',
    '--url', `https://creat-nuvem-404b1994.base44.app/sites/${slug}/`, '--home', 'https://creat-nuvem-404b1994.base44.app',
    ...(extra || [])], { env: e, encoding: 'utf8' });
}

for (const k of ['barbearia', 'salao', 'academia']) {
  test(`demo-${k}: esteira real com --demonstracao gera faixa, noindex e WhatsApp do suporte`, () => {
    const r = produzir(k, temPlaywright ? [] : ['--sem-navegador']);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const d = path.join(TMP, 'dist', `demo-${k}`);
    const html = fs.readFileSync(path.join(d, 'index.html'), 'utf8');
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
    assert.doesNotMatch(html, /ld\+json/);
    assert.ok(html.includes(FAIXA), 'faixa no HTML (noscript)');
    assert.match(fs.readFileSync(path.join(d, 'robots.txt'), 'utf8'), /Disallow: \//);
    assert.ok(!fs.existsSync(path.join(d, 'sitemap.xml')));
    assert.match(fs.readFileSync(path.join(d, 'tenant.js'), 'utf8'), /"demonstracao":true/);
    const t = JSON.parse(fs.readFileSync(path.join(d, 'tenant.json'), 'utf8'));
    assert.equal(t.negocio.whatsapp, WHATS);
    assert.match(t.negocio.nome, /Fictíci[ao]$/);
    assert.equal(t.meta.previa, false);
    assert.ok(!('demo' in t), 'a demonstração é opção do site, nunca campo do tenant');
    if (temPlaywright) {
      const teste = JSON.parse(fs.readFileSync(path.join(TMP, 'sites', `demo-${k}`, 'teste-site.json'), 'utf8'));
      assert.equal(teste.ok, true, teste.falhas.join(' | '));
      assert.equal(teste.medidas.faixaDemo, true);
    }
  });
}

test('o validador continua proibindo bloco "demo" no tenant', () => {
  // fixture própria: não depende do primeiro teste ter rodado (--test-name-pattern ou falha anterior)
  const t = JSON.parse(fs.readFileSync(path.join(RAIZ, 'schema', 'exemplos', 'tenant.entregue.valido.json'), 'utf8'));
  assert.equal(validarTenant(t).ok, true, 'a fixture base precisa ser válida');
  const r = validarTenant(Object.assign({}, t, { demo: { faixa: true } }));
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.campo === 'demo'));
});

test('demonstração: endereço sem link do Maps; site entregue continua com o link', () => {
  const motor = require(path.join(RAIZ, 'motor', 'v1', 'motor.js'));
  const t = JSON.parse(fs.readFileSync(path.join(RAIZ, 'schema', 'exemplos', 'tenant.entregue.valido.json'), 'utf8'));
  assert.ok(t.negocio.endereco && t.negocio.endereco.rua, 'a fixture precisa ter rua');
  assert.match(motor.construirEstado(t, { site: {} }).contato.mapaUrl, /^https:\/\/www\.google\.com\/maps\//);
  const d = motor.construirEstado(t, { site: { demonstracao: true } });
  assert.equal(d.demonstracao, true);
  assert.equal(d.contato.mapaUrl, '', 'demo não leva a um imóvel de terceiros pelo Maps');
});

test('demonstração: link "Veja a equipe que montou este site" vai para a sede da home, saneado; site entregue não tem', () => {
  const motor = require(path.join(RAIZ, 'motor', 'v1', 'motor.js'));
  const t = JSON.parse(fs.readFileSync(path.join(RAIZ, 'schema', 'exemplos', 'tenant.entregue.valido.json'), 'utf8'));
  const home = 'https://creat-nuvem-404b1994.base44.app';
  assert.equal(motor.construirEstado(t, { site: { home } }).sedeHref, '', 'site entregue não leva à sede de demonstração');
  const d = motor.construirEstado(t, { site: { home, demonstracao: true } });
  assert.match(d.sedeHref, /^https:\/\/creat-nuvem-404b1994\.base44\.app\/sede\/\?modo=demo&marca=[^&#\s"'<>]+$/);
  assert.equal(new URL(d.sedeHref).searchParams.get('marca').length <= 28, true);
  const sujo = JSON.parse(JSON.stringify(t)); sujo.negocio.nome = 'Bar"><script>alert(1)</script> & Cia';
  const h = motor.construirEstado(sujo, { site: { home: home + '/?x=1#y', demonstracao: true } }).sedeHref;
  assert.ok(!/[<>"]/.test(decodeURIComponent(h)), h);
  assert.equal(new URL(h).pathname, '/sede/');
  assert.equal(motor.construirEstado(t, { site: { home: 'javascript:alert(1)', demonstracao: true } }).sedeHref, '');
  assert.equal(motor.construirEstado(t, { site: { home: 'http://exemplo.com', demonstracao: true } }).sedeHref, '');
});

test('pedidos dos demos: endereço s/n de rua de exemplo, sem número de imóvel real', () => {
  for (const k of ['barbearia', 'salao', 'academia']) {
    const linha = fs.readFileSync(path.join(DEMOS, `pedido-${k}.txt`), 'utf8').split('\n').find((l) => l.startsWith('endereco:'));
    assert.match(linha, /^endereco: \S+ do Exemplo, s\/n, /, `pedido-${k}.txt: ${linha}`);
  }
});

test('conferir-sites-no-ar: acha os sites/<slug>/ que a vitrine linka', () => {
  const { slugsDaVitrine } = require(path.join(RAIZ, 'scripts', 'conferir-sites-no-ar.cjs'));
  const d = path.join(TMP, 'vitrine-falsa');
  fs.mkdirSync(path.join(d, 'abrir'), { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), '<a href="sites/demo-salao/">a</a><a href="./sites/demo-barbearia/">b</a><a href="https://x/sites/fora/">c</a>');
  fs.writeFileSync(path.join(d, 'abrir', 'index.html'), '<a href="../sites/demo-academia/">c</a>');
  assert.deepEqual(slugsDaVitrine(d), ['demo-academia', 'demo-barbearia', 'demo-salao']);
});

test.after(() => { if (!process.env.CREAT_TESTE_MANTER) fs.rmSync(TMP, { recursive: true, force: true }); });
