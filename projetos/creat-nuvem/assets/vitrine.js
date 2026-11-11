/* =====================================================================
   Porta Aberta · vitrine.js (T5 · Pixel)
   Script clássico (sem import/export). Um arquivo para todas as páginas
   da vitrine; cada página diz quem é em <body data-pagina="...">.
   Contratos: docs/ARQUITETURA.md e docs/CONTRATOS-DETALHE.md (a) a (j).
   - Placa: window.CreatPlaca (ritual/placa.js, T6), opcional.
   - Som: window.CreatSom (assets/som/creat-som.js, T7), opcional.
   - Prévia: previa/#k=&n=&c=&p=&utm_* (T4), só por iframe.
   - Checkout: window.CREAT_CHECKOUT (checkout.config.js).
   Regras que este arquivo garante:
   - Nome, cidade, WhatsApp, e-mail e endereço nunca vão para query string
     nem para analytics. O WhatsApp do Teste de verdade nunca é gravado.
   - Preço de inauguração (ADR-005, que revisa o ADR-003): vale com precos.json
     válido, inauguracao.ativa, vagasRestantes > 0 e atualizado_em de até 7 dias.
     Contadores ("Restam X", "vagas de hoje") desligados (checkout.config.js
     contadoresAoVivo: false, decisão D1) até o número vir de pedido pago gravado em
     servidor; mesmo ligados, só com dado de até 48 h. Fora disso: preço padrão, sem
     contador, sem mensagem de erro.
   - Medição: antes de qualquer script de medição, nome e cidade saem do
     fragmento e o endereço é limpo com history.replaceState (docs/MEDICAO-FUNIL.md).
   - Todo texto vindo de dado entra por textContent, nunca innerHTML.
   ===================================================================== */
(function () {
  'use strict';

  var W = window, D = document;
  var SCRIPT = D.currentScript;
  var RAIZ = new URL('../', SCRIPT && SCRIPT.src ? SCRIPT.src : location.href).href;
  var CK = W.CREAT_CHECKOUT || null;
  var MED = W.CREAT_MEDICAO || {};
  var PAGINA = (D.body && D.body.getAttribute('data-pagina')) || 'simples';
  var MOV_REDUZIDO = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  var H48 = 48 * 3600 * 1000, FOLGA = 5 * 60 * 1000, D7 = 7 * 24 * 3600 * 1000;
  var NICHOS = ['barbearia', 'salao', 'academia'];
  var ROTULO_NICHO = { barbearia: 'Barbearia', salao: 'Salão e estética', academia: 'Academia e studio' };
  var ESPERA = ['pet', 'restaurante', 'oficina', 'tatuagem', 'outro'];
  var PLANOS = ['aberto', 'vitrine', 'aberto_anual', 'vitrine_anual'];
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var RE_NOME = /^[\p{L}\p{N} &.'-]+$/u, RE_CIDADE = /^[\p{L}\p{N} .'-]+$/u, RE_UTM = /^[A-Za-z0-9._-]{1,64}$/;
  // E-mail: a mesma regra do servidor (schema/pedido-regras.mjs RE.email), para o registro nunca voltar 422.
  var RE_RESP = /^[\p{L} .'-]+$/u, RE_EMAIL = /^[^\s@:;<>"',]{1,64}@[^\s@:;<>"',.]{1,63}(\.[^\s@:;<>"',.]{1,63})+$/;
  // Pedido no servidor (docs/PEDIDO-API.md): id de 10, segredo de 128 bits, número do pagamento do Mercado Pago.
  var RE_ID = /^PA-[0-9A-Z]{10}$/, RE_ID_ANTIGO = /^PA-[0-9A-HJKMNP-TV-Z]{8}$/, RE_SEGREDO = /^[A-Za-z0-9_-]{21}[AQgw]$/, RE_PAGAMENTO = /^\d{6,14}$/;
  var PRACAS = ['feira', 'salvador-rms', 'fortaleza', 'recife', 'petrolina-juazeiro', 'aracaju'];
  // Produto do catálogo do servidor por chave de link (checkout.config.js) e por produto= da volta do Mercado Pago.
  var PRODUTO_DA_CHAVE = { aberturaInauguracao: 'pa-abertura-inauguracao-2026-11', aberturaPadrao: 'pa-abertura-2026-11' };
  var CATALOGO = { 'pa-abertura-inauguracao-2026-11': 297, 'pa-abertura-2026-11': 497, 'pa-teste': 1 };
  var PRODUTO_DA_VOLTA = { 'pa-abertura-inauguracao': 'pa-abertura-inauguracao-2026-11', 'pa-abertura': 'pa-abertura-2026-11', 'pa-teste': 'pa-teste' };
  var PORTAL_ASSINANTE = 'https://billing.stripe.com/p/login/7sYbIV5JIe7nfvR09r2cg00';   // docs/INTEGRACAO-PAGAMENTO.md
  var DDD = '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(' ');
  var DIAS_PEDIDO = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];       // ordem do PEDIDO v1
  var DIA_IDX = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };   // 0 = domingo (tenant)
  var DIA_NOME = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  /* ------------------------------------------------------------ utilidades */
  function $(s, r) { return (r || D).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || D).querySelectorAll(s)); }
  function el(tag, attrs, texto) {
    var e = D.createElement(tag);
    if (attrs) for (var k in attrs) { if (attrs[k] === null || attrs[k] === undefined || attrs[k] === false) continue; if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k] === true ? '' : attrs[k]); }
    if (texto !== undefined && texto !== null) e.textContent = texto;
    return e;
  }
  function t(str, vars) { return String(str).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] !== undefined ? vars[k] : m; }); }
  function milhar(n) { var s = String(Math.round(n)); return s.replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  /* Teclado de celular troca ' por ’ sozinho: "D’Ávila" tem de valer como "D'Ávila" (achado da conferência, 11/11). */
  function limparNome(v) { return String(v || '').replace(/[\u2018\u2019\u02BC\u00B4`]/g, "'").replace(/\s+/g, ' ').trim(); }
  function nomeValido(v) { return v.length >= 1 && v.length <= 40 && RE_NOME.test(v); }
  function cidadeValida(v) { return v.length >= 1 && v.length <= 40 && RE_CIDADE.test(v); }
  function cortar28(v) { if (v.length <= 28) return v; var c = v.slice(0, 28); var i = c.lastIndexOf(' '); return (i > 8 ? c.slice(0, i) : c).trim(); }
  /* Endereço público (pacote H1): links que a pessoa copia ou que ficam gravados no pedido nascem no canônico
     (checkout.config.js, endereco.canonico). Navegação interna continua relativa (RAIZ), na mesma origem. */
  function enderecoPublico() {
    var c = CK && CK.endereco && CK.endereco.canonico;
    return typeof c === 'string' && /^https:\/\/[a-z0-9.-]+$/.test(c) ? c + '/' : RAIZ;
  }
  function somFn(nome) { try { if (W.CreatSom && typeof W.CreatSom[nome] === 'function') W.CreatSom[nome](); } catch (e) {} }

  /* localStorage sempre em try/catch, com reserva em memória (contrato f) */
  var memoria = {};
  var guarda = {
    ok: (function () { try { var k = '__creat_teste'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; } })(),
    ler: function (k) { try { var v = localStorage.getItem(k); return v === null ? (k in memoria ? memoria[k] : null) : v; } catch (e) { return k in memoria ? memoria[k] : null; } },
    gravar: function (k, v) { memoria[k] = v; try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    apagar: function (k) { delete memoria[k]; try { localStorage.removeItem(k); } catch (e) {} }
  };
  function lerJSONGuardado(k) { try { var v = guarda.ler(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }

  var avisoTimer;
  function aviso(msg) {
    var a = $('#aviso');
    if (!a) { a = el('div', { id: 'aviso', class: 'aviso', role: 'status', 'aria-live': 'polite' }); D.body.appendChild(a); }
    a.textContent = msg; a.classList.add('on');
    clearTimeout(avisoTimer); avisoTimer = setTimeout(function () { a.classList.remove('on'); }, 5200);
  }

  function dispositivo() {
    var w = W.innerWidth || 1024;
    var grosso = W.matchMedia && W.matchMedia('(pointer: coarse)').matches;
    if (w < 720) return 'movel';
    if (w < 1100 && grosso) return 'tablet';
    return 'desktop';
  }
  function ehDesktop() { return (W.innerWidth || 0) >= 1000 && !(W.matchMedia && W.matchMedia('(pointer: coarse)').matches); }

  /* ------------------------------------------------------------ WhatsApp */
  function soDigitos(v) { return String(v || '').replace(/\D+/g, ''); }
  function mascaraBR(v) {
    var d = soDigitos(v); if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2); d = d.slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return '(' + d;
    var ddd = d.slice(0, 2), r = d.slice(2);
    if (r.length <= 4) return '(' + ddd + ') ' + r;
    if (d.length === 11) return '(' + ddd + ') ' + r.slice(0, 5) + '-' + r.slice(5);
    return '(' + ddd + ') ' + r.slice(0, 4) + '-' + r.slice(4);
  }
  // Devolve 55 + DDD + número, ou null. Celular: 11 dígitos começando com 9 depois do DDD. Fixo: 10 dígitos (2 a 5).
  function normalizarWhats(v) {
    var d = soDigitos(v); if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);
    if (d.length !== 10 && d.length !== 11) return null;
    if (DDD.indexOf(d.slice(0, 2)) === -1) return null;
    if (d.length === 11 && d.charAt(2) !== '9') return null;
    if (d.length === 10 && !/[2-5]/.test(d.charAt(2))) return null;
    if (/^(\d)\1+$/.test(d.slice(2))) return null;
    var n = '55' + d;
    return (CK && CK.whatsappValido && !CK.whatsappValido(n)) ? null : n;
  }
  function ligarMascara(input) {
    input.addEventListener('input', function () {
      var antes = input.value, m = mascaraBR(antes);
      if (m !== antes) { input.value = m; try { input.setSelectionRange(m.length, m.length); } catch (e) {} }
    });
  }
  function suporteOk() { return !!(CK && CK.whatsappValido(CK.whatsappSuporte)); }
  function linkWhats(numero, texto) { return 'https://wa.me/' + numero + '?text=' + encodeURIComponent(texto); }
  function emailSuporte() { return (CK && CK.emailSuporte) || 'mttcreatt@gmail.com'; }
  function linkEmail(assunto, corpo) { return 'mailto:' + emailSuporte() + '?subject=' + encodeURIComponent(assunto) + '&body=' + encodeURIComponent(corpo); }
  function abrirExterno(url) {
    var a = el('a', { href: url, target: '_blank', rel: 'noopener noreferrer' });
    a.style.display = 'none'; D.body.appendChild(a); a.click(); a.remove();
  }

  /* ------------------------------------------------------------ funções do servidor (docs/PEDIDO-API.md)
     Rotas na mesma origem: /api/pa/<nome>, só POST com JSON, sem cookie. Fora de https (arquivo local, servidor de
     desenvolvimento) nada é chamado; o teste liga com window.__creatApi = '/api/pa/' antes do script. */
  var API = (function () {
    try {
      if (typeof W.__creatApi === 'string' && /^\/[A-Za-z0-9\/_-]*\/$/.test(W.__creatApi)) return location.origin + W.__creatApi;
      return location.protocol === 'https:' ? location.origin + '/api/pa/' : null;
    } catch (e) { return null; }
  })();
  // Chamada que espera a resposta. Devolve sempre {status, json}; status 0 = rede, tempo ou sem API.
  function chamar(nome, corpo, tempoMs) {
    if (!API || !W.fetch) return Promise.resolve({ status: 0, json: null });
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var tempo = ctrl ? setTimeout(function () { ctrl.abort(); }, tempoMs || 12000) : 0;
    return fetch(API + nome, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        var tipo = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
        var corpoJ = /json/i.test(tipo) ? r.json().catch(function () { return null; }) : Promise.resolve(null);
        return corpoJ.then(function (j) { return { status: r.status, json: j && typeof j === 'object' ? j : null }; });
      }, function () { return { status: 0, json: null }; })
      .then(function (x) { clearTimeout(tempo); return x; });
  }
  // Envio que não espera nem segura a navegação: fetch com keepalive (sobrevive à troca de página); sem ele, sendBeacon.
  function enviarSolto(nome, corpo) {
    if (!API) return false;
    var json = JSON.stringify(corpo);
    try {
      if (W.fetch) {
        fetch(API + nome, { method: 'POST', headers: { 'content-type': 'application/json' }, body: json, credentials: 'omit', cache: 'no-store', keepalive: true, referrerPolicy: 'no-referrer' }).catch(function () {});
        return true;
      }
    } catch (e) {}
    try { if (navigator.sendBeacon) return navigator.sendBeacon(API + nome, new Blob([json], { type: 'application/json' })); } catch (e) {}
    return false;
  }

  /* ------------------------------------------------------------ fragmento (contrato c) */
  function lerUtm(params) {
    var u = {};
    UTM.forEach(function (k) { var v = params.get(k); if (v && RE_UTM.test(v)) u[k] = v; });
    return u;
  }
  function lerFragmento(hash) {
    var s = String(hash || '').replace(/^#/, '');
    var o = { k: null, n: null, c: null, p: 1, plano: null, utm: {} };
    if (!s || s.length > 600) return o;
    var q; try { q = new URLSearchParams(s); } catch (e) { return o; }
    var k = q.get('k'); if (NICHOS.indexOf(k) !== -1) o.k = k;
    var n = limparNome(q.get('n')); if (n && nomeValido(n)) o.n = n;
    var c = limparNome(q.get('c')); if (c && cidadeValida(c)) o.c = c;
    var p = q.get('p'); if (/^[123]$/.test(p || '')) o.p = +p;
    var pl = q.get('plano'); if (PLANOS.indexOf(pl) !== -1) o.plano = pl;
    o.utm = lerUtm(q);
    return o;
  }
  function montarFragmento(o, comPlano) {
    var partes = [];
    if (comPlano && o.plano) partes.push('plano=' + o.plano);
    if (o.k) partes.push('k=' + o.k);
    if (o.n) partes.push('n=' + encodeURIComponent(o.n));
    if (o.c) partes.push('c=' + encodeURIComponent(o.c));
    if (o.k) partes.push('p=' + (o.p || 1));
    UTM.forEach(function (k) { if (o.utm && o.utm[k]) partes.push(k + '=' + encodeURIComponent(o.utm[k])); });
    return partes.join('&');
  }
  function origemTexto(utm) {
    var p = UTM.filter(function (k) { return utm && utm[k]; }).map(function (k) { return k + '=' + utm[k]; });
    return p.length ? p.join(';') : 'direto';
  }
  function origemParaUtm(origem) {
    var u = {};
    if (!origem || origem === 'direto') return u;
    origem.split(';').forEach(function (par) { var i = par.indexOf('='); if (i > 0) { var k = par.slice(0, i), v = par.slice(i + 1); if (UTM.indexOf(k) !== -1 && RE_UTM.test(v)) u[k] = v; } });
    return u;
  }

  /* ------------------------------------------------------------ dados (contrato d, ADR-003) */
  function buscarJSON(caminho) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var tempo = setTimeout(function () { if (ctrl) ctrl.abort(); }, 3000);
    return fetch(RAIZ + caminho, { cache: 'no-cache', credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (v) { clearTimeout(tempo); return v; });
  }
  // janela: H48 (padrão, contadores) ou D7 (preço de inauguração, ADR-005).
  function fresco(obj, agora, janela) {
    if (!obj || typeof obj.atualizado_em !== 'string') return false;
    var tms = Date.parse(obj.atualizado_em);
    if (isNaN(tms)) return false;
    var dif = (agora || Date.now()) - tms;
    return dif <= (janela || H48) && dif >= -FOLGA;
  }
  function num(v) { return typeof v === 'number' && isFinite(v) && v >= 0; }
  function inteiro(v) { return typeof v === 'number' && Math.floor(v) === v && v >= 0; }
  function precosValidos(p) {
    return !!(p && num(p.prazoHoras) && p.prazoHoras > 0 && p.abertura && num(p.abertura.padrao) && p.abertura.padrao > 0 &&
      p.planos && num(p.planos.aberto) && num(p.planos.vitrine) && inteiro(p.anualMesesPagos) && p.anualMesesPagos >= 1 && p.anualMesesPagos <= 12);
  }
  function inauguracaoValida(i, padrao) {
    return !!(i && i.ativa === true && num(i.preco) && i.preco > 0 && i.preco < padrao && inteiro(i.vagasTotal) && inteiro(i.vagasRestantes) && i.vagasRestantes > 0 && i.vagasRestantes <= i.vagasTotal);
  }
  function vagasValidas(v) {
    return !!(v && inteiro(v.capacidade_dia) && inteiro(v.em_producao) && inteiro(v.vagas_hoje) && v.vagas_hoje <= v.capacidade_dia);
  }
  var precosPromessa = null;
  function lerPrecos() {
    if (precosPromessa) return precosPromessa;
    precosPromessa = Promise.all([buscarJSON('dados/precos.json'), buscarJSON('dados/vagas.json')]).then(function (r) {
      var p = r[0], v = r[1], agora = Date.now();
      var pad = (CK && CK.precosPadrao) || { prazoHoras: 72, abertura: 497, planos: { aberto: 147, vitrine: 297 }, anualMesesPagos: 10, bastidores: 67 };
      var base = precosValidos(p) ? p : null;
      var frescoP = !!base && fresco(p, agora, H48);          // contadores
      var precoVale = !!base && fresco(p, agora, D7);         // preço de inauguração (ADR-005)
      var frescoV = vagasValidas(v) && fresco(v, agora, H48);
      var padrao = base ? base.abertura.padrao : pad.abertura;
      var links = (CK && CK.links) || {};
      var vale = (CK && CK.linkValido) || function () { return false; };
      // Inauguração: precos.json válido e de até 7 dias, ativa e com vaga. Não depende de vagas.json:
      // a página não volta a R$ 497 sozinha enquanto a oferta segue valendo (a 21ª venda é travada à mão no painel do Mercado Pago).
      var inaug = (precoVale && inauguracaoValida(base.abertura.inauguracao, padrao)) ? base.abertura.inauguracao : null;
      // Preço e link andam juntos: se só o link padrão é real, a página não mostra o preço de inauguração.
      if (inaug && !vale(links.aberturaInauguracao) && vale(links.aberturaPadrao)) inaug = null;
      // E o valor do link tem de ser o da tela (checkout.config.js valorDosLinks).
      var valorLinks = (CK && CK.valorDosLinks) || null;
      if (inaug && valorLinks && num(valorLinks.aberturaInauguracao) && valorLinks.aberturaInauguracao !== inaug.preco) inaug = null;
      var chave = inaug ? 'aberturaInauguracao' : 'aberturaPadrao';
      return {
        fresco: frescoP,
        prazoHoras: base ? base.prazoHoras : pad.prazoHoras,
        abertura: padrao,
        aberturaAtual: inaug ? inaug.preco : padrao,
        // vagasRestantes só com dado de até 48 h; mais velho que isso, o "Restam X" some e o preço continua.
        inauguracao: inaug ? { preco: inaug.preco, vagasTotal: inaug.vagasTotal, vagasRestantes: frescoP ? inaug.vagasRestantes : null } : null,
        planos: base ? { aberto: base.planos.aberto, vitrine: base.planos.vitrine } : pad.planos,
        anualMesesPagos: base ? base.anualMesesPagos : pad.anualMesesPagos,
        bastidores: base && num(base.bastidores) && base.bastidores > 0 ? base.bastidores : pad.bastidores,
        // Só para o texto dos termos (descreve a regra): o preço de inauguração como está no arquivo, mesmo velho.
        inauguracaoTermos: base && base.abertura.inauguracao && num(base.abertura.inauguracao.preco) && base.abertura.inauguracao.preco > 0 ? base.abertura.inauguracao.preco : null,
        inauguracaoVagasTermos: base && base.abertura.inauguracao && inteiro(base.abertura.inauguracao.vagasTotal) && base.abertura.inauguracao.vagasTotal > 0 ? base.abertura.inauguracao.vagasTotal : null,
        vagasHoje: frescoV ? { vagas_hoje: v.vagas_hoje, capacidade_dia: v.capacidade_dia } : null,
        linkChave: chave,
        linkAbertura: links[chave]
      };
    });
    return precosPromessa;
  }
  function valoresDe(pr, plano) {
    var anualA = pr.planos.aberto * pr.anualMesesPagos, anualV = pr.planos.vitrine * pr.anualMesesPagos;
    var v = {
      'precos.prazoHoras': milhar(pr.prazoHoras),
      'precos.abertura.padrao': milhar(pr.abertura),
      'precos.abertura.atual': milhar(pr.aberturaAtual),
      'precos.planos.aberto': milhar(pr.planos.aberto),
      'precos.planos.vitrine': milhar(pr.planos.vitrine),
      'precos.anualMesesPagos': milhar(pr.anualMesesPagos),
      'precos.anual.aberto': milhar(anualA),
      'precos.anual.vitrine': milhar(anualV),
      'precos.bastidores': milhar(pr.bastidores)
    };
    if (pr.inauguracao) {
      v['precos.abertura.inauguracao.preco'] = milhar(pr.inauguracao.preco);
      v['precos.abertura.inauguracao.vagasTotal'] = milhar(pr.inauguracao.vagasTotal);
      if (pr.inauguracao.vagasRestantes !== null) v['precos.abertura.inauguracao.vagasRestantes'] = milhar(pr.inauguracao.vagasRestantes);
    }
    if (pr.vagasHoje) { v['vagas.vagas_hoje'] = milhar(pr.vagasHoje.vagas_hoje); v['vagas.capacidade_dia'] = milhar(pr.vagasHoje.capacidade_dia); }
    if (plano) v['plano.preco'] = milhar({ aberto: pr.planos.aberto, vitrine: pr.planos.vitrine, aberto_anual: anualA, vitrine_anual: anualV }[plano]);
    return v;
  }
  // Preenche [data-v] e mostra/esconde [data-se]. Nenhum número vive no HTML.
  function aplicarPrecos(pr, raiz, plano) {
    var v = valoresDe(pr, plano);
    $$('[data-v]', raiz).forEach(function (e) {
      var k = e.getAttribute('data-v');
      if (k in v) { e.textContent = v[k]; e.classList.remove('num-carregando'); }
    });
    // Contadores ao vivo só com a chave ligada em checkout.config.js (D1: desligada até haver contagem de pedido pago no servidor).
    var aoVivo = !!(CK && CK.contadoresAoVivo === true);
    var restam = aoVivo && pr.inauguracao ? pr.inauguracao.vagasRestantes : null;   // null = desligado ou dado com mais de 48 h
    var hoje = aoVivo ? pr.vagasHoje : null;
    var cond = {
      'inauguracao': !!pr.inauguracao,
      'sem-inauguracao': !pr.inauguracao,
      'varias-vagas': restam !== null && restam > 1,
      'ultima-vaga': restam === 1,
      'vagas-hoje': !!hoje && hoje.vagas_hoje > 0,
      'vagas-esgotadas': !!hoje && hoje.vagas_hoje === 0,
      'dados-prontos': true
    };
    $$('[data-se]', raiz).forEach(function (e) { e.hidden = !cond[e.getAttribute('data-se')]; });
    $$('[data-carregando-precos]', raiz).forEach(function (e) { e.hidden = true; });
  }

  /* ------------------------------------------------------------ botões de checkout (contrato e) */
  // linkEscolhido: link já decidido (ex.: o da praça em /abrir/); sem ele, vale CK.links[chave].
  // Desktop (mouse): o pagamento abre em outra aba, porque o Mercado Pago no computador não tem "Voltar à loja" (PG-05).
  function abaNova() { return !!(W.matchMedia && W.matchMedia('(pointer: fine)').matches); }
  // emOutraAba: só em /abrir/ no desktop.
  function aplicarCheckout(btn, chave, linkEscolhido, emOutraAba) {
    if (!btn.hasAttribute('data-rotulo')) btn.setAttribute('data-rotulo', btn.textContent.trim());
    btn.setAttribute('data-checkout', chave);
    var link = linkEscolhido || (CK && CK.links ? CK.links[chave] : null);
    var ok = !!(CK && CK.linkValido(link));
    if (ok) {
      btn.setAttribute('href', link);
      if (emOutraAba) { btn.setAttribute('target', '_blank'); btn.setAttribute('rel', 'noopener noreferrer'); }
      else { btn.removeAttribute('target'); btn.removeAttribute('rel'); }
      btn.removeAttribute('aria-disabled'); btn.removeAttribute('tabindex');
      btn.textContent = btn.getAttribute('data-rotulo');
    } else if (suporteOk()) {
      // Sem link de pagamento ainda: a venda fecha pelo WhatsApp do Suporte Creat, com Pix na conversa. Nunca deixamos o botão morto.
      var rotulo = btn.getAttribute('data-rotulo');
      btn.setAttribute('href', linkWhats(CK.whatsappSuporte, 'Oi! Quero fazer a Abertura do Porta Aberta (' + chave + '). Como pago por Pix?'));
      btn.setAttribute('target', '_blank'); btn.setAttribute('rel', 'noopener noreferrer');
      btn.removeAttribute('aria-disabled'); btn.removeAttribute('tabindex');
      btn.textContent = rotulo + ' pelo WhatsApp';
    } else {
      btn.removeAttribute('href');
      btn.setAttribute('aria-disabled', 'true'); btn.setAttribute('tabindex', '-1');
      btn.textContent = 'Link de pagamento em configuração';
    }
    btn.setAttribute('data-link-ok', ok ? '1' : '0');
    return ok;
  }

  /* ------------------------------------------------------------ analytics (contrato j) */
  var PROPS_EVENTO = {
    placa_vista: ['dispositivo'], sede_aberta: ['dispositivo'],
    nicho_escolhido: ['dispositivo', 'nicho'], nome_digitado: ['dispositivo', 'nicho'], previa_gerada: ['dispositivo', 'nicho'], reserva_teste: ['dispositivo', 'nicho'],
    plano_visto: ['dispositivo', 'plano', 'nicho'], checkout_iniciado: ['dispositivo', 'plano', 'nicho'], pedido_enviado_pagina: ['dispositivo', 'plano', 'nicho'],
    lista_espera_enviada: ['dispositivo', 'nicho']
  };
  var EXIGIDAS = { nicho_escolhido: 'nicho', nome_digitado: 'nicho', previa_gerada: 'nicho', reserva_teste: 'nicho', plano_visto: 'plano', checkout_iniciado: 'plano', pedido_enviado_pagina: 'plano', lista_espera_enviada: 'nicho' };
  // Internas que o PostHog precisa para aceitar o evento; nenhuma carrega URL com # nem texto digitado.
  var PH_INTERNAS = ['token', 'distinct_id', '$lib', '$lib_version', '$insert_id', '$time', '$session_id', '$window_id', '$device_type', '$browser', '$os', '$process_person_profile', '$is_identified', '$configured_session_timeout_ms'];
  function valorPermitido(evento, k, v) {
    if (typeof v !== 'string') return false;
    if (k === 'dispositivo') return ['movel', 'tablet', 'desktop'].indexOf(v) !== -1;
    if (k === 'plano') return PLANOS.indexOf(v) !== -1;
    if (k === 'nicho') return evento === 'lista_espera_enviada' ? ESPERA.indexOf(v) !== -1 : NICHOS.indexOf(v) !== -1;
    if (UTM.indexOf(k) !== -1) return RE_UTM.test(v);
    return false;
  }
  // Filtro único: usado antes do capture e de novo no before_send do PostHog.
  function filtrarPropriedades(evento, props) {
    var lista = PROPS_EVENTO[evento]; if (!lista) return null;
    var out = {};
    Object.keys(props || {}).forEach(function (k) {
      if ((lista.indexOf(k) !== -1 || UTM.indexOf(k) !== -1) && valorPermitido(evento, k, props[k])) out[k] = props[k];
    });
    if (!out.dispositivo) return null;
    if (EXIGIDAS[evento] && !out[EXIGIDAS[evento]]) return null;
    return out;
  }
  function semFragmento(u) { try { var x = new URL(u); return x.origin + x.pathname; } catch (e) { return undefined; } }
  function beforeSend(ev) {
    if (!ev || !PROPS_EVENTO[ev.event]) return null;   // descarta $pageview, $autocapture, $identify, etc.
    var p = ev.properties || {}, limpo = filtrarPropriedades(ev.event, p);
    if (!limpo) return null;
    PH_INTERNAS.forEach(function (k) { if (p[k] !== undefined && typeof p[k] !== 'object') limpo[k] = p[k]; });
    var url = semFragmento(p.$current_url || location.href); if (url) limpo.$current_url = url;
    try { limpo.$host = location.host; limpo.$pathname = location.pathname; } catch (e) {}
    ev.properties = limpo;
    delete ev.$set; delete ev.$set_once;
    return ev;
  }
  var utmAtual = {};
  var fila = [], posthogPronto = false, posthogPedido = false;
  function evento(nome, props) {
    var base = { dispositivo: dispositivo() };
    UTM.forEach(function (k) { if (utmAtual[k]) base[k] = utmAtual[k]; });
    for (var k in props) base[k] = props[k];
    var limpo = filtrarPropriedades(nome, base);
    if (!limpo) return;
    if (W.__creatEventos) W.__creatEventos.push({ evento: nome, propriedades: limpo }); // inspeção em teste
    if (posthogPronto && W.posthog && W.posthog.capture) { try { W.posthog.capture(nome, limpo); } catch (e) {} }
    else if (posthogPedido) fila.push([nome, limpo]);
  }
  W.__creatEventos = W.__creatEventos || [];
  function carregarScript(src, aoCarregar, integridade) {
    // crossorigin só com SRI (PostHog, que manda CORS). O fbevents.js da Meta não manda Access-Control-Allow-Origin:
    // com crossorigin="anonymous" o navegador bloqueava o script e o Pixel nunca carregava (visto em 10/11/2026).
    var s = el('script', { src: src, async: true, crossorigin: integridade ? 'anonymous' : null, referrerpolicy: 'no-referrer' });
    if (integridade) s.integrity = integridade; // SRI: arquivo alterado no CDN = navegador recusa, nada roda na nossa origem
    s.onload = aoCarregar || null; s.onerror = function () { fila = []; };
    D.head.appendChild(s);
  }
  // Só com o "Aceitar" (o aviso de medição promete isso). Chave de exemplo: desligado, nenhuma requisição.
  function iniciarPosthog() {
    if (posthogPedido) return;
    var c = consentimento(); if (!c || !c.pixel) return;
    if (!MED.posthogValida || !MED.posthogValida(MED.posthogChave)) return;
    posthogPedido = true;
    var iniciar = function () {
      carregarScript(MED.posthogScript, function () {
        if (!W.posthog || !W.posthog.init) return;
        W.posthog.init(MED.posthogChave, {
          api_host: MED.posthogHost,
          persistence: 'memory', disable_persistence: true, disable_cookie: true,
          autocapture: false, capture_pageview: false, capture_pageleave: false,
          disable_session_recording: true, disable_surveys: true, disable_web_experiments: true,
          disable_external_dependency_loading: true, advanced_disable_flags: true, advanced_disable_decide: true,
          capture_performance: false, capture_heatmaps: false, capture_dead_clicks: false, capture_exceptions: false, rageclick: false,
          disable_capture_url_hashes: true, mask_personal_data_properties: true, save_referrer: false,
          person_profiles: 'identified_only', ip: false,
          before_send: beforeSend
        });
        posthogPronto = true;
        fila.splice(0).forEach(function (e) { try { W.posthog.capture(e[0], e[1]); } catch (x) {} });
      }, MED.posthogIntegridade);
    };
    if ('requestIdleCallback' in W) W.requestIdleCallback(iniciar, { timeout: 4000 }); else setTimeout(iniciar, 1500);
  }

  /* Consentimento: Pixel e Clarity só depois do "Aceitar". O banner existe na home, em /abrir/ e em
     /obrigado/ (aparece enquanto não houver escolha gravada) e "Preferências de medição", no rodapé,
     reabre a escolha. A escolha vale 180 dias; depois some sozinha e o banner pergunta de novo.
     Antes de carregar, iniciar() já tirou nome e cidade do endereço (limparEndereco).
     Pixel: home, /abrir/ e /obrigado/. Clarity (gravação de uso): SÓ na home, que não mostra dado
     do pedido; o campo do nome e o que repete o nome na tela levam data-clarity-mask (D4). */
  var CHAVE_CONSENT = 'creat:consentimento', D180 = 180 * 24 * 3600 * 1000;
  var PAGINAS_PIXEL = ['home', 'abrir', 'obrigado'];
  var PAGINAS_CLARITY = ['home'];
  function consentimento(agora) {
    var c = lerJSONGuardado(CHAVE_CONSENT);
    if (!c || c.versao !== 1) return null;
    var t0 = Date.parse(c.em), dif = (agora || Date.now()) - t0;
    if (isNaN(t0) || dif > D180 || dif < -FOLGA) { guarda.apagar(CHAVE_CONSENT); return null; }
    return c;
  }
  var terceirosCarregados = false, pixelLigado = false;
  function carregarTerceiros() {
    if (terceirosCarregados || PAGINAS_PIXEL.indexOf(PAGINA) === -1) return;
    var c = consentimento(); if (!c || !c.pixel) return;
    terceirosCarregados = true;
    if (MED.pixelValido && MED.pixelValido(MED.metaPixel)) {
      var f = W.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
      if (!W._fbq) W._fbq = f; f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
      W.fbq('set', 'autoConfig', false, MED.metaPixel);
      W.fbq('init', MED.metaPixel);
      W.fbq('track', 'PageView');
      pixelLigado = true;
      carregarScript('https://connect.facebook.net/en_US/fbevents.js');
    }
    if (PAGINAS_CLARITY.indexOf(PAGINA) !== -1 && MED.clarityValido && MED.clarityValido(MED.clarity)) {
      W.clarity = W.clarity || function () { (W.clarity.q = W.clarity.q || []).push(arguments); };
      carregarScript('https://www.clarity.ms/tag/' + MED.clarity);
    }
  }
  // Cookies próprios do Pixel (_fbp, _fbc), apagados ao recusar depois de aceitar e em "Esquecer meus dados".
  function apagarCookiesMeta() {
    var dominios = [''], h = location.hostname || '';
    var partes = h.split('.');
    for (var i = 0; i < partes.length - 1; i++) dominios.push('; domain=.' + partes.slice(i).join('.'));
    ['_fbp', '_fbc'].forEach(function (n) { dominios.forEach(function (d) { try { D.cookie = n + '=; Max-Age=0; path=/' + d; } catch (e) {} }); });
  }
  /* Cookie da hospedagem (b44-visitor-tracking, injetado pelo Base44 no HTML no ar): com a meta
     base44-visitor-tracking=consent ele só grava base44_referrer_origin e base44_referrer_id (30 dias) depois do
     'granted' e os apaga com o 'denied'. Fora do Base44 o dataLayer fica sem leitor e nada acontece. */
  function avisarHospedagem(sim) {
    try { var dl = W.dataLayer = W.dataLayer || []; dl.push(['consent', 'update', { analytics_storage: sim ? 'granted' : 'denied' }]); } catch (e) {}
  }
  // Revoga o que já carregou nesta página: o Pixel para de mandar evento e a página recarrega sem terceiros.
  function revogarTerceiros() {
    try { if (W.fbq) W.fbq('consent', 'revoke'); } catch (e) {}
    pixelLigado = false;
    apagarCookiesMeta();
  }

  /* Eventos padrão do Pixel (docs/MEDICAO-FUNIL.md). Lista fechada de parâmetros por evento:
     nada de nome, telefone, e-mail ou cidade. Devolve true se o evento saiu. */
  var PIXEL_PARAMS = {
    ViewContent: { content_category: function (v) { return NICHOS.indexOf(v) !== -1; }, content_name: function (v) { return v === 'previa'; } },
    InitiateCheckout: { value: function (v) { return num(v) && v > 0; }, currency: function (v) { return v === 'BRL'; } },
    Purchase: { value: function (v) { return num(v) && v > 0; }, currency: function (v) { return v === 'BRL'; } }
  };
  function filtrarPixel(nome, params) {
    var regra = PIXEL_PARAMS[nome]; if (!regra) return null;
    var out = {};
    Object.keys(regra).forEach(function (k) { if (params && regra[k](params[k])) out[k] = params[k]; });
    return Object.keys(out).length === Object.keys(regra).length ? out : null;   // parâmetro faltando = não manda
  }
  function pixelEvento(nome, params, eventId) {
    var limpo = filtrarPixel(nome, params); if (!limpo) return false;
    if (!pixelLigado || !W.fbq) return false;
    try { if (eventId) W.fbq('track', nome, limpo, { eventID: String(eventId) }); else W.fbq('track', nome, limpo); return true; } catch (e) { return false; }
  }
  // ViewContent: no máximo um por nicho por sessão do navegador (abrir e fechar a prévia não duplica).
  var vistoNaSessao = {};
  function pixelViewContent(nicho) {
    var k = 'creat:px:vc:' + nicho;
    try { if (sessionStorage.getItem(k)) return; } catch (e) { if (vistoNaSessao[k]) return; }
    if (pixelEvento('ViewContent', { content_category: nicho, content_name: 'previa' })) {
      vistoNaSessao[k] = 1; try { sessionStorage.setItem(k, '1'); } catch (e) {}
    }
  }

  /* ------------------------------------------------------------ origem do primeiro toque (30 dias)
     Só utm_source, utm_medium, utm_campaign e utm_content, validados por RE_UTM. Nenhum dado pessoal.
     Serve para o botão de pagar escolher o link da praça (checkout.config.js linksPorPraca). */
  var CHAVE_ORIGEM = 'creat:origem:v1', D30 = 30 * 24 * 3600 * 1000;
  var UTM_ORIGEM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'];
  function lerOrigem(agora) {
    var o = lerJSONGuardado(CHAVE_ORIGEM);
    if (!o || typeof o !== 'object' || typeof o.em !== 'string') return null;
    var t0 = Date.parse(o.em), dif = (agora || Date.now()) - t0;
    if (isNaN(t0) || dif > D30 || dif < -FOLGA) { guarda.apagar(CHAVE_ORIGEM); return null; }
    var u = {};
    UTM_ORIGEM.forEach(function (k) { if (typeof o[k] === 'string' && RE_UTM.test(o[k])) u[k] = o[k]; });
    return Object.keys(u).length ? u : null;
  }
  function guardarOrigem(utm, agora) {
    if (lerOrigem(agora)) return false;           // primeiro toque: não sobrescreve enquanto vale
    var u = {}, tem = false;
    UTM_ORIGEM.forEach(function (k) { if (utm && typeof utm[k] === 'string' && RE_UTM.test(utm[k])) { u[k] = utm[k]; tem = true; } });
    if (!tem) return false;
    u.em = new Date(agora || Date.now()).toISOString();
    return guarda.gravar(CHAVE_ORIGEM, JSON.stringify(u));
  }

  /* ------------------------------------------------------------ contador da Creat (D8, função contar)
     4 eventos: visita (home), previa, ida_pagamento (abriu /abrir/), clique_pagar. Só nicho, praça (utm_campaign)
     e anúncio (utm_content): sem cookie, sem identificador, sem dado pessoal. Não depende do aceite do Pixel.
     Um por evento e nicho em cada carga da página. O link de teste (?teste=pa-teste) não conta. */
  var contados = {};
  function corpoContagem(ev, nicho) {
    var u = {}, o = lerOrigem() || {};
    ['utm_campaign', 'utm_content'].forEach(function (k) { var v = (utmAtual && utmAtual[k]) || o[k]; if (typeof v === 'string' && RE_UTM.test(v)) u[k] = v; });
    return { evento: ev, nicho: NICHOS.indexOf(nicho) !== -1 ? nicho : 'outro', praca: u.utm_campaign || '', utm_content: u.utm_content || '' };
  }
  function contar(ev, nicho) {
    if (ENTRADA.teste) return false;
    var k = ev + ':' + (nicho || '');
    if (contados[k]) return false;
    contados[k] = 1;
    return enviarSolto('contar', corpoContagem(ev, nicho));
  }

  /* ------------------------------------------------------------ endereço limpo antes de medir
     Lê o fragmento (nome, cidade, nicho, plano, utm_*) e a volta do Mercado Pago (query) UMA vez e
     reescreve o endereço sem nome, cidade nem parâmetros do pagamento. As páginas usam ENTRADA. */
  var PARAMS_MP = ['collection_id', 'collection_status', 'payment_id', 'status', 'external_reference', 'payment_type', 'merchant_order_id', 'preference_id', 'site_id', 'processing_mode', 'merchant_account_id'];
  // Só em /obrigado/: o que a volta do Mercado Pago, do Stripe e da aba do desktop trazem. Lido antes de limpar.
  var PARAMS_VOLTA = ['resultado', 'pago', 'produto', 'praca', 'assinatura', 'plano', 'session_id', 'espera', 'provider', 'order_id', 'product_id'];
  var ENTRADA = { frag: lerFragmento(''), query: {}, retorno: null, volta: null, ver: false, preferencias: false, teste: false };
  /* Estado da volta (PG-02, CH-09, PG-03, PG-N1). Nunca confirma pagamento: o servidor confirma (confirmarPagamento).
     pagamento: aprovado (approved, ou resultado=aprovado, com payment_id numérico) · recusado · pendente · sem_retorno. */
  function lerVolta(search) {
    var q; try { q = new URLSearchParams(search || ''); } catch (e) { q = new URLSearchParams(''); }
    var st = String(q.get('collection_status') || q.get('status') || '').toLowerCase();
    var res = String(q.get('resultado') || '').toLowerCase();
    var pid = q.get('payment_id') || '', numerico = /^\d{1,24}$/.test(pid);
    var produto = q.get('produto'); if (!/^pa-[a-z0-9-]{1,40}$/.test(produto || '')) produto = null;
    var assin = q.get('assinatura'); if (assin !== 'ok' && assin !== 'cancelada') assin = null;
    var tipo = q.get('payment_type') || '';
    var meio = tipo === 'bank_transfer' ? 'pix' : /^(credit_card|debit_card|prepaid_card)$/.test(tipo) ? 'cartao' : tipo === 'account_money' ? 'saldo' : null;
    var pagamento = 'sem_retorno';
    if (st === 'approved' || (!st && res === 'aprovado')) pagamento = numerico ? 'aprovado' : 'sem_retorno';
    else if (/^(rejected|cancelled|refunded|charged_back)$/.test(st) || (!st && res === 'recusado')) pagamento = 'recusado';
    else if (/^(pending|in_process|in_mediation|authorized)$/.test(st) || (!st && res === 'pendente')) pagamento = 'pendente';
    var pref = q.get('preference_id') || '';
    return {
      tem: !!(st || res || pid || produto || assin || q.get('pago') || q.get('espera')),
      pagamento: pagamento,
      paymentId: numerico ? pid : null,
      preferencia: /^[0-9A-Za-z-]{8,80}$/.test(pref) ? pref : null,
      meio: meio, produto: produto,
      praca: PRACAS.indexOf(q.get('praca')) !== -1 ? q.get('praca') : null,
      assinatura: assin,
      plano: PLANOS.indexOf(q.get('plano')) !== -1 ? q.get('plano') : null,
      espera: q.get('espera') === '1'
    };
  }
  // Qual tela do /obrigado/ a volta pede (a do servidor pode trocar depois: pago, teste_ok, rascunho).
  function estadoDaVolta(v) {
    if (!v) return 'sem_retorno';
    if (v.assinatura === 'ok') return 'assinatura_ok';
    if (v.assinatura === 'cancelada') return 'assinatura_cancelada';
    if (v.pagamento === 'aprovado') {
      if (/^pa-anual-(aberto|vitrine)$/.test(v.produto || '')) return 'anual_pago';
      if (v.produto === 'pa-teste') return 'teste_ok';
      if (v.produto === 'pa-bastidores') return 'bastidores_pago';
      return 'aprovado';
    }
    if (v.pagamento === 'recusado') return 'recusado';
    if (v.pagamento === 'pendente') return 'pendente';
    return v.espera ? 'aguardando' : 'sem_retorno';
  }
  // Volta do Checkout Pro: aprovado só com status approved E payment_id numérico.
  function lerRetornoMP(search) {
    var q; try { q = new URLSearchParams(search || ''); } catch (e) { return null; }
    var pid = q.get('payment_id') || '';
    var st = q.get('collection_status') || q.get('status') || '';
    if (!pid && !st) return null;
    return {
      aprovado: (q.get('collection_status') === 'approved' || q.get('status') === 'approved') && /^\d{4,24}$/.test(pid),
      paymentId: /^\d{4,24}$/.test(pid) ? pid : null,
      preferencia: /^[0-9A-Za-z-]{8,80}$/.test(q.get('preference_id') || '') ? q.get('preference_id') : null
    };
  }
  function semDadosPessoais(f) { return { k: f.k, n: null, c: null, p: f.p, plano: f.plano, utm: f.utm }; }
  function limparEndereco() {
    var q = new URLSearchParams(location.search);
    ENTRADA.frag = lerFragmento(location.hash);
    ENTRADA.query = lerUtm(q);
    ENTRADA.retorno = lerRetornoMP(location.search);
    ENTRADA.volta = lerVolta(location.search);
    ENTRADA.teste = PAGINA === 'abrir' && q.get('teste') === 'pa-teste';
    ENTRADA.preferencias = location.hash === '#preferencias';
    try { ENTRADA.ver = new URLSearchParams(String(location.hash || '').replace(/^#/, '')).get('ver') === '1'; } catch (e) { ENTRADA.ver = false; }
    var mudou = false;
    PARAMS_MP.concat(PAGINA === 'obrigado' ? PARAMS_VOLTA : []).forEach(function (k) { if (q.has(k)) { q.delete(k); mudou = true; } });
    var busca = q.toString(); busca = busca ? '?' + busca : '';
    var hash = location.hash;
    if (PAGINA === 'home') { if (hash) { hash = ''; mudou = true; } }
    else if (ENTRADA.frag.n || ENTRADA.frag.c) {
      var resto = montarFragmento(semDadosPessoais(ENTRADA.frag), true);
      hash = resto ? '#' + resto : ''; mudou = true;
    }
    if (mudou) { try { history.replaceState(null, '', location.pathname + busca + hash); } catch (e) {} }
  }

  /* Purchase em /obrigado/: só com volta aprovada do Mercado Pago, preference_id de um link conhecido do
     checkout.config.js (o valor é o que esse link cobra; nunca valor adivinhado) e uma vez por payment_id.
     creat:px:compras guarda { id, em } dos últimos 30 pagamentos medidos, cada um por 30 dias.
     enviar: quem manda o evento (padrão: o Pixel). Os testes passam a própria função; não há global de teste. */
  var CHAVE_COMPRAS = 'creat:px:compras';
  function lerCompras(agora) {
    var v = lerJSONGuardado(CHAVE_COMPRAS), t = agora || Date.now();
    if (!Array.isArray(v)) { if (v !== null) guarda.apagar(CHAVE_COMPRAS); return []; }
    var ok = v.filter(function (x) { var t0 = x && typeof x.id === 'string' ? Date.parse(x.em) : NaN; return !isNaN(t0) && t - t0 <= D30 && t - t0 >= -FOLGA; });
    if (ok.length !== v.length) { if (ok.length) guarda.gravar(CHAVE_COMPRAS, JSON.stringify(ok)); else guarda.apagar(CHAVE_COMPRAS); }
    return ok;
  }
  function medirCompra(retorno, enviar) {
    if (!retorno || !retorno.aprovado || !retorno.paymentId) return 'sem-aprovacao';
    var feitas = lerCompras();
    if (feitas.some(function (x) { return x.id === retorno.paymentId; })) return 'repetida';
    var valor = CK && CK.valorDaPreferencia ? CK.valorDaPreferencia(retorno.preferencia) : null;
    if (!num(valor) || !valor) return 'sem-valor';
    var mandar = typeof enviar === 'function' ? enviar : pixelEvento;
    if (!mandar('Purchase', { value: valor, currency: 'BRL' }, retorno.paymentId)) return 'sem-pixel';
    feitas.push({ id: retorno.paymentId, em: new Date().toISOString() });
    guarda.gravar(CHAVE_COMPRAS, JSON.stringify(feitas.slice(-30)));
    return 'enviada';
  }

  /* Tudo o que o site guarda neste aparelho começa com "creat:" (localStorage e sessionStorage).
     Chaves com prazo: creat:pedido:v1 (7 dias), creat:origem:v1 (30 dias), creat:px:compras (30 dias por item),
     creat:consentimento (180 dias). Elas são conferidas e apagadas ao vencer em toda página que abre. */
  var CHAVES_LEGADAS = ['creat:checkout:v1'];   // não é mais gravada (D8); some de quem já tinha
  function limparVencidos() {
    CHAVES_LEGADAS.forEach(function (k) { guarda.apagar(k); });
    lerOrigem(); lerCompras(); consentimento();
    if (typeof lerPedidoSalvo === 'function') lerPedidoSalvo();
  }
  function esquecerTudo() {
    var apagarDe = function (st) { try { for (var i = st.length - 1; i >= 0; i--) { var k = st.key(i); if (k && k.indexOf('creat:') === 0) st.removeItem(k); } } catch (e) {} };
    try { apagarDe(W.localStorage); } catch (e) {}
    try { apagarDe(W.sessionStorage); } catch (e) {}
    Object.keys(memoria).forEach(function (k) { if (k.indexOf('creat:') === 0) delete memoria[k]; });
    vistoNaSessao = {};
    avisarHospedagem(false);
    if (terceirosCarregados) revogarTerceiros(); else apagarCookiesMeta();
  }
  function montarConsentimento() {
    var caixa = $('#consentimento');
    var escolha0 = consentimento();
    if (escolha0) avisarHospedagem(!!escolha0.pixel);     // a escolha gravada vale também para o cookie da hospedagem
    if (!caixa) { if (escolha0) carregarTerceiros(); return; }
    /* O banner reserva o próprio espaço no fim da página (padding do body e scroll-padding), então nada fica
       escondido atrás dele. Com um formulário na tela vira faixa de até 64 px (is-faixa) e, com o foco num
       campo, sai da frente (is-digitando): nunca cobre o que a pessoa está preenchendo (CH-05, PG-12). */
    var medir = function () {
      if (caixa.hidden) return;
      var alt = caixa.classList.contains('is-digitando') ? 0 : caixa.offsetHeight + (caixa.classList.contains('is-faixa') ? 8 : 24);
      D.body.style.setProperty('--altura-consentimento', alt + 'px');
      D.documentElement.style.scrollPaddingBottom = alt ? alt + 'px' : '';
      if (agendarPos) agendarPos();
    };
    var mostrar = function () { caixa.hidden = false; caixa.classList.toggle('is-digitando', ehCampo(D.activeElement)); D.body.classList.add('com-consentimento'); medir(); };
    var esconder = function () { caixa.hidden = true; D.body.classList.remove('com-consentimento'); D.documentElement.style.scrollPaddingBottom = ''; };
    if ('ResizeObserver' in W) new ResizeObserver(medir).observe(caixa);
    var FORMS = '#form-abrir, #form-pedido, #form-teste';
    /* A cena da equipe (#sede) conta como formulário para o aviso: com ela na tela o aviso é faixa, porque a caixa
       grande cobria quase metade da cena no celular justamente quando a pessoa chegava para assistir. */
    var formularios = $$(FORMS + ', #sede');
    // /obrigado/: sempre faixa (PG-12). O recibo e o próximo passo são o que a pessoa veio ver.
    if (PAGINA === 'obrigado') { caixa.classList.add('is-faixa'); formularios = []; }
    if (formularios.length && 'IntersectionObserver' in W) {
      var naTela = [];
      var fio = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { var i = formularios.indexOf(en.target); if (i !== -1) naTela[i] = en.isIntersecting; });
        var bp = $('#barra-pagar');   // com o botão de pagar no rodapé (/abrir/ no celular) continua faixa, sem piscar
        caixa.classList.toggle('is-faixa', naTela.some(Boolean) || !!(bp && !bp.hidden && !bp.classList.contains('recolhida') && bp.getBoundingClientRect().height > 0)); medir();
      }, { threshold: 0 });
      formularios.forEach(function (fm) { fio.observe(fm); });
    }
    /* A faixa escolhe a borda da tela que não cobre nenhum campo nem botão do formulário: embaixo (padrão) ou logo
       abaixo do cabeçalho. Se as duas cobririam, ela sai da frente até a rolagem liberar uma delas. */
    var CONTROLES = 'input:not([type=hidden]):not(#p-site),select,textarea,button,.chip,.aceite,summary';
    var posAgendada = false, rolando = false, fimRolagem = 0;
    var posicionar = function () {
      posAgendada = false;
      /* Prévia aberta sem escolha: a faixa fica sobre a prévia, logo acima dos dois botões de baixo (CSS
         body.com-previa); os campos da home, atrás da prévia, não contam. */
      if (D.body.classList.contains('com-previa') && !caixa.hidden) {
        var base = $('#previa .previa-base');
        caixa.classList.add('is-faixa'); caixa.classList.remove('is-topo', 'is-sem-lugar', 'is-digitando');
        caixa.style.setProperty('--base-previa', (base ? Math.ceil(base.getBoundingClientRect().height) : 0) + 'px');
        return;
      }
      // /abrir/ no celular: o botão fixo de pagar mora no rodapé; com ele lá, o aviso é sempre faixa e nunca fica por cima dele
      var barraPagar = $('#barra-pagar');
      var barraNoRodape = !!(barraPagar && !barraPagar.hidden && !barraPagar.classList.contains('recolhida') && barraPagar.getBoundingClientRect().height > 0);
      if (barraNoRodape && !caixa.hidden) caixa.classList.add('is-faixa');
      if (caixa.hidden || !caixa.classList.contains('is-faixa')) { caixa.classList.remove('is-topo', 'is-sem-lugar'); return; }
      var alt = caixa.offsetHeight, vh = W.innerHeight, cab = $('header.barra'), topo = cab ? Math.max(0, cab.getBoundingClientRect().bottom) : 0;
      var cobre = function (a, b) {
        return $$(FORMS).some(function (fm) {
          return $$(CONTROLES, fm).some(function (c) {
            // dentro de <details> fechado o Chromium ainda dá caixa ao campo (content-visibility): não conta
            if (c.closest('details:not([open])') && c.tagName !== 'SUMMARY') return false;
            if (c.checkVisibility && !c.checkVisibility({ visibilityProperty: true })) return false;
            var r = c.getBoundingClientRect(); return r.height > 0 && r.bottom > a && r.top < b;
          });
        });
      };
      var livreBaixo = !barraNoRodape && !cobre(vh - alt, vh), livreCima = !cobre(topo, topo + alt);
      // digitando o nome na home: em cima, porque no Android o teclado aberto esconde o rodapé
      var noNome = D.activeElement && D.activeElement.id === 'nome' && PAGINA === 'home';
      // durante a rolagem fica onde está enquanto aquela borda estiver livre (não pula a cada passo);
      // parada, volta para baixo, que é o lugar preferido, se lá estiver livre
      var estaCima = caixa.classList.contains('is-topo');
      var cima = noNome ? livreCima : estaCima && rolando ? livreCima : (!livreBaixo && livreCima);
      var semLugar = !cima && !livreBaixo;
      caixa.style.setProperty('--topo-consentimento', topo + 'px');
      if (cima !== estaCima && !MOV_REDUZIDO.matches) {   // troca de borda com um esmaecer curto, nunca um salto seco
        caixa.classList.add('is-trocando'); void caixa.offsetWidth;
        (W.requestAnimationFrame || setTimeout)(function () { caixa.classList.remove('is-trocando'); });
      }
      caixa.classList.toggle('is-topo', cima);
      caixa.classList.toggle('is-sem-lugar', semLugar && !caixa.contains(D.activeElement));
    };
    var agendarPos = function () { if (!posAgendada) { posAgendada = true; (W.requestAnimationFrame || setTimeout)(posicionar); } };
    W.addEventListener('scroll', function () {
      rolando = true; agendarPos();
      clearTimeout(fimRolagem); fimRolagem = setTimeout(function () { rolando = false; agendarPos(); }, 220);
    }, { passive: true });
    W.addEventListener('resize', agendarPos);
    W.addEventListener('creat:barra-pagar', agendarPos);
    W.addEventListener('creat:previa-aberta', function () { medir(); agendarPos(); });
    W.addEventListener('creat:previa-fechada', agendarPos);
    // a barra de baixo da prévia muda de altura quando o preço chega (nota de 3 ou 4 linhas): a faixa acompanha
    var basePrevia = $('#previa .previa-base');
    if (basePrevia && 'ResizeObserver' in W) new ResizeObserver(agendarPos).observe(basePrevia);
    /* O campo do nome da home não tira a faixa da frente: é nele que a pessoa decide pedir a prévia, e a faixa
       (em cima, abaixo do cabeçalho) não cobre o campo nem o botão. Os outros campos seguem com is-digitando. */
    var ehCampo = function (x) { return !!(x && x.matches && x.matches('input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]),select,textarea') && !caixa.contains(x) && !(PAGINA === 'home' && x.id === 'nome')); };
    D.addEventListener('focusin', function (e) { if (ehCampo(e.target)) { caixa.classList.add('is-digitando'); medir(); } else agendarPos(); });
    D.addEventListener('focusout', function () { setTimeout(function () { if (!ehCampo(D.activeElement)) { caixa.classList.remove('is-digitando'); medir(); } }, 0); });
    var decidir = function (sim) {
      var antes = consentimento();
      guarda.gravar(CHAVE_CONSENT, JSON.stringify({ versao: 1, analytics: true, pixel: sim, clarity: sim, em: new Date().toISOString() }));
      avisarHospedagem(sim);
      esconder(); aviso(caixa.getAttribute('data-salvo') || 'Preferência salva.');
      if (sim) { carregarTerceiros(); iniciarPosthog(); return; }
      // Recusou depois de aceitar: revoga o Pixel desta página, apaga os cookies dele e recarrega sem terceiros.
      if (terceirosCarregados || (antes && antes.pixel)) { revogarTerceiros(); setTimeout(function () { try { location.reload(); } catch (e) {} }, 900); }
    };
    $$('[data-consentir]', caixa).forEach(function (b) { b.addEventListener('click', function () { decidir(b.getAttribute('data-consentir') === 'sim'); }); });
    var abrirPreferencias = function () { mostrar(); var p = $('[data-consentir]', caixa); if (p) p.focus(); };
    $$('[data-preferencias]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); abrirPreferencias(); }); });
    // Vindo de "Preferências de medição" em termos/privacidade (link ../#preferencias): abre a escolha.
    if (ENTRADA.preferencias) { abrirPreferencias(); if (consentimento()) carregarTerceiros(); return; }
    if (consentimento()) { carregarTerceiros(); return; }
    // /abrir/ e /obrigado/: sem escolha gravada, o banner aparece logo (quem pulou o da home decide aqui).
    if (PAGINA !== 'home') { mostrar(); return; }
    // Home: o banner não cobre a primeira tela. Aparece quando a pessoa toca no campo do nome ou digita a
    // primeira letra (antes de pedir a prévia, para a escolha chegar antes do anúncio perder o sinal), quando
    // passa do hero, fecha a prévia ou depois de 25 s. Nunca bloqueia o envio e nada vem marcado.
    // Até a escolha, nada de Pixel nem Clarity (só carregam com o Aceitar).
    var heroi = $('#porta'), mostrado = false, campoNomeHome = $('#nome');
    var talvez = function () {
      if (mostrado) return;
      var limite = heroi ? heroi.offsetTop + heroi.offsetHeight * 0.6 : W.innerHeight * 0.6;
      if ((W.scrollY || 0) + W.innerHeight * 0.4 > limite) disparar();
    };
    var disparar = function () { if (mostrado) return; mostrado = true; W.removeEventListener('scroll', talvez); mostrar(); };
    W.addEventListener('scroll', talvez, { passive: true });
    W.addEventListener('creat:previa-fechada', disparar);
    W.addEventListener('creat:previa-aberta', disparar);
    if (campoNomeHome) { campoNomeHome.addEventListener('focus', disparar); campoNomeHome.addEventListener('input', disparar); }
    setTimeout(disparar, 25000);
    // Com a janela da sede na tela, o banner desce e sai da frente: a placa com o nome do negócio fica
    // na parte de baixo da janela. Volta assim que a janela sai. Nada de Pixel/Clarity até a escolha.
    var janela = $('#janela-sede');
    if (janela && 'IntersectionObserver' in W) {
      new IntersectionObserver(function (ents) {
        var naTela = ents.some(function (e) { return e.isIntersecting; });
        if (naTela && caixa.contains(D.activeElement)) return;     // quem está no banner pelo teclado não perde o foco
        caixa.classList.toggle('is-recuado', naTela);
      }, { threshold: 0.6 }).observe(janela);
    }
  }

  /* ------------------------------------------------------------ quem presta o serviço (checkout.config.js empresa) */
  function empresa() {
    var e = (CK && CK.empresa) || {}, out = {};
    ['nome', 'razao', 'cidade', 'uf', 'documento', 'endereco'].forEach(function (k) {
      var v = typeof e[k] === 'string' ? e[k].replace(/\s+/g, ' ').trim() : '';
      out[k] = /[\[{]|a informar/i.test(v) ? '' : v;           // marcador esquecido nunca vai para a tela
    });
    if (!out.nome) out.nome = 'creat.MTT Studio';
    return out;
  }
  // [data-empresa="nome|cidade|uf"] recebe o valor; [data-empresa-opcional="documento|endereco"] aparece só com valor.
  function montarEmpresa() {
    var e = empresa();
    $$('[data-empresa]').forEach(function (x) { var v = e[x.getAttribute('data-empresa')]; if (v) x.textContent = v; });
    $$('[data-empresa-opcional]').forEach(function (x) {
      var v = e[x.getAttribute('data-empresa-opcional')];
      x.textContent = ''; x.hidden = !v;
      if (!v) return;
      var antes = x.hasAttribute('data-antes') ? x.getAttribute('data-antes') : ', ';
      if (antes) x.appendChild(D.createTextNode(antes));
      // documento (CNPJ + número) nunca quebra no meio; endereço quebra normalmente
      if (x.getAttribute('data-empresa-opcional') === 'documento') { var n = D.createElement('span'); n.className = 'nq'; n.textContent = v; x.appendChild(n); }
      else x.appendChild(D.createTextNode(v));
    });
    $$('[data-link-sede]').forEach(function (a) { a.href = urlSede() + '?modo=demo'; });
  }

  /* ------------------------------------------------------------ suporte, barra e som */
  function montarSuporte() {
    var ok = suporteOk();
    $$('[data-zap]').forEach(function (a) {
      var tipo = a.getAttribute('data-zap') || 'duvida';
      var textos = { duvida: 'Olá! Vi o Porta Aberta e tenho uma dúvida:', suporte: 'Olá! Já sou cliente do Porta Aberta e preciso de ajuda com o site.' };
      var msg = a.getAttribute('data-msg') || textos[tipo] || textos.duvida;
      if (ok) {
        a.href = linkWhats(CK.whatsappSuporte, msg); a.target = '_blank'; a.rel = 'noopener noreferrer';
        // /abrir/: "Dúvidas" diz que abre o WhatsApp só quando ele abre mesmo
        var rok = a.getAttribute('data-rotulo-ok'), rz = a.querySelector('[data-rotulo-zap]');
        if (rok && rz) {
          rz.textContent = rok;
          // o fim do rótulo ("no WhatsApp") fica num span próprio: em tela estreita ele sai da vista e o ícone fala por ele
          var fim = a.getAttribute('data-rotulo-ok-fim');
          if (fim) { var sf = D.createElement('span'); sf.className = 'rotulo-zap-fim'; sf.textContent = ' ' + fim; rz.appendChild(sf); }
          a.classList.add('com-zap');
          if (a.getAttribute('data-aria-ok')) a.setAttribute('aria-label', a.getAttribute('data-aria-ok'));
        }
      }
      else if (a.hasAttribute('data-some-sem-zap')) { a.hidden = true; }
      else {
        a.href = linkEmail('Porta Aberta', msg); a.removeAttribute('target'); a.classList.add('sem-zap');
        var r = a.querySelector('[data-rotulo-zap]');
        // cabeçalho: no celular aparece só a parte curta ("Suporte"), no desktop a frase inteira
        if (r && r.querySelector('.barra-zap-longo')) { r.querySelector('.barra-zap-longo').textContent = 'Falar com o '; r.lastChild.textContent = 'Suporte'; }
        else if (r) r.textContent = 'Falar com o suporte';
      }
    });
    $$('[data-email-suporte]').forEach(function (a) { a.textContent = emailSuporte(); a.href = 'mailto:' + emailSuporte(); });
  }
  function montarSom() {
    if (!W.CreatSom) return;
    try { W.CreatSom.armar(); } catch (e) {}
    var b = $('[data-som]'); if (!b) return;
    var atualizar = function () { var mudo = !!W.CreatSom.mudo; b.setAttribute('aria-pressed', mudo ? 'false' : 'true'); b.setAttribute('aria-label', mudo ? 'Ligar o som' : 'Desligar o som'); b.querySelector('span').textContent = mudo ? 'Som desligado' : 'Som ligado'; };
    b.hidden = false; atualizar();
    b.addEventListener('click', function () { try { W.CreatSom.silenciar(); } catch (e) {} atualizar(); });
    W.addEventListener('creat:som', atualizar);
  }

  /* ------------------------------------------------------------ presets de nicho (textos em conteudo/nichos) */
  var nichoCache = {};
  function lerNicho(k) {
    if (NICHOS.indexOf(k) === -1) return Promise.resolve(null);
    if (!nichoCache[k]) nichoCache[k] = buscarJSON('conteudo/nichos/' + k + '.json');
    return nichoCache[k];
  }
  var SEMANA_RESERVA = { 0: null, 1: null, 2: { abre: '09:00', fecha: '19:00' }, 3: { abre: '09:00', fecha: '19:00' }, 4: { abre: '09:00', fecha: '19:00' }, 5: { abre: '09:00', fecha: '19:00' }, 6: { abre: '09:00', fecha: '17:00' } };
  function semanaDe(preset) {
    var f = preset && preset.funcionamentoSugerido;
    return f && f.semana ? f.semana : SEMANA_RESERVA;
  }
  function minutos(h) { var m = /^(\d{2}):(\d{2})$/.exec(h || ''); return m ? (+m[1]) * 60 + (+m[2]) : NaN; }
  function hhmm(min) { var h = Math.floor(min / 60), m = min % 60; return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }

  /* ------------------------------------------------------------ moldura sem X-Frame-Options
     A hospedagem responde TODAS as páginas com X-Frame-Options: DENY (o _headers é ignorado), então
     nenhuma página nossa abre em iframe por endereço. O documento entra como blob, que não tem
     cabeçalho HTTP: mesma origem, <base> para os caminhos relativos, e o endereço pretendido em
     window.__creatLocal (a query não viaja em URL de blob; o fragmento viaja). Dentro do blob, link
     para página nossa abre na aba inteira e âncora rola a página, porque navegar a moldura para um
     endereço nosso voltaria a ser bloqueado. Se algo falhar, vale o caminho antigo (endereço direto).
     Sem DENY na resposta (o _headers no ar), a moldura abre pelo endereço: a CSP dele recusa blob: em frame-src. */
  function carregarNoQuadro(fr, url) {
    var u; try { u = new URL(url, location.href); } catch (e) { fr.src = url; return; }
    var direto = function () { try { fr.contentWindow.location.replace(u.href); } catch (e) { fr.src = u.href; } };
    if (!W.fetch || !W.Blob || !W.URL || !URL.createObjectURL || u.origin !== location.origin || location.protocol === 'file:') { direto(); return; }
    var ctl = W.AbortController ? new AbortController() : null;
    fetch(u.origin + u.pathname, { credentials: 'same-origin', signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (!r.ok) throw new Error('http');
      var xfo = (r.headers.get('x-frame-options') || '').toLowerCase(), fa = /frame-ancestors\s+'none'/i.test(r.headers.get('content-security-policy') || '');
      if (xfo.indexOf('deny') === -1 && !fa) { if (ctl) ctl.abort(); direto(); return null; }
      return r.text();
    }).then(function (html) {
      if (html == null) return;
      var recusa = function (ev) { if (/^blob/.test(ev.blockedURI || '') && /^frame-src|^child-src/.test(ev.violatedDirective || ev.effectiveDirective || '')) { D.removeEventListener('securitypolicyviolation', recusa); direto(); } };
      D.addEventListener('securitypolicyviolation', recusa);
      setTimeout(function () { D.removeEventListener('securitypolicyviolation', recusa); }, 10000);
      var base = u.origin + u.pathname.replace(/[^\/]*$/, '');
      var local = JSON.stringify({ search: u.search, hash: u.hash, base: base }).replace(/</g, '\\u003c');
      var inj = '<base href="' + base.replace(/"/g, '%22') + '"><script>window.__creatLocal=' + local + ';' +
        'document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a)return;' +
        'var h=a.getAttribute("href")||"";if(h.charAt(0)==="#"){e.preventDefault();var d=h.length>1?document.getElementById(decodeURIComponent(h.slice(1))):null;' +
        'if(d&&d.scrollIntoView)d.scrollIntoView();return;}' +
        'if(!a.target&&/^https?:$/.test(a.protocol)&&a.origin===' + JSON.stringify(u.origin) + ')a.target="_top";},true);<\/script>';
      html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, function (m) { return m + inj; }) : inj + html;
      var antigo = fr.getAttribute('data-blob');
      var b = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      fr.setAttribute('data-blob', b);
      try { fr.contentWindow.location.replace(b + u.hash); } catch (e) { fr.src = b + u.hash; }
      if (antigo) setTimeout(function () { try { URL.revokeObjectURL(antigo); } catch (e) {} }, 5000);
    }).catch(direto);
  }

  /* ------------------------------------------------------------ sede (iframe sob demanda) */
  function urlSede() {
    // No repositório a sede mora em /sede/ na raiz; publicada, ela vai para /sede/ do site (T10 copia).
    var i = RAIZ.indexOf('/projetos/creat-nuvem/');
    return i !== -1 ? RAIZ.slice(0, i) + '/sede/index.html' : RAIZ + 'sede/index.html';
  }
  // O nome vai só no fragmento (#marca=), que o navegador não envia ao servidor, à CDN nem no Referer
  // (ADR-002). A query leva só parâmetros sem dado pessoal. O atributo src do iframe fica limpo.
  // marcaFicticia: nome dos sites-demonstração (fictício, público), que pode ir na query (?marca=).
  function carregarSede(janela, nome, lite, aoCarregar, marcaFicticia, etapa) {
    var ja = janela.querySelector('iframe'); if (ja) return ja;
    var q = ['modo=demo']; if (lite) q.push('lite=1');
    if (typeof etapa === 'number' && etapa > 0 && etapa <= 5 && etapa % 1 === 0) q.push('etapa=' + etapa);   // a sede começa no passo da comanda
    if (marcaFicticia && !nome) q.push('marca=' + encodeURIComponent(cortar28(marcaFicticia)));
    var url = urlSede() + '?' + q.join('&') + (nome ? '#marca=' + encodeURIComponent(cortar28(nome)) : '');
    var carregando = el('div', { class: 'carregando sede-carregando', role: 'status' });
    carregando.appendChild(el('img', { class: 'placa-mini', src: RAIZ + 'assets/svg/placa.svg', alt: '', width: '120', height: '109' }));
    carregando.appendChild(el('p', null, 'Carregando a sede...'));
    var fr = el('iframe', { title: 'Sede da Creat Nuvem em 3D, demonstração', referrerpolicy: 'no-referrer', allow: 'autoplay \'none\'' });
    fr.addEventListener('load', function () { if (fr.getAttribute('data-alvo') === '1') { carregando.remove(); if (aoCarregar) aoCarregar(); } });
    var poster = janela.querySelector('[data-poster]');
    if (poster) poster.hidden = true;
    var botao = janela.querySelector('[data-ver-ao-vivo]'); if (botao) botao.hidden = true;
    janela.insertBefore(carregando, janela.firstChild);
    janela.insertBefore(fr, janela.firstChild);
    fr.setAttribute('data-alvo', '1'); carregarNoQuadro(fr, url);
    evento('sede_aberta', {});
    return fr;
  }
  function montarJanelaSede(janela, nomeFn) {
    if (!janela) return;
    var botao = janela.querySelector('[data-ver-ao-vivo]');
    var abrir = function () { carregarSede(janela, nomeFn ? nomeFn() : '', true); };
    if (botao) botao.addEventListener('click', abrir);
    if (ehDesktop() && 'IntersectionObserver' in W) {
      var io = new IntersectionObserver(function (ents) { if (ents.some(function (e) { return e.isIntersecting; })) { io.disconnect(); abrir(); } }, { rootMargin: '300px 0px' });
      io.observe(janela);
    }
  }

  /* ------------------------------------------------------------ sede viva (home): cena + lista de etapas
     A cena (window.CreatSedeViva, contrato em scratchpad/sede-viva/plano.md 4.4) só é baixada quando a seção
     chega a 600 px da tela; roda sozinha com metade do palco na tela e pausa fora dela ou com a aba escondida.
     Os eventos dela (sedeviva:passo/estado/ciclo/toque/pronta/erro) acendem a lista (aria-current), o rosto
     atual e o Pausar. Movimento reduzido ou economia de dados: quadro final parado e a lista à vista.
     "Entrar na sede 3D" troca a cena pela sede 3D de hoje (carregarSede), que avisa por postMessage a etapa
     0..5 ({creatSede:1, tipo:'etapa'}); a lista acende os itens dessa etapa. O nome digitado pelo visitante
     só entra na cena por textContent, neste aparelho: nunca em URL, medição ou iframe por este caminho. */
  var ESTEIRA_AGORA = ['Nimbus organiza o pedido', 'Verbo escreve os textos e Paleta escolhe as cores', 'Pixel monta o site',
    'Lupa testa no celular e Muralha confere a segurança', 'Trilho publica o site', 'Site no ar. Pode abrir.'];
  var ESTEIRA_ULTIMA = ESTEIRA_AGORA.length - 1;     // = DEMO_ETAPAS.length da sede 3D (5 etapas + tudo feito)
  // Pasta da cena (contrato window.CreatSedeViva). Trocar de cena é só esta linha; rostos: true liga a faixa
  // rostos.webp da mesma pasta nos 7 botões de rosto (só depois do gatilho de 600 px, classe .sede-perto).
  var SEDE_CENA = { pasta: 'assets/sede-viva/', rostos: true };
  var SEDE_LEGENDAS = ['1 de 7 · Nimbus recebe o pedido', '1 de 7 · Nimbus organiza o pedido', '2 de 7 · Verbo escreve os textos',
    '3 de 7 · Paleta escolhe as cores', '4 de 7 · Pixel monta o site', '5 de 7 · Lupa testa no celular',
    '6 de 7 · Muralha confere a segurança', '7 de 7 · Você aprovou. Trilho publica.', 'Site no ar. Pode abrir.'];
  var SEDE_CENA_TEXTOS = {
    comanda: 'Pedido de demonstração', pedidoSite: 'Site com botão do WhatsApp', fechado: 'FECHADO', aberto: 'ABERTO',
    carimbo: 'No ar', seloTeste: 'Testado no celular', pausar: 'Pausar', continuar: 'Continuar',
    reduzido: 'Movimento desligado neste aparelho. As etapas estão na lista abaixo.',
    rotulo: 'Demonstração animada: a equipe da Creat monta o site de {marca}, nome fictício. As etapas estão na lista a seguir.',
    rotuloSeu: 'Demonstração animada: a equipe da Creat monta um site de exemplo com o nome do seu negócio. As etapas estão na lista a seguir.',
    legendaSeu: 'O nome do seu negócio na cena, só neste aparelho.',
    legenda3d: 'Arraste para girar a ilha e toque num personagem.'
  };
  var SEDE_ITENS_DA_ETAPA = [[0], [1, 2], [3], [4, 5], [6], [7]];   // etapa 0..5 da sede 3D -> itens da lista
  var SEDE_ETAPA_DO_ITEM = [0, 1, 1, 2, 3, 3, 4, 5];
  function montarSedeViva(sec, opc) {
    opc = opc || {};
    var janela = sec && $('#janela-sede', sec), est = sec && $('#esteira', sec), grupo = sec && $('[data-sede-marcas]', sec);
    var palco = janela && $('[data-sede-palco]', janela);
    if (!janela || !est || !grupo || !palco) return;
    var T = SEDE_CENA_TEXTOS;
    var viva = $('.sede-viva', sec), pausarBt = $('[data-sede-pausar]', janela), dica = $('[data-legenda-dica]', janela);
    var rostos = $$('[data-rosto]', sec), botao3d = $('[data-ver-ao-vivo]', sec);
    var link = $('[data-esteira-abrir]', sec), linkSr = $('[data-esteira-abrir-sr]', sec);
    var nomeEl = $('[data-esteira-nome]', est), agoraEl = $('[data-esteira-agora]', est), barra = $('[data-esteira-barra]', est);
    var itens = $$('.esteira-lista li', est), baloes = {};
    itens.forEach(function (li) { var b = $('[data-balao]', li); if (b) baloes[li.getAttribute('data-agente')] = b.textContent.replace(/^[.\s]+/, ''); });
    var podeCena = !!(W.IntersectionObserver && W.fetch && W.CustomEvent && D.head && D.documentElement.animate);
    var cena = null, baixou = false, pronta = false, falhou = false, prazo = 0, estaticoAgora = false;
    var fr = null, modo3d = false, palcoNaTela = false, janelaNaTela = false, secPerto = false;
    var pausaBalao = false, tocou = false, trocasAuto = 0, somLigado = false, manual = false, seuNome = '', seuNicho = '', itemAtual = 0, relogioLista = 0, trocando = 0;
    var ALVO = location.origin && location.origin !== 'null' ? location.origin : '*';
    var atual = { nicho: 'barbearia', marca: '', seu: false };

    function economia() { var c = W.navigator && navigator.connection; return !!(c && c.saveData); }
    function estatico() { return !!MOV_REDUZIDO.matches || economia(); }
    function pintarItens(ativos, texto) {
      var min = Math.min.apply(null, ativos), max = Math.max.apply(null, ativos), agentes = [];
      itemAtual = max;
      itens.forEach(function (li, i) {
        var st = ativos.indexOf(i) !== -1 ? 'agora' : i < min ? 'feito' : 'fila';
        li.setAttribute('data-estado', st);
        if (st === 'agora') { li.setAttribute('aria-current', 'step'); agentes.push(li.getAttribute('data-agente')); } else li.removeAttribute('aria-current');
        var s = $('[data-st]', li); if (s) s.textContent = st === 'fila' ? 'na fila' : st;
      });
      agoraEl.textContent = texto || '';
      barra.style.setProperty('--progresso', String(max / (itens.length - 1 || 1)));
      var fim = max === itens.length - 1;
      [est, viva].forEach(function (x) { if (fim) x.setAttribute('data-fim', ''); else x.removeAttribute('data-fim'); });
      rostos.forEach(function (r) { if (agentes.indexOf(r.getAttribute('data-rosto')) !== -1) r.setAttribute('data-atual', ''); else r.removeAttribute('data-atual'); });
    }
    // cena falhou com movimento reduzido ou economia: lista no quadro final, "Abrir" em destaque
    function pintarFim() { pintarItens([itens.length - 1], SEDE_LEGENDAS[8]); }
    function pintarDica() {
      if (!dica) return;
      var partes = [];
      if (modo3d) partes.push(T.legenda3d);
      else if (estatico() && pronta) partes.push(T.reduzido);
      if (atual.seu) partes.push(T.legendaSeu);
      dica.textContent = partes.join(' ');
      dica.hidden = !partes.length;
    }
    function pintarPausar(pausado) {
      pausarBt.textContent = pausado ? T.continuar : T.pausar;
      if (pausado) pausarBt.setAttribute('data-pausado', ''); else pausarBt.removeAttribute('data-pausado');
    }

    /* ------------------------------ sede 3D (sob toque) */
    function pronta3d() { return !!(fr && fr.contentWindow && fr.getAttribute('data-pronta') === '1'); }
    function paraSede(msg) {
      if (!pronta3d()) return;
      msg.creatSede = 1;
      try { fr.contentWindow.postMessage(msg, ALVO); } catch (e) {}
    }
    function entrar3d() {
      if (fr) return;
      marcarToque();
      modo3d = true;
      var etapa = SEDE_ETAPA_DO_ITEM[itemAtual] || 0;
      soltarCena(); pararRelogioLista();
      sec.classList.remove('sede-com-cena', 'sede-estatica'); sec.classList.add('sede-3d');
      pausarBt.hidden = true;
      pintarItens(SEDE_ITENS_DA_ETAPA[etapa], ESTEIRA_AGORA[etapa]);
      var carregada = atual.marca;
      fr = carregarSede(janela, atual.seu ? seuNome : '', true, function () {
        fr.setAttribute('data-pronta', '1');
        pintarDica();
        paraSede({ tipo: 'visivel', visivel: janelaNaTela && !D.hidden });
        if (atual.marca !== carregada) paraSede({ tipo: 'marca', marca: atual.marca, reiniciar: true });
      }, atual.seu ? '' : atual.marca, etapa);
      try { fr.focus(); } catch (e) {}
    }
    W.addEventListener('message', function (ev) {
      if (!fr || ev.source !== fr.contentWindow || !(ev.origin === location.origin || ev.origin === 'null')) return;
      var d = ev.data;
      if (!d || d.creatSede !== 1 || d.tipo !== 'etapa' || typeof d.etapa !== 'number' || d.etapa % 1 || d.etapa < 0 || d.etapa > ESTEIRA_ULTIMA) return;
      pintarItens(SEDE_ITENS_DA_ETAPA[d.etapa], ESTEIRA_AGORA[d.etapa]);
      janela.setAttribute('data-sede-pronta', '');   // a sede respondeu: o selo DEMONSTRAÇÃO dela está na tela, o da janela sai
    });

    /* ------------------------------ cena */
    function textosCena() {
      return { legendas: SEDE_LEGENDAS.slice(), comanda: [T.comanda, T.pedidoSite], fechado: T.fechado, aberto: T.aberto,
        carimbo: T.carimbo, seloTeste: T.seloTeste, baloes: JSON.parse(JSON.stringify(baloes)) };
    }
    function soltarCena() {
      clearTimeout(prazo); prazo = 0;
      if (cena) { try { cena.destruir(); } catch (e) {} }
      cena = null; pronta = false; pausaBalao = false;
    }
    function cair() {
      if (falhou || modo3d) return;
      falhou = true; soltarCena();
      sec.classList.remove('sede-com-cena', 'sede-estatica');
      pausarBt.hidden = true;
      andarLista();
    }
    function baixarCena() {
      if (baixou || modo3d || !podeCena) return;
      baixou = true;
      sec.classList.add('sede-perto');
      if (SEDE_CENA.rostos) sec.classList.add('sede-rostos-img');
      var faltam = 2, pronto = function () { if (--faltam === 0) montarCena(); };
      var css = el('link', { rel: 'stylesheet', href: RAIZ + SEDE_CENA.pasta + 'cena.css' });
      css.addEventListener('load', pronto); css.addEventListener('error', cair);
      var js = el('script', { src: RAIZ + SEDE_CENA.pasta + 'cena.js' });
      js.addEventListener('load', pronto); js.addEventListener('error', cair);
      D.head.appendChild(css); D.head.appendChild(js);
      prazo = setTimeout(cair, 12000);
    }
    function montarCena() {
      if (cena || modo3d || falhou) return;
      var api = W.CreatSedeViva;
      if (!api || api.versao !== 1 || typeof api.montar !== 'function') { cair(); return; }
      estaticoAgora = estatico();
      clearTimeout(prazo);
      try {
        cena = api.montar(palco, { raiz: RAIZ, negocio: { nicho: atual.nicho, marca: atual.marca }, estatico: estaticoAgora, textos: textosCena(), som: somLigado ? somFn : null });
      } catch (e) { cena = null; cair(); return; }
      prazo = setTimeout(function () { if (!pronta) cair(); }, 8000);
      avisarVisivel();
    }
    palco.addEventListener('sedeviva:pronta', function () {
      if (!cena) return;
      pronta = true; clearTimeout(prazo);
      sec.classList.toggle('sede-estatica', estaticoAgora);
      pausarBt.hidden = estaticoAgora;
      pintarPausar(false); pintarDica();
      avisarVisivel();
    });
    palco.addEventListener('sedeviva:passo', function (e) {
      var d = e.detail || {};
      if (!cena || typeof d.item !== 'number' || d.item < 0 || d.item >= itens.length) return;
      // troca de negócio no meio do ciclo: a cena desce a porta (passa pelo fim) e recomeça no passo 0;
      // a lista já foi para o passo 1 e não volta a "Site no ar" no meio da troca
      if (trocando) { if (d.passo !== 0) return; clearTimeout(trocando); trocando = 0; }
      pintarItens([d.item], SEDE_LEGENDAS[d.passo] || '');
    });
    palco.addEventListener('sedeviva:estado', function (e) {
      var d = e.detail || {};
      if (!cena || d.motivo === 'fora' || d.motivo === 'aba') return;
      pintarPausar(!!d.pausado && (d.motivo === 'usuario' || d.motivo === 'balao'));
      pausaBalao = !!d.pausado && d.motivo === 'balao';   // Esc só fecha o balão; a pausa do botão termina no Continuar
    });
    palco.addEventListener('sedeviva:ciclo', function () {
      // ninguém tocou na seção: o próximo ciclo mostra outro negócio (no máximo 2 trocas; o nome do visitante fica)
      if (!cena || tocou || atual.seu || trocasAuto >= 2) return;
      var chips = $$('.chip:not([data-seu])', grupo), i = chips.indexOf($('.chip[aria-pressed="true"]', grupo));
      if (i < 0 || !chips.length) return;
      trocasAuto++;
      escolher(chips[(i + 1) % chips.length]);
    });
    palco.addEventListener('sedeviva:toque', marcarToque);
    palco.addEventListener('sedeviva:erro', cair);
    function avisarVisivel() { if (cena) cena.visivel(palcoNaTela && !D.hidden); }
    function remontar() {
      if (falhou && !modo3d) { andarLista(); return; }
      if (!cena || modo3d || falhou || estatico() === estaticoAgora) return;
      soltarCena(); montarCena();
    }
    if (MOV_REDUZIDO.addEventListener) MOV_REDUZIDO.addEventListener('change', remontar);
    else if (MOV_REDUZIDO.addListener) MOV_REDUZIDO.addListener(remontar);

    // sem a cena (falha ou navegador antigo): a lista anda sozinha, como antes, só com a seção na tela
    function pararRelogioLista() { clearInterval(relogioLista); relogioLista = 0; }
    function andarLista() {
      pararRelogioLista();
      if (!falhou || cena || modo3d) return;   // só sem a cena (falha ou navegador antigo)
      if (estatico()) { pintarFim(); return; }
      if (!secPerto || D.hidden) return;
      relogioLista = setInterval(function () { var p = (itemAtual + 1) % itens.length; pintarItens([p], SEDE_LEGENDAS[p === 7 ? 8 : p === 0 ? 1 : p + 1]); }, 2600);
    }

    /* ------------------------------ toque, chips, rostos, Pausar */
    function marcarToque() {
      tocou = true;
      if (!somLigado) { somLigado = true; if (cena) cena.som(somFn); }
    }
    function escolher(btn) {
      if (!btn) return;
      $$('.chip', grupo).forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
      var seu = btn.hasAttribute('data-seu');
      atual = { nicho: seu ? seuNicho : btn.getAttribute('data-nicho') || 'barbearia', marca: seu ? seuNome : btn.getAttribute('data-marca') || '', seu: seu };
      nomeEl.textContent = atual.marca;
      palco.setAttribute('aria-label', seu ? T.rotuloSeu : T.rotulo.replace('{marca}', atual.marca));
      if (seu) { link.firstChild.textContent = 'Ver a prévia do seu site'; link.setAttribute('href', '#porta'); linkSr.textContent = ''; }
      else {
        link.firstChild.textContent = 'Abrir o site pronto';
        link.setAttribute('href', btn.getAttribute('data-site'));
        linkSr.textContent = ': ' + atual.marca + ' (site-demonstração, nome fictício)';
      }
      pintarDica();
      if (modo3d) { pintarItens([0], ESTEIRA_AGORA[0]); paraSede({ tipo: 'marca', marca: atual.marca, reiniciar: true }); }
      else if (cena) {
        pintarItens([0], SEDE_LEGENDAS[0]);
        if (pronta && !estaticoAgora) { clearTimeout(trocando); trocando = setTimeout(function () { trocando = 0; }, 1500); }
        cena.negocio({ nicho: atual.nicho, marca: atual.marca });
      }
      else if (falhou && estatico()) pintarFim();
      else pintarItens([0], SEDE_LEGENDAS[0]);
    }
    $$('.chip', grupo).forEach(function (b) { b.addEventListener('click', function () { marcarToque(); manual = true; escolher(b); }); });
    link.addEventListener('click', function (e) {
      if (atual.seu && opc.abrirSeu) { e.preventDefault(); opc.abrirSeu(); }
    });
    rostos.forEach(function (r) {
      r.addEventListener('click', function () { marcarToque(); if (cena && pronta) cena.focar(r.getAttribute('data-rosto')); });
    });
    pausarBt.addEventListener('click', function () {
      marcarToque();
      if (!cena) return;
      if (pausarBt.hasAttribute('data-pausado')) cena.continuar(); else cena.pausar();
    });
    sec.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'Esc') && cena && pausaBalao) cena.continuar();
    });
    sec.addEventListener('click', function (e) { if (palco.contains(e.target)) marcarToque(); });
    if (botao3d) botao3d.addEventListener('click', entrar3d);

    // chip com o nome do próprio visitante (digitado no hero): só para barbearia, salão e academia, que têm site
    // de exemplo para nascer; o nome fica neste aparelho (textContent na cena, fragmento/postMessage na sede 3D)
    function conferirSeu() {
      var s = opc.seu ? opc.seu() : null, chip = $('[data-seu]', grupo);
      var n = s && s.n && s.k && NICHOS.indexOf(s.k) !== -1 ? cortar28(s.n) : '';
      if (!n) {
        if (chip) { var era = chip.getAttribute('aria-pressed') === 'true'; grupo.removeChild(chip); if (era) escolher($('.chip', grupo)); }
        seuNome = ''; seuNicho = ''; return;
      }
      var mudou = n !== seuNome || s.k !== seuNicho; seuNome = n; seuNicho = s.k;
      if (!chip) {
        chip = el('button', { class: 'chip chip-seu', type: 'button', 'aria-pressed': 'false', 'data-seu': '' });
        chip.addEventListener('click', function () { marcarToque(); manual = true; escolher(chip); });
        grupo.insertBefore(chip, grupo.firstChild);
      }
      chip.textContent = n;
      chip.appendChild(el('span', { class: 'so-leitor' }, ' (o seu negócio)'));
      if (!manual || (mudou && chip.getAttribute('aria-pressed') === 'true')) escolher(chip);
    }

    /* ------------------------------ quando carregar e quando rodar */
    if (podeCena) {
      sec.classList.add('sede-com-cena');   // reserva o palco já na carga: nada pula quando a cena chega
      new IntersectionObserver(function (ents) {
        var v = ents.some(function (e) { return e.isIntersecting; });
        if (v === secPerto) return;
        secPerto = v;
        if (v) { conferirSeu(); baixarCena(); }
        andarLista();
      }, { rootMargin: '600px 0px' }).observe(sec);
      new IntersectionObserver(function (ents) {
        var e = ents[ents.length - 1];
        palcoNaTela = !!e && e.isIntersecting && e.intersectionRatio >= 0.5;
        avisarVisivel();
      }, { threshold: [0, 0.5, 1] }).observe(palco);
      new IntersectionObserver(function (ents) {
        var v = ents.some(function (e) { return e.isIntersecting; });
        if (v === janelaNaTela) return;
        janelaNaTela = v;
        paraSede({ tipo: 'visivel', visivel: v && !D.hidden });
      }, { rootMargin: '200px 0px' }).observe(janela);
    } else { secPerto = true; falhou = true; }
    D.addEventListener('visibilitychange', function () {
      avisarVisivel(); andarLista();
      paraSede({ tipo: 'visivel', visivel: janelaNaTela && !D.hidden });
    });
    escolher($('.chip[aria-pressed="true"]', grupo) || $('.chip', grupo));
    andarLista();
  }

  /* ------------------------------------------------------------ id do pedido */
  /* Id público e segredo do pedido (docs/PEDIDO-API.md 4.1). O id ('PA-' e 10 Crockford, 256 % 32 = 0, sem viés)
     vai ao servidor, ao WhatsApp e à tela. O segredo (128 bits em base64url, 22 caracteres) fica só neste aparelho
     e só viaja no corpo das chamadas ao servidor: nunca na URL, no WhatsApp ou na medição. */
  function aleatorio(n) { var b = new Uint8Array(n); (W.crypto || W.msCrypto).getRandomValues(b); return b; }
  function novoId() {
    var A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ', b = aleatorio(10), s = 'PA-';
    for (var i = 0; i < 10; i++) s += A.charAt(b[i] % 32);
    return s;
  }
  function novoSegredo() {
    var b = aleatorio(16), s = '';
    for (var i = 0; i < 16; i++) s += String.fromCharCode(b[i]);
    return W.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function isoComFuso(d) {
    var off = -d.getTimezoneOffset(), sinal = off >= 0 ? '+' : '-', a = Math.abs(off);
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + sinal + p(Math.floor(a / 60)) + ':' + p(a % 60);
  }

  /* ======================================================================
     HOME
     ====================================================================== */
  function paginaHome() {
    var q = new URLSearchParams(location.search);
    // A home nunca guarda nome ou cidade no endereço (Pixel e Clarity podem ler a URL depois do aceite):
    // iniciar() já leu o fragmento vindo de /abrir/ ou /previa/ e limpou o endereço (limparEndereco).
    var hashIni = ENTRADA.frag;
    utmAtual = ENTRADA.query; if (!Object.keys(utmAtual).length) utmAtual = hashIni.utm;

    var form = $('#form-abrir'), campoNome = $('#nome'), campoCidade = $('#cidade');
    var caixaNome = campoNome.closest('.campo'), erroNome = $('#nome-erro'), erroNicho = $('#nicho-erro');
    var nichoQ = q.get('nicho'); if (nichoQ === 'salão' || nichoQ === 'estetica') nichoQ = 'salao';
    var nichoIni = NICHOS.indexOf(nichoQ) !== -1 ? nichoQ : hashIni.k;
    if (nichoIni) { var r0 = $('input[name="nicho"][value="' + nichoIni + '"]'); if (r0) r0.checked = true; }
    // Título da dobra no nicho (assets/nicho-cedo.js já marcou antes da pintura; aqui confirma e segue a troca do chip).
    function tituloDoNicho(k) { if (NICHOS.indexOf(k) !== -1) D.documentElement.setAttribute('data-nicho', k); else D.documentElement.removeAttribute('data-nicho'); }
    tituloDoNicho(nichoIni);
    $$('input[name="nicho"]').forEach(function (r) { r.addEventListener('change', function () { if (r.checked) tituloDoNicho(r.value); }); });
    // Exemplo do campo do nome conforme o nicho (quem chega pelo anúncio de salão não lê "Barbearia do Zé").
    var EXEMPLO_NOME = { barbearia: 'Exemplo: Barbearia do Zé', salao: 'Exemplo: Studio da Ana', academia: 'Exemplo: Academia Ponto Forte' };
    function exemploDoNicho(k) { if (EXEMPLO_NOME[k]) campoNome.setAttribute('placeholder', EXEMPLO_NOME[k]); }
    exemploDoNicho(nichoIni);
    $$('input[name="nicho"]').forEach(function (r) { r.addEventListener('change', function () { if (r.checked) exemploDoNicho(r.value); }); });
    if (hashIni.n) campoNome.value = hashIni.n;
    if (hashIni.c) campoCidade.value = hashIni.c;
    function contarNome() { var cg = $('#contador-giz'); if (cg) cg.textContent = limparNome(campoNome.value).length + ' de 40'; }
    contarNome();   // nome preenchido pelo código (volta de /abrir/) também atualiza o "X de 40"
    contar('visita', nichoIni);

    function nichoAtual() { var r = $('input[name="nicho"]:checked'); return r ? r.value : null; }
    function estado() {
      var n = limparNome(campoNome.value), c = limparNome(campoCidade.value);
      return { k: nichoAtual(), n: nomeValido(n) ? n : null, c: c && cidadeValida(c) ? c : null, p: 1, utm: utmAtual };
    }

    /* placa (T6) */
    var placa = W.CreatPlaca && typeof W.CreatPlaca.montar === 'function' ? W.CreatPlaca : null;
    var ponto = $('#placa'), reserva = ponto ? ponto.querySelector('.placa-reserva') : null;
    var abrindo = false;
    if (placa && ponto) {
      try {
        if (reserva) reserva.remove();
        placa.montar(ponto, {
          nome: limparNome(campoNome.value),
          onAberto: function (info) { aoAbrirPlaca(info && info.via); },
          onSemNome: function () { mostrarErroNome('Digite o nome do seu negócio para a placa virar.'); }
        });
        $$('.dica-arrastar').forEach(function (d) { d.hidden = false; });
      } catch (e) { placa = null; if (reserva && !reserva.isConnected) ponto.appendChild(reserva); }
    }
    if (!placa) $$('.dica-arrastar').forEach(function (d) { d.hidden = true; });

    // No celular a placa fica logo abaixo do botão, quase fora da tela: ao enviar, ela sobe para a vista e a
    // pessoa vê a virada para ABERTO com o nome a giz antes da prévia abrir (o ritual não acontece escondido).
    function mostrarPlaca() {
      if (!ponto || !ponto.getBoundingClientRect) return;
      var r = ponto.getBoundingClientRect(), vh = W.innerHeight || 0;
      if (!r.height || (r.top >= 0 && r.bottom <= vh)) return;
      try { ponto.scrollIntoView({ block: 'center', behavior: MOV_REDUZIDO.matches ? 'auto' : 'smooth' }); } catch (e) {}
    }
    function mostrarErroNome(msg) {
      caixaNome.setAttribute('data-estado', 'erro'); erroNome.textContent = msg; erroNome.hidden = false;
      campoNome.setAttribute('aria-invalid', 'true'); campoNome.focus();
    }
    function limparErroNome() { caixaNome.removeAttribute('data-estado'); erroNome.hidden = true; campoNome.removeAttribute('aria-invalid'); }
    function validarNome() {
      var n = limparNome(campoNome.value);
      if (!n) { mostrarErroNome('Digite o nome do seu negócio para a placa virar.'); return false; }
      if (n.length > 40) { mostrarErroNome('Use até 40 letras. Se o nome for maior, escreva como o cliente chama o seu negócio.'); return false; }
      if (!RE_NOME.test(n)) { mostrarErroNome('Use só letras, números, espaço e estes sinais: & . - \''); return false; }
      return true;
    }
    function validarNicho() {
      if (nichoAtual()) { erroNicho.hidden = true; return true; }
      erroNicho.hidden = false; var r = $('input[name="nicho"]'); if (r) r.focus();
      return false;
    }
    function validarCidade() {
      var c = limparNome(campoCidade.value), cx = campoCidade.closest('.campo'), er = $('#cidade-erro');
      if (!c || cidadeValida(c)) { cx.removeAttribute('data-estado'); er.hidden = true; return true; }
      cx.setAttribute('data-estado', 'erro'); er.hidden = false; campoCidade.focus(); return false;
    }

    var nomeContado = false;
    campoNome.addEventListener('input', function () {
      limparErroNome();
      var n = limparNome(campoNome.value);
      contarNome();
      if (placa && placa.definirNome) { try { placa.definirNome(n.slice(0, 40)); } catch (e) {} }
      if (n && !nomeContado && nichoAtual()) { nomeContado = true; evento('nome_digitado', { nicho: nichoAtual() }); }
    });
    $$('input[name="nicho"]').forEach(function (r) {
      r.addEventListener('change', function () {
        erroNicho.hidden = true; somFn('clique');
        evento('nicho_escolhido', { nicho: r.value });
        if (!nomeContado && limparNome(campoNome.value)) { nomeContado = true; evento('nome_digitado', { nicho: r.value }); }
        prepararTeste(r.value);
      });
    });
    $$('[data-espera]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-espera'), msg = b.getAttribute('data-msg');
        evento('lista_espera_enviada', { nicho: k });
        if (suporteOk()) { abrirExterno(linkWhats(CK.whatsappSuporte, msg)); aviso('Abrimos o WhatsApp com o pedido de aviso. É só tocar em enviar.'); }
        else { location.href = linkEmail('Avise-me quando chegar o meu nicho', msg); aviso('Abrimos o seu e-mail com o pedido de aviso. É só enviar.'); }
      });
    });

    function aoAbrirPlaca(via) {
      if (abrindo) return;
      if (!validarNome() || !validarNicho() || !validarCidade()) { if (placa) { try { placa.reiniciar(); placa.definirNome(limparNome(campoNome.value)); } catch (e) {} } return; }
      abrindo = true;
      setTimeout(function () { abrindo = false; abrirPrevia(); }, MOV_REDUZIDO.matches ? 220 : 680);
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var n = limparNome(campoNome.value);
      if (!n && placa) { try { placa.abrir('botao'); } catch (x) {} mostrarErroNome('Digite o nome do seu negócio para a placa virar.'); return; }
      if (!validarNome() || !validarNicho() || !validarCidade()) return;
      mostrarPlaca();
      if (placa) { try { placa.definirNome(n); placa.abrir('botao'); return; } catch (x) {} }
      aoAbrirPlaca('botao');
    });

    if ('IntersectionObserver' in W && ponto) {
      var vio = new IntersectionObserver(function (ents) { if (ents.some(function (e) { return e.isIntersecting; })) { vio.disconnect(); evento('placa_vista', {}); } }, { threshold: 0.5 });
      vio.observe(ponto);
    }

    /* prévia em tela cheia (T4 por iframe) */
    var previa = $('#previa'), frame = $('#previa-frame'), carregandoPrevia = $('#previa-carregando');
    var fora = [$('header.barra'), $('main'), $('footer.rodape'), $('.zap-flutuante')];
    var urlPreviaAtual = '', linkPreviaAtual = '', focoAntes = null;
    function abrirPrevia() {
      var s = estado(); if (!s.k || !s.n) return;
      var frag = montarFragmento(s, false);
      urlPreviaAtual = RAIZ + 'previa/#' + frag;          // o quadro abre na mesma origem
      linkPreviaAtual = enderecoPublico() + 'previa/#' + frag;   // o link copiado nasce no canônico
      $('#previa-nome').textContent = s.n;
      var cn = $('#previa-carregando-nome'); if (cn) cn.textContent = s.n;
      frame.title = 'Prévia do site: ' + s.n;   // sem artigo fixo: "da Studio" e "da Salão" quebram (PG-N4)
      carregandoPrevia.hidden = false; frame.style.visibility = 'hidden';
      previa.hidden = false; D.body.classList.add('com-previa');
      fora.forEach(function (x) { if (x) x.setAttribute('inert', ''); });
      focoAntes = D.activeElement;
      carregarNoQuadro(frame, urlPreviaAtual);
      if (!history.state || !history.state.previa) history.pushState({ previa: 1 }, '', location.pathname + location.search + '#previa');
      requestAnimationFrame(function () { previa.classList.add('aberta'); $('#previa-fechar').focus(); });
      evento('previa_gerada', { nicho: s.k });
      contar('previa', s.k);
      pixelViewContent(s.k);
      try { W.dispatchEvent(new CustomEvent('creat:previa-aberta')); } catch (e) {}
    }
    frame.addEventListener('load', function () {
      if (!urlPreviaAtual) return;
      carregandoPrevia.hidden = true; frame.style.visibility = '';
    });
    function fecharPrevia(deHistorico) {
      if (previa.hidden) return;
      previa.hidden = true; previa.classList.remove('aberta'); D.body.classList.remove('com-previa');
      fora.forEach(function (x) { if (x) x.removeAttribute('inert'); });
      if (placa) { try { placa.reiniciar(); placa.definirNome(limparNome(campoNome.value)); } catch (e) {} }
      if (!deHistorico && history.state && history.state.previa) history.back();
      if (focoAntes && focoAntes.focus) focoAntes.focus();
      try { W.dispatchEvent(new CustomEvent('creat:previa-fechada')); } catch (e) {}
    }
    $('#previa-fechar').addEventListener('click', function () { fecharPrevia(false); });
    W.addEventListener('popstate', function () { if (!previa.hidden) fecharPrevia(true); });
    previa.addEventListener('keydown', function (e) { if (e.key === 'Escape') fecharPrevia(false); });
    $('#previa-copiar').addEventListener('click', function () {
      var ok = function () { aviso('Link copiado. Mande para quem você quiser.'); };
      var falhou = function () { aviso('Não deu para copiar. Toque e segure o endereço do navegador para copiar.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(linkPreviaAtual).then(ok, falhou); else falhou();
    });
    // Seção "Teste de verdade": o nome do site que a pessoa acabou de ver, ao lado do botão de pedir (só na tela, nunca enviado)
    function nomeNoTeste() {
      var s = estado(), el = $('#teste-pedir-nome'); if (!el) return;
      el.textContent = s.n || ''; el.parentNode.hidden = !s.n;
    }
    $('#previa-testar').addEventListener('click', function () {
      nomeNoTeste();
      fecharPrevia(false);
      setTimeout(function () { var s = $('#teste'); s.scrollIntoView({ behavior: MOV_REDUZIDO.matches ? 'auto' : 'smooth', block: 'start' }); $('#teste-whats').focus({ preventScroll: true }); }, 60);
    });
    function irParaAbrir(plano) {
      var s = estado(); s.plano = plano;
      // InitiateCheckout não sai daqui: só no clique em pagar de /abrir/, com o valor cobrado.
      location.href = RAIZ + 'abrir/#' + montarFragmento(s, true);
    }
    $('#previa-quero').addEventListener('click', function () { irParaAbrir('aberto'); });
    // Links de plano: o href no HTML é só "abrir/#plano=..."; nome e cidade entram no clique (nunca ficam no DOM).
    $$('[data-plano]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); irParaAbrir(a.getAttribute('data-plano')); });
    });
    $$('[data-ir-hero]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); $('#porta').scrollIntoView({ behavior: MOV_REDUZIDO.matches ? 'auto' : 'smooth' }); campoNome.focus({ preventScroll: true }); });
    });

    /* teste de verdade */
    var tForm = $('#form-teste'), tWhats = $('#teste-whats'), tServ = $('#teste-servico'), tDia = $('#teste-dia'), tHora = $('#teste-hora');
    ligarMascara(tWhats);
    var presetTeste = null, nichoTeste = null;
    function prepararTeste(k) {
      k = k || nichoAtual() || 'barbearia';
      if (k === nichoTeste) return;
      nichoTeste = k;
      lerNicho(k).then(function (pre) {
        if (nichoTeste !== k) return;
        presetTeste = pre;
        tServ.textContent = '';
        tServ.appendChild(el('option', { value: '' }, 'Escolha um serviço'));
        var lista = pre && Array.isArray(pre.servicos) ? pre.servicos : [];
        if (!lista.length) lista = [{ nome: 'Horário' }];
        lista.forEach(function (sv) { if (sv && sv.nome) tServ.appendChild(el('option', { value: sv.nome }, sv.nome)); });
        $('#teste-nicho').textContent = ROTULO_NICHO[k];
        montarDias();
      });
    }
    function montarDias() {
      var sem = semanaDe(presetTeste), passo = Math.max(30, (presetTeste && presetTeste.funcionamentoSugerido && presetTeste.funcionamentoSugerido.passoMin) || 30);
      var hoje = new Date(); tDia.textContent = ''; tDia.appendChild(el('option', { value: '' }, 'Escolha o dia'));
      for (var i = 0, n = 0; i < 10 && n < 7; i++) {
        var d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + i), h = sem[String(d.getDay())];
        if (!h) continue;
        var ini = minutos(h.abre), fim = minutos(h.fecha) - passo;
        if (i === 0) { var agora = hoje.getHours() * 60 + hoje.getMinutes() + 60; ini = Math.max(ini, Math.ceil(agora / passo) * passo); }
        if (isNaN(ini) || isNaN(fim) || ini > fim) continue;
        var rot = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : DIA_NOME[d.getDay()] + ', ' + ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
        var op = el('option', { value: rot.toLowerCase(), 'data-ini': ini, 'data-fim': fim, 'data-passo': passo }, rot);
        tDia.appendChild(op); n++;
      }
      montarHoras();
    }
    function montarHoras() {
      var op = tDia.selectedOptions && tDia.selectedOptions[0];
      tHora.textContent = ''; tHora.appendChild(el('option', { value: '' }, op && op.value ? 'Escolha o horário' : 'Escolha o dia antes'));
      if (!op || !op.value) return;
      for (var m = +op.getAttribute('data-ini'), f = +op.getAttribute('data-fim'), p = +op.getAttribute('data-passo'); m <= f; m += p) tHora.appendChild(el('option', { value: hhmm(m) }, hhmm(m)));
    }
    tDia.addEventListener('change', montarHoras);
    function erroCampo(input, msg) {
      var cx = input.closest('.campo'), er = cx.querySelector('.erro');
      if (msg) { cx.setAttribute('data-estado', 'erro'); er.textContent = msg; er.hidden = false; input.setAttribute('aria-invalid', 'true'); }
      else { cx.removeAttribute('data-estado'); er.hidden = true; input.removeAttribute('aria-invalid'); }
      return !msg;
    }
    tWhats.addEventListener('input', function () { erroCampo(tWhats, ''); });
    tForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var numero = normalizarWhats(tWhats.value);
      var ok = [
        erroCampo(tWhats, !soDigitos(tWhats.value) ? 'Digite o seu WhatsApp com DDD.' : !numero ? 'Esse número não parece um celular com DDD. Confira e digite de novo, por exemplo (11) 9XXXX-XXXX.' : ''),
        erroCampo(tServ, tServ.value ? '' : 'Escolha um serviço para o teste.'),
        erroCampo(tDia, tDia.value ? '' : 'Escolha um dia e um horário para o teste.'),
        erroCampo(tHora, tHora.value ? '' : 'Escolha um dia e um horário para o teste.')
      ];
      if (ok.indexOf(false) !== -1) { var inv = tForm.querySelector('[aria-invalid="true"]'); if (inv) inv.focus(); return; }
      var s = estado();
      var modelo = 'Teste do Porta Aberta. Assim chega um pedido de horário no seu site ({negocio}): "Olá! Quero pedir um horário: {servico}, {dia} às {hora}. Meu nome é (nome do cliente)." No site de verdade, o dono confirma pelo WhatsApp.';
      if (!s.n) modelo = modelo.replace(' ({negocio})', '');
      var msg = t(modelo, { negocio: s.n, servico: tServ.value, dia: tDia.value, hora: tHora.value });
      $('#celular-msg').textContent = msg;
      abrirExterno(linkWhats(numero, msg));   // o número só existe aqui, na memória, e no link do próprio WhatsApp
      somFn('plim');
      evento('reserva_teste', { nicho: nichoTeste || 'barbearia' });
      $('#teste-abriu').hidden = false;
      nomeNoTeste();
      var tq = $('#teste-quero'); if (tq) tq.classList.add('btn-sol');   // teste feito: pedir o site vira o próximo passo
    });
    $('#teste-alternativa').addEventListener('click', function () {
      var s = estado();
      var msg = t('Olá! Quero pedir um horário: {servico}, {dia} às {hora}. Meu nome é (nome do cliente).', { servico: tServ.value || 'Corte', dia: tDia.value || 'amanhã', hora: tHora.value || '10:00' });
      $('#celular-msg').textContent = msg;
      $('#celular-de').textContent = s.n ? 'Pedido pelo site: ' + s.n : 'Pedido pelo seu site';
      var cel = $('#celular'); cel.hidden = false; cel.classList.remove('chegou'); void cel.offsetWidth; cel.classList.add('chegou');
      somFn('plim');
    });
    if ('IntersectionObserver' in W) {
      var tio = new IntersectionObserver(function (ents) { if (ents.some(function (e) { return e.isIntersecting; })) { tio.disconnect(); prepararTeste(); } }, { rootMargin: '400px 0px' });
      tio.observe($('#teste'));
    } else prepararTeste();

    /* preços, prova, sede */
    lerPrecos().then(function (pr) { aplicarPrecos(pr, D); });
    buscarJSON('dados/depoimentos.json').then(function (dep) {
      var itens = Array.isArray(dep) ? dep : dep && Array.isArray(dep.itens) ? dep.itens : [];
      itens = itens.filter(function (i) { return i && typeof i.texto === 'string' && i.texto.trim() && typeof i.autor === 'string' && i.autor.trim() && typeof i.autorizadoEm === 'string' && !isNaN(Date.parse(i.autorizadoEm)); });
      var sec = $('#prova'); if (!sec) return;
      if (!itens.length) { sec.remove(); return; }       // regra dura 1: sem item autorizado, a seção some
      var ul = $('#prova-lista');
      itens.slice(0, 6).forEach(function (i) {
        var li = el('li'), bq = el('blockquote');
        bq.appendChild(el('p', null, i.texto.trim()));
        bq.appendChild(el('cite', null, i.autor.trim() + (i.negocio ? ', ' + String(i.negocio).trim() : '')));
        li.appendChild(bq); ul.appendChild(li);
      });
      sec.hidden = false;
    });
    montarSedeViva($('#sede'), {
      seu: function () { var s = estado(); return s.n && s.k ? { n: s.n, k: s.k } : null; },
      abrirSeu: function () { var s = estado(); if (s.n && s.k) abrirPrevia(); else { var c = $('#nome'); if (c) c.focus(); } }
    });
    // "Ver a prévia de novo" em /abrir/ manda &ver=1: a prévia abre direto, sem virar a placa outra vez.
    if (ENTRADA.ver) { var sv = estado(); if (sv.k && sv.n) abrirPrevia(); }

    /* WhatsApp flutuante: fora da tela enquanto o hero (placa e campo do nome) aparece, para nunca ficar
       em cima do campo "Nome do seu negócio" (o primeiro toque de quem chega do anúncio); depois, some
       quando um botão principal está na faixa de baixo da tela. O cabeçalho já tem "Chamar no WhatsApp". */
    var zap = $('.zap-flutuante');
    if (zap && !zap.hidden) {
      var ctas = $$('[data-cta]'), agendado = false, heroiNaTela = true;
      var conferir = function () {
        agendado = false;
        var vh = W.innerHeight, zr = zap.getBoundingClientRect(), cobre = false;
        ctas.forEach(function (c) { var r = c.getBoundingClientRect(); if (r.width && r.bottom > zr.top - 12 && r.top < zr.bottom + 12 && r.right > zr.left - 12) cobre = true; });
        zap.classList.toggle('zap-recolhido', cobre || vh < 420);
        D.body.classList.toggle('heroi-na-tela', heroiNaTela);
      };
      var agendar = function () { if (!agendado) { agendado = true; requestAnimationFrame(conferir); } };
      var porta = $('#porta');
      if (porta && 'IntersectionObserver' in W) {
        new IntersectionObserver(function (ents) { heroiNaTela = ents.some(function (e) { return e.isIntersecting; }); agendar(); }, { threshold: 0 }).observe(porta);
      } else heroiNaTela = false;
      D.body.classList.add('heroi-na-tela');
      W.addEventListener('scroll', agendar, { passive: true }); W.addEventListener('resize', agendar); agendar();
    }
  }

  /* ======================================================================
     FORMULÁRIO DO PEDIDO (usado em /abrir/ e em /obrigado/ sem dados)
     ====================================================================== */
  // De 30 em 30 minutos, das 00:00 às 23:30; um valor fora da grade (ex.: 08:45 do preset) entra na ordem.
  function preencherHoras(sel, valor) {
    var lista = [];
    for (var m = 0; m < 24 * 60; m += 30) lista.push(hhmm(m));
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(valor || '') && lista.indexOf(valor) === -1) { lista.push(valor); lista.sort(); }
    sel.textContent = '';
    lista.forEach(function (v) { sel.appendChild(el('option', { value: v }, v)); });
    sel.value = lista.indexOf(valor) !== -1 ? valor : '09:00';
  }
  function definirHora(sel, valor) {
    if (sel.tagName === 'SELECT' && !Array.prototype.some.call(sel.options, function (o) { return o.value === valor; })) preencherHoras(sel, valor);
    else sel.value = valor;
  }
  function montarHorarios(caixa, semana) {
    caixa.textContent = '';
    DIAS_PEDIDO.forEach(function (d) {
      var idx = DIA_IDX[d], h = semana[String(idx)], linha = el('div', { class: 'dia', 'data-dia': d });
      var id = 'h-' + d;
      var cab = el('div', { class: 'dia-cab' });
      cab.appendChild(el('span', { class: 'dia-nome', id: id + '-nome' }, DIA_NOME[idx]));
      var rot = el('label', { class: 'dia-aberto' });
      var ck = el('input', { type: 'checkbox', id: id + '-aberto', 'aria-label': DIA_NOME[idx] + ', aberto' });   // o leitor diz o dia, não só "Aberto"
      ck.checked = !!h; rot.appendChild(ck); rot.appendChild(el('span', null, 'Aberto'));
      cab.appendChild(rot); linha.appendChild(cab);
      var horas = el('div', { class: 'dia-horas' });
      // Lista de horários HH:MM em 24 h (PG-13): o input type=time mostrava "09:00 AM" conforme o aparelho.
      [['abre', 'Abre'], ['fecha', 'Fecha']].forEach(function (par) {
        var l = el('label', { class: 'dia-hora' }); l.appendChild(el('span', null, par[1]));
        var sel = el('select', { id: id + '-' + par[0], 'aria-label': DIA_NOME[idx] + ', ' + par[1].toLowerCase() });
        preencherHoras(sel, h ? h[par[0]] : (par[0] === 'abre' ? '09:00' : '18:00'));
        l.appendChild(sel); horas.appendChild(l);
      });
      linha.appendChild(horas);
      var sync = function () { horas.hidden = !ck.checked; linha.classList.toggle('fechado', !ck.checked); };
      ck.addEventListener('change', sync); sync();
      caixa.appendChild(linha);
    });
  }
  function lerHorarios(caixa) {
    var partes = [], erros = [], algum = false;
    DIAS_PEDIDO.forEach(function (d) {
      var l = caixa.querySelector('[data-dia="' + d + '"]'), ck = l.querySelector('input[type=checkbox]');
      if (!ck.checked) { partes.push(d + '=fechado'); return; }
      algum = true;
      var a = l.querySelector('[id$="-abre"]').value, f = l.querySelector('[id$="-fecha"]').value;
      if (!/^\d{2}:\d{2}$/.test(a) || !/^\d{2}:\d{2}$/.test(f) || minutos(f) <= minutos(a)) erros.push(DIA_NOME[DIA_IDX[d]]);
      partes.push(d + '=' + a + '-' + f);
    });
    if (!algum) return { erro: 'Marque pelo menos um dia aberto.' };
    if (erros.length) return { erro: 'Em ' + erros[0] + ', o horário de fechar está antes do de abrir. Ajuste para seguir.' };
    return { valor: partes.join(';') };
  }
  function preencherHorarios(caixa, texto) {
    if (!texto) return;
    texto.split(';').forEach(function (par) {
      var m = /^(\w{3})=(fechado|(\d{2}:\d{2})-(\d{2}:\d{2}))$/.exec(par); if (!m) return;
      var l = caixa.querySelector('[data-dia="' + m[1] + '"]'); if (!l) return;
      var ck = l.querySelector('input[type=checkbox]'); ck.checked = m[2] !== 'fechado';
      if (m[3]) { definirHora(l.querySelector('[id$="-abre"]'), m[3]); definirHora(l.querySelector('[id$="-fecha"]'), m[4]); }
      ck.dispatchEvent(new Event('change'));
    });
  }
  function marcar(input, msg) {
    var cx = input.closest('.campo'), er = cx && cx.querySelector('.erro');
    if (!cx || !er) return !msg;
    if (msg) { cx.setAttribute('data-estado', 'erro'); er.textContent = msg; er.hidden = false; input.setAttribute('aria-invalid', 'true'); }
    else { cx.removeAttribute('data-estado'); er.hidden = true; input.removeAttribute('aria-invalid'); }
    return !msg;
  }
  // Lê e valida o formulário; devolve {ok, dados, faltam}.
  function lerFormPedido(f, estadoBase) {
    var v = function (id) { var e = f.querySelector('#' + id); return e ? e.value : ''; };
    var faltam = 0, dados = {};
    var conferir = function (id, msg) { var e = f.querySelector('#' + id); if (!e || e.closest('[hidden]')) return true; var ok = marcar(e, msg); if (!ok) faltam++; return ok; };
    var negocio = estadoBase.n || limparNome(v('p-negocio'));
    if (!estadoBase.n) conferir('p-negocio', !negocio ? 'Digite o nome do seu negócio.' : !nomeValido(negocio) ? 'Use até 40 letras: letras, números, espaço e & . - \'' : '');
    var nicho = estadoBase.k || v('p-nicho');
    if (!estadoBase.k) conferir('p-nicho', NICHOS.indexOf(nicho) === -1 ? 'Escolha o tipo do seu negócio para montar o site certo.' : '');
    var cidade = estadoBase.c || limparNome(v('p-cidade'));
    if (!estadoBase.c) conferir('p-cidade', !cidade ? 'Escreva a cidade do negócio.' : !cidadeValida(cidade) ? 'Use só letras, espaço e estes sinais: . - \'' : '');
    var plano = estadoBase.plano || v('p-plano');
    // /obrigado/ sem dados: o plano começa em "Escolha o plano" e é obrigatório (PV-N1)
    if (!estadoBase.plano) conferir('p-plano', PLANOS.indexOf(plano) === -1 ? 'Escolha o plano que você pagou.' : '');
    var resp = limparNome(v('p-responsavel'));
    conferir('p-responsavel', resp.length < 2 || resp.length > 60 || !RE_RESP.test(resp) ? 'Escreva o seu nome para a equipe saber com quem falar.' : '');
    var zapBruto = v('p-whatsapp'), zap = normalizarWhats(zapBruto);
    conferir('p-whatsapp', !soDigitos(zapBruto) ? 'Digite o WhatsApp que recebe os pedidos, com DDD.' : !zap ? 'Esse número não parece um celular com DDD. Confira e digite de novo, por exemplo (11) 9XXXX-XXXX.' : '');
    var end = limparNome(v('p-endereco'));
    // mesma regra da produção (assets/endereco.js): endereço aceito aqui nunca trava depois do pagamento
    var END = window.CreatEndereco;
    conferir('p-endereco', end.length < 8 || end.length > 160 ? 'Escreva o endereço completo: Rua, número, bairro, cidade-UF, CEP.'
      : END ? END.mensagem(end, cidade) : (!/\d/.test(end) ? 'Escreva o endereço completo: Rua, número, bairro, cidade-UF, CEP.' : ''));
    var hCaixa = f.querySelector('#p-horarios'), h = lerHorarios(hCaixa), hErro = f.querySelector('#p-horarios-erro');
    if (h.erro) { hErro.textContent = h.erro; hErro.hidden = false; faltam++; } else hErro.hidden = true;
    var email = String(v('p-email')).trim();
    conferir('p-email', email.length > 120 || !RE_EMAIL.test(email) ? 'Esse e-mail não parece completo. Confira se tem @ e o final, como .com ou .com.br.' : '');
    var aceite = f.querySelector('#p-aceite'), aErro = f.querySelector('#p-aceite-erro');
    if (!aceite.checked) { aErro.hidden = false; faltam++; } else aErro.hidden = true;
    dados = { plano: plano, nicho: nicho, negocio: negocio, cidade: cidade, responsavel: resp, whatsapp_negocio: zap, endereco: end, horarios: h.valor, email: email };
    return { ok: faltam === 0, faltam: faltam, dados: dados };
  }
  function resumoErros(f, n) {
    var r = f.querySelector('#p-resumo');
    if (!n) { r.hidden = true; return; }
    r.textContent = n === 1 ? 'Falta 1 campo. Ele está marcado em vermelho.' : 'Faltam ' + n + ' campos. Eles estão marcados em vermelho.';
    r.hidden = false;
    var inv = f.querySelector('[aria-invalid="true"]') || (f.querySelector('#p-aceite-erro:not([hidden])') && f.querySelector('#p-aceite'));
    if (inv) inv.focus();
  }
  function prepararFormPedido(f, estadoBase, salvo) {
    $$('[data-se-falta]', f).forEach(function (x) { x.hidden = !!estadoBase[x.getAttribute('data-se-falta')]; });
    ligarMascara(f.querySelector('#p-whatsapp'));
    var hCaixa = f.querySelector('#p-horarios');
    montarHorarios(hCaixa, SEMANA_RESERVA);
    var nicho = estadoBase.k || (salvo && salvo.nicho);
    var aplicarNicho = function (k) { lerNicho(k).then(function (pre) { if (pre) { montarHorarios(hCaixa, semanaDe(pre)); if (salvo && salvo.horarios && salvo.nicho === k) preencherHorarios(hCaixa, salvo.horarios); } }); };
    if (nicho) aplicarNicho(nicho);
    var sel = f.querySelector('#p-nicho'); if (sel) sel.addEventListener('change', function () { if (NICHOS.indexOf(sel.value) !== -1) aplicarNicho(sel.value); });
    if (salvo) {
      var pre = { 'p-responsavel': salvo.responsavel, 'p-endereco': salvo.endereco, 'p-email': salvo.email, 'p-whatsapp': salvo.whatsapp_negocio ? mascaraBR(salvo.whatsapp_negocio.slice(2)) : '', 'p-negocio': salvo.negocio, 'p-cidade': salvo.cidade };
      Object.keys(pre).forEach(function (id) { var e = f.querySelector('#' + id); if (e && pre[id] && !e.value) e.value = pre[id]; });
      if (salvo.horarios) preencherHorarios(hCaixa, salvo.horarios);
    }
    $$('input,select', f).forEach(function (e) { e.addEventListener('input', function () { if (e.getAttribute('aria-invalid')) marcar(e, ''); }); });
  }

  /* creat:pedido:v1 (contrato f, docs/PEDIDO-API.md). Completo: as chaves do PEDIDO v1 mais segredo, produto, valor,
     praca, link (o de pagamento, público), paleta, salvo_em e status ('enviado' no clique; 'registrado' quando o
     servidor confirma). Enxuto (PV-16): assim que consultarPedido responde, ou 7 dias depois, saem responsável,
     WhatsApp, endereço, horários e e-mail; ficam id, segredo, negócio, nicho, plano, cidade, produto, valor, praca,
     origem e status, por até 30 dias, para /obrigado/ e o rascunho (aprovarRascunho) acharem o pedido. */
  var CHAVE_PEDIDO = 'creat:pedido:v1';
  var PESSOAIS = ['responsavel', 'whatsapp_negocio', 'endereco', 'horarios', 'email', 'previa', 'aceite_termos'];
  // compra: { produto, valor, praca, link } do botão clicado (ou da volta do pagamento).
  function salvarPedido(d, estadoBase, reaproveitar, compra) {
    var agora = new Date(); compra = compra || {};
    var registro = {
      id: null, segredo: null, plano: d.plano, nicho: d.nicho, negocio: d.negocio, cidade: d.cidade,
      responsavel: d.responsavel, whatsapp_negocio: d.whatsapp_negocio, endereco: d.endereco, horarios: d.horarios, email: d.email,
      origem: origemTexto(estadoBase.utm), previa: enderecoPublico() + 'previa/#' + montarFragmento({ k: d.nicho, n: d.negocio, c: d.cidade, p: estadoBase.p || 1 }, false),
      aceite_termos: isoComFuso(agora) + ' ' + ((CK && CK.termosVersao) || 'termos-v2'),
      produto: CATALOGO[compra.produto] ? compra.produto : null, valor: CATALOGO[compra.produto] ? CATALOGO[compra.produto] : null,
      praca: PRACAS.indexOf(compra.praca) !== -1 ? compra.praca : null,
      link: compra.link && CK && CK.linkValido(compra.link) ? compra.link : null,
      paleta: estadoBase.p || 1, salvo_em: agora.toISOString(), status: 'enviado'
    };
    // Mesmo aparelho e os mesmos dados: o mesmo pedido (o servidor só cria; repetir é inofensivo). Dado mudou: pedido novo,
    // porque o servidor nunca sobrescreve um id que já existe.
    var mesmo = reaproveitar && reaproveitar.segredo && RE_ID.test(reaproveitar.id) && !reaproveitar.enxuto &&
      JSON.stringify(corpoRegistro(Object.assign({}, registro, { id: reaproveitar.id, segredo: reaproveitar.segredo }))) === JSON.stringify(corpoRegistro(reaproveitar));
    registro.id = mesmo ? reaproveitar.id : novoId();
    registro.segredo = mesmo ? reaproveitar.segredo : novoSegredo();
    if (mesmo && reaproveitar.status === 'registrado') registro.status = 'registrado';
    var ok = guarda.gravar(CHAVE_PEDIDO, JSON.stringify(registro));
    return { registro: registro, gravou: ok };
  }
  // Corpo exato de registrarPedido ($defs/PedidoRegistro). hp: o campo isca do formulário.
  function corpoRegistro(p, hp) {
    var u = origemParaUtm(p.origem);
    var c = {
      id: p.id, segredo: p.segredo, produto: p.produto, valor: p.valor, praca: PRACAS.indexOf(p.praca) !== -1 ? p.praca : null,
      plano: PLANOS.indexOf(p.plano) !== -1 ? p.plano : null, nicho: p.nicho, negocio: p.negocio, cidade: p.cidade,
      whatsapp: p.whatsapp_negocio, email: p.email,
      utm_source: u.utm_source || null, utm_campaign: u.utm_campaign || null, utm_content: u.utm_content || null,
      termos_versao: (CK && CK.termosVersao) || 'termos-v2', consentimento_dados: true, hp: typeof hp === 'string' ? hp : '', teste: false
    };
    ['responsavel', 'endereco', 'horarios'].forEach(function (k) { if (p[k]) c[k] = p[k]; });
    return c;
  }
  function registravel(p) { return !!(p && !p.enxuto && RE_ID.test(p.id) && RE_SEGREDO.test(p.segredo || '') && CATALOGO[p.produto] === p.valor); }
  function enxugar(p, status) {
    var e = {};
    Object.keys(p).forEach(function (k) { if (PESSOAIS.indexOf(k) === -1) e[k] = p[k]; });
    e.enxuto = true; e.status = status || 'registrado'; e.registrado_em = e.registrado_em || new Date().toISOString();
    guarda.gravar(CHAVE_PEDIDO, JSON.stringify(e));
    return e;
  }
  function gravarPedido(p) { guarda.gravar(CHAVE_PEDIDO, JSON.stringify(p)); return p; }
  function lerPedidoSalvo() {
    var p = lerJSONGuardado(CHAVE_PEDIDO);
    if (!p || typeof p !== 'object') return null;
    var t0 = Date.parse(p.salvo_em), idade = Date.now() - t0;
    var novo = RE_ID.test(p.id) && RE_SEGREDO.test(p.segredo || '');
    if (isNaN(t0) || idade < -FOLGA || idade > D30 || (idade > D7 && !novo)) { guarda.apagar(CHAVE_PEDIDO); return null; }
    if (!(novo || RE_ID_ANTIGO.test(p.id)) || PLANOS.indexOf(p.plano) === -1 || NICHOS.indexOf(p.nicho) === -1 || typeof p.negocio !== 'string' || !p.negocio) return null;
    // o link de pagamento guardado volta a passar pela lista de provedores (nunca javascript: nem destino falso)
    if (p.link !== undefined && p.link !== null && !(CK && CK.linkValido && CK.linkValido(p.link))) p.link = null;
    if (p.enxuto) return novo ? p : null;
    if (idade > D7) return enxugar(p, p.status === 'registrado' ? 'registrado' : 'vencido');   // dado pessoal nunca passa de 7 dias no aparelho
    var obrig = ['cidade', 'responsavel', 'whatsapp_negocio', 'endereco', 'horarios', 'email', 'origem', 'previa', 'aceite_termos'];
    for (var i = 0; i < obrig.length; i++) if (typeof p[obrig[i]] !== 'string' || !p[obrig[i]]) return null;
    return p;
  }

  /* ======================================================================
     /abrir/
     ====================================================================== */
  var CHAVE_ABRIR = 'creat:abrir:negocio';   // nome e cidade saem do endereço; a recarga lê daqui (só esta aba)
  function lerSessao(k) { try { var v = sessionStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function gravarSessao(k, o) { try { sessionStorage.setItem(k, JSON.stringify(o)); } catch (e) {} }
  function paginaAbrir() {
    var est = ENTRADA.frag;
    if (est.n) gravarSessao(CHAVE_ABRIR, { n: est.n, c: est.c, k: est.k });
    else {
      var ses = lerSessao(CHAVE_ABRIR);
      if (ses && typeof ses.n === 'string') {
        var n0 = limparNome(ses.n), c0 = limparNome(ses.c || '');
        if (nomeValido(n0)) est.n = n0;
        if (c0 && cidadeValida(c0)) est.c = c0;
        if (!est.k && NICHOS.indexOf(ses.k) !== -1) est.k = ses.k;
      }
    }
    var salvo = lerPedidoSalvo();
    if (!est.plano) est.plano = 'aberto'; /* o anúncio promete o plano a partir do Aberto: a página abre no mesmo plano */
    utmAtual = est.utm;
    if (!Object.keys(utmAtual).length) utmAtual = lerOrigem() || (salvo ? origemParaUtm(salvo.origem) : {});
    est.utm = utmAtual;
    var f = $('#form-pedido');
    // sem artigo fixo (PG-N4): "abrir a Studio Teste" e "abrir a Salão Teste" quebravam
    $('#abrir-titulo').textContent = est.n ? 'Falta pouco para abrir ' + est.n + '.' : 'Falta pouco para abrir o seu negócio.';
    contar('ida_pagamento', est.k);
    var teste = ENTRADA.teste ? montarModoTeste() : null;
    var resumo = $('#abrir-negocio');
    if (est.n && est.k) {
      resumo.hidden = false;
      $('#abrir-negocio-nome').textContent = est.n;
      $('#abrir-negocio-detalhe').textContent = ROTULO_NICHO[est.k] + (est.c ? ' · ' + est.c : '');
      $('#abrir-voltar').href = RAIZ + '#' + montarFragmento(est, false) + '&ver=1';   // a home lê, preenche, limpa o endereço e abre a prévia
      var prog = $('#abrir-progresso'); if (prog) prog.hidden = false;      // veio da prévia: nome, nicho e prévia prontos
    }
    var radios = $$('input[name="plano"]', f);
    radios.forEach(function (r) { r.checked = r.value === est.plano; });
    prepararFormPedido(f, est, salvo && (!est.n || salvo.negocio === est.n) ? salvo : null);
    var precos = null, escolha = null;
    var botoes = $$('[data-checkout]');
    var barra = $('#barra-pagar');

    // Link e total andam juntos: o total da tela é sempre o valor do link escolhido (checkout.config.js
    // escolherAbertura). Hoje se paga só a Abertura, em qualquer plano; o anual é cobrado com o site no ar (D3).
    function escolher() {
      var anual = /_anual$/.test(est.plano);
      var origem = lerOrigem() || utmAtual || {};
      var r = CK && CK.escolherAbertura ? CK.escolherAbertura({ inauguracao: !!precos.inauguracao, praca: origem.utm_campaign }) : null;
      var total = r && num(r.valor) && r.valor > 0 ? r.valor : precos.aberturaAtual;   // sem link válido: o pedido fecha pelo WhatsApp
      return { r: r, anual: anual, total: total };
    }
    function atualizarTotal() {
      if (!precos) return;
      escolha = escolher();
      var anual = escolha.anual;
      $('#total-mensal').hidden = anual; $('#total-anual').hidden = !anual;
      $('#resumo-mensal').hidden = anual; $('#resumo-anual').hidden = !anual;
      // A Abertura mostrada é a do link: "preço de inauguração" só aparece se o link escolhido for de inauguração.
      var deInaug = !!(escolha.r ? escolha.r.chave === 'aberturaInauguracao' : precos.inauguracao);
      var naTela = {}; for (var k in precos) naTela[k] = precos[k];
      naTela.aberturaAtual = escolha.total; if (!deInaug) naTela.inauguracao = null;
      aplicarPrecos(naTela, D, est.plano);
      $$('[data-v="abrir.total"]').forEach(function (x) { x.textContent = milhar(escolha.total); x.classList.remove('num-carregando'); });
      $('#anual-nota').hidden = !anual;
      if (teste) { teste.aplicar(botoes, barra); return; }
      var algumOk = false;
      botoes.forEach(function (b) { if (aplicarCheckout(b, escolha.r ? escolha.r.chave : precos.linkChave, escolha.r ? escolha.r.link : null, abaNova())) algumOk = true; });
      $('#pagamento-config').hidden = algumOk;
      if (barra) barra.hidden = !algumOk;
      var zapCfg = $('#pagamento-zap');
      if (!algumOk && zapCfg) {
        var msg = 'Olá! Quero fechar o plano ' + est.plano.replace('_', ' ') + ' do Porta Aberta, mas o link de pagamento ainda não estava liberado na página.';
        if (suporteOk()) { zapCfg.href = linkWhats(CK.whatsappSuporte, msg); zapCfg.target = '_blank'; zapCfg.rel = 'noopener noreferrer'; }
        else { zapCfg.href = linkEmail('Fechar o plano do Porta Aberta', msg); zapCfg.textContent = 'Falar com o suporte por e-mail'; }
      }
    }
    radios.forEach(function (r) {
      r.addEventListener('change', function () {
        est.plano = r.value; somFn('clique');
        // o fragmento guarda só plano, nicho, paleta e utm: nome e cidade nunca voltam para o endereço
        try { history.replaceState(null, '', location.pathname + location.search + '#' + montarFragmento(semDadosPessoais(est), true)); } catch (e) {}
        atualizarTotal(); evento('plano_visto', { plano: est.plano, nicho: est.k || undefined });
      });
    });
    lerPrecos().then(function (pr) { precos = pr; atualizarTotal(); });
    // O que o botão cobra: produto e valor do catálogo do servidor (o mesmo valor do link e da tela).
    function compraAtual(b) {
      if (teste) return teste.compra();
      var chave = b.getAttribute('data-checkout'), produto = PRODUTO_DA_CHAVE[chave] || null;
      var praca = escolha && escolha.r && escolha.r.praca ? escolha.r.praca : null;
      if (!praca) { var o = lerOrigem() || utmAtual || {}; if (PRACAS.indexOf(o.utm_campaign) !== -1) praca = o.utm_campaign; }
      return { produto: produto, valor: produto ? CATALOGO[produto] : null, praca: praca, link: b.getAttribute('href') };
    }
    var checkoutContado = false;
    // Antes de sair para o pagamento: formulário válido, aceite marcado, pedido guardado e enviado ao servidor.
    // Vale para o clique, o clique do meio e o toque longo ("abrir em nova aba"): nenhum caminho pula o aceite.
    function prepararIda(e, b) {
      if (b.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return null; }
      if (b.getAttribute('data-link-ok') !== '1') return null;   // sem link de pagamento: o botão leva ao WhatsApp do suporte
      var r = lerFormPedido(f, est);
      if (!r.ok) { e.preventDefault(); resumoErros(f, r.faltam); return null; }
      resumoErros(f, 0);
      var s = salvarPedido(r.dados, est, lerPedidoSalvo(), compraAtual(b));
      if (!s.gravou) aviso('Este navegador não deixa guardar dados no aparelho, por isso a próxima página vai pedir os campos de novo. O pedido funciona do mesmo jeito.');
      /* PG-05: o pedido vai ao servidor AGORA, sem esperar resposta e sem segurar a ida ao Mercado Pago (fetch com
         keepalive sobrevive à troca de página). Se a função falhar, /obrigado/ registra de novo com os dados do aparelho.
         O registro é idempotente pelo id (docs/PEDIDO-API.md): repetir no toque longo e depois no clique não duplica. */
      if (registravel(s.registro)) enviarSolto('registrarPedido', corpoRegistro(s.registro, hpValor()));
      return r;
    }
    botoes.forEach(function (b) {
      b.addEventListener('contextmenu', function (e) { prepararIda(e, b); });
      b.addEventListener('auxclick', function (e) { if (e.button === 1) prepararIda(e, b); });
      b.addEventListener('click', function (e) {
        var r = prepararIda(e, b); if (!r) return;
        evento('checkout_iniciado', { plano: r.dados.plano, nicho: r.dados.nicho });
        // um por carga da página: clique duplo ou voltar do Mercado Pago e clicar de novo na mesma carga não duplica
        if (!teste && escolha && !checkoutContado) { checkoutContado = true; pixelEvento('InitiateCheckout', { value: escolha.total, currency: 'BRL' }); }
        if (!teste) contar('clique_pagar', r.dados.nicho);
        // Desktop: o pagamento abriu em outra aba (target=_blank); esta aba vai para /obrigado/ esperando o pagamento.
        if (b.getAttribute('target') === '_blank' && !e.defaultPrevented) setTimeout(function () { location.assign(RAIZ + 'obrigado/?espera=1'); }, 80);
      });
    });
    function hpValor() { var h = f.querySelector('#p-site'); return h ? String(h.value || '') : ''; }
    f.addEventListener('submit', function (e) { e.preventDefault(); });
    lerTextosAbrir();
    montarBarraPagar(barra, $('#pagamento'));
    var esquecer = $('#esquecer');
    if (esquecer) {
      esquecer.hidden = !salvo;
      esquecer.addEventListener('click', function () {
        esquecerTudo(); esquecer.hidden = true; aviso('Pronto. Tudo o que este site guardou neste aparelho foi apagado.');
        setTimeout(function () { location.reload(); }, 900);
      });
    }
    evento('plano_visto', { plano: est.plano, nicho: est.k || undefined });
  }
  // Botão de pagar fixo no rodapé (celular e tablet): sai da frente quando a seção Pagamento está na tela
  // ou quando o teclado está aberto num campo, para nunca cobrir o que a pessoa está digitando.
  function montarBarraPagar(barra, secao) {
    if (!barra) return;
    var naTela = false, digitando = false;
    var campo = function (t) { return !!(t && t.matches && t.matches('input:not([type=checkbox]):not([type=radio]),select,textarea')); };
    var aplicar = function () {
      barra.classList.toggle('recolhida', naTela || digitando); D.body.classList.toggle('com-barra-pagar', !barra.hidden);
      try { W.dispatchEvent(new CustomEvent('creat:barra-pagar')); } catch (e) {}
    };
    if (secao && 'IntersectionObserver' in W) new IntersectionObserver(function (ents) { naTela = ents.some(function (x) { return x.isIntersecting; }); aplicar(); }, { threshold: 0.2 }).observe(secao);
    D.addEventListener('focusin', function (e) { digitando = campo(e.target); aplicar(); });
    D.addEventListener('focusout', function () { setTimeout(function () { digitando = campo(D.activeElement); aplicar(); }, 0); });
    if ('MutationObserver' in W) new MutationObserver(aplicar).observe(barra, { attributes: true, attributeFilter: ['hidden'] });
    aplicar();
  }

  /* Link de teste (/abrir/?teste=pa-teste): um único botão "Pagar R$ 1 (teste)" com o link de checkout.config.js
     (teste), que registra o pedido como pa-teste de R$ 1. Fora de menu e de anúncio; a página já é noindex.
     Sem InitiateCheckout e sem contador. Vencido (valeAte), o botão fica desligado e diz isso. */
  function montarModoTeste() {
    var T = CK && CK.teste;
    var vale = !!(T && T.produto === 'pa-teste' && T.valor === 1 && CK.linkValido(T.link) && Date.parse(T.valeAte) > Date.now());
    var nota = $('#modo-teste'); if (nota) nota.hidden = false;
    var vt = $('#modo-teste-valor'); if (vt) vt.textContent = T && num(T.valor) ? milhar(T.valor) : '';
    var venc = $('#modo-teste-vencido'); if (venc) venc.hidden = vale;
    return {
      compra: function () { return { produto: 'pa-teste', valor: 1, praca: null, link: vale ? T.link : null }; },
      aplicar: function (botoes, barra) {
        var principal = $('.pagar [data-checkout]');
        botoes.forEach(function (b) {
          if (b !== principal) { b.hidden = true; b.setAttribute('aria-disabled', 'true'); b.setAttribute('data-link-ok', '0'); return; }
          b.setAttribute('data-checkout', 'teste'); b.setAttribute('data-rotulo', 'Pagar R$ 1 (teste)');
          if (vale) {
            b.setAttribute('href', T.link); b.setAttribute('data-link-ok', '1');
            b.removeAttribute('aria-disabled'); b.removeAttribute('tabindex');
            if (abaNova()) { b.setAttribute('target', '_blank'); b.setAttribute('rel', 'noopener noreferrer'); } else { b.removeAttribute('target'); b.removeAttribute('rel'); }
            b.textContent = 'Pagar R$ 1 (teste)';
          } else {
            b.removeAttribute('href'); b.removeAttribute('target'); b.setAttribute('data-link-ok', '0');
            b.setAttribute('aria-disabled', 'true'); b.setAttribute('tabindex', '-1');
            b.textContent = 'O link de teste venceu';
          }
        });
        if (barra) barra.hidden = true;
        var cfg = $('#pagamento-config'); if (cfg) cfg.hidden = true;
        $$('[data-v="abrir.total"]').forEach(function (x) { x.textContent = '1'; x.classList.remove('num-carregando'); });
      }
    };
  }

  /* Textos do conteudo/ lidos na hora (copywriter, pacote 2B). Chave que falta ou não é texto: vale o texto do HTML.
     preencher troca {x} e {{x}} pelos valores conhecidos; marcador sem valor some (nunca vai "{x}" para a tela). */
  function preencher(s, vars) {
    return String(s).replace(/\{\{\s*([\w.]+)\s*\}\}|\{([\w.]+)\}/g, function (m, a, b) { var k = a || b; return vars && vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''; }).replace(/\s{2,}/g, ' ').trim();
  }
  function textoDe(obj, caminho) {
    var v = obj; caminho.split('.').forEach(function (k) { v = v && typeof v === 'object' ? v[k] : undefined; });
    return typeof v === 'string' && v.trim() ? v : null;
  }
  // [data-texto="chave.do.json"] recebe o texto do conteudo/ (com {{precos.*}} preenchido); sem a chave, fica o do HTML.
  function aplicarTextos(j, vars) {
    $$('[data-texto]').forEach(function (e) {
      var s = textoDe(j, e.getAttribute('data-texto')); if (!s) return;
      // marcador sem valor conhecido: fica o texto do HTML (nunca "Prazo:  h")
      var falta = (s.match(/\{\{\s*[\w.]+\s*\}\}|\{[\w.]+\}/g) || []).some(function (m) { var k = m.replace(/[{}\s]/g, ''); return !vars || vars[k] === undefined || vars[k] === null || vars[k] === ''; });
      if (!falta) e.textContent = preencher(s, vars);
    });
  }
  // A versão dos termos escrita no aceite é a mesma que vai no registro (checkout.config.js termosVersao).
  function montarTermosVersao() {
    var m = /^termos-v(\d{1,3})$/.exec((CK && CK.termosVersao) || '');
    if (m) $$('[data-termos-versao]').forEach(function (x) { x.textContent = m[1]; });
  }
  function lerTextosAbrir() {
    Promise.all([buscarJSON('conteudo/abrir.json'), lerPrecos()]).then(function (r) {
      var j = r[0], vars = valoresDe(r[1]); if (!j) return;
      aplicarTextos(j, vars);
      var trocar = function (sel, chave) { var e = $(sel), s = textoDe(j, chave); if (e && s) { e.textContent = preencher(s, vars); e.hidden = false; } };
      trocar('#pagar-parcelas', 'pagar.parcelas');
      trocar('#pagar-recebedor', 'pagar.recebedor');
      var av = $('#pagar-aviso-texto'), s = textoDe(j, 'pagar.aviso_dados');
      if (av && s) av.textContent = preencher(s, vars) + ' ';
      var lk = $('#pagar-aviso-link'), sl = textoDe(j, 'pagar.linkPrivacidade'); if (lk && sl) lk.textContent = sl;
      var bt = textoDe(j, 'pagar.botaoTeste');
      if (bt && ENTRADA.teste) { var pb = $('.pagar [data-checkout]'); if (pb && pb.getAttribute('data-link-ok') === '1') { pb.textContent = bt; pb.setAttribute('data-rotulo', bt); } }
    });
  }

  /* ======================================================================
     /obrigado/
     ====================================================================== */
  var CHAVES_PEDIDO_V1 = ['id', 'plano', 'nicho', 'negocio', 'cidade', 'responsavel', 'whatsapp_negocio', 'endereco', 'horarios', 'email', 'origem', 'previa', 'aceite_termos'];
  /* PEDIDO v1 (contrato g). pg (opcional): as linhas do pagamento depois de aceite_termos (PG-N2), cada uma só com
     valor conhecido: pagamento (aprovado|pendente|recusado|sem_retorno), mp_pagamento (número válido), produto, valor. */
  function textoPedido(p, pg) {
    var linha = function (k, v) { return k + ': ' + String(v).replace(/[\r\n]+/g, ' ').trim(); };
    var l = ['PEDIDO v1'].concat(CHAVES_PEDIDO_V1.map(function (k) { return linha(k, p[k]); }));
    if (pg) {
      if (/^(aprovado|pendente|recusado|sem_retorno)$/.test(pg.pagamento || '')) l.push(linha('pagamento', pg.pagamento));
      if (RE_PAGAMENTO.test(pg.paymentId || '')) l.push(linha('mp_pagamento', pg.paymentId));
      if (/^pa-[a-z0-9-]{1,40}$/.test(pg.produto || '')) l.push(linha('produto', pg.produto));
      if (num(pg.valor) && pg.valor > 0) l.push(linha('valor', pg.valor));
    }
    return l.join('\n');
  }
  // Mensagem do WhatsApp: uma frase de gente na primeira linha (PV-15), linha em branco e o PEDIDO v1.
  var ABRE_MENSAGEM = {
    aprovado: 'Oi! Acabei de pagar a Abertura do Porta Aberta. Segue o meu pedido:',
    confirmado: 'Oi! Acabei de pagar a Abertura do Porta Aberta. Segue o meu pedido:',
    pendente: 'Oi! Gerei o Pix da Abertura do Porta Aberta. Segue o meu pedido:'
  };
  function mensagemPedido(p, estado, pg, abertura) {
    var abre = (typeof abertura === 'string' && abertura.trim() && estado !== 'pendente' ? abertura.trim() : '') || ABRE_MENSAGEM[estado] || 'Oi! Segue o meu pedido do Porta Aberta:';
    if (p.enxuto) {
      // o servidor já tem os dados: a mensagem leva só o número do pedido e o do pagamento
      return abre.replace(/ Segue o meu pedido:$/, '') + ' Meu pedido é ' + p.id + (pg && RE_PAGAMENTO.test(pg.paymentId || '') ? ', pagamento nº ' + pg.paymentId : '') + '.';
    }
    return abre + '\n\n' + textoPedido(p, pg);
  }

  /* Textos de reserva de /obrigado/. As chaves são as de conteudo/obrigado.json (copywriter, pacote 2B):
     estados.<chave>.{titulo,texto,botao}; o que faltar lá vale daqui. Regra do 2B: "aprovado" só com o SERVIDOR
     confirmando; com a URL dizendo aprovado e o servidor ainda sem resposta, vale "a_conferir" (chaveTexto). */
  var ESTADOS_OBRIGADO = {
    a_conferir: { olho: 'Pagamento', titulo: 'Estamos conferindo o seu pagamento', texto: 'O Mercado Pago avisou o pagamento e a equipe está conferindo. Guarde o número do pagamento abaixo.', botao: 'Falar com o suporte no WhatsApp' },
    aprovado: { olho: 'Pagamento', titulo: 'Pagamento confirmado', texto: 'Recebemos o seu pagamento, e a equipe começa o seu site. Guarde o recibo abaixo. O link do site pronto chega {canais}.', botao: 'Falar com a equipe no WhatsApp' },
    conferencia_longa: { olho: 'Pagamento', titulo: 'Seu pagamento está em conferência', texto: 'Esta página parou de consultar para não gastar a sua internet. Guarde o número do pagamento e fale com o suporte: a equipe confere e responde no seu WhatsApp.', botao: 'Falar com o suporte no WhatsApp' },
    produto_fora: { olho: 'Pagamento', titulo: 'Pagamento recebido', texto: 'Recebemos um pagamento que esta página não reconhece. O suporte vai falar com você. Guarde o número do pagamento abaixo.', botao: 'Falar com o suporte no WhatsApp' },
    recusado: { olho: 'Pagamento', titulo: 'O pagamento não passou', texto: 'O banco ou o cartão recusou. Nada foi cobrado.', botao: 'Tentar de novo' },
    pendente: { olho: 'Pagamento', titulo: 'Seu Pix espera o pagamento', texto: 'Pague o Pix no app do seu banco, com o código que o Mercado Pago mostrou. Depois de pagar, a confirmação aparece nesta página, neste aparelho.', botao: 'Voltar para o pagamento' },
    sem_retorno: { olho: 'Pedido', titulo: 'Você ainda não pagou', texto: 'Esta página não recebeu a volta do Mercado Pago. Se você ainda não pagou, volte ao plano e pague por lá. Se já pagou, guarde o comprovante e fale com o suporte.', botao: 'Voltar para o pagamento' },
    aguardando: { olho: 'Pagamento', titulo: 'Termine o pagamento na outra aba', texto: 'Abrimos o Mercado Pago em outra aba. Quando o pagamento aprovar, esta página mostra a confirmação.', botao: 'Abrir o pagamento de novo' },
    assinatura_ok: { olho: 'Assinatura', titulo: 'Assinatura ativa', texto: 'O plano {plano} está ativo. A cobrança se renova todo mês no cartão. Para cancelar ou trocar o cartão, use o portal do assinante, sem multa.', semPlano: 'A assinatura está ativa. A cobrança se renova todo mês no cartão. Para cancelar ou trocar o cartão, use o portal do assinante, sem multa.', botao: 'Abrir o portal do assinante' },
    assinatura_cancelada: { olho: 'Assinatura', titulo: 'A assinatura não foi concluída', texto: 'Nada foi cobrado. Se quiser, tente de novo ou fale com a equipe.', botao: 'Falar com a equipe no WhatsApp' },
    anual_conferir: { olho: 'Plano anual', titulo: 'O Mercado Pago aprovou o plano anual', texto: 'O Mercado Pago aprovou o pagamento do plano {plano} anual. A equipe confere e fala com você no WhatsApp. Os 12 meses contam do dia em que o site entrou no ar.', semPlano: 'O Mercado Pago aprovou o pagamento do plano anual. A equipe confere e fala com você no WhatsApp. Os 12 meses contam do dia em que o site entrou no ar.', botao: 'Falar com a equipe no WhatsApp' },
    bastidores_conferir: { olho: 'Bastidores', titulo: 'O Mercado Pago aprovou o Bastidores', texto: 'O Mercado Pago aprovou a compra do Bastidores. A equipe confere e fala com você no WhatsApp para a entrega.', botao: 'Falar com a equipe no WhatsApp' },
    anual_pago: { olho: 'Plano anual', titulo: 'Plano anual pago', texto: 'Recebemos o pagamento do plano {plano} anual. Os 12 meses contam do dia em que o site entrou no ar, e não há outra cobrança nesse período.', semPlano: 'Recebemos o pagamento do plano anual. Os 12 meses contam do dia em que o site entrou no ar, e não há outra cobrança nesse período.', botao: 'Falar com a equipe no WhatsApp' },
    teste_ok: { olho: 'Teste', titulo: 'Teste concluído', texto: 'O pagamento de teste passou. Nada foi produzido e nenhum prazo começou.', botao: 'Voltar para a página inicial' },
    bastidores_pago: { olho: 'Bastidores', titulo: 'Bastidores comprado', texto: 'O Mercado Pago aprovou a compra do Bastidores. O suporte fala com você no WhatsApp para a entrega.', botao: 'Falar com o suporte no WhatsApp' }
  };
  // Mensagem pronta do "Chamar no WhatsApp" do cabeçalho (PG-08). Chave do 2B: obrigado.json wa.<chave>.
  var ZAP_OBRIGADO = {
    aprovado: 'Olá! Paguei a Abertura do Porta Aberta. Pedido {id}.',
    a_conferir: 'Olá! Paguei a Abertura do Porta Aberta e a página diz que o pagamento está em conferência. Pedido {id}.',
    recusado: 'Olá! Tentei pagar a Abertura do Porta Aberta e não consegui.',
    pendente: 'Olá! Gerei o Pix da Abertura do Porta Aberta e quero confirmar.',
    sem_retorno: 'Olá! Estou na página do pedido do Porta Aberta e tenho uma dúvida sobre o pagamento.',
    aguardando: 'Olá! Estou pagando a Abertura do Porta Aberta e tenho uma dúvida.',
    assinatura: 'Olá! Assinei o plano {plano} do Porta Aberta e tenho uma dúvida.',
    anual: 'Olá! Paguei o plano anual {plano} do Porta Aberta.',
    teste: 'Olá! Fiz o pagamento de teste de R$ 1 do Porta Aberta.',
    bastidores: 'Olá! Comprei o Bastidores do Porta Aberta.'
  };
  // Linha do estado do SERVIDOR (consultarPedido e confirmarPagamento), embaixo do texto do estado.
  var LINHAS_SERVIDOR = {
    conferindo: 'Conferindo no nosso sistema...',
    confirmando: 'Esta página confere sozinha com o Mercado Pago a cada poucos segundos.',
    registrado: 'Seu pedido está registrado. Quando o pagamento cair, esta página mostra a confirmação.',
    pago: 'O prazo de {prazo} h começou.',
    pago_depois: 'O pagamento foi confirmado fora do horário de atendimento. O prazo de {prazo} h começa às 11h do próximo dia de atendimento.',
    a_conferir: 'O nosso sistema recebeu o pagamento, e a equipe confere à mão.',
    depois_do_pagamento: 'Recebemos os dados do pedido. Como eles chegaram depois do pagamento, a equipe confere à mão.',
    ja_usado: 'Este pagamento já confirma outro pedido. Fale com o suporte.',
    recusado_servidor: 'O Mercado Pago não confirmou este pagamento. Fale com o suporte.',
    desistiu: 'Este pedido foi cancelado.',
    sem_servidor: 'Não conseguimos falar com o nosso sistema agora. Envie o pedido pelo WhatsApp abaixo; a equipe confere à mão.',
    nao_encontrado: 'Não achamos este pedido no nosso sistema. Fale com o suporte no WhatsApp abaixo: a mensagem já leva o número do pedido, e a equipe confere à mão.'
  };
  var NOME_PRODUTO = {
    'pa-abertura-inauguracao': 'Abertura do Porta Aberta, preço de inauguração', 'pa-abertura': 'Abertura do Porta Aberta',
    'pa-teste': 'Pagamento de teste', 'pa-anual-aberto': 'Plano Aberto anual', 'pa-anual-vitrine': 'Plano Vitrine anual',
    'pa-bastidores': 'Bastidores', 'pa-combo-aberto-anual': 'Abertura e plano Aberto anual', 'pa-combo-vitrine-anual': 'Abertura e plano Vitrine anual'
  };
  var MEIO_TEXTO = { pix: 'Pix', cartao: 'cartão', saldo: 'saldo do Mercado Pago' };
  var ROTULO_PLANO = { aberto: 'Aberto', vitrine: 'Vitrine', aberto_anual: 'Aberto anual', vitrine_anual: 'Vitrine anual' };
  var PAGOS = ['pago', 'em_revisao', 'em_producao', 'rascunho_enviado', 'aprovado', 'no_ar'];
  var ESPERA_SERVIDOR = ['aguardando_pagamento', 'a_conferir'];
  var CHAVE_VOLTA = 'creat:obrigado:volta';   // sessionStorage: a recarga da mesma aba mantém o estado da volta
  var TRINTA_MIN = 30 * 60 * 1000;
  function dataBahia(iso) {
    var t = Date.parse(iso); if (isNaN(t)) return '';
    try { return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Bahia', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t)); } catch (e) { return ''; }
  }
  function voltaGuardada() {
    var v = lerSessao(CHAVE_VOLTA);
    if (!v || typeof v !== 'object' || !/^(aprovado|recusado|pendente|sem_retorno)$/.test(v.pagamento)) return null;
    var limpo = lerVolta('');
    ['pagamento', 'paymentId', 'preferencia', 'meio', 'produto', 'praca', 'assinatura', 'plano', 'espera'].forEach(function (k) { if (v[k] !== undefined) limpo[k] = v[k]; });
    if (limpo.paymentId && !/^\d{1,24}$/.test(limpo.paymentId)) limpo.paymentId = null;
    if (limpo.produto && !/^pa-[a-z0-9-]{1,40}$/.test(limpo.produto)) limpo.produto = null;
    limpo.tem = true;
    return limpo;
  }

  function paginaObrigado() {
    var volta = ENTRADA.volta && ENTRADA.volta.tem ? ENTRADA.volta : (voltaGuardada() || ENTRADA.volta || lerVolta(''));
    if (ENTRADA.volta && ENTRADA.volta.tem) gravarSessao(CHAVE_VOLTA, ENTRADA.volta);
    var estado = estadoDaVolta(volta);
    var pedido = lerPedidoSalvo();
    var precos = null, textos = null, servidor = null, servidorFalhou = null, linhaAtual = null;
    var inicio = Date.now(), relogioTimer = 0, pedidoContado = false, depoisDoPagamento = false, esgotado = false, foraCatalogo = false;

    var main = $('main'), titulo = $('#obrigado-titulo'), lead = $('#obrigado-lead'), olho = $('#obrigado-olho');
    var botao = $('#obrigado-botao'), secundario = $('#obrigado-secundario'), linhaServ = $('#obrigado-servidor'), rascunho = $('#obrigado-rascunho');
    var recibo = $('#obrigado-recibo'), blocoPedido = $('#obrigado-pedido'), blocoWhats = $('#bloco-whats');
    var semDados = $('#obrigado-sem-dados'), esquecer = $('#esquecer'), zapTopo = $('header [data-zap]');
    var f = $('#form-pedido');

    var podeServidor = function () { return !!(API && pedido && RE_ID.test(pedido.id) && RE_SEGREDO.test(pedido.segredo || '')); };
    var familiaAprovado = function () { return estado === 'aprovado' || estado === 'confirmado'; };
    function produtoBase() {
      var p = volta.produto || (pedido && pedido.produto ? pedido.produto.replace(/-\d{4}-\d{2}$/, '') : null);
      return p && /^pa-[a-z0-9-]{1,40}$/.test(p) ? p : null;
    }
    // Plano e valor do texto de assinatura e do anual: os números saem de dados/precos.json (ou da reserva do checkout.config.js).
    function planoEValor() {
      var pr = precos || { planos: (CK && CK.precosPadrao && CK.precosPadrao.planos) || { aberto: 147, vitrine: 297 }, anualMesesPagos: (CK && CK.precosPadrao && CK.precosPadrao.anualMesesPagos) || 10 };
      if (estado === 'assinatura_ok') { var k = volta.plano; return k === 'aberto' || k === 'vitrine' ? { plano: ROTULO_PLANO[k], valor: milhar(pr.planos[k]) } : null; }
      if (estado === 'anual_pago') { var m = /^pa-anual-(aberto|vitrine)$/.exec(volta.produto || ''); return m ? { plano: ROTULO_PLANO[m[1]], valor: milhar(pr.planos[m[1]] * pr.anualMesesPagos) } : null; }
      return null;
    }
    function vars() {
      var v = precos ? valoresDe(precos) : {}, pv = planoEValor();
      v.negocio = pedido ? pedido.negocio : ''; v.prazo = precos ? milhar(precos.prazoHoras) : '72';
      v.numero = volta.paymentId || ''; v.pedido = pedido ? pedido.id : ''; v.id = pedido && RE_ID.test(pedido.id) ? pedido.id : '';
      v.canais = (textos && textoDe(textos, 'rascunho.canais')) || 'nesta página e no seu WhatsApp';
      if (pv) { v.plano = pv.plano; v.valor = pv.valor; }
      return v;
    }
    // Chave do texto (2B): a URL aprovada sem o servidor confirmar mostra "a_conferir"; o servidor confirmado, "aprovado".
    function chaveTexto() {
      if (estado === 'aprovado') return foraCatalogo ? 'produto_fora' : esgotado ? 'conferencia_longa' : 'a_conferir';
      if (estado === 'confirmado') return 'aprovado';
      // anual e Bastidores ainda não têm conferência no servidor: a página só repete o que o Mercado Pago disse
      if (estado === 'anual_pago') return 'anual_conferir';
      if (estado === 'bastidores_pago') return 'bastidores_conferir';
      return estado;
    }
    function texto(campo) {
      var k = chaveTexto(), base = ESTADOS_OBRIGADO[k], j = textos && textos.estados && textos.estados[k], v = vars();
      // assinatura e anual sem plano conhecido: nunca "Plano , R$ por mês"; vale a frase sem plano nem valor
      if (campo === 'texto' && base.semPlano && !planoEValor()) return base.semPlano;
      var s = j && typeof j[campo] === 'string' && j[campo].trim() ? j[campo] : base[campo];
      return preencher(s, v);
    }
    // Sem link do anual nesta página: no anual e no Bastidores recusado ou pendente, o botão leva ao suporte (PG-03).
    function produtoSemLink() { return /^pa-(anual-|bastidores|combo-)/.test(volta.produto || ''); }
    function hrefAbrir() {
      if (!pedido) return RAIZ + 'abrir/';
      var utm = origemParaUtm(pedido.origem);
      return RAIZ + 'abrir/#' + montarFragmento({ plano: pedido.plano, k: pedido.nicho, n: pedido.negocio, c: pedido.cidade, p: pedido.paleta || 1, utm: utm }, true);
    }
    function chaveZap() {
      var k = chaveTexto();
      return { aprovado: 'aprovado', a_conferir: 'a_conferir', conferencia_longa: 'a_conferir', produto_fora: 'a_conferir', assinatura_ok: 'assinatura', assinatura_cancelada: 'sem_retorno', anual_conferir: 'anual', teste_ok: 'teste', bastidores_conferir: 'bastidores' }[k] || k;
    }
    function msgZap() {
      var k = chaveZap(), pv = planoEValor(), v = vars();
      var j = textos && textos.wa && typeof textos.wa[k] === 'string' && textos.wa[k].trim() ? textos.wa[k] : ZAP_OBRIGADO[k];
      if ((k === 'assinatura' || k === 'anual') && !pv) j = k === 'assinatura' ? 'Olá! Assinei um plano do Porta Aberta e tenho uma dúvida.' : 'Olá! Paguei o plano anual do Porta Aberta.';
      // frase com {id} sem pedido neste aparelho sai inteira (nunca "Pedido .")
      if (!v.id) j = j.replace(/\s*[^.!?]*\{\{?\s*id\s*\}?\}[^.!?]*[.!?]/g, '');
      return preencher(j, v);
    }
    function linkZap(msg) { return suporteOk() ? linkWhats(CK.whatsappSuporte, msg) : linkEmail('Porta Aberta', msg); }
    function acao() {
      var suporte = { href: linkZap(msgZap()), fora: true };
      if (estado === 'assinatura_ok') return { href: PORTAL_ASSINANTE, fora: true };
      if (estado === 'teste_ok') return { href: RAIZ, fora: false };
      if (familiaAprovado() || /^(assinatura_cancelada|anual_pago|bastidores_pago)$/.test(estado)) return suporte;
      if ((estado === 'recusado' || estado === 'pendente') && produtoSemLink()) return { href: suporte.href, fora: true, rotulo: 'Falar com o suporte no WhatsApp' };
      if (estado === 'aguardando' && pedido && pedido.link && CK && CK.linkValido && CK.linkValido(pedido.link)) return { href: pedido.link, fora: true };
      return { href: hrefAbrir(), fora: false };
    }

    function linha(chave, extra) {
      if (chave === 'esgotou' || chave === 'fora_catalogo') {
        if (chave === 'esgotou') esgotado = true; else foraCatalogo = true;
        chave = null; desenhar();
      }
      linhaAtual = chave;
      if (!chave) { linhaServ.hidden = true; linhaServ.textContent = ''; return; }
      var s = preencher(LINHAS_SERVIDOR[chave], vars());
      if (/^(ja_usado|recusado_servidor|nao_encontrado)$/.test(chave) && volta.paymentId) s += ' Número do pagamento: ' + volta.paymentId + '.';
      if (extra) s += ' ' + extra;
      linhaServ.textContent = s; linhaServ.hidden = false;
      linhaServ.setAttribute('data-linha', chave);
    }
    function desenharRecibo() {
      var r = servidor && servidor.recibo && typeof servidor.recibo === 'object' ? servidor.recibo : null;
      var mostrar = familiaAprovado() || /^(anual_pago|teste_ok|bastidores_pago)$/.test(estado);
      var j = textos && textos.recibo, rot = function (k, reserva) { return (j && textoDe(j, k)) || reserva; };
      var pb = produtoBase(), nome = (r && typeof r.produto === 'string' && r.produto.trim()) || (pb && NOME_PRODUTO[pb]) || '';
      var valor = r && num(r.valor) && r.valor > 0 ? r.valor : (CK && CK.valorDaPreferencia ? CK.valorDaPreferencia(volta.preferencia) : null);
      if (num(valor) && valor > 0) valor = milhar(valor); else { var pv = planoEValor(); valor = estado === 'anual_pago' && pv ? pv.valor : ''; }
      var numero = (r && typeof r.pagamento === 'string' && /^\d{1,24}$/.test(r.pagamento) && r.pagamento) || volta.paymentId || '';
      var meio = volta.meio === 'pix' ? rot('pix', 'Pix') : volta.meio === 'cartao' ? rot('cartao', 'Cartão') : volta.meio === 'saldo' ? 'Saldo do Mercado Pago' : '';
      var idPedido = pedido && RE_ID.test(pedido.id) ? pedido.id : '';
      var linhas = [
        ['produto', 'Produto', nome ? nome + (valor ? ' · R$\u00a0' + valor : '') : ''],   // R$ e o número nunca quebram
        ['meio', 'Meio de pagamento', meio],
        ['numero', 'Número do pagamento', numero],
        ['pedido', 'Número do pedido', idPedido]
      ];
      var algum = false;
      linhas.forEach(function (l) {
        var caixa = $('#recibo-' + l[0]); if (!caixa) return;
        $('dt', caixa).textContent = rot(l[0], l[1]); $('dd', caixa).textContent = l[2];
        caixa.hidden = !l[2]; if (l[2] && l[0] !== 'pedido') algum = true;
      });
      $('#recibo-titulo').textContent = rot('titulo', 'Recibo');
      $('#recibo-nota').textContent = rot('nota', 'O comprovante oficial é o que o Mercado Pago manda para o e-mail que você usou lá.');
      recibo.hidden = !(mostrar && algum);
    }
    function precisaWhats() { return !!(pedido && (familiaAprovado() || estado === 'pendente') && servidorFalhou); }
    function desenharPedido() {
      var mostrar = !!pedido && /^(aprovado|confirmado|pendente|aguardando|sem_retorno)$/.test(estado);
      blocoPedido.hidden = !mostrar;
      $$('[data-estados]', blocoPedido).forEach(function (x) { x.hidden = x.getAttribute('data-estados').split(' ').indexOf(estado) === -1; });
      if (!mostrar) return;
      var nomeLet = $('#letreiro-nome');
      if (nomeLet) { var nm = cortar28(pedido.negocio); nomeLet.textContent = nm; nomeLet.setAttribute('font-size', nm.length > 22 ? '38' : nm.length > 16 ? '46' : '60'); }
      $('#obrigado-negocio').textContent = pedido.negocio;
      $('#pedido-id').textContent = pedido.id;
      var whats = precisaWhats();
      blocoWhats.hidden = !whats;
      if (whats) {
        var pg = { pagamento: volta.pagamento, paymentId: volta.paymentId, produto: pedido.produto || PRODUTO_DA_VOLTA[volta.produto] || volta.produto, valor: (CK && CK.valorDaPreferencia ? CK.valorDaPreferencia(volta.preferencia) : null) || pedido.valor };
        var msg = mensagemPedido(pedido, estado, pg, textos && textoDe(textos, 'wa.pedidoAbertura'));
        $('#pedido-texto').textContent = msg;
        var enviar = $('#enviar-pedido'), semZap = $('#sem-zap');
        if (suporteOk()) { enviar.href = linkWhats(CK.whatsappSuporte, msg); enviar.target = '_blank'; enviar.rel = 'noopener noreferrer'; enviar.hidden = false; semZap.hidden = true; }
        else { enviar.hidden = true; semZap.hidden = false; var m = $('#sem-zap-email'); m.href = linkEmail('PEDIDO v1 ' + pedido.id, msg); m.textContent = emailSuporte(); }
      }
      if (/^(aprovado|confirmado|pendente|aguardando)$/.test(estado)) {
        var janela = $('#janela-sede');
        if (janela && !janela.getAttribute('data-montada')) { janela.setAttribute('data-montada', '1'); montarJanelaSede(janela, function () { return pedido ? pedido.negocio : ''; }); }
      }
      if (!pedidoContado && (familiaAprovado() || estado === 'pendente')) { pedidoContado = true; evento('pedido_enviado_pagina', { plano: pedido.plano, nicho: pedido.nicho }); }
    }
    function desenhar() {
      var base = ESTADOS_OBRIGADO[chaveTexto()];
      main.setAttribute('data-estado', estado); main.setAttribute('data-texto', chaveTexto());
      olho.textContent = base.olho;
      titulo.textContent = texto('titulo');
      lead.textContent = texto('texto');
      try { D.title = titulo.textContent.replace(/\.$/, '') + ' | Creat'; } catch (e) {}
      var a = acao();
      botao.textContent = a.rotulo || texto('botao');
      botao.href = a.href;
      if (a.fora) { botao.target = '_blank'; botao.rel = 'noopener noreferrer'; } else { botao.removeAttribute('target'); botao.removeAttribute('rel'); }
      // segundo caminho: na assinatura, o suporte (o botão principal é o portal do assinante)
      secundario.hidden = estado !== 'assinatura_ok';
      var notasPagar = $('#obrigado-notas-pagar');
      if (notasPagar) notasPagar.hidden = !(estado === 'pendente' || estado === 'recusado');
      if (!secundario.hidden) { secundario.href = linkZap(msgZap()); secundario.target = '_blank'; secundario.rel = 'noopener noreferrer'; }
      if (zapTopo) { zapTopo.href = linkZap(msgZap()); if (suporteOk()) { zapTopo.target = '_blank'; zapTopo.rel = 'noopener noreferrer'; } }
      desenharRecibo();
      desenharPedido();
      // Formulário: só quando o pedido não está neste aparelho e a pessoa pagou ou pode ter pagado (nunca em recusado,
      // assinatura, anual, teste, Bastidores nem na espera do desktop). Sem retorno, ele fica fechado.
      var comForm = !pedido && /^(aprovado|confirmado|pendente|sem_retorno)$/.test(estado);
      semDados.hidden = !comForm;
      var det = $('#sem-dados-detalhes');
      if (det && comForm && !det.hasAttribute('data-tocado')) det.open = estado !== 'sem_retorno';
      $('#sem-dados-resumo').textContent = estado === 'sem_retorno' ? 'Já pagou em outro aparelho? Envie os dados do pedido' : 'Envie os dados do seu pedido';
      esquecer.hidden = !pedido;
      if (!linhaAtual && !API) linha(null);
    }

    /* ---- servidor: confirmação (com recuo e no máximo 6 por carga) e consulta (5, 10, 20, 30 e 60 s, até 30 min) */
    var confirma = { n: 0, feito: false, timer: 0 }, consulta = { passo: 0, timer: 0, reRegistrou: false };
    var ESPERAS_CONFIRMA = [20, 60, 180, 600, 1200], ESPERAS_CONSULTA = [5, 10, 20, 30];
    function dentroDaJanela(seg) { return Date.now() - inicio + (seg || 0) * 1000 <= TRINTA_MIN; }
    function falhou(motivo) {
      servidorFalhou = motivo || 'sem_servidor';
      if ((familiaAprovado() || estado === 'pendente') && API) linha(motivo === 'nao_encontrado' ? 'nao_encontrado' : 'sem_servidor');
      desenharPedido();
    }
    function confirmar() {
      if (!API || confirma.feito || confirma.n >= 6 || !RE_PAGAMENTO.test(volta.paymentId || '')) return;
      confirma.n++;
      var corpo = { payment_id: volta.paymentId };
      if (podeServidor()) { corpo.pedido_id = pedido.id; corpo.segredo = pedido.segredo; }
      chamar('confirmarPagamento', corpo).then(function (r) {
        var j = r.json || {};
        if (r.status === 200 && j.ok === true) {
          confirma.feito = true;
          if (podeServidor()) consultar(); else if (typeof j.status === 'string') aoStatus(j.status, j);
          return;
        }
        if (r.status === 200 && j.motivo === 'produto_fora_do_catalogo') { confirma.feito = true; linha('fora_catalogo'); return; }
        if (r.status === 200 && j.motivo === 'pagamento_ja_usado') { confirma.feito = true; linha('ja_usado'); return; }
        if (/^(400|403|405|413|422)$/.test(String(r.status))) { confirma.feito = true; return; }
        // nao_confirmado (Pix ainda não compensou), 202, 429, rede ou função fora do ar: tenta de novo mais tarde
        if (familiaAprovado() && !(servidor && servidor.status === 'a_conferir') && !esgotado) linha('confirmando');
        var espera = r.status === 429 ? 60 : ESPERAS_CONFIRMA[Math.min(confirma.n - 1, ESPERAS_CONFIRMA.length - 1)];
        if (dentroDaJanela(espera)) confirma.timer = setTimeout(confirmar, espera * 1000);
        else if (familiaAprovado()) linha('esgotou');
      });
    }
    function seguirConsultando() { return /^(aprovado|confirmado|pendente|aguardando)$/.test(estado); }
    function agendarConsulta(seg) {
      clearTimeout(consulta.timer);
      var s = seg || ESPERAS_CONSULTA[consulta.passo] || 60; consulta.passo++;
      if (dentroDaJanela(s)) consulta.timer = setTimeout(consultar, s * 1000);
      else if (familiaAprovado() || estado === 'pendente') linha('esgotou');
    }
    function consultar() {
      if (!podeServidor()) return;
      clearTimeout(consulta.timer);
      chamar('consultarPedido', { id: pedido.id, segredo: pedido.segredo }).then(function (r) {
        var j = r.json || {};
        if (r.status === 200 && j.ok === true && typeof j.status === 'string') {
          servidorFalhou = null;
          // PV-16: o servidor tem o pedido; responsável, WhatsApp, endereço, horários e e-mail saem deste aparelho
          if (!pedido.enxuto) pedido = enxugar(pedido, 'registrado');
          servidor = j; aoStatus(j.status, j);
          if (ESPERA_SERVIDOR.indexOf(j.status) !== -1 && seguirConsultando()) agendarConsulta();
          return;
        }
        if (r.status === 404 && j.erro === 'nao_encontrado') {
          // o envio do clique não chegou (rede, aba fechada): registra de novo com os dados do aparelho, uma vez
          if (!consulta.reRegistrou && registravel(pedido)) {
            consulta.reRegistrou = true;
            chamar('registrarPedido', corpoRegistro(pedido, '')).then(function (x) { if (x.status === 200 && x.json && x.json.ok === true) consultar(); else falhou(); });
            return;
          }
          falhou('nao_encontrado'); return;
        }
        if (r.status === 429) { agendarConsulta(Math.max(5, Math.min(600, +j.tentar_em_s || 60))); return; }
        falhou(); if (seguirConsultando()) agendarConsulta();
      });
    }
    // Purchase da Meta: só quando o SERVIDOR confirma o pagamento (nunca só pela URL), uma vez por payment_id.
    var compraMedida = false;
    function medirConfirmada() {
      if (compraMedida || !volta.paymentId || produtoBase() === 'pa-teste') return;
      compraMedida = true;
      medirCompra({ aprovado: true, paymentId: volta.paymentId, preferencia: volta.preferencia });
    }
    function aoStatus(st, j) {
      if (st === 'teste_ok') { if (estado !== 'teste_ok') { estado = 'teste_ok'; desenhar(); } linha('teste_ok'); return; }
      if (PAGOS.indexOf(st) !== -1) {
        if (estado !== 'confirmado') { estado = 'confirmado'; desenhar(); }   // o servidor confirmou: vale o texto "aprovado" do 2B
        clearTimeout(confirma.timer); confirma.feito = true;
        desenharRecibo();
        var entrega = j && dataBahia(j.entrega_prevista_em);
        // fora do horário o servidor liga o relógio às 11h do próximo dia de atendimento (pedido-regras.mjs inicioDoRelogio)
        var fimPrazo = j ? Date.parse(j.prazo_fim) : NaN, horasPrazo = precos && num(precos.prazoHoras) ? precos.prazoHoras : 72;
        var depois = !isNaN(fimPrazo) && fimPrazo - Date.now() > horasPrazo * 3600000 + 60000;
        medirConfirmada();
        linha(depois ? 'pago_depois' : 'pago', entrega ? 'Entrega prevista: ' + entrega + ' (horário da Bahia).' : '');
        if (j && j.prazo_fim) relogio(j.prazo_fim);
        var u = j && typeof j.rascunho_url === 'string' ? j.rascunho_url : '';
        if (u && u.indexOf(location.origin + '/sites/') === 0 && /^[^\s#?]+$/.test(u)) {
          rascunho.href = u; rascunho.hidden = false;
          rascunho.textContent = preencher((textos && textoDe(textos, 'rascunho.botao')) || 'Abrir o site para aprovar', vars());
          var rt = $('#obrigado-rascunho-texto');
          if (rt) { rt.textContent = preencher((textos && textoDe(textos, 'rascunho.texto')) || 'Abra, confira e toque em Aprovar e colocar no ar. Se quiser mudar algo, responda no WhatsApp do Suporte Creat.', vars()); rt.hidden = false; }
        }
        return;
      }
      if (st === 'a_conferir') { linha(depoisDoPagamento ? 'depois_do_pagamento' : 'a_conferir'); return; }
      if (st === 'aguardando_pagamento') { linha(familiaAprovado() ? 'confirmando' : estado === 'sem_retorno' ? null : 'registrado'); return; }
      if (st === 'recusado') { linha('recusado_servidor'); return; }
      if (st === 'desistiu') linha('desistiu');
    }
    // Relógio de verdade: só com o prazo_fim do servidor. Antes disso a tela mostra "72 h" parado e diz que começa na confirmação.
    function relogio(prazoFim) {
      var fim = Date.parse(prazoFim), dig = $('#relogio-digitos'), est = $('#relogio-estado'), txt = $('#relogio-texto');
      if (isNaN(fim) || !dig) return;
      var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
      var tique = function () { var s = Math.max(0, Math.floor((fim - Date.now()) / 1000)); dig.textContent = Math.floor(s / 3600) + ':' + p2(Math.floor(s % 3600 / 60)) + ':' + p2(s % 60); };
      tique(); clearInterval(relogioTimer); relogioTimer = setInterval(tique, 1000);
      dig.hidden = false;
      // daqui em diante o servidor manda nestes dois: o texto do conteudo/ não volta por cima
      [est, txt].forEach(function (x) { if (x) x.removeAttribute('data-texto'); });
      if (est) est.textContent = 'prazo correndo';
      var prev = (textos && textoDe(textos, 'relogio.previsto')) || 'Site pronto para você aprovar até {data}.';
      if (txt) txt.textContent = preencher(prev, { data: dataBahia(prazoFim) + ' (horário da Bahia)' });
    }

    /* ---- formulário sem dados: vira o jeito de registrar o pedido; o WhatsApp fica como envio de reserva */
    var est = { k: null, n: null, c: null, p: 1, plano: null, utm: lerOrigem() || (volta.praca ? { utm_campaign: volta.praca } : {}) };
    prepararFormPedido(f, est, null);
    var selPlano = $('#p-plano');
    var planoDaVolta = volta.plano || ({ 'pa-anual-aberto': 'aberto_anual', 'pa-anual-vitrine': 'vitrine_anual' })[volta.produto || ''] || '';
    if (selPlano && PLANOS.indexOf(planoDaVolta) !== -1) selPlano.value = planoDaVolta;
    var det = $('#sem-dados-detalhes'); if (det) det.addEventListener('toggle', function () { det.setAttribute('data-tocado', ''); });
    var botaoForm = $('#enviar-dados'), enviando = false;
    function compraDaVolta() {
      var prod = PRODUTO_DA_VOLTA[volta.produto] || (precos && precos.inauguracao ? 'pa-abertura-inauguracao-2026-11' : 'pa-abertura-2026-11');
      var o = lerOrigem() || {};
      return { produto: prod, valor: CATALOGO[prod], praca: volta.praca || (PRACAS.indexOf(o.utm_campaign) !== -1 ? o.utm_campaign : null), link: null };
    }
    var CAMPO_DO_SERVIDOR = { negocio: 'p-negocio', nicho: 'p-nicho', cidade: 'p-cidade', plano: 'p-plano', responsavel: 'p-responsavel', whatsapp: 'p-whatsapp', endereco: 'p-endereco', email: 'p-email' };
    function irAoTopo() { W.scrollTo(0, 0); if (titulo) titulo.focus(); }
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (enviando) return;
      var r = lerFormPedido(f, est);
      if (!r.ok) { resumoErros(f, r.faltam || 1); return; }
      resumoErros(f, 0);
      var s = salvarPedido(r.dados, est, null, compraDaVolta());
      if (!API || !registravel(s.registro)) { pedido = s.registro; desenhar(); falhou(); irAoTopo(); return; }
      enviando = true; botaoForm.disabled = true; botaoForm.textContent = 'Enviando...';
      var hp = f.querySelector('#p-site');
      chamar('registrarPedido', corpoRegistro(s.registro, hp ? String(hp.value || '') : '')).then(function (x) {
        enviando = false; botaoForm.disabled = false; botaoForm.textContent = 'Enviar o meu pedido';
        if (x.status === 422 && x.json && CAMPO_DO_SERVIDOR[x.json.campo]) {
          guarda.apagar(CHAVE_PEDIDO);
          var c = f.querySelector('#' + CAMPO_DO_SERVIDOR[x.json.campo]); if (c) marcar(c, 'Confira este campo.');
          resumoErros(f, 1); return;
        }
        pedido = s.registro;
        if (x.status === 200 && x.json && x.json.ok === true) {
          pedido.status = 'registrado'; gravarPedido(pedido);
          depoisDoPagamento = familiaAprovado();
          desenhar();
          if (familiaAprovado() || estado === 'pendente') { linha('conferindo'); confirmar(); }
          consultar();
        } else { desenhar(); falhou(); }
        irAoTopo();
      });
    });
    $('#copiar-pedido').addEventListener('click', function () {
      var txt = $('#pedido-texto').textContent;
      var ok = function () { aviso('Pedido copiado.'); }, ruim = function () { aviso('Não deu para copiar. Toque e segure o texto para copiar.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, ruim); else ruim();
    });
    esquecer.addEventListener('click', function () {
      esquecerTudo(); aviso('Pronto. Tudo o que este site guardou neste aparelho foi apagado.');
      setTimeout(function () { location.reload(); }, 900);
    });

    /* ---- partida */
    if (pedido) utmAtual = origemParaUtm(pedido.origem);
    desenhar();
    lerPrecos().then(function (pr) { precos = pr; aplicarPrecos(pr, D); desenhar(); });
    // os textos com {{precos.prazoHoras}} só entram com os preços lidos (nunca "Prazo:  h")
    var textosNaTela = function () { if (textos && precos) aplicarTextos(textos, vars()); };
    lerPrecos().then(textosNaTela);
    buscarJSON('conteudo/obrigado.json').then(function (j) { if (j && typeof j === 'object') { textos = j; desenhar(); textosNaTela(); } });
    if (!API) { if (pedido) falhou(); return; }
    var comPagamento = (familiaAprovado() || estado === 'pendente' || estado === 'teste_ok') && RE_PAGAMENTO.test(volta.paymentId || '');
    if (comPagamento) { if (familiaAprovado()) linha('conferindo'); confirmar(); }
    if (podeServidor() && /^(aprovado|confirmado|pendente|aguardando|sem_retorno|teste_ok)$/.test(estado)) {
      if (!comPagamento && estado !== 'sem_retorno') linha('conferindo');
      // na espera do desktop, o envio do clique (keepalive) pode chegar um instante depois desta página
      if (estado === 'aguardando') consulta.timer = setTimeout(consultar, 3000); else consultar();
    } else if (pedido && (familiaAprovado() || estado === 'pendente') && !podeServidor()) falhou();
  }

  /* ======================================================================
     /bastidores/
     ====================================================================== */
  function paginaBastidores() {
    utmAtual = lerUtm(new URLSearchParams(location.search));
    lerPrecos().then(function (pr) {
      aplicarPrecos(pr, D);
      $$('[data-checkout]').forEach(function (b) { aplicarCheckout(b, 'bastidores'); var ok = b.getAttribute('data-link-ok') === '1'; var n = $('#bastidores-config'); if (n) n.hidden = ok; });
    });
  }

  /* ======================================================================
     /termos/ e /privacidade/: Markdown de conteudo/ renderizado por DOM
     ====================================================================== */
  function inline(pai, texto) {
    var re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g, ult = 0, m;
    while ((m = re.exec(texto))) {
      if (m.index > ult) pai.appendChild(D.createTextNode(texto.slice(ult, m.index)));
      if (m[1]) pai.appendChild(el('strong', null, m[1]));
      else { var href = m[3]; if (/^(https:|mailto:|\/|#|\.\.?\/)/.test(href)) pai.appendChild(el('a', { href: href }, m[2])); else pai.appendChild(D.createTextNode(m[2])); }
      ult = re.lastIndex;
    }
    if (ult < texto.length) pai.appendChild(D.createTextNode(texto.slice(ult)));
  }
  function renderMarkdown(md, alvo, valores) {
    var linhas = md.replace(/\r/g, '').split('\n');
    if (linhas[0] && linhas[0].trim() === 'REVISAO_JURIDICA_PENDENTE') linhas.shift(); // a página já mostra a linha no topo
    // Campo de empresa vazio some com a vírgula que o antecede; marcador sem valor vira vazio, nunca "(a informar)".
    var emp = empresa();
    var trocar = function (s) {
      return s.replace(/\s*\(nome empresarial \{\{empresa\.razao\}\}\)/g, function () { return emp.razao ? ' (nome empresarial ' + emp.razao + ')' : ''; })
        .replace(/,\s*\{\{empresa\.(documento|endereco)\}\}/g, function (m, k) { return emp[k] ? ', ' + emp[k] : ''; })
        .replace(/\{\{([A-Za-z_][A-Za-z0-9._]*)\}\}/g, function (m, k) {
          if (k === 'contato.email') return emailSuporte();
          if (k.indexOf('empresa.') === 0) return emp[k.slice(8)] || '';
          if (k in valores) return valores[k];
          return '';
        });
    };
    var lista = null, par = [];
    var fecharPar = function () { if (par.length) { var p = el('p'); inline(p, trocar(par.join(' '))); alvo.appendChild(p); par = []; } };
    linhas.forEach(function (l) {
      var m;
      if (!l.trim()) { fecharPar(); lista = null; return; }
      if ((m = /^(#{1,3})\s+(.*)$/.exec(l))) { fecharPar(); lista = null; var h = el('h' + Math.min(3, m[1].length + 1)); inline(h, trocar(m[2])); alvo.appendChild(h); return; }
      if ((m = /^\s*[-*]\s+(.*)$/.exec(l)) || (m = /^\s*\d+\.\s+(.*)$/.exec(l))) {
        fecharPar();
        var tipo = /^\s*\d+\./.test(l) ? 'ol' : 'ul';
        if (!lista || lista.tagName.toLowerCase() !== tipo) { lista = el(tipo); alvo.appendChild(lista); }
        var li = el('li'); inline(li, trocar(m[1])); lista.appendChild(li); return;
      }
      lista = null; par.push(l.trim());
    });
    fecharPar();
  }
  function paginaDocumento() {
    var alvo = $('#doc'), fonte = alvo && alvo.getAttribute('data-md'); if (!fonte) return;
    Promise.all([fetch(RAIZ + fonte, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.text() : null; }).catch(function () { return null; }), lerPrecos()]).then(function (r) {
      var md = r[0], pr = r[1];
      $$('[data-carregando-doc]').forEach(function (x) { x.hidden = true; });
      if (!md) { alvo.appendChild(el('p', null, 'O texto não carregou. Recarregue a página ou peça o texto pelo e-mail ' + emailSuporte() + '.')); return; }
      var v = valoresDe(pr);
      var pi = pr.inauguracao ? pr.inauguracao.preco : pr.inauguracaoTermos;
      v['precos.abertura.inauguracao.preco'] = pi ? milhar(pi) : '(valor da página /abrir/)';
      var vt = pr.inauguracao ? pr.inauguracao.vagasTotal : pr.inauguracaoVagasTermos;
      v['precos.abertura.inauguracao.vagasTotal'] = vt ? milhar(vt) : '20';
      renderMarkdown(md, alvo, v);
    });
  }

  /* ------------------------------------------------------------ âncoras abaixo do cabeçalho fixo
     O cabeçalho tem 1 linha no desktop (~64 px) e 2 no celular (~140 px). O CSS fixa 80 px como reserva;
     aqui o scroll-padding acompanha a altura real, para o olho da seção (ex.: "Sede ao vivo") não ficar
     debaixo dele quando alguém toca num link do menu. */
  function ajustarAncoras() {
    var barra = $('header.barra'); if (!barra) return;
    var ajustar = function () { D.documentElement.style.scrollPaddingTop = Math.ceil(barra.getBoundingClientRect().height + 16) + 'px'; };
    ajustar();
    if ('ResizeObserver' in W) new ResizeObserver(ajustar).observe(barra);
    else W.addEventListener('resize', ajustar);
  }

  /* ------------------------------------------------------------ partida */
  function iniciar() {
    // 1º: nome e cidade saem do endereço, antes de qualquer medição (Pixel, Clarity, PostHog).
    limparEndereco();
    limparVencidos();
    guardarOrigem(Object.keys(ENTRADA.query).length ? ENTRADA.query : ENTRADA.frag.utm);
    ajustarAncoras();
    montarSuporte();
    montarEmpresa();
    montarTermosVersao();
    montarSom();
    try {
      if (PAGINA === 'home') paginaHome();
      else if (PAGINA === 'abrir') paginaAbrir();
      else if (PAGINA === 'obrigado') paginaObrigado();
      else if (PAGINA === 'bastidores') paginaBastidores();
      else if (PAGINA === 'documento') paginaDocumento();
    } finally {
      montarConsentimento();
      iniciarPosthog();
      D.documentElement.classList.add('js-pronto');
    }
  }

  W.Vitrine = {
    lerPrecos: lerPrecos, lerFragmento: lerFragmento, montarFragmento: montarFragmento, filtrarPropriedades: filtrarPropriedades,
    beforeSend: beforeSend, normalizarWhats: normalizarWhats, textoPedido: textoPedido, fresco: fresco, raiz: RAIZ,
    lerRetornoMP: lerRetornoMP, medirCompra: medirCompra, filtrarPixel: filtrarPixel, lerOrigem: lerOrigem, guardarOrigem: guardarOrigem,
    consentimento: consentimento, esquecerTudo: esquecerTudo, limparVencidos: limparVencidos,
    lerVolta: lerVolta, estadoDaVolta: estadoDaVolta, mensagemPedido: mensagemPedido, novoId: novoId, novoSegredo: novoSegredo,
    corpoRegistro: corpoRegistro, corpoContagem: corpoContagem, lerPedidoSalvo: lerPedidoSalvo
  };
  /* No endereço antigo, assets/canonico.js já mandou a pessoa ao canônico: nada de medir, contar, gravar nem pedir
     consentimento aqui. Se a troca não acontecer (tempo limite de canonico.js), a página volta a funcionar. */
  function partida() { if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', iniciar); else iniciar(); }
  if (W.CreatCanonico && W.CreatCanonico.mudando) W.addEventListener('creat:canonico-ficou', partida, { once: true });
  else partida();
})();
