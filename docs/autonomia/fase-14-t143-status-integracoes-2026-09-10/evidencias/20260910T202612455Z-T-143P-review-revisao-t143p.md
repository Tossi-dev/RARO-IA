# Revisão independente T-143P

- Data: 2026-09-10
- Escopo: promoção e resolução do alias público
- Decisão: **APROVADA**

## Evidência própria

- `vercel inspect https://raro-ia.vercel.app --scope guilhermes-projects-7de72796` resolveu o alias para `dpl_2Z3W8dR8rRHjuEg9ziuvmChnnHPj`, projeto `raro-ia`, target `production`, estado `Ready` e URL técnica `raro-gi0egwfrx-guilhermes-projects-7de72796.vercel.app`.
- A consulta read-only exata `/v4/aliases/raro-ia.vercel.app`, reduzida localmente aos campos permitidos, confirmou alias `raro-ia.vercel.app`, project ID `prj_jzYFZYdUe1azFDKlrSwEeQ9CGpMm` e deployment ID `dpl_2Z3W8dR8rRHjuEg9ziuvmChnnHPj`.
- O repositório local está limpo; HEAD e `origin/mentoros` locais coincidem em `9d07f9bffeb99abc9b665c9c41bd30f6b199be45`.
- `evidencias/publicacao-t143p.md` registra o `promote` do mesmo candidato com exit 0 e `Success`.

## Limites

A aprovação confirma a publicação do código revisado no alias público. Não confirma a renderização dentro da sessão autenticada do usuário, o próximo item efetivamente visto por essa organização nem qualquer nova operação Google.

OAuth público, audiência/verificação Google e alterações de banco, chave, escopos ou eventos continuam fora desta entrega. O futuro commit/push do espelho final do ledger também não é atestado por esta revisão e deve ser verificado depois de executado.

Nenhum valor de ambiente, log de usuário, dado de cliente, página autenticada ou integração externa foi acessado.
