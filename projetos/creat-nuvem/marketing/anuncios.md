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
2. **Práticas comerciais proibidas** (29/10/2026): a Meta age contra "misleading or unreasonable pricing", "deceptive subscription practices: enrolling customers in recurring payment plans or subscription services without clear disclosure of terms", "non-delivery", "violation of return or refund policies" e "get rich quick". Aplicação aqui: nenhum texto promete ganho; a mensalidade aparece nos ângulos B e na página antes do pagamento (total visível em /abrir/); o arrependimento de 7 dias e o SAIR estão nos termos. Desde 10/11/2026, todo anúncio declara a Abertura e o plano mensal no texto principal e na descrição (ver "Regra de preço no anúncio").
3. **Relevância**: "The products and services promoted in an ad must match those promoted on the landing page." Aplicação aqui: todo link vai para a home com `?nicho=`, que abre o nicho do anúncio.
4. **Saúde e bem-estar** (22/07/2026): proíbe, em serviço de corpo ou estética, "statements of inferiority about physical appearance" e "promises of specific outcomes within a set timeframe". Academia ("fitness services, health clubs") e beleza não permanente ("makeup, hair products") ficam fora da restrição de idade. Aplicação aqui: nenhum texto de academia fala de corpo, peso ou prazo de resultado; nenhum texto de salão fala de aparência de quem vê; "pigmentação" (que a Meta trata como procedimento cosmético, 18+) não aparece em anúncio nem na tabela de serviços que o vídeo R1 grava (saiu do preset da barbearia em 08/11/2026).
5. **Vídeo**: "Videos ... must not use overly disruptive tactics, such as flashing screens." Aplicação: os roteiros não usam tela piscando.
6. **Transparência (DSA)**: só vale para quem vê na União Europeia. Se a segmentação for só Brasil, não se aplica; ainda assim, preencha Beneficiário e Pagador com "Creat.MTT Studio" se o Gerenciador pedir.
7. **WhatsApp Business**: só falar com quem deu o número e pediu contato; respeitar pedido para parar; sem disparo em massa. Aplicação: Click-to-WhatsApp de janeiro só responde quem chamou; scripts em `whatsapp-scripts.md`.

### Regras da casa (briefing, regra dura 7)

Sem promessa de ganho · sem antes e depois · sem comparação nominal com concorrente · sem afirmar estado negativo de quem vê ("sua barbearia está fechada" é proibido) · sem nome de cliente real sem autorização escrita · sem emoji · sem "agenda", sempre "pedido de horário no seu WhatsApp" · preço só pela regra abaixo.

### Regra de preço no anúncio (revista em 10/11/2026)

**Antes:** "sem preço ou prazo no anúncio". Era escolha da casa, para o anúncio não ficar velho quando o preço mudasse. Não era regra da Meta.

**Agora:** **Abertura e plano mensal declarados no texto principal e na descrição, nunca no título.** Nos anúncios de site, os dois valores terminam antes do caractere 125 do texto principal, para aparecerem antes do "ver mais". Em vídeo, os dois valores vão também queimados na tela, porque o Reels não mostra a descrição.

Por quê:
- **Meta, M03 de `trafego/anuncios-meta.md`:** os Padrões proíbem "deceptive subscription practices: enrolling customers in recurring payment plans or subscription services without clear disclosure of terms" (Práticas Comerciais Proibidas, alteração de 29/10/2026). O Porta Aberta tem mensalidade; anúncio que a esconde arrisca reprovação e restrição da conta.
- **CDC, art. 31:** a oferta tem de trazer informação correta, clara e precisa sobre o preço.
- **CDC, art. 37, § 3º:** publicidade é enganosa por omissão quando deixa de informar dado essencial. Para quem paga todo mês, a mensalidade é dado essencial.
- **Decreto 7.962/2013, art. 2º:** na contratação pela internet, as condições integrais da oferta e qualquer despesa adicional ficam claras para quem compra.
- **Auditoria de 10/11/2026 (AN-02):** os A1 no ar diziam que a pessoa só pagava se gostasse e não citavam mensalidade. A página dizia o contrário. Quem descobre a mensalidade só no site se sente enganado.

O que continua proibido:
- preço ou número no **título**;
- **prazo** ("72 h", "em 3 dias") em qualquer parte do anúncio, até o ensaio de entrega da onda 1 ficar verde;
- **"inauguração"**, **"vagas"** ou qualquer escassez, até a trava das 20 vagas estar provada (`trafego/textos-troca-unica.md`, seção 1);
- valor velho: quando o preço de `dados/precos.json` muda, os anúncios com o valor antigo pausam no mesmo ato e sobem com o novo.

