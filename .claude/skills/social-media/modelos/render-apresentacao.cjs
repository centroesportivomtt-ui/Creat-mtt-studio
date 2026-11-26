#!/usr/bin/env node
// Apresentação do padrão Social Media creat.MTT: JSON -> PDF 16:9 (1920x1080) + um PNG por slide.
//
//   node render-apresentacao.cjs <apresentacao.json> <saida.pdf> [--marca marca.json]
//
// Entrada: {"titulo":"","slides":[{"tipo":"capa|secao|lista|calendario|numeros|fecho","titulo":"","subtitulo":"","itens":[],"nota":""}]}
// Como cada tipo usa os campos:
// - capa:       titulo, subtitulo; nota = etiqueta vermelha acima do título (ex.: "Plano de dezembro · Super Kal").
// - secao:      numera sozinho (01, 02...); titulo, subtitulo; nota = etiqueta.
// - lista:      itens = frases (até 6; "Cabeça — descrição" deixa a cabeça em negrito); nota = observação no pé.
// - calendario: itens = "dia | semana | formato | tema" (até 14; dia com * no fim = destaque) ou {dia,semana,formato,tema,destaque}.
// - numeros:    itens = "valor | rótulo | fonte" (até 4) ou {valor,rotulo,fonte}. Número sem fonte não entra (regra da casa).
// - fecho:      titulo, subtitulo; itens = linhas de contato; nota = texto do botão.
// *palavra* no título fica na cor de destaque. Saída: o PDF e a pasta <nome>-slides/slide-01.png...
// Código de saída 1 quando algum slide estourou, saiu da zona segura ou ficou com letra < 28 px.
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');
const { MODELOS, lerJson, carregarMarca } = require('./nucleo.cjs');

const TIPOS = ['capa', 'secao', 'lista', 'calendario', 'numeros', 'fecho'];
const LIMITE = { lista: 6, calendario: 14, numeros: 4 };

function args() {
  const a = process.argv.slice(2);
  const i = a.indexOf('--marca');
  const marca = i >= 0 ? a.splice(i, 2)[1] : null;
  if (a.length < 2 || !/\.pdf$/i.test(a[1])) {
    console.error('uso: node render-apresentacao.cjs <apresentacao.json> <saida.pdf> [--marca marca.json]');
    process.exit(2);
  }
  return { entrada: a[0], saida: a[1], marca };
}

function validar(d) {
  const erros = [];
  if (!Array.isArray(d.slides) || !d.slides.length) return ['"slides" precisa ser uma lista com pelo menos 1 slide'];
  d.slides.forEach((s, i) => {
    const r = `slide ${i + 1}`;
    if (!TIPOS.includes(s.tipo)) erros.push(`${r}: tipo "${s.tipo}" inválido (${TIPOS.join('|')})`);
    if (!s.titulo) erros.push(`${r}: sem título`);
    const n = Array.isArray(s.itens) ? s.itens.length : 0;
    if (LIMITE[s.tipo] && n > LIMITE[s.tipo]) erros.push(`${r}: ${n} itens; o tipo ${s.tipo} aceita até ${LIMITE[s.tipo]} (divida em dois slides)`);
    if (['lista', 'calendario', 'numeros'].includes(s.tipo) && !n) erros.push(`${r}: tipo ${s.tipo} sem itens`);
    if (s.tipo === 'numeros') (s.itens || []).forEach((x, k) => {
      const fonte = typeof x === 'object' ? x.fonte : String(x).split('|')[2];
      if (!fonte || !String(fonte).trim()) erros.push(`${r}: número ${k + 1} sem fonte (regra da casa: nenhum número sem fonte)`);
    });
  });
  return erros;
}

async function main() {
  const { entrada, saida, marca: arqMarca } = args();
  const dados = lerJson(path.resolve(entrada), 'Apresentação');
  const erros = validar(dados);
  if (erros.length) { console.error('JSON da apresentação com problema:\n- ' + erros.join('\n- ')); process.exit(2); }
  const marca = carregarMarca(arqMarca);
  const pdf = path.resolve(saida);
  const pastaPng = pdf.replace(/\.pdf$/i, '-slides');
  fs.mkdirSync(path.dirname(pdf), { recursive: true });
  fs.mkdirSync(pastaPng, { recursive: true });
  for (const f of fs.readdirSync(pastaPng)) if (/^slide-\d+\.png$/.test(f)) fs.unlinkSync(path.join(pastaPng, f));

  const navegador = await chromium.launch();
  try {
    const pagina = await navegador.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const erroPagina = [];
    pagina.on('pageerror', (e) => erroPagina.push(e.message));
    await pagina.goto(pathToFileURL(path.join(MODELOS, 'apresentacao.html')).href);
    const r = await pagina.evaluate((p) => window.montar(p), { dados, marca });
    if (erroPagina.length) throw new Error('erro na página: ' + erroPagina.join(' | '));

    const slides = await pagina.$$('.slide');
    for (let i = 0; i < slides.length; i++) {
      await slides[i].screenshot({ path: path.join(pastaPng, `slide-${String(i + 1).padStart(2, '0')}.png`) });
    }
    await pagina.pdf({ path: pdf, width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 } });

    console.log(`ok: ${r.n} slides em ${pdf} e PNGs em ${pastaPng} (marca ${marca.nome})`);
    if (r.avisos.length) {
      console.error('ATENÇÃO:\n- ' + r.avisos.join('\n- '));
      process.exitCode = 1;
    }
  } finally {
    await navegador.close();
  }
}

main().catch((e) => { console.error('falhou: ' + e.message); process.exit(2); });
