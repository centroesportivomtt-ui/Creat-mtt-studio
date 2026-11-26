# Plano da onda 4: o editor aprende o diálogo (ouvido fino, corte pelo som, tom de sala limpo, conferência de duas pessoas, marca do cliente e versão segurada à vista)

Data: 26/11/2026 · Autor: Cirro (arquiteto) · Estado: **contrato fechado para construir**. Nada foi implementado.
Base: `PROGRESSO.md` (seções de 26/11: "a pasta do Drive do dono não entrou" e "primeiro anúncio de diálogo pelo editor"), o código desta
cópia (`wt-onda4`, commit 656b433) e o pedido do dono repassado nesta rodada (mascote do Kal, seção 9). Raiz dos caminhos:
`projetos/editor-creat`. "arquivo:linha" quer dizer que li o trecho hoje. O que não li ou não medi está marcado **não confirmado**.

Como isto vende: o Super Kal é o cliente recorrente da creat.MTT. O primeiro anúncio de diálogo parou em "precisa de olho humano"
e a entrega da noite foi feita à mão. Cada item abaixo tira uma dessas mãos do caminho: o próximo anúncio de diálogo sai sozinho,
assinado com a marca do cliente, e o que a conferência segurar o dono vê na hora, sem esperar a equipe.

Regras que valem para tudo abaixo:
- Schema com `additionalProperties: false`: campo novo é **opcional**. Nenhuma rota antiga muda de forma. Nenhum tipo de evento novo.
- `packages/schemas/equipe.json` e `apps/web/lib/equipe.json` ficam **idênticos** (o aceite confere byte a byte).
- Custo zero: sem chamada paga, cérebro falso, testes sem rede. O modelo grande do Whisper **nunca** é baixado pela suíte padrão.
- O caso de uma voz só (`vozes` = `uma` ou `auto`) **não afrouxa em nada**: todo afrouxamento do item 4 tem teste dos dois lados.
- Um escritor por arquivo (seção 5). `PROGRESSO.md`, `FILA.md`, `package.json` e lockfile não são tocados pelas frentes.

---

## 0. Resumo das decisões

| # | Decisão | Por quê, em uma linha |
|---|---|---|
| D40 | O **ouvido fino** (Whisper grande por trechos de energia, com dicas) vira o **primeiro passo do job `catalogo`** (`catalogo.escuta`), não uma etapa nova | Fica "depois do pedido e antes do catálogo" sem mexer em `ORDEM`, no `refazer`, na linha do tempo do site nem no `pipeline` |
| D41 | O ouvido fino roda num **processo filho** com teto de memória REAL vigiado (o mesmo desenho de `conversa/ouvir.py`), `nice 10`, **um por vez no servidor inteiro** (trava em arquivo) | Estouro de memória do modelo grande não pode derrubar o worker nem o render de outro projeto |
| D42 | Queda segura = **fica a transcrição que já existe** (a do `small`, da análise), com frase na mesa. Não há modelo intermediário | Simples e previsível; o modelo do meio só gastaria mais tempo para errar parecido |
| D43 | A transcrição fina **substitui** `analise.json.transcricao` (modelo `"large-v3+trechos"`) e tem cache próprio por assinatura em `transcricao_fina.json` | Catálogo, resolvedor e conferência leem a mesma transcrição; refazer a leitura reaplica do cache sem rodar o modelo de novo |
| D44 | O corte pelo som vira o passo `montagem.cortes`, antes do render, com **marca de idempotência** em `edl.origem.cortes_audio` **e** a correção da causa (só mexe na peça cujo corte reprova na régua da conferência) | A marca sozinha esconde o defeito; a correção sozinha não protege de quem editar o EDL. As duas juntas: rodar duas vezes não alonga |
| D45 | Tom de sala: candidato de **qualquer clipe do projeto**, sem palavra da transcrição fina a menos de 0,35 s, sem sílaba no envelope e **sem voz contínua na régua física da própria conferência** (`voz_externa.voz_continua`). Sem candidato limpo: **sem tom de sala** (só o piso), dito na mesa | O resolvedor escolhe com a mesma régua que reprova; não existe mais "a conferência achou conversa no tom de sala" |
| D46 | Os quatro afrouxamentos do diálogo valem **só com `vozes = varias`** e cada um tem limite numérico escrito (seção 3.4) | O caso de uma voz é o mais vendido; ele não pode perder rigor por causa do diálogo |
| D47 | Sincronia entre câmeras por **correlação do áudio** num módulo novo (`etapas/sincronia_cameras.py`). A montagem **alinha** o plano da segunda câmera (passo `montagem.sincronia`); a conferência **mede de novo**, não confia no EDL | Sem alinhar, a segunda câmera nunca fica em sincronia e a conferência nunca aprova; sem medir de novo, a conferência viraria carimbo |
| D48 | Marca do cliente no **armazenamento** (`marcas/<slug>/logo.png`), slug igual ao das entregas (`super-kal`, com hífen), envio pela tela com validação no motor; o fecho usa a logo **por código** quando o pedido tem cliente com logo | `memoria/README.md` proíbe logo de cliente no git; o diretor não precisa lembrar de pôr a chave |
| D49 | A semente `super_kal` **não cabe** na semente da casa (seção 3.5): entra pela própria tela, na conferência pós-publicação, com o arquivo tratado | A imagem do Docker é montada a partir de `projetos/editor-creat` (não vê `kit-edicao-17-11/`) e a memória versionada não aceita material de cliente |
| D50 | Versão segurada: **rota própria** de assistir (`/segurada/video`), só com sessão, só para `reprovada_qa`, `no-store`, sem redirecionar para o R2; `/v1/arquivos/...final.mp4` continua 403 | A regra "nada de baixar nem compartilhar versão reprovada" continua de pé; o que muda é só "assistir na tela" |
| D51 | Os motivos da segurada vêm do **motor**, numa tabela de frases por checagem (`api/motivos_qa.py`), com o tempo no filme quando a checagem dá | A tela não traduz detalhe técnico; uma tabela só para o site e, depois, para a conversa |
| D52 | **Mascote do cliente** (pedido do dono nesta rodada) entra como **frente 4, onda 4b**, depois da junção de MOTOR-A, porque escreve no resolvedor e no catálogo. Moto e carro só com arte aprovada; nesta onda o Kal aparece com as duas poses que já existem | O dono pediu; a arte de moto e carro não existe e gerar é pago e precisa do aprovado dele ("nunca deformar o mascote") |

---

## 1. O que o caso real provou (base das decisões)

`PROGRESSO.md:640-646`, projeto `p_d79b29f853` (anúncio, modo ultra, `vozes = varias`, 15 vídeos de iPhone, duas pessoas, duas câmeras):

| Motivo da conferência | Causa no código (lido hoje) | Item |
|---|---|---|
| nomes errados (Guerreiro, Sisal, Bacia do Jacuípe) | `analise.py:217-271`: provedor `small` (`config.py:112`), arquivo inteiro, dicas só como `hotwords` desligadas (`transcricao_fw.py:112`) | 1 |
| `fala_cortada`, `legenda_x_fala` 64-69% | cortes no fim de palavra do Whisper; `ajustar_cortes.py` existe mas é só à mão | 1, 2 |
| `frase_repetida` / `tom_sala_sem_voz` | `resolvedor.py:871-887` só procura no clipe principal, nos da fala e nos do mesmo ambiente; conversa baixa da equipe não está na transcrição do `small` | 1, 3 |
| `voz_externa` | `voz_externa.py:20-25`: em `varias`, "voz longe dentro da peça e conversa no som direto continuam reprovando" | 4b |
| `cobertura_sintonia` | `cobertura_sintonia.py:48-60`: sincronizado só com a MESMA câmera (`_base(p) == _base(v)`) | 4d |
| fecho da creat.MTT em peça do Super Kal | `resolvedor.py:838` espera `marcas/<cliente>/logo.png`; a pasta não existe e não há rota de envio | 5 |
| dono não pôde ver V1-V3 | `api/projetos.py:393-404` (`_liberado`) e `api/versoes.py:72`: vídeo só sai `entregue` | 6 |

