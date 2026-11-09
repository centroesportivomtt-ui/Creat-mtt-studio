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
 *   emDois, curva, trecho, cena, diretor, dicaVez, nomeNegocio   ritual vivo (09/11/2026): entrada em dois,
 *                              demonstração em loop a cada 6 a 9 s e a dica "Arraste você" (ver o bloco no meio)
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


  /* =====================================================================
     RITUAL VIVO (09/11/2026): entrada, demonstração em loop e a dica "Arraste você"
     Cada ritual desenha a própria cena; aqui ficam só o relógio e as regras:
       - emDois(ms): tempo da pose "em dois" (12 poses por segundo, como desenho animado);
       - cena(passo, fim): laço de requestAnimationFrame com tempo que NÃO salta quando a aba
         some (o rAF para e o relógio é empurrado); passo(T, dt) devolve false para encerrar;
       - diretor(el, opc): 1,8 a 2,6 s depois da entrada e, dali em diante, a cada 6 a 9 s, com o palco
         na tela, a aba visível e ninguém mexendo, chama opc.tocar(fim). Para de vez no primeiro toque ou tecla (parar()) e não volta
         nesta visita. Nunca roda com movimento reduzido;
       - dicaVez(dica): troca a dica do palco por "Arraste você" por 2,6 s no fim da demonstração.
     ===================================================================== */
  var QUADRO_EM_DOIS = 1000 / 12;
  function emDois(ms) { return Math.floor(ms / QUADRO_EM_DOIS) * QUADRO_EM_DOIS; }
  var curva = {
    saida: function (p) { return 1 - Math.pow(1 - p, 3); },
    entrada: function (p) { return p * p; },
    meio: function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; },
    seno: function (p) { return 0.5 - Math.cos(Math.PI * p) / 2; },
    voltaAtras: function (p) { var c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); }
  };
  function trecho(T, a, b) { return lim((T - a) / (b - a), 0, 1); }

  function cena(passo, fim) {
    var t0 = 0, tAnt = 0, viva = true;
    function quadro(t) {
      if (!viva) return;
      if (!t0) { t0 = t; tAnt = t; }
      var bruto = t - tAnt;
      if (bruto > 100) t0 += bruto - 16;            // a aba voltou: continua de onde parou
      var dt = lim((t - tAnt) / 1000, 0, 1 / 30);
      tAnt = t;
      var segue = false;
      try { segue = passo(t - t0, dt) !== false; } catch (e) { segue = false; }
      if (segue && viva) W.requestAnimationFrame(quadro);
      else if (viva) { viva = false; if (fim) fim(true); }
    }
    W.requestAnimationFrame(quadro);
    return { parar: function () { if (!viva) return; viva = false; if (fim) fim(false); }, viva: function () { return viva; } };
  }

  /* MUDA JUNTO: efeito.js (criarDiretor/criarDicaVez) tem a cópia da barbearia, que não carrega este arquivo.
     Mesmas regras e mesmos tempos nos dois (PRIMEIRA_DEMO e o intervalo de 6 a 9 s). */
  var PRIMEIRA_DEMO = [1800, 2600];   // a 1ª demonstração vem logo depois da entrada; as seguintes, a cada 6 a 9 s
  function diretor(el, opc) {
    var st = { parado: false, visivel: true, timer: 0, tocando: false, primeira: false };
    function sortear() {
      if (st.primeira) return PRIMEIRA_DEMO[0] + Math.random() * (PRIMEIRA_DEMO[1] - PRIMEIRA_DEMO[0]);
      return (opc.min || 6000) + Math.random() * ((opc.max || 9000) - (opc.min || 6000));
    }
    function agendar() {
      clearTimeout(st.timer); st.timer = 0;
      if (st.parado || st.tocando || !st.visivel || D.hidden || reduzido()) return;
      st.timer = setTimeout(disparar, sortear());
    }
    function disparar() {
      st.timer = 0;
      if (st.parado || st.tocando || !st.visivel || D.hidden || reduzido()) return;
      if (opc.pode && !opc.pode()) { agendar(); return; }
      st.tocando = true; st.primeira = false;
      opc.tocar(function () {
        st.tocando = false;
        if (st.parado) return;
        if (opc.aoFim) opc.aoFim();
        agendar();
      });
    }
    var io = null;
    if ('IntersectionObserver' in W) {
      io = new IntersectionObserver(function (ents) {
        st.visivel = ents[ents.length - 1].isIntersecting;
        if (st.visivel) { if (!st.timer) agendar(); } else { clearTimeout(st.timer); st.timer = 0; }
      }, { threshold: 0.35 });
      io.observe(el);
    }
    function aoVer() { if (D.hidden) { clearTimeout(st.timer); st.timer = 0; } else if (!st.timer) agendar(); }
    D.addEventListener('visibilitychange', aoVer);
    return {
      // iniciar(): chamado no fim da entrada; o primeiro gesto vem em 1,8 a 2,6 s (se o palco estiver na tela)
      iniciar: function () { st.primeira = true; agendar(); },
      parar: function () {
        if (st.parado) return;
        st.parado = true;
        clearTimeout(st.timer); st.timer = 0;
        if (io) io.disconnect();
        D.removeEventListener('visibilitychange', aoVer);
        if (opc.aoParar) opc.aoParar(st.tocando);
        st.tocando = false;
      },
      parado: function () { return st.parado; },
      tocando: function () { return st.tocando; }
    };
  }

  /* a dica do palco ganha uma segunda linha empilhada ("Arraste você") que entra no fim da demonstração */
  function dicaVez(dica) {
    if (!dica) return null;
    var orig = no('span', 'dica-orig');
    while (dica.firstChild) orig.appendChild(dica.firstChild);
    dica.appendChild(orig);
    var vez = no('span', 'dica-vez', dica);
    vez.setAttribute('aria-hidden', 'true');
    no('span', 'vez-dedo', vez).setAttribute('aria-hidden', 'true');
    var tx = no('span', 'vez-texto', vez);
    tx.textContent = texto('dicaVez', 'Arraste você');
    dica.classList.add('tem-vez');
    var timer = 0;
    return {
      mostrar: function (ms) {
        if (reduzido()) return;
        clearTimeout(timer);
        dica.classList.add('is-sua-vez');
        timer = setTimeout(function () { dica.classList.remove('is-sua-vez'); }, ms || 2600);
      },
      esconder: function () { clearTimeout(timer); dica.classList.remove('is-sua-vez'); }
    };
  }

  /* nome curto do negócio, para gravar no objeto do ritual (anilha, frasco) */
  function nomeNegocio(max) {
    var e = W.CreatMotor && W.CreatMotor.estado;
    return String((e && (e.nomeCurto || e.nome)) || '').trim().slice(0, max || 28);
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
    aoMudarMovimento: function (f) { ouvintesReduz.push(f); },
    emDois: emDois, curva: curva, trecho: trecho, cena: cena, diretor: diretor, dicaVez: dicaVez, nomeNegocio: nomeNegocio
  };
})();
