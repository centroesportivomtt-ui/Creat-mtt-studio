import { NextResponse } from 'next/server';
import { COOKIE, mesmaOrigem } from '@/lib/sessao';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!mesmaOrigem(req)) return NextResponse.json({ erro: 'origem não permitida' }, { status: 403 });
  const res = NextResponse.redirect(new URL('/entrar', req.url), 303);
  res.cookies.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
