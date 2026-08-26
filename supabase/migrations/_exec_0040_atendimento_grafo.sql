-- 0040 — nós e relações da memória contínua do atendimento.
-- Migration local: não foi aplicada a nenhum projeto Supabase.

create table if not exists public.atendimento_grafo_no (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id),
  tipo text not null check (tipo in ('dimensao', 'meta', 'passo', 'sessao', 'reflexao', 'transcricao_referencia')),
  referencia_id uuid,
  rotulo text not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.atendimento_grafo_relacao (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id),
  origem_no_id uuid not null references public.atendimento_grafo_no (id),
  destino_no_id uuid not null references public.atendimento_grafo_no (id),
  tipo text not null check (tipo in ('relaciona', 'apoia', 'depende_de', 'decorre_de')),
  criada_em timestamptz not null default now(),
  constraint atendimento_grafo_sem_auto_relacao check (origem_no_id <> destino_no_id)
);

create index if not exists idx_atendimento_grafo_no_workspace_cliente on public.atendimento_grafo_no (workspace_id, mentorado_id, criado_em);
create index if not exists idx_atendimento_grafo_relacao_origem on public.atendimento_grafo_relacao (origem_no_id, destino_no_id);

create or replace function public.validar_referencias_atendimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.mentorado where id = new.mentorado_id and workspace_id = new.workspace_id) then
    raise exception 'mentorado não pertence ao workspace informado';
  end if;
  if tg_table_name = 'atendimento_passo' and not exists (
    select 1 from public.atendimento_meta
    where id = new.meta_id and mentorado_id = new.mentorado_id and workspace_id = new.workspace_id
  ) then
    raise exception 'meta não pertence ao mentorado e workspace informados';
  end if;
  if tg_table_name = 'atendimento_grafo_relacao' and (
    not exists (select 1 from public.atendimento_grafo_no where id = new.origem_no_id and mentorado_id = new.mentorado_id and workspace_id = new.workspace_id)
    or not exists (select 1 from public.atendimento_grafo_no where id = new.destino_no_id and mentorado_id = new.mentorado_id and workspace_id = new.workspace_id)
  ) then
    raise exception 'nó do grafo não pertence ao mentorado e workspace informados';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_referencias_atendimento() from public;
revoke all on function public.validar_referencias_atendimento() from anon;

create trigger validar_referencias_atendimento_grafo_no before insert or update of workspace_id, mentorado_id on public.atendimento_grafo_no for each row execute function public.validar_referencias_atendimento();
create trigger validar_referencias_atendimento_grafo_relacao before insert or update of workspace_id, mentorado_id, origem_no_id, destino_no_id on public.atendimento_grafo_relacao for each row execute function public.validar_referencias_atendimento();

alter table public.atendimento_grafo_no enable row level security;
alter table public.atendimento_grafo_relacao enable row level security;

create policy "leitura grafo atendimento interna" on public.atendimento_grafo_no for select to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "escrita grafo atendimento interna" on public.atendimento_grafo_no for insert to authenticated with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "atualizacao grafo atendimento interna" on public.atendimento_grafo_no for update to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor')) with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "leitura relacoes atendimento interna" on public.atendimento_grafo_relacao for select to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "escrita relacoes atendimento interna" on public.atendimento_grafo_relacao for insert to authenticated with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "atualizacao relacoes atendimento interna" on public.atendimento_grafo_relacao for update to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor')) with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));
