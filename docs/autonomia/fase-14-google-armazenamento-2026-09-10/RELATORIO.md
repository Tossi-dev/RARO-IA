# T-142 — diagnóstico Google Calendar (2026-09-10)

> Atualização posterior: o usuário substituiu a chave e a revalidação retornou HTTP200/[] nas duas tabelas. Consulte a [continuação T-142V/T-142P](../fase-14-google-validacao-chave-2026-09-10/RELATORIO.md). O restante deste arquivo preserva o diagnóstico anterior, não o estado atualizado da credencial.

## Resultado

Conexão **ainda não concluída**. Causa confirmada em preflight dentro de Vercel Production: `HTTP 401`, `legacy_disabled` / `chave_legacy_desativada` nas duas tabelas técnicas. A variável `SUPABASE_SERVICE_ROLE_KEY` ainda é recusada como chave legada desativada.

A falha registrada na última tentativa é anterior ao consentimento Google. A mensagem compartilhada `erro=conexao` não comprovava que o Google tinha autorizado a conta.

## Alterações locais revisadas

- `scripts/verificar-google-servidor.mjs`: diagnóstico opcional, não executado automaticamente pelo app. GET `limit=0`, host MentorOS fixo, duas tabelas, timeout/redirect bloqueado, retorno por allowlists e fallback fechado de exceções.
- `scripts/verificar-google-servidor.test.ts`: dados sintéticos somente, inclusive processo filho com falha inesperada no SDK sem vazamento de mensagem/stack.
- `src/app/(app)/agenda/page.tsx` e `.test.tsx`: mensagem de erro não presume consentimento já concluído. Layout aprovado preservado.

TDD: RED real com módulo ainda inexistente e mensagem antiga; 12/12 focais verdes na revisão final. Regressão OAuth adicional: 25/25. TypeScript exit0. Revisão independente por gpt-5.6-sol após autoria gpt-5.6-terra; primeiro P1 de exceção bruta foi corrigido e revalidado antes do uso real.

## Evidência de produção

Deployment de diagnóstico: `dpl_26aaYy7D7pFtrgKxq3VM6CFGnfY1`, criado com `--prod --skip-domain` e build preflight antes de Next.js. Saída segura:

```json
{"prefixo":"GOOGLE_SERVER_PREFLIGHT","resultados":[{"tabela":"google_oauth_estado","status_http":401,"codigo":"legacy_disabled","codigo_origem":null,"motivo":"chave_legacy_desativada"},{"tabela":"google_calendar_conexao","status_http":401,"codigo":"legacy_disabled","codigo_origem":null,"motivo":"chave_legacy_desativada"}]}
```

O build terminou Error pelo exit1 previsto do diagnóstico; não foi promovido. Pós-checagem confirmou `raro-ia.vercel.app` ainda Ready no deployment `dpl_6uZ9t9BHRR83QvqEFoRF7DXBmkcZ`. A nova mensagem de erro não foi publicada por este build interrompido.

Nenhum registro retornado ou alterado, nenhuma migration/RLS aplicada, nenhuma chave copiada para código/vault/chat, nenhuma credencial rotacionada. O cofre criptográfico permanece intacto. O inventário de upload excluiu arquivos `.env`, chaves e artefatos de build locais.

## Única dependência humana

Salvar uma Secret key atual `sb_secret_...` do projeto MentorOS como **valor** da variável existente `SUPABASE_SERVICE_ROLE_KEY` em Vercel **Production**. Manter o nome da variável. Não usar a chave legada, publishable, anon, token pessoal ou Vercel. Não reativar chaves legadas, não alterar o cofre e não enviar o valor no chat.

Depois: repetir preflight no ambiente seguro, publicar após sucesso e verificar entrada/consentimento/retorno/persistência OAuth. GET 200/[] sozinho não comprova permissão de INSERT ou conexão completa. A autorização existente permite continuar essa sequência; não reabrir o plano nem solicitar aprovação por inércia.

Supabase: <https://supabase.com/docs/guides/getting-started/api-keys>. Vercel: <https://vercel.com/docs/environment-variables> (variáveis atualizadas só entram em novos deployments).

Telemetria: unidades contratuais são estimativas, não consumo medido; sem teto de bloqueio. Automação segue desativada a pedido do usuário.
