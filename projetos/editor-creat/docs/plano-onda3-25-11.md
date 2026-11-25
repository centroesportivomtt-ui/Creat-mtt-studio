# Plano da onda 3: a conversa age em mais coisas, apagar projeto, regras no Caderno e prazo da conversa

Data: 25/11/2026 · Autor: Cirro (arquiteto) · Estado: **contrato fechado para construir**. Nada foi implementado.
Base: `docs/plano-conversa-25-11.md` (seções 3, 5, 13 e "Ondas seguintes"), `services/motor/README-conversa.md`, `PROGRESSO.md`
(25/11, conversa no ar) e o código desta cópia (commit 3603428). Raiz dos caminhos: `projetos/editor-creat`.
"arquivo:linha" quer dizer que li o trecho hoje. O que não li ou não medi está marcado "não confirmado".

Regras que valem para tudo abaixo (vêm do pedido desta onda e do plano anterior):
- Campo novo em schema ou resposta é **opcional**. Rota e resposta antigas não mudam. Nenhum tipo de evento novo nesta onda.
- O Nimbus **nunca** ganha ferramenta de apagar. Apagar projeto e apagar regra são **só botões da tela**.
- Toda ação da conversa que muda alguma coisa passa por cartão montado pelo código, guarda de estado ao criar e de novo no
  toque, trava por projeto, decisão única e `entrada_hash` (o mesmo caminho de `propor_ajuste`, `conversa/laco.py:542-614`).
- Custo zero nos testes: cérebro falso (`EDITOR_CONVERSA_CEREBRO=falso`) e testes sem rede.

---

## 0. Resumo das decisões

| # | Decisão | Por quê, em uma linha |
|---|---|---|
| D20 | Uma função só de "refazer etapa" (`motor/refazer.py`), usada pela conversa (cartão) e pela tela (botão "Tentar de novo") | Uma guarda só: a tela e a conversa não podem divergir |
| D21 | A trava que vale é a **transação `BEGIN IMMEDIATE`** com a guarda lida de novo dentro dela; a `asyncio.Lock` da conversa é só a primeira camada | O worker, a tela e a conversa rodam em threads e processos diferentes; só o SQLite serializa os três |
| D22 | Refazer só roda sobre o que **falhou** (ou, na conferência, quando as regras mudaram). Refazer o que deu certo não entra | `montagem.pode_reaproveitar` e `qa.pode_reaproveitar` devolveriam o mesmo filme: seria um botão que não faz nada |
| D23 | Todo refazer (e a troca de música) grava `dados.correcoes_auto = 2` | Sem isso, uma reprovação da conferência dispara direção nova paga sozinha (`pipeline.py:79-87`): custo escondido |
| D24 | "Entregar de novo" enfileira a **conferência** (que se reaproveita se nada mudou) e ela encadeia a entrega; nunca publica | `entrega.py:64-80` recusa QA velho; a conferência resolve isso de graça. A entrada nova nunca leva `publicar_em` |
| D25 | **Trocar a música = nova versão sem cérebro**: copia a direção da versão, troca `trilha.id`, roda só o resolvedor | Investigação na seção 5: a troca muda a grade de cortes, então "só o mix" não existe; o cérebro não é preciso e não trava nada |
| D26 | `anotar` também passa por cartão | Nota escrita pelo modelo e devolvida depois seria um canal para lavar instrução escondida |
| D27 | Apagar projeto: **banco primeiro, numa transação, depois os arquivos**, com diário em `<dados>/apagar/<pid>.json` e varredura no worker | O projeto some de uma vez; arquivo que sobrar por queda é apagado depois; nada de projeto vivo é tocado |
| D28 | Apagar recusa enquanto houver job `pendente` ou `rodando` (qualquer etapa, de fundo inclusive), turno da conversa rodando ou filme na página de entregas | Sem corrida com o worker; nada público fica apontando para coisa apagada |
| D29 | Filme na página de entregas: **recusa com frase clara + rota nova "Tirar da página"** (reusa `api/direcao._retirar_das_entregas`) | Hoje não existe botão de retirar; recusar sem saída seria deixar o dono preso |
| D30 | Regra apagada vira **lápide** em `memoria/apagados.json`; a `Loja` e o `semear` respeitam a lápide | `semear.py:10-11` repõe tudo o que está no git a cada boot, e o backup leva as regras do servidor para o git |
| D31 | Só se apaga o que nasceu de ajuste do dono (`r_dono_*`, `c_dono_*`, vocabulário com origem "reprovação do dono"). As da casa aparecem como "fixa da casa" | As da casa vêm do código; apagar e ver voltar no próximo deploy seria mentira |
| D32 | Apagar checagem recusa enquanto houver `qa` ou `entrega` `pendente`/`rodando` em **qualquer** projeto | A chave da conferência inclui as checagens (`qa/__init__.py:294-304`): trocar no meio derruba a entrega com erro |
| D33 | Retenção: apaga mensagens e eventos de conversa de **capítulos fechados** há mais de N dias, por corte de tempo `ts < fechado`, numa função nova `worker.limpezas()` | O capítulo k+1 nasce no mesmo instante em que o k fecha (`repo.py:38-43`), então o corte por tempo é exato; função nova para não mudar `periodicas()` (o teste `test_espelho.py:145-150` compara a saída inteira) |
| D34 | Capítulo 2 das ferramentas: `FERRAMENTAS_VERSAO = "2"`, `PROMPT_VERSAO = "nimbus-2"`, 13 ferramentas | D9: ferramenta nova só em capítulo novo. Capítulo velho continua com as 7 dele até a próxima mensagem |
| D35 | Ajuste agendado durante a montagem **fica fora** | Mudaria o 409 da rota antiga e cria corrida com o ajuste automático do QA (seção 13) |

---

## 1. Rotas novas e mudadas

Todas sob `/v1`, atrás do token do motor. Erros como `{"detail": "<frase>"}` em pt-BR. Toda rota com `{pid}` valida o
formato **antes de abrir o banco**: `^p_[a-z0-9]{4,40}$` (o mesmo do proxy). Fora do formato: `404 "projeto não encontrado"`.
`{v}`: `^v[0-9]{1,3}$`, senão `404 "versão não encontrada"`.

| # | Método e rota | Corpo | Resposta | Erros (frase exata) | Arquivo |
|---|---|---|---|---|---|
| R11 | `GET /v1/projetos/{pid}/refazer` | — | `200 {opcoes: Opcao[], sugerida: int\|null}` (tipo `Opcao` abaixo) | `404 "projeto não encontrado"` | `api/refazer.py` (novo) |
| R12 | `POST /v1/projetos/{pid}/refazer` | `{de: "montagem"\|"conferencia"\|"entrega"\|"leitura"\|"catalogo"\|"direcao", versao?: "vN", arquivo_id?: str ≤ 40 [A-Za-z0-9_-]}` | `202 {feito: true, de, alvo: str, estado: str}` (`estado` = estado do projeto depois) | `404 "projeto não encontrado"`; `422 "diga qual vídeo"` (leitura sem `arquivo_id`); `409 "não deu: <porquê da guarda>"` (seção 2.3) | `api/refazer.py` |
| R13 | `GET /v1/projetos/{pid}/apagar` | — | `200 Previa` (abaixo) | `404 "projeto não encontrado"` | `api/apagar.py` (novo) |
| R14 | `POST /v1/projetos/{pid}/apagar` | `{nome: str 1..200}` | `200 {apagado: true, arquivos: "apagando"}` | `404 "projeto não encontrado"`; `422 "o nome não confere; digite o nome do projeto como aparece no topo"`; `409` com as frases da seção 7.2 | `api/apagar.py` |
| R15 | `POST /v1/projetos/{pid}/versoes/{v}/retirar` | `{}` | `202 {estado: "retirando"}` (idempotente: já retirando devolve o mesmo) | `404 "versão não encontrada"`; `409 "esta versão não está na página de entregas"`; `503 "a página de entregas está desligada neste servidor"` | `api/apagar.py` |
| R16 | `POST /v1/memoria/regras/{id}/apagar` | `{}` | `200 {apagado: {tipo: "regra", id, texto}}` | `404 "só dá para apagar o que nasceu de um ajuste seu"` (id fora de `^r_dono_[0-9a-f]{8}$`); `404 "essa regra não existe mais"` | `api/memoria.py` (novo) |
| R17 | `POST /v1/memoria/checagens/{id}/apagar` | `{}` | `200 {apagado: {tipo: "checagem", id, texto}}` | como R16, com `^c_dono_[0-9a-f]{8}$` e "essa conferência não existe mais"; `409 "uma conferência ou entrega está rodando agora; apague quando ela terminar"` | `api/memoria.py` |
| R18 | `POST /v1/memoria/vocabulario/{id}/apagar` | `{}` | `200 {apagado: {tipo: "vocabulario", id, texto: "<de> → <para>"}}` | como R16, com `^v_[0-9a-f]{8}$` e "essa palavra não existe mais" | `api/memoria.py` |
| R19 | `GET /v1/memoria` (existente) | — | cada item de `regras`, `checagens` e `vocabulario` ganha, **opcionais**: `id` (vocabulário), `apagavel: bool`, `de_onde?: {projeto?: str, nome?: str, versao?: str, data?: "AAAA-MM-DD"}`, `ao_apagar?: str`. O resto igual | — | `api/direcao.py` (só a função `memoria`) |
| R20 | `GET /v1/conversa` e `POST /v1/conversa` (existentes) | — | ganham `retencao_dias: int` (0 = para sempre) | — | `api/conversa.py` (`ver_chave`, `mudar_chave`) |

Tipos (R11, R13), espelhados em `apps/web/lib/acoes.ts`:
```ts
type Opcao = {
  de: 'montagem'|'conferencia'|'entrega'|'leitura'|'catalogo'|'direcao';
  versao?: string; arquivo_id?: string; n_video?: number;
  titulo: string;            // "Montar de novo a V2"
  faz: string;               // frase da seção 4, montada pelo código
  refaz: ('direcao'|'montagem'|'qa'|'entrega'|'leitura'|'encaixe')[];
  custo_usd_est: number; custo_ate: boolean;          // true: "até US$ x" (sem histórico)
  partes?: { rotulo: string; usd: number }[];          // de onde vem o custo
  minutos_est: number;
  atencao?: string; volta: string; botao: string;      // botao: o verbo exato do botão
  pela_conversa: boolean;    // false para catalogo e direcao (o Nimbus não propõe o que chama o cérebro)
};
type Previa = {
  pode: boolean; porque?: string; nome: string;
  vai_apagar: { videos: number; bytes: number; versoes: number; mensagens_conversa: number; links_cliente_ativos: number };
  na_pagina: { versao: string; estado: 'no_ar'|'pendente'|'enviando'|'retirando'; proxima?: string }[];
  fica: string[];            // as 3 frases da seção 7.4
  restos_previstos?: { pagina_desligada?: string[]; copia_material?: number };
};
```
`sugerida`: índice da opção que o botão "Tentar de novo" usa: a do job que falhou por último (`jobs.atualizado` maior); com o
projeto em `reprovado_qa`, a opção `conferencia` se existir; senão `null`.

**Proxy** (`apps/web/app/api/motor/[...rota]/route.ts:10`): as rotas R11 a R15 já passam por `projetos\/p_…(\/…)?`. Entra
uma alternativa nova logo depois de `memoria|`:
```
memoria\/(regras\/r_dono_|checagens\/c_dono_|vocabulario\/v_)[0-9a-f]{8}\/apagar|
```
A expressão inteira fica:
```
/^v1\/(saude|conversa|memoria|memoria\/(regras\/r_dono_|checagens\/c_dono_|vocabulario\/v_)[0-9a-f]{8}\/apagar|referencias|backup|backup\/config|backup\/rodar|gastos|entregas\/clientes|clientes|clientes\/lc_[a-f0-9]{12}\/(revogar|tratar)|biblioteca|biblioteca\/(trilha|sfx)\/[a-z0-9_-]{2,41}\/retirar|projetos|projetos\/p_[a-z0-9]{4,40}(\/[A-Za-z0-9_\-./]+)?|arquivos\/[A-Za-z0-9_\-./]+)$/
```
Nenhum método novo no proxy: tudo que muda é `POST` (o proxy só exporta GET, HEAD e POST e exige mesma origem no POST).

