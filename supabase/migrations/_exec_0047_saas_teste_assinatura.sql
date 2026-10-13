-- 0047 — controle de teste e assinatura do MentorOS como SaaS.
--
-- Esta migration só cria o plano de controle da plataforma. Cada cliente
-- continua isolado no seu workspace; a administração da plataforma não ganha
-- acesso a sessões, clientes, tarefas ou qualquer conteúdo interno.

create table if not exists public.plataforma_administrador (
  usuario_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

create table if not exists public.saas_teste (
  workspace_id uuid primary key references public.workspace (id) on delete cascade,
  workspace_nome text not null default '',
  dono_id uuid not null references auth.users (id) on delete cascade,
  dono_nome text not null default '',
  dono_email text not null default '',
  dono_whatsapp text not null default '',
  consentimento_comercial boolean not null default false,
  iniciado_em timestamptz not null default now(),
  termina_em timestamptz not null,
  status text not null default 'teste' check (status in ('teste', 'ativo', 'bloqueado', 'cancelado')),
  asaas_cliente_id text not null default '',
  asaas_assinatura_id text not null default '',
  asaas_checkout_id text not null default '',
  atualizado_em timestamptz not null default now(),
  check (termina_em > iniciado_em),
  check (dono_whatsapp ~ '^[1-9][0-9]{9,14}$'),
  check (consentimento_comercial)
);

create table if not exists public.saas_evento_pagamento (
  id uuid primary key default gen_random_uuid(),
  provedor text not null check (provedor = 'asaas'),
  evento_externo_id text not null,
  tipo text not null,
  workspace_id uuid references public.workspace (id) on delete set null,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  unique (provedor, evento_externo_id)
);

create index if not exists idx_saas_teste_status_termina on public.saas_teste (status, termina_em);
create index if not exists idx_saas_evento_workspace on public.saas_evento_pagamento (workspace_id, recebido_em desc);

alter table public.plataforma_administrador enable row level security;
alter table public.saas_teste enable row level security;
alter table public.saas_evento_pagamento enable row level security;

-- A função é a única forma de políticas consultarem o papel de plataforma.
-- Ela não revela a lista de administradores a quem não for administrador.
create or replace function public.plataforma_eh_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.plataforma_administrador
    where usuario_id = auth.uid()
  );
$$;

revoke all on function public.plataforma_eh_admin() from public;
grant execute on function public.plataforma_eh_admin() to authenticated;

revoke all on table public.plataforma_administrador from anon, authenticated;
revoke all on table public.saas_evento_pagamento from anon, authenticated;
revoke all on table public.saas_teste from anon;

create policy "saas teste: leitura do próprio workspace ou administração" on public.saas_teste
  for select to authenticated
  using (workspace_id = public.workspace_atual() or public.plataforma_eh_admin());

-- O plano de controle é criado pelo trigger de cadastro e alterado apenas por
-- rotas de servidor com chave de serviço. Nenhum cliente escreve estado,
-- prazo, checkout ou assinatura via PostgREST.
revoke insert, update, delete on table public.saas_teste from authenticated;

-- Todas as políticas de negócio já usam `workspace_atual()`. Ao devolver
-- null para um teste vencido, o mesmo predicado passa a negar leitura e
-- escrita também pelo PostgREST, sem depender apenas do redirecionamento da
-- interface. Workspaces legados (sem linha em saas_teste) permanecem válidos.
create or replace function public.workspace_atual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.workspace_id
  from public.profiles p
  where p.id = auth.uid()
    and not exists (
      select 1
      from public.saas_teste st
      where st.workspace_id = p.workspace_id
        and not (
          st.status = 'ativo'
          or (st.status = 'teste' and st.termina_em > now())
        )
    );
$$;

-- O cadastro SaaS já cria workspace e profile em 0046. Agora ele também abre
-- o teste no servidor, a partir de metadados previamente validados pela ação
-- de cadastro. Papel, workspace, prazo e status continuam decididos aqui.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws uuid;
  nome_workspace text;
  criar_workspace boolean := coalesce(new.raw_user_meta_data ->> 'criar_workspace', 'false') = 'true';
  whatsapp text;
  consentimento boolean;
begin
  if criar_workspace then
    nome_workspace := nullif(
      btrim(left(coalesce(new.raw_user_meta_data ->> 'workspace_nome', ''), 120)),
      ''
    );
    whatsapp := left(btrim(coalesce(new.raw_user_meta_data ->> 'whatsapp', '')), 40);
    consentimento := coalesce(new.raw_user_meta_data ->> 'consentimento_comercial', 'false') = 'true';

    if whatsapp !~ '^[1-9][0-9]{9,14}$' then
      raise exception 'WhatsApp obrigatório inválido para teste SaaS' using errcode = '22023';
    end if;
    if not consentimento then
      raise exception 'Consentimento comercial obrigatório para teste SaaS' using errcode = '22023';
    end if;

    insert into public.workspace (nome)
    values (coalesce(nome_workspace, 'Meu espaço MentorOS'))
    returning id into ws;

    insert into public.profiles (id, nome, papel, workspace_id)
    values (new.id, left(coalesce(new.raw_user_meta_data ->> 'nome', ''), 120), 'dono', ws);

    insert into public.saas_teste (
      workspace_id, workspace_nome, dono_id, dono_nome, dono_email, dono_whatsapp,
      consentimento_comercial, iniciado_em, termina_em, status
    ) values (
      ws, coalesce(nome_workspace, 'Meu espaço MentorOS'), new.id, left(coalesce(new.raw_user_meta_data ->> 'nome', ''), 120),
      left(coalesce(new.email, ''), 320), whatsapp, consentimento,
      now(), now() + interval '7 days', 'teste'
    );
  else
    insert into public.profiles (id, nome, papel, workspace_id)
    values (
      new.id,
      left(coalesce(new.raw_user_meta_data ->> 'nome', ''), 120),
      'mentorado',
      '00000000-0000-0000-0000-000000000001'
    );
  end if;

  return new;
end;
$$;
