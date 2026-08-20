-- ============================================================
-- 0023 — onboarding: as etapas e o progresso de cada mentorado
-- ============================================================
--
-- NUMERADA 0023 E NÃO 0020, como o plano da Fase 2 pedia: 0020, 0021 e 0022 já
-- foram gastas. É a quarta vez que este projeto tropeça no número do plano
-- (ver 0017, 0019 e 0022) — conferir a pasta antes de escrever o nome
-- continua sendo a regra que ninguém lembra na hora.
--
-- CONVENÇÃO DE ORDEM (herdada de 0019/0020/0022): em toda política, o escopo
-- do inquilino (`workspace_id = workspace_atual()`) é a PRIMEIRA condição.
--
-- ============================================================
-- O QUE ESTA MIGRAÇÃO ESTÁ DECIDINDO
-- ============================================================
--
-- Onboarding aqui é uma lista de etapas do workspace (o roteiro que TODO
-- mentorado novo percorre) mais uma linha de progresso por pessoa. O roteiro
-- é do negócio; o progresso é de cada um.
--
-- `responsavel` diz de quem é a etapa:
--
--   mentor    — "enviar o contrato", "agendar a primeira sessão". Quem marca
--               é o time, pela tela de gestão.
--   mentorado — "assinar o contrato", "preencher o diagnóstico". Quem marca é
--               a própria pessoa, no portal.
--
-- ============================================================
-- A COLUNA `responsavel` É REGRA DE ESCRITA, NÃO RÓTULO DE TELA
-- ============================================================
--
-- Este é o ponto inteiro da migração. `onboarding_marcar` confere
-- `e.responsavel = 'mentorado'` DENTRO do `where` — sem essa condição, um
-- mentorado marcaria como feita a etapa que é do mentor ("contrato enviado",
-- "primeira sessão agendada") e a operação inteira passaria a acreditar num
-- checklist que ninguém do time preencheu.
--
-- Não adianta a tela do portal só desenhar as etapas dele: a tela protege
-- quem passa por ela. A função vale para qualquer caminho que tente escrever,
-- inclusive um que ainda não existe.
--
-- ============================================================
-- E DE NOVO: NÃO EXISTE POLÍTICA DE UPDATE PARA MENTORADO
-- ============================================================
--
-- Mesmo desenho de `portal_marcar_tarefa` (0013), `trilha_marcar_aula` (0020)
-- e `post_marcar_lido` (0022), pela mesma razão medida numa auditoria contra
-- um Postgres de verdade: RLS decide se a LINHA aparece, nunca QUE COLUNA
-- pode ser escrita. Com a política de linha inteira que 0012 tinha, um PATCH
-- direto no PostgREST forjava a data de conclusão e movia a linha para outro
-- `mentorado_id`.

-- ============================================================
-- Tipo
-- ============================================================

-- `create type` não aceita `if not exists`; o bloco existe para a migração
-- poder rodar duas vezes sem estourar.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'responsavel_etapa') then
    create type public.responsavel_etapa as enum ('mentor', 'mentorado');
  end if;
end
$$;

-- ============================================================
-- Tabelas
-- ============================================================

create table if not exists public.onboarding_etapa (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  ordem int not null default 0 check (ordem >= 0),
  titulo text not null default '',
  descricao text not null default '',
  responsavel public.responsavel_etapa not null default 'mentor',
  -- Obrigatória entra na conta de "onboarding completo"; opcional é sugestão.
  obrigatoria boolean not null default true,
  -- `ativa = false` é o "arquivado" desta tabela: a etapa sai do roteiro de
  -- quem entra amanhã e continua existindo para quem já a cumpriu. Regra da
  -- casa: nada é apagado, senão o progresso viraria órfão.
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.onboarding_progresso (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id) on delete cascade,
  etapa_id uuid not null references public.onboarding_etapa (id) on delete cascade,
  concluida boolean not null default false,
  concluida_em timestamptz,
  criado_em timestamptz not null default now(),
  -- Sem isto, o `on conflict` da função não teria em que se apoiar e cada
  -- clique criaria uma linha nova para a mesma etapa.
  unique (mentorado_id, etapa_id)
);

create index if not exists idx_onboarding_etapa_workspace on public.onboarding_etapa (workspace_id, ordem);
create index if not exists idx_onboarding_progresso_mentorado on public.onboarding_progresso (mentorado_id);

alter table public.onboarding_etapa enable row level security;
alter table public.onboarding_progresso enable row level security;

-- ============================================================
-- Políticas
-- ============================================================

-- ---------- onboarding_etapa ----------

-- O mentorado vê o roteiro INTEIRO que está ativo, inclusive as etapas do
-- mentor. Isso é deliberado: saber que "o contrato vai ser enviado" faz parte
-- de entender onde ele está no processo. O que ele não pode é MARCAR as do
-- mentor — e quem impede isso é a função, não esta política.
drop policy if exists "leitura: gestao ve tudo, mentorado ve o que esta ativo" on public.onboarding_etapa;
create policy "leitura: gestao ve tudo, mentorado ve o que esta ativo" on public.onboarding_etapa
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor')
      or (
        public.papel_atual() = 'mentorado'
        and ativa = true
      )
    )
  );

