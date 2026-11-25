#!/usr/bin/env node
/* =====================================================================
   Porta Aberta · scripts/montar-local.cjs (Pixel)
   Teste local da home com os sites que ela linka, no mesmo desenho do ar:
     dist/local/            = cópia de dist/publico/ (a vitrine)
     dist/local/sites/<slug>/ = cópia de dist/<slug>/ (o build do site)
   Assim os cartões "sites/demo-(nicho)/" da home abrem um site de verdade também
   fora do ar. (projetos/creat-nuvem/sites/<slug>/ guarda só os artefatos da
   produção: pedido, RELATORIO, print; não tem index.html, e é por isso que
   a home aberta direto do repositório não acha os demos.)

   Uso (a partir de projetos/creat-nuvem/):
     node scripts/montar-publico.cjs && node scripts/montar-local.cjs
     node ../../.claude/skills/navegador/navegar.cjs abrir dist/local --cdn-local --celular
   dist/ não vai para o git; dist/local/ nunca é publicado (só dist/publico/ e dist/<slug>/).
   Código: 0 ok · 1 falta dist/publico ou o build de algum site linkado.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { slugsDaVitrine } = require('./conferir-sites-no-ar.cjs');

const PROJETO = path.resolve(__dirname, '..');
const PUBLICO = path.join(PROJETO, 'dist', 'publico');
const LOCAL = path.join(PROJETO, 'dist', 'local');

if (!fs.existsSync(path.join(PUBLICO, 'index.html'))) { console.error('FALHA  dist/publico/ não existe: rode antes node scripts/montar-publico.cjs'); process.exit(1); }
const slugs = slugsDaVitrine(PUBLICO);
const faltam = slugs.filter((s) => !fs.existsSync(path.join(PROJETO, 'dist', s, 'index.html')));
if (faltam.length) { console.error(`FALHA  falta o build de: ${faltam.join(', ')} (rode npm run produzir -- --pedido demos/pedido-<k>.txt --fixture-ia demos/resposta-ia-<k>.json --slug <slug> --sem-sair --demonstracao)`); process.exit(1); }
fs.rmSync(LOCAL, { recursive: true, force: true });
fs.cpSync(PUBLICO, LOCAL, { recursive: true });
for (const s of slugs) fs.cpSync(path.join(PROJETO, 'dist', s), path.join(LOCAL, 'sites', s), { recursive: true });
console.log(`ok     dist/local/ = vitrine + ${slugs.length} site(s) em sites/: ${slugs.join(' ') || '(nenhum)'}`);
