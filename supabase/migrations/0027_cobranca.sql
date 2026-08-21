-- ============================================================
-- 0027 — cobrança: o que cada mentorado deve, e o que já pagou
-- ============================================================
--
-- NUMERADA 0027 E NÃO 0023, como o plano da Fase 2 pedia: 0023, 0024, 0025 e
-- 0026 já foram gastas. Sétima vez que este projeto tropeça no número do
-- plano (ver 0017, 0019, 0022, 0023, 0024 e 0025).
--
-- CONVENÇÃO DE ORDEM: em toda política, `workspace_id = workspace_atual()` é
-- a PRIMEIRA condição.
--
-- ============================================================
-- ⚠ O QUE ESTA TABELA NÃO É: UM GATEWAY
-- ============================================================
--
-- Não existe cobrança recorrente automática neste produto, e isso é decisão
-- registrada (§1.3 do plano, e a decisão do dono de adiar o adaptador de Pix
-- automático). O que existe é CONTROLE de recorrência com BAIXA MANUAL: o
-- sistema sabe o que deveria entrar, em que mês e quando vence; quem diz que
-- entrou é uma pessoa, olhando o extrato.
--
-- Nenhuma linha aqui é criada por webhook de gateway, e nenhuma coluna guarda
-- id de transação de terceiro. `movimento_id` aponta para `movimentos_caixa`,
-- que é o extrato do próprio negócio.
--
-- ============================================================
-- O MENTORADO NÃO LÊ A PRÓPRIA COBRANÇA — NESTA FASE
-- ============================================================
--
-- Nenhuma das três políticas menciona `'mentorado'`, e o teste falha se
-- alguém acrescentar. Não é que o dado não seja dele: é que a linha inteira
-- não é. Ela carrega observação interna ("prometeu pagar dia 10, não pagou"),
-- a forma como a baixa foi feita e o vínculo com o movimento de caixa do
-- negócio.
--
-- O dia em que o portal mostrar "sua próxima parcela", o caminho é o mesmo de
-- 0016: uma VIEW com `security_invoker = true` expondo as três colunas que
-- interessam. Afrouxar esta política seria entregar o resto junto.
--
-- `'comercial'` também não entra. Comercial vende; quem cobra é o dono.
--
-- ============================================================
-- A MESMA PARCELA NÃO NASCE DUAS VEZES — E O `null` QUASE DEIXOU
-- ============================================================
--
-- `unique (matricula_id, competencia)` impede gerar agosto duas vezes para a
-- mesma matrícula. Só que, em Postgres, `null` nunca é igual a `null`: para
-- a cobrança AVULSA (sem matrícula), essa restrição não impede nada, em
-- silêncio — que é o pior jeito de não impedir.
--
-- Daí o índice parcial `where matricula_id is null`, que faz o mesmo trabalho
-- para as avulsas usando o mentorado como chave.
--
-- ============================================================
-- PAGA EXIGE BAIXA
-- ============================================================
--
-- Mesma escola do `perda_tem_motivo` de 0024: uma cobrança marcada como paga
-- sem dizer QUANDO e COMO é uma baixa que ninguém consegue conferir depois —
-- e o fechamento do mês não bate. A régua fica no banco porque a tela protege
-- só quem passa por ela.
--
-- ⚠ CONSEQUÊNCIA PARA QUEM ESCREVER A TELA (tarefa 55): dar baixa é UM passo
-- com três campos (data, forma e, se houver, o movimento). Marcar "paga" sem
-- eles volta como erro de constraint.

-- ============================================================
-- Tipos
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_cobranca') then
    create type public.status_cobranca as enum ('prevista', 'aberta', 'paga', 'atrasada', 'cancelada');
  end if;
  if not exists (select 1 from pg_type where typname = 'forma_cobranca') then
    create type public.forma_cobranca as enum ('pix', 'transferencia', 'dinheiro', 'outro');
  end if;
end
$$;

-- ============================================================
-- Tabela
-- ============================================================

create table if not exists public.cobranca (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  mentorado_id uuid not null references public.mentorado (id) on delete cascade,
  -- Sem cascade, de propósito: encerrar uma matrícula não pode apagar o
  -- histórico do que foi cobrado por ela. A cobrança sobrevive à matrícula.
  matricula_id uuid references public.matricula (id) on delete set null,
  -- `competencia` é o MÊS a que a parcela se refere; `vencimento` é o dia em
  -- que ela vence. São coisas diferentes e o produto precisa das duas: a
  -- parcela de agosto pode vencer em setembro.
  competencia date not null default current_date,
  vencimento date not null default current_date,
  valor numeric(14, 2) not null default 0 check (valor >= 0),
  status public.status_cobranca not null default 'prevista',
  -- Nulos até a baixa. Ver o `check` no fim: "paga" sem os dois é recusado.
  pago_em date,
  forma public.forma_cobranca,
  -- O extrato do próprio negócio, não de gateway nenhum — ver o cabeçalho.
  movimento_id uuid references public.movimentos_caixa (id) on delete set null,
  -- Observação INTERNA. É uma das razões de o mentorado não ler esta linha.
  observacao text not null default '',
  criado_em timestamptz not null default now(),
  -- Agosto não nasce duas vezes para a mesma matrícula.
  unique (matricula_id, competencia),
  constraint paga_tem_baixa check (status <> 'paga' or (pago_em is not null and forma is not null))
);

-- O que a restrição acima não cobre: sem matrícula, `null` não colide com
-- `null`. Ver o cabeçalho.
create unique index if not exists uq_cobranca_avulsa
  on public.cobranca (mentorado_id, competencia)
  where matricula_id is null;

create index if not exists idx_cobranca_workspace_status on public.cobranca (workspace_id, status);
create index if not exists idx_cobranca_vencimento on public.cobranca (vencimento);
create index if not exists idx_cobranca_mentorado on public.cobranca (mentorado_id);

alter table public.cobranca enable row level security;

-- ============================================================
-- Políticas — financeiro é do dono
-- ============================================================

drop policy if exists "leitura do financeiro" on public.cobranca;
create policy "leitura do financeiro" on public.cobranca
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "escrita do financeiro" on public.cobranca;
create policy "escrita do financeiro" on public.cobranca
  for insert to authenticated
  with check (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );

drop policy if exists "update do financeiro" on public.cobranca;
create policy "update do financeiro" on public.cobranca
  for update to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor')
  );
