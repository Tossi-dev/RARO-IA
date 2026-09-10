# Revisão independente T-142 — R2

- Data: 2026-09-10
- Revisor: gpt-5.6-sol, distinto do autor gpt-5.6-terra
- Base: `095b8e17db856ba1613bbf0aeec27451eb3d2643`, branch `mentoros`
- Escopo: somente a correção do P1, seu teste adversarial, os quatro arquivos da T-142 e a correspondência dos `SELECT` com as migrations 0044/0045
- Decisão: **APROVADA**

## Correção do bloqueador

O P1 da primeira revisão foi corrigido. `scripts/verificar-google-servidor.mjs:115-147` agora envolve configuração, criação do cliente e consultas em fallback fechado. O entrypoint em `scripts/verificar-google-servidor.mjs:154-165` também possui fallback próprio e emite somente o JSON sanitizado antes de definir exit code não zero.

Reprodução independente do caso bloqueador, sem rede e com SDK sintético em processo filho:

- `exit_code=1`;
- stderr vazio;
- marcador da exceção ausente em stdout e stderr;
- prefixo `GOOGLE_SERVER_PREFLIGHT` presente;
- ambas as tabelas retornaram código fechado `erro_inesperado`.

O teste em `scripts/verificar-google-servidor.test.ts:26-63` cobre o mesmo limite executando o entrypoint real como filho e verificando ausência do marcador, stderr vazio, JSON fechado e exit code 1.

## Evidência própria

- `node node_modules/vitest/vitest.mjs run "scripts/verificar-google-servidor.test.ts" "src/app/(app)/agenda/page.test.tsx" --reporter=verbose`: **2 arquivos, 12/12 testes aprovados**. O único stderr foi o aviso React preexistente sobre `form action` no teste visual.
- `.\node_modules\.bin\tsc.cmd --noEmit`: **exit 0**, sem saída.
- `supabase/migrations/0045_google_oauth_estado.sql:7-15` confirma todas as colunas do primeiro `SELECT`: `state`, `workspace_id`, `usuario_id`, `conexao`, `expira_em`, `consumido_em`.
- `supabase/migrations/0044_google_calendar_conexao.sql:7-17` confirma todas as colunas do segundo `SELECT`: `workspace_id`, `refresh_token_cifrado`, `iv`, `tag_autenticacao`, `versao_chave`, `escopos`, `conectado_por`, `conectado_em`, `atualizado_em`, `revogado_em`.
- Permanecem válidas as evidências da primeira revisão para host fixo, somente GET com `limit=0`, 401 legacy sanitizado, timeout real, status/códigos/motivos allowlisted, ausência de escrita e mensagem da Agenda fiel à etapa anterior ao consentimento.

## Limite da aprovação

Esta aprovação encerra a revisão técnica da T-142 e remove o bloqueador para a próxima célula autorizada. Ela não é evidência de acesso real ao Supabase: um futuro GET verde provará apenas que essas leituras de zero linhas funcionam com a credencial do build. Não prova `INSERT` em `google_oauth_estado`, consentimento, callback, persistência da conexão nem correção completa do OAuth.

Nenhuma rede externa, variável real, Vercel, Supabase real, browser, deploy ou mutação Git foi usada nesta revisão.
