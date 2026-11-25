/* Captura quadro a quadro da página REAL (home, prévia) para os Reels "Atrás da placa".
   Órbita, 10/11/2026; página nova (título pelo nicho, botão "Ver meu site pronto") em 11/11/2026.
   Usado por gerar.cjs; não roda sozinho. Tipos de captura em CAPTURAS (fim do arquivo): 'home', 'previa', 'sede' e 'recortes'.

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
/* g = mapa do giro (linhas.js, GIRO): só o trecho do verso da placa (90° a 270°) ganha 4 quadros; o resto segue o relógio */
const SEEK = ({ ms, g }) => {
  const w = window, m = w.__nascReel || (w.__nascReel = new WeakMap());
  const local = u => (u <= g.v90 ? u : u <= g.v90 + g.D ? g.v90 + (u - g.v90) * (g.v270 - g.v90) / g.D : u - g.D + (g.v270 - g.v90));
  for (const a of document.getAnimations()) {
    if (!m.has(a)) { m.set(a, ms); try { a.pause(); } catch (e) {} }
    let v = ms - m.get(a); if (v < 0) v = 0;
    const el = a.effect && a.effect.target, cl = el && el.classList;
    if (cl && (cl.contains('cp-giro') || cl.contains('cp-fechado') || cl.contains('cp-aberto')) && Math.round(a.effect.getTiming().duration) === g.ms) v = local(v);
    try { a.currentTime = v; } catch (e) {}
  }
};
let GIRO_MAPA = null;
async function posicionar(pg, t) {
  const ms = Math.round(t * 1000 * 1000) / 1000;
  for (const fr of pg.frames()) { try { await fr.evaluate(SEEK, { ms, g: GIRO_MAPA }); } catch (e) {} }
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
    return { caixa: r('.palco-placa'), placa: r('#placa .cp-placa') || r('#placa'), campo: r('#nome'), contador: r('#contador-giz'), botao: r('#form-abrir button[type=submit]') || r('form button[type=submit]'),
      titulo: r('#h1'), tituloTexto: ([...document.querySelectorAll('#h1 .h1-v')].find(e => e.getBoundingClientRect().width > 0) || {}).textContent || '', botaoTexto: ((document.querySelector('#form-abrir button[type=submit]') || {}).textContent || '').trim(), rolagem: scrollY };
  });
}

/* prepara a home como o visitante do anúncio chega: ?nicho=<nicho> + UTM, nicho marcado, campo em foco.
   inicio: { ancora: 'topo' } (página no topo, título do nicho à vista) ou { ancora: '<css>', y } (o elemento fica
   y px CSS abaixo do topo da janela). */
async function prepararHome(pg, base, nicho, codigo, inicio) {
  await pg.goto(base + '/?nicho=' + nicho + '&utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=' + codigo, { waitUntil: 'load' });
  await pg.addStyleTag({ content: ESCONDER_ZAP });
  await pg.waitForTimeout(1500);
  await pg.evaluate(() => document.fonts.ready);
  const t0 = Date.now() + 0;
  await pg.clock.pauseAt(new Date(await pg.evaluate(() => Date.now())).getTime() + 2000);
  /* marca o nicho (o visitante do anúncio de academia toca no chip) */
  await pg.evaluate(k => { const r = document.querySelector('input[name="nicho"][value="' + k + '"]'); if (r && !r.checked) r.click(); }, nicho);
  await pg.clock.runFor(400);
  /* enquadra (rolagem instantânea, antes do primeiro quadro) */
  await pg.evaluate(ini => {
    if (!ini || ini.ancora === 'topo') { window.scrollTo(0, 0); return; }
    const c = document.querySelector(ini.ancora); if (!c) throw new Error('âncora sumiu da página: ' + ini.ancora);
    window.scrollTo(0, Math.max(0, c.getBoundingClientRect().top + scrollY - ini.y));
  }, inicio || null);
  await pg.clock.runFor(200);
  await pg.evaluate(() => { const n = document.querySelector('#nome'); n.focus({ preventScroll: true }); });
  await pg.clock.runFor(200);
  return medirHome(pg);
}

/* valores em reais visíveis na janela (o vídeo não mostra preço: o palco cobre com o selo "exemplo") */
const PRECOS = () => [...document.querySelectorAll('body *')].filter(e => !e.children.length && /R\$\s?\d/.test(e.textContent) && e.offsetParent)
  .map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }).filter(r => r.y + r.h > 0 && r.y < 700 && r.w > 0);

const PRECOS_ATE = ate => [...document.querySelectorAll('body *')].filter(e => !e.children.length && /R\$\s?\d/.test(e.textContent) && e.offsetParent)
  .map(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }).filter(r => r.y + r.h > 0 && r.y < ate && r.w > 0);

function suave(x) { return x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x); }
function easeInOut(x) { return x <= 0 ? 0 : x >= 1 ? 1 : (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2); }
function senoide(x) { return x <= 0 ? 0 : x >= 1 ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * x); }  /* pico de velocidade 1,57x a média */
/* rolagem longa: acelera em 25% do tempo, anda constante e freia em 25% (pico 1,33x a média, contra 1,57x da senoide) */
function trapezio(x, a = 0.25) { if (x <= 0) return 0; if (x >= 1) return 1; const v = 1 / (1 - a); if (x < a) return v * x * x / (2 * a); if (x > 1 - a) return 1 - v * (1 - x) * (1 - x) / (2 * a); return v * (a / 2 + (x - a)); }
function easeOut(x) { return x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3); }

async function fotografar(pg, arq, alto = 660) { await pg.screenshot({ path: arq, clip: { x: 0, y: 0, width: 390, height: alto }, type: 'png', animations: 'allow', caret: 'initial' }); }

/* ------------------------------------------------------------------ 'home': sessões na página inicial real (R8)
   Cada sessão (R.sessoes.A, B, ...) abre a home do zero e grava de t0 a t1. Ações possíveis por sessão:
   teclas (digitação real), arraste (puxão real da placa), rolarHome (rolagem do visitante), toqueBotao (toque real
   em "Ver meu site pronto"), rolagem (dentro da prévia), toqueDia (dia na prévia), relogioParaEm. */
/* R8, R10 e R11: o campo "Cidade (opcional)" tem o exemplo "Exemplo: Campinas", e nome de cidade é proibido nos criativos.
   Única intervenção visual além do botão flutuante: o texto de exemplo desse campo fica transparente (o rótulo fica). */
