-- ============================================================
-- 0017 — a sessão ganha agenda, gravação e transcrição
-- ============================================================
--
-- NUMERADA 0017 E NÃO 0016 de propósito: o número 0016 já foi usado por
-- `0016_diagnostico_lead.sql`, escrita em paralelo por outra frente de
-- trabalho nesta mesma pasta. Duas migrações com o mesmo número não geram
-- erro nenhum — elas simplesmente rodam em ordem alfabética e uma some do
-- radar de quem for conferir depois se o banco está no estado esperado.
--
-- O QUE ENTRA
-- ------------
-- `evento_google_id`      o id do evento na agenda do Google, para saber se
--                         a sessão já foi sincronizada e poder ATUALIZAR em
--                         vez de criar um evento duplicado a cada clique.
-- `link_reuniao`          o Meet/Zoom da chamada. Separado de
--                         `link_gravacao`: um é o lugar onde a conversa vai
--                         acontecer, o outro é onde ela ficou registrada, e
--                         confundir os dois publica no portal um link de
--                         sala vazia.
-- `gravacao_liberada`     falso por padrão.
-- `transcricao_liberada`  falso por padrão.
-- `transcrita_em`         quando a transcrição foi gerada (nulo = nunca).
-- `transcricao_origem`    quem gerou ('groq'), para o dia em que houver mais
--                         de um provedor e alguém precisar saber de qual
--                         motor veio um texto estranho.
--
-- POR QUE AS DUAS FLAGS NASCEM FALSAS
-- ------------------------------------
-- Gravação e transcrição de uma sessão de mentoria carregam a conversa
-- inteira: números do negócio do cliente, brigas de sócio, o que ele disse
-- que não conta para mais ninguém. Publicar é ato explícito. Esconder nunca
-- pode depender de alguém lembrar de desmarcar.
--
-- O PONTO DIFÍCIL: RLS É POR LINHA, NUNCA POR COLUNA
-- ---------------------------------------------------
-- Esta é a lição que 0013 nos ensinou com um ataque executado contra um
-- Postgres de verdade: uma política de RLS decide se a LINHA aparece, e
-- quando ela aparece, aparece INTEIRA. O mentorado já enxerga as próprias
-- sessões (política do grupo 3, em 0007/0008) — então, no instante em que
-- `transcricao` passa a existir como coluna de `sessao`, ele consegue lê-la
-- com um GET direto no PostgREST usando a anon key, que é pública. A tela
-- não é defesa: ela é só um dos clientes possíveis.
--
-- Esconder na aplicação seria repetir o erro de 0012, onde a Server Action
-- "protegia" um campo que um PATCH direto alcançava assim mesmo.
--
-- A saída é mudar o que a LINHA contém, e não pedir para a tela desviar o
-- olhar: a view `sessao_do_portal` devolve `''` em `transcricao` e em
-- `link_gravacao` enquanto a flag correspondente for falsa. O portal lê a
-- VIEW; a gestão continua lendo a tabela. Com `security_invoker = true` a
-- view roda com os direitos de quem consulta — sem isso ela rodaria como o
-- dono do schema e devolveria a sessão de todo mundo, que foi exatamente o
-- crítico 1 e o crítico 2 achados na auditoria de 0008.

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
  -- O `case` e o coracao desta migracao. Enquanto a flag e falsa, a coluna
  -- nao vem vazia "na tela": ela vem vazia DO BANCO, para qualquer cliente,
  -- inclusive um curl com a anon key.
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
