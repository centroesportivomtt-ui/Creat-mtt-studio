/* =====================================================================
   Porta Aberta · checkout.config.js (T5 · Pixel)
   Contrato: docs/ARQUITETURA.md (e) e docs/CONTRATOS-DETALHE.md (e).
   Arquivo PÚBLICO: vai para o navegador de todo visitante. Nada de chave
   secreta, token de API ou senha aqui. Só links públicos de pagamento,
   o número público do Suporte Creat e IDs públicos de medição.

   Os 4 marcadores abaixo são os ÚNICOS do projeto. Enquanto existirem,
   os botões de pagamento caem no WhatsApp do Suporte Creat (ou ficam com
   "Link de pagamento em configuração" sem WhatsApp válido) e
   scripts/checar-placeholders.cjs falha o deploy. Para liberar, o Marcos
   troca cada marcador pelo link real. O nome do marcador ficou com
   "ASAAS"/"CAKTO" por histórico: vale link de qualquer provedor aceito
   em linkValido (Mercado Pago, Stripe, Asaas, Cakto). Passo a passo:
   docs/INTEGRACAO-PAGAMENTO.md.

   Provedores aceitos em linkValido (só https, sem usuário/senha/porta):
   - Mercado Pago: mpago.la, mpago.li (links curtos do painel),
     link.mercadopago.com.br, www.mercadopago.com.br (Checkout Pro,
     init_point das preferências do AutoCreatFlux). Host exato.
   - Stripe: buy.stripe.com (Payment Link), checkout.stripe.com
     (Checkout Session da assinatura). Host exato.
   - Asaas (asaas.com e subdomínios) e Cakto (cakto.com.br e subdomínios).

   Link da inauguração: este arquivo é público, então quem guardar o link
   pode pagar o preço de inauguração depois do fim. Crie o link com data de
   encerramento (Mercado Pago: Link de pagamento > "Data de vencimento"; Asaas:
   "Quantidade máxima de pagamentos" = vagas restantes). Quando a inauguração
   acabar, desative o link no provedor e volte aberturaInauguracao para o marcador:
   scripts/atualizar-vagas.cjs avisa e a rotina diária falha até isso ser feito.
   ===================================================================== */
(function () {
  'use strict';

  // Host e subdomínios (contrato original de T5).
  var HOSTS = ['asaas.com', 'cakto.com.br'];
  // Só o host exato: subdomínio de Mercado Pago ou Stripe fora desta lista não é página de pagamento.
  var HOSTS_EXATOS = [
    'mpago.la', 'mpago.li', 'link.mercadopago.com.br', 'www.mercadopago.com.br',
    'buy.stripe.com', 'checkout.stripe.com'
  ];

  function linkValido(valor) {
    if (typeof valor !== 'string' || !valor || valor.indexOf('[') !== -1) return false;
    var u;
    try { u = new URL(valor); } catch (e) { return false; }
    // Sem credencial embutida (usuário ou senha antes do @) e sem porta.
    if (u.protocol !== 'https:' || u.port || u.username || /^\s*https:[\/\\]*[^\/\\?#]*@/i.test(valor)) return false;
    var h = u.hostname.toLowerCase();
    if (HOSTS_EXATOS.indexOf(h) !== -1) return u.pathname.length > 1;
    return HOSTS.some(function (base) { return h === base || h.slice(-(base.length + 1)) === '.' + base; });
  }

  function whatsappValido(valor) {
    return typeof valor === 'string' && /^55[1-9]\d{9,10}$/.test(valor) && !/^5500/.test(valor);
  }

  var CREAT_CHECKOUT = {
    versao: 1,
    whatsappSuporte: '5575981151202',
    emailSuporte: 'mttcreatt@gmail.com',
    links: {
      aberturaInauguracao: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-388377b3-87f4-43db-b88c-af75b6ce6526',
      aberturaPadrao: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-fc609d62-006f-49e5-ae5a-93e73f762a68',
      bastidores: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-ff658538-9778-4e95-9b68-f167334aea7a'
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
    // SRI do arquivo acima (sha384 do tarball oficial posthog-js@1.447.3 no npm). Trocou a versão? Recalcule:
    // npm pack posthog-js@<versão> && tar xzf posthog-js-*.tgz && openssl dgst -sha384 -binary package/dist/array.no-external.js | base64
    posthogIntegridade: 'sha384-YmnhYWsqUnLKK4nAaNG2wrvyUx1fnHXxTyfegNDVC4MaQhFVdiAv6WtuHY27jb5F',
    metaPixel: '1743291620082635',
    clarity: 'ID_DO_PROJETO_CLARITY',
    posthogValida: function (v) { return typeof v === 'string' && /^phc_[A-Za-z0-9]{20,}$/.test(v); },
    pixelValido: function (v) { return typeof v === 'string' && /^\d{10,20}$/.test(v); },
    clarityValido: function (v) { return typeof v === 'string' && /^[a-z0-9]{8,12}$/.test(v); }
  };

  window.CREAT_CHECKOUT = CREAT_CHECKOUT;
  window.CREAT_MEDICAO = CREAT_MEDICAO;
})();