drop policy if exists "escrita da gestao" on public.onboarding_etapa;
create policy "escrita da gestao" on public.onboarding_etapa
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "update da gestao" on public.onboarding_etapa;
create policy "update da gestao" on public.onboarding_etapa
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

-- ---------- onboarding_progresso ----------

drop policy if exists "leitura: gestao e o proprio mentorado" on public.onboarding_progresso;
create policy "leitura: gestao e o proprio mentorado" on public.onboarding_progresso
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor')
      or (
        public.papel_atual() = 'mentorado'
        and mentorado_id = public.mentorado_atual()
      )
    )
  );

drop policy if exists "escrita da gestao" on public.onboarding_progresso;
create policy "escrita da gestao" on public.onboarding_progresso
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

-- NÃO existe política de update para mentorado aqui, de propósito — ver o
-- cabeçalho. Quem marca a etapa dele é `onboarding_marcar`.
drop policy if exists "update da gestao" on public.onboarding_progresso;
create policy "update da gestao" on public.onboarding_progresso
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

-- ============================================================
-- onboarding_marcar
-- ============================================================

create or replace function public.onboarding_marcar(p_etapa_id uuid, p_concluida boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  linhas_afetadas int;
begin
  -- REPARE NO QUE ESTA ASSINATURA NÃO TEM: nenhum parâmetro de data e nenhum
  -- de mentorado. Aceitar `p_concluida_em` seria devolver ao cliente a
  -- liberdade que a auditoria de 0012 usou para forjar uma conclusão em 2020;
  -- aceitar `p_mentorado_id` seria deixá-lo marcar na conta de outra pessoa.
  --
  -- As cinco condições abaixo são a linha inteira de defesa, porque
  -- `security definer` desliga a RLS aqui dentro:
  --   e.id = p_etapa_id                    -- só a etapa pedida.
  --   e.responsavel = 'mentorado'          -- A CONDIÇÃO DESTA MIGRAÇÃO: sem
  --                                           ela, o mentorado marca "contrato
  --                                           enviado" e o time acredita.
  --   e.ativa                              -- etapa fora do roteiro não marca.
  --   e.workspace_id = workspace_atual()   -- nunca a etapa de outro inquilino.
  --   papel_atual() = 'mentorado'          -- gestor que queira dar baixa em
  --                                           nome de alguém usa a tela de
  --                                           gestão, que tem política própria.
  insert into public.onboarding_progresso (workspace_id, mentorado_id, etapa_id, concluida, concluida_em)
  select
    e.workspace_id,
    public.mentorado_atual(),
    e.id,
    p_concluida,
    -- `now()` roda NO SERVIDOR. Quem marca não escolhe quando marcou.
    case when p_concluida then now() else null end
  from public.onboarding_etapa e
  where
    e.id = p_etapa_id
    and e.responsavel = 'mentorado'
    and e.ativa
    and e.workspace_id = public.workspace_atual()
    and public.papel_atual() = 'mentorado'
    and public.mentorado_atual() is not null
  on conflict (mentorado_id, etapa_id) do update
  set
    concluida = excluded.concluida,
    concluida_em = excluded.concluida_em;

  get diagnostics linhas_afetadas = row_count;

  -- Zero linhas: etapa inexistente, etapa do MENTOR, etapa desativada, papel
  -- errado, workspace errado ou pessoa sem ficha de mentorado. Do ponto de
  -- vista de quem chamou, todos dão a MESMA resposta — separar os casos
  -- contaria a quem perguntou que aquela etapa existe em algum lugar, e de
  -- quem ela é. A mensagem não carrega nome de tabela, coluna nem id.
  if linhas_afetadas = 0 then
    raise exception 'Não foi possível marcar esta etapa.';
  end if;
end;
$$;

comment on function public.onboarding_marcar is
  'Unico caminho pelo qual um mentorado marca uma etapa PROPRIA do
   onboarding. Confere responsavel = mentorado dentro do where: sem essa
   condicao ele marcaria como feita a etapa do mentor (contrato enviado,
   sessao agendada) e a operacao acreditaria num checklist que ninguem do
   time preencheu. Nao existe politica de UPDATE de onboarding_progresso
   para mentorado, de proposito: RLS decide se a LINHA aparece, nunca QUE
   COLUNA pode ser escrita. Mesmo desenho de portal_marcar_tarefa,
   trilha_marcar_aula e post_marcar_lido.';

-- `public` no Postgres inclui `anon`, o papel de antes de qualquer login.
revoke all on function public.onboarding_marcar(uuid, boolean) from anon;
revoke all on function public.onboarding_marcar(uuid, boolean) from public;
grant execute on function public.onboarding_marcar(uuid, boolean) to authenticated;
