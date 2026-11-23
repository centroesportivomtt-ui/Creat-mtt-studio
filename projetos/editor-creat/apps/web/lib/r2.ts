// Envio DIRETO do navegador para o Cloudflare R2 (S3 compatível) por multipart com URLs pré-assinadas.
// O arquivo nunca passa pelo servidor do site (a Vercel não tem disco): o site só cria o envio, assina cada parte,
// lista o que já chegou (para retomar) e conclui. Ligado com EDITOR_ARMAZENAMENTO=r2 e as variáveis R2_*.
// Regras do R2: parte mínima 5 MiB (menos a última), todas as partes do mesmo tamanho, no máximo 10 000 partes.
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, HeadObjectCommand,
  ListPartsCommand, S3Client, UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const MiB = 1024 * 1024;
export const PARTE_MIN = 5 * MiB;
export const PARTE_MAX = 5 * 1024 * MiB;
export const MAX_PARTES = 10_000;
export const URL_EXPIRA_S = 15 * 60;          // URL de parte vale 15 min (o PUT só precisa começar dentro do prazo)
export const TOKEN_EXPIRA_S = 7 * 24 * 3600;  // o R2 descarta multipart incompleto depois de 7 dias

export const modoR2 = () => (process.env.EDITOR_ARMAZENAMENTO ?? '').trim() === 'r2';

export function faltaConfigR2(): string[] {
  const falta = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].filter((n) => !(process.env[n] ?? '').trim());
  if (!(process.env.R2_ENDPOINT ?? '').trim() && !(process.env.R2_ACCOUNT_ID ?? '').trim()) falta.unshift('R2_ACCOUNT_ID');
  return falta;
}

export function endpointR2(): string {
  const sob = (process.env.R2_ENDPOINT ?? '').trim();
  if (sob) return sob.replace(/\/+$/, '');
  return `https://${(process.env.R2_ACCOUNT_ID ?? '').trim()}.r2.cloudflarestorage.com`;
}

export const bucketR2 = () => (process.env.R2_BUCKET ?? '').trim();

let cliente: S3Client | null = null;
let chaveCliente = '';
export function clienteR2(): S3Client {
  const id = `${endpointR2()}|${process.env.R2_ACCESS_KEY_ID}|${bucketR2()}`;
  if (!cliente || chaveCliente !== id) {
    cliente = new S3Client({
      region: 'auto',
      endpoint: endpointR2(),
      forcePathStyle: true, // o R2 aceita; e o endpoint de teste (127.0.0.1) só funciona assim
      credentials: { accessKeyId: (process.env.R2_ACCESS_KEY_ID ?? '').trim(), secretAccessKey: (process.env.R2_SECRET_ACCESS_KEY ?? '').trim() },
      // o R2 não usa as somas CRC32 novas do SDK; com elas a URL pré-assinada exigiria um cabeçalho que o navegador não manda
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 4,
    });
    chaveCliente = id;
  }
  return cliente;
}

// ---------- limites ----------
export function parteConfigurada(): number {
  const mb = Number(process.env.EDITOR_ENVIO_PARTE_MB) || 64;
  return Math.min(PARTE_MAX, Math.max(PARTE_MIN, Math.round(mb) * MiB));
}

export function maxBytes(): number {
  const gb = Number(process.env.EDITOR_ENVIO_MAX_GB) || 200;
  return Math.min(4900, Math.max(0.001, gb)) * 1024 * MiB; // objeto do R2: até ~4,995 TiB
}

/** Tamanho de parte para este arquivo: o configurado, ou maior (múltiplo de 1 MiB) se passaria de 10 000 partes. */
export function tamanhoParte(total: number, base = parteConfigurada()): number {
  const minimo = Math.ceil(total / MAX_PARTES);
  return base >= minimo ? base : Math.min(PARTE_MAX, Math.ceil(minimo / MiB) * MiB);
}

export const numeroDePartes = (total: number, parte: number) => Math.max(1, Math.ceil(total / parte));
export function bytesDaParte(n: number, total: number, parte: number): number {
  const ultima = numeroDePartes(total, parte);
  return n < ultima ? parte : total - (ultima - 1) * parte;
}

// ---------- token do envio (amarra projeto, chave, uploadId e tamanho; o navegador não escolhe a chave) ----------
export type Envio = { v: 1; p: string; k: string; u: string; t: number; b: number; n: string; e: number };

function segredoToken(): Buffer {
  const s = (process.env.R2_SECRET_ACCESS_KEY ?? '').trim();
  if (!s) throw new Error('R2_SECRET_ACCESS_KEY ausente');
  return createHmac('sha256', s).update('editor-creat/envio-r2/v1').digest();
}
const assinar = (corpo: string) => createHmac('sha256', segredoToken()).update(corpo).digest('base64url');

export function criarTokenEnvio(d: Omit<Envio, 'v' | 'e'>, agora = Date.now()): string {
  const corpo = Buffer.from(JSON.stringify({ v: 1, ...d, e: Math.floor(agora / 1000) + TOKEN_EXPIRA_S })).toString('base64url');
  return `${corpo}.${assinar(corpo)}`;
}

