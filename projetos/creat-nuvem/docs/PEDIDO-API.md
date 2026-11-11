# Pedido no servidor · contrato final (pacote 1A, 10/11/2026)

Este é o contrato que a onda 2 lê. Ele cobre o pedido gravado no clique de pagar, a confirmação do pagamento sem dar o pagamento a quem não pagou, o contador, a aprovação do rascunho e as funções internas do executor.

- App: Base44 "Creat Nuvem" `6aefffe66b684db9404b1994` (TanStack Start). As funções são rotas de servidor em `src/routes/api/pa/*.js`, na mesma origem do site: `https://nuvem.creatmtt.com.br/api/pa/<nome>` (endereço canônico desde 11/11/2026). O endereço antigo `https://creat-nuvem-404b1994.base44.app/api/pa/<nome>` é o mesmo app e responde igual (seção 8.10).
- Regras puras: `schema/pedido-regras.mjs` neste repositório, copiado **byte a byte** para `src/lib/pa/regras.js` no app. O revisor compara os dois `sha256sum` (seção 9).
- Corpo de `registrarPedido`: `schema/pedido.schema.json`, `$defs/PedidoRegistro`. Exemplos em `schema/exemplos/pedido.registro-v1*.json`.
- Testes: `npm test` roda `scripts/testes/pedido-api.test.mjs` (regras, casamento, ataques, prazo, contador).
- Nada aqui está publicado. As rotas só vão ao ar no próximo deploy do app, feito pelo coordenador (seção 10).

**Estado (endereço único, pacote H3, 11/11/2026):**
- Endereço canônico: `https://nuvem.creatmtt.com.br`. O antigo (`https://creat-nuvem-404b1994.base44.app`) continua no ar e as rotas `/api/pa/*` respondem igual nos dois (seção 8.10). Nenhuma rota confere `Origin`, `Referer` ou `Host`; a única trava de origem é `Sec-Fetch-Site: cross-site` (403), e a página chama sempre `location.origin + '/api/pa/'`, a mesma origem em que foi aberta.
- Regras: `VERSAO_REGRAS = 'pa-regras-1A-2026-11-11a'`. Única mudança desde a `-10f`: a lista fechada `EVENTOS` do contador passa de 4 para 9 nomes, com os 5 sinais de interesse `ficou_10s`, `rolou`, `tocou_nome`, `digitou_nome` e `tocou_exemplo` (seção 4.4). O corpo, a normalização, o teto e a conferência não mudam. O sha256 do arquivo está na seção 9.
- No app: em 11/11/2026 o sandbox `main` tem a `-10f` (sha256 `10a0465f...`, conferido por `run_command`) e `ContadorDia.evento` com enum de 4 valores (conferido por `list_entity_schemas`). A `-11a` **ainda não foi copiada**. A ordem segura da cópia está na seção 4.4 ("Para publicar os eventos de interesse"). A `-10f` anterior: checkpoint `6af3c377db3067a148bad505` (commit `f2968e7`). Volta: checkpoint `6af3c32c57d4bf26ea220951` (commit `ccd084c`).
- Termos: o servidor aceita `termos-v1` e `termos-v2` (`TERMOS` em `pedido-regras.mjs`). `termos-v2` = sha256 `7ae67e835b8d745b00eb49dc9167bf43f8b50688123393d217cdefc6eb3fb612` do `conteudo/termos.md` (commit `ab5a4b4`, cabeçalho "Versão 2 (termos-v2)"). `termos-v1` fica aceita porque a página que está no ar e os pedidos antigos mandam v1; cada registro grava o hash da versão que mandou. Versão desconhecida: 422 `campo: termos_versao`. A página nova manda `termos-v2` (`checkout.config.js`, `termosVersao`).
- Prazo: regra única dos termos v2, cláusula 5 (seção 6). Fora do horário de atendimento, o relógio de 72 h começa às 11h do próximo dia de atendimento, não mais às 9h.
- Contrato do corpo: `schema/pedido.schema.json` tem de listar em `termos_versao` as mesmas versões de `TERMOS` (`termos-v1` e `termos-v2`); `assets/vitrine.js` não pode cair para `termos-v1` quando faltar `CK.termosVersao`. Os dois testes do fecho F1 falham até os donos desses arquivos aplicarem a troca (patch pronto com o coordenador).

## 1. Por que existe

Quem copia o Pix, fecha a aba e paga no app do banco nunca volta a `/obrigado/`. Antes, o pedido vivia só no `localStorage` e as 7 preferências de R$ 297 têm `external_reference` por praça, então o pagamento não trazia quem comprou. Agora:

1. No clique de pagar, `/abrir/` manda o pedido por `navigator.sendBeacon` para `registrarPedido` (o pagamento segue igual se o envio falhar).
2. O webhook do Mercado Pago (pacote 1B) ou a volta a `/obrigado/` chama `confirmarPagamento`.
3. `confirmarPagamento` pergunta a `portaAbertaVerificar` (pacote 1B, no AutoCreatFlux) e só confia no que ela devolve.

## 2. Entidades (todas privadas)

Regras de acesso das 4 entidades: `read`, `create`, `update` e `delete` = `{"user_condition": {"role": "admin"}}`. Anônimo e usuário comum não leem nem escrevem nada. As funções usam o papel de serviço.

Comportamento real da plataforma (visto em 10/11, seção 8): leitura negada volta **200 com lista vazia** (a regra filtra as linhas), criação e alteração voltam **403**, apagar volta **404** (a linha fica invisível). Nenhum dado sai.

### PedidoPortaAberta

| campo | tipo | quem grava |
|---|---|---|
| `pedido_id` | `PA-` + 10 de `[0-9A-Z]` | navegador gera; servidor valida |
| `segredo_hash` | sha256 hex do segredo de 128 bits | servidor (o segredo nunca é guardado) |
| `status` | estado (seção 3) | servidor |
| `produto`, `valor` | catálogo do servidor (`pa-abertura-inauguracao-2026-11` 297, `pa-abertura-2026-11` 497, `pa-teste` 1) | servidor confere com o catálogo |
| `praca`, `plano`, `nicho`, `negocio`, `cidade`, `whatsapp`, `email`, `utm_source`, `utm_campaign`, `utm_content` | dados do pedido | navegador, validados |
| `payment_id` | único: um pagamento confirma um só pedido | confirmação |
| `meio`, `pago_em`, `prazo_fim`, `entrega_prevista_em` | pagamento e prazo | confirmação |
| `aceite_em` | hora do **servidor** (o carimbo do navegador é ignorado) | registro |
| `termos_versao`, `termos_hash` | versão aceita e sha256 do `conteudo/termos.md` dessa versão | registro |
| `eh_teste` | `true` para `pa-teste` | registro |
| `slug_rascunho`, `token_hash`, `aprovacao_expira_em`, `tentativas_aprovacao`, `aprovado_em` | aprovação do rascunho | gravarRascunho, aprovarRascunho |
| `servicos_texto`, `fotos` | reservados | marcarPedido |
| `criado_em` | hora do servidor | registro |
| `regra_casamento`, `candidatos` | qual regra casou o pagamento; ids sugeridos em `a_conferir` | confirmação |
| `alerta_prazo_em` | alerta de 12 h já enviado | rotina |
| `email_solicitado`, `email_enviado_em`, `email_resultado` | e-mail ao cliente pedido pelo executor e o resultado | executor, emailSolicitado |
| `excesso` | registro feito acima do teto global por hora | registro |
| `responsavel`, `endereco`, `horarios` | opcionais do registro (mesmo formato do PEDIDO v1). Com eles e o `plano`, o executor produz sem pedir nada pelo WhatsApp (seção 5.1). São dado pessoal: entram no apagamento da desistência | navegador, validados |
| `rascunho_em` | hora do envio do rascunho (base do aceite tácito de 7 dias) | gravarRascunho |
| `motivo_revisao` | código curto `[a-z0-9_]` (ex.: `faltam_dados`) | executor |
| `no_ar_em`, `aprovacao_tacita_em`, `garantia_mes_gratis` (booleano), `desistiu_em`, `estorno_prazo_em`, `estorno_feito_em`, `mensalidade_link_em`, `lembrete_d3_em`, `lembrete_d7_em`, `assinatura_confirmada_em` | régua do executor (docs/EXECUTOR.md) | executor, por `update_entities` ou `marcarPedido` (`CAMPOS_EXECUTOR` em `pedido-regras.mjs`) |

Os 12 campos do executor e os 3 opcionais do registro estão no esquema desde 10/11 (só acréscimo; regras de acesso mantidas). Provado em 10/11 no pedido de teste `PA-TESTERLS01`: `update_entities` com `$set` dos 15 campos e `$unset` de `negocio`, `cidade`, `whatsapp` e `email` (o apagamento da DESISTENCIA.md), depois `query_entities`: os 15 voltaram com o valor gravado e os 4 pessoais sumiram. Também visto: a plataforma **aceita e guarda** campo fora do esquema sem avisar (gravado, relido e apagado com `$unset`). Por isso o nome errado não dá erro: confira o nome contra esta tabela.

### ContadorDia `{data, evento, nicho, praca, anuncio, n}`

`data` em America/Bahia (AAAA-MM-DD). Sem IP, sem cookie, sem dado pessoal. `nicho`, `praca` e `anuncio` são texto no esquema (a lista fechada fica nas regras). `evento` é **enum fechado no esquema da entidade** e tem de ter exatamente os nomes de `EVENTOS` de `pedido-regras.mjs`, na mesma ordem: com a `-11a`, 9 valores (`visita`, `previa`, `ida_pagamento`, `clique_pagar`, `ficou_10s`, `rolou`, `tocou_nome`, `digitou_nome`, `tocou_exemplo`). Em 11/11/2026 o app ainda tem só os 4 primeiros. Se as regras aceitarem um evento que o enum não tem, o `create` falha dentro do `try/catch` da rota e a resposta continua 204: a contagem some sem aviso. Por isso o enum cresce **antes** da cópia das regras.

### LimiteTaxa `{chave_hash, janela, n, expira_em}`

Registro **transitório**: `chave_hash = sha256(sal_da_hora | função | origem | início da janela)`. O sal é aleatório, muda a cada hora e fica em `Operacao` (`sal_taxa_<hora>`). O IP nunca é gravado, devolvido nem registrado. A rotina apaga o que venceu (até 1 h depois).

