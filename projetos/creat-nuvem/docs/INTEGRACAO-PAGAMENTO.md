# Integração de pagamento do Porta Aberta

Forja (backend), 09/11/2026. Hoje o botão Pagar de `/abrir/` cai no WhatsApp porque não existe link de pagamento. Isto ajuda a vender assim: a Abertura fecha por Pix ou cartão sem o Marcos no meio, e o primeiro Purchase chega à Meta pelo servidor. Sem esse evento não dá para saber se o Reel de dor (CPC de R$ 0,22) gera venda ou só clique.

Este documento junta três coisas: o que já mudou neste repositório, o que o Marcos faz hoje em cerca de 10 minutos (Plano B) e o código exato para o AutoCreatFlux (Plano A, Abertura pelo `createMercadoPagoCheckout` e mensalidade pelo Stripe).

## 0. Decisão em uma tabela

| etapa | o que é | quem faz | quando | destrava |
|---|---|---|---|---|
| 1 | `linkValido` aceita Mercado Pago e Stripe | Forja | feito em 09/11/2026 | colar um link `mpago.la` ou `buy.stripe.com` passa a ligar o botão |
| 2 | Plano B: 2 Links de pagamento do Mercado Pago (R$ 297 e R$ 497) | Marcos, cerca de 10 min | hoje | o botão Pagar deixa de cair no WhatsApp |
| 3 | Plano A: pedido e preferência no servidor (seção 4) | Forja, com revisão | nesta semana | vagas reais, `order_id`, confirmação no `/obrigado/`, aviso ao Suporte, Purchase no servidor |
| 4 | Assinaturas Stripe de R$ 147 e R$ 297 (seção 6) | Marcos cria os preços; Forja faz o código | quando o 1º site for ao ar | mensalidade cobrada sozinha no cartão |

O Mercado Pago fica com a Abertura porque o Pix é o meio de pagamento principal do produto e já está ao vivo e auditado no AutoCreatFlux. O Stripe fica com a mensalidade porque a assinatura no cartão já roda lá (Motor por Foto, R$ 47/mês). Conta Stripe brasileira não tem Pix Automático, então não use o Stripe para Pix recorrente (support.stripe.com, lido em 09/11/2026). Asaas e Cakto continuam aceitos em `linkValido`, mas nenhum dos dois tem conta aberta.

## 1. O que já está feito neste repositório

- **`checkout.config.js`**: `linkValido` aceita, além de `asaas.com` e `cakto.com.br` (com subdomínios, como antes), estes hosts exatos:
  - Mercado Pago: `mpago.la`, `mpago.li`, `link.mercadopago.com.br`, `www.mercadopago.com.br`
  - Stripe: `buy.stripe.com`, `checkout.stripe.com`

  Regras novas, válidas para todos os hosts: o link precisa ter caminho (`https://mpago.la/` sozinho é recusado), não pode ter porta e não pode ter usuário ou senha antes do `@`. Subdomínio de Mercado Pago ou Stripe fora da lista também é recusado (`falso.mpago.la`, `x.buy.stripe.com`). O `init_point` do Checkout Pro, que o AutoCreatFlux devolve, é `https://www.mercadopago.com.br/checkout/...?pref_id=...`: a função `isMercadoPagoCheckoutUrl` de `base44/shared/mercadoPagoClient.js` só aceita esse host. Por isso ele passa em `linkValido` sem ajuste.
- **`scripts/checar-placeholders.cjs`**: a mensagem de erro e a de deploy bloqueado agora citam os quatro provedores e este documento.
- **`scripts/testes/checkout-config.test.mjs`** (novo, 4 testes):
  - aceita os 8 formatos reais;
  - recusa 21 formatos ruins (marcador, http, porta, credencial, host parecido, subdomínio, `javascript:`);
  - confere que não há segredo nem `APP_USR-` no arquivo;
  - roda o `checar-placeholders` numa cópia com links do Mercado Pago e do Stripe (código 0) e com host falso (código 1).
- **Textos públicos**: as menções ao Asaas viraram Mercado Pago (Pix e cartão) e Stripe (mensalidade no cartão) em `abrir/index.html`, `index.html` (FAQ), `conteudo/abrir.json`, `conteudo/faq.json`, `conteudo/termos.md` (cláusulas 7 e 15) e `conteudo/privacidade.md` (seções 5 e 6). Termos e privacidade continuam com `REVISAO_JURIDICA_PENDENTE`.
- **`docs/CONTRATOS-DETALHE.md`**: o contrato de `linkValido` foi atualizado.

Os nomes dos marcadores (`[LINK_ASAAS_ABERTURA_INAUGURACAO]` e os outros) ficaram como estavam, porque o checador e o histórico dependem deles. Qualquer link de provedor aceito pode substituir um marcador.

## 2. Por que o link não foi criado pelo MCP do Base44 (item 3 da tarefa)

Li o código do AutoCreatFlux (app `6ac3ea47df7bdd575f0a816e`) pelo MCP em 09/11/2026. Nenhum registro de entidade, sozinho, gera um link público de checkout:

1. **O catálogo fica no código.** `createMercadoPagoCheckout` só aceita `product_id` que exista em `base44/shared/catalog.js` (Map fixo com KIT, WEEK, vendedor24h e agente24h). Qualquer outro recebe `400 PRODUCT_MISMATCH`.
2. **Há uma trava de liberação no código.** Para tudo que não é `vendedor24h`, a função chama `productReleaseReady` (`base44/shared/release.ts`), que só devolve verdadeiro para o KIT (R$ 97) e para a WEEK (R$ 49). Mesmo com um Product novo, a resposta seria `503 SALES_CLOSED`.
3. **O fluxo genérico (`shared/offerCheckout.ts`, usado por `checkout47` e `checkout27`) também é código.** Ele lê o preço do registro Product, mas cada oferta precisa de uma função própria (`checkoutXX/entry.ts`). O webhook `mp47Webhook` só aceita os ids 47 e 27 e manda um arquivo para download por e-mail, o que não serve para o Porta Aberta.
4. **Os webhooks atuais criam conta de comprador no AutoCreatFlux.** `mercadoPagoWebhook` e `verifyMercadoPagoPayment` chamam `ensureBuyerAccount` e `sendBuyerWelcome`. Isso confundiria o dono da barbearia com um acesso ao AutoCreatFlux.
5. **Stripe.** Os preços recorrentes de R$ 147 e R$ 297 precisam existir na conta Stripe ao vivo. Criá-los exige a chave secreta (painel do Stripe ou função admin), e a chave não passa por mim.

Gerar o link exigiria mudar código de pagamento ao vivo e publicar sem revisão, sem `seguranca` e sem a compra de teste de R$ 1. As regras da casa proíbem isso ("nada é publicado sem qa e seguranca"). **Não gravei nada no AutoCreatFlux**: nenhum registro, nenhum arquivo, nenhum deploy. O passo exato está nas seções 3 (Marcos, hoje) e 4 a 6 (código).

Conferi o CORS ao vivo em 09/11/2026 (`curl`, sem efeito colateral). `https://creatmtt.com.br/functions/createMercadoPagoCheckout` responde ao preflight `OPTIONS` com `200`, `access-control-allow-origin: *` e `access-control-allow-headers: content-type`. Portanto `/abrir/` pode chamar a função com `fetch` e `Content-Type: application/json`, sem mudar nada no servidor. Isto corrige a leitura anterior, de que o `OPTIONS` dava 405.

## 3. Hoje: Plano B, cerca de 10 minutos do Marcos

### 3.1 Criar os 2 links no Mercado Pago

Use a conta Mercado Pago que já tem as credenciais ao vivo do AutoCreatFlux, porque o Pix dela já está ativo.

1. No app ou no site do Mercado Pago, abra **Link de pagamento** e escolha **Criar link** com **valor fixo**.
2. Link 1: título `Porta Aberta · Abertura (inauguração)`, valor **R$ 297,00**. Meios: Pix e cartão de crédito, **até 2x**. Se a tela oferecer limite de usos ou data de vencimento, marque **20 usos** e a data do fim da inauguração.
3. Link 2: título `Porta Aberta · Abertura`, valor **R$ 497,00**, mesmos meios.
4. Se a tela pedir uma página para depois do pagamento, use `https://creat-nuvem-404b1994.base44.app/obrigado/`. Não confirmei se o Link de pagamento tem esse campo.
5. Copie as duas URLs. Elas costumam ser `https://mpago.la/...`; formatos `mpago.li` e `link.mercadopago.com.br` também passam.

Taxas, segundo mercadopago.com.br/ferramentas-para-vender/link-de-pagamento, lido em 09/11/2026:
- Pix: 0,99%. Em R$ 297, são R$ 2,94 de taxa e R$ 294,06 líquidos.
- Cartão com recebimento na hora: 4,98%.
- Parcelar em 2x sem acréscimo para o comprador: mais 2,53%.
- Vendedor novo pode receber em 7 dias até liberar.

### 3.2 Colar no `checkout.config.js` e conferir

```js
links: {
  aberturaInauguracao: 'https://mpago.la/XXXXXXX',   // link de R$ 297
  aberturaPadrao: 'https://mpago.la/YYYYYYY',        // link de R$ 497
  bastidores: '[LINK_CAKTO_BASTIDORES]'               // ver nota abaixo
},
```

```bash
cd projetos/creat-nuvem
node scripts/checar-placeholders.cjs   # vai acusar só o [LINK_CAKTO_BASTIDORES]
node scripts/checar.cjs
CREAT_TESTE_TMP=/tmp npm test
```

`[LINK_CAKTO_BASTIDORES]` continua travando o deploy da Cloudflare. Para destravar, crie um terceiro Link de pagamento no Mercado Pago, `Bastidores` a **R$ 67**, e cole em `bastidores`. Também serve um Payment Link do Stripe (`buy.stripe.com`). No Base44, a vitrine já funciona com os dois links da Abertura, mesmo com o marcador do bastidores aberto.

Teto de 20 Aberturas de inauguração (corrigido em 10/11/2026): os 7 links de R$ 297 são **preferências do Checkout Pro** (`pref_id`), não "Link de pagamento" do painel. Preferência do Checkout Pro **não tem quantidade máxima**; esse campo só existe no Link de pagamento. Portanto não existe "soma dos tetos". A trava real é o vencimento da preferência (`expires` e `expiration_date_to`), aplicado de uma vez nas 7 pela função `portaAbertaFecharPrefs` quando a tarefa executora conta 19 Aberturas pagas (seção "Funções portaAberta* no AutoCreatFlux", abaixo).

Quando a inauguração acabar (20 vagas):
1. Rode `node scripts/atualizar-vagas.cjs --inauguracao off` (ou ele desliga sozinho na 20ª `--vendeu`). Ele imprime a lista de **todos** os links de preço de inauguração a desativar: `aberturaInauguracao`, os 6 de `linksPorPraca` e os 2 combos do anual da seção abaixo.
2. Desative cada um no Mercado Pago.
3. Volte `aberturaInauguracao` para o marcador e `linksPorPraca` para `{}` no `checkout.config.js` e publique. A rotina diária (`--rotina`) falha até isso ser feito.

### 3.3 Mensalidade no Plano B (Stripe Payment Links, sem código)

A mensalidade só começa quando o site vai ao ar (termos, cláusula 7), por isso ela **não** entra em `/abrir/`.

1. No painel do Stripe (modo ao vivo), crie o produto `Porta Aberta · Plano Aberto` com preço recorrente **mensal de R$ 147,00 BRL**.
2. Crie o produto `Porta Aberta · Plano Vitrine` com preço recorrente **mensal de R$ 297,00 BRL**.
3. Para cada preço, crie um **Payment Link**. Em "Após o pagamento", escolha redirecionar para `https://creat-nuvem-404b1994.base44.app/obrigado/?assinatura=ok`.
4. Ative o **Portal do cliente** (Configurações > Faturamento > Portal do cliente), com cancelamento liberado. A página promete "sem fidelidade", e o cliente precisa conseguir cancelar sozinho.
5. Guarde os dois links `https://buy.stripe.com/...`. No dia em que o site for ao ar, o Suporte Creat manda o link do plano escolhido pelo WhatsApp (`marketing/whatsapp-scripts.md`). Os dois passam em `linkValido` se um dia forem para uma página.

Tarifas, segundo stripe.com/br/pricing, lido em 09/11/2026: cartão nacional 3,99% + R$ 0,39; Billing 0,7%. Isso dá cerca de R$ 7,29 por mês no plano de R$ 147 e cerca de R$ 14,32 no de R$ 297 (conta minha).

### 3.4 O que o Plano B não faz (por isso é ponte)

- **Não há `order_id` nem confirmação automática.** O `/obrigado/` só abre se o Link de pagamento tiver redirecionamento (passo 3.1.4) ou se a pessoa voltar sozinha. O pedido (PEDIDO v1) continua salvo no aparelho, e a conciliação é manual, pelo painel do Mercado Pago.
- **Não há Purchase no servidor**, então a campanha continua sem venda atribuída. Use as etiquetas do WhatsApp Business ("Paid") e o `utm_campaign` do pedido.
- **O link de R$ 297 vale até ser desativado à mão.**
- **Ajuste recomendado na vitrine (Pixel, `assets/vitrine.js`).** Com link de provedor, o pagamento abre em outra aba e esta aba vai para `/obrigado/` com o pedido pronto para enviar no WhatsApp. Assim o pedido não se perde mesmo sem redirecionamento:

```js
// em aplicarCheckout(), no ramo ok:
btn.setAttribute('target', '_blank'); btn.setAttribute('rel', 'noopener noreferrer');
// no click dos botões [data-checkout] de paginaAbrir(), depois de evento('checkout_iniciado', ...):
setTimeout(function () { location.assign(RAIZ + 'obrigado/'); }, 300);
```

Isso muda a interface. Antes de publicar, passa por `navegador` e `verificacao-visual` no `/abrir/` e no `/obrigado/`.

## 4. Plano A: Abertura pelo `createMercadoPagoCheckout` (código do AutoCreatFlux)

**Princípio.** O preço é decidido no servidor. A inauguração fecha sozinha na 20ª Abertura paga. O comprador não ganha conta no AutoCreatFlux. O Suporte Creat recebe um e-mail a cada venda. O Purchase vai à Meta no pixel `2223314621951948`, com `event_id` que dá para deduplicar. Todo o código abaixo segue o estilo do app (Deno, `npm:@base44/sdk@0.8.53`, `secrets` de `base44:runtime`). Nenhum segredo novo é necessário: usa `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` e `META_CAPI_ACCESS_TOKEN`, que já existem.

Antes de editar, crie um checkpoint no Base44 (`create_checkpoint`) para poder voltar.

### 4.1 Novo: `base44/shared/portaAberta.js`

