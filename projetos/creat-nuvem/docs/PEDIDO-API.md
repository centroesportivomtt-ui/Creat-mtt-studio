# Pedido no servidor · contrato final (pacote 1A, 10/11/2026)

Este é o contrato que a onda 2 lê. Ele cobre o pedido gravado no clique de pagar, a confirmação do pagamento sem dar o pagamento a quem não pagou, o contador, a aprovação do rascunho e as funções internas do executor.

- App: Base44 "Creat Nuvem" `6aefffe66b684db9404b1994` (TanStack Start). As funções são rotas de servidor em `src/routes/api/pa/*.js`, na mesma origem do site: `https://creat-nuvem-404b1994.base44.app/api/pa/<nome>`.
- Regras puras: `schema/pedido-regras.mjs` neste repositório, copiado **byte a byte** para `src/lib/pa/regras.js` no app. O revisor compara os dois `sha256sum` (seção 9).
- Corpo de `registrarPedido`: `schema/pedido.schema.json`, `$defs/PedidoRegistro`. Exemplos em `schema/exemplos/pedido.registro-v1*.json`.
- Testes: `npm test` roda `scripts/testes/pedido-api.test.mjs` (regras, casamento, ataques, prazo, contador).
- Nada aqui está publicado. As rotas só vão ao ar no próximo deploy do app, feito pelo coordenador (seção 10).

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

### ContadorDia `{data, evento, nicho, praca, anuncio, n}`

`data` em America/Bahia (AAAA-MM-DD). Sem IP, sem cookie, sem dado pessoal.

### LimiteTaxa `{chave_hash, janela, n, expira_em}`

Registro **transitório**: `chave_hash = sha256(sal_da_hora | função | origem | início da janela)`. O sal é aleatório, muda a cada hora e fica em `Operacao` (`sal_taxa_<hora>`). O IP nunca é gravado, devolvido nem registrado. A rotina apaga o que venceu (até 1 h depois).

### Operacao `{chave, valor, expira_em}`

Chaves do executor: `pausado`, `trava_deploy`, `email_cliente` (`ligado` liga o recibo automático ao comprador). Chaves internas: `sal_taxa_<hora>`, `emails_<data>` (teto de 20 e-mails por dia), `resumo_<data>`, `alerta_linhas_<data>`, `ultimo_email_suporte` (diagnóstico do último e-mail ao suporte, sem endereço nem conteúdo).

## 3. Estados

`aguardando_pagamento` · `pago` · `a_conferir` · `recusado` · `em_revisao` · `em_producao` · `rascunho_enviado` · `aprovado` · `no_ar` · `desistiu` · `teste_ok`

Transições que o executor pode fazer por `marcarPedido` (as outras são automáticas):

| de | para |
|---|---|
| aguardando_pagamento | recusado, desistiu |
| a_conferir | pago (exige `payment_id`), recusado, aguardando_pagamento |
| pago | em_revisao, em_producao, desistiu |
| em_revisao | em_producao, desistiu |
| em_producao | rascunho_enviado (por `gravarRascunho`), em_revisao, desistiu |
| rascunho_enviado | em_producao, desistiu (aprovado só pelo cliente, por `aprovarRascunho`) |
| aprovado | no_ar, em_producao, desistiu |
| no_ar | desistiu |

`pago` automático só pela confirmação. `teste_ok`, `recusado` e `desistiu` são finais.

## 4. Funções públicas

