/* Sede viva: o canteiro no celular (Orbita, 11/11). Script classico: ao carregar so define window.CreatSedeViva.
   Um relogio so: todas as animacoes do ciclo de 16 s nascem juntas (Web Animations, so transform e opacity) e
   pausar, continuar e pular de passo e mexer no currentTime de todas. Um rAF so le o tempo (passo, sons, foco).
   Nenhum texto proprio: tudo o que aparece escrito vem de opc.textos e de negocios.json. */
(function (w) {
  'use strict';
  if (w.CreatSedeViva) return;
  var CICLO = 16000, NS = 'http://www.w3.org/2000/svg';
  var PASSOS = [[0, 'nimbus', 0, 1200, 0], [1, 'nimbus', 1200, 2600, 0], [2, 'verbo', 2600, 4600, 1], [3, 'paleta', 4600, 6400, 2],
    [4, 'pixel', 6400, 8600, 3], [5, 'lupa', 8600, 10400, 4], [6, 'muralha', 10400, 11800, 5], [7, 'trilho', 11800, 13600, 6],
    [8, 'todos', 13600, 16000, 7]].map(function (p) { return Object.freeze({ passo: p[0], agente: p[1], de: p[2], ate: p[3], item: p[4] }); });
  Object.freeze(PASSOS);
  var AGENTES = ['nimbus', 'verbo', 'paleta', 'pixel', 'lupa', 'muralha', 'trilho'];
  var E_OUT = 'cubic-bezier(.2,.8,.3,1)', E_IN = 'cubic-bezier(.55,0,.8,.3)', E_IO = 'cubic-bezier(.65,0,.35,1)',
    MOLA = 'cubic-bezier(.2,.9,.3,1.3)', LIN = 'linear', DEG = 'step-end';
  var POSE = { parado: 0, gesto: 1, comemora: 2 };
  var CASA = { nimbus: [58, 306, 1], lupa: [88, 296, 1], paleta: [262, 306, -1], pixel: [288, 294, -1], muralha: [314, 308, -1], trilho: [338, 296, -1] };
  var PEQ = 0.62, TX = 121, TY = 70, ESC = [30, 176];

  function el(tag, cls, pai) { var e = document.createElement(tag); if (cls) e.className = cls; if (pai) pai.appendChild(e); return e; }
  function uso(id, cls, pai, x, y, wd, ht, cor) {
    var s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'sv-svg' + (cls ? ' ' + cls : ''));
    s.setAttribute('width', wd); s.setAttribute('height', ht); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    s.style.left = x + 'px'; s.style.top = y + 'px'; if (cor) s.style.color = cor;
    var u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#' + id); s.appendChild(u);
    var vb = { 'sv-corda': '0 0 40 26' }[id]; if (vb) { s.setAttribute('viewBox', vb); s.setAttribute('preserveAspectRatio', 'none'); }
    if (pai) pai.appendChild(s); return s;
  }
  function ancora(pai, cls) { return el('div', 'sv-abs' + (cls ? ' ' + cls : ''), pai); }
  function n2(v) { return Math.round(v * 100) / 100; }
  function tf(v) { return 'translate(' + n2(v.x) + 'px,' + n2(v.y) + 'px) rotate(' + n2(v.r) + 'deg) scale(' + n2(v.sx) + ',' + n2(v.sy) + ')'; }

  /* Linha do tempo: chaves [t, props, curva] por elemento; vira keyframes com offset t/CICLO */
  function Linha() { this.p = []; }
  Linha.prototype.add = function (e, t, v, c) {
    if (!e) return; var p = e.__sv; if (!p) { p = e.__sv = { e: e, k: [] }; this.p.push(p); }
    p.k.push({ t: Math.max(0, Math.min(CICLO, t)), v: v, c: c || E_OUT, i: p.k.length });
  };
  Linha.prototype.criar = function (lista) {
    this.p.forEach(function (p) {
      var ks = p.k.sort(function (a, b) { return a.t - b.t || a.i - b.i; }), cur = { x: 0, y: 0, r: 0, sx: 1, sy: 1, o: 1 }, temT = false, temO = false;
      var fr = ks.map(function (k) {
        var v = k.v; for (var q in v) { if (q === 's') { cur.sx = cur.sy = v.s; temT = true; } else { cur[q] = v[q]; if (q === 'o') temO = true; else temT = true; } }
        return { t: k.t, v: { x: cur.x, y: cur.y, r: cur.r, sx: cur.sx, sy: cur.sy, o: cur.o }, c: k.c };
      });
      if (fr[0].t > 0) fr.unshift({ t: 0, v: fr[0].v, c: LIN });
      if (fr[fr.length - 1].t < CICLO) fr.push({ t: CICLO, v: fr[fr.length - 1].v, c: LIN });
      var kf = fr.map(function (f) { var o = { offset: f.t / CICLO, easing: f.c }; if (temT) o.transform = tf(f.v); if (temO) o.opacity = f.v.o; return o; });
      var a = p.e.animate(kf, { duration: CICLO, iterations: Infinity }); a.pause(); lista.push(a); delete p.e.__sv;
    });
  };
  function laco(e, kf, dur, atraso, curva, lista) { var a = e.animate(kf, { duration: dur, iterations: Infinity, delay: -atraso, easing: curva || LIN }); a.pause(); lista.push(a); }

  function montar(palco, opc) {
    opc = opc || {};
    var base = String(opc.raiz || '') + 'assets/sede-viva/', textos = opc.textos || {}, somFn = typeof opc.som === 'function' ? opc.som : null;
    var estatico = !!opc.estatico, morto = false, pronto = false, dados = null, atlas = null, raf = 0, ro = null;
    var neg = { nicho: 'barbearia', marca: '' }, anims = [], mestre = null, sons = [], refs = {}, atores = {};
    var st = { passo: -1, pausado: true, motivo: 'nenhum', ciclo: 0 }, vis = true, foco = null, pendente = false, forcado = false, ultT = 0, balaoAberto = false;
    setNeg(opc.negocio);

    var mundo = el('div', 'sv-mundo'); mundo.setAttribute('aria-hidden', 'true');
    var cam = el('div', 'sv-cam', mundo), fixo = el('div', 'sv-camada', mundo);
    palco.appendChild(mundo);
    function escalar() {
      var wd = palco.clientWidth || 360, ht = palco.clientHeight || wd, k = Math.min(wd, ht) / 360;
      mundo.style.transform = 'translate(' + n2((wd - 360 * k) / 2) + 'px,' + n2((ht - 360 * k) / 2) + 'px) scale(' + n2(k * 1000) / 1000 + ')';
    }
    escalar(); if (w.ResizeObserver) { ro = new ResizeObserver(escalar); ro.observe(palco); }

    function evento(nome, d) { if (!morto) palco.dispatchEvent(new CustomEvent('sedeviva:' + nome, { detail: d || {}, bubbles: false })); }
    function falhar(motivo) { if (morto || pronto) return; evento('erro', { motivo: motivo }); destruir(); }
    var relogio8 = setTimeout(function () { falhar('tempo'); }, 8000);
    function busca(u, tipo) { return fetch(base + u, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error(u); return r[tipo](); }); }
    function imagem(src) { var i = new Image(); i.decoding = 'async'; i.src = src; return i.decode().then(function () { return i; }); }
    function setNeg(n) {
      if (!n) return; var k = String(n.nicho || ''); if (!/^(barbearia|salao|academia)$/.test(k)) k = 'barbearia';
      neg = { nicho: k, marca: String(n.marca == null ? '' : n.marca).replace(/\s+/g, ' ').trim().slice(0, 40) };
    }
    function negDados() { var d = dados && dados.negocios && dados.negocios[neg.nicho]; return d || null; }
    function fotos() { var d = negDados(); return d ? Promise.all(d.galeria.map(function (g) { return imagem(String(opc.raiz || '') + g.src).catch(function () { return null; }); })) : Promise.resolve([]); }

    var pSvg = busca('cena.svg', 'text').then(function (t) { if (!morto) cenario(t); });
    var pJson = busca('negocios.json', 'json').then(function (j) { dados = j; return fotos(); });
    var pAtlas = imagem(base + 'elenco.webp').then(function (i) { atlas = i; });
    var pFonte = document.fonts && document.fonts.load ? Promise.race([Promise.all([document.fonts.load('12px "Lilita One"'), document.fonts.load('800 8px Figtree')]), new Promise(function (r) { setTimeout(r, 1500); })]).catch(function () {}) : Promise.resolve();
    Promise.all([pSvg, pJson, pAtlas, pFonte]).then(function () {
      if (morto) return; clearTimeout(relogio8);
      elenco(); preencher(); construir(estatico ? 15000 : 0); pronto = true;
      evento('pronta'); marcarPasso(estatico ? 8 : 0, true);
      if (!estatico) { if (vis && !document.hidden) tocar('nenhum'); else parar(document.hidden ? 'aba' : 'fora'); }
    }).catch(function (e) { falhar(String(e && e.message || 'carga').slice(0, 40)); });

    /* cenario: aparece assim que o SVG chega (celular, porta baixada, plaquinha FECHADO) */
    function cenario(txt) {
      var doc = new DOMParser().parseFromString(txt, 'image/svg+xml'), raiz = doc.documentElement;
      if (!raiz || raiz.nodeName !== 'svg') throw new Error('svg');
      Array.prototype.slice.call(raiz.querySelectorAll('script,foreignObject')).forEach(function (n) { n.parentNode.removeChild(n); });
      Array.prototype.slice.call(raiz.querySelectorAll('*')).forEach(function (n) { Array.prototype.slice.call(n.attributes).forEach(function (a) { if (/^on/i.test(a.name)) n.removeAttribute(a.name); }); });
      var sp = el('div', 'sv-sprite', mundo); sp.appendChild(document.importNode(raiz, true));
      refs.nuvem1 = ancora(cam); uso('sv-nuvem', 'sv-nuvem', refs.nuvem1, 0, 0, 78, 35); refs.nuvem1.style.transform = 'translate(14px,92px)';
      refs.nuvem2 = ancora(cam); uso('sv-nuvem', 'sv-nuvem', refs.nuvem2, 0, 0, 62, 28); refs.nuvem2.style.transform = 'translate(296px,186px)';
      uso('sv-ilha', 'sv-ilha', cam, -30, 262, 420, 101);
      uso('sv-sombra', '', cam, 104, 290, 156, 18);
      var cel = refs.cel = el('div', 'sv-cel', cam); cel.style.zIndex = 100;
      uso('sv-celular', 'sv-cel-corpo', cel, 113, 51, 140, 248);
      var tela = refs.tela = el('div', 'sv-tela', cel);
      refs.site = el('div', 'sv-abs', tela); refs.site.style.width = '118px'; refs.site.style.height = '212px';
      refs.borda = el('div', 'sv-borda', tela); refs.cheia = el('div', 'sv-borda-cheia', tela);
      refs.borda.style.opacity = 0; refs.cheia.style.opacity = 0;
      refs.porta = el('div', 'sv-porta', tela); uso('sv-porta', '', refs.porta, 0, 0, 118, 212);
      refs.rolo = el('div', 'sv-rolo', cel); uso('sv-rolo', '', refs.rolo, 0, 0, 124, 14);
      uso('sv-gancho', '', cam, 238, 72, 64, 16).style.zIndex = 110;
      var pend = ancora(cam, 'sv-plaq'); pend.style.left = '280px'; pend.style.top = '84px'; pend.style.zIndex = 120; refs.pend = pend;
      refs.impulso = ancora(pend); uso('sv-corda', '', refs.impulso, -20, 0, 40, 38); refs.virar = ancora(refs.impulso);
      refs.fechado = el('div', 'sv-plaq-face sv-plaq-fechado', refs.virar); uso('sv-plaquinha', '', refs.fechado, 0, 0, 72, 40);
      el('span', '', refs.fechado).textContent = textos.fechado || '';
      refs.aberto = el('div', 'sv-plaq-face sv-plaq-aberto', refs.virar); uso('sv-plaquinha', '', refs.aberto, 0, 0, 72, 40);
      el('span', '', refs.aberto).textContent = textos.aberto || ''; refs.aberto.style.opacity = 0;
      refs.fechado.style.top = refs.aberto.style.top = '34px';
      var fita = refs.fita = el('div', 'sv-fita', fixo);
      refs.fitas = PASSOS.map(function (p) {
        var f = el('div', 'sv-fita-papel' + (p.passo === 8 ? ' sv-fita-fim' : ''), fita); f.textContent = (textos.legendas || [])[p.passo] || '';
        f.style.opacity = p.passo === 0 ? 1 : 0; if (!f.textContent) f.style.display = 'none'; return f;
      });
      refs.balao = el('div', 'sv-balao', fixo); refs.balaoNome = el('b', '', refs.balao); refs.balaoTxt = el('span', '', refs.balao);
    }

    /* elenco: 7 atores com 3 poses do atlas; a escada do Verbo; objetos de cena */
    function ator(nome, pai, z) {
      var i = AGENTES.indexOf(nome), a = { nome: nome };
      a.ator = el('div', 'sv-ator', pai); a.ator.style.zIndex = z;
      a.sombra = ancora(a.ator); uso('sv-sombra', 'sv-ator-sombra', a.sombra, -26, -6, 52, 12);
      a.pula = el('div', 'sv-pula', a.ator); a.vira = el('div', 'sv-vira', a.pula);
      a.corpo = el('div', 'sv-corpo', a.vira); a.corpo.setAttribute('data-sv-agente', nome);
      a.quadros = el('div', 'sv-quadros', a.corpo);
      a.quadros.style.backgroundImage = 'url("' + base.replace(/["\\\n\r]/g, '') + 'elenco.webp")';
      a.quadros.style.backgroundPosition = (-80 * i) + 'px 0';
      atores[nome] = a; return a;
    }
    function elenco() {
      ['lupa', 'pixel', 'trilho', 'nimbus', 'paleta', 'muralha'].forEach(function (n) {
        var c = CASA[n], a = ator(n, cam, c[1]); a.vira.style.transform = 'scaleX(' + c[2] + ')';
      });
      var g = refs.escada = el('div', 'sv-abs', cam); g.style.zIndex = 290;
      uso('sv-escada', '', g, -22, -18, 44, 132);
      ator('verbo', g, 1);
      refs.lapis = ancora(g); refs.lapis.style.zIndex = 5; uso('sv-lapis', '', refs.lapis, -62, -8, 64, 16);
      var n = atores.nimbus;
      refs.mao = ancora(n.vira); var cm = ancora(refs.mao); cm.style.transform = 'scale(.68)'; refs.maoTxt = comanda(cm);
      refs.vara = ancora(n.vira); uso('sv-vara', '', refs.vara, 0, -10, 84, 16);
      refs.balde = ancora(atores.paleta.vira); refs.baldeSvg = uso('sv-balde', '', refs.balde, -17, -30, 34, 34);
      refs.cx = ancora(cam); refs.cx.style.zIndex = 420; refs.cy = ancora(refs.cx); refs.comTxt = comanda(refs.cy);
      refs.carimbo = el('span', 'sv-carimbo', refs.cy.firstChild); refs.carimbo.textContent = textos.carimbo || '';
      refs.carimbo.style.transformOrigin = '50% 50%';
      var topo = 430;
      refs.gx = ancora(cam); refs.gx.style.zIndex = topo; refs.gy = ancora(refs.gx); refs.gotaSvg = uso('sv-gota', '', refs.gy, -8, -8, 16, 16);
      refs.respingo = ancora(cam); refs.respingo.style.zIndex = topo; refs.respingoSvg = uso('sv-mancha', '', refs.respingo, -36, -36, 72, 72);
      refs.blocos = [0, 1, 2].map(function () { var x = ancora(cam), y = ancora(x); x.style.zIndex = topo; return { x: x, y: y, svg: uso('sv-bloco', '', y, -15, -13, 32, 28) }; });
      refs.lupa = ancora(cam); refs.lupa.style.zIndex = topo; uso('sv-lupa', '', refs.lupa, -41, -33, 80, 96);
      refs.dedo = ancora(cam); refs.dedo.style.zIndex = topo; uso('sv-dedo', '', refs.dedo, -12, -2, 34, 52);
      refs.kx = ancora(cam); refs.kx.style.zIndex = topo; refs.ky = ancora(refs.kx);
      refs.kAberto = ancora(refs.ky); uso('sv-cadeado-aberto', '', refs.kAberto, -20, -28, 40, 52);
      refs.kFechado = ancora(refs.ky); uso('sv-cadeado-fechado', '', refs.kFechado, -20, -28, 40, 52);
    }
    function comanda(pai) {
      var c = el('div', 'sv-comanda', pai); uso('sv-comanda', '', c, 0, 0, 96, 58);
      var t = [el('p', 'sv-c1', c), el('p', 'sv-c2', c), el('p', 'sv-c3', c)]; return t;
    }

    /* o mini site do negocio: tudo por textContent, com as cores do tenant.json */
    function preencher() {
      var d = negDados(); if (!d) return;
      var marca = neg.marca || d.marca, cor = d.cores, site = refs.site, com = textos.comanda || [];
      [refs.comTxt, refs.maoTxt].forEach(function (t) { t[0].textContent = com[0] || ''; t[1].textContent = marca; t[2].textContent = com[1] || ''; });
      refs.baldeSvg.style.color = cor.destaque; refs.gotaSvg.style.color = cor.destaque; refs.respingoSvg.style.color = cor.destaque;
      refs.blocos.forEach(function (b) { b.svg.style.color = cor.destaque; });
      while (site.firstChild) site.removeChild(site.firstChild);
      var m = refs.mancha = el('div', 'sv-s-mancha', site); m.style.background = cor.fundo;
      var barra = el('div', 'sv-s-barra', site), url = el('div', 'sv-s-url', barra);
      [[14, 40], [58, 18], [80, 22]].forEach(function (p) { var i = el('i', '', url); i.style.left = p[0] + 'px'; i.style.width = p[1] + 'px'; });
      refs.cad = ancora(barra); refs.cad.style.left = '9px'; refs.cad.style.top = '6px'; uso('sv-cadeado-mini', '', refs.cad, -3.5, -4, 7, 8);
      var topo = refs.topo = el('div', 'sv-s-topo', site);
      var tc = el('b', '', topo); tc.style.background = '#5E5974'; tc.textContent = marca;
      refs.topoCor = el('b', '', topo); refs.topoCor.style.background = cor.destaque; refs.topoCor.textContent = marca;
      var corpo = refs.corpo = el('div', 'sv-s-corpo', site); corpo.style.color = cor.texto;
      var tit = refs.titulo = el('div', 'sv-s-titulo', corpo); tit.style.color = '#1E1B2E';
      refs.palavras = d.titulo.split(' ').map(function (p, i, a) { var s = el('span', '', tit); s.textContent = p + (i < a.length - 1 ? ' ' : ''); return s; });
      refs.titCor = el('div', 'sv-s-titulo sv-s-titulo-cor', tit); refs.titCor.style.color = cor.destaque; refs.titCor.textContent = d.titulo;
      var serv = el('div', 'sv-s-serv', corpo);
      refs.serv = d.servicos.map(function (s) { var l = el('div', 'sv-s-linha', serv); el('span', '', l).textContent = s.nome; var b = el('b', '', l); b.textContent = s.preco; b.style.color = cor.destaque; return l; });
      var gal = el('div', 'sv-s-gal', corpo);
      refs.fotos = d.galeria.map(function (g) { var f = el('div', 'sv-s-foto', gal), im = el('img', '', f); im.alt = ''; im.width = 49; im.height = 57; im.decoding = 'async'; im.src = String(opc.raiz || '') + g.src; return f; });
      var bt = refs.botao = el('div', 'sv-s-botao', corpo), btx = el('span', '', bt); btx.textContent = d.botao;
      if (btx.offsetWidth > bt.clientWidth - 8) bt.classList.add('sv-s-botao-2');
      var selo = refs.selo = el('div', 'sv-s-selo', corpo); selo.textContent = textos.seloTeste || '';
      // medidas (uma leitura de layout por montagem): posicoes locais da tela
      function caixa(e) { var x = 0, y = 0, p = e; while (p && p !== site) { x += p.offsetLeft; y += p.offsetTop; p = p.offsetParent; } return { x: x, y: y, w: e.offsetWidth, h: e.offsetHeight }; }
      var linhas = [];
      refs.palavras.forEach(function (s) {
        var b = caixa(s), l = linhas[linhas.length - 1], n = s.textContent.replace(/\s+$/, '').length;
        if (!l || Math.abs(l.y - b.y) > 3) linhas.push({ x: b.x, y: b.y, r: b.x + b.w, n: n + 1 }); else { l.r = b.x + b.w; l.n += n + 1; }
      });
      refs.linhas = linhas.map(function (l) {
        var t = el('div', 'sv-s-tampa', site); t.style.left = (l.x - 1) + 'px'; t.style.top = (l.y - 1) + 'px'; t.style.width = (l.r - l.x + 4) + 'px'; l.tampa = t; return l;
      });
      refs.cxServ = refs.serv.map(caixa); refs.cxFotos = refs.fotos.map(caixa); refs.cxBotao = caixa(bt);
      var cxT = caixa(tit), cxS = caixa(serv), cxG = caixa(gal);
      refs.esq = [cxT, cxS, cxG, refs.cxBotao].map(function (b) {
        var e = el('div', 'sv-s-esq', site); e.style.left = b.x + 'px'; e.style.top = b.y + 'px'; e.style.width = b.w + 'px'; e.style.height = Math.max(b.h, 10) + 'px'; return e;
      });
      var v = refs.visto = ancora(site); uso('sv-visto', 'sv-s-visto', v, -10, -10, 20, 20);
      v.style.left = (refs.cxBotao.x + refs.cxBotao.w - 5) + 'px'; v.style.top = (refs.cxBotao.y - 5) + 'px';
      [refs.serv, refs.fotos].forEach(function (g) { g.forEach(function (e) { e.style.transformOrigin = '50% 50%'; }); });
      bt.style.transformOrigin = selo.style.transformOrigin = '50% 50%';
    }

    /* a coreografia de um ciclo */
    function construir(T) {
      anims.forEach(function (a) { a.cancel(); }); anims = []; sons = [];
      var L = new Linha(), A = atores, d = negDados();
      function pose(a, t, n) { L.add(a.quadros, t, { y: -96 * POSE[n] }, DEG); }
      function pulo(a, t0, dur, h, ant) {
        ant = ant == null ? 70 : ant;
        L.add(a.pula, t0 - ant, { y: 0, sx: 1, sy: 1 }, E_OUT); L.add(a.pula, t0, { y: 0, sx: 1.14, sy: 0.86 }, E_OUT);
        L.add(a.pula, t0 + 45, { y: -h * 0.22, sx: 0.9, sy: 1.12 }, E_OUT); L.add(a.pula, t0 + dur / 2, { y: -h, sx: 1, sy: 1 }, E_IN);
        L.add(a.pula, t0 + dur, { y: 0, sx: 1.16, sy: 0.85 }, E_OUT); L.add(a.pula, t0 + dur + 100, { y: 0, sx: 1, sy: 1 }, E_OUT);
        L.add(a.sombra, t0, { s: 1 }, E_OUT); L.add(a.sombra, t0 + dur / 2, { s: 0.5 }, E_IN); L.add(a.sombra, t0 + dur, { s: 1 }, E_OUT);
      }
      function andar(a, t0, de, para, n, dur, gap, h) {
        for (var i = 0; i < n; i++) {
          var ti = t0 + i * gap, f0 = i / n, f1 = (i + 1) / n;
          L.add(a.ator, ti, { x: de[0] + (para[0] - de[0]) * f0, y: de[1] + (para[1] - de[1]) * f0, s: de[2] + (para[2] - de[2]) * f0 }, LIN);
          L.add(a.ator, ti + dur, { x: de[0] + (para[0] - de[0]) * f1, y: de[1] + (para[1] - de[1]) * f1, s: de[2] + (para[2] - de[2]) * f1 }, E_OUT);
          pulo(a, ti, dur, h || 16, i ? 40 : 70);
        }
      }
      function casa(n) { var c = CASA[n]; return [c[0], c[1], PEQ]; }
      function some(e, t1, t2, extra) { L.add(e, t1, Object.assign({ o: 0 }, extra || {}), DEG); L.add(e, t2, { o: 0 }); }
      function cam_(t, s, fx, fy, ax, ay) { L.add(cam, t, { x: ax - fx * s, y: ay - fy * s, s: s }, E_IO); }
      function som(t, n) { sons.push([t, n]); }
      var RESET = 15950;
      function reinicia(e, de, para) { L.add(e, RESET, de, DEG); L.add(e, RESET + 1, para, DEG); }

      // poses de base e respiracao (em dois: 12 desenhos por segundo)
      AGENTES.forEach(function (n, i) {
        var a = A[n]; pose(a, 0, n === 'nimbus' ? 'gesto' : 'parado');
        if (n !== 'verbo') L.add(a.ator, 0, n === 'nimbus' ? { x: -50, y: 306, s: 1 } : { x: CASA[n][0], y: CASA[n][1], s: PEQ });
        L.add(a.pula, 0, { y: 0, sx: 1, sy: 1, r: 0 }); L.add(a.sombra, 0, { s: 1 });
        laco(a.corpo, [{ transform: 'scale(1,1)' }, { transform: 'scale(1.02,1.035)' }, { transform: 'scale(1,1)' }], 2000, i * 270, 'steps(24,end)', anims);
      });
      laco(refs.nuvem1, [{ transform: 'translate(14px,92px)' }, { transform: 'translate(30px,90px)' }, { transform: 'translate(14px,92px)' }], 16000, 0, LIN, anims);
      laco(refs.nuvem2, [{ transform: 'translate(296px,186px)' }, { transform: 'translate(282px,188px)' }, { transform: 'translate(296px,186px)' }], 8000, 0, LIN, anims);
      laco(refs.pend, [{ transform: 'rotate(-3deg)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(-3deg)' }], 2400, 0, E_IO, anims);

      // camera
      cam_(0, 1, 0, 0, 0, 0); cam_(1200, 1, 0, 0, 0, 0); cam_(1550, 1.06, 150, 200, 150, 200); cam_(2600, 1.06, 150, 200, 150, 200);
      cam_(2950, 1.42, 176, 128, 180, 170); cam_(4500, 1.42, 176, 128, 180, 170); cam_(4900, 1.22, 215, 190, 180, 175);
      cam_(6300, 1.22, 215, 190, 180, 175); cam_(6700, 1.2, 215, 200, 180, 180); cam_(8500, 1.2, 215, 200, 180, 180);
      cam_(8850, 1.22, 150, 215, 180, 180); cam_(10300, 1.22, 150, 215, 180, 180); cam_(10650, 1.16, 220, 190, 180, 175);
      cam_(11800, 1.16, 220, 190, 180, 175); cam_(12250, 1, 0, 0, 0, 0);
      // fita: um empurraozinho a cada passo; no fim vira sol
      PASSOS.forEach(function (p) { if (p.de) { L.add(refs.fita, p.de - 1, { s: 1 }, E_OUT); L.add(refs.fita, p.de + 40, { s: 0.92 }, MOLA); L.add(refs.fita, p.de + 220, { s: 1 }); } });
      L.add(refs.fita, 0, { s: 1 });
      PASSOS.forEach(function (p, i) { var f = refs.fitas[i]; L.add(f, 0, { o: p.de ? 0 : 1 }, DEG); if (p.de) L.add(f, p.de, { o: 1 }, DEG); if (p.ate < CICLO) L.add(f, p.ate, { o: 0 }, DEG); });

      // passo 0 e 1 - Nimbus chega com a comanda, prende no celular e levanta a porta de aco
      var N = A.nimbus;
      L.add(N.vira, 0, { sx: 1 }, DEG);
      andar(N, 60, [-50, 306, 1], [92, 306, 1], 3, 240, 300, 18);
      pose(N, 1120, 'comemora'); pose(N, 1420, 'gesto'); pose(N, 1990, 'comemora'); pose(N, 2260, 'parado');
      L.add(N.pula, 1080, { sx: 1, sy: 1 }); L.add(N.pula, 1160, { sx: 1.1, sy: 0.9 }); L.add(N.pula, 1260, { sx: 0.94, sy: 1.08 }); L.add(N.pula, 1400, { sx: 1, sy: 1 });
      L.add(refs.mao, 0, { x: 16, y: -40, r: -6, o: 1 }); L.add(refs.mao, 1120, { x: 16, y: -40, r: -6 }, MOLA); L.add(refs.mao, 1250, { x: 2, y: -64, r: 2 });
      L.add(refs.mao, 1300, { o: 1 }, DEG); L.add(refs.mao, 1301, { o: 0 }, DEG); L.add(refs.mao, 15960, { o: 0 }, DEG); L.add(refs.mao, 15961, { x: 16, y: -40, r: -6, o: 1 }, DEG);
      L.add(refs.cx, 0, { x: 92 }); L.add(refs.cx, 1300, { x: 92 }, LIN); L.add(refs.cx, 1600, { x: 180 }); L.add(refs.cx, 15960, { x: 180 }, DEG); L.add(refs.cx, 15961, { x: 92 });
      L.add(refs.cy, 0, { y: 244, s: 0.68, r: 0, o: 0 }, DEG); L.add(refs.cy, 1300, { y: 244, s: 0.68, r: 2, o: 1 }, E_OUT);
      L.add(refs.cy, 1450, { y: 6, s: 0.92, r: -10 }, E_IN); L.add(refs.cy, 1600, { y: 36, sx: 1.16, sy: 0.84, r: -3 }, E_OUT); L.add(refs.cy, 1720, { s: 1 });
      L.add(refs.cy, 15400, { y: 36, r: -3, o: 1 }, E_IN); L.add(refs.cy, 15720, { y: 112, r: 26, o: 0 }, DEG); L.add(refs.cy, 15960, { y: 244, s: 0.68, r: 0, o: 0 });
      som(1600, 'clique');
      L.add(refs.vara, 0, { x: 20, y: -28, o: 0, r: -25, s: 0.6 }, DEG); L.add(refs.vara, 1440, { o: 1, r: -25, s: 0.7 }, MOLA); L.add(refs.vara, 1600, { r: 0, s: 1 });
      L.add(refs.vara, 1650, { r: 0 }, E_IO); L.add(refs.vara, 1800, { r: -4 }, E_OUT); L.add(refs.vara, 1920, { r: -30 }, DEG); L.add(refs.vara, 2060, { o: 0, s: 0.6 });
      L.add(refs.porta, 0, { y: 0 }); L.add(refs.porta, 1650, { y: 0 }, E_IO); L.add(refs.porta, 1800, { y: -10 }, E_IN); L.add(refs.porta, 2050, { y: -214 });
      L.add(refs.porta, 15500, { y: -214 }, E_IN); L.add(refs.porta, 15880, { y: 0 });
      [2050, 15880].forEach(function (t) { L.add(refs.rolo, t, { s: 1 }, E_OUT); L.add(refs.rolo, t + 30, { sx: 1.05, sy: 1.35 }, MOLA); L.add(refs.rolo, t + 220, { s: 1 }); som(t, 'clique'); });
      L.add(refs.topo, 0, { y: -16, o: 0 }); L.add(refs.topo, 2050, { y: -16, o: 0 }, MOLA); L.add(refs.topo, 2260, { y: 0, o: 1 }); reinicia(refs.topo, { y: 0, o: 1 }, { y: -16, o: 0 });
      refs.esq.forEach(function (e, i) { L.add(e, 0, { o: 0 }); L.add(e, 2080 + i * 60, { o: 0 }); L.add(e, 2260 + i * 60, { o: 1 }); });
      L.add(refs.borda, 0, { o: 0 }); L.add(refs.borda, 2050, { o: 0 }); L.add(refs.borda, 2250, { o: 1 }); L.add(refs.borda, 12650, { o: 1 }); L.add(refs.borda, 12800, { o: 0 });
      L.add(refs.cheia, 0, { o: 0 }); L.add(refs.cheia, 12650, { o: 0 }); L.add(refs.cheia, 12800, { o: 1 }); reinicia(refs.cheia, { o: 1 }, { o: 0 });
      andar(N, 2300, [92, 306, 1], casa('nimbus'), 1, 260, 300, 20);
      L.add(N.vira, 15280, { sx: 1 }, DEG); L.add(N.vira, 15300, { sx: -1 }, DEG);
      andar(N, 15330, casa('nimbus'), [-50, 306, PEQ], 2, 240, 290, 16);
      L.add(N.ator, 15900, { x: -50, y: 306, s: PEQ }, DEG); L.add(N.ator, 15901, { x: -50, y: 306, s: 1 }); L.add(N.vira, 15900, { sx: 1 }, DEG); pose(N, 15900, 'gesto');

      // passo 2 - Verbo, na escada de rodinhas, escreve o titulo letra a letra e os servicos
      var V = A.verbo, E = refs.escada, Lp = refs.lapis, ls = refs.linhas, nTot = 0;
      ls.forEach(function (l) { nTot += l.n; });
      var por = Math.min(45, (1330 - 70 * (ls.length - 1)) / Math.max(1, nTot)), t = 2850;
      L.add(E, 0, { x: ESC[0], y: ESC[1] }); L.add(E, 2600, { x: ESC[0], y: ESC[1] }, E_OUT);
      L.add(V.ator, 0, { s: PEQ }); L.add(V.ator, 2600, { s: PEQ }, MOLA); L.add(V.ator, 2800, { s: 1 }); L.add(V.ator, 4500, { s: 1 }, E_IO); L.add(V.ator, 4760, { s: PEQ });
      L.add(V.pula, 2600, { r: 0 }, E_IO); L.add(V.pula, 2720, { r: -8 }, E_OUT); L.add(V.pula, 2860, { r: 7 }, E_OUT); L.add(V.pula, 3000, { r: 0 });
      pose(V, 2650, 'gesto'); pose(V, 4500, 'comemora'); pose(V, 4700, 'parado');
      L.add(Lp, 0, { o: 0, s: 0.4 }); L.add(Lp, 2650, { o: 0, s: 0.4 }, MOLA);
      L.add(V.vira, 0, { sx: 1 }, DEG); L.add(V.vira, 2700, { sx: -1 }, DEG);
      ls.forEach(function (l, j) {
        var x0 = TX + l.x, x1 = TX + l.r, ty = TY + l.y + 11 - ESC[1], fi = Math.atan2(ty + 26, -26) * 180 / Math.PI, dur = l.n * por;
        if (j === 0) { L.add(E, t, { x: x0 + 46 }, LIN); L.add(Lp, t - 60, { x: -46, y: ty, r: fi, o: 1, s: 1 }, LIN); }
        else { L.add(E, t, { x: x0 + 46 }, LIN); L.add(Lp, t, { x: -46, y: ty, r: fi }, LIN); }
        for (var q = 1; q <= l.n; q++) { var tq = t + q * por; L.add(E, tq, { x: x0 + 46 + (x1 - x0) * q / l.n }, LIN); if (q % 2) { L.add(Lp, tq, { r: fi + (q % 4 === 1 ? 4 : -3) }, LIN); som(tq, 'giz'); } }
        L.add(l.tampa, 0, { x: 0, o: 1 }); L.add(l.tampa, t, { x: 0 }, LIN); L.add(l.tampa, t + dur, { x: x1 - x0 + 4 });
        L.add(l.tampa, 4300, { o: 1 }, DEG); L.add(l.tampa, 4301, { o: 0 }); reinicia(l.tampa, { x: x1 - x0 + 4, o: 0 }, { x: 0, o: 1 });
        t += dur; L.add(E, t, { x: x1 + 46 }, E_IO); L.add(Lp, t, { r: fi }, E_IO); t += 70;
      });
      L.add(refs.esq[0], 2850, { o: 1 }); L.add(refs.esq[0], 3000, { o: 0 }); reinicia(refs.esq[0], { o: 0 }, { o: 0 });
      var tS = Math.max(t, 4180);
      refs.cxServ.forEach(function (b, j) {
        var t0 = tS + j * 160, ty = TY + b.y + 9 - ESC[1], fi = Math.atan2(ty + 26, -26) * 180 / Math.PI;
        L.add(E, t0, { x: TX + b.x + 46 }, E_IO); L.add(Lp, t0, { y: ty, r: fi }, E_IO); L.add(E, t0 + 140, { x: TX + b.x + b.w + 46 }, LIN);
        var e = refs.serv[j]; L.add(e, 0, { o: 0, x: -4 }); L.add(e, t0 + 20, { o: 0, x: -4 }, E_OUT); L.add(e, t0 + 160, { o: 1, x: 0 }); reinicia(e, { o: 1, x: 0 }, { o: 0, x: -4 });
        som(t0 + 40, 'giz'); som(t0 + 120, 'giz');
      });
      L.add(refs.esq[1], tS, { o: 1 }); L.add(refs.esq[1], tS + 120, { o: 0 }); reinicia(refs.esq[1], { o: 0 }, { o: 0 });
      var tV = tS + 330;
      L.add(Lp, tV, { o: 1, s: 1 }, E_IN); L.add(Lp, tV + 80, { o: 0, s: 0.4 });
      L.add(E, tV, {}, E_IO); L.add(E, tV + 260, { x: ESC[0] }); L.add(V.vira, tV + 120, { sx: 1 }, DEG); L.add(V.pula, tV, { r: 0 }, E_OUT); L.add(V.pula, tV + 90, { r: 7 }, E_OUT); L.add(V.pula, tV + 260, { r: -5 }, E_OUT); L.add(V.pula, tV + 380, { r: 0 });

      // passo 3 - Paleta gira o balde e joga a tinta: a mancha se espalha e as cores entram
      var P = A.paleta, PW = [300, 308, 1];
      andar(P, 4610, casa('paleta'), PW, 1, 260, 300, 18); andar(P, 6050, PW, casa('paleta'), 1, 260, 300, 18);
      pose(P, 4650, 'gesto'); pose(P, 5260, 'comemora'); pose(P, 5560, 'gesto'); pose(P, 5900, 'parado');
      L.add(P.pula, 4950, { s: 1, r: 0 }, E_IO); L.add(P.pula, 5200, { sx: 1.1, sy: 0.9, r: 6 }, E_IN); L.add(P.pula, 5280, { sx: 0.9, sy: 1.12, r: -8 }, E_OUT); L.add(P.pula, 5440, { s: 1, r: 0 });
      L.add(refs.balde, 0, { x: 22, y: -26, o: 0, s: 0.5, r: 0 }); L.add(refs.balde, 4660, { o: 0, s: 0.5 }, MOLA); L.add(refs.balde, 4760, { o: 1, s: 1 }); L.add(refs.balde, 4950, { r: 0 }, E_IO);
      L.add(refs.balde, 5200, { r: -45 }, E_IN); L.add(refs.balde, 5280, { r: 75 }, E_OUT); L.add(refs.balde, 5440, { r: 25 }, E_OUT); L.add(refs.balde, 5620, { r: 0, o: 1 }); L.add(refs.balde, 5720, { o: 0, s: 0.5 });
      L.add(refs.gx, 0, { x: 276 }); L.add(refs.gx, 5280, { x: 276 }, LIN); L.add(refs.gx, 5620, { x: 180 });
      L.add(refs.gy, 0, { y: 272, s: 0.8, r: 0, o: 0 }, DEG); L.add(refs.gy, 5280, { y: 272, s: 0.8, r: 0, o: 1 }, E_OUT); L.add(refs.gy, 5450, { y: 140, s: 1.05, r: 200 }, E_IN);
      L.add(refs.gy, 5620, { y: 175, sx: 1.3, sy: 0.75, r: 360, o: 1 }, DEG); L.add(refs.gy, 5621, { o: 0 }, DEG); L.add(refs.gy, 15900, { y: 272, s: 0.8, r: 0, o: 0 });
      L.add(refs.respingo, 0, { x: 180, y: 175, s: 0.2, o: 0 }, DEG); L.add(refs.respingo, 5620, { s: 0.3, o: 1 }, E_OUT); L.add(refs.respingo, 5720, { s: 1.15 }, E_OUT);
      L.add(refs.respingo, 5820, { s: 1 }); L.add(refs.respingo, 5950, { o: 1 }, E_IN); L.add(refs.respingo, 6250, { o: 0, s: 1.05 });
      som(5620, 'clique');
      L.add(refs.mancha, 0, { x: 59, y: 100, s: 0 }); L.add(refs.mancha, 5620, { s: 0 }, E_OUT); L.add(refs.mancha, 6000, { s: 1 }); reinicia(refs.mancha, { s: 1 }, { s: 0 });
      [refs.titCor, refs.topoCor].forEach(function (e) { L.add(e, 0, { o: 0 }); L.add(e, 5680, { o: 0 }, E_IO); L.add(e, 5880, { o: 1 }); reinicia(e, { o: 1 }, { o: 0 }); });

      // passo 4 - Pixel joga os blocos: cada um cai, comprime e vira um pedaco do site
      var X = A.pixel, XW = [298, 308, 1], alvos = [refs.fotos[0], refs.fotos[1], refs.botao], cx = refs.cxFotos.concat([refs.cxBotao]);
      andar(X, 6410, casa('pixel'), XW, 1, 260, 300, 18); andar(X, 8330, XW, casa('pixel'), 1, 260, 300, 18);
      pose(X, 6680, 'gesto'); pose(X, 8320, 'parado');
      alvos.forEach(function (e, i) {
        var T0 = 6900 + i * 500, b = cx[i], sx = TX + b.x + b.w / 2, sy = TY + b.y + b.h / 2, bl = refs.blocos[i];
        pose(X, T0, 'comemora'); pose(X, T0 + 200, 'gesto');
        L.add(X.pula, T0 - 180, { s: 1 }, E_IO); L.add(X.pula, T0 - 30, { sx: 1.12, sy: 0.88 }, E_OUT); L.add(X.pula, T0 + 40, { sx: 0.9, sy: 1.12 }, E_OUT); L.add(X.pula, T0 + 180, { s: 1 });
        L.add(bl.x, 0, { x: 272 }); L.add(bl.x, T0, { x: 272 }, LIN); L.add(bl.x, T0 + 400, { x: sx });
        L.add(bl.y, 0, { y: 262, s: 0.8, r: 0, o: 0 }, DEG); L.add(bl.y, T0, { y: 262, s: 0.8, r: 0, o: 1 }, E_OUT); L.add(bl.y, T0 + 200, { y: Math.min(sy, 262) - 78, s: 1, r: -170 }, E_IN);
        L.add(bl.y, T0 + 400, { y: sy, sx: 1.3, sy: 0.75, r: -360 }, E_OUT); L.add(bl.y, T0 + 460, { s: 1, o: 1 }, DEG); L.add(bl.y, T0 + 461, { o: 0 }, DEG); L.add(bl.y, 15900, { y: 262, s: 0.8, r: 0, o: 0 });
        L.add(e, 0, { o: 0, s: 0.4 }); L.add(e, T0 + 400, { o: 0, s: 0.4 }, DEG); L.add(e, T0 + 401, { o: 1, sx: 1.25, sy: 0.7 }, MOLA); L.add(e, T0 + 580, { s: 1 }); som(T0 + 400, 'clique');
      });
      L.add(refs.esq[2], 7300, { o: 1 }); L.add(refs.esq[2], 7400, { o: 0 }); reinicia(refs.esq[2], { o: 0 }, { o: 0 });
      L.add(refs.esq[3], 8300, { o: 1 }); L.add(refs.esq[3], 8400, { o: 0 }); reinicia(refs.esq[3], { o: 0 }, { o: 0 });

      // passo 5 - Lupa passa a lupa no site e o dedo toca no botao: deu certo
      var U = A.lupa, UW = [80, 306, 1], bx = TX + refs.cxBotao.x + refs.cxBotao.w / 2, by = TY + refs.cxBotao.y + refs.cxBotao.h / 2;
      andar(U, 8620, casa('lupa'), UW, 1, 260, 300, 18);
      pose(U, 8700, 'gesto'); pose(U, 10030, 'comemora'); pose(U, 10400, 'parado');
      pulo(U, 10060, 220, 24); andar(U, 10420, UW, casa('lupa'), 1, 260, 300, 18);
      L.add(U.pula, 9000, { r: 0 }, E_IO); L.add(U.pula, 9250, { r: -6 }, E_IO); L.add(U.pula, 9450, { r: 5 }, E_IO); L.add(U.pula, 9620, { r: 0 });
      var LU = refs.lupa;
      L.add(LU, 0, { x: 108, y: 262, s: 0.3, r: 0, o: 0 }, DEG); L.add(LU, 8850, { o: 1, s: 0.3 }, MOLA); L.add(LU, 9000, { x: 108, y: 256, s: 1 }, E_IO);
      L.add(LU, 9250, { x: 160, y: 140, r: -8 }, E_IO); L.add(LU, 9450, { x: 214, y: 170, r: 6 }, E_IO); L.add(LU, 9620, { x: bx + 6, y: by - 6, r: 0 });
      L.add(LU, 9720, {}, E_IN); L.add(LU, 9840, { x: 108, y: 262, s: 0.3 }, DEG); L.add(LU, 9841, { o: 0 });
      var DD = refs.dedo;
      L.add(DD, 0, { x: bx + 22, y: by + 70, o: 0, s: 1 }, DEG); L.add(DD, 9640, { o: 1, x: bx + 22, y: by + 70 }, E_OUT); L.add(DD, 9800, { x: bx + 16, y: by + 3 }, E_IN);
      L.add(DD, 9860, { y: by + 7, sy: 0.9 }, E_OUT); L.add(DD, 9960, { y: by + 3, sy: 1 }, E_IN); L.add(DD, 10120, { x: bx + 40, y: by + 80 }, DEG); L.add(DD, 10121, { o: 0 });
      L.add(refs.botao, 9840, { s: 1 }, E_OUT); L.add(refs.botao, 9870, { s: 0.88 }, E_OUT); L.add(refs.botao, 9960, { s: 1.07 }, E_OUT); L.add(refs.botao, 10060, { s: 1 });
      reinicia(refs.botao, { s: 1, o: 1 }, { o: 0, s: 0.4 }); som(9870, 'clique');
      L.add(refs.visto, 0, { o: 0, s: 1.6, r: -20 }); L.add(refs.visto, 10000, { o: 0, s: 1.6, r: -20 }, E_IN); L.add(refs.visto, 10080, { o: 1, s: 0.9, r: -8 }, E_OUT); L.add(refs.visto, 10160, { s: 1 });
      reinicia(refs.visto, { o: 1, s: 1 }, { o: 0, s: 1.6, r: -20 });
      L.add(refs.selo, 0, { o: 0, s: 0.5 }); L.add(refs.selo, 10060, { o: 0, s: 0.5 }, MOLA); L.add(refs.selo, 10220, { o: 1, s: 1 }); reinicia(refs.selo, { o: 1, s: 1 }, { o: 0, s: 0.5 });
      [refs.fotos[0], refs.fotos[1]].forEach(function (e) { reinicia(e, { o: 1, s: 1 }, { o: 0, s: 0.4 }); });

      // passo 6 - Muralha fecha o cadeado (clac) e ele vai para a barra de endereco
      var M = A.muralha, MW = [300, 308, 1], alX = TX + 9, alY = TY + 6;
      andar(M, 10420, casa('muralha'), MW, 1, 240, 300, 18); andar(M, 11520, MW, casa('muralha'), 1, 260, 300, 18);
      pose(M, 10560, 'comemora'); pose(M, 11160, 'gesto'); pose(M, 11500, 'parado');
      L.add(M.pula, 10800, { s: 1 }, E_IO); L.add(M.pula, 10950, { sx: 0.92, sy: 1.1 }, E_IN); L.add(M.pula, 11030, { sx: 1.14, sy: 0.86 }, E_OUT); L.add(M.pula, 11160, { s: 1 });
      L.add(refs.kx, 0, { x: 300 }); L.add(refs.kx, 11180, { x: 300 }, LIN); L.add(refs.kx, 11500, { x: alX }); L.add(refs.kx, 15900, { x: 300 });
      var KY = refs.ky;
      L.add(KY, 0, { y: 206, s: 0.4, r: 0, o: 0 }, DEG); L.add(KY, 10580, { o: 1, s: 0.4 }, MOLA); L.add(KY, 10700, { s: 1 }); L.add(KY, 10800, { y: 206 }, E_OUT);
      L.add(KY, 10950, { y: 192, r: -6 }, E_IN); L.add(KY, 11030, { y: 212, sx: 1.22, sy: 0.8, r: 0 }, E_OUT); L.add(KY, 11140, { y: 208, s: 1 }); L.add(KY, 11180, { y: 208 }, E_OUT);
      L.add(KY, 11340, { y: 128, s: 0.6, r: -20 }, E_IN); L.add(KY, 11500, { y: alY, s: 0.2, r: 0 }, DEG); L.add(KY, 11501, { o: 0 }); L.add(KY, 15900, { y: 206, s: 0.4, o: 0 });
      L.add(refs.kAberto, 0, { o: 1 }, DEG); L.add(refs.kAberto, 11030, { o: 0 }, DEG); L.add(refs.kAberto, 15900, { o: 1 });
      L.add(refs.kFechado, 0, { o: 0 }, DEG); L.add(refs.kFechado, 11030, { o: 1 }, DEG); L.add(refs.kFechado, 15900, { o: 0 });
      som(11030, 'clique');
      L.add(refs.cad, 0, { o: 0, s: 1.8 }); L.add(refs.cad, 11500, { o: 0, s: 1.8 }, DEG); L.add(refs.cad, 11501, { o: 1, s: 1.8 }, E_OUT); L.add(refs.cad, 11620, { s: 1 }); reinicia(refs.cad, { o: 1, s: 1 }, { o: 0, s: 1.8 });

      // passo 7 - Trilho pula e vira a plaquinha para ABERTO; o site acende; todos comemoram
      var R = A.trilho, RW = [282, 308, 1];
      andar(R, 11780, casa('trilho'), RW, 1, 260, 300, 18);
      pose(R, 12100, 'gesto'); pose(R, 12220, 'comemora'); pose(R, 12720, 'parado');
      L.add(R.pula, 12140, { s: 1, y: 0 }, E_IO); L.add(R.pula, 12200, { sx: 1.16, sy: 0.84 }, E_OUT); L.add(R.pula, 12260, { y: -30, sx: 0.88, sy: 1.16 }, E_OUT);
      L.add(R.pula, 12420, { y: -112, s: 1 }, E_IN); L.add(R.pula, 12600, { y: 0, sx: 1.18, sy: 0.84 }, E_OUT); L.add(R.pula, 12720, { y: 0, s: 1 });
      L.add(R.sombra, 12220, { s: 1 }, E_OUT); L.add(R.sombra, 12420, { s: 0.4 }, E_IN); L.add(R.sombra, 12600, { s: 1 });
      var IM = refs.impulso;
      L.add(IM, 0, { r: 0 }); L.add(IM, 12400, { r: 0 }, E_OUT); L.add(IM, 12480, { r: -16 }, E_IO); L.add(IM, 12660, { r: 10 }, E_IO); L.add(IM, 12840, { r: -5 }, E_IO); L.add(IM, 13000, { r: 2 }, E_IO); L.add(IM, 13160, { r: 0 });
      L.add(IM, 15400, { r: 0 }, E_OUT); L.add(IM, 15480, { r: 8 }, E_IO); L.add(IM, 15640, { r: -4 }, E_IO); L.add(IM, 15800, { r: 0 });
      var VI = refs.virar;
      L.add(VI, 0, { sx: 1 }); L.add(VI, 12400, { sx: 1 }, E_IN); L.add(VI, 12530, { sx: 0.02 }, E_OUT); L.add(VI, 12700, { sx: 1.15 }, E_OUT); L.add(VI, 12830, { sx: 1 });
      L.add(VI, 15420, { sx: 1 }, E_IN); L.add(VI, 15540, { sx: 0.02 }, E_OUT); L.add(VI, 15680, { sx: 1.1 }, E_OUT); L.add(VI, 15780, { sx: 1 });
      L.add(refs.fechado, 0, { o: 1 }, DEG); L.add(refs.fechado, 12530, { o: 0 }, DEG); L.add(refs.fechado, 15540, { o: 1 }, DEG);
      L.add(refs.aberto, 0, { o: 0 }, DEG); L.add(refs.aberto, 12530, { o: 1 }, DEG); L.add(refs.aberto, 15540, { o: 0 }, DEG);
      som(12530, 'sino');
      L.add(refs.cel, 0, { s: 1 }); L.add(refs.cel, 12640, { s: 1 }, E_OUT); L.add(refs.cel, 12740, { sx: 0.97, sy: 1.05 }, E_IO); L.add(refs.cel, 12860, { sx: 1.02, sy: 0.98 }, E_IO); L.add(refs.cel, 12980, { s: 1 });
      L.add(refs.carimbo, 0, { o: 0, s: 2.2, r: -14 }); L.add(refs.carimbo, 12950, { o: 0, s: 2.2, r: -14 }, E_IN); L.add(refs.carimbo, 13040, { o: 1, s: 0.92, r: -10 }, E_OUT); L.add(refs.carimbo, 13120, { s: 1 });
      L.add(refs.carimbo, 15960, { o: 1 }, DEG); L.add(refs.carimbo, 15961, { o: 0, s: 2.2, r: -14 });
      som(13040, 'clique');
      ['verbo', 'nimbus', 'lupa', 'paleta', 'pixel', 'muralha', 'trilho'].forEach(function (n, i) {
        var a = A[n], t0 = 12900 + i * 75; pose(a, t0 - 60, 'comemora'); pose(a, t0 + 420, 'parado'); pulo(a, t0, 260, n === 'trilho' ? 28 : 20, 60);
      });
      andar(R, 13760, RW, casa('trilho'), 1, 260, 300, 18);

      L.criar(anims);
      mestre = new Animation(new KeyframeEffect(null, null, { duration: CICLO, iterations: Infinity }), document.timeline); mestre.pause(); anims.push(mestre);
      sons.sort(function (a, b) { return a[0] - b[0]; });
      ir(T);
    }

    /* relogio */
    function agora() { var c = mestre && mestre.currentTime; return typeof c === 'number' ? c : 0; }
    function ir(T) {
      if (st.pausado) anims.forEach(function (a) { a.pause(); a.currentTime = T; });
      else { var tl = document.timeline.currentTime, s0 = (typeof tl === 'number' ? tl : performance.now()) - T; anims.forEach(function (a) { a.startTime = s0; }); }
      ultT = T % CICLO;
    }
    function tocar(motivo) {
      if (estatico || !pronto) { st.pausado = false; st.motivo = motivo; return; }
      var T = agora(); st.pausado = false; st.motivo = motivo; ir(T); evento('estado', { pausado: false, motivo: motivo });
      if (!raf) raf = w.requestAnimationFrame(quadro);
    }
    function parar(motivo) {
      st.motivo = motivo; if (estatico || !pronto) { st.pausado = true; return; }
      var T = agora(); st.pausado = true; ir(T); evento('estado', { pausado: true, motivo: motivo });
      if (raf) { w.cancelAnimationFrame(raf); raf = 0; }
    }
    function passoEm(t) { for (var i = PASSOS.length - 1; i >= 0; i--) if (t >= PASSOS[i].de) return i; return 0; }
    function marcarPasso(p, forca) {
      if (p === st.passo && !forca) return; st.passo = p; var P = PASSOS[p];
      AGENTES.forEach(function (n) { var a = atores[n]; if (a) (n === 'verbo' ? refs.escada : a.ator).classList.toggle('sv-ativo', n === P.agente); });
      evento('passo', { passo: p, agente: P.agente, item: P.item, legenda: (textos.legendas || [])[p] || '' });
    }
    function quadro() {
      raf = 0; if (morto || st.pausado) return;
      var T = agora(), c = Math.floor(T / CICLO), t = T - c * CICLO;
      if (c !== st.ciclo) {
        st.ciclo = c;
        if (pendente) { pendente = false; preencher(); construir(T); }
        if (!forcado) evento('ciclo', { ciclo: c }); forcado = false;
        disparar(ultT, CICLO); ultT = 0;
      }
      disparar(ultT, t); ultT = t;
      marcarPasso(passoEm(t));
      if (foco && t >= foco.ate - 20) { var f = foco; foco = null; parar('balao'); abrirBalao(f.agente); return; }
      raf = w.requestAnimationFrame(quadro);
    }
    function disparar(de, ate) { if (!somFn || ate - de > 400) return; for (var i = 0; i < sons.length; i++) { var s = sons[i]; if (s[0] > de && s[0] <= ate) { try { somFn(s[1]); } catch (e) {} } } }
    function abrirBalao(agente) {
      if (!refs.balao) return; var nome = agente.charAt(0).toUpperCase() + agente.slice(1);
      refs.balaoNome.textContent = nome; refs.balaoTxt.textContent = (textos.baloes || {})[agente] || '';
      refs.balao.classList.add('sv-aberto'); balaoAberto = true;
    }
    function fecharBalao() { if (refs.balao) refs.balao.classList.remove('sv-aberto'); balaoAberto = false; }
    function base0() { return Math.floor(agora() / CICLO) * CICLO; }

    mundo.addEventListener('click', function (e) {
      var alvo = e.target && e.target.closest ? e.target.closest('[data-sv-agente]') : null;
      if (alvo) { var ag = alvo.getAttribute('data-sv-agente'); api.focar(ag); evento('toque', { agente: ag }); }
      else if (balaoAberto) api.continuar();
    });

    function destruir() {
      if (morto) return; morto = true; clearTimeout(relogio8);
      if (raf) w.cancelAnimationFrame(raf); raf = 0;
      anims.forEach(function (a) { try { a.cancel(); } catch (e) {} }); anims = [];
      if (ro) ro.disconnect(); if (mundo.parentNode) mundo.parentNode.removeChild(mundo);
    }

    var api = {
      negocio: function (n) {
        setNeg(n); if (!pronto || morto) return;
        if (estatico) { preencher(); construir(15000); marcarPasso(8, true); return; }
        var t = agora() - base0();
        if (st.pausado || t < 1500) { fecharBalao(); foco = null; preencher(); construir(base0()); marcarPasso(0, true); return; }
        foco = null; pendente = true; forcado = true;
        if (t < 15500) ir(base0() + 15500);
      },
      irPara: function (p) {
        p = Math.max(0, Math.min(8, p | 0)); if (!pronto || morto) return; foco = null; fecharBalao();
        if (estatico) { marcarPasso(p, true); return; }
        if (st.motivo === 'balao') st.motivo = 'usuario';
        ir(base0() + PASSOS[p].de); marcarPasso(p, true);
      },
      focar: function (agente) {
        var i = -1, f = -1; PASSOS.forEach(function (p, k) { if (p.agente === agente) { if (i < 0) i = k; f = k; } });
        if (i < 0 || !pronto || morto) return; fecharBalao();
        if (estatico) { marcarPasso(i, true); abrirBalao(agente); return; }
        ir(base0() + PASSOS[i].de); marcarPasso(i, true); foco = { agente: agente, ate: PASSOS[f].ate };
        if (st.pausado && !document.hidden) tocar('nenhum');
      },
      pausar: function () { foco = null; fecharBalao(); if (!st.pausado) parar('usuario'); else if (st.motivo !== 'usuario') { st.motivo = 'usuario'; evento('estado', { pausado: true, motivo: 'usuario' }); } },
      continuar: function () {
        foco = null; fecharBalao(); if (!st.pausado) return;
        if (!vis || document.hidden) { st.motivo = document.hidden ? 'aba' : 'fora'; evento('estado', { pausado: true, motivo: st.motivo }); } else tocar('nenhum');
      },
      visivel: function (v) {
        vis = !!v;
        if (!vis) { if (!st.pausado) parar(document.hidden ? 'aba' : 'fora'); }
        else if (st.pausado && (st.motivo === 'fora' || st.motivo === 'aba') && !document.hidden) tocar('nenhum');
      },
      som: function (fn) { somFn = typeof fn === 'function' ? fn : null; },
      destruir: destruir
    };
    Object.defineProperty(api, 'estado', { enumerable: true, get: function () {
      return { passo: st.passo, pausado: estatico ? true : st.pausado, motivo: st.motivo, ciclo: st.ciclo, negocio: { nicho: neg.nicho, marca: neg.marca } };
    } });
    return api;
  }

  w.CreatSedeViva = Object.freeze({ versao: 1, PASSOS: PASSOS, CICLO_MS: CICLO, montar: montar });
})(window);
