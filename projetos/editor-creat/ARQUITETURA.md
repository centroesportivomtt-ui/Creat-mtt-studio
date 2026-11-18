# Editor creat.MTT — Arquitetura (Cirro, 18/11/2026)

> Editor de vídeo próprio da creat.MTT: o dono sobe o material (vários GB) pelo site ou pelo celular, o motor lê tudo sozinho, o Claude **só decide** (uma direção em JSON), a montagem e a conferência são código da casa, e o vídeo sai com link, versões e publicação. Meta: **≤ 30 min por vídeo** depois do último arquivo chegar, mesma qualidade dos filmes de 17/11 ou melhor, e **uma fração dos tokens** de hoje.

## 0. Decisões em uma página

| decisão | escolha | por quê (medido/lido no material de 17/11) |
|---|---|---|
| Quem escreve código por vídeo | ninguém | Ontem cada editor gerou ~205k a 235k tokens e ficou 60% do tempo esperando ferramenta, refazendo mix 8 a 11 vezes (pesquisa A). Agora o Claude devolve uma **direção** (≤ 4k tokens) e um **resolvedor determinístico** vira EDL. |
| Entrada do cérebro | catálogo compacto em TEXTO (≤ 15k tokens) | O `cat.json` de ontem tem 165 KB (~45k tokens) e ainda faltava transcrição. Linhas curtas com ids (`C03`, `M03.2`, `F03.4`) custam ~3x menos que JSON. |
| Fila | SQLite WAL com aluguel (lease) | Uma máquina, reinício sem aviso (37 min perdidos ontem). Job com aluguel vencido volta sozinho. Interface pronta para Postgres. |
| Leitura | por arquivo, assim que chega | O envio de GBs leva mais que a análise; ler em paralelo ao envio tira a transcrição do caminho crítico. |
| Decodificação 4K | nunca inteira na ingestão | 4K HEVC custa ~90 ms/quadro (B). Ingestão = quadros-chave com `-skip_frame nokey` (11x mais rápido) + áudio. Só os trechos que entram no corte são decodificados, na montagem. |
| Transcrição | faster-whisper **sem VAD** (padrão), Parakeet para triagem | VAD Silero derrubou 5 de 6 falas gritadas/sobre música (C). Parakeet é 15x tempo real em CPU mas pior em pt-BR informal (11,6% WER vs 6,7% do turbo). |
| Motion | kit HTML+GSAP da casa, Chromium com `beginFrame` + N workers | 299 → 118 ms/quadro, pixel-idêntico, ~linear com 3 workers (B). Legenda simples pode ir por Skia/libass (7 ms e 4 ms/quadro). |
| Cor/estab./cortes | ffmpeg + OpenCV (pipeline real de V1/V2) | Já aprovado pelo dono; só vira biblioteca. |
| GPU | provedor plugável (Modal/RunPod), desligado sem chave | NVENC só em L4/L40S/A10/RTX (não em A100/H100) (G). CPU local sempre funciona. |
| QA | obrigatório, bloqueia entrega | Lições do dono: frase repetida no tom de sala, logo serrilhada, LUFS. Cada reprovação vira checagem nova. |
| Pago | atrás de interface, desligado sem chave | Regra do dono: nada pago sem autorização (exceção: Higgsfield). |

## 1. Princípios

1. **O Claude decide, o código faz.** Por vídeo existem no máximo 2 chamadas fortes (direção + crítica) e algumas leves (Haiku: tipo de vídeo, visão em folha de contato, título do post). Zero código gerado por vídeo.
2. **Tudo idempotente e retomável.** Cada etapa grava saída atômica (`.tmp` → rename) com hash da entrada; repetir é grátis. `PROGRESSO.md` na raiz registra o estado da construção.
3. **Local primeiro, pago plugável.** Todo tipo de provedor tem uma implementação grátis que funciona nesta máquina (4 CPUs, ~3 GB livres) e uma ou mais pagas desligadas sem chave (`config.provedor_efetivo`).
4. **Contratos por JSON Schema** em `packages/schemas` (draft 2020-12), validados em todo limite de etapa e no teste `tests/test_contratos.py`.
5. **Sem material de cliente no repositório.** Fixtures = mídia sintética (ffmpeg `testsrc`/`sine`) ou caminhos para o scratchpad (`/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/drako`), com teste pulado se não existir.
6. **Português do Brasil** em interface, mensagens de status, logs para o dono e documentação.

## 2. Estrutura do monorepo

