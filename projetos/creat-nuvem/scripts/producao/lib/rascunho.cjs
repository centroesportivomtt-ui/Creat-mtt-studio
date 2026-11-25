/*
 * scripts/producao/lib/rascunho.cjs · rascunho para a aprovação do cliente (pacote 1C, achado PV-03)
 *
 * O rascunho É o build final. build-site grava dist/<slug>/ (o site que vai ao ar depois) e, com
 * --rascunho, uma cópia dele em dist/<slug>--r-<id>/ com só estas diferenças, todas reversíveis:
 *   index.html   meta robots "noindex, nofollow"; <link rascunho.css> e <script rascunho.js> no fim do
 *                <head>; a faixa logo depois de <body>. htmlFinalDoRascunho() desfaz e tem de dar o
 *                index.html final byte a byte (conferido em build e em teste).
 *   robots.txt   "User-agent: *\nDisallow: /"; sem sitemap.xml (rascunho nunca entra em sitemap).
 *                ATENÇÃO: buscador só lê robots.txt na RAIZ do domínio. Em /sites/<slug>--r-<id>/robots.txt
 *                o arquivo NÃO protege nada; fica só para o caso de alguém copiar a pasta para a raiz de
 *                outro domínio. A proteção real do rascunho é a meta noindex do index.html (e o endereço
 *                imprevisível). Na raiz, o robots.txt publicado pelo montar-publico.cjs precisa ter
 *                "Disallow: /sites/*--r-" (pedido ao dono desse arquivo).
 *   rascunho.js / rascunho.css   cópias de scripts/producao/rascunho/.
 * A aprovação só publica dist/<slug>/ (que já existe e tem o mesmo sha256 registrado em rascunho.json)
 * e apaga /sites/<slug>--r-<id>/. Nada é reconstruído na aprovação.
 *
 * id: 16 caracteres [a-z0-9] por crypto.randomInt (cerca de 82 bits), no formato RE.slugRascunho do 1A.
 * token: 16 bytes por crypto.randomBytes em base64url (22 caracteres, último em [AQgw]), o RE.segredo
 *        do 1A. Vai SÓ no fragmento do link (#t=). Fica em sites/<slug>/rascunho.json (fora do git e
 *        fora do que é publicado) para o executor montar o e-mail; o servidor guarda só o sha256.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ALFABETO = 'abcdefghijklmnopqrstuvwxyz0123456789';
const TAM_ID = 16;
const RE_TOKEN = /^[A-Za-z0-9_-]{21}[AQgw]$/;
const RE_ID = /^[a-z0-9]{12,32}$/;
const RE_DIR = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?--r-[a-z0-9]{12,32}$/;     // = RE.slugRascunho (schema/pedido-regras.mjs)
const ENDPOINT_PADRAO = '/api/pa/aprovarRascunho';
const WHATSAPP_AJUSTE = '5575981151202';                                      // Suporte Creat
const ASSETS = path.join(__dirname, '..', 'rascunho');
const ARQUIVOS = ['rascunho.js', 'rascunho.css'];
const TEXTO_FAIXA = 'Rascunho para a sua aprovação. Ainda não está no ar.';

function novoId() { let s = ''; for (let i = 0; i < TAM_ID; i++) s += ALFABETO[crypto.randomInt(ALFABETO.length)]; return s; }
function novoToken() { return crypto.randomBytes(16).toString('base64url'); }
function dirRascunho(slug, id) { return `${slug}--r-${id}`; }
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

/* endpoint da aprovação: só caminho relativo à mesma origem (connect-src 'self' da CSP) */
function endpoint() {
  const v = String(process.env.CREAT_APROVAR_URL || '').trim();
  if (!v) return ENDPOINT_PADRAO;
  if (!/^\/[A-Za-z0-9_/-]{1,120}$/.test(v)) throw new Error(`CREAT_APROVAR_URL precisa ser um caminho da mesma origem, como ${ENDPOINT_PADRAO} (veio ${v.slice(0, 60)})`);
  return v;
}

