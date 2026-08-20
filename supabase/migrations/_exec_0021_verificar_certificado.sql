-- _exec_0021 — a mesma migracao com os comentarios de fora da funcao
-- removidos, para colar no SQL Editor. A versao completa e
-- 0021_verificar_certificado.sql.

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

revoke all on function public.verificar_certificado(text) from public;
grant execute on function public.verificar_certificado(text) to anon, authenticated;
