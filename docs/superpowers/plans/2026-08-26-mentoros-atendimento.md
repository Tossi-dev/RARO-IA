# MentorOS — Plano de implementação centrado no atendimento

> Execute em ordem, com TDD e revisão independente antes de liberar a próxima
> tarefa. Cada tarefa tem contrato individual e atualiza seu ledger.

**Objetivo:** fazer da ficha de atendimento a experiência principal para o
profissional conduzir perguntas, preservar contexto, definir metas e acompanhar
ações; CRM, comercial e financeiro permanecem módulos de apoio.

**Arquitetura:** regras puras em `src/lib/mentoria` vêm antes de schema,
leitura, escrita e telas. A ficha profissional em `/mentoria/[id]` é completa;
o portal só recebe projeções explicitamente liberadas.

**Tecnologia:** Next.js 14, TypeScript, Zod, Vitest e Supabase.

## Restrições de toda a fase

- Perguntas são sugestões para o profissional, não respostas ou conselhos ao
  cliente.
- Notas 0–10 são autoavaliações voluntárias, nunca diagnóstico ou prognóstico.
- Ausência nunca vira zero, risco, meta ou recomendação inventada.
- Dados de saúde, espiritualidade, relações e emoções exigem finalidade,
  consentimento, acesso mínimo e trilha de auditoria.
- Sem banco real, IA externa, transcrição externa, produção, deploy, push,
  commit, credenciais ou dados reais sem autorização específica.
- Cada tarefa roda seu Vitest focado, `npx tsc --noEmit` e revisão independente.

## Fase A — Domínio local e testável

### T-076 — Mapa voluntário do cliente

**Criar:** `src/lib/mentoria/mapa-cliente.ts` e `mapa-cliente.test.ts`.

- [ ] Escrever testes para notas inteiras de 0 a 10, ausência preservada,
  dimensão desconhecida e texto de dor, medo e objetivo vazio ou grande demais.
- [ ] Implementar `validarMapaCliente(entrada)` e os tipos `DimensaoVida`,
  `MapaCliente` e `ResultadoValidacaoMapa`.
- [ ] Testar que o resultado não contém diagnóstico, rótulo clínico ou conselho.
- [ ] Rodar `npx vitest run src/lib/mentoria/mapa-cliente.test.ts` e
  `npx tsc --noEmit`.

### T-077 — Metas, prazos e ações

**Criar:** `src/lib/mentoria/plano-acao.ts` e `plano-acao.test.ts`.

- [ ] Testar meta obrigatória, prazo ISO futuro, passos ordenados, responsável
  e estados `pendente`, `em_andamento`, `concluido` e `cancelado`.
- [ ] Implementar `criarPlanoDeAcao`, `atualizarPasso` e `proximosPassosDe`.
- [ ] Testar prazo inválido, passo duplicado e isolamento entre dois planos.
- [ ] Rodar Vitest focado e TypeScript.

### T-078 — Perguntas e reflexões

**Criar:** `src/lib/mentoria/perguntas.ts` e `perguntas.test.ts`.

- [ ] Definir perguntas abertas por dimensão e testar limite de cinco perguntas.
- [ ] Implementar `perguntasPara(dimensao, contexto)` sem resposta modelo,
  prescrição ou terminologia diagnóstica.
- [ ] Implementar `registrarReflexao` com origem `cliente | profissional` e
  visibilidade `privada_profissional | compartilhavel`.
- [ ] Rodar Vitest focado e TypeScript.

### T-079 — Grafo e memória contínua

**Criar:** `src/lib/mentoria/grafo-cliente.ts` e `grafo-cliente.test.ts`.

- [ ] Definir nós `dimensao`, `meta`, `passo`, `sessao`, `reflexao` e
  `transcricao_referencia`, além de arestas tipadas.
- [ ] Testar bloqueio de ligação entre clientes distintos, auto-ligação e
  referência de transcrição sem autorização.
- [ ] Implementar `montarGrafoCliente` e `relacoesDe` com ordem estável.
- [ ] Rodar Vitest focado e TypeScript.

