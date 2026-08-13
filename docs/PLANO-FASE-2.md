# Plano — Fase 2: as áreas que faltam

Documento de execução. A Fase 1 (`docs/PLANO-FASE-1.md`) fez identidade, saída
das rotas de infoproduto e fundação de dados; os blocos B2/B3 fizeram Mentoria
(carteira, ficha, sessões) e o Portal do Mentorado. Esta fase ataca o que
sobrou dos 12 módulos prometidos em https://mentoros-apresentacao.vercel.app/#modulos.

As decisões de arquitetura não são reabertas aqui: valem as sete de
`docs/DESENHO-MENTOROS.md` seção 1, e em especial a **1.3 — zero de custo
externo**, reconfirmada pelo dono agora. Cada módulo abaixo diz, com todas as
letras, qual é a sua versão degradada e o que ela deixa de fazer.

As regras da casa continuam sendo as mesmas, e este plano só é executável por
quem já as absorveu:

- **Nunca inventar número.** Sem dado, a tela DIZ que não tem. O incidente que
  originou essa regra está escrito em `src/lib/data/index.ts`: o dono abriu o
  painel em produção e leu faturamento, meta de afiliado e parcelas vencidas
  que nunca existiram — e acreditou.
- **Nunca apagar.** Status muda, linha fica (cabeçalho de `src/lib/mentoria/acoes.ts`).
- **RLS no banco é a garantia, não o `if` na tela** (cabeçalho de
  `src/lib/mentoria/portal.ts`). Toda tabela nova nasce com `workspace_id` e
  com política por papel, na mesma migração — nunca depois.
- **Zero emoji.** Glifos só ▲ ▼ ▬ (cabeçalho de `src/app/(app)/mentoria/textos.ts`).
- **Papel novo em rota nova é decisão consciente**, e o padrão NEGA
  (`src/lib/papeis.ts`).
- **TDD.** Teste escrito, visto falhar, depois o código.
- **Módulo puro recebe `agoraIso` como parâmetro**, nunca chama `new Date()`
  (cabeçalho de `src/lib/mentoria/progresso.ts`). `new Date()` mora na borda da
  rota, e só lá.

Convenção de numeração: as migrações desta fase começam em **0014** (a última
aplicada é `0013_portal_tarefa_por_funcao.sql`). Toda migração nova precisa,
além do arquivo `NNNN_nome.sql`, do gêmeo `_exec_NNNN_nome.sql` (a versão sem
comentário, que é a colada no SQL Editor do Supabase) e de uma extensão em
`src/lib/supabase/migracoes.test.ts` — o teste que lê os `.sql` do disco e
prova, por texto, que nenhuma política nasceu com `using (true)` nem sem
`workspace_atual()`.

---

# Parte A — Inventário ANTES

Este é o critério de aceite. No fim da execução alguém monta a mesma tabela com
a coluna "depois" e compara linha por linha. Nada aqui é marcado `tem` por
existir só como tabela no banco: tabela sem tela é `falta`, e está dito onde.

| # | Módulo | Bullet da apresentação | Estado | Onde está / por que não |
|---|---|---|---|---|
| **1** | **CRM & Clientes** | Kanban com arrastar entre estágios | **tem** | `src/app/(app)/crm/page.tsx` + `src/components/kanban.tsx` |
| 1 | | Perfil do cliente com atividades | **tem** | `src/app/(app)/crm/[id]/page.tsx` + `src/components/timeline.tsx` |
| 1 | | WhatsApp na ficha | **tem** | `src/components/crm-whatsapp.tsx`, `src/lib/atendimento/` |
| 1 | | Estágios Prospect → Alumni | **parcial** | `crm_estagios` (0002) traz Lead/Em conversa/Aluno novo/Aluno ativo/Em risco/Inativo. Não existe Prospect nem Alumni, e a escada não conversa com `status_mentorado` (0006: lead/ativo/pausado/alumni) |
| 1 | | Histórico 360° unificado | **falta** | Hoje partido: CRM em `/crm/[id]` (notas, atividades, interações), mentoria em `/mentoria/[id]` (sessões, tarefas, marcos, score). Nenhuma tela junta os dois |
| 1 | | Score de saúde 0–100 do mentorado | **falta** | `src/lib/health.ts` existe e é do NEGÓCIO (margem, crescimento, diversificação), consumido só por `/financeiro` via `src/components/saude-negocio.tsx`. Não há score por pessoa |
| 1 | | Documentos anexados | **falta** | Não existe tabela, storage, rota nem tela |
| **2** | **Sessões** | Agendar sessão | **tem** | `agendarSessao` em `src/lib/mentoria/acoes.ts` |
| 2 | | Dar baixa (realizada/faltou/cancelada) | **tem** | `darBaixaNaSessao`, idem |
| 2 | | Individual e turma | **tem** | `sessao.matricula_id` XOR `sessao.turma_id` (0006), `CHECK sessao_vinculo_unico` |
| 2 | | Link de gravação | **tem** | `sessao.link_gravacao` + `linkGravacaoValido` em `src/lib/mentoria/validacao.ts` |
| 2 | | Resumo da sessão | **tem** | `sessao.resumo`, escrito na baixa |
| 2 | | Sessão amarrada ao Google Calendar | **falta** | `src/lib/integracoes/google-agenda.ts` pede escopo `calendar.readonly` e `src/lib/integracoes/calendar.ts` sabe criar evento, mas nenhum dos dois conhece `sessao`. Não há coluna de id de evento |
| 2 | | Transcrição automática | **falta** | `transcreverAudio` existe em `src/lib/integracoes/stt.ts` (Groq Whisper) e é chamada só por `src/app/api/transcrever/route.ts`, sem vínculo com sessão |
| **3** | **Portal do Mentorado** | Progresso ("sessão 8 de 12") | **tem** | `src/lib/mentoria/progresso.ts` + `/portal` |
| 3 | | Próxima sessão | **tem** | `proximaSessao`, idem |
| 3 | | Tarefas com baixa pelo mentorado | **tem** | `portal_marcar_tarefa` (0013) + `src/lib/mentoria/acoes-portal.ts` |
| 3 | | Marcos | **tem** | `marco` (0006), card no `src/app/(app)/portal/visao.tsx` |
| 3 | | Conteúdos liberados | **parcial** | `conteudo_liberado` (0006) é lida e desenhada, mas nada no sistema ESCREVE nela — não há tela de liberação |
| 3 | | Timeline de evolução | **parcial** | Existe um card "Evolução" que lista `score_evolucao`, mas nada escreve nessa tabela. Não há linha do tempo de fatos |
| 3 | | Acesso a gravações e transcrições | **falta** | `sessao.link_gravacao` e `sessao.transcricao` não são expostos no portal, e não há flag dizendo o que pode ser exposto |
| **4** | **Conteúdo** | Trilhas | **falta** | `/conteudo` é OUTRA COISA (posts de rede social, campanhas, ranking — `src/app/(app)/conteudo/`). `modulos`/`aulas` existem em 0009 presas a `produtos`, sem tela |
| 4 | | Liberação gradual | **falta** | Não existe regra, coluna nem tela |
| 4 | | Progresso do aluno na trilha | **falta** | `progresso_aulas` existe em 0009, RLS FECHADO (só dono/gestor) e por `aluno_id`, não por `mentorado_id`. Sem tela |
| 4 | | Certificado | **falta** | Não existe |
| **5** | **Feed & Comunicação** | WhatsApp com fila aprovada por humano | **tem** | `src/lib/atendimento/`, `src/app/api/atendimento/` |
| 5 | | Feed privado | **falta** | `post`/`comentario` estão no desenho (§3) e não no banco |
| 5 | | Broadcast (aviso para todos) | **falta** | Não existe |
| 5 | | DM mentor ↔ mentorado dentro do sistema | **falta** | Não existe (WhatsApp é fora) |
| **6** | **Onboarding** | Checklist de entrada | **falta** | Não existe |
| 6 | | Coleta de dados iniciais | **falta** | Não existe |
| 6 | | Contrato | **falta** | Não existe tabela nem upload |
| 6 | | Boas-vindas automatizada | **falta** | Não existe |
| **7** | **Pipeline SDR/Closer** | Funil próprio de vendas | **parcial** | `crm_estagios` + `status_funil` servem ao CRM de alunos, não a um pipeline SDR/Closer com dono da etapa |
| 7 | | Scripts por etapa | **falta** | Não existe |
| 7 | | Propostas com link rastreável | **falta** | Não existe |
| 7 | | Dashboard de conversão | **falta** | `funil()` em `src/lib/metrics.ts` conta aluno por `status_funil`, não conversão de oportunidade entre etapas |
| **8** | **Financeiro do negócio** | DRE gerencial | **tem** | `/financeiro/dre` |
| 8 | | Fluxo de caixa | **tem** | `/financeiro/caixa` |
| 8 | | Projeção 13 semanas | **tem** | `/financeiro/projecao` |
| 8 | | Reembolsos | **tem** | `/financeiro/reembolsos` |
| 8 | | Extrato CSV/OFX | **tem** | `src/lib/extrato/`, `/extrato` |
| 8 | | Contas a pagar / a receber | **tem** | `pagaveis`/`recebiveis` (0004), `datasetCaixa` |
| 8 | | Cobrança recorrente | **falta** | Não existe tabela `cobranca`. Versão degradada definida em §1.3 (Pix com baixa manual) ainda não construída |
| 8 | | Régua de inadimplência | **falta** | Não existe |
| 8 | | Contratos | **falta** | Não existe |
| 8 | | MRR / ARR / LTV | **parcial** | `statsAluno` em `src/lib/metrics.ts` calcula LTV por aluno somando matrícula paga. Não há MRR nem ARR, e nada de recorrência para sustentá-los |
| **9** | **Finanças pessoais do mentor** | Patrimônio | **falta** | Não existe |
| 9 | | Investimentos | **falta** | Não existe |
| 9 | | Renda pessoal separada do negócio | **falta** | Não existe |
| **10** | **IA de Evolução** | Groq/Anthropic ligados | **tem** | `src/lib/integracoes/ia.ts`, `src/lib/integracoes/stt.ts`, `src/app/api/ia/route.ts` |
| 10 | | Resumo de transcrição | **tem** | `resumirTranscricao` em `src/lib/integracoes/ia.ts` |
| 10 | | Tabela de score semanal | **tem** | `score_evolucao` (0006), com `unique (mentorado_id, semana)` |
| 10 | | Análise da sessão | **falta** | Nada liga uma sessão a uma análise. Não há tabela de análise |
| 10 | | Cálculo do score semanal | **falta** | Ninguém escreve em `score_evolucao` |
| 10 | | Alerta de risco / churn | **falta** | Não existe |
| 10 | | Recomendações | **falta** | Não existe |
| **11** | **IA de Vendas** | Análise de call de vendas | **falta** | `calls_resumos` existe desde 0001, presa a `lancamento_id` (rota de infoproduto removida na Fase 1), sem tela nenhuma |
| 11 | | Score da call / objeções | **falta** | Não existe |
| **12** | **Marketing** | Captura de lead com UTM | **falta** | Não existe |
| 12 | | Link rastreável | **falta** | Não existe |
| 12 | | E-mail marketing | **falta** | Não existe — e não vai existir nesta fase (ver Parte C) |
| 12 | | Construtor de landing page | **falta** | Não existe — e não vai existir nesta fase (ver Parte C) |

Contagem do ANTES: **17 `tem`**, **7 `parcial`**, **32 `falta`**.

---

# Parte B — As tarefas

## Por que esta ordem

O que destrava mais coisa vem primeiro, e nesta fase são quatro peças
transversais: a **escada de estágios** (que o CRM, o pipeline comercial e o
onboarding vão todos consultar), a tabela de **documentos** (que serve ao CRM,
ao contrato do financeiro e ao onboarding), o **score de saúde do mentorado**
(que o CRM mostra, o portal mostra, o alerta de risco dispara e a IA de
evolução grava semanalmente — uma conta só, uma fonte só) e o **histórico
360°** (que a ficha do time lê inteiro e o portal lê filtrado). Construir
qualquer módulo antes dessas quatro obrigaria a construí-lo duas vezes.

Depois vem Sessões, porque é ela que ALIMENTA quase tudo que sobrou: gravação e
transcrição são insumo do portal e das duas IAs, e evento de calendário é o que
faz o onboarding e a régua de cobrança terem para onde apontar. Conteúdo, Feed e
Onboarding vêm em seguida por serem o que o mentorado vê. O comercial vem depois
porque a IA de vendas se alimenta dele. Financeiro e finanças pessoais vêm
adiante por serem independentes de tudo acima. As duas IAs e o Marketing ficam
por último — pela mesma razão escrita na seção 7 do desenho: IA sem histórico
não tem o que analisar.

Dentro de cada módulo a ordem é sempre a mesma, e foi ela que fez os blocos
anteriores darem certo: **(a) migração SQL → (b) módulo puro de regra → (c)
camada de leitura → (d) ações de escrita → (e) tela.** Módulo puro primeiro,
tela por último.

---

## Bloco 1 — Fundação transversal

### 1 · Migração: escada de estágios Prospect → Alumni
**Arquivos**
- `supabase/migrations/0014_jornada_estagios.sql`
- `supabase/migrations/_exec_0014_jornada_estagios.sql`
- `src/lib/supabase/migracoes.test.ts` (extensão)

**O combinado**
`crm_estagios` ganha a coluna `chave text not null` (identificador estável, ex.
`prospect`, `alumni`) com `unique (workspace_id, chave)`, e as seis linhas
semeadas em 0002 são REMAPEADAS por `update` — nunca por `delete`/`insert`,
porque `alunos.estagio_id` aponta para elas. A escada final é
`prospect → lead_qualificado → proposta → cliente_novo → cliente_ativo → em_risco → alumni`;
as duas etapas novas (`prospect`, `alumni`) entram por `insert`, e `inativo`
vira `alumni` só quando o dono decidir — a migração não reclassifica ninguém.
RLS: as políticas de `crm_estagios` já existem em 0008 (grupo CRM); a migração
reafirma que a nova coluna não abre política nenhuma.

**Como testar** — `npx vitest run src/lib/supabase/migracoes.test.ts`
Asserções: (1) `0014` não contém `delete from public.crm_estagios` nem
`truncate`; (2) contém `unique` sobre `(workspace_id, chave)`; (3) nenhuma
política criada em 0014 usa `using (true)`; (4) toda política criada em 0014
cita `workspace_atual()`; (5) 0014 não contém `alter type ... add value` (a
armadilha registrada no cabeçalho de 0009 e no C8 da Fase 1); (6) as sete chaves
da escada aparecem literalmente no arquivo. Borda a cobrir: rodar a migração
DUAS vezes seguidas não pode duplicar estágio — o teste exige `on conflict do nothing`
ou `if not exists` em cada `insert`.

**Depende de** — nada.

---

### 2 · Módulo puro: a jornada do cliente
**Arquivos**
- `src/lib/crm/jornada.ts`
- `src/lib/crm/jornada.test.ts`

**O combinado**
Módulo puro (sem Next, sem banco, sem `new Date()`) que exporta a escada
canônica das sete chaves, a ordem entre elas, `jornadaDe(valor: unknown)`
normalizando fail-closed para `prospect` (o menos privilegiado — mesmo padrão de
`papelDe` em `src/lib/papeis.ts`), `transicaoPermitida(de, para)` e
`statusMentoradoDaEtapa(chave)` mapeando a etapa para o `status_mentorado` de
`src/lib/mentoria/tipos.ts`. Retroceder é permitido (negócio real volta atrás);
pular etapa é permitido; o que NÃO é permitido é sair de `alumni` para qualquer
coisa que não seja `cliente_ativo` (recompra explícita).

**Como testar** — `npx vitest run src/lib/crm/jornada.test.ts`
Asserções: cada uma das sete chaves normaliza para si mesma; `"PROSPECT"`,
`" alumni "` normalizam (caixa e espaço, igual a `papelDe`); `null`, `undefined`,
`42`, `{}`, `"cliente"` (prefixo de duas chaves) e `""` caem em `prospect`;
`transicaoPermitida("alumni","prospect")` é `false` e
`transicaoPermitida("alumni","cliente_ativo")` é `true`; o array da escada é
`readonly` e um `push` não compila; `statusMentoradoDaEtapa` devolve um valor que
existe em `STATUS_MENTORADO_VALORES` para TODAS as sete chaves (o teste itera a
escada inteira, não três exemplos).

**Depende de** — 1.

---

### 3 · Tela: kanban do CRM na escada nova
**Arquivos**
- `src/app/(app)/crm/page.tsx`
- `src/lib/actions.ts` (só `moverAlunoEstagio`)
- `src/app/(app)/crm/jornada-visao.test.tsx`

**O combinado**
O kanban passa a ordenar as colunas pela ordem canônica de `jornada.ts` em vez
de `crm_estagios.ordem` cru, e `moverAlunoEstagio` recusa transição que
`transicaoPermitida` negue, voltando `?erro=` para a tela — nunca lançando.
Estágio que exista no banco e não na escada continua aparecendo, no fim, com o
rótulo do banco: a tela não esconde dado que existe só porque o código não o
previu.

**Como testar** — `npx vitest run src/app/(app)/crm/jornada-visao.test.tsx`
Asserções: com sete estágios embaralhados na entrada, a ordem de saída é a
canônica; um estágio desconhecido (`chave: "xpto"`) aparece por último e não é
descartado; `moverAlunoEstagio` com transição negada não chama o banco nem uma
vez (dublê que falha o teste se for chamado) e redireciona com `?erro=`; zero
emoji em todo texto novo.

**Depende de** — 2.

---

### 4 · Migração: tabela `documento`
**Arquivos**
- `supabase/migrations/0015_documento.sql`
- `supabase/migrations/_exec_0015_documento.sql`
- `src/lib/supabase/migracoes.test.ts` (extensão)

**O combinado**
Tabela `public.documento`: `id`, `workspace_id` (default do workspace padrão,
como toda tabela desde 0005), `mentorado_id` (nulo — documento pode ser do
negócio), `aluno_id` (nulo), `titulo`, `caminho_storage`, `mime`, `bytes`,
`categoria` (enum `categoria_documento`: `contrato`, `anamnese`, `material`,
`outro`), `visivel_portal boolean not null default false`, `enviado_por`,
`criado_em`, `arquivado boolean not null default false`. RLS: leitura para
dono/gestor sempre; para `papel_atual() = 'mentorado'` SÓ quando
`mentorado_id = mentorado_atual()` **E** `visivel_portal = true`; escrita só
dono/gestor. Toda política escopada por `workspace_atual()`. Cria também o
bucket privado `documentos` no Supabase Storage com política equivalente.

**Como testar** — `npx vitest run src/lib/supabase/migracoes.test.ts`
Asserções: `documento` entra em `TABELAS_NOVAS_*` e o teste de `workspace_id`
passa; a política de select do mentorado contém, no MESMO bloco (com o nome da
política removido antes da busca — a armadilha documentada no cabeçalho do
teste), `papel_atual() = 'mentorado'`, `mentorado_atual()` **e**
`visivel_portal`; não existe política de update/delete para mentorado; não
existe `using (true)`. Borda: o teste falha se `visivel_portal` tiver default
`true` — o padrão precisa ser NÃO visível.

**Depende de** — nada.

---

### 5 · Módulo puro: validação de arquivo
**Arquivos**
- `src/lib/documentos/validacao.ts`
- `src/lib/documentos/validacao.test.ts`

