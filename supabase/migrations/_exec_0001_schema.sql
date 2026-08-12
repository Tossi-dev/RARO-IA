create type papel_usuario as enum ('dono', 'gestor', 'afiliado', 'aluno');
create type braco_projeto as enum ('corpo', 'mente', 'espirito');
create type status_funil as enum ('potencial', 'novo', 'recorrente', 'inativo');
create type tipo_produto as enum ('low_ticket', 'high_ticket', 'mentoria');
create type status_lancamento as enum ('planejado', 'ativo', 'encerrado');
create type forma_pgto as enum ('pix', 'dinheiro', 'debito', 'credito_vista', 'credito_2x6x', 'credito_7x12x');
create type tipo_despesa as enum ('fixa', 'variavel');
create type status_pagamento as enum ('pago', 'pendente', 'reembolsado');
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  papel papel_usuario not null default 'gestor',
  criado_em timestamptz not null default now()
);
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''));
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
create table public.afiliados (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  braco braco_projeto not null,
  pct_padrao numeric(5,2) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create table public.alunos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null default '',
  email text not null default '',
  status_funil status_funil not null default 'potencial',
  origem text not null default '',
  primeiro_contato date not null default current_date,
  observacoes text not null default '',
  criado_em timestamptz not null default now()
);
create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo tipo_produto not null,
  preco_base numeric(12,2) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create table public.planos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references public.produtos (id),
  nome text not null,
  recorrencia text not null default 'unica',
  valor numeric(12,2) not null default 0
);
create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  produto_id uuid not null references public.produtos (id),
  inicio date not null,
  fim date,
  status status_lancamento not null default 'planejado',
  meta_faturamento numeric(12,2) not null default 0,
  descricao text not null default '',
  criado_em timestamptz not null default now()
);
create table public.turmas (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.lancamentos (id) on delete cascade,
  nome text not null,
  vagas int not null default 0
);
create table public.matriculas (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.alunos (id),
  produto_id uuid not null references public.produtos (id),
  lancamento_id uuid references public.lancamentos (id),
  turma_id uuid references public.turmas (id),
  afiliado_id uuid references public.afiliados (id),
  valor numeric(12,2) not null,
  forma_pgto forma_pgto not null default 'pix',
  valor_liquido numeric(12,2) not null,
  data date not null default current_date,
  status_pagamento status_pagamento not null default 'pago',
  origem text not null default 'manual',
  gateway_id text not null default '',
  criado_em timestamptz not null default now()
);
create index matriculas_data_idx on public.matriculas (data);
create index matriculas_aluno_idx on public.matriculas (aluno_id);
create index matriculas_lancamento_idx on public.matriculas (lancamento_id);
create table public.comissoes (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references public.matriculas (id) on delete cascade,
  afiliado_id uuid not null references public.afiliados (id),
  pct numeric(5,2) not null,
  valor numeric(12,2) not null,
  data date not null default current_date
);
create table public.reembolsos (
  id uuid primary key default gen_random_uuid(),
  matricula_id uuid not null references public.matriculas (id),
  valor numeric(12,2) not null,
  data date not null default current_date,
  motivo text not null default ''
);
create table public.despesas (
  id uuid primary key default gen_random_uuid(),
  data date not null default current_date,
  descricao text not null,
  categoria text not null default 'Outros',
  tipo tipo_despesa not null default 'variavel',
  valor numeric(12,2) not null,
  criado_em timestamptz not null default now()
);
create index despesas_data_idx on public.despesas (data);
create table public.tarefas_alunos (
  id uuid primary key default gen_random_uuid(),
  turma_id uuid not null references public.turmas (id) on delete cascade,
  aluno_id uuid not null references public.alunos (id),
  titulo text not null,
  concluida boolean not null default false
);
create table public.calls_resumos (
  id uuid primary key default gen_random_uuid(),
  lancamento_id uuid not null references public.lancamentos (id) on delete cascade,
  data date not null default current_date,
  titulo text not null,
  resumo text not null default ''
);
create view public.v_financeiro_mensal as
select
  to_char(m.data, 'YYYY-MM') as periodo,
  sum(m.valor)                as faturamento,
  sum(m.valor_liquido)        as liquido,
  count(*)                    as vendas
from public.matriculas m
where m.status_pagamento <> 'pendente'
group by 1
order by 1;
create or replace function public.papel_atual()
returns papel_usuario
language sql
stable
security definer
set search_path = public
as $$
  select papel from public.profiles where id = auth.uid();
$$;
alter table public.profiles enable row level security;
create policy "perfil: dono le tudo, usuario le o proprio"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.papel_atual() in ('dono', 'gestor'));
do $$
declare t text;
begin
  foreach t in array array[
    'afiliados','alunos','produtos','planos','lancamentos','turmas',
    'matriculas','comissoes','reembolsos','despesas','tarefas_alunos','calls_resumos'
  ]
  loop
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
end $$;