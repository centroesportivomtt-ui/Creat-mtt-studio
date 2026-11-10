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
 *   J. jornada (onda 2, pacote 2C): /obrigado/ nos estados recusado (sem formulário), pendente e aprovado pela
 *      URL com pagamento falso (título de espera, nunca "confirmado" sem o servidor), com os títulos lidos do
 *      conteudo/obrigado.json publicado; /abrir/?teste=pa-teste com noindex; chegando com Referer externo,
 *      nenhum cookie base44_* antes do aceite em /, /abrir/ e /obrigado/, e a meta base44-visitor-tracking
 *      com content="consent" nessas 3 páginas
 *   I. funções do pedido e do pagamento (pacote 1F, decisão D10): respostas, recusas e ausência de dado
 *      pessoal em registrarPedido, contar, consultarPedido, confirmarPagamento, aprovarRascunho, nas 4
 *      entidades privadas, em portaAbertaVerificar e portaAbertaNotificacao (AutoCreatFlux) e no OPTIONS
 *
 * Contagem: A a H são 54 conferências (com as 7 praças de pagamento); J são 10; I são 41 (mais 22 com o usuário comum).
 * Total esperado: 105 (127 com o usuário comum). Com --sem-funcoes: 64. Com --so-funcoes: 41.
 * Linhas de prova (10/11/2026): lista vazia só prova leitura negada se houver linha para ler. Por isso Operacao
 *   (chave prova_conferencia) e PedidoPortaAberta (PA-PROVACONF1, eh_teste) têm uma linha fixa, sem dado pessoal,
 *   com o id em LINHAS_DE_PROVA abaixo. O update anônimo nesse id real tem de dar 403 (a plataforma só responde 403
 *   quando a linha existe; id inexistente dá 404). Isso prova, a cada rodada, que a linha está lá enquanto list e
 *   filter devolvem []. O delete anônimo responde 404 mesmo com a linha existindo (a plataforma esconde o que a regra
 *   de leitura nega), então o critério do delete é "não apagou": um segundo update no mesmo id ainda dá 403.
 *   Sumiu a linha (update 404): é defeito; recrie pelo MCP e troque o id (docs/ROTINA-DIARIA.md).
 * Última linha: "funcionam de ponta a ponta" só sai com o grupo I inteiro conferido. Com qualquer NÃO VERIFICADO
 *   no grupo I ela diz que as funções do pedido NÃO foram conferidas, com o número de itens.
 * Toda chamada ao site e às funções leva o cabeçalho X-Conferencia: 1 e a UTM utm_content=conferencia,
 * para o contador próprio descartar a conferência (docs/PEDIDO-API.md, seção 4.4).
 *
 * Uso: node scripts/conferir-no-ar.cjs [--base https://...] [--sem-mp] [--so-funcoes] [--sem-funcoes] [--exigir-funcoes] [--exigir-jornada] [--cors-estrito] [--json arquivo]
 *   --so-funcoes   só o grupo I (logo depois de publicar as funções, antes das páginas)
 *   --sem-funcoes  pula o grupo I (só enquanto as funções ainda não foram publicadas; anote no relatório)
 *   --exigir-funcoes rota de função ausente é defeito mesmo com FUNCOES_PUBLICADAS = false (uso do coordenador no deploy)
 *   --exigir-jornada falha do grupo J é defeito mesmo com JORNADA_PUBLICADA = false (uso do coordenador no deploy da onda 2)
 *   --cors-estrito trata "access-control-allow-origin: *" no OPTIONS como defeito (padrão: aviso, ver grupo I)
 *   Usuário comum (opcional): CONFERENCIA_TOKEN_USUARIO_COMUM no ambiente, com a sessão de um usuário de
 *   papel "user" criado só para isto. O valor nunca é impresso. Sem ele, as 20 tentativas logadas saem
 *   como NÃO VERIFICADO (e a saída continua 0 se nada falhar).
 * Saída 0 = tudo certo. Saída 1 = defeito no ar: pausar os anúncios e corrigir. Saída 2 = ambiente.
 * Não paga, não envia formulário, não manda WhatsApp, não grava nada no site
 * (registrarPedido vai com teste:true; contar com utm_content=conferencia; ids e pagamentos são falsos).
 */
'use strict';
const fs = require('fs');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const BASE = String(opt('--base', 'https://creat-nuvem-404b1994.base44.app')).replace(/\/$/, '');
const SEM_MP = args.includes('--sem-mp');
const SO_FUNCOES = args.includes('--so-funcoes');
const SEM_FUNCOES = args.includes('--sem-funcoes');
const CORS_ESTRITO = args.includes('--cors-estrito');
const EXIGIR_FUNCOES = args.includes('--exigir-funcoes');
// troque para true no mesmo ato do deploy das funções da onda 1 (docs/ROTINA-DIARIA.md, seção 7)
const FUNCOES_PUBLICADAS = true;
// troque para true no mesmo ato da publicação da vitrine da onda 2 (pacotes 2A e 2B): até lá, o que o grupo J
// acha de errado sai como NÃO VERIFICADO (é o estado anterior à onda, conhecido), para a rotina diária não pausar
// anúncio por defeito que já tem correção agendada. Daí em diante, falha no grupo J é DEFEITO. --exigir-jornada força o true.
const JORNADA_PUBLICADA = false;
const EXIGIR_JORNADA = args.includes('--exigir-jornada');
const APP_ID = '6aefffe66b684db9404b1994';
const GRUPO_FUNCOES = 'I funções';
// linhas de prova (id da plataforma, não é segredo: a regra de acesso é o que protege). Criadas pelo MCP em 10/11/2026.
const LINHAS_DE_PROVA = { Operacao: '6af3422f603d6f31bb6004e4', PedidoPortaAberta: '6af3423044c36fcae207db26' };
const FUNCOES_AUTOCREAT = String(opt('--funcoes-autocreat', 'https://creatmtt.com.br/functions')).replace(/\/$/, '');
const CONF = { 'x-conferencia': '1' };
const ARQ_JSON = opt('--json', '');
const UA = 'Mozilla/5.0 (Linux; Android 13; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const NICHOS = ['barbearia', 'salao', 'academia'];
const SUJEIRA = /\{\{|\}\}|\(a informar\)|REVISAO_JURIDICA|\[PREENCHER|undefined|NaN|\bnull\b/;

const res = [];
function anota(grupo, nome, ok, detalhe) {
  res.push({ grupo, nome, ok: !!ok, detalhe: detalhe || '' });
  console.log(`${ok ? 'ok    ' : 'FALHA '} ${grupo} · ${nome}${detalhe ? ' | ' + detalhe : ''}`);
}
// não verificado: não conta como certo nem como defeito, e aparece no resumo com o motivo
// itens: quantas conferências ficaram de fora com este registro (entra no número da última linha)
const naoVerificadas = [];
function naoVerificado(grupo, nome, motivo, itens = 1) {
  naoVerificadas.push({ grupo, nome, motivo, itens });
  console.log(`NÃO VERIFICADO ${grupo} · ${nome} | ${motivo}`);
}
const avisos = [];
function aviso(grupo, nome, detalhe) {
  avisos.push({ grupo, nome, detalhe });
  console.log(`AVISO ${grupo} · ${nome} | ${detalhe}`);
}

(async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch (e) { console.error('erro   playwright ausente'); process.exit(2); }
  const nav = await chromium.launch();
  const ORIGEM = new URL(BASE).origin;
  const novoCtx = async () => {
    const c = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-BR', userAgent: UA });
    // X-Conferencia: 1 só nas requisições ao próprio site (o Mercado Pago e a Meta não recebem o cabeçalho)
    await c.route(u => { try { return new URL(u).origin === ORIGEM; } catch (e) { return false; } },
      route => route.continue({ headers: Object.assign({}, route.request().headers(), CONF) }));
    return c;
  };
  const texto = pg => pg.evaluate(() => document.body.innerText);

  /* ---------------- A. páginas ---------------- */
  if (!SO_FUNCOES) {
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
  for (const nicho of (SO_FUNCOES ? [] : NICHOS)) {
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
      await pg.goto(`${BASE}/?nicho=${nicho}&utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=conferencia`, { waitUntil: 'networkidle', timeout: 60000 });
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
  for (const nicho of (SO_FUNCOES ? [] : NICHOS)) {
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
  if (!SO_FUNCOES) {
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
        await p2.goto(`${BASE}/?nicho=barbearia${praca === '(sem praça)' ? '' : '&utm_source=meta&utm_medium=pago&utm_campaign=' + praca}&utm_content=conferencia`, { waitUntil: 'networkidle', timeout: 60000 });
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
  if (!SO_FUNCOES) {
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

  /* ---------------- J. jornada depois do pagamento, link de teste e cookies (onda 2, pacote 2C) ---------------- */
  if (!SO_FUNCOES) {
    const anotaJ = (grupo, nome, ok, detalhe) => {
      if (ok || JORNADA_PUBLICADA || EXIGIR_JORNADA) return anota(grupo, nome, ok, detalhe);
      naoVerificado(grupo, nome, `a vitrine da onda 2 ainda não foi publicada (JORNADA_PUBLICADA = false); hoje: ${detalhe}`);
    };
    // títulos esperados: os publicados (conteudo/obrigado.json no ar); sem eles, os do repositório
    let textosObrigado = null;
    try {
      const c0 = await novoCtx(); const p0 = await c0.newPage();
      const r0 = await p0.goto(BASE + '/conteudo/obrigado.json', { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (r0 && r0.status() === 200) textosObrigado = JSON.parse(await r0.text());
      await c0.close();
    } catch (e) { /* cai no do repositório */ }
    if (!textosObrigado) { try { textosObrigado = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'conteudo', 'obrigado.json'), 'utf8')); } catch (e) { textosObrigado = {}; } }
    const est = (textosObrigado && textosObrigado.estados) || {};
    const limpo = s => String(s || '').replace(/\s+/g, ' ').replace(/[.!]+$/, '').trim().toLowerCase();
    const tituloDe = (k, reserva) => limpo((est[k] && est[k].titulo) || reserva);
    const tituloVisivel = pg => pg.evaluate(() => { const h = [...document.querySelectorAll('h1')].find(x => x.offsetParent !== null && x.innerText.trim()); return h ? h.innerText.trim() : ''; });
    const formVisivel = pg => pg.evaluate(() => [...document.querySelectorAll('main input:not([type=hidden]), main textarea, main select')].some(x => x.offsetParent !== null));
    // pagamento falso diferente a cada rodada (o servidor nunca confirma; limite de 10 por hora por pagamento)
    const pagFalso = '9' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
    const estados = [
      ['recusado', '?pago=mp&produto=pa-abertura-inauguracao&collection_status=rejected', [tituloDe('recusado', 'O pagamento não passou')], true],
      ['pendente', '?pago=mp&produto=pa-abertura-inauguracao&collection_status=pending', [tituloDe('pendente', 'Seu Pix espera o pagamento')], false],
      // aprovado só pela URL, com pagamento que o servidor não conhece: a tela NUNCA diz "confirmado";
      // vale o título de espera (a_conferir, conferência longa) ou o de aprovado pela volta do Mercado Pago
      ['aprovado', `?pago=mp&produto=pa-abertura-inauguracao&collection_status=approved&payment_id=${pagFalso}&payment_type=bank_transfer`,
        [tituloDe('a_conferir', 'Estamos conferindo o seu pagamento'), tituloDe('conferencia_longa', 'Seu pagamento está em conferência'), 'pagamento aprovado'], false]
    ];
    const confirmado = [tituloDe('aprovado', 'Pagamento confirmado'), 'pagamento confirmado'];
    for (const [nome, q, aceitos, semForm] of estados) {
      const ctx = await novoCtx(); const pg = await ctx.newPage();
      try {
        await pg.goto(`${BASE}/obrigado/${q}`, { waitUntil: 'networkidle', timeout: 60000 });
        await pg.waitForTimeout(nome === 'aprovado' ? 7000 : 2500);   // dá tempo de o servidor responder ao pagamento falso
        const t = await tituloVisivel(pg);
        const form = await formVisivel(pg);
        // no aprovado falso, "Pagamento confirmado" só é aceito se for também o título de espera (não deve ser)
        const mente = nome === 'aprovado' && confirmado.includes(limpo(t)) && !aceitos.slice(0, 2).includes(limpo(t));
        const ok = aceitos.includes(limpo(t)) && !mente && !(semForm && form);
        anotaJ('J jornada', `/obrigado/ ${nome}: título certo${semForm ? ' e sem formulário' : ''}${nome === 'aprovado' ? ' e nunca "confirmado" sem o servidor' : ''}`, ok,
          ok ? t : `título "${t || 'nenhum'}" · esperado: ${aceitos.join(' | ')}${mente ? ' · MENTE: diz confirmado sem o servidor' : ''}${semForm && form ? ' · formulário visível' : ''}`);
      } catch (e) { anotaJ('J jornada', `/obrigado/ ${nome}`, false, String(e).slice(0, 140)); }
      await ctx.close();
    }
    // link de teste: fora do Google
    {
      const ctx = await novoCtx(); const pg = await ctx.newPage();
      try {
        const r = await pg.goto(`${BASE}/abrir/?teste=pa-teste`, { waitUntil: 'networkidle', timeout: 60000 });
        await pg.waitForTimeout(1500);
        const meta = await pg.evaluate(() => [...document.querySelectorAll('meta[name="robots"], meta[name="googlebot"]')].map(m => m.content).join(' '));
        const cab = (r && r.headers()['x-robots-tag']) || '';
        const ok = /noindex/i.test(meta) || /noindex/i.test(cab);
        anotaJ('J jornada', '/abrir/?teste=pa-teste tem noindex', ok, ok ? (meta || cab) : `robots "${meta || 'nenhum'}" · X-Robots-Tag "${cab || 'nenhum'}"`);
      } catch (e) { anotaJ('J jornada', '/abrir/?teste=pa-teste tem noindex', false, String(e).slice(0, 140)); }
      await ctx.close();
    }
    // cookies da hospedagem: chegando de fora (Referer do Instagram), nenhum base44_* antes do aceite;
    // e a meta que manda o script da hospedagem esperar o consentimento (contrato do pacote 2A: content="consent")
    for (const u of ['/', '/abrir/', '/obrigado/']) {
      const ctx = await novoCtx(); const pg = await ctx.newPage();
      try {
        await pg.goto(`${BASE}${u}${u === '/' ? '?nicho=barbearia&utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=conferencia' : ''}`,
          { waitUntil: 'networkidle', timeout: 60000, referer: 'https://l.instagram.com/' });
        await pg.waitForTimeout(3000);
        const antes = (await ctx.cookies()).map(c => c.name).filter(n => /^base44_/i.test(n));
        anotaJ('J cookies', `${u}: nenhum cookie base44_* antes do aceite (Referer externo)`, antes.length === 0, antes.length ? `gravados: ${antes.join(', ')}` : '');
        const metas = await pg.evaluate(() => [...document.querySelectorAll('meta[name="base44-visitor-tracking"]')].map(m => m.content));
        const okMeta = metas.includes('consent');
        anotaJ('J cookies', `${u}: meta base44-visitor-tracking com content="consent"`, okMeta, `metas: ${metas.length ? metas.map(m => `"${m}"`).join(', ') : 'nenhuma'}`);
        if (okMeta && metas.some(m => m !== 'consent')) aviso('J cookies', `${u} meta duplicada`, `a hospedagem também injeta ${metas.filter(m => m !== 'consent').join(', ')}; vale o cookie conferido acima`);
      } catch (e) { anotaJ('J cookies', `${u}: cookies e meta`, false, String(e).slice(0, 140)); }
      await ctx.close();
    }
  }

  /* ---------------- I. funções do pedido e do pagamento (D10) ---------------- */
  if (!SEM_FUNCOES) {
    // contexto de requisição próprio: o do navegador não herda o proxy do ambiente (o Chromium herda)
    const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || '';
    const api = await require('playwright').request.newContext(Object.assign({ userAgent: UA }, PROXY ? { proxy: { server: PROXY } } : {}));
    const F = n => `${BASE}/api/pa/${n}`;
    const PESSOAL = /@|\b55\d{10,11}\b|"(email|e_mail|whatsapp|telefone|nome|negocio|cidade|cpf|payer|email_hash|segredo_hash|token_hash)"/i;
    const json = s => { try { return JSON.parse(s); } catch (e) { return null; } };
    async function chama(url, { metodo = 'POST', corpo, cab = {} } = {}) {
      const headers = Object.assign({ 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, CONF, cab);
      try {
        const r = await api.fetch(url, { method: metodo, headers, data: corpo === undefined ? undefined : (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)), timeout: 30000, failOnStatusCode: false, maxRedirects: 0 });
        const txt = await r.text();
        return { st: r.status(), txt, j: json(txt), h: r.headers() };
      } catch (e) { return { st: -1, txt: String(e).slice(0, 120), j: null, h: {} }; }
    }
    const curto = r => `status ${r.st} · ${String(r.txt).replace(/\s+/g, ' ').slice(0, 90)}`;
    // recusa "de verdade": 4xx com corpo JSON da própria função (um 404 em HTML é rota que não existe no ar)
    const recusaDaFuncao = (x, aceitos) => x.j !== null && (aceitos ? aceitos.includes(x.st) : (x.st >= 400 && x.st < 500 && x.st !== 404));
    const G = GRUPO_FUNCOES;
    // pagamento falso diferente a cada rodada: o limite de 10 por hora por pagamento da portaAbertaVerificar
    // (INTEGRACAO-PAGAMENTO.md) não pode transformar rodadas seguidas da conferência em defeito falso
    const pagamentoFalso = () => '9' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0');

    // As rotas /api/pa/* só existem depois do deploy das funções da onda 1. Antes disso, elas respondem a
    // página 404 do app (HTML). Com FUNCOES_PUBLICADAS = false, rota ausente vira NÃO VERIFICADO (para a
    // conferência diária não pausar anúncio por função que ainda não subiu). O coordenador troca para true no
    // mesmo ato do deploy das funções; daí em diante, rota ausente é DEFEITO. --exigir-funcoes força o true.
    const sonda = await chama(F('contar'), { corpo: { evento: 'visita', utm_content: 'conferencia' } });
    const rotasAusentes = sonda.st === 404 && sonda.j === null && !(FUNCOES_PUBLICADAS || EXIGIR_FUNCOES);
    if (rotasAusentes) naoVerificado(G, '12 conferências das rotas /api/pa e 5 do OPTIONS', 'as funções do pedido ainda não estão publicadas (rota devolve 404 em HTML); depois do deploy, troque FUNCOES_PUBLICADAS para true', 17);
    let r;
    if (!rotasAusentes) {
      // registrarPedido: teste:true valida e não grava (a não gravação foi provada pelo 1A pelo MCP; daqui só se vê a resposta)
      let corpoTeste = null;
      try { corpoTeste = JSON.parse(fs.readFileSync(require('path').join(__dirname, '..', 'schema', 'exemplos', 'pedido.registro-v1-teste.valido.json'), 'utf8')); } catch (e) { /* sem arquivo */ }
      if (corpoTeste) {
        corpoTeste.teste = true; corpoTeste.utm_content = 'conferencia';
        r = await chama(F('registrarPedido'), { corpo: corpoTeste });
        anota(G, 'registrarPedido teste:true devolve 200 {ok:true}', r.st === 200 && r.j && r.j.ok === true, r.st === 200 && r.j && r.j.ok === true ? '' : curto(r));
      } else anota(G, 'registrarPedido teste:true', false, 'schema/exemplos/pedido.registro-v1-teste.valido.json ausente');
      r = await chama(F('registrarPedido'), { corpo: { teste: true }, cab: { 'sec-fetch-site': 'cross-site' } });
      anota(G, 'registrarPedido de outro site (Sec-Fetch-Site: cross-site) recusado com 403', recusaDaFuncao(r, [403]), recusaDaFuncao(r, [403]) ? '' : curto(r));
      r = await chama(F('registrarPedido'), { metodo: 'GET' });
      anota(G, 'registrarPedido por GET devolve 405', r.st === 405, r.st === 405 ? '' : curto(r));
      r = await chama(F('registrarPedido'), { corpo: { id: { $ne: '' }, teste: true } });
      anota(G, 'registrarPedido com objeto no lugar do id devolve 4xx', recusaDaFuncao(r, [400, 422]), recusaDaFuncao(r, [400, 422]) ? `status ${r.st}` : curto(r));

      // contar: 204 sempre, e a conferência é descartada (utm_content=conferencia e X-Conferencia)
      r = await chama(F('contar'), { corpo: { evento: 'visita', nicho: 'barbearia', praca: 'feira', utm_content: 'conferencia' } });
      anota(G, 'contar devolve 204 (conferência descartada)', r.st === 204, r.st === 204 ? '' : curto(r));
      r = await chama(F('contar'), { corpo: { evento: 'visita', utm_content: 'conferencia' }, cab: { 'sec-fetch-site': 'cross-site' } });
      anota(G, 'contar de outro site recusado com 403', r.st === 403, r.st === 403 ? '' : curto(r));

      // consultarPedido: id inexistente e segredo errado de um pedido de teste respondem igual
      const a = await chama(F('consultarPedido'), { corpo: { id: 'PA-ZZZZZZZZZZ', segredo: 'AAAAAAAAAAAAAAAAAAAAAA' } });
      const b = await chama(F('consultarPedido'), { corpo: { id: 'PA-TESTERLS01', segredo: 'BBBBBBBBBBBBBBBBBBBBBB' } });
      anota(G, 'consultarPedido: id falso responde 404 nao_encontrado', a.st === 404 && a.j && a.j.erro === 'nao_encontrado', a.st === 404 ? '' : curto(a));
      anota(G, 'consultarPedido: segredo errado responde igual a id falso', a.st === b.st && a.txt === b.txt && a.st > 0, a.st === b.st && a.txt === b.txt ? '' : `falso: ${curto(a)} · segredo errado: ${curto(b)}`);

      // confirmarPagamento com payment_id falso: recusa, sem 5xx e sem dado pessoal
      r = await chama(F('confirmarPagamento'), { corpo: { payment_id: pagamentoFalso() } });
      const recusou = r.st > 0 && r.st < 500 && r.j && r.j.ok === false && !PESSOAL.test(r.txt);
      anota(G, 'confirmarPagamento com pagamento falso recusa sem 5xx e sem dado pessoal', recusou, recusou ? (r.j.motivo || r.j.erro || '') : curto(r));
      r = await chama(F('confirmarPagamento'), { corpo: { payment_id: { $gt: 0 } } });
      anota(G, 'confirmarPagamento com objeto no payment_id devolve 4xx', recusaDaFuncao(r, [400, 422]), recusaDaFuncao(r, [400, 422]) ? `status ${r.st}` : curto(r));

      // aprovarRascunho com token falso: 4xx
      r = await chama(F('aprovarRascunho'), { corpo: { slug: 'conferencia--r-000000000000', token: 'AAAAAAAAAAAAAAAAAAAAAA' } });
      const negou = recusaDaFuncao(r) && !PESSOAL.test(r.txt);
      anota(G, 'aprovarRascunho com token falso devolve 4xx', negou, negou ? `status ${r.st}` : curto(r));

      // função interna sem login: 401
      r = await chama(F('rotina'), { corpo: {} });
      anota(G, 'função interna (rotina) sem login devolve 401', recusaDaFuncao(r, [401]), recusaDaFuncao(r, [401]) ? '' : curto(r));

    }
    // portaAbertaVerificar (AutoCreatFlux): pagamento falso devolve exatamente {aprovado:false}
    r = await chama(`${FUNCOES_AUTOCREAT}/portaAbertaVerificar`, { corpo: { payment_id: pagamentoFalso() } });
    const soFalso = r.st === 200 && r.j && r.j.aprovado === false && Object.keys(r.j).length === 1;
    if (r.st === 429) naoVerificado(G, 'portaAbertaVerificar falso devolve só {aprovado:false}', 'limite de taxa da função (429): a origem desta conferência passou de 60 por hora; rode de novo em 1 hora');
    else anota(G, 'portaAbertaVerificar falso devolve só {aprovado:false}', soFalso, soFalso ? '' : curto(r));

    // portaAbertaNotificacao com assinatura inválida: 401
    const ts = Date.now();
    const pn = pagamentoFalso();
    r = await chama(`${FUNCOES_AUTOCREAT}/portaAbertaNotificacao?data.id=${pn}&type=payment`, {
      corpo: { action: 'payment.updated', data: { id: pn }, type: 'payment' },
      cab: { 'x-signature': `ts=${ts},v1=${'0'.repeat(64)}`, 'x-request-id': 'conferencia-' + ts }
    });
    anota(G, 'portaAbertaNotificacao com assinatura inválida devolve 401', r.st === 401, r.st === 401 ? '' : curto(r));

    if (!rotasAusentes) {
      // OPTIONS com origem estranha: não pode devolver a origem nem credenciais
      const ESTRANHA = 'https://golpe.example';
      for (const n of ['registrarPedido', 'contar', 'consultarPedido', 'confirmarPagamento', 'aprovarRascunho']) {
        const o = await chama(F(n), { metodo: 'OPTIONS', cab: { origin: ESTRANHA, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
        const acao = o.h['access-control-allow-origin'];
        const cred = String(o.h['access-control-allow-credentials'] || '').toLowerCase() === 'true';
        const nome = `OPTIONS ${n} com origem estranha sem Access-Control-Allow-Origin`;
        if (o.st < 0) anota(G, nome, false, curto(o));
        else if (!acao) anota(G, nome, true, `status ${o.st}`);
        else if (acao === ESTRANHA || cred) anota(G, nome, false, `devolveu ${acao}${cred ? ' com credenciais' : ''}`);
        else if (CORS_ESTRITO) anota(G, nome, false, `devolveu ${acao}`);
        else { anota(G, nome.replace('sem Access-Control-Allow-Origin', 'sem ecoar a origem nem credenciais'), true, `devolveu ${acao}`); aviso(G, `OPTIONS ${n}`, `a borda do Base44 devolve "${acao}" (PEDIDO-API.md 8.4); sem cookie e sem dado pessoal, mas o critério D10 pede ausência total: decisão da segurança`); }
      }

    }
    // 4 entidades: anônimo (e usuário comum, se houver sessão de teste) não lê nem escreve
    const ENT = ['PedidoPortaAberta', 'ContadorDia', 'LimiteTaxa', 'Operacao'];
    const QUEM = [['anônimo', null]];
    const tokComum = process.env.CONFERENCIA_TOKEN_USUARIO_COMUM || '';
    if (tokComum) QUEM.push(['usuário comum', tokComum]);
    const idFalso = '000000000000000000000000';
    for (const [quem, tok] of QUEM) {
      for (const E of ENT) {
        const base = `${BASE}/api/apps/${APP_ID}/entities/${E}`;
        const cab = Object.assign({ 'x-app-id': APP_ID }, tok ? { authorization: 'Bearer ' + tok } : {});
        const vazioOuNegado = x => x.st === 401 || x.st === 403 || (x.st === 200 && Array.isArray(x.j) && x.j.length === 0);
        const naoGravou = x => x.st === 401 || x.st === 403 || x.st === 404 || x.st === 405;
        const prova = LINHAS_DE_PROVA[E];
        // com linha de prova: o update no id real tem de dar 401/403 (403 só sai se a linha existe; sumiu = 404)
        const negadoComLinha = x => x.st === 401 || x.st === 403;
        let x, provaExistia = false;
        if (prova) {
          x = await chama(`${base}/${prova}`, { metodo: 'PUT', corpo: {}, cab });
          provaExistia = negadoComLinha(x);
          anota(G, `${quem} · ${E} update na linha de prova recusado (a linha existe)`, provaExistia,
            negadoComLinha(x) ? `status ${x.st}` : (x.st === 404 ? 'status 404: a linha de prova sumiu; recrie pelo MCP e troque LINHAS_DE_PROVA' : curto(x)));
        }
        x = await chama(base, { metodo: 'GET', cab });
        anota(G, `${quem} · ${E} list não devolve linha${prova ? ' (com a linha de prova lá)' : ''}`, vazioOuNegado(x), vazioOuNegado(x) ? `status ${x.st}` : curto(x));
        // com prova: filtra pelo id da linha que existe; sem prova: filtro aberto
        const filtro = prova ? `{"id":"${prova}"}` : '{"_id":{"$exists":true}}';
        x = await chama(`${base}?q=${encodeURIComponent(filtro)}`, { metodo: 'GET', cab });
        const filtroOk = vazioOuNegado(x) || x.st === 400 || x.st === 422;
        anota(G, `${quem} · ${E} filter ${prova ? 'pelo id da linha de prova ' : ''}não devolve linha`, filtroOk, filtroOk ? `status ${x.st}` : curto(x));
        x = await chama(base, { corpo: {}, cab });
        anota(G, `${quem} · ${E} create recusado`, x.st === 401 || x.st === 403, x.st === 401 || x.st === 403 ? `status ${x.st}` : curto(x) + (x.st >= 200 && x.st < 300 ? ' · GRAVOU: apagar a linha criada' : ''));
        if (prova) {
          x = await chama(`${base}/${prova}`, { metodo: 'DELETE', cab });
          anota(G, `${quem} · ${E} delete na linha de prova recusado`, naoGravou(x), naoGravou(x) ? `status ${x.st}` : curto(x));
          x = await chama(`${base}/${prova}`, { metodo: 'PUT', corpo: {}, cab });
          anota(G, `${quem} · ${E} linha de prova continua lá depois do delete`, negadoComLinha(x),
            negadoComLinha(x) ? `status ${x.st}` : (x.st === 404 ? (provaExistia ? 'status 404: o delete anônimo APAGOU a linha de prova' : 'status 404: a linha de prova já não existia antes do delete') : curto(x)));
        } else {
          x = await chama(`${base}/${idFalso}`, { metodo: 'PUT', corpo: {}, cab });
          anota(G, `${quem} · ${E} update recusado`, naoGravou(x), naoGravou(x) ? `status ${x.st}` : curto(x));
          x = await chama(`${base}/${idFalso}`, { metodo: 'DELETE', cab });
          anota(G, `${quem} · ${E} delete recusado`, naoGravou(x), naoGravou(x) ? `status ${x.st}` : curto(x));
        }
      }
    }
    if (!tokComum) naoVerificado(G, 'usuário comum logado nas 4 entidades (22 tentativas)', 'sem CONFERENCIA_TOKEN_USUARIO_COMUM nesta execução; a prova de 10/11 está em docs/PEDIDO-API.md 8.2', 22);
    await api.dispose();
  }

  await nav.close();
  const falhas = res.filter(r => !r.ok);
  if (ARQ_JSON) fs.writeFileSync(ARQ_JSON, JSON.stringify({ base: BASE, total: res.length, falhas: falhas.length, nao_verificadas: naoVerificadas, avisos, itens: res }, null, 1));
  const ext = (naoVerificadas.length ? ` · ${naoVerificadas.length} não verificada(s)` : '') + (avisos.length ? ` · ${avisos.length} aviso(s)` : '');
  const escopo = SO_FUNCOES ? 'só funções' : (SEM_FUNCOES ? 'vitrine, SEM as funções' : 'vitrine e funções');
  // contagem esperada (cabeçalho): vitrine 64 = A a H 54 + J 10 (menos as praças do Mercado Pago com --sem-mp); funções 41
  const esperadas = (SO_FUNCOES ? 0 : 64 - (SEM_MP ? Object.keys(links).length : 0)) + (SEM_FUNCOES ? 0 : 41 + (process.env.CONFERENCIA_TOKEN_USUARIO_COMUM ? 22 : 0));
  const naoRodaram = naoVerificadas.reduce((s, n) => s + (n.itens || 1), 0);
  const jornada = res.filter(r => /^J /.test(r.grupo));
  console.log(`\n${res.length} conferências no ar (${escopo}; esperadas ${esperadas}${naoRodaram ? `, ${naoRodaram} delas não verificadas` : ''}) · ${res.length - falhas.length} certas · ${falhas.length} com defeito${ext}` + (SO_FUNCOES ? '' : ` · jornada e cookies ${jornada.filter(r => r.ok).length} de ${jornada.length + naoVerificadas.filter(n => /^J /.test(n.grupo)).length} certas`));
  if (falhas.length) {
    console.error('DEFEITO NO AR. Pause os anúncios, corrija e rode de novo:');
    falhas.forEach(f => console.error(`  - ${f.grupo} · ${f.nome}${f.detalhe ? ' | ' + f.detalhe : ''}`));
    process.exit(1);
  }
  // "funcionam de ponta a ponta" só com o grupo I inteiro conferido (regra 12 da casa)
  const nvFuncoes = naoVerificadas.filter(n => n.grupo === GRUPO_FUNCOES);
  const itensFuncoes = nvFuncoes.reduce((s, n) => s + (n.itens || 1), 0);
  const outrasNv = naoVerificadas.filter(n => n.grupo !== GRUPO_FUNCOES);
  let final;
  if (SEM_FUNCOES) final = 'ok     a vitrine no ar funciona para quem chega pelo anúncio; as funções do pedido NÃO foram conferidas (grupo I pulado nesta rodada).';
  else if (nvFuncoes.length) final = `${SO_FUNCOES ? 'ok     nada com defeito no que respondeu' : 'ok     a vitrine no ar funciona'}; as funções do pedido NÃO foram conferidas (${itensFuncoes} itens: ${nvFuncoes.map(n => n.nome).join('; ')}).`;
  else final = SO_FUNCOES ? 'ok     as funções no ar respondem e recusam como o contrato manda (vitrine não conferida nesta rodada).'
    : 'ok     o site no ar, a volta do pagamento, os cookies e as funções funcionam de ponta a ponta para quem chega pelo anúncio.';
  console.log(final + (outrasNv.length ? ` Atenção: ${outrasNv.length} outro(s) item(ns) NÃO VERIFICADO(S) acima não contam como prova.` : ''));
})().catch(e => { console.error('erro  ', e); process.exit(2); });
