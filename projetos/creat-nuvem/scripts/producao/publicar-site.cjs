#!/usr/bin/env node
/*
 * scripts/producao/publicar-site.cjs · dist/<slug>/ -> zip pronto para o app Base44 (Trilho)
 *
 * Uso:
 *   node scripts/producao/publicar-site.cjs --slug <slug> [--saida <pasta>] [--destino <pasta>] [--demo] [--json]
 *
 * O que faz (sem rede, sem segredo, sem publicar nada):
 *   1. confere dist/<slug>/ (build do build-site: tenant.json + index.html + motor/v1/, slug igual,
 *      só arquivos da lista branca, nenhum link simbólico; galeria/ só com as imagens que
 *      tenant.galeria[].src cita, webp, avif, jpg, png ou svg, e todas as citadas presentes);
 *   2. roda testar-site.cjs (Chromium do Playwright, 390 px, console limpo, wa.me certo);
 *      --demo exige também a faixa "demonstração · nome fictício" e o WhatsApp do Suporte Creat;
 *   3. grava <destino>/site-<slug>.zip com sites/<slug>/... (mtime fixo: mesmo build = mesmo sha256)
 *      e confere o zip relendo-o;
 *   4. imprime o sha256 e o passo a passo que o chat principal executa pelos MCPs (Drive + Base44).
 *      Este script NUNCA faz upload, checkpoint ou deploy. Procedimento completo: docs/PUBLICACAO.md.
 *
 * --destino padrão: CREAT_PUBLICAR_DESTINO, ou uma pasta nova e exclusiva criada por mkdtemp em <tmp>/creat-publicar-XXXXXX
 *   (nunca um caminho fixo e previsível no tmp, que outro usuário poderia pré-criar como link simbólico).
 *   A sessão que publica informa o scratchpad dela pela variável.
 * --demo confere também, na página renderizada, que a faixa é a primeira coisa visível e que a meta robots
 *   é noindex (testar-site exigirFaixaDemo), além de tenant.js com "demonstracao":true.
 * Modos do pacote 1C (rascunho para aprovação, PV-03, e saída do cliente, PV-10):
 *   --rascunho     publica dist/<slug>--r-<id>/ (lido de sites/<slug>/rascunho.json) em /sites/<slug>--r-<id>/.
 *                  Confere que é o build final + faixa (lib/rascunho.cjs conferirRascunho), noindex,
 *                  meta noindex (o robots.txt da pasta não vale para buscador), sem sitemap, e testa a faixa e o botão de 44 px a 390 px.
 *   --aprovado     depois do "Aprovar" do cliente: publica dist/<slug>/ (o MESMO build, sha256 igual ao
 *                  registrado em rascunho.json) em /sites/<slug>/ e o passo a passo APAGA /sites/<slug>--r-<id>/.
 *   --saida-dominio publica dist/<slug>-saida/ (build-site --saida-dominio) em /sites/<slug>/.
 *   O token do rascunho nunca entra no zip, no passo a passo nem na saída deste script.
 * Código: 0 ok · 1 entrada ou dist inválido · 2 ambiente (Playwright, fflate) · 3 teste do site falhou.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const C = require('./lib/comum.cjs');
const R = require('./lib/rascunho.cjs');
const { urlDoSite } = require('./build-site.cjs');
const { testarSite } = require('./testar-site.cjs');

const APP_BASE44 = '6aefffe66b684db9404b1994';
const PASTA_DRIVE = '1C5Msox1Q-zVEDMfneH2yU9GUrNbPW1zN';            // "Creat Nuvem"
const WHATSAPP_DEMO = '5575981151202';                                // Suporte Creat
const FAIXA_DEMO = /demonstra[çc][ãa]o\s*·\s*nome fict[íi]cio/i;
const MTIME = new Date('2026-01-01T00:00:00Z');
// o que build-site.cjs grava; qualquer outra coisa em dist/<slug>/ não vai ao ar
// galeria/ (onda 3): só imagem, e só o que tenant.galeria[].src cita (conferido em conferir())
// igual a GALERIA_RE do build-site e ao RE_FOTO do motor: sem svg, só minúsculas
const GALERIA = /^galeria\/[a-z0-9][a-z0-9-]{0,60}\.(webp|avif|jpe?g|png)$/;
const LISTA_BRANCA = [/^index\.html$/, /^tenant\.js$/, /^tenant\.json$/, /^robots\.txt$/, /^sitemap\.xml$/, /^motor\/(v1|nichos)\/([A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9._-]+\.(js|css|svg|json|woff2?|png|webp)$/, GALERIA];
const LISTA_RASCUNHO = [/^rascunho\.js$/, /^rascunho\.css$/];
const LISTA_SAIDA = [/^index\.html$/, /^robots\.txt$/];

function destinoPadrao() {
  if (process.env.CREAT_PUBLICAR_DESTINO) return process.env.CREAT_PUBLICAR_DESTINO;
  return fs.mkdtempSync(path.join(os.tmpdir(), 'creat-publicar-'));
}

function listar(raiz) {
  const out = [];
  (function andar(d) {
    for (const n of fs.readdirSync(d).sort()) {
      const p = path.join(d, n);
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) throw new C.ErroCampo('dist', `link simbólico não vai ao ar: ${path.relative(raiz, p)}`);
      if (st.isDirectory()) andar(p); else out.push(path.relative(raiz, p).split(path.sep).join('/'));
    }
  })(raiz);
  return out;
}

/* conferir(pasta, slug, opc) -> { tenant, arquivos, avisos }  (lança ErroCampo/ErroLista) */
function conferir(pasta, slug, opc) {
  let st = null;
  try { st = fs.lstatSync(pasta); } catch (e) { /* ausente */ }
  if (!st || !st.isDirectory()) throw new C.ErroCampo('--slug', `não achei ${pasta}: rode antes "npm run produzir -- --pedido ..." ou "npm run build-site -- --slug ${slug}"`);
  for (const f of ['tenant.json', 'index.html', 'tenant.js']) if (!fs.existsSync(path.join(pasta, f))) throw new C.ErroCampo('dist', `${pasta} não é um build do build-site (falta ${f})`);
  if (!fs.existsSync(path.join(pasta, 'motor', 'v1'))) throw new C.ErroCampo('dist', `${pasta} não é um build do build-site (falta motor/v1/)`);
  const tenant = C.lerJson(path.join(pasta, 'tenant.json'));
  if (tenant.slug !== slug) throw new C.ErroCampo('tenant.slug', `dist/${path.basename(pasta)}/tenant.json diz "${tenant.slug}"`);
  const arquivos = listar(pasta);
  const lista = opc.rascunho ? LISTA_BRANCA.concat(LISTA_RASCUNHO) : LISTA_BRANCA;
  const fora = arquivos.filter((r) => !lista.some((re) => re.test(r)) || (opc.rascunho && r === 'sitemap.xml'));
  if (fora.length) throw new C.ErroLista(`dist/${slug}/ tem arquivos fora da lista branca (não vão ao ar; refaça o build):`, fora.map((r) => ({ campo: r, mensagem: 'fora da lista branca' })));
  // galeria: cada arquivo publicado é citado pelo tenant, e cada citado está no build
  const citados = new Set((Array.isArray(tenant.galeria) ? tenant.galeria : []).map((g) => String((g && g.src) || '')));
  const naPasta = arquivos.filter((r) => GALERIA.test(r));
  const galeriaErros = naPasta.filter((r) => !citados.has(r)).map((r) => ({ campo: r, mensagem: 'imagem que o tenant não cita (não vai ao ar; refaça o build)' }))
    .concat([...citados].filter((r) => !naPasta.includes(r)).map((r) => ({ campo: r, mensagem: 'o tenant cita e o build não tem (refaça o build)' })));
  if (galeriaErros.length) throw new C.ErroLista(`dist/${slug}/galeria fora das regras:`, galeriaErros);
  const avisos = [];
  const html = fs.readFileSync(path.join(pasta, 'index.html'), 'utf8');
  const canon = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
  const esperado = urlDoSite(slug);
  if (tenant.meta && tenant.meta.previa) avisos.push('tenant em modo prévia (noindex): ok para demo; para cliente, produza o site entregue');
  else if (!canon) avisos.push(`index.html sem canonical: refaça o build (o padrão é ${esperado || 'desligado por CREAT_URL_SITES=0'})`);
  else if (esperado && canon !== esperado) avisos.push(`canonical ${canon} difere do endereço onde o site vai morar (${esperado}); se o cliente tem domínio próprio, está certo`);
  if (opc.demo) {
    const txt = html + fs.readFileSync(path.join(pasta, 'tenant.js'), 'utf8');
    const erros = [];
    if (!FAIXA_DEMO.test(txt)) erros.push({ campo: 'faixa', mensagem: 'demo sem a faixa "demonstração · nome fictício"' });
    if (!/"demonstracao"\s*:\s*true/.test(fs.readFileSync(path.join(pasta, 'tenant.js'), 'utf8'))) erros.push({ campo: 'CREAT_SITE.demonstracao', mensagem: 'tenant.js sem "demonstracao":true: refaça o build com --demonstracao' });
    if (!/<meta name="robots" content="noindex/.test(html)) erros.push({ campo: 'robots', mensagem: 'demo sem meta robots noindex: refaça o build com --demonstracao' });
    if (String(tenant.negocio && tenant.negocio.whatsapp) !== WHATSAPP_DEMO) erros.push({ campo: 'negocio.whatsapp', mensagem: `demo precisa do WhatsApp do Suporte Creat ${WHATSAPP_DEMO} (está ${tenant.negocio && tenant.negocio.whatsapp})` });
    if (erros.length) throw new C.ErroLista(`demo ${slug} fora das regras:`, erros);
  }
  return { tenant, arquivos, avisos };
}

/* zipar(pasta, slug, destino) -> { zip, sha256, bytes, entradas } */
function zipar(pasta, slug, arquivos, destino) {
  let fflate;
  try { fflate = require('fflate'); } catch (e) { const x = new Error('fflate não instalado: rode "npm ci" em projetos/creat-nuvem'); x.codigo = 2; throw x; }
  const ent = {};
  for (const r of arquivos) ent[`sites/${slug}/${r}`] = [fs.readFileSync(path.join(pasta, r)), { mtime: MTIME }];
  const buf = Buffer.from(fflate.zipSync(ent, { level: 9 }));
  fs.mkdirSync(destino, { recursive: true });
  const zip = path.join(path.resolve(destino), `site-${slug}.zip`);
  fs.writeFileSync(zip, buf);
  const lido = fflate.unzipSync(new Uint8Array(fs.readFileSync(zip)));
  const nomes = Object.keys(lido).sort();
  const esperados = Object.keys(ent).sort();
  if (nomes.join('\n') !== esperados.join('\n')) throw new Error('o zip relido não bate com dist/ (gravação incompleta?)');
  for (const n of nomes) if (!Buffer.from(lido[n]).equals(ent[n][0])) throw new Error(`conteúdo diferente no zip: ${n}`);
  return { zip, sha256: crypto.createHash('sha256').update(buf).digest('hex'), bytes: buf.length, entradas: nomes.length };
}

function passos(slug, z, extra) {
  extra = extra || {};
  const titulo = `site-${slug}-${z.sha256.slice(0, 8)}.zip`;
  const url = urlDoSite(slug) || `https://creat-nuvem-404b1994.base44.app/sites/${slug}/`;
  const apagar = extra.apagarRascunho && R.RE_DIR.test(extra.apagarRascunho) ? ` && rm -rf public/sites/${extra.apagarRascunho}` : '';
  const baixar = `rm -rf /tmp/s /tmp/s.zip && curl -sSL -o /tmp/s.zip "https://drive.google.com/uc?export=download&id=<ID_DO_DRIVE>" && echo "${z.sha256}  /tmp/s.zip" | sha256sum -c - && python3 -m zipfile -e /tmp/s.zip /tmp/s && test -f /tmp/s/sites/${slug}/index.html && mkdir -p public/sites && rm -rf public/sites/${slug} && cp -r /tmp/s/sites/${slug} public/sites/${apagar} && ls public/sites/${slug}`;
  return [
    `1. Google Drive create_file: title "${titulo}", contentMimeType "application/zip", disableConversionToGoogleType true, parentId "${PASTA_DRIVE}" (pasta "Creat Nuvem"), base64Content "sha256:${z.sha256}:${z.zip}". Guarde o id devolvido (<ID_DO_DRIVE>).`,
    `2. Google Drive share_file: fileId <ID_DO_DRIVE>, permissionId "anyoneWithLink", role "reader".`,
    `3. Base44 run_command (appId ${APP_BASE44}, cwd raiz do app): ${baixar}`,
    `   Se sha256sum -c falhar, o Drive devolveu outra coisa (link não público ou página de aviso): pare e refaça o passo 2.`,
    `4. Base44 run_command: git log --oneline -1   (tem de mostrar o auto-commit com public/sites/${slug}; se não mostrar, não siga)`,
    `5. Base44 create_checkpoint (appId ${APP_BASE44}), name "site ${slug} ${z.sha256.slice(0, 8)}".`,
    `6. Deploy do app (portões de docs/PUBLICACAO.md) e confira: curl -sI ${url} -> 200; ${extra.conferir || `curl -s ${url} | grep -c wa.me -> 1 ou mais`}.${apagar ? ` E o rascunho sumiu: curl -sI https://creat-nuvem-404b1994.base44.app/sites/${extra.apagarRascunho}/ -> 404.` : ''}`,
    `7. Depois: Google Drive trash_file <ID_DO_DRIVE> (o zip temporário não precisa ficar público).`
  ];
}

/* rascunho.json do pedido (sites/<slug>/), conferido; nunca devolve o token */
function lerRascunho(saida, slug) {
  const arq = path.join(saida, 'sites', slug, 'rascunho.json');
  if (!fs.existsSync(arq)) throw new C.ErroCampo('--rascunho', `não achei sites/${slug}/rascunho.json: rode antes "npm run produzir -- --pedido ... --textos ... --rascunho"`);
  const j = C.lerJson(arq);
  if (j.slug !== slug || !R.RE_DIR.test(String(j.dir)) || j.dir !== R.dirRascunho(slug, j.id)) throw new C.ErroCampo('rascunho.json', 'slug, id ou pasta fora do formato');
  return { dir: j.dir, id: j.id, endpoint: j.endpoint, ajuste: j.ajuste, final: j.final || {} };
}

/* página de saída (build-site --saida-dominio): só index.html + robots.txt, sem script */
function conferirSaida(pasta, slug) {
  if (!fs.existsSync(path.join(pasta, 'saida.json'))) throw new C.ErroCampo('--saida-dominio', `não achei dist/${slug}-saida/: rode antes "node scripts/producao/build-site.cjs --saida-dominio <dominio> --slug ${slug}"`);
  const info = C.lerJson(path.join(pasta, 'saida.json'));
  if (info.slug !== slug) throw new C.ErroCampo('saida.json', `é do slug ${info.slug}`);
  const arquivos = listar(pasta).filter((r) => r !== 'saida.json');
  const fora = arquivos.filter((r) => !LISTA_SAIDA.some((re) => re.test(r)));
  if (fora.length) throw new C.ErroLista(`dist/${slug}-saida/ tem arquivos fora da lista:`, fora.map((r) => ({ campo: r, mensagem: 'fora da lista branca' })));
  const html = fs.readFileSync(path.join(pasta, 'index.html'), 'utf8');
  const erros = [];
  if (!html.includes(`<meta http-equiv="refresh" content="0; url=${info.url}">`)) erros.push({ campo: 'refresh', mensagem: 'sem meta refresh para o domínio' });
  if (!html.includes(`<link rel="canonical" href="${info.url}">`)) erros.push({ campo: 'canonical', mensagem: 'sem canonical para o domínio' });
  if (!html.includes(`href="${info.url}"`) || /<script/i.test(html)) erros.push({ campo: 'index.html', mensagem: 'sem link visível ou com script' });
  if (erros.length) throw new C.ErroLista(`página de saída ${slug} fora das regras:`, erros);
  return { info, arquivos };
}

async function main(argv) {
  const a = C.lerArgs(argv);
  const slug = typeof a.slug === 'string' ? a.slug : '';
  if (!slug) { console.error('Uso: node scripts/producao/publicar-site.cjs --slug <slug> [--rascunho | --aprovado | --saida-dominio] [--saida <pasta>] [--destino <pasta>] [--demo] [--json]'); return 2; }
  if (!C.SLUG_RE.test(slug)) throw new C.ErroCampo('--slug', `slug inválido "${slug}" (minúsculas, números e hífen, 2 a 40)`);
  if ([a.rascunho, a.aprovado, a['saida-dominio'], a.demo].filter(Boolean).length > 1) throw new C.ErroCampo('--rascunho', 'use um modo só (--rascunho, --aprovado, --saida-dominio ou --demo)');
  const saida = C.pastaSaida(a);
  const destinoZip = () => (typeof a.destino === 'string' ? a.destino : destinoPadrao());

  if (a['saida-dominio']) {
    const pasta = path.join(saida, 'dist', `${slug}-saida`);
    const c = conferirSaida(pasta, slug);
    const z = zipar(pasta, slug, c.arquivos, destinoZip());
    const r = { slug, modo: 'saida', url: urlDoSite(slug), leva_a: c.info.url, zip: z.zip, sha256: z.sha256, bytes: z.bytes, arquivos: z.entradas, passos: passos(slug, z, { conferir: `curl -s ${urlDoSite(slug) || ''} | grep -c 'http-equiv="refresh"' -> 1` }) };
    if (a.json) { console.log(JSON.stringify(r, null, 2)); return 0; }
    console.log(`ok: página de saída de ${slug} leva a ${c.info.url}\nzip: ${z.zip}\nsha256: ${z.sha256}\n\nPasso a passo do chat principal (docs/PUBLICACAO.md):`);
    r.passos.forEach((p) => console.log(p));
    return 0;
  }

  let pasta = path.join(saida, 'dist', slug), nomePublicado = slug, rasc = null, extra = {};
  // site com rascunho só vai para /sites/<slug>/ pelo caminho da aprovação (o mesmo build que o cliente viu)
  if (!a.rascunho && !a.aprovado && !a.demo && fs.existsSync(path.join(saida, 'sites', slug, 'rascunho.json'))) {
    throw new C.ErroCampo('--aprovado', `sites/${slug}/ tem rascunho: publique o rascunho com --rascunho e, depois do "Aprovar" do cliente (status aprovado no pedido), o site com --aprovado`);
  }
  if (a.rascunho || a.aprovado) {
    rasc = lerRascunho(saida, slug);
    const pastaR = path.join(saida, 'dist', rasc.dir);
    const pastaF = path.join(saida, 'dist', slug);
    conferir(pastaF, slug, {});
    conferir(pastaR, slug, { rascunho: true });
    const prob = R.conferirRascunho(pastaR, pastaF, C.listarArquivos, { dir: rasc.dir, endpoint: rasc.endpoint, ajuste: rasc.ajuste });
    const mf = R.manifesto(pastaF, C.listarArquivos);
    for (const k of new Set([...Object.keys(mf), ...Object.keys(rasc.final)])) if (mf[k] !== rasc.final[k]) prob.push(`dist/${slug}/${k}: mudou depois do rascunho (sha256 diferente do registrado em rascunho.json)`);
    if (prob.length) throw new C.ErroLista(`rascunho ${rasc.dir} não é o build final + faixa:`, prob.map((m) => ({ campo: 'rascunho', mensagem: m })));
    if (a.rascunho) { pasta = pastaR; nomePublicado = rasc.dir; extra = { conferir: `curl -s https://creat-nuvem-404b1994.base44.app/sites/${rasc.dir}/ | grep -c 'Rascunho para a sua aprovação' -> 1 e grep -c noindex -> 1` }; }
    else extra = { apagarRascunho: rasc.dir };
  }
  const c = conferir(pasta, slug, { demo: !!a.demo, rascunho: !!a.rascunho });
  const t = await testarSite(pasta, a.rascunho
    ? { whatsapp: c.tenant.negocio.whatsapp, waExtras: [R.WHATSAPP_AJUSTE], exigirFaixaRascunho: true }
    : { whatsapp: c.tenant.negocio.whatsapp, exigirFaixaDemo: !!a.demo });
  if (!t.ok) { console.error(`FALHOU testar-site em dist/${path.basename(pasta)}/:\n  - ${t.falhas.join('\n  - ')}`); return 3; }
  const z = zipar(pasta, nomePublicado, c.arquivos, destinoZip());
  const urlPub = a.rascunho ? `https://creat-nuvem-404b1994.base44.app/sites/${nomePublicado}/` : urlDoSite(slug);
  const r = { slug, modo: a.rascunho ? 'rascunho' : a.aprovado ? 'aprovado' : a.demo ? 'demo' : 'site', publicado_em: nomePublicado, url: urlPub, zip: z.zip, sha256: z.sha256, bytes: z.bytes, arquivos: z.entradas, teste: { ok: true, menorFontePx: t.medidas.menorFontePx, waMe: t.medidas.waMe.length, botaoAprovarPx: t.medidas.faixaRascunho ? t.medidas.faixaRascunho.botaoAltura : null }, avisos: c.avisos, passos: passos(nomePublicado, z, extra) };
  if (a.json) { console.log(JSON.stringify(r, null, 2)); return 0; }
  c.avisos.forEach((x) => console.log(`aviso: ${x}`));
  console.log(`ok: testar-site passou (390 px, menor texto ${t.medidas.menorFontePx}px, ${t.medidas.waMe.length} links wa.me/${c.tenant.negocio.whatsapp})`);
  console.log(`zip: ${z.zip} (${z.entradas} arquivos, ${(z.bytes / 1024).toFixed(0)} KB)`);
  console.log(`sha256: ${z.sha256}`);
  console.log(`no ar em: ${r.url || '(sem URL: CREAT_URL_SITES=0)'}`);
  console.log('\nPasso a passo do chat principal (docs/PUBLICACAO.md):');
  r.passos.forEach((p) => console.log(p));
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => {
    console.error(e.message);
    process.exitCode = e.codigo || (e instanceof C.ErroCampo || e instanceof C.ErroLista ? 1 : 2);
  });
}

module.exports = { conferir, conferirSaida, lerRascunho, zipar, passos, LISTA_BRANCA, LISTA_RASCUNHO, GALERIA, main };
