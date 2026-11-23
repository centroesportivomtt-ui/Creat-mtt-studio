// Onde o envio retomável grava: o MESMO armazenamento local do motor ($EDITOR_DADOS/armazenamento).
// O tus escreve em armazenamento/.envio/ e, no fim, o arquivo é movido (rename atômico, mesmo disco)
// para a chave entrada/<projeto>/<nome>-<id>.<ext> que o motor registra.
// Produção (EDITOR_ARMAZENAMENTO=r2): o navegador manda direto ao R2 pela mesma chave (lib/r2.ts, docs/R2-ENVIO.md).
import path from 'node:path';

export function raizDados(): string {
  return path.resolve(process.env.EDITOR_DADOS || path.join(process.cwd(), '..', '..', 'dados'));
}
export const raizArmazenamento = () => path.join(raizDados(), 'armazenamento');
export const pastaEnvio = () => path.join(raizArmazenamento(), '.envio');

export const RE_PROJETO = /^p_[a-z0-9]{4,40}$/;
export const EXTENSOES = new Set([
  'mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'mts', 'm2ts', '3gp', 'hevc',
  'wav', 'mp3', 'm4a', 'aac', 'flac', 'ogg', 'opus',
  'jpg', 'jpeg', 'png', 'heic', 'webp', 'svg', 'pdf', 'zip',
]);

/** Nome seguro para a chave: sem acento, sem espaço, só [a-z0-9-], até 60 caracteres. */
export function slug(nome: string): string {
  return (
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'arquivo'
  );
}

export function extensao(nome: string): string | null {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(nome.trim());
  const ext = m?.[1].toLowerCase() ?? null;
  return ext && EXTENSOES.has(ext) ? ext : null;
}

/** Valida o nome que o navegador mandou (sem caminho, sem `..`, sem caractere de controle, extensão aceita).
 * Acento não é erro: a chave final passa pelo slug e fica sem acento. */
export function validarNome(bruto: unknown): { ok: true; nome: string } | { ok: false; status: number; erro: string } {
  const nome = typeof bruto === 'string' ? bruto.normalize('NFC').trim() : '';
  if (!nome || nome.length > 255) return { ok: false, status: 400, erro: 'nome de arquivo vazio ou longo demais (até 255 caracteres)' };
  if (/[\x00-\x1f\x7f/\\]/.test(nome) || nome.includes('..')) {
    return { ok: false, status: 400, erro: 'nome de arquivo inválido: sem barras, sem ".." e sem caracteres de controle' };
  }
  if (!extensao(nome)) return { ok: false, status: 415, erro: 'tipo de arquivo não aceito (vídeo, áudio, imagem, pdf ou zip)' };
  return { ok: true, nome };
}

export function chaveFinal(projeto: string, nome: string, id: string): string {
  const ext = extensao(nome) ?? 'bin';
  const base = slug(nome.replace(/\.[A-Za-z0-9]{1,5}$/, ''));
  return `entrada/${projeto}/${base}-${id.slice(0, 8)}.${ext}`;
}
