// Núcleo da Sede ao vivo: transforma a lista de eventos dos ganchos em estado da tela.
// Funções puras, sem DOM, para testar no Node (site/ao-vivo/teste-nucleo.cjs).
(function (raiz) {
  const TEAM = [
    ['diretor','Nimbus','Diretor de Operações','#FFD23F'], ['criativo','Faísca','Diretor Criativo','#B8E04A'],
    ['arquiteto','Cirro','Arquiteto de Software','#2EC4B6'], ['frontend','Pixel','Engenheiro Frontend','#FF6B6B'],
    ['backend','Forja','Engenheira Backend','#4D7CFE'], ['designer','Paleta','Designer de Interface','#FF8FD1'],
    ['motion-3d','Órbita','Animação & 3D','#9B6BFF'], ['shader','Prisma','Creative Coder','#D63AF9'],
    ['som','Eco','Designer de Som','#FFB4A2'], ['copywriter','Verbo','Redator & Conteúdo','#FF9F1C'],
    ['pesquisador','Radar','Pesquisador','#6CC08B'], ['revisor','Crivo','Revisor de Código','#B5838D'],
    ['qa','Lupa','Qualidade & Testes','#EEF2F7'], ['seguranca','Muralha','Segurança','#7B8BD1'],
    ['devops','Trilho','DevOps & Deploy','#C49A86'],
  ].map(([id, nick, role, color], i) => ({ id, nick, role, color, i }));
  const BY = Object.fromEntries(TEAM.map(a => [a.id, a]));
  const CLAUDE = { id: 'claude', nick: 'Claude', role: 'conversa principal', color: '#FFD25E', principal: true };
  const CORES = ['#FF6B6B','#4D7CFE','#2EC4B6','#FF9F1C','#9B6BFF','#6CC08B','#FF8FD1','#FFD23F','#D63AF9','#7B8BD1','#B8E04A','#FFB4A2'];
  const NOMES = { 'general-purpose': 'Agente geral', Explore: 'Explorador', Plan: 'Planejador', 'claude-code-guide': 'Guia', 'web-fetch': 'Leitor da web' };
  const PARADO_MS = 10 * 60e3;
  const tsDe = e => e._t || (e._t = Date.parse(e.ts));

  const hashCor = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return CORES[h % CORES.length]; };
  const curto = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

  function pessoa(tipo, principal) {
    if (principal) return CLAUDE;
    if (tipo && BY[tipo]) return BY[tipo];
    const t = String(tipo || 'agente');
    return { id: 'x:' + t, nick: NOMES[t] || curto(t.replace(/[-_]+/g, ' ').replace(/^./, c => c.toUpperCase()), 22), role: 'agente', color: hashCor(t), fora: true };
  }

  const VERBO = { Bash: 'terminal', Read: 'lendo', Edit: 'editando', Write: 'escrevendo', NotebookEdit: 'editando', Grep: 'procurando', Glob: 'procurando',
    WebSearch: 'pesquisando', WebFetch: 'lendo a web', Agent: 'chamando agente', Task: 'chamando agente', Skill: 'skill', Workflow: 'fluxo', TaskCreate: 'tarefas', TaskUpdate: 'tarefas' };
  function acao(ev) {
    if (!ev || !ev.ferramenta) return '';
    const f = ev.ferramenta;
    const nome = VERBO[f] || (f.startsWith('mcp__') ? f.split('__')[1].replace(/_/g, ' ') : f);
    return ev.resumo ? nome + ' › ' + ev.resumo : nome;
  }

  // eventos: [{id, ts, sessao, sessao_nome, pasta, agente, tipo, evento, ferramenta, resumo}] (qualquer ordem)
  function estado(eventos, agora) {
    const ord = eventos.slice().sort((a, b) => tsDe(a) - tsDe(b) || (a.id || 0) - (b.id || 0));
    const ags = new Map(), sess = new Map(), log = [];
    for (const e of ord) {
      const t = tsDe(e);
      const s = sess.get(e.sessao) || { id: e.sessao, nome: null, pasta: null, inicio: t, ultimo: t, ultimoEvento: null };
      if (e.sessao_nome) s.nome = e.sessao_nome;
      if (e.pasta) s.pasta = e.pasta;
      s.ultimo = t; s.ultimoEvento = e.evento;
      sess.set(e.sessao, s);
      if (e.evento === 'SessionStart' || e.evento === 'SessionEnd' || e.evento === 'UserPromptSubmit') {
        if (e.evento === 'UserPromptSubmit') log.push({ t, tipo: 'pedido', p: CLAUDE, texto: 'recebeu um pedido seu', sessao: e.sessao });
        if (e.evento === 'SessionEnd') for (const m of ags.values()) if (m.sessao === e.sessao && !m.fim) { m.fim = t; m.ultimo = t; }
        if (e.evento !== 'UserPromptSubmit') continue;
      }
      const principal = !e.agente;
      const k = e.sessao + '|' + (e.agente || '');
      let a = ags.get(k);
      if (!a) { a = { chave: k, sessao: e.sessao, agente: e.agente || null, tipo: e.tipo || null, principal, inicio: t, ultimo: t, acoes: 0, acao: '', fim: null }; ags.set(k, a); }
      if (e.tipo) a.tipo = e.tipo;
      // subagente já entregou: ações que chegam depois são atrasos do gancho assíncrono
      if (!principal && a.fim && e.evento === 'PreToolUse') continue;
      a.ultimo = Math.max(a.ultimo, t);
      const p = pessoa(a.tipo, principal);
      if (e.evento === 'SubagentStart') { a.inicio = t; a.fim = null; log.push({ t, tipo: 'start', p, texto: 'começou a trabalhar', sessao: e.sessao }); }
      else if (e.evento === 'SubagentStop') { a.fim = t; log.push({ t, tipo: 'done', p, texto: 'entregou' + (a.acoes ? ` depois de ${a.acoes} ${a.acoes === 1 ? 'ação' : 'ações'}` : ''), sessao: e.sessao }); }
      else if (e.evento === 'Stop') { a.fim = t; log.push({ t, tipo: 'pausa', p, texto: 'terminou a vez e está esperando você', sessao: e.sessao }); }
      else if (e.evento === 'UserPromptSubmit') { a.fim = null; a.inicio = principal && a.acoes === 0 ? t : a.inicio; }
      else if (e.evento === 'PreToolUse') {
        if (a.fim && principal) { a.fim = null; }
        a.acoes++; a.acao = acao(e);
        log.push({ t, tipo: 'tool', p, texto: a.acao, sessao: e.sessao });
      }
    }
    const agentes = [...ags.values()].map(a => {
      let status;
      if (a.fim && a.fim >= a.ultimo) status = a.principal ? 'pausa' : 'feito';
      else status = agora - a.ultimo < PARADO_MS ? 'trabalhando' : 'parado';
      const s = sess.get(a.sessao) || {};
      return { ...a, status, pessoa: pessoa(a.tipo, a.principal), sessaoNome: s.nome || s.pasta || 'sessão ' + String(a.sessao).slice(0, 6) };
    });
    const sessoes = [...sess.values()].map(s => {
      const da = agentes.filter(a => a.sessao === s.id);
      return { ...s, nomeExib: s.nome || s.pasta || 'sessão ' + String(s.id).slice(0, 6), trabalhando: da.filter(a => a.status === 'trabalhando').length,
        status: s.ultimoEvento === 'SessionEnd' ? 'encerrada' : da.some(a => a.status === 'trabalhando') ? 'trabalhando' : da.some(a => a.principal && a.status === 'pausa') ? 'esperando' : 'parada' };
    }).sort((a, b) => b.ultimo - a.ultimo);
    for (const l of log) { const s = sess.get(l.sessao); l.sessaoNome = s ? (s.nome || s.pasta) : ''; }
    return { agentes, sessoes, log: log.reverse() };
  }

  const api = { TEAM, BY, CLAUDE, PARADO_MS, pessoa, acao, estado, curto };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.SedeNucleo = api;
})(typeof window !== 'undefined' ? window : globalThis);
