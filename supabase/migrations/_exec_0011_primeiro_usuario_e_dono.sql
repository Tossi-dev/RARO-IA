create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid := '00000000-0000-0000-0000-000000000001';
  ja_tem_dono boolean;
  papel_novo papel_usuario;
begin
  -- Existe alguém com papel de comando neste workspace? 'dono' e 'gestor'
  -- contam: um workspace que já tem gestor não está órfão, e promover mais
  -- um a dono seria conceder poder que ninguém pediu.
  select exists (
    select 1 from public.profiles
    where workspace_id = ws and papel in ('dono', 'gestor')
  ) into ja_tem_dono;

  papel_novo := case when ja_tem_dono then 'mentorado'::papel_usuario
                     else 'dono'::papel_usuario end;

  -- O papel é escrito EXPLICITAMENTE, sem depender do default da coluna —
  -- mesma decisão da 0008: um default alterado por engano numa migração
  -- futura não pode mudar em silêncio quem entra como o quê.
  insert into public.profiles (id, nome, papel, workspace_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    papel_novo,
    ws
  );
  return new;
end;
$$;
comment on function public.handle_new_user is
  'Cria o perfil de quem acabou de se cadastrar. O PRIMEIRO usuario de um
   workspace vira dono (senao ninguem consegue entrar no sistema que acabou
   de ser instalado); do segundo em diante, mentorado. Ver o cabecalho de
   0011_primeiro_usuario_e_dono.sql para o raciocinio completo.';
