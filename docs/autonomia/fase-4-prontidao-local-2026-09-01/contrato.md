---
schema_version: 2
projeto: RARO IA
missao_id: fase-4-prontidao-local-2026-09-01
estado: em_execucao
janela_maxima: continua_por_tarefas
pulso_maximo: 30min
executor: Luna-medio
revisor: independente
---

# Contrato-mestre — Fase 4: prontidão local

## Escopo aprovado

Validar e consolidar localmente as jornadas críticas do MentorOS depois da
Fase 3: acesso e saída de sessão, uso profissional, projeção segura do portal
e material operacional para validação manual. Cada tarefa começa com contrato
e ledger, TDD, testes focados, TypeScript e revisão independente.

## Sequência

1. **T-093 — acesso e saída segura:** cobrir por testes os caminhos de saída
   Supabase e senha local, inclusive redirecionamento sem sessão configurada.
2. **T-094 — roteiro UAT local:** tornar verificável, sem dados reais, a
   jornada profissional, a jornada do mentorado e os estados sem permissão.
3. **T-095 — prontidão operacional local:** inventariar variáveis por nome,
   checklists de recuperação e barreiras contra segredos/artefatos no Git.
4. **T-096 — portão de ambiente real:** apenas documento de pré-condições.
   Aplicar migrations, usar contas reais, integrar fornecedor ou fazer deploy
   continuam exigindo autorização específica.

## Critérios de aceite

- As jornadas locais têm evidência automatizada ou roteiro manual reproduzível.
- Saída de sessão não deixa rota privada aberta por conveniência da aplicação.
- Portal mantém projeção mínima e consentimento continua fail-closed.
- Nenhuma credencial, banco real, migration aplicada, produção, deploy ou
  integração externa é usada.
- Cada encerramento é revisado, versionado e confirmado no remoto `mentoros`.

## Limites

Esta fase não autoriza ambiente real. Prontidão técnica não é permissão para
publicar, migrar ou acessar dados sensíveis.
