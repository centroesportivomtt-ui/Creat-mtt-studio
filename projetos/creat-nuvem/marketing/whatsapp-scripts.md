# Scripts do WhatsApp Business · Suporte Creat

Verbo (T3), 08/11/2026. Seção 13 do briefing. Para configurar uma vez no app WhatsApp Business do número "Suporte Creat" (Ferramentas comerciais > Mensagem de saudação, Mensagem de ausência, Respostas rápidas, Etiquetas).

Atualizado em 09/11/2026 para os anúncios de `trafego/anuncios-meta.md`: fluxo de fechamento em 5 mensagens (F1 a F5), lembretes 1:1 (L1 e L2), objeções O1 a O8 e etiquetas que a Meta lê. R5 passou a ser o F5; R14 virou O1 a O8; "É robô?" virou R15.

Atualizado em 10/11/2026 (onda 2, pacote 2B): regra única de prazo no R3, no F5 e na ausência; R7 sem aceite por silêncio (o site só entra no ar com o APROVO) e R7b para o aviso de 7 dias sem resposta; a desistência é o R16 (`/desisto`), o mesmo número de `docs/DESISTENCIA.md`. O número R14 fica aposentado, porque já foi o das objeções, hoje O1 a O8; V1 e V2 para os posts do Vitrine (`docs/VITRINE-POSTS.md`); domínio só "seu" quando o cliente registra um. Termos agora na versão 2 (termos-v2).

**Regra única de prazo.** Toda mensagem que fala de prazo usa esta frase, sem mudar nada: "O prazo de {{precos.prazoHoras}} h conta da confirmação do pagamento. Confirmamos pagamentos de segunda a sábado, das 9h às 19h, em até 2 horas. Pagou fora desse horário? A confirmação sai até as 11h do próximo dia de atendimento (segunda a sábado)." A mesma frase está em `conteudo/home.json`, `conteudo/faq.json`, `conteudo/abrir.json`, `conteudo/obrigado.json` e `conteudo/termos.md` (cláusula 5).

## Regras

- No máximo 4 linhas por mensagem. Tom direto, de pessoa para pessoa. Sem emoji.
- Só 1:1: responder quem chamou ou quem já é cliente. Nada de lista de transmissão para quem não pediu (Política de Mensagens do WhatsApp Business, atualizada em 23/09/2026: só contatar quem deu o número e pediu contato; respeitar pedido para parar).
- Nunca prometer o que o contrato não cobre (`conteudo/termos.md`). Nunca prometer clientes, pedidos ou faturamento.
- Nunca pedir senha, número de cartão ou foto de documento.
- Nunca citar marca concorrente, nem quando o cliente cita.
- Responder quem chegou por anúncio em até 5 minutos dentro do horário. A Meta recomenda resposta rápida e lembrete nos anúncios de conversa (facebook.com/business/help/269324800441478, lida em 09/11/2026). Fora do horário, vale a mensagem de ausência.
- Preço sempre com Abertura e mensalidade na mesma mensagem, e com a regra de que a mensalidade só começa com o site no ar. A Meta age contra assinatura "sem divulgação clara dos termos" (Práticas Comerciais Proibidas, alteração de 29/10/2026), e a conversa que sai do anúncio também é revisada.
- Pagamento pelo Mercado Pago (Pix ou cartão), sempre pelo link de `/abrir/`, que mostra o total e pede o aceite dos termos. Se o link de pagamento ainda não estiver em `checkout.config.js`, use o F4b.
- No máximo 2 lembretes para quem não respondeu (L1 e L2). Depois disso, só se a pessoa voltar a falar.
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
> Se você já pagou, o seu pedido está na fila. O prazo de {{precos.prazoHoras}} h conta da confirmação do pagamento. Confirmamos pagamentos de segunda a sábado, das 9h às 19h, em até 2 horas. Pagou fora desse horário? A confirmação sai até as 11h do próximo dia de atendimento (segunda a sábado).

## Fluxo de fechamento em 5 mensagens

Para quem chega pelo anúncio (mensagem pré-preenchida da tabela em `trafego/anuncios-meta.md`, seção 6) ou pede para ver o site. Uma mensagem por vez; espere a resposta antes da próxima. Atalhos: `/f1` a `/f4b` e, para o F5, `/recebi`.

