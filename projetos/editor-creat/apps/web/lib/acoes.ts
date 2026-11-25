// Onda 3 (docs/plano-onda3-25-11.md, seções 1, 7, 8 e 10): refazer uma etapa pela tela ("Tentar de novo", "Conferir de
// novo", "Ler de novo"), apagar o projeto (só pela tela, com o nome digitado), tirar um filme da página de entregas e apagar
// uma regra da casa no Caderno. Tudo pelo proxy do site (/api/motor/v1/...): o token do motor nunca vem ao navegador.
// Os tipos espelham as respostas do motor (R11 a R19); campo novo é sempre opcional.

export type DeRefazer = 'montagem' | 'conferencia' | 'entrega' | 'leitura' | 'catalogo' | 'direcao';
export type EtapaRefaz = 'direcao' | 'montagem' | 'qa' | 'entrega' | 'leitura' | 'encaixe';

/** R11: uma opção de refazer (já passou na guarda do motor no momento da leitura). Todo texto vem do código do motor. */
export type Opcao = {
  de: DeRefazer;
  versao?: string; arquivo_id?: string; n_video?: number;
  titulo: string;            // "Montar de novo a v2"
  faz: string;               // o que vai acontecer, numa frase
  refaz: EtapaRefaz[];
  custo_usd_est: number; custo_ate: boolean;          // true: "até US$ x" (sem histórico)
  partes?: { rotulo: string; usd: number }[];
  minutos_est: number;
  atencao?: string; volta: string; botao: string;
  pela_conversa: boolean;
};
export type Opcoes = { opcoes: Opcao[]; sugerida: number | null };

/** R13: o que vai e o que fica, e se dá para apagar agora (pode=false traz a frase da recusa). */
export type EstadoNaPagina = 'no_ar' | 'pendente' | 'enviando' | 'retirando';
export type Previa = {
  pode: boolean; porque?: string; nome: string;
  vai_apagar: { videos: number; bytes: number; versoes: number; mensagens_conversa: number; links_cliente_ativos: number };
  na_pagina: { versao: string; estado: EstadoNaPagina; proxima?: string }[];
  fica: string[];
  restos_previstos?: { pagina_desligada?: string[]; copia_material?: number };
};

/** R19: de onde veio um item do Caderno (sem `nome` = o projeto foi apagado). */
export type DeOnde = { projeto?: string; nome?: string; versao?: string; data?: string };
export type ItemCaderno = { id?: string; apagavel?: boolean; de_onde?: DeOnde; ao_apagar?: string; origem?: string };
export type TipoMemoria = 'regra' | 'checagem' | 'vocabulario';

export type Resultado<T> = { ok: true; status: number; dados: T } | { ok: false; status: number; erro: string };

async function chamar<T>(caminho: string, init: RequestInit = {}): Promise<Resultado<T>> {
  let r: Response;
  try {
    r = await fetch(`/api/motor/v1${caminho}`, { cache: 'no-store', ...init });
  } catch {
    return { ok: false, status: 0, erro: 'Sem conexão com o editor agora. Confira a internet e tente de novo.' };
  }
  const c = await r.json().catch(() => null);
  if (r.ok) return { ok: true, status: r.status, dados: c as T };
  const d = (c as { detail?: unknown } | null)?.detail;
  let erro = typeof d === 'string' ? d : Array.isArray(d) ? d.map((x: { msg?: string }) => x?.msg ?? '').filter(Boolean).join('; ') : '';
  if (!erro) erro = r.status === 401 ? 'entre com a senha de novo' : r.status >= 500 ? 'o editor está reiniciando; tente de novo em instantes' : `o editor recusou (${r.status})`;
  return { ok: false, status: r.status, erro: maiuscula(erro) };
}
export const maiuscula = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const post = (corpo: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo ?? {}) });

export const refazerOpcoes = (pid: string) => chamar<Opcoes>(`/projetos/${pid}/refazer`);
export const refazer = (pid: string, o: Pick<Opcao, 'de' | 'versao' | 'arquivo_id'>) =>
  chamar<{ feito: true; de: DeRefazer; alvo: string; estado: string }>(`/projetos/${pid}/refazer`, post({
    de: o.de, ...(o.versao && ['montagem', 'conferencia', 'entrega'].includes(o.de) ? { versao: o.versao } : {}),
    ...(o.arquivo_id && o.de === 'leitura' ? { arquivo_id: o.arquivo_id } : {}),
  }));
export const previaApagar = (pid: string) => chamar<Previa>(`/projetos/${pid}/apagar`);
export const apagar = (pid: string, nome: string) => chamar<{ apagado: true; arquivos: string }>(`/projetos/${pid}/apagar`, post({ nome }));
export const retirar = (pid: string, versao: string) => chamar<{ estado: 'retirando' }>(`/projetos/${pid}/versoes/${versao}/retirar`, post({}));
const ROTA_MEMORIA: Record<TipoMemoria, string> = { regra: 'regras', checagem: 'checagens', vocabulario: 'vocabulario' };
export const apagarMemoria = (tipo: TipoMemoria, id: string) =>
  chamar<{ apagado: { tipo: TipoMemoria; id: string; texto: string } }>(`/memoria/${ROTA_MEMORIA[tipo]}/${encodeURIComponent(id)}/apagar`, post({}));

/** O mesmo teste do motor (apagar.mesmo_nome): sem caixa e com espaços normalizados; acento conta. */
export function mesmoNome(a: string, b: string): boolean {
  const n = (s: string) => s.split(/\s+/).filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
  return n(a) === n(b);
}

/** "custa ≈ US$ 0,30" ou "custa até US$ 0,30"; zero vira "não gasta". */
export function custoTexto(usdNum: number, ate: boolean): string {
  const n = Number(usdNum) || 0;
  if (n <= 0) return 'não gasta';
  const casas = n < 0.01 ? 3 : 2;
  const v = `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
  return ate ? `custa até ${v}` : `custa ≈ ${v}`;
}
export const minutosTexto = (m: number) => `≈ ${Math.max(1, Math.round(Number(m) || 0))} min`;

/** "12/11/2026" a partir de "2026-11-12". */
export function dataBr(iso?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
