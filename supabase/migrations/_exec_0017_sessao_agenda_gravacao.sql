alter table public.sessao
  add column if not exists evento_google_id text not null default '';
alter table public.sessao
  add column if not exists link_reuniao text not null default '';
alter table public.sessao
  add column if not exists gravacao_liberada boolean not null default false;
alter table public.sessao
  add column if not exists transcricao_liberada boolean not null default false;
alter table public.sessao
  add column if not exists transcrita_em timestamptz;
alter table public.sessao
  add column if not exists transcricao_origem text not null default '';
comment on column public.sessao.evento_google_id is
  'Id do evento na agenda do Google. Vazio = nunca sincronizada. Guardar
   isto e o que permite ATUALIZAR o evento existente em vez de criar um
   duplicado a cada sincronizacao.';
comment on column public.sessao.gravacao_liberada is
  'Falso por padrao. Interruptor entre "o mentor colou o link" e "o
   mentorado ve o link". Nao e a tela que respeita esta flag: e a view
   sessao_do_portal, porque RLS e por linha e nao por coluna.';
comment on column public.sessao.transcricao_liberada is
  'Idem gravacao_liberada. Numa sessao de TURMA, ligar isto libera a fala de
   todos os participantes para cada um deles -- por isso a tela avisa antes,
   e por isso o default e falso.';
create or replace view public.sessao_do_portal
with (security_invoker = true)
as
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
  case when s.gravacao_liberada then s.link_gravacao else '' end as link_gravacao,
  case when s.transcricao_liberada then s.transcricao else '' end as transcricao,
  s.criado_em
from public.sessao s;
comment on view public.sessao_do_portal is
  'A sessao como o MENTORADO pode ve-la. Zera link_gravacao e transcricao
   enquanto as flags correspondentes forem falsas. security_invoker = true e
   obrigatorio: sem ele a view roda com os direitos do dono do schema e
   devolve a sessao de todos os mentorados para qualquer um -- o mesmo
   defeito corrigido em 0008.';
grant select on public.sessao_do_portal to authenticated;
