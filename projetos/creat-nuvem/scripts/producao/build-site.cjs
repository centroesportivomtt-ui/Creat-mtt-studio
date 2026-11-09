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
 * um build anterior (marcador: tenant.json + index.html + motor/v1/). Nunca a raiz do disco, a home,
 * a raiz do projeto, o cwd ou um pai deles (ver checarDestino).
 * Sem rede, sem segredo. Código 0 = ok, 1 = tenant inválido ou destino recusado, 2 = ambiente.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const C = require('./lib/comum.cjs');
const { validarTenant } = require('./lib/validacao.cjs');

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
  const html = M.preencherTemplate(template, tenant, { preset, site, caminhoMotor: 'motor/' });
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
  return { destino, site, avisos, arquivos: C.listarArquivos(destino).map((f) => path.relative(destino, f)) };
}

function main(argv) {
  const a = C.lerArgs(argv);
  let arqTenant = a.tenant;
  if (!arqTenant && a.slug) arqTenant = path.join(C.pastaSaida(a), 'sites', String(a.slug), 'tenant.json');
  if (!arqTenant) { console.error('Uso: node scripts/producao/build-site.cjs --slug <slug> | --tenant <tenant.json> [--saida <pasta>] [--destino <pasta>] [--home <url>] [--url <url>] [--sem-rodape]'); return 2; }
  const tenant = C.lerJson(arqTenant);
  if (a.destino === true || a.destino === '') throw new C.ErroCampo('--destino', 'informe a pasta de saída (ex.: --destino dist/meu-slug)');
  const destino = a.destino || path.join(C.pastaSaida(a), 'dist', String(tenant.slug));
  const r = buildSite({ tenant, destino, saida: C.pastaSaida(a), site: { home: typeof a.home === 'string' ? a.home : C.homePadrao(), url: a.url, rodape: !a['sem-rodape'], demonstracao: !!a.demonstracao } });
  r.avisos.forEach((x) => console.log(`aviso: ${x}`));
  console.log(`ok: ${r.destino} (${r.arquivos.length} arquivos)`);
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = e instanceof C.ErroCampo || e instanceof C.ErroLista ? 1 : 2; }
}

module.exports = { buildSite, urlDoSite, checarDestino, main };
