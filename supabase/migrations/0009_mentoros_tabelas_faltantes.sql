-- ============================================================
-- 0009 — as oito tabelas da planilha que nunca ganharam migração.
-- Rode APÓS 0008_mentoros_rls_correcoes.sql.
--
-- src/lib/data/supabase-db.ts (provider Supabase) consulta 41 tabelas.
-- Oito delas só existem como aba da planilha Google — nunca foram
-- criadas em migração nenhuma:
--
--   agrupamentos · aulas · encontros · envios · importacoes ·
--   interacoes · modulos · progresso_aulas
--
-- Sem elas no Postgres, a migração dos dados da planilha não tem para
-- onde escrever, e o provider quebra em runtime com "relation does
-- not exist" (42P01) — erro que o build do TypeScript nunca pega,
-- porque `.from("agrupamentos")` é uma string comum, não um tipo.
-- (`okOuVazia`, em supabase-db.ts, já engoliria esse 42P01 na LEITURA
-- de algumas dessas tabelas — mas nenhuma ESCRITA usa `okOuVazia`, e a
-- migração dos dados da planilha é, por definição, só escrita.)
--
-- Cada coluna abaixo foi tirada de três lugares, e os três batiam
-- (sem divergência a resolver):
--   1) o `map<Coisa>` de cada tabela em supabase-db.ts (nome exato de
--      coluna, o que é `?? ""`/`?? 0` opcional vs. obrigatório);
--   2) o tipo de domínio equivalente em src/lib/types.ts;
--   3) a aba equivalente em src/lib/sheets/abas.ts (título de coluna,
--      papel — todas as oito são `papel: "entrada", origem: "sistema"`).
--
-- RLS aqui já nasce no formato FINAL pós-auditoria (workspace_id +
-- papel_atual() + workspace_atual() em toda política, como 0008
-- deixou o resto do banco) — não faz sentido nascer com o
-- `using (true)` que 0001-0006 tinham e 0007/0008 depois teve que
-- corrigir a fio. Classificação (mesmo raciocínio de 0007/0008):
--
--   · FINANCEIRO (só dono/gestor) — importacoes: é o livro-razão de
--     importação de extrato bancário, mesma sensibilidade de
--     movimentos_caixa/recebiveis/pagaveis.
--   · CRM/pipeline (dono/gestor/comercial) — interacoes, envios,
--     modulos, aulas, encontros, agrupamentos. Conversa de WhatsApp
--     com lead É pipeline (interacoes/envios); módulo/aula/encontro
--     são a trilha do produto que o comercial promete na venda;
--     agrupamento é cadastro auxiliar do mesmo nível de sensibilidade.
--   · FECHADO (só dono/gestor, sem 'mentorado') — progresso_aulas.
--     É progresso por ALUNO (tabela public.alunos, o CRM de vendas),
--     não por MENTORADO (public.mentorado, o pós-venda do MentorOS —
--     ver 0006). RLS de portal (mentorado_atual()) só sabe amarrar
--     dado a mentorado_id; não existe hoje caminho limpo de
--     aluno_id → mentorado_id para o mentorado logado filtrar só o
--     que é dele. Isso é DELIBERADO, não esquecimento — muda no dia
--     em que o Portal do Mentorado ganhar essa ponte (aluno ↔
--     mentorado já existe via mentorado.aluno_id, mas o inverso —
--     "que mentorado é este aluno" — ainda não tem índice nem regra
--     de unicidade que garanta resposta única).
-- ============================================================

-- ============================================================
-- Enums novos. Um deles (importacoes.tipo, mais abaixo) REUSA um enum
-- já existente em vez de criar um duplicado com os mesmos valores.
-- ============================================================

do $$ begin
  create type tipo_aula as enum ('video', 'texto', 'ao_vivo', 'tarefa');
exception when duplicate_object then null; end $$;

do $$ begin
  create type direcao_mensagem as enum ('recebida', 'enviada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type status_envio as enum ('aprovado', 'enviado', 'falhou');
exception when duplicate_object then null; end $$;

do $$ begin
  create type origem_extrato as enum ('ofx', 'csv', 'texto');
exception when duplicate_object then null; end $$;

comment on type origem_extrato is
  'De qual formato o extrato bancário foi lido (src/lib/extrato/extrato.ts,
   OrigemExtrato). Não confundir com origem_movimento (0004) — aquele é
   "de que TIPO DE FATO NEGOCIAL veio o lançamento" (venda, despesa...);
   este é "de que FORMATO DE ARQUIVO veio a linha importada".';

