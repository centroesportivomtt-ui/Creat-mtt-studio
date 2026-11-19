-- Editor creat.MTT · esquema inicial do motor (Postgres/Supabase).
-- Equivalente ao ESQUEMA do SQLite em services/motor/motor/banco.py e idêntico a banco_pg.ESQUEMA_PG
-- (o teste services/motor/tests/test_banco_pg.py aplica este arquivo e compara colunas, índices e RLS).
-- Idempotente: pode rodar de novo sem estragar nada.
--
-- Segurança: o navegador NUNCA fala com este banco. Só o motor entra, pela DATABASE_URL (papel dono das tabelas,
-- que ignora RLS). Por isso RLS fica LIGADO e SEM nenhuma política: pela API pública do Supabase (anon/authenticated)
-- nenhuma linha é lida nem escrita.
CREATE TABLE IF NOT EXISTS projetos (
  id TEXT PRIMARY KEY, nome TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'recebendo',
  tipo_video TEXT, criado TEXT NOT NULL, atualizado TEXT NOT NULL, dados TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS arquivos (
  id TEXT NOT NULL, projeto TEXT NOT NULL, nome TEXT NOT NULL, chave TEXT NOT NULL, bytes BIGINT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'recebido', criado TEXT NOT NULL, PRIMARY KEY (projeto, id)
);
CREATE TABLE IF NOT EXISTS versoes (
  id TEXT NOT NULL, projeto TEXT NOT NULL, estado TEXT NOT NULL, video TEXT, qa TEXT, link TEXT,
  reprovacao TEXT, criado TEXT NOT NULL, PRIMARY KEY (projeto, id)
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, etapa TEXT NOT NULL, projeto TEXT NOT NULL, alvo TEXT,
  estado TEXT NOT NULL DEFAULT 'pendente', prioridade INTEGER NOT NULL DEFAULT 5,
  tentativas INTEGER NOT NULL DEFAULT 0, max_tentativas INTEGER NOT NULL DEFAULT 3,
  aluguel_ate DOUBLE PRECISION, dono TEXT, entrada TEXT NOT NULL DEFAULT '{}', saida TEXT, erro TEXT,
  criado DOUBLE PRECISION NOT NULL, atualizado DOUBLE PRECISION NOT NULL,
  UNIQUE (etapa, projeto, alvo)
);
CREATE INDEX IF NOT EXISTS jobs_fila ON jobs (estado, prioridade, criado);
CREATE INDEX IF NOT EXISTS jobs_proj ON jobs (projeto);
CREATE TABLE IF NOT EXISTS eventos (
  id BIGSERIAL PRIMARY KEY, projeto TEXT NOT NULL, ts TEXT NOT NULL, tipo TEXT NOT NULL,
  etapa TEXT, alvo TEXT, progresso DOUBLE PRECISION, estado TEXT, mensagem TEXT, dados TEXT
);
CREATE INDEX IF NOT EXISTS eventos_proj ON eventos (projeto, id);
ALTER TABLE projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE arquivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE versoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos ENABLE ROW LEVEL SECURITY;
-- Reforço: tira qualquer permissão dos papéis da API pública do Supabase (no Postgres comum esses papéis não existem).
DO $$
DECLARE papel text;
BEGIN
  FOREACH papel IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = papel) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.projetos, public.arquivos, public.versoes, public.jobs, public.eventos FROM %I', papel);
      EXECUTE format('REVOKE ALL ON SEQUENCE public.eventos_id_seq FROM %I', papel);
    END IF;
  END LOOP;
END $$;
