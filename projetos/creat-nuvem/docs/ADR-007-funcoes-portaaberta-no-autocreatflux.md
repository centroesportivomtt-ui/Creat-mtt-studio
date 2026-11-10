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

Funções permanentes: `portaAbertaVerificar` (pública), `portaAbertaNotificacao` (webhook) e `portaAbertaFecharPrefs` (admin). Contratos em `docs/INTEGRACAO-PAGAMENTO.md`, seção "Funções portaAberta* no AutoCreatFlux".

## Consequências

- O Porta Aberta depende de uma peça na estrutura antiga. Se alguém mexer no AutoCreatFlux sem saber, a confirmação de pagamento para. Mitigação: o prefixo `portaAberta*` e o comentário de cabeçalho de cada função dizem o que são e citam este ADR.
- `portaAbertaVerificar` é pública e não exige segredo do app Porta Aberta: o MCP do Base44 só grava segredo recebendo o valor na chamada, e o valor passaria pela conversa. A defesa é a resposta mínima, igual para pagamento inexistente e de outro produto, e o limite por pagamento e por origem.
- A conta do Mercado Pago é a mesma da operação antiga. Por isso a resposta de `portaAbertaVerificar` nunca distingue "não existe" de "é de outro produto".

## Revisão

Rever esta decisão quando o app Porta Aberta tiver credencial própria do Mercado Pago (aplicação própria no painel, com token e segredo de webhook cadastrados como segredo do app Porta Aberta). Nesse dia as três funções migram para lá, a entidade `PortaAbertaLimite` é apagada e esta exceção acaba.
