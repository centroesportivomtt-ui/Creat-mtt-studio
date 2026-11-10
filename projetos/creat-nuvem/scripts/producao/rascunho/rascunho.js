/*
 * scripts/producao/rascunho/rascunho.js · botão "Aprovar e colocar no ar" do rascunho (pacote 1C)
 *
 * Só existe no rascunho (/sites/<slug>-r-<id>/); o site final não carrega este arquivo.
 * Script clássico, sem dependência, sem estilo inline (a CSP do template não aceita).
 * O token vem SÓ do fragmento da URL (#t=<token>): o fragmento não vai ao servidor da hospedagem,
 * nem no Referer, nem em log. Nunca é lido da query, nunca é gravado (nem localStorage, nem cookie).
 * POST <data-endpoint> (padrão /api/pa/aprovarRascunho, mesma origem) com {slug, token}.
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

  function token() {
    var m = /(?:^#|&)t=([A-Za-z0-9_-]{21}[AQgw])(?:&|$)/.exec(W.location.hash || '');
    return m ? m[1] : '';
  }
  function dizer(t, tipo) { status.textContent = t; status.setAttribute('data-tipo', tipo || ''); }
  function travar(sn) { sim.disabled = sn; nao.disabled = sn; }

  if (!token()) {
    btn.disabled = true;
    dizer('Para aprovar, abra o link completo que você recebeu.', 'aviso');
  }

  btn.addEventListener('click', function () {
    if (!token()) return;
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
    var t = token();
    if (!t) return;
    if (!('fetch' in W)) { falha('Este navegador é antigo para aprovar por aqui. Use o botão Pedir ajuste.', false); return; }
    enviando = true; travar(true);
    dizer('Enviando a sua aprovação...', 'enviando');
    var ctl = 'AbortController' in W ? new W.AbortController() : null;
    var relogio = W.setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    W.fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: slug, token: t }),
      credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer',
      signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      W.clearTimeout(relogio);
      return r.json().catch(function () { return {}; }).then(function (j) { return { st: r.status, j: j }; });
    }).then(function (x) {
      if (x.st >= 200 && x.st < 300 && x.j && x.j.ok === true) { aprovado(); return; }
      if (x.st >= 400 && x.st < 500 && x.st !== 429) { falha('Este link de aprovação não vale mais. Peça um novo pelo botão Pedir ajuste.', false); return; }
      falha('Não deu certo agora. Tente de novo em instantes.', true);
    }, function () {
      W.clearTimeout(relogio);
      falha('Sem conexão agora. Confira a internet e tente de novo.', true);
    });
  });
})();
