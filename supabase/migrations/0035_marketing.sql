-- 0035 — captura e links rastreados. As tabelas seguem internas; as duas
-- escritas públicas entram somente pelas funções estreitas ao fim do arquivo.

create table if not exists public.captura (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  nome text not null default '',
  email text not null default '',
  telefone text not null default '',
  utm_source text not null default '',
  utm_medium text not null default '',
  utm_campaign text not null default '',
  utm_content text not null default '',
  utm_term text not null default '',
  pagina text not null default '',
  aluno_id uuid references public.alunos (id) on delete set null,
  criado_em timestamptz not null default now()
);

create table if not exists public.link_rastreado (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  codigo text not null unique check (codigo ~ '^[0-9A-Za-z]{8,64}$'),
  destino text not null,
  campanha text not null default '',
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.clique (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  link_id uuid not null references public.link_rastreado (id) on delete cascade,
  quando timestamptz not null default now(),
  referer_host text not null default '',
  agente_hash text not null default '' check (agente_hash ~ '^([0-9a-f]{64})?$')
);

create index if not exists idx_captura_workspace_criada on public.captura (workspace_id, criado_em desc);
create index if not exists idx_link_rastreado_workspace on public.link_rastreado (workspace_id, ativo);
create index if not exists idx_clique_link_quando on public.clique (link_id, quando desc);

alter table public.captura enable row level security;
alter table public.link_rastreado enable row level security;
alter table public.clique enable row level security;

create policy "leitura captura interna" on public.captura
  for select to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor', 'comercial'));

create policy "leitura link rastreado interna" on public.link_rastreado
  for select to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor', 'comercial'));
create policy "insercao link rastreado interna" on public.link_rastreado
  for insert to authenticated with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor', 'comercial'));
create policy "atualizacao link rastreado interna" on public.link_rastreado
  for update to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor', 'comercial')) with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor', 'comercial'));

create policy "leitura clique interna" on public.clique
  for select to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor', 'comercial'));

create or replace function public.registrar_captura(
  p_nome text, p_email text, p_telefone text, p_utm_source text default '', p_utm_medium text default '',
  p_utm_campaign text default '', p_utm_content text default '', p_utm_term text default '', p_pagina text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if btrim(coalesce(p_email, '')) = '' and btrim(coalesce(p_telefone, '')) = '' then return; end if;
  insert into public.captura (nome, email, telefone, utm_source, utm_medium, utm_campaign, utm_content, utm_term, pagina)
  values (left(btrim(coalesce(p_nome, '')), 200), left(btrim(coalesce(p_email, '')), 320), left(btrim(coalesce(p_telefone, '')), 80), left(btrim(coalesce(p_utm_source, '')), 120), left(btrim(coalesce(p_utm_medium, '')), 120), left(btrim(coalesce(p_utm_campaign, '')), 120), left(btrim(coalesce(p_utm_content, '')), 120), left(btrim(coalesce(p_utm_term, '')), 120), left(btrim(coalesce(p_pagina, '')), 500));
end;
$$;

create or replace function public.registrar_clique(p_codigo text, p_referer_host text default '', p_agente_hash text default '')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_link_id uuid; v_workspace_id uuid; v_destino text;
begin
  if coalesce(p_codigo, '') !~ '^[0-9A-Za-z]{8,64}$' then return null; end if;
  select id, workspace_id, destino into v_link_id, v_workspace_id, v_destino from public.link_rastreado where codigo = p_codigo and ativo = true limit 1;
  if v_link_id is null then return null; end if;
  insert into public.clique (workspace_id, link_id, referer_host, agente_hash)
  values (v_workspace_id, v_link_id, left(btrim(coalesce(p_referer_host, '')), 253), case when coalesce(p_agente_hash, '') ~ '^[0-9a-f]{64}$' then p_agente_hash else '' end);
  return v_destino;
end;
$$;

revoke all on function public.registrar_captura(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.registrar_captura(text, text, text, text, text, text, text, text, text) to anon, authenticated;
revoke all on function public.registrar_clique(text, text, text) from public;
grant execute on function public.registrar_clique(text, text, text) to anon, authenticated;
