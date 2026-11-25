/* Ritual da placa · Porta Aberta · T6 (Órbita)
   Contrato: docs/ARQUITETURA.md (a) e docs/CONTRATOS-DETALHE.md (a).
     CreatPlaca.montar(el, { nome?, onAberto?({nome, via}), onSemNome?() })
     CreatPlaca.definirNome(nome)   giz letra a letra na borda (CreatSom.giz)
     CreatPlaca.abrir(via='botao')  o que o botão "Abrir meu negócio" chama
     CreatPlaca.reiniciar()         volta a FECHADO, apaga o giz, sem callback
   Evento: el dispara 'creatplaca:aberta' {detail:{via}} ao virar.
   Script clássico (sem import/export), sem WebGL. O nome entra só por textContent.
   Desenhos: assets/svg/corrente.svg, placa-fechado.svg, placa-verso.svg, placa-aberto.svg (T2),
   embutidos aqui para a placa funcionar também por file:// (sem fetch). Ids prefixados com "cp-". */
(function (W, D) {
  'use strict';
  var SVG = {
   "corrente": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 330 112\"><style> .pl-tinta{fill:var(--sol-tinta,#1E1B2E)} .pl-sombra{fill:var(--linha,#1E1B2E)} .pl-contorno{stroke:var(--linha,#1E1B2E);stroke-linejoin:round;stroke-linecap:round} .pl-madeira{fill:var(--madeira,#D39A5B)} .pl-madeira-clara{fill:var(--madeira-clara,#E6B67B)} .pl-madeira-sombra{fill:var(--madeira-sombra,#7A4B2A)} .pl-veio{fill:none;stroke:var(--madeira-veio,#9A6438);stroke-width:2.5;stroke-linecap:round} .pl-lousa{fill:var(--lousa,#22322D)} .pl-sol{fill:var(--sol,#FFC93C)} .pl-giz{fill:var(--giz,#F4F1E6)} .pl-giz-traco{fill:none;stroke:var(--giz,#F4F1E6);stroke-linecap:round} .pl-poeira{fill:var(--giz-apagado,#AEBBB4)} .pl-metal{fill:var(--corrente,#8C909B)} .pl-elo{fill:none;stroke:var(--corrente,#8C909B);stroke-width:3.2} .pl-elo-brilho{fill:none;stroke:var(--corrente-brilho,#E7E9EF);stroke-width:1.2;stroke-linecap:round} .pl-elo-tinta{fill:none;stroke:var(--linha,#1E1B2E);stroke-width:6.4} .pl-display{font-family:\"Lilita One\",\"Arial Rounded MT Bold\",\"Trebuchet MS\",sans-serif} .pl-texto{font-family:Figtree,system-ui,sans-serif;font-weight:800} </style><g id=\"cp-corrente\"><g id=\"cp-corrente-esq\"><g id=\"cp-corrente-esq-elo-1\" transform=\"translate(155.1 30.3) rotate(138.4)\"><ellipse class=\"pl-elo-tinta\" rx=\"7.6\" ry=\"4.6\"/><ellipse class=\"pl-elo\" rx=\"7.6\" ry=\"4.6\"/><path class=\"pl-elo-brilho\" d=\"M-4 -3.2 Q0 -4.4 4 -3.2\"/></g><g id=\"cp-corrente-esq-elo-2\" transform=\"translate(145.3 39) rotate(138.4)\"><path class=\"pl-elo-tinta\" d=\"M-7 0 H7\"/><path class=\"pl-elo\" d=\"M-7 0 H7\"/></g><g id=\"cp-corrente-esq-elo-3\" transform=\"translate(135.6 47.7) rotate(138.4)\"><ellipse class=\"pl-elo-tinta\" rx=\"7.6\" ry=\"4.6\"/><ellipse class=\"pl-elo\" rx=\"7.6\" ry=\"4.6\"/><path class=\"pl-elo-brilho\" d=\"M-4 -3.2 Q0 -4.4 4 -3.2\"/></g><g id=\"cp-corrente-esq-elo-4\" transform=\"translate(125.8 56.3) rotate(138.4)\"><path class=\"pl-elo-tinta\" d=\"M-7 0 H7\"/><path class=\"pl-elo\" d=\"M-7 0 H7\"/></g><g id=\"cp-corrente-esq-elo-5\" transform=\"translate(116 65) rotate(138.4)\"><ellipse class=\"pl-elo-tinta\" rx=\"7.6\" ry=\"4.6\"/><ellipse class=\"pl-elo\" rx=\"7.6\" ry=\"4.6\"/><path class=\"pl-elo-brilho\" d=\"M-4 -3.2 Q0 -4.4 4 -3.2\"/></g><g id=\"cp-corrente-esq-elo-6\" transform=\"translate(106.2 73.7) rotate(138.4)\"><path class=\"pl-elo-tinta\" d=\"M-7 0 H7\"/><path class=\"pl-elo\" d=\"M-7 0 H7\"/></g><g id=\"cp-corrente-esq-elo-7\" transform=\"translate(96.4 82.3) rotate(138.4)\"><ellipse class=\"pl-elo-tinta\" rx=\"7.6\" ry=\"4.6\"/><ellipse class=\"pl-elo\" rx=\"7.6\" ry=\"4.6\"/><path class=\"pl-elo-brilho\" d=\"M-4 -3.2 Q0 -4.4 4 -3.2\"/></g><g id=\"cp-corrente-esq-elo-8\" transform=\"translate(86.7 91) rotate(138.4)\"><path class=\"pl-elo-tinta\" d=\"M-7 0 H7\"/><path class=\"pl-elo\" d=\"M-7 0 H7\"/></g><g id=\"cp-corrente-esq-elo-9\" transform=\"translate(76.9 99.7) rotate(138.4)\"><ellipse class=\"pl-elo-tinta\" rx=\"7.6\" ry=\"4.6\"/><ellipse class=\"pl-elo\" rx=\"7.6\" ry=\"4.6\"/><path class=\"pl-elo-brilho\" d=\"M-4 -3.2 Q0 -4.4 4 -3.2\"/></g></g><g id=\"cp-corrente-dir\"><g id=\"cp-corrente-dir-elo-1\" transform=\"translate(164.9 30.3) rotate(41.6)\"><ellipse class=\"pl-elo-tinta\" rx=\"7.6\" ry=\"4.6\"/><ellipse class=\"pl-elo\" rx=\"7.6\" ry=\"4.6\"/><path class=\"pl-elo-brilho\" d=\"M-4 -3.2 Q0 -4.4 4 -3.2\"/></g><g id=\"cp-corrente-dir-elo-2\" transform=\"translate(174.7 39) rotate(41.6)\"><path class=\"pl-elo-tinta\" d=\"M-7 0 H7\"/><path class=\"pl-elo\" d=\"M-7 0 H7\"/></g><g id=\"cp-corrente-dir-elo-3\" transform=\"translate(184.4 47.7) rotate(41.6)\"><ellipse class=\"pl-elo-tinta\" rx=\"7.6\" ry=\"4.6\"/><ellipse class=\"pl-elo\" rx=\"7.6\" ry=\"4.6\"/><path class=\"pl-elo-brilho\" d=\"M-4 -3.2 Q0 -4.4 4 -3.2\"/></g><g id=\"cp-corrente-dir-elo-4\" transform=\"translate(194.2 56.3) rotate(41.6)\"><path class=\"pl-elo-tinta\" d=\"M-7 0 H7\"/><path class=\"pl-elo\" d=\"M-7 0 H7\"/></g><g id=\"cp-corrente-dir-elo-5\" transform=\"translate(204 65) rotate(41.6)\"><ellipse class=\"pl-elo-tinta\" rx=\"7.6\" ry=\"4.6\"/><ellipse class=\"pl-elo\" rx=\"7.6\" ry=\"4.6\"/><path class=\"pl-elo-brilho\" d=\"M-4 -3.2 Q0 -4.4 4 -3.2\"/></g><g id=\"cp-corrente-dir-elo-6\" transform=\"translate(213.8 73.7) rotate(41.6)\"><path class=\"pl-elo-tinta\" d=\"M-7 0 H7\"/><path class=\"pl-elo\" d=\"M-7 0 H7\"/></g><g id=\"cp-corrente-dir-elo-7\" transform=\"translate(223.6 82.3) rotate(41.6)\"><ellipse class=\"pl-elo-tinta\" rx=\"7.6\" ry=\"4.6\"/><ellipse class=\"pl-elo\" rx=\"7.6\" ry=\"4.6\"/><path class=\"pl-elo-brilho\" d=\"M-4 -3.2 Q0 -4.4 4 -3.2\"/></g><g id=\"cp-corrente-dir-elo-8\" transform=\"translate(233.3 91) rotate(41.6)\"><path class=\"pl-elo-tinta\" d=\"M-7 0 H7\"/><path class=\"pl-elo\" d=\"M-7 0 H7\"/></g><g id=\"cp-corrente-dir-elo-9\" transform=\"translate(243.1 99.7) rotate(41.6)\"><ellipse class=\"pl-elo-tinta\" rx=\"7.6\" ry=\"4.6\"/><ellipse class=\"pl-elo\" rx=\"7.6\" ry=\"4.6\"/><path class=\"pl-elo-brilho\" d=\"M-4 -3.2 Q0 -4.4 4 -3.2\"/></g></g><g id=\"cp-argola-esq\"><circle class=\"pl-elo-tinta\" cx=\"70\" cy=\"106\" r=\"6.5\"/><circle class=\"pl-elo\" cx=\"70\" cy=\"106\" r=\"6.5\"/></g><g id=\"cp-argola-dir\"><circle class=\"pl-elo-tinta\" cx=\"250\" cy=\"106\" r=\"6.5\"/><circle class=\"pl-elo\" cx=\"250\" cy=\"106\" r=\"6.5\"/></g><g id=\"cp-prego\"><circle class=\"pl-sombra\" cx=\"162\" cy=\"24\" r=\"9\"/><circle class=\"pl-metal pl-contorno\" stroke-width=\"3\" cx=\"160\" cy=\"22\" r=\"9\"/><path class=\"pl-elo-brilho\" d=\"M156 19 Q160 16 164 19\"/></g></g></svg>",
   "fechado": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 330 200\"><g id=\"cp-face-fechado\"><defs><clipPath id=\"cp-pl-clip-fechado\"><rect x=\"10\" y=\"14\" width=\"300\" height=\"172\" rx=\"22\"/></clipPath></defs><rect class=\"pl-sombra\" x=\"16\" y=\"20\" width=\"300\" height=\"172\" rx=\"22\"/><g id=\"cp-fechado-tabua\"><rect class=\"pl-madeira\" x=\"10\" y=\"14\" width=\"300\" height=\"172\" rx=\"22\"/><g clip-path=\"url(#cp-pl-clip-fechado)\"><rect class=\"pl-madeira-clara\" x=\"0\" y=\"0\" width=\"330\" height=\"34\"/><rect class=\"pl-madeira-sombra\" x=\"0\" y=\"160\" width=\"330\" height=\"40\"/><g id=\"cp-fechado-veios\"><path class=\"pl-veio\" d=\"M30 52 C70 44 110 60 150 50\"/><path class=\"pl-veio\" d=\"M190 46 C220 40 255 54 292 46\"/><path class=\"pl-veio\" d=\"M24 146 C64 138 96 152 136 144\"/><path class=\"pl-veio\" d=\"M206 150 C236 140 262 156 296 148\"/><ellipse class=\"pl-veio\" cx=\"262\" cy=\"96\" rx=\"9\" ry=\"5\"/><path class=\"pl-veio\" d=\"M240 92 C250 84 274 84 286 94\"/></g></g><rect fill=\"none\" class=\"pl-contorno\" stroke-width=\"5\" x=\"10\" y=\"14\" width=\"300\" height=\"172\" rx=\"22\"/></g><g id=\"cp-parafusos-fechado\"><g><circle class=\"pl-metal pl-contorno\" stroke-width=\"2.5\" cx=\"30\" cy=\"34\" r=\"5\"/><path class=\"pl-contorno\" stroke-width=\"2\" d=\"M27 36 L33 32\"/></g><g><circle class=\"pl-metal pl-contorno\" stroke-width=\"2.5\" cx=\"290\" cy=\"34\" r=\"5\"/><path class=\"pl-contorno\" stroke-width=\"2\" d=\"M287 36 L293 32\"/></g><g><circle class=\"pl-metal pl-contorno\" stroke-width=\"2.5\" cx=\"30\" cy=\"166\" r=\"5\"/><path class=\"pl-contorno\" stroke-width=\"2\" d=\"M27 168 L33 164\"/></g><g><circle class=\"pl-metal pl-contorno\" stroke-width=\"2.5\" cx=\"290\" cy=\"166\" r=\"5\"/><path class=\"pl-contorno\" stroke-width=\"2\" d=\"M287 168 L293 164\"/></g></g><text id=\"cp-palavra-fechado\" class=\"pl-display pl-tinta\" x=\"160\" y=\"122\" font-size=\"60\" text-anchor=\"middle\" letter-spacing=\"1.5\">FECHADO</text></g></svg>",
   "verso": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 330 200\"><g id=\"cp-face-verso\"><defs><clipPath id=\"cp-pl-clip-verso\"><rect x=\"10\" y=\"14\" width=\"300\" height=\"172\" rx=\"22\"/></clipPath></defs><rect class=\"pl-sombra\" x=\"16\" y=\"20\" width=\"300\" height=\"172\" rx=\"22\"/><g id=\"cp-verso-tabua\"><rect class=\"pl-madeira\" x=\"10\" y=\"14\" width=\"300\" height=\"172\" rx=\"22\"/><g clip-path=\"url(#cp-pl-clip-verso)\"><rect class=\"pl-madeira-clara\" x=\"0\" y=\"0\" width=\"330\" height=\"34\"/><rect class=\"pl-madeira-sombra\" x=\"0\" y=\"160\" width=\"330\" height=\"40\"/><g id=\"cp-verso-veios\"><path class=\"pl-veio\" d=\"M30 52 C70 44 110 60 150 50\"/><path class=\"pl-veio\" d=\"M190 46 C220 40 255 54 292 46\"/><path class=\"pl-veio\" d=\"M24 146 C64 138 96 152 136 144\"/><path class=\"pl-veio\" d=\"M206 150 C236 140 262 156 296 148\"/><ellipse class=\"pl-veio\" cx=\"262\" cy=\"96\" rx=\"9\" ry=\"5\"/><path class=\"pl-veio\" d=\"M240 92 C250 84 274 84 286 94\"/></g></g><rect fill=\"none\" class=\"pl-contorno\" stroke-width=\"5\" x=\"10\" y=\"14\" width=\"300\" height=\"172\" rx=\"22\"/></g><g id=\"cp-marca-queimada\" opacity=\".55\" transform=\"translate(126 74)\"><path fill=\"none\" stroke=\"var(--madeira-sombra,#7A4B2A)\" stroke-width=\"5\" stroke-linejoin=\"round\" d=\"M14 40a10 10 0 0 1-1-20 14 14 0 0 1 27-6 11 11 0 0 1 13 11 8 8 0 0 1-1 15z\"/></g></g></svg>",
   "aberto": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 330 200\"><g id=\"cp-face-aberto\"><defs><clipPath id=\"cp-pl-clip-aberto\"><rect x=\"10\" y=\"14\" width=\"300\" height=\"172\" rx=\"22\"/></clipPath></defs><rect class=\"pl-sombra\" x=\"16\" y=\"20\" width=\"300\" height=\"172\" rx=\"22\"/><g id=\"cp-aberto-tabua\"><rect class=\"pl-madeira\" x=\"10\" y=\"14\" width=\"300\" height=\"172\" rx=\"22\"/><g clip-path=\"url(#cp-pl-clip-aberto)\"><rect class=\"pl-madeira-clara\" x=\"0\" y=\"0\" width=\"330\" height=\"34\"/><rect class=\"pl-madeira-sombra\" x=\"0\" y=\"160\" width=\"330\" height=\"40\"/><g id=\"cp-aberto-veios\"><path class=\"pl-veio\" d=\"M30 52 C70 44 110 60 150 50\"/><path class=\"pl-veio\" d=\"M190 46 C220 40 255 54 292 46\"/><path class=\"pl-veio\" d=\"M24 146 C64 138 96 152 136 144\"/><path class=\"pl-veio\" d=\"M206 150 C236 140 262 156 296 148\"/><ellipse class=\"pl-veio\" cx=\"262\" cy=\"96\" rx=\"9\" ry=\"5\"/><path class=\"pl-veio\" d=\"M240 92 C250 84 274 84 286 94\"/></g></g><rect fill=\"none\" class=\"pl-contorno\" stroke-width=\"5\" x=\"10\" y=\"14\" width=\"300\" height=\"172\" rx=\"22\"/></g><defs><filter id=\"cp-pl-filtro-giz\" x=\"-5%\" y=\"-20%\" width=\"110%\" height=\"140%\"><feTurbulence type=\"fractalNoise\" baseFrequency=\"1.1\" numOctaves=\"2\" seed=\"7\" result=\"ruido\"/><feColorMatrix in=\"ruido\" type=\"matrix\" values=\"0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.2 1.9\" result=\"grao\"/><feComposite in=\"SourceGraphic\" in2=\"grao\" operator=\"in\"/></filter></defs><rect id=\"cp-lousa\" class=\"pl-lousa pl-contorno\" stroke-width=\"3.5\" x=\"30\" y=\"32\" width=\"260\" height=\"128\" rx=\"10\"/><g id=\"cp-poeira-giz\" opacity=\".5\"><ellipse class=\"pl-poeira\" cx=\"72\" cy=\"146\" rx=\"22\" ry=\"4\"/><ellipse class=\"pl-poeira\" cx=\"236\" cy=\"52\" rx=\"16\" ry=\"3\"/></g><text id=\"cp-palavra-aberto\" class=\"pl-display pl-sol\" x=\"160\" y=\"96\" font-size=\"54\" text-anchor=\"middle\" letter-spacing=\"2\">ABERTO</text><path id=\"cp-sublinhado-giz\" class=\"pl-giz-traco\" stroke-width=\"3\" d=\"M96 108 C130 103 190 113 224 106\" filter=\"url(#cp-pl-filtro-giz)\"/><text id=\"cp-placa-nome\" class=\"pl-texto pl-giz\" x=\"160\" y=\"142\" font-size=\"24\" text-anchor=\"middle\" filter=\"url(#cp-pl-filtro-giz)\" data-max-caracteres=\"28\">Seu negócio</text><g id=\"cp-giz-bastao\"><rect class=\"pl-sombra\" x=\"212\" y=\"164\" width=\"40\" height=\"10\" rx=\"5\"/><rect class=\"pl-giz pl-contorno\" stroke-width=\"2.5\" x=\"208\" y=\"160\" width=\"40\" height=\"10\" rx=\"5\"/></g></g></svg>"
  };
  var NS = 'http://www.w3.org/2000/svg';
  var GIRO_MS = 600, FADE_MS = 200, LETRA_MS = 45, LIMIAR = 0.4;
  var RM = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var st = null;

  function reduzido() { return !!RM.matches; }
  function som(nome) {
    if (reduzido()) return;
    try { if (W.CreatSom && typeof W.CreatSom[nome] === 'function') W.CreatSom[nome](); } catch (e) {}
  }
  function vibrar() { try { if (W.navigator && typeof W.navigator.vibrate === 'function') W.navigator.vibrate(30); } catch (e) {} }
  function limpar(n) { return String(n == null ? '' : n).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40); }
  function div(cls, html) { var d = D.createElement('div'); d.className = cls; if (html) d.innerHTML = html; return d; } /* html: só os SVGs constantes acima, nunca o nome */
  function anim(el, kf, op) {
    if (!el || typeof el.animate !== 'function') return null;
    var a = el.animate(kf, op); st.anims.push(a);
    a.addEventListener('finish', function () { var i = st ? st.anims.indexOf(a) : -1; if (i >= 0) st.anims.splice(i, 1); });
    return a;
  }
  function tamanhoNome(n, base, min) { return n.length > 16 ? Math.max(min, Math.round(base * 16 / n.length)) : base; }

  function rotulo() {
    if (!st) return;
    var r = st.aberta
      ? 'Placa ABERTO: ' + st.nome
      : 'Placa FECHADO' + (st.nome ? ', com ' + st.nome + ' escrito em giz' : '') + '. Arraste para baixo, toque ou aperte Enter para virar para ABERTO.';
    st.raiz.setAttribute('aria-label', r);
  }

  /* giz na borda da face FECHADO: só as letras novas aparecem, uma a uma */
  function escreverGiz(novo) {
    var txt = st.gizTexto, velho = st.gizAtual, k = 0;
    while (k < velho.length && k < novo.length && velho[k] === novo[k]) k++;
    while (txt.childNodes.length > k) txt.removeChild(txt.lastChild);
    var letras = Array.from ? Array.from(novo.slice(k)) : novo.slice(k).split('');
    var atraso = reduzido() ? 0 : LETRA_MS;
    letras.forEach(function (ch, i) {
      var t = D.createElementNS(NS, 'tspan');
      t.setAttribute('class', 'cp-giz-letra');
      t.style.animationDelay = (i * atraso) + 'ms';
      t.textContent = ch;
      txt.appendChild(t);
    });
    txt.setAttribute('font-size', tamanhoNome(novo, 20, 11));
    st.gizAtual = novo;
    st.raiz.classList.toggle('cp-com-nome', !!novo);
    if (letras.length && novo.length > velho.length) som('giz');
  }
  function escreverAberto() {
    st.nomeAberto.textContent = st.nome || 'Seu negócio';
    st.nomeAberto.setAttribute('font-size', tamanhoNome(st.nome, 24, 12));
  }

  function cancelarAnims() { (st.anims || []).slice().forEach(function (a) { try { a.cancel(); } catch (e) {} }); st.anims = []; }

  function balancarNao() {
    anim(st.giro, [
      { transform: 'rotate(0deg)' }, { transform: 'rotate(-5deg)' }, { transform: 'rotate(4deg)' },
      { transform: 'rotate(-2deg)' }, { transform: 'rotate(0deg)' }
    ], { duration: reduzido() ? 1 : 420, easing: 'ease-out' });
  }

  function girar() {
    var linear = 'linear';
    st.girando = true;
    var a = anim(st.giro, [
      { offset: 0,    transform: 'rotateY(0deg) scale(1, 1)', easing: 'cubic-bezier(.3,0,.5,1)' },
      { offset: 0.14, transform: 'rotateY(-16deg) scale(1.03, 0.96)', easing: 'cubic-bezier(.55,0,.75,.6)' },
      { offset: 0.5,  transform: 'rotateY(180deg) scale(1, 1)', easing: 'cubic-bezier(.2,.55,.35,1)' },
      { offset: 0.74, transform: 'rotateY(372deg) scale(0.98, 1.03)', easing: 'cubic-bezier(.45,0,.55,1)' },
      { offset: 0.88, transform: 'rotateY(356deg) scale(1.006, 0.995)', easing: 'cubic-bezier(.45,0,.55,1)' },
      { offset: 1,    transform: 'rotateY(360deg) scale(1, 1)' }
    ], { duration: GIRO_MS, easing: linear });
    /* troca de face escondida atrás do verso (180°): o visitante vê FECHADO, a nuvem queimada e ABERTO */
    anim(st.fFechado, [{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }], { duration: GIRO_MS, easing: linear });
    anim(st.fAberto, [{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.5 }, { opacity: 1 }], { duration: GIRO_MS, easing: linear });
    var fim = function () { if (st) st.girando = false; };
    if (a) { a.addEventListener('finish', fim); a.addEventListener('cancel', fim); } else fim();
  }
  function cruzar() {
    anim(st.fFechado, [{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, easing: 'ease-out' });
    anim(st.fAberto, [{ opacity: 0 }, { opacity: 1 }], { duration: FADE_MS, easing: 'ease-out' });
  }

  function abrir(via) {
    if (!st || st.aberta || st.girando) return;
    via = via === 'arrastar' || via === 'teclado' ? via : 'botao';
    if (!st.nome) { balancarNao(); if (st.onSemNome) { try { st.onSemNome(); } catch (e) {} } return; }
    st.aberta = true;
    escreverAberto();
    st.raiz.classList.add('cp-aberta');
    if (reduzido()) cruzar(); else girar();
    rotulo();
    st.anuncio.textContent = 'Aberto: ' + st.nome;
    som('sino');
    vibrar();
    try { st.raiz.dispatchEvent(new CustomEvent('creatplaca:aberta', { detail: { via: via } })); } catch (e) {}
    if (st.onAberto) { try { st.onAberto({ nome: st.nome, via: via }); } catch (e) { if (W.console) console.error(e); } }
  }

  function reiniciar() {
    if (!st) return;
    cancelarAnims();
    st.girando = false; st.aberta = false; st.arraste = null;
    st.raiz.classList.remove('cp-aberta', 'cp-arrastando', 'cp-pronta');
    st.tabua.style.transform = ''; st.corrente.style.transform = '';
    st.nome = ''; escreverGiz(''); escreverAberto();
    st.anuncio.textContent = '';
    rotulo();
  }

  function definirNome(nome) {
    if (!st) return;
    st.nome = limpar(nome);
    escreverGiz(st.nome);
    if (st.aberta) escreverAberto();
    rotulo();
  }

  /* ---------- arrastar para baixo (Pointer Events; touch-action:none só na placa) ---------- */
  function medir() {
    var h = st.raiz.getBoundingClientRect().height || 300;
    return { limite: h * (200 / 300) * LIMIAR, elo: h * (84 / 300) };
  }
  function desenharArraste() {
    st.quadro = 0;
    var g = st.arraste; if (!g) return;
    var v = g.dy <= g.m.limite ? g.dy : g.m.limite + (g.dy - g.m.limite) * 0.3;
    st.tabua.style.transform = 'translate3d(0,' + v.toFixed(1) + 'px,0)';
    st.corrente.style.transform = 'scaleY(' + (1 + v / g.m.elo).toFixed(4) + ')';
    st.raiz.classList.toggle('cp-pronta', g.dy > g.m.limite);
  }
  function soltar(abrirDepois) {
    var g = st.arraste; st.arraste = null;
    st.raiz.classList.remove('cp-arrastando', 'cp-pronta');
    var v = 0, m = /translate3d\(0,\s*([-\d.]+)px/.exec(st.tabua.style.transform || '');
    if (m) v = parseFloat(m[1]) || 0;
    var s = 1 + (g && g.m ? v / g.m.elo : 0);
    st.tabua.style.transform = ''; st.corrente.style.transform = '';
    if (v > 0.5 && !reduzido()) {
      anim(st.tabua, [{ transform: 'translate3d(0,' + v + 'px,0)' }, { transform: 'translate3d(0,' + (-v * 0.08) + 'px,0)', offset: 0.6 }, { transform: 'translate3d(0,0,0)' }], { duration: 280, easing: 'cubic-bezier(.2,.9,.3,1)' });
      anim(st.corrente, [{ transform: 'scaleY(' + s + ')' }, { transform: 'scaleY(.98)', offset: 0.6 }, { transform: 'scaleY(1)' }], { duration: 280, easing: 'cubic-bezier(.2,.9,.3,1)' });
    }
    if (abrirDepois) abrir('arrastar');
  }
  function aoBaixar(e) {
    if (!st || st.girando || st.aberta) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    st.arraste = { id: e.pointerId, y0: e.clientY, x0: e.clientX, dy: 0, mexeu: false, m: medir() };
    try { st.raiz.setPointerCapture(e.pointerId); } catch (x) {}
  }
  function aoMover(e) {
    var g = st && st.arraste; if (!g || e.pointerId !== g.id) return;
    g.dy = Math.max(0, e.clientY - g.y0);
    if (!g.mexeu && (g.dy > 6 || Math.abs(e.clientX - g.x0) > 10)) { g.mexeu = true; st.raiz.classList.add('cp-arrastando'); }
    if (g.mexeu && !st.quadro) st.quadro = W.requestAnimationFrame(desenharArraste);
    if (g.mexeu && e.cancelable) e.preventDefault();
  }
  function aoSoltar(e) {
    var g = st && st.arraste; if (!g || e.pointerId !== g.id) return;
    if (st.quadro) { W.cancelAnimationFrame(st.quadro); st.quadro = 0; }
    if (!g.mexeu) { st.arraste = null; return; }      /* toque simples: o 'click' que vem depois abre */
    st.semClique = true; setTimeout(function () { if (st) st.semClique = false; }, 400);
    soltar(e.type === 'pointerup' && g.dy > g.m.limite);
  }

  function montar(el, op) {
    if (!el || !el.appendChild) throw new Error('CreatPlaca.montar: elemento inválido');
    if (st) desmontar();
    op = op || {};
    var raiz = div('cp-placa');
    raiz.setAttribute('role', 'button');
    raiz.setAttribute('tabindex', '0');
    var pend = div('cp-pendulo');
    var corrente = div('cp-corrente', SVG.corrente);
    var tabua = div('cp-tabua');
    var giro = div('cp-giro');
    var fF = div('cp-face cp-fechado', SVG.fechado);
    var fV = div('cp-face cp-verso', SVG.verso);
    var fA = div('cp-face cp-aberto', SVG.aberto);
    giro.appendChild(fF); giro.appendChild(fV); giro.appendChild(fA);
    tabua.appendChild(giro); pend.appendChild(corrente); pend.appendChild(tabua); raiz.appendChild(pend);
    var anuncio = D.createElement('span'); anuncio.className = 'cp-leitor'; anuncio.setAttribute('aria-live', 'polite');
    raiz.appendChild(anuncio);
    Array.prototype.forEach.call(raiz.querySelectorAll('svg'), function (s) { s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); });

    /* faixa de lousa na borda de baixo da face FECHADO, onde o giz escreve enquanto o visitante digita */
    var svgF = fF.querySelector('svg');
    var faixa = D.createElementNS(NS, 'g'); faixa.setAttribute('class', 'cp-giz-borda');
    var r = D.createElementNS(NS, 'rect');
    [['class', 'pl-lousa pl-contorno'], ['stroke-width', '3'], ['x', '52'], ['y', '136'], ['width', '216'], ['height', '34'], ['rx', '9']].forEach(function (p) { r.setAttribute(p[0], p[1]); });
    var t = D.createElementNS(NS, 'text');
    [['class', 'pl-texto pl-giz'], ['x', '160'], ['y', '160'], ['font-size', '20'], ['text-anchor', 'middle'], ['filter', 'url(#cp-pl-filtro-giz)']].forEach(function (p) { t.setAttribute(p[0], p[1]); });
    faixa.appendChild(r); faixa.appendChild(t);
    svgF.appendChild(faixa);

    el.appendChild(raiz);
    st = {
      el: el, raiz: raiz, pend: pend, corrente: corrente, tabua: tabua, giro: giro,
      fFechado: fF, fAberto: fA, gizTexto: t, gizAtual: '', nomeAberto: fA.querySelector('#cp-placa-nome'),
      anuncio: anuncio, anims: [], nome: '', aberta: false, girando: false, arraste: null, quadro: 0, semClique: false,
      onAberto: typeof op.onAberto === 'function' ? op.onAberto : null,
      onSemNome: typeof op.onSemNome === 'function' ? op.onSemNome : null,
      ouvintes: []
    };
    if (!st.nomeAberto) { st.nomeAberto = D.createElementNS(NS, 'text'); }
    var ouvir = function (alvo, tipo, fn, o) { alvo.addEventListener(tipo, fn, o); st.ouvintes.push([alvo, tipo, fn, o]); };
    ouvir(raiz, 'pointerdown', aoBaixar);
    ouvir(raiz, 'pointermove', aoMover);
    ouvir(raiz, 'pointerup', aoSoltar);
    ouvir(raiz, 'pointercancel', aoSoltar);
    ouvir(raiz, 'lostpointercapture', function (e) { if (st && st.arraste && st.arraste.id === e.pointerId && st.arraste.mexeu) soltar(false); else if (st && st.arraste) st.arraste = null; });
    ouvir(raiz, 'click', function (e) { if (st.semClique) { e.preventDefault(); return; } abrir('botao'); });
    ouvir(raiz, 'keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); if (!e.repeat) abrir('teclado'); }
    });
    ouvir(raiz, 'dragstart', function (e) { e.preventDefault(); });
    definirNome(op.nome || '');
    escreverAberto();
    rotulo();
  }
  function desmontar() {
    if (!st) return;
    cancelarAnims();
    st.ouvintes.forEach(function (o) { o[0].removeEventListener(o[1], o[2], o[3]); });
    if (st.raiz.parentNode) st.raiz.parentNode.removeChild(st.raiz);
    st = null;
  }

  W.CreatPlaca = {
    versao: 1,
    montar: montar,
    definirNome: definirNome,
    abrir: function (via) { abrir(via || 'botao'); },
    reiniciar: reiniciar,
    desmontar: desmontar,
    get aberta() { return !!(st && st.aberta); }
  };
})(window, document);
