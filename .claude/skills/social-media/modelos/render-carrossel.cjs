#!/usr/bin/env node
// Carrossel do padrão Social Media creat.MTT: JSON -> um PNG 1080x1350 por cartão + prancha.jpg.
//
//   node render-carrossel.cjs <carrossel.json> <pasta-saida> [--marca marca.json]
//
// Entrada: {"tema":"","legenda":"","cartoes":[{"tipo":"capa|conteudo|fecho","etiqueta":"","numero":"","titulo":"","texto":"","botao":""}]}
// - *palavra* no título fica na cor de destaque; no texto fica em negrito. "\n" força quebra de linha.
// - "numero" vazio no cartão de conteúdo numera sozinho (01, 02...); "-" tira o número.
// - Sem --marca usa marca-creat-mtt.json. Saída: cartao-01.png..., prancha.jpg e legenda.txt.
// - Código de saída 1 quando algum cartão estourou, saiu da zona segura ou ficou com letra < 28 px.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { MODELOS, lerJson, carregarMarca } = require('./nucleo.cjs');

function args() {
  const a = process.argv.slice(2);
  const i = a.indexOf('--marca');
  const marca = i >= 0 ? a.splice(i, 2)[1] : null;
  if (a.length < 2) {
    console.error('uso: node render-carrossel.cjs <carrossel.json> <pasta-saida> [--marca marca.json]');
    process.exit(2);
  }
  return { entrada: a[0], saida: a[1], marca };
}

function validar(d) {
  const erros = [];
  if (!Array.isArray(d.cartoes) || !d.cartoes.length) erros.push('"cartoes" precisa ser uma lista com pelo menos 1 cartão');
  else {
    if (d.cartoes.length > 20) erros.push('o Instagram aceita no máximo 20 cartões');
    d.cartoes.forEach((c, i) => {
      if (c.tipo && !['capa', 'conteudo', 'fecho'].includes(c.tipo)) erros.push(`cartão ${i + 1}: tipo "${c.tipo}" inválido (capa|conteudo|fecho)`);
      if (!c.titulo && !c.texto) erros.push(`cartão ${i + 1}: sem título e sem texto`);
    });
  }
  return erros;
}

async function main() {
  const { entrada, saida, marca: arqMarca } = args();
  const dados = lerJson(path.resolve(entrada), 'Carrossel');
  const erros = validar(dados);
  if (erros.length) { console.error('JSON do carrossel com problema:\n- ' + erros.join('\n- ')); process.exit(2); }
  const marca = carregarMarca(arqMarca);
  fs.mkdirSync(saida, { recursive: true });
  for (const f of fs.readdirSync(saida)) if (/^cartao-\d+\.png$/.test(f)) fs.unlinkSync(path.join(saida, f));

  const n = dados.cartoes.length;
  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage({ viewport: { width: n * 1080, height: 1350 }, deviceScaleFactor: 1 });
    const erroPagina = [];
    pagina.on('pageerror', (e) => erroPagina.push(e.message));
    await pagina.goto(pathToFileURL(path.join(MODELOS, 'carrossel.html')).href);
    const r = await pagina.evaluate((p) => window.montar(p), { dados, marca });
    if (erroPagina.length) throw new Error('erro na página: ' + erroPagina.join(' | '));

    const arquivos = [];
    for (let i = 0; i < n; i++) {
      const nome = `cartao-${String(i + 1).padStart(2, '0')}.png`;
      const buf = await pagina.screenshot({ clip: { x: i * 1080, y: 0, width: 1080, height: 1350 } });
      fs.writeFileSync(path.join(saida, nome), buf);
      arquivos.push(buf);
    }

    // Prancha: os cartões lado a lado, em meia escala, como aparecem ao arrastar.
    const col = Math.min(n, 7);
    const linhas = Math.ceil(n / col);
    const pw = 40 * 2 + col * 540 + (col - 1) * 12;
    const ph = 40 + 56 + linhas * 675 + (linhas - 1) * 12 + 40;
    const p2 = await navegador.newPage({ viewport: { width: pw, height: ph } });
    const imgs = arquivos.map((b) => `<img src="data:image/png;base64,${b.toString('base64')}">`).join('');
    await p2.setContent(`<style>body{margin:0;background:#161314;padding:40px;font:600 24px/1 sans-serif;color:#9d9091}
      .g{display:grid;grid-template-columns:repeat(${col},540px);gap:12px}img{width:540px;height:675px;display:block}
      h1{font-size:24px;margin:0 0 32px;font-weight:600}</style>
      <h1>${(dados.tema || 'carrossel').replace(/[<&]/g, '')} · ${n} cartões · ${marca.nome.replace(/[<&]/g, '')}</h1><div class="g">${imgs}</div>`);
    await p2.waitForFunction(() => [...document.images].every((i) => i.complete));
    await p2.screenshot({ path: path.join(saida, 'prancha.jpg'), type: 'jpeg', quality: 88, fullPage: true });
    if (dados.legenda) fs.writeFileSync(path.join(saida, 'legenda.txt'), dados.legenda.trim() + '\n');

    console.log(`ok: ${n} cartões + prancha.jpg em ${path.resolve(saida)} (marca ${marca.nome})`);
    if (r.avisos.length) {
      console.error('ATENÇÃO:\n- ' + r.avisos.join('\n- '));
      process.exitCode = 1;
    }
  } finally {
    await navegador.close();
  }
}

main().catch((e) => { console.error('falhou: ' + e.message); process.exit(2); });
