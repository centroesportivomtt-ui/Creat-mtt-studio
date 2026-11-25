/*
 * motor/nichos/index.js · registro dos presets de nicho (Porta Aberta, motor v1)
 *
 * Script clássico (sem import/export): abre por file:// e também roda no node
 * (require) para o build-site.cjs e o produzir.mjs reaproveitarem os presets.
 *
 * Contrato (docs/CONTRATOS-DETALHE.md, item h):
 *   window.CREAT_NICHOS[id] = { id, rotulo, paletas:[3], tenantBase, textosPermitidos, ritual, ... }
 *   Cada arquivo motor/nichos/<id>.js chama CreatNichos.registrar({...}).
 *
 * COMO ACRESCENTAR UM NICHO (T8 e Fase 3) sem tocar no motor:
 *   1. crie motor/nichos/<id>.js chamando CreatNichos.registrar({ id:'<id>', ... });
 *   2. acrescente '<id>' na lista DISPONIVEIS abaixo (só isso neste arquivo).
 *   A prévia só pede ao servidor os arquivos desta lista, então um nicho que
 *   ainda não existe nunca vira requisição quebrada. Nicho pedido e ausente,
 *   arquivo que não carrega ou preset inválido: cai no PADRAO, sem erro na tela.
 *
 * Rituais de confirmação ficam em window.CREAT_RITUAIS[nome]. O motor registra
 * 'navalha' (motor/v1/efeito.js). Os outros moram em motor/v1/rituais/ (T8: 'esmalte'
 * e 'barra') e o preset diz quais arquivos carregar, relativos a motor/:
 *   ritualArquivos: { js: ['v1/rituais/comum.js', 'v1/rituais/esmalte.js'], css: 'v1/rituais/rituais.css' }
 * carregar() traz esses arquivos, em ordem, antes de chamar cb; o site entregue recebe as
 * mesmas tags do CreatMotor.preencherTemplate. Ritual que não carrega: o motor segue sem
 * ritual (herói calmo e só o botão "Enviar sem arrastar"), sem erro na tela.
 */
