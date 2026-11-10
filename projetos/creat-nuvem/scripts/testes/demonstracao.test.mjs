/*
 * scripts/testes/demonstracao.test.mjs · sites-demonstração (motor v1.1, --demonstracao) · Pixel/Verbo
 *
 * Roda a esteira real (produzir.mjs) com os pedidos e as respostas de IA gravadas em demos/
 * numa pasta temporária (CREAT_TESTE_TMP ou TMPDIR), sem rede e sem chave, e confere:
 * faixa "demonstração · nome fictício" (no HTML sem JS e na página montada), noindex, sem JSON-LD,
 * robots.txt Disallow, WhatsApp do Suporte Creat e que o bloco "demo" continua proibido no tenant.
 * A pasta temporária é apagada no fim (CREAT_TESTE_MANTER=1 guarda, como em producao.test.mjs).
 *
 * v1.3 (ADR-006, onda 3, pacote 3A): galeria, fuso e recados opcionais no schema; compra do nicho a partir
 * da demonstração; mapa ilustrativo; relógio do negócio; letreiro curto; rodapé sem ponto solto; e, no
 * navegador, que site de cliente sem galeria não ganha a seção #trabalhos nem nada da demonstração.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

/* com galeria em demos/extras-<nicho>.json, as imagens versionadas em sites/demo-<nicho>/galeria/ vão junto para a saída */
function copiarGaleria(k, saida) {
  const de = path.join(RAIZ, 'sites', `demo-${k}`, 'galeria');
  if (fs.existsSync(de)) fs.cpSync(de, path.join(saida, 'sites', `demo-${k}`, 'galeria'), { recursive: true });
}

function produzir(k, extra) {
  copiarGaleria(k, TMP);
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
    assert.ok(t.negocio.nome && t.negocio.nome.length >= 3, 'nome fictício da demonstração');
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

test('demonstração: mapa ilustrativo no centro da cidade de exemplo, nunca na rua; site entregue leva ao endereço', () => {
  const motor = require(path.join(RAIZ, 'motor', 'v1', 'motor.js'));
  const t = JSON.parse(fs.readFileSync(path.join(RAIZ, 'schema', 'exemplos', 'tenant.entregue.valido.json'), 'utf8'));
  assert.ok(t.negocio.endereco && t.negocio.endereco.rua, 'a fixture precisa ter rua');
  const c = motor.construirEstado(t, { site: {} });
  assert.match(c.contato.mapaUrl, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Rua%20Exemplo/);
  assert.equal(c.contato.mapaIlustrativo, false);
  const d = motor.construirEstado(t, { site: { demonstracao: true } });
  assert.equal(d.demonstracao, true);
  assert.equal(d.contato.mapaUrl, 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Centro, Campinas - SP'));
  assert.ok(!decodeURIComponent(d.contato.mapaUrl).includes(t.negocio.endereco.rua), 'demo não leva a um imóvel de terceiros pelo Maps');
  assert.equal(d.contato.mapaIlustrativo, true);
  assert.deepEqual(d.contato.enderecoLinhas, ['Rua Exemplo, 100', 'Centro, Campinas (SP)', 'CEP 13010-000'], 'endereço "Centro, Cidade (UF)"');
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

/* ---------------------------- v1.3 (ADR-006) ---------------------------- */
const motorV1 = () => require(path.join(RAIZ, 'motor', 'v1', 'motor.js'));
const fixture = (n) => JSON.parse(fs.readFileSync(path.join(RAIZ, 'schema', 'exemplos', n), 'utf8'));
const GALERIA = [1, 2, 3].map((i) => ({ src: `galeria/foto-${i}.png`, alt: `Foto de exemplo: cadeira ${i} de barbearia`, legenda: `Foto de exemplo ${i}` }));
const HOME = 'https://creat-nuvem-404b1994.base44.app';

test('v1.3: schema aceita tenant com e sem galeria, fuso e recados; tenant antigo continua válido', () => {
  const t = fixture('tenant.entregue.valido.json');
  assert.equal(validarTenant(t).ok, true, 'tenant antigo (v1, sem campos novos)');
  assert.equal(validarTenant(fixture('tenant.previa.valido.json')).ok, true, 'prévia antiga');
  const cli = Object.assign({}, t, { galeria: GALERIA.map((g) => ({ src: g.src, alt: 'Cadeira de couro', legenda: 'Cadeira da casa', largura: 1280, altura: 960 })), fuso: 'America/Sao_Paulo' });
  const r1 = validarTenant(cli); assert.equal(r1.ok, true, JSON.stringify(r1.erros));
  const demo = Object.assign({}, t, { slug: 'demo-barbearia', galeria: GALERIA, recados: [{ texto: 'Saí do jeito que pedi.', autor: 'Cliente de exemplo' }] });
  const r2 = validarTenant(demo); assert.equal(r2.ok, true, JSON.stringify(r2.erros));
});

test('v1.3: validação barra imagem de fora, fuso estranho, recado em site de cliente e foto de demo sem o rótulo', () => {
  const t = fixture('tenant.entregue.valido.json');
  const campos = (o) => validarTenant(Object.assign({}, t, o)).erros.map((e) => e.campo);
  assert.ok(campos({ galeria: [{ src: 'https://exemplo.com/a.jpg', alt: 'x', legenda: 'x' }] }).some((c) => c.startsWith('galeria')), 'imagem de terceiro');
  assert.ok(campos({ galeria: [{ src: 'galeria/../a.png', alt: 'x', legenda: 'x' }] }).some((c) => c.startsWith('galeria')), 'caminho com ..');
  assert.ok(campos({ galeria: Array.from({ length: 7 }, (_, i) => ({ src: `galeria/f-${i}.png`, alt: 'x', legenda: 'x' })) }).some((c) => c.startsWith('galeria')), 'mais de 6 fotos');
  assert.ok(campos({ fuso: 'Europe/Lisbon' }).includes('fuso'));
  assert.ok(campos({ recados: [{ texto: 'Ótimo.', autor: 'Ana' }] }).includes('recados'), 'recado de exemplo não entra em site de cliente');
  assert.ok(campos({ slug: 'demo-barbearia', galeria: [{ src: 'galeria/a.png', alt: 'Cadeira', legenda: 'Cadeira' }] }).some((c) => /^galeria\[0\]\.(alt|legenda)$/.test(c)), 'demo sem "Foto de exemplo"');
  assert.ok(campos({ galeria: [{ src: 'galeria/a.png', alt: 'Foto de exemplo de cadeira', legenda: 'Foto de exemplo' }] }).some((c) => c.startsWith('galeria')), 'cliente não publica "foto de exemplo"');
  assert.ok(campos({ galeria: [{ src: 'galeria/a.png', alt: 'Ilustração de exemplo: cadeira', legenda: 'Ilustração de exemplo: a cadeira' }] }).some((c) => c.startsWith('galeria')), 'cliente não publica "ilustração de exemplo"');
});

/* achado da conferência (onda 3): as 12 imagens do 3F são desenhos da casa, rotulados "Ilustração de exemplo" (CDC art. 37) */
const ILUSTRACOES = [1, 2, 3, 4].map((i) => ({ src: `galeria/salao-${i}.webp`, alt: `Ilustração de exemplo: bancada ${i} do salão, com espelho e luz.`, legenda: `Ilustração de exemplo: bancada ${i}.`, largura: 1024, altura: 1280 }));

test('v1.3: galeria de demonstração aceita "Ilustração de exemplo" e o motor mantém o rótulo, sem prefixo duplicado', () => {
  const t = fixture('tenant.entregue.valido.json');
  const r = validarTenant(Object.assign({}, t, { slug: 'demo-salao', nicho: t.nicho, galeria: ILUSTRACOES }));
  assert.deepEqual(r.erros.filter((e) => e.campo.startsWith('galeria')), [], 'demo com ilustração da casa é válida');
  const semAcento = validarTenant(Object.assign({}, t, { slug: 'demo-salao', galeria: ILUSTRACOES.map((g) => Object.assign({}, g, { alt: g.alt.replace('Ilustração', 'ilustracao') })) }));
  assert.deepEqual(semAcento.erros.filter((e) => e.campo.startsWith('galeria')), [], 'comparação sem acento e sem caixa');
  const M = motorV1();
  const g = M._puro.galeriaDe({ galeria: ILUSTRACOES }, true, false);
  assert.equal(g.length, 4);
  for (const [i, x] of g.entries()) {
    assert.equal(x.rotulo, 'Ilustração de exemplo');
    assert.equal(x.alt, ILUSTRACOES[i].alt, 'alt fica como veio');
    assert.equal(x.legenda, ILUSTRACOES[i].legenda, 'legenda fica como veio');
    assert.doesNotMatch(x.alt + x.legenda, /foto de exemplo/i, 'desenho nunca é chamado de foto');
    assert.deepEqual([x.largura, x.altura], [1024, 1280]);
  }
  const f = M._puro.galeriaDe({ galeria: GALERIA.map((x) => Object.assign({}, x, { alt: 'Cadeira de couro', legenda: '' })) }, true, false);
  assert.ok(f.every((x) => x.rotulo === 'Foto de exemplo' && x.alt === 'Foto de exemplo: cadeira de couro' && x.legenda === 'Foto de exemplo'), 'sem rótulo no texto, entra "Foto de exemplo"');
  const cli = M._puro.galeriaDe({ galeria: GALERIA.map((x) => Object.assign({}, x, { alt: 'Cadeira de couro' })) }, false, false);
  assert.ok(cli.every((x) => x.rotulo === '' && x.alt === 'Cadeira de couro'), 'site de cliente sem rótulo de exemplo');
});

test('v1.3: preço zero aparece como "Grátis" e o fecho de reserva não promete prazo', () => {
  const M = motorV1();
  assert.equal(M._puro.moeda(0), 'Grátis');
  assert.match(M._puro.moeda(45), /^R\$\s45$/);
  assert.equal(M._puro.moeda(null), 'sob consulta');
  const t = fixture('tenant.entregue.valido.json');
  t.servicos = [Object.assign({}, t.servicos[0], { preco: 0 })].concat(t.servicos.slice(1));
  const e = M.construirEstado(t, { site: {} });
  assert.equal(e.servicos[0].precoTexto, 'Grátis');
  assert.doesNotMatch(e.servicos.map((s) => s.precoTexto).join('|'), /R\$\s?0(?!\d)/);
  const semFecho = M.construirEstado(fixture('tenant.entregue.valido.json'), { site: { home: HOME, demonstracao: true } }).fecho;
  assert.equal(semFecho.titulo, 'Este site, com o nome do seu negócio, pronto para você aprovar.');
  assert.doesNotMatch(semFecho.titulo, /em horas|no ar/, 'regra única de prazo: aprovar em até 72 h vem do build');
});

/* achado da conferência (onda 3): regerar as demos pela esteira real tem de reproduzir preços e nota */
test('v1.3: demos/extras-<nicho>.json com precos repõe os preços de exemplo e a nota "Preços de exemplo"', () => {
  const { tenantDoPedido, extrasDaDemo, NOTA_DEMO_PRECO, NOTA_SEM_PRECO } = require(path.join(RAIZ, 'scripts', 'producao', 'lib', 'tenant.cjs'));
  const C = require(path.join(RAIZ, 'scripts', 'producao', 'lib', 'comum.cjs'));
  const P = require(path.join(RAIZ, 'scripts', 'producao', 'lib', 'pedido.cjs'));
  const d = path.join(TMP, 'extras-precos'); fs.mkdirSync(d, { recursive: true });
  for (const k of ['barbearia', 'salao', 'academia']) {
    const repo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'sites', `demo-${k}`, 'tenant.json'), 'utf8'));
    const precos = Object.fromEntries(repo.servicos.map((s) => [s.id, s.preco]));
    fs.writeFileSync(path.join(d, `extras-${k}.json`), JSON.stringify({ precos }));
    const pedido = P.validarPedido(P.lerPedidoArquivo(path.join(DEMOS, `pedido-${k}.txt`)));
    const opc = { agora: new Date('2026-11-10T12:00:00Z'), slug: `demo-${k}`, demonstracao: true, pastaExtras: d };
    const t = tenantDoPedido(pedido, C.carregarPreset(k), opc);
    assert.deepEqual(t.servicos.map((s) => [s.id, s.preco]), repo.servicos.map((s) => [s.id, s.preco]), k);
    assert.equal(t.textos.servicosNota, NOTA_DEMO_PRECO, k);
    assert.equal(t.textos.servicosNota, repo.textos.servicosNota, k + ': nota igual à do repositório');
    assert.ok(!('precos' in t), 'precos não vira campo do tenant');
    const cli = tenantDoPedido(pedido, C.carregarPreset(k), { agora: opc.agora, pastaExtras: d });
    assert.ok(cli.servicos.every((s) => s.preco === null) && cli.textos.servicosNota === NOTA_SEM_PRECO, k + ': cliente nunca lê precos de exemplo');
  }
  fs.writeFileSync(path.join(d, 'extras-barbearia.json'), JSON.stringify({ precos: { corte: -1 } }));
  assert.throws(() => extrasDaDemo('barbearia', d), /precos\.corte/);
  fs.writeFileSync(path.join(d, 'extras-barbearia.json'), JSON.stringify({ precos: { 'nao-existe': 10 } }));
  const pedido = P.validarPedido(P.lerPedidoArquivo(path.join(DEMOS, 'pedido-barbearia.txt')));
  assert.throws(() => tenantDoPedido(pedido, C.carregarPreset('barbearia'), { slug: 'demo-barbearia', demonstracao: true, pastaExtras: d }), /nao-existe/);
});

for (const k of ['barbearia', 'salao', 'academia']) {
  const extras = (() => { try { return JSON.parse(fs.readFileSync(path.join(DEMOS, `extras-${k}.json`), 'utf8')); } catch (e) { return {}; } })();
  const falta = !extras.precos ? `demos/extras-${k}.json ainda sem "precos" (pedido ao pacote 3E)` : false;
  test(`demo-${k}: regerar pela esteira real reproduz servicos e textos de sites/demo-${k}/tenant.json`, { skip: falta }, () => {
    const saida = path.join(TMP, 'regen');
    copiarGaleria(k, saida);
    const e = Object.assign({}, process.env, { CREAT_CAMBIO: '5.4', CREAT_SILENCIO: '1' });
    delete e.ANTHROPIC_API_KEY; delete e.CREAT_URL_SITES; delete e.CREAT_HOME; delete e.CREAT_IA_FIXTURE;
    const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'producao', 'produzir.mjs'),
      '--pedido', path.join(DEMOS, `pedido-${k}.txt`), '--fixture-ia', path.join(DEMOS, `resposta-ia-${k}.json`),
      '--slug', `demo-${k}`, '--saida', saida, '--sem-sair', '--demonstracao', '--sem-navegador',
      '--url', `https://creat-nuvem-404b1994.base44.app/sites/demo-${k}/`, '--home', HOME], { env: e, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr + r.stdout);
    const novo = JSON.parse(fs.readFileSync(path.join(saida, 'dist', `demo-${k}`, 'tenant.json'), 'utf8'));
    const repo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'sites', `demo-${k}`, 'tenant.json'), 'utf8'));
    assert.deepEqual(novo.servicos, repo.servicos);
    assert.deepEqual(novo.textos, repo.textos);
    assert.deepEqual(novo.galeria, repo.galeria);
  });
}

