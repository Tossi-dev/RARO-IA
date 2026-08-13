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
