-- ============================================================
-- 0007 — MentorOS: RLS por papel (a parte que realmente importa).
-- Rode APÓS 0006_mentoros_mentoria.sql.
--
-- Até aqui, TODA tabela de negócio tinha a política
-- "leitura autenticada" ... using (true) — qualquer pessoa logada lê
-- qualquer linha de qualquer tabela. Isso era uma escolha aceitável
-- quando só o dono (e o gestor, de confiança) entravam no sistema.
-- Deixa de ser aceitável no dia em que um MENTORADO ganha login: com
-- using (true) ele leria o financeiro inteiro (caixa, a pagar, a
-- receber, chargeback, comissão de afiliado) e a ficha/sessões/score
-- de TODOS os outros mentorados, não só a dele.
--
-- Esta migração reclassifica a leitura de cada tabela em três grupos:
--
--   1) FINANCEIRO/NEGÓCIO — só dono e gestor leem. Inclui o caixa
--      (contas_bancarias, movimentos_caixa, recebiveis, pagaveis,
--      chargebacks, parametros_financeiros), venda (matriculas,
--      comissoes, reembolsos), despesas, orçamento/metas, webhooks e
--      afiliados (que carregam chave_pix/whatsapp — finanças
--      pessoais, não só do negócio). Também entram aqui programa e
--      turma (carregam preço e grade — dado comercialmente sensível
--      que o enunciado não pediu para abrir a 'comercial'; ficar
--      conservador é a escolha mais barata de reverter depois).
--      'comercial' e 'mentorado' NÃO leem nada deste grupo.
--      Escrito com DROP + CREATE explícitos, tabela por tabela (em
--      vez do loop `foreach`/`format %I` usado no resto do arquivo),
--      de propósito: é a lista mais sensível do banco, e quem herdar
--      o sistema precisa poder grepar "on public.pagaveis" e achar a
--      política de cara, sem decifrar um array.
--
--   2) CRM/PIPELINE COMERCIAL — dono, gestor e agora 'comercial'
--      também leem (é literalmente o trabalho dele: leads e pipeline).
--      'mentorado' NÃO entra aqui — ele não deveria ver nem o funil de
--      vendas nem o conteúdo/campanhas de marketing de outros leads.
--      Tabelas: alunos, produtos, planos, lancamentos, turmas,
--      tarefas_alunos, calls_resumos, crm_estagios, notas, atividades,
--      tarefas, reunioes, transcricoes, perfis_sociais, conteudos,
--      conteudo_metricas, conteudo_retencao, conteudo_pilares,
--      campanhas. Menos sensível que o grupo 1, então mantido no
--      estilo em loop do 0001-0004 (menos repetição de arquivo).
--
--   3) PORTAL DO MENTORADO — dono e gestor leem tudo; 'mentorado' lê
--      SÓ as linhas que são dele (via mentorado_id, ou id na própria
--      ficha, ou via matrícula/turma no caso de sessao). 'comercial'
--      NÃO entra aqui — sessão, tarefa, marco e score de mentoria não
--      são pipeline de venda.
--      Tabelas: mentorado, matricula, sessao, tarefa_mentoria, marco,
--      score_evolucao, conteudo_liberado. Também escrito explícito,
--      tabela por tabela, pelo mesmo motivo do grupo 1 — mais fácil
--      de auditar "cadê o filtro de mentorado_id" tabela a tabela.
--
-- Todas as políticas antigas "leitura autenticada" (using (true)) das
-- tabelas acima são derrubadas (drop policy if exists) e substituídas.
-- As políticas de escrita (insert/update/delete, sempre dono/gestor)
-- NÃO mudam aqui — o pedido era sobre leitura vazando, e ampliar quem
-- escreve é uma decisão maior que fica para uma migração futura,
-- deliberadamente fora de escopo.
--
-- Idempotência (achado da auditoria, corrigido nesta revisão): antes,
-- cada bloco só derrubava a política ANTIGA ("leitura autenticada")
-- antes do create — a política NOVA nunca era derrubada por nome. Isso
-- fazia reexecutar este arquivo (ex.: reset de ambiente de teste, reply
-- de migração) falhar com "policy already exists" na segunda vez. Cada
-- bloco agora também derruba a política nova por nome antes de recriá-la.
--
-- Reclassificação de leitura de programa/turma (grupo 1 → também
-- liberado ao mentorado matriculado) e o escopo por workspace_id (todo
-- grupo 1/2/3, profiles e workspace) vivem em 0008, não aqui — ver o
-- cabeçalho de 0008_mentoros_rls_correcoes.sql para o porquê de virar
-- migração nova em vez de reescrever este arquivo.
-- ============================================================

