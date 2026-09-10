# T-142P — publicação autorizada

2026-09-10, após a revisão independente de T-142V aprovar exatamente dpl_8kqfYK9WB559jamK4oe1oEkjDvBd, com 37 testes, TypeScript, preflight real HTTP200/[] e build Ready.

Comando executado: `vercel promote dpl_8kqfYK9WB559jamK4oe1oEkjDvBd --scope guilhermes-projects-7de72796 --yes --timeout 45s`. Exit0 e resposta Success da promoção para raro-ia.

Pós-verificação: `vercel inspect https://raro-ia.vercel.app --scope guilhermes-projects-7de72796` resolveu o domínio para dpl_8kqfYK9WB559jamK4oe1oEkjDvBd, Ready, URL técnica raro-dz4xy0qm5-guilhermes-projects-7de72796.vercel.app. Código-base do candidato é a7123232d5ed65eed7f0c85ba6a3fb1df694fa89. Somente documentação foi editada no repositório após o upload; nenhuma alteração adicional de aplicação.

Confirmação adicional exata via GET Vercel `/v4/aliases/raro-ia.vercel.app`: alias raro-ia.vercel.app, projectId prj_jzYFZYdUe1azFDKlrSwEeQ9CGpMm, deployment.id dpl_8kqfYK9WB559jamK4oe1oEkjDvBd. Saída limitada a alias/projeto/deployment/URL. Isso elimina a ambiguidade da lista parcial de aliases do CLI.

Chave legada não foi reativada; a nova configuração foi fornecida diretamente pelo usuário no gerenciador seguro. Nenhuma chave/cofre foi criada, lida/copied ou rotacionada pelo agente; nenhuma migration/RLS/dado foi alterada. Nenhuma automação reativada.

## Limites

GET200/[] e publicação Ready não são prova de INSERT nem de OAuth completo. Nenhum login/consentimento/retorno/persistência/consulta de eventos foi executado nesta célula. A Agenda está disponível para a pessoa iniciar Conectar com o Google e autorizar a conta. O navegador Windows não está disponível nesta sessão; a solicitação de abrir a Agenda no Codex retornou queued, não prova de página aberta nem de navegação concluída.

Revisão documental final Sol aprovada: o revisor executou sua própria consulta do domínio e confirmou o candidato exato Ready; não atestou commit/push ainda não executados. A sincronização dos registros ainda está pendente nesta versão. Não afirmar que a integração está inteiramente homologada.

## Fechamento da sincronização

Após a revisão, os registros foram enviados em `c624a356e4c4a16a7081ceb78c78b85d2af11f07` (`docs(agenda): registrar chave validada e publicação revisada`). O coordenador confirmou esse mesmo SHA com `git ls-remote origin refs/heads/mentoros`; `git status --short` vazio após o push. A checagem de segredos nos documentos não encontrou correspondências e `git diff --check` passou. Esse commit contém somente documentação; a versão de aplicação publicada continua a7123232d5ed65eed7f0c85ba6a3fb1df694fa89.

Esta tarefa encerra publicação e registro, não o teste funcional do consentimento OAuth. Telemetria desta tarefa: 1 unidade estimada, sem medição de consumo disponível.