**Como montar o link da prévia com o nome do negócio.** O nome vai depois do `#`, nunca depois do `?`. O fragmento não sai do celular de quem abre e não entra no analytics (regra de `utm.md`). Troque cada espaço por `%20`. O nome tem no máximo 40 caracteres. Teste uma vez com um nome com acento antes do primeiro dia de campanha.

`{{site.url}}/?nicho={nicho}&utm_source=meta&utm_medium=pago&utm_campaign=ctwa-nov26&utm_content={código}#k={nicho}&n={negócio}`

- `{nicho}`: `barbearia`, `salao` ou `academia`.
- `{código}`: o `utm_content` do anúncio, tirado da mensagem pré-preenchida (tabela da seção 6 de `trafego/anuncios-meta.md`). Sem anúncio identificado: `W0-{nicho}-v1`.
- Conversa que não veio de anúncio: troque as UTMs por `utm_source=whatsapp&utm_medium=organico&utm_campaign=fechamento`.

Exemplo: `{{site.url}}/?nicho=barbearia&utm_source=meta&utm_medium=pago&utm_campaign=ctwa-nov26&utm_content=F1-barbearia-v1#k=barbearia&n=Barbearia%20Navalha%20Ficticia`

**F1 · Saudação** (`/f1`) · logo depois da primeira mensagem, em até 5 minutos
> Oi! Aqui é {atendente}, da equipe da Creat. Já te mando a prévia do seu site, com o nome do seu negócio na placa.
> Ver é grátis e sem cadastro.

**F2 · Qualificação, 1 pergunta** (`/f2`) · na mesma hora, logo depois do F1
> Qual é o nome do negócio, do jeito que está na fachada?

Se a mensagem pré-preenchida não disse o nicho, use esta versão: "Qual é o nome do negócio e o que ele é: barbearia, salão ou academia?". Nicho fora dos 3 (pet, restaurante, oficina etc.): responda com o "avise-me" da home e use a etiqueta "Lista de espera". Não ofereça um site de outro nicho.

**F3 · Prévia com o nome do negócio** (`/f3`) · assim que a pessoa responder
> Pronto, aqui está a placa com o nome {negócio}: {link da prévia}
> O nome já está escrito. Vire a placa para ABERTO e veja o site com os serviços e o botão de pedido.
> Lá embaixo, toque em "Testar no meu WhatsApp": o pedido de teste chega no seu próprio celular.
> Os serviços e preços da prévia são exemplo; no seu site entram os seus.

Etiquetas: "Lead · anúncio" (ou "Lead · orgânico") e, da Meta, **Lead**.

**F4 · Preço e Pix** (`/f4`) · quando a pessoa disser que gostou, perguntar o preço ou mandar o pedido de teste
> Para pôr {negócio} no ar: Abertura de R$ {{precos.abertura.inauguracao.preco}}, uma vez, nas {{precos.abertura.inauguracao.vagasTotal}} vagas de inauguração (depois, R$ {{precos.abertura.padrao}}).
> A mensalidade só começa no dia em que o site entra no ar: Aberto R$ {{precos.planos.aberto}} ou Vitrine R$ {{precos.planos.vitrine}} por mês no cartão, ou anual no Pix. O Vitrine traz 4 posts prontos por mês para você publicar. Sem fidelidade e sem multa.
> Pague por Pix ou cartão neste link, que mostra o total antes: {{site.url}}/abrir/#plano=aberto&k={nicho}&n={negócio}&utm_source=meta&utm_medium=pago&utm_campaign=ctwa-nov26&utm_content={código}
> Depois de pagar, você tem 7 dias para desistir com o dinheiro de volta.

Antes de mandar, confira em `dados/precos.json` se a inauguração ainda vale e quantas vagas restam. Quem digita a resposta rápida no app não vê o `precos.json` mudar: o preço de inauguração que ficou salvo no atalho continua aparecendo para sempre, mesmo depois da 20ª vaga. Conte as vagas pagas à mão (Mercado Pago) e, na 20ª, troque o texto do `/f4` e do `/precos` no mesmo dia (e, no Plano B, desative o link de R$ 297). Sem inauguração, troque a primeira linha por "Abertura de R$ {{precos.abertura.padrao}}, uma vez." Se a pessoa já escolheu o Vitrine, troque `plano=aberto` por `plano=vitrine`. Etiquetas: "Checkout" e, da Meta, **New order**.

**F4b · Enquanto `/abrir/` ainda termina no WhatsApp** (`/f4b`) · só até o link do Mercado Pago estar em `checkout.config.js`

Mande as duas primeiras linhas do F4 (Abertura e mensalidade) e, em seguida, esta mensagem:
> Antes de pagar, leia os termos: {{site.url}}/termos/ e me responda LI E ACEITO.
> Depois do seu aceite, eu mando aqui o link do Mercado Pago, por Pix ou cartão, com o valor certo.
> Depois de pagar, você tem 7 dias para desistir com o dinheiro de volta.

O link de pagamento só sai depois do "LI E ACEITO". Abertura inauguração (R$ 297): https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-388377b3-87f4-43db-b88c-af75b6ce6526 · Abertura (R$ 497): https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=2189692475-fc609d62-006f-49e5-ae5a-93e73f762a68 · Plano Aberto R$ 147/mês (cartão): https://buy.stripe.com/7sYbIV5JIe7nfvR09r2cg00 · Plano Vitrine R$ 297/mês (cartão): https://buy.stripe.com/28EcMZ7RQbZf2J56xP2cg01 · portal do assinante (cancelar, trocar cartão): https://billing.stripe.com/p/login/7sYbIV5JIe7nfvR09r2cg00 Sem o `/abrir/`, os 4 dados do pedido vêm por esta conversa, depois do pagamento (F5).

**F5 · Confirmação e próximos passos** (`/recebi`, o mesmo atalho do antigo R5) · só depois de ver o pagamento aprovado no Mercado Pago
> Pagamento confirmado, {nome}. Pedido {id}: guarde este número, ele é o seu protocolo.
> O site fica pronto para você aprovar em até {{precos.prazoHoras}} h. O prazo de {{precos.prazoHoras}} h conta da confirmação do pagamento. Confirmamos pagamentos de segunda a sábado, das 9h às 19h, em até 2 horas. Pagou fora desse horário? A confirmação sai até as 11h do próximo dia de atendimento (segunda a sábado).
> Se puder, mande também a lista de serviços com preço e duração. Se não mandar, o site sai com os serviços do modelo, sem preço, e você ajusta antes de aprovar.
> Os termos que você aceitou (termos-v2, a versão que você aceitou): {{site.url}}/termos/ . O recibo do pagamento é o que o Mercado Pago mandou para o seu e-mail.

Mande em seguida, como segunda mensagem: "Próximos passos: eu mando o site aqui, você responde APROVO ou o que quer mudar, e o site entra no ar. A mensalidade começa nesse dia. Veja como a equipe trabalha (demonstração, com o nome do seu negócio na fachada): {link da sede}". O F5 tem mais de 4 linhas por causa da regra de prazo, que não pode ser cortada nem resumida. Se o pedido chegou sem endereço ou horário, peça o que falta numa terceira mensagem: "Para montar, falta: {o que falta}."

Se a Creat passar do prazo, o 1º mês do plano é grátis (termos, cláusula 5). Diga isso só se a pessoa perguntar pelo prazo; o R3 tem o texto. Se o cliente aceitou a versão 1 dos termos (o pedido diz `termos-v1`), troque "termos-v2" por "termos-v1" na mensagem. Etiquetas: "Pago · conferir" até conferir os dados, depois "Em produção". Da Meta: **Paid**, em até 7 dias do clique no anúncio.

## Lembretes 1:1 (só para quem chamou)

**L1 · 2 horas depois do F3, se a pessoa não respondeu** (`/l1`)
> {nome}, o link da prévia abriu certinho? Se não abriu, me avise que eu mando de novo.

**L2 · 24 horas depois do F3 ou do F4, último lembrete** (`/l2`)
> Último recado sobre o seu site: o link continua valendo, {link}.
> Se não for a hora, tudo bem. Não mando mais mensagem sobre isso.

