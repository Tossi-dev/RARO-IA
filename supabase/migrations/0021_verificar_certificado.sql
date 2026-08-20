-- ============================================================
-- 0021 — verificação PÚBLICA de certificado
-- ============================================================
--
-- Uma função, e ela é a primeira do projeto inteiro com `grant execute` para
-- `anon`. Isso merece um cabeçalho longo, porque o padrão de todas as outras
-- é exatamente o contrário: 0013 e 0020 REVOGAM de `anon` e de `public` com
-- todas as letras, e o comentário de lá explica que `anon` é o papel de antes
-- de qualquer login, ao alcance de quem tem só a chave pública.
--
-- POR QUE ESTA É DIFERENTE
-- ------------------------
-- Quem confere um certificado é um contratante, um cliente do aluno, uma
-- banca — gente que não tem conta neste sistema e não vai criar uma para
-- isso. Um certificado que só o emissor consegue conferir não é certificado,
-- é print de tela. A rota `/certificado/<codigo>` já entrou em ROTAS_LIVRES
-- (tarefa 29, src/lib/acesso.ts), e o comentário de lá deixou escrito que
-- essa liberação NÃO autorizava a página a consultar a tabela com a chave
-- anônima: a política de select de `certificado` (0020) é para gestão e para
-- o próprio mentorado, e `anon` não tem — nem pode ganhar — política ali.
-- Esta função é a ponte que faltava, e ela é estreita de propósito.
--
-- AS QUATRO COISAS QUE A TORNAM SEGURA
-- -------------------------------------
--   1. IGUALDADE EXATA no código. Nada de `like`, `ilike` ou prefixo. Um
--      casamento parcial transformaria uma função aberta ao mundo num
--      buscador da carteira de clientes do Jefson ("me dá tudo que começa
--      com A").
--   2. FORMATO CONFERIDO ANTES. Só os doze caracteres do alfabeto de
--      `src/lib/conteudo/certificado.ts` (sem 0/O/1/I, que se confundem ao
--      ler em voz alta). Qualquer outra coisa devolve zero linhas sem
--      consultar nada.
--   3. RETORNO FECHADO: nome de quem concluiu, nome da trilha, data. Não
--      devolve id nenhum, nem workspace, nem e-mail, nem telefone — e a
--      função é a única forma de `anon` tocar nessas tabelas, então o que
--      não está nesta lista não existe para quem está do lado de fora.
--   4. UMA LINHA POR VEZ (`limit 1`), e a busca é pelo código, que 0020 fez
--      único no banco INTEIRO justamente para esta pergunta ser categórica.
--      Não existe forma de pedir "todos" — não há parâmetro que aceite isso.
--
-- ⚠ O LIMITE HONESTO: não há freio de tentativa aqui dentro. O espaço de
-- códigos (32^12, mais de um quintilhão) torna adivinhar impraticável, e o
-- que se ganha adivinhando é o nome de UMA pessoa e o nome de uma trilha —
-- não a lista. Freio por IP, se um dia fizer falta, é assunto da borda
-- (Supabase/proxy), não desta função.
--
-- NÃO CRIA TABELA, NÃO MUDA POLÍTICA. As políticas de `certificado` de 0020
-- ficam exatamente como estão: quem entra logado continua vendo só o que a
-- RLS deixa. Esta função é um caminho novo e separado, com o seu próprio
-- escopo escrito na assinatura.

create or replace function public.verificar_certificado(p_codigo text)
returns table (aluno text, trilha text, emitido_em timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  with entrada as (
    -- Maiúscula e sem espaço nas pontas: quem digita o código veio de um
    -- papel impresso ou de uma mensagem, e caixa/espaço são desvio de
    -- digitação, não tentativa. Qualquer OUTRO desvio é recusado abaixo.
    select upper(btrim(coalesce(p_codigo, ''))) as codigo
  )
  select m.nome, t.nome, c.emitido_em
  from entrada e
  join public.certificado c on c.codigo = e.codigo
  join public.mentorado m on m.id = c.mentorado_id
  join public.trilha t on t.id = c.trilha_id
  where e.codigo ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$'
  limit 1;
$$;

comment on function public.verificar_certificado is
  'Verificacao PUBLICA de certificado por codigo. Unica funcao do projeto
   com grant para anon, e de proposito: certificado que so o emissor
   confere nao e certificado. Igualdade exata no codigo (nunca like),
   formato conferido antes da consulta, retorno fechado em nome/trilha/data
   (sem id, sem workspace, sem e-mail, sem telefone) e limit 1. As politicas
   de RLS de certificado (0020) nao mudam: este e um caminho separado.';

-- `public` inclui qualquer papel presente e futuro; a liberação aqui é
-- NOMINAL, para `anon` e `authenticated`, e para mais ninguém.
revoke all on function public.verificar_certificado(text) from public;
grant execute on function public.verificar_certificado(text) to anon, authenticated;
