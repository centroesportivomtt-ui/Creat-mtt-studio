// Cliente do motor (API §4.6 da ARQUITETURA) usado pelo servidor do site. O token nunca vai ao navegador.
// Pronto para serverless (Vercel): sem disco, sem estado entre requisições. Em produção MOTOR_URL é a URL pública
// do motor na Modal (https://...modal.run) e MOTOR_TOKEN o mesmo token do secret "editor-motor".

export const MOTOR_URL = (process.env.MOTOR_URL ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');

/** Limite de tempo da função na Vercel (s). Igual ao `maxDuration` das rotas longas e ao vercel.json. */
export const LIMITE_FUNCAO_S = 300;
/** Janela de cada conexão SSE (s): fecha antes do limite da função; o EventSource reconecta com Last-Event-ID. */
export const JANELA_SSE_S = Math.max(20, Math.min(Number(process.env.MOTOR_SSE_JANELA_S) || 240, LIMITE_FUNCAO_S - 30));
/** Batimento: comentário SSE quando o motor fica calado (proxies e celulares derrubam conexão parada). */
export const BATIMENTO_MS = 15_000;

/** Na Vercel, MOTOR_URL precisa existir e ser https (o padrão 127.0.0.1 só vale na máquina do motor). */
export function faltaConfigMotor(): string | null {
  if (!process.env.VERCEL) return null;
  const url = (process.env.MOTOR_URL ?? '').trim();
  if (!url) return 'MOTOR_URL não configurada na Vercel';
  if (!url.startsWith('https://')) return 'MOTOR_URL precisa ser https:// em produção';
  if (!(process.env.MOTOR_TOKEN ?? '').trim()) return 'MOTOR_TOKEN não configurado na Vercel';
  return null;
}

export function cabecalhosMotor(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  const token = process.env.MOTOR_TOKEN ?? '';
  if (token) h.set('authorization', `Bearer ${token}`);
  return h;
}

export function motor(caminho: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${MOTOR_URL}${caminho}`, { ...init, headers: cabecalhosMotor(init.headers), cache: 'no-store' });
}

/** Mensagem de erro em pt-BR a partir da resposta do FastAPI ({detail: string | [{msg}]}). */
export function mensagemDeErro(corpo: unknown, status: number): string {
  const d = (corpo as { detail?: unknown } | null)?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d.length) return d.map((x) => (x as { msg?: string }).msg ?? '').filter(Boolean).join('; ');
  if (status === 401) return 'o site não está autorizado no motor (MOTOR_TOKEN)';
  if (status >= 500) return 'o motor teve um problema; tente de novo em instantes';
  return `o motor respondeu ${status}`;
}

export type Resultado<T> = { ok: true; dados: T } | { ok: false; status: number; erro: string };

export async function motorJson<T>(caminho: string, init: RequestInit = {}): Promise<Resultado<T>> {
  const falta = faltaConfigMotor();
  if (falta) return { ok: false, status: 503, erro: falta };
  let r: Response;
  try {
    r = await motor(caminho, init);
  } catch {
    return { ok: false, status: 503, erro: 'o motor está fora do ar agora; o site tenta de novo sozinho' };
  }
  const corpo = await r.json().catch(() => null);
  if (!r.ok) return { ok: false, status: r.status, erro: mensagemDeErro(corpo, r.status) };
  return { ok: true, dados: corpo as T };
}

/**
 * Repassa um fluxo SSE do motor com batimento e prazo:
 * - sem nada do motor por `batimentoMs`, envia `: ping` (mantém a conexão viva no 4G e em proxies);
 * - ao chegar em `janelaMs`, fecha LIMPO entre eventos (antes do limite da função na Vercel). O EventSource do
 *   navegador reconecta sozinho em ~2 s mandando Last-Event-ID, e o motor continua de onde parou: nenhum evento se perde.
 * Só corta em fronteira de evento (`\n\n`), nunca no meio de um.
 */
export function sseComBatimento(
  origem: ReadableStream<Uint8Array>,
  { janelaMs = JANELA_SSE_S * 1000, batimentoMs = BATIMENTO_MS, aoFechar }: { janelaMs?: number; batimentoMs?: number; aoFechar?: () => void } = {},
): ReadableStream<Uint8Array> {
  const cod = new TextEncoder();
  const leitor = origem.getReader();
  let ultimo = Date.now();
  let pendente = '';                     // texto desde o último '\n\n' (evento pela metade)
  const dec = new TextDecoder();
  let fechado = false;
  let relogio: ReturnType<typeof setInterval> | undefined;
  let prazo: ReturnType<typeof setTimeout> | undefined;
  let vencido = false;

  const limpar = () => {
    if (relogio) clearInterval(relogio);
    if (prazo) clearTimeout(prazo);
    aoFechar?.();
  };

  return new ReadableStream<Uint8Array>({
    start(ctl) {
      const fechar = () => {
        if (fechado) return;
        fechado = true;
        limpar();
        leitor.cancel().catch(() => {});
        try {
          ctl.close();
        } catch {
          /* já fechado */
        }
      };
      relogio = setInterval(() => {
        if (fechado) return;
        if (Date.now() - ultimo >= batimentoMs && pendente === '') {
          ultimo = Date.now();
          ctl.enqueue(cod.encode(': ping\n\n'));
        }
      }, Math.max(50, Math.min(batimentoMs, 5_000)));
      prazo = setTimeout(() => {
        vencido = true;
        if (pendente === '') fechar();   // senão fecha assim que o evento em curso terminar
      }, janelaMs);
      (async () => {
        try {
          for (;;) {
            const { value, done } = await leitor.read();
            if (done || fechado) break;
            ultimo = Date.now();
            ctl.enqueue(value);
            pendente = (pendente + dec.decode(value, { stream: true })).split('\n\n').pop() ?? '';
            if (vencido && pendente === '') break;
          }
        } catch {
          /* motor caiu: o EventSource reconecta */
        }
        fechar();
      })();
    },
    cancel() {
      fechado = true;
      limpar();
      leitor.cancel().catch(() => {});
    },
  });
}
