# Contrato individual — T-106

## Escopo

Redesenhar somente a porta de entrada, o shell de trabalho e a tela inicial
para que o MentorOS abra como ambiente de acompanhamento de mentorias. Rotas,
ações, catálogo por papel e atalhos existentes continuam disponíveis.

## Critérios de aceite

- Login deixa clara a proposta do MentorOS sem alterar autenticação.
- Topbar, menu móvel e início formam uma superfície única, responsiva e com
  foco visível.
- O catálogo mantém os mesmos destinos e badges derivados da base.
- O teste de renderização prova que nenhum destino operacional foi removido.

## Limites

Sem banco, credencial, Supabase, migration, produção, deploy ou mudança das
regras de papéis.
