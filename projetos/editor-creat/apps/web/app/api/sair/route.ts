import { NextResponse } from 'next/server';
import { COOKIE, mesmaOrigem, revogarToken } from '@/lib/sessao';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!mesmaOrigem(req)) return NextResponse.json({ erro: 'origem não permitida' }, { status: 403 });
  // Invalida o cookie de verdade (nonce revogado no servidor), não só apaga do navegador.
  for (const parte of (req.headers.get('cookie') ?? '').split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === COOKIE) {
      try { revogarToken(decodeURIComponent(v.join('='))); } catch { /* cookie malformado: só apaga */ }
    }
  }
  // Location relativo: atrás de proxy, req.url pode ter o host interno.
  const res = new NextResponse(null, { status: 303, headers: { location: '/entrar' } });
  res.cookies.set(COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return res;
}
