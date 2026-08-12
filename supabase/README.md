# Conectar o Supabase (sair do modo demonstração)

O app roda em **modo demonstração** (dados fictícios) enquanto estas variáveis não existirem.
Conectar leva ~10 minutos:

## 1. Criar o projeto

1. Acesse [supabase.com](https://supabase.com) → **New project** (org do Guilherme ou do Jefson).
2. Nome sugerido: `raro-ia`. Guarde a senha do banco no cofre (não no vault Obsidian).

## 2. Rodar o schema

1. No painel do projeto: **SQL Editor** → New query.
2. Cole TODO o conteúdo de `migrations/0001_schema.sql` → **Run**.
3. (Opcional) Cole e rode o `seed.sql` — cria afiliados e produtos iniciais, sem nenhuma venda.

## 3. Criar o primeiro usuário

1. **Authentication → Users → Add user** (e-mail + senha do Jefson/Guilherme).
2. De volta ao SQL Editor, promova a dono:
   ```sql
   update public.profiles set papel = 'dono', nome = 'Jefson Ragner'
    where id = (select id from auth.users where email = 'EMAIL_AQUI');
   ```

## 4. Apontar o app

1. **Settings → API** → copie `Project URL` e `anon public key`.
2. Na pasta do projeto, crie `.env.local` (copie de `.env.example`):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```
3. Rode de novo (`rodar-local.bat`). O banner amarelo some e o login passa a ser exigido.

Na **Vercel**, configure as mesmas duas variáveis em *Settings → Environment Variables* e redeploy.

## Segurança já embutida

- **RLS ligado em todas as tabelas**: autenticado lê; só `dono`/`gestor` escreve.
- Papéis: `dono`, `gestor`, `afiliado`, `aluno` (escopo por afiliado entra na fase 2).
- A `anon key` é pública por design; o que protege os dados é o RLS.
- **Nunca** commitar `.env.local` (o `.gitignore` já bloqueia).
