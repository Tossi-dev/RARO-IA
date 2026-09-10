# T-143P — candidato para publicação

2026-09-10. Correção T-143 aprovada em revisão independente Sol R2, com 108/108 testes de regressão e TypeScript exit 0.

- Código e contexto enviados para origin/mentoros: `9d07f9bffeb99abc9b665c9c41bd30f6b199be45`; `git ls-remote` confirmou o mesmo SHA e worktree estava limpo.
- Vercel CLI autenticada na conta já configurada, projeto `prj_jzYFZYdUe1azFDKlrSwEeQ9CGpMm`, equipe `team_ERPRO2NpUKp7P0llS05hnRpf`, escopo `guilhermes-projects-7de72796`. Consulta de metadados confirmou que o projeto não está ligado a Git para deploy automático.
- Inventário `vercel deploy --dry --json`: 667 entradas, 6.761.794 bytes. Nenhum arquivo de ambiente, segredo ou build local. O manifesto contém apenas dois marcadores vazios de diretório: `docs` e `.next-stale-t122`, ambos size=0, mode=16822, diretórios confirmados no filesystem e sem descendentes no manifesto; seus conteúdos não são enviados. Nada foi apagado.
- Varredura de padrões de chaves nos quatro arquivos de código/teste e documentos não encontrou correspondência. `git diff --cached --check` passou após remover linhas finais vazias de dois documentos, sem alterar semântica.

## Build isolado do domínio principal

Comando: `vercel deploy . --prod --skip-domain --yes --no-wait --scope guilhermes-projects-7de72796 --meta tarefa=T-143 --meta revisao=sol-r2`.

Candidato: `dpl_2Z3W8dR8rRHjuEg9ziuvmChnnHPj`.
URL técnica: https://raro-gi0egwfrx-guilhermes-projects-7de72796.vercel.app.

Consulta Vercel v13 confirmou: READY, target production, projeto correto e meta.githubCommitSha `9d07f9bffeb99abc9b665c9c41bd30f6b199be45`.

Trechos permitidos do build: Compiled successfully às 20:17:54Z; checagem de tipos; rota dinâmica /integracoes; Build Completed [46s] às 20:18:23Z; Deployment completed às 20:18:31Z. Saída filtrada, sem logs OAuth de usuários ou dados de ambiente.

GET exato do alias `raro-ia.vercel.app` ainda aponta para `dpl_8kqfYK9WB559jamK4oe1oEkjDvBd`, versão anterior; o candidato ainda não foi promovido. A promoção aguarda revisão independente desse candidato.

## Limite

Build Ready não confirma a visualização autenticada na sessão do usuário. Nenhuma nova conexão real, evento, alteração de banco/credencial, audiência Google ou heartbeat. A publicação pública do OAuth não faz parte deste candidato.
