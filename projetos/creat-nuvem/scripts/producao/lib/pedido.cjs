/*
 * scripts/producao/lib/pedido.cjs · lê e valida o PEDIDO v1 (texto ou JSON)
 *
 * Contrato: schema/pedido.schema.json#/$defs/PedidoEntrada e docs/CONTRATOS-DETALHE.md (g).
 * Texto: 1ª linha "PEDIDO v1", depois uma linha "chave: valor" por campo, na ordem do schema.
 * Regra da casa (risco 5 da ARQUITETURA): o pedido pode chegar editado à mão no WhatsApp;
 * aqui nada é adivinhado. Linha a mais, chave repetida, ordem trocada ou valor fora do
 * schema = pedido rejeitado com o nome do campo.
 */
'use strict';
const fs = require('fs');
const { ErroCampo, ErroLista, validador, REF, errosAjv } = require('./comum.cjs');

const ORDEM = ['id', 'plano', 'nicho', 'negocio', 'cidade', 'responsavel', 'whatsapp_negocio', 'endereco',
  'horarios', 'email', 'origem', 'previa', 'aceite_termos'];
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];     // índice = funcionamento.semana do tenant

function lerPedidoTexto(txt) {
  const linhas = String(txt).replace(/^﻿/, '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  if ((linhas[0] || '') !== 'PEDIDO v1') throw new ErroCampo('formato', 'a primeira linha precisa ser exatamente "PEDIDO v1"');
  const o = { formato: 'PEDIDO v1' };
  const vistas = [];
  linhas.slice(1).forEach((l, i) => {
    const n = i + 2;
    const sep = l.indexOf(': ');
    if (sep < 1) throw new ErroCampo(`linha ${n}`, `linha sem "chave: valor" ("${l.slice(0, 40)}")`);
    const k = l.slice(0, sep).trim(), v = l.slice(sep + 2).trim();
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
