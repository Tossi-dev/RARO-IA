do $$ begin
  create type tipo_aula as enum ('video', 'texto', 'ao_vivo', 'tarefa');
exception when duplicate_object then null; end $$;
do $$ begin
  create type direcao_mensagem as enum ('recebida', 'enviada');
exception when duplicate_object then null; end $$;
do $$ begin
  create type status_envio as enum ('aprovado', 'enviado', 'falhou');
exception when duplicate_object then null; end $$;
do $$ begin
  create type origem_extrato as enum ('ofx', 'csv', 'texto');
exception when duplicate_object then null; end $$;
comment on type origem_extrato is
  'De qual formato o extrato bancário foi lido (src/lib/extrato/extrato.ts,
   OrigemExtrato). Não confundir com origem_movimento (0004) — aquele é
   "de que TIPO DE FATO NEGOCIAL veio o lançamento" (venda, despesa...);
   este é "de que FORMATO DE ARQUIVO veio a linha importada".';
create table if not exists public.agrupamentos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  nome text not null,
  cor text not null default '',
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists idx_agrupamentos_ordem on public.agrupamentos (ordem);
create table if not exists public.modulos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  produto_id uuid not null references public.produtos (id) on delete cascade,
  nome text not null default '',
  ordem int not null default 0,
  descricao text not null default '',
  criado_em timestamptz not null default now()
);
create index if not exists idx_modulos_produto_ordem on public.modulos (produto_id, ordem);
create table if not exists public.aulas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  modulo_id uuid not null references public.modulos (id) on delete cascade,
  produto_id uuid not null references public.produtos (id) on delete cascade,
  titulo text not null default '',
  ordem int not null default 0,
  duracao_min int not null default 0,
  tipo tipo_aula not null default 'video',
  criado_em timestamptz not null default now()
);
create index if not exists idx_aulas_modulo_ordem on public.aulas (modulo_id, ordem);
create table if not exists public.progresso_aulas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  aluno_id uuid not null references public.alunos (id) on delete cascade,
  aula_id uuid not null references public.aulas (id) on delete cascade,
  produto_id uuid not null references public.produtos (id) on delete cascade,
  concluida boolean not null default false,
  concluida_em timestamptz,
  minutos_assistidos int not null default 0,
  criado_em timestamptz not null default now(),
  unique (aluno_id, aula_id)
);
create index if not exists idx_progresso_aulas_aluno on public.progresso_aulas (aluno_id);
create index if not exists idx_progresso_aulas_aula on public.progresso_aulas (aula_id);
comment on table public.progresso_aulas is
  'Grupo RLS FECHADO (só dono/gestor) — ver cabeçalho do arquivo. Não é
   esquecimento: é progresso por public.alunos (CRM), e o portal do
   mentorado (public.mentorado, 0006/0007) não tem hoje um caminho
   confiável de aluno_id para "que mentorado é este aluno" que dê para
   usar num using() de RLS. Revisitar quando o Portal do Mentorado
   ganhar essa ponte.';
create table if not exists public.encontros (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  turma_id uuid not null references public.turmas (id) on delete cascade,
  titulo text not null default '',
  data timestamptz not null,
  presentes uuid[] not null default '{}',
  criado_em timestamptz not null default now()
);
create index if not exists idx_encontros_turma on public.encontros (turma_id);
create index if not exists idx_encontros_data on public.encontros (data);
create table if not exists public.importacoes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  impressao_digital text not null,
  data date not null,
  descricao text not null default '',
  valor numeric(12,2) not null default 0,
  tipo direcao_caixa not null,
  documento text not null default '',
  origem origem_extrato not null,
  conta_id uuid references public.contas_bancarias (id) on delete set null,
  movimento_id uuid references public.movimentos_caixa (id) on delete set null,
  importado_em timestamptz not null default now()
);
create unique index if not exists uq_importacoes_impressao_digital
  on public.importacoes (impressao_digital);
