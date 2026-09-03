# T-115 — correção do aviso React no formulário de anexo

Data UTC: 2026-09-03T16:15:00Z

## Defeito reproduzido

O navegador registrava `Cannot specify a encType or method for a form that
specifies a function as the action` em `FormularioDeAnexo`. O formulário usava
uma Server Action e declarava `encType="multipart/form-data"` manualmente.

## TDD e correção

- RED: teste novo falhou ao encontrar o `encType` manual;
- GREEN: removido somente o atributo redundante; o campo de arquivo e a Server
  Action foram preservados;
- 4 arquivos focados, 73/73 testes aprovados;
- TypeScript `--noEmit --incremental false` com código de saída zero.

## Verificação no navegador

A ficha sintética foi recarregada após a correção. Não surgiu nova ocorrência
do aviso; o histórico do console manteve apenas entradas anteriores à mudança.
Nenhum upload de documento ou outra escrita foi executado.

## Revisão independente

**APROVADO**. O revisor confirmou que somente o `encType` redundante foi
removido, enquanto Server Action, campo de arquivo e demais entradas foram
preservados. Reexecução: 4 arquivos, 73/73 testes, TypeScript e
`git diff --check` aprovados.
