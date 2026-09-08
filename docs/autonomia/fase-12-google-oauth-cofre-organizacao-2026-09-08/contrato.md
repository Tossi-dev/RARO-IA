---
tipo: contrato-autonomia
projeto: RARO IA
missao_id: fase-12-google-oauth-cofre-organizacao-2026-09-08
criado: 2026-09-08
status: aprovado
---

# Cartão de execução — Google OAuth e cofre por organização

- **Autorização:** Tossi, em 2026-09-08: preparar OAuth do Google Calendar e armazenamento durável, seguro e isolado por organização.
- **Meta verificável:** o MentorOS deixa de depender do cookie como armazenamento de longo prazo do refresh token; uma conexão Google é vinculada a uma única organização, cifrada antes de persistir e só pode ser usada no servidor após validação da pessoa autenticada.
- **Escopo autorizado:** modelagem local, migrations não aplicadas, cofre AES-GCM server-only, rotas OAuth locais, testes, contrato, ledger, Onde parei.md, commit e push após revisão independente.
- **Fora de escopo nesta missão:** aplicar migration no MentorOS, criar ou alterar app no Google Cloud, login em conta Google, inserir Client Secret em chat/código/Git, Vercel, produção, deploy, chamadas reais ao Google, dados reais, Pix e webhooks.
- **Próximo portão externo:** após os testes locais, Tossi autentica diretamente no Google Cloud para criar/configurar o cliente OAuth. O Client Secret será inserido somente pela pessoa administradora no gerenciador seguro de variáveis — nunca no chat ou em arquivo versionado.
- **Célula / pulso:** até 55 min por tarefa; pulso até 30 min; telemetria sem teto de bloqueio.
- **Revisão:** obrigatória e independente para código, migration ou comportamento.

