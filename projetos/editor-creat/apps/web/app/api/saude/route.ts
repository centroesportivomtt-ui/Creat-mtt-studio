import { motorJson } from '@/lib/motor';

export const dynamic = 'force-dynamic';

// Saúde pública do editor (sem login): mostra só se o site e o motor estão no ar, quais provedores estão ligados e o estado da
// chave do cérebro (ok/falha/ausente). Nenhum segredo, nenhum dado de projeto.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const chave = q.get('chave') === '1';
  const direcao = q.get('direcao') === '1';
  const r = await motorJson<{ ok: boolean; provedores: Record<string, string>; chave_cerebro?: unknown; direcao_real?: unknown }>(`/v1/saude?chave=${chave}&direcao=${direcao}`);
  const corpo = r.ok ? { site: 'ok', motor: 'ok', provedores: r.dados.provedores, chave_cerebro: r.dados.chave_cerebro, direcao_real: r.dados.direcao_real } : { site: 'ok', motor: 'fora', erro: r.erro };
  return Response.json(corpo, { status: r.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