```js
// Porta Aberta (Creat Nuvem): Abertura vendida pelo Checkout Pro do Mercado Pago.
// Preço e vagas decididos aqui, nunca no navegador. Sem conta de comprador no AutoCreatFlux.
import { PA_INAUG_ID, PA_PADRAO_ID, resolveOffer } from "./catalog.js";

export const PA_ORIGIN = "https://creat-nuvem-404b1994.base44.app";
export const PA_ORIGENS = new Set([PA_ORIGIN]); // acrescente o domínio da Cloudflare quando houver
export const PA_RETURN_PATH = "/obrigado/";
export const PA_TERMS = "termos-v1";            // igual a CREAT_CHECKOUT.termosVersao
export const PA_INAUG_VAGAS = 20;
export const PA_SUPORTE_EMAIL = "mttcreatt@gmail.com";
export const PA_PLANOS = new Set(["aberto", "vitrine", "aberto_anual", "vitrine_anual"]);
export const PA_NICHOS = new Set(["barbearia", "salao", "academia"]);
// Portão de venda no código (não é segredo). Fica false até a compra real de R$ 1 da seção 8.
export const PA_VENDAS_ABERTAS = false;

export const isPortaAberta = (id) => id === PA_INAUG_ID || id === PA_PADRAO_ID;

/** Vagas de inauguração restantes, contadas em pedidos PAGOS (não em pedidos abertos). */
export async function inauguracaoRestantes(Order) {
  const pagos = await Order.filter({ product_id: PA_INAUG_ID, payment_provider: "mercadopago", status: "paid" },
    "-created_date", PA_INAUG_VAGAS + 1);
  return Math.max(0, PA_INAUG_VAGAS - (Array.isArray(pagos) ? pagos.length : PA_INAUG_VAGAS));
}

/** Oferta que vale agora: inauguração enquanto houver vaga, depois a padrão. */
export async function aberturaAtual(Order) {
  const restantes = await inauguracaoRestantes(Order);
  return { offer: resolveOffer(restantes > 0 ? PA_INAUG_ID : PA_PADRAO_ID), restantes };
}

/** Avisa o Suporte Creat e manda o recibo ao comprador. Falha só vai para o log (sem dado pessoal). */
export async function notificarVendaPortaAberta({ base44, order, payment, log = () => {} }) {
  const [nicho = "", plano = ""] = String(order.store_segment || "").split("|");
  const valor = Number(order.amount).toFixed(2).replace(".", ",");
  const tarefas = [
    base44.asServiceRole.integrations.Core.SendEmail({
      to: PA_SUPORTE_EMAIL, template_name: "PortaAbertaVendaSuporte", category: "transactional",
      variables: { order_id: order.id, produto: order.product_title, valor, nicho, plano,
        meio: payment.payment_method_id || "mercadopago", mp_payment_id: String(payment.id),
        cliente_nome: order.customer_name || "", cliente_email: order.customer_email || "" },
    }),
  ];
  if (order.customer_email) tarefas.push(base44.asServiceRole.integrations.Core.SendEmail({
    to: order.customer_email, template_name: "PortaAbertaRecibo", category: "transactional",
    variables: { first_name: String(order.customer_name || "").trim().split(" ")[0] || "",
      produto: order.product_title, valor, order_id: order.id,
      proximo_passo: PA_ORIGIN + PA_RETURN_PATH },
  }));
  const r = await Promise.allSettled(tarefas);
  r.forEach((x, i) => { if (x.status === "rejected") log("PA_EMAIL_FAILED", (i ? "recibo " : "suporte ") + order.id); });
}
```

### 4.2 `base44/shared/catalog.js`: 2 ofertas novas

```js
export const PA_INAUG_ID = "porta_abertura_inaug";
export const PA_PADRAO_ID = "porta_abertura";
// dentro do new Map([...]):
 [PA_INAUG_ID, Object.freeze({PRODUCT_ID:PA_INAUG_ID,EXPECTED_PRICE_CENTS:29700,EXPECTED_CURRENCY:"BRL",title:"Porta Aberta · Abertura (inauguração)",termsVersion:"termos-v1",path:"/abrir/",returnOrigin:"https://creat-nuvem-404b1994.base44.app",returnPath:"/obrigado/",portaAberta:true})],
 [PA_PADRAO_ID, Object.freeze({PRODUCT_ID:PA_PADRAO_ID,EXPECTED_PRICE_CENTS:49700,EXPECTED_CURRENCY:"BRL",title:"Porta Aberta · Abertura",termsVersion:"termos-v1",path:"/abrir/",returnOrigin:"https://creat-nuvem-404b1994.base44.app",returnPath:"/obrigado/",portaAberta:true})],
```

Acrescente `returnOrigin?:string, portaAberta?:boolean` ao `@typedef Offer`. O preço vem destas constantes, não de um registro Product: o Porta Aberta não precisa de Product no banco.

### 4.3 `base44/functions/createMercadoPagoCheckout/entry.ts`: 4 mudanças

```ts
import {isPortaAberta,PA_VENDAS_ABERTAS,PA_PLANOS,PA_NICHOS,aberturaAtual} from "../../shared/portaAberta.js";
import {PA_INAUG_ID} from "../../shared/catalog.js";

// (a) issuePreference: retorno para a origem da oferta (Porta Aberta volta para o /obrigado/ dela)
const backUrl=(offer.returnOrigin||APP_ORIGIN)+returnRoute+"?provider=mercadopago&order_id="+order.id+"&product_id="+offer.PRODUCT_ID;
// e, só para o Porta Aberta, cartão em até 2x (texto do botão "Cartão em até 2x"):
const base=preferencePayload({offer,order,buyer,backUrl});
const payload=offer.portaAberta?{...base,payment_methods:{...base.payment_methods,installments:2}}:base;

// (b) logo depois de resolveOffer/TERMS_REQUIRED:
if(offer.portaAberta){
 if(!PA_VENDAS_ABERTAS)return reply({code:"SALES_CLOSED"},503);
 if(!PA_PLANOS.has(body.plano)||!PA_NICHOS.has(body.nicho))return reply({code:"INVALID_FIELDS",error:"Escolha o plano e o tipo de negócio."},400);
 const {offer:vale,restantes}=await aberturaAtual(base44.asServiceRole.entities.Order);
 // O navegador mostrou um preço; se as vagas acabaram, a página precisa mostrar o novo antes de cobrar.
 if(vale.PRODUCT_ID!==offer.PRODUCT_ID)return reply({code:"PRECO_MUDOU",product_id:vale.PRODUCT_ID,preco:vale.EXPECTED_PRICE_CENTS/100,inauguracao_restantes:restantes},409);
}

// (c) a trava de liberação do KIT/WEEK não se aplica ao Porta Aberta:
if(offer.PRODUCT_ID!==VENDEDOR24H_ID && !offer.portaAberta){ /* bloco productReleaseReady atual, sem mudança */ }

// (d) no Order.create, guardar nicho e plano (campo existente, sem migração):
...(offer.portaAberta?{product:"porta_aberta",store_segment:body.nicho+"|"+body.plano}:{}),
```

O resto continua igual, inclusive:
- portões `MERCADOPAGO_CHECKOUT_ENABLED`, `MERCADOPAGO_WEBHOOK_SECRET` e `PAYMENT_MODE==="live"`;
- Pix ativo;
- limite de 5 tentativas por e-mail a cada 30 min;
- reaproveitar link recente;
- "tentar de novo" com `order_id`.

Corrida na última vaga: se dois Pix de R$ 297 forem pagos juntos, a casa honra os dois e registra no relatório. É no máximo 1 vaga a mais.

Contrato da chamada que o `/abrir/` faz:

```http
POST https://creatmtt.com.br/functions/createMercadoPagoCheckout
Content-Type: application/json

{"product_id":"porta_abertura_inaug","accepted_terms":true,"terms_version":"termos-v1",
 "buyer_name":"Nome do responsável","buyer_email":"email@exemplo.com",
 "plano":"vitrine","nicho":"barbearia"}
```

| status | corpo | o que a página faz |
|---|---|---|
| 200 | `{url, order_id, mode:"live"}` | confere `CK.linkValido(url)`, guarda `order_id` e faz `location.assign(url)` |
| 400 | `PRODUCT_MISMATCH`, `TERMS_REQUIRED`, `BUYER_DETAILS_REQUIRED`, `INVALID_FIELDS` | mostra o erro no formulário |
| 409 | `PRECO_MUDOU` + `preco` | mostra o novo preço e pede para tocar em Pagar de novo |
| 429 | `TOO_MANY_ATTEMPTS` | mostra a mensagem e o WhatsApp do suporte |
| 503 | `SALES_CLOSED`, `MP_NOT_READY`, `PIX_UNAVAILABLE`, `MP_INVALID_CHECKOUT`, `MP_UNAVAILABLE` | cai no WhatsApp do suporte (nunca deixa o botão morto) |

### 4.4 `base44/functions/mercadoPagoWebhook/entry.ts`: o webhook que avisa o Suporte Creat

O webhook atual já faz quase tudo:
- valida o `x-signature`;
- relê o pagamento na API;
- confere `collector_id`, `live_mode`, valor e moeda (`decideMercadoPagoAccess`);
- só marca `paid` na primeira aprovação;
- passa o pedido para `refunded` em estorno.

