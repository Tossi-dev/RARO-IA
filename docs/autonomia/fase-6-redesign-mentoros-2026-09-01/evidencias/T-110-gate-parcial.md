# T-110 — gate parcial e pausa

## Gates executados

- `npx vitest run` — 160 arquivos e 3.361 testes aprovados.
- `npx tsc --noEmit --incremental false` — aprovado.
- `git diff --check` — aprovado.
- `npm run build` — **reprovado** após compilar, durante a validação de tipos de rota.

## Falha verificável

O Next.js rejeitou `src/app/(app)/mentoria/risco/page.tsx` porque a página
exporta `resolverAlerta`, além dos exports permitidos em um módulo de rota.
O TypeScript comum não detecta o contrato gerado em `.next/types`.

## Auditoria visual estática

A varredura das superfícies da Fase 6 confirmou tema escuro, `theme-color`,
redução de movimento e controles semânticos. Permanecem achados de qualidade
não bloqueadores em código compartilhado: usos de `transition-all` e campos
com `focus:outline-none` cuja substituição é apenas mudança de borda.

## Estado

T-110 pausada. Corrigir a exportação da rota exige alterar código fora do
`write_scope` documental deste gate. Nenhum build, segredo ou `.env.local` foi
adicionado ao Git; produção e deploy não foram acionados.
