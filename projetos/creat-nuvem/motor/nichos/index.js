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
 * Rituais de confirmação ficam em window.CREAT_RITUAIS[nome] (o motor registra
 * 'navalha'; outro nicho pode registrar o seu no próprio arquivo do preset).
 */
(function (raiz) {
  'use strict';

  /* nichos com arquivo pronto em motor/nichos/<id>.js (T8 acrescenta 'salao' e 'academia') */
  var DISPONIVEIS = ['barbearia'];
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

  /*
   * Navegador: garante o preset `id` carregado e chama cb(preset, idUsado).
   * base = pasta de motor/nichos/ relativa à página (ex.: '../motor/nichos/').
   * Nunca lança: ausente, fora da lista, erro de rede ou demora = preset padrão.
   */
  function carregar(id, base, cb) {
    var feito = false;
    function fim() {
      if (feito) return;
      feito = true;
      var p = resolver(id);
      cb(p, p ? p.id : null);
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
    lista: function () { return Object.keys(registro); }
  };
  raiz.CreatNichos = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
