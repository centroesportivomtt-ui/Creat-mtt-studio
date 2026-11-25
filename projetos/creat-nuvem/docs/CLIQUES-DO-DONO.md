# Cliques do dono · Porta Aberta (atualizado em 11/11/2026)

Tudo o que dá para resolver por agente foi ou está sendo resolvido. Aqui ficam **só** as 5 perguntas da rodada de 10/11 (P1 a P5), cada uma com o link e o passo. O estado dos anúncios vem de `marketing/trafego/EXPANSAO.md`, que é a fonte; a tabela abaixo é a cópia do dia. O gestor de tráfego atualiza a tabela a cada leitura.

## Estado em 10/11/2026 (conta CTMTT `act_4078332059160918`, lido pelo MCP oficial da Meta, só leitura)

| campanha | estado | verba | id da campanha | anúncios |
|---|---|---|---|---|
| `PA \| Site \| Feira` | ativa | R$ 40/dia, teto R$ 300 | 120254150908340237 | 3 ativos: `A1-barbearia-v1` 120254151686550237, `A1-salao-v1` 120254151686810237, `B1-salao-v1` 120254151686970237 |
| `PA \| Site \| Salvador RMS` | ativa | R$ 40/dia, teto R$ 300 | 120254151674300237 | 3 ativos: `A1-barbearia-v1` 120254151687230237, `A1-salao-v1` 120254151687430237, `B1-salao-v1` 120254151687710237 |
| `ctwa-nov26` (WhatsApp por link, Riachão + 60 km) | **pausada** desde 09/11 | nenhuma | 120254150873900237 | pausados com a campanha |

Total ativo: R$ 80/dia. Os links completos de cada anúncio estão em `marketing/utm.md`, seção "Anúncios no ar".

Para pausar uma campanha: https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=4078332059160918 e desligar a chave da linha da campanha. Ou pedir no chat.

## Pendências do dono (as 5 perguntas da rodada)

| # | o quê | link | o passo | tempo |
|---|---|---|---|---|
| P1 | **Anúncios.** Sim ou não a: (a) pausar os 4 anúncios A1 se não houver resposta em 24 h; (b) em 13/11, subir os textos corrigidos num ato só, com a mesma verba; (c) trocar os vídeos de barbearia e salão no Reels depois da leitura de 30/11 | para ver os anúncios: https://adsmanager.facebook.com/adsmanager/manage/ads?act=4078332059160918 | responder no chat: "sim aos três" ou qual não. Nenhum clique no Gerenciador | 1 min |
| P2 | **Compra de teste de R$ 1 por Pix**, voltar ao navegador, dizer se caiu na página de obrigado e estornar | o link que você já recebeu no chat (preferência `pa-teste`, a mesma de antes, agora válida até 16/11 às 23:59, horário da Bahia): https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-b1f51c8f-b3f3-4f5f-a9d8-12052accfebc · estorno: https://www.mercadopago.com.br/activities | 1. abrir o link no celular; 2. escolher Pix e pagar pelo app do banco; 3. voltar ao navegador e dizer no chat o que apareceu; 4. no link do estorno, tocar no pagamento de R$ 1 e em "Devolver dinheiro". Sem o teste até 12/11 às 17:00 UTC, as duas campanhas são pausadas | 5 min |
| P3 | ~~**Endereço do site.**~~ **FEITO em 10/11/2026.** O dono ligou `nuvem.creatmtt.com.br` (CNAME para `base44.onrender.com` no Registro.br), sem custo. Domínio verificado no Base44, com cadeado. Desde 11/11 é o endereço canônico; o antigo continua no ar e leva ao novo. Detalhes e como voltar atrás: `docs/DOMINIO.md` | nenhum | nenhum clique pendente. Não apague a entrada `CNAME nuvem` no Registro.br | 0 min |
| P4 | **Atendimento e cliques de painel.** Confirmar: segunda a sábado, 9h às 19h; pagamento confirmado em até 2 h; fora do horário, até as 11h do próximo dia de atendimento; devolução em até 5 dias úteis. Com o sim, os cliques ao lado | (a) saudação: app WhatsApp Business > Configurações > Ferramentas comerciais > Mensagem de saudação · (b) aviso de pagamento: app Mercado Pago > Perfil > Configurações > Notificações · (c) nome e logo: https://www.mercadopago.com.br/settings/account · (d) e-mail ao suporte: https://creat-nuvem-404b1994.base44.app/login | (a) colar o texto com o protocolo que a agência manda no chat; (b) ligar "pagamento recebido"; (c) nome exibido "Creat Nuvem" e enviar o logo que vai no chat; (d) entrar uma vez com a conta Google `mttcreatt@gmail.com` (sem isso os e-mails ao suporte não saem). E a decisão com o contador sobre nota fiscal por Abertura paga. Autorizar ou não o Gmail da sessão só para mensagens-modelo, se o app não conseguir mandar e-mail a quem não tem conta | 10 min cada |
| P5 | **Terceiros e gastos futuros.** Sim ou não a: (a) negócio real como exemplo só com o OK escrito do cliente; (b) Metricool Starter (cerca de R$ 142 por mês) só quando o primeiro cliente do plano Vitrine pagar; (c) a tarefa agendada rodar na conta atual do Claude com o dado mínimo do pedido | nenhum | responder no chat | 1 min |

### Fato novo da P2 (coordenador, 10/11/2026)

- A preferência `pa-teste` (R$ 1) **já recebeu** o aviso automático do pagamento (`notification_url = https://creatmtt.com.br/functions/portaAbertaNotificacao`), as voltas com `&resultado=aprovado|recusado|pendente` e validade até 16/11/2026. As outras 13 preferências não foram alteradas.
- Você pode pagar a qualquer momento. Quando pagar, o Mercado Pago chama o servidor de verdade: é a primeira prova do pagamento com o terceiro real, e a agência lê o resultado no registro do servidor. Você não precisa olhar painel nenhum.
- O teste nunca vira pedido de produção: pagamento de teste fica marcado como teste, e nenhum site é feito por causa dele.
- Se você pagar antes de a agência publicar as rotas novas do pedido, nada se perde: o servidor pede ao Mercado Pago para avisar de novo (em 15 min, 30 min, 6 h e 48 h) e o registro fecha no primeiro aviso depois da publicação. A página de obrigado pode ainda não mostrar a confirmação nesse caso; diga no chat o que apareceu, do jeito que estiver.
- **Não verificado** até você pagar: o caminho inteiro (aviso, confirmação e registro de teste) e o que o servidor faz com um pagamento de teste feito direto pelo link, sem pedido aberto antes no site.

## Resolvido ou substituído (riscado)

Itens da lista de 09/11, com o que os resolveu.

| # de 09/11 | item | por quê saiu |
|---|---|---|
| 1 | ~~Compra de teste de R$ 1 no link que vale até 12/11~~ | virou a P2 (link novo, com a volta ao obrigado conferida) |
| 2 | ~~WhatsApp Business ligado à Página, etiquetas e respostas rápidas~~ | o WhatsApp fecha, não prospecta: a campanha por link está pausada e a venda vai pelo site. Fica só a saudação com protocolo, na P4 |
| 3 | ~~Montar a campanha desligada e carregar o Pix pré-pago~~ | montada pela agência pelo MCP oficial em 09/11 e reestruturada por praça em 10/11 (tabela acima) |
| 4 | ~~Ligar campanha, conjunto e anúncios~~ | ligadas em 09/11 por ordem do dono no chat |
| 5 | ~~Conectar o MCP oficial de anúncios da Meta~~ | conectado; o gestor lê a conta todo dia |
| 6 | ~~Instagram @creat.mtt no Metricool~~ | nenhum plano depende de orgânico. O Metricool pago virou a P5 (b) |
| 7 | ~~Repositório privado~~ | decisão do plano de qualidade: o repositório segue público e nada sensível entra no git (dado pessoal, segredo, gasto e saldo ficam fora) |
| 8 | ~~Nomear quem atende o WhatsApp~~ | entrou na P4 (horário e prazos de atendimento) |
| 9 | ~~CNPJ ou MEI e taxa do Asaas~~ | identificação da empresa no ar em termos, privacidade e rodapés desde 10/11; o Asaas não é usado |
| 10 | ~~Decisões D1 a D11 do plano de tráfego~~ | substituídas pelo `EXPANSAO.md` e pela rodada de 10/11 (P1 a P5) |
| - | ~~Atribuir o conjunto de dados "Crear" à conta CTMTT e renomear~~ | o Pixel `2223314621951948` dispara no site desde 10/11 00:42 e os eventos chegam à conta; o ajuste de nome não muda decisão (regra 10). Fica fora da rodada |
| - | ~~"Ligadas em 09/11: as duas células, R$ 80/dia somadas"~~ | estado velho: a `ctwa-nov26` está pausada e a segunda célula ativa é `PA \| Site \| Salvador RMS` (tabela acima) |
| P3 de 10/11 | ~~Ligar um subdomínio de `creatmtt.com.br` ao site~~ | feito pelo dono em 10/11 com o nome `nuvem` (a sugestão era `portaaberta`): `https://nuvem.creatmtt.com.br` responde com cadeado e virou o endereço canônico em 11/11 (`docs/DOMINIO.md`) |

## Resolvido sem o dono (09 e 10/11/2026)

- Links de pagamento reais no site (Mercado Pago: Abertura R$ 297 e R$ 497, Bastidores R$ 67, um link de R$ 297 por praça; Stripe: planos mensais R$ 147 e R$ 297 com portal de cancelamento). Criados por função isolada no AutoCreatFlux, executada uma vez e apagada.
- Pixel da Meta no site (ID público 2223314621951948), carregando desde 10/11 00:42.
- Sites de cliente hospedados no próprio Base44 (`/sites/<slug>/`), sem Cloudflare e sem token.
- 3 sites-demonstração no ar, linkados na home.
- Conferência no ar (`scripts/conferir-no-ar.cjs`) e gestor de tráfego diário.
- Carimbo diário de preço e vagas sem Cloudflare: tarefa agendada às 06:30 (`docs/ROTINA-DIARIA.md`), criada pelo coordenador antes de 16/11.

## Pendência interna (agentes), sem pedir nada ao dono

- Pedido gravado no clique, confirmação de pagamento e executor da entrega (onda 1 do plano de qualidade).
- Revisão jurídica de termos e privacidade (`REVISAO_JURIDICA_PENDENTE`).
- Vídeos do ato 2 (depois da leitura de 30/11).

## Registro da conta (fatos de 09/11, ainda válidos)

- A conta de anúncios do Porta Aberta é a **CTMTT, `act_4078332059160918`** (portfólio Mttcutedeath), com a Página Creat.MTT Studio (1418388018024129) e o Instagram @creat.mtt.
- O pixel da Creat é o **"Crear", `2223314621951948`**. O id `1743291620082635` do dossiê não existe.
- A conta `1427936409451958` está desativada por atividade incomum: não usar.
- A Página não aceitou os Termos de Lead Ads; só seria preciso com formulário de lead, que o plano não usa.
