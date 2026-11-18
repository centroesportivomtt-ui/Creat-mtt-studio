# Editor creat.MTT · Relatório da Fase 1 (18/11/2026)

Branch `claude/editor-creat` (sem push). Este relatório cobre as correções da revisão do Crivo, os aceites das 4 frentes rodados de novo e o teste ponta a ponta da fase 1 feito pelo site.

## Resumo em uma linha
O vídeo sobe pelo site, é lido, dirigido, montado, conferido e entregue por link sem ninguém mexer. No teste ponta a ponta, o relógio do dono marcou **3 min 7 s** para um filme de 22 s. Na primeira tentativa o QA **barrou um defeito real**: um texto do V2 aprovado invadia a coluna de botões do Reels. O defeito foi corrigido no próprio kit.

## 1. Correções da revisão do Crivo

| # | item | status | onde |
|---|---|---|---|
| 1 | site mostrava e deixava baixar versão reprovada ou ainda não conferida | **corrigido**: o player e o "Baixar" só aparecem quando a versão está `entregue`; o motor responde **403** a `final.mp4`, `mix.wav`, `stems/` e `capa.jpg` de versão não entregue (GET e HEAD); `/versoes` não devolve link nem vídeo antes da entrega; o texto do player vazio diz o motivo | `api/projetos.py` (`_liberado`), `api/versoes.py`, `Projeto.tsx`, `motor-falso.mjs` |
| 2 | QA aprovava sem ter conferido quando a transcrição quebrava | **corrigido**: transcritor ausente, ou transcrição com `erro` (MemoryError incluído), faz `frase_repetida`, `tom_sala_sem_voz` e `legenda_x_fala` voltarem `ok:false, bloqueia:true` com "NÃO VERIFICADO". Tom de sala sem stem `ambiente` também bloqueia | `etapas/qa/__init__.py` (`nao_verificado`) e as 3 checagens |
| 3 | job morto 3 vezes ficava "rodando" para sempre | **corrigido**: `banco.recolher_mortos` + `worker.recolher_mortos` (uma transação) marcam `falhou`, emitem `etapa_erro` e levam o projeto ao estado certo | `banco.py`, `worker.py` |
| 4 | falha definitiva não mudava o estado do projeto; arquivo corrompido travava a direção | **corrigido**: `pipeline.falha_definitiva`. Falha de ingest ou análise tira o arquivo do projeto com aviso, e o projeto segue com os outros (ou vai para `erro` se nenhum foi lido). Nas outras etapas, projeto e versão vão para `erro` com a mensagem | `pipeline.py`, `worker.py` |
| 5 | retomada depois de reinício não era atômica | **corrigido**: `concluir + etapa_fim + pipeline.depois` rodam numa transação `BEGIN IMMEDIATE`. Ao subir, o worker roda o reconciliador (`pipeline.reconciliar`). O aluguel caiu de 600 s para 120 s, com renovação numa thread; depois de um `kill -9` o job volta em cerca de 2 min | `worker.py` (`_Batimento`, `_transacao`), `pipeline.py`, `banco.py` |
| 6 | o tipo de vídeo do "Novo projeto" não chegava ao diretor | **corrigido**: o pedido com tipo `auto` herda o tipo do projeto (provado no E2E: `evento`) | `api/direcao.py` |
| 7 | com `falante: null`, a fala do Marcos era truncada no catálogo | **corrigido (paliativo)**: sem falante rotulado no projeto, toda fala que coincide com o momento "fala com rosto em quadro" (nota ≥ 4) fica inteira. **Pendência de fundo:** a frente A ainda precisa rotular o falante | `etapas/catalogo.py` (`falas_protegidas`) |
| 8 | arquivo enviado com o motor fora do ar ficava órfão | **corrigido**: `fechar-envio` lista `entrada/<pid>/` no armazenamento e no disco e registra o que faltar (idempotente; ignora arquivos da importação por link em andamento) | `api/projetos.py` (`_recolher_orfaos`) |
| 9 | a tela de QA nunca aparecia com o motor real; faltavam chips | **corrigido**: o motor grava em `versoes.qa` um JSON resumido (aprovado e checagens com detalhe), que o site lê direto. O site mostra o detalhe das falhas, e `aprovada_qa`, `reprovada_qa` e `erro` ganharam chip e rótulo próprios | `etapas/qa/__init__.py` (`resumo_coluna`), `Projeto.tsx` |
| 10 | produção com R2 não funcionava (o tus gravava em disco e o motor recusava o registro) | **corrigido com passo de transição**: com `EDITOR_ARMAZENAMENTO=r2`, ao registrar (e no `fechar-envio`), o motor sobe para o R2 o arquivo que o tus deixou em disco e mantém a cópia no cache. O envio direto ao R2 (`@tus/s3-store`) fica para a fase 2 | `api/projetos.py` (`_promover_para_r2`) |
| 11 | o limite de tentativas do login era contornável com `X-Forwarded-For` | **corrigido**: o login usa `x-real-ip` ou o **último** salto do XFF, e há um limite global de 40 tentativas em 10 min | `app/api/entrar/route.ts`, `lib/sessao.ts` |
| 12 | API do motor aberta com `MOTOR_TOKEN` vazio | **corrigido**: comparação com `hmac.compare_digest`. Sem token, o motor só atende loopback e se recusa a subir com `MOTOR_HOST`/`--host` fora de 127.0.0.1 | `api/app.py` |

Itens "menor" também resolvidos:
- SVG é servido como anexo, com CSP sandbox e `nosniff`.
- O README avisa que `--sem-build` precisa de um build anterior.
- Com cérebro fixture, o QA não gasta 2 renders à toa: a direção grava o cérebro usado e o pipeline pula a "correção" que sairia idêntica.
- `correcoes_auto` volta a zero quando o dono reprova.
- `reprovar` recusa com 409 se a direção ou a montagem da versão estiver rodando, e cancela o que estava na fila para a versão reprovada.
- A gravação da memória (`regras.json`) tem trava de arquivo.

Itens "menor" pendentes, sem risco para a fase 1:
- Vocabulário da reprovação com escopo por cliente.
- `importar.py` sem `Content-Length`.
- Critério único de "câmera tremida" no catálogo.

Cada item tem teste que reproduz o cenário da revisão: `services/motor/tests/test_revisao_crivo.py`, 22 testes.

## 2. Testes rodados de novo

| frente | comando | resultado | tempo |
|---|---|---|---|
| núcleo + todas | `pytest -m "not pago"` (em `services/motor`) | **121 passed, 1 skipped** | 24 s |
| A · ingestão e análise | `python -m motor.ferramentas.aceite_a` | **35/35** em 4 de 5 rodadas. Uma rodada deu 34/35 porque a análise de um clipe de 20 s levou 20,3 s, contra a meta de 20 s, com a máquina em carga 4,9 dividida com outro processo. É meta de tempo, não defeito funcional | 23 s |
| B · direção e memória | `python -m motor.ferramentas.aceite_b` | **30/30** | 17 s |
| C · montagem e QA | `python -m motor.ferramentas.aceite_c` | **31/31** | 301 s |
| D · site | `cd apps/web && pnpm aceite` | **18/18**, verificação visual 4×4 telas sem erro | 78 s |
| **E2E fase 1 pelo site** | `python -m motor.ferramentas.e2e_fase1` | **14/14** | 187 s |

Ordem dos testes: os aceites A, C e D rodaram depois das correções da revisão. O B rodou depois da mudança no `reprovar`. As três mudanças posteriores (`gancho2` na zona segura, fixture de EDL e trava da memória) estão cobertas pelo pytest de 121 testes e pelo E2E, que renderizou o `gancho2` novo. O aceite C não foi repetido depois delas, para poupar disco.

Observação: `test_download_retomavel` e `test_zip_so_midia_e_sem_zip_slip` falham quando a máquina tem menos de 0,5 GB livres. É a trava de disco do importador funcionando. Com espaço liberado, passam.

## 3. Teste ponta a ponta da fase 1 (pelo site, motor real, cérebro fixture)

