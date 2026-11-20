/* Trilhas de Itaitu: service worker (escopo: a própria pasta, caminhos relativos).
 *
 * PROTOCOLO (outros módulos dependem dele; não mudar sem avisar)
 * ---------------------------------------------------------------
 * Lista: ./precache.json  { versao, casco:[url], arquivos:[{url, bytes, hash}] }
 *        gerada por projetos/itaitu-mapa/scripts/gerar-precache.mjs.
 * Cache: 'itaitu-v<versao>' (um por versão) + 'itaitu-meta' (ponteiro da versão atual e estado).
 *
 * install   guarda só o CASCO (html, css, js, manifest, ícones, vendor, marcas).
 *           Exceção que protege o offline: se a versão anterior estava completa ("pronto"),
 *           o install monta a versão nova completa (copia do cache antigo o que tem o mesmo
 *           hash e baixa só o que mudou). Se algo falhar, o install falha e o SW antigo segue.
 * activate  aponta 'itaitu-meta' para a versão nova e apaga os outros 'itaitu-v*'.
 *
 * Página -> SW (navigator.serviceWorker.controller.postMessage):
 *   {tipo:'precachear'}  baixa o pré-cache pesado (tiles, dados, fontes) que falta. Retomável:
 *                        pula o que já está no cache. Uma execução por vez.
 *   {tipo:'estado'}      pede o estado atual.
 *   {tipo:'atualizar'}   busca precache.json novo; se a versão mudou, monta o cache da versão
 *                        nova COMPLETO e só depois troca o ponteiro e apaga o antigo.
 *                        Nunca quebra o offline. Se a versão é a mesma, completa o que falta.
 *
 * SW -> páginas (new BroadcastChannel('itaitu-cache')):
 *   {tipo:'progresso', feito, total, bytes}        feito/total em arquivos; bytes já guardados
 *   {tipo:'pronto', versao, bytes, quando}         tudo guardado; quando = ISO 8601
 *   {tipo:'erro', url}                             um arquivo não baixou (segue com os outros)
 *   {tipo:'estado', versao, pronto, bytes, quando, nova_versao?}
 *        nova_versao aparece quando o SW viu um precache.json mais novo na rede
 *        (a página pode mostrar o botão "atualizar mapa").
 *
 * Estratégias de fetch (só GET da mesma origem dentro do escopo; a query string é ignorada
 * na busca do cache, então ?demo=1 funciona offline):
 *   cache primeiro      tiles/, vendor/, fontes/, js, css, ícones, imagens e o resto
 *   rede primeiro (2,5 s, cai para o cache)   dados/*.geojson, dados/info.json, marcas/*.json,
 *                                              precache.json
 *   navegação           cache primeiro: a página pedida; senão index.html
 *                       (marcos.html quando o pedido é do app particular, /marcos*)
 *   tile ausente        Response 404 limpo, sem exceção (use 'bounds' e 'maxzoom: 14' nas
 *                       fontes do MapLibre para nem pedir fora do recorte).
 */

const PREFIXO = 'itaitu-v';
const META = 'itaitu-meta';
const CANAL = 'itaitu-cache';
const ESCOPO = new URL(self.registration.scope);
const canal = new BroadcastChannel(CANAL);
const abs = (rel) => new URL(rel, ESCOPO).href;
const KEY_ATUAL = abs('__sw/atual');
const KEY_PROXIMO = abs('__sw/proximo');
const keyEstado = (v) => abs(`__sw/estado-${v}`);
const PARALELO = 4;

let tarefa = null;        // promessa do precachear/atualizar em curso (um por vez)
let novaVersaoVista = null;
let ultimaChecagem = 0;

const enviar = (m) => { try { canal.postMessage(m); } catch (_) {} };
const json = (o) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json' } });

async function lerMeta(key) {
  const c = await caches.open(META);
  const r = await c.match(key);
  return r ? r.json() : null;
}
async function gravarMeta(key, valor) {
  const c = await caches.open(META);
  await c.put(key, json(valor));
}
async function atual() { return lerMeta(KEY_ATUAL); } // {cache, versao} ou null

