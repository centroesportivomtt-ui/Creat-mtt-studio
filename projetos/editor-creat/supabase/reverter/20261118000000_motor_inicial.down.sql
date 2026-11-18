-- Desfaz 20261118000000_motor_inicial.sql. APAGA TODOS OS DADOS DO MOTOR: só rode de propósito.
-- Fica fora de migrations/ para a CLI do Supabase nunca aplicar sozinha.
DROP TABLE IF EXISTS public.eventos;
DROP TABLE IF EXISTS public.jobs;
DROP TABLE IF EXISTS public.versoes;
DROP TABLE IF EXISTS public.arquivos;
DROP TABLE IF EXISTS public.projetos;