-- ---------- agrupamentos ----------
-- Cadastro OPCIONAL do usuário (ex.: "corpo"/"mente"/"espirito" no demo,
-- ou linha de produto/unidade/marca — qualquer nome que fizer sentido).
-- Sem nenhuma linha aqui, a seção "por agrupamento" simplesmente não
-- aparece no painel (ver Braco em types.ts: dívida de engenharia
-- registrada — o campo `braco` nas outras tabelas guarda o id de um
-- agrupamento como este, texto livre, não union fixa).
create table if not exists public.agrupamentos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  nome text not null,
  cor text not null default '',
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create index if not exists idx_agrupamentos_ordem on public.agrupamentos (ordem);

-- ---------- modulos ----------
-- Bloco de conteúdo do produto — a "trilha" antes de virar aula avulsa.
create table if not exists public.modulos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  produto_id uuid not null references public.produtos (id) on delete cascade,
  nome text not null default '',
  ordem int not null default 0,
  descricao text not null default '',
  criado_em timestamptz not null default now()
);

create index if not exists idx_modulos_produto_ordem on public.modulos (produto_id, ordem);

-- ---------- aulas ----------
-- Item consumível dentro de um módulo. produto_id é DESNORMALIZADO de
-- propósito (mesmo comentário do tipo Aula em types.ts): evita um join
-- módulo→produto toda vez que o painel soma progresso por produto.
-- Cascade em modulo_id E em produto_id: apagar o produto apaga a aula
-- pelos dois caminhos (via módulo e direto), sem erro — Postgres não
-- se importa que a mesma linha seja alvo de mais de um ON DELETE
-- CASCADE na mesma transação.
create table if not exists public.aulas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  modulo_id uuid not null references public.modulos (id) on delete cascade,
  produto_id uuid not null references public.produtos (id) on delete cascade,
  titulo text not null default '',
  ordem int not null default 0,
  duracao_min int not null default 0,
  tipo tipo_aula not null default 'video',
  criado_em timestamptz not null default now()
);

create index if not exists idx_aulas_modulo_ordem on public.aulas (modulo_id, ordem);

-- ---------- progresso_aulas ----------
-- Marca de consumo do aluno numa aula — uma linha por aluno por aula
-- (abas.ts é explícito sobre isso), base das métricas de engajamento/
-- conclusão da trilha. produto_id também desnormalizado, mesmo motivo
-- de aulas.produto_id (soma de progresso por produto sem join extra).
create table if not exists public.progresso_aulas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  aluno_id uuid not null references public.alunos (id) on delete cascade,
  aula_id uuid not null references public.aulas (id) on delete cascade,
  produto_id uuid not null references public.produtos (id) on delete cascade,
  concluida boolean not null default false,
  concluida_em timestamptz,
  minutos_assistidos int not null default 0,
  criado_em timestamptz not null default now(),
  unique (aluno_id, aula_id)
);

create index if not exists idx_progresso_aulas_aluno on public.progresso_aulas (aluno_id);
create index if not exists idx_progresso_aulas_aula on public.progresso_aulas (aula_id);

comment on table public.progresso_aulas is
  'Grupo RLS FECHADO (só dono/gestor) — ver cabeçalho do arquivo. Não é
   esquecimento: é progresso por public.alunos (CRM), e o portal do
   mentorado (public.mentorado, 0006/0007) não tem hoje um caminho
   confiável de aluno_id para "que mentorado é este aluno" que dê para
   usar num using() de RLS. Revisitar quando o Portal do Mentorado
   ganhar essa ponte.';

-- ---------- encontros ----------
-- Sessão ao vivo de uma turma (aula ao vivo, mentoria em grupo etc.),
-- com lista de presença. `presentes` é array de id de aluno — a única
-- coluna multivalorada desta migração (mapEncontro, em supabase-db.ts,
-- lê `Array.isArray(r.presentes) ? r.presentes.map(String) : []`).
-- Postgres não tem FK nativa para elemento de array, então a
-- integridade referencial de cada entrada de `presentes` fica por
-- conta da aplicação, como já era na planilha.
create table if not exists public.encontros (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  turma_id uuid not null references public.turmas (id) on delete cascade,
  titulo text not null default '',
  data timestamptz not null,
  presentes uuid[] not null default '{}',
  criado_em timestamptz not null default now()
);

create index if not exists idx_encontros_turma on public.encontros (turma_id);
create index if not exists idx_encontros_data on public.encontros (data);

