#!/usr/bin/env node
/*
 * scripts/producao/executor.cjs · leituras da sessão executora que nunca mostram texto do cliente · Trilho, 11/11/2026
 *
 * A sessão com o conector do Base44 nunca abre sites/, dist/ nem os arquivos do leitor e do redator (EXECUTOR.md,
 * seção 3, regra 3). Quando ela precisa de um dado desses arquivos, roda um destes subcomandos, de dentro de
 * projetos/creat-nuvem, e lê UMA linha com formato fechado. Qualquer erro sai na mesma linha curta, sem mensagem
 * do Node (que citaria o começo do arquivo).
 *
 *   slug <id>              cliente-<id em minúsculas>                    o slug do pedido (passo (e), item 2)
 *   classe <id>            instrucao_no_campo | portao_conteudo | sem_pasta
 *                          (sites/cliente-<id>/revisao.json; passo (d))
 *   redator <id>           <caminho absoluto de sites/cliente-<id>/redator.json> | sem_redator
 *   rascunho <id>          ok <dir> <token_hash> | falhou
 *                          (só de sites/cliente-<id>/producao.json, que não tem o token; nunca abre rascunho.json)
 *   sha256 <arquivo.json>  <sha256 de 64 hex> | sem_sha256              (saída do publicar-site.cjs --json)
 * Código de saída: 0 quando a linha é a resposta boa, 1 nos outros casos.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RE_ID = /^PA-(?:[0-9A-HJKMNP-TV-Z]{8}|[0-9A-Z]{10})$/;
const RE_DIR = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?--r-[a-z0-9]{12,32}$/;   // a mesma do passo (j)
const RE_HASH = /^[0-9a-f]{64}$/;
const RAIZ = process.env.CREAT_SAIDA ? path.resolve(process.env.CREAT_SAIDA) : path.resolve(__dirname, '..', '..');

function slugDoId(id) {
  if (typeof id !== 'string' || !RE_ID.test(id)) return null;
  return 'cliente-' + id.toLowerCase();
}
function lerJson(arq) {
  const st = fs.statSync(arq);
  if (!st.isFile() || st.size > 1024 * 1024) throw new Error('grande');
  return JSON.parse(fs.readFileSync(arq, 'utf8'));
}

const SUB = {
  slug(id) { const s = slugDoId(id); return s ? [s, 0] : ['falhou', 1]; },
  classe(id) {
    const s = slugDoId(id);
    if (!s) return ['sem_pasta', 1];
    try {
      const prod = lerJson(path.join(RAIZ, 'sites', s, 'producao.json'));
      if (prod.pedido !== id) return ['sem_pasta', 1];
      const r = lerJson(path.join(RAIZ, 'sites', s, 'revisao.json'));
      if (r.pedido !== id || !Array.isArray(r.motivos)) return ['sem_pasta', 1];
      return [r.motivos.some((m) => m && /^instrucao_no_campo/.test(String(m.regra || ''))) ? 'instrucao_no_campo' : 'portao_conteudo', 0];
    } catch (e) { return ['sem_pasta', 1]; }
  },
  redator(id) {
    const s = slugDoId(id);
    if (!s) return ['sem_redator', 1];
    const arq = path.join(RAIZ, 'sites', s, 'redator.json');
    try {
      const prod = lerJson(path.join(RAIZ, 'sites', s, 'producao.json'));
      if (prod.pedido !== id || !fs.statSync(arq).isFile()) return ['sem_redator', 1];
      return [arq, 0];
    } catch (e) { return ['sem_redator', 1]; }
  },
  rascunho(id) {
    const s = slugDoId(id);
    if (!s) return ['falhou', 1];
    try {
      const prod = lerJson(path.join(RAIZ, 'sites', s, 'producao.json'));
      const r = prod && prod.rascunho;
      if (prod.pedido !== id || !r || typeof r.dir !== 'string' || typeof r.token_hash !== 'string') return ['falhou', 1];
      if (!RE_DIR.test(r.dir) || r.dir.split('--r-')[0] !== s || !RE_HASH.test(r.token_hash)) return ['falhou', 1];
      return [`ok ${r.dir} ${r.token_hash}`, 0];
    } catch (e) { return ['falhou', 1]; }
  },
  sha256(arq) {
    try {
      const o = lerJson(path.resolve(String(arq || '')));
      return o && typeof o.sha256 === 'string' && RE_HASH.test(o.sha256) ? [o.sha256, 0] : ['sem_sha256', 1];
    } catch (e) { return ['sem_sha256', 1]; }
  }
};

if (require.main === module) {
  const [sub, arg] = process.argv.slice(2);
  let linha = 'falhou', codigo = 1;
  try { if (Object.prototype.hasOwnProperty.call(SUB, sub)) [linha, codigo] = SUB[sub](arg); } catch (e) { /* linha curta */ }
  process.stdout.write(linha + '\n');
  process.exitCode = codigo;
}

module.exports = { SUB, slugDoId };