const SEM_CIDADE_EXEMPLO = '#cidade::placeholder{color:transparent !important}';
/* link do WhatsApp que o site abre (âncora com target _blank): a rota guarda o endereço e devolve página vazia, nada sai */
async function segurarWhats(ctx, lista) {
  await ctx.route(/^https:\/\/(wa\.me|api\.whatsapp\.com)\//, r => { lista.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/html', body: '' }); });
  ctx.on('page', p => { setTimeout(() => p.close().catch(() => {}), 1500); });
}
/* R10 e R11 mostram trechos da página onde o aviso de medição (faixa fixa) apareceria por cima: entra como quem já
   recusou a medição (escolha gravada no aparelho, sem Pixel e sem nada enviado à Meta), e o aviso não aparece */
const RECUSA_GUARDADA = () => { try { localStorage.setItem('creat:consentimento', JSON.stringify({ versao: 1, analytics: true, pixel: false, clarity: false, em: new Date(Date.now() - 3600e3).toISOString() })); } catch (e) {} };
/* o site abre o WhatsApp por uma âncora com target _blank (abrirExterno): o endereço é guardado e a aba não abre */
const PRENDER_ANCORA = () => { const ac = HTMLAnchorElement.prototype.click; window.__abertos = window.__abertos || [];
  HTMLAnchorElement.prototype.click = function () { if (this.target === '_blank') { window.__abertos.push(String(this.href)); return; } return ac.call(this); }; };
/* espera (no relógio real, do lado do node) uma condição da página: o relógio falso não anda sozinho */
async function esperarPagina(pg, fn, arg, ms = 8000) {
  for (let i = 0; i < ms / 100; i++) { if (await pg.evaluate(fn, arg).catch(() => false)) return true; await new Promise(r => setTimeout(r, 100)); }
  return false;
}

async function capturarHome(browser, base, L, reel, dir, log) {
  const R8 = L[reel], FPS = L.FPS, meta = { sessoes: {} };
  GIRO_MAPA = { ms: L.GIRO.ms, v90: L.GIRO.v90, v270: L.GIRO.v270, D: L.GIRO.D };
  for (const nomeS of Object.keys(R8.sessoes)) {
    const S = JSON.parse(JSON.stringify(R8.sessoes[nomeS]));
    const pasta = path.join(dir, nomeS); fs.mkdirSync(pasta, { recursive: true });
    const { ctx, pg, erros } = await novaPagina(browser, R8.hora);
    const whats = [], ms0 = {};
    if (S.toqueEnviar) { await segurarWhats(ctx, whats); await ctx.addInitScript(RECUSA_GUARDADA); }
    const m0 = await prepararHome(pg, base, R8.nicho, reel, S.inicio);
    /* toda sessão da home (R8 e R11): o exemplo "Exemplo: Campinas" do campo Cidade fica transparente (nome de cidade
       é proibido nos criativos; o rótulo "Cidade (opcional)" fica). Conferido abaixo, antes do primeiro quadro. */
    await pg.addStyleTag({ content: SEM_CIDADE_EXEMPLO });
    ms0.cidadeExemplo = await pg.evaluate(() => { const c = document.querySelector('#cidade'); return c ? getComputedStyle(c, '::placeholder').color : null; });
    if (ms0.cidadeExemplo && !/rgba\(0, 0, 0, 0\)|transparent/.test(ms0.cidadeExemplo)) throw new Error('o exemplo do campo Cidade continua visível: ' + ms0.cidadeExemplo);
    if (S.toqueEnviar) {
      await pg.evaluate(PRENDER_ANCORA);
      /* "Teste de verdade": as listas reais de serviço e dia do nicho precisam estar montadas antes do primeiro quadro.
         O site só monta as listas quando a seção chega perto da tela (IntersectionObserver): a página desce até ela
         fora de cena, o relógio anda, e volta ao enquadramento do primeiro quadro */
      const volta = await pg.evaluate(() => scrollY);
      await pg.evaluate(() => document.getElementById('teste').scrollIntoView({ block: 'start' }));
      for (let i = 0; i < 10; i++) { await pg.clock.runFor(100); await new Promise(r => setTimeout(r, 100)); }
      const pronto = await esperarPagina(pg, k => document.getElementById('teste-nicho').textContent.toLowerCase().startsWith(k.slice(0, 5)) && document.querySelectorAll('#teste-servico option').length > 1 && document.querySelectorAll('#teste-dia option').length > 1, R8.nicho);
      if (!pronto) throw new Error('o teste de verdade não montou as listas do nicho ' + R8.nicho + ': ' + await pg.evaluate(() => document.getElementById('teste-nicho').textContent + ' / ' + document.querySelectorAll('#teste-servico option').length));
      /* o aviso de medição não aparece: a recusa já está gravada (RECUSA_GUARDADA) */
      ms0.aviso = { naTela: await pg.evaluate(() => { const c = document.getElementById('consentimento'); return !!(c && !c.hidden && c.getBoundingClientRect().height > 0); }) };
      if (ms0.aviso.naTela) throw new Error('o aviso de medição apareceu mesmo com a recusa gravada');
      await pg.evaluate(y => window.scrollTo(0, y), volta); await pg.clock.runFor(200);
      await pg.evaluate(() => { const n = document.querySelector('#nome'); n.focus({ preventScroll: true }); });
    }
    /* trava da página nova: título do nicho e o rótulo novo do botão; o rótulo antigo não pode aparecer */
    if (!/Ver meu site pronto/.test(m0.botaoTexto) || /Abrir meu neg/i.test(m0.botaoTexto)) throw new Error('botão da home não é "Ver meu site pronto": ' + m0.botaoTexto);
    if (!/^Veja o site/.test(m0.tituloTexto) || /aberto na internet/i.test(m0.tituloTexto)) throw new Error('título da home não é o novo: ' + m0.tituloTexto);
    const palavra = { barbearia: 'barbearia', salao: 'salão', academia: 'academia' }[R8.nicho];
    if (palavra && !m0.tituloTexto.includes(palavra)) throw new Error('título não é o do nicho ' + R8.nicho + ': ' + m0.tituloTexto);
    let px = 0, py = 0;
    const ms = Object.assign({ inicio: m0, ponteiro: [], toques: [] }, ms0);
    const f0 = Math.round(S.t0 * FPS), f1 = Math.round(S.t1 * FPS);
    let k = 0, apertado = false, soltou = false, prevAberta = false, relogioParado = false, rol = null, tocou = false;
    for (let f = f0; f < f1; f++) {
      const t = f / FPS;
      /* teclas reais */
      while (k < S.teclas.length && S.teclas[k].t <= t + 1e-6) { await pg.keyboard.type(S.teclas[k].ch); k++; }
      /* arraste real da placa (mouse do navegador) */
      const A = S.arraste || { t0: Infinity };
      if (!apertado && t >= A.t0 - 1e-6) { const pl = (await medirHome(pg)).placa; px = pl.x + pl.w * 0.5; py = pl.y + pl.h * (0.32 + 0.667 * 0.55); /* meio da tábua */ await pg.mouse.move(px, py); await pg.mouse.down(); apertado = true; }
      if (apertado && !soltou) {
        const dy = A.dy * easeOut((t - A.t0) / (A.t1 - A.t0));
        await pg.mouse.move(px, py + dy);
        ms.ponteiro.push({ t, x: px, y: py + dy, dentro: true });
        if (t >= A.solta - 1e-6) { await pg.mouse.up(); soltou = true; ms.ponteiro.push({ t, x: px, y: py + dy, dentro: false }); }
      }
      /* sessão B: o visitante rola a página um pouco para ver o campo do nome (rolagem real) */
      if (S.rolarHome && !Array.isArray(S.rolarHome) && t >= S.rolarHome.t0 && t <= S.rolarHome.t1 + 1e-6) {
        if (ms.rolagemHome == null) ms.rolagemHome = await pg.evaluate(() => scrollY);
        const y = ms.rolagemHome + S.rolarHome.dy * easeInOut((t - S.rolarHome.t0) / (S.rolarHome.t1 - S.rolarHome.t0));
        await pg.evaluate(y => window.scrollTo(0, y), y);
        if (t + 1 / FPS > S.rolarHome.t1) ms.depoisRolar = await medirHome(pg);
      }
      /* R11: rolagens em etapas até um alvo real (o alvo fica y px CSS abaixo do topo da janela) */
      if (Array.isArray(S.rolarHome)) for (const E of S.rolarHome) {
        if (t < E.t0 - 1e-6 || t > E.t1 + 1e-6) continue;
        if (E.__de == null) {
          E.__de = await pg.evaluate(() => scrollY);
          E.__para = await pg.evaluate(({ s, y }) => { const e = document.querySelector(s); if (!e) throw new Error('alvo da rolagem sumiu: ' + s); return Math.max(0, e.getBoundingClientRect().top + scrollY - y); }, { s: E.alvo, y: E.y });
          (ms.rolagens = ms.rolagens || []).push({ alvo: E.alvo, de: E.__de, para: E.__para, t0: E.t0, t1: E.t1 });
        }
        const y = E.__de + (E.__para - E.__de) * (E.curva === 'trapezio' ? trapezio : senoide)((t - E.t0) / (E.t1 - E.t0));
        await pg.evaluate(y => window.scrollTo(0, y), y);
      }
      /* R11: toque real no campo do WhatsApp de teste e digitação real do número de teste */
      if (S.campo && t >= S.campo.t - 1e-6 && !S.campo.__feito) {
        S.campo.__feito = true;
        const b = await pg.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, S.campo.alvo);
        await pg.mouse.click(b.x, b.y); ms.toques.push({ t, x: b.x, y: b.y, alvo: S.campo.alvo });
        S.campo.__k = 0;
      }
      if (S.campo && S.campo.__feito) while (S.campo.__k < S.campo.teclas.length && S.campo.teclas[S.campo.__k].t <= t + 1e-6) { await pg.keyboard.type(S.campo.teclas[S.campo.__k].ch); S.campo.__k++; }
      /* R11: escolhas nas listas reais (toque no centro da lista; a opção entra pelo selectOption, que dispara input e change) */
      for (const E of S.escolhas || []) {
        if (t < E.t - 1e-6 || E.__feito) continue;
        E.__feito = true;
        const b = await pg.evaluate(s => { const e = document.querySelector(s), r = e.getBoundingClientRect(); e.focus({ preventScroll: true }); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, E.alvo);
        if (b.y < 330 || b.y > 830) throw new Error('lista fora do celular do vídeo no toque: ' + E.alvo + ' y ' + b.y);
        const ok = await pg.selectOption(E.alvo, E.valor).catch(e => { throw new Error('opção que não existe na página: ' + E.alvo + ' = ' + E.valor); });
        ms.toques.push({ t, x: b.x, y: b.y, alvo: E.alvo, valor: ok });
      }
      /* R11: toque real em "Enviar o teste para o meu WhatsApp" */
      if (S.toqueEnviar && t >= S.toqueEnviar.t - 1e-6 && !ms.enviou) {
        const b = await pg.evaluate(s => { const e = document.querySelector(s), r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, txt: e.textContent.trim() }; }, S.toqueEnviar.alvo);
        if (!/Enviar o teste para o meu WhatsApp/.test(b.txt)) throw new Error('botão do teste mudou: ' + b.txt);
        if (b.y < 330 || b.y > 830) throw new Error('botão do teste fora do celular do vídeo: y ' + b.y);
        await pg.mouse.click(b.x, b.y); ms.toques.push({ t, x: b.x, y: b.y, alvo: 'enviar' }); ms.enviou = t;
      }
      /* toque real em "Ver meu site pronto": o site vira a placa na hora e abre a prévia 680 ms depois */
      if (S.toqueBotao != null && t >= S.toqueBotao - 1e-6 && !ms.toqueBotaoFeito) {
        const b = (await medirHome(pg)).botao;
        if (!b || b.y < 0 || b.y + b.h > 844) throw new Error('botão fora da janela no toque');
        const x = b.x + b.w / 2, y = b.y + b.h / 2;
        await pg.mouse.click(x, y); ms.toques.push({ t, x, y, alvo: 'botao' }); ms.toqueBotaoFeito = true;
        ms.antesDoToque = { rolagem: await pg.evaluate(() => scrollY) };
      }
      /* sessão A: o relógio da página para logo depois do giro, então a prévia não abre antes do corte em 2,4 s */
      if (S.relogioParaEm != null && t >= S.relogioParaEm) relogioParado = true;
      /* sessão B: depois que a prévia abre, rola a prévia (rolagem real do documento) */
      if (S.rolagem) {
        const fr = pg.frames().find(x => x.url().startsWith('blob:'));
        if (fr && !prevAberta) { prevAberta = true; try { await fr.waitForLoadState('load', { timeout: 8000 }); } catch (e) {} ms.quadroDaPreviaEm = t; }
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
            rol.t0 = E.t0; rol.t1 = E.t1; rol.curva = E.curva || 'senoide';
            (ms.rolagem = ms.rolagem || []).push(rol);
          }
        }
        if (fr && rol) {
          const y = rol.de + (rol.para - rol.de) * (rol.curva === 'trapezio' ? trapezio : senoide)((t - rol.t0) / (rol.t1 - rol.t0));
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
            if (y < 560) { await pg.mouse.click(x, y); ms.toques.push({ t, x, y, alvo: 'dia' }); }
          }
        }
      }
      if (!relogioParado) await pg.clock.runFor(1000 / FPS);
      await posicionar(pg, t);
      /* valores em reais da prévia aberta, em px CSS da janela: o palco cobre com "exemplo" (não confundir com o preço do Porta Aberta) */
      /* previaEm = primeiro quadro em que a prévia está de fato na tela (camada aberta e moldura visível), que é
         onde o palco troca a legenda e põe o selo da prévia (a camada entra com fade de ~3 quadros: conta a partir da metade) */
      if (prevAberta && ms.previaEm == null && await pg.evaluate(() => { const p = document.getElementById('previa'), f = document.getElementById('previa-frame'), c = document.getElementById('previa-carregando'); return !!(p && !p.hidden && f && getComputedStyle(f).visibility !== 'hidden' && (!c || c.hidden) && parseFloat(getComputedStyle(p).opacity) >= 0.5); })) ms.previaEm = t;
      const frP = prevAberta && pg.frames().find(x => x.url().startsWith('blob:'));
      if (frP) {
        const fb = await (await frP.frameElement()).boundingBox();
        const lista = await frP.evaluate(PRECOS).catch(() => []);
        (ms.precos = ms.precos || {})[f] = lista.map(b => ({ x: b.x + fb.x, y: b.y + fb.y, w: b.w, h: b.h })).filter(b => b.y + b.h > 0 && b.y < 720);
      }
      /* R11: o que o palco cobre com faixa (número de teste), em px CSS da janela; só depois de o campo ter valor */
      if (S.cobrir) (ms.cobrir = ms.cobrir || {})[f] = await pg.evaluate(lista => lista.map(c => { const e = document.querySelector(c.sel); if (!e || !e.value) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, rotulo: c.rotulo }; }).filter(Boolean), S.cobrir);
      /* valores em reais na própria home (o vídeo não mostra preço fora da faixa do cartão) */
      if (S.toqueEnviar) { const lp = await pg.evaluate(PRECOS_ATE, S.alto || 720); if (lp.length) (ms.precosHome = ms.precosHome || {})[f] = lp; }
      await fotografar(pg, path.join(pasta, String(f).padStart(4, '0') + '.png'), S.alto || 720);
      if (f % 30 === 0) log('  ' + reel + '/' + nomeS + ' ' + t.toFixed(1) + ' s');
    }
    ms.fim = await medirHome(pg).catch(() => null);
    /* nenhum quadro pode mostrar o rótulo ou o título antigos (a página inteira é lida, inclusive a prévia) */
    ms.textoAntigo = await pg.evaluate(() => /Abrir meu neg[óo]cio|Seu neg[óo]cio aberto na internet/i.test(document.body.innerText)).catch(() => null);
    ms.erros = erros;
    /* R11: a mensagem REAL que o site montou para o WhatsApp (o número de teste não entra no vídeo) */
    if (S.toqueEnviar) {
      await new Promise(r => setTimeout(r, 300));
      const u = (ms.abertos = await pg.evaluate(() => window.__abertos || []).catch(() => [])).concat(whats).find(x => /wa\.me|whatsapp/.test(x));
      if (!u) throw new Error('o toque em "Enviar o teste" não abriu o WhatsApp');
      const url = new URL(u); ms.mensagem = url.searchParams.get('text'); ms.numeroTeste = url.pathname.replace(/\D/g, '') === '5511900000000' || url.pathname.replace(/\D/g, '') === '11900000000';
      meta.mensagem = ms.mensagem;
    }
    meta.sessoes[nomeS] = ms;
    await ctx.close();
  }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
  return meta;
}