**Caminho:** login → novo projeto (tipo evento) → envio tus do clipe `1016_50_0.mov` (42 MB, 12 s, HEVC 4K do dia 17/11) → fechar envio → pedido → ingest → análise → catálogo → direção (fixture) → montagem → QA → entrega → link pelo site com Range.

**Cérebro fixture:** `EDITOR_CEREBRO_EDL` aponta para `drako/V2/edl.json`. O `edl_legado` converte esse EDL, e o fixture aplica o "corte curto": o começo do V2 até 15,23 s mais o fecho original (pilha, transição aba71 e logo com @creat.mtt), total de 22,26 s. A fonte `1016_50@0` passa a ler o arquivo enviado pelo site (`fontes_do_envio: ['1016_50@0']`), então o clipe enviado entra de fato no filme. As outras 6 fontes vêm do material de 17/11 no scratchpad. Custo de token: zero.

### Tempos medidos (4 vCPU divididas com outro processo, carga ~6,5)

| etapa | tempo |
|---|---|
| envio tus 42 MB (loopback, partes de 16 MB) | 0,27 s |
| ingest | 1,6 s |
| análise (transcrição sem VAD, rostos, cenas) | 8,4 s |
| catálogo | 0,01 s |
| direção (fixture) | 0,02 s |
| montagem: planos HEVC 4K → 1080x1920 | 90 s (em paralelo com o overlay) |
| montagem: overlay (motion kit, beginFrame, 3 workers) | 107 s (em paralelo) |
| montagem: voz + trilha + mix | 13 s |
| montagem: composição + encode | 36 s |
| **montagem total** | **143 s** |
| QA (14 checagens, transcrição do mix e dos stems) | 32 s |
| entrega (capa, legenda do post, link) | 1,5 s |
| **relógio do dono (fechar envio → entregue)** | **187 s (3 min 7 s)** para 22,3 s de filme |

Resultado: H.264 High 1080x1920 30 fps, 22,27 s, -14 LUFS, QA 14/14 sem falha nem aviso. A legenda do post gerada sem LLM foi "Não é sobre vídeos estáticos. / Segue a / @creat.mtt". Enquanto a versão estava `montada`, o site respondeu **403** ao vídeo, e depois de `entregue` respondeu **206** (link do resultado: `/api/motor/v1/arquivos/saidas/<p>/v1/final.mp4`). Cópia do resultado (o motor do teste foi desligado): `/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/e2e-resultado/final.mp4`, com `qa.json`, `edl.json`, `capa.jpg` e `resultado.json`.

### A primeira tentativa foi reprovada, e com razão
A tentativa 1, só com o começo do filme até 15,23 s, chegou a `reprovado_qa` em 99,6 s:
- **`zona_segura`**: "ESTÁTICOS." do gancho do V2 ia até x = 1023, dentro da coluna de botões do Reels (limite 960). O ponto final era somado depois do ajuste de tamanho. É um defeito real do filme aprovado em 17/11, e o QA novo pegou. O modelo `gancho2` do kit foi corrigido e agora mede o texto com o ponto e respeita a `ZONA` do kit. Na tentativa 2, o ponto termina em x ≈ 910.
- **`regra_memoria` (c_arroba_fecho)**: o corte sem fecho ficou sem @creat.mtt. Daí veio o "corte curto com fecho".

Nas duas situações o site não deixou ver nem baixar a versão reprovada. É a regra "nunca mandar versão com erro conhecido" funcionando.

### Projeção para um filme inteiro (estimativa, não medida)
Esta máquina monta cerca de 6,4 s por segundo de filme. Um filme de 110 s como o V2 levaria em torno de 12 min de montagem e uns 3 min de QA. A análise de cerca de 62 min de material, a 4-5x tempo real com 2 workers, termina de 6 a 7 min depois do último envio, porque corre em paralelo ao envio. **Total estimado: 20 a 25 min**, abaixo dos 30, mas com pouca folga em CPU dividida. A GPU (Modal) ou uma máquina dedicada dá a folga.

## 4. O que falta para produção: contas e chaves, em ordem