-- ---------- importacoes ----------
-- Livro-razão da importação de extrato bancário: uma linha por
-- lançamento já importado, para impedir reimportar o mesmo lançamento
-- quando o dono reenvia um extrato que se sobrepõe ao anterior (uso
-- NORMAL, não hipótese — mesma classe de garantia de id_externo em
-- interacoes, só que a chave aqui é `impressao_digital`).
-- `tipo` REUSA o enum direcao_caixa (0004: 'entrada'/'saida') em vez
-- de criar um enum novo com os mesmos dois valores — é literalmente o
-- mesmo domínio (LinhaExtrato.tipo, em extrato.ts, é "entrada"|"saida").
create table if not exists public.importacoes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  impressao_digital text not null,
  data date not null,
  descricao text not null default '',
  valor numeric(12,2) not null default 0,
  tipo direcao_caixa not null,
  documento text not null default '',
  origem origem_extrato not null,
  conta_id uuid references public.contas_bancarias (id) on delete set null,
  movimento_id uuid references public.movimentos_caixa (id) on delete set null,
  importado_em timestamptz not null default now()
);

-- unique em impressao_digital: o app (importarExtrato, em
-- supabase-db.ts) já lê tudo e filtra em memória antes de inserir, mas
-- essa checagem não é atômica — duas chamadas concorrentes de
-- importação poderiam passar pelo filtro ao mesmo tempo e inserir a
-- mesma digital duas vezes. O índice único é o que faz o Postgres, não
-- a aplicação, ser a fonte de verdade contra duplicidade.
create unique index if not exists uq_importacoes_impressao_digital
  on public.importacoes (impressao_digital);

create index if not exists idx_importacoes_data on public.importacoes (data desc);

-- conta_id/movimento_id em ON DELETE SET NULL, não CASCADE: importacoes
-- é trilha de AUDITORIA ("isto já foi trazido para dentro do sistema"),
-- não um filho que só faz sentido junto da conta/movimento. Apagar uma
-- conta bancária ou um movimento não deveria apagar a prova de que um
-- lançamento já foi importado — isso reabriria a porta para reimportar
-- o mesmo lançamento depois.

-- ---------- interacoes ----------
-- Uma linha por mensagem de WhatsApp trocada com um cliente. `id_externo`
-- é o identificador que o próprio WhatsApp deu à mensagem — é ele que
-- impede a mesma mensagem de virar duas interações quando o agente
-- local reconecta e reenvia o histórico. Isto é um cenário GARANTIDO
-- neste produto (o notebook do dono fica fechado por horas), não
-- hipótese — ver atendimento/contrato.ts e atendimento/recepcao.ts.
--
-- `paraMensagemValidada` (contrato.ts) já rejeita idExterno vazio antes
-- de a mensagem chegar perto de um insert nesta tabela — na prática
-- id_externo nunca é "" aqui. Ainda assim o índice único é PARCIAL
-- (`where id_externo <> ''`), não um `unique` puro na coluna: é a
-- mesma cautela pedida no enunciado — se um dia entrar um canal novo
-- (Instagram Direct, Telegram — contrato.ts já fala nisso) que não dê
-- essa garantia na origem, múltiplas linhas com id_externo vazio não
-- podem quebrar o INSERT por violação de unicidade.
create table if not exists public.interacoes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  aluno_id uuid not null references public.alunos (id) on delete cascade,
  -- Texto livre (não enum: CanalAtendimento hoje só tem 'whatsapp', mas
  -- o próprio contrato.ts documenta que Instagram Direct/Telegram
  -- entram pelo mesmo lugar em breve — um enum de um valor só empurraria
  -- essa expansão para outra migração de tipo depois).
  canal text not null default 'whatsapp',
  direcao direcao_mensagem not null,
  texto text not null default '',
  quando timestamptz not null,
  id_externo text not null,
  tipo_midia text not null default '',
  nome_exibicao text not null default '',
  telefone text not null default '',
  criado_em timestamptz not null default now()
);

create index if not exists idx_interacoes_aluno_quando on public.interacoes (aluno_id, quando desc);

create unique index if not exists uq_interacoes_id_externo
  on public.interacoes (id_externo)
  where id_externo <> '';

-- ---------- envios ----------
-- Fila de mensagens de saída, uma linha por mensagem. `status`
-- 'aprovado' é o ÚNICO estado que o agente local recebe — uma linha
-- sem aprovação humana (autorizado_por/autorizado_em) nunca é lida
-- pela fila (ver listEnviosPendentes em supabase-db.ts, filtro
-- `eq("status","aprovado")`). `id_externo` aqui NÃO é único: começa
-- vazio ("") em toda linha recém-aprovada e só é preenchido depois do
-- envio — várias linhas com id_externo = '' simultâneas são o estado
-- normal da fila, não duplicidade.
create table if not exists public.envios (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  aluno_id uuid not null references public.alunos (id) on delete cascade,
  telefone text not null default '',
  texto text not null default '',
  autorizado_por text not null default '',
  autorizado_em timestamptz not null default now(),
  status status_envio not null default 'aprovado',
  enviado_em timestamptz,
  id_externo text not null default '',
  erro text not null default '',
  criado_em timestamptz not null default now()
);

