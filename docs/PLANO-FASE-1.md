# Plano — Fase 1: Fundação

Tarefas de 2 a 5 minutos, com o caminho exato do arquivo e como testar cada
uma. Um subagente novo por tarefa. Teste escrito antes do código, visto
falhar, e só então o código que faz passar.

Branch: `mentoros` (criado a partir de `master`, base limpa).

Estado do que já existe e que este plano aproveita:
- `supabase/migrations/0001..0004` já existem, com esquema do sistema atual.
- `src/lib/data/supabase-db.ts` já é um provider completo (48 KB).
- `@supabase/ssr` e `@supabase/supabase-js` já estão no `package.json`.
- As cores são variáveis CSS em `src/app/globals.css`, em tripla RGB. Trocar a
  paleta é editar um bloco, não caçar cor pelo projeto.

---

## Bloco A — Identidade MentorOS  [CONCLUIDO]
Nada aqui depende do Supabase. Pode começar agora.

**A1 · Paleta do tema escuro**
Arquivo: `src/app/globals.css` (bloco `:root`, linhas ~50-100).
Trocar `--fundo` para `10 15 30` (#0a0f1e), `--poco` para `13 27 62` (#0d1b3e),
`--primaria` para `37 99 235` (#2563eb), `--primaria-2` para `59 130 246`,
`--primaria-press` para `29 78 216`. Acrescentar `--dourado: 245 158 11` e
`--dourado-2: 252 211 77`.
Teste: `npx next build` passa e `/painel` abre sem cor órfã. Screenshot antes
e depois, lado a lado.

**A2 · Paleta do tema claro**
Arquivo: mesmo, bloco `[data-tema="claro"]` (~linha 117).
Teste: alternar o tema e conferir contraste do texto sobre fundo.

**A3 · Dourado como acento, nunca como área**
Arquivos: `src/components/charts.tsx` e onde houver gradiente de destaque.
Regra: dourado em texto, borda, ícone e barra fina. Nunca em bloco grande —
dourado em área ampla num painel financeiro lê como alerta.
Teste: `grep` por `--dourado` e conferir que nenhum uso é `background` de card.

**A4 · Tipografia**
Arquivo: `src/app/layout.tsx` (link das fontes) e `globals.css`.
O site do cliente usa só Inter. Sora sai.
Teste: build + conferir no DevTools que nenhum elemento carrega Sora.

**A5 · Nome do produto**
Arquivos: os 12 que contêm "raro.ia"/"Raro.ia" — `layout.tsx`, `error.tsx`,
`global-error.tsx`, `acesso/page.tsx`, `privacidade/page.tsx`,
`menu-mobile.tsx`, `charts.tsx`, `integracoes/page.tsx`, `api/mcp/route.ts`,
e os três que serão apagados no bloco B.
Teste: `grep -ri "raro\.ia" src/` volta vazio. Build passa.

**A6 · Metadados e cor da barra do navegador**
Arquivo: `src/app/layout.tsx` — `title`, `description`, `themeColor`.
`themeColor` escuro passa a `#0a0f1e`.
Teste: build + `view-source` da home mostra o title novo.

---

## Bloco B — Saída das rotas de infoproduto  [CONCLUIDO]
Cada rota é uma tarefa. O que elas faziam já está registrado em
`docs/DESENHO-MENTOROS.md`, seção 8.

**B1 · `lancamentos`** — apagar `src/app/(app)/lancamentos/`, tirar do menu
(`src/components/menu-*.tsx`), remover as funções órfãs de `src/lib/metrics*.ts`.
Teste: build passa, `/lancamentos` responde 404, `npx vitest run` sem queda no
número de testes que não sejam desta rota.

**B2 · `coleta`** — idem. ATENCAO: **NAO** apagar `src/app/api/webhooks/pagamento/`.
A tela de coleta sai, o webhook fica: ele e o caminho por onde a confirmacao
de pagamento chega, e a apresentacao do cliente conta com isso. (Uma versao
anterior deste plano mandava apagar; a revisao do Bloco B pegou a armadilha.)
**B3 · `capital`** — idem.
**B4 · `comissoes`** — idem.
**B5 · `chargebacks`** — idem, incluindo a aba na planilha (só a leitura sai;
a aba fica).

Ao fim do bloco: `npx tsc --noEmit` limpo e a contagem de testes registrada
como novo piso.

---

## Bloco C — Fundação de dados
**Depende de uma coisa que só você pode fazer: criar o projeto no Supabase.**
Eu não crio conta em serviço nenhum. São cinco passos, uma vez só:
supabase.com → New project → região São Paulo → guardar a senha do banco →
Settings › API → copiar `Project URL`, `anon key` e `service_role key`.
Depois é só rodar `conectar-integracoes.bat`, que eu adapto para gravar as
três nos dois lugares.

**C1 · Migração `0005_mentoros_identidade.sql`**
Arquivo novo em `supabase/migrations/`.
Cria `workspace`, `perfil` (com `papel`: dono | comercial | mentorado) e
acrescenta `workspace_id` às tabelas existentes.
Teste: `supabase db reset` local aplica sem erro; `seed.sql` continua rodando.

**C2 · Migração `0006_mentoros_mentoria.sql`**
`programa` (formato: individual | turma | online), `turma`, `matricula`
(com `sessao_atual` e `total_sessoes`), `sessao`, `tarefa`, `marco`,
`score_evolucao`.
Teste: inserir um mentorado com matrícula de 12 sessões e conferir que
"sessão 8 de 12" sai de uma consulta, não de campo digitado.

**C3 · Row Level Security por papel**
Arquivo: `supabase/migrations/0007_mentoros_rls.sql`.
Três políticas por tabela. A do mentorado é a que importa: ele só enxerga
linhas cujo `mentorado_id` seja o dele.
Teste: o mais importante do plano inteiro. Um teste que se conecta como
mentorado A e tenta ler dado do mentorado B — e **espera zero linhas**.
Este teste falha antes de existir a política, e é assim que se prova que a
política funciona.

**C4 · Login de verdade**
Arquivos: `src/app/login/`, `src/middleware.ts`, `src/lib/acesso.ts`.
A senha única compartilhada sai; entra e-mail e senha por pessoa. O portão
que falha fechado continua valendo.
Teste: os 15 testes de `acesso.test.ts` continuam passando, mais um novo:
mentorado logado que tenta abrir `/financeiro` é barrado.

**C5 · Keepalive**
Arquivos: `src/app/api/manutencao/keepalive/route.ts` e `vercel.json`.
Cron diário chamando uma rota que faz um `select` mínimo. O plano gratuito do
Supabase pausa o projeto após 7 dias sem consulta, e o Jefson pode passar uma
semana sem abrir o sistema — sem isto ele "morre" sozinho num fim de semana e
ninguém entende por quê.
Teste: chamar a rota devolve `{ ok: true, quando }`; e um teste que prova que
ela **não** exige login (senão o cron seria barrado pelo próprio portão).

**C6 · Espelho na planilha**
Arquivo: `src/app/api/manutencao/espelho/route.ts`, cron diário.
Só escrita, do Supabase para a planilha.
Teste: espelho que falha não derruba nada — o teste força erro na planilha e
espera que a rota devolva 200 com `{ espelho: "falhou" }`, não 500.

---

## Ordem de execução

A1 → A2 → A3 → A4 → A5 → A6 → B1..B5 → (você cria o Supabase) → C1 → C2 → C3
→ C4 → C5 → C6.

Entre uma tarefa e outra: revisão em duas etapas — primeiro se cumpriu o
combinado, depois qualidade — com revisor diferente de quem escreveu.
Problema crítico trava tudo até ser resolvido.

---

## Aviso sobre o git nesta pasta

O repositório foi criado agora (`master` = estado antes do MentorOS,
`mentoros` = trabalho novo). A ponte com a sua máquina **não consegue apagar
arquivos**, e o git deixa arquivos de trava (`.git/index.lock`) para trás
depois de cada operação. Eu movo essas travas para `_to_delete/git-locks/`
antes de cada comando. Se algum dia o git reclamar de "another git process",
é isso — e a saída é apagar essa pasta pelo Windows.
