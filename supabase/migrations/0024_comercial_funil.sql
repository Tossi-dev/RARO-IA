-- ============================================================
-- 0024 — o funil comercial: etapas e oportunidades
-- ============================================================
--
-- NUMERADA 0024 E NÃO 0021, como o plano da Fase 2 pedia: 0021, 0022 e 0023 já
-- foram gastas. Quinta vez que este projeto tropeça no número do plano (ver
-- 0017, 0019, 0022 e 0023).
--
-- CONVENÇÃO DE ORDEM (herdada de 0019 em diante): em toda política, o escopo
-- do inquilino (`workspace_id = workspace_atual()`) é a PRIMEIRA condição.
--
-- ============================================================
-- O MENTORADO NÃO LÊ NADA DAQUI
-- ============================================================
--
-- Esta é a decisão que dá forma às políticas, e ela é diferente de tudo o que
-- veio nos blocos 5, 6 e 7. Lá o mentorado tinha um ramo próprio na política
-- de select — a trilha dele, o aviso endereçado a ele, o roteiro dele. Aqui
-- ele não tem ramo nenhum.
--
-- O motivo é o conteúdo: `oportunidade` carrega VALOR NEGOCIADO,
-- probabilidade de fechamento e motivo de perda. É a conversa interna sobre
-- quanto se espera arrancar de alguém — e a pessoa de quem se fala é
-- exatamente quem não pode ler. Um mentorado que descobrisse a própria linha
-- veria o preço que o time achava que ele pagaria, e o que escreveram quando
-- ele disse não.
--
-- Consequência prática: nenhuma política de `oportunidade` menciona
-- `'mentorado'`, e o teste FALHA se alguém acrescentar. `mentorado_id` existe
-- como coluna (é a ponte para quando a venda vira cliente), mas ter a coluna
-- não dá direito de leitura a ninguém.
--
-- ============================================================
-- O COMERCIAL ENTRA — E AQUI ELE É O DONO DA CASA
-- ============================================================
--
-- `trilha` (0019) libera leitura para comercial; `post` (0022) não. A regra
-- não é arbitrária: comercial lê o que serve para VENDER e não lê o que é do
-- pós-venda. Funil é o trabalho dele. Então aqui ele lê e escreve como
-- dono/gestor — é a primeira tabela desta fase em que isso acontece.
--
-- ============================================================
-- UMA PERDA SEM MOTIVO É UMA LIÇÃO PERDIDA
-- ============================================================
--
-- O `check` de `motivo_perda` não é burocracia: um funil que registra "perdeu"
-- sem dizer por quê vira um contador de fracasso, não uma ferramenta. A régua
-- fica no BANCO, e não num `if` de tela, pelo mesmo motivo de sempre — a tela
-- protege quem passa por ela.
--
-- ⚠ CONSEQUÊNCIA PARA QUEM ESCREVER A TELA (tarefa 46): marcar uma
-- oportunidade como perdida SEM preencher o motivo vai voltar como erro de
-- constraint. O formulário precisa pedir o motivo no mesmo passo.

-- ============================================================
-- Tipos
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'tipo_etapa_funil') then
    create type public.tipo_etapa_funil as enum ('sdr', 'closer');
  end if;
  if not exists (select 1 from pg_type where typname = 'status_oportunidade') then
    create type public.status_oportunidade as enum ('aberta', 'ganha', 'perdida');
  end if;
end
$$;

-- ============================================================
-- Tabelas
-- ============================================================

create table if not exists public.funil_etapa (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  -- `chave` é o nome ESTÁVEL da etapa ("primeiro-contato"), o que o código
  -- pode citar; `nome` é o rótulo, que o time renomeia à vontade sem quebrar
  -- nada. Sem essa separação, renomear "Reunião marcada" para "Call agendada"
  -- viraria uma migração de dados.
  chave text not null default '',
  nome text not null default '',
  ordem int not null default 0 check (ordem >= 0),
  tipo public.tipo_etapa_funil not null default 'sdr',
  -- `ativa = false` é o arquivado desta tabela. Nunca apagar: a oportunidade
  -- que passou por ela guarda o `etapa_id`.
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  -- Por WORKSPACE, não global: dois inquilinos podem ter a etapa
  -- "qualificacao" sem colidir.
  unique (workspace_id, chave)
);

create table if not exists public.oportunidade (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  aluno_id uuid not null references public.alunos (id) on delete cascade,
  -- Nulo até a venda virar cliente. É a ponte entre o funil e o pós-venda, e
  -- ter a coluna NÃO dá direito de leitura a ninguém — ver o cabeçalho.
  mentorado_id uuid references public.mentorado (id) on delete set null,
  -- Sem `on delete cascade` de propósito: apagar uma etapa apagaria o
  -- histórico das oportunidades que passaram por ela. Como nada é apagado
  -- (etapa sai por `ativa = false`), o comportamento padrão — recusar — é o
  -- certo: ele transforma um erro silencioso num erro visível.
  etapa_id uuid not null references public.funil_etapa (id),
  responsavel_perfil_id uuid references public.profiles (id) on delete set null,
  valor numeric(14, 2) not null default 0,
  probabilidade int not null default 0 check (probabilidade between 0 and 100),
  origem text not null default '',
  status public.status_oportunidade not null default 'aberta',
  motivo_perda text not null default '',
  criado_em timestamptz not null default now(),
  fechado_em timestamptz,
  -- Perdida exige motivo. Ver o cabeçalho: um funil que registra "perdeu" sem
  -- dizer por quê vira contador de fracasso, não ferramenta.
  constraint perda_tem_motivo check (status <> 'perdida' or btrim(motivo_perda) <> '')
);

create index if not exists idx_funil_etapa_workspace on public.funil_etapa (workspace_id, ordem);
create index if not exists idx_oportunidade_aluno on public.oportunidade (aluno_id);
create index if not exists idx_oportunidade_etapa on public.oportunidade (etapa_id);
create index if not exists idx_oportunidade_status on public.oportunidade (workspace_id, status);

alter table public.funil_etapa enable row level security;
alter table public.oportunidade enable row level security;

-- ============================================================
-- Políticas
-- ============================================================
--
-- Os três papéis comerciais, nas duas tabelas, nas três operações que
-- existem. Nenhuma política de DELETE, aqui como no resto da fase.

-- ---------- funil_etapa ----------

drop policy if exists "leitura do time comercial" on public.funil_etapa;
create policy "leitura do time comercial" on public.funil_etapa
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

drop policy if exists "escrita do time comercial" on public.funil_etapa;
create policy "escrita do time comercial" on public.funil_etapa
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

drop policy if exists "update do time comercial" on public.funil_etapa;
create policy "update do time comercial" on public.funil_etapa
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

-- ---------- oportunidade ----------

drop policy if exists "leitura do time comercial" on public.oportunidade;
create policy "leitura do time comercial" on public.oportunidade
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

drop policy if exists "escrita do time comercial" on public.oportunidade;
create policy "escrita do time comercial" on public.oportunidade
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

drop policy if exists "update do time comercial" on public.oportunidade;
create policy "update do time comercial" on public.oportunidade
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );
