#!/usr/bin/env node
/*
 * scripts/producao/build-site.cjs · tenant.json -> dist/<slug>/ (T9 · Forja)
 *
 * Uso:
 *   node scripts/producao/build-site.cjs --slug <slug> [--saida <pasta>] [--home <url>] [--url <url>] [--sem-rodape] [--demonstracao]
 *   node scripts/producao/build-site.cjs --tenant <arquivo tenant.json> [--destino <pasta>] ...
 *
 * Gera, com o motor congelado (ADR-001) e nenhum dado de cliente fora do tenant:
 *   index.html   motor/v1/template.html preenchido por CreatMotor.preencherTemplate (título, descrição,
 *                robots, JSON-LD LocalBusiness no site entregue, noscript com o wa.me)
 *   tenant.json  o TenantConfig validado; tenant.js = window.TENANT (file:// não faz fetch de JSON)
 *   motor/v1/*   e motor/nichos/*  copiados (scripts clássicos: abre com duplo clique)
 *   robots.txt   prévia (meta.previa): Disallow e meta noindex; entregue: Allow + Sitemap
 *   sitemap.xml  só com URL absoluta do site (--url, ou CREAT_URL_SITES com {slug}; padrão
 *                https://creat-nuvem-404b1994.base44.app/sites/{slug}/; CREAT_URL_SITES=0 desliga)
 * Home da vitrine (rodapé): --home, ou CREAT_HOME, ou https://creat-nuvem-404b1994.base44.app/ (CREAT_HOME=0 desliga).
 * Antes de gravar, valida com validar-tenant (schema + regras da casa). Erro cita o campo.
 * --sem-rodape tira "Aberto pela Creat · veja o seu": decisão só do Marcos, fica no RELATORIO do pedido.
 * --demonstracao (motor v1.1): site-demonstração com nome fictício. Faixa "demonstração · nome fictício"
 *   no topo, meta noindex, sem JSON-LD, robots.txt Disallow e sem sitemap. Opção do site (CREAT_SITE),
 *   nunca campo do tenant: o validador continua proibindo bloco "demo" no tenant (ADR-001).
 * --destino é apagado e recriado. Por isso só aceita pasta inexistente, vazia ou que já seja
 * um build anterior (marcador: tenant.json + index.html + motor/v1/, ou saida.json + index.html da página
 * de saída). Nunca a raiz do disco, a home,
 * a raiz do projeto, o cwd ou um pai deles (ver checarDestino).
 * --rascunho [--rascunho-id <id>] (pacote 1C, PV-03): além de dist/<slug>/, grava dist/<slug>-r-<id>/,
 *   cópia do build final com a faixa "Rascunho para a sua aprovação. Ainda não está no ar.", o botão
 *   "Aprovar e colocar no ar" (POST /api/pa/aprovarRascunho {slug, token}; token só do #t= da URL),
 *   o link "Pedir ajuste" no WhatsApp da Creat, meta noindex (a proteção real; o robots.txt da subpasta não é lido por buscador) e SEM sitemap.
 *   id: 16 caracteres aleatórios por crypto (sem --rascunho-id). Regras em lib/rascunho.cjs.
 * --saida-dominio <dominio> --slug <slug> (PV-10): página de saída do cliente que foi para um domínio
 *   próprio. Grava dist/<slug>-saida/ com index.html (meta refresh, link visível e canonical para
 *   https://<dominio>/) e robots.txt. publicar-site.cjs --saida-dominio a publica em /sites/<slug>/.
 * CSP: motor/v1/template.html traz a CSP dos sites de cliente. O build confere que o hash do <style>
 *   do motor (CSS_VIVO de efeito.js) é o que a CSP aceita; se não for, recusa (código 2).
 * Sem rede, sem segredo. Código 0 = ok, 1 = tenant inválido ou destino recusado, 2 = ambiente.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const crypto = require('crypto');
const C = require('./lib/comum.cjs');
const R = require('./lib/rascunho.cjs');
const { validarTenant } = require('./lib/validacao.cjs');

/*
 * CSP do template x <style> que o motor injeta (efeito.js, CSS_VIVO). Sem 'unsafe-inline', o hash
 * na CSP tem de ser o do texto exato; mudou o motor, o build para aqui em vez de sair um site sem
 * o gesto do nicho. Devolve a CSP lida do template.
 */
