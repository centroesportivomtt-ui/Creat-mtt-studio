/*
 * scripts/producao/lib/comum.cjs · peças comuns da produção v0 (T9 · Forja)
 *
 * Caminhos, leitura de argumentos, ajv com os schemas da T1 e os presets de nicho
 * reaproveitados de motor/nichos/ (nenhum dado de preset é copiado para cá).
 * Sem rede. Sem segredo.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..', '..');           // projetos/creat-nuvem
const SCHEMA = path.join(RAIZ, 'schema');
const MOTOR = path.join(RAIZ, 'motor');

/*
 * ENDEREÇO DA VITRINE: a fonte ÚNICA (pacote H2, 11/11/2026; docs/DOMINIO.md).
 * O app Base44 "Creat Nuvem" (6aefffe66b684db9404b1994) responde, com o mesmo conteúdo, em dois endereços:
 *   canonico  https://nuvem.creatmtt.com.br  (domínio do dono, CNAME no Registro.br, verificado em 10/11/2026)
 *   antigo    https://creat-nuvem-404b1994.base44.app  ("endereço antigo conhecido")
 * O canônico é o padrão de tudo: home e URL dos sites (build-site, produzir, link-aprovacao, publicar-site),
 * sitemap e robots da vitrine (montar-publico) e o host das conferências (conferir-no-ar, conferir-sites-no-ar,
 * validar-anuncio). O antigo NUNCA sai do ar enquanto houver anúncio ou preferência do Mercado Pago apontando
 * para ele; até o ato de 13/11 (antigoAceitoAte) as conferências o aceitam como "antigo, redireciona".
 * Nenhum outro arquivo escreve estes endereços: todos leem daqui.
 * CREAT_HOST (opcional) troca o canônico de uma vez, para voltar atrás sem editar código
 * (CREAT_HOST=https://creat-nuvem-404b1994.base44.app). Só origem https, sem caminho.
 * CREAT_HOME e CREAT_URL_SITES continuam valendo por cima: vazia ou ausente = padrão; "0" desliga
 * (sem canonical/sitemap; rodapé sem link).
 */
const ENDERECO = Object.freeze({
  canonico: 'https://nuvem.creatmtt.com.br',
  antigo: 'https://creat-nuvem-404b1994.base44.app',
  // último dia (horário da Bahia) em que o antigo é aceito como destino de anúncio sem reprovar
  antigoAceitoAte: '2026-11-13'
});
const HOME_PADRAO = ENDERECO.canonico + '/';
const URL_SITES_PADRAO = ENDERECO.canonico + '/sites/{slug}/';
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/;          // o mesmo $defs/slug do tenant.schema.json

function envOuPadrao(nome, padrao) {
  const v = process.env[nome];
  if (v === undefined || !String(v).trim()) return padrao;
  return String(v).trim() === '0' ? '' : String(v).trim();
}
/* origem canônica em uso: CREAT_HOST ou ENDERECO.canonico, sempre sem barra no fim */
function hostPadrao() {
  const v = String(process.env.CREAT_HOST || '').trim();
  if (!v) return ENDERECO.canonico;
  let u;
  try { u = new URL(v); } catch (e) { throw new ErroCampo('CREAT_HOST', `URL inválida: ${v}`); }
  if (u.protocol !== 'https:' || (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash || u.username || u.password) throw new ErroCampo('CREAT_HOST', `precisa ser só a origem https, sem caminho (veio ${v})`);
  return u.origin;
}
/* home da vitrine (link do rodapé "Aberto pela Creat") */
function homePadrao() { return envOuPadrao('CREAT_HOME', hostPadrao() + '/'); }
/* modelo da URL dos sites entregues, com {slug} */
function modeloUrlSites() { return envOuPadrao('CREAT_URL_SITES', hostPadrao() + '/sites/{slug}/'); }
/* as origens que respondem pela vitrine hoje: a canônica em uso primeiro, depois as outras conhecidas */
function origensDaVitrine() { return [...new Set([hostPadrao(), ENDERECO.canonico, ENDERECO.antigo])]; }
/* data de hoje na Bahia (UTC-3, sem horário de verão), AAAA-MM-DD; agora pode vir de teste */
function hojeNaBahia(agora) { return new Date((agora ? new Date(agora) : new Date()).getTime() - 3 * 3600e3).toISOString().slice(0, 10); }
/* o endereço antigo ainda vale como destino de anúncio? (até antigoAceitoAte, inclusive). hoje: AAAA-MM-DD opcional */
function antigoAceito(hoje) { return String(hoje || hojeNaBahia()) <= ENDERECO.antigoAceitoAte; }

class ErroCampo extends Error {
  /* erro de entrada: sempre cita o campo; o CLI imprime e sai com código 1 */
  constructor(campo, mensagem) {
    super(`${campo}: ${mensagem}`);
    this.name = 'ErroCampo';
    this.campo = campo;
  }
}

class ErroLista extends Error {
  constructor(titulo, erros) {
    super(`${titulo}\n` + erros.map((e) => `  - ${e.campo}: ${e.mensagem}`).join('\n'));
    this.name = 'ErroLista';
    this.erros = erros;
  }
}

/* --chave valor | --flag ; o resto vai em _ */
function lerArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split(/=(.*)/s);
      if (v !== undefined) o[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) o[k] = argv[++i];
      else o[k] = true;
    } else o._.push(a);
  }
  return o;
}

