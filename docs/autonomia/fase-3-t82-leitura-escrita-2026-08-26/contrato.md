---
schema_version: 2
projeto: RARO IA
missao_id: fase-3-t82-leitura-escrita-2026-08-26
tarefa: T-082-leitura-e-escrita-do-atendimento
estado: concluida
janela_maxima: 2h
pulso_maximo: 30min
telemetria_estimativa_unidades: 3
executor: Luna-medio
revisor: independente
---

# Contrato individual — T-082: leitura e escrita do atendimento

## Escopo local

Criar adaptadores server-only tipados para mapa, metas, passos, reflexões e
consentimentos, e ações de servidor que usam apenas o cliente Supabase da
sessão. A ficha existente será composta sem mudar telas nesta tarefa.

## Regras de segurança

- `workspace_id` nunca é recebido nem decidido pelo formulário.
- Cliente inexistente ou fora do acesso RLS recebe resposta genérica, sem
  revelar se existe em outro workspace.
- Reflexões privadas não entram na projeção de cliente.
- Nenhuma escrita real será feita nesta execução: código e testes locais
  apenas; migrations 0038–0040 não serão aplicadas.

## Aceite

- Testes cobrem cliente ausente, falha de leitura, dado privado e isolamento
  de `workspace_id` do formulário.
- Vitest focado e `npx tsc --noEmit` passam.
- Ledger e revisão independente registram evidências reais.
