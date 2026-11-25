// Conversa com o editor (docs/plano-conversa-25-11.md, seções 13.1 e 13.3): os tipos dos eventos e as chamadas ao
// motor, sempre pelo proxy do site (/api/motor/v1/...). O token do motor nunca vem ao navegador.
// Os tipos espelham packages/schemas/conversa.schema.json e evento-efemero.schema.json (campo novo = opcional).

export type Turno = string;
export type Tokens = { entrada: number; cache_lida: number; cache_escrita: number; saida: number };
export type Contexto = { versao?: string; t_player?: number; tela?: 'fio' | 'player' | 'caderno' };

export type DadosFalaDono = { turno: Turno; texto: string; via: 'texto' | 'audio'; na_fila?: boolean; contexto?: Contexto };
export type DadosFalaEditor = { turno: Turno; bloco: number; texto: string };
export type DadosFerramenta = {
  turno: Turno | null; tool_use_id: string; nome: string; fase: 'inicio' | 'fim' | 'erro';
  entrada?: Record<string, unknown>; resumo?: string; s?: number;
};
export type Opcao = { id: string; rotulo: string; efeito?: string };
export type DadosPergunta = { turno: Turno; tool_use_id: string; texto: string; opcoes: Opcao[]; sugestao?: string; aceita_texto: boolean };
export type DadosConfirmacao = {
  turno: Turno; tool_use_id: string; acao: 'ajuste' | 'pedido'; versao?: string; titulo: string; texto_exato: string;
  mudancas?: { campo: string; antes: string; depois: string }[]; refaz: ('direcao' | 'montagem' | 'qa')[]; comeca_agora: boolean;
  custo_usd_est: number; minutos_est: number; vira_regra: boolean; volta: string; entrada_hash: string;
  atencao?: string;      // escrito pelo motor: o texto repete algo de fora (fala de vídeo, texto de cliente)
};
export type DadosResposta = {
  tool_use_id: string; tipo: 'pergunta' | 'confirmacao'; escolha_id?: string; texto?: string; sim?: boolean;
  resultado?: 'feito' | 'cancelado' | 'nao_deu'; detalhe?: string; por: 'dono' | 'mensagem';
};
export type Parada = 'end_turn' | 'pausa' | 'parado' | 'erro' | 'teto' | 'recusa' | 'limite';
export type DadosTurnoFim = {
  turno: Turno; stop: Parada; custo_usd: number; estimado?: boolean; s: number; texto_parcial?: string; detalhe?: string;
  gasto_hoje_usd: number; tokens?: Tokens;
};
export type DadosMostrar = { versao?: string; arquivo_id?: string; tempo_s?: number };
export type DadosAvisoRetomar = { acao: 'retomar'; turno: Turno };
// onda 2, mesa ao vivo: quem trabalha, com que ferramenta e modelo, quanto tempo, quanto custou e o que achou
export type FasePasso = 'inicio' | 'fim' | 'erro' | 'interrompido';
export type DadosPasso = {
  passo: string; pai?: string; chave: string; fase: FasePasso; ferramenta?: string; modelo?: string; esforco?: 'low' | 'medium' | 'high';
  s?: number; custo_usd?: number; custo_total_usd?: number; estimado?: boolean; tokens?: Tokens; conta?: string;
  numeros?: Record<string, number | string>; achado?: string;
};
export type DadosDecisao = {
  conceito: string; gancho: string; alem_do_pedido: string; riscos: string[]; critica: string;
  blocos?: { id: string; funcao: string; intensidade?: number }[]; trilha?: { clima: string; drop_em?: string };
};

// efêmeros (sem id: não entram no "vistos" nem mexem no Last-Event-ID)
export type DadosRascunho = { turno: Turno; bloco: number; texto: string; andamento?: string; v: number };
export type MotivoDesligada = 'sem_chave' | 'desligada_no_servidor' | 'desligada_pelo_dono' | 'outro_processo';
export type DadosInstantaneo = {
  ligada: boolean; motivo?: MotivoDesligada; turno_rodando?: Turno; rascunho?: DadosRascunho;
  espera?: { tipo: 'pergunta' | 'confirmacao'; tool_use_id: string }; gasto_hoje_usd: number; teto_usd_dia: number;
  passos_abertos?: { passo: string; chave: string; desde: string }[];
};

export const TIPOS_CONVERSA = ['fala_dono', 'fala_editor', 'ferramenta', 'pergunta', 'confirmacao', 'resposta', 'turno_fim', 'mostrar'] as const;
export const TIPOS_EFEMEROS = ['rascunho', 'instantaneo', 'ping'] as const;

// R1
export type EstadoChave = {
  ligada: boolean; motivo?: MotivoDesligada; teto_usd_dia: number; gasto_hoje_usd: number; dia_vira_em?: string;
  esperando: { projeto: string; nome: string; tipo: 'pergunta' | 'confirmacao'; desde: string }[];
};

export type Resultado<T> = { ok: true; status: number; dados: T } | { ok: false; status: number; erro: string };

/** Mensagem do motor ({detail}) em pt-BR; sem rede vira status 0. */
async function chamar<T>(caminho: string, init: RequestInit = {}): Promise<Resultado<T>> {
  let r: Response;
  try {
    r = await fetch(`/api/motor/v1${caminho}`, { cache: 'no-store', ...init });
  } catch {
    return { ok: false, status: 0, erro: 'Sem internet agora. O que você mandou fica guardado e sai quando a rede voltar.' };
  }
  const c = await r.json().catch(() => null);
  if (r.ok) return { ok: true, status: r.status, dados: c as T };
  const d = (c as { detail?: unknown } | null)?.detail;
  let erro = typeof d === 'string' ? d : Array.isArray(d) ? d.map((x: { msg?: string }) => x?.msg ?? '').filter(Boolean).join('; ') : '';
  if (!erro) erro = r.status === 401 ? 'entre com a senha de novo' : r.status >= 500 ? 'o editor está reiniciando; tente de novo em instantes' : `o editor recusou (${r.status})`;
  return { ok: false, status: r.status, erro: primeiraMaiuscula(erro) };
}
const primeiraMaiuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const json = (corpo: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo ?? {}) });

export const chave = () => chamar<EstadoChave>('/conversa');
export const mudarChave = (ligada: boolean) => chamar<EstadoChave>('/conversa', json({ ligada }));
export const enviar = (pid: string, corpo: { texto: string; via: 'texto' | 'audio'; contexto?: Contexto; cliente_msg_id: string }) =>
  chamar<{ turno: Turno; na_fila: boolean }>(`/projetos/${pid}/conversa`, json(corpo));
export const responder = (pid: string, corpo: { tool_use_id: string; escolha_id?: string; texto?: string }) =>
  chamar<{ turno: Turno }>(`/projetos/${pid}/conversa/responder`, json(corpo));
export const confirmar = (pid: string, corpo: { tool_use_id: string; sim: boolean; entrada_hash: string; so_neste_projeto?: boolean }) =>
  chamar<{ feito: boolean; resultado?: { nova_direcao?: boolean; dirigindo?: boolean } }>(`/projetos/${pid}/conversa/confirmar`, json(corpo));
export const parar = (pid: string) => chamar<{ parou: boolean }>(`/projetos/${pid}/conversa/parar`, json({}));
export const retomar = (pid: string) => chamar<{ turno: Turno }>(`/projetos/${pid}/conversa/retomar`, json({}));
/** R4: só transcreve; o texto volta para o campo e nada é enviado sem o toque do dono. */
export const transcrever = (pid: string, audio: Blob) =>
  chamar<{ texto: string; conf: number; s_audio: number; s: number }>(`/projetos/${pid}/conversa/audio`, {
    method: 'POST', headers: { 'content-type': tipoDoAudio(audio.type) }, body: audio,
  });

/** O motor aceita audio/webm, audio/mp4, audio/ogg e audio/x-m4a (com ;codecs=). Sem tipo, o iPhone grava mp4. */
export function tipoDoAudio(t: string): string {
  const base = (t || '').split(';')[0].trim().toLowerCase();
  return ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/x-m4a'].includes(base) ? t : base === 'video/mp4' ? 'audio/mp4' : base === 'video/webm' ? 'audio/webm' : 'audio/mp4';
}

/** cliente_msg_id: 8 a 40 caracteres [A-Za-z0-9_-]; o mesmo id devolve o mesmo turno (reenviar é seguro). */
export function novoCmid(): string {
  const b = new Uint8Array(12);
  crypto.getRandomValues(b);
  return 'm_' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** "US$ 0,05" com vírgula; abaixo de 1 centavo mostra 3 casas para não virar "US$ 0,00". */
export function usd(v: number | null | undefined): string {
  const n = Number(v) || 0;
  const casas = n > 0 && n < 0.01 ? 3 : 2;
  return `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
}
export function segundos(s: number | null | undefined): string {
  const n = Math.max(0, Number(s) || 0);
  if (n < 60) return `${n.toLocaleString('pt-BR', { maximumFractionDigits: n < 10 ? 1 : 0 })} s`;
  return `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')} min`;
}
export function mmss(s: number | null | undefined): string {
  const n = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

/** Evento de janela que o Topo escuta para reler a chave e quem espera o dono (selo, número e título da aba). */
export const EVENTO_CONVERSA = 'editor:conversa';
export function avisarMudanca() {
  try { window.dispatchEvent(new Event(EVENTO_CONVERSA)); } catch { /* sem janela */ }
}
