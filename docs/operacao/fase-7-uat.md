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

### Gestor sintético — aprovado

- A sessão ativa foi identificada apenas pelo domínio sintético `audit.invalid`.
- `/`, `/painel`, `/mentoria`, `/mentoria/risco`, `/crm` e `/financeiro`
  carregaram sem 404 ou erro inesperado.
- A carteira exibiu exclusivamente marcadores `[AUDIT]` e `T-102 · Programa
  sintético`; nenhum e-mail fora do domínio sintético foi encontrado.
- A ficha sintética abriu mapa de atendimento, plano de ação, meta T-102,
  consentimento e histórico de sessões sem expor o identificador na evidência.
- A mesma identidade de gestor executou a jornada profissional de carteira,
  ficha, sessão, mapa, metas e grafo. O produto não possui um quarto papel
  `profissional`: essa é uma jornada operacional dos papéis `dono`/`gestor`.
- A troca de conta foi concluída sem leitura ou registro de senha.

### Comercial sintético — isolamento corrigido e comprovado

- O bloqueio original levou à criação do workspace sintético isolado T-112 e à
  recriação transacional da massa mínima nele.
- A sessão comercial foi novamente confirmada apenas pelo domínio `audit.invalid`.
- `/crm` carregou com estado vazio: base total 0, alunos ativos 0 e nenhum item
  de carteira. Nenhum identificador ou conteúdo externo à massa sintética apareceu.
- `/comercial` mostrou o funil vazio, sem etapa configurada; `/painel` mostrou
  vendas e indicadores zerados, sem e-mail fora de `audit.invalid`.
- O logout concluiu em `/login`, sem sessão sintética remanescente. Não houve
  abertura de ficha, escrita comercial, oportunidade ou proposta criada.

### Mentorado sintético — aprovado

- A sessão ativa foi confirmada como `rls-audit-mentorado@audit.invalid` antes
  da inspeção; nenhum e-mail fora de `audit.invalid` apareceu nas telas.
- `/portal` apresentou somente o programa, a matrícula, a sessão, a mensagem e
  o contrato de valor zero marcados com `[AUDIT] T-112`, sem 404 ou erro.
- Meta e passo privados da ficha profissional não foram projetados no portal;
  o estado de tarefas permaneceu vazio, preservando o recorte consentido.
- `/portal/trilha` carregou o estado vazio correto, pois nenhuma trilha foi
  liberada para essa matrícula sintética. Nenhuma aula ou conteúdo alheio foi
  exibido.
- A caixa de mensagem foi apenas inspecionada; nada foi enviado ou alterado.
  O logout concluiu em `/login`, sem sessão sintética remanescente.

### Resultado da T-112 — aprovado

- As três identidades sintéticas cobrem os quatro percursos do contrato:
  gestor e profissional são jornadas da identidade `gestor`; comercial e
  mentorado usam seus papéis próprios.
- Todos os percursos funcionais previstos foram percorridos sem escrita de
  negócio, segredo ou exposição de conteúdo não sintético.
- A repetição isolada da validação terminou com 42/42 testes focados aprovados
  e TypeScript sem erros. A T-112 está liberada para revisão independente e
  para a sequência contratada somente após parecer aprovador.

## Execução da T-113

### Jornada sintética completa — em revisão

- A sessão ativa foi confirmada como `rls-audit-gestor@audit.invalid` antes da
  inspeção; a carteira apresentou exatamente um mentorado `[AUDIT] T-112`.
- A ficha sintética apresentou contexto de sessão, mapa consentido, perguntas
  abertas, meta, passo, plano de ação e relação no grafo, sempre vinculados ao
  mesmo mentorado sintético.
- A linguagem da interface mantém o caminho com o cliente: perguntas são
  sugestões editáveis, o mapa não é diagnóstico e o plano registra o que a
  pessoa escolheu experimentar.
- A ausência de consentimento para reflexão permaneceu fechada e explicada; a
  transcrição automática permaneceu indisponível sem áudio e sem confirmação.
- Nenhum e-mail fora de `audit.invalid` foi encontrado. Nenhuma ação de salvar,
  converter, calcular, vincular, transcrever, liberar ou enviar foi executada.
- O logout concluiu em `/login`, sem sessão gestora remanescente.
- Validação local: 7 arquivos e 53 testes focados aprovados; TypeScript limpo.
- Achado não bloqueante reservado para a T-115: o servidor de desenvolvimento
  avisou que um formulário com função em `action` também declara `method` ou
  `encType`, atributos que o React substitui automaticamente.

## Regra de parada

Interromper se aparecer dado não sintético, acesso cruzado, segredo, pagamento,
ação de produção fora da UAT sintética autorizada no MentorOS main ou
necessidade de migration/RLS. Defeito local reproduzível segue para T-115 com
teste antes da correção.