Regras comuns a todas:
- Só `POST`. `GET` devolve 405. `OPTIONS` devolve 204 sem métodos liberados.
- Chamada com `Sec-Fetch-Site: cross-site` é recusada (403). O navegador sempre manda esse cabeçalho; é a defesa real contra outra página chamar as funções.
- Corpo de no máximo 2 KB (413). JSON inválido ou que não é objeto: 400. Campo inválido: 422 `{ok:false, erro:"campo", campo}`.
- `pedido_id` e `payment_id` são coagidos a texto e validados por `^PA-[0-9A-Z]{10}$` e `^\d{6,14}$` **antes** de qualquer consulta. Objeto no lugar do id: 422. O corpo nunca vira filtro.
- Nenhum log de cabeçalho, IP, e-mail ou WhatsApp. Nenhuma resposta traz dado pessoal.
- Limite de taxa por origem (hash transitório, seção 2). Não usa memória do processo.

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
  "termos_versao": "termos-v1",
  "consentimento_dados": true,
  "hp": "",
  "teste": false,
  "aceite_em": "<opcional, ignorado>"
}
```

- `id`: o navegador gera com `crypto.getRandomValues` (recomendado o alfabeto Crockford `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, que cabe no padrão). O formato antigo de 8 caracteres não serve.
- `segredo`: 16 bytes de `crypto.getRandomValues` em base64url sem `=`. Fica só no `localStorage` do aparelho (`creat:pedido:v1`) junto com o `id`. O servidor guarda o sha256.
- `valor` tem de ser o do catálogo para o `produto`. `praca` (opcional): `feira`, `salvador-rms`, `fortaleza`, `recife`, `petrolina-juazeiro`, `aracaju`. `plano` (opcional): `aberto`, `vitrine`, `aberto_anual`, `vitrine_anual`.
- `whatsapp`: 55, DDD e número, só dígitos (máscara é limpa). Celular `9` + 8 dígitos ou fixo `2-5` + 7.
- `hp`: campo isca escondido. Preenchido: responde `{ok:true}` e não grava.
- `teste: true`: valida e responde `{ok:true}` sem gravar. A conferência no ar usa isso.

Respostas: 200 `{ok:true}` (gravou, já existia ou era teste); 422 campo; 429 `{ok:false, erro:"limite"}` (30 por origem por hora); 403 origem; 413; 400.

Só **cria**. Id já existente responde `{ok:true}` sem sobrescrever. `aceite_em` e `criado_em` são a hora do servidor. Acima de 300 registros por hora no total, continua gravando com `excesso: true`. Não manda e-mail por registro.

### 4.2 `consultarPedido`

Corpo `{id, segredo}`. Resposta 200:

```json
{ "ok": true, "status": "pago", "prazo_fim": "...", "entrega_prevista_em": "...",
  "rascunho_url": "https://.../sites/<slug>-r-<...>/",
  "recibo": { "pedido": "PA-...", "produto": "Abertura do site (preço de inauguração)", "valor": 297, "meio": "Mercado Pago",
              "pagamento": "<payment_id>", "pago_em": "...", "regra_prazo": "<texto da regra>", "termos": "https://.../termos/" } }
```

`rascunho_url` só em `rascunho_enviado`, `aprovado` e `no_ar`. `recibo` só depois de pago (ou `teste_ok`). Nenhum nome, WhatsApp ou e-mail. **Segredo errado responde igual a id inexistente**: 404 `{ok:false, erro:"nao_encontrado"}`. Limite: 120 por origem por hora.

Uso em `/obrigado/`: com `id` e `segredo` do `localStorage`, consultar a cada poucos segundos enquanto `aguardando_pagamento`, e mostrar o recibo e o link do rascunho quando vierem. É o canal garantido do recibo e do rascunho (seção 7).

### 4.3 `confirmarPagamento`

Corpo `{payment_id, pedido_id?, segredo?, teste?}`. Chamado por `/obrigado/` na volta do Mercado Pago (com `payment_id` da URL e `pedido_id` + `segredo` do aparelho) e pela notificação do Mercado Pago (pacote 1B, só `payment_id`).

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

Respostas (nenhuma com dado pessoal): 200 `{ok:true, status}` (com `prazo_fim` e `entrega_prevista_em` só para quem mandou o segredo do próprio pedido); 200 `{ok:false, motivo:"nao_confirmado"}`; 200 `{ok:false, motivo:"pagamento_ja_usado"}`; 202 `{ok:false, motivo:"tente_mais_tarde"}` quando a verificação não respondeu (o chamador tenta de novo; nunca 5xx); 429 (60 por origem por hora).

Limite declarado do casamento: quem paga com e-mail diferente do digitado cai em `a_conferir` e a conferência é manual. Gatilho para a preferência por pedido (Plano A): mais de 10 por cento de `a_conferir` nos 20 primeiros pedidos.

