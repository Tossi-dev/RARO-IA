-- ============================================================
-- 0004 — P1 Camada de Caixa (SPEC-P1 §6 e Anexo B.2)
-- Contas bancárias, extrato de movimentos (competência × caixa),
-- contas a receber, contas a pagar, chargebacks e os parâmetros
-- financeiros que ancoram break-even e runway.
-- Rode APÓS 0001_schema.sql, 0002_expansao.sql e 0003_fundacao.sql.
-- ============================================================

-- ---------- enums ----------
do $$ begin
  create type tipo_conta_bancaria as enum ('corrente', 'poupanca', 'gateway', 'caixa_fisico', 'investimento');
exception when duplicate_object then null; end $$;

do $$ begin
  create type direcao_caixa as enum ('entrada', 'saida');
exception when duplicate_object then null; end $$;

-- Plano de contas do fluxo direto: toda linha do extrato cai em uma categoria.
do $$ begin
  create type categoria_caixa as enum (
    'vendas', 'outras_receitas', 'trafego', 'comissoes', 'taxas_gateway',
    'impostos', 'folha_prolabore', 'saas_ferramentas', 'producao_conteudo',
    'reembolsos', 'outros'
  );
exception when duplicate_object then null; end $$;

-- 'previsto' = projeção; 'realizado' = extrato de verdade (só ele soma no saldo).
do $$ begin
  create type status_movimento as enum ('previsto', 'realizado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type origem_movimento as enum ('venda', 'matricula', 'despesa', 'comissao', 'reembolso', 'chargeback', 'manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_recebivel as enum ('a_vencer', 'recebido', 'atrasado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_pagavel as enum ('a_vencer', 'pago', 'atrasado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type motivo_chargeback as enum ('nao_reconhecido', 'produto_nao_entregue', 'fraude', 'duplicidade', 'insatisfacao', 'outros');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_chargeback as enum ('aberto', 'ganho', 'perdido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type regime_tributario as enum ('simples', 'presumido', 'real', 'mei');
exception when duplicate_object then null; end $$;

-- ---------- contas bancárias / carteiras ----------
create table if not exists public.contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo tipo_conta_bancaria not null default 'corrente',
  saldo_inicial numeric(12,2) not null default 0,
  data_saldo_inicial date not null default current_date,
  ativa boolean not null default true,
  braco braco_projeto,
  criado_em timestamptz not null default now()
);

create index if not exists idx_contas_bancarias_ativa on public.contas_bancarias (ativa);

-- ---------- movimentos de caixa (extrato / fluxo direto) ----------
create table if not exists public.movimentos_caixa (
  id uuid primary key default gen_random_uuid(),
  direcao direcao_caixa not null,
  categoria categoria_caixa not null default 'outros',
  conta_id uuid references public.contas_bancarias (id) on delete set null,
  descricao text not null default '',
  valor numeric(12,2) not null check (valor >= 0), -- sempre positivo; o sinal vem de `direcao`
  data_competencia date not null,
  data_caixa date not null,
  status status_movimento not null default 'realizado',
  braco braco_projeto,
  origem origem_movimento not null default 'manual',
  origem_id text,
  criado_em timestamptz not null default now()
);

comment on column public.movimentos_caixa.data_competencia is 'Dia do fato econômico — alimenta o DRE';
comment on column public.movimentos_caixa.data_caixa is 'Dia da liberação/pagamento efetivo — alimenta o fluxo de caixa';

create index if not exists idx_movimentos_caixa_data on public.movimentos_caixa (data_caixa);
create index if not exists idx_movimentos_caixa_competencia on public.movimentos_caixa (data_competencia);
create index if not exists idx_movimentos_caixa_categoria on public.movimentos_caixa (categoria);
create index if not exists idx_movimentos_caixa_status on public.movimentos_caixa (status);

-- ---------- contas a receber ----------
create table if not exists public.recebiveis (
  id uuid primary key default gen_random_uuid(),
  origem origem_movimento not null default 'matricula',
  origem_id text,
  descricao text not null default '',
  valor numeric(12,2) not null check (valor >= 0),
  vencimento date not null,
  data_recebimento date,
  status status_recebivel not null default 'a_vencer',
  gateway gateway_pgto not null default 'manual',
  dias_liberacao int not null default 0, -- D+X do gateway
  parcela int not null default 1,
  total_parcelas int not null default 1,
  braco braco_projeto,
  conta_id uuid references public.contas_bancarias (id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_recebiveis_vencimento on public.recebiveis (vencimento);
create index if not exists idx_recebiveis_status on public.recebiveis (status);
create index if not exists idx_recebiveis_origem on public.recebiveis (origem, origem_id);

-- ---------- contas a pagar ----------
create table if not exists public.pagaveis (
  id uuid primary key default gen_random_uuid(),
  categoria categoria_caixa not null default 'outros',
  fornecedor text not null default '',
  descricao text not null default '',
  valor numeric(12,2) not null check (valor >= 0),
  vencimento date not null,
  data_pagamento date,
  status status_pagavel not null default 'a_vencer',
  tipo tipo_despesa not null default 'variavel', -- fixa alimenta o ponto de equilíbrio
  braco braco_projeto,
  origem origem_movimento not null default 'manual',
  origem_id text,
  conta_id uuid references public.contas_bancarias (id) on delete set null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_pagaveis_vencimento on public.pagaveis (vencimento);
create index if not exists idx_pagaveis_status on public.pagaveis (status);

-- ---------- chargebacks (≠ reembolso: contestação imposta, com disputa) ----------
create table if not exists public.chargebacks (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references public.matriculas (id) on delete cascade,
  valor numeric(12,2) not null check (valor >= 0),
  data date not null,
  data_resolucao date,
  motivo motivo_chargeback not null default 'outros',
  status status_chargeback not null default 'aberto',
  gateway gateway_pgto not null default 'manual',
  detalhe text not null default '',
  braco braco_projeto,
  criado_em timestamptz not null default now()
);

create index if not exists idx_chargebacks_data on public.chargebacks (data desc);
create index if not exists idx_chargebacks_status on public.chargebacks (status);

-- ---------- parâmetros financeiros (linha única de configuração) ----------
create table if not exists public.parametros_financeiros (
  id uuid primary key default gen_random_uuid(),
  aliquota_imposto numeric(5,2) not null default 0 check (aliquota_imposto >= 0),
  regime_tributario regime_tributario not null default 'simples',
  saldo_inicial_caixa numeric(12,2) not null default 0,
  data_saldo_inicial date not null default current_date,
  custo_fixo_mensal numeric(12,2) not null default 0,
  reserva_minima_caixa numeric(12,2) not null default 0,
  atualizado_em timestamptz not null default now(),
  singleton boolean not null default true
);

-- garante uma única linha de parâmetros (upsert onConflict do app)
create unique index if not exists uq_parametros_financeiros_singleton
  on public.parametros_financeiros (singleton);

-- ---------- RLS (mesmo padrão de 0002/0003: leitura autenticada, escrita dono/gestor) ----------
do $$
declare t text;
begin
  foreach t in array array['contas_bancarias', 'movimentos_caixa', 'recebiveis', 'pagaveis', 'chargebacks', 'parametros_financeiros'] loop
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
