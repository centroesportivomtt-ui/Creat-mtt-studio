// Som da claquete (onda 4): um só som, a batida ao aprovar, 120 ms e volume baixo. Desligado por padrão; liga em Sistema.
// Feito na hora com Web Audio (ruído curto + batida grave): nada para baixar, nada de arquivo de terceiros.
const CHAVE = 'ec-som-claquete';
export function somLigado(): boolean {
  try { return localStorage.getItem(CHAVE) === '1'; } catch { return false; }
}
export function ligarSom(sim: boolean) {
  try { if (sim) localStorage.setItem(CHAVE, '1'); else localStorage.removeItem(CHAVE); } catch { /* aba privada: fica desligado */ }
}
let ctx: AudioContext | null = null;
export function baterClaquete(forcar = false) {
  if (!forcar && !somLigado()) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    // o iPhone suspende o áudio quando a tela trava ou a aba vai para o fundo: retoma dentro do toque
    if (ctx.state !== 'running') void ctx.resume();
    const t = ctx.currentTime;
    const dur = 0.12;
    // estalo: ruído branco com queda rápida, passa-alta para soar como madeira
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
    const ruido = ctx.createBufferSource();
    ruido.buffer = buf;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'highpass';
    filtro.frequency.value = 1400;
    const g1 = ctx.createGain();
    g1.gain.value = 0.22;
    ruido.connect(filtro).connect(g1).connect(ctx.destination);
    // batida grave curta
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + dur);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.18, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g2).connect(ctx.destination);
    ruido.start(t); osc.start(t); osc.stop(t + dur);
  } catch { /* sem áudio no aparelho: segue em silêncio */ }
}
