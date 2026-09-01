# Portão de ambiente real — MentorOS

O repositório está **pronto localmente** quando testes, TypeScript, revisão,
prontidão de Git e contexto estão aprovados. Isso **não** autoriza produção.
Cada bloco abaixo exige autorização explícita do responsável antes de qualquer
comando ou login.

## Ordem obrigatória

| Bloco | Antes de agir | Evidência a registrar | Parar imediatamente quando |
| --- | --- | --- | --- |
| Banco e migrations | autorização que nomeie a migration e o projeto-alvo | nome da migration, ambiente, resultado e horário; nunca chaves | projeto ou migration não confirmar exatamente; aparecer dado real inesperado |
| Contas de validação | autorização para criar/usar identidades sintéticas e finalidade | apenas identificador não sensível e resultado agregado | conta não for sintética, houver consentimento ausente ou senha exposta |
| Transcrição/fornecedor | contrato do fornecedor, categorias permitidas, retenção e consentimento por sessão | versão do contrato, sessão sintética e status; nunca áudio/texto | consentimento não for específico, fornecedor não estiver aprovado ou ocorrer falha de envio |
| Deploy | autorização com repositório, branch e alvo explicitamente nomeados | SHA, alvo e resultado de build | branch/target divergirem, houver segredo em variáveis ou falha de build |
| Teste pós-deploy | autorização para o roteiro e perfis autorizados | cenários executados e resultado sem dado sensível | permissão, portal, consentimento ou isolamento divergirem |

## Pré-check local, antes de pedir o portão

1. `git status --short` está vazio e `HEAD` coincide com `origin/mentoros`.
2. Execute `scripts/verificar-prontidao-local.ts`; ele deve aprovar sem abrir
   arquivos de ambiente.
3. Execute Vitest aplicável e `tsc --noEmit --incremental false`.
4. Confirme que `CONTEXTO-AUTONOMO.md`, contrato e ledger descrevem a tarefa
   que realmente será autorizada.

## O que uma autorização precisa dizer

Uma autorização válida declara a ação, o ambiente e o limite. Exemplos de
forma: “autorizo aplicar a migration X somente no projeto Y” ou “autorizo
deploy do SHA Z para o alvo W”. “Pode continuar” não substitui a identificação
de banco, target de deploy, fornecedor ou conjunto de dados.

## Nunca incluir

Não registrar senha, token, chave, URL privada, transcrição, conteúdo de
consulta, e-mail pessoal ou resultado individual no Git, ledger ou chat.
