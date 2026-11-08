# Kit de anúncios · Porta Aberta · Fase 1

Verbo (T3), 08/11/2026. Para o Marcos subir sem pensar: copie, cole, publique.

## Conferência das políticas da Meta

**Lidas em 08/11/2026**, pela ferramenta de leitura de página (TinyFish) porque a busca direta ao domínio da Meta estava bloqueada nesta sessão. Páginas lidas:

| página | URL | data na página |
|---|---|---|
| Padrões de Publicidade (introdução e lista de todas as políticas) | https://transparency.meta.com/policies/ad-standards/ | sem data na página; lida em 08/11/2026 |
| Práticas Comerciais Proibidas (Padrões da Comunidade) | https://transparency.meta.com/policies/community-standards/prohibited-commercial-practices/ | registro de alteração de 29/10/2026 |
| Saúde e bem-estar | https://transparency.meta.com/policies/ad-standards/restricted-goods-services/health-wellness | registro de alteração de 22/07/2026 |
| Política de Mensagens do WhatsApp Business | https://whatsappbusiness.com/policy/ (redirecionada de business.whatsapp.com/policy) | "Last updated: September 23, 2026" |

**Não verificado**: as páginas próprias de "Personal Attributes" e "Misleading claims" deram 404 nas URLs antigas. Usei o texto dessas políticas que está dentro da página de introdução dos Padrões de Publicidade, que é a fonte oficial atual. Repetir a leitura antes de cada nova campanha.

### Regras que mais pesam neste kit, com o texto da Meta

1. **Atributos pessoais** (dentro de "Privacy Violations and Personal Attributes"): o anúncio não pode afirmar ou insinuar "race, ethnicity, religion, beliefs, age, sexual orientation or practices, gender identity, disability, physical or mental health (including medical conditions), vulnerable financial status, voting status, membership in a trade union, criminal record, or name". Aplicação aqui: nenhum texto pergunta "você é...?", nenhum fala da situação financeira de quem vê, nenhum usa o nome de quem vê. Os textos falam do produto ("digite o nome do seu negócio"), não de quem lê.
2. **Práticas comerciais proibidas** (29/10/2026): a Meta age contra "misleading or unreasonable pricing", "deceptive subscription practices: enrolling customers in recurring payment plans or subscription services without clear disclosure of terms", "non-delivery", "violation of return or refund policies" e "get rich quick". Aplicação aqui: nenhum texto promete ganho; a mensalidade aparece nos ângulos B e na página antes do pagamento (total visível em /abrir/); o arrependimento de 7 dias e o SAIR estão nos termos; o ângulo A diz "só paga se gostar" e a página mostra Abertura + mensalidade antes de qualquer pagamento.
3. **Relevância**: "The products and services promoted in an ad must match those promoted on the landing page." Aplicação aqui: todo link vai para a home com `?nicho=`, que abre o nicho do anúncio.
4. **Saúde e bem-estar** (22/07/2026): proíbe, em serviço de corpo ou estética, "statements of inferiority about physical appearance" e "promises of specific outcomes within a set timeframe". Academia ("fitness services, health clubs") e beleza não permanente ("makeup, hair products") ficam fora da restrição de idade. Aplicação aqui: nenhum texto de academia fala de corpo, peso ou prazo de resultado; nenhum texto de salão fala de aparência de quem vê; "pigmentação" (que a Meta trata como procedimento cosmético, 18+) não aparece em anúncio.
5. **Vídeo**: "Videos ... must not use overly disruptive tactics, such as flashing screens." Aplicação: os roteiros não usam tela piscando.
6. **Transparência (DSA)**: só vale para quem vê na União Europeia. Se a segmentação for só Brasil, não se aplica; ainda assim, preencha Beneficiário e Pagador com "Creat.MTT Studio" se o Gerenciador pedir.
7. **WhatsApp Business**: só falar com quem deu o número e pediu contato; respeitar pedido para parar; sem disparo em massa. Aplicação: Click-to-WhatsApp de janeiro só responde quem chamou; scripts em `whatsapp-scripts.md`.

### Regras da casa (briefing, regra dura 7)

Sem promessa de ganho · sem antes e depois · sem comparação nominal com concorrente · sem afirmar estado negativo de quem vê ("sua barbearia está fechada" é proibido) · sem nome de cliente real sem autorização escrita · sem emoji · sem "agenda", sempre "pedido de horário no seu WhatsApp" · números só por marcador.

### Resultado da conferência

Cada texto abaixo foi lido contra as 7 regras da Meta e as regras da casa. Todos: **ok**, com as observações de cada ângulo. Marcadores `{{...}}` não vão para o anúncio: o anúncio não cita preço nem prazo, de propósito (preço muda com a inauguração, e preço velho em anúncio contraria o CDC art. 37). Antes de subir, Lupa (T-QA) faz a segunda leitura, como pede o briefing.

---

## Como usar este arquivo

- Cada anúncio tem um código: ângulo + número do texto + nicho + versão, por exemplo `A1-barbearia-v1`. Esse código vai no `utm_content` (ver `utm.md`).
- Link do anúncio: `{{site.url}}/?nicho=<nicho>&utm_source=meta&utm_medium=pago&utm_campaign=cal-nov26&utm_content=<código>`. `{{site.url}}` é o endereço da home publicada (o Marcos troca uma vez).
- Botão do anúncio (CTA da Meta): **Saiba mais** na campanha de tráfego. No Click-to-WhatsApp: **Enviar mensagem**.
- Limites que a Meta recomenda: texto principal com a ideia nas primeiras 125 letras, título até 40, descrição até 30. Os textos daqui respeitam isso.

---

## Ângulo A · A Prévia

Base do briefing: "Digite o nome do seu negócio e veja o seu site pronto em segundos, com pedido de horário direto no seu WhatsApp. Sem cadastro. Você só paga se gostar." Título base: "Veja seu negócio aberto na internet".
Observação de política: "só paga se gostar" é verdadeiro porque ver a prévia é grátis e a página mostra Abertura e mensalidade antes de pagar. Não tire o "Sem cadastro" para encurtar: ele explica o grátis.

### A · barbearia (`?nicho=barbearia`)

Textos principais
- **A1**: Digite o nome da barbearia e veja o seu site pronto em segundos, com pedido de horário direto no seu WhatsApp. Sem cadastro. Você só paga se gostar.
- **A2**: Escreva o nome da barbearia, vire a placa para ABERTO e veja o site com a tabela de serviços e o pedido de horário no WhatsApp. Ver é grátis e sem cadastro.
- **A3**: O cliente escolhe o corte, o dia e o horário no site, e o pedido chega no seu WhatsApp. Veja o da sua barbearia pronto agora. Sem cadastro, só paga se gostar.

Títulos
- Veja seu negócio aberto na internet
- Vire a placa da barbearia para ABERTO
- O site da barbearia, pronto para ver

Descrições
- Grátis para ver. Sem cadastro.
- Pedido de horário no WhatsApp

### A · salão e estética (`?nicho=salao`)

Textos principais
- **A1**: Digite o nome do salão e veja o seu site pronto em segundos, com pedido de horário direto no seu WhatsApp. Sem cadastro. Você só paga se gostar.
- **A2**: Escreva o nome do salão, vire a placa para ABERTO e veja o site com os serviços e o pedido de horário no WhatsApp. Ver é grátis e sem cadastro.
- **A3**: A cliente escolhe escova, manicure ou coloração, o dia e o horário no site, e o pedido chega no seu WhatsApp. Veja o do seu salão pronto agora. Sem cadastro.

Títulos
- Veja seu negócio aberto na internet
- Vire a placa do salão para ABERTO
- O site do salão, pronto para ver

Descrições
- Grátis para ver. Sem cadastro.
- Pedido de horário no WhatsApp