**O combinado**
Puro. `nomeSeguro(nome)` devolve um nome de arquivo sem caminho, sem `..`, sem
`%`, sem `\`, sem `;` — a mesma família de guardas de `travessiaSuspeita` em
`src/lib/papeis.ts`, pelo mesmo motivo. `tipoPermitido(mime, nome)` aceita só
pdf, png, jpg, webp, docx, csv, xlsx e exige que mime e extensão CONCORDEM.
`tamanhoPermitido(bytes)` corta em 10 MB (limite escolhido para caber no plano
gratuito de 1 GB do Storage com folga). `chaveDeStorage(workspaceId, categoria, nomeSeguro)`
monta o caminho.

**Como testar** — `npx vitest run src/lib/documentos/validacao.test.ts`
Asserções: `"../../etc/passwd"`, `"a\\b.pdf"`, `"x%2fy.pdf"`, `"a;b.pdf"`,
`"...pdf"` e nome vazio são recusados ou saneados sem sobrar separador;
`application/pdf` com nome `.exe` é recusado (mime e extensão discordando);
`.exe`, `.sh`, `.svg` (SVG carrega script) são recusados; 0 byte é recusado;
10 MB + 1 byte é recusado e 10 MB exato é aceito; `chaveDeStorage` nunca produz
caminho que comece com `/` nem contenha `..`.

**Depende de** — nada.

---

### 6 · Leitura: documentos
**Arquivos**
- `src/lib/documentos/dados.ts`
- `src/lib/documentos/dados.test.ts`

**O combinado**
Server-only, no molde exato de `src/lib/mentoria/dados.ts`: sem Supabase
configurado devolve `{ conectado: false, motivo, documentos: [] }`; erro de
leitura vira o mesmo formato com motivo genérico (sem nome de tabela, coluna, id
ou SQL) e o detalhe só em `console.warn`. Exporta
`lerDocumentosDoMentorado(mentoradoId)` e `lerDocumentosDoNegocio()`, mais
`linhaParaDocumento(row)` normalizando cada campo.

**Como testar** — `npx vitest run src/lib/documentos/dados.test.ts`
Asserções: sem env do Supabase, ZERO consultas são feitas (dublê que conta
chamadas) e `conectado` é `false`; erro do supabase-js vira `conectado: false` e
o `motivo` NÃO contém `"documento"`, `"select"`, nem o texto do erro original;
`linhaParaDocumento` com `bytes: null`, `mime: undefined`, `titulo` ausente
devolve valores neutros e nunca `undefined`; documento com `arquivado: true` não
entra na lista padrão.

**Depende de** — 4.

---

### 7 · Escrita: anexar e arquivar documento
**Arquivos**
- `src/lib/documentos/acoes.ts`
- `src/lib/documentos/acoes.test.ts`

**O combinado**
Server Actions no molde de `src/lib/mentoria/acoes.ts`: zod valida na borda,
`criarSupabaseServer` (nunca `service_role`), `revalidatePath` depois de gravar,
erro volta em `?erro=`. `anexarDocumento` sobe para o Storage e grava a linha;
`arquivarDocumento` faz UPDATE de `arquivado` — **nunca DELETE**, nem do arquivo
no bucket. `alternarVisivelPortal` troca a flag e só ela.

**Como testar** — `npx vitest run src/lib/documentos/acoes.test.ts`
Asserções: nenhuma função do arquivo chama `.delete()` nem `remove()` (teste que
lê o próprio fonte, como já se faz para "não apaga"); arquivo que reprova em
`tipoPermitido` não chega ao Storage (dublê falha se chamado); `mentorado_id`
vindo do formulário é gravado, mas `workspace_id` NÃO é aceito do formulário
(vem do default do banco); erro do Storage não deixa linha órfã na tabela (a
gravação da linha só acontece DEPOIS do upload dar certo); a URL de redirect
nunca carrega o texto do erro do banco, só um código curto (a correção MÉDIO 5
descrita no cabeçalho de `acoes-portal.ts`).

**Depende de** — 5, 6.

---

### 8 · Módulo puro: score de saúde do MENTORADO (0–100)
**Arquivos**
- `src/lib/mentoria/saude-mentorado.ts`
- `src/lib/mentoria/saude-mentorado.test.ts`

**O combinado**
Puro, com a mesma disciplina de `src/lib/health.ts`: **fator só pontua quando o
dado que ele mede existe**, fator sem base fica fora da soma e o score é
renormalizado sobre o que sobrou; sem nenhum fator com base, o score é `null` e
`semBase` é `true` — nunca zero. Cinco fatores, todos calculados de fato já
existente, nenhum de IA: presença nas sessões (realizadas ÷ agendadas passadas),
tarefas concluídas no prazo, dias em silêncio (`diasEmSilencio` de
`progresso.ts`), aderência ao ritmo previsto do programa, e tendência das
últimas quatro linhas de `score_evolucao`. `agoraIso` é parâmetro. Esta é a
ÚNICA conta de saúde do mentorado no sistema: o CRM, o portal, o alerta de risco
e o snapshot semanal chamam todos esta função — duas contas para o mesmo número
é como se inventa número sem ninguém notar.

**Como testar** — `npx vitest run src/lib/mentoria/saude-mentorado.test.ts`
Asserções: mentorado sem NENHUMA sessão passada devolve `score: null`,
`semBase: true` — e o teste falha explicitamente se devolver `0`; mentorado com
sessões mas sem tarefa nenhuma tem `parcial: true` e `maxComBase` menor que
100; 100% de presença e 100% de tarefas dá score alto mas o teste trava o valor
exato, não um intervalo; `score_evolucao` com uma linha só não gera tendência
(precisa de duas); score sempre entre 0 e 100 inclusive, para entradas
absurdas (sessões no futuro, prazos negativos, `sessoes_previstas: 0`);
`agoraIso` inválido não lança, devolve `semBase`.

**Depende de** — nada.

---

### 9 · Módulo puro: histórico 360° unificado
**Arquivos**
- `src/lib/mentoria/historico.ts`
- `src/lib/mentoria/historico.test.ts`

**O combinado**
Puro. Recebe as listas cruas já lidas (interações, notas, atividades, sessões,
tarefas, marcos, scores, documentos, cobranças) e devolve **uma** série
ordenada de `FatoHistorico { quando, tipo, titulo, detalhe, visibilidade }`,
com `visibilidade: "interno" | "publico"`. Nota de CRM, temperatura de lead,
valor de cobrança e documento não visível no portal nascem `interno`; sessão,
tarefa, marco e conteúdo liberado nascem `publico`. Exporta também
`projetarParaPortal(fatos)` que devolve SÓ os `publico`. Ordem decrescente por
`quando`, empate resolvido por tipo (ordem fixa e testada), nunca por
`Array.sort` instável.

**Como testar** — `npx vitest run src/lib/mentoria/historico.test.ts`
Asserções: a asserção mais importante é **nenhum fato `interno` sobrevive a
`projetarParaPortal`** — e o teste itera TODOS os tipos declarados no módulo,
não uma amostra, para que um tipo novo criado amanhã sem classificação quebre o
teste; tipo desconhecido cai em `interno` (fail-closed); dois fatos no mesmo
instante saem sempre na mesma ordem entre execuções; data inválida não lança e
vai para o fim; lista vazia devolve `[]` e não `null`; nenhum campo de
`detalhe` carrega telefone, e-mail ou valor em reais quando `visibilidade` é
`publico`.

**Depende de** — nada.

---

## Bloco 2 — CRM completo

### 10 · Leitura: histórico 360° da ficha
**Arquivos**
- `src/lib/mentoria/dados-historico.ts`
- `src/lib/mentoria/dados-historico.test.ts`

**O combinado**
Server-only, molde de `dados.ts`. `lerHistorico(mentoradoId, agoraIso)` busca em
paralelo o que hoje está partido entre `/crm/[id]` e `/mentoria/[id]`
(interações, notas, atividades do aluno vinculado via `mentorado.aluno_id`;
sessões, tarefas, marcos, scores, documentos do mentorado) e passa por
`historico.ts`. Devolve `{ conectado, motivo, fatos, saude }`, com `saude`
vindo de `saude-mentorado.ts`.

**Como testar** — `npx vitest run src/lib/mentoria/dados-historico.test.ts`
Asserções: mentorado SEM `aluno_id` não dispara consulta nenhuma às tabelas de
CRM (dublê conta) e o histórico sai só com fatos de mentoria; falha em UMA das
consultas não zera as outras — o resultado é parcial e a tela é avisada por um
campo `parcial: true`, nunca um histórico silenciosamente incompleto; `motivo`
não vaza nome de tabela; a `saude` devolvida é a MESMA que
`saudeDoMentorado` retornaria com os mesmos dados (teste compara as duas
chamadas, para provar que não há segunda conta).

**Depende de** — 8, 9, 6.

---

### 11 · Tela: ficha do mentorado com histórico 360° e saúde
**Arquivos**
- `src/app/(app)/mentoria/[id]/visao.tsx`
- `src/app/(app)/mentoria/[id]/page.tsx`
- `src/app/(app)/mentoria/[id]/visao.test.tsx`

**O combinado**
A ficha ganha duas coisas: um card "Saúde do mentorado" que mostra o score, os
fatores COM base e diz em texto quais ficaram de fora (nunca esconde a
parcialidade), e uma aba "Histórico" com a série unificada usando
`src/components/timeline.tsx`. Quando `saude.score` é `null`, o card diz que
ainda não há base para calcular — não desenha 0, não desenha barra vazia.

**Como testar** — `npx vitest run src/app/(app)/mentoria/[id]/visao.test.tsx`
Asserções: com `score: null` a marcação NÃO contém `"0"` como número do score
nem barra de progresso; com `parcial: true` a frase que nomeia os fatores fora
da conta aparece; o histórico rende fatos `interno` (é a tela do time, então
DEVE render) e o teste trava isso, para não confundir com a tela do portal;
zero emoji; os únicos glifos presentes são ▲ ▼ ▬.

**Depende de** — 10.

---

### 12 · Tela: documentos na ficha e na ficha de CRM
**Arquivos**
- `src/app/(app)/mentoria/[id]/documentos.tsx`
- `src/app/(app)/mentoria/[id]/documentos.test.tsx`
- `src/app/(app)/crm/[id]/page.tsx` (só o link para a ficha de mentoria)

**O combinado**
Componente de lista + formulário de anexo dentro da ficha, com o interruptor
"visível no portal" desligado por padrão e um aviso escrito ao lado dele
dizendo exatamente quem passa a ver o arquivo se for ligado. `/crm/[id]` ganha
um link para `/mentoria/[id]` quando existe mentorado vinculado — o passo que
tira o histórico de "partido em dois" sem fundir as duas tabelas (decisão de
modelagem registrada no cabeçalho de `mentorado` em 0006).

**Como testar** — `npx vitest run src/app/(app)/mentoria/[id]/documentos.test.tsx`
Asserções: o checkbox "visível no portal" nasce desmarcado; o aviso ao lado
dele existe e cita "mentorado"; documento arquivado não aparece na lista
padrão; a lista vazia mostra `Vazio` com frase honesta, não uma tabela de
cabeçalho sem linha; nenhum `caminho_storage` é impresso na marcação (é caminho
interno, não interessa a quem lê).

**Depende de** — 7, 11.

---

## Bloco 3 — Sessões: calendário e transcrição

### 13 · Migração: colunas de agenda e liberação na sessão
**Arquivos**
- `supabase/migrations/0016_sessao_agenda_gravacao.sql`
- `supabase/migrations/_exec_0016_sessao_agenda_gravacao.sql`
- `src/lib/supabase/migracoes.test.ts` (extensão)

**O combinado**
`public.sessao` ganha `evento_google_id text not null default ''`,
`link_reuniao text not null default ''`,
`gravacao_liberada boolean not null default false`,
`transcricao_liberada boolean not null default false`,
`transcrita_em timestamptz`, `transcricao_origem text not null default ''`.
Nenhuma política nova: `sessao` já tem RLS de portal em 0007/0008. O ponto que a
migração precisa documentar por escrito no cabeçalho: **RLS é por linha, não
por coluna** (a lição de 0013) — logo, uma sessão visível ao mentorado expõe
TODAS as suas colunas via PostgREST, e é por isso que a liberação de gravação e
de transcrição precisa mudar a VISIBILIDADE DA LINHA, não confiar na tela.
Consequência escrita e implementada aqui: a política de select do mentorado em
`sessao` passa a exigir que a sessão seja dele **e** ele só enxerga
`transcricao`/`link_gravacao` através de uma **view** `sessao_do_portal` com
`security_invoker = true` que devolve `''` nessas colunas quando a flag
correspondente é `false`.

**Como testar** — `npx vitest run src/lib/supabase/migracoes.test.ts`
Asserções: a view `sessao_do_portal` existe e tem `security_invoker = true` (o
crítico 1/2 já registrado no cabeçalho do teste); a view contém um `case` que
zera `transcricao` quando `transcricao_liberada` é falso, e outro para
`link_gravacao`; as duas flags têm default `false` (o teste falha se alguém
puser `true`); 0016 não contém `alter type ... add value`; a view entra em
`VIEWS_DO_SCHEMA`.

**Depende de** — nada.

---

### 14 · Módulo puro: evento de calendário a partir da sessão
**Arquivos**
- `src/lib/mentoria/calendario.ts`
- `src/lib/mentoria/calendario.test.ts`

**O combinado**
Puro. `eventoDaSessao(sessao, mentorado, programa)` devolve
`{ titulo, descricao, inicioIso, fimIso, convidados }` pronto para virar evento
do Google ou linha de `.ics`. O título carrega o primeiro nome e o número da
sessão; a descrição **nunca** carrega valor de contrato, telefone, e-mail de
terceiro nem link de gravação — evento de calendário é sincronizado para o
celular de quem foi convidado e frequentemente para o de mais alguém.
`fimIso` sai de `quando + duracaoMin`. Sessão de turma não gera convidado
individual nenhum: um evento com a lista de e-mails da turma expõe a carteira
inteira para cada participante.

**Como testar** — `npx vitest run src/lib/mentoria/calendario.test.ts`
Asserções: sessão de turma (`turmaId` preenchido, `matriculaId` nulo) devolve
`convidados: []`; a `descricao` não contém `@`, não contém dígito em sequência
de telefone, não contém `R$`, e não contém `sessao.linkGravacao` mesmo quando
ele existe; `duracaoMin: 0` produz `fimIso === inicioIso` e não data inválida;
`quando` inválido devolve `null` em vez de lançar; fuso — uma sessão às 23:00 de
São Paulo não vira o dia seguinte no título (o mesmo cuidado documentado em
`src/app/(app)/mentoria/textos.ts`).

**Depende de** — nada.

---

### 15 · Integração: escrita na agenda do Google
**Arquivos**
- `src/lib/integracoes/google-agenda-escrita.ts`
- `src/lib/integracoes/google-agenda-escrita.test.ts`
- `src/lib/integracoes/google-agenda.ts` (só o escopo)
- `src/app/api/agenda/google/entrar/route.ts` (só o escopo)

**O combinado**
`ESCOPO_AGENDA` deixa de ser só `calendar.readonly` e passa a pedir também
`calendar.events` — e o cabeçalho de `google-agenda.ts`, que hoje diz com todas
as letras "o app não consegue criar, mover nem apagar evento nenhum, mesmo que
alguém queira", é REESCRITO na mesma tarefa para dizer a verdade nova. Comentário
que virou mentira é pior que comentário nenhum. O módulo novo expõe
`criarEventoDaSessao` / `atualizarEventoDaSessao` / `cancelarEventoDaSessao`,
todos usando o refresh token do cookie httpOnly já existente, e todos devolvendo
`{ ok, erro }` — nunca lançando.

**Como testar** — `npx vitest run src/lib/integracoes/google-agenda-escrita.test.ts`
Asserções: sem cookie de conexão, as três funções devolvem `ok: false` com motivo
humano e **não fazem fetch nenhum**; resposta 401 do Google devolve `ok: false` e
o motivo NÃO contém o token; `cancelarEventoDaSessao` sem `evento_google_id`
devolve `ok: true` (nada a fazer não é erro) e não chama a API; um teste de texto
prova que `google-agenda.ts` não contém mais a frase "não consegue criar".

**Depende de** — 14.

---

### 16 · Escrita: amarrar sessão e evento
**Arquivos**
- `src/lib/mentoria/acoes-calendario.ts`
- `src/lib/mentoria/acoes-calendario.test.ts`

**O combinado**
Server Action `sincronizarSessaoNaAgenda(formData)`: cria o evento se
`evento_google_id` estiver vazio, atualiza se já existir, cancela quando a baixa
foi `cancelada`. Grava o id do evento de volta em `sessao.evento_google_id`.
Quando o Google não está conectado, a ação **degrada**: devolve um `.ics` para
download usando `src/lib/integracoes/ics.ts`, e a tela diz que a agenda não está
ligada — nunca finge que sincronizou.

**Como testar** — `npx vitest run src/lib/mentoria/acoes-calendario.test.ts`
Asserções: sessão já com `evento_google_id` chama atualizar, não criar; falha na
API do Google **não** grava `evento_google_id` (senão a próxima sincronização
tentaria atualizar um evento inexistente para sempre); baixa `cancelada` chama
cancelar e mantém a linha da sessão (nada de DELETE); sem Google conectado, zero
chamadas à API e o resultado traz o caminho do `.ics`; a Server Action nunca
recebe `workspace_id` do formulário.

**Depende de** — 13, 15.

---

### 17 · Escrita: transcrever a sessão
**Arquivos**
- `src/lib/mentoria/acoes-transcricao.ts`
- `src/lib/mentoria/acoes-transcricao.test.ts`

**O combinado**
Server Action `transcreverSessao(formData)`: recebe o áudio, chama
`transcreverAudio` (`src/lib/integracoes/stt.ts`, Groq Whisper no plano
gratuito), grava `sessao.transcricao`, `transcrita_em` e
`transcricao_origem = "groq"`. **Quem dispara é uma pessoa, sempre** — não há
cron, não há gatilho de banco (decisão 1.3 do desenho). Sem `GROQ_API_KEY`, o
provider volta `"demo"` e a ação **recusa gravar**: transcrição de demonstração
salva na sessão de um cliente vira, um mês depois, uma frase que ninguém sabe
de onde veio.

**Como testar** — `npx vitest run src/lib/mentoria/acoes-transcricao.test.ts`
Asserções: `provider: "demo"` não grava nada no banco (dublê falha se
chamado) e devolve erro explicando que a transcrição não está configurada;
arquivo de 0 byte é recusado antes da chamada à Groq; erro HTTP da Groq não
grava transcrição parcial nem `transcrita_em`; transcrever DE NOVO uma sessão
que já tem transcrição sobrescreve mas preserva a anterior em um campo de
histórico ou recusa — o teste trava a decisão escolhida, e ela precisa ser
"recusa, a menos que venha `?substituir=1`"; `transcricao_liberada` NÃO é ligada
por esta ação (liberar é ato humano separado).

**Depende de** — 13.

---

### 18 · Tela: botões de agenda e transcrição na ficha
**Arquivos**
- `src/app/(app)/mentoria/[id]/visao.tsx`
- `src/app/(app)/mentoria/[id]/visao.test.tsx`
- `src/app/(app)/mentoria/textos.ts`

**O combinado**
Cada sessão da ficha ganha: estado da agenda ("na agenda" / "não sincronizada" /
"agenda não conectada"), botão de sincronizar, campo de upload de áudio com
botão de transcrever, e dois interruptores — "liberar gravação no portal" e
"liberar transcrição no portal" — cada um com o aviso do que o mentorado passa a
ver. Sessão de turma mostra um aviso a mais: liberar a transcrição de uma sessão
de turma libera a fala de TODOS os participantes para cada um deles.

**Como testar** — `npx vitest run src/app/(app)/mentoria/[id]/visao.test.tsx`
Asserções: sessão de turma renderiza o aviso extra e sessão individual não;
os dois interruptores nascem desligados; sem Google conectado o botão de
sincronizar vira o texto de `.ics` e não some (sumir esconde a funcionalidade);
a transcrição em si NÃO é impressa na ficha por padrão (é texto longo, e o teste
de vazamento do portal já existente em `src/app/(app)/portal/page.test.tsx`
provou que transcrição impressa é um mutante que sobrevive calado); zero emoji.

**Depende de** — 16, 17.

---

## Bloco 4 — Portal: timeline, gravações e transcrições

### 19 · Leitura: portal com linha do tempo e sessões do portal
**Arquivos**
- `src/lib/mentoria/portal.ts`
- `src/lib/mentoria/portal.test.ts`

**O combinado**
`lerPortal` passa a ler `sessao_do_portal` (a view de 0016) no lugar de
`sessao`, e a devolver `linhaTempo` — a projeção pública de `historico.ts`
(`projetarParaPortal`). Nada mais muda: continua com um parâmetro só
(`agoraIso`), continua perguntando ao banco quem é o usuário via
`rpc("mentorado_atual")`, continua sem aceitar `mentoradoId` de fora.

**Como testar** — `npx vitest run src/lib/mentoria/portal.test.ts`
Asserções: a consulta de sessões usa `sessao_do_portal` e não `sessao` (teste de
texto sobre a chamada do dublê); um fato `interno` injetado na entrada NÃO
aparece em `linhaTempo`; `ehMentorado: false` continua com zero consultas às
tabelas dependentes; `lerPortal` continua com aridade 1 — o teste falha se
alguém acrescentar um segundo parâmetro (é a defesa escrita no cabeçalho do
arquivo contra o buraco clássico de trocar o id na URL).

**Depende de** — 13, 9.

---

### 20 · Tela: timeline, gravação e transcrição no portal
**Arquivos**
- `src/app/(app)/portal/visao.tsx`
- `src/app/(app)/portal/page.test.tsx`
- `src/app/(app)/portal/textos.ts`

**O combinado**
O portal ganha um card "Sua evolução" com a linha do tempo (marcos, sessões
realizadas, tarefas concluídas, conteúdos liberados) e, dentro do histórico de
sessões, o link de gravação e o texto da transcrição — **só quando vierem
preenchidos pela view**, que é onde a decisão de liberar mora. A tela não
consulta flag nenhuma: se o campo veio vazio, não desenha a seção.

**Como testar** — `npx vitest run src/app/(app)/portal/page.test.tsx`
Asserções (a suíte deste arquivo já foi escrita para matar mutantes de
vazamento — os novos entram na mesma lista): transcrição vazia não renderiza
seção nenhuma, nem cabeçalho vazio; link de gravação que não passa em
`linkGravacaoValido` não vira `<a href>`; nenhum `mentorado_id`, `perfil_id`,
telefone ou papel aparece na marcação; a linha do tempo com lista vazia mostra
frase honesta; zero emoji; os únicos glifos são ▲ ▼ ▬.

**Depende de** — 19.

---

### 21 · Escrita: liberar conteúdo para um mentorado
**Arquivos**
- `src/lib/mentoria/acoes-conteudo-liberado.ts`
- `src/lib/mentoria/acoes-conteudo-liberado.test.ts`
- `src/app/(app)/mentoria/[id]/liberados.tsx`

**O combinado**
Fecha o `parcial` mais constrangedor do inventário: `conteudo_liberado` existe
desde 0006, o portal a desenha, e **nada no sistema escreve nela**. Server
Action para liberar um título + URL (ou um documento já anexado) para um
mentorado, e para revogar — revogar é `arquivado = true`, não DELETE.

**Como testar** — `npx vitest run src/lib/mentoria/acoes-conteudo-liberado.test.ts`
Asserções: URL que não passa por validação de esquema (`http`/`https` apenas,
sem `javascript:`, sem `data:`) é recusada antes de qualquer escrita; liberar
para um `mentorado_id` que não existe volta erro humano e não cria linha órfã;
revogar não chama `.delete()`; nenhuma função aceita `workspace_id` do
formulário.

**Depende de** — 7.

---

## Bloco 5 — Conteúdo: trilhas, liberação gradual, progresso, certificado

Versão degradada (§1.3): **vídeo por YouTube não listado embutido**. Não há
Mux, não há HLS, não há proteção de download. O que isso deixa de fazer está na
Parte C.

### 22 · Migração: `trilha` e `trilha_aula`
**Arquivos**
- `supabase/migrations/0017_trilha.sql`
- `supabase/migrations/_exec_0017_trilha.sql`
- `src/lib/supabase/migracoes.test.ts` (extensão)

**O combinado**
`public.trilha` (workspace_id, nome, descricao, programa_id nulo, ativa,
criado_em) e `public.trilha_aula` (workspace_id, trilha_id, ordem, titulo,
tipo `tipo_aula` — o enum já existe desde 0009 —, url_video, texto,
duracao_min, `libera_em_dias int not null default 0`, criado_em). Tabelas NOVAS
em vez de reaproveitar `modulos`/`aulas` de 0009, e o cabeçalho da migração
precisa dizer por quê: aquelas são presas a `produtos` e o progresso delas é por
`aluno_id`, sem ponte limpa para `mentorado_id` — a lacuna já está descrita, com
todas as letras, no cabeçalho de 0009. RLS: leitura para dono/gestor/comercial;
para mentorado, só trilha ligada a programa em que ele tem matrícula ativa (via
`mentorado_atual()`), escopado por `workspace_atual()`.

**Como testar** — `npx vitest run src/lib/supabase/migracoes.test.ts`
Asserções: as duas tabelas entram na lista multi-tenant e passam no teste de
`workspace_id`; a política do mentorado cita `mentorado_atual()` no `using`
depois de remover o nome da política; não há política de insert/update/delete
para mentorado; `libera_em_dias` tem default 0 e `check (libera_em_dias >= 0)`;
sem `alter type ... add value`.

**Depende de** — nada.

---

### 23 · Migração: matrícula em trilha, progresso e certificado
**Arquivos**
- `supabase/migrations/0018_trilha_progresso_certificado.sql`
- `supabase/migrations/_exec_0018_trilha_progresso_certificado.sql`
- `src/lib/supabase/migracoes.test.ts` (extensão)

**O combinado**
`public.trilha_matricula` (mentorado_id, trilha_id, inicio date, ativa,
`unique (mentorado_id, trilha_id)`), `public.progresso_trilha` (mentorado_id,
trilha_aula_id, concluida, concluida_em, `unique (mentorado_id, trilha_aula_id)`)
e `public.certificado` (mentorado_id, trilha_id, `codigo text unique`,
emitido_em, `unique (mentorado_id, trilha_id)`). Mais a função
`security definer` `public.trilha_marcar_aula(p_aula_id uuid, p_concluida boolean)`
— exatamente o desenho de `portal_marcar_tarefa` em 0013, pelo mesmo motivo:
RLS não decide por coluna, e sem a função o mentorado poderia forjar
`concluida_em` ou mover o progresso para outro `mentorado_id` com um PATCH direto
no PostgREST. **Não existe política de UPDATE de `progresso_trilha` para
mentorado** — só a função.

**Como testar** — `npx vitest run src/lib/supabase/migracoes.test.ts`
Asserções: `progresso_trilha` **não** tem nenhuma política `for update` que cite
`'mentorado'` (a asserção que existiria antes de 0013 e teria pegado o ataque);
`trilha_marcar_aula` é `security definer` com `set search_path = public`; a
função grava `now()` do lado do Postgres e não aceita timestamp de parâmetro (o
backdating provado pela auditoria); as três tabelas têm `workspace_id`; o
`unique` de `certificado.codigo` existe.

**Depende de** — 22.

---

### 24 · Módulo puro: liberação gradual
**Arquivos**
- `src/lib/conteudo/liberacao.ts`
- `src/lib/conteudo/liberacao.test.ts`

**O combinado**
Puro. `aulasLiberadas(aulas, inicioIso, agoraIso)` devolve, para cada aula, se
está liberada e — quando não está — em que data libera. A regra é
`inicio + libera_em_dias`. `libera_em_dias: 0` libera na hora. Sem `inicio`
válido, NADA é liberado e cada aula volta com `motivo: "sem data de início"` —
liberar por omissão seria entregar a trilha inteira a quem acabou de entrar.

**Como testar** — `npx vitest run src/lib/conteudo/liberacao.test.ts`
Asserções: `inicioIso` inválido/vazio libera zero aulas; aula com
`libera_em_dias: 0` libera no mesmo instante do início; a fronteira exata (aula
que libera hoje, chamada exatamente à meia-noite de São Paulo) é testada nos dois
lados; fuso — um início às 23:00 não adianta a liberação em um dia; `agoraIso`
anterior ao início não libera nada e não devolve número negativo de dias;
lista vazia devolve `[]`.

**Depende de** — nada.

---

### 25 · Módulo puro: progresso da trilha e direito a certificado
**Arquivos**
- `src/lib/conteudo/progresso-trilha.ts`
- `src/lib/conteudo/progresso-trilha.test.ts`

**O combinado**
Puro. `progressoDaTrilha(aulas, marcas)` devolve `{ total, concluidas, pct }`
com `pct: null` quando `total` é 0 — nunca 0%, que leria como "não começou"
para uma trilha que não tem aula nenhuma. `temDireitoAoCertificado` exige 100%
das aulas LIBERADAS **e** 100% das aulas totais: certificado com aula ainda não
liberada seria certificado de trilha incompleta.

**Como testar** — `npx vitest run src/lib/conteudo/progresso-trilha.test.ts`
Asserções: trilha sem aula devolve `pct: null` e o teste falha se devolver `0`;
marca de progresso apontando para aula que não está na trilha é ignorada e não
infla o numerador; `concluidas` nunca passa de `total`; duas marcas para a mesma
aula contam uma vez; direito ao certificado é `false` quando todas as liberadas
estão feitas mas ainda há aula por liberar.

**Depende de** — 24.

---

### 26 · Módulo puro: código do certificado
**Arquivos**
- `src/lib/conteudo/certificado.ts`
- `src/lib/conteudo/certificado.test.ts`

**O combinado**
Puro. `gerarCodigo(aleatorio)` monta um código de verificação de 12 caracteres
do alfabeto sem ambiguidade (sem `0/O`, sem `1/I/l`), recebendo a fonte de
aleatoriedade como parâmetro — módulo puro não sorteia sozinho.
`codigoValido(texto)` valida forma. O código **não** é derivado do
`mentorado_id`: código adivinhável é o mesmo buraco de um link de proposta
sequencial.

**Como testar** — `npx vitest run src/lib/conteudo/certificado.test.ts`
Asserções: o alfabeto não contém `0`, `O`, `1`, `I`, `l`; o código tem sempre 12
caracteres; `codigoValido` recusa código com caractere fora do alfabeto, com
tamanho errado, com espaço, vazio e `null`; dois códigos gerados com fontes
diferentes diferem; a função não usa `Math.random` por dentro (teste de texto do
próprio fonte).

**Depende de** — nada.

---

### 27 · Leitura: trilhas
**Arquivos**
- `src/lib/conteudo/dados-trilha.ts`
- `src/lib/conteudo/dados-trilha.test.ts`

**O combinado**
Server-only, molde de `dados.ts`. `lerTrilhas()` para o time,
`lerMinhaTrilha(agoraIso)` para o portal (sem receber id de fora, igual a
`lerPortal`), já cruzando `liberacao.ts` e `progresso-trilha.ts`.

**Como testar** — `npx vitest run src/lib/conteudo/dados-trilha.test.ts`
Asserções: `lerMinhaTrilha` tem aridade 1 e resolve a identidade por
`rpc("mentorado_atual")`; aula não liberada volta com `url_video` VAZIA — a
camada de leitura já apaga a URL, não deixa a tela decidir; sem Supabase, zero
consultas; erro parcial devolve `parcial: true`.

**Depende de** — 23, 25.

---

### 28 · Escrita: trilhas e progresso
**Arquivos**
- `src/lib/conteudo/acoes-trilha.ts`
- `src/lib/conteudo/acoes-trilha.test.ts`

**O combinado**
Server Actions: criar/editar trilha e aula (dono/gestor), matricular mentorado
na trilha, e `marcarAula` — que chama `rpc("trilha_marcar_aula")` e nunca
`.update()` direto, pela razão inteira escrita no cabeçalho de
`acoes-portal.ts`. Emitir certificado é uma ação separada que confere
`temDireitoAoCertificado` **e** grava o código.

**Como testar** — `npx vitest run src/lib/conteudo/acoes-trilha.test.ts`
Asserções: `marcarAula` chama `rpc` e nenhum `.update()`/`.delete()` (teste de
texto do fonte); marcar aula NÃO liberada é recusado antes do banco; emitir
certificado sem direito é recusado e não grava; emitir duas vezes devolve o
mesmo código (o `unique (mentorado_id, trilha_id)` do banco é a garantia; a ação
trata o conflito como sucesso, não como erro); nenhuma ação aceita
`workspace_id` do formulário.

**Depende de** — 27, 26.

---

### 29 · Rotas novas: registrar Conteúdo/Trilhas nos três catálogos
**Arquivos**
- `src/lib/papeis.ts`
- `src/lib/apps.ts`
- `src/lib/nav-lateral.ts`
- `src/lib/papeis.test.ts`
- `src/lib/apps.test.ts`

**O combinado**
`/trilhas` entra em `ROTAS_COMERCIAL`? **Não** — trilha é entrega, não venda.
Entra só para dono/gestor (que já recebem `"todas"`), e a rota do aluno é
`/portal/trilha`, que cai sob o prefixo `/portal` já presente em
`ROTAS_MINIMAS`. O tile e o item de menu entram com cor e ícone escolhidos
conforme o critério já escrito no comentário de paleta de `apps.ts`. A
verificação `/certificado/[codigo]` é rota PÚBLICA e entra em `rotaLivre`
(`src/lib/acesso.ts`) — decisão consciente e justificada no comentário: um
certificado que só o dono consegue verificar não é certificado.

**Como testar** — `npx vitest run src/lib/papeis.test.ts src/lib/apps.test.ts`
Asserções: `rotaPermitida("comercial", "/trilhas")` é `false`;
`rotaPermitida("mentorado", "/trilhas")` é `false`;
`rotaPermitida("mentorado", "/portal/trilha")` é `true`;
`rotaPermitida("mentorado", "/certificado/ABC")` é `true`;
`rotaPermitida("mentorado", "/trilhas/..%2ffinanceiro")` é `false` (a guarda de
travessia); `appsDoPapel("mentorado")` não devolve o tile de Trilhas — o
vazamento de EXISTÊNCIA que o B2.7 corrigiu não pode voltar; o teste "não muta
CATALOGO_APPS" continua verde.

**Depende de** — nada (pode rodar em paralelo com 22–28, mas precisa estar
pronta antes de 30).

---

### 30 · Tela: gestão de trilhas
**Arquivos**
- `src/app/(app)/trilhas/page.tsx`
- `src/app/(app)/trilhas/visao.tsx`
- `src/app/(app)/trilhas/visao.test.tsx`
- `src/app/(app)/trilhas/[id]/page.tsx`
- `src/app/(app)/trilhas/[id]/visao.tsx`

**O combinado**
Lista de trilhas e o editor de uma trilha (aulas em ordem, tipo, dias para
liberar, URL do YouTube não listado). O campo de vídeo diz, ao lado, que o
vídeo precisa estar "não listado" e o que isso significa na prática: quem tiver
o link assiste, mesmo sem estar matriculado.

**Como testar** — `npx vitest run src/app/(app)/trilhas/visao.test.tsx`
Asserções: trilha sem aula mostra `Vazio` com frase honesta; o aviso sobre
"não listado" existe e é literal; URL que não é do YouTube não vira `<iframe>`;
zero emoji; a ordem das aulas na tela é a de `ordem`, com empate resolvido de
forma estável.

**Depende de** — 28, 29.

---

### 31 · Tela: trilha no portal e certificado
**Arquivos**
- `src/app/(app)/portal/trilha/page.tsx`
- `src/app/(app)/portal/trilha/visao.tsx`
- `src/app/(app)/portal/trilha/visao.test.tsx`
- `src/app/certificado/[codigo]/page.tsx`

**O combinado**
O mentorado vê a trilha, marca aula como concluída, e vê a data em que a
próxima libera. A página de certificado é pública, imprimível, e mostra: nome,
trilha, data, código. Zero custo: é uma página HTML feita para `Ctrl+P`, não um
PDF gerado por serviço.

**Como testar** — `npx vitest run src/app/(app)/portal/trilha/visao.test.tsx`
Asserções: aula não liberada não renderiza `<iframe>` nem a URL em texto (a URL
já vem vazia da camada de leitura, e o teste prova que a tela também não a
inventaria); a data de liberação futura aparece como data, não como "em breve";
a página de certificado com código inexistente diz que não encontrou e **não
diz** quantos certificados existem nem sugere formato; a página de certificado
não imprime e-mail nem telefone; zero emoji.

**Depende de** — 30.

---

## Bloco 6 — Feed & Comunicação

Versão degradada: **feed dentro do sistema, sem push e sem e-mail.** O aviso
chega quando a pessoa abre o portal. Broadcast por WhatsApp continua passando
pela fila aprovada por humano que já existe.

### 32 · Migração: `post`, `post_destinatario`, `comentario`
**Arquivos**
- `supabase/migrations/0019_feed.sql`
- `supabase/migrations/_exec_0019_feed.sql`
- `src/lib/supabase/migracoes.test.ts` (extensão)

**O combinado**
`public.post` (workspace_id, autor_perfil_id, `escopo` enum `escopo_post`:
`feed` | `broadcast` | `dm`, titulo, corpo, publicado_em, arquivado),
`public.post_destinatario` (post_id, mentorado_id, lido_em) e
`public.comentario` (post_id, autor_perfil_id, corpo, arquivado). RLS: `feed` é
visível a todo mentorado do workspace; `broadcast` idem; `dm` **só** ao
mentorado que está em `post_destinatario` — e a política precisa provar isso com
um `exists` sobre `post_destinatario` casando com `mentorado_atual()`.
`comentario` herda a visibilidade do post por `exists`. Escrita de post: só
dono/gestor. Escrita de comentário: dono/gestor e o mentorado que enxerga o
post.

**Como testar** — `npx vitest run src/lib/supabase/migracoes.test.ts`
Asserções: a política de select de `post` contém um `case`/`or` que trata `dm`
por `exists (... post_destinatario ... mentorado_atual())` — o teste falha se a
palavra `dm` aparecer sem o `exists` no mesmo bloco; `comentario` não tem
política que libere leitura sem passar pelo post; nenhuma política nova sem
`workspace_atual()`; as três tabelas com `workspace_id`; sem `using (true)`.

**Depende de** — nada.

---

### 33 · Módulo puro: quem vê o quê
**Arquivos**
- `src/lib/feed/visibilidade.ts`
- `src/lib/feed/visibilidade.test.ts`

**O combinado**
Puro. `postsVisiveis(posts, destinatarios, mentoradoId)` filtra por escopo, e
`resumoNaoLidos` conta. Este módulo é **conveniência de tela, não segurança** —
e o cabeçalho precisa dizer isso do jeito que `portal.ts` diz: a garantia é a
RLS de 0019; se este arquivo inteiro sumisse, o mentorado continuaria sem ver DM
alheia.

**Como testar** — `npx vitest run src/lib/feed/visibilidade.test.ts`
Asserções: DM sem linha em `post_destinatario` para o mentorado não aparece;
DM com destinatário de OUTRO mentorado não aparece; escopo desconhecido cai em
"não visível" (fail-closed); post arquivado não aparece; contagem de não lidos
ignora post arquivado e não conta duas vezes o mesmo post com dois
destinatários; `mentoradoId` vazio devolve lista vazia, nunca a lista inteira.

**Depende de** — nada.

---

### 34 · Leitura: feed
**Arquivos**
- `src/lib/feed/dados.ts`
- `src/lib/feed/dados.test.ts`

**O combinado**
Server-only, molde de `dados.ts`: `lerFeedDoTime()` e `lerMeuFeed(agoraIso)`
(aridade 1, identidade pelo `rpc`).

**Como testar** — `npx vitest run src/lib/feed/dados.test.ts`
Asserções: `lerMeuFeed` não aceita `mentoradoId`; sem Supabase, zero consultas;
erro vira `conectado: false` com motivo sem nome de tabela; comentário de post
não visível não é buscado (a consulta parte dos posts já filtrados, não do
inverso).

**Depende de** — 32, 33.

---

### 35 · Escrita: publicar, comentar, marcar lido
**Arquivos**
- `src/lib/feed/acoes.ts`
- `src/lib/feed/acoes.test.ts`

**O combinado**
Server Actions: publicar post (com escopo e destinatários), comentar, arquivar
(nunca apagar), marcar como lido. Marcar lido é o mesmo padrão de 0013: função
`security definer` que só troca `lido_em` da linha do próprio mentorado — não
uma política de UPDATE de linha inteira.

**Como testar** — `npx vitest run src/lib/feed/acoes.test.ts`
Asserções: publicar `dm` sem destinatário é recusado antes do banco; publicar
`broadcast` com destinatário é recusado (broadcast é para todos, e listar
destinatários abriria a carteira); arquivar não chama `.delete()`; marcar lido
usa `rpc`, não `.update()`; corpo vazio é recusado; o corpo é gravado como texto
e nunca interpretado como HTML.

**Depende de** — 34.

---

### 36 · Rota e tela: feed do time e feed do portal
**Arquivos**
- `src/lib/papeis.ts`
- `src/app/(app)/feed/page.tsx`
- `src/app/(app)/feed/visao.tsx`
- `src/app/(app)/feed/visao.test.tsx`
- `src/app/(app)/portal/visao.tsx` (card de avisos)

**O combinado**
`/feed` para dono/gestor (o comercial fica de fora: feed é entrega, não venda),
e um card de avisos no portal com os posts visíveis e o contador de não lidos —
usando `badgeValido` de `apps.ts`, que já recusa 0 e NaN.

**Como testar** — `npx vitest run src/app/(app)/feed/visao.test.tsx src/lib/papeis.test.ts`
Asserções: `rotaPermitida("comercial","/feed")` é `false`;
`rotaPermitida("mentorado","/feed")` é `false`; feed vazio mostra frase honesta;
contador zero não desenha badge; corpo do post é renderizado como texto (uma
entrada com `<script>` sai escapada); zero emoji.

**Depende de** — 35.

---

## Bloco 7 — Onboarding

Versão degradada: **contrato por upload** (§1.3). Não há assinatura digital.

### 37 · Migração: modelo e progresso de onboarding
**Arquivos**
- `supabase/migrations/0020_onboarding.sql`
- `supabase/migrations/_exec_0020_onboarding.sql`
- `src/lib/supabase/migracoes.test.ts` (extensão)

**O combinado**
`public.onboarding_etapa` (workspace_id, ordem, titulo, descricao,
`responsavel` enum `responsavel_etapa`: `mentor` | `mentorado`, `obrigatoria`,
ativa) e `public.onboarding_progresso` (mentorado_id, etapa_id, concluida,
concluida_em, `unique (mentorado_id, etapa_id)`), mais
`public.onboarding_marcar(p_etapa_id uuid, p_concluida boolean)`
`security definer` para as etapas de responsabilidade do mentorado — mesmo
desenho de 0013. RLS: mentorado lê as etapas ativas e o próprio progresso;
escreve só pela função, e só nas etapas com `responsavel = 'mentorado'`.

**Como testar** — `npx vitest run src/lib/supabase/migracoes.test.ts`
Asserções: não existe política `for update` de `onboarding_progresso` citando
`'mentorado'`; a função confere `responsavel = 'mentorado'` no `where` (o teste
procura essa condição no corpo da função — sem ela, o mentorado marcaria como
feita a etapa que é do mentor); `now()` gerado no servidor; as duas tabelas com
`workspace_id`; sem `using (true)`.

**Depende de** — nada.

---

### 38 · Módulo puro: roteiro de onboarding
**Arquivos**
- `src/lib/onboarding/roteiro.ts`
- `src/lib/onboarding/roteiro.test.ts`

**O combinado**
Puro. `estadoDoOnboarding(etapas, progresso, agoraIso)` devolve
`{ pct, proximaEtapa, pendentesDoMentor, pendentesDoMentorado, concluido }`.
`pct` é `null` quando não há etapa obrigatória — nunca 0%. `concluido` exige
todas as OBRIGATÓRIAS feitas, ignorando as opcionais.

**Como testar** — `npx vitest run src/lib/onboarding/roteiro.test.ts`
Asserções: zero etapa devolve `pct: null` e o teste falha se devolver `0`;
etapa inativa não conta em nenhum dos números; progresso apontando para etapa
inexistente é ignorado; `proximaEtapa` é a de menor `ordem` ainda pendente, com
empate resolvido de forma estável; etapa opcional pendente não impede
`concluido: true`.

**Depende de** — nada.

---

### 39 · Leitura e escrita: onboarding
**Arquivos**
- `src/lib/onboarding/dados.ts`
- `src/lib/onboarding/dados.test.ts`
- `src/lib/onboarding/acoes.ts`
- `src/lib/onboarding/acoes.test.ts`

**O combinado**
Leitura no molde de `dados.ts` (`lerOnboarding(mentoradoId)` para o time,
`lerMeuOnboarding(agoraIso)` para o portal, aridade 1). Escrita: criar/ordenar
etapas do modelo (dono/gestor), marcar etapa do mentor (dono/gestor), e
`marcarMinhaEtapa` via `rpc("onboarding_marcar")`.

**Como testar** — `npx vitest run src/lib/onboarding/dados.test.ts src/lib/onboarding/acoes.test.ts`
Asserções: `lerMeuOnboarding` tem aridade 1; `marcarMinhaEtapa` usa `rpc` e
nenhum `.update()`; marcar etapa cuja `responsavel` é `mentor` a partir da ação
do portal é recusado antes do banco E barrado pela função (defesa dupla, e o
teste cobre as duas); reordenar etapa não apaga linha; sem Supabase, zero
consultas.

**Depende de** — 37, 38.

---

### 40 · Rota e tela: onboarding no time e no portal
**Arquivos**
- `src/lib/papeis.ts`
- `src/app/(app)/onboarding/page.tsx`
- `src/app/(app)/onboarding/visao.tsx`
- `src/app/(app)/onboarding/visao.test.tsx`
- `src/app/(app)/portal/visao.tsx` (card "Seus primeiros passos")

**O combinado**
`/onboarding` para dono/gestor: o modelo de etapas e o painel de quem está em
que passo. No portal, um card com as etapas do mentorado, o upload do contrato
assinado (usando `documento`, categoria `contrato`) e a barra de progresso —
que some quando o onboarding está concluído, em vez de ficar 100% para sempre.

**Como testar** — `npx vitest run src/app/(app)/onboarding/visao.test.tsx src/lib/papeis.test.ts`
Asserções: `rotaPermitida("mentorado","/onboarding")` é `false` (a casa dele é
`/portal`); com `pct: null` a barra não é desenhada e o texto explica; etapa do
mentor aparece no portal como informação, sem botão de marcar; o painel do time
não mostra o conteúdo dos documentos enviados, só que foram enviados; zero
emoji.

**Depende de** — 39, 12.

---

## Bloco 8 — Pipeline SDR/Closer

### 41 · Migração: `funil_etapa` e `oportunidade`
**Arquivos**
- `supabase/migrations/0021_comercial_funil.sql`
- `supabase/migrations/_exec_0021_comercial_funil.sql`
- `src/lib/supabase/migracoes.test.ts` (extensão)

**O combinado**
`public.funil_etapa` (workspace_id, chave, nome, ordem, `tipo` enum
`tipo_etapa_funil`: `sdr` | `closer`, ativa) e `public.oportunidade`
(workspace_id, aluno_id, mentorado_id nulo, etapa_id, responsavel_perfil_id,
valor numeric, `probabilidade int check between 0 and 100`, `origem`,
`status` enum `status_oportunidade`: `aberta` | `ganha` | `perdida`,
motivo_perda, criado_em, fechado_em). RLS: dono/gestor/comercial leem e
escrevem; **mentorado não lê nada** — oportunidade carrega valor negociado.

**Como testar** — `npx vitest run src/lib/supabase/migracoes.test.ts`
Asserções: nenhuma política de `oportunidade` cita `'mentorado'` (o teste falha
se citar); as duas tabelas entram em `TABELAS_CRM` e passam no teste de
`workspace_atual()`; `probabilidade` tem `check`; `unique (workspace_id, chave)`
em `funil_etapa`; sem `using (true)`.

**Depende de** — nada.

---

### 42 · Migração: scripts, propostas e leitura pública por token
**Arquivos**
- `supabase/migrations/0022_comercial_proposta.sql`
- `supabase/migrations/_exec_0022_comercial_proposta.sql`
- `src/lib/supabase/migracoes.test.ts` (extensão)

**O combinado**
`public.script_etapa` (workspace_id, etapa_id, titulo, corpo, ordem),
`public.proposta` (workspace_id, oportunidade_id, `token text unique`, titulo,
corpo, valor, validade date, `status` enum `status_proposta`:
`rascunho`|`enviada`|`aceita`|`recusada`|`expirada`, criado_em) e
`public.proposta_visita` (proposta_id, quando, `ip_hash`, `agente_hash`). A
proposta precisa ser lida **sem login** pelo prospect — e por isso NÃO ganha
política pública de select. Ganha a função `security definer`
`public.proposta_publica(p_token text)` que devolve APENAS
`titulo, corpo, valor, validade, status` de uma proposta com status `enviada`
e validade não vencida, e registra a visita. `ip_hash`/`agente_hash` são hash,
não o valor cru: rastrear abertura não é motivo para guardar IP de ninguém.

**Como testar** — `npx vitest run src/lib/supabase/migracoes.test.ts`
Asserções: `proposta` **não** tem política `to anon` nem `using (true)` (a
asserção que impede o vazamento inteiro do pipeline por uma linha de RLS);
`proposta_publica` é `security definer`, tem `set search_path = public`, e o
corpo dela **não** contém `oportunidade_id`, `aluno_id` nem `valor` de outra
proposta; a função filtra por `status = 'enviada'` e por validade; `token` tem
`unique`; `proposta_visita` não tem coluna chamada `ip` nem `user_agent` (só
os hashes).

**Depende de** — 41.

---

### 43 · Módulo puro: conversão do funil
**Arquivos**
- `src/lib/comercial/funil.ts`
- `src/lib/comercial/funil.test.ts`

**O combinado**
Puro. `conversaoPorEtapa(oportunidades, etapas)` devolve, por etapa, quantas
entraram, quantas avançaram e a taxa — com taxa `null` quando o denominador é 0.
`cicloMedio` devolve `null` quando não há oportunidade fechada. Nenhuma função
devolve 0 no lugar de "não dá para calcular", pela mesma disciplina de
`src/lib/health.ts`.

**Como testar** — `npx vitest run src/lib/comercial/funil.test.ts`
Asserções: etapa sem nenhuma oportunidade devolve `taxa: null`, e o teste falha
se devolver `0`; oportunidade `perdida` não conta como avanço; oportunidade
`ganha` conta em todas as etapas anteriores por onde passou apenas se houver
registro de passagem — sem registro, a função devolve `parcial: true` e diz que
não sabe (nunca assume caminho); `cicloMedio` com uma oportunidade fechada
devolve o valor dela, com zero devolve `null`; valores negativos de `valor` não
são somados silenciosamente — entram num campo `inconsistentes`.

**Depende de** — nada.

---

### 44 · Módulo puro: token de proposta
**Arquivos**
- `src/lib/comercial/proposta-token.ts`
- `src/lib/comercial/proposta-token.test.ts`

**O combinado**
Puro. `gerarToken(bytesAleatorios)` monta um token de no mínimo 22 caracteres
base62 a partir de bytes recebidos por parâmetro (mínimo 16 bytes de entropia).
`tokenValido(texto)` valida forma antes de qualquer ida ao banco.
O token **não** deriva de id, e-mail, nome nem data: link de proposta
adivinhável é o pipeline inteiro na mão de quem chutar.

**Como testar** — `npx vitest run src/lib/comercial/proposta-token.test.ts`
Asserções: entrada com menos de 16 bytes lança (não gera token fraco em
silêncio); dois tokens com bytes diferentes diferem; `tokenValido` recusa
token curto, com `/`, com `+`, com `%`, com `..`, vazio e `null`; o módulo não
usa `Math.random` nem `Date.now` (teste de texto do fonte); `gerarToken` com os
mesmos bytes é determinística (é o que torna testável).

**Depende de** — nada.

---

### 45 · Leitura: pipeline e propostas
**Arquivos**
- `src/lib/comercial/dados.ts`
- `src/lib/comercial/dados.test.ts`

**O combinado**
Server-only, molde de `dados.ts`: `lerPipeline(agoraIso)`,
`lerOportunidade(id)`, `lerPropostas(oportunidadeId)`. Já devolve a conversão
calculada por `funil.ts`.

**Como testar** — `npx vitest run src/lib/comercial/dados.test.ts`
Asserções: sem Supabase, zero consultas; erro parcial devolve `parcial: true`
e a conversão NÃO é calculada em cima de dado incompleto (o teste prova que
`conversao` volta `null` quando a leitura falhou parcialmente — conta em cima de
metade dos dados é número inventado); `motivo` sem nome de tabela; token de
proposta nunca é devolvido na listagem do pipeline (só na tela da proposta).

**Depende de** — 42, 43.

---

### 46 · Escrita: oportunidades e propostas
**Arquivos**
- `src/lib/comercial/acoes.ts`
- `src/lib/comercial/acoes.test.ts`

**O combinado**
Server Actions: criar oportunidade, mover de etapa, ganhar/perder (com motivo
obrigatório na perda), criar proposta (gerando o token com
`crypto.randomBytes` na borda e passando os bytes para o módulo puro), enviar
proposta (muda status para `enviada`), registrar aceite/recusa. Ganhar uma
oportunidade **não** cria mentorado automaticamente — cria um rascunho que
alguém confirma. Cadastro nascendo sozinho é o que `registrarInteracoes` já
trata como coisa auditável (ver `ResultadoInteracoes` em `provider.ts`).

**Como testar** — `npx vitest run src/lib/comercial/acoes.test.ts`
Asserções: perder sem motivo é recusado antes do banco; mover para etapa de
outro workspace é impossível (a ação não aceita `workspace_id` e a RLS barra —
o teste cobre a parte da ação); criar proposta duas vezes gera tokens
diferentes; nenhuma ação chama `.delete()`; o token nunca aparece em
`?erro=` nem em log; ganhar oportunidade não escreve em `mentorado`.

**Depende de** — 45, 44.

---

### 47 · Rota e tela: pipeline
**Arquivos**
- `src/lib/papeis.ts`
- `src/lib/apps.ts`
- `src/app/(app)/comercial/page.tsx`
- `src/app/(app)/comercial/visao.tsx`
- `src/app/(app)/comercial/visao.test.tsx`

**O combinado**
`/comercial` entra em `ROTAS_COMERCIAL` (é a tela de trabalho do closer) e no
catálogo de apps. Kanban de oportunidades reaproveitando
`src/components/kanban.tsx`, com o script da etapa ao lado do cartão.

**Como testar** — `npx vitest run src/app/(app)/comercial/visao.test.tsx src/lib/papeis.test.ts src/lib/apps.test.ts`
Asserções: `rotaPermitida("comercial","/comercial")` é `true`;
`rotaPermitida("mentorado","/comercial")` é `false`;
`appsDoPapel("mentorado")` não devolve o tile; pipeline vazio mostra frase
honesta e não um funil desenhado com zeros; taxa `null` aparece como texto, não
como "0%"; zero emoji.

**Depende de** — 46.

---

### 48 · Tela: proposta pública rastreável
**Arquivos**
- `src/app/proposta/[token]/page.tsx`
- `src/app/proposta/[token]/visao.tsx`
- `src/app/proposta/[token]/visao.test.tsx`
- `src/lib/acesso.ts` (registrar `/proposta` como rota livre)
- `src/lib/acesso.test.ts`

**O combinado**
Página pública, sem login, que chama `rpc("proposta_publica")`. Token inválido,
proposta não enviada, vencida ou inexistente caem todos na MESMA resposta
("esta proposta não está disponível") — respostas diferentes para casos
diferentes é um oráculo que permite enumerar tokens. Cada abertura vira uma
linha em `proposta_visita`.

**Como testar** — `npx vitest run src/app/proposta/[token]/visao.test.tsx src/lib/acesso.test.ts`
Asserções: token com forma inválida não chega ao banco (dublê falha se
chamado); proposta vencida e proposta inexistente produzem marcação
BYTE A BYTE idêntica (o teste compara as duas saídas); a página não imprime
`oportunidade_id`, nome do responsável interno nem qualquer outro cliente;
`rotaLivre("/proposta/abc")` é `true` e `rotaLivre("/proposta/..%2ffinanceiro")`
é tratado pela guarda de travessia; a página tem `noindex`.

**Depende de** — 47.

---

### 49 · Tela: dashboard de conversão
**Arquivos**
- `src/app/(app)/comercial/conversao/page.tsx`
- `src/app/(app)/comercial/conversao/visao.tsx`
- `src/app/(app)/comercial/conversao/visao.test.tsx`

**O combinado**
Funil visual (reaproveitando `GraficoFunil` de `src/components/charts.tsx`),
taxa por etapa, ciclo médio, motivo de perda agrupado. Toda métrica sem base
aparece como frase, não como número.

**Como testar** — `npx vitest run src/app/(app)/comercial/conversao/visao.test.tsx`
Asserções: com `conversao: null` (leitura parcial) a tela diz que não pôde
calcular e NÃO desenha gráfico; taxa `null` por etapa não vira 0%; ciclo médio
`null` não vira "0 dias"; motivo de perda vazio não vira categoria "Outros" com
100%; zero emoji.

**Depende de** — 47.

---

## Bloco 9 — Financeiro do negócio

Versão degradada (§1.3): **cobrança recorrente não existe.** O que existe é
controle de recorrência com **baixa manual por Pix**. E **assinatura digital
não existe**: o contrato é upload do arquivo já assinado.

### 50 · Migração: `cobranca`
**Arquivos**
- `supabase/migrations/0023_cobranca.sql`
- `supabase/migrations/_exec_0023_cobranca.sql`
- `src/lib/supabase/migracoes.test.ts` (extensão)

**O combinado**
`public.cobranca` (workspace_id, mentorado_id, matricula_id nulo, `competencia`
date, vencimento date, valor numeric, `status` enum `status_cobranca`:
`prevista`|`aberta`|`paga`|`atrasada`|`cancelada`, pago_em, `forma` enum
`forma_cobranca`: `pix`|`transferencia`|`dinheiro`|`outro`, movimento_id nulo
apontando para `movimentos_caixa`, observacao, criado_em,
`unique (matricula_id, competencia)`). RLS: **financeiro** — só dono/gestor.
O mentorado NÃO lê a própria cobrança nesta fase; se um dia ler, será por view
como a de 0016, não afrouxando esta política.

**Como testar** — `npx vitest run src/lib/supabase/migracoes.test.ts`
Asserções: `cobranca` entra em `TABELAS_FINANCEIRAS_SENSIVEIS` e a política de
select cita `papel_atual() in ('dono','gestor')` e `workspace_atual()`; nenhuma
política cita `'comercial'` nem `'mentorado'`; `unique (matricula_id, competencia)`
existe (é o que impede gerar a mesma parcela duas vezes); sem `using (true)`.

**Depende de** — nada.

---

### 51 · Migração: `contrato`
**Arquivos**
- `supabase/migrations/0024_contrato.sql`
- `supabase/migrations/_exec_0024_contrato.sql`
- `src/lib/supabase/migracoes.test.ts` (extensão)

**O combinado**
`public.contrato` (workspace_id, mentorado_id, matricula_id nulo, documento_id
apontando para `documento` (0015), `assinado_em date`, vigencia_inicio,
vigencia_fim, valor_total, `status` enum `status_contrato`:
`pendente`|`assinado`|`encerrado`|`cancelado`, criado_em). O arquivo em si mora
em `documento`; esta tabela guarda os FATOS do contrato. RLS: dono/gestor;
mentorado lê o próprio contrato (é dele) mas **sem** `valor_total` — o que exige
uma view `contrato_do_portal` com `security_invoker = true`, mesmo desenho de
0016.

**Como testar** — `npx vitest run src/lib/supabase/migracoes.test.ts`
Asserções: a view `contrato_do_portal` existe, tem `security_invoker = true`, e
sua lista de colunas **não** inclui `valor_total`; a política de `contrato` para
mentorado cita `mentorado_atual()`; não há política de update para mentorado;
`workspace_id` presente; sem `using (true)`.

**Depende de** — 4.

---

### 52 · Módulo puro: recorrência
**Arquivos**
- `src/lib/financeiro/recorrencia.ts`
- `src/lib/financeiro/recorrencia.test.ts`

**O combinado**
Puro. `parcelasDe({ inicio, periodicidade, quantidade, valor, diaVencimento })`
devolve a lista de competências e vencimentos. Não grava nada — quem grava é a
ação. Trata dia 31 em mês de 30 (cai no último dia), fevereiro, e ano bissexto.

**Como testar** — `npx vitest run src/lib/financeiro/recorrencia.test.ts`
Asserções: `diaVencimento: 31` em abril devolve 30/04, e em fevereiro de ano
não bissexto devolve 28/02 e em bissexto 29/02; `quantidade: 0` devolve `[]`;
`quantidade` negativa devolve `[]` e não lança; início inválido devolve `[]`;
periodicidade desconhecida devolve `[]` (fail-closed, nunca "assume mensal");
valor com centavos não acumula erro de ponto flutuante ao longo de 12 parcelas
(a soma bate com o total até o centavo); fuso — a virada de mês não muda com o
servidor em UTC.

**Depende de** — nada.

---

### 53 · Módulo puro: régua de inadimplência
**Arquivos**
- `src/lib/financeiro/inadimplencia.ts`
- `src/lib/financeiro/inadimplencia.test.ts`

**O combinado**
Puro. `reguaDe(cobrancas, agoraIso)` devolve, por cobrança em atraso, qual
lembrete é o DEVIDO agora (D-3 antes, D+1, D+3, D+7, D+15) e o texto sugerido.
O módulo **sugere**; quem envia é a fila de WhatsApp que já existe e que só
entrega mensagem aprovada por humano (`listEnviosPendentes` em
`src/lib/data/provider.ts`). Envio automático em nome do dono é o erro que ele
não consegue desfazer — está escrito lá, e continua valendo.

**Como testar** — `npx vitest run src/lib/financeiro/inadimplencia.test.ts`
Asserções: cobrança `paga` não gera lembrete nenhum, mesmo vencida; cobrança
`cancelada` idem; exatamente no dia do vencimento não gera D+1; o mesmo degrau
não é sugerido duas vezes se já houver envio registrado para ele; cobrança com
vencimento inválido é ignorada e entra em `inconsistentes`; o texto sugerido não
contém emoji e não contém valor de OUTRA cobrança; `agoraIso` inválido devolve
lista vazia.

**Depende de** — nada.

---

### 54 · Módulo puro: MRR, ARR e LTV
**Arquivos**
- `src/lib/financeiro/mrr.ts`
- `src/lib/financeiro/mrr.test.ts`

**O combinado**
Puro. `mrrDe(cobrancas, mesIso)` soma o valor recorrente ativo do mês;
`arrDe` é `mrr × 12` e **só existe quando há pelo menos 3 meses de série** —
anualizar um mês é inventar onze. `ltvDe(mentorados, cobrancas)` usa receita
realizada por mentorado, nunca projeção. Toda função devolve `null` +
`semBase: true` quando não há base, no molde de `src/lib/health.ts`.

**Como testar** — `npx vitest run src/lib/financeiro/mrr.test.ts`
Asserções: sem cobrança nenhuma, `mrr` é `null` e o teste falha se for `0`;
com 1 e com 2 meses de série, `arr` é `null` e a razão vem num campo `motivo`;
cobrança `cancelada` não entra no MRR; cobrança `prevista` (ainda não aberta)
não entra no MRR realizado; LTV de mentorado sem pagamento é `null`, não `0`;
mês inválido devolve `semBase`; a soma de MRR de todos os mentorados bate com o
MRR total até o centavo.

**Depende de** — nada.

---

### 55 · Leitura: cobranças, contratos e recorrência
**Arquivos**
- `src/lib/financeiro/dados-cobranca.ts`
- `src/lib/financeiro/dados-cobranca.test.ts`

**O combinado**
Server-only, molde de `dados.ts`. `lerCobrancas(filtro)`, `lerContratos()`,
`lerIndicadoresRecorrencia(agoraIso)` já cruzando `mrr.ts` e
`inadimplencia.ts`.

**Como testar** — `npx vitest run src/lib/financeiro/dados-cobranca.test.ts`
Asserções: sem Supabase, zero consultas; leitura parcial não calcula MRR (volta
`null` com motivo); `motivo` sem nome de tabela; a régua não é calculada com a
lista de cobranças truncada — o teste prova que uma leitura limitada é sinalizada
em vez de silenciosamente usada.

**Depende de** — 50, 51, 52, 53, 54.

---

### 56 · Escrita: gerar recorrência, dar baixa, anexar contrato
**Arquivos**
- `src/lib/financeiro/acoes-cobranca.ts`
- `src/lib/financeiro/acoes-cobranca.test.ts`

**O combinado**
Server Actions: gerar as parcelas de uma matrícula a partir de
`recorrencia.ts`; dar baixa manual (informando data e forma, e criando o
`MovimentoCaixa` correspondente na mesma operação); cancelar cobrança
(UPDATE de status, nunca DELETE); registrar contrato apontando para um
`documento` já enviado.

**Como testar** — `npx vitest run src/lib/financeiro/acoes-cobranca.test.ts`
Asserções: gerar recorrência duas vezes para a mesma matrícula não duplica
parcela (o `unique (matricula_id, competencia)` é a garantia, e a ação trata o
conflito como "já existia", não como erro); baixa com data no futuro é recusada;
baixa que falha ao criar o movimento NÃO marca a cobrança como paga (a mesma
disciplina de "não deixar linha órfã" do upload de documento); cancelar não
chama `.delete()`; registrar contrato com `documento_id` de outra categoria é
recusado.

**Depende de** — 55.

---

### 57 · Telas: cobranças, contratos e recorrência
**Arquivos**
- `src/components/fin-rotas.ts`
- `src/app/(app)/financeiro/cobrancas/page.tsx`
- `src/app/(app)/financeiro/cobrancas/visao.tsx`
- `src/app/(app)/financeiro/cobrancas/visao.test.tsx`
- `src/app/(app)/financeiro/contratos/page.tsx`
- `src/app/(app)/financeiro/recorrencia/page.tsx`

**O combinado**
Três telas novas dentro do módulo financeiro, com as três rotas registradas em
`fin-rotas.ts` (o mapa oficial das telas do financeiro, lido por `apps.ts` ao pé
da letra, com a pergunta de negócio de cada uma como frase). A tela de cobranças
mostra a régua sugerida com um botão que **coloca na fila de aprovação** — nunca
envia.

**Como testar** — `npx vitest run src/app/(app)/financeiro/cobrancas/visao.test.tsx src/lib/apps.test.ts`
Asserções: o botão da régua tem rótulo que diz "colocar na fila", não "enviar";
MRR `null` aparece como frase; nenhuma tela do financeiro é liberada a
`comercial` ou `mentorado` (`appsDoPapel` para os dois não devolve os sub-apps
novos); cobrança sem vencimento não é desenhada como vencida; zero emoji, glifos
só ▲ ▼ ▬.

**Depende de** — 56.

---

## Bloco 10 — Finanças pessoais do mentor

### 58 · Migração: patrimônio, investimento e renda pessoal
**Arquivos**
- `supabase/migrations/0025_financas_pessoais.sql`
- `supabase/migrations/_exec_0025_financas_pessoais.sql`
- `src/lib/supabase/migracoes.test.ts` (extensão)

**O combinado**
`public.patrimonio` (workspace_id, descricao, `classe` enum `classe_patrimonio`:
`imovel`|`veiculo`|`reserva`|`investimento`|`outro`, valor, atualizado_em),
`public.investimento` (workspace_id, nome, `tipo`, aportado, valor_atual,
atualizado_em) e `public.renda_pessoal` (workspace_id, competencia,
`origem` enum `origem_renda`: `prolabore`|`dividendo`|`aluguel`|`outro`,
valor). RLS **mais fechada que a do financeiro do negócio**: só
`papel_atual() = 'dono'`. Nem gestor. O gestor cuida do negócio; o patrimônio
do Jefson não é do negócio, e o comentário da migração precisa dizer isso.

**Como testar** — `npx vitest run src/lib/supabase/migracoes.test.ts`
Asserções: as três tabelas têm política de select que cita `= 'dono'` e **não**
cita `'gestor'` — o teste falha se `gestor` aparecer em qualquer política dessas
três; `workspace_atual()` presente; nenhuma política de insert/update/delete
para outro papel; `workspace_id` presente; sem `using (true)`.

**Depende de** — nada.

---

### 59 · Módulo puro: patrimônio líquido e alocação
**Arquivos**
- `src/lib/pessoal/patrimonio.ts`
- `src/lib/pessoal/patrimonio.test.ts`

**O combinado**
Puro. `resumoPatrimonial(itens, investimentos)` devolve total, alocação por
classe (percentuais) e rentabilidade dos investimentos
(`(valor_atual − aportado) / aportado`). Rentabilidade com `aportado: 0` é
`null`, não infinito nem 0.

**Como testar** — `npx vitest run src/lib/pessoal/patrimonio.test.ts`
Asserções: `aportado: 0` devolve rentabilidade `null` e o teste falha se
devolver `Infinity`, `NaN` ou `0`; alocação de lista vazia devolve `[]` e total
`null`, não `0`; percentuais somam 100 até o arredondamento declarado (e o teste
trava a regra de arredondamento, para o gráfico não somar 99,9); valor negativo
(dívida) é aceito e reduz o total, sem virar percentual negativo maluco na
alocação — dívida sai numa lista à parte.

**Depende de** — nada.

---

### 60 · Leitura, escrita e tela: finanças pessoais
**Arquivos**
- `src/lib/pessoal/dados.ts`
- `src/lib/pessoal/dados.test.ts`
- `src/lib/pessoal/acoes.ts`
- `src/lib/papeis.ts`
- `src/app/(app)/pessoal/page.tsx`
- `src/app/(app)/pessoal/visao.test.tsx`

**O combinado**
Leitura e escrita no molde de sempre, e a rota `/pessoal` registrada em
`papeis.ts` de forma explícita: dono e gestor recebem `"todas"` hoje, então
**esta é a primeira rota do sistema que precisa negar algo a um papel que recebe
`"todas"`**. A decisão consciente: `ROTAS_POR_PAPEL` ganha uma lista de NEGAÇÃO
explícita por papel, avaliada antes do `"todas"`, e `gestor` entra nela para
`/pessoal`. A alternativa — confiar só na RLS — deixaria o gestor abrindo uma
tela vazia sem entender por quê, exatamente o sintoma que o ALTO 2 documentado
em `papeis.ts` descreve.

**Como testar** — `npx vitest run src/lib/papeis.test.ts src/app/(app)/pessoal/visao.test.tsx`
Asserções: `rotaPermitida("dono","/pessoal")` é `true` e
`rotaPermitida("gestor","/pessoal")` é `false`; a negação vence o `"todas"`;
`primeiraRotaDe` continua devolvendo, para todo papel, uma rota que
`rotaPermitida` aprova (o teste que impede laço de redirecionamento);
`appsDoPapel("gestor")` não devolve o tile de `/pessoal`; total `null` não vira
`R$ 0,00`; zero emoji.

**Depende de** — 58, 59.

---

## Bloco 11 — IA de Evolução

Versão degradada (§1.3): **a IA nasce manual.** Quem dispara é uma pessoa,
clicando. O gatilho automático fica escrito e **desligado**.

### 61 · Migração: `analise_sessao` e `alerta_risco`
**Arquivos**
- `supabase/migrations/0026_ia_evolucao.sql`
- `supabase/migrations/_exec_0026_ia_evolucao.sql`
- `src/lib/supabase/migracoes.test.ts` (extensão)

**O combinado**
`public.analise_sessao` (workspace_id, sessao_id, mentorado_id, pontos_fortes,
riscos, recomendacoes, `modelo text`, `gerada_por text`, gerada_em) e
`public.alerta_risco` (workspace_id, mentorado_id, `tipo` enum `tipo_alerta`:
`queda_score`|`silencio`|`faltas`|`tarefas_atrasadas`, severidade, detalhe,
`resolvido boolean default false`, resolvido_em, criado_em). RLS: as duas são
**internas** — dono/gestor apenas. Análise da sessão contém julgamento sobre a
pessoa; o mentorado não lê. A migração precisa dizer isso por escrito, porque a
tentação de "mostrar a análise para o mentorado" vai aparecer.

**Como testar** — `npx vitest run src/lib/supabase/migracoes.test.ts`
Asserções: nenhuma política das duas tabelas cita `'mentorado'` (o teste falha
se citar); `modelo` e `gerada_por` são `not null` (análise sem procedência é
análise que ninguém sabe se foi humana ou de máquina); `workspace_id` presente;
`workspace_atual()` em toda política; sem `using (true)`.

**Depende de** — nada.

---

### 62 · Módulo puro: prompt e leitura da resposta da IA
**Arquivos**
- `src/lib/ia/analise-sessao.ts`
- `src/lib/ia/analise-sessao.test.ts`

**O combinado**
Puro. `montarPrompt(sessao, mentorado, historicoResumido)` e
`lerResposta(texto)` que converte a resposta do modelo em
`{ pontosFortes: string[], riscos: string[], recomendacoes: string[] }` ou
`null` quando não deu para ler. **`null` nunca vira lista vazia**: uma análise
que não pôde ser lida precisa aparecer como falha, não como "a IA não achou
risco nenhum". O prompt não carrega telefone, e-mail, valor de contrato nem
dado de outro mentorado.

**Como testar** — `npx vitest run src/lib/ia/analise-sessao.test.ts`
Asserções: o prompt gerado não contém `@`, `R$` nem o nome de nenhum outro
mentorado passado no histórico (o teste injeta dois mentorados e prova que só um
aparece); resposta vazia, resposta em outro formato e resposta truncada devolvem
`null` — e o teste falha se devolverem `{ riscos: [] }`; resposta com as três
seções é lida corretamente; resposta com emoji tem os emojis removidos antes de
virar dado (regra de estilo da casa vale para texto que a IA gera também);
prompt maior que o limite é cortado no fim, nunca no meio de um nome.

**Depende de** — nada.

---

### 63 · Módulo puro: alertas de risco
**Arquivos**
- `src/lib/mentoria/alertas-risco.ts`
- `src/lib/mentoria/alertas-risco.test.ts`

**O combinado**
Puro, e **sem IA**: é conta, como o desenho já classificou o módulo 13.
`alertasDe(mentorado, sessoes, tarefas, scores, agoraIso)` devolve os alertas
devidos: queda de score acima de N pontos entre semanas consecutivas, silêncio
acima de N dias, duas faltas seguidas, tarefas vencidas. Cada alerta traz o
FATO que o gerou, para a tela poder mostrar de onde veio.

**Como testar** — `npx vitest run src/lib/mentoria/alertas-risco.test.ts`
Asserções: uma única linha de `score_evolucao` não gera alerta de queda (não há
de onde cair); duas linhas com semanas NÃO consecutivas não geram alerta de
queda semanal (o buraco silencioso — o teste precisa cobrir isso
explicitamente); mentorado sem nenhuma sessão não gera alerta de faltas;
`agoraIso` inválido devolve `[]`; o mesmo fato não gera dois alertas; alerta
já resolvido na entrada não é gerado de novo; nenhum texto de alerta contém
emoji.

**Depende de** — 8.

---

### 64 · Escrita: score semanal e análise sob demanda
**Arquivos**
- `src/lib/mentoria/acoes-score.ts`
- `src/lib/mentoria/acoes-score.test.ts`
- `src/lib/ia/acoes-analise.ts`
- `src/lib/ia/acoes-analise.test.ts`

**O combinado**
`gravarScoreSemanal(formData)` calcula com `saude-mentorado.ts` e faz UPSERT em
`score_evolucao` respeitando `unique (mentorado_id, semana)`. Quando o score é
`null` (sem base), **não grava** — linha de score inventada é exatamente o que a
tabela existe para evitar. `analisarSessao(formData)` chama `gerarTexto` de
`src/lib/integracoes/ia.ts`, lê com `analise-sessao.ts` e grava com
`gerada_por` = quem clicou. Com `provider: "demo"` (sem `ANTHROPIC_API_KEY`),
**recusa gravar**, mesma disciplina de 17.

**Como testar** — `npx vitest run src/lib/mentoria/acoes-score.test.ts src/lib/ia/acoes-analise.test.ts`
Asserções: score `null` não grava (dublê falha se chamado); gravar duas vezes na
mesma semana atualiza a linha, não cria a segunda; a semana gravada é a semana
de `agoraIso`, e a ação não aceita `semana` do formulário (senão dá para forjar
histórico, o mesmo backdating de 0013); `provider: "demo"` não grava análise;
`lerResposta` devolvendo `null` não grava análise vazia; nenhuma das duas ações
é chamada de rota de cron neste plano (teste de texto: `vercel.json` não aponta
para elas).

**Depende de** — 61, 62, 8.

---

### 65 · O gatilho automático, escrito e desligado
**Arquivos**
- `src/app/api/ia/automatico/route.ts`
- `src/app/api/ia/automatico/route.test.ts`
- `vercel.json`
- `.env.example`

**O combinado**
A rota que UM DIA rodará a análise sozinha existe, completa, e responde
`{ ligado: false, motivo }` enquanto `IA_AUTOMATICA` não for exatamente `"1"`.
A entrada de cron fica em `vercel.json` **comentada**, com o motivo ao lado. O
`.env.example` ganha `IA_AUTOMATICA=0` com o comentário explicando que ligar
isso passa a gastar crédito de API por sessão. É o que a decisão 1.3 pede: o
gatilho fica pronto e desligado, esperando uma chave.

**Como testar** — `npx vitest run src/app/api/ia/automatico/route.test.ts`
Asserções: sem a variável, a rota devolve `ligado: false` e **não chama a IA nem
o banco**; com `IA_AUTOMATICA=0`, `"false"`, `"true"`, `" 1"` ou `"01"`,
continua desligada — só o literal `"1"` liga (fail-closed, mesma disciplina de
`papelDe`); a rota exige autenticação de cron e recusa chamada anônima; um teste
de texto prova que `vercel.json` não contém uma entrada de cron ATIVA apontando
para ela.

**Depende de** — 64.

---

### 66 · Tela: painel de risco e evolução
**Arquivos**
- `src/app/(app)/mentoria/risco/page.tsx`
- `src/app/(app)/mentoria/risco/visao.tsx`
- `src/app/(app)/mentoria/risco/visao.test.tsx`
- `src/app/(app)/mentoria/[id]/visao.tsx` (botões de gerar score e análise)

**O combinado**
`/mentoria/risco` lista quem está em risco, com o fato que gerou o alerta e o
botão de resolver. Na ficha, dois botões: "calcular score desta semana" e
"analisar esta sessão com IA" — cada um com o aviso de que quem dispara é uma
pessoa e de que a análise fica registrada com o nome de quem clicou.

**Como testar** — `npx vitest run src/app/(app)/mentoria/risco/visao.test.tsx`
Asserções: sem alerta nenhum, a tela diz que não há alerta — e não diz "tudo
bem", que é um veredito que os dados não sustentam; o alerta mostra o fato de
origem; a análise da IA aparece marcada como gerada por IA e com o modelo, nunca
como texto do mentor; o botão de análise fica desabilitado com aviso quando a
sessão não tem transcrição; zero emoji.

**Depende de** — 65, 63.

---

## Bloco 12 — IA de Vendas

### 67 · Migração: `analise_call`
**Arquivos**
- `supabase/migrations/0027_analise_call.sql`
- `supabase/migrations/_exec_0027_analise_call.sql`
- `src/lib/supabase/migracoes.test.ts` (extensão)

**O combinado**
`public.analise_call` (workspace_id, oportunidade_id, `transcricao text`,
`score int check between 0 and 100`, objecoes, sugestoes, modelo, gerada_por,
gerada_em). Tabela nova em vez de reaproveitar `calls_resumos` (0001), e o
cabeçalho diz por quê: `calls_resumos` é presa a `lancamento_id`, e a rota de
lançamentos foi removida na Fase 1 (`docs/DESENHO-MENTOROS.md` §8). RLS:
dono/gestor/comercial; mentorado nunca.

**Como testar** — `npx vitest run src/lib/supabase/migracoes.test.ts`
Asserções: nenhuma política cita `'mentorado'`; `score` tem `check between 0 and 100`;
`modelo` e `gerada_por` são `not null`; `workspace_id` presente e
`workspace_atual()` em toda política; sem `using (true)`.

**Depende de** — 41.

---

### 68 · Módulo puro: leitura da análise de call
**Arquivos**
- `src/lib/comercial/analise-call.ts`
- `src/lib/comercial/analise-call.test.ts`

**O combinado**
Puro, mesma forma de 62: `montarPrompt` e `lerResposta`, com `score` opcional.
Quando o modelo não devolve um score legível entre 0 e 100, o campo é `null` —
**nunca** um número escolhido pelo parser.

**Como testar** — `npx vitest run src/lib/comercial/analise-call.test.ts`
Asserções: resposta com `score: 120`, `score: -5`, `score: "ótimo"` e sem score
devolvem `null` no campo, e o teste falha se devolverem `0` ou `100`; objeções
vazias saem como `[]` mas com `parcial: true`; o prompt não contém valor de
proposta de OUTRA oportunidade; emoji na resposta é removido; resposta vazia
devolve `null` no objeto inteiro.

**Depende de** — nada.

---

### 69 · Escrita e tela: análise de call
**Arquivos**
- `src/lib/comercial/acoes-analise-call.ts`
- `src/lib/comercial/acoes-analise-call.test.ts`
- `src/app/(app)/comercial/[id]/page.tsx`
- `src/app/(app)/comercial/[id]/visao.tsx`
- `src/app/(app)/comercial/[id]/visao.test.tsx`

**O combinado**
Ação sob demanda: cola a transcrição (ou sobe o áudio e usa
`transcreverAudio`), chama a IA, grava. A ficha da oportunidade mostra o
resultado com procedência. Com `provider: "demo"`, recusa gravar.

**Como testar** — `npx vitest run src/lib/comercial/acoes-analise-call.test.ts src/app/(app)/comercial/[id]/visao.test.tsx`
Asserções: `provider: "demo"` não grava; `lerResposta` `null` não grava;
transcrição vazia é recusada antes da IA; `score: null` aparece na tela como
frase, não como 0; a análise é rotulada como gerada por IA; a transcrição
completa não é impressa por padrão (é longa e contém fala do prospect); zero
emoji.

**Depende de** — 67, 68.

---

## Bloco 13 — Marketing

Versão degradada: **captura e rastreio sim; disparo de e-mail e construtor de
landing não.** Detalhado na Parte C.

### 70 · Migração: captura, link rastreado e clique
**Arquivos**
- `supabase/migrations/0028_marketing.sql`
- `supabase/migrations/_exec_0028_marketing.sql`
- `src/lib/supabase/migracoes.test.ts` (extensão)

**O combinado**
`public.captura` (workspace_id, nome, email, telefone, `utm_source`,
`utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, pagina, aluno_id nulo,
criado_em), `public.link_rastreado` (workspace_id, `codigo text unique`,
destino, campanha, ativo, criado_em) e `public.clique` (link_id, quando,
`referer_host`, `agente_hash`). RLS: dono/gestor/comercial; mentorado nunca.
A escrita de `captura` e `clique` vem de rota PÚBLICA, então é feita por função
`security definer` (`public.registrar_captura`, `public.registrar_clique`) —
**não** por política `to anon`, que abriria a tabela inteira.

**Como testar** — `npx vitest run src/lib/supabase/migracoes.test.ts`
Asserções: nenhuma das três tabelas tem política `to anon`; as duas funções são
`security definer` com `set search_path = public`; `registrar_clique` não grava
IP nem `user_agent` cru; `codigo` tem `unique`; nenhuma política cita
`'mentorado'`; `workspace_id` presente; sem `using (true)`.

**Depende de** — nada.

---

### 71 · Módulo puro: UTM e código de link
**Arquivos**
- `src/lib/marketing/utm.ts`
- `src/lib/marketing/utm.test.ts`
- `src/lib/marketing/link.ts`
- `src/lib/marketing/link.test.ts`

**O combinado**
Puros. `lerUtm(searchParams)` normaliza os cinco campos: corta em 120
caracteres, minúsculas, remove controle e quebra de linha, e devolve `""` para o
que não veio — nunca `undefined` e nunca o valor cru. `gerarCodigo(bytes)` /
`codigoValido(texto)` para o link curto, mesmo desenho de 26 e 44.

**Como testar** — `npx vitest run src/lib/marketing/utm.test.ts src/lib/marketing/link.test.ts`
Asserções: UTM com 5000 caracteres é cortada; UTM com `\n`, `\r`, `\0` é
limpa; UTM ausente vira `""`; UTM repetida no query string usa a primeira, de
forma determinística; `codigoValido` recusa código com `/`, `%`, `..`, vazio e
`null`; o código não deriva do destino (dois destinos iguais com bytes
diferentes geram códigos diferentes).