**Bloco de preço** (frase padrão, igual em todo anúncio de site):
- no texto: "Abertura R$ {{precos.abertura.inauguracao.preco}}, paga uma vez; plano a partir de R$ {{precos.planos.aberto}} por mês, só com o site no ar."
- na descrição: "Abertura R$ {{precos.abertura.inauguracao.preco}} + plano a partir de R$ {{precos.planos.aberto}} por mês, só com o site no ar."
- Hoje: R$ 297 e R$ 147. Quando a inauguração acabar, o primeiro valor passa a ser `abertura.padrao`.

Os textos finais dos 6 anúncios no ar, com a contagem e a validação tripla, estão em `trafego/textos-troca-unica.md`. Nos outros textos deste kit, o bloco de preço entra logo depois da primeira frase. Texto sem o bloco não sobe.

### Resultado da conferência

Cada texto abaixo foi lido contra as 7 regras da Meta e as regras da casa. Todos: **ok**, com as observações de cada ângulo. Marcadores `{{...}}` não vão para o anúncio: quem publica troca pelo valor de `dados/precos.json` do dia. O anúncio cita a Abertura e o plano mensal (regra de preço acima) e não cita prazo. A releitura de 10/11/2026 está no "Checklist de política", no fim deste arquivo. Antes de subir, Lupa (T-QA) faz a segunda leitura, como pede o briefing.

---

## Como usar este arquivo

- Cada anúncio tem um código: ângulo + número do texto + nicho + versão, por exemplo `A1-barbearia-v1`. Esse código vai no `utm_content` (ver `utm.md`).
- Link do anúncio: `{{site.url}}/?nicho=<nicho>&utm_source=meta&utm_medium=pago&utm_campaign=cal-nov26&utm_content=<código>`. `{{site.url}}` é o endereço da home publicada (o Marcos troca uma vez).
- Botão do anúncio (CTA da Meta): **Saiba mais** na campanha de tráfego. No Click-to-WhatsApp: **Enviar mensagem**.
- Limites que a Meta recomenda: texto principal com a ideia nas primeiras 125 letras, título até 40, descrição até 30. Os textos daqui respeitam isso.

---

## Ângulo A · A Prévia

Base do briefing (revista em 10/11/2026): primeira frase de até 40 caracteres com o nicho e o WhatsApp, o bloco de preço e "Ver é grátis e sem cadastro. Sem fidelidade e com 7 dias para desistir." Título base: "Veja o site da sua barbearia pronto" (ou do salão, da academia).
Observação de política: a frase antiga dizia que a pessoa só pagava se gostasse. Era falsa, porque a Abertura é paga antes da produção, e foi aposentada (AN-02). O que é grátis de verdade é ver. Não tire o "sem cadastro" para encurtar: ele explica o grátis.

### A · barbearia (`?nicho=barbearia`)

Textos principais
- **A1**: Barbearia: site com pedido no WhatsApp. Abertura R$ 297, paga uma vez; plano a partir de R$ 147 por mês, só com o site no ar. Ver é grátis e sem cadastro. Sem fidelidade e com 7 dias para desistir.
- **A2**: Escreva o nome da barbearia, vire a placa para ABERTO e veja o site com a tabela de serviços e o pedido de horário no WhatsApp. Ver é grátis e sem cadastro.
- **A3**: O cliente escolhe o corte, o dia e o horário no site, e o pedido chega no seu WhatsApp. Veja o da sua barbearia pronto agora. Ver é grátis e sem cadastro.

Títulos
- Veja o site da sua barbearia pronto (35, o que está no ar a partir da troca única)
- O site da barbearia, pronto para ver
- Veja seu negócio aberto na internet (reserva: não diz "site")
- Vire a placa da barbearia para ABERTO (reserva: só repete a arte)

Descrições
- Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar. (a que vai com o A1)
- Grátis para ver. Sem cadastro. (só junto de texto que já traz o bloco de preço)

### A · salão e estética (`?nicho=salao`)

Textos principais
- **A1**: Salão: site com pedido no WhatsApp. Abertura R$ 297, paga uma vez; plano a partir de R$ 147 por mês, só com o site no ar. Ver é grátis e sem cadastro. Sem fidelidade e com 7 dias para desistir.
- **A2**: Escreva o nome do salão, vire a placa para ABERTO e veja o site com os serviços e o pedido de horário no WhatsApp. Ver é grátis e sem cadastro.
- **A3**: A cliente escolhe escova, manicure ou coloração, o dia e o horário no site, e o pedido chega no seu WhatsApp. Veja o do seu salão pronto agora. Sem cadastro.

Títulos
- Veja o site do seu salão pronto (31, o que está no ar a partir da troca única)
- O site do salão, pronto para ver
- Veja seu negócio aberto na internet (reserva: não diz "site")
- Vire a placa do salão para ABERTO (aposentado: CTR de 2,36% contra 4,31% do B1 com a mesma arte, AN-03)

Descrições
- Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar. (a que vai com o A1)
- Grátis para ver. Sem cadastro. (só junto de texto que já traz o bloco de preço)

### A · academia e studio (`?nicho=academia`)

Textos principais
- **A1**: Academia: site com pedido no WhatsApp. Abertura R$ 297, paga uma vez; plano a partir de R$ 147 por mês, só com o site no ar. Ver é grátis e sem cadastro. Sem fidelidade e com 7 dias para desistir.
- **A2**: Escreva o nome do studio, vire a placa para ABERTO e veja o site com as modalidades e o pedido de aula experimental no WhatsApp. Ver é grátis e sem cadastro.
- **A3**: Quem quer começar escolhe a modalidade, o dia e o horário no site, e o pedido de aula experimental chega no seu WhatsApp. Veja o seu pronto agora. Sem cadastro.

Títulos
- Veja o site da sua academia pronto
- Aula experimental pedida pelo site
- Veja seu negócio aberto na internet (reserva: não diz "site")

Descrições
- Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar. (a que vai com o A1)
- Grátis para ver. Sem cadastro. (só junto de texto que já traz o bloco de preço)

Observação de política (academia): nenhum texto fala de corpo, peso ou resultado. Não acrescente.

---

## Ângulo B · Sem amarra

Base do briefing (revista em 10/11/2026, AN-07): o argumento "sem amarra" abre o texto, com "Sem fidelidade e sem multa. Site pronto." (40). Depois vêm o bloco de preço, o pedido de horário no WhatsApp e "Se sair, você leva o site e os arquivos." Título base: "Seu site pronto. Sem amarra."
Observação de política: nada de "leva tudo", que promete mais do que os termos. Nada de domínio no texto: a cláusula 9 dos termos está sendo reescrita, e só se promete o que já existe. Nada de posts: o primeiro ciclo do plano Vitrine ainda não rodou de verdade (`docs/EXECUTOR.md`). "Preço fechado" sem número saiu: no lugar entra o valor do plano.

### B · barbearia

Textos principais
- **B1**: Sem fidelidade e sem multa. Site pronto. Abertura R$ 297, paga uma vez; plano mensal a partir de R$ 147, só com o site no ar. O site da barbearia tem pedido de horário no WhatsApp. Se sair, você leva o site e os arquivos. Ver é grátis e sem cadastro.
- **B2**: Sem fidelidade e sem multa. Se um dia quiser sair, você leva o site e os arquivos. Veja o site da sua barbearia pronto antes de decidir.
- **B3**: A mensalidade só começa no dia em que o site da barbearia entra no ar. Antes disso, você vê pronto, testa o pedido no seu WhatsApp e aprova.

Títulos
- Seu site pronto. Sem amarra.
- Sem fidelidade. Se sair, leva o site
- Saiu? Leva o site e os arquivos

Descrições
- Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar. (a que vai com o B1)
- Sem fidelidade e sem multa (só junto de texto que já traz o bloco de preço)

### B · salão e estética

Textos principais
- **B1**: Sem fidelidade e sem multa. Site pronto. Abertura R$ 297, paga uma vez; plano mensal a partir de R$ 147, só com o site no ar. O site do salão tem pedido de horário no WhatsApp. Se sair, você leva o site e os arquivos. Ver é grátis e sem cadastro.
- **B2**: Sem fidelidade e sem multa. Se um dia quiser sair, você leva o site e os arquivos. Veja o site do seu salão pronto antes de decidir.
- **B3**: A mensalidade só começa no dia em que o site do salão entra no ar. Antes disso, você vê pronto, testa o pedido no seu WhatsApp e aprova.

Títulos
- Seu site pronto. Sem amarra.
- Sem fidelidade. Se sair, leva o site
- Saiu? Leva o site e os arquivos

Descrições
- Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar. (a que vai com o B1)
- Sem fidelidade e sem multa (só junto de texto que já traz o bloco de preço)

### B · academia e studio

Textos principais
- **B1**: Sem fidelidade e sem multa. Site pronto. Abertura R$ 297, paga uma vez; plano mensal a partir de R$ 147, só com o site no ar. O site da academia tem pedido de aula experimental no WhatsApp. Se sair, você leva o site e os arquivos. Ver é grátis e sem cadastro.
- **B2**: Sem fidelidade e sem multa. Se um dia quiser sair, você leva o site e os arquivos. Veja o site do seu studio pronto antes de decidir.
- **B3**: A mensalidade só começa no dia em que o site da academia entra no ar. Antes disso, você vê pronto, testa o pedido de aula no seu WhatsApp e aprova.

Títulos
- Seu site pronto. Sem amarra.
- Sem fidelidade. Se sair, leva o site
- Saiu? Leva o site e os arquivos

Descrições
- Abertura R$ 297 + plano a partir de R$ 147 por mês, só com o site no ar. (a que vai com o B1)
- Sem fidelidade e sem multa (só junto de texto que já traz o bloco de preço)

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
4. Ensaio de entrega da onda 1 verde (sem ele, nenhum prazo entra em anúncio) e o bloco de preço logo depois da primeira frase.

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
- Preço ou número no título.
- Prazo em qualquer parte do anúncio, até o ensaio de entrega da onda 1 ficar verde.
- "Inauguração", "vagas" ou escassez, até a trava das 20 vagas estar provada.
- Valor velho: preço que já não é o de `dados/precos.json` (pausar e trocar no mesmo ato).
- Texto de site sem o bloco de preço (Abertura e plano mensal).
- A promessa de pagar só depois de gostar (falsa: a Abertura é paga antes da produção).
- "Leva tudo", domínio e posts em anúncio, até os termos e o ciclo do Vitrine darem lastro.
- Nome de cliente real sem autorização escrita.

---

## Checklist de política · troca única de 10/11/2026

Revisão dos textos de `trafego/textos-troca-unica.md` (A1 barbearia, A1 salão e B1 salão nas praças Feira e Salvador RMS, e os dois vídeos do segundo ato), feita por Verbo em 10/11/2026 com a contagem em python do mesmo arquivo. A Lupa faz a segunda leitura antes de subir.

| item | regra | A1 barbearia | A1 salão | B1 salão | vídeos |
|---|---|---|---|---|---|
| 1 | Sem promessa de ganho, de cliente ou de agenda cheia | ok | ok | ok | ok |
| 2 | Sem pergunta a quem vê | ok | ok | ok | ok |
| 3 | Sem afirmar o estado, o negócio ou as finanças de quem vê | ok | ok | ok | ok |
| 4 | Sem nome de pessoa (de quem vê, de cliente ou do dono) | ok | ok | ok | ok |
| 5 | Abertura e plano mensal no texto e na descrição | ok | ok | ok | ok, e na faixa queimada |
| 6 | R$ 297 e R$ 147 antes do caractere 125 | ok (55 e 95) | ok (51 e 91) | ok (56 e 103) | ok |
| 7 | Nenhum preço ou número no título | ok | ok | ok | ok |
| 8 | Sem prazo | ok | ok | ok | ok |
| 9 | Sem "inauguração", "vagas" ou escassez (trava ainda não provada) | ok | ok | ok | ok |
| 10 | Sem "domínio", sem "leva tudo", sem posts | ok | ok | ok | ok |
| 11 | Cada promessa tem lastro na página e nos termos | ok: grátis para ver (home), 7 dias (cláusula 6), sem fidelidade (cláusula 7), mensalidade só com o site no ar (cláusula 4 e home) | igual | igual, mais "leva o site e os arquivos" (cláusula 9) | igual ao nicho |
| 12 | Título com até 40 caracteres e dizendo "site" | ok (35) | ok (31) | ok (28) | ok |
| 13 | Primeira frase com até 40 caracteres, fechada, com o WhatsApp | ok (39) | ok (35) | ok (40; o WhatsApp vem na terceira frase, porque o B1 abre pelo "sem amarra") | ok |
| 14 | Botão diz o que acontece | ok (Saiba mais) | ok | ok | ok |
| 15 | Sem emoji, sem travessão, pt-BR | ok | ok | ok | ok |
| 16 | Página de destino bate com o anúncio (home com `?nicho=`, mesmo preço) | ok: a home no ar em 10/11/2026 diz "Hoje você paga só a Abertura: R$ 297 uma vez" e mostra os planos de R$ 147 e R$ 297 | ok | ok | ok |

Pendências que não são de texto: a faixa de preço ainda não está queimada em `R7-barbearia-v1.mp4`, e o vídeo de salão não foi gravado. Nenhum dos dois sobe antes disso.

