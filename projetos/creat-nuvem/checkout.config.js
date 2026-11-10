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

   Links de R$ 297 (inauguração): aberturaInauguracao e os 6 de linksPorPraca. Este arquivo é
   público, então quem guardar um deles pode pagar o preço de inauguração depois do fim.
   - Crie cada link com data de vencimento (Mercado Pago: Link de pagamento > "Data de vencimento").
   - Teto de vagas: o limite de "quantidade máxima" do Mercado Pago é POR LINK. A soma das quantidades
     máximas dos 7 links tem de ser no máximo vagasTotal de dados/precos.json (20). Se não der para
     dividir assim, o corte é manual e vale para TODOS os 7 links ao mesmo tempo (ADR-005).
   - Quando a inauguração acabar, desative no Mercado Pago os 7 links (e os 2 combos do anual, que não
     ficam aqui: docs/INTEGRACAO-PAGAMENTO.md) e volte aberturaInauguracao para o marcador e
     linksPorPraca para {}. scripts/atualizar-vagas.cjs imprime a lista e a rotina diária falha até isso.
   - O plano anual NÃO é cobrado aqui: hoje a pessoa paga só a Abertura; o anual é cobrado no dia em
     que o site entra no ar (decisão D3 do diretor, 10/11/2026).
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

  var LINKS = {
    aberturaInauguracao: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-388377b3-87f4-43db-b88c-af75b6ce6526',
    aberturaPadrao: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-fc609d62-006f-49e5-ae5a-93e73f762a68',
    bastidores: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-ff658538-9778-4e95-9b68-f167334aea7a'
  };

  /* Abertura de inauguração por praça (R$ 297, mesmo valor e vencimento do link padrão de inauguração).
     A chave é a utm_campaign dos anúncios. O pagamento cai no painel do Mercado Pago com o nome da praça,
     e assim a venda é atribuída sem servidor. Sem praça guardada (ou praça fora da lista) = aberturaInauguracao.
     Fora da inauguração, nenhum destes vale: o botão usa aberturaPadrao. */
  var LINKS_POR_PRACA = {
    'feira': 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-c33953d5-4c69-4bc9-8de8-0ff4d7dfbeff',
    'salvador-rms': 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-621eec2b-8af5-477a-a64e-53ba326d8d53',
    'fortaleza': 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-b41d58df-9f1d-4250-a1fe-dd562b264619',
    'recife': 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-27ab4073-7c24-402f-b333-f58585dcc6c6',
    'petrolina-juazeiro': 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-1b66d83c-b929-44b6-aa31-979b6efef0e0',
    'aracaju': 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-88c3e2e4-b65b-444e-8e28-bbd5ec4c5ac2'
  };

  // Valor que cada link cobra no Mercado Pago (o Purchase do Pixel usa este valor; scripts/checar.cjs confere com dados/precos.json).
  var VALOR_DOS_LINKS = { aberturaInauguracao: 297, aberturaPadrao: 497, bastidores: 67 };

  function prefId(link) {
    try { var p = new URL(link).searchParams.get('pref_id'); return p && /^[0-9A-Za-z-]{8,80}$/.test(p) ? p : null; } catch (e) { return null; }
  }

  /* Escolhe o link do botão de pagar de /abrir/. Hoje a página cobra só a Abertura, em qualquer plano
     (o anual é cobrado quando o site entra no ar).
     opcoes: { inauguracao: bool (a página está mostrando o preço de inauguração),
               praca: utm_campaign guardada (ou vazio) }
     Devolve { chave, link, praca, valor } ou null se nenhum link é válido. valor = o que o link cobra;
     é o total que a tela mostra. */
  function escolherAbertura(opcoes) {
    var o = opcoes || {};
    var r = function (chave, link, praca, valor) { return linkValido(link) ? { chave: chave, link: link, praca: praca || null, valor: valor } : null; };
    if (!o.inauguracao) return r('aberturaPadrao', LINKS.aberturaPadrao, null, VALOR_DOS_LINKS.aberturaPadrao);
    var praca = typeof o.praca === 'string' && Object.prototype.hasOwnProperty.call(LINKS_POR_PRACA, o.praca) ? o.praca : null;
    if (praca && linkValido(LINKS_POR_PRACA[praca])) return r('aberturaInauguracao', LINKS_POR_PRACA[praca], praca, VALOR_DOS_LINKS.aberturaInauguracao);
    return r('aberturaInauguracao', LINKS.aberturaInauguracao, null, VALOR_DOS_LINKS.aberturaInauguracao)
      || r('aberturaPadrao', LINKS.aberturaPadrao, null, VALOR_DOS_LINKS.aberturaPadrao);
  }

  // Valor cobrado pela preferência que o Mercado Pago devolve na volta (preference_id). null = link desconhecido
  // (o Purchase do Pixel só sai com preferência conhecida; nunca com valor adivinhado).
  function valorDaPreferencia(id) {
    if (typeof id !== 'string' || !id) return null;
    var achado = null;
    Object.keys(LINKS).forEach(function (k) { if (prefId(LINKS[k]) === id && k in VALOR_DOS_LINKS) achado = VALOR_DOS_LINKS[k]; });
    Object.keys(LINKS_POR_PRACA).forEach(function (k) { if (prefId(LINKS_POR_PRACA[k]) === id) achado = VALOR_DOS_LINKS.aberturaInauguracao; });
    return achado;
  }

  /* Quem presta o serviço. Termos, privacidade, rodapé e o bloco "Quem monta o seu site" leem daqui.
     Campo vazio some da tela (nunca "(a informar)"). documento e endereco: os mesmos dados que a
     empresa já publica nas páginas legais de creatmtt.com.br (conferidos em 10/11/2026). */
  var EMPRESA = {
    nome: 'creat.MTT Studio', cidade: 'Riachão do Jacuípe', uf: 'BA',
    razao: '57.068.874 Marcos Marciel de Jesus Coutinho',
    documento: 'CNPJ 57.068.874/0001-06',
    endereco: 'Travessa 12 de Outubro, 104, Jatobá, CEP 44640-000'
  };

  var CREAT_CHECKOUT = {
    versao: 1,
    whatsappSuporte: '5575981151202',
    emailSuporte: 'mttcreatt@gmail.com',
    empresa: EMPRESA,
    links: LINKS,
    linksPorPraca: LINKS_POR_PRACA,
    valorDosLinks: VALOR_DOS_LINKS,
    /* Contadores ao vivo ("Restam X vagas", "Resta 1 vaga", "Vagas de produção hoje: X de Y").
       Desligados (decisão D1 do diretor, 10/11/2026) até o número vir de pedido pago gravado em
       servidor. Com false, a página mostra só "preço de inauguração", sem número restante. */
    contadoresAoVivo: false,
    // Reserva quando dados/precos.json não parseia. scripts/checar.cjs confere que bate com o JSON.
    precosPadrao: { prazoHoras: 72, abertura: 497, planos: { aberto: 147, vitrine: 297 }, anualMesesPagos: 10, bastidores: 67 },
    termosVersao: 'termos-v1',
    linkValido: linkValido,
    whatsappValido: whatsappValido,
    escolherAbertura: escolherAbertura,
    valorDaPreferencia: valorDaPreferencia,
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
    metaPixel: '2223314621951948',
    clarity: 'ID_DO_PROJETO_CLARITY',
    posthogValida: function (v) { return typeof v === 'string' && /^phc_[A-Za-z0-9]{20,}$/.test(v); },
    pixelValido: function (v) { return typeof v === 'string' && /^\d{10,20}$/.test(v); },
    clarityValido: function (v) { return typeof v === 'string' && /^[a-z0-9]{8,12}$/.test(v); }
  };

  window.CREAT_CHECKOUT = CREAT_CHECKOUT;
  window.CREAT_MEDICAO = CREAT_MEDICAO;
})();
