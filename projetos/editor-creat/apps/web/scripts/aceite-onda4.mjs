// Aceite da onda 4 no site (docs/plano-onda4-26-11.md, seção 4: 5.6, 6.2 e 6.4). Roda contra o motor falso
// (scripts/motor-falso.mjs), com as mesmas rotas, status e frases do motor real (marcas, versão segurada e motivos).
// Sem rede e sem chave. Chamado pelo aceite.mjs depois do aceite da onda 3; também roda sozinho:
//   ACEITE_BASE=… ACEITE_MOTOR=… MOTOR_TOKEN=… ACEITE_SENHA=… EDITOR_DADOS=… node scripts/aceite-onda4.mjs
// Prints de celular claro e escuro em apps/web/.verificacao/onda4/.
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(AQUI, '..');
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// PNG RGBA de verdade (sem dependência): um disco colorido no meio, fundo transparente fora dele
function crc32(b) {
  let c, t = crc32.t;
  if (!t) { t = crc32.t = new Int32Array(256); for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } }
  c = -1;
  for (let i = 0; i < b.length; i++) c = t[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pedaco(tipo, dados) {
  const c = Buffer.alloc(4); c.writeUInt32BE(dados.length);
  const td = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);
  const k = Buffer.alloc(4); k.writeUInt32BE(crc32(td));
  return Buffer.concat([c, td, k]);
}
function png(w, h, [r, g, b], alfa = true) {
  const linha = 1 + w * 4;
  const cru = Buffer.alloc(linha * h);
  const cx = w / 2, cy = h / 2, raio = Math.min(w, h) * 0.42;
  for (let y = 0; y < h; y++) {
    cru[y * linha] = 0;
    for (let x = 0; x < w; x++) {
      const dentro = (x - cx) ** 2 + (y - cy) ** 2 < raio * raio;
      const o = y * linha + 1 + x * 4;
      cru[o] = dentro ? r : 255; cru[o + 1] = dentro ? g : 255; cru[o + 2] = dentro ? b : 255; cru[o + 3] = dentro || !alfa ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pedaco('IHDR', ihdr), pedaco('IDAT', zlib.deflateSync(cru)), pedaco('IEND', Buffer.alloc(0))]);
}

