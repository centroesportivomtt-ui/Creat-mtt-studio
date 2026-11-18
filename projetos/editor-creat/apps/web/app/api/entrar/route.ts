import { NextResponse } from 'next/server';
import {
  COOKIE, configuracaoPronta, conferirSenha, cookieSeguro, criarToken,
  limparTentativas, mesmaOrigem, podeTentar, registrarTentativa,
} from '@/lib/sessao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// IP para o limite de tentativas. O PRIMEIRO valor do X-Forwarded-For é do cliente (ele escolhe o que quiser):
// girando o cabeçalho, o limite virava infinito. Vale o que o proxy de produção põe: x-real-ip, ou o ÚLTIMO salto
// do X-Forwarded-For (quem acrescentou foi o nosso proxy). Além disso há um limite global (todas as origens).
function ipDe(req: Request) {
  const real = (req.headers.get('x-real-ip') ?? '').trim();
  if (real) return real;
  const saltos = (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return saltos.at(-1) || 'local';
}
const GLOBAL = '*todas*';

export async function POST(req: Request) {
  if (!mesmaOrigem(req)) return NextResponse.json({ erro: 'origem não permitida' }, { status: 403 });
  const conf = configuracaoPronta();
  if (!conf.ok) {
    return NextResponse.json({ erro: `O site ainda não foi configurado: falta ${conf.falta.join(' e ')}.` }, { status: 503 });
  }
  const ip = ipDe(req);
  if (!podeTentar(ip) || !podeTentar(GLOBAL, 40)) {
    return NextResponse.json({ erro: 'Muitas tentativas. Espere 10 minutos e tente de novo.' }, { status: 429 });
  }
  const corpo = (await req.json().catch(() => null)) as { senha?: unknown } | null;
  const senha = typeof corpo?.senha === 'string' ? corpo.senha : '';
  if (!(await conferirSenha(senha))) {
    registrarTentativa(ip);
    registrarTentativa(GLOBAL);
    await new Promise((r) => setTimeout(r, 400)); // freia força bruta sem travar o servidor
    return NextResponse.json({ erro: 'Senha incorreta.' }, { status: 401 });
  }
  limparTentativas(ip);
  const t = criarToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, t.valor, {
    httpOnly: true, sameSite: 'lax', secure: await cookieSeguro(), path: '/', maxAge: t.maxAge,
  });
  return res;
}