**Depende de** — nada.

---

### 72 · Rotas públicas: captura e redirecionamento
**Arquivos**
- `src/app/api/marketing/captura/route.ts`
- `src/app/api/marketing/captura/route.test.ts`
- `src/app/l/[codigo]/route.ts`
- `src/app/l/[codigo]/route.test.ts`
- `src/lib/acesso.ts`

**O combinado**
Endpoint público de captura (chamado por um formulário embutido em qualquer
página) e a rota `/l/[codigo]` que registra o clique e redireciona. As duas
entram em `rotaLivre` de forma consciente. O redirecionamento só aceita destino
`http`/`https` de uma lista de domínios do próprio negócio — redirecionador
aberto é presente para quem faz phishing.

**Como testar** — `npx vitest run src/app/api/marketing/captura/route.test.ts src/app/l/[codigo]/route.test.ts`
Asserções: destino fora da lista de domínios não redireciona e devolve 404 (não
uma mensagem que confirme que o código existe); código inválido não chega ao
banco; captura sem e-mail e sem telefone é recusada; captura com 200 KB de corpo
é recusada por tamanho; a rota de captura tem limite de frequência por IP e o
teste prova que a segunda chamada imediata é barrada; nenhuma das duas rotas
exige login e nenhuma delas devolve dado de outra captura.

