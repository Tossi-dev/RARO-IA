# T-143P — publicação do reparo

Data: 2026-09-10. Candidato aprovado por Sol em revisao-t143p-candidato.md, após build READY e revisão de código T-143 R2.

Comando real: `vercel promote dpl_2Z3W8dR8rRHjuEg9ziuvmChnnHPj --scope guilhermes-projects-7de72796 --yes --timeout 45s`.
Resultado: exit 0, Success.

Pós-verificação exata: GET Vercel `/v4/aliases/raro-ia.vercel.app` confirmou alias `raro-ia.vercel.app`, projeto `prj_jzYFZYdUe1azFDKlrSwEeQ9CGpMm`, deployment `dpl_2Z3W8dR8rRHjuEg9ziuvmChnnHPj` e URL técnica `raro-gi0egwfrx-guilhermes-projects-7de72796.vercel.app`.

O código publicado é `9d07f9bffeb99abc9b665c9c41bd30f6b199be45`, também confirmado em origin/mentoros. A documentação final do ledger será sincronizada após o fechamento do controlador, sem outro deploy de código.

URL para conferência pelo usuário: https://raro-ia.vercel.app/integracoes. Ao abrir novamente, a página dinâmica deve consultar a conexão da organização e mostrar o próximo item do catálogo. Não é preciso desconectar ou recriar a autorização Google por causa deste reparo.

## Limites e evidência humana

A conexão Google e a agenda visível foram confirmadas pelo usuário antes desta mudança. A nova página Integrações foi verificada em renderização sintética, testes e revisão; não foi inspecionada na sessão autenticada do usuário pelo agente. Build e alias não são prova dessa verificação visual.

Nenhuma alteração de Google Cloud, audiência, escopos, chave, banco, evento ou heartbeat. Liberação OAuth pública para clientes continua pendente conforme preparacao-oauth-publico.md. Unidades desta publicação são apenas estimativa de telemetria, não medição de consumo.

Revisão final Sol aprovada em revisao-t143p.md: o revisor confirmou de forma independente o alias exato, o deployment Ready de produção e o SHA de origem. A revisão não atestou a futura sincronização do ledger; o coordenador fará esse fechamento documental com nova confirmação remota, sem outro deploy.
