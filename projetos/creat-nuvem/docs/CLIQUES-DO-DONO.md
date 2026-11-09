# Cliques do dono · Porta Aberta (09/11/2026)

Tudo o que podia ser resolvido por agente foi resolvido. Esta é a lista mínima do que só o Marcos pode fazer, em ordem, com o link exato. Fonte: `marketing/trafego/PLANO-TRAFEGO.md` (seções 5 e 14) e `docs/INTEGRACAO-PAGAMENTO.md`.

## Resolvido sem o dono (09/11/2026)

- Links de pagamento reais no site (Mercado Pago: Abertura R$ 297 e R$ 497, Bastidores R$ 67; Stripe: planos mensais R$ 147 e R$ 297 com portal de cancelamento). Criados por uma função isolada no AutoCreatFlux, executada uma vez e apagada.
- Pixel da Meta ligado no site (ID público 2223314621951948).
- Sites de cliente hospedados no próprio Base44 (`/sites/<slug>/`), sem Cloudflare e sem token.
- 3 sites-demonstração produzidos pela esteira real e no ar, linkados na home ("Veja um site pronto").
- Gestor de tráfego automático todo dia às 8h43 (Bahia), só leitura.
- Revisão semanal do stack (segunda) e inteligência de mercado (quinta) agendadas.

## O que só o Marcos pode fazer

| # | o quê | link | tempo | por que só ele |
|---|---|---|---|---|
| 1 | **Compra de teste de R$ 1 por Pix** no link de teste (vale até 12/11/2026), conferir o recibo no painel e estornar | https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-b1f51c8f-b3f3-4f5f-a9d8-12052accfebc · estorno em https://www.mercadopago.com.br/activities | 5 min | só uma pessoa paga um Pix e confere o próprio extrato |
| 2 | **WhatsApp Business ligado à Página do Facebook**, "Atividade dos seus clientes" ligada, etiquetas (Lead, New order, Pending payment, Paid, Follow up) e respostas rápidas `/f1` a `/f4`, `/l1`, `/l2`, `/recebi` (textos em `marketing/whatsapp-scripts.md`) | https://business.facebook.com/latest/settings/whatsapp_account · e o app WhatsApp Business no celular | 30 min | a Meta exige o código no aparelho que tem o número; o app não tem API oficial para agente |
| 3 | **Montar a campanha desligada** no Gerenciador seguindo o bloco A de `marketing/trafego/campanha-meta.md` §14, e carregar R$ 320 em Pix pré-pago (moeda BRL, fuso America/Bahia) | https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=4078332059160918 · pagamentos: https://business.facebook.com/billing_hub/accounts | 25 min · segunda 16/11 | dinheiro e conta de anúncios são da pessoa física; o MCP oficial da Meta não cria o destino WhatsApp |
| 4 | **Ligar** campanha, conjunto e anúncios | mesmo link do item 3 | 1 min · terça 17/11, 8h | regra da casa: só o dono liga mídia |
| 5 | **Conectar o MCP oficial de anúncios da Meta** ao Claude Code, em leitura (para o gestor de tráfego ler métricas sozinho) | no Claude Code: `claude mcp add --transport http meta_ads https://mcp.facebook.com/ads --scope user`, depois `/mcp` e autorizar com a conta admin do portfólio | 5 min | OAuth exige a conta do dono |
| 6 | **Instagram @creat.mtt no Metricool** (hoje só a marca Grupo Super Kal está conectada), para os posts orgânicos saírem agendados para a sua aprovação | https://app.metricool.com/ | 5 min | login do Instagram é pessoal |
| 7 | **Repositório privado** (o código dos produtos vendidos está público) | https://github.com/centroesportivomtt-ui/creat-mtt-studio/settings (Danger Zone → Change visibility) | 1 min | só o dono do repositório muda a visibilidade |
| 8 | **Nomear quem atende** o WhatsApp de segunda a sábado, 9h às 19h, com resposta em até 5 min (padrão: o próprio Marcos) | responder no chat | 1 min | decisão de pessoa |
| 9 | **Dados que só ele tem**: CNPJ ou MEI da Creat.MTT Studio (para termos e nota) e a taxa real do Pix no Asaas, se for usar o Asaas | responder no chat | 5 min | dado pessoal/fiscal |
| 10 | **Decisões D1 a D11** do plano de tráfego (seção 3 do PLANO-TRAFEGO.md): vetar ou aceitar | responder no chat | 5 min · até 13/11 | decisão do dono; sem resposta vale o padrão |

## O que fica como pendência interna (agentes), sem bloquear a venda

- Plano A do pagamento: funções isoladas `portaAberta*` no AutoCreatFlux com `order_id`, vagas reais e Purchase pelo servidor (gate da Fase 3).
- Conciliação: enquanto o Plano A não entra, o pagamento é confirmado no painel do Mercado Pago e por etiqueta no WhatsApp.
- Revisão jurídica de termos e privacidade (marcados `REVISAO_JURIDICA_PENDENTE`).
- Vídeos dos 3 Reels do lote (roteiros prontos em `marketing/trafego/criativos.md`).

