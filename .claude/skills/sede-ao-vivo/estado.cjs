#!/usr/bin/env node
// Lê os diários dos fluxos de trabalho do Claude Code e gera o estado real da
// agência: quem está trabalhando, em quê, há quanto tempo e quantos tokens.
// É isso que a sede 3D mostra no modo "ao vivo".
//
//   node .claude/skills/sede-ao-vivo/estado.cjs [--saida arquivo.json] [--raiz pasta] [--horas 12]
//
// Procura journal.jsonl em <raiz>/**/subagents/workflows/wf_*/ (raiz padrão: ~/.claude/projects).
const fs = require('fs'), path = require('path'), os = require('os');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const raiz = opt('--raiz', path.join(os.homedir(), '.claude', 'projects'));
const saida = opt('--saida', null);
const horas = Number(opt('--horas', 12));
const agora = Date.now();

// Rótulo do agente no fluxo → personagem da sede.
const MAPA = [
  [/^(nimbus|juri|diretor)/, 'diretor'], [/^(faisca|criativo|critico)/, 'criativo'], [/^(cirro|arquiteto)/, 'arquiteto'],
  [/^(pixel|frontend)/, 'frontend'], [/^(forja|backend)/, 'backend'], [/^(paleta|designer)/, 'designer'],
  [/^(orbita|motion)/, 'motion-3d'], [/^(prisma|shader)/, 'shader'], [/^(eco|som)/, 'som'],
  [/^(verbo|copy)/, 'copywriter'], [/^(radar|pesquisador|refuta)/, 'pesquisador'], [/^(crivo|revisor|verifica)/, 'revisor'],
  [/^(lupa|qa)/, 'qa'], [/^(muralha|seguranca)/, 'seguranca'], [/^(trilho|devops)/, 'devops'],
];
const paraPersonagem = (label, meta) => {
  if (meta && meta.agentType && MAPA.some(([, id]) => id === meta.agentType)) return meta.agentType;
  const l = (label || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  for (const [re, id] of MAPA) if (re.test(l)) return id;
  return 'diretor';
};

// Descrição curta da última ação do agente, a partir do transcript dele.
function ultimaAcao(arq) {
  let acao = null, inicio = null, fim = null, tokens = 0, ferramentas = 0;
  try {
    const txt = fs.readFileSync(arq, 'utf8');
    for (const linha of txt.split('\n')) {
      if (!linha) continue;
      let j; try { j = JSON.parse(linha); } catch { continue; }
      const ts = j.timestamp ? Date.parse(j.timestamp) : null;
      if (ts) { if (!inicio) inicio = ts; fim = ts; }
      if (j.type !== 'assistant') continue;
      const m = j.message || {};
      if (m.usage) tokens += (m.usage.output_tokens || 0) + (m.usage.input_tokens || 0) + (m.usage.cache_creation_input_tokens || 0);
      for (const c of (m.content || [])) {
        if (c.type !== 'tool_use') continue;
        ferramentas++;
        const i = c.input || {};
        const arqCurto = p => p ? String(p).replace(/^.*\/(projetos|sede|\.claude)\//, '$1/').split('/').slice(-2).join('/') : '';
        switch (c.name) {
          case 'Read': acao = 'lendo ' + arqCurto(i.file_path); break;
          case 'Edit': case 'Write': acao = 'escrevendo ' + arqCurto(i.file_path); break;
          case 'Grep': case 'Glob': acao = 'procurando no código'; break;
          case 'Bash': acao = /navegar\.cjs/.test(i.command || '') ? 'testando no navegador' : /olhar\.cjs/.test(i.command || '') ? 'tirando prints' : /git /.test(i.command || '') ? 'olhando o git' : 'rodando comandos'; break;
          case 'WebSearch': acao = 'pesquisando: ' + String(i.query || '').slice(0, 48); break;
          case 'WebFetch': acao = 'lendo ' + String(i.url || '').replace(/^https?:\/\//, '').split('/')[0]; break;
          case 'StructuredOutput': acao = 'fechando o relatório'; break;
          case 'Skill': acao = 'usando a skill ' + (i.skill || ''); break;
          case 'ToolSearch': break;
          default: acao = c.name.startsWith('mcp__') ? 'usando ' + c.name.split('__')[1] : c.name;
        }
      }
    }
  } catch {}
  return { acao, inicio, fim, tokens, ferramentas };
}

function lerFluxo(dir) {
  const jp = path.join(dir, 'journal.jsonl');
  if (!fs.existsSync(jp)) return null;
  const agentes = new Map();
  let terminou = false;
  for (const linha of fs.readFileSync(jp, 'utf8').split('\n')) {
    if (!linha) continue;
    let j; try { j = JSON.parse(linha); } catch { continue; }
    if (j.type === 'started') agentes.set(j.key, { id: j.agentId, label: j.label || '', fase: j.phase || '', status: 'trabalhando' });
    if (j.type === 'result' && agentes.has(j.key)) agentes.get(j.key).status = j.result === null ? 'falhou' : 'feito';
    if (j.type === 'completed' || j.type === 'finished' || j.type === 'error') terminou = true;
  }
  const lista = [];
  for (const a of agentes.values()) {
    let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(dir, `agent-${a.id}.meta.json`), 'utf8')); } catch {}
    const u = ultimaAcao(path.join(dir, `agent-${a.id}.jsonl`));
    // Sem resultado e sem sinal de vida há 10 min: foi interrompido (cota, erro), não está trabalhando.
    if (a.status === 'trabalhando' && (u.fim ? agora - u.fim : agora - (u.inicio || 0)) > 10 * 60 * 1000) a.status = 'interrompido';
    lista.push({
      id: a.id, label: a.label, fase: a.fase, status: a.status, personagem: paraPersonagem(a.label, meta), tipo: meta.agentType || null,
      acao: a.status === 'trabalhando' ? (u.acao || 'pensando') : null,
      inicio: u.inicio, fim: a.status === 'trabalhando' ? null : u.fim, tokens: u.tokens, ferramentas: u.ferramentas,
      segundos: u.inicio ? Math.round(((a.status === 'trabalhando' ? agora : (u.fim || agora)) - u.inicio) / 1000) : null,
    });
  }
  const ultimo = Math.max(0, ...lista.map(a => a.fim || a.inicio || 0));
  const emAndamento = lista.some(a => a.status === 'trabalhando');
  if (!emAndamento && agora - ultimo > 20 * 60 * 1000) terminou = true;
  const fases = [];
  for (const a of lista) { let f = fases.find(x => x.nome === a.fase); if (!f) { f = { nome: a.fase, total: 0, feitos: 0, trabalhando: 0 }; fases.push(f); } f.total++; if (a.status === 'feito') f.feitos++; if (a.status === 'trabalhando') f.trabalhando++; }
  let nome = path.basename(dir), descricao = '';
  try { const scripts = fs.readdirSync(path.join(dir, '..', '..', '..', 'workflows', 'scripts')).filter(f => f.includes(path.basename(dir))); if (scripts[0]) { const s = fs.readFileSync(path.join(dir, '..', '..', '..', 'workflows', 'scripts', scripts[0]), 'utf8'); nome = (s.match(/name:\s*'([^']+)'/) || [, nome])[1]; descricao = (s.match(/description:\s*'([^']+)'/) || [, ''])[1]; } } catch {}
  return {
    id: path.basename(dir), nome, descricao, terminou, em_andamento: emAndamento,
    inicio: Math.min(...lista.map(a => a.inicio || agora)), ultimo_evento: ultimo,
    tokens: lista.reduce((n, a) => n + a.tokens, 0), fases, agentes: lista,
  };
}

function acharFluxos(base) {
  const out = [];
  const anda = (d, prof) => {
    if (prof > 6) return;
    let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      const p = path.join(d, e.name);
      if (/^wf_/.test(e.name) && fs.existsSync(path.join(p, 'journal.jsonl'))) out.push(p);
      else if (e.name === 'workflows' || e.name === 'subagents' || prof < 3) anda(p, prof + 1);
    }
  };
  anda(base, 0);
  return out;
}

const fluxos = acharFluxos(raiz).map(lerFluxo).filter(Boolean)
  .filter(f => agora - f.ultimo_evento < horas * 3600 * 1000)
  .sort((a, b) => b.ultimo_evento - a.ultimo_evento);

const trabalhando = {};
for (const f of fluxos) for (const a of f.agentes) if (a.status === 'trabalhando') (trabalhando[a.personagem] = trabalhando[a.personagem] || []).push({ fluxo: f.nome, label: a.label, acao: a.acao, segundos: a.segundos });

const estado = {
  atualizado: new Date(agora).toISOString(),
  total_trabalhando: Object.values(trabalhando).reduce((n, l) => n + l.length, 0),
  personagens: trabalhando,
  fluxos: fluxos.map(f => ({ ...f, agentes: f.agentes.map(a => ({ label: a.label, fase: a.fase, status: a.status, personagem: a.personagem, acao: a.acao, segundos: a.segundos, tokens: a.tokens })) })),
};
const json = JSON.stringify(estado);
if (saida) { fs.writeFileSync(saida, json); console.error(`estado salvo em ${saida}: ${fluxos.length} fluxo(s), ${estado.total_trabalhando} trabalhando`); }
else process.stdout.write(json);
