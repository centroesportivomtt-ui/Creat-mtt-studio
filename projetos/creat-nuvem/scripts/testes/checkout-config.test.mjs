/*
 * Porta Aberta · testes de checkout.config.js (linkValido) e da trava de deploy.
 * Roda com: CREAT_TESTE_TMP=/tmp npm test
 * Contrato: docs/INTEGRACAO-PAGAMENTO.md, seção 1.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FONTE = fs.readFileSync(path.join(RAIZ, 'checkout.config.js'), 'utf8');

function carregar(fonte) {
  const j = { URL, Promise }; j.window = j;
  vm.runInContext(fonte, vm.createContext(j));
  return j.CREAT_CHECKOUT;
}
const C = carregar(FONTE);

test('linkValido aceita os links de pagamento do Mercado Pago, do Stripe, do Asaas e da Cakto', () => {
  for (const l of [
    'https://mpago.la/2aBcDeF',
    'https://mpago.li/1xYz',
    'https://link.mercadopago.com.br/creatmtt',
    'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=123456-abc',
    'https://buy.stripe.com/aEU4gB1x2',
    'https://checkout.stripe.com/c/pay/cs_live_a1b2',
    'https://www.asaas.com/c/abc123',
    'https://pay.cakto.com.br/xyz'
  ]) assert.equal(C.linkValido(l), true, l);
});

test('linkValido recusa marcador, http, porta, credencial, host parecido e subdomínio fora da lista', () => {
  for (const l of [
    '[LINK_ASAAS_ABERTURA_PADRAO]', '', null, 42,
    'http://mpago.la/abc',
    'https://mpago.la/', 'https://buy.stripe.com',
    'https://mpago.la:8443/abc',
    'https://usuario@mpago.la/abc', 'https://:x@mpago.la/abc', ' https://:x@mpago.la/abc',
    'https://mpago.la.golpe.com/abc', 'https://golpe-mpago.la/abc', 'https://falso.mpago.la/abc',
    'https://x.buy.stripe.com/abc', 'https://stripe.com/abc', 'https://mercadopago.com.br/abc',
    'https://www.mercadopago.com/checkout', 'javascript:alert(1)', 'https://asaas.com.golpe.io/x'
  ]) assert.equal(C.linkValido(l), false, String(l));
});

test('checkout.config.js continua sem segredo e com os marcadores de fábrica', () => {
  const semComentario = FONTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(semComentario, /(sk-ant-|sk_live|secret|senha|password|api[_-]?key|token\s*:|APP_USR-)/i);
  assert.equal(C.whatsappValido(C.whatsappSuporte), true);
});

test('campo teste: pa-teste de R$ 1, link válido do Checkout Pro, com validade e fora de qualquer botão ou Purchase', () => {
  const t = C.teste;
  assert.ok(t && typeof t === 'object', 'CREAT_CHECKOUT.teste ausente');
  assert.equal(t.produto, 'pa-teste');
  assert.equal(t.valor, 1);
  assert.equal(C.linkValido(t.link), true, t.link);
  assert.match(t.link, /^https:\/\/www\.mercadopago\.com\.br\/checkout\/v1\/redirect\?pref_id=2189692475-[0-9a-f-]{36}$/);
  assert.ok(Number.isFinite(Date.parse(t.valeAte)), 'valeAte precisa ser data ISO');
  assert.match(t.valeAte, /Z$|[+-]\d\d:\d\d$/, 'valeAte com fuso explícito');
  const pref = new URL(t.link).searchParams.get('pref_id');
  // Nunca é botão da página nem gera Purchase.
  assert.equal(C.valorDaPreferencia(pref), null);
  for (const l of Object.values(C.links)) assert.notEqual(l, t.link);
  for (const l of Object.values(C.linksPorPraca)) assert.notEqual(l, t.link);
  assert.equal(Object.prototype.hasOwnProperty.call(C.valorDosLinks, 'teste'), false);
  for (const o of [{ inauguracao: true }, { inauguracao: false }, { inauguracao: true, praca: 'feira' }, { inauguracao: true, praca: 'pa-teste' }])
    assert.notEqual(C.escolherAbertura(o).link, t.link);
});

test('checar-placeholders passa com links do Mercado Pago e do Stripe no lugar dos marcadores', () => {
  const tmp = fs.mkdtempSync(path.join(process.env.CREAT_TESTE_TMP || os.tmpdir(), 'creat-ck-'));
  try {
    const fonte = FONTE
      .replace("'[LINK_ASAAS_ABERTURA_INAUGURACAO]'", "'https://mpago.la/2inaug297'")
      .replace("'[LINK_ASAAS_ABERTURA_PADRAO]'", "'https://mpago.la/1padrao497'")
      .replace("'[LINK_CAKTO_BASTIDORES]'", "'https://buy.stripe.com/bastidores67'");
    fs.writeFileSync(path.join(tmp, 'checkout.config.js'), fonte);
    const ok = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'checar-placeholders.cjs'), '--raiz', tmp], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);

    // O arquivo real pode já ter links de verdade no lugar dos marcadores: o link ruim entra no valor atual de aberturaPadrao.
    const padraoAtual = (fonte.match(/aberturaPadrao:\s*'([^']+)'/) || [])[1];
    assert.ok(padraoAtual, 'aberturaPadrao não encontrado no checkout.config.js');
    fs.writeFileSync(path.join(tmp, 'checkout.config.js'), fonte.replace(padraoAtual, 'https://mpago.la.golpe.com/1'));
    const ruim = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', 'checar-placeholders.cjs'), '--raiz', tmp], { encoding: 'utf8' });
    assert.equal(ruim.status, 1);
    assert.match(ruim.stdout, /links\.aberturaPadrao não é um link https aceito/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
