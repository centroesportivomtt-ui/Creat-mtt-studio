// som.js · Hora da Serra (Eco, Creat Nuvem)
// Tudo sintetizado em Web Audio: nenhum arquivo de áudio, nenhuma biblioteca, nenhuma rede.
// Importar não faz nada: o AudioContext só nasce dentro de liberar(), chamado num gesto.
//
// API (seção 9.4 da ARQUITETURA, mais a T5):
//   liberar()                  cria ou retoma o contexto no gesto; idempotente
//   toin({intensidade, pan})   o "tóin" da araponga (400 a 700 ms de cauda)
//   tic({hora})                micro som de hora cheia na régua, quase inaudível
//   ambiencia(hora)            0–24 (decimal) ou minutos do dia (> 24): manhã, tarde, noite
//   definirModo({economia, mudo}), parar(), estado() -> {ligado, mudo, economia, reduzido}
//   tocar(nome), silenciar(sim)   nomes do contrato da arquitetura
//   botao()                    <button> de som pronto para montar (texto diz o estado)
//   renderizar(nome, opcoes)   OfflineAudioContext, para a bancada e os testes
//
// Regras: pico nunca acima de -14 dBFS (teto por WaveShaper), toda entrada e saída com rampa,
// ambiência abaixa 6 dB sob o tóin, pausa em aba oculta, economia ou mudo fecham o contexto.
// Movimento reduzido não é mudo: só a ambiência contínua sai; tóin e tic seguem no gesto.

const CHAVE = 'itaitu:som';
const TETO = 0.185;          // -14,7 dBFS: limite físico da saída
const JOELHO = 0.125;        // -18 dBFS: abaixo disto a saída é linear
const LACO_S = 6;            // duração do laço de ruído (segundos)
const dB = (d) => Math.pow(10, d / 20);
const lim = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sorte = (a, b) => a + Math.random() * (b - a);

let ctx = null;              // AudioContext ao vivo
let cad = null;              // cadeia do contexto ao vivo
let pref = null;             // { mudo } lido do localStorage na primeira necessidade
let economia = false;
let reduzido = false;
let parado = false;
let horaAlvo = null;
let ganchos = false;
let ultimoToin = -Infinity;
let ultimoTic = -Infinity;
const camadas = {};          // manha, tarde, noite (ao vivo)
const desligarCamada = {};   // timers de desligamento
let relogioPassaros = 0;
const botoes = new Set();

// ---------- preferências ----------
function lerPref() {
  if (pref) return pref;
  pref = { mudo: false };
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (v && typeof v.mudo === 'boolean') pref.mudo = v.mudo;
  } catch (_) { /* sem armazenamento: segue com o padrão */ }
  return pref;
}
function gravarPref() {
  try { localStorage.setItem(CHAVE, JSON.stringify({ mudo: lerPref().mudo })); } catch (_) {}
}

// ---------- utilidades de automação ----------
function segurar(p, t) {
  if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(t);
  else { const v = p.value; p.cancelScheduledValues(t); p.setValueAtTime(v, t); }
}
function rampa(p, v, c, tc = 0.3) {
  const t = c.currentTime;
  segurar(p, t);
  p.setTargetAtTime(v, t, tc);
}
function painel(c, pan) {
  if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = lim(pan, -1, 1); return p; }
  return c.createGain();
}
function osc(c, tipo, f) { const o = c.createOscillator(); o.type = tipo; o.frequency.value = f; return o; }
function ganho(c, v = 1) { const g = c.createGain(); g.gain.value = v; return g; }
function filtro(c, tipo, f, q = 0.7) { const b = c.createBiquadFilter(); b.type = tipo; b.frequency.value = f; b.Q.value = q; return b; }
function curva(n, fn) { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = fn((i / (n - 1)) * 2 - 1); return a; }
function formador(c, fn, n = 1025) { const w = c.createWaveShaper(); w.curve = curva(n, fn); return w; }
const suave = (x, a, b) => { if (x <= a) return 0; if (x >= b) return 1; const t = (x - a) / (b - a); return t * t * (3 - 2 * t); };

// ---------- ruído em laço sem emenda ----------
const ruidos = new WeakMap();
function ruido(c) {
  let r = ruidos.get(c);
  if (r) return r;
  const n = Math.floor(LACO_S * c.sampleRate);
  const branco = c.createBuffer(1, n, c.sampleRate);
  const rosa = c.createBuffer(1, n, c.sampleRate);
  const w = branco.getChannelData(0);
  const p = rosa.getChannelData(0);
  for (let i = 0; i < n; i++) w[i] = (Math.random() * 2 - 1) * 0.5;
  // Rosa de Paul Kellet, filtrado em duas voltas: a segunda começa com o estado do fim da
  // primeira, então o fim do laço emenda no começo sem degrau.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, soma = 0, pico = 0;
  for (let volta = 0; volta < 2; volta++) {
    for (let i = 0; i < n; i++) {
      const x = w[i] * 2;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759;
      b2 = 0.969 * b2 + x * 0.153852; b3 = 0.8665 * b3 + x * 0.3104856;
      b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      const y = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362;
      b6 = x * 0.115926;
      if (volta) { p[i] = y; soma += y; }
    }
  }
  const media = soma / n;
  for (let i = 0; i < n; i++) { p[i] -= media; pico = Math.max(pico, Math.abs(p[i])); }
  for (let i = 0; i < n; i++) p[i] *= 0.5 / pico;
  r = { branco, rosa };
  ruidos.set(c, r);
  return r;
}
function fonte(c, buf, t, desloc = 0) {
  const s = c.createBufferSource();
  s.buffer = buf; s.loop = true;
  s.start(t, desloc % buf.duration);
  return s;
}

// ---------- espaço: eco curto de vale, gerado em código ----------
function respostaVale(c) {
  const taxa = c.sampleRate, n = Math.floor(1.1 * taxa);
  const ir = c.createBuffer(2, n, taxa);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const t = i / taxa;
      let v = (Math.random() * 2 - 1) * Math.exp(-t * 6.5) * 0.35;
      // o paredão devolve o som: dois ecos difusos
      for (const [e, a] of [[0.29 + ch * 0.013, 0.5], [0.58 + ch * 0.021, 0.22]]) {
        const k = (t - e) / 0.018;
        if (k > -1 && k < 3) v += (Math.random() * 2 - 1) * a * Math.exp(-k * k);
      }
      d[i] = v * Math.min(1, i / 64) * Math.min(1, (n - i) / (0.15 * taxa));
    }
  }
  return ir;
}

// ---------- cadeia mestre ----------
function cadeia(c) {
  const mestre = ganho(c, 0);
  const teto = c.createWaveShaper();
  teto.curve = curva(8193, (x) => {
    const a = Math.abs(x);
    const y = a <= JOELHO ? a : JOELHO + (TETO - JOELHO) * Math.tanh((a - JOELHO) / (TETO - JOELHO));
    return Math.sign(x) * y;
  });
  teto.oversample = '2x';
  mestre.connect(teto).connect(c.destination);
  const amb = ganho(c, 0);           // nível da ambiência (entrada suave)
  const duck = ganho(c, 1);          // ducking sob o tóin
  amb.connect(duck).connect(mestre);
  const efx = ganho(c, 1);
  efx.connect(mestre);
  const envio = ganho(c, dB(-13));
  const sala = c.createConvolver();
  sala.normalize = false;
  sala.buffer = respostaVale(c);
  envio.connect(filtro(c, 'lowpass', 5000, 0.5)).connect(sala).connect(mestre);  // o vale come os agudos
  return { mestre, amb, duck, efx, envio };
}

