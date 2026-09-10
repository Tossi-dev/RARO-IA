# Revisão independente T-144P

- Data: 2026-09-10
- Escopo: promoção e resolução final do alias público
- Decisão: **APROVADA**

## Evidência própria

- `vercel inspect https://raro-ia.vercel.app --scope guilhermes-projects-7de72796` resolveu o alias para `dpl_AMfnZYxN7JphEogh8Juyu6XwBwKv`, projeto `raro-ia`, target `production`, estado `Ready` e URL técnica `raro-36g5ahwfy-guilhermes-projects-7de72796.vercel.app`.
- A consulta read-only exata `/v4/aliases/raro-ia.vercel.app` confirmou alias `raro-ia.vercel.app`, project ID `prj_jzYFZYdUe1azFDKlrSwEeQ9CGpMm` e deployment ID `dpl_AMfnZYxN7JphEogh8Juyu6XwBwKv`.
- A consulta read-only `/v13/deployments/dpl_AMfnZYxN7JphEogh8Juyu6XwBwKv`, reduzida aos campos permitidos, confirmou `READY`, target `production`, o mesmo project ID e `githubCommitSha=b7479cf7f77ab596bc0379c217bb062c18dce326`.
- HEAD e `origin/mentoros` locais coincidem em `b7479cf7f77ab596bc0379c217bb062c18dce326`.
- `evidencias/publicacao-t144p.md` registra a promoção do mesmo candidato com exit 0 e `Success`.

## Limites

A aprovação confirma a publicação do código revisado no alias público. Não confirma a aparência ou o comportamento dentro da sessão autenticada real; o retorno `queued` ao abrir no Codex não foi tratado como evidência visual.

O relatório final do repositório está modificado localmente nesta conferência. Esta revisão não atesta o futuro commit/push do ledger ou da documentação.

Nenhuma integração, fornecedor, Google Cloud, banco, credencial, home, CSS global ou heartbeat foi alterado ou exercitado nesta revisão.
