-- ============================================================
-- 0016 — `diagnostico_lead`: as cinco respostas da landing.
-- Rode APÓS 0015_documento.sql.
--
-- O QUE ESTA TABELA GUARDA
-- ------------------------
-- A landing do Jefson faz cinco perguntas (faturamento, papel, a trava,
-- quantas coisas ficaram pela metade, quando quer começar) e termina em
-- dois lugares AO MESMO TEMPO: uma linha aqui, e uma mensagem de
-- WhatsApp já escrita, com o código no fim. O código é a chave que
-- junta as duas metades depois.
--
-- POR QUE O REGISTRO NASCE ANTES DA MENSAGEM
-- ------------------------------------------
-- Quem responde as cinco perguntas e não aperta o botão do WhatsApp é a
-- maioria — e é justamente o lead sobre quem já se sabe tudo. Gravando
-- só na chegada da mensagem, essa informação some. Gravando aqui
-- primeiro, ela fica: `aluno_id is null` é a lista de quem preencheu e
-- não falou, e o índice parcial existe para achá-la em uma consulta.
--
-- POR QUE `codigo` É A CHAVE PRIMÁRIA
-- -----------------------------------
-- Porque é ele que viaja no texto da mensagem, e é por ele que a junção
-- acontece. Um id uuid separado obrigaria um índice único no código de
-- qualquer forma, e daria duas identidades para a mesma linha.
--
-- ATENÇÃO AO SUFIXO DO CÓDIGO: o formato é `JR-B1-T5-3-K7QM`, e os
-- quatro últimos caracteres são sorteados pela landing. Sem eles, dois
-- donos diferentes com as mesmas cinco respostas produziriam a MESMA
-- chave, e o segundo seria descartado em silêncio pelo `on conflict do
-- nothing` da rota. A versão sem sufixo (`JR-B1-T5-3`) nunca chegou a
-- rodar em produção justamente por isso.
--
-- POR QUE NÃO EXISTE COLUNA `trava_de_trabalho`
-- ---------------------------------------------
-- Ela seria derivada de `trava` + `inacabados` pela regra da porta e do
-- quarto (`src/lib/diagnostico/codigo.ts`). Guardada aqui, a regra
-- passaria a existir em dois lugares — e a versão em SQL envelheceria
-- calada no dia em que a de TypeScript mudasse. Mesmo motivo pelo qual
-- a temperatura do lead é derivada na abertura da ficha e nunca lida de
-- uma coluna: valor calculado e congelado é a mentira mais comum de CRM.
--
-- QUEM ESCREVE AQUI
-- -----------------
-- Ninguém logado. As duas escritas são de máquina: a landing (rota
-- pública `/api/diagnostico`) e a junção no recebimento do WhatsApp,
-- ambas com a chave de serviço, no servidor. Por isso NÃO existe
-- política de insert/update/delete para `authenticated` — a ausência é
-- a regra, não esquecimento.
-- ============================================================

-- Os três enums nascem completos. `alter type ... add value` não roda na
-- mesma transação em que o valor é usado — o mesmo motivo documentado em
-- 0009 e coberto por teste.
do $$ begin
  create type trava_lead as enum ('T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7');
exception when duplicate_object then null; end $$;

do $$ begin
  -- 'F' é faixa de quem NÃO passa no critério (até R$ 1 milhão/ano). Ela mora
  -- no mesmo enum das outras porque é resposta da mesma pergunta.
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
  -- `JR-B1-T5-3-K7QM` para quem passou, `JR-F-K7QM` para quem nao passou.
  codigo         text primary key,
  workspace_id   uuid not null references public.workspace (id)
                 default '00000000-0000-0000-0000-000000000001',

  faturamento    faixa_lead not null,

  -- As quatro colunas abaixo aceitam nulo DE PROPOSITO. Quem responde "ate
  -- R$ 1 milhao" na primeira pergunta e recusado ali mesmo e nunca chega nas
  -- outras. Gravar zero nesses campos seria inventar resposta que ninguem
  -- deu — e depois contar esse zero numa media.
  papel          papel_lead,
  trava          trava_lead,
  inacabados     smallint check (inacabados between 0 and 3),
  urgencia       smallint check (urgencia between 1 and 4),

  -- Calculado NO SERVIDOR a partir de faturamento e papel. O que vem do
  -- browser e resposta, nunca veredito.
  qualificado    boolean not null,

  origem         text not null default '',

  -- A junção. Nulo enquanto a mensagem não chegou — que é o estado normal da
  -- maioria das linhas, não uma pendência.
  aluno_id       uuid references public.alunos (id) on delete set null,
  casado_em      timestamptz,

  criado_em      timestamptz not null default now(),

  -- Lead qualificado tem as cinco respostas, sempre. Esta restrição é o que
  -- impede a ficha de abrir com campo vazio e o atendimento de começar no
  -- escuro: se `qualificado` é verdadeiro, a ficha tem o que mostrar.
  constraint diagnostico_lead_qualificado_completo check (
    not qualificado
    or (papel = 'D' and trava is not null and inacabados is not null and urgencia is not null)
  ),

  -- Casado sem dono, ou dono sem data, seria junção pela metade.
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

-- Achar a lista de quem preencheu e não falou, sem varrer a tabela.
create index if not exists diagnostico_lead_orfao_idx
  on public.diagnostico_lead (criado_em desc) where aluno_id is null;

-- Abrir a ficha do lead e mostrar o diagnóstico dele.
create index if not exists diagnostico_lead_aluno_idx
  on public.diagnostico_lead (aluno_id) where aluno_id is not null;

-- A fila do dia: qualificados, mais urgentes primeiro.
create index if not exists diagnostico_lead_fila_idx
  on public.diagnostico_lead (urgencia, criado_em desc) where qualificado;

alter table public.diagnostico_lead enable row level security;

-- LEITURA: mesma regra das tabelas de CRM em 0009 — dono, gestor e comercial,
-- escopado por workspace. Mentorado e afiliado não veem lead nenhum.
drop policy if exists "leitura: dono, gestor e comercial (diagnostico)" on public.diagnostico_lead;
create policy "leitura: dono, gestor e comercial (diagnostico)" on public.diagnostico_lead for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor', 'comercial')
    and workspace_id = public.workspace_atual()
  );

-- NENHUMA política de insert, update ou delete para `authenticated`.
-- Escrever aqui é papel de máquina (chave de serviço, no servidor), e a
-- ausência de política é o que garante isso: uma tela que tentasse gravar
-- falharia em desenvolvimento, não em produção.
