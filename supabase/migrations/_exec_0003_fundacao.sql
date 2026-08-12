do $$ begin
  create type gateway_pgto as enum ('hotmart', 'kiwify', 'eduzz', 'stripe', 'manual');
exception when duplicate_object then null; end $$;
do $$ begin
  create type indicador_meta as enum ('faturamento', 'lucro', 'vendas', 'ticket', 'roas', 'cac');
exception when duplicate_object then null; end $$;
do $$ begin
  create type escopo_meta as enum ('global', 'braco', 'afiliado', 'produto');
exception when duplicate_object then null; end $$;
do $$ begin
  create type webhook_tipo as enum ('venda', 'reembolso', 'chargeback', 'assinatura');
exception when duplicate_object then null; end $$;
do $$ begin
  create type webhook_status as enum ('processado', 'pendente', 'erro');
exception when duplicate_object then null; end $$;
alter table public.matriculas
  add column if not exists braco braco_projeto,
  add column if not exists gateway gateway_pgto not null default 'manual',
  add column if not exists valor_bruto numeric(12,2),
  add column if not exists taxa_gateway numeric(12,2),
  add column if not exists data_liberacao date,
  add column if not exists utm_source text,
  add column if not exists utm_campaign text;
comment on column public.matriculas.braco is 'Lente estrutural corpo/mente/espírito; fallback = braço do afiliado';
comment on column public.matriculas.data_liberacao is 'D+X do gateway — quando o valor vira caixa de verdade';
create index if not exists idx_matriculas_braco on public.matriculas (braco);
create index if not exists idx_matriculas_liberacao on public.matriculas (data_liberacao);
alter table public.afiliados
  add column if not exists meta_mensal numeric(12,2),
  add column if not exists whatsapp text,
  add column if not exists chave_pix text;
alter table public.despesas
  add column if not exists braco braco_projeto,
  add column if not exists lancamento_id uuid references public.lancamentos (id) on delete set null;
create table if not exists public.metas (
  id uuid primary key default gen_random_uuid(),
  indicador indicador_meta not null,
  escopo escopo_meta not null default 'global',
  escopo_ref text,
  periodo text not null check (periodo ~ '^\d{4}-\d{2}$'),
  valor numeric(12,2) not null check (valor >= 0),
  criado_em timestamptz not null default now()
);
create unique index if not exists uq_metas_chave
  on public.metas (indicador, escopo, coalesce(escopo_ref, ''), periodo);
create table if not exists public.webhook_eventos (
  id uuid primary key default gen_random_uuid(),
  tipo webhook_tipo not null,
  gateway gateway_pgto not null,
  valor numeric(12,2) not null default 0,
  taxa numeric(12,2) not null default 0,
  status webhook_status not null default 'pendente',
  transacao_ref text not null default '',
  detalhe text not null default '',
  payload jsonb,
  recebido_em timestamptz not null default now()
);
create index if not exists idx_webhook_eventos_recebido on public.webhook_eventos (recebido_em desc);
create index if not exists idx_webhook_eventos_status on public.webhook_eventos (status);
create table if not exists public.snapshots_kpi_diario (
  data date primary key,
  faturamento numeric(12,2) not null default 0,
  vendas int not null default 0,
  liquido numeric(12,2) not null default 0,
  criado_em timestamptz not null default now()
);
do $$
declare t text;
begin
  foreach t in array array['metas', 'webhook_eventos', 'snapshots_kpi_diario'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "leitura autenticada" on public.%I for select to authenticated using (true)', t);
    execute format(
      'create policy "escrita da gestao" on public.%I for insert to authenticated with check (public.papel_atual() in (''dono'',''gestor''))', t);
    execute format(
      'create policy "update da gestao" on public.%I for update to authenticated using (public.papel_atual() in (''dono'',''gestor'')) with check (public.papel_atual() in (''dono'',''gestor''))', t);
    execute format(
      'create policy "delete da gestao" on public.%I for delete to authenticated using (public.papel_atual() in (''dono'',''gestor''))', t);
  end loop;
exception when duplicate_object then null;
end $$;