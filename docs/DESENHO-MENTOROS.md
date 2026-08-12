# MentorOS — desenho da solução

Documento de decisão. Escrito antes de qualquer linha de código, para que a
discordância apareça aqui, onde custa uma conversa, e não depois, onde custa
uma reescrita.

Fonte da expectativa do cliente: https://mentoros-apresentacao.vercel.app/#modulos
Base existente: Raro.ia (Next.js 14, hoje sobre planilha do Google).

---

## 1. As sete decisões já travadas

Cada uma veio de uma pergunta respondida pelo Tossi. Estão aqui porque decisão
sem motivo escrito é decisão que alguém desfaz sem querer daqui a dois meses.

**1.1 — Cenário C: Jefson primeiro, produto depois.**
O sistema nasce para um mentor só, mas com a intenção declarada de virar
produto para muitos. Consequência prática única e importante: **toda tabela
nasce com `workspace_id`**, mesmo havendo um workspace só. É a coisa mais
barata de fazer agora e a mais cara de retrofitar depois — separar dados de
inquilinos num banco que já tem dados de produção é cirurgia de risco.
Nada mais de multi-tenant é construído agora: sem cadastro público, sem
planos, sem cobrança de assinatura.

**1.2 — Supabase é a base; a planilha vira espelho de leitura.**
A planilha não podia continuar sendo a base por um motivo que não tem
contorno: o Portal do Mentorado exige que cada cliente veja **só o que é
dele**, e a planilha é lida por um endereço público — qualquer mentorado com
o link leria o financeiro inteiro. Row Level Security no Postgres é o que
resolve isso, e ela não existe em planilha.
A planilha continua existindo, mas muda de papel: o sistema **escreve** nela,
o Jefson **lê** e exporta. Ele não digita mais lá. Duas fontes escrevendo no
mesmo dado divergem, e no dia da divergência ninguém sabe qual está certa.

**1.3 — Zero de custo externo por enquanto.**
Isso não é uma limitação de fachada: muda o que cada módulo é.
- IA de análise: **sob demanda**, pelo Claude Desktop do Jefson via conector
  MCP. A apresentação promete "análise automática após cada sessão"; análise
  automática roda no servidor, de madrugada, sem ninguém abrir o Claude — e
  isso exige API paga. Fica registrado: **a IA nasce manual**. O gatilho
  automático fica pronto e desligado, esperando uma chave.
- Transcrição: Groq Whisper, plano gratuito. Chave já em mãos.
- Vídeo-aula: YouTube não listado, embutido no portal. O aluno não nota
  diferença; o Mux entra o dia que houver orçamento.
- Cobrança recorrente: **não existe**. O Jefson recebe por Pix. O módulo vira
  controle de recorrência com baixa manual.
- Assinatura digital: upload de contrato assinado, mais o plano gratuito do
  ZapSign se couber no volume dele.
- WhatsApp: o agente local que já roda, custo zero.

**1.4 — Três papéis. Sem secretária, de propósito.**
`dono`, `comercial` (SDR/Closer), `mentorado`. Não existe papel de
secretária/operacional porque **é o trabalho dela que o sistema existe para
fazer sozinho** — agendar, cobrar, fazer onboarding, lembrar.

**1.5 — Programa fechado hoje, turma amanhã.**
Hoje: pacote com número fixo de sessões ("Elite, sessão 8 de 12"), começo e
fim, e o mentorado vira alumni ao terminar. Amanhã: individual, turma e
online rodando ao mesmo tempo. O modelo já nasce sabendo das duas formas.

**1.6 — As rotas de infoproduto saem.**
`lancamentos`, `coleta`, `capital`, `comissoes`, `chargebacks` somem da
navegação. Elas serviam a um negócio de infoproduto com afiliados, não a
mentoria. O que elas faziam está registrado no documento de reaproveitamento
(seção 8) para servir a sistemas futuros.

**1.7 — Ordem de construção aprovada.** Ver seção 7.

---

## 2. Arquitetura

```
  navegador do Jefson ─┐
  navegador do closer ─┼─→  Next.js (Vercel)  ─→  Supabase (Postgres + RLS)
  navegador do aluno  ─┘           │                      │
                                   │                      └─→ espelho diário
                                   │                          na planilha
                    agente WhatsApp (Mac/PC do dono, saída apenas)
                                   │
                    Claude Desktop do Jefson ──→ conector MCP (IA sob demanda)
```

**Por que o Postgres e não outra coisa:** a regra "cada um vê só o que é seu"
precisa morar no banco, não na tela. Regra de acesso escrita em componente é
regra que a próxima tela esquece de aplicar — e o esquecimento não dá erro,
dá vazamento silencioso. Com RLS, a consulta do mentorado fisicamente não
consegue trazer a linha de outro.

**O espelho na planilha** roda uma vez por dia e é só escrita. Se ele falhar,
nada no sistema para: espelho quebrado é espelho desatualizado, não é sistema
fora do ar.

**Keepalive:** o plano gratuito do Supabase **pausa o projeto após 7 dias sem
consulta**, e um mentor pode passar uma semana sem abrir o sistema. Um cron
diário da Vercel chama `/api/manutencao/keepalive`, que faz um `select 1`
numa tabela minúscula. Sem isso, o sistema "morre" sozinho num fim de semana
e ninguém entende por quê.

---

## 3. Modelo de dados (as entidades que importam)

Toda tabela carrega `workspace_id`. Marcadas com ▲ as que já existem hoje em
alguma forma e serão migradas.

**Identidade e acesso**
- `workspace` — o inquilino. Um só por enquanto.
- `perfil` — quem tem login. `papel`: dono | comercial | mentorado.

**Mentoria (o núcleo)**
- `mentorado` ▲ — a ficha. Pode existir sem login (lead que ainda não entrou).
- `programa` — "Elite", "Aceleração". `formato`: individual | turma | online.
  `total_sessoes` quando fechado.
- `turma` — só para o formato turma: data de início, participantes.
- `matricula` — mentorado × programa. É aqui que vive "sessão 8 de 12",
  status (ativo, pausado, alumni) e as datas.
- `sessao` — presa a uma matrícula (individual) ou a uma turma (grupo).
  Guarda quando, se aconteceu, link da gravação, transcrição e resumo.
- `tarefa` — o que foi combinado na sessão. Mentorado dá baixa, mentor é
  avisado.
- `marco` — conquistas do portal ("30 dias concluídos", "primeira venda").
- `score_evolucao` — histórico semanal, uma linha por semana por mentorado.
  Histórico e não campo único: sem série, não existe "caiu 18 pontos".

**Conversa**
- `interacao` ▲ — mensagens de WhatsApp. Já existe e funciona.
- `envio` ▲ — fila de saída aprovada por humano. Já existe.
- `post` / `comentario` — o feed privado entre mentor e mentorados.

**Conteúdo** ▲
- `modulo`, `aula`, `progresso` — já existem. Ganham liberação gradual e
  certificado.

**Comercial**
- `lead`, `etapa_funil`, `proposta`, `script` — o pipeline SDR/Closer.
- `analise_call` — score da call, objeções, sugestões. Nasce sob demanda.

**Financeiro** ▲
- `conta`, `movimento`, `recebivel`, `despesa` — já existem.
- `cobranca` — a recorrência do mentorado, com baixa manual por Pix.
- `contrato` — arquivo assinado e a data.

**Finanças pessoais do mentor** (separado do negócio, de propósito)
- `patrimonio`, `investimento`, `renda_pessoal`.

---

## 4. Os 13 módulos: o que é real e o que é degradado a custo zero

