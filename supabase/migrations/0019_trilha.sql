-- ============================================================
-- 0019 — trilhas e aulas
-- ============================================================
--
-- NUMERADA 0019 E NÃO 0017, como o plano da Fase 2 pedia: os números 0017 e
-- 0018 já foram gastos por `0017_sessao_agenda_gravacao.sql` e
-- `0018_conteudo_liberado_arquivado.sql`, escritas antes desta. Duas migrações
-- com o mesmo número não geram erro nenhum — elas simplesmente rodam em ordem
-- alfabética e uma some do radar de quem for conferir depois se o banco está
-- no estado esperado. É a segunda vez que este projeto tropeça nisso (ver o
-- cabeçalho de 0017); da próxima, conferir a pasta antes de escrever o nome.
--
-- POR QUE TABELAS NOVAS, E NÃO `modulos`/`aulas` DE 0009
-- ------------------------------------------------------
-- Aquelas duas existem e parecem servir. Não servem, por dois motivos que o
-- cabeçalho de 0009 já descreve com todas as letras:
--
--   1. São presas a `produtos` — o domínio de infoproduto, que a Fase 1 tirou
--      da navegação. Uma trilha de mentoria não pertence a um produto de
--      catálogo, pertence (opcionalmente) a um PROGRAMA.
--   2. O progresso delas é por `aluno_id`, e não existe ponte limpa entre
--      `aluno` (o funil de vendas) e `mentorado` (o pós-venda). Ligar as duas
--      aqui obrigaria a inventar essa ponte no lugar errado — dentro de uma
--      migração de conteúdo, sem ninguém decidir.
--
-- Reaproveitar teria custado uma coluna nova e uma regra de conversão que
-- ninguém consegue explicar seis meses depois. As tabelas velhas ficam onde
-- estão, intocadas (regra da casa: nunca apagar).
--
-- QUEM VÊ O QUÊ
-- -------------
-- Dono, gestor e comercial leem tudo do próprio workspace.
--
-- O mentorado lê apenas a trilha ligada a um programa em que ele tem matrícula
-- ATIVA. Consequência deliberada: trilha com `programa_id` nulo é material
-- interno — em preparação, ou usado como modelo — e NENHUM mentorado a
-- enxerga. Fail-closed: uma trilha nasce invisível para o cliente e passa a
-- ser visível quando alguém a amarra a um programa, que é um ato explícito.
--
-- A política de `trilha_aula` não repete a regra: ela pergunta se a TRILHA da
-- aula é visível. Assim existe UM lugar que define "quais trilhas este
-- mentorado vê", e mudar a regra num lugar muda nos dois. Duas cópias da mesma
-- condição divergem no primeiro conserto feito só de um lado.
--
-- NÃO EXISTE POLÍTICA DE ESCRITA PARA MENTORADO, em nenhuma das duas tabelas.
-- Ele lê o conteúdo; quem monta a trilha é a gestão. O progresso dele nasce na
-- migração seguinte, e por uma função `security definer` — nunca por um UPDATE
-- direto, pelo mesmo motivo de 0013.

create table if not exists public.trilha (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  nome text not null,
  descricao text not null default '',
  -- Nulo = trilha ainda não amarrada a um programa. Ver "QUEM VÊ O QUÊ".
  programa_id uuid references public.programa (id),
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create index if not exists idx_trilha_programa on public.trilha (programa_id);

create table if not exists public.trilha_aula (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  trilha_id uuid not null references public.trilha (id) on delete cascade,
  ordem int not null default 0,
  titulo text not null,
  -- `tipo_aula` já existe desde 0009 ('video', 'texto', 'ao_vivo', 'tarefa').
  -- Reaproveitado de propósito: um enum novo com os mesmos quatro valores
  -- criaria duas verdades sobre o que é uma aula.
  tipo tipo_aula not null default 'video',
  url_video text not null default '',
  texto text not null default '',
  duracao_min int not null default 0,
  -- Quantos dias depois do início da trilha esta aula abre. Zero = abre junto.
  -- O CHECK existe porque um valor negativo abriria a aula ANTES do início, e
  -- o módulo de liberação gradual passaria a calcular sobre uma data que não
  -- aconteceu — erro que não dá erro, só um conteúdo aparecendo cedo demais.
  libera_em_dias int not null default 0 check (libera_em_dias >= 0),
  criado_em timestamptz not null default now()
);

create index if not exists idx_trilha_aula_trilha on public.trilha_aula (trilha_id, ordem);

comment on column public.trilha.programa_id is
  'Nulo = trilha nao amarrada a programa nenhum, e portanto invisivel para
   todo mentorado. Fail-closed: a trilha nasce interna e passa a ser vista
   quando alguem a amarra, que e um ato explicito.';

comment on column public.trilha_aula.libera_em_dias is
  'Dias apos o inicio da trilha para esta aula abrir. Zero abre junto. O
   check >= 0 impede valor negativo, que abriria a aula antes do inicio.';

alter table public.trilha enable row level security;
alter table public.trilha_aula enable row level security;

-- CONVENÇÃO DE ORDEM: em TODA política, `workspace_id = workspace_atual()` é a
-- PRIMEIRA condição. Não é estética. O escopo do inquilino é o que não pode
-- faltar em nenhuma delas, e ler sempre na mesma posição é o que permite
-- conferir dez políticas de relance -- e permite ao teste conferir por
-- estrutura, em vez de procurar a string em qualquer lugar do texto (onde ela
-- também aparece dentro de subconsulta, e a asserção passa por acidente).

-- ---------- trilha ----------

drop policy if exists "leitura: gestao e mentorado com matricula ativa" on public.trilha;
create policy "leitura: gestao e mentorado com matricula ativa" on public.trilha
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor', 'comercial')
      or (
        public.papel_atual() = 'mentorado'
        and programa_id is not null
        and exists (
          select 1
          from public.matricula m
          where m.mentorado_id = public.mentorado_atual()
            and m.programa_id = trilha.programa_id
            and m.status = 'ativa'
            and m.workspace_id = public.workspace_atual()
        )
      )
    )
  );

drop policy if exists "escrita da gestao" on public.trilha;
create policy "escrita da gestao" on public.trilha
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "update da gestao" on public.trilha;
create policy "update da gestao" on public.trilha
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

-- ---------- trilha_aula ----------

drop policy if exists "leitura: quem enxerga a trilha enxerga a aula" on public.trilha_aula;
create policy "leitura: quem enxerga a trilha enxerga a aula" on public.trilha_aula
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and exists (
      select 1 from public.trilha t where t.id = trilha_aula.trilha_id
    )
  );

drop policy if exists "escrita da gestao" on public.trilha_aula;
create policy "escrita da gestao" on public.trilha_aula
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "update da gestao" on public.trilha_aula;
create policy "update da gestao" on public.trilha_aula
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );
