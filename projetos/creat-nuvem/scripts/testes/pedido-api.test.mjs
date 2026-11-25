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
import { createHash } from 'node:crypto';
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
  assert.equal(R.validarRegistro({ ...VALIDO, termos_versao: 'termos-v3' }).campo, 'termos_versao', 'versão que ainda não existe');
  assert.equal(R.validarRegistro({ ...VALIDO, termos_versao: 'TERMOS-V2' }).campo, 'termos_versao');
  assert.equal(R.validarRegistro({ ...VALIDO, termos_versao: 'toString' }).campo, 'termos_versao', 'propriedade herdada não vale');
  assert.equal(R.validarRegistro({ ...VALIDO, termos_versao: ['termos-v2'] }).campo, 'termos_versao');
  assert.equal(R.validarRegistro({ ...VALIDO, hp: 'x' }).isca, true);
  assert.equal(R.validarRegistro({ ...VALIDO, negocio: '<script>' }).campo, 'negocio');
});

test('termos v1 e v2 passam, cada um com o seu hash; v2 é o sha256 do conteudo/termos.md atual', () => {
  assert.deepEqual(Object.keys(R.TERMOS), ['termos-v1', 'termos-v2']);
  const v1 = R.validarRegistro({ ...VALIDO, termos_versao: 'termos-v1' });
  assert.equal(v1.ok, true);
  assert.equal(v1.pedido.termos_versao, 'termos-v1');
  assert.equal(v1.pedido.termos_hash, '44bbc0ef9c115fcadf11dc581238ddbf20d906ecd627c5ae8db1b63ae3ba8c17');
  const v2 = R.validarRegistro({ ...VALIDO, termos_versao: 'termos-v2' });
  assert.equal(v2.ok, true);
  assert.equal(v2.pedido.termos_versao, 'termos-v2');
  assert.equal(v2.pedido.termos_hash, R.TERMOS['termos-v2']);
  const bruto = fs.readFileSync(path.join(RAIZ, 'conteudo', 'termos.md'));
  assert.equal(createHash('sha256').update(bruto).digest('hex'), R.TERMOS['termos-v2'], 'termos.md mudou: suba para termos-v3 com o hash novo');
  assert.match(bruto.toString('utf8'), /^Versão 2 \(termos-v2\)/m);
  // A página manda a versão que checkout.config.js diz; o servidor tem de conhecer essa versão.
  const ck = fs.readFileSync(path.join(RAIZ, 'checkout.config.js'), 'utf8');
  const versaoPagina = (ck.match(/termosVersao:\s*'([^']+)'/) || [])[1];
  assert.equal(versaoPagina, 'termos-v2');
  assert.ok(Object.prototype.hasOwnProperty.call(R.TERMOS, versaoPagina));
});

test('versão das regras: eventos de interesse no contador (11/11/2026)', () => {
  assert.equal(R.VERSAO_REGRAS, 'pa-regras-1A-2026-11-11a');
});

test('versão desconhecida dos termos é campo inválido (a rota responde 422 campo termos_versao)', () => {
  for (const v of ['termos-v0', 'termos-v3', 'termos-v99', '', null, undefined, 2])
    assert.deepEqual(R.validarRegistro({ ...VALIDO, termos_versao: v }), { ok: false, campo: 'termos_versao' }, String(v));
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

// Conferência do fecho F1 (corrigir): o schema só aceitava termos-v1, o servidor aceita v1 e v2 e a página manda v2.
test('o schema aceita exatamente as versões de TERMOS e concorda com as regras em v1 e em v2', () => {
  const require = createRequire(import.meta.url);
  const Ajv2020 = require(require.resolve('ajv/dist/2020', { paths: [RAIZ] })).default;
  const addFormats = require(require.resolve('ajv-formats', { paths: [RAIZ] })).default;
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false });
  addFormats(ajv);
  const sch = JSON.parse(fs.readFileSync(path.join(RAIZ, 'schema', 'pedido.schema.json'), 'utf8'));
  assert.deepEqual([...sch.$defs.PedidoRegistro.properties.termos_versao.enum].sort(), Object.keys(R.TERMOS).sort(),
    'schema/pedido.schema.json $defs/PedidoRegistro.termos_versao tem de listar as mesmas versões de TERMOS');
  const valida = ajv.compile(sch);
  const arquivos = fs.readdirSync(EX).filter(f => /^pedido\.registro-v1/.test(f));
  for (const versao of [...Object.keys(R.TERMOS), 'termos-v3']) {
    for (const f of arquivos) {
      const dado = { ...ler(f), termos_versao: versao };
      const esperado = f.includes('.valido.') && Object.prototype.hasOwnProperty.call(R.TERMOS, versao);
      assert.equal(valida(dado), esperado, 'schema ' + versao + ' ' + f);
      const r = R.validarRegistro(dado);
      assert.equal(r.ok && !r.isca, esperado, 'regras ' + versao + ' ' + f);
    }
  }
});

// A página nunca grava aceite de uma versão que a pessoa não viu: sem CK.termosVersao, a reserva é a versão vigente.
test('assets/vitrine.js não cai para termos-v1 quando falta CK.termosVersao', () => {
  const v = fs.readFileSync(path.join(RAIZ, 'assets', 'vitrine.js'), 'utf8');
  const reservas = [...v.matchAll(/termosVersao\)\s*\|\|\s*'([^']+)'/g)].map(m => m[1]);
  assert.ok(reservas.length >= 1, 'vitrine.js deixou de ler CK.termosVersao');
  const vigente = (fs.readFileSync(path.join(RAIZ, 'checkout.config.js'), 'utf8').match(/termosVersao:\s*'([^']+)'/) || [])[1];
  for (const r of reservas) assert.equal(r, vigente, 'reserva de termos em vitrine.js: ' + r);
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

// Termos v2, cláusula 5: pagou fora do horário, a confirmação sai até as 11h do próximo dia de atendimento.
test('fora do horário: noite começa às 11h do dia seguinte; madrugada às 11h do mesmo dia', () => {
  const ter20h = Date.UTC(2026, 10, 10, 23, 0);   // terça 20h Bahia
  assert.equal(R.dataHoraBahia(R.inicioDoRelogio(ter20h)), '11/11/2026 às 11:00');
  assert.equal(R.dataHoraBahia(R.prazoFim(ter20h)), '14/11/2026 às 11:00');
  const qua7h = Date.UTC(2026, 10, 11, 10, 0);    // quarta 7h Bahia
  assert.equal(R.dataHoraBahia(R.inicioDoRelogio(qua7h)), '11/11/2026 às 11:00');
  const qua859 = Date.UTC(2026, 10, 11, 11, 59);  // quarta 8h59 Bahia: ainda fechado
  assert.equal(R.dataHoraBahia(R.inicioDoRelogio(qua859)), '11/11/2026 às 11:00');
  const ter19h = Date.UTC(2026, 10, 10, 22, 0);   // terça 19h em ponto: já fechado
  assert.equal(R.dataHoraBahia(R.inicioDoRelogio(ter19h)), '11/11/2026 às 11:00');
});

test('nas bordas do horário de atendimento o relógio começa na hora da confirmação', () => {
  const qua9h = Date.UTC(2026, 10, 11, 12, 0);    // quarta 9h em ponto: aberto
  assert.equal(R.inicioDoRelogio(qua9h), qua9h);
  const ter1859 = Date.UTC(2026, 10, 10, 21, 59); // terça 18h59: aberto
  assert.equal(R.inicioDoRelogio(ter1859), ter1859);
  assert.equal(R.dataHoraBahia(R.prazoFim(ter1859)), '13/11/2026 às 18:59');
  const sab10h = Date.UTC(2026, 10, 14, 13, 0);   // sábado 10h: aberto
  assert.equal(R.inicioDoRelogio(sab10h), sab10h);
});

test('sábado à noite e domingo começam segunda às 11h', () => {
  const sab20h = Date.UTC(2026, 10, 14, 23, 0);   // sábado 14/11 20h Bahia
  assert.equal(R.dataHoraBahia(R.inicioDoRelogio(sab20h)), '16/11/2026 às 11:00');
  const dom15h = Date.UTC(2026, 10, 15, 18, 0);   // domingo 15/11 15h Bahia
  assert.equal(R.emHorarioComercial(dom15h), false);
  assert.equal(R.dataHoraBahia(R.inicioDoRelogio(dom15h)), '16/11/2026 às 11:00');
  assert.equal(R.dataHoraBahia(R.prazoFim(dom15h)), '19/11/2026 às 11:00');
  const dom1h = Date.UTC(2026, 10, 15, 4, 0);     // domingo 15/11 01h Bahia
  assert.equal(R.dataHoraBahia(R.inicioDoRelogio(dom1h)), '16/11/2026 às 11:00');
  const sab3h = Date.UTC(2026, 10, 14, 6, 0);     // sábado 14/11 03h Bahia: 11h do mesmo sábado
  assert.equal(R.dataHoraBahia(R.inicioDoRelogio(sab3h)), '14/11/2026 às 11:00');
});

test('TEXTO_REGRA_PRAZO é a cláusula 5 dos termos v2 e a frase das páginas, palavra por palavra', () => {
  const C = path.join(RAIZ, 'conteudo');
  const termos = fs.readFileSync(path.join(C, 'termos.md'), 'utf8');
  const linha = termos.split('\n').find(l => l.startsWith('- O prazo de {{precos.prazoHoras}} h conta da confirmação'));
  assert.ok(linha, 'cláusula do prazo não encontrada em conteudo/termos.md');
  const comPrazo = t => t.split('{{precos.prazoHoras}}').join(String(R.LIMITES.prazoHoras));
  assert.equal(R.TEXTO_REGRA_PRAZO, comPrazo(linha.slice(2)));
  assert.doesNotMatch(R.TEXTO_REGRA_PRAZO, /começam às 9h/);
  const j = n => JSON.parse(fs.readFileSync(path.join(C, n), 'utf8'));
  for (const [nome, t] of [
    ['home.json', JSON.stringify(j('home.json'))],
    ['faq.json', JSON.stringify(j('faq.json'))],
    ['abrir.json', j('abrir.json').garantia.regra],
    ['obrigado.json', JSON.stringify(j('obrigado.json'))]
  ]) assert.ok(comPrazo(t).includes(R.TEXTO_REGRA_PRAZO), nome);
});

// Conferência do fecho F1 (bloqueia): a regra velha ("começa às 9h do próximo dia") sobrou na linha pago_depois de
// /obrigado/ (assets/vitrine.js). Nenhum texto do site, dos termos ou do e-mail pode dizer 9h para o início do prazo.
test('nenhum texto do site diz que o prazo começa às 9h do próximo dia (a regra é a das 11h)', () => {
  const VELHA = /(?:às|as)\s+9\s*h\s+do\s+pr[óo]ximo\s+dia/i;
  const arquivos = [];
  for (const d of ['assets', 'conteudo', path.join('conteudo', 'nichos')]) {
    const dir = path.join(RAIZ, d);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) if (/\.(js|json|md|html)$/.test(f)) arquivos.push(path.join(dir, f));
  }
  arquivos.push(path.join(RAIZ, 'checkout.config.js'), path.join(RAIZ, 'schema', 'pedido-regras.mjs'));
  assert.ok(arquivos.some(f => f.endsWith('vitrine.js')), 'a varredura tem de incluir assets/vitrine.js');
  const achados = [];
  for (const f of arquivos) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      if (VELHA.test(l)) achados.push(path.relative(RAIZ, f) + ':' + (i + 1) + ': ' + l.trim().slice(0, 140));
    });
  }
  assert.deepEqual(achados, [], 'regra velha das 9h:\n' + achados.join('\n'));
  // O próprio detector pega a frase velha e deixa passar a nova e o horário de atendimento.
  assert.match('O prazo de 72 h começa às 9h do próximo dia de atendimento.', VELHA);
  assert.doesNotMatch(R.TEXTO_REGRA_PRAZO, VELHA);
  assert.doesNotMatch('O prazo de 72 h começa às 11h do próximo dia de atendimento.', VELHA);
});

// O relógio recebe o instante em que o servidor grava "pago" (servidor.server.js registrarPago: ms = agora()),
// não o instante do Pix. Confirmação que chega dentro do horário começa na hora, mesmo se o Pix foi pago no sábado à noite.
test('confirmação que chega segunda 9h05 começa às 9h05; só confirmação gravada fora do horário vai para as 11h', () => {
  const seg905 = Date.UTC(2026, 10, 16, 12, 5);   // segunda 16/11 9h05 Bahia
  assert.equal(R.inicioDoRelogio(seg905), seg905);
  assert.equal(R.dataHoraBahia(R.prazoFim(seg905)), '19/11/2026 às 09:05');
  const sab22h = Date.UTC(2026, 10, 15, 1, 0);    // sábado 14/11 22h Bahia, gravado na hora
  assert.equal(R.dataHoraBahia(R.inicioDoRelogio(sab22h)), '16/11/2026 às 11:00');
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

// Eventos de interesse (11/11/2026). O enum de ContadorDia.evento no app tem de ter exatamente esta lista.
const EVENTOS_FUNIL = ['visita', 'previa', 'ida_pagamento', 'clique_pagar'];
const EVENTOS_INTERESSE = ['ficou_10s', 'rolou', 'tocou_nome', 'digitou_nome', 'tocou_exemplo'];

test('contador: lista fechada de 9 eventos, na ordem do enum de ContadorDia', () => {
  assert.deepEqual([...R.EVENTOS], [...EVENTOS_FUNIL, ...EVENTOS_INTERESSE]);
  assert.ok(Object.isFrozen(R.EVENTOS), 'lista congelada');
  assert.equal(new Set(R.EVENTOS).size, 9, 'sem repetição');
  for (const ev of R.EVENTOS) assert.match(ev, /^[a-z0-9_]{3,16}$/, ev);
});

test('contador: cada evento de interesse é aceito com nicho, praça e anúncio, como a visita', () => {
  for (const ev of EVENTOS_INTERESSE) {
    assert.deepEqual(R.normalizarContagem({ evento: ev, nicho: 'barbearia', praca: 'feira', utm_content: 'R7-barbearia-v1' }),
      { conferencia: false, evento: ev, nicho: 'barbearia', praca: 'feira', anuncio: 'R7-barbearia-v1' }, ev);
    assert.deepEqual(R.normalizarContagem({ evento: ev, nicho: 'salao', praca: 'salvador-rms', anuncio: 'A1-salao-v1' }),
      { conferencia: false, evento: ev, nicho: 'salao', praca: 'salvador-rms', anuncio: 'A1-salao-v1' }, ev);
    // fora das listas vira 'outro', igual aos eventos de hoje
    assert.deepEqual(R.normalizarContagem({ evento: ev, nicho: 'padaria', praca: 'lisboa', anuncio: 'Z9-nome-do-cliente' }),
      { conferencia: false, evento: ev, nicho: 'outro', praca: 'outro', anuncio: 'outro' }, ev);
    // a conferência no ar continua descartada sem gravar
    assert.deepEqual(R.normalizarContagem({ evento: ev, utm_content: 'conferencia' }), { conferencia: true }, ev);
    assert.deepEqual(R.normalizarContagem({ evento: ev, anuncio: 'conferencia' }), { conferencia: true }, ev);
  }
});

test('contador: evento desconhecido continua recusado (null, nada grava)', () => {
  for (const ev of ['compra', 'Rolou', 'ROLOU', 'rolou ', ' rolou', 'ficou_10', 'ficou_30s', 'digitou', 'nome', 'tocou-nome',
    'clique', 'scroll', '', null, undefined, 1, true, ['rolou'], { evento: 'rolou' }, 'visita\u0000', 'tocou_exemplo2'])
    assert.equal(R.normalizarContagem({ evento: ev, nicho: 'barbearia', praca: 'feira' }), null, JSON.stringify(ev));
  assert.equal(R.normalizarContagem({ nicho: 'barbearia' }), null, 'sem evento');
  assert.equal(R.normalizarContagem(null), null);
  assert.equal(R.normalizarContagem('rolou'), null);
  assert.equal(R.normalizarContagem(['rolou']), null);
});

test('contador: nenhum campo novo passa, nem nome, texto digitado, tempo ou identificador', () => {
  const extras = {
    nome: 'Barbearia do Zé', texto: 'Ze', valor: 'Barbearia', digitado: 'Barb', cidade: 'Feira de Santana',
    whatsapp: '75999999999', email: 'a@b.com', ip: '200.1.2.3', ms: 10432, tempo: 12, duracao: 10000, scrollY: 812,
    id: 'abc', visitante: 'v-123', sessao: 's-1', cookie: '_fbp=fb.1.1', fbp: 'fb.1.1', fbc: 'fb.1.2', ua: 'Mozilla/5.0',
    url: 'https://nuvem.creatmtt.com.br/?n=Barbearia', referrer: 'https://l.instagram.com/', n: 999, data: '2026-01-01'
  };
  for (const ev of R.EVENTOS) {
    const r = R.normalizarContagem({ evento: ev, nicho: 'barbearia', praca: 'feira', utm_content: 'A1-barbearia-v1', ...extras });
    assert.deepEqual(Object.keys(r).sort(), ['anuncio', 'conferencia', 'evento', 'nicho', 'praca'], ev);
    const txt = JSON.stringify(r);
    for (const v of Object.values(extras)) assert.ok(!txt.includes(String(v)), `${ev}: ${v} vazou`);
    // o anúncio nunca carrega texto livre: só código da lista ou 'outro'
    const livre = R.normalizarContagem({ evento: ev, utm_content: 'Barbearia-do-Ze' });
    assert.equal(livre.anuncio, 'outro', ev);
  }
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
  for (const t of ['PA-AAAAAAAAAA', 'R$ 297', 'Pix', '123456789', '13/11/2026 às 10:00', R.TEXTO_REGRA_PRAZO, 'até as 11h do próximo dia de atendimento', '/termos/']) assert.ok(m.corpo.includes(t), t);
  assert.equal(m.corpo.includes('base44-interno'), false, 'o id interno do Base44 não aparece');
  assert.equal(m.assunto.includes('Barbearia'), false);
  assert.equal(R.modeloEmailCliente('outro', {}), null);
  const r = R.modeloEmailCliente('rascunho', { pedido_id: 'PA-AAAAAAAAAA', slug_rascunho: 'barbearia-x--r-abcdefghijkl', token_rascunho: 'q1Zr8Xn4Lw0bT6yHc9VfEA' });
  assert.ok(r.corpo.includes('/sites/barbearia-x--r-abcdefghijkl/#t=q1Zr8Xn4Lw0bT6yHc9VfEA'));
  const r2 = R.modeloEmailCliente('rascunho', { pedido_id: 'PA-AAAAAAAAAA', slug_rascunho: 'barbearia-x--r-abcdefghijkl', token_rascunho: 'x" onclick=' });
  assert.equal(r2.corpo.includes('#t='), false, 'token fora do formato não entra no link');
});

test('endereço único (H3): todo link dos e-mails aponta para https://nuvem.creatmtt.com.br e nenhum para o endereço antigo', () => {
  const NOVO = 'https://nuvem.creatmtt.com.br';
  const base = { pedido_id: 'PA-AAAAAAAAAA', produto: 'pa-abertura-inauguracao-2026-11', valor: 297, meio: 'Pix', payment_id: '123456789', prazo_fim: new Date(R.prazoFim(TER_10H_BAHIA)).toISOString(), plano: 'essencial', slug_rascunho: 'barbearia-x--r-abcdefghijkl', token_rascunho: 'q1Zr8Xn4Lw0bT6yHc9VfEA' };
  const esperado = {
    recibo: [NOVO + '/obrigado/', NOVO + '/termos/'],
    rascunho: [NOVO + '/sites/barbearia-x--r-abcdefghijkl/#t=q1Zr8Xn4Lw0bT6yHc9VfEA', NOVO + '/termos/'],
    mensalidade: [NOVO + '/termos/'],
  };
  for (const [modelo, links] of Object.entries(esperado)) {
    const m = R.modeloEmailCliente(modelo, base);
    for (const l of links) assert.ok(m.corpo.includes(l), modelo + ': ' + l);
    const todos = m.corpo.match(/https?:\/\/[^\s]+/g) || [];
    assert.ok(todos.length >= 1, modelo + ' tem link');
    for (const u of todos) assert.ok(u.startsWith(NOVO + '/'), modelo + ': link fora do endereço novo: ' + u);
    assert.equal(m.corpo.includes('base44.app'), false, modelo + ' sem o endereço antigo');
  }
  // O segredo do pedido nunca aparece em e-mail, nem com o campo presente no registro.
  const comSegredo = R.modeloEmailCliente('recibo', { ...base, segredo: 'AAAAAAAAAAAAAAAAAAAAAA' });
  assert.equal(comSegredo.corpo.includes('AAAAAAAAAAAAAAAAAAAAAA'), false);
});

test('endereço único (H3): entradaDoRegistro usa a origem que vier e, sem origem válida, cai no endereço novo', () => {
  const v = R.validarRegistro(VALIDO);
  const linha = { ...v.pedido, pedido_id: v.pedido.id, aceite_em: '2026-11-10T14:00:00.000Z' };
  assert.ok(R.entradaDoRegistro(linha, 'https://creat-nuvem-404b1994.base44.app').entrada.previa.startsWith('https://creat-nuvem-404b1994.base44.app/previa/#k='), 'aceita o antigo, se vier');
  assert.ok(R.entradaDoRegistro(linha, 'https://nuvem.creatmtt.com.br').entrada.previa.startsWith('https://nuvem.creatmtt.com.br/previa/#k='));
  assert.ok(R.entradaDoRegistro(linha, 'http://localhost:8080').entrada.previa.startsWith('https://nuvem.creatmtt.com.br/previa/'), 'http cai no padrão');
  assert.ok(R.entradaDoRegistro(linha, 'https://x.test/barra/').entrada.previa.startsWith('https://nuvem.creatmtt.com.br/previa/'), 'com caminho cai no padrão');
  assert.ok(R.entradaDoRegistro(linha).entrada.previa.startsWith('https://nuvem.creatmtt.com.br/previa/'), 'sem origem cai no padrão');
});

/* ---------- Correções da conferência da onda 1 (10/11/2026) ---------- */

const require2 = createRequire(import.meta.url);
function validadorSchema() {
  const Ajv2020 = require2(require2.resolve('ajv/dist/2020', { paths: [RAIZ] })).default;
  const addFormats = require2(require2.resolve('ajv-formats', { paths: [RAIZ] })).default;
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false });
  addFormats(ajv);
  ajv.addSchema(JSON.parse(fs.readFileSync(path.join(RAIZ, 'schema', 'pedido.schema.json'), 'utf8')));
  return ajv.getSchema('urn:creat-nuvem:schema:pedido:v1#/$defs/PedidoEntrada');
}

test('PedidoEntrada aceita o id de 10 caracteres do servidor e continua aceitando o de 8 do PEDIDO v1', () => {
  const entrada = validadorSchema();
  const txt = fs.readFileSync(path.join(EX, 'pedido.texto.valido.txt'), 'utf8');
  const { lerPedidoTexto } = require2(path.join(RAIZ, 'scripts', 'producao', 'lib', 'pedido.cjs'));
  const antigo = lerPedidoTexto(txt);
  assert.equal(entrada(antigo), true, '8 caracteres Crockford');
  assert.equal(entrada({ ...antigo, id: 'PA-TESTERLS01' }), true, '10 caracteres [0-9A-Z], como o servidor grava');
  assert.equal(entrada({ ...antigo, id: 'PA-ABC' }), false);
  assert.equal(entrada({ ...antigo, id: 'PA-ABCDEFGHIJK' }), false, '11 caracteres');
});

test('registro com responsavel, endereco e horarios vira PEDIDO v1 que o produzir aceita (validarPedido do 1C), sem inventar nada', () => {
  const v = R.validarRegistro(ler('pedido.registro-v1-completo.valido.json'));
  assert.equal(v.ok, true);
  const linha = { ...v.pedido, pedido_id: v.pedido.id, aceite_em: '2026-11-10T14:00:00.000Z', status: 'pago' };
  const { entrada, faltam } = R.entradaDoRegistro(linha, 'https://nuvem.creatmtt.com.br');
  assert.deepEqual(faltam, []);
  assert.equal(validadorSchema()(entrada), true, 'schema PedidoEntrada');
  const { validarPedido } = require2(path.join(RAIZ, 'scripts', 'producao', 'lib', 'pedido.cjs'));
  assert.doesNotThrow(() => validarPedido(entrada), 'validarPedido do produzir.mjs');
  assert.equal(entrada.whatsapp_negocio, '5575999990000');
  assert.equal(entrada.aceite_termos, '2026-11-10T14:00:00.000Z termos-v1');
  assert.equal(entrada.origem, 'utm_source=meta;utm_campaign=feira;utm_content=A1-barbearia-v1');
  // Registro mínimo (sem os opcionais): nada é inventado, os campos que faltam vêm listados.
  const m = R.validarRegistro(VALIDO);
  const r2 = R.entradaDoRegistro({ ...m.pedido, pedido_id: m.pedido.id, plano: null, aceite_em: '2026-11-10T14:00:00.000Z' });
  assert.deepEqual(r2.faltam, ['plano', 'responsavel', 'endereco', 'horarios']);
  assert.equal('endereco' in r2.entrada, false);
  // Opcionais mal formados são recusados com o nome do campo.
  assert.equal(R.validarRegistro(ler('pedido.registro-v1-horarios-livres.invalido.json')).campo, 'horarios');
  assert.equal(R.validarRegistro({ ...VALIDO, endereco: 'curto' }).campo, 'endereco');
  assert.equal(R.validarRegistro({ ...VALIDO, responsavel: 'Nome 123' }).campo, 'responsavel');
  assert.equal(R.validarRegistro({ ...VALIDO, endereco: '' }).pedido.endereco, null);
});

test('contador: utm_content=video, R1-barbearia-v1 e a rodada v2 gravam o próprio anúncio', () => {
  for (const a of ['video', 'R1-barbearia-v1', 'A1-barbearia-v2', 'A1-salao-v2', 'A1-academia-v2']) {
    assert.equal(R.normalizarContagem({ evento: 'visita', anuncio: a }).anuncio, a, a);
  }
  assert.equal(R.normalizarContagem({ evento: 'visita', utm_content: 'video' }).anuncio, 'video', 'vindo como utm_content');
});

test('todo utm_content concreto dos textos de marketing está na lista ANUNCIOS', () => {
  const pasta = path.join(RAIZ, 'marketing');
  const arquivos = [];
  const andar = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) andar(p); else if (f.name.endsWith('.md')) arquivos.push(p); } };
  andar(pasta);
  const fora = new Set();
  for (const f of arquivos) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/utm_content=([A-Za-z0-9._-]+)/g)) {
      const c = m[1];
      if (c.endsWith('-') || ['conferencia', 'teste'].includes(c) || /^R\d$/.test(c)) continue; // modelo com <nicho>, conferência, teste e roteiro sem código
      if (!R.ANUNCIOS.includes(c)) fora.add(c + ' (' + path.relative(RAIZ, f) + ')');
    }
  }
  assert.deepEqual([...fora], [], 'código de anúncio nos textos e fora de pedido-regras.mjs ANUNCIOS');
});

test('Regra 2 com 12 candidatos: no máximo 4 perguntas com e-mail ao portaAbertaVerificar, e-mails repetidos contam uma vez', async () => {
  const candidatos = Array.from({ length: 12 }, (_, i) => pedido({ pedido_id: 'PA-CAND' + String(i).padStart(6, '0'), email: 'c' + (i % 6) + '@exemplo.com' }));
  let chamadas = 0;
  const nenhum = await R.montarRegra2(candidatos, async () => { chamadas++; return { confere: false }; }, R.LIMITES.verificacoesRegra2);
  assert.equal(chamadas, 4);
  assert.equal(nenhum.chamadas, 4);
  const d = R.decidirConfirmacao({ pg: pg297(), regra1: null, regra2: nenhum.regra2, agoraMs: TER_10H_BAHIA });
  assert.equal(d.acao, 'a_conferir', 'candidato não perguntado nunca é dado como não pagador nem promovido');
  assert.equal(d.candidatos.length, 12);
  // O pagador é o 2º e-mail: para na 2ª pergunta e promove só os pedidos dele.
  chamadas = 0;
  const umSo = await R.montarRegra2(candidatos.slice(0, 6), async e => { chamadas++; return { confere: e === 'c1@exemplo.com' }; }, 4);
  assert.equal(chamadas, 2);
  const d2 = R.decidirConfirmacao({ pg: pg297(), regra1: null, regra2: umSo.regra2, agoraMs: TER_10H_BAHIA });
  assert.equal(d2.acao, 'pago');
  assert.equal(d2.pedido.email, 'c1@exemplo.com');
  // Verificação fora do ar (429 ou 5xx) sem nenhum acerto: transitório (a rota responde 202 e não mexe no pedido).
  const fora = await R.montarRegra2(candidatos.slice(0, 3), async () => ({ transitorio: true }), 4);
  assert.equal(fora.transitorio, true);
  const meio = await R.montarRegra2(candidatos.slice(0, 3), async e => (e === 'c0@exemplo.com' ? { transitorio: true } : { confere: e === 'c1@exemplo.com' }), 4);
  assert.equal(meio.transitorio, false, 'achou o pagador: a falha de outro e-mail não importa');
  assert.deepEqual(R.escolherVerificacoes([{ email: 'A@x.com' }, { email: 'a@x.com' }, { email: 'b@x.com' }], 4), { emails: ['a@x.com', 'b@x.com'], sobra: 0 });
});

