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
 *   chave "pausado"              parada geral. Valor "sim" (ou "true", "1", "pausado", sem diferença de maiúscula e
 *                                espaço) e não vencida = nada publica. Com linhas repetidas, BASTA UMA ligada:
 *                                o botão de parar nunca depende da ordem em que as linhas chegam.
 *   chave "deploys_ultima_hora"  valor = JSON com a lista dos horários ISO dos deploys dos últimos 60 min.
 *                                Teto: 3 deploys por hora, contando todos os donos.
 *   chave "deploys_remocao"      valor = JSON [{em, pedido?}] das remoções (desistência e pedido do titular), para
 *                                auditoria, por 400 dias. Decisão D4 (coordenador, 10/11/2026): --tipo remocao NÃO
 *                                conta contra o teto nem espera por ele (a remoção sai no mesmo despertar em que a
 *                                desistência é lida); continua exigindo a trava. --tipo rollback (P8 de EXECUTOR.md)
 *                                também não espera o teto, mas entra na conta da hora (os deploys seguintes esperam).
 *   chave "ensaio_ok"            data ISO gravada pelo coordenador quando o ENSAIO de docs/EXECUTOR.md
 *                                passou inteiro. Sem ela, NENHUM rascunho nem site final vai ao ar (padrão fechado).
 *   chave "ensaio_pedido"        id do pedido de teste do ensaio em curso (PA-...), com expira_em obrigatório,
 *                                gravado pelo coordenador no passo 1 do ENSAIO e apagado no passo 12. Só com ela
 *                                --ensaio --pedido <o mesmo id> dispensa o ensaio_ok. Sem ela, --ensaio é recusado.
 *
 * Uso (pasta projetos/creat-nuvem). <estado.json> = a lista de linhas de Operacao lida pelo MCP
 * (array de objetos com chave, valor, expira_em; pode vir como {"records":[...]} ou {"data":[...]}):
 *   node scripts/trava-deploy.cjs pegar        --dono <dono> --estado <estado.json>
 *   node scripts/trava-deploy.cjs confirmar    --dono <dono> --estado <estado relido depois de gravar>
 *   node scripts/trava-deploy.cjs pode-publicar --dono <dono> --estado <estado.json> --tipo rascunho|final|remocao|rollback|dados|vitrine
 *                                              [--portoes <portoes.json>] [--ensaio --pedido <PA-id>] [--apesar-da-pausa]
 *     remocao e rollback: sem teto e sem portão; com a pausa ligada, só com --apesar-da-pausa.
 *     Padrão FECHADO: rascunho e final exigem ensaio_ok. Só o ensaio (prompt "MODO: ensaio") passa --ensaio.
 *     --cliente-real é aceito e não muda nada (era o opt-in antigo; hoje todo site é tratado como de cliente real).
 *     --ensaio, --cliente-real, --apesar-da-pausa e --ajuda são chaves sem valor: "--ensaio sim" é recusado (código 1).
 *   node scripts/trava-deploy.cjs registrar-deploy --dono <dono> --estado <estado.json> [--tipo <tipo>] [--pedido <PA-id>]
 *     sem --tipo ou com qualquer tipo menos remocao: entra em deploys_ultima_hora (conta no teto).
 *     --tipo remocao: entra só em deploys_remocao (auditoria), com o --pedido quando houver.
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
const TIPOS = ['rascunho', 'final', 'remocao', 'rollback', 'dados', 'vitrine'];
// D4 (10/11/2026): estes tipos não esperam o teto por hora
const FORA_DO_TETO = new Set(['remocao', 'rollback']);
const AUDITORIA_DIAS = 400;
const AUDITORIA_MAX = 200;
const PAUSA_ATIVA = ['sim', 'true', '1', 'pausado'];
const RE_PEDIDO = /^PA-[0-9A-Z]{10}$/;
// chaves sem valor: nunca engolem o argumento seguinte
const BOOLEANOS = new Set(['ensaio', 'cliente-real', 'apesar-da-pausa', 'ajuda']);
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
  // todas as linhas de cada chave, para as regras que não podem depender de qual linha "venceu" (pausado)
  const todas = new Map();
  Object.defineProperty(mapa, 'todas', { value: todas, enumerable: false });
  for (const r of l) {
    if (!r || typeof r !== 'object' || typeof r.chave !== 'string') continue;
    vistas.set(r.chave, (vistas.get(r.chave) || 0) + 1);
    if (!todas.has(r.chave)) todas.set(r.chave, []);
    todas.get(r.chave).push(Object.assign({}, r));
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

function pausaLigada(l, agora) {
  if (!l || !vigente(l, agora)) return false;
  return PAUSA_ATIVA.includes(String(l.valor == null ? '' : l.valor).trim().toLowerCase());
}

/* falha fechada: QUALQUER linha viva de "pausado" ligada pausa tudo, seja qual for a ordem das linhas.
   (Duplicata nasce de corrida em gravarOperacao ou de linha criada à mão no painel.) */
function pausado(mapa, agora) {
  const linhas = (mapa.todas && mapa.todas.get('pausado')) || (mapa.get('pausado') ? [mapa.get('pausado')] : []);
  return linhas.some((l) => pausaLigada(l, agora));
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

/* ensaio em curso: Operacao.ensaio_pedido vigente, COM validade, e igual ao pedido passado em --pedido */
function ensaioValido(mapa, agora, pedido) {
  if (typeof pedido !== 'string' || !RE_PEDIDO.test(pedido)) return { ok: false, motivo: 'ensaio_sem_pedido' };
  const l = mapa.get('ensaio_pedido');
  if (!l || dataValida(l.expira_em) === null || !vigente(l, agora)) return { ok: false, motivo: 'ensaio_nao_aberto' };
  if (l._repetida) return { ok: false, motivo: 'ensaio_duplicado' };
  if (String(l.valor == null ? '' : l.valor).trim() !== pedido) return { ok: false, motivo: 'ensaio_outro_pedido' };
  return { ok: true };
}

function podePublicar({ mapa, dono, agora, tipo, ensaio = false, pedido, portoes = {}, apesarDaPausa = false }) {
  if (!TIPOS.includes(tipo)) throw new ErroEntrada(`--tipo precisa ser ${TIPOS.join(', ')}`);
  const faltas = [];
  const p = pausado(mapa, agora);
  const excecaoPausa = FORA_DO_TETO.has(tipo);
  if (p && !(excecaoPausa && apesarDaPausa)) return { ok: false, acao: 'pode-publicar', motivo: 'pausado', detalhe: tipo === 'remocao' ? 'remoção durante a pausa só com --apesar-da-pausa (desistência: obrigação legal)' : tipo === 'rollback' ? 'rollback durante a pausa só com --apesar-da-pausa (decisão do coordenador)' : 'Operacao.pausado está ligado' };
  const c = confirmar({ mapa, dono, agora });
  if (!c.ok) return Object.assign({}, c, { acao: 'pode-publicar' });
  if (c.resta_min < MARGEM_MIN) return { ok: false, acao: 'pode-publicar', motivo: 'trava_quase_vencida', resta_min: c.resta_min, detalhe: 'renove com "pegar" (mesmo dono) antes do deploy' };
  const recentes = deploysRecentes(mapa, agora);
  if (recentes.length >= TETO_HORA && !FORA_DO_TETO.has(tipo)) {
    const libera = new Date(recentes[recentes.length - TETO_HORA] + JANELA_MS).toISOString();
    return { ok: false, acao: 'pode-publicar', motivo: 'teto_por_hora', deploys_na_hora: recentes.length, teto: TETO_HORA, libera_em: libera };
  }
  if (tipo === 'rascunho' || tipo === 'final') {
    for (const k of PORTOES_SITE) if (portoes[k] !== true) faltas.push(k);
    if (ensaio) {
      // o ensaio roda ANTES de existir ensaio_ok; ele só vale para o pedido de teste aberto pelo coordenador
      const ev = ensaioValido(mapa, agora, pedido);
      if (!ev.ok) faltas.push(ev.motivo);
    } else {
      const e = mapa.get('ensaio_ok');
      if (!(e && vigente(e, agora) && dataValida(e.valor) !== null)) faltas.push('ensaio_ok');
    }
  }
  if (tipo === 'dados') for (const k of PORTOES_DADOS) if (portoes[k] !== true) faltas.push(k);
  if (tipo === 'vitrine') for (const k of PORTOES_VITRINE) if (portoes[k] !== true) faltas.push(k);
  if (faltas.length) return { ok: false, acao: 'pode-publicar', motivo: 'portao', faltam: faltas };
  return { ok: true, acao: 'pode-publicar', tipo, dono, ensaio: ensaio && (tipo === 'rascunho' || tipo === 'final') ? true : undefined, deploys_na_hora: recentes.length, teto: TETO_HORA, resta_min: c.resta_min,
    fora_do_teto: FORA_DO_TETO.has(tipo) ? true : undefined, teto_ignorado: FORA_DO_TETO.has(tipo) && recentes.length >= TETO_HORA ? true : undefined, pausa_ignorada: p && excecaoPausa ? true : undefined };
}

/* deploys_remocao: lista de auditoria [{em, pedido?}] dos últimos 400 dias (no máximo 200 itens) */
function remocoesRegistradas(mapa, agora) {
  const l = mapa.get('deploys_remocao');
  if (!l || l.valor == null || l.valor === '') return [];
  let v;
  try { v = typeof l.valor === 'string' ? JSON.parse(l.valor) : l.valor; } catch (e) { throw new ErroEntrada('deploys_remocao: valor não é JSON; corrija a linha (é a auditoria das remoções) antes de registrar'); }
  if (!Array.isArray(v)) throw new ErroEntrada('deploys_remocao: valor precisa ser uma lista [{em, pedido?}]');
  const limite = agora - AUDITORIA_DIAS * 24 * 60 * 60 * 1000;
  return v.filter((x) => x && dataValida(x.em) !== null && dataValida(x.em) > limite).map((x) => (x.pedido ? { em: x.em, pedido: x.pedido } : { em: x.em }));
}

function registrarDeploy({ mapa, dono, agora, tipo, pedido }) {
  const c = confirmar({ mapa, dono, agora });
  if (!c.ok) return Object.assign({}, c, { acao: 'registrar-deploy' });
  if (tipo !== undefined && !TIPOS.includes(tipo)) throw new ErroEntrada(`--tipo precisa ser ${TIPOS.join(', ')}`);
  if (tipo === 'remocao') {
    // D4: a remoção não entra em deploys_ultima_hora; fica registrada à parte, para auditoria
    const item = Object.assign({ em: new Date(agora).toISOString() }, pedido ? { pedido } : {});
    const lista = remocoesRegistradas(mapa, agora).concat([item]).slice(-AUDITORIA_MAX);
    return { ok: true, acao: 'registrar-deploy', tipo, fora_do_teto: true, deploys_na_hora: deploysRecentes(mapa, agora).length, remocoes_registradas: lista.length,
      gravar: [{ chave: 'deploys_remocao', valor: JSON.stringify(lista), expira_em: new Date(agora + AUDITORIA_DIAS * 24 * 60 * 60 * 1000).toISOString() }] };
  }
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
    const nome = k.slice(2);
    if (BOOLEANOS.has(nome)) { o[nome] = true; continue; }
    const v = argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    o[nome] = v;
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
  // argumento solto a mais (ex.: "--ensaio sim", "--cliente-real 1"): recusa em vez de adivinhar
  if (a._.length > 1) throw new ErroEntrada(`argumento a mais: ${a._.slice(1).join(' ')}. --ensaio, --cliente-real e --apesar-da-pausa não levam valor.`);
  if (a.pedido !== undefined && (typeof a.pedido !== 'string' || !RE_PEDIDO.test(a.pedido))) throw new ErroEntrada('--pedido precisa ser o id PA- com 10 caracteres');
  if (a.ensaio === true && acao === 'pode-publicar' && a.pedido === undefined) throw new ErroEntrada('--ensaio exige --pedido <id do pedido de teste>');
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
  if (acao === 'registrar-deploy' && a.tipo !== undefined && (typeof a.tipo !== 'string' || !TIPOS.includes(a.tipo))) throw new ErroEntrada(`--tipo precisa ser ${TIPOS.join(', ')}`);
  const r = ACOES[acao]({ mapa, dono, agora, ttlMin, tipo: a.tipo, ensaio: a.ensaio === true, pedido: a.pedido, portoes, apesarDaPausa: a['apesar-da-pausa'] === true });
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

module.exports = { pegar, confirmar, podePublicar, registrarDeploy, soltar, linhasDe, lerTrava, pausado, ensaioValido, deploysRecentes, remocoesRegistradas, executar, args, ErroEntrada,
  TTL_PADRAO_MIN, TETO_HORA, MARGEM_MIN, PORTOES_SITE, PORTOES_DADOS, PORTOES_VITRINE, FORA_DO_TETO };