// ---------- tóin da araponga ----------
// Ataque metálico (FM que some em 40 ms + estalo de ruído), parciais inarmônicas de barra,
// tom que cai 3 semitons e segue caindo de leve na cauda. Cada chamada sorteia um pouco.
function vozToin(c, k, t0, { intensidade = 0.8, pan = 0 } = {}) {
  const f = sorte(1060, 1240);
  const cauda = sorte(0.4, 0.7);
  const nivel = dB(-18) * (0.35 + 0.65 * lim(intensidade)) * 0.27;
  const saida = painel(c, pan + sorte(-0.1, 0.1));
  const vg = ganho(c, nivel);
  vg.connect(saida);
  saida.connect(k.efx);
  saida.connect(k.envio);
  const fim = t0 + cauda + 0.06;
  const parciais = [[1, 1, 1], [sorte(2.0, 2.1), 0.28, 0.55], [2.76, 0.42, 0.38], [5.4, 0.16, 0.16]];
  for (const [razao, amp, dec] of parciais) {
    const fr = f * razao;
    const o = osc(c, 'sine', fr * 1.19);
    o.frequency.setValueAtTime(fr * 1.19, t0);
    o.frequency.exponentialRampToValueAtTime(fr, t0 + 0.05);
    o.frequency.exponentialRampToValueAtTime(fr * sorte(0.955, 0.975), t0 + cauda);
    const e = ganho(c, 0);
    const dur = cauda * dec * sorte(0.9, 1.1);
    e.gain.setValueAtTime(0, t0);
    e.gain.linearRampToValueAtTime(amp * sorte(0.85, 1.1), t0 + 0.003);
    e.gain.exponentialRampToValueAtTime(amp * 1e-4, t0 + 0.003 + dur);
    e.gain.linearRampToValueAtTime(0, t0 + 0.013 + dur);
    if (razao === 1) {
      const m = osc(c, 'sine', fr * 1.414);
      const ind = ganho(c, 0);
      ind.gain.setValueAtTime(fr * 1.6, t0);
      ind.gain.exponentialRampToValueAtTime(fr * 0.01, t0 + 0.04);
      ind.gain.linearRampToValueAtTime(0, t0 + 0.05);
      m.connect(ind).connect(o.frequency);
      m.start(t0); m.stop(t0 + 0.06);
    }
    o.connect(e).connect(vg);
    o.start(t0); o.stop(fim);
  }
  // estalo do martelo na bigorna
  const s = c.createBufferSource();
  s.buffer = ruido(c).branco;
  const bp = filtro(c, 'bandpass', sorte(3200, 4200), 1.4);
  const se = ganho(c, 0);
  se.gain.setValueAtTime(0, t0);
  se.gain.linearRampToValueAtTime(0.5, t0 + 0.001);
  se.gain.exponentialRampToValueAtTime(0.002, t0 + 0.016);
  se.gain.linearRampToValueAtTime(0, t0 + 0.02);
  s.connect(bp).connect(se).connect(vg);
  s.start(t0, sorte(0, LACO_S - 0.1)); s.stop(t0 + 0.03);
  // ducking: ambiência 6 dB abaixo enquanto o tóin soa
  const d = k.duck.gain;
  segurar(d, t0);
  d.setTargetAtTime(0.5, t0, 0.012);
  d.setTargetAtTime(1, t0 + cauda * 0.6, 0.25);
  return fim;
}

// ---------- tic de hora cheia ----------
function vozTic(c, k, t0, hora) {
  const h = Number.isFinite(hora) ? hora : 12;
  const f = 1900 + 700 * lim(Math.sin(Math.PI * (h - 6) / 12), -0.4, 1); // sobe com o sol
  const o = osc(c, 'sine', f);
  const e = ganho(c, 0);
  e.gain.setValueAtTime(0, t0);
  e.gain.linearRampToValueAtTime(dB(-34), t0 + 0.002);
  e.gain.exponentialRampToValueAtTime(dB(-34) * 1e-3, t0 + 0.03);
  e.gain.linearRampToValueAtTime(0, t0 + 0.035);
  o.connect(e).connect(k.efx);
  o.start(t0); o.stop(t0 + 0.045);
  return t0 + 0.045;
}

