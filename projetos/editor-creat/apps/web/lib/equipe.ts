// Quem faz cada passo (agente, cor, inicial, verbo rodando e frase feita). Os dados são uma cópia de
// packages/schemas/equipe.json (o Dockerfile.web só copia apps/web); o aceite confere que as duas são iguais.
// O rótulo sai do código, nunca do modelo: a tela não inventa número. Nunca nome de arquivo no rótulo ({n} = vídeo n).
import equipe from './equipe.json';

type Passo = { chave: string; agente: string; rodando: string | null; feito: string | null; cartao?: string };
type Agente = { cargo: string; cor: string; inicial: string };
const AGENTES = equipe.agentes as Record<string, Agente>;
const PASSOS = equipe.passos as Passo[];
const CHECAGENS = (equipe as { checagens?: Record<string, string> }).checagens ?? {};

export type Quem = { agente: string; cor: string; inicial: string; cargo: string };
export function quem(agente: string): Quem {
  const a = AGENTES[agente] ?? AGENTES.Nimbus;
  return { agente: AGENTES[agente] ? agente : 'Nimbus', cor: a.cor, inicial: a.inicial, cargo: a.cargo };
}

function achar(chave: string): Passo | null {
  return PASSOS.find((p) => p.chave === chave) ?? PASSOS.find((p) => p.chave.endsWith('.*') && chave.startsWith(p.chave.slice(0, -1))) ?? null;
}

/** Troca {chaves} pelos números; se faltar algum número, devolve null (quem chama usa um texto sem número). */
function preencher(modelo: string | null, numeros: Record<string, string | number | undefined>): string | null {
  if (!modelo) return null;
  let falta = false;
  const t = modelo.replace(/\{([^}]+)\}/g, (_, k: string) => {
    const v = numeros[k];
    if (v === undefined || v === null || v === '') { falta = true; return ''; }
    return String(v);
  });
  return falta ? null : t;
}

const mmss = (s: unknown) => {
  const n = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
};

/** Rótulo de uma ferramenta da conversa (chave conversa.<nome>). Desconhecida: "Nimbus · Trabalhando". */
export function rotuloFerramenta(nome: string, fase: 'inicio' | 'fim' | 'erro', entrada?: Record<string, unknown>, resumo?: string) {
  const p = achar(`conversa.${nome}`);
  const q = quem(p?.agente ?? 'Nimbus');
  const numeros: Record<string, string | number | undefined> = {
    'mm:ss': entrada && entrada.tempo_s !== undefined ? mmss(entrada.tempo_s) : undefined,
    versao: typeof entrada?.versao === 'string' ? entrada.versao.toUpperCase() : undefined,
    agente: typeof entrada?.chave === 'string' ? (achar(entrada.chave)?.agente ?? undefined) : undefined,
  };
  let texto: string;
  if (fase === 'inicio') texto = preencher(p?.rodando ?? null, numeros) ?? (p?.rodando ? p.rodando.replace(/\s*\{[^}]+\}/g, '').replace(/\s+de$/, '') : 'Trabalhando');
  else if (fase === 'erro') texto = resumo ? `não deu: ${resumo}` : 'não deu certo';
  else texto = resumo || preencher(p?.feito ?? null, numeros) || (p?.feito ? p.feito.replace(/\s*\{[^}]+\}/g, '') : 'Feito');
  return { ...q, texto, conhecida: Boolean(p) };
}

// Etapas do motor (eventos etapa_* que já existem): quem faz e o que diz. A montagem tem quatro mãos de verdade
// (voz, planos, legendas e composição), então mostra as quatro.
const ETAPAS: Record<string, { agentes: string[]; rodando: string; feito: string; erro: string }> = {
  ingest: { agentes: ['Trilho'], rodando: 'Recebendo o vídeo {n}', feito: 'Recebeu o vídeo {n}', erro: 'Não conseguiu receber o vídeo {n}' },
  analise: { agentes: ['Radar'], rodando: 'Ouvindo e olhando o vídeo {n}', feito: 'Leu o vídeo {n}: falas e quadros', erro: 'Não conseguiu ler o vídeo {n}' },
  catalogo: { agentes: ['Radar'], rodando: 'Organizando o material', feito: 'Material organizado', erro: 'Não conseguiu organizar o material' },
  direcao: { agentes: ['Faísca'], rodando: 'Dirigindo o filme', feito: 'Direção pronta', erro: 'A direção parou' },
  montagem: { agentes: ['Eco', 'Paleta', 'Órbita', 'Trilho'], rodando: 'Montando a {versao}: voz, planos, legendas e mix', feito: '{versao} montada', erro: 'A montagem da {versao} parou' },
  qa: { agentes: ['Lupa'], rodando: 'Conferindo a {versao}', feito: 'Conferência da {versao} pronta', erro: 'A conferência da {versao} segurou a entrega' },
  entrega: { agentes: ['Trilho'], rodando: 'Entregando a {versao}', feito: '{versao} entregue', erro: 'A entrega da {versao} parou' },
};
export function rotuloEtapa(etapa: string, fase: 'rodando' | 'feito' | 'erro', numeros: { n?: number; versao?: string }) {
  const e = ETAPAS[etapa] ?? { agentes: ['Nimbus'], rodando: 'Trabalhando', feito: 'Feito', erro: 'Parou' };
  const nums = { n: numeros.n, versao: numeros.versao?.toUpperCase() };
  const modelo = e[fase];
  const texto = preencher(modelo, nums) ?? modelo.replace(/\s*(d[aoe] )?\{[^}]+\}:?/g, '').replace(/^ /, '').trim();
  return { agentes: e.agentes.map(quem), texto: texto ? texto[0].toUpperCase() + texto.slice(1) : texto };
}

/** Nome da checagem do QA na língua do dono ("zona segura", "volume (LUFS)"); desconhecida fica com o id. */
export function nomeChecagem(id: string): string {
  return CHECAGENS[id] ?? id.replace(/_/g, ' ');
}

/** Quem faz um passo da mesa (chave do evento `passo`). */
export function agenteDoPasso(chave: string): Quem {
  return quem(achar(chave)?.agente ?? 'Nimbus');
}

/** Rótulo de um passo da mesa (onda 2): gerúndio rodando, passado com os números do motor quando termina.
 *  "Radar · Ouvindo as falas do vídeo 2" → "Radar · Ouviu 14 falas". Sem o número, a frase sai sem ele (nunca "{n}"). */
export function rotuloPasso(chave: string, fase: 'inicio' | 'fim' | 'erro' | 'interrompido', numeros: Record<string, string | number> = {}, s?: number) {
  const p = achar(chave);
  const q = quem(p?.agente ?? 'Nimbus');
  const nums: Record<string, string | number | undefined> = { ...numeros };
  if (typeof nums.versao === 'string') nums.versao = nums.versao.toUpperCase();
  if (typeof nums.nome === 'string') nums.nome = nomeChecagem(nums.nome);
  if (typeof s === 'number') nums.s = s < 10 ? s.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : Math.round(s);
  // sem o número, a frase perde o pedaço inteiro ("de {n} trechos", "em {s} s"), nunca fica com buraco
  const sem = (t: string) => t
    .replace(/\{([^}]+)\}/g, (m, k: string) => (nums[k] === undefined || nums[k] === '' ? m : String(nums[k])))
    .replace(/^\{[^}]+\}\s*/, '')
    .replace(/\s*(?:de |do |da |em |a )?\{[^}]+\}(?:\s+(?:trechos|planos|camadas|quadros|blocos|falas|momentos|números|MB|s)\b)?/g, '')
    .replace(/\s*,\s*(?=,|$)/g, '').replace(/:\s*,\s*/g, ': ').replace(/[\s·:,]+$/, '').replace(/\s{2,}/g, ' ').trim();
  let texto: string;
  if (fase === 'inicio') texto = sem(p?.rodando ?? 'Trabalhando');
  else if (fase === 'erro') texto = `${sem(p?.rodando ?? 'O passo')}: parou`;
  else if (fase === 'interrompido') texto = `${sem(p?.rodando ?? 'O passo')}: interrompido`;
  else texto = sem(p?.feito ?? 'Feito');
  return { ...q, texto: texto ? texto[0].toUpperCase() + texto.slice(1) : texto, conhecido: Boolean(p) };
}
