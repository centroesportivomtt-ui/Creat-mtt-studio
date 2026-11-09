/*
 * motor/v1/rituais/esmalte.js · ritual 'esmalte' do nicho salão (T8)
 *
 * O gesto: pincelar o esmalte. O pincel mora no vidrinho (a tampa do esmalte É o cabo do
 * pincel, como na vida real); a pessoa tira o pincel e arrasta sobre a unha desenhada.
 * A tinta fica exatamente onde o pincel passou; com a unha coberta, o esmalte assenta,
 * ganha brilho e o nome do salão fica na cor do esmalte.
 * Desenho: assets/svg/ritual-salao.svg (Paleta, T2), refeito aqui em nós SVG com ids prefixados
 * 're-' porque o site entregue abre por file:// e não pode buscar o arquivo.
 *
 * Interface (a mesma do 'navalha', docs/relatorio/T4.md):
 *   CREAT_RITUAIS.esmalte = { montarHeroi(el, ctx), criarTira(el, {rotulo}), resetarTira(el) }
 * Herói: arrasto 2D só dentro do palco (touch-action: none só nele; fora dele a página rola).
 *   Teclado: setas, Espaço ou Enter dão uma pincelada inteira (3 pinceladas pintam a unha).
 *   Toque sem arrastar deixa uma gota de esmalte onde tocou.
 * Tira: arrasto horizontal do pincel pintando uma unha comprida; Enter/Espaço confirmam.
 * prefers-reduced-motion: unha já pintada, sem gesto, sem tira (fica "Enviar sem arrastar").
 * Ritual vivo (09/11/2026): ao carregar, a mão sobe e o vidrinho entra girando (em dois), assenta comprimido
 *   e o pincel sai, sacode e volta; parado, a cada 6 a 9 s o pincel pinta uma faixa da unha, uma gota escorre
 *   pelo dedo e a tinta da demonstração some (não conta na cobertura); o primeiro toque encerra.
 *   Unha pronta: um reflexo atravessa a unha e uma estrela de brilho estala.
 * Eventos: motor:ritual-pronto {ritual:'esmalte'} · ritual:confirmar {origem:'tira', el}.
 * Precisa de rituais/comum.js antes.
 */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : null;
  if (!W || !W.document || !W.CreatRitualComum) return;
  var D = W.document, C = W.CreatRitualComum, svg = C.svg, no = C.no, lim = C.lim;

  /* geometria da unha (viewBox 200 x 200 do ritual-salao.svg) */
  var UNHA = 'M74 118 V84 Q74 58 95 58 Q116 58 116 84 V118 Q95 126 74 118 Z';
  var RAIO_PINCEL = 8.5;               // meia largura da pincelada, em unidades do viewBox
  var COLUNAS = [82, 95, 108];         // as 3 pinceladas da manicure: esquerda, meio, direita
  var COBERTURA_PRONTA = 0.82;
  var REPOUSO = { x: 170, y: 172, rot: 0 };   // ponta do pincel dentro do vidrinho

  function dentroUnha(x, y) {
    if (x < 75 || x > 115 || y > 119 || y < 58) return false;
    if (y < 84) { var dx = (x - 95) / 21, dy = (y - 84) / 26; return dx * dx + dy * dy <= 0.95; }
    return true;
  }
  /* pontos de amostra da cobertura: grade dentro da unha */
  var AMOSTRAS = [];
  for (var ay = 61; ay <= 117; ay += 6.2) for (var ax = 77.5; ax <= 112.5; ax += 5) if (dentroUnha(ax, ay)) AMOSTRAS.push([ax, ay]);

  function desenharPincel(pai, classe) {
    /* ponta das cerdas em (0, 0), cabo para cima; o cabo é a tampa do vidrinho */
    var g = svg('g', { 'class': classe || 're-pincel' }, pai);
    svg('rect', { 'class': 're-sombra', x: -8, y: -76, width: 20, height: 32, rx: 5, transform: 'translate(3 3)' }, g);
    svg('rect', { 'class': 're-tinta re-l', x: -10, y: -78, width: 20, height: 32, rx: 5 }, g);
    svg('path', { 'class': 're-brilho', d: 'M-5 -72 V-56' }, g);
    svg('path', { 'class': 're-lf', d: 'M0 -46 V-18' }, g);
    svg('path', { 'class': 're-destaque re-l', 'stroke-width': 3, d: 'M-7 -20 H7 L6 -4 Q0 4 -6 -4 Z' }, g);
    return g;
  }

  /* =====================================================================
     HERÓI
     ===================================================================== */
  var heroi = null;

  function montarHeroi(el) {
    if (!el || heroi) return;
    el.classList.add('ritual-heroi', 'esmalte');
    var palco = no('div', 'palco-ritual palco-esmalte');
    palco.id = 'palco-esmalte';
    palco.setAttribute('tabindex', '0');
    palco.setAttribute('role', 'group');
    palco.setAttribute('aria-roledescription', 'unha para pintar');
    palco.setAttribute('aria-label', C.texto('heroiInstrucao', 'Pintar a unha: arraste o pincel sobre a unha, ou use as setas e a barra de espaço.'));
    palco.setAttribute('aria-describedby', 'esmalte-instrucao');

    var s = svg('svg', { viewBox: '0 0 200 200', 'class': 're-svg', 'aria-hidden': 'true', focusable: 'false' }, palco);
    var defs = svg('defs', null, s);
    var cp = svg('clipPath', { id: 're-clip-unha' }, defs);
    svg('path', { d: UNHA }, cp);
    // a mão (dedo + unha) e a garrafa (pincel em repouso + vidrinho) são grupos: a entrada move cada um
    var mao = svg('g', { 'class': 're-mao' }, s);
    // dedo
    var dedo = svg('g', null, mao);
    svg('path', { 'class': 're-sombra', d: 'M58 204 V78 Q58 36 95 36 Q132 36 132 78 V204 Z', transform: 'translate(5 4)' }, dedo);
    svg('path', { 'class': 're-pele re-l', d: 'M58 204 V78 Q58 36 95 36 Q132 36 132 78 V204 Z' }, dedo);
    svg('path', { 'class': 're-lf', d: 'M74 166 Q95 172 116 166 M78 178 Q95 183 112 178' }, dedo);
    // unha
    var unha = svg('g', null, mao);
    svg('path', { 'class': 're-unha-base re-l', 'stroke-width': 3, d: UNHA }, unha);
    var tinta = svg('g', { 'clip-path': 'url(#re-clip-unha)' }, unha);
    var pinceladas = svg('g', { 'class': 're-pinceladas' }, tinta);
    var demoTraco = svg('path', { 'class': 're-pincelada re-demo', d: 'M95 62 l0 0', opacity: 0 }, tinta);   // a pincelada da demonstração (não conta)
    var assentar = svg('rect', { 'class': 're-destaque re-assentar', x: 70, y: 54, width: 50, height: 76 }, tinta);
    // celebração: o reflexo que atravessa a unha pintada
    var lampejo = svg('g', { 'class': 're-lampejo' }, tinta);
    svg('rect', { x: 60, y: 40, width: 12, height: 100, transform: 'skewX(-18)' }, lampejo);
    svg('path', { 'class': 're-brilho re-reflexo', 'stroke-width': 3.5, d: 'M84 98 V86 Q84 74 92 70' }, unha);
    svg('path', { fill: 'none', 'class': 're-l', 'stroke-width': 3.5, d: UNHA }, unha);
    // a gota que escorre na demonstração (sai da ponta da unha e desce pelo dedo)
    var gota = svg('g', { 'class': 're-gota', opacity: 0 }, unha);
    svg('path', { 'class': 're-destaque re-l', 'stroke-width': 2.5, d: 'M0 -7 Q4.5 0 4.5 3 A4.5 4.5 0 0 1 -4.5 3 Q-4.5 0 0 -7 Z' }, gota);
    // o brilho de quatro pontas que estala quando a unha fica pronta
    var estrelaLugar = svg('g', { transform: 'translate(113 66)' }, unha);
    svg('path', { 'class': 're-estrela', d: 'M0 -10 Q1.6 -1.6 10 0 Q1.6 1.6 0 10 Q-1.6 1.6 -10 0 Q-1.6 -1.6 0 -10 Z' }, estrelaLugar);
    // pincel em repouso: atrás do vidro (só a tampa aparece); pego: acima de tudo
    var garrafa = svg('g', { 'class': 're-garrafa' }, s);
    var camadaAtras = svg('g', null, garrafa);
    var frasco = svg('g', null, garrafa);
    svg('rect', { 'class': 're-sombra', x: 150, y: 128, width: 40, height: 56, rx: 12, transform: 'translate(3 3)' }, frasco);
    svg('rect', { 'class': 're-papel re-l', x: 150, y: 128, width: 40, height: 56, rx: 12 }, frasco);
    svg('rect', { 'class': 're-destaque', x: 155, y: 144, width: 30, height: 35, rx: 8 }, frasco);
    svg('path', { 'class': 're-brilho', d: 'M159 136 V144' }, frasco);
    svg('rect', { 'class': 're-gargalo re-l', 'stroke-width': 3, x: 162, y: 122, width: 16, height: 8, rx: 2 }, frasco);
    var camadaFrente = svg('g', null, s);
    var pincel = desenharPincel(camadaAtras);

    var dica = no('p', 'ritual-dica');
    dica.textContent = C.texto('heroiDica', 'Pinte a unha.');
    var med = no('div', 'ritual-medidor');
    med.setAttribute('role', 'progressbar');
    med.setAttribute('aria-label', 'Unha pintada');
    med.setAttribute('aria-valuemin', '0'); med.setAttribute('aria-valuemax', '100'); med.setAttribute('aria-valuenow', '0');
    var pronto = no('p', 'ritual-pronto');
    pronto.setAttribute('aria-live', 'polite');
    var ins = no('p', 'so-leitor');
    ins.id = 'esmalte-instrucao';
    ins.textContent = C.texto('instrucaoTeclado', 'Use as setas ou a barra de espaço para pintar.');
    [dica, med, pronto, ins].forEach(function (n) { palco.appendChild(n); });
    el.insertBefore(palco, el.firstChild);

    var h = heroi = {
      el: el, palco: palco, svg: s, pinceladas: pinceladas, assentar: assentar, pincel: pincel,
      atras: camadaAtras, frente: camadaFrente, medidor: med, frase: pronto,
      mx: new C.Mola(REPOUSO.x, 320, 0.78), my: new C.Mola(REPOUSO.y, 320, 0.78), mr: new C.Mola(REPOUSO.rot, 200, 0.7),
      cobertas: new Array(AMOSTRAS.length), nCobertas: 0, pintada: false,
      traco: null, pontos: 0, ultimo: null, rodando: false, tAnt: 0, pego: false, desvio: 0,
      teclas: 0, animando: false, ultimoSom: 0,
      mao: mao, garrafa: garrafa, demoTraco: demoTraco, gota: gota,
      cena: null, vez: C.dicaVez(dica), diretor: null
    };

    if (C.reduzido()) estadoFinal();
    posar();

    // ritual vivo: entrada ao carregar e demonstração em loop até o primeiro toque
    h.diretor = C.diretor(palco, {
      pode: function () { return !h.pintada && !h.cena && !h.animando && !h.pego && !(h.arrasto && h.arrasto.ativo()) && h.nCobertas === 0; },
      tocar: function (fim) { rodarCena(demoCena, fim); },
      aoFim: function () { if (h.vez) h.vez.mostrar(); },
      aoParar: function () { if (h.vez) h.vez.esconder(); }
    });
    if (h.pintada) h.diretor.parar();
    else if (!C.reduzido()) {
      mao.setAttribute('opacity', 0); garrafa.setAttribute('opacity', 0);   // só aparecem no primeiro quadro da entrada
      rodarCena(entradaCena, function () { if (h.diretor) h.diretor.iniciar(); });
    }
    palco.addEventListener('pointerdown', primeiroToque, true);
    palco.addEventListener('keydown', primeiroToque, true);

    h.arrasto = C.ponteiro(palco, {
      pode: function () { return !C.reduzido() && !h.pintada && !h.animando; },
      inicio: function (e) {
        h.desvio = e.pointerType === 'touch' ? 26 : 0;   // a ponta fica acima do dedo, à vista
        pegar();
        var p = paraSvg(e);
        h.mx.fixar(p.x); h.my.fixar(p.y);
        h.mr.alvo = -24;
        iniciarTraco(p.x, p.y);
        agendar();
      },
      mover: function (e) {
        var p = paraSvg(e);
        var vx = p.x - h.mx.alvo;
        h.mx.alvo = p.x; h.my.alvo = p.y;
        h.mr.alvo = -24 + lim(vx * 1.4, -12, 12);
        continuarTraco(p.x, p.y);
        agendar();
      },
      fim: function () {
        h.traco = null;
        if (!h.pintada) soltar();
        agendar();
      }
    });

    palco.addEventListener('keydown', function (e) {
      if (e.target !== palco || C.reduzido() || h.pintada || e.altKey || e.ctrlKey || e.metaKey) return;
      var k = e.key;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Spacebar', 'Enter'].indexOf(k) === -1) return;
      e.preventDefault();
      if (e.repeat || h.animando) return;
      pincelarColuna(COLUNAS[h.teclas % COLUNAS.length]);
      h.teclas++;
    });

    C.aoMudarMovimento(function (reduz) { if (reduz) estadoFinal(); });
  }

  /* =====================================================================
     RITUAL VIVO
     A cena escreve a pose do pincel direto nas molas (fixar) a cada quadro: se alguém pega
     no meio, o arrasto começa de onde o pincel está.
     ===================================================================== */
  function primeiroToque() {
    var h = heroi;
    if (!h) return;
    if (h.diretor) h.diretor.parar();
    pararCena();
  }

  function limparCena() {
    var h = heroi;
    h.mao.removeAttribute('transform'); h.mao.removeAttribute('opacity');
    h.garrafa.removeAttribute('transform'); h.garrafa.removeAttribute('opacity');
    h.demoTraco.setAttribute('opacity', 0); h.demoTraco.setAttribute('d', 'M95 62 l0 0');
    h.gota.setAttribute('opacity', 0);
  }

  function rodarCena(fn, fim) {
    var h = heroi;
    pararCena();
    var c = h.cena = {
      ctrl: C.cena(function (T) {
        if (h.cena !== c) return false;
        if (!fn(T, c)) return false;
        posar();
        return true;
      }, function () {
        if (h.cena !== c) return;
        h.cena = null;
        limparCena();
        h.mx.fixar(REPOUSO.x); h.my.fixar(REPOUSO.y); h.mr.fixar(REPOUSO.rot);
        if (h.pincel.parentNode !== h.atras) h.atras.appendChild(h.pincel);
        posar();
        if (fim) fim();
      })
    };
  }
  function pararCena() {
    var h = heroi;
    if (!h || !h.cena) return;
    var c = h.cena;
    h.cena = null;
    c.ctrl.parar();
    limparCena();
    if (!h.pego) soltar();                 // o pincel volta para o vidrinho pela mola, de onde estava
    agendar();
  }

  function garrafaPose(dx, dy, rot, sq, op) {
    var h = heroi;
    h.garrafa.setAttribute('transform', 'translate(' + dx.toFixed(1) + ' ' + dy.toFixed(1) + ') rotate(' + rot.toFixed(1) + ' 170 156)' +
      ' translate(170 184) scale(' + (1 / (1 - sq)).toFixed(3) + ' ' + (1 - sq).toFixed(3) + ') translate(-170 -184)');
    h.garrafa.setAttribute('opacity', op.toFixed(2));
  }
  function bezier(a, b, c, p) { var q = 1 - p; return q * q * a + 2 * q * p * b + p * p * c; }

  /* entrada, EM DOIS: a mão sobe, o vidrinho entra girando no ar e assenta comprimido,
     e o pincel sai da garrafa, sacode e volta (cada um começa antes do outro terminar) */
  function entradaCena(t) {
    var h = heroi, T = C.emDois(t), cv = C.curva, tr = C.trecho;
    if (T > 1500) return false;
    var m = tr(T, 0, 380);
    h.mao.setAttribute('transform', 'translate(0 ' + (34 * (1 - cv.saida(m))).toFixed(1) + ')');
    h.mao.setAttribute('opacity', Math.min(1, m * 2).toFixed(2));
    var g = tr(T, 140, 580), sq = 0;
    if (T >= 580) { var tau = T - 580; sq = 0.2 * Math.exp(-tau / 110) * Math.cos(2 * Math.PI * tau / 200); }
    if (T >= 1240) { var tb = T - 1240; sq += 0.07 * Math.exp(-tb / 80) * Math.cos(2 * Math.PI * tb / 170); }   // o pincel entra e a garrafa sente
    garrafaPose(84 * (1 - g), -64 * (1 - g) - 40 * Math.sin(Math.PI * g), -330 * (1 - cv.saida(g)), sq, tr(T, 140, 230));
    var y = REPOUSO.y, r = 0;
    if (T >= 720 && T < 920) y = REPOUSO.y - 70 * cv.saida(tr(T, 720, 920));
    else if (T >= 920 && T < 1060) { y = REPOUSO.y - 70; r = (Math.floor(T / (1000 / 12)) % 2 ? 9 : -9); }   // sacode: escorre o excesso
    else if (T >= 1060 && T < 1240) y = REPOUSO.y - 70 * (1 - cv.entrada(tr(T, 1060, 1240)));
    h.mx.fixar(REPOUSO.x); h.my.fixar(y); h.mr.fixar(r);
    return true;
  }

  /* demonstração curta: tira o pincel, voa em arco até a cutícula, pinta a faixa do meio,
     uma gota escorre pelo dedo enquanto o pincel volta, e a tinta da demonstração se apaga */
  function demoCena(T) {
    var h = heroi, cv = C.curva, tr = C.trecho;
    if (T > 2150) return false;
    var x = REPOUSO.x, y = REPOUSO.y, r = 0;
    if (T < 260) {
      var a = cv.saida(tr(T, 0, 260));
      x = REPOUSO.x + 2 * a; y = REPOUSO.y - 64 * a; r = -8 * a;
    } else if (T < 680) {
      if (h.pincel.parentNode !== h.frente) h.frente.appendChild(h.pincel);
      var b = cv.meio(tr(T, 260, 680));
      x = bezier(172, 150, 95, b); y = bezier(108, 28, 62, b); r = -8 - 16 * b;
    } else if (T < 1180) {
      var c = cv.meio(tr(T, 680, 1180));
      x = 95 + 1.5 * Math.sin(c * Math.PI * 3); y = 62 + 54 * c; r = -24 + 4 * Math.sin(c * Math.PI * 2);
      h.demoTraco.setAttribute('d', 'M95 62 L' + x.toFixed(1) + ' ' + y.toFixed(1));
      h.demoTraco.setAttribute('opacity', 1);
    } else if (T < 1580) {
      var d = cv.meio(tr(T, 1180, 1580));
      x = bezier(95, 146, 170, d); y = bezier(116, 64, 172, d); r = -24 + 24 * d;
      if (d > 0.82 && h.pincel.parentNode !== h.atras) h.atras.appendChild(h.pincel);   // entra no gargalo por trás do vidro
    }
    h.mx.fixar(x); h.my.fixar(y); h.mr.fixar(r);
    // a gota: nasce na ponta da unha, escorre pelo dedo esticando e some
    if (T >= 1150) {
      var nasce = cv.saida(tr(T, 1150, 1320)), desce = cv.entrada(tr(T, 1320, 1820));
      var gy = 121 + 24 * desce, gs = 0.2 + 0.8 * nasce;
      h.gota.setAttribute('transform', 'translate(95 ' + gy.toFixed(1) + ') scale(' + gs.toFixed(3) + ' ' + (gs * (1 + 0.4 * desce)).toFixed(3) + ')');
      h.gota.setAttribute('opacity', (1 - tr(T, 1800, 2050)).toFixed(2));
    }
    if (T >= 1720) h.demoTraco.setAttribute('opacity', (1 - cv.saida(tr(T, 1720, 2120))).toFixed(2));
    return true;
  }

  function paraSvg(e) {
    var r = heroi.svg.getBoundingClientRect();
    var esc = 200 / Math.max(1, r.width);
    return { x: (e.clientX - r.left) * esc, y: (e.clientY - r.top - heroi.desvio) * esc };
  }

  function pegar() {
    var h = heroi;
    if (h.pego) return;
    h.pego = true;
    h.frente.appendChild(h.pincel);
    h.palco.classList.add('is-pincel-na-mao');
  }
  function soltar() {
    var h = heroi;
    h.pego = false;
    h.mx.alvo = REPOUSO.x; h.my.alvo = REPOUSO.y; h.mr.alvo = REPOUSO.rot;
    h.palco.classList.remove('is-pincel-na-mao');
  }

  function iniciarTraco(x, y) {
    var h = heroi;
    h.traco = svg('path', { 'class': 're-pincelada', d: 'M' + x.toFixed(1) + ' ' + y.toFixed(1) + ' l0.01 0' }, h.pinceladas);
    h.trD = 'M' + x.toFixed(1) + ' ' + y.toFixed(1);
    h.ultimo = { x: x, y: y };
    marcar(x, y, x, y);
  }
  function continuarTraco(x, y) {
    var h = heroi;
    if (!h.traco || h.pintada) return;
    var u = h.ultimo;
    if (Math.abs(x - u.x) + Math.abs(y - u.y) < 1.5) return;
    if (h.pontos > 900) return;                       // limite de nós: a unha já está coberta muito antes
    h.trD += ' L' + x.toFixed(1) + ' ' + y.toFixed(1);
    h.traco.setAttribute('d', h.trD);
    h.pontos++;
    marcar(u.x, u.y, x, y);
    h.ultimo = { x: x, y: y };
    var t = C.agora();
    if (t - h.ultimoSom > 260 && dentroUnha(x, y)) { h.ultimoSom = t; C.vibrar(4); }
  }

  /* marca as amostras a menos de um raio do segmento a-b */
  function marcar(ax, ay, bx, by) {
    var h = heroi, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, mudou = false;
    for (var i = 0; i < AMOSTRAS.length; i++) {
      if (h.cobertas[i]) continue;
      var px = AMOSTRAS[i][0], py = AMOSTRAS[i][1];
      var t = l2 ? lim(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
      var qx = ax + t * dx - px, qy = ay + t * dy - py;
      if (qx * qx + qy * qy <= RAIO_PINCEL * RAIO_PINCEL) { h.cobertas[i] = true; h.nCobertas++; mudou = true; }
    }
    if (mudou) atualizarMedidor();
  }

  function cobertura() { return heroi.nCobertas / Math.max(1, AMOSTRAS.length); }
  function atualizarMedidor() {
    var h = heroi, v = h.pintada ? 1 : lim(cobertura() / COBERTURA_PRONTA, 0, 1);
    h.palco.style.setProperty('--prog', v.toFixed(3));
    h.medidor.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    h.medidor.setAttribute('aria-valuetext', Math.round(v * 100) + '% da unha pintada');
    if (!h.pintada && cobertura() >= COBERTURA_PRONTA) pintar(true);
  }

  /* teclado: uma pincelada inteira da cutícula à ponta, animada */
  function pincelarColuna(x) {
    var h = heroi;
    h.animando = true;
    h.desvio = 0;
    pegar();
    h.mx.fixar(x); h.my.fixar(60); h.mr.fixar(-18);
    iniciarTraco(x, 60);
    var t0 = 0, DUR = 380;
    function passo(t) {
      if (!t0) t0 = t;
      var p = lim((t - t0) / DUR, 0, 1), y = 60 + 58 * (1 - Math.pow(1 - p, 2));
      h.mx.fixar(x); h.my.fixar(y);
      continuarTraco(x, y);
      posar();
      if (p < 1 && !h.pintada) W.requestAnimationFrame(passo);
      else { h.traco = null; h.animando = false; if (!h.pintada) soltar(); agendar(); }
    }
    W.requestAnimationFrame(passo);
  }

  function pintar(comEfeito) {
    var h = heroi;
    if (!h || h.pintada) return;
    if (h.diretor) h.diretor.parar();
    if (h.cena) { var c = h.cena; h.cena = null; c.ctrl.parar(); limparCena(); }
    h.pintada = true;
    h.traco = null;
    if (h.arrasto) h.arrasto.soltar();
    h.palco.style.setProperty('--prog', '1');
    h.medidor.setAttribute('aria-valuenow', '100');
    h.medidor.setAttribute('aria-valuetext', '100% da unha pintada');
    h.frase.textContent = C.texto('heroiPronto', 'Pintada.');
    h.el.classList.add('is-pintada');
    h.palco.classList.add('is-pintada');
    h.palco.setAttribute('aria-disabled', 'true');
    soltar();
    if (comEfeito && !C.reduzido()) {
      C.som('clique'); C.vibrar(14);
      // celebração: o reflexo atravessa a unha e a estrela de brilho estala
      h.palco.classList.remove('is-brilho');
      void h.palco.getBoundingClientRect();
      h.palco.classList.add('is-brilho');
    }
    agendar();
    C.emitir('motor:ritual-pronto', { ritual: 'esmalte' });
  }

  function estadoFinal() {
    var h = heroi;
    if (!h) return;
    h.animando = false;
    if (h.arrasto) h.arrasto.soltar();
    h.mx.fixar(REPOUSO.x); h.my.fixar(REPOUSO.y); h.mr.fixar(REPOUSO.rot);
    h.atras.appendChild(h.pincel);
    h.pego = false;
    pintar(false);
    posar();
  }

  function posar() {
    var h = heroi;
    h.pincel.setAttribute('transform', 'translate(' + h.mx.x.toFixed(2) + ' ' + h.my.x.toFixed(2) + ') rotate(' + h.mr.x.toFixed(2) + ')');
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
    h.mx.passo(dt); h.my.passo(dt); h.mr.passo(dt);
    posar();
    var parado = h.mx.parada(0.2) && h.my.parada(0.2) && h.mr.parada(0.05);
    if (!parado || (h.arrasto && h.arrasto.ativo())) agendar();
    else {
      h.tAnt = 0;
      if (!h.pego && h.pincel.parentNode !== h.atras) h.atras.appendChild(h.pincel);   // voltou para dentro do vidrinho
    }
  }

  /* =====================================================================
     TIRA DE CONFIRMAR: o pincel pinta uma unha comprida da esquerda para a direita
     ===================================================================== */
  var DESENHO_TIRA = {
    nome: 'esmalte',
    classe: 'tira-esmalte',
    montar: function (el) {
      var unha = no('span', 'te-unha', el);
      var tinta = no('span', 'te-tinta', unha);
      no('span', 'te-brilho', tinta);
      var alca = no('span', 'te-pincel', el);
      var s = svg('svg', { viewBox: '-24 -84 48 92', 'aria-hidden': 'true', focusable: 'false' }, alca);
      desenharPincel(s, 're-pincel');
      var dims = { w: 0, h: 0, la: 40 };
      return {
        larguraAlca: function (w, h) { dims.w = w; dims.h = h; dims.la = 40; return dims.la; },
        posar: function (p, v, x, h) {
          var inclina = lim(-v / 40, -14, 14) - 28 + p * 10;
          alca.style.transform = 'translate(' + (x - 15).toFixed(1) + 'px, 0) rotate(' + inclina.toFixed(1) + 'deg)';
          tinta.style.width = Math.max(0, x - 8).toFixed(1) + 'px';
        },
        resetar: function () {}
      };
    }
  };

  W.CREAT_RITUAIS = W.CREAT_RITUAIS || {};
  W.CREAT_RITUAIS.esmalte = {
    nome: 'esmalte',
    montarHeroi: montarHeroi,
    criarTira: function (el, opc) { return C.tira(el, { rotulo: (opc && opc.rotulo) || C.texto('ritualDica', 'Passe o pincel na unha para enviar') }, DESENHO_TIRA); },
    resetarTira: C.resetarTira,
    pintar: function () { if (heroi) pintar(true); }
  };
})();
