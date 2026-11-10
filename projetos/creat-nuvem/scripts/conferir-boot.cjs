#!/usr/bin/env node
/*
 * scripts/conferir-boot.cjs · trava do início do motor em rede real (10/11/2026)
 *
 * Por quê: os sites carregam motor.js, efeito.js, som.js e agendamento.js com defer. Em localhost os
 * quatro chegam juntos e tudo funciona; na hospedagem, com latência, o motor iniciava antes de efeito.js
 * e agendamento.js, e o site abria SEM o gesto do nicho e SEM o formulário de pedido. Teste local sem
 * atraso não pega esse defeito. Esta trava serve cada dist/<slug>/ com atraso nos scripts que chegam
 * depois do motor e falha se o formulário ou o palco do gesto não aparecerem.
 *
 * Uso: node scripts/conferir-boot.cjs [slug ...]   (padrão: demo-barbearia demo-salao demo-academia)
 * Rode antes de publicar qualquer site ou mudança em motor/. Saída 0 = ok, 1 = defeito, 2 = ambiente.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml' };
const LENTOS = /\/motor\/v1\/(efeito|som|agendamento)\.js$/;
const ATRASOS = [0, 350, 900];

function servir(pasta, atraso) {
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const arq = path.join(pasta, p);
    if (!arq.startsWith(pasta) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end('404'); }
    const mandar = () => { res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(arq).pipe(res); };
    if (atraso && LENTOS.test(p)) setTimeout(mandar, atraso); else mandar();
  });
}

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.error('erro   playwright ausente'); process.exit(2); }
  const slugs = process.argv.slice(2).length ? process.argv.slice(2) : ['demo-barbearia', 'demo-salao', 'demo-academia'];
  const nav = await chromium.launch();
  let falhas = 0;
  for (const slug of slugs) {
    const pasta = path.join(RAIZ, 'dist', slug);
    if (!fs.existsSync(path.join(pasta, 'index.html'))) { console.error(`erro   dist/${slug}/ não existe: rode build-site antes`); falhas++; continue; }
    for (const atraso of ATRASOS) {
      const srv = servir(pasta, atraso);
      await new Promise(r => srv.listen(0, '127.0.0.1', r));
      const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const pg = await ctx.newPage();
      const erros = [];
      pg.on('console', m => { if (m.type() === 'error') erros.push(m.text().slice(0, 120)); });
      pg.on('pageerror', e => erros.push(String(e).slice(0, 120)));
      await pg.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: 'load' });
      await pg.waitForTimeout(1200);
      const r = await pg.evaluate(() => ({
        pronto: document.documentElement.classList.contains('motor-pronto'),
        campos: document.querySelectorAll('#pedir-corpo input, #pedir-corpo button, #pedir-corpo select').length,
        palco: !!document.querySelector('#heroi canvas, #heroi svg, #heroi [data-ritual]'),
        whats: document.querySelectorAll('a[href*="wa.me"]').length
      }));
      const ok = r.pronto && r.campos > 0 && r.palco && !erros.length;
      console.log(`${ok ? 'ok    ' : 'FALHA '} ${slug} | atraso ${atraso} ms | pronto ${r.pronto} | campos do pedido ${r.campos} | gesto no herói ${r.palco} | wa.me ${r.whats}${erros.length ? ' | erros: ' + erros.join(' ; ') : ''}`);
      if (!ok) falhas++;
      await ctx.close(); srv.close();
    }
  }
  await nav.close();
  if (falhas) { console.error(`\n${falhas} falha(s): NÃO publique.`); process.exit(1); }
  console.log('\nok     o motor inicia inteiro com e sem atraso de rede. Pode publicar.');
})();
