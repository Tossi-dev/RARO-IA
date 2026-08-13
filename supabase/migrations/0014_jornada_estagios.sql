-- ============================================================
-- 0014 — a escada de estágios do CRM: Prospect → Alumni.
-- Rode APÓS 0013_portal_tarefa_por_funcao.sql.
--
-- POR QUE ESTA MIGRAÇÃO EXISTE
-- ----------------------------
-- A apresentação promete "estágios Prospect → Alumni" e o banco não tem
-- nenhum dos dois. 0002 semeou seis linhas em `crm_estagios` identificadas
-- só pelo `nome` ('Lead', 'Em conversa', 'Aluno novo', 'Aluno ativo',
-- 'Em risco', 'Inativo') — e nome é texto livre, editável pelo dono a
-- qualquer momento. Qualquer regra escrita em cima do nome ("se o estágio
-- se chama 'Aluno ativo' então...") quebra em silêncio no dia em que
-- alguém renomear a coluna do kanban. Por isso a coluna `chave`: um
-- identificador ESTÁVEL, que o código conhece e o dono não edita, com o
-- `nome` livre para virar o que ele quiser na tela.
--
-- A escada final tem sete degraus, nesta ordem:
--   prospect → lead_qualificado → proposta → cliente_novo → cliente_ativo
--   → em_risco → alumni
--
-- POR QUE UPDATE, E NÃO REFAZER A TABELA
-- -------------------------------------
-- `alunos.estagio_id` (0002) referencia `crm_estagios (id)`. Refazer a
-- escada apagando as linhas antigas e inserindo as novas ou esbarraria na
-- chave estrangeira, ou — se alguém "resolvesse" isso soltando a FK —
-- deixaria todo aluno já classificado apontando para um estágio que não
-- existe mais, sem erro nenhum na tela. Aqui as seis linhas de 0002 são
-- REMAPEADAS: mesmo id, chave/nome/ordem novos. Ninguém perde o estágio
-- em que está, e a regra da casa ("status muda, linha fica") vale também
-- para a própria tabela de status.
--
-- QUANDO O DONO JÁ RENOMEOU O ESTÁGIO ANTES DESTA MIGRAÇÃO
-- --------------------------------------------------------
-- O remap tem que achar as linhas de 0002 em banco que já foi usado. Casar
-- só por `nome` seria escrever a regra em cima da ÚNICA coluna que este
-- mesmo cabeçalho declara volátil: quem renomeou 'Aluno ativo' para
-- 'Ativo' na tela não casaria em nada, a linha cairia no fallback de chave
-- derivada (passo 3) e a escada ficaria SEM o degrau 'cliente_ativo' — o
-- degrau onde mora todo cliente pagante — sem erro nenhum na tela. Por
-- isso a identificação tem duas passadas e a escada tem um fecho:
--   passo 2  — casa por nome exato de 0002 (certeza total);
--   passo 2b — casa pela pegada (ordem, cor, funil) que 0002 semeou, para
--              a linha que só teve o nome trocado. Aqui o `nome` do dono é
--              PRESERVADO: a chave é do código, o rótulo é dele;
--   passo 5  — insere TODO degrau da escada que ainda falte no workspace,
--              e não só os dois novos. Assim a escada fecha os sete degraus
--              mesmo quando as duas passadas acima não reconhecem uma linha
--              (dono que trocou nome E cor, por exemplo): no pior caso o
--              kanban mostra a coluna antiga dele com as pessoas dentro,
--              mais o degrau novo vazio — nada some, nada é reclassificado.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ: RECLASSIFICAR GENTE
-- -----------------------------------------------
-- 'Inativo' NÃO vira 'alumni'. São coisas diferentes: alumni é quem
-- terminou o programa (e pode recomprar); inativo é quem sumiu. Só o dono
-- sabe, aluno por aluno, qual é qual — e essa decisão é dele, na tela, não
-- de um `update` cego que renomeia uma coisa na outra. Por isso 'inativo'
-- sobrevive como oitavo estágio FORA da escada, e a escada ganha 'alumni'
-- como degrau novo e vazio.
--
-- RLS
-- ---
-- Nenhuma política nova aqui, de propósito. `crm_estagios` é do grupo CRM
-- e já tem as quatro políticas de 0008 (leitura para dono/gestor/comercial,
-- escrita para dono/gestor, todas filtrando por `workspace_atual()`), e
-- políticas do Postgres valem para a LINHA inteira — coluna nova não muda
-- quem lê nem quem escreve. Uma política nova aqui só poderia AFROUXAR o
-- que já está certo: políticas permissivas se somam com OR.
-- ============================================================

-- ---------- 1. a coluna estável ----------
-- Entra nula: a tabela já tem linhas, e o valor de cada uma depende do
-- remapeamento abaixo. O `set not null` vem no passo 4, depois que toda
-- linha tiver chave.
alter table public.crm_estagios add column if not exists chave text;

comment on column public.crm_estagios.chave is
  'Identificador ESTAVEL da etapa (prospect, lead_qualificado, proposta,
   cliente_novo, cliente_ativo, em_risco, alumni). E por esta coluna que o
   codigo reconhece o degrau da escada — nunca pelo `nome`, que e texto
   livre e o dono renomeia na tela quando quiser. Unica por workspace.';