test('classificarPagamento: aprovado fora do catálogo deste servidor não é "não confirmado"', () => {
  assert.equal(R.classificarPagamento({ aprovado: false }).tipo, 'nao_aprovado');
  assert.equal(R.classificarPagamento(null).tipo, 'nao_aprovado');
  assert.equal(R.classificarPagamento({ aprovado: true, valor: 197, external_reference: 'pa-bastidores-2026-11' }).tipo, 'fora_do_catalogo');
  assert.equal(R.classificarPagamento({ aprovado: true, valor: 250, external_reference: 'pa-abertura-2026-11' }).tipo, 'fora_do_catalogo');
  assert.equal(R.classificarPagamento({ aprovado: true, valor: 297, external_reference: 'pa-abertura-inauguracao-feira-2026-11' }).tipo, 'aprovado');
});

test('a_conferir pode ir a desistiu; aceite tácito só com 7 dias de rascunho sem resposta', () => {
  assert.equal(R.transicaoPermitida('a_conferir', 'desistiu'), true);
  assert.equal(R.transicaoPermitida('rascunho_enviado', 'no_ar'), true);
  const enviado = TER_10H_BAHIA;
  const p = { status: 'rascunho_enviado', rascunho_em: new Date(enviado).toISOString() };
  assert.equal(R.aceiteTacitoPermitido(p, enviado + 6 * 24 * H), false);
  assert.equal(R.aceiteTacitoPermitido(p, enviado + 7 * 24 * H), true);
  assert.equal(R.aceiteTacitoPermitido({ ...p, aprovado_em: new Date(enviado).toISOString() }, enviado + 8 * 24 * H), false);
  assert.equal(R.aceiteTacitoPermitido({ status: 'rascunho_enviado', aprovacao_expira_em: new Date(enviado + 14 * 24 * H).toISOString() }, enviado + 7 * 24 * H), true, 'sem rascunho_em, deduz da validade de 14 dias');
  assert.equal(R.aceiteTacitoPermitido({ status: 'em_producao', rascunho_em: p.rascunho_em }, enviado + 30 * 24 * H), false);
});

test('campos do executor: só os da lista, com o tipo certo', () => {
  assert.equal(R.validarCamposExecutor({ no_ar_em: '2026-11-12T10:00:00.000Z', garantia_mes_gratis: true, motivo_revisao: 'faltam_dados' }).ok, true);
  assert.equal(R.validarCamposExecutor({ garantia_mes_gratis: 'sim' }).campo, 'garantia_mes_gratis');
  assert.equal(R.validarCamposExecutor({ no_ar_em: 'amanhã' }).campo, 'no_ar_em');
  assert.equal(R.validarCamposExecutor({ motivo_revisao: 'Texto livre do cliente' }).campo, 'motivo_revisao');
  assert.equal(R.validarCamposExecutor({ status: 'pago' }).campo, 'status');
});

/* ---------- Fecho de 10/11: cache negativo do Pix (c2), orçamento anônimo (c3), a_conferir na rotina (c4) ---------- */

// Simula o banco (Operacao e LimiteTaxa) e o portaAbertaVerificar (1B) com o mesmo contrato do 1B:
// pendente -> {aprovado:false, ..., email_confere}; inexistente -> {aprovado:false}; aprovado -> {aprovado:true, ...}.
function bancoFalso({ pagamentos = {}, origem = 'cf:1' } = {}) {
  const cache = new Map();
  const cont = { total: 0, falsosAnon: 0, porOrigem: new Map() };
  const chamadas = [];
  const io = (deOrigem = origem) => ({
    chave: async (pid, email) => 'verif_' + (await R.sha256Hex('verif|' + pid + '|' + email)).slice(0, 40),
    lerCache: async k => cache.get(k) || null,
    gravarCache: async (k, d, ms) => { cache.set(k, d); cache.set(k + ':ms', ms); },
    contadores: async () => ({ total: cont.total, falsosAnon: cont.falsosAnon, falsosAnonOrigem: cont.porOrigem.get(deOrigem) || 0 }),
    somar: async nome => {
      if (nome === 'total') { cont.total++; return; }
      cont.falsosAnon++; cont.porOrigem.set(deOrigem, (cont.porOrigem.get(deOrigem) || 0) + 1);
    },
    chamar: async corpo => {
      chamadas.push(corpo);
      const p = pagamentos[corpo.payment_id];
      if (!p) return { d: { aprovado: false } };
      const email_confere = !!corpo.email_candidato && corpo.email_candidato === p.email;
      if (p.status !== 'approved') return { d: { aprovado: false, valor: p.valor, external_reference: p.ref, email_confere } };
      return { d: { aprovado: true, valor: p.valor, external_reference: p.ref, email_confere, aprovado_em: p.aprovado_em } };
    }
  });
  return { io, cache, cont, chamadas };
}

// Faz o que a rota confirmarPagamento faz depois do r1 (Regra 2), com as regras puras e o banco falso.
async function confirmarSemPedido(b, payment_id, candidatos, io, agoraMs) {
  const r1 = await R.verificarComRegras(io, { payment_id });
  if (r1.transitorio) return { resposta: 'tente_mais_tarde', r1 };
  const cls = R.classificarPagamento(r1.d);
  if (cls.tipo !== 'aprovado') return { resposta: cls.tipo === 'nao_aprovado' ? 'nao_confirmado' : cls.tipo, r1 };
  const recentes = candidatos.filter(p => R.pedidoCasa(p, cls.pg, agoraMs));
  const m2 = await R.montarRegra2(recentes, async email => {
    const r = await R.verificarComRegras(io, { payment_id, email_candidato: email, pagamentoReal: true });
    return r.transitorio ? { transitorio: true } : { confere: r.d.aprovado === true && r.d.email_confere === true };
  }, R.LIMITES.verificacoesRegra2);
  if (m2.transitorio) return { resposta: 'tente_mais_tarde' };
  return { resposta: 'decidido', d: R.decidirConfirmacao({ pg: cls.pg, regra1: null, regra2: m2.regra2, agoraMs }) };
}

