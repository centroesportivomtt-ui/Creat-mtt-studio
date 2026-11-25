#!/usr/bin/env node
/*
 * .claude/hooks/papeis.cjs · os guardas dos papéis internos do executor do Porta Aberta · Trilho, 11/11/2026
 *
 * Papéis: leitor-pedido, redator-pedido e publicador-pedido (.claude/agents/). Doc: projetos/creat-nuvem/docs/EXECUTOR.md.
 * O mesmo script roda de dois lugares, com onFailure: block nos dois:
 *   - no frontmatter de cada papel (gancho do próprio subagente; só roda em pasta confiável);
 *   - em .claude/settings.json (roda também dentro de subagentes e em sessão -p, que conta como confiável).
 * As duas cópias decidem igual e são idempotentes: o limite de "uma chamada" é contado por tool_use_id.
 *
 * Uso: node papeis.cjs pre [papel]   (PreToolUse; sem papel, lê agent_type da entrada)
 *      node papeis.cjs post           (PostToolUse do Agent na sessão principal: troca a resposta fora da gramática)
 *      node papeis.cjs stop           (SubagentStop: o papel não termina com resposta fora da gramática)
 * Saída 2 = chamada recusada (o motivo vai no stderr, sem repetir o valor recebido). Saída 0 = segue.
 * Qualquer erro dentro de um papel sai 2: falha fechada.
 */
'use strict';
const fs = require('fs');
const p = require('path');
const os = require('os');
const cr = require('crypto');

const APP = '6aefffe66b684db9404b1994';
const PAPEIS = ['leitor-pedido', 'redator-pedido', 'publicador-pedido'];
const CAMPOS_TEXTO = ['pedido_id', 'plano', 'nicho', 'negocio', 'cidade', 'whatsapp', 'endereco', 'horarios', 'servicos_texto', 'aceite_em', 'termos_versao', 'utm_source', 'utm_campaign', 'utm_content'];
const LIMITE = { servicos_texto: 4000 };
const ID = /^PA-(?:[0-9A-HJKMNP-TV-Z]{8}|[0-9A-Z]{10})$/;
const ID_LIVRE = /^PA-[0-9A-Z]{8,10}$/;
// o slug de pedido do executor sai do id (EXECUTOR.md, passo (e), item 2): nada do texto do cliente no endereço
const SLUG = /^cliente-pa-[a-z0-9]{8,10}$/;
const DIR = /^cliente-pa-[a-z0-9]{8,10}--r-[a-z0-9]{12,32}$/;
const REL = /^(?:[a-z0-9_-]{1,40}\/)?[A-Za-z0-9_.-]{1,60}$/;
const GRAMATICA = {
  'leitor-pedido': /^(ok|falhou: [a-z_]{1,24})$/,
  'redator-pedido': /^ok$/,
  'publicador-pedido': /^(ok [0-9]{1,4}|falhou: [a-z_]{1,24})$/
};
const CHAVES_TEXTOS = ['pedido', 'bordao', 'pagina', 'servicos', 'textos'];

class Nao extends Error {}
const no = (m) => { throw new Nao(m); };
const so = (o, permitidas) => { for (const k of Object.keys(o || {})) if (!permitidas.includes(k)) no('parametro fora da lista: ' + k.replace(/[^A-Za-z0-9_]/g, '?').slice(0, 30)); };
const ehObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const nomeMcp = (t, f) => t === 'mcp__Base44__' + f || t === 'mcp__claude_ai_Base44__' + f;
// caminho real: segue links simbólicos até o ancestral que existe (arquivo novo dentro de pasta que é link também conta)
function real(x) {
  const a = p.resolve(x);
  try { return fs.realpathSync(a); } catch (e) {
    const pai = p.dirname(a);
    return pai === a ? a : p.join(real(pai), p.basename(a));
  }
}
const projeto = () => { const d = process.env.CLAUDE_PROJECT_DIR; if (!d) no('sem CLAUDE_PROJECT_DIR'); return real(d) + p.sep; };
const tmps = () => [...new Set([os.tmpdir(), '/tmp'].flatMap((x) => [p.resolve(x) + p.sep, real(x) + p.sep]))];

