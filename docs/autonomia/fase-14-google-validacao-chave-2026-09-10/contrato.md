# Continuação T-142 — validar a chave atual e publicar

Tossi informou "feito" em 2026-09-10 após a orientação para substituir a Secret key na variável existente de Vercel Production. A autorização já concedida inclui verificação e publicação do conserto Google Calendar. Esta célula não troca nem lê valores de credenciais.

O histórico da missão fase-14-google-armazenamento-2026-09-10 permanece preservado: T-142 aprovada, diagnóstico anterior HTTP401 legacy_disabled e T-142R pausada. O controlador não permite start direto de tarefa pausada; esta continuação replaneja somente a verificação após a mudança externa informada, sem inventar um congelamento ou apagar eventos.

Meta: obter GET200/[] no preflight de ambas tabelas técnicas, construir candidato do código revisado e promover apenas esse candidato após revisão. Não declarar OAuth completo sem entrada/consentimento/retorno comprovados.

Código-base revisado: a7123232d5ed65eed7f0c85ba6a3fb1df694fa89 em origin/mentoros. Preflight fixo de leitura, limit=0 e saída fechada; build com --prod --skip-domain. Manter domínio atual até aprovação. Publicação e commit/push já autorizados; nenhuma migration, RLS, escrita de dados, evento Calendar, novo segredo ou heartbeat.

<!-- LOOP-CONTRACT:START
{
  "schema_version": 3,
  "project": "RARO IA",
  "mission_id": "fase-14-google-validacao-chave-2026-09-10",
  "approved_by": "Tossi",
  "approved_at": "2026-09-10",
  "budget": {"tracking_mode":"telemetry"},
  "window_max_hours": 2,
  "continuation_mode": "rolling",
  "delivery_mode": "incremental",
  "max_parallel_workers": 1,
  "checkpoint_minutes": 30,
  "task_max_minutes": 55,
  "prohibited_actions": ["segredos em logs/Git/chat", "ler registros de clientes", "escrita no banco/migrations/RLS", "rotacionar credenciais", "outro projeto", "reativar heartbeat", "consentir pelo usuário"],
  "tasks": [
    {
      "id":"T-142V", "title":"Revalidar chave alterada e construir candidato sem promover",
      "role":"implementation", "depends_on":[], "risk":"validacao-configuracao-servidor",
      "write_scope":["Vercel:raro-ia build Production sem promover domínio", "repo:docs/autonomia/fase-14-google-validacao-chave-2026-09-10/**", "vault:Projetos/RARO IA/Autonomia/fase-14-google-validacao-chave-2026-09-10/**", "vault:Projetos/RARO IA/Onde parei.md"],
      "shared_resources":["repo:RARO IA", "vercel:raro-ia"],
      "acceptance":["Preflight retorna HTTP200 e array vazio nas duas tabelas", "Build candidato Ready e domínio atual preservado", "Nenhum segredo ou registro em evidências"],
      "validation":["Vitest focal e regressão OAuth", "TypeScript", "inventário de upload", "preflight real filtrado", "build remoto e revisão independente"],
      "estimated_units":2, "max_minutes":55, "requires_independent_review":true,
      "model":{"initial":"script","effort":"medium"}, "local_commit_after_approval":false
    },
    {
      "id":"T-142P", "title":"Promover candidato aprovado e registrar limite da validação OAuth",
      "role":"implementation", "depends_on":["T-142V"], "risk":"publicacao-ja-autorizada",
      "write_scope":["Vercel:raro-ia promoção do deployment aprovado para raro-ia.vercel.app", "repo:docs/autonomia/fase-14-google-validacao-chave-2026-09-10/**", "vault:Projetos/RARO IA/Autonomia/fase-14-google-validacao-chave-2026-09-10/**", "vault:Projetos/RARO IA/Onde parei.md", "Git:origin/mentoros documentação sem segredos"],
      "shared_resources":["repo:RARO IA", "vercel:raro-ia"],
      "acceptance":["Domínio público aponta para o candidato aprovado Ready", "Contexto e SHA remoto verificados", "Consentimento e persistência ainda não testados permanecem explícitos"],
      "validation":["vercel inspect do domínio e deployment", "revisão independente das evidências", "git diff sem segredos e SHA remoto igual"],
      "estimated_units":1, "max_minutes":55, "requires_independent_review":true,
      "model":{"initial":"script","effort":"medium"}, "local_commit_after_approval":false
    }
  ]
}
LOOP-CONTRACT:END -->
