-- ============================================================
-- 0033 — análises internas de evolução e alertas de risco
--
-- Estas tabelas guardam avaliação sensível sobre mentorados. Elas não
-- fazem parte do portal e nunca são legíveis pelo mentorado.
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'tipo_alerta'
  ) then
    create type public.tipo_alerta as enum (
      'queda_score',
      'silencio',
      'faltas',
      'tarefas_atrasadas'
    );
  end if;
end $$;

create table if not exists public.analise_sessao (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  sessao_id uuid not null references public.sessao (id),
  mentorado_id uuid not null references public.mentorado (id),
  pontos_fortes text[] not null,
  riscos text[] not null,
  recomendacoes text[] not null,
  modelo text not null,
  gerada_por text not null,
  gerada_em timestamptz not null default now()
);

create table if not exists public.alerta_risco (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id),
  tipo public.tipo_alerta not null,
  severidade text not null check (severidade in ('baixa', 'media', 'alta')),
  detalhe text not null,
  resolvido boolean not null default false,
  resolvido_em timestamptz,
  criado_em timestamptz not null default now(),
  constraint alerta_risco_resolucao check (
    (resolvido = false and resolvido_em is null)
    or (resolvido = true and resolvido_em is not null)
  )
);

create index if not exists idx_analise_sessao_workspace on public.analise_sessao (workspace_id, gerada_em desc);
create index if not exists idx_alerta_risco_workspace on public.alerta_risco (workspace_id, mentorado_id, resolvido);

alter table public.analise_sessao enable row level security;

create policy "leitura analise sessao interna" on public.analise_sessao
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

create policy "insercao analise sessao interna" on public.analise_sessao
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

alter table public.alerta_risco enable row level security;

create policy "leitura alerta risco interno" on public.alerta_risco
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

create policy "insercao alerta risco interno" on public.alerta_risco
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

create policy "atualizacao alerta risco interna" on public.alerta_risco
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  )
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

-- FKs simples não carregam o workspace. Esta guarda impede que um ID de
-- outro workspace seja anexado a uma análise ou alerta interno.
create or replace function public.validar_referencias_ia_evolucao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'analise_sessao' and not exists (
    select 1
    from public.sessao
    where id = new.sessao_id
      and mentorado_id = new.mentorado_id
      and workspace_id = new.workspace_id
  ) then
    raise exception 'sessão não pertence ao mentorado e workspace informados';
  end if;

  if not exists (
    select 1
    from public.mentorado
    where id = new.mentorado_id
      and workspace_id = new.workspace_id
  ) then
    raise exception 'mentorado não pertence ao workspace informado';
  end if;

  return new;
end;
$$;

revoke all on function public.validar_referencias_ia_evolucao() from public;

create trigger validar_referencias_analise_sessao
before insert or update of workspace_id, sessao_id, mentorado_id on public.analise_sessao
for each row execute function public.validar_referencias_ia_evolucao();

create trigger validar_referencias_alerta_risco
before insert or update of workspace_id, mentorado_id on public.alerta_risco
for each row execute function public.validar_referencias_ia_evolucao();
