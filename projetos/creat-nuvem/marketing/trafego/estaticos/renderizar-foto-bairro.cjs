#!/usr/bin/env node
// Renderiza a linha "Foto de bairro" (9 peças x vertical 1080x1920 e feed 1080x1350) pelo mesmo caminho de
// renderizar.cjs (servidor local + Playwright + screenshot de #peca) e confere as regras duras:
// texto e marca dentro da área segura do 9:16, corpo >= 28 px, selos >= 26 px, nada vazando, nada sobreposto,
// as 3 fontes carregadas e nome de arquivo sem acento.
// As fotos ficam FORA do repositório: passe a pasta com --fotos.
// node renderizar-foto-bairro.cjs --fotos <pasta das fotos aprovadas> --saida <pasta> [--guia] [--so barbearia-1]
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const arg = n => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : ''; };
const FOTOS = path.resolve(arg('--fotos') || ''), SAIDA = path.resolve(arg('--saida') || path.join(__dirname, '../saida/foto-bairro'));
const guia = process.argv.includes('--guia'), so = arg('--so');
if (!arg('--fotos') || !fs.existsSync(FOTOS)) { console.error('use --fotos <pasta das fotos aprovadas>'); process.exit(2); }
fs.mkdirSync(SAIDA, { recursive: true });
const RAIZ = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  const base = p.startsWith('/fotos/') ? FOTOS : RAIZ, rel = p.startsWith('/fotos/') ? p.slice(7) : p;
  const f = path.join(base, rel);
  if (!f.startsWith(base + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
const IDS = ['barbearia-1', 'barbearia-2', 'barbearia-3', 'salao-1', 'salao-2', 'salao-3', 'academia-1', 'academia-2', 'academia-3'];
const FORMATOS = guia ? [['9x16', 1080, 1920, 'vertical 1080x1920']] : [['9x16', 1080, 1920, 'vertical 1080x1920'], ['4x5', 1080, 1350, 'feed 1080x1350']];
let falhas = 0;
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const b = await chromium.launch();
  for (const id of IDS) {
    if (so && id !== so) continue;
    for (const [f, w, h, rot] of FORMATOS) {
      const pg = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      const erros = []; pg.on('pageerror', e => erros.push(e.message)); pg.on('console', m => m.type() === 'error' && erros.push(m.text()));
      await pg.goto('http://127.0.0.1:' + srv.address().port + '/foto-bairro.html?p=' + id + '&f=' + f, { waitUntil: 'networkidle' });
      await pg.waitForSelector('html[data-pronto="1"]', { timeout: 20000 });
      const fontes = await pg.evaluate(() => ['Lilita One', 'Figtree', 'JetBrains Mono'].filter(n => !document.fonts.check('40px "' + n + '"')));
      if (fontes.length) erros.push('fonte faltando: ' + fontes.join(', '));
      if (guia) await pg.evaluate(() => document.body.classList.add('com-guia'));
      await pg.waitForTimeout(250);
      const { regras, nome } = await pg.evaluate(({ f, w, h }) => {
        const out = [], base = document.getElementById('peca').getBoundingClientRect();
        const seg = f === '9x16' ? { x0: 65, x1: 1015, y0: 269, y1: 1248 } : { x0: 24, x1: w - 24, y0: 24, y1: h - 24 };
        const els = [...document.querySelectorAll('.faixa,.chip,.selo,.rodape')];
        const caixas = els.map(el => {
          // caixa visível inclui a sombra dura (10 px na faixa, 6 no chip, 4 no selo e na origem)
          const r = el.getBoundingClientRect(), s = el.classList.contains('faixa') ? 10 : el.classList.contains('chip') ? 6 : 4;
          return { el, x0: r.left - base.left, y0: r.top - base.top, x1: r.right - base.left + s, y1: r.bottom - base.top + s };
        });
        caixas.forEach(c => {
          const fs = parseFloat(getComputedStyle(c.el).fontSize), n = c.el.className + ' "' + c.el.textContent.trim().slice(0, 22) + '"';
          const min = c.el.classList.contains('selo') ? 26 : 28;
          if (fs < min) out.push('pequeno ' + fs + 'px ' + n);
          if (c.x0 < seg.x0 - .5 || c.x1 > seg.x1 + .5 || c.y0 < seg.y0 - .5 || c.y1 > seg.y1 + .5) out.push('fora da area ' + n + ' [' + [c.x0, c.y0, c.x1, c.y1].map(Math.round) + ']');
        });
        const naoFaixa = caixas.filter(c => !c.el.classList.contains('faixa'));
        const titulo = document.querySelector('.titulo').getBoundingClientRect();
        const tc = { x0: titulo.left - base.left, y0: titulo.top - base.top, x1: titulo.right - base.left + 10, y1: titulo.bottom - base.top + 10 };
        [tc, ...naoFaixa].forEach((a, i, arr) => arr.slice(i + 1).forEach(c => {
          if (a.x0 < c.x1 && c.x0 < a.x1 && a.y0 < c.y1 && c.y0 < a.y1) out.push('sobreposto ' + (a.el ? a.el.className : 'titulo') + ' x ' + c.el.className);
        }));
        return { regras: out, nome: document.title };
      }, { f, w, h });
      const arq = nome + ' - ' + rot + (guia ? ' - guia' : '') + '.png';
      if (/[^\x20-\x7E]/.test(arq)) { regras.push('nome com acento: ' + arq); }
      const out = path.join(SAIDA, arq);
      await (await pg.$('#peca')).screenshot({ path: out });
      if (regras.length || erros.length) falhas++;
      console.log(arq, '|', erros.length ? 'ERROS: ' + erros.join(' | ') : 'sem erros', '|', regras.length ? 'REGRAS: ' + regras.join(' ; ') : 'regras ok');
      await pg.close();
    }
  }
  await b.close(); srv.close(); process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
