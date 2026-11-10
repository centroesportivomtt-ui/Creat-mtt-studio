/* Linhas do tempo dos Reels "Atrás da placa" (Órbita, 10/11/2026).
   Fonte única de tempo: a captura da página real (gerar.cjs), o palco (palco.html) e a trilha (som.js)
   leem daqui. Tudo em segundos de vídeo, 30 fps, 1080x1920. Nada depende do relógio da máquina.
   Roteiros: ../criativos-atras-da-placa.md (R8 · Vire Você; R7 · A Mensagem das 23h). */
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

  /* ------------------------------------------------------------------ R8 · Vire Você (academia) */
  var nomeR8 = 'Studio Barra Fictícia';
  var R8 = {
    codigo: 'R8', nicho: 'academia', arquivo: 'R8-academia-v1', nome: nomeR8, duracao: 15,
    hora: '2026-11-10T09:12:00-03:00',
    /* sessão A: abertura em close na página real (0 a 2,4 s). Sessão B: plano-sequência sem corte (2,4 a 12 s). */
    sessoes: {
      /* A segue até 3,6 s: o recuo da câmera revela a MESMA página com a placa em ABERTO (sem salto de estado) */
      A: { t0: 0, t1: 3.6, teclas: teclas(nomeR8, 0.18, 0.045, 0, 1), arraste: { t0: 1.2, t1: 1.46, solta: 1.5, dy: 82 }, relogioParaEm: 1.52 },
      /* B: corte seco em 3,6 s (clique) e o plano-sequência recomeça do campo vazio */
      B: { t0: 3.6, t1: 12.0, teclas: teclas(nomeR8, 3.92, 0.098, 0.03, 8), arraste: { t0: 6.3, t1: 6.6, solta: 6.66, dy: 82 },
           rolarHome: { t0: 3.62, t1: 3.95, dy: 54 },
           /* prévia: primeiro para no nome do studio (a promessa "com o nome"), depois desce até o pedido de aula */
           rolagem: [{ t0: 7.75, t1: 8.5, alvo: 'nome', y: 232 }, { t0: 9.95, t1: 11.05, alvo: 'pedido', y: 200 }], toqueDia: 11.42 }
    },
    camera: { recuo: [2.4, 3.45] },      /* close (2,68x) -> celular (1,43x) */
    legendas: [
      [0.0, 1.2, 'Digite o <k>nome.</k>'],
      [1.2, 2.4, 'Vire a <k>placa.</k>'],
      [2.4, 3.6, 'Não é animação.<br><k>É a página.</k>'],
      [3.6, 7.6, 'Sem corte.<br><k>Gravado na página.</k>'],
      [7.6, 12.0, '<k>O site pronto,</k><br>com o nome.'],
      [12.0, 15.0, 'Digite o <k>nome.</k><br>Veja o site pronto']
    ],
    selos: [
      { t0: 0, t1: 3.6, texto: 'Creat Nuvem · Porta Aberta', lugar: 'topo-esq' },
      { t0: 3.6, t1: 12, texto: 'sem corte · gravado na página', lugar: 'topo-esq' },
      { t0: 0, t1: 12, texto: 'nome fictício', lugar: 'topo-dir' },
      { t0: 7.7, t1: 12, texto: 'prévia · serviços e preços de exemplo', lugar: 'baixo-2' }
    ],
    cartao: 12.0
  };

  /* ------------------------------------------------------------------ R7 · A Mensagem das 23h (barbearia) */
  var nomeR7 = 'Barbearia Navalha Fictícia';
  var R7 = {
    codigo: 'R7', nicho: 'barbearia', arquivo: 'R7-barbearia-v1', nome: nomeR7, duracao: 15,
    hora: '2026-11-10T23:12:00-03:00',
    cena: { descida: [0.55, 1.05], arraste: { t0: 1.3, t1: 1.56, solta: 1.6, dy: 126 }, vidro: [2.42, 2.98] },
    sessoes: {
      C: { t0: 2.4, t1: 7.0, rolagem: [3.2, 3.9], toques: [
        { t: 4.25, alvo: 'dia', rolarAntes: null },
        { t: 5.15, alvo: 'hora', rolarAntes: [4.45, 4.85] },
        { t: 6.05, alvo: 'servico', rolarAntes: [5.35, 5.75] }
      ] }
    },
    mensagem: 7.0,
    legendas: [
      [0.0, 1.3, '<k>23h12.</k> Um cliente<br>quer horário.'],
      [1.3, 2.5, 'Vire a <k>placa.</k>'],
      [2.5, 7.0, 'Pelo site, ele<br><k>mesmo escolhe.</k>'],
      [7.0, 10.0, 'E o pedido chega<br>no <k>WhatsApp.</k>'],
      [10.0, 15.0, 'Digite o <k>nome.</k><br>Veja o site pronto']
    ],
    selos: [
      { t0: 0, t1: 10, texto: 'Creat Nuvem · Porta Aberta', lugar: 'topo-esq' },
      { t0: 0.55, t1: 10, texto: 'nome fictício', lugar: 'topo-dir' },
      { t0: 2.95, t1: 7.0, texto: 'prévia · serviços e preços de exemplo', lugar: 'baixo-2' }
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
    e.push({ t: A.arraste.solta + 0.6, voz: 'sino', forca: 1 });
    e.push({ t: 3.6, voz: 'clique', forca: 0.7 }, { t: 2.3, voz: 'sala', dur: 9.9 });
    B.teclas.forEach(function (k) { e.push({ t: k.t, voz: 'tecla', forca: 0.55 }); if (k.ch !== ' ') e.push({ t: k.t + 0.004, voz: 'giz', forca: 0.5 }); });
    e.push({ t: B.arraste.t0, voz: 'tic', forca: 1 }, { t: B.arraste.t0 + 0.12, voz: 'rangido', forca: 0.7 });
    e.push({ t: B.arraste.solta + 0.6, voz: 'sino', forca: 0.95 });
    e.push({ t: 7.6, voz: 'grave', forca: 1 });
    e.push({ t: B.toqueDia, voz: 'tic', forca: 0.9 });
    e.push({ t: R8.cartao, voz: 'porta', forca: 1 }, { t: R8.cartao + 0.98, voz: 'sino', forca: 0.55 });
    return e;
  }
  function somR7() {
    var e = [], c = R7.cena;
    e.push({ t: 0, voz: 'rua-noite', dur: 2.9, nivel: 1 });
    e.push({ t: 0.0, voz: 'vibra', forca: 1 });
    e.push({ t: c.descida[0] + 0.08, voz: 'corrente', forca: 0.85 }, { t: c.descida[0] + 0.3, voz: 'corrente', forca: 0.6 }, { t: c.descida[1] - 0.02, voz: 'corrente', forca: 0.45 });
    e.push({ t: c.arraste.t0, voz: 'tic', forca: 1 }, { t: c.arraste.t0 + 0.12, voz: 'rangido', forca: 0.8 });
    e.push({ t: c.arraste.solta + 0.6, voz: 'sino', forca: 1 });
    e.push({ t: 2.5, voz: 'grave', forca: 1 }, { t: 2.4, voz: 'sala', dur: 7.8 });
    R7.sessoes.C.toques.forEach(function (q) { e.push({ t: q.t, voz: 'tic', forca: 0.9 }); });
    e.push({ t: R7.mensagem, voz: 'plim', forca: 1 });
    e.push({ t: R7.cartao, voz: 'porta', forca: 1 }, { t: R7.cartao + 0.98, voz: 'sino', forca: 0.55 });
    return e;
  }
  R8.som = somR8(); R7.som = somR7();

  var API = { FPS: FPS, SEGURA: SEGURA, GRADE: GRADE, prng: prng, R8: R8, R7: R7 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else raiz.LINHAS = API;
})(typeof window !== 'undefined' ? window : globalThis);
