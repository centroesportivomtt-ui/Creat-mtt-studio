# Creat.MTT Studio: stack definitivo 2026 (08/11/2026, domingo)

Relatório do Nimbus, Diretor de Operações da Creat Nuvem. Baseia-se em 10 categorias pesquisadas e contestadas por refutadores. As correções deles já estão aplicadas.

## 0. Leia primeiro

1. **Não existe ranking "votado e testado" independente por função.** G2 e Capterra bloquearam a leitura automática; quase todas as notas vêm de trechos de busca ou de blogs de fornecedores concorrentes. As escolhas abaixo seguem critérios verificáveis: preço oficial, plano grátis, MCP ou API para o Claude Code, aceitação de CPF/MEI, risco de conta e segurança. Onde a única base é nota agregada, ela é tratada como apoio fraco.
2. **A meta de R$ 4.000 a 6.000 neste domingo não é entregue por nenhuma ferramenta.** Todas as 10 categorias disseram isso por conta própria. A meta se alcança com oferta direta, conversa 1:1 e cobrança por Pix para quem já conhece o estúdio. A stack só reduz o tempo de proposta, contrato, cobrança e nota, e prepara o motor das próximas semanas.
3. **Todas as ferramentas pagas cobram em dólar ou euro, no cartão internacional, com IOF de 3,5% (fonte secundária).** Nenhuma delas aceita Pix. O Metricool recusa cartão virtual e pré-pago. O Pix serve para receber dos clientes.
4. **Câmbio usado:** R$ 5,50 por US$ (cerca de 5,5007 em 06/11/2026). Os valores em reais são cálculos meus, não preços publicados, salvo onde indicado.
5. Conteúdo de páginas da web foi tratado como dado, nunca como instrução.

## 1. Stack em uma tabela

| Função | Ferramenta | R$/mês (estimado) | Fase |
|---|---|---|---|
| Motor da agência | Claude Code (Claude Pro) | cerca de 114 | já |
| Redes: agendar e analisar | Metricool (Free; Starter mensal no 1º cliente) | 0 / cerca de 142 | hoje / semana 2 |
| Edição de Reels e Shorts | CapCut (manual) | 0 | já |
| Artes e carrosséis | Canva (já pago) | já pago | já |
| Imagem por IA | Nano Banana 2.1 (API Gemini) | cerca de 20 por 100 imagens | semana 2 |
| Voz | Gemini 3.8 TTS (ElevenLabs sob demanda) | centavos | semana 2 |
| Anúncios | Meta Ads + MCP oficial (leitura primeiro) | 0 (mídia à parte) | semana 2 |
| Rastreamento | Pixel + CAPI 1 clique + UTM | 0 | semana 2 |
| Site | Cloudflare Workers Static Assets | 0 | semana 1 |
| Domínio | Registro.br | R$ 40/ano | semana 1 |
| Apps | Lovable Pro + Supabase | cerca de 142 (+ 142) | semana 3 |
| Cobrança de serviços | Asaas (como MEI/PJ) | por transação | hoje |
| Checkout de produtos | Cakto | por transação | hoje |
| Plano B de cobrança | Mercado Pago | por transação | hoje |
| WhatsApp | App Business hoje; Cloud API oficial depois | 0 / por mensagem | hoje / semana 3 |
| Automação | n8n Cloud Starter | cerca de 130-140 (não verificado) | semana 3 |
| CRM | HubSpot Free | 0 | semana 1 |
| Agenda | Cal.com Free | 0 | semana 1 |
| Contratos | Clicksign Start | 39 | semana 1 |
| Nota fiscal | Emissor Nacional NFS-e | 0 | hoje/semana 1 |
| E-mail marketing | MailerLite Free | 0 | semana 3 |
| E-mail transacional | Resend Free | 0 | sob demanda |
| SEO | Search Console (+ Ahrefs Free) | 0 | semana 1 |
| Analytics | PostHog Free (cookieless) | 0 | semana 1 |
| Heatmap e replay | Microsoft Clarity | 0 | semana 1 |
| 3D | Meshy Pro (só no mês do kit) | cerca de 114 | sob demanda |

**Custo:** núcleo cerca de R$ 315/mês (Claude + Metricool Starter + Clicksign + imagens). Completo cerca de R$ 590/mês (com Lovable e n8n). Cada ferramenta fica dentro do teto de R$ 150, mas a soma passa dele. Hoje: R$ 0 de ferramenta nova.

## 2. Plano de execução de domingo, em ondas

Os arquivos da pasta `projetos/creat-mtt/domingo/` são novos e serão criados; nenhum existente é alterado.

**Onda 0, você, 30 min (bloqueia tudo).** Defina 3 ofertas com preço fechado (um serviço de entrada, um serviço de mensalidade, um produto digital). Abra a conta Asaas como MEI/PJ. Crie o checkout na Cakto. Gere o link do Mercado Pago. Aceite: um Pix real de R$ 1 pago e recebido por cada caminho disponível.

**Onda 1, em paralelo.**
- *Verbo:* 3 variações de mensagem de WhatsApp (por oferta), 1 legenda de feed e 3 roteiros de Reel. Toca `projetos/creat-mtt/domingo/copy.md`. Aceite: cada texto tem preço, prazo, link de pagamento e chamada única.
- *Paleta:* 3 peças no Canva (feed 4:5, story 9:16, capa de Reel) com a marca do estúdio. Toca `projetos/creat-mtt/domingo/artes/`. Aceite: texto legível a 390 px, mínimo 11 px.
- *Radar:* lista de contatos quentes da base própria, ordenada por probabilidade, a partir do que você fornecer. Toca `projetos/creat-mtt/domingo/leads.md`. Aceite: nenhum número comprado, só quem já conhece o estúdio.

**Onda 2, em paralelo.**
- *Pixel e Trilho:* página de oferta estática com botão para o link Pix e UTM, publicada na Cloudflare (`wrangler deploy` com `assets.directory`). Toca `projetos/creat-mtt/domingo/site/`. Aceite: abre sem erro de console; o botão leva ao checkout certo.
- *Nimbus (via Metricool MCP):* agendar posts do domingo e da semana, sempre 'para revisão'. Aceite: no Free, no máximo 20 publicações por mês, contadas por rede.

**Onda 3.** *Lupa* percorre o fluxo da página ao Pix no navegador e roda `verificacao-visual` (celular e desktop, claro e escuro). *Crivo* revisa. *Muralha* confirma que não há chave no repositório. Aceite: veredito aprovado e prints olhados.

**Onda 4, você.** Mensagens 1:1 no WhatsApp para a lista, com responder rápido; stories com link; follow-up às 12h e às 18h. Aceite: cada Pix recebido vira registro (planilha ou HubSpot). O envio é 1:1 para quem tem o seu número salvo. A regra geral do WhatsApp contra disparo em massa não foi verificada aqui. Nunca use API não oficial.

Aritmética de exemplo (preços hipotéticos, não previsão): 2 serviços de R$ 1.500 mais 10 produtos de R$ 197 dão R$ 4.970. No Cakto, o Pix libera em D+1: o dinheiro pode cair na segunda-feira, embora a venda conte hoje.

## 3. Tabelas por categoria

Legenda de confiança original: 1 a 5 (de 3 a 4 na maioria). Todas as recomendações foram mantidas, algumas com ressalvas pesadas.

