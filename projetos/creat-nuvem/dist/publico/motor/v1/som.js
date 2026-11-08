/*
 * motor/v1/som.js · som opcional do motor v1 (nasce do som.js do Fio no Couro, Eco)
 * Tudo sintetizado em Web Audio. Nenhum arquivo de áudio, nenhuma requisição.
 *
 * Regras:
 *  - Silêncio total até um gesto que ativa áudio (pointerup/touchend/click/keydown);
 *    ouvintes só saem quando o AudioContext está 'running'.
 *  - Microssons < 150 ms, ganho mestre ~0,25, rampas sem estalo.
 *  - Mudo guardado no aparelho em 'site:<slug>:som' = 'on' | 'off' (padrão 'on');
 *    na prévia só em memória. Com prefers-reduced-motion o ritual não emite passadas.
 *  - Aba oculta: o contexto é suspenso; nada é enfileirado.
 *  - Sem AudioContext: no-op silencioso.
 *
 * Eventos ouvidos em window (ver efeito.js e agendamento.js):
 *  ritual:passada {sentido, velocidade} → chhk (máx. 1 a cada 90 ms)
 *  ritual:afiada                        → tiiing + trava ~350 ms depois
 *  motor:pedido                         → trava (o pedido saiu para o WhatsApp)
 *
 * Depuração: window.CreatMotorSom.tocar('chhk'|'chhkVolta'|'tiiing'|'trava'|'clique'), .mudo
 */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : null;
  if (!W || !W.document) return;
  var D = W.document;
  var armazem = null;   /* chega do motor (ctx.armazem); antes disso, memória */
  var GANHO_MESTRE = 0.25;
  var INTERVALO_CHHK = 90; // ms

  var Ctor = W.AudioContext || W.webkitAudioContext || null;
  var ctx = null, mestre = null, ruido = null;
  var destravado = false;
  var ultimoChhk = 0;

  /* ---------- estado de mudo ---------- */
  function lerEstado() {
    try { return armazem && armazem.ler('som') === 'off' ? 'off' : 'on'; } catch (e) { return 'on'; }
  }
  function gravarEstado(v) {
    try { if (armazem) armazem.gravar('som', v); } catch (e) {}
  }
  var estado = 'on';
  function ligado() { return estado === 'on'; }

  /* ---------- contexto (só depois do gesto) ---------- */
  function garantirContexto() {
    if (!Ctor) return null;
    try {
      if (!ctx) {
        ctx = new Ctor();
        mestre = ctx.createGain();
        mestre.gain.value = GANHO_MESTRE;
        // compressor leve como rede de segurança contra picos
        var comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -20; comp.knee.value = 6; comp.ratio.value = 4;
        comp.attack.value = 0.002; comp.release.value = 0.08;
        mestre.connect(comp); comp.connect(ctx.destination);
        // um único buffer de ruído branco (0,25 s), gerado uma vez
        var n = Math.floor(ctx.sampleRate * 0.25);
        ruido = ctx.createBuffer(1, n, ctx.sampleRate);
        var d = ruido.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(function () {});
    } catch (e) { ctx = null; return null; }
    return ctx;
  }

  // Gestos que ativam áudio. No toque, pointerdown NÃO conta (spec HTML: só
  // pointerup/touchend/click/keydown); por isso os ouvintes ficam até o contexto
  // estar de fato 'running', e cada gesto tenta de novo.
  var GESTOS = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'];
  var ouvindo = false;
  function soltarOuvintes() {
    if (!ouvindo) return;
    ouvindo = false;
    GESTOS.forEach(function (t) { W.removeEventListener(t, destravar, true); });
  }
  function conferirRodando() {
    if (ctx && ctx.state === 'running') soltarOuvintes();
  }
  function destravar() {
    destravado = true;
    var c = garantirContexto();
    if (!c) { soltarOuvintes(); return; } // sem Web Audio: no-op
    // iOS antigo: tocar 1 amostra muda dentro do gesto ajuda a liberar a saída
    try {
      var b = c.createBufferSource();
      b.buffer = c.createBuffer(1, 1, c.sampleRate);
      b.connect(c.destination); b.start(0);
    } catch (e) {}
    conferirRodando();
    if (c.state !== 'running' && c.resume) {
      c.resume().then(conferirRodando, function () {});
    }
  }
  GESTOS.forEach(function (t) {
    W.addEventListener(t, destravar, { capture: true, passive: true });
  });
  ouvindo = true;

  function pronto() {
    if (!destravado || !ligado() || !Ctor || D.hidden) return null;
    var c = garantirContexto();
    // suspenso: currentTime parado, agendar aqui empilharia sons num t0 só
    // e tocaria tudo junto ao voltar. Descarta em vez de enfileirar.
    if (!c || c.state !== 'running') return null;
    return c;
  }

  /* ---------- blocos ---------- */
  // envelope: ataque linear curto, soltura exponencial, nunca corte seco
  function envelope(g, t0, pico, ataque, dur) {
    var p = g.gain;
    p.cancelScheduledValues(t0);
    p.setValueAtTime(0.0001, t0);
    p.linearRampToValueAtTime(pico, t0 + ataque);
    p.exponentialRampToValueAtTime(0.0001, t0 + dur);
    p.linearRampToValueAtTime(0, t0 + dur + 0.005);
  }

  function rajadaRuido(c, t0, dur, filtroTipo, freq, q, pico, ataque) {
    var src = c.createBufferSource();
    src.buffer = ruido;
    var f = c.createBiquadFilter();
    f.type = filtroTipo; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    var g = c.createGain();
    envelope(g, t0, pico, ataque, dur);
    src.connect(f); f.connect(g); g.connect(mestre);
    // offset aleatório no buffer para cada passada soar diferente
    var off = Math.random() * Math.max(0, ruido.duration - dur - 0.02);
    src.start(t0, off, dur + 0.02);
    src.stop(t0 + dur + 0.03);
    return f;
  }

  function seno(c, t0, freq, dur, pico, ataque, freqFim) {
    var o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (freqFim) o.frequency.exponentialRampToValueAtTime(freqFim, t0 + dur);
    var g = c.createGain();
    envelope(g, t0, pico, ataque, dur);
    o.connect(g); g.connect(mestre);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  /* ---------- sons ---------- */
  // chhk: lâmina no couro. Ida 3,5 kHz, volta 2,4 kHz (mais grave). 60–110 ms.
  function chhk(sentido, velocidade) {
    var c = pronto(); if (!c) return;
    var v = Math.max(0, Math.min(1, +velocidade || 0));
    var volta = sentido === -1;
    var t0 = c.currentTime + 0.005;
    var dur = 0.06 + 0.05 * v;
    var pico = 0.9 * (0.3 + 0.7 * v);
    var centro = volta ? 2400 : 3500;
    var f = rajadaRuido(c, t0, dur, 'bandpass', centro * 1.12, 1.4, pico, 0.008);
    // leve queda de tom ao longo da passada: o couro "puxa"
    f.frequency.exponentialRampToValueAtTime(centro * 0.88, t0 + dur);
  }

  // tiiing: aço afiado. Parciais inarmônicas com decaimento de ~140 ms.
  function tiiing() {
    var c = pronto(); if (!c) return;
    var t0 = c.currentTime + 0.005;
    seno(c, t0, 2600, 0.14, 0.32, 0.003);
    seno(c, t0, 3950, 0.11, 0.18, 0.003);
    seno(c, t0, 5300, 0.08, 0.10, 0.002);
    rajadaRuido(c, t0, 0.012, 'highpass', 6000, 0.7, 0.12, 0.001); // o "t" do contato
  }

  // trava: clique grave duplo da cadeira hidráulica (15 ms entre os dois).
  function trava() {
    var c = pronto(); if (!c) return;
    var t0 = c.currentTime + 0.005;
    [0, 0.015].forEach(function (dt, i) {
      var t = t0 + dt;
      var pico = i === 0 ? 0.9 : 0.65;
      rajadaRuido(c, t, 0.025, 'lowpass', 900, 0.9, pico, 0.002);
      seno(c, t, 120, 0.035, pico * 0.7, 0.002, 90);
    });
  }

  // clique: confirmação curtinha ao ligar o som.
  function clique() {
    var c = pronto(); if (!c) return;
    var t0 = c.currentTime + 0.005;
    rajadaRuido(c, t0, 0.018, 'bandpass', 2000, 2, 0.5, 0.002);
    seno(c, t0, 1400, 0.03, 0.15, 0.002, 900);
  }

  var tabela = {
    chhk: function () { chhk(1, 0.7); },
    chhkVolta: function () { chhk(-1, 0.7); },
    tiiing: tiiing,
    trava: trava,
    clique: clique
  };

  /* ---------- eventos ---------- */
  W.addEventListener('ritual:passada', function (e) {
    var agora = (W.performance && performance.now) ? performance.now() : Date.now();
    if (agora - ultimoChhk < INTERVALO_CHHK) return;
    ultimoChhk = agora;
    var d = (e && e.detail) || {};
    chhk(d.sentido, d.velocidade);
  });

  W.addEventListener('ritual:afiada', function () {
    tiiing();
    setTimeout(trava, 350);
  });

  W.addEventListener('motor:pedido', function () { trava(); });
  // 'ritual:confirmar': intencionalmente sem som (a validação pode falhar).

  /* aba oculta: suspende; volta só quando a aba aparece de novo */
  D.addEventListener('visibilitychange', function () {
    if (!ctx) return;
    try {
      if (D.hidden && ctx.state === 'running' && ctx.suspend) ctx.suspend().catch(function () {});
      else if (!D.hidden && ligado() && ctx.state === 'suspended' && ctx.resume) ctx.resume().catch(function () {});
    } catch (e) {}
  });

  /* ---------- botão de som ---------- */
  function textos() {
    var ui = W.CreatMotor && W.CreatMotor.estado && W.CreatMotor.estado.ui;
    return {
      ligar: (ui && ui.somLigar) || 'Ligar o som',
      desligar: (ui && ui.somDesligar) || 'Desligar o som'
    };
  }

  function pintarBotao(btn) {
    if (!btn) return;
    var t = textos();
    // nome acessível fixo ('Som', vem do HTML); o estado vai só em aria-pressed
    btn.setAttribute('aria-pressed', ligado() ? 'true' : 'false');
    btn.setAttribute('title', ligado() ? t.desligar : t.ligar);
    btn.setAttribute('data-som', estado);
  }

  function iniciarBotao() {
    var btn = D.getElementById('alternar-som');
    if (!btn) return;
    pintarBotao(btn);
    btn.addEventListener('click', function () {
      destravar();
      estado = ligado() ? 'off' : 'on';
      gravarEstado(estado);
      pintarBotao(btn);
      if (ligado()) {
        // contexto pode estar voltando (resume é assíncrono): toca o clique quando rodar
        if (ctx && ctx.state !== 'running' && ctx.resume) ctx.resume().then(clique, function () {});
        else clique();
      }
      else if (ctx && ctx.state === 'running' && ctx.suspend) {
        // economiza CPU/bateria no mudo; retoma no próximo som
        setTimeout(function () { if (!ligado() && ctx) ctx.suspend().catch(function () {}); }, 200);
      }
    });
  }

  /* o botão nasce no render do motor: liga quando o motor chama os módulos */
  if (W.CreatMotor && W.CreatMotor.registrarModulo) {
    W.CreatMotor.registrarModulo('som', function (ctx) {
      armazem = ctx.armazem;
      estado = lerEstado();
      iniciarBotao();
    });
  }

  /* ---------- API de depuração ---------- */
  var api = {
    tocar: function (nome) { var f = tabela[nome]; if (f) f(); return !!f; }
  };
  Object.defineProperty(api, 'mudo', { get: function () { return !ligado(); }, enumerable: true });
  W.CreatMotorSom = api;
})();
