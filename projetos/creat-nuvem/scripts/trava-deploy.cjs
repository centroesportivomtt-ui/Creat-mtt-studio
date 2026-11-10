#!/usr/bin/env node
/*
 * scripts/trava-deploy.cjs · trava de publicação do app Porta Aberta (pacote 1D · Trilho · 10/11/2026)
 *
 * Por quê: três quem publicam no MESMO app Base44 (6aefffe66b684db9404b1994): a tarefa executora
 * (de hora em hora), o carimbo diário de vagas e o coordenador. Um deploy publica o app inteiro.
 * Sem trava, um deploy no meio do outro publica arquivo pela metade ou desfaz o trabalho do vizinho.
 *
 * Onde a trava mora: entidade Operacao do app (pacote 1A, docs/PEDIDO-API.md seção 2), linhas
 * {chave, valor, expira_em}. Nenhum agente manuseia token de admin, então quem publica lê e grava
 * essas linhas pelo MCP do Base44 (query_entities e update_entities/create_entities). Este script
 * NÃO tem rede: recebe as linhas lidas (--estado) e devolve a decisão e as linhas a gravar.
 *
 *   chave "trava_deploy"         valor = dono (ex.: "executor:2026-11-10T14:00"), expira_em = agora + 20 min.
 *                                Mesmo formato da função operacao do 1A (valor = dono), então as duas
 *                                maneiras de pegar a trava se respeitam.
 *   chave "pausado"              parada geral. Valor "sim" (ou "true", "1", "pausado") e não vencida = nada publica.
 *   chave "deploys_ultima_hora"  valor = JSON com a lista dos horários ISO dos deploys dos últimos 60 min.
 *                                Teto: 3 deploys por hora, contando todos os donos.
 *   chave "ensaio_ok"            data ISO gravada pelo coordenador quando o ENSAIO de docs/EXECUTOR.md
 *                                passou inteiro. Sem ela, nenhum site de CLIENTE REAL vai ao ar.
 *
 * Uso (pasta projetos/creat-nuvem). <estado.json> = a lista de linhas de Operacao lida pelo MCP
 * (array de objetos com chave, valor, expira_em; pode vir como {"records":[...]} ou {"data":[...]}):
 *   node scripts/trava-deploy.cjs pegar        --dono <dono> --estado <estado.json>
 *   node scripts/trava-deploy.cjs confirmar    --dono <dono> --estado <estado relido depois de gravar>
 *   node scripts/trava-deploy.cjs pode-publicar --dono <dono> --estado <estado.json> --tipo rascunho|final|remocao|dados|vitrine
 *                                              [--cliente-real] [--portoes <portoes.json>] [--apesar-da-pausa]
 *   node scripts/trava-deploy.cjs registrar-deploy --dono <dono> --estado <estado.json>
 *   node scripts/trava-deploy.cjs soltar       --dono <dono> --estado <estado.json>
 *   Opções: --agora <ISO> (teste) · --ttl-min <1..20> (padrão 20) · --ajuda
 *
 * Saída: uma linha JSON {ok, acao, motivo?, gravar?: [{chave, valor, expira_em}], ...}.
 * "gravar" é o que a sessão grava na entidade Operacao (update se a chave existe, create se não).
 * "mcp" (em pegar e soltar) é a chamada CONDICIONAL de update_entities: o filtro só casa se a trava
 * estiver livre, vencida ou for do mesmo dono (pegar) ou se for sua (soltar). Use sempre o "mcp", não
 * o "gravar", para a trava: é a troca atômica no servidor. A linha trava_deploy precisa existir (o
 * coordenador cria uma vez com valor ""). Depois, RELEIA as linhas e rode "confirmar": se o update
 * casou 0 linhas ou outro dono aparece, recue.
 *
 * Códigos: 0 liberado · 1 entrada inválida (nada a gravar) · 3 recusado (trava alheia, pausa, teto, portão).
 * Regra de falha: sem estado legível, sem trava própria ou com dúvida, a resposta é NÃO publicar.
 */
'use strict';
const fs = require('fs');

const TTL_PADRAO_MIN = 20;
const TTL_MAX_MIN = 20;
const MARGEM_MIN = 5;                 // pode-publicar exige pelo menos 5 min de trava pela frente
const TETO_HORA = 3;
const JANELA_MS = 60 * 60 * 1000;
const RE_DONO = /^[a-z0-9][A-Za-z0-9:._-]{2,79}$/;
const TIPOS = ['rascunho', 'final', 'remocao', 'dados', 'vitrine'];
const PAUSA_ATIVA = ['sim', 'true', '1', 'pausado'];
// portões que todo site de cliente (rascunho ou final) precisa ter verdes ANTES do deploy
const PORTOES_SITE = ['portao_conteudo', 'csp', 'testar_site', 'conferir_boot'];
// dados/vagas.json e dados/precos.json (passo m de EXECUTOR.md): atualizar-vagas.cjs saiu com 0
const PORTOES_DADOS = ['atualizar_vagas'];
// portões da vitrine e do motor (PUBLICACAO.md seção 2)
const PORTOES_VITRINE = ['npm_test', 'checar', 'conferir_moldura', 'conferir_boot', 'conferir_sites_no_ar', 'qa', 'seguranca'];

class ErroEntrada extends Error {}

function dataValida(s) { const t = Date.parse(s); return Number.isFinite(t) ? t : null; }

/* normaliza a resposta do MCP: array, {records}, {data}, {items} ou {entities} */
function linhasDe(bruto) {
  let l = bruto;
  if (l && !Array.isArray(l) && typeof l === 'object') l = l.records || l.data || l.items || l.entities || l.results;
  if (!Array.isArray(l)) throw new ErroEntrada('estado: esperava a lista de linhas de Operacao (array ou {records:[...]})');
  const mapa = new Map();
  const vistas = new Map();
  for (const r of l) {
    if (!r || typeof r !== 'object' || typeof r.chave !== 'string') continue;
    vistas.set(r.chave, (vistas.get(r.chave) || 0) + 1);
    const atual = mapa.get(r.chave);
    // chave repetida: fica a mais recente (updated_date, depois expira_em) e a dúvida é marcada
    const ordem = (x) => dataValida(x.updated_date) || dataValida(x.expira_em) || 0;
    if (!atual || ordem(r) >= ordem(atual)) mapa.set(r.chave, Object.assign({}, r));
  }
  for (const [k, n] of vistas) if (n > 1) mapa.get(k)._repetida = true;
  return mapa;
}

function vigente(linha, agora) {
  if (!linha) return false;
  const exp = dataValida(linha.expira_em);
  return exp === null ? true : exp > agora;      // sem expira_em = vigente (nunca adivinhar que venceu)
}

function lerTrava(mapa, agora) {
  const l = mapa.get('trava_deploy');
  if (!l || typeof l.valor !== 'string' || !l.valor.trim()) return { livre: true };
  const exp = dataValida(l.expira_em);
  if (exp === null) return { livre: false, dono: l.valor, expira_em: null, sem_validade: true };
  if (exp <= agora) return { livre: true, vencida: true, dono_anterior: l.valor };
  return { livre: false, dono: l.valor, expira_em: new Date(exp).toISOString(), resta_min: Math.floor((exp - agora) / 60000) };
}

function pausado(mapa, agora) {
  const l = mapa.get('pausado');
  if (!l || !vigente(l, agora)) return false;
  return PAUSA_ATIVA.includes(String(l.valor == null ? '' : l.valor).trim().toLowerCase());
}

function deploysRecentes(mapa, agora) {
  const l = mapa.get('deploys_ultima_hora');
  if (!l || l.valor == null || l.valor === '') return [];
  let v;
  try { v = typeof l.valor === 'string' ? JSON.parse(l.valor) : l.valor; } catch (e) { throw new ErroEntrada('deploys_ultima_hora: valor não é JSON; corrija a linha antes de publicar'); }
  if (!Array.isArray(v)) throw new ErroEntrada('deploys_ultima_hora: valor precisa ser uma lista de horários ISO');
  return v.map(dataValida).filter((t) => t !== null && t > agora - JANELA_MS && t <= agora + 60000).sort((a, b) => a - b);
}

function linhaTrava(dono, agora, ttlMin) {
  return { chave: 'trava_deploy', valor: dono, expira_em: new Date(agora + ttlMin * 60000).toISOString() };
}

/* update_entities condicional: o servidor só grava se a linha ainda estiver livre, vencida ou for do mesmo dono.
   É a troca atômica (compare-and-set) da trava. 0 linhas alteradas = outro pegou antes: recue. */
function mcpPegar(dono, agora, linha) {
  return {
    ferramenta: 'mcp__Base44__update_entities',
    entityName: 'Operacao',
    query: { chave: 'trava_deploy', $or: [{ valor: '' }, { valor: null }, { valor: dono }, { expira_em: { $lte: new Date(agora).toISOString() } }] },
    data: { $set: { valor: linha.valor, expira_em: linha.expira_em } }
  };
}