### 3.1 Redes sociais (Instagram, TikTok, YouTube Shorts, LinkedIn)

| Posição | Ferramenta | Preço | Grátis | API/MCP | Observação | Fonte |
|---|---|---|---|---|---|---|
| nº 1 | Metricool | Free R$ 0; Starter US$ 25 mensal (cerca de R$ 142 com IOF) ou US$ 20 no anual (cobra cerca de US$ 240 à vista); 10 marcas US$ 36 anual; Advanced a partir de US$ 53 anual (cerca de R$ 292) | Sim | MCP oficial em qualquer plano; API HTTP só em Advanced e Custom | Cobra por marca. Free: 1 marca fixa, 20 posts publicados por mês (mesmo vídeo em 3 redes gasta 3), sem LinkedIn, 30 dias de análises, sem Canva e Drive. Só cartão ou PayPal, sem Pix, sem cartão virtual. | https://metricool.com/pricing/ ; https://help.metricool.com/faqs-about-the-metricool-mcp-1i3w0 ; https://help.metricool.com/pt/metodos-de-pagamento-disponiveis-no-metricool-0siw2 |
| alt. | Buffer | Grátis (3 canais, 10 posts por canal); Essentials US$ 5/canal anual (US$ 6 mensal); Team US$ 10 anual (US$ 12 mensal) | Sim | API e MCP oficiais em todos os planos desde 27/05/2026 | Free cobre LinkedIn; cobra por canal (5 clientes x 4 redes: cerca de US$ 100/mês). Horário ideal e relatórios fora do grátis. | https://buffer.com/pricing ; https://buffer.com/resources/buffer-api-is-here/ |
| alt. | Postiz | Nuvem Standard US$ 29 (cerca de R$ 160) | Só 7 dias de teste | MCP, CLI, API | Acima do teto; autohospedar exige apps de desenvolvedor aprovados por Meta, YouTube e TikTok (semanas). | https://postiz.com/pricing |
| alt. | mLabs | R$ 29,90/marca/mês (anual), Pix com até 15% de desconto | Teste de 7 dias | Não encontrada | Para o cliente que opera sozinho, em reais. Página oficial não reconferida na verificação. | https://www.mlabs.com.br/planos |
| alt. | Meta Business Suite / API Instagram | R$ 0 (preço não verificado) | Sim | API oficial; sem MCP | Contingência. Limite de publicações por API se contradiz (100 ou 50 por 24 h). | https://developers.facebook.com/documentation/instagram-platform/content-publishing |
| alt. | CapCut / Descript / Canva | CapCut grátis ou US$ 19,99; Descript US$ 16 | Sim | Sem API oficial no CapCut | CapCut manual. | https://www.capcut.com/pricing ; https://www.descript.com/pricing |

Limites por rede que afetam o conteúdo: Instagram só conta profissional, sem editar post publicado, carrossel até 10 itens; TikTok em conta pessoal sem capa personalizada e sem Stories; YouTube sem miniatura personalizada em Shorts e 10 posts/24 h no Free. Avaliações: Capterra 4,4 (98) não reconfirmada; G2 cerca de 4,5 (menos de 100); Trustpilot 3,9 (615) com queixas de cobrança, posts duplicados e contas desconectadas (fonte secundária). **Correção aplicada:** "começar no Free" vale só para a marca do estúdio. A Buffer Free fica como alternativa se o LinkedIn do estúdio for obrigatório. **Cai para:** Buffer.

### 3.2 Anúncios pagos

| Posição | Ferramenta | Preço | API/MCP | Observação | Fonte |
|---|---|---|---|---|---|
| nº 1 | Meta Ads (Mensagens/WhatsApp) + MCP oficial | Ferramenta R$ 0; mídia mínima realista R$ 900-1.800/mês; mediana de contas locais R$ 31/dia | MCP em beta aberto, por conta; Meta Ads CLI | Imposto desde 01/01/2026: cartão R$ 100 vira R$ 113,83; Pix pré-pago R$ 100 pagos viram R$ 87,85 de mídia. Criação via MCP limitada (só criativo de imagem única; sem upload; sem Instant Form). Ads MCP server rules (desde 16/07/2026) limitam orçamento. Registro automático para Claude Code, sem App ID. | https://developers.facebook.com/documentation/mcp/connect-an-mcp-client ; https://pt-br.facebook.com/government-nonprofits/blog/reforma-tributaria |
| alt. | Google Ads Pesquisa local | Mínimo R$ 5/dia; realista R$ 600-1.500/mês | MCP oficial só leitura | Para busca urgente (mecânica CPL R$ 15-35). Developer token descontinuado em 09/09/2026. | https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server |
| alt. | Stape CAPI Gateway / GTM server-side | cerca de US$ 8-10 por Pixel | n/a | Só se o CAPI de 1 clique não bastar. | https://stape.io/price-gateway |
| alt. | Canva para criativos | Grátis ou Pro US$ 144/ano | MCP | 3 a 5 variações por oferta. | https://www.canva.com/pt_br/precos/ |
| alt. | TikTok Ads | US$ 20/dia por grupo, US$ 50 por campanha | n/a | Descartado para verba pequena. | https://ads.tiktok.com/resources/help/article/about-daily-budgets |

Benchmarks de CPL (Intent, 2025-2026, só contas com 90+ dias e mínimo de R$ 1.000/mês): Meta estética R$ 18-45, odontologia R$ 18-55, mecânica R$ 20-50; Google estética R$ 40-90, odontologia R$ 55-120, mecânica R$ 15-35. Não há dado para academia, barbearia nem supermercado. Não há avaliação agregada comparável entre Meta e Google; a justificativa é custo e MCP com escrita. Pessoa física pode anunciar com CPF segundo uma agência (fonte comercial). Conta de exemplo: R$ 1.000 no Meta (cerca de R$ 878 de mídia no Pix) com CPL de R$ 20-50 dá 17 a 44 leads no mês; com fechamento de 15 a 25% (premissa da B300) seriam 3 a 11 clientes ao longo de semanas. **Cai para:** operar pelo Gerenciador; se o canal cair, Google Ads de pesquisa.

### 3.3 Sites, hospedagem e domínio

| Posição | Ferramenta | Preço | MCP/API | Observação | Fonte |
|---|---|---|---|---|---|
| nº 1 | Cloudflare Workers Static Assets (Pages como reserva) + Registro.br | Hospedagem R$ 0; .com.br R$ 40/ano | MCP oficial (mcp.cloudflare.com/mcp); Wrangler; API | Estático grátis e ilimitado. Free: 20.000 arquivos por versão, 25 MiB por arquivo, 100 mil requisições/dia de Worker para a conta toda (429 ao estourar). Sem Pix na Cloudflare documentado. DNSSEC: remover o DS antes de trocar os nameservers. Pages e a escala por conta para Workers não verificados. | https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ ; https://developers.cloudflare.com/workers/prompts/pages-to-workers.txt |
| alt. | Netlify | Free (300 créditos) ou Personal US$ 9-15 | MCP oficial | Formulários nativos; pausa tudo ao estourar; só cartão. | https://www.netlify.com/pricing/ |
| alt. | Framer | Basic US$ 10; Pro US$ 30 | MCP oficial | Para cliente que edita sozinho. | https://www.framer.com/pricing |
| alt. | Webflow | Basic US$ 15; Premium US$ 25 | MCP oficial | Site vive no editor, não é HTML de IA. | https://webflow.com/pricing |
| alt. | Wix / WordPress BR | WordPress a partir de R$ 5,90-5,99 promocional | MCP | Manutenção de plugin come tempo. Moeda do Wix não confirmada. | https://pt.wix.com/pricing |

