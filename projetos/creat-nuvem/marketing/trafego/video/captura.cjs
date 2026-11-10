/* Captura quadro a quadro da página REAL (home, prévia) para os Reels "Atrás da placa".
   Órbita, 10/11/2026. Usado por gerar.cjs; não roda sozinho.

   Como fica determinístico sem mexer no site:
   - relógio da página falso (Playwright clock): setTimeout, rAF e Date só andam quando o quadro manda;
   - toda animação CSS/WAAPI da página é pausada e posicionada no tempo do vídeo (document.getAnimations),
     contando do quadro em que nasceu. Assim a placa, o giz e a prévia andam exatamente como na página,
     só que no compasso de 30 fps;
   - digitação, arraste e toques são entrada real do navegador (page.keyboard / page.mouse), não eventos falsos.
   Única intervenção visual na página, registrada no relatório: o botão flutuante com o logo do WhatsApp é
   escondido (o anúncio não pode ter o logo). Todo o resto é a página como está na pasta no momento do render. */
const fs = require('fs'), path = require('path'), http = require('http'), { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '../../..');                 // projetos/creat-nuvem
const SEDE = path.resolve(RAIZ, '../../sede');
const TMP = process.env.REELS_TMP || '/tmp/reels';
const FONTES = path.join(TMP, 'fontes');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.cjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' };

