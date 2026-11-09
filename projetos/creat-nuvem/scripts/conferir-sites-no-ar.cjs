#!/usr/bin/env node
/* =====================================================================
   Porta Aberta · scripts/conferir-sites-no-ar.cjs (Pixel)
   Trava de ordem do deploy: "sites primeiro, vitrine depois".

   A vitrine (dist/publico/index.html) linka sites/<slug>/ (os sites-demonstração).
   Se ela subir antes deles, os botões da página de vendas dão 404. Este script
   lê os links sites/<slug>/ das páginas de dist/publico/ e confere, NO AR, que
   cada um responde 200 (seguindo redirecionamento) e tem pelo menos um wa.me.
   Para demo-*: exige também a faixa "demonstração · nome fictício".

   Uso (a partir de projetos/creat-nuvem/):
     node scripts/conferir-sites-no-ar.cjs                 # base padrão
     node scripts/conferir-sites-no-ar.cjs --base https://outro.host
     node scripts/conferir-sites-no-ar.cjs --slugs demo-salao,demo-academia
     node scripts/conferir-sites-no-ar.cjs --listar        # só lista os slugs, sem rede

   Rede por curl (respeita HTTPS_PROXY do ambiente; o fetch do Node 22 não).
   Código: 0 todos 200 · 1 algum site fora do ar · 2 ambiente (sem dist/publico, sem curl).
   Rode ANTES do deploy da vitrine e de novo DEPOIS (docs/PUBLICACAO.md, seção 0).
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJETO = path.resolve(__dirname, '..');
const PUBLICO = path.join(PROJETO, 'dist', 'publico');
const BASE_PADRAO = 'https://creat-nuvem-404b1994.base44.app';
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const FAIXA = /demonstra(ç|&ccedil;|\\u00e7)(ã|&atilde;|\\u00e3)o\s*·\s*nome fict(í|&iacute;|\\u00ed)cio/i;

function args(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) continue;
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    a[k.slice(2)] = v;
  }
  return a;
}

/* slugs de sites/<slug>/ linkados pelas páginas .html da vitrine montada */
function slugsDaVitrine(raiz) {
  const achados = new Set();
  (function andar(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      const st = fs.lstatSync(p);
      if (st.isDirectory()) andar(p);
      else if (/\.html$/.test(n)) {
        const html = fs.readFileSync(p, 'utf8');
        for (const m of html.matchAll(/href="(?:\.?\/)?(?:\.\.\/)*sites\/([a-z0-9-]+)\/?"/g)) if (SLUG_RE.test(m[1])) achados.add(m[1]);
      }
    }
  })(raiz);
  return [...achados].sort();
}

function baixar(url) {
  const r = spawnSync('curl', ['-sS', '-L', '--max-redirs', '3', '--max-time', '30', '-o', '-', '-w', '\n__CREAT__%{http_code} %{url_effective}', url], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (r.error) { const x = new Error('curl não encontrado'); x.codigo = 2; throw x; }
  const out = r.stdout || '';
  const i = out.lastIndexOf('\n__CREAT__');
  if (i === -1) return { status: 0, final: url, corpo: '', erro: (r.stderr || '').trim() || `curl saiu com ${r.status}` };
  const [status, final] = out.slice(i + 10).trim().split(' ');
  return { status: +status, final, corpo: out.slice(0, i), erro: (r.stderr || '').trim() };
}

function main() {
  const a = args(process.argv.slice(2));
  const base = String(typeof a.base === 'string' ? a.base : BASE_PADRAO).replace(/\/+$/, '');
  let slugs;
  if (typeof a.slugs === 'string') slugs = a.slugs.split(',').map((s) => s.trim()).filter(Boolean);
  else {
    if (!fs.existsSync(PUBLICO)) { console.error('FALHA  dist/publico/ não existe: rode antes node scripts/montar-publico.cjs'); return 2; }
    slugs = slugsDaVitrine(PUBLICO);
  }
  const ruins = slugs.filter((s) => !SLUG_RE.test(s));
  if (ruins.length) { console.error('FALHA  slug inválido: ' + ruins.join(', ')); return 2; }
  if (!slugs.length) { console.log('ok     a vitrine não linka nenhum sites/<slug>/: nada a conferir'); return 0; }
  console.log(`sites que a vitrine linka (${slugs.length}): ${slugs.join(' ')}`);
  if (a.listar) return 0;
  let falhas = 0;
  for (const slug of slugs) {
    const url = `${base}/sites/${slug}/`;
    let r;
    try { r = baixar(url); } catch (e) { console.error('FALHA  ' + e.message); return e.codigo || 2; }
    const problemas = [];
    if (r.status !== 200) problemas.push(`HTTP ${r.status || 'sem resposta'}${r.final && r.final !== url ? ` (foi para ${r.final})` : ''}${r.erro ? `: ${r.erro}` : ''}`);
    else {
      if (!/wa\.me\//.test(r.corpo)) problemas.push('a página não tem nenhum link wa.me');
      if (/^demo-/.test(slug) && !FAIXA.test(r.corpo)) problemas.push('demo sem a faixa "demonstração · nome fictício"');
    }
    if (problemas.length) { falhas++; console.log(`FALHA  ${url}  ${problemas.join(' · ')}`); }
    else console.log(`ok     ${url}  200${r.final !== url ? ` (via ${r.final})` : ''}`);
  }
  if (falhas) {
    console.log(`\n${falhas} de ${slugs.length} fora do ar. NÃO publique a vitrine: publique antes esses sites (docs/PUBLICACAO.md, seção 1).`);
    return 1;
  }
  console.log(`\nok     os ${slugs.length} sites linkados pela vitrine respondem 200. Pode publicar a vitrine.`);
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { slugsDaVitrine };
