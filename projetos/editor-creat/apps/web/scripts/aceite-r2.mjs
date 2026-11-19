#!/usr/bin/env node
// Aceite do envio direto ao R2 (fase 2), com navegador de verdade e o motor de verdade.
// Um S3 de teste (moto) faz o papel do R2. Confere: CORS aplicado pela ferramenta do motor, envio em partes
// assinadas direto do navegador, interrupção recarregando a página, retomada sem recomeçar, arquivo íntegro
// (sha256) no bucket, registro no motor e o tus desligado no modo r2.
// uso: cd apps/web && pnpm build && node scripts/aceite-r2.mjs      (precisa de python3 com o motor e moto[server])
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(AQUI, '..');
const MOTOR = path.resolve(WEB, '..', '..', 'services', 'motor');
const P_S3 = 8790, P_MOTOR = 8789, P_WEB = 3010;
const BASE = `http://127.0.0.1:${P_WEB}`;
const S3 = `http://127.0.0.1:${P_S3}`;
const MB = 1024 * 1024;
const TAMANHO = Number(process.env.ACEITE_MB || 40) * MB;   // vai como buffer (nome com acento, como no celular)
const SCRATCH = path.join(process.env.TMPDIR || '/tmp', `editor-r2-aceite-${process.pid}`);
const SENHA = `aceite-${randomBytes(6).toString('hex')}`;
const TOKEN = randomBytes(24).toString('base64url');
const BUCKET = 'creat-editor-midia';