/* ---------- fontes da casa (Google Fonts), guardadas em /tmp para o Chromium não depender da rede a cada quadro */
function garantirFontes() {
  fs.mkdirSync(FONTES, { recursive: true });
  const css = path.join(FONTES, 'g.css');
  const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
  if (!fs.existsSync(css)) execFileSync('curl', ['-sS', '--max-time', '30', '-A', UA, '-o', css, 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700;800;900&family=JetBrains+Mono:wght@500;700&family=Lilita+One&display=swap']);
  const urls = [...new Set((fs.readFileSync(css, 'utf8').match(/https:\/\/fonts\.gstatic\.com[^)]+/g) || []))];
  for (const u of urls) { const f = path.join(FONTES, new URL(u).pathname.slice(1).replace(/\//g, '_')); if (!fs.existsSync(f)) execFileSync('curl', ['-sS', '--max-time', '30', '-o', f, u]); }
  if (!urls.length) throw new Error('Google Fonts sem arquivos: confira a rede');
  return urls.length;
}
async function rotearFontes(alvo) {
  await alvo.route(/fonts\.googleapis\.com/, r => r.fulfill({ path: path.join(FONTES, 'g.css'), contentType: 'text/css' }));
  await alvo.route(/fonts\.gstatic\.com/, r => { const f = path.join(FONTES, new URL(r.request().url()).pathname.slice(1).replace(/\//g, '_')); return fs.existsSync(f) ? r.fulfill({ path: f, contentType: 'font/woff2' }) : r.abort(); });
}

/* ---------- servidor local igual ao de scripts/conferir-moldura.cjs (X-Frame-Options: DENY em tudo) */
function servidor() {
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      const p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
      let f;
      if (p.startsWith('/sede/')) f = path.join(SEDE, p.slice(6));
      else if (p.startsWith('/__tmp/')) f = path.join(TMP, p.slice(7));
      else f = path.join(RAIZ, p);
      const dentro = f.startsWith(RAIZ) || f.startsWith(SEDE) || f.startsWith(TMP);
      if (dentro && fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
      if (!dentro || !fs.existsSync(f)) { r.writeHead(404, { 'x-frame-options': 'DENY' }); return r.end(); }
      r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'x-frame-options': 'DENY', 'cache-control': 'no-store' });
      fs.createReadStream(f).pipe(r);
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

/* ---------- controle das animações da página: pausa e posiciona no tempo do vídeo */
const SEEK = ms => {
  const w = window, m = w.__nascReel || (w.__nascReel = new WeakMap());
  for (const a of document.getAnimations()) {
    if (!m.has(a)) { m.set(a, ms); try { a.pause(); } catch (e) {} }
    const v = ms - m.get(a);
    try { a.currentTime = v < 0 ? 0 : v; } catch (e) {}
  }
};
async function posicionar(pg, t) {
  const ms = Math.round(t * 1000 * 1000) / 1000;
  for (const fr of pg.frames()) { try { await fr.evaluate(SEEK, ms); } catch (e) {} }
}

async function novaPagina(browser, hora, extra) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    locale: 'pt-BR', timezoneId: 'America/Bahia', colorScheme: 'light', reducedMotion: 'no-preference' });
  await rotearFontes(ctx);
  await ctx.addInitScript(() => {
    window.__abertos = [];
    const o = window.open; window.open = function (u) { window.__abertos.push(String(u)); return null; };
    try { localStorage.setItem('creat:som', 'off'); } catch (e) {}
  });
  await ctx.clock.install({ time: new Date(hora) });
  const pg = await ctx.newPage();
  const erros = [];
  pg.on('pageerror', e => erros.push('script: ' + e.message.slice(0, 200)));
  pg.on('console', m => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) erros.push(m.text().slice(0, 200)); });
  return { ctx, pg, erros };
}

const ESCONDER_ZAP = '.zap-flutuante{display:none !important}html{scroll-behavior:auto !important}';

/* retângulos úteis da home, em px CSS da janela de 390x844 */
async function medirHome(pg) {
  return pg.evaluate(() => {
    const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    return { caixa: r('.palco-placa'), placa: r('#placa .cp-placa') || r('#placa'), campo: r('#nome'), contador: r('#contador-giz'), botao: r('#abrir-form button[type=submit]') || r('form button[type=submit]'), rolagem: scrollY };
  });
}

/* prepara a home como o visitante do anúncio chega: ?nicho=academia + UTM, nicho marcado, campo em foco */
async function prepararHome(pg, base, nicho) {
  await pg.goto(base + '/?nicho=' + nicho + '&utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=R8', { waitUntil: 'load' });
  await pg.addStyleTag({ content: ESCONDER_ZAP });
  await pg.waitForTimeout(1500);
  await pg.evaluate(() => document.fonts.ready);
  const t0 = Date.now() + 0;
  await pg.clock.pauseAt(new Date(await pg.evaluate(() => Date.now())).getTime() + 2000);
  /* marca o nicho (o visitante do anúncio de academia toca no chip) */
  await pg.evaluate(k => { const r = document.querySelector('input[name="nicho"][value="' + k + '"]'); if (r && !r.checked) r.click(); }, nicho);
  await pg.clock.runFor(400);
  /* enquadra: o vidro da vitrine logo abaixo da barra fixa do topo */
  await pg.evaluate(() => { const c = document.querySelector('.palco-placa'); const h = document.querySelector('header.barra'); const topo = h ? h.getBoundingClientRect().bottom : 0; const y = c.getBoundingClientRect().top + scrollY - topo - 4; window.scrollTo(0, Math.max(0, y)); });
  await pg.clock.runFor(200);
  await pg.evaluate(() => { const n = document.querySelector('#nome'); n.focus({ preventScroll: true }); });
  await pg.clock.runFor(200);
  return medirHome(pg);
}

/* valores em reais visíveis na janela (o vídeo não mostra preço: o palco cobre com o selo "exemplo") */
const PRECOS = () => [...document.querySelectorAll('body *')].filter(e => !e.children.length && /R\$\s?\d/.test(e.textContent) && e.offsetParent)
  .map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }).filter(r => r.y + r.h > 0 && r.y < 700 && r.w > 0);

function suave(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
function easeInOut(x) { return x <= 0 ? 0 : x >= 1 ? 1 : (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2); }
function easeOut(x) { return x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3); }

async function fotografar(pg, arq) { await pg.screenshot({ path: arq, clip: { x: 0, y: 0, width: 390, height: 660 }, type: 'png', animations: 'allow', caret: 'initial' }); }

/* ------------------------------------------------------------------ R8: sessões A e B (home real) */
async function capturarR8(browser, base, L, dir, log) {
  const R8 = L.R8, FPS = L.FPS, meta = { sessoes: {} };
  for (const nomeS of ['A', 'B']) {
    const S = R8.sessoes[nomeS];
    const pasta = path.join(dir, nomeS); fs.mkdirSync(pasta, { recursive: true });
    const { ctx, pg, erros } = await novaPagina(browser, R8.hora);
    const m0 = await prepararHome(pg, base, R8.nicho);
    let px = 0, py = 0;
    const ms = { inicio: m0, ponteiro: [], toques: [] };
    const f0 = Math.round(S.t0 * FPS), f1 = Math.round(S.t1 * FPS);
    let k = 0, apertado = false, soltou = false, prevAberta = false, relogioParado = false, rol = null, tocou = false;
    for (let f = f0; f < f1; f++) {
      const t = f / FPS;
      /* teclas reais */
      while (k < S.teclas.length && S.teclas[k].t <= t + 1e-6) { await pg.keyboard.type(S.teclas[k].ch); k++; }
      /* arraste real da placa (mouse do navegador) */
      const A = S.arraste;
      if (!apertado && t >= A.t0 - 1e-6) { const pl = (await medirHome(pg)).placa; px = pl.x + pl.w * 0.5; py = pl.y + pl.h * (0.32 + 0.667 * 0.55); /* meio da tábua */ await pg.mouse.move(px, py); await pg.mouse.down(); apertado = true; }
      if (apertado && !soltou) {
        const dy = A.dy * easeOut((t - A.t0) / (A.t1 - A.t0));
        await pg.mouse.move(px, py + dy);
        ms.ponteiro.push({ t, x: px, y: py + dy, dentro: true });
        if (t >= A.solta - 1e-6) { await pg.mouse.up(); soltou = true; ms.ponteiro.push({ t, x: px, y: py + dy, dentro: false }); }
      }
      /* sessão B: o visitante rola a página um pouco para ver o campo do nome (rolagem real) */
      if (S.rolarHome && t >= S.rolarHome.t0 && t <= S.rolarHome.t1 + 1e-6) {
        if (ms.rolagemHome == null) ms.rolagemHome = await pg.evaluate(() => scrollY);
        const y = ms.rolagemHome + S.rolarHome.dy * easeInOut((t - S.rolarHome.t0) / (S.rolarHome.t1 - S.rolarHome.t0));
        await pg.evaluate(y => window.scrollTo(0, y), y);
        if (t + 1 / FPS > S.rolarHome.t1) ms.depoisRolar = await medirHome(pg);
      }
      /* sessão A: o relógio da página para logo depois do giro, então a prévia não abre antes do corte em 2,4 s */
      if (S.relogioParaEm != null && t >= S.relogioParaEm) relogioParado = true;
      /* sessão B: depois que a prévia abre, rola a prévia (rolagem real do documento) */
      if (S.rolagem) {
        const fr = pg.frames().find(x => x.url().startsWith('blob:'));
        if (fr && !prevAberta) { prevAberta = true; try { await fr.waitForLoadState('load', { timeout: 8000 }); } catch (e) {} ms.previaEm = t; }
        /* rolagem em etapas: cada etapa mede o alvo na hora em que começa (texto real da prévia) */
        const etapas = Array.isArray(S.rolagem) ? S.rolagem : [S.rolagem];
        for (const E of etapas) {
          if (fr && t >= E.t0 - 1e-6 && !E.__feito) {
            E.__feito = true;
            const fb = await (await fr.frameElement()).boundingBox();
            rol = await fr.evaluate(({ alvo, yTela, topo }) => {
              document.documentElement.style.scrollBehavior = 'auto';
              const hs = [...document.querySelectorAll('h1,h2,h3')];
              const el = alvo === 'nome' ? hs.find(e => e.tagName === 'H1') : (hs.find(e => /pe[çc]a a sua aula experimental|pe[çc]a o seu hor[áa]rio/i.test(e.textContent)) || document.getElementById('fita-dias'));
              const y = el ? el.getBoundingClientRect().top + scrollY - (yTela - topo) : 1600;
              return { de: scrollY, para: Math.max(0, y), alvo };
            }, { alvo: E.alvo, yTela: E.y, topo: fb.y });
            rol.t0 = E.t0; rol.t1 = E.t1;
            (ms.rolagem = ms.rolagem || []).push(rol);
          }
        }
        if (fr && rol) {
          const y = rol.de + (rol.para - rol.de) * easeInOut((t - rol.t0) / (rol.t1 - rol.t0));
          await fr.evaluate(y => window.scrollTo(0, y), y);
        }
        if (fr && S.toqueDia && t >= S.toqueDia - 1e-6 && !tocou) {
          tocou = true;
          const alvo = await fr.evaluate(() => {
            const d = [...document.querySelectorAll('#fita-dias .dia, #fita-dias button')].filter(b => !b.disabled && b.getAttribute('aria-pressed') !== 'true');
            const b = d[0]; if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
          });
          if (alvo) {
            const fe = await fr.frameElement(); const fb = await fe.boundingBox();
            const x = fb.x + alvo.x, y = fb.y + alvo.y;
            if (y < 600) { await pg.mouse.click(x, y); ms.toques.push({ t, x, y }); }
          }
        }
      }
      if (!relogioParado) await pg.clock.runFor(1000 / FPS);
      await posicionar(pg, t);
      await fotografar(pg, path.join(pasta, String(f).padStart(4, '0') + '.png'));
      if (f % 30 === 0) log('  R8/' + nomeS + ' ' + t.toFixed(1) + ' s');
    }
    ms.fim = await medirHome(pg).catch(() => null);
    ms.erros = erros;
    meta.sessoes[nomeS] = ms;
    await ctx.close();
  }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
  return meta;
}

/* ------------------------------------------------------------------ R7: prévia real da barbearia às 23h12 */
async function capturarR7(browser, base, L, dir, log) {
  const R7 = L.R7, FPS = L.FPS, S = R7.sessoes.C;
  const pasta = path.join(dir, 'C'); fs.mkdirSync(pasta, { recursive: true });
  const { ctx, pg, erros } = await novaPagina(browser, R7.hora);
  const frag = '#k=' + R7.nicho + '&n=' + encodeURIComponent(R7.nome) + '&p=1';
  await pg.goto(base + '/previa/' + frag, { waitUntil: 'load' });
  await pg.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await pg.waitForTimeout(1500);
  await pg.evaluate(() => document.fonts.ready);
  await pg.clock.pauseAt(new Date(await pg.evaluate(() => Date.now())).getTime() + 2000);
  await pg.clock.runFor(300);
  const meta = { toques: [], erros };
  /* posições dos alvos (dia de amanhã, 10h, Corte), procuradas pelo texto real da página */
  const ACHAR = {
    dia: () => { const bs = [...document.querySelectorAll('#fita-dias button, #fita-dias .dia')].filter(b => !b.disabled); const hoje = bs.findIndex(b => /hoje/i.test(b.textContent)); return bs[hoje >= 0 ? hoje + 1 : 1]; },
    hora: () => [...document.querySelectorAll('button')].find(b => /^\s*10h\s*$/.test(b.textContent) && !b.disabled && b.offsetParent),
    servico: () => [...document.querySelectorAll("button, label, [role=radio]")].find(b => /^\s*Corte\s*\d/.test(b.textContent) && b.offsetParent)
  };
  async function ret(alvo) {
    return pg.evaluate(src => { const e = (0, eval)('(' + src + ')')(); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: r.top, h: r.height, sy: scrollY, txt: e.textContent.trim().slice(0, 40) }; }, ACHAR[alvo].toString());
  }
  const VIS = 360; /* altura (px CSS) da janela mostrada no vídeo */
  let rol = null; const feitos = new Set();
  const f0 = Math.round(S.t0 * FPS), f1 = Math.round(S.t1 * FPS);
  for (let f = f0; f < f1; f++) {
    const t = f / FPS;
    /* rolagem inicial até a fita de dias */
    if (t >= S.rolagem[0] && !feitos.has('rol0')) {
      feitos.add('rol0');
      const d = await ret('dia');
      rol = { t0: S.rolagem[0], t1: S.rolagem[1], de: d.sy, para: Math.max(0, d.sy + d.top - 70) };
    }
    for (const q of S.toques) {
      if (q.rolarAntes && t >= q.rolarAntes[0] && !feitos.has('rol-' + q.alvo)) {
        feitos.add('rol-' + q.alvo);
        const d = await ret(q.alvo);
        if (d && (d.top < 60 || d.top + d.h > VIS - 40)) rol = { t0: q.rolarAntes[0], t1: q.rolarAntes[1], de: d.sy, para: Math.max(0, d.sy + d.top - VIS * 0.42) };
      }
      if (t >= q.t - 1e-6 && !feitos.has('toque-' + q.alvo)) {
        feitos.add('toque-' + q.alvo);
        const d = await ret(q.alvo);
        if (d) { await pg.mouse.click(d.x, d.y); meta.toques.push({ t, x: d.x, y: d.y, alvo: q.alvo, txt: d.txt }); }
        else meta.toques.push({ t, alvo: q.alvo, falhou: true });
      }
    }
    if (rol && t >= rol.t0) {
      const y = rol.de + (rol.para - rol.de) * easeInOut((t - rol.t0) / (rol.t1 - rol.t0));
      await pg.evaluate(y => window.scrollTo(0, y), y);
    }
    await pg.clock.runFor(1000 / FPS);
    await posicionar(pg, t);
    (meta.precos = meta.precos || {})[f] = await pg.evaluate(PRECOS);
    await fotografar(pg, path.join(pasta, String(f).padStart(4, '0') + '.png'));
    if (f % 30 === 0) log('  R7/C ' + t.toFixed(1) + ' s');
  }
  /* fora de cena: completa o pedido de teste para pegar a mensagem REAL que o site monta */
  try {
    await pg.clock.runFor(500);
    await pg.evaluate(() => { const n = document.querySelector('#cliente-nome, input[name=nome]'); const w = document.querySelector('#cliente-whats, input[name=whats]'); if (n) n.scrollIntoView(); });
    await pg.clock.runFor(200);
    const nome = pg.locator('#cliente-nome, input[name=nome]').first(); await nome.fill('Rafael');
    const wh = pg.locator('#cliente-whats, input[name=whats]').first(); await wh.fill('11900000000');
    await pg.clock.runFor(200);
    const b = pg.locator('#confirmar-sem-arrastar'); if (await b.count()) { await b.scrollIntoViewIfNeeded(); await b.click(); }
    await pg.clock.runFor(800);
    meta.abertos = await pg.evaluate(() => window.__abertos);
  } catch (e) { meta.erroMensagem = e.message; }
  const u = (meta.abertos || []).find(x => /wa\.me/.test(x));
  if (u) { meta.urlWhats = u; meta.mensagem = new URL(u).searchParams.get('text'); }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
  await ctx.close();
  return meta;
}

module.exports = { garantirFontes, rotearFontes, servidor, capturarR8, capturarR7, RAIZ, TMP };
