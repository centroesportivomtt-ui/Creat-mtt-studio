#!/usr/bin/env node
/*
 * scripts/producao/publicar-site.cjs · dist/<slug>/ -> zip pronto para o app Base44 (Trilho)
 *
 * Uso:
 *   node scripts/producao/publicar-site.cjs --slug <slug> [--saida <pasta>] [--destino <pasta>] [--demo] [--json]
 *
 * O que faz (sem rede, sem segredo, sem publicar nada):
 *   1. confere dist/<slug>/ (build do build-site: tenant.json + index.html + motor/v1/, slug igual,
 *      só arquivos da lista branca, nenhum link simbólico);
 *   2. roda testar-site.cjs (Chromium do Playwright, 390 px, console limpo, wa.me certo);
 *      --demo exige também a faixa "demonstração · nome fictício" e o WhatsApp do Suporte Creat;
 *   3. grava <destino>/site-<slug>.zip com sites/<slug>/... (mtime fixo: mesmo build = mesmo sha256)
 *      e confere o zip relendo-o;
 *   4. imprime o sha256 e o passo a passo que o chat principal executa pelos MCPs (Drive + Base44).
 *      Este script NUNCA faz upload, checkpoint ou deploy. Procedimento completo: docs/PUBLICACAO.md.
 *
 * --destino padrão: CREAT_PUBLICAR_DESTINO, ou o scratchpad da sessão (se existir), ou <tmp>/creat-publicar.
 * Código: 0 ok · 1 entrada ou dist inválido · 2 ambiente (Playwright, fflate) · 3 teste do site falhou.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const C = require('./lib/comum.cjs');
const { urlDoSite } = require('./build-site.cjs');
const { testarSite } = require('./testar-site.cjs');

const APP_BASE44 = '6aefffe66b684db9404b1994';
const PASTA_DRIVE = '1C5Msox1Q-zVEDMfneH2yU9GUrNbPW1zN';            // "Creat Nuvem"
const SCRATCHPAD = '/tmp/claude-0/-home-user/481145aa-44c7-587c-be27-bbadde2428c0/scratchpad';
const WHATSAPP_DEMO = '5575981151202';                                // Suporte Creat
const FAIXA_DEMO = /demonstra[çc][ãa]o\s*·\s*nome fict[íi]cio/i;
const MTIME = new Date('2026-01-01T00:00:00Z');
// o que build-site.cjs grava; qualquer outra coisa em dist/<slug>/ não vai ao ar
const LISTA_BRANCA = [/^index\.html$/, /^tenant\.js$/, /^tenant\.json$/, /^robots\.txt$/, /^sitemap\.xml$/, /^motor\/(v1|nichos)\/([A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9._-]+\.(js|css|svg|json|woff2?|png|webp)$/];

function destinoPadrao() {
  if (process.env.CREAT_PUBLICAR_DESTINO) return process.env.CREAT_PUBLICAR_DESTINO;
  try { if (fs.statSync(SCRATCHPAD).isDirectory()) return SCRATCHPAD; } catch (e) { /* fora desta sessão */ }
  return path.join(os.tmpdir(), 'creat-publicar');
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
  if (tenant.slug !== slug) throw new C.ErroCampo('tenant.slug', `dist/${slug}/tenant.json diz "${tenant.slug}"`);
  const arquivos = listar(pasta);
  const fora = arquivos.filter((r) => !LISTA_BRANCA.some((re) => re.test(r)));
  if (fora.length) throw new C.ErroLista(`dist/${slug}/ tem arquivos fora da lista branca (não vão ao ar; refaça o build):`, fora.map((r) => ({ campo: r, mensagem: 'fora da lista branca' })));
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

function passos(slug, z) {
  const titulo = `site-${slug}-${z.sha256.slice(0, 8)}.zip`;
  const url = urlDoSite(slug) || `https://creat-nuvem-404b1994.base44.app/sites/${slug}/`;
  const baixar = `rm -rf /tmp/s /tmp/s.zip && curl -sSL -o /tmp/s.zip "https://drive.google.com/uc?export=download&id=<ID_DO_DRIVE>" && echo "${z.sha256}  /tmp/s.zip" | sha256sum -c - && python3 -m zipfile -e /tmp/s.zip /tmp/s && test -f /tmp/s/sites/${slug}/index.html && mkdir -p public/sites && rm -rf public/sites/${slug} && cp -r /tmp/s/sites/${slug} public/sites/ && ls public/sites/${slug}`;
  return [
    `1. Google Drive create_file: title "${titulo}", contentMimeType "application/zip", disableConversionToGoogleType true, parentId "${PASTA_DRIVE}" (pasta "Creat Nuvem"), base64Content "sha256:${z.sha256}:${z.zip}". Guarde o id devolvido (<ID_DO_DRIVE>).`,
    `2. Google Drive share_file: fileId <ID_DO_DRIVE>, permissionId "anyoneWithLink", role "reader".`,
    `3. Base44 run_command (appId ${APP_BASE44}, cwd raiz do app): ${baixar}`,
    `   Se sha256sum -c falhar, o Drive devolveu outra coisa (link não público ou página de aviso): pare e refaça o passo 2.`,
    `4. Base44 run_command: git log --oneline -1   (tem de mostrar o auto-commit com public/sites/${slug}; se não mostrar, não siga)`,
    `5. Base44 create_checkpoint (appId ${APP_BASE44}), name "site ${slug} ${z.sha256.slice(0, 8)}".`,
    `6. Deploy do app (só com o ok do Marcos) e confira: curl -sI ${url} -> 200; curl -s ${url} | grep -c wa.me -> 1 ou mais.`,
    `7. Depois: Google Drive trash_file <ID_DO_DRIVE> (o zip temporário não precisa ficar público).`
  ];
}

async function main(argv) {
  const a = C.lerArgs(argv);
  const slug = typeof a.slug === 'string' ? a.slug : '';
  if (!slug) { console.error('Uso: node scripts/producao/publicar-site.cjs --slug <slug> [--saida <pasta>] [--destino <pasta>] [--demo] [--json]'); return 2; }
  if (!C.SLUG_RE.test(slug)) throw new C.ErroCampo('--slug', `slug inválido "${slug}" (minúsculas, números e hífen, 2 a 40)`);
  const saida = C.pastaSaida(a);
  const pasta = path.join(saida, 'dist', slug);
  const c = conferir(pasta, slug, { demo: !!a.demo });
  const t = await testarSite(pasta, { whatsapp: c.tenant.negocio.whatsapp });
  if (!t.ok) { console.error(`FALHOU testar-site em dist/${slug}/:\n  - ${t.falhas.join('\n  - ')}`); return 3; }
  const z = zipar(pasta, slug, c.arquivos, typeof a.destino === 'string' ? a.destino : destinoPadrao());
  const r = { slug, url: urlDoSite(slug), zip: z.zip, sha256: z.sha256, bytes: z.bytes, arquivos: z.entradas, teste: { ok: true, menorFontePx: t.medidas.menorFontePx, waMe: t.medidas.waMe.length }, avisos: c.avisos, passos: passos(slug, z) };
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

module.exports = { conferir, zipar, passos, LISTA_BRANCA, main };
