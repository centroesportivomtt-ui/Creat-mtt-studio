#!/usr/bin/env node
// Prova dos contratos da T1: todo *.valido.* passa e todo *.invalido.* falha no schema do prefixo.
// Uso: AJV_DIR=<pasta com node_modules/ajv@8.20.0 e ajv-formats@3.0.1> node schema/exemplos/validar.cjs
// Sem rede e sem escrever nada. Sai com código 1 se algum exemplo tiver o resultado errado.
// strictTypes desligado: os fragmentos if/then só acrescentam required/maxItems e não repetem "type".
const fs = require('fs'), path = require('path');
// Pasta com o ajv: AJV_DIR; sem ela, tenta a pasta atual. Sem ajv, explica como instalar e sai com código 2.
const base = process.env.AJV_DIR || process.cwd();
const req = m => {
  try { return require(require.resolve(m, { paths: [base] })); }
  catch (e) {
    console.error(`validar.cjs: nao achei "${m}" em ${base}${process.env.AJV_DIR ? ' (AJV_DIR)' : ' (AJV_DIR nao definido; usei a pasta atual)'}.\n` +
      'Instale antes, numa pasta fora do repositorio, e aponte AJV_DIR para ela:\n' +
      '  mkdir -p <pasta> && cd <pasta> && npm init -y && npm install --save-exact ajv@8.20.0 ajv-formats@3.0.1\n' +
      '  AJV_DIR=<pasta> node schema/exemplos/validar.cjs');
    process.exit(2);
  }
};
const Ajv2020 = req('ajv/dist/2020').default, addFormats = req('ajv-formats').default;
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false });
addFormats(ajv);
const pasta = __dirname, raiz = path.join(pasta, '..');
const validadores = {};
for (const n of ['tenant', 'pedido', 'evento']) validadores[n] = ajv.compile(JSON.parse(fs.readFileSync(path.join(raiz, `${n}.schema.json`), 'utf8')));

// Texto PEDIDO v1 -> objeto: 1a linha "PEDIDO v1", depois "chave: valor" (separa no primeiro ": ").
function lerPedidoTexto(txt) {
  const linhas = txt.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const o = { formato: (linhas.shift() || '').trim() };
  for (const l of linhas) { const i = l.indexOf(': '); if (i < 1) { o['linha_invalida_' + l] = l; continue; } o[l.slice(0, i).trim()] = l.slice(i + 2).trim(); }
  return o;
}

let falhas = 0;
for (const arq of fs.readdirSync(pasta).filter(f => /\.(valido|invalido)\.(json|txt)$/.test(f)).sort()) {
  const schema = arq.split('.')[0], esperado = arq.includes('.valido.');
  const txt = fs.readFileSync(path.join(pasta, arq), 'utf8');
  const dado = arq.endsWith('.txt') ? lerPedidoTexto(txt) : JSON.parse(txt);
  const ok = validadores[schema](dado);
  const certo = ok === esperado;
  if (!certo) falhas++;
  // Para o motivo, valida de novo só no ramo do oneOf a que o exemplo pertence (mensagem que cita o campo).
  const ramo = schema === 'pedido' ? (dado.formato ? 'PedidoEntrada' : dado.segredo !== undefined ? 'PedidoRegistro' : 'Pedido') : schema === 'evento' ? (dado.evento ? 'EventoAnalytics' : 'EventoPedido') : null;
  const v = ramo ? ajv.getSchema(`${validadores[schema].schema.$id}#/$defs/${ramo}`) : validadores[schema];
  if (!ok) v(dado);
  const erros = (v.errors || validadores[schema].errors || []).filter(e => e.keyword !== 'if');
  const motivo = ok ? '' : ' · ' + erros.slice(0, 2).map(e => `${e.instancePath || '/'} ${e.message}${e.params && e.params.additionalProperty ? ' (' + e.params.additionalProperty + ')' : ''}`).join(' | ');
  console.log(`${certo ? 'ok    ' : 'ERRADO'} ${arq} -> ${ok ? 'passou' : 'rejeitado'}${motivo}`);
}
console.log(falhas ? `\n${falhas} exemplo(s) com resultado errado` : '\ntodos os exemplos com o resultado esperado');
process.exit(falhas ? 1 : 0);
