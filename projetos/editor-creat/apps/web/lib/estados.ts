// Rótulos em pt-BR dos estados do projeto e das etapas do motor (ARQUITETURA §3).
export const ESTADOS = ['recebendo', 'lendo', 'dirigindo', 'montando', 'conferindo', 'entregue'] as const;
export type Estado = (typeof ESTADOS)[number] | 'reprovado_qa' | 'erro';

export const ROTULO_ESTADO: Record<string, string> = {
  recebendo: 'Recebendo', lendo: 'Lendo', dirigindo: 'Dirigindo', montando: 'Montando',
  conferindo: 'Conferindo', entregue: 'Entregue', reprovado_qa: 'Reprovado no QA', erro: 'Erro',
};
export const EXPLICA_ESTADO: Record<string, string> = {
  recebendo: 'Subindo. Pode travar o celular que o envio retoma de onde parou.',
  lendo: 'Lendo tudo: falas, momentos e rostos.',
  dirigindo: 'O diretor escolhe gancho, falas e ritmo no modo pedido.',
  montando: 'Cortes, cor, legendas, motion e mix.',
  conferindo: 'Conferindo som, logo, legenda e zona segura. Com erro, a entrega fica segura.',
  entregue: 'Pronto. Assiste e me diz: aprova ou corta.',
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
export const MODOS: { valor: string; rotulo: string; dica: string }[] = [
  { valor: 'auto', rotulo: 'O editor decide', dica: 'Ele lê o material e escolhe.' },
  { valor: 'criativo', rotulo: 'Criativo', dica: 'Ritmo vivo e tipografia em movimento.' },
  { valor: 'ultra', rotulo: 'Ultra criação', dica: 'O máximo de invenção, com mascotes e efeitos.' },
  { valor: 'cinema', rotulo: 'Cinema', dica: 'Transições de cinema, cor e trilha com emoção.' },
  { valor: 'ia', rotulo: 'Com IA', dica: 'Cenas geradas junto do material real, sempre rotuladas.' },
  { valor: 'clean', rotulo: 'Clean', dica: 'Limpo e neutro, cortes precisos.' },
  { valor: 'serio', rotulo: 'Sério', dica: 'Institucional e sóbrio.' },
  { valor: 'fala', rotulo: 'Fala', dica: 'A fala é o filme. Legenda fiel.' },
];
export const rotuloModo = (v: string | null | undefined) => MODOS.find((m) => m.valor === v)?.rotulo ?? 'O editor decide';
// Perguntas que o editor faz antes de montar: o dono só toca nos botões. Cada uma vira campo do pedido (destino, formato) ou
// entra em "obrigatório"/"proibido", que o diretor lê. `modos` limita a pergunta a certos modos (vazio = todos).
export type Pergunta = {
  id: string; texto: string; tipo: 'um' | 'varios'; campo: 'formato' | 'destino' | 'obrigatorio' | 'proibido' | 'ambiente' | 'vozes';
  opcoes: { valor: string; rotulo: string }[]; modos?: string[];
};
export const PERGUNTAS: Pergunta[] = [
  { id: 'formato', texto: 'Qual formato?', tipo: 'um', campo: 'formato', opcoes: [
    { valor: '9:16', rotulo: 'Vertical 9:16' }, { valor: '4:5', rotulo: 'Feed 4:5' }, { valor: '1:1', rotulo: 'Quadrado' }, { valor: '16:9', rotulo: 'Horizontal 16:9' }] },
  { id: 'destino', texto: 'Onde vai ser postado?', tipo: 'varios', campo: 'destino', opcoes: [
    { valor: 'reels', rotulo: 'Reels' }, { valor: 'stories', rotulo: 'Stories' }, { valor: 'tiktok', rotulo: 'TikTok' },
    { valor: 'shorts', rotulo: 'Shorts' }, { valor: 'feed', rotulo: 'Feed' }, { valor: 'youtube', rotulo: 'YouTube' }] },
  { id: 'vozes', texto: 'Quem fala no vídeo?', tipo: 'um', campo: 'vozes', opcoes: [
    { valor: 'auto', rotulo: 'O editor ouve e decide' }, { valor: 'uma', rotulo: 'Só o apresentador' }, { valor: 'varias', rotulo: 'Várias pessoas falam' }] },
  { id: 'ambiente', texto: 'Onde foi gravado? (para a cor)', tipo: 'um', campo: 'ambiente', opcoes: [
    { valor: 'auto', rotulo: 'O editor mede' }, { valor: 'loja', rotulo: 'Dentro da loja' }, { valor: 'rua_dia', rotulo: 'Rua de dia' },
    { valor: 'rua_noite', rotulo: 'Rua à noite' }, { valor: 'academia', rotulo: 'Academia' }, { valor: 'palco', rotulo: 'Palco' }] },
  { id: 'proibido', texto: 'O que NÃO pode aparecer?', tipo: 'varios', campo: 'proibido', opcoes: [
    { valor: 'palavrão', rotulo: 'Palavrão' }, { valor: 'rosto de terceiros', rotulo: 'Rosto de terceiros' }, { valor: 'preços', rotulo: 'Preços' },
    { valor: 'placa de carro', rotulo: 'Placa de carro' }, { valor: 'marca de concorrente', rotulo: 'Marca de concorrente' }] },
  { id: 'mascote', texto: 'Usar o mascote do cliente?', tipo: 'um', campo: 'obrigatorio', modos: ['ultra', 'criativo'], opcoes: [
    { valor: '', rotulo: 'Não' }, { valor: 'mascote do cliente pequeno, estratégico, em 3 aparições no máximo', rotulo: 'Sim, pequeno' }] },
  { id: 'ia', texto: 'Pode gerar cenas por IA? (tem custo)', tipo: 'um', campo: 'obrigatorio', modos: ['ia', 'ultra'], opcoes: [
    { valor: '', rotulo: 'Não' }, { valor: 'cenas geradas por IA permitidas, sempre rotuladas como conceito; informar o gasto antes', rotulo: 'Sim, informe o gasto' }] },
  { id: 'telas', texto: 'Recriar telas de celular ou computador em motion?', tipo: 'um', campo: 'obrigatorio', modos: ['ultra', 'criativo', 'cinema', 'ia'], opcoes: [
    { valor: '', rotulo: 'Não' }, { valor: 'recriar em motion as telas mostradas, sem inventar dado', rotulo: 'Sim, sem inventar dado' }] },
  { id: 'legenda', texto: 'Como a legenda?', tipo: 'um', campo: 'obrigatorio', modos: ['fala', 'clean', 'serio'], opcoes: [
    { valor: '', rotulo: 'O editor decide' }, { valor: 'legenda discreta e fiel à fala', rotulo: 'Discreta' }, { valor: 'sem legenda na tela', rotulo: 'Sem legenda' }] },
  { id: 'musica', texto: 'Música?', tipo: 'um', campo: 'obrigatorio', opcoes: [
    { valor: '', rotulo: 'O editor decide' }, { valor: 'sem música, só o som direto', rotulo: 'Sem música' }, { valor: 'trilha com curva emocional e ducking sob a fala', rotulo: 'Trilha com emoção' }] },
  { id: 'fecho', texto: 'Como termina?', tipo: 'um', campo: 'obrigatorio', opcoes: [
    { valor: '', rotulo: 'O editor decide' }, { valor: 'fecho com logo animada e convite para seguir', rotulo: 'Logo + seguir' }, { valor: 'fecho com chamada para comentar', rotulo: 'Chamar comentário' }] },
];
export const perguntasDoModo = (modo: string) => PERGUNTAS.filter((q) => !q.modos || q.modos.includes(modo));
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
  dados: { envio_fechado?: boolean; envio_fechado_em?: string; pedido?: { texto: string; tipo_video?: string; modo?: string }; aprovadas?: Record<string, { em: string; nota: string | null }> } & Record<string, unknown>;
  arquivos: Arquivo[]; versoes: Versao[];
};
export type ResumoProjeto = { id: string; nome: string; estado: string; tipo_video: string | null; criado: string; atualizado: string; arquivos: number };
export type Evento = {
  id: number; projeto: string; ts: string; tipo: string; etapa: string | null; alvo: string | null;
  progresso: number | null; estado: string | null; mensagem: string | null; dados: Record<string, unknown> | null;
};
