/*
 * scripts/testes/demonstracao.test.mjs · sites-demonstração (motor v1.1, --demonstracao) · Pixel/Verbo
 *
 * Roda a esteira real (produzir.mjs) com os pedidos e as respostas de IA gravadas em demos/
 * numa pasta temporária (CREAT_TESTE_TMP ou TMPDIR), sem rede e sem chave, e confere:
 * faixa "demonstração · nome fictício" (no HTML sem JS e na página montada), noindex, sem JSON-LD,
 * robots.txt Disallow, WhatsApp do Suporte Creat e que o bloco "demo" continua proibido no tenant.
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
  const t = JSON.parse(fs.readFileSync(path.join(TMP, 'dist', 'demo-barbearia', 'tenant.json'), 'utf8'));
  const r = validarTenant(Object.assign({}, t, { demo: { faixa: true } }));
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => e.campo === 'demo'));
});
