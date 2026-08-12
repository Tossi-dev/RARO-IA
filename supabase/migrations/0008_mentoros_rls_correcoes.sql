-- ============================================================
-- 0008 — Correções de uma auditoria de segurança que subiu um Postgres
-- de verdade, aplicou 0001→0007 e EXECUTOU os ataques (não leu o SQL
-- e imaginou o problema: rodou UPDATE, rodou SELECT como cada papel).
-- Achou quatro vazamentos críticos confirmados e dois altos. Rode
-- APÓS 0007_mentoros_rls.sql.
--
-- Por que uma migração nova (0008) em vez de reescrever 0007, dado que
-- o banco do cliente ainda está vazio e nenhuma das duas opções corrompe
-- dado de produção:
--
--   1) Impossibilidade técnica para um dos quatro críticos: o default
--      de profiles.papel só pode virar 'mentorado' DEPOIS que esse
--      valor existe no enum papel_usuario — e ele só passa a existir em
--      0005 (alter type ... add value). Não dá para "consertar" isso
--      dentro de 0001 (onde o enum e o default nascem); a correção tem
--      que morar numa migração posterior a 0005. Como ela tem que ficar
--      em outro arquivo de qualquer jeito, faz sentido ser o mesmo
--      arquivo que conserta o resto.
--
--   2) 0007 é, hoje, o texto que documenta e justifica prosa por prosa
--      POR QUE cada tabela caiu em cada grupo (financeiro/CRM/portal) —
--      inclusive o motivo de programa/turma terem ido para o grupo
--      financeiro ("dado comercialmente sensível... ficar conservador é
--      a escolha mais barata de reverter depois") e o motivo de
--      escrita não ter sido tocada ("decisão maior, fora de escopo").
--      Esta migração REVERTE a primeira decisão (programa/turma agora
--      abrem para o mentorado matriculado) e AMPLIA a segunda (escrita
--      passa a ser escopada por workspace_id). Reescrever 0007 por
--      dentro apagaria o rastro de "isso foi decidido, testado como
--      correto, e depois corrigido por uma razão específica" — que é
--      exatamente o tipo de história que quem herdar este banco vai
--      querer poder auditar. Uma migração nova com cabeçalho longo
--      (como este) é mais honesta sobre "isso foi um bug encontrado
--      depois", em vez de fingir que a versão final sempre foi óbvia.
--
--   3) 0007 já recebeu, nesta mesma rodada, um ajuste mecânico e
--      ortogonal (idempotência: drop-by-name da política nova antes do
--      create). Esse ajuste não muda nenhuma regra de acesso, só torna
--      o arquivo seguro para reexecutar — por isso foi feito direto em
--      0007, sem precisar de uma migração nova. A diferença para os
--      itens abaixo é que estes MUDAM quem vê o quê; aquele não mudava.
--
-- Ordem interna deste arquivo (importa para quem for ler, não para o
-- Postgres — RLS é reavaliado a cada query, não "trava" no momento da
-- criação da política):
--   A) Crítico 3 — default de papel e handle_new_user() (menor
--      privilégio: 'mentorado', não mais 'gestor').
--   B) Crítico 4 — reclassifica programa/turma para o grupo do portal
--      (mentorado com matrícula lê), ANTES do item C — se a ordem
--      fosse invertida, o portal nasceria quebrado: a view
--      matricula_progresso (corrigida em C para rodar com os direitos
--      de quem chama) faz join com programa, e se programa ainda
--      exigir dono/gestor, o mentorado veria zero linhas mesmo com
--      matricula/mentorado liberados para ele.
--   C) Crítico 1 + Crítico 2 — security_invoker = true nas duas views
--      (v_financeiro_mensal e matricula_progresso), e o join da
--      segunda passa a cobrir sessão de turma também (médio: hoje só
--      soma sessão vinculada por matricula_id, ignorando turma_id).
--   D) Alto 1 + Alto 2 — workspace_id = workspace_atual() em toda
--      política de select/insert/update/delete dos grupos 1, 2 e 3,
--      mais profiles e workspace.
--   E) Médio — índice único parcial em mentorado.perfil_id (sem ele,
--      duas fichas com o mesmo perfil_id fariam mentorado_atual()
--      devolver silenciosamente "a primeira que o Postgres achar").
-- ============================================================

-- ============================================================
-- A) Crítico 3 — default de papel_usuario e handle_new_user()
-- ============================================================
-- 'mentorado' é o papel de MENOR privilégio hoje (não lê nada de
-- financeiro, não lê ficha de outro mentorado). Um usuário novo tem
-- que nascer nele por padrão; quem vira dono/gestor é sempre um UPDATE
-- deliberado de alguém que já é dono/gestor (RLS de profiles não
-- permite auto-promoção — ver seção D).
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

-- ============================================================
-- B) Crítico 4 — programa e turma saem do grupo financeiro puro e
-- passam a permitir leitura do mentorado matriculado.
-- ============================================================
-- Preço e grade continuam fechados para 'comercial' (mesma decisão
-- conservadora do 0007 original) e para mentorado SEM matrícula ali —
-- só abre para quem efetivamente está matriculado no programa/turma,
-- via exists em public.matricula. É o mínimo que o portal precisa para
-- mostrar "Elite, sessão 8 de 12": o nome do programa (matricula_progresso
-- já expõe programa_nome, mas só se a linha de programa também for
-- legível sob RLS do próprio chamador — ver seção C).

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

