// Proxy autenticado site -> motor. Só quem tem sessão passa; o MOTOR_TOKEN fica no servidor.
// Repassa Range (player) e SSE (status ao vivo) em streaming, sem bufferizar.
import { NextResponse } from 'next/server';
import { MOTOR_URL, cabecalhosMotor } from '@/lib/motor';
import { mesmaOrigem, sessaoDaRequisicao } from '@/lib/sessao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PERMITIDAS = /^v1\/(saude|memoria|referencias|backup|backup\/config|backup\/rodar|projetos|projetos\/p_[a-z0-9]{4,40}(\/[A-Za-z0-9_\-./]+)?|arquivos\/[A-Za-z0-9_\-./]+)$/;
const ENTRA = ['content-type', 'range', 'if-range', 'last-event-id', 'accept'];
const SAI = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'last-modified', 'etag', 'content-disposition'];

type Ctx = { params: Promise<{ rota: string[] }> };

async function repassar(req: Request, ctx: Ctx): Promise<Response> {
  if (!sessaoDaRequisicao(req)) return NextResponse.json({ detail: 'entre com a senha de novo' }, { status: 401 });
  if (req.method === 'POST' && !mesmaOrigem(req)) return NextResponse.json({ detail: 'origem não permitida' }, { status: 403 });
  const { rota } = await ctx.params;
  const caminho = rota.join('/');
  if (!PERMITIDAS.test(caminho) || rota.some((p) => p === '..' || p === '.')) {
    return NextResponse.json({ detail: 'rota do motor não permitida' }, { status: 404 });
  }
  const busca = new URL(req.url).search;
  const h = new Headers();
  for (const k of ENTRA) {
    const v = req.headers.get(k);
    if (v) h.set(k, v);
  }
  let corpo: ArrayBuffer | undefined;
  if (req.method === 'POST') {
    const tamanho = Number(req.headers.get('content-length') ?? 0);
    if (tamanho > 1_000_000) return NextResponse.json({ detail: 'corpo grande demais' }, { status: 413 });
    corpo = await req.arrayBuffer();
    if (corpo.byteLength > 1_000_000) return NextResponse.json({ detail: 'corpo grande demais' }, { status: 413 });
  }
  let r: Response;
  try {
    r = await fetch(`${MOTOR_URL}/${caminho}${busca}`, {
      method: req.method, headers: cabecalhosMotor(h), body: corpo, cache: 'no-store', signal: req.signal, redirect: 'manual',
    });
  } catch {
    return NextResponse.json({ detail: 'o motor está fora do ar agora; tentando de novo' }, { status: 503 });
  }
  const sai = new Headers();
  for (const k of SAI) {
    const v = r.headers.get(k);
    if (v) sai.set(k, v);
  }
  if ((r.headers.get('content-type') ?? '').startsWith('text/event-stream')) {
    sai.set('cache-control', 'no-cache, no-transform');
    sai.set('x-accel-buffering', 'no');
  }
  return new Response(req.method === 'HEAD' ? null : r.body, { status: r.status, headers: sai });
}

export const GET = repassar;
export const HEAD = repassar;
export const POST = repassar;