async function buscarLista() {
  const r = await fetch(abs('precache.json'), { cache: 'no-store' });
  if (!r.ok) throw new Error(`precache.json ${r.status}`);
  const lista = await r.json();
  return { lista, resposta: new Response(JSON.stringify(lista), { headers: { 'Content-Type': 'application/json' } }) };
}

async function listaDoCache(nomeCache) {
  if (!nomeCache) return null;
  const c = await caches.open(nomeCache);
  const r = await c.match(abs('precache.json'));
  return r ? r.json() : null;
}

/* Monta o cache 'itaitu-v<versao>' para a lista dada.
 *   urls: quais arquivos garantir (casco ou todos)
 *   antigo: {cache, lista} para copiar o que tem o mesmo hash
 * Devolve {faltando, bytes}. Retomável: pula o que já está no cache novo. */
async function montar(lista, urls, antigo, { avisar = true, pararNoErro = false } = {}) {
  const nome = PREFIXO + lista.versao;
  const cache = await caches.open(nome);
  const porUrl = new Map(lista.arquivos.map((a) => [a.url, a]));
  const hashAntigo = new Map(((antigo && antigo.lista && antigo.lista.arquivos) || []).map((a) => [a.url, a.hash]));
  const cacheAntigo = antigo && antigo.cache && antigo.cache !== nome ? await caches.open(antigo.cache) : null;
  const presentes = new Set((await cache.keys()).map((r) => r.url));

  let feito = 0, bytes = 0, faltando = 0, ultimoAviso = 0;
  const total = urls.length;
  const avisar_ = (forcar) => {
    if (!avisar) return;
    const agora = Date.now();
    if (forcar || agora - ultimoAviso > 300) { ultimoAviso = agora; enviar({ tipo: 'progresso', feito, total, bytes }); }
  };

  const fila = urls.slice();
  async function trabalhador() {
    while (fila.length) {
      const url = fila.shift();
      const info = porUrl.get(url) || { bytes: 0 };
      const chave = abs(url);
      let ok = presentes.has(chave);
      if (!ok && cacheAntigo && info.hash && hashAntigo.get(url) === info.hash) {
        const r = await cacheAntigo.match(chave);
        if (r) { await cache.put(chave, r); ok = true; }
      }
      if (!ok) {
        try {
          const r = await fetch(chave, { cache: 'reload' });
          if (r.ok) { await cache.put(chave, r); ok = true; }
        } catch (_) {}
      }
      if (ok) { feito++; bytes += info.bytes || 0; }
      else {
        faltando++;
        enviar({ tipo: 'erro', url });
        if (pararNoErro) { fila.length = 0; }
      }
      avisar_(false);
    }
  }
  await Promise.all(Array.from({ length: PARALELO }, trabalhador));
  avisar_(true);
  return { nome, faltando, bytes };
}

async function estadoDe(ponteiro) {
  if (!ponteiro) return { tipo: 'estado', versao: null, pronto: false, bytes: 0, quando: null };
  const e = (await lerMeta(keyEstado(ponteiro.versao))) || {};
  let bytes = e.bytes;
  if (!e.pronto) {
    const lista = await listaDoCache(ponteiro.cache);
    if (lista) {
      const c = await caches.open(ponteiro.cache);
      const tem = new Set((await c.keys()).map((r) => r.url));
      bytes = lista.arquivos.filter((a) => tem.has(abs(a.url))).reduce((s, a) => s + a.bytes, 0);
    }
  }
  const m = { tipo: 'estado', versao: ponteiro.versao, pronto: !!e.pronto, bytes: bytes || 0, quando: e.quando || null };
  if (novaVersaoVista && novaVersaoVista !== ponteiro.versao) m.nova_versao = novaVersaoVista;
  return m;
}

async function marcarPronto(versao, bytes) {
  const quando = new Date().toISOString();
  await gravarMeta(keyEstado(versao), { pronto: true, bytes, quando });
  enviar({ tipo: 'pronto', versao, bytes, quando });
}

