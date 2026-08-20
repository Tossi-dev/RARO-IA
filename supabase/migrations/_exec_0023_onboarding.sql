-- _exec_0023 — a mesma migracao com os comentarios de fora das funcoes
-- removidos, para colar no SQL Editor. A versao completa e
-- 0023_onboarding.sql.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'responsavel_etapa') then
    create type public.responsavel_etapa as enum ('mentor', 'mentorado');
  end if;
end
$$;

create table if not exists public.onboarding_etapa (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  ordem int not null default 0 check (ordem >= 0),
  titulo text not null default '',
  descricao text not null default '',
  responsavel public.responsavel_etapa not null default 'mentor',
  obrigatoria boolean not null default true,
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
  unique (mentorado_id, etapa_id)
);

create index if not exists idx_onboarding_etapa_workspace on public.onboarding_etapa (workspace_id, ordem);
create index if not exists idx_onboarding_progresso_mentorado on public.onboarding_progresso (mentorado_id);

alter table public.onboarding_etapa enable row level security;
alter table public.onboarding_progresso enable row level security;

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

drop policy if exists "update da gestao" on public.onboarding_progresso;
create policy "update da gestao" on public.onboarding_progresso
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

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

revoke all on function public.onboarding_marcar(uuid, boolean) from anon;
revoke all on function public.onboarding_marcar(uuid, boolean) from public;
grant execute on function public.onboarding_marcar(uuid, boolean) to authenticated;
