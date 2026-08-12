-- ============================================================
-- 0005 — MentorOS: identidade de workspace (multi-tenant desde o dia 1)
-- Rode APÓS 0001_schema.sql, 0002_expansao.sql, 0003_fundacao.sql e
-- 0004_p1_caixa.sql.
--
-- Por que agora, com 4-5 mentorados, e não quando aparecer o segundo
-- mentor pagante: hoje o banco está praticamente vazio. Acrescentar
-- workspace_id em toda tabela de negócio é uma migração de algumas
-- dezenas de linhas, com o sistema no ar e ninguém percebendo. Fazer
-- a mesma coisa depois, com produção rodando e dados de vários
-- mentores já misturados na mesma tabela, deixa de ser migração e
-- vira cirurgia: é preciso decidir linha a linha de quem é cada
-- registro, sem view, sem coluna nula, sob risco de vazar dado de
-- um mentor para outro. O produto (MentorOS) nasce pensando em virar
-- SaaS para vários mentores; o schema tem que nascer sabendo disso.
-- ============================================================

-- Id fixo e conhecido do workspace único de hoje (o negócio do Jefson).
-- Usar um UUID literal (em vez de gen_random_uuid()) permite usá-lo
-- como DEFAULT de coluna em todas as tabelas já existentes: toda a
-- base single-tenant atual "migra de graça" para dentro dele, sem
-- precisar de um UPDATE tabela por tabela.
-- Se um dia isso virar SaaS multi-mentor, cada workspace novo ganha
-- seu próprio id (gen_random_uuid()) e o app passa a informar
-- workspace_id explicitamente em cada insert.
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

-- A tabela workspace não carrega dado sensível (só nome/id), então
-- leitura autenticada para todos os papéis é aceitável — o que importa
-- isolar é o CONTEÚDO de cada workspace (financeiro, portal do
-- mentorado etc.), não a existência/nome do workspace em si. Com um
-- único workspace hoje, na prática todo autenticado só vê essa uma
-- linha mesmo.
drop policy if exists "workspace: leitura autenticada" on public.workspace;
create policy "workspace: leitura autenticada"
  on public.workspace for select to authenticated
  using (true);

drop policy if exists "workspace: escrita do dono" on public.workspace;
create policy "workspace: escrita do dono"
  on public.workspace for all to authenticated
  using (public.papel_atual() = 'dono')
  with check (public.papel_atual() = 'dono');

-- ---------- papel_usuario: dois papéis novos ----------
-- Hoje só 'dono' e 'gestor' entram no sistema. O MentorOS abre a porta
-- para dois papéis novos, sem remover os dois já existentes (nada usa
-- 'afiliado'/'aluno' hoje, mas removê-los quebraria dados já gravados
-- em profiles.papel — enum não perde valor de graça):
--   'comercial'  — vende/qualifica lead, não deve ver o financeiro
--                  nem o portal do mentorado (sessões, notas, score).
--   'mentorado'  — vai logar no portal quando ele for liberado; só
--                  pode ver a própria ficha, nunca a de outro
--                  mentorado nem qualquer dado financeiro.
-- ADD VALUE IF NOT EXISTS é idempotente e, a partir do Postgres 12,
-- pode rodar dentro da mesma transação da migração desde que o valor
-- novo não seja usado na mesma transação — e não é: só aparece a
-- partir de 0007.
alter type public.papel_usuario add value if not exists 'comercial';
alter type public.papel_usuario add value if not exists 'mentorado';

-- ---------- workspace_id em profiles (liga usuário → workspace) ----------
-- profiles precisa de workspace_id antes de qualquer outra tabela
-- porque workspace_atual() (abaixo) lê essa coluna para descobrir o
-- workspace do usuário logado.
alter table public.profiles
  add column if not exists workspace_id uuid not null
    references public.workspace (id)
    default '00000000-0000-0000-0000-000000000001';

-- ---------- workspace_atual(): mesmo espírito de papel_atual() ----------
-- Devolve o workspace do usuário autenticado. security definer porque
-- o usuário comum não tem (e não deve ter) select livre em profiles de
-- outras pessoas; a função "empresta" o privilégio só para essa leitura
-- pontual, igual papel_atual() já faz.
create or replace function public.workspace_atual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.profiles where id = auth.uid();
$$;

-- ---------- workspace_id em toda tabela de negócio já existente ----------
-- add column ... not null ... default <uuid fixo> é seguro mesmo em
-- tabela com linhas: o Postgres preenche o valor default para as
-- linhas existentes sem exigir um UPDATE separado (fast default,
-- desde o PG11). Todas as linhas atuais (single-tenant) caem no
-- workspace padrão acima.
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