```
projetos/editor-creat/
├── ARQUITETURA.md  README.md  PROGRESSO.md  .env.example  .gitignore
├── package.json  pnpm-workspace.yaml          # workspace Node (apps/web, packages/kit, packages/schemas)
├── apps/web/                                  # FRENTE D — Next.js (App Router): login, envio retomável, projetos, status, player
├── services/motor/                            # Python 3.11+ (pyproject.toml)
│   ├── motor/
│   │   ├── config.py  banco.py  pipeline.py  worker.py      # NÚCLEO (pronto, do arquiteto)
│   │   ├── api/  app.py (núcleo) · projetos.py (A) · direcao.py (B) · versoes.py (C)
│   │   ├── etapas/  __init__.py (núcleo: registro) · ingest.py analise.py (A) · catalogo.py direcao.py resolvedor.py (B) · montagem/ qa/ entrega.py (C)
│   │   ├── provedores/  base.py __init__.py (núcleo) · armazenamento_* transcricao_* visao_* (A) · render_* publicacao.py (C)
│   │   ├── cerebro/  fixture.py anthropic_api.py prompts/ orcamento.py (B)
│   │   ├── memoria/  loja.py (B)
│   │   └── ferramentas/  aceite_a.py aceite_b.py aceite_c.py · cat_legado.py (B) · edl_legado.py (C)
│   └── tests/  conftest.py test_contratos.py test_fila.py (núcleo) · test_a_* test_b_* test_c_*
├── packages/
│   ├── schemas/   pedido analise catalogo direcao edl qa evento (.schema.json) · exemplos/ · py/validar.py
│   └── kit/       motion kit da casa (copiado de V2/kit: modelos gancho, gancho2, legenda, chip, transicao, hud, fecho, fecho2, heroi, fundo, abas, camadas, checklist, pilha, rotulo, selo, stats) + ferramentas/render.cjs checar.cjs som.cjs
└── memoria/       base de conhecimento versionada: regras.json · checagens.json · casos/ · marcas/ (só creat.MTT; marcas de cliente ficam no armazenamento)
```

Dados (fora do git): `EDITOR_DADOS` (padrão `projetos/editor-creat/dados/`, em dev use `/tmp/claude-0/-home-user/419713a1-4270-5c49-aaae-4d19936ab01f/scratchpad/editor-dados`): `motor.db`, `armazenamento/` (adaptador local), `cache/`, `tmp/`.

Chaves no armazenamento:
```
entrada/<projeto>/<arquivo>.<ext>                 original (nunca reprocessado no lugar)
derivados/<projeto>/<arquivo>/audio.wav|kf/0000.jpg|folha.jpg|energia.npy|analise.json|proxy_480.mp4
projetos/<projeto>/catalogo.json|catalogo.txt|pedido.json|direcao_<n>.json|uso_<n>.json
saidas/<projeto>/<versao>/edl.json|planos/|overlay/|stems/|mix.wav|final.mp4|capa.jpg|qa.json
```

## 3. Fluxo, etapas e estados

```
site/celular ──tus/multipart──► armazenamento ──registrar──► [ingest] ─► [analise]   (por arquivo, em paralelo ao envio)
                 import Dropbox/Drive por link ──┘                              │
"terminei de enviar" + pedido (texto ou áudio) ─────────────────────────────────┤
                                                            [catalogo] ─► [direcao: diretor + crítico] ─► resolvedor ─► EDL
                                                                                  ▲                            │
                                                     relatório do QA (até 2x) ────┘                       [montagem]
                                                                                                               │
                                                                    entregue ◄─ [entrega] ◄─ aprovado ─ [qa] ◄─┘
```

| etapa | alvo | entrada | saída (schema) | dono |
|---|---|---|---|---|
| ingest | arquivo | original | `audio.wav`, quadros-chave, folha, metadados | A |
| analise | arquivo | derivados | `analise.json` (`analise.schema.json`) | A |
| catalogo | projeto | todas as análises + pedido | `catalogo.json` + `catalogo.txt` (`catalogo.schema.json`) | B |
| direcao | projeto | catálogo + pedido + memória (+ QA anterior) | `direcao_<n>.json` (`direcao.schema.json`) → resolvedor → `saidas/<v>/edl.json` (`edl.schema.json`); saída do job `{"versao": "v<n>"}` | B |
| montagem | versão | EDL | `final.mp4`, stems, overlay | C |
| qa | versão | final + stems + EDL | `qa.json` (`qa.schema.json`); saída do job `{"aprovado": bool}` | C |
| entrega | versão | final aprovado | link, capa, legenda do post, publicação (provedor) | C |

Estados do projeto (`projetos.estado`): `recebendo → lendo → dirigindo → montando → conferindo → entregue`, mais `reprovado_qa` (3 reprovações automáticas) e `erro`. Estados do arquivo: `recebido → ingerido → analisado`. Encadeamento em `motor/pipeline.py` (pronto e testado com etapas falsas em `tests/test_fila.py`).

## 4. Contratos