Depois do L2, pare. Se a pessoa pedir para não receber mensagem, não mande nem o L2. Etiqueta da Meta para quem não pagou: **Pending payment** quando o F4 foi enviado, ou **Follow up** quando parou na prévia.

## Respostas rápidas

Atalho entre parênteses: é o que se digita depois da barra `/` no app.

**R1 · Quero ver** (`/ver`)
> Digite o nome do seu negócio aqui e veja o site pronto em segundos: {{site.url}}/?utm_source=whatsapp&utm_medium=organico&utm_campaign=r1
> Dá para testar o pedido de horário no seu próprio WhatsApp. Ver é grátis.

**R2 · Preços** (`/precos`)
> Abertura: R$ {{precos.abertura.atual}}, uma vez. Depois, o plano começa no dia em que o site entra no ar: Aberto R$ {{precos.planos.aberto}} por mês ou Vitrine R$ {{precos.planos.vitrine}} por mês (com 4 posts prontos por mês para você publicar), no cartão.
> Sem fidelidade e sem multa. Anual: 12 meses pelo preço de {{precos.anualMesesPagos}}, no Pix.
> Não inclui anúncio pago, loja virtual nem a anuidade do domínio, que é paga no seu nome ao Registro.br.

Se a inauguração estiver valendo, troque a primeira linha por: "Abertura: R$ {{precos.abertura.inauguracao.preco}} nas {{precos.abertura.inauguracao.vagasTotal}} primeiras vagas (depois R$ {{precos.abertura.padrao}}), uma vez." Confira as vagas restantes no `precos.json` antes de mandar.

**R3 · Prazo e garantia** (`/prazo`)
> O site fica pronto para você aprovar em até {{precos.prazoHoras}} h. Se a gente passar do prazo, o 1º mês do plano é grátis.
> O prazo de {{precos.prazoHoras}} h conta da confirmação do pagamento. Confirmamos pagamentos de segunda a sábado, das 9h às 19h, em até 2 horas. Pagou fora desse horário? A confirmação sai até as 11h do próximo dia de atendimento (segunda a sábado).
> Domínio próprio e Google ficam fora do relógio, porque dependem de você e de terceiros.

**R4 · Preciso ter alguma coisa?** (`/precisa`)
> Só o WhatsApp Business no celular, que é grátis.
> Para o domínio .com.br, o seu CPF ou CNPJ, porque ele fica no seu nome. Instagram só no plano Vitrine; sem Instagram, o plano Aberto funciona só com o WhatsApp.
> Logo e fotos, se tiver. Se não tiver, o site sai com a tipografia do modelo e você manda depois.

**R5 · Pós-pagamento** (`/recebi`)
Substituído pelo F5 do fluxo de fechamento, que ficou com o atalho `/recebi`. Cadastre só o F5, para não ter duas versões.

**R6 · Pedido de materiais** (`/materiais`)
> Para deixar o site com a cara do seu negócio, mande por aqui, se tiver: o logo, até 6 fotos (fachada, espaço, trabalho pronto) e a lista de serviços com preço e duração.
> Fotos de pessoas só com a autorização delas. Se não tiver nada disso agora, tudo bem: o site sai no prazo e você manda depois.

**R7 · Prévia pronta** (`/pronta`)
> {nome}, o site da {negócio} está pronto para você conferir: {link}
> Abra, confira e toque em Aprovar e colocar no ar, ou responda APROVO aqui. Se quiser mudar algo, escreva o que é, numa mensagem só. O link vale 14 dias.
> O site só entra no ar com o seu sim, e a mensalidade só começa nesse dia.

O `{link}` é o link de aprovação de `docs/EXECUTOR.md`, passo (i), item 3 (com o código depois do `#`). Ele não vai para relatório, etiqueta nem outra conversa. O site só vai ao ar com o APROVO ou com o toque em Aprovar: silêncio não aprova. Se a pessoa não responder em 7 dias do envio desta mensagem (`rascunho_em`), o suporte recebe o aviso "rascunho sem resposta há 7 dias" (`docs/EXECUTOR.md`, passo (l)) e manda o R7b, uma vez.

**R7b · Site pronto sem resposta** (`/pronta2`) · uma vez, quando chegar o aviso de 7 dias sem resposta
> {nome}, o site da {negócio} continua pronto, esperando o seu sim: {link}
> Ele só entra no ar quando você aprovar. Se quiser mudar algo, escreva aqui o que é, numa mensagem só.

O `{link}` é o mesmo do R7 (vale 14 dias do envio). Passou dos 14 dias: peça um novo link ao suporte (`docs/EXECUTOR.md`, passo (i), item 5) antes de mandar.

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
> Você recebe o SAIR: o site num arquivo que abre direto no computador, com o botão do seu WhatsApp, mais os seus textos, fotos e logo. Se você registrou um domínio, ele continua seu.
> Confirma o cancelamento? Responda CANCELAR e eu mando o SAIR por aqui.

**R12 · Pedido de depoimento** (`/depoimento`)
> {nome}, posso te pedir uma ou duas frases sobre como foi abrir o site com a gente?
> Só publico se você escrever, nesta conversa: "Autorizo a Creat a publicar este texto com o meu nome e o nome do meu negócio." Você pode retirar a autorização quando quiser.

**R13 · Indicação** (`/indica`)
> Se conhece outro negócio que precisa de site, mande este link para ele: {{site.url}}/?utm_source=indicacao&utm_medium=ref&utm_campaign=indica-v1
> Obrigado por lembrar da gente.

Nota (08/11/2026): o R13 não promete recompensa. Nenhuma cláusula de `conteudo/termos.md` cobre indicação. A recompensa só entra neste texto depois que o Marcos decidir a regra (quando vale, quem recebe, quantas vezes) e ela for escrita nos termos. O `utm_content={id}` leva o id curto do pedido (`PA-` + 8 caracteres) e aguarda o aval da Muralha para uso no analytics; até lá, o link acima sai sem o parâmetro. Com o aval, acrescente `&utm_content={id}` ao fim.

**R16 · Desistência** (`/desisto`) · na hora em que a pessoa pedir para desistir, dentro dos 7 dias (termos, cláusula 6). Mesmo número de `docs/DESISTENCIA.md`.
> Recebemos o seu pedido de desistência. Protocolo: {id}.
> Devolvemos o valor em até 5 dias úteis depois do pedido, pelo mesmo meio de pagamento (no Pix, na mesma conta; no cartão, o estorno aparece na fatura conforme o banco).
> O site sai do ar hoje. Você não precisa fazer mais nada.

Não pergunte o motivo e não ofereça desconto. Depois de mandar, siga os passos de `docs/DESISTENCIA.md`, seção 3, e use a etiqueta "Arrependimento". Pedido chegou por e-mail: responda com o mesmo texto, no e-mail. Sem o número do pedido, ache pelo WhatsApp de quem escreveu, sem pedir documento.

**R15 · "É robô?"** (`/robo`)
> É uma equipe de agentes de IA, e eu sou uma pessoa da equipe. A IA monta os textos do seu site, regras automáticas conferem e uma pessoa lê tudo antes de você aprovar.
> Aqui no WhatsApp, quem responde é gente.

Atenção no R15: "quem responde é gente" só pode ficar enquanto as respostas forem escritas por uma pessoa. Se um dia entrar resposta automática por IA neste número, troque a última linha por "Algumas respostas aqui são automáticas; uma pessoa da equipe acompanha a conversa."

## Posts do plano Vitrine · V1 e V2

Só para cliente do Vitrine com o site no ar. Processo inteiro em `docs/VITRINE-POSTS.md`.

**V1 · Posts do mês** (`/posts`) · na primeira semana do mês do plano; no primeiro mês, em até 7 dias do site no ar. Mande as 4 imagens antes, cada uma com a legenda logo abaixo.
> {nome}, aqui estão os 4 posts de {mês} para o Instagram da {negócio}, com a legenda de cada um.
> Para cada post, responda com o número e SIM, AJUSTE (e o que mudar) ou NÃO. Exemplo: 1 SIM, 2 AJUSTE trocar a foto, 3 SIM, 4 NÃO.
> Nada vai para o seu Instagram sem o seu sim. Os aprovados você publica no seu perfil, quando quiser.