-- ============================================================
-- C) Crítico 1 + Crítico 2 — security_invoker nas views, e o join de
-- matricula_progresso passa a cobrir sessão de turma.
-- ============================================================
-- Sem security_invoker, uma view em Postgres roda com os direitos de
-- quem a CRIOU (o dono do schema, tipicamente superuser/postgres no
-- Supabase) — RLS das tabelas de baixo nunca é avaliado para o
-- chamador real. `using (true)` derrubado em matriculas (0007) não
-- vale nada enquanto v_financeiro_mensal ficar assim: qualquer
-- autenticado lê faturamento e líquido de todo mundo. Comprovado no
-- ataque.
alter view public.v_financeiro_mensal set (security_invoker = true);

-- matricula_progresso: mesmo problema (crítico 2), mais o médio do
-- join incompleto. Reescrita via create or replace (mesmas colunas,
-- mesma ordem — não quebra nada que já leia essa view) para também
-- contar sessão vinculada por turma_id, não só por matricula_id: hoje
-- `left join sessao s on s.matricula_id = mt.id` ignora inteiramente
-- aula em grupo (sessao.turma_id preenchido, matricula_id nulo — ver
-- o CHECK sessao_vinculo_unico em 0006), então o progresso de quem
-- está numa turma sempre aparece como 0 de N mesmo com sessões
-- realizadas.
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

-- ============================================================
-- D) Alto 1 + Alto 2 — workspace_id em toda política de select/
-- insert/update/delete dos grupos 1, 2 e 3, mais profiles e workspace.
-- ============================================================
-- 0005 criou workspace_atual() e 0007 nunca chamou. Resultado: o dono
-- do inquilino B lia E ESCREVIA o caixa do inquilino A (comprovado com
-- UPDATE). A partir daqui, toda política usa "workspace_id = public.
-- workspace_atual()" em cima do que já existia — quem podia ler/
-- escrever continua podendo, só que agora só dentro do próprio
-- workspace.

-- ---------- grupo 1 (18 tabelas): escrita (insert/update/delete) ----------
-- Escrita continua só dono/gestor (0007 documentou isso como decisão
-- deliberada); a novidade é escopar por workspace. Programa e turma
-- entram nesta lista de escrita normalmente — só a LEITURA delas
-- mudou de grupo (seção B).
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

-- ---------- grupo 1 (16 tabelas puramente financeiras): leitura ----------
-- programa/turma ficam de fora deste loop porque a leitura delas já
-- tem política própria (seção B, com o exists em matricula).
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

-- ---------- grupo 2 (19 tabelas: CRM/pipeline) ----------
-- Leitura (dono/gestor/comercial) e escrita (dono/gestor, sem mudar
-- quem escreve) ganham o mesmo filtro de workspace.
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

-- ---------- grupo 3 (7 tabelas: portal do mentorado) — leitura ----------
-- Reescreve cada política explicitamente (mesmo estilo do 0007
-- original para este grupo — mais fácil de auditar tabela por tabela),
-- envolvendo a condição antiga com "workspace_id = workspace_atual() and (...)".

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

-- ---------- grupo 3 (7 tabelas): escrita ----------
-- Continua só dono/gestor (mentorado ainda não escreve nada no portal —
-- 0007 deixou isso fora de escopo deliberadamente e aqui só some o
-- filtro de workspace, sem mudar quem escreve).
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

-- ---------- profiles ----------
-- Antes: dono/gestor liam TODO profiles, de qualquer workspace (um
-- dono do inquilino B lia nome/papel de todo mundo do inquilino A).
-- Cada um sempre lê a própria linha (id = auth.uid()) independente de
-- workspace — precisa disso para o próprio app descobrir o papel/
-- workspace de quem loga.
drop policy if exists "perfil: dono le tudo, usuario le o proprio" on public.profiles;
create policy "perfil: dono le tudo, usuario le o proprio" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (public.papel_atual() in ('dono', 'gestor') and workspace_id = public.workspace_atual())
  );

-- ---------- workspace ----------
-- 0005 deixou "leitura autenticada para todos" de propósito, com o
-- argumento de que a tabela não carrega dado sensível (só nome/id).
-- Ainda assim, a auditoria pediu workspace_id (aqui, id, já que a
-- própria linha da tabela É o workspace) em toda política — mais barato
-- restringir agora do que explicar depois por que o dono do workspace B
-- conseguia enumerar nome/id de todo workspace cadastrado. Escrita
-- (insert de um workspace NOVO) continua fora do alcance de um usuário
-- comum de qualquer forma: quem provisiona tenant novo é o service_role
-- (bypassa RLS), não um 'dono' logado — então id = workspace_atual() no
-- with check não tira nenhuma capacidade que já existia de fato.
drop policy if exists "workspace: leitura autenticada" on public.workspace;
create policy "workspace: leitura autenticada" on public.workspace
  for select to authenticated
  using (id = public.workspace_atual());

drop policy if exists "workspace: escrita do dono" on public.workspace;
create policy "workspace: escrita do dono" on public.workspace
  for all to authenticated
  using (public.papel_atual() = 'dono' and id = public.workspace_atual())
  with check (public.papel_atual() = 'dono' and id = public.workspace_atual());

-- ============================================================
-- E) Médio — mentorado.perfil_id precisa ser único (parcial, ignorando
-- nulos: a maioria dos mentorados nunca loga, perfil_id fica null).
-- ============================================================
-- Sem isso, duas linhas de mentorado apontando para o mesmo perfil_id
-- fariam mentorado_atual() (select ... where perfil_id = auth.uid(),
-- sem limit) devolver silenciosamente qualquer uma das duas conforme o
-- plano de execução escolher — inclusive a ficha ERRADA, sem erro
-- nenhum. Índice único é o jeito de transformar isso em erro no INSERT,
-- em vez de bug silencioso de RLS depois.
create unique index if not exists uq_mentorado_perfil_id
  on public.mentorado (perfil_id)
  where perfil_id is not null;
