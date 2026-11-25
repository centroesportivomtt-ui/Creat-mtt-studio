#!/usr/bin/env node
// Prints reais da prévia para os estáticos G3 a G6 (Paleta, 10/11/2026).
// Só lê o site; grava em ../saida/prints-ganchos/. node capturar-ganchos.cjs
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const RAIZ = path.resolve(__dirname, '../../..'), SAIDA = path.resolve(__dirname, '../saida/prints-ganchos');
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav' };
const srv = http.createServer((req, res) => {
  let f = path.join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(RAIZ)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const ALVOS = [['barbearia','barbearia','Barbearia Navalha'],['salao','salao','Salão Íris'],['academia','academia','Studio Ferro'],['esmalteria','salao','Esmalteria Lírio']];
const escuro = process.argv.includes('--escuro');
const li = process.argv.indexOf('--largura'), largura = li > -1 ? +process.argv[li + 1] : 390;
const so = process.argv.indexOf('--so') > -1 ? process.argv[process.argv.indexOf('--so') + 1] : '';
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  fs.mkdirSync(SAIDA, { recursive: true });
  const b = await chromium.launch();
  for (const [arq, k, n] of ALVOS) {
    if (so && so !== arq) continue;
    const ctx = await b.newContext({ viewport: { width: largura, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: escuro ? 'dark' : 'light', reducedMotion: 'reduce' });
    const pg = await ctx.newPage();
    await pg.goto(base + 'previa/#k=' + k + '&n=' + encodeURIComponent(n) + '&p=1', { waitUntil: 'networkidle' });
    await pg.waitForTimeout(2500);
    await pg.evaluate(() => window.scrollTo(0, 0)); await pg.waitForTimeout(600);
    await pg.screenshot({ path: path.join(SAIDA, arq + (escuro ? '-escuro' : '') + (largura !== 390 ? '-' + largura : '') + '-topo.png') });
    await pg.screenshot({ path: path.join(SAIDA, arq + (escuro ? '-escuro' : '') + (largura !== 390 ? '-' + largura : '') + '-inteira.png'), fullPage: true });
    await ctx.close();
  }
  await b.close(); srv.close(); console.log('ok ->', SAIDA);
})().catch(e => { console.error(e); process.exit(1); });