Defeito do `ajustar_cortes` que alonga na segunda rodada, **causa provável (não confirmada; o teste do item 2 prova antes de corrigir)**:
na primeira rodada o fim vira `fim + min(0,09; pausa − 0,13)` (`ajustar_cortes.py:84`). Com pausa curta (ex.: 0,16 s) sobram 30 ms e a
palavra seguinte começa a ~130 ms do novo corte. Na segunda rodada `fim_da_fala` vê a voz "retomando" em até 120 ms
(`audio_fala.py:79-81`), trata como oclusão e estende o fim até o fim da PRÓXIMA palavra. Cada rodada come uma palavra e alonga o filme.

---

## 2. Contratos

### 2.1 Variáveis de ambiente (todas opcionais; escritor: MOTOR-A, nos dois `.env.example`)

| Variável | Padrão | O que faz |
|---|---|---|
| `EDITOR_WHISPER_MODELO_FINO` | `large-v3` | Modelo do ouvido fino (nome do faster-whisper ou caminho). `0` ou vazio desliga o passo. `turbo` é a alavanca se a memória ou o tempo não couberem |
| `EDITOR_ESCUTA_LIMITE_MB` | `4500` | Teto de memória REAL (residente) do grupo do filho. Passou: o grupo morre e vale a queda segura. `0` desliga a vigia |
| `EDITOR_ESCUTA_THREADS` | `min(4, núcleos)` | Threads do filho (`cpu_threads`, `OMP_NUM_THREADS`) |
| `EDITOR_ESCUTA_TEMPO_S` | `240 + 2,0 × segundos de fala`, teto 1800 | Tempo máximo do filho por projeto. Estourou: o que terminou fica fino, o resto fica com a transcrição rápida |
| `EDITOR_ESCUTA_BEAM` | `5` | `beam_size` do ouvido fino (o mesmo da entrega à mão de 26/11) |

Nenhuma variável nova para MOTOR-B nem para SITE+API (constantes no código, com nome).

### 2.2 Arquivos no armazenamento

| Chave | Escritor | Conteúdo |
|---|---|---|
| `derivados/<p>/<a>/transcricao_fina.json` | MOTOR-A | `{"assinatura", "modelo", "dicas": [..], "trechos": n, "segundos": s, "transcricao": {schema de analise.transcricao}}`. Assinatura = sha de `ALGO_ESCUTA` ("escuta-1") + `ingest.assinatura` + modelo + dicas + limiar/pausa |
| `derivados/<p>/<a>/analise.json` | MOTOR-A (só o campo `transcricao`) | `transcricao.modelo = "<modelo>+trechos"`; o resto da análise não muda; `analise.ok` não muda |
| `marcas/<slug>/logo.png` | SITE+API | PNG normalizado (RGBA, lado maior entre 512 e 2048 px, sem metadados) |
| `marcas/<slug>/mascote/<pose>.png` | SITE+API (rota), frente 4 (uso) | `pose ∈ {espiada, placa, moto, carro, aceno}`; PNG com alfa obrigatório |
| `marcas/<slug>/marca.json` | SITE+API | `{"slug", "nome", "logo": {"sha256","w","h","alfa","enviado_em"} \| null, "mascote": {"<pose>": {...}}}` |
| `<dados>/tmp/escuta/` | MOTOR-A | arquivo de trabalho do filho (lista de arquivos e saída); apagado no fim; o que tiver mais de 1 h é apagado no início |
| `<dados>/tmp/escuta.lock` | MOTOR-A | trava `fcntl` (um ouvido fino por vez no servidor) |

`slug` = `entregas_r2.slug()` + `entregas_r2.RE_CLIENTE` (`entregas_r2.py:33`, `:72`): `super_kal`, `Super Kal` e `super-kal` viram `super-kal`.
`backup.py:191` passa a levar `armazenamento/marcas/` (escritor: SITE+API). Apagar projeto **não** apaga marca (é do cliente).

### 2.3 Campos novos (todos opcionais)

| Onde | Campo | Escritor | Forma |
|---|---|---|---|
| `edl.origem` (`additionalProperties: true`, sem mudar schema) | `cortes_audio` | MOTOR-A | `{"algo": "cortes-2", "voz": "<hash16 da lista voz depois>", "mexidas": n, "juntadas": n, "duracao_antes": s, "duracao_depois": s, "notas": [≤20 frases]}` |
| `edl.origem` | `sincronia` | MOTOR-B (função), MOTOR-A (grava) | `{"algo": "sinc-1", "pares": {"<fonte_voz>\|<fonte_plano>": {"offset_s", "conf", "razao"}}, "planos": {"<plano_id>": {"s0_antes", "s0_depois", "par"}}}` |
| `edl.origem` | `tom_sala` | MOTOR-A | `{"escolhido": {"fonte","s0","s1"} \| null, "recusados": [{"fonte","s0","s1","motivo"}] (≤8), "motivo": "frase" \| null}` |
| `pedido.cliente` | já existe (`pedido.schema.json`) | SITE+API (tela) | slug; a rota normaliza com `entregas_r2.slug` e devolve 422 se não casar `RE_CLIENTE` |
| `direcao.mascote` (onda 4b) | `{"entradas": [{"bloco", "tipo": "espiada\|placa\|moto\|carro", "balao": str≤28\|null, "placa": str≤18\|null, "lado": "esq\|dir"\|null}]}`, `maxItems: 3` | frente 4 | opcional em `direcao.schema.json` |

`analise.schema.json`, `edl.schema.json` e `pedido.schema.json` **não mudam** nas frentes da onda 4a.

### 2.4 Rotas novas do motor (todas atrás do token do motor e, no site, da sessão)