test('v1.3: site de cliente nunca herda galeria nem recados do preset; a demo lê demos/extras-<nicho>.json', () => {
  const { tenantDoPedido, extrasDaDemo } = require(path.join(RAIZ, 'scripts', 'producao', 'lib', 'tenant.cjs'));
  const C = require(path.join(RAIZ, 'scripts', 'producao', 'lib', 'comum.cjs'));
  const preset = JSON.parse(JSON.stringify(C.carregarPreset('barbearia')));
  preset.tenantBase.galeria = GALERIA; preset.tenantBase.recados = [{ texto: 'x', autor: 'y' }];
  const P = require(path.join(RAIZ, 'scripts', 'producao', 'lib', 'pedido.cjs'));
  const pedido = P.validarPedido(P.lerPedidoArquivo(path.join(DEMOS, 'pedido-barbearia.txt')));
  const t = tenantDoPedido(pedido, preset, { agora: new Date('2026-11-10T12:00:00Z') });
  assert.ok(!('galeria' in t), 'cliente sem galeria do preset'); assert.ok(!('recados' in t));
  const prev = motorV1().montarTenantPrevia(preset, { nome: 'X Teste', agora: new Date() });
  assert.ok(!('galeria' in prev) && !('recados' in prev), 'prévia sem galeria nem recados do preset');
  const d = path.join(TMP, 'extras'); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'extras-barbearia.json'), JSON.stringify({ galeria: GALERIA, fuso: 'America/Bahia' }));
  assert.deepEqual(extrasDaDemo('barbearia', d), { galeria: GALERIA, fuso: 'America/Bahia' });
  assert.deepEqual(extrasDaDemo('salao', d), {}, 'sem arquivo, nada');
  fs.writeFileSync(path.join(d, 'extras-academia.json'), JSON.stringify({ avaliacoes: [] }));
  assert.throws(() => extrasDaDemo('academia', d), /fora da lista/);
});

