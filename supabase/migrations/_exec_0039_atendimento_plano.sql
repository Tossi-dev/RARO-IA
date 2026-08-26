-- 0039 — metas, passos e reflexões do atendimento.
-- Migration local: não foi aplicada a nenhum projeto Supabase.

create table if not exists public.atendimento_meta (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id),
  titulo text not null,
  prazo date,
  status text not null default 'pendente' check (status in ('pendente', 'em_andamento', 'concluido', 'cancelado')),
  visibilidade text not null default 'privada_profissional' check (visibilidade in ('privada_profissional', 'compartilhavel')),
  criada_em timestamptz not null default now()
);

create table if not exists public.atendimento_passo (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id),
  meta_id uuid not null references public.atendimento_meta (id),
  descricao text not null,
  responsavel text not null,
  ordem integer not null check (ordem >= 0),
  status text not null default 'pendente' check (status in ('pendente', 'em_andamento', 'concluido', 'cancelado')),
  unique (meta_id, ordem)
);

create table if not exists public.atendimento_reflexao (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id),
  texto text not null,
  origem text not null check (origem in ('cliente', 'profissional')),
  visibilidade text not null default 'privada_profissional' check (visibilidade in ('privada_profissional', 'compartilhavel')),
  criada_em timestamptz not null default now()
);

create index if not exists idx_atendimento_meta_workspace_cliente on public.atendimento_meta (workspace_id, mentorado_id, prazo);
create index if not exists idx_atendimento_reflexao_workspace_cliente on public.atendimento_reflexao (workspace_id, mentorado_id, criada_em desc);

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
  return new;
end;
$$;

revoke all on function public.validar_referencias_atendimento() from public;
revoke all on function public.validar_referencias_atendimento() from anon;

create trigger validar_referencias_atendimento_meta before insert or update of workspace_id, mentorado_id on public.atendimento_meta for each row execute function public.validar_referencias_atendimento();
create trigger validar_referencias_atendimento_passo before insert or update of workspace_id, mentorado_id, meta_id on public.atendimento_passo for each row execute function public.validar_referencias_atendimento();
create trigger validar_referencias_atendimento_reflexao before insert or update of workspace_id, mentorado_id on public.atendimento_reflexao for each row execute function public.validar_referencias_atendimento();

alter table public.atendimento_meta enable row level security;
alter table public.atendimento_passo enable row level security;
alter table public.atendimento_reflexao enable row level security;

create policy "leitura metas atendimento interna" on public.atendimento_meta for select to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "escrita metas atendimento interna" on public.atendimento_meta for insert to authenticated with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "atualizacao metas atendimento interna" on public.atendimento_meta for update to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor')) with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "leitura passos atendimento interna" on public.atendimento_passo for select to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "escrita passos atendimento interna" on public.atendimento_passo for insert to authenticated with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "atualizacao passos atendimento interna" on public.atendimento_passo for update to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor')) with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "leitura reflexoes atendimento interna" on public.atendimento_reflexao for select to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "escrita reflexoes atendimento interna" on public.atendimento_reflexao for insert to authenticated with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "atualizacao reflexoes atendimento interna" on public.atendimento_reflexao for update to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor')) with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create or replace function public.atendimento_portal_minimo()
returns table (meta_id uuid, titulo text, prazo date, status text)
language sql
security definer
set search_path = public
as $$
  select m.id, m.titulo, m.prazo, m.status
  from public.atendimento_meta m
  where m.workspace_id = public.workspace_atual()
    and public.papel_atual() = 'mentorado'
    and m.mentorado_id = public.mentorado_atual()
    and m.visibilidade = 'compartilhavel'
    and exists (
      select 1 from public.atendimento_consentimento c
      where c.workspace_id = m.workspace_id and c.mentorado_id = m.mentorado_id
        and c.categoria = 'meta' and c.consentido = true
    )
    and exists (
      select 1 from public.atendimento_consentimento c
      where c.workspace_id = m.workspace_id and c.mentorado_id = m.mentorado_id
        and c.categoria = 'portal' and c.consentido = true
    );
$$;

revoke all on function public.atendimento_portal_minimo() from public;
revoke all on function public.atendimento_portal_minimo() from anon;
grant execute on function public.atendimento_portal_minimo() to authenticated;
