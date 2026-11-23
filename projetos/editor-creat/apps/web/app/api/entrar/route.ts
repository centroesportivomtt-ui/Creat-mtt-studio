import { NextResponse } from 'next/server';
import {
  COOKIE, configuracaoPronta, conferirSenha, cookieSeguro, criarToken, ipDe,
  limparTentativas, mesmaOrigem, podeTentar, registrarTentativa,
} from '@/lib/sessao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
