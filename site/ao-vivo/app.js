// Sede ao vivo: tela. Lê eventos do Supabase (tempo real) ou de uma demonstração (?demo).
(() => {
const N = window.SedeNucleo, CFG = window.SEDE_CONFIG || {};
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const curto = N.curto;
const dur = ms => { const s = Math.max(0, Math.round(ms / 1000)); if (s < 60) return s + 's'; if (s < 3600) return Math.floor(s / 60) + 'min' + (s < 600 ? ' ' + String(s % 60).padStart(2, '0') + 's' : ''); const h = Math.floor(s / 3600); return h < 48 ? h + 'h' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') : Math.floor(h / 24) + ' dias'; };
const ha = t => t ? 'há ' + dur(Date.now() - t) : '';
const hora = t => new Date(t).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
const JANELA_MS = 12 * 3600e3;
const DEMO = new URLSearchParams(location.search).has('demo');

const st = { eventos: [], ids: new Set(), ultimoEvento: 0, conectado: false, stageI: 0, stageKey: '', som: false, logVisto: new Set() };

/* ---------- som e modo TV ---------- */
let ac = null;
function toque(tipo){
  if (!st.som || !ac) return;
  const t0 = ac.currentTime, notas = tipo === 'done' ? [784, 1175] : tipo === 'pausa' ? [440, 330] : [523];
  notas.forEach((f, i) => { const o = ac.createOscillator(), g = ac.createGain(), t = t0 + i * .09; o.type = 'triangle'; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.08, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + .35); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + .4); });
}
$('#somBtn').addEventListener('click', () => {
  st.som = !st.som; $('#somBtn').setAttribute('aria-pressed', String(st.som));
  if (st.som) { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); ac.resume(); toque('done'); } catch { st.som = false; $('#somBtn').setAttribute('aria-pressed', 'false'); } }
});
let lock = null;
async function tv(on){
  document.body.classList.toggle('tv', on); $('#tvBtn').setAttribute('aria-pressed', String(on));
  try { if (on && !document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else if (!on && document.fullscreenElement) await document.exitFullscreen(); } catch {}
  try { if (on && navigator.wakeLock) lock = await navigator.wakeLock.request('screen'); else if (!on && lock) { lock.release(); lock = null; } } catch {}
}
$('#tvBtn').addEventListener('click', () => tv(!document.body.classList.contains('tv')));
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('tv')) tv(false); });
document.addEventListener('visibilitychange', async () => { if (document.visibilityState === 'visible' && document.body.classList.contains('tv') && navigator.wakeLock) { try { lock = await navigator.wakeLock.request('screen'); } catch {} } });

/* ---------- desenho ---------- */
const toon = (p, d) => `<div class="toon" style="--c:${p.color};--d:${d || 0}s" aria-hidden="true"><span class="head"></span><span class="eye l"></span><span class="eye r"></span><span class="mouth"></span><span class="desk"></span></div>`;
function base(){
  $('#team').innerHTML = N.TEAM.map(a => `<article class="ag" data-id="${a.id}" data-s="idle" style="--c:${a.color}">
    <div class="ag-h">${toon(a, (a.i * .37) % 4)}<div class="who"><h3>${esc(a.nick)}</h3><div class="role">${esc(a.role)}</div></div></div>
    <div class="now">Na sede, esperando o próximo briefing</div><div class="act"></div>
    <div class="foot"><span class="st"><i></i><span class="sl">Na sede</span></span><span class="t"></span></div></article>`).join('');
}
const SC = { trabalhando:'run', parado:'stall', feito:'done', pausa:'done' };

let E = { agentes: [], sessoes: [], log: [] }, ultimoCalc = 0;
const pinta = (sel, html) => { const el = $(sel); if (el._html !== html){ el._html = html; el.innerHTML = html; } };
function render(){
  const agora = Date.now();
  if (st.sujo || agora - ultimoCalc > 5000){ E = N.estado(st.eventos, agora); st.sujo = false; ultimoCalc = agora; }
  const vivos = E.agentes.filter(a => a.status === 'trabalhando').sort((a, b) => b.ultimo - a.ultimo);

  // equipe fixa
  let emAcao = 0;
  document.querySelectorAll('.ag').forEach(el => {
    const lista = E.agentes.filter(a => a.tipo === el.dataset.id).sort((a, b) => b.ultimo - a.ultimo);
    const run = lista.filter(a => a.status === 'trabalhando'), feitos = lista.filter(a => a.status === 'feito'), parados = lista.filter(a => a.status === 'parado');
    let s = 'idle', sl = 'Na sede', now = 'Na sede, esperando o próximo briefing', act = '', t = '';
    if (run.length){ s = 'run'; sl = 'Trabalhando'; emAcao++; const a = run[0]; now = a.sessaoNome; act = a.acao || 'começando…'; t = dur(agora - a.inicio); }
    else if (parados.length){ s = 'stall'; sl = 'Parado'; const a = parados[0]; now = a.sessaoNome; act = 'sem sinal ' + ha(a.ultimo); }
    else if (feitos.length){ s = 'done'; sl = feitos.length + (feitos.length > 1 ? ' entregas' : ' entrega'); const a = feitos[0]; now = 'Entregou em ' + a.sessaoNome; act = a.acoes + (a.acoes === 1 ? ' ação' : ' ações'); t = ha(a.fim); }
    if (el.dataset.s === 'run' && s === 'done'){ el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    el.dataset.s = s; el.querySelector('.sl').textContent = sl; el.querySelector('.now').textContent = now; el.querySelector('.act').textContent = act; el.querySelector('.t').textContent = t;
    let x = el.querySelector('.x');
    if (run.length > 1){ if (!x){ x = document.createElement('span'); x.className = 'x'; el.appendChild(x); } x.textContent = '×' + run.length; } else if (x) x.remove();
  });
  $('#teamNote').textContent = emAcao ? `${emAcao} de 15 em ação agora` : '15 agentes fixos';

  // palco
  $('#nWork').textContent = vivos.length;
  $('#nWorkTxt').textContent = vivos.length === 1 ? 'agente trabalhando' : 'trabalhando agora';
  const stage = $('#stage'); let p = N.BY.diretor, key, head, typed, ctx = '', meta = '';
  if (vivos.length){
    const a = vivos[st.stageI % vivos.length]; p = a.pessoa;
    key = a.chave + '|' + a.acao;
    head = `<em>${esc(p.nick)}</em> está trabalhando em ${esc(curto(a.sessaoNome, 40))}`;
    typed = a.acao || 'começando…';
    ctx = vivos.length > 1 ? `${(st.stageI % vivos.length) + 1} de ${vivos.length} trabalhando agora` : '';
    meta = [['há', dur(agora - a.inicio)], ['ações', a.acoes]].map(([k, v]) => `<span>${k} <b>${esc(v)}</b></span>`).join('');
    stage.style.setProperty('--c', p.color); stage.dataset.s = 'run';
  } else {
    key = 'idle|' + st.conectado; head = 'A equipe está na sede, pronta para o próximo briefing';
    typed = st.conectado ? 'nenhum agente trabalhando neste momento' : 'conectando…';
    stage.style.removeProperty('--c'); stage.dataset.s = 'idle';
  }
  const box = $('#stageToon'); if (box.dataset.who !== p.id){ box.innerHTML = toon(p); box.dataset.who = p.id; } box.dataset.s = stage.dataset.s;
  $('#headline').innerHTML = head; $('#stageCtx').textContent = ctx; $('#stageMeta').innerHTML = meta;
  $('#dots').innerHTML = vivos.length > 1 ? vivos.map((_, i) => `<i class="${i === st.stageI % vivos.length ? 'on' : ''}"></i>`).join('') : '';
  if (key !== st.stageKey){ st.stageKey = key; digitar(typed); }

  // todos os agentes (inclui conversa principal e agentes de fora da equipe)
  const ordem = { trabalhando:0, parado:1, pausa:2, feito:3 };
  const todos = E.agentes.filter(a => agora - a.ultimo < JANELA_MS).sort((a, b) => ordem[a.status] - ordem[b.status] || b.ultimo - a.ultimo);
  $('#outrosNote').textContent = todos.length ? `${vivos.length} trabalhando · ${todos.length} nas últimas 12 h` : '';
  if (todos.length) pinta('#mesa', todos.slice(0, 36).map(a => {
    const s = SC[a.status], rot = { trabalhando:'trabalhando', parado:'sem sinal', feito:'entregou', pausa:'esperando você' }[a.status];
    return `<li class="chip" data-s="${s}" style="--c:${a.pessoa.color}"><span class="dot"></span><span class="cn"><b>${esc(a.pessoa.nick)} · ${esc(curto(a.sessaoNome, 30))}</b><small>${esc(rot)}${a.acao ? ' · ' + esc(curto(a.acao, 70)) : ''}</small></span>${a.status === 'trabalhando' ? `<time>${dur(agora - a.inicio)}</time>` : `<time>${esc(ha(a.ultimo))}</time>`}</li>`;
  }).join(''));

  // sessões
  const ses = E.sessoes.filter(s => agora - s.ultimo < JANELA_MS);
  const B = { trabalhando:['WORKING','Trabalhando'], esperando:['BLOCKED','Esperando você'], parada:['IDLE','Parada'], encerrada:['COMPLETED','Encerrada'] };
  if (ses.length) pinta('#sess', ses.slice(0, 10).map(s => `<li class="row"><span class="b" data-b="${B[s.status][0]}">${B[s.status][1]}</span><div style="min-width:0"><b>${esc(curto(s.nomeExib, 70))}</b><p>${s.trabalhando ? s.trabalhando + (s.trabalhando > 1 ? ' agentes trabalhando' : ' agente trabalhando') : 'último sinal ' + esc(ha(s.ultimo))}${s.pasta && s.nome ? ' · ' + esc(s.pasta) : ''}</p></div><time>${esc(ha(s.ultimo))}</time></li>`).join(''));

  // registro
  const novos = E.log.slice(0, 50);
  if (novos.length){
    const K = { done:'entregou', start:'começou', tool:'ação', pausa:'pausa', pedido:'pedido' }, KK = { done:'done', start:'start', pausa:'warn', pedido:'start' };
    pinta('#log', novos.map(l => { const id = l.t + l.p.id + l.texto, novo = !st.logVisto.has(id); st.logVisto.add(id); if (novo && st.conectado && Date.now() - l.t < 8000) toque(l.tipo);
      return `<li class="${novo ? '' : 'seen'}">${toon(l.p)}<p><span class="k" data-k="${KK[l.tipo] || ''}">${K[l.tipo]}</span><b>${esc(l.p.nick)}</b> ${esc(l.texto)}<small>${hora(l.t)}${l.sessaoNome ? ' · ' + esc(curto(l.sessaoNome, 32)) : ''}</small></p></li>`; }).join(''));
    $('#logNote').textContent = E.log.length + ' eventos';
  }
  $('#rec').dataset.on = vivos.length ? '1' : '0';
  $('#recTxt').textContent = st.conectado ? 'Ao vivo' : 'Conectando';
}
let typeTimer = 0;
function digitar(txt){
  clearInterval(typeTimer); const el = $('#typed'); txt = String(txt || '');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches){ el.textContent = txt; return; }
  let i = 0; el.textContent = ''; typeTimer = setInterval(() => { i += 2; el.textContent = txt.slice(0, i); if (i >= txt.length) clearInterval(typeTimer); }, 18);
}
function aviso(txt){ $('#banner').hidden = !txt; $('#bannerTxt').textContent = txt || ''; }