export async function aceiteOnda4({ BASE, MOTOR, TOKEN, SENHA, DADOS, ok }) {
  const PRINTS = path.join(WEB, '.verificacao', 'onda4');
  fs.rmSync(PRINTS, { recursive: true, force: true });
  fs.mkdirSync(PRINTS, { recursive: true });
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aceite-onda4-'));
  const arquivo = (nome, b) => { const f = path.join(TMP, nome); fs.writeFileSync(f, b); return f; };
  const LOGO = arquivo('superkal_logo.png', png(1024, 1024, [214, 32, 39]));
  const LOGO2 = arquivo('superkal_logo_nova.png', png(800, 800, [250, 190, 20]));
  const PEQUENA = arquivo('pequena.png', png(300, 300, [20, 90, 200]));
  const problemas = [];
  const prints = [];
  const motor = (rota, corpo) => fetch(`${MOTOR}/v1/${rota}`, { method: corpo ? 'POST' : 'GET', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined }).then((r) => r.json().catch(() => null));
  const chrome = ['/usr/bin/google-chrome', '/opt/google/chrome/chrome'].find((f) => fs.existsSync(f));
  const navegador = await chromium.launch({ ...(chrome ? { executablePath: chrome } : {}) });
  const celular = (colorScheme) => navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'pt-BR', colorScheme });
  const erros = [];
  // os 4xx provocados de propósito (imagem pequena, 413, 401, 403) aparecem no console como "Failed to load resource": não contam
  const esperado = /Failed to load resource: the server responded with a status of (401|403|409|410|413|415|422)/;
  const vigiar = (pg, nome) => {
    pg.on('console', (m) => { if (m.type() === 'error' && !esperado.test(m.text())) erros.push(`${nome}: ${m.text()} (${m.location()?.url ?? ''})`); });
    pg.on('pageerror', (e) => erros.push(`${nome}: ${String(e)}`));
  };
  const api = (pg, rota, corpo) => pg.evaluate(async ([rota, corpo]) => {
    const r = await fetch(`/api/motor/v1/${rota}`, corpo === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
    return { status: r.status, corpo: await r.json().catch(() => null) };
  }, [rota, corpo]);
  const medir = (pg) => pg.evaluate(() => {
    const larg = document.documentElement.clientWidth;
    const pequenos = [];
    for (const el of document.querySelectorAll('body *')) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const t = parseFloat(getComputedStyle(el).fontSize);
      if (t < 11) pequenos.push(`${el.tagName.toLowerCase()} ${t}px "${el.textContent.trim().slice(0, 20)}"`);
    }
    const alvos = [...document.querySelectorAll('a, button, input:not(.so-leitor), select, textarea, label.botao, summary')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.height && (r.height < 44 || r.width < 44) && !el.closest('.opcao'); })
      .filter((el) => !(el.matches('input[type=checkbox], input[type=radio]') && (el.closest('label')?.getBoundingClientRect().height ?? 0) >= 44))
      .map((el) => `${el.tagName.toLowerCase()}${el.dataset.teste ? `[${el.dataset.teste}]` : ''}:${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
    return { rolagem: document.documentElement.scrollWidth > larg + 1, pequenos, alvos };
  });
  async function print(pg, nome, tema, alvo) {
    if (alvo) await pg.locator(alvo).first().scrollIntoViewIfNeeded().catch(() => {});
    await dormir(200);
    const m = await medir(pg);
    const arq = `${nome}-celular-${tema}.png`;
    await pg.screenshot({ path: path.join(PRINTS, arq) });
    prints.push(arq);
    if (m.rolagem) problemas.push(`${arq}: rolagem horizontal`);
    if (m.pequenos.length) problemas.push(`${arq}: texto < 11px (${m.pequenos.slice(0, 2).join('; ')})`);
    if (m.alvos.length) problemas.push(`${arq}: alvo < 44px (${m.alvos.slice(0, 4).join(', ')})`);
  }
  async function entrar(ctx) {
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/entrar`);
    await pg.fill('input[name=senha]', SENHA);
    await pg.click('main button[type=submit]');
    await pg.waitForURL(`${BASE}/projetos`, { timeout: 20000 });
    return pg;
  }
  async function projeto(pg, nome) {
    const r = await api(pg, 'projetos', { nome, tipo_video: 'anuncio' });
    const pid = r.corpo.id;
    fs.mkdirSync(path.join(DADOS, 'armazenamento', 'entrada', pid), { recursive: true });
    const chave = `entrada/${pid}/onda4-1.mp4`;
    fs.writeFileSync(path.join(DADOS, 'armazenamento', chave), randomBytes(4096));
    await api(pg, `projetos/${pid}/arquivos`, { chave, nome: 'IMG_0412.MOV', bytes: 4096 });
    for (let i = 0; i < 60; i++) {
      const p = await motor(`projetos/${pid}`);
      if (p?.arquivos?.length === 1 && p.arquivos[0].estado === 'analisado') break;
      await dormir(200);
    }
    return pid;
  }
  async function esperarEstado(pid, estado, limite = 40000) {
    const t = Date.now();
    while (Date.now() - t < limite) {
      const p = await motor(`projetos/${pid}`);
      if (p?.estado === estado && !p.rodando) return p;
      await dormir(250);
    }
    throw new Error(`o projeto ${pid} não chegou em ${estado}`);
  }
  const texto = (pg, sel) => pg.locator(sel).first().textContent({ timeout: 8000 }).then((t) => (t ?? '').replace(/\s+/g, ' ').trim(), () => '');
  const ficha = (s) => `[data-teste=marca-${s}]`;

  try {
    await motor('_falso/entregas', { ligado: false });
    const escuro = await celular('dark');
    const claro = await celular('light');
    const A = await entrar(escuro);
    vigiar(A, 'escuro');
    await claro.addCookies(await escuro.cookies());
    const B = await claro.newPage();
    vigiar(B, 'claro');

    // ---------- 5.6: no Caderno, enviar a logo, ver a prévia, trocar, recusar a pequena e apagar ----------
    await A.goto(`${BASE}/clientes#marcas`);
    await A.waitForSelector(`${ficha('super-kal')}[data-logo=nao]`, { timeout: 15000 });
    const fichasAntes = await A.locator('[data-teste^=marca-][data-logo]').count();
    await print(A, '01-marcas-sem-logo', 'escuro', '#marcas');
    await A.setInputFiles(`${ficha('super-kal')} [data-teste=marca-enviar] input`, LOGO);
    await A.waitForSelector(`${ficha('super-kal')}[data-logo=sim]`, { timeout: 15000 });
    const previa = await A.waitForFunction((sel) => {
      const img = document.querySelector(sel);
      return img && img.complete && img.naturalWidth > 0 ? { w: img.naturalWidth, alt: img.alt } : null;
    }, `${ficha('super-kal')} img[data-teste=marca-previa]`, { timeout: 10000 }).then((h) => h.jsonValue()).catch(() => null);
    const recado1 = await texto(A, `${ficha('super-kal')} [data-teste=marca-recado]`);
    const estado1 = await texto(A, `${ficha('super-kal')} .marca__estado`);
    const noDisco = fs.existsSync(path.join(DADOS, 'armazenamento', 'marcas', 'super-kal', 'logo.png'));
    ok('onda 4 · 5.6a: no Caderno, enviar a logo do Super Kal grava em marcas/super-kal e mostra a prévia com o tamanho',
      fichasAntes >= 3 && Boolean(previa?.w) && previa.alt === 'Logo de Super Kal' && noDisco && /1024 × 1024 px/.test(recado1) && /fundo transparente/.test(estado1),
      `${fichasAntes} fichas | prévia ${JSON.stringify(previa)} | ${recado1} | ${estado1}`);
    await B.goto(`${BASE}/clientes#marcas`);
    await B.waitForSelector(`${ficha('super-kal')}[data-logo=sim] img[data-teste=marca-previa]`, { timeout: 15000 });
    await print(A, '02-marcas-com-logo', 'escuro', ficha('super-kal'));
    await print(B, '02-marcas-com-logo', 'claro', ficha('super-kal'));

    // o recado só aparece depois que a ficha releu a lista: lido o recado, o estado da ficha já tem de dizer 800 × 800 (sem corrida)
    await A.setInputFiles(`${ficha('super-kal')} [data-teste=marca-enviar] input`, LOGO2);
    await A.waitForFunction((sel) => /800 × 800 px/.test(document.querySelector(sel)?.textContent ?? ''), `${ficha('super-kal')} [data-teste=marca-recado]`, { timeout: 10000 }).catch(() => {});
    const estadoTroca = await A.evaluate((sel) => document.querySelector(sel)?.textContent ?? '', `${ficha('super-kal')} .marca__estado`);
    const trocou = /800 × 800 px/.test(estadoTroca);
    await A.setInputFiles(`${ficha('super-kal')} [data-teste=marca-enviar] input`, PEQUENA);
    await A.waitForFunction((sel) => /pequena demais/.test(document.querySelector(sel)?.textContent ?? ''), `${ficha('super-kal')} [data-teste=marca-recado]`, { timeout: 10000 }).catch(() => {});
    const recusa = await texto(A, `${ficha('super-kal')} [data-teste=marca-recado]`);
    await print(A, '03-marcas-recusa', 'escuro', ficha('super-kal'));
    const ficouAMesma = /800 × 800 px/.test(await texto(A, `${ficha('super-kal')} .marca__estado`));
    ok('onda 4 · 5.6b: trocar a logo vale na hora; a imagem pequena é recusada com a frase do dono e a logo anterior fica',
      trocou && /imagem pequena demais: mande com pelo menos 512 px no lado maior/.test(recusa) && ficouAMesma, `trocou ${trocou} (${estadoTroca.slice(0, 60)}) | ficou ${ficouAMesma} | ${recusa}`);

    await A.click(`${ficha('super-kal')} [data-teste=marca-apagar]`);
    await A.waitForSelector(`${ficha('super-kal')} [data-teste=marca-apagar-sim]`, { timeout: 5000 });
    await print(A, '04-marcas-apagar', 'escuro', ficha('super-kal'));
    await A.click(`${ficha('super-kal')} [data-teste=marca-apagar-sim]`);
    await A.waitForSelector(`${ficha('super-kal')}[data-logo=nao]`, { timeout: 10000 });
    const apagou = !fs.existsSync(path.join(DADOS, 'armazenamento', 'marcas', 'super-kal', 'logo.png'));
    const recadoApagar = await texto(A, `${ficha('super-kal')} [data-teste=marca-recado]`);
    ok('onda 4 · 5.6c: apagar a logo pede confirmação na tela (sem janela do navegador) e tira o arquivo',
      apagou && /apagada/.test(recadoApagar) && /marca da creat\.MTT/.test(recadoApagar), recadoApagar);

    // outro cliente: a ficha abre pelo nome e o envio grava no slug certo
    await A.fill('[data-teste=marca-novo]', 'Padaria Pão Quente');
    await A.click('[data-teste=marca-novo-ok]');
    await A.waitForSelector(ficha('padaria-pao-quente'), { timeout: 5000 });
    await A.setInputFiles(`${ficha('padaria-pao-quente')} [data-teste=marca-enviar] input`, LOGO2);
    await A.waitForSelector(`${ficha('padaria-pao-quente')}[data-logo=sim]`, { timeout: 10000 });
    // a logo do Super Kal volta para o pedido mostrar "com logo"
    await A.setInputFiles(`${ficha('super-kal')} [data-teste=marca-enviar] input`, LOGO);
    await A.waitForSelector(`${ficha('super-kal')}[data-logo=sim]`, { timeout: 10000 });
    const lista = await api(A, 'marcas');
    ok('onda 4 · 5.6d: cliente novo pelo nome ("Padaria Pão Quente" vira padaria-pao-quente) e GET /v1/marcas lista os dois com logo',
      lista.status === 200 && JSON.stringify(lista.corpo?.marcas?.map((m) => [m.slug, m.logo])) === JSON.stringify([['padaria-pao-quente', true], ['super-kal', true]])
        && JSON.stringify(lista.corpo?.fixos) === JSON.stringify(['super-kal', 'creat-mtt', 'marcos']), JSON.stringify(lista.corpo).slice(0, 200));

    // nome de cliente comprido sem espaço (60 letras, o máximo do campo) não cria rolagem lateral no celular
    await A.fill('[data-teste=marca-novo]', 'A'.repeat(60));
    await A.click('[data-teste=marca-novo-ok]');
    const fichaLonga = await A.waitForSelector(ficha('a'.repeat(40)), { timeout: 5000 }).then(() => true, () => false);
    const largura = await A.evaluate(() => ({ rola: document.documentElement.scrollWidth, tela: document.documentElement.clientWidth }));
    ok('onda 4 · 5.6g: nome de cliente com 60 letras sem espaço quebra dentro da ficha, sem rolagem lateral em 390 px',
      fichaLonga && largura.rola <= largura.tela + 1, JSON.stringify({ fichaLonga, ...largura }));

    // proxy: 8 MB só no envio de imagem; o resto continua com 1 MB; 9 MB é 413 antes de chegar ao motor
    const corpos = await A.evaluate(async () => {
      const nove = new Uint8Array(9 * 1024 * 1024); nove.set([0x89, 0x50, 0x4e, 0x47]);
      const dois = new Uint8Array(2 * 1024 * 1024);
      const a = await fetch('/api/motor/v1/marcas/super-kal/logo', { method: 'POST', headers: { 'content-type': 'image/png' }, body: nove });
      const b = await fetch('/api/motor/v1/referencias', { method: 'POST', headers: { 'content-type': 'application/json' }, body: dois });
      return { nove: a.status, noveMsg: (await a.json().catch(() => ({}))).detail, dois: b.status };
    });
    ok('onda 4 · 5.2/5.6e: pelo proxy, 9 MB de imagem é 413 com a frase do dono; 2 MB fora do envio de imagem continua 413',
      corpos.nove === 413 && /8 MB/.test(corpos.noveMsg ?? '') && corpos.dois === 413, JSON.stringify(corpos));
    // envio em pedaços (chunked, sem Content-Length): o proxy lê por blocos e para no teto, sem guardar o corpo inteiro
    const cookie = (await escuro.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
    const emPedacos = await new Promise((fim) => {
      const u = new URL(`${BASE}/api/motor/v1/marcas/super-kal/logo`);
      let resposta = null;
      const q = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
        headers: { cookie, origin: new URL(BASE).origin, 'content-type': 'image/png', 'transfer-encoding': 'chunked' } }, (r) => {
        let b = '';
        r.on('data', (d) => { b += d; });
        r.on('end', () => { resposta = { status: r.statusCode, chunked: !q.getHeader('content-length'), detail: (() => { try { return JSON.parse(b).detail; } catch { return b.slice(0, 80); } })() }; fim(resposta); });
      });
      q.on('error', (e) => { if (!resposta) fim({ status: 0, erro: String(e) }); });
      const bloco = Buffer.alloc(512 * 1024);
      let n = 0;
      const mandar = () => {
        while (n < 40 && !resposta) { n++; if (!q.write(bloco)) { q.once('drain', mandar); return; } }
        q.end();
      };
      mandar();
      setTimeout(() => { if (!resposta) { q.destroy(); fim({ status: -1, erro: 'sem resposta em 20 s' }); } }, 20000);
    });
    ok('onda 4 · 5.6h: envio em pedaços (sem Content-Length) de 20 MB para no teto e volta 413 com a frase do dono',
      emPedacos.status === 413 && emPedacos.chunked && /8 MB/.test(emPedacos.detail ?? ''), JSON.stringify(emPedacos));

    // ---------- 5.6f: no pedido do projeto, "Para qual cliente" já vem com o sugerido e o POST leva o cliente ----------
    const pid = await projeto(A, 'Aceite onda 4 · Super Kal Black');
    await A.goto(`${BASE}/projetos/${pid}`);
    await A.waitForFunction(() => document.querySelector('[data-teste=pedido-cliente]')?.value === 'super-kal', null, { timeout: 15000 });
    const opcao = await texto(A, '[data-teste=pedido-cliente] option[value=super-kal]');
    const avisoCli = await texto(A, '[data-teste=pedido-cliente-aviso]');
    await A.fill('#pedido-texto', 'Anúncio de diálogo da Black do Super Kal, as duas pessoas conversando');
    await print(A, '05-pedido-cliente', 'escuro', '[data-teste=pedido-cliente-campo]');
    const posts = [];
    A.on('request', (q) => { if (q.method() === 'POST' && /\/projetos\/p_[a-z0-9]+\/pedido$/.test(q.url())) posts.push(q.postDataJSON()); });
    await A.click('[data-teste=mandar-pedido]');
    await A.waitForFunction(() => document.querySelector('[data-teste=modo-atual]'), null, { timeout: 15000 }).catch(() => {});
    const noMotor = await motor(`projetos/${pid}`);
    const linhaModo = await texto(A, '[data-teste=modo-atual]');
    ok('onda 4 · 5.6f: no pedido, "Para qual cliente" vem com Super Kal (com logo); o POST leva cliente e a tela diz para quem é',
      /Super Kal · com logo/.test(opcao) && /assina com a logo de Super Kal/.test(avisoCli) && posts.length === 1 && posts[0]?.cliente === 'super-kal'
        && noMotor?.dados?.pedido?.cliente === 'super-kal' && /para Super Kal/.test(linhaModo),
      `${opcao} | ${avisoCli} | POST ${JSON.stringify(posts.map((x) => x.cliente))} | ${linhaModo}`);

    // ---------- 6.4: a conferência segura a V1: o dono assiste aqui, com a faixa e os motivos, e nada sai do editor ----------
    await esperarEstado(pid, 'entregue');
    await motor('_falso/cenario', { projeto: pid, cenario: 'reprovado_qa', mudou: false });
    await A.waitForFunction(() => document.querySelector('[data-teste=estado]')?.dataset.estado === 'reprovado_qa', null, { timeout: 15000 });
    await A.waitForSelector('[data-teste=assistir-segurada]', { timeout: 15000 });
    await B.goto(`${BASE}/projetos/${pid}`);
    await B.waitForSelector('[data-teste=assistir-segurada]', { timeout: 15000 });
    const convite = await texto(A, '[data-teste=segurada-convite]');
    const naBarra = await A.locator('[data-teste=assistir-segurada-barra]').count();
    // 27/11 (Bastidores do Super Kal): a barra também leva ao ajuste da segurada (antes o projeto ficava sem saída)
    const ajusteBarra = await texto(A, '[data-teste=pedir-ajuste-segurada]');
    await A.click('[data-teste=pedir-ajuste-segurada]');
    const gavetaAjuste = await A.waitForSelector('[data-teste=gaveta-ajuste]', { timeout: 8000 }).then(() => true).catch(() => false);
    await A.keyboard.press('Escape');
    await A.waitForFunction(() => !document.querySelector('[data-teste=gaveta-ajuste]'), null, { timeout: 8000 }).catch(() => {});
    ok('27/11: projeto segurado pela conferência tem "Pedir ajuste da V1" na barra e abre a gaveta do ajuste',
      /Pedir ajuste da V1/.test(ajusteBarra) && gavetaAjuste, `${ajusteBarra} | gaveta ${gavetaAjuste}`);
    await print(A, '06-segurada-convite', 'escuro', '[data-teste=segurada-convite]');
    await print(B, '06-segurada-convite', 'claro', '[data-teste=segurada-convite]');
    await A.click('[data-teste=assistir-segurada]');
    await A.waitForSelector('[data-teste=player-segurada]', { timeout: 15000 });
    const pronto = await A.waitForFunction(() => {
      const v = document.querySelector('[data-teste=player-segurada]');
      return v && v.readyState >= 1 && Number.isFinite(v.duration) ? v.duration : null;
    }, null, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
    const player = await A.evaluate(() => {
      const v = document.querySelector('[data-teste=player-segurada]');
      const area = document.querySelector('[data-teste=segurada]');
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      v.dispatchEvent(ev);
      return {
        controlsList: v.getAttribute('controlslist') ?? '', pip: v.disablePictureInPicture, remoto: v.disableRemotePlayback, menuBloqueado: ev.defaultPrevented,
        faixa: document.querySelector('[data-teste=segurada-faixa]')?.textContent ?? '',
        links: area.querySelectorAll('a').length, baixar: document.querySelectorAll('a[download], [data-teste=baixar]').length,
        motivos: [...area.querySelectorAll('[data-motivo]')].map((li) => li.dataset.motivo),
        frases: area.querySelector('[data-teste=segurada-motivos]')?.textContent ?? '', regra: area.querySelector('[data-teste=segurada-regra]')?.textContent ?? '',
        src: v.getAttribute('src') ?? '',
      };
    });
    await A.click('[data-teste=segurada-ir][data-t="3.6"]');
    const foiPara = await A.waitForFunction(() => {
      const v = document.querySelector('[data-teste=player-segurada]');
      return v && Math.abs(v.currentTime - 3.6) < 0.35 ? v.currentTime : null;
    }, null, { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => null);
    await print(A, '07-segurada-aberta', 'escuro', '[data-teste=player-segurada]');
    await print(A, '08-segurada-motivos', 'escuro', '[data-teste=segurada-motivos]');
    await B.click('[data-teste=assistir-segurada]');
    await B.waitForSelector('[data-teste=player-segurada]', { timeout: 15000 });
    await print(B, '07-segurada-aberta', 'claro', '[data-teste=player-segurada]');
    await print(B, '08-segurada-motivos', 'claro', '[data-teste=segurada-motivos]');
    ok('onda 4 · 6.4a: projeto em reprovado_qa mostra "Assistir a V1 segurada"; o player abre com a faixa NÃO ENTREGUE e os motivos em frase do dono',
      /A conferência segurou a V1/.test(convite) && /não baixa, não tem link e não vai para o cliente/.test(convite) && naBarra === 1 && Boolean(pronto)
        && /não entregue/i.test(player.faixa) && JSON.stringify(player.motivos) === JSON.stringify(['fala_cortada', 'voz_externa', 'cobertura_sintonia', 'tom_sala_sem_voz'])
        && /Uma fala foi cortada antes de terminar/.test(player.frases) && /aos 0:04/.test(player.frases) && /não compartilha/.test(player.regra),
      `${convite.slice(0, 90)} | barra ${naBarra} | ${player.faixa} | ${player.motivos.join(',')} | duração ${pronto}`);
    ok('onda 4 · 6.4b: sem baixar e sem link (controlsList nodownload, sem PiP nem transmissão, menu bloqueado); tocar em "aos 0:04" leva o vídeo ao ponto',
      /nodownload/.test(player.controlsList) && /noremoteplayback/.test(player.controlsList) && player.pip && player.remoto && player.menuBloqueado
        && player.links === 0 && player.baixar === 0 && /\/segurada\/video/.test(player.src) && foiPara !== null,
      JSON.stringify({ ...player, frases: undefined, regra: undefined, foiPara }));

    const regra = await A.evaluate(async ([pid]) => {
      const r = await fetch(`/api/motor/v1/projetos/${pid}/versoes/v1/segurada/video`, { headers: { range: 'bytes=0-99' } });
      await r.arrayBuffer();
      const arq = await fetch(`/api/motor/v1/arquivos/saidas/${pid}/v1/final.mp4`);
      return { status: r.status, cache: r.headers.get('cache-control'), disp: r.headers.get('content-disposition'), robots: r.headers.get('x-robots-tag'),
        arquivos: arq.status };
    }, [pid]);
    // versão que não existe: pela sessão, fora da página (um 404 de propósito não suja o console vigiado)
    regra.outra = (await escuro.request.get(`${BASE}/api/motor/v1/projetos/${pid}/versoes/v9/segurada`)).status();
    const semSessao = await navegador.newContext();
    const s1 = await semSessao.request.get(`${BASE}/api/motor/v1/projetos/${pid}/versoes/v1/segurada/video`, { maxRedirects: 0 });
    const s2 = await semSessao.request.get(`${BASE}/api/motor/v1/projetos/${pid}/versoes/v1/segurada`, { maxRedirects: 0 });
    const s3 = await semSessao.request.get(`${BASE}/api/motor/v1/marcas/super-kal/logo`, { maxRedirects: 0 });
    await semSessao.close();
    ok('onda 4 · 6.2: o vídeo da segurada sai 206 no-store e inline; /v1/arquivos da mesma versão continua 403; sem sessão é 401 (segurada e logo)',
      regra.status === 206 && /no-store/.test(regra.cache ?? '') && regra.disp === 'inline' && /noindex/.test(regra.robots ?? '') && regra.arquivos === 403 && regra.outra === 404
        && s1.status() === 401 && s2.status() === 401 && s3.status() === 401, JSON.stringify({ ...regra, semSessao: [s1.status(), s2.status(), s3.status()] }));

    await A.click('[data-teste=segurada-fechar]');
    await A.waitForSelector('[data-teste=assistir-segurada]', { timeout: 5000 });
    const daLinha = await A.locator('[data-teste=assistir-segurada-linha]').count();
    await A.click('[data-teste=assistir-segurada-linha]');
    await A.waitForSelector('[data-teste=player-segurada]', { timeout: 10000 });
    const linhaSumiu = (await A.locator('[data-teste=assistir-segurada-linha]').count()) === 0;
    ok('onda 4 · 6.4c: fechar a segurada volta ao convite; a linha da V1 também abre a segurada', daLinha === 1 && linhaSumiu);

    // ---------- 6.4e: o fluxo do ajuste: V1 entregue continua no player e a V2 segurada abre por cima dela ----------
    const pid2 = await projeto(A, 'Aceite onda 4 · ajuste com V2 segurada');
    await api(A, `projetos/${pid2}/fechar-envio`, {});
    await api(A, `projetos/${pid2}/pedido`, { texto: 'Anúncio curto da Black, as duas pessoas conversando' });
    await esperarEstado(pid2, 'entregue');
    const cen2 = await motor('_falso/cenario', { projeto: pid2, cenario: 'reprovado_qa', mudou: false, nova: true });
    await A.goto(`${BASE}/projetos/${pid2}`);
    await A.waitForSelector('[data-teste=player][data-versao=v1]', { timeout: 15000 });
    const conviteSemPedir = await A.locator('[data-teste=segurada-convite]').count();
    await A.click('[data-teste=assistir-segurada-linha]');
    const abriu = await A.waitForSelector('[data-teste=player-segurada]', { timeout: 10000 }).then(() => true, () => false);
    const tela2 = await A.evaluate(() => ({
      segurada: document.querySelector('[data-teste=segurada]')?.getAttribute('data-versao') ?? null,
      entregue: document.querySelector('[data-teste=player]')?.getAttribute('data-versao') ?? null,
      linha: document.querySelectorAll('[data-teste=assistir-segurada-linha]').length,
    }));
    if (abriu) await print(A, '09-segurada-com-entregue', 'escuro', '[data-teste=segurada]');
    await A.click('[data-teste=segurada-fechar]').catch(() => {});
    const fechou = await A.waitForSelector('[data-teste=segurada]', { state: 'detached', timeout: 5000 }).then(() => true, () => false);
    const v1Ficou = (await A.locator('[data-teste=player][data-versao=v1]').count()) === 1;
    ok('onda 4 · 6.4e: com a V1 entregue, "Assistir a V2 segurada" abre a V2 (faixa e motivos) por cima do player da V1; fechar volta só à V1',
      cen2?.versao === 'v2' && conviteSemPedir === 0 && abriu && tela2.segurada === 'v2' && tela2.entregue === 'v1' && tela2.linha === 0 && fechou && v1Ficou,
      JSON.stringify({ cen: cen2?.versao, conviteSemPedir, abriu, ...tela2, fechou, v1Ficou }));

    await escuro.close(); await claro.close();
  } catch (e) {
    ok('onda 4: o aceite rodou até o fim', false, String(e?.stack || e).slice(0, 600));
  } finally {
    await navegador.close().catch(() => {});
    fs.rmSync(TMP, { recursive: true, force: true });
  }
  ok('onda 4 · 6.4d: prints de celular claro e escuro (390 px) sem rolagem lateral, sem texto < 11 px e com alvos de 44 px', problemas.length === 0 && prints.length >= 12,
    problemas.length ? problemas.slice(0, 6).join(' || ') : `${prints.length} prints em ${path.relative(WEB, PRINTS)}`);
  ok('onda 4: nenhum erro de console nas telas novas', erros.length === 0, erros.slice(0, 4).join(' | '));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = [];
  const ok = (nome, passou, detalhe = '') => { r.push(passou); console.log(`${passou ? 'ok   ' : 'FALHA'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`); };
  await aceiteOnda4({ BASE: process.env.ACEITE_BASE, MOTOR: process.env.ACEITE_MOTOR, TOKEN: process.env.MOTOR_TOKEN, SENHA: process.env.ACEITE_SENHA, DADOS: process.env.EDITOR_DADOS, ok });
  console.log(`\nACEITE ONDA 4: ${r.filter(Boolean).length}/${r.length} ok`);
  process.exit(r.every(Boolean) ? 0 : 1);
}