(function (raiz) {
  'use strict';

  /* nichos com arquivo pronto em motor/nichos/<id>.js (T4: barbearia; T8: salao e academia) */
  var DISPONIVEIS = ['barbearia', 'salao', 'academia'];
  var PADRAO = 'barbearia';
  var TEMPO_LIMITE_MS = 4000;

  var registro = raiz.CREAT_NICHOS = raiz.CREAT_NICHOS || {};
  raiz.CREAT_RITUAIS = raiz.CREAT_RITUAIS || {};

  var ID_VALIDO = /^[a-z][a-z0-9-]{1,30}$/;
  var COR = /^#[0-9A-Fa-f]{6}$/;
  var PAPEIS = ['fundo', 'superficie', 'texto', 'apoio', 'destaque', 'sobreDestaque'];

  function paletaValida(p) {
    if (!p || typeof p !== 'object' || !p.claro) return false;
    for (var i = 0; i < PAPEIS.length; i++) if (!COR.test(String(p.claro[PAPEIS[i]] || ''))) return false;
    if (p.escuro) for (var j = 0; j < PAPEIS.length; j++) if (!COR.test(String(p.escuro[PAPEIS[j]] || ''))) return false;
    return true;
  }

  /* devolve a lista de problemas (vazia = preset utilizável pelo motor) */
  function conferir(preset) {
    var erros = [];
    if (!preset || typeof preset !== 'object') return ['preset vazio'];
    if (!ID_VALIDO.test(String(preset.id || ''))) erros.push('id');
    if (!preset.rotulo) erros.push('rotulo');
    if (!Array.isArray(preset.paletas) || preset.paletas.length < 1 || !preset.paletas.every(paletaValida)) erros.push('paletas');
    var b = preset.tenantBase;
    if (!b || b.versao !== 1 || b.nicho !== preset.id || !b.funcionamento || !Array.isArray(b.servicos) || !b.servicos.length) erros.push('tenantBase');
    if (!Array.isArray(preset.textosPermitidos)) erros.push('textosPermitidos');
    if (b && b.demo) erros.push('tenantBase.demo (ocupação inventada é proibida)');
    return erros;
  }

  function registrar(preset) {
    var erros = conferir(preset);
    if (erros.length) {
      if (raiz.console && raiz.console.warn) raiz.console.warn('[nichos] preset ignorado (' + (preset && preset.id) + '): ' + erros.join(', '));
      return false;
    }
    registro[preset.id] = preset;
    return true;
  }

  function obter(id) {
    return Object.prototype.hasOwnProperty.call(registro, id) ? registro[id] : null;
  }

  /* o preset pedido, se registrado; senão o padrão; senão o primeiro que houver */
  function resolver(id) {
    var p = obter(id);
    if (p) return p;
    p = obter(PADRAO);
    if (p) return p;
    for (var k in registro) if (Object.prototype.hasOwnProperty.call(registro, k)) return registro[k];
    return null;
  }

  function disponivel(id) { return DISPONIVEIS.indexOf(id) !== -1; }

  /* caminhos dos arquivos do ritual do preset, relativos a motor/ (só v1/rituais/<nome>.js|.css) */
  var ARQ_RITUAL = /^v1\/rituais\/[a-z][a-z0-9-]{0,30}\.(js|css)$/;
  function arquivosRitual(preset) {
    var a = preset && preset.ritualArquivos, js = [], css = '';
    if (!a || typeof a !== 'object') return { js: js, css: css };
    (Array.isArray(a.js) ? a.js : []).forEach(function (c) { if (ARQ_RITUAL.test(String(c)) && /\.js$/.test(c)) js.push(String(c)); });
    if (ARQ_RITUAL.test(String(a.css || '')) && /\.css$/.test(a.css)) css = String(a.css);
    return { js: js, css: css };
  }

  /* navegador: traz CSS e scripts do ritual (scripts em ordem) e chama pronto(); nunca lança */
  function carregarRitual(preset, baseMotor, pronto) {
    var arq = arquivosRitual(preset), D = raiz.document, feito = false;
    function fim() { if (!feito) { feito = true; pronto(); } }
    if (!D || (preset.ritual && raiz.CREAT_RITUAIS[preset.ritual]) || (!arq.js.length && !arq.css)) { fim(); return; }
    var pendentes = 0;
    function um() { if (--pendentes <= 0) fim(); }
    raiz.setTimeout(fim, TEMPO_LIMITE_MS);
    try {
      var cab = D.head || D.documentElement;
      if (arq.css && !D.querySelector('link[data-rituais-css]')) {
        pendentes++;
        var l = D.createElement('link');
        l.rel = 'stylesheet';
        l.href = baseMotor + arq.css;
        l.setAttribute('data-rituais-css', '');
        l.onload = um; l.onerror = um;
        cab.appendChild(l);
      }
      if (arq.js.length) {
        pendentes++;
        var i = 0;
        (function proximo() {
          if (i >= arq.js.length) { um(); return; }
          var s = D.createElement('script');
          s.src = baseMotor + arq.js[i++];
          s.async = false;
          s.onload = proximo;
          s.onerror = function () { um(); };
          cab.appendChild(s);
        })();
      }
      if (!pendentes) fim();
    } catch (e) { fim(); }
  }

  /*
   * Navegador: garante o preset `id` carregado e chama cb(preset, idUsado).
   * base = pasta de motor/nichos/ relativa à página (ex.: '../motor/nichos/').
   * Nunca lança: ausente, fora da lista, erro de rede ou demora = preset padrão.
   */
  function carregar(id, base, cb) {
    var feito = false;
    var baseMotor = String(base || '').replace(/nichos\/?$/, '');
    function entregar() {
      var p = resolver(id);
      cb(p, p ? p.id : null);
    }
    function fim() {
      if (feito) return;
      feito = true;
      var p = resolver(id);
      if (p && p.ritualArquivos && raiz.document) carregarRitual(p, baseMotor, entregar);
      else entregar();
    }
    if (obter(id) || !disponivel(id) || !raiz.document) { fim(); return; }
    try {
      var s = raiz.document.createElement('script');
      s.src = String(base || '') + id + '.js';
      s.async = true;
      s.onload = fim;
      s.onerror = fim;
      raiz.setTimeout(fim, TEMPO_LIMITE_MS);
      (raiz.document.head || raiz.document.documentElement).appendChild(s);
    } catch (e) { fim(); }
  }

  var api = {
    DISPONIVEIS: DISPONIVEIS.slice(),
    PADRAO: PADRAO,
    registrar: registrar,
    conferir: conferir,
    obter: obter,
    resolver: resolver,
    disponivel: disponivel,
    carregar: carregar,
    arquivosRitual: arquivosRitual,
    lista: function () { return Object.keys(registro); }
  };
  raiz.CreatNichos = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
