# Roteiro UAT local — MentorOS

Este roteiro verifica o produto sem conta, banco, segredo, fornecedor ou
produção. Ele complementa os testes automatizados: não tenta simular uma
consulta real nem coleta informação de cliente.

## Como executar

No repositório, execute os comandos abaixo com Node disponível. Todos usam
fixtures e mocks locais; nenhum pede variável de ambiente.

```powershell
& 'C:\Program Files\nodejs\node.exe' '.\node_modules\vitest\vitest.mjs' run src/lib/actions-auth.test.ts --pool=threads --maxWorkers=1 --minWorkers=1
& 'C:\Program Files\nodejs\node.exe' '.\node_modules\vitest\vitest.mjs' run 'src/app/api/acesso/sair/route.test.ts' --pool=threads --maxWorkers=1 --minWorkers=1
& 'C:\Program Files\nodejs\node.exe' '.\node_modules\vitest\vitest.mjs' run src/lib/mentoria/consentimento.test.ts --pool=threads --maxWorkers=1 --minWorkers=1
& 'C:\Program Files\nodejs\node.exe' '.\node_modules\vitest\vitest.mjs' run src/lib/mentoria/portal.test.ts --pool=threads --maxWorkers=1 --minWorkers=1
& 'C:\Program Files\nodejs\node.exe' '.\node_modules\typescript\bin\tsc' --noEmit --incremental false
```

## Cenários e evidências

| Cenário | Ator simulado | Pré-condição local | Ação local | Resultado esperado | Evidência |
| --- | --- | --- | --- | --- | --- |
| Saída com Supabase | pessoa autenticada simulada | mock de `supabaseConfigurado()` retorna `true`; `signOut` é um dublê | aciona `sair()` | chama `signOut` e segue para `/login` | `actions-auth.test.ts` |
| Saída sem Supabase | pessoa no modo sem conexão | mock de `supabaseConfigurado()` retorna `false` | aciona `sair()` | não cria cliente e segue para `/login` | `actions-auth.test.ts` |
| Saída por senha | usuário do portão local | requisição local contém `COOKIE_ACESSO` e outro cookie de controle | `POST /api/acesso/sair` | remove apenas `COOKIE_ACESSO`; vai para `/acesso` | `route.test.ts` |
| Consentimento ausente ou revogado | mentorado simulado | fixture contém consentimento ausente, de categoria diferente ou revogado | tenta registrar/exibir conteúdo | nega o ato e não projeta conteúdo privado | `consentimento.test.ts` |
| Portal sem perfil ou sem conexão | visitante simulado | mock não tem Supabase configurado ou `mentorado_atual()` não devolve ficha | lê o portal | retorna estado vazio/seguro, sem consulta dependente ou dado inventado | `portal.test.ts` |
| Portal de mentorado | mentorado simulado | fixtures trazem conversa válida e contrato já liberado pela projeção local | lê conversa e contrato liberado | recebe projeção mínima; não recebe autor, workspace ou `valor_total` | `portal.test.ts` |

## Critério de aprovação local

O roteiro aprova quando todos os comandos encerram com código 0. Um aviso de
depreciação da API CJS do Vite não é falha do produto; qualquer teste falho,
erro de TypeScript ou tentativa de pedir configuração real interrompe a
validação e deve ser registrado no ledger.

## Fora deste roteiro

Não usar credenciais de teste nem logar em Supabase. Não rodar migrations,
não enviar transcrição, não testar e-mail/WhatsApp, não fazer deploy. Essas
ações pertencem ao portão de ambiente real e exigem autorização específica.
