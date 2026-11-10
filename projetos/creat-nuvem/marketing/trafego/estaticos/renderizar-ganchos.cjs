#!/usr/bin/env node
// Renderiza os estáticos G3 a G6 em PNG (1080x1080 e 1080x1920) e confere as regras duras:
// texto e marca dentro da área segura do 9:16, corpo >= 28 px, selos >= 26 px, nada vazando da peça.
// node renderizar-ganchos.cjs [--guia] [--so g3]
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const RAIZ = path.resolve(__dirname, '../../..'), SAIDA = path.resolve(__dirname, '../saida');
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp' };
const PECAS = [['ganchos-g3-barbearia.html','G3-barbearia-v1'],['ganchos-g4-salao.html','G4-salao-v1'],['ganchos-g5-academia.html','G5-academia-v1'],['ganchos-g6-esmalteria.html','G6-esmalteria-v1']];
const FORMATOS = [['9x16',1080,1920],['1x1',1080,1080]];
const guia = process.argv.includes('--guia'), soI = process.argv.indexOf('--so'), so = soI > -1 ? process.argv[soI + 1] : '';
const srv = http.createServer((q, r) => { const f = path.join(RAIZ, decodeURIComponent(new URL(q.url,'http://x').pathname)); if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, {'content-type': MIME[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(r); });
let falhas = 0;
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const b = await chromium.launch();
  for (const [html, cod] of PECAS) {
    if (so && !html.includes(so)) continue;
    if (!fs.existsSync(path.join(__dirname, html))) { console.log('falta', html); continue; }
    for (const [f, w, h] of FORMATOS) {
      const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const erros = []; pg.on('pageerror', e => erros.push(e.message)); pg.on('console', m => m.type() === 'error' && erros.push(m.text()));
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/marketing/trafego/estaticos/' + html + '?f=' + f, { waitUntil: 'networkidle' });
      await pg.waitForSelector('html[data-pronto="1"]', { timeout: 15000 });
      const fontes = await pg.evaluate(() => ['Lilita One','Figtree','JetBrains Mono'].map(n => n + ':' + document.fonts.check('40px "' + n + '"')).join(' '));
      if (guia) await pg.evaluate(() => document.body.classList.add('com-guia'));
      await pg.waitForTimeout(300);
      const regras = await pg.evaluate(({ f, w, h }) => {
        const out = [], peca = document.getElementById('peca').getBoundingClientRect();
        const seg = f === '9x16' ? { x0: 65, x1: 1015, y0: 269, y1: 1248 } : { x0: 0, x1: w, y0: 0, y1: h };
        document.querySelectorAll('.nicho,.linha,.cartao .rot,.cartao .c1,.cartao .c2,.selo,.fita,.rodape').forEach(el => {
          const r = el.getBoundingClientRect(), fs = parseFloat(getComputedStyle(el).fontSize);
          const nome = (el.className + ' "' + el.textContent.trim().slice(0, 24) + '"');
          const min = /selo|fita/.test(el.className) ? 26 : 28;
          if (fs < min) out.push('pequeno ' + fs + 'px ' + nome);
          if (r.left < seg.x0 - .5 || r.right > seg.x1 + .5 || r.top < seg.y0 - .5 || r.bottom > seg.y1 + .5) out.push('fora da area segura ' + nome + ' [' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(',') + ']');
        });
        return out;
      }, { f, w, h });
      const out = path.join(SAIDA, cod + '-' + (f === '9x16' ? '1080x1920' : '1080x1080') + (guia ? '-guia' : '') + '.png');
      await (await pg.$('#peca')).screenshot({ path: out });
      if (regras.length || erros.length) falhas++;
      console.log(path.basename(out), '|', fontes, '|', erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros', '|', regras.length ? 'REGRAS: ' + regras.join(' ; ') : 'regras ok');
      await pg.close();
    }
  }
  await b.close(); srv.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
