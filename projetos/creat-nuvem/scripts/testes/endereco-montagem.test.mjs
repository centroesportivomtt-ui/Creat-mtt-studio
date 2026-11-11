/*
 * scripts/testes/endereco-montagem.test.mjs · endereço único (pacote H2, 11/11/2026; docs/DOMINIO.md)
 *
 * Prova, sem rede:
 *   - a fonte única (ENDERECO de scripts/producao/lib/comum.cjs) e o padrão novo de home, URL dos sites e host;
 *   - CREAT_HOST troca tudo de uma vez (é o "voltar atrás") e recusa o que não é origem https;
 *   - a janela do endereço antigo (aceito até 13/11, horário da Bahia);
 *   - nenhum outro script do pacote escreve os endereços como texto de código;
 *   - montar-publico: {{HOST}} trocado em todo HTML, sitemap e robots no endereço, marcador sobrando = código 1;
 *   - build-site e publicar-site: sites e demos nascem com canonical, og:url e home no endereço novo;
 *   - validar-anuncio: antigo aceito com aviso até 13/11 e reprovado depois;
 *   - as 3 demos versionadas apontam a prévia para o endereço novo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TMP = fs.mkdtempSync(path.join(process.env.CREAT_TESTE_TMP || os.tmpdir(), 'creat-endereco-'));
const NOVO = 'https://nuvem.creatmtt.com.br';
const ANTIGO = 'https://creat-nuvem-404b1994.base44.app';

/* ambiente sem nenhuma variável de endereço, mais o que o teste pedir */
function amb(extra) {
  const e = Object.assign({}, process.env);
  for (const k of ['CREAT_HOST', 'CREAT_HOME', 'CREAT_URL_SITES', 'CREAT_DOMINIOS', 'ANTHROPIC_API_KEY']) delete e[k];
  return Object.assign(e, extra || {});
}
function rodar(script, args, extra) {
  const r = spawnSync(process.execPath, [path.join(RAIZ, script), ...args], { env: amb(extra), encoding: 'utf8', cwd: RAIZ });
  return { codigo: r.status, saida: (r.stdout || '') + (r.stderr || '') };
}
/* comum.cjs lido de novo, com o ambiente pedido (hostPadrao lê process.env na hora) */
function comEnv(extra, fn) {
  const guardado = {};
  for (const k of ['CREAT_HOST', 'CREAT_HOME', 'CREAT_URL_SITES']) { guardado[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, extra || {});
  try { return fn(require(path.join(RAIZ, 'scripts', 'producao', 'lib', 'comum.cjs'))); }
  finally { for (const k of Object.keys(guardado)) { if (guardado[k] === undefined) delete process.env[k]; else process.env[k] = guardado[k]; } }
}

test('fonte única: o canônico é o padrão de home, URL dos sites e host; o antigo é conhecido', () => {
  comEnv({}, (C) => {
    assert.equal(C.ENDERECO.canonico, NOVO);
    assert.equal(C.ENDERECO.antigo, ANTIGO);
    assert.ok(Object.isFrozen(C.ENDERECO));
    assert.equal(C.hostPadrao(), NOVO);
    assert.equal(C.homePadrao(), NOVO + '/');
    assert.equal(C.modeloUrlSites(), NOVO + '/sites/{slug}/');
    assert.equal(C.HOME_PADRAO, NOVO + '/');
    assert.equal(C.URL_SITES_PADRAO, NOVO + '/sites/{slug}/');
    assert.deepEqual(C.origensDaVitrine(), [NOVO, ANTIGO]);
  });
  comEnv({ CREAT_HOME: '0', CREAT_URL_SITES: '0' }, (C) => { assert.equal(C.homePadrao(), ''); assert.equal(C.modeloUrlSites(), ''); });
  comEnv({ CREAT_HOME: 'https://h.exemplo/', CREAT_URL_SITES: 'https://{slug}.exemplo/' }, (C) => {
    assert.equal(C.homePadrao(), 'https://h.exemplo/'); assert.equal(C.modeloUrlSites(), 'https://{slug}.exemplo/');
  });
});

test('CREAT_HOST volta atrás de uma vez e recusa o que não é origem https', () => {
  comEnv({ CREAT_HOST: ANTIGO + '/' }, (C) => {
    assert.equal(C.hostPadrao(), ANTIGO);
    assert.equal(C.homePadrao(), ANTIGO + '/');
    assert.equal(C.modeloUrlSites(), ANTIGO + '/sites/{slug}/');
    assert.deepEqual(C.origensDaVitrine(), [ANTIGO, NOVO]);
  });
  for (const ruim of ['http://nuvem.creatmtt.com.br', 'https://nuvem.creatmtt.com.br/sites/', 'https://x.exemplo/?a=1', 'nao-e-url']) {
    comEnv({ CREAT_HOST: ruim }, (C) => assert.throws(() => C.hostPadrao(), /CREAT_HOST/, ruim));
  }
});

test('janela do antigo: aceito até 13/11 inclusive, no horário da Bahia', () => {
  comEnv({}, (C) => {
    assert.equal(C.ENDERECO.antigoAceitoAte, '2026-11-13');
    assert.equal(C.antigoAceito('2026-11-11'), true);
    assert.equal(C.antigoAceito('2026-11-13'), true);
    assert.equal(C.antigoAceito('2026-11-14'), false);
    assert.equal(C.hojeNaBahia('2026-11-14T02:59:00Z'), '2026-11-13');   // 23h59 de 13/11 na Bahia
    assert.equal(C.hojeNaBahia('2026-11-14T03:00:00Z'), '2026-11-14');
  });
});

test('nenhum outro script do pacote escreve os endereços como texto de código (só comum.cjs)', () => {
  const arquivos = ['scripts/montar-publico.cjs', 'scripts/checar.cjs', 'scripts/conferir-no-ar.cjs', 'scripts/conferir-sites-no-ar.cjs',
    'scripts/conferir-boot.cjs', 'scripts/producao/build-site.cjs', 'scripts/producao/publicar-site.cjs', 'scripts/producao/testar-site.cjs',
    'marketing/trafego/validar-anuncio.cjs'];
  const LITERAL = /['"`]https?:\/\/(nuvem\.creatmtt\.com\.br|creat-nuvem-404b1994\.base44\.app)/;
  for (const a of arquivos) {
    const linhas = fs.readFileSync(path.join(RAIZ, a), 'utf8').split('\n');
    const achadas = linhas.map((l, i) => [i + 1, l]).filter(([, l]) => LITERAL.test(l));
    assert.deepEqual(achadas, [], `${a} escreve o endereço: ${achadas.map(([n]) => n).join(', ')}`);
  }
  assert.match(fs.readFileSync(path.join(RAIZ, 'scripts', 'producao', 'lib', 'comum.cjs'), 'utf8'), /canonico: 'https:\/\/nuvem\.creatmtt\.com\.br'/);
});

/* projeto de mentira para o montar-publico: index com {{HOST}}, página noindex, termos */
function projetoFalso(nome, extra) {
  const p = path.join(TMP, nome, 'projetos', 'creat-nuvem');
  fs.mkdirSync(path.join(p, 'termos'), { recursive: true });
  fs.mkdirSync(path.join(p, 'abrir'), { recursive: true });
  fs.mkdirSync(path.join(p, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(p, 'index.html'), '<!doctype html><html><head><link rel="canonical" href="{{HOST}}/"><meta property="og:url" content="{{HOST}}/"></head><body><a href="{{HOST}}/termos/">t</a></body></html>');
  fs.writeFileSync(path.join(p, 'termos', 'index.html'), '<!doctype html><html><head><title>t</title></head><body>t</body></html>');
  fs.writeFileSync(path.join(p, 'abrir', 'index.html'), '<!doctype html><html><head><meta name="robots" content="noindex"></head><body>a</body></html>');
  fs.writeFileSync(path.join(p, 'assets', 'a.js'), extra ? 'var h = "{{HOST}}";' : 'var h = 1;');
  return p;
}

test('montar-publico: CREAT_HOST de exemplo troca todo {{HOST}}, sitemap e robots no endereço; marcador sobrando sai com 1', () => {
  const p = projetoFalso('limpo', false);
  const d = path.join(TMP, 'saida-limpo');
  const r = rodar('scripts/montar-publico.cjs', ['--projeto', p, '--destino', d], { CREAT_HOST: 'https://exemplo.test' });
  assert.equal(r.codigo, 0, r.saida);
  const html = fs.readFileSync(path.join(d, 'index.html'), 'utf8');
  assert.ok(!html.includes('{{HOST}}'));
  assert.match(html, /<link rel="canonical" href="https:\/\/exemplo\.test\/">/);
  assert.match(html, /href="https:\/\/exemplo\.test\/termos\/"/);
  assert.equal(fs.readFileSync(path.join(d, 'robots.txt'), 'utf8'), 'User-agent: *\nAllow: /\nDisallow: /sites/*--r-\nSitemap: https://exemplo.test/sitemap.xml\n');
  const sm = fs.readFileSync(path.join(d, 'sitemap.xml'), 'utf8');
  assert.deepEqual([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), ['https://exemplo.test/', 'https://exemplo.test/termos/']);
  assert.match(r.saida, /3 marcador\(es\) \{\{HOST\}\} trocados/);

  const p2 = projetoFalso('sujo', true);
  const d2 = path.join(TMP, 'saida-sujo');
  const r2 = rodar('scripts/montar-publico.cjs', ['--projeto', p2, '--destino', d2], { CREAT_HOST: 'https://exemplo.test' });
  assert.equal(r2.codigo, 1, r2.saida);
  assert.match(r2.saida, /FALHA  sobrou o marcador \{\{HOST\}\}.*assets\/a\.js/);

  // destino que não é montagem anterior nunca é apagado
  const ruim = path.join(TMP, 'pasta-com-coisa'); fs.mkdirSync(ruim, { recursive: true }); fs.writeFileSync(path.join(ruim, 'importante.txt'), 'x');
  const r3 = rodar('scripts/montar-publico.cjs', ['--projeto', p, '--destino', ruim], {});
  assert.equal(r3.codigo, 2, r3.saida);
  assert.ok(fs.existsSync(path.join(ruim, 'importante.txt')));
});

test('montar-publico de verdade: robots e sitemap no canônico, páginas noindex fora do sitemap', () => {
  const d = path.join(TMP, 'publico-real');
  const r = rodar('scripts/montar-publico.cjs', ['--destino', d], {});
  assert.equal(r.codigo, 0, r.saida);
  const { ROBOTS_RAIZ } = require(path.join(RAIZ, 'scripts', 'montar-publico.cjs'));
  assert.equal(fs.readFileSync(path.join(d, 'robots.txt'), 'utf8'), ROBOTS_RAIZ);
  assert.match(ROBOTS_RAIZ, /\nSitemap: https:\/\/nuvem\.creatmtt\.com\.br\/sitemap\.xml\n$/);
  const locs = [...fs.readFileSync(path.join(d, 'sitemap.xml'), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.includes(NOVO + '/'), locs.join(' '));
  assert.ok(locs.every((l) => l.startsWith(NOVO + '/')), locs.join(' '));
  for (const fora of ['/abrir/', '/obrigado/', '/previa/']) assert.ok(!locs.includes(NOVO + fora), `${fora} tem noindex e não entra`);
  assert.ok(!locs.some((l) => /404|\/sites\//.test(l)));
});

test('build-site: demo nasce com canonical, og:url e home no canônico; CREAT_HOST antigo volta atrás', () => {
  const tenant = path.join(RAIZ, 'sites', 'demo-barbearia', 'tenant.json');
  const d = path.join(TMP, 'b-novo', 'demo-barbearia');
  let r = rodar('scripts/producao/build-site.cjs', ['--tenant', tenant, '--destino', d, '--demonstracao', '--saida', path.join(TMP, 'b-novo')], {});
  assert.equal(r.codigo, 0, r.saida);
  let h = fs.readFileSync(path.join(d, 'index.html'), 'utf8');
  assert.match(h, /<link rel="canonical" href="https:\/\/nuvem\.creatmtt\.com\.br\/sites\/demo-barbearia\/">/);
  assert.match(h, /<meta property="og:url" content="https:\/\/nuvem\.creatmtt\.com\.br\/sites\/demo-barbearia\/">/);
  assert.match(fs.readFileSync(path.join(d, 'tenant.js'), 'utf8'), /"home":"https:\/\/nuvem\.creatmtt\.com\.br\/"/);
  assert.ok(!(h + fs.readFileSync(path.join(d, 'tenant.js'), 'utf8')).includes('404b1994'), 'nada do antigo');

  const d2 = path.join(TMP, 'b-antigo', 'demo-barbearia');
  r = rodar('scripts/producao/build-site.cjs', ['--tenant', tenant, '--destino', d2, '--demonstracao', '--saida', path.join(TMP, 'b-antigo')], { CREAT_HOST: ANTIGO });
  assert.equal(r.codigo, 0, r.saida);
  h = fs.readFileSync(path.join(d2, 'index.html'), 'utf8');
  assert.match(h, /<link rel="canonical" href="https:\/\/creat-nuvem-404b1994\.base44\.app\/sites\/demo-barbearia\/">/);
});

test('build-site: site entregue nasce com sitemap no canônico', () => {
  const t = JSON.parse(fs.readFileSync(path.join(RAIZ, 'sites', 'demo-salao', 'tenant.json'), 'utf8'));
  t.slug = 'salao-teste-endereco';
  const arq = path.join(TMP, 'tenant-entregue.json'); fs.writeFileSync(arq, JSON.stringify(t));
  const d = path.join(TMP, 'b-entregue', t.slug);
  const r = rodar('scripts/producao/build-site.cjs', ['--tenant', arq, '--destino', d, '--saida', path.join(TMP, 'b-entregue')], {});
  assert.equal(r.codigo, 0, r.saida);
  assert.match(fs.readFileSync(path.join(d, 'sitemap.xml'), 'utf8'), /<loc>https:\/\/nuvem\.creatmtt\.com\.br\/sites\/salao-teste-endereco\/<\/loc>/);
  assert.match(fs.readFileSync(path.join(d, 'robots.txt'), 'utf8'), /Sitemap: https:\/\/nuvem\.creatmtt\.com\.br\/sites\/salao-teste-endereco\/sitemap\.xml/);
});

test('publicar-site: o endereço do site e do rascunho no passo a passo segue o canônico', () => {
  comEnv({}, () => {
    const P = require(path.join(RAIZ, 'scripts', 'producao', 'publicar-site.cjs'));
    assert.equal(P.urlDaPasta('barbearia-x--r-abcdefgh12345678'), NOVO + '/sites/barbearia-x--r-abcdefgh12345678/');
    const passos = P.passos('barbearia-x', { sha256: 'a'.repeat(64), zip: '/tmp/z.zip' }, { apagarRascunho: 'barbearia-x--r-abcdefgh12345678' }).join('\n');
    assert.ok(passos.includes(`curl -sI ${NOVO}/sites/barbearia-x/ -> 200`), passos);
    assert.ok(passos.includes(`curl -sIL ${NOVO}/sites/barbearia-x--r-abcdefgh12345678/ -> 404`), passos);
    assert.ok(!passos.includes('404b1994.base44.app'));
  });
  comEnv({ CREAT_URL_SITES: '0' }, () => {
    const P = require(path.join(RAIZ, 'scripts', 'producao', 'publicar-site.cjs'));
    assert.equal(P.urlDaPasta('x'), NOVO + '/sites/x/');
  });
});

test('validar-anuncio: o antigo passa com aviso até 13/11 e reprova depois; o canônico passa', () => {
  const ex = JSON.parse(rodar('marketing/trafego/validar-anuncio.cjs', ['--exemplo']).saida);
  assert.ok(ex.anuncios[0].url.startsWith(NOVO + '/?'), ex.anuncios[0].url);
  const antigo = JSON.parse(JSON.stringify(ex)); antigo.anuncios[0].url = antigo.anuncios[0].url.replace(NOVO, ANTIGO);
  const a1 = path.join(TMP, 'anuncio-antigo.json'); fs.writeFileSync(a1, JSON.stringify(antigo));
  const a2 = path.join(TMP, 'anuncio-novo.json'); fs.writeFileSync(a2, JSON.stringify(ex));
  const ler = (j) => JSON.parse(fs.readFileSync(j, 'utf8')).anuncios[0];
  const so = (l) => l.filter((x) => !/^NÃO VERIFICADO: rodada com --sem-link$/.test(x));

  const j1 = path.join(TMP, 'v1.json');
  rodar('marketing/trafego/validar-anuncio.cjs', [a1, '--sem-link', '--trava-provada', '--hoje', '2026-11-13', '--json', j1]);
  assert.deepEqual(so(ler(j1).link), [], JSON.stringify(ler(j1).link));
  assert.ok(ler(j1).avisos.some((x) => /^endereço antigo: .*aceito até 2026-11-13; no ato de 13\/11 troque para nuvem\.creatmtt\.com\.br/.test(x)), JSON.stringify(ler(j1).avisos));

  const j2 = path.join(TMP, 'v2.json');
  rodar('marketing/trafego/validar-anuncio.cjs', [a1, '--sem-link', '--trava-provada', '--hoje', '2026-11-14', '--json', j2]);
  assert.ok(so(ler(j2).link).some((x) => /endereço antigo creat-nuvem-404b1994\.base44\.app depois de 2026-11-13/.test(x)), JSON.stringify(ler(j2).link));

  const j3 = path.join(TMP, 'v3.json');
  rodar('marketing/trafego/validar-anuncio.cjs', [a2, '--sem-link', '--trava-provada', '--hoje', '2026-11-20', '--json', j3]);
  assert.deepEqual(so(ler(j3).link), []);
  assert.deepEqual(ler(j3).avisos, []);

  const outro = JSON.parse(JSON.stringify(ex)); outro.anuncios[0].url = outro.anuncios[0].url.replace(NOVO, 'https://golpe.example');
  const a4 = path.join(TMP, 'anuncio-outro.json'); fs.writeFileSync(a4, JSON.stringify(outro));
  const j4 = path.join(TMP, 'v4.json');
  rodar('marketing/trafego/validar-anuncio.cjs', [a4, '--sem-link', '--trava-provada', '--json', j4]);
  assert.ok(so(ler(j4).link).some((x) => /URL em golpe\.example, esperado nuvem\.creatmtt\.com\.br/.test(x)));
});

test('as 3 demos versionadas apontam a prévia para o canônico', () => {
  for (const k of ['barbearia', 'salao', 'academia']) {
    const p = JSON.parse(fs.readFileSync(path.join(RAIZ, 'sites', `demo-${k}`, 'pedido.json'), 'utf8'));
    assert.ok(p.previa.startsWith(NOVO + '/previa/#k=' + k), `${k}: ${p.previa}`);
  }
});

test('conferir-no-ar: o host padrão das conferências vem da fonte única e o grupo E tem as 20 conferências declaradas', () => {
  const s = fs.readFileSync(path.join(RAIZ, 'scripts', 'conferir-no-ar.cjs'), 'utf8');
  assert.match(s, /const BASE = String\(opt\('--base', C\.hostPadrao\(\)\)\)/);
  assert.match(s, /const esperadas = SO_ENDERECO \? 20 :/);
  for (const c of ['/abrir/?nicho=barbearia&utm_source=teste-pixel', '/obrigado/?payment_id=99999999999&resultado=aprovado']) assert.ok(s.includes(c), c);
  const v = fs.readFileSync(path.join(RAIZ, 'marketing', 'trafego', 'validar-anuncio.cjs'), 'utf8');
  assert.match(v, /const BASE = String\(opt\('--base', C\.hostPadrao\(\)\)\)/);
  const cs = fs.readFileSync(path.join(RAIZ, 'scripts', 'conferir-sites-no-ar.cjs'), 'utf8');
  assert.match(cs, /C\.origensDaVitrine\(\)/);
});
