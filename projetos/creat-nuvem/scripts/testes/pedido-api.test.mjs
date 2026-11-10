/*
 * Porta Aberta · testes das regras do pedido, da confirmação, do prazo e do contador (pacote 1A).
 * As mesmas regras rodam no app Base44 (src/lib/pa/regras.js, cópia byte a byte de schema/pedido-regras.mjs).
 * Roda com: npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as R from '../../schema/pedido-regras.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EX = path.join(RAIZ, 'schema', 'exemplos');
const ler = n => JSON.parse(fs.readFileSync(path.join(EX, n), 'utf8'));
const VALIDO = ler('pedido.registro-v1.valido.json');

const H = 3600 * 1000;
// 10/11/2026 é terça-feira. Horas em UTC; Bahia = UTC-3.
const TER_10H_BAHIA = Date.UTC(2026, 10, 10, 13, 0);

function pedido(extra = {}) {
  return { id: 'reg1', pedido_id: 'PA-AAAAAAAAAA', produto: 'pa-abertura-inauguracao-2026-11', valor: 297, status: 'aguardando_pagamento', criado_em: new Date(TER_10H_BAHIA - H).toISOString(), payment_id: null, eh_teste: false, ...extra };
}
const pg297 = () => R.pagamentoConfiavel({ aprovado: true, valor: 297, external_reference: 'pa-abertura-inauguracao-feira-2026-11' });

/* ---------- Entrada ---------- */

test('registro válido passa e o servidor fixa valor, hash dos termos e eh_teste', () => {
  const v = R.validarRegistro(VALIDO);
  assert.equal(v.ok, true);
  assert.equal(v.pedido.valor, 297);
  assert.equal(v.pedido.termos_hash, R.TERMOS['termos-v1']);
  assert.equal(v.pedido.eh_teste, false);
  assert.equal(v.pedido.email, 'contato@exemplo.com.br');
  assert.equal('aceite_em' in v.pedido, false, 'o carimbo do navegador é ignorado');
  assert.equal('segredo' in v.pedido, false, 'o segredo não vai para o registro');
});

test('teste:true valida sem gravar; pa-teste grava com eh_teste', () => {
  const v = R.validarRegistro(ler('pedido.registro-v1-teste.valido.json'));
  assert.equal(v.ok, true);
  assert.equal(v.teste, true);
  assert.equal(v.pedido.eh_teste, true);
});

test('objeto JSON no lugar de pedido_id e de payment_id é recusado antes de qualquer consulta', () => {
  assert.equal(R.validarRegistro({ ...VALIDO, id: { $ne: null } }).campo, 'id');
  assert.equal(R.idValido({ $gt: '' }), null);
  assert.equal(R.idValido(['PA-AAAAAAAAAA']), null);
  assert.equal(R.paymentIdValido({ $exists: true }), null);
  assert.equal(R.paymentIdValido(true), null);
  assert.equal(R.paymentIdValido(123456789), '123456789', 'número inteiro é coagido a texto');
  assert.equal(R.paymentIdValido('12345'), null, 'curto demais');
  assert.equal(R.idValido('PA-7K3QX2MD'), null, 'id de 8 caracteres (formato antigo) não serve ao servidor');
});

test('valor fora do catálogo, produto desconhecido, isca, consentimento e campo extra', () => {
  assert.equal(R.validarRegistro({ ...VALIDO, valor: 1 }).campo, 'valor');
  assert.equal(R.validarRegistro({ ...VALIDO, valor: 497 }).campo, 'valor');
  assert.equal(R.validarRegistro({ ...VALIDO, produto: 'pa-bastidores-2026-11' }).campo, 'produto');
  assert.equal(R.validarRegistro({ ...VALIDO, consentimento_dados: 'true' }).campo, 'consentimento_dados');
  assert.equal(R.validarRegistro({ ...VALIDO, status: 'pago' }).campo, 'status');
  assert.equal(R.validarRegistro({ ...VALIDO, whatsapp: '5500999990000' }).campo, 'whatsapp');
  assert.equal(R.validarRegistro({ ...VALIDO, whatsapp: '557512345678' }).campo, 'whatsapp', 'fixo começando com 1 não existe');
  assert.equal(R.validarRegistro({ ...VALIDO, termos_versao: 'termos-v9' }).campo, 'termos_versao');
  assert.equal(R.validarRegistro({ ...VALIDO, hp: 'x' }).isca, true);
  assert.equal(R.validarRegistro({ ...VALIDO, negocio: '<script>' }).campo, 'negocio');
});

test('o schema e as regras concordam em todos os exemplos de registro v1', () => {
  const require = createRequire(import.meta.url);
  const Ajv2020 = require(require.resolve('ajv/dist/2020', { paths: [RAIZ] })).default;
  const addFormats = require(require.resolve('ajv-formats', { paths: [RAIZ] })).default;
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false });
  addFormats(ajv);
  const valida = ajv.compile(JSON.parse(fs.readFileSync(path.join(RAIZ, 'schema', 'pedido.schema.json'), 'utf8')));
  const arquivos = fs.readdirSync(EX).filter(f => /^pedido\.registro-v1/.test(f));
  assert.ok(arquivos.length >= 8);
  for (const f of arquivos) {
    const dado = ler(f);
    const esperado = f.includes('.valido.');
    assert.equal(valida(dado), esperado, 'schema ' + f);
    const r = R.validarRegistro(dado);
    assert.equal(r.ok && !r.isca, esperado, 'regras ' + f);
  }
});

/* ---------- Pagamento: o que vem de portaAbertaVerificar ---------- */

test('pagamentoConfiavel: só aprovado, com referência e valor do catálogo', () => {
  assert.equal(R.pagamentoConfiavel({ aprovado: false }), null);
  assert.equal(R.pagamentoConfiavel({ aprovado: true, valor: 297 }), null, 'sem referência');
  assert.equal(R.pagamentoConfiavel({ aprovado: true, valor: 250, external_reference: 'pa-abertura-2026-11' }), null, 'valor fora do catálogo');
  assert.equal(R.pagamentoConfiavel({ aprovado: true, valor: 47, external_reference: 'kit-vendedor-24h' }), null, 'produto de outra operação');
  assert.equal(R.pagamentoConfiavel({ aprovado: 'true', valor: 297, external_reference: 'pa-abertura-inauguracao-2026-11' }), null);
  const p = pg297();
  assert.deepEqual([p.produto, p.praca, p.valor, p.teste], ['pa-abertura-inauguracao-2026-11', 'feira', 297, false]);
  assert.equal(R.produtoDaReferencia('pa-abertura-inauguracao-lisboa-2026-11'), null, 'praça fora da lista');
  assert.equal(R.pagamentoConfiavel({ aprovado: true, valor: 1, external_reference: 'pa-teste' }).teste, true);
});

/* ---------- Cenários de ataque ao casamento ---------- */

test('ATAQUE: pagamento de outro valor ou produto usando o pedido_id de outra pessoa não vira pago', () => {
  const alheio497 = pedido({ produto: 'pa-abertura-2026-11', valor: 497 });
  const pgTeste = R.pagamentoConfiavel({ aprovado: true, valor: 1, external_reference: 'pa-teste' });
  const d1 = R.decidirConfirmacao({ pg: pgTeste, regra1: { pedido: alheio497, emailConfere: true }, regra2: [], agoraMs: TER_10H_BAHIA });
  assert.notEqual(d1.acao, 'pago');
  assert.notEqual(d1.acao, 'teste_ok');
  const d2 = R.decidirConfirmacao({ pg: pg297(), regra1: { pedido: alheio497, emailConfere: true }, regra2: [], agoraMs: TER_10H_BAHIA });
  assert.equal(d2.acao, 'sem_pedido', 'R$ 297 não paga um pedido de R$ 497');
});

test('ATAQUE: um pedido falso aguardando não toma o pagamento de quem não gravou pedido', () => {
  // O atacante grava um pedido de R$ 297 com o e-mail dele; o comprador real paga sem gravar pedido.
  const falso = pedido({ pedido_id: 'PA-FALSOFALSO', email: 'atacante@exemplo.com' });
  const d = R.decidirConfirmacao({ pg: pg297(), regra1: null, regra2: [{ pedido: falso, emailConfere: false }], agoraMs: TER_10H_BAHIA });
  assert.equal(d.acao, 'a_conferir', 'só o valor (Regra 3) nunca promove');
  assert.equal(d.regra, 3);
  // Mesmo com o segredo do próprio pedido falso, sem e-mail do pagador: a_conferir.
  const d2 = R.decidirConfirmacao({ pg: pg297(), regra1: { pedido: falso, emailConfere: false }, regra2: [], agoraMs: TER_10H_BAHIA });
  assert.equal(d2.acao, 'a_conferir');
});

test('Regras 1 e 2 promovem só com e-mail do pagador conferido; dois candidatos com e-mail viram a_conferir', () => {
  const p = pedido();
  assert.equal(R.decidirConfirmacao({ pg: pg297(), regra1: { pedido: p, emailConfere: true }, regra2: [], agoraMs: TER_10H_BAHIA }).acao, 'pago');
  const d2 = R.decidirConfirmacao({ pg: pg297(), regra1: null, regra2: [{ pedido: p, emailConfere: true }, { pedido: pedido({ pedido_id: 'PA-BBBBBBBBBB' }), emailConfere: false }], agoraMs: TER_10H_BAHIA });
  assert.equal(d2.acao, 'pago');
  assert.equal(d2.pedido.pedido_id, 'PA-AAAAAAAAAA');
  const d3 = R.decidirConfirmacao({ pg: pg297(), regra1: null, regra2: [{ pedido: p, emailConfere: true }, { pedido: pedido({ pedido_id: 'PA-BBBBBBBBBB' }), emailConfere: true }], agoraMs: TER_10H_BAHIA });
  assert.equal(d3.acao, 'a_conferir');
  assert.deepEqual(d3.candidatos, ['PA-AAAAAAAAAA', 'PA-BBBBBBBBBB'], 'candidatos pelo número público, nunca pelo id interno');
});

test('pedido criado DEPOIS da aprovação do pagamento não casa', () => {
  const pg = R.pagamentoConfiavel({ aprovado: true, valor: 297, external_reference: 'pa-abertura-inauguracao-2026-11', aprovado_em: new Date(TER_10H_BAHIA - 2 * H).toISOString() });
  const p = pedido({ criado_em: new Date(TER_10H_BAHIA - H).toISOString() });
  assert.equal(R.pedidoCasa(p, pg, TER_10H_BAHIA), false);
  assert.notEqual(R.decidirConfirmacao({ pg, regra1: { pedido: p, emailConfere: true }, regra2: [], agoraMs: TER_10H_BAHIA }).acao, 'pago');
});

test('payment_id reutilizado: pedido que já tem pagamento não recebe outro', () => {
  const pago = pedido({ status: 'pago', payment_id: '111111111' });
  assert.equal(R.pedidoCasa(pago, pg297(), TER_10H_BAHIA), false);
  const comPg = pedido({ payment_id: '111111111' });
  assert.equal(R.pedidoCasa(comPg, pg297(), TER_10H_BAHIA), false);
});

