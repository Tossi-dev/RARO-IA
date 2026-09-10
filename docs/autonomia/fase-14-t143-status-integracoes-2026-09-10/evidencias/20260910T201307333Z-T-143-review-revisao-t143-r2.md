# Revisão independente T-143 — R2

- Data: 2026-09-10
- Revisor: gpt-5.6-sol, distinto do executor gpt-5.6-terra
- Escopo: correções dos achados R1 e adendo de linguagem do cartão guiado
- Decisão: **APROVADA**

## Achados R1 resolvidos

- `src/app/(app)/integracoes/page.tsx:350-360` só considera concluída no catálogo a conexão ativa sem `pendencia`. Assim, planilha em somente leitura continua sendo a próxima pendência verdadeira.
- O teste de página cobre o estado parcial e exige `Planilha do Google — Em preparação`, orientação humana sobre leitura ativa/escrita preparada pela plataforma e ausência dos nomes técnicos de segredo no bloco guiado.
- O estado Google conectado exige ausência de `href="/api/agenda/google/entrar"`, próxima integração exata, KPI `3/8`, Google entre os destaques e ausência da linha iCal duplicada.
- Google não conectado recebe selo explícito; revogação e rejeição permanecem fechadas, sem mensagem bruta ou sucesso falso.
- `preparacao-oauth-publico.md` agora abre com “Documento preparado” e afirma expressamente que não comprova verificação Google. O arquivo do vault e seu espelho no repositório têm SHA-256 idêntico.

## Evidência própria

- `node node_modules/vitest/vitest.mjs run "src/lib/integracoes/conexao-assistida.test.ts" "src/app/(app)/integracoes/page.test.tsx" --reporter=verbose`: **2 arquivos, 17/17 testes aprovados**.
- `git diff --check`: **exit 0**; apenas avisos de normalização LF/CRLF.
- Não repeti TypeScript para não disputar cache com a regressão do coordenador; o executor registra exit 0.

## Segurança e limites

O status continua vindo de `conexaoGoogleAtivaDaOrganizacao()`: identidade derivada da sessão, filtro por workspace e seleção somente de `revogado_em`. A página não lê token ou eventos; UAT não chama a consulta real. Cartão, KPI e listas usam o mesmo resultado fechado.

O cartão guiado não repassa nomes de variáveis nem pede chaves ao cliente; o diagnóstico técnico completo mantém a pendência operacional para administração. O guia apenas prepara OAuth público: audiência, domínio, política e aprovação Google continuam pendentes e nenhuma configuração externa foi alterada nesta tarefa.

Esta aprovação é técnica e local. Não autoriza nem comprova deploy, alteração Google Cloud, banco, credencial ou conexão de novo fornecedor.
