#!/usr/bin/env node
// rodar-tudo.mjs · um comando para provar o app Trilhas de Itaitu (Trilho, devops, T12, 20/11/2026).
//
//   node projetos/itaitu-mapa/testes/rodar-tudo.mjs            (tudo, ~4 min)
//   node projetos/itaitu-mapa/testes/rodar-tudo.mjs --rapido   (pula a demo de 60 s)
//
// Ordem:
//   1. node --test dos testes do motor, das regras, dos textos e do pacote (testes/*.test.mjs)
//   2. pré-cache: precache.json bate com os arquivos de site/itaitu (mesmo hash) e nenhum arquivo citado
//      por import, link, src, url() ou fetch no código fica fora dele
//   3. sobe `python3 -m http.server` em site/ numa porta livre
//   4. conferir-app.cjs contra essa porta (celular Android emulado, online e offline)
//   5. comparar-com-app.cjs contra a mesma porta (horas da tela x cálculo independente)
// Código de saída: 0 só se todas as etapas passaram.
// Sem dependência nova: Node 22, Playwright e Chromium da sessão, python3.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../../..');
const SITE = path.join(RAIZ, 'site');
const APP = path.join(SITE, 'itaitu');
const RAPIDO = process.argv.includes('--rapido');

const etapas = [];
const marcar = (nome, passou, detalhe = '') => { etapas.push({ nome, passou, detalhe }); console.log(`\n== ${passou ? 'ok    ' : 'falhou'} ${nome}${detalhe ? ' · ' + detalhe : ''}\n`); };

function rodar(cmd, args, opcoes = {}) {
  console.log(`\n$ ${[cmd, ...args].join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: RAIZ, stdio: 'inherit', ...opcoes });
  return r.status === 0;
}

// ---------------------------------------------------------------- 1. testes de unidade
marcar('node --test (motor, regras, textos, pacote)', rodar(process.execPath, ['--test', 'projetos/itaitu-mapa/testes/*.test.mjs']));

// ---------------------------------------------------------------- 2. pré-cache
function conferirPrecache() {
  const lista = JSON.parse(fs.readFileSync(path.join(APP, 'precache.json'), 'utf8'));
  const porUrl = new Map(lista.arquivos.map((a) => [a.url, a]));
  const problemas = [];
  // mesmas regras do gerar-precache.mjs
  const FORA = new Set(['sw.js', 'precache.json']);
  const varrer = (d, out = []) => { for (const n of fs.readdirSync(d).sort()) { if (n.startsWith('.')) continue; const a = path.join(d, n); if (fs.statSync(a).isDirectory()) varrer(a, out); else out.push(a); } return out; };
  const noDisco = new Set();
  for (const abs of varrer(APP)) {
    const url = path.relative(APP, abs).split(path.sep).join('/');
    if (FORA.has(url) || ['.md', '.map', '.parcial'].some((e) => url.endsWith(e))) continue;
    noDisco.add(url);
    const item = porUrl.get(url);
    if (!item) { problemas.push(`fora da lista: ${url}`); continue; }
    const hash = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 16);
    if (hash !== item.hash) problemas.push(`hash velho: ${url}`);
  }
  for (const u of porUrl.keys()) if (!noDisco.has(u)) problemas.push(`na lista mas não existe: ${u}`);
  // sw.js tem de mudar de bytes quando a lista muda (senão o navegador não reinstala o SW)
  const vSw = (/const VERSAO_DA_LISTA = '([0-9a-f]+)'/.exec(fs.readFileSync(path.join(APP, 'sw.js'), 'utf8')) || [])[1];
  if (vSw !== lista.versao) problemas.push(`sw.js VERSAO_DA_LISTA '${vSw}' != precache.json '${lista.versao}' (troque a linha no sw.js)`);

  // referências relativas no código (comentários fora)
  const EXT = 'js|mjs|css|json|geojson|png|svg|woff2|webmanifest|html|txt|jpg|webp|pbf';
  const re = new RegExp(`["'\`(]((?:\\.{1,2}/)?[A-Za-z0-9_\\-./]+\\.(?:${EXT}))(?:[#?][^"'\`)]*)?["'\`)]`, 'g');
  const semComentario = (t, ext) => (ext === '.html' ? t.replace(/<!--[\s\S]*?-->/g, '') : t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1'));
  const opcionais = new Set(['dados/recorte.json']);   // app.js só pede se estiver na lista (ARQUITETURA 7.0)
  let refs = 0;
  for (const abs of varrer(APP)) {
    const rel = path.relative(APP, abs).split(path.sep).join('/');
    if (!/\.(js|mjs|html|css|webmanifest)$/.test(rel) || rel.startsWith('tiles/') || /^vendor\/(maplibre|qrcode)/.test(rel)) continue;
    const t = semComentario(fs.readFileSync(abs, 'utf8'), path.extname(abs));
    let m;
    while ((m = re.exec(t))) {
      const r = m[1];
      refs++;
      const c1 = path.relative(APP, path.resolve(path.dirname(abs), r)).split(path.sep).join('/');
      const c2 = path.relative(APP, path.resolve(APP, r)).split(path.sep).join('/');
      if ([c1, c2].some((c) => porUrl.has(c) || c === 'sw.js' || c === 'precache.json' || opcionais.has(c))) continue;
      problemas.push(`referência fora do pré-cache: ${rel} -> ${r}`);
    }
  }
  console.log(`precache.json versao ${lista.versao}: ${lista.arquivos.length} arquivos, ${(lista.bytes_total / 1048576).toFixed(2)} MB; ${refs} referências relativas conferidas`);
  for (const p of problemas.slice(0, 20)) console.log(`  ${p}`);
  if (problemas.length) console.log('  corrija com: node projetos/itaitu-mapa/scripts/gerar-precache.mjs');
  return problemas.length === 0;
}
marcar('pré-cache completo e atualizado', conferirPrecache());

// ---------------------------------------------------------------- 3. servidor
function portaLivre() {
  return new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}
const porta = await portaLivre();
const servidor = spawn('python3', ['-m', 'http.server', String(porta), '--bind', '127.0.0.1'], { cwd: SITE, stdio: 'ignore' });
const BASE = `http://127.0.0.1:${porta}/itaitu/`;
let no_ar = false;
for (let i = 0; i < 100 && !no_ar; i++) {
  try { no_ar = (await fetch(BASE + 'precache.json')).ok; } catch (_) { await new Promise((r) => setTimeout(r, 100)); }
}
marcar(`python3 -m http.server em ${BASE}`, no_ar);

const rodarAsync = (cmd, args) => new Promise((res) => {
  console.log(`\n$ ${[cmd, ...args].join(' ')}`);
  const p = spawn(cmd, args, { cwd: RAIZ, stdio: 'inherit' });
  p.on('close', (c) => res(c === 0));
});
try {
  if (no_ar) {
    marcar('conferir-app.cjs (celular Android, online e offline)', await rodarAsync(process.execPath, ['projetos/itaitu-mapa/testes/conferir-app.cjs', BASE, ...(RAPIDO ? ['--sem-demo'] : [])]));
    marcar('comparar-com-app.cjs (horas da tela x referência)', await rodarAsync(process.execPath, ['projetos/itaitu-mapa/testes/comparar-com-app.cjs', BASE]));
  }
} finally {
  servidor.kill();
}

console.log('\n================ resumo');
for (const e of etapas) console.log(`${e.passou ? 'ok    ' : 'falhou'}  ${e.nome}`);
const ruins = etapas.filter((e) => !e.passou).length;
console.log(ruins ? `\nRESULTADO: ${ruins} etapa(s) falharam` : '\nRESULTADO: tudo passou');
process.exitCode = ruins ? 1 : 0;
