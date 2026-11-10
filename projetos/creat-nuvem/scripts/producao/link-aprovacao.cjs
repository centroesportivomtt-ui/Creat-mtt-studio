#!/usr/bin/env node
/*
 * scripts/producao/link-aprovacao.cjs · link novo de aprovação do rascunho, em qualquer contêiner (pacote 1C)
 *
 * Por que existe: o token do #t= nasce no produzir.mjs e fica só em sites/<slug>/rascunho.json, no
 * contêiner do executor, que morre. O e-mail ao comprador está desligado (SendEmail dá 422 sem domínio
 * verificado) e quem paga o Pix no app do banco nunca volta a /obrigado/. Para esse cliente, o canal é
 * o suporte mandar o link pelo WhatsApp que o próprio comprador deu no pedido (mensagem do pedido pago,
 * não prospecção). Este comando faz o link desse envio sem precisar do contêiner antigo:
 *
 *   node scripts/producao/link-aprovacao.cjs --dir <slug>--r-<id> [--saida <pasta>] [--json]
 *
 *   --dir    o slug_rascunho gravado no PedidoPortaAberta (o rascunho já publicado em /sites/<dir>/)
 *   --saida  se sites/<slug>/rascunho.json existir nessa pasta com o mesmo dir, grava nele o token novo
 *
 * Gera um token novo (16 bytes por crypto, base64url, RE.segredo do 1A) e imprime o link
 * (<CREAT_URL_SITES com o dir>#t=<token>) e o token_hash (sha256). O link só vale depois de
 * gravarRascunho {id, slug: dir, token_hash} no servidor, que troca o hash, zera as tentativas e
 * invalida o link anterior. O rascunho publicado não muda (o token não está nele).
 * O token aparece UMA vez, na saída deste comando, para ir na mensagem ao cliente. Não copie para
 * relatório, log, commit nem chat. Sem rede, sem segredo do repositório.
 * Código: 0 ok · 1 entrada inválida.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const C = require('./lib/comum.cjs');
const R = require('./lib/rascunho.cjs');

function urlDoDir(dir) {
  const modelo = C.modeloUrlSites();
  return modelo ? modelo.split('{slug}').join(dir).replace(/[?#].*$/, '').replace(/\/?$/, '/') : '';
}

/* novoLink({ dir, saida? }) -> { dir, url, link, token, token_hash, gravado } */
function novoLink(o) {
  const dir = String(o.dir || '');
  if (!R.RE_DIR.test(dir)) throw new C.ErroCampo('--dir', `precisa ser o slug_rascunho do pedido, no formato <slug>--r-<id> (veio ${dir.slice(0, 80) || 'nada'})`);
  const url = urlDoDir(dir);
  if (!url) throw new C.ErroCampo('CREAT_URL_SITES', 'está desligada ("0"): sem endereço, não há link para mandar ao cliente');
  const token = R.novoToken();
  const token_hash = crypto.createHash('sha256').update(token).digest('hex');
  const link = `${url}#t=${token}`;
  let gravado = '';
  if (o.saida) {
    const slug = dir.slice(0, dir.lastIndexOf('--r-'));
    const arq = path.join(path.resolve(o.saida), 'sites', slug, 'rascunho.json');
    if (fs.existsSync(arq)) {
      const j = C.lerJson(arq);
      if (j.dir === dir) {
        C.gravarJson(arq, Object.assign(j, { token, token_hash, link, url, atualizado_em: new Date().toISOString() }));
        gravado = arq;
      }
    }
  }
  return { dir, url, link, token, token_hash, gravado };
}

function main(argv) {
  const a = C.lerArgs(argv);
  if (!a.dir || a.dir === true) { console.error('Uso: node scripts/producao/link-aprovacao.cjs --dir <slug>--r-<id> [--saida <pasta>] [--json]'); return 1; }
  let r;
  try { r = novoLink({ dir: a.dir, saida: typeof a.saida === 'string' ? a.saida : '' }); }
  catch (e) { console.error(e.message); return 1; }
  if (a.json) { console.log(JSON.stringify({ dir: r.dir, link: r.link, token_hash: r.token_hash, gravado: r.gravado || null })); return 0; }
  console.log(`Link novo de aprovação (vale só depois do gravarRascunho com o hash abaixo):\n${r.link}\n\ngravarRascunho: { "slug": "${r.dir}", "token_hash": "${r.token_hash}" }`);
  if (r.gravado) console.log(`\nrascunho.json atualizado: ${r.gravado}`);
  console.log('\nO token só existe nesta saída. Mande o link ao cliente e não copie para relatório, log nem chat.');
  return 0;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { novoLink, main };