**V2 · Lembrete dos posts** (`/posts2`) · uma vez, 3 dias depois do V1, só se a pessoa não respondeu
> {nome}, os 4 posts de {mês} continuam aqui na conversa. Quando quiser, responda com o número de cada um e SIM, AJUSTE ou NÃO.

Depois do V2, pare. Sem resposta, nada é publicado e nada mais é mandado sobre os posts daquele mês.

## Objeções · O1 a O8

As 8 que devem aparecer mais na conversa vinda de anúncio. A lista é hipótese da casa: ainda não há conversa medida. Na revisão semanal, conte quantas vezes cada uma apareceu e troque a ordem pelo que a conversa real mostrar.

Regras: responder a dúvida em até 4 linhas e terminar com um próximo passo (o link da prévia ou o F4). Nunca prometer cliente, pedido ou faturamento. Nunca citar concorrente, nem quando a pessoa cita.

**O1 · "É caro"** (`/caro`)
> Entendo. Na Abertura entram o site montado com o nome do seu negócio, o pedido de horário no seu WhatsApp e a publicação. A mensalidade cobre hospedagem, alterações e suporte.
> A mensalidade só começa com o site no ar, sem fidelidade. No anual, são 12 meses pelo preço de {{precos.anualMesesPagos}}, no Pix.
> E você tem 7 dias para desistir depois de pagar. A prévia fica com você para decidir com calma: {link da prévia}

**O2 · "Vou pensar" / "Depois eu vejo"** (`/pensar`)
> Claro. O link da prévia continua valendo, inclusive para mostrar a quem decide com você: {link da prévia}
> Posso te mandar um lembrete amanhã? Se preferir que não, é só dizer.

Se a inauguração estiver valendo e o `atualizado_em` de `dados/precos.json` tiver menos de 48 h, acrescente: "Hoje restam {{precos.abertura.inauguracao.vagasRestantes}} vagas de inauguração; o preço que vale é o que aparece em /abrir/ na hora do pagamento." Sem dado fresco, não cite vagas (escassez sem dado real contraria o CDC, art. 37). O "sim" ao lembrete autoriza o L2; o "não" encerra.

**O3 · "Meu Instagram já resolve"** (`/insta`)
> O Instagram continua, e o site entra no link da bio. Quem chega pelo perfil vê serviços, endereço e horário num lugar só e manda o pedido de horário pronto no seu WhatsApp.
> O site também é o endereço que você põe no Perfil da Empresa no Google.
> Veja como fica, com o nome do seu negócio: {link da prévia}

**O4 · "Meu cliente só chama no WhatsApp"** (`/sozap`)
> Ótimo, o site não tira o WhatsApp: ele leva para lá. O botão de pedido abre o seu WhatsApp com o serviço, o dia e o horário já escritos, e quem confirma é você.
> Teste agora no seu próprio celular, no fim da prévia: {link da prévia}

**O5 · "Como sei que não é golpe?"** (`/confia`)
> Pergunta justa. Você vê o site pronto antes de pagar qualquer coisa, e o pagamento é pelo Mercado Pago, com comprovante.
> Depois de pagar, você tem 7 dias para desistir com o dinheiro de volta pelo mesmo meio (Código de Defesa do Consumidor, art. 49).
> A creat.MTT Studio fica em Riachão do Jacuípe (BA), CNPJ 57.068.874/0001-06. O nosso trabalho está no Instagram @creat.mtt, e os termos, aqui: {{site.url}}/termos/

Nunca peça senha, número de cartão nem foto de documento, nem para "provar" nada. O pagamento acontece só na página do Mercado Pago.

**O6 · "Não tenho tempo para isso"** (`/tempo`)
> Do seu lado é pouco: o nome do negócio e o WhatsApp que recebe os pedidos e, depois do pagamento, o endereço e o horário. A equipe monta, e você aprova com um APROVO nesta conversa.
> Logo e fotos são opcionais e podem vir depois. A prévia leva segundos: {link da prévia}

