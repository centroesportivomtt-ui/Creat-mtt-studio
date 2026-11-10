#!/usr/bin/env node
/*
 * scripts/conferir-no-ar.cjs · a conferência do site REAL, no ar, como o cliente abre (10/11/2026)
 *
 * Por quê: em 09 e 10/11 dois defeitos graves ficaram no ar com todos os testes locais verdes.
 *   1. O Pixel da Meta nunca carregou (o navegador bloqueava o arquivo). Os testes usavam a Meta simulada.
 *   2. As demonstrações abriam sem o formulário de pedido (corrida de scripts que só aparece com rede real).
 * Regra da casa desde então: NADA é dado como publicado, e nenhum anúncio fica ligado, sem esta
 * conferência passar no endereço de produção. Ela não substitui os testes locais; ela pega o que eles não veem.
 *
 * O que confere, sempre no ar, em celular (390x844, agente de usuário de Android real):
 *   A. páginas: 200 onde deve, 404 em rota que não existe, sem marcador esquecido na tela
 *   B. home pelo link de anúncio: sem erro de console, sem requisição quebrada, sem rolagem lateral, preço na tela
 *   C. caminho do anúncio nos 3 nichos: digitar o nome, abrir a prévia, nome e formulário dentro da prévia
 *   D. medição: arquivo da Meta carrega de verdade e os eventos PageView e ViewContent SAEM do navegador
 *      (o envio é interceptado e cancelado aqui, para a conferência não sujar os números da conta)
 *   E. demonstrações: 3 cargas de cada, formulário de pedido, gesto do nicho e link de WhatsApp
 *   F. página de pagamento: para cada praça, o botão aponta para o link certo do checkout.config.js no ar
 *   G. Mercado Pago: cada link abre, mostra o item do Porta Aberta e o valor certo, com Pix e cartão (não paga)
 *   H. identificação da empresa nos termos e na privacidade; sede com a cena no ar
 *
 * Uso: node scripts/conferir-no-ar.cjs [--base https://...] [--sem-mp] [--json arquivo]
 * Saída 0 = tudo certo. Saída 1 = defeito no ar: pausar os anúncios e corrigir. Saída 2 = ambiente.
 * Não paga, não envia formulário, não manda WhatsApp, não grava nada no site.
 */
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const BASE = String(opt('--base', 'https://creat-nuvem-404b1994.base44.app')).replace(/\/$/, '');
const SEM_MP = args.includes('--sem-mp');
const ARQ_JSON = opt('--json', '');
const UA = 'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const NICHOS = ['barbearia', 'salao', 'academia'];
const SUJEIRA = /\{\{|\}\}|\(a informar\)|REVISAO_JURIDICA|\[PREENCHER|undefined|NaN|\bnull\b/;

const res = [];
function anota(grupo, nome, ok, detalhe) {
  res.push({ grupo, nome, ok: !!ok, detalhe: detalhe || '' });
  console.log(`${ok ? 'ok    ' : 'FALHA '} ${grupo} · ${nome}${detalhe ? ' | ' + detalhe : ''}`);
}

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.error('erro   playwright ausente'); process.exit(2); }
  const nav = await chromium.launch();
  const novoCtx = () => nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-BR', userAgent: UA });
  const texto = pg => pg.evaluate(() => document.body.innerText);

  /* ---------------- A. páginas ---------------- */
  {
    const ctx = await novoCtx(); const pg = await ctx.newPage();
    const paginas = [['/', 200], ['/abrir/', 200], ['/obrigado/', 200], ['/termos/', 200], ['/privacidade/', 200], ['/bastidores/', 200],
      ['/sede/?modo=demo', 200], ['/previa/?nicho=barbearia', 200], ['/sites/demo-barbearia/', 200], ['/sites/demo-salao/', 200],
      ['/sites/demo-academia/', 200], ['/rota-que-nao-existe-' + 'zz9/', 404]];
    for (const [u, esperado] of paginas) {
      let st = 0, sujo = '';
      try {
        const r = await pg.goto(BASE + u, { waitUntil: 'domcontentloaded', timeout: 45000 }); st = r ? r.status() : 0;
        await pg.waitForTimeout(900);
        if (esperado === 200) { const m = (await texto(pg)).match(SUJEIRA); if (m) sujo = m[0]; }
      } catch (e) { st = -1; }
      anota('A páginas', u, st === esperado && !sujo, st !== esperado ? `status ${st}, esperado ${esperado}` : (sujo ? `marcador na tela: ${sujo}` : ''));
    }
    await ctx.close();
  }

  /* ---------------- B, C e D. home pelo anúncio, prévia e medição ---------------- */
  for (const nicho of NICHOS) {
    const ctx = await novoCtx(); const pg = await ctx.newPage();
    const erros = [], quebradas = [], eventos = [];
    let fbArquivo = false, fbConfig = false;
    pg.on('console', m => { if (m.type() === 'error') erros.push(m.text().slice(0, 140)); });
    pg.on('pageerror', e => erros.push(String(e).slice(0, 140)));
    pg.on('response', r => {
      const u = r.url();
      if (r.status() >= 400 && !/facebook\.com\/tr/.test(u)) quebradas.push(r.status() + ' ' + u.slice(0, 110));
      if (/connect\.facebook\.net\/.*fbevents\.js/.test(u) && r.status() === 200) fbArquivo = true;
      if (/connect\.facebook\.net\/signals\/config\//.test(u) && r.status() === 200) fbConfig = true;
    });
    // o envio do evento é registrado e cancelado: prova que o navegador tentou enviar, sem sujar a conta
    await pg.route(/facebook\.com\/tr/, route => { const m = route.request().url().match(/[?&]ev=([^&]+)/); if (m) eventos.push(m[1]); route.abort(); });
    const nome = 'Conferência ' + nicho;
    try {
      await pg.goto(`${BASE}/?nicho=${nicho}&utm_source=meta&utm_medium=cpc&utm_campaign=feira&utm_content=conferencia`, { waitUntil: 'networkidle', timeout: 60000 });
      const t0 = await texto(pg);
      anota('B home', `${nicho}: preço na tela`, /R\$\s?297/.test(t0) || /297/.test(t0), /297/.test(t0) ? '' : 'R$ 297 não aparece');
      anota('B home', `${nicho}: sem rolagem lateral`, !(await pg.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
      // aceitar a medição
      await pg.evaluate(() => { const b = document.querySelector('[data-preferencias]'); if (b) b.click(); });
      await pg.waitForTimeout(500);
      const aceitou = await pg.evaluate(() => { const b = [...document.querySelectorAll('#consentimento button')].find(x => /Aceitar/.test(x.textContent)); if (b) { b.click(); return true; } return false; });
      await pg.waitForTimeout(4500);
      const fbq = await pg.evaluate(() => !!(window.fbq && window.fbq.callMethod));
      anota('D medição', `${nicho}: aviso com Aceitar e arquivo da Meta carregado`, aceitou && fbArquivo && fbConfig && fbq, `aceitar ${aceitou} · arquivo ${fbArquivo} · configuração ${fbConfig} · pronto ${fbq}`);
      // caminho do anúncio: nome e prévia
      await pg.evaluate(() => scrollTo(0, 0));
      await pg.fill('#nome', nome);
      await pg.keyboard.press('Enter');
      // espera a moldura da prévia existir e o formulário de dentro montar (até 25 s), em vez de tempo fixo
      const limite = Date.now() + 25000;
      let quadro = null;
      while (Date.now() < limite) {
        quadro = pg.frames().find(f => f.url().startsWith('blob:')) || null;
        if (quadro && await quadro.evaluate(() => document.querySelectorAll('#pedir-corpo input, #pedir-corpo button, #pedir-corpo select').length > 0).catch(() => false)) break;
        await pg.waitForTimeout(400);
      }
      await pg.waitForTimeout(1500);   // dá tempo de o evento de prévia sair
      let dentro = { nome: false, campos: 0 };
      if (quadro) dentro = await quadro.evaluate(n => ({ nome: document.body.innerText.toLowerCase().includes(n.toLowerCase()), campos: document.querySelectorAll('#pedir-corpo input, #pedir-corpo button, #pedir-corpo select').length }), nome).catch(() => dentro);
      anota('C prévia', `${nicho}: abre com o nome e com o formulário de pedido`, !!quadro && dentro.nome && dentro.campos > 0, `moldura ${!!quadro} · nome ${dentro.nome} · campos ${dentro.campos}`);
      anota('D medição', `${nicho}: eventos saem do navegador`, eventos.includes('PageView') && eventos.includes('ViewContent'), 'eventos: ' + (eventos.join(', ') || 'nenhum'));
      const errosReais = [...new Set(erros)].filter(e => !/net::ERR_FAILED|facebook\.com\/tr/.test(e));
      anota('B home', `${nicho}: sem erro de console`, errosReais.length === 0, errosReais.slice(0, 3).join(' ; '));
      anota('B home', `${nicho}: sem requisição quebrada`, quebradas.length === 0, [...new Set(quebradas)].slice(0, 3).join(' ; '));
    } catch (e) { anota('B home', `${nicho}: carregou`, false, String(e).slice(0, 160)); }
    await ctx.close();
  }

  /* ---------------- E. demonstrações, 3 cargas cada ---------------- */
  for (const nicho of NICHOS) {
    let boas = 0, ultimo = {};
    for (let i = 0; i < 3; i++) {
      const ctx = await novoCtx(); const pg = await ctx.newPage();
      try {
        await pg.goto(`${BASE}/sites/demo-${nicho}/`, { waitUntil: 'load', timeout: 60000 });
        await pg.waitForTimeout(2500);
        ultimo = await pg.evaluate(() => ({
          pronto: document.documentElement.classList.contains('motor-pronto'),
          campos: document.querySelectorAll('#pedir-corpo input, #pedir-corpo button, #pedir-corpo select').length,
          gesto: !!document.querySelector('#heroi canvas, #heroi svg, #heroi [data-ritual]'),
          whats: document.querySelectorAll('a[href*="wa.me"]').length,
          faixa: /demonstração/i.test(document.body.innerText)
        }));
        if (ultimo.pronto && ultimo.campos > 0 && ultimo.gesto && ultimo.whats > 0 && ultimo.faixa) boas++;
      } catch (e) { ultimo = { erro: String(e).slice(0, 100) }; }
      await ctx.close();
    }
    anota('E demonstração', `${nicho}: formulário, gesto e WhatsApp em 3 de 3 cargas`, boas === 3, `${boas} de 3 · ${JSON.stringify(ultimo)}`);
  }

  /* ---------------- F. página de pagamento por praça ---------------- */
  let links = {};
  {
    const ctx = await novoCtx(); const pg = await ctx.newPage();
    try {
      await pg.goto(BASE + '/abrir/', { waitUntil: 'networkidle', timeout: 60000 });
      const cfg = await pg.evaluate(() => { const c = window.CREAT_CHECKOUT || {}; return { geral: c.links && c.links.aberturaInauguracao, pracas: c.linksPorPraca || {} }; });
      links = Object.assign({ '(sem praça)': cfg.geral }, cfg.pracas);
      anota('F pagamento', 'configuração no ar traz o link geral e as praças', !!cfg.geral && Object.keys(cfg.pracas).length >= 2, Object.keys(links).join(', '));
    } catch (e) { anota('F pagamento', 'configuração no ar', false, String(e).slice(0, 140)); }
    await ctx.close();
    for (const praca of Object.keys(links)) {
      const c2 = await novoCtx(); const p2 = await c2.newPage();
      try {
        // a praça vem do anúncio: entra pela home com a campanha e segue para /abrir/ na mesma aba
        await p2.goto(`${BASE}/?nicho=barbearia${praca === '(sem praça)' ? '' : '&utm_source=meta&utm_campaign=' + praca}`, { waitUntil: 'networkidle', timeout: 60000 });
        await p2.goto(BASE + '/abrir/', { waitUntil: 'networkidle', timeout: 60000 });
        await p2.waitForTimeout(1500);
        const hrefs = await p2.$$eval('a', as => as.filter(a => /Pagar/.test(a.textContent)).map(a => a.href));
        const t = await texto(p2);
        const certo = hrefs.length > 0 && hrefs.every(h => h === links[praca]);
        anota('F pagamento', `${praca}: botão de pagar no link certo e total R$ 297`, certo && /R\$\s?297/.test(t), certo ? '' : `botões: ${[...new Set(hrefs)].map(h => h.slice(-14)).join(', ') || 'nenhum'} · esperado ...${String(links[praca]).slice(-14)}`);
      } catch (e) { anota('F pagamento', `${praca}`, false, String(e).slice(0, 140)); }
      await c2.close();
    }
  }

  /* ---------------- G. Mercado Pago (não paga) ---------------- */
  if (!SEM_MP) {
    for (const praca of Object.keys(links)) {
      const ctx = await novoCtx(); const pg = await ctx.newPage();
      try {
        const r = await pg.goto(links[praca], { waitUntil: 'domcontentloaded', timeout: 60000 });
        // espera pelo conteúdo, não por tempo fixo: a tela do Mercado Pago monta devagar em rede ruim
        await pg.waitForFunction(() => /R\$\s?\d/.test(document.body.innerText) && /Pix|Cart/i.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
        await pg.waitForTimeout(800);
        const t = (await texto(pg)).replace(/\s+/g, ' ');
        const ok = r.status() === 200 && /Porta Aberta/i.test(t) && /R\$\s?297/.test(t) && /Pix/i.test(t) && /Cart[ãa]o/i.test(t);
        anota('G Mercado Pago', `${praca}: abre com o item, R$ 297, Pix e cartão`, ok, ok ? (t.match(/Porta Aberta[^|]{0,60}/) || [''])[0].trim().slice(0, 70) : `status ${r.status()} · ${t.slice(0, 160)}`);
      } catch (e) { anota('G Mercado Pago', `${praca}`, false, String(e).slice(0, 140)); }
      await ctx.close();
    }
  }

  /* ---------------- H. identificação e sede ---------------- */
  {
    const ctx = await novoCtx(); const pg = await ctx.newPage();
    for (const u of ['/termos/', '/privacidade/']) {
      try {
        await pg.goto(BASE + u, { waitUntil: 'networkidle', timeout: 45000 }); await pg.waitForTimeout(600);
        const t = await texto(pg);
        anota('H identificação', `${u}: nome empresarial, CNPJ e contato`, /nome empresarial/i.test(t) && /CNPJ\s\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/.test(t) && /@/.test(t));
      } catch (e) { anota('H identificação', u, false, String(e).slice(0, 120)); }
    }
    try {
      await pg.goto(BASE + '/sede/?modo=demo', { waitUntil: 'load', timeout: 60000 }); await pg.waitForTimeout(4000);
      anota('H sede', 'cena aparece', await pg.evaluate(() => !!document.querySelector('canvas')));
    } catch (e) { anota('H sede', 'cena aparece', false, String(e).slice(0, 120)); }
    await ctx.close();
  }

  await nav.close();
  const falhas = res.filter(r => !r.ok);
  if (ARQ_JSON) fs.writeFileSync(ARQ_JSON, JSON.stringify({ base: BASE, total: res.length, falhas: falhas.length, itens: res }, null, 1));
  console.log(`\n${res.length} conferências no ar · ${res.length - falhas.length} certas · ${falhas.length} com defeito`);
  if (falhas.length) {
    console.error('DEFEITO NO AR. Pause os anúncios, corrija e rode de novo:');
    falhas.forEach(f => console.error(`  - ${f.grupo} · ${f.nome}${f.detalhe ? ' | ' + f.detalhe : ''}`));
    process.exit(1);
  }
  console.log('ok     o site no ar funciona de ponta a ponta para quem chega pelo anúncio.');
})().catch(e => { console.error('erro  ', e); process.exit(2); });