create index if not exists idx_envios_status on public.envios (status);
create index if not exists idx_envios_aluno on public.envios (aluno_id);

-- ============================================================
-- RLS — já no formato final pós-0008 (workspace_id sempre escopado).
-- Nenhuma dessas oito tabelas passa pelo estado intermediário
-- "using (true)" que 0001-0006 tinham: elas nascem hoje, depois da
-- auditoria que corrigiu esse padrão em 0008, então não faz sentido
-- reintroduzir o problema para corrigir de novo depois.
-- ============================================================

-- ---------- grupo FINANCEIRO: só dono e gestor (leitura e escrita) ----------
do $$
declare t text;
begin
  foreach t in array array['importacoes']
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "leitura: apenas dono e gestor (financeiro/negocio)" on public.%I', t);
    execute format(
      'create policy "leitura: apenas dono e gestor (financeiro/negocio)" on public.%I for select to authenticated using (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual())', t);

    execute format('drop policy if exists "escrita da gestao" on public.%I', t);
    execute format(
      'create policy "escrita da gestao" on public.%I for insert to authenticated with check (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual())', t);

    execute format('drop policy if exists "update da gestao" on public.%I', t);
    execute format(
      'create policy "update da gestao" on public.%I for update to authenticated using (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual()) with check (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual())', t);

    execute format('drop policy if exists "delete da gestao" on public.%I', t);
    execute format(
      'create policy "delete da gestao" on public.%I for delete to authenticated using (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual())', t);
  end loop;
end $$;

-- ---------- grupo CRM/pipeline: dono, gestor e comercial leem; escrita continua só dono/gestor ----------
do $$
declare t text;
begin
  foreach t in array array[
    'interacoes','envios','modulos','aulas','encontros','agrupamentos'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists "leitura: dono, gestor e comercial (crm/pipeline)" on public.%I', t);
    execute format(
      'create policy "leitura: dono, gestor e comercial (crm/pipeline)" on public.%I for select to authenticated using (public.papel_atual() in (''dono'',''gestor'',''comercial'') and workspace_id = public.workspace_atual())', t);

    execute format('drop policy if exists "escrita da gestao" on public.%I', t);
    execute format(
      'create policy "escrita da gestao" on public.%I for insert to authenticated with check (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual())', t);

    execute format('drop policy if exists "update da gestao" on public.%I', t);
    execute format(
      'create policy "update da gestao" on public.%I for update to authenticated using (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual()) with check (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual())', t);

    execute format('drop policy if exists "delete da gestao" on public.%I', t);
    execute format(
      'create policy "delete da gestao" on public.%I for delete to authenticated using (public.papel_atual() in (''dono'',''gestor'') and workspace_id = public.workspace_atual())', t);
  end loop;
end $$;

-- ---------- grupo FECHADO: progresso_aulas — só dono e gestor, sem papel 'mentorado' ----------
-- Escrito explícito (não em loop), pelo mesmo motivo dos grupos 1/3 em
-- 0007/0008: é a tabela cuja política mais precisa ficar fácil de
-- grepar por quem herdar este banco e perguntar "por que o mentorado
-- não lê o próprio progresso?" — a resposta mora no comment on table
-- acima, não só aqui.
alter table public.progresso_aulas enable row level security;

drop policy if exists "leitura: apenas dono e gestor (sem portal ainda)" on public.progresso_aulas;
create policy "leitura: apenas dono e gestor (sem portal ainda)" on public.progresso_aulas
  for select to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    and workspace_id = public.workspace_atual()
  );

drop policy if exists "escrita da gestao" on public.progresso_aulas;
create policy "escrita da gestao" on public.progresso_aulas
  for insert to authenticated
  with check (
    public.papel_atual() in ('dono', 'gestor')
    and workspace_id = public.workspace_atual()
  );

drop policy if exists "update da gestao" on public.progresso_aulas;
create policy "update da gestao" on public.progresso_aulas
  for update to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    and workspace_id = public.workspace_atual()
  )
  with check (
    public.papel_atual() in ('dono', 'gestor')
    and workspace_id = public.workspace_atual()
  );

drop policy if exists "delete da gestao" on public.progresso_aulas;
create policy "delete da gestao" on public.progresso_aulas
  for delete to authenticated
  using (
    public.papel_atual() in ('dono', 'gestor')
    and workspace_id = public.workspace_atual()
  );
