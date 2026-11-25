# UTM · Porta Aberta

Verbo (T3), 08/11/2026. Seção 12 do briefing. Uma régua só, para todo link que traz alguém para a home.
Revisado por Trilho em 10/11/2026 (pacote 1F, achados CH-08 e AN-11): links reais dos 6 anúncios no ar, `utm_medium=pago` em todo lugar, `utm_campaign` por praça e `utm_term` com o posicionamento.

## Os valores permitidos

| parâmetro | valores | para quê |
|---|---|---|
| `utm_source` | `meta` · `instagram` · `whatsapp` · `indicacao` · `parceiro` · `bastidores` · `rodape` | de onde veio |
| `utm_medium` | `pago` · `organico` · `ref` | se foi mídia paga, orgânico ou indicação |
| `utm_campaign` | **anúncio de site: o slug da praça** `feira` · `salvador-rms` (e `fortaleza`, `recife`, `petrolina-juazeiro`, `aracaju` quando abrirem; é o que escolhe o link de pagamento da praça) · histórico: `cal-nov26` (calibragem, virou `feira` em 10/11) e `ctwa-nov26` (Click-to-WhatsApp, pausada em 09/11) · `rt-nov26` (retargeting) · `fechamento` (fluxo F1 a F5 fora de anúncio) · `ctwa-jan27` · `saudacao` · `ausencia` · `r1` · `r14` · `bio` · `indica-v1` · `rodape-v1` · outros no mesmo formato | qual ação |
| `utm_content` | código do anúncio ou peça, por exemplo `A1-barbearia-v1` | qual criativo |
| `utm_term` | `{{placement}}` nos **próximos** anúncios (a Meta troca pelo posicionamento, por exemplo Instagram Reels, Stories ou Feed) | em qual tela o clique nasceu |

Contrato de nomes no Gerenciador (revisto em 10/11/2026, substitui o de `trafego/campanha-meta.md` §9):
- Nome da campanha na Meta: `PA | Site | <praça por extenso>` (hoje `PA | Site | Feira` e `PA | Site | Salvador RMS`). O `utm_campaign` é o **slug** da praça (`feira`, `salvador-rms`), não o nome da campanha. A tabela "Anúncios no ar" abaixo liga um ao outro.
- Nome do anúncio na Meta: `<utm_content> · <slug da praça>` (por exemplo `A1-barbearia-v1 · feira`). O `utm_content` é só o código do anúncio.
- `utm_medium` é sempre `pago` em mídia paga, inclusive na conferência no ar (`scripts/conferir-no-ar.cjs`). Nunca `cpc`.

Formato (contrato do T1, `docs/ARQUITETURA.md` item c): cada valor com 1 a 64 caracteres de `A-Z a-z 0-9 . _ -`. Sem acento, sem espaço, sem maiúscula por padrão. Valor fora disso é descartado pela página sem erro.

**Nunca** pôr dado pessoal em UTM: nome do negócio, nome de pessoa, telefone, e-mail ou cidade. As UTMs vão para o analytics; o nome do negócio não pode ir (regra dura 3 e item j da arquitetura).

## Código do `utm_content`

`<ângulo><número do texto>-<nicho>-v<versão>`

- ângulo: `A` prévia · `B` sem amarra · `C` a equipe · `D` antes do Natal · `E` site grátis do Google · `W` Click-to-WhatsApp (`W0` = conversa de anúncio sem código identificado) · `F` dor em cena · `T` teste do pedido · `V` retargeting (os três últimos desde 09/11/2026, em `trafego/anuncios-meta.md`)
- número do texto: 1, 2 ou 3 em `anuncios.md`; 4 e 5 nos textos novos dos ângulos A e C em `trafego/anuncios-meta.md`; `F0` é o Reel de dor que já rodou na conta (CPC de cerca de R$ 0,22), reaproveitado com o botão Enviar mensagem (`trafego/campanha-meta.md` §11, desde 09/11/2026)
- nicho: `barbearia` · `salao` · `academia` · `geral`
- versão: sobe quando o texto ou o vídeo mudam (`v1`, `v2`...)

Exemplos: `A1-barbearia-v1`, `B1-salao-v1`, `C1-barbearia-v1`, `W2-geral-v1`.

Valores de `utm_content` em uso nos anúncios de site (decisão de 10/11/2026, fim da contradição com `trafego/EXPANSAO.md`): `A1-barbearia-v1`, `A1-salao-v1`, `B1-salao-v1`. O vídeo, quando entrar (ato 2, depois de 30/11), usa `video-barbearia-v1` e `video-salao-v1`. Não se usa mais `dor`, `prova` nem `oferta` como `utm_content`: o ângulo já está no código. Todo código novo entra também em `ANUNCIOS` de `schema/pedido-regras.mjs` antes de o anúncio subir, senão o contador próprio o conta como `outro`.

## Anúncios no ar (lidos na Meta em 10/11/2026)

Leitura pelo MCP oficial da Meta, só leitura: `ads_get_ad_entities` (nível anúncio, `creative_id`, estado) e `ads_get_ad_preview` de cada criativo, com o destino lido no `href` da prévia do Stories. A API devolve `link_url` vazio porque o criativo usa feed de recursos com 2 imagens; a prévia mostra a URL final, já com os parâmetros. Os 6 estão `ACTIVE` e as 6 URLs seguem o padrão. Nenhum precisou de correção.

| campanha | anúncio | id do anúncio | criativo | URL completa |
|---|---|---|---|---|
| `PA \| Site \| Feira` | `A1-barbearia-v1 · feira` | 120254151686550237 | 1801544234466330 | `https://creat-nuvem-404b1994.base44.app/?nicho=barbearia&utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=A1-barbearia-v1` |
| `PA \| Site \| Feira` | `A1-salao-v1 · feira` | 120254151686810237 | 1484300866968837 | `https://creat-nuvem-404b1994.base44.app/?nicho=salao&utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=A1-salao-v1` |
| `PA \| Site \| Feira` | `B1-salao-v1 · feira` | 120254151686970237 | 2234756560727787 | `https://creat-nuvem-404b1994.base44.app/?nicho=salao&utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=B1-salao-v1` |
| `PA \| Site \| Salvador RMS` | `A1-barbearia-v1 · salvador-rms` | 120254151687230237 | 1481962513995987 | `https://creat-nuvem-404b1994.base44.app/?nicho=barbearia&utm_source=meta&utm_medium=pago&utm_campaign=salvador-rms&utm_content=A1-barbearia-v1` |
| `PA \| Site \| Salvador RMS` | `A1-salao-v1 · salvador-rms` | 120254151687430237 | 1510153400992556 | `https://creat-nuvem-404b1994.base44.app/?nicho=salao&utm_source=meta&utm_medium=pago&utm_campaign=salvador-rms&utm_content=A1-salao-v1` |
| `PA \| Site \| Salvador RMS` | `B1-salao-v1 · salvador-rms` | 120254151687710237 | 2151571608773090 | `https://creat-nuvem-404b1994.base44.app/?nicho=salao&utm_source=meta&utm_medium=pago&utm_campaign=salvador-rms&utm_content=B1-salao-v1` |

Limite da leitura: a prévia mostra a URL final. Ela não separa o que está em "URL do site" do que está em "Parâmetros de URL" no Gerenciador. O que importa para a chegada é a URL final, e ela está certa nos 6. Os anúncios no ar **não** têm `utm_term`: o posicionamento só entra nos próximos (abaixo). Nenhum anúncio no ar foi editado.

Quem troca a página troca o link do anúncio no mesmo ato (regra 7 do dono). Quando o endereço mudar (domínio próprio, decisão D7), esta tabela é refeita com a leitura nova antes e depois da troca.

## Padrão dos próximos anúncios (ato de 13/11 em diante)

- URL do site: `https://creat-nuvem-404b1994.base44.app/` (ou o domínio próprio, se a D7 já estiver no ar e conferida).
- Parâmetros de URL, num campo só: `nicho=<barbearia|salao>&utm_source=meta&utm_medium=pago&utm_campaign=<slug da praça>&utm_content=<código do anúncio>&utm_term={{placement}}`.
- Antes de subir: validação tripla (idioma, moeda e link) e abrir a URL final no celular. Depois de subir: ler de novo pela prévia e atualizar a tabela acima.

## Links prontos

`{{site.url}}` é o endereço da home publicada.