-- ---------- 2. remapeamento das seis linhas semeadas em 0002 ----------
-- Cada update casa pelo nome ORIGINAL de 0002 e só age em linha que ainda
-- não tem chave — o que torna o bloco inteiro repetível: rodar de novo não
-- encontra nada e não desfaz customização nenhuma do dono.
--
-- A correspondência degrau a degrau, e por que:
--   'Lead'        → lead_qualificado : já é contato com nome e interesse.
--                                      O topo cru do funil (quem só existe
--                                      como registro) passa a ser 'prospect',
--                                      inserido no passo 5.
--   'Em conversa' → proposta         : o degrau anterior ao fechamento.
--   'Aluno novo'  → cliente_novo     : mesma etapa, vocabulário do MentorOS
--   'Aluno ativo' → cliente_ativo      (é mentorado/cliente, não "aluno de
--   'Em risco'    → em_risco           infoproduto" — nome que sobrou da
--                                      fase anterior do produto).
--   'Inativo'     → inativo          : fora da escada, ver cabeçalho.
update public.crm_estagios
set chave = 'lead_qualificado', nome = 'Lead qualificado', ordem = 2
where chave is null and nome = 'Lead';

update public.crm_estagios
set chave = 'proposta', nome = 'Proposta', ordem = 3
where chave is null and nome = 'Em conversa';

update public.crm_estagios
set chave = 'cliente_novo', nome = 'Cliente novo', ordem = 4
where chave is null and nome = 'Aluno novo';

update public.crm_estagios
set chave = 'cliente_ativo', nome = 'Cliente ativo', ordem = 5
where chave is null and nome = 'Aluno ativo';

update public.crm_estagios
set chave = 'em_risco', nome = 'Em risco', ordem = 6
where chave is null and nome = 'Em risco';

-- Sobrevive com o nome que sempre teve, na ponta da fila (a escada vai até
-- ordem 7, com alumni). Continua sendo um estágio válido e usável.
update public.crm_estagios
set chave = 'inativo', ordem = 8
where chave is null and nome = 'Inativo';

-- ---------- 2b. a linha que o dono renomeou, reconhecida pela pegada ----------
-- 0002 semeou cada linha com uma combinação própria de (ordem, cor, funil).
-- Renomear na tela não mexe em nenhuma das três, então essa trinca é a
-- impressão digital da linha semeada — e é o que salva o workspace que
-- trocou 'Em conversa' por 'Negociação' antes desta migração rodar.
--
-- Três freios, porque pegada é indício e não certidão:
--   1) só linha que ainda está sem chave (o passo 2 tem prioridade);
--   2) só se aquela chave ainda estiver LIVRE naquele workspace, conferido
--      linha a linha e no momento da gravação — nunca em cima de um
--      retrato do início do comando, que deixaria duas linhas receberem a
--      mesma chave e derrubaria o índice único do passo 4;
--   3) `nome` NÃO é tocado. O dono renomeou de propósito; quem manda no
--      rótulo é ele, e a chave é que passa a ser assunto do código.
-- Linha que não casar aqui não é forçada em degrau nenhum: segue para o
-- passo 3 e ganha chave derivada do próprio nome, fora da escada.
do $$
declare
  candidata record;
begin
  for candidata in
    select e.id, e.workspace_id, m.chave, m.ordem_nova
    from public.crm_estagios e
    join (values
      -- pegada de 0002: (ordem, cor, funil) → chave da escada, ordem nova
      (1, 'cinza',    'potencial',  'lead_qualificado', 2),
      (2, 'azul',     'potencial',  'proposta',         3),
      (3, 'violeta',  'novo',       'cliente_novo',     4),
      (4, 'verde',    'recorrente', 'cliente_ativo',    5),
      (5, 'ouro',     'recorrente', 'em_risco',         6),
      (6, 'vermelho', 'inativo',    'inativo',          8)
    ) as m(ordem_0002, cor, funil, chave, ordem_nova)
      on e.ordem = m.ordem_0002 and e.cor = m.cor and e.funil::text = m.funil
    where e.chave is null
    order by e.id
  loop
    if not exists (
      select 1 from public.crm_estagios x
      where x.workspace_id = candidata.workspace_id and x.chave = candidata.chave
    ) then
      update public.crm_estagios
      set chave = candidata.chave, ordem = candidata.ordem_nova
      where id = candidata.id;
    end if;
  end loop;
end $$;

