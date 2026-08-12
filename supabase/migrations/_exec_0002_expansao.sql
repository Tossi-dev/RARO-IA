create type atividade_tipo as enum ('nota','contato','whatsapp','ligacao','email','evento','compra','tarefa','sistema');
create type reuniao_status as enum ('agendada','realizada','cancelada');
create type plataforma_social as enum ('instagram','tiktok','facebook');
create type conteudo_tipo as enum ('reel','post','story','video','carrossel');
create type pilar_video as enum ('gancho','desenvolvimento','cta');
create type campanha_tipo as enum ('pago','organico');
create table public.crm_estagios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ordem int not null default 0,
  cor text not null default 'cinza',
  funil status_funil not null default 'potencial',
  criado_em timestamptz not null default now()
);
insert into public.crm_estagios (nome, ordem, cor, funil) values
  ('Lead',            1, 'cinza',    'potencial'),
  ('Em conversa',     2, 'azul',     'potencial'),
  ('Aluno novo',      3, 'violeta',  'novo'),
  ('Aluno ativo',     4, 'verde',    'recorrente'),
  ('Em risco',        5, 'ouro',     'recorrente'),
  ('Inativo',         6, 'vermelho', 'inativo');
alter table public.alunos add column estagio_id uuid references public.crm_estagios (id);
alter table public.matriculas add column is_upsell boolean not null default false;
create table public.notas (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.alunos (id) on delete cascade,
  autor text not null default '',
  texto text not null,
  criado_em timestamptz not null default now()
);
create table public.atividades (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references public.alunos (id) on delete cascade,
  tipo atividade_tipo not null,
  titulo text not null,
  detalhe text not null default '',
  data timestamptz not null default now()
);
create index atividades_aluno_idx on public.atividades (aluno_id, data desc);
create table public.tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  detalhe text not null default '',
  aluno_id uuid references public.alunos (id),
  lancamento_id uuid references public.lancamentos (id),
  responsavel text not null default '',
  prazo date,
  prioridade text not null default 'media',
  status text not null default 'pendente',
  criado_em timestamptz not null default now()
);
create table public.reunioes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  inicio timestamptz not null,
  fim timestamptz,
  com_quem text not null default '',
  aluno_id uuid references public.alunos (id),
  lancamento_id uuid references public.lancamentos (id),
  turma_id uuid references public.turmas (id),
  status reuniao_status not null default 'agendada',
  link text not null default '',
  google_event_id text not null default '',
  criado_em timestamptz not null default now()
);
create index reunioes_inicio_idx on public.reunioes (inicio);
create table public.transcricoes (
  id uuid primary key default gen_random_uuid(),
  reuniao_id uuid not null references public.reunioes (id) on delete cascade,
  origem text not null default 'manual',
  texto text not null default '',
  resumo text not null default '',
  criado_em timestamptz not null default now()
);
create table public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  periodo text not null,
  valor_previsto numeric(12,2) not null default 0,
  unique (categoria, periodo)
);
create table public.metas_financeiras (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  periodo text not null,
  alvo numeric(12,2) not null default 0,
  unique (tipo, periodo)
);
create table public.perfis_sociais (
  id uuid primary key default gen_random_uuid(),
  plataforma plataforma_social not null,
  handle text not null,
  seguidores int not null default 0,
  conectado boolean not null default false,
  atualizado_em timestamptz not null default now()
);
create table public.conteudos (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references public.perfis_sociais (id) on delete cascade,
  tipo conteudo_tipo not null default 'reel',
  titulo text not null,
  url text not null default '',
  publicado_em date not null default current_date,
  duracao_seg int not null default 0,
  roteiro text not null default '',
  externo_id text not null default ''
);
create index conteudos_perfil_idx on public.conteudos (perfil_id, publicado_em desc);
create table public.conteudo_metricas (
  id uuid primary key default gen_random_uuid(),
  conteudo_id uuid not null references public.conteudos (id) on delete cascade,
  coletado_em timestamptz not null default now(),
  views int not null default 0,
  likes int not null default 0,
  comentarios int not null default 0,
  compartilhamentos int not null default 0,
  salvamentos int not null default 0,
  alcance int not null default 0,
  tempo_medio_seg numeric(8,2) not null default 0,
  retencao_media numeric(5,2) not null default 0
);
create index conteudo_metricas_idx on public.conteudo_metricas (conteudo_id, coletado_em desc);
create table public.conteudo_retencao (
  id uuid primary key default gen_random_uuid(),
  conteudo_id uuid not null references public.conteudos (id) on delete cascade,
  ponto_pct int not null,
  retencao_pct numeric(5,2) not null
);
create index conteudo_retencao_idx on public.conteudo_retencao (conteudo_id, ponto_pct);
create table public.conteudo_pilares (
  id uuid primary key default gen_random_uuid(),
  conteudo_id uuid not null references public.conteudos (id) on delete cascade,
  pilar pilar_video not null,
  texto text not null default '',
  nota numeric(3,1),
  unique (conteudo_id, pilar)
);
create table public.campanhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo campanha_tipo not null default 'organico',
  canal text not null default 'multi',
  objetivo text not null default '',
  orcamento numeric(12,2) not null default 0,
  inicio date not null default current_date,
  fim date,
  conteudo_id uuid references public.conteudos (id),
  criado_em timestamptz not null default now()
);
do $$
declare t text;
begin
  foreach t in array array[
    'crm_estagios','notas','atividades','tarefas','reunioes','transcricoes',
    'orcamentos','metas_financeiras','perfis_sociais','conteudos',
    'conteudo_metricas','conteudo_retencao','conteudo_pilares','campanhas'
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
end $$;