### A · academia e studio (`?nicho=academia`)

Textos principais
- **A1**: Digite o nome da academia ou do studio e veja o seu site pronto em segundos, com pedido de aula experimental direto no seu WhatsApp. Sem cadastro. Você só paga se gostar.
- **A2**: Escreva o nome do studio, vire a placa para ABERTO e veja o site com as modalidades e o pedido de aula experimental no WhatsApp. Ver é grátis e sem cadastro.
- **A3**: Quem quer começar escolhe a modalidade, o dia e o horário no site, e o pedido de aula experimental chega no seu WhatsApp. Veja o seu pronto agora. Sem cadastro.

Títulos
- Veja seu negócio aberto na internet
- Vire a placa da academia para ABERTO
- Aula experimental pedida pelo site

Descrições
- Grátis para ver. Sem cadastro.
- Pedido de aula no WhatsApp

Observação de política (academia): nenhum texto fala de corpo, peso ou resultado. Não acrescente.

---

## Ângulo B · Sem amarra

Base do briefing: "Site, pedido de horário no WhatsApp e posts todo mês por um preço fechado. Sem fidelidade e sem multa. Se sair, você leva tudo." Título base: "Seu site pronto. Sem amarra."
Observação de política: "posts todo mês" é do plano Vitrine; o texto diz "no plano Vitrine" quando cita posts, para não ser lido como incluído em todos os planos (prática de assinatura enganosa). "Preço fechado" é verdadeiro: o preço fica travado por 12 meses (termos, cláusula 4).

### B · barbearia

Textos principais
- **B1**: Site da barbearia, pedido de horário no WhatsApp e, no plano Vitrine, posts todo mês, por um preço fechado. Sem fidelidade e sem multa. Se sair, você leva tudo.
- **B2**: Sem fidelidade, sem multa e com o domínio no seu nome. Se um dia quiser sair, você leva o site, o domínio e os arquivos. Veja o site da sua barbearia pronto antes de decidir.
- **B3**: A mensalidade só começa no dia em que o site da barbearia entra no ar. Antes disso, você vê pronto, testa o pedido no seu WhatsApp e aprova.

Títulos
- Seu site pronto. Sem amarra.
- Sem fidelidade. Se sair, leva tudo.
- O domínio fica no seu nome

Descrições
- Sem fidelidade e sem multa
- Mensalidade só com site no ar

### B · salão e estética

Textos principais
- **B1**: Site do salão, pedido de horário no WhatsApp e, no plano Vitrine, posts todo mês, por um preço fechado. Sem fidelidade e sem multa. Se sair, você leva tudo.
- **B2**: Sem fidelidade, sem multa e com o domínio no seu nome. Se um dia quiser sair, você leva o site, o domínio e os arquivos. Veja o site do seu salão pronto antes de decidir.
- **B3**: A mensalidade só começa no dia em que o site do salão entra no ar. Antes disso, você vê pronto, testa o pedido no seu WhatsApp e aprova.

Títulos
- Seu site pronto. Sem amarra.
- Sem fidelidade. Se sair, leva tudo.
- O domínio fica no seu nome

Descrições
- Sem fidelidade e sem multa
- Mensalidade só com site no ar

### B · academia e studio

Textos principais
- **B1**: Site da academia, pedido de aula experimental no WhatsApp e, no plano Vitrine, posts todo mês, por um preço fechado. Sem fidelidade e sem multa. Se sair, você leva tudo.
- **B2**: Sem fidelidade, sem multa e com o domínio no seu nome. Se um dia quiser sair, você leva o site, o domínio e os arquivos. Veja o site do seu studio pronto antes de decidir.
- **B3**: A mensalidade só começa no dia em que o site da academia entra no ar. Antes disso, você vê pronto, testa o pedido de aula no seu WhatsApp e aprova.

Títulos
- Seu site pronto. Sem amarra.
- Sem fidelidade. Se sair, leva tudo.
- O domínio fica no seu nome