Muda só o que vem depois da aprovação:

```ts
import {notificarVendaPortaAberta} from "../../shared/portaAberta.js";

if(decision.granted){
 if(offer.portaAberta){
  // Sem conta de comprador: o dono do negócio não usa o AutoCreatFlux.
  if(firstApproval) await notificarVendaPortaAberta({base44,order,payment,log});
  await trackPurchase(base44,order,offer,payment);   // Purchase server-side, uma vez (meta_purchase_sent_at)
  return reply("RECEIVED");
 }
 /* ramo atual (ensureBuyerAccount, sendBuyerWelcome, trackPurchase, CAPI do KIT), sem mudança */
}
```

Idempotência:
- O e-mail só sai em `firstApproval`, ou seja, `status` não era `paid` ou ainda não havia `mp_payment_id`.
- O Purchase só sai sem `meta_purchase_sent_at`.

O Mercado Pago espera 22 s pela resposta e repete a notificação a cada 15 min (documentação de webhooks, lida em 09/11/2026). Por isso a função responde `RECEIVED` rápido, e uma falha no e-mail não vira 503.

(Plano A antigo; ver a seção "Funções portaAberta* no AutoCreatFlux": quando a preferência traz `notification_url`, o Mercado Pago usa essa URL **no lugar** da configurada no painel, documentação lida em 10/11/2026.) O webhook atual é o configurado em "Suas integrações" do Mercado Pago, então o pedido do Porta Aberta chega a ele sem `notification_url` próprio. Antes de abrir as vendas, confira no painel (Suas integrações > Webhooks) que o tópico **Pagamentos** está ligado e aponta para `.../functions/mercadoPagoWebhook`.

Modelos de e-mail: crie no painel do Base44, onde já estão `BoasVindasCompra` e `Entrega47`.
- **`PortaAbertaVendaSuporte`**. Assunto: `Venda Porta Aberta: {{produto}} R$ {{valor}}`. Corpo: pedido, nicho, plano, meio, id do pagamento, nome e e-mail do cliente, e a frase "Aguarde o PEDIDO v1 no WhatsApp; se não chegar em 2 h, chame o cliente pelo e-mail".
- **`PortaAbertaRecibo`**. Assunto: `Pagamento confirmado: {{produto}}`. Corpo: valor, número do pedido e o próximo passo: "Abra {{proximo_passo}} e toque em Enviar pedido no WhatsApp". Sem promessa de resultado.

### 4.5 `base44/functions/verifyMercadoPagoPayment/entry.ts`: confirmação no `/obrigado/`

```ts
// depois de result.decision.granted:
if(offer.portaAberta){
 const {measurement}=await measureConfirmedPurchase({base44,order,offer,
  paymentTime:Math.floor(Date.parse(result.payment?.date_approved)/1000),
  consent:body.meta_consent,live:PAYMENT_MODE==="live",token:secrets.get("META_CAPI_ACCESS_TOKEN")});
 // Só o estado: o id do pedido não é segredo forte, então nada de nome ou e-mail na resposta.
 return Response.json({code:"AUTHORIZED",state:"authorized",order:{id:order.id,product_id:offer.PRODUCT_ID,status:"paid"},
  measurement:{event_id:measurement.event_id,value:measurement.value,currency:measurement.currency}},
  {headers:{"Cache-Control":"no-store"}});
}
```

No ramo `NOT_PAID` (402), para o Porta Aberta, devolva só `{code, state, payment_status, retry}`, sem `order.customer_*`.

### 4.6 Fechar as outras portas do catálogo

Como `resolveOffer` passa a conhecer os 2 ids, todo chamador que não é do Mercado Pago precisa recusá-los. Na primeira linha depois do `resolveOffer(...)`, inclua `if(offer?.portaAberta) return <a resposta de produto inválido que a função já usa>;` nestes arquivos:

- `functions/createCheckoutSession/entry.ts`
- `functions/verifyCheckoutSession/entry.ts`
- `functions/getMemberContent/entry.ts`
- `functions/getDeliveryPackage/entry.ts`
- `functions/getSalesAvailability/entry.ts`
- `functions/stripeWebhook/entry.ts` (nas linhas 49 e 100)

Em `shared/salesSnapshot.js`, confirme que a lista de ids não inclui os do Porta Aberta, ou inclua de propósito para o painel de vendas.

Em `shared/metaCapi.js`, use a origem da oferta no evento:

```js
event_source_url:(offer.returnOrigin||META_ORIGIN)+offer.path,
```

### 4.7 Vagas reais para a página: nova função `portaAbertaVagas`

```ts
import {createClientFromRequest} from "npm:@base44/sdk@0.8.53";
import {aberturaAtual} from "../../shared/portaAberta.js";
// GET público, sem dado pessoal: preço da Abertura que vale agora e vagas de inauguração restantes.
export default async function(req:Request):Promise<Response>{
 if(req.method!=="GET")return Response.json({code:"METHOD_NOT_ALLOWED"},{status:405});
 try{
  const base44=createClientFromRequest(req);
  const {offer,restantes}=await aberturaAtual(base44.asServiceRole.entities.Order);
  return Response.json({product_id:offer.PRODUCT_ID,preco:offer.EXPECTED_PRICE_CENTS/100,inauguracao_restantes:restantes},
   {headers:{"Cache-Control":"public, max-age=60"}});
 }catch{return Response.json({code:"UNAVAILABLE"},{status:503});}
}
```

### 4.8 Testes no AutoCreatFlux (antes de ligar `PA_VENDAS_ABERTAS`)

Crie `tests/porta-aberta-checkout.test.mjs` (`node --test`), com `client` falso (fetcher) para não tocar a API do Mercado Pago:

- `aberturaAtual` devolve 29700 com 19 pagos e 49700 com 20; pedido `pending` não conta vaga.
- POST sem aceite dá 400 `TERMS_REQUIRED`; e-mail inválido dá 400; plano ou nicho fora da lista dá 400 `INVALID_FIELDS`.
- `product_id` de inauguração com 20 pagos dá 409 `PRECO_MUDOU`; com `PA_VENDAS_ABERTAS=false`, 503 `SALES_CLOSED`.
- Preferência do Porta Aberta: `back_urls.success` começa com `https://creat-nuvem-404b1994.base44.app/obrigado/?provider=mercadopago&order_id=`, `installments` igual a 2 e Pix fora de `excluded_payment_types`.
- Webhook com assinatura inválida dá 401. Valor diferente não marca `paid`. A mesma aprovação entregue 2 vezes faz 1 update, 1 e-mail ao suporte e 1 Purchase. Pedido do Porta Aberta não chama `ensureBuyerAccount`.
- `createCheckoutSession` com `product_id:"porta_abertura"` é recusado.
- `verifyMercadoPagoPayment` do Porta Aberta não devolve `customer_name` nem `customer_email`.

## 5. Plano A no Porta Aberta (este repositório)

Faça isto só depois que a seção 4 estiver publicada e testada.

**`checkout.config.js`**:

```js
var API_HOSTS = ['creatmtt.com.br'];
function apiValida(v) {
  try { var u = new URL(v); return u.protocol === 'https:' && API_HOSTS.indexOf(u.hostname) !== -1 && u.pathname.indexOf('/functions/') === 0 && !u.username && !u.port; }
  catch (e) { return false; }
}
// em CREAT_CHECKOUT:
checkoutApi: 'https://creatmtt.com.br/functions/createMercadoPagoCheckout',
verificarApi: 'https://creatmtt.com.br/functions/verifyMercadoPagoPayment',
vagasApi: 'https://creatmtt.com.br/functions/portaAbertaVagas',
produtos: { aberturaInauguracao: 'porta_abertura_inaug', aberturaPadrao: 'porta_abertura' },
apiValida: apiValida,
```

**`assets/vitrine.js`** (Pixel implementa; Forja revisa o contrato):
1. `lerPrecos()`: se `CK.apiValida(CK.vagasApi)`, buscar `inauguracao_restantes` no servidor e usar no lugar de `dados/vagas.json`. A chave do link passa a ser `restantes > 0 ? 'aberturaInauguracao' : 'aberturaPadrao'`.
2. `aplicarCheckout()`: se `CK.apiValida(CK.checkoutApi)` e a chave começa com `abertura`, o botão fica ativo com `data-modo="api"` (sem `href` de provedor).
3. Click com `data-modo="api"`, depois de `lerFormPedido` e `salvarPedido`:

```js
e.preventDefault(); if (b.getAttribute('aria-busy') === 'true') return;
b.setAttribute('aria-busy', 'true'); b.textContent = 'Abrindo o pagamento seguro…';
fetch(CK.checkoutApi, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
  product_id: CK.produtos[precos.linkChave], accepted_terms: true, terms_version: CK.termosVersao,
  buyer_name: r.dados.responsavel, buyer_email: r.dados.email, plano: r.dados.plano, nicho: r.dados.nicho }) })
.then(function (res) { return res.json().then(function (j) { return { s: res.status, j: j }; }); })
.then(function (x) {
  if (x.s === 200 && CK.linkValido(x.j.url)) { guarda.gravar('creat:order:v1', x.j.order_id); location.assign(x.j.url); return; }
  if (x.s === 409 && x.j.code === 'PRECO_MUDOU') { precosPromessa = null; aviso('As vagas de inauguração acabaram agora. A Abertura passa a ser R$ ' + milhar(x.j.preco) + '. Confira e toque em Pagar de novo.'); /* reaplicar preços */ }
  else falhaPagamento(b);   // volta o rótulo e oferece o WhatsApp do suporte
}).catch(function () { falhaPagamento(b); });
```

4. `paginaObrigado()`: ler `provider`, `order_id` e `product_id` da query e **apagar a query na hora** com `history.replaceState`, antes de Pixel e Clarity lerem a URL. Depois, `POST CK.verificarApi {order_id, product_id}`.
   - 200: mostrar "Pagamento confirmado" e o botão "Enviar pedido no WhatsApp" que já existe.
   - 402 com `payment_status` igual a `pending` ou `in_process`: mostrar "Pix aguardando" e verificar de novo a cada 5 s, por até 2 min.
   - Outros casos: mostrar o WhatsApp do suporte.

   Não dispare Purchase no navegador sem o `measurement.event_id` do servidor. Se disparar, use esse mesmo `event_id`, para a Meta deduplicar.
5. **`_headers`** (só no deploy da Cloudflare): acrescentar `https://creatmtt.com.br` em `connect-src`. A ida ao Mercado Pago é navegação, e a CSP não bloqueia. O Base44 não manda CSP hoje.
6. **`scripts/checar-placeholders.cjs`**: com `apiValida(checkoutApi)` verdadeiro, os marcadores de abertura passam a ser opcionais.
7. **`scripts/atualizar-vagas.cjs`**: deixa de ser a fonte das vagas, que passam a ser contadas em Order pago.

## 6. Assinaturas Stripe de R$ 147 e R$ 297 (código, fase seguinte ao Plano B)

1. **Preços.** Use os 2 preços recorrentes mensais da seção 3.3 (o Payment Link é opcional). Anote os `price_...` e `prod_...` em `shared/portaAbertaAssinatura.js`, no padrão de `shared/motorAssinatura.js`:

```js
export const PA_SUB_APP_ID = "6ac3ea47df7bdd575f0a816e";
export const PA_SUB_PLANOS = Object.freeze({
  aberto:  { PRODUCT_ID: "porta_aberto_mensal",  priceId: "price_XXXX_ABERTO",  productId: "prod_XXXX_ABERTO",  cents: 14700 },
  vitrine: { PRODUCT_ID: "porta_vitrine_mensal", priceId: "price_XXXX_VITRINE", productId: "prod_XXXX_VITRINE", cents: 29700 },
});
export const PA_SUB_TERMS = "termos-v1";
```

   `validatePaPrice(price, plano)`: igual a `validateMotorPrice`, mas compara com `PA_SUB_PLANOS[plano].cents`. `validatePaSession(session, order)`: igual a `validateMotorSession`, com o `price` e o valor do plano gravado no pedido.
2. **Nova função `portaAbertaAssinatura`**, clone de `createMotorSubscriptionCheckout`, com estas diferenças:
   - Recebe `{order_id, t}`. O `t` é `deliveryToken(order_id, MERCADOPAGO_WEBHOOK_SECRET)`, no mesmo padrão de `shared/delivery47.js` (HMAC). O Suporte gera o link no dia em que o site vai ao ar, então ninguém assina sem ter feito a Abertura.
   - Exige um Order de Abertura (`porta_abertura*`) com `status:"paid"` e escolhe o plano pelo `store_segment` gravado. Os planos anuais não passam por aqui: saem como preferência avulsa do Mercado Pago (Pix), na seção 4, com um terceiro par de ofertas `porta_anual_aberto` (R$ 1.470) e `porta_anual_vitrine` (R$ 2.970).
   - `success_url`: `https://creat-nuvem-404b1994.base44.app/obrigado/?assinatura=ok&session_id={CHECKOUT_SESSION_ID}`. `cancel_url`: a mesma página com `?assinatura=cancelada`.
   - `idempotencyKey: "pa-sub-" + order.id`. Metadados: `base44_app_id`, `product_id` (o mensal) e `order_id` (o da Abertura), também em `subscription_data[metadata]`.
   - A URL devolvida precisa começar com `https://checkout.stripe.com/`, que `linkValido` já aceita.
3. **`stripeWebhook`** passa a tratar 3 eventos novos, filtrando por `metadata.base44_app_id` e pelos `product_id` mensais. Hoje ele só trata `checkout.session.*` e `charge.refunded`, então uma renovação que falha passa sem registro.
   - `invoice.paid`: grava `subscription_status:"active"` e a data do ciclo.
   - `invoice.payment_failed`: grava `past_due` e manda o e-mail `PortaAbertaCobrancaFalhou` ao Suporte.
   - `customer.subscription.deleted`: grava `canceled` e avisa o Suporte.

   Cada evento é idempotente pelo `event.id`: guarde o último id processado no pedido.
4. **Migração de schema** (reversível): no Order, acrescentar os campos opcionais `subscription_status` (enum `active|past_due|canceled`), `subscription_current_period_end` (date-time) e `stripe_last_event_id` (string). Para reverter, remova os 3 campos: nenhum código antigo os lê.
5. **Portal do cliente**: ativo, com cancelamento liberado (seção 3.3, passo 4).

## 7. O que vai para o log e o que não vai

- Log: código do erro, `order.id` e o id do pagamento. Nunca nome, e-mail, telefone ou corpo bruto do provedor. É o padrão do app: `sendMetaEvent` não devolve o erro bruto.
- Para a Meta vai só o e-mail com hash SHA-256 (`hashEmail`). O telefone não vai, porque o checkout não coleta.
- O nome do negócio, o WhatsApp e o endereço continuam indo pelo WhatsApp no `/obrigado/` (PEDIDO v1). Ao servidor vão só o nome e o e-mail do pagador, que o Mercado Pago exige.

## 8. Ordem de liberação

1. **Hoje**: Plano B, seções 3.1 a 3.3. Depois, `node scripts/checar-placeholders.cjs`, `node scripts/checar.cjs` e `CREAT_TESTE_TMP=/tmp npm test`. Em seguida, `navegador` e `verificacao-visual` no `/abrir/`.
2. **Plano A**, com `PA_VENDAS_ABERTAS=false`:
   - checkpoint no Base44;
   - código das seções 4.1 a 4.7;
   - testes da seção 4.8;
   - revisão pelo `revisor` e auditoria pela `seguranca` (rota pública com nome e e-mail).
3. **Compra real de R$ 1** por Pix, autorizada pelo Marcos. Acrescente ao catálogo, só durante o teste, uma terceira oferta `porta_teste` (R$ 1,00, `portaAberta:true`, aceita por `isPortaAberta` só enquanto o teste durar), compre por Pix e confira:
   - a volta ao `/obrigado/` com "Pagamento confirmado";
   - o e-mail no `mttcreatt@gmail.com`;
   - o Purchase em "Testar eventos" do Gerenciador de Eventos;
   - o estorno no painel, que precisa passar o pedido para `refunded`.

   Depois, remova a oferta de teste.