async function apagarOutros(manter) {
  for (const k of await caches.keys()) {
    if (k.startsWith(PREFIXO) && k !== manter) await caches.delete(k);
  }
}

/* {tipo:'precachear'}: completa a versão atual. */
async function precachear() {
  const p = await atual();
  if (!p) { enviar(await estadoDe(null)); return; }
  const lista = await listaDoCache(p.cache);
  if (!lista) { enviar({ tipo: 'erro', url: 'precache.json' }); return; }
  const r = await montar(lista, lista.arquivos.map((a) => a.url), null);
  if (r.faltando === 0) await marcarPronto(lista.versao, r.bytes);
  else enviar(await estadoDe(p));
}

/* {tipo:'atualizar'}: versão nova completa antes de trocar. */
async function atualizar() {
  let nova;
  try { nova = await buscarLista(); }
  catch (_) { enviar({ tipo: 'erro', url: 'precache.json' }); enviar(await estadoDe(await atual())); return; }
  const p = await atual();
  novaVersaoVista = nova.lista.versao;
  if (p && p.versao === nova.lista.versao) { await precachear(); return; }
  const antigo = p ? { cache: p.cache, lista: await listaDoCache(p.cache) } : null;
  const nomeNovo = PREFIXO + nova.lista.versao;
  await (await caches.open(nomeNovo)).put(abs('precache.json'), nova.resposta);
  const r = await montar(nova.lista, nova.lista.arquivos.map((a) => a.url), antigo);
  if (r.faltando > 0) { enviar(await estadoDe(p)); return; } // o antigo segue valendo; rodar de novo retoma
  await gravarMeta(KEY_ATUAL, { cache: nomeNovo, versao: nova.lista.versao });
  await gravarMeta(KEY_PROXIMO, { cache: nomeNovo, versao: nova.lista.versao });
  await marcarPronto(nova.lista.versao, r.bytes);
  await apagarOutros(nomeNovo);
}

function umPorVez(fn) {
  if (!tarefa) tarefa = fn().catch(() => {}).finally(() => { tarefa = null; });
  return tarefa;
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const { lista, resposta } = await buscarLista();
    const nome = PREFIXO + lista.versao;
    const p = await atual();
    const anteriorPronto = p && p.versao !== lista.versao && ((await lerMeta(keyEstado(p.versao))) || {}).pronto;
    await (await caches.open(nome)).put(abs('precache.json'), resposta);
    const antigo = p ? { cache: p.cache, lista: await listaDoCache(p.cache) } : null;
    const urls = anteriorPronto ? lista.arquivos.map((a) => a.url) : lista.casco;
    const r = await montar(lista, urls, antigo, { avisar: false, pararNoErro: true });
    if (r.faltando > 0) throw new Error('install incompleto'); // o SW antigo continua
    if (anteriorPronto || (p && p.versao === lista.versao && ((await lerMeta(keyEstado(p.versao))) || {}).pronto)) {
      await gravarMeta(keyEstado(lista.versao), { pronto: true, bytes: r.bytes, quando: new Date().toISOString() });
    }
    await gravarMeta(KEY_PROXIMO, { cache: nome, versao: lista.versao });
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // A versão que o install montou fica em '__sw/proximo' (gravada no fim do install).
    const proximo = await lerMeta(KEY_PROXIMO);
    if (proximo) {
      await gravarMeta(KEY_ATUAL, proximo);
      await apagarOutros(proximo.cache);
    }
    if (self.registration.navigationPreload) { try { await self.registration.navigationPreload.disable(); } catch (_) {} }
    await self.clients.claim();
    enviar(await estadoDe(await atual()));
  })());
});

self.addEventListener('message', (event) => {
  const tipo = event.data && event.data.tipo;
  let p;
  if (tipo === 'precachear') p = umPorVez(precachear);
  else if (tipo === 'atualizar') p = umPorVez(atualizar);
  else if (tipo === 'estado') p = (async () => { checarVersaoNova(); enviar(await estadoDe(await atual())); })();
  if (p && event.waitUntil) event.waitUntil(p);
});

