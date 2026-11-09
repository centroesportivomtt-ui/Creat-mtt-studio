/*
 * motor/v1/rituais/barra.js · ritual 'barra' do nicho academia, studio e personal (T8)
 *
 * O gesto: levantar a barra. A barra carregada com anilhas está no chão; a pessoa pega e puxa
 * para cima. Ela pesa: sobe atrasada em relação ao dedo, a barra enverga e as anilhas balançam.
 * Soltou antes do topo, a barra cai, quica e levanta pó de magnésio. Chegou no topo, trava
 * lá em cima e o nome da academia ganha a faixa da anilha.
 * Desenho: assets/svg/ritual-academia.svg (Paleta, T2), refeito aqui em nós SVG (o site entregue
 * abre por file:// e não pode buscar o arquivo). As anilhas usam a cor de destaque da paleta
 * (academia-1 vermelha 25 kg, academia-2 azul 20 kg, academia-3 amarela 15 kg).
 *
 * Interface (a mesma do 'navalha', docs/relatorio/T4.md):
 *   CREAT_RITUAIS.barra = { montarHeroi(el, ctx), criarTira(el, {rotulo}), resetarTira(el) }
 * Herói: arrasto só dentro do palco (touch-action: none só nele; fora dele a página rola).
 *   Teclado: seta para cima, Espaço ou Enter sobem a barra um terço por vez (3 toques = topo).
 * Tira: arrasto horizontal; a barra sobe a rampa até o alto. Enter/Espaço confirmam.
 * prefers-reduced-motion: barra já no alto, sem gesto, sem tira (fica "Enviar sem arrastar").
 * Ritual vivo (09/11/2026): ao carregar, a barra cai do alto em dois (antecipação, queda esticada, batida
 *   comprimida, quique, anilhas vibrando, pó de magnésio); parada, a cada 6 a 9 s ela sobe e desce sozinha
 *   com peso e enverga, e a dica vira "Arraste você"; o primeiro toque encerra a demonstração na visita.
 *   Ao travar no alto, a faixa de cada anilha ganha o nome do negócio (carimbo).
 * Eventos: motor:ritual-pronto {ritual:'barra'} · ritual:confirmar {origem:'tira', el}.
 * Precisa de rituais/comum.js antes.
 */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : null;
  if (!W || !W.document || !W.CreatRitualComum) return;
  var D = W.document, C = W.CreatRitualComum, svg = C.svg, no = C.no, lim = C.lim;

  var SUBIDA = 128;          // unidades do viewBox entre o chão e o alto
  var BASE_Y = 60;           // desloca o desenho da T2 (anilhas tocando o chão em y = 224)
  var TRAVA = 0.92;          // chegou aqui puxando: trava no alto
  var TRAVA_SOLTANDO = 0.75; // soltou acima disto: termina de subir e trava

  function desenharBarra(pai) {
    var g = svg('g', null, pai);
    var barra = svg('g', null, g);
    var sombraBarra = svg('path', { 'class': 'ra-sombra-traco', d: 'M8 118 Q100 118 196 118' }, barra);
    var contorno = svg('path', { 'class': 'ra-barra-contorno', d: 'M4 114 Q100 114 194 114' }, barra);
    var aco = svg('path', { 'class': 'ra-barra-aco', d: 'M4 114 Q100 114 194 114' }, barra);
    svg('path', { 'class': 'ra-recartilhado', d: 'M76 110 l6 8 M84 110 l6 8 M92 110 l6 8 M100 110 l6 8 M108 110 l6 8 M116 110 l6 8' }, barra);
    function anilha(lado) {
      var a = svg('g', { 'class': 'ra-anilha' }, g);
      var x = lado < 0 ? 34 : 142, xp = lado < 0 ? 18 : 168, xs = lado < 0 ? 8 : 184;
      svg('rect', { 'class': 'ra-sombra', x: x + 4, y: 68, width: 24, height: 100, rx: 8 }, a);
      svg('rect', { 'class': 'ra-destaque ra-l', x: x, y: 64, width: 24, height: 100, rx: 8 }, a);
      svg('path', { 'class': 'ra-brilho', d: 'M' + (x + 7) + ' 74 V96' }, a);
      svg('rect', { 'class': 'ra-anilha-2 ra-l', 'stroke-width': 3, x: xp, y: 86, width: 14, height: 56, rx: 5 }, a);
      svg('rect', { 'class': 'ra-aco-escuro ra-l', 'stroke-width': 3, x: xs, y: 102, width: 8, height: 24, rx: 3 }, a);
      // a faixa da anilha: nasce vazia e ganha o nome do negócio quando a barra trava no alto
      var fx = svg('g', { 'class': 'ra-faixa' }, a);
      svg('rect', { 'class': 'ra-faixa-fundo', x: x + 4, y: 70, width: 16, height: 88, rx: 4 }, fx);
      var nome = C.nomeNegocio(22).toUpperCase();
      if (nome) {
        var t = svg('text', { 'class': 'ra-faixa-nome', x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'central',
          transform: 'translate(' + (x + 12) + ' 114) rotate(-90)' }, fx);
        t.textContent = nome;
        if (nome.length > 10) { t.setAttribute('textLength', 78); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
      }
      return a;
    }
    return { g: g, esq: anilha(-1), dir: anilha(1), caminhos: [sombraBarra, contorno, aco] };
  }

  /* =====================================================================
     HERÓI
     ===================================================================== */
  var heroi = null;

  function montarHeroi(el) {
    if (!el || heroi) return;
    el.classList.add('ritual-heroi', 'barra');
    var palco = no('div', 'palco-ritual palco-barra');
    palco.id = 'palco-barra';
    palco.setAttribute('tabindex', '0');
    palco.setAttribute('role', 'group');
    palco.setAttribute('aria-roledescription', 'barra para levantar');
    palco.setAttribute('aria-label', C.texto('heroiInstrucao', 'Levantar a barra: arraste a barra para cima, ou use a seta para cima e a barra de espaço.'));
    palco.setAttribute('aria-describedby', 'barra-instrucao');

    var s = svg('svg', { viewBox: '0 0 200 240', 'class': 'ra-svg', 'aria-hidden': 'true', focusable: 'false' }, palco);
    svg('path', { 'class': 'ra-lf ra-chao', 'stroke-width': 4, d: 'M6 226 H194' }, s);
    // marca do alto: linha tracejada de ponta a ponta com as pontas fechadas (v1.1.1; antes eram dois
    // tracinhos soltos que liam como "-- --"); quando a barra trava no alto, fica cheia no destaque
    var marca = svg('g', { 'class': 'ra-marca' }, s);
    svg('path', { 'class': 'ra-marca-topo', d: 'M16 30 H184' }, marca);
    svg('path', { 'class': 'ra-marca-ponta', d: 'M10 22 V38 M190 22 V38' }, marca);
    var subir = svg('g', null, s);
    var escala = svg('g', { transform: 'translate(100 164) scale(0.78) translate(-100 -164)' }, subir);
    var barra = desenharBarra(escala);
    var poeira = svg('g', { 'class': 'ra-poeira' }, s);
    // pó de magnésio: os 5 grãos do meio (o quique) + 4 que só saem com a batida forte (a entrada, a trava)
    [[86, 222, 6, -4], [112, 224, 4.5, 5], [72, 224, 3.5, -9], [126, 221, 3, 9], [100, 225, 5, 0],
     [40, 224, 4, -14], [160, 224, 4, 14], [24, 223, 3, -20], [176, 223, 3, 20]].forEach(function (c, i) {
      svg('circle', { 'class': 'ra-giz ra-l' + (i > 4 ? ' ra-giz-forte' : ''), 'stroke-width': 2.5, cx: c[0], cy: c[1], r: c[2],
        style: '--i:' + (i % 5) + ';--dx:' + c[3] + 'px' }, poeira);
    });
    marca.setAttribute('aria-hidden', 'true');

    var dica = no('p', 'ritual-dica');
    var seta = no('span', 'seta-giz seta-cima', dica);
    seta.setAttribute('aria-hidden', 'true');
    var dt = no('span', null, dica);
    dt.textContent = C.texto('heroiDica', 'Levante a barra.');
    var med = no('div', 'ritual-medidor');
    med.setAttribute('role', 'progressbar');
    med.setAttribute('aria-label', 'Altura da barra');
    med.setAttribute('aria-valuemin', '0'); med.setAttribute('aria-valuemax', '100'); med.setAttribute('aria-valuenow', '0');
    var pronto = no('p', 'ritual-pronto');
    pronto.setAttribute('aria-live', 'polite');
    var ins = no('p', 'so-leitor');
    ins.id = 'barra-instrucao';
    ins.textContent = C.texto('instrucaoTeclado', 'Use a seta para cima ou a barra de espaço para levantar.');
    [dica, med, pronto, ins].forEach(function (n) { palco.appendChild(n); });
    el.insertBefore(palco, el.firstChild);

    var h = heroi = {
      el: el, palco: palco, svg: s, subir: subir, barra: barra, poeira: poeira, medidor: med, frase: pronto,
      my: new C.Mola(0, 120, 0.72), alturaMax: 0, levantada: false, rodando: false, tAnt: 0,
      y0: 0, l0: 0, teclas: 0, caindo: false, flexAnt: 0,
      cena: null, vez: C.dicaVez(dica), diretor: null
    };

    if (C.reduzido()) estadoFinal();
    posar(0);

    // ritual vivo: entrada ao carregar e demonstração em loop até o primeiro toque
    h.diretor = C.diretor(palco, {
      pode: function () { return !h.levantada && !h.cena && !(h.arrasto && h.arrasto.ativo()) && h.my.parada(0.01); },
      tocar: function (fim) { rodarCena(demoCena, fim); },
      aoFim: function () { if (h.vez) h.vez.mostrar(); },
      aoParar: function () { if (h.vez) h.vez.esconder(); }
    });
    if (h.levantada) h.diretor.parar();
    else if (!C.reduzido()) {
      h.subir.style.opacity = '0'; h.opAnt = 0;          // a barra só aparece no primeiro quadro da entrada
      rodarCena(entradaCena, function () { if (h.diretor) h.diretor.iniciar(); });
    }
    palco.addEventListener('pointerdown', primeiroToque, true);
    palco.addEventListener('keydown', primeiroToque, true);

    h.arrasto = C.ponteiro(palco, {
      pode: function () { return !C.reduzido() && !h.levantada; },
      inicio: function (e) {
        primeiroToque();
        h.y0 = e.clientY; h.l0 = h.my.x;
        h.my.k = 120; h.my.z = 0.72;
        h.caindo = false;
        palco.classList.add('is-segurando');
        agendar();
      },
      mover: function (e) {
        var alt = Math.max(120, palco.getBoundingClientRect().height);
        var puxada = (h.y0 - e.clientY) / (alt * 0.62);
        h.my.alvo = lim(h.l0 + puxada, 0, 1.02);
        agendar();
      },
      fim: function (e, cancelado) {
        palco.classList.remove('is-segurando');
        if (h.levantada) return;
        if (!cancelado && Math.max(h.my.x, h.my.alvo) >= TRAVA_SOLTANDO) { travar(true); return; }
        h.my.k = 210; h.my.z = 0.42;             // cai pesada e quica
        h.my.alvo = 0; h.caindo = true;
        agendar();
      }
    });

    palco.addEventListener('keydown', function (e) {
      if (e.target !== palco || C.reduzido() || h.levantada || e.altKey || e.ctrlKey || e.metaKey) return;
      var k = e.key;
      if (['ArrowUp', 'ArrowRight', ' ', 'Spacebar', 'Enter'].indexOf(k) === -1) return;
      e.preventDefault();
      if (e.repeat) return;
      h.teclas = Math.min(3, h.teclas + 1);
      h.my.k = 150; h.my.z = 0.7; h.caindo = false;
      if (h.teclas >= 3) travar(true);
      else { h.my.alvo = h.teclas / 3; C.vibrar(6); agendar(); }
    });

    C.aoMudarMovimento(function (reduz) { if (reduz) estadoFinal(); });
  }

  /* =====================================================================
     RITUAL VIVO
     A cena escreve a pose direto (l, flex, comprime, vibra) e deixa a mola da barra no mesmo
     lugar a cada quadro: se alguém pega no meio, a física continua dali, sem salto.
     ===================================================================== */
  function primeiroToque() {
    var h = heroi;
    if (!h) return;
    if (h.diretor) h.diretor.parar();
    pararCena();
  }

  function rodarCena(fn, fim) {
    var h = heroi;
    pararCena();
    var lAnt = h.my.x;
    h.palco.classList.add('is-em-cena');
    var c = h.cena = {
      fn: fn, fim: fim, poeira: 0,
      ctrl: C.cena(function (T, dt) {
        if (h.cena !== c) return false;
        var o = fn(T, c);
        if (!o) return false;
        h.my.x = h.my.alvo = o.l;
        h.my.v = dt ? (o.l - lAnt) / dt : 0;
        lAnt = o.l;
        h.flexAnt = o.flex || 0;
        posar(o.flex || 0, o);
        return true;
      }, function () {
        if (h.cena !== c) return;
        h.cena = null;
        h.palco.classList.remove('is-em-cena');
        h.my.fixar(0); h.flexAnt = 0;
        posar(0);
        if (c.fim) c.fim();
      })
    };
  }
  function pararCena() {
    var h = heroi;
    if (!h || !h.cena) return;
    var c = h.cena;
    h.cena = null;
    c.ctrl.parar();
    h.palco.classList.remove('is-em-cena');
    // a mola segue da pose em que a cena parou (abaixo da trava: pegar na queda não vale como levantar)
    h.my.x = Math.min(h.my.x, 0.8); h.my.v = lim(h.my.v, -3, 3); h.my.alvo = h.my.x;
    if (h.my.x > 0.02) { h.my.k = 210; h.my.z = 0.42; h.my.alvo = 0; h.caindo = true; }
    agendar();
  }

  /* entrada, EM DOIS (12 poses/s): a barra aparece no alto, dá a antecipação (sobe um fio),
     cai com a gravidade, bate no chão comprimida, quica, enverga e as anilhas vibram no pó */
  function entradaCena(t, c) {
    var T = C.emDois(t), cv = C.curva, tr = C.trecho;
    var o = { l: 0, flex: 0, sq: 0, vib: 0, op: 1 };
    if (T < 260) {                                   // pendurada + antecipação
      var a = tr(T, 0, 260);
      o.l = 0.98 + 0.08 * cv.saida(a);
      o.sq = -0.05 * a;                              // estica para cima antes de cair
      o.op = tr(T, 0, 160);
    } else if (T < 560) {                            // queda: gravidade (entrada quadrática)
      var q = tr(T, 260, 560);
      o.l = 1.06 * (1 - cv.entrada(q));
      o.sq = -0.08 * q;                              // esticada no sentido da queda
      o.flex = 0.9 * q;                              // o meio fica para trás, as anilhas puxam
    } else if (T < 1340) {                           // impacto
      var tau = T - 560;
      if (!c.poeira) { c.poeira = 1; poeira(true); }
      o.sq = 0.16 * Math.exp(-tau / 120) * Math.cos(2 * Math.PI * tau / 200);
      o.flex = -1.8 * Math.exp(-tau / 170) * Math.cos(2 * Math.PI * tau / 250);
      o.l = tau > 80 && tau < 330 ? 0.07 * Math.sin(Math.PI * (tau - 80) / 250) : 0;
      var quadroN = Math.floor(tau / (1000 / 12));
      o.vib = 5 * Math.exp(-tau / 260) * (quadroN % 2 ? 1 : -1);   // vibração de desenho: pose sim, pose não
    } else return null;
    return o;
  }

  /* demonstração curta (60 qps, com peso): agacha, puxa devagar, segura tremendo, solta e quica */
  function demoCena(T, c) {
    var cv = C.curva, tr = C.trecho;
    var o = { l: 0, flex: 0, sq: 0, vib: 0 };
    var TOPO = 0.52;
    if (T < 200) {                                   // antecipação: afunda no chão
      o.sq = 0.06 * Math.sin(Math.PI * tr(T, 0, 200));
    } else if (T < 860) {                            // subida pesada
      var p = tr(T, 200, 860);
      o.l = TOPO * cv.seno(p);
      o.flex = 1.5 * Math.sin(Math.PI * p);          // o meio vai na frente; as anilhas ficam
    } else if (T < 1060) {                           // segura lá em cima, tremendo
      o.l = TOPO + 0.006 * Math.sin(T / 16);
      o.flex = 0.25 * Math.sin(T / 22);
    } else if (T < 1340) {                           // solta
      var d = tr(T, 1060, 1340);
      o.l = TOPO * (1 - cv.entrada(d));
      o.flex = -1.1 * d;
    } else if (T < 1800) {                           // bate, quica e assenta
      var tau = T - 1340;
      if (!c.poeira) { c.poeira = 1; poeira(false); }
      o.sq = 0.1 * Math.exp(-tau / 100) * Math.cos(2 * Math.PI * tau / 180);
      o.flex = -1.4 * Math.exp(-tau / 150) * Math.cos(2 * Math.PI * tau / 220);
      o.l = tau > 60 && tau < 260 ? 0.035 * Math.sin(Math.PI * (tau - 60) / 200) : 0;
      o.vib = 2.5 * Math.exp(-tau / 160) * Math.sin(2 * Math.PI * tau / 90);
    } else return null;
    return o;
  }

  function poeira(forte) {
    var h = heroi;
    if (C.reduzido()) return;
    h.poeira.classList.remove('is-subindo', 'is-forte');
    void h.poeira.getBoundingClientRect();
    h.poeira.classList.add('is-subindo');
    if (forte) h.poeira.classList.add('is-forte');
  }

  function travar(comEfeito) {
    var h = heroi;
    if (!h || h.levantada) return;
    if (h.diretor) h.diretor.parar();
    if (h.cena) { var c = h.cena; h.cena = null; c.ctrl.parar(); h.palco.classList.remove('is-em-cena'); }
    h.levantada = true;
    h.teclas = 3;
    if (h.arrasto) h.arrasto.soltar();
    h.palco.classList.remove('is-segurando');
    h.my.k = 260; h.my.z = 0.5; h.my.alvo = 1;
    if (C.reduzido() || !comEfeito) h.my.fixar(1);
    h.alturaMax = 1;
    atualizarMedidor(1);
    h.frase.textContent = C.texto('heroiPronto', 'Levantou.');
    h.el.classList.add('is-levantada');
    h.palco.classList.add('is-levantada');
    h.palco.setAttribute('aria-disabled', 'true');
    if (comEfeito && !C.reduzido()) {
      poeira(true); C.som('trava'); C.vibrar(20);
      // celebração: a faixa da anilha ganha o nome (carimbo), um quadro depois da batida
      h.palco.classList.remove('is-carimbo');
      void h.palco.getBoundingClientRect();
      h.palco.classList.add('is-carimbo');
    }
    posar(0);
    agendar();
    C.emitir('motor:ritual-pronto', { ritual: 'barra' });
  }

  function estadoFinal() {
    var h = heroi;
    if (!h) return;
    travar(false);
    h.my.fixar(1);
    posar(0);
  }

  function atualizarMedidor(v) {
    var h = heroi;
    h.palco.style.setProperty('--prog', v.toFixed(3));
    h.medidor.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    h.medidor.setAttribute('aria-valuetext', Math.round(v * 100) + '% da subida');
  }

  /* flex > 0: a barra subindo rápido, o meio vai na frente e as pontas (as anilhas) ficam atrás */
  /* o (opcional, da cena): l altura, sq comprime (+) ou estica (-) mantendo o volume, vib giro das anilhas, op opacidade */
  function posar(flex, o) {
    var h = heroi, l = o ? lim(o.l, -0.05, 1.3) : lim(h.my.x, -0.05, 1.04);
    var y = BASE_Y - l * SUBIDA;
    var sq = o && o.sq || 0;
    var sy = (1 - lim(flex * 0.05, -0.05, 0.06)) * (1 - sq), sx = (1 + lim(flex * 0.025, -0.03, 0.03)) / (1 - sq);
    h.subir.setAttribute('transform', 'translate(0 ' + y.toFixed(2) + ') translate(100 164) scale(' + sx.toFixed(3) + ' ' + sy.toFixed(3) + ') translate(-100 -164)');
    var curva = lim(flex * 9, -10, 12);
    var d = function (ox, oy) { return 'M' + (4 + ox) + ' ' + (114 + oy + curva) + ' Q100 ' + (114 + oy - curva) + ' ' + (194 + ox) + ' ' + (114 + oy + curva); };
    h.barra.caminhos[0].setAttribute('d', d(4, 4));
    h.barra.caminhos[1].setAttribute('d', d(0, 0));
    h.barra.caminhos[2].setAttribute('d', d(0, 0));
    var giro = lim(flex * 4, -6, 6), vib = o && o.vib || 0;
    h.barra.esq.setAttribute('transform', 'translate(0 ' + curva.toFixed(2) + ') rotate(' + (-giro + vib).toFixed(2) + ' 46 114)');
    h.barra.dir.setAttribute('transform', 'translate(0 ' + curva.toFixed(2) + ') rotate(' + (giro + vib).toFixed(2) + ' 154 114)');
    var op = o && o.op != null ? o.op : 1;
    if (op !== h.opAnt) { h.opAnt = op; h.subir.style.opacity = op >= 1 ? '' : op.toFixed(2); }
  }

  function agendar() {
    var h = heroi;
    if (h.rodando || h.cena) return;
    h.rodando = true;
    W.requestAnimationFrame(quadro);
  }
  function quadro(t) {
    var h = heroi;
    h.rodando = false;
    var dt = h.tAnt ? lim((t - h.tAnt) / 1000, 0, 1 / 30) : 1 / 60;
    h.tAnt = t;
    var vAnt = h.my.v;
    h.my.passo(dt);
    var flex = h.flexAnt * 0.7 + lim(h.my.v / 3, -2, 2) * 0.3;
    h.flexAnt = flex;
    posar(flex);
    if (!h.levantada) {
      if (h.my.x > h.alturaMax) { h.alturaMax = Math.min(1, h.my.x); atualizarMedidor(Math.min(1, h.alturaMax / TRAVA)); }
      if (h.arrasto && h.arrasto.ativo() && h.my.x >= TRAVA) { travar(true); return; }
      // bateu no chão descendo: pó e quique
      if (h.caindo && vAnt < -0.6 && h.my.x <= 0.02) { poeira(false); C.vibrar(10); h.caindo = vAnt < -1.4; }
    }
    var parado = h.my.parada(0.002) && Math.abs(flex) < 0.01;
    if (!parado || (h.arrasto && h.arrasto.ativo())) agendar();
    else { h.tAnt = 0; h.flexAnt = 0; posar(0); }
  }

  /* =====================================================================
     TIRA DE CONFIRMAR: a barra sobe a rampa da esquerda (chão) para a direita (alto)
     ===================================================================== */
  var DESENHO_TIRA = {
    nome: 'barra',
    classe: 'tira-barra',
    montar: function (el) {
      no('span', 'tb-chao', el);
      var alca = no('span', 'tb-barra', el);
      var s = svg('svg', { viewBox: '0 0 64 30', 'aria-hidden': 'true', focusable: 'false' }, alca);
      svg('rect', { 'class': 'ra-barra-mini', x: 1, y: 13, width: 62, height: 4, rx: 2 }, s);
      [[11, 2, 8, 26, 'ra-destaque'], [45, 2, 8, 26, 'ra-destaque'], [4, 7, 6, 16, 'ra-anilha-2'], [54, 7, 6, 16, 'ra-anilha-2']].forEach(function (r) {
        svg('rect', { 'class': r[4] + ' ra-l-mini', x: r[0], y: r[1], width: r[2], height: r[3], rx: 2 }, s);
      });
      return {
        larguraAlca: function () { return 64; },
        posar: function (p, v, x, h) {
          var sobe = (1 - p) * 7 - p * 9;
          var torce = lim(v / 60, -6, 6);
          alca.style.transform = 'translate(' + (x - 32).toFixed(1) + 'px, ' + sobe.toFixed(1) + 'px) rotate(' + (-torce).toFixed(1) + 'deg)';
        },
        resetar: function () {}
      };
    }
  };

  W.CREAT_RITUAIS = W.CREAT_RITUAIS || {};
  W.CREAT_RITUAIS.barra = {
    nome: 'barra',
    montarHeroi: montarHeroi,
    criarTira: function (el, opc) { return C.tira(el, { rotulo: (opc && opc.rotulo) || C.texto('ritualDica', 'Levante a barra para enviar') }, DESENHO_TIRA); },
    resetarTira: C.resetarTira,
    levantar: function () { if (heroi) travar(true); }
  };
})();