Nada foi contratado. Os itens marcados como pagos precisam de autorização do Marcos antes.

1. **Cloudflare R2** (armazenamento dos GBs, link de entrega). Conta Cloudflare, bucket e token de API. Variáveis: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` e `EDITOR_ARMAZENAMENTO=r2`. Tem camada grátis de 10 GB; acima disso, cobra por GB armazenado, sem custo de saída. Pago acima da camada grátis.
2. **Servidor para o motor e o site**, mais **domínio com HTTPS**. Uma máquina com 8 vCPU, 16 GB e 200 GB de NVMe já tira o aperto de hoje (4 vCPU divididas e menos de 1 GB livre). O proxy reverso precisa mandar `x-real-ip`. Segredos que nós mesmos geramos, sem conta: `MOTOR_TOKEN`, `EDITOR_SENHA_HASH` e `EDITOR_SEGREDO_SESSAO` (`pnpm senha "..."`). Pago.
3. **Anthropic API** (o cérebro de verdade, no lugar do fixture). `ANTHROPIC_API_KEY`, `EDITOR_CEREBRO=anthropic` e o teste pago com `EDITOR_AUTORIZADO_PAGO=1`. Custo estimado de US$ 0,30 a 0,60 por vídeo (ARQUITETURA §7). Pago.
4. **Modal** (GPU L4/L40S com NVENC, para render e transcrição em filmes longos dentro dos 30 min). `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` e `EDITOR_RENDER=modal`. Pago por segundo de uso.
5. **Publicação direta**: Metricool (`METRICOOL_TOKEN`) ou Meta (`META_ACCESS_TOKEN`, conta Business do Instagram). Até lá, a entrega é por link.
6. Opcionais: `GEMINI_API_KEY` (visão por vídeo) e `ELEVENLABS_API_KEY` (transcrição Scribe, mais rápida). Os dois são pagos e ficam desligados sem chave.

Código que ainda falta para produção, sem conta nova:
- Envio direto do navegador ao R2 (`@tus/s3-store` ou multipart pré-assinado). O passo de transição atual exige o site e o motor no mesmo disco.
- Identificação de falante (Marcos, Ruan, Xande) na frente A.
- Postgres no lugar do SQLite quando houver mais de uma máquina.

## 5. Próximos passos da fase 2
1. **Filme inteiro com o cérebro real**: refazer o V2 a partir do material bruto de 17/11 (41 clipes, cerca de 25 GB) com o Claude via API, com metas de ≤ 30 min e ≤ 30k tokens, e comparar lado a lado com o V2 aprovado antes de trocar o fluxo atual.
2. **Rotular o falante** na análise (voz e rosto), para a regra "Reel em cima da fala do Marcos" valer sem o paliativo do item 7.
3. **R2 em produção, com envio direto e retomável do celular** (PWA com envio em segundo plano), mais domínio próprio.
4. **GPU Modal ligada** com autorização, com o roteamento CPU↔GPU pelo tamanho do filme.
5. **QA de kit**: rodar a `zona_segura` em todos os modelos do kit com textos longos, porque o caso "ESTÁTICOS." mostrou que um modelo pode furar a zona com texto real, e transformar isso em teste do kit.
6. **Memória por cliente** (escopo das reprovações) e casos novos a cada filme aprovado.
7. **Fase 3** em seguida: publicação direta, nota do dono por versão e a sede 3D mostrando a equipe no projeto.

## Como rodar
```bash
cd projetos/editor-creat/services/motor
nice -n 5 python -m pytest -m "not pago" -q
nice -n 5 python -m motor.ferramentas.aceite_a   # e aceite_b, aceite_c
cd ../../apps/web && pnpm install && pnpm aceite           # build + aceite do site
cd ../../services/motor && nice -n 5 python -m motor.ferramentas.e2e_fase1   # E2E (precisa do build do site)
```
Variáveis novas no `.env.example`: `EDITOR_CEREBRO_EDL` e `EDITOR_CEREBRO_EDL_ATE` (só teste ou demonstração) e `MOTOR_HOST`.
