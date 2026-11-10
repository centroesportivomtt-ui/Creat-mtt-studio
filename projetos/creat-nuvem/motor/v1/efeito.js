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
 * Ritual vivo (09/11/2026): a navalha entra fechada, arma, a lâmina estala para fora do cabo (gira no rebite)
 * e passa no couro, tudo em dois; parada, a cada 6 a 9 s faz duas passadas virando a lâmina e o nome vira
 * cromo por um instante; a dica vira "Arraste a navalha" (ritualTextos.dicaVez do preset); o primeiro toque
 * ou arrasto encerra. Afiada: o risco de luz varre a lâmina, uma estrela estala na ponta e um raio atravessa
 * o couro. A demonstração não emite ritual:passada (sem som, sem contar fio). O CSS disso entra por
 * <style data-ritual-vivo> (CSS_VIVO; mudou o texto, troque o hash de style-src em motor/v1/template.html).
 * Onda 3 (10/11/2026):
 *   - a navalha é de barbeiro: escamas pretas foscas, pino de latão no pivô, espiga com rabo para o dedo,
 *     lâmina com dorso grosso e fio polido, aberta a 150 graus; o nome vai gravado na lâmina, fora do brilho;
 *   - a navalha nunca repousa sobre o texto: fica acima do .heroi-olho (borda de baixo >= 16 px acima dele),
 *     com o selo entre ela e o olho; sem altura, vai para a coluna ao lado do texto (paisagem) ou o herói
 *     cresce (padding-top e min-height no próprio elemento, nunca encolhe a navalha);
 *   - o nome começa gravado no couro (legível desde o quadro 0) e recebe um brilho de cromo sozinho aos 1,2 s.
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

  /* ---------- ritual vivo (09/11/2026): relógio em dois, curvas, diretor da demonstração e a dica ----------
     MUDA JUNTO: cópia enxuta de rituais/comum.js (emDois, trecho, curva, diretor), porque a barbearia não
     carrega o comum.js. Corrigiu o ciclo de vida ou os tempos num, corrija no outro. A dica "Arraste a navalha"
     daqui é diferente de propósito: flutua junto da navalha (o texto do herói fica abaixo da dobra no celular). */
  var QUADRO_EM_DOIS = 1000 / 12;
  function emDois(ms) { return Math.floor(ms / QUADRO_EM_DOIS) * QUADRO_EM_DOIS; }
  function trecho(T, a, b) { return lim((T - a) / (b - a), 0, 1); }
  var curva = {
    saida: function (p) { return 1 - Math.pow(1 - p, 3); },
    meio: function (p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; },
    voltaAtras: function (p) { var c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); }
  };
  /* 1,8 a 2,6 s depois da entrada e, dali em diante, a cada 6 a 9 s, com o herói na tela, a aba visível e
     ninguém mexendo: opc.tocar(fim). parar() é para sempre nesta visita (primeiro toque, tecla ou arrasto) */
  var PRIMEIRA_DEMO = [1800, 2600];
  function criarDiretor(el, opc) {
    var st = { parado: false, visivel: true, timer: 0, tocando: false, primeira: false };
    function agendar() {
      clearTimeout(st.timer); st.timer = 0;
      if (st.parado || st.tocando || !st.visivel || D.hidden || reduzido()) return;
      st.timer = setTimeout(disparar, st.primeira ? PRIMEIRA_DEMO[0] + Math.random() * (PRIMEIRA_DEMO[1] - PRIMEIRA_DEMO[0]) : 6000 + Math.random() * 3000);
    }
    function disparar() {
      st.timer = 0;
      if (st.parado || st.tocando || !st.visivel || D.hidden || reduzido()) return;
      if (opc.pode && !opc.pode()) { agendar(); return; }
      st.tocando = true; st.primeira = false;
      opc.tocar(function () { st.tocando = false; if (st.parado) return; if (opc.aoFim) opc.aoFim(); agendar(); });
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
      iniciar: function () { st.primeira = true; agendar(); },
      parar: function () {
        if (st.parado) return;
        st.parado = true; clearTimeout(st.timer); st.timer = 0;
        if (io) io.disconnect();
        D.removeEventListener('visibilitychange', aoVer);
        if (opc.aoParar) opc.aoParar();
        st.tocando = false;
      },
      parado: function () { return st.parado; }
    };
  }
  /* "Arraste a navalha": um selo que flutua entre a navalha parada e o .heroi-olho, dentro do couro. Assim o
     convite aparece na primeira dobra também no celular, onde a dica do texto fica lá embaixo. Quem decide
     o lugar é o encaixe do herói (onde(largura, altura) -> {x, y}, em px do couro); o selo nunca vai sobre o h1. */
  function criarDicaVez(couro, onde) {
    if (!couro || !onde) return null;
    var vez = D.createElement('p'); vez.className = 'couro-vez'; vez.setAttribute('aria-hidden', 'true');
    var dedo = D.createElement('span'); dedo.className = 'vez-dedo';
    var tx = D.createElement('span'); tx.className = 'vez-texto'; tx.textContent = texto('dicaVez', 'Arraste a navalha');
    vez.appendChild(dedo); vez.appendChild(tx); couro.appendChild(vez);
    var timer = 0;
    function posicionar() {
      var p = onde(vez.offsetWidth || 170, vez.offsetHeight || 36);
      vez.style.left = Math.round(p.x) + 'px'; vez.style.top = Math.round(p.y) + 'px';
    }
    return {
      el: vez,
      altura: function () { return reduzido() ? 0 : (vez.offsetHeight || 36); },
      mostrar: function () {
        if (reduzido()) return;
        clearTimeout(timer); posicionar(); vez.classList.add('is-visivel');
        timer = setTimeout(function () { vez.classList.remove('is-visivel'); }, 2600);
      },
      esconder: function () { clearTimeout(timer); vez.classList.remove('is-visivel'); }
    };
  }
  /* o CSS do ritual vivo da navalha entra uma vez (a barbearia só carrega o styles.css do motor) */
  var CSS_VIVO = [
    '.couro-vez{position:absolute;left:0;top:0;z-index:2;margin:0;display:inline-flex;align-items:center;gap:var(--esp-2);padding:7px 14px 7px 10px;white-space:nowrap;pointer-events:none;font-family:var(--fonte-dado);font-size:var(--t-menor);font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--couro-tinta);background:color-mix(in oklab,var(--couro-fundo) 78%,black);border:1.5px solid var(--couro-latao);border-radius:999px;box-shadow:0 6px 14px color-mix(in oklab,var(--couro-fundo) 50%,transparent);opacity:0;transform:translateY(6px) scale(.96);transition:opacity 160ms var(--curva-saida),transform 160ms var(--curva-saida)}',
    '.couro-vez.is-visivel{opacity:1;transform:none;transition:opacity 260ms var(--curva-entrada),transform 260ms var(--curva-entrada)}',
    '.couro-vez .vez-dedo{position:relative;width:12px;height:12px;flex:0 0 auto;border-radius:50%;background:var(--couro-latao)}',
    '.couro-vez .vez-dedo::after{content:"";position:absolute;inset:-3px;border-radius:50%;border:2px solid var(--couro-latao);opacity:0}',
    '.couro-vez.is-visivel .vez-dedo{animation:vez-vai 1100ms ease-in-out 200ms infinite alternate}',
    '.couro-vez.is-visivel .vez-dedo::after{animation:vez-pulso 1100ms var(--curva-entrada) 300ms infinite}',
    '@keyframes vez-vai{from{transform:translateX(-3px)}to{transform:translateX(3px)}}',
    '@keyframes vez-pulso{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(2.4)}}',
    '.navalha .nv-estrela{transform-box:fill-box;transform-origin:50% 50%;transform:scale(0)}',
    '.navalha.is-reflexo .nv-estrela{animation:nv-estrela 1000ms var(--curva-mola) 60ms both}',
    '@keyframes nv-estrela{0%{transform:scale(0) rotate(-45deg);opacity:1}45%{transform:scale(1.2) rotate(0);opacity:1}75%{transform:scale(.95) rotate(10deg);opacity:1}100%{transform:scale(0) rotate(35deg);opacity:0}}',
    '.couro-raio{position:absolute;top:-10%;bottom:-10%;left:0;width:34%;pointer-events:none;opacity:0;background:linear-gradient(90deg,transparent,color-mix(in oklab,var(--couro-tinta) 38%,transparent) 50%,transparent);transform:translateX(-110%) skewX(-16deg)}',
    '.couro-raio.is-passando{animation:couro-raio 760ms var(--curva-entrada) both}',
    '@keyframes couro-raio{0%{opacity:0;transform:translateX(-110%) skewX(-16deg)}25%{opacity:1}100%{opacity:0;transform:translateX(310%) skewX(-16deg)}}',
    /* o nome começa gravado no couro: tinta a 85%, sombra embaixo e realce em cima (relevo), legível desde o quadro 0 */
    '.heroi.couro{--nome-gravado:color-mix(in oklab,var(--couro-tinta) 85%,transparent)}',
    /* sem transição de cor antes de afiar: no fim do brilho o nome volta direto ao gravado, sem piscar transparente */
    '.heroi.couro:not(.is-afiada) .heroi-nome{color:var(--nome-gravado);text-shadow:0 1px 0 rgba(0,0,0,.5),0 -1px 0 rgba(255,255,255,.08);transition:none}',
    /* o cromo passa no nome da esquerda para a direita: sozinho aos 1,2 s (is-brilho, 900 ms) e no meio da demonstração (is-relance) */
    '.heroi.couro.is-relance:not(.is-afiada) .heroi-nome,.heroi.couro.is-brilho:not(.is-afiada) .heroi-nome{background-image:linear-gradient(100deg,var(--nome-gravado) 0%,var(--nome-gravado) 37%,color-mix(in oklab,var(--couro-tinta) 42%,var(--couro-fundo)) 44%,#fff 49%,color-mix(in oklab,var(--couro-tinta) 70%,white) 51%,color-mix(in oklab,var(--couro-tinta) 38%,var(--couro-fundo)) 56%,var(--nome-gravado) 63%,var(--nome-gravado) 100%);background-size:320% 100%;background-repeat:no-repeat;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;text-shadow:none;animation:relance-cromo 950ms var(--curva-entrada) both}',
    '.heroi.couro.is-brilho:not(.is-afiada) .heroi-nome{background-size:250% 100%;animation-duration:900ms;animation-timing-function:cubic-bezier(.45,0,.55,1)}',
    '@keyframes relance-cromo{from{background-position:100% 0}to{background-position:0 0}}',
    '@media (prefers-reduced-motion:reduce){.couro-vez{display:none}.couro-raio,.navalha .nv-estrela{animation:none!important;opacity:0}.heroi.couro.is-relance:not(.is-afiada) .heroi-nome,.heroi.couro.is-brilho:not(.is-afiada) .heroi-nome{animation:none;background-image:none;color:var(--nome-gravado);-webkit-text-fill-color:currentColor}}'
  ].join('\n');
  function garantirCssVivo() {
    if (D.querySelector('style[data-ritual-vivo]')) return;
    var st = D.createElement('style');
    st.setAttribute('data-ritual-vivo', '');
    st.textContent = CSS_VIVO;
    (D.head || D.documentElement).appendChild(st);
  }

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
  /* navalha de barbeiro aberta a 150 graus, no viewBox 320 x 64 (o desenho passa um pouco do quadro embaixo):
     lâmina na horizontal, do ombro (x 140) à ponta (x 315), dorso em y 4 a 9,5 e fio em y 40;
     espiga e rabo em volta do pivô (124, 14); escamas descendo para a esquerda a 30 graus da lâmina. */
  var PIVO = { x: 124, y: 14 }, FECHADA = 150;      // fechada, a lâmina gira 150 graus e deita entre as escamas
  var DESENHO = { x0: 26, x1: 317, y0: 2, y1: 74 }; // caixa do desenho aberto, para o encaixe no herói
  var LAMINA = { cx: 228 / VB_W - 0.5, cy: 22 / VB_H - 0.5, meiaL: 88 / VB_W, meiaA: 18 / VB_H };  // pegada (frações)
  function svg(tag, at, pai) {
    var n = D.createElementNS(SVGNS, tag);
    for (var k in at) n.setAttribute(k, at[k]);
    if (pai) pai.appendChild(n);
    return n;
  }
  function degrade(defs, id, x2, y2, paradas) {
    var g = svg('linearGradient', { id: id, x1: 0, y1: 0, x2: x2, y2: y2 }, defs);
    paradas.forEach(function (p) { svg('stop', { offset: p[0], 'stop-color': p[1], 'stop-opacity': p[2] === undefined ? 1 : p[2] }, g); });
    return g;
  }
  /* meia-extensão do desenho em px a partir do centro do elemento, com a pose (rotação em graus, escala Y f) */
  function caixaNavalha(L, rotGraus, f) {
    var k = L / VB_W, a = rotGraus * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), fy = f === undefined ? 1 : f;
    var r = { cima: 0, baixo: 0, esq: 0, dir: 0 };
    [DESENHO.x0, DESENHO.x1].forEach(function (x) {
      [DESENHO.y0, DESENHO.y1].forEach(function (y) {
        var px = (x - VB_W / 2) * k, py = (y - VB_H / 2) * k * fy;
        var X = px * c - py * s, Y = px * s + py * c;
        if (-Y > r.cima) r.cima = -Y; if (Y > r.baixo) r.baixo = Y;
        if (-X > r.esq) r.esq = -X; if (X > r.dir) r.dir = X;
      });
    });
    return r;
  }
  function criarNavalha(comprimento) {
    var id = 'nv' + (++seq);
    var raiz = D.createElement('div');
    raiz.className = 'navalha';
    raiz.setAttribute('aria-hidden', 'true');
    var s = svg('svg', { viewBox: '0 0 ' + VB_W + ' ' + VB_H, focusable: 'false', 'aria-hidden': 'true' }, raiz);
    var defs = svg('defs', {}, s);

    // aço polido: reflete o couro escuro em cima (onde o nome fica) e clareia no bisel, até o fio
    degrade(defs, id + 'l', 0, 1, [[0, '#454b52'], [0.3, '#535a62'], [0.56, '#6b737b'], [0.7, '#9aa2a9'], [0.86, '#d3d8dc'], [1, '#f1f3f4']]);
    // dorso: aço grosso, mais escuro, com um fio de luz em cima
    degrade(defs, id + 'd', 0, 1, [[0, '#8a9198'], [0.3, '#3b4147'], [1, '#2a2f34']]);
    // espiga: aço escovado
    degrade(defs, id + 'e', 0, 1, [[0, '#9aa1a8'], [0.5, '#6f767d'], [1, '#4f555b']]);
    // escamas: preto fosco (quase sem reflexo)
    degrade(defs, id + 'c', 0, 1, [[0, '#2b2b2f'], [0.5, '#17171a'], [1, '#0c0c0e']]);
    // pinos de latão
    var gR = svg('radialGradient', { id: id + 'r', cx: 0.38, cy: 0.34, r: 0.75 }, defs);
    [[0, '#ecd7a6'], [0.45, '#B08D57'], [1, '#6e5330']].forEach(function (p) { svg('stop', { offset: p[0], 'stop-color': p[1] }, gR); });
    // risco especular: faixa clara em gradiente horizontal
    degrade(defs, id + 'b', 1, 0, [[0, '#ffffff', 0], [0.5, '#ffffff', 0.8], [1, '#ffffff', 0]]);

    var pLamina = 'M138 6 L140 4 L298 4 Q314 4 315 20 Q315 35 301 40 L158 40 Q143 38 140 21 Z';
    // o brilho de cromo mora só na faixa do bisel, perto do fio (o nome, em cima, fica fora dele)
    var clip = svg('clipPath', { id: id + 'k' }, defs);
    svg('path', { d: 'M140 29 L315 29 L315 41 L140 41 Z' }, clip);
    var clipL = svg('clipPath', { id: id + 'q' }, defs);
    svg('path', { d: pLamina }, clipL);

    // lâmina + espiga num grupo que gira no pivô: a navalha abre das escamas na entrada do herói.
    // Fica ANTES das escamas no desenho: fechada, ela dorme entre elas, como na navalha de verdade.
    var gLam = svg('g', {}, s);
    // rabo da espiga: o gancho logo abaixo do pivô, onde o dedo apoia
    svg('path', { d: 'M119 18 Q106 23 106.5 33 Q108 41 115.5 39 Q115 30 126 21 Z', fill: 'url(#' + id + 'e)', stroke: 'rgba(0,0,0,0.45)', 'stroke-width': 0.8 }, gLam);
    // espiga com ranhuras (jimps) em cima e embaixo
    svg('path', { d: 'M114 8 Q114 6 117 6 L141 5 L141 21.5 L117 21 Q114 21 114 18 Z', fill: 'url(#' + id + 'e)', stroke: 'rgba(0,0,0,0.4)', 'stroke-width': 0.8 }, gLam);
    for (var j = 0; j < 5; j++) {
      svg('path', { d: 'M' + (127 + j * 2.6) + ' 5.6 v2.4 M' + (127 + j * 2.6) + ' 18.8 v2.4', stroke: '#3d4248', 'stroke-width': 1 }, gLam);
    }
    // lâmina
    svg('path', { d: pLamina, fill: 'url(#' + id + 'l)', stroke: 'rgba(0,0,0,0.5)', 'stroke-width': 0.8 }, gLam);
    // dorso reto e grosso (5,5 unidades: 4 a 6 px na tela)
    svg('path', { d: 'M140 4 L298 4 Q309 4 312 9.5 L140 9.5 Z', fill: 'url(#' + id + 'd)' }, gLam);
    svg('path', { d: 'M141 4.6 L297 4.6', stroke: 'rgba(255,255,255,0.35)', 'stroke-width': 0.7, fill: 'none' }, gLam);
    // linha do bisel e fio polido
    svg('path', { d: 'M150 33.5 L306 33.5', stroke: 'rgba(255,255,255,0.32)', 'stroke-width': 0.8, fill: 'none' }, gLam);
    svg('path', { d: 'M158 39.6 L301 39.6', stroke: '#fbfcfc', 'stroke-width': 1, fill: 'none' }, gLam);
    // o nome gravado na lâmina (fosco, na cor do texto do couro a 70%), entre o dorso e o bisel
    var fonte = "'Big Shoulders Display','Arial Narrow',sans-serif";
    var est = W.CreatMotor && W.CreatMotor.estado;
    var gravacao = String((est && (est.nomeCurto || est.nome)) || '').trim().toUpperCase().slice(0, 28);
    var gNome = svg('g', { 'clip-path': 'url(#' + id + 'q)' }, gLam);
    var t1 = svg('text', { x: 228, y: 25.6, 'text-anchor': 'middle', 'font-family': fonte, 'font-weight': 800, 'font-size': 14, 'letter-spacing': 1.2, fill: '#000000', 'fill-opacity': 0.35 }, gNome);
    var t2 = svg('text', { x: 228, y: 25, 'text-anchor': 'middle', 'font-family': fonte, 'font-weight': 800, 'font-size': 14, 'letter-spacing': 1.2, fill: '#E9EFE6', 'fill-opacity': 0.7 }, gNome);
    t2.style.fill = 'var(--couro-tinta, #E9EFE6)';   // CSSOM (a CSP aceita): segue a paleta do tenant
    t1.textContent = t2.textContent = gravacao;
    // nome longo: comprime para caber entre o ombro e a ponta
    if (gravacao.length * 6.9 + (gravacao.length - 1) * 1.2 > 150) [t1, t2].forEach(function (t) { t.setAttribute('textLength', 150); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); });
    // brilho recortado na faixa do bisel
    var gk = svg('g', { 'clip-path': 'url(#' + id + 'k)' }, gLam);
    var faixa = svg('g', { transform: 'translate(120 0)' }, gk);
    svg('rect', { x: 0, y: -10, width: 44, height: 84, fill: 'url(#' + id + 'b)', transform: 'skewX(-22)' }, faixa);
    // a estrela de luz que estala na ponta quando a navalha fica afiada (celebração)
    var gEst = svg('g', { transform: 'translate(310 26)' }, gLam);
    svg('path', { 'class': 'nv-estrela', d: 'M0 -19 Q2.6 -2.6 19 0 Q2.6 2.6 0 19 Q-2.6 2.6 -19 0 Q-2.6 -2.6 0 -19 Z', fill: '#ffffff' }, gEst);

    // escamas: duas placas pretas foscas vistas de lado, do pivô para baixo e para a esquerda (por cima da espiga)
    var gEsc = svg('g', { transform: 'translate(' + PIVO.x + ' ' + PIVO.y + ') rotate(' + FECHADA + ')' }, s);
    svg('path', { d: 'M-8 0 Q-8 -7 0 -7.5 C35 -9.6 70 -8.6 96 -6.6 Q106 -6 106 0 Q106 6 96 6.6 C70 8.6 35 9.6 0 7.5 Q-8 7 -8 0 Z', fill: 'url(#' + id + 'c)', stroke: 'rgba(255,255,255,0.12)', 'stroke-width': 0.8 }, gEsc);
    svg('path', { d: 'M4 5.4 C36 7.2 70 6.6 94 4.8', stroke: 'rgba(255,255,255,0.07)', 'stroke-width': 1.4, fill: 'none' }, gEsc);   // fio de luz fosco
    svg('path', { d: 'M99 -5.2 L99 5.2', stroke: 'rgba(255,255,255,0.1)', 'stroke-width': 0.8 }, gEsc);                            // a cunha no fim
    svg('circle', { cx: 99.5, cy: 0, r: 2.5, fill: 'url(#' + id + 'r)' }, gEsc);                                                     // pino do fim
    // pino de pivô em latão, com o anel da arruela
    svg('circle', { cx: PIVO.x, cy: PIVO.y, r: 4.6, fill: 'none', stroke: 'rgba(176,141,87,0.55)', 'stroke-width': 1 }, s);
    svg('circle', { cx: PIVO.x, cy: PIVO.y, r: 3.4, fill: 'url(#' + id + 'r)' }, s);

    var L = 0, A = 0, ultimoBrilho = -1, ultimaAbertura = 1;
    var nav = {
      el: raiz,
      // a de 0 (fechada, entre as escamas) a 1 (aberta a 150 graus); passa de 1 no estalo. Encurta no meio
      // do giro (a lâmina sai do plano, como no gesto de verdade) e volta ao tamanho cheio aberta.
      abrir: function (a) {
        if (Math.abs(a - ultimaAbertura) < 0.002) return;
        ultimaAbertura = a;
        if (a >= 1 && a < 1.002) { gLam.removeAttribute('transform'); return; }
        var ang = FECHADA * (1 - a), sx = 0.72 + 0.28 * lim(a, 0, 1);
        gLam.setAttribute('transform', 'translate(' + PIVO.x + ' ' + PIVO.y + ') rotate(' + ang.toFixed(2) + ') scale(' + sx.toFixed(3) + ' 1) translate(' + (-PIVO.x) + ' ' + (-PIVO.y) + ')');
      },
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
      pegada: function (x, y, rotRad, f) {
        var bx = LAMINA.cx * L, by = LAMINA.cy * A * (f === undefined ? 1 : f);
        var c = Math.cos(rotRad), sn = Math.sin(rotRad);
        return { x: x + c * bx - sn * by, y: y + sn * bx + c * by, r: rotRad };
      },
      caixa: function (rotGraus, f) { return caixaNavalha(L, rotGraus, f); },
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
      repouso: { x: 0, y: 0 }, folga: 0, passadas: 0, afiada: false,
      visivel: true, rodando: false, tAnt: 0,
      teclado: 0, ultimaTecla: 0, sentidoTecla: -1,
      ant: null, vel: 0, arrasto: null, desvioY: 0,
      cena: null, diretor: null, vez: null, reflexo: null, raio: null,
      modo: 'acima', cresceu: 0, livre: false, colX0: 0, colX1: 0,
      lim: { cima: -1e9, baixo: 1e9, esq: -1e9 }, selo: { x: 12, y: 8 }, tBrilho: 0
    };
    garantirCssVivo();
    h.raio = D.createElement('div'); h.raio.className = 'couro-raio'; h.raio.setAttribute('aria-hidden', 'true');
    slot.appendChild(h.raio);
    slot.appendChild(h.nav.el);
    h.vez = criarDicaVez(couro, function (lv, av) {
      // o selo fica no vão entre a navalha parada e o olho; na coluna ao lado do texto, nunca invade o texto
      var x0 = h.modo === 'lado' ? h.colX0 : 12;
      return { x: lim(h.selo.x - lv / 2, x0, Math.max(x0, h.w - lv - 12)), y: h.selo.y };
    });

    medirHero();
    // ritual vivo: a navalha abre do cabo e passa no couro; depois, demonstração em loop até o primeiro toque
    h.diretor = criarDiretor(couro, {
      pode: function () { return !h.afiada && !h.cena && !h.teclado && !(h.arrasto && h.arrasto.ativo()) && h.passadas === 0; },
      tocar: function (fim) { rodarCena(demoCena, fim); },
      aoFim: function () { if (h.vez) h.vez.mostrar(); },
      aoParar: function () { if (h.vez) h.vez.esconder(); }
    });
    if (reduzido()) estadoFinalHero();
    else {
      // o cromo passa sozinho no nome aos 1,2 s, uma vez, para mostrar o que o gesto faz
      setTimeout(function () { if (!h.afiada && !reduzido()) brilhoNome('is-brilho', 1000); }, 1200);
      h.nav.abrir(0); h.nav.el.style.opacity = '0';        // nada aparece aberto antes do primeiro quadro da entrada
      rodarCena(entradaCena, function () { if (h.diretor) h.diretor.iniciar(); });
    }
    desenharHero();
    agendarHero();

    // um toque no couro (sem arrastar) também passa a vez: a demonstração não volta nesta visita
    var tq = null;
    couro.addEventListener('pointerdown', function (e) { tq = { x: e.clientX, y: e.clientY, t: agora() }; }, true);
    couro.addEventListener('pointerup', function (e) {
      if (tq && Math.abs(e.clientX - tq.x) < 10 && Math.abs(e.clientY - tq.y) < 10 && agora() - tq.t < 600) primeiroToque();
      tq = null;
    }, true);

    // gesto
    var seg = { dir: 0, x: 0, y: 0, ext: 0, extY: 0, contou: false, lx: 0, lt: 0 };
    h.arrasto = ligarArrasto(couro, {
      pode: function () { return !reduzido(); },
      inicio: function (e, x0, y0) {
        primeiroToque();
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
      primeiroToque();
      h.mx.alvo = h.repouso.x + s * (h.modo === 'lado' ? Math.max(16, h.folga) : h.w * 0.26);
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
        medirHero(); desenharHero(); agendarHero();
        ultimoTam = couro.clientWidth + 'x' + couro.clientHeight;   // o encaixe pode ter feito o herói crescer
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
    if (D.fonts && D.fonts.ready) D.fonts.ready.then(function () {
      if (h.arrasto.ativo()) return;
      medirHero(); ultimoTam = couro.clientWidth + 'x' + couro.clientHeight;
      agendarHero(); desenharHero();
    });
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

  /* ---------- encaixe da navalha no herói (onda 3) ----------
     A navalha repousa onde não cobre texto nenhum:
       'acima': acima do .heroi-olho, com a borda de baixo do desenho >= FOLGA_OLHO px acima dele e o selo
                "Arraste a navalha" no vão entre os dois;
       'lado' : sem essa altura (celular deitado), na coluna à direita do texto;
       sem nenhum dos dois, o herói cresce o que falta (padding-top e min-height no próprio elemento, pelo
       CSSOM, que a CSP aceita) e fica 'acima'. A navalha nunca encolhe para caber.
     h.lim vale para toda pose que não é o dedo da pessoa (entrada, demonstração, mola, teclado): a cena pode
     girar e virar a lâmina, mas a caixa do desenho não passa do limite (gira menos se precisar). */
  var TOPO_LIVRE = 10, FOLGA_OLHO = 16, FOLGA_SELO = 8, ROT_REPOUSO = -4, COLUNA_MIN = 220;
  function topoRel(el, rc) { return el.getBoundingClientRect().top - rc.top; }
  // a borda direita das letras (não das caixas) de tudo o que o herói escreve
  function direitaDoTexto(c, rc) {
    var dir = 0, rg = D.createRange();
    for (var n = c.firstElementChild; n; n = n.nextElementSibling) {
      if (n.id === 'couro-canvas' || n.id === 'navalha-slot' || n.id === 'couro-instrucao' || n.classList.contains('couro-vez')) continue;
      if (!n.getClientRects().length) continue;
      var rs;
      if ((n.textContent || '').trim()) { rg.selectNodeContents(n); rs = rg.getClientRects(); } else rs = n.getClientRects();
      for (var i = 0; i < rs.length; i++) if (rs[i].width > 0) dir = Math.max(dir, rs[i].right - rc.left);
    }
    return dir;
  }
  function prepararPalco() {
    var h = hero, c = h.couro;
    if (h.cresceu) { c.style.paddingTop = ''; c.style.minHeight = ''; h.cresceu = 0; }
    var rc = c.getBoundingClientRect(), w = Math.max(1, c.clientWidth), H = Math.max(1, c.clientHeight);
    var L0 = lim(w * (w < 600 ? 0.66 : 0.74), 180, 380);   // no celular, menor: sobra couro para a passada
    var ext = caixaNavalha(L0, ROT_REPOUSO, 1);
    var olho = c.querySelector('.heroi-olho') || c.querySelector('.heroi-nome');
    var olhoTopo = olho ? topoRel(olho, rc) : H * 0.6;
    var seloA = h.vez ? h.vez.altura() : 0;
    var precisa = TOPO_LIVRE + ext.cima + ext.baixo + (seloA ? FOLGA_SELO + seloA : 0) + FOLGA_OLHO;
    h.modo = 'acima';
    h.nav.tamanho(L0);
    if (olhoTopo >= precisa) return;
    var cs = getComputedStyle(c), padD = parseFloat(cs.paddingRight) || 16;
    var x0 = Math.round(direitaDoTexto(c, rc) + 24), col = w - padD - x0;
    if (col >= COLUNA_MIN) {
      h.modo = 'lado'; h.colX0 = x0; h.colX1 = w - padD;
      h.nav.tamanho(Math.min(L0, Math.max(180, col * 0.82)));
      return;
    }
    var d = Math.ceil(precisa - olhoTopo);
    c.style.paddingTop = ((parseFloat(cs.paddingTop) || 0) + d) + 'px';
    c.style.minHeight = (H + d) + 'px';
    h.cresceu = d;
  }

  function calcularRepouso() {
    var h = hero, c = h.couro, rc = c.getBoundingClientRect(), cs = getComputedStyle(c);
    var olho = c.querySelector('.heroi-olho') || c.querySelector('.heroi-nome');
    var nome = c.querySelector('.heroi-nome');
    var olhoTopo = olho ? topoRel(olho, rc) : h.hgt * 0.6;
    var ext = h.nav.caixa(ROT_REPOUSO, 1);
    var seloA = h.vez ? h.vez.altura() : 0;
    if (h.modo === 'lado') {
      var x0 = h.colX0, x1 = h.colX1, padB = parseFloat(cs.paddingBottom) || 0;
      var nomeBase = nome ? nome.getBoundingClientRect().bottom - rc.top : olhoTopo + 80;
      h.repouso.x = (x0 + x1) / 2 + (ext.esq - ext.dir) / 2;            // centra o desenho, não o elemento
      var yMin = TOPO_LIVRE + ext.cima;
      h.repouso.y = lim((olhoTopo + nomeBase) / 2 - seloA / 2, yMin, Math.max(yMin, h.hgt - padB - ext.baixo));
      h.lim = { cima: 2, baixo: h.hgt - 2, esq: x0 };
      h.folga = Math.max(0, Math.min(h.repouso.x - ext.esq - x0, x1 - h.repouso.x - ext.dir));
      var yb = h.repouso.y + ext.baixo + FOLGA_SELO;
      h.selo = { x: (x0 + x1) / 2, y: yb + seloA <= h.hgt - 8 ? yb : h.repouso.y - ext.cima - FOLGA_SELO - seloA };
    } else {
      var topo = parseFloat(cs.paddingTop) || 120;
      var inicioTexto = nome ? nome.offsetTop : h.hgt * 0.6;
      var baixo = olhoTopo - FOLGA_OLHO;
      var yMin2 = TOPO_LIVRE + ext.cima;
      var yMax2 = baixo - ext.baixo - (seloA ? FOLGA_SELO + seloA : 0);
      h.repouso.x = h.w / 2 + (ext.esq - ext.dir) / 2;
      h.repouso.y = lim((topo * 0.75 + inicioTexto) / 2, yMin2, Math.max(yMin2, yMax2));
      h.lim = { cima: 2, baixo: baixo, esq: -1e9 };
      // quanto a navalha pode andar para os lados nas cenas sem a ponta sair do couro (no celular, pouco)
      h.folga = Math.max(0, Math.min(h.repouso.x, h.w - h.repouso.x) - h.nav.L / 2 - 8);
      var fundoNav = h.repouso.y + ext.baixo;
      h.selo = { x: h.w / 2, y: Math.max(fundoNav + FOLGA_SELO, (fundoNav + olhoTopo - seloA) / 2) };
    }
  }

  function medirHero() {
    var h = hero;
    prepararPalco();
    h.w = Math.max(1, h.couro.clientWidth); h.hgt = Math.max(1, h.couro.clientHeight); h.d = dpr();
    h.canvas.width = Math.round(h.w * h.d); h.canvas.height = Math.round(h.hgt * h.d);
    h.base = gerarBase();
    h.marcas.tamanho(h.w, h.hgt, 1);                    // marcas em 1x: borradas de propósito, 4x mais baratas
    calcularRepouso();
    if (!h.arrasto || !h.arrasto.ativo()) voltarAoRepouso(true);
  }

  function voltarAoRepouso(imediato) {
    var h = hero;
    h.mx.alvo = h.repouso.x; h.my.alvo = h.repouso.y; h.mr.alvo = ROT_REPOUSO;
    if (imediato) { h.mx.fixar(h.repouso.x); h.my.fixar(h.repouso.y); h.mr.fixar(ROT_REPOUSO); h.mf.fixar(h.mf.alvo < 0 ? -1 : 1); posarHero(); }
  }

  /* a pose dentro dos limites: gira menos se a caixa não couber; o texto (baixo) manda mais que o topo */
  function encaixar(x, y, r, f) {
    var h = hero, L = h.lim, alt = L.baixo - L.cima, e = h.nav.caixa(r, f), i = 0;
    while (e.cima + e.baixo > alt && i++ < 24 && Math.abs(r - ROT_REPOUSO) > 0.05) { r += (ROT_REPOUSO - r) * 0.3; e = h.nav.caixa(r, f); }
    if (y - e.cima < L.cima) y = L.cima + e.cima;
    if (y + e.baixo > L.baixo) y = L.baixo - e.baixo;
    if (x - e.esq < L.esq) x = L.esq + e.esq;
    return { x: x, y: y, r: r, f: f };
  }

  function posarHero() {
    var h = hero, p = { x: h.mx.x, y: h.my.x, r: h.mr.x, f: h.mf.x };
    // o dedo leva a navalha aonde quiser; solta, ela volta pela mola e só então os limites valem de novo
    if (h.arrasto && h.arrasto.ativo()) h.livre = true;
    else {
      var q = encaixar(p.x, p.y, p.r, p.f);
      if (h.livre && Math.abs(q.x - p.x) < 0.5 && Math.abs(q.y - p.y) < 0.5 && Math.abs(q.r - p.r) < 0.1) h.livre = false;
      if (!h.livre) p = q;
    }
    h.nav.pose(p.x, p.y, p.r, p.f);
    h.nav.brilho((p.x + h.nav.L / 2) / (h.w + h.nav.L) + h.mx.v * 0.00015);
    return p;
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

  /* =====================================================================
     RITUAL VIVO DO HERÓI
     A cena devolve a pose inteira por quadro ({x, y, r, f, a, op, marca, alfa}) e o quadro a
     escreve nas molas (fixar): pegou no meio, a física segue dali.
     ===================================================================== */
  function primeiroToque() {
    var h = hero;
    if (!h) return;
    if (h.diretor) h.diretor.parar();
    pararCena();
  }
  function rodarCena(fn, fim) {
    var h = hero;
    pararCena();
    h.cena = { fn: fn, fim: fim, t0: 0, tAnt: 0, relance: 0 };
    h.tAnt = 0;
    agendarHero();
  }
  function encerrarVisual() {
    var h = hero;
    h.nav.abrir(1);
    h.nav.el.style.opacity = '';
  }
  function pararCena() {
    var h = hero;
    if (!h || !h.cena) return;
    h.cena = null;
    encerrarVisual();
  }
  /* o cromo passa no nome (classe is-brilho ou is-relance); dois brilhos a menos de 4 s viram um só */
  function brilhoNome(classe, ms) {
    var h = hero, c = h.couro, t = agora();
    if (h.afiada || (h.tBrilho && t - h.tBrilho < 4000)) return;
    h.tBrilho = t;
    c.classList.remove('is-relance', 'is-brilho');
    void c.offsetWidth;
    c.classList.add(classe);
    setTimeout(function () { c.classList.remove(classe); }, ms);
  }
  function relanceCromo() { brilhoNome('is-relance', 1100); }

  /* entrada, EM DOIS (12 poses/s): a navalha aparece fechada, arma para trás (antecipação),
     a lâmina estala para fora do cabo passando do ponto, e ainda assentando já desce no couro
     numa passada longa, deixando a marca, até o repouso (sobreposição) */
  function entradaCena(t) {
    var h = hero, T = emDois(t), R = h.repouso, w = h.w;
    if (T >= 1580) return null;
    var amp = Math.min(w * 0.2, h.folga), sx = R.x - Math.min(w * 0.16, Math.max(0, h.folga - 12)), sy = R.y - Math.min(36, h.hgt * 0.05);
    var o = { x: sx, y: sy, r: -14, f: 1, a: 0, op: trecho(T, 0, 170), marca: false, alfa: 0 };
    if (T >= 170) { var p = curva.saida(trecho(T, 170, 340)); o.r = -14 + 10 * p; o.x = sx - 12 * p; }
    if (T >= 340) {
      o.a = curva.voltaAtras(trecho(T, 340, 640));
      o.r = -4 - 16 * curva.saida(trecho(T, 340, 520));   // o estalo empurra o cabo (ação e reação)
    }
    if (T >= 560 && T < 1240) {
      var q = curva.meio(trecho(T, 560, 1240)), x0 = sx - 12, x1 = R.x + amp;
      o.x = x0 + (x1 - x0) * q; o.y = sy + (R.y + 4 - sy) * q; o.r = -20 + 18 * q;
      o.marca = true; o.alfa = 0.05 + 0.1 * Math.sin(Math.PI * q);
    } else if (T >= 1240) {
      var b = curva.saida(trecho(T, 1240, 1580)), xa = R.x + amp;
      o.x = xa + (R.x - xa) * b; o.y = R.y + 4 - 4 * b; o.r = -2 - 2 * b; o.a = 1;
    }
    return o;
  }

  /* demonstração curta (60 qps): arma, passa para a direita, vira a lâmina no eixo longo,
     volta para a esquerda, vira de novo e assenta; no meio, o nome vira cromo por um instante */
  function demoCena(T, c) {
    var h = hero, R = h.repouso, w = h.w;
    if (T >= 1580) return null;
    var dir = R.x + Math.min(w * 0.22, h.folga), esq = R.x - Math.min(w * 0.2, h.folga);
    var o = { x: R.x, y: R.y, r: -4, f: 1, a: 1, op: 1, marca: false, alfa: 0 };
    if (T < 160) { var p = Math.sin(Math.PI * trecho(T, 0, 160)); o.x = R.x - w * 0.03 * p; o.r = -4 + 5 * p; }
    else if (T < 560) { var q = curva.meio(trecho(T, 160, 560)); o.x = R.x + (dir - R.x) * q; o.r = -4 + 7 * Math.sin(Math.PI * q); o.marca = true; o.alfa = 0.06 + 0.12 * Math.sin(Math.PI * q); }
    else if (T < 700) { o.x = dir; o.f = Math.cos(Math.PI * trecho(T, 560, 700)); }
    else if (T < 1100) { var q2 = curva.meio(trecho(T, 700, 1100)); o.x = dir + (esq - dir) * q2; o.f = -1; o.r = -4 - 7 * Math.sin(Math.PI * q2); o.marca = true; o.alfa = 0.06 + 0.12 * Math.sin(Math.PI * q2); }
    else if (T < 1240) { o.x = esq; o.f = -Math.cos(Math.PI * trecho(T, 1100, 1240)); }
    else { var b = curva.saida(trecho(T, 1240, 1580)); o.x = esq + (R.x - esq) * b; }
    if (T >= 1040 && !c.relance) { c.relance = 1; relanceCromo(); }
    return o;
  }

  function quadroHero(t) {
    var h = hero;
    h.rodando = false;
    var dt = h.tAnt ? lim((t - h.tAnt) / 1000, 0, 1 / 30) : 1 / 60;
    h.tAnt = t;
    var reduz = reduzido();
    var marcando = false, alfa = 0.1;

    var o = null;
    if (h.cena && !reduz) {
      var c = h.cena;
      if (!c.t0) { c.t0 = t; c.tAnt = t; }
      if (t - c.tAnt > 100) c.t0 += (t - c.tAnt) - 16;      // ficou fora da tela ou a aba sumiu: continua de onde parou
      c.tAnt = t;
      o = c.fn(t - c.t0, c);
      if (o) {
        h.mx.fixar(o.x); h.my.fixar(o.y); h.mr.fixar(o.r); h.mf.fixar(o.f);
        h.nav.abrir(o.a);
        h.nav.el.style.opacity = o.op >= 1 ? '' : o.op.toFixed(2);
        marcando = o.marca; alfa = o.alfa;
      } else {
        h.cena = null;
        encerrarVisual();
        voltarAoRepouso();
        if (c.fim) c.fim();
      }
    }
    if (!o) {
      if (h.teclado && t > h.teclado) { h.teclado = 0; voltarAoRepouso(); }
      h.mx.passo(dt); h.my.passo(dt); h.mr.passo(dt); h.mf.passo(dt);
      var ativo = h.arrasto && h.arrasto.ativo();
      marcando = ativo || !!h.teclado;
      alfa = 0.09 + 0.14 * lim(Math.abs(h.mx.v) / 1500, 0, 1);
    }
    var pose = posarHero();
    // celebração: o risco de luz varre a lâmina inteira de uma vez
    if (h.reflexo) {
      if (!h.reflexo.t0) h.reflexo.t0 = t;
      var pr = (t - h.reflexo.t0) / 560;
      h.nav.brilho(easeSaida(lim(pr, 0, 1)));
      if (pr >= 1) h.reflexo = null;
    }

    // marca no couro onde a lâmina passou
    var pg = h.nav.pegada(pose.x, pose.y, pose.r * Math.PI / 180, pose.f);
    if (marcando && h.ant && (Math.abs(pg.x - h.ant.x) > 0.5 || Math.abs(pg.y - h.ant.y) > 0.5)) {
      h.marcas.riscar(h.ant, pg, h.nav.meiaL(), h.nav.meiaA() * Math.abs(h.mf.x) + 1, alfa);
    }
    h.ant = pg;
    h.marcas.desbotar(dt);
    desenharHero();

    var parado = h.mx.parada(0.3) && h.my.parada(0.3) && h.mr.parada(0.05) && h.mf.parada(0.002);
    if (h.cena || h.reflexo || !parado || h.marcas.suja || (h.arrasto && h.arrasto.ativo()) || h.teclado) agendarHero();
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
    if (h.diretor) h.diretor.parar();
    pararCena();
    h.afiada = true; h.passadas = 4;
    atualizarMedidor(1);
    // o texto entra só agora: a mudança de conteúdo é o que faz a região aria-live anunciar
    if (h.frase) h.frase.textContent = texto('heroiPronto', 'Afiada.');
    var anima = comEfeito && !reduzido();
    if (anima) {
      // lampejo de 120 ms (--dur-rapida), uma piscada só (fotossensibilidade); a classe sai aos 220 ms, depois do fim da animação
      h.couro.classList.add('is-lampejo');
      setTimeout(function () { h.couro.classList.remove('is-lampejo'); }, 220);
      // a navalha reflete a luz: o risco varre a lâmina, a estrela estala na ponta e um raio atravessa o couro
      h.reflexo = { t0: 0 };
      [[h.nav.el, 'is-reflexo'], [h.raio, 'is-passando']].forEach(function (par) {
        if (!par[0]) return;
        par[0].classList.remove(par[1]); void par[0].offsetWidth; par[0].classList.add(par[1]);
      });
      agendarHero();
    }
    h.couro.classList.add('is-afiada');
    emitir('motor:ritual-pronto', { ritual: 'navalha' });
    if (anima) emitir('ritual:afiada', { origem: 'heroi' });
  }

  // movimento reduzido: navalha já parada e afiada, sem atravessar, sem lampejo, sem som
  function estadoFinalHero() {
    var h = hero;
    if (!h) return;
    if (h.diretor) h.diretor.parar();
    pararCena();
    h.teclado = 0;
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
