# Frente A — ingestão e análise (leitura automática)

Cada arquivo que chega é lido sozinho, em paralelo ao envio dos outros: metadados, quadros-chave, áudio, transcrição sem VAD,
sinais visuais e momentos. A saída é `derivados/<projeto>/<arquivo>/analise.json`, válido em `packages/schemas/analise.schema.json`,
que alimenta o catálogo (frente B) e a montagem (frente C). Nenhum token é gasto aqui no modo padrão.

## Como rodar

```bash
cd services/motor
pip install fastapi httpx            # uma vez nesta máquina (faster-whisper, opencv, numpy já estão)
nice -n 5 python -m motor.ferramentas.aceite_a          # aceite completo (35 checagens)
nice -n 5 python -m pytest -m "not pago"                 # testes
EDITOR_DADOS=/caminho/dados uvicorn motor.api.app:criar --factory --port 8787   # API
EDITOR_DADOS=/caminho/dados nice -n 5 python -m motor.worker                     # worker (rode 2 em 4 CPUs)
```

```bash
# prova rápida da API (com MOTOR_TOKEN definido no motor)
curl -s -X POST localhost:8787/v1/projetos -H "Authorization: Bearer $MOTOR_TOKEN" -H 'content-type: application/json' -d '{"nome":"Bastidor 18/11","tipo_video":"bastidor"}'
curl -N localhost:8787/v1/projetos/<id>/eventos -H "Authorization: Bearer $MOTOR_TOKEN"      # status ao vivo (SSE)
```

## Rotas (`motor/api/projetos.py`, sob `/v1`, token `Authorization: Bearer $MOTOR_TOKEN`)

| rota | o que faz | erros |
|---|---|---|
| `POST /projetos` `{nome, tipo_video?}` | cria projeto (`p_xxxxxxxxxx`) | 422 nome vazio/longo, tipo fora da lista |
| `GET /projetos` · `GET /projetos/{id}` | lista · projeto com arquivos, versões e jobs | 404 |
| `POST /projetos/{id}/arquivos` `{chave, nome, bytes}` | registra o que o envio (tus) gravou em `entrada/{id}/` e enfileira o ingest; idempotente pela chave | 422 chave fora do projeto ou com `..`; 409 ainda não chegou, tamanho diferente, projeto já em direção |
| `POST /projetos/{id}/importar` `{url}` | link compartilhado do Dropbox (arquivo ou pasta) ou do Drive (arquivo); baixa no worker, retomável | 422 host não permitido, http, pasta do Drive |
| `POST /projetos/{id}/fechar-envio` | marca `envio_fechado`, estado `lendo`, tenta dirigir | 409 sem arquivo |
| `GET /projetos/{id}/eventos?depois=&seguir=&ate=` | SSE (`evento.schema.json`), aceita `Last-Event-ID`, ping a cada 15 s | 404 |
| `GET/HEAD /arquivos/{chave}` | serve `entrada/`, `derivados/`, `saidas/` com `Range` (206/416); no R2 redireciona para URL pré-assinada | 400 chave inválida, 403 outro prefixo, 404 |

## Etapas

- **ingest** (`motor/etapas/ingest.py`): `ffprobe` → uma única passada de ffmpeg com `-skip_frame:v nokey` gera os quadros-chave
  (640 px no maior lado, rotação do celular aplicada, HDR→SDR quando precisa) e o WAV 48 kHz mono; sha256 em thread paralela;
  folha de contato com até 48 quadros e o tempo no canto; `gravado_em` pelo metadado do iPhone ou pelo nome. Importação por link
  acontece aqui (job com `entrada.url`), inclusive zip de pasta do Dropbox (cada vídeo vira um arquivo do projeto).
- **analise** (`motor/etapas/analise.py`): energia (RMS 50 ms) e picos → transcrição (cache próprio) → filtros de alucinação →
  tremor/cenas/rostos/telas nos quadros-chave → momentos → validação no schema → `analise.json` + `analise.ok`.
- Idempotência: `ingest.json` e `analise.ok` guardam a assinatura da entrada; reexecutar não refaz nada (0,1 s medido).

## Provedores (padrão grátis primeiro; pago desligado sem chave)

| tipo | padrão | outros |
|---|---|---|
| armazenamento | `local` (`EDITOR_DADOS/armazenamento`, gravação atômica, chave validada) | `r2` (boto3, multipart pré-assinado; precisa `R2_*`) |
| transcrição | `faster-whisper` small int8, **sem VAD**, só temperatura 0, sem hotwords | `parakeet` (sherpa-onnx, triagem, `EDITOR_PARAKEET_DIR`), `scribe` (pago, `ELEVENLABS_API_KEY`) |
| visão | `local`: tremor (correlação de fase), cenas (histograma HSV), rostos (YuNet, baixado 1x do Hugging Face), telas, momentos heurísticos | `claude-leve` (Haiku 5.5 na folha, structured outputs, effort low), `gemini` (pago) — os dois caem no local se falharem |

Sem VAD o Whisper inventa texto em tom/música. Medido em 18/11 nos sintéticos: com hotwords saía "marcos marcos marcos" e a
transcrição de 20 s levava 66 s. Agora: sem hotwords, temperatura 0 e filtros (frase-fantasma, texto sem letra latina, confiança
média < 0,35, laço de n-grama, 3+ segmentos iguais seguidos, segmento sobre silêncio). Fala gritada ou sobre música continua
entrando (o motivo de não usar VAD).

## Tempos medidos (18/11, esta máquina, 4 vCPU divididas, 2 workers)

| material | ingest | transcrição | análise total |
|---|---|---|---|
| sintético 4K 20 s (tom + silêncio) | 0,8 s | 3,9 s | 4,3 s |
| sintético 4K 20 s (batidas, tremor, corte) | 0,7 s | 9,7 s | 10,0 s |
| real 0948_57 (HEVC 4K, 8,4 s) | 1,4 s | 2,2 s | 2,4 s |
| 5 clipes reais HEVC 4K, 241 s de material | 4,6–12,5 s cada | — | 49 s de parede = **4,9x tempo real** |

Projeção para 62 min de material: ~13 min de leitura com 2 workers, sobreposta ao envio (meta §8: até 6 min depois do último arquivo).

## Fora desta entrega
- Identificação de falante (MARCOS/RUAN/XANDE): o rótulo por voz já existe (fase 2): veja `README-falante.md`; o Scribe (pago) continua separando F0/F1.
- `proxy_480` não é gerado (decodificar o 4K inteiro custa ~90 ms/quadro); fica para GPU/Fase 2.
- Parakeet e Scribe/Gemini/Claude-leve não foram exercitados de verdade aqui (sem pacote carregável / sem chave e sem autorização).
