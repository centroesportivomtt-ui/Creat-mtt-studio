# Supabase do Editor creat.MTT

O Supabase entra em dois papéis, independentes:

1. **Banco do motor (Postgres).** Tabelas `projetos`, `arquivos`, `versoes`, `jobs`, `eventos`.
2. **Login do site** (Supabase Auth, e-mail + senha). Ver `apps/web/docs/AUTH.md`.

## Aplicar o esquema (uma vez)

1. Painel do Supabase → **SQL Editor** → **New query**.
2. Cole o conteúdo de `migrations/20261118000000_motor_inicial.sql` e clique em **Run**. Pode rodar de novo: é idempotente.
3. Confira em **Table Editor**: as 5 tabelas aparecem com o selo **RLS enabled** e nenhuma política. É de propósito:
   o navegador nunca fala com o banco; só o motor, pela `DATABASE_URL`.

Com a CLI (`supabase db push`) o mesmo arquivo serve: o nome segue o padrão `<data>_<nome>.sql`.
Se esquecer este passo, o motor cria as tabelas sozinho na primeira conexão (mesmo SQL).

## Ligar no motor

| variável | onde | o que é |
|---|---|---|
| `EDITOR_BANCO` | ambiente do motor (Modal) | `postgres` liga o Postgres; sem ela, SQLite local |
| `DATABASE_URL` | ambiente do motor (Modal, como secret) | Supabase → Project Settings → Database → Connection string → **Transaction pooler** (porta 6543) |

- Use o **pooler em modo transação** (6543): o motor não guarda prepared statement e abre conexões curtas.
- `sslmode` da URL é respeitado; host `*.supabase.co`/`*.supabase.com` sem `sslmode` ganha `sslmode=require`.
- Dependência do motor: `psycopg[binary]==3.2.13` (extra `postgres`).
- Vários workers ao mesmo tempo: a fila pega jobs com `FOR UPDATE SKIP LOCKED`, nunca o mesmo job em dois.

Para desfazer (apaga os dados do motor): `reverter/20261118000000_motor_inicial.down.sql`, no mesmo SQL Editor.
