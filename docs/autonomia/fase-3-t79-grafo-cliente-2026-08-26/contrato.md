---
schema_version: 2
projeto: RARO IA
missao_id: fase-3-t79-grafo-cliente-2026-08-26
tarefa: T-079-grafo-cliente
estado: concluida
janela_maxima: 2h
pulso_maximo: 30min
telemetria_estimativa_unidades: 2
executor: Luna-medio
revisor: independente
---

# Contrato individual — T-079: grafo do cliente

## Escopo

Criar regras puras para conectar nós explicitamente registrados do mesmo cliente:
dimensão, meta, passo, sessão, reflexão e referência de transcrição autorizada.

## Aceite

- Grafo recusa cliente diferente, nó duplicado, auto-ligação e nó inexistente.
- Referência de transcrição sem autorização é recusada.
- Relações têm ordem estável e não expressam causalidade ou diagnóstico.
- Vitest focado, TypeScript e revisão independente aprovam.

## Limites

Sem banco, migrations, RLS, telas, IA, transcrição, integrações, produção,
deploy, push, commit, credenciais ou dados reais.
