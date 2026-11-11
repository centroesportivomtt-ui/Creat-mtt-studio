# conteudo/ · chaves para o Pixel

Verbo (T3), 08/11/2026. Todo texto público do Porta Aberta mora aqui. O HTML não escreve texto solto: lê destes arquivos (ou copia deles no build, se for mais simples).

## Arquivos

| arquivo | página | observação |
|---|---|---|
| `home.json` | `/` | seções 1 a 10 da 5.1, na ordem: `seo`, `barra`, `hero`, `previa`, `testeDeVerdade`, `comoFunciona`, `precos`, `sede`, `prova`, `perguntas`, `chamadaFinal`, `rodape` |
| `faq.json` | `/` seção 9 | `itens[]` com `id`, `pergunta`, `resposta`; 14 perguntas, as 10 do briefing primeiro |
| `abrir.json` | `/abrir/` | plano, total, 5 campos, aceite, pagamento, `pagar.recebedor`, `pagar.parcelas` e `pagar.aviso_dados` (linhas coladas no botão Pagar), garantia com `garantia.regra`, "o que acontece depois", erros dos campos |
| `obrigado.json` | `/obrigado/` | não afirma pagamento pela URL; `estados.{aprovado,a_conferir,conferencia_longa,recusado,pendente,sem_retorno,assinatura_ok,assinatura_cancelada,anual_pago,teste_ok,produto_fora}.{titulo,texto,botao}`, `recibo.*`, `wa.*`, `rascunho.*` (o canal do link do site pronto mora só em `rascunho.canais`), `recebedor`, `desistir`; o PEDIDO v1 é montado por código |
| `bastidores.json` | `/bastidores/` | `aviso` é a primeira linha visível, antes do preço |
| `termos.md` | `/termos/` | primeira linha `REVISAO_JURIDICA_PENDENTE`; mostrar a linha na página até o Marcos aprovar |
| `privacidade.md` | `/privacidade/` | idem. Versão 4 (11/11/2026): compra curta (quem cuida do negócio, endereço e horário opcionais antes do pagamento e mandados depois pelo suporte, gravados no pedido pela equipe) e mensagem do suporte ao comprador pago, só sobre o pedido. Só sobe no mesmo ato da página /abrir/ da compra curta. A versão 3 (10/11/2026) descreveu o registro do pedido no toque em Pagar (pacote 2A). O antigo rascunho `privacidade-v3.md` foi incorporado aqui e apagado: não rode o `git mv` citado em `docs/PEDIDO-API.md`, seção 10, item 8 |
| `comum.json` | várias | banner de consentimento, `pagina404`, runtime da prévia, mensagens de WhatsApp da vitrine, lista de espera, erros gerais, estados vazios, carregamento, rótulos de ações |
| `nichos/barbearia.json`, `nichos/salao.json`, `nichos/academia.json` | presets do motor | `bordao`, `pagina`, `servicos`, `agendamento.mensagem`, `textos` (só chaves da lista branca do schema), `paletas` com nome, `funcionamentoSugerido`, `ritualTextos` |

Chaves que começam com `_` são notas para quem implementa; não vão para a tela.

## Regra única de prazo

A mesma frase, sem mudar uma vírgula, em `home.json` (`precos.abertura.regraPrazo`), `faq.json` (`prazo`), `abrir.json` (`garantia.regra`), `obrigado.json` (`relogio.texto`), `termos.md` (cláusula 5) e `marketing/whatsapp-scripts.md` (R3, F5 e ausência):

> O prazo de {{precos.prazoHoras}} h conta da confirmação do pagamento. Confirmamos pagamentos de segunda a sábado, das 9h às 19h, em até 2 horas. Pagou fora desse horário? A confirmação sai até as 11h do próximo dia de atendimento (segunda a sábado).

Termos na versão 2 (`termos-v2`), sha256 de `termos.md` = `7ae67e835b8d745b00eb49dc9167bf43f8b50688123393d217cdefc6eb3fb612` (10/11/2026, segunda rodada do 2B, sem o aceite por silêncio). O ar ainda serve a versão 1 (`44bbc0ef...`). Mudou o texto de `termos.md`: a versão e o sha256 em `checkout.config.js` (`termosVersao`) e em `schema/pedido-regras.mjs` (`TERMOS`, e o mesmo em `regras.js` do app) mudam no mesmo ato, e `abrir.json` `aceite.texto` diz "versão 2". Ordem do ato: (1) acrescentar `termos-v2` com este sha em `TERMOS`, mantendo `termos-v1`, e publicar a função; (2) trocar `termosVersao` para `termos-v2`; (3) publicar a vitrine. Depois: `curl -s <site>/conteudo/termos.md | sha256sum` igual ao sha acima e um registro de teste com `termos-v2` aceito. Qualquer vírgula mudada em `termos.md` depois disso pede sha novo.