// ---------- ambiências ----------
// Cada camada devolve { g, parar(t), passaros? }. Fontes contínuas (ruído em laço, osciladores),
// então não há emenda de gravação: o único laço é o buffer de ruído, que emenda sem degrau.
function camadaManha(c, saida, t) {
  const { rosa } = ruido(c);
  const g = ganho(c, 0); g.connect(saida);
  const fontes = [];
  // vento: dois canais descorrelacionados, filtro que respira, rajadas lentas
  [[-0.5, 0, 720, 0.063], [0.5, LACO_S / 2, 960, 0.081]].forEach(([pan, desl, fc, taxa]) => {
    const s = fonte(c, rosa, t, desl);
    const lp = filtro(c, 'lowpass', fc, 0.6);
    const lfo = osc(c, 'sine', taxa), prof = ganho(c, fc * 0.45);
    lfo.connect(prof).connect(lp.frequency);
    const raj = ganho(c, 0.62), lfo2 = osc(c, 'sine', taxa * 1.7), prof2 = ganho(c, 0.32);
    lfo2.connect(prof2).connect(raj.gain);
    s.connect(lp).connect(filtro(c, 'highpass', 170, 0.6)).connect(raj).connect(painel(c, pan)).connect(g);
    lfo.start(t); lfo2.start(t);
    fontes.push(s, lfo, lfo2);
  });
  // sopro alto nas folhas
  const s2 = fonte(c, rosa, t, LACO_S / 3);
  const bp = filtro(c, 'bandpass', 2300, 0.8), fo = ganho(c, 0.12);
  const lfo3 = osc(c, 'sine', 0.093), p3 = ganho(c, 0.09);
  lfo3.connect(p3).connect(fo.gain);
  s2.connect(bp).connect(fo).connect(g);
  lfo3.start(t);
  fontes.push(s2, lfo3);
  const passaros = ganho(c, dB(18));
  passaros.connect(filtro(c, 'lowpass', 6000, 0.5)).connect(g);
  return { g, passaros, parar: (tt) => fontes.forEach((f) => f.stop(tt)) };
}

// um passarinho distante: 1 a 4 notas curtas, glissando, muito baixo
function passarinho(c, saida, t0) {
  const notas = 1 + Math.floor(Math.random() * 4);
  const base = sorte(2900, 4600);
  const p = painel(c, sorte(-0.7, 0.7));
  p.connect(saida);
  let t = t0;
  for (let i = 0; i < notas; i++) {
    const d = sorte(0.05, 0.13);
    const f1 = base * sorte(0.9, 1.15), f2 = f1 * sorte(0.75, 1.3);
    const o = osc(c, 'sine', f1);
    o.frequency.setValueAtTime(f1, t);
    o.frequency.linearRampToValueAtTime(f2, t + d);
    const e = ganho(c, 0), a = dB(-44) * sorte(0.5, 1);
    e.gain.setValueAtTime(0, t);
    e.gain.linearRampToValueAtTime(a, t + d * 0.25);
    e.gain.linearRampToValueAtTime(0, t + d);
    o.connect(e).connect(p);
    o.start(t); o.stop(t + d + 0.01);
    t += d + sorte(0.03, 0.09);
  }
  return t;
}
function agendarPassaros(c, camada, de, ate) {
  let t = camada.proximo ?? de + sorte(0.3, 1.5);
  while (t < ate) { passarinho(c, camada.passaros, t); t += sorte(1.4, 5.5); }
  camada.proximo = t;
}