Sem nota agregada confirmada (G2 e Capterra bloqueados). Core Web Vitals de blogs são indício, não fato. Os limites vieram de snippets de busca de páginas oficiais, porque developers.cloudflare.com não abriu na rede da sessão. **Cai para:** não cai; Netlify assume se o teto de Worker virar problema.

### 3.4 Apps e sistemas

| Posição | Ferramenta | Preço | MCP | Observação | Fonte |
|---|---|---|---|---|---|
| nº 1 | Lovable Pro + Supabase | Lovable Pro US$ 25 mensal (anual US$ 250); Supabase Pro US$ 25 | Lovable oficial (OAuth, qualquer plano); Supabase remoto oficial | Free: 5 créditos/dia (30/mês), sem edição nem download de código, sem domínio, com marca. Créditos de build, hospedagem e IA no mesmo saldo. G2 4,6 (459). Segurança: RLS e GRANT explícitos; CVE-2025-48757. | https://docs.lovable.dev/introduction/subscription-plans ; https://supabase.com/pricing |
| alt. | Base44 (já usado) | Builder US$ 40 anual / 50 mensal | MCP com sandbox | Exige Builder; só cartão; Trustpilot 2,8 por fonte de concorrente. App de loja é wrapper web view. | https://docs.base44.com/developers/backend/overview/mcp-server |
| alt. | Replit Core | US$ 20 mensal | Conector no Claude | Apps mobile nativos; G2 4,4 (418). | https://replit.com/pricing |
| alt. | FlutterFlow | Basic US$ 39 mensal | Sem MCP oficial achado | Só se o cliente exigir app nativo nas lojas. | https://www.flutterflow.io/pricing |
| alt. | Softr | Free existe | API e MCP listados | Portais e CRMs sobre dados. | https://www.softr.io/pricing |

**Cai para:** Base44 Builder se o teste de um dia com o Lovable queimar créditos. Pix nativo no Lovable e preço em reais: não verificados.

### 3.5 Pagamentos e vendas

| Posição | Ferramenta | Preço | MCP/API | Observação | Fonte |
|---|---|---|---|---|---|
| nº 1 (serviços) | Asaas | Pix R$ 2,15 (promo R$ 1,08 por 3 meses; confira na conta); cartão à vista R$ 0,49 + 2,99%; 2 a 6x 3,49%; 7 a 12x 3,99% | MCP de documentação; API v3 e sandbox | Equilíbrio com Mercado Pago em cerca de R$ 217. Pix Automático só PJ. Troca PF para PJ pode travar saldo. Reclame Aqui 8,3. | https://www.asaas.com/precos-e-taxas ; https://blog.asaas.com/pix-automatico/ |
| nº 1 (digitais) | Cakto | Pix 0% + R$ 2,49 (D+1); cartão 4,99% + R$ 2,49 | MCP operacional; API OAuth2 | Reclame Aqui 8,0 (5.011 reclamações; estorno 31,95%); reserva de segurança. | https://www.cakto.com.br/taxas ; https://www.cakto.com.br/mcp |
| alt. | Mercado Pago | Pix 0,99%; crédito 3,99% a 4,98% | MCP oficial | Plano B imediato. Relatos de atraso em saques. | https://www.mercadopago.com.br/developers/pt/docs/mcp-server/overview |
| alt. | Kiwify | 8,99% + R$ 2,49 | API; sem MCP | Pix em 2 dias. | https://docs.kiwify.com.br/api-reference/general |
| alt. | InfinitePay | Pix grátis; crédito 4,2% | Checkout por API | Presencial (InfiniteTap); link avulso não aceita Pix. | https://www.infinitepay.io/taxas |
| alt. | Stripe Brasil | Cartão 3,99% + R$ 0,39; Pix 1,19% | Melhor API | Pix para conta nova não confirmado. | https://stripe.com/br/pricing |
| evitar | Hotmart, Pagar.me, Payhip | Hotmart 9,9% + R$ 2,49 | n/a | Hotmart caro; Pagar.me exige CNPJ; Payhip sem Pix. | ver relatório de categoria |

Não há avaliação G2 ou Capterra para essas empresas; a reputação vem do Reclame Aqui. Limites de conta PF no Asaas, prazo de aprovação e preço do Plano Plus: não verificados.

### 3.6 WhatsApp, CRM e automação

| Posição | Ferramenta | Preço | Observação | Fonte |
|---|---|---|---|---|
| nº 1 | WhatsApp Business Platform (Cloud API oficial) + n8n | Marketing R$ 0,3217; utilidade, autenticação e serviço R$ 0,0350; 1.000 de serviço grátis por número/mês. n8n Cloud Starter 20 EUR (2,5 mil execuções) ou Community grátis | Cobrança de serviço desde 01/10/2026. Janela de entrada grátis de até 7 dias (só anúncio, app de celular, resposta em 24 h). Portfólio sem verificação: 250 contatos distintos por 24 h fora da janela. Conta em BRL com migração até 30/06/2027. Um webhook por app Meta no n8n. Pix na Meta e CNPJ obrigatório: não verificados. | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing ; https://n8n.io/pricing/ |
| alt. | Kommo | US$ 20/30/45 por usuário, contrato mínimo de 6 meses | Onboarding por parceiro. Cai para ele se a Cloud API direta falhar. | https://www.kommo.com/br/precos/compare-planos/ |
| alt. | HubSpot CRM Free | R$ 0 | MCP oficial. | https://www.hubspot.com/pricing/crm |
| alt. | Cal.com | R$ 0 | MCP oficial. | https://cal.com/pricing |
| alt. | Z-API / Evolution | R$ 99,99 por instância / grátis | Só protótipo. | https://z-api.io/ |
| alt. | Chatwoot, Typebot, Make, Zapier, RD Station | variados | Só para equipe; RD Conversas a partir de R$ 989/mês. | links no JSON |

Notas: n8n G2 4,5-4,6 e Capterra 4,6-4,7 (secundárias). Licença do n8n: permitido rodar fluxos para clientes na sua instância. Risco: Hostinger teve atraso de webhook em fev/2026.

### 3.7 E-mail, divulgação e SEO

| Posição | Ferramenta | Preço | Observação | Fonte |
|---|---|---|---|---|
| decisão do diretor | MailerLite Free | R$ 0 até 250 assinantes e 2.500 e-mails/mês; Comfort US$ 12 | MCP com OAuth; envio por API/MCP só em plano pago; sem transacional | https://www.mailerlite.com/pricing |
| nº 1 original | Brevo | Grátis (300 e-mails/dia, 100 mil contatos); Starter cerca de R$ 40; Standard cerca de R$ 81 | Incidentes de set/2026; suspensão automática no cadastro; exige domínio autenticado; token completo envia campanha | https://www.brevo.com/pricing/ ; https://www.securityweek.com/brevo-supply-chain-attack-injects-malware-into-100000-websites/ |
| alt. | Resend | Grátis 3.000/mês e 100/dia; Pro US$ 20 | Transacional, MCP OAuth | https://resend.com/pricing |
| alt. | Search Console e Ahrefs Free | R$ 0 | Sem MCP oficial do Google | https://ahrefs.com/webmaster-tools |
| alt. | TabNews, r/brdev, LinkedIn; Kiwify, Eduzz, Hotmart | R$ 0 / taxas | Público de desenvolvedores, não de dono de barbearia | https://www.tabnews.com.br/faq |

