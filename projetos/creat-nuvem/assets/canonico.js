/* =====================================================================
   Porta Aberta · canonico.js (Pixel, pacote H1, 11/11/2026, 2ª rodada)
   O endereço único da vitrine. Carregado no <head>, SEM defer, logo
   depois do checkout.config.js (que traz CREAT_ENDERECO) e antes de
   qualquer outro script, folha de estilo ou terceiro.

   No endereço ANTIGO (lista CREAT_ENDERECO.antigos, host comparado sem
   o ponto final):
   - leva a pessoa ao mesmo caminho, consulta e fragmento no canônico,
     com location.replace (sem entrada nova no histórico);
   - leva o MÍNIMO no fragmento de transição
     #m=v1.<base64url de JSON pequeno>[~<fragmento original>]:
     o pedido (creat:pedido:v1, id, segredo e o enxuto) só até o prazo
     PRAZO_PEDIDO (20/11/2026; depois disso pedido novo já nasce no
     canônico) e, da escolha de medição, só a RECUSA. Aceite nunca viaja
     por endereço: o canônico pergunta de novo. Nada é apagado aqui;
   - o salto leva Referer só com a origem do antigo (meta referrer
     "origin"): é a prova, no canônico, de que veio do salto verdadeiro;
   - avisa a vitrine e a prévia (CreatCanonico.mudando) para não medir,
     contar, gravar nem pedir consentimento enquanto a troca acontece;
   - esconde a página até trocar. Se o canônico não responder em 2,5 s,
     cancela a navegação pendente (window.stop), marca a aba e recarrega
     o antigo, que então abre inteiro e fica nesta aba. Chamar
     location.replace durante a leitura do <head> interrompe a leitura do
     documento antigo; só mostrar a página deixaria a tela sem corpo, por
     isso a recarga. Erro aqui dentro mostra a página na hora.
     Limite: se a navegação FALHA (DNS, conexão recusada, certificado),
     o navegador mostra a página de erro dele; o remédio é esvaziar a
     lista de antigos e publicar (docs/DOMINIO.md).

   No endereço CANÔNICO:
   - lê o fragmento de transição e valida com rigor (formato, tamanho,
     chaves exatas, falha fechada). Só aplica se document.referrer for
     exatamente a origem de um antigo (link colado, enviado ou vindo de
     outro site é ignorado). O pedido entra só onde não há pedido (o do
     canônico vence); a recusa entra onde não há escolha ou onde o
     aceite daqui é mais velho que ela. Depois devolve o fragmento
     original com history.replaceState, ANTES de qualquer medição ou
     terceiro. O segredo sai da barra, mas o endereço de chegada continua
     no histórico do navegador e em performance.getEntriesByType
     ('navigation')[0].name enquanto a página viver. Conferido em
     11/11/2026 nos arquivos que carregam: fbevents.js e a configuração do
     Pixel, PostHog 1.447.3 (sem gravação de sessão) e os dois scripts que
     o Base44 injeta não leem essa entrada. O Clarity está desligado (ID de
     exemplo) e só iria na home: ligar exige conferir de novo. O prazo do
     pedido fecha essa janela.

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
  var CHAVE_PEDIDO = 'creat:pedido:v1', CHAVE_CONSENT = 'creat:consentimento', MARCA = 'creat:canonico-ficou';
  var D30 = 30 * 86400, D180 = 180 * 86400, FOLGA = 300;      // segundos
  var MAX_B64 = 720;                                         // pacote real: perto de 400
  var PREFIXO = 'm=v1.';
  // O pedido atravessa até o fim de 20/11/2026 (Bahia): ato de 13/11 + os 7 dias de vida do pedido guardado.
  // CREAT_ENDERECO.prazo_pedido (data ISO) troca o prazo sem mexer aqui.
  var PRAZO_PEDIDO = Date.parse('2026-11-20T23:59:59-03:00');
  // 2,5 s sem resposta do canônico: volta ao antigo inteiro. 8 s: última rede de proteção, se a recarga não acontecer.
  var TEMPO_MOSTRAR = 2500, TEMPO_FICAR = 8000;

  var estado = { mudando: false, destino: null, recebido: null };

  function agoraS() { return Math.floor(Date.now() / 1000); }
  function tem(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function objetoPuro(o) { return !!o && typeof o === 'object' && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype; }
  function soChaves(o, permitidas) { for (var k in o) if (tem(o, k) && permitidas.indexOf(k) === -1) return false; return true; }
  function ler(ls, k) { try { return ls.getItem(k); } catch (e) { return null; } }
  function lerJSON(ls, k) { var v = ler(ls, k); if (v === null) return null; try { return JSON.parse(v); } catch (e) { return undefined; } }
  function semPonto(h) { return String(h || '').toLowerCase().replace(/\.$/, ''); }

  /* ---------------------------------------------------------------- configuração */
  // Devolve { origem: 'https://host', host, antigos: [...], prazo: ms } ou null (sem configuração = nada acontece).
  function configuracao(cfg) {
    if (!cfg || typeof cfg.canonico !== 'string' || !Array.isArray(cfg.antigos)) return null;
    var u; try { u = new URL(cfg.canonico); } catch (e) { return null; }
    if (u.protocol !== 'https:' || u.port || u.username || u.password || (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) return null;
    var host = semPonto(u.hostname);
    var antigos = cfg.antigos.filter(function (h) { return typeof h === 'string' && /^[a-z0-9.-]{1,253}$/.test(h) && semPonto(h) !== host; }).map(semPonto);
    var prazo = typeof cfg.prazo_pedido === 'string' ? Date.parse(cfg.prazo_pedido) : NaN;
    return { origem: 'https://' + host, host: host, antigos: antigos, prazo: isNaN(prazo) ? PRAZO_PEDIDO : prazo };
  }
  function prazoDe(cfg) { return cfg && typeof cfg.prazo === 'number' ? cfg.prazo : PRAZO_PEDIDO; }

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
  // Consentimento: só a recusa (x: false) e o dia dela (t). Aceite no pacote derruba o pacote inteiro.
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
    return objetoPuro(c) && soChaves(c, CHAVES_C) && c.x === false && inteiroEntre(c.t, agora - D180, agora + FOLGA);
  }
  function pacoteValido(o, agora, prazo) {
    if (!objetoPuro(o) || !soChaves(o, ['v', 'p', 'c']) || o.v !== 1) return false;
    if (!tem(o, 'p') && !tem(o, 'c')) return false;
    if (tem(o, 'p') && (agora * 1000 > (prazo || PRAZO_PEDIDO) || !pedidoCurtoValido(o.p, agora))) return false;
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
    // só a recusa viaja; aceite fica no antigo e o canônico pergunta de novo
    if (!objetoPuro(c) || c.versao !== 1 || c.pixel !== false) return null;
    var r = { x: false, t: Math.floor(Date.parse(c.em) / 1000) };
    return consentCurtoValido(r, agora) ? r : null;
  }
  function montarPacote(ls, agora, prazo) {
    agora = agora || agoraS();
    var o = { v: 1 };
    if (agora * 1000 <= (prazo || PRAZO_PEDIDO)) { var p = pedidoParaCurto(lerJSON(ls, CHAVE_PEDIDO), agora); if (p) o.p = p; }
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
    var pacote = ls ? montarPacote(ls, agora, prazoDe(cfg)) : '';
    var frag = pacote ? pacote + (orig ? '~' + orig : '') : orig;
    return cfg.origem + loc.pathname + loc.search + (frag ? '#' + frag : '');
  }

  /* ---------------------------------------------------------------- lado canônico: receber */
  // Devolve { pacote: objeto válido | null, original: 'fragmento sem #' } ou null quando não é transição.
  function lerTransicao(hash, agora, prazo) {
    var h = String(hash || '').replace(/^#/, '');
    if (h.indexOf('m=') !== 0) return null;
    var i = h.indexOf('~'), corpo = i === -1 ? h : h.slice(0, i), orig = i === -1 ? '' : h.slice(i + 1);
    var r = { pacote: null, original: orig };
    if (corpo.indexOf(PREFIXO) !== 0) return r;
    var b64 = corpo.slice(PREFIXO.length);
    if (!b64 || b64.length > MAX_B64 || !/^[A-Za-z0-9_-]+$/.test(b64)) return r;
    var o; try { o = JSON.parse(deB64(b64)); } catch (e) { return r; }
    if (pacoteValido(o, agora || agoraS(), prazo)) r.pacote = o;
    return r;
  }
  // Veio do salto verdadeiro: o Referer é exatamente a origem de um antigo (o salto manda só a origem).
  function veioDoAntigo(cfg, referrer) {
    if (!cfg) return false;
    var ref = String(referrer || ''), aceitos = ['https://' + cfg.host + './'];
    cfg.antigos.forEach(function (h) { aceitos.push('https://' + h + '/', 'https://' + h + './'); });
    return aceitos.indexOf(ref) !== -1;
  }
  function pedidoDoPacote(p) {
    var o = { id: p.i, segredo: p.s, plano: p.pl, nicho: p.k, negocio: p.n, cidade: tem(p, 'c') ? p.c : '',
      produto: tem(p, 'pr') ? p.pr : null, valor: tem(p, 'va') ? p.va : null, praca: tem(p, 'pc') ? p.pc : null,
      origem: 'direto', paleta: 1, salvo_em: new Date(p.t * 1000).toISOString(), status: p.st, enxuto: true,
      registrado_em: new Date().toISOString(), veio_do_endereco_antigo: true };
    return o;
  }
  // O do canônico vence: o pedido só entra onde não há pedido utilizável.
  function vagoPedido(ls) { var v = lerJSON(ls, CHAVE_PEDIDO); return v === null || v === undefined || !objetoPuro(v) || typeof v.id !== 'string'; }
  function consentAtual(ls) { var v = lerJSON(ls, CHAVE_CONSENT); return objetoPuro(v) && v.versao === 1 && typeof v.pixel === 'boolean' ? v : null; }
  function aplicar(pacote, ls, doAntigo) {
    var feito = { pedido: false, consentimento: false };
    if (!pacote || !ls || doAntigo !== true) return feito;
    try {
      if (pacote.p && vagoPedido(ls)) { ls.setItem(CHAVE_PEDIDO, JSON.stringify(pedidoDoPacote(pacote.p))); feito.pedido = true; }
    } catch (e) {}
    try {
      // recusar nunca vira aceitar: a recusa do antigo vale onde não há escolha ou onde o aceite daqui é mais velho
      if (pacote.c && pacote.c.x === false) {
        var atual = consentAtual(ls), em = atual ? Date.parse(atual.em) : NaN;
        if (!atual || (atual.pixel === true && (isNaN(em) || em <= pacote.c.t * 1000))) {
          ls.setItem(CHAVE_CONSENT, JSON.stringify({ versao: 1, analytics: true, pixel: false, clarity: false, em: new Date(pacote.c.t * 1000).toISOString() }));
          feito.consentimento = true;
        }
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
  // Marca da aba: a troca já falhou uma vez aqui, então o antigo abre inteiro e não tenta de novo nesta aba.
  function marcado(W) {
    try { if (W.sessionStorage.getItem(MARCA) === '1') return true; } catch (e) {}
    try { return W.name === MARCA; } catch (e) { return false; }
  }
  function marcar(W) {
    try { W.sessionStorage.setItem(MARCA, '1'); if (W.sessionStorage.getItem(MARCA) === '1') return true; } catch (e) {}
    try { W.name = MARCA; return W.name === MARCA; } catch (e) { return false; }
  }
  // O canônico não respondeu a tempo: cancela a navegação pendente e recarrega o antigo inteiro.
  function desistir(W) {
    if (!estado.mudando) return;
    if (!marcar(W)) { ficar(W); return; }        // sem marca, recarregar voltaria a trocar: só mostra
    try { W.stop(); } catch (e) {}
    mostrar(W);
    try { W.location.reload(); } catch (e) { ficar(W); }
  }
  function localStorageDe(W) { try { return W.localStorage; } catch (e) { return null; } }
  function rodar(W) {
    var cfg = configuracao(W.CREAT_ENDERECO);
    if (!cfg) return;
    try { if (W.top !== W) return; } catch (e) { return; }   // prévia e sede em moldura: nunca
    var loc = W.location, host = String(loc.hostname || '').toLowerCase();
    if (host === cfg.host) {
      if (loc.protocol !== 'https:') return;
      var tr = lerTransicao(loc.hash, agoraS(), cfg.prazo);
      if (!tr) return;
      var ref = ''; try { ref = String(W.document.referrer || ''); } catch (e) {}
      estado.recebido = aplicar(tr.pacote, localStorageDe(W), veioDoAntigo(cfg, ref));
      // o fragmento de transição sai da barra antes de qualquer medição ou terceiro (Referer, Pixel, PostHog)
      try { W.history.replaceState(W.history.state, '', loc.pathname + loc.search + (tr.original ? '#' + tr.original : '')); } catch (e) {}
      return;
    }
    // antigo ou o próprio canônico com ponto final: vai ao canônico sem ponto
    var norm = semPonto(host);
    if ((norm !== cfg.host && cfg.antigos.indexOf(norm) === -1) || (loc.protocol !== 'https:' && loc.protocol !== 'http:')) return;
    if (marcado(W)) return;
    var alvo = destino(cfg, loc, localStorageDe(W));
    estado.mudando = true; estado.destino = cfg.origem + loc.pathname;
    esconder(W);
    // o salto leva no Referer só a origem do antigo (nunca caminho, consulta nem fragmento): é a prova do salto
    try { var m = W.document.createElement('meta'); m.name = 'referrer'; m.content = 'origin'; (W.document.head || W.document.documentElement).appendChild(m); } catch (e) {}
    W.setTimeout(function () { desistir(W); }, TEMPO_MOSTRAR);
    W.setTimeout(function () { ficar(W); }, TEMPO_FICAR);
    W.location.replace(alvo);
  }

  return {
    estado: estado, rodar: rodar, mostrar: mostrar, ficar: ficar, configuracao: configuracao, veioDoAntigo: veioDoAntigo,
    montarPacote: montarPacote, destino: destino, lerTransicao: lerTransicao, aplicar: aplicar, pacoteValido: pacoteValido,
    paraB64: paraB64, deB64: deB64, MAX_B64: MAX_B64, TEMPO_MOSTRAR: TEMPO_MOSTRAR, TEMPO_FICAR: TEMPO_FICAR,
    PRAZO_PEDIDO: PRAZO_PEDIDO, MARCA: MARCA,
    PLANOS: PLANOS, NICHOS: NICHOS, PRACAS: PRACAS, CATALOGO: CATALOGO
  };
});
