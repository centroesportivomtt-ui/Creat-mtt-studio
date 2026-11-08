/*
 * motor/v1/rituais/comum.js · peças compartilhadas pelos rituais da T8 ('esmalte' e 'barra')
 *
 * Script clássico (IIFE), sem bibliotecas e sem dado de cliente. Carregado antes de
 * rituais/esmalte.js e rituais/barra.js (a prévia carrega pelo CreatNichos.carregar; o site
 * entregue recebe as tags no preencherTemplate do motor). Expõe window.CreatRitualComum:
 *   reduzido()                 prefers-reduced-motion ligado agora
 *   texto(chave, reserva)      microtexto do preset (estado.ritualTextos)
 *   emitir(nome, detalhe)      CustomEvent na window
 *   som(nome)                  toca um microssom do motor/v1/som.js (respeita o mudo)
 *   vibrar(ms)                 navigator.vibrate, nunca com movimento reduzido
 *   Mola                       mola amortecida (mesma física do efeito.js)
 *   svg(tag, atributos, pai)   cria nó SVG
 *   no(tag, classe, pai)       cria nó HTML
 *   ponteiro(el, cb)           arrasto 2D com Pointer Events (o el tem touch-action: none no CSS)
 *   tira(el, opc, desenho)     a tira de confirmar com arrasto HORIZONTAL (a página continua rolando)
 *
 * Regras que todo ritual da T8 segue (iguais às do 'navalha' do efeito.js):
 *   - o gesto confirma só no pointerup (o window.open do WhatsApp precisa de gesto do usuário);
 *   - Enter ou Espaço confirmam a tira sem arrastar (WCAG 2.5.7); clique sintético (detail 0) de
 *     leitor de tela também confirma; toque comum não confirma sozinho;
 *   - com prefers-reduced-motion a tira não nasce (o motor mostra "Enviar sem arrastar") e o herói
 *     já aparece no estado final, sem gesto;
 *   - nunca emitem 'ritual:passada' nem 'ritual:afiada' (são os sons de navalha do som.js).
 */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : null;
  if (!W || !W.document) return;
  if (W.CreatRitualComum) return;
  var D = W.document;
  var NS = 'http://www.w3.org/2000/svg';

  var mqReduz = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduzido() { return !!(mqReduz && mqReduz.matches); }
  function lim(v, a, b) { return v < a ? a : v > b ? b : v; }
  function agora() { return (W.performance && performance.now) ? performance.now() : Date.now(); }
  function emitir(nome, det) { try { W.dispatchEvent(new CustomEvent(nome, { detail: det })); } catch (e) {} }
  function vibrar(ms) {
    if (reduzido()) return;
    try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) {}
  }
  function som(nome) {
    if (reduzido()) return;
    try { if (W.CreatMotorSom && typeof W.CreatMotorSom.tocar === 'function') W.CreatMotorSom.tocar(nome); } catch (e) {}
  }
  function texto(chave, reserva) {
    var e = W.CreatMotor && W.CreatMotor.estado;
    var o = e && e.ritualTextos && e.ritualTextos[chave];
    return typeof o === 'string' && o ? o : reserva;
  }
  function svg(tag, at, pai) {
    var n = D.createElementNS(NS, tag);
    if (at) for (var k in at) if (Object.prototype.hasOwnProperty.call(at, k)) n.setAttribute(k, at[k]);
    if (pai) pai.appendChild(n);
    return n;
  }
  function no(tag, classe, pai) {
    var n = D.createElement(tag);
    if (classe) n.className = classe;
    if (pai) pai.appendChild(n);
    return n;
  }

  /* mola amortecida, Euler semi-implícito com subpassos (a mesma do efeito.js) */
  function Mola(v, k, z) { this.x = v; this.v = 0; this.alvo = v; this.k = k || 170; this.z = z || 0.8; }
  Mola.prototype.passo = function (dt) {
    var c = 2 * this.z * Math.sqrt(this.k), n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
    for (var i = 0; i < n; i++) { this.v += (this.k * (this.alvo - this.x) - c * this.v) * h; this.x += this.v * h; }
  };
  Mola.prototype.parada = function (eps) { return Math.abs(this.alvo - this.x) < eps && Math.abs(this.v) < eps * 8; };
  Mola.prototype.fixar = function (v) { this.x = this.alvo = v; this.v = 0; };

  /* arrasto 2D: só para palcos pequenos com touch-action: none (o resto da página rola) */
  function ponteiro(el, cb) {
    var id = null;
    function soltar() {
      try { if (id !== null && el.hasPointerCapture && el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch (e) {}
      id = null;
    }
    function down(e) {
      if (id !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (cb.pode && !cb.pode(e)) return;
      id = e.pointerId;
      try { el.setPointerCapture(id); } catch (er) {}
      e.preventDefault();
      cb.inicio(e);
    }
    function move(e) {
      if (e.pointerId !== id) return;
      if (e.pointerType === 'mouse' && e.buttons === 0) { soltar(); cb.fim(e, true); return; }
      cb.mover(e);
    }
    function up(e) {
      if (e.pointerId !== id) return;
      soltar();
      cb.fim(e, e.type !== 'pointerup');
    }
    var pares = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['lostpointercapture', up]];
    pares.forEach(function (p) { el.addEventListener(p[0], p[1]); });
    return {
      ativo: function () { return id !== null; },
      soltar: soltar,
      desligar: function () { soltar(); pares.forEach(function (p) { el.removeEventListener(p[0], p[1]); }); }
    };
  }

  /* decisor de eixo: vira arrasto só se o movimento for horizontal (a tira fica com touch-action: pan-y) */
  function arrastoHorizontal(el, cb) {
    var id = null, x0 = 0, y0 = 0, estado = 0;
    function soltar() {
      try { if (id !== null && el.hasPointerCapture && el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch (e) {}
      id = null; estado = 0;
    }
    function down(e) {
      if (id !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (cb.pode && !cb.pode(e)) return;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; estado = 1;
    }
    function move(e) {
      if (e.pointerId !== id) return;
      if (e.pointerType === 'mouse' && e.buttons === 0) { var era = estado === 2; soltar(); if (era) cb.fim(e, true); return; }
      if (estado === 1) {
        var dx = e.clientX - x0, dy = e.clientY - y0;
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { soltar(); return; }
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          estado = 2;
          try { el.setPointerCapture(id); } catch (er) {}
          cb.inicio(e, x0, y0);
        } else return;
      }
      cb.mover(e);
    }
    function up(e) {
      if (e.pointerId !== id) return;
      if (e.type === 'lostpointercapture' && e.target !== el) return;
      var era = estado === 2;
      soltar();
      if (era) cb.fim(e, e.type !== 'pointerup');
    }
    var pares = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['lostpointercapture', up]];
    pares.forEach(function (p) { el.addEventListener(p[0], p[1]); });
    return {
      ativo: function () { return estado === 2; },
      soltar: soltar,
      desligar: function () { soltar(); pares.forEach(function (p) { el.removeEventListener(p[0], p[1]); }); }
    };
  }

  /*
   * Tira de confirmar genérica. `desenho` monta o visual do nicho:
   *   desenho.classe                      classe extra da tira (ex.: 'tira-esmalte')
   *   desenho.montar(el) -> { alca, larguraAlca(w,h), posar(progresso, velocidade, x, h), resetar() }
   * A alça (o pincel, a barra) anda de x0 a x1; passou de 85% e soltou = confirma.
   */
  var registro = [];
  function acharReg(el) { for (var i = 0; i < registro.length; i++) if (registro[i].el === el) return registro[i]; return null; }

  function montarTira(el, opc, desenho) {
    var rotulo = opc.rotulo || 'Arraste para enviar';
    el.textContent = '';
    el.className = 'tira-ritual ' + (desenho.classe || '');
    el.removeAttribute('aria-disabled');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', rotulo + ' (ou pressione Enter)');
    el.style.setProperty('--prog', '0');
    var vis = desenho.montar(el);
    var rot = no('span', 'texto-tira', el);
    rot.textContent = rotulo;

    var st = { w: 0, h: 0, x0: 0, x1: 1, la: 48, mx: new Mola(0, 190, 0.82), travada: false, rodando: false, tAnt: 0, pega: 0, vel: 0, lx: 0, lt: 0, pronta: false, tocouPronta: false };

    function medir() {
      var w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return false;
      if (w === st.w && h === st.h) return true;
      st.w = w; st.h = h;
      st.la = vis.larguraAlca(w, h);
      st.x0 = st.la / 2 + 6; st.x1 = Math.max(st.x0 + 1, w - st.la / 2 - 6);
      if (arr && arr.ativo()) st.mx.alvo = lim(st.mx.alvo, st.x0, st.x1);
      else st.mx.fixar(st.travada ? st.x1 : st.x0);
      posar();
      return true;
    }
    function progresso() { return lim((st.mx.x - st.x0) / (st.x1 - st.x0), 0, 1); }
    function posar() {
      var p = progresso();
      el.style.setProperty('--prog', p.toFixed(3));
      vis.posar(p, st.mx.v, st.mx.x, st.h);
    }
    function agendar() { if (st.rodando) return; st.rodando = true; W.requestAnimationFrame(quadro); }
    function quadro(t) {
      st.rodando = false;
      if (!st.w && !medir()) return;
      var dt = st.tAnt ? lim((t - st.tAnt) / 1000, 0, 1 / 30) : 1 / 60;
      st.tAnt = t;
      st.mx.passo(dt);
      posar();
      if (!st.mx.parada(0.3) || arr.ativo()) agendar(); else st.tAnt = 0;
    }
    function confirmar() {
      if (st.travada) return;
      st.travada = true;
      arr.soltar();
      el.classList.remove('is-arrastando', 'is-pronta');
      el.classList.add('is-confirmada');
      el.setAttribute('aria-disabled', 'true');
      if (reduzido()) st.mx.fixar(st.x1); else st.mx.alvo = st.x1;
      vibrar(12);
      agendar();
      emitir('ritual:confirmar', { origem: 'tira', el: el, ritual: desenho.nome });
    }
    var arr = arrastoHorizontal(el, {
      pode: function (e) {
        if (st.travada) return false;
        if (!st.w) medir();
        var x = e.clientX - el.getBoundingClientRect().left;
        return x <= st.mx.x + st.la / 2 + 28;
      },
      inicio: function (e, x0) {
        var r = el.getBoundingClientRect();
        st.pega = (x0 - r.left) - st.mx.x;
        st.lx = e.clientX; st.lt = agora(); st.vel = 0;
        el.classList.add('is-arrastando');
      },
      mover: function (e) {
        if (st.travada) return;
        var r = el.getBoundingClientRect(), t = agora();
        st.vel = st.vel * 0.6 + ((e.clientX - st.lx) / Math.max(1, t - st.lt)) * 0.4;
        st.lx = e.clientX; st.lt = t;
        st.mx.alvo = lim(e.clientX - r.left - st.pega, st.x0, st.x1);
        var p = (st.mx.alvo - st.x0) / (st.x1 - st.x0);
        st.pronta = p >= 0.85;
        if (st.pronta) {
          st.mx.alvo = st.x1;
          if (!st.tocouPronta) { st.tocouPronta = true; som('clique'); vibrar(6); }
        } else st.tocouPronta = false;
        el.classList.toggle('is-pronta', st.pronta);
        agendar();
      },
      fim: function (e, cancelado) {
        var pronta = st.pronta;
        st.pronta = false; st.tocouPronta = false;
        el.classList.remove('is-arrastando', 'is-pronta');
        if (pronta && !cancelado && !st.travada) { confirmar(); return; }
        if (!st.travada) st.mx.alvo = st.x0;
        agendar();
      }
    });
    function tecla(e) {
      if (e.target !== el) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); if (!e.repeat) confirmar(); }
    }
    function clique(e) { if (e.detail === 0 && !st.travada) confirmar(); }
    el.addEventListener('keydown', tecla);
    el.addEventListener('click', clique);
    var ro = null;
    if ('ResizeObserver' in W) { ro = new ResizeObserver(function () { if (medir()) agendar(); }); ro.observe(el); }
    medir();

    return {
      resetar: function () {
        st.travada = false;
        el.classList.remove('is-confirmada', 'is-arrastando', 'is-pronta');
        el.removeAttribute('aria-disabled');
        if (vis.resetar) vis.resetar();
        if (reduzido() || !st.w) { st.mx.fixar(st.x0); posar(); } else { st.mx.alvo = st.x0; agendar(); }
      },
      desmontar: function () {
        arr.desligar();
        el.removeEventListener('keydown', tecla);
        el.removeEventListener('click', clique);
        if (ro) ro.disconnect();
        el.textContent = '';
      }
    };
  }

  function tira(el, opc, desenho) {
    if (!el || !desenho) return null;
    opc = opc || {};
    var reg = acharReg(el);
    if (!reg) { reg = { el: el, opc: opc, desenho: desenho, inst: null, escondida: false }; registro.push(reg); }
    reg.opc = opc; reg.desenho = desenho;
    if (reg.inst) { reg.inst.desmontar(); reg.inst = null; }
    if (reduzido()) { el.hidden = true; reg.escondida = true; return null; }
    if (reg.escondida) { el.hidden = false; reg.escondida = false; }
    reg.inst = montarTira(el, opc, desenho);
    return el;
  }
  function resetarTira(el) {
    var reg = acharReg(el);
    if (reg && reg.inst) reg.inst.resetar();
  }

  /* movimento reduzido ligado ao vivo: a tira some (o botão "Enviar sem arrastar" fica) e os heróis vão ao estado final */
  var ouvintesReduz = [];
  function aoMudarMovimento() {
    if (reduzido()) {
      registro.forEach(function (r) { if (r.inst) { r.inst.desmontar(); r.inst = null; } r.el.hidden = true; r.escondida = true; });
    } else {
      registro.forEach(function (r) { if (!r.inst) tira(r.el, r.opc, r.desenho); });
    }
    ouvintesReduz.forEach(function (f) { try { f(reduzido()); } catch (e) {} });
  }
  if (mqReduz) {
    if (mqReduz.addEventListener) mqReduz.addEventListener('change', aoMudarMovimento);
    else if (mqReduz.addListener) mqReduz.addListener(aoMudarMovimento);
  }

  /* a folha de estilo dos rituais: se a página não trouxe o <link>, ele entra ao lado deste script */
  function garantirCss() {
    if (D.querySelector('link[data-rituais-css]')) return;
    var s = D.currentScript || D.querySelector('script[src*="rituais/comum.js"]');
    if (!s || !s.src) return;
    var l = D.createElement('link');
    l.rel = 'stylesheet';
    l.href = s.src.replace(/comum\.js(\?.*)?$/, 'rituais.css');
    l.setAttribute('data-rituais-css', '');
    (D.head || D.documentElement).appendChild(l);
  }
  garantirCss();

  W.CREAT_RITUAIS = W.CREAT_RITUAIS || {};
  W.CreatRitualComum = {
    reduzido: reduzido, lim: lim, agora: agora, emitir: emitir, vibrar: vibrar, som: som, texto: texto,
    svg: svg, no: no, Mola: Mola, ponteiro: ponteiro, tira: tira, resetarTira: resetarTira,
    aoMudarMovimento: function (f) { ouvintesReduz.push(f); }
  };
})();