## Correções de 09/11/2026 (conferidas pelo MCP oficial da Meta)

- A conta de anúncios do Porta Aberta é a **CTMTT, `act_4078332059160918`** (portfólio Mttcutedeath), que tem a Página Creat.MTT Studio (1418388018024129) e o Instagram @creat.mtt. O id `916420481553001` que o dossiê trazia não existe neste login e foi trocado em todos os documentos.
- O Pixel `1743291620082635` do dossiê **não existe** na Meta. O pixel da Creat é o **"Crear", `2223314621951948`** (criado em 29/10, disparando de creatmtt.com.br). O site já usa o certo. **Clique do dono (2 min):** em https://business.facebook.com/latest/settings/business_assets → Fontes de dados → Conjuntos de dados → "Crear" → Ativos atribuídos → adicionar a conta de anúncios CTMTT; e renomear "Crear" para "Creat".
- O app AutoCreatFlux também aponta para o pixel inexistente (arquivo `base44/shared/metaBridge.js`); correção fica para a próxima rodada daquele app.
- Página Creat.MTT Studio ainda **não aceitou os Termos de Lead Ads** (`leadgen_tos_accepted: false`). Só é preciso se a campanha usar formulário; a de WhatsApp não exige.
- Conta de anúncios `1427936409451958` está **desativada por atividade incomum**: não usar.

## Montado pela agência na Meta em 09/11/2026 (conta CTMTT, tudo PAUSADO, gasto zero)

Feito pelo MCP oficial da Meta. Nada liga sozinho: a ativação com gasto é bloqueada para agente e fica com o dono.

| campanha | o que é | ids |
|---|---|---|
| `cal-nov26` · célula site | Tráfego · Brasil · 18+ · Advantage+ público e posicionamentos · R$ 40/dia no orçamento da campanha · limite total R$ 300 · otimização "visualizações da página de destino" · pixel 2223314621951948 | campanha 120254150908340237 · conjunto `cal-nov26-amplo-barb-salao` 120254150914740237 · anúncios `A1-barbearia-v1` 120254151012220237, `A1-salao-v1` 120254151012440237, `B1-salao-v1` 120254151012600237 |
| `ctwa-nov26` · célula WhatsApp por link | Leads · limite total R$ 300 · conjunto com R$ 40/dia · Riachão do Jacuípe + 60 km · só celular · Feed, Stories, Reels e Explorar · otimização "cliques no link" · cada anúncio abre `wa.me/5575981151202` com a mensagem pré-preenchida do anúncio | campanha 120254150873900237 · conjunto `ctwa-nov26-fase1-riachao60-link` 120254151018270237 · anúncios `A5-geral-v1` 120254151025310237, `F1-barbearia-v1` 120254151026210237, `T1-barbearia-v1` 120254151026690237, `F1-salao-v1` 120254151027130237, `T1-salao-v1` 120254151027310237 (em análise na Meta desde 09/11) |

Decisões da agência nesta montagem:
- **WhatsApp sem depender do vínculo da Página.** A Meta recusou o destino nativo de WhatsApp (erro 2446886: a Página Creat.MTT Studio não tem WhatsApp ligado). Em vez de esperar, os anúncios usam o link oficial de conversa `wa.me`, que abre o mesmo chat. Custo: a Meta mede clique, não "conversa iniciada", e não há modelo de boas-vindas; a saudação é a automática do app.
- **Aprimoramentos Advantage+ de criativo desligados na origem** em todos os anúncios válidos. Os três primeiros anúncios de site (sem esse desligamento) foram arquivados.
- **Imagens:** S1 (1:1) no feed e S2 (9:16) em Stories e Reels, nas variantes barbearia e salão (`estaticos/renderizar.cjs --nicho salao`).

### O único gesto que falta: ligar (é gasto, só o dono)

| # | o quê | onde | tempo |
|---|---|---|---|
| A | **Ligar a célula site** `cal-nov26`: campanha, conjunto e os 3 anúncios (R$ 40/dia, teto R$ 300) | https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=4078332059160918&selected_campaign_ids=120254150908340237 | 1 min |
| B | **Ligar a célula WhatsApp** `ctwa-nov26`: campanha, conjunto e os 5 anúncios (R$ 40/dia, teto R$ 300). Só ligue com alguém respondendo o WhatsApp em até 5 min | https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=4078332059160918&selected_campaign_ids=120254150873900237 | 1 min |
| C | (melhoria, sem pressa) Ligar o WhatsApp à Página Creat.MTT Studio, para trocar o link pelo destino nativo com contagem de conversas | https://business.facebook.com/latest/settings/whatsapp_account?business_id=694246740441336&asset_id=1418388018024129 | 3 min, com o aparelho do número |

Como ligar: marque a caixa da campanha, entre nos níveis Conjuntos e Anúncios e ligue as chaves dos três níveis. As duas juntas gastam no máximo R$ 80/dia e R$ 600 no total. A Meta revisa antes de entregar (até 24 h).