### 4.4 `contar`

Corpo `{evento, nicho, praca, anuncio}` (ou `utm_content` no lugar de `anuncio`). Responde **204 sempre** (403 só para `cross-site`).

- `evento`: `visita`, `previa`, `ida_pagamento`, `clique_pagar`. Outro: descartado.
- `nicho`: `barbearia`, `salao`, `academia`; outro vira `outro`. `praca`: `feira`, `salvador-rms`; outra vira `outro`. `anuncio`: lista fechada de códigos conhecidos em `ANUNCIOS` de `pedido-regras.mjs`; outro vira `outro`.
- Teto por minuto (60 por origem, 600 no total) que **nunca devolve 429**: passou, aceita e descarta.
- `utm_content=conferencia` ou cabeçalho `X-Conferencia: 1`: descarta sem gravar. A conferência no ar roda depois de todo deploy e não pode sujar o número.
- Sem cookie, sem IP, sem log.

O contador mede **ordem de grandeza** (incrementos sem transação podem perder contagens em rajada). Gatilho de verba continua no Gerenciador da Meta.

### 4.5 `aprovarRascunho`

Só `POST`. Duas formas, as duas com 128 bits comparados pelo hash em tempo constante:
- `{slug, token}`: token do link do rascunho (`/sites/<slug>/#t=<token>`), formato igual ao do segredo. O servidor guarda só `token_hash`.
- `{slug, pedido_id, segredo}`: o segredo do pedido que o navegador guardou em `/abrir/` (mesmo aparelho, mesma origem).

`slug` segue `^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?-r-[a-z0-9]{12,32}$`. Vale 14 dias depois do `gravarRascunho`. 5 tentativas erradas travam até um novo `gravarRascunho`. `aprovado_em` é a hora do servidor. Slug inexistente, credencial errada, vencido ou travado: a mesma 403 `{ok:false, erro:"negado"}`. Sucesso: 200 `{ok:true, status:"aprovado"}` (repetir com a credencial certa devolve o mesmo).

## 5. Funções internas (só admin)

Exigem `Authorization: Bearer <token de admin do app>`. Anônimo: 401. Usuário comum: 403. Corpo até 2 KB.

| função | corpo | faz |
|---|---|---|
| `listarPedidosPagos` | `{}` | fila: `pago`, `em_revisao`, `em_producao`, `rascunho_enviado`, `aprovado`, sem teste, por `pago_em`; tudo menos os hashes |
| `marcarPedido` | `{id, status, campos?}` | transição da seção 3; `campos`: `servicos_texto` (até 4000), `fotos` (até 20 URLs https), `payment_id` (só `a_conferir` para `pago`) |
| `gravarRascunho` | `{id, slug, token_hash}` | de `em_producao` (ou reenvio) para `rascunho_enviado`, validade de 14 dias, tentativas zeradas; slug único |
| `contarPagos` | `{}` | `{pagos, pagos_inauguracao, por_status}` sem teste (o teto das 20 vagas de inauguração) |
| `operacao` | `{acao: ler\|gravar\|soltar, chave: pausado\|trava_deploy\|email_cliente, valor?, ttl_min?}` | `trava_deploy` só é pega livre, vencida ou pelo mesmo dono (`valor`); padrão 30 min; alheia: 409 com o dono |
| `enviarEmailCliente` | `{pedido_id, modelo: recibo\|rascunho\|mensalidade, token?}` | e-mail fixo ao comprador (seção 7); `token` só no rascunho, vai no `#t=` e não é gravado |
| `emailSolicitado` | `{pedido_id}` | chamada pelo workflow quando o executor grava `email_solicitado` |
| `rotina` | `{}` | chamada pelo workflow a cada hora (seção 6) |

Como o executor (pacote 1D) chega a elas, sem nenhum token na mão:
- **Ler e marcar:** pelo MCP do Base44 (`query_entities`, `update_entities` na entidade `PedidoPortaAberta`), que age como dono do app. Para trocar `status`, siga a tabela da seção 3. Para `a_conferir` → `pago`, o executor não promove: o dono confere no Mercado Pago.
- **E-mail ao cliente:** o executor grava `email_solicitado` (`recibo`, `rascunho` ou `mensalidade`) no pedido pelo MCP. O workflow "Porta Aberta e-mail ao cliente" chama `emailSolicitado` como admin, que envia e limpa o campo. O resultado fica em `email_resultado`.
- **Chamada direta** com token de admin: possível, mas nenhum agente deve manusear token de admin. Gerar token de sessão do dono foi recusado pela trava de credenciais nesta sessão, e está certo assim.

## 6. Prazo, fila e rotina

- **Prazo:** 72 horas contadas da confirmação. Confirmação fora de segunda a sábado, 9h às 19h (America/Bahia, UTC-3), começa às 9h do próximo dia de atendimento (domingo pula para segunda). Texto exato para página e e-mail: `TEXTO_REGRA_PRAZO` em `pedido-regras.mjs`.
- **Entrega prevista:** `prazo_fim` + 1 dia para cada lote de `capacidade_dia` pedidos à frente (`pago`, `em_revisao`, `em_producao`, sem teste). `capacidade_dia` vem de `/dados/vagas.json` (padrão 3 se não ler). Quando a entrega passa do prazo, o e-mail ao suporte avisa.
- **Rotina (workflow "Porta Aberta rotina", minuto 17 de cada hora, America/Bahia):** alerta ao suporte 12 h antes do prazo (uma vez por pedido); purga de `aguardando_pagamento`, `recusado` e `desistiu` com mais de 30 dias; apaga `LimiteTaxa` e `Operacao` vencidos; alerta se a entidade passar de 5.000 linhas; resumo diário ao suporte na primeira rodada depois das 8h.
- **Teto de e-mail ao suporte:** 20 por dia, contando tudo (pago, a conferir, prazo, resumo, reuso).

## 7. E-mail

**FATO da plataforma, visto em 10/11/2026 (seção 8.5):** o `SendEmail` do Base44 recusa endereço que não é usuário registrado do app com `422 "Emails to people who aren't registered users of this app need a verified custom domain. Connect and verify a domain..."`. Usuário só provisionado (sem ter entrado) ainda conta como não registrado. Em 10/11 o suporte `mttcreatt@gmail.com` não era usuário do app.

Consequências, valendo até haver domínio de e-mail verificado no app (área `custom-email-domains`, ligada ao domínio da onda 4):
- **Suporte:** os e-mails ao suporte (pago, a conferir, prazo, resumo) só chegam depois que `mttcreatt@gmail.com` **entrar uma vez** no app (clique do dono, seção 10). Ele já foi provisionado como usuário comum em 10/11. Até lá, `Operacao ultimo_email_suporte` mostra `falhou status 422`.
- **Comprador:** o e-mail ao comprador fica **desligado**. O comprador é um desconhecido de outra cidade e não é usuário do app; o convite do padrão `ensureBuyerAccount` não o torna registrado antes de ele aceitar. O **recibo** e o **link do rascunho** aparecem em `/obrigado/` por `consultarPedido`, e o recibo do próprio Mercado Pago chega ao pagador. Pedido à onda 2: a chave `rascunho.canais` de `obrigado.json` não pode prometer e-mail.
- `Operacao email_cliente` fica sem valor (desligado). `enviarEmailCliente` só tenta em pedido de teste (`eh_teste`) até o dono ligar, e só faz sentido ligar depois do domínio verificado.
- O padrão tentado continua no código (`email-cliente.server.js`): se o endereço não é usuário, `inviteUser(email, "user")` e depois `SendEmail`. O convite cria um usuário comum, que não lê nenhuma entidade (seção 2). O resultado de cada tentativa fica em `email_resultado` do pedido, sem endereço.

Modelos fixos (`modeloEmailCliente`): `recibo` (pedido, produto, valor, meio, número do pagamento, prazo com a regra, link dos termos), `rascunho` (link com `#t=<token>` quando o executor passa o token, validade de 14 dias), `mensalidade` (plano e link dos termos). Assunto sem nada digitado pelo cliente. Não usa Resend nem outro serviço.

## 8. Provas de 10/11/2026