Descrições
- Sem fidelidade e sem multa
- Mensalidade só com site no ar

---

## Ângulo C · A equipe

Base do briefing: "É esta equipe que monta o seu site, e você pode assistir. Digite o nome do seu negócio e veja a placa virar para ABERTO."
Observação de política e de honestidade: o criativo mostra a sede. Se a gravação for do modo demonstração, a legenda "Demonstração" da própria sede precisa aparecer no vídeo (ver `roteiros-video.md`, R3). Só rodar este ângulo depois que a sede publicada (`?modo=publico`) estiver no ar, porque o texto promete "você pode assistir".

### C · barbearia

Textos principais
- **C1**: É esta equipe que monta o site da sua barbearia, e você pode assistir. Digite o nome da barbearia e veja a placa virar para ABERTO.
- **C2**: Uma equipe de agentes de IA monta o site, uma pessoa confere e você acompanha tudo na sede, com o nome da sua barbearia na fachada. Comece digitando o nome.
- **C3**: Cada personagem da sede é uma etapa: um escreve os textos, outro escolhe as cores, outro testa no celular. Veja o site da sua barbearia pronto e acompanhe a montagem.

Títulos
- Assista ao seu site sendo montado
- O nome da barbearia na fachada
- IA monta, uma pessoa confere

Descrições
- Você acompanha na sede
- Grátis para ver a prévia

### C · salão e estética

Textos principais
- **C1**: É esta equipe que monta o site do seu salão, e você pode assistir. Digite o nome do salão e veja a placa virar para ABERTO.
- **C2**: Uma equipe de agentes de IA monta o site, uma pessoa confere e você acompanha tudo na sede, com o nome do seu salão na fachada. Comece digitando o nome.
- **C3**: Cada personagem da sede é uma etapa: um escreve os textos, outro escolhe as cores, outro testa no celular. Veja o site do seu salão pronto e acompanhe a montagem.

Títulos
- Assista ao seu site sendo montado
- O nome do salão na fachada
- IA monta, uma pessoa confere

Descrições
- Você acompanha na sede
- Grátis para ver a prévia

### C · academia e studio

Textos principais
- **C1**: É esta equipe que monta o site da sua academia, e você pode assistir. Digite o nome da academia ou do studio e veja a placa virar para ABERTO.
- **C2**: Uma equipe de agentes de IA monta o site, uma pessoa confere e você acompanha tudo na sede, com o nome do seu studio na fachada. Comece digitando o nome.
- **C3**: Cada personagem da sede é uma etapa: um escreve os textos, outro escolhe as cores, outro testa no celular. Veja o site da sua academia pronto e acompanhe a montagem.

Títulos
- Assista ao seu site sendo montado
- O nome da academia na fachada
- IA monta, uma pessoa confere

Descrições
- Você acompanha na sede
- Grátis para ver a prévia

---

## Ângulo D · No ar antes do Natal · CONDICIONAL

Base do briefing: "Pedidos pagos até 15/12 entram no ar antes do Natal. Vagas limitadas por dia."

**Condição para rodar (as três ao mesmo tempo):**
1. `dados/vagas.json` com `atualizado_em` de até 48 h e `capacidade_dia` medida de verdade (não o valor inicial do arquivo).
2. A fila cabe: pedidos pagos e não entregues ÷ `capacidade_dia` deixa folga até 18/12 (15/12 + {{precos.prazoHoras}} h).
3. Data de hoje antes de 15/12. Em 15/12 às 23h59 o ângulo para, sem prorrogar.

Se qualquer condição falhar, **não suba**. "Vagas limitadas por dia" só é verdade com capacidade real; sem ela, é escassez inventada (CDC art. 37 e "misleading pricing" da Meta).
Observação: "entram no ar" vale para o site no endereço da Creat. Domínio próprio e Google ficam fora do prazo (termos, cláusula 5); não prometa domínio antes do Natal.