/* pasta onde sites/, dist/ e pedidos/ são gravados (testes usam uma pasta temporária) */
function pastaSaida(args) {
  return path.resolve((args && args.saida) || process.env.CREAT_SAIDA || RAIZ);
}

function lerJson(arq) {
  try { return JSON.parse(fs.readFileSync(arq, 'utf8')); }
  catch (e) { throw new ErroCampo(path.basename(arq), `não consegui ler o JSON (${e.message})`); }
}

function gravarJson(arq, obj) {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, JSON.stringify(obj, null, 2) + '\n');
}

let ajvCache = null;
function ajv() {
  if (ajvCache) return ajvCache;
  let Ajv2020, addFormats;
  try {
    Ajv2020 = require('ajv/dist/2020').default;
    addFormats = require('ajv-formats').default;
  } catch (e) {
    throw new Error('ajv não instalado. Rode "npm install" em projetos/creat-nuvem (versões fixadas no package.json).');
  }
  const a = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, strictTypes: false });
  addFormats(a);
  for (const n of ['tenant', 'pedido']) a.addSchema(JSON.parse(fs.readFileSync(path.join(SCHEMA, `${n}.schema.json`), 'utf8')));
  ajvCache = a;
  return a;
}
function validador(ref) {
  const v = ajv().getSchema(ref);
  if (!v) throw new Error(`schema não encontrado: ${ref}`);
  return v;
}
const REF = {
  tenant: 'urn:creat-nuvem:schema:tenant:v1',
  pedidoEntrada: 'urn:creat-nuvem:schema:pedido:v1#/$defs/PedidoEntrada',
  custoIa: 'urn:creat-nuvem:schema:pedido:v1#/$defs/Pedido/properties/custo_ia'
};

/* erros do ajv -> [{campo, mensagem}] legíveis, citando o caminho */
function errosAjv(erros, raizNome) {
  const vistos = new Set(), out = [];
  for (const e of erros || []) {
    if (['if', 'oneOf', 'allOf', 'not'].includes(e.keyword) && erros.length > 1 && e.keyword !== 'not') continue;
    let campo = (raizNome ? raizNome : '') + (e.instancePath || '').replace(/^\//, raizNome ? '.' : '').replace(/\//g, '.');
    campo = campo.replace(/\.(\d+)(?=\.|$)/g, '[$1]') || raizNome || '(raiz)';
    let msg;
    const p = e.params || {};
    switch (e.keyword) {
      case 'additionalProperties': campo = (campo === '(raiz)' ? '' : campo + '.') + p.additionalProperty; msg = 'campo desconhecido (o schema não aceita)'; break;
      case 'required': campo = (campo === '(raiz)' ? '' : campo + '.') + p.missingProperty; msg = 'campo obrigatório ausente'; break;
      case 'maxLength': msg = `acima do limite de ${p.limit} caracteres`; break;
      case 'minLength': msg = `abaixo do mínimo de ${p.limit} caractere(s)`; break;
      case 'pattern': msg = 'formato inválido'; break;
      case 'enum': msg = `valor fora da lista (${(p.allowedValues || []).join(', ')})`; break;
      case 'const': msg = `deve ser exatamente "${p.allowedValue}"`; break;
      case 'type': msg = `tipo errado (esperado ${p.type})`; break;
      case 'maxItems': msg = `no máximo ${p.limit} item(ns)`; break;
      case 'not': msg = 'valor proibido'; break;
      default: msg = e.message;
    }
    const k = campo + '|' + msg;
    if (vistos.has(k)) continue;
    vistos.add(k);
    out.push({ campo, mensagem: msg });
  }
  return out;
}

/* presets de motor/nichos/ (scripts clássicos que também rodam no node) */
function carregarPreset(nicho) {
  if (!/^[a-z][a-z0-9-]{1,30}$/.test(String(nicho || ''))) throw new ErroCampo('nicho', `nicho inválido: ${nicho}`);
  const N = require(path.join(MOTOR, 'nichos', 'index.js'));
  if (!N.obter(nicho)) {
    const arq = path.join(MOTOR, 'nichos', `${nicho}.js`);
    if (!fs.existsSync(arq)) throw new ErroCampo('nicho', `não existe preset motor/nichos/${nicho}.js`);
    require(arq);
  }
  const p = N.obter(nicho);
  if (!p) throw new ErroCampo('nicho', `o preset motor/nichos/${nicho}.js não registrou (veja o aviso [nichos] acima)`);
  return p;
}
function motor() { return require(path.join(MOTOR, 'v1', 'motor.js')); }

function copiarPasta(de, para, filtro) {
  fs.mkdirSync(para, { recursive: true });
  for (const n of fs.readdirSync(de)) {
    const a = path.join(de, n), b = path.join(para, n);
    const st = fs.statSync(a);
    if (filtro && !filtro(a, st)) continue;
    if (st.isDirectory()) copiarPasta(a, b, filtro);
    else fs.copyFileSync(a, b);
  }
}

function listarArquivos(dir) {
  const out = [];
  (function andar(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) andar(p); else out.push(p);
    }
  })(dir);
  return out.sort();
}

module.exports = {
  RAIZ, SCHEMA, MOTOR, ENDERECO, HOME_PADRAO, URL_SITES_PADRAO, SLUG_RE, hostPadrao, homePadrao, modeloUrlSites, origensDaVitrine, hojeNaBahia, antigoAceito, ErroCampo, ErroLista, lerArgs, pastaSaida, lerJson, gravarJson,
  ajv, validador, REF, errosAjv, carregarPreset, motor, copiarPasta, listarArquivos
};
