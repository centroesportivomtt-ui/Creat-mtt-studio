// Login pelo Supabase Auth (e-mail + senha), feito NO SERVIDOR do site. O navegador nunca vê a chave anon nem o
// token do Supabase: o site confere a senha lá, valida o JWT devolvido (HS256 com SUPABASE_JWT_SECRET, ou a chave
// pública do projeto pelo JWKS), confere a lista de permissão e emite a própria sessão (cookie assinado, lib/sessao).
// Logo depois encerra a sessão do Supabase (logout local): não fica refresh token esquecido por aí.
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from 'jose';

const TEMPO_LIMITE_MS = 8000;

export type ResultadoLogin =
  | { ok: true; email: string }
  | { ok: false; motivo: 'credenciais' | 'limite' | 'indisponivel' | 'token' };

export function configSupabase(): { url: string; anon: string; segredoJwt: string } | null {
  const url = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const anon = (process.env.SUPABASE_ANON_KEY ?? '').trim();
  if (!url || !anon || !urlAceitavel(url)) return null;
  return { url, anon, segredoJwt: process.env.SUPABASE_JWT_SECRET ?? '' };
}

/** https sempre; http só para 127.0.0.1/localhost (o Supabase falso dos testes). */
export function urlAceitavel(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:') return true;
    return u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname);
  } catch {
    return false;
  }
}

export function normalizarEmail(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null;
  const e = bruto.trim().toLowerCase();
  if (e.length < 3 || e.length > 254 || !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(e)) return null;
  return e;
}

/** EDITOR_EMAILS_PERMITIDOS: e-mails separados por vírgula (ou ponto e vírgula / espaço). Vazia = ninguém entra. */
export function emailsPermitidos(): Set<string> {
  return new Set(
    (process.env.EDITOR_EMAILS_PERMITIDOS ?? '')
      .split(/[,;\s]+/)
      .map((e) => normalizarEmail(e))
      .filter((e): e is string => Boolean(e)),
  );
}

export function emailPermitido(email: string | null | undefined): boolean {
  const e = normalizarEmail(email);
  return Boolean(e) && emailsPermitidos().has(e as string);
}

// JWKS em cache no processo (globalThis: as rotas do Next podem ter cópias separadas deste módulo).
type Jwks = ReturnType<typeof createRemoteJWKSet>;
const G = globalThis as unknown as { __ecJwks?: Map<string, Jwks> };
function jwks(url: string): Jwks {
  G.__ecJwks ??= new Map();
  let j = G.__ecJwks.get(url);
  if (!j) {
    j = createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`), { timeoutDuration: TEMPO_LIMITE_MS });
    G.__ecJwks.set(url, j);
  }
  return j;
}

async function emailDoToken(token: string, cfg: NonNullable<ReturnType<typeof configSupabase>>): Promise<string | null> {
  const opcoes = { issuer: `${cfg.url}/auth/v1`, audience: 'authenticated', clockTolerance: 30 };
  let claims: JWTPayload;
  try {
    if (cfg.segredoJwt) {
      ({ payload: claims } = await jwtVerify(token, new TextEncoder().encode(cfg.segredoJwt), { ...opcoes, algorithms: ['HS256'] }));
    } else {
      ({ payload: claims } = await jwtVerify(token, jwks(cfg.url), { ...opcoes, algorithms: ['ES256', 'RS256', 'EdDSA'] }));
    }
  } catch (e) {
    // Projeto com chave HS256 antiga e sem SUPABASE_JWT_SECRET: o JWKS não tem a chave. Quem confirma é o próprio
    // Supabase (GET /auth/v1/user com o token). Qualquer outro erro (assinatura, emissor, validade) recusa.
    if (!cfg.segredoJwt && (e instanceof errors.JWKSNoMatchingKey)) return emailPeloSupabase(token, cfg);
    console.warn(`[auth] token do Supabase recusado: ${(e as { code?: string }).code ?? (e as Error).name}`);
    return null;
  }
  if (claims.role !== undefined && claims.role !== 'authenticated') return null;
  return normalizarEmail(claims.email);
}

async function emailPeloSupabase(token: string, cfg: NonNullable<ReturnType<typeof configSupabase>>): Promise<string | null> {
  try {
    const r = await fetch(`${cfg.url}/auth/v1/user`, {
      headers: { apikey: cfg.anon, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS), redirect: 'error', cache: 'no-store',
    });
    if (!r.ok) {
      console.warn(`[auth] Supabase não confirmou o token (HTTP ${r.status})`);
      return null;
    }
    const u = (await r.json().catch(() => null)) as { email?: unknown } | null;
    return normalizarEmail(u?.email);
  } catch {
    return null;
  }
}

function encerrarNoSupabase(token: string, cfg: NonNullable<ReturnType<typeof configSupabase>>) {
  fetch(`${cfg.url}/auth/v1/logout?scope=local`, {
    method: 'POST', headers: { apikey: cfg.anon, authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS), redirect: 'error', cache: 'no-store',
  }).catch(() => { /* melhor esforço: o token expira sozinho */ });
}

export async function entrarComSenha(email: string, senha: string): Promise<ResultadoLogin> {
  const cfg = configSupabase();
  if (!cfg) return { ok: false, motivo: 'indisponivel' };
  let r: Response;
  try {
    r = await fetch(`${cfg.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: cfg.anon, 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: senha }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS), redirect: 'error', cache: 'no-store',
    });
  } catch {
    console.warn('[auth] Supabase não respondeu ao login');
    return { ok: false, motivo: 'indisponivel' };
  }
  if (r.status === 429) return { ok: false, motivo: 'limite' };
  if ([400, 401, 403, 422].includes(r.status)) return { ok: false, motivo: 'credenciais' };
  if (!r.ok) {
    console.warn(`[auth] Supabase devolveu HTTP ${r.status} no login`);
    return { ok: false, motivo: 'indisponivel' };
  }
  const corpo = (await r.json().catch(() => null)) as { access_token?: unknown } | null;
  const token = typeof corpo?.access_token === 'string' ? corpo.access_token : '';
  if (!token) return { ok: false, motivo: 'indisponivel' };
  const doToken = await emailDoToken(token, cfg);
  encerrarNoSupabase(token, cfg);
  if (!doToken) return { ok: false, motivo: 'token' };
  return { ok: true, email: doToken };
}
