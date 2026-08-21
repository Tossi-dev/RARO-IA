-- _exec_0027 — a mesma migracao com os comentarios removidos, para colar
-- no SQL Editor. A versao completa e 0027_cobranca.sql.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_cobranca') then
    create type public.status_cobranca as enum ('prevista', 'aberta', 'paga', 'atrasada', 'cancelada');
  end if;
  if not exists (select 1 from pg_type where typname = 'forma_cobranca') then
    create type public.forma_cobranca as enum ('pix', 'transferencia', 'dinheiro', 'outro');
  end if;
end
$$;

create table if not exists public.cobranca (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id) on delete cascade,
  matricula_id uuid references public.matricula (id) on delete set null,
  competencia date not null default current_date,
  vencimento date not null default current_date,
  valor numeric(14, 2) not null default 0 check (valor >= 0),
  status public.status_cobranca not null default 'prevista',
  pago_em date,
  forma public.forma_cobranca,
  movimento_id uuid references public.movimentos_caixa (id) on delete set null,
  observacao text not null default '',
  criado_em timestamptz not null default now(),
  unique (matricula_id, competencia),
  constraint paga_tem_baixa check (status <> 'paga' or (pago_em is not null and forma is not null))
);

create unique index if not exists uq_cobranca_avulsa
  on public.cobranca (mentorado_id, competencia)
  where matricula_id is null;

create index if not exists idx_cobranca_workspace_status on public.cobranca (workspace_id, status);
create index if not exists idx_cobranca_vencimento on public.cobranca (vencimento);
create index if not exists idx_cobranca_mentorado on public.cobranca (mentorado_id);

alter table public.cobranca enable row level security;

drop policy if exists "leitura do financeiro" on public.cobranca;
create policy "leitura do financeiro" on public.cobranca
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "escrita do financeiro" on public.cobranca;
create policy "escrita do financeiro" on public.cobranca
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "update do financeiro" on public.cobranca;
create policy "update do financeiro" on public.cobranca
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );
