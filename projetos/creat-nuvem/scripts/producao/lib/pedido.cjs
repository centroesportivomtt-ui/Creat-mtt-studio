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
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

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
function partesEndereco(endereco, cidade) {
  const formato = 'use "Rua, número, bairro, cidade-UF, CEP" (ex.: Rua das Flores, 120, Centro, Campinas-SP, 13010-000)';
  let s = ' ' + String(endereco).replace(/\s+/g, ' ').trim() + ' ';
  const mCep = s.match(/\b(\d{5})-?(\d{3})\b/);
  if (!mCep) throw new ErroCampo('endereco', `não achei o CEP; ${formato}`);
  const cep = `${mCep[1]}-${mCep[2]}`;
  s = s.replace(mCep[0], ' ');
  const reUf = new RegExp(`(?:^|[\\s,/-])(${UFS.join('|')})(?=[\\s,/.-]*$|[\\s,/.-]+\\s*$)`);
  let mUf = s.replace(/[\s,./-]+$/, '').match(new RegExp(`(?:^|[\\s,/-])(${UFS.join('|')})$`));
  if (!mUf) mUf = s.match(reUf);
  if (!mUf) throw new ErroCampo('endereco', `não achei a UF (sigla do estado em maiúsculas); ${formato}`);
  const uf = mUf[1];
  let resto = s.replace(/[\s,./-]+$/, '');
  resto = resto.slice(0, resto.lastIndexOf(uf)) + resto.slice(resto.lastIndexOf(uf) + 2);
  // tira a cidade do pedido (sem acento, sem caixa) do fim
  const cid = semAcento(cidade).toLowerCase();
  const restoCmp = semAcento(resto).toLowerCase();
  const iCid = restoCmp.lastIndexOf(cid);
  if (cid && iCid !== -1) resto = resto.slice(0, iCid) + resto.slice(iCid + cid.length);
  const partes = resto.split(/\s*[,;]\s*|\s+[-–]\s+/).map((p) => p.replace(/^[\s./-]+|[\s./-]+$/g, '').trim()).filter(Boolean);
  const ehNumero = (p) => /^(n[ºo°.]?\s*)?\d{1,6}[A-Za-z]?$|^s\/?n$/i.test(p);
  let i = partes.findIndex(ehNumero);
  if (i === -1) {
    // "Rua das Flores 120, Centro"
    const j = partes.findIndex((p) => /^\D.*\s\d{1,6}[A-Za-z]?$/.test(p));
    if (j !== -1) {
      const m = partes[j].match(/^(.*\D)\s(\d{1,6}[A-Za-z]?)$/);
      partes.splice(j, 1, m[1].trim(), m[2]);
      i = j + 1;
    }
  }
  if (i < 1) throw new ErroCampo('endereco', `não consegui separar a rua do número; ${formato}`);
  const rua = partes.slice(0, i).join(', ');
  const numero = partes[i].replace(/^n[ºo°.]?\s*/i, '').toUpperCase() === 'SN' ? 's/n' : partes[i].replace(/^n[ºo°.]?\s*/i, '');
  const bairro = partes.slice(i + 1).join(', ');
  if (!bairro) throw new ErroCampo('endereco', `não achei o bairro; ${formato}`);
  const lim = { rua: 80, numero: 12, bairro: 60 };
  for (const [k, v] of Object.entries({ rua, numero, bairro })) if (v.length > lim[k]) throw new ErroCampo(`endereco (${k})`, `acima do limite de ${lim[k]} caracteres`);
  return { rua, numero, bairro, cidade: String(cidade), uf, cep };
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
