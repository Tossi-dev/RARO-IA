-- ============================================================
-- 0029 — contrato: fatos financeiros fechados, leitura segura no portal
-- ============================================================
--
-- RLS decide linha, não coluna. Por isso o mentorado não lê `contrato`
-- diretamente: a função abaixo devolve somente a projeção permitida e nunca
-- `valor_total`. O arquivo assinado continua no `documento` (0015).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_contrato') then
    create type public.status_contrato as enum ('pendente', 'assinado', 'encerrado', 'cancelado');
  end if;
end
$$;

create table if not exists public.contrato (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id),
  matricula_id uuid references public.matricula (id) on delete set null,
  documento_id uuid references public.documento (id) on delete set null,
  assinado_em date,
  vigencia_inicio date,
  vigencia_fim date,
  valor_total numeric(14, 2) not null check (valor_total >= 0),
  status public.status_contrato not null default 'pendente',
  criado_em timestamptz not null default now(),
  constraint vigencia_valida check (vigencia_fim is null or vigencia_inicio is null or vigencia_fim >= vigencia_inicio),
  constraint assinado_tem_data check (status <> 'assinado' or assinado_em is not null)
);

create index if not exists idx_contrato_workspace on public.contrato (workspace_id);
create index if not exists idx_contrato_mentorado on public.contrato (mentorado_id);
create index if not exists idx_contrato_matricula on public.contrato (matricula_id);

alter table public.contrato enable row level security;

drop policy if exists "leitura: dono e gestor" on public.contrato;
create policy "leitura: dono e gestor" on public.contrato
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "escrita: dono e gestor" on public.contrato;
create policy "escrita: dono e gestor" on public.contrato
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "update: dono e gestor" on public.contrato;
create policy "update: dono e gestor" on public.contrato
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  )
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

create or replace function public.contrato_do_portal()
returns table (
  id uuid,
  mentorado_id uuid,
  matricula_id uuid,
  documento_id uuid,
  assinado_em date,
  vigencia_inicio date,
  vigencia_fim date,
  status public.status_contrato,
  criado_em timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    c.id,
    c.mentorado_id,
    c.matricula_id,
    c.documento_id,
    c.assinado_em,
    c.vigencia_inicio,
    c.vigencia_fim,
    c.status,
    c.criado_em
  from public.contrato c
  where c.workspace_id = public.workspace_atual()
    and public.papel_atual() = 'mentorado'
    and c.mentorado_id = public.mentorado_atual();
$$;

revoke all on function public.contrato_do_portal() from public;
revoke all on function public.contrato_do_portal() from anon;
grant execute on function public.contrato_do_portal() to authenticated;