**R6 (`/conversa/confirmar`) não muda de corpo.** A resposta ganha em `resultado`, opcionais: `refazendo?: str` (o `de`),
`trocando_musica?: true`, `nota?: str` (id da nota).

---

## 2. Guarda de estado

### 2.1 Regra comum (D21)
- A guarda roda **três vezes**: ao montar a opção ou o cartão, no toque (dentro de `_decidir`) e **dentro da transação
  `BEGIN IMMEDIATE` que grava**. Só a terceira decide. Se ela recusa: `ROLLBACK` e `409 "não deu: <porquê>"` (no cartão,
  "Não deu · <porquê>").
- Dentro da mesma transação: guarda, `UPDATE`s, `banco.enfileirar(...)` e `banco.mudar_estado(...)`. Nada de
  `banco.atualizar_dados` ali dentro (ele abre transação própria, `banco.py:97-111`): o `dados` é lido e gravado à mão na
  mesma transação.
- **Duplicar job** é impossível: `UNIQUE (etapa, projeto, alvo)` (`banco.py:36`) + guarda "fila livre" lida dentro da transação.
- "Fila livre" = nenhum job do projeto com etapa em `catalogo, direcao, montagem, qa, entrega` em `pendente` ou `rodando`
  (`conversa/acoes.py:25`, `ETAPAS_EDICAO`). Etapas de fundo (`entregas`, `espelho`) não contam para refazer; contam para apagar.
- "Versão mais nova" = maior número em `versoes` (`acoes.versoes`). "Aprovada" = está em `dados.aprovadas`.
- Cartões da conversa mantêm a regra de hoje: um cartão aberto por projeto (`_outra_confirmacao`). A rota da tela (R12) não
  olha cartões; se a tela agir primeiro, o cartão cai em "Não deu" no toque.

### 2.2 Estado do projeto × o que pode
✓ = pode, se as condições da 2.3 passarem. ✗ = nunca nesse estado. "tela" = só pela tela (R12), nunca pela conversa.

| Estado do projeto | pedido (existente) | ajuste (existente) | montar de novo | conferir de novo | entregar de novo | ler de novo um vídeo | catálogo (tela) | direção (tela) | trocar música | anotar | apagar projeto |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `recebendo` | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ sem job ativo |
| `lendo` | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ | ✓ sem job ativo (em geral há) |
| `dirigindo`, `montando`, `conferindo` | ✗ | ✗ | ✗ (fila) | ✗ (fila) | ✗ (fila) | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ (job ativo) |
| `entregue` | ✗ | ✓ | ✗ (nada falhou) | ✗ (nada falhou) | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ sem filme na página |
| `erro` | ✗ | ✓ só se a mais nova está `entregue` | ✓ | ✓ | ✓ | ✓ se nenhum vídeo foi lido | ✓ | ✓ | ✗ | ✓ | ✓ |
| `reprovado_qa` | ✗ | ✗ (versão não está `entregue`) | ✗ | ✓ se as regras mudaram | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ | ✓ |
| versão mais nova aprovada (qualquer estado) | — | ✗ | ✗ | ✗ | ✗ | — | — | — | ✗ | ✓ | ✓ sem filme na página |

### 2.3 Condições por ação (ordem de checagem = ordem da frase devolvida)
Abreviações: `V` = versão pedida (padrão: a mais nova); `N` = número do vídeo na ordem do envio (nunca o nome do arquivo).

| Ação | Condições (na ordem) e a frase quando falha |
|---|---|
| comum às de versão | 1. `V` existe → "a versão {V} não existe"; 2. `V` é a mais nova → "a {V} não é a mais nova; a mais nova é a {M}"; 3. não aprovada → "a {V} já foi aprovada"; 4. estado de `V` ≠ `reprovada` → "a {V} foi reprovada por você; a direção nova já cuida dela"; 5. fila livre → "a mesa está trabalhando neste projeto agora ({rótulo}); espere terminar" (rótulo: `catalogo` "organizando o material", `direcao` "a direção", `montagem` "a montagem", `qa` "a conferência", `entrega` "a entrega") |
| montar de novo | comum + `saidas/{pid}/{V}/edl.json` existe → "a {V} não tem a direção guardada; peça um ajuste" + job `(montagem, V)` em `falhou` → "a montagem da {V} não falhou; montar de novo daria o mesmo filme" |
| conferir de novo | comum + `final.mp4` e `montagem.json` existem → "a {V} não tem o filme montado guardado; peça um ajuste" + (job `(qa, V)` em `falhou` **ou** (projeto `reprovado_qa`, `V` em `reprovada_qa` e a chave mudou)) → "nada mudou desde a última conferência da {V}; o resultado seria o mesmo". "A chave mudou" = `qa.chave_conferencia(<conteúdo de qa.sha256>, edl)` ≠ `<conteúdo de qa.chave>`; sem esses arquivos conta como mudou |
| entregar de novo | comum + `qa.json` existe com `aprovado: true` → "a conferência reprovou a {V}; entregar assim não dá. Peça um ajuste" + job `(entrega, V)` em `falhou` → "a entrega da {V} não falhou" |
| ler de novo | 1. o arquivo existe no projeto → "esse vídeo não existe neste projeto"; 2. `arquivos.estado = 'falhou'` → "o vídeo {N} não ficou de fora"; 3. a edição não começou (nenhuma versão; nenhum job de `ETAPAS_EDICAO` em `pendente`, `rodando` ou `feito`) → "a edição já começou; um vídeo lido agora não entra mais neste filme"; 4. nenhum job `ingest`/`analise` deste arquivo em `pendente`/`rodando` → "o vídeo {N} já está sendo lido" |
| catálogo (tela) | fila livre + job `(catalogo, '-')` em `falhou` → "o catálogo não falhou" |
| direção (tela) | fila livre + job `(direcao, '-')` em `falhou` → "a direção não falhou" |
| trocar música | comum, mais: estado de `V` = `entregue` → "a {V} ainda não foi entregue (está {estado})"; `projetos/{pid}/direcao_{n}.json` existe → "a {V} não tem direção guardada (foi montada de um roteiro fixo); peça um ajuste"; a trilha está em `armazem_b.trilhas(cfg)` → "essa música não está na biblioteca (ou não tem licença registrada)"; a trilha ≠ a que `V` toca (`edl.trilha.chave`) → "a {V} já usa essa música"; e, na conversa, nenhum outro cartão aberto |
| anotar | projeto existe; `len(dados.notas) < 50` → "o projeto já tem 50 notas"; se `versao` veio, ela existe → "a versão {V} não existe" |
| apagar projeto | seção 7.2 |
| apagar checagem | nenhum job `qa` ou `entrega` em `pendente`/`rodando` em projeto nenhum → frase de R17 |

### 2.4 O que cada execução grava (dentro da transação)
| Ação | Grava | Estado e mensagem (`banco.mudar_estado`, tipo `estado` existente) |
|---|---|---|
| montar de novo | `UPDATE versoes SET estado='montando' WHERE projeto=? AND id=? AND estado='erro'`; `dados.correcoes_auto=2`; `enfileirar('montagem', pid, V, prioridade=2)` | `montando` · "Montando a {V} de novo, a seu pedido." |
| conferir de novo | `UPDATE versoes SET estado='montada' WHERE … AND estado IN ('erro','reprovada_qa')`; `correcoes_auto=2`; `enfileirar('qa', pid, V, prioridade=1)` | `conferindo` · "Conferindo a {V} de novo, a seu pedido." |
| entregar de novo | igual a conferir (D24) | `conferindo` · "Conferindo e entregando a {V} de novo, a seu pedido." |
| ler de novo | se o job `ingest` do arquivo está `falhou`: `arquivos.estado='recebido'` e `enfileirar('ingest', pid, aid, entrada=<entrada guardada do job>, prioridade=5)`; senão `arquivos.estado='ingerido'` e `enfileirar('analise', pid, aid, prioridade=4)` | projeto em `erro`: `lendo` · "Lendo o vídeo {N} de novo, a seu pedido." Senão: evento `aviso` (tipo existente) com `mensagem` igual e sem `estado` |
| catálogo (tela) | `enfileirar('catalogo', pid, prioridade=3)` | `dirigindo` · "Organizando o material de novo, a seu pedido." |
| direção (tela) | `enfileirar('direcao', pid, entrada=<entrada guardada do job>, prioridade=2)` | `dirigindo` · "Tentando a direção de novo, a seu pedido." |
| trocar música | `correcoes_auto=2`; `enfileirar('direcao', pid, entrada={"trocar_trilha": {"de": V, "trilha": id}}, prioridade=1)` | `dirigindo` · "Trocando a música da {V}, sem nova direção." |
| anotar | `dados.notas.append({id: "n_"+6 hex, texto, versao?, t?, em, por: "conversa"})` | nenhum (a `resposta` do cartão já diz) |

- Por que reabrir o arquivo para `recebido`/`ingerido` importa: `pipeline.pronto_para_dirigir` (`pipeline.py:32-40`) conta
  como pendente todo arquivo fora de `analisado`/`falhou`. Assim a edição espera a nova leitura em vez de começar sem o vídeo.
- `banco.enfileirar` em job `falhou` volta a `pendente` com `tentativas=0` e mantém `max_tentativas` (`banco.py:152-165`). Job
  que morreu por `ErroDefinitivo` tem `max_tentativas=tentativas` (`worker.py:140`), então ganha **uma** tentativa nova. É o
  certo: erro definitivo repetido não deve rodar 3 vezes.
- A cadeia depois do job segue o `pipeline.depois` de sempre. Nenhum job novo leva `publicar_em` (D24).

---

## 3. Ferramentas do Nimbus (capítulo 2)

`FERRAMENTAS_VERSAO = "2"` e `PROMPT_VERSAO = "nimbus-2"`. Capítulo aberto com as 7 antigas continua com elas (as tools
ficam congeladas no `tools_json` do capítulo) até a próxima mensagem do dono, que abre o capítulo novo com ficha
(`laco._precisa_capitulo`, `laco.py:132-140`). Custo dessa virada: reescrever o prefixo uma vez por projeto ativo
(≈ 7.000 tokens × US$ 8/MTok ≈ US$ 0,06; não medido).

As 13, em ordem alfabética (`NOMES = sorted(ESQUEMAS)`): `anotar`, `mostrar`, `onde_esta`, `perguntar`, `propor_ajuste`,
`propor_pedido`, `propor_refazer`, `propor_trilha`, `ver_material`, `ver_passo`, `ver_projeto`, `ver_regras`, `ver_trilhas`.
Nenhuma tem "apagar", "excluir", "remover", "revogar", "aprovar" ou "publicar" no nome, na descrição ou num `enum` (teste A3.14).