### 4.1 Pedido (`pedido.schema.json`)
Texto livre (ou transcrição do áudio do dono), `tipo_video` (`auto` = o cérebro leve classifica), destino, formato, `duracao_alvo`, `obrigatorio`/`proibido`, `ajustes_de` (correção de versão: reaproveita a direção anterior e muda só o pedido).

### 4.2 Catálogo compacto (`catalogo.schema.json` + forma texto)
O JSON é para máquinas (o resolvedor mapeia id → tempo). O cérebro recebe **só o texto**, neste formato (uma linha por item, sem chaves JSON):

```
# PROJETO p_demo · 41 clipes · 62 min · tipos: bastidor/evento · trilhas: t_energia_104 (104 bpm, 120 s), t_epico_140
C03 a003 "20261115_085815" 106s · mesa estável 0-42, corredor andando 42-106 · MARCOS 0-45 · amb mesa,corredor
 M03.1 0.4-8.0 fala_dono n5 Marcos na mesa abre apresentando o evento
 M03.4 42-55 broll n3 caminhada pelo corredor com logo ao fundo
 F03.1 0.4-8.0 MARCOS e.7 «o evento Drako hoje, Novembro Azul, evento masculino…»
 F03.2 9.2-17.6 MARCOS e.5 «a gente veio aqui pra poder cobrir o evento, trazer dinâmica, comunicando…»
```

Regras do montador (`motor/etapas/catalogo.py`, frente B), aplicadas em ordem até caber em `EDITOR_ORCAMENTO_ENTRADA` (15 000):
1. Tudo entra: cabeçalho de clipe (≤ 25 tokens), momentos com `desc` ≤ 12 palavras, falas.
2. Falas do dono/equipe (MARCOS, RUAN, XANDE) e falas com palavras do pedido ficam inteiras; as outras são truncadas a 14 palavras com `…`.
3. Momentos com nota ≤ 2 viram uma linha agregada por clipe (`M07.* broll n2 ×4`).
4. Clipes sem fala e sem momento ≥ 3 viram uma linha só.
5. Estimativa: `len(texto)/3.5` (pt-BR); com `ANTHROPIC_API_KEY`, confirmar com `messages.count_tokens` uma vez por projeto. O que foi cortado vai em `orcamento.cortes` (o cérebro é avisado).

### 4.3 Direção (`direcao.schema.json`) — a única saída do Claude
Decisões por id: conceito, `alem_do_pedido` (interpretar além, regra do dono), gancho (texto de tela + troca), blocos (`funcao`, `intensidade` 1-5, falas `F..` com `de`/`ate` = primeiras/últimas palavras, cobertura `M..` com efeito, texto de tela, chips, `saida` = transição), trilha (clima, curva por bloco, drop), fecho (CTA, arroba, logo do cliente) e riscos. **Sem tempos de quadro, sem palavras de legenda, sem SFX** (o resolvedor e o modelo de vídeo cuidam). Pedido à API com `output_config.format` (structured outputs) usando este schema; validado de novo no motor.

### 4.4 Resolvedor (`motor/etapas/resolvedor.py`, frente B) — direção → EDL, sem LLM
- Fala `F..` + `de`/`ate` → busca aproximada nas palavras da transcrição → `s0/s1` com folga e encaixe por energia (vale o `edl_fala.py` de V2: aperto de pausas > 0,26-0,30 s, crossfade).
- Linha do tempo: voz em `vel_fala` (atempo), `t0` = 0,2 s; blocos encaixados na grade da trilha (corte na batida, V1 `BAR`/`sec`).
- Cobertura `M..` → planos com enquadre a partir dos rostos (centro do rosto em 9:16, punch-in nos momentos cruciais, corte de escala entre frases), `estab` = `sim` quando `tremor.media_px` do trecho passa do limite, `cor` = ambiente da cena, `desfocar` = telas detectadas.
- Legendas = palavras da transcrição dentro das peças de voz, reamostradas para o tempo do filme; aplica `corrigir`; palavra com confiança < 0,5 sai (regra: só legenda o que foi dito).
- Modelo de vídeo (template, `memoria/modelos/<modelo>.json`): regras de SFX por transição/impacto (vira `sfx[]`), camadas de motion padrão (gancho, chips, fecho com logo animada), intensidade → fx.
- Tom de sala = trecho do mesmo ambiente **sem fala** na transcrição e com energia baixa (nunca de trecho com voz).

### 4.5 EDL de montagem (`edl.schema.json`)
Unifica os `edl.json` reais de 17/11. Mapa do legado (o conversor `ferramentas/edl_legado.py` da frente C faz isto e serve de teste com material real):

