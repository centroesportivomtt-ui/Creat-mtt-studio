// Sessão do Editor creat.MTT. Dois modos de entrar (EDITOR_AUTH), a mesma sessão: cookie HttpOnly assinado (HMAC-SHA256).
// - senha (padrão): senha única em scrypt. Hash (EDITOR_SENHA_HASH): scrypt:N:r:p:salBase64:hashBase64 (`pnpm senha`).
//   Cookie: v1.<expira-em-segundos>.<nonce>.<assinatura base64url>.
// - supabase: e-mail + senha no Supabase Auth (lib/supabase.ts), só para quem está em EDITOR_EMAILS_PERMITIDOS.
//   Cookie: v2.<expira>.<nonce>.<e-mail base64url>.<assinatura>. A lista é conferida de novo a CADA requisição:
//   tirou o e-mail da lista, a sessão cai na hora. Cookie de um modo não vale no outro.
// "Sair" revoga o nonce no processo (globalThis); trocar EDITOR_SEGREDO_SESSAO derruba todas as sessões.
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { configSupabase, emailPermitido, emailsPermitidos, normalizarEmail } from '@/lib/supabase';

export const COOKIE = 'ec_sessao';
// 30 dias no modo senha (o dono usa no celular e não quer digitar senha toda hora); 7 dias no modo supabase:
// na Vercel o "Sair" e o limite de tentativas valem só na instância que atendeu (memória do processo), então o
// cookie dura menos. Ver docs/AUTH.md.
const duracaoS = () => (modoAuth() === 'supabase' ? 7 : 30) * 24 * 3600;

function scrypt(senha: string, sal: Buffer, tamanho: number, opcoes: ScryptOptions): Promise<Buffer> {
  return new Promise((ok, falha) => scryptCb(senha, sal, tamanho, opcoes, (e, k) => (e ? falha(e) : ok(k))));
}

export type ModoAuth = 'senha' | 'supabase';

/** EDITOR_AUTH: 'senha' (padrão) | 'supabase'. Valor desconhecido = null (o login recusa e avisa). */
export function modoAuth(): ModoAuth | null {
  const m = (process.env.EDITOR_AUTH ?? '').trim().toLowerCase();
  if (m === '' || m === 'senha') return 'senha';
  if (m === 'supabase') return 'supabase';
  return null;
}

export function configuracaoPronta(): { ok: boolean; falta: string[]; modo: ModoAuth | null } {
  const falta: string[] = [];
  const modo = modoAuth();
  if (modo === null) falta.push("EDITOR_AUTH válido ('senha' ou 'supabase')");
  if (modo === 'senha' && !lerHash()) falta.push('EDITOR_SENHA_HASH');
  if (modo === 'supabase') {
    if (!configSupabase()) falta.push('SUPABASE_URL (https) e SUPABASE_ANON_KEY');
    if (emailsPermitidos().size === 0) falta.push('EDITOR_EMAILS_PERMITIDOS (sem a lista ninguém entra)');
  }
  if ((process.env.EDITOR_SEGREDO_SESSAO ?? '').length < 32) falta.push('EDITOR_SEGREDO_SESSAO (32+ caracteres)');
  return { ok: falta.length === 0, falta, modo };
}

function lerHash() {
  const bruto = (process.env.EDITOR_SENHA_HASH ?? '').trim();
  const p = bruto.split(':');
  if (p.length !== 6 || p[0] !== 'scrypt') return null;
  const [N, r, pp] = p.slice(1, 4).map(Number);
  if (![N, r, pp].every(Number.isInteger)) return null;
  return { N, r, p: pp, sal: Buffer.from(p[4], 'base64'), hash: Buffer.from(p[5], 'base64') };
}

