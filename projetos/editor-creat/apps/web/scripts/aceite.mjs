#!/usr/bin/env node
// Aceite da frente D (site mínimo). Uso: cd apps/web && pnpm install && pnpm aceite [--sem-build] [--manter]
// 1. sobe o motor falso (8788) e o site com `next build && next start` (3000), com senha e segredos gerados na hora;
// 2. Playwright: senha errada recusa, senha certa entra, cria projeto, envia 300 MB, interrompe (recarrega a página)
//    perto de 40% e retoma sem recomeçar; o arquivo no armazenamento tem o mesmo sha256;
// 3. fecha o envio e manda o pedido: o status passa por lendo → dirigindo → montando → conferindo → entregue e o player toca;
// 4. verificação visual logada (celular e desktop, claro e escuro) sem erro de console, sem rolagem horizontal,
//    sem texto < 11 px, e o olhar.cjs da casa na tela de entrada.
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(AQUI, '..');
const args = process.argv.slice(2);
const SEM_BUILD = args.includes('--sem-build');
const MANTER = args.includes('--manter');
const PORTA_WEB = Number(process.env.ACEITE_PORTA_WEB || 3000);
const PORTA_MOTOR = Number(process.env.ACEITE_PORTA_MOTOR || 8788);
const BASE = `http://127.0.0.1:${PORTA_WEB}`;
const TAMANHO = Number(process.env.ACEITE_MB || 300) * 1024 * 1024;
const SCRATCH = process.env.ACEITE_DIR || path.join(process.env.TMPDIR || '/tmp', `editor-web-aceite-${process.pid}`);
const DADOS = path.join(SCRATCH, 'dados');
const PRINTS = path.join(WEB, '.verificacao', 'aceite');
const SENHA = `aceite-${randomBytes(6).toString('hex')}`;

const resultados = [];
const tempos = {};
const filhos = [];
let navegador;

function ok(nome, passou, detalhe = '') {
  resultados.push({ nome, passou: Boolean(passou), detalhe });
  console.log(`${passou ? 'ok   ' : 'FALHA'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
}
async function medir(nome, fn) {
  const t = performance.now();
  try { return await fn(); } finally { tempos[nome] = +((performance.now() - t) / 1000).toFixed(2); }
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperarPorta(url, limite = 60000) {
  const t = Date.now();
  while (Date.now() - t < limite) {
    try { const r = await fetch(url); if (r.status < 500) return true; } catch { /* ainda subindo */ }
    await dormir(250);
  }
  throw new Error(`não subiu: ${url}`);
}
function subir(nome, cmd, argv, env) {
  const log = fs.openSync(path.join(SCRATCH, `${nome}.log`), 'w');
  const p = spawn('nice', ['-n', '5', cmd, ...argv], { cwd: WEB, env: { ...process.env, ...env }, stdio: ['ignore', log, log], detached: true });
  filhos.push(p);
  return p;
}
function encerrar() {
  for (const p of filhos) { try { process.kill(-p.pid, 'SIGTERM'); } catch { /* já saiu */ } }
}
async function sha256(arquivo) {
  const h = createHash('sha256');
  for await (const c of fs.createReadStream(arquivo, { highWaterMark: 4 << 20 })) h.update(c);
  return h.digest('hex');
}
function acharOlhar() {
  let d = WEB;
  for (let i = 0; i < 8; i++) {
    const f = path.join(d, '.claude', 'skills', 'verificacao-visual', 'olhar.cjs');
    if (fs.existsSync(f)) return f;
    d = path.dirname(d);
  }
  return null;
}

// Arquivo sintético de 300 MB: esparso (quase não ocupa disco), com 64 KB aleatórios em cada MB para o sha256 pegar
// qualquer byte fora do lugar. O destino no armazenamento é escrito de verdade (300 MB).
function criarArquivo(f) {
  const fd = fs.openSync(f, 'w');
  fs.ftruncateSync(fd, TAMANHO);
  for (let off = 0; off < TAMANHO; off += 1024 * 1024) fs.writeSync(fd, randomBytes(64 * 1024), 0, 64 * 1024, off);
  fs.closeSync(fd);
}

async function principal() {
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  fs.mkdirSync(DADOS, { recursive: true });
  fs.rmSync(PRINTS, { recursive: true, force: true });
  fs.mkdirSync(PRINTS, { recursive: true });

  const sal = randomBytes(16);
  const env = {
    NEXT_TELEMETRY_DISABLED: '1',
    EDITOR_DADOS: DADOS,
    MOTOR_URL: `http://127.0.0.1:${PORTA_MOTOR}`,
    MOTOR_TOKEN: randomBytes(18).toString('base64url'),
    MOTOR_FALSO_PORTA: String(PORTA_MOTOR),
    MOTOR_FALSO_PASSO_MS: process.env.MOTOR_FALSO_PASSO_MS || '450',
    EDITOR_SENHA_HASH: ['scrypt', 32768, 8, 1, sal.toString('base64'), scryptSync(SENHA, sal, 32, { N: 32768, r: 8, p: 1, maxmem: 64 << 20 }).toString('base64')].join(':'),
    EDITOR_SEGREDO_SESSAO: randomBytes(32).toString('base64url'),
    EDITOR_ENVIO_PARTE_MB: process.env.EDITOR_ENVIO_PARTE_MB || '64',
  };

  // ---------- 1. motor falso + site ----------
  await medir('motor_falso_sobe_s', async () => {
    subir('motor-falso', 'node', ['scripts/motor-falso.mjs'], env);
    await esperarPorta(`http://127.0.0.1:${PORTA_MOTOR}/v1/saude`);
  });
  if (!SEM_BUILD) {
    await medir('next_build_s', async () => {
      const b = spawnSync('nice', ['-n', '5', 'npx', 'next', 'build'], { cwd: WEB, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, encoding: 'utf8' });
      ok('next build', b.status === 0, b.status === 0 ? '' : (b.stdout + b.stderr).slice(-800));
      if (b.status !== 0) throw new Error('build falhou');
    });
  }
  await medir('next_start_s', async () => {
    subir('web', 'npx', ['next', 'start', '-p', String(PORTA_WEB), '-H', '127.0.0.1'], env);
    await esperarPorta(`${BASE}/entrar`);
  });

  // ---------- proteção sem sessão (direto na API) ----------
  {
    const r1 = await fetch(`${BASE}/api/motor/v1/projetos`);
    const r2 = await fetch(`${BASE}/api/envio`, { method: 'POST', headers: { 'Tus-Resumable': '1.0.0', 'Upload-Length': '10' } });
    const r3 = await fetch(`${BASE}/projetos`, { redirect: 'manual' });
    ok('sem sessão: API do motor, envio e páginas bloqueados', r1.status === 401 && r2.status === 401 && [302, 303, 307, 308].includes(r3.status),
      `motor ${r1.status}, envio ${r2.status}, /projetos ${r3.status} → ${r3.headers.get('location')}`);
    const r4 = await fetch(`${BASE}/api/entrar`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://site-malicioso.example' }, body: JSON.stringify({ senha: SENHA }) });
    ok('login de outra origem recusado', r4.status === 403, `status ${r4.status}`);
  }

  // ---------- 2. navegador ----------
  const chrome = ['/usr/bin/google-chrome', '/opt/google/chrome/chrome'].find((f) => fs.existsSync(f));
  navegador = await chromium.launch(chrome ? { executablePath: chrome } : {}); // Chrome tem H.264/AAC; o Chromium puro não
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  const errosConsole = [];
  page.on('console', (m) => { if (m.type() === 'error') errosConsole.push(m.text()); });
  page.on('pageerror', (e) => errosConsole.push(String(e)));
  page.on('dialog', (d) => d.accept().catch(() => {})); // "sair com envio em andamento?" — sim, é o teste de interrupção

  await medir('login_s', async () => {
    await page.goto(`${BASE}/entrar`);
    await page.fill('input[name=senha]', 'senha-errada-123');
    await page.click('main button[type=submit]');
    await page.waitForSelector('main .erro[role=alert]', { timeout: 10000 });
    const msg = await page.textContent('main .erro[role=alert]');
    const cookies = await ctx.cookies();
    ok('senha errada recusada', /incorreta/i.test(msg ?? '') && page.url().endsWith('/entrar') && !cookies.some((c) => c.name === 'ec_sessao'), `mensagem: "${msg}"`);
    await page.fill('input[name=senha]', SENHA);
    await page.click('main button[type=submit]');
    await page.waitForURL(`${BASE}/projetos`, { timeout: 15000 });
    const c = (await ctx.cookies()).find((x) => x.name === 'ec_sessao');
    ok('senha certa entra (cookie HttpOnly, SameSite=Lax)', Boolean(c?.httpOnly && c?.sameSite === 'Lax'), `cookie ${c ? 'ok' : 'ausente'}`);
    errosConsole.length = 0; // o 401 da senha errada é esperado; daqui em diante, qualquer erro conta
  });

  let pid = '';
  await medir('criar_projeto_s', async () => {
    await page.goto(`${BASE}/projetos/novo`);
    await page.fill('input[name=nome]', 'Aceite frente D · bastidor');
    await page.check('input[name=tipo][value=bastidor]', { force: true });
    await page.click('main button[type=submit]');
    await page.waitForURL(/\/projetos\/p_[a-z0-9]+$/, { timeout: 15000 });
    pid = page.url().split('/').pop();
    ok('projeto criado pela tela', /^p_[a-z0-9]+$/.test(pid), pid);
  });

  // ---------- envio de 300 MB interrompido e retomado ----------
  const origem = path.join(SCRATCH, 'material-sintetico.mp4');
  const hashOrigem = await medir('arquivo_sintetico_s', async () => { criarArquivo(origem); return sha256(origem); });
  let interrompidoEm = 0, retomadoDe = 0, pendenteMostrado = '';
  await medir('envio_300mb_s', async () => {
    await page.setInputFiles('[data-teste=entrada-arquivo]', origem);
    const t0 = Date.now();
    while (Date.now() - t0 < 120000) {
      const v = Number(await page.getAttribute('[data-envio]', 'data-progresso').catch(() => 0));
      if (v >= 0.42) { interrompidoEm = v; break; }
      await dormir(15);
    }
    await page.reload(); // interrompe no meio de uma parte (a requisição em curso é abortada)
    await page.waitForSelector('[data-pendente]', { timeout: 15000 }).catch(() => null);
    pendenteMostrado = (await page.textContent('[data-pendente] .envio__num').catch(() => '')) ?? '';
    await page.setInputFiles('[data-teste=entrada-arquivo]', origem);
    await page.waitForSelector('[data-envio][data-retomado-de]', { timeout: 15000 });
    retomadoDe = Number(await page.getAttribute('[data-envio]', 'data-retomado-de'));
    await page.waitForSelector('[data-envio][data-estado=concluido]', { timeout: 180000 });
  });
  ok('envio interrompido perto de 40% (recarregando a página)', interrompidoEm >= 0.4 && interrompidoEm < 0.95, `progresso no navegador ${(interrompidoEm * 100).toFixed(1)}%; tela mostrou pendente "${pendenteMostrado}"`);
  ok('retomou sem recomeçar (> 40% logo após retomar)', retomadoDe > 0.4, `retomado de ${(retomadoDe * 100).toFixed(1)}% do arquivo`);
  const pastaEntrada = path.join(DADOS, 'armazenamento', 'entrada', pid);
  const salvos = fs.existsSync(pastaEntrada) ? fs.readdirSync(pastaEntrada) : [];
  const salvo = salvos.map((f) => path.join(pastaEntrada, f)).find((f) => fs.statSync(f).size === TAMANHO);
  const hashDestino = salvo ? await medir('sha256_destino_s', () => sha256(salvo)) : '';
  ok('mesmo sha256 no armazenamento', salvo && hashDestino === hashOrigem, `${salvo ? path.relative(DADOS, salvo) : 'arquivo não encontrado'} · ${hashOrigem.slice(0, 16)}…`);
  const restos = fs.readdirSync(path.join(DADOS, 'armazenamento', '.envio')).filter((f) => !f.startsWith('.'));
  ok('sem restos do tus depois do fim', restos.length === 0, restos.join(', '));
  await page.waitForSelector('.arquivo', { timeout: 15000 });
  ok('motor recebeu o arquivo (aparece na lista)', (await page.locator('.arquivo').count()) === 1);

  // ---------- 3. status ao vivo até "entregue" e player ----------
  const vistos = [];
  await medir('status_ate_entregue_s', async () => {
    await page.waitForFunction(() => document.querySelector('.arquivo span:last-child')?.textContent?.includes('lido'), null, { timeout: 30000 });
    await page.click('[data-teste=fechar-envio]');
    await page.waitForSelector('[data-teste=estado][data-estado=lendo]', { timeout: 15000 });
    await page.fill('textarea[name=texto]', 'Reels de 45 s do bastidor: abre com a fala mais forte, fecha chamando para o @creat.mtt.');
    await page.selectOption('select[name=duracao]', '45');
    const nPerguntas = await page.locator('[data-teste=perguntas] fieldset').count();
    ok('o editor pergunta o que falta (botões de resposta)', nPerguntas >= 4, `${nPerguntas} perguntas`);
    await page.check('input[name=modo][value=ultra]');
    const nUltra = await page.locator('[data-teste=perguntas] fieldset').count();
    ok('as perguntas mudam com o modo (ultra pergunta do mascote e da IA)', nUltra > nPerguntas, `${nPerguntas} -> ${nUltra}`);
    await page.check('input[name=q_proibido][value="palavrão"]');
    await page.click('[data-teste=mandar-pedido]');
    const t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      const e = await page.getAttribute('[data-teste=estado]', 'data-estado');
      if (e && vistos[vistos.length - 1] !== e) vistos.push(e);
      if (e === 'entregue') break;
      await dormir(80);
    }
  });
  const ordem = ['lendo', 'dirigindo', 'montando', 'conferindo', 'entregue'];
  const seq = vistos.filter((e) => ordem.includes(e));
  ok('status ao vivo: lendo → dirigindo → montando → conferindo → entregue', ordem.every((e, i) => seq[i] === e), `visto: ${vistos.join(' → ')}`);
  const parou = await page.waitForSelector('.relogio__tc[data-correndo=false]', { timeout: 5000 }).then(() => true, () => false);
  const relogio = await page.textContent('.relogio__tc');
  ok('relógio dos 30 minutos parou na entrega', parou && /^\d{2}:\d{2}$/.test(relogio ?? ''), `marcou ${relogio}`);

  const player = await medir('player_s', async () => {
    await page.waitForSelector('[data-teste=player]', { timeout: 15000 });
    return page.evaluate(async () => {
      const v = document.querySelector('[data-teste=player]');
      v.muted = true;
      try { await v.play(); } catch (e) { return { erro: String(e) }; }
      const t = Date.now();
      while (v.currentTime < 1 && Date.now() - t < 10000) await new Promise((r) => setTimeout(r, 100));
      const r = { tempo: v.currentTime, largura: v.videoWidth, altura: v.videoHeight, duracao: v.duration, erro: v.error?.message ?? null };
      v.pause();
      return r;
    });
  });
  ok('player toca a versão (Range pelo proxy)', !player.erro && player.tempo >= 1 && player.largura > 0, JSON.stringify(player));
  const r206 = await page.evaluate(async (src) => (await fetch(src, { headers: { range: 'bytes=0-1023' } })).status, await page.getAttribute('[data-teste=player]', 'src'));
  ok('Range responde 206 pelo proxy', r206 === 206, `status ${r206}`);
  await page.click('[data-teste=aprovar]');
  const aprovou = await page.waitForSelector('[data-teste=aprovada]', { timeout: 10000 }).then(() => true).catch(() => false);
  ok('aprovar bate a claquete e marca a versão', aprovou, aprovou ? 'aprovada' : 'não marcou');
  const avisoQa = await page.locator('[data-teste=qa-aviso]').first().textContent().catch(() => null);
  const olhoQa = await page.locator('[data-teste=qa-olho]').first().textContent().catch(() => null);
  ok('QA mostra os avisos (checagem em observação) e o olho de IA com o custo', /voz de fora/.test(avisoQa ?? '') && /custo US\$/.test(olhoQa ?? ''), `${avisoQa ?? 'sem aviso'} | ${olhoQa ?? 'sem olho'}`.slice(0, 200));
  await page.click('[data-teste=ver-cor]');
  const corAbriu = await page.waitForSelector('[data-teste=cor-grade] [data-teste=cor-plano]', { timeout: 10000 }).then(() => true).catch(() => false);
  const cor = corAbriu ? await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('[data-teste=cor-plano] img')];
    await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    const faixa = document.querySelector('[data-teste=cor-plano] input[type=range]');
    const quadro = faixa.closest('.cor__quadro');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(faixa, '80'); faixa.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 150));
    return { planos: document.querySelectorAll('[data-teste=cor-plano]').length, carregadas: imgs.filter((i) => i.naturalWidth > 0).length, total: imgs.length,
      pos: quadro.style.getPropertyValue('--pos'), rolagem: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  }) : null;
  if (corAbriu) await page.locator('[data-versao] .cor').first().screenshot({ path: path.join(PRINTS, 'cor-antes-depois.png') }).catch(() => {});
  ok('cor: antes e depois de cada plano na versão (imagens, medição e comparador)', Boolean(cor && cor.planos >= 2 && cor.carregadas === cor.total && cor.pos === '80%' && !cor.rolagem), JSON.stringify(cor));
  await page.goto(`${BASE}/caderno`);
  const nLooks = await page.locator('[data-teste=caderno-looks] li').count();
  ok('caderno mostra a biblioteca de cor por ambiente', nLooks >= 5, `${nLooks} looks`);
  {
    const antes = (await page.locator('[data-teste=backup-estado]').textContent({ timeout: 10000 }).catch(() => '')) ?? '';
    await page.fill('[data-teste=backup-pedido]', 'https://exemplo.com/nao-e-dropbox');
    await page.click('[data-teste=backup-salvar]');
    const recusou = await page.waitForSelector('[data-teste=backup] [role=alert] >> text=não é o link de uma solicitação', { timeout: 8000 }).then(() => true).catch(() => false);
    await page.fill('[data-teste=backup-pedido]', 'https://www.dropbox.com/request/AbCdEfGh1234567890');
    await page.click('[data-teste=backup-salvar]');
    await page.waitForSelector('[data-teste=backup-agora]:not([disabled])', { timeout: 8000 }).catch(() => {});
    await page.click('[data-teste=backup-agora]').catch(() => {});
    const emDia = await page.waitForSelector('[data-teste=backup-estado] >> text=em dia', { timeout: 15000 }).then(() => true).catch(() => false);
    const html = await page.content();
    ok('backup: endereço errado recusado, destino salvo, backup feito e o link não fica na tela', /ainda não rodou/.test(antes) && recusou && emDia && !html.includes('AbCdEfGh1234567890'),
      `antes "${antes.trim().slice(0, 40)}" · recusou ${recusou} · em dia ${emDia}`);
  }
  await page.fill('[data-teste=form-referencia] input[name=url]', 'https://www.instagram.com/reel/TESTE123/');
  await page.click('[data-teste=ler-referencia]');
  const leu = await page.waitForSelector('[data-teste=referencias] li >> text=planos', { timeout: 10000 }).then(() => true).catch(() => false);
  ok('estudo de caso por link entra no caderno', leu, leu ? 'lição gravada' : 'não apareceu');
  ok('fluxo sem erro de console', errosConsole.length === 0, errosConsole.slice(0, 3).join(' | '));

  // ---------- 4. verificação visual logada ----------
  const estado = await ctx.storageState();
  const configs = [
    { nome: 'celular-claro', viewport: { width: 390, height: 844 }, colorScheme: 'light', isMobile: true, hasTouch: true },
    { nome: 'celular-escuro', viewport: { width: 390, height: 844 }, colorScheme: 'dark', isMobile: true, hasTouch: true },
    { nome: 'desktop-claro', viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
    { nome: 'desktop-escuro', viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
  ];
  const paginas = [['entrar', '/entrar', false], ['projetos', '/projetos', true], ['novo', '/projetos/novo', true], ['projeto', `/projetos/${pid}`, true], ['caderno', '/caderno', true]];
  const problemas = [];
  await medir('verificacao_visual_s', async () => {
    for (const c of configs) {
      const vctx = await navegador.newContext({ ...c, locale: 'pt-BR', storageState: estado });
      for (const [nome, rota, logado] of paginas) {
        if (!logado) await vctx.clearCookies();
        else if (!(await vctx.cookies()).length) await vctx.addCookies(estado.cookies);
        const pg = await vctx.newPage();
        const erros = [];
        pg.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
        pg.on('pageerror', (e) => erros.push(String(e)));
        pg.on('requestfailed', (r) => { const f = r.failure()?.errorText ?? ''; if (!/ERR_ABORTED/.test(f)) erros.push(`falhou ${r.url()} ${f}`); });
        pg.on('response', (r) => { if (r.status() >= 400) erros.push(`${r.status()} ${r.url()}`); });
        await pg.goto(`${BASE}${rota}`, { waitUntil: 'networkidle' }).catch(() => pg.waitForLoadState('load'));
        await pg.waitForTimeout(700);
        const medida = await pg.evaluate(() => {
          const larg = document.documentElement.clientWidth;
          const rolagem = document.documentElement.scrollWidth > larg + 1;
          const pequenos = [];
          for (const el of document.querySelectorAll('body *')) {
            if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            const t = parseFloat(getComputedStyle(el).fontSize);
            if (t < 11) pequenos.push(`${el.tagName.toLowerCase()} ${t}px "${el.textContent.trim().slice(0, 20)}"`);
          }
          const alvos = [...document.querySelectorAll('a, button, input:not(.so-leitor), select, textarea, label.botao')]
            .filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.height && (r.height < 44 || r.width < 44) && !el.closest('.opcao'); })
            .map((el) => `${el.tagName.toLowerCase()}:${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
          return { rolagem, pequenos, alvos };
        });
        await pg.screenshot({ path: path.join(PRINTS, `${c.nome}-${nome}.png`), fullPage: true });
        if (erros.length) problemas.push(`${c.nome}/${nome}: console ${erros.slice(0, 2).join(' | ')}`);
        if (medida.rolagem) problemas.push(`${c.nome}/${nome}: rolagem horizontal`);
        if (medida.pequenos.length) problemas.push(`${c.nome}/${nome}: texto < 11px (${medida.pequenos.slice(0, 3).join('; ')})`);
        if (c.isMobile && medida.alvos.length) problemas.push(`${c.nome}/${nome}: alvo de toque < 44px (${medida.alvos.slice(0, 4).join(', ')})`);
        await pg.close();
      }
      await vctx.close();
    }
  });
  ok('verificação visual logada (4 configurações × 4 telas)', problemas.length === 0, problemas.length ? problemas.slice(0, 6).join(' || ') : `prints em ${path.relative(WEB, PRINTS)}`);

  const olhar = acharOlhar();
  if (olhar) {
    await medir('olhar_cjs_s', async () => {
      const r = spawnSync('node', [olhar, `${BASE}/entrar`, '--saida', path.join(WEB, '.verificacao', 'olhar'), '--espera', '1500'], { cwd: WEB, encoding: 'utf8', timeout: 120000 });
      ok('olhar.cjs da casa em /entrar (sem erro de console e sem rolagem)', r.status === 0, (r.stdout + r.stderr).trim().split('\n').slice(-3).join(' | '));
    });
  }
  await ctx.close();
}

let codigo = 0;
const t0 = performance.now();
try {
  await principal();
} catch (e) {
  ok('aceite rodou até o fim', false, String(e?.stack || e).slice(0, 600));
} finally {
  tempos.total_s = +((performance.now() - t0) / 1000).toFixed(1);
  await navegador?.close().catch(() => {});
  encerrar();
  if (!MANTER) fs.rmSync(SCRATCH, { recursive: true, force: true });
  const falhas = resultados.filter((r) => !r.passou);
  console.log(`\nACEITE FRENTE D: ${resultados.length - falhas.length}/${resultados.length} ok`);
  console.log(`tempos (s): ${JSON.stringify(tempos)}`);
  if (MANTER) console.log(`dados e logs mantidos em ${SCRATCH}`);
  codigo = falhas.length ? 1 : 0;
}
process.exit(codigo);
