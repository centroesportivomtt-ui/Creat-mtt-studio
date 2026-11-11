# Medição do funil (Pixel da Meta) · Porta Aberta

Atualizado em 11/11/2026 · código em `assets/vitrine.js` · testes em `scripts/testes/funil.test.mjs` e, para a lista do contador, `scripts/testes/pedido-api.test.mjs`

## Regras
1. **Consentimento**: o Pixel (e o Clarity, só na home) carregam só depois do "Aceitar". O banner existe na home, em `/abrir/` e em `/obrigado/`; nas duas últimas ele aparece logo ao abrir, enquanto não houver escolha gravada (`creat:consentimento`, versão 1, válida por 180 dias). Com o banner aberto em `/abrir/`, a barra fixa de pagar sai da frente (o botão da seção Pagamento continua). "Preferências de medição", no rodapé da home, de `/abrir/` e de `/obrigado/`, reabre a escolha; termos e privacidade levam a `../#preferencias`, que abre a escolha na home. Recusar depois de aceitar chama `fbq('consent','revoke')`, apaga `_fbp` e `_fbc` e recarrega a página sem terceiros. Sem escolha ou com "Recusar", nenhum script de terceiro carrega e nenhum evento sai.
1b. **Clarity só na home** (decisão D4): `/abrir/` e `/obrigado/` mostram nome, cidade, responsável, endereço e o texto do pedido; o Clarity nunca carrega nelas (teste de navegador em `funil.test.mjs`). Na home, o campo do nome, a placa, o formulário, o rótulo da prévia, o celular do teste e a comanda da sede levam `data-clarity-mask="True"`.
2. **Endereço limpo antes de medir**: a primeira coisa que a página faz (`limparEndereco`, antes de qualquer script de medição) é ler nome, cidade, nicho, plano e `utm_*` do `#` e reescrever o endereço com `history.replaceState`. Na home o `#` some inteiro; em `/abrir/` fica só `plano`, `k` (nicho), `p` (paleta) e `utm_*`. Em `/obrigado/` saem também os parâmetros da volta do Mercado Pago (`payment_id`, `collection_*`, `status`, `preference_id`, `external_reference` e afins). Assim o `dl` do Pixel nunca leva nome nem cidade.
3. **Sem dado pessoal em evento**: cada evento tem uma lista fechada de parâmetros (`filtrarPixel`). Nada de nome, telefone, e-mail ou cidade. Parâmetro fora da lista é descartado; parâmetro obrigatório faltando cancela o evento.
4. **Sem duplicar em recarga**: PageView é um por carga de página (é o que ele mede). Os outros eventos nascem de ação, não de carga, e ainda têm trava própria (tabela).

## Eventos

| evento | onde dispara | parâmetros | trava contra duplicidade |
|---|---|---|---|
| PageView | home, `/abrir/`, `/obrigado/`, ao carregar o Pixel (logo após o "Aceitar" ou ao abrir a página com o aceite já gravado) | nenhum | um por carga de página |
| ViewContent | home, quando a prévia é gerada (placa virada ou botão "Abrir meu negócio") | `content_category` = nicho (`barbearia`, `salao`, `academia`); `content_name` = `previa` | um por nicho por sessão do navegador (`sessionStorage creat:px:vc:<nicho>`) |
| InitiateCheckout | `/abrir/`, no clique em "Pagar no Pix ou cartão" (na seção Pagamento ou no botão fixo do rodapé), depois de o formulário passar na validação | `value` = valor do link escolhido, que é o total da tela (hoje sempre só a Abertura, em qualquer plano); `currency` = `BRL` | um por carga da página |
| Purchase | `/obrigado/`, só se a volta do Mercado Pago trouxer `collection_status=approved` ou `status=approved` **e** `payment_id` numérico **e** `preference_id` de um link conhecido do `checkout.config.js` | `value` = valor desse link (`valorDaPreferencia`); `currency` = `BRL`; `eventID` = `payment_id` | uma vez por `payment_id` (`localStorage creat:px:compras`: `{id, em}` dos últimos 30, cada um por 30 dias). Sem `preference_id` conhecida, sem consentimento ou já medido, não sai (nenhum valor adivinhado) |

O `InitiateCheckout` saiu da home (antes disparava no clique em "Quero este site no ar", antes de a pessoa ver o preço).

## Contador próprio (sem aceite)

Além do Pixel, a página conta passos no servidor da Creat pela função `/api/pa/contar` (contrato em `docs/PEDIDO-API.md`, seção 4.4). Ele não depende do "Aceitar" porque não usa cookie, não leva dado pessoal e o próprio contador não guarda nada no aparelho (a trava de um por carga fica só na memória da página; a origem de 30 dias, abaixo, é de antes dele e serve ao link de pagamento da praça): o corpo é sempre `{evento, nicho, praca, utm_content}` e o servidor grava só um número por dia em `ContadorDia`, separado por evento, nicho, praça e código do anúncio. A lista de eventos é fechada (`EVENTOS` em `schema/pedido-regras.mjs`); nome fora dela é descartado sem gravar.

**Hoje a página emite só 4: `visita`, `previa`, `ida_pagamento` e `clique_pagar`.** Os 5 de interesse (`ficou_10s`, `rolou`, `tocou_nome`, `digitou_nome`, `tocou_exemplo`) já estão na lista fechada do servidor, mas a página ainda não os emite (ordem de publicação logo abaixo da tabela).

Regras dos 9 eventos:
- No máximo **um por carga da página** e por tipo (a trava fica só na memória da página, some ao recarregar; não é cookie nem `localStorage`).
- Mesmo corpo de hoje. Nenhum campo novo: nunca o texto digitado, o tempo exato, a posição da rolagem, um identificador ou um cookie.
- Nada sai no link de teste `?teste=pa-teste`, em página nenhuma (`contar` volta antes de enviar). Com `utm_content=conferencia` a chamada sai, mas nada é gravado: a função descarta antes do banco (`docs/PEDIDO-API.md`, seção 4.4).
- Teto de 60 por minuto por origem e 600 no total, que nunca devolve 429: passou, descarta.

| evento | quando conta | pergunta que responde |
|---|---|---|
| `visita` | página carregou com o JavaScript rodando | denominador de tudo |
| `ficou_10s` | **ainda não emitido pela página.** 10 s somados com a aba visível (`document.visibilityState`); pré-carga da Meta e aba em segundo plano não somam | a pessoa ficou ou saiu em segundos (criativo ou público errado) |
| `rolou` | **ainda não emitido pela página.** `scrollY` de pelo menos meia tela (0,5 x `innerHeight`); a rolagem feita pelo próprio código (o `scrollIntoView` da placa, a partir do envio) não conta | explorou além da primeira tela |
| `tocou_nome` | **ainda não emitido pela página.** `pointerdown` na caixa do campo "Nome do seu negócio" ou `focus` do campo; o foco dado pelo código (erro de nome vazio, botão do modo exemplo) não conta | aceitou começar a digitar |
| `digitou_nome` | **ainda não emitido pela página.** Evento `input` com `isTrusted` e o nome limpo com pelo menos 2 caracteres; só o fato sai, o texto nunca sai da página; o nome que volta de `/abrir/` entra pelo código e não conta | tocou e desistiu, ou digitou |
| `tocou_exemplo` | **ainda não emitido pela página.** Clique no cartão `[data-exemplo-site]` (site de exemplo do nicho) | o cartão de exemplo chama atenção e é usado |
| `previa` | prévia gerada com nome digitado (o toque no exemplo nunca conta `previa`) | o numerador do teste da primeira tela |
| `ida_pagamento` | abertura de `/abrir/` | quis comprar |
| `clique_pagar` | toque em Pagar em `/abrir/` | foi ao pagamento |

**Ordem de publicação** (estado em 11/11/2026: os 5 de interesse estão nas regras do repositório, `pa-regras-1A-2026-11-11a`, e ainda não no app nem na página): esquema de `ContadorDia` com os 9 valores, depois `regras.js` do app com o sha256 igual, depois a página que emite os 5 **junto** com a Versão 5 da política de privacidade. A página não emite os 5 antes de a política nova estar no ar. Passo a passo em `docs/PEDIDO-API.md`, seção 4.4.

**Quem entra no denominador (regra de leitura, 11/11/2026).** Só as linhas de `ContadorDia` com praça `feira` ou `salvador-rms` **e** anúncio com código do teste (`R7-*`, `R9-*`, `F1-*`). Toda linha com praça ou anúncio `outro` fica fora. O servidor aceita só as praças de `PRACAS_CONTADOR` (`schema/pedido-regras.mjs`) e grava o resto como `outro`, de propósito (lista fechada): é para lá que vão a visita de quem chega por link de demonstração ou do rodapé (`utm_campaign=demo-v1` ou `rodape-v1`, `utm_content=<nicho>`), por ctrl+clique ou clique do meio, ou pela demo aberta direto, junto com todo tráfego desconhecido. Quem volta à home pelo "Quero um assim" de uma demo com a origem do anúncio guardada conta a `previa` na praça e no anúncio de origem, mas a `visita` dessa segunda carga fica com a campanha da demo (`outro`), para a mesma pessoa não entrar duas vezes no denominador. A trava é a regra de leitura, não a página: não dá para ler `utm_source` no contador, que guarda só praça e anúncio.

