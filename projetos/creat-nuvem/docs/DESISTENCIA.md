# Desistência em 7 dias e pedido do titular (pacote 1D)

Trilho, 10/11/2026. Base: termos, cláusula 6 (Código de Defesa do Consumidor, art. 49) e cláusula 14 (dados pessoais). Achado PV-09. Estados do pedido em `docs/PEDIDO-API.md`, seção 3. Remoção do site pelo procedimento P1 a P9 de `docs/EXECUTOR.md`.

**Estado: NÃO PROVADO.** O roteiro roda inteiro no ENSAIO (EXECUTOR.md, seção 9, linha 8) antes do primeiro cliente real.

## Regra que vem antes de tudo

**Pedido não pago não gera contato nenhum.** Quem preencheu e não pagou (`aguardando_pagamento`, `recusado`) não recebe WhatsApp, e-mail, ligação nem lembrete. O WhatsApp fecha, não prospecta. A rotina do 1A apaga esses pedidos depois de 30 dias. Só se fala com quem chamou primeiro.

## 1. Quem pode desistir e até quando

- Quem pagou a Abertura, em até 7 dias corridos contados **do pagamento (`pago_em`) ou da entrega do rascunho (`rascunho_em`), o que vier por último**. Os dois são hora do servidor.
- Por quê: o Código de Defesa do Consumidor, art. 49, conta os 7 dias "da assinatura ou do ato de recebimento do produto ou serviço". O serviço só chega ao cliente com o rascunho, em até 72 horas ou mais (pedido em `em_revisao`). Contar só do pagamento faria o prazo vencer antes de o cliente ver o que comprou, o que pode ser lido como cláusula abusiva. Contar do que vier por último é o lado seguro.
- Na prática: o rascunho sempre sai depois do pagamento, então, com rascunho entregue, o fim é `rascunho_em` + 7 dias. Pedido ainda sem rascunho pode desistir a qualquer momento: o prazo nem começou a correr do lado do serviço. Um novo rascunho (`--novo-rascunho`) ou um link novo de aprovação (`link-aprovacao.cjs` e `gravarRascunho` de reenvio, EXECUTOR.md passo (i)) grava `rascunho_em` de novo, e o prazo passa a contar dele: é o lado do cliente.
- Vale mesmo com a produção já começada e mesmo com o site já no ar (cláusula 6).
- Pedido chegado depois desse fim: não é desistência legal. Vira cancelamento comum (cláusula 7), e o suporte explica com o texto da cláusula.
- **A mesma regra precisa estar nos termos** (cláusula 6, hoje "7 dias, contados do pagamento") **e nas respostas rápidas** antes do primeiro cliente real. Pedido ao copywriter, onda 2. Texto sugerido: "Você tem 7 dias para desistir sem dar motivo, contados do pagamento ou da entrega do rascunho do site, o que vier por último."
- Conta pronta para o suporte: `fim = max(pago_em, rascunho_em) + 7 dias`, até 23h59 de Salvador do último dia.

## 2. Confirmação imediata, com protocolo

- **Protocolo = o id do pedido** (`PA-` e 10 caracteres). Ele está no recibo de `/obrigado/` e no texto do PEDIDO. Quem não tem o id: o suporte acha pelo WhatsApp de quem escreveu, sem pedir documento.
- **O "imediato" é coberto pela automação de cada canal**, sem pessoa no meio:
  - WhatsApp Business do Suporte Creat: a saudação automática (primeira mensagem ou volta depois de 14 dias) e a mensagem de ausência (fora do horário) respondem na hora. Limite honesto: quem já conversou nos últimos 14 dias, dentro do horário, não recebe a saudação; aí a resposta é do suporte, em até 5 minutos (regra de `marketing/whatsapp-scripts.md`). A resposta rápida `/desisto` (R16, pedido ao copywriter; o número R14 já foi usado e virou O1 a O8) é o texto da confirmação.
  - E-mail do suporte: resposta automática ligada na caixa, dizendo que o pedido de desistência foi recebido, que o protocolo é o id do pedido, que a devolução é pedida no mesmo dia e que o valor volta em até 5 dias úteis (prazo máximo do meio de pagamento).
- Texto da confirmação (R16 `/desisto`, para o copywriter fechar):
  > Recebemos o seu pedido de desistência. Protocolo: {id}.
  > O site sai do ar hoje. A devolução é pedida hoje ao meio de pagamento e o valor volta pelo mesmo meio, em até 5 dias úteis (o prazo máximo do meio de pagamento).
  > Você não precisa fazer mais nada.

## 3. Os passos, nesta ordem

| # | quem | o quê | prova |
|---|---|---|---|
| 1 | suporte | confirma com o R16 e registra a hora do pedido | a mensagem enviada |
| 2 | suporte (ou coordenador) | marca o pedido `desistiu` no painel do app, com `desistiu_em` = hora do pedido e `estorno_prazo_em` = 5 dias úteis depois (segunda a sexta, sem feriado nacional), e **no mesmo ato** grava em `Operacao` a linha `remocao_pedido:<pedido_id>` (valor = `desistiu_em`, `expira_em` = agora + 7 dias). Sem essa linha a trava recusa a remoção (fecho 2 do F2: o tipo `remocao` não basta sozinho). A sessão executora nunca grava essa linha nem marca a desistência por conta própria | `query_entities` do pedido mostra os dois campos; `query_entities` `Operacao` mostra `remocao_pedido:<id>` |
| 3 | executor ou coordenador | tira o site de `public/sites/<slug>/`, o rascunho `public/sites/<slug>--r-<id>/` e a obra `porta-aberta/obras/<slug>--r-<id>/`: `run_command` `rm -rf` em cada caminho, um por um, nunca `public/sites` | `ls public/sites` |
| 4 | executor ou coordenador | `create_checkpoint` com o nome `executor remocao <pedido_id>` | id do checkpoint |
| 5 | executor ou coordenador | deploy pelo procedimento P1 a P9, `--tipo remocao --pedido <id>`, com o portão `so_remocao` (o diff desde o checkpoint de antes só apaga os caminhos do passo 3; EXECUTOR.md seção 6). Com a parada geral ligada, só o coordenador remove: ele grava `Operacao pausa_excecao` (valor = o id do pedido, `expira_em` = agora + 1 h) e passa `--apesar-da-pausa`. A remoção é obrigação legal. **A remoção não conta contra o teto de 3 deploys por hora nem espera por ele** (decisão D4, de 10/11/2026, EXECUTOR.md seção 10); remoção e rollback somados têm teto próprio de 6 por hora. Cada remoção fica numa linha própria de auditoria, `Operacao deploy_fora:remocao:<id>:<hora>`, por 400 dias (`registrar-deploy --tipo remocao --pedido <id>`) | saída do deploy e o `gravar` com a linha `deploy_fora:remocao:<id>:...` |
| 6 | executor ou coordenador | confere o 404: `curl -sL -o /dev/null -w '%{http_code}\n' https://nuvem.creatmtt.com.br/sites/<slug>/` e o mesmo para o rascunho (o `-L` é obrigatório: a hospedagem responde 307 de `/sites/<slug>/` para `/sites/<slug>`, e só o segundo salto dá 404); depois `node scripts/conferir-no-ar.cjs` | `404`, `404` e a última linha da conferência |
| 7 | **dono** | estorno no Mercado Pago (seção 4), **no mesmo dia do pedido** | `estorno_feito_em` gravado |
| 8 | **dono** | se já houver assinatura no Stripe, cancelar e estornar a cobrança feita dentro dos 7 dias (seção 4) | assinatura cancelada no painel |
| 9 | suporte | avisa o cliente que o estorno foi feito, no mesmo canal em que ele pediu | a mensagem enviada |

Se o site não estava no ar ainda (pedido em `pago`, `em_producao` ou `rascunho_enviado`), os passos 3 a 6 valem só para o rascunho e a obra que existirem.

**Prazo da remoção: no mesmo despertar em que a desistência é lida.** O executor lê a fila a cada despertar (de hora em hora, das 8h às 20h de Salvador, segunda a sábado). O despertar que encontra o pedido em `desistiu` com site, rascunho ou obra no app remove antes de produzir qualquer pedido novo. O teto por hora não segura a remoção (D4). O que ainda pode segurar: a trava de outro dono, que vence sozinha em no máximo 20 minutos; nesse caso o mesmo despertar tenta de novo no fim e, se ainda estiver presa, avisa com `ALERTA:`. Desistência marcada depois do último despertar do dia (20h41 de Salvador) ou no domingo: o coordenador remove no mesmo dia, pelo mesmo procedimento. Se isso não acontecer, ela sai no primeiro despertar seguinte e a promessa "O site sai do ar hoje" do R16 falhou: o despertar abre a mensagem com `ALERTA:` e o suporte avisa o cliente. Pedido em `desistiu` sem a linha `remocao_pedido:<id>`: o despertar não remove e abre a mensagem com `ALERTA: desistência do pedido <id> sem remocao_pedido`; quem marcou a desistência grava a linha e o despertar seguinte remove (ou o coordenador, no mesmo dia).

## 4. Estorno: passo do dono, pedido no mesmo dia, com teto de 5 dias úteis rastreado

O estorno é a única coisa aqui que exige o dono: nenhum agente tem acesso a dinheiro.

