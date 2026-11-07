#!/usr/bin/env node
// Navegador da Creat Nuvem: um Chromium que fica aberto entre comandos,
// para o agente navegar como uma pessoa: abrir, ler, clicar, digitar, ver.
//
//   node .claude/skills/navegador/navegar.cjs <comando> [args]
//
//   abrir <url|arquivo.html>  [--celular] [--escuro] [--cdn-local]   abre a página (sobe servidor local para arquivos)
//   ver                        lista o que dá para interagir, com números [n]
//   ler                        texto visível da página
//   clicar <n|seletor|"texto">
//   digitar <n|seletor> "texto"  [--enter]
//   tecla <Enter|Escape|Tab|ArrowDown...>
//   rolar <px>                 positivo desce, negativo sobe
//   esperar <ms>
//   print [arquivo.png]        salva print (padrão: .verificacao/print-N.png)
//   console                    erros de console e requisições falhas desde o último comando
//   js "<expressão>"           avalia na página e devolve JSON
//   tamanho <largura> <altura>
//   fechar                     encerra o navegador
//
// O primeiro comando sobe o navegador em segundo plano; os seguintes falam com ele.
const fs = require('fs'), path = require('path'), net = require('net'), http = require('http'), cp = require('child_process');

const DIR = path.join(process.cwd(), '.verificacao');
const SOCK = path.join(DIR, 'navegador.sock');
const PIDF = path.join(DIR, 'navegador.pid');
fs.mkdirSync(DIR, { recursive: true });

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === 'ajuda') { console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => l.startsWith('//')).slice(0, 22).map(l => l.slice(3)).join('\n')); process.exit(0); }

