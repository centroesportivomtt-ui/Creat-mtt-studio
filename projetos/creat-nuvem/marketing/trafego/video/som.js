/* Trilha desenhada dos Reels "Atrás da placa" (Órbita, com as receitas do Eco em assets/som/creat-som.js).
   Sem música de terceiros, sem voz: só efeitos sintetizados, renderizados offline (OfflineAudioContext,
   48 kHz, estéreo) e sincronizados por quadro com linhas.js. Ruído com semente fixa: o mesmo render sempre.
   API: CreatTrilha.render(eventos, duracao) -> { L: base64 Float32, R: base64 Float32 }.
   Vozes: rua, rua-noite, vibra, corrente, giz, tecla, tic, clique, rangido, sino, grave, plim, porta.
   sino, giz, plim e clique seguem as mesmas receitas da vitrine (parciais, filtros e envelopes). */
(function (W) {
  'use strict';
  var SR = 48000;
  function prng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function render(eventos, dur) {
    var c = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
    var rnd = prng(20261110);
    /* mestre: cola leve + limitador de segurança */
    var mestre = c.createGain(); mestre.gain.value = 0.9;
    var cola = c.createDynamicsCompressor(); cola.threshold.value = -18; cola.knee.value = 8; cola.ratio.value = 3; cola.attack.value = 0.004; cola.release.value = 0.18;
    var lim = c.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    mestre.connect(cola); cola.connect(lim); lim.connect(c.destination);
    /* sala pequena de loja (convolução gerada em código) */
    var len = Math.floor(SR * 1.1), ir = c.createBuffer(2, len, SR);
    for (var ch = 0; ch < 2; ch++) { var b = ir.getChannelData(ch); for (var j = 0; j < len; j++) b[j] = (rnd() * 2 - 1) * Math.pow(1 - j / len, 3.0); }
    var conv = c.createConvolver(); conv.buffer = ir; var eco = c.createGain(); eco.gain.value = 0.22; eco.connect(conv); conv.connect(mestre);
    /* ruído branco de 2 s com semente */
    var nR = SR * 2, ruido = c.createBuffer(1, nR, SR), d = ruido.getChannelData(0);
    for (var i = 0; i < nR; i++) d[i] = rnd() * 2 - 1;
    /* ruído rosa (Paul Kellet), para os ambientes */
    var rosa = c.createBuffer(1, nR, SR), dp = rosa.getChannelData(0), b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (i = 0; i < nR; i++) { var w = rnd() * 2 - 1; b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; dp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }

    function saida(pan, envio) {
      var no = c.createGain(), alvo = no;
      if (pan) { var sp = c.createStereoPanner(); sp.pan.value = Math.max(-1, Math.min(1, pan)); no.connect(sp); alvo = sp; }
      alvo.connect(mestre);
      if (envio) { var s = c.createGain(); s.gain.value = envio; alvo.connect(s); s.connect(eco); }
      return no;
    }
    function env(g, t0, pico, at, du) { var p = g.gain; p.setValueAtTime(0.0001, t0); p.linearRampToValueAtTime(pico, t0 + at); p.exponentialRampToValueAtTime(0.0001, t0 + du); p.linearRampToValueAtTime(0, t0 + du + 0.005); }
    function rajada(dest, t0, du, tipo, f, q, pico, at, buf) {
      var src = c.createBufferSource(); src.buffer = buf || ruido;
      var fl = c.createBiquadFilter(); fl.type = tipo; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q;
      var g = c.createGain(); env(g, t0, pico, at, du);
      src.connect(fl); fl.connect(g); g.connect(dest);
      src.start(t0, rnd() * (1.9 - du), du + 0.05); return fl;
    }
    function tom(dest, t0, f, du, pico, at, tipo, fFim) {
      var o = c.createOscillator(); o.type = tipo || 'sine'; o.frequency.setValueAtTime(f, t0);
      if (fFim) o.frequency.exponentialRampToValueAtTime(fFim, t0 + du);
      var g = c.createGain(); env(g, t0, pico, at, du); o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + du + 0.03);
    }
    function leito(t0, du, nivel, lp, hp) { /* ambiente contínuo com entrada e saída suaves */
      var src = c.createBufferSource(); src.buffer = rosa; src.loop = true;
      var f1 = c.createBiquadFilter(); f1.type = 'lowpass'; f1.frequency.value = lp;
      var f2 = c.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = hp;
      var g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(nivel, t0 + 0.25);
      g.gain.setValueAtTime(nivel, t0 + du - 0.5); g.gain.linearRampToValueAtTime(0.0001, t0 + du);
      src.connect(f1); f1.connect(f2); f2.connect(g); g.connect(saida(0, 0)); src.start(t0); src.stop(t0 + du + 0.05);
      return g;
    }

    var V = {
      /* rua de manhã ao fundo (cerca de -30 dB dos efeitos): rumor rosa + uma moto distante passando */
      rua: function (t, e) {
        leito(t, e.dur, 0.05, 1400, 90);
        var o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(78, t + 0.2); o.frequency.linearRampToValueAtTime(96, t + 1.4); o.frequency.linearRampToValueAtTime(84, t + e.dur);
        var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; var g = c.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.012, t + 1.2); g.gain.linearRampToValueAtTime(0.0001, t + e.dur);
        var p = c.createStereoPanner(); p.pan.setValueAtTime(-0.6, t); p.pan.linearRampToValueAtTime(0.6, t + e.dur);
        o.connect(f); f.connect(g); g.connect(p); p.connect(mestre); o.start(t); o.stop(t + e.dur);
        /* dois pios curtos, longe */
        [0.55, 1.65].forEach(function (k, n) { var tt = t + k, o2 = saida(n ? 0.5 : -0.4, 0.3); tom(o2, tt, 3900, 0.07, 0.012, 0.01, 'sine', 4700); tom(o2, tt + 0.09, 4300, 0.06, 0.009, 0.01, 'sine', 5100); });
      },
      /* rua à noite: rumor mais grave e grilos bem baixos */
      'rua-noite': function (t, e) {
        leito(t, e.dur, 0.042, 700, 60);
        for (var k = 0.2; k < e.dur - 0.4; k += 0.62) {
          var o2 = saida((k % 1.2) > 0.6 ? 0.55 : -0.55, 0.2);
          for (var z = 0; z < 3; z++) tom(o2, t + k + z * 0.045, 4650, 0.03, 0.006, 0.004);
        }
      },
      /* tom de sala: leito quase inaudível para o silêncio limpo não soar como áudio quebrado */
      sala: function (t, e) { leito(t, e.dur, 0.014, 520, 70); },
      /* vibração abafada do celular: dois pulsos curtos */
      vibra: function (t, e) {
        [0, 0.2].forEach(function (k) {
          var o = c.createOscillator(); o.type = 'square'; o.frequency.value = 148;
          var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; f.Q.value = 0.8;
          var g = c.createGain(); env(g, t + k, 0.22 * e.forca, 0.01, 0.15);
          o.connect(f); f.connect(g); g.connect(saida(0, 0.05)); o.start(t + k); o.stop(t + k + 0.18);
          rajada(saida(0, 0), t + k, 0.14, 'lowpass', 260, 0.7, 0.12 * e.forca, 0.008);
        });
      },
      /* dois elos de corrente tilintando: parciais inarmônicos curtos */
      corrente: function (t, e) {
        var out = saida((rnd() - 0.5) * 0.5, 0.35);
        [0, 0.028 + rnd() * 0.02, 0.07 + rnd() * 0.02].forEach(function (k, n) {
          var f = 2900 + rnd() * 900, fo = e.forca * (n === 0 ? 1 : n === 1 ? 0.6 : 0.35);
          [[1, 0.09], [1.53, 0.06], [2.31, 0.035], [3.12, 0.02]].forEach(function (p) { tom(out, t + k, f * p[0], 0.08 + rnd() * 0.06, p[1] * fo, 0.001); });
          rajada(out, t + k, 0.01, 'highpass', 6500, 0.7, 0.06 * fo, 0.001);
        });
      },
      /* giz (receita da vitrine): ruído em banda, cor diferente a cada letra */
      giz: function (t, e) {
        var out = saida((rnd() - 0.5) * 0.4, 0);
        var centro = 2600 + rnd() * 1500, du = 0.028 + rnd() * 0.014;
        var f = rajada(out, t, du, 'bandpass', centro * 1.1, 1.1, 0.5 * e.forca, 0.003);
        f.frequency.exponentialRampToValueAtTime(centro * 0.85, t + du);
        rajada(out, t + 0.006, 0.012, 'highpass', 5500, 0.8, 0.16 * e.forca, 0.002);
      },
      /* tecla do celular: toque baixo e seco */
      tecla: function (t, e) {
        var out = saida((rnd() - 0.5) * 0.2, 0);
        rajada(out, t, 0.012, 'bandpass', 2300 + rnd() * 400, 1.4, 0.22 * e.forca, 0.001);
        tom(out, t, 210, 0.03, 0.12 * e.forca, 0.002, 'sine', 150);
      },
      /* tic seco do anel de giz pousando */
      tic: function (t, e) {
        var out = saida(0, 0.12);
        rajada(out, t, 0.012, 'bandpass', 3100, 1.6, 0.5 * e.forca, 0.001);
        tom(out, t, 1900, 0.035, 0.16 * e.forca, 0.001, 'sine', 1100);
      },
      /* clique (receita da vitrine): botão de madeira */
      clique: function (t, e) {
        var out = saida(0, 0.1);
        rajada(out, t, 0.018, 'bandpass', 2000, 2, 0.42 * e.forca, 0.002);
        tom(out, t, 1400, 0.03, 0.13 * e.forca, 0.002, 'sine', 900);
      },
      /* rangido curto da corrente: atrito em pulsos irregulares numa ressonância de metal */
      rangido: function (t, e) {
        var du = 0.26, n = Math.floor(SR * du), buf = c.createBuffer(1, n, SR), a = buf.getChannelData(0), pos = 0;
        while (pos < n) { var per = Math.floor(SR * (0.0075 + rnd() * 0.004 + 0.004 * pos / n)); var amp = Math.sin(Math.PI * pos / n); for (var z = 0; z < 60 && pos + z < n; z++) a[pos + z] += amp * Math.exp(-z / 9) * (z % 2 ? -1 : 1); pos += per; }
        var src = c.createBufferSource(); src.buffer = buf;
        var f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 980; f1.Q.value = 5;
        var f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 2350; f2.Q.value = 7;
        var g = c.createGain(); g.gain.value = 0.55 * e.forca; var out = saida(0.15, 0.3);
        src.connect(f1); src.connect(f2); f1.connect(g); f2.connect(g); g.connect(out); src.start(t);
      },
      /* sino de porta (receita da vitrine): dois sininhos de latão, badalo que quica, cauda de sala */
      sino: function (t, e) {
        var P = [[1, 1.0, 0.95], [2.08, 0.5, 0.62], [2.76, 0.36, 0.46], [3.9, 0.18, 0.3], [5.43, 0.09, 0.2]];
        function batida(tt, f0, forca, pan) {
          var out = saida(pan, 0.9), det = 1 + (rnd() - 0.5) * 0.008;
          P.forEach(function (p) { tom(out, tt, f0 * p[0] * det, p[2] * (0.6 + 0.4 * forca) * 1.6, 0.16 * p[1] * forca * e.forca, 0.002); });
          rajada(out, tt, 0.008, 'highpass', 7000, 0.7, 0.08 * forca * e.forca, 0.001);
        }
        var A = 1568, B = 2093;
        [[0, 1], [0.09, 0.62], [0.2, 0.38], [0.34, 0.2]].forEach(function (s) { batida(t + s[0], A, s[1], -0.18); });
        [[0.045, 0.7], [0.15, 0.42], [0.27, 0.22]].forEach(function (s) { batida(t + s[0], B, s[1], 0.2); });
      },
      /* tom grave curto de "lado de dentro" */
      grave: function (t, e) {
        var out = saida(0, 0.25);
        tom(out, t, 98, 1.1, 0.34 * e.forca, 0.03);
        tom(out, t, 147, 0.8, 0.12 * e.forca, 0.03);
        tom(out, t, 196, 0.45, 0.05 * e.forca, 0.02);
        rajada(out, t, 0.5, 'lowpass', 300, 0.7, 0.05 * e.forca, 0.08);
      },
      /* plim (receita da vitrine): mi6 -> lá6 */
      plim: function (t, e) {
        var out = saida(0.1, 0.6);
        tom(out, t, 1318.5, 0.12, 0.34 * e.forca, 0.004); tom(out, t, 2637, 0.06, 0.06 * e.forca, 0.003);
        tom(out, t + 0.075, 1760, 0.32, 0.4 * e.forca, 0.004); tom(out, t + 0.075, 3520, 0.12, 0.06 * e.forca, 0.003);
      },
      /* tic de papel (R9): a comanda trocando de mão; um sopro de papel agudo e um toque surdo no balcão */
      papel: function (t, e) {
        var out = saida((rnd() - 0.5) * 0.3, 0.1);
        var f = rajada(out, t, 0.05, 'bandpass', 4200 + rnd() * 600, 0.9, 0.3 * e.forca, 0.002);
        f.frequency.exponentialRampToValueAtTime(2600, t + 0.05);
        tom(out, t + 0.004, e.grave ? 150 : 240, 0.05, (e.grave ? 0.26 : 0.14) * e.forca, 0.002, 'sine', e.grave ? 95 : 160);
      },
      /* carimbo (R9): batida seca de borracha na madeira, sem eco */
      carimbo: function (t, e) {
        var out = saida(0, 0.12);
        tom(out, t, 120, 0.12, 0.5 * e.forca, 0.002, 'sine', 62);
        rajada(out, t, 0.03, 'lowpass', 900, 0.8, 0.45 * e.forca, 0.001);
        rajada(out, t + 0.002, 0.012, 'bandpass', 2400, 1.2, 0.16 * e.forca, 0.001);
      },
      /* porta de aço de enrolar subindo (0,9 s): lâminas batendo no trilho, ronco do eixo e a trava no fim */
      porta: function (t, e) {
        var out = saida(0, 0.35), du = 0.9;
        var k = 0, tt = 0;
        while (tt < du - 0.06) {
          var x = tt / du, rate = 18 + 26 * Math.sin(Math.PI * Math.min(1, x * 1.15));
          var fo = e.forca * (0.55 + 0.45 * Math.sin(Math.PI * x));
          rajada(out, t + tt, 0.022, 'bandpass', 1100 + rnd() * 500, 3, 0.28 * fo, 0.001);
          rajada(out, t + tt + 0.004, 0.012, 'bandpass', 2600 + rnd() * 900, 5, 0.12 * fo, 0.001);
          tt += 1 / rate; k++;
        }
        var src = c.createBufferSource(); src.buffer = rosa;
        var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(180, t); f.frequency.linearRampToValueAtTime(420, t + du);
        var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5 * e.forca, t + 0.15); g.gain.setValueAtTime(0.5 * e.forca, t + du - 0.12); g.gain.linearRampToValueAtTime(0.0001, t + du);
        src.connect(f); f.connect(g); g.connect(out); src.start(t, 0.3, du + 0.1);
        /* trava no topo */
        tom(out, t + du - 0.03, 82, 0.22, 0.4 * e.forca, 0.003, 'sine', 55);
        rajada(out, t + du - 0.03, 0.05, 'bandpass', 900, 2, 0.35 * e.forca, 0.001);
      }
    };
    eventos.forEach(function (ev) { var f = V[ev.voz]; if (f) f(Math.max(0.001, ev.t), ev); });
    return c.startRendering().then(function (buf) {
      function b64(f32) { var u8 = new Uint8Array(f32.buffer), s = '', CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
      return { L: b64(buf.getChannelData(0)), R: b64(buf.getChannelData(1)) };
    });
  }
  W.CreatTrilha = { render: render };
})(window);