| EDL novo | V1 (`V1/edl.json`) | V2 (`V2/edl.json` + `planos.json` + `v2_eventos.json`) |
|---|---|---|
| `voz[]` (fonte, s0, s1, t0, t1, vel) | `voz[]` (clip, s0, s1, t, sp, g) | `pecas[]` (clip, s0, s1, o0, o1) + `vel` |
| `planos[]` (t0, t1, fonte, s0, vel, rampa, enquadre, estab, cor, som_direto_db, flash, tremor, desfocar, janela, mblur) | `planos[]` (f0, f1 em quadros, clip, s0, sp, ts, kf, stab, grade, nat, flash, shake, blur, mblur) | `planos.json` (o0, o1, clip, ref_s, vel, cx, cy, z0, z1, cor, tela) + `janelas[]` |
| `motion[]` (camadas do kit) | `ov.py` gerava a cena | `kit/cenas/creat.json` → `camadas` |
| `fx[]` | `fx[]` (impacto, bloom, leak, whip, zoomt, gagueira, foto, rush) | `whips[]` |
| `sfx[]` | `sfx[]` (t, som, g, pan) | `cues[]` |
| `trilha` (emendas, ducking, acorde_final) | `trilha2.py` (compassos) | `mix.py` (corte `km` meios-compassos) + `logo` |
| `blocos[]` | `sec{}` | `segs[].bloco` |

### 4.6 API HTTP do motor (porta 8787; `Authorization: Bearer $MOTOR_TOKEN` entre site e motor)
| método e rota | dono | corpo / resposta |
|---|---|---|
| `GET /v1/saude` | núcleo | `{ok, provedores}` |
| `POST /v1/projetos` | A | `{nome, tipo_video?}` → projeto |
| `GET /v1/projetos` · `GET /v1/projetos/{id}` | A | lista · projeto + arquivos + versões + jobs |
| `POST /v1/projetos/{id}/arquivos` | A | `{chave, nome, bytes}` (o site chama quando o envio retomável termina) → enfileira ingest |
| `POST /v1/projetos/{id}/importar` | A | `{url}` link compartilhado Dropbox/Drive (download direto, **sem chave do dono**) |
| `POST /v1/projetos/{id}/fechar-envio` | A | marca `envio_fechado` e tenta dirigir |
| `GET /v1/projetos/{id}/eventos?depois=<id>` | A | SSE (`text/event-stream`), cada evento no formato `evento.schema.json` |
| `GET /v1/arquivos/{chave...}` | A | serve arquivo do armazenamento local com `Range` (player) |
| `POST /v1/projetos/{id}/pedido` | B | `{texto}` ou `{audio_chave}` → grava `pedido.json`, tenta dirigir |
| `POST /v1/projetos/{id}/versoes/{v}/reprovar` | B | `{motivo}` → memória (regra/checagem) + nova direção |
| `GET /v1/projetos/{id}/versoes` · `POST .../{v}/publicar` | C | versões com link, QA, capa · publicação pelo provedor |

O envio retomável em si mora no site (frente D): servidor **tus** (`@tus/server` + `@tus/file-store` em dev, `@tus/s3-store` para R2 em produção, partes de 64 MB) gravando direto em `entrada/<projeto>/`. Celular: o mesmo site como PWA (tus-js-client retoma após troca de rede/tela bloqueada). Produção alternativa: multipart S3 pré-assinado direto no R2 (`Armazenamento.iniciar_multipart`).

## 5. Provedores (`motor/provedores/base.py`)

| tipo | local / grátis (padrão) | plugável (desligado sem chave) |
|---|---|---|
| armazenamento | `local` (pasta `EDITOR_DADOS/armazenamento`) | `r2` (Cloudflare R2, S3 compatível; egress grátis) |
| transcrição | `faster-whisper` small/turbo int8, sem VAD, palavras | `parakeet` (sherpa-onnx int8, triagem 15x RT, grátis), `scribe` (ElevenLabs, pago), GPU via render `modal` |
| visão | `local` (cenas por histograma, rostos YuNet/Haar, tremor por fluxo óptico em quadros-chave, telas por bordas/texto) | `claude-leve` (Haiku 5.5 olhando a folha de contato: centavos por projeto), `gemini` (vídeo, pago) |
| cérebro | `fixture` (direções gravadas, para teste) | `anthropic` (Opus 5.5 direção/crítica; Haiku 5.5 leve) |
| render | `cpu` (ffmpeg + Chromium beginFrame, `EDITOR_RENDER_WORKERS`) | `modal` (GPU L4/L40S com NVENC; RunPod como alternativa) |
| publicação | `nenhuma` (só link) | `metricool`, `meta` |

Roteamento de modelos (cérebro `anthropic`): direção e crítica = `claude-opus-5-5`, `effort` alto, thinking adaptativo, streaming, `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`); tarefas mecânicas (classificar tipo de vídeo, visão em folha, legenda do post, transcrever pedido curto) = `claude-haiku-5-5`, `effort` baixo. Ambos configuráveis por variável.

