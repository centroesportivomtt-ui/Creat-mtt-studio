#!/usr/bin/env node
/*
 * scripts/producao/produzir.mjs · pedido pago -> site no ar, com o mínimo de mão humana · T9 · Forja
 *
 * Uso:
 *   node scripts/producao/produzir.mjs --pedido <arquivo PEDIDO v1 (.txt) ou .json> [opções]
 *
 * Opções:
 *   --saida <pasta>      onde gravar sites/, dist/ (padrão: CREAT_SAIDA ou a pasta do projeto)
 *   --slug <slug>        força o slug (padrão: nome + cidade)
 *   --fixture-ia <arq>   usa a resposta gravada em vez da API (teste, sem rede e sem chave);
 *                        também por CREAT_IA_FIXTURE
 *   --sem-ia             não chama a IA: fica com os textos do preset (contingência; custo zero)
 *   --refazer-textos     chama a IA de novo mesmo se este pedido já tem textos (cobra de novo)
 *   --sem-rodape         tira "Aberto pela Creat" (só com decisão do Marcos; vai para o RELATORIO)
 *   --sem-navegador      pula o teste headless (o RELATORIO marca "não verificado")
 *   --sem-sair           não gera o zip do SAIR
 *   --home <url> --url <url>   home da vitrine (rodapé) e URL do site (canonical, sitemap)
 *
 * Variáveis de ambiente (nenhum valor no repositório; nomes no .env.example da T10):
 *   ANTHROPIC_API_KEY   chave do Claude Console (Commercial Terms). Nunca a assinatura Pro,
 *                       nunca o fluxo agencia.js por pedido.
 *   CREAT_MODELO        modelo (padrão claude-sonnet-5-5, o Sonnet vigente)
 *   CREAT_CAMBIO        R$ por US$ para o custo.json (obrigatória quando a IA roda)
 *   CREAT_HOME          home da vitrine (padrão: origem do link da prévia do pedido)
 *   CREAT_URL_SITES     URL dos sites com {slug}, ex.: https://{slug}.exemplo.com.br/
 *   CREAT_DOMINIOS      domínios da Creat, separados por vírgula (varredura do SAIR)
 *   CREAT_SAIDA         pasta de saída
 *
 * Fluxo (briefing seção 15): 1 valida o pedido e monta sites/<slug>/tenant.json do preset;
 * 2 UMA chamada à API (saída estruturada; o pedido entra como dado delimitado; sem ferramentas);
 * 3 valida de novo (validar-tenant); 4 build-site -> dist/<slug>/; 5 Playwright a 390 px;
 * 6 custo.json + RELATORIO.md do pedido; 7 zip do SAIR com varredura de domínio.
 * Idempotente: rodar de novo o mesmo pedido não chama a IA outra vez (usa sites/<slug>/textos-ia.json).
 * Código: 0 ok · 1 entrada ou tenant inválido · 2 ambiente (chave, dependência) · 3 teste do site falhou.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const C = require('./lib/comum.cjs');
const P = require('./lib/pedido.cjs');
const IA = require('./lib/ia.cjs');
const { tenantDoPedido } = require('./lib/tenant.cjs');
const { validarTenant } = require('./lib/validacao.cjs');
const { buildSite } = require('./build-site.cjs');
const { testarSite } = require('./testar-site.cjs');
const { exportarSair } = require('./exportar-sair.cjs');

class ErroAmbiente extends Error {}

function log(...x) { if (!process.env.CREAT_SILENCIO) console.log(...x); }

/* a chamada de verdade: SDK oficial, chave explícita do Console, sem tools */
async function chamarClaude(corpo) {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) throw new ErroAmbiente('ANTHROPIC_API_KEY ausente: a produção usa a chave do Claude Console (nunca a assinatura Pro). Defina a variável e rode de novo.');
  let Anthropic;
  try { Anthropic = (await import('@anthropic-ai/sdk')).default; }
  catch (e) { throw new ErroAmbiente('@anthropic-ai/sdk não instalado: rode "npm install" em projetos/creat-nuvem (versão fixada).'); }
  const client = new Anthropic({ apiKey: chave, maxRetries: 2, timeout: 120000 });
  try {
    return corpo.betas ? await client.beta.messages.create(corpo) : await client.messages.create(corpo);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ErroAmbiente('chave recusada pela API (401): confira ANTHROPIC_API_KEY no Claude Console.');
    if (e instanceof Anthropic.RateLimitError) throw new ErroAmbiente('limite da API (429): espere um minuto e rode de novo; nada foi cobrado em dobro.');
    if (e instanceof Anthropic.BadRequestError) throw new ErroAmbiente(`a API recusou a requisição (400): ${e.message}`);
    if (e instanceof Anthropic.APIConnectionError) throw new ErroAmbiente('sem conexão com a API: rode de novo quando a rede voltar.');
    throw e;
  }
}

function lerFixture(arq) {
  try { return JSON.parse(fs.readFileSync(arq, 'utf8')); }
  catch (e) { throw new ErroAmbiente(`fixture da IA ilegível (${arq}): ${e.message}`); }
}

function semRede() {
  /* modo teste: qualquer fetch neste processo é erro (prova de "sem rede") */
  globalThis.fetch = () => { throw new Error('rede proibida no modo teste (fixture da IA)'); };
}

function homeDoPedido(pedido) {
  if (process.env.CREAT_HOME) return process.env.CREAT_HOME;
  try { return new URL(pedido.previa).origin + '/'; } catch (e) { return ''; }
}

function relatorioPedido(r) {
  const st = (s) => ({ ok: 'ok', falhou: 'FALHOU', pulado: 'não verificado' }[s] || s);
  const L = [];
  L.push(`# Pedido ${r.pedido.id} · ${r.tenant.negocio.nome}`, '');
  L.push(`Gerado por scripts/producao/produzir.mjs em ${r.em}. Nicho ${r.tenant.nicho}, plano ${r.pedido.plano}, slug \`${r.tenant.slug}\`.`, '');
  L.push('## Etapas', '');
  for (const e of r.etapas) L.push(`- ${e.n}. ${e.nome}: **${st(e.status)}**${e.detalhe ? ` · ${e.detalhe}` : ''}`);
  L.push('', '## Custo', '');
  if (r.custo.custo_ia) L.push(`- ${r.custo.custo_ia.modelo}: ${r.custo.custo_ia.tokens_entrada} tokens de entrada, ${r.custo.custo_ia.tokens_saida} de saída, US$ ${r.custo.custo_ia.usd} = R$ ${r.custo.custo_ia.brl} (câmbio ${r.custo.custo_ia.cambio})${r.custo.origem === 'fixture' ? ' · fixture de teste, nada foi cobrado' : ''}${r.custo.reaproveitado ? ' · textos reaproveitados de uma rodada anterior, sem nova cobrança' : ''}`);
  else L.push(`- sem chamada de IA (${r.custo.motivo})`);
  L.push('', '## Decisões registradas', '');
  L.push('- Preços: o PEDIDO v1 não traz preço; todos os serviços saem "sob consulta" (null). Os preços do preset são só de exemplo da prévia e não vão ao ar.');
  L.push('- Equipe e avaliações: vazias. Só entram com dado real e autorização (avaliação com origem e aprovadoEm).');
  L.push(`- Rodapé "Aberto pela Creat · veja o seu": ${r.site.rodape ? `ligado, link para ${r.site.home || '(sem home: só texto)'}` : 'DESLIGADO com --sem-rodape (decisão do Marcos)'}.`);
  L.push('- Pacote SAIR: rodapé removido, sem home e sem subdomínio da Creat; wa.me puro.');
  if (r.ignorados.length) L.push(`- A IA devolveu campos fora da lista branca, ignorados: ${r.ignorados.join(', ')}.`);
  L.push('', '## Saídas', '');
  for (const [k, v] of Object.entries(r.saidas)) L.push(`- ${k}: \`${v}\``);
  if (r.avisos.length) { L.push('', '## Avisos', ''); r.avisos.forEach((a) => L.push(`- ${a}`)); }
  L.push('', '## Antes de publicar (Marcos aprova)', '');
  L.push('- Abrir `dist/' + r.tenant.slug + '/index.html` e o print de 390 px; conferir nome, endereço, horários e o número do WhatsApp com o dono.');
  L.push('- Pedir ao dono os preços reais (ou manter "sob consulta"), Instagram e fotos; entram como alteração.');
  L.push('- Deploy: comando documentado pela T10 (wrangler), com o token só na variável de ambiente.', '');
  return L.join('\n');
}

