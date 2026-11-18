// Rótulos em pt-BR dos estados do projeto e das etapas do motor (ARQUITETURA §3).
export const ESTADOS = ['recebendo', 'lendo', 'dirigindo', 'montando', 'conferindo', 'entregue'] as const;
export type Estado = (typeof ESTADOS)[number] | 'reprovado_qa' | 'erro';

export const ROTULO_ESTADO: Record<string, string> = {
  recebendo: 'Recebendo', lendo: 'Lendo', dirigindo: 'Dirigindo', montando: 'Montando',
  conferindo: 'Conferindo', entregue: 'Entregue', reprovado_qa: 'Reprovado no QA', erro: 'Erro',
};
export const EXPLICA_ESTADO: Record<string, string> = {
  recebendo: 'Material chegando. Cada arquivo é lido assim que chega.',
  lendo: 'Falas, momentos e rostos sendo lidos.',
  dirigindo: 'O diretor escolhe gancho, falas e ritmo.',
  montando: 'Cortes, cor, legendas, motion e mix.',
  conferindo: 'QA automático: som, logo, legenda, zona segura.',
  entregue: 'Pronto para assistir e postar.',
};
export const ROTULO_ETAPA: Record<string, string> = {
  ingest: 'Ingestão', analise: 'Leitura', catalogo: 'Catálogo', direcao: 'Direção',
  montagem: 'Montagem', qa: 'Conferência', entrega: 'Entrega',
};
export const ETAPA_DO_ESTADO: Record<string, string> = {
  ingest: 'recebendo', analise: 'lendo', catalogo: 'dirigindo', direcao: 'dirigindo',
  montagem: 'montando', qa: 'conferindo', entrega: 'entregue',
};
export const TIPOS_VIDEO: { valor: string; rotulo: string }[] = [
  { valor: 'auto', rotulo: 'O editor decide' },
  { valor: 'evento', rotulo: 'Evento' },
  { valor: 'empresa', rotulo: 'Empresa' },
  { valor: 'bastidor', rotulo: 'Bastidor' },
  { valor: 'daily_vlog', rotulo: 'Daily vlog' },
  { valor: 'anuncio', rotulo: 'Anúncio' },
  { valor: 'depoimento', rotulo: 'Depoimento' },
];
export const rotuloTipo = (v: string | null | undefined) => TIPOS_VIDEO.find((t) => t.valor === v)?.rotulo ?? 'O editor decide';

export function classeEstado(estado: string): string {
  if (estado === 'entregue') return 'chip chip--ok';
  if (estado === 'erro' || estado === 'reprovado_qa') return 'chip chip--erro';
  if (['lendo', 'dirigindo', 'montando', 'conferindo'].includes(estado)) return 'chip chip--vivo';
  return 'chip';
}

export function bytesLegiveis(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toLocaleString('pt-BR', { maximumFractionDigits: i >= 3 ? 2 : 0 })} ${u[i]}`;
}

export function quando(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export type Arquivo = { id: string; nome: string; chave: string | null; bytes: number; estado: string; criado: string };
export type Versao = { id: string; estado: string; video: string | null; qa: unknown; link: string | null; reprovacao: string | null; criado: string };
export type Projeto = {
  id: string; nome: string; estado: string; tipo_video: string | null; criado: string; atualizado: string;
  dados: { envio_fechado?: boolean; envio_fechado_em?: string; pedido?: { texto: string; tipo_video?: string } } & Record<string, unknown>;
  arquivos: Arquivo[]; versoes: Versao[];
};
export type ResumoProjeto = { id: string; nome: string; estado: string; tipo_video: string | null; criado: string; atualizado: string; arquivos: number };
export type Evento = {
  id: number; projeto: string; ts: string; tipo: string; etapa: string | null; alvo: string | null;
  progresso: number | null; estado: string | null; mensagem: string | null; dados: Record<string, unknown> | null;
};
