# T-142V — revalidação após atualização da Secret key

Data: 2026-09-10. O usuário informou "feito" após salvar a Secret key atual no gerenciador seguro. Metadados Vercel confirmam SUPABASE_SERVICE_ROLE_KEY, type sensitive, target production, updatedAt 1789066800395. Nenhum valor foi lido/copied.

## Código e testes reexecutados

- Base a7123232d5ed65eed7f0c85ba6a3fb1df694fa89, branch mentoros, worktree de código limpo. Código já aprovado na revisão independente Sol R2 da missão anterior.
- `npx --no-install vitest run scripts/verificar-google-servidor.test.ts "src/app/(app)/agenda/page.test.tsx" src/lib/integracoes/google-cofre.test.ts src/lib/integracoes/google-conexao-servidor.test.ts src/app/api/agenda/google/entrar/route.test.ts src/app/api/agenda/google/retorno/route.test.ts`: exit0, 6 arquivos, 37/37, duração18.71s. Warnings preexistentes de Vite CJS e React/Server Action mockada; categorias emitidas pelos testes são sintéticas.
- `npx --no-install tsc --noEmit`: exit0, sem saída.
- Dry upload: 667 entradas / 6754691 bytes, preflight incluído, zero arquivos de chaves/ambiente/build local entre os arquivos com conteúdo.

## Verificação real somente leitura

Deployment candidato: dpl_8kqfYK9WB559jamK4oe1oEkjDvBd.
URL: https://raro-dz4xy0qm5-guilhermes-projects-7de72796.vercel.app.
Criado com --prod --skip-domain e config externa preflight antes de npm run build. Nenhuma promoção realizada nesta etapa.

Saída filtrada diretamente do build log:

```json
{"prefixo":"GOOGLE_SERVER_PREFLIGHT","resultados":[{"tabela":"google_oauth_estado","status_http":200,"codigo":"ok","codigo_origem":null,"motivo":"leitura_vazia_confirmada"},{"tabela":"google_calendar_conexao","status_http":200,"codigo":"ok","codigo_origem":null,"motivo":"leitura_vazia_confirmada"}]}
```

Isso confirma que o novo ambiente não sofre mais a recusa 401 por chave legada nessas consultas técnicas. Foram GET limit=0, sem registros retornados ou escrita. Não comprova INSERT, consentimento, callback, persistência OAuth ou leitura de eventos Google.

## Build e comparação com a publicação existente

- `vercel inspect dpl_8kqfYK9WB559jamK4oe1oEkjDvBd`: Ready. Metadados confirmam projeto prj_jzYFZYdUe1azFDKlrSwEeQ9CGpMm, target production, source cli e githubCommitSha a7123232d5ed65eed7f0c85ba6a3fb1df694fa89.
- Contagem filtrada do build log: 1 preflight, 1 "Compiled successfully", 1 verificação de tipos e 2 marcadores de finalização (Build Completed/Deployment completed). Nenhuma mensagem bruta de resposta de serviço foi impressa.
- `vercel inspect https://raro-ia.vercel.app`: ainda dpl_4vwnXmfgkHNuJAWsGh83zNENTpPD, Ready, criado 16:00:12 BRT após a atualização feita pelo usuário, antes desta célula. Metadados source=redeploy e originalDeploymentId=dpl_26aaYy7D7pFtrgKxq3VM6CFGnfY1 confirmam redeploy do nosso candidato anterior, não nova origem desconhecida. O githubCommitSha antigo é 095b8e17..., pois o candidato anterior fora enviado com diff local antes do commit; não usar esse SHA isoladamente como prova de conteúdo exato do runtime.
- Nesta célula o domínio principal foi preservado; nenhum comando promote executado ainda. Candidato atual usa o código versionado e revisado com SHA a7123232... e passou com a nova configuração.

Revisão das evidências e promoção pendentes nesta versão. Navegador Windows continua indisponível (pipe nativo ausente), sem automação de autenticação/consentimento ou contorno de proteção. Nenhuma chave, migration, RLS, evento Calendar ou heartbeat foi alterado.