### D · barbearia

Textos principais
- **D1**: Pedidos pagos até 15/12 entram no ar antes do Natal. Vagas limitadas por dia. Digite o nome da barbearia e veja o site pronto agora.
- **D2**: Pedido pago até 15/12 coloca o site da barbearia no ar antes do Natal, com pedido de horário no seu WhatsApp. A equipe abre poucos negócios por dia.
- **D3**: A equipe monta poucos sites por dia. Quem paga até 15/12 entra no ar antes do Natal. Veja a prévia da sua barbearia grátis.

Títulos
- No ar antes do Natal
- Pedidos até 15/12
- Vagas de produção por dia

Descrições
- Pague até 15/12
- Veja a prévia grátis

### D · salão e estética

Textos principais
- **D1**: Pedidos pagos até 15/12 entram no ar antes do Natal. Vagas limitadas por dia. Digite o nome do salão e veja o site pronto agora.
- **D2**: Pedido pago até 15/12 coloca o site do salão no ar antes do Natal, com pedido de horário no seu WhatsApp. A equipe abre poucos negócios por dia.
- **D3**: A equipe monta poucos sites por dia. Quem paga até 15/12 entra no ar antes do Natal. Veja a prévia do seu salão grátis.

Títulos
- No ar antes do Natal
- Pedidos até 15/12
- Vagas de produção por dia

Descrições
- Pague até 15/12
- Veja a prévia grátis

### D · academia e studio

Textos principais
- **D1**: Pedidos pagos até 15/12 entram no ar antes do Natal. Vagas limitadas por dia. Digite o nome da academia e veja o site pronto agora.
- **D2**: Pedido pago até 15/12 coloca o site do studio no ar antes do Natal, com pedido de aula experimental no seu WhatsApp. A equipe abre poucos negócios por dia.
- **D3**: A equipe monta poucos sites por dia. Quem paga até 15/12 entra no ar antes do Natal. Veja a prévia da sua academia grátis.

Títulos
- No ar antes do Natal
- Pedidos até 15/12
- Vagas de produção por dia

Descrições
- Pague até 15/12
- Veja a prévia grátis


---

## Ângulo E · Teste · "O site grátis do Google acabou"

Base do briefing: "O site grátis do Perfil da Empresa no Google acabou (Search Engine Journal, 29/02/2024). Veja o seu pronto em segundos."

**Nota de evidência antiga**: o fato é de 2024. A fonte citada (Search Engine Journal, 29/02/2024) não foi reaberta hoje: o domínio não estava acessível nesta sessão. Antes de subir, o Marcos ou o Radar abre o artigo e confirma a data. Ângulo de **teste**: no máximo 1 criativo, só depois da calibragem.
Observação de política: citar o Google como fato noticiado não é comparação nem imitação de marca (a regra de "brand-bait" proíbe falar em nome de outra empresa; aqui a fonte é citada e o anúncio é claramente da Creat). Não use logo nem cores do Google no criativo.

### E · barbearia

Textos principais
- **E1**: O site grátis do Perfil da Empresa no Google acabou (Search Engine Journal, 29/02/2024). Veja o site da sua barbearia pronto em segundos, com pedido de horário no WhatsApp.
- **E2**: Desde 2024, o Perfil da Empresa no Google não cria mais site (Search Engine Journal, 29/02/2024). Digite o nome da barbearia e veja um site pronto para pôr no lugar.
- **E3**: O Perfil no Google continua, mas o site grátis dele acabou em 2024 (Search Engine Journal, 29/02/2024). Veja o site da sua barbearia pronto agora, sem cadastro.

Títulos
- O site grátis do Google acabou
- Um site para pôr no Perfil
- Veja o seu pronto em segundos

Descrições
- Fonte: Search Engine Journal
- Grátis para ver. Sem cadastro.

### E · salão e estética

