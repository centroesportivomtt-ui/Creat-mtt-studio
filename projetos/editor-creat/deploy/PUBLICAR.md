# Publicar o Editor creat.MTT

## Caminho mais curto (um link pronto, sem comprar domínio): Railway
O editor inteiro (site + motor + workers) sobe num contêiner só (`deploy/Dockerfile.tudo`, configurado em `railway.json`).
Os segredos internos são gerados sozinhos no primeiro boot. O dono informa só 3 variáveis.

1. Abrir **https://railway.com** → **Login** → **Login with GitHub** (a conta que já tem o creat-mtt-studio).
2. **New Project** → **Deploy from GitHub repo** → escolher **creat-mtt-studio**.
3. No serviço criado → **Settings**:
   - **Source → Branch:** `claude/editor-creat`
   - **Source → Root Directory:** `projetos/editor-creat`
4. **Variables** → **New Variable**, uma por vez:
   - `EDITOR_SENHA` = a senha da casa (10+ caracteres; é com ela que se entra no editor)
   - `EDITOR_ANTHROPIC_KEY` = a chave da API da Anthropic
   - `EDITOR_CEREBRO` = `anthropic`
5. Clicar com o botão direito no serviço → **Attach Volume** → caminho **`/dados`** (guarda projetos e vídeos).
6. **Settings → Networking → Generate Domain**. Esse é o link do editor: abre no celular, notebook e computador.

A primeira subida demora alguns minutos (instala o motor, o kit e o site). O Railway cobra pelo uso; o valor aparece no painel antes de confirmar o plano.

## Alternativa: servidor próprio com domínio
`deploy/docker-compose.yml` (motor, 2 workers, site e Caddy com HTTPS automático). Ver `deploy/.env.example`.
```bash
git clone https://github.com/centroesportivomtt-ui/creat-mtt-studio && cd creat-mtt-studio/projetos/editor-creat/deploy
cp .env.example .env    # preencher domínio, senha, tokens e chave
docker compose up -d --build
```
