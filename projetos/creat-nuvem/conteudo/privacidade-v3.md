REVISAO_JURIDICA_PENDENTE

# Política de privacidade do Porta Aberta

Versão 3 · rascunho de 10/11/2026 · entra no ar no mesmo ato da página /abrir/ que grava o pedido no servidor

Esta política explica o que a vitrine da Creat Nuvem (as páginas do Porta Aberta) faz com dados pessoais, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018). Controladora: {{empresa.nome}} (nome empresarial {{empresa.razao}}), de {{empresa.cidade}} ({{empresa.uf}}), {{empresa.documento}}. Contato: {{contato.email}}.

## 1. Antes de qualquer aceite

Enquanto você só olha a vitrine e gera a prévia, a Creat não recebe nenhum dado pessoal seu.

- O nome do negócio, a cidade e o nicho que você digita para a prévia ficam só na memória da página. Eles não aparecem no endereço da página: assim que a página abre, ela tira esses dados do endereço. Em /abrir/, o nome e a cidade ficam também na aba aberta (armazenamento da sessão do navegador), para a página não perdê-los se você recarregar. Somem quando a aba é fechada.
- O WhatsApp que você digita no Teste de verdade fica só na memória da página. Ele abre o seu próprio WhatsApp e não é salvo nem enviado para a Creat.
- Guardamos por 30 dias, neste aparelho, de qual anúncio você veio (só a origem, o meio, a campanha e o código do anúncio, sem nada sobre você), para abrir o link de pagamento da sua região. Isso é gravado ao abrir a página, antes de qualquer aceite.
- A página conta, no servidor da Creat, quantas vezes por dia cada passo acontece (página vista, prévia gerada, ida ao pagamento, toque em pagar), separado só por nicho, praça e código do anúncio. Essa contagem não usa cookie, não guarda nada no seu aparelho e não leva nome, cidade, WhatsApp, e-mail nem o endereço IP: é um número por dia, somado com o de todas as outras visitas.
- As letras do site vêm do Google Fonts. Para entregá-las, o Google recebe o endereço IP e os dados do navegador em toda página, sem cookie.
- O site não grava cookie antes do seu aceite. A hospedagem pode gravar um cookie técnico de segurança contra robôs (__cf_bm), que dura até 30 minutos e não serve para medir você.

## 2. Medição sem cookie

Quando a medição sem cookie está ligada, contamos eventos como "prévia gerada" ou "plano visto", com o PostHog configurado sem cookie e sem guardar nada no seu aparelho. Cada evento leva só: o tipo de evento, o nicho, o plano, a origem da visita (utm) e o tipo de aparelho. Nunca leva nome do negócio, cidade, WhatsApp, e-mail ou endereço, e o endereço da página vai sem a parte depois do #.

## 3. Pixel da Meta e Clarity, só com o seu sim

O Pixel da Meta (medição de anúncios) e o Clarity da Microsoft (mapa de cliques e gravação de uso) só carregam depois que você toca em "Aceitar" no aviso "Medição desta página". Se você recusar, eles não carregam. Base legal: o seu consentimento (LGPD, art. 7º, I).

- **Onde aparece o aviso**: na página inicial, em /abrir/ e em /obrigado/, enquanto você não escolher. A sua escolha fica guardada neste aparelho por 180 dias; depois perguntamos de novo.
- **Pixel da Meta**: roda na página inicial, em /abrir/ e em /obrigado/. Ele manda à Meta estes eventos: PageView (página vista), ViewContent (quando a prévia abre, com o nicho), InitiateCheckout (quando você toca em pagar, com o valor em reais) e Purchase (só quando o Mercado Pago aprova o pagamento, com o valor em reais e o número do pagamento como identificador do evento, para a mesma compra não contar duas vezes). Os eventos que a Creat manda não levam nome, e-mail, telefone, endereço nem cidade. Como todo Pixel, ele envia à Meta o endereço IP, os dados do navegador e o endereço da página (sem nome nem cidade), e grava os cookies próprios da Meta, _fbp e _fbc, que duram até 90 dias.
- **Clarity**: roda só na página inicial, que não mostra os dados do pedido. O campo do nome do negócio e os lugares que repetem esse nome na tela ficam mascarados na gravação. Nas páginas /abrir/ e /obrigado/, onde estão os dados do pedido, o Clarity não carrega.
- **Mudar de ideia**: toque em "Preferências de medição", no rodapé da página inicial, da página do pedido, da página de confirmação, dos termos e desta política. Se você recusar depois de ter aceitado, a página desliga o Pixel, apaga os cookies _fbp e _fbc deste site e recarrega sem nada de terceiros.

## 4. O pedido: o momento em que os dados saem do seu aparelho