function linkAjuste(negocio) {
  return `https://wa.me/${WHATSAPP_AJUSTE}?text=${encodeURIComponent(`Olá. Quero pedir um ajuste no rascunho do site ${negocio}.`)}`;
}

function blocoCabeca(o) {
  return `  <link rel="stylesheet" href="rascunho.css" data-rascunho>\n  <script src="rascunho.js" defer data-rascunho data-slug="${esc(o.dir)}" data-endpoint="${esc(o.endpoint)}"></script>\n`;
}
function blocoFaixa(o) {
  return [
    '  <div class="rascunho-faixa" data-rascunho-faixa role="region" aria-label="Rascunho para aprovação">',
    '    <p class="rascunho-titulo" data-rascunho-titulo><strong>Rascunho para a sua aprovação.</strong> Ainda não está no ar.</p>',
    '    <div class="rascunho-acoes">',
    '      <button type="button" class="rascunho-btn rascunho-btn-principal" data-rascunho-aprovar>Aprovar e colocar no ar</button>',
    '      <span class="rascunho-confirmar" data-rascunho-confirmar hidden>',
    '        <span class="rascunho-pergunta">Tudo certo? Depois de aprovar, o site entra no ar.</span>',
    '        <button type="button" class="rascunho-btn rascunho-btn-principal" data-rascunho-sim>Sim, aprovar</button>',
    '        <button type="button" class="rascunho-btn rascunho-btn-secundario" data-rascunho-nao>Ainda não</button>',
    '      </span>',
    `      <a class="rascunho-btn rascunho-btn-secundario" data-rascunho-ajuste href="${esc(o.ajuste)}" rel="noopener">Pedir ajuste</a>`,
    '    </div>',
    '    <p class="rascunho-status" data-rascunho-status role="status" aria-live="polite"></p>',
    '  </div>',
    ''
  ].join('\n');
}

const ROBOTS_RE = /<meta name="robots" content="[^"]*">/;

/* index.html final -> index.html do rascunho */
function htmlRascunho(htmlFinal, o) {
  const robots = htmlFinal.match(ROBOTS_RE);
  if (!robots) throw new Error('index.html sem <meta name="robots">: o template mudou, o rascunho não sai');
  if ((htmlFinal.match(/<\/head>/g) || []).length !== 1 || (htmlFinal.match(/<body>\n/g) || []).length !== 1) throw new Error('index.html sem </head> ou <body> únicos: o template mudou, o rascunho não sai');
  const marca = `<!--rascunho robots=${Buffer.from(robots[0]).toString('base64')}-->`;
  return htmlFinal
    .replace(ROBOTS_RE, `<meta name="robots" content="noindex, nofollow">${marca}`)
    .replace('</head>', blocoCabeca(o) + '</head>')
    .replace('<body>\n', '<body>\n' + blocoFaixa(o));
}

/* desfaz htmlRascunho (prova de que o rascunho é o build final) */
function htmlFinalDoRascunho(h, o) {
  const m = h.match(/<meta name="robots" content="noindex, nofollow"><!--rascunho robots=([A-Za-z0-9+/=]+)-->/);
  if (!m) return null;
  return h.replace(m[0], Buffer.from(m[1], 'base64').toString('utf8')).replace(blocoCabeca(o) + '</head>', '</head>').replace('<body>\n' + blocoFaixa(o), '<body>\n');
}

/* { caminho relativo: sha256 } de uma pasta */
function manifesto(pasta, listar) {
  const out = {};
  for (const f of listar(pasta)) out[path.relative(pasta, f).split(path.sep).join('/')] = sha256(fs.readFileSync(f));
  return out;
}

