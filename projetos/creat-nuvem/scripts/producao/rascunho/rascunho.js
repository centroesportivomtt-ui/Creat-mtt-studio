/*
 * scripts/producao/rascunho/rascunho.js · botão "Aprovar e colocar no ar" do rascunho (pacote 1C)
 *
 * Só existe no rascunho (/sites/<slug>-r-<id>/); o site final não carrega este arquivo.
 * Script clássico, sem dependência, sem estilo inline (a CSP do template não aceita).
 * Duas credenciais, as duas aceitas pela função aprovarRascunho do 1A (docs/PEDIDO-API.md 4.5):
 *  1. token do fragmento da URL (#t=<token>): o fragmento não vai ao servidor da hospedagem, nem no
 *     Referer, nem em log. Nunca é lido da query, nunca é gravado. Envia {slug, token}.
 *  2. sem #t=: o pedido que o navegador guardou em /abrir/ (localStorage 'creat:pedido:v1', mesma
 *     origem, mesmo aparelho), com id ^PA-[0-9A-Z]{10}$ e segredo ^[A-Za-z0-9_-]{21}[AQgw]$.
 *     SÓ LEITURA, dentro de try/catch: este arquivo nunca grava nem apaga nada no aparelho.
 *     Envia {slug, pedido_id, segredo}. É o caminho de quem pagou e abriu o rascunho por /obrigado/.
 * Sem nenhuma das duas: botão desligado e o caminho do suporte (Pedir ajuste).
 * POST <data-endpoint> (padrão /api/pa/aprovarRascunho, mesma origem).
 * Resposta 2xx com {ok:true} = aprovado. 4xx (menos 429) = link sem valor. Rede, 429 ou 5xx = tentar de novo.
 */
(function () {
  'use strict';
  var D = document, W = window;
  var faixa = D.querySelector('[data-rascunho-faixa]');
  var cfg = D.querySelector('script[data-rascunho]');
  if (!faixa || !cfg) return;
  var q = function (s) { return faixa.querySelector(s); };
  var btn = q('[data-rascunho-aprovar]'), conf = q('[data-rascunho-confirmar]'), sim = q('[data-rascunho-sim]'), nao = q('[data-rascunho-nao]');
  var titulo = q('[data-rascunho-titulo]'), status = q('[data-rascunho-status]');
  var endpoint = cfg.getAttribute('data-endpoint') || '/api/pa/aprovarRascunho';
  var slug = cfg.getAttribute('data-slug') || '';
  if (!btn || !conf || !sim || !nao || !titulo || !status) return;
  if (!/^\/[A-Za-z0-9_\/-]+$/.test(endpoint)) endpoint = '/api/pa/aprovarRascunho';

  /* altura real da faixa -> --rascunho-h (o topo do site desce essa altura e não fica escondido) */
  function medir() { D.documentElement.style.setProperty('--rascunho-h', Math.ceil(faixa.getBoundingClientRect().height) + 'px'); }
  medir();
  if ('ResizeObserver' in W) new W.ResizeObserver(medir).observe(faixa);
  else W.addEventListener('resize', medir);

  var RE_SEGREDO = /^[A-Za-z0-9_-]{21}[AQgw]$/, RE_PEDIDO = /^PA-[0-9A-Z]{10}$/;
  function token() {
    var m = /(?:^#|&)t=([A-Za-z0-9_-]{21}[AQgw])(?:&|$)/.exec(W.location.hash || '');
    return m ? m[1] : '';
  }
  /* pedido guardado neste aparelho: só leitura; qualquer problema (bloqueado, vazio, outro formato) = nada */
  function pedidoDoAparelho() {
    try {
      var bruto = W.localStorage.getItem('creat:pedido:v1');
      if (!bruto || bruto.length > 8192) return null;
      var p = JSON.parse(bruto);
      if (p && typeof p.id === 'string' && RE_PEDIDO.test(p.id) && typeof p.segredo === 'string' && RE_SEGREDO.test(p.segredo)) return { pedido_id: p.id, segredo: p.segredo };
    } catch (e) { /* sem acesso ao armazenamento */ }
    return null;
  }
  /* corpo da aprovação, ou null; o #t= tem preferência */
  function credencial() {
    var t = token();
    if (t) return { slug: slug, token: t };
    var p = pedidoDoAparelho();
    return p ? { slug: slug, pedido_id: p.pedido_id, segredo: p.segredo } : null;
  }
  function dizer(t, tipo) { status.textContent = t; status.setAttribute('data-tipo', tipo || ''); }
  function travar(sn) { sim.disabled = sn; nao.disabled = sn; }

  if (!credencial()) {
    btn.disabled = true;
    dizer('Abra este rascunho no aparelho em que você fez o pedido, ou fale com o suporte pelo botão Pedir ajuste.', 'aviso');
  }

  btn.addEventListener('click', function () {
    if (!credencial()) return;
    btn.hidden = true; conf.hidden = false; sim.focus();
  });
  nao.addEventListener('click', function () {
    conf.hidden = true; btn.hidden = false; btn.focus(); dizer('', '');
  });

  var enviando = false;
  function falha(t, deNovo) {
    enviando = false; travar(false);
    if (!deNovo) { conf.hidden = true; btn.hidden = false; btn.disabled = true; }
    dizer(t, 'erro');
  }
  function aprovado() {
    conf.hidden = true; btn.hidden = true;
    faixa.setAttribute('data-estado', 'aprovado');
    titulo.textContent = 'Aprovado. Obrigado.';
    dizer('A equipe coloca o site no ar e avisa você.', 'ok');
  }

  sim.addEventListener('click', function () {
    if (enviando) return;
    var corpo = credencial();
    if (!corpo) return;
    if (!('fetch' in W)) { falha('Este navegador é antigo para aprovar por aqui. Use o botão Pedir ajuste.', false); return; }
    enviando = true; travar(true);
    dizer('Enviando a sua aprovação...', 'enviando');
    var ctl = 'AbortController' in W ? new W.AbortController() : null;
    var relogio = W.setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    W.fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      W.clearTimeout(relogio);
      return r.json().catch(function () { return {}; }).then(function (j) { return { st: r.status, j: j }; });
    }).then(function (x) {
      if (x.st >= 200 && x.st < 300 && x.j && x.j.ok === true) { aprovado(); return; }
      if (x.st >= 400 && x.st < 500 && x.st !== 429) { falha(corpo.token ? 'Este link de aprovação não vale mais. Peça um novo pelo botão Pedir ajuste.' : 'Não deu para aprovar com os dados deste aparelho. Fale com o suporte pelo botão Pedir ajuste.', false); return; }
      falha('Não deu certo agora. Tente de novo em instantes.', true);
    }, function () {
      W.clearTimeout(relogio);
      falha('Sem conexão agora. Confira a internet e tente de novo.', true);
    });
  });
})();