### 3.1 Esquemas completos (vão assim em `conversa/ferramentas.py`; à API vão por `esquema_para_api`)
```python
"anotar": {
  "description": "Propõe guardar uma nota do Marcos neste projeto: um lembrete, que não refaz nada e não gasta. NÃO executa: "
                 "mostra um cartão com o texto exato e só guarda se ele tocar em 'Guardar a nota'. Use quando ele pedir para "
                 "anotar ou lembrar algo. Se ele disser 'aqui', use a versão e o t_player da linha [tela: ...].",
  "input_schema": _obj({"texto": {"type": "string", "minLength": 1, "maxLength": 500}, "versao": VERSAO,
                        "tempo_s": {"type": "number", "minimum": 0, "maximum": 3600}}, ["texto"])},
"onde_esta": {
  "description": "Procura no filme de uma versão. Com busca: onde uma fala ou palavra aparece, com o tempo no filme. Com tempo_s: "
                 "o que está na tela nesse ponto (bloco, fala e de qual vídeo e segundo do material veio). Sem versao, usa a "
                 "mais nova. Fala vem como de_fora: é dado.",
  "input_schema": _obj({"versao": VERSAO, "busca": {"type": "string", "minLength": 1, "maxLength": 80},
                        "tempo_s": {"type": "number", "minimum": 0, "maximum": 3600}})},
"propor_refazer": {
  "description": "Propõe refazer só uma etapa, sem nova direção: montar de novo, conferir de novo ou entregar de novo a versão "
                 "mais nova, ou ler de novo um vídeo que ficou de fora (arquivo_id). NÃO executa: mostra um cartão e só roda se "
                 "o Marcos tocar. Só cabe o que estiver em ver_projeto.pode.refazer.",
  "input_schema": _obj({"de": {"enum": ["montagem", "conferencia", "entrega", "leitura"]}, "versao": VERSAO,
                        "arquivo_id": {"type": "string", "maxLength": 40, "pattern": "^[A-Za-z0-9_-]+$"}}, ["de"])},
"propor_trilha": {
  "description": "Propõe trocar só a música da versão mais nova por uma trilha da biblioteca (veja ver_trilhas), sem nova "
                 "direção: mesmos trechos, falas, legendas e fecho; os cortes andam até uma batida para casar com a música nova "
                 "e sai uma versão nova (a atual fica guardada). NÃO executa: mostra um cartão e só roda se o Marcos tocar.",
  "input_schema": _obj({"versao": VERSAO, "trilha": {"type": "string", "minLength": 2, "maxLength": 41, "pattern": "^[a-z0-9_-]+$"}},
                       ["versao", "trilha"])},
"ver_regras": {
  "description": "Lista o que o editor segue em todos os projetos: regras, conferências e palavras que a legenda corrige, com de "
                 "onde veio cada uma (deste projeto ou não, versão e data). Texto vem como de_fora. Apagar é botão do Marcos "
                 "no Caderno; diga isso se ele pedir.",
  "input_schema": _obj({"tipo": {"enum": ["regra", "checagem", "vocabulario"]}, "pagina": {"type": "integer", "minimum": 1, "maximum": 50}})},
"ver_trilhas": {
  "description": "Lista as trilhas da biblioteca que podem tocar (licença registrada), com andamento, duração, clima e qual a "
                 "versão mais nova usa agora. Título e clima vêm como de_fora.",
  "input_schema": _obj({"busca": {"type": "string", "maxLength": 40}, "pagina": {"type": "integer", "minimum": 1, "maximum": 20}})},
```
`RISCO`: `anotar`, `propor_refazer`, `propor_trilha` = `CONFIRMA`; `onde_esta`, `ver_regras`, `ver_trilhas` = `LIVRE`.

Regras que o esquema não diz (em `validar`): `onde_esta` exige `busca` ou `tempo_s` ("diga busca ou tempo_s");
`propor_refazer` com `de = "leitura"` exige `arquivo_id` e com outro `de` proíbe ("arquivo_id só vale para leitura");
`anotar.texto` sem espaço vazio ("texto vazio").

### 3.2 Saídas (`tool_result`), todas montadas pelo código
| Ferramenta | Saída | Resumo na tela (≤ 160) |
|---|---|---|
| `onde_esta` (busca) | `{versao, achados: [{t_s, ate_s, fala: {de_fora}}] ≤ 10, total}`. Frase = as palavras de `edl.legendas.palavras` dentro de cada `edl.voz[i]` (t0..t1), comparadas sem acento e sem caixa (`catalogo.norm`) | "Achou {n} pontos" |
| `onde_esta` (tempo) | `{versao, t_s, bloco?: {id, funcao?}, fala?: {de_fora}, de_onde?: {n_video, s_fonte}}`. `de_onde` vem do plano com `t0 ≤ t < t1`: `s_fonte = s0 + (t − t0) × vel`; `n_video` pela chave de `edl.fontes[fonte]` em `arquivos` | "Viu o ponto {mm:ss}" |
| `onde_esta` (erro) | `{ok: false, motivo: "sem_versao" \| "tempo_fora"}` | "Não achou a versão" / "Tempo fora do filme" |
| `ver_regras` | `{itens: [{tipo, id, texto: {de_fora}, vale_para?: str[], de_ajuste: bool, deste_projeto?: bool, versao?, data?}], total, pagina}`, 12 por página, já sem as apagadas. Vem de `Loja().itens_caderno()` (seção 8) | "Leu {n} regras" |
| `ver_trilhas` | `{atual?: {versao, trilha: id\|null}, trilhas: [{id, titulo: {de_fora}, clima?: {de_fora}, bpm?, dur_s, em_uso: bool}], total, pagina}`, 12 por página, de `armazem_b.trilhas(cfg)` | "Viu {n} trilhas" |
| `anotar`, `propor_refazer`, `propor_trilha` | pausa com cartão. Depois do toque: `{feito: true, refazendo?: de, trocando_musica?: true, nota?: id}` ou `{feito: false, motivo: "dono_disse_nao"\|"estado_mudou"\|"erro", detalhe?}` | cartão |
| `ver_projeto` (existente, só acrescenta) | `notas: [{texto: {de_fora}, versao?, t?, em}]` (as 10 últimas) e `pode` com: `propor_trilha: bool`, `anotar: bool`, `refazer: [{de, versao?, arquivo_id?, n_video?}]` (só as opções com `pela_conversa`). O `porque` passa a juntar os motivos de todas | "Olhou o projeto" |

A nota volta ao Nimbus como `de_fora` (D26): ela pode ter nascido de um texto que ele leu.

### 3.3 Prompt `nimbus-2` (só o bloco "O QUE VOCÊ PODE FAZER" muda; o resto é o de `prompts/nimbus.md`)
```text
O QUE VOCÊ PODE FAZER
- Ler o projeto, o material, os bastidores de cada passo, as regras da casa (ver_regras) e as trilhas (ver_trilhas).
  Achar um ponto no filme (onde_esta). Perguntar com botões. Abrir o player num ponto.
- Propor ações que só rodam se ele tocar no cartão. Veja em ver_projeto.pode se a ação cabe agora; se não couber,
  diga por quê e o que ele pode fazer:
  - propor_ajuste: ajuste da versão pronta. Refaz direção, montagem e conferência e vira regra da casa, a não ser que
    ele toque em "Só neste projeto". Diga isso em uma frase.
  - propor_pedido: trocar o pedido antes de a edição começar.
  - propor_refazer: refazer só uma etapa que falhou (montar, conferir ou entregar de novo a versão mais nova) ou ler
    de novo um vídeo que ficou de fora. Não chama a direção.
  - propor_trilha: trocar só a música da versão mais nova, sem nova direção. Os cortes andam até uma batida e sai
    uma versão nova; a atual fica. Escolha a trilha em ver_trilhas; se houver dúvida, pergunte com botões.
  - anotar: guardar um lembrete dele no projeto, sem refazer nada.
- Quando ele disser "aqui", use o t_player da linha [tela: ...] e onde_esta para saber o que está na tela.
- Escreva o texto do ajuste como ele diria a um montador: o que muda, onde (mm:ss) e o que não pode mudar.
- Aprovar, publicar, mandar link para o cliente, apagar projeto e apagar regra são botões dele. Não prometa outra coisa.
```

### 3.4 `equipe.json` (versão 3; só acrescenta)
```json
{"chave": "conversa.ver_regras", "agente": "Nimbus", "rodando": "Lendo as regras da casa", "feito": "Leu {n} regras"},
{"chave": "conversa.ver_trilhas", "agente": "Eco", "rodando": "Ouvindo as trilhas da casa", "feito": "Viu {n} trilhas"},
{"chave": "conversa.onde_esta", "agente": "Radar", "rodando": "Procurando no filme", "feito": "Achou {n} pontos"},
{"chave": "conversa.anotar", "agente": "Nimbus", "rodando": null, "feito": "Nota guardada", "cartao": "confirmacao"},
{"chave": "conversa.propor_refazer", "agente": "Trilho", "rodando": null, "feito": "Etapa refeita", "cartao": "confirmacao"},
{"chave": "conversa.propor_trilha", "agente": "Eco", "rodando": null, "feito": "Música trocada", "cartao": "confirmacao"}
```
`apps/web/lib/equipe.json` é cópia byte a byte (o aceite já confere, `aceite-conversa.mjs:23-27`).

### 3.5 Mudanças no laço (`conversa/laco.py`)
- `_criar_cartao` e `_decidir` deixam de ter `if nome == "propor_ajuste" … else …`: passam a consultar `acoes.CARTOES[nome] =
  (normalizar, guarda, montar_cartao, executar, textos_feito)`. `propor_ajuste` e `propor_pedido` entram na tabela sem mudar
  de comportamento (os testes A1.x continuam iguais).
- `entrada_hash` sobre a entrada normalizada: refazer `{de, versao (já resolvida para a mais nova), arquivo_id?}`; trilha
  `{versao, trilha}`; nota `{texto com espaços colapsados, versao?, tempo_s? arredondado a 0,1}`.
- `executar` das ações novas chama `refazer.executar(...)` / `refazer.trocar_musica(...)` / `acoes.anotar(...)`, que abrem a
  transação da 2.1 e levantam `refazer.Recusa(porque)`; `_decidir` transforma em `409 "não deu: <porquê>"`, como hoje faz com
  `HTTPException`.
- `so_neste_projeto` só vale para `propor_ajuste`; nas outras é ignorado.
- `_preparar_mensagem` (`laco.py:179-217`) ganha, como primeira linha dentro do `BEGIN IMMEDIATE`, `SELECT 1 FROM projetos
  WHERE id=?`; sem linha: `ROLLBACK` e `ErroConversa(404, "projeto não encontrado")`. Fecha a corrida com apagar (7.3).
- `falso.py` (`padrao`, só para o aceite manual e o site): "tenta de novo" → `ver_projeto` + `propor_refazer` da primeira opção;
  "troca a música" → `ver_trilhas` + `propor_trilha` com a primeira trilha que não está em uso; "anota" → `anotar` com o resto
  da frase; "onde" → `onde_esta`.

---

## 4. Cartões (o que cada um mostra, texto exato)

Schema `conversa.schema.json`, `$defs.confirmacao` (só acrescenta):
- `acao`: enum passa a `["ajuste", "pedido", "refazer", "trilha", "nota"]`.
- `refaz.items`: enum passa a `["direcao", "montagem", "qa", "entrega", "leitura", "encaixe"]`.
- propriedades novas, opcionais: `de` (enum `montagem|conferencia|entrega|leitura`), `arquivo_id` (≤ 40, `^[A-Za-z0-9_-]+$`),
  `n_video` (inteiro ≥ 1), `faz` (≤ 400), `nao_muda` (≤ 300), `partes` (≤ 4 × `{rotulo ≤ 60, usd ≥ 0}`), `custo_ate` (bool),
  `botao` (≤ 30), `tempo_s` (≥ 0). `atencao` e `mudancas` já existem e são reusados.
- `exemplos/conversa.json` ganha um exemplo de cada `acao` nova (o A1.17 valida).

Para `refazer` e `trilha`, `texto_exato` = `faz` (é texto do código) e a tela **não** põe aspas. Para `nota`, `texto_exato` é
o texto da nota e a tela põe aspas, como no ajuste. `vira_regra` é sempre `false` nas três.