Avaliações: Brevo Capterra 4,6 (3.528), G2 cerca de 4,5; MailerLite G2 cerca de 4,6 e Capterra cerca de 4,7 (secundárias): empate técnico. A escolha do MailerLite é decisão de risco minha; se o estúdio aceitar o risco, a Brevo volta com 2FA, chaves giradas e token por módulo.

### 3.8 Produção: imagem, vídeo, voz, música, 3D, apresentações

| Posição | Ferramenta | Preço | Observação | Fonte |
|---|---|---|---|---|
| nº 1 original | Runway Pro (MCP hospedado) | US$ 28 anual (cerca de R$ 159 com IOF) ou US$ 35 mensal (cerca de R$ 198); 2.250 créditos | Acima do teto. "4K ilimitado" é upscale só no app; MCP só gasta crédito; Kling 4.0 e Wan 3.0 não confirmados no MCP; Free de 125 créditos não testa o MCP. Sem avaliação verificada. | https://runway.com/pricing ; https://runway.com/mcp |
| decisão do diretor | Gemini: Nano Banana 2.1 (imagem) e 3.8 TTS (voz) | US$ 0,0336/imagem 1K; cerca de US$ 16,49 por milhão de caracteres | Planos Google AI Plus R$ 24,99 e Pro R$ 96,99 em reais; cotas de Veo e Nano Banana por plano não confirmadas | https://ai.google.dev/gemini-api/docs/pricing |
| alt. | fal.ai | por uso | Se a Runway cair; MCP próprio | https://fal.ai/explore?q=wan |
| alt. | ElevenLabs | Starter US$ 6 | Líder em voz (Elo 1338); grátis sem licença comercial | https://elevenlabs.io/pricing |
| alt. | Meshy / Tripo | Pro US$ 20 | 3D; Meshy grátis exige atribuição; Tripo grátis só não comercial | https://www.meshy.ai/pricing |
| alt. | Suno | Pro US$ 10, 20 downloads/mês | Risco jurídico aberto (GEMA, Sony) | https://suno.com/pricing |

Voto cego (Artificial Analysis, 08/11/2026): vídeo, 1º Wan 3.0 (1172), 5º Seedance 2.5, 23º Veo 3.1; o Kling 4.0 não aparece. Evitar: Sora (encerrado), Udio, Midjourney em automação, Adobe Firefly como principal. Nenhuma nota G2 verificada.

### 3.9 Métricas, analytics e testes

| Posição | Ferramenta | Preço | Observação | Fonte |
|---|---|---|---|---|
| nº 1 | PostHog Cloud Free (cookieless always) só nos sites do estúdio | R$ 0 até 1 milhão de eventos, 5 mil replays | 1 projeto no grátis; sem replay nem surveys em cookieless; A/B por flag não é garantido entre dias, então use duas URLs; DPA sem cláusulas da ANPD; MCP limitado a 480 req/min e com modo readonly. G2 4,5 (1.056), coleta incentivada. Conversão Pix não verificada. | https://posthog.com/pricing ; https://posthog.com/docs/privacy/data-collection |
| alt. | Umami | Self-hosted grátis; Cloud Pro US$ 20 | Para múltiplos sites de clientes; MCP v3.4.0 | https://umami.is/pricing |
| alt. | Microsoft Clarity | R$ 0 | MCP com 10 req/dia; não é cookieless | https://learn.microsoft.com/en-us/clarity/faq |
| alt. | GA4 + Data Studio | R$ 0 (Pro US$ 9) | MCP só leitura | https://developers.google.com/analytics/devguides/MCP |
| alt. | Plausible | Business US$ 19 com API | MCP não oficial | https://plausible.io/#pricing |
| evitar | Hotjar; Google Optimize (encerrado) | Growth US$ 39 | Grátis com 5% das sessões | https://www.hotjar.com |

### 3.10 IA para operar o estúdio

| Posição | Ferramenta | Preço | Observação | Fonte |
|---|---|---|---|---|
| nº 1 | Claude Code (Pro) | US$ 20 mensal (US$ 17 anual); cerca de R$ 114 | Terminal-Bench 4.0: 64,8% (Opus 5.5), 61,8% (Sonnet 5.5) contra 58,2% do Codex; limite de 5 h e semanal compartilhado com o chat; Opus pode ser cobrado à parte (não verificado). Só cartão. | https://claude.com/pricing ; https://snorkel.ai/leaderboard/terminal-bench/ |
| alt. | OpenAI Codex (Plus) | US$ 20 | Segundo motor; US$ 1,92 por tarefa | https://developers.openai.com/codex/pricing |
| alt. | Clicksign / ZapSign | Clicksign Start R$ 39; ZapSign Equipe R$ 69,90 | ZapSign Profissional sem API | https://www.clicksign.com/preco ; https://zapsign.com.br/planos-pre%C3%A7os |
| alt. | Emissor Nacional / Focus NFe | R$ 0 / R$ 94,90 | NFS-e obrigatória desde 01/11/2026 para ME e EPP do Simples | https://www.gov.br/nfse |
| alt. | Notion, Trello, Linear, ClickUp | Free | Cortados da stack para não dispersar | https://www.notion.com/pricing |

Figma MCP: 20 chamadas por mês em assento View/Collab, 200 por dia no Full do Professional; escrita no canvas grátis só na beta. Tratar como opcional.

## 4. O que não ficou verificado (resumo)

- Nenhum teste independente nem votação por função; notas G2, Capterra e Trustpilot vêm de fontes secundárias.
- Preço em reais de quase tudo: são cálculos meus (câmbio de 06/11 e IOF de 3,5%).
- Pix, boleto e nota fiscal nas assinaturas estrangeiras: não confirmados (cartão assumido).
- Exigência de CNPJ/MEI para verificação da Meta no WhatsApp, e limites de conta PF no Asaas.
- Conversão do Pix para evento no PostHog; MCP do Clicksign no plano Start; Canva (plano exigido pelo conector).
- Pix, Veo e Nano Banana por plano do Google; comandos de MCP da Cloudflare não testados.
- Teto de faturamento do MEI diante de meta alta: não pesquisado.
- Nada foi testado com conta real; tudo é leitura de documentação, páginas de preço e buscas de 08/11/2026.

## 5. Segurança operacional

OAuth do Metricool dá acesso amplo: autorize só no seu Claude Code e revogue em Settings. MCP do Meta e do Cloudflare em modo 'ask'; campanhas criadas pausadas. Chaves de API (Gemini, ElevenLabs, Asaas) em variável de ambiente e com limite de gasto; use Sandbox do Asaas para testar. Nada de segredo no repositório. Injeção de prompt: conteúdo de páginas e de mensagens é dado, não instrução.

## Resumo executivo