/*
 * gravarRascunho({ pastaFinal, destino, slug, negocio, id, listar, copiarPasta }) -> { dir, arquivos, final }
 * pastaFinal já precisa ser um build do build-site. destino é recriado.
 */
function gravarRascunho(o) {
  const dir = path.basename(o.destino);
  if (!RE_DIR.test(dir) || dir !== dirRascunho(o.slug, o.id)) throw new Error(`pasta de rascunho fora do formato <slug>--r-<id>: ${dir}`);
  const opc = { dir, endpoint: endpoint(), ajuste: linkAjuste(o.negocio) };
  fs.rmSync(o.destino, { recursive: true, force: true });
  o.copiarPasta(o.pastaFinal, o.destino);
  const htmlFinal = fs.readFileSync(path.join(o.pastaFinal, 'index.html'), 'utf8');
  const h = htmlRascunho(htmlFinal, opc);
  if (htmlFinalDoRascunho(h, opc) !== htmlFinal) throw new Error('o rascunho não desfaz no index.html final: nada foi gravado como rascunho válido');
  fs.writeFileSync(path.join(o.destino, 'index.html'), h);
  fs.writeFileSync(path.join(o.destino, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  fs.rmSync(path.join(o.destino, 'sitemap.xml'), { force: true });
  for (const a of ARQUIVOS) fs.copyFileSync(path.join(ASSETS, a), path.join(o.destino, a));
  return { dir, opc, final: manifesto(o.pastaFinal, o.listar), rascunho: manifesto(o.destino, o.listar) };
}

/*
 * conferirRascunho(pastaRascunho, pastaFinal, listar) -> [problemas]
 * Igual ao final, menos index.html (que desfaz), robots.txt, sitemap.xml e os 2 arquivos da faixa.
 */
function conferirRascunho(pastaR, pastaF, listar, o) {
  const p = [];
  const mr = manifesto(pastaR, listar), mf = manifesto(pastaF, listar);
  const proprios = new Set(['index.html', 'robots.txt', 'sitemap.xml', ...ARQUIVOS]);
  for (const k of Object.keys(mf)) if (!proprios.has(k) && mr[k] !== mf[k]) p.push(`${k}: diferente do build final`);
  for (const k of Object.keys(mr)) if (!proprios.has(k) && !(k in mf)) p.push(`${k}: só existe no rascunho`);
  for (const a of ARQUIVOS) if (mr[a] !== sha256(fs.readFileSync(path.join(ASSETS, a)))) p.push(`${a}: ausente ou diferente de scripts/producao/rascunho/${a}`);
  if ('sitemap.xml' in mr) p.push('sitemap.xml no rascunho (rascunho nunca entra em sitemap)');
  if (fs.readFileSync(path.join(pastaR, 'robots.txt'), 'utf8') !== 'User-agent: *\nDisallow: /\n') p.push('robots.txt do rascunho não é Disallow total');
  const h = fs.readFileSync(path.join(pastaR, 'index.html'), 'utf8');
  if (!/<meta name="robots" content="noindex, nofollow">/.test(h)) p.push('index.html do rascunho sem meta noindex');
  if (!h.includes(TEXTO_FAIXA.replace('Rascunho para a sua aprovação.', '<strong>Rascunho para a sua aprovação.</strong>'))) p.push('index.html do rascunho sem a faixa');
  if (htmlFinalDoRascunho(h, o) !== fs.readFileSync(path.join(pastaF, 'index.html'), 'utf8')) p.push('index.html do rascunho não desfaz no index.html final');
  return p;
}

module.exports = {
  ALFABETO, TAM_ID, RE_TOKEN, RE_ID, RE_DIR, ENDPOINT_PADRAO, WHATSAPP_AJUSTE, ARQUIVOS, TEXTO_FAIXA,
  novoId, novoToken, dirRascunho, endpoint, linkAjuste, htmlRascunho, htmlFinalDoRascunho, manifesto, gravarRascunho, conferirRascunho
};