function camadaTarde(c, saida, t) {
  const { branco, rosa } = ruido(c);
  const g = ganho(c, 0); g.connect(saida);
  const fontes = [];
  // duas cigarras: faixa estreita de ruído, zumbido por AM rápido, inchaço lento
  [[4700, 118, 0.07, -0.45, 0], [5650, 147, 0.047, 0.5, LACO_S / 2]].forEach(([fc, am, inch, pan, desl]) => {
    const s = fonte(c, branco, t, desl);
    const b1 = filtro(c, 'bandpass', fc, 7), b2 = filtro(c, 'bandpass', fc * 1.02, 7);
    const zum = ganho(c, 0.5), oz = osc(c, 'sine', am), pz = ganho(c, 0.5);
    oz.connect(pz).connect(zum.gain);
    const onda = ganho(c, 0.55), oi = osc(c, 'sine', inch), pi = ganho(c, 0.45);
    oi.connect(pi).connect(onda.gain);
    s.connect(b1).connect(b2).connect(zum).connect(onda).connect(painel(c, pan)).connect(g);
    oz.start(t); oi.start(t);
    fontes.push(s, oz, oi);
  });
  // ar quente de fundo
  const s3 = fonte(c, rosa, t, LACO_S / 4);
  const lp = filtro(c, 'lowpass', 320, 0.6), fundo = ganho(c, 0.16);
  s3.connect(lp).connect(fundo).connect(g);
  fontes.push(s3);
  return { g, parar: (tt) => fontes.forEach((f) => f.stop(tt)) };
}

function camadaNoite(c, saida, t) {
  const { branco, rosa } = ruido(c);
  const g = ganho(c, 0); g.connect(saida);
  const fontes = [];
  // três grilos perto: portadora senoidal, pulsos a ~28 Hz, 3 a 4 pulsos por cricrilo
  const pulso = (x) => Math.pow(Math.max(0, x), 1.6);
  [[4300, 28, 1.42, -0.55, 0.86], [4680, 31, 1.07, 0.35, 0.83], [5080, 26, 1.71, 0.7, 0.88]].forEach(([fc, fp, fr, pan, limiar]) => {
    const o = osc(c, 'sine', fc);
    const gp = ganho(c, 0), lp = osc(c, 'sine', fp);
    lp.connect(formador(c, pulso)).connect(gp.gain);
    const gc = ganho(c, 0), lc = osc(c, 'sine', fr);
    lc.connect(formador(c, (x) => suave(x, limiar, limiar + 0.1))).connect(gc.gain);
    o.connect(gp).connect(gc).connect(ganho(c, 0.07)).connect(painel(c, pan)).connect(g);
    o.start(t); lp.start(t); lc.start(t);
    fontes.push(o, lp, lc);
  });
  // coro de grilos longe
  const s = fonte(c, branco, t, LACO_S / 3);
  const b1 = filtro(c, 'bandpass', 4450, 14), coro = ganho(c, 0.55), oc = osc(c, 'sine', 33), pc = ganho(c, 0.45);
  oc.connect(pc).connect(coro.gain);
  s.connect(b1).connect(coro).connect(ganho(c, 0.6)).connect(g);
  oc.start(t);
  // noite parada, bem baixo
  const s2 = fonte(c, rosa, t, LACO_S / 2);
  const lp2 = filtro(c, 'lowpass', 240, 0.6);
  s2.connect(lp2).connect(ganho(c, 0.1)).connect(g);
  fontes.push(s, oc, s2);
  return { g, parar: (tt) => fontes.forEach((f) => f.stop(tt)) };
}

const FABRICAS = { manha: camadaManha, tarde: camadaTarde, noite: camadaNoite };
const NIVEL = { manha: dB(-13), tarde: dB(-7), noite: dB(-5) }; // casados por RMS na bancada

// pesos do cruzamento pela hora (0–24), potência constante
export function pesos(h) {
  h = ((h % 24) + 24) % 24;
  const m = suave(h, 4.5, 6) * (1 - suave(h, 9.5, 11.5));
  const ta = suave(h, 9.5, 11.5) * (1 - suave(h, 17, 18.5));
  const n = Math.max(1 - suave(h, 4.5, 6), suave(h, 17.5, 19));
  const s = m + ta + n || 1;
  return { manha: Math.sqrt(m / s), tarde: Math.sqrt(ta / s), noite: Math.sqrt(n / s) };
}
function paraHora(v) {
  if (v && typeof v === 'object') v = Number.isFinite(v.minutos) ? v.minutos / 60 : v.hora;
  v = Number(v);
  if (!Number.isFinite(v)) return null;
  return v > 24 ? v / 60 : v;           // > 24 só pode ser minuto do dia (contrato 9.4)
}

