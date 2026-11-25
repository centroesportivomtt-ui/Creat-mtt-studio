// Teste da tela no modo demonstração: node site/ao-vivo/teste-tela.cjs [pasta-dos-prints]
const { chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const raiz = path.join(__dirname, '..'), saida = process.argv[2] || '';
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css' };
const srv = http.createServer((q, r) => { const f = path.join(raiz, decodeURIComponent(new URL(q.url, 'http://x').pathname).replace(/\/$/, '/index.html')); if (!f.startsWith(raiz) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'text/plain' }); fs.createReadStream(f).pipe(r); });
(async () => {
  await new Promise(r => srv.listen(0, r)); const url = `http://localhost:${srv.address().port}/ao-vivo/index.html?demo`;
  const b = await chromium.launch(); let falhas = 0;
  for (const [nome, vp] of [['desktop', { width: 1366, height: 900 }], ['celular', { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport: vp }); const erros = [];
    p.on('pageerror', e => erros.push(e.message)); p.on('console', m => m.type() === 'error' && !/supabase|fonts/.test(m.text()) && erros.push(m.text()));
    await p.goto(url); await p.waitForTimeout(9000);
    const r = await p.evaluate(() => ({ n: +document.querySelector('#nWork').textContent, run: document.querySelectorAll('.ag[data-s="run"]').length, log: document.querySelectorAll('#log li').length, chips: document.querySelectorAll('#mesa .chip').length, hs: document.documentElement.scrollWidth > innerWidth, demo: !document.querySelector('#demoTag').hidden }));
    const ok = !erros.length && r.n > 0 && r.log > 5 && r.chips > 2 && !r.hs && r.demo;
    console.log(nome, ok ? 'ok' : 'FALHOU', JSON.stringify(r), erros.join(' | '));
    if (!ok) falhas++;
    if (saida) await p.screenshot({ path: path.join(saida, nome + '.png'), fullPage: true });
  }
  await b.close(); srv.close(); process.exit(falhas ? 1 : 0);
})();