/* ------------------------------------------------------------------ 'previa': prévia real direta (R7, barbearia às 23h12)
   Uma sessão (a primeira de R.sessoes): rolagem até o nome, salto de montagem até o pedido e toques em dia, hora e
   serviço; fora de cena completa o pedido de teste para pegar a mensagem REAL que o site monta. */
async function capturarPrevia(browser, base, L, reel, dir, log) {
  const R7 = L[reel], FPS = L.FPS, nomeSessao = Object.keys(R7.sessoes)[0], S = R7.sessoes[nomeSessao];
  GIRO_MAPA = { ms: L.GIRO.ms, v90: L.GIRO.v90, v270: L.GIRO.v270, D: L.GIRO.D };
  const pasta = path.join(dir, nomeSessao); fs.mkdirSync(pasta, { recursive: true });
  const { ctx, pg, erros } = await novaPagina(browser, R7.hora);
  const frag = '#k=' + R7.nicho + '&n=' + encodeURIComponent(R7.nome) + '&p=1';
  await pg.goto(base + '/previa/' + frag, { waitUntil: 'load' });
  await pg.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await pg.waitForTimeout(1500);
  await pg.evaluate(() => document.fonts.ready);
  await pg.clock.pauseAt(new Date(await pg.evaluate(() => Date.now())).getTime() + 2000);
  await pg.clock.runFor(300);
  const meta = { toques: [], erros };
  /* posições dos alvos, procuradas pelo texto real da página. Padrão (R7): dia de amanhã, horário de S.hora e "Corte".
     R12 (salão): S.dia = começo do rótulo do dia na fita ("sáb"), S.servico = nome do serviço ("Manicure"). */
  const ACHAR = {
    dia: a => { const bs = [...document.querySelectorAll('#fita-dias button, #fita-dias .dia')].filter(b => !b.disabled);
      if (a.dia) return bs.find(b => b.textContent.trim().toLowerCase().startsWith(a.dia));
      const hoje = bs.findIndex(b => /hoje/i.test(b.textContent)); return bs[hoje >= 0 ? hoje + 1 : 1]; },
    /* a prévia mostra a tarde aberta e guarda manhã e noite atrás de "Ver manhã" / "Ver noite" (11/11/2026): o horário
       vem de linhas.js (S.hora) e precisa ser um dos que aparecem sem toque extra */
    hora: a => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === a.hora && !b.disabled && b.offsetParent),
    servico: a => [...document.querySelectorAll("button, label, [role=radio]")].find(b => new RegExp('^\\s*' + a.servico + '\\s*\\d').test(b.textContent) && b.offsetParent)
  };
  const ARG = { hora: S.hora || '14h', dia: S.dia || null, servico: S.servico || 'Corte' };
  async function ret(alvo) {
    return pg.evaluate(({ src, arg }) => { const e = (0, eval)('(' + src + ')')(arg); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, top: r.top, h: r.height, sy: scrollY, txt: e.textContent.trim().slice(0, 40) }; }, { src: ACHAR[alvo].toString(), arg: ARG });
  }
  const VIS = 360; /* altura (px CSS) da janela mostrada no vídeo */
  let rol = null; const feitos = new Set();
  const f0 = Math.round(S.t0 * FPS), f1 = Math.round(S.t1 * FPS);
  for (let f = f0; f < f1; f++) {
    const t = f / FPS;
    /* primeira rolagem: até o nome do negócio (h1 da prévia), que fica parado na tela */
    if (t >= S.rolagem.t0 - 1e-6 && !feitos.has('rol0')) {
      feitos.add('rol0');
      const d = await pg.evaluate(() => { const h = document.querySelector('h1'); return { sy: scrollY, top: h.getBoundingClientRect().top }; });
      rol = { t0: S.rolagem.t0, t1: S.rolagem.t1, de: d.sy, para: Math.max(0, d.sy + d.top - S.rolagem.y) };
      (meta.rolagens = meta.rolagens || []).push(Object.assign({ alvo: 'nome' }, rol));
    }
    /* corte de montagem: no quadro do salto a página já está no pedido (o palco funde os dois quadros em 0,2 s) */
    if (S.salto && t >= S.salto.t - 1e-6 && !feitos.has('salto')) {
      feitos.add('salto'); rol = null;
      const y = await pg.evaluate(yF => { const f = document.getElementById('fita-dias'); return f.getBoundingClientRect().top + scrollY - yF; }, S.salto.yFita);
      await pg.evaluate(y => window.scrollTo(0, y), Math.max(0, y));
      meta.salto = { t, y };
    }
    for (const q of S.toques) {
      if (q.rolarAntes && t >= q.rolarAntes[0] && !feitos.has('rol-' + q.alvo)) {
        feitos.add('rol-' + q.alvo);
        const d = await ret(q.alvo);
        if (d && (d.top < 60 || d.top + d.h > VIS - 40)) { rol = { t0: q.rolarAntes[0], t1: q.rolarAntes[1], de: d.sy, para: Math.max(0, d.sy + d.top - VIS * 0.42) }; (meta.rolagens = meta.rolagens || []).push(Object.assign({ alvo: q.alvo }, rol)); }
      }
      if (t >= q.t - 1e-6 && !feitos.has('toque-' + q.alvo)) {
        feitos.add('toque-' + q.alvo);
        const d = await ret(q.alvo);
        if (d) { await pg.mouse.click(d.x, d.y); meta.toques.push({ t, x: d.x, y: d.y, alvo: q.alvo, txt: d.txt }); }
        else meta.toques.push({ t, alvo: q.alvo, falhou: true });
      }
    }
    /* rolagem só dentro da janela dela: o salto do link "Pedir horário" não pode ser desfeito depois */
    if (rol && t >= rol.t0 - 1e-6 && t < rol.t1 + 1 / FPS - 1e-6) {
      const y = rol.de + (rol.para - rol.de) * senoide((t - rol.t0) / (rol.t1 - rol.t0));
      await pg.evaluate(y => window.scrollTo(0, y), y);
    }
    (meta.rolagemY = meta.rolagemY || {})[f] = await pg.evaluate(() => scrollY);
    await pg.clock.runFor(1000 / FPS);
    await posicionar(pg, t);
    (meta.precos = meta.precos || {})[f] = await pg.evaluate(PRECOS);
    await fotografar(pg, path.join(pasta, String(f).padStart(4, '0') + '.png'));
    if (f % 30 === 0) log('  ' + reel + '/' + nomeSessao + ' ' + t.toFixed(1) + ' s');
  }
  /* fora de cena: completa o pedido de teste para pegar a mensagem REAL que o site monta */
  try {
    await pg.clock.runFor(500);
    await pg.evaluate(() => { const n = document.querySelector('#cliente-nome, input[name=nome]'); const w = document.querySelector('#cliente-whats, input[name=whats]'); if (n) n.scrollIntoView(); });
    await pg.clock.runFor(200);
    const nome = pg.locator('#cliente-nome, input[name=nome]').first(); await nome.fill(R7.cliente || 'Rafael');
    const wh = pg.locator('#cliente-whats, input[name=whats]').first(); await wh.fill('11900000000');
    await pg.clock.runFor(200);
    const b = pg.locator('#confirmar-sem-arrastar'); if (await b.count()) { await b.scrollIntoViewIfNeeded(); await b.click(); }
    await pg.clock.runFor(800);
    meta.abertos = await pg.evaluate(() => window.__abertos);
  } catch (e) { meta.erroMensagem = e.message; }
  const u = (meta.abertos || []).find(x => /wa\.me/.test(x));
  if (u) { meta.urlWhats = u; meta.mensagem = new URL(u).searchParams.get('text'); }
  meta.textoAntigo = await pg.evaluate(() => /Abrir meu neg[óo]cio|Seu neg[óo]cio aberto na internet/i.test(document.body.innerText)).catch(() => null);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
  await ctx.close();
  return meta;
}

