-- Sede ao vivo: banco em tempo real (Supabase).
-- Rode este arquivo inteiro uma vez em: Supabase → SQL Editor → New query → Run.
-- Depois cadastre o seu e-mail em `donos` (último bloco). Só e-mails dessa tabela leem os dados.

-- 1) Eventos que os ganchos do Claude Code enviam (um por início/fim de agente e por ferramenta usada)
create table if not exists public.eventos (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  sessao      text not null,              -- session_id do Claude Code
  sessao_nome text,                       -- título da sessão, quando o gancho recebe
  pasta       text,                       -- nome da pasta do projeto (só o nome, sem caminho)
  agente      text,                       -- agent_id do subagente; vazio = conversa principal
  tipo        text,                       -- agent_type (ex.: frontend, revisor, Explore)
  evento      text not null,              -- SessionStart, PreToolUse, SubagentStart, SubagentStop, Stop, SessionEnd...
  ferramenta  text,                       -- Bash, Edit, Read, mcp__...
  resumo      text                        -- descrição curta e higienizada da ação
);
create index if not exists eventos_ts_idx on public.eventos (ts desc);
create index if not exists eventos_sessao_idx on public.eventos (sessao, ts desc);

-- 2) Quem pode ler (preencha com o seu e-mail; ninguém mais vê nada)
create table if not exists public.donos (email text primary key);

-- 3) Segurança: só leitura para donos logados; ninguém escreve pelo navegador.
--    Os ganchos escrevem com a chave secreta (sb_secret_...), que ignora estas regras.
alter table public.eventos enable row level security;
alter table public.donos   enable row level security;

drop policy if exists "donos leem eventos" on public.eventos;
create policy "donos leem eventos" on public.eventos
  for select to authenticated
  using (exists (select 1 from public.donos d where d.email = (auth.jwt() ->> 'email')));

drop policy if exists "dono se ve" on public.donos;
create policy "dono se ve" on public.donos
  for select to authenticated
  using (email = (auth.jwt() ->> 'email'));

revoke insert, update, delete on public.eventos from anon, authenticated;
revoke insert, update, delete on public.donos   from anon, authenticated;

-- 4) Tempo real: a tela recebe cada evento novo na hora
do $$ begin
  alter publication supabase_realtime add table public.eventos;
exception when duplicate_object then null; end $$;

-- 5) Limpeza: guarda 7 dias (o plano gratuito tem 500 MB)
create extension if not exists pg_cron;
select cron.schedule('sede-limpeza', '17 4 * * *', $$delete from public.eventos where ts < now() - interval '7 days'$$)
where not exists (select 1 from cron.job where jobname = 'sede-limpeza');

-- 6) Seu e-mail (troque pelo e-mail com que você vai entrar na tela)
-- insert into public.donos (email) values ('seu-email@exemplo.com');
