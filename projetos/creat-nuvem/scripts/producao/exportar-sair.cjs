#!/usr/bin/env node
/*
 * scripts/producao/exportar-sair.cjs · pacote do SAIR (briefing seção 2 e 15.7) · T9 · Forja
 *
 * Uso: node scripts/producao/exportar-sair.cjs --slug <slug> [--saida <pasta>] [--dominio exemplo.com.br]
 *
 * O cliente que sai leva o site: HTML estático autossuficiente que abre do disco (duplo clique),
 * WhatsApp por wa.me puro e nenhuma requisição a domínio da Creat.
 *   1. reconstrói o site a partir de sites/<slug>/tenant.json numa pasta própria
 *      (dist/<slug>-sair/<slug>/), sem home da vitrine, sem URL de subdomínio da Creat e
 *      SEM o rodapé "Aberto pela Creat" (decisão registrada abaixo);
 *   2. canonical, sitemap e "url" do JSON-LD só se o cliente tiver domínio próprio (--dominio);
 *   3. LEIA-ME.txt em português (como abrir, como publicar em qualquer hospedagem);
 *   4. varredura (o "grep" da seção 15.7) em TODOS os arquivos (e no zip relido): nenhum host da Creat
 *      (CREAT_DOMINIOS, host de CREAT_HOME, de CREAT_URL_SITES e do link da prévia do pedido,
 *      e qualquer host com "creat"), nenhum "utm_source=rodape", e todo host citado precisa
 *      estar na lista de terceiros conhecidos (fontes do Google, schema.org, wa.me, mapa, Instagram);
 *   5. zip em dist/<slug>-sair.zip (fflate, versão fixada), relido e varrido de novo.
 *
 * DECISÃO DO RODAPÉ: no pacote SAIR o rodapé viral é REMOVIDO (site.rodape = false), não vira
 * texto. O cliente que encerrou o contrato não deve carregar propaganda da Creat sem ter pedido;
 * é o mesmo efeito do --sem-rodape do build-site.cjs. A frase "Aberto pela Creat" continua só como
 * texto de interface dentro de motor/v1/motor.js (não é link, não é domínio, não aparece na tela).
 * Fontes: o link do Google Fonts fica (terceiro neutro, não é a Creat); sem internet o site usa as
 * fontes de reserva do sistema e continua funcionando.
 * Código 0 = ok, 1 = varredura achou domínio proibido ou tenant inválido, 2 = ambiente.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./lib/comum.cjs');
const { buildSite } = require('./build-site.cjs');

const TERCEIROS = ['wa.me', 'fonts.googleapis.com', 'fonts.gstatic.com', 'schema.org', 'www.google.com', 'www.w3.org', 'www.sitemaps.org', 'instagram.com', 'www.instagram.com'];
const RE_URL = /https?:\/\/([A-Za-z0-9.-]+)/g;
const EH_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

function hostDe(u) { try { return new URL(String(u).replace('{slug}', 'x')).host.toLowerCase(); } catch (e) { return ''; } }

/* hosts que pertencem à Creat (configurados + derivados) */
function hostsCreat(extra) {
  const hs = new Set((process.env.CREAT_DOMINIOS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  for (const u of [C.HOME_PADRAO, C.homePadrao(), ...(extra || [])]) { const h = hostDe(u); if (h) hs.add(h); }
  for (const u of [C.URL_SITES_PADRAO, C.modeloUrlSites()]) {
    const h = hostDe(u);
    // subdomínio por cliente ({slug}.dominio): proíbe o domínio inteiro; caminho (/sites/{slug}/): o host
    if (h) hs.add(/^\{slug\}\./.test(String(u).replace(/^https?:\/\//, '')) ? h.replace(/^x\./, '') : h);
  }
  return [...hs];
}

/* varredura: [{arquivo, problema}] ; arquivos = [{nome, texto}] */
function varrer(arquivos, opc) {
  const proibidos = (opc.hostsCreat || []).map((h) => h.toLowerCase());
  const permitidos = new Set(TERCEIROS.concat(opc.dominio ? [opc.dominio, 'www.' + opc.dominio] : []));
  const achados = [], hosts = new Set();
  for (const { nome, texto } of arquivos) {
    // o código do motor (congelado) contém o MONTADOR do link do rodapé, que sem home devolve '';
    // o que não pode haver é o link pronto nos dados ou no HTML do site (index, tenant.js/json)
    if (!/(^|\/)motor\//.test(nome) && /utm_source=rodape/.test(texto)) achados.push({ arquivo: nome, problema: 'link do rodapé viral (utm_source=rodape)' });
    if (!/(^|\/)motor\//.test(nome) && /Aberto pela Creat/i.test(texto)) achados.push({ arquivo: nome, problema: 'rodapé "Aberto pela Creat" no pacote SAIR' });
    for (const m of texto.matchAll(RE_URL)) {
      const h = m[1].toLowerCase().replace(/\.$/, '');
      if (!EH_HOST.test(h)) continue;                      // "https://..." de comentário
      hosts.add(h);
      if (/creat/.test(h) || proibidos.some((p) => h === p || h.endsWith('.' + p))) achados.push({ arquivo: nome, problema: `domínio da Creat: ${h}` });
      else if (!permitidos.has(h)) achados.push({ arquivo: nome, problema: `host fora da lista de terceiros conhecidos: ${h}` });
    }
    for (const p of proibidos) if (p && texto.toLowerCase().includes(p)) achados.push({ arquivo: nome, problema: `menção ao host da Creat ${p}` });
  }
  return { achados, hosts: [...hosts].sort() };
}

const LEIA_ME = (nome, dominio) => [
  `Site de ${nome}`,
  '',
  'Como abrir: dê dois cliques em index.html. Funciona sem internet (com internet, as fontes ficam mais bonitas).',
  'O botão de pedido de horário abre o WhatsApp do negócio direto (wa.me), sem passar por nenhum serviço da Creat.',
  '',
  'Como publicar: envie TODOS os arquivos desta pasta, do jeito que estão, para qualquer hospedagem de site estático',
  '(Cloudflare Pages, Netlify, GitHub Pages, a hospedagem do seu domínio). O arquivo principal é index.html.',
  dominio ? `Domínio configurado neste pacote: https://${dominio}/` : 'Este pacote não tem domínio configurado: ao publicar num domínio, o Google encontra o site normalmente.',
  '',
  'Para mudar textos, horários ou serviços: edite tenant.json e tenant.js (o mesmo conteúdo; o site lê tenant.js).',
  'Os dados de quem pede horário ficam só no aparelho de cada cliente; este pacote não guarda nada de ninguém.',
  ''
].join('\n');

/*
 * exportarSair({ tenant, pastaDist, dominio, hostsExtras }) -> { pasta, zip, varredura }
 */
function exportarSair(opc) {
  const tenant = JSON.parse(JSON.stringify(opc.tenant));
  if (tenant.meta.previa) throw new C.ErroCampo('meta.previa', 'prévia não tem pacote SAIR; produza o site antes');
  const dominio = opc.dominio ? String(opc.dominio).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') : '';
  if (dominio && !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(dominio)) throw new C.ErroCampo('--dominio', `domínio inválido: ${opc.dominio}`);
  const hc = hostsCreat(opc.hostsExtras);
  if (dominio && hc.some((h) => dominio === h || dominio.endsWith('.' + h))) throw new C.ErroCampo('--dominio', 'o domínio do SAIR não pode ser da Creat');
  const base = path.join(path.resolve(opc.pastaDist), `${tenant.slug}-sair`);
  const pasta = path.join(base, tenant.slug);
  // url false: nunca herda a URL padrão nem CREAT_URL_SITES (endereço da Creat)
  const r = buildSite({ tenant, destino: pasta, site: { home: '', url: dominio ? `https://${dominio}/` : false, rodape: false } });
  fs.writeFileSync(path.join(pasta, 'LEIA-ME.txt'), LEIA_ME(tenant.negocio.nome, dominio));

  const ler = (d) => C.listarArquivos(d).map((f) => ({ nome: path.relative(d, f), texto: fs.readFileSync(f, 'utf8') }));
  const v1 = varrer(ler(pasta), { hostsCreat: hc, dominio });

  let fflate;
  try { fflate = require('fflate'); } catch (e) { const x = new Error('fflate não instalado: rode "npm install" em projetos/creat-nuvem'); x.codigo = 2; throw x; }
  const entradas = {};
  for (const f of C.listarArquivos(pasta)) entradas[`${tenant.slug}/${path.relative(pasta, f).split(path.sep).join('/')}`] = [fs.readFileSync(f), { mtime: new Date('2026-01-01T00:00:00Z') }];
  const zipBuf = fflate.zipSync(entradas, { level: 9 });
  const zip = path.join(path.resolve(opc.pastaDist), `${tenant.slug}-sair.zip`);
  fs.writeFileSync(zip, zipBuf);
  const lido = fflate.unzipSync(new Uint8Array(fs.readFileSync(zip)));
  const v2 = varrer(Object.entries(lido).map(([nome, b]) => ({ nome: `zip:${nome}`, texto: Buffer.from(b).toString('utf8') })), { hostsCreat: hc, dominio });
  const varredura = { hostsCreat: hc, hostsEncontrados: v1.hosts, achados: v1.achados.concat(v2.achados), arquivosNoZip: Object.keys(lido).length, ok: !v1.achados.length && !v2.achados.length };
  C.gravarJson(path.join(base, 'varredura-sair.json'), varredura);
  return { pasta, zip, varredura, avisos: r.avisos };
}

function main(argv) {
  const a = C.lerArgs(argv);
  if (!a.slug) { console.error('Uso: node scripts/producao/exportar-sair.cjs --slug <slug> [--saida <pasta>] [--dominio exemplo.com.br]'); return 2; }
  const saida = C.pastaSaida(a);
  const tenant = C.lerJson(path.join(saida, 'sites', String(a.slug), 'tenant.json'));
  let extras = [];
  try { extras = [C.lerJson(path.join(saida, 'sites', String(a.slug), 'pedido.json')).previa]; } catch (e) { /* sem pedido.json: só os hosts configurados */ }
  const r = exportarSair({ tenant, pastaDist: path.join(saida, 'dist'), dominio: a.dominio, hostsExtras: extras });
  console.log(JSON.stringify({ zip: r.zip, pasta: r.pasta, varredura: r.varredura }, null, 2));
  return r.varredura.ok ? 0 : 1;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = e.codigo || (e instanceof C.ErroCampo || e instanceof C.ErroLista ? 1 : 2); }
}

module.exports = { exportarSair, varrer, hostsCreat, TERCEIROS };