/* ------------------------------------------------------------------ 'sede': sede 3D real + topo da prévia (R9 · Quem Monta)
   Sessão tipo 'sede': sede/index.html?modo=demo (estado fictício embutido, nunca pedido real) com o nome na fachada.
   - um desenho por quadro do vídeo: o requestAnimationFrame da página vira uma fila que só anda quando o quadro
     manda (window.__quadro), com o relógio falso do Playwright. Entre planos o relógio anda sem desenhar (o ciclo
     da demonstração segue nos timers da própria página), então cada plano cai na etapa em que o agente trabalha;
   - three.js 0.160.0 servido do node_modules da raiz (mesma versão e mesmo hash de integridade do importmap);
   - câmera do vídeo: posta pelo script por plano (aproximação lenta), com teste de obstrução por raio como o
     enquadrar() da sede; os painéis de interface saem do quadro (marca, botões, ficha, elenco, carregando e a
     etiqueta "Demonstração", que o palco substitui pelo selo "sede da Creat · demonstração").
   Sessão tipo 'previaTopo': o topo da prévia real com o nome, rolando devagar. */
const THREE_NM = path.resolve(RAIZ, '../../node_modules/three');
const SEDE_SEM_UI = 'header.top,#card,#ops,#demoTag,#hint,#roster,#loader,#somDica{display:none !important}';
async function gravarSede(browser, base, R, S, pasta, FPS, log) {
  const ctx = await browser.newContext({ viewport: { width: S.janela.w, height: S.janela.h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    locale: 'pt-BR', timezoneId: 'America/Bahia', colorScheme: 'light', reducedMotion: 'no-preference' });
  await rotearFontes(ctx);
  await ctx.route(/cdn\.jsdelivr\.net\/npm\/three@0\.160\.0\//, r => {
    const f = path.join(THREE_NM, new URL(r.request().url()).pathname.replace('/npm/three@0.160.0/', ''));
    return f.startsWith(THREE_NM + path.sep) && fs.existsSync(f) ? r.fulfill({ path: f, contentType: 'text/javascript' }) : r.abort();
  });
  await ctx.clock.install({ time: new Date(R.hora) });
  await ctx.addInitScript(() => {
    let fila = [];
    window.requestAnimationFrame = cb => { fila.push(cb); return fila.length; };
    window.cancelAnimationFrame = () => {};
    window.__quadro = () => { const q = fila; fila = []; const t = performance.now(); q.forEach(cb => { try { cb(t); } catch (e) { console.error('quadro: ' + e.message); } }); return q.length; };
    try { localStorage.setItem('creat:som', 'off'); } catch (e) {}
  });
  const pg = await ctx.newPage(), erros = [];
  await pg.clock.pauseAt(new Date(new Date(R.hora).getTime() + 1000));
  pg.on('pageerror', e => erros.push('script: ' + e.message.slice(0, 200)));
  pg.on('console', m => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) erros.push(m.text().slice(0, 200)); });
  await pg.goto(base + '/sede/index.html?modo=demo&debug=1#marca=' + encodeURIComponent(R.nome), { waitUntil: 'load' });
  await pg.addStyleTag({ content: SEDE_SEM_UI });
  for (let i = 0; i < 60 && !(await pg.evaluate(() => !!window.__sede)); i++) await pg.waitForTimeout(250);
  if (!(await pg.evaluate(() => !!window.__sede))) throw new Error('a sede não montou (window.__sede)');
  await pg.evaluate(() => document.fonts.ready);
  /* o ciclo da demonstração nasce aqui: 1º passo 1,5 s depois de ligar e um passo a cada 6 s (sede/index.html, demoLigar) */
  const ms = { planos: [], erros };
  let agora = 0;
  const avancar = async dt => { if (dt > 0) { await pg.clock.runFor(dt); agora += dt; } };
  /* aquecimento fora de cena: o voo de abertura da sede (flyTo de 2,2 s) termina e os shaders compilam */
  await pg.evaluate(() => window.__quadro());
  await avancar(2400);
  await pg.evaluate(() => window.__quadro());
  await avancar(1000 / FPS);
  await pg.evaluate(() => window.__quadro());
  /* pose da câmera de cada plano, com teste de obstrução (árvore, poste, vizinho) como o enquadrar() da sede */
  const POSE = async P => pg.evaluate(async P => {
    const THREE = await import('three');
    const S = window.__sede, V = THREE.Vector3;
    if (P.alvo === 'geral') {
      const a0 = P.ang || 0, d = P.dist;
      return { pos: [Math.sin(a0) * d, d * 0.5, Math.cos(a0) * d], alvo: [0, P.alvoY == null ? 0.6 : P.alvoY, 0] };
    }
    const a = S.byId[P.alvo]; if (!a) throw new Error('agente sumiu da sede: ' + P.alvo);
    const head = new V(); a.head.getWorldPosition(head);
    const corpo = head.clone().add(new V(0, -0.75, 0)), Y = new V(0, 1, 0);
    const out0 = P.alvo === 'diretor' ? new V(0, 0, 1) : a.out.clone();
    const malhas = []; S.scene.traverse(o => { if (o.isMesh && o.visible) malhas.push(o); });
    const dono = o => { for (let p = o; p; p = p.parent) if (p === a.root || p === a.station) return true; return false; };
    const rc = new THREE.Raycaster();
    const tapa = (de, para) => { const d = para.clone().sub(de), L = d.length(); rc.set(de, d.normalize()); rc.near = 0.05; rc.far = L; return rc.intersectObjects(malhas, false).some(h => !dono(h.object)); };
    const em = (ang, dist) => head.clone().addScaledVector(out0.clone().applyAxisAngle(Y, ang), dist).add(new V(0, P.sobe, 0));
    const alvo = head.clone().add(new V(0, P.alvoY == null ? -0.45 : P.alvoY, 0));
    /* obstrução medida no quadro inteiro: 7x5 raios saem da câmera candidata pela tela; conta os que batem em alguma
       coisa (fora o chão) mais perto que o agente. Fica a pose com menos raios tapados (de preferência nenhum). */
    const cam = S.camera, guarda = cam.position.clone(), guardaQ = cam.quaternion.clone();
    const tapados = p => {
      cam.position.copy(p); cam.lookAt(alvo); cam.updateMatrixWorld(true);
      const dSuj = p.distanceTo(head) - 0.7; let n = 0;
      /* raio perto do centro (onde está o agente) pesa 4; borda pesa 1 */
      for (let iu = 0; iu < 11; iu++) for (let iv = 0; iv < 7; iv++) {
        const u = -0.96 + iu * 0.192, v = -0.9 + iv * 0.3;
        rc.setFromCamera({ x: u, y: v }, cam); rc.near = 0.05; rc.far = dSuj;
        if (rc.intersectObjects(malhas, false).some(h => !dono(h.object) && h.point.y > 0.12)) n += Math.abs(u) < 0.45 && Math.abs(v) < 0.65 ? 4 : 1;
      }
      return n;
    };
    const ANG = (P.angs || [0]).concat([0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6, 0.8, -0.8, 1.0, -1.0]);
    let pos = null, usado = null, melhor = 1e9;
    for (const dist of [P.dist, P.dist * 0.85, P.dist * 0.72, P.dist * 1.15]) { for (const g of ANG) { const p = em(g, dist), n = tapados(p); if (n < melhor) { melhor = n; pos = p; usado = g + '@' + dist.toFixed(2) + ' tapados ' + n; } if (!melhor) break; } if (!melhor) break; }
    cam.position.copy(guarda); cam.quaternion.copy(guardaQ); cam.updateMatrixWorld(true);
    return { pos: pos.toArray(), alvo: alvo.toArray(), ang: usado, estado: a.state };
  }, P);
  const f0 = Math.round(S.t0 * FPS);
  for (const P of S.planos) {
    /* relógio da página até a etapa do plano (sem desenhar): o agente do plano está trabalhando quando o plano começa */
    if (P.etapa != null) {
      const alvoMs = 1500 + 6000 * P.etapa + (P.dentro || 450);
      if (agora < alvoMs) await avancar(alvoMs - agora);
      else if (agora > 1500 + 6000 * (P.etapa + 1) - 300) throw new Error('plano ' + P.alvo + ' passou da etapa ' + P.etapa);
    }
    const pose = await POSE(P);
    const reg = { alvo: P.alvo, t0: P.t0, t1: P.t1, etapa: P.etapa, pose, paginaMs: agora };
    const fa = Math.round(P.t0 * FPS), fb = Math.round(P.t1 * FPS);
    /* REELS_SEDE_TESTE=1: só o primeiro e o último quadro de cada plano (conferir enquadramento sem gravar tudo) */
    const teste = process.env.REELS_SEDE_TESTE === '1';
    for (let f = fa; f < fb; f++) {
      if (teste && f !== fa && f !== fb - 1) { await avancar(1000 / FPS); continue; }
      const k = (f - fa) / Math.max(1, fb - fa - 1);
      /* aproximação lenta e contínua (a câmera nunca para dentro do plano): distância de P.de a P.ate do enquadramento */
      const esc = P.de + (P.ate - P.de) * k, giro = (P.gira || 0) * (k - 0.5);
      await pg.evaluate(({ pose, esc, giro }) => {
        const S = window.__sede, c = S.camera.position, t = S.controls.target;
        t.set(pose.alvo[0], pose.alvo[1], pose.alvo[2]);
        const dx = pose.pos[0] - pose.alvo[0], dz = pose.pos[2] - pose.alvo[2], cs = Math.cos(giro), sn = Math.sin(giro);
        c.set(pose.alvo[0] + (dx * cs + dz * sn) * esc, pose.alvo[1] + (pose.pos[1] - pose.alvo[1]) * esc, pose.alvo[2] + (-dx * sn + dz * cs) * esc);
        S.controls.autoRotate = false; S.controls.update();
      }, { pose, esc, giro });
      await avancar(1000 / FPS);
      const n = await pg.evaluate(() => window.__quadro());
      if (!n) erros.push('quadro ' + f + ' sem desenho');
      await pg.screenshot({ path: path.join(pasta, String(f).padStart(4, '0') + '.png'), type: 'png', animations: 'allow', caret: 'initial' });
      if (f % 15 === 0) log('  ' + R.codigo + '/sede ' + (f / FPS).toFixed(1) + ' s · ' + P.alvo);
    }
    reg.estadoFim = await pg.evaluate(id => { const a = window.__sede.byId[id]; return a ? a.state : null; }, P.alvo);
    ms.planos.push(reg);
  }
  ms.textoAntigo = await pg.evaluate(() => /Abrir meu neg[óo]cio|Seu neg[óo]cio aberto na internet|ao vivo/i.test([...document.querySelectorAll('#labels, canvas')].map(e => e.innerText || '').join(' '))).catch(() => null);
  await ctx.close();
  return ms;
}
async function gravarPreviaTopo(browser, base, R, S, pasta, FPS, log) {
  const { ctx, pg, erros } = await novaPagina(browser, R.hora);
  await pg.goto(base + '/previa/#k=' + R.nicho + '&n=' + encodeURIComponent(R.nome) + '&p=1', { waitUntil: 'load' });
  await pg.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
  await pg.waitForTimeout(1500);
  await pg.evaluate(() => document.fonts.ready);
  await pg.clock.pauseAt(new Date(await pg.evaluate(() => Date.now())).getTime() + 2000);
  await pg.clock.runFor(300);
  const ms = { precos: {}, erros };
  const fa = Math.round(S.t0 * FPS), fb = Math.round(S.t1 * FPS);
  for (let f = fa; f < fb; f++) {
    const t = f / FPS, ro = S.rolar;
    if (ro) await pg.evaluate(y => window.scrollTo(0, y), ro.dy * senoide((t - ro.t0) / (ro.t1 - ro.t0)));
    await pg.clock.runFor(1000 / FPS);
    await posicionar(pg, t);
    ms.precos[f] = await pg.evaluate(PRECOS);
    await fotografar(pg, path.join(pasta, String(f).padStart(4, '0') + '.png'), 720);
  }
  ms.cidade = await pg.evaluate(() => { const r = innerHeight; return [...document.querySelectorAll('body *')].filter(e => !e.children.length && /Feira de Santana|Salvador|Riach/i.test(e.textContent)).map(e => { const b = e.getBoundingClientRect(); return { txt: e.textContent.trim().slice(0, 60), y: b.y, h: b.height }; }); });
  ms.textoAntigo = await pg.evaluate(() => /Abrir meu neg[óo]cio|Seu neg[óo]cio aberto na internet/i.test(document.body.innerText)).catch(() => null);
  await ctx.close();
  return ms;
}
async function capturarSede(browser, base, L, reel, dir, log) {
  const R = L[reel], meta = { sessoes: {} };
  GIRO_MAPA = { ms: L.GIRO.ms, v90: L.GIRO.v90, v270: L.GIRO.v270, D: L.GIRO.D };
  for (const nomeS of Object.keys(R.sessoes)) {
    const S = R.sessoes[nomeS], pasta = path.join(dir, nomeS); fs.mkdirSync(pasta, { recursive: true });
    const fn = { sede: gravarSede, previaTopo: gravarPreviaTopo }[S.tipo]; if (!fn) throw new Error('sessão sem tipo: ' + nomeS);
    log('  ' + reel + '/' + nomeS + ' (' + S.tipo + ')');
    meta.sessoes[nomeS] = await fn(browser, base, R, S, pasta, L.FPS, log);
  }
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
  return meta;
}

