#!/usr/bin/env node
// conferir-app.cjs · prova do app Trilhas de Itaitu num celular Android emulado, com e sem internet (Trilho, devops, T12, 20/11/2026).
//
// Confere os critérios de aceite do BRIEFING e da ARQUITETURA (seção 12):
//   (2) abre sem erro de console e sem requisição falhando, 390 px sem rolagem horizontal, alvos de toque >= 44 px
//   (3) régua operável por teclado (Tab chega, setas de 5 em 5, PageUp 1 h) e horas anunciadas em #hora-live,
//       sombra sempre com a palavra
//   (4) espera o pré-cache terminar ('pronto' no BroadcastChannel 'itaitu-cache'), context.setOffline(true),
//       recarrega: mapa, relevo, satélite, sombra, horas e cartão funcionam sem rede
//   (5) fps dos 20 primeiros quadros do dia correndo com CPU 4x (CDP); abaixo de 30 o app tem de ter caído no modo parado
//   (6) cachoeiras e poços sem coordenada (lidos do pontos.geojson) sem hora, com "vá com guia" e "Chamar um guia"
//   (7) cartão 1080x1920 gerado offline com a marca de marcas/demo-village.json
//   (8) ?demo=1 percorre os 60 s sem erro
//   (9) prefers-reduced-motion respeitado (abertura pulada, dia parado)
//   (10) correções do QA de 20/11: régua às 22:30 em amanhã sem "já escureceu", ?m= fora do índice sem 404,
//        ?vitrine=1 só no iframe do marcos.html (SOS pede o 2º toque, nunca desliga), cartão sem motor
//   e marcos.html: abre sem erro (online e offline) com manifest próprio.
//
// Uso:
//   node projetos/itaitu-mapa/testes/conferir-app.cjs [URL_BASE] [--so=2,3,4] [--sem-demo]
//   URL_BASE: endereço da pasta do app, ex. http://127.0.0.1:8123/itaitu/ . Sem URL, sobe
//   `python3 -m http.server` em site/ numa porta livre e derruba no fim.
// Saída: linhas "ok" / "falhou" com a causa. Código 0 = tudo ok; 1 = alguma conferência falhou; 2 = não deu para rodar.
// Playwright e Chromium da sessão (não rode playwright install). Não escreve nada no repositório.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const RAIZ_SITE = path.resolve(__dirname, '../../../site');
const APP = path.join(RAIZ_SITE, 'itaitu');
const AGORA = '2026-11-20T13:00';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const CELULAR = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: UA_ANDROID, locale: 'pt-BR', timezoneId: 'America/Bahia' };
const HHMM = /\b\d{1,2}:\d{2}\b/;

const args = process.argv.slice(2);
const opc = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v = '1'] = a.slice(2).split('='); return [k, v]; }));
const SO = opc.so ? new Set(opc.so.split(',')) : null;
const quer = (n) => !SO || SO.has(String(n));
let base = args.find((a) => !a.startsWith('--'));

const falhas = [];
const ok = (cond, msg, causa) => {
  if (cond) console.log(`ok      ${msg}`);
  else { console.log(`falhou  ${msg}${causa ? ` (${causa})` : ''}`); falhas.push(msg); }
  return !!cond;
};
const secao = (t) => console.log(`\n# ${t}`);

// ---------------------------------------------------------------- servidor
function portaLivre() {
  return new Promise((res, rej) => { const s = net.createServer(); s.once('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
}
async function subirServidor() {
  const porta = await portaLivre();
  const proc = spawn('python3', ['-m', 'http.server', String(porta), '--bind', '127.0.0.1'], { cwd: RAIZ_SITE, stdio: 'ignore' });
  const url = `http://127.0.0.1:${porta}/itaitu/`;
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(url + 'precache.json'); if (r.ok) return { proc, url }; } catch (_) {}
    await new Promise((r) => setTimeout(r, 100));
  }
  proc.kill();
  throw new Error('python3 -m http.server não respondeu');
}

async function abrirChromium(playwright) {
  const flags = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  try { return await playwright.chromium.launch({ args: flags }); }
  catch (e) {
    const pasta = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const cands = fs.existsSync(pasta) ? fs.readdirSync(pasta).filter((n) => /^chromium-\d+$/.test(n)).sort().reverse() : [];
    for (const c of cands) {
      for (const sub of ['chrome-linux', 'chrome-linux64']) {
        const exe = path.join(pasta, c, sub, 'chrome');
        if (fs.existsSync(exe)) return playwright.chromium.launch({ executablePath: exe, args: flags });
      }
    }
    throw e;
  }
}

// registra erros de console, exceções e requisições falhando de uma página
function vigiar(page, rotulo) {
  const erros = [];
  const curto = (u) => u.replace(base, './');
  page.on('console', (m) => { if (m.type() === 'error') erros.push(`console: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => erros.push(`exceção: ${String((e && e.message) || e).slice(0, 200)}`));
  page.on('response', (r) => { if (r.status() >= 400) erros.push(`${r.status()} ${curto(r.url())}`); });
  page.on('requestfailed', (r) => {
    const t = r.failure()?.errorText || '?';
    if (/ERR_ABORTED/.test(t) && /\/tiles\//.test(r.url())) return;   // tile cancelado pelo MapLibre ao mover a câmera: não é falha
    erros.push(`falhou ${curto(r.url())} (${t})`);
  });
  erros.rotulo = rotulo;
  return erros;
}

// grava as mensagens do BroadcastChannel do SW desde o primeiro script da página
const GRAVAR_CANAL = () => {
  window.__canal = [];
  try { const c = new BroadcastChannel('itaitu-cache'); c.onmessage = (e) => window.__canal.push(e.data); } catch (_) {}
};

const esperarHoras = (page, ms = 45000) => page.waitForFunction(() => {
  const H = window.Itaitu && window.Itaitu.hora;
  return !!(H && H.calculado && window.Itaitu.map);
}, null, { timeout: ms });
const esperarAbertura = (page, ms = 60000) => page.waitForFunction(() => !!(window.Itaitu && window.Itaitu.hora && window.Itaitu.hora.abertura), null, { timeout: ms });

function semCoordenadaDoArquivo() {
  const pontos = JSON.parse(fs.readFileSync(path.join(APP, 'dados/pontos.geojson'), 'utf8'));
  return pontos.features.filter((f) => !f.geometry && ['cachoeira', 'poco'].includes(f.properties.tipo)).map((f) => ({ id: f.properties.id, nome: f.properties.nome }));
}

// alvos de toque visíveis menores que 44 px (links dentro de texto corrido ficam de fora, como no WCAG 2.5.8)
const ALVOS_PEQUENOS = () => {
  const sel = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], label.botao';
  const out = [];
  for (const e of document.querySelectorAll(sel)) {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(e);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0 || e.closest('[hidden], .sr-only, [inert]')) continue;
    if (e.classList.contains('sr-only') || (e.type === 'file')) continue;
    if (r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) continue;
    // crédito do mapa (© OpenStreetMap...) é link dentro de frase de atribuição: exceção "inline" do WCAG 2.5.8
    if (e.tagName === 'A' && e.closest('.maplibregl-ctrl-attrib-inner')) continue;
    if (e.tagName === 'A' && cs.display === 'inline' && e.parentElement && /^(P|LI|SPAN|SMALL|DD)$/.test(e.parentElement.tagName) && e.parentElement.textContent.trim().length > e.textContent.trim().length + 8) continue;
    // alvo real: o próprio elemento ou o rótulo/caixa que o envolve
    let w = r.width, h = r.height;
    const pai = e.closest('label');
    if (pai && pai !== e) { const pr = pai.getBoundingClientRect(); w = Math.max(w, pr.width); h = Math.max(h, pr.height); }
    if (Math.round(w) < 44 || Math.round(h) < 44) {
      const nome = (e.getAttribute('aria-label') || e.textContent || e.id || e.className || e.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 40);
      out.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} "${nome}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
  }
  return out;
};

const rolagem = (page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vista: window.innerWidth }));

async function gerarCartaoNaPagina(page) {
  return page.evaluate(async () => {
    const I = window.Itaitu, H = I.hora;
    const destino = 'cachoeira-veu-da-noiva';
    const tr = (I.dados?.trilhas?.features || []).find((f) => f.properties?.destino_id === destino && f.properties?.modo === 'pe')
      || (I.dados?.trilhas?.features || []).find((f) => f.properties?.destino_id === destino);
    const trilha = tr ? tr.geometry.coordinates.map((c) => [c[0], c[1]]) : [];
    const horas = H.horas()[destino];
    const apaga = horas?.hoje?.apaga ?? 960;
    const r = await H.gerarCartao({ trilha, destinoId: destino, chegadaMs: H.utcDe(H.data || '2026-11-20', apaga - 15), marca: I.marca, km: 1.2, desnivel_m: 80, duracao_s: 1800 });
    if (!r || !r.blob) return { erro: 'gerarCartao não devolveu imagem' };
    const bmp = await createImageBitmap(r.blob);
    const cor = getComputedStyle(document.documentElement).getPropertyValue('--cor-marca').trim();
    return { w: bmp.width, h: bmp.height, bytes: r.blob.size, tipo: r.blob.type, frase: r.frase, nome: r.nome, trilhaPontos: trilha.length,
      marca: { slug: I.marca?.slug, parceiro: I.marca?.parceiro, cor: I.marca?.cor }, corCss: cor, modo: r.dados?.modo };
  });
}

(async () => {
  let playwright;
  try { playwright = require('playwright'); } catch { console.error('Playwright não encontrado (use o da sessão; não rode playwright install).'); process.exit(2); }

  let servidor = null;
  if (!base) { servidor = await subirServidor(); base = servidor.url; }
  if (!base.endsWith('/')) base += '/';
  const marcaJson = JSON.parse(fs.readFileSync(path.join(APP, 'marcas/demo-village.json'), 'utf8'));
  console.log(`conferir-app · ${base} · celular Android emulado 390x844 · agora=${AGORA}`);

  let browser;
  try {
    browser = await abrirChromium(playwright);

    // ================================================================ contexto principal: online -> pré-cache -> offline
    if (quer(2) || quer(3) || quer(4) || quer(6) || quer(7)) {
      const ctx = await browser.newContext({ ...CELULAR, serviceWorkers: 'allow' });
      await ctx.addInitScript(GRAVAR_CANAL);
      const page = await ctx.newPage();
      const erros = vigiar(page, 'online');
      const url = `${base}?m=demo-village&agora=${AGORA}`;
      const t0 = Date.now();
      const resp = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      if (!resp || !resp.ok()) { console.error(`a página não abriu (${resp ? resp.status() : 'sem resposta'})`); process.exitCode = 2; return; }
      await esperarHoras(page);
      const msHoras = Date.now() - t0;
      await esperarAbertura(page).catch(() => {});

      if (quer(2)) {
        secao('(2) abre sem erro, 390 px, alvos de toque');
        console.log(`        horas na tela em ${msHoras} ms depois do goto`);
        const lw = await rolagem(page);
        ok(lw.doc <= lw.vista, `sem rolagem horizontal no mapa (${lw.doc} <= ${lw.vista} px)`);
        const peq = await page.evaluate(ALVOS_PEQUENOS);
        ok(peq.length === 0, `alvos de toque >= 44 px na tela do mapa`, peq.slice(0, 6).join('; '));
        await page.click('button[aria-controls="painel-destinos"]');
        await page.waitForSelector('#painel-destinos:not([hidden]) .tabua', { timeout: 10000 });
        await page.waitForTimeout(600);
        const lw2 = await rolagem(page);
        ok(lw2.doc <= lw2.vista, `sem rolagem horizontal com o painel de cachoeiras aberto (${lw2.doc} <= ${lw2.vista} px)`);
        const peq2 = await page.evaluate(ALVOS_PEQUENOS);
        ok(peq2.length === 0, `alvos de toque >= 44 px no painel de cachoeiras`, peq2.slice(0, 6).join('; '));
        const nums = await page.evaluate(() => [...document.querySelectorAll('.tabua__num')].filter((d) => /\d:\d\d/.test(d.textContent)).map((d) => parseFloat(getComputedStyle(d).fontSize)));
        ok(nums.length > 0 && nums.every((px) => px >= 28 && px <= 40), `números das tábuas entre 28 e 40 px (${[...new Set(nums)].join(', ')} px)`);
        await page.click('#painel-destinos .folha__fechar').catch(() => {});
      }

      if (quer(6)) {
        secao('(6) sem coordenada: sem hora, "vá com guia" e "Chamar um guia"');
        const esperado = semCoordenadaDoArquivo();
        console.log(`        pontos.geojson: ${esperado.length} cachoeira(s)/poço(s) sem coordenada: ${esperado.map((e) => e.nome).join(', ')}`);
        const lido = await page.evaluate(() => [...document.querySelectorAll('.tabua')].map((li) => ({
          id: li.dataset.ponto, estado: li.dataset.estado, texto: li.textContent.replace(/\s+/g, ' '),
          guia: [...li.querySelectorAll('a, button')].filter((a) => /chamar um guia/i.test(a.textContent)).map((a) => ({ href: a.getAttribute('href') || '', alto: a.getBoundingClientRect().height })),
        })));
        for (const e of esperado) {
          const li = lido.find((x) => x.id === e.id);
          if (!ok(li, `${e.nome}: tem tábua na lista`)) continue;
          ok(li.estado === 'sem-coordenada', `${e.nome}: data-estado="${li.estado}"`);
          ok(!HHMM.test(li.texto), `${e.nome}: nenhuma hora de sol na tábua`, (li.texto.match(HHMM) || [])[0]);
          ok(/vá com guia/i.test(li.texto), `${e.nome}: diz "vá com guia"`);
          ok(li.guia.length > 0 && li.guia.every((g) => g.href && g.href !== '#'), `${e.nome}: "Chamar um guia" com destino real`, li.guia.map((g) => g.href || 'sem href').join(','));
        }
      }

      if (quer(3)) {
        secao('(3) régua por teclado e leitor de tela');
        const sel = '#hora-regua-controle';
        // Tab a partir do começo da página chega na régua?
        await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
        let chegou = false;
        for (let i = 0; i < 80 && !chegou; i++) { await page.keyboard.press('Tab'); chegou = await page.evaluate(() => document.activeElement?.id === 'hora-regua-controle'); }
        ok(chegou, 'a régua é alcançável com Tab');
        await page.focus(sel);
        const foco = await page.evaluate(() => { const e = document.activeElement; const cs = getComputedStyle(e); const box = e.closest('.regua'); const cb = box ? getComputedStyle(box) : cs; return `${cs.outlineStyle}/${cs.outlineWidth} ${cs.boxShadow !== 'none' ? 'sombra' : ''} ${cb.outlineStyle !== 'none' || box?.matches(':focus-within') ? 'caixa' : ''}`; });
        ok(!/^none\/0px\s*$/.test(foco.trim()), `foco visível na régua (${foco.trim()})`);
        const v0 = Number(await page.$eval(sel, (e) => e.value));
        await page.keyboard.press('ArrowRight');
        const v1 = Number(await page.$eval(sel, (e) => e.value));
        ok(v1 - v0 === 5, `seta direita anda 5 min (${v0} -> ${v1})`);
        await page.keyboard.press('PageUp');
        const v2 = Number(await page.$eval(sel, (e) => e.value));
        const max = Number(await page.$eval(sel, (e) => e.max));
        ok(v2 - v1 === 60 || v2 === max, `PageUp anda 1 h (${v1} -> ${v2})`);
        await page.waitForTimeout(500);
        const live1 = await page.$eval('#hora-live', (e) => e.textContent.trim());
        ok(HHMM.test(live1), `#hora-live anuncia a hora ("${live1.slice(0, 90)}")`);
        const vt = await page.$eval(sel, (e) => e.getAttribute('aria-valuetext') || '');
        ok(HHMM.test(vt), `aria-valuetext traz a hora ("${vt.slice(0, 90)}")`);
        // passa da hora em que a serra apaga o sol do Véu: a palavra "sombra" tem de aparecer
        const apagaVeu = await page.evaluate(() => window.Itaitu.hora.horas()['cachoeira-veu-da-noiva']?.hoje?.apaga ?? null);
        for (let i = 0; i < 40; i++) {
          const v = Number(await page.$eval(sel, (e) => e.value));
          if (apagaVeu == null || v >= apagaVeu + 5) break;
          await page.keyboard.press('ArrowRight');
        }
        await page.waitForTimeout(600);
        const vt2 = await page.$eval(sel, (e) => e.getAttribute('aria-valuetext') || '');
        const live2 = await page.$eval('#hora-live', (e) => e.textContent.trim());
        ok(/sombra/i.test(vt2 + ' ' + live2), `depois de ${apagaVeu != null ? Math.floor(apagaVeu / 60) + ':' + String(apagaVeu % 60).padStart(2, '0') : '?'} a sombra vem com a palavra ("${(vt2 || live2).slice(0, 110)}")`);
        const marcaVeu = await page.evaluate(() => document.querySelector('.regua__marca[data-ponto="cachoeira-veu-da-noiva"]')?.dataset.luz || null);
        ok(marcaVeu === 'sombra', `marcador do Véu na régua passou a "sombra" (${marcaVeu})`);
        await page.keyboard.press('Home');
        await page.evaluate(() => window.Itaitu.hora.voltarAgora());
      }

      if (quer(2)) {
        secao('(2) console e rede na abertura online');
        ok(erros.length === 0, 'sem erro de console e sem requisição falhando (online)', erros.slice(0, 5).join(' | '));
      }

      if (quer(4) || quer(7)) {
        secao('(4) offline depois do pré-cache');
        const tPre = Date.now();
        let pronto = null;
        try {
          await page.waitForFunction(() => (window.__canal || []).some((m) => m && (m.tipo === 'pronto' || (m.tipo === 'estado' && m.pronto))), null, { timeout: 240000, polling: 500 });
          pronto = await page.evaluate(() => (window.__canal || []).filter((m) => m && (m.tipo === 'pronto' || (m.tipo === 'estado' && m.pronto))).pop());
        } catch (_) {}
        const msgs = await page.evaluate(() => (window.__canal || []).map((m) => m.tipo));
        const errCanal = await page.evaluate(() => (window.__canal || []).filter((m) => m.tipo === 'erro').map((m) => m.url));
        ok(!!pronto, `pré-cache terminou ('pronto' no BroadcastChannel) em ${((Date.now() - tPre) / 1000).toFixed(1)} s`, `mensagens: ${[...new Set(msgs)].join(',') || 'nenhuma'}`);
        ok(errCanal.length === 0, 'nenhum arquivo do pré-cache falhou', errCanal.slice(0, 5).join(', '));
        const lista = JSON.parse(fs.readFileSync(path.join(APP, 'precache.json'), 'utf8'));
        if (pronto) {
          ok(pronto.versao === lista.versao, `versão guardada = precache.json (${pronto.versao} = ${lista.versao})`);
          console.log(`        guardado: ${(pronto.bytes / 1048576).toFixed(2)} MB`);
        }
        const nCache = await page.evaluate(async () => { const ks = await caches.keys(); const n = ks.find((k) => k.startsWith('itaitu-v')); return n ? (await (await caches.open(n)).keys()).length : 0; });
        ok(nCache >= lista.arquivos.length, `cache tem os ${lista.arquivos.length} arquivos da lista (${nCache} entradas)`);

        await ctx.setOffline(true);
        const errosOff = vigiar(page, 'offline');
        const tiles = { dem: 0, sat: 0, falhou: 0, sw: 0 };
        page.on('response', (r) => { const u = r.url(); if (!/\/tiles\//.test(u)) return; if (r.status() === 200) { if (/\/tiles\/dem\//.test(u)) tiles.dem++; if (/\/tiles\/sat\//.test(u)) tiles.sat++; if (r.fromServiceWorker()) tiles.sw++; } });
        await page.reload({ waitUntil: 'load', timeout: 45000 });
        const online = await page.evaluate(() => navigator.onLine);
        ok(online === false, `navegador está sem rede (navigator.onLine = ${online})`);
        let horasOk = true;
        try { await esperarHoras(page); } catch (_) { horasOk = false; }
        ok(horasOk, 'offline: app abriu e calculou as horas');
        await page.waitForFunction(() => window.Itaitu.map && window.Itaitu.map.isStyleLoaded() && window.Itaitu.map.areTilesLoaded(), null, { timeout: 30000 }).catch(() => {});
        // a camada da sombra entra depois do 1º quadro do motor (worker lê os tiles de altitude do cache)
        await page.waitForFunction(() => !!window.Itaitu.map.getLayer('sombra-serra-camada'), null, { timeout: 30000 }).catch(() => {});
        // isStyleLoaded() fica falso por instantes enquanto uma fonte recarrega (a sombra troca a textura): basta ter ficado verdadeiro
        const estiloOk = await page.waitForFunction(() => window.Itaitu.map && window.Itaitu.map.isStyleLoaded(), null, { timeout: 20000, polling: 100 }).then(() => true, () => false);
        const estado = await page.evaluate(() => {
          const m = window.Itaitu.map;
          const tab = [...document.querySelectorAll('.tabua[data-ponto="cachoeira-veu-da-noiva"] .tabua__num')].map((d) => d.textContent.trim()).filter(Boolean);
          return { estilo: !!m && m.isStyleLoaded(), terreno: !!(m && m.getTerrain && m.getTerrain()), relevo: !!(m && m.getLayer('relevo-sombra')),
            sombra: !!(m && m.getLayer('sombra-serra-camada')), motor: !!window.Itaitu.motor, veu: tab, controlado: !!navigator.serviceWorker.controller,
            regua: document.getElementById('hora-regua-controle')?.getAttribute('aria-valuetext') || '' };
        });
        ok(estado.controlado, 'offline: página servida pelo service worker');
        ok(estiloOk, `offline: mapa carregou o estilo (${(await page.evaluate(() => window.Itaitu.map.getStyle().layers.length))} camadas)`);
        ok(estado.terreno && tiles.dem > 0, `offline: relevo 3D com tiles de altitude do cache (${tiles.dem} tiles dem com 200)`);
        ok(estado.relevo, 'offline: camada de relevo sombreado presente');
        ok(estado.motor && estado.sombra, `offline: motor da sombra ligado e camada da sombra no mapa (motor=${estado.motor}, camada=${estado.sombra})`);
        ok(estado.veu.some((v) => HHMM.test(v)), `offline: hora do Véu na tábua (${estado.veu.join(' / ')})`);
        ok(HHMM.test(estado.regua), `offline: régua com hora ("${estado.regua.slice(0, 60)}")`);
        // satélite (Sentinel-2 2016) do cache
        const satAntes = tiles.sat;
        await page.click('#ctl-camada').catch(() => {});
        await page.waitForTimeout(2500);
        await page.waitForFunction(() => window.Itaitu.map.areTilesLoaded(), null, { timeout: 15000 }).catch(() => {});
        ok(tiles.sat > satAntes, `offline: botão Satélite mostra a foto de 2016 do cache (${tiles.sat - satAntes} tiles sat com 200)`);
        await page.click('#ctl-camada').catch(() => {});
        ok(tiles.sw > 0, `offline: tiles vieram do service worker (${tiles.sw})`);

        if (quer(7)) {
          secao('(7) cartão 1080x1920 offline com a marca do JSON');
          const c = await gerarCartaoNaPagina(page).catch((e) => ({ erro: e.message }));
          if (c.erro) ok(false, 'cartão gerado offline', c.erro);
          else {
            ok(c.w === 1080 && c.h === 1920, `cartão ${c.w}x${c.h} (${(c.bytes / 1024).toFixed(0)} KB, ${c.tipo}), nome ${c.nome}`);
            ok(c.marca.slug === 'demo-village' && c.marca.parceiro === marcaJson.parceiro, `marca vinda de marcas/demo-village.json ("${c.marca.parceiro}")`);
            ok(String(c.corCss).toLowerCase() === marcaJson.cor.toLowerCase(), `cor do parceiro aplicada (--cor-marca ${c.corCss} = ${marcaJson.cor})`);
            ok(/\d{1,2}:\d{2}/.test(c.frase) && c.modo === 'sol', `frase do cartão com a hora: "${c.frase}"`);
          }
        }

        // app particular offline
        secao('marcos.html offline');
        const pm = await ctx.newPage();
        const errosM = vigiar(pm, 'marcos offline');
        const rm = await pm.goto(`${base}marcos.html`, { waitUntil: 'load', timeout: 30000 }).catch((e) => ({ ok: () => false, status: () => e.message }));
        await pm.waitForTimeout(4000);
        const man = await pm.evaluate(() => document.querySelector('link[rel=manifest]')?.getAttribute('href'));
        ok(rm.ok(), `marcos.html abre sem rede (${rm.status()})`);
        ok(man === './manifest-marcos.webmanifest', `marcos.html usa o manifest próprio (${man})`);
        ok(errosM.length === 0, 'marcos.html offline sem erro de console', errosM.slice(0, 4).join(' | '));
        await pm.close();

        await page.waitForTimeout(1000);
        ok(errosOff.length === 0, 'offline: sem erro de console e sem requisição falhando', errosOff.slice(0, 5).join(' | '));
      }
      await ctx.close();
    }

    // ================================================================ (5) fps com CPU 4x
    if (quer(5)) {
      secao('(5) 20 primeiros quadros do dia correndo, CPU 4x');
      const ctx = await browser.newContext({ ...CELULAR, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const erros = vigiar(page, 'fps');
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.goto(`${base}?agora=${AGORA}&sw=0`, { waitUntil: 'load', timeout: 60000 });
      let r = null;
      try { await esperarAbertura(page, 90000); r = await page.evaluate(() => window.Itaitu.hora.abertura); } catch (_) {}
      if (!r) ok(false, 'abertura terminou', 'Itaitu.hora.abertura ficou vazio em 90 s');
      else {
        console.log(`        resultado: ${JSON.stringify(r)}`);
        if (r.pulada) ok(false, 'o dia correu (abertura não foi pulada)', `pulada, motivo ${r.motivo || '?'}`);
        else if (r.fps == null) ok(r.parado, `sem medição de fps: só vale se caiu no modo parado (parado=${r.parado})`);
        else if (r.fps >= 30) ok(!r.parado, `${r.fps} fps >= 30: dia correu inteiro`);
        else ok(r.parado === true, `${r.fps} fps < 30: app caiu no modo parado (parado=${r.parado})`);
        const parado = await page.evaluate(() => ({ faixa: !document.getElementById('hora-faixa')?.hidden, etiquetas: document.querySelectorAll('[data-luz]').length }));
        ok(parado.faixa, 'depois da abertura a faixa "saia até" fica na tela');
      }
      ok(erros.length === 0, 'sem erro de console com CPU 4x', erros.slice(0, 4).join(' | '));
      await ctx.close();
    }

    // ================================================================ (9) movimento reduzido
    if (quer(9)) {
      secao('(9) prefers-reduced-motion');
      const ctx = await browser.newContext({ ...CELULAR, reducedMotion: 'reduce', serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const erros = vigiar(page, 'reduzido');
      await page.goto(`${base}?agora=${AGORA}&sw=0`, { waitUntil: 'load', timeout: 45000 });
      let r = null;
      try { await esperarHoras(page); await esperarAbertura(page, 20000); r = await page.evaluate(() => window.Itaitu.hora.abertura); } catch (_) {}
      ok(r && r.pulada === true, `abertura pulada: o dia não corre (${JSON.stringify(r)})`);
      const st = await page.evaluate(() => ({ reduz: window.Itaitu.reduzMovimento(), faixa: !document.getElementById('hora-faixa')?.hidden,
        horas: [...document.querySelectorAll('.tabua__num')].some((d) => /\d:\d\d/.test(d.textContent)), live: document.getElementById('hora-live')?.textContent || '' }));
      ok(st.reduz, 'Itaitu.reduzMovimento() = true');
      ok(st.faixa && st.horas, 'horas e faixa "saia até" aparecem paradas');
      ok(erros.length === 0, 'sem erro de console com movimento reduzido', erros.slice(0, 4).join(' | '));
      await ctx.close();
    }

    // ================================================================ (8) demo de 60 s
    if (quer(8) && !opc['sem-demo']) {
      secao('(8) ?demo=1 percorre os 60 s');
      const ctx = await browser.newContext({ ...CELULAR, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const erros = vigiar(page, 'demo');
      const t0 = Date.now();
      await page.goto(`${base}?demo=1&m=demo-village&agora=${AGORA}&sw=0`, { waitUntil: 'load', timeout: 45000 });
      const legendas = new Set();
      let viuCartao = false, cartaoTam = null, fim = false;
      while (Date.now() - t0 < 90000) {
        const s = await page.evaluate(() => ({
          leg: document.querySelector('.hora-demo__legenda')?.textContent || '',
          botao: document.querySelector('.hora-demo__botoes button')?.textContent || '',
          img: (() => { const i = document.querySelector('#hora-cartao[open] img'); return i ? `${i.naturalWidth}x${i.naturalHeight}` : null; })(),
          demo: document.documentElement.dataset.demo,
        })).catch(() => ({}));
        if (s.leg) legendas.add(s.leg);
        if (s.img) { viuCartao = true; cartaoTam = s.img; }
        if (/de novo/i.test(s.botao || '')) { fim = true; break; }
        await page.waitForTimeout(1000);
      }
      const dur = (Date.now() - t0) / 1000;
      ok(fim, `demonstração chegou ao fim ("Ver de novo") em ${dur.toFixed(0)} s`);
      ok(fim && dur >= 55 && dur <= 80, `duração perto de 60 s (${dur.toFixed(0)} s)`);
      ok(legendas.size >= 4, `${legendas.size} legendas de fase vistas`);
      ok(viuCartao && cartaoTam === '1080x1920', `cartão apareceu na fase 4 (${cartaoTam || 'não apareceu'})`);
      ok(erros.length === 0, 'sem erro de console do início ao fim da demonstração', erros.slice(0, 5).join(' | '));
      await ctx.close();
    }

    // ================================================================ (10) correções do QA de 20/11 (Pixel)
    if (quer(10)) {
      secao('(10) régua à noite, marca fora do índice, vitrine só no iframe, cartão sem motor');
      const ctx = await browser.newContext({ ...CELULAR, serviceWorkers: 'block' });

      // a) 22:30: a régua abre em amanhã, no "saia até" (ou no nascer), nunca em "já escureceu"
      {
        const page = await ctx.newPage();
        const erros = vigiar(page, 'noite');
        await page.goto(`${base}?agora=2026-11-20T22:30&sw=0`, { waitUntil: 'load', timeout: 45000 });
        await esperarHoras(page);
        await esperarAbertura(page, 20000).catch(() => {});
        await page.waitForTimeout(400);
        const r = await page.evaluate(() => {
          const c = document.getElementById('hora-regua-controle');
          const H = window.Itaitu.hora;
          const saias = Object.values(H.horas()).map((x) => x.amanha?.saiaAte).filter((x) => x != null);
          return { vt: c?.getAttribute('aria-valuetext') || '', v: Number(c?.value), min: Number(c?.min), max: Number(c?.max), amanha: H.amanha, saias };
        });
        console.log(`        22:30 -> régua ${r.v} (${r.min}..${r.max}), "${r.vt.slice(0, 90)}"`);
        ok(r.amanha, 'às 22:30 as tábuas passam para amanhã');
        ok(/^amanhã/i.test(r.vt), `aria-valuetext começa com "amanhã" ("${r.vt.slice(0, 60)}")`);
        ok(!/escureceu/i.test(r.vt), 'a régua de amanhã não abre em "já escureceu"');
        ok(r.v < r.max && (r.saias.includes(r.v) || r.v === r.min), `régua no "saia até" de amanhã ou no nascer (${r.v}; saia até ${r.saias.join(', ') || 'nenhum'})`);
        ok(erros.length === 0, 'sem erro de console às 22:30', erros.slice(0, 4).join(' | '));
        await page.close();
      }

      // b) ?m=<slug que não existe>: marca padrão sem pedir o arquivo (sem 404 no console)
      {
        const page = await ctx.newPage();
        const erros = vigiar(page, 'marca');
        const pedidos = [];
        page.on('request', (q) => { if (/\/marcas\//.test(q.url())) pedidos.push(q.url().replace(base, './')); });
        await page.goto(`${base}?m=naoexiste&sw=0`, { waitUntil: 'load', timeout: 45000 });
        await page.waitForFunction(() => !!(window.Itaitu && window.Itaitu.marca), null, { timeout: 20000 });
        await page.waitForTimeout(800);
        const slug = await page.evaluate(() => window.Itaitu.marca.slug);
        ok(slug === 'padrao', `?m=naoexiste cai na marca padrão (${slug})`);
        ok(!pedidos.some((u) => /naoexiste/.test(u)), `não pede marcas/naoexiste.json (${pedidos.join(', ')})`);
        ok(erros.length === 0, '?m=naoexiste sem erro de console nem 404', erros.slice(0, 4).join(' | '));
        await page.close();
      }

      // c) ?vitrine=1 aberto direto (fora do iframe do marcos.html): SOS e links ligados, nenhum aviso de demonstração
      {
        const page = await ctx.newPage();
        const erros = vigiar(page, 'vitrine-direto');
        await page.goto(`${base}?m=demo-village&vitrine=1&sw=0`, { waitUntil: 'load', timeout: 45000 });
        await page.waitForFunction(() => document.querySelectorAll('#sos-ligacoes a').length > 0, null, { timeout: 30000 });
        const r = await page.evaluate(() => ({
          param: window.Itaitu.params.get('vitrine'), raiz: document.documentElement.dataset.vitrine || null,
          sos: [...document.querySelectorAll('#sos-ligacoes a')].map((a) => ({ tel: a.getAttribute('href'), off: a.getAttribute('aria-disabled') })),
          links: [...document.querySelectorAll('a[data-vitrine], a[aria-disabled="true"]')].filter((a) => !a.closest('#sos')).length,
        }));
        ok(r.param === null && r.raiz === null, `?vitrine=1 fora do iframe é ignorado (param=${r.param}, data-vitrine=${r.raiz})`);
        ok(r.sos.length >= 3 && r.sos.every((x) => /^tel:\d{3}$/.test(x.tel || '') && x.off !== 'true'), `botões de SOS ligados (${r.sos.map((x) => x.tel + (x.off ? ' desligado' : '')).join(', ')})`);
        ok(r.links === 0, `nenhum link desligado pela vitrine (${r.links})`);
        ok(erros.length === 0, '?vitrine=1 direto sem erro de console', erros.slice(0, 4).join(' | '));
        await page.close();
      }

      // d) dentro do iframe #vitrine-frame do marcos.html a vitrine vale, e o SOS pede o 2º toque em vez de desligar
      {
        const page = await ctx.newPage();
        const erros = vigiar(page, 'vitrine-iframe');
        await page.goto(`${base}marcos.html?sw=0`, { waitUntil: 'load', timeout: 45000 });
        await page.waitForSelector('#vitrine-frame', { state: 'attached', timeout: 20000 });
        await page.evaluate(() => document.getElementById('vitrine-frame').setAttribute('src', './index.html?m=demo-village&demo=0&vitrine=1'));
        const fh = await page.waitForSelector('#vitrine-frame', { state: 'attached' });
        const fr = await fh.contentFrame();
        await fr.waitForFunction(() => document.querySelectorAll('#sos-ligacoes a').length > 0, null, { timeout: 30000 });
        const r = await fr.evaluate(() => {
          const a = document.querySelector('#sos-ligacoes a');
          const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
          const deixou1 = a.dispatchEvent(ev);
          const aviso = document.getElementById('sos-vitrine')?.textContent || '';
          const ev2 = new MouseEvent('click', { bubbles: true, cancelable: true });
          // 2º toque: não pode ser bloqueado (o navegador seguiria para tel:). Anula aqui só para o teste não sair da página.
          let segundoBloqueadoPeloApp = null;
          a.addEventListener('click', (e) => { segundoBloqueadoPeloApp = e.defaultPrevented; e.preventDefault(); }, { once: true });
          a.dispatchEvent(ev2);
          return { param: window.Itaitu.params.get('vitrine'), off: a.getAttribute('aria-disabled'), deixou1, aviso, segundoBloqueadoPeloApp };
        });
        ok(r.param === '1', `no iframe do marcos.html a vitrine vale (param=${r.param})`);
        ok(r.off !== 'true' && r.deixou1 === false && /toque de novo/i.test(r.aviso), `SOS na vitrine: 1º toque avisa ("${r.aviso.slice(0, 60)}"), sem desligar o botão`);
        ok(r.segundoBloqueadoPeloApp === false, `SOS na vitrine: o 2º toque passa para a ligação (bloqueado=${r.segundoBloqueadoPeloApp})`);
        ok(erros.length === 0, 'vitrine no iframe sem erro de console', erros.slice(0, 4).join(' | '));
        await page.close();
      }

      // e) sem motor (cliente.js não carrega): o cartão ainda sai, com o relevo de reserva
      {
        const page = await ctx.newPage();
        const excecoes = [];
        page.on('pageerror', (e) => excecoes.push(String((e && e.message) || e).slice(0, 200)));
        page.on('console', (m) => { if (m.type() === 'error' && !/cliente\.js|Failed to load resource|dynamically imported/i.test(m.text())) excecoes.push(m.text().slice(0, 200)); });
        await page.route('**/js/motor/cliente.js', (rota) => rota.abort());
        await page.addInitScript(() => { document.addEventListener('itaitu:motor', (e) => { window.__motor = e.detail; }); });
        await page.goto(`${base}?m=demo-village&agora=${AGORA}&sw=0`, { waitUntil: 'load', timeout: 45000 });
        await page.waitForFunction(() => window.__motor && window.__motor.ok === false, null, { timeout: 30000 });
        const c = await gerarCartaoNaPagina(page).catch((e) => ({ erro: e.message }));
        ok(c && c.w === 1080 && c.h === 1920, `sem motor o cartão sai 1080x1920 (${c && (c.erro || `${c.w}x${c.h}`)})`);
        ok(excecoes.length === 0, 'sem motor: nenhuma exceção', excecoes.slice(0, 4).join(' | '));
        await page.close();
      }
      await ctx.close();
    }

    // ================================================================ marcos.html online
    if (quer('marcos') || !SO) {
      secao('marcos.html online');
      const ctx = await browser.newContext({ ...CELULAR, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      const erros = vigiar(page, 'marcos');
      const r = await page.goto(`${base}marcos.html?sw=0`, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(5000);
      ok(r && r.ok(), `marcos.html abre (${r && r.status()})`);
      const man = await page.evaluate(async () => {
        const href = document.querySelector('link[rel=manifest]')?.getAttribute('href');
        try { const j = await (await fetch(href)).json(); return { href, nome: j.name, start: j.start_url, icones: (j.icons || []).length }; } catch (e) { return { href, erro: e.message }; }
      });
      ok(man.href === './manifest-marcos.webmanifest' && man.start === './marcos.html', `manifest próprio: ${man.href}, "${man.nome}", start_url ${man.start}, ${man.icones} ícones`);
      const lw = await rolagem(page);
      ok(lw.doc <= lw.vista, `marcos.html sem rolagem horizontal (${lw.doc} <= ${lw.vista} px)`);
      ok(erros.length === 0, 'marcos.html sem erro de console', erros.slice(0, 4).join(' | '));
      await ctx.close();
    }
  } catch (e) {
    console.error('não deu para rodar a conferência:', (e && e.stack) || e);
    process.exitCode = 2;
    return;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (servidor) servidor.proc.kill();
  }
  console.log(falhas.length ? `\nRESULTADO conferir-app: ${falhas.length} falha(s)` : '\nRESULTADO conferir-app: tudo ok');
  process.exitCode = falhas.length ? 1 : 0;
})();
