#!/usr/bin/env node
/*
 * scripts/producao/produzir.mjs · pedido pago -> rascunho para aprovação, com o mínimo de mão humana · T9 · Forja · 1C · Trilho
 *
 * Uso (caminho padrão, SEM API paga, decisão D1 de 10/11/2026):
 *   1. node scripts/producao/produzir.mjs --pedido <arquivo>
 *        sem textos ainda: grava sites/<slug>/redator.json (só dados conferidos por regex, sem e-mail,
 *        sem WhatsApp, sem endereço) e para com código 4 (status aguardando_textos).
 *   2. o agente redator da sessão principal lê redator.json e grava um JSON de textos.
 *   3. node scripts/producao/produzir.mjs --pedido <arquivo> --textos <json do agente> --rascunho
 *        aplica os textos pela lista branca, passa pelo portão de conteúdo e pelo validar-tenant, gera
 *        dist/<slug>/ (o build final) e dist/<slug>--r-<id>/ (o rascunho, cópia com a faixa), testa os
 *        dois a 390 px e grava sites/<slug>/rascunho.json com o link de aprovação (#t=<token>).
 *
 * Opções:
 *   --pedido <arq>       PEDIDO v1 (.txt) ou .json. No JSON, "servicos_texto" (opcional) passa pelo parser
 *                        de regra (lib/servicos.cjs); só a saída estruturada chega ao redator.
 *   --textos <arq>       textos escritos pelo agente (formato de redator.json). Caminho padrão.
 *   --rascunho           gera também o rascunho para o cliente aprovar (lib/rascunho.cjs). Rodar de novo
 *                        o mesmo pedido reaproveita o mesmo endereço e o mesmo token; --novo-rascunho troca.
 *   --saida <pasta>      onde gravar sites/, dist/ (padrão: CREAT_SAIDA ou a pasta do projeto)
 *   --slug <slug>        força o slug (padrão: nome + cidade)
 *   --sem-ia             fica com os textos do preset (contingência; custo zero)
 *   --api                caminho antigo por API paga (DESLIGADO por padrão; exige ANTHROPIC_API_KEY e CREAT_CAMBIO)
 *   --fixture-ia <arq>   resposta gravada no formato da API (teste, sem rede e sem chave); também CREAT_IA_FIXTURE
 *   --refazer-textos     no caminho por API, chama de novo mesmo se este pedido já tem textos (cobra de novo)
 *   --sem-rodape         tira "Aberto pela Creat" (só com decisão do Marcos; vai para o RELATORIO)
 *   --sem-navegador      pula o teste headless (o RELATORIO marca "não verificado")
 *   --demonstracao       site-demonstração com nome fictício (motor v1.1)
 *   --sem-sair           não gera o zip do SAIR
 *   --home <url> --url <url>   home da vitrine (rodapé) e URL do site (canonical, sitemap)
 *
 * Portão de conteúdo (lib/bloqueio.cjs): roda sobre negócio, cidade, bairro e servicos_texto ANTES de
 * qualquer coisa e sobre todos os textos do tenant DEPOIS do redator. Disparou: status em_revisao em
 * sites/<slug>/producao.json, motivos em sites/<slug>/revisao.json, código 5, e nada é gerado.
 * O portão dos outros campos (endereço, responsável, horários, e-mail, origem e prévia, B.checarPedido dentro de
 * P.validarPedido) também sai com código 5 desde o fecho dos papéis do executor (10/11/2026, Trilho): antes saía
 * com 1. Nesse caso o pedido ainda não foi validado, então a pasta é sites/revisao-<id em minúsculas>/ (ou a do
 * --slug); quem procura é o executor, pelo campo "pedido" do producao.json (EXECUTOR.md, passo (d)).
 *
 * CREAT_SILENCIO=1 (o executor usa sempre): nenhuma linha de stdout ou stderr traz texto do cliente. Sai só
 *   em_revisao <classe> campos=<nomes>      (código 5; classe instrucao_no_campo ou portao_conteudo)
 *   aguardando_textos                       (código 4)
 *   erro <classe> campo=<nome>              (códigos 1 e 2; classe instrucao_no_campo, entrada_invalida,
 *                                            tenant_rejeitado, ambiente ou interno). instrucao_no_campo só sai
 *                                            aqui, com código 1, num pedido sem id válido (campo=id): sem id não
 *                                            há pasta segura para o revisao.json. Com id válido, é sempre código 5.
 *   ok rascunho_pronto | ok pronto_para_aprovacao   (código 0)
 *   falhou codigo=<n>                       (código 3, teste do site, ou 1, pacote SAIR; nada a publicar)
 * Nome de campo que não é da lista conhecida sai como "outro" (no PEDIDO v1 em texto a chave é do cliente).
 *
 * Variáveis de ambiente (nenhum valor no repositório):
 *   ANTHROPIC_API_KEY   só no caminho --api (chave do Claude Console). O caminho padrão não usa.
 *   CREAT_MODELO        modelo do caminho --api (padrão claude-sonnet-5-5)
 *   CREAT_CAMBIO        R$ por US$ para o custo.json (obrigatória só no caminho --api/fixture)
 *   CREAT_HOME          home da vitrine (padrão https://creat-nuvem-404b1994.base44.app/; "0" = rodapé sem link)
 *   CREAT_URL_SITES     URL dos sites com {slug} (padrão https://creat-nuvem-404b1994.base44.app/sites/{slug}/;
 *                       "0" = sem canonical nem sitemap); o rascunho usa o mesmo modelo com <slug>--r-<id>
 *   CREAT_APROVAR_URL   caminho da função de aprovação na mesma origem (padrão /api/pa/aprovarRascunho)
 *   CREAT_DOMINIOS      domínios da Creat, separados por vírgula (varredura do SAIR)
 *   CREAT_SAIDA         pasta de saída
 *
 * Idempotente: rodar de novo o mesmo pedido reaproveita sites/<slug>/textos-ia.json (nenhuma chamada nova)
 * e o mesmo rascunho. No caminho --api o custo nunca se perde (resposta-ia.json e custo.json antes de
 * interpretar; ia_falhou exige --refazer-textos ou --sem-ia).
 * Código: 0 ok · 1 entrada ou tenant inválido · 2 ambiente · 3 teste do site falhou ·
 *         4 aguardando os textos do redator · 5 em revisão (portão de conteúdo).
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
const B = require('./lib/bloqueio.cjs');
const S = require('./lib/servicos.cjs');
const TX = require('./lib/textos.cjs');
const R = require('./lib/rascunho.cjs');
const { textosDoTenant } = require('./lib/validacao.cjs');

class ErroAmbiente extends Error {}

const SILENCIO = () => !!process.env.CREAT_SILENCIO;
function log(...x) { if (!SILENCIO()) console.log(...x); }

/* ---------- silêncio: só classe e nome de campo (fecho dos papéis do executor, 10/11/2026) ---------- */
const CAMPOS_CONHECIDOS = new Set([...P.ORDEM, 'formato', 'servicos_texto', 'slug', 'funcionamento', 'campos_juntos',
  'endereco.rua', 'endereco.numero', 'endereco.bairro', 'previa.n', 'previa.c', 'previa.host',
  'pagamento', 'mp_pagamento', 'produto', 'valor', '--pedido', '--textos', '--api', '--fixture-ia', '--sem-ia']);