// hora local do vale (UTC-3, sem horário de verão), pelo relógio do app quando houver
function horaDeAgora() {
  let d = new Date();
  try { if (globalThis.Itaitu && typeof Itaitu.agora === 'function') d = Itaitu.agora(); } catch (_) {}
  return (((d.getUTCHours() + d.getUTCMinutes() / 60 - 3) % 24) + 24) % 24;
}

// ---------- estado ao vivo ----------
function permitido() { return !lerPref().mudo && !economia; }
function vivo() { return !!ctx && ctx.state !== 'closed'; }

function lerAmbiente() {
  try { if (globalThis.Itaitu && typeof Itaitu.economia === 'function') economia = !!Itaitu.economia(); } catch (_) {}
  try { reduzido = !!matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
}
function ligarGanchos() {
  if (ganchos || typeof document === 'undefined') return;
  ganchos = true;
  document.addEventListener('visibilitychange', () => {
    if (!vivo()) return;
    if (document.hidden) { rampa(cad.mestre.gain, 0, ctx, 0.02); setTimeout(() => { if (vivo() && document.hidden) ctx.suspend().catch(() => {}); }, 90); }
    else if (permitido() && !parado) { ctx.resume().then(() => rampa(cad.mestre.gain, 1, ctx, 0.08)).catch(() => {}); }
  });
  document.addEventListener('itaitu:economia', (e) => definirModo({ economia: !!(e.detail && e.detail.ligado) }));
  document.addEventListener('itaitu:hora', (e) => { if (e.detail) ambiencia(e.detail); });
  try {
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => { reduzido = e.matches; aplicarAmbiencia(); });
  } catch (_) {}
}

export function liberar() {
  lerPref(); lerAmbiente(); ligarGanchos();
  if (!permitido()) { avisarBotoes(); return Promise.resolve(false); }
  parado = false;
  if (!vivo()) {
    // nunca toca sozinho: o contexto só nasce dentro de um gesto (onde o navegador informa)
    try { if (navigator.userActivation && !navigator.userActivation.isActive) return Promise.resolve(false); } catch (_) {}
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return Promise.resolve(false);
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (_) { return Promise.resolve(false); }
    // relógio novo recomeça em 0: o antigo travaria o tóin e o tic até o novo passar dele
    ultimoToin = -Infinity; ultimoTic = -Infinity;
    cad = cadeia(ctx);
    // destrava o iOS antigo: um buffer mudo tocado dentro do gesto
    const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); b.connect(ctx.destination); b.start(0);
  }
  if (horaAlvo == null) horaAlvo = horaDeAgora();
  rampa(cad.mestre.gain, 1, ctx, 0.05);
  const p = ctx.state === 'running' ? Promise.resolve() : ctx.resume();
  return p.then(() => { aplicarAmbiencia(); avisarBotoes(); return ctx && ctx.state === 'running'; })
    .catch(() => { avisarBotoes(); return false; });
}

function pronto() {
  if (!vivo() || !permitido()) return false;
  if (ctx.state !== 'running') { if (!document.hidden) ctx.resume().catch(() => {}); return ctx.state === 'running'; }
  if (parado) { parado = false; rampa(cad.mestre.gain, 1, ctx, 0.05); }
  return true;
}

export function toin({ intensidade = 0.8, pan = 0 } = {}) {
  if (!pronto()) return false;
  const agora = ctx.currentTime;
  if (agora - ultimoToin < 0.12) return false;
  ultimoToin = agora;
  vozToin(ctx, cad, agora + 0.005, { intensidade, pan });
  return true;
}

export function tic({ hora } = {}) {
  if (!pronto()) return false;
  const agora = ctx.currentTime;
  if (agora - ultimoTic < 0.06) return false;
  ultimoTic = agora;
  vozTic(ctx, cad, agora + 0.003, Number.isFinite(hora) ? hora : horaAlvo);
  return true;
}

