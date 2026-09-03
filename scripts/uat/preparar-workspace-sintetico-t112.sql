begin;

-- Executar somente no SQL Editor do MentorOS main após autorização explícita.
-- O UUID é estável para tornar a operação idempotente e auditável.
do $$
declare
  v_workspace_id constant uuid := '00000000-0000-0000-0000-000000000112';
  v_workspace_nome constant text := '[AUDIT] T-112 — workspace sintetico';
  v_emails constant text[] := array[
    'rls-audit-gestor@audit.invalid',
    'rls-audit-comercial@audit.invalid',
    'rls-audit-mentorado@audit.invalid'
  ];
  v_usuarios integer;
  v_perfis integer;
  v_tabela record;
  v_tem_dados boolean;
begin
  select count(*)
    into v_usuarios
    from auth.users u
   where lower(u.email) = any (v_emails);

  if v_usuarios <> 3 then
    raise exception 'T-112 abortada: conjunto de usuarios sinteticos divergente';
  end if;

  select count(*)
    into v_perfis
    from public.profiles p
    join auth.users u on u.id = p.id
   where lower(u.email) = any (v_emails)
     and (
       (lower(u.email) = 'rls-audit-gestor@audit.invalid' and p.papel = 'gestor')
       or (lower(u.email) = 'rls-audit-comercial@audit.invalid' and p.papel = 'comercial')
       or (lower(u.email) = 'rls-audit-mentorado@audit.invalid' and p.papel = 'mentorado')
     );

  if v_perfis <> 3 then
    raise exception 'T-112 abortada: perfis ou papeis sinteticos divergentes';
  end if;

  if exists (
    select 1
      from public.workspace
     where id = v_workspace_id
       and nome <> v_workspace_nome
  ) then
    raise exception 'T-112 abortada: UUID pertence a workspace incompatível';
  end if;

  insert into public.workspace (id, nome)
  values (v_workspace_id, v_workspace_nome)
  on conflict (id) do nothing;

  for v_tabela in
    select distinct c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema
       and t.table_name = c.table_name
     where c.table_schema = 'public'
       and c.column_name = 'workspace_id'
       and t.table_type = 'BASE TABLE'
       and c.table_name not in ('workspace', 'profiles')
  loop
    execute format(
      'select exists (select 1 from public.%I where workspace_id = $1)',
      v_tabela.table_name
    ) into v_tem_dados using v_workspace_id;

    if v_tem_dados then
      raise exception 'T-112 abortada: workspace sintetico já contém dados em %', v_tabela.table_name;
    end if;
  end loop;

  if exists (
    select 1
      from storage.objects
     where (storage.foldername(name))[1] = v_workspace_id::text
  ) then
    raise exception 'T-112 abortada: workspace sintetico já contém objeto de Storage';
  end if;

  if exists (
    select 1
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.workspace_id = v_workspace_id
       and not (lower(u.email) = any (v_emails))
  ) then
    raise exception 'T-112 abortada: workspace sintetico contem perfil nao autorizado';
  end if;

  update public.profiles p
     set workspace_id = v_workspace_id
    from auth.users u
   where u.id = p.id
     and lower(u.email) = any (v_emails);

  get diagnostics v_perfis = row_count;
  if v_perfis <> 3 then
    raise exception 'T-112 abortada: atualizacao de perfis incompleta';
  end if;
end
$$;

commit;
