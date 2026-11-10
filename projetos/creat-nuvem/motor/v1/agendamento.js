/*
 * motor/v1/agendamento.js · "Pedir horário" do motor v1 (nasce do agendamento.js do Fio no Couro)
 *
 * Fluxo: fita de dias → horário → serviço que cabe → profissional (se houver) → nome e WhatsApp
 * → ritual de confirmar (tira do nicho) ou "Enviar sem arrastar" → mensagem pronta no WhatsApp.
 *
 * Regras (briefing 7.2, regra dura 1):
 *  - Nunca promete confirmação: o texto diz que o dono confirma pelo WhatsApp.
 *  - Não existe horário "ocupado": o motor não conhece a agenda do dono e não inventa.
 *  - Dados do cliente final só no aparelho ('site:<slug>:cliente'), com "Esquecer meus dados".
 *  - Prévia (meta.previa = true): o último campo é o WhatsApp de TESTE do visitante; o número
 *    fica só na memória da página (nem localStorage, nem analytics, nem postMessage).
 *  - Site entregue: abre wa.me/<negocio.whatsapp>.
 *  - agendamento.modo = 'link_externo': no lugar do fluxo, um botão "Agendar" para urlExterna.
 *
 * Script clássico; registra-se em CreatMotor.registrarModulo('agendamento', fn).
 * Eventos: dispara 'motor:pedido' {previa, nicho} (sem dado pessoal); ouve 'ritual:confirmar'.
 * Na prévia avisa a página-mãe por postMessage {tipo:'creat:previa', evento:'reserva_teste', nicho}.
 *
 * Onda 3 (pacote 3B, 10/11/2026):
 *  - Demonstração (CREAT_SITE.demonstracao): a mensagem começa com "Testei a demonstração de <nicho> da
 *    Creat (<nome>). Simulação: " e termina com " Quero saber como ter um site assim.", para a Creat saber
 *    que é lead de demo. O botão flutuante e o WhatsApp do rodapé levam "Vi a demonstração de ...".
 *    Site de cliente nunca leva esse texto; a prévia continua com "Teste da prévia do site: ".
 *  - A mensagem usa o dia da semana ("quarta, 11/11 às 14h"); "hoje" e "amanhã" ficam só na tela.
 *  - Horários agrupados por turno (Manhã, Tarde, Noite); só o turno com mais vagas abre, os outros
 *    ficam em "Ver tarde (12)". Fita de dias com máscara de fade na borda que ainda rola.
 *  - Relógio do negócio: CreatMotor.agoraNoNegocio() (fuso do tenant), com reserva para new Date().
 *  - window.CreatAgendamento.escolherServico(id): o "Pedir este" da tabela de serviços pré-seleciona.
 *  - Preço sem valor: classe "preco is-consulta". Na demonstração o valor leva "(exemplo)".
 *  - Barra do navegador: meta theme-color[data-barra] segue a cor real da faixa do topo e o botão de tema.
 *  Funções puras em CreatAgendamento._puro (e module.exports no Node, para os testes).
 */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : null;

  /* ===================== funções puras (testadas em scripts/testes/agendamento.test.mjs) ===================== */
  var DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var NICHO_NOME = { barbearia: 'barbearia', salao: 'salão', academia: 'academia' };
  var TURNOS = [
    { id: 'manha', rotulo: 'Manhã', ate: 12 * 60 },
    { id: 'tarde', rotulo: 'Tarde', ate: 18 * 60 },
    { id: 'noite', rotulo: 'Noite', ate: 24 * 60 + 1 }
  ];
  var TXT = {
    prefixoTeste: 'Teste da prévia do site: ',
    prefixoDemo: 'Testei a demonstração de {nicho} da Creat ({nome}). Simulação: ',
    sufixoDemo: ' Quero saber como ter um site assim.',
    flutuanteDemo: 'Vi a demonstração de {nicho} da Creat ({nome}). Quero saber como ter um site assim.'
  };
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function trocar(s, v) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? String(v[k]) : m; }); }
  /* "barbearia", "salão", "academia"; nicho novo cai no rótulo do preset em minúsculas */
  function nomeDoNicho(nicho, rotulo) {
    if (Object.prototype.hasOwnProperty.call(NICHO_NOME, nicho)) return NICHO_NOME[nicho];
    var r = String(rotulo || '').trim();
    return r ? r.charAt(0).toLowerCase() + r.slice(1) : String(nicho || 'negócio');
  }
  /* "quarta, 11/11": a mensagem fica certa mesmo lida no dia seguinte */
  function diaDaMensagem(d) { return DIAS_SEMANA[d.getDay()] + ', ' + pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1); }
  /* o = { previa, demonstracao, nicho, rotulo, nome } */
  function mensagemFinal(base, o) {
    o = o || {};
    if (o.previa) return TXT.prefixoTeste + base;
    if (o.demonstracao === true) return trocar(TXT.prefixoDemo, { nicho: nomeDoNicho(o.nicho, o.rotulo), nome: String(o.nome || '').trim() || 'nome fictício' }) + base + TXT.sufixoDemo;
    return base;
  }
  function mensagemFlutuante(o) {
    o = o || {};
    return trocar(TXT.flutuanteDemo, { nicho: nomeDoNicho(o.nicho, o.rotulo), nome: String(o.nome || '').trim() || 'nome fictício' });
  }
  function turnoDe(min) { for (var i = 0; i < TURNOS.length; i++) if (min < TURNOS[i].ate) return TURNOS[i]; return TURNOS[TURNOS.length - 1]; }
  /* [min] -> [{ id, rotulo, horarios:[min] }], só turnos com horário, na ordem do dia */
  function agruparTurnos(horarios) {
    var g = {};
    (horarios || []).forEach(function (t) { var x = turnoDe(t); (g[x.id] = g[x.id] || { id: x.id, rotulo: x.rotulo, horarios: [] }).horarios.push(t); });
    return TURNOS.map(function (x) { return g[x.id]; }).filter(Boolean);
  }
  /* turno aberto: o do horário escolhido; senão o de mais vagas (empate: o mais cedo) */
  function turnoAberto(grupos, hora) {
    if (!grupos || !grupos.length) return null;
    if (hora != null) for (var i = 0; i < grupos.length; i++) if (grupos[i].horarios.indexOf(hora) !== -1) return grupos[i].id;
    var m = grupos[0];
    grupos.forEach(function (x) { if (x.horarios.length > m.horarios.length) m = x; });
    return m.id;
  }
  function classePreco(preco) { return 'preco' + (preco === null || preco === undefined ? ' is-consulta' : ''); }
  /* o que CreatMotor.agoraNoNegocio() devolver -> Date com o relógio de parede do negócio.
     Aceita Date, ou { ano, mes (1 a 12), dia, hora, minuto, diaSemana? }; diaSemana confere o mês. */
  function dataDoRelogio(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (!v || typeof v !== 'object') return null;
    var a = +v.ano, m = +v.mes, d = +v.dia, h = +(v.hora || 0), mi = +(v.minuto || 0);
    if (![a, m, d, h, mi].every(isFinite)) return null;
    var x = new Date(a, m - 1, d, h, mi, +(v.segundo || 0) || 0);
    var ds = v.diaSemana != null ? +v.diaSemana : null;
    if (ds !== null && isFinite(ds) && x.getDay() !== ds) {
      var y = new Date(a, m, d, h, mi);                     // mês contado de 0
      if (y.getDay() === ds) x = y;
    }
    return isNaN(x.getTime()) ? null : x;
  }
  var PURO = {
    TXT: TXT, TURNOS: TURNOS, nomeDoNicho: nomeDoNicho, diaDaMensagem: diaDaMensagem, mensagemFinal: mensagemFinal,
    mensagemFlutuante: mensagemFlutuante, turnoDe: turnoDe, agruparTurnos: agruparTurnos, turnoAberto: turnoAberto,
    classePreco: classePreco, dataDoRelogio: dataDoRelogio
  };
  if (typeof module === 'object' && module && module.exports) module.exports = PURO;

  if (!W || !W.document) return;
  /* "Pedir este" (motor) pode chegar antes do módulo montar: guarda o pedido e aplica na montagem */
  var pendenteServico = null, aplicarServico = null;
  W.CreatAgendamento = {
    escolherServico: function (id) {
      id = String(id == null ? '' : id);
      if (!id) return false;
      if (aplicarServico) return aplicarServico(id);
      pendenteServico = id;
      return true;
    },
    _puro: PURO
  };
  if (!W.CreatMotor || !W.CreatMotor.registrarModulo) return;
  var DOC = W.document;

  var T = {
    passoDia: 'Escolha o dia',
    passoHora: 'Escolha o horário',
    passoServico: 'O que cabe nesse horário',
    passoProfissional: 'Com quem?',
    passoDados: 'Seus dados',
    fitaRotulo: 'Próximos {n} dias',
    hoje: 'hoje',
    fechado: 'fechado',
    encerrado: 'encerrado',
    semHorarioHoje: 'Hoje não tem mais horário para pedir.',
    semHorarioDia: 'Esse dia não tem horário para pedir.',
    verDia: 'Ver horários de {dia}',
    naoCabe: 'não cabe até o fechamento',
    nome: 'Seu nome',
    whats: 'Seu WhatsApp',
    whatsTeste: 'Seu WhatsApp para receber o teste',
    whatsExemplo: '({ddd}) 91234-5678',     // {ddd} = DDD do WhatsApp do negócio (11 se não houver)
    privacidade: 'Seu nome e seu WhatsApp ficam só neste aparelho, para preencher mais rápido da próxima vez.',
    privacidadePrevia: 'Na prévia, o pedido vai para o seu próprio WhatsApp. No site no ar, vai para o WhatsApp do negócio. Seu número não é salvo nem enviado para ninguém.',
    esquecer: 'Esquecer meus dados',
    esquecido: 'Pronto: seu nome e seu WhatsApp saíram deste aparelho.',
    esquecidoPrevia: 'Pronto: os campos foram limpos. Na prévia nada fica salvo.',
    resumoTitulo: 'Seu pedido',
    resumoVazio: 'Escolha o dia e o horário. O resto aparece aqui.',
    dia: 'Dia', hora: 'Horário', servico: 'Serviço', profissional: 'Profissional', valor: 'Valor',
    semArrastar: 'Enviar sem arrastar',
    erroNome: 'Escreva seu nome.',
    erroWhats: 'Digite o WhatsApp com DDD, por exemplo {exemplo}.',
    erroAmbos: 'Confira seu nome e seu WhatsApp.',
    erroEscolha: 'Falta escolher {falta}.',
    erroHorario: 'Esse horário já passou. Escolha outro, por favor.',
    erroSemWhatsNegocio: 'Este site ainda não tem o WhatsApp do negócio. Tente de novo mais tarde.',
    abrirWhats: 'Enviar no WhatsApp',
    abrirWhatsTeste: 'Abrir o teste no meu WhatsApp',
    novo: 'Pedir outro horário',
    deSempre: 'O de sempre',
    deSempreNota: 'Serviço escolhido. Agora escolha o dia e o horário.',
    prefixoTeste: TXT.prefixoTeste,
    externoNota: 'Abre a página de horários que o negócio já usa.',
    verTurno: 'Ver {turno} ({n})',
    servicoPedido: '{servico} escolhido. Agora escolha o dia e o horário.',
    exemplo: ' (exemplo)'
  };

  /* ---------- barra do navegador: theme-color = cor real da faixa do topo (claro, escuro e botão de tema) ---------- */
  var tela = null;
  function corDoPixel(cor) {
    try {
      if (!tela) { tela = DOC.createElement('canvas'); tela.width = tela.height = 1; }
      var c = tela.getContext('2d', { willReadFrequently: true });
      if (!c) return '';
      c.clearRect(0, 0, 1, 1);
      c.fillStyle = '#000';
      c.fillStyle = cor;
      c.fillRect(0, 0, 1, 1);
      var p = c.getImageData(0, 0, 1, 1).data;
      if (p[3] < 250) return '';
      return '#' + [p[0], p[1], p[2]].map(function (n) { return (n < 16 ? '0' : '') + n.toString(16); }).join('').toUpperCase();
    } catch (er) { return ''; }
  }
  /* a primeira faixa da página, não importa a rolagem: rascunho, demonstração ou prévia, senão o topo */
  var FAIXAS = ['[data-rascunho-faixa]', '#motor-raiz [data-demonstracao]', '#motor-raiz .faixa-previa', '#motor-raiz .topo'];
  function corDoTopo() {
    var el = null;
    for (var i = 0; i < FAIXAS.length && !el; i++) el = DOC.querySelector(FAIXAS[i]);
    for (; el && el.nodeType === 1; el = el.parentElement) {
      var bg = W.getComputedStyle(el).backgroundColor;
      if (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)) { var h = corDoPixel(bg); if (h) return h; }
    }
    return corDoPixel(W.getComputedStyle(DOC.body).backgroundColor) || corDoPixel(W.getComputedStyle(DOC.documentElement).backgroundColor);
  }
  function pintarBarra() {
    var metas = DOC.querySelectorAll('meta[name="theme-color"][data-barra]');
    if (!metas.length) return;
    var cor = corDoTopo();
    if (!cor) return;
    Array.prototype.forEach.call(metas, function (m) { if (m.getAttribute('content') !== cor) m.setAttribute('content', cor); });
  }
  function vigiarBarra() {
    if (!DOC.querySelector('meta[name="theme-color"][data-barra]')) return;
    var depois = function () {
      try { W.requestAnimationFrame(pintarBarra); } catch (er) { pintarBarra(); }
      setTimeout(pintarBarra, 400);
    };
    depois();
    W.addEventListener('motor:tema', depois);
    W.addEventListener('load', depois, { once: true });
    try {
      var mq = W.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', depois);
    } catch (er) {}
  }

  W.CreatMotor.registrarModulo('agendamento', function (ctx) {
    var e = ctx.estado, P = ctx.puro, criar = ctx.criar, armazem = ctx.armazem;
    try { vigiarBarra(); } catch (er) {}
    var demo = !e.previa && e.demonstracao === true;
    var dadosDemo = { nicho: e.nicho, rotulo: e.rotuloNicho, nome: e.nome };
    /* demonstração: botão flutuante e WhatsApp do rodapé dizem que vieram da demo (o motor monta com waBase puro) */
    if (demo && e.contato && e.contato.whatsapp && e.contato.waBase) {
      var hrefDemo = P.urlWhats(e.contato.whatsapp, mensagemFlutuante(dadosDemo));
      Array.prototype.forEach.call(DOC.querySelectorAll('#motor-raiz a[href]'), function (a) {
        if (a.getAttribute('href') === e.contato.waBase) a.setAttribute('href', hrefDemo);
      });
    }
    var corpo = DOC.getElementById('pedir-corpo');
    if (!corpo) return;

    if (e.pedido.modo === 'link_externo') { montarExterno(); return; }

    var previa = e.previa;
    var exemplo = previa || demo;          // prévia e demonstração: preço de exemplo
    // exemplo de WhatsApp com o DDD do negócio (75 na Bahia, não 11 de São Paulo)
    var dddNegocio = (/^55(\d{2})\d{8,9}$/.exec(String((e.contato && e.contato.whatsapp) || '')) || [])[1] || '11';
    var whatsExemplo = T.whatsExemplo.replace('{ddd}', dddNegocio);
    var erroWhats = T.erroWhats.replace('{exemplo}', whatsExemplo);
    var servicos = e.servicos;
    var profs = e.profissionais;
    var temProf = profs.length > 0;
    var ritual = ctx.ritual;
    var reduz = ctx.reduzMovimento;
    var est = {
      dia: null, hora: null, servicoId: null, profissionalId: null, servicoPendente: null,
      nome: '', whats: '', tocado: { nome: false, whats: false }, tentou: false, enviando: false
    };
    var revelado = { profissional: false, dados: false };
    var tiraCriada = false;
    var turnosDia = null, turnosAbertos = {};

    function $(id) { return DOC.getElementById(id); }
    function limpar(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
    function mostrar(el, sim) { if (el) el.hidden = !sim; }
    /* relógio de parede do negócio (fuso do tenant): o visitante de Manaus vê os horários da Bahia */
    function agora() {
      var M = W.CreatMotor;
      if (M && typeof M.agoraNoNegocio === 'function') {
        try { var d = dataDoRelogio(M.agoraNoNegocio()); if (d) return d; } catch (er) {}
      }
      return new Date();
    }
    function servicoPorId(id) { return servicos.filter(function (s) { return s.id === id; })[0] || null; }
    function profPorId(id) { return profs.filter(function (p) { return p.id === id; })[0] || null; }
    function maiuscula(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

    /* ---------- dados guardados (só site entregue) ---------- */
    function lerCliente() {
      if (previa) return null;
      try {
        var o = JSON.parse(armazem.ler('cliente') || 'null');
        return o && typeof o === 'object' ? o : null;
      } catch (er) { return null; }
    }
    function gravarCliente(o) { if (!previa) armazem.gravar('cliente', JSON.stringify(o)); }

    /* ---------- marcação ---------- */
    function passo(id, legenda, filhos, escondido) {
      var f = criar('fieldset', { classe: 'passo', id: id, hidden: !!escondido }, [criar('legend', { id: id + '-titulo', texto: legenda })]);
      (filhos || []).forEach(function (c) { if (c) f.appendChild(c); });
      return f;
    }
    function campo(id, rotulo, attrs) {
      var a = { id: id };
      Object.keys(attrs).forEach(function (k) { a[k] = attrs[k]; });
      a['aria-describedby'] = 'erro-' + id;
      return criar('div', { classe: 'campo' }, [
        criar('label', { 'for': id, texto: rotulo }),
        criar('input', a),
        criar('p', { classe: 'erro', id: 'erro-' + id, 'aria-live': 'polite' })
      ]);
    }

    var form = criar('form', { id: 'form-pedido', classe: 'agendar-grade', novalidate: true });
    var escolhas = criar('div', { classe: 'agendar-escolhas' });
    escolhas.appendChild(criar('button', { type: 'button', id: 'atalho-sempre', classe: 'atalho-sempre', hidden: true }));
    escolhas.appendChild(criar('p', { id: 'atalho-nota', classe: 'nota atalho-nota', 'aria-live': 'polite' }));
    escolhas.appendChild(passo('passo-dia', T.passoDia, [
      criar('div', { id: 'fita-dias', classe: 'fita-dias', role: 'group', 'aria-labelledby': 'passo-dia-titulo' })
    ]));
    escolhas.appendChild(passo('passo-hora', T.passoHora, [
      criar('div', { id: 'lista-horarios', classe: 'horarios-turnos', role: 'group', 'aria-labelledby': 'passo-hora-titulo' }),
      criar('div', { id: 'aviso-dia', classe: 'aviso-dia', 'aria-live': 'polite', hidden: true })
    ]));
    escolhas.appendChild(passo('passo-servico', T.passoServico, [
      criar('div', { id: 'lista-servicos', classe: 'servicos-cabem', role: 'radiogroup', 'aria-labelledby': 'passo-servico-titulo' })
    ], true));
    if (temProf) escolhas.appendChild(passo('passo-profissional', T.passoProfissional, [
      criar('div', { id: 'chips-profissionais', classe: 'chips', role: 'group', 'aria-labelledby': 'passo-profissional-titulo' })
    ], true));
    escolhas.appendChild(passo('passo-dados', T.passoDados, [
      campo('cliente-nome', T.nome, { name: 'nome', type: 'text', autocomplete: previa ? 'off' : 'name', maxlength: '60', required: true }),
      campo('cliente-whats', previa ? T.whatsTeste : T.whats, { name: 'whats', type: 'tel', inputmode: 'tel', autocomplete: previa ? 'off' : 'tel-national', placeholder: whatsExemplo, required: true }),
      criar('div', { classe: 'privacidade' }, [
        criar('p', { classe: 'nota', id: 'nota-privacidade', texto: previa ? T.privacidadePrevia : T.privacidade }),
        criar('button', { type: 'button', id: 'esquecer-dados', classe: 'btn-esquecer', 'aria-describedby': 'nota-privacidade', texto: T.esquecer }),
        criar('p', { classe: 'nota', id: 'nota-esquecer', 'aria-live': 'polite' })
      ])
    ], true));
    form.appendChild(escolhas);

    var resumo = criar('div', { classe: 'agendar-resumo' }, [
      criar('div', { id: 'resumo-escolha', classe: 'resumo-escolha', 'aria-live': 'polite' }, [
        criar('h3', { texto: T.resumoTitulo }), criar('div', { id: 'resumo-corpo' })
      ]),
      criar('div', { id: 'bloco-confirmar', hidden: true }, [
        criar('div', { id: 'tira-confirmar' }),
        criar('button', { type: 'submit', id: 'confirmar-sem-arrastar', classe: 'btn-sem-arrastar', texto: (e.ritualTextos && e.ritualTextos.semArrastar) || T.semArrastar }),
        criar('p', { classe: 'erro', id: 'erro-geral', role: 'alert' })
      ])
    ]);
    form.appendChild(resumo);
    corpo.appendChild(form);

    /* demonstração: a chamada de compra do espelho (.oferta-demo) e o texto do espelho são do motor (3A) */
    var espelho = criar('section', { id: 'espelho', classe: 'espelho', hidden: true, tabindex: '-1', 'aria-labelledby': 'espelho-titulo' }, [
      criar('h3', { id: 'espelho-titulo', texto: e.textos.confirmacaoTitulo }),
      criar('p', { classe: 'espelho-texto', texto: e.textos.confirmacaoTexto }),
      criar('dl', { id: 'espelho-dados' }),
      criar('a', { id: 'espelho-whats', classe: 'link-whats', target: '_blank', rel: 'noopener', texto: previa ? T.abrirWhatsTeste : T.abrirWhats }),
      criar('button', { type: 'button', id: 'espelho-novo', classe: 'btn btn-secundario', texto: T.novo })
    ]);
    corpo.appendChild(espelho);

    var inputNome = $('cliente-nome'), inputWhats = $('cliente-whats');

    /* ---------- fita de dias ---------- */
    function diasDaFita() {
      var n = Math.max(1, Math.min(14, +e.funcionamento.diasNaFita || 7)), hoje = agora(), out = [];
      for (var i = 0; i < n; i++) out.push(P.resumoDia(e.funcionamento, servicos, P.chaveData(P.somarDias(hoje, i)), hoje));
      return out;
    }
    function primeiroDiaComHorario(lista) {
      for (var i = 0; i < lista.length; i++) if (lista[i].livres > 0) return lista[i].chave;
      return null;
    }
    function renderFita() {
      var fita = $('fita-dias');
      var dias = diasDaFita();
      fita.setAttribute('aria-label', P.fmt(T.fitaRotulo, { n: dias.length }));
      if (!est.dia || !dias.some(function (r) { return r.chave === est.dia && r.livres > 0; })) est.dia = primeiroDiaComHorario(dias);
      limpar(fita);
      var hoje = agora();
      var focoPronto = false;
      dias.forEach(function (r) {
        var ehHoje = P.diferencaDias(hoje, r.data) === 0;
        var b = criar('button', { type: 'button', classe: 'dia' + (ehHoje ? ' is-hoje' : '') + (!r.aberto ? ' is-folga' : ''), 'data-dia': r.chave });
        b.appendChild(criar('span', { classe: 'semana', texto: P.DIAS_CURTO[r.data.getDay()] }));
        b.appendChild(criar('strong', { classe: 'num', texto: String(r.data.getDate()) }));
        var nota = !r.aberto ? T.fechado : r.livres === 0 ? T.encerrado : ehHoje ? T.hoje : '';
        if (nota) b.appendChild(criar('small', { classe: 'nota-dia', texto: nota }));
        if (r.livres === 0) b.setAttribute('aria-disabled', 'true');
        var sel = r.chave === est.dia;
        b.setAttribute('aria-pressed', sel ? 'true' : 'false');
        b.setAttribute('aria-label', P.diaLongo(r.data, hoje) + (nota && nota !== T.hoje ? ', ' + nota : ''));
        b.tabIndex = sel ? 0 : -1;
        if (sel) focoPronto = true;
        fita.appendChild(b);
      });
      if (!focoPronto) { var p = fita.querySelector('.dia:not([aria-disabled="true"])') || fita.querySelector('.dia'); if (p) p.tabIndex = 0; }
      mascararFita();
    }
    /* fita que rola: fade de 24 px só na borda que ainda tem dia escondido (estilo no próprio elemento,
       pelo CSSOM, que a CSP aceita; o atributo style seria bloqueado) */
    function mascararFita() {
      var fita = $('fita-dias');
      if (!fita || !fita.style) return;
      if (fita.style.getPropertyValue('scroll-snap-type') !== 'x mandatory') fita.style.setProperty('scroll-snap-type', 'x mandatory');
      var max = fita.scrollWidth - fita.clientWidth;
      var esq = fita.scrollLeft > 2, dir = max > 2 && fita.scrollLeft < max - 2;
      var m = !esq && !dir ? '' : 'linear-gradient(to right, ' + (esq ? 'transparent 0, #000 24px' : '#000 0') + ', ' + (dir ? '#000 calc(100% - 24px), transparent 100%' : '#000 100%') + ')';
      if (fita.getAttribute('data-mascara') === m) return;
      fita.setAttribute('data-mascara', m);
      if (m) { fita.style.setProperty('-webkit-mask-image', m); fita.style.setProperty('mask-image', m); }
      else { fita.style.removeProperty('-webkit-mask-image'); fita.style.removeProperty('mask-image'); }
    }
    function botoesDia() { return Array.prototype.slice.call($('fita-dias').querySelectorAll('.dia')); }
    function selecionarDia(chave, opc) {
      var r = P.resumoDia(e.funcionamento, servicos, chave, agora());
      if (!r.livres) return;
      if (est.dia !== chave) est.hora = null;
      est.dia = chave;
      botoesDia().forEach(function (b) {
        var sel = b.getAttribute('data-dia') === chave;
        b.setAttribute('aria-pressed', sel ? 'true' : 'false');
        b.tabIndex = sel ? 0 : -1;
        if (sel) {
          try { b.scrollIntoView({ inline: 'nearest', block: 'nearest' }); } catch (er) {}
          if (opc && opc.foco) b.focus();
        }
      });
      renderHorarios();
      depoisDeEscolher();
    }

    /* ---------- horários (nenhum "ocupado": o motor não inventa agenda) ---------- */
    function renderHorarios() {
      var lista = $('lista-horarios'), aviso = $('aviso-dia');
      limpar(lista); limpar(aviso); mostrar(aviso, false);
      var hoje = agora();
      if (!est.dia) {
        aviso.appendChild(criar('p', { texto: T.semHorarioDia }));
        mostrar(aviso, true);
        return;
      }
      var r = P.resumoDia(e.funcionamento, servicos, est.dia, hoje);
      var valida = false;
      if (turnosDia !== est.dia) { turnosDia = est.dia; turnosAbertos = {}; }
      var grupos = agruparTurnos(r.horarios);
      var aberto = turnoAberto(grupos, r.horarios.indexOf(est.hora) !== -1 ? est.hora : null);
      if (aberto) turnosAbertos[aberto] = true;
      lista.style.setProperty('display', 'grid');
      lista.style.setProperty('gap', 'var(--esp-4, 1rem)');
      grupos.forEach(function (g) {
        var idT = 'turno-' + g.id, idH = idT + '-horarios';
        var bloco = criar('div', { classe: 'turno', role: 'group', 'aria-labelledby': idT + '-titulo', 'data-turno': g.id });
        var tit = criar('p', { id: idT + '-titulo', classe: 'turno-titulo', texto: g.rotulo });
        [['font-family', 'var(--fonte-dado)'], ['font-size', 'var(--t-nota, 0.8125rem)'], ['font-weight', '600'], ['letter-spacing', '0.08em'],
          ['text-transform', 'uppercase'], ['color', 'var(--tinta-suave)'], ['margin', '0 0 var(--esp-2, 0.5rem)']].forEach(function (x) { tit.style.setProperty(x[0], x[1]); });
        bloco.appendChild(tit);
        var grade = criar('div', { id: idH, classe: 'horarios', hidden: !turnosAbertos[g.id] });
        g.horarios.forEach(function (t) {
          var b = criar('button', { type: 'button', classe: 'horario', 'data-hora': P.minParaHHMM(t) }, [criar('span', { classe: 'hora', texto: P.horaTexto(t) })]);
          var sel = t === est.hora;
          if (sel) valida = true;
          b.setAttribute('aria-pressed', sel ? 'true' : 'false');
          grade.appendChild(b);
        });
        bloco.appendChild(grade);
        if (!turnosAbertos[g.id]) {
          var nomeT = g.rotulo.toLowerCase();
          var ver = criar('button', { type: 'button', classe: 'btn-link ver-turno', 'aria-expanded': 'false', 'aria-controls': idH, 'data-ver-turno': g.id, texto: P.fmt(T.verTurno, { turno: nomeT, n: g.horarios.length }) });
          bloco.appendChild(ver);
        }
        lista.appendChild(bloco);
      });
      if (!valida) est.hora = null;
      tabindexHorarios();
      if (!r.horarios.length) {
        var ehHoje = P.diferencaDias(hoje, r.data) === 0;
        aviso.appendChild(criar('p', { texto: ehHoje ? T.semHorarioHoje : T.semHorarioDia }));
        var prox = null, dias = diasDaFita();
        for (var i = 0; i < dias.length; i++) if (dias[i].livres && dias[i].chave > est.dia) { prox = dias[i]; break; }
        if (prox) {
          var ir = criar('button', { type: 'button', classe: 'btn-link', texto: P.fmt(T.verDia, { dia: P.diaRelativo(prox.data, hoje) }) });
          ir.addEventListener('click', function () { selecionarDia(prox.chave, { foco: true }); });
          aviso.appendChild(ir);
        }
        mostrar(aviso, true);
      }
    }
    /* só os horários que estão na tela (turno recolhido fica de fora da navegação por setas) */
    function botoesHora() { return Array.prototype.slice.call($('lista-horarios').querySelectorAll('.horarios:not([hidden]) .horario')); }
    function abrirTurno(id, foco) {
      turnosAbertos[id] = true;
      var g = $('turno-' + id + '-horarios');
      if (g) g.hidden = false;
      var ver = $('lista-horarios').querySelector('[data-ver-turno="' + id + '"]');
      if (ver && ver.parentNode) ver.parentNode.removeChild(ver);
      tabindexHorarios();
      if (foco && g) { var b = g.querySelector('.horario'); if (b) b.focus(); }
    }
    function tabindexHorarios() {
      var bs = botoesHora();
      var alvo = bs.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0] || bs[0];
      bs.forEach(function (b) { b.tabIndex = b === alvo ? 0 : -1; });
    }
    function colunas(bs) {
      if (!bs.length) return 1;
      var topo = bs[0].offsetTop, n = 0;
      while (n < bs.length && bs[n].offsetTop === topo) n++;
      return Math.max(1, n);
    }
    function selecionarHora(t) {
      est.hora = t;
      botoesHora().forEach(function (b) { b.setAttribute('aria-pressed', P.hm(b.getAttribute('data-hora')) === t ? 'true' : 'false'); });
      tabindexHorarios();
      if (est.servicoPendente) {
        var sp = est.servicoPendente;
        est.servicoPendente = null;
        if (cabe(sp)) { est.servicoId = sp; notaAtalho(''); }
        else notaAtalho(((servicoPorId(sp) || {}).nome || 'Esse serviço') + ' não cabe nesse horário. Escolha outro serviço ou outro horário.');
      }
      depoisDeEscolher();
    }

    /* ---------- serviços que cabem até o fechamento ---------- */
    function fechaDoDia() {
      var h = est.dia ? P.horarioDoDia(e.funcionamento, P.dataDaChave(est.dia).getDay()) : null;
      return h ? h.fecha : null;
    }
    function cabe(id) {
      var f = fechaDoDia();
      if (est.hora == null || f == null) return false;
      var s = servicoPorId(id);
      return !!s && est.hora + s.duracaoMin <= f;
    }
    function renderServicos() {
      var passoEl = $('passo-servico'), c = $('lista-servicos');
      var focoDentro = DOC.activeElement && c.contains(DOC.activeElement);
      limpar(c);
      var f = fechaDoDia();
      if (est.hora == null || f == null) { mostrar(passoEl, false); return; }
      mostrar(passoEl, true);
      var lista = P.servicosQueCabem(servicos, est.hora, f);
      if (est.servicoId && !cabe(est.servicoId)) est.servicoId = null;
      var primeiro = null;
      lista.forEach(function (x) {
        var s = x.servico;
        var b = criar('button', { type: 'button', role: 'radio', classe: 'servico-opcao', 'data-servico': s.id }, [
          criar('span', { classe: 'nome', texto: s.nome }),
          criar('span', { classe: 'duracao', texto: s.duracaoTexto }),
          criar('span', { classe: classePreco(s.preco), texto: s.precoTexto })
        ]);
        var sel = s.id === est.servicoId;
        b.setAttribute('aria-checked', sel ? 'true' : 'false');
        if (!x.cabe) {
          b.classList.add('is-nao-cabe');
          b.setAttribute('aria-disabled', 'true');
          b.appendChild(criar('span', { classe: 'nota', texto: T.naoCabe }));
          b.tabIndex = -1;
        } else {
          if (!primeiro) primeiro = b;
          b.tabIndex = sel ? 0 : -1;
        }
        c.appendChild(b);
      });
      if (!est.servicoId && primeiro) primeiro.tabIndex = 0;
      if (focoDentro) { var a = c.querySelector('[role="radio"][tabindex="0"]'); if (a) a.focus(); }
    }
    function escolherServico(id, foco) {
      if (!cabe(id)) return;
      est.servicoId = id;
      est.servicoPendente = null;
      Array.prototype.forEach.call($('lista-servicos').querySelectorAll('.servico-opcao'), function (b) {
        var sel = b.getAttribute('data-servico') === id;
        b.setAttribute('aria-checked', sel ? 'true' : 'false');
        if (b.getAttribute('aria-disabled') !== 'true') b.tabIndex = sel ? 0 : -1;
        if (sel && foco) b.focus();
      });
      revelarPassos();
      atualizarChips();
      atualizarResumo();
    }

    /* ---------- profissionais (só site entregue, se o dono cadastrou) ---------- */
    function renderChips() {
      var c = $('chips-profissionais');
      if (!c) return;
      limpar(c);
      profs.forEach(function (p) {
        var b = criar('button', { type: 'button', classe: 'chip', 'data-profissional': p.id }, [criar('span', { classe: 'nome', texto: p.nome })]);
        if (p.especialidade) b.appendChild(criar('small', { texto: p.especialidade }));
        b.setAttribute('aria-pressed', p.id === est.profissionalId ? 'true' : 'false');
        c.appendChild(b);
      });
    }
    function atualizarChips() {
      Array.prototype.forEach.call(DOC.querySelectorAll('.chip[data-profissional]'), function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-profissional') === est.profissionalId ? 'true' : 'false');
      });
    }

    /* ---------- "O de sempre" (só site entregue, só com histórico no aparelho) ---------- */
    function notaAtalho(t) { var n = $('atalho-nota'); if (n) n.textContent = t || ''; }
    function renderAtalho() {
      var b = $('atalho-sempre'), c = lerCliente();
      var s = c && servicoPorId(c.servicoId), p = c && c.profissionalId ? profPorId(c.profissionalId) : null;
      if (!s) { mostrar(b, false); return; }
      limpar(b);
      b.appendChild(criar('span', { texto: T.deSempre }));
      b.appendChild(criar('span', { classe: 'detalhe', texto: s.nome + (p ? ' com ' + p.nome : '') }));
      b.setAttribute('data-servico', s.id);
      b.setAttribute('data-profissional', p ? p.id : '');
      mostrar(b, true);
    }
    function usarAtalho() {
      var b = $('atalho-sempre');
      var sid = b.getAttribute('data-servico'), pid = b.getAttribute('data-profissional');
      if (pid && profPorId(pid)) est.profissionalId = pid;
      var s = servicoPorId(sid);
      if (est.hora == null) { est.servicoPendente = sid; notaAtalho(T.deSempreNota); }
      else if (cabe(sid)) { est.servicoId = sid; notaAtalho(''); }
      else notaAtalho((s ? s.nome : 'Esse serviço') + ' não cabe nesse horário. Escolha outro horário ou outro serviço.');
      depoisDeEscolher();
    }

    /* ---------- nome e WhatsApp ---------- */
    function erros() {
      return {
        nome: P.nomeValido(est.nome) ? '' : T.erroNome,
        whats: P.whatsValido(est.whats) ? '' : erroWhats
      };
    }
    function mostrarErros(forcar) {
      var er = erros();
      [['nome', inputNome], ['whats', inputWhats]].forEach(function (x) {
        var msg = forcar || est.tocado[x[0]] || est.tentou ? er[x[0]] : '';
        var el = $('erro-' + x[1].id);
        if (el) el.textContent = msg;
        if (msg) x[1].setAttribute('aria-invalid', 'true'); else x[1].removeAttribute('aria-invalid');
        x[1].parentNode.classList.toggle('is-erro', !!msg);
      });
      if (!forcar && !er.nome && !er.whats && tudoEscolhido()) erroGeral('');
      return er;
    }
    function iniciarDados() {
      var c = lerCliente();
      if (c && typeof c.nome === 'string') inputNome.value = c.nome.slice(0, 60);
      if (c && typeof c.whats === 'string') inputWhats.value = P.mascararWhats(P.normalizarWhats(c.whats));
      est.nome = inputNome.value;
      est.whats = P.normalizarWhats(inputWhats.value);
      inputNome.addEventListener('input', function () {
        est.nome = inputNome.value;
        if (est.tocado.nome || est.tentou) mostrarErros(false);
        atualizarResumo();
      });
      inputNome.addEventListener('blur', function () { est.tocado.nome = true; mostrarErros(false); });
      var anterior = est.whats;
      inputWhats.addEventListener('input', function (ev) {
        var d = P.normalizarWhats(inputWhats.value);
        /* apagar um caractere da máscara apaga o dígito anterior */
        if (ev && ev.inputType && ev.inputType.indexOf('delete') === 0 && d === anterior) d = d.slice(0, -1);
        inputWhats.value = P.mascararWhats(d);
        anterior = d;
        est.whats = d;
        if (est.tocado.whats || est.tentou) mostrarErros(false);
      });
      inputWhats.addEventListener('blur', function () { est.tocado.whats = true; mostrarErros(false); });
      $('esquecer-dados').addEventListener('click', function () {
        if (!previa) armazem.remover('cliente');
        inputNome.value = ''; inputWhats.value = '';
        est.nome = ''; est.whats = ''; anterior = '';
        est.tocado = { nome: false, whats: false };
        mostrarErros(false);
        renderAtalho();
        $('nota-esquecer').textContent = previa ? T.esquecidoPrevia : T.esquecido;
      });
    }

    /* ---------- resumo e passos ---------- */
    function tudoEscolhido() { return !!(est.dia && est.hora != null && est.servicoId && (!temProf || est.profissionalId)); }
    function faltas() {
      var f = [];
      if (!est.dia) f.push('o dia');
      if (est.hora == null) f.push('o horário');
      if (!est.servicoId) f.push('o serviço');
      if (temProf && !est.profissionalId) f.push('o profissional');
      return f.length > 1 ? f.slice(0, -1).join(', ') + ' e ' + f[f.length - 1] : f[0] || '';
    }
    function linhasEscolha() {
      var s = est.servicoId && servicoPorId(est.servicoId), p = est.profissionalId && profPorId(est.profissionalId);
      return [
        [T.dia, est.dia ? maiuscula(P.diaLongo(P.dataDaChave(est.dia), agora())) : '', null],
        [T.hora, est.hora != null ? P.horaTexto(est.hora) : '', 'hora'],
        [T.servico, s ? s.nome + ' · ' + s.duracaoTexto : '', null],
        [T.profissional, p ? p.nome : '', null],
        [T.valor, s ? s.precoTexto + (exemplo && s.preco !== null ? T.exemplo : '') : '', classePreco(s ? s.preco : null)]
      ].filter(function (l) { return l[1]; });
    }
    function preencherDl(dl, linhas) {
      limpar(dl);
      linhas.forEach(function (l) {
        dl.appendChild(criar('dt', { texto: l[0] }));
        dl.appendChild(criar('dd', { classe: l[2], texto: l[1] }));
      });
    }
    function atualizarResumo() {
      var c = $('resumo-corpo');
      limpar(c);
      var linhas = linhasEscolha();
      if (!linhas.length) c.appendChild(criar('p', { classe: 'vazio-resumo', texto: T.resumoVazio }));
      else { var dl = criar('dl'); preencherDl(dl, linhas); c.appendChild(dl); }
      var pronto = tudoEscolhido();
      mostrar($('bloco-confirmar'), pronto);
      if (pronto) iniciarTira();
    }
    function revelarPassos() {
      if (est.servicoId) { revelado.profissional = true; if (!temProf) revelado.dados = true; }
      if (temProf && est.profissionalId) revelado.dados = true;
      mostrar($('passo-profissional'), temProf && revelado.profissional);
      mostrar($('passo-dados'), revelado.dados);
    }
    function depoisDeEscolher() {
      renderServicos();
      revelarPassos();
      atualizarChips();
      atualizarResumo();
    }

    /* ---------- ritual de confirmar ---------- */
    function iniciarTira() {
      var tira = $('tira-confirmar');
      if (tiraCriada || !tira) return;
      if (reduz || !ritual || typeof ritual.criarTira !== 'function') { mostrar(tira, false); return; }
      try {
        var ok = ritual.criarTira(tira, { rotulo: e.textos.ritualDica });
        tiraCriada = !!ok;
        mostrar(tira, !!ok);
      } catch (er) { mostrar(tira, false); }
    }
    function resetarTira() {
      var tira = $('tira-confirmar');
      if (tiraCriada && ritual && typeof ritual.resetarTira === 'function') { try { ritual.resetarTira(tira); } catch (er) {} }
    }
    function erroGeral(m) { $('erro-geral').textContent = m || ''; }
    function focarFalta() {
      var a = null;
      if (!est.dia) a = $('fita-dias').querySelector('.dia[tabindex="0"]');
      else if (est.hora == null) a = $('lista-horarios').querySelector('.horarios:not([hidden]) .horario');
      else if (!est.servicoId) a = $('lista-servicos').querySelector('[role="radio"][tabindex="0"]');
      else if (temProf && !est.profissionalId) a = DOC.querySelector('.chip[data-profissional]');
      else { var er = erros(); a = er.nome ? inputNome : er.whats ? inputWhats : null; }
      if (a && a.focus) a.focus();
    }

    function confirmar() {
      if (est.enviando) return;
      est.tentou = true;
      erroGeral('');
      var er = mostrarErros(true);
      if (!tudoEscolhido()) { erroGeral(P.fmt(T.erroEscolha, { falta: faltas() })); focarFalta(); resetarTira(); return; }
      if (er.nome || er.whats) { erroGeral(er.nome && er.whats ? T.erroAmbos : (er.nome || er.whats)); focarFalta(); resetarTira(); return; }
      /* o relógio andou: o horário escolhido ainda é pedível? */
      var r = P.resumoDia(e.funcionamento, servicos, est.dia, agora());
      if (r.horarios.indexOf(est.hora) === -1 || !cabe(est.servicoId)) {
        est.hora = null;
        renderFita(); renderHorarios(); depoisDeEscolher();
        erroGeral(T.erroHorario); focarFalta(); resetarTira();
        return;
      }
      var whatsCliente = P.normalizarWhats(est.whats);
      var destino = previa ? '55' + whatsCliente : e.contato.whatsapp;
      if (!P.whatsNegocioValido(destino)) { erroGeral(T.erroSemWhatsNegocio); resetarTira(); return; }

      est.enviando = true;
      var s = servicoPorId(est.servicoId), p = est.profissionalId ? profPorId(est.profissionalId) : null;
      var nome = P.colapsar(est.nome).slice(0, 60);
      var dados = {
        nome: nome,
        servico: s.nome,
        dia: diaDaMensagem(P.dataDaChave(est.dia)),       // "quarta, 11/11": "hoje" e "amanhã" só na tela
        hora: P.horaTexto(est.hora),
        profissional: p ? p.nome : '',
        whats: P.mascararWhats(whatsCliente)
      };
      var msg = mensagemFinal(P.mensagemPedido(e, dados), { previa: previa, demonstracao: demo, nicho: dadosDemo.nicho, rotulo: dadosDemo.rotulo, nome: dadosDemo.nome });
      var url = P.urlWhats(destino, msg);
      /* dentro do mesmo gesto, para o navegador não bloquear a janela */
      try { W.open(url, '_blank', 'noopener'); } catch (er2) {}

      if (!previa) gravarCliente({ nome: nome, whats: whatsCliente, servicoId: s.id, profissionalId: p ? p.id : null, salvoEm: new Date().toISOString() });
      ctx.emitir('motor:pedido', { previa: previa, nicho: e.nicho });
      if (previa && W.parent && W.parent !== W) {
        try {
          var origem = W.location.origin && W.location.origin !== 'null' ? W.location.origin : '*';
          W.parent.postMessage({ tipo: 'creat:previa', evento: 'reserva_teste', nicho: e.nicho }, origem);
        } catch (er3) {}
      }
      mostrarEspelho(url, s, p);
      renderAtalho();
    }

    var escondidos = [];
    function mostrarEspelho(url, s, p) {
      escondidos = [form, $('pedido-nota')].filter(function (el) { return el && !el.hidden; });
      escondidos.forEach(function (el) { el.hidden = true; });
      preencherDl($('espelho-dados'), [
        [T.servico, s.nome, null],
        [T.profissional, p ? p.nome : '', null],
        [T.dia, maiuscula(P.diaLongo(P.dataDaChave(est.dia), agora())), null],
        [T.hora, P.horaTexto(est.hora), 'hora'],
        [T.valor, s.precoTexto + (exemplo && s.preco !== null ? T.exemplo : ''), classePreco(s.preco)]
      ].filter(function (l) { return l[1]; }));
      var link = $('espelho-whats');
      link.href = url;
      mostrar(espelho, true);
      try { espelho.focus({ preventScroll: true }); } catch (er) { espelho.focus(); }
      try { espelho.scrollIntoView({ block: 'start', behavior: reduz ? 'auto' : 'smooth' }); } catch (er) {}
    }
    function novoPedido() {
      mostrar(espelho, false);
      escondidos.forEach(function (el) { el.hidden = false; });
      escondidos = [];
      est.dia = null; est.hora = null; est.servicoId = null; est.servicoPendente = null;
      est.tentou = false; est.enviando = false; est.tocado = { nome: false, whats: false };
      revelado = { profissional: false, dados: false };
      erroGeral(''); notaAtalho(''); mostrarErros(false); resetarTira();
      renderFita(); renderHorarios(); renderAtalho(); depoisDeEscolher();
      var b = $('fita-dias').querySelector('.dia[aria-pressed="true"]');
      if (b) b.focus();
    }

    /* ---------- eventos ---------- */
    function ligar() {
      var fita = $('fita-dias');
      fita.addEventListener('click', function (ev) {
        var b = ev.target.closest && ev.target.closest('.dia');
        if (!b || b.getAttribute('aria-disabled') === 'true') return;
        selecionarDia(b.getAttribute('data-dia'));
      });
      fita.addEventListener('keydown', function (ev) {
        var m = { ArrowRight: 1, ArrowLeft: -1, Home: 'ini', End: 'fim' }[ev.key];
        if (!m) return;
        var bs = botoesDia(), i = bs.indexOf(DOC.activeElement);
        if (i === -1) return;
        ev.preventDefault();
        var j = m === 'ini' ? 0 : m === 'fim' ? bs.length - 1 : Math.max(0, Math.min(bs.length - 1, i + m));
        bs.forEach(function (b, n) { b.tabIndex = n === j ? 0 : -1; });
        bs[j].focus();
        try { bs[j].scrollIntoView({ inline: 'nearest', block: 'nearest' }); } catch (er) {}
      });
      fita.addEventListener('scroll', mascararFita, { passive: true });
      W.addEventListener('resize', mascararFita);
      fita.addEventListener('focusout', function (ev) {
        if (ev.relatedTarget && fita.contains(ev.relatedTarget)) return;
        var bs = botoesDia(), sel = bs.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0];
        if (sel) bs.forEach(function (b) { b.tabIndex = b === sel ? 0 : -1; });
      });

      var lh = $('lista-horarios');
      lh.addEventListener('click', function (ev) {
        var v = ev.target.closest && ev.target.closest('[data-ver-turno]');
        if (v) { abrirTurno(v.getAttribute('data-ver-turno'), true); return; }
        var b = ev.target.closest && ev.target.closest('.horario');
        if (b) selecionarHora(P.hm(b.getAttribute('data-hora')));
      });
      lh.addEventListener('keydown', function (ev) {
        var bs = botoesHora(), i = bs.indexOf(DOC.activeElement);
        if (i === -1) return;
        var cols = colunas(bs), j = -1;
        if (ev.key === 'Home') j = 0;
        else if (ev.key === 'End') j = bs.length - 1;
        else {
          var d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[ev.key];
          if (!d) return;
          j = Math.max(0, Math.min(bs.length - 1, i + d));
        }
        ev.preventDefault();
        bs.forEach(function (b, n) { b.tabIndex = n === j ? 0 : -1; });
        bs[j].focus();
      });
      lh.addEventListener('focusout', function (ev) { if (!(ev.relatedTarget && lh.contains(ev.relatedTarget))) tabindexHorarios(); });

      var ls = $('lista-servicos');
      ls.addEventListener('click', function (ev) {
        var b = ev.target.closest && ev.target.closest('.servico-opcao');
        if (b && b.getAttribute('aria-disabled') !== 'true') escolherServico(b.getAttribute('data-servico'), false);
      });
      ls.addEventListener('keydown', function (ev) {
        var d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[ev.key];
        if (!d) return;
        var ops = Array.prototype.slice.call(ls.querySelectorAll('.servico-opcao:not([aria-disabled="true"])'));
        var i = ops.indexOf(DOC.activeElement);
        if (i === -1 || !ops.length) return;
        ev.preventDefault();
        escolherServico(ops[(i + d + ops.length) % ops.length].getAttribute('data-servico'), true);
      });

      var cp = $('chips-profissionais');
      if (cp) cp.addEventListener('click', function (ev) {
        var b = ev.target.closest && ev.target.closest('.chip[data-profissional]');
        if (!b) return;
        var pid = b.getAttribute('data-profissional');
        est.profissionalId = est.profissionalId === pid ? null : pid;
        depoisDeEscolher();
      });

      $('atalho-sempre').addEventListener('click', usarAtalho);
      /* type="submit": clique, Enter nos campos e "Ir" do teclado do celular caem aqui */
      form.addEventListener('submit', function (ev) { ev.preventDefault(); confirmar(); });
      W.addEventListener('ritual:confirmar', function (ev) {
        var d = ev && ev.detail, tira = $('tira-confirmar');
        if (!d || d.origem !== 'tira' || (d.el && tira && d.el !== tira && !tira.contains(d.el))) return;
        confirmar();
      });
      $('espelho-novo').addEventListener('click', novoPedido);

      /* o relógio anda: hoje perde horários que já passaram */
      setInterval(function () {
        if (est.enviando) return;
        if (est.dia === P.chaveData(agora()) && !lh.contains(DOC.activeElement)) { renderFita(); renderHorarios(); depoisDeEscolher(); }
      }, 60000);
    }

    /* ---------- boot ---------- */
    iniciarDados();
    renderChips();
    renderFita();
    renderHorarios();
    renderAtalho();
    depoisDeEscolher();
    ligar();

    /* "Pedir este" da tabela de serviços (motor): pré-seleciona o serviço; com horário que cabe, já marca */
    aplicarServico = function (id) {
      var s = servicoPorId(id);
      if (!s) return false;
      if (!espelho.hidden) novoPedido();
      if (est.hora != null && cabe(id)) { est.servicoPendente = null; escolherServico(id, false); notaAtalho(''); return true; }
      est.servicoId = null;
      est.servicoPendente = id;
      notaAtalho(est.hora != null ? s.nome + ' não cabe nesse horário. Escolha outro horário.' : P.fmt(T.servicoPedido, { servico: s.nome }));
      depoisDeEscolher();
      return true;
    };
    if (pendenteServico) { var pend = pendenteServico; pendenteServico = null; aplicarServico(pend); }

    function montarExterno() {
      aplicarServico = function () { return false; };     // sem fluxo próprio: "Pedir este" só rola até o botão
      pendenteServico = null;
      corpo.appendChild(criar('p', { classe: 'pedido-nota', texto: T.externoNota }));
      corpo.appendChild(criar('p', null, [criar('a', {
        classe: 'btn btn-externo', href: e.pedido.urlExterna, target: '_blank', rel: 'noopener', texto: e.ui.agendarExterno
      })]));
    }
  });
})();
