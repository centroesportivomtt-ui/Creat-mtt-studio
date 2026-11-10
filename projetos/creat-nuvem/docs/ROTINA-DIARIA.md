# Rotina diária: carimbo de preço e vagas (pacote 1F, decisão D9)

Trilho, 10/11/2026. Substitui o workflow da Cloudflare (`.github/workflows/rotina-vagas.yml`), que está obsoleto desde a D9 e nunca rodou. Trava de publicação: `docs/EXECUTOR.md` seção 6 e `scripts/trava-deploy.cjs` (pacote 1D). Regra do preço: `docs/ADR-005-preco-inauguracao-7-dias.md`.

## 1. Por que existe e qual é o prazo duro

A página só mostra o preço de inauguração (R$ 297) com `dados/precos.json` carimbado há no máximo 7 dias (ADR-005). O carimbo só vale depois de publicado no app Base44.

- Último carimbo no ar: `2026-11-09T23:45:26Z` (lido em 10/11 em `https://creat-nuvem-404b1994.base44.app/dados/precos.json` e em `public/dados/precos.json` do app).
- **Prazo duro: 16/11/2026, por volta das 23:50 UTC (20:50 em Salvador).** Sem carimbo novo até lá, a página passa a mostrar R$ 497 enquanto os anúncios e os links de pagamento seguem em R$ 297. Anúncio e destino com preços diferentes.
- O primeiro carimbo deve rodar **à mão, logo depois de a tarefa ser criada**, sem esperar as 06:30 do dia seguinte (seção 7).

Como isto ajuda a vender: o comprador que chega do anúncio de R$ 297 encontra R$ 297 na página, todo dia, sem ninguém lembrar.

## 2. A tarefa agendada

| item | valor |
|---|---|
| nome | `Porta Aberta · carimbo diário` |
| quando | todo dia às 06:30 de Salvador: `CRON_TZ=America/Bahia 30 6 * * *` |
| onde roda | na **sessão principal** (a que tem o MCP do Base44 e o repositório), modo "dispara nesta sessão" (sem `create_new_session_on_fire`) |
| quem cria | o coordenador, com `create_trigger`, depois do ensaio verde da onda 1 e **antes de 16/11 23:45 UTC** |
| conectores | só o do Base44 |

Por que 06:30: a executora roda no minuto 41 das 8h às 20h e a rotina do 1A no minuto 17 de cada hora. Às 06:30 nenhuma das duas publica, e o carimbo já está no ar quando chegam os primeiros cliques do dia e quando o gestor de tráfego confere o site (09:12).

Ferramentas permitidas: o repositório (`node`, scripts de `scripts/`), o MCP do Base44 **só no app `6aefffe66b684db9404b1994`** (`query_entities` e `update_entities` em `Operacao`; `query_entities` em `PedidoPortaAberta` só com `fields: ["pedido_id"]`; `read_file`, `write_file`, `run_command`, `create_checkpoint`; `execute_api` só em `GET /api/apps/{app_id}/app-checkpoints`, `POST /api/apps/{app_id}/deploy` e `GET /api/apps/{app_id}/github/connection`) e `curl` ao endereço de produção.

Proibido: Meta Ads (nem pausar: a pausa é do coordenador), Gmail, Drive, GitHub (nada de commit ou push), Stripe, Mercado Pago, outro app do Base44, entidades de token, segredos, `User`, criar ou apagar função, entidade, workflow ou segredo, mudar preço ou link de pagamento, mandar mensagem a qualquer pessoa.

## 3. O prompt da tarefa (o coordenador cola exatamente isto)

```text
Você é o carimbo diário do Porta Aberta, da Creat Nuvem. Português do Brasil, frases curtas.

1. Leia por inteiro projetos/creat-nuvem/docs/ROTINA-DIARIA.md e siga a seção 4, passos 1 a 12,
   na ordem. Se um passo falhar, siga a seção 5. Nada fora do roteiro.
2. Ferramentas: só as da seção 2. Só o app Base44 6aefffe66b684db9404b1994. Nada de Meta Ads,
   Gmail, Drive, GitHub, Stripe ou Mercado Pago. Nunca leia, imprima ou copie segredo, token ou
   chave. Nunca faça commit nem push. Nunca mande mensagem a pessoa nenhuma.
3. Você só publica public/dados/vagas.json e public/dados/precos.json. Qualquer outra mudança no
   app (de outro agente) suspende o deploy.
4. Seu dono da trava é "carimbo:<hora UTC deste despertar em ISO, até o minuto>".
5. Antes de terminar, sempre: solte a trava se ela for sua. Responda em até 5 linhas: carimbo
   publicado (sim ou não), atualizado_em novo, última linha de conferir-no-ar.cjs, e o que falta.
   Se algo precisa do coordenador, comece a mensagem por "ALERTA:" e diga o que, onde e o link.
6. Se Operacao.pausado estiver ligado, não publique nada: responda "pausado" e, se o carimbo
   no ar tiver mais de 5 dias, comece por "ALERTA:".
```

## 4. Roteiro, passo a passo

Variáveis: `APP=6aefffe66b684db9404b1994`, `O=https://creat-nuvem-404b1994.base44.app`, `P=projetos/creat-nuvem`, `TMP` = pasta temporária da sessão (fora do repositório), `DONO=carimbo:<AAAA-MM-DDTHH:MM>` (UTC).

1. **Idade do que está no ar.** `curl -sS $O/dados/precos.json` e anote `atualizado_em` (é o "antes").
2. **Pausa e trava.** `query_entities` `Operacao` `{chave: {$in: ["pausado","trava_deploy","deploys_ultima_hora","vagas_estado"]}}` e salve em `$TMP/operacao.json`. Pausado ligado: pare (prompt, item 6).
3. **Cópia do estado de produção.** O app é a fonte do estado do dia, não o repositório (a executora pode ter fechado a inauguração no app). Com `read_file`, copie `public/dados/vagas.json`, `public/dados/precos.json` e `public/checkout.config.js` para `$TMP/carimbo/dados/vagas.json`, `$TMP/carimbo/dados/precos.json` e `$TMP/carimbo/checkout.config.js`.
4. **Contagem de pagos.** Se `vagas_estado` existir e tiver `em` de menos de 26 horas, use o seu `pagos_inauguracao` como `N`. Senão, `query_entities` `PedidoPortaAberta` `{produto: "pa-abertura-inauguracao-2026-11", status: {$in: ["pago","em_revisao","em_producao","rascunho_enviado","aprovado","no_ar"]}, eh_teste: {$ne: true}}` com `fields: ["pedido_id"]` e `limit: 500`: `N` é o tamanho da lista. Só o número entra no relatório, nunca o id.
5. **Carimbo.** `cd $P && node scripts/atualizar-vagas.cjs --raiz $TMP/carimbo --rotina --pagos-inauguracao N`.
   - Saída 0: siga.
   - Saída 2: carimbou, mas a inauguração acabou e há link de R$ 297 no `checkout.config.js`. Siga e publique (a página cai sozinha em R$ 497), e termine com `ALERTA: inauguração encerrada e links de R$ 297 ainda no checkout.config.js; rodar o workflow "Porta Aberta · fechar R$ 297" e pausar os anúncios que citam R$ 297`.
   - Saída 1: nada foi gravado. Não publique. `ALERTA: atualizar-vagas.cjs recusou os dados do app` com a mensagem de erro.
   Grave `{"atualizar_vagas": true}` em `$TMP/portoes-dados.json` só com saída 0 ou 2.
