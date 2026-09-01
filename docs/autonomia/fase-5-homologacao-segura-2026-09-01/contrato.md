---
schema_version: 3
projeto: RARO IA
missao_id: fase-5-homologacao-segura-2026-09-01
estado: em_execucao
autorizacao: Fase 5 aprovada explicitamente pelo Tossi em 2026-09-01
janela_maxima: rolling
pulso_maximo: 30min
executor: Luna-medio
revisor: independente
---

# Contrato-mestre — Fase 5: homologação segura

## Escopo aprovado

Consolidar localmente as jornadas profissionais já implementadas depois das
migrations aplicadas: mapear cobertura, aumentar testes de integração
simulada, validar interface local e fechar a prontidão técnica. A execução é
automática entre T-099, T-100, T-101 e T-104, com TDD, TypeScript, revisão
independente, commit e push por tarefa.

## Limites externos

T-102 (homologação com contas sintéticas no MentorOS) e T-103 (fornecedor de
transcrição) ficam fora desta fila: cada uma exige confirmação específica no
momento da ação. Esta fase não lê segredos, não faz deploy, não envia áudio e
não acessa dados de clientes.

<!-- LOOP-CONTRACT:START
{
  "schema_version": 3,
  "project": "RARO IA",
  "mission_id": "fase-5-homologacao-segura-2026-09-01",
  "approved_by": "Tossi",
  "approved_at": "2026-09-01",
  "continuation_mode": "rolling",
  "delivery_mode": "incremento_tecnico",
  "task_max_minutes": 50,
  "max_parallel_workers": 1,
  "tasks": [
    {
      "id": "T-099",
      "title": "Inventário de jornadas e lacunas locais",
      "depends_on": [],
      "write_scope": ["docs/operacao/fase-5-jornadas.md", "docs/autonomia/fase-5-*/**"],
      "shared_resources": ["repo:RARO IA", "lock:fase-5"],
      "acceptance": ["Matriz relaciona cada jornada às telas, ações, testes e dados de schema necessários.", "Lacunas são classificadas em local, externa ou decisão humana."],
      "validation": ["Leitura seletiva dos módulos de mentoria e testes relacionados.", "Revisão independente somente leitura."],
      "max_minutes": 50,
      "estimated_units": 1,
      "risk": "documentacao",
      "requires_independent_review": true,
      "model": {"initial": "luna", "effort": "medium", "one_escalation_to": "terra"}
    },
    {
      "id": "T-100",
      "title": "Integração simulada das jornadas de mentoria",
      "depends_on": ["T-099"],
      "write_scope": ["src/lib/mentoria/**", "src/lib/mentoria/*.test.ts"],
      "shared_resources": ["repo:RARO IA", "lock:fase-5"],
      "acceptance": ["Cenários simulados cobrem permissões, consentimento, mapa, metas, grafo, mensagens e portal.", "Nenhum teste exige rede, segredo ou banco real."],
      "validation": ["Vitest focado.", "npx tsc --noEmit --incremental false.", "Revisão independente."],
      "max_minutes": 50,
      "estimated_units": 2,
      "risk": "codigo",
      "requires_independent_review": true,
      "model": {"initial": "luna", "effort": "medium", "one_escalation_to": "terra"}
    },
    {
      "id": "T-101",
      "title": "Prontidão da interface local",
      "depends_on": ["T-100"],
      "write_scope": ["src/app/(app)/mentoria/**", "src/app/(app)/portal/**", "src/components/**"],
      "shared_resources": ["repo:RARO IA", "lock:fase-5"],
      "acceptance": ["Jornadas locais do profissional e do mentorado exibem estados seguros e compreensíveis.", "Correções só tratam falhas reproduzidas por testes ou renderização local."],
      "validation": ["Testes de componentes e rotas focadas.", "npx tsc --noEmit --incremental false.", "Revisão independente."],
      "max_minutes": 50,
      "estimated_units": 2,
      "risk": "comportamento",
      "requires_independent_review": true,
      "model": {"initial": "luna", "effort": "medium", "one_escalation_to": "terra"}
    },
    {
      "id": "T-104",
      "title": "Prontidão técnica local",
      "depends_on": ["T-101"],
      "write_scope": ["docs/operacao/**", "docs/autonomia/fase-5-*/**"],
      "shared_resources": ["repo:RARO IA", "lock:fase-5"],
      "acceptance": ["Testes, TypeScript, build local e pendências externas são registrados com evidências reais.", "O resultado declara prontidão técnica sem autorizar deploy, banco ou integração externa."],
      "validation": ["npx vitest run.", "npx tsc --noEmit --incremental false.", "npm run build.", "Revisão independente e inventário do diff."],
      "max_minutes": 50,
      "estimated_units": 1,
      "risk": "documentacao",
      "requires_independent_review": true,
      "model": {"initial": "luna", "effort": "medium", "one_escalation_to": "terra"}
    }
  ]
}
LOOP-CONTRACT:END -->