export function ambiencia(hora) {
  const h = paraHora(hora);
  if (h == null) return false;
  horaAlvo = h;
  if (!vivo() || !permitido() || ctx.state !== 'running') return false;
  parado = false;
  aplicarAmbiencia();
  return true;
}

function aplicarAmbiencia() {
  if (!vivo() || ctx.state !== 'running' || horaAlvo == null) return;
  const alvo = permitido() && !reduzido && !parado ? 1 : 0;
  rampa(cad.amb.gain, alvo, ctx, alvo ? 0.8 : 0.15);
  const w = pesos(horaAlvo);
  for (const nome of Object.keys(FABRICAS)) {
    const v = alvo ? w[nome] : 0;
    let cam = camadas[nome];
    if (v > 0.001 && !cam) cam = camadas[nome] = FABRICAS[nome](ctx, cad.amb, ctx.currentTime + 0.01);
    if (!cam) continue;
    rampa(cam.g.gain, v * NIVEL[nome], ctx, 0.35);
    clearTimeout(desligarCamada[nome]);
    if (v <= 0.001) {
      desligarCamada[nome] = setTimeout(() => {
        if (camadas[nome] === cam && vivo()) { cam.parar(ctx.currentTime + 0.05); delete camadas[nome]; }
      }, 2500);
    }
  }
  if (camadas.manha && !relogioPassaros) {
    relogioPassaros = setInterval(() => {
      const cm = camadas.manha;
      if (!cm || !vivo()) { clearInterval(relogioPassaros); relogioPassaros = 0; return; }
      if (ctx.state === 'running') agendarPassaros(ctx, cm, ctx.currentTime, ctx.currentTime + 2);
    }, 1000);
  }
}

function limparCamadas(t) {
  for (const nome of Object.keys(camadas)) { try { camadas[nome].parar(t); } catch (_) {} delete camadas[nome]; clearTimeout(desligarCamada[nome]); }
  clearInterval(relogioPassaros); relogioPassaros = 0;
}

function fechar() {
  ultimoToin = -Infinity; ultimoTic = -Infinity;
  if (!vivo()) { ctx = null; cad = null; return; }
  const c = ctx;
  rampa(cad.mestre.gain, 0, c, 0.02);
  limparCamadas(c.currentTime + 0.12);
  ctx = null; cad = null;
  setTimeout(() => c.close().catch(() => {}), 150);
}

export function definirModo({ economia: eco, mudo } = {}) {
  const p = lerPref();
  if (typeof mudo === 'boolean' && mudo !== p.mudo) { p.mudo = mudo; gravarPref(); }
  if (typeof eco === 'boolean') economia = eco;
  if (!permitido()) fechar();
  else {
    let gesto = false;
    try { gesto = !!(navigator.userActivation && navigator.userActivation.isActive); } catch (_) {}
    if (gesto || vivo()) liberar();
  }
  avisarBotoes();
  return estado();
}

export function parar() {
  if (!vivo()) return;
  parado = true;
  const c = ctx;
  rampa(cad.mestre.gain, 0, c, 0.03);
  limparCamadas(c.currentTime + 0.2);
  setTimeout(() => { if (ctx === c && parado && c.state === 'running') c.suspend().catch(() => {}); }, 250);
  avisarBotoes();
}

export function estado() {
  const p = lerPref();
  return { ligado: vivo() && ctx.state === 'running' && !parado && permitido(), mudo: p.mudo, economia, reduzido };
}

// nomes do contrato da arquitetura (9.4)
export function tocar(nome, opcoes) {
  if (nome === 'tic') return tic(opcoes);
  if (nome === 'araponga' || nome === 'toin') return toin(opcoes);
  return false;
}
export function silenciar(sim = true) { return definirModo({ mudo: !!sim }); }

