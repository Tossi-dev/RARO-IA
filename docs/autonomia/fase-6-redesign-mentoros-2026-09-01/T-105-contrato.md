# Contrato individual — T-105

## Escopo

Criar a fundação visual reutilizável da Fase 6 e corrigir o aviso real do
React/Next no formulário de vínculo de áudio: um `<form>` que usa Server
Action não deve declarar `encType` ou `method` manualmente.

## Critérios de aceite

- Os tokens e primitivas mantêm contraste, foco visível e redução de
  movimento.
- A correção não remove campo de arquivo, confirmação de consentimento nem
  identificadores derivados da ficha.
- O teste de renderização prova que o formulário preserva o fluxo e não traz
  `encType` manual.

## Limites

Sem banco, upload, áudio real, transcrição, segredo, Supabase, deploy ou
mudança de permissão.
