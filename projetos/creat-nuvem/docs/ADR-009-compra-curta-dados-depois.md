# ADR-009 · Compra curta: dados depois do pagamento e prazo contado do pagamento

Status: decidido pelo diretor sob delegação, a confirmar com o dono · 11/11/2026 · Forja (backend), roteiro de operação · branch `compra-curta` (commits `d820e13` e `e1c36e7` do frontend)

## Contexto

- **A página de compra era longa demais e não vendeu.** Medido em 11/11 no celular de 360x640, com o plano Aberto: a borda de baixo do botão de pagar de `/abrir/` estava a 5.517 px do topo, cerca de 8,6 telas. Até essa medida, zero vendas do Porta Aberta. A compra curta pôs o botão a cerca de 1.341 px (com as fontes da web): antes de pagar, a pessoa informa só WhatsApp, e-mail e o aceite; quem cuida do negócio, endereço e horário ficam num bloco recolhido e, vazios, não vão no pedido.
- **O servidor já aceita o pedido sem esses campos.** `responsavel`, `endereco` e `horarios` são opcionais em `validarRegistro` (`schema/pedido-regras.mjs`) e no esquema da entidade desde o pacote 1A (PEDIDO-API.md, 4.1). A compra curta não precisou de nenhuma mudança de servidor.
- **Sem endereço e horário a produção não monta o site.** `entradaDoRegistro` marca os dois como falta, o `montar-pedido.mjs` sai 6 e o executor põe o pedido em `em_revisao` com `motivo_revisao: "faltam_dados"` (EXECUTOR.md, passo (e), Saída 6). A produção nunca usa endereço ou horário de exemplo. Com a compra curta, esse passa a ser o caso comum, não a exceção.
- **O prazo do código e dos termos não depende dos dados.** A cláusula 5 dos termos v2 conta as 72 h da confirmação do pagamento, e `prazoFim` grava isso na confirmação (72 h a partir de `inicioDoRelogio`: a hora da confirmação no horário de atendimento, ou as 11h do próximo dia de atendimento). O EXECUTOR.md ainda trazia a redação da termos-v1 ("da confirmação e dos 4 dados"), que nenhum código aplica.
- **A auditoria da compra curta reprovou por um ponto:** com o pedido sem dados como caminho comum, o relógio corre sozinho, e o passo (k) marca `garantia_mes_gratis` em quem demora a mandar os dados. Os termos não preveem pausa. Faltava decidir quem aceita esse risco.
- **Hoje não há rota para o comprador completar o pedido.** `registrarPedido` só cria e não sobrescreve; `consultarPedido` só lê; `aprovarRascunho` só aprova; `marcarPedido` é só de admin e não aceita `endereco`, `horarios` nem `responsavel` (PEDIDO-API.md, seção 5). Por isso o caminho dos dados é a conversa no WhatsApp do Suporte Creat, que o próprio comprador abre pelo `/obrigado/`.

## Decisão

Decisão do diretor, tomada sob a delegação permanente do dono de 11/11 ("resolva tudo"), reversível, mostrada ao dono no relatório:

- Os termos v2 **não mudam**.
- O prazo de 72 h continua contando da confirmação do pagamento (cláusula 5), também para o pedido pago sem endereço e horário.
- Se o cliente mandar os dados tarde demais para a produção terminar no prazo, vale a garantia do 1º mês do plano grátis, como os termos já dizem.
- A Creat aceita esse risco comercial, pequeno e a favor do cliente, para destravar a venda.

Como isso vira operação (EXECUTOR.md, passo (e), roteiro R-dados, e passo (k)):

1. No primeiro despertar depois do pagamento, o executor marca `faltam_dados` e avisa o suporte só com os nomes dos campos.
2. O comprador é levado pelo `/obrigado/` a mandar os dados pelo WhatsApp do suporte. Se não mandar, uma pessoa da equipe escreve ao WhatsApp ou ao e-mail do pedido, só sobre o pedido, pelo número oficial. Agente nenhum envia WhatsApp.
3. Os dados entram pelo painel do app (caminho previsto, **não verificado**) ou, como reserva, por `update_entities` numa sessão da equipe com o conector do Base44 (gravação provada em pedido de teste em 10/11). A linha 11d do ENSAIO prova o fluxo inteiro.
4. O pedido volta de `em_revisao` para `em_producao` e o despertar seguinte produz.
5. O `prazo_fim` não muda. Estourou: passo (k), `garantia_mes_gratis: true`.
6. Pedido pago há mais de 24 h ainda em `faltam_dados` abre o aviso ao dono, no topo da mensagem final do executor.

## Consequências

