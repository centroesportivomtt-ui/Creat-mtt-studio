// pin.js · PIN local de 4 dígitos (ARQUITETURA 7.7, store 'config', chave 'pin').
// Guarda { chave: 'pin', sal, hash, iteracoes, alg, criado_em }: PBKDF2-SHA-256 do WebCrypto, 100.000
// iterações, sal aleatório de 16 bytes. O PIN nunca é gravado. Isto é PROTEÇÃO DE USO, NÃO COFRE:
// 4 dígitos são 10.000 combinações e quem tem o aparelho destravado pode ler o IndexedDB e testar todas.
// Serve para o dono da pousada não sair da vitrine nem abrir o caderno sem querer.

import * as banco from '../banco.js';

export const ITERACOES = 100000;
const BYTES_SAL = 16;
const BITS = 256;
const MAX_ERROS = 5;
const ESPERA_MS = 30000;

let erros = 0;
let bloqueadoAte = 0;

export const PIN_VALIDO = /^\d{4}$/;
export function criptoDisponivel() { return !!(globalThis.crypto && crypto.subtle && crypto.getRandomValues); }

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const deB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function derivar(pin, sal, iteracoes = ITERACOES) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteracoes }, chave, BITS));
}

function iguais(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export async function lerRegistro() {
  try { return await banco.obter('config', 'pin'); } catch (_) { return null; }
}
export async function temPin() { const r = await lerRegistro(); return !!(r && r.hash && r.sal); }

export async function definirPin(pin) {
  if (!PIN_VALIDO.test(pin)) throw new Error('formato');
  if (!criptoDisponivel()) throw new Error('cripto');
  const sal = crypto.getRandomValues(new Uint8Array(BYTES_SAL));
  const hash = await derivar(pin, sal);
  await banco.gravar('config', { chave: 'pin', alg: 'PBKDF2-SHA-256', iteracoes: ITERACOES, sal: b64(sal), hash: b64(hash), criado_em: new Date().toISOString() });
  erros = 0; bloqueadoAte = 0;
}

// { ok: true } | { ok: false, motivo: 'errado' | 'espere' | 'sem-pin' | 'formato' | 'cripto', esperaS? }
export async function conferirPin(pin) {
  const agora = Date.now();
  if (agora < bloqueadoAte) return { ok: false, motivo: 'espere', esperaS: Math.ceil((bloqueadoAte - agora) / 1000) };
  if (!PIN_VALIDO.test(pin || '')) return { ok: false, motivo: 'formato' };
  if (!criptoDisponivel()) return { ok: false, motivo: 'cripto' };
  const r = await lerRegistro();
  if (!r || !r.hash) return { ok: false, motivo: 'sem-pin' };
  const calc = await derivar(pin, deB64(r.sal), r.iteracoes || ITERACOES);
  if (iguais(calc, deB64(r.hash))) { erros = 0; return { ok: true }; }
  erros++;
  if (erros >= MAX_ERROS) { erros = 0; bloqueadoAte = Date.now() + ESPERA_MS; return { ok: false, motivo: 'espere', esperaS: ESPERA_MS / 1000 }; }
  return { ok: false, motivo: 'errado' };
}
