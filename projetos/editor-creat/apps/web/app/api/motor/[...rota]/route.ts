// Proxy autenticado site -> motor. Só quem tem sessão passa; o MOTOR_TOKEN fica no servidor.
// Repassa Range (player) e SSE (status ao vivo) em streaming, sem bufferizar.
// Serverless (Vercel): cada conexão SSE dura no máximo JANELA_SSE_S (o motor recebe `ate=` e o proxy também corta,
// sempre entre eventos), com batimento a cada 15 s; o EventSource reconecta sozinho com Last-Event-ID.
import { NextResponse } from 'next/server';
import { JANELA_SSE_S, MOTOR_URL, cabecalhosMotor, faltaConfigMotor, sseComBatimento } from '@/lib/motor';
import { mesmaOrigem, sessaoDaRequisicao } from '@/lib/sessao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // = LIMITE_FUNCAO_S (lib/motor.ts) e vercel.json; o Next exige número literal aqui

// Cada segmento é conferido DEPOIS de decodificado (o Next transforma %2F em '/' dentro do segmento): só letras,
// números, '_', '-' e '.', nunca só pontos. A regex abaixo vale para o caminho já montado de segmentos limpos.
const SEGMENTO = /^[A-Za-z0-9_\-.]+$/;
const SEG = '[A-Za-z0-9_\\-.]+';
const PERMITIDAS = new RegExp(`^v1\\/(saude|memoria|projetos|projetos\\/p_[a-z0-9]{4,40}(\\/${SEG})*|arquivos(\\/${SEG})+)$`);

/** Caminho seguro para o motor, ou null. */
function caminhoSeguro(rota: string[]): string | null {
  if (!rota.length || rota.length > 40) return null;
  for (const p of rota) {
    if (!SEGMENTO.test(p) || /^\.+$/.test(p) || /[/\\%]/.test(p)) return null;
  }
  const caminho = rota.join('/');
  if (!PERMITIDAS.test(caminho)) return null;
  // última trava: o URL montado não pode ser normalizado para outro lugar
  try {
    if (new URL(caminho, 'http://motor.invalid/').pathname !== `/${caminho}`) return null;
  } catch {
    return null;
  }
  return caminho;
}
const EVENTOS = /^v1\/projetos\/p_[a-z0-9]{4,40}\/eventos$/;
const ENTRA = ['content-type', 'range', 'if-range', 'last-event-id', 'accept'];
const SAI = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'last-modified', 'etag', 'content-disposition'];

type Ctx = { params: Promise<{ rota: string[] }> };

async function repassar(req: Request, ctx: Ctx): Promise<Response> {
  if (!(await sessaoDaRequisicao(req))) return NextResponse.json({ detail: 'entre com a senha de novo' }, { status: 401 });
  if (req.method === 'POST' && !mesmaOrigem(req)) return NextResponse.json({ detail: 'origem não permitida' }, { status: 403 });
  const falta = faltaConfigMotor();
  if (falta) return NextResponse.json({ detail: falta }, { status: 503 });
  const { rota } = await ctx.params;
  const caminho = caminhoSeguro(rota);
  if (!caminho) return NextResponse.json({ detail: 'rota do motor não permitida' }, { status: 404 });
  const alvo = new URL(`${MOTOR_URL}/${caminho}`);
  if (alvo.pathname !== `${new URL(MOTOR_URL).pathname.replace(/\/+$/, '')}/${caminho}`) {
    return NextResponse.json({ detail: 'rota do motor não permitida' }, { status: 404 });
  }
  const url = new URL(req.url);
  const sse = req.method === 'GET' && EVENTOS.test(caminho);
  if (sse) {
    // o motor fecha a conexão antes do limite da função (e manda retry: 2000); o proxy garante o mesmo do lado de cá
    const pedido = Number(url.searchParams.get('ate'));
    url.searchParams.set('ate', String(Number.isFinite(pedido) && pedido > 0 ? Math.min(pedido, JANELA_SSE_S) : JANELA_SSE_S));
  }
  const busca = url.search;
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
  // arquivo grande no R2: o motor pode responder com redirecionamento para a URL pré-assinada (o vídeo não passa
  // pela função da Vercel). Só https absoluto é repassado.
  const destino = r.headers.get('location');
  if (r.status >= 300 && r.status < 400 && destino && /^https:\/\//.test(destino)) sai.set('location', destino);
  const evento = (r.headers.get('content-type') ?? '').startsWith('text/event-stream');
  if (evento) {
    sai.set('cache-control', 'no-cache, no-transform');
    sai.set('x-accel-buffering', 'no');
    sai.delete('content-length');
  }
  if (req.method === 'HEAD' || !r.body) return new Response(null, { status: r.status, headers: sai });
  return new Response(evento ? sseComBatimento(r.body) : r.body, { status: r.status, headers: sai });
}

export const GET = repassar;
export const HEAD = repassar;
export const POST = repassar;
