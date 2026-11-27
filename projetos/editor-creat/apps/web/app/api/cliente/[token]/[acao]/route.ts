// Rota PÚBLICA do link de aprovação (sem sessão): só vídeo e capa daquela versão, e a resposta do cliente.
// O navegador do cliente nunca fala com o motor; quem fala é este servidor, com o MOTOR_TOKEN.
// Limites por IP: link inexistente conta como tentativa (20 por 10 min); resposta, 10 por 10 min.
import { NextResponse } from 'next/server';
import { MOTOR_URL, cabecalhosMotor } from '@/lib/motor';
import { ipDe, mesmaOrigem, podeTentar, registrarTentativa } from '@/lib/sessao';
import { RE_TOKEN_CLIENTE } from '@/lib/cliente';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string; acao: string }> };
const SAI = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag'];
const negar = (status: number, detail: string) => NextResponse.json({ detail }, { status, headers: { 'cache-control': 'no-store' } });

async function repassar(req: Request, ctx: Ctx): Promise<Response> {
  const { token, acao } = await ctx.params;
  const ip = `cliente:${ipDe(req)}`;
  if (!podeTentar(ip, 20)) return negar(429, 'muitas tentativas; espere 10 minutos');
  const arquivo = acao === 'video' || acao === 'capa';
  if (!RE_TOKEN_CLIENTE.test(token) || !(arquivo ? req.method !== 'POST' : acao === 'responder' && req.method === 'POST')) {
    registrarTentativa(ip);
    return negar(404, 'link não encontrado');
  }
  const h = new Headers();
  let corpo: string | undefined;
  if (arquivo) {
    const range = req.headers.get('range');
    if (range) h.set('range', range);
  } else {
    if (!mesmaOrigem(req)) return negar(403, 'origem não permitida');
    const resp = `clienteresp:${ipDe(req)}`;
    if (!podeTentar(resp, 10)) return negar(429, 'muitas respostas seguidas; espere 10 minutos');
    registrarTentativa(resp);
    if (Number(req.headers.get('content-length') ?? 0) > 4000) return negar(413, 'texto grande demais');
    corpo = await req.text();
    if (corpo.length > 4000) return negar(413, 'texto grande demais');
    h.set('content-type', 'application/json');
  }
  let r: Response;
  try {
    r = await fetch(`${MOTOR_URL}/v1/cliente/${token}/${acao}`, {
      method: req.method, headers: cabecalhosMotor(h), body: corpo, cache: 'no-store', signal: req.signal,
      // armazenamento remoto (R2) responde com redirecionamento pré-assinado: quem segue é o servidor, a URL não chega ao cliente
      redirect: arquivo ? 'follow' : 'manual',
    });
  } catch {
    return negar(503, 'fora do ar agora; tente de novo em instantes');
  }
  if (r.status === 404) registrarTentativa(ip);
  const sai = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  for (const k of SAI) {
    const v = r.headers.get(k);
    if (v) sai.set(k, v);
  }
  return new Response(req.method === 'HEAD' ? null : r.body, { status: r.status, headers: sai });
}

export const GET = repassar;
export const HEAD = repassar;
export const POST = repassar;
