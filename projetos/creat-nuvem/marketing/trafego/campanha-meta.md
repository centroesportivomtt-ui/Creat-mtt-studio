# Campanha Meta · Porta Aberta · `ctwa-nov26` · pronta para colar

Cirro, Arquiteto, 09/11/2026. Fonte de verdade da **configuração** da campanha de mensagens no WhatsApp. Os textos dos anúncios estão em `anuncios-meta.md`, as peças em `criativos.md`, a conversa em `../whatsapp-scripts.md` e a régua de UTM em `../utm.md`. Este arquivo não repete nenhum deles; ele diz qual campo do Gerenciador recebe o quê.

**Como isto ajuda a vender.** O anúncio abre uma conversa. A conversa manda a prévia com o nome do negócio, e a prévia leva ao Pix. Cada anúncio tem um código, e esse código vai até a venda. Assim o Marcos decide pelo custo por Pix pago, não pelo clique. Hoje o único dado da conta é um Reel com gancho de dor que pagou cerca de R$ 0,22 por clique e gerou zero venda atribuída. Esta campanha existe para medir a venda.

Convenções:
- "Hipótese" é conta ou palpite do Cirro, sem benchmark.
- "Não verificado" é o que não foi confirmado em página da Meta. Nesta sessão, facebook.com não abriu, por bloqueio de rede. Os dados oficiais citados vêm da pesquisa do Radar, que leu essas páginas em 09/11/2026.

---

## 0. Decisões em uma tela

| item | decisão | por quê (detalhe na seção indicada) |
|---|---|---|
| Campanha | `ctwa-nov26`, objetivo **Leads**, conversão em **Apps de mensagem > WhatsApp** | conversa agora; otimização por lead depois, na mesma campanha (§2) |
| Conjuntos | **1 amplo por vez**, não 3 por nicho | 3 conjuntos com esta verba nunca saem do aprendizado (§3) |
| Orçamento | R$ 40/dia na Fase 1, R$ 70/dia na Fase 2, depois +20% por degrau | regra das cerca de 50 conversas por semana (§4) |
| Localização | Riachão + 60 km, depois Feira de Santana, depois Bahia, depois Brasil, cada fase com gatilho | §5 |
| Público | Advantage+ público ligado; controles de idade mínima 18 e localização; idioma em branco | §6 |
| Posicionamentos | manuais: só celular, Facebook e Instagram, Feeds, Stories, Reels e Explorar | §7 |
| Otimização | Maximizar número de conversas, maior volume, cobrança por impressão | §8 |
| Medição | etiquetas do WhatsApp Business para a Meta; Mercado Pago e PEDIDO v1 como verdade de caixa; Pixel e CAPI só para o site | §9 e §10 |
| Status | **tudo nasce DESLIGADO** | regra da casa |

Esta configuração **substitui a seção 3 de `anuncios-meta.md`** em três pontos:
- objetivo Leads no lugar de Engajamento;
- localização em fases, começando em Riachão + 60 km, no lugar de começar pela Bahia;
- conjunto com o nome da fase no lugar de `ctwa-nov26-ba-amplo`.

O resto daquele arquivo continua valendo.

---

## 1. Pré-requisitos (fora dos 20 minutos; sem isto, não ligue)

| # | pré-requisito | estado em 09/11/2026 | quem resolve |
|---|---|---|---|
| P1 | Pagamento funcionando no `/abrir/`. Plano B de hoje: 2 links `mpago.la`, e `mpago.la` e `mercadopago.com.br` acrescentados aos `HOSTS` de `checkout.config.js`. Plano A da semana: a função `portaAbertaCheckout` no servidor | **não feito**: `HOSTS` aceita só `asaas.com` e `cakto.com.br`, então o botão Pagar cai no WhatsApp | Marcos (links) e Forja (código) |
| P2 | Pixel ligado no site: `metaPixel: '1743291620082635'` em `checkout.config.js`. É ID público, não é segredo | **desligado** no site publicado (`'ID_DO_PIXEL_META'`, conferido por curl em 09/11/2026). PostHog também está desligado (`phc_CHAVE_PUBLICA_DO_PROJETO`) | Forja |
| P3 | Número 5575981151202 ligado à Página do Facebook da Creat (Configurações da Página > WhatsApp, com código de confirmação) | não verificado | Marcos |
| P4 | **Atividade dos seus clientes** ligada no app WhatsApp Business, antes de gastar o primeiro real. Assim a contagem de 10 eventos em 30 dias já começa a correr | não verificado; `whatsapp-scripts.md` tem `[PREENCHER]` | Marcos |
| P5 | Teste da saudação dupla (seção 6 de `anuncios-meta.md`) com um número que nunca falou com o Suporte Creat | `[PREENCHER]` | Marcos |
| P6 | Pelo menos 4 anúncios prontos (§11). Todos sobem juntos no dia 1 | prontos só S1 e S2 (imagens); os vídeos ainda precisam ser gravados | Órbita ou Marcos |
| P7 | Segunda leitura de política pela Lupa nos textos, legendas e saudação | pendente | Lupa |
| P8 | Saldo pré-pago por Pix carregado para a fase inteira (§4) | pendente | Marcos |

**Sem P1, a campanha ainda mede conversas e etiquetas, mas a venda fecha à mão no chat.** Sem P2, nenhum número do site chega à Meta. Por isso a Fase 3 (Bahia) exige P1 no Plano A e P2 (§5).

---

## 2. Campanha

| campo no Gerenciador | valor |
|---|---|
| Conta | creat.MTT Studio · act_916420481553001. Conferir: moeda BRL e fuso America/Bahia |
| Objetivo | **Leads** |
| Nome da campanha | `ctwa-nov26`. Este nome é igual ao `utm_campaign`, e esse é o contrato: campanha do Gerenciador = `utm_campaign`. Se a campanha for criada em janeiro, use `ctwa-jan27` em tudo |
| Categoria especial de anúncio | nenhuma (crédito, emprego, moradia e política não se aplicam) |
| Teste A/B | desligado |
| Orçamento Advantage+ da campanha | **desligado**. O orçamento fica no conjunto, para a troca de fase ser só duplicar o conjunto |
| Limite de gastos da campanha (em "mais opções") | R$ 300 na Fase 1; subir a cada fase para o total da fase + 10%. Funciona como trava contra erro de digitação no orçamento. Hipótese de uso; confira se o campo aparece |
| Status | **desligado** antes de publicar |