4. Ligar `PA_VENDAS_ABERTAS=true` e publicar. Trocar o `checkout.config.js` para `checkoutApi` (seção 5). Desativar os links `mpago.la` do Plano B.
5. A campanha nasce pausada e só é ativada depois da primeira compra real de ponta a ponta (`marketing/trafego/anuncios-meta.md`).

## 9. Fontes (todas lidas em 09/11/2026)

- Código do AutoCreatFlux, lido pelo MCP Base44 (app `6ac3ea47df7bdd575f0a816e`):
  - `base44/shared/`: `catalog.js`, `release.ts`, `offerCheckout.ts`, `mercadoPagoClient.js`, `mercadoPagoPreference.js`, `mercadoPagoAccess.js`, `metaCapi.js`, `purchaseMeasurement.js`, `motorAssinatura.js`, `buyerAccount.js`, `intlDelivery.js`
  - `base44/functions/`: `createMercadoPagoCheckout`, `mercadoPagoWebhook`, `verifyMercadoPagoPayment`, `mp47Webhook`, `checkout47`, `createMotorSubscriptionCheckout`, `stripeWebhook`
  - schemas `Order` e `Product`
- CORS ao vivo: `curl -X OPTIONS` com `Access-Control-Request-Headers: content-type` em `https://creatmtt.com.br/functions/createMercadoPagoCheckout` respondeu `200` com `access-control-allow-origin: *` e `access-control-allow-headers: content-type`. Um `GET` respondeu `405` com `access-control-allow-origin: *`.
- Mercado Pago: https://www.mercadopago.com.br/ferramentas-para-vender/link-de-pagamento (taxas) e https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-orders/resources/notifications/webhooks (x-signature, 22 s, reenvio a cada 15 min). Os dois foram lidos na pesquisa da equipe em 09/11/2026; não reabri.
- Stripe: https://stripe.com/br/pricing e https://support.stripe.com/questions/how-to-enable-pix-as-a-payment-method-in-brazil?locale=pt-BR (Pix só avulso no Brasil, sem Pix Automático). Também vêm da pesquisa da equipe, em 09/11/2026.


## Links criados em 09/11/2026 (função isolada `portaAbertaLinks`, executada pela automação do Base44 e apagada em seguida)

Conta Mercado Pago (collector 2189692475, MLB, Pix ativo). Preferências do Checkout Pro sem vencimento quando criadas (Pix e cartão até 2x; boleto e caixa eletrônico excluídos; retorno a `/obrigado/?pago=mp&produto=<id>`). O estado lido em 10/11/2026 está na seção "Preferências lidas em 10/11/2026":

| item | valor | link |
|---|---|---|
| Abertura (inauguração) · `pa-abertura-inauguracao-2026-11` | R$ 297 | https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-388377b3-87f4-43db-b88c-af75b6ce6526 |
| Abertura · `pa-abertura-2026-11` | R$ 497 | https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-fc609d62-006f-49e5-ae5a-93e73f762a68 |
| Bastidores · `pa-bastidores-2026-11` | R$ 67 | https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-ff658538-9778-4e95-9b68-f167334aea7a |
| Teste (compra real de R$ 1, estornar depois) · vale até 12/11/2026 17:27 UTC | R$ 1 | https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-b1f51c8f-b3f3-4f5f-a9d8-12052accfebc |

Observação: a função rodou duas vezes (a primeira sem registrar a saída). As preferências da primeira rodada existem na conta e não estão em uso; não movimentam nada.

Stripe (ao vivo), assinaturas mensais no cartão, com retorno a `/obrigado/?assinatura=ok&plano=<id>`:

| plano | preço | Payment Link | ids |
|---|---|---|---|
| Plano Aberto | R$ 147/mês | https://buy.stripe.com/7sYbIV5JIe7nfvR09r2cg00 | prod_Vb8Av7Zjgt0r9x · price_1UZvuS9f9VS5QiOdfqoVjVeM · plink_1UZvuT9f9VS5QiOdlnfzdQFX |
| Plano Vitrine | R$ 297/mês | https://buy.stripe.com/28EcMZ7RQbZf2J56xP2cg01 | prod_Vb8AePk1jhaPaj · price_1UZvuT9f9VS5QiOdciA6kHiB · plink_1UZvuT9f9VS5QiOdUIcWTUPt |

Portal do assinante (cancelar ao fim do período, trocar cartão, faturas), configuração `bpc_1UZvuT9f9VS5QiOdCO4l5tkY`: https://billing.stripe.com/p/login/7sYbIV5JIe7nfvR09r2cg00

Pendências que continuam: o webhook do AutoCreatFlux ignora estes pagamentos (sem Order), então a confirmação é pela conciliação do painel do Mercado Pago e pelas etiquetas do WhatsApp até o Plano A (funções `portaAberta*` isoladas) entrar.

## Links do plano anual criados em 09/11/2026 (Mercado Pago, Pix ou cartão em até 12x)

Criados por uma função isolada de uso único (`portaAbertaAnual`) no AutoCreatFlux, executada uma vez e apagada, junto com a automação que a chamou. Conta recebedora 2189692475. Sem vencimento quando criados (estado em 10/11/2026 na seção seguinte).

| produto | valor | link |
|---|---|---|
| Plano Aberto anual (12 meses pelo preço de 10) | R$ 1.470 | https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-b59a2303-a790-4649-bdf2-a2a9ee223bf2 |
| Plano Vitrine anual (12 meses pelo preço de 10) | R$ 2.970 | https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-65fb5ba7-2b72-4712-9070-3a7268468aef |
| Abertura (inauguração) + Plano Aberto anual | R$ 1.767 | https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-78effa57-7b26-4cd5-9617-6d6bc32cce32 |
| Abertura (inauguração) + Plano Vitrine anual | R$ 3.267 | https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-9914ecb8-0c03-45b7-a9bc-3c36972f372d |

Regras (decisão D3 do diretor, 10/11/2026): **a página não cobra o anual antes de o site existir.** Em `/abrir/`, quem escolhe o anual paga hoje só a Abertura (link da praça ou padrão) e lê que o plano anual é cobrado no dia em que o site entra no ar, pelo valor mostrado. Nesse dia, a equipe manda o link do anual sozinho (R$ 1.470 ou R$ 2.970, as duas primeiras linhas). O anual segue os termos (cláusula 4 e cláusula 7: devolução proporcional aos meses inteiros não usados).

Os dois combos (Abertura + anual num Pix só) **saíram** do `checkout.config.js` e não devem ser enviados a cliente: cobram o anual antes de o site existir. Ficam listados aqui só para o fim da inauguração: eles usam o preço de inauguração e continuam ativos no Mercado Pago até alguém desativar. `scripts/atualizar-vagas.cjs` os inclui na lista de links a desativar.

## Preferências lidas em 10/11/2026 (pacote 1B, PG-09 e PV-07)

Forja, 10/11/2026. Leitura por GET `https://api.mercadopago.com/checkout/preferences/<id>` feita por uma função isolada e temporária do AutoCreatFlux (`portaAbertaPrefs`), protegida por código de uso único e prazo, que usou o token no lugar e devolveu só campos de configuração (nenhum token, nenhum dado de pagador). A função foi apagada em seguida e hoje responde `404 Backend function 'portaAbertaPrefs' not found or not deployed` nos dois domínios. Foram lidas as 14 preferências do Porta Aberta: as 7 de R$ 297, a de R$ 497, a de Bastidores, as 2 anuais, os 2 combos (Abertura + anual) e a de teste.