/* ---------- decisões (puras) ---------- */

function pegar({ mapa, dono, agora, ttlMin = TTL_PADRAO_MIN }) {
  if (pausado(mapa, agora)) return { ok: false, acao: 'pegar', motivo: 'pausado', detalhe: 'Operacao.pausado está ligado: ninguém publica' };
  const t = lerTrava(mapa, agora);
  if (!t.livre && t.dono !== dono) return { ok: false, acao: 'pegar', motivo: 'trava_alheia', dono_atual: t.dono, expira_em: t.expira_em, sem_validade: !!t.sem_validade };
  const linha = linhaTrava(dono, agora, ttlMin);
  return { ok: true, acao: 'pegar', renovada: !t.livre && t.dono === dono, gravar: [linha], mcp: mcpPegar(dono, agora, linha), proximo: 'update_entities com "mcp" (só casa se a trava estiver livre, vencida ou for sua), reler Operacao e rodar "confirmar"' };
}

function confirmar({ mapa, dono, agora }) {
  const l = mapa.get('trava_deploy');
  const t = lerTrava(mapa, agora);
  if (l && l._repetida) return { ok: false, acao: 'confirmar', motivo: 'trava_duplicada', detalhe: 'há mais de uma linha trava_deploy; o coordenador apaga a sobra antes de qualquer deploy' };
  if (t.livre || t.dono !== dono) return { ok: false, acao: 'confirmar', motivo: t.livre ? 'trava_nao_gravada' : 'trava_alheia', dono_atual: t.dono || null };
  if (t.sem_validade) return { ok: false, acao: 'confirmar', motivo: 'trava_sem_validade' };
  return { ok: true, acao: 'confirmar', dono, expira_em: t.expira_em, resta_min: t.resta_min };
}

function podePublicar({ mapa, dono, agora, tipo, clienteReal = false, portoes = {}, apesarDaPausa = false }) {
  if (!TIPOS.includes(tipo)) throw new ErroEntrada(`--tipo precisa ser ${TIPOS.join(', ')}`);
  const faltas = [];
  const p = pausado(mapa, agora);
  if (p && !(tipo === 'remocao' && apesarDaPausa)) return { ok: false, acao: 'pode-publicar', motivo: 'pausado', detalhe: tipo === 'remocao' ? 'remoção durante a pausa só com --apesar-da-pausa (desistência: obrigação legal)' : 'Operacao.pausado está ligado' };
  const c = confirmar({ mapa, dono, agora });
  if (!c.ok) return Object.assign({}, c, { acao: 'pode-publicar' });
  if (c.resta_min < MARGEM_MIN) return { ok: false, acao: 'pode-publicar', motivo: 'trava_quase_vencida', resta_min: c.resta_min, detalhe: 'renove com "pegar" (mesmo dono) antes do deploy' };
  const recentes = deploysRecentes(mapa, agora);
  if (recentes.length >= TETO_HORA) {
    const libera = new Date(recentes[recentes.length - TETO_HORA] + JANELA_MS).toISOString();
    return { ok: false, acao: 'pode-publicar', motivo: 'teto_por_hora', deploys_na_hora: recentes.length, teto: TETO_HORA, libera_em: libera };
  }
  if (tipo === 'rascunho' || tipo === 'final') {
    for (const k of PORTOES_SITE) if (portoes[k] !== true) faltas.push(k);
    const e = mapa.get('ensaio_ok');
    if (clienteReal && !(vigente(e, agora) && dataValida(e.valor) !== null)) faltas.push('ensaio_ok');
  }
  if (tipo === 'dados') for (const k of PORTOES_DADOS) if (portoes[k] !== true) faltas.push(k);
  if (tipo === 'vitrine') for (const k of PORTOES_VITRINE) if (portoes[k] !== true) faltas.push(k);
  if (faltas.length) return { ok: false, acao: 'pode-publicar', motivo: 'portao', faltam: faltas };
  return { ok: true, acao: 'pode-publicar', tipo, dono, deploys_na_hora: recentes.length, teto: TETO_HORA, resta_min: c.resta_min, pausa_ignorada: p && tipo === 'remocao' ? true : undefined };
}

function registrarDeploy({ mapa, dono, agora }) {
  const c = confirmar({ mapa, dono, agora });
  if (!c.ok) return Object.assign({}, c, { acao: 'registrar-deploy' });
  const lista = deploysRecentes(mapa, agora).concat([agora]).sort((a, b) => a - b).map((t) => new Date(t).toISOString());
  return { ok: true, acao: 'registrar-deploy', deploys_na_hora: lista.length, gravar: [{ chave: 'deploys_ultima_hora', valor: JSON.stringify(lista), expira_em: new Date(agora + JANELA_MS).toISOString() }] };
}

