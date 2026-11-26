// Proxy autenticado site -> motor. Só quem tem sessão passa; o MOTOR_TOKEN fica no servidor.
// Repassa Range (player) e SSE (status ao vivo) em streaming, sem bufferizar.
import { NextResponse } from 'next/server';
import { MOTOR_URL, cabecalhosMotor } from '@/lib/motor';
import { mesmaOrigem, sessaoDaRequisicao } from '@/lib/sessao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// onda 3: apagar uma regra, conferência ou palavra do Caderno (só as que nasceram de ajuste do dono; o formato do id já filtra)
// Cada pedaço do caminho começa com letra, número, "_" ou "-" (nunca "."), então ".." não passa nem escondido: o Next
// decodifica "..%2F" dentro de UM pedaço, e o fetch normalizaria o caminho para fora da lista (revisão da onda 3).
// onda 4: marca do cliente (logo e poses do mascote) no Caderno. A versão segurada (/projetos/<p>/versoes/<v>/segurada[/video])
// já cabe no padrão de projetos. O corpo de 8 MB vale SÓ para o envio da imagem; o resto continua com 1 MB.
const MARCA = '[a-z0-9][a-z0-9_-]{0,39}';
const POSE = '(espiada|placa|moto|carro|aceno)';
const ROTA_MARCAS = `marcas|marcas\\/${MARCA}\\/(logo|logo\\/apagar|mascote\\/${POSE}|mascote\\/${POSE}\\/apagar)`;
const ENVIO_IMAGEM = new RegExp(`^v1\\/marcas\\/${MARCA}\\/(logo|mascote\\/${POSE})$`);
const LIMITE = 1_000_000;
const LIMITE_IMAGEM = 8 * 1024 * 1024;
const PERMITIDAS = new RegExp(String.raw`^v1\/(saude|conversa|${ROTA_MARCAS}|memoria|memoria\/(regras\/r_dono_|checagens\/c_dono_|vocabulario\/v_)[0-9a-f]{8}\/apagar|referencias|backup|backup\/config|backup\/rodar|gastos|entregas\/clientes|clientes|clientes\/lc_[a-f0-9]{12}\/(revogar|tratar)|biblioteca|biblioteca\/(trilha|sfx)\/[a-z0-9_-]{2,41}\/retirar|projetos|projetos\/p_[a-z0-9]{4,40}(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*|arquivos(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)+)$`);
const ENTRA = ['content-type', 'range', 'if-range', 'last-event-id', 'accept'];
const SAI = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'last-modified', 'etag', 'content-disposition',
  'x-content-type-options', 'x-robots-tag', 'content-security-policy', 'referrer-policy'];

type Ctx = { params: Promise<{ rota: string[] }> };

async function repassar(req: Request, ctx: Ctx): Promise<Response> {
  if (!sessaoDaRequisicao(req)) return NextResponse.json({ detail: 'entre com a senha de novo' }, { status: 401 });
  if (req.method === 'POST' && !mesmaOrigem(req)) return NextResponse.json({ detail: 'origem não permitida' }, { status: 403 });
  const { rota } = await ctx.params;
  const caminho = rota.join('/');
  if (!rota.length || rota.some((p) => !p || p.startsWith('.') || /[\/\\%\s]/.test(p)) || !PERMITIDAS.test(caminho)) {
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
    const imagem = ENVIO_IMAGEM.test(caminho);
    const teto = imagem ? LIMITE_IMAGEM : LIMITE;
    const grande = imagem ? 'imagem grande demais: mande com até 8 MB' : 'corpo grande demais';
    const tamanho = Number(req.headers.get('content-length') ?? 0);
    if (tamanho > teto) return NextResponse.json({ detail: grande }, { status: 413 });
    corpo = await req.arrayBuffer();
    if (corpo.byteLength > teto) return NextResponse.json({ detail: grande }, { status: 413 });
  }
  let r: Response;
  try {
    r = await fetch(`${MOTOR_URL}/${rota.map(encodeURIComponent).join('/')}${busca}`, {
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
