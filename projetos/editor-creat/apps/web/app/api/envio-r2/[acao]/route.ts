// Envio direto navegador -> R2 (multipart pré-assinado). Todas as ações exigem a sessão do site.
//   GET  /api/envio-r2/config     modo (local | r2), tamanho de parte e limite (o componente decide tus ou R2)
//   POST /api/envio-r2/iniciar    {projeto, nome, tamanho, tipo} -> {token, chave, parteBytes, partes}
//   POST /api/envio-r2/assinar    {token, partes:[n...]}        -> {urls:[{parte, url, bytes}]}   (15 min)
//   POST /api/envio-r2/partes     {token}                        -> {partes:[{parte, etag, bytes}], enviados}  (retomar)
//   POST /api/envio-r2/concluir   {token, partes?:[{parte, etag}]} -> {chave, registro: ok|pendente, arquivo}
//   POST /api/envio-r2/abortar    {token}                        -> {ok}
// O token (HMAC) amarra projeto, chave, uploadId e tamanho: o navegador não escolhe chave nem tamanho de parte.
import { NextResponse } from 'next/server';
import { chaveFinal, RE_PROJETO, validarNome } from '@/lib/armazenamento';
import { motorJson } from '@/lib/motor';
import {
  abortarMultipart, bytesDaParte, concluirMultipart, criarMultipart, criarTokenEnvio, faltaConfigR2, faltantes,
  lerTokenEnvio, maxBytes, modoR2, numeroDePartes, parteConfigurada, partesEnviadas, tamanhoObjeto, tamanhoParte,
  urlDaParte, type Envio, type Parte,
} from '@/lib/r2';
import { mesmaOrigem, sessaoDaRequisicao } from '@/lib/sessao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ acao: string }> };
const falha = (status: number, detail: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ detail, ...extra }, { status, headers: { 'cache-control': 'no-store' } });
const certo = (corpo: unknown, status = 200) => NextResponse.json(corpo, { status, headers: { 'cache-control': 'no-store' } });

type Projeto = { id: string; estado: string };
const legivel = (b: number) => (b >= 1024 ** 3 ? `${+(b / 1024 ** 3).toFixed(1)} GB` : `${Math.round(b / 1024 ** 2)} MB`);
type Registro = { id: string; chave: string; bytes: number; novo?: boolean };

