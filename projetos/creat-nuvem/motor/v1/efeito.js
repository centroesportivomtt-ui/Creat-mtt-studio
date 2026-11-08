/*
 * motor/v1/efeito.js · ritual 'navalha' do motor v1 (nasce do efeito.js do Fio no Couro)
 * O couro do herói (Canvas 2D), a navalha com física de mola, o medidor de fio
 * e a tira "passe a navalha no couro para enviar" (mesmo código de navalha).
 *
 * Script clássico (IIFE), sem bibliotecas e sem dado de cliente. Registra o ritual em
 * window.CREAT_RITUAIS.navalha com a interface que todo ritual de nicho segue (T8):
 *   montarHeroi(el, ctx)       transforma o <section id="heroi"> do motor no palco do ritual
 *   criarTira(el, {rotulo})    monta o gesto de confirmar dentro de el (null com movimento reduzido)
 *   resetarTira(el)            volta a tira ao começo
 * Conversa com os outros módulos só por CustomEvent na window:
 *   ritual:passada   {origem:'heroi'|'tira', sentido: 1|-1, velocidade: 0..1, progresso: 0..1}
 *   ritual:afiada    {origem:'heroi'}           (uma vez, nunca com movimento reduzido)
 *   ritual:confirmar {origem:'tira', el}        (uma vez até resetarTira)
 *   motor:ritual-pronto                         (o motor leva o "Pedir horário" para o polegar)
 */
