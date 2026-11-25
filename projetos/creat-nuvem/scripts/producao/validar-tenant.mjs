#!/usr/bin/env node
/*
 * scripts/producao/validar-tenant.mjs · valida um TenantConfig v1 (passo 3 da seção 15) · T9 · Forja
 *
 * Uso: node scripts/producao/validar-tenant.mjs <tenant.json> [--json]
 *
 * schema/tenant.schema.json + regras da casa (lib/validacao.cjs): whatsapp no padrão e nunca
 * 5500000000000, horários que parseiam, preço número ou null, sem ocupacaoFicticia, avaliação sem
 * origem rejeitada, limites de caracteres, lista branca do preset, termos proibidos (promessa de
 * ganho, "garantido", antes e depois, preço de procedimento de saúde...). Cada erro cita o campo.
 * Código 0 = válido, 1 = inválido, 2 = arquivo ou ambiente.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const C = require('./lib/comum.cjs');
const { validarTenant } = require('./lib/validacao.cjs');

export function validar(tenant) {
  let preset = null;
  try { preset = C.carregarPreset(tenant && tenant.nicho); }
  catch (e) { return { ok: false, erros: [{ campo: 'nicho', mensagem: e.message.replace(/^nicho: /, '') }] }; }
  return validarTenant(tenant, { preset });
}

function main(argv) {
  const a = C.lerArgs(argv);
  if (!a._[0]) { console.error('Uso: node scripts/producao/validar-tenant.mjs <tenant.json> [--json]'); return 2; }
  let tenant;
  try { tenant = C.lerJson(a._[0]); } catch (e) { console.error(e.message); return 2; }
  const r = validar(tenant);
  if (a.json) console.log(JSON.stringify(r, null, 2));
  else if (r.ok) console.log(`ok: ${a._[0]} é um TenantConfig v1 válido (${tenant.nicho}, ${tenant.meta && tenant.meta.previa ? 'prévia' : 'site entregue'})`);
  else console.error(`inválido: ${a._[0]}\n` + r.erros.map((e) => `  - ${e.campo}: ${e.mensagem}`).join('\n'));
  return r.ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) process.exitCode = main(process.argv.slice(2));