| Cartão | `titulo` | `faz` / `texto_exato` | outras linhas | `volta` | `botao` |
|---|---|---|---|---|---|
| refazer · montagem | "Montar de novo a {V}" | "Montar de novo a {V} com a mesma direção. Depois o editor confere e entrega sozinho." | `refaz: [montagem, qa, entrega]` | "Nada da direção muda. Se a conferência reprovar, o editor para e espera você (não gasta com correção automática)." | "Montar de novo" |
| refazer · conferência | "Conferir de novo a {V}" | "Rodar a conferência automática de novo na {V}, sem montar de novo. Se aprovar, entrega sozinho." | `refaz: [qa, entrega]` | "O filme não muda. Se reprovar de novo, o editor para e espera você." | "Conferir de novo" |
| refazer · entrega | "Entregar de novo a {V}" | "Conferir a {V} (aproveita a conferência se nada mudou) e entregar de novo. Não publica nem manda para o cliente." | `refaz: [qa, entrega]` | "O filme não muda." | "Entregar de novo" |
| refazer · leitura | "Ler de novo o vídeo {N}" | "Tentar ler o vídeo {N} de novo: ouvir as falas e olhar os quadros. Ele ficou de fora porque não deu para ler." | `refaz: [leitura]`; se a leitura pode começar a edição: `atencao` = "Se der certo e o resto já estiver lido, a edição começa sozinha." e a parte "Direção, se a edição começar" | "Os outros vídeos não mudam." | "Ler de novo" |
| trilha | "Trocar a música da {V}" | "Trocar a música da {V} por “{título novo}” ({bpm} bpm), sem nova direção." (sem bpm conhecido, sem o parêntese) | `mudancas: [{campo: "Música", antes: "{título atual}", depois: "{título novo}"}]`; `nao_muda` = "Os mesmos trechos, falas, legendas, cor e fecho."; `atencao` = "Os cortes andam até uma batida para casar com a música nova, então a duração pode mudar um pouco." (+ " Hoje a {V} tem {k} músicas; a versão nova fica com uma só." quando `trilha.ids` tem 2 ou 3); `refaz: [encaixe, montagem, qa, entrega]` | "A {V} continua guardada e pode ser aprovada. A música nova sai na {V+1}. Se a conferência reprovar, o editor para e espera você." | "Trocar a música" |
| nota | "Guardar uma nota" | o texto da nota | `faz` = "Guardar esta nota no projeto{ em mm:ss da V2}. Não refaz nada e não gasta." | "A nota fica na lista de notas do projeto." | "Guardar a nota" |

Título da trilha: `titulo` da biblioteca (o dono digitou ao registrar); sem título, o `id`. Faixa atual: a da biblioteca com
a mesma `chave` de `edl.trilha.chave`; sem achar, "a música atual".

**Custo e tempo** (todos do código, em `refazer.py`):
- `custo_olho(cfg)`: se `cfg.provedor_efetivo("cerebro") != "anthropic"` ou `EDITOR_REVISAO_IA=0` → 0. Senão a média das 5
  últimas linhas `o_que = "olho_ia"` do livro; sem histórico, `EDITOR_REVISAO_TETO_USD` (padrão 0,30) com `custo_ate = true`.
- montagem e troca de música: `partes = [{"Olhar o filme novo com IA (conferência)", custo_olho}]`. Direção: US$ 0 (sem cérebro).
  Fatos: não entra (o EDL já conferido não paga de novo, `fatos.py:283-284`; na troca de música as falas são as mesmas e o
  cache é pelo texto, `fatos.py:135-137`; não confirmado com material real).
- conferência e entrega: se existe `cache/olho/{conteúdo de qa.sha256}.{VERSAO}.json` → 0; senão `custo_olho`.
- leitura: visão por IA (`cfg.provedor_efetivo("visao")` diferente de `local`): média das 5 últimas `visao_leve`; sem
  histórico, 0,05 com `custo_ate = true` (valor de precaução, **não medido**). Visão local: 0. Se a leitura pode começar a
  edição: soma a parte "Direção, se a edição começar" com `acoes.custo_e_minutos` (`acoes.py:106-130`).
- direção (tela): `acoes.custo_e_minutos`; com `trocar_trilha` na entrada guardada, 0. `atencao` = "Se a conferência
  reprovar, o editor pode tentar corrigir sozinho até 2 vezes, cada uma com custo de direção." (é o comportamento normal da
  edição, que esta ação não muda).
- `minutos_est`: soma, por etapa que vai rodar, da média de `dados.s` das 5 últimas `etapa_fim` daquela etapa; sem histórico,
  `ingest 1, analise 2, catalogo 1, direcao 2, montagem 6, qa 2, entrega 1`. Mínimo 1. A troca de música conta `montagem + qa +
  entrega + 1`.
- `custo_usd_est` = soma das partes, arredondada a 2 casas.

**Depois do toque** (evento `resposta`, `detalhe` exato):
- montagem: "Feito. A montagem da {V} recomeçou; acompanhe na mesa."
- conferência: "Feito. A conferência da {V} recomeçou."
- entrega: "Feito. A {V} está sendo conferida e entregue de novo."
- leitura: "Feito. O vídeo {N} está sendo lido de novo."
- trilha: "Feito. A música está sendo trocada; a versão nova aparece na mesa."
- nota: "Nota guardada."
- recusa no toque: "não deu: <porquê da 2.3>"; erro inesperado: o texto de hoje ("não deu: algo falhou do nosso lado…").

---

## 5. Trocar a música: o que o código permite e o caminho escolhido

### 5.1 O que li
- A música é escolhida **pela direção** (`trilha.id`, ou `trilha.ids` com 2 ou 3, `direcao.schema.json` "trilha") e
  resolvida pelo resolvedor: `_trilha()` pega a faixa da biblioteca (`resolvedor.py:322-328`).
- A música **não é só o mix**: o resolvedor põe o início de cada bloco na batida dela (`_na_batida`, `resolvedor.py:330-345`),
  procura a virada dela para o bloco do auge (`_inicio_na_virada`, `:932-947`) e emenda por compassos (`_trilha_edl`,
  `:949-971`). Trocar a música muda a grade de cortes e pode mudar a duração. "Trocar só o áudio da trilha" deixaria os
  cortes fora da batida da música nova.
- A etapa `direcao` sempre chama o cérebro, exceto com o EDL fixo (`direcao.py:210-272`), e é idempotente pela chave
  `catálogo + pedido + correção` (`:223-227`).
- O ajuste de hoje ("troque só a música") manda a direção anterior ao diretor com "mude só o necessário" (`direcao.py:71-72`),
  mas o diretor e o crítico podem mexer em tudo, e custa ≈ US$ 0,40. **Não trava nada.**

### 5.2 Caminho escolhido (D25)
Nova versão **sem cérebro**: o job `direcao` com `entrada = {"trocar_trilha": {"de": "vN", "trilha": "<id>"}}`.
Em `etapas/direcao.py`:
1. `rodar()` passa a incluir `"trocar_trilha"` na `correcao` (`:222`), então a chave de idempotência muda e o mesmo pedido
   repetido devolve a mesma versão.
2. Logo depois da checagem de idempotência (`:225-227`) e **antes** de carregar `direcao_anterior` e do ramo do EDL fixo:
   `if correcao and correcao.get("trocar_trilha"): return _trocar_trilha(ctx, arm, indice, chave, correcao)`.
3. `_trocar_trilha`:
   - lê `projetos/{p}/direcao_{n}.json` da versão `de` (sem arquivo: `ErroDefinitivo("a {V} não tem direção guardada")`);
   - cópia funda; `trilha.id = <id>`; remove `trilha.ids` e `trilha.troca_em`; mantém `clima`, `curva` e `drop_em`; valida
     no schema `direcao`;
   - confere que a trilha está em `armazem_b.trilhas(cfg)` (senão `ErroDefinitivo("a música escolhida saiu da biblioteca")`);
   - carrega catálogo, análises, energias, movimentos e pedido como `rodar()` já faz, e chama o resolvedor por uma função
     extraída de `tentar` (`:160-170`), `_resolver_uma(d, *, catalogo, analises, loja, pedido, trilhas, energias,
     movimentos)`, dentro de `passos.passo("direcao.resolvedor", ferramenta="resolvedor do editor (troca de música, sem nova
     direção)")`. `dirigir_e_resolver` passa a usar a mesma função (comportamento igual; `test_b_*` sem mudança);
   - `ErroResolucao` → `ErroDefinitivo("a música nova não encaixou no filme: …")`;
   - grava `direcao_{n+1}.json`, `uso_{n+1}.json` com `{"versao", "chamadas": [], "total": {"entrada": 0, "saida": 0,
     "custo_usd": 0.0}, "cerebro": "sem_cerebro", "troca_de_trilha": {"de", "trilha"}}`, `saidas/{p}/v{n+1}/edl.json` com
     `origem.update(versao, cerebro="sem_cerebro", critica="troca de música, sem crítica", trocou_trilha_de=<de>)`;
   - `passos.emitir_decisao(v, direção nova, "troca de música da {de}, sem nova direção")`;
   - índice `direcoes.json`, `INSERT OR REPLACE INTO versoes (…, 'montando', …)`, `etapa_progresso` com mensagem
     "Música trocada ({V+1}, {dur} s). Custo da direção: US$ 0,00.";
   - devolve `{"versao", "duracao", "tokens_saida": 0, "custo_usd": 0.0, "cerebro": "sem_cerebro"}`.
4. `pipeline.depois` segue igual (montagem → qa → entrega). A versão `de` continua `entregue` e aprovável: não é reprovada, o
   link do cliente dela continua, nada sai da página de entregas.

**O que o cartão promete e o teste prova** (A3.7): mesmos `blocos[].id` na mesma ordem e a mesma sequência de `voz[].fala`
que a versão de origem; `edl.trilha.chave` igual à da trilha nova; nenhuma linha nova no livro com `o_que` `direcao` ou
`critico`; o cérebro (provedor) não é chamado. **O que não dá para travar e o cartão diz:** os tempos dos cortes (até uma
batida) e a duração.

---

## 6. Onde está cada item pedido

| Pedido desta onda | Seção |
|---|---|
| (1) rotas novas, erros e regex do proxy | 1 |
| (2) ferramentas do Nimbus e guarda de estado (tabela estado × ação) | 3 e 2 |
| (3) o que cada cartão mostra, com o texto exato | 4 |
| (4) apagar projeto: ordem, recusas, caminho malicioso e corrida | 7 |
| (5) regras da casa: id estável e o que a Loja ganha | 8 |
| (6) retenção: SQL e onde roda | 9 |
| (7) telas no celular, estado por estado | 10 |
| (8) arquivos por frente, sem dois escritores | 11 |
| (9) aceites numerados | 12 |
| (10) o que ficou de fora e por quê | 13 |
| Trocar a música: investigação e caminho | 5 |
| Crítica do próprio contrato | 15 |

---

## 7. Apagar projeto

### 7.1 O que acontece com cada coisa
| Coisa | Destino |
|---|---|
| Linhas do banco do projeto: `projetos`, `arquivos`, `versoes`, `jobs`, `eventos`, `nuvem`, `conversa_capitulos`, `conversa_msgs`, `conversa_espera`, `links_cliente` | apagadas, numa transação, sempre `WHERE projeto=?` (em `projetos`, `WHERE id=?`) com o `pid` como parâmetro; nunca `LIKE` |
| Armazenamento (local ou R2): `entrada/{pid}/`, `derivados/{pid}/`, `projetos/{pid}/`, `saidas/{pid}/` | apagados depois do banco, chave por chave (7.3) |
| Disco local: `armazenamento/entrada/{pid}` (o tus grava em disco mesmo com R2), `cache/r2/{entrada,derivados,projetos,saidas}/{pid}`, `tmp/montagem/{pid}`, `tmp/qa/{pid}`, `tmp/entrega/{pid}`, `tmp/import_{pid}_*`, `tmp/ingest_{pid}_*` | apagados depois do banco |
| Links de cliente ativos | param de abrir (as linhas somem; o link responde "não existe"). A prévia conta quantos |
| Filme na página de entregas | **recusa** (7.2) até sair de lá pela R15. Com as entregas desligadas no servidor e estado `no_ar` guardado: deixa apagar e a prévia avisa em `restos_previstos.pagina_desligada` |
| Cópia do material no Cloudflare (espelho) | ligado: apaga o prefixo `entrada/{pid}/` do depósito do espelho; desligado com linhas `guardado`: não dá para apagar daqui e a prévia diz `copia_material: n` |
| `gastos.jsonl` | **não é apagado** (o livro de gastos fica; a tela de gastos mostra o id do projeto) |
| Regras, checagens, vocabulário e casos que nasceram do projeto | ficam (são da casa). As regras podem ser apagadas no Caderno (seção 8); casos não têm tela nesta onda |
| Caches por conteúdo (`cache/olho`, `cache/fatos`, `cache/planos`) | ficam: a chave é o conteúdo, não o projeto |
| Backups já feitos | ficam: no Cloudflare somem em até 30 dias (`backup.py:77`); as cópias já mandadas ao Dropbox continuam lá |
| Pedaço de envio do tus em `armazenamento/.envio/` | fica; o tus apaga em 7 dias (`app/api/envio/[[...tus]]/route.ts:29`) |

