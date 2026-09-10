---
tipo: evidencias
criado: 2026-09-10
atualizado: 2026-09-10
tags: [projeto/raro-ia, mentoros, autonomia, t144, revisao-r2]
status: revisao_pendente
---

# T-144 R2 — correção da revisão independente

## Ajustes realizados

- A pendência do Google agora deriva do resultado fechado: distingue conexão revogada, ausência de conexão confirmada e falha/estado não confirmável; não chama todos os casos de ausência de autorização.
- UAT apresenta inventário e pendências como isolados/suspensos. Não mostra caminho de OAuth, conexão ou teste de conta real nesse estado.
- Somente Google com resultado autenticado positivo afirma vínculo por organização. Demais flags exibem configuração local detectada e homologação não confirmada.
- O recorte de testes do inventário agora termina antes do `aside`, verifica exatamente oito elementos `li` e não pode encontrar itens da lista de pendências.

## TDD e validação

1. RED: sete novos cenários falharam antes da correção, cobrindo estados Google, UAT, flags globais e seletor do inventário.
2. GREEN: `npx --no-install vitest run "src/app/(app)/integracoes/page.test.tsx" src/lib/integracoes/conexao-assistida.test.ts`
   - 2 arquivos e 26 testes aprovados.
3. `npx --no-install tsc --noEmit` — aprovado.
4. `git diff --check` — aprovado; apenas avisos informativos de LF/CRLF.

## Ajuste final pré-R2

- O Supabase permanece permitido no UAT pela normalização existente; sua linha não afirma bloqueio enquanto exibe selo conectado. Um teste dedicado cobre essa não contradição.
- Revalidação final: 2 arquivos e 27 testes aprovados; `tsc --noEmit` e `git diff --check` aprovados.

## Limites mantidos

Sem Git, deploy, fornecedor, rede externa, banco, credencial, segredo, home ou estilos globais. Aguardando revisão independente R2.
