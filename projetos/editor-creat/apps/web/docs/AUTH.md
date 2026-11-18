# Login do site (EDITOR_AUTH)

Dois modos e uma sessão só: cookie `ec_sessao`, HttpOnly, SameSite=Lax, `Secure` atrás de HTTPS, assinado com
HMAC-SHA256 (`EDITOR_SEGREDO_SESSAO`), 30 dias. Cookie de um modo não vale no outro.

| modo | como entra | cookie |
|---|---|---|
| `senha` (padrão, sem a variável) | senha única da casa, em scrypt (`EDITOR_SENHA_HASH`, `pnpm senha`) | `v1.<expira>.<nonce>.<assinatura>` |
| `supabase` | e-mail + senha de uma conta do Supabase Auth **que está em `EDITOR_EMAILS_PERMITIDOS`** | `v2.<expira>.<nonce>.<e-mail>.<assinatura>` |

## Modo supabase, passo a passo

1. O formulário manda e-mail e senha para `POST /api/entrar` (servidor do site).
2. E-mail fora da lista: recusa ali mesmo, sem chamar o Supabase. Conta válida não basta: qualquer pessoa consegue se
   cadastrar num projeto Supabase.
3. O servidor chama `POST {SUPABASE_URL}/auth/v1/token?grant_type=password` com `apikey: SUPABASE_ANON_KEY`.
4. O `access_token` devolvido é conferido com `jose`: HS256 com `SUPABASE_JWT_SECRET` se existir; senão a chave pública
   do projeto em `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Emissor `{SUPABASE_URL}/auth/v1`, audiência
   `authenticated`. Projeto antigo (HS256) sem o segredo configurado: quem confirma é o próprio Supabase
   (`GET /auth/v1/user`).
5. O e-mail ASSINADO no token tem de ser o mesmo que foi digitado e estar na lista.
6. O site emite o cookie dele e encerra a sessão do Supabase (`/auth/v1/logout?scope=local`): não fica refresh
   token guardado em lugar nenhum. A chave anon e o token nunca chegam ao navegador.

A lista é conferida de novo a cada requisição: tirar um e-mail de `EDITOR_EMAILS_PERMITIDOS` derruba a sessão dele
no próximo clique (depois de reiniciar o site com a variável nova). Sem a lista, o login recusa tudo (503) e a tela avisa.

**Sair** revoga o nonce no servidor (o mesmo cookie para de valer, não só some do navegador). A lista de revogados
vive na memória do processo; para derrubar todas as sessões de vez, troque `EDITOR_SEGREDO_SESSAO`.

**Proteções mantidas:** 8 tentativas erradas por IP a cada 10 min, 40 no total, e (novo) 8 por e-mail, para quem gira
de IP; POST de outra origem recusado (403); senha errada, conta inexistente e conta fora da lista recebem a MESMA
mensagem ("E-mail ou senha incorretos."), então a tela não revela quem tem conta.

## Variáveis

| nome | onde o dono cola | obrigatória | o que é |
|---|---|---|---|
| `EDITOR_AUTH` | ambiente do site (Vercel) | não | `senha` (padrão) ou `supabase` |
| `SUPABASE_URL` | ambiente do site | no modo supabase | Supabase → Project Settings → API → Project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_ANON_KEY` | ambiente do site | no modo supabase | mesma tela, chave `anon`/publishable (só o servidor usa) |
| `SUPABASE_JWT_SECRET` | ambiente do site | opcional | Project Settings → API → JWT Secret (projeto com chave HS256). Sem ela, usa o JWKS |
| `EDITOR_EMAILS_PERMITIDOS` | ambiente do site | no modo supabase | e-mails liberados, separados por vírgula |
| `EDITOR_SEGREDO_SESSAO` | ambiente do site | sempre | 32+ caracteres aleatórios; assina o cookie |
| `EDITOR_SENHA_HASH` | ambiente do site | no modo senha | hash scrypt da senha da casa (`pnpm senha`) |

No Supabase: Authentication → Providers → Email ligado; crie a conta do dono em Authentication → Users → Add user
(e desligue "Allow new users to sign up", se quiser fechar o cadastro também lá).

## Teste

`pnpm aceite:auth` (precisa de build; `--sem-build` reaproveita o `.next`). Sobe `scripts/supabase-falso.mjs`, o motor
falso e o site, e confere os 4 cenários descritos no topo de `scripts/aceite-auth.mjs`. Nada sai da máquina.
