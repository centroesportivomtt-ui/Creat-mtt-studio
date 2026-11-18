// Servidor tus (envio retomável) do Editor creat.MTT.
// O navegador manda em partes (EDITOR_ENVIO_PARTE_MB, padrão 64); se a rede cai, a aba fecha ou o celular
// bloqueia a tela, o envio continua do último byte gravado. No fim: move para entrada/<projeto>/ e avisa o motor.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Server, type Upload } from '@tus/server';
import { FileStore } from '@tus/file-store';
import { chaveFinal, extensao, pastaEnvio, raizArmazenamento, RE_PROJETO } from '@/lib/armazenamento';
import { motorJson } from '@/lib/motor';
import { modoR2 } from '@/lib/r2';
import { mesmaOrigem, sessaoDaRequisicao } from '@/lib/sessao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIMITE_BYTES = 200 * 1024 ** 3; // 200 GB por arquivo
type ErroTus = { status_code: number; body: string };
const erro = (status_code: number, body: string): ErroTus => ({ status_code, body });

type Projeto = { id: string; estado: string };
type Registro = { id: string; chave: string; bytes: number };

async function criarServidor(): Promise<Server> {
  await fs.mkdir(pastaEnvio(), { recursive: true });
  return new Server({
    path: '/api/envio',
    relativeLocation: true,
    respectForwardedHeaders: true,
    maxSize: LIMITE_BYTES,
    datastore: new FileStore({ directory: pastaEnvio(), expirationPeriodInMilliseconds: 7 * 24 * 3600 * 1000 }),
    async onUploadCreate(_req, upload: Upload) {
      const m = upload.metadata ?? {};
      const projeto = m.projeto ?? '';
      const nome = (m.nome ?? m.filename ?? '').trim();
      if (!RE_PROJETO.test(projeto)) throw erro(400, 'projeto inválido');
      if (!nome || nome.length > 255 || /[\x00-\x1f/\\]/.test(nome)) throw erro(400, 'nome de arquivo inválido');
      if (!extensao(nome)) throw erro(415, 'tipo de arquivo não aceito (vídeo, áudio, imagem, pdf ou zip)');
      const p = await motorJson<Projeto>(`/v1/projetos/${projeto}`);
      if (!p.ok) throw erro(p.status === 404 ? 404 : 503, p.status === 404 ? 'projeto não encontrado' : p.erro);
      if (!['recebendo', 'lendo'].includes(p.dados.estado)) {
        throw erro(409, 'este projeto já está em direção/montagem; crie uma nova versão para mandar material novo');
      }
      return { metadata: { ...m, nome } };
    },
    async onUploadFinish(_req, upload: Upload) {
      const m = upload.metadata ?? {};
      const projeto = m.projeto ?? '';
      const nome = m.nome ?? 'arquivo';
      const chave = chaveFinal(projeto, nome, upload.id);
      const destino = path.join(raizArmazenamento(), chave);
      await fs.mkdir(path.dirname(destino), { recursive: true });
      await fs.rename(path.join(pastaEnvio(), upload.id), destino); // mesmo disco: atômico, sem cópia
      await fs.rm(path.join(pastaEnvio(), `${upload.id}.json`), { force: true });
      const r = await motorJson<Registro>(`/v1/projetos/${projeto}/arquivos`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chave, nome, bytes: upload.size ?? upload.offset }),
      });
      // Se o motor estiver fora, o arquivo já está salvo: o navegador registra de novo pelo proxy.
      return { headers: { 'Editor-Chave': chave, 'Editor-Registro': r.ok ? 'ok' : 'pendente', 'Editor-Arquivo': r.ok ? r.dados.id : '' } };
    },
  });
}

const g = globalThis as unknown as { __tusEditor?: Promise<Server> };
const servidor = () => (g.__tusEditor ??= criarServidor());

async function tratar(req: Request): Promise<Response> {
  if (!(await sessaoDaRequisicao(req))) return new Response('entre com a senha de novo', { status: 401 });
  if (req.method !== 'HEAD' && req.method !== 'GET' && !mesmaOrigem(req)) return new Response('origem não permitida', { status: 403 });
  if (modoR2()) {
    // Em produção (Vercel) não há disco: o navegador manda direto ao R2 por /api/envio-r2 (docs/R2-ENVIO.md).
    return new Response('envio pelo site desligado: com EDITOR_ARMAZENAMENTO=r2 o arquivo vai direto ao R2 (/api/envio-r2); recarregue a página',
      { status: 410, headers: { 'content-type': 'text/plain; charset=utf-8', 'Tus-Resumable': '1.0.0' } });
  }
  const s = await servidor();
  return s.handleWeb(req as Parameters<Server['handleWeb']>[0]);
}

export const GET = tratar;
export const HEAD = tratar;
export const POST = tratar;
export const PATCH = tratar;
export const DELETE = tratar;
export const OPTIONS = tratar;
