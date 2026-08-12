alter table public.produtos
  add column if not exists braco text;
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