6. **Pegar a trava.** `node scripts/trava-deploy.cjs pegar --dono $DONO --estado $TMP/operacao.json`. Saída 3: não publique agora; espere 10 minutos e repita os passos 2 e 6 uma vez; segunda recusa: `ALERTA: trava de publicação ocupada por <dono>; carimbo não publicado`. Saída 0: rode a chamada do campo `mcp` (o `update_entities` condicional), releia `Operacao` para `$TMP/operacao.json` e rode `trava-deploy.cjs confirmar --dono $DONO --estado $TMP/operacao.json`. Saída diferente de 0: recue.
7. **Portões.** `node scripts/trava-deploy.cjs pode-publicar --dono $DONO --estado $TMP/operacao.json --tipo dados --portoes $TMP/portoes-dados.json`. Saída 3: siga o `motivo` (seção 5).
8. **Ponto de volta.** `execute_api GET /api/apps/{app_id}/app-checkpoints?limit=20`. Anote o id com o `last_deployed_at` mais recente: é o checkpoint de volta (`CK_ANTES`).
9. **Subir só os dois arquivos.** `write_file` com `overwrite: true` em `public/dados/vagas.json` e `public/dados/precos.json`, com o conteúdo de `$TMP/carimbo/dados/`. Depois, `run_command` `git status --porcelain` e `git diff --stat <git_commit_hash de CK_ANTES> HEAD`: só podem aparecer esses dois caminhos. Apareceu outro: **não faça deploy**, volte os seus dois arquivos ao conteúdo do passo 3 e `ALERTA: há mudança alheia no app; carimbo suspenso`. `execute_api GET /api/apps/{app_id}/github/connection` tem de dar `connected: false`; ligado: não publique e `ALERTA:`.
10. **Checkpoint e deploy.** `create_checkpoint` com o nome `carimbo dados <AAAA-MM-DD>`. `execute_api POST /api/apps/{app_id}/deploy` com `{"checkpoint_id": "<id do checkpoint>"}`. Depois, `trava-deploy.cjs registrar-deploy --dono $DONO --estado $TMP/operacao.json` e grave o campo `gravar` em `Operacao`.
11. **Conferir no ar.** Repita `curl -sS $O/dados/precos.json` a cada 30 segundos, até 5 minutos, até o `atualizado_em` ser o novo. Depois, `node scripts/conferir-no-ar.cjs --json $TMP/conferencia.json` e guarde a última linha. Os dois verdes: grave em `Operacao` a linha `{chave: "carimbo_ultimo", valor: "<atualizado_em novo>", expira_em: <agora + 400 dias>}`.
12. **Soltar a trava.** `node scripts/trava-deploy.cjs soltar --dono $DONO --estado $TMP/operacao.json` e a chamada do campo `mcp`. Sempre, inclusive depois de erro. Responda no formato do prompt, item 5.

O repositório não recebe o carimbo: `dados/*.json` do git é referência, não produção. Por isso a seção 6.

## 5. Se algo falhar

| o que falhou | o que fazer |
|---|---|
| `curl` do passo 11 não mostra a data nova em 5 minutos | `deploy` com `{"checkpoint_id": "<CK_ANTES>"}`, `conferir-no-ar.cjs` de novo, soltar a trava e `ALERTA: carimbo publicado não apareceu no ar; voltei ao checkpoint anterior` |
| `conferir-no-ar.cjs` sai com 1 | volta ao `CK_ANTES` pelo `deploy` (o rollback também conta no teto de 3 por hora), roda a conferência de novo e responde `ALERTA:` com as linhas `FALHA` e o resultado depois da volta. **A pausa dos anúncios é do coordenador**: esta tarefa não toca na Meta. Se a conferência falhar também depois da volta, o defeito não é do carimbo: diga isso no alerta |
| `conferir-no-ar.cjs` sai com 2 (ambiente) | não volte nada: o carimbo foi conferido pelo `curl`. `ALERTA: conferência no ar não rodou (ambiente)` |
| trava ocupada, `teto_por_hora` ou `trava_quase_vencida` | uma nova tentativa em 10 minutos; depois, `ALERTA:` com o motivo. O carimbo pode atrasar horas sem dano: o preço vale 7 dias |
| `pausado` | não publica. Alerta só se o carimbo no ar tiver mais de 5 dias |
| a tarefa não rodou (sessão principal arquivada, cota, erro) | o gestor de tráfego confere a idade do carimbo às 09:12 (`marketing/trafego/ROTINA-GESTOR.md`, adendo de 10/11 do pacote 1F) e avisa com mais de 30 horas |

