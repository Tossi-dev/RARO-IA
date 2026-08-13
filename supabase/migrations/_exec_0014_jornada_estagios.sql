alter table public.crm_estagios add column if not exists chave text;
comment on column public.crm_estagios.chave is
  'Identificador ESTAVEL da etapa (prospect, lead_qualificado, proposta,
   cliente_novo, cliente_ativo, em_risco, alumni). E por esta coluna que o
   codigo reconhece o degrau da escada — nunca pelo `nome`, que e texto
   livre e o dono renomeia na tela quando quiser. Unica por workspace.';
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
update public.crm_estagios
set chave = 'inativo', ordem = 8
where chave is null and nome = 'Inativo';
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
alter table public.crm_estagios alter column chave set not null;
create unique index if not exists crm_estagios_chave_por_workspace
  on public.crm_estagios (workspace_id, chave);
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
