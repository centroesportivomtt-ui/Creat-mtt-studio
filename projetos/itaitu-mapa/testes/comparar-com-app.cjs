#!/usr/bin/env node
// comparar-com-app.cjs · confere no navegador as horas que o hóspede lê nas tábuas (Forja, backend, 20/11/2026).
// Abre o app em 390 px com ?agora=2026-11-20T13:00 (critério de aceite 1: Véu e Arapongas em "planejar"), lê "sol no poço até" do Véu da Noiva e das Arapongas e compara
// com o cálculo independente (testes/referencia.mjs): ±10 min do bruto e múltiplo de 5. Confere também que as tábuas
// sem coordenada não mostram hora e mostram "Chamar um guia", que as aproximadas não mostram hora, e que a página
// abre sem erro de console.
//
// Uso:
//   node projetos/itaitu-mapa/testes/comparar-com-app.cjs [URL_BASE] [--agora=AAAA-MM-DDTHH:MM] [--espera=30000]
//   --agora tem de deixar chegar às Arapongas com sol (agora + 12 de carro + 30 de trilha antes de 15:40). Depois
//   disso o app passa a tábua para "amanhã" (situação sol-foi, data-amanha=1), o que é certo, e a conferência
//   "hora de hoje" reprova. O padrão 13:00 é o do critério de aceite 1 (Véu e Arapongas em "planejar").
//   URL_BASE: endereço da pasta do app, ex. http://localhost:8000/itaitu/  (sem URL, serve site/ aqui mesmo)
// Saída: 0 = tudo bateu; 1 = alguma conferência falhou; 2 = não deu para rodar (sem Playwright, página não abriu).
// Playwright e Chromium da sessão (sem playwright install). Não escreve nada em disco.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ_SITE = path.resolve(__dirname, '../../../site');
const TOL = 10;
const ALVOS = ['cachoeira-veu-da-noiva', 'cachoeira-das-arapongas'];

const args = process.argv.slice(2);
const opc = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const baseArg = args.find((a) => !a.startsWith('--'));
const AGORA = opc.agora || '2026-11-20T13:00';
const ESPERA = Number(opc.espera) || 30000;
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(AGORA)) { console.error('--agora precisa ser AAAA-MM-DDTHH:MM'); process.exit(2); }
const DATA = AGORA.slice(0, 10);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.geojson': 'application/geo+json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.pbf': 'application/x-protobuf',
  '.txt': 'text/plain; charset=utf-8', '.wasm': 'application/wasm', '.ico': 'image/x-icon' };