Arquivos de trabalho em `/tmp/claude-0/-home-user/481145aa-44c7-587c-be27-bbadde2428c0/scratchpad/onda1/1A/` (fora do repositório).

### 8.1 Antes e depois no app (só acréscimo)

- Antes: funções de backend `[]`, workflows `[]`, entidades só `User`, rotas `src/routes/api/time.js`. Checkpoint `6af32521c0baba7bf839652a` ("antes do pacote 1A").
- Depois: entidades `PedidoPortaAberta`, `ContadorDia`, `LimiteTaxa`, `Operacao`; rotas `src/routes/api/pa/` (13 arquivos) e `src/lib/pa/` (5 arquivos); workflows "Porta Aberta rotina" (`6af32ac81c44bac8d5631876`) e "Porta Aberta e-mail ao cliente" (`6af32ad02773909a692bcf9a`), os dois **inativos**. A plataforma também escreveu `base44/entities/User.jsonc` com o esquema que o User já tinha (sem mudança). Funções de backend continuam `[]`. `git diff --stat` no sandbox desde `5cee091`: 25 arquivos, 1723 inserções, 0 remoções. Checkpoint final `6af32d9fd8b0004cccf255fb`. `npx eslint src/lib/pa src/routes/api/pa` e `npm run build` no sandbox: saída 0.
- Dados de teste deixados para o ensaio (todos `eh_teste: true`, fora de toda contagem): `PA-TESTERLS01`, `PA-TEP0S20BX0`, `PA-TESTEMAIL1`. Usuários provisionados: `mttcreatt+usuariocomum@gmail.com` (role `user`, teste das regras de acesso) e `mttcreatt@gmail.com` (role `user`, suporte).
- A rotina rodou 5 vezes por execução manual do workflow (roda como admin, contra o código do sandbox): apagou as linhas de teste vencidas de `LimiteTaxa` e `Operacao`, gravou `resumo_2026-11-10` e contou os e-mails do dia. Uma das 5 deu 404 enquanto o servidor de desenvolvimento recarregava depois de uma edição.

### 8.2 Regras de acesso (20 tentativas anônimas e 20 de usuário comum)

Endpoint REST do próprio app `https://creat-nuvem-404b1994.base44.app/api/apps/<app>/entities/<Entidade>`. Igual para anônimo e para usuário comum recém-provisionado (`mttcreatt+usuariocomum@gmail.com`, role `user`), nas 4 entidades:

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

Por que isso não abre o pedido: (1) toda chamada de navegador vinda de outro site leva `Sec-Fetch-Site: cross-site` e é recusada antes de qualquer leitura ou escrita; (2) nenhuma resposta pública traz dado pessoal; `consultarPedido` exige o segredo de 128 bits; (3) as rotas não usam cookie, então não há credencial a vazar. Depois do deploy, conferir no endereço de produção (seção 10, passo 3) se o cabeçalho próprio vale lá.

### 8.5 E-mail

- Ao suporte, pela rotina chamada pelo workflow (execução manual de teste do Base44, que roda como admin): `Operacao ultimo_email_suporte = "falhou status 422 Emails to people who aren't registered users of this app need a verified custom domain. Connect and verify a domain, ..."`. Repetido depois de provisionar `mttcreatt@gmail.com` como usuário comum: o mesmo 422.
- Ao endereço sem conta `mttcreatt+semconta@gmail.com`: pelo FATO acima, o envio a não registrado exige domínio verificado; o convite não muda isso antes de a pessoa aceitar. O gatilho por entidade (`email_solicitado` gravado pelo `update_entities` do MCP no pedido de teste `PA-TESTEMAIL1`) **não disparou** o workflow no sandbox (zero execuções). Nenhum e-mail foi enviado ao endereço sem conta.
- Estatística de e-mails do app em 10/11: `sent: 0`.

### 8.6 NÃO VERIFICADO

