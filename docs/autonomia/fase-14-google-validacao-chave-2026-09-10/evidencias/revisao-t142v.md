# Revisão independente T-142V

- Data: 2026-09-10
- Escopo: contrato, `evidencias/validacao-chave.md`, identidade do candidato e limites do preflight
- Decisão: **APROVADA para promoção do candidato identificado**

## Conferência

- Repositório local confirmado limpo na branch `mentoros`, HEAD `a7123232d5ed65eed7f0c85ba6a3fb1df694fa89`.
- A evidência registra preflight real com HTTP 200, código `ok` e resposta vazia nas duas tabelas técnicas, sem dados ou mensagens brutas.
- `vercel inspect dpl_8kqfYK9WB559jamK4oe1oEkjDvBd --scope guilhermes-projects-7de72796` foi repetido nesta revisão e confirmou: projeto `raro-ia`, target `production`, estado `Ready` e URL técnica `raro-dz4xy0qm5-guilhermes-projects-7de72796.vercel.app`. O alias principal `raro-ia.vercel.app` não aparece entre os aliases do candidato.
- A versão JSON desta CLI confirmou novamente ID, target e `readyState=READY`, mas não retornou SHA ou project ID. A associação do candidato ao SHA `a712...` e ao project ID permanece apoiada na evidência registrada pela execução, não foi reconfirmada pelo meu `inspect`.
- A regressão 37/37 e o TypeScript exit 0 estão documentados pelo executor/coordenador. Não foram repetidos nesta revisão curta porque o código já havia sido aprovado na R2 e não houve novo delta.

## Coerência e limites

O deployment vigente documentado `dpl_4vwnXmfgkHNuJAWsGh83zNENTpPD` é um redeploy do upload anterior `dpl_26aaYy7D7pFtrgKxq3VM6CFGnfY1`. O SHA antigo nos metadados desse upload é coerente com o envio anterior feito antes do commit; isoladamente, ele não prova alteração desconhecida nem é base suficiente para promover esse runtime. O candidato `dpl_8kq...` é o artefato indicado para promoção por estar documentado como construído do código versionado `a712...` e por ter passado o preflight após a troca segura da chave.

O GET 200/[] remove a recusa anterior `legacy_disabled` e confirma somente acesso de leitura vazia às duas relações selecionadas. Não comprova `INSERT` em `google_oauth_estado`, entrada/consentimento/callback Google, cifra, persistência em `google_calendar_conexao` ou leitura de eventos. O OAuth continua **não validado ponta a ponta**.

Esta aprovação autoriza apenas o coordenador a avançar para a T-142P já prevista no contrato: promover exatamente `dpl_8kqfYK9WB559jamK4oe1oEkjDvBd` e depois conferir documentalmente o alias. Não autoriza troca de credencial, banco, migrations, RLS, consentimento em nome do usuário ou qualquer outro deployment.

Nenhum segredo aparece nos artefatos revisados. Esta revisão não leu logs brutos, variáveis, banco ou dados de clientes; não usou browser; e não modificou código, Git ou deployment.
