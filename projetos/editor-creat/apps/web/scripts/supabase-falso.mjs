#!/usr/bin/env node
// Supabase Auth FALSO (só para teste local; nada sai da máquina). Imita as rotas que o site usa:
//   POST /auth/v1/token?grant_type=password   (cabeçalho apikey obrigatório)
//   GET  /auth/v1/.well-known/jwks.json
//   GET  /auth/v1/user                         (confere o token, como o Supabase de verdade)
//   POST /auth/v1/logout
//   GET  /__falso/chamadas                     (contagem por rota e por e-mail, para o aceite conferir)
// Uso: FALSO_PORTA=54399 FALSO_ANON=x [FALSO_ALG=ES256|HS256 FALSO_JWT_SEGREDO=...] node scripts/supabase-falso.mjs
// Contas (senha = "senha-" + parte antes do @):
//   dono@creat.test       → conta válida (o aceite põe na lista de permissão)
//   intruso@creat.test    → conta válida, FORA da lista
//   forjado@creat.test    → devolve token assinado com chave que não é a do projeto
//   troca@creat.test      → devolve token válido, mas de outra conta (intruso)
//   instavel@creat.test   → HTTP 500;  limitado@creat.test → HTTP 429
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

const PORTA = Number(process.env.FALSO_PORTA || 54399);
const ANON = process.env.FALSO_ANON || 'anon-falsa';
const ALG = (process.env.FALSO_ALG || 'ES256').toUpperCase();
const SEGREDO = process.env.FALSO_JWT_SEGREDO || '';
const BASE = `http://127.0.0.1:${PORTA}`;
const ISS = `${BASE}/auth/v1`;

if (ALG === 'HS256' && SEGREDO.length < 32) throw new Error('FALSO_ALG=HS256 precisa de FALSO_JWT_SEGREDO com 32+ caracteres');
const par = await generateKeyPair('ES256', { extractable: true });
const intrusa = await generateKeyPair('ES256', { extractable: true });     // a chave "de outro projeto"
const KID = 'falsa-1';
const publica = { ...(await exportJWK(par.publicKey)), kid: KID, alg: 'ES256', use: 'sig' };
const chaveHs = new TextEncoder().encode(SEGREDO);

const contas = new Map(['dono', 'intruso', 'forjado', 'troca', 'instavel', 'limitado'].map((n) => [`${n}@creat.test`, { id: randomUUID(), senha: `senha-${n}` }]));
const chamadas = { token: 0, jwks: 0, user: 0, logout: 0, porEmail: {} };

async function assinar(email, { forjar = false } = {}) {
  const c = contas.get(email);
  const jwt = new SignJWT({ email, role: 'authenticated', aal: 'aal1', session_id: randomUUID() })
    .setIssuer(ISS).setAudience('authenticated').setSubject(c.id).setIssuedAt().setExpirationTime('1h');
  if (forjar) return jwt.setProtectedHeader({ alg: 'ES256', kid: KID }).sign(intrusa.privateKey);
  if (ALG === 'HS256') return jwt.setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).sign(chaveHs);
  return jwt.setProtectedHeader({ alg: 'ES256', kid: KID, typ: 'JWT' }).sign(par.privateKey);
}

async function conferir(token) {
  const { jwtVerify } = await import('jose');
  try {
    const chave = ALG === 'HS256' ? chaveHs : par.publicKey;
    return (await jwtVerify(token, chave, { issuer: ISS, audience: 'authenticated' })).payload;
  } catch {
    return null;
  }
}

function json(res, status, corpo) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(corpo === undefined ? '' : JSON.stringify(corpo));
}
async function lerCorpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  try { return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); } catch { return null; }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  try {
    if (url.pathname === '/__falso/chamadas') return json(res, 200, chamadas);
    if (url.pathname === '/auth/v1/.well-known/jwks.json') {
      chamadas.jwks++;
      return json(res, 200, { keys: ALG === 'HS256' ? [] : [publica] });       // projeto HS256: JWKS vazio
    }
    if (req.headers.apikey !== ANON) return json(res, 401, { message: 'Invalid API key' });
    if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
      chamadas.token++;
      if (url.searchParams.get('grant_type') !== 'password') return json(res, 400, { code: 400, error_code: 'unsupported_grant_type' });
      const corpo = await lerCorpo(req);
      const email = String(corpo?.email ?? '').toLowerCase();
      chamadas.porEmail[email] = (chamadas.porEmail[email] ?? 0) + 1;
      const c = contas.get(email);
      if (email === 'instavel@creat.test') return json(res, 500, { message: 'falha interna (falsa)' });
      if (email === 'limitado@creat.test') return json(res, 429, { code: 429, error_code: 'over_request_rate_limit' });
      if (!c || corpo?.password !== c.senha) {
        return json(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      }
      const token = email === 'forjado@creat.test' ? await assinar(email, { forjar: true })
        : email === 'troca@creat.test' ? await assinar('intruso@creat.test') : await assinar(email);
      return json(res, 200, {
        access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: randomUUID(),
        user: { id: c.id, email, aud: 'authenticated', role: 'authenticated' },
      });
    }
    if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
      chamadas.user++;
      const claims = await conferir(String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, ''));
      if (!claims) return json(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
      return json(res, 200, { id: claims.sub, email: claims.email, aud: 'authenticated', role: 'authenticated' });
    }
    if (url.pathname === '/auth/v1/logout' && req.method === 'POST') {
      chamadas.logout++;
      res.writeHead(204);
      return res.end();
    }
    json(res, 404, { message: 'rota não existe no Supabase falso' });
  } catch (e) {
    json(res, 500, { message: String(e) });
  }
}).listen(PORTA, '127.0.0.1', () => {
  console.log(`supabase falso em ${BASE} · ${ALG}`);
});