**Por que Leads e não Engajamento.** Segundo a documentação da Meta para desenvolvedores, o Click-to-WhatsApp aceita a meta "conversas" em Engajamento, Leads e Vendas (developers.facebook.com, página Click to WhatsApp, atualizada em 21/05/2026, lida pelo Radar em 09/11/2026). A otimização por lead em anúncio de mensagem fica em Leads. A Meta afirma que ela reduz em 24% o custo por lead no WhatsApp, sem auditoria independente, e diz que a liberação é gradual (facebook.com/business/help/575610661605746, sem data). Começando em Leads, a migração para lead é um conjunto novo **dentro da mesma campanha**, sem campanha nova.
**Plano B:** se Leads não oferecer "Apps de mensagem > WhatsApp" com a meta "Maximizar número de conversas", use **Engajamento**. É o caminho que `anuncios-meta.md` previa. Anote no §15 qual dos dois foi usado.

---

## 3. Um conjunto amplo, não três por nicho

A Meta diz que o conjunto sai da fase de aprendizado com cerca de 50 resultados na semana. Ela também diz que juntar conjuntos parecidos junta o aprendizado (facebook.com/business/help/112167992830700, sem data, lida em 09/11/2026). A conta abaixo usa a mediana de R$ 10,65 por conversa no WhatsApp: são 10 contas de negócios locais de uma única agência, nos 30 dias até 23/10/2026 (2bgrowth.com.br/blog/impulsionar-ou-trafego-pago/). É linha de comparação, não meta.

| desenho | verba por conjunto e semana | custo máximo por conversa para chegar a 50 | contra a mediana de R$ 10,65 |
|---|---|---|---|
| 3 conjuntos, R$ 40/dia no total | R$ 93,33 | R$ 1,87 | não sai do aprendizado |
| 3 conjuntos, R$ 70/dia no total | R$ 163,33 | R$ 3,27 | não sai |
| **1 conjunto, R$ 40/dia** | R$ 280 | R$ 5,60 | provavelmente fica em "Aprendizado limitado", aceito na Fase 1 (§5) |
| **1 conjunto, R$ 70/dia** | R$ 490 | R$ 9,80 | perto da mediana |

**Decisão:** 1 conjunto amplo. O nicho fica no **anúncio**: cada nicho tem os seus criativos e a sua mensagem pré-preenchida, e a leitura por nicho sai da quebra por anúncio.

**Quando dividir em 3:** quando cada conjunto puder ter `50 × custo real por conversa ÷ 7` por dia. Com a mediana, isso dá R$ 76/dia por conjunto, ou R$ 228/dia no total. Antes disso, não.

**Custo da decisão:** o algoritmo concentra a verba nos 1 ou 2 anúncios que ele prefere, então um nicho pode receber pouca entrega. É aceito. A pergunta da Fase 1 e da Fase 2 é "a conversa vira Pix?", e não "qual nicho é melhor".

Nome do conjunto (sem acento, igual em todas as telas):

| fase | nome do conjunto |
|---|---|
| 1 | `ctwa-nov26-fase1-riachao60` |
| 2 | `ctwa-nov26-fase2-riachao60-feira` |
| 3 | `ctwa-nov26-fase3-bahia` |
| 4 | `ctwa-nov26-fase4-brasil` |

**Troca de fase:** botão **Duplicar** no conjunto; mude localização, nome e orçamento; publique o novo e desligue o anterior no mesmo minuto. Mudar a localização já reinicia o aprendizado de qualquer jeito. Duplicar deixa cada fase numa linha própria do relatório. Na duplicação, confira em cada anúncio se ficou "Usar publicação existente" com o mesmo ID, para manter curtidas e comentários (não verificado se a duplicação faz isso sozinha).

---

## 4. Orçamento e regra de aumento

**Imposto:** o Gerenciador mostra o gasto sem imposto. Com cartão, R$ 100 de mídia custam R$ 113,83. Com Pix pré-pago, R$ 100 pagos viram R$ 87,85 de mídia. Nos dois casos o fator é 1,1383 (`docs/stack-ferramentas-2026.md` §3.2, citando a Meta; vigente desde 01/01/2026). **Todo custo por Pix deste arquivo é gasto × 1,1383.**

| fase | orçamento diário | mídia em 7 dias | Pix pré-pago a carregar | conversas esperadas na mediana (hipótese) |
|---|---|---|---|---|
| 1 | R$ 40 | R$ 280 | R$ 320 | cerca de 26 |
| 2 | R$ 70 | R$ 490 | R$ 560 | cerca de 46 |
| 3 | começa em R$ 70; sobe por degrau | R$ 490 ou mais | o total da semana ÷ 0,8785 | |
| 4 | começa no último orçamento da Fase 3 | | | |

**Por que R$ 40 e não menos na Fase 1.** Pela mediana, uma Abertura de R$ 297 empata a mídia a cada 25 a 28 conversas, já com o imposto (conta do Radar sobre 2B Growth). Com R$ 280 a fase gera cerca de 26 conversas: o mínimo para ter chance real de uma venda. Abaixo disso, a fase não ensina nada.

**Pix pré-pago e não cartão.** O saldo vira um teto duro: a campanha para sozinha quando ele acaba, sem fatura surpresa. Carregue a fase inteira de uma vez, para a entrega não parar no meio do aprendizado.

**Regra de aumento: +20% por degrau.** Os 20% são heurística de praticantes; a Meta só pede para evitar trocas frequentes de orçamento (mesma página da fase de aprendizado). Todas as condições abaixo precisam valer juntas:

1. passaram 7 dias desde a última edição significativa (localização, anúncio novo, meta, orçamento);
2. passaram pelo menos 72 h desde o último degrau;
3. o custo por conversa dos últimos 3 dias está igual ou abaixo do custo-alvo (§12);
4. houve pelo menos 1 Pix pago com origem nesta campanha nos últimos 14 dias;
5. a frequência de 7 dias está igual ou abaixo de 3,0;
6. a primeira resposta humana, no horário de atendimento, sai em até 5 minutos (§13);
7. não é a semana de 23 a 29/11 (Black Friday em 27/11; `docs/ESTRATEGIA.md` §8 e §14).

Escada de orçamento: R$ 70 → 84 → 101 → 121 → 145 → 174 → 209. **O teto sem nova ordem do Marcos é R$ 121/dia.** Passar disso exige custo por Pix igual ou abaixo de R$ 700 numa janela de 14 dias. R$ 700 é o teto de CAC da estratégia (`docs/ESTRATEGIA.md` §4.3).

**Volta:** se, depois de um degrau, o custo por conversa passar do alvo em 2 leituras diárias seguidas, volte ao degrau anterior. Não volte duas vezes na mesma semana.

---

## 5. Localização em fases

Em todas as fases:
- **Controle de localização:** "Pessoas que moram neste local" (em "mais opções", se o Gerenciador mostrar só "moram ou estiveram recentemente").
- **"Alcançar mais pessoas" fora da área: desmarcado.** Com essa opção desmarcada, o Advantage+ não entrega fora da localização (facebook.com/business/help/938372127764391, lida pelo Radar em 09/11/2026).

Riachão do Jacuípe fica a cerca de 68 km de Feira de Santana em linha reta. É conta do Cirro com coordenadas aproximadas, e por isso o raio de 60 km não cobre Feira. Conceição do Coité (cerca de 30 km), Serrinha (cerca de 44 km) e Ipirá (cerca de 55 km) ficam dentro do raio.

