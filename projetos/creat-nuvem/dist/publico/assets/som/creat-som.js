/*
 * creat-som.js · Porta Aberta (T7 · Eco, designer de som)
 * Script clássico, sem dependências, sem arquivos de áudio: tudo sintetizado em Web Audio.
 *
 * Contrato (docs/CONTRATOS-DETALHE.md, item b), global window.CreatSom:
 *   armar(): void              idempotente; ouve pointerdown/pointerup/touchend/keydown/click.
 *                              O AudioContext só nasce no primeiro gesto.
 *   sino(): void               sininho de porta de loja (o momento ABERTO)
 *   giz(): void                uma batida de giz por letra (no máximo 1 a cada 60 ms)
 *   plim(): void               notificação (a prévia chegou no WhatsApp de teste)
 *   clique(): void             confirmação curta (escolher nicho, plano, ligar o som)
 *   silenciar(mudo?): boolean  sem argumento alterna; devolve o estado mudo
 *   mudo: boolean              leitura
 *   estado: object             leitura, só para depuração e testes
 *
 * Regras:
 *  - Antes do gesto, com a aba oculta, em mudo ou com prefers-reduced-motion: no-op (não enfileira).
 *  - Mudo em localStorage['creat:som'] = 'on' | 'off' (padrão 'on'), com try/catch e memória.
 *    Cada mudança dispara window CustomEvent('creat:som', {detail:{mudo}}), inclusive vinda de outra aba.
 *  - Ganho mestre 0,22 + compressor-limitador: picos abaixo de -18 dBFS nos microssons.
 *  - Toda voz tem rampa de ataque e soltura exponencial: nada de corte seco.
 *  - Aba oculta: o contexto é suspenso; ao voltar, retoma só se já houve gesto e o som está ligado.
 *  - Sem Web Audio: tudo vira no-op silencioso.
 */
(function () {
  'use strict';
  var W = window, D = document;
  if (W.CreatSom && W.CreatSom.__creat) return; // carregado duas vezes: mantém o primeiro

  var CHAVE = 'creat:som';
  var GANHO_MESTRE = 0.22;
  var INTERVALO_GIZ = 60;      // ms, contrato
  var ESPERA_RETOMADA = 300;   // ms: som pedido no próprio gesto espera o resume() por no máximo isso
  var GESTOS = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'];

  var Ctor = W.AudioContext || W.webkitAudioContext || null;
  var ctx = null, mestre = null, eco = null, ruido = null;
  var armado = false, ouvindo = false, destravado = false;
  var retomando = null;        // promessa do resume() em curso
  var ultimoGiz = -1e9;

  function agora() { return (W.performance && performance.now) ? performance.now() : Date.now(); }

  /* ---------------- mudo persistido ---------------- */
  var memoria = 'on';
  function lerEstado() {
    try { var v = W.localStorage.getItem(CHAVE); return v === 'off' ? 'off' : 'on'; } catch (e) { return memoria; }
  }
  function gravarEstado(v) {
    memoria = v;
    try { W.localStorage.setItem(CHAVE, v); } catch (e) {}
  }
  var estadoSom = lerEstado();
  function mudo() { return estadoSom === 'off'; }
  function avisar() {
    try { W.dispatchEvent(new CustomEvent('creat:som', { detail: { mudo: mudo() } })); } catch (e) {}
  }

  /* ---------------- condições ---------------- */
  var RM = null;
  try { RM = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e) { RM = null; }
  function reduzido() { return !!(RM && RM.matches); }
  function oculto() { return D.visibilityState === 'hidden' || D.hidden === true; }
  function podeSoar() { return !!Ctor && destravado && !mudo() && !oculto() && !reduzido(); }

  /* ---------------- contexto (só depois do gesto) ---------------- */
  function montarGrafo(c) {
    mestre = c.createGain();
    mestre.gain.value = GANHO_MESTRE;
    var lim = c.createDynamicsCompressor(); // rede de segurança contra picos
    lim.threshold.value = -20; lim.knee.value = 6; lim.ratio.value = 6;
    lim.attack.value = 0.002; lim.release.value = 0.1;
    mestre.connect(lim); lim.connect(c.destination);

    // ruído branco de 0,25 s, gerado uma vez
    var n = Math.floor(c.sampleRate * 0.25);
    ruido = c.createBuffer(1, n, c.sampleRate);
    var d = ruido.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

    // reverb por convolução gerada em código: 0,7 s de cauda, sala pequena de loja
    try {
      var len = Math.floor(c.sampleRate * 0.7);
      var ir = c.createBuffer(2, len, c.sampleRate);
      for (var ch = 0; ch < 2; ch++) {
        var b = ir.getChannelData(ch);
        for (var j = 0; j < len; j++) b[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 3.2);
      }
      var conv = c.createConvolver();
      conv.buffer = ir;
      eco = c.createGain();
      eco.gain.value = 0.16;
      eco.connect(conv); conv.connect(mestre);
    } catch (e) { eco = null; }
  }

  function garantirContexto() {
    if (!Ctor) return null;
    try {
      if (!ctx) { ctx = new Ctor(); montarGrafo(ctx); }
    } catch (e) { ctx = null; Ctor = null; return null; }
    return ctx;
  }

  function retomar() {
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed' || !ctx.resume) return retomando;
    if (retomando) return retomando;
    try {
      retomando = ctx.resume().then(function () { retomando = null; conferirRodando(); },
                                    function () { retomando = null; });
    } catch (e) { retomando = null; }
    return retomando;
  }

  function soltarOuvintes() {
    if (!ouvindo) return;
    ouvindo = false;
    GESTOS.forEach(function (t) { W.removeEventListener(t, destravar, true); });
  }
  function conferirRodando() { if (ctx && ctx.state === 'running') soltarOuvintes(); }

  // No toque, pointerdown não ativa áudio (só pointerup/touchend/click/keydown):
  // os ouvintes ficam até o contexto estar de fato 'running'.
  function destravar(ev) {
    if (ev && ev.isTrusted === false) return; // evento sintético não é gesto
    if (ev && ev.type === 'keydown' && ev.key === 'Escape') return; // Esc não ativa áudio (spec HTML)
    destravado = true;
    if (mudo() || reduzido()) return; // não cria contexto à toa; nasce quando o som for ligado
    var c = garantirContexto();
    if (!c) { soltarOuvintes(); return; }
    try { // iOS antigo: uma amostra muda dentro do gesto libera a saída
      var b = c.createBufferSource();
      b.buffer = c.createBuffer(1, 1, c.sampleRate);
      b.connect(c.destination); b.start(0);
    } catch (e) {}
    if (!oculto()) retomar();
    conferirRodando();
  }

  function armar() {
    if (armado) return;
    armado = true;
    if (!Ctor) return;
    GESTOS.forEach(function (t) { W.addEventListener(t, destravar, { capture: true, passive: true }); });
    ouvindo = true;
  }

  // Executa a voz agora, ou logo após o resume() se o pedido veio no próprio gesto.
  // Nunca enfileira antes do gesto nem enquanto a aba está oculta.
  function tocar(voz) {
    if (!podeSoar()) return;
    var c = garantirContexto(); if (!c) return;
    if (c.state === 'running') { conferirRodando(); try { voz(c); } catch (e) {} return; }
    var pedido = agora();
    var p = retomar();
    if (!p) return;
    p.then(function () {
      if (agora() - pedido > ESPERA_RETOMADA) return;
      if (podeSoar() && ctx && ctx.state === 'running') { try { voz(ctx); } catch (e) {} }
    }, function () {});
  }

  /* ---------------- blocos ---------------- */
  function envelope(g, t0, pico, ataque, dur) {
    var p = g.gain;
    p.setValueAtTime(0.0001, t0);
    p.linearRampToValueAtTime(pico, t0 + ataque);
    p.exponentialRampToValueAtTime(0.0001, t0 + dur);
    p.linearRampToValueAtTime(0, t0 + dur + 0.005);
  }

  function saida(c, pan, envio) {
    var no = c.createGain();
    var alvo = no;
    if (c.createStereoPanner && pan) {
      var sp = c.createStereoPanner(); sp.pan.value = Math.max(-1, Math.min(1, pan));
      no.connect(sp); alvo = sp;
    }
    alvo.connect(mestre);
    if (envio && eco) { var s = c.createGain(); s.gain.value = envio; alvo.connect(s); s.connect(eco); }
    return no;
  }

  function rajada(c, destino, t0, dur, tipo, freq, q, pico, ataque) {
    var src = c.createBufferSource(); src.buffer = ruido;
    var f = c.createBiquadFilter(); f.type = tipo; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    var g = c.createGain(); envelope(g, t0, pico, ataque, dur);
    src.connect(f); f.connect(g); g.connect(destino);
    var off = Math.random() * Math.max(0, ruido.duration - dur - 0.03);
    src.start(t0, off, dur + 0.02); src.stop(t0 + dur + 0.03);
    return f;
  }

  function tom(c, destino, t0, freq, dur, pico, ataque, tipo, freqFim) {
    var o = c.createOscillator(); o.type = tipo || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (freqFim) o.frequency.exponentialRampToValueAtTime(freqFim, t0 + dur);
    var g = c.createGain(); envelope(g, t0, pico, ataque, dur);
    o.connect(g); g.connect(destino);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  /* ---------------- vozes ---------------- */
  // Sininho de porta: dois sininhos de latão numa mola, batidos pela porta que abre.
  // Parciais inarmônicos (razões de sino pequeno), decaimento mais longo no grave,
  // badalo que quica (batidas cada vez mais fracas) e cauda curta de sala.
  var PARCIAIS = [[1, 1.0, 0.95], [2.08, 0.5, 0.62], [2.76, 0.36, 0.46], [3.9, 0.18, 0.3], [5.43, 0.09, 0.2]];
  function batida(c, t, f0, forca, pan) {
    var out = saida(c, pan, 0.9);
    var det = 1 + (Math.random() - 0.5) * 0.008;
    for (var i = 0; i < PARCIAIS.length; i++) {
      var p = PARCIAIS[i];
      tom(c, out, t, f0 * p[0] * det, p[2] * (0.6 + 0.4 * forca), 0.16 * p[1] * forca, 0.002);
    }
    rajada(c, out, t, 0.008, 'highpass', 7000, 0.7, 0.08 * forca, 0.001); // o "t" do metal
  }
  function vozSino(c) {
    var t0 = c.currentTime + 0.01;
    var A = 1568, B = 2093;                 // sol6 e dó7: quarta justa, soa "loja", não alarme
    [[0, 1], [0.09, 0.62], [0.2, 0.38], [0.34, 0.2]].forEach(function (s) { batida(c, t0 + s[0], A, s[1], -0.18); });
    [[0.045, 0.7], [0.15, 0.42], [0.27, 0.22]].forEach(function (s) { batida(c, t0 + s[0], B, s[1], 0.2); });
  }

  // Giz: ruído filtrado curtinho, cor um pouco diferente a cada letra, leve vaivém no panorama.
  function vozGiz(c) {
    var t0 = c.currentTime + 0.003;
    var out = saida(c, (Math.random() - 0.5) * 0.4, 0);
    var centro = 2600 + Math.random() * 1500;
    var dur = 0.028 + Math.random() * 0.014;
    var f = rajada(c, out, t0, dur, 'bandpass', centro * 1.1, 1.1, 0.55, 0.003);
    f.frequency.exponentialRampToValueAtTime(centro * 0.85, t0 + dur);
    rajada(c, out, t0 + 0.006, 0.012, 'highpass', 5500, 0.8, 0.18, 0.002); // grão
  }

  // Plim: duas notas subindo (mi6 → lá6), seno com um pouco de 2º harmônico, cauda curta.
  function vozPlim(c) {
    var t0 = c.currentTime + 0.005;
    var out = saida(c, 0.1, 0.6);
    tom(c, out, t0, 1318.5, 0.12, 0.34, 0.004);
    tom(c, out, t0, 2637, 0.06, 0.06, 0.003);
    tom(c, out, t0 + 0.075, 1760, 0.26, 0.4, 0.004);
    tom(c, out, t0 + 0.075, 3520, 0.1, 0.06, 0.003);
  }

  // Clique: estalo de 20 ms com um seno que cai, como botão de madeira.
  function vozClique(c) {
    var t0 = c.currentTime + 0.003;
    var out = saida(c, 0, 0);
    rajada(c, out, t0, 0.018, 'bandpass', 2000, 2, 0.45, 0.002);
    tom(c, out, t0, 1400, 0.03, 0.14, 0.002, 'sine', 900);
  }

  /* ---------------- aba oculta ---------------- */
  D.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    if (oculto()) { if (ctx.state === 'running' && ctx.suspend) ctx.suspend().catch(function () {}); }
    else if (destravado && !mudo() && !reduzido()) retomar();
  });

  /* ---------------- mudo ---------------- */
  var timerSuspender = 0;
  function aplicar(novo) {
    var mudou = novo !== estadoSom;
    estadoSom = novo;
    if (mudo()) {
      clearTimeout(timerSuspender);
      // deixa terminar o que já soava e economiza bateria
      timerSuspender = setTimeout(function () { if (mudo() && ctx && ctx.state === 'running' && ctx.suspend) ctx.suspend().catch(function () {}); }, 400);
    }
    return mudou;
  }

  function silenciar(m) {
    var novo = (typeof m === 'boolean') ? (m ? 'off' : 'on') : (mudo() ? 'on' : 'off');
    var mudou = aplicar(novo);
    gravarEstado(novo);
    if (mudou && !mudo()) tocar(vozClique); // confirma que o som voltou (só se já houve gesto)
    avisar();
    return mudo();
  }

  // Outra aba mudou a preferência: acompanha e avisa a UI.
  W.addEventListener('storage', function (e) {
    if (e.key !== CHAVE) return;
    if (aplicar(e.newValue === 'off' ? 'off' : 'on')) avisar();
  });

  /* ---------------- API ---------------- */
  var api = {
    __creat: true,
    armar: armar,
    sino: function () { tocar(vozSino); },
    giz: function () {
      var t = agora();
      if (t - ultimoGiz < INTERVALO_GIZ) return;
      if (!podeSoar()) return;
      ultimoGiz = t;
      tocar(vozGiz);
    },
    plim: function () { tocar(vozPlim); },
    clique: function () { tocar(vozClique); },
    silenciar: silenciar
  };
  Object.defineProperty(api, 'mudo', { get: mudo, enumerable: true });
  Object.defineProperty(api, 'estado', {
    enumerable: false,
    get: function () {
      return { suportado: !!Ctor, armado: armado, gesto: destravado, contexto: ctx ? ctx.state : 'nenhum',
               mudo: mudo(), oculto: oculto(), reduzido: reduzido() };
    }
  });
  W.CreatSom = api;

  // Arma sozinho: ouvir gestos não cria contexto nem toca nada. Assim /abrir/ e /obrigado/
  // funcionam mesmo se a página não chamar armar(); a vitrine chamar de novo é inofensivo.
  armar();
})();