### T-080 — Consentimento e visibilidade

**Criar:** `src/lib/mentoria/consentimento.ts`,
`src/lib/mentoria/visibilidade-atendimento.ts` e respectivos testes.

- [ ] Modelar consentimento por mapa, reflexão, meta, transcrição e portal.
- [ ] Testar revogação, ausência de consentimento, escopo incorreto e projeção
  vazia para conteúdo privado.
- [ ] Implementar `podeRegistrar`, `podeExibirParaCliente` e
  `revogarConsentimento` como funções puras.
- [ ] Rodar Vitest focado e TypeScript.

## Portão 1 — Dados persistentes

Antes da Fase B, aprovar por contrato quem vê cada categoria, retenção/remoção,
auditoria de acesso e projeção ao portal. Criar migrations locais requer
contrato da tarefa; aplicar no MentorOS real exige autorização explícita.

## Fase B — Persistência e ficha do profissional

### T-081 — Schema e RLS do atendimento

**Criar:** migrations locais `0038_atendimento_mapa.sql`,
`0039_atendimento_plano.sql`, `0040_atendimento_grafo.sql` e espelhos `_exec_`.
**Modificar:** `src/lib/supabase/migracoes.test.ts`.

- [ ] Testar `workspace_id`, vínculo a `mentorado_id`, ausência de `anon`,
  ausência de `using (true)` e funções com ACL fechada.
- [ ] Persistir mapa, metas, passos, reflexões, relações, consentimentos e
  eventos de acesso com chaves por workspace.
- [ ] Criar projeção mínima para portal, sem conteúdo privado.
- [ ] Rodar testes de migrations, TypeScript e revisão independente.

### T-082 — Leitura e escrita do atendimento

**Criar:** `dados-atendimento.ts`, `acoes-atendimento.ts` e testes.
**Modificar:** `dados.ts` somente para compor a ficha.

- [ ] Testar workspace errado, cliente ausente, registro privado e atualização
  concorrente.
- [ ] Implementar leitura tipada, escrita no servidor e revalidação da ficha.
- [ ] Testar que `workspace_id` de formulário nunca decide acesso.
- [ ] Rodar Vitest focado e TypeScript.

### T-083 — Ficha 360° de atendimento

**Criar:** componentes `mapa-atendimento.tsx`, `plano-acao.tsx` e `grafo.tsx`.
**Modificar:** `src/app/(app)/mentoria/[id]/visao.tsx` e teste correspondente.

- [ ] Testar sem base, sem consentimento, falha de leitura e dados completos.
- [ ] Exibir mapa, metas, passos, reflexões e relações na ficha profissional.
- [ ] Exibir pergunta como sugestão editável, nunca como instrução ao cliente.
- [ ] Rodar testes da ficha e TypeScript.

### T-084 — Revisão entre sessões e portal mínimo

**Modificar:** `dados-historico.ts`, `historico.ts`, seus testes e
`src/app/(app)/portal/visao.tsx`.

- [ ] Testar evolução por data, mudanças de nota, metas vencidas e ocultação de
  conteúdo privado no portal.
- [ ] Registrar revisões sem classificar melhora ou piora clínica.
- [ ] Rodar Vitest focado e TypeScript.

## Fase C — Entrada, sessão e transcrição

### T-085 — Onboarding estruturado

**Modificar:** `src/app/(app)/onboarding/visao.tsx`, `page.tsx` e testes.

- [ ] Testar consentimento granular, abandono parcial e “prefiro não responder”.
- [ ] Coletar somente mapa autorizado, objetivo e primeira meta.
- [ ] Rodar testes de onboarding e TypeScript.

### T-086 — Roteiro de sessão e reflexões

**Criar:** componentes em `src/app/(app)/mentoria/[id]/` e testes.

- [ ] Testar roteiro vazio, edição de pergunta, reflexão e conversão em passo.
- [ ] Exibir perguntas contextuais, reflexão livre e ações combinadas.
- [ ] Rodar Vitest focado e TypeScript.

