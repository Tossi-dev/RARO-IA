-- ============================================================
-- 0034 — análise interna de calls comerciais
--
-- `calls_resumos` pertence ao lançamento removido na Fase 1 e aponta para
-- `lancamento_id`. A análise de uma conversa de venda pertence à oportunidade,
-- portanto nasce em tabela própria. Transcrição e diagnóstico são internos:
-- mentorado nunca os lê.
-- ============================================================

create table if not exists public.analise_call (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  oportunidade_id uuid not null references public.oportunidade (id) on delete cascade,
  transcricao text not null,
  score integer check (score between 0 and 100),
  objecoes text[] not null default '{}',
  sugestoes text[] not null default '{}',
  modelo text not null,
  gerada_por text not null,
  gerada_em timestamptz not null default now()
);

create index if not exists idx_analise_call_workspace on public.analise_call (workspace_id, gerada_em desc);
create index if not exists idx_analise_call_oportunidade on public.analise_call (oportunidade_id, gerada_em desc);

alter table public.analise_call enable row level security;

create policy "leitura analise call interna" on public.analise_call
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

create policy "insercao analise call interna" on public.analise_call
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

-- A FK verifica a existência da oportunidade, mas não o seu workspace.
-- Esta guarda impede anexar uma análise a uma oportunidade de outro inquilino.
create or replace function public.validar_referencias_analise_call()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.oportunidade
    where id = new.oportunidade_id
      and workspace_id = new.workspace_id
  ) then
    raise exception 'oportunidade não pertence ao workspace informado';
  end if;

  return new;
end;
$$;

revoke all on function public.validar_referencias_analise_call() from public;

create trigger validar_referencias_analise_call
before insert or update of workspace_id, oportunidade_id on public.analise_call
for each row execute function public.validar_referencias_analise_call();
