-- 0041 — consentimento por sessão e arquivo privado para transcrição externa.
-- Migration local: não aplicar no MentorOS sem autorização própria.

create table if not exists public.sessao_transcricao_consentimento (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id),
  mentorado_id uuid not null references public.mentorado (id),
  sessao_id uuid not null references public.sessao (id),
  consentido boolean not null,
  confirmado_por uuid default auth.uid(),
  confirmado_em timestamptz not null default now(),
  unique (workspace_id, sessao_id)
);

create table if not exists public.sessao_transcricao_arquivo (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id),
  mentorado_id uuid not null references public.mentorado (id),
  sessao_id uuid not null references public.sessao (id),
  caminho_storage text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  mime text not null,
  bytes bigint not null check (bytes > 0),
  enviado_por uuid default auth.uid(),
  enviado_em timestamptz not null default now(),
  arquivado boolean not null default false,
  unique (workspace_id, sessao_id),
  unique (caminho_storage),
  check (caminho_storage like workspace_id::text || '/%')
);

create or replace function public.validar_sessao_transcricao_referencias()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.sessao s
    join public.matricula m on m.id = s.matricula_id
    where s.id = new.sessao_id
      and s.workspace_id = new.workspace_id
      and m.workspace_id = new.workspace_id
      and m.mentorado_id = new.mentorado_id
  ) then
    raise exception 'sessao não pertence ao mentorado e workspace informados';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_sessao_transcricao_referencias() from public;
revoke all on function public.validar_sessao_transcricao_referencias() from anon;

create trigger validar_sessao_transcricao_consentimento before insert or update of workspace_id, mentorado_id, sessao_id on public.sessao_transcricao_consentimento for each row execute function public.validar_sessao_transcricao_referencias();
create trigger validar_sessao_transcricao_arquivo before insert or update of workspace_id, mentorado_id, sessao_id on public.sessao_transcricao_arquivo for each row execute function public.validar_sessao_transcricao_referencias();

alter table public.sessao_transcricao_consentimento enable row level security;
alter table public.sessao_transcricao_arquivo enable row level security;

create policy "gestao le consentimento de sessao" on public.sessao_transcricao_consentimento for select to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));
create policy "gestao escreve consentimento de sessao" on public.sessao_transcricao_consentimento for insert to authenticated with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));
create policy "gestao atualiza consentimento de sessao" on public.sessao_transcricao_consentimento for update to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor')) with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));
create policy "gestao le arquivo de sessao" on public.sessao_transcricao_arquivo for select to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));
create policy "gestao escreve arquivo de sessao" on public.sessao_transcricao_arquivo for insert to authenticated with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));
create policy "gestao atualiza arquivo de sessao" on public.sessao_transcricao_arquivo for update to authenticated using (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor')) with check (workspace_id = public.workspace_atual() and public.papel_atual() in ('dono', 'gestor'));

insert into storage.buckets (id, name, public) values ('transcricoes', 'transcricoes', false) on conflict (id) do nothing;

create policy "transcricoes gestao le" on storage.objects for select to authenticated using (bucket_id = 'transcricoes' and (storage.foldername(name))[1] = public.workspace_atual()::text and public.papel_atual() in ('dono', 'gestor'));
create policy "transcricoes gestao envia" on storage.objects for insert to authenticated with check (bucket_id = 'transcricoes' and (storage.foldername(name))[1] = public.workspace_atual()::text and public.papel_atual() in ('dono', 'gestor'));
create policy "transcricoes gestao atualiza" on storage.objects for update to authenticated using (bucket_id = 'transcricoes' and (storage.foldername(name))[1] = public.workspace_atual()::text and public.papel_atual() in ('dono', 'gestor')) with check (bucket_id = 'transcricoes' and (storage.foldername(name))[1] = public.workspace_atual()::text and public.papel_atual() in ('dono', 'gestor'));
