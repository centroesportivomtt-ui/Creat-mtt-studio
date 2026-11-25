/* Linhas do tempo dos Reels "Atrás da placa" (Órbita, 10/11/2026; página nova e faixa de preço em 11/11/2026).
   Fonte única de tempo: a captura da página real (gerar.cjs), o palco (palco.html) e a trilha (som.js)
   leem daqui. Tudo em segundos de vídeo, 30 fps, 1080x1920. Nada depende do relógio da máquina.
   Roteiros: ../criativos-atras-da-placa.md (R7 a R12; R10 · Sem Amarra e R11 · O Pedido Chega no Seu em 11/11/2026).

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
      /* A: a página rolada até o campo do nome ficar logo abaixo da barra fixa (o navegador rola sozinho até o campo
         quando se digita fora da vista, então o campo precisa estar à vista) e a placa ainda na tela. O recuo revela o
         botão "Ver meu site pronto" e a placa em ABERTO logo abaixo dele (a MESMA página, sem salto de estado).
         O relógio da página para logo depois do giro, então a prévia não abre antes do corte em 3,6 s. */
      A: { t0: 0, t1: 3.6, inicio: { ancora: '#nome', y: 70 },
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
      /* close na placa (~70% da largura) -> celular (1,51x). Conferência de 11/11: no recuo de 2,4 a 3,4 s a faixa da
         legenda de 2 linhas ("Não é animação. / É a página.", até y ~550) cobria o botão "Ver meu site pronto". Agora o
         recuo é rápido e com saída suave (ease-out, 0,54 s) e a tela do celular da sessão A começa em y 575, abaixo da
         legenda: o botão fica inteiro de 2,7 s a 3,6 s (y ~626 a ~711) com a placa logo abaixo dele. */
      recuo: [2.4, 2.94], curva: 'eout',
      larguraPlaca: 0.70,
      /* px CSS do topo da janela da página mostrado no fim do recuo, por sessão. A: do botão à placa (o campo da cidade
         fica fora do quadro). B: do título ao botão (esconde a barra fixa de 58 px). A captura da home fotografa 390x720. */
      topo: { A: 300, B: 60 },
      janelaY: { A: 575, B: 480 },         /* topo da tela do celular no vídeo: A abaixo da legenda de 2 linhas, B da de 1 */
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
    /* capa = o gancho novo (11/11, conferência): relógio 23:12 grande e a notificação, antes de a placa descer */
    captura: 'previa', palco: 'dor', capa: 0.3,
    hora: '2026-11-11T23:12:00-03:00',
    /* fundo da noite até o sino: do lado de fora é 23h12; no quadro do sino o fundo corta seco para --ceu (do lado de
       dentro está aberto). O balcão fica escurecido enquanto é noite. */
    fundo: { cor: 'tinta', balcao: 'escuro', ate: 'sino' },
    /* TESTE DE CENA REAL (rota da economia, 11/11/2026): o primeiro 1,3 s usa uma foto realista aprovada em tela cheia,
       com câmera lenta (Ken Burns) e o selo "cena de exemplo"; a placa cai na frente da foto no mesmo tempo do
       original (assenta em ABERTO antes de 2,4 s, regra fixa do gesto). A foto não entra no repositório (público):
       gerar.cjs recebe a pasta por --fotos ou REELS_FOTOS. Tudo o que vem depois de "difereAte" é idêntico ao R7. */
    variantes: {
      /* Conferência de 11/11 (direção criativa): a dor agora é a que a foto mostra (mão na máquina, pedido no
         celular), sem "23h12" sobre uma foto de dia. A foto sobe ~260 px (escala 1,46 a 1,52 com origem em (1080,
         1370) da caixa de 1080x1920; menos que isso deixaria um vão embaixo) e o celular da bancada fica em y ~1104 a
         ~1178: a tela dele acende e o balão sai dela, com a vibração do R7. De 1,3 s até o sino a foto fica atrás da
         placa, escurecida a 35% (véu --tinta a 65%), e no quadro do sino corta seco para o céu. Tela do celular da
         bancada na caixa da foto (antes da escala), cantos lidos da foto aprovada: tela. */
      foto: { rotulo: 'variante com foto real', foto: 'Foto Barbearia - maquina na nuca e celular ao lado - vertical 9x16.png',
              capa: 0.5, ate: 1.3, escurece: [1.3, 1.6, 0.65], corte: 'sino',
              kb: { de: 1.46, ate: 1.52, ox: 1080, oy: 1370, dy: -260 },
              tela: [[610, 1369], [1074, 1363], [1080, 1412], [607, 1416]], balao: { sai: [0.08, 0.5], y: 846 },
              legenda: [0.0, 1.3, 'Mão na <k>máquina.</k><br>Pedido no celular.'], de: 'Mensagem · agora',
              difereAte: 3.2,
              /* o selo "cena de exemplo" é o do balão da mensagem, que fica sobre a foto (palco.html, .v-foto) */
              selos: [] }
    },
    /* aproxima: depois de assentar, a câmera chega na placa (2x) para o nome a giz ficar legível; vidro: atravessa a lousa */
    /* aproxima (conferência de 11/11, "pulo do gato sub-dimensionado"): de 1,3 a 2,2 s a câmera avança na placa com a
       curva de mola da casa até a madeira da tábua ter ~700 px de largura (largura: px de vídeo do retângulo .cp-tabua, que
       inclui borda e sombra: 830 dá ~700 px de madeira visível, medido no quadro; antes era 2x só depois de 1,95 s,
       e a placa passava a virada com ~360 px). O voo pelo vidro continua o mesmo movimento. */
    cena: { descida: [0.55, 1.05], arraste: { t0: 1.3, t1: 1.56, solta: 1.6, dy: 126 }, aproxima: [1.3, 2.2, { largura: 830 }], vidro: [2.6, 3.15] },
    sessoes: {
      /* prévia real: desce até o nome e para (0,8 s); depois um corte de montagem, com fusão de 0,2 s, leva ao pedido
         (são ~1.400 px de página: rolar isso em menos de 1 s borra). O R7 não promete "sem corte".
         Dia, hora e serviço com rolagens curtas e senoidais (~80 px de vídeo por quadro no máximo). */
      C: { t0: 2.4, t1: 7.15, rolagem: { t0: 3.18, t1: 3.65, alvo: 'nome', y: 120 }, hora: '14h',
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

  /* ------------------------------------------------------------------ R9 · Quem Monta (salão), Órbita 11/11/2026
     Abertura: close 2x na faixa de giz da placa FECHADO real enquanto o giz escreve o nome; a câmera abre em 1,0 s,
     o anel puxa, a placa vira e a câmera atravessa o vidro: atrás dele está a sede 3D real (sede/index.html?modo=demo)
     com o nome na fachada. A comanda passa de mão em mão em 7 planos de 0,8 s (cor e apelido reais da sede), o carimbo
     NO AR bate em 9,1 s e o vídeo corta para a prévia real do salão no celular. Para a faixa de preço da versão de
     anúncio ficar 3,6 s na tela, os tempos do roteiro original (cartão em 12,5 s) foram puxados para o cartão em 11,4 s. */
  var nomeSalao = 'Salão Esmalte Fictício';
  /* comanda: ordem do roteiro; apelido e cor de cada agente vêm da sede (sede/index.html, AGENTS); etapa = passo do
     ciclo da demonstração em que o agente trabalha (DEMO_ETAPAS) */
  var EQUIPE = [
    { id: 'diretor', nick: 'Nimbus', cor: '#FFD23F', faz: 'organiza o pedido', etapa: 0 },
    { id: 'copywriter', nick: 'Verbo', cor: '#FF9F1C', faz: 'escreve os textos', etapa: 1 },
    { id: 'designer', nick: 'Paleta', cor: '#FF8FD1', faz: 'escolhe as cores', etapa: 1 },
    { id: 'frontend', nick: 'Pixel', cor: '#FF6B6B', faz: 'monta o site', etapa: 2 },
    { id: 'qa', nick: 'Lupa', cor: '#EEF2F7', faz: 'testa no celular', etapa: 3 },
    { id: 'seguranca', nick: 'Muralha', cor: '#3D4A7A', faz: 'confere a segurança', etapa: 3 },
    { id: 'devops', nick: 'Trilho', cor: '#8D6E63', faz: 'publica', etapa: 4 }
  ];
  var R9 = {
    codigo: 'R9', nicho: 'salao', nichoRotulo: 'Salao', angulo: 'Quem Monta', nome: nomeSalao, duracao: 15,
    captura: 'sede', palco: 'sede', capa: 3.2,
    hora: '2026-11-11T10:12:00-03:00',
    /* tipo 'placa': sem cena de dor; close de 2x na faixa de giz até 1,0 s, abre até 1,3 s */
    cena: { tipo: 'placa', giz: teclas(nomeSalao, 0.1, 0.04, 0.008, 9), close: { zoom: 2, ate: 1.0, abre: 1.3 },
            /* placa maior que no R7: o limiar do componente (40% de 2/3 da altura) é ~150 px, então o puxão é de 190 px */
            arraste: { t0: 1.34, t1: 1.6, solta: 1.64, dy: 190 }, aproxima: [2.02, 2.42, 2.0], vidro: [2.5, 3.05] },
    /* janela da sede no palco (px do vídeo) e o tamanho da captura (px CSS, escala 2): 860x562 no vídeo = 1:1 */
    janela: { x: 110, y: 548, w: 860, h: 562 },
    sessoes: {
      S: { tipo: 'sede', t0: 2.5, t1: 10.2, janela: { w: 430, h: 281 }, planos: (function () {
        var p = [{ alvo: 'geral', t0: 2.5, t1: 3.4, etapa: 0, dentro: 200, dist: 20.5, alvoY: 0.6, de: 0.95, ate: 0.85, gira: -0.08 }];
        EQUIPE.forEach(function (a, i) { p.push({ alvo: a.id, t0: 3.4 + 0.8 * i, t1: 4.2 + 0.8 * i, etapa: a.etapa, dist: 4.4, sobe: 1.5, de: 1.07, ate: 0.95, gira: 0 }); });
        /* fim: a comanda cobre o terço de baixo da janela; a câmera olha mais baixo para a fachada ficar acima dela */
        p.push({ alvo: 'geral', t0: 9.0, t1: 10.2, etapa: 5, dentro: 600, dist: 20.5, alvoY: -2.6, de: 0.84, ate: 0.79, gira: -0.06 });
        return p;
      })() },
      /* prévia real do salão, topo com o nome (a demonstração sites/demo-salao/ mostra nome de cidade e outro nome) */
      D: { tipo: 'previaTopo', t0: 10.2, t1: 11.4, rolar: { t0: 10.2, t1: 11.4, dy: 70 } }
    },
    equipe: EQUIPE, comanda: [3.4, 10.2], carimbo: 9.12, site: 10.2,
    legendas: [
      [0.0, 1.3, 'Um nome na <k>placa.</k>'],
      [1.3, 2.5, 'Agora, atrás<br>da <k>placa.</k>'],
      [2.5, 3.4, 'Quem monta:<br><k>agentes de IA.</k>'],
      [3.4, 6.6, 'Cada um faz<br>uma <k>parte.</k>'],
      [6.6, 9.0, '<k>Testado</k> no celular<br>antes de sair.'],
      [9.0, 10.2, '<k>No ar.</k>'],
      [10.2, 11.4, 'O site pronto,<br>no <k>celular.</k>'],
      [11.4, 15.0, 'Digite o <k>nome.</k><br>Veja o site pronto']
    ],
    selos: [
      { t0: 0, t1: 11.4, texto: 'Creat Nuvem · Porta Aberta', lugar: 'topo-esq' },
      { t0: 0, t1: 11.4, texto: 'nome fictício', lugar: 'topo-dir' },
      { t0: 2.5, t1: 10.2, texto: 'sede da Creat · demonstração', lugar: 'baixo-2' },
      { t0: 10.2, t1: 11.4, texto: 'prévia · serviços e preços de exemplo', lugar: 'baixo-2' }
    ],
    /* sem porta de aço no cartão: ela já subiu sob o carimbo (roteiro). A faixa de preço fica 3,6 s na tela. */
    cartao: 11.4, cartaoPorta: false
  };

  /* ------------------------------------------------------------------ R12 · O Link da Bio (salão), Órbita 11/11/2026
     Mesma linha do R7 (palco 'dor', captura 'previa'), com a cena de dor do link da bio desenhada pela casa (perfil
     fictício e "Página não encontrada", sem marca de ferramenta real) e o cartão final da campanha de conversa. */
  var R12 = {
    codigo: 'R12', nicho: 'salao', nichoRotulo: 'Salao', angulo: 'O Link da Bio', nome: nomeSalao, duracao: 15,
    captura: 'previa', palco: 'dor', capa: 0.7,
    hora: '2026-11-11T10:12:00-03:00', cliente: 'Camila',
    perfil: { arroba: '@salaoesmalteficticio', bio: 'Unhas, cabelo e sobrancelha.', link: 'salaoesmalte.exemplo/horario' },
    cena: { tipo: 'link', toqueLink: 0.3, erroEm: 0.42, descida: [0.8, 1.24], arraste: { t0: 1.3, t1: 1.56, solta: 1.6, dy: 126 }, aproxima: [1.3, 2.2, { largura: 830 }], vidro: [2.6, 3.15] },
    /* fundo --papel até o cartão (conferência de 11/11: o R12 é o gêmeo mais próximo do R7; o cartão final não muda) */
    fundo: { cor: 'papel' },
    sessoes: {
      /* prévia real do salão: nome, salto de montagem até o pedido, toques no sábado, 14h e Manicure (o serviço real do
         preset; o roteiro dizia "Pé e mão", que a prévia não tem, e 9h, que fica atrás de "Ver manhã") */
      C: { t0: 2.4, t1: 7.15, rolagem: { t0: 3.18, t1: 3.65, alvo: 'nome', y: 120 }, hora: '14h', dia: 'sáb', servico: 'Manicure',
        salto: { t: 4.45, fusao: 0.2, yFita: 118 },
        toques: [
          { t: 4.9, alvo: 'dia', rolarAntes: null },
          { t: 5.65, alvo: 'hora', rolarAntes: [5.05, 5.45] },
          { t: 6.75, alvo: 'servico', rolarAntes: [5.78, 6.62] }
        ] }
    },
    mensagem: 7.15,
    legendas: [
      [0.0, 1.3, 'O link da bio<br>deu em <k>nada.</k>'],
      [1.3, 2.6, 'Vire a <k>placa.</k>'],
      [2.6, 7.15, 'Aqui, o link abre<br>o <k>pedido.</k>'],
      [7.15, 10.0, 'O pedido chega<br>no <k>WhatsApp.</k>'],
      [10.0, 15.0, 'Toque e receba<br>o link no <k>chat.</k>']
    ],
    selos: [
      { t0: 0, t1: 10, texto: 'Creat Nuvem · Porta Aberta', lugar: 'topo-esq' },
      { t0: 0, t1: 10, texto: 'nome fictício', lugar: 'topo-dir' },
      { t0: 3.1, t1: 7.15, texto: 'prévia · serviços e preços de exemplo', lugar: 'baixo-2' }
    ],
    /* campanha de conversa (botão Enviar mensagem): cartão com o balão próprio da vitrine indicando o chat */
    cartao: 10.0, cartaoTipo: 'conversa'
  };

  /* ------------------------------------------------------------------ R10 · Sem Amarra (barbearia), Órbita 11/11/2026
     Abertura do R7 com outra cena antes da placa: uma lousa grande com três caixas vazias (o roteiro: "três linhas antes
     de decidir"). A placa FECHADO real desce na frente, vira, a câmera chega nela e atravessa o vidro: do outro lado,
     a mesma lousa, agora em tamanho de tela, onde o giz escreve as três linhas. Cada linha tem a prova embaixo, um
     recorte vivo da home real (captura 'recortes', escala 3): o formulário sem e-mail nem WhatsApp, o plano com
     "a partir do dia em que o site entra no ar" (valor coberto por tarja de lousa: o preço só aparece na faixa do
     cartão) e "O contrato em 6 linhas". O texto escrito a giz na lousa é a legenda desse trecho (regra: giz sobre
     placa --lousa). Cartão em 11,4 s (era 12 s no roteiro) para a faixa de preço ficar 3,1 s inteira na tela. */
  /* recorte na lousa: o vão de 870x420 px de vídeo mostra 390x188 px CSS da página (2,23 px de vídeo por px CSS,
     abaixo da captura em escala 3: nada é ampliado) */
  var VAO = { x: 105, y: 772, w: 870, h: 420 };
  var R10 = {
    codigo: 'R10', nicho: 'barbearia', nichoRotulo: 'Barbearia', angulo: 'Sem Amarra', nome: nomeR7, duracao: 15,
    /* Conferência de 11/11: o quadro 1 já mostra o motivo. A linha mais forte vem escrita a giz, grande, com o tique de
       feito ("Fidelidade: nenhuma.") numa lousa em tela cheia (sem céu nem balcão até o cartão); a placa desce na frente
       em 0,55 s como antes. Do outro lado do vidro, o giz escreve as linhas 1 e 2 e a 3 já está marcada (pronta). */
    captura: 'recortes', palco: 'lousa', capa: 0.3,
    hora: '2026-11-11T10:12:00-03:00',
    cena: { tipo: 'lousa', descida: [0.55, 1.05], arraste: { t0: 1.3, t1: 1.56, solta: 1.6, dy: 126 }, aproxima: [1.3, 2.2, { largura: 830 }], vidro: [2.5, 3.0] },
    fundo: { cor: 'lousa', balcao: 'oculto', moldura: true },
    /* lousa grande (px do vídeo): a mesma da capa e a do outro lado do vidro */
    lousa: { x: 65, y: 356, w: 950, h: 880 },
    vao: VAO,
    /* as três linhas: rótulo em Lilita One, resto em Figtree 800, giz sobre lousa; o giz escreve de t0 a t1 e o risco de
       "feito" (com tic) entra em "feito". recorte = sessão da captura mostrada no vão enquanto a linha é a da vez */
    linhas: [
      { rotulo: 'Ver:', texto: 'grátis, sem cadastro', t0: 3.05, t1: 3.9, feito: 4.5, recorte: 'R1', entra: 3.0, sai: 4.95 },
      { rotulo: 'Mensalidade:', texto: 'só com o site no ar', quebra: true, t0: 5.0, t1: 5.95, feito: 6.95, recorte: 'R2', entra: 4.95, sai: 7.55 },
      /* pronta: já escrita e marcada desde o quadro 1; em "feito" o tique pulsa (com o tic) enquanto o recorte é a prova */
      { rotulo: 'Fidelidade:', texto: 'nenhuma', t0: 7.6, t1: 8.2, feito: 9.3, recorte: 'R3', entra: 7.55, sai: 9.95, pronta: true }
    ],
    nota: { texto: '7 dias para desistir, pela lei.', t0: 10.0, t1: 10.7 },
    sessoes: {
      /* home real de barbearia com o nome já digitado fora de cena; cada recorte enquadra um trecho da página.
         alvo = elemento que fica "margem" px CSS abaixo do topo do recorte; rolar = rolagem real dentro do recorte;
         realce = trechos de texto real sublinhados a --sol; o valor em reais é coberto por tarja --lousa */
      R1: { tipo: 'recorte', t0: 3.0, t1: 4.95, alvo: 'label[for=nome]', margem: 8, rolar: { t0: 3.95, t1: 4.5, alvo: 'label[for=cidade]', margem: 6 } },
      R2: { tipo: 'recorte', t0: 4.95, t1: 7.55, alvo: '#c-aberto', margem: 14, realce: [{ sel: '#c-aberto ~ .preco', texto: 'a partir do dia em que o site entra no ar' }], realceEm: 5.6 },
      /* corta: o vão termina logo abaixo do último realce ("Sem multa para sair."). A linha 3 do contrato, "O domínio fica
         no seu nome.", não entra em vídeo pago enquanto a cláusula 9 dos termos estiver sendo reescrita
         (textos-troca-unica.md, AN-07). Quando o coordenador confirmar a cláusula no ar, apague "corta" e gere de novo. */
      R3: { tipo: 'recorte', t0: 7.55, t1: 9.95, alvo: '.contrato-bloco h3', margem: 12, realce: [{ sel: '.contrato li:nth-child(1)', texto: 'Sem fidelidade.' }, { sel: '.contrato li:nth-child(2)', texto: 'Sem multa para sair.' }], realceEm: 8.3, corta: 14 }
    },
    recorte: { y: 64, alto: Math.round(VAO.h / (VAO.w / 390)) },
    legendas: [
      [0.0, 1.3, 'Sem <k>fidelidade.</k><br>Sem multa.'],
      [1.3, 2.6, 'Sem <k>amarra.</k>'],
      [11.4, 15.0, 'Digite o <k>nome.</k><br>Veja o site pronto']
    ],
    selos: [
      { t0: 0, t1: 11.4, texto: 'Creat Nuvem · Porta Aberta', lugar: 'topo-esq' },
      { t0: 0.55, t1: 4.95, texto: 'nome fictício', lugar: 'topo-dir' }
    ],
    cartao: 11.4
  };

  /* ------------------------------------------------------------------ R11 · O Pedido Chega no Seu (academia), Órbita 11/11/2026
     Captura 'home' (como o R8) numa sessão só, sem corte até o envio: close no campo do nome recebendo o nome, a câmera
     abre para a placa real, o anel puxa, a placa vira, a câmera recua para o celular e a página real desce até "Teste de
     verdade". O número é de teste (11900000000) e fica coberto pela faixa "número de teste"; serviço, dia e horário são
     escolhidos nas listas reais; o toque em "Enviar o teste para o meu WhatsApp" monta a mensagem REAL do site (lida do
     link que o site abre). Depois, o celular desenhado pela casa (sem logo de aplicativo) com essa mensagem: o anel
     segura o enviar, plim. Cartão da campanha de conversa em 11 s (faixa de preço 3,5 s na tela). */
  var R11 = {
    codigo: 'R11', nicho: 'academia', nichoRotulo: 'Academia', angulo: 'O Pedido Chega no Seu', nome: nomeR8, duracao: 15,
    captura: 'home', palco: 'home', capa: 0,
    hora: '2026-11-11T09:12:00-03:00',
    sessoes: {
      /* topo da página nova (título da academia, campo, chip marcado pelo link, botão e placa); a captura fotografa a
         janela inteira (844 px CSS) porque a placa fica em y 622 a 811 */
      A: { t0: 0, t1: 7.4, inicio: { ancora: 'topo' }, alto: 844,
           teclas: teclas(nomeR8, 0.06, 0.032, 0.006, 11), arraste: { t0: 1.3, t1: 1.56, solta: 1.6, dy: 82 }, relogioParaEm: 1.62,
           /* rolagens reais: alvo fica y px CSS abaixo do topo da janela da página (o celular do vídeo mostra de 330 a 830) */
           rolarHome: [{ t0: 3.05, t1: 4.05, alvo: '#teste-titulo', y: 402, curva: 'trapezio' }, { t0: 4.8, t1: 5.2, alvo: '#teste-servico', y: 430 }],
           campo: { t: 4.22, alvo: '#teste-whats', teclas: teclas('11900000000', 4.33, 0.036, 0.006, 12) },
           escolhas: [{ t: 5.35, alvo: '#teste-servico', valor: 'Aula experimental' }, { t: 5.85, alvo: '#teste-dia', valor: 'amanhã' }, { t: 6.35, alvo: '#teste-hora', valor: '07:00' }],
           toqueEnviar: { t: 6.95, alvo: '#form-teste button[type=submit]' },
           cobrir: [{ sel: '#teste-whats', rotulo: 'número de teste' }] }
    },
    camera: {
      /* close no campo (2,65 px de vídeo por px CSS, abaixo da escala 3 da captura) com o título do nicho em cima;
         de 0,82 a 1,24 s (nome inteiro no campo) a câmera vai para a placa; recuo para o celular de 2,4 a 3,05 s */
      /* Conferência de 11/11: de 0 a 0,5 s, close no título do nicho ("Veja o site da sua academia pronto.", 3,85 px
         de vídeo por px CSS: o maior que mantém o título inteiro entre x 65 e x 1015; "academia pronto." com ~112 px
         de altura, contra ~77 antes). De 0,5 a 0,78 s a câmera desce para o campo, já com o chip "Academia e studio"
         marcado logo abaixo dele; a digitação segue como antes. titulo.cx/cy = centro do quadro em px CSS da página. */
      campo: { s: 2.65, cx: 195, cy: 262, de: 0.5, ate0: 0.78, ate: 0.86, chega: 1.24, titulo: { s: 3.85, cx: 139.5, cy: 155.6 } },
      recuo: [2.4, 3.05], larguraPlaca: 0.70, topo: { A: 330 }, janelaY: 480, desce: []
    },
    /* 7,4 s: corte seco para o celular desenhado pela casa com a mensagem real do teste; o anel segura o enviar */
    mensagem: 7.4, mensagemTipo: 'teste', envio: { segura: 8.25, solta: 8.75 },
    legendas: [
      [0.0, 1.3, 'Digite o nome<br>do <k>negócio.</k>'],
      [1.3, 2.4, 'Vire a <k>placa.</k>'],
      [2.4, 4.9, 'Teste o pedido no<br>seu <k>WhatsApp.</k>'],
      [4.9, 7.4, 'Antes de pagar<br><k>qualquer coisa.</k>'],
      [7.4, 11.0, 'Do jeito que chega<br>do <k>cliente.</k>'],
      [11.0, 15.0, 'Toque e receba<br>o link no <k>chat.</k>']
    ],
    selos: [
      { t0: 0, t1: 11.0, texto: 'Creat Nuvem · Porta Aberta', lugar: 'topo-esq' },
      { t0: 0, t1: 11.0, texto: 'nome fictício', lugar: 'topo-dir' }
    ],
    cartao: 11.0, cartaoTipo: 'conversa'
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
  function somR9() {
    var e = [], c = R9.cena;
    e.push({ t: 0, voz: 'rua', dur: c.vidro[0] + 0.3, nivel: 1 });
    e.push({ t: 0.03, voz: 'corrente', forca: 0.5 });
    c.giz.forEach(function (k) { if (k.ch !== ' ') e.push({ t: k.t, voz: 'giz', forca: 0.6 }); });
    e.push({ t: c.arraste.t0, voz: 'tic', forca: 1 }, { t: c.arraste.t0 + 0.12, voz: 'rangido', forca: 0.8 });
    e.push({ t: c.arraste.solta + GIRO.assenta, voz: 'sino', forca: 1 });
    e.push({ t: c.vidro[0], voz: 'grave', forca: 1 }, { t: c.vidro[0], voz: 'sala', dur: 15 - c.vidro[0] });
    /* um tic de papel a cada corte de plano (a comanda muda de mão); o do Trilho, mais grave */
    R9.sessoes.S.planos.forEach(function (p, i) { if (i > 0 && p.alvo !== 'geral') e.push({ t: p.t0, voz: 'papel', forca: p.alvo === 'devops' ? 1 : 0.8, grave: p.alvo === 'devops' }); });
    e.push({ t: 9.0, voz: 'porta', forca: 0.9 }, { t: R9.carimbo, voz: 'carimbo', forca: 0.6 });
    e.push({ t: R9.cartao + 0.38 + GIRO.assenta, voz: 'sino', forca: 0.45 });
    return e;
  }
  function somR12() {
    var e = [], c = R12.cena;
    e.push({ t: 0, voz: 'sala', dur: c.vidro[0] + 0.3 });
    e.push({ t: c.toqueLink, voz: 'tic', forca: 1 });
    /* silêncio seco na tela vazia; a corrente entra com a placa */
    e.push({ t: c.descida[0] + 0.08, voz: 'corrente', forca: 0.85 }, { t: c.descida[0] + 0.3, voz: 'corrente', forca: 0.6 }, { t: c.descida[1] - 0.02, voz: 'corrente', forca: 0.45 });
    e.push({ t: c.arraste.t0, voz: 'tic', forca: 1 }, { t: c.arraste.t0 + 0.12, voz: 'rangido', forca: 0.8 });
    e.push({ t: c.arraste.solta + GIRO.assenta, voz: 'sino', forca: 1 });
    e.push({ t: c.vidro[0], voz: 'grave', forca: 1 }, { t: 2.4, voz: 'sala', dur: 7.9 });
    R12.sessoes.C.toques.forEach(function (q) { e.push({ t: q.t, voz: 'tic', forca: 0.9 }); });
    e.push({ t: R12.mensagem, voz: 'plim', forca: 1 });
    e.push({ t: R12.cartao, voz: 'porta', forca: 1 }, { t: R12.cartao + 0.4 + GIRO.assenta, voz: 'sino', forca: 0.55 });
    return e;
  }
  /* giz escrevendo um texto de t0 a t1: um risco por letra, no compasso da revelação */
  function gizTexto(e, texto, t0, t1, forca) {
    var n = Array.from(texto).length;
    Array.from(texto).forEach(function (ch, i) { if (ch !== ' ') e.push({ t: t0 + (t1 - t0) * (i + 0.5) / n, voz: 'giz', forca: forca }); });
  }
  function somR10() {
    var e = [], c = R10.cena;
    e.push({ t: 0, voz: 'sala', dur: 15 });
    /* giz batendo na lousa uma vez (a capa) */
    e.push({ t: 0.02, voz: 'giz', forca: 1 }, { t: 0.03, voz: 'tic', forca: 0.45 });
    e.push({ t: c.descida[0] + 0.08, voz: 'corrente', forca: 0.85 }, { t: c.descida[0] + 0.3, voz: 'corrente', forca: 0.6 }, { t: c.descida[1] - 0.02, voz: 'corrente', forca: 0.45 });
    e.push({ t: c.arraste.t0, voz: 'tic', forca: 1 }, { t: c.arraste.t0 + 0.12, voz: 'rangido', forca: 0.8 });
    e.push({ t: c.arraste.solta + GIRO.assenta, voz: 'sino', forca: 1 });
    e.push({ t: c.vidro[0], voz: 'grave', forca: 1 });
    R10.linhas.forEach(function (l) {
      /* linha pronta (já escrita no quadro 1): sem giz; só o tic do pulso do tique, em "feito" */
      if (l.pronta) { e.push({ t: l.feito, voz: 'tic', forca: 1 }); return; }
      var meio = l.t0 + (l.t1 - l.t0) * Array.from(l.rotulo).length / Array.from(l.rotulo + ' ' + l.texto).length;
      gizTexto(e, l.rotulo, l.t0, meio, 0.75); gizTexto(e, l.texto, meio, l.t1, 0.75);
      e.push({ t: l.feito, voz: 'tic', forca: 1 }, { t: l.feito + 0.02, voz: 'giz', forca: 0.9 });
    });
    gizTexto(e, R10.nota.texto, R10.nota.t0, R10.nota.t1, 0.45);
    e.push({ t: R10.cartao, voz: 'porta', forca: 1 }, { t: R10.cartao + 0.4 + GIRO.assenta, voz: 'sino', forca: 0.55 });
    return e;
  }
  function somR11() {
    var e = [], A = R11.sessoes.A;
    e.push({ t: 0, voz: 'rua', dur: 2.6, nivel: 1 });
    A.teclas.forEach(function (k) { e.push({ t: k.t, voz: 'tecla', forca: 0.5 }); if (k.ch !== ' ') e.push({ t: k.t + 0.004, voz: 'giz', forca: 0.5 }); });
    e.push({ t: R11.camera.campo.ate + 0.05, voz: 'corrente', forca: 0.6 });
    e.push({ t: A.arraste.t0, voz: 'tic', forca: 1 }, { t: A.arraste.t0 + 0.12, voz: 'rangido', forca: 0.8 });
    e.push({ t: A.arraste.solta + GIRO.assenta, voz: 'sino', forca: 1 });
    e.push({ t: 2.3, voz: 'sala', dur: 12.7 });
    e.push({ t: A.campo.t, voz: 'tic', forca: 0.9 });
    A.campo.teclas.forEach(function (k) { e.push({ t: k.t, voz: 'tecla', forca: 0.45 }); });
    A.escolhas.forEach(function (q) { e.push({ t: q.t, voz: 'tic', forca: 0.9 }); });
    e.push({ t: A.toqueEnviar.t, voz: 'tic', forca: 1 }, { t: A.toqueEnviar.t + 0.02, voz: 'grave', forca: 0.8 });
    e.push({ t: R11.envio.segura, voz: 'tic', forca: 0.8 }, { t: R11.envio.solta, voz: 'plim', forca: 1 });
    e.push({ t: R11.cartao, voz: 'porta', forca: 1 }, { t: R11.cartao + 0.4 + GIRO.assenta, voz: 'sino', forca: 0.55 });
    return e;
  }
  /* tom grave de "lado de dentro" no quadro em que a prévia aparece (medido na captura: meta.sessoes.B.previaEm) */
  R8.graveEm = 7.37;
  R8.som = somR8(); R7.som = somR7(); R9.som = somR9(); R12.som = somR12(); R10.som = somR10(); R11.som = somR11();

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
    nomeArquivo: nomeArquivo, capaArquivo: capaArquivo, REELS: ['R7', 'R8', 'R9', 'R10', 'R11', 'R12'], R8: R8, R7: R7, R9: R9, R10: R10, R11: R11, R12: R12 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else raiz.LINHAS = API;
})(typeof window !== 'undefined' ? window : globalThis);