### 7.2 O que recusa (frase exata, 409)
Na ordem:
1. Turno da conversa rodando no projeto: "a conversa está respondendo agora neste projeto; toque em Parar a resposta ou espere terminar".
2. Qualquer job do projeto em `pendente` ou `rodando` (qualquer etapa): "{frase da etapa} agora; espere terminar para apagar".
   Frases: `ingest` "um vídeo está chegando"; `analise` "o editor está lendo um vídeo"; `catalogo`/`direcao` "a direção está
   trabalhando"; `montagem` "a montagem está rodando"; `qa` "a conferência está rodando"; `entrega` "a entrega está rodando";
   `entregas` "o filme está indo para a página de entregas (ou saindo dela)"; `espelho` "a cópia do material para o
   Cloudflare está rodando".
3. `dados.entregas[v].estado` em `no_ar`, `pendente` ou `enviando` (com as entregas ligadas): "a {V} está na página de
   entregas; tire de lá primeiro (botão Tirar da página) e apague depois". Em `retirando`: "a {V} está saindo da página de
   entregas; espere terminar" e, se houver `proxima`, " (tento de novo sozinho às {HH:MM})".
4. Nome que não confere (422, frase da R14). Comparação: `" ".join(x.split()).casefold()` dos dois lados (o teclado do
   iPhone põe maiúscula sozinho; acento conta).

### 7.3 Ordem exata e por que é segura
Em `motor/apagar.py`, chamado por `api/apagar.py`:
0. `pid` passa em `^p_[a-z0-9]{4,40}$`, senão 404 sem abrir nada.
1. (rota, assíncrona) `m = laco.atual()`; se existe, `async with m.trava(pid)`: se `m.rodando(pid)`, recusa 1. Tudo o que
   segue roda em `asyncio.to_thread` **com a trava presa**. `mandar`, `responder` e `retomar` tomam a mesma trava
   (`laco.py:433-434`, `478-479`, `631-632`), e `_preparar_mensagem` passa a recusar projeto que não existe (3.5): uma
   mensagem que chega depois do apagar dá 404 e não grava nada.
2. `cliente.preparar(con)` (a tabela `links_cliente` pode não existir).
3. Diário: grava `<dados>/apagar/{pid}.json` = `{"pid", "criado", "fase": "intencao"}` (arquivo temporário + `os.replace`).
4. `BEGIN IMMEDIATE`: lê o projeto (sem linha: `ROLLBACK`, apaga o diário, 404); confere o nome; recusas 2 e 3; conta o que a
   resposta precisa; `DELETE` na ordem `conversa_espera, conversa_msgs, conversa_capitulos, links_cliente, nuvem, eventos,
   jobs, versoes, arquivos, projetos`; confere `changes() == 1` no último; `COMMIT`. Qualquer exceção: `ROLLBACK`, apaga o
   diário, devolve a recusa ou 500 sem ter apagado nada.
5. Diário: `{"fase": "apagado", "em", "ate": em + 7 dias}`.
6. Dispara a limpeza dos arquivos numa thread (`threading.Thread(daemon=True)`) e responde 200 `{apagado: true, arquivos: "apagando"}`.

`limpar_arquivos(cfg, pid)` (a thread e a varredura usam a mesma):
- Armazenamento: para cada prefixo `entrada/{pid}/`, `derivados/{pid}/`, `projetos/{pid}/`, `saidas/{pid}/`: `arm.listar(prefixo)`
  e, para cada chave, só se `chave.startswith(prefixo)` e `validar_chave(chave)` passa, `arm.apagar(chave)`.
  `ChaveInvalida` (o local resolve o caminho e recusa o que sai da raiz, `armazenamento_local.py:41-45`, inclusive por link
  simbólico): não apaga, conta em `recusados` e segue.
- Disco local: para cada base da tabela 7.1, `alvo = base / pid` (ou o glob `import_{pid}_*`, `ingest_{pid}_*` dentro de
  `tmp/`). Link simbólico: apaga **só o link** (`alvo.unlink()`). Pasta de verdade: só se `alvo.resolve().parent ==
  base.resolve()` e `alvo.name` começa com o pid; aí `shutil.rmtree(alvo)` (não segue links internos).
- Espelho ligado: lista e apaga `entrada/{pid}/` no depósito do espelho, só chaves com esse prefixo.
- Banco, de novo, numa transação: `DELETE FROM <cada tabela da 7.1> WHERE projeto=? AND NOT EXISTS (SELECT 1 FROM projetos
  WHERE id=?)`. Pega linha que chegou atrasada (um evento do áudio da conversa que estava no meio).
- Diário ganha `{"ultima_volta", "recusados", "restos"}`.

Varredura (`apagar.varrer(con, agora=None)`, chamada por `worker.limpezas`, seção 9): para cada `<dados>/apagar/*.json`
com nome `^p_[a-z0-9]{4,40}\.json$`:
- `fase = "intencao"`: projeto ainda existe → a transação não confirmou; se o diário tem mais de 10 min, apaga o diário e
  **não toca em nada**. Projeto não existe → confirmou e caiu antes do passo 5: vira `apagado` e limpa.
- `fase = "apagado"`: roda `limpar_arquivos` (de novo é seguro: nenhum projeto vivo tem esse pid). Passou de `ate`: apaga o diário.
  Os 7 dias cobrem o envio do tus que termina depois do apagar (o arquivo cai em `entrada/{pid}/` e o registro dá 404).

**Corrida com o worker**: o worker só pega job com `BEGIN IMMEDIATE` (`banco.py:206`) e só encadeia com transação
(`worker.py:132-137`). Com a recusa 2 lida dentro da transação do apagar, ou o worker pegou antes (o apagar recusa) ou não há
mais job (o worker não acha nada). As voltas periódicas (`entregas_r2.reenfileirar_pendentes`, `espelho.volta`) leem linhas do
projeto, que não existem mais depois do `COMMIT`.

**Nada em lote**: uma rota, um `pid`, um nome digitado. Não existe rota que receba lista.

### 7.4 Prévia (R13): as frases de `fica`
1. "O livro de gastos (o que já foi gasto continua contado)."
2. "As regras e os casos que nasceram deste projeto (apague as regras no Caderno, se quiser)."
3. "As cópias nos backups: no Cloudflare somem em até 30 dias; as do Dropbox ficam."
`pode = false` e `porque` com a frase da recusa (7.2) quando houver.

---

## 8. Regras da casa no Caderno

### 8.1 Como cada item é identificado
| Tipo | Id estável | Apagável |
|---|---|---|
| regra | `id` que já existe; o do dono é `r_dono_` + 8 hex do sha1 do motivo normalizado (`loja.py:175-177`) | só `^r_dono_[0-9a-f]{8}$` |
| checagem | `id`; do dono `c_dono_` + o mesmo hash | só `^c_dono_[0-9a-f]{8}$` |
| vocabulário | **novo**: `v_` + 8 hex de `sha1(norm(de))` (`norm` de `etapas/catalogo.py`), calculado na leitura; nada muda no arquivo | só se `origem` começa com "reprovação do dono" |

`de_onde` sai de `origem` = `"reprovação do dono · {pid}/{vN} · {AAAA-MM-DD}"` (`loja.py:176`), lida com
`^reprovação do dono · (p_[a-z0-9]+)/(v[0-9]{1,3}) · (\d{4}-\d{2}-\d{2})$`. A rota R19 junta `nome` pelo banco; projeto
apagado fica sem `nome` e a tela diz "projeto apagado".

### 8.2 O que a `Loja` ganha (`memoria/loja.py`)
- `apagados.json` na raiz da memória: `{"versao": "1", "regras": {id: em}, "checagens": {id: em}, "vocabulario": {id: em}}`.
- `regras()`, `checagens()` e `vocabulario()` filtram o que está em `apagados.json`. Assim o prompt da direção, o QA, a chave
  da conferência e o resolvedor deixam de ver o item na hora, sem mudar quem chama.
- `apagar(tipo, ident) -> dict`: sob a mesma trava de arquivo de `registrar_reprovacao` (`loja.py:152-160`), tira o item de
  `regras.json`/`checagens.json` (vocabulário: o item cujo `v_` bate) e grava a lápide. Item que não existe: `KeyError`.
- `_registrar_reprovacao`: ao gravar `r_dono_h`, `c_dono_h` e o vocabulário, **tira a lápide** desses ids. Reprovar de novo com
  o mesmo texto traz a regra de volta, como o dono espera.
- `itens_caderno() -> {"regras": [...], "checagens": [...], "vocabulario": [...]}`: os itens de hoje com `id` (vocabulário),
  `apagavel`, `de_onde` (sem `nome`) e `ao_apagar`. Usado pela R19 e pela ferramenta `ver_regras`.
- `ao_apagar` (frase exata):
  - regra: "Deixa de valer nos próximos filmes. Nenhum filme é refeito."
  - checagem de tipo `legenda_proibida`, `fecho_contem`, `duracao_max`, `duracao_min`, `vazio_max_s` ou `revisao_humana`:
    "O editor para de conferir isto nos próximos filmes. Nenhum filme é refeito."
  - checagem de outro tipo (a conferência existe no código, `qa/__init__.py:31-34`): "Some só o seu pedido; a conferência fixa
    do editor continua. Nenhum filme é refeito."
  - vocabulário: "A legenda deixa de trocar “{de}” por “{para}” nos próximos filmes. Nenhum filme é refeito."

`semear.py`: depois de juntar git e volume, tira de `regras`, `checagens` e `vocabulario` os ids que estão no
`apagados.json` **do volume**. O `apagados.json` nunca vem do git e nunca é sobrescrito pelo `semear`.

"Desligar sem apagar" não entra: apagar já é desligar para sempre, e reprovar igual traz de volta (D30).

### 8.3 Apagar não refaz nada
As rotas R16 a R18 não enfileiram job, não mexem em versão e não emitem evento. A checagem só recusa durante `qa`/`entrega`
(D32). Versão já entregue continua entregue; se o dono pedir "conferir de novo" depois, aí sim a chave mudou e a conferência
roda (2.3), com o cartão dizendo o custo.

---

## 9. Prazo de guarda das conversas

- Variável `EDITOR_CONVERSA_RETENCAO_DIAS` (em `config.py`, campo `retencao_conversa_dias`): inteiro ≥ 0, padrão 90, `0` =
  guardar para sempre. Valor inválido ou negativo: 90 e um aviso no log.
- Onde roda: função nova `worker.limpezas(con, agora=None) -> dict`, chamada em `_talvez_periodicas` logo depois de
  `periodicas(con)` (a cada 15 min, só no modo contínuo; `--ate-ocioso` não roda). Ela chama `conversa.retencao.volta` e
  `apagar.varrer`, cada uma em `try/except` próprio com `traceback.print_exc()` e `_sair_de_transacao(con)`. **Nunca derruba
  o worker.** `periodicas()` não muda (o teste `test_espelho.py:145-150` compara a saída inteira).
