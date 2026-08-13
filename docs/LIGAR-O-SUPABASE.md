# Ligar o Supabase — os três minutos que faltam

O banco está pronto: 54 tabelas, 211 políticas de acesso, e os seus dados já
lá dentro (6 alunos, 19 interações, 13 movimentos de caixa, 13 importações,
1 conta bancária, 1 configuração). O app inteiro já sabe ler de lá.

Falta **uma** coisa, e ela só pode ser feita por você: **criar o seu login.**

Eu não crio conta de usuário — nem a sua. Não é limitação técnica, é regra:
quem cria a conta escolhe a senha, e senha que passa por mim deixa de ser
só sua.

---

## Passo 1 — criar o seu usuário

No painel do Supabase, projeto **MentorOS**:

> Authentication → Users → **Add user** → *Create new user*

Preencha o seu e-mail e uma senha. Deixe **"Auto Confirm User" ligado** — sem
isso o Supabase espera uma confirmação por e-mail que este projeto não envia,
e o login falha sem dizer por quê.

Você **nasce dono**. A migração `0011` cuida disso: o primeiro usuário de um
workspace recebe o papel `dono`; do segundo em diante, `mentorado`. Sem essa
regra, todo mundo nasceria com o papel mínimo e ninguém conseguiria abrir o
próprio financeiro — promover exige ser dono, e não haveria dono.

## Passo 2 — ligar as duas variáveis

No arquivo `.env.local`, tire o `#` das linhas 56 e 57:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Os valores já estão escritos lá, comentados. Não precisa digitar nada.

## Passo 3 — abrir

```
cd "C:\dev\Repositorios\RARO IA"
npm run dev
```

Vai pedir e-mail e senha. Depois disso o app inteiro passa a ler do Postgres
em vez da planilha.

---

## O que muda no minuto em que você liga

**A planilha para de ser a base.** `src/lib/data/index.ts` dá precedência ao
Supabase; com as variáveis ligadas, ele para de ler a planilha, mesmo que ela
continue lá. É por isso que a migração vinha primeiro: ligar antes de migrar
mostraria faturamento zero numa tela que parece funcionando.

**Cada pessoa passa a ter login próprio.** A senha compartilhada
(`RARO_SENHA`) deixa de valer — ela era o degrau até aqui, não o destino.

**O papel passa a decidir a rota.** Um mentorado que abrir `/financeiro` é
barrado pelo middleware, e o Postgres barra de novo por baixo, na política de
RLS. São duas trancas independentes na mesma porta, de propósito: se um dia
alguém errar na tela, o banco ainda segura.

## Para o primeiro mentorado entrar no portal

1. Crie o usuário dele do mesmo jeito (ele nasce `mentorado`).
2. No SQL editor, ligue o login dele à ficha:

```sql
update public.mentorado
set perfil_id = (select id from auth.users where email = 'email-dele@exemplo.com')
where nome = 'Nome Dele';
```

Sem esse vínculo o portal abre e diz, com todas as letras, que aquela área é
do mentorado — não quebra, não mostra dado de ninguém, só não tem o que
mostrar. É `mentorado.perfil_id` que a política de RLS usa para responder
"quem é você" — e é por isso que o portal não aceita nenhum id pela URL:
trocar um número no endereço não existe como ataque quando não há número no
endereço.
