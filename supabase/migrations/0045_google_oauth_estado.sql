-- 0045 — state OAuth Google de uso único, por usuário e workspace.
--
-- Esta migration só prepara o schema local. Não foi aplicada ao MentorOS.
-- O state é um nonce aleatório, não é token de acesso nem refresh token. Ele
-- existe apenas para validar a volta do OAuth uma vez antes de trocar o code.

create table if not exists public.google_oauth_estado (
  state text primary key,
  workspace_id uuid not null references public.workspace (id) on delete cascade,
  usuario_id uuid not null references public.profiles (id) on delete cascade,
  conexao text not null check (conexao = 'google_calendar'),
  expira_em timestamptz not null,
  consumido_em timestamptz,
  criado_em timestamptz not null default now(),
  check (length(state) = 64)
);

create index if not exists google_oauth_estado_expira_em_idx
  on public.google_oauth_estado (expira_em);

alter table public.google_oauth_estado enable row level security;

-- O estado é infraestrutura do servidor. Cliente algum pode enumerá-lo,
-- consumi-lo ou inspecionar vínculos de outra organização.
revoke all on table public.google_oauth_estado from public;
revoke all on table public.google_oauth_estado from anon;
revoke all on table public.google_oauth_estado from authenticated;
grant select, insert, update, delete on table public.google_oauth_estado to service_role;
