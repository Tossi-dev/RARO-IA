# Fase 7 — homologação ponta a ponta

## Estado herdado da T-102

### Comprovado

- O alvo autenticado foi confirmado como MentorOS main.
- A migration corretiva 0043 foi aplicada e validada em 01/09/2026.
- A massa sintética mínima foi criada atomicamente e conferida por contagens
  agregadas: programa, matrícula, sessão, documento privado e arquivado, mapa,
  três consentimentos, meta, passo, dois nós, uma relação, mensagem e contrato
  de portal com valor zero.
- Não houve Storage, áudio, transcrição, dado real ou segredo na evidência.

### Ainda não comprovado

- O ledger da T-102 termina em `aguardando_uat_manual_sintetica`.
- Não existe evidência registrada de visita completa pós-redesign para gestor,
  comercial, profissional e mentorado.
- Login relatado em conversa não substitui roteiro, resultado por perfil e
  evidência agregada.
- A integração com fornecedor pertence ao portão específico da T-114.

## Matriz inicial da T-112

| Perfil | Jornada mínima | Evidência permitida |
| --- | --- | --- |
| Gestor | entrada, painel, mentoria, risco, equipe e saída | rota, status e resultado; nunca senha ou identificador |
| Comercial | entrada, CRM, oportunidade, proposta e saída | rota, permissão e estado sintético agregado |
| Profissional | carteira, ficha, sessão, mapa, metas, grafo e saída | ação concluída e estado visual, sem conteúdo privado |
| Mentorado | portal, trilha, metas, mensagem e saída | somente projeção permitida ao próprio perfil |

## Execução da T-112

### Gestor sintético — aprovado parcialmente

- A sessão ativa foi identificada apenas pelo domínio sintético `audit.invalid`.
- `/`, `/painel`, `/mentoria`, `/mentoria/risco`, `/crm` e `/financeiro`
  carregaram sem 404 ou erro inesperado.
- A carteira exibiu exclusivamente marcadores `[AUDIT]` e `T-102 · Programa
  sintético`; nenhum e-mail fora do domínio sintético foi encontrado.
- A ficha sintética abriu mapa de atendimento, plano de ação, meta T-102,
  consentimento e histórico de sessões sem expor o identificador na evidência.
- A saída e a autenticação dos três perfis restantes dependem de troca manual
  de conta; senhas não são lidas ou digitadas pelo agente.

### Comercial sintético — isolamento corrigido e comprovado

- O bloqueio original levou à criação do workspace sintético isolado T-112 e à
  recriação transacional da massa mínima nele.
- A sessão comercial foi novamente confirmada apenas pelo domínio `audit.invalid`.
- `/crm` carregou com estado vazio: base total 0, alunos ativos 0 e nenhum item
  de carteira. Nenhum identificador ou conteúdo externo à massa sintética apareceu.
- A sessão foi preservada; não houve abertura de ficha, escrita comercial ou saída,
  para não exigir que senha sintética seja entregue ao agente.

## Regra de parada

Interromper se aparecer dado não sintético, acesso cruzado, segredo, pagamento,
ação de produção fora da UAT sintética autorizada no MentorOS main ou
necessidade de migration/RLS. Defeito local reproduzível segue para T-115 com
teste antes da correção.