const RE_CAMPO_FORMA = /^(linha \d{1,4}|servicos_texto linha \d{1,3}|servicos\[\d{1,2}\](\.[a-zA-Z]{1,20})?|horarios\.(seg|ter|qua|qui|sex|sab|dom)|endereco \((rua|numero|bairro|cidade|uf|cep)\)|--textos\.(bordao|pagina|servicos|textos)|(negocio|pagina|textos|profissionais\[\d{1,2}\]|avaliacoes\[\d{1,2}\]|galeria\[\d{1,2}\]|recados\[\d{1,2}\])(\.[a-zA-Z]{1,30}){0,2}|bordao|nicho|cidade)$/;
function campoSeguro(c) { const s = String(c == null ? '' : c); return CAMPOS_CONHECIDOS.has(s) || RE_CAMPO_FORMA.test(s) ? s : 'outro'; }
function classeRevisao(motivos) { return motivos.some((m) => /^instrucao_no_campo/.test(m.regra || '')) ? 'instrucao_no_campo' : 'portao_conteudo'; }
function linhaSilenciosa(r) {
  if (r.codigo === 5) return `em_revisao ${classeRevisao(r.motivos || [])} campos=${[...new Set((r.motivos || []).map((m) => campoSeguro(m.campo)))].join(',')}`;
  if (r.codigo === 4) return 'aguardando_textos';
  if (r.codigo !== 0 || r.status === 'falhou') return `falhou codigo=${Number.isInteger(r.codigo) ? r.codigo : 1}`;
  return `ok ${r.status === 'rascunho_pronto' ? 'rascunho_pronto' : 'pronto_para_aprovacao'}`;
}
function erroSilencioso(e) {
  const m = String((e && e.message) || '');
  if (/instrucao_no_campo/.test(m)) return `erro instrucao_no_campo campo=${campoSeguro(e.campo)}`;
  if (e instanceof C.ErroCampo) return `erro entrada_invalida campo=${campoSeguro(e.campo)}`;
  if (e instanceof C.ErroLista) {
    const campos = [...new Set((e.erros || []).map((x) => campoSeguro(x.campo)))].join(',');
    return `erro ${/^Tenant rejeitado/.test(m) ? 'tenant_rejeitado' : 'entrada_invalida'} campo=${campos || 'outro'}`;
  }
  if (e instanceof ErroAmbiente) return 'erro ambiente campo=outro';
  return 'erro interno campo=outro';
}

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

/* home da vitrine: CREAT_HOME ou a da Creat. Não usa mais a origem do link da prévia do pedido:
   esse campo vem do formulário e não pode decidir para onde aponta o rodapé do site entregue */
