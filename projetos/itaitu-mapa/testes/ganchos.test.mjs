// ganchos.test.mjs · ganchos de teste e vitrine só onde devem valer (Pixel, frontend, 20/11/2026, QA itens 3 e 4).
// ?agora= e ?sw=0: só em localhost/127.x/::1. ?vitrine=1: só dentro do iframe #vitrine-frame do marcos.html.
// O conferir-app.cjs (seção 10) prova o lado do navegador; aqui fica o endereço público, que lá não dá para abrir.
// Rodar:  node --test 'projetos/itaitu-mapa/testes/*.test.mjs'
import { test } from 'node:test';
import assert from 'node:assert/strict';

const U = await import(new URL('../../../site/itaitu/js/util.js', import.meta.url).href);
const comGlobais = (g, fn) => {
  const antes = {};
  for (const k of Object.keys(g)) { antes[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { value: g[k], configurable: true, writable: true }); }
  try { return fn(); } finally {
    for (const k of Object.keys(g)) { if (antes[k]) Object.defineProperty(globalThis, k, antes[k]); else delete globalThis[k]; }
  }
};

test('?agora= e ?sw=0 valem só no computador de quem testa', () => {
  for (const h of ['localhost', '127.0.0.1', '127.1.2.3', '::1', '[::1]']) assert.equal(comGlobais({ location: { hostname: h } }, U.ganchoDeTeste), true, h);
  for (const h of ['creatmtt.github.io', 'trilhas.itaitu.com.br', '127.0.0.1.exemplo.com', 'localhost.exemplo.com', '']) assert.equal(comGlobais({ location: { hostname: h } }, U.ganchoDeTeste), false, h);
});

test('?vitrine=1 só dentro do iframe da vitrine do marcos.html', () => {
  const p = new URLSearchParams('m=demo-village&demo=1&vitrine=1');
  const janela = {};
  // aberto direto: top === self
  assert.equal(comGlobais({ top: janela, self: janela }, () => U.emVitrine(p)), false);
  // iframe de outra origem (frameElement null) ou outro iframe
  assert.equal(comGlobais({ top: {}, self: janela, frameElement: null }, () => U.emVitrine(p)), false);
  assert.equal(comGlobais({ top: {}, self: janela, frameElement: { id: 'outro' }, parent: { location: { pathname: '/itaitu/marcos.html' } } }, () => U.emVitrine(p)), false);
  assert.equal(comGlobais({ top: {}, self: janela, frameElement: { id: 'vitrine-frame' }, parent: { location: { pathname: '/itaitu/index.html' } } }, () => U.emVitrine(p)), false);
  // o certo
  assert.equal(comGlobais({ top: {}, self: janela, frameElement: { id: 'vitrine-frame' }, parent: { location: { pathname: '/itaitu/marcos.html' } } }, () => U.emVitrine(p)), true);
  // sem o parâmetro, nunca
  assert.equal(comGlobais({ top: {}, self: janela, frameElement: { id: 'vitrine-frame' }, parent: { location: { pathname: '/itaitu/marcos.html' } } }, () => U.emVitrine(new URLSearchParams('m=x'))), false);
});