| Método e rota | Escritor | Resposta |
|---|---|---|
| `GET /v1/marcas` | SITE+API | `{"marcas": [{"slug","nome","logo": bool,"atualizado": iso\|null,"mascote": ["espiada",...]}], "fixos": ["super-kal","creat-mtt","marcos"]}` |
| `POST /v1/marcas/{slug}/logo` | SITE+API | corpo cru `image/png\|image/jpeg\|image/webp`, até 8 MB. 200 `{"slug","logo": true,"w","h","alfa"}`. 415 tipo; 413 tamanho; 422 "não é uma imagem válida", "imagem pequena demais: mande com pelo menos 512 px no lado maior", "imagem animada não serve como logo", "nome de cliente inválido" |
| `GET /v1/marcas/{slug}/logo` | SITE+API | `image/png`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-cache`; 404 sem logo |
| `POST /v1/marcas/{slug}/logo/apagar` | SITE+API | 200 `{"slug","logo": false}` |
| `POST /v1/marcas/{slug}/mascote/{pose}` | SITE+API | igual à logo, mais 422 "o mascote precisa de fundo transparente" sem alfa |
| `GET /v1/projetos/{pid}/versoes/{v}/segurada` | SITE+API | 200 `{"versao","estado":"reprovada_qa","nao_entregue": true,"video": "/v1/projetos/{pid}/versoes/{v}/segurada/video","duracao": s,"motivos": [{"id","titulo","frase","quando": [s,...] \| null}],"regra": "Só para assistir aqui. Não foi entregue: não baixa, não compartilha e não vai para o cliente."}`. 404 versão não existe; 409 "esta versão não está segurada pela conferência"; 410 "o vídeo desta versão não existe mais" |
| `GET\|HEAD /v1/projetos/{pid}/versoes/{v}/segurada/video` | SITE+API | `video/mp4` com Range; `Content-Disposition: inline`; `Cache-Control: no-store, private`; `X-Robots-Tag: noindex`; só `reprovada_qa`; nunca 307 para o R2 (armazenamento não local: 409 "assistir a versão segurada só funciona com o armazenamento local") |
| `GET /v1/projetos/{pid}/versoes` (existe) | SITE+API | cada versão ganha `segurada: bool` (true só em `reprovada_qa` com `final.mp4`) |

Proxy do site (`apps/web/app/api/motor/[...rota]/route.ts`): `PERMITIDAS` ganha `marcas`, `marcas/<slug>/(logo|logo/apagar|mascote/<pose>)`;
o limite de corpo de 1 MB (`route.ts:34-38`) passa a 8 MB **só** para `POST v1/marcas/<slug>/(logo|mascote/<pose>)`. Tudo o mais igual.

### 2.5 Passos novos da mesa (escritor de `equipe.json`, as duas cópias: MOTOR-A)

| Chave | Agente | rodando | feito |
|---|---|---|---|
| `catalogo.escuta` | Radar | "Ouvindo de novo as falas de {videos} vídeos" | "Ouviu de novo {videos} vídeos: {falas} falas" |
| `montagem.cortes` | Eco | "Acertando pelo som o corte de {n} falas" | "Cortes pelo som: {mexidas} de {n} acertados" |
| `montagem.sincronia` | Eco | "Sincronizando as câmeras pelo som" | "{alinhados} planos em sincronia" |

O `achado` de cada passo sai do código, em números (padrão de `passos.py`). Frases de queda, ditas no `achado`:
- escuta: "Não coube o ouvido fino agora (memória do servidor); segui com a transcrição rápida." / "...(o modelo não baixou)..." /
  "...(passou do tempo); {k} de {n} vídeos ficaram com o ouvido fino."
- tom de sala (no `achado` de `montagem.mix`, `_achado_mix`): "sem tom de sala: não achei trecho sem ninguém falando no material".

### 2.6 Funções compartilhadas entre frentes (assinatura congelada nesta onda)

| Função | Dono | Quem chama | Assinatura |
|---|---|---|---|
| `sincronia_cameras.offset(xa, xb, sr=16000, janela_s=None)` | MOTOR-B | QA (`cobertura_sintonia`, `voz_externa`) | `-> {"offset_s": float, "conf": float, "razao": float} \| None` (b = a deslocado de `offset_s`) |
| `sincronia_cameras.alinhar(edl, audio_de, modo_vozes)` | MOTOR-B | montagem (MOTOR-A), com `import` protegido | muda `edl["planos"][i]["s0"]` no lugar e devolve o dict de `origem.sincronia`; `audio_de(fonte) -> (np.ndarray mono 16 kHz, deslocamento_s) \| None` (a mesma forma de `qa.Contexto.audio_fonte`, `qa/__init__.py:100`) |
| `voz_externa.voz_continua`, `_piso_fonte`, `_trecho`, `SR_FALA` | MOTOR-B (não renomeia) | `etapas/tom_sala.py` (MOTOR-A) | como estão hoje |
| `audio_fala.*` | MOTOR-B (único escritor, se precisar) | `ajustar_cortes` (MOTOR-A, só leitura) | MOTOR-A **não** edita `audio_fala.py`; a correção do item 2 fica em `ajustar_cortes.py` |
| chave da logo `marcas/<slug>/logo.png` e `entregas_r2.slug` | SITE+API grava | `etapas/direcao.py` (MOTOR-A) | `arm.existe(f"marcas/{slug}/logo.png")` |

---

## 3. Decisões por item

### 3.1 Item 1: ouvido fino (D40, D41, D42, D43)

**Opções.** (a) etapa nova `escuta` em `ORDEM`; (b) dentro da `analise`, por arquivo; (c) primeiro passo do `catalogo`.
(a) mexe em `etapas/__init__.py:19`, `pipeline.py`, `refazer.py:26-30`, `lib/estados.ts:18-22`, `lib/equipe.ts:60` e no aceite: muito arquivo
para pouco ganho. (b) roda antes do pedido (o pedido traz os nomes) e carrega o modelo grande para cada arquivo. **Escolhida (c).**

**Fluxo** (`motor/etapas/escuta.py`, chamado no começo de `catalogo.rodar`, `catalogo.py:381`, antes de ler as análises):
1. Desligado (`EDITOR_WHISPER_MODELO_FINO` em `0`/vazio) ou provedor de transcrição diferente de `faster-whisper`: não faz nada.
2. Arquivos com fala: análise com pelo menos 1 segmento **ou** `sinais.energia.fala_pct ≥ 0,02`. Os outros ficam como estão.
3. Dicas (`dicas_do_pedido`): `analise.DICAS_CASA` (`analise.py:33`) + nomes do pedido (`texto` e `obrigatorio`: sequências de até 4
   palavras com inicial maiúscula, aceitando "do/da/de/dos/das" no meio, ex.: "Bacia do Jacuípe") + `projeto.dados.dicas` + nome do
   cliente (`entregas_r2.nome_cliente`) + os `para` distintos do vocabulário da casa (`memoria/regras.json`, até 12). Sem repetição
   (sem acento, minúsculas), pedido primeiro, até 40 termos e 400 caracteres. Vão como `initial_prompt` só em trecho ≥ 2 s
   (`retranscrever.py:77-80`: em trecho curto o prompt vira laço).
4. Cache: arquivo com `transcricao_fina.json` de assinatura igual não vai para o filho; só reaplica.
5. Filho: `nice -n 10 python -m motor.etapas.escuta_filho <tarefa.json>`, ambiente pela lista permitida de `conversa/ouvir.ambiente()`
   (sem segredo), `start_new_session`, `oom_score_adj 1000`. Carrega o modelo **uma vez**, transcreve arquivo por arquivo com as
   funções de `ferramentas/retranscrever.py` (`trechos_por_energia`, `transcrever_trechos`, `em_laco`) e imprime uma linha JSON por
   arquivo pronto. Códigos: 0 ok; 3 sem faster-whisper; 5 modelo não carregou/baixou; 2 outro erro.
6. Pai: trava `<dados>/tmp/escuta.lock` (espera até o fim do tempo do passo; não conseguiu: queda segura), lê as linhas, grava cada
   `transcricao_fina.json` e aplica no `analise.json` (passando por `analise.filtrar_transcricao` e `analise.validar_analise`), vigia
   `ouvir.rss_mb(pgid)` a cada 0,5 s e o tempo, emite `ctx.progresso` por arquivo ("Ouvindo de novo o vídeo 3 de 9").
7. Queda: filho morto por memória, tempo, código 3/5/2: o que já chegou fica fino, o resto fica como estava; o catálogo segue. O projeto
   **nunca** vai a erro por causa do ouvido fino.
8. Depois do passo, o catálogo lê as análises de novo (a `chave_in` de `catalogo.py:400` muda sozinha, porque o tamanho do JSON muda).

`retranscrever.py` continua funcionando como ferramenta (mesmos argumentos), passando a usar as mesmas funções e a gravar o mesmo
`transcricao_fina.json`. `pipeline.tentar_dirigir` passa a dizer "Material lido. Ouvindo as falas de novo e montando o catálogo."
e `refazer.MIN_PADRAO["catalogo"]` sobe de 1 para 6 minutos (estimativa da tela).

**Tempo e memória: não medidos neste servidor.** Referência pública (README do faster-whisper, consultado hoje): large-v2 int8 em GPU
usa 2,9 GB; não há número de CPU para o modelo grande. A primeira medição (local, 4 núcleos, 15 GB, sem custo) é critério de aceite.

### 3.2 Item 2: corte pelo som dentro da montagem (D44)

Módulo novo `motor/etapas/montagem/cortes.py` com `ajustar_edl(edl, arm) -> dict` (relatório), chamado em `etapa_montagem` logo depois
de `fatos.revisar` e **antes** de `pode_reaproveitar` (`montagem/__init__.py:299-310`), no mesmo molde dos fatos: se o EDL mudou, grava
`edl.json` antes do render.

Regras:
1. **Marca:** `edl.origem.cortes_audio.voz` igual ao hash da lista `voz` atual: não faz nada (rodar de novo é nada). Hash diferente (alguém
   editou o EDL depois) ou sem marca: roda.
2. **Causa:** uma peça só é mexida se o corte reprova na régua 1 da conferência (`audio_fala.corte_final_ok` / `corte_inicial_ok`, as
   mesmas de `qa/fala_cortada.py`). Corte que já passa fica. Com isso a segunda rodada não acha nada para mexer, mesmo sem marca.
3. `qa.cortes_confirmados` continua intocado (`ajustar_cortes.py:74`).
4. O mapa antigo → novo passa a cobrir também `sons_reais[].t0/t1` (hoje não cobre: `ajustar_cortes.py:203-222`).
5. Música: com uma emenda só (`trilha.emendas` de 1 item) o fim da emenda acompanha a duração nova quando a música tem sobra; com
   várias emendas, o tempo é mapeado como hoje e vai um aviso "a música foi emendada por compasso; confira a emenda aos m:ss" em
   `origem.avisos` e no `achado` do passo.
6. Falhou (fonte sem áudio, exceção): o EDL fica como veio, aviso no passo; a montagem segue. A conferência continua sendo a régua.
7. `ferramentas/ajustar_cortes.py` vira casca fina de `cortes.py` e respeita a marca (com marca e voz igual imprime "já ajustado" e sai
   0; `--forcar` ignora a marca).

### 3.3 Item 3: tom de sala nunca de trecho com voz (D45)

Módulo novo `motor/etapas/tom_sala.py`, chamado por `Resolvedor._tom_sala` (`resolvedor.py:871`):
1. Candidatos: **todos os clipes do catálogo**. Ordem de preferência: mesmo ambiente da voz principal, depois os clipes da fala, depois
   o resto; dentro de cada grupo, o critério de nível que já existe (`_silencios`, `resolvedor.py:889-930`).
2. Exclusão por transcrição: nenhuma palavra da transcrição (agora a fina) a menos de 0,35 s (já é assim: `margem = 0.35`).
3. Exclusão por envelope: o teto de sílabas que já existe (`silabas_teto_db`).
4. **Exclusão pela régua física da conferência:** o `Resolvedor` ganha o parâmetro opcional `ouvinte(arquivo_id, s0, s1) -> list[(a, b)]`
   (trechos de voz contínua), montado em `etapas/direcao.py` com `audio_fala.f0_serie` + `voz_externa.voz_continua` + o piso da fonte,
   a mesma conta de `qa/tom_sala_sem_voz.conversa_na_origem`. Candidato com voz contínua é recusado e entra em `origem.tom_sala.recusados`.
   Sem `ouvinte` (testes antigos), vale 1 a 3.
5. No máximo 12 candidatos ouvidos por filme (cada um até 6 s de áudio): custo de CPU de segundos.
6. Sem candidato: `tom_sala = None`, `origem.tom_sala.motivo = "não achei trecho sem ninguém falando no material"`, aviso em
   `origem.avisos` e no `achado` de `montagem.mix`. O mix fica só com o piso de −66 dB (`mix.py:60-67`).
`sem_fala.py` não muda (já grava `tom_sala: None`).

### 3.4 Item 4: conferência que entende diálogo (D46, D47). Tudo abaixo só com `edl.origem.vozes == "varias"`

**(a) `frase_repetida`.** No `mix`, o esperado (`esperado`, `frase_repetida.py:31-33`) passa a somar os n-gramas das **janelas de fonte
que estão no filme** (cada peça de voz de `s0` ao fim real na fonte; cada plano com `som_direto_db` de `s0` a `s0 + (t1 − t0) × vel`),
transcritas **pelo mesmo transcritor da conferência** (`c.transcrever`, para o mix e a fonte errarem igual). Frase repetida que existe
nessas janelas o mesmo número de vezes não é laço. O stem `ambiente` **nunca** afrouxa. O stem `direto` só afrouxa para os planos aceitos
em (b). `uma`/`auto`: nada muda.

**(b) `voz_externa`.**
- Voz "longe do microfone" dentro de uma peça é aceita (relatada, não reprova) quando: ≥ 60% da duração do trecho achado está coberta por
  palavras da transcrição fina da **mesma fonte** com conf ≥ 0,5, **e** essas palavras estão no `texto` da peça (a direção escolheu
  essa fala). Murmúrio sem transcrição continua reprovando.
- Conversa no som direto de um plano é aceita quando o plano é **da mesma cena**: mesma câmera (`_base` igual) com a janela de fonte a
  até 2 s de uma peça de voz que toca junto, **ou** outra câmera com sincronia medida por `sincronia_cameras.offset` (conf ≥
  `SINC_CONF_MIN`) e a janela do plano caindo, no relógio da voz, a até 2 s da peça; **e** ≥ 60% das palavras ouvidas na janela batem
  com as palavras das peças que tocam ao mesmo tempo; **e** o som direto fica ≥ 12 dB abaixo da voz no cruzamento (senão é eco).
- `uma`: tudo reprova como hoje. `auto`: como hoje.

**(c) `fala_cortada`.** Peça cuja próxima fala na fonte começa colada (a ≤ 0,25 s do corte) é aceita, com nota "colada em outra pessoa,
corte no vale", quando **todos**: a fala seguinte é de outra pessoa (assinatura CAM++ cos < 0,42 em trecho ≥ 0,45 s, ou mediana de F0
≥ 20% longe da peça); o corte está no vale (`|s1 − vale| ≤ 0,03 s`, vale = mínimo do envelope em `[s1 − 0,15; s1 + 0,15]`); o vale fica
≥ 6 dB abaixo do pico dos 0,3 s antes; a última palavra da peça termina antes de `s1 + 0,04 s`. Réguas 2, 3 e 4 continuam valendo.
Mesma pessoa continuando, corte fora do vale ou `uma`/`auto`: reprova como hoje.

**(d) `cobertura_sintonia`.** Módulo novo `etapas/sincronia_cameras.py`:
- `offset`: envelope de 10 ms (log, só a variação rápida, como `_silabas_db`) dos dois áudios; correlação cruzada normalizada numa
  janela de busca ±120 s (com `gravado_em` dos dois arquivos: ±(|Δ| + 15 s)); refinamento por GCC-PHAT a 8 kHz em ±50 ms.
  Aceita com `conf ≥ SINC_CONF_MIN = 0,45` e `razao` (pico / segundo pico fora de ±0,5 s) `≥ SINC_RAZAO_MIN = 1,4`. Senão `None`.
- `alinhar` (montagem): em `varias`, plano de outra câmera que cruza uma peça de voz por ≥ 0,5 s, sem rampa, com `cobertura.olhar`
  diferente de `produto`, com offset aceito e o trecho alinhado existindo no arquivo do plano: `s0` passa para o ponto em sincronia. Já
  sincronizado (|Δ| < 0,02 s): nada. Grava `origem.sincronia`.
- QA: além da mesma câmera, conta como sincronizado o plano de outra câmera cujo offset a **conferência mede de novo** e cujo tempo de
  fonte fica a < 0,10 s do tempo da voz + offset no começo, no meio e no fim do cruzamento. Sincronizado não é cobertura e não pede rosto.
- `uma`/`auto`: nada muda nesta onda (generalizar para apresentador com duas câmeras fica para depois, com caso real).

Gerador sintético novo `tests/sintetico_dialogo.py` (MOTOR-B): duas vozes de F0 diferente, câmera B = câmera A atrasada 3,217 s com
ruído e equalização próprios, murmúrio da equipe num plano de apoio, e as mesmas cenas em versão "uma voz" para o lado negativo.

### 3.5 Item 5: marca do cliente (D48, D49)

- `motor/marcas.py` (novo): `slug()`, `validar_imagem(bytes, tipo) -> (png_bytes, w, h, alfa)` com Pillow: confere os bytes mágicos (não
  confia no `content-type`), `Image.MAX_IMAGE_PIXELS = 40_000_000` (bomba de descompressão vira 422), `verify()` e reabre, recusa animada,
  recusa lado maior < 512 px, reduz para 2048 px, regrava PNG RGBA sem metadados; gravação atômica; `marca.json` com sha256.
- `motor/api/marcas.py` (novo): as rotas da seção 2.4. Registrada em `api/app.py:115`.
- `motor/api/direcao.py`: `PedidoEntrada.cliente` normalizado com `entregas_r2.slug` (422 se vazio depois de normalizar).
- Fecho (MOTOR-A, `etapas/direcao.py` + `resolvedor.py`): com `pedido.cliente` e `marcas/<slug>/logo.png` existindo, `fecho.logo_cliente =
  slug` mesmo que o diretor tenha deixado `null`; chave que o diretor pôs e que não existe no armazenamento **sai** do EDL com aviso
  (nunca chega ao overlay uma logo que não existe).
- Tela: no Caderno, seção "Clientes e marcas" (lista, prévia da logo, enviar/trocar/apagar, poses do mascote). No pedido do projeto, campo
  "Para qual cliente" (marcas cadastradas + fixos + "nenhum"), com a sugestão de `GET /v1/entregas/clientes?projeto=` (`versoes.py:191`).
- **Semente `super_kal`: não cabe** na semente da casa. `memoria/semear.py` só copia `memoria/` do git, `memoria/README.md:5` proíbe material de
  cliente ali e o Dockerfile (`deploy/Dockerfile.tudo`, `COPY packages`, `COPY memoria`...) não leva `kit-edicao-17-11/` para a imagem. Caminho:
  `python -m motor.marcas semear super-kal <arquivo>` (mesma validação, para teste local e servidor próprio) e, em produção, o envio pela
  tela com `kit-edicao-17-11/marcas/tratadas/superkal_logo_alfa.png` (2048×2048 RGBA, 756 KB, conferido hoje) na conferência pós-publicação.

### 3.6 Item 6: versão segurada à vista (D50, D51)

- `motor/api/versoes.py`: as duas rotas de `segurada` e o campo `segurada`. O vídeo sai por streaming próprio com Range (a mesma leitura
  de `servir_arquivo`, `projetos.py:420-470`), sem passar por `_liberado`.
- `motor/api/motivos_qa.py` (novo): `frase(checagem) -> {"titulo", "frase", "quando"}`. Tabela por id, por exemplo: `fala_cortada` "Uma fala foi
  cortada antes de terminar"; `voz_externa` "Dá para ouvir a voz de alguém que não devia estar no filme"; `cobertura_sintonia` "Aparece
  alguém falando fora de sincronia com a voz"; `frase_repetida` "Uma frase se repete no fundo, como em laço"; `tom_sala_sem_voz` "O som de
  fundo tem gente conversando"; `legenda_x_fala` "A legenda não bate com o que foi dito". Id sem frase: "Uma conferência técnica não
  passou ({nome})". `quando` sai dos tempos que a checagem já grava no `valor`, quando grava; senão `null`.
- **Texto da regra atualizado no código:** docstring e mensagem do 403 de `_liberado` (`projetos.py:393-404`), comentário de `versoes.py:72` e a
  frase do player (`Projeto.tsx:640`) passam a dizer: "Versão não entregue nunca sai do editor: não baixa, não tem link e não vai para o
  cliente. A segurada pela conferência pode ser assistida só aqui, na tela do projeto, marcada como não entregue."
- Tela (`componentes/Segurada.tsx`, novo): botão "Assistir a V1 segurada" no lugar da frase do player; `<video>` com
  `controlsList="nodownload noremoteplayback"`, `disablePictureInPicture`, menu de contexto bloqueado, faixa fixa sobre o vídeo
  "NÃO ENTREGUE · segurada pela conferência"; ao lado, os motivos com "aos 0:12" que leva o vídeo ao ponto. Nada de copiar link nem
  compartilhar. Limite honesto: quem tem a sessão (o dono) ainda consegue gravar a tela; isso é aceito.

---

## 4. Critérios de aceite (cada um vira teste; "local" = fora do CI, sem custo, com saída colada no relatório)

### Item 1
- 1.1 Pedido com "Bacia do Jacuípe, Guerreiro e Sisal": o filho falso recebe as três como dicas e `analise.json.transcricao.modelo` termina
  em `+trechos`.
- 1.2 Filho falso sai 5 (modelo não baixou): análise igual à de antes, catálogo pronto, projeto em `dirigindo`, `achado` com "segui com a
  transcrição rápida".
- 1.3 Filho falso que aloca acima de `EDITOR_ESCUTA_LIMITE_MB`: morto em ≤ 2 s, mesma queda; nenhum processo do grupo sobra.
- 1.4 Filho falso que dorme além de `EDITOR_ESCUTA_TEMPO_S`: morto; os arquivos já impressos ficam finos, os outros não.
- 1.5 Segunda rodada do catálogo com as mesmas entradas: o filho **não** é chamado (contador = 0) e a transcrição fina continua aplicada.
- 1.6 Refazer a leitura (análise de novo): o catálogo seguinte reaplica a fina do cache sem chamar o filho.
- 1.7 `EDITOR_WHISPER_MODELO_FINO=0`: nenhum filho, catálogo igual ao de hoje.
- 1.8 Trava: com `escuta.lock` presa por outro processo, o segundo espera e, passado o tempo, cai na transcrição rápida sem erro.
- 1.9 O filho nunca vê variável com cara de segredo (mesmo teste de `ouvir.ambiente`).
- 1.10 Mesa: passo `catalogo.escuta` com agente Radar, `{videos}` no início, `{falas}` no fim; `equipe.json` igual nas duas cópias.
- 1.11 (local) `large-v3` real num trecho de 60 s com fala: pico de memória residente e segundos registrados no relatório. Pico > 4 GB:
  o padrão passa a `turbo` e isso é dito no relatório. Teste só roda com `EDITOR_TESTE_MODELO_FINO=1`.

### Item 2
- 2.1 Antes da correção, teste que reproduz o defeito: áudio sintético com a palavra seguinte a 160 ms; `ajustar` duas vezes alonga. Fica
  registrado que o teste falhou antes (como no aceite da onda 1).
- 2.2 Depois: `ajustar_edl` duas vezes seguidas: `duracao`, `voz` e `planos` idênticos (|Δ| ≤ 0,005 s); a segunda devolve "nada a fazer".
- 2.3 Peça com fim 0,2 s antes do fim do som: depois da montagem, `edl.json` gravado com o fim estendido e `origem.cortes_audio` presente;
  `fala_cortada` aprova esse corte.
- 2.4 Peça em `cortes_confirmados`: intocada.
- 2.5 `sons_reais[].t0/t1`, legendas, motion, fx, sfx, `qa.logos` e trilha mapeados (teste com um item de cada).
- 2.6 Montagem reaproveitada (`pode_reaproveitar`) depois do passo não refaz o render.
- 2.7 `python -m motor.ferramentas.ajustar_cortes` num EDL já marcado imprime "já ajustado" e sai 0; com `--forcar` roda.

### Item 3
- 3.1 Candidato sem palavra na transcrição, mas com voz contínua sintética: recusado (em `recusados`) e o escolhido vem de outro clipe limpo.
- 3.2 Único trecho sem voz está num clipe de apoio de outro ambiente: ele é o escolhido.
- 3.3 Nenhum trecho limpo: `tom_sala = None`, `origem.tom_sala.motivo` preenchido e a frase no `achado` de `montagem.mix`.
- 3.4 Integração: o trecho escolhido passa em `tom_sala_sem_voz` (a mesma régua dos dois lados).
- 3.5 Sem `ouvinte`: os testes antigos de tom de sala continuam verdes.

### Item 4 (cada linha tem o lado `varias` aprovando e o lado `uma` reprovando, com o mesmo áudio)
- 4a Frase dita 3 vezes no diálogo (existe 3x nas janelas da fonte): aprova em `varias`; reprova em `uma`; frase repetida que **não** está
  na fonte reprova em `varias`; laço no stem ambiente reprova em `varias`.
- 4b Segunda pessoa longe do microfone com palavras na transcrição e no texto da peça: aprova em `varias`; murmúrio sem transcrição reprova
  em `varias`; os dois reprovam em `uma`. Som direto do plano da mesma cena com as mesmas palavras e −12 dB: aprova em `varias`; plano de
  outra cena com conversa reprova em `varias`; som direto da mesma cena a −3 dB (eco) reprova.
- 4c Fala colada de outra pessoa com corte no vale: aprova em `varias`; a mesma pessoa continuando reprova; corte 60 ms fora do vale
  reprova; tudo reprova em `uma`.
- 4d `offset` acha o atraso sintético de 3,217 s com erro ≤ 10 ms; áudio sem relação e música em laço devolvem `None`. `alinhar` põe o
  plano da câmera B em sincronia e é idempotente; plano com `olhar: produto` não é tocado. QA: plano da câmera B alinhado e com rosto
  aprova em `varias`; o mesmo plano desalinhado 0,5 s reprova; em `uma` reprova como hoje.
- 4e Os testes de QA que já existem (`test_qa_fala*.py`, `test_c_qa.py`, `test_tom_sala_origem.py` e o resto) continuam verdes sem mudar asserção.

### Item 5
- 5.1 PNG 2048 com alfa: 200, `logo.png` e `marca.json` gravados; `GET /v1/marcas` mostra `logo: true`.
- 5.2 JPEG de 300 px: 422 "pequena demais". GIF animado, SVG, HTML com `content-type: image/png`, bomba de descompressão: 422 (sem
  derrubar o motor). 9 MB: 413 no proxy e no motor. Slug `../x`, `-`, vazio: 422/404.
- 5.3 `super_kal` e `Super Kal` gravam em `marcas/super-kal/`.
- 5.4 Pedido com `cliente: "super-kal"` e logo cadastrada: o EDL sai com `logo_cliente` em `marcas/super-kal/logo.png` no fecho e em
  `qa.logos`. Sem logo: fecho da creat.MTT, sem chave quebrada. Diretor com chave inexistente: chave some, aviso aparece.
- 5.5 Backup leva `armazenamento/marcas/`. Apagar projeto não apaga marca.
- 5.6 Aceite web: no Caderno, enviar a logo, ver a prévia, trocar, apagar; no pedido, escolher o cliente e o POST levar `cliente`.

### Item 6
- 6.1 `reprovada_qa` com `final.mp4`: `GET .../segurada` devolve motivos em frase do dono; `.../segurada/video` responde 200 e 206 com
  Range, `no-store`, `inline`.
- 6.2 A mesma versão por `/v1/arquivos/saidas/.../final.mp4`: 403 (regra antiga intacta). Versão `entregue`, `montada` ou `erro` em
  `.../segurada`: 409. Sem sessão no site: 401.
- 6.3 Armazenamento não local: 409, nunca 307.
- 6.4 Aceite web: projeto em `reprovado_qa` mostra "Assistir a V1 segurada"; o player abre com a faixa "NÃO ENTREGUE", sem botão de baixar
  (`controlsList` contém `nodownload`), sem link copiável; tocar em "aos 0:12" move o vídeo para 12 s; celular 390 px sem rolagem lateral.
- 6.5 Varredura no código: nenhuma frase antiga "ela não vai para o player" sobra.

### Testes obrigatórios de cada frente (saída 0, colada no relatório)
`cd services/motor && python -m pytest -q -m "not pago"` · `cd apps/web && pnpm install --frozen-lockfile` (sozinho) ·
`pnpm tipos` · `ACEITE_PORTA_WEB=3091 ACEITE_PORTA_MOTOR=8891 pnpm aceite`.

---

## 5. Frentes, arquivos e ordem (um escritor por arquivo)

### Onda 4a: três frentes em paralelo, cada uma na sua cópia

**MOTOR-A (itens 1, 2, 3 e os ganchos de motor dos itens 5 e 4d)**
- Novos: `services/motor/motor/etapas/escuta.py`, `services/motor/motor/etapas/escuta_filho.py`,
  `services/motor/motor/etapas/montagem/cortes.py`, `services/motor/motor/etapas/tom_sala.py`,
  `services/motor/tests/test_onda4_escuta.py`, `services/motor/tests/test_onda4_cortes.py`, `services/motor/tests/test_onda4_tom_sala.py`.
- Editados: `services/motor/motor/etapas/catalogo.py`, `services/motor/motor/ferramentas/retranscrever.py`,
  `services/motor/motor/ferramentas/ajustar_cortes.py`, `services/motor/motor/etapas/montagem/__init__.py` (passos `montagem.cortes` e
  `montagem.sincronia`, este com `import` protegido de `sincronia_cameras`; `_achado_mix`), `services/motor/motor/etapas/resolvedor.py`
  (`_tom_sala`, `ouvinte`, logo do cliente), `services/motor/motor/etapas/direcao.py` (monta `ouvinte` e a marca), `services/motor/motor/config.py`,
  `services/motor/motor/pipeline.py` (frase), `services/motor/motor/refazer.py` (`MIN_PADRAO`), `packages/schemas/equipe.json`,
  `apps/web/lib/equipe.json`, `.env.example`, `deploy/.env.example`.
- Não toca: `audio_fala.py`, `etapas/qa/*`, `motor/api/*`, `apps/web/*` (exceto `lib/equipe.json`).

**MOTOR-B (item 4)**
- Novos: `services/motor/motor/etapas/sincronia_cameras.py`, `services/motor/tests/sintetico_dialogo.py`,
  `services/motor/tests/test_onda4_dialogo.py`, `services/motor/tests/test_onda4_sincronia.py`.
- Editados: `services/motor/motor/etapas/qa/frase_repetida.py`, `services/motor/motor/etapas/qa/voz_externa.py`,
  `services/motor/motor/etapas/qa/fala_cortada.py`, `services/motor/motor/etapas/qa/cobertura_sintonia.py`,
  `services/motor/motor/etapas/qa/__init__.py` (ajudantes do contexto: modo de vozes, transcrever janela de fonte), e, se precisar,
  `services/motor/motor/audio_fala.py` (único escritor).
- Não toca: `etapas/qa/tom_sala_sem_voz.py` (fica como está), montagem, resolvedor, API, site.

**SITE+API (itens 5 e 6)**
- Novos: `services/motor/motor/marcas.py`, `services/motor/motor/api/marcas.py`, `services/motor/motor/api/motivos_qa.py`,
  `services/motor/tests/test_onda4_marcas.py`, `services/motor/tests/test_onda4_segurada.py`, `apps/web/componentes/Marcas.tsx`,
  `apps/web/componentes/Segurada.tsx`, `apps/web/scripts/aceite-onda4.mjs`.
- Editados: `services/motor/motor/api/app.py` (registro do roteador `marcas`), `services/motor/motor/api/projetos.py` (texto de `_liberado`),
  `services/motor/motor/api/versoes.py`, `services/motor/motor/api/direcao.py` (`cliente`), `services/motor/motor/backup.py` (`marcas/`),
  `apps/web/app/api/motor/[...rota]/route.ts`, `apps/web/app/caderno/page.tsx`, `apps/web/componentes/Projeto.tsx`, `apps/web/app/globals.css`,
  `apps/web/scripts/motor-falso.mjs`, `apps/web/scripts/aceite.mjs` (chama `aceiteOnda4`).
- Não toca: `apps/web/lib/equipe.json`, nada em `etapas/`.

Sem arquivo em comum entre as três. Pontos de encontro (seção 2.6) são por contrato: `sincronia_cameras.alinhar` (B escreve, A chama
com `import` protegido), chave `marcas/<slug>/logo.png` (API grava, A lê), funções de `voz_externa` (B mantém).

**Ordem de junção** na linha principal, com pytest, tipos e aceite completos a cada passo: **MOTOR-B → MOTOR-A → SITE+API**. B primeiro
porque o gancho de A só liga quando o módulo de B existe; SITE+API por último porque o aceite web enxerga as frases da mesa de A.
Na junção: teste de integração do caso diálogo sintético ponta a ponta (catálogo → direção falsa → montagem → conferência aprovando em
`varias` e reprovando o mesmo material em `uma`). Depois de publicar: conferência no ar (`/v1/saude`, Caderno, envio da logo do Super Kal,
projeto de teste com versão segurada) e a medição de memória do ouvido fino no servidor real.

### Onda 4b: MASCOTE (pedido do dono, seção 9), depois da junção de MOTOR-A e SITE+API
- Novos: `packages/kit/kit/modelos/mascote.js`, `packages/kit/cenas/mascote.json`, `services/motor/motor/etapas/mascote.py`,
  `services/motor/tests/test_onda4_mascote.py`.
- Editados: `packages/schemas/direcao.schema.json` (+ `mascote`, opcional), `packages/schemas/exemplos/direcao.json`,
  `services/motor/motor/cerebro/prompts/diretor.md`, `services/motor/motor/etapas/resolvedor.py` (uma chamada),
  `services/motor/motor/etapas/catalogo.py` (linha "# mascote do cliente: poses ..."), `services/motor/motor/etapas/montagem/overlay.py`
  (`CHAVES_IMG` + `pose`).

---

## 6. Fora do escopo, com motivo

| O quê | Motivo |
|---|---|
| Biblioteca de trilhas | Depende da licença que o dono escolher (pedido desta onda) |
| Preços, chamadas pagas, cérebro real | Pedido desta onda; o crédito da Anthropic também acabou (`PROGRESSO.md:644`) |
| Embutir o modelo grande na imagem do Docker | É do DevOps (Trilho) e depende da medição 1.11; nesta onda o modelo baixa no primeiro uso para o disco do contêiner, **fora** do volume de 5 GB |
| Watch paths do Railway (publicação de outra sessão reiniciou a montagem) | DevOps; não é código do editor |
| Sincronia entre câmeras e afrouxamentos em `uma`/`auto` | Sem caso real de apresentador com duas câmeras; generalizar sem prova afrouxaria o caso mais vendido |
| Alinhar câmeras já na direção (o diretor escolher sabendo a sincronia) | Muda o catálogo e o prompt; a montagem alinhar resolve o caso real com menos peças |
| Arte do Kal de moto e de carro | Não existe; gerar é pago e precisa do aprovado do dono. Ver seção 9 |
| Marca d'água queimada no vídeo da segurada | Pede render novo; a faixa da tela e a rota sem download bastam para "não entregue" |
| Cores, arroba, frase de fecho e proibidos por cliente (o "kit do cliente" completo, lacuna 12) | Item maior; esta onda entrega o que bloqueou o caso real: a logo |

---

## 7. Riscos técnicos (do mais grave ao menos grave)

1. **Modelo grande no servidor (não medido).** Download de ~3 GB a cada publicação no disco do contêiner (espaço livre **não confirmado**),
   pico de memória provável de 3 a 4 GB competindo com o render de outro projeto, e +5 a 10 min por projeto. Mitigação: filho com teto de
   memória real, trava única, `nice 10`, queda segura, chave `EDITOR_WHISPER_MODELO_FINO=turbo|0`, medição 1.11 antes de publicar.
2. **Afrouxar a conferência no diálogo deixa passar defeito real** (a equipe falando ao fundo aprovada como "segunda pessoa"). Mitigação: só
   em `varias`, limites numéricos, palavra na transcrição como prova, testes dos dois lados com o mesmo áudio.
3. **Sincronia falsa** (pico de correlação em música alta ou ruído constante) alinha o plano errado. Mitigação: `conf` e `razao` mínimas,
   janela pelo `gravado_em`, a conferência mede de novo; sem confiança, nada é alinhado e vale a regra de hoje.
4. **Corte automático muda a duração** e pode desencontrar a música emendada por compasso. Mitigação: aviso na mesa; uma emenda só é
   estendida; a conferência continua ouvindo o resultado.
5. **Vazamento da versão segurada.** Mitigação: rota só com sessão, `no-store`, sem link, sem redirecionar para o R2, `/v1/arquivos` continua 403.
6. **Envio de imagem malicioso** (bomba, SVG/HTML disfarçado, slug com `..`). Mitigação: bytes mágicos, Pillow `verify`, teto de pixels,
   regravação em PNG, slug pela regex das entregas, limite de 8 MB só nessa rota.
7. **Resolvedor mais lento** ao ouvir candidatos de tom de sala. Mitigação: até 12 candidatos de até 6 s.
8. **Junção**: `equipe.json` em duas cópias e o gancho de sincronia entre frentes. Mitigação: um escritor só (MOTOR-A) e `import` protegido.

---

## 8. Como cada frente fecha

Relatório no formato da skill `padrao-de-entrega`: o que fez, arquivos, saída dos quatro comandos, critérios da seção 4 marcados ok /
falhou / não verificado, e a lição da rodada com prova. Revisão do Crivo em toda frente; Muralha obrigatória em SITE+API (envio de imagem,
rota de vídeo) e no filho do ouvido fino (ambiente e processo).

---

## 9. Mascote do cliente em "easter egg" (pedido do dono, 26/11)

O pedido, nas palavras dele: o mascote do Kal, pequeno, entrando umas 3 vezes ao longo do vídeo com criativos diferentes: de motinha com
fumacinha e "a zoadinha", de carrinho, descendo e botando a plaquinha da Black Friday, comunicando "alguma besteirinha", como um easter egg
com o vídeo rolando. Hoje a tela já pergunta "Usar o mascote do cliente?" (`lib/estados.ts:65-66`) e o motor não entrega (lacuna 3,
`docs/lacunas-25-11.md:27`).

**Contrato (onda 4b):**
- Poses em `marcas/<slug>/mascote/<pose>.png` (envio pela rota do item 5). Hoje existem duas: `kal_mascote_bora.png` (1254×1254, joinha,
  "BORA PRA CIMA!") e `kal_mascote_bracos.png` (942×1340, braços cruzados), em `kit-edicao-17-11/marcas/`, conferidas hoje.
- Direção: `mascote.entradas` (até 3). Tipos: `espiada` (sobe de baixo do quadro, joinha, balão curto, desce; o que o `BRIEFING.md:49` do kit
  de 17/11 já descrevia), `placa` (pose em pé + plaquinha desenhada pelo kit que cai e quica, com o texto da placa, ex.: "BLACK FRIDAY"),
  `moto` e `carro` (atravessam a tela com tremidinha de motor e fumacinha feita no kit; o carro para e troca para a pose com a placa).
- `etapas/mascote.py`: põe cada entrada no seu bloco, fora dos 3 s do gancho e do fecho, com no mínimo 6 s entre entradas, tamanho ~22% da
  largura, fora da zona da legenda e do rosto (`ctx.exigir` do kit, como em `selo.js`); pede o som pontual no banco de sons reais
  ("moto pequena passando", "buzina curta"), sem nunca sintetizar no lugar (regra do M6). Pose que falta: `moto`/`carro` viram `espiada`
  com aviso; sem pose nenhuma, nenhuma entrada.
- Diretor: só usa com cliente que tem pose e com o pedido marcando o mascote; balão de até 28 caracteres, sem preço inventado.

**O que fica de fora desta onda e por quê:** a arte do Kal **de moto e de carro**. Ela não existe, a regra do dono é "nunca deformar a arte do
mascote", e montar o recorte em pé por cima de uma moto desenhada sairia barato (abaixo do 12 de 10). O caminho é gerar as poses a partir
da arte aprovada (Higgsfield, pela autorização permanente do dono, com estimativa antes) e o dono aprovar antes do primeiro uso. Até lá o
Kal entra de `espiada` e de `placa`, e o código de `moto`/`carro` fica pronto e testado com imagem de teste.

**Critérios (onda 4b):** 3 entradas com tipos diferentes num filme de 45 s, nenhuma nos 3 s iniciais nem no fecho, nenhuma sobre a legenda
(zona segura do kit); `moto` sem pose vira `espiada` com aviso; pedido sem mascote ou modo `serio` não gera entrada; cena demo do kit
renderizada com print no celular; som pedido ao banco e, sem som no banco, aviso "pedido sem som".

---

## 10. Revisão tripla da onda 4 (código, segurança e QA): o que foi corrigido e o que ficou, com motivo

Corrigido com teste que falha sem a correção: A1 (5.6b, o recado só aparece depois de a ficha reler a lista), A2 (6.4e, a segurada abre
por cima da versão entregue), A3 (sincronia mantém o `s0_antes` da 1ª medição: a 2ª montagem não renderiza de novo), A4 (corte dentro de
pausa de 180 ms ou mais anda para dentro dela), A6 (o batimento repete a última frase e a fração), A7/S1 (teto de 16 milhões de pixels e
um decodificador por vez), A8 (com `gravado_em` nas duas fontes e mais de 60 s de diferença, a busca centra na diferença; campo opcional
`edl.fontes[].gravado_em`), A9 parte 2 (tom de sala de outro ambiente só no diálogo), A10 (palavra funcional sozinha não cobre murmúrio),
S2 (o proxy lê o corpo por blocos e para no teto), S6 (tarefa do filho em 0600, sem `preexec_fn`), QA-A1 (nome comprido quebra na ficha).
Sem teste que falhe, por natureza: S5 (`pillow>=11`), QA-A3 (aviso na tela de que o mascote ainda não entra no filme).

Ficou como está, com motivo:
- **A5, padrão `turbo`:** segue o critério escrito na seção 4 (1.11: pico do large-v3 acima de 4 GB, o padrão passa a turbo). Voltar ao
  large-v3 arrisca derrubar o ouvido fino por memória no Railway. **Não provado:** que o turbo acerta Guerreiro, Sisal e Bacia do Jacuípe
  no áudio do Black. O teste 1.11 ganhou `EDITOR_TESTE_NOMES` para essa prova (local, sem custo); `EDITOR_WHISPER_MODELO_FINO=large-v3` é a
  alavanca. O modelo ainda baixa na primeira catalogação de cada deploy: pré-baixar na imagem é tarefa do `devops` (Dockerfile) e não foi
  feito aqui, para não mexer no build sem testá-lo.
- **A9 parte 1, logo do cliente sobre `fecho.logo_cliente = null`:** é a decisão D48 (o diretor não precisa lembrar). O "sem logo" do dono
  é escolher "Nenhum" no campo do cliente do pedido.
- **A11, motor falso em JS:** as rotas novas do motor real são cobertas pelo pytest (`test_onda4_segurada.py`, `test_onda4_marcas.py`); o
  falso prova o proxy e a tela. O risco de os dois divergirem continua; o teto de pixels foi trocado nos dois lugares nesta rodada.
- **S3, "não baixa":** é "sem botão de baixar". Com a sessão, a URL direta abre; a regra do dono aceita (só com sessão, sem link público).
- **S4, evidências do QA (`qa/*.jpg`) de versão não entregue servidas com a sessão:** já existia e a mesa ao vivo usa essas imagens; só com a
  sessão. Decidir junto com S3 se a segurada passa a servir as evidências por rota própria.
- **S6, conversa:** `motor/conversa/ouvir.py` (fora do diff da onda 4) ainda usa `preexec_fn`; fica registrado para a próxima rodada.
- **QA-A5:** a faixa da segurada sobre um filme real, com muitos motivos, e o clique duplo não foram vistos (só o motor falso).