(function () {
  'use strict';

  var W = typeof window !== 'undefined' ? window : null;
  if (!W || !W.document) return;
  var D = W.document;

  /* ---------- utilidades ---------- */
  var mqReduz = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduzido() { return !!(mqReduz && mqReduz.matches); }
  function dpr() { return Math.min(W.devicePixelRatio || 1, 2); }          // DPR limitado a 2
  function lim(v, a, b) { return v < a ? a : v > b ? b : v; }
  function agora() { return (W.performance && performance.now) ? performance.now() : Date.now(); }
  function emitir(nome, det) { try { W.dispatchEvent(new CustomEvent(nome, { detail: det })); } catch (e) {} }
  function vibrar() {
    if (reduzido()) return;
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
  }
  /* microtexto do ritual: vem do preset (estado.ritualTextos); reserva genérica */
  function texto(chave, reserva) {
    var e = W.CreatMotor && W.CreatMotor.estado;
    var o = e && e.ritualTextos && e.ritualTextos[chave];
    return typeof o === 'string' && o ? o : reserva;
  }
  function suportaCanvas() {
    try { var c = D.createElement('canvas'); return !!(c.getContext && c.getContext('2d')); } catch (e) { return false; }
  }

  /* ---------- mola amortecida (Euler semi-implícito com subpassos) ---------- */
  var MOLA = { rigidez: 170, amortecimento: 0.8 };   // ajustáveis via CREAT_RITUAIS.navalha.mola
  function Mola(v, k, z) { this.x = v; this.v = 0; this.alvo = v; this.k = k; this.z = z; }
  Mola.prototype.passo = function (dt) {
    var k = this.k || MOLA.rigidez, z = this.z || MOLA.amortecimento, c = 2 * z * Math.sqrt(k);
    var n = Math.max(1, Math.ceil(dt * 120)), h = dt / n;
    for (var i = 0; i < n; i++) { this.v += (k * (this.alvo - this.x) - c * this.v) * h; this.x += this.v * h; }
  };
  Mola.prototype.parada = function (eps) { return Math.abs(this.alvo - this.x) < eps && Math.abs(this.v) < eps * 8; };
  Mola.prototype.fixar = function (v) { this.x = this.alvo = v; this.v = 0; };

  /* ---------- cores lidas do CSS (resolve var() e color-mix via elemento-sonda) ---------- */
  var sondaCtx = null;
  function paraRGB(css, reserva) {
    try {
      if (!sondaCtx) { var c = D.createElement('canvas'); c.width = c.height = 1; sondaCtx = c.getContext('2d', { willReadFrequently: true }); }
      sondaCtx.clearRect(0, 0, 1, 1);
      sondaCtx.fillStyle = reserva; sondaCtx.fillStyle = css;       // cor inválida é ignorada
      sondaCtx.fillRect(0, 0, 1, 1);
      var p = sondaCtx.getImageData(0, 0, 1, 1).data;
      return [p[0], p[1], p[2]];
    } catch (e) { return [31, 22, 18]; }
  }
  function lerCor(pai, expr, reserva) {
    var s = D.createElement('span');
    s.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;';
    s.style.color = reserva; s.style.color = expr;
    pai.appendChild(s);
    var c = getComputedStyle(s).color;
    pai.removeChild(s);
    return paraRGB(c, reserva);
  }

  /* ---------- couro: gerado UMA vez por tamanho/tema; depois só drawImage ---------- */
  function sorteio(semente) {                       // mulberry32: veio reproduzível
    return function () {
      semente |= 0; semente = semente + 0x6D2B79F5 | 0;
      var t = Math.imul(semente ^ semente >>> 15, 1 | semente);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function gerarCouro(wCss, hCss, d, cores) {
    var rnd = sorteio(1987);
    // tabela de ruído de valor 64x64 (repete sem emenda)
    var G = 64, tab = new Float32Array(G * G);
    for (var i = 0; i < tab.length; i++) tab[i] = rnd();
    function ruido(x, y) {                          // ruído de valor bilinear com suavização
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      var x0 = xi & 63, y0 = yi & 63, x1 = (x0 + 1) & 63, y1 = (y0 + 1) & 63;
      var a = tab[y0 * G + x0], b = tab[y0 * G + x1], c = tab[y1 * G + x0], e = tab[y1 * G + x1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
    }
    function fbm(x, y) {                            // 4 oitavas, cada uma metade da anterior
      var s = 0, a = 0.5;
      for (var o = 0; o < 4; o++) { s += a * ruido(x, y); x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; a *= 0.5; }
      return s / 0.9375;
    }

    // 1) mancha + veio em resolução reduzida (1/3 do CSS), ampliada depois
    var bw = Math.max(24, Math.ceil(wCss / 3)), bh = Math.max(24, Math.ceil(hCss / 3));
    var pequeno = D.createElement('canvas'); pequeno.width = bw; pequeno.height = bh;
    var pc = pequeno.getContext('2d');
    var img = pc.createImageData(bw, bh), px = img.data;
    var F = cores.fundo, C = cores.claro, E = cores.escuro;
    var ang = 0.49, ca = Math.cos(ang), sa = Math.sin(ang);   // veio diagonal (~28 graus)
    for (var y = 0; y < bh; y++) {
      for (var x = 0; x < bw; x++) {
        var nx = x * 3 / 110, ny = y * 3 / 110;                 // escala em px CSS
        var mancha = fbm(nx, ny);                              // manchas largas do couro
        var torce = fbm(nx * 0.55 + 5.2, ny * 0.55 + 1.3);     // domain warp do veio
        var ao = nx * ca + ny * sa, tr = -nx * sa + ny * ca;
        var veia = Math.pow(1 - Math.abs(Math.sin(tr * 5.5 + torce * 7 + ao * 0.35)), 9); // linhas finas
        var poro = ruido(nx * 13, ny * 13);                    // poro miúdo
        var s = (mancha - 0.5) * 1.5 + (poro - 0.5) * 0.22 - veia * 0.36;
        var vx = x / bw - 0.5, vy = y / bh - 0.42;             // vinheta leve
        s -= (vx * vx * 1.2 + vy * vy * 1.0) * 1.3;
        s = lim(s, -1, 1);
        var alvo = s < 0 ? E : C, t = s < 0 ? -s : s, j = (y * bw + x) * 4;
        px[j] = F[0] + (alvo[0] - F[0]) * t;
        px[j + 1] = F[1] + (alvo[1] - F[1]) * t;
        px[j + 2] = F[2] + (alvo[2] - F[2]) * t;
        px[j + 3] = 255;
      }
    }
    pc.putImageData(img, 0, 0);

    // 2) amplia para o tamanho real (DPR <= 2) com suavização
    var base = D.createElement('canvas');
    base.width = Math.max(1, Math.round(wCss * d)); base.height = Math.max(1, Math.round(hCss * d));
    var bc = base.getContext('2d');
    bc.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in bc) bc.imageSmoothingQuality = 'high';
    bc.drawImage(pequeno, 0, 0, base.width, base.height);

    // 3) grão: um ladrilho 96x96 repetido (barato)
    var lad = D.createElement('canvas'); lad.width = lad.height = 96;
    var lc = lad.getContext('2d'), li = lc.createImageData(96, 96), lp = li.data;
    for (var k = 0; k < lp.length; k += 4) {
      var g = rnd() < 0.5 ? 0 : 255;
      lp[k] = lp[k + 1] = lp[k + 2] = g; lp[k + 3] = rnd() * 22;
    }
    lc.putImageData(li, 0, 0);
    bc.save(); bc.scale(d, d);
    bc.fillStyle = bc.createPattern(lad, 'repeat');
    bc.globalAlpha = 0.55; bc.fillRect(0, 0, wCss, hCss);

    // 4) arranhões e rugas: poucos traços claros e escuros quase invisíveis
    bc.globalAlpha = 1; bc.lineCap = 'round';
    for (var r = 0; r < 26; r++) {
      var sx = rnd() * wCss, sy = rnd() * hCss, comp = 20 + rnd() * 90, a2 = ang + (rnd() - 0.5) * 0.9;
      var claro = rnd() < 0.55, cor = claro ? C : E;
      bc.strokeStyle = 'rgba(' + cor[0] + ',' + cor[1] + ',' + cor[2] + ',' + (claro ? 0.22 : 0.35) + ')';
      bc.lineWidth = 0.6 + rnd() * 0.9;
      bc.beginPath(); bc.moveTo(sx, sy);
      bc.quadraticCurveTo(sx + Math.cos(a2) * comp * 0.5 + (rnd() - 0.5) * 12, sy + Math.sin(a2) * comp * 0.5 + (rnd() - 0.5) * 12,
        sx + Math.cos(a2) * comp, sy + Math.sin(a2) * comp);
      bc.stroke();
    }
    bc.restore();
    return base;
  }

  /* ---------- camada de marcas: escurece onde a lâmina passou e some aos poucos ---------- */
  function CamadaMarcas() { this.cv = D.createElement('canvas'); this.ctx = this.cv.getContext('2d'); this.suja = false; this.tMarca = 0; this.acum = 0; this.esc = 1; }
  CamadaMarcas.prototype.tamanho = function (w, h, esc) {
    this.esc = esc; this.cv.width = Math.max(1, Math.round(w * esc)); this.cv.height = Math.max(1, Math.round(h * esc));
    this.suja = false;
  };
  // pegada da lâmina entre a pose anterior e a atual (retângulos nas pontas + faixa no meio)
  CamadaMarcas.prototype.riscar = function (a, b, meiaL, meiaA, alfa) {
    var c = this.ctx, e = this.esc;
    c.save(); c.scale(e, e);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = c.strokeStyle = 'rgba(8,5,3,' + alfa.toFixed(3) + ')';
    [a, b].forEach(function (p) {
      c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillRect(-meiaL, -meiaA, meiaL * 2, meiaA * 2); c.restore();
    });
    c.lineWidth = meiaA * 2; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    c.restore();
    this.suja = true; this.tMarca = agora();
  };
  // apaga um pouco a cada ~66 ms; depois de 3 s parado, limpa o resto que o arredondamento de 8 bits prende
  CamadaMarcas.prototype.desbotar = function (dt) {
    if (!this.suja) return;
    if (agora() - this.tMarca > 3000) { this.ctx.clearRect(0, 0, this.cv.width, this.cv.height); this.suja = false; return; }
    this.acum += dt;
    if (this.acum < 0.066) return;
    this.acum = 0;
    var c = this.ctx;
    c.globalCompositeOperation = 'destination-out';
    c.fillStyle = 'rgba(0,0,0,0.06)';
    c.fillRect(0, 0, this.cv.width, this.cv.height);
    c.globalCompositeOperation = 'source-over';
  };
  CamadaMarcas.prototype.limpar = function () { this.ctx.clearRect(0, 0, this.cv.width, this.cv.height); this.suja = false; };

  /* ---------- a navalha: UMA fábrica para o hero e para a tira ---------- */
  var SVGNS = 'http://www.w3.org/2000/svg', seq = 0;
  var VB_W = 320, VB_H = 64;
  var LAMINA = { cx: 239 / VB_W - 0.5, meiaL: 75 / VB_W, meiaA: 18 / VB_H };  // pegada da lâmina (frações)
  function svg(tag, at, pai) {
    var n = D.createElementNS(SVGNS, tag);
    for (var k in at) n.setAttribute(k, at[k]);
    if (pai) pai.appendChild(n);
    return n;
  }
  function criarNavalha(comprimento) {
    var id = 'nv' + (++seq);
    var raiz = D.createElement('div');
    raiz.className = 'navalha';
    raiz.setAttribute('aria-hidden', 'true');
    var s = svg('svg', { viewBox: '0 0 ' + VB_W + ' ' + VB_H, focusable: 'false', 'aria-hidden': 'true' }, raiz);
    var defs = svg('defs', {}, s);

    // aço fosco: lombo mais escuro, bisel claro perto do fio
    var gL = svg('linearGradient', { id: id + 'l', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    [[0, '#7c838a'], [0.3, '#aab0b5'], [0.62, '#c4c9cd'], [0.84, '#dde1e3'], [1, '#eef0f1']].forEach(function (p) {
      svg('stop', { offset: p[0], 'stop-color': p[1] }, gL);
    });
    // cabo: chifre escuro com reflexo baixo
    var gC = svg('linearGradient', { id: id + 'c', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    [[0, '#3b302a'], [0.45, '#1c1614'], [1, '#0c0908']].forEach(function (p) { svg('stop', { offset: p[0], 'stop-color': p[1] }, gC); });
    // rebite
    var gR = svg('radialGradient', { id: id + 'r', cx: 0.4, cy: 0.35, r: 0.7 }, defs);
    svg('stop', { offset: 0, 'stop-color': '#eceeef' }, gR); svg('stop', { offset: 1, 'stop-color': '#6f747a' }, gR);
    // risco especular: faixa clara em gradiente horizontal
    var gB = svg('linearGradient', { id: id + 'b', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    [[0, 0], [0.5, 0.75], [1, 0]].forEach(function (p) { svg('stop', { offset: p[0], 'stop-color': '#ffffff', 'stop-opacity': p[1] }, gB); });

    var pLamina = 'M164 16 L298 13 Q314 14 315 28 Q313 46 296 50 L178 48 Q166 46 164 40 Z';
    var clip = svg('clipPath', { id: id + 'k' }, defs);
    svg('path', { d: pLamina }, clip);

    // cabo + rebites
    svg('path', { d: 'M12 21 Q3 32 12 43 L140 46 Q151 32 140 18 Z', fill: 'url(#' + id + 'c)', stroke: 'rgba(255,255,255,0.10)', 'stroke-width': 1 }, s);
    svg('path', { d: 'M18 24 L136 21', stroke: 'rgba(255,255,255,0.08)', 'stroke-width': 1.5, fill: 'none' }, s);
    svg('circle', { cx: 24, cy: 32, r: 3.6, fill: 'url(#' + id + 'r)' }, s);
    svg('circle', { cx: 133, cy: 32, r: 3.6, fill: 'url(#' + id + 'r)' }, s);
    // espiga com ranhuras (jimps)
    svg('path', { d: 'M138 24 L168 22 L168 42 L138 40 Z', fill: '#8a9096' }, s);
    for (var j = 0; j < 4; j++) svg('path', { d: 'M' + (146 + j * 5) + ' 23.5 v3', stroke: '#5d6268', 'stroke-width': 1.4 }, s);
    // lâmina
    svg('path', { d: pLamina, fill: 'url(#' + id + 'l)' }, s);
    svg('path', { d: 'M168 41 L296 45', stroke: 'rgba(255,255,255,0.45)', 'stroke-width': 1, fill: 'none' }, s);   // linha do bisel
    svg('path', { d: 'M178 48 L296 50', stroke: '#f7f8f9', 'stroke-width': 0.8, fill: 'none' }, s);              // fio
    svg('path', { d: 'M164 16 L298 13', stroke: 'rgba(40,44,48,0.5)', 'stroke-width': 1.2, fill: 'none' }, s);   // lombo
    // "FIO & COURO" gravado e apagado (sombra escura + realce claro deslocado)
    var fonte = "'Big Shoulders Display','Arial Narrow',sans-serif";
    var est = W.CreatMotor && W.CreatMotor.estado;
    var gravacao = String((est && (est.nomeCurto || est.nome)) || '').trim().toUpperCase().slice(0, 28);
    var t1 = svg('text', { x: 238, y: 36.6, 'text-anchor': 'middle', 'font-family': fonte, 'font-weight': 800, 'font-size': 12, 'letter-spacing': 2, fill: 'rgba(255,255,255,0.32)' }, s);
    t1.textContent = gravacao;
    var t2 = svg('text', { x: 238, y: 36, 'text-anchor': 'middle', 'font-family': fonte, 'font-weight': 800, 'font-size': 12, 'letter-spacing': 2, fill: 'rgba(28,30,33,0.34)' }, s);
    t2.textContent = gravacao;
    // nome longo: comprime para caber entre o espigão e a ponta da lâmina
    if (gravacao.length > 11) [t1, t2].forEach(function (t) { t.setAttribute('textLength', 118); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); });
    // brilho recortado na forma da lâmina
    var gk = svg('g', { 'clip-path': 'url(#' + id + 'k)' }, s);
    var faixa = svg('g', { transform: 'translate(120 0)' }, gk);
    svg('rect', { x: 0, y: -10, width: 44, height: 84, fill: 'url(#' + id + 'b)', transform: 'skewX(-22)' }, faixa);

    var L = 0, A = 0, ultimoBrilho = -1;
    var nav = {
      el: raiz,
      tamanho: function (c) {
        L = c; A = c * VB_H / VB_W;
        raiz.style.width = L + 'px'; raiz.style.height = A + 'px';
        nav.L = L; nav.A = A;
      },
      // pose: centro (x,y) em px, rotação em graus, escala Y (1 a -1 = giro no eixo longo)
      pose: function (x, y, rot, sy) {
        raiz.style.transform = 'translate3d(' + (x - L / 2).toFixed(1) + 'px,' + (y - A / 2).toFixed(1) + 'px,0) rotate(' +
          rot.toFixed(2) + 'deg) scale(1,' + sy.toFixed(3) + ')';
      },
      // t de 0 a 1: posição do risco especular ao longo da lâmina
      brilho: function (t) {
        var x = Math.round(140 + lim(t, 0, 1) * 190);
        if (x === ultimoBrilho) return;
        ultimoBrilho = x;
        faixa.setAttribute('transform', 'translate(' + x + ' 0)');
      },
      // pegada da lâmina no mundo (para a camada de marcas)
      pegada: function (x, y, rotRad) {
        var bx = LAMINA.cx * L;
        return { x: x + Math.cos(rotRad) * bx, y: y + Math.sin(rotRad) * bx, r: rotRad };
      },
      meiaL: function () { return LAMINA.meiaL * L; },
      meiaA: function () { return LAMINA.meiaA * A; }
    };
    nav.tamanho(comprimento);
    return nav;
  }

  /* ---------- decisor de eixo: só vira arrasto se o movimento for horizontal ---------- */
  function ligarArrasto(el, cb) {
    var id = null, x0 = 0, y0 = 0, estado = 0;   // 0 livre, 1 decidindo, 2 arrastando
    function soltar() {
      try { if (id !== null && el.hasPointerCapture && el.hasPointerCapture(id)) el.releasePointerCapture(id); } catch (e) {}
      id = null; estado = 0;
    }
    function down(e) {
      if (id !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (cb.pode && !cb.pode(e)) return;
      id = e.pointerId; x0 = e.clientX; y0 = e.clientY; estado = 1;
      if (cb.toque) cb.toque(e);
    }
    function move(e) {
      if (e.pointerId !== id) return;
      // mouse sem botão: o up aconteceu fora e se perdeu; encerra em vez de arrastar só passando o cursor
      if (e.pointerType === 'mouse' && e.buttons === 0) { var era = estado === 2; soltar(); if (era) cb.fim(e, true); return; }
      if (estado === 1) {
        var dx = e.clientX - x0, dy = e.clientY - y0;
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { soltar(); return; }   // vertical: deixa a página rolar
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
      if (e.type === 'lostpointercapture' && e.target !== el) return;   // captura implícita de um filho passou para o el: o gesto continua
      var era = estado === 2;
      soltar();
      if (era) cb.fim(e, e.type !== 'pointerup');   // só pointerup é gesto do usuário
    }
    var pares = [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['lostpointercapture', up]];
    pares.forEach(function (p) { el.addEventListener(p[0], p[1]); });
    return {
      ativo: function () { return estado === 2; },
      soltar: soltar,
      desligar: function () { soltar(); pares.forEach(function (p) { el.removeEventListener(p[0], p[1]); }); }
    };
  }

  /* =====================================================================
     HERO
     ===================================================================== */
  var hero = null;

  /* o motor desenha o <section id="heroi"> (nome, bordão); aqui ele vira a tira de couro */
  function montarHeroi(el) {
    if (!el || hero) return;
    el.classList.add('couro');
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'group');
    el.setAttribute('aria-roledescription', 'tira de couro');
    el.setAttribute('aria-label', texto('heroiInstrucao', 'Afiar a navalha: arraste no couro, ou use as setas e a barra de espaço.'));
    el.setAttribute('aria-describedby', 'couro-instrucao');
    el.removeAttribute('aria-labelledby');
    var cv = D.createElement('canvas'); cv.id = 'couro-canvas'; cv.setAttribute('aria-hidden', 'true');
    el.insertBefore(cv, el.firstChild);
    var dica = D.createElement('p'); dica.className = 'hero-dica';
    var seta = D.createElement('span'); seta.className = 'seta-giz'; seta.setAttribute('aria-hidden', 'true');
    var dt = D.createElement('span'); dt.textContent = texto('heroiDica', 'Dá o fio.');
    dica.appendChild(seta); dica.appendChild(dt);
    var med = D.createElement('div'); med.id = 'medidor-fio';
    med.setAttribute('role', 'progressbar'); med.setAttribute('aria-label', 'Fio da navalha');
    med.setAttribute('aria-valuemin', '0'); med.setAttribute('aria-valuemax', '100'); med.setAttribute('aria-valuenow', '25');
    var afi = D.createElement('p'); afi.className = 'hero-afiada'; afi.setAttribute('aria-live', 'polite');
    var ins = D.createElement('p'); ins.id = 'couro-instrucao'; ins.className = 'so-leitor';
    ins.textContent = texto('instrucaoTeclado', 'Use as setas ou a barra de espaço para afiar.');
    var slot = D.createElement('div'); slot.id = 'navalha-slot';
    [dica, med, afi, ins, slot].forEach(function (n) { el.appendChild(n); });
    iniciarHero(el, cv, slot);
  }

  function iniciarHero(couro, canvas, slot) {
    if (!couro || !canvas || !slot) return;
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;                                  // sem canvas: o CSS já tem o gradiente de reserva

    var h = hero = {
      couro: couro, canvas: canvas, ctx: ctx, slot: slot,
      medidor: D.getElementById('medidor-fio'),
      frase: couro.querySelector('.hero-afiada'),
      btn: D.getElementById('btn-pedir'),
      base: null, marcas: new CamadaMarcas(),
      w: 0, hgt: 0, d: 1,
      nav: criarNavalha(300),
      mx: new Mola(0), my: new Mola(0), mr: new Mola(-4, 140, 0.85), mf: new Mola(1, 320, 0.72),
      repouso: { x: 0, y: 0 }, passadas: 0, afiada: false,
      visivel: true, rodando: false, tAnt: 0,
      intro: null, teclado: 0, ultimaTecla: 0, sentidoTecla: -1,
      ant: null, vel: 0, arrasto: null, desvioY: 0
    };
    slot.appendChild(h.nav.el);

    medirHero();
    if (reduzido()) estadoFinalHero();
    else h.intro = { t0: 0 };                           // atravessa na diagonal no primeiro quadro
    desenharHero();
    agendarHero();

    // gesto
    var seg = { dir: 0, x: 0, y: 0, ext: 0, extY: 0, contou: false, lx: 0, lt: 0 };
    h.arrasto = ligarArrasto(couro, {
      pode: function () { return !reduzido(); },
      inicio: function (e, x0, y0) {
        h.intro = null;
        couro.classList.add('is-arrastando');
        var r = couro.getBoundingClientRect();
        h.desvioY = e.pointerType === 'touch' ? -42 : 0;   // a navalha fica acima do polegar, à vista
        seg.dir = e.clientX >= x0 ? 1 : -1;
        seg.x = x0 - r.left; seg.y = y0 - r.top; seg.ext = e.clientX - r.left; seg.extY = e.clientY - r.top;
        seg.contou = false; seg.lx = e.clientX; seg.lt = agora();
        h.mf.alvo = seg.dir;
        h.vel = 0;
      },
      mover: function (e) {
        var r = couro.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, t = agora();
        var dt = Math.max(1, t - seg.lt);
        h.vel = h.vel * 0.6 + ((e.clientX - seg.lx) / dt) * 0.4;   // px/ms suavizado
        seg.lx = e.clientX; seg.lt = t;
        h.mx.alvo = x;
        h.my.alvo = lim(y + h.desvioY, h.nav.A, h.hgt - h.nav.A);
        h.mr.alvo = -4 + lim(h.vel * 7, -10, 10);
        // troca de sentido: o dedo voltou 12px a partir do extremo
        if ((x - seg.ext) * seg.dir >= 0) { seg.ext = x; seg.extY = y; }
        else if ((seg.ext - x) * seg.dir > 12) {
          seg.dir = -seg.dir; seg.x = seg.ext; seg.y = seg.extY; seg.ext = x; seg.extY = y; seg.contou = false;
          h.mf.alvo = seg.dir;                            // gira 180 graus no eixo longo
        }
        if (!seg.contou) {
          var dx = x - seg.x, dy = y - seg.y;
          if (Math.abs(dx) > 24 && Math.abs(dx) > Math.abs(dy)) { seg.contou = true; passadaHero(seg.dir, lim(Math.abs(h.vel) / 1.2, 0, 1)); }
        }
        agendarHero();
      },
      fim: function () {
        couro.classList.remove('is-arrastando');
        voltarAoRepouso();
        agendarHero();
      }
    });

    // teclado: setas e espaço fazem uma passada animada
    couro.addEventListener('keydown', function (e) {
      if (e.target !== couro || reduzido() || e.altKey || e.ctrlKey || e.metaKey) return;
      var k = e.key, s = 0;
      if (k === 'ArrowLeft') s = -1;
      else if (k === 'ArrowRight') s = 1;
      else if ((k === ' ' || k === 'Spacebar') && !h.afiada) s = -h.sentidoTecla;
      else return;
      e.preventDefault();
      var t = agora();
      if (e.repeat && t - h.ultimaTecla < 180) return;  // segurar a tecla não vira metralhadora; toques novos sempre contam
      h.ultimaTecla = t; h.sentidoTecla = s;
      h.intro = null;
      h.mx.alvo = h.repouso.x + s * h.w * 0.26;
      h.mr.alvo = -4 + s * 6;
      h.mf.alvo = s;
      h.teclado = t + 260;
      passadaHero(s, 0.6);
      agendarHero();
    });

    // pausa fora da tela
    if ('IntersectionObserver' in W) {
      new IntersectionObserver(function (ents) {
        h.visivel = ents[ents.length - 1].isIntersecting;
        if (h.visivel) { h.tAnt = 0; agendarHero(); }
      }).observe(couro);
    }

    // redimensionar com debounce: recria o couro de base
    var tRes = 0, ultimoTam = h.w + 'x' + h.hgt;
    function aoRedimensionar() {
      clearTimeout(tRes);
      tRes = setTimeout(function () {
        var tam = couro.clientWidth + 'x' + couro.clientHeight;
        if (tam === ultimoTam && dpr() === h.d) return;
        ultimoTam = tam;
        medirHero(); desenharHero(); agendarHero();
      }, 200);
    }
    if ('ResizeObserver' in W) new ResizeObserver(aoRedimensionar).observe(couro);
    else W.addEventListener('resize', aoRedimensionar);

    // tema ou cores do config mudaram: regera o couro com as cores novas
    var tTema = 0;
    function aoMudarTema() {
      clearTimeout(tTema);
      tTema = setTimeout(function () { h.base = gerarBase(); desenharHero(); }, 80);
    }
    if ('MutationObserver' in W) new MutationObserver(aoMudarTema).observe(D.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-tema'] });
    if (W.matchMedia) {
      var mqTema = W.matchMedia('(prefers-color-scheme: dark)');
      if (mqTema.addEventListener) mqTema.addEventListener('change', aoMudarTema);
    }
    // as fontes chegam depois: o nome muda de altura e o repouso da navalha também
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(function () { calcularRepouso(); if (!h.arrasto.ativo()) voltarAoRepouso(reduzido()); agendarHero(); desenharHero(); });
  }

  function gerarBase() {
    var h = hero, c = h.couro;
    var cores = {
      fundo: lerCor(c, 'var(--couro-fundo, var(--fundo))', '#1f1612'),
      claro: lerCor(c, 'var(--veio-claro, var(--cor-couro))', '#3a2a1e'),
      escuro: lerCor(c, 'var(--veio-escuro, var(--cor-couro))', '#140e0b')
    };
    try { return gerarCouro(h.w, h.hgt, h.d, cores); } catch (e) { return null; }
  }

  function calcularRepouso() {
    var h = hero, cs = getComputedStyle(h.couro);
    var topo = parseFloat(cs.paddingTop) || 120;
    var nome = h.couro.querySelector('.heroi-nome');
    var inicioTexto = nome ? nome.offsetTop : h.hgt * 0.6;
    h.repouso.x = h.w / 2;
    h.repouso.y = lim((topo * 0.75 + inicioTexto) / 2, h.nav.A + 8, Math.max(h.nav.A + 8, h.hgt - h.nav.A));
  }

  function medirHero() {
    var h = hero;
    h.w = Math.max(1, h.couro.clientWidth); h.hgt = Math.max(1, h.couro.clientHeight); h.d = dpr();
    h.canvas.width = Math.round(h.w * h.d); h.canvas.height = Math.round(h.hgt * h.d);
    h.base = gerarBase();
    h.marcas.tamanho(h.w, h.hgt, 1);                    // marcas em 1x: borradas de propósito, 4x mais baratas
    h.nav.tamanho(lim(h.w * 0.74, 180, 380));
    calcularRepouso();
    if (!h.arrasto || !h.arrasto.ativo()) voltarAoRepouso(true);
  }

  function voltarAoRepouso(imediato) {
    var h = hero;
    h.mx.alvo = h.repouso.x; h.my.alvo = h.repouso.y; h.mr.alvo = -4;
    if (imediato) { h.mx.fixar(h.repouso.x); h.my.fixar(h.repouso.y); h.mr.fixar(-4); h.mf.fixar(h.mf.alvo < 0 ? -1 : 1); posarHero(); }
  }

  function posarHero() {
    var h = hero;
    h.nav.pose(h.mx.x, h.my.x, h.mr.x, h.mf.x);
    h.nav.brilho((h.mx.x + h.nav.L / 2) / (h.w + h.nav.L) + h.mx.v * 0.00015);
  }

  function desenharHero() {
    var h = hero, c = h.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (h.base) c.drawImage(h.base, 0, 0);
    else c.clearRect(0, 0, h.canvas.width, h.canvas.height);
    if (h.marcas.suja) c.drawImage(h.marcas.cv, 0, 0, h.canvas.width, h.canvas.height);
  }

  function agendarHero() {
    var h = hero;
    if (!h || h.rodando || !h.visivel || D.hidden) return;
    h.rodando = true;
    requestAnimationFrame(quadroHero);
  }

  function easeSaida(p) { return 1 - Math.pow(1 - p, 3); }

  function quadroHero(t) {
    var h = hero;
    h.rodando = false;
    var dt = h.tAnt ? lim((t - h.tAnt) / 1000, 0, 1 / 30) : 1 / 60;
    h.tAnt = t;
    var reduz = reduzido();
    var marcando = false, alfa = 0.1;

    if (h.intro && !reduz) {
      // 0 a 0,8 s: a navalha atravessa o couro na diagonal até o repouso
      if (!h.intro.t0) h.intro.t0 = t;
      var p = lim((t - h.intro.t0) / 800, 0, 1), e = easeSaida(p);
      var sx = -h.nav.L * 0.55, sy = h.repouso.y - h.hgt * 0.22;
      h.mx.fixar(sx + (h.repouso.x - sx) * e);
      h.my.fixar(sy + (h.repouso.y - sy) * e);
      h.mr.fixar(-26 + 22 * e);
      marcando = true; alfa = 0.05 * (1 - p);
      if (p >= 1) h.intro = null;
    } else {
      if (h.teclado && t > h.teclado) { h.teclado = 0; voltarAoRepouso(); }
      h.mx.passo(dt); h.my.passo(dt); h.mr.passo(dt); h.mf.passo(dt);
      var ativo = h.arrasto && h.arrasto.ativo();
      marcando = ativo || !!h.teclado;
      alfa = 0.09 + 0.14 * lim(Math.abs(h.mx.v) / 1500, 0, 1);
    }
    posarHero();

    // marca no couro onde a lâmina passou
    var rr = h.mr.x * Math.PI / 180;
    var pg = h.nav.pegada(h.mx.x, h.my.x, rr);
    if (marcando && h.ant && (Math.abs(pg.x - h.ant.x) > 0.5 || Math.abs(pg.y - h.ant.y) > 0.5)) {
      h.marcas.riscar(h.ant, pg, h.nav.meiaL(), h.nav.meiaA() * Math.abs(h.mf.x) + 1, alfa);
    }
    h.ant = pg;
    h.marcas.desbotar(dt);
    desenharHero();

    var parado = h.mx.parada(0.3) && h.my.parada(0.3) && h.mr.parada(0.05) && h.mf.parada(0.002);
    if (h.intro || !parado || h.marcas.suja || (h.arrasto && h.arrasto.ativo()) || h.teclado) agendarHero();
    else h.tAnt = 0;
  }

  function atualizarMedidor(v) {
    var h = hero;
    h.couro.style.setProperty('--fio', v.toFixed(4));
    if (h.medidor) {
      h.medidor.setAttribute('aria-valuenow', String(Math.round(v * 100)));
      h.medidor.setAttribute('aria-valuetext', Math.round(v * 100) + '% de fio');
    }
  }

  function passadaHero(sentido, velocidade) {
    var h = hero;
    if (!h.afiada) {
      h.passadas = Math.min(4, h.passadas + 1);
      atualizarMedidor(0.25 + 0.75 * h.passadas / 4);   // 25% -> 100% em quatro passadas
    }
    emitir('ritual:passada', { origem: 'heroi', sentido: sentido, velocidade: lim(velocidade, 0, 1), progresso: h.afiada ? 1 : h.passadas / 4 });
    vibrar();
    if (!h.afiada && h.passadas >= 4) afiarHero(true);
  }

  function afiarHero(comEfeito) {
    var h = hero;
    if (!h || h.afiada) return;
    h.afiada = true; h.passadas = 4;
    atualizarMedidor(1);
    // o texto entra só agora: a mudança de conteúdo é o que faz a região aria-live anunciar
    if (h.frase) h.frase.textContent = texto('heroiPronto', 'Afiada.');
    var anima = comEfeito && !reduzido();
    if (anima) {
      // lampejo de 120 ms (--dur-rapida), uma piscada só (fotossensibilidade); a classe sai aos 220 ms, depois do fim da animação
      h.couro.classList.add('is-lampejo');
      setTimeout(function () { h.couro.classList.remove('is-lampejo'); }, 220);
    }
    h.couro.classList.add('is-afiada');
    emitir('motor:ritual-pronto', { ritual: 'navalha' });
    if (anima) emitir('ritual:afiada', { origem: 'heroi' });
  }

  // movimento reduzido: navalha já parada e afiada, sem atravessar, sem lampejo, sem som
  function estadoFinalHero() {
    var h = hero;
    if (!h) return;
    h.intro = null; h.teclado = 0;
    if (h.arrasto) h.arrasto.soltar();
    h.couro.classList.remove('is-arrastando', 'is-lampejo');
    h.mf.fixar(1);
    voltarAoRepouso(true);
    h.marcas.limpar();
    afiarHero(false);
    desenharHero();
  }

  /* =====================================================================
     TIRA DE CONFIRMAÇÃO (mesmo componente de navalha, menor)
     ===================================================================== */
  var registro = [];   // { el, opc, inst, escondida }
  function acharReg(el) { for (var i = 0; i < registro.length; i++) if (registro[i].el === el) return registro[i]; return null; }

  function montarTira(el, opc) {
    var rotulo = opc.rotulo || texto('ritualDica', 'Passe a navalha no couro para enviar');
    el.textContent = '';
    el.classList.add('tira');
    el.classList.remove('is-confirmada', 'is-arrastando');
    el.removeAttribute('aria-disabled');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', rotulo + ' (ou pressione Enter)');
    el.style.setProperty('--fio', '0');

    var cv = D.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    var cctx = cv.getContext && cv.getContext('2d');
    if (cctx) el.appendChild(cv);
    var rot = D.createElement('span');
    rot.className = 'texto-tira';
    rot.textContent = rotulo;
    el.appendChild(rot);
    var nav = criarNavalha(120);
    el.appendChild(nav.el);

    var st = {
      w: 0, h: 0, x0: 0, x1: 1, d: 1,
      mx: new Mola(0), mr: new Mola(0, 200, 0.8),
      travada: false, rodando: false, tAnt: 0, ant: null,
      pega: 0, vel: 0, lx: 0, lt: 0, ultimaEmissao: 0, xEmissao: 0,
      marcas: cctx ? new CamadaMarcas() : null
    };
    if (st.marcas) { st.marcas.cv = cv; st.marcas.ctx = cctx; }

    function medir() {
      var w = el.clientWidth, hh = el.clientHeight;
      if (!w || !hh) return false;
      if (w === st.w && hh === st.h && dpr() === st.d) return true;
      st.w = w; st.h = hh; st.d = dpr();
      nav.tamanho(lim(w * 0.3, 96, 132));
      st.x0 = nav.L / 2 + 6; st.x1 = Math.max(st.x0 + 1, w - nav.L / 2 - 6);
      if (st.marcas) st.marcas.tamanho(w, hh, st.d);
      if (arr && arr.ativo()) st.mx.alvo = lim(st.mx.alvo, st.x0, st.x1);   // girou no meio do arrasto: não salta, só respeita o novo trilho
      else st.mx.fixar(st.travada ? st.x1 : st.x0);
      posar();
      return true;
    }
    function progresso() { return lim((st.mx.x - st.x0) / (st.x1 - st.x0), 0, 1); }
    function posar() {
      nav.pose(st.mx.x, st.h / 2, st.mr.x, 1);
      nav.brilho(progresso());
      el.style.setProperty('--fio', progresso().toFixed(3));
    }
    function agendar() {
      if (st.rodando) return;
      st.rodando = true;
      requestAnimationFrame(quadro);
    }
    function quadro(t) {
      st.rodando = false;
      if (!st.w && !medir()) return;
      var dt = st.tAnt ? lim((t - st.tAnt) / 1000, 0, 1 / 30) : 1 / 60;
      st.tAnt = t;
      st.mx.passo(dt); st.mr.passo(dt);
      posar();
      if (st.marcas) {
        var pg = nav.pegada(st.mx.x, st.h / 2, st.mr.x * Math.PI / 180);
        if (st.ant && st.mx.v > 5) st.marcas.riscar(st.ant, pg, nav.meiaL(), nav.meiaA() + 1, 0.08 + 0.1 * lim(st.mx.v / 900, 0, 1));
        st.ant = pg;
        st.marcas.desbotar(dt);
      }
      var parado = st.mx.parada(0.3) && st.mr.parada(0.05);
      if (!parado || arr.ativo() || (st.marcas && st.marcas.suja)) agendar();
      else st.tAnt = 0;
    }

    function confirmar() {
      if (st.travada) return;                              // nada de confirmação dupla
      st.travada = true;
      arr.soltar();
      el.classList.remove('is-arrastando');
      el.classList.add('is-confirmada');
      el.setAttribute('aria-disabled', 'true');
      if (reduzido()) st.mx.fixar(st.x1); else st.mx.alvo = st.x1;
      st.mr.alvo = 0;
      vibrar();
      agendar();
      emitir('ritual:confirmar', { origem: 'tira', el: el });
    }

    var arr = ligarArrasto(el, {
      // alvo de toque: a navalha inteira na altura da tira (56px), com folga à direita
      pode: function (e) {
        if (st.travada) return false;
        if (!st.w) medir();
        var x = e.clientX - el.getBoundingClientRect().left;
        return x <= st.mx.x + nav.L / 2 + 24;
      },
      inicio: function (e, x0) {
        var r = el.getBoundingClientRect();
        st.pega = (x0 - r.left) - st.mx.x;
        st.lx = e.clientX; st.lt = agora(); st.vel = 0; st.xEmissao = st.mx.x;
        el.classList.add('is-arrastando');
      },
      mover: function (e) {
        if (st.travada) return;
        var r = el.getBoundingClientRect(), t = agora();
        st.vel = st.vel * 0.6 + ((e.clientX - st.lx) / Math.max(1, t - st.lt)) * 0.4;
        st.lx = e.clientX; st.lt = t;
        st.mx.alvo = lim(e.clientX - r.left - st.pega, st.x0, st.x1);
        st.mr.alvo = lim(st.vel * 5, -6, 6);
        var p = (st.mx.alvo - st.x0) / (st.x1 - st.x0);
        if (t - st.ultimaEmissao >= 120 && Math.abs(st.mx.alvo - st.xEmissao) > 4) {   // no máximo uma passada a cada 120 ms
          var sentido = st.mx.alvo >= st.xEmissao ? 1 : -1;
          st.ultimaEmissao = t; st.xEmissao = st.mx.alvo;
          emitir('ritual:passada', { origem: 'tira', sentido: sentido, velocidade: lim(Math.abs(st.vel) / 1.6, 0, 1), progresso: lim(p, 0, 1) });
        }
        // passou de 85%: trava no fim e fica pronta; a confirmação (e o window.open) sai no pointerup
        st.pronta = p >= 0.85;
        if (st.pronta) st.mx.alvo = st.x1;
        el.classList.toggle('is-pronta', st.pronta);
        agendar();
      },
      fim: function (e, cancelado) {
        var pronta = st.pronta;
        st.pronta = false;
        el.classList.remove('is-arrastando', 'is-pronta');
        if (pronta && !cancelado && !st.travada) { confirmar(); return; }   // pointerup conta como gesto: o WhatsApp abre
        if (!st.travada) { st.mx.alvo = st.x0; st.mr.alvo = 0; }   // soltou antes: a navalha volta
        agendar();
      }
    });

    // WCAG 2.5.7: Enter ou Espaço confirmam sem arrastar
    function tecla(e) {
      if (e.target !== el) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        if (!e.repeat) confirmar();
      }
    }
    el.addEventListener('keydown', tecla);

    // WCAG 4.1.2: leitor de tela ativa com click sintético (detail 0); toque comum (detail >= 1) não confirma
    function clique(e) { if (e.detail === 0 && !st.travada) confirmar(); }
    el.addEventListener('click', clique);

    var ro = null;
    if ('ResizeObserver' in W) { ro = new ResizeObserver(function () { if (medir()) agendar(); }); ro.observe(el); }
    medir();

    return {
      resetar: function () {
        st.travada = false;
        el.classList.remove('is-confirmada', 'is-arrastando');
        el.removeAttribute('aria-disabled');
        if (st.marcas) st.marcas.limpar();
        st.ant = null;
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

  function criarTira(el, opc) {
    if (!el) return null;
    opc = opc || {};
    var reg = acharReg(el);
    if (!reg) { reg = { el: el, opc: opc, inst: null, escondida: false }; registro.push(reg); }
    reg.opc = opc;
    if (reg.inst) { reg.inst.desmontar(); reg.inst = null; }
    if (reduzido()) {                                     // o botão "Enviar sem arrastar" vira o único caminho
      el.hidden = true; reg.escondida = true;
      return null;
    }
    if (reg.escondida) { el.hidden = false; reg.escondida = false; }
    reg.inst = montarTira(el, opc);
    return el;
  }

  function resetarTira(el) {
    var reg = acharReg(el);
    if (reg && reg.inst) reg.inst.resetar();
  }

  /* ---------- movimento reduzido: ouve mudanças ao vivo ---------- */
  function aoMudarMovimento() {
    if (reduzido()) {
      estadoFinalHero();
      registro.forEach(function (r) {
        if (r.inst) { r.inst.desmontar(); r.inst = null; }
        r.el.hidden = true; r.escondida = true;
      });
    } else {
      registro.forEach(function (r) { if (!r.inst) criarTira(r.el, r.opc); });
      if (hero) agendarHero();
    }
  }
  if (mqReduz) {
    if (mqReduz.addEventListener) mqReduz.addEventListener('change', aoMudarMovimento);
    else if (mqReduz.addListener) mqReduz.addListener(aoMudarMovimento);
  }
  D.addEventListener('visibilitychange', function () { if (!D.hidden && hero) { hero.tAnt = 0; agendarHero(); } });

  /* ---------- registro do ritual (motor/nichos/index.js cria CREAT_RITUAIS) ---------- */
  W.CREAT_RITUAIS = W.CREAT_RITUAIS || {};
  W.CREAT_RITUAIS.navalha = {
    nome: 'navalha',
    montarHeroi: montarHeroi,
    criarTira: criarTira,
    resetarTira: resetarTira,
    afiar: function () { if (hero) afiarHero(true); },
    mola: MOLA,
    canvas: suportaCanvas()
  };
})();
