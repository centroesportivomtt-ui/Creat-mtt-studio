# Medição do funil (Pixel da Meta) · Porta Aberta

Atualizado em 10/11/2026 · código em `assets/vitrine.js` · testes em `scripts/testes/funil.test.mjs`

## Regras
1. **Consentimento**: a regra é a mesma de antes. O Pixel (e o Clarity) só carregam depois do "Aceitar" no banner da home. `/abrir/` e `/obrigado/` não têm banner: usam a escolha gravada neste aparelho (`creat:consentimento`, versão 1). Sem escolha ou com "Recusar", nenhum script de terceiro carrega e nenhum evento sai.
2. **Endereço limpo antes de medir**: a primeira coisa que a página faz (`limparEndereco`, antes de qualquer script de medição) é ler nome, cidade, nicho, plano e `utm_*` do `#` e reescrever o endereço com `history.replaceState`. Na home o `#` some inteiro; em `/abrir/` fica só `plano`, `k` (nicho), `p` (paleta) e `utm_*`. Em `/obrigado/` saem também os parâmetros da volta do Mercado Pago (`payment_id`, `collection_*`, `status`, `preference_id`, `external_reference` e afins). Assim o `dl` do Pixel nunca leva nome nem cidade.
3. **Sem dado pessoal em evento**: cada evento tem uma lista fechada de parâmetros (`filtrarPixel`). Nada de nome, telefone, e-mail ou cidade. Parâmetro fora da lista é descartado; parâmetro obrigatório faltando cancela o evento.
4. **Sem duplicar em recarga**: PageView é um por carga de página (é o que ele mede). Os outros eventos nascem de ação, não de carga, e ainda têm trava própria (tabela).

## Eventos

| evento | onde dispara | parâmetros | trava contra duplicidade |
|---|---|---|---|
| PageView | home, `/abrir/`, `/obrigado/`, ao carregar o Pixel (logo após o "Aceitar" ou ao abrir a página com o aceite já gravado) | nenhum | um por carga de página |
| ViewContent | home, quando a prévia é gerada (placa virada ou botão "Abrir meu negócio") | `content_category` = nicho (`barbearia`, `salao`, `academia`); `content_name` = `previa` | um por nicho por sessão do navegador (`sessionStorage creat:px:vc:<nicho>`) |
| InitiateCheckout | `/abrir/`, no clique em "Pagar no Pix", "Cartão em até 2x" ou no botão fixo do rodapé, depois de o formulário passar na validação | `value` = total cobrado hoje pelo link escolhido (Abertura, ou Abertura + anual no combo); `currency` = `BRL` | um por carga da página |
| Purchase | `/obrigado/`, só se a volta do Mercado Pago trouxer `collection_status=approved` ou `status=approved` **e** `payment_id` numérico | `value` = valor do link pago (pela `preference_id` da volta; sem ela, o valor do botão clicado neste aparelho nos últimos 7 dias); `currency` = `BRL`; `eventID` = `payment_id` | uma vez por `payment_id` (`localStorage creat:px:compras`, últimos 30). Sem valor conhecido ou sem consentimento, não sai e não marca |

O `InitiateCheckout` saiu da home (antes disparava no clique em "Quero este site no ar", antes de a pessoa ver o preço).

## Origem e praça
- **Primeiro toque**: `utm_source`, `utm_medium`, `utm_campaign` e `utm_content` (só `[A-Za-z0-9._-]`, até 64 caracteres) vão para `localStorage creat:origem:v1` com validade de 30 dias. Um toque novo não sobrescreve enquanto o primeiro vale.
- **Link por praça**: em `/abrir/`, com a inauguração valendo, o botão de pagar usa `checkout.config.js` `linksPorPraca[utm_campaign]` (feira, salvador-rms, fortaleza, recife, petrolina-juazeiro, aracaju). Sem praça guardada, praça desconhecida ou link inválido: `links.aberturaInauguracao`. Fora da inauguração: `links.aberturaPadrao`. Plano anual com inauguração: o combo (`combosAnual`) só quando o total da tela é igual ao valor do link. A venda aparece no painel do Mercado Pago com o nome da praça.

## Como conferir
1. Abra a home com `?utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=teste`, aceite o banner e gere a prévia: no Gerenciador de Eventos (Testar eventos) chegam PageView e ViewContent, com URL sem `#` e sem nome.
2. Toque em "Quero este site no ar": o endereço de `/abrir/` não tem `n=` nem `c=`; o botão de pagar aponta para o link da praça feira (`pref_id=2189692475-c33953d5-...`).
3. Preencha e toque em pagar: chega InitiateCheckout com `value` 297 e `currency` BRL.
4. A volta aprovada do Mercado Pago em `/obrigado/` manda Purchase com `eventID` igual ao `payment_id`; recarregar não manda outro.