**O7 · "Já uso outro aplicativo de horários"** (`/jatenho`) · o cliente pode citar a marca; a resposta não cita.
> Pode continuar com ele. O botão do seu site pode abrir esse aplicativo em vez do WhatsApp; é só me mandar o link.
> O site entra como a porta de entrada do seu negócio na internet, com endereço, serviços e o caminho para o cliente pedir horário.
> Veja como fica, com o nome do seu negócio: {link da prévia}

**O8 · "E se eu quiser sair?"** (`/sesair`)
> Você sai quando quiser, sem multa. Leva o site num arquivo que abre no computador e os seus arquivos. Se você registrou um domínio, ele continua seu.
> Está nos termos, na cláusula do SAIR: {{site.url}}/termos/

Nos links de prévia das objeções, use o mesmo formato do F3. Fora de anúncio, use `utm_campaign=r14` no lugar de `ctwa-nov26`: a campanha antiga das objeções continua valendo em `utm.md`.

## Etiquetas sugeridas

Uma etiqueta por estado do pedido (os mesmos estados de `schema/evento.schema.json`), mais as de origem.

| etiqueta | quando usar |
|---|---|
| Lead · anúncio | chegou por anúncio (campanha `ctwa-*` ou mencionou o anúncio) |
| Lead · orgânico | chegou pela saudação, Instagram ou rodapé de site entregue |
| Indicação | chegou com link `utm_source=indicacao` ou disse quem indicou |
| Viu prévia | mandou link da prévia ou disse que viu |
| Checkout | disse que vai pagar ou pediu o link |
| Pago · conferir | mandou o PEDIDO v1 ou pagou pelo link; pagamento ainda não conferido no Mercado Pago |
| Em produção | pagamento conferido; prazo correndo (regra única de prazo) |
| Aguardando aprovação | R7 enviado |
| No ar | R8 enviado; mensalidade começou |
| Cobrança D-3 | R9 enviado |
| Inadimplente | R10a ou R10b enviado |
| Cancelamento | pediu para sair; R11 enviado |
| Arrependimento | pediu desistência dentro dos 7 dias |
| Lista de espera | mandou a mensagem de "avise-me" de um nicho que ainda não chegou |
| Depoimento autorizado | respondeu com a frase de autorização do R12 |

## Etiquetas que a Meta lê (anúncios de WhatsApp)

Com **Ferramentas > Atividade dos seus clientes** ligada no app, as etiquetas **predefinidas** viram sinal para a Meta. Esse sinal permite, depois, otimizar a campanha por lead e por compra, e não só por conversa. A Meta pede pelo menos 10 eventos em 30 dias, etiquetados em até 7 dias do clique no anúncio (facebook.com/business/m/ads-that-click-to-whatsapp-optimization, lida em 09/11/2026). Etiqueta personalizada, como as da tabela acima, pode não ser lida. Por isso a conversa leva as duas: a nossa, para operar, e a da Meta, para medir.

| etiqueta predefinida (nome da Meta) | quando usar | mensagem do fluxo |
|---|---|---|
| Lead | disse o nome do negócio e recebeu a prévia | F3 |
| Follow up | parou na prévia e recebeu lembrete | L1 ou L2 |
| New order | recebeu o link de pagamento | F4 ou F4b |
| Pending payment | recebeu o link e não pagou em 24 h | L2 |
| Paid | pagamento aprovado no Mercado Pago | F5 |
| Order complete | site no ar | R8 |

- No app em português, os nomes podem aparecer traduzidos. [PREENCHER: o nome exato de cada etiqueta no app do Suporte Creat, conferido no dia 1.] Use sempre a predefinida, nunca uma cópia com o mesmo nome.
- Ligue a "Atividade dos seus clientes" **antes** de ativar a campanha, para a contagem dos 10 eventos já correr. Uma fonte terceira diz que isso pode mudar a saudação, a ausência ou as listas do app; confira no dia 1 e anote aqui. [PREENCHER: resultado da conferência, com data.]
- Uma venda fechada no site (Pixel) e a mesma venda etiquetada "Paid" no app são contadas pela Meta em lugares diferentes e não se anulam. Para a campanha de WhatsApp, a verdade é a etiqueta do app. O Pixel mede a campanha de site.

