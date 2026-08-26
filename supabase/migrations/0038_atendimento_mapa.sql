-- 0038 — mapa voluntário, consentimento e trilha de acesso do atendimento.
-- Migration local: não foi aplicada a nenhum projeto Supabase.

create table if not exists public.atendimento_mapa (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id),
  dimensao text not null check (dimensao in ('espiritual', 'familia_parentes', 'casamento_conjuge', 'filhos', 'social', 'saude', 'servir', 'intelectual', 'financeiro', 'profissional', 'emocional')),
  nota smallint check (nota between 0 and 10),
  dor text,
  medo text,
  objetivo text,
  registrado_em timestamptz not null default now()
);

create table if not exists public.atendimento_consentimento (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id),
  categoria text not null check (categoria in ('mapa', 'reflexao', 'meta', 'transcricao', 'portal')),
  consentido boolean not null,
  atualizado_em timestamptz not null default now(),
  unique (workspace_id, mentorado_id, categoria)
);

create table if not exists public.atendimento_evento_acesso (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id),
  categoria text not null check (categoria in ('mapa', 'reflexao', 'meta', 'transcricao', 'portal')),
  acao text not null check (acao in ('leitura', 'escrita', 'consentimento_alterado', 'projecao_portal')),
  ator_id uuid default auth.uid(),
  ocorrido_em timestamptz not null default now()
);

create index if not exists idx_atendimento_mapa_workspace_cliente on public.atendimento_mapa (workspace_id, mentorado_id, registrado_em desc);
create index if not exists idx_atendimento_evento_acesso_workspace_cliente on public.atendimento_evento_acesso (workspace_id, mentorado_id, ocorrido_em desc);

create or replace function public.validar_referencias_atendimento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.mentorado
    where id = new.mentorado_id and workspace_id = new.workspace_id
  ) then
    raise exception 'mentorado não pertence ao workspace informado';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_referencias_atendimento() from public;
revoke all on function public.validar_referencias_atendimento() from anon;

create trigger validar_referencias_atendimento_mapa before insert or update of workspace_id, mentorado_id on public.atendimento_mapa for each row execute function public.validar_referencias_atendimento();
create trigger validar_referencias_atendimento_consentimento before insert or update of workspace_id, mentorado_id on public.atendimento_consentimento for each row execute function public.validar_referencias_atendimento();
create trigger validar_referencias_atendimento_evento before insert or update of workspace_id, mentorado_id on public.atendimento_evento_acesso for each row execute function public.validar_referencias_atendimento();

alter table public.atendimento_mapa enable row level security;
alter table public.atendimento_consentimento enable row level security;
alter table public.atendimento_evento_acesso enable row level security;

create policy "leitura mapa atendimento interna" on public.atendimento_mapa for select to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "escrita mapa atendimento interna" on public.atendimento_mapa for insert to authenticated with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "atualizacao mapa atendimento interna" on public.atendimento_mapa for update to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor')) with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "leitura consentimento atendimento interna" on public.atendimento_consentimento for select to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "escrita consentimento atendimento interna" on public.atendimento_consentimento for insert to authenticated with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "atualizacao consentimento atendimento interna" on public.atendimento_consentimento for update to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor')) with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "leitura eventos atendimento interna" on public.atendimento_evento_acesso for select to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

create policy "escrita eventos atendimento interna" on public.atendimento_evento_acesso for insert to authenticated with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));
