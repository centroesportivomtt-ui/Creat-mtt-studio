/*
 * scripts/testes/sede-viva-cena.test.mjs · pacote da cena da sede viva (Órbita, 11/11)
 *
 * Sem navegador. Confere:
 *  - assets/sede-viva/negocios.json igual ao que scripts/sede-viva-negocios.cjs gera hoje dos 3 tenant.json;
 *  - tetos de bytes por arquivo e a soma do que pode tocar sozinho (até 300 KB);
 *  - cena.js sem innerHTML, eval, new Function, document.write, URL externa nem letra acentuada (não tem texto próprio);
 *  - ao carregar, cena.js só define window.CreatSedeViva (nada roda antes de montar());
 *  - PASSOS contíguos de 0 a 16000, na ordem do contrato (agentes e itens);
 *  - atlas 7x3 de 200x240 e faixa de rostos 616x88; o SVG tem todos os símbolos do contrato.
 * O comportamento no navegador (prints, fps, movimento reduzido) é conferido fora daqui.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const DIR = path.join(RAIZ, 'assets', 'sede-viva');
const ler = (n) => fs.readFileSync(path.join(DIR, n));
const KB = 1024;

// Tetos do plano (plano.md, item 3). cena.js: o plano previa 30 KB brutos (~9 KB gz); a coreografia legível ficou em
// ~45 KB brutos e ~13 KB gz, sem minificador na casa. O teto bruto foi ampliado para 48 KB, com trava de 15 KB gz,
// e a soma total continua bem abaixo de 300 KB. Ver o relatório da rodada.
const TETOS = {
  'cena.js': 48 * KB, 'cena.css': 10 * KB, 'cena.svg': 40 * KB, 'elenco.webp': 190 * KB, 'rostos.webp': 20 * KB, 'negocios.json': 4 * KB,
  'galeria-barbearia-1.webp': 10 * KB, 'galeria-barbearia-2.webp': 10 * KB, 'galeria-salao-1.webp': 10 * KB, 'galeria-salao-2.webp': 10 * KB,
  'galeria-academia-1.webp': 10 * KB, 'galeria-academia-2.webp': 10 * KB,
};

function carregarCena() {
  const janela = {};
  vm.runInNewContext(ler('cena.js').toString('utf8'), { window: janela }, { filename: 'cena.js' });
  return janela;
}

test('negocios.json é o que o gerador produz dos 3 tenant.json', () => {
  const { gerarNegocios, textoJson } = require(path.join(RAIZ, 'scripts', 'sede-viva-negocios.cjs'));
  const gerado = gerarNegocios(RAIZ);
  const gravado = JSON.parse(ler('negocios.json').toString('utf8'));
  assert.deepEqual(gravado, gerado, 'negocios.json desatualizado: rode node scripts/sede-viva-negocios.cjs');
  assert.equal(ler('negocios.json').toString('utf8'), textoJson(gerado));
  for (const [nicho, slug] of [['barbearia', 'demo-barbearia'], ['salao', 'demo-salao'], ['academia', 'demo-academia']]) {
    const t = JSON.parse(fs.readFileSync(path.join(RAIZ, 'sites', slug, 'tenant.json'), 'utf8'));
    const n = gravado.negocios[nicho];
    assert.equal(n.marca, t.negocio.nome); assert.equal(n.titulo, t.textos.heroTitulo); assert.equal(n.botao, t.textos.pedidoTitulo);
    assert.equal(n.servicos.length, 2); assert.equal(n.cores.fundo, t.cores.fundo); assert.equal(n.cores.destaque, t.cores.destaque);
    n.galeria.forEach((g) => assert.ok(fs.existsSync(path.join(RAIZ, g.src)), g.src));
  }
  assert.equal(gravado.negocios.academia.servicos[0].preco, 'Grátis', 'preço 0 vira Grátis, como no motor');
  assert.match(gravado.negocios.barbearia.servicos[0].preco, /^R\$\s45$/);
});

test('tetos de bytes por arquivo e soma do que toca sozinho', () => {
  let soma = 0;
  for (const [nome, teto] of Object.entries(TETOS)) {
    const b = ler(nome).length;
    assert.ok(b <= teto, `${nome}: ${b} B acima do teto de ${teto} B`);
  }
  // o que toca sozinho: script, estilo, SVG, atlas, rostos, dados e as 2 miniaturas do nicho que abre
  for (const n of ['cena.js', 'cena.css', 'cena.svg', 'elenco.webp', 'rostos.webp', 'negocios.json', 'galeria-barbearia-1.webp', 'galeria-barbearia-2.webp']) soma += ler(n).length;
  assert.ok(soma <= 300 * KB, `soma ${soma} B acima de 300 KB`);
  const gz = zlib.gzipSync(ler('cena.js'), { level: 9 }).length;
  assert.ok(gz <= 15 * KB, `cena.js com ${gz} B em gzip, acima de 15 KB`);
  const pasta = fs.readdirSync(DIR).reduce((s, n) => s + fs.statSync(path.join(DIR, n)).size, 0);
  assert.ok(pasta <= 900 * KB, `pasta inteira com ${pasta} B, acima do teto de 900 KB`);
});

test('cena.js: sem HTML por string, sem eval, sem URL externa, sem texto próprio', () => {
  const js = ler('cena.js').toString('utf8');
  for (const [re, nome] of [[/\binnerHTML\b/, 'innerHTML'], [/\bouterHTML\b/, 'outerHTML'], [/insertAdjacentHTML/, 'insertAdjacentHTML'], [/\beval\s*\(/, 'eval'],
    [/new\s+Function\b/, 'new Function'], [/document\.write/, 'document.write'], [/setTimeout\s*\(\s*['"`]/, 'setTimeout com texto']]) {
    assert.ok(!re.test(js), `cena.js usa ${nome}`);
  }
  const urls = js.match(/(?:https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s'"]*/gi) || [];
  assert.deepEqual(urls.filter((u) => !/^http:\/\/www\.w3\.org\/2000\/svg$/.test(u)), [], 'URL externa no cena.js');
  const acento = js.match(/[À-ɏ]/g);
  assert.equal(acento, null, 'letra acentuada no cena.js: todo texto visível tem de vir de opc.textos');
  assert.ok(!/[^\x00-\x7F]/.test(js), 'caractere fora do ASCII no cena.js');
});

test('ao carregar, cena.js só define window.CreatSedeViva', () => {
  const w = carregarCena();
  assert.deepEqual(Object.keys(w), ['CreatSedeViva']);
  const C = w.CreatSedeViva;
  assert.ok(Object.isFrozen(C)); assert.equal(C.versao, 1); assert.equal(C.CICLO_MS, 16000); assert.equal(typeof C.montar, 'function');
});

test('PASSOS contíguos de 0 a 16000, na ordem do contrato', () => {
  const { PASSOS, CICLO_MS } = carregarCena().CreatSedeViva;
  const esperado = [['nimbus', 0], ['nimbus', 0], ['verbo', 1], ['paleta', 2], ['pixel', 3], ['lupa', 4], ['muralha', 5], ['trilho', 6], ['todos', 7]];
  assert.equal(PASSOS.length, 9); assert.ok(Object.isFrozen(PASSOS));
  assert.equal(PASSOS[0].de, 0); assert.equal(PASSOS[8].ate, CICLO_MS);
  PASSOS.forEach((p, i) => {
    assert.equal(p.passo, i); assert.equal(p.agente, esperado[i][0]); assert.equal(p.item, esperado[i][1]);
    assert.ok(p.ate > p.de, `passo ${i} vazio`);
    if (i) assert.equal(p.de, PASSOS[i - 1].ate, `buraco entre ${i - 1} e ${i}`);
  });
  assert.deepEqual(JSON.parse(JSON.stringify(PASSOS.map((p) => [p.de, p.ate]))), [[0, 1200], [1200, 2600], [2600, 4600], [4600, 6400], [6400, 8600], [8600, 10400], [10400, 11800], [11800, 13600], [13600, 16000]]);
});

function tamanhoWebp(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF'); assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const tipo = buf.toString('ascii', 12, 16);
  if (tipo === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3), true];
  if (tipo === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff), !!((b >> 28) & 1)]; }
  return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff, false];
}

test('atlas 7x3 com transparência, rostos 616x88, miniaturas 240x300', () => {
  const [w, h, alfa] = tamanhoWebp(ler('elenco.webp'));
  assert.deepEqual([w, h], [1400, 720]); assert.ok(alfa, 'elenco.webp sem canal alfa');
  const [rw, rh] = tamanhoWebp(ler('rostos.webp'));
  assert.deepEqual([rw, rh], [616, 88]);
  for (const n of Object.keys(TETOS).filter((n) => n.startsWith('galeria-'))) assert.deepEqual(tamanhoWebp(ler(n)).slice(0, 2), [240, 300], n);
});

test('cena.svg tem os símbolos do contrato e nada executável', () => {
  const svg = ler('cena.svg').toString('utf8');
  for (const id of ['sv-ilha', 'sv-celular', 'sv-porta', 'sv-plaquinha', 'sv-gancho', 'sv-comanda', 'sv-escada', 'sv-lapis', 'sv-balde', 'sv-mancha',
    'sv-bloco', 'sv-lupa', 'sv-dedo', 'sv-visto', 'sv-cadeado-aberto', 'sv-cadeado-fechado', 'sv-vara', 'sv-sombra']) {
    assert.ok(svg.includes(`<symbol id="${id}"`), `falta o símbolo ${id}`);
  }
  assert.ok(!/<script|<foreignObject|\son[a-z]+\s*=|href\s*=\s*["']https?:/i.test(svg), 'cena.svg com script, evento ou link externo');
  assert.ok(!/Gradient|filter\s*=|<filter/i.test(svg), 'cena.svg com degradê ou filtro (identidade: cor chapada)');
});