**Depende de** — 70, 71.

---

### 73 · Rota, leitura e tela: marketing
**Arquivos**
- `src/lib/marketing/dados.ts`
- `src/lib/marketing/dados.test.ts`
- `src/lib/papeis.ts`
- `src/app/(app)/marketing/page.tsx`
- `src/app/(app)/marketing/visao.tsx`
- `src/app/(app)/marketing/visao.test.tsx`

**O combinado**
`/marketing` para dono/gestor/comercial: capturas por origem, links e cliques,
e o gerador de link rastreado. A tela diz, num aviso permanente, o que ESTA
versão não faz: não dispara e-mail e não constrói landing page. Aviso na tela é
o que impede a expectativa de voltar pela porta dos fundos.

**Como testar** — `npx vitest run src/app/(app)/marketing/visao.test.tsx src/lib/papeis.test.ts`
Asserções: `rotaPermitida("mentorado","/marketing")` é `false`;
`rotaPermitida("comercial","/marketing")` é `true`; sem captura nenhuma, a tela
diz que não há e não desenha gráfico de origens vazio; UTM vazia vira "sem
origem informada", nunca "direto" (que é uma afirmação, não um dado); o aviso do
que a versão não faz existe literalmente; zero emoji.

**Depende de** — 72.

---

## Bloco 14 — Fechamento