/* ---------- dados ---------- */
let pendente = false;
function receber(lista){
  let novo = false;
  for (const e of lista){ if (e.id != null && st.ids.has(e.id)) continue; if (e.id != null) st.ids.add(e.id); e._t = Date.parse(e.ts); st.eventos.push(e); st.ultimoEvento = Math.max(st.ultimoEvento, e._t); novo = true; }
  if (!novo) return;
  if (st.eventos.length > 6000){
    const corte = Date.now() - JANELA_MS;
    st.eventos = st.eventos.filter(e => e._t > corte).sort((a, b) => a._t - b._t).slice(-5000);   // mantém os mais novos
    st.ids = new Set(st.eventos.map(e => e.id));
  }
  st.sujo = true;
  if (!pendente){ pendente = true; requestAnimationFrame(() => { pendente = false; render(); }); }
}

async function supa(){
  if (!window.supabase || !CFG.supabaseUrl || !CFG.supabaseKey){ aviso('A sede ainda não foi ligada ao banco. Abra com ?demo para ver a demonstração.'); return; }
  const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, detectSessionInUrl: true } });
  $('#sairBtn').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });
  $('#loginForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const email = $('#email').value.trim(); $('#loginMsg').textContent = 'Enviando…';
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } });
    $('#loginMsg').textContent = error ? 'Não consegui enviar. Confira se este é o e-mail cadastrado como dono.' : 'Pronto. Abra o link que chegou no seu e-mail.';
  });
  let ligado = false;
  async function ligar(sessao){
    if (!sessao){ $('#login').hidden = false; $('#sairBtn').hidden = true; return; }
    if (ligado) return; ligado = true;
    $('#login').hidden = true; $('#sairBtn').hidden = false;
    const { data: dono } = await sb.from('donos').select('email').limit(1);
    if (!dono || !dono.length){ aviso('Você entrou, mas este e-mail não está liberado. Cadastre-o na tabela "donos" do Supabase (veja sede/aovivo/INSTALAR.md).'); return; }
    async function carregar(desdeMs){
      const desde = new Date(desdeMs).toISOString();
      for (let de = 0; de < 5000; de += 1000){   // o Supabase devolve no máximo 1000 linhas por vez
        const { data, error } = await sb.from('eventos').select('*').gte('ts', desde).order('ts', { ascending: false }).range(de, de + 999);
        if (error){ aviso('Não consegui ler os eventos: ' + error.message); return; }
        receber(data || []);
        if (!data || data.length < 1000) return;
      }
    }
    let caiu = false;
    sb.channel('sede-eventos').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'eventos' }, m => receber([m.new]))
      .subscribe(s => {
        st.conectado = s === 'SUBSCRIBED';
        if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED'){ caiu = true; aviso('A conexão em tempo real caiu. Tentando de novo…'); }
        else if (st.conectado){ aviso(''); if (caiu){ caiu = false; carregar(st.ultimoEvento - 60e3); } }   // recupera o que chegou durante a queda
        render();
      });
    await carregar(Date.now() - JANELA_MS);
  }
  const { data } = await sb.auth.getSession();
  ligar(data.session);
  sb.auth.onAuthStateChange((_e, sessao) => { if (sessao) ligar(sessao); });
}

