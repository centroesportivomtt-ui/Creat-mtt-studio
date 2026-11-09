-- Sede ao vivo: banco em tempo real (Supabase).
-- Rode este arquivo inteiro uma vez em: Supabase → SQL Editor → New query → Run.
-- No fim ele mostra o TOKEN DOS GANCHOS (guarde; é ele que as sessões usam para enviar eventos).
-- Depois cadastre o seu e-mail em `donos` (bloco 7). Só e-mails dessa tabela leem os dados.

create extension if not exists pgcrypto;

-- 1) Eventos que os ganchos do Claude Code enviam (um por início/fim de agente e por ferramenta usada)
create table if not exists public.eventos (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  sessao      text not null check (length(sessao) <= 80),
  sessao_nome text check (length(sessao_nome) <= 120),
  pasta       text check (length(pasta) <= 80),
  agente      text check (length(agente) <= 80),
  tipo        text check (length(tipo) <= 80),
  evento      text not null check (evento in ('SessionStart','SessionEnd','UserPromptSubmit','PreToolUse','SubagentStart','SubagentStop','Stop')),
  ferramenta  text check (length(ferramenta) <= 80),
  resumo      text check (length(resumo) <= 200)
);
create index if not exists eventos_ts_idx on public.eventos (ts desc);
create index if not exists eventos_sessao_idx on public.eventos (sessao, ts desc);

-- 2) Quem pode ler, e o token que os ganchos usam para escrever (nunca exposto pela API)
create table if not exists public.donos (email text primary key);
create table if not exists public.config_privada (chave text primary key, valor text not null);

-- 3) Permissões mínimas
alter table public.eventos        enable row level security;
alter table public.donos          enable row level security;
alter table public.config_privada enable row level security;
alter table public.eventos        force row level security;
alter table public.donos          force row level security;
alter table public.config_privada force row level security;

revoke all on public.eventos, public.donos, public.config_privada from anon, authenticated;
grant select on public.eventos, public.donos to authenticated;
grant insert (ts, sessao, sessao_nome, pasta, agente, tipo, evento, ferramenta, resumo) on public.eventos to anon;

-- O token dos ganchos chega no cabeçalho x-sede-token; a comparação roda como dono da função.
create or replace function public.sede_token_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (current_setting('request.headers', true)::json ->> 'x-sede-token') =
    (select valor from public.config_privada where chave = 'token_ganchos'), false)
$$;
revoke all on function public.sede_token_ok() from public;
grant execute on function public.sede_token_ok() to anon;

drop policy if exists "ganchos inserem com token" on public.eventos;
create policy "ganchos inserem com token" on public.eventos
  for insert to anon with check (public.sede_token_ok());

drop policy if exists "donos leem eventos" on public.eventos;
create policy "donos leem eventos" on public.eventos
  for select to authenticated
  using (exists (select 1 from public.donos d where lower(d.email) = lower(auth.jwt() ->> 'email')));

drop policy if exists "dono se ve" on public.donos;
create policy "dono se ve" on public.donos
  for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));
-- config_privada: nenhuma policy = ninguém lê nem escreve pela API.

-- 4) Tempo real: a tela recebe cada evento novo na hora (respeita as regras acima)
do $$ begin
  alter publication supabase_realtime add table public.eventos;
exception when duplicate_object then null; end $$;

-- 5) Limpeza: guarda 7 dias (o plano gratuito tem 500 MB)
create extension if not exists pg_cron;
select cron.schedule('sede-limpeza', '17 4 * * *', $$delete from public.eventos where ts < now() - interval '7 days'$$)
where not exists (select 1 from cron.job where jobname = 'sede-limpeza');

-- 6) Token dos ganchos: gerado uma vez; o resultado desta consulta é o valor a configurar
insert into public.config_privada (chave, valor)
values ('token_ganchos', encode(gen_random_bytes(32), 'hex'))
on conflict (chave) do nothing;
select valor as token_dos_ganchos from public.config_privada where chave = 'token_ganchos';

-- 7) Seu e-mail (troque pelo e-mail com que você vai entrar na tela) e rode esta linha à parte:
-- insert into public.donos (email) values ('seu-email@exemplo.com');
