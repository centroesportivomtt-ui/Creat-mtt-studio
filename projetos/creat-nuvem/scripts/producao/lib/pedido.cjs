/*
 * scripts/producao/lib/pedido.cjs · lê e valida o PEDIDO v1 (texto ou JSON)
 *
 * Contrato: schema/pedido.schema.json#/$defs/PedidoEntrada e docs/CONTRATOS-DETALHE.md (g).
 * Texto: a linha "PEDIDO v1", depois uma linha "chave: valor" por campo, na ordem do schema.
 * Regra da casa (risco 5 da ARQUITETURA): o pedido pode chegar editado à mão no WhatsApp;
 * aqui nada é adivinhado. Linha a mais, chave repetida, ordem trocada ou valor fora do
 * schema = pedido rejeitado com o nome do campo.
 * Mensagem inteira do WhatsApp (fecho F2, 10/11/2026; assets/vitrine.js, mensagemPedido): tudo o que vem
 * ANTES da primeira linha exatamente igual a "PEDIDO v1" (a frase "Oi! Acabei de pagar...") é descartado
 * sem ser lido. Depois de aceite_termos, as linhas do pagamento (pagamento, mp_pagamento, produto, valor),
 * nesta ordem, cada uma opcional e com formato fechado, são aceitas e IGNORADAS: o pagamento vale pelo
 * servidor (webhook do Mercado Pago), nunca pelo que a mensagem diz. Fora do formato = pedido rejeitado.
 * validarPedido roda antes do schema o portão de instrução (lib/bloqueio.cjs, checarPedido) sobre o
 * endereço inteiro, o responsável, os horários e os canais laterais (e-mail, origem e o link da prévia, com
 * n= igual ao negócio e c= igual à cidade; fecho 2 do F2), que o portão da entrada do produzir.mjs não recebe:
 * disparou, ErroCampo com "instrucao_no_campo" na mensagem (código 1 do produzir.mjs).
 */
'use strict';
const fs = require('fs');
const { ErroCampo, ErroLista, validador, REF, errosAjv } = require('./comum.cjs');

const ORDEM = ['id', 'plano', 'nicho', 'negocio', 'cidade', 'responsavel', 'whatsapp_negocio', 'endereco',
  'horarios', 'email', 'origem', 'previa', 'aceite_termos'];
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];     // índice = funcionamento.semana do tenant

/* linhas do pagamento que a vitrine põe depois de aceite_termos: aceitas só neste formato, e ignoradas */
const PAGAMENTO = [
  ['pagamento', /^(aprovado|pendente|recusado|sem_retorno)$/],
  ['mp_pagamento', /^\d{6,14}$/],
  ['produto', /^pa-[a-z0-9-]{1,40}$/],
  ['valor', /^\d{1,6}([.,]\d{1,2})?$/]
];

function lerPedidoTexto(txt) {
  const todas = String(txt).replace(/^﻿/, '').replace(/\r/g, '').split('\n').map((l, i) => ({ l: l.trim(), n: i + 1 }));
  // o que vem antes da primeira linha "PEDIDO v1" (a frase de abertura do WhatsApp) é descartado sem ser lido
  const ini = todas.findIndex((x) => x.l === 'PEDIDO v1');
  if (ini === -1) throw new ErroCampo('formato', 'falta a linha "PEDIDO v1" (exatamente assim) antes dos campos');
  const linhas = todas.slice(ini + 1).filter((x) => x.l);
  const o = { formato: 'PEDIDO v1' };
  const vistas = [];
  let pag = -1;                 // índice da última linha de pagamento lida (-1 = nenhuma)
  linhas.forEach(({ l, n }) => {
    const sep = l.indexOf(': ');
    if (sep < 1) throw new ErroCampo(`linha ${n}`, `linha sem "chave: valor" ("${l.slice(0, 40)}")`);
    const k = l.slice(0, sep).trim(), v = l.slice(sep + 2).trim();
    const ip = PAGAMENTO.findIndex(([c]) => c === k);
    if (ip !== -1) {
      if (!('aceite_termos' in o)) throw new ErroCampo(k, `linha do pagamento antes de aceite_termos (linha ${n})`);
      if (ip <= pag) throw new ErroCampo(k, `linha do pagamento repetida ou fora da ordem pagamento, mp_pagamento, produto, valor (linha ${n})`);
      if (!PAGAMENTO[ip][1].test(v)) throw new ErroCampo(k, `valor fora do formato na linha ${n}`);
      pag = ip;
      return;                   // aceita e ignora: o pagamento vale pelo servidor, não pela mensagem
    }
    if (pag !== -1) throw new ErroCampo(k, `campo depois das linhas do pagamento (linha ${n})`);
    if (!ORDEM.includes(k)) throw new ErroCampo(k, `campo desconhecido na linha ${n} (linha a mais = pedido inválido)`);
    if (k in o) throw new ErroCampo(k, `campo repetido na linha ${n}`);
    o[k] = v;
    vistas.push(k);
  });
  const esperado = ORDEM.filter((k) => vistas.includes(k));
  if (esperado.join() !== vistas.join()) {
    const i = vistas.findIndex((k, j) => k !== esperado[j]);
    throw new ErroCampo(vistas[i], `fora da ordem do PEDIDO v1 (esperado "${esperado[i]}" nessa posição)`);
  }
  return o;
}

/* texto ou JSON; devolve o objeto PedidoEntrada (ainda não validado) */
function lerPedidoArquivo(arq) {
  let txt;
  try { txt = fs.readFileSync(arq, 'utf8'); }
  catch (e) { throw new ErroCampo('--pedido', `não consegui ler ${arq} (${e.code || e.message})`); }
  const t = txt.replace(/^﻿/, '').trim();
  if (t.startsWith('{')) {
    let o;
    try { o = JSON.parse(t); } catch (e) { throw new ErroCampo('--pedido', `JSON inválido (${e.message})`); }
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new ErroCampo('--pedido', 'o JSON precisa ser um objeto');
    if (!('formato' in o)) o = Object.assign({ formato: 'PEDIDO v1' }, o);
    return o;
  }
  return lerPedidoTexto(t);
}

/* "09:00" -> minutos */
function minutos(h) { const [a, b] = h.split(':').map(Number); return a * 60 + b; }

/* horarios -> funcionamento.semana {0..6}; fecha precisa ser depois de abre */
function semanaDosHorarios(horarios) {
  const semana = {};
  const partes = String(horarios).split(';');
  partes.forEach((p) => {
    const [dia, val] = p.split('=');
    const i = DIAS.indexOf(dia);
    if (val === 'fechado') { semana[i] = null; return; }
    const [abre, fecha] = val.split('-');
    if (minutos(fecha) <= minutos(abre)) throw new ErroCampo(`horarios.${dia}`, `fecha (${fecha}) precisa ser depois de abre (${abre}); virada de madrugada não é aceita no v1`);
    semana[i] = { abre, fecha };
  });
  if (Object.values(semana).every((d) => d === null)) throw new ErroCampo('horarios', 'os 7 dias estão fechados');
  return semana;
}

function semAcento(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }

/*
 * endereco (uma linha livre, "Rua, número, bairro, cidade, UF e CEP") -> partes do tenant.
 * Determinístico: se não der para separar sem chutar, rejeita citando o campo.
 */
// Regra única do endereço: a mesma que a vitrine (/abrir/) usa antes do pagamento.
const ENDERECO = require('../../../assets/endereco.js');
function partesEndereco(endereco, cidade) {
  const r = ENDERECO.analisar(endereco, cidade);
  if (!r.ok) throw new ErroCampo(r.campo ? `endereco (${r.campo})` : 'endereco', r.campo ? r.erro.replace(/^\w+ /, '') : r.erro);
  return r.valor;
}

/* estado do fragmento da prévia (#k=&n=&c=&p=) que vem no campo previa */
function fragmentoPrevia(previa) {
  const h = String(previa).split('#')[1] || '';
  const q = new URLSearchParams(h);
  const p = parseInt(q.get('p') || '1', 10);
  return { k: q.get('k') || '', n: q.get('n') || '', c: q.get('c') || '', p: p >= 1 && p <= 3 ? p : 1 };
}

/* valida contra o schema e as regras que o schema não expressa; devolve o pedido normalizado */
function validarPedido(o) {
  const inst = require('./bloqueio.cjs').checarPedido(o);
  if (inst.length) throw new ErroCampo(inst[0].campo, `instrucao_no_campo: ${inst.map((m) => m.regra.replace(/^instrucao_no_campo: /, '') + (m.trecho ? ` ("${m.trecho}")` : '')).join('; ')}`);
  const v = validador(REF.pedidoEntrada);
  if (!v(o)) throw new ErroLista('Pedido inválido (schema/pedido.schema.json#/$defs/PedidoEntrada):', errosAjv(v.errors).map((e) => {
    if (e.campo === 'whatsapp_negocio') e.mensagem = 'precisa ser só dígitos, 55 + DDD + 8 ou 9 números, e não pode ser 5500000000000 nem começar por 5500';
    return e;
  }));
  semanaDosHorarios(o.horarios);
  partesEndereco(o.endereco, o.cidade);
  const f = fragmentoPrevia(o.previa);
  if (f.k !== o.nicho) throw new ErroCampo('previa', `o nicho do link da prévia (${f.k}) é diferente do campo nicho (${o.nicho})`);
  return o;
}

module.exports = { ORDEM, DIAS, lerPedidoTexto, lerPedidoArquivo, validarPedido, semanaDosHorarios, partesEndereco, fragmentoPrevia, semAcento };