## 6. Variáveis de ambiente (nomes; valores nunca no git — ver `.env.example`)
`EDITOR_DADOS`, `EDITOR_ARMAZENAMENTO`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `EDITOR_TRANSCRICAO`, `EDITOR_WHISPER_MODELO`, `ELEVENLABS_API_KEY`, `EDITOR_VISAO`, `GEMINI_API_KEY`, `EDITOR_CEREBRO`, `ANTHROPIC_API_KEY`, `EDITOR_MODELO_DIRECAO`, `EDITOR_MODELO_LEVE`, `EDITOR_ESFORCO_DIRECAO`, `EDITOR_ORCAMENTO_ENTRADA`, `EDITOR_ORCAMENTO_SAIDA`, `EDITOR_RENDER`, `EDITOR_RENDER_WORKERS`, `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`, `EDITOR_THREADS`, `EDITOR_NICE`, `EDITOR_PUBLICACAO`, `METRICOOL_TOKEN`, `META_ACCESS_TOKEN`, `MK_SOM`, `MOTOR_URL`, `MOTOR_TOKEN`, `EDITOR_SENHA_HASH`, `EDITOR_SEGREDO_SESSAO`, `EDITOR_ENVIO_PARTE_MB`.

## 7. Orçamento de tokens por vídeo

| chamada | modelo | entrada | saída | observação |
|---|---|---|---|---|
| diretor | Opus 5.5, effort high | sistema+memória ~6k (cache) + catálogo ≤ 15k (cache) + pedido ≤ 1k | direção ≤ 4k (+ raciocínio) | catálogo fica no prefixo em cache para a 2a chamada |
| crítico | Opus 5.5, effort medium | mesmo prefixo (lido do cache a 10%) + direção ~3k | patch ≤ 1,5k | aplica e valida; só repete se o schema falhar |
| leves | Haiku 5.5 | ~2k cada × 3-5 | ~300 | tipo de vídeo, legenda do post, visão em folhas (opcional) |
| correção por QA | Opus 5.5 | prefixo em cache + relatório ~1k | ≤ 2k | no máximo 2 vezes |

Total típico: ~25k de entrada (a maior parte em cache) e ~6-8k de saída + raciocínio. Custo estimado na tabela de 03/11/2026 (Opus 5.5 US$ 4/20 por MTok, cache US$ 0,20): **~US$ 0,30-0,60 por vídeo**. Ontem: ~440k tokens gerados por 2 editores. Cada chamada grava `uso_<n>.json` (entrada, cache, saída, custo) e o site mostra o total do projeto. Teste automático: `catalogo.txt` ≤ 15k (estimado) e direção serializada ≤ 4k.

## 8. Metas de tempo (≤ 30 min do último arquivo ao link)
Referência: 41 clipes 4K, ~62 min de áudio, ~25 GB, filme de 60 a 110 s. CPU = esta máquina (4 vCPU, dividida).

| etapa | meta | teto | como |
|---|---|---|---|
| ingest (por arquivo) | ≤ 15 s/arquivo, em paralelo ao envio | 2 min após o último | `-skip_frame nokey` + áudio numa decodificação só; sem proxy 4K |
| análise (por arquivo) | transcrição ~4-5x tempo real em CPU, sobreposta ao envio | 6 min após o último | faster-whisper small int8 sem VAD, 2 workers; GPU/`scribe` derruba para < 1 min |
| catálogo | ≤ 10 s | 30 s | determinístico |
| direção (diretor + crítico) | ≤ 2 min | 4 min | 2 chamadas em streaming |
| resolvedor | ≤ 10 s | 30 s | determinístico |
| montagem: planos | ≤ 6 min | 8 min | só os trechos usados (`-ss`+`-t`), 1080x1920, N processos `-threads 2` |
| montagem: overlay | ≤ 3 min | 5 min | beginFrame 3 workers (~120 ms/quadro ÷ 3); legenda por Skia quando possível |
| montagem: voz + mix | ≤ 1 min | 2 min | numpy (mix.py de V2), DFN moderado em cache |
| montagem: composição + encode | ≤ 3 min | 4 min | x264 veryfast crf 16-18 numa passada com overlay |
| QA | ≤ 2 min | 3 min | transcreve só o mix final e o stem de ambiente (~2-4 min de áudio) |
| entrega | ≤ 30 s | 1 min | link + capa |
| **total do caminho crítico** | **~18-22 min** | **30 min** | |

## 9. QA automático (bloqueia entrega) — `qa.schema.json`
`frase_repetida` (transcreve mix E stems; frase de ≥ 3 palavras repetida ≥ 3x fora da fala = defeito até prova em contrário), `tom_sala_sem_voz`, `logo_100` (resolução da logo ≥ tamanho em tela; quadro 1080x1920 a 100% salvo como evidência), `lufs` (-14 ± 0,5), `true_peak` (≤ -1 dBTP), `quadros_pretos`, `legenda_x_fala` (texto da legenda vs transcrição do mix), `zona_segura` (topo 285, base 440, dir. 120, esq. 60 px), `legenda_sobre_rosto` (qa_rosto.py de V2), `formato` (1080x1920, 30 fps, H.264 high, yuv420p, AAC 48 kHz, faststart), `duracao`, `sincronia`, `telas_desfocadas`, `regra_memoria` (checagens geradas pelas reprovações do dono).

