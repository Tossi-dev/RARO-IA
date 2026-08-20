-- _exec_0024 — a mesma migracao com os comentarios removidos, para colar
-- no SQL Editor. A versao completa e 0024_comercial_funil.sql.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_etapa_funil') then
    create type public.tipo_etapa_funil as enum ('sdr', 'closer');
  end if;
  if not exists (select 1 from pg_type where typname = 'status_oportunidade') then
    create type public.status_oportunidade as enum ('aberta', 'ganha', 'perdida');
  end if;
end
$$;

create table if not exists public.funil_etapa (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  chave text not null default '',
  nome text not null default '',
  ordem int not null default 0 check (ordem >= 0),
  tipo public.tipo_etapa_funil not null default 'sdr',
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (workspace_id, chave)
);

create table if not exists public.oportunidade (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  aluno_id uuid not null references public.alunos (id) on delete cascade,
  mentorado_id uuid references public.mentorado (id) on delete set null,
  etapa_id uuid not null references public.funil_etapa (id),
  responsavel_perfil_id uuid references public.profiles (id) on delete set null,
  valor numeric(14, 2) not null default 0,
  probabilidade int not null default 0 check (probabilidade between 0 and 100),
  origem text not null default '',
  status public.status_oportunidade not null default 'aberta',
  motivo_perda text not null default '',
  criado_em timestamptz not null default now(),
  fechado_em timestamptz,
  constraint perda_tem_motivo check (status <> 'perdida' or btrim(motivo_perda) <> '')
);

create index if not exists idx_funil_etapa_workspace on public.funil_etapa (workspace_id, ordem);
create index if not exists idx_oportunidade_aluno on public.oportunidade (aluno_id);
create index if not exists idx_oportunidade_etapa on public.oportunidade (etapa_id);
create index if not exists idx_oportunidade_status on public.oportunidade (workspace_id, status);

alter table public.funil_etapa enable row level security;
alter table public.oportunidade enable row level security;

drop policy if exists "leitura do time comercial" on public.funil_etapa;
create policy "leitura do time comercial" on public.funil_etapa
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

drop policy if exists "escrita do time comercial" on public.funil_etapa;
create policy "escrita do time comercial" on public.funil_etapa
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

drop policy if exists "update do time comercial" on public.funil_etapa;
create policy "update do time comercial" on public.funil_etapa
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

drop policy if exists "leitura do time comercial" on public.oportunidade;
create policy "leitura do time comercial" on public.oportunidade
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

drop policy if exists "escrita do time comercial" on public.oportunidade;
create policy "escrita do time comercial" on public.oportunidade
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

drop policy if exists "update do time comercial" on public.oportunidade;
create policy "update do time comercial" on public.oportunidade
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );
