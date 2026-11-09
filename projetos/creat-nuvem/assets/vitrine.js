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
   - dados/*.json com mais de 48 h, ausentes ou inválidos = preço padrão,
     sem contador e sem inauguração, sem mensagem de erro (ADR-003).
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
  var RE_RESP = /^[\p{L} .'-]+$/u, RE_EMAIL = /^[^\s@:;]+@[^\s@:;]+\.[^\s@:;]{2,}$/;
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
  function limparNome(v) { return String(v || '').replace(/\s+/g, ' ').trim(); }
  function nomeValido(v) { return v.length >= 1 && v.length <= 40 && RE_NOME.test(v); }
  function cidadeValida(v) { return v.length >= 1 && v.length <= 40 && RE_CIDADE.test(v); }
  function cortar28(v) { if (v.length <= 28) return v; var c = v.slice(0, 28); var i = c.lastIndexOf(' '); return (i > 8 ? c.slice(0, i) : c).trim(); }
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
  function fresco(obj, agora) {
    if (!obj || typeof obj.atualizado_em !== 'string') return false;
    var tms = Date.parse(obj.atualizado_em);
    if (isNaN(tms)) return false;
    var dif = (agora || Date.now()) - tms;
    return dif <= H48 && dif >= -FOLGA;
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
      var frescoP = !!base && fresco(p, agora);
      var frescoV = vagasValidas(v) && fresco(v, agora);
      var padrao = base ? base.abertura.padrao : pad.abertura;
      var links = (CK && CK.links) || {};
      var vale = (CK && CK.linkValido) || function () { return false; };
      // Inauguração: precos.json E vagas.json frescos (seção 18, item 7), ativa e com vaga.
      var inaug = (frescoP && frescoV && inauguracaoValida(base.abertura.inauguracao, padrao)) ? base.abertura.inauguracao : null;
      // Preço e link andam juntos: se só o link padrão é real, a página não mostra o preço de inauguração.
      if (inaug && !vale(links.aberturaInauguracao) && vale(links.aberturaPadrao)) inaug = null;
      var chave = inaug ? 'aberturaInauguracao' : 'aberturaPadrao';
      return {
        fresco: frescoP,
        prazoHoras: base ? base.prazoHoras : pad.prazoHoras,
        abertura: padrao,
        aberturaAtual: inaug ? inaug.preco : padrao,
        inauguracao: inaug ? { preco: inaug.preco, vagasTotal: inaug.vagasTotal, vagasRestantes: inaug.vagasRestantes } : null,
        planos: base ? { aberto: base.planos.aberto, vitrine: base.planos.vitrine } : pad.planos,
        anualMesesPagos: base ? base.anualMesesPagos : pad.anualMesesPagos,
        bastidores: base && num(base.bastidores) && base.bastidores > 0 ? base.bastidores : pad.bastidores,
        // Só para o texto dos termos (descreve a regra): o preço de inauguração como está no arquivo, mesmo velho.
        inauguracaoTermos: base && base.abertura.inauguracao && num(base.abertura.inauguracao.preco) && base.abertura.inauguracao.preco > 0 ? base.abertura.inauguracao.preco : null,
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
      v['precos.abertura.inauguracao.vagasRestantes'] = milhar(pr.inauguracao.vagasRestantes);
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
    var cond = {
      'inauguracao': !!pr.inauguracao,
      'sem-inauguracao': !pr.inauguracao,
      'varias-vagas': !!pr.inauguracao && pr.inauguracao.vagasRestantes > 1,
      'ultima-vaga': !!pr.inauguracao && pr.inauguracao.vagasRestantes === 1,
      'vagas-hoje': !!pr.vagasHoje && pr.vagasHoje.vagas_hoje > 0,
      'vagas-esgotadas': !!pr.vagasHoje && pr.vagasHoje.vagas_hoje === 0,
      'dados-prontos': true
    };
    $$('[data-se]', raiz).forEach(function (e) { e.hidden = !cond[e.getAttribute('data-se')]; });
    $$('[data-carregando-precos]', raiz).forEach(function (e) { e.hidden = true; });
  }

  /* ------------------------------------------------------------ botões de checkout (contrato e) */
  function aplicarCheckout(btn, chave) {
    if (!btn.hasAttribute('data-rotulo')) btn.setAttribute('data-rotulo', btn.textContent.trim());
    btn.setAttribute('data-checkout', chave);
    var link = CK && CK.links ? CK.links[chave] : null;
    var ok = !!(CK && CK.linkValido(link));
    if (ok) {
      btn.setAttribute('href', link);
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
    var s = el('script', { src: src, async: true, crossorigin: 'anonymous', referrerpolicy: 'no-referrer' });
    if (integridade) s.integrity = integridade; // SRI: arquivo alterado no CDN = navegador recusa, nada roda na nossa origem
    s.onload = aoCarregar || null; s.onerror = function () { fila = []; };
    D.head.appendChild(s);
  }
  function iniciarPosthog() {
    if (!MED.posthogValida || !MED.posthogValida(MED.posthogChave)) return; // chave de exemplo: desligado, nenhuma requisição
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

  /* Consentimento: Pixel e Clarity só depois do "Aceitar", e só na home
     (a única página cujo endereço nunca leva nome nem cidade). */
  var CHAVE_CONSENT = 'creat:consentimento';
  function consentimento() { var c = lerJSONGuardado(CHAVE_CONSENT); return c && c.versao === 1 ? c : null; }
  var terceirosCarregados = false;
  function carregarTerceiros() {
    if (terceirosCarregados || PAGINA !== 'home') return;
    var c = consentimento(); if (!c || !c.pixel) return;
    terceirosCarregados = true;
    if (MED.pixelValido && MED.pixelValido(MED.metaPixel)) {
      var f = W.fbq = function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); };
      if (!W._fbq) W._fbq = f; f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
      W.fbq('set', 'autoConfig', false, MED.metaPixel);
      W.fbq('init', MED.metaPixel);
      W.fbq('track', 'PageView');
      carregarScript('https://connect.facebook.net/en_US/fbevents.js');
    }
    if (MED.clarityValido && MED.clarityValido(MED.clarity)) {
      W.clarity = W.clarity || function () { (W.clarity.q = W.clarity.q || []).push(arguments); };
      carregarScript('https://www.clarity.ms/tag/' + MED.clarity);
    }
  }
  function pixelEvento(nome) { try { if (terceirosCarregados && W.fbq) W.fbq('track', nome); } catch (e) {} }
  function montarConsentimento() {
    var caixa = $('#consentimento'); if (!caixa) return;
    // O banner reserva o próprio espaço no fim da página: nada fica escondido atrás dele.
    var mostrar = function () { caixa.hidden = false; D.body.classList.add('com-consentimento'); D.body.style.setProperty('--altura-consentimento', (caixa.offsetHeight + 24) + 'px'); };
    var esconder = function () { caixa.hidden = true; D.body.classList.remove('com-consentimento'); };
    var decidir = function (sim) {
      guarda.gravar(CHAVE_CONSENT, JSON.stringify({ versao: 1, analytics: true, pixel: sim, clarity: sim, em: new Date().toISOString() }));
      esconder(); aviso(caixa.getAttribute('data-salvo') || 'Preferência salva.');
      if (sim) carregarTerceiros();
    };
    $$('[data-consentir]', caixa).forEach(function (b) { b.addEventListener('click', function () { decidir(b.getAttribute('data-consentir') === 'sim'); }); });
    $$('[data-preferencias]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); mostrar(); var p = $('[data-consentir]', caixa); if (p) p.focus(); }); });
    if (consentimento()) { carregarTerceiros(); return; }
    // O banner não cobre a primeira tela: aparece quando o visitante passa do hero, fecha a prévia
    // ou depois de 25 s. Até lá nada de Pixel nem Clarity (só carregam com o Aceitar).
    var heroi = $('#porta'), mostrado = false;
    var talvez = function () {
      if (mostrado) return;
      var limite = heroi ? heroi.offsetTop + heroi.offsetHeight * 0.6 : W.innerHeight * 0.6;
      if ((W.scrollY || 0) + W.innerHeight * 0.4 > limite) disparar();
    };
    var disparar = function () { if (mostrado) return; mostrado = true; W.removeEventListener('scroll', talvez); mostrar(); };
    W.addEventListener('scroll', talvez, { passive: true });
    W.addEventListener('creat:previa-fechada', disparar);
    setTimeout(disparar, 25000);
  }

  /* ------------------------------------------------------------ suporte, barra e som */
  function montarSuporte() {
    var ok = suporteOk();
    $$('[data-zap]').forEach(function (a) {
      var tipo = a.getAttribute('data-zap') || 'duvida';
      var textos = { duvida: 'Olá! Vi o Porta Aberta e tenho uma dúvida:', suporte: 'Olá! Já sou cliente do Porta Aberta e preciso de ajuda com o site.' };
      var msg = a.getAttribute('data-msg') || textos[tipo] || textos.duvida;
      if (ok) { a.href = linkWhats(CK.whatsappSuporte, msg); a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      else if (a.hasAttribute('data-some-sem-zap')) { a.hidden = true; }
      else { a.href = linkEmail('Porta Aberta', msg); a.removeAttribute('target'); var r = a.querySelector('[data-rotulo-zap]'); if (r) r.textContent = 'Falar com o suporte'; }
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

  /* ------------------------------------------------------------ sede (iframe sob demanda) */
  function urlSede() {
    // No repositório a sede mora em /sede/ na raiz; publicada, ela vai para /sede/ do site (T10 copia).
    var i = RAIZ.indexOf('/projetos/creat-nuvem/');
    return i !== -1 ? RAIZ.slice(0, i) + '/sede/index.html' : RAIZ + 'sede/index.html';
  }
  // O nome vai só no fragmento (#marca=), que o navegador não envia ao servidor, à CDN nem no Referer
  // (ADR-002). A query leva só parâmetros sem dado pessoal. O atributo src do iframe fica limpo.
  function carregarSede(janela, nome, lite, aoCarregar) {
    if (janela.querySelector('iframe')) return;
    var q = ['modo=demo']; if (lite) q.push('lite=1');
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
    try { fr.setAttribute('data-alvo', '1'); fr.contentWindow.location.replace(url); } catch (e) { fr.src = url; }
    evento('sede_aberta', {});
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

  /* ------------------------------------------------------------ id do pedido */
  function novoId() {
    var A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ', b = new Uint8Array(8), s = 'PA-';
    (W.crypto || W.msCrypto).getRandomValues(b);
    for (var i = 0; i < 8; i++) s += A.charAt(b[i] % 32);
    return s;
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
    var hashIni = lerFragmento(location.hash);
    utmAtual = lerUtm(q); if (!Object.keys(utmAtual).length) utmAtual = hashIni.utm;
    // A home nunca guarda nome ou cidade no endereço (Pixel e Clarity podem ler a URL depois do aceite):
    // lê o fragmento vindo de /abrir/ ou /previa/ e limpa o endereço na hora.
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);

    var form = $('#form-abrir'), campoNome = $('#nome'), campoCidade = $('#cidade');
    var caixaNome = campoNome.closest('.campo'), erroNome = $('#nome-erro'), erroNicho = $('#nicho-erro');
    var nichoQ = q.get('nicho'); if (nichoQ === 'salão' || nichoQ === 'estetica') nichoQ = 'salao';
    var nichoIni = NICHOS.indexOf(nichoQ) !== -1 ? nichoQ : hashIni.k;
    if (nichoIni) { var r0 = $('input[name="nicho"][value="' + nichoIni + '"]'); if (r0) r0.checked = true; }
    if (hashIni.n) campoNome.value = hashIni.n;
    if (hashIni.c) campoCidade.value = hashIni.c;

    function nichoAtual() { var r = $('input[name="nicho"]:checked'); return r ? r.value : null; }
    function estado() {
      var n = limparNome(campoNome.value), c = limparNome(campoCidade.value);
      return { k: nichoAtual(), n: nomeValido(n) ? n : null, c: c && cidadeValida(c) ? c : null, p: 1, utm: utmAtual };
    }
    function nomeParaSede() { var s = estado(); return s.n || ''; }

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
      $('#contador-giz').textContent = n.length + ' de 40';
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
    var urlPreviaAtual = '', focoAntes = null;
    function abrirPrevia() {
      var s = estado(); if (!s.k || !s.n) return;
      var frag = montarFragmento(s, false);
      urlPreviaAtual = RAIZ + 'previa/#' + frag;
      $('#previa-nome').textContent = s.n;
      frame.title = 'Prévia do site da ' + s.n;
      carregandoPrevia.hidden = false; frame.style.visibility = 'hidden';
      previa.hidden = false; D.body.classList.add('com-previa');
      fora.forEach(function (x) { if (x) x.setAttribute('inert', ''); });
      focoAntes = D.activeElement;
      try { frame.contentWindow.location.replace(urlPreviaAtual); } catch (e) { frame.src = urlPreviaAtual; }
      if (!history.state || !history.state.previa) history.pushState({ previa: 1 }, '', location.pathname + location.search + '#previa');
      requestAnimationFrame(function () { previa.classList.add('aberta'); $('#previa-fechar').focus(); });
      evento('previa_gerada', { nicho: s.k });
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
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(urlPreviaAtual).then(ok, falhou); else falhou();
    });
    $('#previa-testar').addEventListener('click', function () {
      fecharPrevia(false);
      setTimeout(function () { var s = $('#teste'); s.scrollIntoView({ behavior: MOV_REDUZIDO.matches ? 'auto' : 'smooth', block: 'start' }); $('#teste-whats').focus({ preventScroll: true }); }, 60);
    });
    function irParaAbrir(plano) {
      var s = estado(); s.plano = plano;
      pixelEvento('InitiateCheckout');
      location.href = RAIZ + 'abrir/#' + montarFragmento(s, true);
    }
    $('#previa-quero').addEventListener('click', function () { irParaAbrir('vitrine'); });
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
      var modelo = 'Teste do Porta Aberta. Assim chega um pedido de horário no site da {negocio}: "Olá! Quero pedir um horário: {servico}, {dia} às {hora}. Meu nome é (nome do cliente)." No site de verdade, o dono confirma pelo WhatsApp.';
      if (!s.n) modelo = modelo.replace('no site da {negocio}', 'no seu site');
      var msg = t(modelo, { negocio: s.n, servico: tServ.value, dia: tDia.value, hora: tHora.value });
      $('#celular-msg').textContent = msg;
      abrirExterno(linkWhats(numero, msg));   // o número só existe aqui, na memória, e no link do próprio WhatsApp
      somFn('plim');
      evento('reserva_teste', { nicho: nichoTeste || 'barbearia' });
      $('#teste-abriu').hidden = false;
    });
    $('#teste-alternativa').addEventListener('click', function () {
      var s = estado();
      var msg = t('Olá! Quero pedir um horário: {servico}, {dia} às {hora}. Meu nome é (nome do cliente).', { servico: tServ.value || 'Corte', dia: tDia.value || 'amanhã', hora: tHora.value || '10:00' });
      $('#celular-msg').textContent = msg;
      $('#celular-de').textContent = s.n ? 'Pedido pelo site da ' + s.n : 'Pedido pelo seu site';
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
    montarJanelaSede($('#janela-sede'), nomeParaSede);

    /* WhatsApp flutuante: some quando um botão principal está na faixa de baixo da tela */
    var zap = $('.zap-flutuante');
    if (zap && !zap.hidden) {
      var ctas = $$('[data-cta]'), agendado = false;
      var conferir = function () {
        agendado = false;
        var vh = W.innerHeight, zr = zap.getBoundingClientRect(), cobre = false;
        ctas.forEach(function (c) { var r = c.getBoundingClientRect(); if (r.width && r.bottom > zr.top - 12 && r.top < zr.bottom + 12 && r.right > zr.left - 12) cobre = true; });
        zap.classList.toggle('zap-recolhido', cobre || vh < 420);
      };
      var agendar = function () { if (!agendado) { agendado = true; requestAnimationFrame(conferir); } };
      W.addEventListener('scroll', agendar, { passive: true }); W.addEventListener('resize', agendar); agendar();
    }
  }

  /* ======================================================================
     FORMULÁRIO DO PEDIDO (usado em /abrir/ e em /obrigado/ sem dados)
     ====================================================================== */
  function montarHorarios(caixa, semana) {
    caixa.textContent = '';
    DIAS_PEDIDO.forEach(function (d) {
      var idx = DIA_IDX[d], h = semana[String(idx)], linha = el('div', { class: 'dia', 'data-dia': d });
      var id = 'h-' + d;
      var cab = el('div', { class: 'dia-cab' });
      cab.appendChild(el('span', { class: 'dia-nome', id: id + '-nome' }, DIA_NOME[idx]));
      var rot = el('label', { class: 'dia-aberto' });
      var ck = el('input', { type: 'checkbox', id: id + '-aberto', 'aria-describedby': id + '-nome' });
      ck.checked = !!h; rot.appendChild(ck); rot.appendChild(el('span', null, 'Aberto'));
      cab.appendChild(rot); linha.appendChild(cab);
      var horas = el('div', { class: 'dia-horas' });
      [['abre', 'Abre'], ['fecha', 'Fecha']].forEach(function (par) {
        var l = el('label', { class: 'dia-hora' }); l.appendChild(el('span', null, par[1]));
        var inp = el('input', { type: 'time', step: '900', id: id + '-' + par[0], 'aria-label': DIA_NOME[idx] + ', ' + par[1].toLowerCase() });
        inp.value = h ? h[par[0]] : (par[0] === 'abre' ? '09:00' : '18:00');
        l.appendChild(inp); horas.appendChild(l);
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
      if (m[3]) { l.querySelector('[id$="-abre"]').value = m[3]; l.querySelector('[id$="-fecha"]').value = m[4]; }
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
  var CHAVE_PEDIDO = 'creat:pedido:v1';
  function salvarPedido(d, estadoBase, idExistente) {
    var agora = new Date();
    var registro = {
      id: idExistente || novoId(), plano: d.plano, nicho: d.nicho, negocio: d.negocio, cidade: d.cidade,
      responsavel: d.responsavel, whatsapp_negocio: d.whatsapp_negocio, endereco: d.endereco, horarios: d.horarios, email: d.email,
      origem: origemTexto(estadoBase.utm), previa: RAIZ + 'previa/#' + montarFragmento({ k: d.nicho, n: d.negocio, c: d.cidade, p: estadoBase.p || 1 }, false),
      aceite_termos: isoComFuso(agora) + ' ' + ((CK && CK.termosVersao) || 'termos-v1'),
      paleta: estadoBase.p || 1, salvo_em: agora.toISOString()
    };
    var ok = guarda.gravar(CHAVE_PEDIDO, JSON.stringify(registro));
    return { registro: registro, gravou: ok };
  }
  function lerPedidoSalvo() {
    var p = lerJSONGuardado(CHAVE_PEDIDO);
    if (!p || typeof p !== 'object') return null;
    var t0 = Date.parse(p.salvo_em);
    if (isNaN(t0) || Date.now() - t0 > D7) { guarda.apagar(CHAVE_PEDIDO); return null; }
    var obrig = ['id', 'plano', 'nicho', 'negocio', 'cidade', 'responsavel', 'whatsapp_negocio', 'endereco', 'horarios', 'email', 'origem', 'previa', 'aceite_termos'];
    for (var i = 0; i < obrig.length; i++) if (typeof p[obrig[i]] !== 'string' || !p[obrig[i]]) return null;
    if (!/^PA-[0-9A-HJKMNP-TV-Z]{8}$/.test(p.id) || PLANOS.indexOf(p.plano) === -1 || NICHOS.indexOf(p.nicho) === -1) return null;
    return p;
  }

  /* ======================================================================
     /abrir/
     ====================================================================== */
  function paginaAbrir() {
    var est = lerFragmento(location.hash);
    var salvo = lerPedidoSalvo();
    if (!est.plano) est.plano = 'vitrine';
    utmAtual = est.utm;
    if (!Object.keys(utmAtual).length && salvo) { utmAtual = origemParaUtm(salvo.origem); est.utm = utmAtual; }
    var f = $('#form-pedido');
    $('#abrir-titulo').textContent = est.n ? 'Falta pouco para abrir a ' + est.n + '.' : 'Falta pouco para abrir o seu negócio.';
    var resumo = $('#abrir-negocio');
    if (est.n && est.k) {
      resumo.hidden = false;
      $('#abrir-negocio-nome').textContent = est.n;
      $('#abrir-negocio-detalhe').textContent = ROTULO_NICHO[est.k] + (est.c ? ' · ' + est.c : '');
      $('#abrir-voltar').href = RAIZ + '#' + montarFragmento(est, false);   // a home lê, preenche e limpa o endereço
    }
    var radios = $$('input[name="plano"]', f);
    radios.forEach(function (r) { r.checked = r.value === est.plano; });
    prepararFormPedido(f, est, salvo && (!est.n || salvo.negocio === est.n) ? salvo : null);
    var precos = null;
    function atualizarTotal() {
      if (!precos) return;
      var anual = /_anual$/.test(est.plano);
      $('#total-mensal').hidden = anual; $('#total-anual').hidden = !anual;
      aplicarPrecos(precos, D, est.plano);
      $('#anual-nota').hidden = !anual;
    }
    radios.forEach(function (r) {
      r.addEventListener('change', function () {
        est.plano = r.value; somFn('clique');
        history.replaceState(null, '', location.pathname + location.search + '#' + montarFragmento(est, true));
        atualizarTotal(); evento('plano_visto', { plano: est.plano, nicho: est.k || undefined });
      });
    });
    var botoes = $$('[data-checkout]', f.parentNode);
    lerPrecos().then(function (pr) {
      precos = pr; atualizarTotal();
      var algumOk = false;
      botoes.forEach(function (b) { if (aplicarCheckout(b, pr.linkChave)) algumOk = true; });
      $('#pagamento-config').hidden = algumOk;
      var zapCfg = $('#pagamento-zap');
      if (!algumOk && zapCfg) {
        var msg = 'Olá! Quero fechar o plano ' + est.plano.replace('_', ' ') + ' do Porta Aberta, mas o link de pagamento ainda não estava liberado na página.';
        if (suporteOk()) { zapCfg.href = linkWhats(CK.whatsappSuporte, msg); zapCfg.target = '_blank'; zapCfg.rel = 'noopener noreferrer'; }
        else { zapCfg.href = linkEmail('Fechar o plano do Porta Aberta', msg); zapCfg.textContent = 'Falar com o suporte por e-mail'; }
      }
    });
    botoes.forEach(function (b) {
      b.addEventListener('click', function (e) {
        if (b.getAttribute('data-link-ok') !== '1') { e.preventDefault(); return; }
        var r = lerFormPedido(f, est);
        if (!r.ok) { e.preventDefault(); resumoErros(f, r.faltam); return; }
        resumoErros(f, 0);
        var s = salvarPedido(r.dados, est, salvo && salvo.negocio === r.dados.negocio ? salvo.id : null);
        if (!s.gravou) aviso('Este navegador não deixa guardar dados no aparelho, por isso a próxima página vai pedir os campos de novo. O pedido funciona do mesmo jeito.');
        evento('checkout_iniciado', { plano: r.dados.plano, nicho: r.dados.nicho });
      });
    });
    $('#form-pedido').addEventListener('submit', function (e) { e.preventDefault(); });
    var esquecer = $('#esquecer');
    if (esquecer) {
      esquecer.hidden = !salvo;
      esquecer.addEventListener('click', function () { guarda.apagar(CHAVE_PEDIDO); esquecer.hidden = true; aviso('Pronto. Os dados do pedido saíram deste aparelho.'); });
    }
    evento('plano_visto', { plano: est.plano, nicho: est.k || undefined });
  }

  /* ======================================================================
     /obrigado/
     ====================================================================== */
  function textoPedido(p) {
    var linha = function (k) { return k + ': ' + String(p[k]).replace(/[\r\n]+/g, ' ').trim(); };
    return ['PEDIDO v1'].concat(['id', 'plano', 'nicho', 'negocio', 'cidade', 'responsavel', 'whatsapp_negocio', 'endereco', 'horarios', 'email', 'origem', 'previa', 'aceite_termos'].map(linha)).join('\n');
  }
  function paginaObrigado() {
    var precos = null;
    lerPrecos().then(function (pr) { precos = pr; aplicarPrecos(pr, D); });
    var sem = $('#obrigado-sem-dados'), com = $('#obrigado-pedido');
    // pedido_enviado_pagina: no máximo um por carga, e só com pedido real.
    // Indicador aproximado: o pedido é gravado ao clicar em Pagar, antes do Pix; não é pagamento confirmado.
    var pedidoContado = false;
    function renderizar(p) {
      utmAtual = origemParaUtm(p.origem);
      sem.hidden = true; com.hidden = false;
      var nomeLet = $('#letreiro-nome');
      if (nomeLet) {
        var nm = cortar28(p.negocio); nomeLet.textContent = nm;
        nomeLet.setAttribute('font-size', nm.length > 22 ? '38' : nm.length > 16 ? '46' : '60');
      }
      $('#obrigado-negocio').textContent = p.negocio;
      var txt = textoPedido(p);
      $('#pedido-texto').textContent = txt;
      var enviar = $('#enviar-pedido'), semZap = $('#sem-zap');
      if (suporteOk()) { enviar.href = linkWhats(CK.whatsappSuporte, txt); enviar.target = '_blank'; enviar.rel = 'noopener noreferrer'; enviar.hidden = false; semZap.hidden = true; }
      else { enviar.hidden = true; semZap.hidden = false; var m = $('#sem-zap-email'); m.href = linkEmail('PEDIDO v1 ' + p.id, txt); m.textContent = emailSuporte(); }
      $('#voltar-plano').href = RAIZ + 'abrir/#' + montarFragmento({ plano: p.plano, k: p.nicho, n: p.negocio, c: p.cidade, p: p.paleta || 1, utm: utmAtual }, true);
      var janela = $('#janela-sede');
      if (janela && !janela.getAttribute('data-montada')) { janela.setAttribute('data-montada', '1'); montarJanelaSede(janela, function () { return p.negocio; }); }
      if (!pedidoContado) { pedidoContado = true; evento('pedido_enviado_pagina', { plano: p.plano, nicho: p.nicho }); }
    }
    $('#copiar-pedido').addEventListener('click', function () {
      var txt = $('#pedido-texto').textContent;
      var ok = function () { aviso('Pedido copiado.'); }, falhou = function () { aviso('Não deu para copiar. Toque e segure o texto para copiar.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, falhou); else falhou();
    });
    $('#esquecer').addEventListener('click', function () {
      guarda.apagar(CHAVE_PEDIDO); aviso('Pronto. Os dados do pedido saíram deste aparelho.');
      setTimeout(function () { location.reload(); }, 900);
    });
    var p = lerPedidoSalvo();
    if (p) { renderizar(p); return; }
    // Sem dados no aparelho: pede os campos de novo, inclusive negócio, nicho, cidade e plano.
    sem.hidden = false; com.hidden = true;
    var est = { k: null, n: null, c: null, p: 1, plano: null, utm: {} };
    var f = $('#form-pedido');
    prepararFormPedido(f, est, null);
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var r = lerFormPedido(f, est);
      if (PLANOS.indexOf(r.dados.plano) === -1) r.ok = false;
      if (!r.ok) { resumoErros(f, r.faltam || 1); return; }
      resumoErros(f, 0);
      var s = salvarPedido(r.dados, est, null);
      renderizar(s.registro);
      W.scrollTo(0, 0); var h = $('#obrigado-titulo'); if (h) h.focus();
    });
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
    var trocar = function (s) {
      return s.replace(/\{\{([a-z._]+)\}\}/g, function (m, k) {
        if (k === 'contato.email') return emailSuporte();
        if (k in valores) return valores[k];
        return '(a informar)';
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
      renderMarkdown(md, alvo, v);
    });
  }

  /* ------------------------------------------------------------ partida */
  function iniciar() {
    montarSuporte();
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
    beforeSend: beforeSend, normalizarWhats: normalizarWhats, textoPedido: textoPedido, fresco: fresco, raiz: RAIZ
  };
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