## 10. Memória da casa (`memoria/` no git + `motor/memoria/loja.py`)
- `regras.json`: regras de direção com origem e data (ex.: retenção, gancho em 2 s, legenda só do que foi dito, nome de terceiro nunca em legenda, logo animada no fecho, Marcos é o mais alto). Entram no prompt do sistema (prefixo em cache, ≤ 6k tokens).
- `checagens.json`: regras que viram teste no QA.
- `casos/<id>.json`: pedido + direção + resultado + nota/reprovação do dono (poucos exemplos entram no prompt por semelhança de tipo de vídeo).
- `modelos/<modelo>.json`: modelos de vídeo (evento-reel, empresa-institucional, daily-vlog, anuncio-produto) com regras de SFX, motion e ritmo.
- Reprovação do dono (`POST .../reprovar`) → cérebro leve propõe regra + checagem → gravadas com `origem`; o dono vê no site. Marcas de clientes (logos em alta) ficam no armazenamento, não no git.

## 11. Fase 1 — quatro frentes independentes

Regras de convivência: cada frente só cria/edita os arquivos da sua lista. Arquivos do núcleo (`config.py`, `banco.py`, `pipeline.py`, `worker.py`, `etapas/__init__.py`, `provedores/base.py`, `provedores/__init__.py`, `api/app.py`, `packages/schemas/*.schema.json`) mudam só com nota em `PROGRESSO.md` e teste do núcleo passando (`pytest services/motor/tests/test_fila.py tests/test_contratos.py`). Mudança de schema é da frente B e deve manter os exemplos válidos. Commits pequenos em `claude/editor-creat`, sem push. Toda execução pesada com `nice -n 5`, `-threads 2`, intermediários em 1080x1920 e limpeza de temporários (disco ~3 GB).

### Frente A — motor: ingestão e análise
**Arquivos:** `motor/api/projetos.py`; `motor/etapas/ingest.py`, `motor/etapas/analise.py`; `motor/provedores/armazenamento_local.py`, `armazenamento_r2.py` (boto3, desligado sem `R2_*`); `transcricao_fw.py`, `transcricao_parakeet.py`, `transcricao_scribe.py` (desligado); `visao_local.py`, `visao_claude.py` (desligado sem chave), `visao_gemini.py` (desligado); `motor/importar.py` (link Dropbox `?dl=1` / Drive `uc?export=download`); `motor/ferramentas/aceite_a.py`; `tests/test_a_*.py`.
**Interfaces:** implementa `Armazenamento`, `Transcricao`, `Visao`; registra `@etapa("ingest")` e `@etapa("analise")`; grava `derivados/<p>/<a>/analise.json` válido em `analise.schema.json`; rotas de projetos/arquivos/importar/fechar-envio/eventos(SSE)/arquivos(Range).
**Reaproveitar:** extração de quadros e transcrição de 17/11 (`drako/tools/`, `V2/py/tr.py`), `qa_rosto.py` (Haar), medição de tremor de `shot.py`/`planos.py`, pesquisa B/C/D.
**Aceite (executável aqui):** `cd services/motor && nice -n 5 python -m motor.ferramentas.aceite_a` →
1. gera 2 vídeos sintéticos (ffmpeg `testsrc2` 2160x3840 rotação -90, 20 s, com `sine` e um trecho de silêncio) + usa 1 clipe real curto do scratchpad (`aud/0948_57.m4a` ou `seg/0948_57_*.mov`, pulado se não existir);
2. cria projeto pela API (TestClient), registra os arquivos, roda `motor.worker --ate-ocioso --etapas ingest,analise`;
3. confere: `analise.json` válido para os 3; quadros-chave ≥ duração/GOP; `vad == false`; transcrição do clipe real contém "competir"; rotação aplicada (w < h); SSE devolve `etapa_fim` dos 6 jobs; reexecução não refaz nada (idempotência, < 2 s); tempo por arquivo registrado em `tempos` e ≤ meta da §8 no clipe sintético.
4. `pytest -m "not pago"` verde.

