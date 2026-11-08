#!/usr/bin/env node
// Gera produtos/agencia/GUIA.pdf a partir de produtos/agencia/GUIA.html (A4, fundo impresso, @page do CSS).
// Uso:  node projetos/loja/gerar-guia.cjs [entrada.html] [saida.pdf]
// Requer Playwright + Chromium. Se faltar: npx playwright install chromium
// Além de gerar, confere se alguma .pagina estoura a altura A4 (conteúdo cortado por overflow:hidden)
// e sai com código 1 se o número de páginas ficar fora de 8 a 12.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function carregarPlaywright() {
  const tentativas = [
    'playwright',
    path.join(__dirname, '..', '..', '.claude', 'skills', 'navegador', 'node_modules', 'playwright'),
    path.join(__dirname, '..', '..', 'node_modules', 'playwright'),
  ];
  for (const t of tentativas) { try { return require(t); } catch (_) {} }
  console.error('Playwright não encontrado. Rode: npm i -D playwright@1 && npx playwright install chromium');
  process.exit(2);
}

(async () => {
  const entrada = path.resolve(process.argv[2] || path.join(__dirname, 'produtos', 'agencia', 'GUIA.html'));
  const saida = path.resolve(process.argv[3] || path.join(path.dirname(entrada), 'GUIA.pdf'));
  if (!fs.existsSync(entrada)) { console.error('Não achei ' + entrada); process.exit(2); }

  const { chromium } = carregarPlaywright();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    page.on('requestfailed', r => erros.push('falhou: ' + r.url()));
    await page.goto(pathToFileURL(entrada).href, { waitUntil: 'networkidle' });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts && document.fonts.ready);

    // Páginas que estouram a folha (o CSS usa altura fixa + overflow:hidden, então o excesso some).
    const estouros = await page.evaluate(() =>
      [...document.querySelectorAll('.pagina')].map((el, i) => ({ pagina: i + 1, sobra: el.scrollHeight - el.clientHeight }))
        .filter(p => p.sobra > 1));

    await page.pdf({
      path: saida, format: 'A4', printBackground: true, preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    const bruto = fs.readFileSync(saida, 'latin1');
    const paginas = (bruto.match(/\/Type\s*\/Page(?!s)/g) || []).length;
    console.log(`PDF: ${path.relative(process.cwd(), saida)} · ${paginas} páginas · ${(fs.statSync(saida).size / 1024).toFixed(0)} KB`);
    if (erros.length) console.log('Avisos do navegador:\n  ' + erros.join('\n  '));
    if (estouros.length) console.log('Conteúdo cortado em: ' + estouros.map(e => `p${e.pagina} (+${e.sobra}px)`).join(', '));
    if (paginas < 8 || paginas > 12 || estouros.length) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
