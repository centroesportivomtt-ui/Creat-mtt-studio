# apps/web — site do Editor creat.MTT (frente D)

O dono entra com uma senha, cria o projeto, sobe o material (vários GB, do celular ou do computador), diz o que quer e acompanha a "ilha ao vivo" até o vídeo aparecer no player. Next.js 15 (App Router) + TypeScript, sem framework de UI.

## Rodar

```bash
cd apps/web
pnpm install                 # instalação isolada (pnpm-workspace.yaml próprio): não mexe no node_modules das outras frentes
pnpm senha "uma senha forte" # imprime EDITOR_SENHA_HASH e EDITOR_SEGREDO_SESSAO; cole em .env.local (fora do git)
pnpm motor-falso             # motor de mentira na 8788, mesma API da ARQUITETURA §4.6 (sem precisar das frentes A/B/C)
MOTOR_URL=http://127.0.0.1:8788 pnpm dev   # ou: pnpm build && pnpm start
```

Com o motor de verdade: `MOTOR_URL=http://127.0.0.1:8787` e o mesmo `MOTOR_TOKEN` dos dois lados. O site grava o envio no **mesmo** armazenamento local do motor (`$EDITOR_DADOS/armazenamento`), então os dois precisam do mesmo `EDITOR_DADOS`.

## Aceite

```bash
cd apps/web && pnpm install && pnpm aceite        # build + start + Playwright; ~75 s nesta máquina
pnpm aceite --sem-build --manter                  # reaproveita o build; mantém dados e logs para olhar
                                                  # (precisa de um build anterior: sem a pasta .next falha com "não subiu")
```

O aceite gera senha, segredo e token na hora (nada fica salvo), sobe o motor falso e o site e confere:
1. sem sessão, API do motor, envio e páginas ficam bloqueados; login vindo de outra origem é recusado;
2. senha errada recusa, senha certa entra (cookie HttpOnly, SameSite=Lax);
3. cria projeto pela tela, envia 300 MB, recarrega a página perto de 40% e escolhe o arquivo de novo: o envio continua de onde parou (> 40%) e o arquivo no armazenamento tem o mesmo sha256; não sobra resto do tus;
4. fecha o envio, manda o pedido e o status passa por lendo → dirigindo → montando → conferindo → entregue; o relógio para; o player toca (Range pelo proxy, 206);
5. verificação visual logada em celular e desktop, claro e escuro (entrar, projetos, novo, projeto): sem erro de console, sem rolagem horizontal, sem texto < 11 px, alvos de toque ≥ 44 px no celular; e o `olhar.cjs` da casa em `/entrar`. Prints em `.verificacao/aceite/`.

O arquivo de 300 MB é sintético e esparso (64 KB aleatórios a cada MB): quase não ocupa disco na origem; o destino ocupa 300 MB e é apagado no fim.

## Como funciona

| peça | arquivo | o que faz |
|---|---|---|
| login | `lib/sessao.ts`, `app/api/entrar`, `app/api/sair` | senha única em scrypt (`scrypt:N:r:p:sal:hash`), cookie `ec_sessao` HttpOnly assinado com HMAC-SHA256, 30 dias, `Secure` quando chega por HTTPS; 8 tentativas por IP a cada 10 min; POST de outra origem recusado |
| envio retomável | `app/api/envio/[[...tus]]/route.ts`, `componentes/Envio.tsx` | servidor tus (`@tus/server` + `@tus/file-store`) grava em `armazenamento/.envio/`; no fim move (rename, mesmo disco) para `entrada/<projeto>/<nome>-<id>.<ext>` e chama `POST /v1/projetos/{id}/arquivos`. O navegador manda partes de `EDITOR_ENVIO_PARTE_MB` (64); a impressão digital inclui o projeto; envio interrompido aparece na tela com a porcentagem e continua quando o arquivo é escolhido de novo |
| proxy do motor | `app/api/motor/[...rota]/route.ts`, `lib/motor.ts` | só com sessão; lista fechada de rotas `v1/…`; repassa `Range` (player) e SSE (status ao vivo) em streaming; o `MOTOR_TOKEN` nunca vai ao navegador |
| telas | `app/entrar`, `app/projetos`, `app/projetos/novo`, `app/projetos/[id]`, `componentes/Projeto.tsx` | material, pedido, ilha ao vivo (relógio dos 30 minutos + trilha das etapas), versões com player, QA resumido e "reprovar com motivo" (vira regra da casa no motor) |
| celular | `public/manifest.webmanifest`, ícones | instala como app (PWA); campos com 16 px (sem zoom no iPhone), alvos de 44 px, área segura do notch |
| motor falso | `scripts/motor-falso.mjs` | mesma API da §4.6 em memória, com estados e eventos simulados e um vídeo de 5 s (ffmpeg) como versão |

Direção de arte: ficha no topo de `app/globals.css` (conceito "Ilha de edição", momento-assinatura "o relógio dos 30 minutos", grafite + âmbar + vermelho da Aba 71, Anton no display, JetBrains Mono nos dados, fontes OFL servidas do próprio site).

## Variáveis (nomes; valores só em `.env.local` ou no servidor)

`EDITOR_SENHA_HASH`, `EDITOR_SEGREDO_SESSAO` (32+ caracteres), `MOTOR_URL`, `MOTOR_TOKEN`, `EDITOR_DADOS`, `EDITOR_ENVIO_PARTE_MB`. Só para desenvolvimento: `MOTOR_FALSO_PORTA`, `MOTOR_FALSO_PASSO_MS`, `ACEITE_DIR`, `ACEITE_MB`, `ACEITE_PORTA_WEB`, `ACEITE_PORTA_MOTOR`.

## Fica para depois
- Produção no R2: trocar `@tus/file-store` por `@tus/s3-store` (multipart direto no bucket) quando `EDITOR_ARMAZENAMENTO=r2`.
- Envio em segundo plano no celular (service worker / app nativo) — hoje o envio para quando a aba é fechada e continua quando o arquivo é escolhido de novo.
- Gravar o pedido por áudio no celular (a API do motor já aceita `audio_chave`).
- Lista de versões com capa (`capa.jpg`) e botão "publicar" quando a frente C ligar a publicação.
