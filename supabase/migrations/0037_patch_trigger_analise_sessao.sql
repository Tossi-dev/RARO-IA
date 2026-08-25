-- ============================================================
-- 0037 — patch do trigger compartilhado de análise e alerta
--
-- 0036 foi aplicada manualmente no MentorOS antes de separar os ramos do
-- trigger. Esta patch conserva a mesma validação e evita tocar new.sessao_id
-- quando o registro avaliado é alerta_risco.
-- ============================================================

create or replace function public.validar_referencias_ia_evolucao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'analise_sessao' then
    if not exists (
      select 1
      from public.sessao s
      left join public.matricula direta on direta.id = s.matricula_id
      left join public.matricula turma on turma.turma_id = s.turma_id
      where s.id = new.sessao_id
        and s.workspace_id = new.workspace_id
        and (
          (direta.mentorado_id = new.mentorado_id and direta.workspace_id = new.workspace_id)
          or (turma.mentorado_id = new.mentorado_id and turma.workspace_id = new.workspace_id)
        )
    ) then
      raise exception 'sessão não pertence ao mentorado e workspace informados';
    end if;
  end if;

  if not exists (
    select 1
    from public.mentorado
    where id = new.mentorado_id
      and workspace_id = new.workspace_id
  ) then
    raise exception 'mentorado não pertence ao workspace informado';
  end if;

  return new;
end;
$$;

revoke all on function public.validar_referencias_ia_evolucao() from public;