function homeDoPedido() { return C.homePadrao(); }

function relatorioPedido(r) {
  const st = (s) => ({ ok: 'ok', falhou: 'FALHOU', pulado: 'não verificado' }[s] || s);
  const L = [];
  L.push(`# Pedido ${r.pedido.id} · ${r.tenant.negocio.nome}`, '');
  L.push(`Gerado por scripts/producao/produzir.mjs em ${r.em}. Nicho ${r.tenant.nicho}, plano ${r.pedido.plano}, slug \`${r.tenant.slug}\`.`, '');
  L.push('## Etapas', '');
  for (const e of r.etapas) L.push(`- ${e.n}. ${e.nome}: **${st(e.status)}**${e.detalhe ? ` · ${e.detalhe}` : ''}`);
  L.push('', '## Custo', '');
  const ult = (r.custo.chamadas || []).slice(-1)[0];
  if (r.textosOrigem === 'agente') L.push(`- textos escritos por agente da sessão (arquivo --textos, sha256 ${r.textosSha256.slice(0, 12)}): sem API paga, custo de IA R$ 0`);
  else if (r.custo.custo_ia) L.push(`- ${r.custo.custo_ia.modelo}: ${r.custo.custo_ia.tokens_entrada} tokens de entrada, ${r.custo.custo_ia.tokens_saida} de saída, US$ ${r.custo.custo_ia.usd} = R$ ${r.custo.custo_ia.brl} (câmbio ${r.custo.custo_ia.cambio})${r.custo.origem === 'fixture' ? ' · fixture de teste, nada foi cobrado' : ''}${r.custo.reaproveitado ? ' · textos reaproveitados de uma rodada anterior, sem nova cobrança' : ''}`);
  else if (ult) L.push(`- chamada feita (${ult.modeloCobrado || 'modelo não informado'}, ${ult.tokens ? `${ult.tokens.entrada}+${ult.tokens.saida} tokens` : 'tokens não informados'}), mas o custo **não foi calculado**: ${ult.falha_custo || 'sem detalhe'}`);
  else L.push(`- sem chamada de IA (${r.custo.motivo || 'sem detalhe'})`);
  if (r.custo.total && r.custo.total.chamadas > 1) L.push(`- total deste pedido: ${r.custo.total.chamadas} chamadas pagas, R$ ${r.custo.total.brl}${r.custo.total.sem_preco ? ` (+${r.custo.total.sem_preco} sem preço cadastrado)` : ''}`);
  L.push('', '## Decisões registradas', '');
  L.push('- Preços: o PEDIDO v1 não traz preço; todos os serviços saem "sob consulta" (null). Os preços do preset são só de exemplo da prévia e não vão ao ar.');
  L.push('- Equipe e avaliações: vazias. Só entram com dado real e autorização (avaliação com origem e aprovadoEm).');
  L.push(`- Rodapé "Aberto pela Creat · veja o seu": ${r.site.rodape ? `ligado, link para ${r.site.home || '(sem home: só texto)'}` : 'DESLIGADO com --sem-rodape (decisão do Marcos)'}.`);
  L.push('- Pacote SAIR: rodapé removido, sem home e sem subdomínio da Creat; wa.me puro.');
  if (r.site.demonstracao) L.push('- Site-demonstração (--demonstracao): faixa "demonstração · nome fictício" no topo, noindex, sem JSON-LD. Nome do negócio fictício; o WhatsApp é o do Suporte Creat.');
  if (r.ignorados.length) L.push(`- A IA devolveu campos fora da lista branca, ignorados: ${r.ignorados.join(', ')}.`);
  L.push('', '## Saídas', '');
  for (const [k, v] of Object.entries(r.saidas)) L.push(`- ${k}: \`${v}\``);
  if (r.avisos.length) { L.push('', '## Avisos', ''); r.avisos.forEach((a) => L.push(`- ${a}`)); }
  if (r.rascunho) {
    L.push('', '## Rascunho para o cliente aprovar', '');
    L.push(`- Pasta: \`dist/${r.rascunho.dir}/\` (faixa, meta noindex, sem sitemap; o robots.txt da pasta não vale para buscador, só o da raiz). Endereço: ${r.rascunho.url || '(sem URL: CREAT_URL_SITES=0)'}`);
    L.push('- O link com o token (#t=) está em `sites/' + r.tenant.slug + '/rascunho.json` (campo link). Não copie o token para relatório, log nem chat.');
    L.push(`- Publicar o rascunho: \`node scripts/producao/publicar-site.cjs --slug ${r.tenant.slug} --rascunho\`. Depois da aprovação: \`--aprovado\` (publica dist/${r.tenant.slug}/ e apaga o rascunho).`);
  }
  L.push('', '## Antes de publicar', '');
  L.push('- Abrir `dist/' + r.tenant.slug + '/index.html` e o print de 390 px; conferir nome, endereço, horários e o número do WhatsApp.');
  L.push('- Quem aprova é o cliente, pelo botão do rascunho. Preços reais, Instagram e fotos entram como alteração.');
  L.push('- Publicação: scripts/producao/publicar-site.cjs (passo a passo em docs/PUBLICACAO.md).', '');
  return L.join('\n');
}