create index if not exists idx_importacoes_data on public.importacoes (data desc);
create table if not exists public.interacoes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  aluno_id uuid not null references public.alunos (id) on delete cascade,
  canal text not null default 'whatsapp',
  direcao direcao_mensagem not null,
  texto text not null default '',
  quando timestamptz not null,
  id_externo text not null,
  tipo_midia text not null default '',
  nome_exibicao text not null default '',
  telefone text not null default '',
  criado_em timestamptz not null default now()
);
create index if not exists idx_interacoes_aluno_quando on public.interacoes (aluno_id, quando desc);
create unique index if not exists uq_interacoes_id_externo
  on public.interacoes (id_externo)
  where id_externo <> '';
create table if not exists public.envios (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  aluno_id uuid not null references public.alunos (id) on delete cascade,
  telefone text not null default '',
  texto text not null default '',
  autorizado_por text not null default '',
  autorizado_em timestamptz not null default now(),
  status status_envio not null default 'aprovado',
  enviado_em timestamptz,
  id_externo text not null default '',
  erro text not null default '',
  criado_em timestamptz not null default now()
);
create index if not exists idx_envios_status on public.envios (status);
create index if not exists idx_envios_aluno on public.envios (aluno_id);
do $$
declare t text;
begin
  foreach t in array array['importacoes']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.%I', t);
    execute format(
      'create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.%I for select to authenticated using (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual())', t);

    execute format('drop policy if exists "escrita da gestao" on public.%I', t);
    execute format(
      'create policy "escrita da gestao" on public.%I for insert to authenticated with check (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual())', t);

    execute format('drop policy if exists "update da gestao" on public.%I', t);
    execute format(
      'create policy "update da gestao" on public.%I for update to authenticated using (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual()) with check (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual())', t);

    execute format('drop policy if exists "delete da gestao" on public.%I', t);
    execute format(
      'create policy "delete da gestao" on public.%I for delete to authenticated using (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual())', t);
  end loop;
end $$;
do $$
declare t text;
begin
  foreach t in array array[
    'interacoes','envios','modulos','aulas','encontros','agrupamentos'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "leitura: dono, gestor e comercial (crm/pipeline)" on public.%I', t);
    execute format(
      'create policy "leitura: dono, gestor e comercial (crm/pipeline)" on public.%I for select to authenticated using (public.papel_atual() in (''dono'',''gestor'',''comercial'') and workspace_id = public.workspace_atual())', t);

    execute format('drop policy if exists "escrita da gestao" on public.%I', t);
    execute format(
      'create policy "escrita da gestao" on public.%I for insert to authenticated with check (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual())', t);

    execute format('drop policy if exists "update da gestao" on public.%I', t);
    execute format(
      'create policy "update da gestao" on public.%I for update to authenticated using (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual()) with check (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual())', t);

    execute format('drop policy if exists "delete da gestao" on public.%I', t);
    execute format(
      'create policy "delete da gestao" on public.%I for delete to authenticated using (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual())', t);
  end loop;
end $$;
alter table public.progresso_aulas enable row level security;
drop policy if exists "leitura: apenas dono e gestor (sem portal ainda)" on public.progresso_aulas;
create policy "leitura: apenas dono e gestor (sem portal ainda)" on public.progresso_aulas
  for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    and workspace_id = public.workspace_atual()
  );
drop policy if exists "escrita da gestao" on public.progresso_aulas;
create policy "escrita da gestao" on public.progresso_aulas
  for insert to authenticated
  with check (
    public.papel_atual() in ('dono', 'gestor')
    and workspace_id = public.workspace_atual()
  );
drop policy if exists "update da gestao" on public.progresso_aulas;
create policy "update da gestao" on public.progresso_aulas
  for update to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    and workspace_id = public.workspace_atual()
  )
  with check (
    public.papel_atual() in ('dono', 'gestor')
    and workspace_id = public.workspace_atual()
  );
drop policy if exists "delete da gestao" on public.progresso_aulas;
create policy "delete da gestao" on public.progresso_aulas
  for delete to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    and workspace_id = public.workspace_atual()
  );