test('pedido de teste nunca vira pago: pa-teste vira teste_ok', () => {
  const pgT = R.pagamentoConfiavel({ aprovado: true, valor: 1, external_reference: 'pa-teste' });
  const pt = pedido({ produto: 'pa-teste', valor: 1, eh_teste: true });
  assert.equal(R.decidirConfirmacao({ pg: pgT, regra1: { pedido: pt, emailConfere: true }, regra2: [], agoraMs: TER_10H_BAHIA }).acao, 'teste_ok');
  assert.equal(R.decidirConfirmacao({ pg: null, regra1: { pedido: pt, emailConfere: true }, regra2: [], agoraMs: TER_10H_BAHIA }).acao, 'recusar');
});

/* ---------- Prazo de 72 h e horário de atendimento ---------- */

test('dentro do horário (terça 10h na Bahia) o relógio começa na hora', () => {
  assert.equal(R.emHorarioComercial(TER_10H_BAHIA), true);
  assert.equal(R.inicioDoRelogio(TER_10H_BAHIA), TER_10H_BAHIA);
  assert.equal(R.prazoFim(TER_10H_BAHIA), TER_10H_BAHIA + 72 * H);
  assert.equal(R.dataHoraBahia(R.prazoFim(TER_10H_BAHIA)), '13/11/2026 às 10:00');
});

test('fora do horário: noite começa às 9h do dia seguinte; madrugada às 9h do mesmo dia', () => {
  const ter20h = Date.UTC(2026, 10, 10, 23, 0);   // terça 20h Bahia
  assert.equal(R.dataHoraBahia(R.inicioDoRelogio(ter20h)), '11/11/2026 às 09:00');
  const qua7h = Date.UTC(2026, 10, 11, 10, 0);    // quarta 7h Bahia
  assert.equal(R.dataHoraBahia(R.inicioDoRelogio(qua7h)), '11/11/2026 às 09:00');
  const ter19h = Date.UTC(2026, 10, 10, 22, 0);   // terça 19h em ponto: já fechado
  assert.equal(R.dataHoraBahia(R.inicioDoRelogio(ter19h)), '11/11/2026 às 09:00');
});

test('sábado à noite e domingo começam segunda às 9h', () => {
  const sab20h = Date.UTC(2026, 10, 14, 23, 0);   // sábado 14/11 20h Bahia
  assert.equal(R.dataHoraBahia(R.inicioDoRelogio(sab20h)), '16/11/2026 às 09:00');
  const dom15h = Date.UTC(2026, 10, 15, 18, 0);   // domingo 15/11 15h Bahia
  assert.equal(R.emHorarioComercial(dom15h), false);
  assert.equal(R.dataHoraBahia(R.inicioDoRelogio(dom15h)), '16/11/2026 às 09:00');
  assert.equal(R.dataHoraBahia(R.prazoFim(dom15h)), '19/11/2026 às 09:00');
  const dom1h = Date.UTC(2026, 10, 15, 4, 0);     // domingo 15/11 01h Bahia
  assert.equal(R.dataHoraBahia(R.inicioDoRelogio(dom1h)), '16/11/2026 às 09:00');
});

test('entrega prevista respeita capacidade_dia; alerta 12 h antes do prazo', () => {
  assert.equal(R.entregaPrevista(TER_10H_BAHIA, 2, 3), R.prazoFim(TER_10H_BAHIA));
  assert.equal(R.entregaPrevista(TER_10H_BAHIA, 3, 3), R.prazoFim(TER_10H_BAHIA) + 24 * H);
  assert.equal(R.entregaPrevista(TER_10H_BAHIA, 10, 3), R.prazoFim(TER_10H_BAHIA) + 3 * 24 * H);
  assert.equal(R.entregaPrevista(TER_10H_BAHIA, 5, 0), R.prazoFim(TER_10H_BAHIA) + 24 * H, 'capacidade inválida vale 3');
  const fim = R.prazoFim(TER_10H_BAHIA);
  assert.equal(R.alertaDePrazoDevido(fim, fim - 13 * H), false);
  assert.equal(R.alertaDePrazoDevido(fim, fim - 12 * H), true);
});

/* ---------- Contador ---------- */

