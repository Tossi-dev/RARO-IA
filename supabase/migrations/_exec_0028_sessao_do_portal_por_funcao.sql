-- _exec_0028 — a mesma migracao com os comentarios removidos, para colar
-- no SQL Editor. A versao completa e 0028_sessao_do_portal_por_funcao.sql.

create or replace function public.sessoes_do_portal()
returns table (
  id uuid,
  workspace_id uuid,
  matricula_id uuid,
  turma_id uuid,
  numero int,
  quando timestamptz,
  duracao_min int,
  status public.status_sessao_mentoria,
  resumo text,
  link_reuniao text,
  gravacao_liberada boolean,
  transcricao_liberada boolean,
  transcrita_em timestamptz,
  link_gravacao text,
  transcricao text,
  criado_em timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    s.id,
    s.workspace_id,
    s.matricula_id,
    s.turma_id,
    s.numero,
    s.quando,
    s.duracao_min,
    s.status,
    s.resumo,
    s.link_reuniao,
    s.gravacao_liberada,
    s.transcricao_liberada,
    s.transcrita_em,
    case when s.gravacao_liberada then s.link_gravacao else '' end,
    case when s.transcricao_liberada then s.transcricao else '' end,
    s.criado_em
  from public.sessao s
  where s.workspace_id = public.workspace_atual()
    and (
      exists (
        select 1 from public.matricula mt
        where mt.id = s.matricula_id
          and mt.mentorado_id = public.mentorado_atual()
      )
      or exists (
        select 1 from public.matricula mt
        where mt.turma_id = s.turma_id
          and mt.mentorado_id = public.mentorado_atual()
      )
    );
$$;

comment on function public.sessoes_do_portal is
  'A sessao como o MENTORADO pode ve-la: recorte por matricula ou turma dele e
   censura de link_gravacao e transcricao enquanto as flags estiverem
   desligadas. E security definer de proposito -- o recorte por COLUNA nao
   cabe em RLS, que decide linha. Sem login de mentorado, devolve zero linhas.';

revoke all on function public.sessoes_do_portal() from public;
revoke all on function public.sessoes_do_portal() from anon;
grant execute on function public.sessoes_do_portal() to authenticated;

drop view if exists public.sessao_do_portal;

create view public.sessao_do_portal
with (security_invoker = true)
as select * from public.sessoes_do_portal();

comment on view public.sessao_do_portal is
  'Casca de compatibilidade sobre sessoes_do_portal(). Existe para o app
   continuar lendo por nome de tabela, com as mesmas colunas de 0017. Quem
   filtra e censura e a funcao.';

grant select on public.sessao_do_portal to authenticated;

drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.sessao;
drop policy if exists "leitura: dono e gestor" on public.sessao;
create policy "leitura: dono e gestor" on public.sessao
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

comment on column public.sessao.gravacao_liberada is
  'Falso por padrao. Interruptor entre "o mentor colou o link" e "o mentorado
   ve o link". Quem respeita esta flag e a funcao sessoes_do_portal (0028) --
   e ela e a unica porta do mentorado para esta tabela desde 0028, porque a
   politica de select nao o alcanca mais. Ate 0028 a flag era contornavel com
   um GET direto, porque RLS decide LINHA e nao COLUNA.';

comment on column public.sessao.transcricao_liberada is
  'Idem gravacao_liberada. Numa sessao de TURMA, ligar isto libera a fala de
   todos os participantes para cada um deles -- por isso a tela avisa antes,
   e por isso o default e falso.';