-- ---------- mentorado_atual(): mesmo espírito de papel_atual() ----------
-- Devolve o id da ficha em public.mentorado ligada ao usuário logado
-- (via mentorado.perfil_id), ou null se quem está logado não é um
-- mentorado com portal liberado (ou não tem ficha nenhuma). security
-- definer pelo mesmo motivo de papel_atual()/workspace_atual(): o
-- usuário comum não pode ler a tabela mentorado livremente, mas a
-- função pode fazer essa checagem pontual em nome dele.
create or replace function public.mentorado_atual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.mentorado where perfil_id = auth.uid();
$$;

-- ============================================================
-- Grupo 1 — financeiro/negócio: só dono e gestor leem.
-- ============================================================

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

-- ============================================================
-- Grupo 2 — CRM/pipeline comercial: dono, gestor e comercial leem.
-- ============================================================
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

-- ============================================================
-- Grupo 3 — portal do mentorado: dono/gestor leem tudo; mentorado só
-- as próprias linhas.
-- ============================================================

-- mentorado (a própria ficha): compara id da linha com mentorado_atual().
drop policy if exists "leitura autenticada" on public.mentorado;
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.mentorado;
create policy "leitura: dono, gestor e o proprio mentorado" on public.mentorado
  for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    or (public.papel_atual() = 'mentorado' and id = public.mentorado_atual())
  );

-- matricula: mentorado_id direto.
drop policy if exists "leitura autenticada" on public.matricula;
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.matricula;
create policy "leitura: dono, gestor e o proprio mentorado" on public.matricula
  for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
  );

-- tarefa_mentoria: mentorado_id direto.
drop policy if exists "leitura autenticada" on public.tarefa_mentoria;
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.tarefa_mentoria;
create policy "leitura: dono, gestor e o proprio mentorado" on public.tarefa_mentoria
  for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
  );

-- marco: mentorado_id direto.
drop policy if exists "leitura autenticada" on public.marco;
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.marco;
create policy "leitura: dono, gestor e o proprio mentorado" on public.marco
  for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
  );

-- score_evolucao: mentorado_id direto. É aqui que mora o alerta de
-- churn ("caiu 18 pontos") — o mentorado vendo só a própria série é
-- o mínimo, mas ver a dos outros seria pior ainda (comparação social
-- indevida, ranking implícito entre mentorados pagantes).
drop policy if exists "leitura autenticada" on public.score_evolucao;
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.score_evolucao;
create policy "leitura: dono, gestor e o proprio mentorado" on public.score_evolucao
  for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
  );

-- conteudo_liberado: mentorado_id direto.
drop policy if exists "leitura autenticada" on public.conteudo_liberado;
drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.conteudo_liberado;
create policy "leitura: dono, gestor e o proprio mentorado" on public.conteudo_liberado
  for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
  );

-- sessao é o caso especial: não tem mentorado_id direto, porque uma
-- sessão pertence a UMA matrícula (individual) OU a UMA turma (grupo).
-- Para o mentorado enxergar a própria sessão de turma (aula em grupo),
-- a política precisa subir até a matrícula dele: "essa sessão é da
-- minha matrícula" (caso individual) OU "essa sessão é da turma onde
-- eu tenho uma matrícula" (caso turma). É exatamente por isso que o
-- modelo nasceu sabendo de turma desde o 0006 — sem isso, dar acesso
-- de portal a aula em grupo exigiria redesenhar sessao inteira depois.
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
