-- 0046 — cada novo cadastro SaaS inaugura um workspace próprio.
--
-- O `workspace_id` e o `papel` vindos do navegador nunca entram no banco.
-- A única intenção pública aceita é `criar_workspace = true`: nesse caso o
-- trigger gera o espaço no servidor e torna a própria pessoa dona dele. Os
-- demais caminhos de criação de usuário (convite de equipe/mentorado) mantêm
-- o comportamento conservador: entram no workspace padrão como mentorado.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
  nome_workspace text;
  criar_workspace boolean := coalesce(new.raw_user_meta_data ->> 'criar_workspace', 'false') = 'true';
begin
  if criar_workspace then
    nome_workspace := nullif(
      btrim(left(coalesce(new.raw_user_meta_data ->> 'workspace_nome', ''), 120)),
      ''
    );

    insert into public.workspace (nome)
    values (coalesce(nome_workspace, 'Meu espaço MentorOS'))
    returning id into ws;

    insert into public.profiles (id, nome, papel, workspace_id)
    values (
      new.id,
      left(coalesce(new.raw_user_meta_data ->> 'nome', ''), 120),
      'dono',
      ws
    );
  else
    -- Convites administrativos continuam deliberadamente restritos ao
    -- workspace legado até existir uma interface própria para equipe.
    insert into public.profiles (id, nome, papel, workspace_id)
    values (
      new.id,
      left(coalesce(new.raw_user_meta_data ->> 'nome', ''), 120),
      'mentorado',
      '00000000-0000-0000-0000-000000000001'
    );
  end if;

  return new;
end;
$$;

-- Com mais de um inquilino, a existência e a alteração de um workspace
-- também são dados de escopo. O trigger acima é `security definer` e cria o
-- espaço sem precisar de uma policy de INSERT para a pessoa recém-cadastrada.
drop policy if exists "workspace: leitura autenticada" on public.workspace;
drop policy if exists "workspace: escrita do dono" on public.workspace;
drop policy if exists "workspace: leitura do próprio inquilino" on public.workspace;
drop policy if exists "workspace: atualização do próprio dono" on public.workspace;

create policy "workspace: leitura do próprio inquilino" on public.workspace
  for select to authenticated
  using (id = public.workspace_atual());

create policy "workspace: atualização do próprio dono" on public.workspace
  for update to authenticated
  using (id = public.workspace_atual() and public.papel_atual() = 'dono')
  with check (id = public.workspace_atual() and public.papel_atual() = 'dono');

-- As tabelas já existem e as linhas históricas não são tocadas. Só o default
-- das PRÓXIMAS escritas deixa de apontar para o UUID do workspace legado e
-- passa a derivar a organização da sessão autenticada.
do $$
declare alvo record;
begin
  for alvo in
    select table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'workspace_id'
      and table_name <> 'profiles'
      -- A captura pública não tem sessão. Ela continua explicitamente ligada
      -- ao workspace legado até receber uma origem de tenant verificável.
      and table_name <> 'captura'
  loop
    execute format(
      'alter table public.%I alter column workspace_id set default public.workspace_atual()',
      alvo.table_name
    );
  end loop;
end $$;
