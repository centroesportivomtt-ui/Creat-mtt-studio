import { motorJson } from '@/lib/motor';

export const dynamic = 'force-dynamic';

// Saúde pública do editor (sem login): mostra só se o site e o motor estão no ar, quais provedores estão ligados e o estado da
// chave do cérebro (ok/falha/ausente). Nenhum segredo, nenhum dado de projeto.
export async function GET(req: Request) {
  const chave = new URL(req.url).searchParams.get('chave') === '1';
  const r = await motorJson<{ ok: boolean; provedores: Record<string, string>; chave_cerebro?: unknown }>(`/v1/saude${chave ? '?chave=true' : ''}`);
  const corpo = r.ok ? { site: 'ok', motor: 'ok', provedores: r.dados.provedores, chave_cerebro: r.dados.chave_cerebro } : { site: 'ok', motor: 'fora', erro: r.erro };
  return Response.json(corpo, { status: r.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
