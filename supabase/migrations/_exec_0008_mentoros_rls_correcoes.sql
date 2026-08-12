alter table public.profiles alter column papel set default 'mentorado';
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Grava 'mentorado' EXPLICITAMENTE (não confia só no default da
  -- coluna): um DEFAULT pode ser alterado por engano numa migração
  -- futura sem que ninguém perceba que a função de trigger também
  -- precisava mudar. Escrever o valor aqui deixa a intenção óbvia no
  -- ponto onde o usuário é criado, redundância proposital.
  insert into public.profiles (id, nome, papel)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nome', ''), 'mentorado');
  return new;
end;
$$;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.programa;
drop policy if exists "leitura: dono, gestor e mentorado matriculado" on public.programa;
create policy "leitura: dono, gestor e mentorado matriculado" on public.programa
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor')
      or (
        public.papel_atual() = 'mentorado'
        and exists (
          select 1 from public.matricula mt
          where mt.programa_id = programa.id
            and mt.mentorado_id = public.mentorado_atual()
        )
      )
    )
  );
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.turma;
drop policy if exists "leitura: dono, gestor e mentorado matriculado" on public.turma;
create policy "leitura: dono, gestor e mentorado matriculado" on public.turma
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor')
      or (
        public.papel_atual() = 'mentorado'
        and exists (
          select 1 from public.matricula mt
          where mt.turma_id = turma.id
            and mt.mentorado_id = public.mentorado_atual()
        )
      )
    )
  );
alter view public.v_financeiro_mensal set (security_invoker = true);
create or replace view public.matricula_progresso
with (security_invoker = true) as
select
  mt.id as matricula_id,
  mt.workspace_id,
  mt.mentorado_id,
  me.nome as mentorado_nome,
  mt.programa_id,
  p.nome as programa_nome,
  mt.sessoes_previstas,
  count(s.id) as sessoes_realizadas,
  case
    when mt.sessoes_previstas is null or mt.sessoes_previstas = 0 then null
    else round(100.0 * count(s.id) / mt.sessoes_previstas, 1)
  end as percentual_concluido
from public.matricula mt
join public.mentorado me on me.id = mt.mentorado_id
join public.programa p on p.id = mt.programa_id
left join public.sessao s
  on s.status = 'realizada'
  and (
    s.matricula_id = mt.id
    or (mt.turma_id is not null and s.turma_id = mt.turma_id)
  )
group by mt.id, mt.workspace_id, mt.mentorado_id, me.nome, mt.programa_id, p.nome, mt.sessoes_previstas;
comment on view public.matricula_progresso is
  'security_invoker = true (0008): sem isso a view roda com os
   direitos de quem a criou e devolve a ficha/progresso de TODOS os
   mentorados para qualquer autenticado — RLS de matricula/mentorado/
   programa só é respeitado com o invoker ligado. O left join em sessao
   cobre matricula_id (atendimento individual) OU turma_id (aula em
   grupo via mt.turma_id), senão progresso de turma sempre aparece
   zerado. sessao_atual continua sendo count(*), não coluna — ver
   comentário original em 0006.';
do $$
declare t text;
begin
  foreach t in array array[
    'afiliados','matriculas','comissoes','reembolsos','despesas','orcamentos',
    'metas_financeiras','metas','webhook_eventos','snapshots_kpi_diario',
    'contas_bancarias','movimentos_caixa','recebiveis','pagaveis','chargebacks',
    'parametros_financeiros','programa','turma'
  ]
  loop
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
    'afiliados','matriculas','comissoes','reembolsos','despesas','orcamentos',
    'metas_financeiras','metas','webhook_eventos','snapshots_kpi_diario',
    'contas_bancarias','movimentos_caixa','recebiveis','pagaveis','chargebacks',
    'parametros_financeiros'
  ]
  loop
    execute format('drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.%I', t);
    execute format(
      'create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.%I for select to authenticated using (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual())', t);
  end loop;
end $$;
do $$
declare t text;
begin
  foreach t in array array[
    'alunos','produtos','planos','lancamentos','turmas','tarefas_alunos','calls_resumos',
    'crm_estagios','notas','atividades','tarefas','reunioes','transcricoes',
    'perfis_sociais','conteudos','conteudo_metricas','conteudo_retencao','conteudo_pilares','campanhas'
  ]
  loop
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
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.mentorado;
create policy "leitura: dono, gestor e o proprio mentorado" on public.mentorado
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor')
      or (public.papel_atual() = 'mentorado' and id = public.mentorado_atual())
    )
  );
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.matricula;
create policy "leitura: dono, gestor e o proprio mentorado" on public.matricula
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor')
      or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
    )
  );
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.tarefa_mentoria;
create policy "leitura: dono, gestor e o proprio mentorado" on public.tarefa_mentoria
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor')
      or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
    )
  );
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.marco;
create policy "leitura: dono, gestor e o proprio mentorado" on public.marco
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor')
      or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
    )
  );
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.score_evolucao;
create policy "leitura: dono, gestor e o proprio mentorado" on public.score_evolucao
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor')
      or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
    )
  );
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.conteudo_liberado;
create policy "leitura: dono, gestor e o proprio mentorado" on public.conteudo_liberado
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor')
      or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
    )
  );
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.sessao;
create policy "leitura: dono, gestor e o proprio mentorado" on public.sessao
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor')
      or (
        public.papel_atual() = 'mentorado'
        and (
          exists (
            select 1 from public.matricula mt
            where mt.id = sessao.matricula_id
              and mt.mentorado_id = public.mentorado_atual()
          )
          or exists (
            select 1 from public.matricula mt
            where mt.turma_id = sessao.turma_id
              and mt.mentorado_id = public.mentorado_atual()
          )
        )
      )
    )
  );
do $$
declare t text;
begin
  foreach t in array array[
    'mentorado','matricula','sessao','tarefa_mentoria','marco','score_evolucao','conteudo_liberado'
  ]
  loop
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
drop policy if exists "perfil: dono le tudo, usuario le o proprio" on public.profiles;
create policy "perfil: dono le tudo, usuario le o proprio" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (public.papel_atual() in ('dono', 'gestor') and workspace_id = public.workspace_atual())
  );
drop policy if exists "workspace: leitura autenticada" on public.workspace;
create policy "workspace: leitura autenticada" on public.workspace
  for select to authenticated
  using (id = public.workspace_atual());
drop policy if exists "workspace: escrita do dono" on public.workspace;
create policy "workspace: escrita do dono" on public.workspace
  for all to authenticated
  using (public.papel_atual() = 'dono' and id = public.workspace_atual())
  with check (public.papel_atual() = 'dono' and id = public.workspace_atual());
create unique index if not exists uq_mentorado_perfil_id
  on public.mentorado (perfil_id)
  where perfil_id is not null;