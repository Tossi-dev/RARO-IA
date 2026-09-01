-- 0042 — conversa individual privada e liberação explícita de contrato.
-- Somente migration local: não aplicar no MentorOS sem autorização própria.

do $$ begin
  create type public.direcao_mensagem_mentoria as enum ('gestao_para_mentorado', 'mentorado_para_gestao');
exception when duplicate_object then null; end $$;

create table if not exists public.mensagem_mentoria (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id),
  mentorado_id uuid not null references public.mentorado (id),
  autor_id uuid not null default auth.uid() references public.profiles (id),
  direcao public.direcao_mensagem_mentoria not null,
  texto text not null check (length(trim(texto)) between 1 and 4000),
  criado_em timestamptz not null default now(),
  lida_em timestamptz,
  arquivada boolean not null default false
);

create index if not exists idx_mensagem_mentoria_conversa on public.mensagem_mentoria (workspace_id, mentorado_id, criado_em desc);

create or replace function public.validar_mensagem_mentoria_referencias()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.mentorado m
    where m.id = new.mentorado_id and m.workspace_id = new.workspace_id
  ) then
    raise exception 'mentorado não pertence ao workspace informado';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_mensagem_mentoria_referencias() from public;
revoke all on function public.validar_mensagem_mentoria_referencias() from anon;

create trigger validar_mensagem_mentoria before insert or update of workspace_id, mentorado_id on public.mensagem_mentoria for each row execute function public.validar_mensagem_mentoria_referencias();

alter table public.mensagem_mentoria enable row level security;

create policy "gestao le conversa privada" on public.mensagem_mentoria for select to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));
create policy "mentorado le apenas propria conversa" on public.mensagem_mentoria for select to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual() and not arquivada);
create policy "gestao escreve conversa privada" on public.mensagem_mentoria for insert to authenticated with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor') and autor_id = auth.uid() and direcao = 'gestao_para_mentorado');
create policy "mentorado escreve propria conversa" on public.mensagem_mentoria for insert to authenticated with check (workspace_id = public.workspace_atual() and public.papel_atual() = 'mentorado' and mentorado_id = public.mentorado_atual() and autor_id = auth.uid() and direcao = 'mentorado_para_gestao');
create policy "gestao arquiva conversa privada" on public.mensagem_mentoria for update to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor')) with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

alter table public.contrato add column if not exists visivel_portal boolean not null default false;

create or replace function public.contrato_do_portal()
returns table (
  id uuid,
  mentorado_id uuid,
  matricula_id uuid,
  documento_id uuid,
  assinado_em date,
  vigencia_inicio date,
  vigencia_fim date,
  status public.status_contrato,
  criado_em timestamptz
)
language sql security definer stable set search_path = public as $$
  select c.id, c.mentorado_id, c.matricula_id, c.documento_id, c.assinado_em,
    c.vigencia_inicio, c.vigencia_fim, c.status, c.criado_em
  from public.contrato c
  left join public.documento d on d.id = c.documento_id
  where c.workspace_id = public.workspace_atual()
    and public.papel_atual() = 'mentorado'
    and c.mentorado_id = public.mentorado_atual()
    and c.visivel_portal
    and (c.documento_id is null or (d.visivel_portal and not d.arquivado));
$$;