test('c2: pergunta com e-mail do Pix pendente não fica guardada como false; quando o Pix compensa, o aviso vira pago (não a_conferir)', async () => {
  const pagamentos = { 123456789: { status: 'pending', valor: 297, ref: 'pa-abertura-inauguracao-feira-2026-11', email: 'dono@exemplo.com.br' } };
  const b = bancoFalso({ pagamentos });
  const io = b.io();
  // Passo 1: a volta a /obrigado/ pergunta com o e-mail do pedido enquanto o Pix está pendente.
  const antes = await R.verificarComRegras(io, { payment_id: '123456789', email_candidato: 'dono@exemplo.com.br', autenticado: true });
  assert.equal(antes.d.aprovado, false);
  assert.equal(R.politicaCacheVerificar(antes.d, true), 0, 'negativa com e-mail não tem validade');
  const chaveEmail = await io.chave('123456789', 'dono@exemplo.com.br');
  assert.equal(b.cache.has(chaveEmail), false, 'nada guardado para a pergunta com e-mail');
  // Passo 2: 30 s depois o Pix compensa e chega o aviso do Mercado Pago (sem pedido_id; Regra 2 pergunta com o e-mail).
  pagamentos[123456789].status = 'approved';
  pagamentos[123456789].aprovado_em = new Date(TER_10H_BAHIA + 30000).toISOString();
  const cand = [pedido({ pedido_id: 'PA-PIXPENDE01', email: 'dono@exemplo.com.br' })];
  const r = await confirmarSemPedido(b, '123456789', cand, io, TER_10H_BAHIA + 60000);
  assert.equal(r.resposta, 'decidido');
  assert.equal(r.d.acao, 'pago');
  assert.equal(r.d.regra, 2);
  assert.equal(r.d.pedido.pedido_id, 'PA-PIXPENDE01');
  // Mesmo que uma linha antiga (gravada antes desta regra) guarde false com e-mail, ela é ignorada.
  const b2 = bancoFalso({ pagamentos });
  const io2 = b2.io();
  b2.cache.set(await io2.chave('123456789', 'dono@exemplo.com.br'), { aprovado: false, email_confere: true });
  const r2 = await confirmarSemPedido(b2, '123456789', cand, io2, TER_10H_BAHIA + 60000);
  assert.equal(r2.d.acao, 'pago', 'cache negativo antigo com e-mail não manda a a_conferir');
  // Sem e-mail, a negativa fica guardada 15 s; a positiva, 1 h.
  assert.equal(R.politicaCacheVerificar({ aprovado: false }, false), R.LIMITES.cacheNegativoMs);
  assert.equal(R.politicaCacheVerificar({ aprovado: true }, true), R.LIMITES.cacheVerificarMs);
  assert.equal(R.cacheVerificarUtil({ aprovado: false }, true), false);
  assert.equal(R.cacheVerificarUtil({ aprovado: false }, false), true);
  assert.equal(R.cacheVerificarUtil({ aprovado: true, email_confere: false }, true), true);
});

test('c3: 30 chamadas anônimas com payment_id inventado não bloqueiam a confirmação real; aprovado:true não gasta o orçamento anônimo', async () => {
  const pagamentos = { 987654321: { status: 'approved', valor: 297, ref: 'pa-abertura-inauguracao-feira-2026-11', email: 'real@exemplo.com.br', aprovado_em: new Date(TER_10H_BAHIA).toISOString() } };
  const b = bancoFalso({ pagamentos });
  const atacante = b.io('cf:203.0.113.9');
  for (let i = 0; i < 30; i++) {
    const r = await R.verificarComRegras(atacante, { payment_id: String(500000000 + i) });
    assert.equal(r.d && r.d.aprovado, false, 'falso ' + i + ' recebe resposta firme negativa');
  }
  assert.equal(b.cont.falsosAnon, 30);
  // O 31º do mesmo endereço já não chega ao 1B (orçamento anônimo esgotado e a faixa da origem também).
  const r31 = await R.verificarComRegras(atacante, { payment_id: '599999999' });
  assert.equal(r31.transitorio, true);
  assert.equal(r31.motivo, 'orcamento_anonimo');
  // O aviso do pagamento real chega de outra origem (servidor do 1B), sem segredo e sem pedido_id.
  const webhook = b.io('cf:198.51.100.7');
  const cand = [pedido({ pedido_id: 'PA-REALREAL01', email: 'real@exemplo.com.br', criado_em: new Date(TER_10H_BAHIA - H).toISOString() })];
  const r = await confirmarSemPedido(b, '987654321', cand, webhook, TER_10H_BAHIA + 60000);
  assert.equal(r.resposta, 'decidido');
  assert.equal(r.d.acao, 'pago');
  assert.equal(b.cont.falsosAnon, 30, 'respostas aprovado:true não contam como tentativa anônima');
  // Mesmo com a faixa da origem do webhook gasta, a Regra 2 de um pagamento já visto aprovado passa (pagamentoReal).
  assert.equal(R.orcamentoVerificar({ pagamentoReal: true, total: 39, falsosAnon: 99, falsosAnonOrigem: 99 }).ok, true);
  assert.equal(R.orcamentoVerificar({ autenticado: true, total: 45, falsosAnon: 99, falsosAnonOrigem: 99 }).ok, true);
  // Tetos que continuam valendo: 400 chamadas por hora para todos; anônimo fecha só por tentativa falsa.
  assert.equal(R.orcamentoVerificar({ autenticado: true, total: 400 }).motivo, 'orcamento');
  assert.equal(R.orcamentoVerificar({ total: 40 }).ok, true, 'o total sozinho não fecha a faixa anônima (fecho 2)');
  assert.equal(R.orcamentoVerificar({ total: 31, falsosAnon: 30, falsosAnonOrigem: 2 }).ok, true);
  assert.equal(R.orcamentoVerificar({ total: 31, falsosAnon: 30, falsosAnonOrigem: 3 }).ok, false);
  assert.equal(R.orcamentoVerificar({ total: 210, falsosAnon: 200, falsosAnonOrigem: 0 }).motivo, 'orcamento_anonimo', 'teto global de falsas');
  // Repetir o mesmo número inventado dentro de 15 s usa o cache e não gasta nada.
  const antes = b.cont.total;
  const rep = await R.verificarComRegras(b.io('cf:192.0.2.1'), { payment_id: '500000000' });
  assert.equal(rep.guardado, true);
  assert.equal(b.cont.total, antes);
});

