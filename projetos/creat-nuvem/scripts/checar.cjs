#!/usr/bin/env node
/* =====================================================================
   Porta Aberta · scripts/checar.cjs (T5 · Pixel)
   Aceite 1 da seção 18 do briefing. Sem rede, sem dependência, só lê.

   Uso:  node projetos/creat-nuvem/scripts/checar.cjs [--raiz <pasta do projeto>]
   Saída: código 0 = tudo certo; 1 = alguma regra falhou (lista o arquivo e o motivo).

   O que confere:
   1. Schemas (schema/*.schema.json) contra os fixtures de schema/exemplos:
      todo *.valido.* passa e todo *.invalido.* falha. Usa o ajv se AJV_DIR
      apontar para uma pasta com ajv@8.20.0 + ajv-formats@3.0.1; sem isso, usa
      o validador embutido abaixo (subconjunto de JSON Schema 2020-12 que cobre
      todas as palavras usadas nos 3 schemas; a prova é passar nos 18 fixtures).
   2. Presets de nicho (motor/nichos/*.js), quando existirem: carregam sem erro,
      tenantBase válido no schema de tenant, 3 paletas, sem demo/ocupacaoFicticia,
      textosPermitidos dentro da lista branca. Textos dos presets em conteudo/nichos.
   3. dados/*.json: formato de precos.json, vagas.json, depoimentos.json;
      CREAT_CHECKOUT.precosPadrao (checkout.config.js) igual a precos.json.
      Dado com mais de 48 h é só AVISO: a página já cai no preço padrão (ADR-003).
   4. Nenhuma chave "ocupacaoFicticia" fora de schema/ (onde ela é proibida) e
      dos fixtures inválidos.
   5. Textos públicos (HTML da vitrine, conteudo/, marketing/): sem emoji, sem
      lorem ipsum, sem "[PREENCHER", sem preço escrito no HTML (R$ + número) e
      sem a palavra "agenda"/"agendamento".

   EXCEÇÃO DOCUMENTADA da palavra "agenda" (briefing 5.1 itens 6 e 9 e
   conteudo/README.md): ela só é aceita dentro destas frases, que falam da
   ferramenta que o cliente JÁ usa, nunca do nosso produto:
     - "Já tem agenda (Trinks, Booksy...)? O botão do seu site pode apontar para ela."
     - "E se eu já uso agenda?"
     - qualquer ocorrência de "agenda externa"
   A frase permitida é retirada do texto antes da busca; o resto é proibido.
   O verbo "agendar" (botão "Agendar" do modo link_externo, briefing 7.2) não é
   alvo da regra; "agendamento" é (briefing seção 2: nunca "agendamento garantido").
   Chaves JSON (ex.: "agendamento", "agendaExterna") não são texto público.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
const iRaiz = args.indexOf('--raiz');
const RAIZ = path.resolve(iRaiz !== -1 ? args[iRaiz + 1] : path.join(__dirname, '..'));
const rel = (p) => path.relative(RAIZ, p) || '.';
const existe = (p) => { try { fs.accessSync(p); return true; } catch (e) { return false; } };
const ler = (p) => fs.readFileSync(p, 'utf8');

let falhas = 0, avisos = 0;
const falha = (onde, msg) => { falhas++; console.log(`FALHA  ${onde}: ${msg}`); };
const aviso = (onde, msg) => { avisos++; console.log(`aviso  ${onde}: ${msg}`); };
const ok = (msg) => console.log(`ok     ${msg}`);

/* --------------------------------------------------------------------
   Validador embutido (JSON Schema 2020-12, subconjunto)
   -------------------------------------------------------------------- */
