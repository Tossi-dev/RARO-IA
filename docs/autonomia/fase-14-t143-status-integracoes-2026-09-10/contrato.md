# T-143 — conexão concluída e próxima integração

Tossi confirmou nesta conversa em 2026-09-10 que o Google conectou e a agenda aparece, mas a página Integrações não dá baixa nem indica a próxima integração. Este cartão delimita o reparo solicitado dentro do contrato-mestre vigente, com TDD e revisão independente. A confirmação funcional é relato do usuário, não inspeção autenticada realizada pelo agente.

Meta: Integrações deve reconhecer o mesmo vínculo por organização usado pela Agenda, parar de pedir uma conexão já concluída e orientar o próximo item real do catálogo. Preservar visual aprovado, isolamento UAT e segurança; consultar somente o estado do vínculo no fluxo normal autenticado, sem tokens/dados Calendar na UI.

Autorização de publicação da correção e Git já concedida no fluxo vigente. A vontade de conectar clientes sem lista de testadores será tratada como preparação dos requisitos OAuth públicos: nenhuma alteração de audiência, submissão ao Google, nova permissão, credencial, fornecedor ou banco nesta célula. Nunca confundir Vercel Production com aprovação OAuth do Google.

Fila: T-143 implementação e guia de pendências; T-143P build, revisão de candidato, promoção e sincronização. Um executor Terra para implementação, um revisor Sol independente; coordenador prepara documentação e verificações determinísticas. Unidades somente estimadas como telemetria. Célula 55 minutos, pulso até 30; automação permanece desativada.

<!-- LOOP-CONTRACT:START
{
  "schema_version": 3,
  "project": "RARO IA",
  "mission_id": "fase-14-t143-status-integracoes-2026-09-10",
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
    "segredos em logs/Git/chat",
    "ler eventos/credenciais reais para diagnostico",
    "migrations/RLS/escrita no banco",
    "rotacionar credenciais",
    "alterar publicacao/verificacao Google Cloud",
    "conectar novos fornecedores",
    "consentir pelo usuario",
    "reativar heartbeat",
    "alterar tela inicial ou design global"
  ],
  "tasks": [
    {
      "id": "T-143",
      "title": "Refletir conexao Google por organizacao e proximo passo verdadeiro",
      "role": "implementation",
      "depends_on": [],
      "risk": "estado-por-workspace-e-UX",
      "write_scope": [
        "repo:src/app/(app)/integracoes/page.tsx",
        "repo:src/app/(app)/integracoes/page.test.tsx",
        "repo:src/lib/integracoes/conexao-assistida.ts",
        "repo:src/lib/integracoes/conexao-assistida.test.ts",
        "repo:docs/autonomia/fase-14-t143-status-integracoes-2026-09-10/**",
        "vault:Projetos/RARO IA/Autonomia/fase-14-t143-status-integracoes-2026-09-10/**",
        "vault:Projetos/RARO IA/Onde parei.md"
      ],
      "shared_resources": [
        "repo:RARO IA"
      ],
      "acceptance": [
        "Google conectado usa status autenticado por organizacao, nao GOOGLE_REFRESH_TOKEN",
        "Cartao e KPI concordam; OAuth cobre leitura sem exigir iCal adicional",
        "Conexao concluida deixa de oferecer conectar e indica proximo item pendente sem atalho falso",
        "UAT nao consulta conexao real; erro e revogacao nunca anunciam sucesso; nenhum token enviado a UI",
        "Preservar identidade visual e tela inicial",
        "Documentar pendencias para OAuth publico sem afirmar verificacao Google concluida"
      ],
      "validation": [
        "TDD vermelho/verde focado",
        "Regressao de integracoes e OAuth",
        "TypeScript",
        "Revisao independente diferente do executor",
        "Diff e dados sinteticos sem rede"
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
      "id": "T-143P",
      "title": "Publicar correcao revisada e sincronizar evidencias",
      "role": "implementation",
      "depends_on": [
        "T-143"
      ],
      "risk": "publicacao-correcao-ja-autorizada",
      "write_scope": [
        "Vercel:raro-ia deploy revisado e promocao",
        "Git:origin/mentoros",
        "repo:docs/autonomia/fase-14-t143-status-integracoes-2026-09-10/**",
        "vault:Projetos/RARO IA/Autonomia/fase-14-t143-status-integracoes-2026-09-10/**",
        "vault:Projetos/RARO IA/Onde parei.md"
      ],
      "shared_resources": [
        "repo:RARO IA",
        "vercel:raro-ia"
      ],
      "acceptance": [
        "Upload exclui segredos e builds locais",
        "Build Ready revisado antes da promocao; dominio aponta para deployment aprovado",
        "SHA remoto confirmado e limite da verificacao autenticada explicito"
      ],
      "validation": [
        "Inventario do upload",
        "Build Next.js remoto",
        "Revisao independente das evidencias",
        "vercel inspect do alias",
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