- SQL (`motor/conversa/retencao.py`), com `corte = agora_iso(agora − dias × 86400)`:
```sql
-- capítulos vencidos (fora de transação, só leitura)
SELECT projeto, capitulo, fechado FROM conversa_capitulos
 WHERE fechado IS NOT NULL AND fechado < :corte ORDER BY projeto, capitulo;

-- por projeto, numa transação BEGIN IMMEDIATE (:caps = os capítulos vencidos dele; :f_max = o maior fechado entre eles)
SELECT turno FROM conversa_espera WHERE projeto = :p;
--   se esse turno aparece em conversa_msgs de algum capítulo em :caps -> ROLLBACK e pula o projeto (log)
DELETE FROM conversa_msgs WHERE projeto = :p AND capitulo IN (:caps);
DELETE FROM eventos WHERE projeto = :p AND ts < :f_max
   AND (tipo IN ('fala_dono','fala_editor','ferramenta','pergunta','confirmacao','resposta','turno_fim','mostrar')
        OR (tipo = 'aviso' AND json_extract(dados, '$.acao') = 'retomar'));
DELETE FROM conversa_capitulos WHERE projeto = :p AND capitulo IN (:caps) AND fechado IS NOT NULL;
COMMIT;
```
- Por que o corte `ts < :f_max` é exato: `abrir_capitulo` fecha o capítulo k e abre o k+1 com o **mesmo** carimbo
  (`repo.py:37-43`), e capítulo novo só nasce em `_preparar_mensagem`, fora de turno. Todo evento de capítulo mais novo tem
  `ts ≥ f_max`; o `<` estrito guarda o que caiu no mesmo segundo. O capítulo aberto (`fechado IS NULL`) nunca entra em `:caps`.
- Eventos da mesa (`etapa_*`, `passo`, `decisao`, `estado`, `aviso` sem `acao: retomar`, `cliente`) **não são tocados**.
- Idempotente: a segunda volta apaga 0. Devolve `{"capitulos": n, "mensagens": n, "eventos": n, "pulados": n}`.
- A R20 devolve `retencao_dias` e o Caderno mostra uma linha (seção 10.4).
- `README-conversa.md`, seção "Privacidade e retenção", passa a dizer: "Capítulos da conversa fechados há mais de
  `EDITOR_CONVERSA_RETENCAO_DIAS` (padrão 90; 0 = para sempre) têm as mensagens e os eventos da conversa apagados pelo worker,
  a cada 15 minutos. O capítulo aberto e as perguntas esperando resposta nunca são tocados. Os backups do Cloudflare guardam o
  banco por até 30 dias; as cópias já mandadas ao Dropbox ficam."

---

## 10. Telas no celular (390x844), estado por estado

Todos os alvos com 44 px ou mais; texto ≥ 13 px no corpo e ≥ 11 px em rodapé; contraste AA; `prefers-reduced-motion`
respeitado; nenhum botão aparece se a ação não cabe agora. Tokens e classes do redesenho (`design-editor-25-11.md`,
"Mesa de corte"); nenhuma biblioteca nova.

### 10.1 Projeto em erro ou com a conferência segurando (barra de comando, `Projeto.tsx:428-440`)
| Estado | O que aparece |
|---|---|
| `erro`, carregando R11 | o de hoje ("A edição parou com erro · o motivo está na mesa ao vivo" + "Ver motivo"); o botão novo só entra quando a R11 responde |
| `erro` com `sugerida` | status: **"A edição parou com erro"** · linha 2: "{faz da opção}" · linha 3 (13 px): "custa ≈ US$ {c} · ≈ {m} min" (ou "custa até US$ {c}"); botão principal **"Tentar de novo"** (`data-teste="tentar-de-novo"`), secundário "Ver motivo" |
| tocou | botão "Tentando…", apagado, com trava síncrona (`trava.current`, como no Aprovar). 202: a barra muda pelo estado novo que chega no SSE. 409: `p.erro` com "Não deu: {porquê}" e a R11 é lida de novo |
| `erro` sem opção | o de hoje, mais a linha "Não achei o que tentar de novo. Peça na conversa." |
| `reprovado_qa` com opção `conferencia` | status "A conferência segurou a entrega" · "As regras mudaram desde a última conferência." · custo; botão **"Conferir de novo"** (`data-teste="conferir-de-novo"`) |
| `reprovado_qa` sem opção | o de hoje (sem botão novo) |

A R11 é lida ao abrir, a cada evento `estado` ou `etapa_erro` (o `recarregar` já existe) e no `visibilitychange` para visível.