-- ---------- 3. estágio que o dono criou à mão ganha chave derivada ----------
-- Os updates acima só conhecem os seis nomes de 0002. Qualquer estágio
-- criado depois (direto no SQL Editor) continuaria com chave nula e
-- impediria o `set not null` do passo 4. Aqui cada um desses ganha uma
-- chave derivada do próprio nome — sem inventar significado nenhum: é o
-- nome dele, normalizado. O laço confere linha a linha se a chave
-- candidata já está tomada NAQUELE workspace e vai somando sufixo até
-- achar uma livre, porque dois estágios podem ter o mesmo nome e o índice
-- único do passo 4 recusaria a segunda linha.
do $$
declare
  linha record;
  base text;
  candidata text;
  sufixo int;
begin
  for linha in
    select id, workspace_id, nome from public.crm_estagios where chave is null order by ordem, id
  loop
    base := coalesce(
      nullif(
        btrim(
          regexp_replace(
            lower(translate(
              linha.nome,
              'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
              'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
            )),
            '[^a-z0-9]+', '_', 'g'
          ),
          '_'
        ),
        ''
      ),
      -- Nome só de símbolo ('★', '---') não sobra letra nenhuma depois da
      -- normalização; 'estagio' é o fallback do fallback, e o sufixo abaixo
      -- garante que dois deles não colidam.
      'estagio'
    );
    candidata := base;
    sufixo := 1;
    while exists (
      select 1 from public.crm_estagios x
      where x.workspace_id = linha.workspace_id and x.chave = candidata
    ) loop
      sufixo := sufixo + 1;
      candidata := base || '_' || sufixo;
    end loop;
    update public.crm_estagios set chave = candidata where id = linha.id;
  end loop;
end $$;

-- ---------- 4. a chave passa a ser obrigatória e única por workspace ----------
-- `not null` só agora, com toda linha já preenchida pelos passos 2 e 3.
alter table public.crm_estagios alter column chave set not null;

-- Único POR WORKSPACE, nunca global: cada workspace tem a sua escada, e o
-- 'prospect' de um não tem nada a ver com o 'prospect' do outro. Índice (e
-- não constraint) por ser `if not exists` — repetível sem erro.
create unique index if not exists crm_estagios_chave_por_workspace
  on public.crm_estagios (workspace_id, chave);

-- ---------- 5. a escada fecha os sete degraus ----------
-- O insert lista a escada INTEIRA, não só os dois degraus novos, e é o
-- índice único do passo 4 que decide o que entra: degrau que o workspace já
-- tem (pelos passos 2 e 2b) bate no conflito e é descartado; degrau que
-- falta nasce vazio. É esse fecho que torna a escada uma garantia em vez de
-- uma esperança — ela não depende de o dono não ter mexido no kanban antes,
-- nem de o workspace ter recebido as seis linhas de 0002 inteiras.
--
-- O mesmo `on conflict do nothing` é o que faz a migração aguentar ser
-- colada duas vezes no SQL Editor (acidente comum, e é para isso que existe
-- o par `_exec_`): na segunda vez tudo conflita e nada acontece, em vez de
-- deixar dois 'Prospect' no kanban.
--
-- Workspace SEM estágio nenhum fica de fora, e isto é limite conhecido, não
-- descuido: esta migração lê `crm_estagios` e um workspace que não tem linha
-- nenhuma lá não aparece nessa leitura. Semear o kanban de um workspace
-- recém-criado é assunto de quem cria o workspace, não de uma migração de
-- remapeamento.
--
-- alumni nasce com funil = 'inativo' porque `status_funil` (0001) responde
-- "esta pessoa está gerando receita agora?", e alumni é quem TERMINOU: não é
-- receita recorrente. Não é juízo sobre a pessoa — é a coluna que alimenta
-- as métricas de funil (`funil()` em src/lib/metrics.ts), e contar alumni
-- como 'recorrente' inflaria a base ativa com gente que já saiu.
insert into public.crm_estagios (workspace_id, nome, chave, ordem, cor, funil)
select w.workspace_id, d.nome, d.chave, d.ordem, d.cor, d.funil::status_funil
from (select distinct workspace_id from public.crm_estagios) w
cross join (values
  ('prospect',         'Prospect',         1, 'cinza',   'potencial'),
  ('lead_qualificado', 'Lead qualificado', 2, 'cinza',   'potencial'),
  ('proposta',         'Proposta',         3, 'azul',    'potencial'),
  ('cliente_novo',     'Cliente novo',     4, 'violeta', 'novo'),
  ('cliente_ativo',    'Cliente ativo',    5, 'verde',   'recorrente'),
  ('em_risco',         'Em risco',         6, 'ouro',    'recorrente'),
  ('alumni',           'Alumni',           7, 'azul',    'inativo')
) as d(chave, nome, ordem, cor, funil)
on conflict do nothing;
