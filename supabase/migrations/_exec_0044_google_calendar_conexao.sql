-- 0044 — vínculo Google Calendar por workspace.
--
-- Esta migration só prepara o schema local. Não foi aplicada ao MentorOS.
-- O refresh token chega aqui já cifrado por AES-256-GCM no servidor; a chave
-- de cifra fica apenas no ambiente do servidor e não existe no Postgres.

create table if not exists public.google_calendar_conexao (
  workspace_id uuid primary key references public.workspace (id) on delete cascade,
  refresh_token_cifrado text not null,
  iv text not null,
  tag_autenticacao text not null,
  versao_chave smallint not null default 1 check (versao_chave between 1 and 32767),
  escopos text[] not null default '{}'::text[],
  conectado_por uuid references public.profiles (id) on delete set null,
  conectado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  revogado_em timestamptz,
  check (length(refresh_token_cifrado) > 0),
  check (length(iv) > 0),
  check (length(tag_autenticacao) > 0)
);

comment on table public.google_calendar_conexao is
  'Um vínculo OAuth Google Calendar por workspace. Contém somente refresh token cifrado; nenhum token puro é persistido.';

alter table public.google_calendar_conexao enable row level security;

-- Nenhum papel de cliente pode ler nem escrever o material criptográfico. A
-- rota do app valida a sessão/workspace antes de usar service_role no servidor.
revoke all on table public.google_calendar_conexao from public;
revoke all on table public.google_calendar_conexao from anon;
revoke all on table public.google_calendar_conexao from authenticated;
grant select, insert, update, delete on table public.google_calendar_conexao to service_role;
