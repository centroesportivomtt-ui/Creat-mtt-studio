#!/usr/bin/env node
// Porta Aberta (T6): transforma o estado interno da agência no estado PÚBLICO da sede.
// O público só vê (personagem, status) e uma frase de vocabulário fechado. Nada de texto
// livre do estado interno chega à saída: sem caminhos, rótulos, nomes de fluxo, tokens, clientes.
//
//   node sede/publicar-estado.cjs                  roda .claude/skills/sede-ao-vivo/estado.cjs e grava sede/estado-publico.json
//   node sede/publicar-estado.cjs --entrada x.json usa um estado interno já gerado
//   node sede/publicar-estado.cjs --saida y.json   outro destino
//   node sede/publicar-estado.cjs --exemplo        regrava sede/estado-publico.exemplo.json (fixo, sem rede)
//   node sede/publicar-estado.cjs --autoteste      teste sem rede; código 1 se algo vazar
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const RAIZ = __dirname;
const GERADOR = path.join(RAIZ, '..', '.claude', 'skills', 'sede-ao-vivo', 'estado.cjs');

// Tabela fechada (docs/CONTRATOS-DETALHE.md, anexo i). Única fonte das frases públicas.
const FRASE = {
  diretor: 'organizando a fila', criativo: 'pensando o conceito', arquiteto: 'desenhando a estrutura',
  frontend: 'montando a página', backend: 'ligando os sistemas', designer: 'escolhendo as cores',
  'motion-3d': 'animando os detalhes', shader: 'criando os efeitos', som: 'afinando os sons',
  copywriter: 'escrevendo os textos', pesquisador: 'conferindo os dados', revisor: 'revisando o código',
  qa: 'testando no celular', seguranca: 'conferindo segurança', devops: 'publicando',
};
const ORDEM = Object.keys(FRASE);
const FRASE_STATUS = { feito: 'terminou a parte dele', esperando: 'na fila' };
const SEM_FLUXO = 'A equipe espera o próximo pedido.';
const COM_FLUXO = 'A equipe está trabalhando agora.';
// Fluxo cujo script se chama pedido*/producao* é pedido de cliente; o resto é interno.
// Só decide entre os dois rótulos fixos; o nome original nunca é copiado.
const E_PEDIDO = /^(pedido|producao|produ[cç][aã]o)/i;

function publicar(interno) {
  const fluxos = [];
  for (const f of (interno && Array.isArray(interno.fluxos) ? interno.fluxos : [])) {
    if (!f || f.em_andamento !== true) continue;
    const por = new Map();
    for (const a of (Array.isArray(f.agentes) ? f.agentes : [])) {
      if (!a || !Object.prototype.hasOwnProperty.call(FRASE, a.personagem)) continue;
      const st = a.status === 'trabalhando' ? 'trabalhando' : a.status === 'feito' ? 'feito' : null; // falhou/interrompido: fora
      if (!st) continue;
      const atual = por.get(a.personagem);
      if (!atual || st === 'trabalhando') por.set(a.personagem, st);
    }
    // quem do roteiro padrão ainda não entrou aparece "na fila"? Não: só mostramos o que aconteceu.
    const agentes = ORDEM.filter(p => por.has(p)).map(p => {
      const status = por.get(p);
      return { personagem: p, status, frase: status === 'trabalhando' ? FRASE[p] : FRASE_STATUS[status] };
    });
    if (!agentes.some(a => a.status === 'trabalhando')) continue;
    fluxos.push({ nome: E_PEDIDO.test(String(f.nome || '')) ? 'Pedido da Creat' : 'Projeto interno', em_andamento: true, agentes });
    if (fluxos.length === 3) break;
  }
  const t = Date.parse(interno && interno.atualizado);
  return {
    versao: 1,
    atualizado_em: new Date(Number.isFinite(t) ? t : Date.now()).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    mensagem: fluxos.length ? COM_FLUXO : SEM_FLUXO,
    fluxos,
  };
}

