-- ============================================================
-- 0030 — finanças pessoais do dono, isoladas por workspace
-- ============================================================

create table if not exists public.patrimonio (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  nome text not null,
  categoria text not null default '',
  valor numeric(14, 2) not null default 0 check (valor >= 0),
  adquirido_em date,
  observacao text not null default '',
  criado_em timestamptz not null default now()
);

create table if not exists public.investimento (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  nome text not null,
  tipo text not null default '',
  instituicao text not null default '',
  valor numeric(14, 2) not null default 0 check (valor >= 0),
  investido_em date,
  observacao text not null default '',
  criado_em timestamptz not null default now()
);

create table if not exists public.renda_pessoal (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  fonte text not null,
  tipo text not null default '',
  valor numeric(14, 2) not null default 0 check (valor >= 0),
  competencia date not null default current_date,
  recorrente boolean not null default false,
  observacao text not null default '',
  criado_em timestamptz not null default now()
);

create index if not exists idx_patrimonio_workspace on public.patrimonio (workspace_id);
create index if not exists idx_investimento_workspace on public.investimento (workspace_id);
create index if not exists idx_renda_pessoal_workspace on public.renda_pessoal (workspace_id);

alter table public.patrimonio enable row level security;
alter table public.investimento enable row level security;
alter table public.renda_pessoal enable row level security;

drop policy if exists "leitura patrimonio do dono" on public.patrimonio;
create policy "leitura patrimonio do dono" on public.patrimonio
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() = 'dono'
  );

drop policy if exists "insercao patrimonio do dono" on public.patrimonio;
create policy "insercao patrimonio do dono" on public.patrimonio
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() = 'dono'
  );

drop policy if exists "atualizacao patrimonio do dono" on public.patrimonio;
create policy "atualizacao patrimonio do dono" on public.patrimonio
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() = 'dono'
  )
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() = 'dono'
  );

drop policy if exists "leitura investimento do dono" on public.investimento;
create policy "leitura investimento do dono" on public.investimento
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() = 'dono'
  );

drop policy if exists "insercao investimento do dono" on public.investimento;
create policy "insercao investimento do dono" on public.investimento
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() = 'dono'
  );

drop policy if exists "atualizacao investimento do dono" on public.investimento;
create policy "atualizacao investimento do dono" on public.investimento
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() = 'dono'
  )
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() = 'dono'
  );

drop policy if exists "leitura renda pessoal do dono" on public.renda_pessoal;
create policy "leitura renda pessoal do dono" on public.renda_pessoal
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() = 'dono'
  );

drop policy if exists "insercao renda pessoal do dono" on public.renda_pessoal;
create policy "insercao renda pessoal do dono" on public.renda_pessoal
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() = 'dono'
  );

drop policy if exists "atualizacao renda pessoal do dono" on public.renda_pessoal;
create policy "atualizacao renda pessoal do dono" on public.renda_pessoal
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() = 'dono'
  )
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() = 'dono'
  );
