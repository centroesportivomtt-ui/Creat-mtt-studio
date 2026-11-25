// Nada que o dono escreveu ou falou se perde: o texto do campo e as mensagens que ainda não saíram ficam na sessão da
// aba (sessionStorage); os pedaços de áudio ficam no IndexedDB até a transcrição voltar 200. Sem armazenamento (aba
// privada, cota cheia), tudo segue funcionando em memória e nada quebra.
import type { Contexto } from './conversa';

const chaveCampo = (pid: string) => `ec-conversa-${pid}`;
const chaveFila = (pid: string) => `ec-conversa-fila-${pid}`;

export type Campo = { texto: string; via: 'texto' | 'audio' };
export function lerCampo(pid: string): Campo | null {
  try {
    const c = JSON.parse(sessionStorage.getItem(chaveCampo(pid)) ?? 'null') as Campo | null;
    return c && typeof c.texto === 'string' ? { texto: c.texto, via: c.via === 'audio' ? 'audio' : 'texto' } : null;
  } catch { return null; }
}
export function guardarCampo(pid: string, c: Campo) {
  try {
    if (c.texto.trim()) sessionStorage.setItem(chaveCampo(pid), JSON.stringify(c));
    else sessionStorage.removeItem(chaveCampo(pid));
  } catch { /* sem armazenamento */ }
}

/** Mensagem que o dono mandou e o motor ainda não confirmou (sem rede, motor reiniciando, sessão vencida). */
export type Saindo = { cmid: string; texto: string; via: 'texto' | 'audio'; contexto?: Contexto; criado: number; falhou?: string };
export function lerFila(pid: string): Saindo[] {
  try {
    const l = JSON.parse(sessionStorage.getItem(chaveFila(pid)) ?? '[]') as Saindo[];
    return Array.isArray(l) ? l.filter((m) => m && typeof m.cmid === 'string' && typeof m.texto === 'string').slice(-20) : [];
  } catch { return []; }
}
export function gravarFila(pid: string, l: Saindo[]) {
  try {
    if (l.length) sessionStorage.setItem(chaveFila(pid), JSON.stringify(l.slice(-20)));
    else sessionStorage.removeItem(chaveFila(pid));
  } catch { /* sem armazenamento */ }
}

// ---------- áudio no IndexedDB ----------
const BANCO = 'editor-conversa';
const LOJA = 'audio';
export type PedacoGuardado = { chave: string; pid: string; n: number; blob: Blob; criado: number };

function abrir(): Promise<IDBDatabase | null> {
  return new Promise((ok) => {
    try {
      if (typeof indexedDB === 'undefined') return ok(null);
      const r = indexedDB.open(BANCO, 1);
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(LOJA)) r.result.createObjectStore(LOJA, { keyPath: 'chave' }); };
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
      r.onblocked = () => ok(null);
    } catch { ok(null); }
  });
}
async function comLoja<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  const db = await abrir();
  if (!db) return null;
  return new Promise((ok) => {
    try {
      const tx = db.transaction(LOJA, modo);
      const r = fn(tx.objectStore(LOJA));
      tx.oncomplete = () => { db.close(); ok(r ? (r.result as T) : null); };
      tx.onerror = () => { db.close(); ok(null); };
      tx.onabort = () => { db.close(); ok(null); };
    } catch { db.close(); ok(null); }
  });
}
export async function guardarAudio(pid: string, n: number, blob: Blob): Promise<string> {
  const chave = `${pid}/${Date.now().toString(36)}-${n}`;
  await comLoja('readwrite', (s) => s.put({ chave, pid, n, blob, criado: Date.now() } satisfies PedacoGuardado));
  return chave;
}
export async function apagarAudio(chave: string) {
  await comLoja('readwrite', (s) => s.delete(chave));
}
export async function audiosGuardados(pid: string): Promise<PedacoGuardado[]> {
  const todos = (await comLoja<PedacoGuardado[]>('readonly', (s) => s.getAll() as IDBRequest<PedacoGuardado[]>)) ?? [];
  // pedaço com mais de 2 dias não volta (o dono já seguiu a vida)
  const vivos = todos.filter((p) => p.pid === pid && Date.now() - p.criado < 2 * 864e5);
  for (const p of todos.filter((p) => p.pid === pid && !vivos.includes(p))) void apagarAudio(p.chave);
  return vivos.sort((a, b) => a.criado - b.criado || a.n - b.n);
}

/** Sessão vencida: o texto e o áudio já estão guardados; vai entrar de novo e volta para esta página. */
export function irEntrar(pid: string) {
  window.location.assign(`/entrar?volta=${encodeURIComponent(`/projetos/${pid}`)}`);
}

/** Sair: apaga do aparelho tudo o que a conversa guardou (texto do campo, fila de mensagens, conversa aberta e os
 *  áudios guardados no IndexedDB). Celular emprestado ou perdido não fica com o que o dono escreveu ou gravou. */
export function limparAparelho(): Promise<void> {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith('ec-conversa')) sessionStorage.removeItem(k);
    }
  } catch { /* sem armazenamento */ }
  return new Promise((ok) => {
    try {
      if (typeof indexedDB === 'undefined') return ok();
      const r = indexedDB.deleteDatabase(BANCO);
      const fim = () => ok();
      r.onsuccess = fim; r.onerror = fim; r.onblocked = fim;
      setTimeout(fim, 800);                       // nunca segura o Sair
    } catch { ok(); }
  });
}
