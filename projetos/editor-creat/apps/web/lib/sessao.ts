// Sessão do Editor creat.MTT: senha única (scrypt) + cookie HttpOnly assinado (HMAC-SHA256).
// Formato do hash (EDITOR_SENHA_HASH): scrypt:N:r:p:salBase64:hashBase64  (gere com `pnpm senha`).
// Cookie: v1.<expira-em-segundos>.<nonce>.<assinatura base64url> — sem estado no servidor.
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { cookies, headers } from 'next/headers';

export const COOKIE = 'ec_sessao';
const DURACAO_S = 30 * 24 * 3600; // 30 dias: o dono usa no celular e não quer digitar senha toda hora

function scrypt(senha: string, sal: Buffer, tamanho: number, opcoes: ScryptOptions): Promise<Buffer> {
  return new Promise((ok, falha) => scryptCb(senha, sal, tamanho, opcoes, (e, k) => (e ? falha(e) : ok(k))));
}

export function configuracaoPronta(): { ok: boolean; falta: string[] } {
  const falta: string[] = [];
  if (!lerHash()) falta.push('EDITOR_SENHA_HASH');
  if ((process.env.EDITOR_SEGREDO_SESSAO ?? '').length < 32) falta.push('EDITOR_SEGREDO_SESSAO (32+ caracteres)');
  return { ok: falta.length === 0, falta };
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

export function criarToken(agora = Date.now()): { valor: string; maxAge: number } {
  const corpo = `v1.${Math.floor(agora / 1000) + DURACAO_S}.${randomBytes(9).toString('base64url')}`;
  return { valor: `${corpo}.${assinar(corpo)}`, maxAge: DURACAO_S };
}

export function tokenValido(valor: string | undefined | null, agora = Date.now()): boolean {
  if (!valor || valor.length > 200) return false;
  const i = valor.lastIndexOf('.');
  if (i < 0) return false;
  const corpo = valor.slice(0, i);
  const assinatura = Buffer.from(valor.slice(i + 1));
  const [versao, expira] = corpo.split('.');
  if (versao !== 'v1' || !/^\d+$/.test(expira ?? '')) return false;
  let esperado: Buffer;
  try {
    esperado = Buffer.from(assinar(corpo));
  } catch {
    return false;
  }
  if (assinatura.length !== esperado.length || !timingSafeEqual(assinatura, esperado)) return false;
  return Number(expira) * 1000 > agora;
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

// IP para os limites de tentativa. O PRIMEIRO valor do X-Forwarded-For é do cliente (ele escolhe o que quiser):
// girando o cabeçalho, o limite virava infinito. Vale o que o proxy de produção põe: x-real-ip, ou o ÚLTIMO salto
// do X-Forwarded-For (quem acrescentou foi o nosso proxy).
export function ipDe(req: { headers: Headers }): string {
  const real = (req.headers.get('x-real-ip') ?? '').trim();
  if (real) return real;
  const saltos = (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return saltos.at(-1) || 'local';
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
