-- ============================================================
-- 0006 — MentorOS: domínio da mentoria (programa, turma, mentorado,
-- matrícula, sessão, tarefa, marco, evolução).
-- Rode APÓS 0005_mentoros_identidade.sql.
--
-- Modelo pensado para dezenas de mentorados, não centenas: sem índice
-- prematuro, sem particionamento. O que importa aqui é o formato do
-- dado, porque hoje é só pacote fechado 1:1 ("sessão 8 de 12") e em
-- breve serão turma em grupo e turma online rodando ao mesmo tempo —
-- enfiar isso depois, num modelo que só sabe pensar em indivíduo,
-- custa dez vezes mais do que nascer sabendo das duas formas.
-- ============================================================

-- UUID fixo do workspace padrão, o mesmo criado em 0005. Repetido aqui
-- só como valor de DEFAULT das colunas workspace_id desta migração.
-- (Não dá para referenciar uma constante de outro arquivo em SQL puro;
-- o valor tem que ser o mesmo dos dois arquivos por convenção.)

-- ---------- enums ----------
do $$ begin
  create type formato_programa as enum ('individual', 'turma', 'online');
exception when duplicate_object then null; end $$;

comment on type formato_programa is
  'Por que existe desde já: hoje só há "individual" (pacote fechado
   1:1), mas turma em grupo e turma online chegam em seguida. Se o
   enum nascesse só com "individual", a próxima migração precisaria
   alterar todo mundo que já lê esse campo — mais caro que prever agora.';

