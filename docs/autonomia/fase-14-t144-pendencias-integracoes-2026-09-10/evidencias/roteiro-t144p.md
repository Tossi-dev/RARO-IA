# Publicação T-144P — roteiro delimitado

Aguardando T-144 aprovada. Não é evidência de deploy.

1. Validar regressão e TypeScript concluídos; revisão independente de código aprovada.
2. Revisar inventário do diff e segredos. Commit descritivo e push de arquivos explícitos; confirmar SHA remoto.
3. Executar dry upload JSON com scope guilhermes-projects-7de72796; proibir segredos/.env/builds locais e conferir stubs de diretório sem filhos antes de classificar falsos positivos.
4. Criar candidato no mesmo projeto com --prod --skip-domain --yes --no-wait, sem mover o domínio. A publicação deste reparo permanece no fluxo autorizado da página; não configura nenhum fornecedor.
5. Conferir build Ready/projeto/SHA e revisão Sol independente do candidato.
6. Promover apenas o ID revisado; consultar alias exato raro-ia.vercel.app para confirmar que aponta ao candidato.
7. Fechar ledger, sincronizar evidências sem segredos, comparar SHA remoto e registrar a limitação da sessão real não inspecionada. Nenhum redeploy por documentação.

As skills de publicação orientam o preflight e a checagem de metadados; não executar curl/fetch da URL publicada. Usar renderização sintética/testes para a UI e metadados para a publicação. Heartbeat permanece desativado.
