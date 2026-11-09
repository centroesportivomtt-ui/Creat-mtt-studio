#!/usr/bin/env node
// Renderiza os estáticos em PNG no tamanho exato. node renderizar.cjs [--guia]
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const RAIZ = path.resolve(__dirname, '../../..'), SAIDA = path.resolve(__dirname, '../saida');
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp' };
const PECAS = [['feed-1080x1080.html','S1-placa-porta-1080x1080.png',1080,1080],['stories-1080x1920.html','S2-placa-porta-1080x1920.png',1080,1920]];
const guia = process.argv.includes('--guia');
const srv = http.createServer((q, r) => { const f = path.join(RAIZ, decodeURIComponent(new URL(q.url,'http://x').pathname)); if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r); });
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const b = await chromium.launch();
  for (const [html, png, w, h] of PECAS) {
    const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    const erros = []; pg.on('pageerror', e => erros.push(e.message)); pg.on('console', m => m.type() === 'error' && erros.push(m.text()));
    await pg.goto('http://127.0.0.1:' + srv.address().port + '/marketing/trafego/estaticos/' + html, { waitUntil: 'networkidle' });
    await pg.waitForSelector('html[data-pronto="1"]', { timeout: 15000 });
    if (guia) await pg.evaluate(() => document.body.classList.add('com-guia'));
    await pg.waitForTimeout(300);
    const out = path.join(SAIDA, guia ? png.replace('.png', '-guia.png') : png);
    await (await pg.$('#peca')).screenshot({ path: out });
    console.log(out, erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros');
  }
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