Textos principais
- **E1**: O site grátis do Perfil da Empresa no Google acabou (Search Engine Journal, 29/02/2024). Veja o site do seu salão pronto em segundos, com pedido de horário no WhatsApp.
- **E2**: Desde 2024, o Perfil da Empresa no Google não cria mais site (Search Engine Journal, 29/02/2024). Digite o nome do salão e veja um site pronto para pôr no lugar.
- **E3**: O Perfil no Google continua, mas o site grátis dele acabou em 2024 (Search Engine Journal, 29/02/2024). Veja o site do seu salão pronto agora, sem cadastro.

Títulos
- O site grátis do Google acabou
- Um site para pôr no Perfil
- Veja o seu pronto em segundos

Descrições
- Fonte: Search Engine Journal
- Grátis para ver. Sem cadastro.

### E · academia e studio

Textos principais
- **E1**: O site grátis do Perfil da Empresa no Google acabou (Search Engine Journal, 29/02/2024). Veja o site da sua academia pronto em segundos, com pedido de aula experimental no WhatsApp.
- **E2**: Desde 2024, o Perfil da Empresa no Google não cria mais site (Search Engine Journal, 29/02/2024). Digite o nome do studio e veja um site pronto para pôr no lugar.
- **E3**: O Perfil no Google continua, mas o site grátis dele acabou em 2024 (Search Engine Journal, 29/02/2024). Veja o site da sua academia pronto agora, sem cadastro.

Títulos
- O site grátis do Google acabou
- Um site para pôr no Perfil
- Veja o seu pronto em segundos

Descrições
- Fonte: Search Engine Journal
- Grátis para ver. Sem cadastro.

---

## Calibragem · 16 a 22/11/2026

Estrutura (seção 12 do briefing):

| item | valor |
|---|---|
| Campanhas | 1 · objetivo **Tráfego**, destino site |
| Nome da campanha | `cal-nov26` |
| Conjuntos | 1 · amplo · barbearia + salão · Brasil · 18+ · posicionamentos automáticos |
| Nome do conjunto | `cal-nov26-amplo-barb-salao` |
| Orçamento | R$ 40 por dia, 7 dias (16 a 22/11). Sem editar nada no meio |
| Criativos | 3 (abaixo) |

Os 3 criativos:

| criativo | texto | título | descrição | vídeo | link (`utm_content`) |
|---|---|---|---|---|---|
| 1 | A1 barbearia | Veja seu negócio aberto na internet | Grátis para ver. Sem cadastro. | R1 placa (barbearia) | `?nicho=barbearia` · `A1-barbearia-v1` |
| 2 | B1 salão | Seu site pronto. Sem amarra. | Sem fidelidade e sem multa | R2 sem amarra (salão) | `?nicho=salao` · `B1-salao-v1` |
| 3 | C1 barbearia | Assista ao seu site sendo montado | Você acompanha na sede | R3 a equipe | `?nicho=barbearia` · `C1-barbearia-v1` |

Se a sede pública não estiver no ar em 16/11, troque o criativo 3 por A1 salão (`A1-salao-v1`) com o vídeo R1 gravado no nicho salão.

Antes de 16/11: subir os 3 criativos e esperar a aprovação da Meta (até 24 h) antes de ativar.

### Tabela de leitura (preencher em 23/11)

A seção 18 do briefing não traz metas numéricas para mídia. Por isso nenhuma meta abaixo foi inventada.

| métrica | de onde vem | meta | regra de parada |
|---|---|---|---|
| CTR do link | Gerenciador de Anúncios | meta a definir pelo Marcos | meta a definir pelo Marcos |
| CPC do link | Gerenciador de Anúncios | meta a definir pelo Marcos | meta a definir pelo Marcos |
| Visitas à home | PostHog (`placa_vista`) | meta a definir pelo Marcos | meta a definir pelo Marcos |
| Taxa de prévia (`previa_gerada` ÷ `placa_vista`) | PostHog | meta a definir pelo Marcos | meta a definir pelo Marcos |
| Custo por prévia | gasto ÷ `previa_gerada` | meta a definir pelo Marcos | meta a definir pelo Marcos |
| Testes no WhatsApp (`reserva_teste`) | PostHog | meta a definir pelo Marcos | meta a definir pelo Marcos |
| Checkouts (`checkout_iniciado`) | PostHog | meta a definir pelo Marcos | meta a definir pelo Marcos |
| Pedidos pagos | Asaas + PEDIDO v1 com `utm_campaign=cal-nov26` | meta a definir pelo Marcos | meta a definir pelo Marcos |

Regras de parada que já existem e não dependem de meta:
- Anúncio reprovado pela Meta: pausar só ele, corrigir o texto contra a conferência acima e reenviar.
- Fim dos 7 dias: a calibragem termina em 22/11, sem prorrogar. Black Friday (27/11) fica sem mídia nova, conforme a estratégia.
- Dado velho: se `vagas.json` ficar velho, a página esconde o contador sozinha; o anúncio não muda porque não cita vagas.

Referência para o Marcos decidir as metas (da `docs/ESTRATEGIA.md`, seção 4.3, não da seção 18 do briefing): o teto de CAC por Abertura é R$ 700, e a tabela "custo por prévia × taxa de prévia para pago" mostra que custo por prévia de R$ 10 a R$ 45 cabe nesse teto só com taxa de prévia para pago entre 2% e 6%. A própria estratégia diz que não há benchmark público dessa taxa.

---

## Janeiro · conjunto Click-to-WhatsApp

Para depois do gate de escala (revisão em 08/12). Não ativar em novembro nem dezembro.

| item | valor |
|---|---|
| Campanha | Engajamento ou Leads, destino **WhatsApp** (o número do Suporte Creat) |
| Nome | `ctwa-jan27` |
| Conjunto | barbearia + salão, amplo, Brasil, 18+ |
| Criativos | os 2 com melhor custo por prévia na calibragem, com o texto adaptado abaixo |
| Mensagem de boas-vindas no anúncio | "Olá! Quero ver o site do meu negócio pronto." |
| Pergunta frequente 1 | "Quero ver o meu site pronto" |
| Pergunta frequente 2 | "Quanto custa?" |
| Pergunta frequente 3 | "Como funciona?" |

Textos principais adaptados (o botão abre o WhatsApp, não a página):
- **W1-barbearia**: Chame no WhatsApp e receba o link para ver o site da sua barbearia pronto em segundos, com pedido de horário no seu WhatsApp. Sem cadastro.
- **W1-salao**: Chame no WhatsApp e receba o link para ver o site do seu salão pronto em segundos, com pedido de horário no seu WhatsApp. Sem cadastro.
- **W2-geral**: Tire as dúvidas no WhatsApp com a equipe da Creat: preço, prazo e o que você leva se sair. Sem fidelidade e sem multa.

Títulos: "Veja o seu site pronto" · "Pergunte no WhatsApp"
Descrições: "Resposta da equipe" · "Sem fidelidade"

Respostas: usar a saudação e as respostas rápidas R1, R2 e R14 de `whatsapp-scripts.md`. Etiquetar a conversa como "Lead · anúncio" (ver etiquetas). O link enviado no R1 leva `utm_source=meta&utm_medium=pago&utm_campaign=ctwa-jan27`.

---

## Itens proibidos neste kit (para quem for editar depois)

- Qualquer número de cliente, venda ou faturamento.
- "Garantido", "agendamento garantido", "agenda".
- Nome de marca concorrente.
- Foto de pessoa, depoimento, nota ou estrela.
- Pergunta sobre quem vê ("Você é dono de...?", "Cansado de...?").
- Antes e depois, de site ou de corpo.
- Preço ou prazo escrito no anúncio (preço muda com a inauguração; o anúncio fica velho e a página não).
- Nome de cliente real sem autorização escrita.