- Webhook de ponta a ponta com pagamento real (depende da compra de teste de R$ 1 do dono, P2): o caminho `pago` com prazo, entrega prevista e e-mail ao suporte nunca rodou com pagamento de verdade.
- As funções internas chamadas com token de admin (gravarRascunho, marcarPedido, operacao, listarPedidosPagos, contarPagos, enviarEmailCliente direto): nenhum agente manuseia token de admin. Caminho de prova: o ensaio da onda 1 (qa) pelos workflows, que chamam como admin.
- Se o cabeçalho de origem que a função lê (`cf-connecting-ip`, `x-real-ip` ou `x-forwarded-for`) é o do visitante em produção. No preview, chamadas seguidas da mesma máquina deram hashes diferentes (o proxy de saída desta sessão troca de IP). Se em produção todos os visitantes parecerem uma origem só, o limite por origem vira limite total: 30 registros por hora.
- Comportamento de CORS em produção com as rotas novas (seção 8.4).

## 9. Hash das regras para o revisor

```
sha256sum projetos/creat-nuvem/schema/pedido-regras.mjs           # neste repositório
sha256sum src/lib/pa/regras.js                                     # no app (run_command do MCP do Base44)
```

Os dois têm de dar o mesmo valor. Valor na entrega do pacote 1A (10/11/2026): `a51a663cdc04235a4ac739c52970c4576f52dbf9fcc0ab8c52217476bb9f0f98` nos dois. Toda mudança nas regras é feita no repositório, testada com `npm test` e copiada byte a byte para o app.

## 10. Para ir ao ar (coordenador)

1. Portões D10 verdes (`npm test`, `checar.cjs`, `conferir-moldura.cjs`, `conferir-boot.cjs`).
2. `create_checkpoint` e deploy do app (publica as rotas; as entidades já existem). As funções antes de qualquer página que as chame.
3. Conferência no ar das funções (com `teste:true` e `utm_content=conferencia`, nada grava):

```bash
O=https://creat-nuvem-404b1994.base44.app
curl -sS -X POST $O/api/pa/registrarPedido -H 'content-type: application/json' -d @projetos/creat-nuvem/schema/exemplos/pedido.registro-v1-teste.valido.json   # {"ok":true}
curl -sS -o /dev/null -w '%{http_code}\n' -X POST $O/api/pa/contar -d '{"evento":"visita","utm_content":"conferencia"}'                      # 204
curl -sS -X POST $O/api/pa/confirmarPagamento -d '{"payment_id":"99999999999"}'                                                           # {"ok":false,"motivo":"nao_confirmado"}
curl -sS -X POST $O/api/pa/consultarPedido -d '{"id":"PA-ZZZZZZZZZZ","segredo":"AAAAAAAAAAAAAAAAAAAAAA"}'                                  # 404 nao_encontrado
curl -sS -o /dev/null -w '%{http_code}\n' -X POST $O/api/pa/registrarPedido -H 'sec-fetch-site: cross-site' -d '{}'                         # 403
curl -sS -o /dev/null -w '%{http_code}\n' -X POST $O/api/pa/rotina -d '{}'                                                                  # 401
curl -sS -o /dev/null -D - -X OPTIONS $O/api/pa/registrarPedido -H 'Origin: https://golpe.example' | grep -i access-control                # registrar o que sair
```

4. Ativar os dois workflows (estão **inativos**): `POST /api/apps/6aefffe66b684db9404b1994/workflows/<id>/toggle-status?status=active` pelo MCP (`execute_api`), com `6af32ac81c44bac8d5631876` (rotina) e `6af32ad02773909a692bcf9a` (e-mail ao cliente).
5. Clique do dono (uma vez): entrar em https://creat-nuvem-404b1994.base44.app/login com a conta Google `mttcreatt@gmail.com`. Depois disso o e-mail ao suporte passa a sair; conferir com a execução manual do workflow da rotina e ler `Operacao ultimo_email_suporte` (tem de dizer `enviado`).
6. Ensaio do qa: repetir o teste do e-mail ao endereço sem conta (`PA-TESTEMAIL1`, `email_solicitado = recibo`) com a gravação pelo endpoint de um registro (`PUT /api/apps/{app_id}/entities/PedidoPortaAberta/{id}`), que pode disparar o gatilho de entidade, e ler `email_resultado`. Resultado esperado pelo FATO: 422 até haver domínio verificado.