### 74 · Auditoria de RLS das tabelas novas contra um Postgres de verdade
**Arquivos**
- `scripts/auditar-rls-fase2.ts`
- `scripts/auditar-rls-fase2.test.ts`

**O combinado**
O `src/lib/supabase/migracoes.test.ts` prova forma por TEXTO, e o cabeçalho dele
é explícito: a prova de verdade fica fora daquela suíte. Esta tarefa escreve o
script que conecta como mentorado A e tenta ler e escrever em cada uma das
tabelas novas desta fase, esperando **zero linhas** e **zero linhas afetadas** —
o mesmo teste que o C3 da Fase 1 chamou de "o mais importante do plano inteiro",
e o mesmo caminho que descobriu o ataque de coluna corrigido em 0013.

**Como testar** — `npx vitest run scripts/auditar-rls-fase2.test.ts` (forma do
script) e execução manual contra o projeto real.
Asserções que o script precisa fazer, tabela por tabela: select do mentorado A
sobre linha do mentorado B devolve 0; PATCH direto no PostgREST em
`progresso_trilha`, `onboarding_progresso` e `post_destinatario` devolve 0 linhas
afetadas; PATCH tentando trocar `mentorado_id` da própria linha é barrado;
`cobranca`, `oportunidade`, `analise_sessao`, `analise_call`, `patrimonio`,
`investimento`, `renda_pessoal` devolvem 0 para mentorado E para comercial (as
três últimas também para gestor); `proposta` devolve 0 para anônimo e a função
`proposta_publica` devolve só a proposta enviada e válida.

**Depende de** — todas as migrações (1, 4, 13, 22, 23, 32, 37, 41, 42, 50, 51,
58, 61, 67, 70).

---

### 75 · Inventário DEPOIS
**Arquivos**
- `docs/PLANO-FASE-2.md` (Parte A ganha a coluna "depois")

**O combinado**
A mesma tabela da Parte A, com a coluna de estado atualizada e uma linha por
bullet que continuou `falta`, dizendo por quê. É o critério de aceite desta fase,
e ele é preenchido por alguém que NÃO executou as tarefas.

**Como testar** — Comparação linha a linha da Parte A com a coluna nova, mais
`npx vitest run` inteiro verde e `npx tsc --noEmit` limpo. Asserção humana: todo
bullet que virou `tem` precisa ter uma TELA que o entrega — tabela no banco não
conta, e foi exatamente esse o critério que produziu o inventário do ANTES.

**Depende de** — todas.

---

# Parte C — O que este plano deliberadamente NÃO faz

## Por decisão de custo (§1.3, reconfirmada pelo dono)

**1. Cobrança automática no cartão / boleto / assinatura recorrente.**
Não há Stripe, Asaas, Pagar.me nem gateway nenhum. O que existe é o controle da
recorrência (quais parcelas, quando vencem, quais estão em atraso) com **baixa
manual por Pix**.
*Como explicar ao Jefson:* "O sistema sabe quem te deve, quanto, desde quando, e
te avisa na hora certa com a mensagem pronta. O que ele não faz é tirar o
dinheiro da conta do cliente sozinho — isso exige um gateway de pagamento, que
cobra por transação e por mensalidade. No dia em que fizer sentido contratar um,
o módulo já está pronto para receber a confirmação automática: o webhook de
pagamento que já existe no sistema é justamente essa porta."