Os limites de raio que o Gerenciador aceita variam entre fontes terceiras: 1 a 70 km fora dos EUA (Aden's Lab, 15/05/2026), 17 a 80 km para cidades (Ads Uploader, sem data). Se 60 km não for aceito, use o valor aceito mais próximo e anote no §15.

| fase | o que colar em Localização | orçamento | entra quando | sai para a próxima quando (depois de 7 dias) | não avança se |
|---|---|---|---|---|---|
| **1 · Riachão + 60 km** | "Soltar alfinete" no centro de Riachão do Jacuípe (BA), raio **60 km** | R$ 40/dia | P1 a P8 ok. **Pule direto para a Fase 2** se o painel "Resultados diários estimados" mostrar menos de 4 conversas/dia no limite de cima. Abaixo disso, 7 dias dão menos de 28 conversas, o que não cobre nem uma venda no ponto de equilíbrio | **qualquer um** destes: (a) frequência de 7 dias acima de 3,0; (b) gasto abaixo de 80% do orçamento por 3 dias seguidos, sinal de público esgotado; (c) CPM 20% acima da 1ª semana com os mesmos criativos; (d) pelo menos 1 Pix pago com custo por conversa até o alvo, quando a pergunta passa a ser volume | Lead ÷ conversas abaixo de 40%: o problema é a conversa, então corrija saudação, F2 e F3 antes de abrir mapa. Custo por conversa acima de 2× o alvo com frequência abaixo de 2: o problema é o criativo; troque o lote (§12) e repita a fase. 1ª resposta acima de 30 min |
| **2 · Riachão + 60 km + Feira** | os mesmos 60 km **mais** Feira de Santana (BA), cidade, raio **+25 km** | R$ 70/dia | gatilho da Fase 1, **não antes de 30/11** (nenhuma fase nova de 23 a 29/11) | (a), (b) ou (c) da Fase 1, **ou** 2 Pix pagos na fase com custo por Pix até R$ 700. **E** depois da revisão do gate de 08/12 (`docs/ESTRATEGIA.md` §14) | os mesmos bloqueios da Fase 1 |
| **3 · Bahia** | Bahia (estado). Tire os alfinetes: o estado já contém as fases anteriores | R$ 70/dia, com a escada do §4 liberada | gatilho da Fase 2, e P1 no **Plano A** (pedido com `order_id` e Purchase pelo servidor) e P2 ligados | a escala trava: 2 degraus seguidos voltaram (§4), ou frequência acima de 3,0 com orçamento a partir de R$ 145/dia. **E** já é janeiro: o CPM de dezembro sobe de 40% a 60% e o de fevereiro é o mais barato (trafius.com.br, 18/04/2026, sem metodologia; `docs/ESTRATEGIA.md` §8) | custo por Pix acima de R$ 700 em 14 dias |
| **4 · Brasil** | Brasil (país) | o último orçamento da Fase 3 | gatilho da Fase 3, mais capacidade de atendimento: segunda pessoa no chat ou horário estendido (§13). Mais capacidade de produção: p90 do prazo até 72 h nos últimos 10 pedidos (`docs/ESTRATEGIA.md` §14) | | |

**Voltar uma fase:** se a fase nova fechar 14 dias com custo por Pix acima de 2× o da fase anterior, religue o conjunto anterior e desligue o novo.

**Por que começar em Riachão, se a pesquisa sugeria a Bahia.** O Radar recomendou começar pela Bahia porque o raio local tem público pequeno para 50 conversas por semana. A objeção é certa para sair do aprendizado, mas a Fase 1 não tenta sair dele. Ela mede se a conversa vira Pix onde a Creat é vizinha e pode ser conferida pessoalmente. Que isso ajude a vender é hipótese, sem benchmark. A fase dura uma semana, tem gatilho de pulo no dia 0 e gatilho de saída no dia 7. O risco fica limitado a R$ 320.

---

## 6. Público

| campo | valor | por quê |
|---|---|---|
| Advantage+ público | **ligado** | conjunto único com pouca verba aprende melhor sem trava fina; na Meta, controles limitam e sugestões só orientam (help/938372127764391) |
| Idade (controle) | **mínima 18**; sem máxima | quem paga e aceita os termos tem de ser maior de idade |
| Idade (sugestão) | nenhuma | não há dado de idade do dono de barbearia, salão ou academia; inventar faixa seria palpite |
| Gênero | todos | idem |
| Segmentação detalhada | **só como sugestão**: Barbearia, Salão de beleza, Academia, Pequenas empresas, WhatsApp Business | mesma lista de `anuncios-meta.md`; sem pilha de interesses |
| Idiomas | **em branco** | o público é de quem mora no Brasil; o filtro tiraria quem usa o celular em outro idioma, sem ganho |
| Públicos personalizados e exclusões | nenhum no dia 1 | retargeting só em conjunto separado acima de R$ 110/dia (`anuncios-meta.md` §7). Lista de clientes para excluir só com aval da Muralha (LGPD) |

---

## 7. Posicionamentos

| campo | valor |
|---|---|
| Tipo | **Posicionamentos manuais** |
| Dispositivos | **Somente celular** (Android e iOS) |
| Plataformas | Facebook e Instagram |
| Ligados | Facebook: Feed, Stories, Reels. Instagram: Feed, Stories, Reels, Explorar, Página inicial do Explorar |
| Desligados | Audience Network, Messenger, Threads, Marketplace, Coluna da direita, Resultados de pesquisa, Vídeos in-stream, Anúncios em Reels (sobreposição) |

**Por que manuais, contra a recomendação da Meta.** Os criativos são verticais (9:16) e quadrados (1:1). O único dado real da conta veio de um Reel. A conversa abre no app do celular, onde está o WhatsApp. No computador, o clique cai no WhatsApp Web, que muita gente não tem aberto. É hipótese do Cirro, não teste: na Fase 3, com verba, vale um conjunto em Posicionamentos Advantage+ para comparar.

---

## 8. Otimização, entrega e atribuição

| campo | valor |
|---|---|
| Local da conversão | **Apps de mensagem**, marcar **só WhatsApp** (Messenger e Instagram Direct desmarcados), número 5575981151202 |
| Meta de desempenho | **Maximizar o número de conversas**. Ela é a recomendada para campanha nova; lead e compra só depois de reportar o resultado (YCloud, parceira da Meta, 09/04/2026) |
| Estratégia de lance | **Maior volume**, sem limite de custo nem de lance. Limite de custo exige orçamento várias vezes maior que o teto (optimads.ai, 30/10/2026, fonte comercial) |
| Cobrança | Impressões |
| Configuração de atribuição | Com "conversas", o campo pode não aparecer. Se aparecer, e quando a meta passar a lead ou compra: **7 dias após o clique**, sem visualização. A venda de CTWA chega dias depois do clique (chat e depois Pix), e a etiqueta conta até 7 dias do clique. Desde 12/01/2026 a Meta não devolve mais as janelas de 7 e 28 dias após visualização; ficam 1, 7 e 28 dias após clique, 1 dia de visualização engajada e 1 dia após visualização (developers.facebook.com/blog/post/2025/10/16/ads-insights-api-metric-availability-updates/) |

**Escada da meta de desempenho**, sempre em **conjunto novo** na mesma campanha, nunca editando o que está aprendendo:
1. **conversas**, agora;
2. **leads**, quando houver 10 etiquetas Lead em 30 dias e a opção aparecer no menu (liberação gradual);
3. **compras**, quando houver 10 etiquetas Paid em 30 dias. O estável recomendado é 20 ou mais (meta-ads.si e ClubUnbrick, 10/2026, resumindo a Meta). Com 20 vagas de inauguração, isso deve demorar.

---

## 9. UTMs e o contrato de nomes

O anúncio de WhatsApp **não tem campo de URL**, então a UTM vai no link que a equipe envia no chat: a mensagem F3 de `../whatsapp-scripts.md`. A régua está em `../utm.md`. O contrato tem três regras:

1. **Nome da campanha = `utm_campaign`** (`ctwa-nov26`).
2. **Nome do anúncio no Gerenciador = `utm_content`** (exemplo: `F1-barbearia-v1`). Com isso, a linha do Gerenciador, a etiqueta do chat e a `origem` do PEDIDO v1 se ligam pelo mesmo código, sem tabela de tradução.
3. O conjunto leva a fase no nome, mas a UTM não leva. A fase de uma venda sai da data.

Link do F3 para esta campanha:

```
{{site.url}}/?nicho=<barbearia|salao|academia>&utm_source=meta&utm_medium=pago&utm_campaign=ctwa-nov26&utm_content=<código do anúncio>
```

Enquanto não houver domínio próprio, `{{site.url}}` é `https://creat-nuvem-404b1994.base44.app`.

- **Qual anúncio trouxe a conversa:** pela mensagem pré-preenchida, que é diferente em cada anúncio (tabela da seção 6 de `anuncios-meta.md`, mais a linha F0 do §11 abaixo).
- **Pessoa editou a mensagem:** use `W0-<nicho>-v1`.
- **Conversa que chegou fora do horário e recebeu a mensagem de ausência:** a ausência leva `utm_campaign=ausencia`. Quando a equipe responder na manhã seguinte, mande o F3 com o código do anúncio. Se a venda sair pelo link da ausência, corrija a linha `origem` do PEDIDO v1 à mão para `ctwa-nov26` e o código.

---

## 10. Pixel, CAPI e etiquetas: quem mede o quê

| sinal | fonte | alimenta | estado em 09/11/2026 |
|---|---|---|---|
| Conversa iniciada | a própria Meta, no clique | a otimização desta campanha | automático |
| Lead, New order, Pending payment, Paid, Follow up | etiquetas **predefinidas** do app WhatsApp Business, com "Atividade dos seus clientes" ligada, em até 7 dias do clique (Meta for Business, página de otimização de CTWA, lida pelo Radar em 09/11/2026) | a escada de meta do §8 | P4 pendente |
| PageView, InitiateCheckout | Pixel 1743291620082635 no navegador, **só com consentimento** (`assets/vitrine.js`) | relatório e públicos de retargeting | **desligado**: falta P2 |
| ViewContent na `previa_gerada` | Pixel | relatório (prévias por anúncio) | **não existe no código**. Hoje o site só dispara PageView e InitiateCheckout. Contrato para a Forja abaixo |
| Purchase | **somente servidor**: API de Conversões, a partir do webhook do Mercado Pago (Plano A) | relatório e futura campanha de site | não existe; depende do Plano A |
| Venda de verdade | painel do Mercado Pago, mais a `origem` do PEDIDO v1 | a planilha do §12 | manual até o Plano A |

**Contrato de eventos do site (para a Forja; não implementado aqui):**

| evento Meta | quando | onde | `event_id` | dado pessoal |
|---|---|---|---|---|
| `PageView` | carregou a página | navegador | automático | nenhum |
| `ViewContent` | `previa_gerada` (a placa virou e o site apareceu) | navegador | `prev-<uuid da sessão>` | nenhum; `content_category` = nicho |
| `InitiateCheckout` | clicou em Pagar no `/abrir/` | navegador | `chk-<id do pedido>`, quando houver | nenhum |
| `Purchase` | o webhook confirmou o pagamento | **servidor**, `action_source=website`, mesmo pixel | `<id do pedido>` (por exemplo `PA-XXXXXXXX`), o mesmo usado em qualquer disparo do navegador, para deduplicar (developers.facebook.com, boas práticas da CAPI, atualizada em 28/06/2026) | e-mail e telefone com hash SHA-256, só no servidor |

Regras:
- O token da API de Conversões fica nos segredos do app Base44 AutoCreatFlux, nunca no repositório nem neste arquivo.
- Nenhum nome de evento ou conversão personalizada sugere saúde ou situação financeira.
- **Sem dupla contagem.** Para esta campanha, a verdade é a etiqueta Paid do app. O Purchase do Pixel e da CAPI mede o site. A Meta não deduplica os eventos de mensagens com os do site (developers.facebook.com, CAPI para mensagens, atualizada em 28/09/2026).
- No anúncio, em **Rastreamento > Eventos do site**, marque o pixel 1743291620082635, se a opção aparecer. Isso deixa ver na mesma linha do Gerenciador as prévias e os checkouts que vieram depois do chat.

---

## 11. Anúncios do conjunto (casamento entre `anuncios-meta.md` e `criativos.md`)

Todos sobem juntos no dia 1: anúncio novo dentro do conjunto conta como edição significativa. São no mínimo 4 e no ideal 7, dentro do limite de 10 que a Meta recomenda testar (help/188534925073536).

| nome do anúncio (= `utm_content`) | texto em `anuncios-meta.md` | peça em `criativos.md` | formato | pronto? |
|---|---|---|---|---|
| `F0-geral-v1` | texto do Reel antigo, revisado pela Lupa; descrição "Abre uma conversa no WhatsApp" | **o Reel de dor que já rodou na conta** (CPC de cerca de R$ 0,22) | Reel 9:16 | existe. Só entra se passar nas regras do §2 de `anuncios-meta.md`. Se afirmar estado de quem vê, fica fora |
| `F1-barbearia-v1` | M01 | R6b (sem pessoa), corte de 15 s | Reel 9:16 | gravar |
| `T1-barbearia-v1` | M02 | R5 G1, corte de 15 s, quadro final "Toque e receba o link no chat" | Reel 9:16 | gravar |
| `A5-geral-v1` | M09 | S1 no Feed e S2 em Stories e Reels, por personalização de posicionamento | imagem | **pronto** (`saida/S1-placa-porta-1080x1080.png`, `saida/S2-placa-porta-1080x1920.png`) |
| `F1-salao-v1` | M04 | R6b, versão salão | Reel 9:16 | gravar |
| `T1-salao-v1` | M05 | R5, versão salão | Reel 9:16 | gravar |
| `F1-academia-v1` | M07 | R6b, versão academia | Reel 9:16 | gravar |

- **Mínimo para ligar:** F0 (ou F1-barbearia, se o F0 não passar), T1-barbearia, F1-barbearia e A5-geral.
- **Mensagem pré-preenchida do F0** (as outras estão na seção 6 de `anuncios-meta.md`): "Oi! Vi o vídeo e quero ver o site do meu negócio pronto."
- O Reel antigo pode ter subido com outro botão. Se o Gerenciador não deixar trocar para **Enviar mensagem** em "Usar publicação existente", suba o arquivo como anúncio novo. Ele perde as curtidas, mas mantém o criativo.

Campos iguais em todos os anúncios:

| campo | valor |
|---|---|
| Identidade | Página da Creat no Facebook + Instagram @creat.mtt |
| Configuração do anúncio | Criar anúncio, formato único (imagem ou vídeo). Anúncios com vários anunciantes: **desligado** |
| Botão | **Enviar mensagem** |
| Modelo de mensagem | saudação, pré-preenchida do anúncio e 3 perguntas, exatamente como na seção 6 de `anuncios-meta.md` |
| Aprimoramentos criativos Advantage+ | **todos desligados**: melhorias padrão, música, sobreposições, ajuste de imagem, variações de texto, tradução. Eles mudam logo, tipografia e texto revisado |
| Música | só a da Coleção de Sons da Meta, escolhida no próprio Gerenciador |
| Rastreamento | Eventos do site: pixel 1743291620082635 (§10) |

---

## 12. Planilha de decisão diária

**Leitura:** 5 minutos, às 9h (America/Bahia), em **Colunas > "Porta Aberta · diário"** (§14, passo B2). Anote uma linha por dia em `diario-campanha.csv`, nesta pasta.

**Custo-alvo por conversa** (hipótese até haver dado da conta): `R$ 700 × (Paid ÷ conversas) ÷ 1,1383`.
- Taxa de partida provisória: 2%. Com ela, o **alvo é R$ 12,30**. É o mesmo cálculo do Radar, sem benchmark.
- Recalcule depois de pelo menos 60 conversas e 2 Pix. Exemplo: 3 Pix em 75 conversas (4%) dão R$ 24,60.

### Ordem de leitura

A primeira regra que se aplicar decide o dia:

1. **Anúncio reprovado ou conta restrita:** desligue o anúncio, corrija pelo §16 e peça nova análise uma vez. Não recrie o mesmo anúncio várias vezes.
2. **Dias 1 a 3:** só a regra de corte R1 (§14, bloco B) e a entrega. Nada mais muda.
3. **Dia 4:** primeira leitura por anúncio (taxa de gancho e custo por conversa). Desligar anúncio é permitido. **Anúncio novo, não**: a troca de criativo vai em lote, no dia 7.
4. **Dia 7:** decisão de fase (§5), de degrau (§4) e do lote de criativos.
5. **Dia 14:** a primeira leitura de custo por Pix vale.

### Métricas e ações

| métrica | onde ler | faixa boa | faixa ruim | ação |
|---|---|---|---|---|
| Custo por conversa iniciada (sem imposto) | Gerenciador, conjunto e anúncio | até R$ 10,65 (mediana 2B Growth, out/2026); aceitável até o alvo | acima de 2× o alvo por 3 dias | **Bom**: manter; com todas as condições do §4, **escalar 20%**. **Ruim no anúncio**: **trocar criativo** no lote do dia 7. **Gastou 3× o alvo (R$ 36,90 com o alvo de partida) e fez 0 conversa**: **pausar o anúncio** (regra R1) |
| Taxa de gancho (reproduções de 3 s ÷ impressões) | métrica personalizada no Gerenciador | a partir de 25% | abaixo de 15% depois do dia 4 | **Ruim**: **trocar criativo**, só o gancho (`v2`), mantendo o corpo. Faixas de blog de agência (Digital Applied, 02/02/2026), não da Meta |
| Frequência de 7 dias | conjunto | até 2,5 | acima de 3,0 | **Ruim**: gatilho de fase (§5); se já está na Fase 4, **trocar criativo** |
| CPM | conjunto | perto de R$ 14,38 (mediana 2B Growth, out/2026) | 20% acima da 1ª semana com os mesmos criativos | **Ruim**: saturação ou leilão caro; gatilho de fase. Na semana de 23 a 29/11, nada muda, salvo CPM acima de 1,5× a semana anterior: aí, **pausar o conjunto** até 30/11 |
| Gasto do dia ÷ orçamento | conjunto | a partir de 90% | abaixo de 80% por 3 dias | **Ruim**: confira saldo e restrição da conta; se estiver tudo certo, o público esgotou: gatilho de fase |
| Status do aprendizado | conjunto | "Ativo" | "Aprendizado limitado" no dia 7, a partir da Fase 2 | **Ruim**: reduza para os 4 ou 5 melhores anúncios num conjunto novo, ou suba o orçamento até `50 × custo por conversa ÷ 7` |
| Lead ÷ conversas | contagem da etiqueta Lead no app | sem benchmark; piso provisório 50% | abaixo de 40% | **Ruim**: o problema é a conversa. **Manter** o anúncio e rever saudação, F2 e F3 |
| New order ÷ Lead | etiquetas | sem benchmark | | só para diagnóstico: mostra se o preço (R2 e F4) trava |
| Paid ÷ conversas | etiquetas + Mercado Pago | a partir de 4%: a Abertura de R$ 297 já paga a mídia com custo de R$ 10,65 (conta do Cirro) | abaixo de 1,7% depois de 14 dias e pelo menos 60 conversas: nem o teto de CAC de R$ 700 cobre | **Ruim**: **pausar a campanha** e rever a oferta e a conversa com o Nimbus, sem trocar só o anúncio |
| Custo por Pix pago (gasto × 1,1383 ÷ Pix) | `diario-campanha.csv` | até R$ 297 | acima de R$ 700 em 14 dias | **Bom**: escada do §4 liberada. **Ruim**: **não escalar** e voltar um degrau. **Ruim por 2 janelas seguidas**: **pausar** e revisar |
| 1ª resposta humana no horário | conferência à mão de 5 conversas do dia | até 5 min | acima de 30 min | **Ruim**: **não escalar**. Mais mídia só aumenta a fila |

---

## 13. Horários

- **Fuso:** America/Bahia (UTC-3, sem horário de verão). Confira que a conta usa esse fuso, porque a leitura "por hora do dia" usa o fuso do anunciante.
- **Início:** numa **terça-feira às 8h**. Assim as primeiras conversas caem no horário de atendimento, e o dia 7 cai na terça seguinte, longe do sábado.
- **Veiculação: 24 horas, sem programação.** Guias terceiros dizem que programar por horário exige orçamento total, e não diário (Coinis e Madgicx, 2025-2026; não confirmado na Meta). O orçamento diário é a base da escada do §4, então ele fica.
- **Atendimento:** segunda a sábado, das 9h às 19h, com 1ª resposta em até 5 minutos (`../whatsapp-scripts.md`). Fora disso, a mensagem de ausência já entrega o link da prévia. A pessoa vê o próprio site às 23h, sem ninguém da equipe, e pode chegar ao Pix pelo `/abrir/` se P1 estiver feito. É a venda sem o dono.
- **Revisão no dia 14:** Gerenciador > Detalhamento > Por tempo > Hora do dia (fuso do anunciante). Se as conversas iniciadas entre 19h e 9h tiverem menos da metade da taxa Lead ÷ conversas do horário comercial, crie um conjunto novo com **orçamento total** e programação das 8h às 20h, ou estenda o atendimento. A decisão é do Marcos, porque mexe no tempo dele.
- **Calendário sugerido** (as datas finais dependem de P1 a P8):

| período | o que acontece |
|---|---|
| terça 17/11 a 23/11 | Fase 1 |
| 24 a 29/11 | nenhuma fase nova (Black Friday) |
| terça 01/12 | Fase 2 |
| 08/12 | revisão do gate |
| dezembro | Fase 3 só se o gate passar |
| janeiro | Fase 4 |

**Conflito com a calibragem `cal-nov26`.** A calibragem é uma campanha de Tráfego de R$ 40/dia, de 16 a 22/11 (`docs/ESTRATEGIA.md` §8). Ela mede prévias pelo Pixel e pelo PostHog, e os dois estão desligados no site publicado (P2). **Recomendação do Cirro:** se a verba de novembro for uma só, rode a Fase 1 desta campanha no lugar da calibragem. Ela é a única que mede algo de ponta a ponta hoje (conversa → etiqueta → Pix). Não divida os R$ 280 entre as duas, porque nenhuma chegaria a resultado legível. A decisão final é do Marcos.

---

## 14. Checklist do Marcos: colar a campanha pela primeira vez

Com P1 a P8 feitos e os arquivos dos anúncios na mão (Google Drive, nunca anexo).

### Bloco A · a campanha (20 minutos)

| min | passo | feito |
|---|---|---|
| 0-2 | Abra o Gerenciador na conta act_916420481553001. Confira: moeda BRL, fuso America/Bahia, forma de pagamento com o saldo Pix da fase (§4) | [ ] |
| 2-4 | **Criar** > objetivo **Leads** > nome `ctwa-nov26` > categoria especial **nenhuma** > teste A/B desligado > Orçamento Advantage+ da campanha **desligado** > limite de gastos R$ 300 (§2) | [ ] |
| 4-6 | Conjunto: nome `ctwa-nov26-fase1-riachao60` > local da conversão **Apps de mensagem**, só **WhatsApp**, número 5575981151202 > meta **Maximizar o número de conversas** > lance **Maior volume** (§8) | [ ] |
| 6-7 | Orçamento **diário R$ 40** > início **terça, 8h** > sem data de término (§4 e §13) | [ ] |
| 7-10 | Público: Advantage+ **ligado** > localização: alfinete em Riachão do Jacuípe, **60 km**, "pessoas que moram neste local", sem "alcançar mais pessoas" > idade mínima **18** > sugestões de segmentação do §6 > idioma em branco. **Anote** o tamanho estimado do público e os resultados diários estimados no §15. Se o limite de cima for menor que 4 conversas/dia, troque já para a Fase 2 (§5) | [ ] |
| 10-11 | Posicionamentos **manuais** > **somente celular** > só os do §7 | [ ] |
| 11-17 | 1º anúncio: nome = código (`T1-barbearia-v1`) > identidade Página + @creat.mtt > mídia > textos copiados de `anuncios-meta.md` > botão **Enviar mensagem** > modelo de mensagem (seção 6 de `anuncios-meta.md`) > aprimoramentos **todos desligados** > pixel em Rastreamento. Depois **Duplicar** o anúncio para os outros 3 a 6, trocando só nome, mídia, textos e a pré-preenchida (§11) | [ ] |
| 17-19 | Confira na prévia de cada anúncio, no Stories e no Reels: nada de texto cortado pela interface, o selo "nome fictício" e a faixa "número de teste" visíveis | [ ] |
| 19-20 | **Desligue** campanha, conjunto e anúncios > **Publicar**. Se o anúncio passar por "Em análise" e terminar em "Desativado", a Meta aprovou. Se a Meta só revisar ao ligar (não verificado), ligue na terça às 8h e conte a 1ª hora como revisão. **Ligar é sempre um gesto do Marcos** | [ ] |

### Bloco B · uma vez só (mais 10 minutos, no mesmo dia)

As regras automatizadas ficam em **Todas as ferramentas > Regras automatizadas**. O caminho e os nomes das métricas vêm de guias terceiros (cropink.com, 11/03/2026; netpeak), então confira na tela. Todas valem só para a campanha `ctwa-nov26`.

**B1 · R1 · corte** (já criada ligada)
- Aplica-se a: anúncios ativos.
- Condição: valor gasto (vida útil) acima de R$ 36,90 **e** resultados = 0.
- Ação: desativar o anúncio e notificar.
- Quando roda: diariamente, às 9h.

**B1 · R2 · alerta de frequência**
- Aplica-se a: conjunto.
- Condição: frequência (últimos 7 dias) acima de 3,0.
- Ação: só notificar.

**B1 · R3 · alerta de custo**
- Aplica-se a: conjunto.
- Condição: custo por resultado (últimos 3 dias) acima de R$ 24,60 **e** valor gasto (últimos 3 dias) acima de R$ 60.
- Ação: só notificar.

**B1 · R4 · escala de 20%** (criada **desligada**; o Marcos liga depois do 1º Pix e do dia 7)
- Aplica-se a: conjunto.
- Condição: custo por resultado (últimos 3 dias) até R$ 12,30, resultados (últimos 3 dias) a partir de 6 e frequência (últimos 7 dias) até 3,0.
- Ação: aumentar o orçamento diário em 20%, com **máximo de R$ 121**, no máximo uma vez a cada 72 h.

**B2 · Colunas.** Personalizar colunas > salvar como **"Porta Aberta · diário"**, com:
- valor usado;
- impressões;
- CPM;
- frequência;
- reproduções de vídeo de 3 s;
- métrica personalizada "taxa de gancho" = reproduções de 3 s ÷ impressões;
- conversas por mensagem iniciadas;
- custo por conversa por mensagem iniciada;
- status de veiculação e de aprendizado.

**B3 · Vigiar os valores das regras.** Quando o alvo for recalculado (§12), atualize os valores de R1, R3 e R4 no mesmo dia: R1 = 3× o alvo, R3 = 2× o alvo, R4 = o alvo.

Com o bloco B pronto, a campanha corta sozinha o anúncio que só gasta, avisa sozinha quando satura, e escala sozinha depois que o Marcos liberar R4. A leitura diária vira conferência, não operação.

---

## 15. Registro do dia 1 (o Marcos preenche)

- Objetivo usado (Leads ou Engajamento): [PREENCHER]
- Raio aceito em Riachão: [PREENCHER] km
- Tamanho estimado do público na Fase 1: [PREENCHER]
- Resultados diários estimados: [PREENCHER] a [PREENCHER] conversas
- Anúncios publicados (códigos): [PREENCHER]
- Data e hora em que a campanha foi ligada: [PREENCHER]
- Nome exato das etiquetas predefinidas no app em português: [PREENCHER]

---

## 16. O que a revisão da Meta pode reprovar e como evitar

A Meta revisa o anúncio, a mensagem automática criada na configuração, as mensagens automáticas e a Página. A conversa que sai do anúncio segue os Padrões da Comunidade, e restrição de mensagens pausa os anúncios de conversa (Meta Blueprint, Padrões de Publicidade, sem data, lida pelo Radar em 09/11/2026). Não foi encontrada política específica para serviço de site ou marketing: o risco está na promessa.

| # | o que reprova | onde estaria o risco aqui | como evitar |
|---|---|---|---|
| 1 | Afirmar ou insinuar atributo pessoal, inclusive "situação financeira vulnerável" (transparency.meta.com/policies/ad-standards/) | "Sua barbearia perde cliente", "Cansado de...?", "Você é dono de...?" | dor só como **cena** de cliente fictício com o selo "cena de exemplo" (regras do §2 de `anuncios-meta.md`). O F0 antigo passa pela Lupa antes |
| 2 | Texto exagerado ou enganoso para induzir clique; promessa de resultado; "dinheiro fácil" (Blueprint; Práticas Comerciais Proibidas, alteração de 29/10/2026) | "lote a agenda", "dobre os clientes", "venda todo dia" | sem promessa de ganho, de clientes ou de agenda; o produto é "pedido de horário no seu WhatsApp" |
| 3 | Assinatura sem divulgação clara dos termos (Práticas Comerciais Proibidas, 29/10/2026) | preço da Abertura dito no chat sem a mensalidade | o anúncio não leva preço. No chat, R2 e F4 sempre levam Abertura **e** mensalidade juntas, com "a mensalidade só começa com o site no ar" e "sem fidelidade" |
| 4 | Página ou destino que não bate com o anúncio, ou que não funciona | anúncio diz "grátis e sem cadastro" e a prévia pede dado; o botão Pagar cai no WhatsApp | a prévia abre sem cadastro (conferir antes de ligar, com `navegador`); P1 resolvido |
| 5 | Saudação ou mensagem automática com promessa | saudação do anúncio, ausência, respostas rápidas | usar só os textos de `anuncios-meta.md` §6 e `../whatsapp-scripts.md`, sem preço nem promessa na saudação |
| 6 | Logo da Meta alterado ou que sugira parceria com a Meta | ícone do WhatsApp redesenhado na peça | ícone próprio de balão; a palavra "WhatsApp" no texto, sem logo modificado |
| 7 | Botão ou play falso em imagem estática | S1 e S2 | botão desenhado no quadro final só em vídeo; nas imagens, sem play nem botão que pareça clicável |
| 8 | Tela piscando ou disruptiva | a cena de "a tela apaga" do R6 | um único fade de 400 ms, como já está no roteiro |
| 9 | Música sem licença | trilha baixada fora | só a Coleção de Sons da Meta, escolhida no Gerenciador |
| 10 | Academia: corpo, peso, "antes e depois", recorte de parte do corpo | versão academia do R6b e do R5 | mostrar a tela do site e o pedido de "aula experimental", nunca corpo nem resultado físico |
| 11 | Restrição de mensagens por bloqueio ou denúncia | lembrete demais para quem não pediu | no máximo L1 e L2, só 1:1, parar quando a pessoa pedir; nenhuma lista de transmissão (`../whatsapp-scripts.md`) |
| 12 | Nome ou imagem de cliente real sem autorização | prints com negócio real | só os nomes fictícios: Barbearia Navalha Fictícia, Salão Esmalte Fictício, Studio Barra Fictícia |

**Se reprovar:**
1. Leia o motivo em Qualidade da conta.
2. Corrija só o item apontado.
3. Peça nova análise **uma vez**.
4. Se a reprovação se repetir, pare e chame a Lupa.

Os Padrões de Publicidade mudam sem aviso, segundo a própria Meta. Releia antes de cada fase.

---

## 17. Riscos (do mais grave ao menos grave)

1. **A venda não volta para a Meta.** O Pixel e o PostHog estão desligados no site publicado, o checkout cai no WhatsApp e não existe Purchase pelo servidor. Até P1 (Plano A) e P2, o custo por Pix sai da planilha à mão. Por isso as Fases 3 e 4 exigem os dois.
2. **O chat depende de gente.** A resposta em 5 minutos é o gargalo. Escalar com 1ª resposta acima de 30 minutos só paga fila. A regra do §4 impede.
3. **O público da Fase 1 é pequeno.** Aprendizado limitado e frequência alta são esperados. A perda fica limitada pelo gatilho de pulo, pelos 7 dias e pelo saldo de R$ 320.
4. **A atribuição por mensagem pré-preenchida falha quando a pessoa edita o texto.** O código `W0` absorve esses casos; se passarem de 20% das conversas, o teste perde a leitura por anúncio. A correção é a API oficial do WhatsApp com `ctwa_clid`, fora deste escopo.
5. **Revisão e restrição de mensagens** podem pausar tudo de uma vez. Mitigação no §16.
6. **Números da Meta e do caixa divergem** (atribuição, imposto, dupla contagem). A decisão é sempre pelo caixa (Mercado Pago e PEDIDO v1).
7. **Black Friday e dezembro encarecem o CPM.** Nenhuma fase nova de 23 a 29/11; Fase 4 em janeiro.
8. **Regra automatizada mal digitada gasta sozinha.** O teto de R$ 121 na R4, o limite de gastos da campanha e o saldo pré-pago são três travas independentes.
