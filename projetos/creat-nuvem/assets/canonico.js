/* =====================================================================
   Porta Aberta · canonico.js (Pixel, pacote H1, 11/11/2026)
   O endereço único da vitrine. Carregado no <head>, SEM defer, logo
   depois do checkout.config.js (que traz CREAT_ENDERECO) e antes de
   qualquer outro script, folha de estilo ou terceiro.

   No endereço ANTIGO (lista CREAT_ENDERECO.antigos):
   - leva a pessoa ao mesmo caminho, consulta e fragmento no canônico,
     com location.replace (sem entrada nova no histórico);
   - se há pedido (creat:pedido:v1) ou escolha de medição (creat:consentimento)
     neste aparelho, leva o MÍNIMO no fragmento de transição
     #m=v1.<base64url de JSON pequeno>[~<fragmento original>]. Fragmento
     nunca vai ao servidor nem no Referer. Nada é apagado aqui: se a troca
     falhar, a pessoa continua com o pedido no antigo;
   - avisa a vitrine e a prévia (CreatCanonico.mudando) para não medir,
     contar, gravar nem pedir consentimento enquanto a troca acontece;
   - esconde a página até trocar. Se a troca não acontecer em 2,5 s, mostra
     a página; em 8 s libera a vitrine (evento creat:canonico-ficou). Erro
     aqui dentro mostra a página na hora: nunca tela branca.

   No endereço CANÔNICO:
   - lê o fragmento de transição, valida com rigor (formato, tamanho,
     chaves exatas, falha fechada), grava só o que ainda não existe neste
     aparelho (o do canônico vence) e devolve o fragmento original com
     history.replaceState, ANTES de qualquer medição ou terceiro.

   Em qualquer outro lugar (localhost, file://, prévia em moldura, host de
   teste) não faz nada. Sem laço: o canônico nunca redireciona.
   ===================================================================== */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (raiz) {
    raiz.CreatCanonico = api.estado;
    try { api.rodar(raiz); } catch (e) { api.ficar(raiz); api.mostrar(raiz); }
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // As mesmas listas de assets/vitrine.js (o teste confere que batem).
  var PLANOS = ['aberto', 'vitrine', 'aberto_anual', 'vitrine_anual'];
  var NICHOS = ['barbearia', 'salao', 'academia'];
  var PRACAS = ['feira', 'salvador-rms', 'fortaleza', 'recife', 'petrolina-juazeiro', 'aracaju'];
  var CATALOGO = { 'pa-abertura-inauguracao-2026-11': 297, 'pa-abertura-2026-11': 497, 'pa-teste': 1 };
  var STATUS = ['enviado', 'registrado', 'vencido'];
  var RE_ID = /^PA-[0-9A-Z]{10}$/, RE_SEGREDO = /^[A-Za-z0-9_-]{21}[AQgw]$/;
  var RE_NOME = /^[\p{L}\p{N} &.'-]{1,40}$/u, RE_CIDADE = /^[\p{L}\p{N} .'-]{1,40}$/u;
  var CHAVE_PEDIDO = 'creat:pedido:v1', CHAVE_CONSENT = 'creat:consentimento';
  var D30 = 30 * 86400, D180 = 180 * 86400, FOLGA = 300;      // segundos
  var MAX_B64 = 720;                                         // pacote real: perto de 400
  var PREFIXO = 'm=v1.';
  // Página escondida no máximo 2,5 s (nunca tela vazia por muito tempo); vitrine parada até 8 s, para não medir
  // nem contar no antigo enquanto a troca ainda está a caminho numa rede lenta.
  var TEMPO_MOSTRAR = 2500, TEMPO_FICAR = 8000;

  var estado = { mudando: false, destino: null, recebido: null };

  function agoraS() { return Math.floor(Date.now() / 1000); }
  function tem(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function objetoPuro(o) { return !!o && typeof o === 'object' && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype; }
  function soChaves(o, permitidas) { for (var k in o) if (tem(o, k) && permitidas.indexOf(k) === -1) return false; return true; }
  function ler(ls, k) { try { return ls.getItem(k); } catch (e) { return null; } }
  function lerJSON(ls, k) { var v = ler(ls, k); if (v === null) return null; try { return JSON.parse(v); } catch (e) { return undefined; } }

  /* ---------------------------------------------------------------- configuração */
  // Devolve { origem: 'https://host', host, antigos: [...] } ou null (sem configuração = nada acontece).
  function configuracao(cfg) {
    if (!cfg || typeof cfg.canonico !== 'string' || !Array.isArray(cfg.antigos)) return null;
    var u; try { u = new URL(cfg.canonico); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.port || u.username || u.password || (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) return null;
    var host = u.hostname.toLowerCase();
    var antigos = cfg.antigos.filter(function (h) { return typeof h === 'string' && /^[a-z0-9.-]{1,253}$/.test(h) && h !== host; });
    return { origem: 'https://' + host, host: host, antigos: antigos };
  }

  /* ---------------------------------------------------------------- base64url de texto UTF-8 */
  function paraB64(texto) {
    var bin = unescape(encodeURIComponent(texto));
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function deB64(b64) {
    var s = b64.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return decodeURIComponent(escape(atob(s)));
  }

  /* ---------------------------------------------------------------- o pacote (validação única, nos dois lados) */
  // Pedido em formato curto: i id, s segredo, pl plano, k nicho, n negócio, c cidade, pr produto, va valor,
  // pc praça, st status, t salvo_em (segundos). Só o que /obrigado/ precisa para achar o pedido no servidor e
  // desenhar a tela. Nunca responsável, WhatsApp, e-mail, endereço, horários, prévia ou origem.
  var CHAVES_P = ['i', 's', 'pl', 'k', 'n', 'c', 'pr', 'va', 'pc', 'st', 't'];
  var CHAVES_C = ['x', 't'];
  function inteiroEntre(v, min, max) { return typeof v === 'number' && Math.floor(v) === v && v >= min && v <= max; }
  function pedidoCurtoValido(p, agora) {
    if (!objetoPuro(p) || !soChaves(p, CHAVES_P)) return false;
    if (!RE_ID.test(p.i) || typeof p.s !== 'string' || !RE_SEGREDO.test(p.s)) return false;
    if (PLANOS.indexOf(p.pl) === -1 || NICHOS.indexOf(p.k) === -1) return false;
    if (typeof p.n !== 'string' || p.n !== p.n.trim() || !RE_NOME.test(p.n)) return false;
    if (tem(p, 'c') && (typeof p.c !== 'string' || p.c !== p.c.trim() || !RE_CIDADE.test(p.c))) return false;
    if (tem(p, 'pr') || tem(p, 'va')) { if (!tem(CATALOGO, p.pr) || CATALOGO[p.pr] !== p.va) return false; }
    if (tem(p, 'pc') && PRACAS.indexOf(p.pc) === -1) return false;
    if (STATUS.indexOf(p.st) === -1) return false;
    return inteiroEntre(p.t, agora - D30, agora + FOLGA);
  }
  function consentCurtoValido(c, agora) {
    return objetoPuro(c) && soChaves(c, CHAVES_C) && typeof c.x === 'boolean' && inteiroEntre(c.t, agora - D180, agora + FOLGA);
  }
  function pacoteValido(o, agora) {
    if (!objetoPuro(o) || !soChaves(o, ['v', 'p', 'c']) || o.v !== 1) return false;
    if (!tem(o, 'p') && !tem(o, 'c')) return false;
    if (tem(o, 'p') && !pedidoCurtoValido(o.p, agora)) return false;
    if (tem(o, 'c') && !consentCurtoValido(o.c, agora)) return false;
    return true;
  }

  /* ---------------------------------------------------------------- lado antigo: montar */
  function pedidoParaCurto(p, agora) {
    if (!objetoPuro(p)) return null;
    var t = Math.floor(Date.parse(p.salvo_em) / 1000);
    var c = { i: p.id, s: p.segredo, pl: p.plano, k: p.nicho, n: typeof p.negocio === 'string' ? p.negocio.trim() : p.negocio, st: STATUS.indexOf(p.status) !== -1 ? p.status : 'enviado', t: t };
    if (typeof p.cidade === 'string' && p.cidade.trim()) c.c = p.cidade.trim();
    if (p.produto !== null && p.produto !== undefined) { c.pr = p.produto; c.va = p.valor; }
    if (p.praca !== null && p.praca !== undefined) c.pc = p.praca;
    // falha fechada: campo opcional fora da regra sai; o essencial fora da regra derruba o pedido inteiro
    if (tem(c, 'c') && !RE_CIDADE.test(c.c)) delete c.c;
    if (tem(c, 'pr') && (!tem(CATALOGO, c.pr) || CATALOGO[c.pr] !== c.va)) { delete c.pr; delete c.va; }
    if (tem(c, 'pc') && PRACAS.indexOf(c.pc) === -1) delete c.pc;
    return pedidoCurtoValido(c, agora) ? c : null;
  }
  function consentParaCurto(c, agora) {
    if (!objetoPuro(c) || c.versao !== 1 || typeof c.pixel !== 'boolean') return null;
    var r = { x: c.pixel, t: Math.floor(Date.parse(c.em) / 1000) };
    return consentCurtoValido(r, agora) ? r : null;
  }
  function montarPacote(ls, agora) {
    agora = agora || agoraS();
    var o = { v: 1 };
    var p = pedidoParaCurto(lerJSON(ls, CHAVE_PEDIDO), agora); if (p) o.p = p;
    var c = consentParaCurto(lerJSON(ls, CHAVE_CONSENT), agora); if (c) o.c = c;
    return o.p || o.c ? PREFIXO + paraB64(JSON.stringify(o)) : '';
  }
  // Fragmento original, sem '#'. Se já chegou com um fragmento de transição (link copiado no meio da troca),
  // vale só o original de dentro dele: nunca empilha dois pacotes.
  function original(hash) {
    var h = String(hash || '').replace(/^#/, '');
    if (h.indexOf('m=') === 0) { var i = h.indexOf('~'); return i === -1 ? '' : h.slice(i + 1); }
    return h;
  }
  function destino(cfg, loc, ls, agora) {
    var orig = original(loc.hash);
    var pacote = ls ? montarPacote(ls, agora) : '';
    var frag = pacote ? pacote + (orig ? '~' + orig : '') : orig;
    return cfg.origem + loc.pathname + loc.search + (frag ? '#' + frag : '');
  }

  /* ---------------------------------------------------------------- lado canônico: receber */
  // Devolve { pacote: objeto válido | null, original: 'fragmento sem #' } ou null quando não é transição.
  function lerTransicao(hash, agora) {
    var h = String(hash || '').replace(/^#/, '');
    if (h.indexOf('m=') !== 0) return null;
    var i = h.indexOf('~'), corpo = i === -1 ? h : h.slice(0, i), orig = i === -1 ? '' : h.slice(i + 1);
    var r = { pacote: null, original: orig };
    if (corpo.indexOf(PREFIXO) !== 0) return r;
    var b64 = corpo.slice(PREFIXO.length);
    if (!b64 || b64.length > MAX_B64 || !/^[A-Za-z0-9_-]+$/.test(b64)) return r;
    var o; try { o = JSON.parse(deB64(b64)); } catch (e) { return r; }
    if (pacoteValido(o, agora || agoraS())) r.pacote = o;
    return r;
  }
  function pedidoDoPacote(p) {
    var o = { id: p.i, segredo: p.s, plano: p.pl, nicho: p.k, negocio: p.n, cidade: tem(p, 'c') ? p.c : '',
      produto: tem(p, 'pr') ? p.pr : null, valor: tem(p, 'va') ? p.va : null, praca: tem(p, 'pc') ? p.pc : null,
      origem: 'direto', paleta: 1, salvo_em: new Date(p.t * 1000).toISOString(), status: p.st, enxuto: true,
      registrado_em: new Date().toISOString(), veio_do_endereco_antigo: true };
    return o;
  }
  // O do canônico vence: só grava onde não há nada utilizável.
  function vagoPedido(ls) { var v = lerJSON(ls, CHAVE_PEDIDO); return v === null || v === undefined || !objetoPuro(v) || typeof v.id !== 'string'; }
  function vagoConsent(ls) { var v = lerJSON(ls, CHAVE_CONSENT); return v === null || v === undefined || !objetoPuro(v) || v.versao !== 1; }
  function aplicar(pacote, ls) {
    var feito = { pedido: false, consentimento: false };
    if (!pacote || !ls) return feito;
    try {
      if (pacote.p && vagoPedido(ls)) { ls.setItem(CHAVE_PEDIDO, JSON.stringify(pedidoDoPacote(pacote.p))); feito.pedido = true; }
    } catch (e) {}
    try {
      if (pacote.c && vagoConsent(ls)) {
        ls.setItem(CHAVE_CONSENT, JSON.stringify({ versao: 1, analytics: true, pixel: pacote.c.x, clarity: pacote.c.x, em: new Date(pacote.c.t * 1000).toISOString() }));
        feito.consentimento = true;
      }
    } catch (e) {}
    return feito;
  }

  /* ---------------------------------------------------------------- navegador */
  function esconder(W) { try { W.document.documentElement.style.setProperty('visibility', 'hidden', 'important'); } catch (e) {} }
  function mostrar(W) { try { W.document.documentElement.style.removeProperty('visibility'); } catch (e) {} }
  function ficar(W) {
    if (!estado.mudando) return;
    estado.mudando = false; mostrar(W);
    try { W.dispatchEvent(new Event('creat:canonico-ficou')); } catch (e) {}
  }
  function localStorageDe(W) { try { return W.localStorage; } catch (e) { return null; } }
  function rodar(W) {
    var cfg = configuracao(W.CREAT_ENDERECO);
    if (!cfg) return;
    try { if (W.top !== W) return; } catch (e) { return; }   // prévia e sede em moldura: nunca
    var loc = W.location, host = String(loc.hostname || '').toLowerCase();
    if (host === cfg.host) {
      if (loc.protocol !== 'https:') return;
      var tr = lerTransicao(loc.hash);
      if (!tr) return;
      estado.recebido = aplicar(tr.pacote, localStorageDe(W));
      // o fragmento de transição sai da barra antes de qualquer medição ou terceiro (Referer, Pixel, PostHog)
      try { W.history.replaceState(W.history.state, '', loc.pathname + loc.search + (tr.original ? '#' + tr.original : '')); } catch (e) {}
      return;
    }
    if (cfg.antigos.indexOf(host) === -1 || (loc.protocol !== 'https:' && loc.protocol !== 'http:')) return;
    var alvo = destino(cfg, loc, localStorageDe(W));
    estado.mudando = true; estado.destino = cfg.origem + loc.pathname;
    esconder(W);
    // o salto não leva Referer: o canônico não registra o antigo como "quem mandou a visita"
    try { var m = W.document.createElement('meta'); m.name = 'referrer'; m.content = 'no-referrer'; (W.document.head || W.document.documentElement).appendChild(m); } catch (e) {}
    W.setTimeout(function () { mostrar(W); }, TEMPO_MOSTRAR);
    W.setTimeout(function () { ficar(W); }, TEMPO_FICAR);
    W.location.replace(alvo);
  }

  return {
    estado: estado, rodar: rodar, mostrar: mostrar, ficar: ficar, configuracao: configuracao,
    montarPacote: montarPacote, destino: destino, lerTransicao: lerTransicao, aplicar: aplicar, pacoteValido: pacoteValido,
    paraB64: paraB64, deB64: deB64, MAX_B64: MAX_B64, TEMPO_MOSTRAR: TEMPO_MOSTRAR, TEMPO_FICAR: TEMPO_FICAR,
    PLANOS: PLANOS, NICHOS: NICHOS, PRACAS: PRACAS, CATALOGO: CATALOGO
  };
});
