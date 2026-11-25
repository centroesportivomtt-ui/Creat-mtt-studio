---
name: oferta-empilhada
description: Montar a oferta (oferta empilhada). Lista todo obstáculo entre o comprador e o resultado, vira cada um em solução, fica com o que vale muito para ele e custa pouco para entregar e empilha núcleo, bônus que matam objeção, garantia com custo calculado, urgência só se for verdadeira e um nome claro; pontua antes e depois na equação de valor. Use quando o dono ou um agente disser "melhora a oferta", "por que não compram", "o que incluir", "bônus", "garantia", "oferta irrecusável", "monta a oferta do nicho", depois de um painel de objeções, ou quando o vídeo que o dono mandou mostra um negócio que precisa vender melhor.
---

# Oferta empilhada

Vem do `founder-offer` do pacote founder-skill (Jake Schincariol, MIT, commit `fd9385b0`; ver `ORIGEM.md`), com a lente de ofertas do `founder-board` dentro. O método resume ideias publicadas no livro *$100M Offers* (Alex Hormozi, 2021), escritas aqui com palavras nossas; nunca apresente como fala do autor nem use o nome dele como selo.

Serve à oferta da própria Creat e à oferta de cada negócio que o dono trouxer. Pergunta de corte: *um dono de salão de outra cidade, que chegou por um anúncio há 30 segundos, entende a oferta, acredita nela e paga sem precisar de conversa?*

## Antes da oferta: o mercado

Oferta ótima em mercado ruim não vende. Quatro perguntas, cada uma com evidência (Radar, conta de anúncios, contador do site):
1. **A dor é grande?** O comprador perde dinheiro, tempo ou cliente por causa dela, hoje.
2. **Ele tem dinheiro?** Paga o preço sem sofrimento, e paga a mensalidade.
3. **É fácil de achar?** Dá para chegar nele por anúncio pago, com público e custo medidos. (Orgânico, grupo de bairro e indicação não contam: direção de escala da casa.)
4. **Está crescendo?** Mais gente com essa dor no ano que vem do que neste.

Se duas respostas forem "não", diga isso antes de mexer na oferta: o problema é o mercado.

## A equação de valor

O valor que o comprador enxerga **sobe** com o resultado sonhado e com a chance que ele acredita ter de chegar lá, e **desce** com o tempo até o resultado e com o esforço e o sacrifício que a compra pede. Dê nota de 1 a 10 a cada um, antes e depois. A maioria das ofertas perde em **chance percebida** (falta prova) ou em **esforço** (pede demais do comprador).

Para o cliente que chega por anúncio, chance percebida é prova **na tela**: prévia com o nome dele, exemplo real, quem somos, garantia. Nada disso pode depender do WhatsApp.

## Passo 1: o que já se sabe

- A oferta de hoje, como o anúncio e a página mostram.
- As objeções do `painel-de-objecoes` (hipótese) e as reais: o que o `vendas` ouve, onde o `conversao` vê a desistência, o que concorrentes recebem de reclamação (Radar, com data).
- A conta da `calculadora-de-oferta`: o que cada extra custa, para a pilha continuar dando dinheiro.

## Passo 2: a lista de obstáculos

Escreva de 15 a 30 obstáculos entre o comprador e o resultado, **com as palavras dele**:
- antes de comprar (desconfiança, preço, trabalho de trocar, "meu Instagram já resolve");
- durante (esperar, aprender, ter que mandar foto e texto);
- depois (e se ninguém agendar, e se eu quiser mudar, e se eu cancelar).

Comece pelas objeções do painel e pelas reclamações reais.

## Passo 3: soluções, corte e pilha

Vire cada obstáculo em solução (recurso, serviço, formato, garantia). Dê nota de **valor para o comprador** (1 a 5) e de **custo para entregar** (1 a 5, da calculadora). Fique com valor alto e custo baixo. Monte:

- **Núcleo**: a coisa em si, descrita pelo **resultado**, não pelos ingredientes ("cliente agendando pelo WhatsApp", não "site em HTML").
- **Bônus**: dois ou três, cada um matando **uma** objeção nomeada. Bônus que não mata objeção sai.
- **Garantia**: o que acontece se não entregar. Calcule o custo antes de prometer: rode a `calculadora-de-oferta` com o reembolso como custo variável numa taxa de pedido realista. O direito de arrependimento de 7 dias da compra fora do estabelecimento (CDC, art. 49) já existe por lei e não é bônus.
- **Urgência e escassez**: só se forem verdadeiras e verificáveis (vagas da semana que a equipe de fato tem, preço de inauguração com data). Nunca contagem regressiva falsa nem "só restam 3".
- **Nome**: claro e específico para a oferta, não para a empresa.
- **Plano mensal**: toda oferta da Creat tem mensalidade honesta, com o que ela inclui e como cancelar.

## Passo 4: pontuar

Equação de valor antes e depois, de 1 a 10 em cada item, dizendo **qual peça da pilha mexe em qual nota**. Feche com a conta: a pilha passa na `calculadora-de-oferta`?

## Passo 5: testar de verdade

O original re-testa no painel simulado; aqui, não. Painel simulado sempre "melhora" quando a oferta melhora no papel. O teste é real:
- escreva antes a linha de sucesso e a amostra mínima (regra 9 do dono);
- o anúncio e a página com a oferta nova, o contador do site e o custo por Pix decidem;
- o painel pode rodar só para achar objeção **nova** que a pilha criou.

## Regras

- Toda promessa precisa ser entregável e caber na conta.
- Nada de depoimento, avaliação, escassez, desconto ou "visto em" falso. Fala do painel nunca vira depoimento.
- Garantia, urgência e afirmação de resultado seguem o CDC e as políticas de anúncio da Meta; texto novo de garantia ou de urgência passa pela revisão jurídica que a casa já usa antes de ir ao ar. Sem promessa de faturamento ou de número de clientes.
- Exemplo em repositório só com caso fictício marcado.

## Saída

`oferta.md` (no scratchpad ou na pasta do projeto, sem dado de cliente no repositório público) com: as 4 perguntas de mercado, a lista de obstáculos, a tabela valor e custo, a pilha, a equação antes e depois, a conta da calculadora e o teste real com linha de sucesso. Quem usa: `vendas`, `copywriter`, `conversao`, `criativo`.
