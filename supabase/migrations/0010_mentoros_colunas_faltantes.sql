-- ============================================================
-- 0010 — MentorOS: colunas que o app já usava e o schema não tinha
--
-- A migração 0009 fechou o buraco das TABELAS ausentes. Este arquivo fecha o
-- mesmo tipo de buraco um nível abaixo: COLUNA que o provider lê e escreve e
-- que nunca existiu em migração nenhuma.
--
-- Por que isso passa despercebido: o nome da coluna é string dentro de um
-- objeto (`braco: r.braco`), então `tsc` fica verde, o build fica verde, e o
-- erro só aparece em runtime, na forma "column products.braco does not
-- exist" — no dia em que alguém cadastrar um produto.
-- ============================================================

-- `braco` é o agrupamento a que o produto pertence (o id de uma linha de
-- AGRUPAMENTOS). Deixou de ser união fixa de três palavras quando os
-- agrupamentos passaram a ser cadastrados pelo dono — ver o comentário em
-- src/lib/types.ts. Fica `text` e nulo, e não FK, porque o valor histórico da
-- planilha pode citar um agrupamento que já foi renomeado; uma FK recusaria a
-- importação inteira por causa de uma linha antiga.
alter table public.produtos
  add column if not exists braco text;

-- `categoria` é o que o produto É para o negócio (curso, mentoria, serviço,
-- assinatura, evento, produto). Serve para a tela de fontes de renda somar
-- receita por natureza, e é diferente de `tipo`, que é a faixa de preço
-- (low_ticket/high_ticket/mentoria).
do $$ begin
  create type categoria_produto as enum
    ('curso', 'mentoria', 'servico', 'produto', 'assinatura', 'evento');
exception when duplicate_object then null; end $$;

alter table public.produtos
  add column if not exists categoria categoria_produto not null default 'curso';

comment on column public.produtos.categoria is
  'O que o produto e para o negocio. Diferente de `tipo`, que e a faixa de
   preco. Default ''curso'' apenas para as linhas que ja existiam quando esta
   coluna nasceu -- produto novo sempre informa a categoria pela tela.';
