# ADR-003 · Dado velho ou ausente falha fechado (CDC art. 37)

Status: aceito · 08/11/2026 · Cirro (T1)

## Contexto
A vitrine mostra preço de inauguração (R$ 297 nas 20 primeiras vagas), vagas restantes e "vagas hoje". Esses números vêm de `dados/precos.json` e `dados/vagas.json`, atualizados por `scripts/atualizar-vagas.cjs`. Se o script parar de rodar, a página continuaria anunciando escassez ou desconto que não existem mais: publicidade enganosa (CDC art. 37) e quebra de confiança, justamente num produto que vende honestidade ("sem amarra").

## Opções
1. Mostrar o último valor conhecido. Rejeitada: é exatamente o anúncio enganoso.
2. Mostrar erro ou "carregando" eterno. Rejeitada: atrito de compra e tela quebrada.
3. **Fail-closed silencioso**: sem dado fresco, a página cai no estado mais conservador que continua vendendo.

## Decisão
Opção 3. Fresco = arquivo existe, parseia, tem o formato esperado e `atualizado_em` entre agora menos 48 h e agora mais 5 min. Não fresco: preço padrão de Abertura (R$ 497), sem inauguração, sem contador de vagas, sem o ângulo "vagas hoje", sem mensagem de erro e sem quebrar o layout. Inauguração exige `precos.json` fresco, `ativa: true` e `vagasRestantes > 0`; o link de pagamento acompanha (inauguração só com dado fresco, senão o padrão). Depoimentos sem `autorizadoEm` não aparecem e a seção some. O mesmo critério vale para o anúncio D ("antes do Natal"): só sobe com `vagas.json` real.

## Consequências
- Esquecer de atualizar nunca gera promessa falsa; no pior caso o cliente paga o preço cheio que está na tabela.
- Teste objetivo (seção 18, item 7): apagar `vagas.json` ou envelhecer `atualizado_em` muda a página sem erro de console.
- Relógio do aparelho errado pode esconder a inauguração para alguns visitantes; aceitamos (falha para o lado seguro).
- `checar.cjs` deve avisar no deploy quando os dados estiverem a menos de 12 h de vencer, para o Marcos não perder a inauguração por descuido.
- Na Fase 2 o Worker passa a ser a fonte, com a mesma regra.
