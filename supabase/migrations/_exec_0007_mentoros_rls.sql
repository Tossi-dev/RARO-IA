create or replace function public.mentorado_atual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.mentorado where perfil_id = auth.uid();
$$;
drop policy if exists "leitura autenticada" on public.afiliados;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.afiliados;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.afiliados
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.matriculas;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.matriculas;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.matriculas
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.comissoes;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.comissoes;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.comissoes
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.reembolsos;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.reembolsos;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.reembolsos
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.despesas;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.despesas;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.despesas
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.orcamentos;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.orcamentos;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.orcamentos
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.metas_financeiras;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.metas_financeiras;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.metas_financeiras
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.metas;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.metas;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.metas
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.webhook_eventos;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.webhook_eventos;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.webhook_eventos
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.snapshots_kpi_diario;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.snapshots_kpi_diario;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.snapshots_kpi_diario
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.contas_bancarias;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.contas_bancarias;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.contas_bancarias
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.movimentos_caixa;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.movimentos_caixa;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.movimentos_caixa
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.recebiveis;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.recebiveis;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.recebiveis
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.pagaveis;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.pagaveis;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.pagaveis
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.chargebacks;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.chargebacks;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.chargebacks
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.parametros_financeiros;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.parametros_financeiros;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.parametros_financeiros
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.programa;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.programa;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.programa
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
drop policy if exists "leitura autenticada" on public.turma;
drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.turma;
create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.turma
  for select to authenticated using (public.papel_atual() in ('dono', 'gestor'));
do $$
declare t text;
begin
  foreach t in array array[
    'alunos','produtos','planos','lancamentos','turmas','tarefas_alunos','calls_resumos',
    'crm_estagios','notas','atividades','tarefas','reunioes','transcricoes',
    'perfis_sociais','conteudos','conteudo_metricas','conteudo_retencao','conteudo_pilares','campanhas'
  ]
  loop
    execute format('drop policy if exists "leitura autenticada" on public.%I', t);
    -- drop da política nova por nome também: sem isso, reexecutar este
    -- arquivo (idempotência) quebra na segunda vez com "policy already
    -- exists", porque só a política antiga era derrubada antes do create.
    execute format('drop policy if exists "leitura: dono, gestor e comercial (crm/pipeline)" on public.%I', t);
    execute format(
      'create policy "leitura: dono, gestor e comercial (crm/pipeline)" on public.%I for select to authenticated using (public.papel_atual() in (''dono'',''gestor'',''comercial''))',
      t
    );
  end loop;
end $$;
drop policy if exists "leitura autenticada" on public.mentorado;
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.mentorado;
create policy "leitura: dono, gestor e o proprio mentorado" on public.mentorado
  for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    or (public.papel_atual() = 'mentorado' and id = public.mentorado_atual())
  );
drop policy if exists "leitura autenticada" on public.matricula;
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.matricula;
create policy "leitura: dono, gestor e o proprio mentorado" on public.matricula
  for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
  );
drop policy if exists "leitura autenticada" on public.tarefa_mentoria;
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.tarefa_mentoria;
create policy "leitura: dono, gestor e o proprio mentorado" on public.tarefa_mentoria
  for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
  );
drop policy if exists "leitura autenticada" on public.marco;
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.marco;
create policy "leitura: dono, gestor e o proprio mentorado" on public.marco
  for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
  );
drop policy if exists "leitura autenticada" on public.score_evolucao;
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.score_evolucao;
create policy "leitura: dono, gestor e o proprio mentorado" on public.score_evolucao
  for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
  );
drop policy if exists "leitura autenticada" on public.conteudo_liberado;
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.conteudo_liberado;
create policy "leitura: dono, gestor e o proprio mentorado" on public.conteudo_liberado
  for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
  );
drop policy if exists "leitura autenticada" on public.sessao;
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.sessao;
create policy "leitura: dono, gestor e o proprio mentorado" on public.sessao
  for select to authenticated
  using (
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
  );