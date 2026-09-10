# Revisão documental T-142R

- Data: 2026-09-10
- Escopo: `evidencias/resultado-vercel-t142.md` e `evidencias/vercel-google-preflight.json`
- Decisão: **APROVADA**, com os limites abaixo

## Interpretação aprovada

A saída sanitizada registra HTTP 401, código fechado `legacy_disabled` e motivo `chave_legacy_desativada` para `google_oauth_estado` e `google_calendar_conexao`. Como a recusa é igual nas duas consultas, o diagnóstico localiza a falha na autenticação do gateway, antes de qualquer leitura ou decisão específica de tabela. Isso é compatível com a falha de armazenamento registrada na entrada OAuth.

A correção indicada é restrita: substituir o valor da variável existente `SUPABASE_SERVICE_ROLE_KEY` em Vercel Production por uma Secret key atual `sb_secret_...` do mesmo projeto MentorOS, diretamente no gerenciador seguro. Não reativar chaves legadas, não alterar `GOOGLE_TOKEN_ENCRYPTION_KEY`, não trocar de projeto e não compartilhar o valor em chat, arquivo ou evidência.

O JSON de preflight preserva os dois crons do `vercel.json` do repositório e acrescenta somente `buildCommand: node scripts/verificar-google-servidor.mjs && npm run build`. Portanto, o exit 1 fechado do preflight interrompe `npm run build`, coerente com o deployment de diagnóstico documentado como `Error`.

## Limites da revisão

- A pós-verificação do domínio vigente em `dpl_6uZ9t9BHRR83QvqEFoRF7DXBmkcZ`, status `Ready`, e o deployment de diagnóstico `dpl_26aaYy7D7pFtrgKxq3VM6CFGnfY1` foram avaliados apenas a partir da evidência registrada; esta revisão não repetiu `vercel inspect` nem qualquer comando de rede.
- O 401 não exercitou tabelas, colunas, RLS ou permissões. Ele comprova a recusa da credencial usada pelo gateway, não o funcionamento do schema.
- Um próximo GET 200/[] confirmará somente as leituras vazias do preflight. Não comprovará `INSERT` em `google_oauth_estado`, consentimento Google, callback, cifra ou persistência de `google_calendar_conexao`.
- O OAuth não está declarado resolvido. Depois da correção segura da variável, ainda são necessários novo preflight, publicação autorizada e reteste completo de entrada/consentimento/persistência.
- A frase da Agenda continua apenas validada localmente, pois o build de diagnóstico foi interrompido antes de publicá-la.

Próxima ação humana única: Tossi salvar o valor correto na variável existente pelo gerenciador da Vercel. O canal automatizado de navegador foi documentado como indisponível, e nenhuma credencial deve ser solicitada ou recebida por outro meio.

Esta revisão não acessou Vercel, Supabase, variáveis de ambiente, browser, CLI real ou dados de clientes e não modificou código ou Git.
