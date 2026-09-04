# Fase 8 — homologação funcional sintética

Data: 04/09/2026

Escopo: contas `@audit.invalid` e registros `[AUDIT]` no workspace isolado. Nenhum dado real, segredo, pagamento, mensagem externa, deploy, migration ou alteração de RLS foi executado.

## Resultado observado na T-118

Esta matriz é o retrato da passagem UAT original. Ela não representa o estado pós-correção; os dois itens corrigidos localmente na T-119 permanecem como `FALHA` histórica e aguardam novo reteste pelo navegador.

| Perfil | Função | Resultado T-118 | Evidência |
| --- | --- | --- | --- |
| Gestor | Navegação pelas áreas operacionais | PASSA | Início, painel, tour, agenda, mentoria, trilhas, avisos, onboarding, financeiro, CRM, comercial, conteúdo, começar, extrato e integrações carregaram. |
| Gestor | Isolamento de integrações externas | FALHA | A leitura externa foi suprimida, mas a tela comunicava `29/29` abas sincronizadas e mostrava o identificador abreviado da planilha. Corrigido em código e em testes locais na T-119; reteste UAT pelo navegador pendente. |
| Gestor | Publicar aviso `[AUDIT]` | BLOQUEADA | Gravação recusada pelo banco com código `42501`; nenhum aviso foi criado. |
| Gestor | Criar trilha `[AUDIT]` | BLOQUEADA | Gravação recusada pelo banco com código `42501`; nenhuma trilha foi criada. |
| Gestor | Criar lead `[AUDIT]` | BLOQUEADA | RLS recusou `INSERT` em `alunos`; a interface devolveu erro HTTP 500 em vez de mensagem orientativa. |
| Mentorado | Portal e dados próprios | PASSA | Exibidos somente programa, sessão e mensagem `[AUDIT]` da T-112. |
| Mentorado | Trilha do cliente | PASSA | Rota `/portal/trilha` abriu sem expor registros de terceiros. |
| Mentorado | Conversa interna | PASSA | Mensagem `[AUDIT] T-118 · Mensagem funcional do mentorado` foi gravada e reapareceu como enviada por `Você`. |
| Mentorado | Financeiro, CRM, integrações, comercial e trilhas administrativas | PASSA | As rotas terminaram na tela `Esta área não é sua`. |
| Mentorado | Mentoria administrativa | FALHA | O conteúdo foi bloqueado, mas a URL permaneceu `/mentoria` em vez de `/sem-acesso`. |
| Mentorado | Conteúdo e Começar | PASSA | As rotas carregaram conforme a política explícita em `src/lib/papeis.ts`; o acesso não é tratado como defeito. |
| Mentorado | Agenda | FALHA | A rota é permitida, porém oferecia conexão Google/iCal à conta sintética apesar do isolamento UAT. Corrigido em código e em testes locais na T-119; reteste UAT pelo navegador pendente. |
| Comercial | Início, CRM, negociações e painel | PASSA | As rotas carregaram na sessão `rls-audit-comercial@audit.invalid`. |
| Comercial | Financeiro, integrações, mentoria, trilhas e portal | PASSA | Todas terminaram em `/sem-acesso`. |
| Comercial | Começar e tour | PASSA | As duas rotas carregaram com a sessão comercial e apresentaram apenas a base sintética vazia. |
| Comercial | Agenda | PASSA | A rota permitida exibiu `Agenda isolada na homologação`, sem controles Google ou iCal. |
| Comercial | Conteúdo | FALHA | A rota carregou sem registros, mas instruiu configurar tokens externos e afirmou que os dados eram de demonstração, mensagem inadequada para uma conta UAT isolada. |
| Comercial | Marketing | FALHA | A rota abriu, porém `lerDadosMarketing` tentou consultar uma relação ausente e degradou para `Não foi possível carregar o marketing agora` (`PGRST205`). |
| Comercial | Criar lead `[AUDIT]` | BLOQUEADA | Nenhuma submissão foi feita; a tentativa anterior não conseguiu focar o campo. |

## Defeitos reproduzidos para T-119

1. A agenda oferecia conexão Google/iCal à conta sintética mentorado. O reteste comercial pós-T-119 confirmou a degradação isolada, sem controles externos.
2. A página de Integrações comunicava uma leitura inexistente (`29/29`) durante o isolamento UAT e mostrava metadado da planilha.
3. Escritas sintéticas de gestor em aviso, trilha e lead são recusadas por RLS (`42501`). A correção de política exige gate separado; esta missão não altera migrations ou RLS.
4. A criação de lead propaga falha de RLS como HTTP 500, sem retorno amigável ao usuário.
5. O bloqueio de `/mentoria` para mentorado renderiza a tela correta, mas conserva a URL proibida.
6. Conteúdo instrui a conta sintética a configurar tokens Meta/TikTok e chama a base vazia de demonstração.
7. Marketing tenta consultar o Supabase na conta UAT e falha com `PGRST205`, em vez de degradar para uma visão sintética isolada.

## Estado local após a T-119

- **CORRIGIDO LOCALMENTE — Agenda sintética:** a página agora encerra antes de qualquer leitura ou controle externo e mostra `Agenda isolada na homologação`. O teste confirma ausência de `Conectar com o Google` e `Endereço secreto no formato iCal`. Reteste UAT pelo navegador pendente.
- **CORRIGIDO LOCALMENTE — diagnóstico de planilha:** a página agora mostra `Diagnóstico da planilha isolado no UAT`, sem `29/29`, identificador ou tabela de leitura ao vivo. Reteste UAT pelo navegador pendente.
- **Evidência:** 70/70 testes relevantes passaram, incluindo papéis, isolamento UAT, Agenda e Integrações; `npx tsc --noEmit` concluiu com código 0.
- **Não resolvido:** recusas RLS, mensagem HTTP 500 do CRM e inconsistência de URL de `/mentoria` continuam registradas. Nenhuma policy ou migration foi alterada.

## Limitações da execução

- O preenchimento automatizado do formulário comercial falhou antes de qualquer escrita. A função fica bloqueada, não aprovada.
- O aviso e a trilha não puderam ser verificados pelo mentorado porque as tentativas de criação pelo gestor foram recusadas e não deixaram registros.
- Correções de RLS permanecem fora do escopo e não serão contornadas no código cliente.
- A compilação não estava travada: o `next build` continuava produzindo delta no arquivo de trace apesar do silêncio no terminal e concluiu 46/46 páginas. O reteste foi executado em `next start`, que ficou pronto em 1,6 s.