Regra de idade (usada pelo gestor e por quem ler o alerta): até 30 horas, normal; de 30 horas a 5 dias, nível 2 (rodar o carimbo à mão no mesmo dia); mais de 5 dias, nível 3 (faltam menos de 2 dias para a página cair em R$ 497).

## 6. Quem publica a vitrine não pode desfazer o carimbo

`scripts/montar-publico.cjs` copia `dados/*.json` do repositório para o público. Uma publicação da vitrine feita a partir do repositório **volta o carimbo para a data do git** e pode derrubar a inauguração antes do prazo. Regra: antes de publicar a vitrine, quem publica (coordenador) roda `node scripts/atualizar-vagas.cjs --confirmar` no repositório ou copia `public/dados/*.json` do app para o pacote que vai subir, e confere depois pelo `curl` do passo 11 que o `atualizado_em` no ar não ficou mais velho que o de antes.

## 7. Para pôr no ar (coordenador)

1. Ensaio verde da onda 1 (`docs/EXECUTOR.md` seção 9) e a linha `trava_deploy` criada em `Operacao`.
2. Merge do branch de trabalho no `main` (a tarefa lê os scripts do repositório da sessão principal).
3. Criar a tarefa: `create_trigger` com `name: "Porta Aberta · carimbo diário"`, `cron_expression: "CRON_TZ=America/Bahia 30 6 * * *"`, sem `create_new_session_on_fire`, `connectors: ["Base44"]`, `initiation: "human_schedule"` e o prompt da seção 3.
4. Disparar uma vez na hora (`fire_trigger`) e conferir `curl -sS https://creat-nuvem-404b1994.base44.app/dados/precos.json` com a data nova. **Limite: 16/11/2026 23:45 UTC.**
5. No mesmo ato do deploy das funções da onda 1, trocar `FUNCOES_PUBLICADAS = false` para `true` em `scripts/conferir-no-ar.cjs` e rodar `node scripts/conferir-no-ar.cjs --so-funcoes --exigir-funcoes`. Colar a última linha no relatório. A frase "funcionam de ponta a ponta" só sai com o grupo I inteiro conferido; se a última linha disser "as funções do pedido NÃO foram conferidas (N itens)", ninguém escreve "funcionando".
6. Linhas de prova da conferência (não apagar): `Operacao` com `chave: "prova_conferencia"` e `PedidoPortaAberta` com `pedido_id: "PA-PROVACONF1"` (`eh_teste: true`, `produto: "pa-teste"`, valor 0, sem dado pessoal, fora de toda contagem). A conferência exige que o update anônimo no id delas dê 403, o que só acontece com a linha existindo, enquanto list e filter devolvem `[]`. Se ela acusar "a linha de prova sumiu": `create_checkpoint`, recriar a linha pelo MCP com os mesmos campos, conferir com `query_entities` e trocar o id em `LINHAS_DE_PROVA` no script. Limpeza de pedidos de teste nunca leva estas duas linhas.

## 8. Conciliação das assinaturas (pedido do 1D)

`docs/EXECUTOR.md` (mensalidade) põe nesta rotina a conciliação do Stripe. A tarefa não tem Stripe, por desenho. Ela só conta, pelo MCP, os pedidos `no_ar` sem `assinatura_confirmada_em` com `no_ar_em` de mais de 3 dias (`fields: ["pedido_id"]`) e, se houver algum, termina com `ALERTA: <n> pedido(s) no ar sem assinatura conferida`. A conferência no Stripe é do suporte (`https://dashboard.stripe.com/subscriptions`, procurar o id do pedido em "client reference"). Enquanto `no_ar_em` e `assinatura_confirmada_em` não existirem no esquema (pedido do 1D ao 1A), este passo é pulado e dito na resposta.
