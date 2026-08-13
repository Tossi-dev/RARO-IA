-- ============================================================
-- 0011 — o primeiro usuário do workspace nasce dono
-- ============================================================
--
-- O PROBLEMA QUE ISTO RESOLVE
-- ----------------------------
-- A migração 0008 fez `profiles.papel` nascer como 'mentorado', o papel
-- MENOS privilegiado, e isso está certo: um cadastro novo não pode virar
-- dono do negócio por descuido. Mas essa regra tem um caso de borda que ela
-- mesma cria — o PRIMEIRO cadastro. Se todo mundo nasce mentorado, ninguém
-- nasce podendo abrir /financeiro, e não existe caminho dentro do produto
-- para promover a primeira pessoa: promover exige ser dono, e não há dono.
-- O sistema fica trancado por fora, com o dado dele lá dentro.
--
-- A saída seria alguém abrir o painel do Supabase e rodar um UPDATE na mão.
-- Isso funciona uma vez e é exatamente o tipo de passo manual que ninguém
-- lembra de repetir quando o segundo workspace nascer — e aí o suporte vira
-- "por que meu cliente não consegue entrar".
--
-- A REGRA
-- --------
-- O primeiro perfil de um workspace vira 'dono'. Do segundo em diante,
-- 'mentorado', como antes.
--
-- POR QUE "primeiro do WORKSPACE" e não "primeiro do banco": o desenho
-- (docs/DESENHO-MENTOROS.md, decisão 1.1) diz que este produto nasce para um
-- mentor e é para virar produto para muitos. Quando o segundo inquilino
-- existir, o primeiro usuário DELE também precisa ser dono do que é dele —
-- e não mentorado num workspace onde já existe outro dono.
--
-- POR QUE ISTO NÃO É UM BURACO DE SEGURANÇA
-- ------------------------------------------
-- Não há cadastro público neste produto: `src/app/login` só faz login com
-- e-mail e senha, não há tela de "criar conta", e a criação de usuário passa
-- pelo painel do Supabase ou pela chave de serviço. Quem cria o primeiro
-- usuário de um workspace já é quem controla o projeto inteiro — dar a ele o
-- papel de dono não concede nada que ele já não pudesse fazer. A condição
-- também é estreita de propósito: basta UM dono existir para que o caminho
-- se feche para sempre naquele workspace.
--
-- Idempotente: `create or replace` na função, e a condição se auto-desliga
-- assim que existe um dono.

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
