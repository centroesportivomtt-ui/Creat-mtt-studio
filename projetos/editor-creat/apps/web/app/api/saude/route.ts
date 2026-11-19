import { motorJson } from '@/lib/motor';

export const dynamic = 'force-dynamic';

// Saúde pública do editor (sem login): mostra só se o site e o motor estão no ar, quais provedores estão ligados e o estado da
// chave do cérebro (ok/falha/ausente). Nenhum segredo, nenhum dado de projeto.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const chave = q.get('chave') === '1';
  const direcao = q.get('direcao') === '1';
  const olho = q.get('olho') === '1';
  const r = await motorJson<{ ok: boolean; provedores: Record<string, string>; chave_cerebro?: unknown; direcao_real?: unknown; olho_ia?: unknown; backup?: unknown }>(`/v1/saude?chave=${chave}&direcao=${direcao}&olho=${olho}`);
  const versao = (process.env.RAILWAY_GIT_COMMIT_SHA ?? '').slice(0, 7) || null;   // qual commit está no ar (para conferir o deploy)
  const corpo = r.ok ? { site: 'ok', versao, motor: 'ok', provedores: r.dados.provedores, chave_cerebro: r.dados.chave_cerebro, direcao_real: r.dados.direcao_real, olho_ia: r.dados.olho_ia, backup: r.dados.backup } : { site: 'ok', versao, motor: 'fora', erro: r.erro };
  return Response.json(corpo, { status: r.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