Em /abrir/, você preenche: o nome do negócio, a cidade, quem cuida do negócio, o WhatsApp que recebe os pedidos, o e-mail, o endereço do negócio e o horário de funcionamento, e escolhe o plano. **Esses dados saem do seu aparelho num momento só: quando você marca o aceite dos termos e desta política e toca no botão que leva ao pagamento.** Nesse toque, a página grava o pedido no servidor da Creat, antes de abrir o Mercado Pago. Se você parar antes desse toque, nada sai do aparelho.

O que fica gravado no pedido, no servidor:

- Do negócio: nome, cidade, nicho, praça e plano escolhidos, quem cuida do negócio, endereço e horários.
- De contato: o WhatsApp e o e-mail que você informou.
- Do anúncio: de onde você veio (origem, campanha e código do anúncio), sem nada sobre você.
- Do aceite: a versão e o código de conferência (hash) dos termos aceitos, e a hora do aceite pelo relógio do servidor (não a do seu aparelho).
- Um número de pedido e um segredo que só o seu aparelho conhece. O servidor guarda só o código de conferência (hash) do segredo, nunca o segredo. É ele que deixa este aparelho consultar o pedido e aprovar o rascunho do site.
- Depois do pagamento: o número e o meio do pagamento, a hora da confirmação, o prazo e o estado do pedido (aguardando pagamento, pago, em produção, rascunho enviado, aprovado, no ar).

O site guarda neste aparelho, e só neste aparelho:

- O número do pedido e o segredo, para consultar o pedido e aprovar o rascunho: 7 dias.
- O nome e a cidade do negócio, na aba de /abrir/: até a aba fechar.
- De qual anúncio você veio: 30 dias.
- A sua escolha sobre a medição: 180 dias.
- O número dos últimos pagamentos já medidos pelo Pixel (no máximo 30), para não contar a mesma compra duas vezes: 30 dias cada um.
- Se a prévia de um nicho já foi contada nesta aba: até a aba fechar.

Cada item com prazo se apaga sozinho quando vence. O botão "Esquecer meus dados neste aparelho", em /abrir/ e em /obrigado/, apaga na hora tudo o que o site guardou neste aparelho, inclusive a sua escolha sobre a medição, e os cookies _fbp e _fbc deste site. Ele não apaga o pedido gravado no servidor: para isso, veja a seção 9.

**Para que usamos e com que base legal** (LGPD, art. 7º):

- Gravar o pedido antes do pagamento, para ligar o pagamento a você mesmo quando você paga no app do banco e não volta à página: o seu consentimento, dado no aceite (art. 7º, I). Você pode revogar a qualquer momento (seção 9).
- Produzir o site, falar com você sobre o pedido, mandar o recibo e cobrar a mensalidade: execução do contrato (art. 7º, V).
- Guardar o que a lei fiscal e a de consumo exigem: cumprimento de obrigação legal (art. 7º, II).
- Limitar tentativas repetidas e robôs (seção 5): legítimo interesse da Creat em manter o serviço no ar e seguro (art. 7º, IX), com o mínimo de dado e apagado em horas.

## 5. Proteção contra abuso

Para impedir que alguém dispare milhares de pedidos ou de consultas, o servidor conta as tentativas de cada endereço IP por minuto e por hora. O endereço IP nunca é gravado: o servidor guarda só um código (hash) feito com o IP e com um valor aleatório que troca a cada hora. Sem esse valor ninguém, nem a Creat, volta do código ao IP. O valor da hora e as contagens são apagados pela rotina do servidor em até 4 horas.

A hospedagem (Cloudflare, na frente do site, e Base44, onde roda o servidor) recebe o endereço IP em toda visita, como qualquer site, para entregar a página e se proteger de ataques.

## 6. Pagamento

O pagamento é feito no Mercado Pago (Abertura, por Pix ou cartão; e o plano anual, no Pix, no dia em que o site entra no ar) ou no Stripe (mensalidade no cartão). A Creat não vê os dados do seu cartão. O CPF ou CNPJ de quem paga fica com o provedor de pagamento e não é guardado no pedido da Creat. Na volta do Mercado Pago, a página /obrigado/ lê o resultado do pagamento e tira esses dados do endereço logo em seguida.

Para saber qual pedido um pagamento paga, o servidor da Creat consulta o pagamento no Mercado Pago pelo número dele e manda, junto, o e-mail do pedido (ou os e-mails dos pedidos que podem ser dele, no máximo 5). A função que faz a consulta compara esse e-mail com o de quem pagou e responde só "confere" ou "não confere": o e-mail de quem pagou nunca é devolvido nem gravado nessa conferência.

## 7. Com quem os dados são compartilhados

Só com quem precisa para o serviço funcionar:

