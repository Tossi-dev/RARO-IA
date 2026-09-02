# Contrato individual — T-107

## Escopo

Redesenhar localmente a carteira de mentorados e os módulos de ficha,
mapa, relações e plano de ação. A mudança é exclusivamente de apresentação:
mantém leituras, consentimentos, projeções, dados, rotas e Server Actions.

## Critérios de aceite

- A carteira comunica quem precisa de atenção e preserva o acesso a cada ficha.
- A ficha apresenta contexto, mapa, metas, próximos passos e relações como
  superfícies de acompanhamento, sem afirmar diagnóstico ou prescrever caminho.
- Estados sem leitura, sem consentimento ou sem registros continuam explícitos.
- Nenhuma transcrição ou informação além da projeção existente passa a ser exibida.

## Validação

- Testes focados escritos antes da alteração visual.
- Testes de mentoria alterados, TypeScript e `git diff --check`.
- Revisão independente somente leitura.

## Limites

Sem Supabase, migration, RLS, banco, segredo, produção, deploy, escrita
externa ou alteração nas regras de consentimento.
