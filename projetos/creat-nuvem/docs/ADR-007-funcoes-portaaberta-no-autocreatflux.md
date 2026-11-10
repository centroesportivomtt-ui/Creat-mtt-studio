# ADR-007 · Funções portaAberta* no AutoCreatFlux (exceção à regra 11)

Forja (backend), 10/11/2026. Estado: aceito. Pacote 1B da onda 1.

## Contexto

A regra 11 do dono manda manter estruturas separadas: nada do Porta Aberta na operação antiga e nada da operação antiga no Porta Aberta. Mas a conta do Mercado Pago que recebe o Porta Aberta (recebedor 2189692475, Pix ativo) tem as credenciais guardadas só no AutoCreatFlux (`MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET`). Nenhum agente lê, copia ou transporta esses segredos. Para conferir um pagamento ou mexer numa preferência, o código precisa rodar onde o segredo está.

## Decisão

O AutoCreatFlux guarda **só** funções com o prefixo `portaAberta*`, sob estas condições:

1. **Isoladas.** Não importam nenhum módulo de `base44/shared/`, não leem nem gravam `Order`, não criam conta de comprador e não mandam e-mail. Nenhuma função existente do AutoCreatFlux é alterada.
2. **Sem dado pessoal guardado.** A única entidade é `PortaAbertaLimite` (limite de taxa e idempotência): chave HMAC de 32 hex, tipo, contador e validade. Nunca IP, e-mail ou id em claro. Só o papel admin lê ou grava.
3. **Sem token em trânsito.** O segredo é usado no lugar, pelo nome (`secrets.get`). Nenhuma resposta ou log traz token, e-mail, nome, CPF ou meio de pagamento. Única exceção, decidida pela segurança em 10/11/2026: `portaAbertaVerificar` devolve `aprovado_em` (hora da aprovação, sem dado pessoal) só para pagamento aprovado do Porta Aberta, porque a regra "pedido criado antes da aprovação" depende dela. O número do pagamento pode aparecer no log de alerta do webhook (não é dado pessoal). O dado pessoal do pedido mora no app Porta Aberta (pacote 1A), nunca aqui.
4. **Funções temporárias são apagadas** logo após o uso, com prova por `curl` de que respondem 404.

Funções permanentes: `portaAbertaVerificar` (pública), `portaAbertaNotificacao` (webhook), `portaAbertaFecharPrefs` (admin) e, desde 10/11/2026, `portaAbertaConciliar` (admin ou workflow). Contratos em `docs/INTEGRACAO-PAGAMENTO.md`, seção "Funções portaAberta* no AutoCreatFlux".

## Consequências

- O Porta Aberta depende de uma peça na estrutura antiga. Se alguém mexer no AutoCreatFlux sem saber, a confirmação de pagamento para. Mitigação: o prefixo `portaAberta*` e o comentário de cabeçalho de cada função dizem o que são e citam este ADR.
- `portaAbertaVerificar` é pública e não exige segredo do app Porta Aberta: o MCP do Base44 só grava segredo recebendo o valor na chamada, e o valor passaria pela conversa. A defesa é a resposta mínima, igual para pagamento inexistente e de outro produto, e o limite por pagamento e por origem.
- Fecho da onda 1 (10/11/2026, versão `1b-2026-11-10c`): sem segredo compartilhado novo, a confirmação de quem pagou deixou de disputar o limite com tentativas inventadas. `portaAbertaVerificar` aceita a lista de e-mails candidatos numa chamada só, o limite por origem só conta resposta sem pagamento aprovado do Porta Aberta (estourado, só o aprovado é respondido, com teto duro de 600 por hora por origem contra uso como amplificador de GET) e o limite por pagamento conta só e-mail errado. `portaAbertaNotificacao` trata `nao_confirmado` como passageiro (503 e novas tentativas) e `produto_fora_do_catalogo` como firme (200 e 30 dias). As duas mandam `X-PA-Versao` em toda resposta, para provar de fora qual código o runtime serve.
- Limite que sobra: o limite por origem usa `cf-connecting-ip`. Se outro app da mesma plataforma sair pelo mesmo IP do servidor do Porta Aberta, ele divide o mesmo balde de 60 respostas negativas por hora; o pagamento aprovado continua passando, então o efeito é só sobre consulta negativa. NÃO VERIFICADO se o IP de saída do servidor do Porta Aberta é fixo ou compartilhado.
- A conta do Mercado Pago é a mesma da operação antiga. Por isso a resposta de `portaAbertaVerificar` nunca distingue "não existe" de "é de outro produto".

- **Aviso real recusado (10/11/2026, versão `1b-2026-11-10e`).** Fato: a compra de teste de R$ 1 (pagamento `188866285972`, `pa-teste-2026-11`, aprovado 17:35:44 UTC) gerou 4 avisos assinados do Mercado Pago, todos recusados com 401 na assinatura; nenhuma confirmação saiu e o dono fechou a aba sem voltar a `/obrigado/`. Causa pela leitura e por sondas no ar (certeza média): o validador é equivalente ao SDK oficial e ao validador dos webhooks antigos, o `x-request-id` e a query chegam intactos pelo domínio `creatmtt.com.br` e o relógio bate; o que sobra é o valor guardado em `MERCADOPAGO_WEBHOOK_SECRET` não ser a assinatura secreta da aplicação que criou a preferência (o log mostra 64 caracteres com algum não alfanumérico, forma que a documentação não descreve; os webhooks antigos não têm nenhuma linha de log em 7 dias, então nada prova que ele já validou um aviso real). Hipótese secundária: outra montagem do manifesto na `notification_url`, que o diagnóstico testa. Duas decisões do coordenador:
  1. **A assinatura continua obrigatória.** Aviso sem assinatura válida recebe 401 e não dispara nada. O webhook ganhou só diagnóstico permanente: um código de motivo por 401, com números e classes, nunca valor de segredo, assinatura ou cabeçalho.
  2. **Conciliação por consulta.** `portaAbertaConciliar` não recebe nada de fora: roda por agenda (workflow a cada 10 min, código só no workflow, hash na função) ou por admin, pergunta ao Mercado Pago pelos aprovados do Porta Aberta das últimas 72 h e confirma pelo mesmo caminho e contrato do webhook, com a mesma chave de idempotência. Sem autorização: 403. Até 50 confirmações por execução; não devolve nem registra dado de pagador. Com ela, o pagamento aprovado é confirmado em até 10 min mesmo que todo aviso falhe.
  Consequência: a confirmação deixa de depender de o aviso do Mercado Pago validar. O custo é uma chamada de busca ao Mercado Pago a cada 10 min com a credencial da conta antiga (mesma exceção deste ADR). Detalhe em `docs/INTEGRACAO-PAGAMENTO.md`, "Aviso real recusado e as duas decisões".

## Revisão

Rever esta decisão quando o app Porta Aberta tiver credencial própria do Mercado Pago (aplicação própria no painel, com token e segredo de webhook cadastrados como segredo do app Porta Aberta). Nesse dia as quatro funções migram para lá, a entidade `PortaAbertaLimite` é apagada e esta exceção acaba.
