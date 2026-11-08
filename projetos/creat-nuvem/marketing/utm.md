# UTM · Porta Aberta

Verbo (T3), 08/11/2026. Seção 12 do briefing. Uma régua só, para todo link que traz alguém para a home.

## Os valores permitidos

| parâmetro | valores | para quê |
|---|---|---|
| `utm_source` | `meta` · `instagram` · `whatsapp` · `indicacao` · `parceiro` · `bastidores` · `rodape` | de onde veio |
| `utm_medium` | `pago` · `organico` · `ref` | se foi mídia paga, orgânico ou indicação |
| `utm_campaign` | `cal-nov26` (calibragem 16 a 22/11) · `ctwa-jan27` · `saudacao` · `ausencia` · `r1` · `r14` · `bio` · `indica-v1` · `rodape-v1` · outros no mesmo formato | qual ação |
| `utm_content` | código do anúncio ou peça, por exemplo `A1-barbearia-v1` | qual criativo |
| `utm_term` | não usado na Fase 1 | |

Formato (contrato do T1, `docs/ARQUITETURA.md` item c): cada valor com 1 a 64 caracteres de `A-Z a-z 0-9 . _ -`. Sem acento, sem espaço, sem maiúscula por padrão. Valor fora disso é descartado pela página sem erro.

**Nunca** pôr dado pessoal em UTM: nome do negócio, nome de pessoa, telefone, e-mail ou cidade. As UTMs vão para o analytics; o nome do negócio não pode ir (regra dura 3 e item j da arquitetura).

## Código do `utm_content`

`<ângulo><número do texto>-<nicho>-v<versão>`

- ângulo: `A` prévia · `B` sem amarra · `C` a equipe · `D` antes do Natal · `E` site grátis do Google · `W` Click-to-WhatsApp
- número do texto: 1, 2 ou 3 (o texto principal usado)
- nicho: `barbearia` · `salao` · `academia` · `geral`
- versão: sobe quando o texto ou o vídeo mudam (`v1`, `v2`...)

Exemplos: `A1-barbearia-v1`, `B1-salao-v1`, `C1-barbearia-v1`, `W2-geral-v1`.

## Links prontos

`{{site.url}}` é o endereço da home publicada.

| uso | link |
|---|---|
| Anúncio da calibragem, criativo 1 | `{{site.url}}/?nicho=barbearia&utm_source=meta&utm_medium=pago&utm_campaign=cal-nov26&utm_content=A1-barbearia-v1` |
| Anúncio da calibragem, criativo 2 | `{{site.url}}/?nicho=salao&utm_source=meta&utm_medium=pago&utm_campaign=cal-nov26&utm_content=B1-salao-v1` |
| Anúncio da calibragem, criativo 3 | `{{site.url}}/?nicho=barbearia&utm_source=meta&utm_medium=pago&utm_campaign=cal-nov26&utm_content=C1-barbearia-v1` |
| Link enviado no Click-to-WhatsApp (janeiro) | `{{site.url}}/?nicho=<nicho>&utm_source=meta&utm_medium=pago&utm_campaign=ctwa-jan27&utm_content=W1-<nicho>-v1` |
| Saudação do WhatsApp | `{{site.url}}/?utm_source=whatsapp&utm_medium=organico&utm_campaign=saudacao` |
| Ausência do WhatsApp | `{{site.url}}/?utm_source=whatsapp&utm_medium=organico&utm_campaign=ausencia` |
| Resposta rápida R1 | `{{site.url}}/?utm_source=whatsapp&utm_medium=organico&utm_campaign=r1` |
| Bio do Instagram da Creat | `{{site.url}}/?utm_source=instagram&utm_medium=organico&utm_campaign=bio` |
| Post orgânico com vídeo | `{{site.url}}/?utm_source=instagram&utm_medium=organico&utm_campaign=post&utm_content=R1-barbearia-v1` |
| Indicação de cliente (R13) | `{{site.url}}/?utm_source=indicacao&utm_medium=ref&utm_campaign=indica-v1&utm_content=<id do pedido, PA-XXXXXXXX>` |
| Parceiro (fase 3) | `{{site.url}}/?utm_source=parceiro&utm_medium=ref&utm_campaign=parceiro-v1&utm_content=<código do parceiro, sem nome>` |
| Botão "voltar para o Porta Aberta" em /bastidores/ | `{{site.url}}/?utm_source=bastidores&utm_medium=ref&utm_campaign=bastidores-v1` |
| Rodapé "Aberto pela Creat · veja o seu" de cada site entregue | `{{site.url}}/?utm_source=rodape&utm_medium=ref&utm_campaign=rodape-v1&utm_content=<nicho>` |

Sobre o rodapé: o briefing (7.2) fala em "UTM origem=rodape". Padronizei como `utm_source=rodape` para caber na mesma régua. O `utm_content` leva só o nicho, nunca o slug do cliente, porque o slug é o nome do negócio.

Sobre a indicação: o `utm_content` leva o id curto do pedido de quem indicou (`PA-` + 8 caracteres, sem dado pessoal). É assim que o Marcos sabe a quem dar o mês grátis do R13.

## Como a UTM chega até o PEDIDO v1

1. O visitante chega na home com `?nicho=...&utm_*=...` na query string. A query só carrega `nicho` e `utm_*`, nunca dado pessoal.
2. A home copia `nicho` e `utm_*` para o fragmento (`#k=...&utm_source=...`) quando a placa vira, e a prévia guarda no fragmento.
3. "Quero este site no ar" leva o fragmento para `/abrir/#plano=...&k=...&...&utm_*`.
4. `/abrir/` grava as UTMs junto com os campos em `localStorage['creat:pedido:v1']`.
5. `/obrigado/` monta a linha `origem` do PEDIDO v1: `origem: utm_source=meta;utm_medium=pago;utm_campaign=cal-nov26;utm_content=A1-barbearia-v1`. Sem UTM, a linha fica `origem: direto`.
6. O Marcos cola o PEDIDO v1 no `produzir.mjs`, e a origem fica registrada no pedido. Assim cada venda paga é ligada ao anúncio que a trouxe.

## Conferência rápida antes de publicar um link

- Abriu o link num celular e a home carregou com o nicho certo?
- A URL depois de virar a placa tem as UTMs no `#`, não depois do `?`?
- Nenhum valor tem acento, espaço ou nome de pessoa?