function criarValidador(raizSchema) {
  const tipoDe = (v) => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v;
  const cabe = (v, t) => t === 'number' ? typeof v === 'number' && isFinite(v) : t === 'integer' ? Number.isInteger(v) : tipoDe(v) === t;
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const reCache = {};
  const re = (p) => reCache[p] || (reCache[p] = new RegExp(p, 'u'));
  const formatos = {
    'date-time': (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.test(s) && !isNaN(Date.parse(s)),
    'date': (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')),
    'uri': (s) => { try { new URL(s); return true; } catch (e) { return false; } },
    'email': (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
  };
  function resolverRef(ref) {
    const i = ref.indexOf('#');
    if (i === -1 || (i > 0 && ref.slice(0, i) !== raizSchema.$id)) throw new Error('$ref não suportado: ' + ref);
    return ref.slice(i + 1).split('/').filter(Boolean).reduce((o, k) => o[k.replace(/~1/g, '/').replace(/~0/g, '~')], raizSchema);
  }
  function v(s, d, cam, erros) {
    if (s === true) return true;
    if (s === false) { erros.push(`${cam || '/'} não é permitido`); return false; }
    const n0 = erros.length;
    if (s.$ref) v(resolverRef(s.$ref), d, cam, erros);
    if (s.type) { const ts = [].concat(s.type); if (!ts.some((t) => cabe(d, t))) { erros.push(`${cam || '/'} deve ser ${ts.join('|')}`); return false; } }
    if ('const' in s && !igual(s.const, d)) erros.push(`${cam || '/'} deve ser ${JSON.stringify(s.const)}`);
    if (s.enum && !s.enum.some((e) => igual(e, d))) erros.push(`${cam || '/'} fora da lista`);
    if (typeof d === 'string') {
      const len = Array.from(d).length;
      if (s.minLength !== undefined && len < s.minLength) erros.push(`${cam} menor que ${s.minLength}`);
      if (s.maxLength !== undefined && len > s.maxLength) erros.push(`${cam} maior que ${s.maxLength}`);
      if (s.pattern && !re(s.pattern).test(d)) erros.push(`${cam} fora do padrão`);
      if (s.format && formatos[s.format] && !formatos[s.format](d)) erros.push(`${cam} formato ${s.format}`);
    }
    if (typeof d === 'number') {
      if (s.minimum !== undefined && d < s.minimum) erros.push(`${cam} abaixo de ${s.minimum}`);
      if (s.maximum !== undefined && d > s.maximum) erros.push(`${cam} acima de ${s.maximum}`);
      if (s.exclusiveMinimum !== undefined && d <= s.exclusiveMinimum) erros.push(`${cam} deve passar de ${s.exclusiveMinimum}`);
      if (s.exclusiveMaximum !== undefined && d >= s.exclusiveMaximum) erros.push(`${cam} deve ficar abaixo de ${s.exclusiveMaximum}`);
      if (s.multipleOf !== undefined && Math.abs(d / s.multipleOf - Math.round(d / s.multipleOf)) > 1e-9) erros.push(`${cam} múltiplo de ${s.multipleOf}`);
    }
    if (Array.isArray(d)) {
      if (s.minItems !== undefined && d.length < s.minItems) erros.push(`${cam} menos de ${s.minItems} itens`);
      if (s.maxItems !== undefined && d.length > s.maxItems) erros.push(`${cam} mais de ${s.maxItems} itens`);
      if (s.items && typeof s.items === 'object') d.forEach((x, i) => v(s.items, x, `${cam}/${i}`, erros));
      if (s.uniqueItems && new Set(d.map((x) => JSON.stringify(x))).size !== d.length) erros.push(`${cam} itens repetidos`);
    }
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      (s.required || []).forEach((k) => { if (!(k in d)) erros.push(`${cam}/${k} obrigatório`); });
      const props = s.properties || {};
      Object.keys(d).forEach((k) => {
        if (k in props) v(props[k], d[k], `${cam}/${k}`, erros);
        else if (s.additionalProperties === false) erros.push(`${cam}/${k} campo desconhecido`);
        else if (s.additionalProperties && typeof s.additionalProperties === 'object') v(s.additionalProperties, d[k], `${cam}/${k}`, erros);
      });
    }
    if (s.allOf) s.allOf.forEach((x) => v(x, d, cam, erros));
    if (s.anyOf && !s.anyOf.some((x) => v(x, d, cam, []))) erros.push(`${cam || '/'} não casa com nenhuma opção (anyOf)`);
    if (s.oneOf) {
      const sub = s.oneOf.map((x) => { const e = []; v(x, d, cam, e); return e; });
      const casam = sub.filter((e) => !e.length).length;
      if (casam !== 1) { erros.push(`${cam || '/'} casa com ${casam} opções (oneOf)`); if (!casam) { const menor = sub.sort((a, b) => a.length - b.length)[0]; erros.push(...menor.slice(0, 3)); } }
    }
    if (s.not && v(s.not, d, cam, [])) erros.push(`${cam || '/'} proibido (not)`);
    if (s.if) {
      if (v(s.if, d, cam, [])) { if (s.then) v(s.then, d, cam, erros); }
      else if (s.else) v(s.else, d, cam, erros);
    }
    return erros.length === n0;
  }
  return (dado) => { const erros = []; v(raizSchema, dado, '', erros); return erros; };
}

function carregarAjv() {
  const base = process.env.AJV_DIR;
  if (!base) return null;
  try {
    const Ajv2020 = require(require.resolve('ajv/dist/2020', { paths: [base] })).default;
    const addFormats = require(require.resolve('ajv-formats', { paths: [base] })).default;
    const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false });
    addFormats(ajv);
    return ajv;
  } catch (e) { aviso('AJV_DIR', `não achei ajv em ${base}; uso o validador embutido`); return null; }
}

