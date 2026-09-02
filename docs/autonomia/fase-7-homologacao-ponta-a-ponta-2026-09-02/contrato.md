---
schema_version: 3
projeto: RARO IA
missao_id: fase-7-homologacao-ponta-a-ponta-2026-09-02
estado: em_execucao
autorizacao: Fase 7 aprovada explicitamente pelo Tossi em 2026-09-02
janela_maxima: rolling
pulso_maximo: 10min
executor: Luna-medio
revisor: independente
---

# Contrato-mestre — Fase 7: homologação ponta a ponta

## Objetivo verificável

Comprovar com identidades e dados exclusivamente sintéticos que as jornadas de
gestor, comercial, profissional e mentorado funcionam após o redesign. Corrigir
somente defeitos reproduzidos e fechar um gate técnico local.

## Continuidade e limites

A fila T-111 a T-116 está aprovada para execução automática com TDD, revisão,
commit e push em `origin/mentoros`. A aprovação inclui a UAT no MentorOS main
exclusivamente com as contas e registros sintéticos já identificados pela
T-102 e a criação do conteúdo sintético descrito pela T-113. Sem cliente real,
cobrança, deploy, mudança de configuração de produção ou segredo. A T-114 pode preparar
tudo localmente, mas exige autorização específica imediatamente antes do
primeiro envio sintético ao fornecedor. Migration/RLS só após defeito provado,
correção versionada, aviso e autorização específica.