function soltar({ mapa, dono, agora }) {
  const t = lerTrava(mapa, agora);
  if (t.livre) return { ok: true, acao: 'soltar', ja_livre: true, gravar: [] };
  if (t.dono !== dono) return { ok: false, acao: 'soltar', motivo: 'trava_alheia', dono_atual: t.dono, detalhe: 'nunca solte a trava de outro dono; ela vence sozinha' };
  const g = { chave: 'trava_deploy', valor: '', expira_em: new Date(agora).toISOString() };
  return { ok: true, acao: 'soltar', gravar: [g], mcp: { ferramenta: 'mcp__Base44__update_entities', entityName: 'Operacao', query: { chave: 'trava_deploy', valor: dono }, data: { $set: { valor: '', expira_em: g.expira_em } } } };
}

/* ---------- linha de comando ---------- */

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (!k.startsWith('--')) { o._.push(k); continue; }
    const v = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    o[k.slice(2)] = v;
  }
  return o;
}

function lerArquivoJson(caminho, nome) {
  if (typeof caminho !== 'string') throw new ErroEntrada(`--${nome} <arquivo.json> é obrigatório`);
  let txt;
  try { txt = fs.readFileSync(caminho, 'utf8'); } catch (e) { throw new ErroEntrada(`--${nome}: não consegui ler ${caminho}`); }
  try { return JSON.parse(txt); } catch (e) { throw new ErroEntrada(`--${nome}: ${caminho} não é JSON válido`); }
}

function executar(argv) {
  const a = args(argv);
  const acao = a._[0];
  if (a.ajuda || !acao) return { codigo: a.ajuda ? 0 : 1, saida: fs.readFileSync(__filename, 'utf8').split('*/')[0] };
  const ACOES = { pegar, confirmar, 'pode-publicar': podePublicar, 'registrar-deploy': registrarDeploy, soltar };
  if (!ACOES[acao]) throw new ErroEntrada(`ação desconhecida: ${acao}. Use pegar, confirmar, pode-publicar, registrar-deploy ou soltar.`);
  const dono = typeof a.dono === 'string' ? a.dono : '';
  if (!RE_DONO.test(dono)) throw new ErroEntrada('--dono precisa seguir ^[a-z0-9][A-Za-z0-9:._-]{2,79}$ (ex.: executor:2026-11-10T14:00)');
  const agora = a.agora === undefined ? Date.now() : dataValida(a.agora);
  if (agora === null) throw new ErroEntrada('--agora precisa ser data ISO');
  let ttlMin = TTL_PADRAO_MIN;
  if (a['ttl-min'] !== undefined) {
    ttlMin = Number(a['ttl-min']);
    if (!Number.isInteger(ttlMin) || ttlMin < 1 || ttlMin > TTL_MAX_MIN) throw new ErroEntrada(`--ttl-min precisa ser inteiro de 1 a ${TTL_MAX_MIN}`);
  }
  const mapa = linhasDe(lerArquivoJson(a.estado, 'estado'));
  const portoes = a.portoes === undefined ? {} : lerArquivoJson(a.portoes, 'portoes');
  if (!portoes || typeof portoes !== 'object' || Array.isArray(portoes)) throw new ErroEntrada('--portoes: esperava um objeto {portao: true|false}');
  const r = ACOES[acao]({ mapa, dono, agora, ttlMin, tipo: a.tipo, clienteReal: a['cliente-real'] === true, portoes, apesarDaPausa: a['apesar-da-pausa'] === true });
  return { codigo: r.ok ? 0 : 3, saida: JSON.stringify(r) };
}

if (require.main === module) {
  try {
    const r = executar(process.argv.slice(2));
    process.stdout.write(r.saida + '\n');
    process.exit(r.codigo);
  } catch (e) {
    if (e instanceof ErroEntrada) { process.stdout.write(JSON.stringify({ ok: false, acao: 'entrada', motivo: 'entrada_invalida', detalhe: e.message }) + '\n'); process.exit(1); }
    throw e;
  }
}

module.exports = { pegar, confirmar, podePublicar, registrarDeploy, soltar, linhasDe, lerTrava, pausado, deploysRecentes, executar, ErroEntrada,
  TTL_PADRAO_MIN, TETO_HORA, MARGEM_MIN, PORTOES_SITE, PORTOES_DADOS, PORTOES_VITRINE };
