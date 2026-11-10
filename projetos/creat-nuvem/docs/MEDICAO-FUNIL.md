# Medição do funil (Pixel da Meta) · Porta Aberta

Atualizado em 10/11/2026 · código em `assets/vitrine.js` · testes em `scripts/testes/funil.test.mjs`

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

## O que fica no aparelho (todas as chaves começam com `creat:`)
| chave | onde | prazo |
|---|---|---|
| `creat:pedido:v1` | localStorage | 7 dias |
| `creat:abrir:negocio` (nome e cidade) | sessionStorage | até a aba fechar |
| `creat:origem:v1` (só utm) | localStorage | 30 dias |
| `creat:consentimento` | localStorage | 180 dias |
| `creat:px:compras` | localStorage | 30 dias por item, no máximo 30 itens |
| `creat:px:vc:<nicho>` | sessionStorage | até a aba fechar |

Toda página confere os prazos ao abrir (`limparVencidos`) e apaga o que venceu. `creat:checkout:v1` não é mais gravada e some de quem já tinha. "Esquecer meus dados neste aparelho" (`esquecerTudo`) apaga todas as chaves `creat:` dos dois armazenamentos e os cookies `_fbp` e `_fbc`, e recarrega a página.