do $$ begin
  create type status_turma as enum ('planejada', 'em_andamento', 'encerrada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_mentorado as enum ('lead', 'ativo', 'pausado', 'alumni');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_matricula_mentoria as enum ('ativa', 'concluida', 'cancelada', 'trancada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_sessao_mentoria as enum ('agendada', 'realizada', 'faltou', 'cancelada');
exception when duplicate_object then null; end $$;

-- ---------- programa ----------
-- O "produto" da mentoria: o que é vendido/entregue. total_sessoes é
-- nulo quando o programa não é pacote fechado (ex.: turma online
-- contínua sem número fixo de encontros por aluno).
create table if not exists public.programa (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  nome text not null,
  formato formato_programa not null default 'individual',
  total_sessoes int,
  preco numeric(12,2) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

comment on column public.programa.total_sessoes is
  'Nulo quando o programa não é pacote fechado (turma/online contínua).
   Quando preenchido, é o "de 12" do "sessão 8 de 12" — mas o valor por
   MENTORADO fica em matricula.sessoes_previstas, porque duas pessoas
   no mesmo programa individual podem negociar pacotes de tamanhos
   diferentes.';

-- ---------- turma ----------
-- Só é usada quando programa.formato = 'turma' ou 'online'. Uma turma
-- agrupa várias matrículas que compartilham sessões (aula em grupo).
create table if not exists public.turma (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  programa_id uuid not null references public.programa (id) on delete cascade,
  nome text not null,
  data_inicio date,
  data_fim date,
  status status_turma not null default 'planejada',
  criado_em timestamptz not null default now()
);

-- ---------- mentorado ----------
-- A ficha do mentorado (a pessoa, não a matrícula). perfil_id fica NULO
-- até o portal ser liberado para ele — a maior parte dos mentorados de
-- hoje nunca vai logar, então obrigar perfil_id desde o início criaria
-- conta fantasma no auth.users só para satisfazer um not null.
--
-- Relação com public.alunos (decisão de modelagem, ver também o
-- relatório da tarefa): NÃO herdamos de alunos nem fundimos as duas
-- tabelas. alunos é o funil de vendas/CRM (status_funil, estágio,
-- notas, atividades) — modela "de onde veio o lead até a venda".
-- mentorado é o pós-venda: o ciclo de vida dentro do programa
-- (status_mentorado: lead/ativo/pausado/alumni), sessões, tarefas,
-- marcos e score de evolução — dado de portal, não de pipeline
-- comercial. Fundir as duas obrigaria toda linha de alunos a carregar
-- campos de mentoria (perfil_id, score) que 95% dos leads nunca usam,
-- e obrigaria RLS de portal e RLS de CRM a conviver na mesma tabela —
-- exatamente o tipo de mistura que o 0007 existe para desfazer.
-- Em vez disso, aluno_id é uma FK opcional: quando o mentorado veio do
-- funil de vendas, o vínculo preserva o histórico de CRM (notas,
-- atividades, origem) sem obrigar toda mentoria a ter passado por lá
-- (ex.: mentorado indicado direto, sem funil).
create table if not exists public.mentorado (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  aluno_id uuid references public.alunos (id) on delete set null,
  perfil_id uuid references public.profiles (id) on delete set null,
  nome text not null,
  telefone text not null default '',
  email text not null default '',
  origem text not null default '',
  status status_mentorado not null default 'lead',
  criado_em timestamptz not null default now()
);

comment on column public.mentorado.perfil_id is
  'Nulo até o portal ser liberado para esse mentorado — a maioria hoje
   nunca loga. Quando preenchido, é o vínculo que RLS usa (via
   mentorado_atual(), em 0007) para o mentorado enxergar só a própria
   ficha.';

comment on column public.mentorado.aluno_id is
  'Vínculo opcional com o CRM de vendas (public.alunos). Ver comentário
   acima da tabela para o porquê de não fundir as duas.';

-- ---------- matricula ----------
-- É aqui que vive o "sessão 8 de 12": sessoes_previstas é o pacote
-- fechado negociado com ESSE mentorado (pode diferir de
-- programa.total_sessoes). turma_id é nulo quando é atendimento 1:1.
create table if not exists public.matricula (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id) on delete cascade,
  programa_id uuid not null references public.programa (id),
  turma_id uuid references public.turma (id),
  inicio date not null default current_date,
  fim_previsto date,
  status status_matricula_mentoria not null default 'ativa',
  sessoes_previstas int,
  criado_em timestamptz not null default now()
);

create index if not exists idx_matricula_mentorado on public.matricula (mentorado_id);

-- ---------- sessao ----------
-- Uma sessão pertence OU a uma matrícula (atendimento 1:1) OU a uma
-- turma (aula em grupo — todos os matriculados daquela turma
-- compartilham a mesma sessão). O CHECK garante que nunca fica órfã
-- nem duplamente vinculada, o que quebraria a contagem de
-- matricula_progresso (view logo abaixo).
create table if not exists public.sessao (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  matricula_id uuid references public.matricula (id) on delete cascade,
  turma_id uuid references public.turma (id) on delete cascade,
  numero int,
  quando timestamptz not null,
  duracao_min int not null default 60,
  status status_sessao_mentoria not null default 'agendada',
  link_gravacao text not null default '',
  transcricao text not null default '',
  resumo text not null default '',
  criado_em timestamptz not null default now(),
  constraint sessao_vinculo_unico check (
    (matricula_id is not null and turma_id is null)
    or (matricula_id is null and turma_id is not null)
  )
);

-- sessao_vinculo_unico: exatamente um vínculo (matricula_id para
-- atendimento individual OU turma_id para aula em grupo). Nunca os
-- dois, nunca nenhum — senão a sessão não aparece na contagem de
-- ninguém. (Documentado como comentário de código, não `comment on
-- constraint`, para não depender de um recurso de metadado que nem
-- toda ferramenta de introspecção de schema entende igual.)

comment on column public.sessao.numero is
  'O "8" de "sessão 8 de 12". Guardado explicitamente (em vez de só
   inferido por ordem cronológica) porque reagendamento e cancelamento
   bagunçam a ordem — o número é o que o mentor efetivamente comunicou
   ao mentorado.';

create index if not exists idx_sessao_matricula on public.sessao (matricula_id);
create index if not exists idx_sessao_turma on public.sessao (turma_id);
create index if not exists idx_sessao_quando on public.sessao (quando);

-- ---------- tarefa_mentoria ----------
-- Tarefa combinada numa sessão (ex.: "até a próxima call, fazer X").
-- Distinta de public.tarefas (CRM interno do time) — essa aqui é
-- conteúdo de portal, o mentorado precisa poder lê-la (e futuramente
-- marcar como feita).
create table if not exists public.tarefa_mentoria (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id) on delete cascade,
  sessao_id uuid references public.sessao (id) on delete set null,
  titulo text not null,
  prazo date,
  concluida boolean not null default false,
  marcada_por text not null default '',
  criado_em timestamptz not null default now()
);

create index if not exists idx_tarefa_mentoria_mentorado on public.tarefa_mentoria (mentorado_id);

-- ---------- marco ----------
-- Conquistas exibidas no portal (ex.: "primeiro cliente fechado").
create table if not exists public.marco (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id) on delete cascade,
  titulo text not null,
  descricao text not null default '',
  conquistado_em date not null default current_date,
  criado_em timestamptz not null default now()
);

create index if not exists idx_marco_mentorado on public.marco (mentorado_id);

