# Revisão independente T-142P

- Data: 2026-09-10
- Escopo: promoção e documentação do alias público
- Decisão: **APROVADA**

## Evidência

- `evidencias/publicacao.md` registra `vercel promote dpl_8kqfYK9WB559jamK4oe1oEkjDvBd` com exit 0 e resposta `Success`.
- Repeti nesta revisão `vercel inspect https://raro-ia.vercel.app --scope guilhermes-projects-7de72796`. O domínio resolveu para `dpl_8kqfYK9WB559jamK4oe1oEkjDvBd`, projeto `raro-ia`, target `production`, estado `Ready` e URL técnica `raro-dz4xy0qm5-guilhermes-projects-7de72796.vercel.app`.
- A confirmação adicional do alias, project ID e deployment ID pela API Vercel foi avaliada somente a partir da evidência registrada; não repeti essa chamada.
- O repositório permanece no HEAD `a7123232d5ed65eed7f0c85ba6a3fb1df694fa89`. O status atual mostra apenas documentação modificada/nova, sem alteração adicional de aplicação.

## Limites

A publicação confirma que o código candidato revisado está no alias público e que o preflight do build deixou de sofrer o 401 por chave legada. Não comprova `INSERT` em `google_oauth_estado`, login/consentimento Google, callback, persistência em `google_calendar_conexao` nem consulta de eventos.

Portanto, a integração Google Calendar ainda não está homologada ponta a ponta. A próxima evidência funcional depende de uma pessoa iniciar `Conectar com o Google`, consentir e verificar a persistência. Nenhuma dessas ações foi executada por esta revisão.

Commit, push e verificação do SHA remoto dos documentos continuam pendentes para o coordenador e não fazem parte desta aprovação. Não acessei logs, variáveis, banco, dados de clientes ou browser e não modifiquei código nem Git.
