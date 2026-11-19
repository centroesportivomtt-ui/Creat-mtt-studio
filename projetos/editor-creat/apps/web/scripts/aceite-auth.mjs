#!/usr/bin/env node
// Aceite do login (EDITOR_AUTH=senha | supabase). Uso: cd apps/web && pnpm aceite:auth [--sem-build] [--manter]
// Nada sai da máquina: sobe o Supabase falso (scripts/supabase-falso.mjs), o motor falso e o site (`next start`),
// com segredos gerados na hora, e confere em 4 rodadas:
//   A. supabase + JWKS (ES256): sem sessão redireciona e a API recusa; formulário com e-mail; senha errada, conta fora
//      da lista (sem nem chamar o Supabase), token forjado, token de outra conta, Supabase fora do ar e limitado,
//      POST de outra origem: todos recusados sem cookie; login certo: cookie v2 HttpOnly, SameSite=Lax, Path=/
//      (Secure atrás de HTTPS); páginas e API abertas; cookie adulterado e cookie do modo senha recusados;
//      sair invalida o cookie no servidor; limite por e-mail com IP girando; login pelo navegador (Playwright).
//   B. supabase + SUPABASE_JWT_SECRET (HS256, JWKS vazio): login certo entra, token de outra chave recusado.
//   C. supabase SEM EDITOR_EMAILS_PERMITIDOS: login recusa tudo (503) e a página avisa.
//   D. EDITOR_AUTH ausente: o modo senha de antes continua igual (formulário só com senha, cookie v1).
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, randomBytes, scryptSync } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(AQUI, '..');
const args = process.argv.slice(2);
const SEM_BUILD = args.includes('--sem-build');
const MANTER = args.includes('--manter');
const PORTA_WEB = Number(process.env.ACEITE_AUTH_PORTA_WEB || 3011);
const PORTA_MOTOR = Number(process.env.ACEITE_AUTH_PORTA_MOTOR || 8798);
const PORTA_SUPA = Number(process.env.ACEITE_AUTH_PORTA_SUPABASE || 54399);
const BASE = `http://127.0.0.1:${PORTA_WEB}`;
const SUPA = `http://127.0.0.1:${PORTA_SUPA}`;
const SCRATCH = process.env.ACEITE_DIR || path.join(process.env.TMPDIR || '/tmp', `editor-web-aceite-auth-${process.pid}`);
fs.mkdirSync(path.join(SCRATCH, 'dados'), { recursive: true });

