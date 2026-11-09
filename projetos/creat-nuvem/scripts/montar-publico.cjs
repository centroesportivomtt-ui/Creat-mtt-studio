#!/usr/bin/env node
/* =====================================================================
   Porta Aberta · scripts/montar-publico.cjs (T10 · Trilho)
   Monta dist/publico/, a única pasta que vai ao ar (Cloudflare Workers
   Static Assets pelo wrangler.toml, ou upload estático no Base44).

   Uso:  node scripts/montar-publico.cjs          (a partir de projetos/creat-nuvem/)

   Por que existe:
   - a pasta do projeto tem docs/, scripts/, schema/, marketing/, node_modules/
     e RELATORIO.md, que não são do público;
   - a sede 3D mora em /sede/ na raiz do repositório e a vitrine a abre em
     /sede/index.html do site publicado (assets/vitrine.js, urlSede);
   - sede/estado.json (estado interno da agência) NUNCA pode ir ao ar
     (pendência da T6). Só vai sede/index.html e, se existir,
     sede/estado-publico.json (vocabulário fechado, gerado por publicar-estado.cjs);
     sem ele, grava um estado de espera válido, para a sede nunca pedir um arquivo que dá 404.

   Lista branca: só entra o que está em ENTRA. Qualquer pasta nova precisa
   ser acrescentada aqui de propósito. Sem dependências; Node 22.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const PROJETO = path.resolve(__dirname, '..');
const RAIZ_REPO = path.resolve(PROJETO, '..', '..');
const DESTINO = path.join(PROJETO, 'dist', 'publico');

// pastas e arquivos da vitrine (relativos a projetos/creat-nuvem/)
const ENTRA = [
  'index.html', '404.html', 'checkout.config.js', '_headers',
  'abrir', 'obrigado', 'bastidores', 'termos', 'privacidade', 'previa',
  'assets', 'ritual', 'motor', 'dados', 'conteudo',
];
// nunca entra, mesmo dentro de uma pasta da lista branca
const NUNCA = [/(^|\/)README\.md$/i, /(^|\/)\.env/, /(^|\/)node_modules(\/|$)/, /(^|\/)\.verificacao(\/|$)/, /\.(cjs|mjs)$/, /(^|\/)\.DS_Store$/];
// sede: só estes dois
const SEDE = ['index.html', 'estado-publico.json'];

function copiar(origem, destino, rel, lista) {
  if (NUNCA.some((r) => r.test(rel))) return;
  const st = fs.statSync(origem);
  if (st.isDirectory()) {
    for (const n of fs.readdirSync(origem)) copiar(path.join(origem, n), path.join(destino, n), rel + '/' + n, lista);
    return;
  }
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(origem, destino);
  lista.push(rel);
}

fs.rmSync(DESTINO, { recursive: true, force: true });
fs.mkdirSync(DESTINO, { recursive: true });
const copiados = [];
for (const item of ENTRA) {
  const o = path.join(PROJETO, item);
  if (!fs.existsSync(o)) { console.log('aviso  ausente: ' + item); continue; }
  copiar(o, path.join(DESTINO, item), item, copiados);
}
for (const n of SEDE) {
  const o = path.join(RAIZ_REPO, 'sede', n);
  if (!fs.existsSync(o)) {
    if (n !== 'estado-publico.json') continue;
    // Sem o estado real, grava um estado de espera válido (sem fluxo, vocabulário fechado), para
    // /sede/estado-publico.json nunca dar 404 no ar. Vence em 10 min na sede, o que dá o mesmo texto.
    const espera = { versao: 1, atualizado_em: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), mensagem: 'A equipe espera o próximo pedido.', fluxos: [] };
    fs.mkdirSync(path.join(DESTINO, 'sede'), { recursive: true });
    fs.writeFileSync(path.join(DESTINO, 'sede', n), JSON.stringify(espera, null, 2) + '\n');
    copiados.push('sede/' + n);
    console.log('aviso  sede/estado-publico.json ausente: gravei o estado de espera em dist/publico/sede/');
    continue;
  }
  copiar(o, path.join(DESTINO, 'sede', n), 'sede/' + n, copiados);
}

// CSP da sede: recalcula os hashes dos scripts inline de sede/index.html e grava no
// _headers de dist/publico/ (o _headers da fonte fica com os valores da última revisão).
const sedeHtml = path.join(DESTINO, 'sede', 'index.html');
const headersPub = path.join(DESTINO, '_headers');
if (fs.existsSync(sedeHtml) && fs.existsSync(headersPub)) {
  const crypto = require('crypto');
  const html = fs.readFileSync(sedeHtml, 'utf8');
  const hashes = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) if (!/\bsrc\s*=/.test(m[1]) && m[2].length) hashes.push(`'sha256-${crypto.createHash('sha256').update(m[2], 'utf8').digest('base64')}'`);
  const linhas = fs.readFileSync(headersPub, 'utf8').split('\n');
  const iSede = linhas.findIndex((l) => l.trim() === '/sede/*');
  const iCsp = iSede === -1 ? -1 : linhas.findIndex((l, i) => i > iSede && /^\s+Content-Security-Policy:/.test(l));
  if (iCsp === -1) { console.log('FALHA  _headers sem CSP para /sede/*'); process.exit(1); }
  const antes = linhas[iCsp];
  linhas[iCsp] = antes.replace(/script-src 'self'( 'sha256-[^']+')*/, `script-src 'self' ${hashes.join(' ')}`);
  if (linhas[iCsp] !== antes) console.log(`aviso  hashes da CSP da sede atualizados em dist/publico/_headers (${hashes.length}); copie para o _headers da fonte`);
  fs.writeFileSync(headersPub, linhas.join('\n'));
}

// trava final: nada interno pode ter entrado
const proibidos = copiados.filter((r) => /(^|\/)(estado\.json|servidor\.cjs|publicar-estado\.cjs|RELATORIO\.md|package(-lock)?\.json|wrangler\.toml)$/.test(r) || /^(docs|scripts|schema|marketing|sites|pedidos)\//.test(r));
if (proibidos.length) { console.log('FALHA  arquivo interno na pasta pública: ' + proibidos.join(', ')); process.exit(1); }

const bytes = copiados.reduce((s, r) => s + fs.statSync(path.join(DESTINO, r)).size, 0);
// caminhos de topo da vitrine: os ÚNICOS que a publicação no Base44 apaga em public/ antes do
// cp -r dist/publico/. public/ (docs/PUBLICACAO.md). public/sites/ (sites de cliente) nunca entra aqui.
const topo = [...new Set(copiados.map((r) => r.split('/')[0]))].sort();
if (topo.includes('sites')) { console.log('FALHA  a vitrine não pode ter sites/ na raiz: apagaria os sites dos clientes'); process.exit(1); }
console.log('vitrine (topo de public/): ' + topo.join(' '));
console.log(`ok     dist/publico/ montado: ${copiados.length} arquivos, ${(bytes / 1024).toFixed(0)} KB`);
