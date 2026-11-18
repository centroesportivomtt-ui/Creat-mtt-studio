# Envio direto do navegador para o R2

Na Vercel o site não tem disco: o servidor tus (`/api/envio`) só serve em desenvolvimento e nesta máquina. Com
`EDITOR_ARMAZENAMENTO=r2` o arquivo vai **do navegador direto para o bucket** por *multipart upload* com URLs
pré-assinadas. O site nunca recebe os bytes do vídeo: ele cria o envio, assina cada parte, diz o que já chegou e
conclui. Em modo r2 a rota tus responde `410` com a explicação.

## Fluxo

```
navegador                         site (Next, com sessão)                      R2                      motor
   │ POST /api/envio-r2/iniciar ─────► valida nome/tamanho/projeto ──► CreateMultipartUpload
   │ ◄──────────── token (HMAC: projeto, chave, uploadId, tamanho, parte)
   │ POST /api/envio-r2/assinar ─────► URL PUT de 15 min por parte (tamanho assinado)
   │ PUT parte 1..N (3 em paralelo) ──────────────────────────────────────► grava, devolve ETag
   │ POST /api/envio-r2/partes ──────► ListParts (paginado)  ← para RETOMAR depois de recarregar
   │ POST /api/envio-r2/concluir ────► ListParts + CompleteMultipartUpload ──► HeadObject ──► POST /v1/projetos/{id}/arquivos
   │ POST /api/envio-r2/abortar ─────► AbortMultipartUpload  (botão Cancelar)
```

- **Chave:** `entrada/<projeto>/<nome-sem-acento>-<id8>.<ext>` (a mesma regra do tus). O navegador não escolhe a chave:
  ela vai dentro do token assinado.
- **Nome:** sem barra, sem `..`, sem caractere de controle; acento vira sem acento; só vídeo, áudio, imagem, pdf e zip.
- **Tamanho:** até `EDITOR_ENVIO_MAX_GB` (padrão 200). Parte de `EDITOR_ENVIO_PARTE_MB` (padrão 64, mínimo 5 do R2);
  se o arquivo passaria de 10 000 partes, a parte cresce sozinha. Todas as partes têm o mesmo tamanho (regra do R2),
  e cada URL assina o `content-length` exato: uma parte de outro tamanho é recusada pelo próprio R2.
- **Retomada:** o token e a chave ficam no `localStorage` do navegador (`ec-r2:<projeto>|<nome>|<tamanho>|<data>`).
  Fechou a aba, recarregou, o celular matou a página: escolha o mesmo arquivo; o site pergunta ao R2 (ListParts) e só
  as partes que faltam sobem. Sem rede (`offline`), o envio pausa sozinho e volta no `online` ou quando a tela volta.
- **Repetição:** cada parte tenta até 9 vezes com recuo (1 s, 2 s, 4 s ... 60 s); URL vencida é assinada de novo.
- **Registro no motor:** uma vez, no `concluir` (idempotente pela chave; o motor confere tamanho e ETag no bucket).
  Se o motor estiver fora, o arquivo já está salvo: o navegador tenta de novo, e o "Terminei de enviar" do motor
  recolhe o que estiver em `entrada/<projeto>/` sem registro.
- **O motor lê** o original pelo mesmo armazenamento R2 (`services/motor/motor/provedores/armazenamento_r2.py`):
  baixa para o cache só o que a ingestão precisa e serve o player por faixas (`Range`).

## O que configurar no Cloudflare (uma vez)

1. **Bucket:** R2 → Create bucket (ex.: `editor-creat`). Esse nome vai em `R2_BUCKET`.
2. **Chave da API:** R2 → Manage R2 API Tokens → Create API token → permissão **Object Read & Write**, só nesse
   bucket. Copie o *Access Key ID* (`R2_ACCESS_KEY_ID`) e o *Secret Access Key* (`R2_SECRET_ACCESS_KEY`). O
   *Account ID* aparece na mesma página (`R2_ACCOUNT_ID`).
3. **CORS (obrigatório):** bucket → Settings → CORS Policy → Add CORS policy → cole `docs/R2-CORS.json` trocando as
   origens pelos endereços reais do site (domínio próprio e o `*.vercel.app`; tire o `localhost` em produção).
   **`ExposeHeaders: ["ETag"]` é indispensável:** sem ele o navegador não consegue ler o ETag de cada parte, o
   envio para com a mensagem "CORS do bucket sem ExposeHeaders: ETag" e nada é concluído.
4. **Lixo de envio abandonado:** o R2 descarta multipart incompleto depois de 7 dias (regra padrão do bucket); o
   token do site vence no mesmo prazo.

## Variáveis

| nome | onde | obrigatória | o que é |
|---|---|---|---|
| `EDITOR_ARMAZENAMENTO` | Vercel e motor | sim (`r2`) | liga o envio direto e o armazenamento R2 no motor |
| `R2_ACCOUNT_ID` | Vercel e motor | sim | conta do Cloudflare (monta `https://<conta>.r2.cloudflarestorage.com`) |
| `R2_ACCESS_KEY_ID` | Vercel e motor | sim | chave da API do R2 |
| `R2_SECRET_ACCESS_KEY` | Vercel e motor | sim | segredo da chave (também assina o token do envio) |
| `R2_BUCKET` | Vercel e motor | sim | nome do bucket |
| `R2_ENDPOINT` | — | não | sobrescreve o endpoint (testes com o R2 falso, jurisdição UE) |
| `EDITOR_ENVIO_PARTE_MB` | Vercel | não (64) | tamanho da parte, mínimo 5 |
| `EDITOR_ENVIO_MAX_GB` | Vercel | não (200) | limite por arquivo |
| `MOTOR_URL`, `MOTOR_TOKEN` | Vercel | sim | onde avisar o motor quando o envio termina |

## Testar sem conta

```bash
cd apps/web && pnpm aceite:r2           # R2 falso + motor falso + site em modo r2, Playwright, ~1-2 min
node scripts/r2-falso.mjs               # só o R2 falso (porta 8790), para testar à mão com R2_ENDPOINT=http://127.0.0.1:8790
```

O R2 falso (`scripts/r2-falso.mjs`) confere a assinatura SigV4 (cabeçalho e URL pré-assinada, com validade), aplica
o CORS como o painel do R2, devolve ETag de verdade (md5; multipart = md5 dos md5 + `-N`), segue as regras de parte
do R2 e deixa derrubar a conexão no meio de uma parte (`POST /__controle/derrubar?parte=N&depois=BYTES`).