test('contador: lista branca fechada, conferência descartada, evento desconhecido descartado', () => {
  assert.deepEqual(R.normalizarContagem({ evento: 'visita', nicho: 'barbearia', praca: 'feira', anuncio: 'A1-barbearia-v1' }),
    { conferencia: false, evento: 'visita', nicho: 'barbearia', praca: 'feira', anuncio: 'A1-barbearia-v1' });
  assert.deepEqual(R.normalizarContagem({ evento: 'previa', nicho: 'padaria', praca: 'lisboa', anuncio: 'Z9-nome-do-cliente' }),
    { conferencia: false, evento: 'previa', nicho: 'outro', praca: 'outro', anuncio: 'outro' });
  assert.equal(R.normalizarContagem({ evento: 'compra' }), null);
  assert.equal(R.normalizarContagem({ evento: 'visita', utm_content: 'conferencia' }).conferencia, true);
  assert.equal(R.normalizarContagem({ evento: 'visita', anuncio: 'conferencia' }).conferencia, true);
  assert.equal(R.normalizarContagem([]), null);
});

/* ---------- Estados, hash e modelos ---------- */

test('transições do executor: só as previstas', () => {
  assert.equal(R.transicaoPermitida('a_conferir', 'pago'), true);
  assert.equal(R.transicaoPermitida('aguardando_pagamento', 'pago'), false, 'pago automático só pela confirmação');
  assert.equal(R.transicaoPermitida('teste_ok', 'pago'), false);
  assert.equal(R.transicaoPermitida('rascunho_enviado', 'aprovado'), false, 'aprovação só pelo cliente (aprovarRascunho)');
  assert.equal(R.transicaoPermitida('pago', 'no_ar'), false);
});

test('comparação em tempo constante e sha256', async () => {
  const h = await R.sha256Hex('abc');
  assert.equal(h, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(R.iguaisTempoConstante(h, h), true);
  assert.equal(R.iguaisTempoConstante(h, h.slice(0, 63) + '0'), false);
  assert.equal(R.iguaisTempoConstante(h, h.slice(0, 10)), false);
  assert.equal(R.iguaisTempoConstante(h, null), false);
});

test('recibo traz produto, valor, meio, número do pagamento, prazo, regra do prazo e termos; sem dado digitado no assunto', () => {
  const m = R.modeloEmailCliente('recibo', { id: 'base44-interno', pedido_id: 'PA-AAAAAAAAAA', produto: 'pa-abertura-inauguracao-2026-11', valor: 297, meio: 'Pix', payment_id: '123456789', prazo_fim: new Date(R.prazoFim(TER_10H_BAHIA)).toISOString(), negocio: 'Barbearia X' });
  for (const t of ['PA-AAAAAAAAAA', 'R$ 297', 'Pix', '123456789', '13/11/2026 às 10:00', '72 horas', '/termos/']) assert.ok(m.corpo.includes(t), t);
  assert.equal(m.corpo.includes('base44-interno'), false, 'o id interno do Base44 não aparece');
  assert.equal(m.assunto.includes('Barbearia'), false);
  assert.equal(R.modeloEmailCliente('outro', {}), null);
  const r = R.modeloEmailCliente('rascunho', { pedido_id: 'PA-AAAAAAAAAA', slug_rascunho: 'barbearia-x-r-abcdefghijkl', token_rascunho: 'q1Zr8Xn4Lw0bT6yHc9VfEA' });
  assert.ok(r.corpo.includes('/sites/barbearia-x-r-abcdefghijkl/#t=q1Zr8Xn4Lw0bT6yHc9VfEA'));
  const r2 = R.modeloEmailCliente('rascunho', { pedido_id: 'PA-AAAAAAAAAA', slug_rascunho: 'barbearia-x-r-abcdefghijkl', token_rascunho: 'x" onclick=' });
  assert.equal(r2.corpo.includes('#t='), false, 'token fora do formato não entra no link');
});
