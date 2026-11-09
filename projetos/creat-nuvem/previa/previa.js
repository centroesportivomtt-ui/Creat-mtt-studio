/*
 * previa/previa.js · monta a prévia a partir do fragmento (T4)
 *
 * Carregado depois de motor/nichos/index.js e ANTES de motor/v1/motor.js: define
 * window.CREAT_SITE.manual para o motor não iniciar sozinho e espera o DOM.
 * Fragmento: #k=barbearia&n=Barbearia%20do%20Ze&c=Campinas&p=2 (CONTRATOS-DETALHE.md, item c).
 *  - k ausente ou inválido: barbearia, paleta 1, com o aviso "Escolha o seu nicho" e link para a home;
 *  - k sem preset publicado (ex.: nicho da T8 antes do registro): barbearia, com o mesmo aviso, sem erro;
 *  - n inválido: "Seu negócio" com o selo "exemplo"; c inválido some; p inválido = 1.
 * Só textContent: nome e cidade nunca passam por innerHTML.
 * Avisa a página-mãe (home) por postMessage {tipo:'creat:previa', evento:'pronta'|'reserva_teste', nicho}
 * sem nome, cidade nem WhatsApp. Mudou o fragmento: remonta (recarrega a página).
 */
(function () {
  'use strict';
  var W = window, DOC = document;
  var BASE_NICHOS = '../motor/nichos/';
  var TEXTOS = {
    escolhaTitulo: 'Escolha o seu nicho',
    escolhaTexto: 'Este link não diz que tipo de negócio montar. Volte para a home e escolha entre barbearia, salão e estética, academia e studio.',
    escolhaBotao: 'Escolher na home',
    erro: 'Algo não carregou nesta página. Recarregue. Se continuar, chame o Suporte Creat no WhatsApp.'
  };

  W.CREAT_SITE = { manual: true, home: '../', rodape: true };

  function avisarMae(evento, nicho) {
    if (!W.parent || W.parent === W) return;
    try {
      var origem = W.location.origin && W.location.origin !== 'null' ? W.location.origin : '*';
      W.parent.postMessage({ tipo: 'creat:previa', evento: evento, nicho: nicho }, origem);
    } catch (e) {}
  }

  function falhar() {
    var raiz = DOC.getElementById('motor-raiz');
    if (!raiz) return;
    while (raiz.firstChild) raiz.removeChild(raiz.firstChild);
    var p = DOC.createElement('p');
    p.className = 'sem-tenant';
    p.setAttribute('role', 'alert');
    p.textContent = TEXTOS.erro;
    raiz.appendChild(p);
  }

  function avisoNicho() {
    var raiz = DOC.getElementById('motor-raiz');
    if (!raiz) return;
    var box = DOC.createElement('div');
    box.className = 'aviso-nicho';
    box.setAttribute('role', 'note');
    var t = DOC.createElement('strong'); t.textContent = TEXTOS.escolhaTitulo;
    var p = DOC.createElement('p'); p.textContent = TEXTOS.escolhaTexto;
    var a = DOC.createElement('a'); a.href = '../#abrir'; a.target = '_top'; a.textContent = TEXTOS.escolhaBotao;
    box.appendChild(t); box.appendChild(p); box.appendChild(a);
    var faixa = raiz.querySelector('.faixa-previa');
    raiz.insertBefore(box, faixa ? faixa.nextSibling : raiz.firstChild);
  }

  function montar() {
    var M = W.CreatMotor, N = W.CreatNichos;
    if (!M || !N || typeof M.iniciar !== 'function') { falhar(); return; }
    var f = M.lerFragmento(W.location.hash);
    var semNicho = !f.k || !N.disponivel(f.k);
    var pedido = f.k && N.disponivel(f.k) ? f.k : N.PADRAO;
    N.carregar(pedido, BASE_NICHOS, function (preset) {
      if (!preset) { falhar(); return; }
      var tenant;
      try {
        tenant = M.montarTenantPrevia(preset, {
          nome: f.nomeExemplo ? '' : f.n,
          cidade: f.c,
          paleta: f.p,
          agora: new Date()
        });
      } catch (e) { falhar(); return; }
      W.CREAT_SITE.nomeExemplo = !!f.nomeExemplo;
      W.TENANT = tenant;
      var estado = M.iniciar(tenant);
      if (!estado) return;
      if (semNicho) avisoNicho();
      avisarMae('pronta', preset.id);
    });
  }

  W.addEventListener('hashchange', function () { W.location.reload(); });
  if (DOC.readyState === 'loading') DOC.addEventListener('DOMContentLoaded', montar, { once: true });
  else setTimeout(montar, 0);
})();
