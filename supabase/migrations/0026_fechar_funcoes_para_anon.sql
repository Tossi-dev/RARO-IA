-- ============================================================
-- 0026 — fecha para `anon` as quatro funções que ficaram de 0001
-- ============================================================
--
-- Esta migração não cria nada. Ela conserta uma distância entre o que o
-- projeto DIZ e o que o banco TEM, encontrada em 20/08 ao conferir, no
-- Postgres de verdade e não no arquivo, quem podia executar o quê depois de
-- 0025.
--
-- O ACHADO
-- --------
-- Quatro funções do schema `public` ainda carregavam o `execute` que o
-- Postgres concede a `PUBLIC` por padrão em toda função nova:
--
--     handle_new_user()   mentorado_atual()   papel_atual()   workspace_atual()
--
-- Todas nasceram em 0001, antes de o projeto escrever a convenção que segue
-- desde 0022 — função nova revoga de `anon` com todas as letras. Como `anon`
-- herda de `PUBLIC`, as quatro estavam ao alcance de qualquer um com a chave
-- pública.
--
-- O TAMANHO HONESTO DO PROBLEMA
-- -----------------------------
-- Nenhuma delas vazava dado, e vale dizer isso com clareza para não inflar o
-- conserto:
--
--   - as três auxiliares leem `auth.uid()`. Sem sessão, `auth.uid()` é nulo,
--     e elas devolvem nulo. Chamá-las sem login responde "não sei quem é
--     você", que é exatamente o que deveria responder;
--   - `handle_new_user` devolve `trigger`, e o Postgres RECUSA chamar função
--     de gatilho direto, com grant ou sem grant;
--   - nenhuma política de RLS deste banco alcança `anon`: as 261 são
--     `to authenticated`. Sem política, `anon` não lê linha nenhuma, e as
--     funções nem chegam a ser avaliadas por ele;
--   - nenhuma das três views `security_invoker` chama as auxiliares — foi
--     conferido antes de escrever isto.
--
-- Então o que se conserta aqui não é um vazamento: é a REGRA. Uma convenção
-- que vale para as funções novas e não vale para as antigas é uma convenção
-- em que a próxima auditoria vai confiar errado.
--
-- ============================================================
-- ⚠ O CONSERTO QUE DERRUBARIA O APP
-- ============================================================
--
-- Revogar de `authenticated` junto com `anon` seria o erro fácil aqui, e ele
-- não apareceria em teste nenhum de código: as três auxiliares são chamadas
-- DENTRO das 261 políticas de RLS, e política roda com o papel de quem
-- pergunta. Sem o grant, todo usuário logado passaria a receber
-- "permission denied for function" no lugar dos próprios dados.
--
-- Por isso as três continuam concedidas a `authenticated`, com todas as
-- letras, e há teste que falha se o grant sumir.
--
-- `handle_new_user` é o caso oposto: ninguém a chama, nem logado nem
-- deslogado. Quem a executa é o gatilho `on_auth_user_created`, e o Postgres
-- confere a permissão de função de gatilho na hora em que o GATILHO é criado,
-- não a cada disparo. Ela é revogada de todo mundo — e, por cinto e
-- suspensório, concedida nominalmente a `supabase_auth_admin`, o papel que
-- insere em `auth.users`, se ele existir neste banco.

-- ============================================================
-- As três auxiliares: fechadas para anon, mantidas para authenticated
-- ============================================================
--
-- Revoga PRIMEIRO e concede DEPOIS. E revoga de `public` E de `anon`: são
-- grants diferentes, e o ACL das quatro tinha os dois. Revogar só um deixa a
-- porta aberta.

revoke execute on function public.mentorado_atual() from public;
revoke execute on function public.mentorado_atual() from anon;
grant execute on function public.mentorado_atual() to authenticated;

revoke execute on function public.papel_atual() from public;
revoke execute on function public.papel_atual() from anon;
grant execute on function public.papel_atual() to authenticated;

revoke execute on function public.workspace_atual() from public;
revoke execute on function public.workspace_atual() from anon;
grant execute on function public.workspace_atual() to authenticated;

-- ============================================================
-- A função de gatilho: fechada para todos os papéis da internet
-- ============================================================

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