- Mercado Pago e Stripe, para a cobrança.
- Base44, que hospeda o servidor e o banco de dados do pedido (operador). O pedido fica num aplicativo próprio do Porta Aberta, separado de qualquer outro produto da Creat.
- A função da Creat que confere o pagamento no Mercado Pago, que também roda no Base44, em outro aplicativo da Creat. Ela recebe só o número do pagamento e o e-mail a comparar (seção 6) e não guarda o e-mail.
- Cloudflare, na frente do site, que recebe o endereço IP (seção 5).
- Anthropic, que fornece a IA que escreve os textos do site. Recebe os dados do negócio (nome, serviços, cidade, endereço e horários), não o seu e-mail nem o seu WhatsApp.
- Google, que entrega as letras do site (Google Fonts) e recebe o endereço IP.
- Meta (WhatsApp e, se você aceitar, Pixel) e Microsoft (Clarity, só na página inicial e se você aceitar).

**E-mail ao comprador.** Quando o envio automático de e-mail estiver ligado, o recibo e o aviso do rascunho saem pelo serviço de e-mail do Base44, que só entrega a quem tem cadastro no aplicativo. Por isso, antes do primeiro e-mail, o servidor cadastra o seu e-mail como usuário comum do aplicativo do Porta Aberta. O Base44 pode mandar a você um e-mail de convite: não é preciso aceitar nem criar senha. O cadastro não dá acesso a nenhum dado de pedido (nem ao seu) e só existe para o e-mail chegar. Ele fica enquanto o pedido existir e é apagado junto quando você pede a eliminação (seção 9). Hoje o envio automático está desligado, e o recibo vai pela página /obrigado/ e pelo WhatsApp do Suporte Creat.

Alguns desses fornecedores tratam dados fora do Brasil (Base44, Cloudflare, Anthropic, Google, Meta, Microsoft e Stripe). Nesses casos, a transferência segue as regras da LGPD e da ANPD para transferência internacional (LGPD, art. 33).

A Creat não vende dados.

## 8. Por quanto tempo guardamos

- No seu aparelho: os prazos da seção 4.
- Pedido que não foi pago, que foi recusado ou de que você desistiu: apagado pela rotina do servidor 30 dias depois de criado.
- Pedido pago: enquanto o plano estiver ativo e, depois, 5 anos, o prazo da lei fiscal e de consumo para provar a venda e responder por ela. Passado esse prazo, o pedido é apagado.
- Contagem contra abuso (seção 5): até 4 horas.
- Contagem diária de passos da página (seção 1): é um número por dia, sem dado pessoal.
- Conversas no WhatsApp do Suporte Creat: até 90 dias depois do último contato, salvo quando forem prova de contrato ou de cobrança.
- Arquivos do site depois do cancelamento: 30 dias, para o SAIR.

## 9. Seus direitos e como pedir

Você pode pedir a qualquer momento: confirmação de que tratamos seus dados, acesso, correção, anonimização, portabilidade, eliminação, informação sobre com quem compartilhamos e revogação do consentimento (LGPD, art. 18).

Como pedir: mande um e-mail para {{contato.email}}, com o assunto "Privacidade", ou uma mensagem ao WhatsApp do Suporte Creat, com o número do pedido (começa com PA-) ou o e-mail usado nele. Para proteger você, confirmamos o pedido pelo mesmo e-mail ou WhatsApp que está no pedido.

O que acontece: a pessoa do Suporte Creat responsável pela privacidade atende o pedido no painel do servidor, em até 15 dias. Eliminação: o pedido e o cadastro de e-mail (seção 7) são apagados; o que a lei fiscal exige guardar (número do pagamento, valor, data e o mínimo para a nota) fica separado e só para esse fim, e dizemos isso na resposta. Correção: o dado é corrigido no pedido. Portabilidade e acesso: mandamos os dados do pedido num arquivo legível. Revogação do consentimento do registro antes do pagamento: o pedido não pago é apagado na hora; o pedido já pago segue pelo contrato (seção 4).

## 10. Encarregado e contato

Canal do encarregado pelo tratamento de dados: {{contato.email}}, com o assunto "Privacidade". Você também pode reclamar na Autoridade Nacional de Proteção de Dados (ANPD).

## 11. Os sites entregues aos clientes

No site de cada negócio, o dono do negócio é o controlador dos dados dos clientes dele e a Creat é operadora. O site não guarda em servidor o nome nem o WhatsApp de quem pede horário: esses dados ficam no aparelho da pessoa, que pode apagá-los no botão "Esquecer meus dados". O site entregue não carrega Pixel nem medição de terceiros.

## 12. Mudanças

Se esta política mudar, a nova versão aparece aqui com a data. Mudança que afete o que você aceitou é avisada por WhatsApp ou e-mail.
