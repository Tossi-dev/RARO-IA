do $$ begin
  create type categoria_documento as enum ('contrato', 'anamnese', 'material', 'outro');
exception when duplicate_object then null; end $$;

comment on type categoria_documento is
  'O que o arquivo E, nao onde ele esta: contrato (juridico/financeiro),
   anamnese (o formulario de entrada do mentorado), material (conteudo de
   aula) e outro (o que nao coube — proposta, comprovante, print). A
   categoria decide a pasta no bucket e o filtro da tela.';

create table if not exists public.documento (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid references public.mentorado (id) on delete set null,
  aluno_id uuid references public.alunos (id) on delete set null,
  titulo text not null default '',
  caminho_storage text not null,
  mime text not null default '',
  bytes bigint not null check (bytes > 0),
  categoria categoria_documento not null default 'outro',
  visivel_portal boolean not null default false,
  enviado_por uuid references public.profiles (id) on delete set null,
  criado_em timestamptz not null default now(),
  arquivado boolean not null default false,
  constraint documento_caminho_no_workspace
    check (caminho_storage like workspace_id::text || '/%')
);

comment on column public.documento.visivel_portal is
  'Falso por padrao. E o unico interruptor entre "o mentor anexou" e "o
   mentorado ve": contrato em rascunho e anamnese com anotacao do mentor
   convivem na mesma tabela do material de aula. Publicar e ato explicito;
   esconder nunca precisa ser lembrado.';

comment on column public.documento.arquivado is
  'Substitui o delete (regra da casa: status muda, linha fica). Documento
   arquivado sai da lista padrao E sai do portal pela propria RLS — o
   arquivo no bucket continua onde estava, porque a trilha de que aquele
   contrato existiu vale mais que o espaco que ele ocupa.';

comment on column public.documento.mentorado_id is
  'Nulo quando o documento e do NEGOCIO (contrato de prestacao de servico,
   modelo em branco de anamnese, material da turma inteira). Nulo aqui e
   caso normal, nao erro — e o filtro do portal e fail-closed: NULL nunca
   casa com mentorado_atual().';

comment on column public.documento.bytes is
  'Sem default de propriedade: `default 0` fabricaria o tamanho de um
   arquivo que ninguem mediu, e a soma da tela ("12 documentos, 0 KB")
   viraria numero inventado. Quem grava a linha ja sabe o tamanho porque
   acabou de subir o arquivo. O check recusa 0 e negativo no banco — a
   mesma regra que a validacao de upload aplica na borda.';

comment on column public.documento.caminho_storage is
  'Nome do objeto dentro do bucket privado `documentos`, no formato
   <workspace_id>/<categoria>/<arquivo>. E a chave que amarra o arquivo a
   esta linha nas politicas de storage.objects.';

create unique index if not exists uq_documento_caminho_storage
  on public.documento (caminho_storage);

create index if not exists idx_documento_mentorado on public.documento (mentorado_id);
create index if not exists idx_documento_aluno on public.documento (aluno_id);
create index if not exists idx_documento_criado_em on public.documento (criado_em desc);

alter table public.documento enable row level security;

drop policy if exists "leitura: gestao ve tudo, mentorado so o dele e publicado" on public.documento;
create policy "leitura: gestao ve tudo, mentorado so o dele e publicado" on public.documento
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor')
      or (
        public.papel_atual() = 'mentorado'
        and mentorado_id = public.mentorado_atual()
        and visivel_portal
        and not arquivado
      )
    )
  );

drop policy if exists "escrita da gestao" on public.documento;
create policy "escrita da gestao" on public.documento
  for insert to authenticated
  with check (
    public.papel_atual() in ('dono', 'gestor')
    and workspace_id = public.workspace_atual()
  );

drop policy if exists "update da gestao" on public.documento;
create policy "update da gestao" on public.documento
  for update to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    and workspace_id = public.workspace_atual()
  )
  with check (
    public.papel_atual() in ('dono', 'gestor')
    and workspace_id = public.workspace_atual()
  );

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

drop policy if exists "documentos: leitura da gestao e do proprio mentorado" on storage.objects;
create policy "documentos: leitura da gestao e do proprio mentorado" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documentos'
    and (storage.foldername(name))[1] = public.workspace_atual()::text
    and (
      public.papel_atual() in ('dono', 'gestor')
      or (
        public.papel_atual() = 'mentorado'
        and exists (
          select 1
          from public.documento d
          where d.caminho_storage = storage.objects.name
            and d.workspace_id = public.workspace_atual()
            and d.mentorado_id = public.mentorado_atual()
            and d.visivel_portal
            and not d.arquivado
        )
      )
    )
  );

drop policy if exists "documentos: envio da gestao" on storage.objects;
create policy "documentos: envio da gestao" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and public.papel_atual() in ('dono', 'gestor')
    and (storage.foldername(name))[1] = public.workspace_atual()::text
  );

drop policy if exists "documentos: troca da gestao" on storage.objects;
create policy "documentos: troca da gestao" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'documentos'
    and public.papel_atual() in ('dono', 'gestor')
    and (storage.foldername(name))[1] = public.workspace_atual()::text
  )
  with check (
    bucket_id = 'documentos'
    and public.papel_atual() in ('dono', 'gestor')
    and (storage.foldername(name))[1] = public.workspace_atual()::text
  );

