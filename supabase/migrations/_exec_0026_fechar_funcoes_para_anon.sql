-- _exec_0026 — a mesma migracao com os comentarios removidos, para colar
-- no SQL Editor. A versao completa e 0026_fechar_funcoes_para_anon.sql.

revoke execute on function public.mentorado_atual() from public;
revoke execute on function public.mentorado_atual() from anon;
grant execute on function public.mentorado_atual() to authenticated;

revoke execute on function public.papel_atual() from public;
revoke execute on function public.papel_atual() from anon;
grant execute on function public.papel_atual() to authenticated;

revoke execute on function public.workspace_atual() from public;
revoke execute on function public.workspace_atual() from anon;
grant execute on function public.workspace_atual() to authenticated;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end
$$;