### 10.2 Vídeo que ficou de fora (bloco Material)
Na linha do vídeo com `estado = 'falhou'`, quando a R11 traz a opção `leitura` dele: botão pequeno **"Ler de novo"**
(`data-teste="ler-de-novo"`, 44 px de alto) e, embaixo, "custa ≈ US$ {c}" e, se houver, a `atencao` ("Se der certo e o resto
já estiver lido, a edição começa sozinha."). Mesma trava e mesmos estados do 10.1.

### 10.3 Cartões novos no fio (`CartaoConfirma.tsx`)
- Cabeça igual ("Antes de seguir, preciso do seu toque"), título, e:
  - `refazer`/`trilha`: `faz` como parágrafo **sem aspas**; `nao_muda` em linha própria ("Não muda: …"); `mudancas` como hoje
    (rótulo "Música"); `atencao` como hoje.
  - `nota`: `texto_exato` entre aspas, como o ajuste; `faz` embaixo.
- Conta: "roda de novo" com `refaz` (rótulos: `encaixe` "Encaixe na batida", `entrega` "Entrega", `leitura` "Leitura do
  vídeo", os de hoje para direção, montagem e conferência); "custa ≈ US$ {c}" ou "custa até US$ {c}"; `partes` como linhas
  pequenas embaixo do custo; "demora ≈ {m} min"; "dá para voltar" com `volta`. Na `nota`: só "custa: nada · não refaz nada".
- Botão principal com o texto de `botao` (sem `botao`, o mapa de hoje). "Só neste projeto" só no `ajuste`. "Agora não" igual.
- Depois: "Feito · recomeçou" (refazer), "Feito · trocando a música" (trilha), "Feito · nota guardada" (nota); "Não deu ·
  {porquê}"; "Cancelado".

### 10.4 Caderno
- Seção 03 Regras, 04 Conferências e 05 Palavras: cada item apagável mostra embaixo "De: {nome} · {V} · {dd/mm/aaaa}" (sem
  nome: "De: projeto apagado · {V} · {data}") e um botão **"Apagar"** (fantasma, cor de perigo, 44 px). Item da casa:
  "Fixa da casa", sem botão.
- Toque em Apagar: o item abre a confirmação no lugar: "{ao_apagar}" + botões **"Apagar"** (perigo) e "Cancelar". Tocou:
  "Apagando…"; 200: o item some e fica no topo da seção, por 6 s, a linha `role="status"` "Regra apagada." / "Conferência
  apagada." / "Palavra apagada."; 409/404: a frase do motor embaixo do item, e o item fica.
- Regra apagada que tinha checagem irmã (mesmo hash): a confirmação ganha a linha "A conferência que nasceu junto continua;
  apague na lista de conferências se quiser."
- Cartão da conversa (`ChaveConversa`, variante `cartao`) ganha uma linha em 13 px: com `retencao_dias > 0`: "As mensagens da
  conversa ficam guardadas {N} dias depois de encerradas (ao aprovar um vídeo ou quando a conversa fica longa); a conversa em
  andamento nunca é apagada." Com 0: "As mensagens da conversa ficam guardadas sem prazo."
- O texto do topo do Caderno (`caderno/page.tsx`, "Quando você reprova uma versão…") ganha: " Você pode apagar as que
  nasceram dos seus ajustes."

### 10.5 Apagar projeto (componente novo `ApagarProjeto.tsx`, no fim da página do projeto, em qualquer fase)
| Estado | O que aparece |
|---|---|
| fechado | cartão discreto "Apagar projeto" com o botão **"Apagar projeto…"** (fantasma, perigo) |
| envios subindo nesta aba (`enviando > 0`) | "Espere os envios terminarem para apagar." sem botão |
| abrindo | "Conferindo o que será apagado…" (`aria-busy`) enquanto a R13 responde |
| `pode = false` | a frase `porque`; se `na_pagina` tem versão em `no_ar`/`pendente`/`enviando`: botão **"Tirar a {V} da página"** (R15) por versão; "Fechar" |
| tirando da página | "Tirando a {V} da página de entregas… (leva até 1 minuto)"; a R13 é lida de 4 em 4 s até `pode = true` ou até o estado `retirando` ganhar `proxima` (aí: "Não consegui tirar agora; tento de novo sozinho às {HH:MM}.") |
| `pode = true` | "Vai apagar para sempre: {videos} vídeos enviados ({GB/MB}), {versoes} versões, a conversa e a mesa deste projeto." + (se houver) "{n} link(s) de cliente param de abrir." + "Fica:" e as 3 frases de `fica` + (se houver) os `restos_previstos` em âmbar; campo com rótulo "Digite o nome do projeto para confirmar: **{nome}**" (`autocomplete=off`, `autocapitalize=off`); botões **"Apagar para sempre"** (perigo, apagado até o nome conferir do mesmo jeito do motor) e "Cancelar" |
| apagando | "Apagando…", botões apagados, trava síncrona |
| 200 | vai para `/projetos?apagado=1`; a lista mostra no topo `role="status"` "Projeto apagado. Os arquivos somem do servidor em alguns minutos." |
| 409/422 | a frase do motor embaixo do campo; o campo fica com o texto |

### 10.6 Notas (componente novo `Notas.tsx`)
Bloco "Suas notas" na página do projeto, só se `dados.notas` tem item: lista com "{mm:ss} · {V}" (quando houver) e o texto,
mais recentes primeiro, as 10 últimas e "ver todas" se houver mais. Sem botão de apagar nesta onda.

---

## 11. Arquivos por frente (um escritor por arquivo)

Ordem: **Frente B** primeiro; **Frente A** pode começar junto, mas só fecha `ver_regras` depois que a B entregar
`Loja.itens_caderno()`; **Frente C** depois das duas. Nenhum arquivo aparece em duas frentes.

**Frente B · motor: apagar, regras e prazo da conversa**
| Arquivo | O que muda |
|---|---|
| `services/motor/motor/apagar.py` | novo: `previa`, `apagar`, `limpar_arquivos`, `varrer` (seção 7) |
| `services/motor/motor/api/apagar.py` | novo: R13, R14, R15 |
| `services/motor/motor/api/memoria.py` | novo: R16, R17, R18 |
| `services/motor/motor/api/direcao.py` | só a função `memoria()` (R19) |
| `services/motor/motor/api/conversa.py` | só `ver_chave` e `mudar_chave` (R20) |
| `services/motor/motor/api/app.py` | tupla da linha 110 ganha `"refazer", "apagar", "memoria"` |
| `services/motor/motor/memoria/loja.py` | 8.2 |
| `services/motor/motor/memoria/semear.py` | lápide (8.2) |
| `services/motor/motor/conversa/retencao.py` | novo (seção 9) |
| `services/motor/motor/worker.py` | `limpezas()` e a chamada em `_talvez_periodicas` |
| `services/motor/motor/config.py` | `retencao_conversa_dias` |
| `services/motor/tests/test_onda3_apagar.py`, `test_onda3_memoria.py`, `test_onda3_retencao.py` | novos |

**Frente A · motor: a conversa age**
| Arquivo | O que muda |
|---|---|
| `services/motor/motor/refazer.py` | novo: `opcoes`, `porque`, `executar`, `trocar_musica`, `custo_olho`, `minutos`, `Recusa` |
| `services/motor/motor/api/refazer.py` | novo: R11, R12 |
| `services/motor/motor/etapas/direcao.py` | `_resolver_uma`, `_trocar_trilha`, `trocar_trilha` na correção (seção 5) |
| `services/motor/motor/conversa/acoes.py` | `CARTOES`, cartões novos, `anotar`, `pode` ampliado |
| `services/motor/motor/conversa/ferramentas.py` | 6 ferramentas novas, `FERRAMENTAS_VERSAO = "2"`, `ver_projeto.notas` |
| `services/motor/motor/conversa/laco.py` | `PROMPT_VERSAO = "nimbus-2"`, tabela `CARTOES` em `_criar_cartao`/`_decidir`, checagem de projeto em `_preparar_mensagem` |
| `services/motor/motor/conversa/falso.py` | roteiros do `padrao` (3.5) |
| `services/motor/motor/conversa/prompts/nimbus.md` | bloco 3.3 |
| `packages/schemas/conversa.schema.json`, `packages/schemas/exemplos/conversa.json`, `packages/schemas/equipe.json` | seções 4 e 3.4 |
| `services/motor/README-conversa.md` | seção "Onda 3" (ações novas) e o texto de retenção da seção 9 |
| `services/motor/tests/test_onda3_acoes.py`, `test_onda3_trilha.py` | novos |

**Frente C · site**
| Arquivo | O que muda |
|---|---|
| `apps/web/app/api/motor/[...rota]/route.ts` | regex da seção 1 |
| `apps/web/lib/acoes.ts` | novo: tipos `Opcao`, `Previa`; `refazerOpcoes`, `refazer`, `previaApagar`, `apagar`, `retirar`, `apagarMemoria` |
| `apps/web/lib/conversa.ts` | `DadosConfirmacao` com os campos novos; estado da conversa com `retencao_dias` |
| `apps/web/lib/equipe.json` | cópia da versão 3 |
| `apps/web/componentes/conversa/CartaoConfirma.tsx`, `ChaveConversa.tsx` | 10.3 e 10.4 |
| `apps/web/componentes/Projeto.tsx` | 10.1, 10.2, e monta `ApagarProjeto` e `Notas` |
| `apps/web/componentes/ApagarProjeto.tsx`, `Notas.tsx`, `MemoriaLista.tsx` | novos |
| `apps/web/app/caderno/page.tsx` | usa `MemoriaLista` (cliente) nas seções 03 a 05; frase do topo |
| `apps/web/app/projetos/page.tsx` | linha "Projeto apagado." com `?apagado=1` |
| `apps/web/app/globals.css` | estilos dos itens novos |
| `apps/web/scripts/motor-falso.mjs` | só acréscimo: R11 a R20 e os cartões novos no SSE |
| `apps/web/scripts/aceite-onda3.mjs` | novo: S3.x |
| `apps/web/scripts/aceite.mjs` | só o `import` e a chamada do `aceiteOnda3`, depois do `aceiteMesa` |

`PROGRESSO.md` é escrito por quem juntar as três frentes, no fim. Nenhuma dependência nova em nenhuma frente
(`jsonschema`, `json_extract` do SQLite e Playwright já estão no projeto).

---

## 12. Aceites

Motor sem rede (`python -m pytest -q -m "not pago"`, cérebro falso e fixture). Site com o motor falso
(`ACEITE_PORTA_WEB=3081 ACEITE_PORTA_MOTOR=8881 pnpm aceite`). Cada aceite precisa ser visto **falhando** antes da
correção quando for regressão.

### 12.1 Motor · Frente A
| # | Aceite | Como |
|---|---|---|
| A3.1 | Montagem que falhou: `propor_refazer {de: montagem}` cria cartão com `refaz [montagem, qa, entrega]`, custo do código e `botao` "Montar de novo"; R6 `sim` deixa o job `pendente` com `tentativas 0`, projeto `montando`, `correcoes_auto 2`; segundo toque 409 "esse cartão já foi decidido"; hash diferente 409 "o cartão mudou" | pytest com banco semeado |
| A3.2 | Guarda (2.3): para cada linha da tabela, a frase certa ao criar o cartão; estado muda entre o cartão e o toque (job `qa` vira `rodando`) → 409 "não deu: a mesa está trabalhando…" e nenhum job novo | pytest parametrizado |
| A3.3 | `reprovado_qa` com chave igual → "nada mudou desde a última conferência…"; depois de `Loja.apagar` de uma `c_dono_` → opção aparece; toque + worker com fixture que reprova de novo → projeto `reprovado_qa` e **nenhum** job `direcao` criado | pytest + `python -m motor.worker --ate-ocioso` |
| A3.4 | Entrega que falhou: o toque enfileira `qa` (não `entrega`); o worker termina em `entregue`; o job `entrega` novo não tem `publicar_em` | pytest + worker |
| A3.5 | Vídeo `falhou` antes da edição: cartão "Ler de novo o vídeo {N}"; toque → arquivo `ingerido` e job `analise` `pendente`; com projeto em `erro` vai a `lendo`; com versão existente → "a edição já começou…"; o nome do arquivo não aparece no cartão | pytest |
| A3.6 | R11 e R12 usam a mesma guarda: a matriz do A3.2 pela rota dá as mesmas frases; `direcao`/`catalogo` só aparecem com o job `falhou` e com `pela_conversa: false`; dois `POST` iguais ao mesmo tempo (2 threads) → um 202, um 409, uma linha em `jobs` | pytest + TestClient |
| A3.7 | Troca de música: v1 entregue com `direcao_1.json` e biblioteca com 2 trilhas → cartão com `mudancas` "Música"; toque → job `direcao` com `trocar_trilha`; worker → v2 com `edl.trilha.chave` da trilha nova, mesmos `blocos[].id` e mesma sequência de `voz[].fala` da v1; o provedor do cérebro foi chamado 0 vezes; nenhuma linha `direcao`/`critico` nova no livro; `uso_2.json.total.custo_usd == 0`; v1 continua `entregue` | pytest + worker com fixture |
| A3.8 | Troca de música recusada: mesma trilha → "a {V} já usa essa música"; trilha fora da biblioteca → frase T1; versão do EDL fixo → "…roteiro fixo…"; direção com `trilha.ids` → `atencao` com "uma só" | pytest |
| A3.9 | `anotar`: cartão com o texto exato entre aspas; toque → `dados.notas` com 1 item igual; nenhum job, nenhum gasto; 51ª → "o projeto já tem 50 notas"; `ver_projeto.notas[0].texto` é `{de_fora}` | pytest |
| A3.10 | `onde_esta`: com o EDL de exemplo, busca acha o tempo certo; `tempo_s` devolve `de_onde.n_video` e `s_fonte` calculados; sem versão → `{ok: false, motivo: "sem_versao"}`; nenhuma string de fora sai solta | pytest |
| A3.11 | `ver_regras` pagina de 12 em 12, não lista apagadas e todo `texto` é `{de_fora}`; `ver_trilhas` marca `em_uso` na trilha da versão mais nova | pytest |
| A3.12 | Capítulo 2: um capítulo com `ferramentas_versao "1"` recebe capítulo novo com ficha na próxima mensagem; o `tools_json` novo tem as 13 em ordem e nenhum `maxLength`, `minLength`, `maxItems`, `minItems`, `minimum`, `maximum`, `pattern` nem `tool_choice` (A1.16 estendido); `falso.conferir` aceita o histórico | pytest |
| A3.13 | "Aqui": mensagem com `contexto.t_player = 12.3` chega à API começando por "[tela: fio · versão aberta: v1 · t_player: 0:12]" | pytest (regressão do que já existe) |
| A3.14 | Nenhuma ferramenta tem `apag`, `exclu`, `remov`, `delet`, `revog`, `aprov` ou `public` no nome, na descrição ou em `enum` | pytest sobre `ferramentas.para_api()` |
| A3.15 | Corrida com apagar: projeto apagado e mensagem logo depois → 404 "projeto não encontrado" e zero linhas em `conversa_msgs` e `eventos` para o pid | pytest (depende da Frente B) |
| A3.16 | Todos os testes que já existem passam sem mudança (`test_b_api.py`, `test_conversa_*`, `test_mesa_ao_vivo.py`, `test_juncao_conversa.py`) | pytest |

### 12.2 Motor · Frente B
| # | Aceite | Como |
|---|---|---|
| A3.20 | Apagar A não toca B: dois projetos com linha em todas as tabelas da 7.1 e arquivos em todos os prefixos e pastas locais; R14 em A → 200; A com 0 linhas em toda tabela e nenhum arquivo; B com as mesmas contagens e o mesmo sha256 de cada arquivo; `gastos.jsonl` e a pasta da memória byte a byte iguais | pytest |
| A3.21 | Id malicioso: `..`, `p_..`, `p_../x`, `p_%2e%2e`, `P_ABC`, `p_abc/../../etc`, `p_` + 41 letras, nas R13, R14 e R15 → 404; o hash de todos os arquivos de `<dados>` é igual antes e depois. Link simbólico: `armazenamento/entrada/p_aaaa1111` apontando para uma pasta fora com um arquivo → apagar `p_aaaa1111` deixa o arquivo de fora intacto e conta em `recusados`; `tmp/montagem/p_aaaa1111` como link → só o link some | pytest |
| A3.22 | Recusas da 7.2, cada uma com a frase exata: job `rodando`, job `pendente` de `espelho`, entrega `no_ar`, entrega `retirando` com `proxima`, conversa rodando (cérebro falso lento), nome errado (422); nome com outra caixa e espaços → aceita | pytest |
| A3.23 | Corrida com o worker: 50 voltas com uma thread pegando e concluindo jobs do projeto e outra chamando R14 → ou 409, ou 200 e depois disso zero linhas do pid em qualquer tabela | pytest |
| A3.24 | Diário: queda simulada depois do `COMMIT` e antes da limpeza → os arquivos ficam; `apagar.varrer` apaga; diário de intenção com o projeto vivo há mais de 10 min → o diário some e nenhum arquivo do projeto é tocado | pytest com monkeypatch |
| A3.25 | R15: `no_ar` → 202, estado `retirando` e job `entregas` com `acao: retirar`; entregas desligadas → 503; versão fora da página → 409 | pytest |
| A3.26 | Regras: R16 em `r_dono_x` → some de R19, de `regras_para_prompt` e de `ver_regras`; `semear` com o mesmo id no git mantém apagado; `registrar_reprovacao` com o mesmo motivo traz de volta; `r_retencao` → 404 com a frase; R17 com `qa` `pendente` em outro projeto → 409; id do vocabulário igual em duas leituras | pytest |
| A3.27 | Apagar regra, checagem ou palavra não cria job, não muda `versoes` e não grava evento | pytest |
| A3.28 | Retenção: capítulo fechado há 100 dias (mensagens e eventos), fechado há 10 dias e aberto com pergunta pendente → a volta apaga só o primeiro; eventos da mesa intactos; `conversa_espera` intacta; `RETENCAO_DIAS=0` não apaga nada; espera artificial ligada a capítulo vencido → projeto pulado; segunda volta apaga 0; `retencao.volta` que levanta exceção não derruba `worker.limpezas` e a conexão sai sem transação | pytest |
| A3.29 | R20: `retencao_dias` 90 por padrão, `0` com a variável 0, `90` com "abc" | pytest |

### 12.3 Site · Frente C (`scripts/aceite-onda3.mjs`, contra o motor falso)
| # | Aceite | Como |
|---|---|---|
| S3.1 | Projeto em `erro`: barra com "Tentar de novo", `faz` e "custa ≈ US$ …"; toque manda um `POST /refazer` com o `de` da `sugerida`; dois toques rápidos mandam um só | Playwright conta requisições |
| S3.2 | `reprovado_qa`: sem opção → nenhum botão novo; com opção → "Conferir de novo" | Playwright |
| S3.3 | Vídeo `falhou`: "Ler de novo" na linha do vídeo manda `arquivo_id` certo | Playwright |
| S3.4 | Cartões `refazer`, `trilha` e `nota` no fio: título, `faz` sem aspas (nota com aspas), "Não muda", `mudancas` "Música", `atencao`, custo, demora e o verbo do `botao`; sem "Só neste projeto"; toque → `POST /conversa/confirmar` e a linha "Feito · …" certa | Playwright |
| S3.5 | Apagar: a prévia lista o que vai e o que fica; botão apagado com nome errado e aceso com caixa diferente; toque → `POST /apagar` → `/projetos?apagado=1` com "Projeto apagado." e o projeto fora da lista | Playwright |
| S3.6 | Apagar recusado por filme na página: frase + "Tirar a V1 da página" → `POST /retirar` → a prévia passa a `pode` → apaga | Playwright com o falso mudando o estado |
| S3.7 | Caderno: item do dono com "De: {nome} · V2 · data" e "Apagar"; item da casa com "Fixa da casa" e sem botão; confirmação com `ao_apagar`; "Apagar" → o item some e aparece "Regra apagada."; o mesmo para conferência e palavra | Playwright |
| S3.8 | Caderno com a linha de 90 dias; motor falso com `retencao_dias: 0` → "sem prazo" | Playwright |
| S3.9 | "Suas notas" aparece com `dados.notas` e some sem | Playwright |
| S3.10 | 390x844, claro e escuro, prints de: erro com "Tentar de novo", cartão de trilha, apagar aberto, Caderno com regras: sem erro de console, sem rolagem lateral, alvos ≥ 44 px, texto ≥ 11 px | `verificacao-visual` + prints em `.verificacao/onda3/` |
| S3.11 | Proxy: `POST /api/motor/v1/memoria/regras/r_dono_0123abcd/apagar` chega ao motor; `/memoria/regras/r_retencao/apagar` e `/memoria/regras/r_dono_0123abcd/../x` → 404 do proxy | `fetch` no aceite |
| S3.12 | Rótulos novos do `equipe.json` na tela ("Eco · Ouvindo as trilhas da casa") e as duas cópias iguais | Playwright + leitura de arquivo |
| Fim | `pytest -q -m "not pago"` → código 0 com mais testes que 690; `pnpm install --frozen-lockfile && pnpm tipos` → 0; aceite → código 0 com 111 + os S3 novos, todos ok | colar a última linha de cada um no relato |

---

## 13. O que ficou de fora e por quê

| Item | Por quê |
|---|---|
| Ajuste agendado durante a montagem | Hoje a rota responde 409 (`api/direcao.py:152-156`). Agendar exige guardar um pedido que dispara quando a conferência terminar, e isso cruza com o ajuste automático do QA (`pipeline.py:79-87`): dois caminhos querendo dirigir ao mesmo tempo. O ganho é poupar uma mensagem; o risco é ação dupla. O Nimbus continua dizendo "espere terminar" |
| Nota cirúrgica e operações gerais sobre a direção (onda 6) | Só a troca de música entra, porque é a única operação com contrato claro (um campo, um teste que prova o que não muda) |
| Nota entrando na direção | A nota só é guardada e mostrada. Levar ao prompt da direção pede a mesma defesa de injeção do ajuste e uma decisão do dono |
| Apagar nota | Não pedido; a nota só nasce com o toque dele |
| Desligar regra sem apagar | Apagar já desliga; reprovar igual traz de volta (D30) |
| Apagar regra da casa (vinda do código) | Voltaria no próximo deploy; a tela diz "Fixa da casa" (D31) |
| Apagar casos de referência | Não há tela de casos no Caderno; criar uma é outra onda |
| Trocar música de versão `reprovada_qa` ou `erro` | A guarda exige `entregue`; a conferência que reprovou pode não ter nada a ver com a música |
| Escolher a música dentro do cartão | Um cartão é uma ação; a escolha é uma pergunta com botões (`perguntar`) antes |
| Apagar os backups do projeto | O editor só manda para o Dropbox (não apaga lá); o Cloudflare gira em 30 dias. Dito na prévia |
| Push com a tela bloqueada, turno que o Nimbus abre sozinho, página de entregas | Fora pelo pedido desta onda |
| `projetos/creat-nuvem` | Não é tocado |

---

## 14. Riscos técnicos (do mais grave ao menos grave)

1. **Apagar o que não devia** (outro projeto, arquivo fora da pasta). Mitigação: formato do id antes de tudo, `WHERE
   projeto=?` com parâmetro, prefixo conferido chave por chave, `_p` do armazenamento local, link simbólico apagado só como
   link, diário que só limpa pid já apagado do banco, nome digitado. Prova: A3.20, A3.21, A3.24.
2. **Custo escondido** (refazer que dispara direção paga). Mitigação: `correcoes_auto = 2` (D23), direção e catálogo fora da
   conversa, partes do custo no cartão, leitura que pode começar a edição avisada. Prova: A3.3, A3.7.
3. **Corrida** apagar × worker × conversa; refazer × worker. Mitigação: guarda dentro de `BEGIN IMMEDIATE` (D21), trava da
   conversa, checagem de projeto em `_preparar_mensagem`, limpeza de linhas atrasadas. Prova: A3.6, A3.15, A3.23.
4. **Regra apagada que volta** pelo `semear` ou pelo git. Mitigação: lápide no volume (D30). Prova: A3.26.
5. **Apagar checagem derruba uma entrega em andamento.** Mitigação: D32. Prova: A3.26.
6. **A troca de música muda mais do que diz.** Mitigação: só o resolvedor roda; teste de blocos e falas iguais; o cartão diz
   que os cortes andam. Não confirmado: o efeito no filme real (ouvir uma troca de verdade antes de publicar).
7. **Retenção apaga evento da mesa ou do capítulo aberto.** Mitigação: lista fechada de tipos, corte por `ts < f_max`, espera
   conferida. Prova: A3.28.
8. **Capítulo 2 custa a reescrita do prefixo** em cada projeto com conversa (≈ US$ 0,06 cada, uma vez; não medido) e o
   histórico do capítulo 1 fica só no fio.
9. **Upload que termina depois do apagar** deixa arquivo órfão. Mitigação: varredura por 7 dias (o tus expira em 7).
10. **Estimativa de custo da leitura sem histórico** (US$ 0,05) é chute de precaução, marcada "até".

---

## 15. Interrogatório do próprio contrato (grilling por dentro)

| Pergunta | Resposta e onde está |
|---|---|
| E se o dono tocar em "Tentar de novo" na tela e no cartão da conversa ao mesmo tempo? | A transação de um passa; a do outro relê a guarda e vê a fila ocupada: 409 "não deu". Um job só (UNIQUE + 2.1). A3.6 |
| "Montar de novo" num filme que deu certo não seria útil para tirar um defeito de render? | Seria, mas `pode_reaproveitar` devolve o mesmo arquivo: o botão mentiria. Por isso só roda sobre falha (D22) |
| Conferir de novo em `reprovado_qa` gasta à toa? | Só aparece se a chave mudou (regras ou checagens do código); sem mudança, recusa com a frase. O olho de IA tem cache por sha256 e não paga de novo o mesmo filme |
| Refazer pode criar direção paga escondida? | Montagem, conferência e entrega levam `correcoes_auto = 2`: se reprovar, para. Leitura avisa quando pode começar a edição e soma a direção ao custo. Direção e catálogo só pela tela, com o custo à vista |
| A troca de música é mesmo "sem cérebro"? E os fatos e o olho? | O cérebro da direção não é chamado (A3.7 conta chamadas). O olho de IA olha o filme novo (custo no cartão). Os fatos têm cache pelo texto das falas, que não muda (não confirmado com material real) |
| O que impede o Nimbus de propor 10 trocas de música seguidas? | Um cartão por vez, guarda "fila livre", e cada uma exige o toque. A idempotência devolve a mesma versão para o mesmo pedido |
| A versão antiga some quando troca a música? | Não: continua `entregue`, aprovável, com o link do cliente. A nova é `V+1` |
| "Entregar de novo" pode publicar ou mandar para o cliente sem pedir? | Não: a entrada nova nunca leva `publicar_em` (D24), e a página de entregas só recebe filme aprovado (rota de aprovar, que não muda) |
| Apagar durante um envio de outro aparelho? | O motor não vê o tus. O arquivo que chegar depois cai na varredura de 7 dias. Na mesma aba, o botão nem aparece com envio subindo |
| Apagar com o worker no meio de um job do projeto? | Recusa: job `rodando` lido dentro da transação. Job que o worker pegar depois do `COMMIT` não existe mais |
| Uma mensagem da conversa logo depois do apagar grava linhas órfãs? | Não: `_preparar_mensagem` confere o projeto na mesma transação (3.5) e a trava do projeto serializa com o apagar. Evento de áudio atrasado é limpo pela limpeza do banco |
| O nome digitado com maiúscula automática do iPhone falha? | Não: compara sem caixa e com espaços normalizados; acento conta |
| Apagar um projeto apaga o livro de gastos ou as regras? | Não (7.1). A prévia diz o que fica |
| A lápide impede o dono de recriar a regra de propósito? | Não: reprovar com o mesmo texto tira a lápide (8.2) |
| A linha "Nenhum filme é refeito" é verdade para checagem? | Sim: nenhuma rota de apagar enfileira job (A3.27). A conferência só roda de novo se o dono pedir |
| A retenção pode apagar a pergunta que ele ainda não respondeu? | Não: só capítulos fechados, e a espera é conferida antes; o projeto com espera ligada a capítulo vencido é pulado (A3.28) |
| O texto do Caderno sobre a retenção promete o que faz? | Diz "depois de encerradas (ao aprovar um vídeo ou quando a conversa fica longa)": são as duas causas reais de capítulo novo para o dono (`laco.py:132-140`); a troca de versão do prompt também fecha, e isso não muda a promessa |
| E os backups? | Guardam o banco por até 30 dias no Cloudflare e para sempre no Dropbox. Está na prévia do apagar e no README |
| Algum texto do cartão vem do modelo? | Só o texto da nota (entre aspas, o dono lê) e o título da trilha (digitado pelo dono na biblioteca). O resto é do código |
| Há botão que não funciona? | Cada botão novo só aparece quando a opção existe agora (R11, R13, `apagavel`); a ação some ou vira frase quando não cabe |

---

## 16. Não confirmado

- O efeito da troca de música num filme real: quanto os cortes andam, se a virada da música nova cai bem no auge.
- Se o render repete o mesmo sha256 com o mesmo EDL (se sim, "montar de novo" não paga o olho de IA; o cartão já mostra o custo
  como se pagasse).
- O custo real da leitura por IA de um vídeo (sem histórico, o cartão usa "até US$ 0,05").
- O custo da virada para o capítulo 2 (≈ US$ 0,06 por projeto, pela conta; não medido na API).
- Tempo de apagar um projeto grande no R2 (centenas de objetos em `derivados/`); por isso a limpeza roda em segundo plano.
- `json_extract` presente no SQLite da imagem do Railway (vem embutido desde o SQLite 3.38; a versão da imagem não foi lida).

---

## 17. Correções do contrato feitas na construção do motor (Forja, 25/11)

| # | O que estava | O que ficou | Por quê |
|---|---|---|---|
| C1 | Seção 4 mexia só em `$defs.confirmacao` | `$defs.ferramenta.nome` também ganhou `onde_esta`, `ver_regras` e `ver_trilhas` | Sem isso o evento `ferramenta` das leituras novas não valida no `conversa.schema.json` (A1.24) |
| C2 | Descrição de `ver_regras` dizia "Apagar é botão do Marcos" | "Tirar uma regra é botão do Marcos no Caderno" | "Apagar" na descrição reprova o próprio A3.14 (`apag` em `para_api()`) |
| C3 | `apps/web/lib/equipe.json` só na Frente C | Copiado byte a byte junto com `packages/schemas/equipe.json` (versão 3) | `test_mesa_ao_vivo.py` compara as duas cópias: o pytest da Frente A quebraria sem a cópia. A Frente C não precisa mexer nele |
| C4 | `atencao` da leitura: só "Se der certo e o resto já estiver lido, a edição começa sozinha." | A mesma frase + " Se a conferência reprovar, o editor pode tentar corrigir sozinho até 2 vezes, cada uma com custo de direção." | A leitura que começa a edição segue a edição normal (não grava `correcoes_auto = 2`, tabela 2.4); o cartão precisa dizer o custo que pode vir depois |
| C5 | Catálogo e direção (tela) sem texto na seção 4 | Títulos "Organizar o material de novo", "Tentar a direção de novo" e, com `trocar_trilha` guardado, "Trocar a música de novo"; `botao` "Tentar de novo" | O R11 precisa de `titulo`, `faz` e `volta` para toda opção |
| C6 | Retenção com `json_extract(dados, '$.acao')` | O aviso `{acao: "retomar"}` é conferido em Python | `json_extract` não confirmado na imagem do Railway (seção 16) |
| C7 | Varredura: diário "apagado" com o projeto vivo não estava previsto | O diário sai e nada do projeto é tocado (log de aviso) | `limpar_arquivos` nunca toca projeto que existe no banco |
| C8 | R12: ordem dos erros | 404 do projeto antes do 422 "diga qual vídeo" | Projeto inexistente não deve receber pedido de dado |
