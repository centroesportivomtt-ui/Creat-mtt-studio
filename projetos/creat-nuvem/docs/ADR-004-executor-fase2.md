# ADR-004 · Executor 24/7 da Fase 2: GitHub Actions privado ou VPS

Trilho (T10), 08/11/2026. Status: **proposto**, decisão final do Marcos (envolve conta e cartão).
Pergunta de venda: o pedido pago precisa virar site no ar sem o Marcos acordado. Quem roda o `produzir.mjs` às 3 da manhã?

## Contexto
- Fase 2 (briefing §19): Worker + D1 recebem o webhook do Asaas, reconfirmam o pagamento e gravam o Pedido. Falta **quem executa** a produção: `produzir.mjs` (Node 22, uma chamada à API do Claude, `validar-tenant`, `build-site`, Playwright/Chromium a 390 px, `custo.json`) e depois o deploy do site.
- Cada pedido roda alguns minutos (Chromium + uma chamada de API). Estimativa: **5 a 10 min por pedido** (não medido; medir no primeiro pedido real).
- Regras que valem para os dois: chave `ANTHROPIC_API_KEY` do Console no cofre do executor, nunca no repositório; dados do cliente (`sites/`, `pedidos/`, `dist/`) nunca no git; o executor não recebe texto livre de cliente com permissão de deploy (patch JSON validado, briefing §19).

## Opções

### A. GitHub Actions em repositório privado (disparo por evento)
O Worker da Fase 2, depois de reconfirmar o pagamento, chama `repository_dispatch` (token fino só com `actions:write` nesse repositório). Um `workflow` roda `produzir.mjs` e o deploy. Um `schedule` a cada 15 min serve de rede de segurança para pedido que ficou parado.

| | |
|---|---|
| **Prós** | Sem servidor para manter, atualizar ou proteger. Ambiente limpo a cada pedido (nada de cliente sobra no disco). Segredos em *Environments* com revisão obrigatória se quiser. Log de cada pedido guardado no próprio run. Mesmo lugar do código e do CI. Chromium e Node prontos no `ubuntu-24.04`. |
| **Contras** | Fila e atraso: runner hospedado pode demorar a subir, e `schedule` não tem hora exata (atrasos de vários minutos são documentados pelo GitHub; não verificado nesta data). Job limitado a 6 h (sobra). Termos de uso do Actions restringem uso "não relacionado ao projeto de software do repositório"; produzir e publicar sites a partir do próprio motor é build/deploy, mas é zona cinza (**risco a confirmar lendo os termos**). Dependência de uma plataforma só. |
| **Custo** | Plano Free da organização: **2.000 min/mês de Linux** em repositório privado; acima disso cerca de **US$ 0,006/min** (redução de 01/01/2026). Proposta de taxa de plataforma de US$ 0,002/min em repositório privado a partir de 01/03/2026, com status incerto. Fontes: changelog do GitHub, 16/12/2025 (https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/), e agregadores (https://cicdcost.com/github-actions-pricing-changes-2026), lidos por busca em 08/11/2026: **não verificado na página oficial de preços**. Conta: a 8 min por pedido, 2.000 min cobrem cerca de **250 pedidos/mês por R$ 0**. Acima, 8 min × US$ 0,006 × R$ 5,50 ≈ **R$ 0,26 por pedido**. |
| **Risco** | Baixo de segurança (sem porta aberta, sem SSH). Médio de termos (zona cinza acima). Baixo de lock-in: o job é `node scripts/producao/produzir.mjs`, roda igual em qualquer máquina. |

### B. VPS (máquina virtual sempre ligada)
Um processo (systemd + fila no D1 ou no próprio Worker) consulta pedidos pagos e roda `produzir.mjs`.

| | |
|---|---|
| **Prós** | Começa na hora, sem fila de runner. Sem limite de minutos. Pode manter Chromium aquecido. Sem dúvida de termos de uso. |
| **Contras** | Alguém precisa manter: atualizações de segurança, disco, Node, Chromium, reinício, monitor, backup. Chave da API fica num disco que pode vazar. Dados de cliente acumulam no disco se a limpeza falhar. Cobrança em euro ou dólar no cartão internacional, com IOF (ver `docs/stack-ferramentas-2026.md`, item 0.3). Para "a venda rodar sem o dono", é mais uma coisa que pode parar de madrugada. |
| **Custo** | Referência Hetzner CX23 (2 vCPU, 4 GB): **€ 5,99/mês** após os reajustes de abril e junho de 2026 (Better Stack, revisão de out/2026: https://betterstack.com/community/guides/web-servers/hetzner-cloud-review/; VPSBenchmarks: https://www.vpsbenchmarks.com/hosters/hetzner/plans/cx23), com relatos de criação de servidor bloqueada para novos clientes até 20/10/2026 (https://findstack.com/resources/hetzner-price-increase-2026). Lido por busca em 08/11/2026, **não verificado na página oficial**. Em reais: cerca de **R$ 40/mês** com IOF (câmbio do euro estimado em R$ 6,40, **não verificado**). VPS em data center no Brasil (Hostinger, Locaweb, Magalu Cloud) aceitaria Pix em alguns casos: **não pesquisado**. Custo escondido: horas de manutenção. |
| **Risco** | Médio de segurança (porta SSH, chave em disco, patch atrasado). Médio de operação (sem ninguém de plantão). Baixo de lock-in. |

## Decisão recomendada
**A. GitHub Actions privado, disparado por evento**, com estas condições:
1. Repositório privado numa organização da Creat (ver `CHECKLIST-REPOSITORIO-PRIVADO.md`) antes de qualquer segredo de produção.
2. Segredos em um *Environment* `producao` (`ANTHROPIC_API_KEY`, `CLOUDFLARE_API_TOKEN`), restrito ao branch principal; actions de terceiros fixadas por SHA; `permissions:` mínimas no workflow.
3. `concurrency` por pedido (`group: pedido-${{ id }}`) para não produzir duas vezes; idempotência pelo id do pedido no D1.
4. Nada de cliente vira artefato público do run: `sites/` e `dist/` vão direto para o deploy e somem com o runner; log sem nome, WhatsApp ou e-mail.
5. **Gatilho de troca para VPS (ou Cloudflare Containers, a avaliar)**: passar de 200 pedidos/mês, fila do runner acima de 10 min em mais de 5% dos pedidos, ou leitura dos termos do Actions que proíba o uso. A troca custa pouco porque o job é um comando só.

Por quê: tira o Marcos do meio (nada para manter), custa R$ 0 até um volume que a Fase 2 ainda não tem, e não deixa chave nem dado de cliente parado num disco. O prazo prometido é 72 h; alguns minutos de fila não ameaçam o prazo.

## O que não foi verificado
- Página oficial de preços do GitHub Actions e status da taxa de plataforma de US$ 0,002/min (a rede desta sessão não alcançou github.com/pricing; só busca).
- Texto atual dos termos adicionais do Actions sobre uso não relacionado ao projeto.
- Preço oficial da Hetzner em 08/11/2026 e câmbio do euro.
- Tempo real de um pedido no runner (medir no primeiro pedido).
- Cloudflare Containers como terceira opção (mesma conta do deploy): não pesquisado nesta tarefa; a revisão semanal do stack deve olhar.