/* ------------------------------------------------------------------ 'recortes': trechos vivos da home real (R10 · Sem Amarra)
   Uma página só (home do nicho, como chega quem vem do anúncio), com o nome já digitado de verdade fora de cena.
   Cada sessão de R.sessoes é um recorte: a página é rolada até o alvo ficar "margem" px CSS abaixo do topo do recorte
   (faixa fixa da janela, de R.recorte.y a R.recorte.y + R.recorte.alto, abaixo da barra fixa) e grava de t0 a t1, com
   rolagem real dentro do recorte se houver. Por quadro: valores em reais (o palco cobre com tarja) e os retângulos dos
   trechos de texto real que o palco sublinha. Tudo em px CSS do recorte. */
async function capturarRecortes(browser, base, L, reel, dir, log) {
  const R = L[reel], FPS = L.FPS, meta = { sessoes: {} };
  GIRO_MAPA = { ms: L.GIRO.ms, v90: L.GIRO.v90, v270: L.GIRO.v270, D: L.GIRO.D };
  const { ctx, pg, erros } = await novaPagina(browser, R.hora);
  await ctx.addInitScript(RECUSA_GUARDADA);
  const m0 = await prepararHome(pg, base, R.nicho, reel, { ancora: 'topo' });
  if (!/Ver meu site pronto/.test(m0.botaoTexto) || /Abrir meu neg/i.test(m0.botaoTexto)) throw new Error('botão da home não é "Ver meu site pronto": ' + m0.botaoTexto);
  if (!/^Veja o site/.test(m0.tituloTexto) || /aberto na internet/i.test(m0.tituloTexto)) throw new Error('título da home não é o novo: ' + m0.tituloTexto);
  await pg.addStyleTag({ content: SEM_CIDADE_EXEMPLO });
  /* o nome digitado de verdade no campo (teclado real), fora de cena */
  await pg.keyboard.type(R.nome); await pg.clock.runFor(300);
  /* preços reais carregados (o recorte do plano mostra a frase do plano; o valor é coberto) */
  if (!(await esperarPagina(pg, () => ![...document.querySelectorAll('[data-v="precos.planos.aberto"]')].some(e => e.offsetParent && !e.textContent.trim())))) throw new Error('os preços da home não carregaram');
  await pg.clock.runFor(200);
  const RC = R.recorte, CL = { x: 0, y: RC.y, width: 390, height: RC.alto };
  const MEDIR = ({ y0, alto, realce }) => {
    const rel = r => ({ x: r.x, y: r.y - y0, w: r.width, h: r.height });
    const dentro = r => r.y + r.h > 0 && r.y < alto && r.w > 0;
    const precos = [...document.querySelectorAll('body *')].filter(e => !e.children.length && /R\$\s?\d/.test(e.textContent) && e.offsetParent).map(e => rel(e.getBoundingClientRect())).filter(dentro);
    /* "R$ " fora do mesmo elemento do número (<strong>R$ <span>147</span></strong>): cobre o pai inteiro */
    document.querySelectorAll('strong').forEach(s => { if (/R\$/.test(s.textContent) && /\d/.test(s.textContent) && s.offsetParent) { const r = rel(s.getBoundingClientRect()); if (dentro(r)) precos.push(r); } });
    const realces = [];
    (realce || []).forEach(q => {
      const el = document.querySelector(q.sel); if (!el) return;
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
      while ((n = w.nextNode())) { const i = n.textContent.indexOf(q.texto); if (i < 0) continue;
        const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + q.texto.length);
        [...rg.getClientRects()].forEach(r => { const b = rel(r); if (dentro(b)) realces.push(b); }); break; }
    });
    return { precos, realces };
  };
  for (const nomeS of Object.keys(R.sessoes)) {
    const S = R.sessoes[nomeS]; if (S.tipo !== 'recorte') continue;
    const pasta = path.join(dir, nomeS); fs.mkdirSync(pasta, { recursive: true });
    const ms = { precos: {}, realces: {}, erros };
    const ir = async (sel, margem) => pg.evaluate(({ sel, y }) => { const e = document.querySelector(sel); if (!e) throw new Error('alvo do recorte sumiu: ' + sel); return Math.max(0, e.getBoundingClientRect().top + scrollY - y); }, { sel, y: RC.y + margem });
    const y0 = await ir(S.alvo, S.margem);
    await pg.evaluate(y => window.scrollTo(0, y), y0); await pg.clock.runFor(100);
    ms.alvo = { sel: S.alvo, rolagem: y0 };
    let rol = null;
    const fa = Math.round(S.t0 * FPS), fb = Math.round(S.t1 * FPS);
    for (let f = fa; f < fb; f++) {
      const t = f / FPS;
      if (S.rolar && t >= S.rolar.t0 - 1e-6 && !rol) { rol = { de: y0, para: await ir(S.rolar.alvo, S.rolar.margem) }; ms.rolagem = rol; }
      if (rol) await pg.evaluate(y => window.scrollTo(0, y), rol.de + (rol.para - rol.de) * senoide((t - S.rolar.t0) / (S.rolar.t1 - S.rolar.t0)));
      await pg.clock.runFor(1000 / FPS);
      await posicionar(pg, t);
      const m = await pg.evaluate(MEDIR, { y0: RC.y, alto: RC.alto, realce: S.realce });
      ms.precos[f] = m.precos; ms.realces[f] = m.realces;
      await pg.screenshot({ path: path.join(pasta, String(f).padStart(4, '0') + '.png'), clip: CL, type: 'png', animations: 'allow', caret: 'initial' });
      if (f % 30 === 0) log('  ' + reel + '/' + nomeS + ' ' + t.toFixed(1) + ' s');
    }
    /* texto que o recorte mostra (conferência: nada de cidade, concorrente, "agenda" nem o texto antigo) */
    ms.texto = await pg.evaluate(({ y0, alto }) => [...document.querySelectorAll('body *')].filter(e => !e.children.length && e.offsetParent && e.textContent.trim()).filter(e => { const r = e.getBoundingClientRect(); return r.bottom > y0 && r.top < y0 + alto; }).map(e => e.textContent.trim()).join(' | '), { y0: RC.y, alto: RC.alto });
    ms.proibido = /Abrir meu neg|aberto na internet|agenda|Trinks|Booksy|Campinas|Feira de Santana|Salvador|Riach/i.test(ms.texto);
    if (ms.proibido) throw new Error('o recorte ' + nomeS + ' mostra texto proibido: ' + ms.texto.slice(0, 300));
    meta.sessoes[nomeS] = ms;
  }
  meta.inicio = m0;
  meta.textoAntigo = await pg.evaluate(() => /Abrir meu neg[óo]cio|Seu neg[óo]cio aberto na internet/i.test(document.body.innerText)).catch(() => null);
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 1));
  await ctx.close();
  return meta;
}

/* registro dos tipos de captura (linhas.js, campo "captura" de cada Reel). R9 a R12: acrescente aqui. */
const CAPTURAS = { home: capturarHome, previa: capturarPrevia, sede: capturarSede, recortes: capturarRecortes };

module.exports = { garantirFontes, rotearFontes, servidor, CAPTURAS, capturarHome, capturarPrevia, RAIZ, TMP };
