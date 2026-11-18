// Cliente do motor (API §4.6 da ARQUITETURA) usado pelo servidor do site. O token nunca vai ao navegador.

export const MOTOR_URL = (process.env.MOTOR_URL ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');

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
