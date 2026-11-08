#!/usr/bin/env node
/*
 * scripts/producao/testar-site.cjs · teste headless do site gerado (passo 5 da seção 15)
 *
 * Uso: node scripts/producao/testar-site.cjs <pasta do dist/<slug>> [--whatsapp 55DDDNUMERO] [--print <arquivo.png>]
 *
 * Abre index.html por file:// no Chromium do Playwright (versão fixada no package.json),
 * em 390 x 844, e confere:
 *   - nenhum erro de console nem exceção de página;
 *   - sem rolagem horizontal (scrollWidth <= largura);
 *   - todo link wa.me aponta para o número do pedido (e existe pelo menos um, no site entregue);
 *   - nenhum texto visível abaixo de 11 px;
 *   - JSON-LD presente e válido no site entregue; meta robots noindex na prévia;
 *   - rede: as fontes do Google são respondidas com CSS vazio (teste determinístico, sem rede);
 *     qualquer outra requisição http(s) é anotada e bloqueada; host proibido = falha;
 *   - opc.semRodapeViral (pacote SAIR): nenhum link utm_source=rodape nem o texto "Aberto pela Creat".
 * Código 0 = passou, 3 = falhou, 2 = Playwright ausente.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const FONTES = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

async function testarSite(pasta, opc) {
  opc = opc || {};
  let pw;
  try { pw = require('playwright'); }
  catch (e) { const x = new Error('Playwright não instalado: rode "npm install" em projetos/creat-nuvem (playwright fixado) e, se faltar o navegador, "npx playwright install chromium"'); x.codigo = 2; throw x; }
  const index = path.join(path.resolve(pasta), 'index.html');
  if (!fs.existsSync(index)) throw new Error(`não achei ${index}`);
  const largura = opc.largura || 390;
  const falhas = [], erros = [], externas = [], fontes = [];
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: largura, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await ctx.route(/^https?:\/\//, (rota) => {
      const u = rota.request().url();
      if (FONTES.test(u)) { fontes.push(u); return rota.fulfill({ status: 200, contentType: u.includes('googleapis') ? 'text/css' : 'font/woff2', body: '' }); }
      externas.push(u);
      return rota.abort('blockedbyclient');
    });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => erros.push(`exceção: ${e.message}`));
    await page.goto(pathToFileURL(index).href, { waitUntil: 'load' });
    await page.waitForFunction(() => !document.querySelector('.sem-tenant') && document.querySelector('#motor-raiz main'), null, { timeout: 8000 })
      .catch(() => falhas.push('o motor não montou a página em 8 s (#motor-raiz main ausente)'));
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const was = [...document.querySelectorAll('a[href*="wa.me/"]')].map((a) => a.getAttribute('href'));
      let menor = Infinity, onde = '';
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (!el || el.closest('noscript,script,style,[hidden],[aria-hidden="true"]')) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) continue;          // leitor de tela (sr-only)
        const fs = parseFloat(cs.fontSize);
        if (fs < menor) { menor = fs; onde = `${el.tagName.toLowerCase()}.${el.className || ''} "${n.textContent.trim().slice(0, 30)}"`; }
      }
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent);
      const robots = (document.querySelector('meta[name="robots"]') || {}).content || '';
      const rodape = [...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => /utm_source=rodape/.test(h));
      const creatTexto = /Aberto pela Creat/i.test(document.body.innerText);
      return { scrollW: de.scrollWidth, larg: window.innerWidth, was, menor, onde, ld, robots, titulo: document.title, rodape, creatTexto };
    });
    if (m.scrollW > m.larg + 1) falhas.push(`rolagem horizontal: scrollWidth ${m.scrollW} > ${m.larg}`);
    if (m.menor < 11) falhas.push(`texto de ${m.menor}px (mínimo 11): ${m.onde}`);
    const previa = /noindex/.test(m.robots);
    if (opc.whatsapp) {
      if (!m.was.length) falhas.push('nenhum link wa.me na página');
      for (const h of m.was) {
        const num = (String(h).match(/wa\.me\/(\d+)/) || [])[1];
        if (num !== String(opc.whatsapp)) falhas.push(`wa.me com número ${num} (esperado ${opc.whatsapp}): ${h}`);
        if (!/^https:\/\/wa\.me\/\d+(\?text=[^\s]*)?$/.test(h)) falhas.push(`wa.me fora do formato puro: ${h}`);
      }
    }
    if (!previa) {
      if (!m.ld.length) falhas.push('site entregue sem JSON-LD');
      for (const t of m.ld) { try { const o = JSON.parse(t); if (!o['@type']) falhas.push('JSON-LD sem @type'); } catch (e) { falhas.push(`JSON-LD inválido: ${e.message}`); } }
    }
    if (opc.semRodapeViral && (m.rodape.length || m.creatTexto)) falhas.push(`rodapé da Creat presente (${m.rodape.join(' ') || 'texto'})`);
    if (opc.exigirRodape && !m.rodape.length) falhas.push('rodapé "Aberto pela Creat · veja o seu" sem link');
    for (const u of externas) {
      const host = new URL(u).host;
      if ((opc.hostsProibidos || []).some((h) => host === h || host.endsWith('.' + h))) falhas.push(`requisição a host proibido: ${u}`);
    }
    falhas.push(...erros);
    if (opc.print) { fs.mkdirSync(path.dirname(opc.print), { recursive: true }); await page.screenshot({ path: opc.print, fullPage: true }); }
    return { ok: falhas.length === 0, falhas, medidas: { rodapeLinks: m.rodape.length, scrollWidth: m.scrollW, largura: m.larg, menorFontePx: m.menor, waMe: m.was, robots: m.robots, titulo: m.titulo, jsonLd: m.ld.length }, rede: { fontes: fontes.length, externasBloqueadas: externas } };
  } finally { await browser.close(); }
}

async function main(argv) {
  const C = require('./lib/comum.cjs');
  const a = C.lerArgs(argv);
  if (!a._[0]) { console.error('Uso: node scripts/producao/testar-site.cjs <pasta do dist/<slug>> [--whatsapp 55DDDNUMERO] [--print arquivo.png]'); return 2; }
  const r = await testarSite(a._[0], { whatsapp: a.whatsapp, print: a.print, hostsProibidos: (process.env.CREAT_DOMINIOS || '').split(',').filter(Boolean) });
  console.log(JSON.stringify(r, null, 2));
  return r.ok ? 0 : 3;
}

if (require.main === module) main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.error(e.message); process.exitCode = e.codigo || 2; });

module.exports = { testarSite };