const resultados = [];
let filhos = [];
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
function ok(nome, passou, detalhe = '') {
  resultados.push({ nome, passou: Boolean(passou) });
  console.log(`${passou ? 'ok   ' : 'FALHA'} ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
}
async function esperarPorta(url, limite = 60000) {
  const t = Date.now();
  while (Date.now() - t < limite) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* subindo */ }
    await dormir(200);
  }
  throw new Error(`não subiu: ${url}`);
}
function subir(nome, cmd, argv, env) {
  const log = fs.openSync(path.join(SCRATCH, `${nome}.log`), 'a');
  const p = spawn('nice', ['-n', '5', cmd, ...argv], { cwd: WEB, env: { ...process.env, ...env }, stdio: ['ignore', log, log], detached: true });
  filhos.push(p);
  return p;
}
async function parar(p) {
  if (!p || p.exitCode !== null) return;
  const saiu = new Promise((r) => p.once('exit', r));
  try { process.kill(-p.pid, 'SIGTERM'); } catch { return; }
  await Promise.race([saiu, dormir(5000)]);
  filhos = filhos.filter((f) => f !== p);
}

const MOTOR_TOKEN = randomBytes(18).toString('base64url');
const ANON = `anon-${randomBytes(8).toString('hex')}`;
const SEGREDO_SESSAO = randomBytes(32).toString('base64url');
const SEGREDO_JWT = randomBytes(32).toString('base64url');
const base = {
  NEXT_TELEMETRY_DISABLED: '1',
  EDITOR_DADOS: path.join(SCRATCH, 'dados'),
  MOTOR_URL: `http://127.0.0.1:${PORTA_MOTOR}`,
  MOTOR_TOKEN,
  MOTOR_FALSO_PORTA: String(PORTA_MOTOR),
  EDITOR_SEGREDO_SESSAO: SEGREDO_SESSAO,
  EDITOR_AUTH: '', SUPABASE_URL: '', SUPABASE_ANON_KEY: '', SUPABASE_JWT_SECRET: '', EDITOR_EMAILS_PERMITIDOS: '', EDITOR_SENHA_HASH: '',
};
// Na lista: o dono (com maiúscula e espaço, para provar a normalização) e as contas de armadilha, para que só a
// verificação do token possa barrá-las.
const LISTA = ' Dono@Creat.test, forjado@creat.test;troca@creat.test instavel@creat.test limitado@creat.test';

async function subirSite(envExtra) {
  const p = subir('web', 'npx', ['next', 'start', '-p', String(PORTA_WEB), '-H', '127.0.0.1'], { ...base, ...envExtra });
  await esperarPorta(`${BASE}/entrar`);
  return p;
}
async function subirSupabase(envExtra) {
  const p = subir('supabase-falso', 'node', ['scripts/supabase-falso.mjs'], { FALSO_PORTA: String(PORTA_SUPA), FALSO_ANON: ANON, ...envExtra });
  await esperarPorta(`${SUPA}/__falso/chamadas`);
  return p;
}
const chamadas = async () => (await fetch(`${SUPA}/__falso/chamadas`)).json();

let ipSeq = 0;
function entrar(corpo, { ip, origem, https } = {}) {
  const h = { 'content-type': 'application/json', 'x-real-ip': ip ?? `10.9.0.${++ipSeq}` };
  if (origem) h.origin = origem;
  if (https) h['x-forwarded-proto'] = 'https';
  return fetch(`${BASE}/api/entrar`, { method: 'POST', headers: h, body: JSON.stringify(corpo) });
}
function cookieDe(r) {
  const sc = r.headers.getSetCookie?.() ?? [];
  const linha = sc.find((c) => c.startsWith('ec_sessao=')) ?? '';
  return { linha, valor: decodeURIComponent(linha.split(';')[0].slice('ec_sessao='.length)) };
}
const comCookie = (valor) => ({ headers: { cookie: `ec_sessao=${encodeURIComponent(valor)}` }, redirect: 'manual' });
const redireciona = (r) => [302, 303, 307, 308].includes(r.status) && (r.headers.get('location') ?? '').includes('/entrar');
const assinar = (corpo) => `${corpo}.${createHmac('sha256', SEGREDO_SESSAO).update(corpo).digest('base64url')}`;

let codigo = 1;
try {
  subir('motor-falso', 'node', ['scripts/motor-falso.mjs'], base);
  await esperarPorta(`http://127.0.0.1:${PORTA_MOTOR}/v1/saude`);
  if (!SEM_BUILD) {
    const b = spawnSync('nice', ['-n', '5', 'npx', 'next', 'build'], { cwd: WEB, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, encoding: 'utf8' });
    ok('next build', b.status === 0, b.status === 0 ? '' : (b.stdout + b.stderr).slice(-800));
    if (b.status !== 0) throw new Error('build falhou');
  }

  // ================= A. supabase + JWKS =================
  console.log('\n— A. modo supabase, JWT conferido pelo JWKS (ES256)');
  let supa = await subirSupabase({ FALSO_ALG: 'ES256' });
  let site = await subirSite({ EDITOR_AUTH: 'supabase', SUPABASE_URL: SUPA, SUPABASE_ANON_KEY: ANON, EDITOR_EMAILS_PERMITIDOS: LISTA });
  {
    const r1 = await fetch(`${BASE}/projetos`, { redirect: 'manual' });
    const r2 = await fetch(`${BASE}/api/motor/v1/projetos`);
    const r3 = await fetch(`${BASE}/`, { redirect: 'manual' });
    ok('sem sessão: /projetos e / redirecionam para /entrar, API do motor 401', redireciona(r1) && redireciona(r3) && r2.status === 401,
      `/projetos ${r1.status}→${r1.headers.get('location')}, / ${r3.status}, api ${r2.status}`);
    const html = await (await fetch(`${BASE}/entrar`)).text();
    ok('tela de entrar pede e-mail e senha', html.includes('type="email"') && html.includes('type="password"') && !html.includes(ANON));

    const antes = await chamadas();
    const errada = await entrar({ email: 'dono@creat.test', senha: 'senha-que-nao-e' });
    const cErrada = await errada.json();
    const fora = await entrar({ email: 'intruso@creat.test', senha: 'senha-intruso' });
    const cFora = await fora.json();
    const depois = await chamadas();
    ok('senha errada: 401 sem cookie', errada.status === 401 && !cookieDe(errada).linha, `${errada.status} "${cErrada.erro}"`);
    ok('conta válida FORA da lista: 401, mesma mensagem, Supabase nem é chamado',
      fora.status === 401 && !cookieDe(fora).linha && cFora.erro === cErrada.erro && !depois.porEmail['intruso@creat.test'] && depois.token === antes.token + 1,
      `${fora.status} "${cFora.erro}", chamadas ao /token: ${depois.token - antes.token}`);
    const forj = await entrar({ email: 'forjado@creat.test', senha: 'senha-forjado' });
    ok('token assinado por outra chave: recusado sem cookie', forj.status >= 400 && !cookieDe(forj).linha, `${forj.status}`);
    const troca = await entrar({ email: 'troca@creat.test', senha: 'senha-troca' });
    ok('token de outra conta (fora da lista): recusado sem cookie', troca.status === 401 && !cookieDe(troca).linha, `${troca.status}`);
    const inst = await entrar({ email: 'instavel@creat.test', senha: 'senha-instavel' });
    const lim = await entrar({ email: 'limitado@creat.test', senha: 'senha-limitado' });
    ok('Supabase com erro: 502; Supabase limitando: 429; nenhum com cookie', inst.status === 502 && lim.status === 429 && !cookieDe(inst).linha && !cookieDe(lim).linha,
      `${inst.status} / ${lim.status}`);
    const t0 = (await chamadas()).token;
    const outra = await entrar({ email: 'dono@creat.test', senha: 'senha-dono' }, { origem: 'https://site-malicioso.example' });
    ok('POST de outra origem: 403 e o Supabase não é chamado', outra.status === 403 && (await chamadas()).token === t0, `${outra.status}`);
    const invalido = await entrar({ email: 'sem-arroba', senha: 'x' });
    ok('e-mail inválido na borda: 400', invalido.status === 400, `${invalido.status}`);

    const certo = await entrar({ email: 'DONO@creat.test ', senha: 'senha-dono' });
    const ck = cookieDe(certo);
    const atr = ck.linha.toLowerCase();
    ok('login certo: 200 e cookie v2 HttpOnly, SameSite=Lax, Path=/ (sem Secure em http)',
      certo.status === 200 && ck.valor.startsWith('v2.') && atr.includes('httponly') && atr.includes('samesite=lax') && atr.includes('path=/') && !atr.includes('secure'),
      ck.linha.replace(/=v2\.[^;]+/, '=v2.…'));
    const seguro = cookieDe(await entrar({ email: 'dono@creat.test', senha: 'senha-dono' }, { https: true }));
    ok('atrás de HTTPS o cookie sai Secure', seguro.linha.toLowerCase().includes('secure'));
    await dormir(300);
    ok('sessão do Supabase encerrada logo após o login (logout local)', (await chamadas()).logout >= 2);

    const pag = await fetch(`${BASE}/projetos`, comCookie(ck.valor));
    const api = await fetch(`${BASE}/api/motor/v1/projetos`, comCookie(ck.valor));
    ok('com sessão: /projetos abre e a API do motor responde', pag.status === 200 && api.status === 200, `${pag.status} / ${api.status}`);
    const adult = ck.valor.slice(0, -2) + (ck.valor.endsWith('AA') ? 'BB' : 'AA');
    const [, exp, nonce] = ck.valor.split('.');
    const v1 = assinar(`v1.${exp}.${nonce}`);                                    // assinatura válida, modo errado
    const outroEmail = assinar(`v2.${exp}.${nonce}.${Buffer.from('intruso@creat.test').toString('base64url')}`);
    const rA = await fetch(`${BASE}/projetos`, comCookie(adult));
    const rB = await fetch(`${BASE}/projetos`, comCookie(v1));
    const rC = await fetch(`${BASE}/api/motor/v1/projetos`, comCookie(outroEmail));
    ok('cookie adulterado, cookie do modo senha e cookie de e-mail fora da lista: recusados', redireciona(rA) && redireciona(rB) && rC.status === 401,
      `${rA.status} ${rB.status} ${rC.status}`);

    const sair = await fetch(`${BASE}/api/sair`, { method: 'POST', ...comCookie(ck.valor) });
    const apagou = cookieDe(sair).linha.toLowerCase();
    const depoisSair = await fetch(`${BASE}/projetos`, comCookie(ck.valor));
    const apiSair = await fetch(`${BASE}/api/motor/v1/projetos`, comCookie(ck.valor));
    const seguroAinda = await fetch(`${BASE}/projetos`, comCookie(seguro.valor));
    ok('sair: 303 para /entrar, apaga o cookie e o MESMO cookie deixa de valer no servidor',
      sair.status === 303 && (sair.headers.get('location') ?? '') === '/entrar' && apagou.includes('max-age=0') && redireciona(depoisSair) && apiSair.status === 401,
      `${sair.status}, depois: ${depoisSair.status}/${apiSair.status}`);
    ok('sair de uma sessão não derruba a outra', seguroAinda.status === 200, `${seguroAinda.status}`);
    const sairFora = await fetch(`${BASE}/api/sair`, { method: 'POST', headers: { origin: 'https://site-malicioso.example', cookie: `ec_sessao=${encodeURIComponent(seguro.valor)}` }, redirect: 'manual' });
    ok('sair vindo de outra origem: 403 e a sessão continua', sairFora.status === 403 && (await fetch(`${BASE}/projetos`, comCookie(seguro.valor))).status === 200);

    // limite por e-mail: 8 erros, cada um de um IP diferente → o 9º é barrado mesmo com a senha certa
    for (let i = 0; i < 8; i++) await entrar({ email: 'forjado@creat.test', senha: 'errada' });
    const barrado = await entrar({ email: 'forjado@creat.test', senha: 'senha-forjado' });
    ok('limite de tentativas por e-mail (IP girando): 429', barrado.status === 429, `${barrado.status}`);
    // limite por IP: 8 erros do mesmo IP
    for (let i = 0; i < 8; i++) await entrar({ email: `quem${i}@creat.test`, senha: 'errada' }, { ip: '10.8.8.8' });
    const ipBarrado = await entrar({ email: 'troca@creat.test', senha: 'qualquer' }, { ip: '10.8.8.8' });
    ok('limite de tentativas por IP: 429', ipBarrado.status === 429, `${ipBarrado.status}`);
  }
  // navegador: preencher e entrar como uma pessoa
  try {
    const { chromium } = await import('playwright');
    const nav = await chromium.launch();
    try {
      const pg = await (await nav.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR', extraHTTPHeaders: { 'x-real-ip': '10.7.7.7' } })).newPage();
      const erros = [];
      pg.on('pageerror', (e) => erros.push(String(e)));
      await pg.goto(`${BASE}/projetos`);
      const caiuEmEntrar = pg.url().endsWith('/entrar');
      await pg.fill('input[name=email]', 'dono@creat.test');
      await pg.fill('input[name=senha]', 'errada');
      await pg.click('button[type=submit]');
      const msg = await pg.locator('#erro-entrar').textContent({ timeout: 10000 });
      await pg.fill('input[name=senha]', 'senha-dono');
      await pg.click('button[type=submit]');
      await pg.waitForURL('**/projetos', { timeout: 15000 });
      const ckNav = (await pg.context().cookies()).find((c) => c.name === 'ec_sessao');
      ok('navegador (390 px): redireciona, mostra o erro, entra e recebe cookie HttpOnly', caiuEmEntrar && /incorretos/.test(msg ?? '') && ckNav?.httpOnly && erros.length === 0,
        `erro na tela: "${msg}"${erros.length ? `, erros JS: ${erros.join(' | ')}` : ''}`);
    } finally {
      await nav.close();
    }
  } catch (e) {
    ok('navegador (Playwright)', false, String(e).slice(0, 300));
  }
  await parar(site);
  await parar(supa);

  // ================= B. supabase + segredo HS256 =================
  console.log('\n— B. modo supabase, JWT conferido com SUPABASE_JWT_SECRET (HS256, JWKS vazio)');
  supa = await subirSupabase({ FALSO_ALG: 'HS256', FALSO_JWT_SEGREDO: SEGREDO_JWT });
  site = await subirSite({ EDITOR_AUTH: 'supabase', SUPABASE_URL: SUPA, SUPABASE_ANON_KEY: ANON, EDITOR_EMAILS_PERMITIDOS: LISTA, SUPABASE_JWT_SECRET: SEGREDO_JWT });
  {
    const certo = await entrar({ email: 'dono@creat.test', senha: 'senha-dono' });
    const ck = cookieDe(certo);
    ok('HS256: login certo entra', certo.status === 200 && ck.valor.startsWith('v2.') && (await fetch(`${BASE}/projetos`, comCookie(ck.valor))).status === 200, `${certo.status}`);
    const forj = await entrar({ email: 'forjado@creat.test', senha: 'senha-forjado' });
    ok('HS256: token ES256 de outra chave recusado', forj.status >= 400 && !cookieDe(forj).linha, `${forj.status}`);
  }
  await parar(site);

  // ================= C. supabase sem lista =================
  console.log('\n— C. modo supabase SEM EDITOR_EMAILS_PERMITIDOS');
  site = await subirSite({ EDITOR_AUTH: 'supabase', SUPABASE_URL: SUPA, SUPABASE_ANON_KEY: ANON });
  {
    const t0 = (await chamadas()).token;
    const r = await entrar({ email: 'dono@creat.test', senha: 'senha-dono' });
    const c = await r.json();
    const html = await (await fetch(`${BASE}/entrar`)).text();
    ok('sem lista: login recusa tudo (503), não chama o Supabase e a página avisa',
      r.status === 503 && /EDITOR_EMAILS_PERMITIDOS/.test(c.erro) && (await chamadas()).token === t0 && html.includes('EDITOR_EMAILS_PERMITIDOS') && !html.includes('type="email"'),
      `${r.status} "${c.erro}"`);
  }
  await parar(site);
  await parar(supa);

  // ================= D. modo senha (padrão) =================
  console.log('\n— D. EDITOR_AUTH ausente: modo senha de antes');
  const SENHA = `aceite-${randomBytes(6).toString('hex')}`;
  const sal = randomBytes(16);
  const hash = ['scrypt', 32768, 8, 1, sal.toString('base64'), scryptSync(SENHA, sal, 32, { N: 32768, r: 8, p: 1, maxmem: 64 << 20 }).toString('base64')].join(':');
  site = await subirSite({ EDITOR_AUTH: '', EDITOR_SENHA_HASH: hash, EDITOR_EMAILS_PERMITIDOS: LISTA });
  {
    const html = await (await fetch(`${BASE}/entrar`)).text();
    const errada = await entrar({ senha: 'nao-e' });
    const certo = await entrar({ senha: SENHA });
    const ck = cookieDe(certo);
    const v2 = assinar(`v2.${Math.floor(Date.now() / 1000) + 3600}.abc.${Buffer.from('dono@creat.test').toString('base64url')}`);
    ok('modo senha: formulário só com senha, senha errada 401, certa entra com cookie v1, cookie v2 não vale',
      !html.includes('type="email"') && html.includes('Senha da casa') && errada.status === 401 && certo.status === 200 && ck.valor.startsWith('v1.')
        && (await fetch(`${BASE}/projetos`, comCookie(ck.valor))).status === 200 && redireciona(await fetch(`${BASE}/projetos`, comCookie(v2))),
      `${errada.status} / ${certo.status}`);
  }
  await parar(site);
  codigo = resultados.every((r) => r.passou) ? 0 : 1;
} catch (e) {
  ok('aceite rodou até o fim', false, String(e?.stack ?? e).slice(0, 800));
} finally {
  if (!MANTER) for (const p of filhos) { try { process.kill(-p.pid, 'SIGTERM'); } catch { /* já saiu */ } }
}
const passou = resultados.filter((r) => r.passou).length;
console.log(`\n${codigo === 0 ? 'ACEITE AUTH OK' : 'ACEITE AUTH FALHOU'}: ${passou}/${resultados.length} conferências · logs em ${SCRATCH}`);
process.exit(codigo);
