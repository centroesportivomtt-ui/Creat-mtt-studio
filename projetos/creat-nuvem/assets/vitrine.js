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
  function aplicarCheckout(btn, chave, linkEscolhido) {
    if (!btn.hasAttribute('data-rotulo')) btn.setAttribute('data-rotulo', btn.textContent.trim());
    btn.setAttribute('data-checkout', chave);
    var link = linkEscolhido || (CK && CK.links ? CK.links[chave] : null);
    var ok = !!(CK && CK.linkValido(link));
    if (ok) {
      btn.setAttribute('href', link);
      btn.removeAttribute('target'); btn.removeAttribute('rel');
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

  /* ------------------------------------------------------------ endereço limpo antes de medir
     Lê o fragmento (nome, cidade, nicho, plano, utm_*) e a volta do Mercado Pago (query) UMA vez e
     reescreve o endereço sem nome, cidade nem parâmetros do pagamento. As páginas usam ENTRADA. */
  var PARAMS_MP = ['collection_id', 'collection_status', 'payment_id', 'status', 'external_reference', 'payment_type', 'merchant_order_id', 'preference_id', 'site_id', 'processing_mode', 'merchant_account_id'];
  var ENTRADA = { frag: lerFragmento(''), query: {}, retorno: null, ver: false, preferencias: false };
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
    ENTRADA.preferencias = location.hash === '#preferencias';
    try { ENTRADA.ver = new URLSearchParams(String(location.hash || '').replace(/^#/, '')).get('ver') === '1'; } catch (e) { ENTRADA.ver = false; }
    var mudou = false;
    PARAMS_MP.forEach(function (k) { if (q.has(k)) { q.delete(k); mudou = true; } });
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
    if (terceirosCarregados) revogarTerceiros(); else apagarCookiesMeta();
  }
  function montarConsentimento() {
    var caixa = $('#consentimento');
    if (!caixa) { if (consentimento()) carregarTerceiros(); return; }
    // O banner reserva o próprio espaço no fim da página: nada fica escondido atrás dele.
    var mostrar = function () { caixa.hidden = false; D.body.classList.add('com-consentimento'); D.body.style.setProperty('--altura-consentimento', (caixa.offsetHeight + 24) + 'px'); };
    var esconder = function () { caixa.hidden = true; D.body.classList.remove('com-consentimento'); };
    var decidir = function (sim) {
      var antes = consentimento();
      guarda.gravar(CHAVE_CONSENT, JSON.stringify({ versao: 1, analytics: true, pixel: sim, clarity: sim, em: new Date().toISOString() }));
      esconder(); aviso(caixa.getAttribute('data-salvo') || 'Preferência salva.');
      if (sim) { carregarTerceiros(); return; }
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
    // Home: o banner não cobre a primeira tela. Aparece quando o visitante passa do hero, fecha a prévia
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
    ['nome', 'cidade', 'uf', 'documento', 'endereco'].forEach(function (k) {
      var v = typeof e[k] === 'string' ? e[k].replace(/\s+/g, ' ').trim() : '';
      out[k] = /[\[{]|a informar/i.test(v) ? '' : v;           // marcador esquecido nunca vai para a tela
    });
    if (!out.nome) out.nome = 'Creat.MTT Studio';
    return out;
  }
  // [data-empresa="nome|cidade|uf"] recebe o valor; [data-empresa-opcional="documento|endereco"] aparece só com valor.
  function montarEmpresa() {
    var e = empresa();
    $$('[data-empresa]').forEach(function (x) { var v = e[x.getAttribute('data-empresa')]; if (v) x.textContent = v; });
    $$('[data-empresa-opcional]').forEach(function (x) {
      var v = e[x.getAttribute('data-empresa-opcional')];
      x.textContent = v ? (x.getAttribute('data-antes') || ', ') + v : ''; x.hidden = !v;
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

  /* ------------------------------------------------------------ moldura sem X-Frame-Options
     A hospedagem responde TODAS as páginas com X-Frame-Options: DENY (o _headers é ignorado), então
     nenhuma página nossa abre em iframe por endereço. O documento entra como blob, que não tem
     cabeçalho HTTP: mesma origem, <base> para os caminhos relativos, e o endereço pretendido em
     window.__creatLocal (a query não viaja em URL de blob; o fragmento viaja). Dentro do blob, link
     para página nossa abre na aba inteira e âncora rola a página, porque navegar a moldura para um
     endereço nosso voltaria a ser bloqueado. Se algo falhar, vale o caminho antigo (endereço direto). */
  function carregarNoQuadro(fr, url) {
    var u; try { u = new URL(url, location.href); } catch (e) { fr.src = url; return; }
    var direto = function () { try { fr.contentWindow.location.replace(u.href); } catch (e) { fr.src = u.href; } };
    if (!W.fetch || !W.Blob || !W.URL || !URL.createObjectURL || u.origin !== location.origin || location.protocol === 'file:') { direto(); return; }
    fetch(u.origin + u.pathname, { credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw new Error('http'); return r.text(); }).then(function (html) {
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

  /* ------------------------------------------------------------ sede viva (home): janela + comanda
     A sede embutida (sede/?modo=demo) avisa por postMessage a etapa do ciclo de demonstração
     ({creatSede:1, tipo:'etapa', etapa:0..5}); a comanda acende o mesmo passo. Antes de a sede
     carregar (no celular, só sob toque), a comanda segue o mesmo relógio da sede (6 s; 9 s com
     movimento reduzido). A página manda à sede só {tipo:'marca'} (nome fictício ou o do próprio
     visitante, nunca para a rede) e {tipo:'visivel'} para pausar o desenho fora da tela. */
  var ESTEIRA_AGORA = ['Nimbus organiza o pedido', 'Verbo escreve os textos e Paleta escolhe as cores', 'Pixel monta o site',
    'Lupa testa no celular e Muralha confere a segurança', 'Trilho publica o site', 'Site no ar. Pode abrir.'];
  var ESTEIRA_ULTIMA = ESTEIRA_AGORA.length - 1;     // = DEMO_ETAPAS.length da sede (5 etapas + tudo feito)
  function montarSedeViva(sec, opc) {
    opc = opc || {};
    var janela = sec && $('#janela-sede', sec), est = sec && $('#esteira', sec), grupo = sec && $('[data-sede-marcas]', sec);
    if (!janela || !est || !grupo) return;
    var link = $('[data-esteira-abrir]', est), linkSr = $('[data-esteira-abrir-sr]', est);
    var nomeEl = $('[data-esteira-nome]', est), agoraEl = $('[data-esteira-agora]', est), barra = $('[data-esteira-barra]', est);
    var itens = $$('.esteira-lista li', est), botao = $('[data-ver-ao-vivo]', janela);
    var fr = null, viaSede = false, esperandoSede = false, visivel = false, relogio = 0, etapa = 0, manual = false, seuNome = '';
    var PASSO = MOV_REDUZIDO.matches ? 9000 : 6000;
    var ALVO = location.origin && location.origin !== 'null' ? location.origin : '*';
    var atual = { marca: '', seu: false };

    function pintar(k) {
      etapa = k; est.setAttribute('data-etapa', String(k));
      itens.forEach(function (li) {
        var j = +li.getAttribute('data-passo'), st = j < k ? 'feito' : j === k ? 'agora' : 'fila';
        li.setAttribute('data-estado', st);
        if (st === 'agora') li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        var t = $('[data-st]', li); if (t) t.textContent = st === 'fila' ? 'na fila' : st;
      });
      agoraEl.textContent = ESTEIRA_AGORA[k] || '';
      barra.style.setProperty('--progresso', Math.round(k / ESTEIRA_ULTIMA * 100) + '%');
    }
    function parar() { clearInterval(relogio); relogio = 0; }
    function andar() {
      parar();
      if (viaSede || esperandoSede || !visivel || D.hidden) return;
      relogio = setInterval(function () { pintar((etapa + 1) % (ESTEIRA_ULTIMA + 1)); }, PASSO);
    }
    function pronta() { return !!(fr && fr.contentWindow && fr.getAttribute('data-pronta') === '1'); }
    function paraSede(msg) {
      if (!pronta()) return;
      msg.creatSede = 1;
      try { fr.contentWindow.postMessage(msg, ALVO); } catch (e) {}
    }
    function escolher(btn) {
      if (!btn) return;
      $$('.chip', grupo).forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); });
      var seu = btn.hasAttribute('data-seu');
      atual = { marca: seu ? seuNome : btn.getAttribute('data-marca') || '', seu: seu };
      nomeEl.textContent = atual.marca;
      var legMarca = $('[data-legenda-marca]', janela);
      if (legMarca) legMarca.textContent = seu ? 'O nome do seu negócio na fachada, só neste aparelho.' : 'Nome fictício na fachada.';
      est.classList.remove('trocou'); void est.offsetWidth; est.classList.add('trocou');
      if (seu) { link.firstChild.textContent = 'Ver a prévia do seu site'; link.setAttribute('href', '#porta'); linkSr.textContent = ''; }
      else {
        link.firstChild.textContent = 'Abrir o site pronto';
        link.setAttribute('href', btn.getAttribute('data-site'));
        linkSr.textContent = ': ' + atual.marca + ' (site-demonstração, nome fictício)';
      }
      pintar(0);
      if (pronta()) { viaSede = true; parar(); paraSede({ tipo: 'marca', marca: atual.marca, reiniciar: true }); }
      else andar();
    }
    $$('.chip', grupo).forEach(function (b) { b.addEventListener('click', function () { manual = true; escolher(b); }); });
    link.addEventListener('click', function (e) {
      if (atual.seu && opc.abrirSeu) { e.preventDefault(); opc.abrirSeu(); }
    });

    // chip com o nome do próprio visitante (digitado no hero; fica só neste aparelho e só vai à sede por postMessage/fragmento)
    function conferirSeu() {
      var s = opc.seu ? opc.seu() : null, chip = $('[data-seu]', grupo);
      var n = s && s.n && s.k ? cortar28(s.n) : '';
      if (!n) {
        if (chip) { var era = chip.getAttribute('aria-pressed') === 'true'; grupo.removeChild(chip); if (era) escolher($('.chip', grupo)); }
        seuNome = ''; return;
      }
      var mudou = n !== seuNome; seuNome = n;
      if (!chip) {
        chip = el('button', { class: 'chip chip-seu', type: 'button', 'aria-pressed': 'false', 'data-seu': '' });
        chip.addEventListener('click', function () { manual = true; escolher(chip); });
        grupo.insertBefore(chip, grupo.firstChild);
      }
      chip.textContent = n;
      chip.appendChild(el('span', { class: 'so-leitor' }, ' (o seu negócio)'));
      if (!manual || (mudou && chip.getAttribute('aria-pressed') === 'true')) escolher(chip);
    }

    function abrir() {
      if (fr) return;
      var carregada = atual.marca;
      // enquanto a sede carrega, a comanda segura o passo atual; a sede começa nesse mesmo passo (?etapa=),
      // então a comanda nunca volta atrás. Trocar de negócio continua recomeçando do zero, de propósito.
      esperandoSede = true; parar();
      fr = carregarSede(janela, atual.seu ? seuNome : '', true, function () {
        esperandoSede = false; viaSede = true; parar();   // daqui em diante quem dita o passo é a sede
        fr.setAttribute('data-pronta', '1');
        var dica = $('[data-legenda-dica]', janela); if (dica) { dica.className = ''; dica.textContent = ' Arraste para girar a ilha e toque num personagem.'; }
        paraSede({ tipo: 'visivel', visivel: visivel });
        if (atual.marca !== carregada) { viaSede = true; parar(); paraSede({ tipo: 'marca', marca: atual.marca, reiniciar: true }); }
      }, atual.seu ? '' : atual.marca, etapa);
    }
    if (botao) botao.addEventListener('click', abrir);
    W.addEventListener('message', function (ev) {
      if (!fr || ev.source !== fr.contentWindow || !(ev.origin === location.origin || ev.origin === 'null')) return;
      var d = ev.data;
      if (!d || d.creatSede !== 1 || d.tipo !== 'etapa' || typeof d.etapa !== 'number' || d.etapa % 1 || d.etapa < 0 || d.etapa > ESTEIRA_ULTIMA) return;
      viaSede = true; parar(); pintar(d.etapa);
      janela.setAttribute('data-sede-pronta', '');   // a sede respondeu: o selo DEMONSTRAÇÃO dela está na tela, o da janela sai
    });
    if ('IntersectionObserver' in W) {
      var vio = new IntersectionObserver(function (ents) {
        var v = ents.some(function (e) { return e.isIntersecting; });
        if (v === visivel) return;
        visivel = v;
        if (v) conferirSeu();
        if (v && ehDesktop()) abrir();
        paraSede({ tipo: 'visivel', visivel: v });
        andar();
      }, { rootMargin: '200px 0px' });
      vio.observe(sec);
    } else { visivel = true; }
    D.addEventListener('visibilitychange', andar);
    escolher($('.chip[aria-pressed="true"]', grupo) || $('.chip', grupo));
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
    // A home nunca guarda nome ou cidade no endereço (Pixel e Clarity podem ler a URL depois do aceite):
    // iniciar() já leu o fragmento vindo de /abrir/ ou /previa/ e limpou o endereço (limparEndereco).
    var hashIni = ENTRADA.frag;
    utmAtual = ENTRADA.query; if (!Object.keys(utmAtual).length) utmAtual = hashIni.utm;

    var form = $('#form-abrir'), campoNome = $('#nome'), campoCidade = $('#cidade');
    var caixaNome = campoNome.closest('.campo'), erroNome = $('#nome-erro'), erroNicho = $('#nicho-erro');
    var nichoQ = q.get('nicho'); if (nichoQ === 'salão' || nichoQ === 'estetica') nichoQ = 'salao';
    var nichoIni = NICHOS.indexOf(nichoQ) !== -1 ? nichoQ : hashIni.k;
    if (nichoIni) { var r0 = $('input[name="nicho"][value="' + nichoIni + '"]'); if (r0) r0.checked = true; }
    if (hashIni.n) campoNome.value = hashIni.n;
    if (hashIni.c) campoCidade.value = hashIni.c;
    function contarNome() { var cg = $('#contador-giz'); if (cg) cg.textContent = limparNome(campoNome.value).length + ' de 40'; }
    contarNome();   // nome preenchido pelo código (volta de /abrir/) também atualiza o "X de 40"

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
      carregarNoQuadro(frame, urlPreviaAtual);
      if (!history.state || !history.state.previa) history.pushState({ previa: 1 }, '', location.pathname + location.search + '#previa');
      requestAnimationFrame(function () { previa.classList.add('aberta'); $('#previa-fechar').focus(); });
      evento('previa_gerada', { nicho: s.k });
      pixelViewContent(s.k);
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
      // InitiateCheckout não sai daqui: só no clique em pagar de /abrir/, com o valor cobrado.
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
    if (!est.plano) est.plano = 'vitrine';
    utmAtual = est.utm;
    if (!Object.keys(utmAtual).length) utmAtual = lerOrigem() || (salvo ? origemParaUtm(salvo.origem) : {});
    est.utm = utmAtual;
    var f = $('#form-pedido');
    $('#abrir-titulo').textContent = est.n ? 'Falta pouco para abrir a ' + est.n + '.' : 'Falta pouco para abrir o seu negócio.';
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
      var algumOk = false;
      botoes.forEach(function (b) { if (aplicarCheckout(b, escolha.r ? escolha.r.chave : precos.linkChave, escolha.r ? escolha.r.link : null)) algumOk = true; });
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
    var checkoutContado = false;
    botoes.forEach(function (b) {
      b.addEventListener('click', function (e) {
        if (b.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
        if (b.getAttribute('data-link-ok') !== '1') return;   // sem link de pagamento: o botão leva ao WhatsApp do suporte
        var r = lerFormPedido(f, est);
        if (!r.ok) { e.preventDefault(); resumoErros(f, r.faltam); return; }
        resumoErros(f, 0);
        var s = salvarPedido(r.dados, est, salvo && salvo.negocio === r.dados.negocio ? salvo.id : null);
        if (!s.gravou) aviso('Este navegador não deixa guardar dados no aparelho, por isso a próxima página vai pedir os campos de novo. O pedido funciona do mesmo jeito.');
        evento('checkout_iniciado', { plano: r.dados.plano, nicho: r.dados.nicho });
        // um por carga da página: clique duplo ou voltar do Mercado Pago e clicar de novo na mesma carga não duplica
        if (escolha && !checkoutContado) { checkoutContado = true; pixelEvento('InitiateCheckout', { value: escolha.total, currency: 'BRL' }); }
      });
    });
    f.addEventListener('submit', function (e) { e.preventDefault(); });
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
    var aplicar = function () { barra.classList.toggle('recolhida', naTela || digitando); D.body.classList.toggle('com-barra-pagar', !barra.hidden); };
    if (secao && 'IntersectionObserver' in W) new IntersectionObserver(function (ents) { naTela = ents.some(function (x) { return x.isIntersecting; }); aplicar(); }, { threshold: 0.2 }).observe(secao);
    D.addEventListener('focusin', function (e) { digitando = campo(e.target); aplicar(); });
    D.addEventListener('focusout', function () { setTimeout(function () { digitando = campo(D.activeElement); aplicar(); }, 0); });
    if ('MutationObserver' in W) new MutationObserver(aplicar).observe(barra, { attributes: true, attributeFilter: ['hidden'] });
    aplicar();
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
    var lead = $('#obrigado-lead');
    if (lead && ENTRADA.retorno && ENTRADA.retorno.aprovado) lead.textContent = 'O Mercado Pago aprovou o pagamento. Envie o pedido abaixo; a equipe confere e começa.';
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
      esquecerTudo(); aviso('Pronto. Tudo o que este site guardou neste aparelho foi apagado.');
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
    // Campo de empresa vazio some com a vírgula que o antecede; marcador sem valor vira vazio, nunca "(a informar)".
    var emp = empresa();
    var trocar = function (s) {
      return s.replace(/,\s*\{\{empresa\.(documento|endereco)\}\}/g, function (m, k) { return emp[k] ? ', ' + emp[k] : ''; })
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
    montarSom();
    try {
      if (PAGINA === 'home') paginaHome();
      else if (PAGINA === 'abrir') paginaAbrir();
      else if (PAGINA === 'obrigado') paginaObrigado();
      else if (PAGINA === 'bastidores') paginaBastidores();
      else if (PAGINA === 'documento') paginaDocumento();
    } finally {
      montarConsentimento();
      if (PAGINA === 'obrigado') medirCompra(ENTRADA.retorno);
      iniciarPosthog();
      D.documentElement.classList.add('js-pronto');
    }
  }

  W.Vitrine = {
    lerPrecos: lerPrecos, lerFragmento: lerFragmento, montarFragmento: montarFragmento, filtrarPropriedades: filtrarPropriedades,
    beforeSend: beforeSend, normalizarWhats: normalizarWhats, textoPedido: textoPedido, fresco: fresco, raiz: RAIZ,
    lerRetornoMP: lerRetornoMP, medirCompra: medirCompra, filtrarPixel: filtrarPixel, lerOrigem: lerOrigem, guardarOrigem: guardarOrigem,
    consentimento: consentimento, esquecerTudo: esquecerTudo, limparVencidos: limparVencidos
  };
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