async function lerCorpo(req: Request): Promise<Record<string, unknown> | null> {
  if (Number(req.headers.get('content-length') ?? 0) > 1_000_000) return null;
  const txt = await req.text().catch(() => '');
  if (txt.length > 1_000_000) return null;
  try {
    const v = JSON.parse(txt || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function erroDoR2(e: unknown): Response {
  const s = (e as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
  console.error('[envio-r2]', (e as Error)?.name ?? 'erro', s ?? '');
  return falha(502, 'o armazenamento (R2) não respondeu como esperado; tente de novo em instantes');
}

async function iniciar(c: Record<string, unknown>): Promise<Response> {
  const projeto = typeof c.projeto === 'string' ? c.projeto : '';
  if (!RE_PROJETO.test(projeto)) return falha(400, 'projeto inválido');
  const v = validarNome(c.nome);
  if (!v.ok) return falha(v.status, v.erro);
  const tamanho = Number(c.tamanho);
  if (!Number.isSafeInteger(tamanho) || tamanho < 1) return falha(400, 'tamanho do arquivo inválido');
  const limite = maxBytes();
  if (tamanho > limite) return falha(413, `arquivo grande demais: o limite é ${legivel(limite)} por arquivo`);
  const p = await motorJson<Projeto>(`/v1/projetos/${projeto}`);
  if (!p.ok) return falha(p.status === 404 ? 404 : 503, p.status === 404 ? 'projeto não encontrado' : p.erro);
  if (!['recebendo', 'lendo'].includes(p.dados.estado)) {
    return falha(409, 'este projeto já está em direção/montagem; crie uma nova versão para mandar material novo');
  }
  const tipo = typeof c.tipo === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(c.tipo) ? c.tipo : 'application/octet-stream';
  const id = crypto.randomUUID().replace(/-/g, '');
  const chave = chaveFinal(projeto, v.nome, id);
  const parte = tamanhoParte(tamanho);
  let uploadId: string;
  try { uploadId = await criarMultipart(chave, tipo); } catch (e) { return erroDoR2(e); }
  const token = criarTokenEnvio({ p: projeto, k: chave, u: uploadId, t: tamanho, b: parte, n: v.nome });
  return certo({ token, chave, parteBytes: parte, partes: numeroDePartes(tamanho, parte), tamanho }, 201);
}

async function assinar(e: Envio, c: Record<string, unknown>): Promise<Response> {
  const n = numeroDePartes(e.t, e.b);
  const pedidas = Array.isArray(c.partes) ? c.partes : [];
  if (!pedidas.length || pedidas.length > 100) return falha(400, 'peça de 1 a 100 partes por vez');
  const nums = [...new Set(pedidas.map(Number))];
  if (nums.some((x) => !Number.isInteger(x) || x < 1 || x > n)) return falha(400, `número de parte fora de 1..${n}`);
  try {
    const urls = await Promise.all(nums.map(async (x) => ({ parte: x, url: await urlDaParte(e, x), bytes: bytesDaParte(x, e.t, e.b) })));
    return certo({ urls, expiraEm: 15 * 60 });
  } catch (err) {
    return erroDoR2(err);
  }
}

async function partes(e: Envio): Promise<Response> {
  let lista: Parte[] | null;
  try { lista = await partesEnviadas(e); } catch (err) { return erroDoR2(err); }
  if (lista === null) {
    const obj = await tamanhoObjeto(e.k).catch(() => null);
    if (obj && obj.bytes === e.t) return certo({ concluido: true, chave: e.k, partes: [], enviados: e.t, tamanho: e.t });
    return falha(404, 'este envio expirou ou foi cancelado; escolha o arquivo de novo para começar');
  }
  const falta = faltantes(e, lista);
  const validas = lista.filter((p) => !falta.includes(p.parte));
  const enviados = validas.reduce((s, p) => s + p.bytes, 0);
  return certo({ partes: validas, faltam: falta, enviados, tamanho: e.t, parteBytes: e.b, nome: e.n, chave: e.k });
}

async function registrarNoMotor(e: Envio, etag: string) {
  return motorJson<Registro>(`/v1/projetos/${e.p}/arquivos`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chave: e.k, nome: e.n, bytes: e.t, etag }),
  });
}

async function concluir(e: Envio, c: Record<string, unknown>): Promise<Response> {
  let lista: Parte[] | null;
  try { lista = await partesEnviadas(e); } catch (err) { return erroDoR2(err); }
  if (lista !== null) {
    const falta = faltantes(e, lista);
    if (falta.length) return falha(409, `ainda faltam ${falta.length} parte(s) do arquivo`, { faltam: falta.slice(0, 200) });
    const n = numeroDePartes(e.t, e.b);
    const usadas = lista.filter((p) => p.parte <= n);
    // o navegador manda as ETags que leu de cada PUT; elas têm de bater com o que o R2 guardou
    const doNavegador = Array.isArray(c.partes) ? (c.partes as { parte?: unknown; etag?: unknown }[]) : [];
    for (const p of doNavegador) {
      const r = usadas.find((x) => x.parte === Number(p.parte));
      if (r && typeof p.etag === 'string' && p.etag.replace(/"/g, '') !== r.etag.replace(/"/g, '')) {
        return falha(409, `a parte ${r.parte} chegou diferente do que o navegador mandou; ela será enviada de novo`, { faltam: [r.parte] });
      }
    }
    try { await concluirMultipart(e, usadas); } catch (err) { return erroDoR2(err); }
  }
  // concluído agora ou numa chamada anterior (idempotente): o objeto tem de existir com o tamanho certo
  const obj = await tamanhoObjeto(e.k).catch(() => null);
  if (!obj) return falha(404, 'este envio expirou ou foi cancelado; escolha o arquivo de novo para começar');
  if (obj.bytes !== e.t) return falha(409, `tamanho não confere: o envio diz ${e.t} bytes, o armazenamento tem ${obj.bytes}`);
  const r = await registrarNoMotor(e, obj.etag);
  if (!r.ok && r.status !== 503) return falha(r.status === 409 ? 409 : 502, r.erro, { chave: e.k, registro: 'recusado' });
  return certo({ chave: e.k, bytes: e.t, registro: r.ok ? 'ok' : 'pendente', arquivo: r.ok ? r.dados.id : null });
}

async function tratar(req: Request, ctx: Ctx): Promise<Response> {
  if (!(await sessaoDaRequisicao(req))) return falha(401, 'entre com a senha de novo');
  const { acao } = await ctx.params;
  if (req.method === 'GET') {
    if (acao !== 'config') return falha(404, 'ação desconhecida');
    const r2 = modoR2();
    return certo({ modo: r2 ? 'r2' : 'local', parteMB: Math.round(parteConfigurada() / 1024 ** 2), maxBytes: maxBytes(), limite: legivel(maxBytes()), simultaneas: 3 });
  }
  if (!mesmaOrigem(req)) return falha(403, 'origem não permitida');
  if (!modoR2()) return falha(409, 'o envio direto para o R2 está desligado (EDITOR_ARMAZENAMENTO não é r2); use o envio do site');
  const falta = faltaConfigR2();
  if (falta.length) return falha(503, `R2 sem configuração no servidor: faltam ${falta.join(', ')}`);
  const c = await lerCorpo(req);
  if (!c) return falha(400, 'corpo JSON inválido ou grande demais');
  if (acao === 'iniciar') return iniciar(c);
  const e = lerTokenEnvio(c.token);
  if (!e) return falha(400, 'envio desconhecido ou vencido; escolha o arquivo de novo');
  switch (acao) {
    case 'assinar': return assinar(e, c);
    case 'partes': return partes(e);
    case 'concluir': return concluir(e, c);
    case 'abortar':
      try { await abortarMultipart(e); } catch (err) { return erroDoR2(err); }
      return certo({ ok: true });
    default: return falha(404, 'ação desconhecida');
  }
}

export const GET = tratar;
export const POST = tratar;