test('v1.3: compra do nicho (faixa, fecho, espelho e rodapé) com utm; site de cliente segue para a home sem nicho', () => {
  const M = motorV1();
  const t = fixture('tenant.entregue.valido.json');
  const fecho = { titulo: 'Título do build', linha: 'Linha de preço do build', botao: 'Quero o meu' };
  const d = M.construirEstado(t, { site: { home: HOME, demonstracao: true, fecho } });
  assert.equal(d.demoHref, HOME + '/?nicho=barbearia&utm_source=demo&utm_medium=ref&utm_campaign=demo-v1&utm_content=barbearia');
  assert.equal(d.fechoHref, d.demoHref);
  assert.deepEqual(d.fecho, Object.assign({ href: d.demoHref }, fecho));
  assert.equal(d.rodape.href, HOME + '/?nicho=barbearia&utm_source=rodape&utm_medium=ref&utm_campaign=rodape-v1&utm_content=barbearia');
  const semFecho = M.construirEstado(t, { site: { home: HOME, demonstracao: true } }).fecho;
  assert.equal(semFecho.linha, '', 'sem dados/precos.json, o fecho sai sem preço (nunca preço à mão)');
  assert.ok(semFecho.titulo && semFecho.botao);
  const c = M.construirEstado(t, { site: { home: HOME, fecho } });
  assert.equal(c.fecho, null); assert.equal(c.demoHref, '');
  assert.match(c.rodape.href, /^https:\/\/creat-nuvem-404b1994\.base44\.app\?utm_source=rodape/);
  assert.equal(M._puro.hrefCompra('javascript:alert(1)', 'salao'), '');
  assert.equal(M._puro.hrefCompra(HOME + '/?x=1#y', 'salao'), HOME + '/?nicho=salao&utm_source=demo&utm_medium=ref&utm_campaign=demo-v1&utm_content=salao');
  assert.ok(!/nicho=/.test(M._puro.hrefCompra(HOME, 'evil"x')));
  assert.match(M.scriptTenant(t, { home: HOME, demonstracao: true, fecho }), /"fecho":\{"titulo":"Título do build"/);
  assert.doesNotMatch(M.scriptTenant(t, { home: HOME, fecho }), /fecho/, 'site de cliente não leva fecho');
  assert.doesNotMatch(M.scriptTenant(t, { home: HOME, demonstracao: true, fecho: { titulo: '<script>' } }), /<script>/);
});

test('v1.3: relógio do negócio (America/Bahia) e letreiro curto, sem prometer horário que o dia não tem', () => {
  const M = motorV1();
  const t = fixture('tenant.entregue.valido.json');
  delete t.negocio.endereco.uf;                                   // sem UF e sem fuso: America/Bahia
  const base = new Date('2026-11-14T19:45:00Z');                  // sábado 16h45 na Bahia, 15h45 em Manaus
  const a = M.agoraNoNegocio(t, base);
  assert.deepEqual([a.ano, a.mes, a.dia, a.hora, a.minuto, a.diaSemana, a.fuso], [2026, 11, 14, 16, 45, 6, 'America/Bahia']);
  assert.equal(M.agoraNoNegocio({ fuso: 'America/Manaus' }, base).hora, 15);
  assert.equal(M.agoraNoNegocio({ negocio: { endereco: { uf: 'SP' } } }, base).fuso, 'America/Sao_Paulo');
  const e = M.construirEstado(t, { site: {} });
  assert.equal(e.fuso, 'America/Bahia');
  const L = (iso) => M._puro.calcularLetreiro(e.funcionamento, e.textos, M.agoraNoNegocio(t, new Date(iso)), e.servicos);
  assert.deepEqual(L('2026-11-14T20:30:00Z'), { estado: 'aberto', texto: 'Aberto · peça para terça às 9h' }, 'SAL-N4: sábado 17h30, fecha às 18h');
  assert.deepEqual(L('2026-11-14T19:45:00Z'), { estado: 'aberto', texto: 'Aberto até 18h' });
  assert.deepEqual(L('2026-11-10T15:00:00Z'), { estado: 'aberto', texto: 'Aberto até 20h' });
  assert.deepEqual(L('2026-11-10T10:00:00Z'), { estado: 'fechado', texto: 'Abre às 9h' });
  assert.deepEqual(L('2026-11-14T22:00:00Z'), { estado: 'fechado', texto: 'Abre terça às 9h' });
  const curto = JSON.parse(JSON.stringify(e)); curto.textos.letreiroAberto = 'Porta aberta';
  assert.equal(M._puro.calcularLetreiro(curto.funcionamento, curto.textos, M.agoraNoNegocio(t, new Date('2026-11-10T15:00:00Z')), curto.servicos).texto, 'Porta aberta', 'texto curto do tenant vale');
});

test('v1.3: horário com dia minúsculo no meio e textos da demonstração sem "o dono confirma"', () => {
  const M = motorV1();
  const t = fixture('tenant.entregue.valido.json');
  const e = M.construirEstado(t, { site: {} });
  assert.deepEqual(e.linhasHorario.map((l) => l.rotulo), ['Terça a sexta', 'Sábado', 'Segunda e domingo']);
  assert.deepEqual(e.linhasHorario.map((l) => l.rotuloMinusculo), ['terça a sexta', 'sábado', 'segunda e domingo']);
  const d = M.construirEstado(t, { site: { home: HOME, demonstracao: true } });
  assert.match(d.textos.heroSubtitulo, /No site da sua barbearia, o pedido chega pronto no seu WhatsApp\. Nesta demonstração, chega no WhatsApp da Creat\.$/);
  for (const k of ['heroSubtitulo', 'pedidoNota', 'confirmacaoTexto']) assert.doesNotMatch(d.textos[k], /dono confirma/, k);
  assert.equal(e.textos.confirmacaoTexto, t.textos.confirmacaoTexto, 'site de cliente mantém o texto do tenant');
});

test('v1.3 no navegador: cliente sem galeria não tem #trabalhos nem nada da demo; demo com galeria rotulada', { skip: !temPlaywright }, async () => {
  const { buildSite } = require(path.join(RAIZ, 'scripts', 'producao', 'build-site.cjs'));
  const { chromium } = require(require.resolve('playwright', { paths: [RAIZ] }));
  const t = fixture('tenant.entregue.valido.json');
  const pasta = path.join(TMP, 'v13-tenant'); fs.mkdirSync(path.join(pasta, 'galeria'), { recursive: true });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
  for (const g of GALERIA.concat(ILUSTRACOES)) fs.writeFileSync(path.join(pasta, g.src), png);
  const cli = path.join(TMP, 'v13-cliente'), demo = path.join(TMP, 'v13-demo'), ilus = path.join(TMP, 'v13-ilustracao');
  buildSite({ tenant: t, destino: cli, saida: TMP, pastaTenant: pasta, site: { home: HOME, url: false } });
  buildSite({ tenant: Object.assign({}, t, { slug: 'demo-barbearia', galeria: GALERIA, avaliacoes: [], recados: [{ texto: 'Saí do jeito que pedi.', autor: 'Cliente' }] }), destino: demo, saida: TMP, pastaTenant: pasta, precos: null, site: { home: HOME, url: false, demonstracao: true } });
  buildSite({ tenant: Object.assign({}, t, { slug: 'demo-barbearia', galeria: ILUSTRACOES, avaliacoes: [] }), destino: ilus, saida: TMP, pastaTenant: pasta, precos: null, site: { home: HOME, url: false, demonstracao: true } });
  const nav = await chromium.launch();
  try {
    const pg = await nav.newPage({ viewport: { width: 390, height: 844 } });
    const erros = []; pg.on('pageerror', (e) => erros.push(String(e)));
    const ler = () => pg.evaluate(() => ({
      trabalhos: !!document.getElementById('trabalhos'), fecho: !!document.querySelector('.fecho-demo'), faixa: !!document.querySelector('.faixa-demo'),
      ordem: [...document.querySelectorAll('main > section')].map((s) => s.id), fotos: [...document.querySelectorAll('#trabalhos figure.foto img')].map((i) => [i.getAttribute('alt'), i.getAttribute('loading'), i.getAttribute('width')]),
      selos: document.querySelectorAll('#trabalhos .selo-foto').length, textoSelos: [...document.querySelectorAll('#trabalhos .selo-foto')].map((x) => x.textContent), legenda: (document.querySelector('#trabalhos figcaption') || {}).textContent || '',
      recados: (document.querySelector('#recados') || {}).textContent || '', pedirEste: document.querySelectorAll('#lista-precos a.pedir-este').length,
      rodapeHorario: (document.querySelector('.rodape-horario') || {}).textContent || '', rodapeWhats: !!document.querySelector('.rodape-whats a.link-whats-rodape'),
      som: localStorage.getItem('site:' + window.TENANT.slug + ':som'), scroll: document.documentElement.scrollWidth
    }));
    await pg.goto(pathToFileURL(path.join(cli, 'index.html')).href);
    await pg.waitForFunction(() => document.documentElement.classList.contains('motor-pronto'));
    const c = await ler();
    assert.equal(c.trabalhos, false, 'cliente sem galeria não gera seção');
    assert.equal(c.fecho || c.faixa, false, 'nada da demonstração no site do cliente');
    assert.ok(c.ordem.indexOf('servicos') < c.ordem.indexOf('pedir'), 'tabela antes do pedido: ' + c.ordem);
    assert.equal(c.pedirEste, t.servicos.length);
    assert.ok(!/ · $/.test(c.rodapeHorario.trim()) && c.rodapeWhats, 'horário e WhatsApp em parágrafos separados');
    assert.equal(c.som, 'off', 'som desligado por padrão');
    assert.ok(c.scroll <= 390);
    assert.ok(!fs.existsSync(path.join(cli, 'galeria')), 'sem galeria, a pasta não existe');
    await pg.goto(pathToFileURL(path.join(demo, 'index.html')).href);
    await pg.waitForFunction(() => document.documentElement.classList.contains('motor-pronto'));
    const d = await ler();
    assert.equal(d.trabalhos, true);
    assert.deepEqual(d.ordem.filter((x) => ['servicos', 'trabalhos', 'pedir', 'onde'].includes(x)), ['servicos', 'trabalhos', 'pedir', 'onde']);
    assert.equal(d.fotos.length, 3); assert.equal(d.selos, 3);
    for (const [alt, loading, w] of d.fotos) { assert.match(alt, /^Foto de exemplo/); assert.equal(loading, 'lazy'); assert.ok(+w > 0); }
    assert.match(d.legenda, /^Foto de exemplo/);
    assert.match(d.recados, /recado de exemplo/);
    assert.equal(d.fecho && d.faixa, true);
    assert.match(d.rodapeHorario, /^Horário de exemplo: terça a sexta, 9h às 20h · sábado, 9h às 18h$/);
    assert.deepEqual(d.textoSelos, ['Foto de exemplo', 'Foto de exemplo', 'Foto de exemplo']);
    await pg.goto(pathToFileURL(path.join(ilus, 'index.html')).href);
    await pg.waitForFunction(() => document.documentElement.classList.contains('motor-pronto'));
    const il = await ler();
    assert.equal(il.trabalhos, true);
    assert.deepEqual(il.fotos.map((f) => f[0]), ILUSTRACOES.map((g) => g.alt), 'alt da ilustração sem "Foto de exemplo:" na frente');
    assert.ok(il.fotos.every((f) => f[1] === 'lazy' && f[2] === '1024'));
    assert.deepEqual(il.textoSelos, ILUSTRACOES.map(() => 'Ilustração de exemplo'), 'selo diz o que a imagem é');
    assert.equal(il.legenda, ILUSTRACOES[0].legenda);
    assert.ok(il.scroll <= 390);
    assert.deepEqual(erros, []);
  } finally { await nav.close(); }
});

test.after(() => { if (!process.env.CREAT_TESTE_MANTER) fs.rmSync(TMP, { recursive: true, force: true }); });