test('c4: rotina lista a_conferir, alerta a partir de 2 h, um aviso por dia e nunca avisa pedido de teste', () => {
  const agoraMs = TER_10H_BAHIA;
  const pedidos = [
    pedido({ pedido_id: 'PA-CONFERE001', status: 'a_conferir', payment_id: '111111111', updated_date: new Date(agoraMs - 3 * H).toISOString() }),
    pedido({ pedido_id: 'PA-CONFERE002', status: 'a_conferir', payment_id: '222222222', updated_date: new Date(agoraMs - 30 * 60000).toISOString() }),
    pedido({ pedido_id: 'PA-TESTE00003', status: 'a_conferir', payment_id: '333333333', eh_teste: true, updated_date: new Date(agoraMs - 5 * H).toISOString() })
  ];
  const registros = [
    // O registro manda na hora (a primeira vez que foi a a_conferir), não o updated_date.
    R.registroAConferir({ payment_id: '222222222', pedido_id: 'PA-CONFERE002', candidatos: ['PA-CONFERE002'], regra: 1, agoraMs: agoraMs - 2.5 * H }),
    // Pagamento aprovado sem pedido marcado (dois candidatos com e-mail): só existe no registro.
    R.registroAConferir({ payment_id: '444444444', pedido_id: null, candidatos: ['PA-CANDIDAT01', 'PA-CANDIDAT02', 'nao-e-id'], regra: 2, agoraMs: agoraMs - 4 * H }),
    R.registroAConferir({ payment_id: '555555555', pedido_id: null, candidatos: [], regra: 3, agoraMs: agoraMs - H })
  ];
  const { itens, avisar } = R.itensAConferir({ pedidos, registros, avisadosHoje: [], agoraMs });
  assert.equal(itens.length, 5);
  const porRef = Object.fromEntries(itens.map(i => [i.ref, i]));
  assert.equal(porRef['111111111'].alerta, true);
  assert.equal(porRef['111111111'].horas, 3);
  assert.equal(porRef['222222222'].alerta, true, 'vale a hora do registro (2,5 h), não a última atualização (30 min)');
  assert.equal(porRef['444444444'].pedido_id, null);
  assert.deepEqual(porRef['444444444'].candidatos, ['PA-CANDIDAT01', 'PA-CANDIDAT02']);
  assert.equal(porRef['555555555'].alerta, false, '1 h ainda não alerta');
  assert.equal(porRef['333333333'].teste, true);
  assert.deepEqual(avisar.map(i => i.ref).sort(), ['111111111', '222222222', '444444444'], 'teste e item com menos de 2 h não geram aviso');
  // Na próxima rodada do mesmo dia nada é avisado de novo; no dia seguinte, sim.
  const mesmoDia = R.itensAConferir({ pedidos, registros, avisadosHoje: avisar.map(i => i.ref), agoraMs: agoraMs + H });
  assert.deepEqual(mesmoDia.avisar.map(i => i.ref), ['555555555'], 'só o que passou de 2 h nesta hora; os já avisados hoje não repetem');
  assert.equal(mesmoDia.itens.filter(i => i.alerta).length, 5, 'o alerta continua na resposta da rotina enquanto não se resolve (inclusive o de teste)');
  const outroDia = R.itensAConferir({ pedidos, registros, avisadosHoje: [], agoraMs: agoraMs + 24 * H });
  assert.equal(outroDia.avisar.length, 4);
  // Exatamente 2 h já alerta; 1 h 59 não.
  const limite = R.itensAConferir({ pedidos: [], registros: [R.registroAConferir({ payment_id: '666666666', agoraMs: agoraMs - 2 * H })], avisadosHoje: [], agoraMs });
  assert.equal(limite.avisar.length, 1);
  const deTeste = R.itensAConferir({ pedidos: [], registros: [R.registroAConferir({ payment_id: '777777777', teste: true, agoraMs: agoraMs - 5 * H })], avisadosHoje: [], agoraMs });
  assert.equal(deTeste.itens[0].teste, true);
  assert.equal(deTeste.itens[0].alerta, true);
  assert.equal(deTeste.avisar.length, 0, 'registro de teste nunca gera aviso');
  const quase = R.itensAConferir({ pedidos: [], registros: [R.registroAConferir({ payment_id: '666666666', agoraMs: agoraMs - 2 * H + 60000 })], avisadosHoje: [], agoraMs });
  assert.equal(quase.avisar.length, 0);
});

/* ---------- Fecho 2 de 10/11: o aviso do Mercado Pago não disputa o orçamento anônimo (c3) ---------- */

// Banco falso com o 1B de verdade em miniatura: lista de e-mails (emails_candidatos) e 429 por origem acima de 60 falsas.
function bancoLista({ pagamentos = {}, limite1b = 60 } = {}) {
  const b = bancoFalso({ pagamentos });
  let falsas1b = 0;
  const io = (origem) => {
    const base = b.io(origem);
    return {
      ...base,
      chamar: async corpo => {
        b.chamadas.push(corpo);
        const p = pagamentos[corpo.payment_id];
        const aprovado = !!p && p.status === 'approved';
        if (!aprovado) { falsas1b++; if (falsas1b > limite1b) return { transitorio: true, motivo: 'limite_1b' }; }
        if (!p) return { d: { aprovado: false } };
        const lista = Array.isArray(corpo.emails_candidatos) ? corpo.emails_candidatos : null;
        const cands = lista || (corpo.email_candidato ? [corpo.email_candidato] : []);
        const i = cands.findIndex(e => e === p.email);
        const d = { aprovado, valor: p.valor, external_reference: p.ref, email_confere: i >= 0 };
        if (lista) d.email_confere_indice = i;
        if (aprovado) d.aprovado_em = p.aprovado_em;
        return { d };
      }
    };
  };
  return { ...b, io };
}

async function confirmarComLista(b, payment_id, candidatos, io, agoraMs) {
  const r1 = await R.verificarComRegras(io, { payment_id });
  if (r1.transitorio) return { resposta: 'tente_mais_tarde', motivo: r1.motivo };
  const cls = R.classificarPagamento(r1.d);
  if (cls.tipo !== 'aprovado') return { resposta: 'nao_confirmado' };
  const recentes = candidatos.filter(p => R.pedidoCasa(p, cls.pg, agoraMs));
  const m2 = await R.montarRegra2Lista(io, { payment_id, candidatos: recentes });
  if (m2.transitorio) return { resposta: 'tente_mais_tarde' };
  return { resposta: 'decidido', chamadas: m2.chamadas, d: R.decidirConfirmacao({ pg: cls.pg, regra1: null, regra2: m2.regra2, agoraMs }) };
}

test('fecho 2 (achado 5): 30 ids inventados de um endereço e 4 por endereço em 4 endereços novos não atrasam o aviso do Mercado Pago', async () => {
  const pagamentos = { 987650001: { status: 'approved', valor: 297, ref: 'pa-abertura-inauguracao-feira-2026-11', email: 'real@exemplo.com.br', aprovado_em: new Date(TER_10H_BAHIA).toISOString() } };
  const b = bancoLista({ pagamentos });
  let id = 700000000;
  for (let i = 0; i < 30; i++) await R.verificarComRegras(b.io('cf:203.0.113.1'), { payment_id: String(id++) });
  let barradas = 0;
  for (let e = 2; e <= 5; e++) {
    for (let i = 0; i < 4; i++) {
      const r = await R.verificarComRegras(b.io('cf:203.0.113.' + e), { payment_id: String(id++) });
      if (r.transitorio) barradas++;
    }
  }
  assert.equal(b.cont.falsosAnon, 42, '30 + 3 por endereço novo');
  assert.equal(barradas, 4, 'o 4º de cada endereço novo é barrado');
  assert.ok(b.cont.total >= 40, 'o total passou de 40, o que no fecho 1 fechava a porta: ' + b.cont.total);
  const cand = [pedido({ pedido_id: 'PA-REALREAL02', email: 'real@exemplo.com.br', criado_em: new Date(TER_10H_BAHIA - H).toISOString() }),
    pedido({ pedido_id: 'PA-OUTROOUT02', email: 'outro@exemplo.com.br', criado_em: new Date(TER_10H_BAHIA - 2 * H).toISOString() })];
  const antes = b.chamadas.length;
  const r = await confirmarComLista(b, '987650001', cand, b.io('cf:198.51.100.7'), TER_10H_BAHIA + 60000);
  assert.equal(r.resposta, 'decidido');
  assert.equal(r.d.acao, 'pago');
  assert.equal(r.d.regra, 2);
  assert.equal(r.d.pedido.pedido_id, 'PA-REALREAL02');
  assert.equal(b.chamadas.length - antes, 2, '1 sem e-mail + 1 com a lista inteira');
  assert.deepEqual(b.chamadas.at(-1).emails_candidatos, ['real@exemplo.com.br', 'outro@exemplo.com.br']);
});

test('fecho 2: com 1B devolvendo 429 às falsas, cada 429 anônimo gasta o orçamento (não vira chamada de graça)', async () => {
  const b = bancoLista({ limite1b: 5 });
  for (let i = 0; i < 40; i++) await R.verificarComRegras(b.io('cf:203.0.113.50'), { payment_id: String(710000000 + i) });
  assert.equal(b.chamadas.length, 30, 'depois de 30 tentativas falsas ou passageiras, o endereço fica sem faixa');
  assert.equal(b.cont.falsosAnon, 30);
});

