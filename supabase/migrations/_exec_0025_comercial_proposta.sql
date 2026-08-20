-- _exec_0025 — a mesma migracao com os comentarios removidos, para colar
-- no SQL Editor. A versao completa e 0025_comercial_proposta.sql.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_proposta') then
    create type public.status_proposta as enum ('rascunho', 'enviada', 'aceita', 'recusada', 'expirada');
  end if;
end
$$;

create table if not exists public.script_etapa (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  etapa_id uuid not null references public.funil_etapa (id),
  titulo text not null default '',
  corpo text not null default '',
  ordem int not null default 0 check (ordem >= 0),
  ativa boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.proposta (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  oportunidade_id uuid not null references public.oportunidade (id) on delete cascade,
  token text not null unique check (token ~ '^[0-9A-Za-z]{22,128}$'),
  titulo text not null default '',
  corpo text not null default '',
  valor numeric(14, 2) not null default 0,
  validade date,
  status public.status_proposta not null default 'rascunho',
  criado_em timestamptz not null default now()
);

create table if not exists public.proposta_visita (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  proposta_id uuid not null references public.proposta (id) on delete cascade,
  quando timestamptz not null default now(),
  ip_hash text not null default '' check (ip_hash ~ '^([0-9a-f]{64})?$'),
  agente_hash text not null default '' check (agente_hash ~ '^([0-9a-f]{64})?$')
);

create index if not exists idx_script_etapa_etapa on public.script_etapa (etapa_id, ordem);
create index if not exists idx_proposta_oportunidade on public.proposta (oportunidade_id);
create index if not exists idx_proposta_status on public.proposta (workspace_id, status);
create index if not exists idx_proposta_visita_proposta on public.proposta_visita (proposta_id, quando);

alter table public.script_etapa enable row level security;
alter table public.proposta enable row level security;
alter table public.proposta_visita enable row level security;

drop policy if exists "leitura do time comercial" on public.script_etapa;
create policy "leitura do time comercial" on public.script_etapa
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

drop policy if exists "escrita do time comercial" on public.script_etapa;
create policy "escrita do time comercial" on public.script_etapa
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

drop policy if exists "update do time comercial" on public.script_etapa;
create policy "update do time comercial" on public.script_etapa
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

drop policy if exists "leitura do time comercial" on public.proposta;
create policy "leitura do time comercial" on public.proposta
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

drop policy if exists "escrita do time comercial" on public.proposta;
create policy "escrita do time comercial" on public.proposta
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

drop policy if exists "update do time comercial" on public.proposta;
create policy "update do time comercial" on public.proposta
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

drop policy if exists "leitura do time comercial" on public.proposta_visita;
create policy "leitura do time comercial" on public.proposta_visita
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

create or replace function public.proposta_publica(
  p_token text,
  p_ip_hash text default '',
  p_agente_hash text default ''
)
returns table (titulo text, corpo text, valor numeric, validade date, status public.status_proposta)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_workspace uuid;
begin
  if coalesce(p_token, '') !~ '^[0-9A-Za-z]{22,128}$' then
    return;
  end if;

  select p.id, p.workspace_id
    into v_id, v_workspace
  from public.proposta p
  where p.token = p_token
    and p.status = 'enviada'
    and (p.validade is null or p.validade >= current_date)
  limit 1;

  if v_id is null then
    return;
  end if;

  insert into public.proposta_visita (workspace_id, proposta_id, ip_hash, agente_hash)
  values (
    v_workspace,
    v_id,
    case when coalesce(p_ip_hash, '') ~ '^[0-9a-f]{64}$' then p_ip_hash else '' end,
    case when coalesce(p_agente_hash, '') ~ '^[0-9a-f]{64}$' then p_agente_hash else '' end
  );

  return query
    select p.titulo, p.corpo, p.valor, p.validade, p.status
    from public.proposta p
    where p.id = v_id;
end;
$$;

comment on function public.proposta_publica is
  'Leitura PUBLICA de proposta por token, e registro da visita. Segunda das
   duas funcoes do projeto com grant para anon (a outra e
   verificar_certificado). Devolve cinco colunas e nada alem delas: titulo,
   corpo, valor, validade e status. Igualdade exata no token, formato
   conferido antes da consulta, so status enviada e dentro da validade.
   proposta_visita guarda HASH de IP e de agente, nunca o valor cru.';

comment on function public.verificar_certificado is
  'Verificacao PUBLICA de certificado por codigo. Uma das DUAS funcoes do
   projeto com grant para anon (a outra e proposta_publica, de 0025), e de
   proposito: certificado que so o emissor confere nao e certificado.
   Igualdade exata no codigo (nunca like), formato conferido antes da
   consulta, retorno fechado em nome/trilha/data (sem id, sem workspace, sem
   e-mail, sem telefone) e limit 1.';

revoke all on function public.proposta_publica(text, text, text) from public;
grant execute on function public.proposta_publica(text, text, text) to anon, authenticated;