// Verificação do resultado: falha se houver qualquer coisa fora do vocabulário.
const PROIBIDO = ['/', '\\', '.cjs', '.js', '.json', 'scratchpad', 'tokens', 'token', 'wf_', 'agencia', 'journal', 'http', ':'];
function conferir(pub, interno) {
  const erros = [];
  const json = JSON.stringify(pub);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(pub.atualizado_em || '')) erros.push('atualizado_em');
  // todos os valores de texto, menos a data, mais as chaves: nada da lista proibida
  const textos = [];
  const varre = (v, k) => { if (typeof v === 'string') { if (k !== 'atualizado_em') textos.push(v); } else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) { textos.push(kk); varre(vv, kk); } };
  varre(pub);
  for (const p of PROIBIDO) if (textos.some(t => t.toLowerCase().includes(p))) erros.push(`contém "${p}"`);
  const CHAVES = new Set(['versao', 'atualizado_em', 'mensagem', 'fluxos', 'nome', 'em_andamento', 'agentes', 'personagem', 'status', 'frase']);
  for (const t of textos) if (/^[a-z_]+$/.test(t) && !CHAVES.has(t) && !FRASE[t] && !['trabalhando', 'feito', 'esperando'].includes(t) && json.includes(`"${t}":`)) erros.push(`chave inesperada ${t}`);
  const frases = new Set([...Object.values(FRASE), ...Object.values(FRASE_STATUS)]);
  if (pub.versao !== 1) erros.push('versao');
  if (![SEM_FLUXO, COM_FLUXO].includes(pub.mensagem)) erros.push('mensagem fora da tabela');
  for (const f of pub.fluxos) {
    if (!['Pedido da Creat', 'Projeto interno'].includes(f.nome)) erros.push('nome de fluxo fora da tabela');
    for (const a of f.agentes) {
      if (!FRASE[a.personagem]) erros.push('personagem desconhecido');
      if (!['trabalhando', 'feito', 'esperando'].includes(a.status)) erros.push('status');
      if (!frases.has(a.frase)) erros.push('frase fora da tabela');
    }
  }
  // nenhum texto livre do interno pode reaparecer
  if (interno) for (const f of interno.fluxos || []) {
    const livres = [f.nome, f.descricao, f.id, ...(f.fases || []).map(x => x.nome), ...(f.agentes || []).flatMap(a => [a.label, a.acao, a.fase])];
    for (const s of livres) if (s && String(s).length > 3 && !frases.has(s) && json.includes(String(s))) erros.push(`texto interno vazou: ${String(s).slice(0, 20)}`);
  }
  return erros;
}

// Estado interno fictício, no formato de estado.cjs, cheio de coisas que NÃO podem vazar.
function internoFicticio() {
  return {
    atualizado: '2026-11-08T14:30:00.000Z', total_trabalhando: 3,
    personagens: { copywriter: [{ fluxo: 'agencia', label: 'verbo:textos', acao: 'escrevendo projetos/barbearia-do-joao/index.html', segundos: 90 }] },
    fluxos: [
      { id: 'wf_abc123-999', nome: 'pedido-barbearia-do-joao', descricao: 'Site da Barbearia do João, Rua das Flores 12, (11) 99999-0000', terminou: false, em_andamento: true, tokens: 8981219,
        fases: [{ nome: 'Construção', total: 3, feitos: 1, trabalhando: 2 }],
        agentes: [
          { label: 'nimbus:plano', fase: 'Plano', status: 'feito', personagem: 'diretor', acao: null, segundos: 120, tokens: 50000 },
          { label: 'verbo:textos-joao', fase: 'Construção', status: 'trabalhando', personagem: 'copywriter', acao: 'escrevendo /tmp/scratchpad/joao.md', segundos: 90, tokens: 120000 },
          { label: 'paleta:cores', fase: 'Construção', status: 'trabalhando', personagem: 'designer', acao: 'lendo .claude/skills/x.cjs', segundos: 80, tokens: 90000 },
          { label: 'lupa:celular', fase: 'QA', status: 'interrompido', personagem: 'qa', acao: null, segundos: 10, tokens: 1 },
          { label: '<script>alert(1)</script>', fase: 'X', status: 'trabalhando', personagem: 'hacker', acao: 'rm -rf /', segundos: 1, tokens: 1 },
        ] },
      { id: 'wf_def', nome: 'rotas-de-dinheiro', descricao: 'Pesquisa interna', terminou: false, em_andamento: true, tokens: 1,
        fases: [], agentes: [{ label: 'radar:bounties', fase: 'Pesquisa', status: 'trabalhando', personagem: 'pesquisador', acao: 'pesquisando: concorrente X', segundos: 5, tokens: 10 }] },
      { id: 'wf_old', nome: 'velho', descricao: '', terminou: true, em_andamento: false, tokens: 1, fases: [], agentes: [{ label: 'pixel:x', status: 'feito', personagem: 'frontend', acao: null }] },
    ],
  };
}

function gerarInterno() {
  const out = cp.execFileSync(process.execPath, [GERADOR], { maxBuffer: 16e6, encoding: 'utf8' });
  return JSON.parse(out);
}

function gravar(arq, pub) {
  const tmp = arq + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(pub, null, 2) + '\n');
  fs.renameSync(tmp, arq);
}

function autoteste() {
  let falhas = 0;
  const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FALHA') + ' ' + msg); if (!cond) falhas++; };
  const interno = internoFicticio();
  const pub = publicar(interno);
  const json = JSON.stringify(pub);
  ok(conferir(pub, interno).length === 0, 'estado público passa na conferência: ' + (conferir(pub, interno).join('; ') || 'limpo'));
  for (const p of ['/', '.cjs', 'scratchpad', 'tokens']) ok(!json.replace(/"atualizado_em":"[^"]+"/, '').includes(p), `sem "${p}"`);
  for (const p of ['joao', 'João', 'rotas', 'verbo:', 'wf_', 'script', 'hacker', 'Rua', '99999']) ok(!json.includes(p), `sem "${p}"`);
  ok(pub.fluxos.length === 2, 'só fluxos em andamento (2)');
  ok(pub.fluxos[0].nome === 'Pedido da Creat' && pub.fluxos[1].nome === 'Projeto interno', 'rótulos de fluxo fixos');
  const cop = pub.fluxos[0].agentes.find(a => a.personagem === 'copywriter');
  ok(cop && cop.frase === 'escrevendo os textos', 'Verbo = "escrevendo os textos"');
  ok(!pub.fluxos[0].agentes.some(a => a.personagem === 'qa'), 'interrompido não aparece como trabalhando');
  const vazio = publicar({ atualizado: '2026-11-08T10:00:00Z', fluxos: [] });
  ok(vazio.mensagem === SEM_FLUXO && vazio.fluxos.length === 0, 'sem fluxo: "' + SEM_FLUXO + '"');
  ok(conferir(publicar(null)).length === 0, 'entrada vazia não quebra');
  // o exemplo versionado também precisa passar
  const ex = path.join(RAIZ, 'estado-publico.exemplo.json');
  if (fs.existsSync(ex)) ok(conferir(JSON.parse(fs.readFileSync(ex, 'utf8'))).length === 0, 'estado-publico.exemplo.json passa na conferência');
  const real = path.join(RAIZ, 'estado-publico.json');
  if (fs.existsSync(real)) ok(conferir(JSON.parse(fs.readFileSync(real, 'utf8'))).length === 0, 'estado-publico.json atual passa na conferência');
  console.log(falhas ? `\n${falhas} falha(s)` : '\nautoteste ok');
  process.exit(falhas ? 1 : 0);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  if (args.includes('--autoteste')) autoteste();
  else if (args.includes('--exemplo')) {
    const pub = publicar(internoFicticio());
    gravar(path.join(RAIZ, 'estado-publico.exemplo.json'), pub);
    console.error('estado-publico.exemplo.json gravado');
  } else {
    const interno = opt('--entrada') ? JSON.parse(fs.readFileSync(opt('--entrada'), 'utf8')) : gerarInterno();
    const pub = publicar(interno);
    const erros = conferir(pub, interno);
    if (erros.length) { console.error('estado público recusado: ' + erros.join('; ')); process.exit(1); }
    const saida = opt('--saida') || path.join(RAIZ, 'estado-publico.json');
    gravar(saida, pub);
    console.error(`estado público gravado: ${pub.fluxos.length} fluxo(s) em andamento`);
  }
}
module.exports = { publicar, conferir, FRASE };