/* PEDIDO v1 em texto -> objeto (mesma regra de schema/exemplos/validar.cjs) */
function lerPedidoTexto(txt) {
  const linhas = txt.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const o = { formato: (linhas.shift() || '').trim() };
  for (const l of linhas) { const i = l.indexOf(': '); if (i < 1) { o['linha_invalida_' + l] = l; continue; } o[l.slice(0, i).trim()] = l.slice(i + 2).trim(); }
  return o;
}

/* --------------------------------------------------------------------
   1. Schemas e fixtures
   -------------------------------------------------------------------- */
const validar = {};
(function schemas() {
  const pasta = path.join(RAIZ, 'schema');
  if (!existe(pasta)) { falha('schema/', 'pasta ausente'); return; }
  const ajv = carregarAjv();
  for (const n of ['tenant', 'pedido', 'evento']) {
    const arq = path.join(pasta, `${n}.schema.json`);
    if (!existe(arq)) { falha(rel(arq), 'ausente'); continue; }
    let s; try { s = JSON.parse(ler(arq)); } catch (e) { falha(rel(arq), 'JSON inválido: ' + e.message); continue; }
    if (ajv) { const f = ajv.compile(s); validar[n] = (d) => f(d) ? [] : (f.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`); }
    else validar[n] = criarValidador(s);
  }
  const ex = path.join(pasta, 'exemplos');
  const arquivos = existe(ex) ? fs.readdirSync(ex).filter((f) => /\.(valido|invalido)\.(json|txt)$/.test(f)).sort() : [];
  if (!arquivos.length) { falha('schema/exemplos', 'nenhum fixture'); return; }
  let certos = 0;
  for (const f of arquivos) {
    const nome = f.split('.')[0], esperado = f.includes('.valido.');
    if (!validar[nome]) { falha(`schema/exemplos/${f}`, `sem schema "${nome}"`); continue; }
    let dado;
    try { const t = ler(path.join(ex, f)); dado = f.endsWith('.txt') ? lerPedidoTexto(t) : JSON.parse(t); }
    catch (e) { falha(`schema/exemplos/${f}`, 'não abriu: ' + e.message); continue; }
    const erros = validar[nome](dado), passou = !erros.length;
    if (passou === esperado) certos++;
    else falha(`schema/exemplos/${f}`, esperado ? `devia passar e falhou (${erros.slice(0, 2).join('; ')})` : 'devia falhar e passou');
  }
  ok(`schemas: ${certos}/${arquivos.length} fixtures com o resultado esperado (${ajv ? 'ajv' : 'validador embutido'})`);
})();

/* --------------------------------------------------------------------
   2. Presets de nicho
   -------------------------------------------------------------------- */
const LISTA_BRANCA_TEXTOS = ['heroTitulo', 'heroSubtitulo', 'manifesto', 'servicosTitulo', 'servicosNota', 'equipeTitulo', 'avaliacoesTitulo', 'pedidoTitulo', 'pedidoNota', 'ritualDica', 'confirmacaoTitulo', 'confirmacaoTexto', 'letreiroAberto', 'letreiroFechado', 'localTitulo', 'faqTitulo', 'faq', 'rodapeFrase'];
(function presets() {
  const pasta = path.join(RAIZ, 'motor', 'nichos');
  const idx = path.join(pasta, 'index.js');
  if (!existe(idx)) { aviso('motor/nichos', 'ainda não existe (T4); presets não conferidos'); return; }
  const janela = { console: { warn: (m) => avisoPreset.push(String(m)), log() {}, error() {} }, setTimeout, clearTimeout };
  janela.window = janela; janela.globalThis = janela;
  const avisoPreset = [];
  const ctx = vm.createContext(janela);
  try { vm.runInContext(ler(idx), ctx, { filename: 'motor/nichos/index.js' }); }
  catch (e) { falha('motor/nichos/index.js', 'não carrega: ' + e.message); return; }
  const N = janela.CreatNichos;
  const lista = (N && N.DISPONIVEIS) || fs.readdirSync(pasta).filter((f) => f.endsWith('.js') && f !== 'index.js').map((f) => f.slice(0, -3));
  for (const id of lista) {
    const arq = path.join(pasta, id + '.js');
    if (!existe(arq)) { falha(rel(arq), 'listado em DISPONIVEIS mas o arquivo não existe'); continue; }
    try { vm.runInContext(ler(arq), ctx, { filename: rel(arq) }); }
    catch (e) { falha(rel(arq), 'não carrega: ' + e.message); continue; }
    const p = janela.CREAT_NICHOS && janela.CREAT_NICHOS[id];
    if (!p) { falha(rel(arq), `não registrou o nicho (${avisoPreset.join(' | ') || 'sem motivo'})`); continue; }
    const pr = [];
    if (!Array.isArray(p.paletas) || p.paletas.length !== 3) pr.push('precisa de 3 paletas');
    const tb = p.tenantBase;
    if (!tb) pr.push('sem tenantBase');
    else {
      const e = validar.tenant ? validar.tenant(JSON.parse(JSON.stringify(tb))) : [];
      if (e.length) pr.push('tenantBase fora do schema: ' + e.slice(0, 3).join('; '));
      if (tb.demo) pr.push('tenantBase.demo (ocupação inventada)');
      if ((tb.avaliacoes || []).length) pr.push('avaliação de exemplo na prévia');
      if ((tb.profissionais || []).length) pr.push('equipe de exemplo na prévia');
    }
    const fora = (p.textosPermitidos || []).filter((k) => LISTA_BRANCA_TEXTOS.indexOf(k) === -1);
    if (fora.length) pr.push('textosPermitidos fora da lista branca: ' + fora.join(', '));
    if (JSON.stringify(p).indexOf('ocupacaoFicticia') !== -1) pr.push('contém ocupacaoFicticia');
    if (pr.length) pr.forEach((m) => falha(rel(arq), m)); else ok(`preset ${id}: tenantBase no schema, 3 paletas, sem dado inventado`);
  }
  const cont = path.join(RAIZ, 'conteudo', 'nichos');
  if (existe(cont)) for (const f of fs.readdirSync(cont).filter((x) => x.endsWith('.json'))) {
    try { JSON.parse(ler(path.join(cont, f))); } catch (e) { falha(`conteudo/nichos/${f}`, 'JSON inválido'); }
  }
})();

/* --------------------------------------------------------------------
   3. dados/*.json e checkout.config.js
   -------------------------------------------------------------------- */
const inteiro = (v) => Number.isInteger(v) && v >= 0;
const positivo = (v) => typeof v === 'number' && isFinite(v) && v > 0;
function idade(o, onde) {
  const t = Date.parse(o && o.atualizado_em);
  if (isNaN(t)) { falha(onde, 'atualizado_em ausente ou não é data ISO'); return; }
  const h = (Date.now() - t) / 3600000;
  if (h < -0.09) falha(onde, 'atualizado_em no futuro');
  else if (h > 48) aviso(onde, `atualizado_em com ${Math.round(h)} h: a vitrine mostra o preço padrão, sem contador e sem inauguração (rode scripts/atualizar-vagas.cjs)`);
}
let precos = null;
(function dados() {
  const d = (n) => path.join(RAIZ, 'dados', n);
  const json = (n) => { try { return JSON.parse(ler(d(n))); } catch (e) { falha(`dados/${n}`, existe(d(n)) ? 'JSON inválido' : 'ausente'); return null; } };
  const p = json('precos.json');
  if (p) {
    const pr = [];
    if (!positivo(p.prazoHoras)) pr.push('prazoHoras');
    if (!p.abertura || !positivo(p.abertura.padrao)) pr.push('abertura.padrao');
    const i = p.abertura && p.abertura.inauguracao;
    if (!i || typeof i.ativa !== 'boolean' || !positivo(i.preco) || !inteiro(i.vagasTotal) || !inteiro(i.vagasRestantes) || i.vagasRestantes > i.vagasTotal || (p.abertura && i.preco >= p.abertura.padrao)) pr.push('abertura.inauguracao {ativa, preco < padrao, vagasTotal, vagasRestantes <= vagasTotal}');
    if (!p.planos || !positivo(p.planos.aberto) || !positivo(p.planos.vitrine)) pr.push('planos.aberto/vitrine');
    if (!Number.isInteger(p.anualMesesPagos) || p.anualMesesPagos < 1 || p.anualMesesPagos > 12) pr.push('anualMesesPagos (1 a 12)');
    if (!positivo(p.bastidores)) pr.push('bastidores');
    if (pr.length) pr.forEach((m) => falha('dados/precos.json', m)); else { ok('dados/precos.json no formato'); precos = p; }
    idade(p, 'dados/precos.json');
  }
  const v = json('vagas.json');
  if (v) {
    if (!inteiro(v.capacidade_dia) || !inteiro(v.em_producao) || !inteiro(v.vagas_hoje) || v.vagas_hoje > v.capacidade_dia) falha('dados/vagas.json', 'capacidade_dia, em_producao, vagas_hoje inteiros e vagas_hoje <= capacidade_dia');
    else ok('dados/vagas.json no formato');
    idade(v, 'dados/vagas.json');
  }
  const dep = json('depoimentos.json');
  if (dep) {
    const itens = Array.isArray(dep) ? dep : dep.itens;
    if (!Array.isArray(itens)) falha('dados/depoimentos.json', 'precisa de "itens": []');
    else {
      itens.forEach((x, n) => {
        if (!x || typeof x.texto !== 'string' || typeof x.autor !== 'string') falha('dados/depoimentos.json', `item ${n}: texto e autor obrigatórios`);
        if (!x || isNaN(Date.parse(x.autorizadoEm))) falha('dados/depoimentos.json', `item ${n}: sem autorizadoEm (autorização por escrito); não pode ficar no arquivo`);
      });
      ok(`dados/depoimentos.json: ${itens.length} item(ns)${itens.length ? '' : ' (a seção Prova some da home)'}`);
    }
  }
  // checkout.config.js: só links públicos; precosPadrao igual a precos.json
  const ck = path.join(RAIZ, 'checkout.config.js');
  if (!existe(ck)) { falha('checkout.config.js', 'ausente'); return; }
  const j = {}; j.window = j;
  try { vm.runInContext(ler(ck), vm.createContext(Object.assign(j, { URL, Promise }))); }
  catch (e) { falha('checkout.config.js', 'não carrega: ' + e.message); return; }
  const C = j.CREAT_CHECKOUT;
  if (!C || !C.links || typeof C.linkValido !== 'function') { falha('checkout.config.js', 'sem CREAT_CHECKOUT completo'); return; }
  if (precos && C.precosPadrao) {
    const pp = C.precosPadrao, dif = [];
    if (pp.prazoHoras !== precos.prazoHoras) dif.push('prazoHoras');
    if (pp.abertura !== precos.abertura.padrao) dif.push('abertura');
    if (pp.planos.aberto !== precos.planos.aberto || pp.planos.vitrine !== precos.planos.vitrine) dif.push('planos');
    if (pp.anualMesesPagos !== precos.anualMesesPagos) dif.push('anualMesesPagos');
    if (pp.bastidores !== precos.bastidores) dif.push('bastidores');
    if (dif.length) falha('checkout.config.js', 'precosPadrao diferente de dados/precos.json em: ' + dif.join(', '));
    else ok('checkout.config.js: precosPadrao igual a dados/precos.json');
  }
  // reserva de último caso em assets/vitrine.js (só usada se checkout.config.js não carregar)
  const vj = path.join(RAIZ, 'assets', 'vitrine.js');
  if (existe(vj) && precos) {
    const m = /var pad = \(CK && CK\.precosPadrao\) \|\| (\{[^;]+\});/.exec(ler(vj));
    if (m) {
      let r; try { r = vm.runInNewContext('(' + m[1] + ')'); } catch (e) { r = null; }
      if (!r || r.abertura !== precos.abertura.padrao || r.prazoHoras !== precos.prazoHoras || r.planos.aberto !== precos.planos.aberto || r.planos.vitrine !== precos.planos.vitrine || r.anualMesesPagos !== precos.anualMesesPagos || r.bastidores !== precos.bastidores) falha('assets/vitrine.js', 'reserva de preços diferente de dados/precos.json');
    }
  }
  const segredo = /(sk-ant-|sk_live|secret|senha|password|api[_-]?key|token\s*:)/i;
  if (segredo.test(ler(ck).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''))) falha('checkout.config.js', 'parece conter segredo (chave, token ou senha)');
})();

/* --------------------------------------------------------------------
   4. ocupacaoFicticia
   -------------------------------------------------------------------- */
const IGNORAR = new Set(['node_modules', '.verificacao', 'dist', 'sites', 'pedidos', '.git']);
function listar(dir, filtro, out) {
  out = out || [];
  if (!existe(dir)) return out;
  for (const n of fs.readdirSync(dir)) {
    if (IGNORAR.has(n)) continue;
    const p = path.join(dir, n), st = fs.statSync(p);
    if (st.isDirectory()) listar(p, filtro, out); else if (filtro(p)) out.push(p);
  }
  return out;
}
(function ocupacao() {
  const texto = /\.(js|cjs|mjs|json|html|md|txt|css)$/;
  const achados = listar(RAIZ, (p) => texto.test(p)).filter((p) => {
    const r = rel(p);
    if (r.startsWith('schema' + path.sep) || r.startsWith('docs' + path.sep) || r.startsWith('scripts' + path.sep) || r === 'RELATORIO.md') return false;
    return ler(p).indexOf('ocupacaoFicticia') !== -1;
  });
  if (achados.length) achados.forEach((p) => falha(rel(p), 'contém ocupacaoFicticia (regra dura 1)'));
  else ok('nenhum ocupacaoFicticia fora de schema/, docs/ e scripts/');
})();

/* --------------------------------------------------------------------
   5. Textos públicos
   -------------------------------------------------------------------- */
const PERMITIDAS_AGENDA = [
  'Já tem agenda (Trinks, Booksy...)? O botão do seu site pode apontar para ela.',
  'E se eu já uso agenda?',
  'agenda externa'
];
const RE_AGENDA = /\bagenda(s|mento|mentos)?\b/giu;
// Emoji: pictográficos e o seletor de variação. ©, ®, ™ e setas tipográficas não contam.
const RE_EMOJI = /(?![©®™↔↕])[\p{Extended_Pictographic}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
const RE_LOREM = /lorem ipsum|dolor sit amet/i;

function textoVisivelHtml(h) {
  const attrs = [];
  h.replace(/\s(?:alt|title|aria-label|placeholder|content|data-msg|data-rotulo|data-salvo)="([^"]*)"/g, (m, v) => { attrs.push(v); return m; });
  const corpo = h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
  return (corpo + '\n' + attrs.join('\n')).replace(/[ \t]+/g, ' ');
}
function valoresJson(o, out, chave) {
  out = out || [];
  if (typeof o === 'string') { if (!(chave && chave.charAt(0) === '_')) out.push(o); }
  else if (Array.isArray(o)) o.forEach((x) => valoresJson(x, out, chave));
  else if (o && typeof o === 'object') Object.keys(o).forEach((k) => { if (k.charAt(0) !== '_') valoresJson(o[k], out, k); });
  return out;
}
function conferirTexto(onde, texto, opcoes) {
  let limpo = texto;
  PERMITIDAS_AGENDA.forEach((f) => { limpo = limpo.split(f).join(' '); });
  limpo = limpo.replace(/agenda externa/gi, ' ');
  const ag = limpo.match(RE_AGENDA);
  if (ag) falha(onde, `palavra proibida "${ag[0]}" (use "pedido de horário no seu WhatsApp")`);
  const em = RE_EMOJI.exec(texto);
  if (em) falha(onde, `emoji ${JSON.stringify(em[0])} (U+${em[0].codePointAt(0).toString(16).toUpperCase()})`);
  if (RE_LOREM.test(texto)) falha(onde, 'lorem ipsum');
  if (/\[PREENCHER/i.test(texto)) falha(onde, '[PREENCHER] esquecido');
  if (opcoes && opcoes.html && /R\$\s*\d/.test(texto)) falha(onde, 'preço escrito no HTML (valores vêm de dados/precos.json)');
}
(function textos() {
  const htmls = listar(RAIZ, (p) => p.endsWith('.html')).filter((p) => !/^(docs|scripts|schema|marketing)\b/.test(rel(p)));
  htmls.forEach((p) => conferirTexto(rel(p), textoVisivelHtml(ler(p)), { html: true }));
  const cont = listar(path.join(RAIZ, 'conteudo'), (p) => /\.(json|md)$/.test(p)).filter((p) => !p.endsWith('README.md'));
  cont.forEach((p) => {
    if (p.endsWith('.json')) { let o; try { o = JSON.parse(ler(p)); } catch (e) { falha(rel(p), 'JSON inválido'); return; } conferirTexto(rel(p), valoresJson(o).join('\n')); }
    else conferirTexto(rel(p), ler(p));
  });
  // marketing/: só emoji, lorem e [PREENCHER] (os arquivos citam a regra da palavra proibida ao explicá-la).
  listar(path.join(RAIZ, 'marketing'), (p) => p.endsWith('.md')).forEach((p) => {
    const t = ler(p), em = RE_EMOJI.exec(t);
    if (em) falha(rel(p), `emoji ${JSON.stringify(em[0])}`);
    if (RE_LOREM.test(t)) falha(rel(p), 'lorem ipsum');
    if (/\[PREENCHER/i.test(t)) falha(rel(p), '[PREENCHER] esquecido');
  });
  // termos e privacidade: primeira linha REVISAO_JURIDICA_PENDENTE (regra dura 8)
  for (const n of ['termos', 'privacidade']) {
    const md = path.join(RAIZ, 'conteudo', n + '.md'), html = path.join(RAIZ, n, 'index.html');
    if (existe(md) && ler(md).split('\n')[0].trim() !== 'REVISAO_JURIDICA_PENDENTE') falha(rel(md), 'primeira linha precisa ser REVISAO_JURIDICA_PENDENTE');
    if (existe(html) && ler(html).indexOf('REVISAO_JURIDICA_PENDENTE') === -1) falha(rel(html), 'falta a linha REVISAO_JURIDICA_PENDENTE no topo');
  }
  ok(`textos públicos: ${htmls.length} HTML e ${cont.length} arquivos de conteudo/ conferidos`);
})();

console.log(`\n${falhas ? falhas + ' falha(s)' : 'tudo certo'}${avisos ? ', ' + avisos + ' aviso(s)' : ''}`);
process.exit(falhas ? 1 : 0);
