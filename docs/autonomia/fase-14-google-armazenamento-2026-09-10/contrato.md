# T-142 — Diagnosticar a falha real de armazenamento do OAuth

Autorização: continuidade da correção Google Calendar já solicitada por Tossi; pedido atual em 2026-09-10: "continua dando erro". Não é autorização nova para ampliar acesso.

Meta: identificar a resposta real do armazenamento sem expor credenciais ou dados, corrigir apenas a causa comprovada dentro da autorização existente e não afirmar conexão concluída antes de comprová-la.

Escopo: preflight somente leitura no ambiente Production da Vercel em build sem promover domínio; código/testes do diagnóstico e mensagem da Agenda; contrato, evidências, commit/push origin/mentoros. Nenhuma leitura de registros de clientes: consultas com limit=0. Sem migrations, alteração de RLS, troca de chave, envio de e-mail, eventos Calendar ou acesso a outro projeto. Publicação da correção somente após testes e revisão independente.

Evidência inicial real: em 2026-09-10 a última tentativa de /api/agenda/google/entrar registrou motivo erro_de_armazenamento no deployment dpl_6uZ9t9BHRR83QvqEFoRF7DXBmkcZ. Isso localiza a falha no insert google_oauth_estado, antes do consentimento. A mensagem atual de erro=conexao não comprova autorização Google.

Método: TDD, typecheck, revisão independente em outro modelo; célula de 55 minutos, pulso em até 30 minutos. Unidades somente telemetria estimada, nunca medição exata. Automação continua desativada.

<!-- LOOP-CONTRACT:START
{
  "schema_version": 3,
  "project": "RARO IA",
  "mission_id": "fase-14-google-armazenamento-2026-09-10",
  "approved_by": "Tossi",
  "approved_at": "2026-09-10",
  "budget": { "tracking_mode": "telemetry" },
  "window_max_hours": 2,
  "continuation_mode": "rolling",
  "delivery_mode": "incremental",
  "max_parallel_workers": 1,
  "checkpoint_minutes": 30,
  "task_max_minutes": 55,
  "prohibited_actions": ["segredos em logs/Git/chat", "leitura de registros de clientes", "escrita no banco", "alterar RLS/migrations", "rotacionar credenciais", "outro projeto", "reativar heartbeat"],
  "tasks": [
    {
      "id": "T-142",
      "title": "Preflight seguro somente leitura e mensagem de erro fiel à etapa",
      "role": "implementation",
      "depends_on": [],
      "risk": "diagnostico-servidor",
      "write_scope": ["repo:scripts/verificar-google-servidor.mjs", "repo:scripts/verificar-google-servidor.test.ts", "repo:src/app/(app)/agenda/page.tsx", "repo:src/app/(app)/agenda/page.test.tsx", "repo:docs/autonomia/fase-14-google-armazenamento-2026-09-10/**", "vault:Projetos/RARO IA/Autonomia/fase-14-google-armazenamento-2026-09-10/**"],
      "shared_resources": ["repo:RARO IA"],
      "acceptance": ["Somente GET limit=0 no projeto MentorOS fixo", "Nenhum segredo, mensagem bruta ou registro no resultado", "Erros desconhecidos falham fechados", "Mensagem da Agenda não confunde entrada com consentimento concluído"],
      "validation": ["TDD focal incluindo host estrangeiro e erros contendo segredos", "npx tsc --noEmit", "revisão independente"],
      "estimated_units": 3,
      "max_minutes": 55,
      "requires_independent_review": true,
      "model": {"initial":"terra", "effort":"high", "one_escalation_to":"sol"},
      "local_commit_after_approval": false
    },
    {
      "id": "T-142R",
      "title": "Executar preflight sem promover produção e registrar causa comprovada",
      "role": "implementation",
      "depends_on": ["T-142"],
      "risk": "leitura-configurada-vercel",
      "write_scope": ["Vercel:raro-ia build Production sem promover domínio", "repo:docs/autonomia/fase-14-google-armazenamento-2026-09-10/**", "vault:Projetos/RARO IA/Autonomia/fase-14-google-armazenamento-2026-09-10/**", "vault:Projetos/RARO IA/Onde parei.md"],
      "shared_resources": ["repo:RARO IA", "vercel:raro-ia"],
      "acceptance": ["Deploy vigente preservado durante diagnóstico", "HTTP status e código de erro classificados sem valores secretos", "Pendências de acesso não são declaradas resolvidas sem teste final"],
      "validation": ["Inventário de upload sem .env e build local", "Build log sanitizado", "Revisão independente das evidências", "SHA origin/mentoros verificado"],
      "estimated_units": 2,
      "max_minutes": 55,
      "requires_independent_review": true,
      "model": {"initial":"script", "effort":"medium"},
      "local_commit_after_approval": false
    }
  ]
}
LOOP-CONTRACT:END -->
