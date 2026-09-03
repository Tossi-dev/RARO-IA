---
schema_version: 3
projeto: RARO IA
missao_id: fase-7-t112-isolamento-sintetico-2026-09-02
estado: em_execucao_local
autorizacao: continuação local autorizada pelo Tossi em 2026-09-02
pulso_maximo: 10min
---

# Contrato corretivo — isolamento sintético da T-112

## Escopo

Preparar e testar localmente um SQL transacional que crie um workspace de
auditoria separado e associe exclusivamente as três contas `audit.invalid` já
conhecidas. O script deve falhar fechado se o conjunto divergir e não será
executado no MentorOS main por este contrato.

## Aceite

- Nenhuma política RLS, tabela, função, dado real ou credencial é alterada.
- O SQL só atualiza `profiles.workspace_id` das três identidades sintéticas.
- A massa T-102 existente permanece no workspace anterior e fica invisível às
  contas isoladas; ela não é movida implicitamente. Uma tarefa posterior deverá
  recriar massa sintética mínima no novo workspace antes de retomar a UAT.
- O script é transacional, idempotente e interrompe diante de conta ausente,
  adicional, perfil inconsistente, UUID incompatível ou qualquer dado de
  negócio já associado ao workspace sintético.
- Teste focado, TypeScript, diff check e revisão independente aprovados.
- A aplicação real permanece atrás de autorização explícita sobre o SQL final.

<!-- LOOP-CONTRACT:START
{
  "schema_version": 3,
  "project": "RARO IA",
  "mission_id": "fase-7-t112-isolamento-sintetico-2026-09-02",
  "approved_by": "Tossi",
  "approved_at": "2026-09-02",
  "continuation_mode": "rolling",
  "delivery_mode": "incremento_tecnico",
  "window_max_hours": 4,
  "task_max_minutes": 55,
  "checkpoint_minutes": 10,
  "max_parallel_workers": 1,
  "tasks": [{
    "id": "T-112A",
    "title": "Preparar isolamento das contas sintéticas em workspace dedicado",
    "depends_on": [],
    "write_scope": ["scripts/uat/preparar-workspace-sintetico-t112.sql", "scripts/preparar-workspace-sintetico-t112.test.ts", "docs/autonomia/fase-7-t112-isolamento-sintetico-2026-09-02/**", "vault:Projetos/RARO IA/Autonomia/fase-7-t112-isolamento-sintetico-2026-09-02/**", "vault:Projetos/RARO IA/Onde parei.md"],
    "shared_resources": ["repo:RARO IA", "lock:t112-isolamento"],
    "acceptance": ["SQL transacional move somente três profiles audit.invalid para workspace sintético dedicado.", "Falha fechada diante de qualquer divergência e não contém execução remota."],
    "validation": ["npx vitest run scripts/preparar-workspace-sintetico-t112.test.ts", "npx tsc --noEmit --incremental false", "git diff --check", "revisão independente"],
    "max_minutes": 55,
    "estimated_units": 2,
    "risk": "sql-local-nao-aplicado",
    "requires_independent_review": true,
    "model": {"initial":"luna","effort":"medium","one_escalation_to":"terra"}
  }]
}
LOOP-CONTRACT:END -->