### Frente B — motor: direção, schemas e memória
**Arquivos:** `motor/etapas/catalogo.py`, `motor/etapas/direcao.py`, `motor/etapas/resolvedor.py`; `motor/cerebro/fixture.py`, `anthropic_api.py`, `orcamento.py`, `prompts/diretor.md`, `prompts/critico.md`; `motor/memoria/loja.py`; `memoria/regras.json`, `checagens.json`, `modelos/*.json`, `casos/`; `motor/api/direcao.py`; `motor/ferramentas/cat_legado.py` (converte `drako/cat.json` + `drako/trs/*.json` em análises válidas), `aceite_b.py`; `packages/schemas/*` (dona dos contratos); `tests/test_b_*.py`.
**Interfaces:** `Cerebro` (dirigir/criticar/leve) com `fixture` (lê `memoria/casos/*/direcao.json` ou `packages/schemas/exemplos/direcao.json`) e `anthropic` (SDK oficial `anthropic`, structured outputs com `direcao.schema.json`, cache no prefixo sistema+catálogo, streaming, fallbacks); `catalogo(analises, pedido) -> (catalogo_json, catalogo_txt)`; `resolver(direcao, catalogo, analises, modelo_video, trilhas) -> edl` válido; memória: `regras_para_prompt(tipo_video)`, `registrar_reprovacao(projeto, versao, motivo)`.
**Reaproveitar:** `V2/py/edl_fala.py` (encaixe por energia, aperto de pausas), `V2/py/voz_build.py` (tempos de saída), `V1/py/edl.py` (planos/kf/flash), roteiros `drako/ROTEIRO_*.md` e `GUIA.md` (regras para `memoria/regras.json`), regras do `/root/.claude/CLAUDE.md` (lições de 17/11).
**Aceite:** `nice -n 5 python -m motor.ferramentas.aceite_b` →
1. `cat_legado` converte o material de 17/11 (47 clipes, pulado se não existir; sem ele, usa as análises sintéticas da frente A ou o exemplo) e o catálogo sai válido com **≤ 15 000 tokens estimados** e todas as falas do MARCOS inteiras;
2. com `EDITOR_CEREBRO=fixture`, uma direção gravada para o caso "bastidor creat" (escrita à mão a partir do `V2/edl.json`, ids do catálogo novo) passa pelo resolvedor e gera EDL válido: todas as falas resolvidas, duração dentro de ±10% do alvo, legendas só com palavras da transcrição (confiança ≥ 0,5), correção "RUAN na filmagem" aplicada, tom de sala de trecho sem fala, fecho com logo e `@creat.mtt`;
3. prompt do diretor montado (sistema+memória+catálogo+pedido) ≤ 22k tokens estimados e direção ≤ 4k;
4. `registrar_reprovacao` cria regra + checagem e elas aparecem no próximo prompt;
5. teste `pago` (só com chave **e** autorização do dono): 1 direção real com Opus 5.5, gravando `uso_1.json`.

### Frente C — motor: montagem e QA (pipeline real)
**Arquivos:** `motor/etapas/montagem/` (`__init__.py` com `@etapa("montagem")`, `planos.py`, `voz.py`, `trilha.py`, `mix.py`, `overlay.py`, `fx.py`, `comp.py`); `motor/etapas/qa/` (`__init__.py` com `@etapa("qa")`, uma checagem por arquivo da §9); `motor/etapas/entrega.py`; `motor/provedores/render_cpu.py`, `render_modal.py` (desligado), `publicacao.py`; `motor/api/versoes.py`; `motor/ferramentas/edl_legado.py`, `aceite_c.py`; `packages/kit/**` (render.cjs com `HeadlessExperimental.beginFrame` + `--workers`, contrato `window.__mk.seek`; integrar o pacote `drako/turbo/` quando estiver pronto, sem editar aquela pasta); `tests/test_c_*.py`.
**Interfaces:** `montar(edl, saida_dir) -> {final, stems, overlay}`; `conferir(final, stems, edl) -> qa.json` válido; `entregar(versao) -> {link, capa, legenda_post}`; `Render` (cpu|modal); EDL → cena do kit: `motion[]` + `legendas` viram `camadas` de `packages/kit/cenas/*.json`.
**Reaproveitar (virar biblioteca, sem caminhos fixos):** `V2/py/planos.py` (reenquadre 4K, estabilização LK + caminho suave, cor por ambiente `COR`, desfoque de telas), `V1/py/shot.py` (rampa, tremor, flash, texto atrás com matte), `V2/py/voz_build.py` + DFN moderado, `V2/py/mix.py` (ducking lento, trilha emendada, -14 LUFS, TP), `V1/py/trilha2.py` (emendas por compasso), `V1/py/fx.py` (impactos e recodificação só dos trechos mexidos), `V2/py/comp.py` (whips, janelas, overlay), `V2/py/qa_rosto.py`, `scratchpad/ouvido/ouvido.py` (checagem de áudio).
**Aceite:** `nice -n 5 python -m motor.ferramentas.aceite_c` →
1. EDL sintético (o `exemplos/edl.json` apontando para 2 fontes `testsrc2` 4K geradas na hora e trilha `sine` em batida) → `final.mp4` de 10 s 1080x1920 30 fps H.264 + AAC 48 kHz com gancho, legenda, chip, whip e fecho do kit;
2. QA aprovado: -14 ± 0,5 LUFS, TP ≤ -1 dBTP, sem quadro preto, legenda na zona segura, formato certo;
3. **teste negativo:** o mesmo EDL com `tom_sala` apontando para um trecho com voz sintetizada repetida (`flite`/`espeak` se houver, senão um WAV gerado com fala do clipe real) → QA reprova com `frase_repetida` ou `tom_sala_sem_voz`; logo de 300 px em tela cheia → reprova `logo_100`;
4. com material real (pulado se não existir): `edl_legado.py V2/edl.json` converte e renderiza o trecho 0-8 s do filme V2, e a folha de contato é olhada;
5. medir ms/quadro do overlay (meta ≤ 130 ms com 3 workers) e registrar em `PROGRESSO.md`.

### Frente D — site mínimo
**Arquivos:** `apps/web/**` (Next.js 15 App Router, TypeScript, sem framework de UI pesado): `app/entrar/page.tsx`, `app/projetos/page.tsx`, `app/projetos/novo/page.tsx`, `app/projetos/[id]/page.tsx`, `app/api/envio/[[...tus]]/route.ts` (servidor tus), `app/api/motor/[...rota]/route.ts` (proxy autenticado para o motor, inclusive SSE), `lib/sessao.ts` (cookie assinado), `lib/motor.ts`, `public/manifest.webmanifest` (PWA para celular), `scripts/motor-falso.mjs` (implementa a API da §4.6 com estados simulados, para a frente D não depender de A/B/C), `scripts/aceite.mjs`.
**Interfaces:** login por senha única (`EDITOR_SENHA_HASH`, scrypt) + cookie `HttpOnly` assinado (`EDITOR_SEGREDO_SESSAO`); envio retomável com `tus-js-client` (partes de `EDITOR_ENVIO_PARTE_MB`, padrão 64; retoma após fechar a aba pelo `fingerprint`), ao concluir chama `POST /v1/projetos/{id}/arquivos`; status ao vivo por SSE com linha do tempo das etapas e mensagens em pt-BR; caixa do pedido (texto; gravação de áudio no celular opcional); player `<video>` com `Range` e lista de versões (aprovada/reprovada, QA resumido); botão "reprovar com motivo".
**Design:** seguir `direcao-de-arte` e `taste-skill` da casa (grafite, âmbar, vermelho Aba 71; nada de cara de template). Celular primeiro.
**Aceite:** `cd apps/web && pnpm install && pnpm aceite` →
1. sobe `motor-falso.mjs` (porta 8788) e `next build && next start` (porta 3000);
2. Playwright: senha errada recusa; senha certa entra; cria projeto; envia arquivo sintético de 300 MB (`fallocate`/ffmpeg) e **interrompe a 40% (recarrega a página) e retoma** sem recomeçar (bytes enviados > 40% logo após retomar); o arquivo final no armazenamento tem o mesmo sha256;
3. manda pedido, vê o status passar por lendo → dirigindo → montando → conferindo → entregue (eventos do motor falso), e o player toca a versão (vídeo sintético de 5 s);
4. `node .claude/skills/verificacao-visual/olhar.cjs http://localhost:3000/projetos` sem erro de console, sem rolagem horizontal, prints em celular e desktop olhados.

## 12. Depois da Fase 1
- **Fase 2:** integração ponta a ponta com o material de 17/11 (meta: refazer o filme V2 em ≤ 30 min com ≤ 30k tokens), GPU Modal ligada com autorização, R2 em produção, domínio próprio, app de envio do celular (PWA com envio em segundo plano).
- **Fase 3:** publicação direta (Metricool/Meta), memória que se melhora (nota do dono por versão, casos como exemplos), mais modelos de vídeo (anúncio, daily vlog, institucional), sede 3D mostrando a equipe trabalhando no projeto (tese da casa).

## 13. Riscos e respostas
| risco | resposta |
|---|---|
| disco (~3 GB livres) | nada de 4K reprocessado; planos em 1080x1920; limpar `tmp/` por etapa; aceite usa vídeos sintéticos de 20 s |
| CPU dividida | `nice -n 5`, `-threads 2`, workers configuráveis; metas medidas, não supostas |
| reinício | fila por aluguel + etapas idempotentes + `PROGRESSO.md` |
| transcrição errada em nome próprio | `dicas` (vocabulário da casa: creat.MTT, Ruan, Xande) + correção na direção + palavra incerta fica fora da legenda |
| cérebro sem chave | `fixture` mantém o fluxo inteiro testável sem custo |
| qualidade abaixo de 17/11 | QA bloqueante + comparação lado a lado com V2 na Fase 2 antes de trocar o fluxo atual |
