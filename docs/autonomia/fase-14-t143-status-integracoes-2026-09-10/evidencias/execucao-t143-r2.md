# T-143 — tentativa 2 Terra

Data: 2026-09-10. Correção delimitada do P1/P2 da revisão R1, sem deploy, Git, banco real, credenciais, eventos, rede ou Google Cloud.

## TDD

RED — `npx --no-install vitest run 'src/lib/integracoes/conexao-assistida.test.ts' 'src/app/(app)/integracoes/page.test.tsx' --reporter=verbose`

- Exit 1; 1 arquivo falhou, 1 teste falhou e 16 passaram.
- Causa esperada: com Google OAuth ativo e planilha em somente leitura, a página anunciava `Confirmação automática de Pix` como próxima integração em vez de `Planilha do Google — Em preparação` e não mostrava a pendência da escrita.

GREEN — mesmo comando após a correção.

- Exit 0; 2 arquivos passaram, 17 testes passaram.
- O teste conectado fecha: ausência de `href="/api/agenda/google/entrar"`, próxima exata `Confirmação automática de Pix — Aguardando definição` com escrita da planilha concluída, KPI `3/8`, Google entre os destaques e iCal ausente.
- O teste parcial fecha: com planilha em somente leitura, próxima exata `Planilha do Google — Em preparação`, pendência operacional de publicar Apps Script/escrita e KPI `3/8` sem duplicidade de iCal.

## Verificações

- `npx --no-install tsc --noEmit` — exit 0.
- `git diff --check` — exit 0.

## Delta e limites

- Uma integração só entra nas concluídas do catálogo se estiver conectada e sem `pendencia`.
- Google sem OAuth recebe selo explícito `Não conectada`; iCal legado não pode promover OAuth ativo.
- Nenhum token, evento, variável de token, chamada externa ou alteração de OAuth público foi feita.

## Adendo UX do cartão guiado

RED — o mesmo teste focado falhou (exit 1; 1 falha, 16 passaram) porque o bloco guiado repetia `RARO_SHEETS_WEBAPP_URL` e `RARO_SHEETS_SEGREDO` ao descrever uma planilha somente leitura.

GREEN — o mesmo comando voltou a passar com 17/17 e `npx --no-install tsc --noEmit` continuou exit 0.

- O teste isola somente `#conexao-google-calendar`: exige a mensagem humana “A leitura já está ativa; a escrita ainda precisa ser preparada pela plataforma. Você não precisa fornecer chaves.” e proíbe os dois nomes técnicos nesse bloco.
- A pendência técnica permanece no diagnóstico completo já existente; o cartão guiado não instrui o cliente a configurar variável nem a fornecer segredo.