**Dois prazos, que não se confundem.** O art. 49 pede devolução imediata. Por isso: (1) **a devolução é pedida no mesmo dia** do pedido de desistência (o clique do dono em "Devolver dinheiro"); (2) **5 dias úteis é o teto** para o dinheiro chegar ao cliente, que é o prazo do meio de pagamento, não uma folga da Creat. `estorno_prazo_em` guarda o teto; o alerta do mesmo dia cobra o pedido.

**Mercado Pago (Abertura):**
1. Abra **https://www.mercadopago.com.br/activities** (Atividades) com a conta do recebedor.
2. Na busca, cole o número do pagamento (`payment_id` do pedido; o suporte copia do painel do app).
3. Abra o pagamento e clique em **Devolver dinheiro** (devolução total).
4. Grave `estorno_feito_em` no pedido (painel do app), ou mande "estorno feito {id}" ao suporte, que grava.

O formato de endereço direto para um pagamento específico **não foi verificado** (o painel exige login e esta sessão não abre a conta do dono). Por isso o caminho acima passa pela busca da página Atividades, que é o endereço público e estável do painel.

**Stripe (só se a mensalidade já foi assinada):** **https://dashboard.stripe.com/subscriptions**, procurar o id do pedido (vai como `client_reference_id`), **Cancel subscription** com efeito imediato e, na cobrança, **Refund**.

**Rastreio.** O executor lê, a cada despertar, os pedidos `desistiu` sem `estorno_feito_em`:
- no mesmo dia do `desistiu_em`: `ALERTA: estorno do pedido {id} pedido hoje. Devolver no Mercado Pago: https://www.mercadopago.com.br/activities` (notificação no celular do dono);
- o alerta repete a cada despertar até o `estorno_feito_em` aparecer;
- 2 dias úteis antes do `estorno_prazo_em`, o alerta passa a dizer "vence em 2 dias úteis", e no dia do teto, "vence hoje".

Os termos (cláusula 6) precisam dizer o mesmo: devolução pedida no mesmo dia, valor de volta em até 5 dias úteis pelo mesmo meio. Hoje dizem só "pelo mesmo meio de pagamento". O PV-09 propôs 2 dias úteis; o pacote 1D fixa o pedido no mesmo dia e usa 5 dias úteis só como teto do meio de pagamento. O copywriter alinha o texto antes de publicar (pedido em aberto, onda 2).

## 5. Apagar dado pessoal por pedido do titular (até 15 dias)

Qualquer pessoa que tenha deixado dados (cliente, desistente ou quem só preencheu) pode pedir para apagar. Prazo: até 15 dias corridos do pedido (compromisso da política de privacidade, onda 2).

1. Suporte confirma o pedido no mesmo canal, com o protocolo (id do pedido, ou a data do contato quando não houver pedido).
2. No pedido (`PedidoPortaAberta`), o suporte ou o executor apaga os campos pessoais: `negocio`, `whatsapp`, `email`, `cidade`, `servicos_texto`, `fotos` viram vazios, com `$unset` no `update_entities`. Ficam só id, produto, valor, datas, estado e `payment_id`, que são o registro do pagamento (obrigação fiscal e de defesa).
3. Site no ar de quem pediu: sai pelos passos 3 a 6 da seção 3. O site sai do ar na hora do deploy de remoção.
4. Cópias, uma por uma, com a verdade sobre cada uma:
   - **Repositório da Creat** (este, no GitHub): nada de cliente fica nele (`.gitignore` barra `sites/` de cliente e `pedidos/`). Isso vale só para o repositório da Creat.
   - **Checkpoints e histórico do app** (Base44, app `6aefffe66b684db9404b1994`): cada publicação passa por um `create_checkpoint`, e o app guarda o histórico de versões (git interno do app). A cópia do site removido, do rascunho e da obra **continua existindo nesses checkpoints e no histórico do app**. Ela fica até a plataforma permitir apagar um checkpoint ou o histórico, ou até o coordenador recriar o histórico do app sem ela. Nada disso é público: o histórico não é servido no endereço do site e o app não está ligado a repositório no GitHub (`connected: false`, conferido no P5 de EXECUTOR.md antes de cada deploy). Quem pede para apagar ouve isso com clareza (texto da política de privacidade, seção de eliminação de dados).
   - **Contêiner de cada sessão:** some ao fim dela.
   - **Conversa do WhatsApp:** apagada no aparelho do suporte.
5. Grave a data do atendimento em `Operacao titular_<protocolo>` com `expira_em` de 400 dias, sem nenhum dado pessoal no valor.

## 6. O que não fazer

- Não pedir motivo, documento nem "confirmação por ligação".
- Não oferecer desconto para a pessoa ficar. Ela pediu para sair.
- Não apagar `public/sites` inteiro, nem rodar `rsync --delete` em `public/`.
- Não esperar o estorno para tirar o site: a remoção é no mesmo dia.