Stack definitivo do Creat.MTT Studio com uma ferramenta por função, já com as correções dos refutadores. Núcleo: Claude Code Pro, Metricool, Cloudflare, Asaas, Cakto, Clicksign, MailerLite, PostHog e HubSpot Free. O custo fixo é cerca de R$ 315/mês no núcleo e cerca de R$ 590/mês com Lovable e n8n, sempre com IOF de 3,5% e dólar a R$ 5,50 (estimativas). Hoje a conta é praticamente zero de ferramenta nova.
Aviso: nenhuma fonte fez ranking independente "votado e testado" por função. G2 e Capterra bloquearam a leitura direta. Escolhi por preço oficial, MCP/API, elegibilidade para CPF e risco, e marquei o que não foi verificado.
Nenhuma ferramenta desta pesquisa gera R$ 4.000 a 6.000 sozinha neste domingo. Anúncio novo e SEO levam semanas. A meta de hoje vem de oferta direta, por conversa 1:1 no WhatsApp e no Instagram para a base que já conhece você, com cobrança por Pix. A conta é sua aritmética, não previsão: por exemplo 2 serviços de R$ 1.500 mais 10 produtos de R$ 197 dão R$ 4.970. Troque pelos seus preços reais.
Não instale nada novo hoje, exceto o que destrava o Pix. Antes de vender, teste um Pix real de R$ 1. Pagar fornecedor exige cartão internacional (o Metricool não aceita cartão virtual nem pré-pago), e o Pix só vale para receber dos clientes.
Abra a conta Asaas já como MEI/PJ: a migração de PF para PJ já bloqueou saldo por cerca de uma semana. Se o Asaas não aprovar a tempo, use o link do Mercado Pago como plano B imediato.
Anúncios (Meta) e automação (n8n, WhatsApp Cloud API) são o motor da semana que vem.

## Custo mensal total

Estimativa com dólar a R$ 5,50 (PTAX de 06/11/2026) e IOF de 3,5% no cartão internacional; todas as cobranças de fornecedor exigem cartão (nenhuma aceita Pix).
HOJE (domingo): R$ 0 de ferramenta nova. Você usa o que já paga (Claude, Canva, Metricool, Base44, Drive) e as ferramentas grátis.
NÚCLEO FIXO, a partir do 1º cliente: cerca de R$ 315/mês = Claude Pro R$ 114 + Metricool Starter mensal R$ 142 + Clicksign Start R$ 39 + imagens por API cerca de R$ 20. Cloudflare, Cal.com, HubSpot Free, MailerLite Free, PostHog Free, Clarity, Search Console, Resend Free e Emissor NFS-e custam R$ 0. Domínio: R$ 40/ano por site, repassado ao cliente.
COMPLETO (mês 2 em diante): cerca de R$ 590/mês, somando Lovable Pro cerca de R$ 142 e n8n Cloud Starter cerca de R$ 130-140 (estimativa não verificada). O Supabase Pro (cerca de R$ 142) entra por cliente em produção, e o Meshy (cerca de R$ 114) só no mês de produção do kit 3D.
Cada ferramenta individual fica dentro do teto de R$ 150, mas a soma passa dele. Canva, Base44 e Metricool atual já estão pagos e foram contados só onde há mudança.
VARIÁVEL: Asaas (Pix R$ 2,15 por recebimento), Cakto (Pix 0% + R$ 2,49; cartão 4,99% + R$ 2,49) e Mercado Pago (Pix 0,99%) descontam por venda. Mídia de anúncio é do cliente (R$ 900-1.800/mês é o mínimo realista); no Pix pré-pago só 87,85% do depósito vira mídia. Os valores em reais são cálculos meus sobre câmbio de snapshot; nenhum fornecedor publica preço em BRL, exceto Google AI Plus/Pro, Clicksign, Asaas, mLabs e Registro.br.

## Ordem de adoção

1. 1. HOJE, 0 a 60 min: destravar o recebimento. Abra a conta Asaas já como MEI/PJ (a migração PF para PJ já travou saldo por cerca de uma semana) e crie o checkout na Cakto. Tenha o link do Mercado Pago pronto como plano B. Faça um Pix real de R$ 1 de ponta a ponta. Sem cobrança funcionando, o resto não vira dinheiro. Confirme também se o estúdio tem MEI/CNPJ, pois isso muda Pix Automático, nota fiscal e teto de faturamento (não pesquisado).
2. 2. HOJE: vender com o que já existe. Oferta direta 1:1 no WhatsApp Business (app) e Instagram para a base que conhece você; use Canva e o Claude (agente Verbo) para copy e arte. Não instale nada novo: o ganho de hoje é execução, não stack.
3. 3. HOJE: agendar a divulgação da semana no Metricool Free (marca do estúdio, 20 posts por mês contados por rede, ou seja, cerca de 6 conteúdos em 3 redes). Crie sempre como 'para revisão' e aprove você. Todo link com UTM.
4. 4. Esta semana (dias 2 a 7): Cloudflare mais domínio para a página de oferta e os sites de clientes; PostHog Free no site do estúdio; Cal.com e HubSpot Free; Clicksign para contrato; NFS-e no Emissor Nacional. Tudo grátis ou perto disso e já com MCP, e resolve proposta, contrato, agenda e nota.
5. 5. Semana 2: ao fechar o 1º cliente, assine o Metricool Starter MENSAL (nunca o anual de entrada). Rode 14 dias de Meta Ads com Pixel e CAPI, campanha de Mensagens/WhatsApp pausada até aprovação, um canal só, com R$ 25-50/dia por cliente.
6. 6. Semanas 3 a 4: WhatsApp Cloud API oficial mais n8n, quando houver volume de conversas; um app Meta por cliente, e antes verifique o negócio na Meta (portfólio novo envia a só 250 contatos distintos fora da janela de 24h). Só depois disso, Lovable Pro para apps de clientes e MailerLite para a newsletter dos produtos.
7. 7. Depois, só com dinheiro em caixa e teste curto antes: Runway Pro (hub de vídeo; o Pro anual custa cerca de R$ 159 e o mensal cerca de R$ 198, ambos acima do teto, e o MCP gasta crédito em tudo), Meshy no mês do kit 3D, Umami self-hosted para sites de clientes e Google Ads de pesquisa para negócios com busca urgente.

## Fluxo de venda ponta a ponta

VENDA DE SERVIÇO (site, app, identidade, gestão de redes), de ticket alto:
1) Atração: post ou Reel criado no Canva e CapCut (roteiro e legenda pelo agente Verbo no Claude Code), agendado no Metricool com UTM padronizado. Na semana 2 em diante entram anúncios no Meta Ads (objetivo Mensagens/WhatsApp), com Pixel e CAPI.
2) Conversa: o lead chega ao WhatsApp Business (app hoje; Cloud API oficial mais n8n depois). O contato e o negócio são registrados no HubSpot Free. O horário de reunião vem do Cal.com (link na bio e na conversa).
3) Proposta: o Claude monta a proposta a partir do modelo (Google Drive ou Docs) com escopo, preço e prazo; o contrato sai do Clicksign (link de assinatura).
4) Cobrança: link ou assinatura no Asaas. Pix a R$ 2,15 vale a pena acima de cerca de R$ 217 por cobrança; abaixo disso, ou se o Asaas ainda não aprovou, use o link do Mercado Pago. Entrada de 50% antes de começar, o resto na entrega. Mensalidade de gestão de redes por assinatura, com Pix Automático apenas se você for MEI/PJ.
5) Entrega: Pixel (site) publica na Cloudflare com domínio do Registro.br; o app sai no Lovable com Supabase (ou no Base44, se já estiver lá). Lupa testa o fluxo no navegador, Muralha audita, Crivo revisa. Metricool agenda o conteúdo do cliente. PostHog e Clarity medem; o Claude Code lê os números por MCP.
6) Fechamento: nota emitida no Emissor Nacional (NFS-e), relatório mensal pelo Metricool e pelo PostHog, e o cliente entra na lista para upsell.
VENDA DE PRODUTO DIGITAL (pacote de agentes, kit 3D, template de barbearia), de ticket baixo:
1) Post, Reel ou artigo no TabNews ou LinkedIn (público de desenvolvedores) com link UTM para a página de venda na Cloudflare.
2) A página leva ao checkout da Cakto (Pix 0% + R$ 2,49, liberação D+1, entrega automática). Você mede visita e clique no PostHog e no Clarity; a venda confirmada só aparece se você ligar o webhook da Cakto ao PostHog, o que não foi testado.
3) Compradores e leads entram no MailerLite Free para a sequência de boas-vindas e novos lançamentos. A nota fiscal segue a regra do seu enquadramento.
HOJE, versão mínima: oferta 1:1 no WhatsApp e Instagram, link Pix (Asaas, Cakto ou Mercado Pago) e agendamento no Metricool Free. Sem tráfego pago e sem ferramenta nova.

## O que não fazer

- Não prometa nem planeje a meta de R$ 4.000 a 6.000 de domingo com anúncio novo, SEO ou e-mail: as fontes não sustentam venda nesse prazo. Campanha nasce pausada, passa por revisão e aprendizado de 1 a 6 semanas, e o Pix pré-pago é creditado antes de gastar. Hoje a venda vem de oferta direta à base existente.
- Não comece o cliente no Metricool Free: ele tem 1 marca fixa que não dá para trocar nem adicionar. Cliente exige Starter desde o dia 1, mas assine o MENSAL (cerca de R$ 142 com IOF), nunca o anual de US$ 240 à vista, antes de 1 a 2 meses de teste. Não pague o X/Twitter (US$ 10 por conta) nem o Advanced (cerca de R$ 292) só para ter API.
- Não use WhatsApp por API não oficial (Baileys, whatsapp-web.js, Z-API, Evolution em QR Code) no número principal de cliente: o banimento é permanente, e o próprio Z-API admite o risco. Não dispare mensagem de marketing em massa pela API oficial (R$ 0,3217 por mensagem); prefira conversas iniciadas pelo cliente. Não rode a Cloud API sem forma de pagamento cadastrada na Meta.
- Não conecte conectores ou MCPs não oficiais de Meta Ads (risco de bloqueio da conta). Use só mcp.facebook.com/ads, comece em leitura, crie campanha sempre pausada, ative as Ads MCP server rules para limitar orçamento e aprove você mesmo. Não divida pouca verba entre Meta, Google e TikTok: abaixo de R$ 2.000/mês, um canal só. Descarte TikTok Ads por ora (US$ 20/dia por grupo).
- Não conte com o Pix Automático do Asaas em conta PF, e não abra PF para migrar depois (relatos de saldo bloqueado). Abra já como MEI/PJ. Não concentre o caixa do mês numa conta só. Não use a promessa do site do Asaas ('zero bloqueios') como evidência. Hotmart fica fora dos produtos de ticket baixo (9,9% mais R$ 2,49); Pagar.me exige CNPJ.
- Não hospede site de cliente no GitHub Pages (termos proíbem negócio) nem no Vercel Hobby (uso não comercial). Netlify Free como padrão é arriscado: estourar os 300 créditos pausa todos os projetos e só aceita cartão. Não assuma que Pix paga a conta da Cloudflare (não documentado) e não use `wrangler pages deploy` em projeto novo.
- Não publique app do Lovable sem Muralha: CVE-2025-48757 afetou 170 de 1.645 projetos examinados (10,3%) e RLS mal escrita vaza dados. Não deixe cliente em produção no Supabase Free (pausa após 1 semana de inatividade). Não entregue projeto do Lovable Free ao cliente (marca 'Edit with Lovable', sem código nem domínio próprio).
- Não use a Brevo como principal agora: houve invasão de 138 contas (9-10/09/2026) e injeção de scripts em brevo.com e sibforms.com (14/09/2026). Se voltar a usar, gire todas as chaves e tokens, use 2FA, não embuta widget em site de cliente e prefira token por servidor MCP ou o conector OAuth, que só cria rascunho. Não envie campanha de teste para lista comprada.
- Não prometa 'cookieless resolve a LGPD' nem 'PostHog mede de onde vem cada venda' antes de testar. O modo cookieless always desliga replay e surveys, quebra a identidade entre dias e não tem cláusulas da ANPD para transferência internacional. Faça teste A/B por duas URLs, não por flag. Decida a base legal do Clarity com advogado antes de instalar em site de cliente.
- Não automatize o CapCut por scripts ou MCP comunitário. Não use Sora (encerrado), Udio (downloads desligados), Midjourney em automação (sem API oficial) nem Suno grátis ou em campanha paga (sem direitos comerciais e litígio aberto). Não assine Runway anual sem testar com seus prompts: o '4K ilimitado' é upscale só no app, o MCP só usa crédito, o Kling 4.0 e o Wan 3.0 não estão confirmados no MCP, e o preço fica acima do teto.
- Não use ZapSign Profissional para automatizar contrato (sem API). Não use Figma como peça central com plano grátis: o MCP rende 20 chamadas por mês em assento View/Collab. Não pague API fiscal (Focus NFe, R$ 94,90) para emitir poucas notas. Não troque o motor da agência por Cursor ou Gemini CLI.
- Não confie em ranking de blog ou nota de vendor como prova: G2 e Capterra bloquearam a leitura direta; a nota G2 do PostHog vem de coleta incentivada com cartão-presente; Metricool tem Trustpilot 3,9 com queixas de cobrança e de conta desconectada. Teste a conta do estúdio antes de colocar agenda de cliente.
- Não coloque segredos no repositório nem chaves no prompt (regra da casa). Autorize os MCPs só no seu Claude Code e revogue em Settings. Mantenha 'ask' em ações que mexem em DNS, orçamento ou envio. Não adote ferramenta nova no domingo, exceto a que destrava o Pix.

## Stack em uma tabela

| função | ferramenta | por quê | R$/mês | integra com Claude Code |
|---|---|---|---|---|
| Motor central da agência (15 agentes) e orquestração por MCP | Claude Code, assinatura Claude Pro (Max só em semana de pico) | Lidera o Terminal-Bench 4.0 em todas as fontes (64,8% com Opus 5.5; 61,8% com Sonnet 5.5), já é o motor da casa, e a assinatura fixa sai mais barata que API (média de US$ 13 por dia ativo). | cerca de R$ 114 (US$ 20 mais IOF 3,5%; TechTudo cita R$ 110); só cartão de crédito ou débito, sem Pix. Max (US$ 100, cerca de R$ 550) estoura o teto. | Nativo. É o próprio cliente MCP. |
| Agendamento e análise de redes (Instagram, TikTok, YouTube, LinkedIn) | Metricool (Free hoje para a marca do estúdio; Starter mensal ao fechar o 1º cliente) | Cobra por marca (5 marcas por US$ 25 mensais) e tem MCP oficial em qualquer plano para agendar, editar, mandar para revisão e ler métricas, inclusive de anúncios em modo leitura. | Free R$ 0 (1 marca fixa, 20 posts publicados por mês contados por rede, sem LinkedIn). Starter mensal US$ 25, cerca de R$ 142 com IOF. Não assine o anual (cerca de US$ 240 à vista) antes de 1 a 2 meses de teste. Só cartão ou PayPal, em USD ou EUR, sem Pix e sem cartão virtual. | Sim. claude mcp add --transport http metricool https://ai.metricool.com/mcp, depois /mcp. O MCP não responde comentário nem cria anúncio. |
| Edição de Reels e Shorts | CapCut (uso manual) | Cortes rápidos e legenda automática de graça; não tem API nem MCP oficial, então não se automatiza (os projetos da comunidade arriscam violar os termos). | R$ 0 (Pro US$ 19,99 só se precisar) | Não. Claude escreve roteiro e legenda; a edição é sua. |
| Artes, carrosséis e peças de marca | Canva (já pago pelo estúdio) | Já está na casa, tem AI Connector oficial (MCP) e gera 3 a 5 variações de anúncio por oferta. | já pago; preço em reais não confirmado (a página brasileira mostra US$ 144/ano no Pro). O preenchimento automático de Brand Templates exige plano pago, e não funciona no Pro Lite nem no Grátis. | Sim, via Canva AI Connector (plano exigido não confirmado). |
| Imagem por IA em lote | Nano Banana 2.1 pela API Gemini (pagamento por uso) | 6º lugar no voto cego de imagem da Artificial Analysis a US$ 0,034 por imagem de 1K, contra cerca de US$ 211 por mil dos modelos à frente. | cerca de R$ 20 para 100 imagens (conta própria: US$ 0,0336 por imagem a R$ 5,69 com IOF). Sem camada gratuita na API; exige cartão. | Sim, por script/API (chave em variável de ambiente, nunca no repositório). |
| Voz e locução em pt-BR | Gemini 3.8 Flash TTS (ElevenLabs só quando a emoção da voz vender) | 6º no ranking de voz a cerca de US$ 16,49 por milhão de caracteres, contra cerca de US$ 80 do ElevenLabs Eleven v4, que lidera o ranking (Elo 1338). | centavos por uso; ElevenLabs Starter US$ 6/mês (cerca de R$ 34) se precisar de licença comercial e clone | Gemini por API/script. ElevenLabs tem MCP hospedado com OAuth, mas dublagem e clone exigem chave de API com limite de gasto. |
| Anúncios pagos | Meta Ads (Gerenciador de Anúncios, objetivo Mensagens/WhatsApp) com MCP oficial, em leitura primeiro e campanhas sempre pausadas | Menor CPL em serviço local no Brasil (faixas da Intent: clínica estética R$ 18-45 no Meta contra R$ 40-90 no Google), MCP oficial grátis; Google Ads MCP é só leitura e TikTok exige US$ 20/dia por grupo. | ferramenta R$ 0. Mídia por conta do cliente: mínimo realista R$ 900-1.800/mês; mediana de contas locais da 2B Growth em out/2026 foi R$ 31/dia no Meta. No Pix pré-pago só 87,85% do depósito vira mídia; no cartão, R$ 100 viram R$ 113,83. | Sim, mas em beta aberto e liberado por conta. claude mcp add --transport http meta_ads https://mcp.facebook.com/ads --scope user, depois /mcp. Pode retornar is_ads_mcp_enabled: false. Criação de anúncio pelo MCP é limitada (só criativo de imagem única; sem upload de mídia nem Instant Form). |
| Rastreamento de anúncios e vendas | Pixel da Meta + Conversions API de 1 clique + UTM padronizado | Grátis; a Meta declara 17,8% menos custo por resultado com CAPI (alegação da própria Meta, sem auditoria independente). | R$ 0 (Stape a US$ 8-10 por Pixel só se o CAPI de 1 clique não cobrir o caso) | Parcial: Claude gera os links com UTM e lê os relatórios pelo Metricool e pelo MCP da Meta. |
| Hospedagem de sites e landing pages | Cloudflare Workers com Static Assets (Pages só como reserva) | Arquivos estáticos grátis e ilimitados, sem trava de uso comercial e sem pausar tudo por crédito (o Netlify Free pausa todos os projetos ao estourar 300 créditos). | R$ 0. Limites do Free: 20.000 arquivos por versão, 25 MiB por arquivo e 100 mil requisições/dia de script para a conta inteira (429 ao estourar). | Sim. wrangler deploy com assets.directory (a doc oficial manda não usar wrangler pages deploy em projeto novo) e MCP oficial https://mcp.cloudflare.com/mcp (comando de instalação não testado; mantenha execute em modo 'ask', pois mexe em DNS). |
| Domínio .com.br | Registro.br | Valor oficial publicado de R$ 40/ano, aceita CPF ou CNPJ como titular (fonte secundária), e o DNS fica na Cloudflare trocando só os nameservers. | R$ 40/ano (cerca de R$ 3,33/mês por domínio; conferir no checkout; revendas anunciam R$ 29,90-34,90 promocional). Cuidado com DNSSEC: remova o DS antes de trocar os nameservers. | Não. Compra manual; DNS via MCP da Cloudflare. |
| Apps web para clientes | Lovable Pro com Supabase (Free no teste; Pro no 1º cliente em produção). Base44 só para o que já está lá. | MCP oficial que funciona até no Free, G2 4,6 com 459 avaliações (via G2 Learn) e o Pro cabe no teto, enquanto o Base44 exige o plano Builder (acima de R$ 150) para ter MCP. | Lovable Pro US$ 25 mensais, cerca de R$ 142 com IOF (cálculo meu); margem de R$ 8 sob o teto e uma recarga estoura. Supabase Pro US$ 25 (cerca de R$ 142) no primeiro cliente real, o que passa de R$ 150 no conjunto. Free do Supabase pausa após 1 semana de inatividade. Não entra no custo de hoje. | Sim. claude mcp add --transport http lovable https://mcp.lovable.dev e https://mcp.supabase.com/mcp (read_only=true em produção). Toda migration precisa de GRANT e RLS explícitos (mudança do Supabase em 30/10/2026). Muralha testa como visitante anônimo antes de publicar. |
| Cobrança de serviços e mensalidades dos clientes locais | Asaas (abrir já como MEI/PJ) | Tarifa fixa por Pix, sem mensalidade, com assinatura, link de pagamento e API: ganha do Mercado Pago (0,99%) só acima de cerca de R$ 217 por cobrança. | sem mensalidade. Pix recebido: R$ 2,15 (promoção de R$ 1,08 por 3 meses), não os R$ 1,59 do relatório original; confira em Menu do usuário > Taxas. Cartão à vista R$ 0,49 + 2,99%. Pix Automático só para PJ/MEI. | MCP oficial de documentação (https://docs.asaas.com/mcp); não cria cobrança sozinho. Use chave de Sandbox para teste e guarde a chave em variável de ambiente. |
| Checkout dos produtos digitais (pacote de agentes, kit 3D, template de barbearia) | Cakto | Pix a 0% + R$ 2,49 com liberação em D+1 (R$ 194,51 líquidos numa venda de R$ 197) e MCP que cria produto, checkout e cupom por conversa. | sem mensalidade. Cartão 4,99% + R$ 2,49. Há reserva de segurança; leia a política de pagamentos antes de depender do caixa. Reclame Aqui 8,0/10 (83,6% resolvidas; maior queixa: estorno). | Sim. claude mcp add --transport http cakto https://mcp.cakto.com.br (escrita pede confirm: true). |
| Plano B de cobrança imediata hoje | Mercado Pago (link de pagamento por WhatsApp) | Cobra em minutos sem o comprador ter conta, com Pix a 0,99% e MCP oficial; mais barato que o Asaas em cobrança abaixo de cerca de R$ 217. | sem mensalidade; Pix 0,99%; crédito à vista 3,99% a 4,98% conforme o prazo | Sim, MCP oficial https://mcp.mercadopago.com/mcp (criar cobrança direto pelo MCP não foi confirmado). |
| Atendimento por WhatsApp | Hoje: app WhatsApp Business (mensagens rápidas e catálogo). Depois: Cloud API oficial da Meta. Nunca API não oficial (Baileys, Z-API, Evolution em QR Code) no número de cliente. | É o único caminho sem risco de banimento; 1.000 mensagens de serviço grátis por número/mês e janela de entrada grátis de até 7 dias para conversa vinda de anúncio. | app R$ 0. Cloud API sem mensalidade: marketing R$ 0,3217 por mensagem entregue; utilidade, autenticação e serviço R$ 0,0350 (serviço cobrado desde 01/10/2026 após as 1.000 grátis). Impostos por cima (estimativa de terceiro). Cadastre forma de pagamento, senão a entrega para depois da franquia. | Indireto, via n8n. Não existe MCP oficial da Meta para WhatsApp. |
| Automação entre WhatsApp, agenda, CRM, pagamento e planilha | n8n Cloud Starter (fase 4) | Cobra por execução e não por passo, tem nós oficiais de WhatsApp, de agente de IA e de MCP, e a licença permite rodar fluxos para clientes na sua instância sem dar acesso a eles. | 20 EUR/mês (2,5 mil execuções); em reais cerca de R$ 130-140, estimativa não verificada (câmbio do euro não consultado). Community Edition grátis, mas o custo de VPS não foi verificado, e teste a entrega de webhook (a Meta limitou o tráfego para a Hostinger em fev/2026). | Sim, por webhook e MCP. O WhatsApp Trigger aceita um webhook por app Meta: use um app por cliente. |
| CRM do funil do próprio estúdio | HubSpot CRM Free | Grátis para 2 usuários, com MCP remoto oficial (OAuth 2.1, disponibilidade geral desde 13/04/2026) e conector oficial para Claude. | R$ 0 (Starter US$ 7 por usuário). WhatsApp nativo no grátis não verificado: ligar por n8n. | Sim, MCP remoto oficial. |
| Agendamento de reuniões e horários | Cal.com Free | Links e calendários ilimitados no grátis e MCP oficial em mcp.cal.com (OAuth); o Calendly Free limita a 1 tipo de evento. | R$ 0. Pix no agendamento não verificado (Cal.com lista Stripe e PayPal). | Sim, MCP oficial e API v2. |
| Contratos e assinatura eletrônica | Clicksign Start | R$ 39/mês em reais, 20 documentos, com API listada no Start; o ZapSign Profissional (R$ 39,90) NÃO libera API, que só vem no Equipe (R$ 69,90). | R$ 39 (excedente R$ 3,00 por documento). Se o MCP vale no Start não foi verificado: a ajuda diz só 'planos com acesso à API'. | MCP oficial da Clicksign (OAuth 2.0, exige admin e plano com API). |
| Nota fiscal de serviço | Emissor Nacional da NFS-e (gov.br/nfse) | Grátis e obrigatório para ME e EPP do Simples desde 01/11/2026; MEI prestador a empresa desde 09/2023 (fonte secundária). | R$ 0 (Focus NFe R$ 94,90 só quando a emissão manual virar gargalo, e exige certificado A1) | Não há MCP oficial para nota fiscal. Emissão manual, por site ou app, com login gov.br prata ou ouro. |
| E-mail marketing e newsletter | MailerLite Free (decisão do diretor; a Brevo era a nº 1 antes do incidente de set/2026) | MCP remoto com OAuth (sem chave em arquivo), landing page e produto digital no plano grátis e sem incidente de segurança comparável encontrado em 2026 (ausência de resultado, não garantia), enquanto a Brevo teve 138 contas invadidas e scripts injetados em 14/09/2026. | R$ 0 até 250 assinantes e 2.500 e-mails/mês; Comfort a partir de US$ 12 (cerca de R$ 68). Envio por API/MCP só em plano pago, então o Claude faz rascunho e você envia. Preço em reais e Pix não verificados. | Sim. MCP oficial com OAuth em developers.mailerlite.com/mcp. |
| E-mail transacional dos apps e sites dos clientes | Resend (Free) | MCP remoto oficial com OAuth para envio, templates e logs; 3.000 e-mails/mês e 100/dia no grátis. | R$ 0 (Pro US$ 20). Exige domínio verificado (SPF/DKIM). | Sim, https://mcp.resend.com/mcp. |
| SEO | Google Search Console (Ahrefs Free como auditor) | Única fonte de dados reais do próprio site, com API gratuita; o Ahrefs Free audita sites verificados. | R$ 0 | Sem MCP oficial do Google; só servidores da comunidade (revise o código, somente leitura). O MCP da Ahrefs não foi testado (falha de conexão do ambiente). |
| Analytics e UTM dos sites do estúdio | PostHog Cloud Free com cookieless_mode always, só nos sites do próprio estúdio | 1 milhão de eventos grátis, UTM, funis e MCP oficial; sem replay nem A/B de visitante recorrente nesse modo, e o grátis tem 1 projeto só. | R$ 0 dentro da franquia (excedente é descartado no plano sem cartão). Em sites de clientes é pay-as-you-go com cartão; para eles use Umami self-hosted. Sem cláusulas da ANPD no DPA: transferência internacional não coberta. | Sim. https://mcp.posthog.com/mcp, comece com readonly=true. Evento de 'Pix confirmado' via webhook do gateway não foi testado: sem ele o PostHog mede visita, não venda. |
| Heatmap e gravação de sessão | Microsoft Clarity | Grátis sem limite de tráfego e com MCP oficial, mas só 10 requisições por dia por projeto e 30 dias de gravação. | R$ 0. Não é cookieless e a base legal LGPD precisa de decisão com advogado antes de instalar em site de cliente. | Sim, @microsoft/clarity-mcp-server (leitura diária pela manhã). |
| 3D para o kit 3D (só no mês de produção) | Meshy Pro com MCP para Blender | Pro com API, MCP/Skill e licença privada por US$ 20; o grátis exige atribuição (CC BY 4.0). Qualidade comparada ao Tripo não tem benchmark independente. | cerca de R$ 114 (US$ 20 mais IOF), só enquanto produzir; cancele depois. O MCP oficial do Blender executa código gerado pela IA sem proteção: use máquina sem dados sensíveis. | Sim (MCP da comunidade para Blender; tutorial do Meshy). |