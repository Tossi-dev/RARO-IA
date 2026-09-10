# T-144 — todas as integrações e pendências visíveis

Tossi solicitou explicitamente mostrar todas as integrações que faltam, pois o painel anterior mostrava somente a próxima e escondia o restante. Este contrato curto delimita a correção da mesma página, dentro do contrato-mestre e fluxo de publicação e Git já autorizados. Não amplia para ativação real de fornecedor.

Meta verificável: o usuário vê na página principal o inventário completo atual e TODAS as pendências, inclusive parciais, sem depender do diagnóstico técnico, limite de linhas ou só próxima tarefa. Cada pendência explica o que falta e quem resolve, com ação segura apenas onde implementada. Preservar o Google conectado, isolamento UAT, privacidade, home e identidade visual.

Fila: T-144 TDD/implementação Terra e revisão Sol; T-144P build/candidato/revisão/promoção e registros. Um executor, célula de 55 minutos, unidades estimadas apenas como telemetria. Heartbeat permanece desativado. Nenhuma conexão será ativada por abrir a lista; Google OAuth público continua separado.

<!-- LOOP-CONTRACT:START
{
  "schema_version": 3,
  "project": "RARO IA",
  "mission_id": "fase-14-t144-pendencias-integracoes-2026-09-10",
  "approved_by": "Tossi",
  "approved_at": "2026-09-10",
  "budget": {
    "tracking_mode": "telemetry"
  },
  "window_max_hours": 2,
  "continuation_mode": "rolling",
  "delivery_mode": "incremental",
  "max_parallel_workers": 1,
  "checkpoint_minutes": 30,
  "task_max_minutes": 55,
  "prohibited_actions": [
    "segredos em UI/chat/logs/Git",
    "banco/migrations/RLS/credenciais",
    "novas conexoes ou chamadas a fornecedores",
    "alterar Google Cloud/publicacao OAuth",
    "alterar home/estilos globais",
    "reativar heartbeat"
  ],
  "tasks": [
    {
      "id": "T-144",
      "title": "Mostrar todas as integracoes pendentes sem recorte ou detalhes ocultos",
      "role": "implementation",
      "depends_on": [],
      "risk": "lista-completa-e-status-honesto",
      "write_scope": [
        "repo:src/app/(app)/integracoes/page.tsx",
        "repo:src/app/(app)/integracoes/page.test.tsx",
        "repo:src/lib/integracoes/conexao-assistida.ts",
        "repo:src/lib/integracoes/conexao-assistida.test.ts",
        "repo:docs/autonomia/fase-14-t144-pendencias-integracoes-2026-09-10/**",
        "vault:Projetos/RARO IA/Autonomia/fase-14-t144-pendencias-integracoes-2026-09-10/**",
        "vault:Projetos/RARO IA/Onde parei.md"
      ],
      "shared_resources": [
        "repo:RARO IA"
      ],
      "acceptance": [
        "Lista completa do inventario atual visivel na pagina principal sem abrir diagnostico",
        "Todas as pendentes e parciais visiveis com nome, motivo, responsavel e proximo passo; sem slice/line-clamp",
        "Google conectado nao reaparece nas pendencias; iCal opcional nao vira uma pendencia artificial",
        "Contagens coerentes com listas e estado vazio honesto",
        "UAT preservado, sem redes novas, sem chaves/instrucoes tecnicas de credencial no guia",
        "Home e design global inalterados"
      ],
      "validation": [
        "TDD focado RED/GREEN com dados sinteticos e listas completas fora de details",
        "Regressao de integracoes e OAuth",
        "tsc --noEmit",
        "revisao independente por Sol",
        "git diff --check"
      ],
      "estimated_units": 3,
      "max_minutes": 55,
      "requires_independent_review": true,
      "model": {
        "initial": "terra",
        "effort": "medium",
        "escalation": "sol"
      },
      "local_commit_after_approval": false
    },
    {
      "id": "T-144P",
      "title": "Publicar correcao revisada e sincronizar evidencias",
      "role": "implementation",
      "depends_on": [
        "T-144"
      ],
      "risk": "publicacao-reparo-da-pagina-no-fluxo-vigente",
      "write_scope": [
        "Vercel:raro-ia deploy revisado e promocao",
        "Git:origin/mentoros",
        "repo:docs/autonomia/fase-14-t144-pendencias-integracoes-2026-09-10/**",
        "vault:Projetos/RARO IA/Autonomia/fase-14-t144-pendencias-integracoes-2026-09-10/**",
        "vault:Projetos/RARO IA/Onde parei.md"
      ],
      "shared_resources": [
        "repo:RARO IA",
        "vercel:raro-ia"
      ],
      "acceptance": [
        "Inventario de upload sem segredos ou builds locais",
        "Build Ready e candidato aprovado antes da promocao",
        "Alias aponta para deployment revisado e SHA remoto confirmado",
        "Limites da homologacao autenticada explicitos"
      ],
      "validation": [
        "dry upload",
        "build remoto",
        "revisao independente das evidencias",
        "alias exato",
        "git ls-remote"
      ],
      "estimated_units": 1,
      "max_minutes": 55,
      "requires_independent_review": true,
      "model": {
        "initial": "script",
        "effort": "medium"
      },
      "local_commit_after_approval": false
    }
  ]
}
LOOP-CONTRACT:END -->
