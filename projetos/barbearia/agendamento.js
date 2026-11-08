/*
 * agendamento.js · Barbearia Fio & Couro
 *
 * Boot do config (cores, textos, listas da página), letreiro de status,
 * agenda por horário (Poste Relógio: primeiro a hora, depois o que cabe),
 * validação, localStorage e confirmação pelo WhatsApp (wa.me).
 *
 * Script clássico (IIFE, sem import/export): funciona abrindo do disco.
 * Carregado com defer depois de config.js, efeito.js e som.js.
 *
 * Contrato de eventos:
 *   ouve    window 'fio:confirmar'  (detail.origem === 'tira')
 *   dispara window 'fio:reservado'  (detail.id)
 *
 * Segurança: nenhum innerHTML com dados. Tudo via createElement/textContent.
 * Dados pessoais ficam só no localStorage deste navegador.
 */
(function () {
  'use strict';

  var W = typeof window !== 'undefined' ? window : {};
  var DOC = typeof document !== 'undefined' ? document : null;

  var CHAVE_AG = 'fio:agendamentos';
  var CHAVE_TEMA = 'fio:tema';
  var DURACAO_FICTICIA = 40;
  var CHANCE_FICTICIA = 0.17; /* com blocos de 40 min e passo de 20, dá uns 30% dos slots */

  var DIAS_LONGO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var DIAS_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var DIAS_TITULO = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  /* ===================================================================
     ARMAZENAMENTO: localStorage com fallback em memória
     =================================================================== */
  var memoria = {};
  var lsFalhou = false;
  var armazem = {
    ler: function (k) {
      if (!lsFalhou) {
        try {
          var v = W.localStorage.getItem(k);
          if (v !== null) return v;
        } catch (e) { lsFalhou = true; }
      }
      return Object.prototype.hasOwnProperty.call(memoria, k) ? memoria[k] : null;
    },
    gravar: function (k, v) {
      memoria[k] = String(v);
      if (lsFalhou) return;
      try { W.localStorage.setItem(k, String(v)); } catch (e) { lsFalhou = true; }
    },
    remover: function (k) {
      delete memoria[k];
      try { W.localStorage.removeItem(k); } catch (e) {}
    }
  };

  /* ===================================================================
     FUNÇÕES PURAS (testáveis no node via FioAgenda._puro)
     =================================================================== */
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function hm(s) {
    var p = /^(\d{1,2}):(\d{2})$/.exec(String(s == null ? '' : s).trim());
    return p ? (+p[1]) * 60 + (+p[2]) : NaN;
  }
  function minParaHHMM(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  /* 9h quando minutos são zero, 15h40 nos demais casos */
  function horaTexto(m) {
    var h = Math.floor(m / 60), mi = m % 60;
    return h + 'h' + (mi ? pad(mi) : '');
  }
  function minutosDe(d) { return d.getHours() * 60 + d.getMinutes(); }

  function chaveData(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function dataDaChave(k) {
    var p = String(k).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function inicioDia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function somarDias(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function diferencaDias(a, b) { return Math.round((inicioDia(b) - inicioDia(a)) / 864e5); }

  /* 'hoje', 'amanhã' ou 'terça' */
  function diaRelativo(d, agora) {
    var n = diferencaDias(agora, d);
    if (n === 0) return 'hoje';
    if (n === 1) return 'amanhã';
    return DIAS_LONGO[d.getDay()];
  }
  /* 'ter 12' */
  function diaFita(d) { return DIAS_CURTO[d.getDay()] + ' ' + d.getDate(); }
  /* 'sábado, 08/11' (para mensagem e espelho, sem ambiguidade) */
  function diaLongo(d, agora) {
    return diaRelativo(d, agora) + ', ' + pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
  }

  function fmt(str, vars) {
    return String(str == null ? '' : str).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
    });
  }

  function moeda(v) {
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(+v || 0);
    } catch (e) { return 'R$ ' + (+v || 0).toFixed(2).replace('.', ','); }
  }

  function horarioDoDia(cfg, d) {
    var s = cfg && cfg.funcionamento && cfg.funcionamento.semana;
    if (!s) return null;
    var h = s[d.getDay()] || s[String(d.getDay())];
    if (!h) return null;
    var a = hm(h.abre), f = hm(h.fecha);
    if (!(f > a)) return null;
    return { abre: a, fecha: f };
  }
  function passoDe(cfg) {
    var p = +(cfg && cfg.funcionamento && cfg.funcionamento.passoMin);
    return p >= 5 ? p : 20;
  }
  function menorDuracao(cfg) {
    var m = Infinity;
    ((cfg && cfg.servicos) || []).forEach(function (s) {
      var d = +s.duracaoMin;
      if (d > 0 && d < m) m = d;
    });
    return m === Infinity ? 15 : m;
  }

  /* hash FNV-1a + mulberry32: o mesmo dia gera os mesmos ocupados em toda visita */
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function gerador(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function ocupacaoFicticia(cfg, chave) {
    var h = horarioDoDia(cfg, dataDaChave(chave));
    if (!h) return [];
    var passo = passoDe(cfg);
    var salto = Math.ceil(DURACAO_FICTICIA / passo) * passo;
    var r = gerador(hash('fio&couro:' + chave));
    var out = [];
    for (var t = h.abre; t + DURACAO_FICTICIA <= h.fecha;) {
      if (r() < CHANCE_FICTICIA) {
        out.push({ inicio: t, fim: t + DURACAO_FICTICIA, ficticio: true });
        t += salto;
      } else {
        t += passo;
      }
    }
    return out;
  }

  /* intervalos ocupados [inicio, fim) do dia, em minutos, ordenados */
  function intervalosDoDia(cfg, chave, agendamentos) {
    var lista = [];
    (agendamentos || []).forEach(function (a) {
      if (!a || a.data !== chave) return;
      var i = hm(a.inicio), dur = +a.duracaoMin;
      if (isNaN(i) || !(dur > 0)) return;
      lista.push({ inicio: i, fim: i + dur });
    });
    if (cfg && cfg.demo && cfg.demo.ocupacaoFicticia) lista = lista.concat(ocupacaoFicticia(cfg, chave));
    lista.sort(function (x, y) { return x.inicio - y.inicio; });
    return lista;
  }

  function slotOcupado(t, intervalos) {
    for (var i = 0; i < intervalos.length; i++) {
      if (t >= intervalos[i].inicio && t < intervalos[i].fim) return true;
    }
    return false;
  }

  /* slots de abre até fecha, de passo em passo; só se o menor serviço couber até fechar;
     para hoje, só a partir de agora + antecedência */
  function gerarSlots(cfg, chave, agora, intervalos) {
    var d = dataDaChave(chave);
    var h = horarioDoDia(cfg, d);
    if (!h) return [];
    var dif = diferencaDias(agora, d);
    if (dif < 0) return [];
    var minimo = -Infinity;
    if (dif === 0) minimo = minutosDe(agora) + (+(cfg.funcionamento.antecedenciaMin) || 0);
    var passo = passoDe(cfg), menor = menorDuracao(cfg), out = [];
    for (var t = h.abre; t + menor <= h.fecha; t += passo) {
      if (t < minimo) continue;
      out.push({ inicio: t, ocupado: slotOcupado(t, intervalos || []) });
    }
    return out;
  }

  /* limite = min(início do próximo intervalo ocupado depois do slot, fechamento) */
  function limiteDoSlot(t, intervalos, fecha) {
    var lim = fecha;
    (intervalos || []).forEach(function (i) {
      if (i.inicio > t && i.inicio < lim) lim = i.inicio;
    });
    return lim;
  }
  function servicosQueCabem(cfg, t, intervalos, fecha) {
    var lim = limiteDoSlot(t, intervalos, fecha);
    return ((cfg && cfg.servicos) || []).map(function (s) {
      return { servico: s, cabe: t + (+s.duracaoMin || 0) <= lim, limite: lim };
    });
  }

  function resumoDia(cfg, chave, agora, agendamentos) {
    var d = dataDaChave(chave);
    var h = horarioDoDia(cfg, d);
    var iv = intervalosDoDia(cfg, chave, agendamentos);
    var slots = h ? gerarSlots(cfg, chave, agora, iv) : [];
    var livres = slots.filter(function (s) { return !s.ocupado; }).length;
    return { chave: chave, data: d, horario: h, aberto: !!h, intervalos: iv, slots: slots, livres: livres };
  }

  function proximoDiaComVaga(cfg, desde, agora, agendamentos, limiteDias) {
    var n = limiteDias || 21;
    for (var i = 0; i < n; i++) {
      var d = somarDias(desde, i);
      var r = resumoDia(cfg, chaveData(d), agora, agendamentos);
      if (r.livres > 0) return r;
    }
    return null;
  }

  function calcularLetreiro(cfg, agora, agendamentos) {
    var t = (cfg && cfg.textos && cfg.textos.letreiro) || {};
    var h = horarioDoDia(cfg, agora);
    var m = minutosDe(agora);
    if (h && m >= h.abre && m < h.fecha) {
      var hoje = resumoDia(cfg, chaveData(agora), agora, agendamentos);
      for (var i = 0; i < hoje.slots.length; i++) {
        if (!hoje.slots[i].ocupado) {
          return { estado: 'aberto', texto: fmt(t.aberto, { hora: horaTexto(hoje.slots[i].inicio) }) };
        }
      }
      var prox = proximoDiaComVaga(cfg, somarDias(agora, 1), agora, agendamentos);
      if (prox) {
        return { estado: 'lotado', texto: fmt(t.abertoSemVaga, { dia: diaRelativo(prox.data, agora), n: prox.livres }) };
      }
      return { estado: 'lotado', texto: 'Hoje lotado' };
    }
    if (h && m < h.abre) {
      return { estado: 'fechado', texto: fmt(t.fechadoHoje, { hora: horaTexto(h.abre) }) };
    }
    for (var k = 1; k <= 14; k++) {
      var d = somarDias(agora, k);
      var hd = horarioDoDia(cfg, d);
      if (hd) return { estado: 'fechado', texto: fmt(t.fechado, { dia: diaRelativo(d, agora), hora: horaTexto(hd.abre) }) };
    }
    return { estado: 'fechado', texto: 'Fechado' };
  }

  /* WhatsApp: só dígitos, sem DDI 55 e sem zero de operadora, até 11 dígitos */
  function soDigitos(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  function normalizarWhats(v) {
    var d = soDigitos(v);
    if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);
    if (d.length > 11 && d.charAt(0) === '0') d = d.slice(1);
    return d.slice(0, 11);
  }
  function mascararWhats(digitos) {
    var d = soDigitos(digitos).slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    var ddd = d.slice(0, 2), r = d.slice(2);
    if (r.length <= 4) return '(' + ddd + ') ' + r;
    if (d.length <= 10) return '(' + ddd + ') ' + r.slice(0, 4) + '-' + r.slice(4);
    return '(' + ddd + ') ' + r.slice(0, 5) + '-' + r.slice(5);
  }
  function whatsValido(v) { return /^[1-9]{2}\d{8,9}$/.test(normalizarWhats(v)); }
  function nomeValido(v) {
    var letras;
    try { letras = String(v || '').match(/\p{L}/gu); } catch (e) { letras = String(v || '').match(/[A-Za-zÀ-ÿ]/g); }
    return !!letras && letras.length >= 2;
  }

  function enderecoCompleto(e) {
    if (!e) return '';
    var l1 = [e.rua, e.numero].filter(Boolean).join(', ');
    var l2 = [e.bairro, [e.cidade, e.uf].filter(Boolean).join(' - ')].filter(Boolean).join(', ');
    return [l1, l2, e.cep].filter(Boolean).join(' - ');
  }

  var puro = {
    hm: hm, minParaHHMM: minParaHHMM, horaTexto: horaTexto, chaveData: chaveData, dataDaChave: dataDaChave,
    diaRelativo: diaRelativo, diaFita: diaFita, diaLongo: diaLongo, fmt: fmt, moeda: moeda,
    horarioDoDia: horarioDoDia, ocupacaoFicticia: ocupacaoFicticia, intervalosDoDia: intervalosDoDia,
    slotOcupado: slotOcupado, gerarSlots: gerarSlots, limiteDoSlot: limiteDoSlot,
    servicosQueCabem: servicosQueCabem, resumoDia: resumoDia, proximoDiaComVaga: proximoDiaComVaga,
    calcularLetreiro: calcularLetreiro, normalizarWhats: normalizarWhats, mascararWhats: mascararWhats,
    whatsValido: whatsValido, nomeValido: nomeValido, enderecoCompleto: enderecoCompleto
  };

  /* ===================================================================
     DOM
     =================================================================== */
  var cfg = null;
  var estado = {
    dia: null, hora: null, servicoId: null, profissionalId: null,
    nome: '', whats: '', enviando: false, servicoPendente: null,
    tocado: { nome: false, whats: false }, tentou: false, ultimaReserva: null
  };
  var tiraCriada = false;
  var reduzMovimento = false;

  function $(id) { return DOC ? DOC.getElementById(id) : null; }
  function criar(tag, cls, texto) {
    var el = DOC.createElement(tag);
    if (cls) el.className = cls;
    if (texto != null) el.textContent = String(texto);
    return el;
  }
  function limpar(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
  function mostrar(el, sim) { if (el) el.hidden = !sim; }
  function ehLista(el) { return el && (el.tagName === 'UL' || el.tagName === 'OL'); }
  function anexarItem(pai, filho) {
    if (ehLista(pai)) { var li = criar('li'); li.appendChild(filho); pai.appendChild(li); return li; }
    pai.appendChild(filho);
    return filho;
  }
  function T(caminho, padrao) {
    var v = caminho.split('.').reduce(function (o, k) { return o && o[k]; }, cfg && cfg.textos);
    return typeof v === 'string' ? v : (padrao || '');
  }
  function agora() { return new Date(); }

  function lerAgendamentos() {
    var bruto = armazem.ler(CHAVE_AG);
    if (!bruto) return [];
    try {
      var arr = JSON.parse(bruto);
      if (!Array.isArray(arr)) return [];
      /* LGPD: reserva passada há mais de 90 dias não serve nem para o "de sempre"; sai do aparelho */
      var limite = chaveData(somarDias(agora(), -DIAS_GUARDA));
      var validos = arr.filter(function (a) {
        return a && typeof a.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.data) && !isNaN(hm(a.inicio)) && a.data >= limite;
      });
      if (validos.length !== arr.length) {
        if (validos.length) gravarAgendamentos(validos); else armazem.remover(CHAVE_AG);
      }
      return validos;
    } catch (e) { return []; }
  }
  var DIAS_GUARDA = 90;
  function gravarAgendamentos(arr) { armazem.gravar(CHAVE_AG, JSON.stringify(arr)); }

  function servicoPorId(id) { return (cfg.servicos || []).filter(function (s) { return s.id === id; })[0] || null; }
  function profPorId(id) { return (cfg.profissionais || []).filter(function (p) { return p.id === id; })[0] || null; }
  function ultimoAgendamento() {
    var ags = lerAgendamentos();
    var ult = null;
    ags.forEach(function (a) {
      if (!ult || String(a.criadoEm || '') >= String(ult.criadoEm || '')) ult = a;
    });
    return ult;
  }

  /* ---------- 1) BOOT ---------- */
  function aplicarCores() {
    var c = cfg.cores || {};
    var raiz = DOC.documentElement;
    ['couro', 'aco', 'latao', 'giz'].forEach(function (k) {
      var v = c[k];
      if (typeof v === 'string' && /^#[0-9a-f]{3,8}$|^(rgb|hsl|oklch|oklab)\(/i.test(v.trim())) {
        raiz.style.setProperty('--cor-' + k, v.trim());
      }
    });
  }

  /* só troca se o texto mudou: preserva marcação do HTML (ex.: o "&" estilizado do hero) */
  function normalizar(t) { return String(t).replace(/\s+/g, ' ').trim().toLowerCase(); }
  function definirTexto(el, v) {
    if (normalizar(el.textContent) === normalizar(v)) return;
    el.textContent = v;
  }

  function preencherTextos() {
    var neg = cfg.negocio || {};
    Array.prototype.forEach.call(DOC.querySelectorAll('[data-config]'), function (el) {
      var chave = el.getAttribute('data-config');
      var v = chave.split('.').reduce(function (o, k) { return o && o[k]; }, neg);
      if (v && typeof v === 'object' && 'rua' in v) v = enderecoCompleto(v);
      if (v != null && typeof v !== 'object') definirTexto(el, String(v));
    });
    Array.prototype.forEach.call(DOC.querySelectorAll('[data-texto]'), function (el) {
      var v = T(el.getAttribute('data-texto'));
      if (v) definirTexto(el, v);
    });
  }

  /* aba, Google e cor da barra do navegador vêm do config */
  function aplicarPagina() {
    var pg = cfg.pagina || {};
    if (pg.titulo) DOC.title = pg.titulo;
    var meta = DOC.querySelector('meta[name="description"]');
    if (meta && pg.descricao) meta.setAttribute('content', pg.descricao);
    var tc = DOC.querySelector('meta[name="theme-color"]');
    var couro = cfg.cores && cfg.cores.couro;
    if (tc && typeof couro === 'string' && /^#[0-9a-f]{3,8}$/i.test(couro.trim())) tc.setAttribute('content', couro.trim());
    var link = $('espelho-whats');
    if (link && cfg.negocio && cfg.negocio.whatsapp) link.href = 'https://wa.me/' + soDigitos(cfg.negocio.whatsapp);
  }

  function renderManifesto() {
    var m = cfg.textos && cfg.textos.manifesto;
    var sec = $('manifesto');
    if (!sec || !m) return;
    var h = $('manifesto-titulo');
    if (h && m.titulo) definirTexto(h, m.titulo);
    if (!Array.isArray(m.frases) || !m.frases.length) return;
    Array.prototype.slice.call(sec.querySelectorAll('p')).forEach(function (p) { sec.removeChild(p); });
    m.frases.forEach(function (f) { sec.appendChild(criar('p', null, f)); });
    if (m.bordao) sec.appendChild(criar('p', 'manifesto-bordao', m.bordao));
  }

  function renderPrecos() {
    var ul = $('lista-precos');
    if (!ul) return;
    limpar(ul);
    (cfg.servicos || []).forEach(function (s) {
      var li = criar('li');
      li.appendChild(criar('span', 'nome', s.nome));
      var dur = criar('span', 'duracao mono', (+s.duracaoMin || 0) + ' min');
      li.appendChild(dur);
      li.appendChild(criar('span', 'preco mono', moeda(s.preco)));
      if (s.descricao) li.appendChild(criar('span', 'descricao', s.descricao));
      ul.appendChild(li);
    });
  }

  function renderProfissionais() {
    var ul = $('lista-profissionais');
    if (!ul) return;
    limpar(ul);
    (cfg.profissionais || []).forEach(function (p) {
      var li = criar('li');
      li.appendChild(criar('h3', 'nome', p.nome));
      if (p.especialidade) li.appendChild(criar('p', 'especialidade', p.especialidade));
      if (p.bio) li.appendChild(criar('p', 'bio', p.bio));
      ul.appendChild(li);
    });
  }

  function renderAvaliacoes() {
    var ul = $('lista-avaliacoes');
    if (!ul) return;
    limpar(ul);
    (cfg.avaliacoes || []).forEach(function (a) {
      var li = criar('li');
      var bq = criar('blockquote');
      bq.appendChild(criar('p', null, a.texto));
      li.appendChild(bq);
      var assinatura = [a.autor, a.detalhe].filter(Boolean).join(', ');
      if (assinatura) li.appendChild(criar('cite', null, assinatura));
      ul.appendChild(li);
    });
  }

  function renderContato() {
    var neg = cfg.negocio || {};
    var e = neg.endereco || {};
    var end = $('endereco');
    if (end) {
      limpar(end);
      var linhas = [
        [e.rua, e.numero].filter(Boolean).join(', '),
        [e.bairro, [e.cidade, e.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' · '),
        e.cep ? 'CEP ' + e.cep : ''
      ].filter(Boolean);
      linhas.forEach(function (l, i) {
        if (i) end.appendChild(DOC.createElement('br'));
        end.appendChild(DOC.createTextNode(l));
      });
    }
    var mapa = $('link-mapa');
    if (mapa) {
      var q = [enderecoCompleto(e), neg.nome].filter(Boolean).join(', ');
      mapa.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
      mapa.target = '_blank';
      mapa.rel = 'noopener';
      if (!mapa.textContent.trim()) mapa.textContent = T('secoes.comoChegar', 'Como chegar');
    }
    var insta = $('link-instagram');
    if (insta && neg.instagram) {
      if (/^https:\/\//.test(neg.instagram.url || '')) insta.href = neg.instagram.url;
      insta.target = '_blank';
      insta.rel = 'noopener';
      var rotulo = T('secoes.instagram', 'Ver cortes no Instagram');
      insta.textContent = neg.instagram.usuario ? rotulo + ' \u00b7 ' + neg.instagram.usuario : rotulo;
    }
    ['whats-flutuante', 'rodape-whats'].forEach(function (id) {
      var a = $(id);
      if (!a || !neg.whatsapp) return;
      a.href = 'https://wa.me/' + soDigitos(neg.whatsapp);
      a.target = '_blank';
      a.rel = 'noopener';
      /* no HTML eles nascem hidden: sem JS não sobra link para o número-marcador */
      a.hidden = false;
      var contato = a.closest('#rodape-contato');
      if (contato) contato.hidden = false;
    });
  }

  function renderFuncionamento() {
    var alvo = $('tabela-funcionamento');
    if (!alvo) return;
    var corpo = alvo;
    if (alvo.tagName === 'TABLE') {
      corpo = alvo.tBodies[0] || alvo.appendChild(DOC.createElement('tbody'));
    }
    limpar(corpo);
    var hojeDia = agora().getDay();
    var ordem = [1, 2, 3, 4, 5, 6, 0];
    var grupos = [];
    ordem.forEach(function (dia) {
      var h = horarioDoDia(cfg, { getDay: function () { return dia; } });
      var assinatura = h ? h.abre + '-' + h.fecha : null;
      var ult = grupos[grupos.length - 1];
      if (h && ult && ult.assinatura === assinatura) ult.dias.push(dia);
      else if (h) grupos.push({ assinatura: assinatura, dias: [dia], h: h });
    });
    var folgas = [0, 1, 2, 3, 4, 5, 6].filter(function (d) {
      return !horarioDoDia(cfg, { getDay: function () { return d; } });
    });
    var usarTabela = corpo.tagName === 'TBODY' || corpo.tagName === 'TABLE';
    function linha(rotulo, valor, dias, folga) {
      var tr = criar(usarTabela ? 'tr' : 'div');
      if (folga) tr.classList.add('is-folga');
      if (dias.indexOf(hojeDia) !== -1) tr.classList.add('is-hoje');
      var th = criar(usarTabela ? 'th' : 'span', null, rotulo);
      if (usarTabela) th.setAttribute('scope', 'row');
      tr.appendChild(th);
      tr.appendChild(criar(usarTabela ? 'td' : 'span', folga ? 'is-folga' : null, valor));
      corpo.appendChild(tr);
    }
    var resumo = [];
    grupos.forEach(function (g) {
      var rotulo = g.dias.length === 1 ? DIAS_TITULO[g.dias[0]]
        : DIAS_TITULO[g.dias[0]] + ' a ' + DIAS_TITULO[g.dias[g.dias.length - 1]];
      var faixa = horaTexto(g.h.abre) + ' às ' + horaTexto(g.h.fecha);
      linha(rotulo, faixa, g.dias, false);
      resumo.push(rotulo + ', ' + faixa);
    });
    var rodapeHorario = $('rodape-horario');
    if (rodapeHorario && resumo.length) definirTexto(rodapeHorario, resumo.join(' · '));
    if (folgas.length) {
      var nomes = folgas.map(function (d) { return DIAS_TITULO[d]; });
      var rot = nomes.length === 1 ? nomes[0] : nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
      linha(rot, T('agenda.folga', 'folga'), folgas, true);
    }
  }

  /* tema: sem preferência gravada, o CSS segue o sistema (escuro é o padrão do styles.css) */
  function temaAtual() {
    var t = DOC.documentElement.getAttribute('data-tema');
    if (t === 'claro' || t === 'escuro') return t;
    try { if (W.matchMedia && W.matchMedia('(prefers-color-scheme: light)').matches) return 'claro'; } catch (e) {}
    return 'escuro';
  }
  function aplicarTema(t, gravar) {
    DOC.documentElement.setAttribute('data-tema', t);
    if (gravar) armazem.gravar(CHAVE_TEMA, t);
    atualizarBotaoTema();
  }
  function atualizarBotaoTema() {
    var b = $('alternar-tema');
    if (!b) return;
    var t = temaAtual();
    b.setAttribute('aria-pressed', t === 'claro' ? 'true' : 'false');
    /* com aria-pressed o nome acessível fica fixo (aria-label "Tema claro" no HTML);
       a ação vai só no title */
    b.title = t === 'claro' ? T('secoes.temaEscuro', 'Usar tema escuro') : T('secoes.temaClaro', 'Usar tema claro');
  }
  function iniciarTema() {
    var salvo = armazem.ler(CHAVE_TEMA);
    if (salvo === 'claro' || salvo === 'escuro') DOC.documentElement.setAttribute('data-tema', salvo);
    atualizarBotaoTema();
    var b = $('alternar-tema');
    if (b) b.addEventListener('click', function () { aplicarTema(temaAtual() === 'claro' ? 'escuro' : 'claro', true); });
  }

  /* ---------- 4) LETREIRO ---------- */
  function atualizarLetreiro() {
    var el = $('letreiro');
    if (!el) return;
    var r = calcularLetreiro(cfg, agora(), lerAgendamentos());
    var alvo = el.querySelector('[data-letreiro-texto], .letreiro-texto') || el;
    alvo.textContent = r.texto;
    el.setAttribute('data-estado', r.estado);
  }

  /* ---------- 5) FLUXO ---------- */
  function diasDaFita() {
    var n = +(cfg.funcionamento && cfg.funcionamento.diasNaFita) || 7;
    var hoje = agora(), out = [];
    var ags = lerAgendamentos();
    for (var i = 0; i < n; i++) {
      var d = somarDias(hoje, i);
      out.push(resumoDia(cfg, chaveData(d), hoje, ags));
    }
    return out;
  }
  function primeiroDiaComVaga(lista) {
    for (var i = 0; i < lista.length; i++) if (lista[i].livres > 0) return lista[i].chave;
    for (var j = 0; j < lista.length; j++) if (lista[j].aberto) return lista[j].chave;
    return lista.length ? lista[0].chave : null;
  }

  function renderFita() {
    var fita = $('fita-dias');
    if (!fita) return;
    var dias = diasDaFita();
    if (!estado.dia || !dias.some(function (r) { return r.chave === estado.dia && r.aberto; })) {
      estado.dia = primeiroDiaComVaga(dias);
    }
    limpar(fita);
    var hoje = agora();
    dias.forEach(function (r) {
      var b = criar('button', 'dia');
      b.type = 'button';
      b.setAttribute('data-dia', r.chave);
      var semana = criar('span', 'semana', DIAS_CURTO[r.data.getDay()]);
      b.appendChild(semana);
      b.appendChild(criar('strong', 'num', r.data.getDate()));
      var nota = null;
      if (!r.aberto) nota = T('agenda.folga', 'folga');
      else if (diferencaDias(hoje, r.data) === 0) nota = 'hoje';
      else if (r.livres === 0) nota = 'lotado';
      if (nota) b.appendChild(criar('small', 'nota-dia', nota));
      if (diferencaDias(hoje, r.data) === 0) b.classList.add('is-hoje');
      if (!r.aberto) {
        b.setAttribute('aria-disabled', 'true');
        b.classList.add('is-folga');
      }
      var sel = r.chave === estado.dia;
      b.setAttribute('aria-pressed', sel ? 'true' : 'false');
      b.tabIndex = sel ? 0 : -1;
      anexarItem(fita, b);
    });
  }

  function botoesDia() {
    var fita = $('fita-dias');
    return fita ? Array.prototype.slice.call(fita.querySelectorAll('.dia')) : [];
  }

  function selecionarDia(chave, opcoes) {
    var r = resumoDia(cfg, chave, agora(), lerAgendamentos());
    if (!r.aberto) return;
    if (estado.dia !== chave) estado.hora = null;
    estado.dia = chave;
    botoesDia().forEach(function (b) {
      var sel = b.getAttribute('data-dia') === chave;
      b.setAttribute('aria-pressed', sel ? 'true' : 'false');
      b.tabIndex = sel ? 0 : -1;
      if (sel) {
        try { b.scrollIntoView({ inline: 'nearest', block: 'nearest' }); } catch (e) {}
        if (opcoes && opcoes.foco) b.focus();
      }
    });
    renderHorarios();
    atualizarTudoDepoisDeEscolha();
  }

  function rotuloDia(chave) {
    return diaLongo(dataDaChave(chave), agora());
  }

  function renderHorarios() {
    var lista = $('lista-horarios');
    var aviso = $('aviso-dia');
    if (!lista) return;
    limpar(lista);
    if (aviso) { limpar(aviso); mostrar(aviso, false); }
    if (!estado.dia) return;
    var ags = lerAgendamentos();
    var hoje = agora();
    var r = resumoDia(cfg, estado.dia, hoje, ags);
    var horaAindaValida = false;
    r.slots.forEach(function (s) {
      var b = criar('button', 'horario');
      b.type = 'button';
      b.setAttribute('data-hora', minParaHHMM(s.inicio));
      b.appendChild(criar('span', 'hora mono', horaTexto(s.inicio)));
      if (s.ocupado) {
        b.classList.add('is-ocupado');
        b.setAttribute('aria-disabled', 'true');
        b.appendChild(criar('span', 'estado', T('agenda.ocupado', 'ocupado')));
      } else if (s.inicio === estado.hora) {
        horaAindaValida = true;
      }
      b.setAttribute('aria-pressed', !s.ocupado && s.inicio === estado.hora ? 'true' : 'false');
      anexarItem(lista, b);
    });
    if (!horaAindaValida) estado.hora = null;
    tabindexHorarios();

    if (r.livres === 0 && aviso) {
      var prox = proximoDiaComVaga(cfg, somarDias(r.data, 1), hoje, ags);
      var diaTxt = prox ? diaRelativo(prox.data, hoje) : '';
      var semNada = r.slots.length === 0;
      var frase = semNada
        ? (diferencaDias(hoje, r.data) === 0 ? T('agenda.semHorarioHoje', 'Hoje não tem mais horário.') : T('agenda.semHorarioDia', 'Sem horário nesse dia.')) + (prox ? ' ' + diaTxt.charAt(0).toUpperCase() + diaTxt.slice(1) + ' tem vaga.' : '')
        : fmt(T('agenda.diaLotado', 'Esse dia lotou. {dia} tem vaga.'), { dia: diaTxt.charAt(0).toUpperCase() + diaTxt.slice(1) });
      aviso.appendChild(criar('p', null, prox ? frase : T('agenda.agendaCheia', 'Agenda cheia nos próximos dias. Chame no WhatsApp.')));
      if (prox) {
        var irBtn = criar('button', 'btn-link', fmt(T('agenda.verHorarios', 'Ver horários de {dia}'), { dia: diaRelativo(prox.data, hoje) }));
        irBtn.type = 'button';
        irBtn.addEventListener('click', function () {
          var naFita = botoesDia().some(function (b) { return b.getAttribute('data-dia') === prox.chave; });
          if (!naFita) return;
          selecionarDia(prox.chave, { foco: true });
        });
        aviso.appendChild(irBtn);
      }
      mostrar(aviso, true);
    }
  }

  /* tabindex móvel: só um horário na ordem do Tab (o escolhido ou o primeiro livre);
     ocupados nunca recebem foco pelo Tab, mas seguem visíveis com "ocupado" */
  function botoesHora() {
    return Array.prototype.slice.call(($('lista-horarios') || DOC).querySelectorAll('.horario'));
  }
  function tabindexHorarios() {
    var bs = botoesHora();
    var livres = bs.filter(function (b) { return b.getAttribute('aria-disabled') !== 'true'; });
    var alvo = livres.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; })[0] || livres[0];
    bs.forEach(function (b) { b.tabIndex = b === alvo ? 0 : -1; });
  }
  function colunasHorarios(bs) {
    if (!bs.length) return 1;
    var topo = bs[0].offsetTop, n = 0;
    while (n < bs.length && bs[n].offsetTop === topo) n++;
    return Math.max(1, n);
  }

  function intervalosDiaSelecionado() {
    return intervalosDoDia(cfg, estado.dia, lerAgendamentos());
  }

  function selecionarHora(t) {
    estado.hora = t;
    Array.prototype.forEach.call(($('lista-horarios') || DOC).querySelectorAll('.horario'), function (b) {
      b.setAttribute('aria-pressed', hm(b.getAttribute('data-hora')) === t && !b.classList.contains('is-ocupado') ? 'true' : 'false');
    });
    tabindexHorarios();
    if (estado.servicoPendente) {
      var sp = estado.servicoPendente;
      estado.servicoPendente = null;
      if (cabe(sp)) { estado.servicoId = sp; notaAtalho(''); }
      else notaAtalho(fmt('{servico} não cabe nesse horário. Escolha outro serviço ou outro horário.', { servico: (servicoPorId(sp) || {}).nome || '' }));
    }
    atualizarTudoDepoisDeEscolha();
  }

  function cabe(servicoId) {
    if (estado.hora == null || !estado.dia) return false;
    var h = horarioDoDia(cfg, dataDaChave(estado.dia));
    if (!h) return false;
    var lista = servicosQueCabem(cfg, estado.hora, intervalosDiaSelecionado(), h.fecha);
    return lista.some(function (x) { return x.servico.id === servicoId && x.cabe; });
  }

  function tituloDoPasso(passo) {
    if (!passo) return null;
    var h = passo.querySelector('h2, h3, legend, .passo-titulo');
    if (!h) return null;
    if (!h.id) h.id = passo.id + '-titulo';
    return h.id;
  }

  function renderServicos() {
    var passo = $('passo-servico');
    var c = $('lista-servicos');
    if (!c) return;
    var focoDentro = DOC.activeElement && c.contains(DOC.activeElement);
    limpar(c);
    if (estado.hora == null || !estado.dia) { mostrar(passo, false); return; }
    var h = horarioDoDia(cfg, dataDaChave(estado.dia));
    if (!h) { mostrar(passo, false); return; }
    mostrar(passo, true);
    var lista = servicosQueCabem(cfg, estado.hora, intervalosDiaSelecionado(), h.fecha);
    if (estado.servicoId && !lista.some(function (x) { return x.servico.id === estado.servicoId && x.cabe; })) {
      estado.servicoId = null;
    }
    c.setAttribute('role', 'radiogroup');
    var tid = tituloDoPasso(passo);
    if (tid) c.setAttribute('aria-labelledby', tid);
    var primeiroCabe = null;
    lista.forEach(function (x) {
      var s = x.servico;
      var b = criar('button', 'servico-opcao');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('data-servico', s.id);
      b.appendChild(criar('span', 'nome', s.nome));
      b.appendChild(criar('span', 'duracao', (+s.duracaoMin || 0) + ' min'));
      b.appendChild(criar('span', 'preco', moeda(s.preco)));
      var sel = s.id === estado.servicoId;
      b.setAttribute('aria-checked', sel ? 'true' : 'false');
      if (!x.cabe) {
        b.classList.add('is-nao-cabe');
        b.setAttribute('aria-disabled', 'true');
        b.appendChild(criar('span', 'nota', T('agenda.naoCabe', 'não cabe nessa passada')));
        b.tabIndex = -1;
      } else {
        if (!primeiroCabe) primeiroCabe = b;
        b.tabIndex = sel ? 0 : -1;
      }
      anexarItem(c, b);
    });
    if (!estado.servicoId && primeiroCabe) primeiroCabe.tabIndex = 0;
    if (focoDentro) {
      var alvo = c.querySelector('[role="radio"][tabindex="0"]');
      if (alvo) alvo.focus();
    }
  }

  function renderChips() {
    var c = $('chips-profissionais');
    if (!c) return;
    limpar(c);
    var tid = tituloDoPasso($('passo-profissional'));
    if (tid && !c.getAttribute('aria-labelledby')) { c.setAttribute('role', 'group'); c.setAttribute('aria-labelledby', tid); }
    (cfg.profissionais || []).forEach(function (p) {
      var b = criar('button', 'chip');
      b.type = 'button';
      b.setAttribute('data-profissional', p.id);
      b.appendChild(criar('span', 'nome', p.nome));
      if (p.especialidade) b.appendChild(criar('small', null, p.especialidade));
      b.setAttribute('aria-pressed', p.id === estado.profissionalId ? 'true' : 'false');
      anexarItem(c, b);
    });
  }
  function atualizarChips() {
    Array.prototype.forEach.call(DOC.querySelectorAll('.chip[data-profissional]'), function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-profissional') === estado.profissionalId ? 'true' : 'false');
    });
  }

  /* atalho "O de sempre" */
  var atalhoBtn = null, atalhoNota = null;
  function notaAtalho(txt) {
    if (!atalhoNota) return;
    atalhoNota.textContent = txt || '';
  }
  function renderAtalho() {
    var raiz = $('atalho-sempre');
    if (!raiz) return;
    var ult = ultimoAgendamento();
    var s = ult && servicoPorId(ult.servicoId), p = ult && profPorId(ult.profissionalId);
    if (!s || !p) { mostrar(raiz, false); if (atalhoNota) mostrar(atalhoNota, false); return; }
    if (raiz.tagName === 'BUTTON') {
      atalhoBtn = raiz;
    } else if (!atalhoBtn) {
      atalhoBtn = criar('button', 'btn atalho-sempre');
      atalhoBtn.type = 'button';
      raiz.appendChild(atalhoBtn);
    }
    if (!atalhoNota) {
      atalhoNota = $('atalho-sempre-nota') || criar('p', 'nota atalho-nota');
      atalhoNota.setAttribute('aria-live', 'polite');
      if (!atalhoNota.parentNode) {
        if (raiz.tagName === 'BUTTON') raiz.insertAdjacentElement('afterend', atalhoNota);
        else raiz.appendChild(atalhoNota);
      }
    }
    mostrar(atalhoNota, true);
    limpar(atalhoBtn);
    atalhoBtn.appendChild(criar('span', null, T('agenda.deSempre', 'O de sempre') + ' · ' + s.nome + ' com ' + p.nome));
    atalhoBtn.setAttribute('data-servico', s.id);
    atalhoBtn.setAttribute('data-profissional', p.id);
    mostrar(raiz, true);
    if (!atalhoBtn._fioLigado) {
      atalhoBtn._fioLigado = true;
      atalhoBtn.addEventListener('click', usarAtalho);
    }
  }
  function usarAtalho() {
    var sid = atalhoBtn.getAttribute('data-servico'), pid = atalhoBtn.getAttribute('data-profissional');
    var s = servicoPorId(sid);
    if (profPorId(pid)) estado.profissionalId = pid;
    if (estado.hora == null) {
      estado.servicoPendente = sid;
      notaAtalho('Profissional escolhido. Agora escolha o horário: ' + (s ? s.nome : 'o serviço') + ' entra se couber.');
    } else if (cabe(sid)) {
      estado.servicoId = sid;
      notaAtalho('Pronto: ' + (s ? s.nome : '') + ' com ' + (profPorId(pid) || {}).nome + '.');
    } else {
      notaAtalho((s ? s.nome : 'Esse serviço') + ' não cabe nesse horário. Escolha outro horário ou outro serviço.');
    }
    atualizarTudoDepoisDeEscolha();
  }

  /* dados do cliente */
  var inputNome = null, inputWhats = null;
  function ligarDescricao(input, idErro) {
    if (!input || !$(idErro)) return;
    var atual = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (atual.indexOf(idErro) === -1) { atual.push(idErro); input.setAttribute('aria-describedby', atual.join(' ')); }
    var e = $(idErro);
    if (!e.getAttribute('aria-live')) e.setAttribute('aria-live', 'polite');
  }
  function errosDados() {
    return {
      nome: nomeValido(estado.nome) ? '' : T('agenda.erroNome', 'Escreva seu nome.'),
      whats: whatsValido(estado.whats) ? '' : T('agenda.erroWhats', 'Digite o WhatsApp com DDD.')
    };
  }
  function mostrarErros(forcar) {
    var e = errosDados();
    [['nome', inputNome, 'erro-nome'], ['whats', inputWhats, 'erro-whats']].forEach(function (x) {
      var mostrarEste = forcar || estado.tocado[x[0]] || estado.tentou;
      var msg = mostrarEste ? e[x[0]] : '';
      var el = $(x[2]);
      if (el) el.textContent = msg;
      if (x[1]) {
        if (msg) x[1].setAttribute('aria-invalid', 'true'); else x[1].removeAttribute('aria-invalid');
        var campo = x[1].closest && x[1].closest('.campo');
        if (campo) campo.classList.toggle('is-erro', !!msg);
      }
    });
    /* corrigiu os campos: o aviso geral antigo não fica pendurado */
    if (!forcar && !e.nome && !e.whats && tudoEscolhido()) erroGeral('');
    return e;
  }
  function iniciarDados() {
    inputNome = $('cliente-nome');
    inputWhats = $('cliente-whats');
    var ult = ultimoAgendamento();
    if (inputNome) {
      inputNome.setAttribute('autocomplete', inputNome.getAttribute('autocomplete') || 'name');
      if (!inputNome.getAttribute('maxlength')) inputNome.setAttribute('maxlength', '60');
      if (ult && ult.nome && !inputNome.value) inputNome.value = String(ult.nome).slice(0, 60);
      estado.nome = inputNome.value;
      ligarDescricao(inputNome, 'erro-nome');
      inputNome.addEventListener('input', function () {
        estado.nome = inputNome.value;
        if (estado.tocado.nome || estado.tentou) mostrarErros(false);
        atualizarResumo();
      });
      inputNome.addEventListener('blur', function () { estado.tocado.nome = true; mostrarErros(false); });
    }
    if (inputWhats) {
      inputWhats.setAttribute('inputmode', 'tel');
      if (!inputWhats.getAttribute('autocomplete')) inputWhats.setAttribute('autocomplete', 'tel-national');
      if (!inputWhats.getAttribute('placeholder')) inputWhats.setAttribute('placeholder', '(11) 91234-5678');
      if (ult && ult.whats && !inputWhats.value) inputWhats.value = mascararWhats(normalizarWhats(ult.whats));
      estado.whats = normalizarWhats(inputWhats.value);
      ligarDescricao(inputWhats, 'erro-whats');
      var anteriores = estado.whats;
      inputWhats.addEventListener('input', function (ev) {
        var d = normalizarWhats(inputWhats.value);
        /* apagar um caractere de máscara (parêntese, espaço, hífen) apaga o dígito anterior */
        if (ev && ev.inputType && ev.inputType.indexOf('delete') === 0 && d === anteriores) d = d.slice(0, -1);
        inputWhats.value = mascararWhats(d);
        anteriores = d;
        estado.whats = d;
        if (estado.tocado.whats || estado.tentou) mostrarErros(false);
        atualizarResumo();
      });
      inputWhats.addEventListener('blur', function () { estado.tocado.whats = true; mostrarErros(false); });
    }
  }

  function tudoEscolhido() {
    return !!(estado.dia && estado.hora != null && estado.servicoId && estado.profissionalId);
  }

  function linhasEscolha() {
    var s = estado.servicoId && servicoPorId(estado.servicoId);
    var p = estado.profissionalId && profPorId(estado.profissionalId);
    return [
      ['Dia', estado.dia ? rotuloDia(estado.dia) : '', null],
      ['Hora', estado.hora != null ? horaTexto(estado.hora) : '', 'hora'],
      ['Serviço', s ? s.nome + ' · ' + s.duracaoMin + ' min' : '', null],
      ['Profissional', p ? p.nome : '', null],
      ['Valor', s ? moeda(s.preco) : '', 'preco']
    ];
  }
  function preencherDl(dl, linhas) {
    limpar(dl);
    linhas.forEach(function (l) {
      if (!l[1]) return;
      dl.appendChild(criar('dt', null, l[0]));
      dl.appendChild(criar('dd', l[2], l[1]));
    });
  }

  function atualizarResumo() {
    var r = $('resumo-escolha');
    if (r) {
      var corpo = r.querySelector('[data-gerado="resumo"]');
      if (!corpo) {
        var dlAntigo = r.querySelector('dl, .vazio-resumo');
        corpo = criar('div');
        corpo.setAttribute('data-gerado', 'resumo');
        corpo.setAttribute('aria-live', 'polite');
        if (dlAntigo && dlAntigo.parentNode) dlAntigo.parentNode.replaceChild(corpo, dlAntigo);
        else r.appendChild(corpo);
      }
      limpar(corpo);
      var linhas = linhasEscolha().filter(function (l) { return l[1]; });
      if (!linhas.length) {
        corpo.appendChild(criar('p', 'vazio-resumo', T('agenda.resumoVazio', 'Escolha o dia e o horário. O resto aparece aqui.')));
      } else {
        var dl = criar('dl');
        preencherDl(dl, linhas);
        corpo.appendChild(dl);
      }
    }
    mostrar($('bloco-confirmar'), tudoEscolhido());
  }

  var revelado = { profissional: false, dados: false };
  function revelarPassos() {
    if (estado.servicoId || estado.profissionalId) revelado.profissional = true;
    if (estado.profissionalId) revelado.dados = true;
    mostrar($('passo-profissional'), revelado.profissional);
    mostrar($('passo-dados'), revelado.dados);
  }

  function atualizarTudoDepoisDeEscolha() {
    renderServicos();
    revelarPassos();
    atualizarChips();
    atualizarResumo();
    var eg = $('erro-geral');
    if (eg && eg.textContent && tudoEscolhido() && !mostrarErrosSilencioso()) eg.textContent = '';
  }
  function mostrarErrosSilencioso() {
    var e = errosDados();
    return !!(e.nome || e.whats);
  }

  /* ---------- delegação de cliques e teclado ---------- */
  function ligarEventosFluxo() {
    var fita = $('fita-dias');
    if (fita) {
      fita.addEventListener('click', function (ev) {
        var b = ev.target.closest && ev.target.closest('.dia');
        if (!b || !fita.contains(b)) return;
        if (b.getAttribute('aria-disabled') === 'true') return;
        selecionarDia(b.getAttribute('data-dia'));
      });
      fita.addEventListener('keydown', function (ev) {
        var teclas = { ArrowRight: 1, ArrowLeft: -1, Home: 'ini', End: 'fim' };
        if (!(ev.key in teclas)) return;
        var bs = botoesDia();
        var i = bs.indexOf(DOC.activeElement);
        if (i === -1) return;
        ev.preventDefault();
        var k = teclas[ev.key];
        var j = k === 'ini' ? 0 : k === 'fim' ? bs.length - 1 : Math.max(0, Math.min(bs.length - 1, i + k));
        bs.forEach(function (b, n) { b.tabIndex = n === j ? 0 : -1; });
        bs[j].focus();
        try { bs[j].scrollIntoView({ inline: 'nearest', block: 'nearest' }); } catch (e) {}
      });
      /* se o foco sai da fita sem escolher, o tabindex volta para o dia selecionado */
      fita.addEventListener('focusout', function (ev) {
        if (ev.relatedTarget && fita.contains(ev.relatedTarget)) return;
        botoesDia().forEach(function (b) { b.tabIndex = b.getAttribute('aria-pressed') === 'true' ? 0 : -1; });
      });
    }

    var lh = $('lista-horarios');
    if (lh) {
      lh.addEventListener('click', function (ev) {
        var b = ev.target.closest && ev.target.closest('.horario');
        if (!b || !lh.contains(b) || b.getAttribute('aria-disabled') === 'true') return;
        selecionarHora(hm(b.getAttribute('data-hora')));
      });
      /* setas andam pela grade (pulando os ocupados), Home/End nas pontas; Tab sai do grupo */
      lh.addEventListener('keydown', function (ev) {
        var bs = botoesHora();
        var i = bs.indexOf(DOC.activeElement);
        if (i === -1) return;
        var livre = function (b) { return b.getAttribute('aria-disabled') !== 'true'; };
        var cols = colunasHorarios(bs);
        var passo = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[ev.key];
        var j = -1;
        if (ev.key === 'Home' || ev.key === 'End') {
          var ls = bs.filter(livre);
          if (ls.length) j = bs.indexOf(ev.key === 'Home' ? ls[0] : ls[ls.length - 1]);
        } else if (passo) {
          var dir = passo > 0 ? 1 : -1;
          for (var k = i + passo; k >= 0 && k < bs.length; k += dir) { if (livre(bs[k])) { j = k; break; } }
        } else return;
        ev.preventDefault();
        if (j === -1) return;
        bs.forEach(function (b, n) { b.tabIndex = n === j ? 0 : -1; });
        bs[j].focus();
      });
      lh.addEventListener('focusout', function (ev) {
        if (ev.relatedTarget && lh.contains(ev.relatedTarget)) return;
        tabindexHorarios();
      });
    }

    DOC.addEventListener('click', function (ev) {
      var alvo = ev.target.closest ? ev.target : null;
      if (!alvo) return;
      var s = alvo.closest('.servico-opcao[data-servico]');
      if (s) {
        if (s.getAttribute('aria-disabled') === 'true') return;
        escolherServico(s.getAttribute('data-servico'), false);
        return;
      }
      var c = alvo.closest('.chip[data-profissional]');
      if (c) {
        var pid = c.getAttribute('data-profissional');
        estado.profissionalId = estado.profissionalId === pid ? null : pid;
        atualizarTudoDepoisDeEscolha();
      }
    });
    /* radiogroup: setas movem e selecionam, só entre os que cabem */
    DOC.addEventListener('keydown', function (ev) {
      var atual = DOC.activeElement;
      if (!atual || !atual.classList || !atual.classList.contains('servico-opcao')) return;
      var dir = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[ev.key];
      if (!dir) return;
      var grupo = atual.closest('[role="radiogroup"]');
      if (!grupo) return;
      var ops = Array.prototype.slice.call(grupo.querySelectorAll('.servico-opcao:not([aria-disabled="true"])'));
      var i = ops.indexOf(atual);
      if (i === -1 || !ops.length) return;
      ev.preventDefault();
      var prox = ops[(i + dir + ops.length) % ops.length];
      escolherServico(prox.getAttribute('data-servico'), true);
    });
  }

  function escolherServico(id, foco) {
    if (!cabe(id)) return;
    estado.servicoId = id;
    estado.servicoPendente = null;
    var c = $('lista-servicos');
    if (c) {
      Array.prototype.forEach.call(c.querySelectorAll('.servico-opcao'), function (b) {
        var sel = b.getAttribute('data-servico') === id;
        b.setAttribute('aria-checked', sel ? 'true' : 'false');
        if (b.getAttribute('aria-disabled') !== 'true') b.tabIndex = sel ? 0 : -1;
        if (sel && foco) b.focus();
      });
    }
    atualizarChips();
    revelarPassos();
    atualizarResumo();
  }

  /* ---------- 6) CONFIRMAR ---------- */
  function iniciarTira() {
    var tira = $('tira-confirmar');
    if (!tira) return;
    if (reduzMovimento) { mostrar(tira, false); return; }
    var fx = W.FioEfeito;
    if (fx && typeof fx.criarTira === 'function') {
      if (tiraCriada) return;
      try {
        fx.criarTira(tira, { rotulo: T('agenda.tira', 'Passe a navalha para confirmar') });
        tiraCriada = true;
        mostrar(tira, true);
      } catch (e) {
        mostrar(tira, false);
      }
    } else {
      mostrar(tira, false);
    }
  }
  function resetarTira() {
    var tira = $('tira-confirmar');
    var fx = W.FioEfeito;
    if (tira && fx && typeof fx.resetarTira === 'function') {
      try { fx.resetarTira(tira); } catch (e) {}
    }
  }

  function erroGeral(msg) {
    var eg = $('erro-geral');
    if (eg) {
      if (!eg.getAttribute('role')) eg.setAttribute('role', 'alert');
      eg.textContent = msg || '';
    }
  }

  function focarPrimeiraFalta() {
    var alvo = null;
    if (!estado.dia) alvo = $('fita-dias') && $('fita-dias').querySelector('.dia[tabindex="0"]');
    else if (estado.hora == null) alvo = $('lista-horarios') && $('lista-horarios').querySelector('.horario:not([aria-disabled="true"])');
    else if (!estado.servicoId) alvo = DOC.querySelector('.servico-opcao[tabindex="0"]');
    else if (!estado.profissionalId) alvo = DOC.querySelector('.chip[data-profissional]');
    else {
      var e = errosDados();
      if (e.nome) alvo = inputNome; else if (e.whats) alvo = inputWhats;
    }
    if (alvo && alvo.focus) alvo.focus();
  }

  function confirmar(origem) {
    if (estado.enviando) return;
    estado.tentou = true;
    erroGeral('');
    var erros = mostrarErros(true);
    if (!tudoEscolhido()) {
      erroGeral(T('agenda.erroEscolha', 'Falta escolher dia, horário, serviço e profissional.'));
      focarPrimeiraFalta();
      resetarTira();
      return;
    }
    if (erros.nome || erros.whats) {
      erroGeral(erros.nome && erros.whats ? T('agenda.erroAmbos', 'Confira seu nome e seu WhatsApp.') : (erros.nome || erros.whats));
      focarPrimeiraFalta();
      resetarTira();
      return;
    }

    /* outra aba pode ter reservado: confere de novo com o que está gravado agora */
    var ags = lerAgendamentos();
    var hoje = agora();
    var r = resumoDia(cfg, estado.dia, hoje, ags);
    var slot = r.slots.filter(function (s) { return s.inicio === estado.hora; })[0];
    var s = servicoPorId(estado.servicoId), p = profPorId(estado.profissionalId);
    var cabeAinda = slot && !slot.ocupado && r.horario &&
      servicosQueCabem(cfg, estado.hora, r.intervalos, r.horario.fecha).some(function (x) { return x.servico.id === s.id && x.cabe; });
    if (!cabeAinda) {
      estado.hora = null;
      renderHorarios();
      atualizarTudoDepoisDeEscolha();
      atualizarLetreiro();
      erroGeral(T('agenda.horarioOcupado', 'Esse horário acabou de ser ocupado. Escolha outro, por favor.'));
      focarPrimeiraFalta();
      resetarTira();
      return;
    }

    estado.enviando = true;
    var nome = String(estado.nome).trim().replace(/\s+/g, ' ').slice(0, 60);
    var whats = normalizarWhats(estado.whats);
    var reg = {
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      data: estado.dia,
      inicio: minParaHHMM(estado.hora),
      duracaoMin: +s.duracaoMin,
      servicoId: s.id,
      profissionalId: p.id,
      nome: nome,
      whats: whats,
      criadoEm: new Date().toISOString()
    };
    ags.push(reg);
    gravarAgendamentos(ags);
    estado.ultimaReserva = reg;

    try { W.dispatchEvent(new CustomEvent('fio:reservado', { detail: { id: reg.id, origem: origem || 'botao' } })); } catch (e) {}

    var neg = cfg.negocio || {};
    var msg = fmt(cfg.textos && cfg.textos.mensagemWhats, {
      negocio: neg.nome || '',
      servico: s.nome,
      profissional: p.nome,
      dia: rotuloDia(reg.data),
      hora: horaTexto(estado.hora),
      preco: moeda(s.preco),
      nome: nome,
      whats: mascararWhats(whats)
    });
    var url = 'https://wa.me/' + soDigitos(neg.whatsapp) + '?text=' + encodeURIComponent(msg);
    /* dentro do mesmo handler do gesto, para o navegador não bloquear */
    try { W.open(url, '_blank', 'noopener'); } catch (e) {}

    mostrarEspelho(reg, url);
    renderFita();
    renderHorarios();
    atualizarLetreiro();
    renderAtalho();
  }

  var escondidos = [];
  function mostrarEspelho(reg, url) {
    var esp = $('espelho');
    if (!esp) return;
    escondidos = [$('form-agenda')].filter(function (el) { return el; }).filter(function (el) { return !el.hidden; });
    escondidos.forEach(function (el) { el.hidden = true; });
    var dados = $('espelho-dados');
    if (dados) {
      var dl = dados.tagName === 'DL' ? dados : (dados.querySelector('dl') || dados.appendChild(criar('dl')));
      var s = servicoPorId(reg.servicoId), p = profPorId(reg.profissionalId);
      preencherDl(dl, [
        [T('espelho.servico', 'Serviço'), s ? s.nome : '', null],
        [T('espelho.profissional', 'Profissional'), p ? p.nome : '', null],
        [T('espelho.dia', 'Dia'), rotuloDia(reg.data), null],
        [T('espelho.hora', 'Hora'), horaTexto(hm(reg.inicio)), 'hora'],
        [T('espelho.valor', 'Valor'), s ? moeda(s.preco) : '', 'preco']
      ]);
    }
    var link = $('espelho-whats');
    if (link) {
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      if (!link.textContent.trim()) link.textContent = T('espelho.abrirWhats', 'Enviar no WhatsApp');
    }
    mostrar(esp, true);
    if (!esp.hasAttribute('tabindex')) esp.setAttribute('tabindex', '-1');
    try { esp.focus({ preventScroll: false }); } catch (e) { esp.focus(); }
    try { esp.scrollIntoView({ block: 'start', behavior: reduzMovimento ? 'auto' : 'smooth' }); } catch (e) {}
  }

  function novoAgendamento() {
    var esp = $('espelho');
    mostrar(esp, false);
    escondidos.forEach(function (el) { el.hidden = false; });
    escondidos = [];
    estado.dia = null;
    estado.hora = null;
    estado.servicoId = null;
    estado.servicoPendente = null;
    estado.tentou = false;
    estado.tocado = { nome: false, whats: false };
    estado.enviando = false;
    revelado = { profissional: false, dados: false };
    erroGeral('');
    notaAtalho('');
    mostrarErros(false);
    resetarTira();
    renderFita();
    renderHorarios();
    renderAtalho();
    atualizarTudoDepoisDeEscolha();
    var b = $('fita-dias') && $('fita-dias').querySelector('.dia[aria-pressed="true"]');
    if (b) {
      b.focus();
      try { b.scrollIntoView({ inline: 'nearest', block: 'nearest' }); } catch (e) {}
    }
  }

  function ligarConfirmacao() {
    W.addEventListener('fio:confirmar', function (ev) {
      var d = ev && ev.detail;
      if (!d || d.origem !== 'tira') return;
      var tira = $('tira-confirmar');
      if (d.el && tira && d.el !== tira && !tira.contains(d.el)) return;
      confirmar('tira');
    });
    var b = $('confirmar-sem-arrastar');
    if (b) {
      if (!b.textContent.trim()) b.textContent = T('agenda.semArrastar', 'Confirmar sem arrastar');
      /* type="submit": clique, Enter nos campos e a tecla "Ir" do celular caem todos no submit abaixo */
    }
    var form = $('fita-dias') && $('fita-dias').closest('form');
    if (form) form.addEventListener('submit', function (ev) { ev.preventDefault(); confirmar('botao'); });
    var novo = $('espelho-novo');
    if (novo) novo.addEventListener('click', novoAgendamento);
  }

  /* ---------- boot ---------- */
  function semConfig() {
    var l = $('letreiro');
    if (l) {
      l.textContent = 'Agenda indisponível: config.js não carregou.';
      l.setAttribute('data-estado', 'fechado');
    }
    var lh = $('lista-horarios');
    if (lh) { limpar(lh); lh.appendChild(criar(ehLista(lh) ? 'li' : 'p', 'vazio', 'Não deu para carregar a agenda. Chame a gente no WhatsApp.')); }
  }

  function recarregar() {
    if (!cfg) return;
    renderFita();
    renderHorarios();
    renderChips();
    renderAtalho();
    atualizarTudoDepoisDeEscolha();
    atualizarLetreiro();
  }

  /* o botão flutuante do WhatsApp sai de cena quando o couro, os campos ou a
     confirmação passam pela faixa de baixo da tela (onde ele mora), para não
     tapar a navalha, o "Agendar horário" na zona do polegar nem a tira */
  function vigiarWhatsFlutuante() {
    var fab = $('whats-flutuante');
    if (!fab || !('IntersectionObserver' in W)) return;
    var alvos = ['couro', 'passo-dados', 'bloco-confirmar'].map($).filter(Boolean);
    var dentro = {};
    var io = new W.IntersectionObserver(function (ents) {
      ents.forEach(function (e) { dentro[e.target.id] = e.isIntersecting; });
      var tapa = Object.keys(dentro).some(function (k) { return dentro[k]; });
      fab.classList.toggle('is-sobre-couro', tapa);
    }, { rootMargin: '-78% 0px 0px 0px' });
    alvos.forEach(function (el) { io.observe(el); });
  }

  /* o "Agendar horário" na zona do polegar leva para #agendar: com a agenda na tela
     ele não tem para onde levar e só tapa o "Confirmar sem arrastar", os campos e o espelho */
  function vigiarPolegar() {
    var btn = $('btn-agendar'), agenda = $('agendar');
    if (!btn || !agenda || !('IntersectionObserver' in W)) return;
    new W.IntersectionObserver(function (ents) {
      btn.classList.toggle('is-na-agenda', ents[ents.length - 1].isIntersecting);
    }).observe(agenda);
  }

  /* LGPD: o cliente apaga do aparelho o que a página guardou para o "de sempre" */
  function ligarEsquecer() {
    var b = $('esquecer-dados');
    if (!b) return;
    b.addEventListener('click', function () {
      armazem.remover(CHAVE_AG);
      if (inputNome) inputNome.value = '';
      if (inputWhats) inputWhats.value = '';
      estado.nome = ''; estado.whats = '';
      estado.ultimaReserva = null;
      estado.tocado.nome = false; estado.tocado.whats = false;
      mostrarErros(false);
      renderAtalho();
      renderFita();
      renderHorarios();
      atualizarTudoDepoisDeEscolha();
      atualizarLetreiro();
      var n = $('nota-esquecer');
      if (n) n.textContent = T('agenda.esquecido', 'Pronto: seu nome, seu WhatsApp e suas reservas saíram deste aparelho.');
    });
  }

  function boot() {
    cfg = W.FIO_CONFIG;
    if (!cfg || typeof cfg !== 'object' || !cfg.funcionamento || !Array.isArray(cfg.servicos)) {
      cfg = null;
      semConfig();
      return;
    }
    try { reduzMovimento = !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}

    aplicarCores();
    preencherTextos();
    aplicarPagina();
    renderManifesto();
    iniciarTema();
    renderPrecos();
    renderProfissionais();
    renderAvaliacoes();
    renderContato();
    renderFuncionamento();

    mostrar($('passo-servico'), false);
    mostrar($('bloco-confirmar'), false);
    mostrar($('espelho'), false);
    iniciarDados();
    renderChips();
    renderFita();
    renderHorarios();
    renderAtalho();
    atualizarTudoDepoisDeEscolha();
    atualizarLetreiro();
    ligarEventosFluxo();
    ligarConfirmacao();

    vigiarWhatsFlutuante();
    vigiarPolegar();
    ligarEsquecer();
    iniciarTira();
    if (!tiraCriada && !reduzMovimento) {
      /* efeito.js pode publicar o FioEfeito só no DOMContentLoaded */
      var tentar = function () { iniciarTira(); };
      DOC.addEventListener('DOMContentLoaded', tentar, { once: true });
      W.addEventListener('load', tentar, { once: true });
    }
    try {
      var mq = W.matchMedia('(prefers-reduced-motion: reduce)');
      var aoMudar = function () {
        reduzMovimento = mq.matches;
        if (reduzMovimento) mostrar($('tira-confirmar'), false); else iniciarTira();
        if (!reduzMovimento && tiraCriada) mostrar($('tira-confirmar'), true);
      };
      if (mq.addEventListener) mq.addEventListener('change', aoMudar);
    } catch (e) {}

    setInterval(function () {
      atualizarLetreiro();
      var lh = $('lista-horarios');
      var hoje = chaveData(agora());
      if (estado.dia === hoje && !estado.enviando && !(lh && lh.contains(DOC.activeElement))) {
        renderHorarios();
        atualizarTudoDepoisDeEscolha();
      }
    }, 60000);
    DOC.addEventListener('visibilitychange', function () { if (!DOC.hidden) atualizarLetreiro(); });
    W.addEventListener('storage', function (ev) {
      if (ev.key === CHAVE_AG && !estado.enviando) recarregar();
    });
  }

  /* ---------- API para o QA ---------- */
  var api = { recarregar: recarregar, _puro: puro };
  Object.defineProperty(api, 'estado', {
    enumerable: true,
    get: function () {
      return Object.freeze({
        dia: estado.dia,
        hora: estado.hora == null ? null : minParaHHMM(estado.hora),
        servicoId: estado.servicoId,
        profissionalId: estado.profissionalId,
        temNome: !!String(estado.nome || '').trim(),
        temWhats: !!estado.whats,
        enviando: estado.enviando,
        ultimaReserva: estado.ultimaReserva ? Object.freeze(Object.assign({}, estado.ultimaReserva)) : null,
        armazenamento: lsFalhou ? 'memoria' : 'localStorage'
      });
    }
  });
  W.FioAgenda = api;

  if (DOC && DOC.getElementById) {
    if (DOC.readyState === 'loading') DOC.addEventListener('DOMContentLoaded', boot, { once: true });
    else boot();
  }
})();
