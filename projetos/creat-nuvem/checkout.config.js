/* =====================================================================
   Porta Aberta · checkout.config.js (T5 · Pixel)
   Contrato: docs/ARQUITETURA.md (e) e docs/CONTRATOS-DETALHE.md (e).
   Arquivo PÚBLICO: vai para o navegador de todo visitante. Nada de chave
   secreta, token de API ou senha aqui. Só links públicos de pagamento,
   o número público do Suporte Creat e IDs públicos de medição.

   Os 4 marcadores abaixo são os ÚNICOS do projeto. Enquanto existirem,
   os botões de pagamento ficam desativados com o texto
   "Link de pagamento em configuração" e scripts/checar-placeholders.cjs
   falha o deploy. Para liberar, o Marcos troca cada marcador pelo valor
   real (link do Asaas, link da Cakto, número 55 + DDD + número).
   ===================================================================== */
(function () {
  'use strict';

  var HOSTS = ['asaas.com', 'cakto.com.br'];

  function linkValido(valor) {
    if (typeof valor !== 'string' || !valor || valor.indexOf('[') !== -1) return false;
    var u;
    try { u = new URL(valor); } catch (e) { return false; }
    if (u.protocol !== 'https:') return false;
    var h = u.hostname.toLowerCase();
    return HOSTS.some(function (base) { return h === base || h.slice(-(base.length + 1)) === '.' + base; });
  }

  function whatsappValido(valor) {
    return typeof valor === 'string' && /^55[1-9]\d{9,10}$/.test(valor) && !/^5500/.test(valor);
  }

  var CREAT_CHECKOUT = {
    versao: 1,
    whatsappSuporte: '[WHATSAPP_SUPORTE_55DDDNUMERO]',
    emailSuporte: 'mttcreatt@gmail.com',
    links: {
      aberturaInauguracao: '[LINK_ASAAS_ABERTURA_INAUGURACAO]',
      aberturaPadrao: '[LINK_ASAAS_ABERTURA_PADRAO]',
      bastidores: '[LINK_CAKTO_BASTIDORES]'
    },
    // Reserva quando dados/precos.json não parseia. scripts/checar.cjs confere que bate com o JSON.
    precosPadrao: { prazoHoras: 72, abertura: 497, planos: { aberto: 147, vitrine: 297 }, anualMesesPagos: 10, bastidores: 67 },
    termosVersao: 'termos-v1',
    linkValido: linkValido,
    whatsappValido: whatsappValido,
    // Implementado em assets/vitrine.js (leitura fail-closed de dados/*.json, ADR-003).
    lerPrecos: function () {
      if (window.Vitrine && window.Vitrine.lerPrecos) return window.Vitrine.lerPrecos();
      var p = CREAT_CHECKOUT.precosPadrao;
      return Promise.resolve({ fresco: false, prazoHoras: p.prazoHoras, abertura: p.abertura, inauguracao: null, planos: p.planos, anualMesesPagos: p.anualMesesPagos, bastidores: p.bastidores, vagasHoje: null, linkAbertura: CREAT_CHECKOUT.links.aberturaPadrao });
    }
  };

  /* Medição (seção 14 do briefing). IDs PÚBLICOS de projeto, não são segredo:
     - posthogChave: chave pública do projeto PostHog (começa com "phc_"). É feita para ir ao navegador.
     - metaPixel: ID numérico do Pixel. clarity: ID do projeto Clarity.
     Valor fora do formato = desligado (nenhum script carrega, nenhuma requisição sai).
     Pixel e Clarity só carregam depois do "Aceitar" no banner. PostHog roda sem cookie
     (persistence 'memory') e passa por um filtro que corta o # das URLs e descarta
     qualquer propriedade fora de schema/evento.schema.json. */
  var CREAT_MEDICAO = {
    posthogChave: 'phc_CHAVE_PUBLICA_DO_PROJETO',
    posthogHost: 'https://eu.i.posthog.com',
    posthogScript: 'https://cdn.jsdelivr.net/npm/posthog-js@1.447.3/dist/array.no-external.js',
    metaPixel: 'ID_DO_PIXEL_META',
    clarity: 'ID_DO_PROJETO_CLARITY',
    posthogValida: function (v) { return typeof v === 'string' && /^phc_[A-Za-z0-9]{20,}$/.test(v); },
    pixelValido: function (v) { return typeof v === 'string' && /^\d{10,20}$/.test(v); },
    clarityValido: function (v) { return typeof v === 'string' && /^[a-z0-9]{8,12}$/.test(v); }
  };

  window.CREAT_CHECKOUT = CREAT_CHECKOUT;
  window.CREAT_MEDICAO = CREAT_MEDICAO;
})();