/* Checagem leve (no máximo a cada 10 min, só com rede) para avisar 'nova_versao'.
 * Não baixa nada pesado: o download só acontece com {tipo:'atualizar'}. */
function checarVersaoNova() {
  const agora = Date.now();
  if (agora - ultimaChecagem < 10 * 60 * 1000) return;
  ultimaChecagem = agora;
  fetch(abs('precache.json'), { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then(async (l) => {
      if (!l) return;
      const p = await atual();
      if (p && l.versao !== p.versao) {
        novaVersaoVista = l.versao;
        enviar(await estadoDe(p));
      }
    })
    .catch(() => {});
}

/* ---------------- fetch ---------------- */

const REDE_PRIMEIRO = [/^dados\/[^/]+\.geojson$/, /^dados\/info\.json$/, /^marcas\/[^/]+\.json$/, /^precache\.json$/];

async function cacheAtual() {
  const p = await atual();
  return p ? caches.open(p.cache) : null;
}

async function doCache(rel) {
  const c = await cacheAtual();
  if (c) {
    const r = await c.match(abs(rel), { ignoreSearch: true });
    if (r) return r;
  }
  // Sem ponteiro (primeiro install em curso) ou em outro cache da casa.
  const nomes = (await caches.keys()).filter((k) => k.startsWith(PREFIXO));
  for (const n of nomes) {
    const r = await (await caches.open(n)).match(abs(rel), { ignoreSearch: true });
    if (r) return r;
  }
  return null;
}

function comPrazo(promessa, ms) {
  return new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error('prazo')), ms);
    promessa.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); falha(e); });
  });
}

const vazio404 = () => new Response('', { status: 404, statusText: 'Not Found', headers: { 'Content-Type': 'text/plain' } });

async function cachePrimeiro(req, rel, guardar) {
  const r = await doCache(rel);
  if (r) return r;
  try {
    const n = await fetch(req);
    if (n.ok && guardar) { const c = await cacheAtual(); if (c) c.put(abs(rel), n.clone()).catch(() => {}); }
    if (n.status === 404) return vazio404();
    return n;
  } catch (_) {
    return vazio404();
  }
}

async function redePrimeiro(req, rel) {
  try {
    const n = await comPrazo(fetch(req, { cache: 'no-cache' }), 2500);
    if (n.ok) {
      const c = await cacheAtual();
      if (c && rel !== 'precache.json') c.put(abs(rel), n.clone()).catch(() => {});
      return n;
    }
    const r = await doCache(rel);
    return r || n;
  } catch (_) {
    const r = await doCache(rel);
    return r || vazio404();
  }
}

async function navegacao(req, rel) {
  const pagina = rel === '' || rel.endsWith('/') ? 'index.html' : rel;
  const particular = /^marcos(\.html|\/|$)/.test(rel);
  const r = (await doCache(pagina)) || (particular ? await doCache('marcos.html') : null);
  if (r) { checarVersaoNova(); return r; }
  try {
    return await fetch(req);
  } catch (_) {
    return (particular ? await doCache('marcos.html') : null) || (await doCache('index.html')) ||
      new Response('<!doctype html><meta charset="utf-8"><title>Trilhas de Itaitu</title><p>Sem internet e o app ainda não foi guardado neste aparelho. Abra uma vez com sinal.</p>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== ESCOPO.origin || !url.pathname.startsWith(ESCOPO.pathname)) return;
  let rel = url.pathname.slice(ESCOPO.pathname.length);
  try { rel = decodeURIComponent(rel); } catch (_) {}
  if (rel === 'sw.js' || rel.startsWith('__sw/')) return;

  if (req.mode === 'navigate') { event.respondWith(navegacao(req, rel)); return; }
  if (REDE_PRIMEIRO.some((re) => re.test(rel))) { event.respondWith(redePrimeiro(req, rel)); return; }
  if (rel.startsWith('tiles/')) { event.respondWith(cachePrimeiro(req, rel, true)); return; }
  event.respondWith(cachePrimeiro(req, rel, true));
});
