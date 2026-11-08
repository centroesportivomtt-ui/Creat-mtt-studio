#!/usr/bin/env node
// Olhos da Creat Nuvem: abre uma página em celular e desktop, claro e escuro,
// tira prints e aponta erros de console, requisições que falharam, rolagem
// horizontal e texto pequeno demais. Sai com código 1 se achar problema.
//
// node .claude/skills/verificacao-visual/olhar.cjs <url | arquivo.html | pasta> [opções]
//   --saida <pasta>      onde salvar os prints (padrão: .verificacao)
//   --hash <id>          abre com #id no endereço
//   --espera <ms>        tempo de espera antes do print (padrão: 4000)
//   --so <lista>         ex.: celular-claro,desktop-escuro
//   --clique <seletor>   clica num elemento antes do print (pode repetir)
//   --cdn-local          serve pacotes do jsdelivr a partir de node_modules (útil sem internet)
const fs = require('fs'), path = require('path'), http = require('http');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const all = k => args.flatMap((a, i) => (a === k ? [args[i + 1]] : []));
const alvo = args.find(a => !a.startsWith('--') && !['--saida','--hash','--espera','--so','--clique'].includes(args[args.indexOf(a) - 1]));
if (!alvo) { console.error('Uso: node olhar.cjs <url | arquivo.html | pasta> [--saida pasta] [--hash id] [--espera ms] [--so lista] [--clique seletor] [--cdn-local]'); process.exit(2); }

let playwright;
try { playwright = require('playwright'); }
catch { console.error('Playwright não encontrado. Instale com: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const saida = path.resolve(opt('--saida', '.verificacao'));
const espera = Number(opt('--espera', 4000));
const hash = opt('--hash', '');
const so = opt('--so', '');
const cliques = all('--clique');
const cdnLocal = args.includes('--cdn-local');

const CONFIGS = [
  { nome: 'desktop-claro', viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
  { nome: 'desktop-escuro', viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
  { nome: 'celular-claro', viewport: { width: 390, height: 844 }, colorScheme: 'light', isMobile: true, hasTouch: true },
  { nome: 'celular-escuro', viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true },
].filter(c => !so || so.split(',').includes(c.nome));

const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript', '.cjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.gif':'image/gif', '.woff2':'font/woff2', '.glb':'model/gltf-binary', '.gltf':'model/gltf+json', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.mp4':'video/mp4' };
function servir(raiz) {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let f = path.join(raiz, p);
      if (!f.startsWith(raiz)) { rsp.writeHead(403); return rsp.end(); }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) { rsp.writeHead(404); return rsp.end('404'); }
      rsp.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(srv));
  });
}

(async () => {
  let url = alvo, srv = null;
  if (!/^https?:\/\//.test(alvo)) {
    const abs = path.resolve(alvo);
    if (!fs.existsSync(abs)) { console.error('Não achei: ' + abs); process.exit(2); }
    const dir = fs.statSync(abs).isDirectory() ? abs : path.dirname(abs);
    const pagina = fs.statSync(abs).isDirectory() ? '' : path.basename(abs);
    srv = await servir(dir);
    url = `http://127.0.0.1:${srv.address().port}/${pagina}`;
  }
  if (hash) url += '#' + hash.replace(/^#/, '');
  fs.mkdirSync(saida, { recursive: true });

  const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const relatorio = [];
  let problemas = 0;

  for (const c of CONFIGS) {
    const { nome, ...ctxOpts } = c;
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    const achados = [];
    if (cdnLocal) {
      await page.route(/https:\/\/cdn\.jsdelivr\.net\/npm\/.+/, route => {
        const m = new URL(route.request().url()).pathname.match(/^\/npm\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.+)$/);
        const f = m && path.join(process.cwd(), 'node_modules', m[1], m[2]);
        if (f && fs.existsSync(f)) return route.fulfill({ path: f, contentType: MIME[path.extname(f)] || 'text/javascript' });
        return route.continue();
      });
    }
    page.on('console', m => { if (m.type() === 'error') achados.push('console: ' + m.text()); });
    page.on('pageerror', e => achados.push('erro de script: ' + e.message));
    page.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) achados.push('requisição falhou: ' + r.url() + ' (' + (r.failure() && r.failure().errorText) + ')'); });
    try { await page.goto(url, { waitUntil: 'load', timeout: 30000 }); }
    catch (e) { achados.push('não abriu: ' + e.message.split('\n')[0]); }
    await page.waitForTimeout(espera);
    for (const sel of cliques) {
      try { await page.click(sel, { timeout: 15000 }); await page.waitForTimeout(1200); }
      catch (e) { achados.push('não consegui clicar em ' + sel + ': ' + e.message.split('\n').find(l => /intercepts|not visible|not stable|waiting for|Timeout/.test(l)) ); }
    }
    const medidas = await page.evaluate((vw) => {
      const larg = document.documentElement.scrollWidth - vw;
      const pequenos = [];
      for (const el of document.querySelectorAll('body *')) {
        if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        const st = getComputedStyle(el), r = el.getBoundingClientRect();
        if (st.visibility === 'hidden' || st.display === 'none' || r.width === 0 || r.height === 0) continue;
        if (el.closest('code,pre,sup,sub,kbd,samp')) continue;
        if (parseFloat(st.fontSize) < 11) pequenos.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}" ${st.fontSize}`);
      }
      return { larg, pequenos: pequenos.slice(0, 5), titulo: document.title };
    }, c.viewport.width).catch(() => ({ larg: 0, pequenos: [], titulo: '' }));
    if (medidas.larg > 1) achados.push(`rolagem horizontal de ${medidas.larg}px`);
    medidas.pequenos.forEach(p => achados.push('texto menor que 11px: ' + p));
    const arquivo = path.join(saida, `${nome}.png`);
    await page.screenshot({ path: arquivo });
    problemas += achados.length;
    relatorio.push({ config: nome, print: arquivo, titulo: medidas.titulo, achados });
    console.log(`${achados.length ? '✗' : '✓'} ${nome} → ${path.relative(process.cwd(), arquivo)}`);
    achados.forEach(a => console.log('    · ' + a));
    await ctx.close();
  }
  await browser.close();
  if (srv) srv.close();
  fs.writeFileSync(path.join(saida, 'relatorio.json'), JSON.stringify({ url, relatorio }, null, 2));
  console.log(problemas ? `\n${problemas} problema(s). Relatório: ${path.join(saida, 'relatorio.json')}` : '\nTudo limpo.');
  process.exit(problemas ? 1 : 0);
})();
