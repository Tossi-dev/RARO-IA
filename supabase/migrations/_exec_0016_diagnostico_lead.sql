-- _exec_0016 — a mesma migracao sem os comentarios longos, para colar no
-- SQL Editor do Supabase. A versao comentada e 0016_diagnostico_lead.sql.

do $$ begin
  create type trava_lead as enum ('T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7');
exception when duplicate_object then null; end $$;

do $$ begin
  create type faixa_lead as enum ('F', 'A', 'B', 'C');
exception when duplicate_object then null; end $$;

do $$ begin
  create type papel_lead as enum ('D', 'G', 'N');
exception when duplicate_object then null; end $$;

comment on type trava_lead is
  'As sete travas da persona (01-persona.md). T3, o ciclo interrompido, e a
   trava do posicionamento: ela e o destino da regra da porta e do quarto.';

comment on type faixa_lead is
  'Faturamento nos ultimos 12 meses. F ate R$ 1 mi (fora do criterio),
   A de 1 a 3 mi, B de 3 a 10 mi (nucleo da persona), C acima de 10 mi.';

comment on type papel_lead is
  'D dono ou socio (unico que passa), G diretor ou gerente (nao decide a
   compra), N ainda vai abrir a empresa.';

create table if not exists public.diagnostico_lead (
  codigo         text primary key,
  workspace_id   uuid not null references public.workspace (id)
                 default '00000000-0000-0000-0000-000000000001',

  faturamento    faixa_lead not null,

  papel          papel_lead,
  trava          trava_lead,
  inacabados     smallint check (inacabados between 0 and 3),
  urgencia       smallint check (urgencia between 1 and 4),

  qualificado    boolean not null,

  origem         text not null default '',

  aluno_id       uuid references public.alunos (id) on delete set null,
  casado_em      timestamptz,

  criado_em      timestamptz not null default now(),

  constraint diagnostico_lead_qualificado_completo check (
    not qualificado
    or (papel = 'D' and trava is not null and inacabados is not null and urgencia is not null)
  ),

  constraint diagnostico_lead_juncao_inteira check (
    (aluno_id is null and casado_em is null) or (aluno_id is not null and casado_em is not null)
  )
);

comment on table public.diagnostico_lead is
  'As cinco respostas do diagnostico da landing. Nasce ANTES da mensagem de
   WhatsApp; o codigo e a chave de juncao. Escrita so por maquina (rota
   publica e juncao no recebimento), leitura por dono/gestor/comercial.';

comment on column public.diagnostico_lead.aluno_id is
  'Nulo = preencheu e nao mandou a mensagem. E a lista mais valiosa do funil,
   nao uma pendencia — o indice parcial diagnostico_lead_orfao_idx existe
   para acha-la.';

create index if not exists diagnostico_lead_orfao_idx
  on public.diagnostico_lead (criado_em desc) where aluno_id is null;

create index if not exists diagnostico_lead_aluno_idx
  on public.diagnostico_lead (aluno_id) where aluno_id is not null;

create index if not exists diagnostico_lead_fila_idx
  on public.diagnostico_lead (urgencia, criado_em desc) where qualificado;

alter table public.diagnostico_lead enable row level security;

drop policy if exists "leitura: dono, gestor e comercial (diagnostico)" on public.diagnostico_lead;
create policy "leitura: dono, gestor e comercial (diagnostico)" on public.diagnostico_lead for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor', 'comercial')
    and workspace_id = public.workspace_atual()
  );