<!-- LOOP-CONTRACT:START
{
  "schema_version": 3,
  "project": "RARO IA",
  "mission_id": "fase-12-google-oauth-cofre-organizacao-2026-09-08",
  "approved_by": "Tossi",
  "approved_at": "2026-09-08",
  "budget": { "tracking_mode": "telemetry" },
  "window_max_hours": 4,
  "continuation_mode": "rolling",
  "delivery_mode": "incremental",
  "max_parallel_workers": 1,
  "checkpoint_minutes": 30,
  "task_max_minutes": 55,
  "prohibited_actions": [
    "migration aplicada", "banco real", "Google Cloud", "login Google", "credencial real",
    "provedor externo", "producao", "deploy", "dinheiro", "Pix", "webhook real", "dado real"
  ],
  "tasks": [
    {
      "id": "T-133",
      "title": "Modelar cofre cifrado e schema de conexão por organização",
      "role": "implementation",
      "depends_on": [],
      "risk": "codigo-e-migration-local",
      "write_scope": [
        "repo:supabase/migrations/0044_google_calendar_conexao.sql",
        "repo:supabase/migrations/_exec_0044_google_calendar_conexao.sql",
        "repo:src/lib/integracoes/google-cofre.ts",
        "repo:src/lib/integracoes/google-cofre.test.ts",
        "repo:src/lib/integracoes/google-conexao-servidor.ts",
        "repo:src/lib/integracoes/google-conexao-servidor.test.ts",
        "repo:src/lib/supabase/migracoes.test.ts",
        "repo:src/lib/supabase/migracoes.test.ts",
        "repo:docs/autonomia/fase-12-google-oauth-cofre-organizacao-2026-09-08/**",
        "vault:Projetos/RARO IA/Autonomia/fase-12-google-oauth-cofre-organizacao-2026-09-08/**",
        "vault:Projetos/RARO IA/Onde parei.md"
      ],
      "shared_resources": ["repo:RARO IA", "lock:fase-12-google-oauth", "database:MentorOS-schema-local"],
      "acceptance": [
        "A conexão tem chave única por organização e não guarda refresh token em texto puro.",
        "A cifra usa chave exclusiva server-only, IV aleatório, tag de autenticação e versão de chave.",
        "A persistência e a leitura passam por repositório server-only e enviam ao banco somente o material cifrado.",
        "A migration ativa RLS e não permite SELECT do token por papéis de cliente."
      ],
      "validation": ["TDD unitário do cofre", "validação de pares source/_exec da migration", "Vitest focado", "npx tsc --noEmit"],
      "estimated_units": 4,
      "max_minutes": 55,
      "requires_independent_review": true,
      "model": { "initial": "luna", "effort": "medium", "one_escalation_to": "terra" },
      "local_commit_after_approval": true
    },
    {
      "id": "T-134",
      "title": "Vincular retorno OAuth à organização no servidor",
      "role": "implementation",
      "depends_on": ["T-133"],
      "risk": "oauth-local-e-seguranca",
      "write_scope": [
        "repo:src/lib/integracoes/google-agenda.ts",
        "repo:src/lib/integracoes/google-agenda-escrita.ts",
        "repo:src/lib/integracoes/google-agenda-escrita.test.ts",
        "repo:src/lib/integracoes/google-conexao-servidor.ts",
        "repo:src/lib/integracoes/google-conexao-servidor.test.ts",
        "repo:src/app/api/agenda/google/entrar/route.ts",
        "repo:src/app/api/agenda/google/retorno/route.ts",
        "repo:src/app/api/agenda/google/**/route.test.ts",
        "repo:src/lib/integracoes/google-agenda.test.ts",
        "repo:src/lib/actions.ts",
        "repo:src/lib/mentoria/acoes-calendario.ts",
        "repo:src/lib/mentoria/acoes-calendario.test.ts",
        "repo:src/app/(app)/agenda/page.tsx",
        "repo:src/app/(app)/agenda/page.test.tsx",
        "repo:src/app/(app)/mentoria/[id]/page.tsx",
        "repo:src/app/(app)/mentoria/[id]/page.test.tsx",
        "repo:supabase/migrations/0045_google_oauth_estado.sql",
        "repo:supabase/migrations/_exec_0045_google_oauth_estado.sql",
        "repo:src/app/(app)/integracoes/page.tsx",
        "repo:src/app/(app)/integracoes/page.test.tsx",
        "repo:docs/autonomia/fase-12-google-oauth-cofre-organizacao-2026-09-08/**",
        "vault:Projetos/RARO IA/Autonomia/fase-12-google-oauth-cofre-organizacao-2026-09-08/**",
        "vault:Projetos/RARO IA/Onde parei.md"
      ],
      "shared_resources": ["repo:RARO IA", "port:3000", "lock:fase-12-google-oauth", "database:MentorOS-schema-local"],
      "acceptance": [
        "O state OAuth é de uso único, expira e carrega apenas um identificador de conexão não sensível.",
        "O retorno valida sessão e organização no servidor antes de persistir token cifrado.",
        "UAT sintético continua recusando início e retorno OAuth sem revelar estado de ambiente.",
        "Não há token durável em cookie, URL, log ou HTML."
      ],
      "validation": ["TDD de state, isolamento e retorno", "Vitest focado", "npx tsc --noEmit", "varredura de segredo no diff", "revisão independente"],
      "estimated_units": 5,
      "max_minutes": 55,
      "requires_independent_review": true,
      "model": { "initial": "luna", "effort": "medium", "one_escalation_to": "terra" },
      "local_commit_after_approval": true
    },
    {
      "id": "T-135",
      "title": "Roteiro de configuração no Google Cloud e handoff seguro",
      "role": "implementation",
      "depends_on": ["T-134"],
      "risk": "documentacao-de-portao-externo",
      "write_scope": [
        "repo:docs/autonomia/fase-12-google-oauth-cofre-organizacao-2026-09-08/**",
        "repo:.env.example",
        "vault:Projetos/RARO IA/Autonomia/fase-12-google-oauth-cofre-organizacao-2026-09-08/**",
        "vault:Projetos/RARO IA/Onde parei.md"
      ],
      "shared_resources": ["repo:RARO IA", "lock:fase-12-google-oauth"],
      "acceptance": [
        "O roteiro informa telas, URLs de retorno e escopos mínimos sem revelar ou solicitar segredo.",
        "O roteiro deixa claro que Client Secret entra somente no gerenciador seguro de variáveis pelo administrador.",
        "A ação real no Google Cloud continua separada, reversível e exige sessão do Tossi."
      ],
      "validation": ["revisão de consistência com as rotas implementadas", "inventário de variáveis sem valores", "revisão independente"],
      "estimated_units": 1,
      "max_minutes": 40,
      "requires_independent_review": true,
      "model": { "initial": "luna", "effort": "medium", "one_escalation_to": "terra" },
      "local_commit_after_approval": true
    }
  ]
}
LOOP-CONTRACT:END -->