const resultados = [];
const filhos = [];
const ok = (nome, passou, detalhe = '') => { resultados.push(passou); console.log(`${passou ? 'ok  ' : 'FALHA'}  ${nome}${detalhe ? ` — ${detalhe}` : ''}`); };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperar(url, limite = 60000) {
  const t = Date.now();
  while (Date.now() - t < limite) {
    try { const r = await fetch(url); if (r.status < 500) return true; } catch { /* subindo */ }
    await dormir(300);
  }
  return false;
}
function subir(cmd, argv, env, cwd) {
  const p = spawn(cmd, argv, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = fs.createWriteStream(path.join(SCRATCH, `${path.basename(cmd)}-${filhos.length}.log`));
  p.stdout.pipe(log); p.stderr.pipe(log);
  filhos.push(p);
  return p;
}
const sha256 = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const ENV_R2 = {
  EDITOR_ARMAZENAMENTO: 'r2', R2_ENDPOINT: S3, R2_ACCOUNT_ID: '0'.repeat(32), R2_ACCESS_KEY_ID: 'teste',
  R2_SECRET_ACCESS_KEY: 'teste', R2_BUCKET: BUCKET, AWS_DEFAULT_REGION: 'us-east-1',
  EDITOR_DADOS: path.join(SCRATCH, 'dados'), MOTOR_TOKEN: TOKEN, EDITOR_ENVIO_PARTE_MB: '5',
};
const py = (codigo) => spawnSync('python3', ['-c', codigo], { cwd: MOTOR, env: { ...process.env, ...ENV_R2 }, encoding: 'utf8' });

let navegador;
try {
  fs.mkdirSync(SCRATCH, { recursive: true });
  subir('python3', ['-m', 'moto.server', '-H', '127.0.0.1', '-p', String(P_S3)], {}, SCRATCH);
  if (!(await esperar(S3))) throw new Error('S3 de teste não subiu');
  py(`import boto3; boto3.client('s3', endpoint_url='${S3}', aws_access_key_id='t', aws_secret_access_key='t', region_name='us-east-1').create_bucket(Bucket='${BUCKET}')`);
  const cors = spawnSync('python3', ['-m', 'motor.ferramentas.r2_cors', BASE], { cwd: MOTOR, env: { ...process.env, ...ENV_R2 }, encoding: 'utf8' });
  ok('CORS do bucket aplicado pela ferramenta do motor', cors.status === 0, (cors.stdout || cors.stderr).trim().split('\n').pop());

  subir('python3', ['-m', 'uvicorn', 'motor.api.app:criar', '--factory', '--host', '127.0.0.1', '--port', String(P_MOTOR)], ENV_R2, MOTOR);
  if (!(await esperar(`http://127.0.0.1:${P_MOTOR}/v1/saude`))) throw new Error('motor não subiu');

  const N = 16384, r = 8, p = 1, sal = randomBytes(16);
  const hash = ['scrypt', N, r, p, sal.toString('base64'), scryptSync(SENHA, sal, 32, { N, r, p }).toString('base64')].join(':');
  subir(path.join(WEB, 'node_modules', '.bin', 'next'), ['start', '-p', String(P_WEB), '-H', '127.0.0.1'], {
    MOTOR_URL: `http://127.0.0.1:${P_MOTOR}`, MOTOR_TOKEN: TOKEN, EDITOR_ARMAZENAMENTO: 'r2', EDITOR_ENVIO_PARTE_MB: '5',
    EDITOR_SENHA_HASH: hash, EDITOR_SEGREDO_SESSAO: randomBytes(32).toString('base64url'),
  }, WEB);
  if (!(await esperar(`${BASE}/entrar`))) throw new Error('site não subiu');

  const chrome = ['/usr/bin/google-chrome', '/opt/google/chrome/chrome'].find((f) => fs.existsSync(f));
  navegador = await chromium.launch(chrome ? { executablePath: chrome } : {});
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  const erros = [];
  globalThis.__erros = erros;
  globalThis.__reqs = [];
  page.on('request', (q) => globalThis.__reqs.push(`${q.method()} ${q.url().slice(0, 120)}`));
  page.on('requestfailed', (q) => globalThis.__reqs.push(`FALHOU ${q.method()} ${q.url().slice(0, 100)} ${q.failure()?.errorText}`));
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('pageerror', (e) => erros.push(String(e)));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  const putsR2 = [];
  page.on('request', (q) => { if (q.method() === 'PUT' && q.url().startsWith(S3)) putsR2.push(q.url()); });

  await page.goto(`${BASE}/entrar`);
  await page.fill('input[name=senha]', SENHA);
  await page.click('main button[type=submit]');
  await page.waitForURL(`${BASE}/projetos`, { timeout: 15000 });
  await page.goto(`${BASE}/projetos/novo`);
  await page.fill('input[name=nome]', 'Aceite R2 · envio direto');
  await page.check('input[name=tipo][value=bastidor]', { force: true });
  await page.click('main button[type=submit]');
  await page.waitForURL(/\/projetos\/p_[a-z0-9]+$/, { timeout: 15000 });
  const pid = page.url().split('/').pop();

  await page.waitForSelector('[data-teste=entrada-arquivo]:not([disabled])', { state: 'attached', timeout: 15000 });
  await page.waitForLoadState('load');
  await dormir(1500);                      // hidratação do React (antes disso o onChange do campo não existe)
  const tus = await page.evaluate(async () => (await fetch('/api/envio', { method: 'POST' })).status);
  ok('tus desligado no modo r2', tus === 409, `status ${tus}`);
  erros.length = 0;                        // o 409 acima é o esperado

  const origem = path.join(SCRATCH, 'origem.bin');
  const buf = Buffer.alloc(TAMANHO);
  for (let i = 0; i < TAMANHO; i += MB) randomBytes(64 * 1024).copy(buf, i);
  fs.writeFileSync(origem, buf);
  const hashOrigem = sha256(origem);
  // o caminho com acento não passa pelo setInputFiles do Playwright; o arquivo vai como buffer com o nome real
  const escolha = { name: 'Gravação 01.mp4', mimeType: 'video/mp4', buffer: buf };

  // limita a banda para dar tempo de interromper no meio
  const cdp = process.env.ACEITE_SEM_CDP ? null : await ctx.newCDPSession(page);
  if (cdp) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: -1, uploadThroughput: 20 * MB });
  await page.setInputFiles('[data-teste=entrada-arquivo]', escolha);
  if (process.env.ACEITE_DEBUG) console.log('DEBUG logo após escolher:', await page.evaluate(() => `${document.querySelector('[data-teste=entrada-arquivo]').files.length} arquivo(s); itens=${document.querySelectorAll('[data-envio]').length}`));
  let interrompido = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < (process.env.ACEITE_ESPERA ? Number(process.env.ACEITE_ESPERA) : 120000)) {
    const estado = await page.getAttribute('[data-envio]', 'data-estado').catch(() => '');
    if (estado === 'erro') break;
    const v = Number(await page.getAttribute('[data-envio]', 'data-progresso').catch(() => 0));
    if (v >= 0.4) { interrompido = v; break; }
    await dormir(20);
  }
  const msgErro = await page.textContent('[data-envio] .envio__info').catch(() => '');
  if (!interrompido) { await page.screenshot({ path: '/tmp/r2dbg.png' }); console.log('DEBUG input:', await page.evaluate(() => { const i = document.querySelector('[data-teste=entrada-arquivo]'); return i ? `disabled=${i.disabled} files=${i.files?.length}` : 'sem input'; })); }
  if (!interrompido) console.log('DEBUG envio:', (await page.locator('.envios').first().innerHTML().catch(() => 'sem lista')).slice(0, 600), '\nreqs:', globalThis.__reqs.slice(-8).join('\n'));
  ok('partes indo direto ao R2 pelo navegador', putsR2.length > 0 && interrompido >= 0.4, `${putsR2.length} PUT(s) no bucket; ${(interrompido * 100).toFixed(1)}% ${interrompido ? '' : `· ${msgErro}`}`);
  await page.reload();
  await page.waitForSelector('[data-pendente]', { timeout: 15000 }).catch(() => null);
  ok('envio interrompido aparece na tela', (await page.locator('[data-pendente]').count()) === 1);
  await page.setInputFiles('[data-teste=entrada-arquivo]', escolha);
  await page.waitForSelector('[data-envio][data-retomado-de]', { timeout: 20000 }).catch(() => null);
  const retomado = Number(await page.getAttribute('[data-envio]', 'data-retomado-de').catch(() => 0));
  ok('retomou de onde parou (sem recomeçar)', retomado >= 0.25, `retomado de ${(retomado * 100).toFixed(1)}%`);
  await page.waitForSelector('[data-envio][data-estado=concluido]', { timeout: 180000 });

  const conf = py(`
import boto3, hashlib, json
s3 = boto3.client('s3', endpoint_url='${S3}', aws_access_key_id='t', aws_secret_access_key='t', region_name='us-east-1')
ks = [o['Key'] for o in s3.list_objects_v2(Bucket='${BUCKET}', Prefix='entrada/${pid}/').get('Contents', [])]
h = [hashlib.sha256(s3.get_object(Bucket='${BUCKET}', Key=k)['Body'].read()).hexdigest() for k in ks]
up = s3.list_multipart_uploads(Bucket='${BUCKET}').get('Uploads', [])
print(json.dumps({'chaves': ks, 'hashes': h, 'abertos': len(up)}))`);
  const r2 = JSON.parse(conf.stdout || '{}');
  ok('arquivo íntegro no bucket (sha256)', r2.hashes?.length === 1 && r2.hashes[0] === hashOrigem, `${r2.chaves?.[0] ?? conf.stderr.slice(-200)}`);
  ok('chave sem acento no padrão entrada/<projeto>/', /^entrada\/p_[a-z0-9]+\/gravacao-01-[a-f0-9]{8}\.mp4$/.test(r2.chaves?.[0] ?? ''));
  ok('nenhum envio pela metade sobrando no bucket', r2.abertos === 0, `${r2.abertos} aberto(s)`);
  await page.waitForSelector('.arquivo', { timeout: 15000 });
  ok('motor registrou o arquivo', (await page.locator('.arquivo').count()) === 1);
  ok('sem erro de console', erros.length === 0, erros.slice(0, 3).join(' | '));
} catch (e) {
  ok('aceite rodou até o fim', false, String(e?.message || e).split('\n')[0]);
  if (globalThis.__erros?.length) console.log('console do navegador:', globalThis.__erros.slice(0, 5).join(' | '));
} finally {
  await navegador?.close().catch(() => {});
  for (const f of filhos) f.kill('SIGTERM');
  if (!process.argv.includes('--manter')) fs.rmSync(SCRATCH, { recursive: true, force: true });
  const n = resultados.filter(Boolean).length;
  console.log(`\nACEITE R2: ${n}/${resultados.length} ok`);
  process.exitCode = n === resultados.length ? 0 : 1;
}
