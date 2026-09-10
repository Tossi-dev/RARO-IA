# Revisão independente T-143

- Data: 2026-09-10
- Revisor: gpt-5.6-sol, distinto do executor gpt-5.6-terra
- Escopo: quatro arquivos de aplicação/teste da T-143 e guia `preparacao-oauth-publico.md`
- Decisão: **BLOQUEADA**

## Achados

### P1 — conexão parcial é tratada como concluída ao escolher a próxima integração

Em `src/app/(app)/integracoes/page.tsx:409-412`, a lista enviada a `proximaConexaoAssistidaPendente` inclui toda conexão com `conectado=true`. Porém a própria página define a planilha como conectada com somente leitura e mantém uma `pendencia` quando a escrita não está configurada (`page.tsx:257-268`). Nesse estado válido, a planilha é removida das pendências e a UI aponta para o item seguinte do catálogo, embora ainda exista trabalho declarado nela.

O cálculo precisa distinguir conexão concluída de conexão parcial, por exemplo exigindo ausência de `pendencia` ou usando uma regra explícita do catálogo. Adicionar teste de página com `sheetsConfigurado=true`, `sheetsEscritaConfigurada=false` e Google ativo, comprovando o nome, estado e próximo passo esperados.

### P2 — testes não fecham os resultados centrais do cartão/KPI

O teste conectado em `src/app/(app)/integracoes/page.test.tsx:102-114` confirma somente textos genéricos. Ele não verifica que `href="/api/agenda/google/entrar"` desaparece quando Google está ativo, não confirma qual próxima integração foi renderizada e não valida a razão exata do KPI/lista após remover a linha iCal.

Além disso, os mocks fixam planilha com leitura e escrita ativas (`page.test.tsx:17-20`), então o teste de página atualmente renderiza o item seguinte enquanto o teste unitário do helper espera Planilha para uma lista diferente de concluídas. Incluir asserts do resultado concreto: ausência do botão OAuth, nome/estado/próximo passo da pendência e contagem coerente de conexões ativas/total.

### P2 — “Verificado” é ambíguo no guia de verificação ainda pendente

`evidencias/preparacao-oauth-publico.md:3` começa com “Verificado em 2026-09-10”. Como o assunto é justamente verificação OAuth do Google, isso pode ser lido como verificação remota concluída. O restante do documento fecha corretamente essa interpretação e registra relato do usuário, política em rascunho, domínio não inspecionado/perguntado e aprovação Google pendente. Trocar apenas a abertura por “Documento preparado em” ou “Revisado documentalmente em” e manter o espelho do repositório idêntico.

## Evidência própria e pontos aprovados

- `node node_modules/vitest/vitest.mjs run "src/lib/integracoes/conexao-assistida.test.ts" "src/app/(app)/integracoes/page.test.tsx" --reporter=verbose`: **2 arquivos, 16/16 testes aprovados**.
- O status usa `conexaoGoogleAtivaDaOrganizacao()` uma vez fora do UAT. A função deriva usuário/workspace da sessão, filtra o serviço pelo workspace e seleciona somente `revogado_em`; não lê refresh token nem eventos.
- UAT não chama a consulta real. Rejeição e revogação permanecem fechadas, sem erro bruto ou sucesso falso.
- Cartão, KPI e listas usam o mesmo resultado `conexaoGoogle`; a linha iCal foi removida do inventário e o OAuth ativo a cobre sem exigir configuração adicional.
- Quando ativo, o código mostra Agenda/Gerenciar e não renderiza o início OAuth. Quando falha inesperadamente, não oferece o link.
- O diff não altera a home nem o design global. O guia do vault e seu espelho no repositório tinham SHA-256 idêntico nesta revisão.
- A regressão 107/107, TypeScript e `diff --check` verdes são evidência do coordenador; não repeti TypeScript para não disputar cache compartilhado.

Nenhuma rede, banco, Google, Vercel, browser, dado real, deploy ou mutação Git foi usada nesta revisão.