| preferência | external_reference | valor | back_urls.success | pending e failure | auto_return | expires | expiration_date_to | notification_url | parcelas |
|---|---|---|---|---|---|---|---|---|---|
| `388377b3` Abertura inauguração (padrão) | `pa-abertura-inauguracao-2026-11` | R$ 297 | `/obrigado/?pago=mp&produto=pa-abertura-inauguracao` | iguais à success | `approved` | false | nenhum | nenhuma | 2 |
| `c33953d5` Abertura inauguração · feira | `pa-abertura-inauguracao-feira-2026-11` | R$ 297 | `/obrigado/?pago=mp&produto=pa-abertura-inauguracao&praca=feira` | iguais à success | `approved` | false | nenhum | nenhuma | 2 |
| `621eec2b` Abertura inauguração · salvador-rms | `pa-abertura-inauguracao-salvador-rms-2026-11` | R$ 297 | `/obrigado/?pago=mp&produto=pa-abertura-inauguracao&praca=salvador-rms` | iguais à success | `approved` | false | nenhum | nenhuma | 2 |
| `b41d58df` Abertura inauguração · fortaleza | `pa-abertura-inauguracao-fortaleza-2026-11` | R$ 297 | `/obrigado/?pago=mp&produto=pa-abertura-inauguracao&praca=fortaleza` | iguais à success | `approved` | false | nenhum | nenhuma | 2 |
| `27ab4073` Abertura inauguração · recife | `pa-abertura-inauguracao-recife-2026-11` | R$ 297 | `/obrigado/?pago=mp&produto=pa-abertura-inauguracao&praca=recife` | iguais à success | `approved` | false | nenhum | nenhuma | 2 |
| `1b66d83c` Abertura inauguração · petrolina-juazeiro | `pa-abertura-inauguracao-petrolina-juazeiro-2026-11` | R$ 297 | `/obrigado/?pago=mp&produto=pa-abertura-inauguracao&praca=petrolina-juazeiro` | iguais à success | `approved` | false | nenhum | nenhuma | 2 |
| `88c3e2e4` Abertura inauguração · aracaju | `pa-abertura-inauguracao-aracaju-2026-11` | R$ 297 | `/obrigado/?pago=mp&produto=pa-abertura-inauguracao&praca=aracaju` | iguais à success | `approved` | false | nenhum | nenhuma | 2 |
| `fc609d62` Abertura (padrão) | `pa-abertura-2026-11` | R$ 497 | `/obrigado/?pago=mp&produto=pa-abertura` | iguais à success | `approved` | false | nenhum | nenhuma | 2 |
| `ff658538` Bastidores | `pa-bastidores-2026-11` | R$ 67 | `/obrigado/?pago=mp&produto=pa-bastidores` | iguais à success | `approved` | false | nenhum | nenhuma | 2 |
| `b59a2303` Plano Aberto anual | `pa-anual-aberto-2026-11` | R$ 1.470 | `/obrigado/?pago=mp&produto=pa-anual-aberto` | iguais à success | `approved` | false | nenhum | nenhuma | 12 |
| `65fb5ba7` Plano Vitrine anual | `pa-anual-vitrine-2026-11` | R$ 2.970 | `/obrigado/?pago=mp&produto=pa-anual-vitrine` | iguais à success | `approved` | false | nenhum | nenhuma | 12 |
| `78effa57` Combo Abertura + Aberto anual | `pa-combo-aberto-anual-2026-11` | R$ 1.767 | `/obrigado/?pago=mp&produto=pa-combo-aberto-anual` | iguais à success | `approved` | false | nenhum | nenhuma | 12 |
| `9914ecb8` Combo Abertura + Vitrine anual | `pa-combo-vitrine-anual-2026-11` | R$ 3.267 | `/obrigado/?pago=mp&produto=pa-combo-vitrine-anual` | iguais à success | `approved` | false | nenhum | nenhuma | 12 |
| `b1f51c8f` Teste (pa-teste) | `pa-teste-2026-11` | R$ 1 | `/obrigado/?pago=mp&produto=pa-teste` | iguais à success | `approved` | true | 2026-11-12T17:27:43.316+00:00 | nenhuma | 2 |

O que a leitura prova:
- `auto_return` já é `approved` nas 14. O receio do PG-09 (quem paga com cartão fica parado na tela do Mercado Pago) não procede.
- `back_urls`: success, pending e failure são a **mesma URL** nas 14. A página `/obrigado/` só distingue o resultado pelo `collection_status` que o Mercado Pago acrescenta. Procede.
- Nenhuma preferência tem `notification_url`. Os pagamentos caem no webhook do painel (`mercadoPagoWebhook`), que os ignora porque o `external_reference` não é um `Order` (conferido no código: `Order.filter({id: external_reference})` devolve 0 linhas e a resposta é `IGNORED`).
- Vencimento: só a de teste vence (12/11/2026 17:27:43 UTC). **As 7 de R$ 297 não vencem**, e os combos também não. Procede o PV-07.
- Parcelas: até 2x nas de Abertura, Bastidores e Teste; até 12x nas anuais e nos combos. Não há contradição entre as linhas 469 e 491: são produtos diferentes (confirma o "motivo" do PG-09).
- Todas têm `metadata.origem = "porta-aberta"` e `metadata.produto`; nenhuma tem `payer`.

### PUT planejado e NÃO aplicado (bloqueado em 10/11/2026)

A alteração foi recusada pelo sistema de permissões da sessão no momento do primeiro PUT (na preferência de teste). Nada foi alterado no Mercado Pago. Nada foi contornado. O que falta, por grupo:

| grupo | preferências | back_urls | auto_return | notification_url | vencimento |
|---|---|---|---|---|---|
| inauguração | as 7 de R$ 297 e os 2 combos | a URL atual com `&resultado=aprovado`, `&resultado=recusado` e `&resultado=pendente` (mantém `pago`, `produto` e `praca`) | `approved` | `https://creatmtt.com.br/functions/portaAbertaNotificacao` | `expires=true`, `expiration_date_to=2026-12-10T23:59:59.000-03:00` |
| permanente | R$ 497, Bastidores, as 2 anuais | idem | `approved` | idem | sem vencimento |
| teste | `pa-teste` (R$ 1) | idem | `approved` | idem | `expires=true`, `expiration_date_to=2026-11-16T23:59:59.000-03:00` |

Fim da inauguração: `dados/vagas.json` não tem campo de fim. Pela regra do pacote, o vencimento usado é 30 dias à frente (10/12/2026 23:59 de Brasília). A trava das 20 vagas não depende dessa data: ela vem de `portaAbertaFecharPrefs`.

Como aplicar quando houver autorização: o código da função temporária e o código de uso único estão no scratchpad do pacote 1B (fora do repositório). O roteiro é recriar `portaAbertaPrefs`, chamar `modo:"aplicar"` só com a de teste, conferir o GET devolvido, chamar para as outras 13, apagar a função e provar o 404 com `curl`. A função confere que os itens (valor e id) ficaram iguais depois do PUT. Se o Mercado Pago recusar PUT em alguma preferência, ela registra o erro e não recria nada (recriar é da onda 6).

Consequência enquanto o PUT não sai: a `pa-teste` vence em **12/11/2026 17:27 UTC**; as 7 de R$ 297 continuam sem vencimento (a trava das 20 vagas segue funcionando por `portaAbertaFecharPrefs`, que só mexe no vencimento); e os pagamentos continuam sem aviso ao servidor (só `/obrigado/` chama a confirmação).

## Funções portaAberta* no AutoCreatFlux (pacote 1B)

Exceção à regra 11 registrada em `docs/ADR-007-funcoes-portaaberta-no-autocreatflux.md`. Nenhuma função existente foi alterada: o diff contra o checkpoint `6af32505611af499513bdbdc` só tem acréscimos (`PortaAbertaLimite.jsonc` e as 3 funções abaixo). Nenhuma importa módulo do AutoCreatFlux nem toca em `Order`.