// ───────────────────────── servidor (roda em segundo plano) ─────────────────────────
if (cmd === '__servidor') {
  const playwright = require('playwright');
  const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.glb':'model/gltf-binary' };
  let browser, ctx, page, srvEstatico = null, raizEstatica = null, nPrint = 0;
  const log = [];
  const servir = raiz => new Promise(res => {
    const s = http.createServer((req, rsp) => {
      let f = path.join(raiz, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!f.startsWith(raiz)) { rsp.writeHead(403); return rsp.end(); }
      if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!fs.existsSync(f)) { rsp.writeHead(404); return rsp.end('404'); }
      rsp.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(rsp);
    }).listen(0, '127.0.0.1', () => res(s));
  });
  async function garantir(opts = {}) {
    if (!browser) browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    if (!ctx || opts.reset) {
      if (ctx) await ctx.close();
      ctx = await browser.newContext(opts.celular
        ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: opts.escuro ? 'dark' : 'light' }
        : { viewport: { width: 1280, height: 800 }, colorScheme: opts.escuro ? 'dark' : 'light' });
      page = await ctx.newPage();
      page.on('console', m => { if (m.type() === 'error') log.push('console: ' + m.text()); });
      page.on('pageerror', e => log.push('erro de script: ' + e.message));
      page.on('requestfailed', r => { if (!/fonts\.g/.test(r.url())) log.push('requisição falhou: ' + r.url()); });
      page.on('dialog', d => { log.push(`diálogo (${d.type()}): ${d.message}`); d.accept(); });
    }
    return page;
  }
  // Mapa de elementos interativos numerados, para o agente clicar por número.
  const mapear = () => page.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const els = [...document.querySelectorAll('a[href],button,input,select,textarea,[role=button],[role=link],[role=tab],[role=menuitem],[onclick],[tabindex]:not([tabindex="-1"]),summary,label')].filter(vis);
    window.__nav = els;
    return els.map((el, i) => {
      const tag = el.tagName.toLowerCase();
      const nome = (el.getAttribute('aria-label') || el.placeholder || el.value || el.textContent || el.alt || el.title || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      const tipo = tag === 'input' ? `input[${el.type}]` : tag;
      const extra = [el.id && '#' + el.id, el.getAttribute('aria-pressed') === 'true' && 'ativo', el.disabled && 'desativado', el.href && tag === 'a' && '→ ' + el.getAttribute('href')].filter(Boolean).join(' ');
      return `[${i}] ${tipo} "${nome}" ${extra}`.trim();
    });
  });
  const alvo = async s => {
    if (/^\d+$/.test(s)) { const h = await page.evaluateHandle(i => window.__nav && window.__nav[i], +s); if (!(await h.evaluate(e => !!e))) throw new Error(`Não há elemento [${s}]. Rode "ver" primeiro.`); return h.asElement(); }
    if (/^".*"$/.test(s) || /^'.*'$/.test(s)) return page.getByText(s.slice(1, -1), { exact: false }).first();
    return page.locator(s).first();
  };
  const flags = a => ({ celular: a.includes('--celular'), escuro: a.includes('--escuro'), enter: a.includes('--enter'), cdnLocal: a.includes('--cdn-local'), args: a.filter(x => !x.startsWith('--')) });
  // --cdn-local: serve pacotes do jsdelivr/unpkg a partir de node_modules (para ambientes sem acesso ao CDN).
  let cdnLigado = false;
  async function ligarCdnLocal() {
    if (cdnLigado) return; cdnLigado = true;
    await ctx.route(/https:\/\/(cdn\.jsdelivr\.net\/npm|unpkg\.com)\/.+/, route => {
      const m = new URL(route.request().url()).pathname.match(/^\/(?:npm\/)?((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.+)$/);
      const f = m && path.join(process.cwd(), 'node_modules', m[1], m[2]);
      if (f && fs.existsSync(f)) return route.fulfill({ path: f, contentType: MIME[path.extname(f)] || 'text/javascript' });
      return route.continue();
    });
  }

  async function executar(c, a) {
    const f = flags(a); a = f.args;
    switch (c) {
      case 'abrir': {
        await garantir({ reset: f.celular || f.escuro || !ctx, celular: f.celular, escuro: f.escuro });
        if (f.celular || f.escuro) cdnLigado = false;
        if (f.cdnLocal) await ligarCdnLocal();
        let url = a[0];
        if (!/^https?:\/\//.test(url)) {
          const abs = path.resolve(url.replace(/#.*$/, '')); const hash = (url.match(/#.*$/) || [''])[0];
          if (!fs.existsSync(abs)) throw new Error('Não achei ' + abs);
          const dir = fs.statSync(abs).isDirectory() ? abs : path.dirname(abs);
          if (raizEstatica !== dir) { if (srvEstatico) srvEstatico.close(); srvEstatico = await servir(dir); raizEstatica = dir; }
          url = `http://127.0.0.1:${srvEstatico.address().port}/${fs.statSync(abs).isDirectory() ? '' : path.basename(abs)}${hash}`;
        }
        log.length = 0;
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(800);
        return `Aberto: ${await page.title() || '(sem título)'} — ${page.url()}\n${(await mapear()).length} elementos interativos. Use "ver" para listar.`;
      }
      case 'ver': { const m = await mapear(); return m.length ? m.join('\n') : 'Nenhum elemento interativo visível.'; }
      case 'ler': { const t = await page.evaluate(() => document.body.innerText); return t.replace(/\n{3,}/g, '\n\n').slice(0, 8000); }
      case 'clicar': { const el = await alvo(a[0]); try { await el.click({ timeout: 6000 }); } catch { await el.click({ force: true, timeout: 6000 }); } await page.waitForTimeout(500); return `Clicado em ${a[0]}. Agora: ${await page.title()} — ${page.url()}`; }
      case 'digitar': { const el = await alvo(a[0]); await el.fill(a.slice(1).join(' '), { timeout: 10000 }); if (f.enter) await el.press('Enter'); return `Digitado em ${a[0]}${f.enter ? ' + Enter' : ''}.`; }
      case 'tecla': { await page.keyboard.press(a[0]); await page.waitForTimeout(300); return `Tecla ${a[0]}.`; }
      case 'rolar': { await page.mouse.wheel(0, +a[0] || 600); await page.waitForTimeout(400); return `Rolado ${a[0] || 600}px.`; }
      case 'esperar': { await page.waitForTimeout(+a[0] || 1000); return 'Ok.'; }
      case 'tamanho': { await page.setViewportSize({ width: +a[0], height: +a[1] }); return `Janela ${a[0]}×${a[1]}.`; }
      case 'print': { const arq = path.resolve(a[0] || path.join(DIR, `print-${++nPrint}.png`)); await page.screenshot({ path: arq }); return `Print salvo em ${arq} (abra com a ferramenta Read para olhar).`; }
      case 'console': { const out = log.length ? log.join('\n') : 'Nenhum erro de console ou requisição falha.'; log.length = 0; return out; }
      case 'js': { const r = await page.evaluate(a.join(' ')); return JSON.stringify(r, null, 1); }
      case 'fechar': { setTimeout(() => process.exit(0), 100); return 'Navegador fechado.'; }
      default: throw new Error('Comando desconhecido: ' + c);
    }
  }
  if (fs.existsSync(SOCK)) fs.unlinkSync(SOCK);
  const server = net.createServer({ allowHalfOpen: true }, sock => {
    let buf = '';
    sock.on('data', d => { buf += d; });
    sock.on('end', async () => {
      let out;
      try { const { c, a } = JSON.parse(buf); if (!page && c !== 'abrir') throw new Error('Nenhuma página aberta. Use "abrir <url>" primeiro.'); out = { ok: true, out: await executar(c, a) }; }
      catch (e) { out = { ok: false, out: e.message.split('\n')[0] }; }
      sock.end(JSON.stringify(out));
    });
  }).listen(SOCK);
  fs.writeFileSync(PIDF, String(process.pid));
  setTimeout(() => process.exit(0), 30 * 60 * 1000).unref(); // morre sozinho depois de 30 min
  return;
}

// ───────────────────────── cliente ─────────────────────────
function enviar() {
  return new Promise((res, rej) => {
    const s = net.connect(SOCK, () => { s.end(JSON.stringify({ c: cmd, a: rest })); });
    let buf = ''; s.on('data', d => buf += d); s.on('end', () => res(JSON.parse(buf))); s.on('error', rej);
  });
}
(async () => {
  let r;
  try { r = await enviar(); }
  catch {
    if (cmd === 'fechar') { console.log('Navegador já estava fechado.'); process.exit(0); }
    const filho = cp.spawn(process.execPath, [__filename, '__servidor'], { detached: true, stdio: 'ignore', cwd: process.cwd() });
    filho.unref();
    for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 250)); try { r = await enviar(); break; } catch {} }
    if (!r) { console.error('Não consegui subir o navegador. Playwright instalado? (npm i -D playwright && npx playwright install chromium)'); process.exit(2); }
  }
  console.log(r.out);
  process.exit(r.ok ? 0 : 1);
})();