-- ---------- score_evolucao ----------
-- Uma LINHA POR SEMANA, não uma coluna única em mentorado. É
-- histórico, não estado, de propósito: sem série semanal não existe
-- "caiu 18 pontos essa semana" — e é justamente esse alerta de queda
-- que é a promessa do produto (detectar risco de churn antes do
-- mentorado sumir). Um campo único em mentorado só diria o score de
-- HOJE, apagando o "de onde veio".
create table if not exists public.score_evolucao (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id) on delete cascade,
  semana date not null,
  score int not null check (score between 0 and 100),
  motivo text not null default '',
  criado_em timestamptz not null default now(),
  unique (mentorado_id, semana)
);

comment on table public.score_evolucao is
  'Histórico semanal de propósito (uma linha por semana, não uma
   coluna em mentorado): sem a série não dá para calcular variação
   ("caiu 18 pontos"), e é essa variação que alimenta o alerta de
   churn. Ver unique (mentorado_id, semana) — no máximo um score por
   mentorado por semana, upsert do app faz o resto.';

create index if not exists idx_score_evolucao_mentorado on public.score_evolucao (mentorado_id, semana desc);

-- ---------- conteudo_liberado ----------
-- Material (arquivo/link) que o mentor libera para um mentorado
-- específico dentro do portal. Existe porque 0007 precisa de uma
-- tabela de "conteúdo liberado" com RLS por mentorado — sem ela, a
-- promessa do portal ("o mentorado só vê o que é dele") ficaria sem
-- lugar para morar.
create table if not exists public.conteudo_liberado (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id) on delete cascade,
  titulo text not null,
  url text not null default '',
  liberado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

create index if not exists idx_conteudo_liberado_mentorado on public.conteudo_liberado (mentorado_id);

-- ---------- view matricula_progresso ----------
-- "sessão 8 de 12" não é coluna, é count(*) das sessões realizadas da
-- matrícula — de propósito. Uma coluna denormalizada (ex.:
-- matricula.sessoes_realizadas) desatualiza em silêncio no dia em que
-- alguém apagar ou reclassificar uma sessão (cancelar, marcar como
-- falta): ninguém lembraria de decrementar o contador, e o portal
-- mostraria um progresso que não existe mais. A view sempre recalcula
-- a partir da fonte da verdade (a tabela sessao).
create or replace view public.matricula_progresso as
select
  mt.id as matricula_id,
  mt.workspace_id,
  mt.mentorado_id,
  me.nome as mentorado_nome,
  mt.programa_id,
  p.nome as programa_nome,
  mt.sessoes_previstas,
  count(s.id) as sessoes_realizadas,
  case
    when mt.sessoes_previstas is null or mt.sessoes_previstas = 0 then null
    else round(100.0 * count(s.id) / mt.sessoes_previstas, 1)
  end as percentual_concluido
from public.matricula mt
join public.mentorado me on me.id = mt.mentorado_id
join public.programa p on p.id = mt.programa_id
left join public.sessao s
  on s.matricula_id = mt.id and s.status = 'realizada'
group by mt.id, mt.workspace_id, mt.mentorado_id, me.nome, mt.programa_id, p.nome, mt.sessoes_previstas;

comment on view public.matricula_progresso is
  'sessao_atual não é coluna: é count(*) de sessões realizadas,
   recalculado aqui. Uma coluna denormalizada desatualiza em silêncio
   no dia em que alguém apagar uma sessão; a view nunca mente porque
   sempre olha a tabela sessao de novo.';

-- ---------- RLS: liga por enquanto (leitura ampla), 0007 restringe ----------
-- Mesmo padrão estrutural do 0001-0004: aqui só ligamos RLS e damos a
-- forma inicial (leitura autenticada, escrita dono/gestor). A
-- reclassificação por papel (dono/comercial/mentorado) — a parte que
-- de fato importa para não vazar dado — é o trabalho do 0007.
do $$
declare t text;
begin
  foreach t in array array[
    'programa','turma','mentorado','matricula','sessao',
    'tarefa_mentoria','marco','score_evolucao','conteudo_liberado'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "leitura autenticada" on public.%I for select to authenticated using (true)', t);
    execute format(
      'create policy "escrita da gestao" on public.%I for insert to authenticated with check (public.papel_atual() in (''dono'',''gestor''))', t);
    execute format(
      'create policy "update da gestao" on public.%I for update to authenticated using (public.papel_atual() in (''dono'',''gestor'')) with check (public.papel_atual() in (''dono'',''gestor''))', t);
    execute format(
      'create policy "delete da gestao" on public.%I for delete to authenticated using (public.papel_atual() in (''dono'',''gestor''))', t);
  end loop;
exception when duplicate_object then null;
end $$;