export const RE_CHAVE_ENTRADA = /^entrada\/p_[a-z0-9]{4,40}\/[a-z0-9-]{1,60}-[a-z0-9]{8}\.[a-z0-9]{1,5}$/;

export function lerTokenEnvio(token: unknown, agora = Date.now()): Envio | null {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const i = token.lastIndexOf('.');
  if (i <= 0) return null;
  const corpo = token.slice(0, i);
  const a = Buffer.from(token.slice(i + 1));
  let esperado: Buffer;
  try { esperado = Buffer.from(assinar(corpo)); } catch { return null; }
  if (a.length !== esperado.length || !timingSafeEqual(a, esperado)) return null;
  try {
    const d = JSON.parse(Buffer.from(corpo, 'base64url').toString('utf8')) as Envio;
    if (d.v !== 1 || d.e * 1000 < agora || !RE_CHAVE_ENTRADA.test(d.k) || !d.k.startsWith(`entrada/${d.p}/`)) return null;
    if (!Number.isSafeInteger(d.t) || d.t < 1 || !Number.isSafeInteger(d.b) || d.b < PARTE_MIN) return null;
    return d;
  } catch {
    return null;
  }
}

// ---------- operações ----------
export async function criarMultipart(chave: string, tipo: string): Promise<string> {
  const r = await clienteR2().send(new CreateMultipartUploadCommand({ Bucket: bucketR2(), Key: chave, ContentType: tipo }));
  if (!r.UploadId) throw new Error('o R2 não devolveu UploadId');
  return r.UploadId;
}

/** URL PUT pré-assinada para uma parte, com o tamanho exato assinado (content-length entra na assinatura). */
export function urlDaParte(e: Envio, n: number): Promise<string> {
  return getSignedUrl(clienteR2(), new UploadPartCommand({
    Bucket: bucketR2(), Key: e.k, UploadId: e.u, PartNumber: n, ContentLength: bytesDaParte(n, e.t, e.b),
  }), { expiresIn: URL_EXPIRA_S });
}

export type Parte = { parte: number; etag: string; bytes: number };

/** Todas as partes já gravadas no R2 (ListParts paginado de 1000 em 1000). null = envio não existe mais. */
export async function partesEnviadas(e: Envio): Promise<Parte[] | null> {
  const lista: Parte[] = [];
  let marcador: string | undefined;
  for (let volta = 0; volta < 20; volta++) {
    let r;
    try {
      r = await clienteR2().send(new ListPartsCommand({ Bucket: bucketR2(), Key: e.k, UploadId: e.u, MaxParts: 1000, PartNumberMarker: marcador }));
    } catch (err) {
      if (naoExiste(err)) return null;
      throw err;
    }
    for (const p of r.Parts ?? []) {
      if (p.PartNumber && p.ETag) lista.push({ parte: p.PartNumber, etag: p.ETag, bytes: Number(p.Size ?? 0) });
    }
    if (!r.IsTruncated || !r.NextPartNumberMarker) break;
    marcador = String(r.NextPartNumberMarker);
  }
  return lista.sort((a, b) => a.parte - b.parte);
}

export async function concluirMultipart(e: Envio, partes: Parte[]): Promise<void> {
  await clienteR2().send(new CompleteMultipartUploadCommand({
    Bucket: bucketR2(), Key: e.k, UploadId: e.u,
    MultipartUpload: { Parts: partes.map((p) => ({ PartNumber: p.parte, ETag: p.etag })) },
  }));
}

export async function abortarMultipart(e: Envio): Promise<void> {
  try {
    await clienteR2().send(new AbortMultipartUploadCommand({ Bucket: bucketR2(), Key: e.k, UploadId: e.u }));
  } catch (err) {
    if (!naoExiste(err)) throw err;
  }
}

export async function tamanhoObjeto(chave: string): Promise<{ bytes: number; etag: string } | null> {
  try {
    const r = await clienteR2().send(new HeadObjectCommand({ Bucket: bucketR2(), Key: chave }));
    return { bytes: Number(r.ContentLength ?? 0), etag: r.ETag ?? '' };
  } catch (err) {
    if (naoExiste(err)) return null;
    throw err;
  }
}

export function naoExiste(err: unknown): boolean {
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return ['NoSuchUpload', 'NoSuchKey', 'NotFound'].includes(e?.name ?? e?.Code ?? '') || e?.$metadata?.httpStatusCode === 404;
}

/** Confere se as partes gravadas formam o arquivo inteiro. Devolve as faltantes (vazio = completo). */
export function faltantes(e: Envio, partes: Parte[]): number[] {
  const n = numeroDePartes(e.t, e.b);
  const ok = new Set(partes.filter((p) => p.parte <= n && p.bytes === bytesDaParte(p.parte, e.t, e.b)).map((p) => p.parte));
  const falta: number[] = [];
  for (let i = 1; i <= n; i++) if (!ok.has(i)) falta.push(i);
  return falta;
}
