# Deploy do Editor creat.MTT (Modal + Vercel)

Motor (Python) na **Modal**, site (Next.js) na **Vercel**, banco no **Supabase** (Postgres), arquivos no **Cloudflare R2**.
Nada disto está publicado: cada passo abaixo é PAGO ou mexe em conta externa e só roda com o "pode" do dono.

```
celular/navegador ──► Vercel (apps/web, região gru1) ──MOTOR_URL + MOTOR_TOKEN──► Modal "editor-motor"
        │  envio direto (URL pré-assinada)                                         api · trabalhar · vigia · render_gpu
        └──────────────────────────────► R2 (originais, derivados, vídeos) ◄──────────┘   fila/eventos ► Supabase
```

O motor na Modal é **sem estado local**: o disco do contêiner (`/tmp`) é só rascunho. Ele se recusa a subir
(`EDITOR_SEM_ESTADO=1`, já na imagem) se faltar R2, Postgres ou `MOTOR_TOKEN`. Memória da casa, trilhas e perfis de
falante (JSON pequenos) ficam no Volume `editor-motor-estado`, criado sozinho no primeiro deploy.

## 1. Modal (motor)

1. Conta em modal.com. Na sua máquina: instale o cliente `modal` 1.x com versão exata (`pip install modal==<versão>`,
   anote aqui a versão usada) e rode `modal token new` (abre o navegador e grava o token só na sua máquina).
2. **Secret** — painel da Modal > **Secrets** > **Create new secret** > **Custom** > nome exatamente `editor-motor`.
   Cole as variáveis da tabela 1 (nome = valor). Não ponha nenhuma delas no repositório.
3. Publicar (no repositório): `cd projetos/editor-creat/services/motor && modal deploy deploy/modal_app.py`.
   O primeiro deploy monta a imagem (ffmpeg, Node 22, Chromium do Playwright, modelo whisper `small`, dependências
   exatas de `deploy/requisitos-modal.txt`): leva alguns minutos. Se alguma versão fixa falhar ao instalar, ajuste
   o arquivo (sempre `==`) e publique de novo.
4. No fim, o terminal mostra a URL da função `api`, no formato `https://<sua-conta>--editor-motor-api.modal.run`.
   Teste: `curl -H "Authorization: Bearer <MOTOR_TOKEN>" <URL>/v1/saude` deve responder `{"ok": true, ...}` com
   `armazenamento: r2`. Essa URL é o `MOTOR_URL` do site.
   Conferência por dentro (só leitura, nada pago): `curl -H "Authorization: Bearer <MOTOR_TOKEN>" <URL>/v1/conferir`
   devolve, por serviço (banco, r2, modal, cerebro, variaveis), `ok | falhou | desligado` com o motivo e o tempo.
   `?escrita=1` também grava e apaga um objeto minúsculo `.conferir/<ts>` no R2. Nenhum valor de chave sai na resposta.
5. Custos: `api` e `trabalhar` só ligam quando há uso (scale to zero); `vigia` roda a cada 5 min por poucos segundos;
   `render_gpu` (L4) só entra com `EDITOR_RENDER=modal` e filme acima de `EDITOR_GPU_LIMITE_S` (padrão 120 s
   equivalentes: duração x fator de resolução, 4K = 4).

**Tabela 1 · secret `editor-motor` na Modal**

| variável | onde cola | obrigatória? | o que é |
|---|---|---|---|
| `MOTOR_TOKEN` | Modal > Secrets > editor-motor | sim | token longo e aleatório que o site manda ao motor (o MESMO vai na Vercel) |
| `EDITOR_ARMAZENAMENTO` | Modal > Secrets > editor-motor | sim | `r2` |
| `R2_ACCOUNT_ID` | Modal > Secrets > editor-motor | sim | ID da conta Cloudflare (R2 > visão geral) |
| `R2_ACCESS_KEY_ID` | Modal > Secrets > editor-motor | sim | chave de acesso do token de API do R2 |
| `R2_SECRET_ACCESS_KEY` | Modal > Secrets > editor-motor | sim | segredo do token de API do R2 |
| `R2_BUCKET` | Modal > Secrets > editor-motor | sim | nome do bucket |
| `EDITOR_BANCO` | Modal > Secrets > editor-motor | sim | `postgres` |
| `DATABASE_URL` | Modal > Secrets > editor-motor | sim | URL de conexão do Supabase (Project Settings > Database > Connection string, modo pooler) |
| `EDITOR_CEREBRO` | Modal > Secrets > editor-motor | não (padrão fixture) | `anthropic` para a direção com o Claude |
| `ANTHROPIC_API_KEY` | Modal > Secrets > editor-motor | com o cérebro | chave da API da Anthropic |
| `EDITOR_RENDER` | Modal > Secrets > editor-motor | não (padrão cpu) | `modal` liga a GPU para filmes grandes (gasto autorizado pelo dono) |
| `MODAL_TOKEN_ID` | Modal > Secrets > editor-motor | com a GPU | token da Modal (Settings > API Tokens) para o motor chamar `render_gpu` |
| `MODAL_TOKEN_SECRET` | Modal > Secrets > editor-motor | com a GPU | segredo desse token |
| `EDITOR_GPU_LIMITE_S` | Modal > Secrets > editor-motor | não (120) | peso a partir do qual o filme vai para a GPU |
| `EDITOR_TRANSCRICAO` | Modal > Secrets > editor-motor | não (faster-whisper) | `parakeet` ou `scribe` |
| `EDITOR_WHISPER_MODELO` | Modal > Secrets > editor-motor | não (small) | modelo do whisper (o `small` já vem na imagem) |
| `ELEVENLABS_API_KEY` | Modal > Secrets > editor-motor | com o scribe | chave da ElevenLabs |
| `EDITOR_VISAO` | Modal > Secrets > editor-motor | não (local) | `claude-leve` ou `gemini` |
| `GEMINI_API_KEY` | Modal > Secrets > editor-motor | com o gemini | chave do Google AI Studio |
| `EDITOR_PUBLICACAO` | Modal > Secrets > editor-motor | não (nenhuma) | `metricool` ou `meta` |
| `METRICOOL_TOKEN` | Modal > Secrets > editor-motor | com metricool | token do Metricool |
| `META_ACCESS_TOKEN` | Modal > Secrets > editor-motor | com meta | token da Meta |
| `EDITOR_MODELO_DIRECAO` | Modal > Secrets > editor-motor | não | modelo da direção (padrão do config) |
| `EDITOR_MODELO_LEVE` | Modal > Secrets > editor-motor | não | modelo das tarefas leves |
| `EDITOR_ESFORCO_DIRECAO` | Modal > Secrets > editor-motor | não | esforço da direção |
| `EDITOR_ORCAMENTO_ENTRADA` | Modal > Secrets > editor-motor | não | teto de tokens de entrada |
| `EDITOR_ORCAMENTO_SAIDA` | Modal > Secrets > editor-motor | não | teto de tokens de saída |
| `EDITOR_AUTORIZADO_PAGO` | Modal > Secrets > editor-motor | não | trava de gasto pago (ver .env.example) |

Já definidas pela imagem (não cole): `EDITOR_DADOS=/tmp/editor-dados`, `EDITOR_SEM_ESTADO=1`, `EDITOR_MODAL_WORKER=1`,
`EDITOR_MEMORIA`, `EDITOR_TRILHAS`, `EDITOR_FALANTES_DIR`, `EDITOR_YUNET`, `PLAYWRIGHT_BROWSERS_PATH`.

## 2. Vercel (site)

1. vercel.com > **Add New** > **Project** > importar o repositório do GitHub.
2. **Root Directory**: `projetos/editor-creat/apps/web` (Settings > Build and Deployment > Root Directory).
   Framework Next.js, instalação e build já vêm de `apps/web/vercel.json` (pnpm, região `gru1` São Paulo,
   `maxDuration` 300 s no proxy do motor). **Node.js Version**: `22.x` (mesma página).
3. Variáveis da tabela 2 em Settings > **Environment Variables** (ambiente Production), depois **Deploy**.
4. Conferência no endereço real (regra do dono): abrir o site no celular em 4G, entrar, criar um projeto, enviar um
   vídeo curto e ver o status ao vivo mudar. Só então dizer "no ar".

**Tabela 2 · Vercel > Settings > Environment Variables**

| variável | onde cola | obrigatória? | o que é |
|---|---|---|---|
| `MOTOR_URL` | Vercel > Environment Variables | sim | URL da função `api` da Modal (passo 1.4), `https://...modal.run` |
| `MOTOR_TOKEN` | Vercel > Environment Variables | sim | o mesmo da tabela 1 |
| `EDITOR_SEGREDO_SESSAO` | Vercel > Environment Variables | sim | 32+ caracteres aleatórios; assina o cookie de sessão |
| `EDITOR_AUTH` | Vercel > Environment Variables | não (senha) | `senha` ou `supabase` |
| `EDITOR_SENHA_HASH` | Vercel > Environment Variables | com `senha` | hash scrypt gerado por `pnpm senha` |
| `SUPABASE_URL` | Vercel > Environment Variables | com `supabase` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Vercel > Environment Variables | com `supabase` | chave pública (anon) do Supabase |
| `SUPABASE_JWT_SECRET` | Vercel > Environment Variables | com `supabase` | segredo JWT do Supabase (Project Settings > API) |
| `EDITOR_EMAILS_PERMITIDOS` | Vercel > Environment Variables | com `supabase` | e-mails que podem entrar, separados por vírgula |
| `EDITOR_ARMAZENAMENTO` | Vercel > Environment Variables | sim | `r2` (envio direto do navegador ao R2; a Vercel não tem disco) |
| `R2_ACCOUNT_ID` | Vercel > Environment Variables | sim | o mesmo da tabela 1 |
| `R2_ACCESS_KEY_ID` | Vercel > Environment Variables | sim | o mesmo da tabela 1 |
| `R2_SECRET_ACCESS_KEY` | Vercel > Environment Variables | sim | o mesmo da tabela 1 |
| `R2_BUCKET` | Vercel > Environment Variables | sim | o mesmo da tabela 1 |
| `R2_ENDPOINT` | Vercel > Environment Variables | não | endpoint S3 próprio (só se não for o padrão da conta) |
| `EDITOR_ENVIO_PARTE_MB` | Vercel > Environment Variables | não | tamanho de cada parte do envio |
| `EDITOR_ENVIO_MAX_GB` | Vercel > Environment Variables | não | maior arquivo aceito |
| `MOTOR_SSE_JANELA_S` | Vercel > Environment Variables | não (240) | duração de cada conexão do status ao vivo antes de reconectar |

No R2 (Cloudflare > R2 > bucket > Settings): **CORS** liberando `PUT` e `GET` para o domínio da Vercel (envio
direto do navegador) e uma **regra de ciclo de vida** apagando `tmp/` após 1 dia (trechos da GPU que sobrarem).

## 3. Testar sem publicar

```
cd projetos/editor-creat/services/motor
PYTHONPATH=. python -m pytest -q tests/test_deploy_modal.py tests/test_render_roteador.py   # Modal falsa, sem rede
cd ../../apps/web && pnpm tipos && VERCEL=1 MOTOR_URL=https://motor.exemplo MOTOR_TOKEN=x pnpm build
```
