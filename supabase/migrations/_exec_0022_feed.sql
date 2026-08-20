-- _exec_0022 — a mesma migracao com os comentarios de fora das funcoes
-- removidos, para colar no SQL Editor. A versao completa e 0022_feed.sql.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'escopo_post') then
    create type public.escopo_post as enum ('feed', 'broadcast', 'dm');
  end if;
end
$$;

create table if not exists public.post (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  autor_perfil_id uuid references public.profiles (id) on delete set null,
  escopo public.escopo_post not null default 'feed',
  titulo text not null default '',
  corpo text not null default '',
  publicado_em timestamptz,
  arquivado boolean not null default false,
  criado_em timestamptz not null default now()
);

create table if not exists public.post_destinatario (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  post_id uuid not null references public.post (id) on delete cascade,
  mentorado_id uuid not null references public.mentorado (id) on delete cascade,
  lido_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (post_id, mentorado_id)
);

create table if not exists public.comentario (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  post_id uuid not null references public.post (id) on delete cascade,
  autor_perfil_id uuid references public.profiles (id) on delete set null,
  corpo text not null default '',
  arquivado boolean not null default false,
  criado_em timestamptz not null default now()
);

create index if not exists idx_post_workspace on public.post (workspace_id, publicado_em desc);
create index if not exists idx_post_destinatario_mentorado on public.post_destinatario (mentorado_id);
create index if not exists idx_post_destinatario_post on public.post_destinatario (post_id);
create index if not exists idx_comentario_post on public.comentario (post_id);

alter table public.post enable row level security;
alter table public.post_destinatario enable row level security;
alter table public.comentario enable row level security;

create or replace function public.post_visivel(p_post_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.post p
    where p.id = p_post_id
      and p.workspace_id = public.workspace_atual()
      and (
        public.papel_atual() in ('dono', 'gestor')
        or (
          public.papel_atual() = 'mentorado'
          and p.arquivado = false
          and p.publicado_em is not null
          and p.publicado_em <= now()
          and (
            p.escopo in ('feed', 'broadcast')
            or (
              p.escopo = 'dm'
              and exists (
                select 1
                from public.post_destinatario pd
                where pd.post_id = p.id
                  and pd.mentorado_id = public.mentorado_atual()
                  and pd.workspace_id = public.workspace_atual()
              )
            )
          )
        )
      )
  );
$$;

comment on function public.post_visivel is
  'Quem enxerga ESTE post. Unica definicao da regra: a politica de select de
   post e a de comentario chamam esta funcao, em vez de repetir a condicao
   nas duas (duas copias divergem no primeiro conserto feito so de um lado, e
   o preco seria o comentario de uma mensagem direta aparecendo no mural).
   security definer para nao recursar na propria politica de post -- e por
   isso a funcao carrega o escopo inteiro por dentro: workspace, papel,
   publicacao e destinatario.';

revoke all on function public.post_visivel(uuid) from anon;
revoke all on function public.post_visivel(uuid) from public;
grant execute on function public.post_visivel(uuid) to authenticated;

drop policy if exists "leitura: gestao e quem o post alcanca" on public.post;
create policy "leitura: gestao e quem o post alcanca" on public.post
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.post_visivel(id)
  );

drop policy if exists "escrita da gestao" on public.post;
create policy "escrita da gestao" on public.post
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "update da gestao" on public.post;
create policy "update da gestao" on public.post
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "leitura: gestao e o proprio mentorado" on public.post_destinatario;
create policy "leitura: gestao e o proprio mentorado" on public.post_destinatario
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

drop policy if exists "escrita da gestao" on public.post_destinatario;
create policy "escrita da gestao" on public.post_destinatario
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "update da gestao" on public.post_destinatario;
create policy "update da gestao" on public.post_destinatario
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "leitura: herda a visibilidade do post" on public.comentario;
create policy "leitura: herda a visibilidade do post" on public.comentario
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.post_visivel(post_id)
    and (
      public.papel_atual() in ('dono', 'gestor')
      or arquivado = false
    )
  );

drop policy if exists "escrita: quem enxerga o post, assinando o proprio nome" on public.comentario;
create policy "escrita: quem enxerga o post, assinando o proprio nome" on public.comentario
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.post_visivel(post_id)
    and autor_perfil_id = auth.uid()
    and public.papel_atual() in ('dono', 'gestor', 'mentorado')
  );

drop policy if exists "update da gestao" on public.comentario;
create policy "update da gestao" on public.comentario
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

create or replace function public.post_marcar_lido(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  linhas_afetadas int;
begin
  -- REPARE NO QUE ESTA ASSINATURA NÃO TEM: nenhum parâmetro de data e nenhum
  -- de mentorado. Aceitar `p_lido_em` seria devolver ao cliente a liberdade
  -- de forjar quando leu; aceitar `p_mentorado_id` seria deixá-lo marcar na
  -- conta de outra pessoa. Os dois saem daqui de dentro.
  update public.post_destinatario pd
  set lido_em = now()
  where pd.post_id = p_post_id
    and pd.mentorado_id = public.mentorado_atual()
    and pd.workspace_id = public.workspace_atual()
    and public.papel_atual() = 'mentorado'
    -- Já lido não é atualizado de novo: a primeira leitura é a que conta, e
    -- reescrever a data a cada abertura apagaria o único dado que a coluna
    -- tem para dar.
    and pd.lido_em is null;

  get diagnostics linhas_afetadas = row_count;

  -- Zero linhas tem várias causas: post inexistente, não endereçado a esta
  -- pessoa, papel errado, workspace errado — ou simplesmente já lido. Este
  -- último é o caso NORMAL, e é por isso que aqui não há `raise exception`
  -- (diferente de `trilha_marcar_aula`): abrir duas vezes o mesmo recado não
  -- é erro. A contagem serve só para o log de quem chamou.
  if linhas_afetadas = 0 then
    return;
  end if;
end;
$$;

comment on function public.post_marcar_lido is
  'Unico caminho pelo qual um mentorado marca um post como lido. Nao existe
   politica de update de post_destinatario para mentorado, de proposito: RLS
   decide se a LINHA aparece, nunca QUE COLUNA pode ser escrita, e uma
   auditoria em Postgres real (0012/0013) provou que a politica de linha
   inteira permitia forjar a data e mover a linha para outro mentorado.
   Mesmo desenho de portal_marcar_tarefa e trilha_marcar_aula.';

revoke all on function public.post_marcar_lido(uuid) from anon;
revoke all on function public.post_marcar_lido(uuid) from public;
grant execute on function public.post_marcar_lido(uuid) to authenticated;
