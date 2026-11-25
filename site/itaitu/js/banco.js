// banco.js · IndexedDB único 'itaitu', versão 1 (ARQUITETURA 7.7). Só este módulo abre o banco.
// Sem IndexedDB (modo privado antigo, bloqueado): cai para a memória da página, avisa uma vez
// com console.info e o app segue (a gravação só não sobrevive a fechar a aba).

const NOME = 'itaitu';
const VERSAO = 1;
export const STORES = Object.freeze({
  trilhas: 'id',
  'marcas-local': 'slug',
  'pontos-local': 'id',
  marcados: 'id',
  caderno: 'id',
  kit: 'chave',
  config: 'chave',
});

let promessa = null;
let memoria = null;          // Map<store, Map<chave, valor>> quando não há IndexedDB
let avisou = false;

function usarMemoria(motivo) {
  if (!memoria) {
    memoria = new Map(Object.keys(STORES).map((s) => [s, new Map()]));
    if (!avisou) { avisou = true; console.info('[banco] sem IndexedDB, guardando só na memória:', motivo); }
  }
  return null;
}

export function abrir() {
  if (promessa) return promessa;
  promessa = new Promise((resolve) => {
    let req;
    try {
      if (typeof indexedDB === 'undefined') { resolve(usarMemoria('indefinido')); return; }
      req = indexedDB.open(NOME, VERSAO);
    } catch (e) { resolve(usarMemoria(e && e.name)); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [store, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(store)) {
          const os = db.createObjectStore(store, { keyPath });
          if (store === 'trilhas') os.createIndex('criada_em', 'criada_em');
        }
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { try { db.close(); } catch (_) {} promessa = null; };
      resolve(db);
    };
    req.onerror = () => resolve(usarMemoria(req.error && req.error.name));
    req.onblocked = () => console.info('[banco] abertura esperando outra aba fechar');
  });
  return promessa;
}

export function emMemoria() { return !!memoria; }

function pedido(req) {
  return new Promise((ok, falha) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
}

async function os(store, modo) {
  if (!(store in STORES)) throw new Error(`store desconhecida: ${store}`);
  const db = await abrir();
  if (!db) return null;
  return db.transaction(store, modo).objectStore(store);
}

const clonar = (v) => (v == null ? v : (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v))));

export async function obter(store, chave) {
  const o = await os(store, 'readonly');
  if (!o) return clonar(memoria.get(store).get(chave)) ?? null;
  return (await pedido(o.get(chave))) ?? null;
}

export async function listar(store) {
  const o = await os(store, 'readonly');
  if (!o) return [...memoria.get(store).values()].map(clonar);
  return pedido(o.getAll());
}

export async function gravar(store, valor) {
  const o = await os(store, 'readwrite');
  if (!o) { memoria.get(store).set(valor[STORES[store]], clonar(valor)); return valor; }
  await pedido(o.put(valor));
  return valor;
}

export async function apagar(store, chave) {
  const o = await os(store, 'readwrite');
  if (!o) { memoria.get(store).delete(chave); return; }
  await pedido(o.delete(chave));
}
