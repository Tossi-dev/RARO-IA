-- 0043 — corrige a função compartilhada pelos gatilhos de atendimento.
--
-- PostgreSQL não garante short-circuit para expressões SQL dentro de PL/pgSQL.
-- A versão anterior combinava `tg_table_name = ... and ... new.meta_id`; por
-- isso, um INSERT em atendimento_mapa podia tentar avaliar NEW.meta_id, campo
-- inexistente nessa tabela. Cada referência opcional fica em ramo próprio.

create or replace function public.validar_referencias_atendimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.mentorado
    where id = new.mentorado_id
      and workspace_id = new.workspace_id
  ) then
    raise exception 'mentorado não pertence ao workspace informado';
  end if;

  if tg_table_name = 'atendimento_passo' then
    if not exists (
      select 1
      from public.atendimento_meta
      where id = new.meta_id
        and mentorado_id = new.mentorado_id
        and workspace_id = new.workspace_id
    ) then
      raise exception 'meta não pertence ao mentorado e workspace informados';
    end if;
  end if;

  if tg_table_name = 'atendimento_grafo_relacao' then
    if not exists (
      select 1
      from public.atendimento_grafo_no
      where id = new.origem_no_id
        and mentorado_id = new.mentorado_id
        and workspace_id = new.workspace_id
    ) or not exists (
      select 1
      from public.atendimento_grafo_no
      where id = new.destino_no_id
        and mentorado_id = new.mentorado_id
        and workspace_id = new.workspace_id
    ) then
      raise exception 'nó do grafo não pertence ao mentorado e workspace informados';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validar_referencias_atendimento() from public;
revoke all on function public.validar_referencias_atendimento() from anon;
