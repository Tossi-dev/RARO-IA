-- _exec_0019 — a mesma migracao sem os comentarios longos, para colar no
-- SQL Editor do Supabase. A versao comentada e 0019_trilha.sql.

create table if not exists public.trilha (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  nome text not null,
  descricao text not null default '',
  programa_id uuid references public.programa (id),
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create index if not exists idx_trilha_programa on public.trilha (programa_id);

create table if not exists public.trilha_aula (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  trilha_id uuid not null references public.trilha (id) on delete cascade,
  ordem int not null default 0,
  titulo text not null,
  tipo tipo_aula not null default 'video',
  url_video text not null default '',
  texto text not null default '',
  duracao_min int not null default 0,
  libera_em_dias int not null default 0 check (libera_em_dias >= 0),
  criado_em timestamptz not null default now()
);

create index if not exists idx_trilha_aula_trilha on public.trilha_aula (trilha_id, ordem);

comment on column public.trilha.programa_id is
  'Nulo = trilha nao amarrada a programa nenhum, e portanto invisivel para
   todo mentorado. Fail-closed: a trilha nasce interna e passa a ser vista
   quando alguem a amarra, que e um ato explicito.';

comment on column public.trilha_aula.libera_em_dias is
  'Dias apos o inicio da trilha para esta aula abrir. Zero abre junto. O
   check >= 0 impede valor negativo, que abriria a aula antes do inicio.';

alter table public.trilha enable row level security;
alter table public.trilha_aula enable row level security;

drop policy if exists "leitura: gestao e mentorado com matricula ativa" on public.trilha;
create policy "leitura: gestao e mentorado com matricula ativa" on public.trilha
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor', 'comercial')
      or (
        public.papel_atual() = 'mentorado'
        and programa_id is not null
        and exists (
          select 1
          from public.matricula m
          where m.mentorado_id = public.mentorado_atual()
            and m.programa_id = trilha.programa_id
            and m.status = 'ativa'
            and m.workspace_id = public.workspace_atual()
        )
      )
    )
  );

drop policy if exists "escrita da gestao" on public.trilha;
create policy "escrita da gestao" on public.trilha
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "update da gestao" on public.trilha;
create policy "update da gestao" on public.trilha
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "leitura: quem enxerga a trilha enxerga a aula" on public.trilha_aula;
create policy "leitura: quem enxerga a trilha enxerga a aula" on public.trilha_aula
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and exists (
      select 1 from public.trilha t where t.id = trilha_aula.trilha_id
    )
  );

drop policy if exists "escrita da gestao" on public.trilha_aula;
create policy "escrita da gestao" on public.trilha_aula
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "update da gestao" on public.trilha_aula;
create policy "update da gestao" on public.trilha_aula
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );
