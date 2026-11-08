# Scripts do WhatsApp Business · Suporte Creat

Verbo (T3), 08/11/2026. Seção 13 do briefing. Para configurar uma vez no app WhatsApp Business do número "Suporte Creat" (Ferramentas comerciais > Mensagem de saudação, Mensagem de ausência, Respostas rápidas, Etiquetas).

## Regras

- No máximo 4 linhas por mensagem. Tom direto, de pessoa para pessoa. Sem emoji.
- Só 1:1: responder quem chamou ou quem já é cliente. Nada de lista de transmissão para quem não pediu (Política de Mensagens do WhatsApp Business, atualizada em 23/09/2026: só contatar quem deu o número e pediu contato; respeitar pedido para parar).
- Nunca prometer o que o contrato não cobre (`conteudo/termos.md`). Nunca prometer clientes, pedidos ou faturamento.
- Nunca pedir senha, número de cartão ou foto de documento.
- Nunca citar marca concorrente, nem quando o cliente cita.
- **Marcadores**: `{{...}}` são valores de `dados/precos.json` e `dados/vagas.json`. Ao cadastrar a resposta rápida, troque pelo valor do dia (referência em 08/11/2026: prazo 72 h, Abertura 497, inauguração 297, Aberto 147, Vitrine 297, anual 12 por 10). **Quando o `precos.json` mudar, atualize R2, R3, R5 e a saudação no mesmo dia.** `{nome}`, `{plano}`, `{data}`, `{link}`, `{id}` são preenchidos na hora, à mão.
- `{{site.url}}` é o endereço da home publicada.

## Saudação automática

Para quem manda a primeira mensagem ou volta depois de 14 dias.

> Olá! Aqui é o Suporte Creat, do Porta Aberta.
> Veja o seu negócio aberto na internet em segundos: {{site.url}}/?utm_source=whatsapp&utm_medium=organico&utm_campaign=saudacao
> Se preferir, escreva a sua dúvida que a equipe responde por aqui.

## Mensagem de ausência

Fora do horário de atendimento (segunda a sábado, das 9h às 19h).

> Recebemos a sua mensagem. A equipe responde de segunda a sábado, das 9h às 19h.
> Enquanto isso, veja a prévia do seu site: {{site.url}}/?utm_source=whatsapp&utm_medium=organico&utm_campaign=ausencia
> Se você já pagou, o seu pedido está na fila e o prazo conta normalmente.

## Respostas rápidas

Atalho entre parênteses: é o que se digita depois da barra `/` no app.

**R1 · Quero ver** (`/ver`)
> Digite o nome do seu negócio aqui e veja o site pronto em segundos: {{site.url}}/?utm_source=whatsapp&utm_medium=organico&utm_campaign=r1
> Dá para testar o pedido de horário no seu próprio WhatsApp. Ver é grátis.

**R2 · Preços** (`/precos`)
> Abertura: R$ {{precos.abertura.atual}}, uma vez. Depois, o plano começa no dia em que o site entra no ar: Aberto R$ {{precos.planos.aberto}} por mês ou Vitrine R$ {{precos.planos.vitrine}} por mês (com posts para o Instagram).
> Sem fidelidade e sem multa. Anual: 12 meses pelo preço de {{precos.anualMesesPagos}}, no Pix.
> Não inclui anúncio pago, loja virtual nem a anuidade do domínio, que é paga no seu nome ao Registro.br.

Se a inauguração estiver valendo, troque a primeira linha por: "Abertura: R$ {{precos.abertura.inauguracao.preco}} nas {{precos.abertura.inauguracao.vagasTotal}} primeiras vagas (depois R$ {{precos.abertura.padrao}}), uma vez." Confira as vagas restantes no `precos.json` antes de mandar.

**R3 · Prazo e garantia** (`/prazo`)
> O site fica pronto para você aprovar em até {{precos.prazoHoras}} h, contadas do pagamento confirmado com os 4 dados: nome do negócio, WhatsApp que recebe os pedidos, endereço e horário.
> Se a gente passar do prazo, o 1º mês do plano é grátis.
> Domínio próprio e Google ficam fora do relógio, porque dependem de você e de terceiros.

**R4 · Preciso ter alguma coisa?** (`/precisa`)
> Só o WhatsApp Business no celular, que é grátis.
> Para o domínio .com.br, o seu CPF ou CNPJ, porque ele fica no seu nome. Instagram só no plano Vitrine.
> Logo e fotos, se tiver. Se não tiver, o site sai com a tipografia do modelo e você manda depois.

**R5 · Pós-pagamento** (`/recebi`)
> Recebi o seu pedido {id}, {nome}. Seu relógio de {{precos.prazoHoras}} h começa quando tiver os 4 dados: nome do negócio, WhatsApp que recebe os pedidos, endereço e horário.
> Vou conferir o pagamento e te aviso por aqui quando o relógio começar.
> Para acompanhar a equipe trabalhando: {link da sede}

**R6 · Pedido de materiais** (`/materiais`)
> Para deixar o site com a cara do seu negócio, mande por aqui, se tiver: o logo, até 6 fotos (fachada, espaço, trabalho pronto) e a lista de serviços com preço e duração.
> Fotos de pessoas só com a autorização delas. Se não tiver nada disso agora, tudo bem: o site sai no prazo e você manda depois.

**R7 · Prévia pronta** (`/pronta`)
> {nome}, o site da {negócio} está pronto para você conferir: {link}
> Para aprovar, responda APROVO. Se quiser mudar algo, escreva o que é, numa mensagem só.
> O site só entra no ar depois do seu APROVO.

**R8 · No ar** (`/noar`)
> O site está no ar: {link}. A mensalidade começa hoje.
> Próximos passos: 1. Registrar o domínio no seu nome em registro.br (te mando o passo a passo). 2. Pôr o link do site no seu Perfil da Empresa no Google. 3. Fixar o link no seu WhatsApp Business e no Instagram.
> A verificação do Perfil no Google é feita por você; eu acompanho cada passo por aqui.

**R9 · Lembrete D-3** (`/d3`)
> Olá, {nome}. Lembrete: a mensalidade do plano {plano} vence em 3 dias, em {data}.
> O link de pagamento é este: {link}. Se já pagou, pode ignorar.

**R10a · Atraso D+1** (`/d1`)
> Olá, {nome}. A mensalidade do plano {plano}, que venceu em {data}, ainda aparece em aberto: {link}.
> O site continua no ar normalmente. Se já pagou, me avise que eu confiro.

**R10b · Atraso D+7** (`/d7`)
> {nome}, a mensalidade de {data} segue em aberto. A partir de hoje, as alterações e os posts ficam pausados, e o site continua no ar.
> Pagando por este link, tudo volta ao normal: {link}. Se precisar combinar outra data, me chame por aqui.

**R11 · Cancelamento e SAIR** (`/sair`)
> Sem multa e sem fidelidade. O cancelamento vale para o próximo ciclo; o mês pago segue até o fim.
> Você recebe o SAIR: o site num arquivo que abre direto no computador, com o botão do seu WhatsApp, mais os seus textos, fotos e logo. O domínio já é seu.
> Confirma o cancelamento? Responda CANCELAR e eu mando o SAIR por aqui.

**R12 · Pedido de depoimento** (`/depoimento`)
> {nome}, posso te pedir uma ou duas frases sobre como foi abrir o site com a gente?
> Só publico se você escrever, nesta conversa: "Autorizo a Creat a publicar este texto com o meu nome e o nome do meu negócio." Você pode retirar a autorização quando quiser.

**R13 · Indicação** (`/indica`)
> Se conhece outro negócio que precisa de site, mande este link para ele: {{site.url}}/?utm_source=indicacao&utm_medium=ref&utm_campaign=indica-v1&utm_content={id}
> Quando ele pagar a Abertura, o seu próximo mês do plano é grátis.

**R14 · Objeções**

R14a "É caro" (`/caro`)
> Entendo. O que entra no preço: o site montado, o pedido de horário no seu WhatsApp, hospedagem e alterações todo mês, sem fidelidade.
> A mensalidade só começa com o site no ar e você tem 7 dias para se arrepender. Veja o site pronto antes de decidir: {{site.url}}/?utm_source=whatsapp&utm_medium=organico&utm_campaign=r14

R14b "Já uso outro aplicativo de horários" (`/jatenho`) · o cliente pode citar a marca; a resposta não cita.
> Pode continuar com ele. O botão do seu site pode abrir esse aplicativo em vez do WhatsApp; é só me mandar o link.
> O site entra como a porta de entrada do seu negócio na internet, com endereço, serviços e o caminho para o cliente pedir horário.

R14c "Não tenho Instagram" (`/semig`)
> Não precisa. O plano Aberto funciona só com o WhatsApp.
> O Instagram entra no Vitrine, que traz posts prontos todo mês. Se um dia quiser, você muda de plano.

R14d "E se eu quiser sair?" (`/sesair`)
> Você sai quando quiser, sem multa. Leva o site num arquivo que abre no computador, o domínio, que já é seu, e os seus arquivos.
> Está nos termos, na cláusula do SAIR: {{site.url}}/termos/

R14e "É robô?" (`/robo`)
> É uma equipe de agentes de IA, e eu sou uma pessoa da equipe. A IA monta os textos do seu site, regras automáticas conferem e uma pessoa lê tudo antes de você aprovar.
> Aqui no WhatsApp, quem responde é gente.

Atenção no R14e: "quem responde é gente" só pode ficar enquanto as respostas forem escritas por uma pessoa. Se um dia entrar resposta automática por IA neste número, troque a última linha por "Algumas respostas aqui são automáticas; uma pessoa da equipe acompanha a conversa."

## Etiquetas sugeridas

Uma etiqueta por estado do pedido (os mesmos estados de `schema/evento.schema.json`), mais as de origem.

| etiqueta | quando usar |
|---|---|
| Lead · anúncio | chegou por anúncio (campanha `ctwa-*` ou mencionou o anúncio) |
| Lead · orgânico | chegou pela saudação, Instagram ou rodapé de site entregue |
| Indicação | chegou com link `utm_source=indicacao` ou disse quem indicou |
| Viu prévia | mandou link da prévia ou disse que viu |
| Checkout | disse que vai pagar ou pediu o link |
| Pago · conferir | mandou o PEDIDO v1; pagamento ainda não conferido no Asaas |
| Em produção | pagamento conferido e 4 dados completos; relógio correndo |
| Aguardando aprovação | R7 enviado |
| No ar | R8 enviado; mensalidade começou |
| Cobrança D-3 | R9 enviado |
| Inadimplente | R10a ou R10b enviado |
| Cancelamento | pediu para sair; R11 enviado |
| Arrependimento | pediu desistência dentro dos 7 dias |
| Lista de espera | mandou a mensagem de "avise-me" de um nicho que ainda não chegou |
| Depoimento autorizado | respondeu com a frase de autorização do R12 |
