// Gate de publicação: simula a hospedagem (X-Frame-Options: DENY em tudo) e confere que a prévia e a sede
// embutidas abrem mesmo assim. Uso: node scripts/conferir-moldura.cjs (sai com 1 se algo ficar em branco).
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const RAIZ = path.resolve(__dirname, '..'), SEDE = path.resolve(__dirname, '../../../sede');
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  let f = p.startsWith('/sede/') ? path.join(SEDE, p.slice(6)) : path.join(RAIZ, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { r.writeHead(404, { 'x-frame-options': 'DENY' }); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'x-frame-options': 'DENY' }); fs.createReadStream(f).pipe(r);
});
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch(); let falhas = 0;
  for (const [k, nome, esperado] of [['barbearia', 'Barbearia%20do%20Z%C3%A9', 'Barbearia do Zé'], ['salao', 'Studio%20Bela%20%26%20Cia', 'Studio Bela & Cia'], ['academia', 'Academia%20For%C3%A7a%20Total', 'Academia Força Total']]) {
    const pg = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const erros = []; pg.on('console', m => m.type() === 'error' && erros.push(m.text().slice(0, 160))); pg.on('pageerror', e => erros.push('script: ' + e.message.slice(0, 160)));
    await pg.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/.+/, route => { const m = new URL(route.request().url()).pathname.match(/^\/npm\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.+)$/); const f = m && path.join(RAIZ, 'node_modules', m[1], m[2]); return f && fs.existsSync(f) ? route.fulfill({ path: f, contentType: 'text/javascript' }) : route.continue(); });
    await pg.goto(base + '/?nicho=' + k + '#k=' + k + '&n=' + nome, { waitUntil: 'load' }); await pg.waitForTimeout(1200);
    await pg.click('#abrir-form button[type=submit], form button[type=submit]').catch(async () => { await pg.locator('form').first().evaluate(f => f.requestSubmit()); });
    await pg.waitForTimeout(3500);
    const fr = pg.frames().find(f => f.url().startsWith('blob:'));
    let txt = '', temBotao = false;
    if (fr) { txt = (await fr.evaluate(() => document.body.innerText)).slice(0, 4000); temBotao = await fr.evaluate(() => !!document.querySelector('button, a[href*="wa.me"], [data-pedido]')); }
    const visivel = await pg.evaluate(() => { const f = document.querySelector('#previa-frame'); return f && getComputedStyle(f).visibility !== 'hidden' && !document.querySelector('#previa').hidden; });
    const ok = !!fr && txt.includes(esperado) && visivel;
    if (!ok) falhas++;
    console.log(k, ok ? 'OK' : 'FALHOU', '| moldura blob:', !!fr, '| nome na prévia:', txt.includes(esperado), '| visível:', visivel, '| texto:', txt.length, 'car. | erros:', JSON.stringify(erros.filter(e => !/fonts\.g|net::ERR_(INTERNET|NAME|TUNNEL|CONNECTION)|Failed to load resource/.test(e))));
    if (k === 'barbearia') { await pg.screenshot({ path: path.join(require('os').tmpdir(), 'moldura-previa.png') });
      // sede embutida
      await pg.evaluate(() => { const p = document.querySelector('#previa-fechar'); if (p) p.click(); }); await pg.waitForTimeout(600);
      await pg.evaluate(() => { const s = document.querySelector('#sede'); if (s) s.scrollIntoView(); }); await pg.waitForTimeout(500);
      await pg.evaluate(() => { const b = document.querySelector('#sede [data-ver-ao-vivo], [data-ver-ao-vivo]'); if (b) b.click(); });
      await pg.waitForTimeout(7000);
      const fs2 = pg.frames().filter(f => f.url().startsWith('blob:'));
      const sede = fs2[fs2.length - 1];
      let info = {}; if (sede) info = await sede.evaluate(() => ({ canvas: !!document.querySelector('canvas'), emb: document.documentElement.classList.contains('embutida'), busca: (window.__creatLocal || {}).search, titulo: document.title })).catch(e => ({ erro: e.message }));
      console.log('sede:', sede ? 'moldura blob' : 'SEM MOLDURA', JSON.stringify(info), '| erros:', JSON.stringify(erros.filter(e => !/fonts\.g|net::ERR_|Failed to load resource/.test(e))));
      if (!sede || !info.canvas) falhas++;
      await pg.screenshot({ path: path.join(require('os').tmpdir(), 'moldura-sede.png') });
    }
    await pg.close();
  }
  await b.close(); srv.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
