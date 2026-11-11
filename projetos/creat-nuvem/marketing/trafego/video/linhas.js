/* Linhas do tempo dos Reels "Atrás da placa" (Órbita, 10/11/2026; página nova e faixa de preço em 11/11/2026).
   Fonte única de tempo: a captura da página real (gerar.cjs), o palco (palco.html) e a trilha (som.js)
   leem daqui. Tudo em segundos de vídeo, 30 fps, 1080x1920. Nada depende do relógio da máquina.
   Roteiros: ../criativos-atras-da-placa.md (R8 · Vire Você; R7 · A Mensagem das 23h).

   COMO ACRESCENTAR UM REEL (R9 a R12): copie o bloco de um Reel parecido e preencha
   - codigo, nicho, nichoRotulo e angulo (vão no nome do arquivo final, sem acento: "Reel R9 - Salao - Quem Monta (15s).mp4");
   - captura: 'home' (sessões na página inicial, como o R8) ou 'previa' (prévia direta, como o R7). Outro tipo:
     escreva a função em captura.cjs e registre em CAPTURAS;
   - palco: 'home' ou 'dor' (função de quadro em palco.html, registro QUADROS). Outro tipo: escreva quadroXxx e registre;
   - cartao (segundo em que a porta de aço sobe). A faixa de preço da versão de anúncio aparece ~0,45 s depois
     e precisa ficar >= 3 s na tela: cartao <= 11,5 s num Reel de 15 s;
   - capa (segundo do quadro forte usado como capa PNG), legendas, selos e a função de som. */