### T-087 — Transcrição manual autorizada

**Modificar:** `acoes-transcricao.ts`, `acoes-ficha.ts` e testes.

- [ ] Testar entrada manual, consentimento ausente, acesso indevido e grafo sem
  vazamento do texto.
- [ ] Após Portão 1, persistir transcrição manual sob visibilidade explícita.
- [ ] Rodar testes, TypeScript e auditoria RLS quando autorizada.

## Portão 2 — IA e fornecedor de transcrição

Exigir contrato com fornecedor, dados que podem sair, retenção, consentimento
por sessão, falha segura e autorização explícita. Sem isso, T-087 permanece em
entrada manual local.

### T-087B — Transcrição externa e resumo revisável

**Modificar:** `acoes-transcricao.ts`, `acoes-ficha.ts` e testes, somente após
o Portão 2.

- [ ] Testar que fornecedor ausente não envia nenhum dado e que falha externa
  não apaga a anotação manual.
- [ ] Enviar somente uma sessão consentida ao fornecedor aprovado e receber o
  resultado como rascunho privado.
- [ ] Exigir revisão e aceite do profissional antes de salvar resumo, fatos ou
  relações no grafo.
- [ ] Rodar testes focados, TypeScript e auditoria autorizada.

## Fase D — Pendências de comunicação e operação

### T-088 — Mensagem individual e contrato pelo portal

**Criar:** módulo de conversa privada e testes.
**Modificar:** documentos/ficha para contrato com visibilidade explícita.

- [ ] Testar remetente/destinatário, bloqueio entre clientes, auditoria e
  arquivo privado.
- [ ] Implementar somente após contrato de dados e RLS específico.
- [ ] Rodar testes, TypeScript e auditoria autorizada.

### T-089 — Recomendações visíveis ao profissional

**Modificar:** `alertas-risco.ts`, `mentoria/risco/visao.tsx` e testes.

- [ ] Testar fatos de origem, incerteza e revisão humana obrigatória.
- [ ] Mostrar sugestões como perguntas de acompanhamento, não diagnósticos.
- [ ] Rodar Vitest focado e TypeScript.

### T-090 — Boas-vindas e scripts comerciais por perguntas

**Modificar:** onboarding, `/comercial` e testes correspondentes.

- [ ] Testar consentimento para boas-vindas e scripts sem respostas
  manipulativas.
- [ ] Entregar somente versão interna/local; WhatsApp ou e-mail real exigem
  autorização de integração.
- [ ] Rodar Vitest focado e TypeScript.

### T-091 — Renda pessoal, e-mail e landing pages

**Modificar:** `/pessoal` para renda; criar marketing e testes após contrato.

- [ ] Testar isolamento entre renda pessoal e negócio.
- [ ] Testar consentimento de marketing, cancelamento e nenhum envio padrão.
- [ ] Ativar e-mail, landing externa ou tracking somente com autorização.

## Fase E — Fechamento

### T-092 — Auditoria de produto e regressão

- [ ] Rodar `npx vitest run` integral e `npx tsc --noEmit` após cada onda.
- [ ] Revisar estados sem dados, consentimento revogado, conteúdo privado e
  portal.
- [ ] Fazer revisão independente e atualizar inventário, contrato, ledger e
  `Onde parei.md` com evidências reais.

## Cobertura das pendências anteriores

| Pendência | Tarefa |
|---|---|
| Transcrição automática e resumo | T-087 + T-087B |
| Coleta de dados iniciais | T-085 |
| DM individual e contrato portal | T-088 |
| Recomendações | T-089 |
| Boas-vindas e scripts | T-090 |
| Renda pessoal, e-mail e landing pages | T-091 |

## Ordem de execução

T-076 → T-077 → T-078 → T-079 → T-080 → Portão 1 → T-081 → T-082 → T-083 →
T-084 → T-085 → T-086 → T-087 → Portão 2 → T-087B → T-088 → T-089 → T-090 →
T-091 → T-092.