/* JSON do pedido pode trazer servicos_texto (texto livre do cliente): sai do objeto antes do schema */
function separarServicosTexto(o) {
  if (!o || typeof o !== 'object' || !('servicos_texto' in o)) return { pedido: o, servicosTexto: null };
  const c = Object.assign({}, o);
  const t = c.servicos_texto;
  delete c.servicos_texto;
  return { pedido: c, servicosTexto: t === '' || t === null ? null : t };
}

/* portão de conteúdo disparou: grava o motivo e para. Nada de tenant, rascunho ou dist. */
function emRevisao(pastaSite, base, fase, motivos, log) {
  C.gravarJson(path.join(pastaSite, 'revisao.json'), { pedido: base.pedido, em: base.em, fase, motivos });
  C.gravarJson(path.join(pastaSite, 'producao.json'), Object.assign({}, base, { status: 'em_revisao', fase, motivos: motivos.map((m) => `${m.campo}: ${m.regra || m.motivo}`) }));
  log(`\nEM REVISÃO (portão de conteúdo, ${fase}): ${motivos.length} motivo(s) em ${path.join(pastaSite, 'revisao.json')}. Nada foi gerado.`);
  motivos.forEach((m) => log(`  - ${m.campo}: ${m.regra || m.motivo}${m.trecho ? ` ("${m.trecho}")` : ''}`));
  return { codigo: 5, status: 'em_revisao', slug: base.slug, pastaSite, motivos };
}

/*
 * portão de instrução nos campos que o portão da entrada não recebe (endereço, responsável, horários, e-mail,
 * origem, prévia): mesmo destino do emRevisao, código 5. O pedido ainda não foi validado, então a pasta sai do
 * id (formato fechado do schema) ou do --slug; nada do texto do cliente vira nome de pasta.
 */
