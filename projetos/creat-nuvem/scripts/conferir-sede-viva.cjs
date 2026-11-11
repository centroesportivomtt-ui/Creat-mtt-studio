// Portão da seção #sede (a equipe trabalhando): cena viva no celular barato, com a CSP do _headers.
// Uso: node scripts/conferir-sede-viva.cjs   (saída 0 = ok, 1 = defeito, 2 = ambiente: sem Playwright, sem git...)
// Celular 360x640 com toque, CPU 4x mais lenta e 4G lenta (1,6 Mbps, 150 ms). Prints em $SEDE_PRINTS (padrão: os/tmpdir).
// Compara a primeira tela com a versão de base (SEDE_BASE; padrão: o commit de onde a branch atual nasceu).
//   1. topo: nenhuma requisição à pasta da cena e a mesma lista de requisições da base; botão do herói em y <= 600
//   2. seção na tela: sedeviva:pronta em até 4 s; bytes da pasta da cena <= 300 KB (falha dura acima de 900 KB)
//   3. 5 s de cena: >= 50 quadros/s, pior quadro <= 50 ms
//   4. aria-current passa pelos 8 itens da lista em até 17 s; aos 8 s o mini site tem a cor e o título do tenant
//   5. selo "Demonstração" visível e não coberto aos 0, 4, 8 e 12 s
//   6. Pausar: 2 s sem animação rodando no palco; Continuar retoma do mesmo ponto
//   7. chip Esmalte & Fio: passo 0 em até 600 ms; cor #FBF1EE aos 8 s
//   8. fora da tela: pausada; de volta: roda
//   9. movimento reduzido e economia de dados: nenhuma animação rodando, ABERTO na cena, lista à vista, chips trocam o site
//  10. teclado: chips, Pausar, 7 rostos, Entrar na sede 3D, Abrir o site pronto, nessa ordem, com foco visível
//  11. Entrar na sede 3D: a moldura da sede entra na janela, servida como a hospedagem de hoje (X-Frame-Options DENY,
//      moldura blob) e como o _headers manda (CSP do /* na home, CSP do /sede/* na sede, moldura pelo endereço)
//  12. nenhum erro de console e nenhuma violação de CSP
const fs = require('fs'), path = require('path'), http = require('http'), os = require('os'), zlib = require('zlib'), { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('AMBIENTE  sem Playwright'); process.exit(2); }
const RAIZ = path.resolve(__dirname, '..'), SEDE = path.resolve(__dirname, '../../../sede'), REPO = path.resolve(__dirname, '../../..');
const PRINTS = process.env.SEDE_PRINTS || path.join(os.tmpdir(), 'sede-viva-prints');
fs.mkdirSync(PRINTS, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };

// CSP do bloco "/*" do _headers (a mesma que o Cloudflare manda)
const headers = fs.readFileSync(path.join(RAIZ, '_headers'), 'utf8');
const CSP = (/^\/\*\s*\n\s+Content-Security-Policy:\s*(.+)$/m.exec(headers) || [])[1];
if (!CSP) { console.log('AMBIENTE  não achei a CSP do /* no _headers'); process.exit(2); }
const CSP_LOCAL = CSP.replace(/\s*upgrade-insecure-requests/, '');   // servidor local é http
// CSP do bloco "/sede/*", com os hashes dos scripts inline recalculados de sede/index.html (como o montar-publico.cjs faz)
const CSP_SEDE = (() => {
  const l = (/^\/sede\/\*\s*\n(?:\s+!.*\n)*\s+Content-Security-Policy:\s*(.+)$/m.exec(headers) || [])[1];
  if (!l) { console.log('AMBIENTE  não achei a CSP do /sede/* no _headers'); process.exit(2); }
  const html = fs.readFileSync(path.resolve(__dirname, '../../../sede/index.html'), 'utf8'), hs = [], re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m; while ((m = re.exec(html))) if (!/\bsrc\s*=/.test(m[1]) && m[2].length) hs.push(`'sha256-${require('crypto').createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
  return l.replace(/script-src 'self'( 'sha256-[^']+')*/, `script-src 'self' ${hs.join(' ')}`).replace(/\s*upgrade-insecure-requests/, '');
})();
// pasta da cena: a que o vitrine.js carrega hoje (duble ou a da Órbita)
const VIT = fs.readFileSync(path.join(RAIZ, 'assets', 'vitrine.js'), 'utf8');
const PASTA = (/var SEDE_CENA = \{ pasta: '([^']+)'/.exec(VIT) || [])[1];
if (!PASTA) { console.log('DEFEITO  não achei SEDE_CENA.pasta no vitrine.js'); process.exit(1); }
const NEG = JSON.parse(fs.readFileSync(path.join(RAIZ, PASTA, 'negocios.json'), 'utf8')).negocios;

function git(args) { return execFileSync('git', args, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
let BASE = process.env.SEDE_BASE;
try {
  if (!BASE) { const ramo = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim(); const l = git(['reflog', 'show', ramo]).trim().split('\n').pop(); BASE = /Created from/.test(l) ? l.split(' ')[0] : 'main'; }
  git(['rev-parse', '--verify', BASE + '^{commit}']);
} catch (e) { console.log('AMBIENTE  sem a versão de base no git (SEDE_BASE=' + BASE + ')'); process.exit(2); }
const ANTIGOS = { '/index.html': 'index.html', '/assets/vitrine.js': 'assets/vitrine.js', '/assets/vitrine.css': 'assets/vitrine.css', '/conteudo/home.json': 'conteudo/home.json' };
const cacheAntigo = {};
function antigo(rel) { if (!(rel in cacheAntigo)) cacheAntigo[rel] = Buffer.from(git(['show', BASE + ':projetos/creat-nuvem/' + rel]), 'utf8'); return cacheAntigo[rel]; }

function servidor(usarBase, comoHoje) {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const cab = { 'content-security-policy': CSP_LOCAL, 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'SAMEORIGIN' };
    if (usarBase && ANTIGOS[p]) { r.writeHead(200, Object.assign({ 'content-type': MIME[path.extname(p)] }, cab)); return r.end(antigo(ANTIGOS[p])); }
    if (comoHoje) { delete cab['content-security-policy']; cab['x-frame-options'] = 'DENY'; }
    let f = p.startsWith('/sede/') ? path.join(SEDE, p.slice(6)) : path.join(RAIZ, p);
    if (!f.startsWith(RAIZ) && !f.startsWith(SEDE)) { r.writeHead(403); return r.end(); }
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { r.writeHead(404, cab); return r.end(); }
    if (p.startsWith('/sede/') && !comoHoje) { cab['content-security-policy'] = CSP_SEDE; cab['referrer-policy'] = 'no-referrer'; }
    r.writeHead(200, Object.assign({ 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }, cab));
    fs.createReadStream(f).pipe(r);
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

let falhas = 0;
const linhas = [];
function ok(m) { linhas.push('ok      ' + m); console.log('ok      ' + m); }
function defeito(m) { falhas++; linhas.push('DEFEITO ' + m); console.log('DEFEITO ' + m); }
function conferir(cond, m, detalhe) { if (cond) ok(m); else defeito(m + (detalhe ? ' (' + detalhe + ')' : '')); }

async function abrir(nav, base, opc = {}) {
  const ctx = await nav.newContext({ viewport: { width: opc.w || 360, height: opc.h || 640 }, isMobile: !opc.desktop, hasTouch: !opc.desktop, colorScheme: opc.escuro ? 'dark' : 'light', reducedMotion: opc.reduzido ? 'reduce' : 'no-preference' });
  // fontes e CDN: respondidas aqui (sem internet no portão); o CSS das fontes vazio, o Three.js do node_modules
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await ctx.route(/^https:\/\/(connect\.facebook\.net|www\.clarity\.ms|scripts\.clarity\.ms|eu\.i\.posthog\.com|eu-assets\.i\.posthog\.com)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.route(/^https:\/\/cdn\.jsdelivr\.net\/npm\/.+/, (route) => {
    const m = new URL(route.request().url()).pathname.match(/^\/npm\/((?:@[^/]+\/)?[^@/]+)@[^/]+\/(.+)$/);
    const f = m && [RAIZ, REPO].map((r) => path.join(r, 'node_modules', m[1], m[2])).find((x) => fs.existsSync(x));
    return f ? route.fulfill({ path: f, contentType: 'text/javascript' }) : route.continue();   // sem cópia local: o CDN de verdade
  });
  await ctx.addInitScript((o) => {
    try { localStorage.setItem('creat:consentimento', JSON.stringify({ versao: 1, analytics: false, pixel: false, clarity: false, em: new Date().toISOString() })); } catch (e) {}
    if (o.economia) { try { Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => ({ saveData: true, effectiveType: '4g', addEventListener() {} }) }); } catch (e) {} }
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + (e.blockedURI || '')));
  }, { economia: !!opc.economia });
  const pg = await ctx.newPage();
  const erros = [], reqs = [], bytes = {};
  pg.on('console', (m) => { if (m.type() === 'error') erros.push(m.text().slice(0, 200)); });
  pg.on('pageerror', (e) => erros.push('script: ' + e.message.slice(0, 200)));
  pg.on('request', (q) => reqs.push(q.url()));
  pg.on('requestfinished', async (q) => { try { const s = await q.sizes(); bytes[q.url()] = s.responseBodySize + s.responseHeadersSize; } catch (e) {} });
  if (!opc.semLentidao) {
    const cdp = await ctx.newCDPSession(pg);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  }
  return { ctx, pg, erros, reqs, bytes };
}
const naPasta = (u) => new URL(u).pathname.startsWith('/' + PASTA);
const caminho = (u) => { const x = new URL(u); return x.origin.startsWith('http://127.0.0.1') ? x.pathname : x.origin + x.pathname; };

// prepara o ouvido dos eventos da cena (antes de a seção chegar)
async function ouvir(pg) {
  await pg.evaluate(() => {
    const palco = document.querySelector('[data-sede-palco]');
    window.__sv = { ev: [], itens: new Set() };
    ['pronta', 'passo', 'estado', 'ciclo', 'toque', 'erro'].forEach((n) => palco.addEventListener('sedeviva:' + n, (e) => window.__sv.ev.push({ t: performance.now(), n, d: e.detail })));
    new MutationObserver(() => { const li = document.querySelector('.esteira-lista li[aria-current="step"]'); if (li) window.__sv.itens.add(li.getAttribute('data-item')); })
      .observe(document.querySelector('.esteira-lista'), { attributes: true, subtree: true, attributeFilter: ['aria-current'] });
  });
}
// a página rola suave (scroll-behavior): o teste pula direto, como um dedo rápido
async function irParaPalco(pg) {
  await pg.evaluate(() => { const c = document.querySelector('#sede .sede-marcas'); window.scrollTo({ top: c.getBoundingClientRect().top + scrollY - 76, behavior: 'instant' }); });
}
const rodando = (pg) => pg.evaluate(() => document.querySelector('[data-sede-palco]').getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length);
const tempoCena = (pg) => pg.evaluate(() => { const a = document.querySelector('[data-sede-palco]').getAnimations({ subtree: true })[0]; return a ? a.currentTime : null; });
const eventos = (pg, n) => pg.evaluate((n) => window.__sv.ev.filter((e) => e.n === n), n);
async function seloLivre(pg) {
  return pg.evaluate(() => {
    const s = document.querySelector('#janela-sede .selo-demo'), r = s.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > innerHeight) return 'fora da tela';
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return e === s || s.contains(e) ? 'livre' : 'coberto por ' + (e ? e.className || e.tagName : 'nada');
  });
}
async function temCor(pg, rgb) {
  return pg.evaluate((rgb) => Array.from(document.querySelectorAll('[data-sede-palco] *')).some((e) => getComputedStyle(e).backgroundColor === rgb), rgb);
}
async function print(pg, nome) { await pg.screenshot({ path: path.join(PRINTS, nome) }); }

(async () => {
  let nav;
  try { nav = await chromium.launch(); } catch (e) { console.log('AMBIENTE  Chromium não abriu: ' + e.message.split('\n')[0]); process.exit(2); }
  const srvNovo = await servidor(false), srvBase = await servidor(true), srvProd = await servidor(false, true);
  const NOVO = 'http://127.0.0.1:' + srvNovo.address().port, ANT = 'http://127.0.0.1:' + srvBase.address().port, PROD = 'http://127.0.0.1:' + srvProd.address().port;
  console.log('pasta da cena: ' + PASTA + ' | base: ' + BASE.slice(0, 8) + ' | prints: ' + PRINTS);
  try {
    /* 1. primeira tela */
    const topo = async (base) => {
      const a = await abrir(nav, base);
      await a.pg.goto(base + '/?utm_source=teste-pixel', { waitUntil: 'load' });
      await a.pg.waitForTimeout(3000);
      const botao = await a.pg.evaluate(() => { const b = document.querySelector('#form-abrir [type=submit]'); const r = b.getBoundingClientRect(); return { baixo: Math.round(r.bottom), rotulo: b.textContent.trim() }; });
      const lista = Array.from(new Set(a.reqs.map(caminho))).sort();
      const peso = Object.keys(a.bytes).reduce((s, u) => s + a.bytes[u], 0);
      const r = { lista, botao, peso, cena: a.reqs.filter(naPasta), erros: a.erros.slice(), csp: await a.pg.evaluate(() => window.__csp) };
      await a.ctx.close();
      return r;
    };
    const tn = await topo(NOVO), ta = await topo(ANT);
    conferir(tn.cena.length === 0, '1. no topo nenhuma requisição a ' + PASTA, tn.cena.join(' '));
    const so = (x, y) => x.filter((u) => y.indexOf(u) === -1);
    conferir(JSON.stringify(tn.lista) === JSON.stringify(ta.lista), '1. no topo a lista de requisições é a mesma da base (' + tn.lista.length + ')', 'a mais: ' + so(tn.lista, ta.lista).join(' ') + ' | a menos: ' + so(ta.lista, tn.lista).join(' '));
    conferir(tn.botao.rotulo === 'Ver meu site pronto' && tn.botao.baixo <= 600 && tn.botao.baixo === ta.botao.baixo, '1. botão "' + tn.botao.rotulo + '" termina em y ' + tn.botao.baixo + ' (base ' + ta.botao.baixo + ')');
    // o servidor local não comprime: o que conta no ar é o gzip dos arquivos que mudaram (orçamento: HTML +2 KB, JS +3 KB)
    const gz = (b) => zlib.gzipSync(b, { level: 9 }).length;
    const dif = Object.keys(ANTIGOS).map((p) => { const rel = ANTIGOS[p]; return { rel, d: gz(fs.readFileSync(path.join(RAIZ, rel))) - gz(antigo(rel)) }; });
    const soma = dif.reduce((s, x) => s + x.d, 0);
    console.log('        sem compressão no topo: ' + (tn.peso / 1024).toFixed(1) + ' KB (base ' + (ta.peso / 1024).toFixed(1) + ' KB) | com gzip: ' + dif.map((x) => x.rel + ' ' + (x.d >= 0 ? '+' : '') + (x.d / 1024).toFixed(1) + ' KB').join(', '));
    conferir(soma <= 5 * 1024, '1. a primeira tela cresce só ' + (soma / 1024).toFixed(1) + ' KB com gzip (teto 5 KB: HTML e vitrine.js), nenhuma requisição a mais');

    /* 2 a 8 e 10 a 12: celular, claro */
    const a = await abrir(nav, NOVO);
    const { pg } = a;
    await pg.goto(NOVO + '/?utm_source=teste-pixel', { waitUntil: 'load' });
    await pg.waitForTimeout(800);
    await ouvir(pg);
    const t0 = await pg.evaluate(() => performance.now());
    await irParaPalco(pg);
    await pg.waitForFunction(() => window.__sv.ev.some((e) => e.n === 'pronta' || e.n === 'erro'), null, { timeout: 15000 }).catch(() => {});
    const pr = (await eventos(pg, 'pronta'))[0];
    conferir(pr && pr.t - t0 <= 4000, '2. cena pronta ' + (pr ? ((pr.t - t0) / 1000).toFixed(2) + ' s' : 'nunca') + ' depois de a seção entrar na tela (teto 4 s)');
    const bCena = a.reqs.filter(naPasta).reduce((s, u) => s + (a.bytes[u] || 0), 0);
    conferir(bCena <= 900 * 1024, '2. peso da cena ' + (bCena / 1024).toFixed(1) + ' KB (meta 300 KB, falha dura em 900 KB)');
    // a regra img,svg{max-width:100%} do vitrine.css zerava os desenhos da cena (escada, lápis, lupa, celular): todos têm tamanho
    const zerados = await pg.evaluate(() => [...document.querySelectorAll('.sv-mundo svg')].filter((s) => !s.closest('.sv-sprite')).filter((s) => { const b = s.getBoundingClientRect(); return !b.width || !b.height; }).map((s) => (s.querySelector('use') || s).getAttribute('href') || s.getAttribute('class')));
    conferir(zerados.length === 0, '2. todo desenho da cena tem tamanho na página (a regra img,svg da home não vaza para a cena)', zerados.join(' '));
    if (bCena > 300 * 1024) console.log('        aviso: acima da meta de 300 KB');
    const tPronta = Date.now();
    const quando = (s) => pg.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - tPronta)));
    await quando(0); conferir((await seloLivre(pg)) === 'livre', '5. selo livre aos 0 s', await seloLivre(pg));
    await quando(0.5); await print(pg, 'cena-claro-360-0.5s.png');
    // 3. quadros por segundo durante 5 s
    const fps = await pg.evaluate(() => new Promise((ok) => { const ts = []; const f = (t) => { ts.push(t); if (t - ts[0] < 5000) requestAnimationFrame(f); else { let pior = 0; for (let i = 1; i < ts.length; i++) pior = Math.max(pior, ts[i] - ts[i - 1]); ok({ fps: (ts.length - 1) / ((ts[ts.length - 1] - ts[0]) / 1000), pior }); } }; requestAnimationFrame(f); }));
    conferir(fps.fps >= 50 && fps.pior <= 50, '3. ' + fps.fps.toFixed(1) + ' quadros/s, pior quadro ' + fps.pior.toFixed(0) + ' ms (CPU 4x)');
    await quando(4); conferir((await seloLivre(pg)) === 'livre', '5. selo livre aos 4 s', await seloLivre(pg));
    await quando(8);
    const n0 = NEG.barbearia;
    conferir(await temCor(pg, 'rgb(247, 244, 239)'), '4. aos 8 s o mini site tem a cor de fundo ' + n0.cores.fundo);
    conferir((await pg.textContent('[data-sede-palco]')).replace(/\s+/g, ' ').includes(n0.titulo), '4. aos 8 s o mini site tem o título do tenant');
    conferir((await seloLivre(pg)) === 'livre', '5. selo livre aos 8 s', await seloLivre(pg));
    await print(pg, 'cena-claro-360-8s.png');
    await quando(12); conferir((await seloLivre(pg)) === 'livre', '5. selo livre aos 12 s', await seloLivre(pg));
    await quando(13); await print(pg, 'cena-claro-360-13s.png');
    await pg.waitForFunction(() => window.__sv.itens.size >= 8, null, { timeout: Math.max(1000, 17000 - (Date.now() - tPronta)) }).catch(() => {});
    const itens = await pg.evaluate(() => Array.from(window.__sv.itens).sort());
    conferir(itens.length === 8, '4. aria-current passou pelos 8 itens em até 17 s', 'só ' + itens.join(','));
    const atual = await pg.evaluate(() => { const li = document.querySelector('.esteira-lista li[aria-current="step"]'); const r = document.querySelector('.sede-rosto[data-atual]'); return { li: li && li.getAttribute('data-agente'), rosto: r && r.getAttribute('data-rosto') }; });
    conferir(atual.li === 'todos' || atual.li === atual.rosto, '4. o rosto aceso é o do item atual', JSON.stringify(atual));

    /* 6. Pausar e Continuar */
    await pg.click('[data-sede-pausar]');
    const tp = await tempoCena(pg);
    await pg.waitForTimeout(2000);
    const r6 = await rodando(pg), tp2 = await tempoCena(pg), rot = (await pg.textContent('[data-sede-pausar]')).trim();
    conferir(r6 === 0 && Math.abs(tp2 - tp) < 1 && rot === 'Continuar', '6. Pausar: 2 s sem animação rodando no palco, botão vira "' + rot + '"', r6 + ' rodando, tempo ' + tp + ' -> ' + tp2);
    await pg.click('[data-sede-pausar]');
    await pg.waitForTimeout(300);
    const tp3 = await tempoCena(pg);
    conferir((await rodando(pg)) > 0 && tp3 >= tp2 && tp3 - tp2 < 1500 && (await pg.textContent('[data-sede-pausar]')).trim() === 'Pausar', '6. Continuar retoma do mesmo ponto (' + Math.round(tp2) + ' -> ' + Math.round(tp3) + ' ms)');

    /* 7. troca de negócio */
    const antesTroca = (await eventos(pg, 'passo')).length;
    await pg.click('.sede-marcas .chip[data-nicho="salao"]');
    const tTroca = Date.now();
    await pg.waitForFunction((n) => window.__sv.ev.filter((e) => e.n === 'passo').length > n && window.__sv.ev.filter((e) => e.n === 'passo').pop().d.passo === 0, antesTroca, { timeout: 3000 }).catch(() => {});
    const dtTroca = Date.now() - tTroca;
    conferir(dtTroca <= 600, '7. Esmalte & Fio: passo 0 em ' + dtTroca + ' ms (teto 600)');
    await pg.waitForTimeout(8000);
    conferir(await temCor(pg, 'rgb(251, 241, 238)'), '7. aos 8 s o site do salão tem a cor ' + NEG.salao.cores.fundo);
    conferir((await pg.getAttribute('[data-esteira-abrir]', 'href')) === 'sites/demo-salao/', '7. "Abrir o site pronto" leva ao site do salão');
    await print(pg, 'cena-claro-360-salao-8s.png');

    /* 8. fora da tela */
    await pg.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await pg.waitForTimeout(800);
    const fora = await rodando(pg);
    await irParaPalco(pg);
    await pg.waitForTimeout(800);
    const volta = await rodando(pg);
    conferir(fora === 0 && volta > 0, '8. fora da tela: ' + fora + ' animações rodando; de volta: ' + volta);

    /* 10. teclado */
    // foco pelo teclado (Shift+Tab e Tab), para o :focus-visible valer como para quem navega com Tab
    await pg.focus('.sede-marcas .chip'); await pg.keyboard.press('Shift+Tab'); await pg.keyboard.press('Tab');
    const ordem = [];
    for (let i = 0; i < 13; i++) {
      ordem.push(await pg.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); return { q: e.getAttribute('data-nicho') || e.getAttribute('data-rosto') || (e.hasAttribute('data-sede-pausar') ? 'pausar' : e.hasAttribute('data-ver-ao-vivo') ? '3d' : e.hasAttribute('data-esteira-abrir') ? 'abrir' : e.tagName), foco: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 }; }));
      await pg.keyboard.press('Tab');
    }
    const esperado = ['barbearia', 'salao', 'academia', 'pausar', 'nimbus', 'verbo', 'paleta', 'pixel', 'lupa', 'muralha', 'trilho', '3d', 'abrir'];
    conferir(JSON.stringify(ordem.map((o) => o.q)) === JSON.stringify(esperado), '10. ordem do Tab: chips, Pausar, 7 rostos, Entrar na sede 3D, Abrir o site pronto', ordem.map((o) => o.q).join(' > '));
    conferir(ordem.every((o) => o.foco), '10. foco visível em todos', ordem.filter((o) => !o.foco).map((o) => o.q).join(' '));
    // rosto pelo teclado: pula para o passo dele e pausa com o balão; Esc retoma
    await pg.focus('.sede-rosto[data-rosto="paleta"]'); await pg.keyboard.press('Enter');
    await pg.waitForFunction(() => { const e = window.__sv.ev.filter((x) => x.n === 'estado').pop(); return e && e.d.pausado && e.d.motivo === 'balao'; }, null, { timeout: 6000 }).catch(() => {});
    const bal = await pg.evaluate(() => ({ item: (document.querySelector('.esteira-lista li[aria-current="step"]') || {}).getAttribute && document.querySelector('.esteira-lista li[aria-current="step"]').getAttribute('data-agente'), botao: document.querySelector('[data-sede-pausar]').textContent.trim() }));
    conferir(bal.item === 'paleta' && bal.botao === 'Continuar', '10. rosto da Paleta: pula para o passo dela e pausa com o balão', JSON.stringify(bal));
    await print(pg, 'cena-claro-360-balao.png');
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(400);
    conferir((await rodando(pg)) > 0, '10. Esc retoma a cena');

    /* 12. console e CSP */
    const csp = await pg.evaluate(() => window.__csp);
    const errs = a.erros.concat(tn.erros).filter((e) => !/favicon/.test(e));
    conferir(errs.length === 0, '12. nenhum erro de console', errs.join(' | '));
    conferir(csp.length === 0 && tn.csp.length === 0 && !errs.some((e) => /Content Security Policy/i.test(e)), '12. nenhuma violação de CSP', csp.concat(tn.csp).join(' | '));
    await a.ctx.close();

    /* 11. sede 3D sob toque, nos dois jeitos de servir:
       hoje (X-Frame-Options DENY, sem CSP): a moldura entra como blob;
       com o _headers no ar (CSP do /* na home, SAMEORIGIN, CSP do /sede/*): a moldura abre /sede/ pelo endereço */
    for (const [srv, nome, blob] of [[PROD, 'como a hospedagem de hoje', true], [NOVO, 'com a CSP do _headers', false]]) {
      const c = await abrir(nav, srv, { semLentidao: true });
      await c.pg.goto(srv + '/', { waitUntil: 'load' });
      await irParaPalco(c.pg);
      await c.pg.waitForSelector('.sv-mundo', { timeout: 10000 }).catch(() => {});
      await c.pg.click('[data-ver-ao-vivo]');
      await c.pg.waitForSelector('#janela-sede iframe', { timeout: 8000 }).catch(() => {});
      await c.pg.waitForTimeout(9000);
      const fr = c.pg.frames().filter((f) => f !== c.pg.mainFrame()).pop();
      let info = {};
      if (fr) info = await fr.evaluate(() => ({ canvas: !!document.querySelector('canvas'), url: location.protocol + '//' + location.pathname })).catch((e) => ({ erro: e.message.split('\n')[0] }));
      const jeito = fr ? (fr.url().startsWith('blob:') ? 'blob' : new URL(fr.url()).pathname.startsWith('/sede/') ? 'endereço' : fr.url().slice(0, 40)) : 'nenhuma';
      const sem = await c.pg.evaluate(() => ({ cena: document.querySelector('.sv-mundo') ? 1 : 0, rodando: document.querySelector('[data-sede-palco]').getAnimations({ subtree: true }).length, lista: document.querySelector('#esteira').getBoundingClientRect().width > 100 }));
      conferir(!!fr && info.canvas && jeito === (blob ? 'blob' : 'endereço') && sem.cena === 0 && sem.rodando === 0 && sem.lista, '11. ' + nome + ': Entrar na sede 3D tira a cena, a moldura (' + jeito + ') entra com o 3D e a lista fica à vista', JSON.stringify({ jeito, info, sem }));
      await print(c.pg, 'cena-claro-360-sede3d-' + (blob ? 'hoje' : 'headers') + '.png');
      const e11 = c.erros.filter((x) => !/favicon|Failed to load resource/.test(x));
      const v11 = await c.pg.evaluate(() => window.__csp);
      conferir(e11.length === 0 && v11.length === 0, '11. ' + nome + ': nenhum erro de console nem violação de CSP com a sede 3D', e11.concat(v11).join(' | '));
      await c.ctx.close();
    }

    /* 9. movimento reduzido e economia de dados */
    for (const modo of ['reduzido', 'economia']) {
      const b = await abrir(nav, NOVO, { [modo]: true });
      await b.pg.goto(NOVO + '/', { waitUntil: 'load' });
      await b.pg.waitForTimeout(500);
      await ouvir(b.pg);
      await irParaPalco(b.pg);
      await b.pg.waitForFunction(() => window.__sv.ev.some((e) => e.n === 'pronta'), null, { timeout: 15000 }).catch(() => {});
      await b.pg.waitForTimeout(1500);
      const r = await b.pg.evaluate(() => {
        const e = document.querySelector('#esteira'), palco = document.querySelector('[data-sede-palco]');
        return { rodando: document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target && palco.contains(a.effect.target)).length,
          aberto: /ABERTO/.test(palco.textContent), lista: e.getBoundingClientRect().width > 100, pausar: !document.querySelector('[data-sede-pausar]').hidden,
          dica: document.querySelector('[data-legenda-dica]').textContent };
      });
      conferir(r.rodando === 0 && r.aberto && r.lista && !r.pausar, '9. ' + modo + ': nenhuma animação rodando, ABERTO na cena, lista à vista, sem Pausar', JSON.stringify(r));
      await print(b.pg, 'cena-' + modo + '-360.png');
      await b.pg.click('.sede-marcas .chip[data-nicho="academia"]');
      await b.pg.waitForTimeout(800);
      const t = (await b.pg.textContent('[data-sede-palco]')).replace(/\s+/g, ' ');
      conferir(t.includes(NEG.academia.titulo) && (await rodando(b.pg)) === 0, '9. ' + modo + ': o chip troca o site parado (academia)');
      const e9 = b.erros.filter((x) => !/favicon/.test(x));
      conferir(e9.length === 0, '9. ' + modo + ': nenhum erro de console', e9.join(' | '));
      await b.ctx.close();
    }

    /* prints: escuro no celular e desktop */
    for (const o of [{ escuro: true, nome: 'escuro-360' }, { w: 390, h: 844, nome: 'claro-390' }, { w: 390, h: 844, escuro: true, nome: 'escuro-390' }, { desktop: true, w: 1440, h: 900, nome: 'claro-1440' }, { desktop: true, w: 1440, h: 900, escuro: true, nome: 'escuro-1440' }, { desktop: true, w: 1280, h: 800, nome: 'claro-1280' }]) {
      const c = await abrir(nav, NOVO, Object.assign({ semLentidao: true }, o));
      await c.pg.goto(NOVO + '/', { waitUntil: 'load' });
      await c.pg.waitForTimeout(400);
      await ouvir(c.pg);
      if (o.desktop) await c.pg.evaluate(() => { const s = document.querySelector('#sede'); window.scrollTo({ top: s.getBoundingClientRect().top + scrollY + 120, behavior: 'instant' }); });
      else await irParaPalco(c.pg);
      await c.pg.waitForFunction(() => window.__sv.ev.some((e) => e.n === 'pronta'), null, { timeout: 10000 }).catch(() => {});
      for (const s of [3, 8, 13]) { await c.pg.waitForTimeout(s === 3 ? 3000 : 5000); await print(c.pg, 'cena-' + o.nome + '-' + s + 's.png'); }
      const lateral = await c.pg.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
      conferir(!lateral, 'sem rolagem lateral em ' + o.nome);
      const ec = c.erros.filter((x) => !/favicon/.test(x));
      conferir(ec.length === 0, 'nenhum erro de console em ' + o.nome, ec.join(' | '));
      await c.ctx.close();
    }
  } catch (e) {
    defeito('o portão parou: ' + e.message.split('\n')[0]);
  } finally {
    await nav.close(); srvNovo.close(); srvBase.close(); srvProd.close();
  }
  console.log(falhas ? '\n' + falhas + ' defeito(s). Prints em ' + PRINTS : '\nsede viva: tudo certo. Prints em ' + PRINTS);
  process.exit(falhas ? 1 : 0);
})();