/* ---------- demonstração (dados fictícios) ---------- */
function demo(){
  $('#demoTag').hidden = false; st.conectado = true;
  const sessoes = [['d1','Landing page Barbearia Navalha'],['d2','Reels Padaria Pão Dourado'],['d3','App de agendamento Studio Yoga']];
  const roteiro = [
    ['d1', null, 'SessionStart'], ['d1', null, 'UserPromptSubmit'], ['d1', null, 'PreToolUse', 'Workflow', 'agencia'],
    ['d1', 'criativo', 'SubagentStart'], ['d1', 'criativo', 'PreToolUse', 'Read', 'briefing.md'], ['d1', 'criativo', 'PreToolUse', 'Write', 'conceitos.md'], ['d1', 'criativo', 'SubagentStop'],
    ['d1', 'diretor', 'SubagentStart'], ['d1', 'diretor', 'PreToolUse', 'Write', 'plano.md'], ['d1', 'diretor', 'SubagentStop'],
    ['d1', 'frontend', 'SubagentStart'], ['d1', 'designer', 'SubagentStart'], ['d1', 'copywriter', 'SubagentStart'],
    ['d1', 'designer', 'PreToolUse', 'Write', 'tokens.css'], ['d1', 'frontend', 'PreToolUse', 'Write', 'index.html'], ['d1', 'copywriter', 'PreToolUse', 'Edit', 'textos.md'],
    ['d2', null, 'SessionStart'], ['d2', null, 'UserPromptSubmit'], ['d2', 'general-purpose', 'SubagentStart'], ['d2', 'general-purpose', 'PreToolUse', 'Bash', 'ffmpeg cortes do ato 2'],
    ['d1', 'frontend', 'PreToolUse', 'Bash', 'testando no navegador'], ['d1', 'designer', 'SubagentStop'], ['d1', 'revisor', 'SubagentStart'], ['d1', 'revisor', 'PreToolUse', 'Grep', 'TODO'],
    ['d3', null, 'SessionStart'], ['d3', null, 'PreToolUse', 'Read', 'schema.sql'], ['d1', 'copywriter', 'SubagentStop'], ['d2', 'general-purpose', 'PreToolUse', 'Bash', 'color grading LUT cinema'],
    ['d1', 'frontend', 'SubagentStop'], ['d1', 'qa', 'SubagentStart'], ['d1', 'qa', 'PreToolUse', 'Bash', 'prints celular e desktop'], ['d1', 'revisor', 'SubagentStop'],
    ['d2', 'general-purpose', 'SubagentStop'], ['d2', null, 'Stop'], ['d1', 'seguranca', 'SubagentStart'], ['d1', 'seguranca', 'PreToolUse', 'Grep', 'chaves expostas'], ['d1', 'qa', 'SubagentStop'], ['d1', 'seguranca', 'SubagentStop'], ['d1', null, 'Stop'],
  ];
  let id = 0, i = 0;
  const nomes = Object.fromEntries(sessoes);
  const ag = {};
  const passo = () => {
    const [s, tipo, evento, ferramenta, resumo] = roteiro[i % roteiro.length];
    if (tipo && evento === 'SubagentStart') ag[s + tipo] = 'demo-' + (++id);
    receber([{ id: ++id, ts: new Date().toISOString(), sessao: s, sessao_nome: nomes[s], pasta: 'demo', agente: tipo ? ag[s + tipo] : null, tipo, evento, ferramenta: ferramenta || null, resumo: resumo || null }]);
    i++; if (i % roteiro.length === 0){ st.eventos = []; st.ids.clear(); }
  };
  for (let k = 0; k < 14; k++) passo();
  setInterval(passo, 1600);
}

/* ---------- partida ---------- */
base(); render();
setInterval(() => { $('#clock').textContent = new Date().toLocaleTimeString('pt-BR'); $('#sync').textContent = st.ultimoEvento ? 'último evento ' + ha(st.ultimoEvento) : ''; render(); }, 1000);
setInterval(() => { st.stageI++; }, 7000);
$('#clock').textContent = new Date().toLocaleTimeString('pt-BR');
if (DEMO) demo(); else supa();
})();
