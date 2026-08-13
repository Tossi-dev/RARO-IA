-- ============================================================
-- 0015 — a tabela `documento`: contrato, anamnese e material.
-- Rode APÓS 0014_jornada_estagios.sql.
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- ----------------------------
-- Três módulos diferentes pedem a mesma coisa e nenhum tem onde guardar:
-- o CRM anexa a proposta e o contrato do lead, o financeiro precisa do
-- contrato assinado para cobrar, e o onboarding do mentorado começa por
-- uma anamnese preenchida. Fossem três tabelas, seriam três RLS para
-- errar e três telas de upload para manter. É uma tabela só, com uma
-- coluna dizendo o que o arquivo é (`categoria`) e outra dizendo se o
-- mentorado pode vê-lo (`visivel_portal`).
--
-- O DOCUMENTO PODE NÃO SER DE NINGUÉM
-- -----------------------------------
-- `mentorado_id` e `aluno_id` aceitam nulo, de propósito: o contrato de
-- prestação de serviço do PRÓPRIO negócio, o modelo em branco da
-- anamnese e o material que vale para a turma inteira não pertencem a
-- uma pessoa. Obrigar um dono para essas linhas forçaria a inventar um
-- mentorado fantasma — e dado inventado é exatamente o que a casa não
-- aceita. As duas colunas são independentes: um documento pode estar
-- ligado ao mentorado (pós-venda) e ao aluno (funil), aos dois, ou a
-- nenhum.
--
-- POR QUE `visivel_portal` NASCE FALSO
-- ------------------------------------
-- Esta é a primeira tabela em que ser dono da linha NÃO basta para ler.
-- Contrato em rascunho, anamnese com anotação clínica do mentor e
-- proposta com desconto que não foi aprovado moram na mesma tabela do
-- PDF da aula. Se `visivel_portal` nascesse `true`, todo arquivo
-- anexado apareceria no portal no instante do upload, e liberar viraria
-- a decisão de ESCONDER — o inverso do combinado. Publicar é um ato
-- explícito do mentor (`alternarVisivelPortal`), e até ele acontecer o
-- mentorado não vê nem que o arquivo existe.
--
-- NUNCA APAGAR
-- ------------
-- Não existe política de `delete` aqui — nem na tabela, nem no bucket.
-- Retirar um documento de circulação é `update arquivado = true`: a
-- linha fica, o arquivo fica, e o histórico continua contando que aquele
-- contrato existiu. `arquivado` também entra no filtro de leitura do
-- mentorado, porque a regra da casa é que a garantia mora na RLS e não
-- no `if` da tela: sem isso, o documento sumido da tela continuaria
-- baixável por um GET direto no PostgREST.
--
-- O ARQUIVO NÃO MORA AQUI
-- -----------------------
-- Esta tabela guarda METADADO. O arquivo vai para o bucket privado
-- `documentos` do Supabase Storage, e RLS de tabela não protege objeto
-- de bucket: sem política equivalente em `storage.objects`, quem tem a
-- anon key (pública, embutida no bundle) baixa o PDF do contrato pela
-- URL do Storage sem nunca tocar em `public.documento`. Por isso a
-- regra é escrita DUAS vezes, uma em cada lugar — e o teste de forma
-- (src/lib/supabase/migracoes.test.ts) confere as duas.
--
-- O caminho do objeto começa pelo workspace (`<workspace_id>/<categoria>/
-- <arquivo>`), e é essa primeira pasta que TODA política do bucket
-- confere, na leitura como na escrita: `storage.objects` não tem coluna
-- `workspace_id` para escopar como o resto do banco faz. Na leitura vem
-- ainda uma segunda amarra para o mentorado — casar o objeto com a linha
-- de `public.documento` que o descreve. A tabela, do seu lado, obriga
-- `caminho_storage` a começar pela pasta do próprio workspace
-- (`documento_caminho_no_workspace`): sem isso o caminho é texto livre e
-- a linha de um inquilino pode apontar para o arquivo de outro.
--
-- Se o `create policy ... on storage.objects` recusar por permissão no
-- SQL Editor, rode este arquivo como `postgres` (dono do projeto): as
-- políticas do Storage pertencem a `supabase_storage_admin` e, em
-- projetos antigos, só o papel dono consegue criá-las.
-- ============================================================

-- ---------- enum de categoria ----------
-- Quatro valores, e não texto livre: a categoria decide a pasta no
-- Storage e é o que a tela filtra. Texto livre viraria 'Contrato',
-- 'contratos' e 'CONTRATO' na mesma base em uma semana. Criado no
-- formato idempotente de 0006/0009/0010 — `alter type ... add value`
-- não pode ser usado na mesma transação que cria o tipo, então valor
-- novo é assunto de migração nova.
do $$ begin
  create type categoria_documento as enum ('contrato', 'anamnese', 'material', 'outro');
exception when duplicate_object then null; end $$;

comment on type categoria_documento is
  'O que o arquivo E, nao onde ele esta: contrato (juridico/financeiro),
   anamnese (o formulario de entrada do mentorado), material (conteudo de
   aula) e outro (o que nao coube — proposta, comprovante, print). A
   categoria decide a pasta no bucket e o filtro da tela.';

-- ---------- documento ----------
-- `caminho_storage` é o nome do objeto dentro do bucket `documentos` —
-- é por ele que a política do Storage amarra o arquivo à linha que o
-- descreve, então ele é obrigatório e único.
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
  -- O caminho é texto livre, e texto livre atravessa inquilino: sem esta
  -- trava, a gestão do workspace A grava uma linha DE A (o `with check`
  -- do insert só confere `workspace_id`) apontando para a pasta do
  -- workspace B e a marca como visível; o mentorado de A pede o objeto,
  -- a política do Storage acha a linha (dele, publicada, não arquivada)
  -- e entrega um arquivo que nem o gestor de A conseguiria abrir.
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

-- Uma linha por objeto: sem isso, duas linhas poderiam descrever o mesmo
-- arquivo com `visivel_portal` diferente, e a política do Storage (que
-- procura QUALQUER linha casando o caminho) passaria a valer pela mais
-- permissiva das duas — vazamento por duplicata, sem erro nenhum na tela.
create unique index if not exists uq_documento_caminho_storage
  on public.documento (caminho_storage);

create index if not exists idx_documento_mentorado on public.documento (mentorado_id);
create index if not exists idx_documento_aluno on public.documento (aluno_id);
create index if not exists idx_documento_criado_em on public.documento (criado_em desc);

-- ============================================================
-- RLS da tabela — já no formato final pós-0008 (workspace_id sempre
-- escopado, papel_atual() decidindo quem lê).
-- ============================================================

alter table public.documento enable row level security;

-- Leitura. A gestão lê tudo do próprio workspace; o mentorado lê SÓ o
-- que é dele E foi publicado E não foi arquivado. As três condições
-- estão no `using`, não no nome da política — o nome não filtra nada.
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

-- Escrita: só dono e gestor. 'comercial' fica de fora de propósito —
-- contrato e anamnese são dado do pós-venda e do jurídico, e quem vende
-- não precisa anexar nem alterar nenhum dos dois.
drop policy if exists "escrita da gestao" on public.documento;
create policy "escrita da gestao" on public.documento
  for insert to authenticated
  with check (
    public.papel_atual() in ('dono', 'gestor')
    and workspace_id = public.workspace_atual()
  );

-- O update é o que arquiva e o que publica/despublica no portal. Os dois
-- lados (using e with check) escopados por workspace: sem o with check,
-- um update poderia mudar o `workspace_id` da linha e mandá-la para
-- outro workspace no mesmo comando.
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

-- Sem política de delete, de propósito — ver o cabeçalho. Arquivar é
-- update de `arquivado`.

-- ============================================================
-- Storage: o bucket privado e as políticas equivalentes.
-- ============================================================

-- Privado (public = false): num bucket público a URL do objeto dispensa
-- login, e nenhuma política adiantaria. O `on conflict do nothing` é o
-- que faz este arquivo aguentar ser colado duas vezes no SQL Editor —
-- acidente comum, e é para isso que existe o par `_exec_`.
insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

-- Leitura do arquivo. O escopo do workspace vem PRIMEIRO e vale para
-- todo papel: dentro do ramo da gestão ele não protegeria o ramo do
-- mentorado, e é pelo mentorado que um caminho apontando para a pasta de
-- outro inquilino seria entregue. Depois da pasta: a gestão lê o que
-- estiver ali; o mentorado só abre o objeto que tem uma linha em
-- `public.documento` dizendo que é dele, publicado e não arquivado — a
-- mesma regra da tabela, escrita de novo porque o Storage é outro
-- caminho de acesso, não o mesmo.
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

-- Envio do arquivo. Acontece ANTES de a linha existir (a linha só é
-- gravada depois do upload dar certo, para não sobrar metadado órfão),
-- então aqui não dá para casar com `public.documento` — o escopo é a
-- primeira pasta do caminho, que é o workspace de quem envia.
drop policy if exists "documentos: envio da gestao" on storage.objects;
create policy "documentos: envio da gestao" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documentos'
    and public.papel_atual() in ('dono', 'gestor')
    and (storage.foldername(name))[1] = public.workspace_atual()::text
  );

-- Substituir um objeto existente é escrita de gestão pelo mesmo motivo,
-- e o `with check` impede mover o objeto para a pasta de outro workspace.
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

-- Sem política de delete no bucket: arquivar não apaga arquivo. Um
-- documento arquivado some da lista e do portal, mas o objeto continua
-- lá — é a prova de que aquele contrato existiu.
