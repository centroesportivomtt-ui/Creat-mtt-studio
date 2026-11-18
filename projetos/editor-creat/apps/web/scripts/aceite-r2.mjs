#!/usr/bin/env node
// Aceite do envio DIRETO navegador -> R2 (multipart pré-assinado). Uso: cd apps/web && pnpm aceite:r2 [--sem-build] [--manter]
// Sobe o R2 falso (scripts/r2-falso.mjs, confere SigV4 e CORS), o motor falso (scripts/motor-falso.mjs) atrás de um
// contador de avisos e o site com EDITOR_ARMAZENAMENTO=r2 (next build + next start). Com Playwright:
//  - negativos: sem sessão (401), nome com ../ e barra (400), extensão não aceita (415), arquivo grande demais (413),
//    token adulterado (400), rota tus desligada no modo r2 (410), URL de parte com tamanho trocado (403 no falso);
//  - envia 40 MB em partes de 5 MB (3 em paralelo), com a conexão DERRUBADA no meio de uma parte (repete sozinho),
//    RECARREGA a página no meio, escolhe o arquivo de novo e RETOMA só as partes faltantes; cai a rede (offline) e volta;
//  - o objeto final no falso é idêntico (sha256), a chave saiu sem acento, nenhuma parte confirmada subiu duas vezes
//    depois da retomada, o motor foi avisado EXATAMENTE uma vez e nada sobrou de multipart; cancelar aborta o envio.
import http from 'node:http';
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
const PORTA_WEB = Number(process.env.ACEITE_PORTA_WEB || 3107);
const PORTA_MOTOR = Number(process.env.ACEITE_PORTA_MOTOR || 8807);
const PORTA_CONTADOR = PORTA_MOTOR + 1;
const PORTA_R2 = Number(process.env.ACEITE_PORTA_R2 || 8809);
const BASE = `http://127.0.0.1:${PORTA_WEB}`;
const R2 = `http://127.0.0.1:${PORTA_R2}`;
const MiB = 1024 * 1024;
const TAMANHO = 40 * MiB;
const PARTE_MB = 5;
const SCRATCH = process.env.ACEITE_DIR || path.join(process.env.TMPDIR || '/tmp', `editor-web-aceite-r2-${process.pid}`);
const DADOS = path.join(SCRATCH, 'dados');
const ARM = path.join(DADOS, 'armazenamento');
const PRINTS = path.join(WEB, '.verificacao', 'aceite-r2');
const SENHA = `aceite-${randomBytes(6).toString('hex')}`;

const resultados = [];
const tempos = {};
const filhos = [];
let navegador, contador;
const avisos = []; // POST /v1/projetos/<p>/arquivos que chegaram ao motor

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
    try { const r = await fetch(url); if (r.status < 500) return true; } catch { /* subindo */ }
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
  contador?.close();
}
async function sha256(arquivo) {
  const h = createHash('sha256');
  for await (const c of fs.createReadStream(arquivo, { highWaterMark: 4 << 20 })) h.update(c);
  return h.digest('hex');
}
const estadoR2 = async () => (await fetch(`${R2}/__controle/estado`)).json();
const valor = async (page, sel, attr) => page.getAttribute(sel, attr, { timeout: 2000 }).catch(() => null);

/** Contador entre o site e o motor falso: conta cada aviso de arquivo terminado e repassa tudo igual. */
function subirContador() {
  return new Promise((pronto) => {
    contador = http.createServer((req, res) => {
      if (req.method === 'POST' && /^\/v1\/projetos\/[^/]+\/arquivos$/.test(req.url)) avisos.push(req.url);
      const p = http.request({ host: '127.0.0.1', port: PORTA_MOTOR, path: req.url, method: req.method, headers: req.headers }, (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      });
      p.on('error', () => { res.writeHead(502); res.end(); });
      req.pipe(p);
    }).listen(PORTA_CONTADOR, '127.0.0.1', pronto);
  });
}

async function principal() {
  fs.rmSync(SCRATCH, { recursive: true, force: true });
  fs.mkdirSync(ARM, { recursive: true });
  fs.rmSync(PRINTS, { recursive: true, force: true });
  fs.mkdirSync(PRINTS, { recursive: true });

  const sal = randomBytes(16);
  const env = {
    NEXT_TELEMETRY_DISABLED: '1',
    EDITOR_AUTH: 'senha',
    EDITOR_DADOS: DADOS,
    EDITOR_ARMAZENAMENTO: 'r2',
    R2_ENDPOINT: R2,
    R2_ACCESS_KEY_ID: `aceite-${randomBytes(6).toString('hex')}`,
    R2_SECRET_ACCESS_KEY: randomBytes(24).toString('base64url'),
    R2_BUCKET: 'editor-aceite',
    R2_FALSO_PORTA: String(PORTA_R2),
    R2_FALSO_DIR: ARM, // o bucket falso grava no mesmo armazenamento que o motor falso lê
    R2_FALSO_ORIGENS: BASE,
    EDITOR_ENVIO_PARTE_MB: String(PARTE_MB),
    EDITOR_ENVIO_MAX_GB: '0.05', // ~51 MB: 40 MB passa, 60 MB é recusado
    MOTOR_URL: `http://127.0.0.1:${PORTA_CONTADOR}`,
    MOTOR_TOKEN: randomBytes(18).toString('base64url'),
    MOTOR_FALSO_PORTA: String(PORTA_MOTOR),
    MOTOR_FALSO_PASSO_MS: '300',
    EDITOR_SENHA_HASH: ['scrypt', 32768, 8, 1, sal.toString('base64'), scryptSync(SENHA, sal, 32, { N: 32768, r: 8, p: 1, maxmem: 64 << 20 }).toString('base64')].join(':'),
    EDITOR_SEGREDO_SESSAO: randomBytes(32).toString('base64url'),
  };
  delete process.env.R2_ACCOUNT_ID;

  // ---------- 1. falsos + site ----------
  await medir('falsos_sobem_s', async () => {
    subir('r2-falso', 'node', ['scripts/r2-falso.mjs'], env);
    subir('motor-falso', 'node', ['scripts/motor-falso.mjs'], env);
    await subirContador();
    await esperarPorta(`${R2}/__controle/estado`);
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

  // ---------- negativos sem sessão ----------
  {
    const corpo = JSON.stringify({ projeto: 'p_abcd1234', nome: 'a.mp4', tamanho: 10 });
    const r1 = await fetch(`${BASE}/api/envio-r2/iniciar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: corpo });
    const r2 = await fetch(`${BASE}/api/envio-r2/config`);
    const r3 = await fetch(`${BASE}/api/envio-r2/assinar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"token":"x","partes":[1]}' });
    ok('sem sessão: rotas do envio R2 recusam (401)', [r1.status, r2.status, r3.status].every((s) => s === 401), `iniciar ${r1.status}, config ${r2.status}, assinar ${r3.status}`);
  }

  // ---------- 2. navegador: sessão e projeto ----------
  navegador = await chromium.launch();
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  const errosConsole = [];
  page.on('console', (m) => { if (m.type() === 'error') errosConsole.push(m.text()); });
  page.on('pageerror', (e) => errosConsole.push(String(e)));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  const api = ctx.request;
  const entrou = await api.post(`${BASE}/api/entrar`, { data: { senha: SENHA }, headers: { origin: BASE } });
  ok('entra com a senha (sessão do site)', entrou.ok(), `status ${entrou.status()}`);
  const criado = await api.post(`${BASE}/api/motor/v1/projetos`, { data: { nome: 'Aceite R2 · envio direto', tipo_video: 'bastidor' }, headers: { origin: BASE } });
  const pid = (await criado.json().catch(() => ({}))).id ?? '';
  ok('projeto criado', /^p_[a-z0-9]+$/.test(pid), pid);

  // ---------- negativos com sessão ----------
  const iniciar = (dados) => api.post(`${BASE}/api/envio-r2/iniciar`, { data: { projeto: pid, tipo: 'video/mp4', ...dados }, headers: { origin: BASE } });
  {
    const cfg = await (await api.get(`${BASE}/api/envio-r2/config`)).json();
    ok('config diz modo r2 com partes de 5 MB', cfg.modo === 'r2' && cfg.parteMB === PARTE_MB, JSON.stringify(cfg));
    const casos = [
      ['nome com ../', { nome: '../../etc/passwd.mp4', tamanho: 10 }, 400],
      ['nome com barra', { nome: 'pasta/video.mp4', tamanho: 10 }, 400],
      ['nome com barra invertida', { nome: 'c:\\video.mp4', tamanho: 10 }, 400],
      ['extensão não aceita', { nome: 'virus.exe', tamanho: 10 }, 415],
      ['arquivo grande demais', { nome: 'grande.mp4', tamanho: 60 * MiB }, 413],
      ['tamanho inválido', { nome: 'vazio.mp4', tamanho: 0 }, 400],
      ['projeto inexistente', { nome: 'a.mp4', tamanho: 10, projeto: 'p_naoexiste1' }, 404],
    ];
    const vistos = [];
    for (const [nome, dados, esperado] of casos) {
      const r = await iniciar(dados);
      vistos.push(`${nome} ${r.status()}`);
      ok(`recusa ${nome} (${esperado})`, r.status() === esperado, `status ${r.status()} · ${(await r.text()).slice(0, 120)}`);
    }
    const origem = await api.post(`${BASE}/api/envio-r2/iniciar`, { data: { projeto: pid, nome: 'a.mp4', tamanho: 10 }, headers: { origin: 'https://site-malicioso.example' } });
    ok('recusa POST de outra origem (403)', origem.status() === 403, `status ${origem.status()}`);
    const tus = await api.post(`${BASE}/api/envio`, { headers: { origin: BASE, 'Tus-Resumable': '1.0.0', 'Upload-Length': '10' } });
    ok('rota tus desligada no modo r2 (410, mensagem clara)', tus.status() === 410 && /R2/.test(await tus.text()), `status ${tus.status()}`);
    // token adulterado e URL com tamanho trocado
    const bom = await (await iniciar({ nome: 'teste.mp4', tamanho: 6 * MiB })).json();
    const [corpoTok, assin] = bom.token.split('.');
    const adulterado = `${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(corpoTok, 'base64url')), t: 1 })).toString('base64url')}.${assin}`;
    const rAd = await api.post(`${BASE}/api/envio-r2/assinar`, { data: { token: adulterado, partes: [1] }, headers: { origin: BASE } });
    ok('recusa token adulterado (400)', rAd.status() === 400, `status ${rAd.status()}`);
    const rFora = await api.post(`${BASE}/api/envio-r2/assinar`, { data: { token: bom.token, partes: [3] }, headers: { origin: BASE } });
    ok('recusa parte fora do arquivo (400)', rFora.status() === 400, `status ${rFora.status()}`);
    const { urls } = await (await api.post(`${BASE}/api/envio-r2/assinar`, { data: { token: bom.token, partes: [1] }, headers: { origin: BASE } })).json();
    const errado = await fetch(urls[0].url, { method: 'PUT', body: Buffer.alloc(1 * MiB) }).catch(() => ({ status: 0 }));
    const trocada = await fetch(urls[0].url.replace('partNumber=1', 'partNumber=2'), { method: 'PUT', body: Buffer.alloc(5 * MiB) }).catch(() => ({ status: 0 }));
    ok('R2 recusa parte de outro tamanho ou URL alterada (assinatura)', errado.status === 403 && trocada.status === 403, `tamanho trocado ${errado.status}, parte trocada ${trocada.status}`);
    const acento = await (await iniciar({ nome: 'Vídeo Ação 01.MOV', tamanho: 10 })).json();
    ok('acento vira sem acento na chave', /^entrada\/p_[a-z0-9]+\/video-acao-01-[a-z0-9]{8}\.mov$/.test(acento.chave ?? ''), acento.chave);
    await api.post(`${BASE}/api/envio-r2/abortar`, { data: { token: acento.token }, headers: { origin: BASE } });
    const conc = await api.post(`${BASE}/api/envio-r2/concluir`, { data: { token: bom.token }, headers: { origin: BASE } });
    ok('concluir com partes faltando é recusado (409)', conc.status() === 409, `status ${conc.status()}`);
    await api.post(`${BASE}/api/envio-r2/abortar`, { data: { token: bom.token }, headers: { origin: BASE } });
  }

  // ---------- 3. envio de 40 MB: queda no meio da parte, recarga, retomada, offline ----------
  const nomeArquivo = 'Bastidor 01.mp4'; // o Playwright não anexa arquivo com acento no caminho; o acento é testado no iniciar
  const origem = path.join(SCRATCH, nomeArquivo);
  fs.writeFileSync(origem, randomBytes(TAMANHO));
  const hashOrigem = await sha256(origem);
  const hidratou = page.waitForResponse((r) => r.url().includes('/api/envio-r2/config'), { timeout: 20000 }); // o componente montou
  await page.goto(`${BASE}/projetos/${pid}`);
  await hidratou;
  await page.waitForSelector('[data-teste=entrada-arquivo]', { state: 'attached', timeout: 20000 });
  errosConsole.length = 0;

  // lentidão para dar tempo de interromper: o Chromium limita a rede da página (sem mexer no falso)
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: -1, uploadThroughput: 12 * MiB });
  await fetch(`${R2}/__controle/derrubar?parte=2&depois=${2 * MiB}`, { method: 'POST' }); // a parte 2 cai no meio

  let interrompidoEm = 0, retomadoDe = 0, pendenteMostrado = '', antesRecarga = null, viuPausado = false, viuRepeticao = false;
  await medir('envio_40mb_s', async () => {
    await page.setInputFiles('[data-teste=entrada-arquivo]', origem);
    const t0 = Date.now();
    while (Date.now() - t0 < 60000) { // no meio: >= 40% na tela e pelo menos 3 partes confirmadas no R2
      const v = Number(await valor(page, '[data-envio]', 'data-progresso') ?? 0);
      const confirmadas = v >= 0.4 ? Object.keys((await estadoR2()).partes).length : 0;
      if (confirmadas >= 3) { interrompidoEm = v; break; }
      await dormir(20);
    }
    if (!interrompidoEm) await page.screenshot({ path: path.join(PRINTS, 'erro-envio.png'), fullPage: true });
    if (!interrompidoEm) throw new Error(`o envio não andou: "${(await page.textContent('[data-envio]').catch(() => ''))?.slice(0, 200)}" · R2 ${JSON.stringify((await estadoR2()).operacoes)} · console ${errosConsole.slice(0, 4).join(" | ")} · url ${page.url()} · desabilitado ${await page.isDisabled("[data-teste=entrada-arquivo]").catch((e) => e.message)}`);
    antesRecarga = await estadoR2();
    viuRepeticao = antesRecarga.derrubadas === 1;
    await page.reload(); // interrompe as partes em curso
    await page.waitForSelector('[data-pendente]', { timeout: 15000 }).catch(() => null);
    pendenteMostrado = (await page.textContent('[data-pendente] .envio__num').catch(() => '')) ?? '';
    await page.setInputFiles('[data-teste=entrada-arquivo]', origem);
    await page.waitForSelector('[data-envio][data-retomado-de]', { timeout: 15000 });
    retomadoDe = Number(await valor(page, '[data-envio]', 'data-retomado-de'));
    // cai a rede (celular saiu do Wi-Fi) e volta: pausa sozinho e continua sozinho
    const t1 = Date.now();
    while (Date.now() - t1 < 30000) {
      const v = Number(await valor(page, '[data-envio]', 'data-progresso') ?? 0);
      if (v >= 0.6) break;
      await dormir(20);
    }
    await ctx.setOffline(true);
    viuPausado = await page.waitForSelector('[data-envio][data-estado=pausado]', { timeout: 10000 }).then(() => true, () => false);
    await dormir(600);
    await ctx.setOffline(false);
    await page.waitForSelector('[data-envio][data-estado=concluido]', { timeout: 120000 });
  });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  ok('conexão derrubada no meio de uma parte: repetiu sozinho', viuRepeticao, `derrubadas no falso: ${antesRecarga?.derrubadas}`);
  ok('interrompido no meio (recarregando a página)', interrompidoEm >= 0.4 && interrompidoEm < 0.95, `progresso ${(interrompidoEm * 100).toFixed(1)}%; tela mostrou pendente "${pendenteMostrado}"`);
  const confirmadoAntes = Object.keys(antesRecarga?.partes ?? {}).length * PARTE_MB * MiB / TAMANHO;
  ok('retomou sem recomeçar (ListParts)', retomadoDe >= 0.3 && retomadoDe + 1e-6 >= confirmadoAntes,
    `retomado de ${(retomadoDe * 100).toFixed(1)}% do arquivo (confirmado no R2 antes da recarga: ${(confirmadoAntes * 100).toFixed(1)}%)`);
  ok('sem rede: pausou e voltou sozinho', viuPausado);

  const fim = await estadoR2();
  const pastaEntrada = path.join(ARM, 'entrada', pid);
  const salvos = fs.existsSync(pastaEntrada) ? fs.readdirSync(pastaEntrada).filter((f) => !f.startsWith('.')) : [];
  const salvo = salvos.map((f) => path.join(pastaEntrada, f)).find((f) => fs.statSync(f).size === TAMANHO);
  const hashDestino = salvo ? await sha256(salvo) : '';
  ok('objeto final idêntico no R2 falso (sha256)', salvo && hashDestino === hashOrigem, `${salvo ? path.relative(ARM, salvo) : 'não encontrado'} · ${hashOrigem.slice(0, 16)}…`);
  ok('chave sem espaço', salvo && /^bastidor-01-[a-z0-9]{8}\.mp4$/.test(path.basename(salvo)), salvo ? path.basename(salvo) : '');
  const nPartes = TAMANHO / (PARTE_MB * MiB);
  const confirmadasAntes = Object.keys(antesRecarga?.partes ?? {}).map(Number);
  const repetidas = confirmadasAntes.filter((n) => (fim.partes[n] ?? 0) > (antesRecarga.partes[n] ?? 0) && antesRecarga.partes[n] > 0);
  ok(`só as partes faltantes subiram depois da retomada (${nPartes} partes)`, repetidas.length === 0 && Object.keys(fim.partes).length === nPartes,
    `confirmadas antes da recarga: [${confirmadasAntes.join(',')}] · reenviadas: [${repetidas.join(',')}] · PUTs por parte ${JSON.stringify(fim.partes)}`);
  const concluidos = fim.concluidos.filter((c) => c.chave.startsWith(`entrada/${pid}/bastidor`));
  ok('CompleteMultipartUpload uma vez', concluidos.length === 1 && concluidos[0].partes === nPartes, JSON.stringify(concluidos));
  const deste = avisos.filter((u) => u.includes(pid));
  ok('motor avisado exatamente uma vez', deste.length === 1, `${deste.length} aviso(s)`);
  const proj = await (await api.get(`${BASE}/api/motor/v1/projetos/${pid}`)).json();
  ok('motor registrou o arquivo', proj.arquivos?.length === 1 && proj.arquivos[0].bytes === TAMANHO, JSON.stringify(proj.arquivos?.map((a) => [a.id, a.bytes])));
  await page.waitForSelector('.arquivo', { timeout: 15000 }).catch(() => null);
  ok('arquivo aparece na lista da tela', (await page.locator('.arquivo').count()) === 1);
  const lsResto = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ec-r2:')).length);
  ok('nada sobrou do envio no navegador (localStorage)', lsResto === 0, `${lsResto} registro(s)`);

  // ---------- 4. cancelar ----------
  const pequeno = path.join(SCRATCH, 'cancelar.mov');
  fs.writeFileSync(pequeno, randomBytes(20 * MiB));
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: -1, uploadThroughput: 4 * MiB });
  const abortosAntes = (await estadoR2()).operacoes.AbortMultipartUpload ?? 0;
  await page.setInputFiles('[data-teste=entrada-arquivo]', pequeno);
  await page.waitForSelector('[data-envio="cancelar.mov"][data-estado=enviando]', { timeout: 15000 });
  await page.click('[data-envio="cancelar.mov"] [data-teste=cancelar-envio]');
  await page.waitForSelector('[data-envio="cancelar.mov"][data-estado=cancelado]', { timeout: 10000 });
  await dormir(800);
  const depoisCancelar = await estadoR2();
  const sobrou = fs.readdirSync(pastaEntrada).filter((f) => f.startsWith('cancelar'));
  ok('cancelar aborta o multipart e não cria objeto', (depoisCancelar.operacoes.AbortMultipartUpload ?? 0) === abortosAntes + 1 && sobrou.length === 0,
    `abortos ${abortosAntes} → ${depoisCancelar.operacoes.AbortMultipartUpload}; objetos ${sobrou.length}`);
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const mpResto = fs.readdirSync(path.join(ARM, '.multipart')).filter((d) => {
    try { return JSON.parse(fs.readFileSync(path.join(ARM, '.multipart', d, 'meta.json'), 'utf8')).chave.includes(pid); } catch { return false; }
  });
  ok('nenhum multipart pendurado do projeto', mpResto.length === 0, mpResto.join(', '));
  // erros esperados: as recusas de propósito (rede derrubada, offline, cancelamento) aparecem como recurso que falhou
  const inesperados = errosConsole.filter((e) => !/Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION|ERR_EMPTY_RESPONSE|net::ERR_/.test(e));
  ok('sem erro de console inesperado', inesperados.length === 0, inesperados.slice(0, 3).join(' | '));

  // ---------- 5. celular: a lista de envios cabe na tela ----------
  const estado = await ctx.storageState();
  for (const [nome, opc] of [['celular-claro', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'light' }],
    ['desktop-escuro', { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' }]]) {
    const vctx = await navegador.newContext({ ...opc, locale: 'pt-BR', storageState: estado });
    const pg = await vctx.newPage();
    await pg.goto(`${BASE}/projetos/${pid}`, { waitUntil: 'networkidle' }).catch(() => null);
    await pg.setInputFiles('[data-teste=entrada-arquivo]', pequeno).catch(() => null);
    await pg.waitForSelector('[data-envio="cancelar.mov"]', { timeout: 10000 }).catch(() => null);
    await pg.waitForTimeout(600);
    const rolagem = await pg.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    await pg.screenshot({ path: path.join(PRINTS, `${nome}-envio.png`), fullPage: true });
    ok(`${nome}: envio na tela sem rolagem horizontal`, !rolagem, `print em ${path.relative(WEB, PRINTS)}/${nome}-envio.png`);
    await pg.click('[data-envio="cancelar.mov"] [data-teste=cancelar-envio]').catch(() => null);
    await pg.waitForTimeout(400);
    await vctx.close();
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
  console.log(`\nACEITE R2 (envio direto): ${resultados.length - falhas.length}/${resultados.length} ok`);
  console.log(`tempos (s): ${JSON.stringify(tempos)}`);
  if (MANTER) console.log(`dados e logs mantidos em ${SCRATCH}`);
  codigo = falhas.length ? 1 : 0;
}
process.exit(codigo);
