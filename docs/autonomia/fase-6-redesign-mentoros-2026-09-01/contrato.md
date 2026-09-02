---
schema_version: 3
projeto: RARO IA
missao_id: fase-6-redesign-mentoros-2026-09-01
estado: em_execucao
autorizacao: Contrato de redesign aprovado explicitamente pelo Tossi em 2026-09-01
janela_maxima: rolling
pulso_maximo: 30min
executor: Luna-medio
revisor: independente
---

# Contrato-mestre — Fase 6: redesign MentorOS

## Objetivo verificável

Transformar a interface do MentorOS em um produto de mentoria profissional
coeso, inspirado na linguagem visual do Atlas: escuro profundo, um azul de
ação, hierarquia editorial e movimento discreto. O produto mantém rotas,
permissões, ações, dados e integrações existentes.

## Limites absolutos

Esta fase é local. Não altera migrations, RLS, Supabase, dados reais,
credenciais, fornecedor de transcrição, produção ou deploy. Não muda regras
de acesso nem expõe conteúdo privado. O redesenho não copia dependências,
imagens ou código do Atlas.

## Padrão de qualidade

Cada tarefa usa TDD quando houver comportamento renderizável, validação
focada, TypeScript e revisão independente. A revisão visual confere desktop,
celular, teclado, foco, estados vazios/erro/carregamento e redução de
movimento. Cada tarefa aprovada atualiza o ledger, `Onde parei.md`, recebe
commit descritivo e push verificado em `origin/mentoros`.

