# Editor creat.MTT em produção (fase 2)

```
celular / PC ──► site (Vercel, São Paulo) ──► motor (Modal: API + fila + montagem)
      │                                         │
      └──── vídeo direto, em partes ──────► Cloudflare R2 ◄──┘   (o vídeo nunca passa pelo site)
                                                │
                       Anthropic (direção) · Gemini pelo Vertex (visão) · Whisper local (fala)
```

| peça | onde roda | o que guarda | custo |
|---|---|---|---|
| site | Vercel (Pro, região gru1) | nada: só login e repasse ao motor | plano Pro |
| motor | Modal, 1 máquina de 8 vCPU/16 GB que **dorme sem trabalho** | fila (SQLite com cópia no Volume a cada 30 s) | ~US$ 0,75/h só enquanto edita (estimativa: 0,25 a 0,40 por vídeo) |
| vídeos | Cloudflare R2, bucket `creat-editor-midia` | brutos, derivados e entregas | 10 GB grátis; saída grátis |
| direção | Anthropic API (`claude-opus-5-5`, esforço alto) | — | US$ 0,30 a 0,60 por vídeo |
| visão | Gemini pelo Vertex AI (crédito de teste de 90 dias) | — | dentro do crédito |

O Supabase fica reservado para a fase 3 (login de clientes e banco com várias máquinas). Hoje a fila cabe numa máquina só e o login é a senha do dono.

## Ligar, na ordem (uma plataforma por vez)

1. **Separar as chaves** (no PC, na pasta `creat-mtt`, onde está o `.env.local`):
   `node projetos/editor-creat/scripts/preparar-producao.mjs .env.local "SENHA DO SITE"`
   Sai `.env.modal` (motor) e `.env.vercel` (site). O site **não** recebe as chaves da Anthropic, do Google nem do R2.
2. **Modal: cartão e Secret.** Cadastrar o cartão (o teto de US$ 1 não aguenta um vídeo) e criar o Secret `editor-creat` colando o `.env.modal` (Secrets > Create > Custom > colar .env).
3. **GitHub: token da Modal.** No repositório, Settings > Secrets > Actions: `MODAL_TOKEN_ID` e `MODAL_TOKEN_SECRET`. Todo push na `main` que mexe no motor publica sozinho (`.github/workflows/editor-motor-modal.yml`). A URL do motor aparece no fim do deploy (`https://…--editor-creat-motor.modal.run`).
4. **Rodar o passo 1 de novo com a URL** (3º argumento) para preencher `MOTOR_URL` no `.env.vercel`.
5. **Vercel: projeto do site.** Importar o repositório `creat-mtt-studio`, Root Directory `projetos/editor-creat/apps/web`, e colar o `.env.vercel` em Settings > Environment Variables (a Vercel aceita colar o arquivo inteiro).
6. **R2: CORS.** Com o endereço do site em mãos: `python -m motor.ferramentas.r2_cors https://SEU-SITE` (no motor). Se o token do R2 for só de objetos, a Cloudflare recusa: aí `python -m motor.ferramentas.r2_cors --regra https://SEU-SITE` imprime a regra para colar no painel do bucket (Configurações > Política CORS).
7. **Conferência no ar:** entrar no site, criar um projeto, mandar um vídeo curto e acompanhar até "entregue".

## Testes

```bash
cd services/motor && python -m pytest -q -m "not pago and not real and not lento"   # 118 verdes
cd apps/web && pnpm aceite                     # modo local (tus): 18/18
cd apps/web && pnpm build && node scripts/aceite-r2.mjs   # envio direto ao R2 com navegador: 10/10
```
