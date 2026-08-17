# RARO IA — Instruções para o Claude

## 🔴 REGRA ZERO

**Chame o usuário de "Tossi" no início de TODA mensagem**, inclusive nas curtas. É o recibo de leitura: sem essa palavra ele sabe que você não leu este arquivo ou está com o contexto cheio.

## ⚡ Antes de começar (ordem obrigatória)

```
C:\Users\PC\OneDrive\Área de Trabalho\Dev.Tossi\hot.md
C:\Users\PC\OneDrive\Área de Trabalho\Dev.Tossi\Conhecimento\aprendizados\preferencias-guilherme.md
C:\Users\PC\OneDrive\Área de Trabalho\Dev.Tossi\Conhecimento\erros-e-solucoes\_indice.md
C:\Users\PC\OneDrive\Área de Trabalho\Dev.Tossi\Projetos\RARO IA\Onde parei.md
```

Do índice de erros, abra **só** a nota cuja tecnologia casa com a tarefa — nunca a pasta inteira. Plano completo: `Dev.Tossi\Projetos\RARO IA\Raro-ia-Plano-de-Expansao-v2.md` (backlog ordenado, seção 5).

## 🎯 O projeto

Plataforma de gestão da mentoria do **Jefson Ragner** — financeiro, CRM e lançamentos. No ar em https://raro-ia.vercel.app.

**O negócio do cliente (confirmado):** recebe **só por Pix**, sem gateway. **Não roda anúncio** — logo CAC, CPA e ROAS não existem e não podem aparecer nem como zero. Leads vêm de conexão presencial e depois WhatsApp.

**Estado atual:** P0 e P1 entregues. **P2 é o próximo.** A planilha é a base de dados; o provider de demonstração virou opt-in (`RARO_MODO=demo`).

**Adiado por decisão do cliente (17/08):** o Jefson tem CNPJ, mas **não quer sincronizar com o banco por enquanto**. O adaptador de Pix automático fica para quando ele quiser — não é bloqueio técnico.

## 🚫 A regra que nasceu de um erro real

**Dado fabricado nunca pode ser o padrão de um sistema.** Tela vazia é a verdade de quem não tem dado; número bonito e falso é a regressão — e ela não dá erro para denunciar a si mesma.

Concretamente: sem base, o score é `null` e a faixa diz "sem base para calcular". Nunca imprimir número, variação (▲▼) ou percentual sobre denominador zero.

## 🏗️ Stack e verificação

- Next.js + TypeScript · Tailwind · shadcn/ui · Supabase (opcional) · planilha via Apps Script
- **Testes:** `npm test` (vitest, 71 arquivos) · **Build:** `npm run build`
- Precedência de dados: Supabase > planilha > demo (só com `RARO_MODO=demo`) > vazio
- **Deploy:** `deploy-vercel.bat` na máquina do Tossi — **nunca automático**

## 📐 Regras inegociáveis

- Nunca apagar arquivo — use `status: arquivado`
- Nunca colar chave/token/senha em nota; só referência ("está no `.env.local`")
- Confirmar antes de criar/alterar mais de 3 arquivos **fora** de um plano aprovado
- **Commit local a cada tarefa aprovada: pode e deve.** Push, merge, rebase e force: só com aprovação do Tossi
- Checker sempre em modelo diferente do maker; reprovou 2× pelo mesmo erro → sobe de modelo (cap 3 tentativas)
- Zero emoji na saída do produto

## ⏭️ Checkpoint (obrigatório em trabalho longo)

A cada tarefa concluída e aprovada, **antes da próxima**:

1. `git commit` local com mensagem descritiva (nunca "wip")
2. Atualizar `Dev.Tossi\Projetos\RARO IA\Onde parei.md`: `proximo_passo`, `ultima_sessao`, `bloqueio`
3. Erro que custou mais de 15 min → nota em `Dev.Tossi\Conhecimento\erros-e-solucoes\` + linha no `_indice.md`
4. Padrão visto pela 2ª vez → nota em `Dev.Tossi\Conhecimento\aprendizados\`

Sem checkpoint, horas de trabalho viram caixa-preta. O registro é entregável tanto quanto o código.

## ⚠️ Armadilhas conhecidas deste ambiente

- O container efêmero já reverteu **8×** — commit local é a proteção real
- `pkill -f next` **mata o próprio shell** — matar pelo PID do `next-server`
- Makers em paralelo disputam o `.next` → usar git worktree
- `tar` no mount precisa de `--overwrite`