**2. Assinatura digital de contrato.**
Não há ZapSign, DocuSign nem Clicksign. O contrato é **upload do arquivo já
assinado**, com data e vigência registradas.
*Como explicar:* "O contrato assinado fica guardado, ligado ao cliente e ao
programa, com data e vigência. O que o sistema não faz é coletar a assinatura
dentro dele — para isso é preciso um serviço de assinatura eletrônica com
validade jurídica, que é pago. Hoje você assina como já assina e sobe o arquivo;
o sistema cuida do resto."

**3. Streaming de vídeo protegido.**
Não há Mux, não há HLS, não há DRM. As aulas são **YouTube não listado
embutido**.
*Como explicar:* "O aluno assiste dentro do portal, sem sair, e não vê o vídeo
na busca do YouTube. O que não dá para prometer é que ninguém copie o link e
mande para outra pessoa — proteger vídeo contra cópia exige uma plataforma de
streaming paga. Na prática, para uma mentoria com dezenas de alunos, o risco é
baixo e o custo evitado é alto; o dia em que a turma crescer, troca-se o
player e nada mais."

**4. IA automática, disparada pelo relógio.**
A apresentação promete "análise automática após cada sessão". Análise automática
roda no servidor, sem ninguém abrir nada, e isso consome crédito de API a cada
sessão. Nesta fase **quem dispara é uma pessoa, clicando** — e o gatilho
automático fica escrito e desligado (tarefa 65).
*Como explicar:* "A análise é a mesma, com o mesmo modelo e o mesmo resultado. A
diferença é que ela acontece quando você clica, não quando o relógio bate. O
botão automático já está construído e desligado: no dia em que você quiser
ligá-lo, é uma variável de ambiente — e aí passa a existir uma conta de API por
mês, proporcional ao número de sessões."

**5. E-mail marketing.**
Não há disparo de e-mail em massa. Não há Resend, SendGrid, Mailchimp nem
Brevo. E isso **não é só custo**: disparar e-mail em massa de um domínio novo,
sem aquecimento e sem registros de autenticação configurados, é o caminho mais
rápido para o domínio do negócio ser marcado como spam — o que estraga também o
e-mail pessoal do Jefson.
*Como explicar:* "O sistema captura o lead, guarda de qual anúncio ele veio e
mostra isso no funil. O que ele não faz é disparar a sequência de e-mails. Além
do custo da ferramenta, existe um risco concreto: um domínio novo disparando
centenas de e-mails cai em spam e leva junto o seu e-mail de trabalho. Quando
existir volume que justifique, contrata-se uma ferramenta de envio, configura-se
o domínio direito, e o sistema entrega a lista pronta e segmentada."

**6. Construtor de landing page.**
Não há editor visual de página. O que existe é o **formulário de captura
embutível** (uma rota pública que qualquer página pode chamar) e o **link
rastreável com UTM**.
*Como explicar:* "As páginas continuam onde já estão. O que o sistema dá é o
formulário para colar nelas e o link rastreado — a partir daí, todo lead que
chega já vem com a origem carimbada. Construir a página dentro do sistema seria
reconstruir um produto que já existe pronto e barato lá fora, e que você já usa."

**7. Notificação por push e por e-mail no feed.**
O aviso aparece quando a pessoa abre o portal. Push exige serviço de
notificação; e-mail cai no item 5.
*Como explicar:* "O aviso fica marcado como não lido e aparece assim que o
cliente abre o portal. Aviso que chega no celular sozinho é um serviço à parte;
enquanto isso, o caminho que já funciona é o WhatsApp, com a mensagem entrando
na fila para você aprovar antes de sair."

## Por decisão de escopo

**8. Painel de gestão de equipe comercial.** O papel `comercial` existe no banco
e nas políticas desde o primeiro dia (decisão 3 do desenho), mas a tela de
gerenciar quem é quem só vem quando houver equipe. Criar o papel depois é que
seria caro; criar a tela agora seria adiantado.

**9. Fundir `alunos` e `mentorado`.** A decisão de modelagem está escrita no
cabeçalho de `mentorado` em 0006 e continua valendo: `alunos` é o funil de
vendas, `mentorado` é o pós-venda. A tarefa 12 liga as duas fichas com um link,
não com um `JOIN` destrutivo.

**10. Aposentar `modulos`/`aulas`/`progresso_aulas` (0009).** As tabelas ficam,
porque este projeto não apaga. As trilhas nascem em tabelas novas pela razão que
o próprio cabeçalho de 0009 já registrou: não existe ponte confiável de
`aluno_id` para `mentorado_id`.

**11. Paginação, cache e índice além do mínimo.** Decisão 2 do desenho: 4 a 5
mentorados hoje, dezenas no máximo. Otimizar antes de existir volume é gastar
hoje para resolver um problema que talvez nunca chegue.

---

# Parte D — Riscos

Os incidentes citados abaixo são reais e estão documentados nos cabeçalhos dos
próprios arquivos deste repositório (o repositório não tem `.git` nesta cópia,
então a fonte é o código). Eles não estão aqui como história — estão aqui porque
cada um deles descreve um jeito de errar que esta fase pode repetir.

## D1 · Onde a RLS pode vazar

**O incidente:** `0013_portal_tarefa_por_funcao.sql` documenta, passo a passo, um
ataque que um revisor EXECUTOU contra um Postgres de verdade. A política de
UPDATE de 0012 protegia a LINHA (`mentorado_id = mentorado_atual()`) e nada
mais — e com a anon key, que é pública e vai no bundle, mais o próprio JWT, ele
reescreveu `titulo` e `prazo` da própria tarefa, forjou `concluida_em`
(backdating) e moveu a tarefa para a sessão de outro mentorado. Tudo por PATCH
direto no PostgREST, sem passar pela Server Action uma única vez.

**Onde isso pode acontecer de novo nesta fase:** em toda tabela que um mentorado
possa escrever. São três: `progresso_trilha` (tarefa 23),
`onboarding_progresso` (37) e `post_destinatario.lido_em` (35). O plano já
prescreve função `security definer` nas três — mas a tentação de "é só uma
política de update simples" vai aparecer, porque é mais rápido. A tarefa 74
existe para provar que não aconteceu.

**Risco correlato, e mais sutil:** RLS não decide por COLUNA. Uma sessão visível
ao mentorado expõe TODAS as colunas dela via PostgREST — inclusive
`transcricao`, `link_gravacao` e, se alguém acrescentar amanhã, qualquer nota
interna. É por isso que as tarefas 13 e 51 usam view com
`security_invoker = true` em vez de "a tela não mostra". Se alguém, no meio da
execução, decidir que a view é burocracia e ler `sessao` direto no portal, o
vazamento não dá erro — dá dado a mais na resposta JSON que ninguém abre para
conferir.

**Risco de omissão:** `src/lib/supabase/migracoes.test.ts` já teve um buraco
sério — a asserção "tabela do portal cita mentorado" procurava a palavra no
bloco inteiro da política, inclusive no NOME dela, e como toda política se chama
"leitura: dono, gestor e o proprio mentorado", ela passava pelo nome e nunca
olhava o `using`. Uma 0007 mutante que liberava o portal inteiro passou com 28
testes verdes. Toda extensão desse teste nesta fase precisa remover o nome da
política ANTES de procurar qualquer palavra-chave, e precisa usar regex GLOBAL —
políticas permissivas se somam com OR, e uma segunda política mais aberta lá
embaixo vaza mesmo com a primeira correta.

## D2 · Onde um número pode ser inventado sem ninguém notar

**O incidente:** está escrito em `src/lib/data/index.ts`. Em produção, sem
nenhuma variável de ambiente definida, o dono do produto abriu o painel e leu
faturamento, meta de afiliado e parcelas vencidas que jamais existiram — e
acreditou. O modo demonstração era o padrão. Hoje ele exige `RARO_MODO=demo`
explícito, e a ausência de configuração cai em `vazio`.

**Onde isso pode acontecer de novo nesta fase, em ordem de probabilidade:**

1. **MRR e ARR (tarefa 54).** Anualizar um mês de série é multiplicar por 12 um
   número que não tem base. O plano exige `null` com motivo abaixo de 3 meses; é
   a regra mais fácil de "simplificar" numa revisão apressada.
2. **Score de saúde do mentorado (8).** `src/lib/health.ts` já resolveu esse
   problema uma vez para o negócio, com a regra "fator sem base não pontua e o
   score é renormalizado". Reimplementar o score do mentorado sem essa regra
   produz um mentorado novo com score 40 no primeiro dia — e um alerta de risco
   em cima de nada.
3. **Taxa de conversão do funil (43).** Denominador 0 tem que dar `null`, não 0%.
   E há uma armadilha pior: contar uma oportunidade `ganha` como tendo passado
   por todas as etapas anteriores, sem registro de passagem. É uma suposição
   razoável e é exatamente por isso que passa despercebida.
4. **Progresso de trilha (25).** Trilha sem aula com `pct: 0` lê como "o aluno
   não começou". `null` lê como "não há o que medir". A diferença importa quando
   o Jefson liga para o aluno.
5. **A análise da IA (62, 68).** Uma resposta que o parser não conseguiu ler
   virando `{ riscos: [] }` é o pior caso desta fase inteira: a tela mostraria
   "nenhum risco identificado" quando a verdade é "a análise falhou". O plano
   exige `null`, e o teste exige que `null` não vire lista vazia.

**Risco estrutural:** duas contas para o mesmo número. O score de saúde do
mentorado é consumido pelo CRM, pelo portal, pelo alerta de risco e pelo
snapshot semanal. Se em algum ponto alguém escrever uma segunda versão da conta
"só para essa tela", os dois números vão divergir, e nenhum dos dois vai estar
obviamente errado. A tarefa 10 tem uma asserção específica para isso.

## D3 · Onde uma tela pode entregar o mapa a quem não deveria vê-lo

**O incidente:** o B2.7, documentado em `src/lib/apps.ts`. `rotaPermitida` já
sabia dizer "mentorado não abre /financeiro", e nada consultava essa resposta
antes de DESENHAR o tile de Financeiro na tela inicial. O resultado medido era
uma grade cheia de botões que levam a `/sem-acesso` — vazamento de EXISTÊNCIA
(a pessoa descobre que o módulo existe, só não pode abrir) bem em cima da tela
escrita para não vazar isso. O mesmo raciocínio produziu `gruposNavPorPapel` em
`src/lib/nav-lateral.ts`: filtrar no componente cliente seria decoração, porque
a lista inteira de rotas já teria viajado no bundle.

**Onde isso pode acontecer de novo nesta fase:** esta fase acrescenta oito
rotas de primeiro nível (`/trilhas`, `/feed`, `/onboarding`, `/comercial`,
`/pessoal`, `/marketing`, `/mentoria/risco`, mais os sub-apps de financeiro).
Cada uma precisa passar por `papeis.ts` conscientemente, e o padrão NEGA — mas
o padrão só nega para `comercial` e `mentorado`: **dono e gestor recebem
`"todas"`**. É por isso que `/pessoal` (tarefa 60) é o caso mais delicado do
plano inteiro: é a primeira rota que precisa negar algo a um papel que hoje
recebe tudo, e resolver isso "só com RLS" produziria um gestor abrindo uma tela
em branco sem entender por quê — exatamente o sintoma que o ALTO 2 de
`papeis.ts` descreve, quando afiliado e aluno eram mandados para um `/portal`
estruturalmente vazio.

**Três rotas públicas, três superfícies novas:** `/proposta/[token]` (48),
`/certificado/[codigo]` (31) e `/l/[codigo]` + captura (72). São as primeiras
rotas do sistema que respondem sem login desde `/privacidade`. Os riscos
concretos: (a) resposta diferente para "token inválido" e "proposta vencida" é
um oráculo que permite enumerar tokens — por isso a tarefa 48 exige marcação
byte a byte idêntica; (b) `/l/[codigo]` sem lista de domínios permitidos é um
redirecionador aberto, que vira ferramenta de phishing com o domínio do Jefson
no link; (c) a página de certificado precisa provar que o certificado existe sem
revelar quem mais tem certificado.

**Uma superfície que já existe e ganha peso:** as duas IAs mandam texto para
fora. O prompt de análise de sessão (62) e o de call (68) carregam conteúdo real
de cliente. As asserções do plano proíbem telefone, e-mail, valor e nome de
outro mentorado no prompt — e essa é uma regra que ninguém percebe ter quebrado,
porque o prompt não aparece em tela nenhuma.

## D4 · Riscos de execução

**O comentário que virou mentira.** `src/lib/integracoes/google-agenda.ts` diz
hoje, com todas as letras: "o app não consegue criar, mover nem apagar evento
nenhum, mesmo que alguém queira". A tarefa 15 muda o escopo do OAuth e torna
essa frase falsa. Ela está listada nos arquivos da tarefa de propósito. Se ficar
para depois, fica para sempre — e o próximo a ler vai confiar nela.

**O reconsentimento silencioso do Google.** Mudar `ESCOPO_AGENDA` não revoga o
token que já está no cookie: ele continua valendo com o escopo ANTIGO. Quem já
conectou vai receber 403 ao criar evento e não vai entender. A tarefa 15 precisa
detectar escopo insuficiente e pedir para reconectar, com essa frase.

**Ligar o Supabase antes de migrar os dados.** O C7 da Fase 1 registra que as
duas variáveis `NEXT_PUBLIC_SUPABASE_*` estão comentadas no `.env.local`, com o
motivo ao lado: a seleção de fonte em `src/lib/data/index.ts` dá precedência ao
Supabase sobre a planilha, então ligar as variáveis sem os dados migrados faz o
Jefson abrir o sistema e ver faturamento zero. Esta fase acrescenta 15 migrações;
a tentação de "rodar tudo e ligar" existe. A ordem continua sendo: aplicar,
migrar dados, conferir contagem linha a linha, e só então ligar.

**Migração colada de uma vez no SQL Editor.** O C8 da Fase 1 já pagou esse
preço: `alter type ... add value` não pode rodar na mesma transação em que o
valor é usado, e o editor do Supabase roda tudo numa transação só. Esta fase cria
onze enums novos. Cada migração precisa ser colada sozinha, na ordem, e o teste
de forma já assere que nenhuma delas contém `alter type ... add value`.

**O teste que não roda.** `vitest.config.ts` documenta o ALTO 3: `.tsx` não
entrava no `include`, então NENHUM arquivo de tela tinha teste, e cinco mutantes
de vazamento no portal (URL sem validar, papel impresso, telefone impresso,
transcrição impressa, estado "não é mentorado" trocado pelo portal cheio)
sobreviveriam indefinidamente — porque não havia suíte capaz de os matar. Esta
fase cria mais de vinte arquivos de tela. Toda tarefa de tela aqui tem um
`.test.tsx` no seu `Arquivos` justamente por isso, e a asserção que vale é a
que mataria o mutante, não a que confirma que o componente renderiza.

**O plano que manda apagar o que não devia.** Uma versão anterior do Bloco B da
Fase 1 mandava apagar `src/app/api/webhooks/pagamento/` junto com a tela de
coleta; a revisão pegou a armadilha, e a nota ficou escrita no plano. Nesta
fase, o equivalente é `calls_resumos` (tarefa 67): ela está sem uso, presa a uma
rota removida, e a saída óbvia seria apagá-la. Este projeto não apaga. A tabela
fica; a análise nova nasce ao lado.

**Escopo.** São 75 tarefas e 15 migrações. Executá-las fora de ordem é o risco
mais banal e o mais provável — em particular, começar por um módulo visível
(Feed, Marketing) antes das quatro peças transversais do Bloco 1, e ter que
reescrever CRM, portal e IA depois. A ordem da Parte B não é preferência: é a
única em que cada peça é construída uma vez só.
