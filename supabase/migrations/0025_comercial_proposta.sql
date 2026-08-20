-- ============================================================
-- 0025 — scripts de etapa, propostas e a leitura pública por token
-- ============================================================
--
-- NUMERADA 0025 E NÃO 0022, como o plano da Fase 2 pedia: 0022 foi gasta pelo
-- feed. Sexta vez que este projeto tropeça no número do plano (ver 0017, 0019,
-- 0022, 0023 e 0024).
--
-- CONVENÇÃO DE ORDEM: em toda política, `workspace_id = workspace_atual()` é a
-- PRIMEIRA condição.
--
-- ============================================================
-- A SEGUNDA PORTA PARA `anon` — E A ÚLTIMA
-- ============================================================
--
-- Até hoje este banco tinha UMA função ao alcance de quem não fez login:
-- `verificar_certificado` (0021), que devolve nome, trilha e data. Esta
-- migração abre a segunda, e ela é mais perigosa, porque o que está do outro
-- lado é uma PROPOSTA COMERCIAL — título, corpo e valor — pendurada num token
-- que viaja por WhatsApp, e-mail e captura de tela.
--
-- Abrir era inevitável: proposta que exige login não é proposta, é formulário
-- de cadastro. O que dá para escolher é a LARGURA da porta, e ela é escolhida
-- em quatro lugares:
--
--   1) a leitura pública NÃO é política de RLS. `proposta` não tem política
--      para `anon`, e nenhuma política deste arquivo nasce com `using (true)`.
--      Se um dia alguém "resolver" isso com uma linha de RLS, o pipeline
--      inteiro — valor, cliente, etapa, motivo de perda — passa a sair pela
--      anon key, que é pública por definição. A leitura sai pela função;
--   2) a função devolve CINCO colunas: título, corpo, valor, validade e
--      status. Sem `oportunidade_id`, sem `aluno_id`, sem workspace, sem o
--      próprio token. O que não está na lista não existe para quem está do
--      lado de fora;
--   3) o filtro é `status = 'enviada'` e validade não vencida. Rascunho não
--      vaza, e link antigo reencaminhado não ressuscita proposta recusada;
--   4) o token tem forma conferida no banco, e comparação por IGUALDADE.
--      Casamento parcial numa função aberta ao mundo seria um buscador de
--      propostas.
--
-- ⚠ CORREÇÃO DE HISTÓRICO: o `comment on function` de `verificar_certificado`
-- dizia, com razão até esta linha, que era a única função do projeto com
-- grant para `anon`. Esta migração torna a frase falsa, então corrige a frase
-- no banco — o arquivo de 0021 fica como está, porque migração é história.
--
-- ============================================================
-- VISITA É FATO, NÃO OPINIÃO — E FATO NÃO GUARDA IP
-- ============================================================
--
-- `proposta_visita` registra que o link foi aberto, e é a informação que faz
-- o vendedor ligar na hora certa. Duas decisões cercam isso:
--
--   - a tabela NÃO tem política de insert. Ninguém digita visita: quem
--     escreve é a função, no mesmo caminho em que a proposta é lida. Uma
--     política de insert abriria a porta para inflar (ou apagar do relatório)
--     a abertura de um link;
--   - as colunas são `ip_hash` e `agente_hash`, nunca `ip` e `user_agent`.
--     Rastrear abertura não é motivo para guardar o endereço de ninguém. O
--     app hasheia antes de chamar; o `check` de 64 hexadecimais recusa o que
--     não for hash, e a própria função descarta (transforma em vazio) o que
--     chegar fora de forma. Um IP cru mandado por engano não entra no banco
--     nem derruba a visita.

-- ============================================================
-- Tipos
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'status_proposta') then
    create type public.status_proposta as enum ('rascunho', 'enviada', 'aceita', 'recusada', 'expirada');
  end if;
end
$$;

-- ============================================================
-- Tabelas
-- ============================================================

-- O que dizer em cada etapa do funil. Mora ao lado da etapa (0024) porque é
-- dela que depende: mudar o roteiro de "primeiro contato" é mudar o script
-- daquela etapa, não o de uma pessoa.
create table if not exists public.script_etapa (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  -- Sem cascade, como em 0024: etapa não é apagada, sai por `ativa = false`.
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
  -- COM cascade, e de propósito: `oportunidade.aluno_id` (0024) já cascateia
  -- do aluno. Sem cascade aqui, apagar um aluno passaria a falhar no meio do
  -- caminho, e o direito de sumir do sistema viraria um erro de chave
  -- estrangeira. A corrente que começa no aluno tem que ir até o fim.
  oportunidade_id uuid not null references public.oportunidade (id) on delete cascade,
  -- 22 caracteres base62 é o piso que `gerarToken` (tarefa 44) produz a partir
  -- de 16 bytes de entropia. A forma é conferida AQUI também: o banco é o
  -- único lugar por onde todo caminho passa, e um token curto gravado por um
  -- script esquecido seria um link adivinhável para sempre.
  token text not null unique check (token ~ '^[0-9A-Za-z]{22,128}$'),
  titulo text not null default '',
  corpo text not null default '',
  valor numeric(14, 2) not null default 0,
  -- Nula = sem prazo. A função trata os dois casos.
  validade date,
  status public.status_proposta not null default 'rascunho',
  criado_em timestamptz not null default now()
);

create table if not exists public.proposta_visita (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspace (id) default '00000000-0000-0000-0000-000000000001',
  proposta_id uuid not null references public.proposta (id) on delete cascade,
  quando timestamptz not null default now(),
  -- HASH, nunca o valor cru — ver o cabeçalho. O `check` aceita vazio (não
  -- soubemos, ou veio fora de forma) ou exatamente 64 hexadecimais.
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

-- ============================================================
-- Políticas
-- ============================================================
--
-- Os mesmos três papéis de 0024, e pelo mesmo motivo: proposta é trabalho de
-- venda. Nenhuma política de DELETE, nenhuma para `anon`, nenhuma citando
-- `'mentorado'`.

-- ---------- script_etapa ----------

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

-- ---------- proposta ----------

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

-- ---------- proposta_visita ----------
--
-- SÓ LEITURA. Ver o cabeçalho: quem escreve visita é a função.

drop policy if exists "leitura do time comercial" on public.proposta_visita;
create policy "leitura do time comercial" on public.proposta_visita
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and public.papel_atual() in ('dono', 'gestor', 'comercial')
  );

-- ============================================================
-- A leitura pública
-- ============================================================
--
-- `plpgsql` e não `sql` porque a função faz duas coisas em ordem: registra a
-- visita e devolve a proposta. E ela NÃO é `stable` — marcar assim seria
-- mentira, e daria licença ao planejador para não executar o insert.

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
  -- Forma antes de consulta: token fora de formato nem chega ao banco de
  -- dados como pergunta.
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

  -- Token que não existe e token de rascunho respondem a MESMA coisa: nada.
  -- Diferenciar os dois entregaria, de graça, a informação de que aquele
  -- token existe.
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

-- Corrige a frase que esta migração tornou falsa. Ver o cabeçalho.
comment on function public.verificar_certificado is
  'Verificacao PUBLICA de certificado por codigo. Uma das DUAS funcoes do
   projeto com grant para anon (a outra e proposta_publica, de 0025), e de
   proposito: certificado que so o emissor confere nao e certificado.
   Igualdade exata no codigo (nunca like), formato conferido antes da
   consulta, retorno fechado em nome/trilha/data (sem id, sem workspace, sem
   e-mail, sem telefone) e limit 1.';

-- `public` inclui qualquer papel presente e futuro; a liberação aqui é
-- NOMINAL, para `anon` e `authenticated`, e para mais ninguém.
revoke all on function public.proposta_publica(text, text, text) from public;
grant execute on function public.proposta_publica(text, text, text) to anon, authenticated;