| uso | link |
|---|---|
| Anúncio de site, praça Feira (próximos anúncios) | `{{site.url}}/?nicho=barbearia&utm_source=meta&utm_medium=pago&utm_campaign=feira&utm_content=A1-barbearia-v1&utm_term={{placement}}` |
| Anúncio de site, praça Salvador RMS (próximos anúncios) | `{{site.url}}/?nicho=salao&utm_source=meta&utm_medium=pago&utm_campaign=salvador-rms&utm_content=B1-salao-v1&utm_term={{placement}}` |
| Vídeo no Reels (ato 2, depois de 30/11) | `{{site.url}}/?nicho=<barbearia\|salao>&utm_source=meta&utm_medium=pago&utm_campaign=<slug da praça>&utm_content=video-<nicho>-v1&utm_term={{placement}}` |
| Link enviado no Click-to-WhatsApp (novembro, F3; configuração em `trafego/campanha-meta.md`) | `{{site.url}}/?nicho=<nicho>&utm_source=meta&utm_medium=pago&utm_campaign=ctwa-nov26&utm_content=<código do anúncio>` |
| Link enviado no Click-to-WhatsApp (janeiro) | `{{site.url}}/?nicho=<nicho>&utm_source=meta&utm_medium=pago&utm_campaign=ctwa-jan27&utm_content=W1-<nicho>-v1` |
| Saudação do WhatsApp | `{{site.url}}/?utm_source=whatsapp&utm_medium=organico&utm_campaign=saudacao` |
| Ausência do WhatsApp | `{{site.url}}/?utm_source=whatsapp&utm_medium=organico&utm_campaign=ausencia` |
| Resposta rápida R1 | `{{site.url}}/?utm_source=whatsapp&utm_medium=organico&utm_campaign=r1` |
| Bio do Instagram da Creat | `{{site.url}}/?utm_source=instagram&utm_medium=organico&utm_campaign=bio` |
| Post orgânico com vídeo | `{{site.url}}/?utm_source=instagram&utm_medium=organico&utm_campaign=post&utm_content=R1-barbearia-v1` |
| Indicação de cliente (R13) | `{{site.url}}/?utm_source=indicacao&utm_medium=ref&utm_campaign=indica-v1` (com aval da Muralha: `&utm_content=<id do pedido, PA-XXXXXXXX>`) |
| Parceiro (fase 3) | `{{site.url}}/?utm_source=parceiro&utm_medium=ref&utm_campaign=parceiro-v1&utm_content=<código do parceiro, sem nome>` |
| Botão "voltar para o Porta Aberta" em /bastidores/ | `{{site.url}}/?utm_source=bastidores&utm_medium=ref&utm_campaign=bastidores-v1` |
| Rodapé "Aberto pela Creat · veja o seu" de cada site entregue | `{{site.url}}/?utm_source=rodape&utm_medium=ref&utm_campaign=rodape-v1&utm_content=<nicho>` |

Sobre o rodapé: o briefing (7.2) fala em "UTM origem=rodape". Padronizei como `utm_source=rodape` para caber na mesma régua. O `utm_content` leva só o nicho, nunca o slug do cliente, porque o slug é o nome do negócio.

Sobre a indicação: o `utm_content` leva o id curto do pedido de quem indicou (`PA-` + 10 caracteres, sem dado pessoal). Serve para saber de onde veio a indicação. Não há recompensa prometida até o Marcos definir a regra nos termos. Uso do id no analytics pendente de aval da Muralha; até lá, o link do R13 sai sem `utm_content`.

## Como a UTM chega até o PEDIDO v1

1. O visitante chega na home com `?nicho=...&utm_*=...` na query string. A query só carrega `nicho` e `utm_*`, nunca dado pessoal.
2. A home copia `nicho` e `utm_*` para o fragmento (`#k=...&utm_source=...`) quando a placa vira, e a prévia guarda no fragmento.
3. "Quero este site no ar" leva o fragmento para `/abrir/#plano=...&k=...&...&utm_*`.
4. `/abrir/` grava as UTMs junto com os campos em `localStorage['creat:pedido:v1']`.
5. `/obrigado/` monta a linha `origem` do PEDIDO v1: `origem: utm_source=meta;utm_medium=pago;utm_campaign=feira;utm_content=A1-barbearia-v1`. Sem UTM, a linha fica `origem: direto`.
6. O Marcos cola o PEDIDO v1 no `produzir.mjs`, e a origem fica registrada no pedido. Assim cada venda paga é ligada ao anúncio que a trouxe.

## Conferência rápida antes de publicar um link

- Abriu o link num celular e a home carregou com o nicho certo?
- A URL depois de virar a placa tem as UTMs no `#`, não depois do `?`?
- Nenhum valor tem acento, espaço ou nome de pessoa?
- `utm_medium=pago`, `utm_campaign` igual ao slug da praça da campanha e `utm_content` presente em `ANUNCIOS` de `schema/pedido-regras.mjs`?