export async function produzir(argv) {
  const a = C.lerArgs(argv);
  if (!a.pedido || a.pedido === true) throw new C.ErroCampo('--pedido', 'informe o arquivo do pedido (texto PEDIDO v1 ou JSON)');
  const saida = C.pastaSaida(a);
  const fixture = a['fixture-ia'] || process.env.CREAT_IA_FIXTURE || '';
  const semIa = !!a['sem-ia'];
  if (fixture) semRede();
  const etapas = [], avisos = [];
  const etapa = (n, nome, status, detalhe) => { etapas.push({ n, nome, status, detalhe }); log(`[${n}] ${nome}: ${status}${detalhe ? ` (${detalhe})` : ''}`); };

  // 1. pedido -> tenant parcial
  const pedido = P.validarPedido(P.lerPedidoArquivo(a.pedido));
  const preset = C.carregarPreset(pedido.nicho);
  const agora = new Date();
  let tenant = tenantDoPedido(pedido, preset, { agora, slug: a.slug });
  const pastaSite = path.join(saida, 'sites', tenant.slug);
  const hashPedido = crypto.createHash('sha256').update(JSON.stringify(pedido)).digest('hex');
  const arqProd = path.join(pastaSite, 'producao.json');
  let anterior = null;
  if (fs.existsSync(arqProd)) {
    anterior = C.lerJson(arqProd);
    if (anterior.pedido !== pedido.id) throw new C.ErroCampo('slug', `sites/${tenant.slug}/ já pertence ao pedido ${anterior.pedido}; use --slug para outro endereço`);
  }
  C.gravarJson(path.join(pastaSite, 'pedido.json'), pedido);
  C.gravarJson(path.join(pastaSite, 'tenant.parcial.json'), tenant);
  etapa(1, 'pedido validado e tenant parcial do preset', 'ok', `${pedido.id}, ${pedido.nicho}, slug ${tenant.slug}`);

  // 2. uma chamada à IA (ou fixture, ou reaproveitamento)
  const modelo = process.env.CREAT_MODELO || IA.MODELO_PADRAO;
  const arqTextos = path.join(pastaSite, 'textos-ia.json');
  let saidaIa = null, custo = { pedido: pedido.id, slug: tenant.slug, em: agora.toISOString(), custo_ia: null };
  const reaproveitar = anterior && anterior.hashPedido === hashPedido && fs.existsSync(arqTextos) && !a['refazer-textos'] && !semIa;
  if (semIa) {
    custo.motivo = '--sem-ia: textos do preset';
    etapa(2, 'textos pela IA', 'pulado', '--sem-ia, textos do preset');
  } else if (reaproveitar) {
    saidaIa = C.lerJson(arqTextos);
    const ant = path.join(pastaSite, 'custo.json');
    if (fs.existsSync(ant)) custo = Object.assign(C.lerJson(ant), { reaproveitado: true });
    etapa(2, 'textos pela IA', 'ok', 'reaproveitados da rodada anterior deste pedido (sem nova chamada)');
  } else {
    const cambio = Number(process.env.CREAT_CAMBIO);
    if (!(cambio > 0)) throw new ErroAmbiente('CREAT_CAMBIO ausente ou inválido (R$ por US$, ex.: 5.40): o custo em reais é obrigatório no custo.json. Nada foi cobrado.');
    const ped = IA.montarPedidoIA(pedido, tenant, preset);
    const corpo = IA.corpoRequisicao(ped, modelo, { fallback: process.env.CREAT_FALLBACK !== '0' });
    fs.writeFileSync(path.join(pastaSite, 'requisicao-ia.json'), JSON.stringify(Object.assign({}, corpo, { _nota: 'corpo enviado à API, sem a chave' }), null, 2));
    const resp = fixture ? lerFixture(fixture) : await chamarClaude(corpo);
    saidaIa = IA.lerResposta(resp);
    C.gravarJson(arqTextos, saidaIa);
    const ci = IA.custo(resp, cambio);
    const vc = C.validador(C.REF.custoIa);
    if (!vc(ci)) throw new Error('custo_ia fora do schema Pedido.custo_ia: ' + JSON.stringify(vc.errors));
    custo = { pedido: pedido.id, slug: tenant.slug, em: agora.toISOString(), origem: fixture ? 'fixture' : 'api', modeloPedido: modelo, stop_reason: resp.stop_reason, custo_ia: ci, usage: resp.usage || {} };
    etapa(2, 'textos pela IA', 'ok', `${fixture ? 'fixture (sem rede)' : 'API'}: ${ci.modelo}, ${ci.tokens_entrada}+${ci.tokens_saida} tokens, R$ ${ci.brl}`);
  }
  C.gravarJson(path.join(pastaSite, 'custo.json'), custo);
  let ignorados = [];
  if (saidaIa) ({ tenant, ignorados } = IA.aplicarSaida(tenant, saidaIa, preset));

  // 3. valida de novo
  const v = validarTenant(tenant, { preset });
  if (!v.ok) {
    C.gravarJson(path.join(pastaSite, 'tenant.rejeitado.json'), tenant);
    C.gravarJson(arqProd, { pedido: pedido.id, hashPedido, em: agora.toISOString(), status: 'tenant_rejeitado' });
    throw new C.ErroLista(`Tenant rejeitado pelo validador (sites/${tenant.slug}/tenant.rejeitado.json). Nada foi publicado:`, v.erros);
  }
  C.gravarJson(path.join(pastaSite, 'tenant.json'), tenant);
  etapa(3, 'validar-tenant', 'ok', 'schema + regras da casa');

  // 4. build
  const site = { home: a.home || homeDoPedido(pedido), url: a.url, rodape: !a['sem-rodape'] };
  const pastaDist = path.join(saida, 'dist', tenant.slug);
  const b = buildSite({ tenant, destino: pastaDist, site });
  avisos.push(...b.avisos);
  etapa(4, 'build-site', 'ok', `${b.arquivos.length} arquivos em dist/${tenant.slug}/`);

  // 5. navegador
  let codigo = 0;
  const print = path.join(pastaSite, 'print-390.png');
  if (a['sem-navegador']) etapa(5, 'teste headless 390 px', 'pulado', '--sem-navegador');
  else {
    try {
      const t = await testarSite(pastaDist, { whatsapp: pedido.whatsapp_negocio, print, exigirRodape: site.rodape && !!site.home });
      C.gravarJson(path.join(pastaSite, 'teste-site.json'), t);
      if (t.ok) etapa(5, 'teste headless 390 px', 'ok', `sem rolagem lateral, menor texto ${t.medidas.menorFontePx}px, ${t.medidas.waMe.length} links wa.me/${pedido.whatsapp_negocio}, console limpo`);
      else { etapa(5, 'teste headless 390 px', 'falhou', t.falhas.join(' | ')); codigo = 3; }
    } catch (e) {
      if (e.codigo === 2) { etapa(5, 'teste headless 390 px', 'pulado', e.message); avisos.push(e.message); }
      else throw e;
    }
  }

  // 7. SAIR (antes do relatório, para ele listar o zip)
  let sair = null;
  if (!a['sem-sair']) {
    sair = exportarSair({ tenant, pastaDist: path.join(saida, 'dist'), hostsExtras: [pedido.previa, site.home] });
    let ts = null;
    if (!a['sem-navegador']) {
      try { ts = await testarSite(sair.pasta, { whatsapp: pedido.whatsapp_negocio, semRodapeViral: true, hostsProibidos: sair.varredura.hostsCreat }); }
      catch (e) { if (e.codigo !== 2) throw e; }
      if (ts) { C.gravarJson(path.join(pastaSite, 'teste-sair.json'), ts); if (!ts.ok) sair.varredura.achados.push(...ts.falhas.map((f) => ({ arquivo: 'navegador (file://)', problema: f }))); sair.varredura.ok = sair.varredura.ok && ts.ok; }
    }
    if (sair.varredura.ok) etapa(7, 'pacote SAIR', 'ok', `${sair.varredura.arquivosNoZip} arquivos no zip, nenhum domínio da Creat (hosts citados: ${sair.varredura.hostsEncontrados.join(', ')})${ts ? `; abriu de file:// sem erro, ${ts.rede.externasBloqueadas.length} requisições fora das fontes, sem rodapé da Creat` : ''}`);
    else { etapa(7, 'pacote SAIR', 'falhou', sair.varredura.achados.map((x) => `${x.arquivo}: ${x.problema}`).join(' | ')); codigo = codigo || 1; }
  }

  // 6. custo + relatório
  const saidas = { tenant: `sites/${tenant.slug}/tenant.json`, custo: `sites/${tenant.slug}/custo.json`, site: `dist/${tenant.slug}/index.html` };
  if (fs.existsSync(print)) saidas.print = `sites/${tenant.slug}/print-390.png`;
  if (sair) saidas.sair = `dist/${path.basename(sair.zip)}`;
  etapa(6, 'custo.json e RELATORIO do pedido', 'ok', custo.custo_ia ? `R$ ${custo.custo_ia.brl}` : 'sem IA');
  const rel = { pedido, tenant, em: agora.toISOString(), etapas: etapas.slice().sort((x, y) => x.n - y.n), custo, site: b.site, ignorados, saidas, avisos };
  fs.writeFileSync(path.join(pastaSite, 'RELATORIO.md'), relatorioPedido(rel));
  C.gravarJson(arqProd, { pedido: pedido.id, hashPedido, em: agora.toISOString(), status: codigo ? 'falhou' : 'pronto_para_aprovacao', slug: tenant.slug, etapas: rel.etapas });
  log(`\n${codigo ? 'FALHOU' : 'pronto para aprovação'}: ${path.join(pastaSite, 'RELATORIO.md')}`);
  return { codigo, slug: tenant.slug, pastaSite, pastaDist, sair, custo, etapas: rel.etapas };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  produzir(process.argv.slice(2)).then((r) => { process.exitCode = r.codigo; }, (e) => {
    console.error(e.message);
    process.exitCode = e instanceof C.ErroCampo || e instanceof C.ErroLista ? 1 : e instanceof ErroAmbiente ? 2 : 2;
  });
}
