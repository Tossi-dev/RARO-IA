# Contrato individual — T-101

## Escopo

Revisar e reforçar somente a interface local de mentoria e portal para estados
sem dados, sem permissão e sem consentimento. Qualquer correção precisa ser
demonstrada por teste de componente/rota ou renderização local.

## Escopo de escrita

- `src/app/(app)/mentoria/**`
- `src/app/(app)/portal/**`
- Testes dessas rotas e contrato/ledger da tarefa.

## Aceite

- A interface não promete conteúdo inexistente e explica bloqueios sem expor
  detalhes internos.
- O portal não renderiza conteúdo privado ou financeiro indevidamente.
- Testes focados, TypeScript e revisão independente aprovados.

## Limites

Sem Supabase real, conta, banco, segredo, fornecedor, upload ou deploy.
