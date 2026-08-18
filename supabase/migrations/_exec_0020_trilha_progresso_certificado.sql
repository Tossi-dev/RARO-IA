-- _exec_0020 — a mesma migracao com os comentarios de fora da funcao
-- removidos, para colar no SQL Editor. A versao completa e
-- 0020_trilha_progresso_certificado.sql.

create table if not exists public.trilha_matricula (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id) on delete cascade,
  trilha_id uuid not null references public.trilha (id) on delete cascade,
  inicio date not null default current_date,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (mentorado_id, trilha_id)
);

create index if not exists idx_trilha_matricula_mentorado on public.trilha_matricula (mentorado_id);

create table if not exists public.progresso_trilha (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id) on delete cascade,
  trilha_aula_id uuid not null references public.trilha_aula (id) on delete cascade,
  concluida boolean not null default false,
  concluida_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (mentorado_id, trilha_aula_id)
);

create index if not exists idx_progresso_trilha_mentorado on public.progresso_trilha (mentorado_id);

create table if not exists public.certificado (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id) on delete cascade,
  trilha_id uuid not null references public.trilha (id) on delete cascade,
  codigo text not null unique,
  emitido_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  unique (mentorado_id, trilha_id)
);

comment on column public.certificado.codigo is
  'Unico no banco inteiro (nao por workspace): e o que alguem digita numa
   verificacao publica. Dois codigos iguais tornariam a verificacao ambigua
   no momento em que ela precisa ser categorica.';

alter table public.trilha_matricula enable row level security;
alter table public.progresso_trilha enable row level security;
alter table public.certificado enable row level security;

drop policy if exists "leitura: gestao e o proprio mentorado" on public.trilha_matricula;
create policy "leitura: gestao e o proprio mentorado" on public.trilha_matricula
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor', 'comercial')
      or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
    )
  );

drop policy if exists "escrita da gestao" on public.trilha_matricula;
create policy "escrita da gestao" on public.trilha_matricula
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "update da gestao" on public.trilha_matricula;
create policy "update da gestao" on public.trilha_matricula
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "leitura: gestao e o proprio mentorado" on public.progresso_trilha;
create policy "leitura: gestao e o proprio mentorado" on public.progresso_trilha
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor', 'comercial')
      or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
    )
  );

drop policy if exists "escrita da gestao" on public.progresso_trilha;
create policy "escrita da gestao" on public.progresso_trilha
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "update da gestao" on public.progresso_trilha;
create policy "update da gestao" on public.progresso_trilha
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "leitura: gestao e o proprio mentorado" on public.certificado;
create policy "leitura: gestao e o proprio mentorado" on public.certificado
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor', 'comercial')
      or (public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual())
    )
  );

drop policy if exists "escrita da gestao" on public.certificado;
create policy "escrita da gestao" on public.certificado
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "update da gestao" on public.certificado;
create policy "update da gestao" on public.certificado
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

create or replace function public.trilha_marcar_aula(p_aula_id uuid, p_concluida boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  linhas_afetadas int;
begin
  -- REPARE NO QUE ESTA ASSINATURA NÃO TEM: nenhum parâmetro de data, e nenhum
  -- parâmetro de mentorado. Os dois são deduzidos aqui dentro. Aceitar um
  -- `p_concluida_em` seria devolver ao cliente exatamente a liberdade que a
  -- auditoria de 0012 usou para forjar uma conclusão em 2020; aceitar um
  -- `p_mentorado_id` seria deixá-lo marcar progresso na conta de outra pessoa.
  --
  -- As cinco condições abaixo são a linha inteira de defesa, porque
  -- `security definer` desliga a RLS aqui dentro:
  --   ta.id = p_aula_id                  -- só a aula pedida.
  --   tm.mentorado_id = mentorado_atual()-- só progresso DELE.
  --   tm.ativa                           -- matrícula cancelada não marca aula.
  --   ta.workspace_id = workspace_atual()-- nunca a aula de outro inquilino.
  --   papel_atual() = 'mentorado'        -- gestor que queira dar baixa em nome
  --                                         de alguém usa a tela de gestão, que
  --                                         tem política própria de update.
  insert into public.progresso_trilha (workspace_id, mentorado_id, trilha_aula_id, concluida, concluida_em)
  select
    ta.workspace_id,
    public.mentorado_atual(),
    ta.id,
    p_concluida,
    -- `now()` roda NO SERVIDOR. Quem marca uma aula não escolhe quando marcou.
    case when p_concluida then now() else null end
  from public.trilha_aula ta
  join public.trilha_matricula tm on tm.trilha_id = ta.trilha_id
  where
    ta.id = p_aula_id
    and tm.mentorado_id = public.mentorado_atual()
    and tm.ativa
    and ta.workspace_id = public.workspace_atual()
    and public.papel_atual() = 'mentorado'
  -- O segundo clique ATUALIZA a linha existente. Sem o `unique` da tabela,
  -- este `on conflict` não teria em que se apoiar e cada clique criaria uma
  -- linha nova de progresso para a mesma aula.
  on conflict (mentorado_id, trilha_aula_id) do update
  set
    concluida = excluded.concluida,
    concluida_em = excluded.concluida_em;

  get diagnostics linhas_afetadas = row_count;

  -- Zero linhas: aula inexistente, aula de outra trilha, matrícula inativa,
  -- papel errado ou workspace errado. Do ponto de vista de quem chamou, todos
  -- dão a MESMA resposta — separar os casos contaria a quem perguntou que
  -- aquela aula existe em algum lugar. A mensagem não carrega nome de tabela,
  -- coluna nem id.
  if linhas_afetadas = 0 then
    raise exception 'Não foi possível marcar esta aula.';
  end if;
end;
$$;

comment on function public.trilha_marcar_aula is
  'Unico caminho pelo qual um mentorado marca/reabre a PROPRIA aula. Nao
   existe politica de UPDATE de progresso_trilha para mentorado, de
   proposito: RLS decide se a LINHA aparece, nunca QUE COLUNA pode ser
   escrita, e uma auditoria em Postgres real (0012/0013) provou que a
   politica de linha inteira permitia forjar a data de conclusao e mover a
   linha para outro mentorado. Mesmo desenho de portal_marcar_tarefa.';

-- `public` no Postgres inclui `anon`, que é o papel de antes de qualquer
-- login. Sem estes dois revokes, a função ficaria ao alcance de quem tem só
-- a anon key — que é pública por definição.
revoke all on function public.trilha_marcar_aula(uuid, boolean) from anon;
revoke all on function public.trilha_marcar_aula(uuid, boolean) from public;
grant execute on function public.trilha_marcar_aula(uuid, boolean) to authenticated;