## Textos guardados: ainda não publicar

Aceite por silêncio do site pronto. Hoje o passo (l) de `docs/EXECUTOR.md` não roda: sem resposta em 7 dias, o pedido só gera um aviso ao suporte, e nada vai ao ar. Por isso nenhum texto público promete isso. As frases abaixo só entram no mesmo ato em que o diretor ligar o passo (l), o ensaio provar `marcarPedido` de `rascunho_enviado` para `no_ar` depois de 7 dias, e a revisão jurídica da cobrança que nasce do silêncio for aprovada. Entrar com elas muda `termos.md`, então pede versão e sha novos (`termos-v3`).

| onde | hoje | quando o passo (l) ligar |
|---|---|---|
| `termos.md`, cláusula 5, "Aprovação." | O site só entra no ar com o seu sim, e a mensalidade só começa nesse dia. | Se você não responder em 7 dias, o site entra no ar como está e a mensalidade começa nesse dia. Você pode pedir ajustes depois. |
| `obrigado.json` `rascunho.aviso` | O site só entra no ar com o seu sim. A mensalidade começa nesse dia. | Se você não responder em 7 dias, o site entra no ar como está e a mensalidade começa nesse dia. Você pode pedir ajustes depois. |
| `abrir.json` `depois.passos[5]` | O site entra no ar com o seu sim. A mensalidade começa neste dia. | acrescentar: Sem resposta em 7 dias, ele entra no ar como está. |
| `home.json` `comoFunciona.passos[3].texto` e `quemMonta.passos[2].texto` | sem a frase | acrescentar: Sem resposta em 7 dias, ele entra no ar como está. |
| `marketing/whatsapp-scripts.md`, R7 e R7b | silêncio não aprova; R7b lembra uma vez | voltar a frase dos 7 dias ao R7 e trocar o R7b por um aviso de que o site entra no ar no dia seguinte |

## Frases marcadas para revisão na onda 4

- `privacidade.md`, seção 1 e seção 7: Google Fonts. Sai quando o pacote 4A hospedar as letras no próprio site.
- `privacidade.md`, seção 1: "Nas outras páginas (termos, privacidade, bastidores, prévia e sede), ela ainda pode gravá-los". Sai quando essas páginas ganharem a meta `base44-visitor-tracking` com consentimento.

## Dois tipos de marcador

**`{{caminho}}`: dado de `dados/*.json`, preenchido pela vitrine.** Números de preço, prazo e vagas nunca aparecem escritos no texto.

| marcador | fonte | valor de referência (08/11/2026) |
|---|---|---|
| `{{precos.prazoHoras}}` | `precos.json` `prazoHoras` | 72 |
| `{{precos.abertura.padrao}}` | `abertura.padrao` | 497 |
| `{{precos.abertura.inauguracao.preco}}` | `abertura.inauguracao.preco` | 297 |
| `{{precos.abertura.inauguracao.vagasTotal}}` | `abertura.inauguracao.vagasTotal` | 20 |
| `{{precos.abertura.inauguracao.vagasRestantes}}` | `abertura.inauguracao.vagasRestantes` | 20 |
| `{{precos.abertura.atual}}` | derivado: inauguração se ela vale (ADR-003), senão padrão | 297 ou 497 |
| `{{precos.planos.aberto}}` | `planos.aberto` | 147 |
| `{{precos.planos.vitrine}}` | `planos.vitrine` | 297 |
| `{{precos.anualMesesPagos}}` | `anualMesesPagos` | 10 |
| `{{precos.anual.aberto}}` | derivado: `planos.aberto × anualMesesPagos` | 1.470 |
| `{{precos.anual.vitrine}}` | derivado: `planos.vitrine × anualMesesPagos` | 2.970 |
| `{{vagas.vagas_hoje}}` | `vagas.json` `vagas_hoje` | 3 |
| `{{vagas.capacidade_dia}}` | `vagas.json` `capacidade_dia` | 3 |
| `{{plano.preco}}` | `/abrir/`: preço do plano escolhido (mensal ou anual) | |
| `{{precos.bastidores}}` | **chave nova** a acrescentar em `precos.json` e em `CREAT_CHECKOUT.precosPadrao` (T5) | 67 |
| `{{contato.email}}` | e-mail de suporte (o mesmo da loja) | mttcreatt@gmail.com |
| `{{site.url}}` | só em `marketing/`: endereço da home publicada | a definir no deploy |
| `{{empresa.razao}}`, `{{empresa.documento}}`, `{{empresa.endereco}}` | nome empresarial (só em `termos.md` e `privacidade.md`), CNPJ e endereço da creat.MTT Studio, os mesmos de creatmtt.com.br | preenchido em 10/11/2026; antes era **o Marcos informa** (Decreto 7.962/2013 pede na página) |

Formato dos números: inteiro com ponto de milhar (`1.470`), sem "R$" (o texto já traz "R$ "). Horas sem "h" (o texto já traz).

**`{x}`: valor de tempo de execução, preenchido pela página ou pelo motor.** `{negocio}` (nome digitado), `{nicho}` (rótulo do nicho), `{dia}`, `{hora}`, `{servico}`, `{id}` (id do pedido), `{plano}`, `{n}` (contagem). Nos presets, só os marcadores aceitos pelo `schema/tenant.schema.json`: `{nome}` (nome do cliente final, como no Fio no Couro), `{cidade}`, `{dia}`, `{hora}`, `{servico}`, `{profissional}`. Exceção: `pagina.titulo`, `pagina.tituloSemCidade` e `pagina.descricao` dos presets usam `{negocio}` e `{cidade}` e são resolvidos **na montagem do tenant** (prévia e `produzir.mjs`), antes de chegar ao motor. Sem cidade, ou se o título com cidade passar de 70 caracteres, use `tituloSemCidade` e retire " em {cidade}" da descrição.

Inserir sempre com `textContent`. Nenhum destes textos precisa de HTML.

## Exibição condicional (regra dura 2, ADR-003)

| chave | só aparece quando |
|---|---|
| `home.precos.abertura.precoInauguracao`, `deInauguracao`, `seloInauguracao`, `contadorInauguracao` | `precos.json` fresco (até 48 h), `inauguracao.ativa`, `vagasRestantes > 0`. Com `vagasRestantes = 1`, use `contadorUltima` |
| `home.precos.abertura.precoPadrao` | em todos os outros casos |
| `home.precos.vagasHoje` | `vagas.json` fresco e `vagas_hoje > 0` |
| `home.precos.vagasHojeEsgotadas` | `vagas.json` fresco e `vagas_hoje = 0` |
| `abrir.total.inauguracao` | mesma regra da inauguração |
| `abrir.total.mensal` / `anual` | conforme `#plano=` (anual = `aberto_anual` ou `vitrine_anual`) |
| `home.prova` | `depoimentos.json` com pelo menos 1 item com `autorizadoEm`; senão a seção some inteira |
| `home.sede.legendaDemonstracao` | sempre que a sede estiver em `?modo=demo` |
| `comum.listaEspera` | `nichos.json` presente; senão os chips "avise-me" somem |

Dado velho ou ausente: nenhuma mensagem de erro sobre preço; a página só mostra o padrão.

## A palavra "agenda"

Proibida em todo texto público, com duas exceções do próprio briefing, que falam da ferramenta que o cliente **já usa** (nunca do nosso produto):

- `home.precos.agendaExterna.titulo`: "Já tem agenda (Trinks, Booksy...)? O botão do seu site pode apontar para ela."
- `faq.itens[id=app-de-horarios].pergunta`: "E se eu já uso agenda?"

O `checar.cjs` (T5) precisa ter essas duas strings numa lista de permissão. Trinks e Booksy aparecem só nessas duas chaves e na resposta `app-de-horarios`, como exemplo de ferramenta, com a nota de que a Creat não tem vínculo.

## Botões e WhatsApp

- Botões dizem o que acontece. Não troque por "Clique aqui".
- `comum.whatsapp.*` e `comum.listaEspera.nichos.*.mensagem` vão em `wa.me/<whatsappSuporte>?text=` com `encodeURIComponent`. Nunca acrescente o WhatsApp, e-mail ou endereço do visitante a essas mensagens.
- `home.testeDeVerdade.mensagem` vai em `wa.me/<número digitado>?text=`; o número não é gravado.
- Os presets dos 3 nichos trazem "o dono confirma pelo WhatsApp" em `pedidoNota` e `confirmacaoTexto` (o `validar-tenant.mjs` confere a frase).

## Limites conferidos

Os presets respeitam os limites do `schema/tenant.schema.json`: `bordao` até 90, `pagina.titulo` até 70 (com nome de 40 letras), `pagina.descricao` até 160, `servicos[].nome` até 50 e `descricao` até 140, textos curtos até 60, médios até 200, `manifesto` até 600, `faq` até 8 itens (pergunta até 120, resposta até 400), `agendamento.mensagem` até 400. SEO da home: `<title>` até 60 e descrição até 155. Conferência em `docs/relatorio/T3.md`.
