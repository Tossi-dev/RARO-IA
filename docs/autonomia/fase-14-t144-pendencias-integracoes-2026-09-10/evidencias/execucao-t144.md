---
tipo: evidencias
criado: 2026-09-10
atualizado: 2026-09-10
tags: [projeto/raro-ia, mentoros, autonomia, t144]
status: revisao_pendente
---

# T-144 — execução: pendências de integrações

## Resultado implementado

- Inventário principal passou de quatro para as oito integrações atuais: Supabase, Planilha, Pix, Google Calendar, transcrição, IA, Meta e TikTok.
- A lista visível `Todas as integrações pendentes` mostra cada item com motivo, quem resolve e próximo passo seguro; não usa recorte de itens nem texto truncado.
- Conexão parcial da planilha permanece uma pendência; Google conectado não retorna à lista; iCal legado continua fora do inventário efetivo.
- O link `Ver todas as integrações` aponta para a seção visível. O diagnóstico técnico permanece separado e a compatibilidade com `?todas=1` foi preservada.
- A página informa que configuração local não equivale a homologação no fornecedor e não executa ação externa.

## TDD e validação

1. RED: os novos testes de inventário/pendências falharam antes da implementação porque os marcadores e as listas completas não existiam.
2. GREEN: `npx --no-install vitest run "src/app/(app)/integracoes/page.test.tsx" src/lib/integracoes/conexao-assistida.test.ts`
   - 2 arquivos verdes, 21 testes aprovados.
   - Mocks determinísticos cobrem flags de STT, IA, Meta, TikTok e gateway; UAT continua sem OAuth/link real ou leitura de planilha.
3. `npx --no-install tsc --noEmit` — aprovado.
4. `git diff --check` — aprovado, sem erro de whitespace.

## Inventário do diff

- `src/app/(app)/integracoes/page.tsx`
- `src/app/(app)/integracoes/page.test.tsx`
- `src/lib/integracoes/conexao-assistida.ts`
- `src/lib/integracoes/conexao-assistida.test.ts`

## Limites mantidos

Não houve deploy, Git, banco, fornecedor, rede externa, credencial, segredo ou mudança de home/estilos globais. Revisão independente continua pendente.