### Operacao `{chave, valor, expira_em}`

Chaves do executor: `pausado`, `trava_deploy`, `email_cliente` (`ligado` liga o recibo automático ao comprador). Chaves internas: `sal_taxa_<hora>`, `emails_<data>` (teto de 20 e-mails por dia), `resumo_<data>`, `alerta_linhas_<data>`, `ultimo_email_suporte` (diagnóstico do último e-mail ao suporte, sem endereço nem conteúdo), `verif_<hash>` (resposta firme de `portaAbertaVerificar` guardada: 1 h se aprovado; 15 s se não aprovado e a pergunta foi sem e-mail; **nunca** se não aprovado e a pergunta levou e-mail, seção 4.3; a chave é sha256 de pagamento e e-mail, o valor só tem `aprovado`, `valor`, `external_reference`, `email_confere`, `aprovado_em`, nunca e-mail), `conferir_<payment_id>` (pagamento que foi a `a_conferir`: `{payment_id, teste, pedido_id, candidatos, regra, desde}`, só ids e hora, 30 dias; a rotina avisa e apaga quando o pagamento sai de `a_conferir`; o suporte solta à mão pela `operacao` com `acao: soltar`), `aviso_conferir_<data>` (pagamentos já avisados no dia), `ultimo_alerta_conferir` (`{em, n, refs, email}` do último aviso de `a_conferir`), `pendente_<payment_id>` (confirmação sem segredo que ficou em 202: `{payment_id, desde, ultimo, n, motivo, tentativas_rotina}`, 7 dias, seção 4.3), `aviso_pendente_<data>` e `ultimo_alerta_pendente` (`{em, n, refs, email}`).

## 3. Estados

`aguardando_pagamento` · `pago` · `a_conferir` · `recusado` · `em_revisao` · `em_producao` · `rascunho_enviado` · `aprovado` · `no_ar` · `desistiu` · `teste_ok`

Transições que o executor pode fazer por `marcarPedido` (as outras são automáticas):

| de | para |
|---|---|
| aguardando_pagamento | recusado, desistiu |
| a_conferir | pago (exige `payment_id`), recusado, aguardando_pagamento, desistiu |
| pago | em_revisao, em_producao, desistiu |
| em_revisao | em_producao, desistiu |
| em_producao | rascunho_enviado (por `gravarRascunho`), em_revisao, desistiu |
| rascunho_enviado | em_producao, desistiu, no_ar (**aceite tácito**: só com 7 dias ou mais desde `rascunho_em` e sem `aprovado_em`; `aceiteTacitoPermitido`; grava `aprovacao_tacita_em`). `aprovado` só pelo cliente, por `aprovarRascunho` |
| aprovado | no_ar, em_producao, desistiu |
| no_ar | desistiu |

`pago` automático só pela confirmação. `teste_ok`, `recusado` e `desistiu` são finais.

Aceite tácito: a transição existe no servidor, mas só pode ser usada depois que a cláusula estiver nos termos e no R7 (pedido ao copywriter, PV-03). Sem a cláusula publicada, o executor avisa o suporte e não usa a transição. `marcarPedido` recusa com 409 `aceite_tacito_cedo` antes dos 7 dias.

## 4. Funções públicas

Regras comuns a todas:
- Só `POST`. `GET` devolve 405. `OPTIONS` devolve 204 sem métodos liberados.
- Chamada com `Sec-Fetch-Site: cross-site` é recusada (403). O navegador sempre manda esse cabeçalho; é a defesa real contra outra página chamar as funções.
- Corpo de no máximo 2 KB (413). JSON inválido ou que não é objeto: 400. Campo inválido: 422 `{ok:false, erro:"campo", campo}`.
- `pedido_id` e `payment_id` são coagidos a texto e validados por `^PA-[0-9A-Z]{10}$` e `^\d{6,14}$` **antes** de qualquer consulta. Objeto no lugar do id: 422. O corpo nunca vira filtro.
- Id do pedido: o servidor grava e aceita só `PA-` + 10 de `[0-9A-Z]`. O `PedidoEntrada` do `produzir.mjs` (`schema/pedido.schema.json`, `$defs/id`) aceita esse e o antigo de 8 Crockford do PEDIDO v1 pelo WhatsApp.
- Nenhum log de cabeçalho, IP, e-mail ou WhatsApp. Nenhuma resposta traz dado pessoal.
- Limite de taxa por origem (hash transitório, seção 2). Não usa memória do processo. A origem é `cf-connecting-ip`, que a Cloudflare escreve; nunca o primeiro item de `x-forwarded-for` nem `x-real-ip`, que o cliente escolhe (prova na seção 8.7).

### 4.1 `registrarPedido`

Chamada: `navigator.sendBeacon('/api/pa/registrarPedido', new Blob([JSON.stringify(corpo)], {type: 'application/json'}))` no clique de cada `a[data-checkout]` de `/abrir/`, sem esperar resposta.

Corpo (exatamente estas chaves; qualquer outra é recusada):

```json
{
  "id": "PA-7K3QX2MD4R",
  "segredo": "<22 caracteres base64url de 128 bits>",
  "produto": "pa-abertura-inauguracao-2026-11",
  "valor": 297,
  "praca": "feira",
  "plano": "vitrine",
  "nicho": "barbearia",
  "negocio": "Barbearia Exemplo",
  "cidade": "Feira de Santana",
  "whatsapp": "5575999990000",
  "email": "contato@exemplo.com.br",
  "utm_source": "meta", "utm_campaign": "feira", "utm_content": "A1-barbearia-v1",
  "termos_versao": "termos-v2",
  "consentimento_dados": true,
  "hp": "",
  "teste": false,
  "aceite_em": "<opcional, ignorado>",
  "responsavel": "<opcional, 2 a 60 letras>",
  "endereco": "<opcional, uma linha: rua, número, bairro, cidade-UF, CEP>",
  "horarios": "<opcional, seg=09:00-18:00;ter=...;dom=fechado>"
}
```

