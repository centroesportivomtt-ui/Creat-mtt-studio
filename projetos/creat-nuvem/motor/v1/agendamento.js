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
 */
(function () {
  'use strict';
  var W = typeof window !== 'undefined' ? window : null;
  if (!W || !W.document || !W.CreatMotor || !W.CreatMotor.registrarModulo) return;
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
    prefixoTeste: 'Teste da prévia do site: ',
    externoNota: 'Abre a página de horários que o negócio já usa.'
  };

  W.CreatMotor.registrarModulo('agendamento', function (ctx) {
    var e = ctx.estado, P = ctx.puro, criar = ctx.criar, armazem = ctx.armazem;
    var corpo = DOC.getElementById('pedir-corpo');
    if (!corpo) return;

    if (e.pedido.modo === 'link_externo') { montarExterno(); return; }

    var previa = e.previa;
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

    function $(id) { return DOC.getElementById(id); }
    function limpar(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
    function mostrar(el, sim) { if (el) el.hidden = !sim; }
    function agora() { return new Date(); }
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
      criar('div', { id: 'lista-horarios', classe: 'horarios', role: 'group', 'aria-labelledby': 'passo-hora-titulo' }),
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
      r.horarios.forEach(function (t) {
        var b = criar('button', { type: 'button', classe: 'horario', 'data-hora': P.minParaHHMM(t) }, [criar('span', { classe: 'hora', texto: P.horaTexto(t) })]);
        var sel = t === est.hora;
        if (sel) valida = true;
        b.setAttribute('aria-pressed', sel ? 'true' : 'false');
        lista.appendChild(b);
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
    function botoesHora() { return Array.prototype.slice.call($('lista-horarios').querySelectorAll('.horario')); }
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
          criar('span', { classe: 'preco', texto: s.precoTexto })
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
        [T.valor, s ? s.precoTexto + (previa && s.preco !== null ? ' (exemplo)' : '') : '', 'preco']
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
      else if (est.hora == null) a = $('lista-horarios').querySelector('.horario');
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
        dia: P.diaLongo(P.dataDaChave(est.dia), agora()),
        hora: P.horaTexto(est.hora),
        profissional: p ? p.nome : '',
        whats: P.mascararWhats(whatsCliente)
      };
      var msg = P.mensagemPedido(e, dados);
      if (previa) msg = T.prefixoTeste + msg;
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
        [T.valor, s.precoTexto + (previa && s.preco !== null ? ' (exemplo)' : ''), 'preco']
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
      fita.addEventListener('focusout', function (ev) {
        if (ev.relatedTarget && fita.contains(ev.relatedTarget)) return;
        var bs = botoesDia(), sel = bs.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0];
        if (sel) bs.forEach(function (b) { b.tabIndex = b === sel ? 0 : -1; });
      });

      var lh = $('lista-horarios');
      lh.addEventListener('click', function (ev) {
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

    function montarExterno() {
      corpo.appendChild(criar('p', { classe: 'pedido-nota', texto: T.externoNota }));
      corpo.appendChild(criar('p', null, [criar('a', {
        classe: 'btn btn-externo', href: e.pedido.urlExterna, target: '_blank', rel: 'noopener', texto: e.ui.agendarExterno
      })]));
    }
  });
})();
