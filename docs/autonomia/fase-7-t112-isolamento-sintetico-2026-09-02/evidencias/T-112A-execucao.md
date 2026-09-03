# Evidência — T-112A

## Diagnóstico

As contas de auditoria estavam ligadas ao workspace padrão. Como as políticas
comerciais isolam por `workspace_id`, a conta comercial sintética herdava a
visibilidade dos contatos daquele workspace.

## Correção local preparada

O SQL versionado cria um workspace de auditoria vazio e associa somente os
três `profiles` `audit.invalid` esperados. Antes da alteração ele confirma:

- exatamente três usuários e três perfis com os papéis previstos;
- UUID inexistente ou nome canônico compatível;
- ausência de dados em toda tabela pública de negócio com `workspace_id`;
- ausência de objetos de Storage sob o prefixo do workspace;
- ausência de qualquer perfil não autorizado no workspace.

A massa T-102 antiga não é movida. Após aplicação autorizada, uma tarefa
separada deverá recriar massa mínima no workspace isolado.

## Validação

- TDD: falha inicial confirmada; estado final 5/5 testes aprovados.
- TypeScript: aprovado.
- Contrato v3: `VALID`.
- `git diff --check`: aprovado.
- Revisão independente: `APROVADO` após três achados corrigidos.
- SQL aprovado aplicado no MentorOS main após autorização explícita.
- Resultado do editor: `Success. No rows returned`.
- Verificação agregada somente leitura: `workspace_ok=1`,
  `perfis_no_workspace=3`, `perfis_sinteticos=3` e `objetos_storage=0`.
- A massa T-102 anterior não foi movida nem recriada.
- Revisão independente do fechamento documental: `APROVADO`.