function servirSite() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let rel;
      try { rel = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); res.end(); return; }
      let arq = path.normalize(path.join(RAIZ_SITE, rel));
      if (!arq.startsWith(RAIZ_SITE)) { res.writeHead(403); res.end(); return; }
      if (fs.existsSync(arq) && fs.statSync(arq).isDirectory()) arq = path.join(arq, 'index.html');
      fs.readFile(arq, (err, buf) => {
        if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404'); return; }
        res.writeHead(200, { 'content-type': MIME[path.extname(arq).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

async function abrirChromium(playwright) {
  const flags = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  try { return await playwright.chromium.launch({ args: flags }); }
  catch (e) {
    const pasta = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const cands = fs.existsSync(pasta) ? fs.readdirSync(pasta).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse() : [];
    for (const c of cands) {
      const exe = path.join(pasta, c, 'chrome-linux', 'chrome');
      if (fs.existsSync(exe)) return playwright.chromium.launch({ executablePath: exe, args: flags });
    }
    throw e;
  }
}

const minutos = (txt) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(txt || '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

(async () => {
  let playwright;
  try { playwright = require('playwright'); } catch { console.error('Playwright não encontrado (use o da sessão; não rode playwright install aqui).'); process.exit(2); }
  const ref = await import(pathToFileURL(path.join(__dirname, 'referencia.mjs')).href);
  const pontos = JSON.parse(fs.readFileSync(path.join(RAIZ_SITE, 'itaitu/dados/pontos.geojson'), 'utf8'));
  const rel = ref.carregarRelevo(path.join(RAIZ_SITE, 'itaitu/tiles/dem/12'));
  const esperado = {};
  for (const id of ALVOS) {
    const f = pontos.features.find((x) => x.properties.id === id);
    if (!f || !f.geometry) { console.error(`${id} sem coordenada em pontos.geojson`); process.exit(2); }
    const [lon, lat] = f.geometry.coordinates;
    const h = ref.horasDoPonto(rel, lon, lat, DATA);
    esperado[id] = { bruto: h.apagaMin, nome: f.properties.nome, confianca: f.properties.confianca };
  }

  let srv = null, base = baseArg;
  if (!base) { srv = await servirSite(); base = `http://127.0.0.1:${srv.address().port}/itaitu/`; }
  if (!base.endsWith('/') && !/\.html?$/.test(base)) base += '/';
  const url = new URL(`?agora=${AGORA}`, base).href;

  const falhas = [], erros = [];
  const ok = (cond, msg) => { if (cond) console.log(`  ok    ${msg}`); else { console.log(`  FALHA ${msg}`); falhas.push(msg); } };
  let browser;
  try {
    browser = await abrirChromium(playwright);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR', timezoneId: 'America/Bahia' });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
    page.on('pageerror', (e) => erros.push(String(e && e.message || e)));
    page.on('response', (r) => { if (r.status() >= 400) erros.push(`${r.status()} ${r.url().replace(base, './')}`); });
    page.on('requestfailed', (r) => erros.push(`falhou ${r.url().replace(base, './')} (${r.failure()?.errorText || '?'})`));
    console.log(`Abrindo ${url}`);
    const resp = await page.goto(url, { waitUntil: 'load', timeout: ESPERA });
    if (!resp || !resp.ok()) { console.error(`a página não abriu (${resp ? resp.status() : 'sem resposta'})`); process.exitCode = 2; return; }
    const seletor = ALVOS.map((id) => `.tabua[data-ponto="${id}"] .tabua__num`).join(', ');
    try {
      await page.waitForFunction((ids) => ids.every((id) => {
        const li = document.querySelector(`.tabua[data-ponto="${id}"]`);
        return li && [...li.querySelectorAll('.tabua__num')].some((d) => /\d{1,2}:\d{2}/.test(d.textContent));
      }), ALVOS, { timeout: ESPERA });
    } catch {
      console.error(`as tábuas com hora não apareceram em ${ESPERA} ms (${seletor})`);
      falhas.push('tábuas com hora não apareceram');
    }

    const lido = await page.evaluate(() => [...document.querySelectorAll('.tabua')].map((li) => ({
      id: li.dataset.ponto, estado: li.dataset.estado, amanha: li.dataset.amanha,
      horas: [...li.querySelectorAll('.tabua__hora')].map((h) => ({ rotulo: (h.querySelector('dt')?.textContent || '').trim(), valor: (h.querySelector('dd')?.textContent || '').trim() })),
      nums: [...li.querySelectorAll('.tabua__num')].map((d) => d.textContent.trim()).filter(Boolean),
      nota: (li.querySelector('.tabua__nota')?.textContent || '').trim(),
      guia: [...li.querySelectorAll('.tabua__guia')].map((a) => ({ texto: a.textContent.trim(), href: a.getAttribute('href') || '' })),
      largura: li.getBoundingClientRect().width,
    })));
    const larguraDoc = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vista: window.innerWidth }));

    console.log(`\nHoras de ${DATA} (referência independente, bruto ±${TOL} min; a tela mostra múltiplo de 5 para baixo):`);
    for (const id of ALVOS) {
      const li = lido.find((x) => x.id === id);
      const e = esperado[id];
      if (!li) { ok(false, `${e.nome}: tábua ausente`); continue; }
      ok(li.estado === 'confirmada', `${e.nome}: data-estado="${li.estado}"`);
      ok(li.amanha !== '1', `${e.nome}: hora de hoje (data-amanha=${li.amanha ?? 'ausente'})`);
      const hApaga = li.horas.find((h) => /sol no po[cç]o at[eé]/i.test(h.rotulo));
      const tela = minutos(hApaga ? hApaga.valor : null);
      ok(tela != null, `${e.nome}: "sol no poço até" lido na tábua (${hApaga ? hApaga.valor : 'não achado'})`);
      if (tela != null) {
        ok(tela % 5 === 0, `${e.nome}: ${hApaga.valor} é múltiplo de 5`);
        ok(Math.abs(tela - e.bruto) <= TOL, `${e.nome}: tela ${hApaga.valor} x referência ${ref.hm(e.bruto)} (${tela - e.bruto} min, tolerância ±${TOL})`);
        ok(tela <= e.bruto, `${e.nome}: tela não passa do bruto (arredonda para baixo)`);
      }
      const pm = e.confianca === 'alta' ? 10 : 15;
      ok(li.nota.includes(`±${pm} min`), `${e.nome}: nota "${li.nota}" traz ±${pm} min`);
      for (const n of li.horas.map((h) => minutos(h.valor)).filter((v) => v != null)) ok(n % 5 === 0, `${e.nome}: ${ref.hm(n)} na tábua é múltiplo de 5`);
    }

    console.log('\nTábuas sem hora de sol:');
    const semCoord = lido.filter((x) => x.estado === 'sem-coordenada');
    const aprox = lido.filter((x) => x.estado === 'aproximada');
    ok(semCoord.length > 0, `${semCoord.length} tábua(s) sem coordenada na tela`);
    for (const li of semCoord) {
      ok(li.nums.length === 0 && li.horas.every((h) => minutos(h.valor) == null), `${li.id}: sem hora de sol`);
      ok(li.guia.some((g) => /chamar um guia/i.test(g.texto) && g.href && g.href !== '#'), `${li.id}: "Chamar um guia" com link`);
    }
    for (const li of aprox) ok(li.nums.length === 0 && li.horas.every((h) => minutos(h.valor) == null), `${li.id} (aproximada): sem hora de sol`);

    console.log('\nPágina:');
    ok(larguraDoc.doc <= larguraDoc.vista, `sem rolagem horizontal (${larguraDoc.doc} <= ${larguraDoc.vista} px)`);
    ok(erros.length === 0, `sem erro de console${erros.length ? ': ' + erros.slice(0, 5).join(' | ') : ''}`);
  } catch (e) {
    console.error('não deu para rodar a conferência:', e && e.message || e);
    process.exitCode = 2;
    return;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (srv) srv.close();
  }
  console.log(falhas.length ? `\nRESULTADO: ${falhas.length} falha(s)` : '\nRESULTADO: tudo bateu');
  process.exitCode = falhas.length ? 1 : 0;
})();
