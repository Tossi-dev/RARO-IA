-- ============================================================
-- 0012 — B3.2: o mentorado dá baixa na própria tarefa, no Portal.
-- Rode APÓS 0011_primeiro_usuario_e_dono.sql.
--
-- Duas lacunas, achadas ao escrever `src/lib/mentoria/acoes-portal.ts`
-- (`concluirTarefa`/`reabrirTarefa`) e nenhuma delas óbvia sem abrir este
-- arquivo primeiro — exatamente por isso o card pedia para conferir aqui
-- antes de escrever a Server Action:
--
--   1) `public.tarefa_mentoria` (0006) nunca ganhou uma coluna para "QUANDO
--      a tarefa foi concluída" — só `concluida boolean`. Sem ela, dar baixa
--      grava um booleano mudo: sabe-se que foi feita, não quando. Para
--      reabrir também fazer sentido (o card pede as duas ações), o "quando"
--      precisa poder voltar a `null`, não só nascer preenchido uma vez.
--
--   2) A política de ESCRITA de `tarefa_mentoria` (0006, loop genérico:
--      "update da gestao") só deixa dono/gestor darem UPDATE. O mentorado
--      lê a própria tarefa (grupo 3 do 0007/0008) mas não pode ESCREVER
--      nela — nem para marcar a própria tarefa como feita. Sem uma política
--      nova, `concluirTarefa`/`reabrirTarefa` chamado pelo mentorado
--      logado sempre devolveria zero linhas afetadas (RLS silenciosamente
--      não deixa a UPDATE enxergar a linha), nunca um erro claro.
--
-- A política nova é ADITIVA (políticas permissivas do Postgres se somam
-- com OR): "update da gestao" continua valendo para dono/gestor, sem
-- mudança nenhuma; esta soma um segundo caminho, só para a PRÓPRIA tarefa
-- do mentorado logado. RLS decide por LINHA (a tarefa é da pessoa, ou não
-- é) — decidir por COLUNA (só `concluida`/`concluida_em`, nunca `titulo`
-- ou `prazo`) fica por conta da Server Action nunca enviar essas outras
-- colunas no `update()`, não desta política: Postgres RLS não tem uma forma
-- nativa de restringir UPDATE a um subconjunto de colunas sem GRANT/REVOKE
-- por coluna (fora de escopo aqui — a mesma tarefa mais tarde pode reforçar
-- isso do lado do banco, se um cliente diferente do nosso app passar a
-- escrever nesta tabela).
-- ============================================================

alter table public.tarefa_mentoria
  add column if not exists concluida_em timestamptz;

comment on column public.tarefa_mentoria.concluida_em is
  'Quando a tarefa foi marcada como concluída (null enquanto aberta, ou
   depois de reaberta — ver reabrirTarefa em acoes-portal.ts). Não existia
   até 0012; concluida (boolean) sozinha não dizia QUANDO.';

drop policy if exists "mentorado conclui/reabre a propria tarefa" on public.tarefa_mentoria;
create policy "mentorado conclui/reabre a propria tarefa" on public.tarefa_mentoria
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() = 'mentorado'
    and mentorado_id = public.mentorado_atual()
  )
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() = 'mentorado'
    and mentorado_id = public.mentorado_atual()
  );
