#!/usr/bin/env node
/* =====================================================================
   Porta Aberta · scripts/checar-placeholders.cjs (T5 · Pixel)
   Trava de deploy (regra dura 4 e aceite 14 do briefing).

   Uso:  node projetos/creat-nuvem/scripts/checar-placeholders.cjs [--raiz <pasta do projeto>]

   FALHA (código 1) enquanto:
   - checkout.config.js tiver qualquer um dos 4 marcadores:
       [LINK_ASAAS_ABERTURA_INAUGURACAO]  [LINK_ASAAS_ABERTURA_PADRAO]
       [LINK_CAKTO_BASTIDORES]            [WHATSAPP_SUPORTE_55DDDNUMERO]
   - qualquer arquivo publicável tiver "[LINK_", "[WHATSAPP_SUPORTE" ou "[PREENCHER"
     (marcador fora do checkout.config.js já é erro por si só);
   - o valor colocado no lugar do marcador não passar na validação do próprio
     checkout.config.js (link https de Mercado Pago, Stripe, Asaas ou Cakto;
     WhatsApp 55 + DDD + número).
   PASSA (código 0) quando o Marcos trocar os 4 marcadores por valores válidos.

   Arquivos publicáveis = tudo na pasta do projeto, menos docs/, scripts/,
   RELATORIO.md e pastas geradas (node_modules, .verificacao, dist, sites, pedidos).
   docs/ e scripts/ citam os nomes dos marcadores de propósito e não vão ao ar.
   Os IDs de medição (PostHog, Pixel, Clarity) em formato de exemplo NÃO travam:
   fora do formato eles só ficam desligados; o script apenas avisa.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
const iRaiz = args.indexOf('--raiz');
const RAIZ = path.resolve(iRaiz !== -1 ? args[iRaiz + 1] : path.join(__dirname, '..'));
const MARCADORES = ['[LINK_ASAAS_ABERTURA_INAUGURACAO]', '[LINK_ASAAS_ABERTURA_PADRAO]', '[LINK_CAKTO_BASTIDORES]', '[WHATSAPP_SUPORTE_55DDDNUMERO]'];
const PADRAO = /\[(LINK_|WHATSAPP_SUPORTE|PREENCHER)[^\]\s]*\]?/g;
const IGNORAR_DIR = new Set(['node_modules', '.verificacao', 'dist', 'sites', 'pedidos', '.git', 'docs', 'scripts']);
const IGNORAR_ARQ = new Set(['RELATORIO.md']);
const TEXTO = /\.(html?|js|cjs|mjs|json|css|md|txt|xml|svg|webmanifest|toml|ya?ml)$|^_headers$|^_redirects$/i;

let falhas = 0;
const falha = (msg) => { falhas++; console.log('FALHA  ' + msg); };

function listar(dir, base, out) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n), r = path.relative(base, p), st = fs.statSync(p);
    if (st.isDirectory()) {
      const pular = (dir === base && IGNORAR_DIR.has(n)) || ['node_modules', '.verificacao', '.git'].includes(n);
      if (!pular) listar(p, base, out);
    }
    else if (!(dir === base && IGNORAR_ARQ.has(n)) && TEXTO.test(n)) out.push(r);
  }
  return out;
}

const ck = path.join(RAIZ, 'checkout.config.js');
if (!fs.existsSync(ck)) { console.log('FALHA  checkout.config.js ausente em ' + RAIZ); process.exit(1); }
const fonteCk = fs.readFileSync(ck, 'utf8');

// 1. os 4 marcadores do checkout.config.js
const abertos = MARCADORES.filter((m) => fonteCk.indexOf(m) !== -1);
abertos.forEach((m) => falha(`checkout.config.js ainda tem ${m}`));

// 2. qualquer marcador em arquivo publicável (fora do checkout.config.js, ou [PREENCHER] em qualquer lugar)
for (const r of listar(RAIZ, RAIZ, [])) {
  const linhas = fs.readFileSync(path.join(RAIZ, r), 'utf8').split('\n');
  linhas.forEach((l, i) => {
    let m; PADRAO.lastIndex = 0;
    while ((m = PADRAO.exec(l))) {
      const ehCk = r === 'checkout.config.js';
      if (ehCk && MARCADORES.indexOf(m[0]) !== -1) continue;              // já contado acima
      if (ehCk && /^\[(LINK_|WHATSAPP_SUPORTE)/.test(m[0]) && /^\s*(\/\/|\*|\/\*)/.test(l)) continue; // citado em comentário
      falha(`${r}:${i + 1} tem ${m[0]}${ehCk ? '' : ' (marcador só pode existir em checkout.config.js)'}`);
    }
  });
}

// 3. os valores no lugar dos marcadores precisam ser válidos
if (!abertos.length) {
  const j = { URL, Promise }; j.window = j;
  try { vm.runInContext(fonteCk, vm.createContext(j)); } catch (e) { falha('checkout.config.js não carrega: ' + e.message); }
  const C = j.CREAT_CHECKOUT;
  if (C) {
    ['aberturaInauguracao', 'aberturaPadrao', 'bastidores'].forEach((k) => { if (!C.linkValido(C.links[k])) falha(`links.${k} não é um link https aceito (Mercado Pago, Stripe, Asaas ou Cakto): ${JSON.stringify(C.links[k])}`); });
    if (!C.whatsappValido(C.whatsappSuporte)) falha(`whatsappSuporte precisa ser 55 + DDD + número, só dígitos: ${JSON.stringify(C.whatsappSuporte)}`);
    const M = j.CREAT_MEDICAO || {};
    if (M.posthogValida && !M.posthogValida(M.posthogChave)) console.log('aviso  PostHog desligado: posthogChave ainda é exemplo (chave pública phc_ do projeto)');
    if (M.pixelValido && !M.pixelValido(M.metaPixel)) console.log('aviso  Pixel da Meta desligado: metaPixel ainda é exemplo');
    if (M.clarityValido && !M.clarityValido(M.clarity)) console.log('aviso  Clarity desligado: clarity ainda é exemplo');
  } else falha('checkout.config.js não define CREAT_CHECKOUT');
}

if (falhas) {
  console.log(`\n${falhas} problema(s). Deploy bloqueado: troque os marcadores em checkout.config.js pelos links reais de pagamento (docs/INTEGRACAO-PAGAMENTO.md) e pelo número do Suporte Creat.`);
  process.exit(1);
}
console.log('ok     nenhum marcador aberto; links e WhatsApp de suporte válidos. Pode publicar.');
process.exit(0);