/* arquivo temporário: absoluto, normalizado, sob /tmp ou a pasta temporária, fora do repositório, sem link simbólico */
function caminhoTemporario(f) {
  if (typeof f !== 'string' || !p.isAbsolute(f) || p.normalize(f) !== f) no('caminho relativo ou com ..');
  const T = tmps(), proj = projeto(), dir = real(p.dirname(f)) + p.sep;
  if (!T.some((x) => f.startsWith(x)) || !T.some((x) => dir.startsWith(x))) no('fora da pasta temporaria');
  if (f.startsWith(proj) || dir.startsWith(proj)) no('dentro do repositorio');
  try { if (fs.lstatSync(f).isSymbolicLink()) no('link simbolico'); } catch (e) { if (e instanceof Nao) throw e; }
}

/* "uma chamada só" por execução do subagente: a vaga é um arquivo criado de forma atômica (link) com o tool_use_id.
   A segunda cópia do gancho (frontmatter + settings) da MESMA chamada acha o mesmo id e segue. */
function pastaEstado() {
  const base = fs.existsSync('/tmp') ? '/tmp' : os.tmpdir();
  const d = p.join(base, 'pa-papeis-' + (typeof process.getuid === 'function' ? process.getuid() : 'u'));
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
}
function vaga(j, nome, dado) {
  const ag = String(j.agent_id || ''), uso = String(j.tool_use_id || '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(ag)) no('sem agent_id');
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(uso)) no('sem tool_use_id');
  const d = pastaEstado(), alvo = p.join(d, `${ag}.${nome}`);
  const conteudo = uso + '\n' + (dado || '');
  const tmp = p.join(d, `${ag}.${nome}.${process.pid}.${cr.randomBytes(4).toString('hex')}`);
  fs.writeFileSync(tmp, conteudo, { mode: 0o600 });
  try { fs.linkSync(tmp, alvo); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    if (fs.readFileSync(alvo, 'utf8').split('\n')[0] !== uso) no('segunda chamada de ' + nome + ' nesta execucao');
  } finally { try { fs.unlinkSync(tmp); } catch (e) { /* já foi */ } }
}
function lerVaga(j, nome) {
  const ag = String(j.agent_id || '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(ag)) no('sem agent_id');
  try { return fs.readFileSync(p.join(pastaEstado(), `${ag}.${nome}`), 'utf8').split('\n')[1] || ''; } catch (e) { return null; }
}

function valoresDaLinha(o, id) {
  if (!ehObj(o)) no('conteudo nao e objeto');
  for (const [k, v] of Object.entries(o)) {
    if (!CAMPOS_TEXTO.includes(k)) no('chave fora de CAMPOS_TEXTO');
    if (v !== null && (typeof v !== 'string' || v.length > (LIMITE[k] || 2000))) no('valor fora do formato em ' + k);
  }
  if (o.pedido_id !== id) no('pedido_id do conteudo diferente do consultado');
}

function handback(papel, i) {
  so(i, ['message']);
  if (typeof i.message !== 'string' || !GRAMATICA[papel].test(i.message)) no('resposta fora da gramatica do papel');
}

const PRE = {
  'leitor-pedido'(t, i, j) {
    if (nomeMcp(t, 'query_entities')) {
      so(i, ['appId', 'entityName', 'query', 'fields', 'limit']);
      if (i.appId !== APP) no('app fora do Porta Aberta');
      if (i.entityName !== 'PedidoPortaAberta') no('entidade fora de PedidoPortaAberta');
      const q = i.query;
      if (!ehObj(q) || Object.keys(q).length !== 1 || typeof q.pedido_id !== 'string' || !ID.test(q.pedido_id)) no('filtro diferente de {pedido_id}');
      const f = i.fields;
      if (!Array.isArray(f) || !f.length || f.some((x) => !CAMPOS_TEXTO.includes(x)) || new Set(f).size !== f.length) no('fields fora de CAMPOS_TEXTO');
      if (i.limit !== 1) no('limit diferente de 1');
      return vaga(j, 'consulta', q.pedido_id);
    }
    if (t === 'Write') {
      so(i, ['file_path', 'content']);
      const f = i.file_path;
      caminhoTemporario(f);
      const id = lerVaga(j, 'consulta');
      if (!id) no('Write antes da consulta');
      if (p.basename(f) !== `linha-${id}.json`) no('nome de arquivo diferente de linha-<id consultado>.json');
      const s = i.content;
      if (typeof s !== 'string' || s.length > 32768) no('conteudo acima de 32 KB');
      let o; try { o = JSON.parse(s); } catch (e) { no('conteudo nao e JSON'); }
      valoresDaLinha(o, id);
      return vaga(j, 'escrita');
    }
    if (t === 'SubagentHandback') return handback('leitor-pedido', i);
    no('ferramenta fora do papel: ' + String(t).replace(/[^A-Za-z0-9_]/g, '?').slice(0, 60));
  },
  'redator-pedido'(t, i, j) {
    if (t === 'Read') {
      so(i, ['file_path', 'offset', 'limit']);
      const f = i.file_path;
      if (typeof f !== 'string' || !p.isAbsolute(f) || p.normalize(f) !== f) no('caminho relativo ou com ..');
      const r = real(f), m = /\/sites\/([a-z0-9-]{1,40})\/redator\.json$/.exec(f), mr = /\/sites\/([a-z0-9-]{1,40})\/redator\.json$/.exec(r);
      if (!m || !mr || m[1] !== mr[1] || !SLUG.test(m[1])) no('leitura fora de sites/cliente-<id>/redator.json');
      if (!(r.startsWith(projeto()) || tmps().some((x) => r.startsWith(x)))) no('redator.json fora do repositorio e da pasta temporaria');
      return vaga(j, 'leitura', m[1]);
    }
    if (t === 'Write') {
      so(i, ['file_path', 'content']);
      const f = i.file_path;
      caminhoTemporario(f);
      const mb = /^textos-(PA-[0-9A-Z]{8,10})\.json$/.exec(p.basename(f));
      if (!mb || !ID_LIVRE.test(mb[1])) no('nome de arquivo fora de textos-<id>.json');
      const slug = lerVaga(j, 'leitura');
      if (!slug) no('Write antes da leitura');
      if (/^cliente-pa-/.test(slug) && slug !== 'cliente-' + mb[1].toLowerCase()) no('textos de outro pedido');
      const s = i.content;
      if (typeof s !== 'string' || s.length > 65536) no('conteudo acima de 64 KB');
      let o; try { o = JSON.parse(s); } catch (e) { no('conteudo nao e JSON'); }
      if (!ehObj(o)) no('conteudo nao e objeto');
      so(o, CHAVES_TEXTOS);
      if (o.pedido !== mb[1]) no('pedido do conteudo diferente do nome do arquivo');
      return vaga(j, 'escrita');
    }
    if (t === 'SubagentHandback') return handback('redator-pedido', i);
    no('ferramenta fora do papel: ' + String(t).replace(/[^A-Za-z0-9_]/g, '?').slice(0, 60));
  },
  'publicador-pedido'(t, i) {
    const DIST = real(p.join(projeto(), 'projetos', 'creat-nuvem', 'dist')) + p.sep;
    if (t === 'Read') {
      so(i, ['file_path', 'offset', 'limit']);
      const f = i.file_path;
      if (typeof f !== 'string' || !p.isAbsolute(f) || p.normalize(f) !== f) no('caminho relativo ou com ..');
      const r = real(f);
      if (!r.startsWith(DIST)) no('leitura fora de dist/');
      const pasta = r.slice(DIST.length).split(p.sep)[0];
      if (!SLUG.test(pasta) && !DIR.test(pasta)) no('leitura fora de dist/cliente-<id>/');
      return;
    }
    if (nomeMcp(t, 'write_file')) {
      so(i, ['appId', 'path', 'content', 'overwrite']);
      if (i.appId !== APP) no('app fora do Porta Aberta');
      if (i.overwrite !== true) no('overwrite diferente de true');
      if (typeof i.content !== 'string' || !i.content.length) no('content ausente');
      const m = String(i.path || '').match(/^(public\/sites|porta-aberta\/obras)\/([^/]+)\/(.+)$/);
      if (!m || !DIR.test(m[2]) || !REL.test(m[3]) || m[3].split('/').some((x) => x === '..' || x === '.')) no('caminho fora de public/sites/<dir>/ ou porta-aberta/obras/<dir>/');
      if (m[3].startsWith('motor/')) no('motor/ sobe por cp no app, nao por write_file');
      const slug = m[2].split('--r-')[0];
      const raiz = m[1] === 'public/sites' ? p.join(DIST, m[2]) : p.join(DIST, slug);
      let igual;
      if (!real(raiz).startsWith(DIST)) no('pasta de origem fora de dist/');
      if (m[1] === 'porta-aberta/obras' && m[3] === 'MANIFESTO.sha256') {
        const L = [];
        const anda = (x, b) => { for (const n of fs.readdirSync(x).sort()) { const a = p.join(x, n), rr = b ? b + '/' + n : n; if (fs.lstatSync(a).isDirectory()) anda(a, rr); else L.push('./' + rr); } };
        anda(raiz, '');
        const esperado = L.map((rr) => cr.createHash('sha256').update(fs.readFileSync(p.join(raiz, rr))).digest('hex') + '  ' + rr).sort();
        igual = JSON.stringify(i.content.split('\n').filter(Boolean).sort()) === JSON.stringify(esperado);
      } else {
        const alvo = p.join(raiz, m[3]);
        if (!fs.existsSync(alvo)) no('arquivo que nao existe em dist/');
        const a = real(alvo);
        if (!a.startsWith(raiz + p.sep)) no('arquivo fora de dist/');
        igual = i.content === fs.readFileSync(a, 'utf8');
      }
      if (!igual) no('content diferente do arquivo em dist/ (byte a byte)');
      return;
    }
    if (t === 'SubagentHandback') return handback('publicador-pedido', i);
    no('ferramenta fora do papel: ' + String(t).replace(/[^A-Za-z0-9_]/g, '?').slice(0, 60));
  }
};

/* sessão principal: o Agent de um papel só sai com a mensagem exata do roteiro (EXECUTOR.md, passo (e) e P4.2) */
const MENSAGEM = {
  'leitor-pedido': (s) => { const m = /^pedido_id: (PA-[0-9A-Z]{8,10})\ncaminho: (\/[^\n]+)$/.exec(s); if (!m || !ID.test(m[1])) return false; caminhoTemporario(m[2]); return p.basename(m[2]) === `linha-${m[1]}.json`; },
  'redator-pedido': (s) => { const m = /^entrada: (\/[^\n]+\/sites\/([a-z0-9-]{1,40})\/redator\.json)\nsaida: (\/[^\n]+\/textos-(PA-[0-9A-Z]{8,10})\.json)$/.exec(s); if (!m || !SLUG.test(m[2])) return false; caminhoTemporario(m[3]); return true; },
  'publicador-pedido': (s) => {
    const m = /^dir: ([a-z0-9-]{1,80})\nslug: ([a-z0-9-]{1,40})\nraiz: (\/[^\n]+)$/.exec(s);
    return !!m && DIR.test(m[1]) && SLUG.test(m[2]) && m[1].split('--r-')[0] === m[2] && real(m[3]) + p.sep === real(p.join(projeto(), 'projetos', 'creat-nuvem', 'dist')) + p.sep;
  }
};
function preSessao(t, i) {
  if (t !== 'Agent' && t !== 'Task') return;
  const papel = i && i.subagent_type;
  if (!PAPEIS.includes(papel)) return;
  so(i, ['prompt', 'description', 'subagent_type', 'model', 'run_in_background']);
  if (typeof i.prompt !== 'string' || !MENSAGEM[papel](i.prompt)) no('mensagem ao ' + papel + ' fora do formato do roteiro');
  if (i.description !== undefined && (typeof i.description !== 'string' || i.description.length > 80)) no('description fora do formato');
  // em segundo plano a resposta do papel chega por notificação, sem passar pelo gancho post: só em primeiro plano
  if (i.run_in_background !== undefined && i.run_in_background !== false) no('papel so roda em primeiro plano (run_in_background: false)');
}

/* registro.log: uma linha por decisão (hora, papel, camada, ferramenta, decisão). Só nomes fixos, nenhum valor
   recebido: a sessão principal pode ler este arquivo no ENSAIO 3 para provar que as duas camadas rodaram. */
function registrar(papel, camada, ferramenta, decisao) {
  try {
    const limpo = (x) => String(x == null ? '' : x).replace(/[^A-Za-z0-9_ :.<>()/-]/g, '?').slice(0, 90);
    fs.appendFileSync(p.join(pastaEstado(), 'registro.log'), `${new Date().toISOString()} ${limpo(papel)} ${camada} ${limpo(ferramenta)} ${limpo(decisao)}\n`, { mode: 0o600 });
  } catch (e) { /* o registro nunca decide */ }
}

function lerEntrada() { const d = fs.readFileSync(0, 'utf8'); const j = JSON.parse(d); if (!ehObj(j)) no('entrada ilegivel'); return j; }

function textoDaResposta(r) {
  if (!ehObj(r) || !Array.isArray(r.content)) return null;
  const tx = r.content.filter((c) => c && c.type === 'text').map((c) => String(c.text));
  return tx.length === 1 && r.content.length === 1 ? tx[0].trim() : null;
}

function principal() {
  const [evento, papelArg] = process.argv.slice(2);
  let j;
  try { j = lerEntrada(); } catch (e) {
    // sem entrada legível não dá para saber de quem é a chamada: dentro de um papel, recusa; fora, o gancho do papel decide
    if (PAPEIS.includes(papelArg)) { process.stderr.write(`bloqueado pelo papel ${papelArg}: entrada ilegivel\n`); process.exit(2); }
    process.exit(evento === 'pre' ? 2 : 0);
  }
  const papel = PAPEIS.includes(papelArg) ? papelArg : PAPEIS.includes(j.agent_type) ? j.agent_type : null;
  if (papelArg && !PAPEIS.includes(papelArg)) { process.stderr.write('papel desconhecido\n'); process.exit(2); }
  if (papelArg && j.agent_type && j.agent_type !== papelArg) { process.stderr.write(`bloqueado pelo papel ${papelArg}: agent_type diferente\n`); process.exit(2); }

  if (evento === 'pre') {
    const camada = papelArg ? 'frontmatter' : 'settings';
    const ehDoPapel = !!papel || (!j.agent_type && ehObj(j.tool_input) && PAPEIS.includes(j.tool_input.subagent_type));
    try {
      if (papel) PRE[papel](j.tool_name, ehObj(j.tool_input) ? j.tool_input : {}, j);
      else if (!j.agent_type) preSessao(j.tool_name, ehObj(j.tool_input) ? j.tool_input : {});
      if (ehDoPapel) registrar(papel || 'sessao:' + j.tool_input.subagent_type, camada, j.tool_name, 'segue');
      process.exit(0);
    } catch (e) {
      const m = e instanceof Nao ? e.message : 'erro no gancho';
      registrar(papel || 'sessao', camada, j.tool_name, 'bloqueado: ' + m);
      process.stderr.write(`bloqueado pelo papel ${papel || 'executor'}: ${m}\n`);
      process.exit(2);
    }
  }
  if (evento === 'post') {
    // só a sessão principal, só o Agent de um papel: a resposta tem de seguir a gramática, senão é trocada
    const i = ehObj(j.tool_input) ? j.tool_input : {};
    if (j.agent_type || !PAPEIS.includes(i.subagent_type) || (j.tool_name !== 'Agent' && j.tool_name !== 'Task')) process.exit(0);
    const r = j.tool_response;
    const tx = textoDaResposta(r);
    const ok = ehObj(r) && r.status === 'completed' && tx !== null && GRAMATICA[i.subagent_type].test(tx);
    if (ok) process.exit(0);
    const troca = ehObj(r) && r.status === 'async_launched' ? 'falhou: segundo_plano' : 'falhou: resposta_invalida';
    const novo = Object.assign({}, ehObj(r) ? r : {}, { content: [{ type: 'text', text: troca }] });
    delete novo.prompt; delete novo.description;
    process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', updatedToolOutput: novo } }) + '\n');
    process.exit(0);
  }
  if (evento === 'stop') {
    if (!papel) process.exit(0);
    const msg = String(j.last_assistant_message == null ? '' : j.last_assistant_message).trim();
    if (GRAMATICA[papel].test(msg) || j.stop_hook_active) process.exit(0);
    process.stdout.write(JSON.stringify({ decision: 'block', reason: 'A resposta final tem de ser exatamente uma linha da lista do seu papel, sem mais nada. Responda de novo só com essa linha.' }) + '\n');
    process.exit(0);
  }
  process.stderr.write('evento desconhecido\n');
  process.exit(2);
}

principal();
