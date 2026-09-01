# Contrato de execução — T-095

## Escopo

Criar uma verificação local e sem leitura de valores que identifique segredos
e artefatos de build rastreados pelo Git. Corrigir somente entradas geradas
confirmadas, mantendo arquivos locais e sem acessar ambiente externo.

## Critérios de aceite

- A regra distingue `.env.example` de arquivos de ambiente reais.
- A regra bloqueia `.env*` reais, chaves e artefatos como `.next`,
  `node_modules`, `coverage` e `*.tsbuildinfo` quando rastreados.
- Há teste puro, script somente leitura e documentação operacional.
- Vitest focado, TypeScript e revisão independente aprovados.

## Limites

Não ler conteúdo de `.env`, não mostrar valores, não usar credenciais, não
executar deploy, banco, migration ou integração externa. Qualquer remoção do
índice Git deve atingir somente artefato gerado confirmado e preservar o
arquivo de trabalho.

## Evidências locais

- O teste puro da auditoria aprovou 3 casos: exemplos permitidos, segredos
  potenciais e artefatos gerados.
- O verificador local encontrou somente `tsconfig.tsbuildinfo`; o artefato
  gerado foi removido do índice com `git rm --cached`, preservando o arquivo
  de trabalho, e o verificador passou em seguida.
- `tsc --noEmit --incremental false` retornou código 0; a verificação posterior
  continuou aprovada.

## Conclusão

Revisão independente de leitura: **APROVADO**, sem achados. Nenhum conteúdo
de ambiente, valor secreto ou serviço externo foi acessado.
