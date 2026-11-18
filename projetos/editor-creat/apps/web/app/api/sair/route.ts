import { NextResponse } from 'next/server';
import { COOKIE, mesmaOrigem } from '@/lib/sessao';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!mesmaOrigem(req)) return NextResponse.json({ erro: 'origem não permitida' }, { status: 403 });
  // Location relativo: atrás de proxy, req.url pode ter o host interno.
  const res = new NextResponse(null, { status: 303, headers: { location: '/entrar' } });
  res.cookies.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