**Como ler.** Por anúncio (R7, R9, F1) e por praça, a cadeia `visita` > `ficou_10s` > `rolou` > `tocou_nome` > `digitou_nome` > `previa`; à parte, `visita` > `tocou_exemplo`. Decida só com a amostra mínima definida antes (por exemplo 100 visitas por criativo). Onde a cadeia despenca diz onde está a perda: antes de 10 s é criativo ou público; fica e não toca no campo é a primeira tela; toca e não digita é o campo.
- A ordem esperada: `ficou_10s` <= `visita` e `digitou_nome` <= `tocou_nome`. Qualquer um consegue inflar os eventos dentro do teto; degrau que quebra a ordem é suspeito e não decide nada.
- `tocou_nome` zero com `ficou_10s` alto: trate como suspeita de defeito no navegador de dentro do Instagram (o campo não recebe toque), não como desinteresse. Hoje é a única forma de saber sem aparelho real.
- Se a mudança da primeira tela sair antes destes eventos, o teste decide só por `previa` / `visita`.
- O 204 da função é igual para tudo e não prova que um evento grava: a prova é a linha em `ContadorDia` no dia seguinte.

## Origem e praça
- **Primeiro toque**: `utm_source`, `utm_medium`, `utm_campaign` e `utm_content` (só `[A-Za-z0-9._-]`, até 64 caracteres) vão para `localStorage creat:origem:v1` com validade de 30 dias. Um toque novo não sobrescreve enquanto o primeiro vale.
- **Link por praça**: em `/abrir/`, com a inauguração valendo, o botão de pagar usa `checkout.config.js` `linksPorPraca[utm_campaign]` (feira, salvador-rms, fortaleza, recife, petrolina-juazeiro, aracaju). Sem praça guardada, praça desconhecida ou link inválido: `links.aberturaInauguracao`. Fora da inauguração: `links.aberturaPadrao`. Plano anual: hoje cobra só a Abertura, como os mensais; o anual é cobrado no dia em que o site entra no ar (decisão D3, sem combo no arquivo público). A venda aparece no painel do Mercado Pago com o nome da praça.

## Como conferir
1. Abra a home com `?utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=teste`, aceite o banner e gere a prévia: no Gerenciador de Eventos (Testar eventos) chegam PageView e ViewContent, com URL sem `#` e sem nome.
2. Toque em "Quero este site no ar": o endereço de `/abrir/` não tem `n=` nem `c=`; o botão de pagar aponta para o link da praça feira (`pref_id=2189692475-c33953d5-...`).
3. Preencha e toque em pagar: chega InitiateCheckout com `value` 297 e `currency` BRL.
4. A volta aprovada do Mercado Pago em `/obrigado/` manda Purchase com `eventID` igual ao `payment_id`; recarregar não manda outro.

## Antes de escalar o tráfego: conferência no painel da Meta (fora do repositório)
O código usa `autoConfig=false` e uma lista fechada de parâmetros, mas a **correspondência avançada automática** é ligada ou desligada no painel, não no código. Com o Pixel em `/abrir/` (onde estão os campos de e-mail, WhatsApp e endereço), confira:
1. Gerenciador de Eventos > Fontes de dados > Pixel `2223314621951948` > Configurações: **desligar** "Correspondência avançada automática" e as detecções automáticas de eventos e de botões.
2. Em Testar eventos, conferir que PageView, InitiateCheckout e Purchase chegam **sem** `em`, `ph`, `fn` nem `ct`.
3. Só depois disso publicar esta versão com o Pixel em `/abrir/`.

## O que fica no aparelho (as chaves da Creat começam com `creat:`)
| chave | onde | prazo |
|---|---|---|
| `creat:pedido:v1` | localStorage | 7 dias |
| `creat:abrir:negocio` (nome e cidade) | sessionStorage | até a aba fechar |
| `creat:origem:v1` (só utm) | localStorage | 30 dias |
| `creat:consentimento` | localStorage | 180 dias |
| `creat:px:compras` | localStorage | 30 dias por item, no máximo 30 itens |
| `creat:px:vc:<nicho>` | sessionStorage | até a aba fechar |

Toda página confere os prazos ao abrir (`limparVencidos`) e apaga o que venceu. `creat:checkout:v1` não é mais gravada e some de quem já tinha. "Esquecer meus dados neste aparelho" (`esquecerTudo`) apaga todas as chaves `creat:` dos dois armazenamentos, as do site de exemplo (abaixo) e os cookies `_fbp` e `_fbc`, e recarrega a página.

**Site de exemplo (pacote A, 11/11/2026).** O motor das demonstrações, aberto dentro do `#previa` na mesma origem, grava `site:demo-<nicho>:som` (`off`, o som começa desligado) e, no salão, `creat-pele` (o tom de pele do ritual, de 0 a 3). Nenhuma identifica pessoa. A home anota as chaves dessas famílias que já existiam ao abrir o exemplo e, ao fechar o diálogo ou sair da página, apaga as que o exemplo criou (`limparChavesDoExemplo`); o "Esquecer" apaga as duas famílias. A prévia com nome grava `creat-pele` no salão (desde antes) e não é limpa ao fechar. A política de privacidade em vigor (Versão 4) não cita essas duas chaves: a Versão 5 decide se as lista (Muralha e Verbo).