- `id`: o navegador gera com `crypto.getRandomValues` (recomendado o alfabeto Crockford `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, que cabe no padrão). O formato antigo de 8 caracteres não serve.
- `segredo`: 16 bytes de `crypto.getRandomValues` em base64url sem `=`. Fica só no `localStorage` do aparelho (`creat:pedido:v1`) junto com o `id`. O servidor guarda o sha256.
- `valor` tem de ser o do catálogo para o `produto`. `praca` (opcional): `feira`, `salvador-rms`, `fortaleza`, `recife`, `petrolina-juazeiro`, `aracaju`. `plano` (opcional): `aberto`, `vitrine`, `aberto_anual`, `vitrine_anual`.
- `whatsapp`: 55, DDD e número, só dígitos (máscara é limpa). Celular `9` + 8 dígitos ou fixo `2-5` + 7.
- `hp`: campo isca escondido. Preenchido: responde `{ok:true}` e não grava.
- `teste: true`: valida e responde `{ok:true}` sem gravar. A conferência no ar usa isso.
- `responsavel`, `endereco`, `horarios` (opcionais, mesmo formato do PEDIDO v1): vazio ou ausente não grava nada; fora do formato, 422 com o nome do campo. Pedido à onda 2 (2A): coletar os três em `/abrir/`, com o `plano`, para o pedido não parar em `faltam_dados` (seção 5.1) (superado pela compra curta, ver abaixo). O corpo com os três continua abaixo de 1 KB.
- **Desde a compra curta (11/11/2026, ADR-009):** o `/abrir/` manda o pedido **sem** `responsavel`, `endereco` e `horarios` quando o comprador deixa o bloco recolhido fechado (ou vazio); só os manda quando ele preenche. O servidor não mudou: os três já eram opcionais. Esse pedido pago para em `faltam_dados`, e os dados chegam depois pelo WhatsApp do suporte (EXECUTOR.md, passo (e), roteiro R-dados). `completarPedido` (rota pública para o comprador completar o pedido em `/obrigado/`) é **proposta, não existe**: nenhuma rota de hoje grava esses campos num pedido já criado.

Respostas: 200 `{ok:true}` (gravou, já existia, era teste ou foi descartado pelo teto duro); 422 campo; 429 `{ok:false, erro:"limite"}` (30 por origem por hora); 403 origem; 413; 400.

Só **cria**. Id já existente responde `{ok:true}` sem sobrescrever. `aceite_em` e `criado_em` são a hora do servidor. Teto global em dois degraus: acima de 300 registros por hora no total, continua gravando com `excesso: true` (não perde comprador numa rajada); acima de 900 por hora, descarta sem gravar e responde igual. Assim ninguém enche o banco além de 900 linhas por hora, e quem pagar nessa hora ainda chega ao suporte por `a_conferir`. Não manda e-mail por registro.

Política de privacidade: a página que passar a chamar `registrarPedido` só sobe junto com a política nova (nome, WhatsApp, e-mail, endereço e horários gravados no servidor antes do pagamento, finalidade, prazo de 30 dias se não pagar, prazo definido para pagos, local de armazenamento, apagamento em 15 dias a pedido). Pedido à onda 2 (copywriter e frontend).

### 4.2 `consultarPedido`

Corpo `{id, segredo}`. Resposta 200:

```json
{ "ok": true, "status": "pago", "prazo_fim": "...", "entrega_prevista_em": "...",
  "rascunho_url": "https://.../sites/<slug>--r-<...>/",
  "recibo": { "pedido": "PA-...", "produto": "Abertura do site (preço de inauguração)", "valor": 297, "meio": "Mercado Pago",
              "pagamento": "<payment_id>", "pago_em": "...", "regra_prazo": "<texto da regra>", "termos": "https://.../termos/" } }
```

`rascunho_url` só em `rascunho_enviado`, `aprovado` e `no_ar`, **sem** `#t=` (o servidor só tem o hash do token). Quem abre esse link no aparelho do pedido aprova com o segredo do `localStorage` (seção 4.5, segunda forma). `recibo` só depois de pago (ou `teste_ok`). Nenhum nome, WhatsApp ou e-mail. **Segredo errado responde igual a id inexistente**: 404 `{ok:false, erro:"nao_encontrado"}`. Limite: 600 por origem por hora; passou, 429 `{ok:false, erro:"limite", tentar_em_s:60}`.

Uso em `/obrigado/` (contrato para a onda 2, 2A), com `id` e `segredo` do `localStorage`:
- Enquanto `aguardando_pagamento` ou `a_conferir`: consultar com recuo. 5 s, 10 s, 20 s, 30 s e depois a cada 60 s; parar em 30 minutos e mostrar "Seu pagamento está em conferência. Guarde o número do pagamento e fale com o suporte", com o número do pagamento da URL. A conta: 5 + 10 + 20 + 30 e depois 60 s dá cerca de 32 consultas em 30 minutos; 600 por hora cabem perto de 18 compradores atrás do mesmo endereço de operadora móvel (CGNAT).
- 429: esperar `tentar_em_s` e seguir; nunca mostrar como erro nem como "pedido não encontrado".
- 404: o pedido não está neste aparelho. Mostrar o caminho do suporte com o número do pagamento; não repetir.
- Mostrar o recibo e o link do rascunho quando vierem. É o canal garantido do recibo e do rascunho (seção 7).

### 4.3 `confirmarPagamento`

Corpo `{payment_id, pedido_id?, segredo?, teste?}`. Chamado por `/obrigado/` na volta do Mercado Pago (com `payment_id` da URL e `pedido_id` + `segredo` do aparelho) e pela notificação do Mercado Pago (pacote 1B, só `payment_id`).

Fluxo do pagamento: `docs/INTEGRACAO-PAGAMENTO.md`, seção "Pedido antes do pagamento e confirmação (D2/D3)". Endereço certo da rota: `https://nuvem.creatmtt.com.br/api/pa/confirmarPagamento` (rota de servidor do app, não `/functions/...`). O `portaAbertaNotificacao` e o `portaAbertaConciliar` do AutoCreatFlux chamam hoje `https://creat-nuvem-404b1994.base44.app/api/pa/confirmarPagamento`, que é a mesma rota do mesmo app e continua respondendo: não precisa mudar (`docs/INTEGRACAO-PAGAMENTO.md`, seção "Endereço novo").

Chama `portaAbertaVerificar` (1B) `POST {payment_id, email_candidato?}` e só confia em `{aprovado: true, valor, external_reference, email_confere?, aprovado_em?}`. `external_reference` vira produto e praça (`pa-abertura-inauguracao-<praça>-2026-11` casa com `pa-abertura-inauguracao-2026-11`). Valor fora do catálogo, referência desconhecida ou `aprovado:false`: recusa.

Regras (todas exigem **valor e produto do pagamento iguais aos do pedido**, pedido sem pagamento, e pedido **criado antes da aprovação**; sem `aprovado_em` da 1B, antes da hora da confirmação):

| regra | quando | resultado |
|---|---|---|
| 1 | `pedido_id` + segredo certo + `email_confere: true` para o e-mail do pedido | `pago` |
| 1 | `pedido_id` + segredo certo, e-mail não confere | `a_conferir` (alerta ao suporte) |
| 2 | sem pedido válido: entre os pedidos `aguardando_pagamento` do mesmo produto e valor dos últimos 7 dias (até 20), exatamente um com `email_confere: true` | `pago` |
| 2 | mais de um com e-mail conferido | `a_conferir`, nenhum promovido |
| 3 | só o valor bate, pedido criado nas últimas 6 h | **nunca promove**: `a_conferir` com o candidato sugerido no e-mail ao suporte, sem recibo e sem produção |
| - | nenhum candidato | resposta `a_conferir` e alerta "nenhum pedido gravado" ao suporte |

Segredo errado vale como se não houvesse `pedido_id`. `payment_id` é único: reuso com o mesmo par é idempotente (`{ok:true, status}`); com outro pedido de segredo certo é recusado (`pagamento_ja_usado`) e gera um alerta (uma vez por par). Sem segredo certo, a resposta é `{ok:true}` sem alerta, para ninguém gastar o teto diário de e-mails com `pedido_id` inventado. `pa-teste` vira `teste_ok`, nunca `pago`. `teste: true` verifica e responde `{ok:true, status:"simulado"}` sem gravar.

Ao virar `pago`: grava `pago_em`, `prazo_fim` e `entrega_prevista_em` (seção 6) e manda e-mail ao suporte. Se `Operacao email_cliente = ligado`, manda também o recibo ao comprador.

Respostas (nenhuma com dado pessoal). A coluna "para o webhook" é o contrato fechado com o 1B (c1, 10/11/2026); os nomes não mudam:

| resposta | quer dizer | para o webhook do 1B | o que `/obrigado/` faz |
|---|---|---|---|
| 200 `{ok:true, status}` | `pago`, `teste_ok` ou `a_conferir` (com `prazo_fim` e `entrega_prevista_em` só para quem mandou o segredo do próprio pedido). `a_conferir` entra na rotina, com alerta a partir de 2 h (seção 6) | **confirmado**: 200 ao Mercado Pago, chave por 30 dias | segue para `consultarPedido` |
| 200 `{ok:false, motivo:"nao_confirmado"}` | **ainda conferindo**: pagamento inexistente, pendente (Pix ainda não compensado), recusado ou de outro negócio. Nunca quer dizer "recusado" | **passageiro**: quando o GET do próprio 1B no Mercado Pago disse `approved`, responde 503 ao Mercado Pago e chama `insistir()` (20 s, 60 s, 180 s) | "Estamos confirmando o seu pagamento", e repete a confirmação com o mesmo recuo do 4.2 por até 30 min; depois, suporte com o número do pagamento |
| 200 `{ok:false, motivo:"produto_fora_do_catalogo"}` | aprovado, mas de um produto que este servidor não vende (Bastidores, anuais, combos). O suporte recebe um aviso (uma vez por pagamento) | **firme**: 200, chave por 30 dias | "Pagamento recebido. O suporte vai falar com você", com o número do pagamento |
| 200 `{ok:false, motivo:"pagamento_ja_usado"}` | o pagamento já confirma outro pedido | **firme**: 200, chave por 30 dias | suporte com o número do pagamento |
| 202 `{ok:false, motivo:"tente_mais_tarde"}` | a verificação não respondeu **de verdade** (429 ou 5xx do 1B, rede, tempo, ou o orçamento da hora deste servidor acabou). Nada mudou no pedido | passageiro: 503 e nova tentativa | repete com recuo |
| 429 `{ok:false, erro:"limite"}` | 60 por origem por hora; com segredo de pedido, 6 por origem por hora | passageiro: 503 e nova tentativa | espera 60 s |

Por que `nao_confirmado` é passageiro e não firme: as perguntas com e-mail que voltam `aprovado:false` não ficam guardadas, e a sem e-mail fica no máximo 15 s; as novas tentativas do 1B (20 s, 60 s e 180 s) já passam desse prazo. Quando o Mercado Pago já disse `approved`, a resposta muda para `ok:true` numa delas.

Chamadas a `portaAbertaVerificar` por confirmação (o 1B aceita por origem e por hora 60 respostas sem pagamento aprovado, acima disso responde só o pagamento aprovado e devolve 429 ao resto, e 600 chamadas no total; este servidor é UMA origem para todos os clientes):
- 1 chamada: com o e-mail do pedido do chamador, se o segredo confere; sem e-mail, se não.
- Regra 2: **1 chamada a mais**, com a lista `emails_candidatos` de até 5 e-mails **distintos** dos candidatos (os mais recentes primeiro; e-mail repetido conta uma vez). O 1B devolve `email_confere_indice` (`montarRegra2Lista` em `pedido-regras.mjs`, contrato c3, fecho 2 de 10/11). Candidato que ficou de fora da lista (sexto em diante) nunca é dado como "não confere": se nenhum da lista conferiu, o pagamento vai a `a_conferir` com todos os candidatos. A lista não fica guardada (tem e-mail). Teste com 7 candidatos: 1 chamada, 5 `false` e 2 `null`.
- Cache em `Operacao` (`verif_<hash>`, regras `politicaCacheVerificar` e `cacheVerificarUtil`, c2):
  - `aprovado:true`: 1 h, com e sem e-mail (não muda mais).
  - `aprovado:false` de pergunta **sem** e-mail: 15 s, com carimbo `em` (segura a rajada do mesmo número; a consulta seguinte, 20 s depois, pergunta de novo). Linha antiga sem carimbo é ignorada.
  - `aprovado:false` de pergunta **com** e-mail: **não guarda**, e linha antiga desse tipo é ignorada na leitura. Motivo: o 1B devolve `aprovado:false` para o Pix pendente; se ficasse guardado, a Regra 2 do aviso que chega quando o Pix compensa mandaria a `a_conferir` quem pagou certo. O Pix que compensa 30 s depois vira `pago` na consulta seguinte (testes em `pedido-api.test.mjs`, inclusive o de 20 s sem e-mail).
- Orçamento deste servidor por hora (regra `orcamentoVerificar`, c3, refeita no fecho 2 de 10/11):
  - 400 chamadas no total, abaixo do teto duro de 600 por origem do 1B (que barraria até o pagamento aprovado).
  - Faixa anônima: só gasta a tentativa anônima que **não** volta `aprovado:true` (falsa, ou passageira: 429 do 1B, 5xx, rede). `aprovado:true` não gasta nada; repetição servida pelo cache também não. 30 por hora para todas as origens; com as 30 gastas, cada origem ainda tem 3; teto global de 200 falsas.
  - **O total de chamadas não fecha mais a faixa anônima.** No fecho 1, 40 chamadas inventadas (30 de um endereço e 4 em cada um de 4 endereços novos) fechavam a porta para todos e o aviso do Mercado Pago levava 202 até a hora virar. Agora o aviso, que vem do servidor do 1B e só chama a confirmação com pagamento aprovado, nunca gasta a faixa da própria origem, e passa. Provado no teste "fecho 2 (achado 5)" e no ensaio das rotas (seção 8.8).
  - Faixa autenticada (segredo certo do pedido, ou a rotina do servidor) e faixa do pagamento real (Regra 2 de um pagamento que o 1B acabou de devolver `aprovado:true`): nunca disputam o orçamento anônimo; só o teto de 400.
  - Passou do orçamento: 202, nada muda no pedido.
  - Sem segredo compartilhado novo: o caminho real se distingue pela própria resposta do 1B (`aprovado:true`), não por cabeçalho.
- Pior caso pela conta: 1 + 1 = 2 chamadas por pagamento na primeira confirmação, 0 nas repetições dentro de 1 h.
- **Confirmação pendente (fecho 2 de 10/11).** Todo 202 de chamada **sem** segredo grava `Operacao pendente_<payment_id>` (só número, `desde`, `ultimo`, `n` de repetições e `motivo`; nada de pedido nem e-mail; vale 7 dias; no máximo 60 linhas novas por hora, repetição só soma `n`). A rotina de cada hora refaz até 10 pela faixa do servidor, em rodízio (menos tentativas da rotina primeiro, depois os mais repetidos com a conta parada em 5, porque o aviso real volta: 1 + 3 tentativas do 1B + reenvios do Mercado Pago): confirmado, firme ou `aprovado:false` apaga o registro; ainda passageiro há 2 h ou mais vai a `alerta_confirmacao_pendente` na resposta da rotina, a `Operacao ultimo_alerta_pendente` e a um e-mail por dia ao suporte. Quem pagou e não voltou a `/obrigado/` deixa de depender só dos reenvios do Mercado Pago.
- Limite que continua, com número: para fechar a faixa anônima de todos, um ataque precisa de 57 endereços diferentes na mesma hora (30 + 3 por endereço novo até 200), e ainda passa pelo limite de 60 por origem desta rota; mesmo assim o número do pagamento real fica em `pendente_<id>` e a rotina confirma pela faixa do servidor. Se o 1A estiver fora do ar (404 ou 5xx), nada chega aqui para gravar: o 1B responde 503 e o Mercado Pago reenvia (15 min, 30 min, 6 h, 48 h, depois a cada 96 h). A saída com HMAC entre os dois apps continua descartada porque o contrato c3 proíbe segredo compartilhado novo.

Limite declarado do casamento: quem paga com e-mail diferente do digitado cai em `a_conferir` e a conferência é manual. Gatilho para a preferência por pedido (Plano A): mais de 10 por cento de `a_conferir` nos 20 primeiros pedidos.

### 4.4 `contar`

Corpo `{evento, nicho, praca, anuncio}` (ou `utm_content` no lugar de `anuncio`). Responde **204 sempre** (403 só para `cross-site`).

- `evento`: lista fechada `EVENTOS` (9 desde a `-11a`). Outro nome, outra caixa (`Rolou`), espaço a mais ou tipo que não seja texto: descartado sem gravar (`normalizarContagem` devolve `null`), como antes.
  - Funil: `visita` (página vista), `previa` (prévia gerada com nome digitado), `ida_pagamento` (abertura de `/abrir/`), `clique_pagar` (toque em Pagar).
  - Interesse (11/11/2026): `ficou_10s`, `rolou`, `tocou_nome`, `digitou_nome`, `tocou_exemplo`. Definições exatas e o que cada um responde em `docs/MEDICAO-FUNIL.md`, "Contador próprio (sem aceite)".
  - Regra dos 9: cada um sai **no máximo uma vez por carga da página**, pela mesma `contar()` da página e com o mesmo corpo `{evento, nicho, praca, utm_content}`. Nenhum campo novo: sem texto digitado, sem tempo exato, sem posição de rolagem, sem identificador, sem cookie. Campo a mais no corpo é ignorado pelo servidor (teste "nenhum campo novo passa" em `pedido-api.test.mjs`). Nada sai no link de teste `?teste=pa-teste`.
- `nicho`: `barbearia`, `salao`, `academia`; outro vira `outro`. `praca`: `feira`, `salvador-rms`; outra vira `outro`. `anuncio`: lista fechada de códigos conhecidos em `ANUNCIOS` de `pedido-regras.mjs` (53 códigos em 10/11, inclusive `video`, `video-<nicho>-v1`, `R1-*`, `W0/W1-*` e a rodada `v2` de A1 e B1); outro vira `outro`. Lista fechada de propósito: cada código vira no máximo uma linha por dia. O teste "todo utm_content concreto dos textos de marketing está na lista" lê `marketing/**/*.md` e falha quando um anúncio novo aparece nos textos sem entrar na lista: quem cria o anúncio acrescenta o código aqui, roda `npm test` e recopia para `src/lib/pa/regras.js`.
- Praça e anúncio fora das listas viram `outro` de propósito, inclusive `demo-v1` e `rodape-v1` (quem chega por link de demonstração ou do rodapé). Não acrescente esses valores às listas: a **regra de leitura** do denominador (`docs/MEDICAO-FUNIL.md`, "Quem entra no denominador") soma só praça `feira` ou `salvador-rms` com anúncio `R7-*`, `R9-*` ou `F1-*` e descarta toda linha com praça ou anúncio `outro`.
- Teto por minuto (60 por origem, 600 no total) que **nunca devolve 429**: passou, aceita e descarta.
- `utm_content=conferencia` ou cabeçalho `X-Conferencia: 1`: descarta sem gravar. A conferência no ar roda depois de todo deploy e não pode sujar o número.
- Sem cookie, sem IP, sem log.

O contador mede **ordem de grandeza** (incrementos sem transação podem perder contagens em rajada). Gatilho de verba continua no Gerenciador da Meta.

Limites dos eventos de interesse, ditos antes de ler o número:
- Cada evento é uma chamada separada (até 6 por visita em vez de 1 a 2). O teto de 60 por minuto por origem é dividido entre eles; no 4G com CGNAT muitos aparelhos dividem a origem, e num pico mais contagens são descartadas sem aviso.
- Qualquer um consegue inflar qualquer um dos 9 dentro do teto, como já acontece com `visita`. Leia sempre a cadeia em ordem (`ficou_10s` <= `visita`, `digitou_nome` <= `tocou_nome`, `previa` perto ou abaixo de `digitou_nome`; a exceção é quem volta de `/abrir/` com o nome já preenchido pelo código) e desconfie do degrau que quebra a ordem.
- `ContadorDia` não tem purga nem alerta de volume. Com os 9 eventos, as linhas por dia crescem perto de 2,5 vezes (uma por data, evento, nicho, praça e anúncio).
- O 204 é igual para tudo: chamada de teste não prova que o evento novo grava.

**Antes, e independente disto: o pacote A** (cartão do site de exemplo na primeira tela) não emite evento novo e não toca no app. É um deploy só do site estático, seguido de `node scripts/conferir-no-ar.cjs` com o grupo "C exemplo" verde nos 3 nichos (cartão de 88 a 104 px com o selo inteiro, toque abre o exemplo dentro do quadro, nenhum `previa`); a última linha da saída vai colada no relatório. Antes do deploy esse grupo sai NÃO VERIFICADO.

**Para publicar os eventos de interesse (coordenador, nesta ordem, nunca outra):**
0. Pré-requisito do passo 2: `npm test` completo verde no repositório, um arquivo de teste por vez (`CREAT_TESTE_TMP=/tmp node --test scripts/testes/<arquivo>`), na versão que vai ser copiada.
1. Esquema: `update_entity_schema` de `ContadorDia` acrescentando ao enum de `evento` os 5 valores, depois dos 4 de hoje, sem tirar nenhum e sem mexer em `rls` (só admin), `required` nem nos outros campos. Conferir com `list_entity_schemas`: enum com os 9 valores da seção 2.
2. Regras: copiar `schema/pedido-regras.mjs` byte a byte para `src/lib/pa/regras.js`; `sha256sum` igual ao da seção 9; build do app; `create_checkpoint`; deploy. `src/routes/api/pa/contar.js` e `servidor.server.js` não mudam.
3. Página e política juntas: só então a página que emite os 5 eventos e a Versão 5 de `conteudo/privacidade.md` (linha do contador listando os 9 passos; o aviso curto "Contamos visitas sem cookie" da home revisto junto), no mesmo deploy do site. A página nunca emite os 5 antes de a política estar no ar. No mesmo commit da página, atualizar `scripts/testes/funil.test.mjs`: os `deepEqual` das listas de eventos do contador (hoje só `visita`, `previa`, `ida_pagamento`, `clique_pagar`) e o laço do teste "2A contador" que percorre os eventos quebram de propósito quando a página passar a emitir os 5. Depois, `conferir-no-ar.cjs`, com a última linha colada no relatório.

Na ordem errada nada quebra, só perde contagem em silêncio: página nova com regras antigas ganha 204 e não grava; regras novas com enum antigo ganham 204 e o `create` cai no `catch`.

Prova de que gravou (o 204 não prova): `sha256sum src/lib/pa/regras.js` igual ao da seção 9; enum de `ContadorDia.evento` com 9 valores; no dia seguinte à página nova, `query_entities ContadorDia` com linhas de `ficou_10s` ou `rolou`. Conferência sem sujar o número: `curl -sS -o /dev/null -w '%{http_code}\n' -X POST $O/api/pa/contar -d '{"evento":"rolou","utm_content":"conferencia"}'` dá 204 e não grava nada (a conferência é descartada antes do banco).

### 4.5 `aprovarRascunho`

Só `POST`. Duas formas, as duas com 128 bits comparados pelo hash em tempo constante:
- `{slug, token}`: token do link do rascunho (`/sites/<slug>/#t=<token>`), formato igual ao do segredo. O servidor guarda só `token_hash`.
- `{slug, pedido_id, segredo}`: o segredo do pedido que o navegador guardou em `/abrir/` (mesmo aparelho, mesma origem). **Este é o caminho de hoje**, porque o e-mail ao comprador está desligado e o link de `/obrigado/` (`rascunho_url`) não leva `#t=`. A página do rascunho (pacote 1C, `rascunho.js`), sem `#t=` no endereço, lê `localStorage['creat:pedido:v1']` dentro de `try/catch`; com `id` e `segredo` válidos (`^PA-[0-9A-Z]{10}$` e `^[A-Za-z0-9_-]{21}[AQgw]$`), deixa o botão ligado e manda `{slug, pedido_id: id, segredo}`. Sem nada salvo, o botão fica desligado com o texto "Abra este rascunho no aparelho em que você fez o pedido, ou fale com o suporte".

`slug` segue `^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?--r-[a-z0-9]{12,32}$`. Vale 14 dias depois do `gravarRascunho`. 5 tentativas erradas travam até um novo `gravarRascunho`. `aprovado_em` é a hora do servidor. Slug inexistente, credencial errada, vencido ou travado: a mesma 403 `{ok:false, erro:"negado"}`. Sucesso: 200 `{ok:true, status:"aprovado"}` (repetir com a credencial certa devolve o mesmo).

## 5. Funções internas (só admin)

Exigem `Authorization: Bearer <token de admin do app>`. Anônimo: 401. Usuário comum: 403. Corpo até 2 KB.

| função | corpo | faz |
|---|---|---|
| `listarPedidosPagos` | `{}` | fila: `pago`, `em_revisao`, `em_producao`, `rascunho_enviado`, `aprovado`, sem teste, por `pago_em`; tudo menos os hashes |
| `marcarPedido` | `{id, status, campos?}` | transição da seção 3; `campos`: `servicos_texto` (até 4000), `fotos` (até 20 URLs https), `payment_id` (só `a_conferir` para `pago`) e os 12 do executor (`CAMPOS_EXECUTOR`: datas ISO, `garantia_mes_gratis` booleano, `motivo_revisao` `[a-z0-9_]{1,40}`); `rascunho_enviado` para `no_ar` só pelo aceite tácito (409 `aceite_tacito_cedo` antes de 7 dias) |
| `gravarRascunho` | `{id, slug, token_hash}` | de `em_producao` (ou reenvio) para `rascunho_enviado`, validade de 14 dias, tentativas zeradas, `rascunho_em` = agora; slug único |
| `contarPagos` | `{}` | `{pagos, pagos_inauguracao, por_status}` sem teste (o teto das 20 vagas de inauguração) |
| `operacao` | `{acao: ler\|gravar\|soltar, chave: pausado\|trava_deploy\|email_cliente, valor?, ttl_min?}` | `trava_deploy` só é pega livre, vencida ou pelo mesmo dono (`valor`); padrão 30 min; alheia: 409 com o dono |
| `enviarEmailCliente` | `{pedido_id, modelo: recibo\|rascunho\|mensalidade, token?}` | e-mail fixo ao comprador (seção 7); `token` só no rascunho, vai no `#t=` e não é gravado |
| `emailSolicitado` | `{pedido_id}` | chamada pelo workflow quando o executor grava `email_solicitado` |
| `rotina` | `{}` | chamada pelo workflow a cada hora (seção 6) |

Como o executor (pacote 1D) chega a elas, sem nenhum token na mão:
- **Ler e marcar:** pelo MCP do Base44 (`query_entities`, `update_entities` na entidade `PedidoPortaAberta`), que age como dono do app. Para trocar `status`, siga a tabela da seção 3. Para `a_conferir` → `pago`, o executor não promove: o dono confere no Mercado Pago.
- **E-mail ao cliente:** o executor grava `email_solicitado` (`recibo`, `rascunho` ou `mensalidade`) no pedido pelo MCP. O workflow "Porta Aberta e-mail ao cliente" chama `emailSolicitado` como admin, que envia e limpa o campo. O resultado fica em `email_resultado`.
- **Chamada direta** com token de admin: possível, mas nenhum agente deve manusear token de admin. Gerar token de sessão do dono foi recusado pela trava de credenciais nesta sessão, e está certo assim.

### 5.1 Do registro ao PEDIDO v1 do `produzir.mjs`

`entradaDoRegistro(linha, origemSite)` em `pedido-regras.mjs` monta o `PedidoEntrada` a partir da linha de `PedidoPortaAberta`: `formato` `PEDIDO v1`, `id` = `pedido_id` (10 caracteres, aceito pelo schema), `whatsapp_negocio` = `whatsapp`, `origem` = os `utm_*` gravados ou `direto`, `previa` = `<site>/previa/#k=<nicho>&n=<negócio>&c=<cidade>&p=1`, `aceite_termos` = `aceite_em` + espaço + `termos_versao`, e `plano`, `responsavel`, `endereco`, `horarios` quando o comprador informou. Devolve `{entrada, faltam}`; nada é inventado. Com `faltam` vazio, a saída passa no `validarPedido` do 1C e o `produzir.mjs` vai até o código 4 (aguardando textos), provado em 10/11 com um pedido de id `PA-7K3QX2MD5S` (seção 8.7). Com `faltam` cheio, o executor segue o passo (e) do EXECUTOR.md. Pedido ao 1C: usar esta função no modo de registro do `produzir.mjs` em vez de montar à mão.

## 6. Prazo, fila e rotina

- **Prazo (termos v2, cláusula 5):** 72 horas contadas da confirmação do pagamento. Confirmação dentro do horário de atendimento (segunda a sábado, 9h às 19h, America/Bahia, UTC-3): o relógio começa na hora. Fora dele: às 11h do próximo dia de atendimento, que é o instante que os termos fixam para a confirmação ("Pagou fora desse horário? A confirmação sai até as 11h do próximo dia de atendimento"). Madrugada de segunda a sábado: 11h do mesmo dia; depois das 19h: 11h do dia seguinte; domingo pula para segunda (`inicioDoRelogio`). Texto exato para página e e-mail: `TEXTO_REGRA_PRAZO` em `pedido-regras.mjs`, igual palavra por palavra à cláusula 5 dos termos e à frase de `home.json`, `faq.json`, `abrir.json` e `obrigado.json` (com `prazoHoras` = 72); o teste `TEXTO_REGRA_PRAZO é a cláusula 5 dos termos v2` falha se um dos lados mudar sozinho.
- **Decisão do instante das 11h (conferência do fecho F1, 10/11/2026):** fica 11h, não 9h nem "a hora real". O relógio recebe o instante em que o servidor grava `pago` (`registrarPago` em `src/lib/pa/servidor.server.js`: `ms = agora()`), não o instante do Pix. Por isso uma confirmação que chega segunda 9h05 começa às 9h05 (teste `confirmação que chega segunda 9h05`). Só a confirmação gravada fora do horário (o aviso do Mercado Pago chega na hora do Pix, por exemplo sábado 22h) vai para as 11h do próximo dia de atendimento, que é o limite que a cláusula 5 promete. O cliente vê o instante exato: `/obrigado/` e o e-mail mostram `prazo_fim` com data e hora. Motivos: é o instante escrito nos termos e na página; dá uma regra só, previsível, para a equipe; e não troca de novo a regra que a onda 2 acabou de alinhar (regra 9 do dono). Se o dono preferir 9h, a troca é uma linha (`HORA_CONFIRMACAO_FORA`), uma letra nova em `VERSAO_REGRAS` e a cláusula 5 reescrita pelo copywriter no mesmo ato.
- **Nenhum texto diz 9h:** o teste `nenhum texto do site diz que o prazo começa às 9h do próximo dia` varre `assets/`, `conteudo/`, `checkout.config.js` e as regras. Ele falha enquanto a linha `pago_depois` de `assets/vitrine.js` disser "começa às 9h" (pedido ao dono do arquivo, fecho F1).
- **Entrega prevista:** `prazo_fim` + 1 dia para cada lote de `capacidade_dia` pedidos à frente (`pago`, `em_revisao`, `em_producao`, sem teste). `capacidade_dia` vem de `/dados/vagas.json` (padrão 3 se não ler). Quando a entrega passa do prazo, o e-mail ao suporte avisa.
- **Rotina (workflow "Porta Aberta rotina", minuto 17 de cada hora, America/Bahia):** alerta ao suporte 12 h antes do prazo (uma vez por pedido); purga de `aguardando_pagamento`, `recusado` e `desistiu` com mais de 30 dias; apaga `LimiteTaxa` e `Operacao` vencidos em lotes de 500, repetindo até não sobrar vencida, com teto de 2.000 por entidade por rodada (passou do teto, a saída marca `<campo>_sobrou` e a rodada seguinte continua); alerta se a entidade passar de 5.000 linhas; resumo diário ao suporte na primeira rodada depois das 8h.
- **a_conferir na rotina (c4 de 10/11/2026):** a rotina junta os pedidos em `a_conferir` e os registros `Operacao conferir_<payment_id>` (gravados pela `confirmarPagamento` sempre que um pagamento aprovado vai a `a_conferir`, inclusive quando nenhum pedido foi marcado: dois candidatos com e-mail conferido, candidato sem pergunta ou nenhum pedido). A hora que conta é a do registro (a primeira vez); sem registro, a última atualização do pedido. Regra pura: `itensAConferir` em `pedido-regras.mjs`.
  - Resposta da rotina: `a_conferir` (quantos), `alerta_a_conferir` (lista dos que estão há 2 h ou mais, com `ref`, `pedido_id`, `payment_id`, `desde`, `horas`, `candidatos`, `teste`, `avisado_hoje`) e `avisos_a_conferir` (quantos avisos saíram nesta rodada).
  - Aviso: um por dia por pagamento (Bahia), num e-mail só por rodada ao suporte, e o registro em `Operacao ultimo_alerta_conferir`. O e-mail sai só quando a plataforma aceitar (hoje 422, seção 7); o registro e o campo da resposta valem mesmo assim.
  - Pedido ou pagamento de teste aparece na lista com `teste: true` e nunca gera aviso.
  - Resolvido: quando o pagamento aparece num pedido fora de `a_conferir` (por exemplo `marcarPedido` para `pago` ou `recusado`), a rotina encerra o registro. Pagamento sem pedido resolvido no painel do Mercado Pago (estorno): `operacao {acao: "soltar", chave: "conferir_<payment_id>"}`.
- **Pendentes na rotina (fecho 2 de 10/11/2026):** antes do `a_conferir`, a rotina lê `Operacao pendente_<payment_id>`, refaz a confirmação de até 10 pela faixa do servidor (os que a rotina tentou menos vezes primeiro, em rodízio; depois os mais repetidos, com a conta parada em 5; depois os mais antigos) e apaga o registro quando a resposta é firme (`pago`, `teste_ok`, `a_conferir`, já usado, fora do catálogo ou `aprovado:false`). O que vira `a_conferir` aqui já entra na lista desta mesma rodada. Regras puras: `escolherPendentes` e `destinoPendente`.
  - Resposta da rotina: `pendentes` (quantos registros), `pendentes_refeitos` (`[{payment_id, resultado}]`) e `alerta_confirmacao_pendente` (os ainda passageiros há 2 h ou mais, com `payment_id`, `desde`, `horas`, `n`, `motivo`).
  - Aviso: um por dia por pagamento, num e-mail só por rodada, e `Operacao ultimo_alerta_pendente` (`email: enviado | falhou | sem_novos`). O registro e o campo valem mesmo com o e-mail em 422.
- **Teto de e-mail ao suporte:** 20 por dia, contando tudo (pago, a conferir, prazo, resumo, reuso).

## 7. E-mail

**FATO da plataforma, visto em 10/11/2026 (seção 8.5):** o `SendEmail` do Base44 recusa endereço que não é usuário registrado do app com `422 "Emails to people who aren't registered users of this app need a verified custom domain. Connect and verify a domain..."`. Usuário só provisionado (sem ter entrado) ainda conta como não registrado. Em 10/11 o endereço de suporte (`emailSuporte` de `checkout.config.js`, público no site) não era usuário do app.

Consequências, valendo até haver domínio de e-mail verificado no app (área `custom-email-domains`, ligada ao domínio da onda 4):
- **Suporte:** os e-mails ao suporte (pago, a conferir, prazo, resumo, fora do catálogo) só chegam depois que o endereço de suporte **entrar uma vez** no app (clique do dono, seção 10). Releitura de 10/11 16h: `query_entities User` filtrado pelo endereço de suporte não acha nenhuma linha, e `Operacao ultimo_email_suporte` = `falhou status 422 ...` (14:42:35 UTC). **Portão:** enquanto essa chave não disser `enviado`, nenhum anúncio que leve ao checkout com as funções novas é religado, ou a tarefa executora (com push ao dono) fica como canal de aviso de pedido pago.
- **Comprador:** o e-mail ao comprador fica **desligado**. O comprador é um desconhecido de outra cidade e não é usuário do app; o convite do padrão `ensureBuyerAccount` não o torna registrado antes de ele aceitar. O **recibo** e o **link do rascunho** aparecem em `/obrigado/` por `consultarPedido`, e o recibo do próprio Mercado Pago chega ao pagador. Pedido à onda 2: a chave `rascunho.canais` de `obrigado.json` não pode prometer e-mail.
- `Operacao email_cliente` fica sem valor (desligado). `enviarEmailCliente` só tenta em pedido de teste (`eh_teste`) até o dono ligar, e só faz sentido ligar depois do domínio verificado.
- O padrão tentado continua no código (`email-cliente.server.js`): se o endereço não é usuário, `inviteUser(email, "user")` e depois `SendEmail`. O convite cria um usuário comum, que não lê nenhuma entidade (seção 2). O resultado de cada tentativa fica em `email_resultado` do pedido, sem endereço.

Modelos fixos (`modeloEmailCliente`): `recibo` (pedido, produto, valor, meio, número do pagamento, prazo com a regra, link dos termos), `rascunho` (link com `#t=<token>` quando o executor passa o token, validade de 14 dias), `mensalidade` (plano e link dos termos). Assunto sem nada digitado pelo cliente. Não usa Resend nem outro serviço.

## 8. Provas de 10/11/2026

Arquivos de trabalho em `/tmp/claude-0/-home-user/481145aa-44c7-587c-be27-bbadde2428c0/scratchpad/onda1/1A/` (fora do repositório).

### 8.1 Antes e depois no app (só acréscimo)

- Antes: funções de backend `[]`, workflows `[]`, entidades só `User`, rotas `src/routes/api/time.js`. Checkpoint `6af32521c0baba7bf839652a` ("antes do pacote 1A").
- Depois: entidades `PedidoPortaAberta`, `ContadorDia`, `LimiteTaxa`, `Operacao`; rotas `src/routes/api/pa/` (13 arquivos) e `src/lib/pa/` (5 arquivos); workflows "Porta Aberta rotina" (`6af32ac81c44bac8d5631876`) e "Porta Aberta e-mail ao cliente" (`6af32ad02773909a692bcf9a`), os dois **inativos**. A plataforma também escreveu `base44/entities/User.jsonc` com o esquema que o User já tinha (sem mudança). Funções de backend continuam `[]`. `git diff --stat` no sandbox desde `5cee091`: 25 arquivos, 1723 inserções, 0 remoções. Checkpoint final `6af32d9fd8b0004cccf255fb`. `npx eslint src/lib/pa src/routes/api/pa` e `npm run build` no sandbox: saída 0.
- Dados de teste deixados para o ensaio (todos `eh_teste: true`, fora de toda contagem): `PA-TESTERLS01`, `PA-TEP0S20BX0`, `PA-TESTEMAIL1`. Usuários provisionados: uma conta de teste de usuário comum (role `user`, teste das regras de acesso) e o endereço de suporte (role `user`). Os endereços ficam no painel do app, não neste documento.
- A rotina rodou 5 vezes por execução manual do workflow (roda como admin, contra o código do sandbox): apagou as linhas de teste vencidas de `LimiteTaxa` e `Operacao`, gravou `resumo_2026-11-10` e contou os e-mails do dia. Uma das 5 deu 404 enquanto o servidor de desenvolvimento recarregava depois de uma edição.

### 8.2 Regras de acesso (20 tentativas anônimas e 20 de usuário comum)

Endpoint REST do próprio app `https://creat-nuvem-404b1994.base44.app/api/apps/<app>/entities/<Entidade>`. Igual para anônimo e para usuário comum recém-provisionado (a conta de teste, role `user`), nas 4 entidades:

```
list -> HTTP 200 []    filter -> HTTP 200 []    create -> HTTP 403 Permission denied
update -> HTTP 403 Permission denied            delete -> HTTP 404 not found
```

A linha de teste continuou lá depois (conferido pelo MCP). A plataforma não devolve 401/403 na leitura: ela filtra as linhas e devolve lista vazia.

O mesmo usuário comum nas 8 funções internas: 403 `{"ok":false,"erro":"proibido"}`. Anônimo: 401.

### 8.3 Funções públicas (no preview do sandbox, mesmo código que vai ao ar)

```
registrar teste:true -> 200 {"ok":true}          (nada gravado: conferido pelo MCP)
registrar corpo texto -> 400 · corpo > 2 KB -> 413 · id objeto -> 422 campo id
registrar Sec-Fetch-Site: cross-site -> 403 · GET -> 405 · isca preenchida -> 200 sem gravar
registrar valor 1 para produto de 497 -> 422 campo valor
registrar repetido com outro nome -> 200, nome original mantido
contar válido -> 204 (ContadorDia n=1) · utm_content=conferencia -> 204 sem gravar · X-Conferencia: 1 -> 204 sem gravar
contar cross-site -> 403 · evento desconhecido -> 204 sem gravar · nunca 429
confirmar payment_id falso -> 200 {"ok":false,"motivo":"nao_confirmado"} (a 1B respondeu {"aprovado":false})
confirmar payment_id objeto -> 422 · pedido_id objeto -> 422
consultar id inexistente -> 404 {"ok":false,"erro":"nao_encontrado"} · segredo errado -> o mesmo 404
consultar segredo certo -> 200 {"ok":true,"status":"aguardando_pagamento"}
aprovar slug inexistente -> 403 {"ok":false,"erro":"negado"} · GET -> 405
```

### 8.4 CORS

A borda do Base44 acrescenta `access-control-allow-origin` sozinha: em produção, qualquer resposta com cabeçalho `Origin` sai com `*` (visto em `/api/time` em 10/11), e o `OPTIONS` de pré-voo é respondido pela borda com `*`. No preview, a borda devolve o `Origin` recebido. As rotas mandam `access-control-allow-origin: https://creat-nuvem-404b1994.base44.app`, mas no preview a borda sobrescreve. **Não há como a rota tirar esse cabeçalho.**

Em produção, 11/11/2026 (seção 8.10): as respostas de `contar`, `confirmarPagamento` e `consultarPedido` saem com `access-control-allow-origin: *` **nos dois endereços**, e não com o valor da rota. Ou seja, `ORIGEM_SITE` de `src/lib/pa/servidor.server.js` (ainda o endereço antigo) não chega ao navegador e não decide nada. Chamada da mesma origem não usa CORS, então a página no endereço novo chama as rotas do endereço novo sem depender desse cabeçalho.

Por que isso não abre o pedido: (1) toda chamada de navegador vinda de outro site leva `Sec-Fetch-Site: cross-site` e é recusada antes de qualquer leitura ou escrita; (2) nenhuma resposta pública traz dado pessoal; `consultarPedido` exige o segredo de 128 bits; (3) as rotas não usam cookie, então não há credencial a vazar. Depois do deploy, conferir no endereço de produção (seção 10, passo 3) se o cabeçalho próprio vale lá.

### 8.5 E-mail

- Ao suporte, pela rotina chamada pelo workflow (execução manual de teste do Base44, que roda como admin): `Operacao ultimo_email_suporte = "falhou status 422 Emails to people who aren't registered users of this app need a verified custom domain. Connect and verify a domain, ..."`. Repetido depois de provisionar o endereço de suporte como usuário comum: o mesmo 422.
- A um endereço de teste sem conta no app: pelo FATO acima, o envio a não registrado exige domínio verificado; o convite não muda isso antes de a pessoa aceitar. O gatilho por entidade (`email_solicitado` gravado pelo `update_entities` do MCP no pedido de teste `PA-TESTEMAIL1`) **não disparou** o workflow no sandbox (zero execuções). Nenhum e-mail foi enviado ao endereço sem conta.
- Estatística de e-mails do app em 10/11: `sent: 0`.

### 8.6 NÃO VERIFICADO

- Webhook de ponta a ponta com pagamento real (depende da compra de teste de R$ 1 do dono, P2): o caminho `pago` com prazo, entrega prevista e e-mail ao suporte nunca rodou com pagamento de verdade.
- As funções internas chamadas com token de admin (gravarRascunho, marcarPedido, operacao, listarPedidosPagos, contarPagos, enviarEmailCliente direto): nenhum agente manuseia token de admin. Caminho de prova: o ensaio da onda 1 (qa) pelos workflows, que chamam como admin.
- Se a função recebe `cf-connecting-ip` em produção (a seção 8.7 prova que o cliente não consegue mandar esse cabeçalho; não prova que ele chega à rota). Prova depois do deploy: 40 `POST` em `registrarPedido` de um endereço fixo com `X-Forwarded-For` diferentes; tem de aparecer 429 antes do 31º. Esta sessão não tem endereço de saída fixo (o proxy troca de IP a cada chamada), por isso o teste é do qa no ensaio, de um celular em 4G.
- Comportamento de CORS em produção com as rotas novas (seção 8.4).

### 8.8 Fecho da onda 1 (10/11/2026, noite): c1 a c4

Checkpoints: antes `6af34a91c18a68ad2f4bc573`, depois `6af34ded32a578cf08af80e3`. `npx eslint src/lib/pa src/routes/api/pa` e `npm run build` no sandbox: saída 0. Arquivos do app tocados: só `src/lib/pa/{regras.js,servidor.server.js}` e `src/routes/api/pa/{confirmarPagamento,rotina,operacao}.js`. Funções de backend do app antes e depois: `[]`. Rotas: as mesmas 13. Entidades: sem mudança de esquema. Preview do sandbox (mesmo código que vai ao ar):

```
confirmar payment_id falso (4 números distintos) -> 200 nao_confirmado nos 4; o mesmo número repetido -> 200 nao_confirmado servido pelo cache
LimiteTaxa da hora: verificar_falso_anon = 4 (o repetido não contou); verificar_falso_anon_origem: 4 linhas de n 1 (o IP de saída desta sessão troca a cada chamada); verificar soma as chamadas reais
rotina (execução manual do workflow, como admin) com 3 registros conferir_ de teste: só o de 3 h sem marca de teste foi avisado
  (aviso_conferir_2026-11-10 = ["100000001"], ultimo_alerta_conferir n=1 email=falhou, porque o e-mail ao suporte ainda dá 422);
  o de teste com 5 h e o de 30 min não; segunda rodada na mesma hora: nenhum aviso novo, contador de e-mails do dia igual
pedido de teste com o mesmo payment_id fora de a_conferir -> a rotina encerrou o registro (expira_em no passado); pedido de teste devolvido ao estado anterior
```

NÃO VERIFICADO aqui: Pix pendente que compensa com pagamento real (depende de uma compra Pix de verdade; provado no teste de `pedido-api.test.mjs` com o contrato exato do 1B); 30 falsos seguidos e um pagamento real no mesmo servidor (não há pagamento aprovado de teste disponível e gastar 30 chamadas do 1B não muda a prova; provado no teste); o campo `alerta_a_conferir` na resposta HTTP (o workflow não mostra a saída e nenhum agente manuseia token de admin; provado pelo efeito em `Operacao` e no teste).

### 8.9 Fecho 2 da onda 1 (10/11/2026, noite): o aviso do Mercado Pago fora do orçamento anônimo

Checkpoints: antes `6af354f00b25bf47f29a0a45`, depois `6af35911fdafe4a585c8c510` e final `6af35ad174fc217ed76d14fb` (rodízio na fila de pendentes). Arquivos do app tocados: `src/lib/pa/{regras.js,servidor.server.js,confirmar.server.js (novo)}` e `src/routes/api/pa/{confirmarPagamento,rotina,gravarRascunho}.js`. Rotas: as mesmas 13. Entidades: sem mudança. `npx eslint --quiet src/lib/pa src/routes/api/pa` e `npx vite build` no sandbox: saída 0. AutoCreatFlux: nada mudou (71 funções antes e depois; os três `portaAberta*` com o mesmo sha256).

Preview do sandbox (mesmo código que vai ao ar; o IP de saída desta sessão troca a cada chamada, então cada chamada é quase sempre uma origem nova):

```
36 payment_id inventados seguidos -> 34 x 200 nao_confirmado, 2 x 202 tente_mais_tarde (a origem já tinha as 3 da faixa por origem)
Operacao: pendente_88100000026 e pendente_88100000029, {payment_id, desde, ultimo, n:1, motivo:"orcamento_anonimo", tentativas_rotina:0}, sem dado pessoal
LimiteTaxa da hora: verificar = 42 e verificar_falso_anon = 42 (o fecho 1 fecharia a faixa anônima de todos em 40);
  verificar_falso_anon_origem: nenhuma origem passou de 3
outra origem (o sandbox do Base44, no papel do servidor do aviso) com o total já em 42 -> 200 nao_confirmado (o 1B respondeu de verdade; o fecho 1 daria 202)
aprovarRascunho slug "nada--r-abcdefghijkl" -> 403 negado; slug no formato antigo "nada-r-abcdefghijkl" -> 422 campo slug
confirmar payment_id objeto -> 422; GET -> 405; rotina sem login -> 401; confirmar teste:true -> 200 nao_confirmado, sem pendente
```

Ensaio das rotas no sandbox, com o código do app e banco e rede falsos (`harness.mjs` no scratchpad do fecho), porque a rotina só roda como admin e nenhum agente manuseia token de admin:

```
ataque do achado 5 (30 ids de um endereço + 4 em cada um de 4 endereços novos): só o 4º de cada endereço novo leva 202
aviso real logo depois, de outra origem: 200 {ok:true,status:"pago"} com 2 chamadas ao 1B (1 sem e-mail + 1 com a lista); só o pedido do pagador virou pago
mesmo número em 202 de novo: n=2, mesma hora de início; teste:true em 202 não grava pendente
rotina: 4 inventados -> nao_aprovado, apagados; 1B fora do ar há 3 h -> passageiro, alerta_confirmacao_pendente, ultimo_alerta_pendente email=falhou
rotina com um pendente de pagamento real: pago pela faixa do servidor, registro apagado; segunda rodada no dia: nenhum e-mail novo (sem_novos)
```

NÃO VERIFICADO aqui: o caminho com pagamento aprovado de verdade (não existe pagamento aprovado de teste até o dono pagar a `pa-teste`); a rotina com token de admin no preview (o workflow roda no app publicado, onde as rotas ainda dão 404).

### 8.10 Endereço único (pacote H3, 11/11/2026, 01:20 UTC)

Leitura do código do app (só leitura, `src/routes/api/pa/*.js` e `src/lib/pa/*.js` no commit `ccd084c`):
- Nenhuma rota lê `Origin`, `Referer` ou `Host`. A trava de origem é só `ehCrossSite` (`Sec-Fetch-Site: cross-site` dá 403), nas 5 rotas públicas (`registrarPedido`, `contar`, `confirmarPagamento`, `consultarPedido`, `aprovarRascunho`); as internas exigem admin. Chamada de servidor para servidor (o webhook do 1B) não manda esse cabeçalho e passa.
- Limite de taxa: a chave é `sal da hora | escopo | cf-connecting-ip` (ou a cadeia de `x-forwarded-for`, ou global). O host não entra. Quem alterna os dois endereços cai no mesmo contador.
- Host usado como dado em dois lugares, e os dois seguem o endereço chamado: `consultarPedido` monta `rascunho_url` e `recibo.termos` com `new URL(request.url).origin`; `capacidadeDia` lê `/dados/vagas.json` do próprio endereço chamado (o arquivo é o mesmo nos dois; se falhar, vale 3).
- Host fixo: `ORIGEM_SITE` em `servidor.server.js` (cabeçalho CORS, sem efeito em produção, seção 8.4) e `ORIGEM` em `regras.js` (links dos e-mails, agora o canônico).
- A página: `public/assets/vitrine.js` monta a API com `location.origin + '/api/pa/'`. Aberta no novo, chama o novo.

Sondas no ar, 8 chamadas no total, nenhuma grava pedido (`contar` com `X-Conferencia: 1` e `utm_content=conferencia`; `confirmarPagamento` com `teste:true`, que não deixa `pendente_`; `consultarPedido` com id e segredo inventados), mesmas chamadas nos dois endereços, com `Origin` do próprio endereço e `Sec-Fetch-Site: same-origin`:

```
                                   antigo (base44.app)                    novo (nuvem.creatmtt.com.br)
contar                             204                                    204
confirmarPagamento 99999999999     200 {"ok":false,"motivo":"nao_confirmado"}   200 {"ok":false,"motivo":"nao_confirmado"}
consultarPedido PA-ZZZZZZZZZZ      404 {"ok":false,"erro":"nao_encontrado"}     404 {"ok":false,"erro":"nao_encontrado"}
GET /dados/vagas.json              200 capacidade_dia 3                   200 capacidade_dia 3
cabeçalhos das 6 chamadas          server: cloudflare, access-control-allow-origin: *, vary: Origin, TLS válido (ssl_verify_result 0) nos dois
```

NÃO VERIFICADO: o `rascunho_url` com o host novo numa consulta de verdade (precisa de um pedido real com segredo e rascunho; a leitura do código mostra que ele segue o endereço chamado); o `registrarPedido` de verdade vindo do novo (proibido sem `eh_teste`; mesmo código e mesma trava das outras rotas).

Reconferência no próprio app (11/11/2026, depois da conferência do H3), commit `f2968e7`:
- `git status --porcelain` vazio; `git log`: `f2968e7` sobre `ccd084c`; `git diff --stat ccd084c f2968e7`: só `src/lib/pa/regras.js` (4 linhas a mais, 2 a menos).
- `sha256sum src/lib/pa/regras.js` = `10a0465f96055400a2d77dc2595d58ced805a42565c34f16f43db1015d308124`, 46384 bytes: igual a `schema/pedido-regras.mjs`.
- Lista de checkpoints da plataforma: `6af3c377db3067a148bad505` = commit `f2968e7`, nunca publicado; `6af3c32c57d4bf26ea220951` = commit `ccd084c` (a volta). O publicado é `6af3a7aa82d1d83aba5457b6`, commit `ccd084c`.
- Busca por `origin|referer|host|x-forwarded|sec-fetch|request.url` em `src/`: nas rotas `/api/pa/*` os cabeçalhos lidos são só `sec-fetch-site`, `x-conferencia`, `content-length`, `cf-connecting-ip` e `x-forwarded-for` (estes dois viram hash do limite de taxa). `request.url` aparece em dois lugares: `consultarPedido` (`rascunho_url`, `recibo.termos`) e `capacidadeDia`. Nenhuma comparação com endereço.
- O patch opcional de `ORIGEM_SITE` (`servidor.server.js`, fora deste pacote) passa em `git apply --check` dentro do app, sobre `f2968e7`. Não foi aplicado.
- Se, em produção, `request.url` chegasse com outro host, o `/obrigado/` só esconderia o botão do rascunho: ele só aparece quando `rascunho_url` começa por `location.origin + '/sites/'` (`vitrine.js`). Nenhum link errado aparece. O caminho principal do rascunho é o e-mail, que usa o endereço canônico fixo. A prova de vez vem na primeira consulta real com rascunho, ou na conferência no ar depois do deploy.
- Duas sondas a mais no novo, sem gravar nada (`GET /api/time/` 200, `GET /api/pa/consultarPedido/` 405). Nenhuma traz `Location`, então não mostram o host que o servidor recebe. Total do pacote: 10 chamadas.

### 8.7 Correções da conferência da onda 1 (10/11/2026, tarde)

Checkpoints: antes `6af33eee392cd812d1eba5e4`, depois `6af3423f769e842f204702b6`. Rotas antes e depois: as mesmas 13 em `src/routes/api/pa/` (nenhuma criada, nenhuma apagada); entidades: só acréscimo de 15 campos em `PedidoPortaAberta`, regras de acesso iguais. Preview do sandbox (mesmo código que vai ao ar):

```
bateria inteira da 8.3 de novo: os mesmos códigos (registrar 200/400/413/422/403/405; contar 204/403; confirmar 200/422; consultar 404/200; aprovar 403/405; internas 401)
registrar com responsavel, endereco e horarios -> 200; relido pelo MCP com os três campos
registrar com horarios "seg=9h;..." -> 422 campo horarios
confirmar payment_id falso com pedido_id e segredo certos -> 200 nao_confirmado (o 1B respondeu de verdade)
confirmar payment_id falso sem pedido -> 202 tente_mais_tarde; o 1B, chamado direto, devolveu 429 TOO_MANY_ATTEMPTS para esse pagamento (o teto de 10 por hora): o 429 vira 202, nunca "não confere"
Operacao verif_<hash>: 2 linhas, valor {"aprovado":false}, vence em 2 min, sem e-mail
cabeçalho cf-connecting-ip mandado pelo cliente: 403 "error code: 1000" da própria Cloudflare, no preview e em produção (o cliente não consegue falsificar a origem por esse cabeçalho)
22 chamadas seguidas a aprovarRascunho sem cabeçalho: 12 linhas de LimiteTaxa com n de 1 a 4, porque o IP de saída desta sessão troca (api.ipify.org: 5 IPs diferentes em 6 chamadas)
```

Repositório: `PedidoEntrada.id` aceita 10 caracteres (teste com `PA-TESTERLS01`); um registro completo vira PEDIDO v1 por `entradaDoRegistro`, passa em `validarPedido` do 1C e `node scripts/producao/produzir.mjs --pedido <pedido-10.json> --slug ensaio-1a --saida <pasta>` sai com código 4 (aguardando textos).

Pedidos de teste novos (todos `eh_teste: true`, purgados em 30 dias): `PA-TT3RB60JKC`, `PA-T0J154DG6B`.

## 9. Hash das regras para o revisor

```
sha256sum projetos/creat-nuvem/schema/pedido-regras.mjs           # neste repositório
sha256sum src/lib/pa/regras.js                                     # no app (run_command do MCP do Base44)
```

Os dois têm de dar o mesmo valor. Valor depois dos eventos de interesse (11/11/2026, `pa-regras-1A-2026-11-11a`: `EVENTOS` com 9 nomes): `e91dbbe250526276aeb3db258db5428973aca0846cf97ec37fd1737489fcb30f` (46830 bytes) no repositório; no app só depois da cópia (seção 4.4). Valores anteriores: `10a0465f96055400a2d77dc2595d58ced805a42565c34f16f43db1015d308124` (`-10f`, 46384 bytes, endereço único: links dos e-mails no endereço canônico; é o que o sandbox do app tinha em 11/11/2026), `18036b75...` (`-10e`, fecho da onda 2: termos-v2 e prazo às 11h), `510ebc77...` (fecho 2 da onda 1; o arquivo trazia a constante `-10c`, embora este texto o chamasse de `-10d`, por isso a letra `d` ficou pulada), `5a5ec057...` (`-10c`), `ac5c9ebc...` (`-10b`), `a51a663c...`. Toda mudança nas regras é feita no repositório, testada com `npm test` e copiada byte a byte para o app.

## 10. Para ir ao ar (coordenador)

1. Portões D10 verdes (`npm test`, `checar.cjs`, `conferir-moldura.cjs`, `conferir-boot.cjs`).
2. `create_checkpoint` e deploy do app (publica as rotas; as entidades já existem). As funções antes de qualquer página que as chame.
3. Conferência no ar das funções (com `teste:true` e `utm_content=conferencia`, nada grava):

```bash
O=https://nuvem.creatmtt.com.br                 # canônico; repita o bloco com O=https://creat-nuvem-404b1994.base44.app (o antigo responde igual)
curl -sS -X POST $O/api/pa/registrarPedido -H 'content-type: application/json' -d @projetos/creat-nuvem/schema/exemplos/pedido.registro-v1-teste.valido.json   # {"ok":true}
curl -sS -o /dev/null -w '%{http_code}\n' -X POST $O/api/pa/contar -d '{"evento":"visita","utm_content":"conferencia"}'                      # 204
curl -sS -X POST $O/api/pa/confirmarPagamento -d '{"payment_id":"99999999999"}'                                                           # {"ok":false,"motivo":"nao_confirmado"}
curl -sS -X POST $O/api/pa/consultarPedido -d '{"id":"PA-ZZZZZZZZZZ","segredo":"AAAAAAAAAAAAAAAAAAAAAA"}'                                  # 404 nao_encontrado
curl -sS -o /dev/null -w '%{http_code}\n' -X POST $O/api/pa/registrarPedido -H 'sec-fetch-site: cross-site' -d '{}'                         # 403
curl -sS -o /dev/null -w '%{http_code}\n' -X POST $O/api/pa/rotina -d '{}'                                                                  # 401
curl -sS -o /dev/null -D - -X OPTIONS $O/api/pa/registrarPedido -H 'Origin: https://golpe.example' | grep -i access-control                # registrar o que sair
```

4. Logo depois da conferência no ar verde, ativar os dois workflows (estão **inativos**, `total_runs` 0; sem isso nenhum `a_conferir` nem `pendente_` é avisado): `POST /api/apps/6aefffe66b684db9404b1994/workflows/<id>/toggle-status?status=active` pelo MCP (`execute_api`), com `6af32ac81c44bac8d5631876` (rotina) e `6af32ad02773909a692bcf9a` (e-mail ao cliente). Em seguida `POST .../workflows/6af32ac81c44bac8d5631876/run-now` uma vez e conferir: `last_run_status` igual a `success`, e `Operacao resumo_<data>` ou `ultimo_email_suporte` atualizada. Antes do deploy não ligue: a rotina daria 404.
5. Clique do dono (uma vez): entrar em https://creat-nuvem-404b1994.base44.app/login com a conta Google do endereço de suporte (a do dono). Depois disso o e-mail ao suporte passa a sair; conferir com a execução manual do workflow da rotina e ler `Operacao ultimo_email_suporte` (tem de dizer `enviado`).
6. Ensaio do qa: repetir o teste do e-mail ao endereço sem conta (`PA-TESTEMAIL1`, `email_solicitado = recibo`) com a gravação pelo endpoint de um registro (`PUT /api/apps/{app_id}/entities/PedidoPortaAberta/{id}`), que pode disparar o gatilho de entidade, e ler `email_resultado`. Resultado esperado pelo FATO: 422 até haver domínio verificado.
7. Ensaio do qa, linhas novas: (a) 40 `POST` em `registrarPedido` de um celular em 4G com `X-Forwarded-For` diferentes: 429 antes do 31º; (b) `confirmarPagamento` com um `payment_id` aprovado de teste e 12 pedidos `aguardando_pagamento` de teste do mesmo produto: no máximo 2 chamadas ao 1B (1 sem e-mail e 1 com a lista; contar `verificar:3600000` de `LimiteTaxa`); (c) `marcarPedido` de `rascunho_enviado` para `no_ar` antes de 7 dias: 409 `aceite_tacito_cedo`; (d) Pix real de teste: abrir `/obrigado/` com o Pix ainda pendente e pagar em seguida; o pedido tem de terminar `pago`, não `a_conferir`; (e) um pedido de teste em `a_conferir` há mais de 2 h aparece em `alerta_a_conferir` da rotina com `teste: true` e sem aviso; (f) a compra de R$ 1 do dono: verde é `PA_APROVADO_CONFIRMADO` (ou `_TARDE`) no log do `portaAbertaNotificacao` e `Operacao conferir_<payment_id>` com `teste:true` (ou `teste_ok`, se um pedido `pa-teste` tiver o e-mail do pagador), nunca `pago` (`docs/INTEGRACAO-PAGAMENTO.md`, "O que a compra de R$ 1 do dono vira"); (g) depois de ligar a rotina, nenhum `Operacao pendente_` com mais de 2 h sem aparecer em `alerta_confirmacao_pendente`.
8. Pedidos que dependem de outros pacotes antes do ensaio verde: 1B troca o endereço do aviso para `/api/pa/confirmarPagamento`; 1C faz `rascunho.js` aprovar com o segredo do aparelho (seção 4.5) e usa `entradaDoRegistro` (seção 5.1); 2A coleta `responsavel`, `endereco`, `horarios` e `plano` em `/abrir/` e segue o recuo da seção 4.2; copywriter publica a cláusula do aceite tácito e a política de privacidade nova no mesmo ato da página que chama `registrarPedido`. A política nova (versão 3) já é o `conteudo/privacidade.md`, que a página `/privacidade/` lê (momento exato em que os dados saem do aparelho, lista do que é gravado, base legal por finalidade, hash do IP com sal por hora, Base44 e a função de conferência como operadores, a comparação de e-mail sem devolução, o cadastro do e-mail para o envio pelo Base44, o atendimento manual do art. 18 em até 15 dias e a contagem diária do `contar`). Ela sobe no mesmo ato da página que chama `registrarPedido`, porque descreve essa gravação. Faltam, antes de tirar a marca `REVISAO_JURIDICA_PENDENTE`: preencher `{{empresa.*}}` e `{{contato.email}}` com o dado real, a revisão jurídica e uma decisão do dono sobre o prazo de 5 anos do pedido pago (a rotina não apaga pedido pago; hoje a eliminação é manual no painel). `termos.md` agora é a versão 2: `TERMOS` aceita `termos-v1` e `termos-v2` (sha256 `7ae67e83...`) e `checkout.config.js` manda `termos-v2`. Se a revisão jurídica mexer de novo nos termos, sobe para `termos-v3` com o sha256 novo no mesmo commit, mantendo as anteriores (o teste do hash falha se `termos.md` mudar sem isso).