test('fecho 2: teto global de falsas protege o teto duro do 1B; a faixa autenticada e a do pagamento real seguem abertas', async () => {
  const b = bancoLista({ limite1b: 1e9 });
  let id = 720000000, enderecos = 0;
  while (b.cont.falsosAnon < R.LIMITES.verificarFalsosTetoHora) {
    enderecos++;
    for (let i = 0; i < 4; i++) await R.verificarComRegras(b.io('cf:10.0.' + enderecos), { payment_id: String(id++) });
  }
  assert.equal(b.cont.falsosAnon, R.LIMITES.verificarFalsosTetoHora);
  assert.ok(enderecos >= 57, 'foram precisos ' + enderecos + ' endereços');
  const novo = await R.verificarComRegras(b.io('cf:10.9.9.9'), { payment_id: String(id++) });
  assert.equal(novo.motivo, 'orcamento_anonimo');
  assert.ok(b.cont.total < R.LIMITES.verificarHora);
  assert.equal(R.orcamentoVerificar({ autenticado: true, ...{ total: b.cont.total, falsosAnon: b.cont.falsosAnon } }).ok, true);
  assert.ok(R.LIMITES.verificarHora < 600, 'abaixo do teto duro do 1B por origem');
});

test('fecho 2 (c2 estrito): negativa sem e-mail vale 15 s; 20 s depois a consulta pergunta de novo e o Pix compensado vira aprovado', async () => {
  const pagamentos = { 730000001: { status: 'pending', valor: 297, ref: 'pa-abertura-inauguracao-feira-2026-11', email: 'pix@exemplo.com.br' } };
  const b = bancoLista({ pagamentos });
  let relogio = TER_10H_BAHIA;
  const io = { ...b.io('cf:198.51.100.8'), agora: () => relogio };
  const a = await R.verificarComRegras(io, { payment_id: '730000001' });
  assert.equal(a.d.aprovado, false);
  relogio += 5000;
  assert.equal((await R.verificarComRegras(io, { payment_id: '730000001' })).guardado, true, 'rajada em 5 s usa o cache');
  pagamentos[730000001].status = 'approved';
  pagamentos[730000001].aprovado_em = new Date(relogio).toISOString();
  relogio += 15000;
  const c = await R.verificarComRegras(io, { payment_id: '730000001' });
  assert.equal(c.guardado, undefined);
  assert.equal(c.d.aprovado, true);
  // Linha antiga, sem carimbo (gravada com a validade de 2 min do fecho 1): não segura nada.
  assert.equal(R.cacheVerificarUtil({ aprovado: false }, false, relogio), false);
  assert.equal(R.cacheVerificarUtil({ aprovado: false, em: relogio - 16000 }, false, relogio), false);
  assert.equal(R.cacheVerificarUtil({ aprovado: false, em: relogio - 1000 }, false, relogio), true);
});

test('fecho 2: Regra 2 com lista: sem acerto, perguntados ficam false e a sobra fica null (nunca promove); falha do 1B é passageira', async () => {
  const pagamentos = { 740000001: { status: 'approved', valor: 297, ref: 'pa-abertura-inauguracao-feira-2026-11', email: 'ninguem@exemplo.com.br', aprovado_em: new Date(TER_10H_BAHIA).toISOString() } };
  const b = bancoLista({ pagamentos });
  const cand = Array.from({ length: 7 }, (_, i) => pedido({ pedido_id: 'PA-LISTA0000' + i, email: 'l' + i + '@exemplo.com.br' }));
  const m = await R.montarRegra2Lista(b.io('cf:1'), { payment_id: '740000001', candidatos: cand });
  assert.equal(m.chamadas, 1);
  assert.equal(b.chamadas.at(-1).emails_candidatos.length, 5);
  assert.deepEqual(m.regra2.map(x => x.emailConfere), [false, false, false, false, false, null, null]);
  assert.equal(R.decidirConfirmacao({ pg: pg297(), regra1: null, regra2: m.regra2, agoraMs: TER_10H_BAHIA }).acao, 'a_conferir');
  const quebrado = { ...b.io('cf:1'), chamar: async () => ({ transitorio: true, motivo: 'http_503' }) };
  assert.equal((await R.montarRegra2Lista(quebrado, { payment_id: '740000001', candidatos: cand })).transitorio, true);
  assert.equal((await R.montarRegra2Lista(b.io('cf:1'), { payment_id: '740000001', candidatos: [] })).chamadas, 0);
});

test('fecho 2: confirmação pendente: registro sem dado pessoal, fila por repetição, apagar e alertar', () => {
  const t0 = TER_10H_BAHIA;
  const r1 = R.registroPendente(null, { payment_id: '750000001', motivo: 'orcamento_anonimo', agoraMs: t0 });
  assert.deepEqual(Object.keys(r1).sort(), ['desde', 'motivo', 'n', 'payment_id', 'tentativas_rotina', 'ultimo']);
  const r2 = R.registroPendente(r1, { payment_id: '750000001', motivo: 'limite_1b', agoraMs: t0 + 20000 });
  assert.equal(r2.n, 2);
  assert.equal(r2.desde, r1.desde, 'a primeira hora é a que conta');
  const outro = R.registroPendente(null, { payment_id: '750000002', motivo: 'x', agoraMs: t0 - H });
  const fila = R.escolherPendentes([outro, r2, { payment_id: 'lixo' }], 10);
  assert.deepEqual(fila.map(x => x.payment_id), ['750000001', '750000002']);
  assert.equal(R.escolherPendentes([outro, r2], 1).length, 1);
  // Rodízio: o que a rotina já tentou 3 vezes vai para o fim; repetição acima de 5 não fura a fila.
  const velho = { ...R.registroPendente(null, { payment_id: '750000003', motivo: 'limite_1b', agoraMs: t0 - 5 * H }), n: 40, tentativas_rotina: 3 };
  const comprado = { ...R.registroPendente(null, { payment_id: '750000004', motivo: 'x', agoraMs: t0 }), n: 99 };
  const real = { ...R.registroPendente(null, { payment_id: '750000005', motivo: 'x', agoraMs: t0 - H }), n: 5 };
  assert.deepEqual(R.escolherPendentes([velho, comprado, real], 3).map(x => x.payment_id), ['750000005', '750000004', '750000003']);
  assert.deepEqual(R.destinoPendente(r2, 'confirmado', t0), { apagar: true, alerta: false });
  assert.deepEqual(R.destinoPendente(r2, 'nao_aprovado', t0), { apagar: true, alerta: false });
  assert.deepEqual(R.destinoPendente(r2, 'passageiro', t0 + H), { apagar: false, alerta: false });
  assert.deepEqual(R.destinoPendente(r2, 'passageiro', t0 + 2 * H), { apagar: false, alerta: true });
});

test('fecho 2: pasta do rascunho é <slug>--r-<id>; o formato antigo -r- e o slug final com "-r-" não passam como rascunho', () => {
  assert.ok(R.RE.slugRascunho.test('barbearia-do-r-feira-de-santana--r-k3x9q2m7d4b8'));
  assert.equal(R.RE.slugRascunho.test('barbearia-do-ze--r-abc'), false, 'id curto');
  assert.equal(R.RE.slugRascunho.test('barbearia-do-ze-r-k3x9q2m7d4b8'), false, 'marcador antigo');
  assert.equal(R.RE.slugRascunho.test('barbearia-do-r-feira-de-santana'), false);
});
