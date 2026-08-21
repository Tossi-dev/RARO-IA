-- ============================================================
-- 0028 — a sessão do portal passa a ser FUNÇÃO, e a `sessao` fecha
-- ============================================================
--
-- Esta migração não estava no plano da Fase 2. Ela nasceu de um furo achado
-- em 21/08, ao escrever a tarefa 51: o plano pedia, para `contrato`, a MESMA
-- receita usada em 0017 — e a receita não protege nada.
--
-- ============================================================
-- O FURO, EM UMA FRASE
-- ============================================================
--
-- `sessao` tinha política de select liberando a LINHA INTEIRA para o
-- mentorado dono da matrícula (0007, corrigida em 0008). A view
-- `sessao_do_portal` (0017) zerava `link_gravacao` e `transcricao` enquanto
-- as flags estivessem desligadas.
--
-- Só que a view censura quem PASSA por ela. O mentorado tem, no próprio
-- navegador, a anon key e o próprio token: um GET direto em
-- `/rest/v1/sessao?select=transcricao` devolvia a transcrição inteira, com a
-- flag desligada, porque a política deixava a LINHA aparecer — e RLS decide
-- LINHA, nunca COLUNA.
--
-- É o mesmo defeito de 0012/0013, a lição mais cara deste projeto, repetida
-- num lugar onde ninguém tinha olhado de novo.
--
-- E o dano não é abstrato: numa sessão de TURMA, `transcricao` é a fala de
-- todos os participantes. A flag `transcricao_liberada` existe exatamente
-- porque liberar isso é uma decisão, e a decisão estava sendo ignorada por
-- quem soubesse montar uma URL.
--
-- ============================================================
-- O CONSERTO
-- ============================================================
--
-- 1. A sessão do portal vira FUNÇÃO `security definer`
--    (`public.sessoes_do_portal()`), que faz o recorte do mentorado e a
--    censura das colunas DENTRO do banco, e devolve linha nenhuma para quem
--    não é mentorado;
--
-- 2. a view `sessao_do_portal` continua existindo, com o mesmo nome e as
--    mesmas colunas — ela agora só lê a função. Isso mantém o app (que já
--    pede colunas nominais dela) funcionando sem tocar numa linha de
--    TypeScript;
--
-- 3. a política de select de `sessao` perde o ramo do mentorado. Passa a ser
--    o que sempre deveria ter sido: dono e gestor.
--
-- ⚠ CONSEQUÊNCIA: depois desta migração, um GET direto em `sessao` com token
-- de mentorado devolve ZERO linhas. É o objetivo. Quem lê a sessão do lado do
-- cliente é a view, e a view devolve a versão censurada.

-- ============================================================
-- A função
-- ============================================================

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
    -- A censura mora AQUI, e agora ela é a única porta: enquanto a flag for
    -- falsa, a coluna volta vazia do banco para qualquer cliente.
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

-- `public` inclui qualquer papel presente e futuro, e `anon` é quem nem fez
-- login. Esta função não é pública: ela é do cliente logado.
revoke all on function public.sessoes_do_portal() from public;
revoke all on function public.sessoes_do_portal() from anon;
grant execute on function public.sessoes_do_portal() to authenticated;

-- ============================================================
-- A view, com o mesmo nome e as mesmas colunas
-- ============================================================

drop view if exists public.sessao_do_portal;

create view public.sessao_do_portal
with (security_invoker = true)
as select * from public.sessoes_do_portal();

comment on view public.sessao_do_portal is
  'Casca de compatibilidade sobre sessoes_do_portal(). Existe para o app
   continuar lendo por nome de tabela, com as mesmas colunas de 0017. Quem
   filtra e censura e a funcao.';

grant select on public.sessao_do_portal to authenticated;

-- ============================================================
-- A política de `sessao` fecha
-- ============================================================

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