| # | Módulo | A custo zero |
|---|---|---|
| 1 | CRM & Clientes | **Real e completo** |
| 2 | Sessões | **Real.** Transcrição pela Groq. Gravação = link colado |
| 3 | Portal do Mentorado | **Real e completo** |
| 4 | Conteúdo | **Real.** Vídeo por YouTube não listado |
| 5 | Feed & Comunicação | **Real.** WhatsApp já integrado |
| 6 | Onboarding | **Real.** Contrato por upload |
| 7 | Pipeline SDR/Closer | **Real e completo** |
| 8 | Financeiro do negócio | **Real**, menos cobrança automática (Pix manual) |
| 9 | Finanças pessoais | **Real e completo** |
| 10 | IA de Evolução | **Sob demanda**, não automática |
| 11 | IA de Vendas | **Sob demanda**, não automática |
| 12 | Marketing | **Parcial**: formulário e UTM sim; construtor de landing não |
| 13 | Score de saúde / churn | **Real** — é conta, não IA |

Onde está escrito "sob demanda", a tela existe, o botão existe e o resultado é
de verdade: quem dispara é uma pessoa, não o relógio. O gatilho automático
fica escrito e desligado.

---

## 5. Identidade visual

Extraída do site do cliente. O Raro.ia de hoje é roxo sobre quase-preto; o
MentorOS é azul-marinho com azul royal e dourado. A troca é de tinta, não de
estrutura — os componentes ficam.

```
fundo          #0a0f1e      fundo 2       #0d1b3e
azul           #2563eb      azul claro    #3b82f6
dourado        #f59e0b      dourado claro #fcd34d
verde          #10b981      vermelho      #ef4444     roxo  #8b5cf6
texto          #ffffff      cinzas        #f1f5f9 · #e2e8f0 · #94a3b8 · #475569
raio           16 / 20 / 24 px
tipografia     Inter
```

O dourado é acento, não fundo: em painel financeiro, dourado em área grande
lê como alerta.

---

## 6. Decisões que ainda dependem de você

1. **O app passa a se chamar MentorOS ou continua Raro.ia com a cara nova?**
   O cliente viu "MentorOS" na apresentação.
2. **Quantos mentorados o Jefson tem hoje?** Muda se eu modelo para dezenas ou
   centenas.
3. **A equipe comercial existe hoje**, ou o papel nasce vazio esperando?

---

## 7. Ordem de construção (aprovada)

1. **Fundação** — Supabase, login, os três papéis, RLS, espelho na planilha,
   keepalive e a nova identidade visual.
2. **CRM + Sessões** — o núcleo da mentoria.
3. **Portal do Mentorado** — o que o Jefson mostra primeiro para um cliente.
4. **Tarefas, Feed e Onboarding** — o vínculo entre uma sessão e outra.
5. **Conteúdo** — trilhas, liberação gradual, certificado.
6. **Pipeline comercial** — funil, scripts, propostas, conversão.
7. **Financeiro do negócio + finanças pessoais.**
8. **As duas IAs e o Marketing** — por último porque se alimentam do que os
   anteriores geram. IA de evolução sem histórico não tem o que analisar.

---

## 8. Rotas removidas — registro para reaproveitamento

Guardado a pedido: a intenção é virar uma skill que gera sistemas parecidos.
O código sai da navegação mas fica no histórico do repositório.

| Rota | O que fazia | Para que serviria de novo |
|---|---|---|
| `lancamentos` | Campanha de lançamento de infoproduto: meta, período, faturamento por lançamento | Qualquer negócio que venda por campanha com data — turma, evento, safra |
| `coleta` | Recebia webhook de gateway e lançava venda sozinho | Qualquer entrada automática de venda vinda de fora |
| `capital` | Caixa, runway, burn rate, ponto de equilíbrio | Serve a **qualquer** negócio. Candidato forte a virar módulo padrão |
| `comissoes` | Comissão de afiliado por venda | Vira comissão de closer no Módulo 7 |
| `chargebacks` | Estorno de cartão e disputa | Só faz sentido com gateway de cartão |

Também vale reaproveitar, e não está sendo apagado: o leitor de extrato
bancário (CSV/OFX, com o tratamento do sinal de menos tipográfico do Nubank),
o portão de acesso que falha fechado, e o agente de WhatsApp.