function conferirCsp(template) {
  const csp = (template.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/) || [])[1];
  if (!csp) { const x = new Error('motor/v1/template.html sem a meta Content-Security-Policy: site de cliente só sai com a CSP'); x.codigo = 2; throw x; }
  // única exceção aceita: 'unsafe-hashes' em style-src-attr (só atributos style com hash listado)
  const diretivas = csp.split(';').map((d) => d.trim());
  const frouxa = diretivas.some((d) => /'unsafe-inline'|'unsafe-eval'|\*/.test(d) || (/'unsafe-hashes'/.test(d) && !/^style-src-attr 'unsafe-hashes'( 'sha256-[A-Za-z0-9+/=]+')+$/.test(d)) || (/\bdata:/.test(d) && d !== "img-src 'self' data:"));
  if (frouxa || !diretivas.includes("script-src 'self'")) { const x = new Error(`CSP do template frouxa demais: ${csp}`); x.codigo = 2; throw x; }
  const efeito = fs.readFileSync(path.join(C.MOTOR, 'v1', 'efeito.js'), 'utf8');
  const m = efeito.match(/var CSS_VIVO = (\[[\s\S]*?\]\.join\('\\n'\));/);
  if (m) {
    const css = vm.runInNewContext(m[1], {}, { timeout: 1000 });
    const h = `'sha256-${crypto.createHash('sha256').update(css, 'utf8').digest('base64')}'`;
    if (!csp.includes(h)) { const x = new Error(`CSP do template não aceita o <style> do motor (CSS_VIVO de efeito.js mudou): troque o hash de style-src em motor/v1/template.html por ${h}`); x.codigo = 2; throw x; }
  }
  // poeira do gesto da academia: style="--i:<i%5>;--dx:<c[3]>px" em 9 grãos (motor/v1/rituais/barra.js)
  const barra = fs.readFileSync(path.join(C.MOTOR, 'v1', 'rituais', 'barra.js'), 'utf8');
  const usos = (barra.match(/\bstyle:/g) || []).length;
  const grao = barra.match(/(\[\[\d+, \d+, [\d.]+, -?\d+\](?:, *\n?\s*\[\d+, \d+, [\d.]+, -?\d+\])*\])\.forEach\(function \(c, i\) \{[\s\S]{0,260}?style: '--i:' \+ \(i % 5\) \+ ';--dx:' \+ c\[3\] \+ 'px' \}/);
  if (usos !== (grao ? 1 : 0) || (usos && !grao)) { const x = new Error('motor/v1/rituais/barra.js mudou o atributo style da poeira: refaça os hashes de style-src-attr em motor/v1/template.html'); x.codigo = 2; throw x; }
  if (grao) {
    const lista = vm.runInNewContext(grao[1], {}, { timeout: 1000 });
    const falta = lista.map((c, i) => `'sha256-${crypto.createHash('sha256').update(`--i:${i % 5};--dx:${c[3]}px`, 'utf8').digest('base64')}'`).filter((h) => !csp.includes(h));
    if (falta.length) { const x = new Error(`CSP do template não aceita ${falta.length} atributo(s) style da poeira de barra.js: acrescente em style-src-attr ${falta.join(' ')}`); x.codigo = 2; throw x; }
  }
  return csp;
}

function escXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* url === false: sem URL nenhuma, nem a padrão (pacote SAIR) */
function urlDoSite(slug, url) {
  if (url === false) return '';
  const modelo = C.modeloUrlSites();
  const u = url || (modelo ? modelo.split('{slug}').join(slug) : '');
  if (!u) return '';
  let x;
  try { x = new URL(u); } catch (e) { throw new C.ErroCampo('--url', `URL inválida: ${u}`); }
  if (x.protocol !== 'https:') throw new C.ErroCampo('--url', 'o site precisa de https://');
  return x.href.replace(/[?#].*$/, '').replace(/\/?$/, '/');
}

function ehPaiOuIgual(pai, filho) {
  const r = path.relative(pai, filho);
  return r === '' || (!r.startsWith('..') && !path.isAbsolute(r));
}

function ehBuildAnterior(d) {
  try {
    if (fs.statSync(path.join(d, 'saida.json')).isFile() && fs.statSync(path.join(d, 'index.html')).isFile() && !fs.existsSync(path.join(d, 'tenant.json'))) return true;
  } catch (e) { /* não é página de saída */ }
  try {
    return fs.statSync(path.join(d, 'tenant.json')).isFile() && fs.statSync(path.join(d, 'index.html')).isFile() &&
      fs.statSync(path.join(d, 'motor', 'v1')).isDirectory();
  } catch (e) { return false; }
}

/*
 * checarDestino(destino) -> caminho absoluto, ou ErroCampo('--destino').
 * O build faz rm -rf no destino: um erro de digitação não pode apagar o projeto nem sites/.
 */
function checarDestino(destino, saida) {
  if (typeof destino !== 'string' || !destino.trim()) throw new C.ErroCampo('--destino', 'informe a pasta de saída (ex.: --destino dist/meu-slug)');
  const d = path.resolve(destino);
  const saidas = [...new Set([C.RAIZ, C.pastaSaida({}), saida ? path.resolve(saida) : C.RAIZ])];
  const protegidas = [path.parse(d).root, os.homedir(), process.cwd(), ...saidas, ...saidas.map((x) => path.join(x, 'sites'))];
  for (const x of protegidas) {
    if (x && ehPaiOuIgual(d, path.resolve(x))) throw new C.ErroCampo('--destino', `recusado: ${d} é (ou contém) ${path.resolve(x)}; o build apagaria essa pasta`);
  }
  if (saidas.some((x) => ehPaiOuIgual(path.join(x, 'sites'), d))) throw new C.ErroCampo('--destino', `recusado: ${d} fica dentro de sites/ (dados dos clientes)`);
  let st = null;
  try { st = fs.lstatSync(d); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (st) {
    if (!st.isDirectory() || st.isSymbolicLink()) throw new C.ErroCampo('--destino', `recusado: ${d} existe e não é uma pasta comum`);
    if (fs.readdirSync(d).length && !ehBuildAnterior(d)) {
      throw new C.ErroCampo('--destino', `recusado: ${d} tem arquivos e não é um build anterior (falta tenant.json + index.html + motor/v1/). Use uma pasta vazia ou nova`);
    }
  }
  return d;
}

/*
 * buildSite({ tenant, destino, saida?, site:{ home, url, rodape } }) -> { destino, arquivos, avisos }
 * site.home: home da vitrine para o link do rodapé (sem home, o rodapé fica só texto).
 */
function buildSite(opc) {
  const tenant = opc.tenant;
  const preset = C.carregarPreset(tenant && tenant.nicho);
  const r = validarTenant(tenant, { preset });
  if (!r.ok) throw new C.ErroLista(`Tenant inválido (${tenant.slug || 'sem slug'}):`, r.erros);
  const M = C.motor();
  const avisos = [];
  const previa = !!tenant.meta.previa;
  const site = {
    home: opc.site && opc.site.home ? String(opc.site.home) : '',
    url: previa ? '' : urlDoSite(tenant.slug, opc.site && opc.site.url),
    rodape: !(opc.site && opc.site.rodape === false)
  };
  if (!previa && opc.site && opc.site.demonstracao) site.demonstracao = true;
  if (!previa && !site.url) avisos.push('sem URL do site (--url, ou CREAT_URL_SITES diferente de "0"): sem canonical, sem sitemap.xml e sem "url" no JSON-LD');
  if (site.rodape && !site.home) avisos.push('sem home da vitrine (--home, ou CREAT_HOME diferente de "0"): o rodapé "Aberto pela Creat" sai sem link');

  const destino = checarDestino(opc.destino, opc.saida);
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  C.copiarPasta(path.join(C.MOTOR, 'v1'), path.join(destino, 'motor', 'v1'), (a, st) => st.isDirectory() || path.basename(a) !== 'template.html');
  C.copiarPasta(path.join(C.MOTOR, 'nichos'), path.join(destino, 'motor', 'nichos'), (a, st) => st.isDirectory() || /\.(js|css|svg)$/.test(a));

  // o comentário de documentação do template cita os marcadores; sem tirá-lo, eles seriam
  // preenchidos ali dentro também (título e descrição repetidos num comentário do HTML entregue)
  const template = fs.readFileSync(path.join(C.MOTOR, 'v1', 'template.html'), 'utf8').replace(/[ \t]*<!--(?:(?!-->)[\s\S])*?Marcadores:[\s\S]*?-->\n?/, '');
  conferirCsp(template);
  // sem fonte do Google o motor põe href="data:text/css,", que a CSP (style-src sem data:) bloquearia
  // com erro no console; sem fonte não há o que carregar, então a linha sai
  const html = M.preencherTemplate(template, tenant, { preset, site, caminhoMotor: 'motor/' }).replace(/[ \t]*<link rel="stylesheet" href="data:text\/css," data-motor-fontes>\n?/, '');
  const sobra = html.match(/\{\{[A-Z_]+\}\}/g);
  if (sobra) throw new Error(`template com marcador sem valor: ${sobra.join(', ')}`);
  fs.writeFileSync(path.join(destino, 'index.html'), html);
  fs.writeFileSync(path.join(destino, 'tenant.js'), M.scriptTenant(tenant, site));
  C.gravarJson(path.join(destino, 'tenant.json'), tenant);

  if (previa || site.demonstracao) fs.writeFileSync(path.join(destino, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  else {
    fs.writeFileSync(path.join(destino, 'robots.txt'), 'User-agent: *\nAllow: /\n' + (site.url ? `Sitemap: ${site.url}sitemap.xml\n` : ''));
    if (site.url) {
      const dia = String(tenant.meta.criadoEm || new Date().toISOString()).slice(0, 10);
      fs.writeFileSync(path.join(destino, 'sitemap.xml'),
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        `  <url><loc>${escXml(site.url)}</loc><lastmod>${dia}</lastmod></url>\n</urlset>\n`);
    }
  }
  const out = { destino, site, avisos, arquivos: C.listarArquivos(destino).map((f) => path.relative(destino, f)) };

  // rascunho: cópia do build final com a faixa (lib/rascunho.cjs); só para site entregue de cliente
  if (opc.rascunho) {
    if (previa || site.demonstracao) throw new C.ErroCampo('--rascunho', 'rascunho é só para site de cliente (nem prévia, nem demonstração)');
    const id = opc.rascunho.id || R.novoId();
    if (!R.RE_ID.test(id)) throw new C.ErroCampo('--rascunho-id', 'precisa ter de 12 a 32 caracteres [a-z0-9]');
    const dRasc = checarDestino(path.join(path.dirname(destino), R.dirRascunho(tenant.slug, id)), opc.saida);
    const g = R.gravarRascunho({ pastaFinal: destino, destino: dRasc, slug: tenant.slug, id, negocio: tenant.negocio.nome, listar: C.listarArquivos, copiarPasta: C.copiarPasta });
    out.rascunho = { id, dir: g.dir, destino: dRasc, endpoint: g.opc.endpoint, ajuste: g.opc.ajuste, final: g.final, arquivos: g.rascunho };
  }
  return out;
}

/*
 * buildSaida({ slug, dominio, destino }) -> { destino, url }
 * Página que fica em /sites/<slug>/ quando o cliente leva o site para o domínio dele (termos §9):
 * meta refresh imediato, link visível e canonical para https://<dominio>/. Sem script (CSP: nada roda).
 */
/* endereço da Creat (não do cliente): creatnuvem.*, creatmtt.com.br, *.base44.app e CREAT_DOMINIOS.
   Só o domínio da Creat é recusado: "creativebarber.com.br" ou "studiocreation.com.br" são de cliente. */
const DOMINIO_CREAT = /(^|\.)creatnuvem\.[a-z.]+$|(^|\.)creatmtt\.com\.br$|(^|\.)base44\.app$/;
function dominioDaCreat(dom) {
  if (DOMINIO_CREAT.test(dom)) return true;
  return String(process.env.CREAT_DOMINIOS || '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean).some((x) => dom === x || dom.endsWith('.' + x));
}

function buildSaida(o) {
  if (!C.SLUG_RE.test(String(o.slug || ''))) throw new C.ErroCampo('--slug', `slug inválido "${o.slug}"`);
  const dom = String(o.dominio || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(dom)) throw new C.ErroCampo('--saida-dominio', `domínio inválido: ${o.dominio}`);
  if (dominioDaCreat(dom)) throw new C.ErroCampo('--saida-dominio', 'o destino da saída é o domínio do cliente, não um endereço da Creat');
  const url = `https://${dom}/`;
  const destino = checarDestino(o.destino, o.saida);
  fs.rmSync(destino, { recursive: true, force: true });
  fs.mkdirSync(destino, { recursive: true });
  const u = escXml(url);
  const html = [
    '<!doctype html>',
    '<html lang="pt-BR">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'sha256-SAIDA\'; base-uri \'none\'; form-action \'none\'">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <meta http-equiv="refresh" content="0; url=${u}">`,
    `  <link rel="canonical" href="${u}">`,
    '  <title>Este site mudou de endereço</title>',
    '  <style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font:17px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#fbf7f0;color:#1d1a16;padding:24px;box-sizing:border-box;text-align:center}a{color:#1d1a16;font-weight:700;display:inline-block;min-height:44px;padding:10px 4px}@media (prefers-color-scheme:dark){body{background:#1d1a16;color:#fbf7f0}a{color:#fbf7f0}}</style>',
    '</head>',
    '<body>',
    `  <main><p>Este site agora está em <a href="${u}">${escXml(dom)}</a>.</p></main>`,
    '</body>',
    '</html>',
    ''
  ].join('\n');
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const final = html.replace('sha256-SAIDA', `sha256-${crypto.createHash('sha256').update(css, 'utf8').digest('base64')}`);
  fs.writeFileSync(path.join(destino, 'index.html'), final);
  fs.writeFileSync(path.join(destino, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  C.gravarJson(path.join(destino, 'saida.json'), { slug: o.slug, dominio: dom, url });
  return { destino, url };
}

function main(argv) {
  const a = C.lerArgs(argv);
  if (a['saida-dominio'] !== undefined) {
    if (typeof a['saida-dominio'] !== 'string') throw new C.ErroCampo('--saida-dominio', 'informe o domínio do cliente (ex.: --saida-dominio barbeariadoze.com.br)');
    const slug = typeof a.slug === 'string' ? a.slug : '';
    const r = buildSaida({ slug, dominio: a['saida-dominio'], saida: C.pastaSaida(a), destino: typeof a.destino === 'string' ? a.destino : path.join(C.pastaSaida(a), 'dist', `${slug}-saida`) });
    console.log(`ok: página de saída em ${r.destino} (leva a ${r.url})`);
    return 0;
  }
  let arqTenant = a.tenant;
  if (!arqTenant && a.slug) arqTenant = path.join(C.pastaSaida(a), 'sites', String(a.slug), 'tenant.json');
  if (!arqTenant) { console.error('Uso: node scripts/producao/build-site.cjs --slug <slug> | --tenant <tenant.json> [--saida <pasta>] [--destino <pasta>] [--home <url>] [--url <url>] [--sem-rodape]'); return 2; }
  const tenant = C.lerJson(arqTenant);
  if (a.destino === true || a.destino === '') throw new C.ErroCampo('--destino', 'informe a pasta de saída (ex.: --destino dist/meu-slug)');
  const destino = a.destino || path.join(C.pastaSaida(a), 'dist', String(tenant.slug));
  const rascunho = a.rascunho ? { id: typeof a['rascunho-id'] === 'string' ? a['rascunho-id'] : '' } : null;
  const r = buildSite({ tenant, destino, saida: C.pastaSaida(a), rascunho, site: { home: typeof a.home === 'string' ? a.home : C.homePadrao(), url: a.url, rodape: !a['sem-rodape'], demonstracao: !!a.demonstracao } });
  r.avisos.forEach((x) => console.log(`aviso: ${x}`));
  console.log(`ok: ${r.destino} (${r.arquivos.length} arquivos)`);
  if (r.rascunho) console.log(`rascunho: ${r.rascunho.destino} (sem token aqui; o link com #t= é montado por produzir.mjs)`);
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = e instanceof C.ErroCampo || e instanceof C.ErroLista ? 1 : 2; }
}

module.exports = { buildSite, buildSaida, dominioDaCreat, conferirCsp, urlDoSite, checarDestino, main };