| função | tipo | contrato | proteção |
|---|---|---|---|
| `portaAbertaVerificar` | pública, `POST` | `{payment_id: "^\d{6,14}$", email_candidato?}` devolve `{aprovado:false}` para pagamento inexistente **ou** que não é do Porta Aberta (mesmo corpo de 18 bytes e tempo mínimo de 1,2 s); para pagamento do Porta Aberta devolve `{aprovado, valor, external_reference, email_confere}`. `aprovado` exige `status=approved`, `BRL`, `live_mode` e o recebedor 2189692475. Nunca devolve e-mail, hash, nome, CPF, meio nem hora | limite gravado em `PortaAbertaLimite`: 60 por hora por origem (chave HMAC com a hora) e 10 por hora por pagamento (trava o teste de vários e-mails contra o mesmo pagamento); passou, `429 {code:"TOO_MANY_ATTEMPTS"}`. Corpo maior que 1 KB: 413; `payment_id` fora do formato ou objeto: 400; método diferente de POST: 405 |
| `portaAbertaNotificacao` | webhook, `POST` | `?data.id=<id>&type=payment` com `x-signature` e `x-request-id`. Responde `200 {code:"RECEIVED"}` na hora e segue em segundo plano: reconsulta o pagamento por GET, ignora o que não é do Porta Aberta e, se aprovado, chama `POST https://creat-nuvem-404b1994.base44.app/functions/confirmarPagamento {payment_id}` (pacote 1A), com 1 nova tentativa em 20 s | assinatura HMAC com `MERCADOPAGO_WEBHOOK_SECRET` (manifesto `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`), `ts` com tolerância de 5 min (aceita segundos ou milissegundos), comparação em tempo constante, `401` sem corpo. Idempotente: registro em `PortaAbertaLimite` com chave HMAC de (pagamento, status); aprovado fica 30 dias, o resto 1 h. Formato antigo IPN (`?topic=&id=`) não é assinado: `200 IGNORED` sem nenhuma ação |
| `portaAbertaFecharPrefs` | admin, `POST` | `{codigo?, ensaio?}`. Só antecipa para daqui a 1 min o vencimento das 7 preferências de R$ 297 (lista fixa no código). Confere antes que cada uma é de R$ 297 e `pa-abertura-inauguracao`. `{ensaio:true}` só lê. Devolve `{ok, ensaio, prefs:[{id, ok, expira_em}]}`, sem token | usuário admin do AutoCreatFlux **ou** o código de confirmação (o hash fica no código; o código fica só no workflow que a chama). Sem nenhum dos dois: `403` |

Entidade `PortaAbertaLimite` (`chave` HMAC de 32 hex, `tipo`, `n`, `expira_em`): leitura e escrita só para admin; o anônimo recebe lista vazia na leitura e `403` na criação. Nunca guarda IP, e-mail ou id em claro. Linhas vencidas são apagadas aos poucos a cada chamada.

Limite conhecido: o contador só acrescenta linhas (não perde contagem), mas uma rajada em paralelo antes da primeira linha gravada passa inteira uma vez (medido: 11 chamadas simultâneas passaram, as 3 seguintes deram 429).

Segredo app a app: o MCP do Base44 só grava segredo recebendo o valor na chamada, o que obrigaria o valor a passar pela conversa. Por isso `portaAbertaVerificar` **não** exige segredo do app Porta Aberta. A defesa é a resposta mínima (igual para inexistente e de outro produto), o limite por pagamento e por origem e a ausência de qualquer dado pessoal na saída. Revisão quando houver credencial própria do Mercado Pago no app Porta Aberta (ADR-007).

CORS: o `OPTIONS` das funções responde `access-control-allow-origin: *` pela plataforma (não é configurável na função). Nenhuma delas devolve dado pessoal, então isso não abre leitura de dado.

### notification_url x webhook do painel (fato, documentação lida em 10/11/2026)

Fonte: `https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications`.
- **Substitui, não soma.** Texto da página: "As URLs configuradas durante a criação de um pagamento terão prioridade sobre aquelas configuradas através de Suas integrações." Com `notification_url` na preferência, o aviso daquele pagamento vai para `portaAbertaNotificacao`, e o `mercadoPagoWebhook` deixa de recebê-lo (hoje ele já o ignora).
- **Assinatura da notification_url: a documentação não garante.** A assinatura secreta (`x-signature`) é descrita como recurso da configuração por "Suas integrações" ("validar a origem da notificação através de uma assinatura secreta"); a seção de `notification_url` não fala em assinatura. Por isso a verdade é sempre a reconsulta por GET. Se a compra de teste mostrar que o aviso da `notification_url` chega **sem** `x-signature`, a função responde 401 e o Mercado Pago repete a cada 15 min sem efeito; a confirmação continua pela volta a `/obrigado/`. Nesse caso a correção é aceitar o aviso sem assinatura (ele só dispara um GET, que é a verdade) e manter o 401 só para assinatura presente e errada. **NÃO VERIFICADO**: depende da compra de teste do dono.
- `ts` vem em milissegundos (exemplo da página: `ts=1742505638683`). O Mercado Pago espera 22 s pela resposta e repete a cada 15 min até receber 200.

## Pedido antes do pagamento e confirmação (D2/D3)

Contrato completo do pedido, das funções do app Porta Aberta e dos estados: `docs/PEDIDO-API.md` (pacote 1A). Aqui fica a parte do pagamento.

**Por que precisa de regra de casamento.** As 7 preferências de R$ 297 são fixas por praça (`external_reference = pa-abertura-inauguracao-<praça>-2026-11`). O pagamento não traz o id de quem comprou. O pedido é gravado no clique em Pagar (`registrarPedido`, estado `aguardando_pagamento`) e o pagamento é casado depois.

**Quem chama o quê.**
1. `/obrigado/` (volta do Mercado Pago, com `payment_id`) e `portaAbertaNotificacao` (aviso do Mercado Pago) chamam `confirmarPagamento` do app Porta Aberta.
2. `confirmarPagamento` chama `portaAbertaVerificar` com o `payment_id` e o e-mail do pedido candidato, e só confia no que ela devolve.

**Estados do pedido** (definidos no 1A): `aguardando_pagamento`, `pago`, `a_conferir`, `recusado`, `em_revisao`, `em_producao`, `rascunho_enviado`, `aprovado`, `no_ar`, `desistiu`, `teste_ok`.

**Regras de casamento** (toda regra exige valor e produto do pagamento iguais aos do pedido e pedido criado antes da aprovação; `payment_id` é único: um pagamento confirma um só pedido):
- Regra 1: `pedido_id` + segredo do pedido válidos + `email_confere: true` viram `pago`.
- Regra 2: sem `pedido_id`, o **único** pedido `aguardando_pagamento` com `email_confere: true` e mesmo valor vira `pago`.
- Regra 3: só o valor dentro da janela de 6 h **nunca** promove. Vira `a_conferir`, com o candidato sugerido no e-mail ao suporte, sem recibo e sem produção.
- `aprovado: false` de `portaAbertaVerificar` nunca promove nada.

**Limite declarado (heurística).** Quem paga com um e-mail diferente do digitado no pedido cai em `a_conferir`. Gatilho para trocar pelo Plano A (uma preferência por pedido, com o `pedido_id` no `external_reference`): **mais de 10% de `a_conferir` nos 20 primeiros pedidos**.

**Pedido de teste.** O link de teste fica em `checkout.config.js`, campo `teste` (`pa-teste`, R$ 1, `valeAte` lido na preferência). Ele não é botão de página e não gera Purchase no Pixel (`valorDaPreferencia` não o conhece; teste em `scripts/testes/checkout-config.test.mjs`). O pagamento `pa-teste` é do Porta Aberta para `portaAbertaVerificar` (devolve `valor: 1`), mas no app Porta Aberta o pedido `pa-teste` nunca vira `pago` nem entra em produção: vira `teste_ok` (pacote 1A). Hoje a preferência vence em 12/11/2026 17:27 UTC; a extensão até 16/11 depende do PUT bloqueado (seção acima). Se não puder ser estendida, cria-se outra de R$ 1 por função isolada, como em 09/11.

**Trava das 20 vagas.** A tarefa executora (pacote 1D, `docs/EXECUTOR.md`) conta as Aberturas pagas. Ao chegar a 19, roda o workflow "Porta Aberta · fechar R$ 297" do AutoCreatFlux, que chama `portaAbertaFecharPrefs`. As 7 preferências de R$ 297 vencem em 1 minuto. Pix já gerado antes disso ainda pode ser pago, então pode haver 1 ou 2 vagas a mais; a casa honra.