export async function gerarHash(senha: string): Promise<string> {
  const N = 32768, r = 8, p = 1;
  const sal = randomBytes(16);
  const k = await scrypt(senha, sal, 32, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return ['scrypt', N, r, p, sal.toString('base64'), k.toString('base64')].join(':');
}

export async function conferirSenha(senha: string): Promise<boolean> {
  const h = lerHash();
  if (!h || typeof senha !== 'string' || senha.length === 0 || senha.length > 256) return false;
  const k = await scrypt(senha, h.sal, h.hash.length, { N: h.N, r: h.r, p: h.p, maxmem: 256 * 1024 * 1024 });
  return k.length === h.hash.length && timingSafeEqual(k, h.hash);
}

function segredo(): string {
  const s = process.env.EDITOR_SEGREDO_SESSAO ?? '';
  if (s.length < 32) throw new Error('EDITOR_SEGREDO_SESSAO ausente ou curto (mínimo 32 caracteres)');
  return s;
}

function assinar(corpo: string): string {
  return createHmac('sha256', segredo()).update(corpo).digest('base64url');
}

/** Sessão nova. No modo supabase, `email` é obrigatório (vai assinado no cookie). */
export function criarToken(agora = Date.now(), email?: string): { valor: string; maxAge: number } {
  const duracao = duracaoS();
  const expira = Math.floor(agora / 1000) + duracao;
  const nonce = randomBytes(9).toString('base64url');
  let corpo = `v1.${expira}.${nonce}`;
  if (modoAuth() === 'supabase') {
    const e = normalizarEmail(email);
    if (!e) throw new Error('sessão do modo supabase precisa do e-mail');
    corpo = `v2.${expira}.${nonce}.${Buffer.from(e).toString('base64url')}`;
  }
  return { valor: `${corpo}.${assinar(corpo)}`, maxAge: duracao };
}

type Sessao = { versao: 'v1' | 'v2'; expira: number; nonce: string; email: string | null };

/** Confere assinatura, validade, modo, revogação e (modo supabase) a lista de permissão. */
export function lerSessao(valor: string | undefined | null, agora = Date.now()): Sessao | null {
  if (!valor || valor.length > 600) return null;
  const i = valor.lastIndexOf('.');
  if (i < 0) return null;
  const corpo = valor.slice(0, i);
  const assinatura = Buffer.from(valor.slice(i + 1));
  const partes = corpo.split('.');
  const [versao, expira, nonce] = partes;
  if (!/^\d+$/.test(expira ?? '') || !nonce) return null;
  const modo = modoAuth();
  if (!((modo === 'senha' && versao === 'v1' && partes.length === 3) || (modo === 'supabase' && versao === 'v2' && partes.length === 4))) return null;
  let esperado: Buffer;
  try {
    esperado = Buffer.from(assinar(corpo));
  } catch {
    return null;
  }
  if (assinatura.length !== esperado.length || !timingSafeEqual(assinatura, esperado)) return null;
  if (Number(expira) * 1000 <= agora || revogado(nonce, agora)) return null;
  let email: string | null = null;
  if (versao === 'v2') {
    email = normalizarEmail(Buffer.from(partes[3], 'base64url').toString('utf8'));
    if (!email || !emailPermitido(email)) return null;
  }
  return { versao: versao as Sessao['versao'], expira: Number(expira), nonce, email };
}

export function tokenValido(valor: string | undefined | null, agora = Date.now()): boolean {
  return lerSessao(valor, agora) !== null;
}

// Revogação ("Sair"): nonce → expiração, em globalThis (rotas e páginas do Next podem ter cópias deste módulo).
// Vive no processo: um reinício esquece a lista; para derrubar tudo de vez, troque EDITOR_SEGREDO_SESSAO.
const G = globalThis as unknown as { __ecRevogados?: Map<string, number> };
function revogados(): Map<string, number> {
  G.__ecRevogados ??= new Map();
  return G.__ecRevogados;
}
function revogado(nonce: string, agora: number): boolean {
  const ate = revogados().get(nonce);
  return ate !== undefined && ate * 1000 > agora;
}
export function revogarToken(valor: string | undefined | null, agora = Date.now()) {
  const s = lerSessao(valor, agora);
  if (!s) return;
  const m = revogados();
  if (m.size > 10000) for (const [k, ate] of m) if (ate * 1000 <= agora) m.delete(k);
  m.set(s.nonce, s.expira);
}

/** E-mail da sessão atual (modo supabase) ou null. */
export async function emailDaSessao(): Promise<string | null> {
  const c = await cookies();
  return lerSessao(c.get(COOKIE)?.value)?.email ?? null;
}

/** Para Server Components e rotas: há sessão válida no cookie? */
export async function temSessao(): Promise<boolean> {
  const c = await cookies();
  return tokenValido(c.get(COOKIE)?.value);
}

/** Para rotas que recebem Request diretamente (tus, proxy). */
export function sessaoDaRequisicao(req: Request): boolean {
  const bruto = req.headers.get('cookie') ?? '';
  for (const parte of bruto.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === COOKIE) return tokenValido(decodeURIComponent(v.join('=')));
  }
  return false;
}

/** Cookie seguro só quando a página chegou por HTTPS (atrás do proxy de produção). */
export async function cookieSeguro(): Promise<boolean> {
  const h = await headers();
  return (h.get('x-forwarded-proto') ?? '').split(',')[0].trim() === 'https';
}

/** Bloqueia POST vindo de outro site (além do SameSite=Lax do cookie). */
export function mesmaOrigem(req: Request): boolean {
  const origem = req.headers.get('origin');
  if (!origem) return true; // navegadores mandam Origin em POST; ferramentas de linha de comando não têm cookie de sessão
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0].trim();
  try {
    return new URL(origem).host === host;
  } catch {
    return false;
  }
}

// Tentativas de senha por IP (memória do processo): 8 a cada 10 min.
const tentativas = new Map<string, number[]>();
export function podeTentar(ip: string, limite = 8, agora = Date.now()): boolean {
  const janela = 10 * 60 * 1000;
  const lista = (tentativas.get(ip) ?? []).filter((t) => agora - t < janela);
  tentativas.set(ip, lista);
  if (tentativas.size > 5000) { const g = tentativas.get('*todas*'); tentativas.clear(); if (g) tentativas.set('*todas*', g); }
  return lista.length < limite;
}
export function registrarTentativa(ip: string, agora = Date.now()) {
  tentativas.set(ip, [...(tentativas.get(ip) ?? []), agora]);
}
export function limparTentativas(ip: string) {
  tentativas.delete(ip);
}
