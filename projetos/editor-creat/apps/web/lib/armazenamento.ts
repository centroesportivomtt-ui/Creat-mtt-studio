// Onde o envio retomável grava: o MESMO armazenamento local do motor ($EDITOR_DADOS/armazenamento).
// O tus escreve em armazenamento/.envio/ e, no fim, o arquivo é movido (rename atômico, mesmo disco)
// para a chave entrada/<projeto>/<nome>-<id>.<ext> que o motor registra. Produção: @tus/s3-store no R2.
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

export function chaveFinal(projeto: string, nome: string, id: string): string {
  const ext = extensao(nome) ?? 'bin';
  const base = slug(nome.replace(/\.[A-Za-z0-9]{1,5}$/, ''));
  return `entrada/${projeto}/${base}-${id.slice(0, 8)}.${ext}`;
}