<!-- LOOP-CONTRACT:START
{
  "schema_version": 3,
  "project": "RARO IA",
  "mission_id": "fase-7-homologacao-ponta-a-ponta-2026-09-02",
  "approved_by": "Tossi",
  "approved_at": "2026-09-02",
  "continuation_mode": "rolling",
  "delivery_mode": "ready_for_production",
  "window_max_hours": 24,
  "task_max_minutes": 55,
  "checkpoint_minutes": 10,
  "max_parallel_workers": 1,
  "tasks": [
    {
      "id": "T-111",
      "title": "Consolidar o estado da T-102",
      "depends_on": [],
      "write_scope": ["docs/operacao/fase-7-uat.md", "docs/autonomia/fase-7-homologacao-ponta-a-ponta-2026-09-02/**", "vault:Projetos/RARO IA/Autonomia/fase-7-homologacao-ponta-a-ponta-2026-09-02/**", "vault:Projetos/RARO IA/Onde parei.md"],
      "shared_resources": ["repo:RARO IA", "lock:fase-7-uat"],
      "acceptance": ["Evidência separa o que foi criado do que ainda não foi comprovado na T-102.", "Nenhuma credencial ou identificação sensível é registrada."],
      "validation": ["Conferência dos contratos e ledgers T-102.", "git diff --check.", "Revisão independente."],
      "max_minutes": 40,
      "estimated_units": 1,
      "risk": "documentacao",
      "requires_independent_review": true,
      "model": {"initial":"luna","effort":"medium","one_escalation_to":"terra"}
    },
    {
      "id": "T-112",
      "title": "UAT sintética por perfil",
      "depends_on": ["T-111"],
      "write_scope": ["docs/operacao/fase-7-uat.md", "docs/autonomia/fase-7-homologacao-ponta-a-ponta-2026-09-02/**", "src/**/*.test.ts", "src/**/*.test.tsx"],
      "shared_resources": ["repo:RARO IA", "lock:fase-7-uat", "port:3000", "browser:local"],
      "acceptance": ["Gestor, comercial, profissional e mentorado percorrem somente rotas permitidas no MentorOS main usando as identidades sintéticas da T-102.", "Login, logout, estados vazios e isolamento são registrados sem credenciais ou leitura de dados reais."],
      "validation": ["UAT local com contas sintéticas.", "Testes focados.", "npx tsc --noEmit --incremental false.", "Revisão independente."],
      "max_minutes": 55,
      "estimated_units": 3,
      "risk": "homologacao-sintetica",
      "requires_independent_review": true,
      "external_scope": "MentorOS main: somente contas e registros sintéticos da T-102; parar diante de qualquer dado real",
      "model": {"initial":"luna","effort":"medium","one_escalation_to":"terra"}
    },
    {
      "id": "T-113",
      "title": "Jornada sintética completa de atendimento",
      "depends_on": ["T-112"],
      "write_scope": ["docs/operacao/fase-7-uat.md", "docs/autonomia/fase-7-homologacao-ponta-a-ponta-2026-09-02/**", "src/lib/mentoria/**", "src/app/(app)/mentoria/**", "src/**/*.test.ts", "src/**/*.test.tsx"],
      "shared_resources": ["repo:RARO IA", "lock:fase-7-uat", "port:3000", "browser:local"],
      "acceptance": ["Sessão sintética atravessa contexto, perguntas, mapa, metas, plano e grafo.", "O produto apoia descoberta pelo cliente sem diagnóstico ou prescrição."],
      "validation": ["TDD para defeitos.", "Vitest focado.", "npx tsc --noEmit --incremental false.", "Revisão independente."],
      "max_minutes": 55,
      "estimated_units": 3,
      "risk": "comportamento-sensivel",
      "requires_independent_review": true,
      "external_scope": "MentorOS main: somente sessão e conteúdo sintéticos desta tarefa; sem schema, migration, RLS ou identidade real",
      "model": {"initial":"luna","effort":"medium","one_escalation_to":"terra"}
    },
    {
      "id": "T-114",
      "title": "Transcrição sintética ponta a ponta",
      "depends_on": ["T-113"],
      "write_scope": ["docs/operacao/fase-7-uat.md", "docs/autonomia/fase-7-homologacao-ponta-a-ponta-2026-09-02/**", "src/lib/mentoria/**", "src/app/api/transcrever/**", "src/app/(app)/mentoria/**", "src/**/*.test.ts", "src/**/*.test.tsx"],
      "shared_resources": ["repo:RARO IA", "lock:fase-7-uat", "port:3000", "browser:local", "provider:transcricao"],
      "acceptance": ["Áudio e conteúdo são sintéticos e têm consentimento explícito.", "Retenção, armazenamento privado, falha fechada e revogação são verificáveis."],
      "validation": ["Testes adversariais locais.", "Portão específico antes do fornecedor.", "Vitest focado.", "TypeScript.", "Revisão independente."],
      "max_minutes": 55,
      "estimated_units": 3,
      "risk": "integracao-externa-sensivel",
      "requires_independent_review": true,
      "external_gate": "autorização específica antes do primeiro envio sintético ao fornecedor",
      "model": {"initial":"luna","effort":"medium","one_escalation_to":"terra"}
    },
    {
      "id": "T-115",
      "title": "Corrigir defeitos reproduzidos na homologação",
      "depends_on": ["T-112", "T-113", "T-114"],
      "write_scope": ["src/**", "docs/operacao/fase-7-uat.md", "docs/autonomia/fase-7-homologacao-ponta-a-ponta-2026-09-02/**"],
      "shared_resources": ["repo:RARO IA", "lock:fase-7-uat"],
      "acceptance": ["Somente defeitos registrados pela UAT são corrigidos.", "Cada correção nasce de teste e preserva acesso e privacidade."],
      "validation": ["TDD.", "Testes focados.", "TypeScript.", "git diff --check.", "Revisão independente."],
      "max_minutes": 55,
      "estimated_units": 3,
      "risk": "codigo",
      "requires_independent_review": true,
      "model": {"initial":"luna","effort":"medium","one_escalation_to":"terra"}
    },
    {
      "id": "T-116",
      "title": "Gate final da Fase 7",
      "depends_on": ["T-111", "T-112", "T-113", "T-114", "T-115"],
      "write_scope": ["docs/operacao/fase-7-uat.md", "docs/autonomia/fase-7-homologacao-ponta-a-ponta-2026-09-02/**", "vault:Projetos/RARO IA/Onde parei.md"],
      "shared_resources": ["repo:RARO IA", "lock:fase-7-uat"],
      "acceptance": ["Jornadas e pendências são registradas sem prometer produção.", "Prontidão técnica é separada de deploy e uso real."],
      "validation": ["npx vitest run.", "npx tsc --noEmit --incremental false.", "npm run build.", "git diff --check.", "Auditoria de acesso e consentimento.", "Revisão independente."],
      "max_minutes": 55,
      "estimated_units": 2,
      "risk": "release_readiness",
      "requires_independent_review": true,
      "role": "release_readiness",
      "release_checks": {"tests":"npx vitest run","typecheck_or_build":"npx tsc --noEmit --incremental false && npm run build","adversarial_case":"auditar acesso cruzado e consentimento ausente","diff_inventory":"git diff --check e inventário de arquivos","pending_items":"registrar portões externos e proibição de deploy"},
      "model": {"initial":"luna","effort":"medium","one_escalation_to":"terra"}
    }
  ]
}
LOOP-CONTRACT:END -->