<!-- LOOP-CONTRACT:START
{
  "schema_version": 3,
  "project": "RARO IA",
  "mission_id": "fase-6-redesign-mentoros-2026-09-01",
  "approved_by": "Tossi",
  "approved_at": "2026-09-01",
  "continuation_mode": "rolling",
  "delivery_mode": "incremento_tecnico",
  "window_max_hours": 24,
  "task_max_minutes": 55,
  "checkpoint_minutes": 30,
  "max_parallel_workers": 1,
  "tasks": [
    {
      "id": "T-105",
      "title": "Fundação visual e correção do formulário de áudio",
      "depends_on": [],
      "write_scope": ["src/app/globals.css", "src/components/ui.tsx", "src/app/login/page.tsx", "src/app/(app)/mentoria/[id]/visao.tsx", "src/app/(app)/mentoria/[id]/visao.test.tsx", "docs/autonomia/fase-6-redesign-mentoros-2026-09-01/**"],
      "shared_resources": ["repo:RARO IA", "lock:fase-6-redesign"],
      "acceptance": ["Tokens e primitivas passam a expressar uma hierarquia operacional consistente, sem alterar contratos de dados ou rotas.", "O formulário de upload de áudio com Server Action não declara encType/method manualmente.", "A ficha continua exigindo consentimento explícito antes do vínculo de áudio."],
      "validation": ["npx vitest run src/app/(app)/mentoria/[id]/visao.test.tsx", "npx tsc --noEmit --incremental false", "Inspeção local de /login e revisão independente."],
      "max_minutes": 55,
      "estimated_units": 2,
      "risk": "codigo-interface",
      "requires_independent_review": true,
      "model": {"initial": "luna", "effort": "medium", "one_escalation_to": "terra"}
    },
    {
      "id": "T-106",
      "title": "Shell, acesso e início orientados à mentoria",
      "depends_on": ["T-105"],
      "write_scope": ["src/app/login/page.tsx", "src/app/(app)/layout.tsx", "src/app/(app)/page.tsx", "src/components/topbar.tsx", "src/components/menu-mobile.tsx", "src/components/springboard.tsx", "src/components/sidebar.tsx", "src/**/*.test.tsx", "docs/autonomia/fase-6-redesign-mentoros-2026-09-01/**"],
      "shared_resources": ["repo:RARO IA", "lock:fase-6-redesign"],
      "acceptance": ["A entrada e o shell destacam o trabalho do mentor sem remover rotas nem ações disponíveis por papel.", "Desktop e celular preservam navegação acessível."],
      "validation": ["Testes de componentes/rotas alterados", "npx tsc --noEmit --incremental false", "Inspeção visual local em desktop e celular", "Revisão independente."],
      "max_minutes": 55,
      "estimated_units": 3,
      "risk": "codigo-interface",
      "requires_independent_review": true,
      "model": {"initial": "luna", "effort": "medium", "one_escalation_to": "terra"}
    },
    {
      "id": "T-107",
      "title": "Carteira, ficha, mapa e plano de ação",
      "depends_on": ["T-106"],
      "write_scope": ["src/app/(app)/mentoria/**", "src/components/ficha-diagnostico.tsx", "src/**/*.test.tsx", "docs/autonomia/fase-6-redesign-mentoros-2026-09-01/**"],
      "shared_resources": ["repo:RARO IA", "lock:fase-6-redesign"],
      "acceptance": ["A jornada do cliente fica legível para atendimento: contexto, perguntas, mapa, metas e próximos passos.", "Nenhuma seção imprime transcrição ou dado sem a projeção já autorizada."],
      "validation": ["Testes de mentoria alterados", "npx tsc --noEmit --incremental false", "Revisão visual e independente."],
      "max_minutes": 55,
      "estimated_units": 3,
      "risk": "codigo-interface-sensivel",
      "requires_independent_review": true,
      "model": {"initial": "luna", "effort": "medium", "one_escalation_to": "terra"}
    },
    {
      "id": "T-108",
      "title": "Agenda, sessão, transcrição privada e grafo",
      "depends_on": ["T-107"],
      "write_scope": ["src/app/(app)/agenda/page.tsx", "src/app/(app)/mentoria/[id]/**", "src/components/timeline.tsx", "src/**/*.test.tsx", "docs/autonomia/fase-6-redesign-mentoros-2026-09-01/**"],
      "shared_resources": ["repo:RARO IA", "lock:fase-6-redesign"],
      "acceptance": ["Sessão e agenda ficam operacionais e claras; conteúdo privado permanece por padrão fora da superfície.", "Grafo apresenta relações sem afirmar diagnóstico, terapia ou causa clínica."],
      "validation": ["Testes de rota/componentes alterados", "npx tsc --noEmit --incremental false", "Revisão visual e independente."],
      "max_minutes": 55,
      "estimated_units": 3,
      "risk": "codigo-interface-sensivel",
      "requires_independent_review": true,
      "model": {"initial": "luna", "effort": "medium", "one_escalation_to": "terra"}
    },
    {
      "id": "T-109",
      "title": "CRM, financeiro e indicadores no sistema visual",
      "depends_on": ["T-108"],
      "write_scope": ["src/app/(app)/crm/**", "src/app/(app)/financeiro/**", "src/app/(app)/painel/page.tsx", "src/components/fin-*.tsx", "src/components/comando-*.tsx", "src/**/*.test.tsx", "docs/autonomia/fase-6-redesign-mentoros-2026-09-01/**"],
      "shared_resources": ["repo:RARO IA", "lock:fase-6-redesign"],
      "acceptance": ["Métricas e dados financeiros mantêm precisão, origem e densidade, mas deixam de dominar a identidade da experiência de mentoria.", "Nenhum cálculo, ação financeira ou escopo de acesso é alterado."],
      "validation": ["Testes de rota/componentes alterados", "npx tsc --noEmit --incremental false", "Revisão visual e independente."],
      "max_minutes": 55,
      "estimated_units": 3,
      "risk": "codigo-interface",
      "requires_independent_review": true,
      "model": {"initial": "luna", "effort": "medium", "one_escalation_to": "terra"}
    },
    {
      "id": "T-110",
      "title": "Gate de qualidade visual e técnica",
      "depends_on": ["T-109"],
      "write_scope": ["docs/operacao/**", "docs/autonomia/fase-6-redesign-mentoros-2026-09-01/**", "C:\\Users\\PC\\OneDrive\\Área de Trabalho\\Dev.Tossi\\Projetos\\RARO IA\\Onde parei.md"],
      "shared_resources": ["repo:RARO IA", "lock:fase-6-redesign"],
      "acceptance": ["As superfícies alteradas passam em validações técnicas e revisão visual independente; pendências externas são nomeadas sem promessa de deploy.", "O relatório separa claramente pronto localmente de qualquer ação externa."],
      "validation": ["npx vitest run", "npx tsc --noEmit --incremental false", "npm run build", "git diff --check", "Inventário do diff e revisão independente."],
      "max_minutes": 55,
      "estimated_units": 2,
      "risk": "release_readiness",
      "requires_independent_review": true,
      "role": "release_readiness",
      "release_checks": ["npx vitest run", "npx tsc --noEmit --incremental false", "npm run build", "git diff --check", "revisão visual desktop/celular/teclado", "inventário de pendências externas: não aplicável a deploy, banco ou fornecedor nesta fase"],
      "model": {"initial": "luna", "effort": "medium", "one_escalation_to": "terra"}
    }
  ]
}
LOOP-CONTRACT:END -->