- **Risco aceito: o 1º mês grátis para quem demora.** Todo comprador que manda os dados tarde, ou nunca manda, ganha o 1º mês do plano grátis quando o `prazo_fim` passa. Custo máximo por pedido: uma mensalidade do plano escolhido (R$ 147 no Aberto, R$ 297 no Vitrine). O alerta de 24 h e o contato da equipe existem para isso acontecer pouco.
- **A produção nunca usa dado de exemplo.** Sem endereço e horário do cliente, não há site; nenhum texto, nenhum script e nenhuma pessoa preenche esses campos com valor de exemplo para cumprir o prazo.
- **Nenhum texto diz que o prazo depende dos dados.** Página, recibo, mensagens do suporte e o próprio EXECUTOR.md dizem o que o código faz: 72 h da confirmação do pagamento. Dizer que o site só é montado com os dados é fato da produção, não condição do prazo, e pode ser dito.
- **Mais atendimento 1:1 por pedido.** O R-dados é trabalho manual de quem atende o suporte em quase todo pedido, até existir a rota `completarPedido`. Isso vai contra a meta de reduzir conversa 1:1 e fica medido: quantos pedidos precisaram do item 3 do R-dados e quantos viraram 1º mês grátis entram no `RELATORIO.md`.
- **Privacidade.** O contato da equipe com o comprador pago, sem conversa aberta, só vale com a política de privacidade que o prevê: a versão 4 (seção 7, commit `0b8192e` nesta branch) cobre o WhatsApp e o e-mail do pedido, escritos por uma pessoa da equipe, só sobre o pedido. Ela ainda tem a marca `REVISAO_JURIDICA_PENDENTE`. Pendência do coordenador: a compra curta só sobe junto com ela.
- **O contato do R-dados só vale para pedido pago.** O item 3 do R-dados (a equipe escreve primeiro, só sobre o pedido) nunca se aplica a quem só viu a prévia ou não pagou: para esses vale a regra permanente do dono, "nunca mensagem a quem não pediu contato". Mesmo no pedido pago, escrever primeiro é decisão do dono, e será confirmada com ele junto com a decisão do prazo, no mesmo relatório.
- **Aviso da seção 12 da política.** A v4 amplia o contato com o comprador pago, e a seção 12 promete aviso a quem aceitou a versão anterior. Antes de publicar, o coordenador confere que nenhum pedido pago real aceitou a v3 (os de teste não contam); se houver algum, ele recebe o aviso por WhatsApp ou e-mail antes de a v4 valer para ele.
- **Cliques do dono.** Nenhum novo; a confirmação desta decisão vai no relatório.

## Alternativas não adotadas

- **Termos v3 com o prazo contado do recebimento dos dados.** Tira o risco do 1º mês grátis da Creat, mas muda o contrato, exige `termos-v3` com o sha256 novo no mesmo commit (`TERMOS` em `pedido-regras.mjs` e `checkout.config.js`), revisão jurídica, `prazo_fim` recalculado quando os dados chegam (função nova do 1A) e textos novos em home, FAQ, `/abrir/`, `/obrigado/` e recibo. É mais trabalho e mais atrito na promessa principal da página, num momento em que a venda é o problema.
- **Rota `POST /api/pa/completarPedido`** para o comprador completar o pedido dentro do `/obrigado/`. Corpo `{id, segredo, endereco?, horarios?, responsavel?}`. As mesmas travas das rotas públicas: `Sec-Fetch-Site` cross-site dá 403; corpo de até 2 KB; só POST; segredo comparado em tempo constante pelo sha256, com a mesma resposta 404 `nao_encontrado` para segredo errado e para id inexistente; limite de 6 por origem por hora; os mesmos formatos de `validarRegistro`. Tira o suporte do meio, mas é rota nova do pacote 1A, com deploy do app, revisão e segurança, fora desta etapa. **Não existe hoje.** Fica como o próximo passo natural se o R-dados pesar no atendimento ou se o 1º mês grátis ficar frequente.

## Como reverter

- **Para a alternativa dos termos v3:** publicar `termos-v3` (cláusula 5 com o prazo contado do recebimento dos dados), aceitar `termos-v3` em `TERMOS` com o sha256 novo e mandar essa versão no `checkout.config.js`, no mesmo commit; função do 1A que recalcula `prazo_fim` quando `endereco` e `horarios` são gravados; trocar a decisão D1 do EXECUTOR.md e o passo (k). Quem pagou na v2 continua na regra da v2.
- **Para a compra longa:** reabrir o bloco de dados em `/abrir/` antes do pagamento (frontend, `assets/vitrine.js` e `abrir/index.html`); o servidor não muda. O R-dados volta a ser exceção e este ADR passa a "substituído".
- **Para a rota `completarPedido`:** quando o 1A publicar, o item 4 do R-dados ganha esse caminho como o primeiro e o `/obrigado/` troca o botão de WhatsApp por um formulário. A decisão do prazo não muda.