// ---------- botão de som (o texto sempre diz o estado: o som nunca é a única pista) ----------
function pintar(b, e) {
  const ligado = !e.mudo && !e.economia;
  b.setAttribute('aria-pressed', String(ligado));
  b.dataset.som = e.economia ? 'economia' : e.mudo ? 'mudo' : 'ligado';
  b.textContent = e.economia ? 'Som: desligado na economia' : e.mudo ? 'Som: desligado' : 'Som: ligado';
  b.disabled = e.economia;
}
function avisarBotoes() {
  const e = estado();
  for (const b of botoes) {
    if (!b.isConnected) { if (b.__visto) botoes.delete(b); continue; }
    b.__visto = true;
    pintar(b, e);
  }
}
export function botao() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'botao-som';
  b.addEventListener('click', () => {
    const mudo = !lerPref().mudo;
    definirModo({ mudo });
    if (!mudo) liberar().then((ok) => { if (ok) toin({ intensidade: 0.5 }); });
  });
  botoes.add(b);
  lerPref(); lerAmbiente(); pintar(b, estado());
  return b;
}

// ---------- renderização offline (bancada e testes) ----------
// nome: 'toin' | 'tic' | 'manha' | 'tarde' | 'noite' | 'ambiencia' (com opcoes.hora)
//       | 'varredura' (hora de opcoes.de a opcoes.ate, pesos trocados a cada 50 ms como na régua)
export async function renderizar(nome, { segundos, taxa = 48000, hora, intensidade = 1, pan = 0, de = 16, ate = 20 } = {}) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const amb = nome in FABRICAS || nome === 'ambiencia' || nome === 'varredura';
  const dur = segundos || (nome === 'toin' ? 2 : nome === 'tic' ? 0.25 : LACO_S * 2 + 2);
  const c = new OAC(2, Math.ceil(dur * taxa), taxa);
  const k = cadeia(c);
  k.mestre.gain.value = 1;
  if (nome === 'toin') vozToin(c, k, 0.01, { intensidade, pan });
  else if (nome === 'tic') vozTic(c, k, 0.01, hora);
  else if (nome === 'varredura') {
    const g = k.amb.gain;
    g.setValueAtTime(0, 0); g.linearRampToValueAtTime(1, 1); g.setValueAtTime(1, dur - 1); g.linearRampToValueAtTime(0, dur - 0.05);
    for (const n of Object.keys(FABRICAS)) {
      const cam = FABRICAS[n](c, k.amb, 0), p = cam.g.gain;
      p.setValueAtTime(pesos(de)[n] * NIVEL[n], 0);
      for (let t = 1; t < dur - 1; t += 0.05) p.setTargetAtTime(pesos(de + (ate - de) * (t - 1) / (dur - 2))[n] * NIVEL[n], t, 0.35);
      if (cam.passaros) agendarPassaros(c, cam, 0, dur - 1.2);
      cam.parar(dur);
    }
  } else if (amb) {
    const w = nome === 'ambiencia' ? pesos(paraHora(hora) ?? 12) : { manha: 0, tarde: 0, noite: 0, [nome]: 1 };
    const g = k.amb.gain;
    g.setValueAtTime(0, 0); g.linearRampToValueAtTime(1, 1); g.setValueAtTime(1, dur - 1); g.linearRampToValueAtTime(0, dur - 0.05);
    for (const n of Object.keys(FABRICAS)) {
      if (w[n] <= 0.001) continue;
      const cam = FABRICAS[n](c, k.amb, 0);
      cam.g.gain.value = w[n] * NIVEL[n];
      if (cam.passaros) agendarPassaros(c, cam, 0, dur - 1.2);
      cam.parar(dur);
    }
  } else throw new Error('som desconhecido: ' + nome);
  const buf = await c.startRendering();
  buf.lacoSegundos = amb ? LACO_S : 0;
  return buf;
}

// buffers de ruído do laço, para conferir a emenda
export function _ruidoDoLaco(taxa = 48000) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  return ruido(new OAC(1, 1, taxa));
}

export const Som = { liberar, toin, tic, ambiencia, definirModo, parar, estado, tocar, silenciar, botao, renderizar, pesos };
export default Som;