const RE_ID_PEDIDO = /^PA-(?:[0-9A-HJKMNP-TV-Z]{8}|[0-9A-Z]{10})$/;
function revisaoDaValidacao(o, a, saida, agora, logf) {
  const motivos = B.checarPedido(o);
  if (!motivos.length) return null;
  const id = o && typeof o.id === 'string' ? o.id : '';
  if (!RE_ID_PEDIDO.test(id)) throw new C.ErroCampo('id', 'instrucao_no_campo num pedido sem id válido: nada gravado');
  // o resto do que o portão da entrada veria, para a revisão humana ver tudo de uma vez
  const outros = B.checar([['negocio', o.negocio], ['cidade', o.cidade]].filter(([, v]) => typeof v === 'string')).motivos;
  const pedidoSlug = typeof a.slug === 'string' && C.SLUG_RE.test(a.slug) ? require('./lib/tenant.cjs').slugSeguro(a.slug) : `revisao-${id.toLowerCase()}`;
  const pastaSite = path.join(saida, 'sites', pedidoSlug);
  const arqProd = path.join(pastaSite, 'producao.json');
  if (fs.existsSync(arqProd) && C.lerJson(arqProd).pedido !== id) throw new C.ErroCampo('slug', `sites/${pedidoSlug}/ já pertence a outro pedido; use --slug para outro endereço`);
  const base = { pedido: id, hashPedido: crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex'), em: agora.toISOString(), slug: pedidoSlug };
  return emRevisao(pastaSite, base, 'validacao', motivos.concat(outros), logf);
}

/* palavras dos textos de partida do preset (não do nome de exemplo): podem vir com maiúscula sem ser outro negócio */
function vocabularioDoPreset(preset) {
  const base = preset && preset.tenantBase;
  if (!base) return [];
  return textosDoTenant(base).filter(([c]) => !/^negocio\.|^pagina\.titulo$/.test(c)).map(([, v]) => v);
}

function urlRascunho(dir) {
  const modelo = C.modeloUrlSites();
  return modelo ? modelo.split('{slug}').join(dir).replace(/[?#].*$/, '').replace(/\/?$/, '/') : '';
}

export async function produzir(argv) {
  const a = C.lerArgs(argv);
  if (!a.pedido || a.pedido === true) throw new C.ErroCampo('--pedido', 'informe o arquivo do pedido (texto PEDIDO v1 ou JSON)');
  if (a.textos === true || a.textos === '') throw new C.ErroCampo('--textos', 'informe o arquivo JSON com os textos do redator');
  const saida = C.pastaSaida(a);
  const fixture = a['fixture-ia'] || process.env.CREAT_IA_FIXTURE || '';
  const semIa = !!a['sem-ia'];
  const arqTextosAgente = typeof a.textos === 'string' ? a.textos : '';
  const fontes = [arqTextosAgente && '--textos', a.api && '--api', fixture && '--fixture-ia', semIa && '--sem-ia'].filter(Boolean);
  if (fontes.length > 1) throw new C.ErroCampo(fontes[1], `escolha uma fonte de textos só (veio ${fontes.join(' e ')})`);
  // sem API: qualquer fetch deste processo é erro (prova de que o caminho padrão não usa rede nem API paga)
  if (!a.api) semRede();
  const etapas = [], avisos = [];
  const etapa = (n, nome, status, detalhe) => { etapas.push({ n, nome, status, detalhe }); log(`[${n}] ${nome}: ${status}${detalhe ? ` (${detalhe})` : ''}`); };

  // 1. pedido -> portão de conteúdo da entrada -> tenant parcial
  const sep = separarServicosTexto(P.lerPedidoArquivo(a.pedido));
  const agora = new Date();
  // instrução em QUALQUER campo (endereço, responsável, horários, e-mail, origem, prévia): código 5, não 1
  const rv = revisaoDaValidacao(sep.pedido, a, saida, agora, log);
  if (rv) return rv;
  const pedido = P.validarPedido(sep.pedido);
  const preset = C.carregarPreset(pedido.nicho);
  const servicosParse = sep.servicosTexto !== null ? S.analisar(sep.servicosTexto) : null;
  let tenant = tenantDoPedido(pedido, preset, { agora, slug: a.slug, demonstracao: !!a.demonstracao, servicos: servicosParse && !servicosParse.recusadas.length ? servicosParse.servicos : null });
  if (!a.demonstracao && /^cliente-/.test(tenant.slug) && require('./lib/tenant.cjs').RE_SLUG_RESERVADO.test(tenant.slug.slice(8))) {
    avisos.push(`Slug com prefixo reservado (demo-, teste- ou ensaio-) virou ${tenant.slug}: pasta de cliente nunca fica com nome de demonstração (sites/demo-*/ é versionado).`);
    log(`aviso: slug reservado, usando ${tenant.slug}`);
  }
  const pastaSite = path.join(saida, 'sites', tenant.slug);
  const hashPedido = crypto.createHash('sha256').update(JSON.stringify(pedido) + (sep.servicosTexto !== null ? '\n' + JSON.stringify(sep.servicosTexto) : '')).digest('hex');
  const arqProd = path.join(pastaSite, 'producao.json');
  let anterior = null;
  if (fs.existsSync(arqProd)) {
    anterior = C.lerJson(arqProd);
    if (anterior.pedido !== pedido.id) throw new C.ErroCampo('slug', `sites/${tenant.slug}/ já pertence ao pedido ${anterior.pedido}; use --slug para outro endereço`);
  }
  const baseProd = { pedido: pedido.id, hashPedido, em: agora.toISOString(), slug: tenant.slug };
  const entrada = [['negocio', pedido.negocio], ['cidade', pedido.cidade], ['endereco.bairro', (tenant.negocio.endereco || {}).bairro || '']];
  if (sep.servicosTexto !== null) entrada.push(['servicos_texto', String(sep.servicosTexto)]);
  const g1 = B.checar(entrada);
  if (servicosParse) servicosParse.recusadas.forEach((x) => g1.motivos.push({ campo: `servicos_texto linha ${x.linha}`, categoria: 'formato', regra: x.motivo, trecho: x.texto.slice(0, 40) }));
  if (g1.motivos.length) return emRevisao(pastaSite, baseProd, 'entrada', g1.motivos, log);
  C.gravarJson(path.join(pastaSite, 'pedido.json'), pedido);
  C.gravarJson(path.join(pastaSite, 'tenant.parcial.json'), tenant);
  etapa(1, 'pedido validado, portão de conteúdo da entrada e tenant parcial do preset', 'ok', `${pedido.id}, ${pedido.nicho}, slug ${tenant.slug}${servicosParse ? `, ${servicosParse.servicos.length} serviços do cliente` : ''}`);

  // 2. textos: agente (padrão) | reaproveitamento | preset | API/fixture (desligado por padrão)
  const modelo = process.env.CREAT_MODELO || IA.MODELO_PADRAO;
  const arqTextos = path.join(pastaSite, 'textos-ia.json');
  const arqCusto = path.join(pastaSite, 'custo.json');
  const arqResp = path.join(pastaSite, 'resposta-ia.json');
  /* histórico de chamadas pagas deste pedido: nunca se perde, mesmo se a rodada falhar depois */
  const custoAnterior = fs.existsSync(arqCusto) ? C.lerJson(arqCusto) : null;
  const chamadas = custoAnterior && custoAnterior.pedido === pedido.id && Array.isArray(custoAnterior.chamadas) ? custoAnterior.chamadas : [];
  const totais = (cs) => ({
    chamadas: cs.length,
    usd: Math.round(cs.reduce((x, c) => x + (c.custo_ia ? c.custo_ia.usd : 0), 0) * 1e6) / 1e6,
    brl: Math.round(cs.reduce((x, c) => x + (c.custo_ia ? c.custo_ia.brl : 0), 0) * 1e4) / 1e4,
    sem_preco: cs.filter((c) => !c.custo_ia).length
  });
  let saidaIa = null, custo = { pedido: pedido.id, slug: tenant.slug, em: agora.toISOString(), custo_ia: null, chamadas, total: totais(chamadas) };
  let textosOrigem = anterior && anterior.textos_origem ? anterior.textos_origem : null, textosSha256 = anterior && anterior.textos_sha256 ? anterior.textos_sha256 : '';
  const mesmoPedido = anterior && anterior.hashPedido === hashPedido;
  const reaproveitar = mesmoPedido && anterior.status !== 'ia_falhou' && fs.existsSync(arqTextos) && !a['refazer-textos'] && !semIa && !arqTextosAgente && !fixture && !a.api;
  if (semIa) {
    custo.motivo = '--sem-ia: textos do preset';
    textosOrigem = 'preset'; textosSha256 = '';
    etapa(2, 'textos', 'pulado', '--sem-ia, textos do preset');
  } else if (arqTextosAgente) {
    const lt = TX.lerTextos(arqTextosAgente, pedido);
    saidaIa = lt.saida; textosOrigem = 'agente'; textosSha256 = lt.sha256;
    custo = { pedido: pedido.id, slug: tenant.slug, em: agora.toISOString(), origem: 'agente', custo_ia: null, motivo: 'textos escritos por agente da sessão principal (sem API paga)', chamadas, total: totais(chamadas) };
    C.gravarJson(arqTextos, saidaIa);
    etapa(2, 'textos do redator (agente)', 'ok', `arquivo --textos, sha256 ${lt.sha256.slice(0, 12)}, sem API paga`);
  } else if (reaproveitar) {
    saidaIa = C.lerJson(arqTextos);
    if (custoAnterior) custo = Object.assign(custoAnterior, { reaproveitado: true });
    etapa(2, 'textos', 'ok', 'reaproveitados da rodada anterior deste pedido (sem nova chamada)');
  } else if (mesmoPedido && anterior.status === 'ia_falhou' && !a['refazer-textos'] && (fixture || a.api)) {
    /* a última chamada foi paga e falhou: refazer cobra de novo, então a decisão é explícita */
    throw new ErroAmbiente(`a última chamada à IA deste pedido foi cobrada e falhou (${anterior.falha || 'sem detalhe'}); o custo está em sites/${tenant.slug}/custo.json. Para chamar de novo (nova cobrança) use --refazer-textos; para seguir com os textos do preset, --sem-ia; ou traga os textos do agente com --textos.`);
  } else if (fixture || a.api) {
    const cambio = Number(process.env.CREAT_CAMBIO);
    if (!(cambio > 0)) throw new ErroAmbiente('CREAT_CAMBIO ausente ou inválido (R$ por US$, ex.: 5.40): o custo em reais é obrigatório no custo.json. Nada foi cobrado.');
    const ped = IA.montarPedidoIA(pedido, tenant, preset);
    const corpo = IA.corpoRequisicao(ped, modelo, { fallback: process.env.CREAT_FALLBACK !== '0' });
    fs.writeFileSync(path.join(pastaSite, 'requisicao-ia.json'), JSON.stringify(Object.assign({}, corpo, { _nota: 'corpo enviado à API, sem a chave' }), null, 2));
    const resp = fixture ? lerFixture(fixture) : await chamarClaude(corpo);
    const emResp = new Date().toISOString();
    const origem = fixture ? 'fixture' : 'api';
    /* 1º: grava a resposta bruta e o custo ANTES de interpretar qualquer coisa (a API já cobrou) */
    C.gravarJson(arqResp, Object.assign({ em: emResp, origem }, IA.resumoResposta(resp)));
    const ci = IA.custo(resp, cambio);
    if (ci.custo_ia && !C.validador(C.REF.custoIa)(ci.custo_ia)) { ci.falha = 'custo_ia fora do schema Pedido.custo_ia'; ci.custo_ia = null; }
    const chamada = { em: emResp, origem, modeloPedido: modelo, modeloCobrado: (resp && resp.model) || null, stop_reason: (resp && resp.stop_reason) || null, usage: (resp && resp.usage) || {}, tokens: ci.tokens, custo_ia: ci.custo_ia, falha_custo: ci.falha, status: 'resposta_recebida' };
    chamadas.push(chamada);
    custo = { pedido: pedido.id, slug: tenant.slug, em: emResp, origem, modeloPedido: modelo, stop_reason: chamada.stop_reason, custo_ia: ci.custo_ia, usage: chamada.usage, chamadas, total: totais(chamadas), parcial: true };
    C.gravarJson(arqCusto, custo);
    if (ci.falha) avisos.push(`Custo da IA não calculado: ${ci.falha}. Tokens: ${ci.tokens.entrada} de entrada, ${ci.tokens.saida} de saída.`);
    /* 2º: só agora interpreta; se falhar, registra a falha e para com decisão explícita para a próxima rodada */
    try { saidaIa = IA.lerResposta(resp); }
    catch (e) {
      chamada.status = 'falhou'; chamada.falha = e.message;
      custo.parcial = false; custo.falha = e.message;
      C.gravarJson(arqCusto, custo);
      C.gravarJson(arqProd, Object.assign({}, baseProd, { em: emResp, status: 'ia_falhou', falha: e.message }));
      throw new ErroAmbiente(`${e.message} A chamada foi cobrada e o custo está gravado em sites/${tenant.slug}/custo.json (resposta em resposta-ia.json). Para chamar de novo (nova cobrança) use --refazer-textos; para seguir com os textos do preset, --sem-ia.`);
    }
    chamada.status = 'ok';
    delete custo.parcial;
    textosOrigem = origem; textosSha256 = '';
    C.gravarJson(arqTextos, saidaIa);
    etapa(2, 'textos pela IA', 'ok', `${fixture ? 'fixture (sem rede)' : 'API'}: ${chamada.modeloCobrado}, ${ci.tokens.entrada}+${ci.tokens.saida} tokens, ${ci.custo_ia ? `R$ ${ci.custo_ia.brl}` : 'custo NÃO calculado (sem preço do modelo)'}`);
  } else {
    /* caminho padrão sem textos ainda: entrega ao redator só o que ele pode ver, e espera */
    const red = TX.redatorDoPedido(pedido, tenant, preset);
    C.gravarJson(path.join(pastaSite, 'redator.json'), red);
    C.gravarJson(arqProd, Object.assign({}, baseProd, { status: 'aguardando_textos' }));
    log(`\nAGUARDANDO TEXTOS: o redator lê ${path.join(pastaSite, 'redator.json')} e grava o JSON de textos. Depois: node scripts/producao/produzir.mjs --pedido ${a.pedido} --textos <arquivo> --rascunho`);
    return { codigo: 4, status: 'aguardando_textos', slug: tenant.slug, pastaSite, redator: path.join(pastaSite, 'redator.json') };
  }
  custo.total = totais(chamadas);
  C.gravarJson(arqCusto, custo);
  let ignorados = [];
  if (saidaIa) ({ tenant, ignorados } = IA.aplicarSaida(tenant, saidaIa, preset));

  // 3. portão de conteúdo nos textos e validar-tenant
  const g2 = B.checar(textosDoTenant(tenant), { whatsapp: tenant.negocio.whatsapp });
  g2.motivos.push(...B.checarNegocio(tenant, { palavras: vocabularioDoPreset(preset) }));
  g2.ok = g2.motivos.length === 0;
  if (!g2.ok) return emRevisao(pastaSite, Object.assign({}, baseProd, { textos_origem: textosOrigem, textos_sha256: textosSha256 }), 'textos', g2.motivos, log);
  const v = validarTenant(tenant, { preset });
  if (!v.ok) {
    C.gravarJson(path.join(pastaSite, 'tenant.rejeitado.json'), tenant);
    C.gravarJson(arqProd, Object.assign({}, baseProd, { status: 'tenant_rejeitado', textos_origem: textosOrigem, textos_sha256: textosSha256 }));
    throw new C.ErroLista(`Tenant rejeitado pelo validador (sites/${tenant.slug}/tenant.rejeitado.json). Nada foi publicado:`, v.erros);
  }
  C.gravarJson(path.join(pastaSite, 'tenant.json'), tenant);
  etapa(3, 'portão de conteúdo e validar-tenant', 'ok', 'lista de bloqueio + schema + regras da casa');

  // 4. build (final e, com --rascunho, o rascunho que é cópia dele)
  const site = { home: typeof a.home === 'string' ? a.home : homeDoPedido(), url: a.url, rodape: !a['sem-rodape'], demonstracao: !!a.demonstracao };
  const pastaDist = path.join(saida, 'dist', tenant.slug);
  const arqRasc = path.join(pastaSite, 'rascunho.json');
  let rascAnt = null;
  if (a.rascunho && !a['novo-rascunho'] && fs.existsSync(arqRasc)) {
    rascAnt = C.lerJson(arqRasc);
    if (rascAnt.pedido !== pedido.id || !R.RE_ID.test(String(rascAnt.id)) || !R.RE_TOKEN.test(String(rascAnt.token))) rascAnt = null;
  }
  if (a.rascunho && rascAnt === null && fs.existsSync(arqRasc)) {
    // rascunho anterior trocado: o endereço antigo some do disco local (no ar, o executor apaga)
    try { const velho = C.lerJson(arqRasc); if (velho && R.RE_DIR.test(String(velho.dir))) fs.rmSync(path.join(saida, 'dist', velho.dir), { recursive: true, force: true }); } catch (e) { /* sem rascunho legível */ }
  }
  const b = buildSite({ tenant, destino: pastaDist, saida, site, rascunho: a.rascunho ? { id: rascAnt ? rascAnt.id : R.novoId() } : null });
  avisos.push(...b.avisos);
  etapa(4, 'build-site', 'ok', `${b.arquivos.length} arquivos em dist/${tenant.slug}/${b.rascunho ? ` e rascunho em dist/${b.rascunho.dir}/` : ''}`);
  let rascunho = null;
  if (b.rascunho) {
    const token = rascAnt ? rascAnt.token : R.novoToken();
    const url = urlRascunho(b.rascunho.dir);
    rascunho = { pedido: pedido.id, slug: tenant.slug, dir: b.rascunho.dir, id: b.rascunho.id, url, token, token_hash: crypto.createHash('sha256').update(token).digest('hex'), link: url ? `${url}#t=${token}` : '', endpoint: b.rascunho.endpoint, ajuste: b.rascunho.ajuste, criado_em: rascAnt ? rascAnt.criado_em : agora.toISOString(), atualizado_em: agora.toISOString(), final: b.rascunho.final };
    C.gravarJson(arqRasc, rascunho);
  }

  // 5. navegador
  let codigo = 0;
  const print = path.join(pastaSite, 'print-390.png');
  if (a['sem-navegador']) etapa(5, 'teste headless 390 px', 'pulado', '--sem-navegador');
  else {
    try {
      const t = await testarSite(pastaDist, { whatsapp: pedido.whatsapp_negocio, print, exigirRodape: site.rodape && !!site.home, exigirFaixaDemo: site.demonstracao });
      C.gravarJson(path.join(pastaSite, 'teste-site.json'), t);
      if (t.ok) etapa(5, 'teste headless 390 px', 'ok', `sem rolagem lateral, menor texto ${t.medidas.menorFontePx}px, ${t.medidas.waMe.length} links wa.me/${pedido.whatsapp_negocio}, console limpo (CSP ativa)`);
      else { etapa(5, 'teste headless 390 px', 'falhou', t.falhas.join(' | ')); codigo = 3; }
      if (rascunho) {
        const tr = await testarSite(path.join(saida, 'dist', rascunho.dir), { whatsapp: pedido.whatsapp_negocio, waExtras: [R.WHATSAPP_AJUSTE], exigirFaixaRascunho: true, print: path.join(pastaSite, 'print-390-rascunho.png') });
        C.gravarJson(path.join(pastaSite, 'teste-rascunho.json'), tr);
        if (tr.ok) etapa(5, 'teste headless 390 px do rascunho', 'ok', `faixa no topo, botão de aprovar com ${tr.medidas.faixaRascunho.botaoAltura}px, noindex, console limpo`);
        else { etapa(5, 'teste headless 390 px do rascunho', 'falhou', tr.falhas.join(' | ')); codigo = 3; }
      }
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
  if (rascunho) { saidas.rascunho = `dist/${rascunho.dir}/index.html`; saidas.link_de_aprovacao = `sites/${tenant.slug}/rascunho.json (campo link)`; }
  if (fs.existsSync(print)) saidas.print = `sites/${tenant.slug}/print-390.png`;
  if (sair) saidas.sair = `dist/${path.basename(sair.zip)}`;
  etapa(6, 'custo.json e RELATORIO do pedido', 'ok', textosOrigem === 'agente' ? 'R$ 0 de IA (agente da sessão)' : custo.custo_ia ? `R$ ${custo.custo_ia.brl}` : (chamadas.length ? 'custo da IA NÃO calculado (ver Avisos)' : 'sem IA'));
  const rel = { pedido, tenant, em: agora.toISOString(), etapas: etapas.slice().sort((x, y) => x.n - y.n), custo, site: b.site, ignorados, saidas, avisos, textosOrigem, textosSha256, rascunho };
  fs.writeFileSync(path.join(pastaSite, 'RELATORIO.md'), relatorioPedido(rel));
  const status = codigo ? 'falhou' : rascunho ? 'rascunho_pronto' : 'pronto_para_aprovacao';
  C.gravarJson(arqProd, Object.assign({}, baseProd, { status, textos_origem: textosOrigem, textos_sha256: textosSha256, rascunho: rascunho ? { dir: rascunho.dir, url: rascunho.url, token_hash: rascunho.token_hash } : null, etapas: rel.etapas }));
  log(`\n${codigo ? 'FALHOU' : rascunho ? `rascunho pronto: dist/${rascunho.dir}/` : 'pronto para aprovação'}: ${path.join(pastaSite, 'RELATORIO.md')}`);
  return { codigo, status, slug: tenant.slug, pastaSite, pastaDist, sair, custo, etapas: rel.etapas, rascunho: rascunho ? { dir: rascunho.dir, url: rascunho.url } : null };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  produzir(process.argv.slice(2)).then((r) => {
    if (SILENCIO()) console.log(linhaSilenciosa(r));
    process.exitCode = r.codigo;
  }, (e) => {
    console.error(SILENCIO() ? erroSilencioso(e) : e.message);
    process.exitCode = e instanceof C.ErroCampo || e instanceof C.ErroLista ? 1 : e instanceof ErroAmbiente ? 2 : 2;
  });
}
