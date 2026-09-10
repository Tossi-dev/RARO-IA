# T-143 — execução Terra

Data: 2026-09-10. Escopo executado: status de Integrações e catálogo assistido; sem deploy, Git, banco real, credenciais, eventos ou rede externa.

## TDD

RED — `npx --no-install vitest run 'src/lib/integracoes/conexao-assistida.test.ts' 'src/app/(app)/integracoes/page.test.tsx' --reporter=verbose`

- Exit 1; 2 arquivos falharam, 4 testes falharam e 11 passaram.
- Causas esperadas: `proximaConexaoAssistidaPendente is not a function`; Integrações não consultava `conexaoGoogleAtivaDaOrganizacao`; revogação não tinha estado fechado na UI.

RED de reforço — após a revisão de execução, o teste de rejeição da consulta autenticada falhou como esperado: `falha interna que não pode ir para a tela` derrubava a página (exit 1; 1 falha, 15 passaram).

GREEN — mesmo comando após a implementação.

- Exit 0; 2 arquivos passaram, 16 testes passaram.
- Cobertura nova: vínculo OAuth por organização, UAT sem consultar esse vínculo, revogação e rejeição sem sucesso falso, iCal opcional pulado e ausência de próxima integração inventada.

## Verificações

- `npx --no-install tsc --noEmit` — exit 0.
- `git diff --check` — exit 0.

## Delta

- Google Calendar usa exclusivamente `conexaoGoogleAtivaDaOrganizacao()` para o status autenticado da organização, sem ler token ou eventos; UAT não faz essa consulta.
- KPI, listas e cartão usam a mesma conexão OAuth; o iCal legado não é contado como segunda conexão e não declara OAuth ativo por variável de ambiente.
- Quando conectado, o cartão oferece `Ver agenda` e `Gerenciar conexão`, e mostra o próximo item real do catálogo com rótulo humano e próximo passo. Quando o estado é revogado, falha ou a consulta rejeita, a UI fecha sem anunciar sucesso nem expor erro bruto.
- Não houve alteração de Google Cloud/OAuth público, fornecedores, política de privacidade ou tela inicial. A preparação de OAuth público permanece fora desta T-143.