(function (raiz) {
  'use strict';
  var FPS = 30;

  /* área segura da casa (anuncios-meta.md): texto, marca, placa e ação só aqui */
  var SEGURA = { x0: 65, x1: 1015, y0: 269, y1: 1248 };
  /* grade do palco */
  var GRADE = { seloY: 286, legendaY: 348, janelaY: 548, janelaFim: 1236 };

  /* gerador determinístico (mulberry32): ritmo de digitação e grão do som iguais a cada render */
  function prng(semente) {
    var a = semente >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /* digitação: tempos de cada tecla */
  function teclas(texto, inicio, base, variacao, semente) {
    var r = prng(semente), t = inicio, out = [];
    Array.from(texto).forEach(function (ch, i) {
      out.push({ t: Math.round(t * 1000) / 1000, ch: ch, i: i });
      t += base + (r() - 0.5) * 2 * variacao + (ch === ' ' ? base * 0.6 : 0);
    });
    return out;
  }

  /* ------------------------------------------------------------------ giro da placa: tempo esticado só no verso
     O componente real (ritual/placa.js, GIRO_MS 600) passa pelo verso com a nuvem queimada (90° a 270°) em ~83 ms,
     2 quadros a 30 fps: ninguém vê. Na montagem, só esse trecho do tempo local da animação é esticado para 4 quadros
     (133 ms). A imagem continua sendo a do componente; muda só o relógio. Captura e palco aplicam o mesmo mapa. */
  function bezier(x1, y1, x2, y2) {
    function bx(t) { return 3 * x1 * t * (1 - t) * (1 - t) + 3 * x2 * t * t * (1 - t) + t * t * t; }
    function by(t) { return 3 * y1 * t * (1 - t) * (1 - t) + 3 * y2 * t * t * (1 - t) + t * t * t; }
    return function (x) { var a = 0, b = 1; for (var i = 0; i < 50; i++) { var m = (a + b) / 2; if (bx(m) < x) a = m; else b = m; } return by((a + b) / 2); };
  }
  /* mesmos quadros-chave de girar() em ritual/placa.js */
  var GO = [0, 0.14, 0.5, 0.74, 0.88, 1], GA = [0, -16, 180, 372, 356, 360];
  var GE = [[.3, 0, .5, 1], [.55, 0, .75, .6], [.2, .55, .35, 1], [.45, 0, .55, 1], [.45, 0, .55, 1]].map(function (e) { return bezier(e[0], e[1], e[2], e[3]); });
  function anguloGiro(v) { var x = v / 600; for (var i = 0; i < 5; i++) if (x <= GO[i + 1]) return GA[i] + (GA[i + 1] - GA[i]) * GE[i]((x - GO[i]) / (GO[i + 1] - GO[i])); return 360; }
  function cruza(alvo, de, ate) { var a = de, b = ate; for (var i = 0; i < 50; i++) { var m = (a + b) / 2; if (anguloGiro(m) < alvo) a = m; else b = m; } return (a + b) / 2; }
  var v90 = cruza(90, 84, 300), v270 = cruza(270, 300, 444);
  var GIRO = { ms: 600, v90: v90, v270: v270, D: 4000 / FPS };
  /* tempo do vídeo desde o nascimento da animação (ms) -> tempo local do componente (ms) */
  GIRO.local = function (u) { var g = GIRO; if (u <= g.v90) return u; if (u <= g.v90 + g.D) return g.v90 + (u - g.v90) * (g.v270 - g.v90) / g.D; return u - g.D + (g.v270 - g.v90); };
  GIRO.duracaoVideo = 600 - (v270 - v90) + GIRO.D;
  /* quadro em que a placa assenta de frente (ângulo chega a 355°): é onde o sino bate */
  GIRO.assenta = (function () { for (var k = 1; k < 40; k++) { var v = GIRO.local(k * 1000 / FPS); if (v > v270 && anguloGiro(v) >= 355) return k / FPS; } return 0.45; })();

  /* ------------------------------------------------------------------ R8 · Vire Você (academia) */
  var nomeR8 = 'Studio Barra Fictícia';
  /* Página nova (11/11/2026): título pelo nicho ("Veja o site da sua academia pronto."), campo do nome e botão
     "Ver meu site pronto" na primeira tela; a placa fica logo abaixo do botão. */
  var R8 = {
    codigo: 'R8', nicho: 'academia', nichoRotulo: 'Academia', angulo: 'Vire Voce', nome: nomeR8, duracao: 15,
    captura: 'home', palco: 'home', capa: 2.3,
    hora: '2026-11-11T09:12:00-03:00',
    /* sessão A: abertura em close na placa da página real (0 a 2,4 s) e recuo. Sessão B: plano-sequência sem corte. */
    sessoes: {
      /* A: a página rolada até o botão ficar 130 px abaixo do topo; o recuo revela o botão "Ver meu site pronto"
         e a placa em ABERTO logo abaixo dele (a MESMA página, sem salto de estado). O relógio da página para logo
         depois do giro, então a prévia não abre antes do corte em 3,6 s. */
      A: { t0: 0, t1: 3.6, inicio: { ancora: '#form-abrir button[type=submit]', y: 130 },
           teclas: teclas(nomeR8, 0.18, 0.045, 0, 1), arraste: { t0: 1.2, t1: 1.46, solta: 1.5, dy: 82 }, relogioParaEm: 1.52 },
      /* B: corte seco em 3,6 s (clique), com a legenda-ponte "Agora, do começo:". O plano-sequência recomeça do topo
         da página: título da academia, campo vazio, chip marcado pelo link do anúncio e o botão. O nome é digitado em
         ritmo real, o visitante rola um pouco até a placa e toca em "Ver meu site pronto": a placa vira de verdade
         e a prévia abre (o próprio site faz isso 680 ms depois do giro). */
      B: { t0: 3.6, t1: 11.4, inicio: { ancora: 'topo' }, teclas: teclas(nomeR8, 3.9, 0.082, 0.024, 8),
           rolarHome: { t0: 5.98, t1: 6.42, dy: 300 },
           toqueBotao: 6.62,
           /* prévia: primeiro para no nome do studio (a promessa "com o nome"), depois desce até o pedido de aula.
              A prévia é longa (~2.700 px do nome ao pedido): a descida usa curva trapezoidal, com pico de ~85 px de vídeo
              por quadro (1,51x). y = altura na janela da página. */
           rolagem: [{ t0: 7.5, t1: 7.95, alvo: 'nome', y: 176 }, { t0: 8.55, t1: 10.75, alvo: 'pedido', y: 150, curva: 'trapezio' }], toqueDia: 11.02 }
    },
    camera: {
      recuo: [2.4, 3.45],                  /* close na placa (~70% da largura) -> celular (1,51x) */
      larguraPlaca: 0.70,
      topo: 60,                            /* px CSS do topo da janela da página mostrado (esconde a barra fixa de 58 px) */
      janelaY: 480,                        /* topo da tela do celular no vídeo: abaixo da legenda de 1 linha */
      desce: []
    },
    legendas: [
      [0.0, 1.2, 'Digite o <k>nome.</k>'],
      [1.2, 2.4, 'Vire a <k>placa.</k>'],
      [2.4, 3.6, 'Não é animação.<br><k>É a página.</k>'],
      [3.6, 4.2, 'Agora, <k>do começo:</k>'],
      /* 'previa:B' = quadro em que a prévia aparece na sessão B (meta.sessoes.B.previaEm, lido pelo palco) */
      [4.2, 'previa:B', 'Sem <k>corte.</k>'],
      ['previa:B', 11.4, '<k>O site pronto,</k><br>com o nome.'],
      [11.4, 15.0, 'Digite o <k>nome.</k><br>Veja o site pronto']
    ],
    selos: [
      { t0: 0, t1: 3.6, texto: 'Creat Nuvem · Porta Aberta', lugar: 'topo-esq' },
      { t0: 4.2, t1: 11.4, texto: 'gravado na página', lugar: 'topo-esq' },
      { t0: 0, t1: 11.4, texto: 'nome fictício', lugar: 'topo-dir' },
      { t0: 'previa:B', t1: 11.4, texto: 'prévia · serviços e preços de exemplo', lugar: 'baixo-2' }
    ],
    /* 11,4 s: a faixa de preço da versão de anúncio fica 3,1 s inteira na tela */
    cartao: 11.4
  };

  /* ------------------------------------------------------------------ R7 · A Mensagem das 23h (barbearia) */
  var nomeR7 = 'Barbearia Navalha Fictícia';
  var R7 = {
    codigo: 'R7', nicho: 'barbearia', nichoRotulo: 'Barbearia', angulo: 'A Mensagem das 23h', nome: nomeR7, duracao: 15,
    captura: 'previa', palco: 'dor', capa: 2.4,
    hora: '2026-11-11T23:12:00-03:00',
    /* TESTE DE CENA REAL (rota da economia, 11/11/2026): o primeiro 1,3 s usa uma foto realista aprovada em tela cheia,
       com câmera lenta (Ken Burns) e o selo "cena de exemplo"; a placa cai na frente da foto no mesmo tempo do
       original (assenta em ABERTO antes de 2,4 s, regra fixa do gesto). A foto não entra no repositório (público):
       gerar.cjs recebe a pasta por --fotos ou REELS_FOTOS. Tudo o que vem depois de "difereAte" é idêntico ao R7. */
    variantes: {
      foto: { rotulo: 'variante com foto real', foto: 'Foto Barbearia - maquina na nuca e celular ao lado - vertical 9x16.png',
              ate: 1.3, some: 0.3, kb: { de: 1.03, ate: 1.11, ox: 0.54, oy: 0.40 }, difereAte: 3.2,
              selos: [{ t0: 0, t1: 1.6, texto: 'cena de exemplo', lugar: 'foto' }] }
    },
    /* aproxima: depois de assentar, a câmera chega na placa (2x) para o nome a giz ficar legível; vidro: atravessa a lousa */
    cena: { descida: [0.55, 1.05], arraste: { t0: 1.3, t1: 1.56, solta: 1.6, dy: 126 }, aproxima: [1.95, 2.38, 2.0], vidro: [2.6, 3.15] },
    sessoes: {
      /* prévia real: desce até o nome e para (0,8 s); depois um corte de montagem, com fusão de 0,2 s, leva ao pedido
         (são ~1.400 px de página: rolar isso em menos de 1 s borra). O R7 não promete "sem corte".
         Dia, hora e serviço com rolagens curtas e senoidais (~80 px de vídeo por quadro no máximo). */
      C: { t0: 2.4, t1: 7.15, rolagem: { t0: 3.18, t1: 3.65, alvo: 'nome', y: 120 },
        salto: { t: 4.45, fusao: 0.2, yFita: 118 },
        toques: [
        { t: 4.9, alvo: 'dia', rolarAntes: null },
        { t: 5.65, alvo: 'hora', rolarAntes: [5.05, 5.45] },
        { t: 6.75, alvo: 'servico', rolarAntes: [5.78, 6.62] }
      ] }
    },
    mensagem: 7.15,
    legendas: [
      [0.0, 1.3, '<k>23h12.</k> Um cliente<br>quer horário.'],
      [1.3, 2.6, 'Vire a <k>placa.</k>'],
      [2.6, 7.15, 'Pelo site, ele<br><k>mesmo escolhe.</k>'],
      [7.15, 10.0, 'E o pedido chega<br>no <k>WhatsApp.</k>'],
      [10.0, 15.0, 'Digite o <k>nome.</k><br>Veja o site pronto']
    ],
    selos: [
      { t0: 0, t1: 10, texto: 'Creat Nuvem · Porta Aberta', lugar: 'topo-esq' },
      { t0: 0.55, t1: 10, texto: 'nome fictício', lugar: 'topo-dir' },
      { t0: 3.1, t1: 7.15, texto: 'prévia · serviços e preços de exemplo', lugar: 'baixo-2' }
    ],
    cartao: 10.0
  };

  /* ------------------------------------------------------------------ trilha: eventos de som (som.js) */
  function somR8() {
    var e = [], A = R8.sessoes.A, B = R8.sessoes.B;
    e.push({ t: 0, voz: 'rua', dur: 2.55, nivel: 1 });
    e.push({ t: 0.04, voz: 'corrente', forca: 0.8 }, { t: 0.31, voz: 'corrente', forca: 0.55 });
    A.teclas.forEach(function (k) { if (k.ch !== ' ') e.push({ t: k.t, voz: 'giz', forca: 1 }); });
    e.push({ t: A.arraste.t0, voz: 'tic', forca: 1 }, { t: A.arraste.t0 + 0.12, voz: 'rangido', forca: 0.8 });
    e.push({ t: A.arraste.solta + GIRO.assenta, voz: 'sino', forca: 1 });
    e.push({ t: 3.6, voz: 'clique', forca: 0.7 }, { t: 2.3, voz: 'sala', dur: 9.9 });
    B.teclas.forEach(function (k) { e.push({ t: k.t, voz: 'tecla', forca: 0.55 }); if (k.ch !== ' ') e.push({ t: k.t + 0.004, voz: 'giz', forca: 0.5 }); });
    /* o toque no botão "Ver meu site pronto" vira a placa na hora (CreatPlaca.abrir), sem arraste */
    e.push({ t: B.toqueBotao, voz: 'tic', forca: 1 }, { t: B.toqueBotao + 0.1, voz: 'rangido', forca: 0.6 });
    e.push({ t: B.toqueBotao + GIRO.assenta, voz: 'sino', forca: 0.95 });
    e.push({ t: R8.graveEm, voz: 'grave', forca: 1 });
    e.push({ t: B.toqueDia, voz: 'tic', forca: 0.9 });
    e.push({ t: R8.cartao, voz: 'porta', forca: 1 }, { t: R8.cartao + 0.4 + GIRO.assenta, voz: 'sino', forca: 0.55 });
    return e;
  }
  function somR7() {
    var e = [], c = R7.cena;
    e.push({ t: 0, voz: 'rua-noite', dur: c.vidro[0] + 0.5, nivel: 1 });
    e.push({ t: 0.0, voz: 'vibra', forca: 1 });
    e.push({ t: c.descida[0] + 0.08, voz: 'corrente', forca: 0.85 }, { t: c.descida[0] + 0.3, voz: 'corrente', forca: 0.6 }, { t: c.descida[1] - 0.02, voz: 'corrente', forca: 0.45 });
    e.push({ t: c.arraste.t0, voz: 'tic', forca: 1 }, { t: c.arraste.t0 + 0.12, voz: 'rangido', forca: 0.8 });
    e.push({ t: c.arraste.solta + GIRO.assenta, voz: 'sino', forca: 1 });
    e.push({ t: c.vidro[0], voz: 'grave', forca: 1 }, { t: 2.4, voz: 'sala', dur: 7.9 });
    R7.sessoes.C.toques.forEach(function (q) { e.push({ t: q.t, voz: 'tic', forca: 0.9 }); });
    e.push({ t: R7.mensagem, voz: 'plim', forca: 1 });
    e.push({ t: R7.cartao, voz: 'porta', forca: 1 }, { t: R7.cartao + 0.4 + GIRO.assenta, voz: 'sino', forca: 0.55 });
    return e;
  }
  /* tom grave de "lado de dentro" no quadro em que a prévia aparece (medido na captura: meta.sessoes.B.previaEm) */
  R8.graveEm = 7.53;
  R8.som = somR8(); R7.som = somR7();

  /* ------------------------------------------------------------------ versões de cada Reel
     organico: cartão final como no sistema. anuncio: o mesmo vídeo com a faixa de preço queimada no cartão final
     (textos-troca-unica.md, seção 3): texto exato em duas linhas, Figtree 800 >= 36 px, tinta sobre papel, dentro
     da área segura, visível do começo ao fim do cartão (>= 3 s). Os quadros antes do cartão são os mesmos. */
  var PRECO = ['Abertura R$ 297 + plano a partir de', 'R$ 147/mês, só com o site no ar'];
  var VERSOES = {
    organico: { sufixo: '', preco: false },
    anuncio: { sufixo: ' - anuncio com preco', preco: true }
  };
  /* nome do arquivo final, sem acento e sem cedilha: "Reel R7 - Barbearia - A Mensagem das 23h (15s)" */
  function semAcento(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ()+,.-]/g, ''); }
  function nomeArquivo(R, versao, variante) {
    var v = variante && R.variantes && R.variantes[variante];
    var base = 'Reel ' + R.codigo + ' - ' + R.nichoRotulo + ' - ' + (v ? v.rotulo : R.angulo) + ' (' + R.duracao + 's)';
    return semAcento(base + VERSOES[versao || 'organico'].sufixo);
  }
  function capaArquivo(R) { return semAcento('Reel ' + R.codigo + ' - ' + R.nichoRotulo + ' - ' + R.angulo + ' (' + R.duracao + 's) - capa'); }

  var API = { FPS: FPS, SEGURA: SEGURA, GRADE: GRADE, prng: prng, GIRO: GIRO, anguloGiro: anguloGiro, PRECO: PRECO, VERSOES: VERSOES,
    nomeArquivo: nomeArquivo, capaArquivo: capaArquivo, REELS: ['R7', 'R8'], R8: R8, R7: R7 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else raiz.LINHAS = API;
})(typeof window !== 'undefined' ? window : globalThis);
