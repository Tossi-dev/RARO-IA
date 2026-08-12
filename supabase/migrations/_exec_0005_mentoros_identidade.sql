create table if not exists public.workspace (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  criado_em timestamptz not null default now()
);
comment on table public.workspace is
  'Um workspace = um mentor/negócio. Hoje existe um só (o do Jefson);
   a tabela já nasce pronta para o dia em que o MentorOS vender para
   outros mentores. Ver comentário no topo do arquivo 0005 para o
   porquê de fazer isso agora e não depois.';
insert into public.workspace (id, nome)
values ('00000000-0000-0000-0000-000000000001', 'Raro.ia — workspace padrão')
on conflict (id) do nothing;
alter table public.workspace enable row level security;
drop policy if exists "workspace: leitura autenticada" on public.workspace;
create policy "workspace: leitura autenticada"
  on public.workspace for select to authenticated
  using (true);
drop policy if exists "workspace: escrita do dono" on public.workspace;
create policy "workspace: escrita do dono"
  on public.workspace for all to authenticated
  using (public.papel_atual() = 'dono')
  with check (public.papel_atual() = 'dono');
alter type public.papel_usuario add value if not exists 'comercial';
alter type public.papel_usuario add value if not exists 'mentorado';
alter table public.profiles
  add column if not exists workspace_id uuid not null
    references public.workspace (id)
    default '00000000-0000-0000-0000-000000000001';
create or replace function public.workspace_atual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.profiles where id = auth.uid();
$$;
do $$
declare t text;
begin
  foreach t in array array[
    -- 0001
    'afiliados','alunos','produtos','planos','lancamentos','turmas',
    'matriculas','comissoes','reembolsos','despesas','tarefas_alunos','calls_resumos',
    -- 0002
    'crm_estagios','notas','atividades','tarefas','reunioes','transcricoes',
    'orcamentos','metas_financeiras','perfis_sociais','conteudos',
    'conteudo_metricas','conteudo_retencao','conteudo_pilares','campanhas',
    -- 0003
    'metas','webhook_eventos','snapshots_kpi_diario',
    -- 0004
    'contas_bancarias','movimentos_caixa','recebiveis','pagaveis','chargebacks','parametros_financeiros'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists workspace_id uuid not null references public.workspace (id) default %L',
      t, '00000000-0000-0000-0000-000000000001'
    );
  end loop;
end $$;